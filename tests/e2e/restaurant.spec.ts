import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prisma } from "../../lib/prisma";
import { mongodb } from "../../lib/mongodb";
import mongoose from "mongoose";
import { Review } from "../../models/Review";
import { OrderCustomization } from "../../models/OrderCustomization";
import { CustomerPreference } from "../../models/CustomerPreference";
const demo = JSON.parse(readFileSync(".data/demo-credentials.json", "utf8"));
const stamp = Date.now().toString(),
  email = `browser-${stamp}@test.local`,
  password = "BrowserDemo!2026";
let orderId = 0;
async function login(page: Page, who: string, team = false) {
  await page.goto("/login");
  if (team) await page.getByRole("button", { name: "Restaurant team" }).click();
  await page.getByLabel("Email address").fill(who);
  await page
    .getByLabel("Password", { exact: true })
    .fill(who === email ? password : demo.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
async function add(page: Page, name: string, note = "") {
  await page.getByRole("button", { name: `Add ${name}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  if (note) await dialog.getByLabel("A note for the kitchen").fill(note);
  await dialog
    .getByRole("button", { name: "Add to basket", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}

test.afterAll(async () => {
  await mongodb();
  const c = await prisma.customer.findUnique({ where: { email } });
  if (c) {
    const orders = await prisma.orders.findMany({
      where: { customer_id: c.customer_id },
    });
    for (const o of orders) {
      await Review.deleteMany({ order_id: o.order_id });
      await OrderCustomization.deleteMany({ order_id: o.order_id });
      await prisma.payment.deleteMany({ where: { order_id: o.order_id } });
      await prisma.orders.update({
        where: { order_id: o.order_id },
        data: { status: "Placed" },
      });
      await prisma.orders.delete({ where: { order_id: o.order_id } });
    }
    await CustomerPreference.deleteMany({ customer_id: c.customer_id });
    await prisma.customer.delete({ where: { customer_id: c.customer_id } });
  }
  await prisma.$disconnect();
  await mongoose.disconnect();
});

test("menu, category filters, search, customized basket and local assets", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (
      !["127.0.0.1", "localhost"].includes(
        new URL(route.request().url()).hostname,
      )
    ) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/menu");
  await expect(
    page.getByRole("heading", { name: "Come hungry. Leave happy." }),
  ).toBeVisible();
  await expect(page.locator(".dish-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Beverages", exact: true }).click();
  await expect(page.locator(".dish-card")).toHaveCount(2);
  await page.getByRole("button", { name: "All dishes", exact: true }).click();
  await page.getByLabel("Search dishes").fill("Paneer");
  await expect(page.locator(".dish-card")).toHaveCount(2);
  await page.getByLabel("Search dishes").fill("");
  await page.getByRole("button", { name: "Veg only", exact: true }).click();
  await expect(page.locator(".dish-card")).toHaveCount(9);
  await page.getByRole("button", { name: "Veg only", exact: true }).click();
  await add(page, "Paneer Tikka", "No onions, please.");
  await page
    .getByRole("button", { name: "Add one Paneer Tikka", exact: true })
    .click();
  await expect(page.locator("aside.cart-panel .grand")).toContainText("₹440");
  await page.reload();
  await expect(page.locator("aside.cart-panel .grand")).toContainText("₹440");
  await expect(page.locator("img").first()).toBeVisible();
  const broken = await page
    .locator("img")
    .evaluateAll(
      (imgs) =>
        imgs.filter(
          (i) =>
            (i as HTMLImageElement).complete &&
            (i as HTMLImageElement).naturalWidth === 0,
        ).length,
    );
  expect(broken).toBe(0);
  expect(external).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/menu-desktop.png",
    fullPage: true,
  });
  await page.screenshot({
    path: "docs/screenshots/menu-preview.png",
    fullPage: false,
  });
});

test("customer registration, submitted ₹880 order, simulated payment and review", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Browser Test Guest");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Phone number").fill("6" + stamp.slice(-11));
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/menu$/);
  await add(page, "Paneer Tikka", "Kitchen browser test: no onions.");
  await page
    .getByRole("button", { name: "Add one Paneer Tikka", exact: true })
    .click();
  await add(page, "Veg Biryani");
  await add(page, "Fresh Lime Soda");
  await page
    .getByRole("button", { name: "Add one Fresh Lime Soda", exact: true })
    .click();
  await expect(page.locator("aside.cart-panel .grand")).toContainText("₹880");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.locator(".order-card")).toHaveCount(1);
  const text = await page.locator(".order-card .order-number").innerText();
  orderId = Number(text.match(/#(\d+)/)![1]);
  await page.getByRole("button", { name: "View order" }).click();
  const d = page.getByRole("dialog");
  await expect(d.locator(".bill-total")).toContainText("₹880");
  await expect(d).toContainText("Kitchen browser test: no onions.");
  await d.getByRole("button", { name: "Simulate payment · ₹880" }).click();
  await expect(d).toContainText("Paid ₹880 via UPI");
  await d.getByRole("button", { name: "How was your meal?" }).click();
  await d
    .getByLabel("A few words")
    .fill("A delicious meal. This review was saved through the browser test.");
  await d.getByRole("button", { name: "Share review", exact: true }).click();
  await expect(d).toContainText("Thank you! Your review is saved.");
  await page.screenshot({
    path: "docs/screenshots/bill-and-review.png",
    fullPage: true,
  });
});

test("customer booking, confirmation and cancellation", async ({ page }) => {
  await login(page, email);
  await page
    .getByRole("link", { name: "Reserve a table", exact: true })
    .click();
  await page.getByLabel("Date", { exact: true }).fill("2036-07-20");
  await page.getByLabel("Arrival time").fill("00:30");
  await page
    .getByRole("button", { name: "Find available tables", exact: true })
    .click();
  await page.locator(".table-option").first().click();
  await page
    .getByRole("button", { name: "Confirm reservation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Your table is booked!");
  await page.screenshot({
    path: "docs/screenshots/reservations.png",
    fullPage: true,
  });
  await page
    .locator(".reservation-card")
    .first()
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await expect(page.locator(".reservation-card").first()).toContainText(
    "Cancelled",
  );
  await page.getByRole("link", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Allergens to be aware of").fill("Peanuts, soy");
  await page.getByRole("button", { name: "Save my preferences" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your preferences have been saved.",
  );
  await page.reload();
  await expect(page.getByLabel("Allergens to be aware of")).toHaveValue(
    "Peanuts, soy",
  );
});

test("chef, waiter and cashier complete the paid customer order", async ({
  page,
}) => {
  expect(orderId).toBeGreaterThan(0);
  await login(page, demo.staff, true);
  await expect(
    page.getByRole("heading", { name: "Let’s get cooking." }),
  ).toBeVisible();
  let card = page
    .locator(".kitchen-card")
    .filter({ has: page.getByText("#" + orderId, { exact: true }) });
  await card.getByRole("button", { name: "Open ticket" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Kitchen browser test: no onions.",
  );
  await page
    .getByRole("button", { name: "Mark Preparing", exact: true })
    .click();
  await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/staff-kitchen.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, demo.waiter, true);
  card = page
    .locator(".kitchen-card")
    .filter({ has: page.getByText("#" + orderId, { exact: true }) });
  await card.getByRole("button", { name: "Open ticket" }).click();
  await page.getByRole("button", { name: "Mark Served", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, demo.cashier, true);
  card = page
    .locator(".kitchen-card")
    .filter({ has: page.getByText("#" + orderId, { exact: true }) });
  await card.getByRole("button", { name: "Open ticket" }).click();
  await page
    .getByRole("button", { name: "Mark Completed", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".badge")).toContainText(
    "Completed",
  );
});

test("administrator dashboard, real reports and category CRUD", async ({
  page,
}) => {
  await login(page, demo.admin, true);
  await expect(page.locator(".stat-grid")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/admin-overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page
    .getByLabel("Category name", { exact: true })
    .fill("Browser Test " + stamp);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Browser Test " + stamp, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Browser Test " + stamp, exact: true })
    .click();
  await page
    .getByLabel("Category name", { exact: true })
    .fill("Updated Browser " + stamp);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Delete Updated Browser " + stamp,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Updated Browser " + stamp, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payment records" }),
  ).toBeVisible();
});

test("mobile layout, mobile cart and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/menu");
  await expect(page.locator(".dish-card")).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/menu-mobile.png",
    fullPage: true,
  });
  await add(page, "Paneer Tikka");
  await page.getByRole("button", { name: "Open basket", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Paneer Tikka");
  await expect(page.getByRole("dialog")).toContainText("₹220");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
});
