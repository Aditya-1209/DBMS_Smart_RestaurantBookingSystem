import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { prisma } from "../lib/prisma";
import { mongodb } from "../lib/mongodb";
import { Review } from "../models/Review";
import { CustomerPreference } from "../models/CustomerPreference";
import { OrderCustomization } from "../models/OrderCustomization";
import { reconcile } from "../lib/services/orders";
import { portionPrice } from "../lib/pricing";
const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
const credentials = JSON.parse(
  readFileSync(".data/demo-credentials.json", "utf8"),
);
const cookies: Record<string, string> = {};
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  as = "customer",
  origin = base,
) {
  const r = await fetch(base + "/api/" + path, {
    method,
    headers: {
      Origin: origin,
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      ...(cookies[as] ? { Cookie: cookies[as] } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  return { status: r.status, data, headers: r.headers };
}
async function login(as: string, email: string) {
  const r = await request(
    "auth/login",
    "POST",
    {
      email,
      password: credentials.password,
      scope: as === "customer" ? "customer" : "staff",
    },
    as,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  cookies[as] = r.headers.get("set-cookie")!.split(";")[0];
}
const custom = {
  size: "Regular",
  remove: [],
  add: [],
  special_instruction: "Integration test: mild spice.",
};
let createdCustomer = 0,
  orderId = 0,
  bookingIds: number[] = [],
  tableId = 0;
const runId = Date.now().toString();
after(async () => {
  // Only records created by this test run are removed; demo and user data remain intact.
  if (orderId) {
    await Review.deleteMany({ order_id: orderId });
    await OrderCustomization.deleteMany({ order_id: orderId });
    await prisma.payment.deleteMany({ where: { order_id: orderId } });
    await prisma.orders.updateMany({
      where: { order_id: orderId },
      data: { status: "Placed" },
    });
    await prisma.orders.deleteMany({ where: { order_id: orderId } });
  }
  if (bookingIds.length)
    await prisma.reservation.deleteMany({
      where: { reservation_id: { in: bookingIds } },
    });
  if (tableId)
    await prisma.restaurantTable.deleteMany({ where: { table_id: tableId } });
  if (createdCustomer) {
    await CustomerPreference.deleteMany({ customer_id: createdCustomer });
    await prisma.customer.delete({ where: { customer_id: createdCustomer } });
  }
  await prisma.$disconnect();
  await mongoose.disconnect();
});
test(
  "Restaurant integration suite against running local services",
  { timeout: 180000 },
  async (t) => {
    await t.test(
      "PostgreSQL connection, migration and all nine core tables",
      async () => {
        const rows = await prisma.$queryRaw<
          { tablename: string }[]
        >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
        for (const name of [
          "customer",
          "staff",
          "restaurant_table",
          "category",
          "menu_item",
          "reservation",
          "orders",
          "order_item",
          "payment",
        ])
          assert(rows.some((r) => r.tablename === name));
        assert(await prisma.$queryRaw`SELECT 1`);
      },
    );
    await t.test("MongoDB connection and collection indexes", async () => {
      await mongodb();
      await mongoose.connection.db!.admin().ping();
      for (const model of [Review, CustomerPreference, OrderCustomization]) {
        const indexes = await model.collection.indexes();
        assert(indexes.some((i: { unique?: boolean }) => i.unique));
      }
    });
    await t.test("all eight submitted SQL queries execute", async () => {
      const sql = readFileSync("database/sql/queries.sql", "utf8");
      const queries = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      assert.equal(queries.length, 8);
      for (const [i, q] of queries.entries()) {
        const result = await prisma.$queryRawUnsafe(q);
        console.log(
          "Query",
          i + 1,
          JSON.stringify(result, (_, v) =>
            typeof v === "bigint" ? Number(v) : v,
          ),
        );
      }
    });
    await t.test("submitted sample bill is exactly ₹880", async () => {
      const o = await prisma.orders.findUniqueOrThrow({
        where: { idempotency_key: "seed-order-0" },
      });
      assert.equal(Number(o.total_amount), 880);
    });
    await t.test(
      "order-total trigger INSERT, UPDATE, DELETE and rollback",
      async () => {
        const c = await prisma.customer.findUniqueOrThrow({
          where: { email: credentials.customer },
        });
        const menu = await prisma.menuItem.findMany({
          where: {
            item_name: {
              in: ["Paneer Tikka", "Veg Biryani", "Fresh Lime Soda"],
            },
          },
        });
        await assert.rejects(
          prisma.$transaction(async (tx) => {
            const o = await tx.orders.create({
              data: { customer_id: c.customer_id },
            });
            const lines = [];
            for (const [name, q] of [
              ["Paneer Tikka", 2],
              ["Veg Biryani", 1],
              ["Fresh Lime Soda", 2],
            ] as const) {
              const m = menu.find((m) => m.item_name === name)!;
              lines.push(
                await tx.orderItem.create({
                  data: {
                    order_id: o.order_id,
                    item_id: m.item_id,
                    quantity: q,
                    unit_price: m.price,
                  },
                }),
              );
            }
            const total = async () =>
              Number(
                (
                  await tx.orders.findUniqueOrThrow({
                    where: { order_id: o.order_id },
                  })
                ).total_amount,
              );
            assert.equal(await total(), 880);
            console.log("trg_update_order_total INSERT -> 880");
            await tx.orderItem.update({
              where: { order_item_id: lines[0].order_item_id },
              data: { quantity: 3 },
            });
            assert.equal(await total(), 1100);
            console.log("trg_update_order_total UPDATE -> 1100");
            await tx.orderItem.delete({
              where: { order_item_id: lines[2].order_item_id },
            });
            assert.equal(await total(), 940);
            console.log("trg_update_order_total DELETE -> 940");
            throw Error("ROLLBACK_TRIGGER_TEST");
          }),
          /ROLLBACK_TRIGGER_TEST/,
        );
      },
    );
    await t.test(
      "customer, chef, waiter, cashier and administrator authentication",
      async () => {
        await login("customer", credentials.customer);
        await login("admin", credentials.admin);
        await login("chef", credentials.staff);
        await login("waiter", credentials.waiter);
        await login("cashier", credentials.cashier);
        const r = await request("auth/me");
        assert.equal(r.data.user.role, "customer");
        assert.match(cookies.customer, /saffron_session=/);
      },
    );
    await t.test(
      "server-side authorization and cross-origin protection",
      async () => {
        assert.equal((await request("admin/reports")).status, 403);
        assert.equal(
          (await request("admin/reports", "GET", undefined, "anonymous"))
            .status,
          401,
        );
        assert.equal(
          (
            await request(
              "auth/logout",
              "POST",
              {},
              "customer",
              "https://foreign.invalid",
            )
          ).status,
          403,
        );
        assert.equal(
          (await request("orders/1", "PATCH", { status: "Preparing" })).status,
          403,
        );
      },
    );
    await t.test(
      "registration hashes passwords and rejects role injection",
      async () => {
        const email = `integration-${runId}@test.local`;
        let r = await request(
          "auth/register",
          "POST",
          {
            name: "Integration Guest",
            email,
            phone: "8" + runId.slice(-11),
            password: "LocalTest!2026",
            role: "admin",
          },
          "new",
        );
        assert.equal(r.status, 400);
        r = await request(
          "auth/register",
          "POST",
          {
            name: "Integration Guest",
            email,
            phone: "8" + runId.slice(-11),
            password: "LocalTest!2026",
          },
          "new",
        );
        assert.equal(r.status, 200, JSON.stringify(r.data));
        cookies.new = r.headers.get("set-cookie")!.split(";")[0];
        const c = await prisma.customer.findUniqueOrThrow({ where: { email } });
        createdCustomer = c.customer_id;
        assert(c.password.startsWith("scrypt$"));
        assert(!c.password.includes("LocalTest!2026"));
      },
    );
    await t.test("admin menu and category create, update, delete", async () => {
      const c = await request(
        "admin/categories",
        "POST",
        { category_name: "Test " + runId },
        "admin",
      );
      assert.equal(c.status, 200);
      const m = await request(
        "admin/menu",
        "POST",
        {
          item_name: "Test Dish " + runId,
          description: "Disposable test menu record",
          price: 123,
          category_id: c.data.category_id,
          availability: true,
          vegetarian: true,
          image: "/images/paneer.jpg",
        },
        "admin",
      );
      assert.equal(m.status, 200);
      const updated = await request(
        `admin/menu/${m.data.item_id}`,
        "PATCH",
        {
          item_name: m.data.item_name,
          description: "Updated",
          price: 124,
          category_id: c.data.category_id,
          availability: false,
          vegetarian: true,
          image: "/images/paneer.jpg",
        },
        "admin",
      );
      assert.equal(updated.status, 200);
      assert.equal(Number(updated.data.price), 124);
      assert.equal(
        (await request(`admin/menu/${m.data.item_id}`, "DELETE", {}, "admin"))
          .status,
        200,
      );
      assert.equal(
        (
          await request(
            `admin/categories/${c.data.category_id}`,
            "DELETE",
            {},
            "admin",
          )
        ).status,
        200,
      );
    });
    await t.test("admin staff CRUD, hashing and deactivate", async () => {
      const r = await request(
        "admin/staff",
        "POST",
        {
          name: "Test Waiter",
          email: `staff-${runId}@test.local`,
          phone: "7" + runId.slice(-11),
          role: "Waiter",
          password: "LocalStaff!2026",
          active: true,
        },
        "admin",
      );
      assert.equal(r.status, 200);
      assert.equal(r.data.password, undefined);
      const updated = await request(
        `admin/staff/${r.data.staff_id}`,
        "PATCH",
        {
          name: "Test Waiter",
          email: r.data.email,
          phone: r.data.phone,
          role: "Waiter",
          active: false,
        },
        "admin",
      );
      assert.equal(updated.status, 200);
      assert.equal(updated.data.active, false);
      assert.equal(
        (await request(`admin/staff/${r.data.staff_id}`, "DELETE", {}, "admin"))
          .status,
        200,
      );
    });
    await t.test("admin table CRUD and real availability", async () => {
      const r = await request(
        "admin/tables",
        "POST",
        { table_number: 900, capacity: 4, status: "Available" },
        "admin",
      );
      assert.equal(r.status, 200);
      tableId = r.data.table_id;
      const available = await request(
        "tables/available?date=2035-06-20&time=19:00&guest_count=4&duration_minutes=90",
      );
      assert.equal(available.status, 200);
      assert(
        available.data.tables.some(
          (t: { table_id: number }) => t.table_id === tableId,
        ),
      );
    });
    await t.test(
      "concurrent overlapping reservations permit exactly one booking",
      async () => {
        const results = await Promise.all(
          ["19:00", "19:30"].map((time) =>
            request("reservations", "POST", {
              table_id: tableId,
              date: "2035-06-20",
              time,
              guest_count: 4,
              duration_minutes: 90,
            }),
          ),
        );
        bookingIds = results
          .filter((r) => r.status === 200)
          .map((r) => r.data.reservation_id);
        console.log(
          "Concurrent bookings:",
          results.map((r) => ({
            status: r.status,
            message: r.data.error || r.data.reservation_id,
          })),
        );
        assert.equal(bookingIds.length, 1);
        assert(results.some((r) => r.status === 409));
        const available = await request(
          "tables/available?date=2035-06-20&time=19:30&guest_count=4&duration_minutes=90",
        );
        assert(
          !available.data.tables.some(
            (t: { table_id: number }) => t.table_id === tableId,
          ),
        );
      },
    );
    await t.test(
      "reservation DB constraint rejects overlap and enforces capacity",
      async () => {
        const c = await prisma.customer.findUniqueOrThrow({
          where: { email: credentials.customer },
        });
        await assert.rejects(
          prisma.reservation.create({
            data: {
              customer_id: c.customer_id,
              table_id: tableId,
              reservation_date: new Date("2035-06-20"),
              reservation_time: new Date("1970-01-01T19:45:00Z"),
              guest_count: 4,
            },
          }),
        );
        await assert.rejects(
          prisma.reservation.create({
            data: {
              customer_id: c.customer_id,
              table_id: tableId,
              reservation_date: new Date("2035-06-21"),
              reservation_time: new Date("1970-01-01T19:00:00Z"),
              guest_count: 5,
            },
          }),
        );
        console.log(
          "trg_check_reservation_conflict: overlap and oversized party rejected.",
        );
      },
    );
    await t.test(
      "adjacent reservations allowed and cancellation frees capacity",
      async () => {
        const first = await prisma.reservation.findUniqueOrThrow({
          where: { reservation_id: bookingIds[0] },
        });
        const time = first.ends_at.toISOString().slice(11, 16);
        const r = await request("reservations", "POST", {
          table_id: tableId,
          date: "2035-06-20",
          time,
          guest_count: 4,
          duration_minutes: 30,
        });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        bookingIds.push(r.data.reservation_id);
        assert.equal(
          (
            await request(`reservations/${r.data.reservation_id}`, "PATCH", {
              status: "Cancelled",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `reservations/${bookingIds[0]}`,
              "PATCH",
              { status: "Cancelled" },
              "new",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(`reservations/${bookingIds[0]}`, "PATCH", {
              status: "Cancelled",
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "24/7 reservations accept midnight and reject cross-date overlaps",
      async () => {
        const night = await request("reservations", "POST", {
          table_id: tableId,
          date: "2037-06-20",
          time: "23:30",
          guest_count: 2,
          duration_minutes: 90,
        });
        assert.equal(night.status, 200, JSON.stringify(night.data));
        bookingIds.push(night.data.reservation_id);
        assert.equal(night.data.ends_at.slice(0, 16), "2037-06-21T01:00");
        const overlap = await request("reservations", "POST", {
          table_id: tableId,
          date: "2037-06-21",
          time: "00:15",
          guest_count: 2,
          duration_minutes: 30,
        });
        assert.equal(overlap.status, 409, JSON.stringify(overlap.data));
        const morning = await request("reservations", "POST", {
          table_id: tableId,
          date: "2037-06-21",
          time: "01:00",
          guest_count: 2,
          duration_minutes: 30,
        });
        assert.equal(morning.status, 200, JSON.stringify(morning.data));
        bookingIds.push(morning.data.reservation_id);
        const available = await request(
          `tables/available?date=2037-06-21&time=00:30&guest_count=2&duration_minutes=30`,
        );
        assert.equal(available.status, 200);
        assert(
          !available.data.tables.some(
            (t: { table_id: number }) => t.table_id === tableId,
          ),
        );
      },
    );
    await t.test(
      "one-click staff assignment enables only the reserved guest's dine-in and releases on completion",
      async () => {
        const [r] = await prisma.$queryRaw<
          { reservation_id: number }[]
        >`INSERT INTO reservation(customer_id,table_id,reservation_date,reservation_time,guest_count,duration_minutes) VALUES(${createdCustomer},${tableId},((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')-INTERVAL '5 minutes')::date,((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')-INTERVAL '5 minutes')::time,2,90) RETURNING reservation_id`;
        bookingIds.push(r.reservation_id);
        const endpoint = `reservations/${r.reservation_id}/assign-table`;
        assert.equal((await request(endpoint, "POST", {}, "new")).status, 403);
        assert.equal((await request(endpoint, "POST", {}, "chef")).status, 403);
        // Occupied tables cannot be claimed for an unrelated guest.
        await prisma.restaurantTable.update({
          where: { table_id: tableId },
          data: { status: "Occupied" },
        });
        assert.equal(
          (await request(endpoint, "POST", {}, "waiter")).status,
          409,
        );
        assert.equal(
          (
            await prisma.reservation.findUniqueOrThrow({
              where: { reservation_id: r.reservation_id },
            })
          ).checked_in_at,
          null,
        );
        await prisma.restaurantTable.update({
          where: { table_id: tableId },
          data: { status: "Available" },
        });
        const before = await request(
          "tables/eligible",
          "GET",
          undefined,
          "new",
        );
        assert(
          !before.data.tables.some(
            (t: { table_id: number }) => t.table_id === tableId,
          ),
        );
        const results = await Promise.all([
          request(endpoint, "POST", {}, "waiter"),
          request(endpoint, "POST", {}, "waiter"),
        ]);
        assert(
          results.every((x) => x.status === 200),
          JSON.stringify(results.map((x) => x.data)),
        );
        assert.equal(
          results[0].data.checked_in_at,
          results[1].data.checked_in_at,
        );
        assert.equal(results[0].data.table.status, "Occupied");
        const guest = await request("tables/eligible", "GET", undefined, "new");
        assert(
          guest.data.tables.some(
            (t: { table_id: number }) => t.table_id === tableId,
          ),
        );
        const other = await request("tables/eligible");
        assert(
          !other.data.tables.some(
            (t: { table_id: number }) => t.table_id === tableId,
          ),
        );
        const item = await prisma.menuItem.findFirstOrThrow({
          where: { item_name: "Paneer Tikka" },
        });
        assert.equal(
          (
            await request("orders", "POST", {
              table_id: tableId,
              idempotency_key: randomUUID(),
              items: [
                { item_id: item.item_id, quantity: 1, customizations: custom },
              ],
            })
          ).status,
          403,
        );
        let dineInOrder = 0;
        try {
          const order = await request(
            "orders",
            "POST",
            {
              table_id: tableId,
              idempotency_key: randomUUID(),
              items: [
                { item_id: item.item_id, quantity: 1, customizations: custom },
              ],
            },
            "new",
          );
          assert.equal(order.status, 200, JSON.stringify(order.data));
          dineInOrder = order.data.order_id;
          assert.equal(
            (
              await request(
                `reservations/${r.reservation_id}`,
                "PATCH",
                { status: "Completed" },
                "waiter",
              )
            ).status,
            409,
          );
        } finally {
          if (dineInOrder) {
            await OrderCustomization.deleteMany({ order_id: dineInOrder });
            await prisma.orders.delete({ where: { order_id: dineInOrder } });
          }
        }
        assert.equal(
          (
            await request(
              `reservations/${r.reservation_id}`,
              "PATCH",
              { status: "Completed" },
              "waiter",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await prisma.restaurantTable.findUniqueOrThrow({
              where: { table_id: tableId },
            })
          ).status,
          "Available",
        );
        assert.equal(
          (await request(endpoint, "POST", {}, "waiter")).status,
          409,
        );
        // A future reservation cannot occupy a table ahead of its slot.
        const future = await request("reservations", "POST", {
          table_id: tableId,
          date: "2038-07-10",
          time: "12:00",
          guest_count: 2,
          duration_minutes: 90,
        });
        assert.equal(future.status, 200);
        bookingIds.push(future.data.reservation_id);
        assert.equal(
          (
            await request(
              `reservations/${future.data.reservation_id}/assign-table`,
              "POST",
              {},
              "waiter",
            )
          ).status,
          409,
        );
      },
    );
    await t.test("portion pricing rounds to the nearest paise", () => {
      assert.equal(portionPrice("220.00", "Regular"), 220);
      assert.equal(portionPrice("220.00", "Large"), 330);
      assert.equal(portionPrice("19.99", "Large"), 29.99);
      assert.equal(portionPrice("0.01", "Large"), 0.02);
      assert.equal(portionPrice("0.00", "Large"), 0);
    });
    await t.test(
      "retired options, invalid portions and client unit prices are rejected",
      async () => {
        const item = await prisma.menuItem.findFirstOrThrow({
          where: { availability: true },
        });
        for (const extra of [
          { extra_cheese: true },
          { crust: "Thin" },
          { size: "Huge" },
        ]) {
          const r = await request("orders", "POST", {
            idempotency_key: randomUUID(),
            items: [
              {
                item_id: item.item_id,
                quantity: 1,
                customizations: { ...custom, ...extra },
              },
            ],
          });
          assert.equal(r.status, 400, JSON.stringify(r.data));
        }
        const r = await request("orders", "POST", {
          idempotency_key: randomUUID(),
          items: [
            {
              item_id: item.item_id,
              quantity: 1,
              unit_price: 1,
              customizations: { ...custom, size: "Large" },
            },
          ],
        });
        assert.equal(r.status, 400, JSON.stringify(r.data));
      },
    );
    await t.test(
      "order placement supports separately customized duplicate dishes",
      async () => {
        const m = await prisma.menuItem.findFirstOrThrow({
          where: { item_name: "Paneer Tikka" },
        });
        const key = randomUUID();
        const body = {
          idempotency_key: key,
          items: [
            { item_id: m.item_id, quantity: 2, customizations: custom },
            {
              item_id: m.item_id,
              quantity: 1,
              customizations: {
                ...custom,
                size: "Large",
                special_instruction: "Large portion, mild spice.",
              },
            },
          ],
        };
        const r = await request("orders", "POST", body);
        assert.equal(r.status, 200, JSON.stringify(r.data));
        orderId = r.data.order_id;
        assert.equal(r.data.items.length, 2);
        assert.equal(Number(r.data.total_amount), 770);
        const retry = await request("orders", "POST", body);
        assert.equal(retry.data.order_id, orderId);
        assert.equal(
          await prisma.orders.count({ where: { idempotency_key: key } }),
          1,
        );
        const docs = await OrderCustomization.find({ order_id: orderId });
        assert.equal(docs.length, 2);
        const sizes = docs.map((d) => d.customizations?.size).sort();
        assert.deepEqual(sizes, ["Large", "Regular"]);
        assert.deepEqual(
          r.data.items
            .map((line: { unit_price: string }) => Number(line.unit_price))
            .sort((a: number, b: number) => a - b),
          [220, 330],
        );
        assert.notEqual(docs[0].order_item_id, docs[1].order_item_id);
      },
    );
    await t.test(
      "client amounts are rejected; another customer cannot access order",
      async () => {
        assert.equal(
          (
            await request("orders", "POST", {
              idempotency_key: randomUUID(),
              items: [],
              total_amount: 1,
            })
          ).status,
          400,
        );
        assert.equal(
          (await request(`orders/${orderId}`, "GET", undefined, "new")).status,
          403,
        );
        assert.equal(
          (
            await request(
              `orders/${orderId}/payment`,
              "POST",
              { payment_method: "Cash" },
              "new",
            )
          ).status,
          403,
        );
      },
    );
    await t.test("historical prices remain immutable", async () => {
      const line = await prisma.orderItem.findFirstOrThrow({
        where: { order_id: orderId },
      });
      await assert.rejects(
        prisma.orderItem.update({
          where: { order_item_id: line.order_item_id },
          data: { unit_price: 1 },
        }),
      );
      assert.equal(Number(line.unit_price), 220);
    });
    await t.test(
      "kitchen state transitions and staff role permissions",
      async () => {
        assert.equal(
          (
            await request(
              `orders/${orderId}`,
              "PATCH",
              { status: "Served" },
              "chef",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              `orders/${orderId}`,
              "PATCH",
              { status: "Ready" },
              "waiter",
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await request(
              `orders/${orderId}`,
              "PATCH",
              { status: "Preparing" },
              "chef",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `orders/${orderId}`,
              "PATCH",
              { status: "Ready" },
              "chef",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `orders/${orderId}`,
              "PATCH",
              { status: "Served" },
              "waiter",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `orders/${orderId}`,
              "PATCH",
              { status: "Completed" },
              "cashier",
            )
          ).status,
          409,
        );
      },
    );
    await t.test(
      "concurrent payment prevents duplicates and verifies actual bill",
      async () => {
        const before = await prisma.payment.aggregate({
          where: { payment_status: "Completed" },
          _sum: { amount: true },
        });
        const responses = await Promise.all([
          request(`orders/${orderId}/payment`, "POST", {
            payment_method: "UPI",
          }),
          request(`orders/${orderId}/payment`, "POST", {
            payment_method: "UPI",
          }),
        ]);
        assert.equal(responses.filter((r) => r.status === 200).length, 1);
        assert.equal(responses.filter((r) => r.status === 409).length, 1);
        assert.equal(
          await prisma.payment.count({ where: { order_id: orderId } }),
          1,
        );
        const after = await prisma.payment.aggregate({
          where: { payment_status: "Completed" },
          _sum: { amount: true },
        });
        assert.equal(
          Number(after._sum.amount) - Number(before._sum.amount),
          770,
        );
        assert.equal(
          (
            await request(
              `orders/${orderId}`,
              "PATCH",
              { status: "Completed" },
              "cashier",
            )
          ).status,
          200,
        );
      },
    );
    await t.test(
      "review create, retrieve, dish average, ownership and edit",
      async () => {
        const o = await prisma.orders.findUniqueOrThrow({
          where: { order_id: orderId },
          include: { items: true },
        });
        const body = {
          order_id: orderId,
          rating: 5,
          comment: "Integration test review",
          items_reviewed: [{ item_id: o.items[0].item_id, rating: 5 }],
        };
        assert.equal((await request("reviews", "POST", body)).status, 200);
        assert.equal(
          (await request("reviews", "PUT", body, "new")).status,
          403,
        );
        assert.equal((await request("reviews", "POST", body)).status, 409);
        assert.equal(
          (
            await request("reviews", "PUT", {
              ...body,
              comment: "Updated integration review",
            })
          ).status,
          200,
        );
        const r = await request(`reviews?item_id=${o.items[0].item_id}`);
        assert(
          r.data.reviews.some(
            (r: { order_id: number }) => r.order_id === orderId,
          ),
        );
        assert(
          r.data.averages.some(
            (r: { _id: number }) => r._id === o.items[0].item_id,
          ),
        );
      },
    );
    await t.test(
      "preferences persist in MongoDB with SQL customer identity",
      async () => {
        const body = {
          dietary_preferences: ["Vegetarian"],
          preferred_cuisines: ["Indian"],
          spice_level: "High",
          allergens: ["Peanuts"],
        };
        assert.equal(
          (await request("preferences", "PUT", body, "new")).status,
          200,
        );
        const r = await request("preferences", "GET", undefined, "new");
        assert.deepEqual(r.data.preferences.allergens, ["Peanuts"]);
        assert.equal(r.data.preferences.customer_id, createdCustomer);
      },
    );
    await t.test(
      "outbox retries are idempotent and kitchen instructions retrievable",
      async () => {
        await prisma.outbox.update({
          where: { order_id: orderId },
          data: { processed_at: null },
        });
        assert(await reconcile(orderId));
        assert(await reconcile(orderId));
        const o = await request(`orders/${orderId}`, "GET", undefined, "chef");
        assert.equal(o.data.customizations.length, 2);
        assert.equal(
          await OrderCustomization.countDocuments({ order_id: orderId }),
          2,
        );
      },
    );
    await t.test(
      "admin reports reconcile with SQL completed payment revenue",
      async () => {
        const r = await request("admin/reports", "GET", undefined, "admin");
        assert.equal(r.status, 200);
        const sum = await prisma.payment.aggregate({
          where: { payment_status: "Completed" },
          _sum: { amount: true },
        });
        assert.equal(
          Number(r.data.revenue[0].total_revenue),
          Number(sum._sum.amount),
        );
        assert.equal(r.data.pending_customizations, 0);
      },
    );
    await t.test("invalid input and logout invalidate sessions", async () => {
      assert.equal(
        (
          await request("reservations", "POST", {
            table_id: tableId,
            date: "bad",
            time: "25:00",
            guest_count: -1,
          })
        ).status,
        400,
      );
      assert.equal(
        (await request("auth/logout", "POST", {}, "new")).status,
        200,
      );
      assert.equal(
        (await request("preferences", "GET", undefined, "new")).status,
        401,
      );
    });
  },
);
