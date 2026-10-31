import { prisma } from "../prisma";
import { HttpError, type Actor } from "../auth";

export async function assignReservation(actor: Actor, id: number) {
  if (actor.role === "customer" || actor.staffRole === "Chef")
    throw new HttpError(
      403,
      "Only front-of-house staff and managers can assign tables.",
    );
  const target = await prisma.reservation.findUnique({
    where: { reservation_id: id },
    select: { table_id: true },
  });
  if (!target) throw new HttpError(404, "Reservation not found.");
  return prisma.$transaction(async (tx) => {
    // Always lock table before reservation: booking, check-in and release share this order.
    await tx.$queryRaw`SELECT table_id FROM restaurant_table WHERE table_id=${target.table_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT reservation_id FROM reservation WHERE reservation_id=${id} FOR UPDATE`;
    const r = await tx.reservation.findUnique({
      where: { reservation_id: id },
      include: { table: true, customer: { select: { name: true } } },
    });
    if (!r) throw new HttpError(404, "Reservation not found.");
    if (r.status !== "Confirmed")
      throw new HttpError(
        409,
        "Only confirmed reservations can be checked in.",
      );
    const [clock] = await tx.$queryRaw<
      { active: boolean }[]
    >`SELECT starts_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AND ends_at > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') AS active FROM reservation WHERE reservation_id=${id}`;
    if (!clock.active)
      throw new HttpError(
        409,
        "Assign this table during the reservation time slot.",
      );
    if (r.checked_in_at && r.table.status === "Occupied") return r;
    if (r.table.status === "Occupied")
      throw new HttpError(
        409,
        "This table is already occupied. Release it before assigning another guest.",
      );
    if (r.guest_count > r.table.capacity)
      throw new HttpError(
        409,
        "The table no longer has enough seats for this party.",
      );
    await tx.restaurantTable.update({
      where: { table_id: r.table_id },
      data: { status: "Occupied" },
    });
    return tx.reservation.update({
      where: { reservation_id: id },
      data: { checked_in_at: new Date() },
      include: { table: true, customer: { select: { name: true } } },
    });
  });
}

export async function closeReservation(
  actor: Actor,
  id: number,
  status: "Cancelled" | "Completed",
) {
  const target = await prisma.reservation.findUnique({
    where: { reservation_id: id },
    select: { table_id: true },
  });
  if (!target) throw new HttpError(404, "Reservation not found.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT table_id FROM restaurant_table WHERE table_id=${target.table_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT reservation_id FROM reservation WHERE reservation_id=${id} FOR UPDATE`;
    const r = await tx.reservation.findUnique({
      where: { reservation_id: id },
    });
    if (!r) throw new HttpError(404, "Reservation not found.");
    if (
      actor.role === "customer" &&
      (r.customer_id !== actor.id || status !== "Cancelled")
    )
      throw new HttpError(403, "This reservation cannot be changed by you.");
    if (actor.staffRole === "Chef")
      throw new HttpError(
        403,
        "Only front-of-house staff and managers can manage reservations.",
      );
    if (r.status !== "Confirmed")
      throw new HttpError(409, "This reservation is already closed.");
    if (
      actor.role === "customer" &&
      new Date(r.starts_at.valueOf() - 330 * 60000) <= new Date()
    )
      throw new HttpError(
        409,
        "A reservation can only be cancelled before its start.",
      );
    if (r.checked_in_at) {
      if (
        await tx.orders.count({
          where: {
            table_id: r.table_id,
            status: { notIn: ["Completed", "Cancelled"] },
          },
        })
      )
        throw new HttpError(
          409,
          "Finish the active table orders before closing this reservation.",
        );
      // Do not release a table now occupied by a different, later checked-in reservation.
      const other = await tx.reservation.count({
        where: {
          table_id: r.table_id,
          reservation_id: { not: id },
          status: "Confirmed",
          checked_in_at: { not: null },
          ends_at: { gt: r.ends_at },
        },
      });
      if (!other)
        await tx.restaurantTable.updateMany({
          where: { table_id: r.table_id, status: "Occupied" },
          data: { status: "Available" },
        });
    }
    return tx.reservation.update({
      where: { reservation_id: id },
      data: { status },
    });
  });
}
