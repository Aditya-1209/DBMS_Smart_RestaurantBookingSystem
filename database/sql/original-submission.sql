-- Original submitted SQL, transcribed from PDF. REFERENCE ONLY: includes original insecure demo passwords.
CREATE TABLE Customer ( 
    customer_id SERIAL PRIMARY KEY, 
    name VARCHAR(100) NOT NULL, 
    email VARCHAR(150) UNIQUE NOT NULL, 
    phone VARCHAR(15) UNIQUE NOT NULL, 
    password VARCHAR(255) NOT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
); 
 
CREATE TABLE Staff ( 
    staff_id SERIAL PRIMARY KEY, 
    name VARCHAR(100) NOT NULL, 
    email VARCHAR(150) UNIQUE NOT NULL, 
    phone VARCHAR(15) UNIQUE NOT NULL, 
    role VARCHAR(30) NOT NULL 
        CHECK (role IN ('Manager', 'Waiter', 'Chef', 'Cashier')) 
); 
 
CREATE TABLE Restaurant_Table ( 
    table_id SERIAL PRIMARY KEY, 
    table_number INT UNIQUE NOT NULL, 
    capacity INT NOT NULL CHECK (capacity > 0), 
    status VARCHAR(20) DEFAULT 'Available' 
        CHECK (status IN ('Available', 'Reserved', 'Occupied')) 
); 
 
CREATE TABLE Category ( 
    category_id SERIAL PRIMARY KEY, 
    category_name VARCHAR(50) UNIQUE NOT NULL 
); 
 
CREATE TABLE Menu_Item ( 
    item_id SERIAL PRIMARY KEY, 
    category_id INT NOT NULL, 
    item_name VARCHAR(100) NOT NULL, 
    description TEXT, 
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0), 
    availability BOOLEAN DEFAULT TRUE, 
 
    CONSTRAINT fk_menu_category 
        FOREIGN KEY (category_id) 
        REFERENCES Category(category_id) 
        ON DELETE RESTRICT 
); 
 
CREATE TABLE Reservation ( 
    reservation_id SERIAL PRIMARY KEY, 
    customer_id INT NOT NULL, 
    table_id INT NOT NULL, 
    reservation_date DATE NOT NULL, 
    reservation_time TIME NOT NULL, 
    guest_count INT NOT NULL CHECK (guest_count > 0), 
    status VARCHAR(20) DEFAULT 'Confirmed' 
        CHECK (status IN ('Confirmed', 'Cancelled', 'Completed')), 
 
    CONSTRAINT fk_reservation_customer 
        FOREIGN KEY (customer_id) 
        REFERENCES Customer(customer_id) 
        ON DELETE CASCADE, 
 
    CONSTRAINT fk_reservation_table 
        FOREIGN KEY (table_id) 
        REFERENCES Restaurant_Table(table_id) 
        ON DELETE RESTRICT 
); 
 
CREATE TABLE Orders ( 
    order_id SERIAL PRIMARY KEY, 
    customer_id INT NOT NULL, 
    table_id INT, 
    staff_id INT, 
    order_date DATE DEFAULT CURRENT_DATE, 
    order_time TIME DEFAULT CURRENT_TIME, 
    status VARCHAR(20) DEFAULT 'Placed' 
        CHECK (status IN ('Placed', 'Preparing', 'Ready', 
                          'Served', 'Completed', 'Cancelled')), 
    total_amount DECIMAL(10,2) DEFAULT 0 
        CHECK (total_amount >= 0), 
 
    CONSTRAINT fk_order_customer 
        FOREIGN KEY (customer_id) 
        REFERENCES Customer(customer_id) 
        ON DELETE RESTRICT, 
 
    CONSTRAINT fk_order_table 
        FOREIGN KEY (table_id) 
        REFERENCES Restaurant_Table(table_id) 
        ON DELETE SET NULL, 
 
    CONSTRAINT fk_order_staff 
        FOREIGN KEY (staff_id) 
        REFERENCES Staff(staff_id) 
        ON DELETE SET NULL 
); 
 
CREATE TABLE Order_Item ( 
    order_id INT NOT NULL, 
    item_id INT NOT NULL, 
    quantity INT NOT NULL CHECK (quantity > 0), 
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0), 
    subtotal DECIMAL(10,2) 
        GENERATED ALWAYS AS (quantity * unit_price) STORED, 
 
    PRIMARY KEY (order_id, item_id), 
 
    CONSTRAINT fk_orderitem_order 
        FOREIGN KEY (order_id) 
        REFERENCES Orders(order_id) 
        ON DELETE CASCADE, 
 
    CONSTRAINT fk_orderitem_item 
        FOREIGN KEY (item_id) 
        REFERENCES Menu_Item(item_id) 
        ON DELETE RESTRICT 
); 
 
CREATE TABLE Payment ( 
    payment_id SERIAL PRIMARY KEY, 
    order_id INT UNIQUE NOT NULL, 
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0), 
    payment_method VARCHAR(20) NOT NULL 
        CHECK (payment_method IN ('Cash', 'Card', 'UPI')), 
    payment_status VARCHAR(20) DEFAULT 'Pending' 
        CHECK (payment_status IN ('Pending', 'Completed', 'Failed')), 
    payment_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
 
    CONSTRAINT fk_payment_order 
        FOREIGN KEY (order_id) 
        REFERENCES Orders(order_id) 
        ON DELETE CASCADE 
); 
 
INSERT INTO Customer (name, email, phone, password) 
VALUES 
('Rahul Sharma', 'rahul@gmail.com', '9876543210', 'pass123'), 
('Ananya Singh', 'ananya@gmail.com', '9876543211', 'pass456'), 
('Arjun Kumar', 'arjun@gmail.com', '9876543212', 'pass789'); 
 
INSERT INTO Staff (name, email, phone, role) 
VALUES 
('Vikram Rao', 'vikram@restaurant.com', '9000000001', 'Manager'), 
('Priya Nair', 'priya@restaurant.com', '9000000002', 'Waiter'), 
('Karan Das', 'karan@restaurant.com', '9000000003', 'Chef'); 
 
INSERT INTO Restaurant_Table (table_number, capacity, status) 
VALUES 
(1, 2, 'Available'), 
(2, 4, 'Available'), 
(3, 4, 'Available'), 
(4, 6, 'Available'), 
(5, 8, 'Available'); 
 
INSERT INTO Category (category_name) 
VALUES 
('Starters'), 
('Main Course'), 
('Desserts'), 
('Beverages'); 
 
INSERT INTO Menu_Item 
(category_id, item_name, description, price, availability) 
VALUES 
(1, 'Paneer Tikka', 
 'Grilled Indian cottage cheese with spices', 220, TRUE), 
(1, 'Chicken 65', 
 'Spicy fried chicken appetizer', 250, TRUE), 
(2, 'Veg Biryani', 
 'Fragrant basmati rice with vegetables', 280, TRUE), 
(2, 'Butter Chicken', 
 'Creamy tomato-based chicken curry', 350, TRUE), 
(3, 'Gulab Jamun', 
 'Soft milk-solid dessert', 100, TRUE), 
(4, 'Fresh Lime Soda', 
 'Refreshing lime-based beverage', 80, TRUE); 
 
INSERT INTO Reservation 
(customer_id, table_id, reservation_date, 
 reservation_time, guest_count) 
VALUES 
(1, 2, '2026-08-30', '19:30', 4); 
 
INSERT INTO Orders (customer_id, table_id, staff_id) 
VALUES (1, 2, 2); 
 
-- Assuming the generated order_id is 1: 
INSERT INTO Order_Item 
(order_id, item_id, quantity, unit_price) 
VALUES 
(1, 1, 2, 220), 
(1, 3, 1, 280), 
(1, 6, 2, 80); 
 
INSERT INTO Payment 
(order_id, amount, payment_method, payment_status) 
VALUES 
(1, 880, 'UPI', 'Completed'); 
 
SELECT 
    m.item_id, 
    m.item_name, 
    c.category_name, 
    m.price, 
    m.availability 
FROM Menu_Item m 
JOIN Category c 
    ON m.category_id = c.category_id 
ORDER BY c.category_name, m.item_name; 
 

SELECT 
    c.name, 
    o.order_id, 
    o.order_date, 
    o.status, 
    o.total_amount 
FROM Customer c 
JOIN Orders o 
    ON c.customer_id = o.customer_id 
WHERE c.customer_id = 1 
ORDER BY o.order_date DESC; 
 

SELECT 
    o.order_id, 
    m.item_name, 
    oi.quantity, 
    oi.unit_price, 
    oi.subtotal 
FROM Orders o 
JOIN Order_Item oi 
    ON o.order_id = oi.order_id 
JOIN Menu_Item m 
    ON oi.item_id = m.item_id 
WHERE o.order_id = 1; 
 

SELECT 
    m.item_name, 
    SUM(oi.quantity) AS total_quantity_sold 
FROM Menu_Item m 
JOIN Order_Item oi 
    ON m.item_id = oi.item_id 
JOIN Orders o 
    ON oi.order_id = o.order_id 
WHERE o.status <> 'Cancelled' 
GROUP BY m.item_id, m.item_name 
ORDER BY total_quantity_sold DESC 
LIMIT 5; 
 

SELECT 
    COALESCE(SUM(amount), 0) AS total_revenue 
FROM Payment 
WHERE payment_status = 'Completed'; 
 

SELECT * 
FROM Restaurant_Table 
WHERE status = 'Available' 
  AND capacity >= 4 
ORDER BY capacity; 
 

SELECT 
    o.order_id, 
    c.name AS customer_name, 
    o.status, 
    o.order_date, 
    o.order_time 
FROM Orders o 
JOIN Customer c 
    ON o.customer_id = c.customer_id 
WHERE o.status IN ('Placed', 'Preparing') 
ORDER BY o.order_date, o.order_time; 
 

SELECT 
    payment_method, 
    SUM(amount) AS revenue 
FROM Payment 
WHERE payment_status = 'Completed' 
GROUP BY payment_method 
ORDER BY revenue DESC; 
 
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
 