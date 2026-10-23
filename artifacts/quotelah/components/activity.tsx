"use client";

import { useState } from "react";
import { useListActivity, type ActivityEntry } from "@workspace/api-client-react";
import { fullTime } from "@/lib/format";
import { Empty, ErrorBlock } from "./shared";

const TONE: Record<string, string> = {
  quote_sent: "bg-teal", stock_reserved: "bg-teal", quote_approved: "bg-teal-deep",
  approval_requested: "bg-tape", approval_returned: "bg-brick", message_received: "bg-ink-soft/50",
};

/** Audit trail: who did what, when, with before/after values. */
export function ActivityLog() {
  const [quoteId, setQuoteId] = useState("");
  const id = Number(quoteId);
  const log = useListActivity(Number.isInteger(id) && id > 0 ? { quoteId: id } : undefined);
  return (
    <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-5 md:px-6" data-testid="view-activity">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Activity log</h1>
          <p className="mt-1 text-sm text-ink-soft">Every draft, edit, approval and send is recorded with who did it and what changed.</p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
          Quote #
          <input value={quoteId} onChange={(e) => setQuoteId(e.target.value.replace(/\D/g, ""))} placeholder="all" inputMode="numeric"
            className="w-16 rounded-lg border bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-teal" data-testid="input-activity-quote" />
        </label>
      </div>
      <div className="mt-4 rounded-2xl border bg-card p-4">
        {log.isLoading ? (
          <div className="skel h-32" />
        ) : log.isError ? (
          <ErrorBlock onRetry={() => log.refetch()} what="the activity log" />
        ) : !log.data?.length ? (
          <Empty title="No activity yet" body="Draft a quotation from the inbox and every step will be listed here." />
        ) : (
          <ol className="relative space-y-3 border-l-2 border-line pl-4">
            {log.data.map((e) => <Entry key={e.id} e={e} />)}
          </ol>
        )}
      </div>
    </main>
  );
}

function Entry({ e }: { e: ActivityEntry }) {
  const details = e.details as { before?: unknown; after?: unknown; comment?: string };
  const hasDiff = details.before != null || details.after != null;
  return (
    <li className="relative" data-testid={`activity-${e.id}`}>
      <span className={`absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card ${TONE[e.action] ?? "bg-ink"}`} />
      <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
        <b>{e.actorName ?? "System"}</b>
        {e.actorRole && <span className="rounded bg-muted px-1 font-mono text-[10px] uppercase">{e.actorRole}</span>}
        <span className="ml-auto font-mono text-[11px] text-ink-soft">{fullTime(e.at)}</span>
      </div>
      <p className="text-[14px]">{e.summary}</p>
      {hasDiff && (
        <details className="mt-1 text-[12px] text-ink-soft">
          <summary className="cursor-pointer">Before / after</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-paper p-2 font-mono text-[11px] leading-snug">
            {JSON.stringify({ before: details.before ?? null, after: details.after ?? null }, null, 1)}
          </pre>
        </details>
      )}
    </li>
  );
}
