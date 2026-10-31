# Saffron & Sage

**Smart Restaurant Ordering, Reservation and Management System**  
DBMS mini-project · Next.js + PostgreSQL + MongoDB · Entirely native and local

A complete restaurant application with customer ordering and reservations, a staff kitchen board, and a manager dashboard. PostgreSQL owns transactional data and all prices; MongoDB stores reviews, preferences and customization documents. The nine submitted relational entities and relationships are preserved. The original 13-page submission is retained in `docs/reference/original-submission.pdf` and its SQL in `database/sql/original-submission.sql`.

## Quick start

Use the following placeholders for your own checkout and tool locations:

- `<REPOSITORY_URL>`: the Git URL of your copy of this project.
- `<PROJECT_DIRECTORY>`: the directory containing this project's `package.json`.
- `<NODE_24_BIN_DIRECTORY>`: the `bin` directory for your Node.js 24 installation, if a PATH override is needed.

For a new checkout:

```bash
git clone "<REPOSITORY_URL>" restaurant-management
cd restaurant-management
npm install
npm run setup:local
npm run dev
```

For an already configured checkout, replace the placeholders before running:

```bash
cd "<PROJECT_DIRECTORY>"
export PATH="<NODE_24_BIN_DIRECTORY>:$PATH"
npm run db:start
npm run dev
```

Open **http://127.0.0.1:3000**. Use this exact origin for sign-in and mutations. The app and both databases bind to `127.0.0.1` only.

For production mode, stop the development server with Ctrl+C, then:

```bash
npm run build
npm start
```

`npm run db:stop` stops only this checkout's database processes. It preserves data. The app does not need to run with administrator/root privileges. Use Node.js 24 LTS. If several Node versions are installed, select Node 24 before running project commands.

## Demo accounts

The restaurant accepts orders and reservations **24 hours a day, 7 days a week**, including bookings crossing midnight. Booking dates and times use IST.

All seeded demo accounts use **`password@123`**. These are public local-demo credentials; passwords are still stored as salted hashes.

| Account | Email | Sign-in tab |
| --- | --- | --- |
| Customer | `customer1@gmail.com` | I'm a guest |
| Customer | `customer2@gmail.com` | I'm a guest |
| Customer | `customer3@gmail.com` | I'm a guest |
| Manager / administrator | `admin1@gmail.com` | Restaurant team |
| Chef | `chef1@gmail.com` | Restaurant team |
| Waiter | `waiter1@gmail.com` | Restaurant team |
| Cashier | `cashier1@gmail.com` | Restaurant team |

Additional local accounts can be normalized with `npm run demo:reset-logins`: customers become `customerN@gmail.com`, managers `adminN@gmail.com`, and staff use their role plus a number. The command sets `password@123`, preserves account IDs and restaurant history, and signs out old sessions. The complete local account list is written to `.data/demo-credentials.json`. New registrations continue to use the password chosen by the customer.


Passwords are scrypt hashes in PostgreSQL. The submission's plaintext example passwords are never used by the application. Original SQL is historical reference only.

## macOS installation

Copy or clone this repository **without** `.env`, `.data`, `.tools`, `node_modules`, `.next`, or `logs`. Each machine creates independent records and credentials. Never copy live database data directories between machines.

1. Install Git, Node.js **24 LTS**, PostgreSQL **17**, MongoDB Community **8**, and mongosh natively. No container software is needed.
2. Optionally run `bash scripts/install-native-macos.sh`. It uses Homebrew for Node/PostgreSQL/mongosh and the checksum-verified official MongoDB archive. It checks for existing binaries and does not upgrade unrelated databases. Any installer approval is handled by the operating system or package manager.
3. Select Node 24: `export PATH="$(brew --prefix node@24)/bin:$PATH"`.
4. In this repository run:

```bash
npm install
npm run setup:local
npm run dev
```

Initial package downloads require internet. Once installed, all application pages, scripts, images, fonts, databases and authentication work locally. No cloud accounts or external APIs are used.

## Windows installation (PowerShell)

Use PowerShell for the following examples. Replace installation-path placeholders with the directories used on your system. Platform verification coverage is documented in `docs/testing.md`.

1. Install Git for Windows, Node.js 24 LTS, PostgreSQL 17, MongoDB Community Server 8 and mongosh using the official installers. Links and a prerequisite audit are in `scripts/install-native-windows.ps1`.
2. Add the native binaries to your user PATH, for example:

```powershell
$env:Path = "<NODE_INSTALL_DIRECTORY>;<POSTGRESQL_BIN_DIRECTORY>;<MONGODB_BIN_DIRECTORY>;<MONGOSH_BIN_DIRECTORY>;" + $env:Path
node --version
npm --version
psql --version
mongod --version
mongosh --version
```

3. Use a short, user-writable folder such as `<PROJECT_DIRECTORY>`. On a fresh install, leave database services unstarted so setup can initialize its own clusters. Setup starts native processes without installing system services.
4. Run:

```powershell
npm install
npm run setup:local
npm run dev
```

If an existing service is already using a database port, setup leaves it untouched. See the existing-service configuration below. Closing Next.js does not delete or stop the databases. Use `npm run db:stop` to stop project-owned services.

## Environment and existing database services

Setup creates a permission-restricted `.env` with random PostgreSQL, MongoDB and session credentials. `.env.example` documents the variables. Never commit `.env` or `.data`.

- PostgreSQL: `restaurant_management`, port 5432, project login `restaurant_app`.
- MongoDB: `restaurant_management_nosql`, port 27017, authenticated `restaurant_app` with read/write access to this database only.
- Setup-only owners: `restaurant_owner`, with credentials in `.env`. The runtime uses the limited application credentials.
- Generated database files: `.data/postgres` and `.data/mongo`.
- Optional project-local MongoDB fallback: `.tools/mongodb/bin/mongod` when installed by the macOS prerequisite script.

For an existing PostgreSQL instance, provide an administrator URL as `PG_ADMIN_URL` in `.env`. Setup only creates the named project role/database if missing; it never resets existing role passwords. Supply a matching `DATABASE_URL` if that project role already exists.

For an existing MongoDB instance, set `MONGO_ADMIN_URL` for setup if administration is needed, or provide an already-working `MONGODB_URI` for the project database. Restrict the existing server's bind address to loopback yourself if it serves other applications. Setup does not change unrelated service configurations. A URI must use loopback; remote/cloud database URLs are rejected.

## Demonstration walkthrough

1. Open the menu. Search, filter by category or vegetarian dishes, and open a dish to see details/reviews and customize it.
2. Add **2 Paneer Tikka + 1 Veg Biryani + 2 Fresh Lime Soda**. The basket and server bill equal **₹880**. Customization options have no price surcharge in this project; each addition creates an independent order line.
3. Sign in as a customer and place a takeaway order. Refreshing or retrying the same checkout token does not create another order.
4. Open the order, print the bill, choose Cash/Card/UPI, and simulate payment. No real money moves and no card data is collected. Submit or edit an overall and per-dish review.
5. Book a table for a future time. A 19:00–20:30 reservation conflicts with 19:30–21:00 on that table; a booking starting at 20:30 is allowed. All booking times use **Asia/Kolkata**. Only future reservations can be customer-cancelled.
6. Sign in as a chef. Open kitchen tickets to see MongoDB instructions, prepare orders and mark them ready. A waiter marks them served; a cashier or manager closes paid, served orders.
7. Staff open **Reserve a table → Reservation schedule** and click **Assign table** on the arriving guest’s active reservation. One click checks the guest in and marks their reserved table occupied. The customer’s dining options refresh automatically (within 10 seconds, or immediately when returning to the tab). Click **Complete** after the table’s orders are closed to release it. Future reservations cannot be checked in early.
8. Open the administrator dashboard for real SQL revenue, methods, popular dishes and order statistics. Manage dishes, categories, staff, tables, reservations, orders and payment records. Referenced records are protected by foreign keys; use availability/deactivation where deleting history would be inappropriate.
9. Save dietary preferences, cuisines, spice level and allergens. These persist in MongoDB; they do not automatically guarantee an allergen-free meal.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run setup:local` | Detect/start project databases, provision credentials, migrate, initialize indexes, seed and verify |
| `npm run db:start` / `npm run db:stop` | Start/stop only project-owned native database processes |
| `npm run db:check` | Verify SQL/Mongo connectivity and core counts |
| `npm run db:seed` | Idempotent sample data; refreshes seeded demo logins and dish images |
| `npm run demo:reset-logins` | Normalize local application logins and set the public demo password |
| `npm run db:reconcile` | Retry pending MongoDB customization writes from the durable SQL outbox |
| `npm run dev` | Development Next.js server on loopback port 3000 |
| `npm run build` / `npm start` | Production build and loopback server |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint checks |
| `npm test` | 26 integration scenarios against a running server and both databases |
| `npm run test:e2e` | 7 browser scenarios and screenshots; first run `npx playwright install chromium` |
| `npm run test:recovery` | Stops only this checkout's MongoDB to verify durable outbox recovery |
| `node --import tsx tests/persistence.ts` | Restart only project-owned database services and compare persistent records |

Do not run stateful suites concurrently. Tests use clearly marked temporary records and clean up those records; the recovery/persistence tests require ownership of the project database processes.

## Documentation

- `docs/environment-setup.md`: detected tools, native installation, connectivity and process ownership.
- `docs/architecture.md`: request flow, SQL/NoSQL responsibilities, durable outbox, authentication.
- `docs/mongodb-schema.md`: document attributes, indexes and SQL reference validation.
- `docs/implementation-report.md`: final delivered scope, evidence and known verification limits.
- `docs/schema-changelog.md`: every change from the faculty submission.
- `docs/er-diagram.md`, `docs/relational-schema.md`, `docs/normalization.md`: final data design.
- `docs/database-queries.md`: all eight submitted queries and enhanced time availability.
- `docs/testing.md`: executed test evidence and verification limits.
- `docs/screenshots/`: desktop, mobile, reservations, bill, kitchen and administrator UI.

## Troubleshooting

- **Command not found:** select Node 24 and add PostgreSQL/MongoDB binaries to PATH. `scripts/services.ts` also searches standard Homebrew and Windows install folders.
- **Outdated Xcode tools:** the project provides a verified prebuilt MongoDB download; upgrading Xcode is not required to run it.
- **Port in use:** run `lsof -nP -iTCP:5432 -iTCP:27017 -iTCP:3000 -sTCP:LISTEN` on Mac, or `Get-NetTCPConnection -State Listen` on Windows. Configure existing services or stop only a process you own.
- **Sign-in or mutation returns 403:** use `http://127.0.0.1:3000`, matching `APP_ORIGIN`. Cross-origin mutations are blocked.
- **Too many sign-in attempts:** wait 15 minutes. Limits are persistent and per normalized email; do not clear unrelated login records.
- **Reservation conflict:** choose another table or time. Availability can change between searching and confirming.
- **MongoDB offline:** new orders still commit safely to SQL with customization instructions in an outbox. Tickets show pending state and preserve those instructions. Reviews/preferences return an actionable service error. Restart MongoDB and run `npm run db:reconcile`, refresh an order, or use the manager retry button.
- **Database startup fails:** inspect `logs/postgres.log` and `logs/mongo.log`. Long macOS socket paths are avoided with a short project-specific temporary socket directory.
- **Build or test changes:** restart the app after rebuilding. Do not delete `.data` to fix an application build issue.

No synchronization, shared databases, LAN binding, hosted authentication, cloud deployment or runtime internet assets are part of this project.
