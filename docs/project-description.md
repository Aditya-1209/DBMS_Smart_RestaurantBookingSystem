# Project description

PES University DBMS mini-project: **Smart Restaurant Ordering, Reservation and Management System**, presented as the restaurant **Saffron & Sage**.

The problem is to coordinate customers, kitchen staff, bookings, orders and bills while protecting transaction integrity. Customers browse categories, customize independent order lines, book tables, pay simulated bills and review purchased dishes. The staff kitchen board tracks incoming, preparing, ready and served orders. Managers maintain restaurant records and view reports computed from stored payments and order items.

The application is a single Next.js App Router project with TypeScript, React and Tailwind CSS. Prisma accesses native PostgreSQL; Mongoose accesses native MongoDB Community Server. Zod validates requests. Local scrypt credentials and database-backed opaque sessions provide authentication without OAuth or hosted identity. Git tracks source and evidence; local credentials, database files and installed binaries are ignored.

The original submission is authoritative reference material, not a script to run against the enhanced database. Its core entities, foreign keys and one-to-one order/payment relationship remain. Necessary changes are itemized in schema-changelog.md. The original sample menu prices and ₹880 bill remain reproducible.

This is a university demonstration: payment methods simulate a successful payment and collect no real payment credentials. SQL menu prices are Regular prices. Large portions cost 50% more, rounded to the nearest paise; the server records the selected portion price in the immutable SQL order line. Kitchen notes are included. Tax and service charges are zero. Staff set physical table occupancy; future reservations do not permanently change a table's current status. The restaurant's civil timezone is Asia/Kolkata on every laptop.
