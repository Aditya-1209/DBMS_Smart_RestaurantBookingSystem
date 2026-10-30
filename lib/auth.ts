import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
const scrypt = promisify(scryptCb);
export type Actor = {
  id: number;
  name: string;
  email: string;
  role: "customer" | "staff" | "admin";
  staffRole?: string;
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = (await scrypt(password, salt, 64)) as Buffer;
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function digest(token: string) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw Error("SESSION_SECRET must contain at least 32 characters");
  return createHmac("sha256", process.env.SESSION_SECRET)
    .update(token)
    .digest("hex");
}
export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get("saffron_session")?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token_hash: digest(token) },
    include: { customer: true, staff: true },
  });
  if (!session || session.expires_at < new Date()) return null;
  if (session.customer)
    return {
      id: session.customer.customer_id,
      name: session.customer.name,
      email: session.customer.email,
      role: "customer",
    };
  if (session.staff?.active)
    return {
      id: session.staff.staff_id,
      name: session.staff.name,
      email: session.staff.email,
      role: session.staff.role === "Manager" ? "admin" : "staff",
      staffRole: session.staff.role,
    };
  return null;
}
export async function requireActor(roles?: Actor["role"][]) {
  const a = await currentActor();
  if (!a) throw new HttpError(401, "Please sign in to continue.");
  if (roles && !roles.includes(a.role))
    throw new HttpError(403, "You do not have access to this action.");
  return a;
}
export async function createSession(id: number, staff: boolean) {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      token_hash: digest(token),
      [staff ? "staff_id" : "customer_id"]: id,
      expires_at: new Date(Date.now() + 8 * 3600000),
    },
  });
  (await cookies()).set("saffron_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.APP_ORIGIN?.startsWith("https:") || false,
    path: "/",
    maxAge: 8 * 3600,
  });
}
export async function logout() {
  const c = await cookies();
  const token = c.get("saffron_session")?.value;
  if (token)
    await prisma.session.deleteMany({ where: { token_hash: digest(token) } });
  c.delete("saffron_session");
}
export async function checkLoginRate(email: string) {
  const key = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(email)
    .digest("hex");
  const rows = await prisma.$queryRaw<
    { count: number }[]
  >`INSERT INTO login_attempt(key,count,window_start) VALUES(${key},1,NOW()) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempt.window_start<NOW()-INTERVAL '15 minutes' THEN 1 ELSE login_attempt.count+1 END,window_start=CASE WHEN login_attempt.window_start<NOW()-INTERVAL '15 minutes' THEN NOW() ELSE login_attempt.window_start END RETURNING count`;
  if (rows[0].count > 10)
    throw new HttpError(
      429,
      "Too many sign-in attempts. Try again in 15 minutes.",
    );
}
