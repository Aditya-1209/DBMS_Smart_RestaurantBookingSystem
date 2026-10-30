# Environment audit and local setup

Verified on **30 October 2026 (IST)**.

## Initial machine state

- macOS/Darwin 27.0.0, Apple Silicon arm64, zsh.
- Workspace: ChatGPT project local mirror; existing unrelated coursework was inspected and left untouched. The restaurant project was created in its own `restaurant-management` directory. Synced `sources/` files were not modified.
- Homebrew under `/opt/homebrew`; Apple Git 2.54.0 available. No existing restaurant repository/package.json/dependencies found.
- Node/npm, PostgreSQL/psql, MongoDB/mongod/mongosh were absent from shell PATH. A bundled Node 24.22.1 was discovered but the project installs native prerequisites for normal Terminal use.
- Nothing listening on ports 3000, 5432, or 27017. Existing unrelated Homebrew services were not started/stopped or reconfigured.

## Installed and used

| Tool | Verified version / location |
| --- | --- |
| Node.js application runtime | 24.22.2, `/opt/homebrew/opt/node@24/bin/node` |
| npm | 11.19.1 with Node 24 |
| PostgreSQL / psql | 17.11, `/opt/homebrew/opt/postgresql@17/bin` |
| MongoDB Community Server | 8.0.34 arm64, project `.tools/mongodb/bin/mongod` |
| mongosh | 2.14.0, Homebrew prebuilt bottle |
| Next.js | 16.4.3 |
| React / React DOM | 19.3.1 |
| TypeScript | 5.9.3 |
| Prisma client / CLI | 6.19.0 |
| Mongoose / MongoDB driver | 8.24.7 / 6.20.0 |
| Tailwind / PostCSS plugin | 4.3.3 |
| Zod | 4.6.7 |
| Playwright | 1.64.1, downloaded native Chromium test browser |

Versions are locked in package-lock.json. Node 24 satisfies the selected Next.js and Prisma requirements. Installing mongosh brought Node 26.13.0 as a Homebrew dependency and made it the default `node`; explicitly put Node 24 first in PATH as shown in README.md. `.nvmrc` and `.node-version` record 24.

Two dependency advisories in Prisma's config dependency tree were fixed with tested overrides for deepmerge-ts 8.0.2 and Effect >=3.20 <4. The subsequent npm install/audit reported zero vulnerabilities. The Prisma version was retained for its straightforward PostgreSQL migration integration; an unrelated major-version migration was unnecessary.

## Native installation details

Homebrew installed Node 24 and PostgreSQL 17 from native bottles. The MongoDB server formula could not finish because the Mac's Command Line Tools are older than the formula requires. Instead, the official prebuilt archive `mongodb-macos-arm64-8.0.34.tgz` was downloaded from fastdl.mongodb.org, verified against the official MongoDB formula SHA-256 **3255cbf2e70cc5de04220046e006067d20068656d1bfa674828768a51d20d5a6**, and extracted into `.tools/mongodb`. This is a native binary, not a container.

Homebrew's whole-tap trust was rejected by automatic approval review. Only the specific official server and required database-tools formulas were trusted; the whole tap was not trusted. No developer-tools reinstall was attempted. An incidental `brew cat` inspection enabled Homebrew developer mode; this was reversed during final cleanup.

## Project-specific services and credentials

`setup:local` initializes a separate PostgreSQL cluster in `.data/postgres` and a MongoDB database path in `.data/mongo`. PostgreSQL host authentication uses SCRAM-SHA-256. MongoDB starts with `--auth`. Both bind only `127.0.0.1`. The project does not use the unrelated Homebrew default PostgreSQL cluster or install login/startup services.

Database names are `restaurant_management` and `restaurant_management_nosql`. Each engine has its own generated `restaurant_app` credential in `.env`. MongoDB grants readWrite only to its project database. Setup credentials for the project-owned servers remain local and ignored by Git. Opaque session signing/HMAC material is generated independently. File mode is 0600 on macOS; Windows relies on the user's filesystem permissions.

The deep project path exceeded PostgreSQL's Unix socket pathname limit during the first startup. Services now use a short checkout-specific socket directory in `/private/tmp`; TCP remains loopback port 5432. A second migration fixes restaurant civil time to Asia/Kolkata on every laptop.

## Verification and operations

Actual successful PostgreSQL SELECT, MongoDB ping, migration and seed results are saved in setup-verification.log. The sample bill is 880, with three customers, twelve dishes and eight sample orders. `lsof` verifies native listeners only on 127.0.0.1:5432 and 127.0.0.1:27017. JSON `/api/health` verifies both live connections.

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run db:start
npm run db:check
npm run dev
# Stop Next.js with Ctrl+C; stop the owned databases without deleting files:
npm run db:stop
```

Setup's `--verify-existing` mode refuses to start services or provision accounts, and uses existing runtime credentials for connectivity before migration/seed/check commands. This mode was used for final setup verification after automatic review rejected rerunning account provisioning. Native outage and persistence tests stop/restart only verified project-owned processes; their logs are retained.

No unresolved prerequisite or connectivity blocker remains on this Mac. Windows execution and a physical second-laptop install were not available; native PowerShell instructions and portable setup/service code are provided. Application offline asset independence is tested by blocking all non-loopback browser requests; the operating system's Wi-Fi connection was not disabled.
