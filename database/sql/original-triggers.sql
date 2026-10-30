CREATE OR REPLACE FUNCTION update_order_total() 
RETURNS TRIGGER AS $$ 
BEGIN 
    IF TG_OP = 'DELETE' THEN 
        UPDATE Orders 
        SET total_amount = ( 
            SELECT COALESCE(SUM(subtotal), 0) 
            FROM Order_Item 
            WHERE order_id = OLD.order_id 
        ) 
        WHERE order_id = OLD.order_id; 
 
        RETURN OLD; 
    ELSE 
        UPDATE Orders 
        SET total_amount = ( 
            SELECT COALESCE(SUM(subtotal), 0) 
            FROM Order_Item 
            WHERE order_id = NEW.order_id 
        ) 
        WHERE order_id = NEW.order_id; 
 
        RETURN NEW; 
    END IF; 
END; 
$$ LANGUAGE plpgsql; 
 
CREATE TRIGGER trg_update_order_total 
AFTER INSERT OR UPDATE OR DELETE 
ON Order_Item 
FOR EACH ROW 
EXECUTE FUNCTION update_order_total(); 
 
CREATE OR REPLACE FUNCTION check_reservation_conflict() 
RETURNS TRIGGER AS $$ 
BEGIN 
    IF EXISTS ( 
        SELECT 1 
        FROM Reservation 
        WHERE table_id = NEW.table_id 
          AND reservation_date = NEW.reservation_date 
          AND reservation_time = NEW.reservation_time 
          AND status = 'Confirmed' 
          AND reservation_id <> COALESCE(NEW.reservation_id, -1) 
    ) THEN 
        RAISE EXCEPTION 
        'Table % is already reserved at the selected date and time', 
        NEW.table_id; 
    END IF; 
 
    RETURN NEW; 
END; 
$$ LANGUAGE plpgsql; 
 
CREATE TRIGGER trg_check_reservation_conflict 
BEFORE INSERT OR UPDATE 
ON Reservation 
FOR EACH ROW 
EXECUTE FUNCTION check_reservation_conflict(); 
 