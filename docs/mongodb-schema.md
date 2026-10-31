# MongoDB document schemas

Database: `restaurant_management_nosql`. All schemas are implemented by Mongoose under `models/`. Setup creates collections and indexes explicitly after connecting; model initialization never silently pretends to persist a write while disconnected.

## reviews

- customer_id: required SQL Customer identifier, indexed.
- order_id: required SQL Orders identifier, unique; one review per order.
- rating: required integer 1–5 at the Zod/API boundary and numeric bounds in Mongoose.
- comment: required trimmed text, up to 2,000 characters.
- items_reviewed: nested `{item_id, rating}` records; ratings 1–5; item IDs must occur in that SQL order. Nested item IDs indexed for dish review lookups and average aggregation.
- created_at, updated_at: document timestamps.

The API validates SQL order ownership and completed payment before submission/editing. A customer can edit only their own review; duplicate POST is a conflict and PUT updates it. Public reads enrich names from SQL without exposing email/password/phone. Average per-dish ratings use an actual MongoDB unwind/group aggregation.

## order_customizations

- order_id: required SQL order identifier, indexed.
- order_item_id: required SQL line identifier, unique.
- item_id: required SQL menu identifier.
- customizations: `{size, remove[], add[], special_instruction}`.

The server validates bounded arrays and instruction length (500 characters), obtains IDs from newly created SQL lines, and writes a durable SQL outbox in the order transaction. No customer-provided order_item_id is accepted. Kitchen details join MongoDB documents to SQL lines by order_item_id. The SQL outbox provides fallback instructions during an outage; upserts make retries idempotent. Size is Regular or Large. Large costs 50% more than the SQL menu price, rounded to the nearest paise, and is captured in SQL order_item.unit_price at checkout. Other kitchen notes have no surcharge. Extra cheese and crust options are no longer offered; older order totals remain unchanged.

## customer_preferences

- customer_id: required SQL Customer identifier, unique.
- dietary_preferences: array of bounded strings.
- preferred_cuisines: array of bounded strings.
- spice_level: Mild, Medium or High (default Medium).
- allergens: array of bounded strings.

The authenticated customer ID is the upsert key. Clients cannot submit a different identity. Preferences are explicitly saved/updated/reloaded by the preferences UI; they do not imply automatic kitchen allergy guarantees.

## Consistency and operations

MongoDB has no cross-engine foreign keys or transactions with PostgreSQL. Service validation and unique indexes protect logical references; the outbox prevents losing transactional instructions. User account deletion is not exposed. Disposable automated test cleanup removes its own documents and SQL records together. Index definitions and mongosh demonstration queries are in `database/mongodb/`; `prisma/seed.ts` is the authoritative shared seed and uses actual SQL-generated IDs.
