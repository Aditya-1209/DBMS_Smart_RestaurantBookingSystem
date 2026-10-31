# Changes from the original faculty submission

The exact nine core entities and original foreign-key cardinalities are preserved. PostgreSQL folds the PDF's unquoted mixed-case identifiers to lowercase; Prisma models use `@@map` to those same names. `database/sql/original-submission.sql` and `original-triggers.sql` preserve the baseline separately. Never apply the original DDL over an initialized application database.

| Original design | Enhanced design | Reason and ER / relational impact |
| --- | --- | --- |
| Customer.password contains plaintext sample strings | Same VARCHAR(255) column stores salted scrypt hashes | No attribute/cardinality change. The original examples remain solely in historical reference material and are never seeded. |
| Staff has no credentials | Add password VARCHAR(255), active BOOLEAN | Supports authenticated staff and immediate deactivation. The submitted Manager role maps to application administrator; no new Admin core entity or role replaces the submitted roles. |
| No sessions | Add Session(token_hash PK, customer_id FK nullable, staff_id FK nullable, expires_at), with exactly one principal | Two optional support relationships to customer/staff, both 1:M. Opaque sessions can be invalidated locally. |
| No login throttle | Add Login_Attempt(key PK, count, window_start) | Hashed email key; no new core relationship. Atomic local brute-force control. |
| Reservation has only date/time | Add duration_minutes (30–240, default 90) and generated starts_at/ends_at | Keeps original date/time and table/customer foreign keys. ER cardinalities unchanged. Handles booking intervals and cross-midnight direct SQL intervals. Bookings are accepted 24/7, including intervals crossing midnight. |
| Trigger checks equal date/time only | Same named trigger checks overlapping intervals and capacity; add partial GiST exclusion constraint | Concurrency-safe invariant for confirmed bookings, including concurrent transactions. Cancelled/completed bookings do not block. Adjacent intervals allowed. |
| Order_Item PK(order_id,item_id) | Add order_item_id SERIAL PK; retain both original FKs with indexes; permit duplicate dish/order combinations | An order may contain differently customized instances of the same dish. M:N still resolves through Order_Item; no unique(order_id,item_id) remains. MongoDB keys instructions by line ID. |
| Order_Item only has quantities and prices | Add per-line status Placed/Preparing/Ready/Served | Supports kitchen line workflow; no relationship changes. Historical unit_price and line identity are immutable. |
| No checkout retry identity | Orders.idempotency_key UNIQUE nullable | Prevents duplicate browser checkout retries. No relationship change. Seed orders use stable non-UUID keys internally; customer APIs require UUIDs. |
| Order total trigger re-sums rows after mutation | Preserve names trg_update_order_total / update_order_total; apply atomic subtotal delta after INSERT/UPDATE/DELETE, with a parent-lock guard | Prevents lost totals under concurrency; generated subtotal is preserved. UPDATE quantity changes by the difference; immutable order_id removes the old-parent update edge case. |
| Payment one-to-one, amount manually supplied | Preserve UNIQUE(order_id); add verification trigger and service parent lock | Prevents duplicate concurrent payment and mismatched bill amounts. Completed payment immutable. Cardinalities unchanged. |
| Menu_Item has no display metadata | Add image (local path) and vegetarian BOOLEAN | Supports local imagery and vegetarian filtering; no relationship change. Prices remain original numeric values. |
| Optional defaults could permit explicit NULL statuses/dates | Strengthen NOT NULL on defaulted state/date/time fields; bound quantities/capacities/durations and normalized emails | Removes ambiguous NULL states. Original FK deletion rules retained. Table/line bounds support form validation. |
| No cross-engine delivery mechanism | Add Outbox(id PK, order_id FK UNIQUE, payload JSONB, processed_at, attempts, created_at) | Support relationship Orders 1:0..1 Outbox. Transactional temporary copy preserves instructions until MongoDB owns its synchronized document. |
| FK columns mostly unindexed | Add indexes on category, customer, line/order/dish, order state, payment state, session expiry | Improves joins and dashboards; no logical schema/cardinality changes. |
| DATE/TIME defaults use laptop timezone | Second migration fixes the project database timezone to Asia/Kolkata | No new columns. Consistent original date/time semantics on Mac and Windows. |

The original one-to-one Orders–Payment design, menu seed prices, generated line subtotal, nullable order table/staff assignments, and FK deletion policies remain. The final database includes **nine core and three support tables**, plus Prisma's migration metadata table. The ER diagram and relational-schema document include support entities separately.

Strictly, stored subtotal/total and generated reservation boundaries are controlled derived values, not independent normalized facts. See normalization.md for the distinction between the normalized logical design and these original/enhanced physical materializations.

## Demo configuration update

The restaurant now accepts bookings 24/7. The future-date, duration, capacity and exclusion-constraint checks remain; intervals may span midnight. No schema change is required.

The executable seed uses numbered demo emails and the public demo password `password@123`. `npm run demo:reset-logins` can normalize every existing local customer/staff account by ID, update salted password hashes, and revoke existing sessions without changing orders, reservations, or MongoDB references. The historical PDF and original SQL remain unchanged. Database connection passwords and session secrets stay independently generated in `.env`.

Palak paneer, dal makhani, mango kulfi, tandoori mushrooms and vegetable biryani now have separate local photographs. Seeding refreshes their image paths so existing installations receive the new assets.
