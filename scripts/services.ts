import "dotenv/config";
import { spawnSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
export const root = process.cwd();
export const data = path.join(root, ".data");
export function binary(name: string) {
  const result = spawnSync(
    process.platform === "win32" ? "where" : "which",
    [name],
    { encoding: "utf8" },
  );
  if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0];
  const candidates = [
    path.join(root, ".tools/mongodb/bin", name),
    `/opt/homebrew/opt/postgresql@17/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/opt/postgresql@17/bin/${name}`,
    `/usr/local/bin/${name}`,
  ];
  if (process.platform === "win32")
    for (const v of ["18", "17", "16"])
      candidates.push(`C:\\Program Files\\PostgreSQL\\${v}\\bin\\${name}.exe`);
  if (process.platform === "win32")
    for (const v of ["8.0", "8.2"])
      candidates.push(
        `C:\\Program Files\\MongoDB\\Server\\${v}\\bin\\${name}.exe`,
      );
  const found = candidates.find(existsSync);
  if (!found)
    throw Error(
      `Missing ${name}. Install native PostgreSQL 17 and MongoDB Community 8, then add their bin folders to PATH.`,
    );
  return found;
}
export async function listening(port: number) {
  return new Promise<boolean>((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.setTimeout(700);
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
    s.once("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}
function run(name: string, args: string[]) {
  const r = spawnSync(binary(name), args, { encoding: "utf8" });
  if (r.status !== 0) throw Error(`${name}: ${r.stderr || r.stdout}`);
}
export async function startServices() {
  mkdirSync(data, { recursive: true });
  mkdirSync(path.join(root, "logs"), { recursive: true });
  if (!(await listening(5432))) {
    if (!existsSync(path.join(data, "postgres", "PG_VERSION"))) {
      if (!process.env.PG_OWNER_PASSWORD)
        throw Error("Run npm run setup:local to create project credentials.");
      const pw = path.join(data, "init-password");
      writeFileSync(pw, process.env.PG_OWNER_PASSWORD, { mode: 0o600 });
      try {
        run("initdb", [
          "-D",
          path.join(data, "postgres"),
          "-U",
          "restaurant_owner",
          "--encoding=UTF8",
          "--locale=C",
          "--auth-local=trust",
          "--auth-host=scram-sha-256",
          `--pwfile=${pw}`,
        ]);
      } finally {
        unlinkSync(pw);
      }
    }
    // Only project-owned clusters are started. Never modify another PostgreSQL installation.
    const socket = path.join(
      process.platform === "darwin" ? "/private/tmp" : tmpdir(),
      "saffron-pg-" +
        createHash("sha256").update(root).digest("hex").slice(0, 8),
    );
    mkdirSync(socket, { recursive: true });
    const options = `-h 127.0.0.1 -p 5432${process.platform === "win32" ? "" : ` -k "${socket}"`}`;
    run("pg_ctl", [
      "-D",
      path.join(data, "postgres"),
      "-l",
      path.join(root, "logs/postgres.log"),
      "-o",
      options,
      "-w",
      "start",
    ]);
  }
  if (!(await listening(27017))) {
    mkdirSync(path.join(data, "mongo"), { recursive: true });
    const args = [
      "--dbpath",
      path.join(data, "mongo"),
      "--bind_ip",
      "127.0.0.1",
      "--port",
      "27017",
      "--auth",
      "--logpath",
      path.join(root, "logs/mongo.log"),
      "--logappend",
    ];
    if (process.platform !== "win32") run("mongod", [...args, "--fork"]);
    else {
      const p = spawn(binary("mongod"), args, {
        detached: true,
        stdio: "ignore",
      });
      p.unref();
      if (p.pid) writeFileSync(path.join(data, "mongo.pid"), String(p.pid));
    }
  }
  for (let i = 0; i < 30; i++) {
    if ((await listening(5432)) && (await listening(27017))) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Database startup timed out; inspect logs/.");
}
export async function stopServices() {
  if (existsSync(path.join(data, "postgres/postmaster.pid")))
    run("pg_ctl", [
      "-D",
      path.join(data, "postgres"),
      "-m",
      "fast",
      "-w",
      "stop",
    ]);
  // MongoDB shutdown is sent with this project's admin credential after verifying its dbPath.
  if ((await listening(27017)) && process.env.MONGO_ADMIN_PASSWORD) {
    const { MongoClient } = await import("mongodb");
    const c = new MongoClient(
      `mongodb://restaurant_owner:${process.env.MONGO_ADMIN_PASSWORD}@127.0.0.1:27017/admin`,
    );
    try {
      await c.connect();
      const opts = await c.db("admin").command({ getCmdLineOpts: 1 });
      if (path.resolve(opts.parsed.storage.dbPath) !== path.join(data, "mongo"))
        throw Error(
          "Refusing to stop a MongoDB server not owned by this project.",
        );
      try {
        await c.db("admin").command({ shutdown: 1 });
      } catch (e) {
        if (!(e instanceof Error) || !e.message.includes("closed")) throw e;
      }
    } finally {
      await c.close();
    }
  }
}
if (process.argv[1]?.endsWith("services.ts"))
  (process.argv[2] === "stop" ? stopServices() : startServices())
    .then(() =>
      console.log(
        "Project database services " +
          (process.argv[2] || "start") +
          " complete.",
      ),
    )
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
