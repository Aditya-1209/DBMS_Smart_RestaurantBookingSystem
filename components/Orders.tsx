"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ShoppingBag,
  ArrowRight,
  Receipt,
  Printer,
  Check,
  Star,
  RefreshCw,
} from "lucide-react";
import type { Order, User, Review } from "./types";
import {
  api,
  money,
  Badge,
  Empty,
  ErrorBox,
  Spinner,
  Modal,
  instructions,
} from "./shared";
export default function Orders({ user }: { user: User | null }) {
  const [orders, setOrders] = useState<Order[]>([]),
    [selected, setSelected] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const r = await api<{ orders: Order[] }>("orders");
    setOrders(r.orders);
  }, []);
  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const t = setInterval(
      () => load().catch((e) => setError(e.message)),
      15000,
    );
    return () => clearInterval(t);
  }, [load]);
  return (
    <div className="page-container">
      <div className="page-heading row between">
        <div>
          <span className="eyebrow">FROM OUR KITCHEN TO YOU</span>
          <h1>
            {user?.role === "customer" ? "Your delicious" : "All restaurant"}{" "}
            <em>moments.</em>
          </h1>
          <p>Follow your meal from the first flame to the final bite.</p>
        </div>
        <button
          className="button outline small"
          onClick={() => load().catch((e) => setError(e.message))}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Empty title="Your first favourite is waiting">
          Explore the menu and place your first order.
        </Empty>
      ) : (
        <div className="order-grid">
          {orders.map((o) => (
            <article className="order-card" key={o.order_id}>
              <div className="row between">
                <span className="order-number">
                  <ShoppingBag size={17} />
                  ORDER #{o.order_id}
                </span>
                <Badge status={o.status} />
              </div>
              <p className="muted">
                {new Date(o.order_date).toLocaleDateString("en-IN", {
                  dateStyle: "medium",
                  timeZone: "UTC",
                })}{" "}
                · {o.order_time.slice(11, 16)} IST ·{" "}
                {o.table ? "Table " + o.table.table_number : "Takeaway"}
              </p>
              {user?.role !== "customer" && <p>{o.customer.name}</p>}
              <div className="order-preview">
                {o.items.map((l) => (
                  <div className="row between" key={l.order_item_id}>
                    <span>
                      {l.quantity} × {l.item.item_name}
                    </span>
                    <span>{money(l.subtotal)}</span>
                  </div>
                ))}
              </div>
              <div className="row between order-card-footer">
                <div>
                  <small>
                    {o.payment?.payment_status === "Completed"
                      ? "PAID · " + o.payment.payment_method
                      : "TOTAL TO PAY"}
                  </small>
                  <b>{money(o.total_amount)}</b>
                </div>
                <button
                  className="button outline small"
                  onClick={async () => {
                    try {
                      setSelected(await api<Order>(`orders/${o.order_id}`));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  View order
                  <ArrowRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <OrderDialog
          initial={selected}
          user={user}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
export function OrderDialog({
  initial,
  user,
  onClose,
  onChanged,
}: {
  initial: Order;
  user: User | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [o, setO] = useState(initial),
    [error, setError] = useState(""),
    [method, setMethod] = useState("UPI"),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [rating, setRating] = useState(5),
    [comment, setComment] = useState(""),
    [existing, setExisting] = useState<Review | null>(null),
    [reviewSaved, setReviewSaved] = useState(false),
    [reviewLoading, setReviewLoading] = useState(true),
    [lineRatings, setLineRatings] = useState<Record<number, number>>({});
  useEffect(() => {
    api<{ reviews: Review[] }>("reviews")
      .then((r) => {
        const found = r.reviews.find((r) => r.order_id === initial.order_id);
        if (found) {
          setExisting(found);
          setRating(found.rating);
          setComment(found.comment);
          setLineRatings(
            Object.fromEntries(
              found.items_reviewed.map((i) => [i.item_id, i.rating]),
            ),
          );
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setReviewLoading(false));
  }, [initial.order_id]);
  async function refresh() {
    setO(await api<Order>(`orders/${o.order_id}`));
    await onChanged();
  }
  async function action(f: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await f();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const next: Record<string, string> = {
    Placed: "Preparing",
    Preparing: "Ready",
    Ready: "Served",
    Served: "Completed",
  };
  const steps = ["Placed", "Preparing", "Ready", "Served", "Completed"];
  const canChange =
    user?.role === "admin" ||
    (user?.staffRole === "Chef" &&
      ["Placed", "Preparing"].includes(o.status)) ||
    (user?.staffRole === "Waiter" &&
      ["Placed", "Preparing", "Ready", "Served"].includes(o.status)) ||
    (user?.staffRole === "Cashier" && o.status === "Served");
  return (
    <Modal title={`Order #${o.order_id}`} onClose={onClose} wide>
      <div className="bill-area">
        <div className="bill-brand">
          <h2>saffron & sage</h2>
          <p>Good food. Good company.</p>
        </div>
        <div className="row between">
          <div>
            <b>{o.customer.name}</b>
            <p className="muted">
              {o.table ? "Table " + o.table.table_number : "Takeaway"} ·{" "}
              {new Date(o.order_date).toLocaleDateString("en-IN", {
                timeZone: "UTC",
              })}
            </p>
          </div>
          <Badge status={o.status} />
        </div>
        {o.status !== "Cancelled" && (
          <div className="order-tracker">
            {steps.map((s, i) => (
              <div
                className={i <= steps.indexOf(o.status) ? "done" : ""}
                key={s}
              >
                <span>
                  {i < steps.indexOf(o.status) ? <Check size={13} /> : i + 1}
                </span>
                <small>{s}</small>
              </div>
            ))}
          </div>
        )}
        {o.customizations_pending && (
          <div className="info-box">
            Kitchen instructions are safely queued in PostgreSQL while MongoDB
            reconnects.
          </div>
        )}
        <div className="bill-lines">
          {o.items.map((l) => {
            const c = o.customizations?.find(
              (c) => c.order_item_id === l.order_item_id,
            )?.customizations;
            return (
              <div className="bill-line" key={l.order_item_id}>
                <div className="row between">
                  <b>
                    {l.quantity} × {l.item.item_name}
                  </b>
                  <b>{money(l.subtotal)}</b>
                </div>
                <small>
                  {money(l.unit_price)} each · Line #{l.order_item_id} ·{" "}
                  {l.status}
                </small>
                {c && instructions(c) && (
                  <p className="kitchen-note">{instructions(c)}</p>
                )}
                {user?.role !== "customer" &&
                  ["Placed", "Preparing", "Ready"].includes(l.status) &&
                  !["Completed", "Cancelled"].includes(o.status) &&
                  user?.staffRole !== "Cashier" &&
                  !(user?.staffRole === "Chef" && l.status === "Ready") && (
                    <button
                      className="text-button no-print"
                      disabled={busy}
                      onClick={() =>
                        action(() =>
                          api(`order-items/${l.order_item_id}`, "PATCH", {
                            status: next[l.status],
                          }),
                        )
                      }
                    >
                      Mark line {next[l.status].toLowerCase()}
                    </button>
                  )}
              </div>
            );
          })}
        </div>
        <div className="row between bill-total">
          <span>Total</span>
          <b>{money(o.total_amount)}</b>
        </div>
        <p className="fine-print">
          No additional charges. All amounts are in INR.
        </p>
        {o.payment?.payment_status === "Completed" && (
          <div className="success-box">
            <Check size={18} />
            Paid {money(o.payment.amount)} via {o.payment.payment_method} ·
            Receipt #{o.payment.payment_id}
          </div>
        )}
      </div>
      <div className="no-print">
        <ErrorBox error={error} />
        <div className="row wrap">
          <button
            className="button outline small"
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Print bill
          </button>
          <button
            className="button outline small"
            disabled={busy}
            onClick={() => action(async () => {})}
          >
            <RefreshCw size={16} />
            Refresh status
          </button>
          {user?.role !== "customer" && canChange && next[o.status] && (
            <button
              className="button primary small"
              disabled={busy}
              onClick={() =>
                action(() =>
                  api(`orders/${o.order_id}`, "PATCH", {
                    status: next[o.status],
                  }),
                )
              }
            >
              Mark {next[o.status]}
              <ArrowRight size={16} />
            </button>
          )}
          {user?.role === "admin" && o.status === "Placed" && !o.payment && (
            <button
              className="button outline small"
              disabled={busy}
              onClick={() => {
                if (confirm("Cancel this unprepared order?"))
                  void action(() =>
                    api(`orders/${o.order_id}`, "PATCH", {
                      status: "Cancelled",
                    }),
                  );
              }}
            >
              Cancel order
            </button>
          )}
        </div>
        {o.payment?.payment_status !== "Completed" &&
          o.status !== "Cancelled" &&
          (user?.role === "customer" ||
            user?.role === "admin" ||
            user?.staffRole === "Cashier") && (
            <section className="payment-section">
              <div className="panel-title">
                <Receipt size={22} />
                <div>
                  <h3>Settle your bill</h3>
                  <p>Demo payment only. No real money is moved.</p>
                </div>
              </div>
              <label className="field">
                Payment method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Cash</option>
                </select>
              </label>
              <button
                className="button primary full"
                disabled={busy}
                onClick={() =>
                  action(() =>
                    api(`orders/${o.order_id}/payment`, "POST", {
                      payment_method: method,
                    }),
                  )
                }
              >
                {busy
                  ? "Processing…"
                  : `Simulate payment · ${money(o.total_amount)}`}
                <Check size={17} />
              </button>
            </section>
          )}
        {user?.role === "customer" &&
          o.payment?.payment_status === "Completed" && (
            <section className="space-top">
              <button
                className="button outline full"
                disabled={reviewLoading}
                onClick={() => setReview(!review)}
              >
                <Star size={17} />
                {existing ? "Edit your review" : "How was your meal?"}
              </button>
              {review && (
                <form
                  className="space-top"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      const r = await api<Review>(
                        "reviews",
                        existing ? "PUT" : "POST",
                        {
                          order_id: o.order_id,
                          rating,
                          comment,
                          items_reviewed: [
                            ...new Set(o.items.map((l) => l.item_id)),
                          ].map((item_id) => ({
                            item_id,
                            rating: lineRatings[item_id] || rating,
                          })),
                        },
                      );
                      setExisting(r);
                      setReviewSaved(true);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className="field">
                    Overall rating
                    <select
                      value={rating}
                      onChange={(e) => setRating(Number(e.target.value))}
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} {"★".repeat(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid">
                    {[
                      ...new Map(o.items.map((l) => [l.item_id, l])).values(),
                    ].map((l) => (
                      <label className="field" key={l.item_id}>
                        {l.item.item_name}
                        <select
                          value={lineRatings[l.item_id] || rating}
                          onChange={(e) =>
                            setLineRatings({
                              ...lineRatings,
                              [l.item_id]: Number(e.target.value),
                            })
                          }
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n} stars
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <label className="field">
                    A few words
                    <textarea
                      required
                      maxLength={2000}
                      value={comment}
                      onChange={(e) => {
                        setComment(e.target.value);
                        setReviewSaved(false);
                      }}
                      placeholder="What made your meal special?"
                    />
                  </label>
                  <button className="button primary full" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : existing
                        ? "Update review"
                        : "Share review"}
                  </button>
                  {reviewSaved && (
                    <p className="success-box" role="status">
                      Thank you! Your review is saved.
                    </p>
                  )}
                </form>
              )}
            </section>
          )}
      </div>
    </Modal>
  );
}
