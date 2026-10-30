import "dotenv/config";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { prisma } from "../lib/prisma";
import { mongodb } from "../lib/mongodb";
import { OrderCustomization } from "../models/OrderCustomization";
import { startServices, listening } from "../scripts/services";
const base = process.env.APP_ORIGIN!;
let cookie = "",
  orderId = 0;
async function api(p: string, method = "GET", b?: unknown) {
  const r = await fetch(base + "/api/" + p, {
    method,
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(`${p}: ${r.status} ${d.error}`);
  return { data: d, headers: r.headers };
}
async function main() {
  const creds = JSON.parse(readFileSync(".data/demo-credentials.json", "utf8"));
  const login = await api("auth/login", "POST", {
    email: creds.customer,
    password: creds.password,
    scope: "customer",
  });
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  const admin = new MongoClient(
    `mongodb://restaurant_owner:${process.env.MONGO_ADMIN_PASSWORD}@127.0.0.1:27017/admin`,
  );
  await admin.connect();
  const options = await admin.db("admin").command({ getCmdLineOpts: 1 });
  assert.equal(
    path.resolve(options.parsed.storage.dbPath),
    path.join(process.cwd(), ".data/mongo"),
    "Only project-owned MongoDB may be stopped.",
  );
  try {
    await admin.db("admin").command({ shutdown: 1 });
  } catch (e) {
    if (
      !(e instanceof Error) ||
      !/closed|shutdown|interrupted/i.test(e.message)
    )
      throw e;
  } finally {
    await admin.close();
  }
  for (let i = 0; i < 20 && (await listening(27017)); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(await listening(27017), false);
  console.log("Native project MongoDB stopped; PostgreSQL remains available.");
  const dish = await prisma.menuItem.findFirstOrThrow({
    where: { item_name: "Paneer Tikka" },
  });
  const r = await api("orders", "POST", {
    idempotency_key: randomUUID(),
    items: [
      {
        item_id: dish.item_id,
        quantity: 1,
        customizations: {
          size: "Regular",
          crust: "Classic",
          extra_cheese: true,
          remove: [],
          add: [],
          special_instruction:
            "RECOVERY TEST: keep these kitchen instructions.",
        },
      },
    ],
  });
  orderId = r.data.order_id;
  assert.equal(r.data.customizations_pending, true);
  assert.equal(Number(r.data.total_amount), 220);
  console.log(
    "Order committed at ₹220 while MongoDB offline; customization pending = true.",
  );
  const detail = await api(`orders/${orderId}`);
  assert.equal(detail.data.customizations_pending, true);
  assert.equal(
    detail.data.customizations[0].customizations.special_instruction,
    "RECOVERY TEST: keep these kitchen instructions.",
  );
  console.log(
    "Kitchen instructions retrieved from durable SQL outbox during outage.",
  );
  await startServices();
  let recovered = false;
  for (let i = 0; i < 20; i++) {
    const d = await api(`orders/${orderId}`);
    if (!d.data.customizations_pending) {
      recovered = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(recovered);
  await mongodb();
  assert.equal(
    await OrderCustomization.countDocuments({ order_id: orderId }),
    1,
  );
  assert(
    (await prisma.outbox.findUniqueOrThrow({ where: { order_id: orderId } }))
      .processed_at,
  );
  console.log(
    "MongoDB restarted; pending document synchronized exactly once. PASS",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!(await listening(27017))) await startServices();
    if (orderId) {
      await prisma.orders.delete({ where: { order_id: orderId } });
      await mongodb();
      await OrderCustomization.deleteMany({ order_id: orderId });
    }
    await prisma.$disconnect();
    await mongoose.disconnect();
  });
