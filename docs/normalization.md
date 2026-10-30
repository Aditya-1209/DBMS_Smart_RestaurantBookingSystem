# Normalization

## Original submitted logical design

**1NF:** Each SQL field is atomic in the domain. Ordered dishes occupy separate Order_Item rows rather than repeating dish1/dish2 columns. The many-to-many Orders/Menu_Item relationship is decomposed through Order_Item.

**2NF:** In the original associative relation, (order_id,item_id) was the whole key. Quantity and historical unit_price described that combination. In the enhanced relation, each independently customized line has order_item_id as its key; duplicate (order_id,item_id) pairs are intentional, so that pair is no longer a candidate key. Each line's facts depend on its line key.

**3NF:** Customer contacts depend on customer_id, staff details on staff_id, category names on category_id, and dishes on item_id. Category names are not copied into Menu_Item; customer contacts are not copied into Orders. Payment facts are separated with a unique order FK. Historical line price is an order-time fact, so it depends on the ordered line rather than the menu's current price.

## Derived physical columns and practical qualification

The PDF describes its design as 3NF while physically storing derived totals and a generated subtotal. Under a strict functional-dependency analysis, quantity + unit_price determine subtotal, and reservation date + time + duration determine the generated boundaries. Those derived fields are not independent normalized facts. Orders.total_amount is also a deliberate stored aggregate.

The implementation preserves the submitted approach and makes those materializations controlled: PostgreSQL generates line subtotals and booking boundaries, and a trigger atomically maintains order totals. The normalized logical relations can be understood with these derived attributes omitted (or exposed as views); the physical schema contains this explicit, documented denormalization. It would be misleading to claim every physical derived column independently satisfies strict 3NF.

Support tables have single-fact keys: token hash determines session principal/expiry, hashed login email determines its throttle window/counter, and an outbox order determines one delivery payload/state. The temporary outbox copy is intentional redundancy needed for reliable delivery across two databases.

MongoDB deliberately uses nested arrays and flexible documents. Relational normal forms are not applied to those document collections. Referential correctness is enforced by SQL-backed service validation plus unique indexes and durable retries, not by cross-engine foreign keys.
