# Final ER diagram

Core relationships from the submission are unchanged. Order_Item now has a surrogate line key so multiple customized versions of a dish can belong to the same order.

```mermaid
erDiagram
  CUSTOMER ||--o{ RESERVATION : books
  RESTAURANT_TABLE ||--o{ RESERVATION : receives
  CUSTOMER ||--o{ ORDERS : places
  RESTAURANT_TABLE o|--o{ ORDERS : seats
  STAFF o|--o{ ORDERS : handles
  CATEGORY ||--o{ MENU_ITEM : classifies
  ORDERS ||--|{ ORDER_ITEM : contains
  MENU_ITEM ||--o{ ORDER_ITEM : appears_in
  ORDERS ||--o| PAYMENT : settles
  CUSTOMER {
    int customer_id PK
    string email UK
    string phone UK
    string password "scrypt hash"
  }
  STAFF {
    int staff_id PK
    string email UK
    string phone UK
    string role
    string password "scrypt hash"
    boolean active
  }
  RESTAURANT_TABLE {
    int table_id PK
    int table_number UK
    int capacity
    string status
  }
  CATEGORY {
    int category_id PK
    string category_name UK
  }
  MENU_ITEM {
    int item_id PK
    int category_id FK
    decimal price
    boolean availability
  }
  RESERVATION {
    int reservation_id PK
    int customer_id FK
    int table_id FK
    date reservation_date
    time reservation_time
    int duration_minutes
    timestamp checked_in_at "nullable staff check-in"
    timestamp starts_at "generated"
    timestamp ends_at "generated"
  }
  ORDERS {
    int order_id PK
    int customer_id FK
    int table_id FK "nullable"
    int staff_id FK "nullable"
    string idempotency_key UK "nullable"
    decimal total_amount "trigger maintained"
  }
  ORDER_ITEM {
    int order_item_id PK
    int order_id FK
    int item_id FK
    int quantity
    decimal unit_price
    decimal subtotal "generated"
    string status
  }
  PAYMENT {
    int payment_id PK
    int order_id FK,UK
    decimal amount
    string payment_method
    string payment_status
  }
```

An order has one or more lines at the service-transaction boundary. SQL allows a temporary empty parent while the transaction inserts its lines; payment rejects an empty bill. At most one payment record exists for an order.

Support relationships:

```mermaid
erDiagram
  CUSTOMER o|--o{ SESSION : authenticates
  STAFF o|--o{ SESSION : authenticates
  ORDERS ||--o| OUTBOX : queues_instructions
  SESSION {
    string token_hash PK
    int customer_id FK "exactly one principal"
    int staff_id FK "exactly one principal"
    timestamp expires_at
  }
  OUTBOX {
    int id PK
    int order_id FK,UK
    json payload
    timestamp processed_at
    int attempts
  }
  LOGIN_ATTEMPT {
    string key PK
    int count
    timestamp window_start
  }
```

MongoDB uses validated logical references: reviews.customer_id/order_id and items_reviewed.item_id; order_customizations.order_id/order_item_id/item_id; customer_preferences.customer_id. They are not SQL foreign keys. The original graphical submission is preserved in reference/original-submission.pdf and reference/er-03.png.
