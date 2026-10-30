-- Eight submitted queries. Demo customer/order identifiers = 1.
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
 