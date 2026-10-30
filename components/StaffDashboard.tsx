"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ChefHat,
  RefreshCw,
  ArrowRight,
  Clock,
  UtensilsCrossed,
} from "lucide-react";
import type { User, Order, Table } from "./types";
import { api, money, ErrorBox, Badge, Spinner } from "./shared";
import { OrderDialog } from "./Orders";
import Reservations from "./Reservations";
export default function StaffDashboard({ user }: { user: User | null }) {
  const [orders, setOrders] = useState<Order[]>([]),
    [tables, setTables] = useState<Table[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("Kitchen board"),
    [selected, setSelected] = useState<Order | null>(null);
  const load = useCallback(async () => {
    const [o, t] = await Promise.all([
      api<{ orders: Order[] }>("orders"),
      api<{ tables: Table[] }>("tables"),
    ]);
    setOrders(o.orders);
    setTables(t.tables);
  }, []);
  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const t = setInterval(
      () => load().catch((e) => setError(e.message)),
      12000,
    );
    return () => clearInterval(t);
  }, [load]);
  return (
    <div className="page-container wide-page">
      <div className="page-heading row between">
        <div>
          <span className="eyebrow">THE HEART OF THE HOUSE</span>
          <h1>
            Let’s get <em>cooking.</em>
          </h1>
          <p>Welcome, {user?.name}. Keep every table happy.</p>
        </div>
        <button
          className="button outline small"
          onClick={() => load().catch((e) => setError(e.message))}
        >
          <RefreshCw size={16} />
          Refresh board
        </button>
      </div>
      <div className="workspace-tabs">
        {["Kitchen board", "Tables", "Reservations"].map((t) => (
          <button
            key={t}
            className={t === tab ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t === "Kitchen board" ? (
              <ChefHat size={17} />
            ) : t === "Tables" ? (
              <UtensilsCrossed size={17} />
            ) : (
              <Clock size={17} />
            )}{" "}
            {t}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <Spinner />
      ) : tab === "Kitchen board" ? (
        <>
          <div className="board-summary">
            <span className="live-dot" />
            Live kitchen · Refreshes every 12 seconds
            <span>
              {
                orders.filter(
                  (o) => !["Completed", "Cancelled"].includes(o.status),
                ).length
              }{" "}
              active orders
            </span>
          </div>
          <div className="kanban">
            {["Placed", "Preparing", "Ready", "Served"].map((status) => (
              <section className="kanban-column" key={status}>
                <div className="row between">
                  <h3>{status === "Placed" ? "Incoming" : status}</h3>
                  <span className="count-pill">
                    {orders.filter((o) => o.status === status).length}
                  </span>
                </div>
                {orders
                  .filter((o) => o.status === status)
                  .map((o) => (
                    <article className="kitchen-card" key={o.order_id}>
                      <div className="row between">
                        <b>#{o.order_id}</b>
                        <span className="badge">
                          {o.table
                            ? "Table " + o.table.table_number
                            : "Takeaway"}
                        </span>
                      </div>
                      <p>{o.customer.name}</p>
                      <div className="kitchen-items">
                        {o.items.map((l) => (
                          <div key={l.order_item_id}>
                            <b>{l.quantity}×</b> {l.item.item_name}
                            <small>{l.status}</small>
                          </div>
                        ))}
                      </div>
                      <div className="row between">
                        <b>{money(o.total_amount)}</b>
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              setSelected(
                                await api<Order>(`orders/${o.order_id}`),
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Open ticket
                          <ArrowRight size={15} />
                        </button>
                      </div>
                      <small className="ticket-hint">
                        Open to see kitchen instructions & update status
                      </small>
                    </article>
                  ))}
                {!orders.some((o) => o.status === status) && (
                  <div className="kanban-empty">All clear for now.</div>
                )}
              </section>
            ))}
          </div>
        </>
      ) : tab === "Tables" ? (
        <div className="table-management">
          {tables.map((t) => (
            <article className="panel table-manage-card" key={t.table_id}>
              <span className="table-drawing">{t.table_number}</span>
              <h3>Table {t.table_number}</h3>
              <p>{t.capacity} seats</p>
              <Badge status={t.status} />
              <label className="field space-top">
                Occupancy
                <select
                  value={t.status}
                  disabled={user?.staffRole === "Chef"}
                  onChange={async (e) => {
                    try {
                      await api(`staff/tables/${t.table_id}`, "PATCH", {
                        status: e.target.value,
                      });
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <option>Available</option>
                  <option>Reserved</option>
                  <option>Occupied</option>
                </select>
              </label>
            </article>
          ))}
        </div>
      ) : (
        <Reservations user={user} />
      )}
      <p className="fine-print space-top">
        Kitchen permissions follow your staff role. Chefs prepare orders,
        waiters serve and manage tables, cashiers settle bills, and managers
        oversee all operations.
      </p>
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
