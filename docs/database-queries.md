# Submitted SQL queries and triggers

`database/sql/queries.sql` contains all eight original queries, executable after enhanced seeding. Demo customer/order IDs are 1 in a fresh installation; queries 2 and 3 should use the intended IDs if applied to an existing database. The integration log records actual result sets for all eight.

| # | Query | Application feature |
| --- | --- | --- |
| 1 | Menu_Item JOIN Category | Full category-aware menu and management list |
| 2 | Customer JOIN Orders for customer ID | Session-scoped customer order history |
| 3 | Orders JOIN Order_Item JOIN Menu_Item | Bill, line quantities, historical prices and subtotal |
| 4 | Five most popular non-cancelled dishes by SUM(quantity) | Administrator popularity chart |
| 5 | SUM(amount) for completed payments | Completed revenue metric |
| 6 | Available tables with capacity >= 4 | Booking search, extended with date/time overlap filtering |
| 7 | Placed/Preparing orders joined to customers | Incoming and preparing kitchen board |
| 8 | Completed payment SUM grouped by payment method | Cash/Card/UPI report |

The reports in the manager UI use actual PostgreSQL `$queryRaw` queries in the API. Other screens use equivalent Prisma relational queries, with session ownership replacing user-supplied customer identifiers. No chart values are fabricated.

Time-aware table search uses a parameterized query with capacity and current physical status plus NOT EXISTS of confirmed overlapping reservation ranges. It uses the same half-open interval definition as the exclusion constraint. Search is informative; the write-side constraint decides availability at commit time.

## Trigger definitions and execution evidence

Original triggers: `database/sql/original-triggers.sql`. Enhanced trigger functions and constraints: `prisma/migrations/202610300001_initial/migration.sql`; reference mirror: `database/sql/triggers.sql`.

- `trg_update_order_total` calls `update_order_total()` after each line INSERT/UPDATE/DELETE. The enhanced function changes the stored total by the generated subtotal delta while a guard locks the parent. Unit prices and line parent identity are immutable. Tests insert the submitted bill (880), change Paneer quantity from 2 to 3 (1100), and delete both lime sodas (940), then roll back temporary data.
- `trg_check_reservation_conflict` calls `check_reservation_conflict()` before INSERT/UPDATE. It checks capacity and confirmed interval overlap. A partial GiST exclusion constraint ensures the same invariant during races. Tests run two concurrent 19:00/19:30 bookings for one table: one succeeds, one returns HTTP 409; direct overlapping SQL and oversized parties are rejected. An adjacent booking is accepted.
- Additional guards freeze settled line amounts and verify payment amount against the locked order total.

Evidence: `docs/integration-test.log`. The outage log demonstrates that actual instructions remain retrievable while the native MongoDB process is stopped, then synchronize once after restart. MongoDB query examples and indexes are in `database/mongodb/`; the executable shared seed is `prisma/seed.ts` so SQL reference IDs are always correct.
