import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import mongoose from "mongoose";
import { startServices } from "./services";
async function main() {
  const verifyOnly = process.argv.includes("--verify-existing");
  if (verifyOnly && !existsSync(".env"))
    throw Error("Verification-only mode requires an existing configured .env.");
  if (!existsSync(".env")) {
    const secret = () => randomBytes(32).toString("hex");
    const pw = secret(),
      owner = secret(),
      mongo = secret(),
      mowner = secret();
    writeFileSync(
      ".env",
      `DATABASE_URL=postgresql://restaurant_app:${pw}@127.0.0.1:5432/restaurant_management\nMONGODB_URI=mongodb://restaurant_app:${mongo}@127.0.0.1:27017/restaurant_management_nosql?authSource=restaurant_management_nosql\nSESSION_SECRET=${secret()}\nAPP_ORIGIN=http://127.0.0.1:3000\nPG_OWNER_PASSWORD=${owner}\nMONGO_ADMIN_PASSWORD=${mowner}\n`,
      { mode: 0o600 },
    );
    const { config } = await import("dotenv");
    config({ override: true, quiet: true });
  }
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw Error("Select Node.js 24 LTS before setup.");
  for (const key of [
    "DATABASE_URL",
    "MONGODB_URI",
    "PG_ADMIN_URL",
    "MONGO_ADMIN_URL",
  ]) {
    const value = process.env[key];
    if (
      value &&
      !["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)
    )
      throw Error(key + " must use a loopback host.");
  }
  if (
    !process.env.DATABASE_URL ||
    !process.env.MONGODB_URI ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
  )
    throw Error("Invalid .env configuration. Compare .env.example.");
  if (!verifyOnly) await startServices();
  if (verifyOnly) {
    const check = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await check.connect();
      await check.query("SELECT 1");
    } finally {
      await check.end();
    }
    const mc = mongoose.createConnection(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
    });
    try {
      await mc.asPromise();
      await mc.db!.admin().ping();
    } finally {
      await mc.close();
    }
  } else {
    const admin = new Client({
      connectionString:
        process.env.PG_ADMIN_URL ||
        `postgresql://restaurant_owner:${process.env.PG_OWNER_PASSWORD}@127.0.0.1:5432/postgres`,
    });
    try {
      await admin.connect();
    } catch {
      throw Error(
        "PostgreSQL administrator connection failed. For an existing server, set PG_ADMIN_URL in .env; your existing server is left untouched.",
      );
    }
    const u = new URL(process.env.DATABASE_URL),
      role = decodeURIComponent(u.username),
      pw = decodeURIComponent(u.password);
    if (role !== "restaurant_app" || u.pathname !== "/restaurant_management")
      throw Error(
        "Setup only creates the project-specific restaurant_app role and restaurant_management database.",
      );
    const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    if (
      !(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]))
        .rowCount
    )
      await admin.query(
        `CREATE ROLE restaurant_app LOGIN PASSWORD ${literal(pw)}`,
      );
    if (
      !(
        await admin.query(
          "SELECT 1 FROM pg_database WHERE datname='restaurant_management'",
        )
      ).rowCount
    )
      await admin.query(
        "CREATE DATABASE restaurant_management OWNER restaurant_app",
      );
    await admin.end();
    let mongoReady = false;
    const runtimeMongo = mongoose.createConnection(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
    });
    try {
      await runtimeMongo.asPromise();
      await runtimeMongo.db!.admin().ping();
      mongoReady = true;
    } catch {
      /* Provision only if this project's application credentials are not usable. */
    } finally {
      await runtimeMongo.close().catch(() => {});
    }
    if (!mongoReady) {
      // MongoDB's localhost exception bootstraps the first admin only on a fresh project instance.
      const adminUri =
        process.env.MONGO_ADMIN_URL ||
        `mongodb://restaurant_owner:${process.env.MONGO_ADMIN_PASSWORD}@127.0.0.1:27017/admin`;
      let mc = mongoose.createConnection(adminUri, {
        serverSelectionTimeoutMS: 3000,
      });
      try {
        await mc.asPromise();
      } catch {
        await mc.close().catch(() => {});
        mc = mongoose.createConnection("mongodb://127.0.0.1:27017/admin", {
          serverSelectionTimeoutMS: 3000,
        });
        await mc.asPromise();
        try {
          await mc.db!.command({
            createUser: "restaurant_owner",
            pwd: process.env.MONGO_ADMIN_PASSWORD,
            roles: [{ role: "root", db: "admin" }],
          });
        } catch {
          throw Error(
            "MongoDB admin access failed. An existing MongoDB instance needs a project database user; configure MONGODB_URI and admin credentials without resetting data.",
          );
        }
        await mc.close();
        mc = mongoose.createConnection(adminUri);
        await mc.asPromise();
      }
      const db = mc.useDb("restaurant_management_nosql");
      const m = new URL(process.env.MONGODB_URI);
      const users = await db.db!.command({ usersInfo: "restaurant_app" });
      if (!users.users.length)
        await db.db!.command({
          createUser: "restaurant_app",
          pwd: decodeURIComponent(m.password),
          roles: [{ role: "readWrite", db: "restaurant_management_nosql" }],
        });
      await mc.close();
    }
  }
  const cli = (args: string[]) => {
    const r = spawnSync(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
    });
    if (r.status !== 0) throw Error(`Command failed: ${args.join(" ")}`);
  };
  cli(["node_modules/prisma/build/index.js", "generate"]);
  cli(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  cli(["--import", "tsx", "prisma/seed.ts"]);
  cli(["--import", "tsx", "scripts/check.ts"]);
  console.log(
    "Setup verified. Run npm run dev. Demo credentials are listed in README.md.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
