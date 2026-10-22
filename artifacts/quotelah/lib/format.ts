import type { InboxMessageCustomerType, InboxMessageStatus } from "@workspace/api-client-react";

export const STATUS_META: Record<InboxMessageStatus, { label: string; cls: string; dot: string }> = {
  new: { label: "New", cls: "bg-tape-wash text-ink", dot: "bg-tape" },
  drafted: { label: "Drafted", cls: "bg-teal-wash text-teal-deep", dot: "bg-teal" },
  needs_review: { label: "Needs review", cls: "bg-brick-wash text-brick", dot: "bg-brick" },
  awaiting_approval: { label: "Awaiting approval", cls: "bg-muted text-ink", dot: "bg-ink-soft" },
  sent: { label: "Sent", cls: "bg-teal text-white", dot: "bg-teal-deep" },
  rejected: { label: "Rejected", cls: "bg-muted text-ink-soft line-through decoration-1", dot: "bg-ink-soft/50" },
};

export const TYPE_META: Record<InboxMessageCustomerType, { label: string; short: string }> = {
  walk_in: { label: "Walk-in", short: "WALK-IN" },
  regular: { label: "Regular", short: "REGULAR" },
  contractor: { label: "Contractor", short: "CONTRACTOR" },
};

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function relTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.round(h / 24);
  if (d < 7) return d + "d ago";
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export function fullTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function clock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
}
