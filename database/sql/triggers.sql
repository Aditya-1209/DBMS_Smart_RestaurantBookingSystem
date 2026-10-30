-- Included by the migration; reference only, do not apply twice.
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
