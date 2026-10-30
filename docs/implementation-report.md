# Implementation report

Completed and verified on 30 October 2026, on this Apple Silicon Mac.

- **Application:** Customer registration/sign-in/logout, menu/category search and vegetarian filters, dish details and reviews, persistent editable basket, per-line customization, reservations/cancellation, order history/tracking, printable bills, simulated Cash/Card/UPI payments, review editing and preferences. Staff have a live kitchen board, line/order workflow, reservation schedule and table occupancy controls. Managers have menu/category/staff/table CRUD, reservations/orders/payments/reviews and SQL-backed charts.
- **Native prerequisites:** Node 24.22.2/npm, PostgreSQL 17.11, MongoDB Community 8.0.34 and mongosh 2.14.0 installed. MongoDB uses the checksum-verified official native archive because Homebrew's formula required newer Command Line Tools. The requested Next.js/TypeScript/Tailwind/Prisma/Mongoose/Zod packages are installed and locked. No container or cloud service was used.
- **Status:** Production Next.js at http://127.0.0.1:3000; PostgreSQL at 127.0.0.1:5432; authenticated MongoDB at 127.0.0.1:27017. Loopback-only listeners verified. Runtime uses project-specific credentials.
- **Database:** Nine core entities and original cardinalities retained. Added reservation duration/generated ranges/exclusion constraint, independent line IDs, staff credentials/activation, secure sessions, login throttling, checkout idempotency, display metadata and a durable customization outbox. Both named submitted trigger behaviors and all eight SQL queries execute. Details: schema-changelog.md.
- **Evidence:** 24 integration scenarios (25 Node test passes including the parent), six complete browser scenarios, real MongoDB outage/recovery, database restart persistence, production restart health, native mongosh connection, lint, TypeScript and production build all passed. Final npm audit: zero vulnerabilities. Logs and screenshots are retained in docs/.
- **Data:** Three demo customers, four staff accounts, twelve dishes, eight tables, eight orders, payments, a future reservation, reviews and preferences. Submitted seeded order total: ₹880. Temporary automated-test records cleaned up.
- **Portable source:** The source ZIP excludes credentials, runtime binaries, dependencies, database data, build files and transient logs. A new laptop independently installs prerequisites, runs npm install, npm run setup:local and npm run dev. README contains macOS and PowerShell instructions.
- **Verification limits:** Windows and physical second-laptop execution were not performed. Offline testing blocked all non-loopback browser requests; Wi-Fi was not physically disabled. Payments are simulated, and MongoDB retries are driven by order reads/CLI/manager actions rather than a separate daemon. These limitations are documented; there is no unresolved Mac setup or connectivity blocker.

## Launch again

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
# From the restaurant-management directory:
npm run db:start
npm start
```

Use npm run dev instead of npm start for development. Stop the app with Ctrl+C and the project-owned databases with npm run db:stop. Credentials are generated in .data/demo-credentials.json and are not included in source control or the ZIP.
