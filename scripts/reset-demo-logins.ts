import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { DEMO_CREDENTIALS, DEMO_PASSWORD } from "../lib/demo-accounts";
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/restaurant_management"
  )
    throw Error(
      "This command only configures the local restaurant demo database.",
    );
  const accounts = await prisma.$transaction(
    async (tx) => {
      const customers = await tx.customer.findMany({
        orderBy: { customer_id: "asc" },
      });
      const staff = await tx.staff.findMany({ orderBy: { staff_id: "asc" } });
      // Temporary unique addresses avoid collisions during renumbering; IDs and references stay intact.
      for (const c of customers)
        await tx.customer.update({
          where: { customer_id: c.customer_id },
          data: { email: `${randomUUID()}@demo-migration.invalid` },
        });
      for (const s of staff)
        await tx.staff.update({
          where: { staff_id: s.staff_id },
          data: { email: `${randomUUID()}@demo-migration.invalid` },
        });
      const result = [];
      for (const [i, c] of customers.entries()) {
        const email = `customer${i + 1}@gmail.com`;
        await tx.customer.update({
          where: { customer_id: c.customer_id },
          data: { email, password: await hashPassword(DEMO_PASSWORD) },
        });
        result.push({ email, role: "Customer" });
      }
      const numbers: Record<string, number> = {};
      const prefixes: Record<string, string> = {
        Manager: "admin",
        Chef: "chef",
        Waiter: "waiter",
        Cashier: "cashier",
      };
      for (const s of staff) {
        const prefix = prefixes[s.role] || "staff";
        const n = (numbers[prefix] = (numbers[prefix] || 0) + 1);
        const email = `${prefix}${n}@gmail.com`;
        await tx.staff.update({
          where: { staff_id: s.staff_id },
          data: { email, password: await hashPassword(DEMO_PASSWORD) },
        });
        result.push({ email, role: s.role });
      }
      await tx.session.deleteMany({});
      await tx.loginAttempt.deleteMany({});
      return result;
    },
    { timeout: 30000 },
  );
  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/demo-credentials.json",
    JSON.stringify({ ...DEMO_CREDENTIALS, accounts }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    "Updated local demo logins; account IDs and order/reservation history preserved. Existing sessions signed out.",
  );
  console.table(accounts);
  console.log("All listed accounts use the public demo password: password@123");
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
