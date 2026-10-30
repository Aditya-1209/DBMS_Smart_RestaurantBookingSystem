import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { mongodb } from "../lib/mongodb";
import { startServices, stopServices } from "../scripts/services";
import { Review } from "../models/Review";
import { CustomerPreference } from "../models/CustomerPreference";
import { OrderCustomization } from "../models/OrderCustomization";
async function snapshot() {
  await mongodb();
  return {
    customers: await prisma.customer.count(),
    menu: await prisma.menuItem.count(),
    orders: await prisma.orders.count(),
    payments: await prisma.payment.count(),
    reservations: await prisma.reservation.count(),
    reviews: await Review.countDocuments(),
    preferences: await CustomerPreference.countDocuments(),
    customizations: await OrderCustomization.countDocuments(),
    sample_total: Number(
      (
        await prisma.orders.findUniqueOrThrow({
          where: { idempotency_key: "seed-order-0" },
        })
      ).total_amount,
    ),
  };
}
async function main() {
  const before = await snapshot();
  await prisma.$disconnect();
  await mongoose.disconnect();
  await stopServices();
  console.log(
    "Both project-owned native database processes shut down cleanly.",
  );
  await startServices();
  const after = await snapshot();
  assert.deepEqual(after, before);
  console.log("Before restart:", before);
  console.log("After restart: ", after);
  writeFileSync(".data/restart-baseline.json", JSON.stringify(after, null, 2));
  console.log(
    "All SQL and MongoDB records persist across database restart. PASS",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await mongoose.disconnect();
  });
