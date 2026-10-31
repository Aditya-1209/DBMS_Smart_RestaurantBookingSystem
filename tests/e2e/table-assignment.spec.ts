import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/auth";
const demo = JSON.parse(readFileSync(".data/demo-credentials.json", "utf8"));

test("staff assigns a reserved table with one click and the customer sees dine-in automatically", async ({
  page,
  browser,
}) => {
  const stamp = Date.now().toString();
  const password = "AssignmentTest!2026";
  const customer = await prisma.customer.create({
    data: {
      name: "Table Assignment Guest",
      email: `assignment-${stamp}@test.local`,
      phone: "5" + stamp.slice(-11),
      password: await hashPassword(password),
    },
  });
  const table = await prisma.restaurantTable.create({
    data: {
      table_number: 1000000 + Number(stamp.slice(-7)),
      capacity: 2,
      status: "Available",
    },
  });
  const [r] = await prisma.$queryRaw<
    { reservation_id: number }[]
  >`INSERT INTO reservation(customer_id,table_id,reservation_date,reservation_time,guest_count,duration_minutes) VALUES(${customer.customer_id},${table.table_id},((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')-INTERVAL '1 minute')::date,((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')-INTERVAL '1 minute')::time,2,90) RETURNING reservation_id`;
  const guestContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const guest = await guestContext.newPage();
  try {
    await guest.goto("/login");
    await guest.getByLabel("Email address").fill(customer.email);
    await guest.getByLabel("Password", { exact: true }).fill(password);
    await guest.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(guest).toHaveURL(/\/menu$/);
    await guest
      .getByRole("button", { name: "Add Paneer Tikka", exact: true })
      .click();
    await guest
      .getByRole("dialog")
      .getByRole("button", { name: "Add to basket", exact: true })
      .click();
    await expect(
      guest.getByLabel("Dining option").getByRole("option"),
    ).toHaveCount(1);
    await page.goto("/login");
    await page.getByRole("button", { name: "Restaurant team" }).click();
    await page.getByLabel("Email address").fill(demo.waiter);
    await page.getByLabel("Password", { exact: true }).fill(demo.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/staff$/);
    await page
      .getByRole("link", { name: "Reserve a table", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Find available tables", exact: true }),
    ).toHaveCount(0);
    const card = page
      .locator(".reservation-card")
      .filter({ hasText: `Reservation #${r.reservation_id} ·` });
    let assignments = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith(`/reservations/${r.reservation_id}/assign-table`)
      )
        assignments++;
    });
    await card
      .getByRole("button", { name: "Assign table", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Table assigned", exact: true }),
    ).toBeDisabled();
    await expect(card).toContainText("Checked in");
    await expect(page.getByRole("status")).toContainText(
      `Table ${table.table_number} assigned to Table Assignment Guest`,
    );
    expect(assignments).toBe(1);
    await expect(
      guest.getByRole("option", {
        name: `Dine-in · Table ${table.table_number}`,
        exact: true,
      }),
    ).toHaveCount(1, { timeout: 20000 });
    await guest
      .getByLabel("Dining option")
      .selectOption(String(table.table_id));
    await page.screenshot({
      path: "docs/screenshots/staff-assign-table.png",
      fullPage: true,
    });
    await guest.screenshot({
      path: "docs/screenshots/customer-assigned-table.png",
      fullPage: true,
    });
    await card.getByRole("button", { name: "Complete", exact: true }).click();
    await expect(card).toContainText("Completed");
    expect(
      (
        await prisma.restaurantTable.findUniqueOrThrow({
          where: { table_id: table.table_id },
        })
      ).status,
    ).toBe("Available");
  } finally {
    await guestContext.close();
    await prisma.reservation.deleteMany({
      where: { reservation_id: r.reservation_id },
    });
    await prisma.restaurantTable.delete({
      where: { table_id: table.table_id },
    });
    await prisma.customer.delete({
      where: { customer_id: customer.customer_id },
    });
    await prisma.$disconnect();
  }
});
