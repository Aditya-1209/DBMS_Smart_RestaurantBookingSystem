import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mongodb } from "@/lib/mongodb";
import {
  currentActor,
  requireActor,
  createSession,
  logout,
  hashPassword,
  verifyPassword,
  checkLoginRate,
  HttpError,
  type Actor,
} from "@/lib/auth";
import * as v from "@/lib/validations";
import {
  placeOrder,
  orderDetails,
  changeOrder,
  payOrder,
  reconcile,
} from "@/lib/services/orders";
import {
  assignReservation,
  closeReservation,
} from "@/lib/services/reservations";
import { Review } from "@/models/Review";
import { CustomerPreference } from "@/models/CustomerPreference";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function body(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Send JSON input.");
  const raw = await req.text();
  if (raw.length > 65536) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
const num = (s: string) => v.id.parse(Number(s));
function checkOrigin(req: NextRequest) {
  const allowed = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  if (req.headers.get("origin") !== allowed)
    throw new HttpError(403, "Request origin is not allowed.");
}
async function available(
  date: string,
  time: string,
  guests: number,
  duration: number,
) {
  v.bookingDates(date, time, duration);
  return prisma.$queryRaw`SELECT * FROM restaurant_table t WHERE t.capacity>=${guests} AND t.status='Available' AND NOT EXISTS(SELECT 1 FROM reservation r WHERE r.table_id=t.table_id AND r.status='Confirmed' AND tsrange(r.starts_at,r.ends_at,'[)') && tsrange((${date}::date+${time}::time),(${date}::date+${time}::time+${duration}*INTERVAL '1 minute'),'[)')) ORDER BY t.capacity,t.table_number`;
}
async function reports() {
  const [revenue, popular, methods, statuses, counts, pending] =
    await Promise.all([
      prisma.$queryRaw`SELECT COALESCE(SUM(amount),0) AS total_revenue FROM payment WHERE payment_status='Completed'`,
      prisma.$queryRaw`SELECT m.item_name,SUM(oi.quantity)::int AS total_quantity_sold FROM menu_item m JOIN order_item oi ON oi.item_id=m.item_id JOIN orders o ON oi.order_id=o.order_id WHERE o.status<>'Cancelled' GROUP BY m.item_id,m.item_name ORDER BY total_quantity_sold DESC LIMIT 5`,
      prisma.$queryRaw`SELECT payment_method,SUM(amount) AS revenue FROM payment WHERE payment_status='Completed' GROUP BY payment_method ORDER BY revenue DESC`,
      prisma.$queryRaw`SELECT status,COUNT(*)::int AS count FROM orders GROUP BY status`,
      prisma.customer.count(),
      prisma.outbox.count({ where: { processed_at: null } }),
    ]);
  return {
    revenue,
    popular,
    methods,
    statuses,
    customers: counts,
    pending_customizations: pending,
  };
}
async function handle(req: NextRequest, ctx: Context) {
  const p = (await ctx.params).path;
  const route = p.join("/"),
    method = req.method;
  let actor: Actor;
  if (method !== "GET") checkOrigin(req);
  if (route === "health" && method === "GET") {
    await prisma.$queryRaw`SELECT 1`;
    await mongodb();
    return { postgresql: "connected", mongodb: "connected" };
  }
  if (route === "auth/me" && method === "GET")
    return { user: await currentActor() };
  if (route === "auth/logout" && method === "POST") {
    await logout();
    return { ok: true };
  }
  if (route === "auth/register" && method === "POST") {
    const b = z
      .object({
        name: v.text(),
        email: v.email,
        phone: v.phone,
        password: v.password,
      })
      .strict()
      .parse(await body(req));
    if (await prisma.staff.findUnique({ where: { email: b.email } }))
      throw new HttpError(409, "Email is already registered.");
    const c = await prisma.customer.create({
      data: { ...b, password: await hashPassword(b.password) },
    });
    await createSession(c.customer_id, false);
    return { ok: true };
  }
  if (route === "auth/login" && method === "POST") {
    const b = z
      .object({
        email: v.email,
        password: z.string().min(1).max(128),
        scope: z.enum(["customer", "staff"]),
      })
      .strict()
      .parse(await body(req));
    await checkLoginRate(b.email);
    const user =
      b.scope === "customer"
        ? await prisma.customer.findUnique({ where: { email: b.email } })
        : await prisma.staff.findUnique({ where: { email: b.email } });
    const valid = await verifyPassword(
      b.password,
      user?.password ||
        "scrypt$00000000000000000000000000000000$" + "00".repeat(64),
    );
    if (!user || !valid || ("active" in user && !user.active))
      throw new HttpError(401, "Email or password is incorrect.");
    await createSession(
      "customer_id" in user ? user.customer_id : user.staff_id,
      b.scope === "staff",
    );
    return { ok: true };
  }
  if (route === "menu" && method === "GET") {
    const [items, categories] = await Promise.all([
      prisma.menuItem.findMany({
        include: { category: true },
        orderBy: { item_id: "asc" },
      }),
      prisma.category.findMany({ orderBy: { category_id: "asc" } }),
    ]);
    return { items, categories };
  }
  if (route === "reviews" && method === "GET") {
    await mongodb();
    const item = req.nextUrl.searchParams.get("item_id");
    const filter = item ? { "items_reviewed.item_id": num(item) } : {};
    const reviews = await Review.find(filter)
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
    const ids = reviews.map((r) => Number(r.customer_id));
    const customers = await prisma.customer.findMany({
      where: { customer_id: { in: ids } },
      select: { customer_id: true, name: true },
    });
    const averages = await Review.aggregate([
      { $unwind: "$items_reviewed" },
      {
        $group: {
          _id: "$items_reviewed.item_id",
          rating: { $avg: "$items_reviewed.rating" },
          count: { $sum: 1 },
        },
      },
    ]);
    return {
      reviews: reviews.map((r) => ({
        ...r,
        customer_name:
          customers.find((c) => c.customer_id === r.customer_id)?.name ||
          "Guest",
      })),
      averages,
    };
  }
  if (route === "tables/available" && method === "GET") {
    actor = await requireActor();
    void actor;
    const q = Object.fromEntries(req.nextUrl.searchParams);
    const b = v.bookingInput.omit({ table_id: true }).parse({
      ...q,
      guest_count: Number(q.guest_count),
      duration_minutes: Number(q.duration_minutes || 90),
    });
    return {
      tables: await available(
        b.date,
        b.time,
        b.guest_count,
        b.duration_minutes,
      ),
    };
  }
  if (route === "tables/eligible" && method === "GET") {
    actor = await requireActor(["customer"]);
    return {
      tables:
        await prisma.$queryRaw`SELECT DISTINCT t.* FROM restaurant_table t JOIN reservation r ON r.table_id=t.table_id WHERE t.status='Occupied' AND r.customer_id=${actor.id} AND r.status='Confirmed' AND r.checked_in_at IS NOT NULL AND r.starts_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AND r.ends_at>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') ORDER BY t.table_number`,
    };
  }
  if (route === "tables" && method === "GET") {
    await requireActor();
    return {
      tables: await prisma.restaurantTable.findMany({
        orderBy: { table_number: "asc" },
      }),
    };
  }
  if (route === "reservations" && method === "GET") {
    actor = await requireActor();
    return {
      reservations: await prisma.reservation.findMany({
        where: actor.role === "customer" ? { customer_id: actor.id } : {},
        include: { table: true, customer: { select: { name: true } } },
        orderBy: [{ reservation_date: "desc" }, { reservation_time: "asc" }],
        take: 200,
      }),
    };
  }
  if (route === "reservations" && method === "POST") {
    actor = await requireActor(["customer"]);
    const b = v.bookingInput.parse(await body(req));
    v.bookingDates(b.date, b.time, b.duration_minutes);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT table_id FROM restaurant_table WHERE table_id=${b.table_id} FOR UPDATE`;
      const t = await tx.restaurantTable.findUnique({
        where: { table_id: b.table_id },
      });
      if (!t || t.status !== "Available")
        throw new HttpError(409, "This table is currently unavailable.");
      return tx.reservation.create({
        data: {
          customer_id: actor.id,
          table_id: b.table_id,
          reservation_date: new Date(b.date + "T00:00:00Z"),
          reservation_time: new Date("1970-01-01T" + b.time + ":00Z"),
          guest_count: b.guest_count,
          duration_minutes: b.duration_minutes,
        },
      });
    });
  }
  if (
    p[0] === "reservations" &&
    p.length === 3 &&
    p[2] === "assign-table" &&
    method === "POST"
  ) {
    actor = await requireActor(["staff", "admin"]);
    return assignReservation(actor, num(p[1]));
  }
  if (p[0] === "reservations" && p.length === 2 && method === "PATCH") {
    actor = await requireActor();
    const b = z
      .object({ status: z.enum(["Cancelled", "Completed"]) })
      .strict()
      .parse(await body(req));
    return closeReservation(actor, num(p[1]), b.status);
  }
  if (route === "orders" && method === "GET") {
    actor = await requireActor();
    await reconcile();
    const orders = await prisma.orders.findMany({
      where: actor.role === "customer" ? { customer_id: actor.id } : {},
      include: {
        items: { include: { item: true } },
        payment: true,
        table: true,
        customer: { select: { name: true } },
      },
      orderBy: { order_id: "desc" },
      take: 100,
    });
    return { orders };
  }
  if (route === "orders" && method === "POST") {
    actor = await requireActor(["customer"]);
    return placeOrder(actor, await body(req));
  }
  if (p[0] === "orders" && p.length === 2 && method === "GET") {
    actor = await requireActor();
    return orderDetails(actor, num(p[1]));
  }
  if (p[0] === "orders" && p.length === 2 && method === "PATCH") {
    actor = await requireActor(["staff", "admin"]);
    const b = z
      .object({
        status: z.enum([
          "Preparing",
          "Ready",
          "Served",
          "Completed",
          "Cancelled",
        ]),
      })
      .strict()
      .parse(await body(req));
    return changeOrder(actor, num(p[1]), b.status);
  }
  if (p[0] === "orders" && p[2] === "payment" && method === "POST") {
    actor = await requireActor();
    if (actor.role === "staff" && actor.staffRole !== "Cashier")
      throw new HttpError(403, "Only the cashier can take staff payments.");
    const b = z
      .object({ payment_method: z.enum(["Cash", "Card", "UPI"]) })
      .strict()
      .parse(await body(req));
    return payOrder(actor, num(p[1]), b.payment_method);
  }
  if (p[0] === "order-items" && p.length === 2 && method === "PATCH") {
    actor = await requireActor(["staff", "admin"]);
    if (actor.staffRole === "Cashier")
      throw new HttpError(403, "Kitchen access required.");
    const b = z
      .object({ status: z.enum(["Preparing", "Ready", "Served"]) })
      .strict()
      .parse(await body(req));
    if (actor.staffRole === "Chef" && b.status === "Served")
      throw new HttpError(403, "Serving is a front-of-house action.");
    return prisma.$transaction(async (tx) => {
      const line = await tx.orderItem.findUnique({
        where: { order_item_id: num(p[1]) },
      });
      if (!line) throw new HttpError(404, "Order line not found.");
      await tx.$queryRaw`SELECT order_id FROM orders WHERE order_id=${line.order_id} FOR UPDATE`;
      const o = await tx.orders.findUniqueOrThrow({
        where: { order_id: line.order_id },
      });
      if (["Completed", "Cancelled"].includes(o.status))
        throw new HttpError(409, "Order is closed.");
      const next: Record<string, string> = {
        Placed: "Preparing",
        Preparing: "Ready",
        Ready: "Served",
      };
      if (next[line.status] !== b.status)
        throw new HttpError(409, "Use the next kitchen status.");
      return tx.orderItem.update({
        where: { order_item_id: line.order_item_id },
        data: b,
      });
    });
  }
  if (route === "preferences" && method === "GET") {
    actor = await requireActor(["customer"]);
    await mongodb();
    return {
      preferences: await CustomerPreference.findOne({
        customer_id: actor.id,
      }).lean(),
    };
  }
  if (route === "preferences" && method === "PUT") {
    actor = await requireActor(["customer"]);
    const b = v.preferencesInput.parse(await body(req));
    await mongodb();
    return CustomerPreference.findOneAndUpdate(
      { customer_id: actor.id },
      { $set: b },
      { upsert: true, new: true, runValidators: true },
    );
  }
  if (route === "reviews" && (method === "POST" || method === "PUT")) {
    actor = await requireActor(["customer"]);
    const b = z
      .object({
        order_id: v.id,
        rating: z.number().int().min(1).max(5),
        comment: v.text(2000),
        items_reviewed: z
          .array(
            z.object({ item_id: v.id, rating: z.number().int().min(1).max(5) }),
          )
          .max(30),
      })
      .strict()
      .parse(await body(req));
    const o = await prisma.orders.findUnique({
      where: { order_id: b.order_id },
      include: { items: true, payment: true },
    });
    if (!o || o.customer_id !== actor.id)
      throw new HttpError(403, "You can only review your own orders.");
    if (o.payment?.payment_status !== "Completed")
      throw new HttpError(409, "Pay for the order before leaving a review.");
    if (
      b.items_reviewed.some(
        (i) => !o.items.some((l) => l.item_id === i.item_id),
      )
    )
      throw new HttpError(400, "Only dishes from this order can be reviewed.");
    await mongodb();
    const existing = await Review.findOne({ order_id: b.order_id });
    if (method === "POST" && existing)
      throw new HttpError(
        409,
        "You have already reviewed this order. Use edit review.",
      );
    if (existing && existing.customer_id !== actor.id)
      throw new HttpError(403, "Review ownership mismatch.");
    return Review.findOneAndUpdate(
      { order_id: b.order_id, customer_id: actor.id },
      { $set: { ...b, updated_at: new Date() } },
      { upsert: true, new: true, runValidators: true },
    );
  }
  if (p[0] === "staff" && p[1] === "tables" && method === "PATCH") {
    actor = await requireActor(["staff", "admin"]);
    if (actor.staffRole === "Chef")
      throw new HttpError(
        403,
        "Table management is available to front-of-house staff.",
      );
    const b = z
      .object({ status: z.enum(["Available", "Reserved", "Occupied"]) })
      .strict()
      .parse(await body(req));
    return prisma.restaurantTable.update({
      where: { table_id: num(p[2]) },
      data: b,
    });
  }
  if (p[0] === "admin") {
    actor = await requireActor(["admin"]);
    const resource = p[1],
      id = p[2] ? num(p[2]) : undefined;
    if (resource === "reports" && method === "GET") return reports();
    if (resource === "payments" && method === "GET")
      return {
        payments: await prisma.payment.findMany({
          include: {
            order: { include: { customer: { select: { name: true } } } },
          },
          orderBy: { payment_id: "desc" },
          take: 200,
        }),
      };
    if (resource === "reconcile" && method === "POST")
      return { synced: await reconcile() };
    if (resource === "staff") {
      const select = {
        staff_id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
      };
      if (method === "GET")
        return {
          staff: await prisma.staff.findMany({
            select,
            orderBy: { staff_id: "asc" },
          }),
        };
      if (method === "DELETE" && id) {
        if (id === actor.id)
          throw new HttpError(409, "You cannot delete your own account.");
        return prisma.staff.delete({ where: { staff_id: id }, select });
      }
      const b = v.staffInput.parse(await body(req));
      if (await prisma.customer.findUnique({ where: { email: b.email } }))
        throw new HttpError(409, "Email is used by a customer.");
      if (id === actor.id && (b.role !== "Manager" || !b.active))
        throw new HttpError(
          409,
          "You cannot remove your own administrator access.",
        );
      if (method === "POST") {
        if (!b.password)
          throw new HttpError(400, "A password is required for new staff.");
        return prisma.staff.create({
          data: { ...b, password: await hashPassword(b.password) },
          select,
        });
      }
      if (method === "PATCH" && id)
        return prisma.staff.update({
          where: { staff_id: id },
          data: {
            ...b,
            password: b.password ? await hashPassword(b.password) : undefined,
          },
          select,
        });
    }
    if (resource === "menu") {
      if (method === "DELETE" && id)
        return prisma.menuItem.delete({ where: { item_id: id } });
      const b = v.menuInput.parse(await body(req));
      if (method === "POST") return prisma.menuItem.create({ data: b });
      if (method === "PATCH" && id)
        return prisma.menuItem.update({ where: { item_id: id }, data: b });
    }
    if (resource === "categories") {
      if (method === "DELETE" && id)
        return prisma.category.delete({ where: { category_id: id } });
      const b = z
        .object({ category_name: v.text(50) })
        .strict()
        .parse(await body(req));
      if (method === "POST") return prisma.category.create({ data: b });
      if (method === "PATCH" && id)
        return prisma.category.update({ where: { category_id: id }, data: b });
    }
    if (resource === "tables") {
      if (method === "DELETE" && id)
        return prisma.restaurantTable.delete({ where: { table_id: id } });
      const b = v.tableInput.parse(await body(req));
      if (method === "POST") return prisma.restaurantTable.create({ data: b });
      if (method === "PATCH" && id)
        return prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT table_id FROM restaurant_table WHERE table_id=${id} FOR UPDATE`;
          if (
            await tx.reservation.count({
              where: {
                table_id: id,
                status: "Confirmed",
                guest_count: { gt: b.capacity },
              },
            })
          )
            throw new HttpError(
              409,
              "Capacity would be below an existing reservation party size.",
            );
          return tx.restaurantTable.update({
            where: { table_id: id },
            data: b,
          });
        });
    }
  }
  throw new HttpError(404, "Endpoint not found.");
}
async function route(req: NextRequest, ctx: Context) {
  try {
    const data = await handle(req, ctx);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (
      e instanceof Error &&
      /23P01|already reserved|reservation_no_overlap/.test(e.message)
    )
      return NextResponse.json(
        {
          error:
            "This table was just booked for an overlapping time. Choose another table or time.",
        },
        { status: 409 },
      );
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002")
        return NextResponse.json(
          {
            error:
              "This record already exists. Check unique email, phone, number, or checkout token.",
          },
          { status: 409 },
        );
      if (["P2003", "P2014"].includes(e.code))
        return NextResponse.json(
          {
            error:
              "This record is used by other records. Archive it or remove its dependencies first.",
          },
          { status: 409 },
        );
      if (e.code === "P2025")
        return NextResponse.json(
          { error: "Record not found." },
          { status: 404 },
        );
      if (e.message.includes("23P01") || e.message.includes("already reserved"))
        return NextResponse.json(
          {
            error:
              "This table was just booked for an overlapping time. Choose another table or time.",
          },
          { status: 409 },
        );
    }
    if (
      e instanceof Error &&
      /Choose a valid|Reservations must fit/.test(e.message)
    )
      return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(
      "API request failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "The local database could not complete this request. Check the database services and retry.",
      },
      { status: 503 },
    );
  }
}
export {
  route as GET,
  route as POST,
  route as PATCH,
  route as PUT,
  route as DELETE,
};
