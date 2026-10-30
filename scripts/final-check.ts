import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { prisma } from "../lib/prisma";
import { mongodb } from "../lib/mongodb";
import { Review } from "../models/Review";
import { CustomerPreference } from "../models/CustomerPreference";
import { OrderCustomization } from "../models/OrderCustomization";
import { binary } from "./services";
async function main() {
  const origin = process.env.APP_ORIGIN!;
  const health = await fetch(origin + "/api/health");
  assert.equal(health.status, 200);
  console.log("Production API health:", await health.json());
  for (const p of ["/menu", "/login"]) {
    const r = await fetch(origin + p);
    assert.equal(r.status, 200);
    console.log("Production page:", p, r.status);
  }
  const admin = await fetch(origin + "/admin", { redirect: "manual" });
  assert.equal(admin.status, 307);
  assert(admin.headers.get("location")?.includes("/login"));
  console.log("Anonymous admin access redirected to login.");
  await mongodb();
  const current = {
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
  const before = JSON.parse(
    readFileSync(".data/restart-baseline.json", "utf8"),
  );
  assert.deepEqual(current, before);
  console.log(
    "Production records match pre-restart database baseline:",
    current,
  );
  console.log(
    "Database timezone:",
    await prisma.$queryRawUnsafe("SHOW timezone"),
  );
  console.log(
    "Applied migrations:",
    await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`,
  );
  assert.equal(await prisma.outbox.count({ where: { processed_at: null } }), 0);
  console.log("Pending customization jobs: 0");
  const result = spawnSync(
    binary("mongosh"),
    [
      "--nodb",
      "--quiet",
      "--eval",
      "const db = connect(process.env.MONGODB_URI); printjson(db.runCommand({ping:1})); printjson(db.getCollectionNames());",
    ],
    { encoding: "utf8", env: process.env },
  );
  assert.equal(result.status, 0, result.stderr);
  console.log("Native mongosh connectivity:", result.stdout.trim());
  console.log("Node:", process.version);
  for (const name of ["psql", "mongosh"]) {
    const result = spawnSync(binary(name), ["--version"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    console.log(result.stdout.trim());
  }
  console.log(
    "PASS: production application and native database persistence verified.",
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
