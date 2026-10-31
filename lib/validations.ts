import { z } from "zod";
export const id = z.number().int().positive();
export const text = (max = 100) => z.string().trim().min(1).max(max);
export const email = z
  .email()
  .max(150)
  .transform((v) => v.toLowerCase());
export const phone = z
  .string()
  .regex(/^\+?[0-9]{10,14}$/, "Use a 10–14 digit phone number.");
export const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128);
export const customization = z
  .object({
    size: z.enum(["Regular", "Large"]).default("Regular"),
    crust: z.enum(["Classic", "Thin"]).default("Classic"),
    extra_cheese: z.boolean().default(false),
    remove: z.array(text(50)).max(10).default([]),
    add: z.array(text(50)).max(10).default([]),
    special_instruction: z.string().trim().max(500).default(""),
  })
  .strict();
export const orderInput = z
  .object({
    table_id: id.nullable().optional(),
    idempotency_key: z.string().uuid(),
    items: z
      .array(
        z.object({
          item_id: id,
          quantity: z.number().int().min(1).max(99),
          customizations: customization,
        }),
      )
      .min(1)
      .max(30),
  })
  .strict();
export const bookingInput = z
  .object({
    table_id: id,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    guest_count: z.number().int().min(1).max(30),
    duration_minutes: z.number().int().min(30).max(240).default(90),
  })
  .strict();
export function bookingDates(date: string, time: string, duration: number) {
  const day = new Date(date + "T00:00:00Z");
  if (Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== date)
    throw Error("Choose a valid future date and time.");
  const start = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(start.valueOf()) || start <= new Date())
    throw Error("Choose a valid future date and time.");
  return { start, end: new Date(start.valueOf() + duration * 60000) };
}
export const menuInput = z
  .object({
    item_name: text(),
    description: z.string().trim().max(1000),
    category_id: id,
    price: z.number().min(0).max(100000),
    availability: z.boolean(),
    vegetarian: z.boolean(),
    image: z.string().regex(/^\/images\/[a-z0-9-]+\.(svg|jpg|webp)$/),
  })
  .strict();
export const staffInput = z
  .object({
    name: text(),
    email,
    phone,
    role: z.enum(["Manager", "Waiter", "Chef", "Cashier"]),
    password: password.optional(),
    active: z.boolean().default(true),
  })
  .strict();
export const tableInput = z
  .object({
    table_number: z.number().int().positive().max(999),
    capacity: z.number().int().min(1).max(30),
    status: z.enum(["Available", "Reserved", "Occupied"]),
  })
  .strict();
export const preferencesInput = z
  .object({
    dietary_preferences: z.array(text(50)).max(10),
    preferred_cuisines: z.array(text(50)).max(10),
    spice_level: z.enum(["Mild", "Medium", "High"]),
    allergens: z.array(text(50)).max(20),
  })
  .strict();
