"use client";
import { useEffect, useState, useCallback } from "react";
import { CalendarDays, Users, Clock, Check, ArrowRight } from "lucide-react";
import type { User, Table, Reservation } from "./types";
import { api, ErrorBox, Empty, Badge, Modal, Spinner } from "./shared";
export default function Reservations({ user }: { user: User | null }) {
  const [reservations, setReservations] = useState<Reservation[]>([]),
    [tables, setTables] = useState<Table[]>([]),
    [date, setDate] = useState(() =>
      new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    ),
    [time, setTime] = useState("19:00"),
    [guests, setGuests] = useState(2),
    [duration, setDuration] = useState(90),
    [searched, setSearched] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [selected, setSelected] = useState<Table | null>(null),
    [cancel, setCancel] = useState<Reservation | null>(null),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const r = await api<{ reservations: Reservation[] }>("reservations");
    setReservations(r.reservations);
  }, []);
  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  async function search() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const r = await api<{ tables: Table[] }>(
        `tables/available?date=${date}&time=${time}&guest_count=${guests}&duration_minutes=${duration}`,
      );
      setTables(r.tables);
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
      setTables([]);
    } finally {
      setBusy(false);
    }
  }
  async function reserve() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ reservation_id: number }>("reservations", "POST", {
        table_id: selected.table_id,
        date,
        time,
        guest_count: guests,
        duration_minutes: duration,
      });
      setSuccess(
        `Your table is booked! Reservation #${r.reservation_id} · ${date} at ${time} IST.`,
      );
      setSelected(null);
      setSearched(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }
  const invalidate = () => {
    setSearched(false);
    setTables([]);
    setError("");
  };
  return (
    <div className="page-container">
      <div className="page-heading">
        <span className="eyebrow">SAVED YOU A SEAT</span>
        <h1>
          A table for your <em>kind of evening.</em>
        </h1>
        <p>Good company deserves a good table. Find yours here.</p>
      </div>
      <div className="reservation-layout">
        <section className="panel booking-panel">
          <div className="panel-title">
            <CalendarDays size={23} />
            <div>
              <h2>Let’s make a date</h2>
              <p>Open daily, 11 AM – 11 PM · India Standard Time</p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <div className="form-grid">
              <label className="field">
                Date
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    setDate(e.target.value);
                    invalidate();
                  }}
                  required
                />
              </label>
              <label className="field">
                Arrival time
                <input
                  type="time"
                  value={time}
                  min="11:00"
                  max="22:30"
                  onChange={(e) => {
                    setTime(e.target.value);
                    invalidate();
                  }}
                  required
                />
              </label>
              <label className="field">
                Party size
                <select
                  value={guests}
                  onChange={(e) => {
                    setGuests(Number(e.target.value));
                    invalidate();
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "guest" : "guests"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Time at the table
                <select
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value));
                    invalidate();
                  }}
                >
                  {[30, 60, 90, 120, 180, 240].map((n) => (
                    <option value={n} key={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="button primary full" disabled={busy}>
              {busy ? "Finding your table…" : "Find available tables"}
              <ArrowRight size={17} />
            </button>
          </form>
          <ErrorBox error={error} />
          {success && (
            <div className="success-box" role="status">
              <Check size={20} />
              {success}
            </div>
          )}
          {searched && (
            <section className="space-top">
              <h3>{tables.length} tables available</h3>
              <div className="table-options">
                {tables.map((t) => (
                  <button
                    className="table-option"
                    key={t.table_id}
                    onClick={() => setSelected(t)}
                    disabled={user?.role !== "customer"}
                  >
                    <span className="table-drawing">{t.table_number}</span>
                    <b>Table {t.table_number}</b>
                    <span>
                      <Users size={14} />
                      {t.capacity} seats
                    </span>
                    <small>Choose this table</small>
                  </button>
                ))}
              </div>
              {tables.length === 0 && (
                <Empty title="A full house for that time">
                  Try another time or a smaller party.
                </Empty>
              )}
            </section>
          )}
        </section>
        <aside className="reservation-note">
          <span className="eyebrow">A WARM WELCOME AWAITS</span>
          <h2>
            Make time
            <br />
            for <em>good food.</em>
          </h2>
          <p>
            Catch up over a slow lunch, celebrate something special, or turn an
            ordinary evening into a lovely one.
          </p>
          <div>
            <Clock size={18} />
            <span>
              Your reservation includes the full time you select. Adjacent
              bookings can start exactly when yours ends.
            </span>
          </div>
          <div>
            <Users size={18} />
            <span>
              Groups larger than eight? Our team will help you find the right
              arrangement.
            </span>
          </div>
          <div>
            <CalendarDays size={18} />
            <span>
              Plans change. Cancel your reservation any time before it starts.
            </span>
          </div>
        </aside>
      </div>
      <section className="space-top">
        <div className="section-heading">
          <h2>
            {user?.role === "customer"
              ? "Your upcoming get-togethers"
              : "Reservation schedule"}
          </h2>
          <span className="muted">All times shown in IST</span>
        </div>
        {loading ? (
          <Spinner />
        ) : reservations.length === 0 ? (
          <Empty title="Your next meal is waiting">
            Make a reservation above to get started.
          </Empty>
        ) : (
          <div className="reservation-list">
            {reservations.map((r) => (
              <article className="reservation-card" key={r.reservation_id}>
                <div className="calendar-tile">
                  <span>
                    {new Date(r.reservation_date).toLocaleDateString("en-IN", {
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <b>{new Date(r.reservation_date).getUTCDate()}</b>
                </div>
                <div>
                  <h3>
                    Table {r.table.table_number} <Badge status={r.status} />
                  </h3>
                  <p>
                    {r.reservation_time.slice(11, 16)} IST ·{" "}
                    {r.duration_minutes} minutes · {r.guest_count} guests
                  </p>
                  <small>
                    Reservation #{r.reservation_id}
                    {user?.role !== "customer" ? " · " + r.customer.name : ""}
                  </small>
                </div>
                {r.status === "Confirmed" && (
                  <div className="row">
                    {user?.role !== "customer" && (
                      <button
                        className="button outline small"
                        onClick={async () => {
                          try {
                            await api(
                              `reservations/${r.reservation_id}`,
                              "PATCH",
                              { status: "Completed" },
                            );
                            await load();
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Complete
                      </button>
                    )}
                    <button
                      className="text-button danger"
                      onClick={() => setCancel(r)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <Modal
          title="A seat with your name on it"
          onClose={() => setSelected(null)}
        >
          <p>
            Reserve <b>Table {selected.table_number}</b> for{" "}
            <b>{guests} guests</b> on <b>{date}</b> at <b>{time} IST</b> for{" "}
            {duration} minutes?
          </p>
          <p className="muted">
            We’ll check availability once more when you confirm.
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={reserve}
          >
            {busy ? "Booking…" : "Confirm reservation"}
            <Check size={18} />
          </button>
        </Modal>
      )}
      {cancel && (
        <Modal title="Cancel this reservation?" onClose={() => setCancel(null)}>
          <p>
            Reservation #{cancel.reservation_id} for Table{" "}
            {cancel.table.table_number} will be cancelled.
          </p>
          <button
            className="button danger-button full"
            onClick={async () => {
              try {
                await api(`reservations/${cancel.reservation_id}`, "PATCH", {
                  status: "Cancelled",
                });
                setCancel(null);
                await load();
              } catch (e) {
                setError((e as Error).message);
                setCancel(null);
              }
            }}
          >
            Cancel reservation
          </button>
        </Modal>
      )}
    </div>
  );
}
