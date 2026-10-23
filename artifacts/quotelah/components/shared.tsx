"use client";

import type { ReactNode } from "react";
import type { InboxMessageCustomerType } from "@workspace/api-client-react";
import { CircleAlert, Inbox as InboxIcon, RefreshCw } from "lucide-react";
import { initials } from "@/lib/format";

export function Avatar({ name, type, size = "md" }: { name: string; type: InboxMessageCustomerType; size?: "md" | "lg" }) {
  const tone =
    type === "contractor" ? "bg-teal-deep text-tape" : type === "regular" ? "bg-teal-wash text-teal-deep" : "bg-muted text-ink";
  return (
    <div className={`grid shrink-0 place-items-center rounded-full font-display font-bold ${tone} ${size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm"}`}>
      {initials(name)}
    </div>
  );
}

export function HealthDot({ ok, loading, error }: { ok: boolean; loading: boolean; error: boolean }) {
  const label = loading ? "Checking API" : ok ? "API online" : error ? "API unreachable" : "API status unknown";
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-soft" data-testid="status-api">
      <span className={`relative h-2 w-2 rounded-full ${loading ? "bg-tape" : ok ? "bg-teal" : "bg-brick"}`}>
        {ok && <span className="absolute inset-0 animate-ping rounded-full bg-teal/50" />}
      </span>
      {label}
    </span>
  );
}

export function Chip({
  on,
  onClick,
  count,
  children,
  id,
  dot,
}: {
  on: boolean;
  onClick: () => void;
  count: number;
  children: ReactNode;
  id: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`filter-status-${id}`}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition active:scale-95 ${
        on ? "border-ink bg-ink text-paper" : "bg-paper text-ink-soft hover:border-ink-soft hover:text-ink"
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {children}
      <span className={`font-mono text-[10px] ${on ? "text-tape" : "text-ink-soft/70"}`}>{count}</span>
    </button>
  );
}

export function RowSkeleton() {
  return (
    <li className="flex gap-3 border-b px-3 py-3">
      <div className="skel h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skel h-3.5 w-1/2" />
        <div className="skel h-3 w-full" />
        <div className="skel h-3 w-1/3" />
      </div>
    </li>
  );
}

export function DetailSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="skel h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <div className="skel h-4 w-40" />
          <div className="skel h-3 w-28" />
        </div>
      </div>
      <div className="skel mt-6 h-28 w-full max-w-[560px] rounded-2xl" />
      <div className="skel mt-6 h-16 w-full rounded-xl" />
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="state-empty">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-dashed border-line text-ink-soft">
        <InboxIcon className="h-5 w-5" />
      </div>
      <div className="mt-3 font-display font-bold">{title}</div>
      <p className="mt-1 max-w-[280px] text-[13px] text-ink-soft">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorBlock({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="state-error">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brick-wash text-brick">
        <CircleAlert className="h-5 w-5" />
      </div>
      <div className="mt-3 font-display font-bold">Couldn't load {what}</div>
      <p className="mt-1 max-w-[280px] text-[13px] text-ink-soft">The shop server didn't answer. Check the API is running, then try again.</p>
      <button
        onClick={onRetry}
        className="mt-3 flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-paper transition active:scale-95"
        data-testid="button-retry"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
}

/** Inline error strip for failed actions (permission, open flags, stock). */
export function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-brick/30 bg-brick-wash px-3 py-2 text-[13px] text-brick" role="alert" data-testid="text-action-error">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
