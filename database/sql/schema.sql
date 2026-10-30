CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE customer (
 customer_id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
 email VARCHAR(150) UNIQUE NOT NULL CHECK(email=lower(email)), phone VARCHAR(15) UNIQUE NOT NULL,
 password VARCHAR(255) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE staff (
 staff_id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL CHECK(email=lower(email)),
 phone VARCHAR(15) UNIQUE NOT NULL, role VARCHAR(30) NOT NULL CHECK(role IN ('Manager','Waiter','Chef','Cashier')),
 password VARCHAR(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE restaurant_table (
 table_id SERIAL PRIMARY KEY, table_number INT UNIQUE NOT NULL CHECK(table_number>0), capacity INT NOT NULL CHECK(capacity BETWEEN 1 AND 30),
 status VARCHAR(20) NOT NULL DEFAULT 'Available' CHECK(status IN ('Available','Reserved','Occupied'))
);
CREATE TABLE category (category_id SERIAL PRIMARY KEY, category_name VARCHAR(50) UNIQUE NOT NULL);
CREATE TABLE menu_item (
 item_id SERIAL PRIMARY KEY, category_id INT NOT NULL REFERENCES category ON DELETE RESTRICT,
 item_name VARCHAR(100) NOT NULL, description TEXT, price DECIMAL(10,2) NOT NULL CHECK(price>=0),
 availability BOOLEAN NOT NULL DEFAULT TRUE, image TEXT NOT NULL DEFAULT '/images/paneer.svg', vegetarian BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE reservation (
 reservation_id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES customer ON DELETE CASCADE,
 table_id INT NOT NULL REFERENCES restaurant_table ON DELETE RESTRICT,
 reservation_date DATE NOT NULL, reservation_time TIME NOT NULL, guest_count INT NOT NULL CHECK(guest_count>0),
 status VARCHAR(20) NOT NULL DEFAULT 'Confirmed' CHECK(status IN ('Confirmed','Cancelled','Completed')),
 duration_minutes INT NOT NULL DEFAULT 90 CHECK(duration_minutes BETWEEN 30 AND 240),
 starts_at TIMESTAMP GENERATED ALWAYS AS (reservation_date+reservation_time) STORED,
 ends_at TIMESTAMP GENERATED ALWAYS AS (reservation_date+reservation_time+duration_minutes*INTERVAL '1 minute') STORED,
 CONSTRAINT reservation_no_overlap EXCLUDE USING gist
 (table_id WITH =, tsrange(starts_at, ends_at, '[)') WITH &&) WHERE(status='Confirmed')
);
CREATE TABLE orders (
 order_id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES customer ON DELETE RESTRICT,
 table_id INT REFERENCES restaurant_table ON DELETE SET NULL, staff_id INT REFERENCES staff ON DELETE SET NULL,
 order_date DATE NOT NULL DEFAULT CURRENT_DATE, order_time TIME NOT NULL DEFAULT CURRENT_TIME,
 status VARCHAR(20) NOT NULL DEFAULT 'Placed' CHECK(status IN ('Placed','Preparing','Ready','Served','Completed','Cancelled')),
 total_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK(total_amount>=0), idempotency_key VARCHAR(100) UNIQUE
);
CREATE TABLE order_item (
 order_item_id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES orders ON DELETE CASCADE,
 item_id INT NOT NULL REFERENCES menu_item ON DELETE RESTRICT, quantity INT NOT NULL CHECK(quantity BETWEEN 1 AND 99),
 unit_price DECIMAL(10,2) NOT NULL CHECK(unit_price>=0), subtotal DECIMAL(10,2) GENERATED ALWAYS AS(quantity*unit_price) STORED,
 status VARCHAR(20) NOT NULL DEFAULT 'Placed' CHECK(status IN('Placed','Preparing','Ready','Served'))
);
CREATE TABLE payment (
 payment_id SERIAL PRIMARY KEY, order_id INT UNIQUE NOT NULL REFERENCES orders ON DELETE CASCADE,
 amount DECIMAL(10,2) NOT NULL CHECK(amount>=0), payment_method VARCHAR(20) NOT NULL CHECK(payment_method IN('Cash','Card','UPI')),
 payment_status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK(payment_status IN('Pending','Completed','Failed')),
 payment_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE session (
 token_hash TEXT PRIMARY KEY, customer_id INT REFERENCES customer ON DELETE CASCADE, staff_id INT REFERENCES staff ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, CHECK((customer_id IS NULL) <> (staff_id IS NULL))
);
CREATE TABLE outbox (
 id SERIAL PRIMARY KEY, order_id INT UNIQUE NOT NULL REFERENCES orders ON DELETE CASCADE, payload JSONB NOT NULL,
 processed_at TIMESTAMPTZ, attempts INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE login_attempt (key TEXT PRIMARY KEY, count INT NOT NULL DEFAULT 0, window_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX menu_category_idx ON menu_item(category_id);
CREATE INDEX reservation_customer_idx ON reservation(customer_id);
CREATE INDEX orders_customer_idx ON orders(customer_id);
CREATE INDEX orders_status_idx ON orders(status);
CREATE INDEX line_order_idx ON order_item(order_id);
CREATE INDEX line_item_idx ON order_item(item_id);
CREATE INDEX payment_status_idx ON payment(payment_status);
CREATE INDEX session_expiry_idx ON session(expires_at);

-- Lock the parent before any line mutation; reject modifications to paid bills.
CREATE FUNCTION guard_order_item() RETURNS TRIGGER AS $$
DECLARE oid INT; s TEXT;
BEGIN
 oid := CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
 SELECT status INTO s FROM orders WHERE order_id=oid FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.order_id<>OLD.order_id OR NEW.item_id<>OLD.item_id OR NEW.unit_price<>OLD.unit_price) THEN
  RAISE EXCEPTION 'Historical price and line identity are immutable';
 END IF;
 IF TG_OP<>'UPDATE' OR NEW.quantity<>OLD.quantity THEN
  IF s IN ('Completed','Cancelled') OR EXISTS(SELECT 1 FROM payment WHERE order_id=oid AND payment_status='Completed') THEN
   RAISE EXCEPTION 'A settled or closed bill cannot be changed';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_guard_order_item BEFORE INSERT OR UPDATE OR DELETE ON order_item FOR EACH ROW EXECUTE FUNCTION guard_order_item();

CREATE FUNCTION update_order_total() RETURNS TRIGGER AS $$
BEGIN
 -- Atomic delta update prevents lost totals under concurrent line writes.
 IF TG_OP='DELETE' THEN
  UPDATE orders SET total_amount=total_amount-OLD.subtotal WHERE order_id=OLD.order_id;
  RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  UPDATE orders SET total_amount=total_amount+NEW.subtotal WHERE order_id=NEW.order_id;
 ELSE
  UPDATE orders SET total_amount=total_amount+NEW.subtotal-OLD.subtotal WHERE order_id=NEW.order_id;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_update_order_total AFTER INSERT OR UPDATE OR DELETE ON order_item FOR EACH ROW EXECUTE FUNCTION update_order_total();

CREATE FUNCTION check_reservation_conflict() RETURNS TRIGGER AS $$
DECLARE cap INT;
BEGIN
 SELECT capacity INTO cap FROM restaurant_table WHERE table_id=NEW.table_id FOR UPDATE;
 IF NEW.guest_count>cap THEN RAISE EXCEPTION 'Guest count exceeds table capacity'; END IF;
 IF NEW.status='Confirmed' AND EXISTS (
  SELECT 1 FROM reservation WHERE table_id=NEW.table_id AND status='Confirmed'
  AND reservation_id<>COALESCE(NEW.reservation_id,-1)
  AND tsrange(starts_at,ends_at,'[)') && tsrange(NEW.reservation_date+NEW.reservation_time,
    NEW.reservation_date+NEW.reservation_time+NEW.duration_minutes*INTERVAL '1 minute','[)')
 ) THEN RAISE EXCEPTION 'Table is already reserved during the selected time' USING ERRCODE='23P01'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_check_reservation_conflict BEFORE INSERT OR UPDATE ON reservation FOR EACH ROW EXECUTE FUNCTION check_reservation_conflict();

CREATE FUNCTION verify_payment() RETURNS TRIGGER AS $$
DECLARE bill DECIMAL; s TEXT;
BEGIN
 SELECT total_amount,status INTO bill,s FROM orders WHERE order_id=NEW.order_id FOR UPDATE;
 IF bill<=0 OR s='Cancelled' OR NEW.amount<>bill THEN RAISE EXCEPTION 'Payment must match a non-cancelled non-empty bill'; END IF;
 IF TG_OP='UPDATE' AND OLD.payment_status='Completed' THEN RAISE EXCEPTION 'Completed payment is immutable'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_verify_payment BEFORE INSERT OR UPDATE ON payment FOR EACH ROW EXECUTE FUNCTION verify_payment();

-- Second migration: consistent restaurant civil time on every laptop.
ALTER DATABASE restaurant_management SET timezone TO 'Asia/Kolkata';
SET TIMEZONE='Asia/Kolkata';
