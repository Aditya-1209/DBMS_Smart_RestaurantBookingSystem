import "dotenv/config";
import { prisma } from "../lib/prisma";
import { mongodb } from "../lib/mongodb";
import mongoose from "mongoose";
async function main() {
  console.log(
    "PostgreSQL:",
    await prisma.$queryRaw`SELECT current_database() AS database, version() AS version`,
  );
  await mongodb();
  console.log("MongoDB:", await mongoose.connection.db!.admin().ping());
  console.log("Core records:", {
    customers: await prisma.customer.count(),
    menu: await prisma.menuItem.count(),
    orders: await prisma.orders.count(),
  });
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await mongoose.disconnect();
  });
