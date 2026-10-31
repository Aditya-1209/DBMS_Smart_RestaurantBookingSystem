export type User = {
  id: number;
  name: string;
  email: string;
  role: "customer" | "staff" | "admin";
  staffRole?: string;
};
export type Category = { category_id: number; category_name: string };
export type Menu = {
  item_id: number;
  item_name: string;
  description: string;
  price: string;
  availability: boolean;
  vegetarian: boolean;
  image: string;
  category_id: number;
  category: Category;
};
export type Custom = {
  size: string;
  crust: string;
  extra_cheese: boolean;
  remove: string[];
  add: string[];
  special_instruction: string;
};
export type CartLine = {
  key: string;
  item: Menu;
  quantity: number;
  customizations: Custom;
};
export type Table = {
  table_id: number;
  table_number: number;
  capacity: number;
  status: string;
};
export type Reservation = {
  reservation_id: number;
  customer_id: number;
  table_id: number;
  reservation_date: string;
  reservation_time: string;
  starts_at: string;
  ends_at: string;
  checked_in_at: string | null;
  duration_minutes: number;
  guest_count: number;
  status: string;
  table: Table;
  customer: { name: string };
};
export type Line = {
  order_item_id: number;
  item_id: number;
  quantity: number;
  unit_price: string;
  subtotal: string;
  status: string;
  item: Menu;
};
export type Payment = {
  payment_id: number;
  order_id: number;
  amount: string;
  payment_method: string;
  payment_status: string;
  payment_time: string;
  order?: { customer: { name: string } };
};
export type Order = {
  order_id: number;
  customer_id: number;
  status: string;
  total_amount: string;
  order_date: string;
  order_time: string;
  items: Line[];
  payment: Payment | null;
  table: Table | null;
  customer: { name: string };
  customizations?: { order_item_id: number; customizations: Custom }[];
  customizations_pending?: boolean;
};
export type Review = {
  _id: string;
  customer_id: number;
  customer_name: string;
  order_id: number;
  rating: number;
  comment: string;
  items_reviewed: { item_id: number; rating: number }[];
  created_at: string;
};
export type Preferences = {
  dietary_preferences: string[];
  preferred_cuisines: string[];
  spice_level: string;
  allergens: string[];
};
export type Staff = {
  staff_id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  active: boolean;
};
export type Reports = {
  revenue: { total_revenue: string }[];
  popular: { item_name: string; total_quantity_sold: number }[];
  methods: { payment_method: string; revenue: string }[];
  statuses: { status: string; count: number }[];
  customers: number;
  pending_customizations: number;
};
