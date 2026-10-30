# Final relational schema

PK = primary key; UQ = unique; FK = foreign key; ? = nullable; G = generated. Physical PostgreSQL names are lowercase.

| Relation | Attributes |
| --- | --- |
| CUSTOMER | customer_id PK, name, email UQ, phone UQ, password (scrypt hash), created_at |
| STAFF | staff_id PK, name, email UQ, phone UQ, role, password (scrypt hash), active |
| RESTAURANT_TABLE | table_id PK, table_number UQ, capacity, status |
| CATEGORY | category_id PK, category_name UQ |
| MENU_ITEM | item_id PK, category_id FK, item_name, description?, price, availability, image, vegetarian |
| RESERVATION | reservation_id PK, customer_id FK, table_id FK, reservation_date, reservation_time, guest_count, status, duration_minutes, starts_at G, ends_at G |
| ORDERS | order_id PK, customer_id FK, table_id FK?, staff_id FK?, order_date, order_time, status, total_amount, idempotency_key UQ? |
| ORDER_ITEM | order_item_id PK, order_id FK, item_id FK, quantity, unit_price, subtotal G, status |
| PAYMENT | payment_id PK, order_id FK UQ, amount, payment_method, payment_status, payment_time |
| SESSION | token_hash PK, customer_id FK?, staff_id FK?, expires_at; exactly one principal |
| OUTBOX | id PK, order_id FK UQ, payload JSONB, processed_at?, attempts, created_at |
| LOGIN_ATTEMPT | key PK, count, window_start |

## Foreign keys and deletion rules

Reservation.customer_id → Customer ON DELETE CASCADE; Reservation.table_id → Restaurant_Table RESTRICT. Menu_Item.category_id → Category RESTRICT. Orders.customer_id → Customer RESTRICT; Orders.table_id → Restaurant_Table SET NULL; Orders.staff_id → Staff SET NULL. Order_Item.order_id → Orders CASCADE; Order_Item.item_id → Menu_Item RESTRICT. Payment.order_id → Orders CASCADE. Session principal foreign keys CASCADE. Outbox.order_id → Orders CASCADE. Extra guards prevent changing paid order lines and completed payments.

## States and physical constraints

Staff roles: Manager, Waiter, Chef, Cashier. Physical tables: Available, Reserved, Occupied. Reservations: Confirmed, Cancelled, Completed. Orders: Placed, Preparing, Ready, Served, Completed, Cancelled. Lines: Placed, Preparing, Ready, Served. Payment methods: Cash, Card, UPI; statuses: Pending, Completed, Failed.

Prices, subtotals, totals and payment amounts are DECIMAL(10,2). Quantity is 1–99; capacity 1–30; reservation duration 30–240 minutes; guest count positive and checked against table capacity by trigger. Original date/time columns are DATE/TIME, not UTC instants. Booking starts_at/ends_at are generated timestamp-without-timezone civil values. Session/outbox timestamps use timestamptz.

A GiST exclusion constraint protects confirmed reservation ranges for the same table. Ordinary unique constraints protect contact fields, category names, table numbers, idempotency tokens and payment order IDs. Non-null/default constraints and FK/status indexes are in the migration. See database/sql/schema.sql for executable physical DDL including both migrations; do not apply schema.sql in addition to Prisma migrations.
