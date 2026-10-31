import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { mongodb } from "../mongodb";
import { OrderCustomization } from "../../models/OrderCustomization";
import { HttpError, type Actor } from "../auth";
import { orderInput } from "../validations";
export async function reconcile(orderId?: number) {
  const jobs = await prisma.outbox.findMany({
    where: { processed_at: null, ...(orderId ? { order_id: orderId } : {}) },
    take: 50,
  });
  if (!jobs.length) return true;
  try {
    await mongodb();
    for (const job of jobs) {
      const docs = job.payload as unknown as Record<string, unknown>[];
      await OrderCustomization.bulkWrite(
        docs.map((d) => ({
          updateOne: {
            filter: { order_item_id: d.order_item_id },
            update: { $set: d },
            upsert: true,
          },
        })),
      );
      await prisma.outbox.update({
        where: { id: job.id },
        data: { processed_at: new Date(), attempts: { increment: 1 } },
      });
    }
    return true;
  } catch {
    await prisma.outbox.updateMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }
}
export async function placeOrder(actor: Actor, raw: unknown) {
  const input = orderInput.parse(raw);
  const existing = await prisma.orders.findUnique({
    where: { idempotency_key: input.idempotency_key },
  });
  if (existing) {
    if (existing.customer_id !== actor.id)
      throw new HttpError(409, "Checkout token already used.");
    return {
      ...existing,
      customizations_pending: !(await reconcile(existing.order_id)),
    };
  }
  const order = await prisma.$transaction(async (tx) => {
    if (input.table_id) {
      await tx.$queryRaw`SELECT table_id FROM restaurant_table WHERE table_id=${input.table_id} FOR UPDATE`;
      const t = await tx.restaurantTable.findUnique({
        where: { table_id: input.table_id },
      });
      if (!t || t.status !== "Occupied")
        throw new HttpError(
          409,
          "Dine-in orders require a table checked in by staff.",
        );
      const bookings = await tx.$queryRaw<
        { reservation_id: number }[]
      >`SELECT reservation_id FROM reservation WHERE customer_id=${actor.id} AND table_id=${input.table_id} AND status='Confirmed' AND checked_in_at IS NOT NULL AND starts_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AND ends_at>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')`;
      if (!bookings.length)
        throw new HttpError(
          403,
          "This table is not assigned to your reservation.",
        );
    }
    const menus = await tx.menuItem.findMany({
      where: { item_id: { in: input.items.map((i) => i.item_id) } },
    });
    for (const i of input.items) {
      if (!menus.find((m) => m.item_id === i.item_id && m.availability))
        throw new HttpError(
          409,
          "A dish in your basket is no longer available.",
        );
    }
    const o = await tx.orders.create({
      data: {
        customer_id: actor.id,
        table_id: input.table_id,
        idempotency_key: input.idempotency_key,
      },
    });
    const docs = [];
    for (const i of input.items) {
      const item = menus.find((m) => m.item_id === i.item_id)!;
      const line = await tx.orderItem.create({
        data: {
          order_id: o.order_id,
          item_id: i.item_id,
          quantity: i.quantity,
          unit_price: item.price,
        },
      });
      docs.push({
        order_id: o.order_id,
        order_item_id: line.order_item_id,
        item_id: i.item_id,
        customizations: i.customizations,
      });
    }
    await tx.outbox.create({
      data: {
        order_id: o.order_id,
        payload: docs as unknown as Prisma.InputJsonValue,
      },
    });
    return tx.orders.findUniqueOrThrow({
      where: { order_id: o.order_id },
      include: { items: { include: { item: true } }, payment: true },
    });
  });
  return {
    ...order,
    customizations_pending: !(await reconcile(order.order_id)),
  };
}
export async function orderDetails(actor: Actor, orderId: number) {
  const o = await prisma.orders.findUnique({
    where: { order_id: orderId },
    include: {
      customer: { select: { name: true } },
      items: { include: { item: true } },
      payment: true,
      table: true,
    },
  });
  if (!o) throw new HttpError(404, "Order not found.");
  if (actor.role === "customer" && o.customer_id !== actor.id)
    throw new HttpError(403, "This order belongs to another customer.");
  const synced = await reconcile(orderId);
  let docs: Record<string, unknown>[] = [];
  try {
    await mongodb();
    docs = (await OrderCustomization.find({
      order_id: orderId,
    }).lean()) as unknown as Record<string, unknown>[];
  } catch {
    const box = await prisma.outbox.findUnique({
      where: { order_id: orderId },
    });
    docs = (box?.payload ?? []) as unknown as Record<string, unknown>[];
  }
  // The SQL outbox preserves kitchen instructions even if MongoDB is temporarily offline.
  if (!synced) {
    const box = await prisma.outbox.findUnique({
      where: { order_id: orderId },
    });
    if (box) docs = box.payload as unknown as Record<string, unknown>[];
  }
  return { ...o, customizations: docs, customizations_pending: !synced };
}
const transitions: Record<string, string[]> = {
  Placed: ["Preparing", "Cancelled"],
  Preparing: ["Ready"],
  Ready: ["Served"],
  Served: ["Completed"],
  Completed: [],
  Cancelled: [],
};
export async function changeOrder(actor: Actor, id: number, status: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT order_id FROM orders WHERE order_id=${id} FOR UPDATE`;
    const o = await tx.orders.findUnique({
      where: { order_id: id },
      include: { payment: true },
    });
    if (!o) throw new HttpError(404, "Order not found.");
    if (actor.staffRole === "Cashier" && status !== "Completed")
      throw new HttpError(403, "Cashiers can close paid, served orders.");
    if (actor.staffRole === "Chef" && !["Preparing", "Ready"].includes(status))
      throw new HttpError(403, "Chefs can prepare and mark orders ready.");
    if (!transitions[o.status]?.includes(status))
      throw new HttpError(
        409,
        `Cannot move an order from ${o.status} to ${status}.`,
      );
    if (status === "Cancelled" && o.payment?.payment_status === "Completed")
      throw new HttpError(409, "A paid order cannot be cancelled.");
    if (status === "Completed" && o.payment?.payment_status !== "Completed")
      throw new HttpError(
        409,
        "Complete the simulated payment before closing this order.",
      );
    if (["Preparing", "Ready", "Served"].includes(status))
      await tx.orderItem.updateMany({
        where: { order_id: id },
        data: { status },
      });
    return tx.orders.update({
      where: { order_id: id },
      data: { status, staff_id: actor.id },
    });
  });
}
export async function payOrder(actor: Actor, id: number, method: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT order_id FROM orders WHERE order_id=${id} FOR UPDATE`;
    const o = await tx.orders.findUnique({
      where: { order_id: id },
      include: { payment: true },
    });
    if (!o) throw new HttpError(404, "Order not found.");
    if (actor.role === "customer" && o.customer_id !== actor.id)
      throw new HttpError(403, "This bill belongs to another customer.");
    if (o.status === "Cancelled" || Number(o.total_amount) <= 0)
      throw new HttpError(409, "This order cannot be paid.");
    if (o.payment?.payment_status === "Completed")
      throw new HttpError(409, "This bill has already been paid.");
    return tx.payment.upsert({
      where: { order_id: id },
      create: {
        order_id: id,
        amount: o.total_amount,
        payment_method: method,
        payment_status: "Completed",
      },
      update: {
        amount: o.total_amount,
        payment_method: method,
        payment_status: "Completed",
        payment_time: new Date(),
      },
    });
  });
}
