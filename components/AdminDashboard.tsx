"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  UtensilsCrossed,
  Users,
  CalendarDays,
  ShoppingBag,
  Receipt,
  Star,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  ArrowUpRight,
  Check,
  RefreshCw,
} from "lucide-react";
import type {
  User,
  Menu,
  Category,
  Staff,
  Table,
  Payment,
  Reports,
  Review,
} from "./types";
import { api, money, ErrorBox, Empty, Spinner, Modal, Badge } from "./shared";
import Reservations from "./Reservations";
import Orders from "./Orders";
type Kind = "menu" | "categories" | "staff" | "tables";
type Editor = {
  kind: Kind;
  id?: number;
  values: Record<string, string | number | boolean>;
};
export default function AdminDashboard({
  menu,
  categories,
  refreshMenu,
  user,
}: {
  menu: Menu[];
  categories: Category[];
  refreshMenu: () => Promise<void>;
  user: User | null;
}) {
  const [tab, setTab] = useState("Overview"),
    [staff, setStaff] = useState<Staff[]>([]),
    [tables, setTables] = useState<Table[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [reports, setReports] = useState<Reports | null>(null),
    [reviews, setReviews] = useState<Review[]>([]),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [deleting, setDeleting] = useState<{
      kind: Kind;
      id: number;
      name: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [editorError, setEditorError] = useState("");
  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api<{ staff: Staff[] }>("admin/staff").then((r) => setStaff(r.staff)),
      api<{ tables: Table[] }>("tables").then((r) => setTables(r.tables)),
      api<{ payments: Payment[] }>("admin/payments").then((r) =>
        setPayments(r.payments),
      ),
      api<Reports>("admin/reports").then(setReports),
      api<{ reviews: Review[] }>("reviews").then((r) => setReviews(r.reviews)),
    ]);
    const failure = results.find((r) => r.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }, []);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  function edit(
    kind: Kind,
    id?: number,
    values: Record<string, string | number | boolean> = {},
  ) {
    setEditorError("");
    setEditor({
      kind,
      id,
      values:
        kind === "menu"
          ? {
              item_name: "",
              description: "",
              category_id: categories[0]?.category_id || 1,
              price: 0,
              availability: true,
              vegetarian: true,
              image: "/images/paneer.jpg",
              ...values,
            }
          : kind === "categories"
            ? { category_name: "", ...values }
            : kind === "staff"
              ? {
                  name: "",
                  email: "",
                  phone: "",
                  role: "Waiter",
                  active: true,
                  password: "",
                  ...values,
                }
              : {
                  table_number: tables.length + 1,
                  capacity: 4,
                  status: "Available",
                  ...values,
                },
    });
  }
  async function save() {
    if (!editor) return;
    setBusy(true);
    setEditorError("");
    try {
      const b = { ...editor.values };
      if (editor.kind === "menu") {
        b.price = Number(b.price);
        b.category_id = Number(b.category_id);
      }
      if (editor.kind === "tables") {
        b.table_number = Number(b.table_number);
        b.capacity = Number(b.capacity);
      }
      if (editor.kind === "staff" && !b.password) delete b.password;
      await api(
        `admin/${editor.kind}${editor.id ? "/" + editor.id : ""}`,
        editor.id ? "PATCH" : "POST",
        b,
      );
      await Promise.all([load(), refreshMenu()]);
      setEditor(null);
    } catch (e) {
      setEditorError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    ["Overview", BarChart3],
    ["Menu", UtensilsCrossed],
    ["Categories", UtensilsCrossed],
    ["Team", Users],
    ["Tables", UtensilsCrossed],
    ["Reservations", CalendarDays],
    ["Orders", ShoppingBag],
    ["Payments", Receipt],
    ["Reviews", Star],
  ] as const;
  const controls = (
    kind: Kind,
    id: number,
    name: string,
    values: Record<string, string | number | boolean>,
  ) => (
    <div className="table-actions">
      <button
        className="icon-button"
        aria-label={`Edit ${name}`}
        onClick={() => edit(kind, id, values)}
      >
        <Pencil size={16} />
      </button>
      <button
        className="icon-button danger"
        aria-label={`Delete ${name}`}
        onClick={() => setDeleting({ kind, id, name })}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <span className="eyebrow">HOUSE MANAGEMENT</span>
        <h2>
          A little
          <br />
          behind the scenes.
        </h2>
        <nav>
          {tabs.map(([t, Icon]) => (
            <button
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              <Icon size={18} />
              {t}
              {t === tab && <ArrowUpRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          Local restaurant workspace<small>Manager access · {user?.name}</small>
        </div>
      </aside>
      <section className="admin-content">
        <div className="page-heading row between">
          <div>
            <span className="eyebrow">YOUR RESTAURANT, AT A GLANCE</span>
            <h1>
              {tab === "Overview" ? "The bigger " : tab + " "}
              <em>{tab === "Overview" ? "picture." : "workspace."}</em>
            </h1>
            <p>
              {tab === "Overview"
                ? "A fresh look at how the house is doing."
                : "Keep the details as thoughtful as the food."}
            </p>
          </div>
          <button
            className="button outline small"
            onClick={() => {
              setError("");
              void Promise.all([load(), refreshMenu()]).catch((e) =>
                setError(e.message),
              );
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Spinner />
        ) : tab === "Overview" && reports ? (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <span>
                  <TrendingUp size={17} />
                  Completed revenue
                </span>
                <b>{money(reports.revenue[0]?.total_revenue || 0)}</b>
                <small>From completed payment records</small>
              </div>
              <div className="stat-card">
                <span>
                  <ShoppingBag size={17} />
                  Total orders
                </span>
                <b>{reports.statuses.reduce((a, s) => a + s.count, 0)}</b>
                <small>
                  {reports.statuses
                    .filter(
                      (s) => !["Completed", "Cancelled"].includes(s.status),
                    )
                    .reduce((a, s) => a + s.count, 0)}{" "}
                  currently active
                </small>
              </div>
              <div className="stat-card">
                <span>
                  <Users size={17} />
                  Our guests
                </span>
                <b>{reports.customers}</b>
                <small>Registered customer accounts</small>
              </div>
              <div className="stat-card">
                <span>
                  <UtensilsCrossed size={17} />
                  On the menu
                </span>
                <b>{menu.filter((m) => m.availability).length}</b>
                <small>{categories.length} categories to explore</small>
              </div>
            </div>
            <div className="report-grid">
              <section className="panel">
                <div className="panel-title">
                  <Star size={21} />
                  <h2>The crowd favourites</h2>
                </div>
                {reports.popular.length === 0 ? (
                  <Empty title="Your first order will start the story" />
                ) : (
                  reports.popular.map((p, i) => (
                    <div className="chart-row" key={p.item_name}>
                      <div className="row between">
                        <span>
                          <b className="chart-rank">0{i + 1}</b>
                          {p.item_name}
                        </span>
                        <b>
                          {p.total_quantity_sold}
                          <small> sold</small>
                        </b>
                      </div>
                      <div className="chart-track">
                        <span
                          style={{
                            width: `${(p.total_quantity_sold / Math.max(...reports.popular.map((p) => p.total_quantity_sold), 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
                <small className="muted">
                  All non-cancelled orders · Quantity sold
                </small>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <Receipt size={21} />
                  <h2>How guests pay</h2>
                </div>
                {reports.methods.map((m) => (
                  <div className="payment-method-row" key={m.payment_method}>
                    <span className="method-icon">
                      {m.payment_method === "Cash"
                        ? "₹"
                        : m.payment_method === "Card"
                          ? "▤"
                          : "↗"}
                    </span>
                    <div>
                      <b>{m.payment_method}</b>
                      <div className="chart-track">
                        <span
                          style={{
                            width: `${(Number(m.revenue) / Math.max(Number(reports.revenue[0].total_revenue), 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <b>{money(m.revenue)}</b>
                  </div>
                ))}
                <small className="muted">Completed payments only · INR</small>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <ShoppingBag size={21} />
                  <h2>Every order, accounted for</h2>
                </div>
                <div className="status-report">
                  {reports.statuses.map((s) => (
                    <div className="row between" key={s.status}>
                      <Badge status={s.status} />
                      <b>{s.count}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel sync-panel">
                <Check size={27} />
                <h2>Kitchen instructions</h2>
                <p>
                  {reports.pending_customizations === 0
                    ? "All customization documents are synchronized with MongoDB."
                    : `${reports.pending_customizations} order documents are safely queued in PostgreSQL.`}
                </p>
                <button
                  className="button outline small"
                  onClick={async () => {
                    try {
                      const r = await api<{ synced: boolean }>(
                        "admin/reconcile",
                        "POST",
                        {},
                      );
                      if (!r.synced)
                        throw Error(
                          "MongoDB is unavailable. Instructions remain safely queued.",
                        );
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Retry synchronization
                </button>
              </section>
            </div>
          </>
        ) : tab === "Menu" ? (
          <section className="panel">
            <div className="section-heading">
              <h2>
                The menu <span className="count-pill">{menu.length}</span>
              </h2>
              <button
                className="button primary small"
                onClick={() => edit("menu")}
              >
                <Plus size={17} />
                Add dish
              </button>
            </div>
            <div className="data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dish</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Availability</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {menu.map((m) => (
                    <tr key={m.item_id}>
                      <td>
                        <div className="row">
                          <img className="table-thumb" src={m.image} alt="" />
                          <div>
                            <b>{m.item_name}</b>
                            <small>
                              {m.vegetarian ? "Vegetarian" : "Non-vegetarian"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{m.category.category_name}</td>
                      <td>{money(m.price)}</td>
                      <td>
                        <Badge
                          status={m.availability ? "Available" : "Unavailable"}
                        />
                      </td>
                      <td>
                        {controls("menu", m.item_id, m.item_name, {
                          item_name: m.item_name,
                          description: m.description || "",
                          category_id: m.category_id,
                          price: Number(m.price),
                          availability: m.availability,
                          vegetarian: m.vegetarian,
                          image: m.image,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "Categories" ? (
          <section className="panel">
            <div className="section-heading">
              <h2>Menu categories</h2>
              <button
                className="button primary small"
                onClick={() => edit("categories")}
              >
                <Plus size={17} />
                Add category
              </button>
            </div>
            <div className="data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Dishes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.category_id}>
                      <td>
                        <b>{c.category_name}</b>
                      </td>
                      <td>
                        {
                          menu.filter((m) => m.category_id === c.category_id)
                            .length
                        }
                      </td>
                      <td>
                        {controls(
                          "categories",
                          c.category_id,
                          c.category_name,
                          { category_name: c.category_name },
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "Team" ? (
          <section className="panel">
            <div className="section-heading">
              <h2>The people behind the plates</h2>
              <button
                className="button primary small"
                onClick={() => edit("staff")}
              >
                <Plus size={17} />
                Add staff
              </button>
            </div>
            <div className="data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.staff_id}>
                      <td>
                        <b>{s.name}</b>
                      </td>
                      <td>{s.role}</td>
                      <td>
                        {s.email}
                        <small>{s.phone}</small>
                      </td>
                      <td>
                        <Badge status={s.active ? "Active" : "Inactive"} />
                      </td>
                      <td>
                        {controls("staff", s.staff_id, s.name, {
                          name: s.name,
                          email: s.email,
                          phone: s.phone,
                          role: s.role,
                          active: s.active,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "Tables" ? (
          <section className="panel">
            <div className="section-heading">
              <h2>Room for everyone</h2>
              <button
                className="button primary small"
                onClick={() => edit("tables")}
              >
                <Plus size={17} />
                Add table
              </button>
            </div>
            <div className="data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Capacity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t) => (
                    <tr key={t.table_id}>
                      <td>
                        <b>Table {t.table_number}</b>
                      </td>
                      <td>{t.capacity} seats</td>
                      <td>
                        <Badge status={t.status} />
                      </td>
                      <td>
                        {controls(
                          "tables",
                          t.table_id,
                          `Table ${t.table_number}`,
                          {
                            table_number: t.table_number,
                            capacity: t.capacity,
                            status: t.status,
                          },
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "Reservations" ? (
          <Reservations user={user} />
        ) : tab === "Orders" ? (
          <Orders user={user} />
        ) : tab === "Payments" ? (
          <section className="panel">
            <h2>Payment records</h2>
            <div className="data-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Order</th>
                    <th>Guest</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.payment_id}>
                      <td>#{p.payment_id}</td>
                      <td>#{p.order_id}</td>
                      <td>{p.order?.customer.name}</td>
                      <td>{p.payment_method}</td>
                      <td>{money(p.amount)}</td>
                      <td>
                        <Badge status={p.payment_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "Reviews" ? (
          <section>
            <h2>Words around the table</h2>
            <div className="review-grid">
              {reviews.map((r) => (
                <article className="review-card" key={r._id}>
                  <div className="stars">{"★".repeat(r.rating)}</div>
                  <p>{r.comment}</p>
                  <b>{r.customer_name}</b>
                  <small>
                    Order #{r.order_id} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("en-IN")}
                  </small>
                </article>
              ))}
            </div>
            {reviews.length === 0 && <Empty title="No reviews yet" />}
          </section>
        ) : null}
      </section>
      {editor && (
        <Modal
          title={`${editor.id ? "Edit" : "Add"} ${editor.kind === "staff" ? "team member" : editor.kind === "categories" ? "category" : editor.kind === "tables" ? "restaurant table" : "dish"}`}
          onClose={() => setEditor(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {Object.entries(editor.values).map(([key, value]) => {
              const label: Record<string, string> = {
                item_name: "Dish name",
                description: "Description",
                category_id: "Category",
                price: "Price (INR)",
                availability: "Available to order",
                vegetarian: "Vegetarian",
                image: "Dish image",
                name: "Full name",
                email: "Email address",
                phone: "Phone number",
                role: "Staff role",
                active: "Active account",
                password: editor.id
                  ? "New password (leave blank to keep)"
                  : "Password",
                category_name: "Category name",
                table_number: "Table number",
                capacity: "Seat capacity",
                status: "Table status",
              };
              const options =
                key === "category_id"
                  ? categories.map((c) => ({
                      value: c.category_id,
                      label: c.category_name,
                    }))
                  : key === "role"
                    ? ["Manager", "Waiter", "Chef", "Cashier"].map((x) => ({
                        value: x,
                        label: x,
                      }))
                    : key === "status"
                      ? ["Available", "Reserved", "Occupied"].map((x) => ({
                          value: x,
                          label: x,
                        }))
                      : key === "image"
                        ? [
                            "paneer",
                            "chicken",
                            "biryani",
                            "curry",
                            "dessert",
                            "drink",
                            "chai",
                          ].map((x) => ({
                            value: `/images/${x}.jpg`,
                            label: x,
                          }))
                        : null;
              if (typeof value === "boolean")
                return (
                  <label className="checkbox" key={key}>
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          values: { ...editor.values, [key]: e.target.checked },
                        })
                      }
                    />
                    {label[key]}
                  </label>
                );
              return (
                <label className="field" key={key}>
                  {label[key]}
                  {options ? (
                    <select
                      value={String(value)}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          values: { ...editor.values, [key]: e.target.value },
                        })
                      }
                    >
                      {options.map((o) => (
                        <option value={o.value} key={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : key === "description" ? (
                    <textarea
                      value={String(value)}
                      maxLength={1000}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          values: { ...editor.values, [key]: e.target.value },
                        })
                      }
                    />
                  ) : (
                    <input
                      type={
                        key === "password"
                          ? "password"
                          : key === "email"
                            ? "email"
                            : ["price", "capacity", "table_number"].includes(
                                  key,
                                )
                              ? "number"
                              : "text"
                      }
                      value={String(value)}
                      min={key === "price" ? 0 : 1}
                      step={key === "price" ? "0.01" : 1}
                      minLength={key === "password" ? 10 : undefined}
                      required={key !== "password" || !editor.id}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          values: { ...editor.values, [key]: e.target.value },
                        })
                      }
                    />
                  )}
                </label>
              );
            })}
            <ErrorBox error={editorError} />
            <button className="button primary full" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
              <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete this record?" onClose={() => setDeleting(null)}>
          <p>
            <b>{deleting.name}</b> will be removed. Records used by orders or
            reservations may be protected by the database.
          </p>
          <button
            className="button danger-button full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(
                  `admin/${deleting.kind}/${deleting.id}`,
                  "DELETE",
                  {},
                );
                setDeleting(null);
                await Promise.all([load(), refreshMenu()]);
              } catch (e) {
                setError((e as Error).message);
                setDeleting(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete record"}
          </button>
        </Modal>
      )}
    </div>
  );
}
