"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, Leaf, AlertCircle } from "lucide-react";
export const money = (n: string | number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(n));
export async function api<T = Record<string, unknown>>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const r = await fetch("/api/" + url, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "Something went wrong. Please retry.");
  return b;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={onClose}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Badge({ status }: { status: string }) {
  return <span className={"badge " + status.toLowerCase()}>{status}</span>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Leaf size={34} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error-box">
      <AlertCircle size={18} />
      {error}
    </div>
  ) : null;
}
export function Spinner() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Getting things ready…
    </div>
  );
}
export const splitList = (s: string) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
export const instructions = (c: {
  size: string;
  remove: string[];
  add: string[];
  special_instruction: string;
}) =>
  [
    c.size !== "Regular" ? c.size : "",
    c.remove?.length ? "No " + c.remove.join(", ") : "",
    c.add?.length ? "Add " + c.add.join(", ") : "",
    c.special_instruction,
  ]
    .filter(Boolean)
    .join(" · ");
