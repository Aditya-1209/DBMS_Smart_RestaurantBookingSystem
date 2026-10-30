import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import type {
  Customer,
  Staff,
  RestaurantTable,
  Category,
  MenuItem,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { mongodb } from "../lib/mongodb";
import { Review } from "../models/Review";
import { CustomerPreference } from "../models/CustomerPreference";
import { OrderCustomization } from "../models/OrderCustomization";
import { reconcile } from "../lib/services/orders";
async function main() {
  mkdirSync(".data", { recursive: true });
  const credentialsPath = ".data/demo-credentials.json";
  const credentials = existsSync(credentialsPath)
    ? JSON.parse(readFileSync(credentialsPath, "utf8"))
    : {
        password: `Saffron!${randomBytes(9).toString("base64url")}`,
        customer: "rahul@gmail.com",
        admin: "vikram@restaurant.com",
        staff: "karan@restaurant.com",
        waiter: "priya@restaurant.com",
        cashier: "meera@restaurant.com",
      };
  if (!existsSync(credentialsPath))
    writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });
  const hashed = await hashPassword(credentials.password);
  const customers: Customer[] = [];
  for (const [name, email, phone] of [
    ["Rahul Sharma", "rahul@gmail.com", "9876543210"],
    ["Ananya Singh", "ananya@gmail.com", "9876543211"],
    ["Arjun Kumar", "arjun@gmail.com", "9876543212"],
  ])
    customers.push(
      await prisma.customer.upsert({
        where: { email },
        create: { name, email, phone, password: hashed },
        update: {},
      }),
    );
  const staff: Staff[] = [];
  for (const [name, email, phone, role] of [
    ["Vikram Rao", "vikram@restaurant.com", "9000000001", "Manager"],
    ["Priya Nair", "priya@restaurant.com", "9000000002", "Waiter"],
    ["Karan Das", "karan@restaurant.com", "9000000003", "Chef"],
    ["Meera Joshi", "meera@restaurant.com", "9000000004", "Cashier"],
  ])
    staff.push(
      await prisma.staff.upsert({
        where: { email },
        create: { name, email, phone, role, password: hashed },
        update: {},
      }),
    );
  const tables: RestaurantTable[] = [];
  for (const [i, capacity] of [2, 4, 4, 6, 8, 2, 4, 6].entries())
    tables.push(
      await prisma.restaurantTable.upsert({
        where: { table_number: i + 1 },
        create: { table_number: i + 1, capacity },
        update: {},
      }),
    );
  const cats: Category[] = [];
  for (const category_name of [
    "Starters",
    "Main Course",
    "Desserts",
    "Beverages",
  ])
    cats.push(
      await prisma.category.upsert({
        where: { category_name },
        create: { category_name },
        update: {},
      }),
    );
  const dishes: [string, number, number, string, string, boolean][] = [
    [
      "Paneer Tikka",
      220,
      0,
      "Smoky tandoor-grilled cottage cheese, peppers & a mint chutney.",
      "paneer",
      true,
    ],
    [
      "Chicken 65",
      250,
      0,
      "Crisp, fiery chicken with curry leaves and a squeeze of lime.",
      "chicken",
      false,
    ],
    [
      "Veg Biryani",
      280,
      1,
      "Slow-cooked basmati, seasonal vegetables & fragrant whole spices.",
      "biryani",
      true,
    ],
    [
      "Butter Chicken",
      350,
      1,
      "Tandoori chicken in a silky tomato, butter & cream sauce.",
      "curry",
      false,
    ],
    [
      "Gulab Jamun",
      100,
      2,
      "Warm milk dumplings soaked in cardamom & rose syrup.",
      "dessert",
      true,
    ],
    [
      "Fresh Lime Soda",
      80,
      3,
      "Freshly squeezed lime, sparkling water & a little sunshine.",
      "drink",
      true,
    ],
    [
      "Palak Paneer",
      290,
      1,
      "Creamy spinach, soft paneer & a gentle garlic tempering.",
      "paneer",
      true,
    ],
    [
      "Chicken Biryani",
      340,
      1,
      "Dum-cooked chicken and long-grain rice, finished with saffron.",
      "biryani",
      false,
    ],
    [
      "Tandoori Mushroom",
      210,
      0,
      "Charred mushrooms, hung-curd marinade & toasted spices.",
      "paneer",
      true,
    ],
    [
      "Mango Kulfi",
      130,
      2,
      "Rich mango frozen dessert with pistachio and saffron.",
      "dessert",
      true,
    ],
    [
      "Masala Chai",
      60,
      3,
      "Brewed-to-order tea with ginger, cardamom & milk.",
      "chai",
      true,
    ],
    [
      "Dal Makhani",
      260,
      1,
      "Black lentils simmered overnight, finished with butter.",
      "curry",
      true,
    ],
  ];
  const menu: MenuItem[] = [];
  for (const [
    item_name,
    price,
    cat,
    description,
    image,
    vegetarian,
  ] of dishes) {
    let m = await prisma.menuItem.findFirst({ where: { item_name } });
    if (!m)
      m = await prisma.menuItem.create({
        data: {
          item_name,
          price,
          category_id: cats[cat].category_id,
          description,
          image: `/images/${image}.jpg`,
          vegetarian,
        },
      });
    if (item_name === "Masala Chai" && m.image === "/images/drink.jpg")
      m = await prisma.menuItem.update({
        where: { item_id: m.item_id },
        data: { image: "/images/chai.jpg" },
      });
    menu.push(m);
  }
  const statuses = [
    "Completed",
    "Preparing",
    "Ready",
    "Placed",
    "Served",
    "Completed",
    "Completed",
    "Cancelled",
  ];
  for (const [i, status] of statuses.entries()) {
    const key = `seed-order-${i}`;
    if (await prisma.orders.findUnique({ where: { idempotency_key: key } }))
      continue;
    await prisma.$transaction(async (tx) => {
      const o = await tx.orders.create({
        data: {
          customer_id: customers[i % 3].customer_id,
          staff_id: staff[1].staff_id,
          table_id: tables[i % tables.length].table_id,
          idempotency_key: key,
        },
      });
      const lines =
        i === 0
          ? [
              [0, 2],
              [2, 1],
              [5, 2],
            ]
          : [
              [i % menu.length, 1],
              [5, 2],
            ];
      const docs = [];
      for (const [idx, quantity] of lines) {
        const m = menu[idx];
        const l = await tx.orderItem.create({
          data: {
            order_id: o.order_id,
            item_id: m.item_id,
            quantity,
            unit_price: m.price,
            status: ["Completed", "Served"].includes(status)
              ? "Served"
              : status === "Ready"
                ? "Ready"
                : status === "Preparing"
                  ? "Preparing"
                  : "Placed",
          },
        });
        docs.push({
          order_id: o.order_id,
          order_item_id: l.order_item_id,
          item_id: m.item_id,
          customizations: {
            size: "Regular",
            crust: "Classic",
            extra_cheese: false,
            remove: [],
            add: [],
            special_instruction: i === 1 ? "Mild spice, please." : "",
          },
        });
      }
      await tx.outbox.create({ data: { order_id: o.order_id, payload: docs } });
      if (["Completed", "Served"].includes(status)) {
        const bill = await tx.orders.findUniqueOrThrow({
          where: { order_id: o.order_id },
        });
        await tx.payment.create({
          data: {
            order_id: o.order_id,
            amount: bill.total_amount,
            payment_method: ["UPI", "Card", "Cash"][i % 3],
            payment_status: "Completed",
          },
        });
      }
      await tx.orders.update({
        where: { order_id: o.order_id },
        data: { status },
      });
    });
  }
  await mongodb();
  await Promise.all(
    [Review, CustomerPreference, OrderCustomization].map(async (model) => {
      await model.createCollection();
      await model.createIndexes();
    }),
  );
  await reconcile();
  for (const c of customers)
    await CustomerPreference.updateOne(
      { customer_id: c.customer_id },
      {
        $setOnInsert: {
          dietary_preferences: ["Vegetarian"],
          preferred_cuisines: ["Indian"],
          spice_level: "Medium",
          allergens: [],
        },
      },
      { upsert: true },
    );
  const paid = await prisma.orders.findMany({
    where: { status: "Completed", idempotency_key: { startsWith: "seed-" } },
    include: { items: true },
  });
  for (const [i, o] of paid.entries())
    await Review.updateOne(
      { order_id: o.order_id },
      {
        $setOnInsert: {
          customer_id: o.customer_id,
          order_id: o.order_id,
          rating: i % 2 ? 4 : 5,
          comment: [
            "The paneer was beautifully smoky. A lovely meal with the family.",
            "Warm service and very comforting food. We will be back.",
            "Loved the spices and the fresh lime soda!",
          ][i % 3],
          items_reviewed: o.items.map((l) => ({
            item_id: l.item_id,
            rating: i % 2 ? 4 : 5,
          })),
        },
      },
      { upsert: true },
    );
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (
    !(await prisma.reservation.findFirst({
      where: {
        customer_id: customers[0].customer_id,
        reservation_date: new Date(tomorrow),
      },
    }))
  )
    await prisma.reservation.create({
      data: {
        customer_id: customers[0].customer_id,
        table_id: tables[1].table_id,
        reservation_date: new Date(tomorrow),
        reservation_time: new Date("1970-01-01T19:00:00Z"),
        guest_count: 4,
      },
    });
  const sample = await prisma.orders.findUniqueOrThrow({
    where: { idempotency_key: "seed-order-0" },
  });
  if (Number(sample.total_amount) !== 880)
    throw Error("The submitted ₹880 bill did not match.");
  console.log(
    "Idempotent seed verified: 9 core entities, 12 dishes, 8 sample orders. Submitted sample bill: ₹880.",
  );
  console.log(
    "Generated demo credentials: .data/demo-credentials.json (ignored by Git).",
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
