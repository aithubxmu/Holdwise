"use client";

import type { ReactNode } from "react";
import { useGetDashboard, type QuoteLineFlagsItem } from "@workspace/api-client-react";
import { BarChart3, Clock, ShieldCheck, Sparkles, Timer, TriangleAlert } from "lucide-react";
import { FLAG_META } from "@/lib/format";
import { Empty, ErrorBlock } from "./shared";

/** Measurable benefit, straight from the database. The manual baseline is the owner's own assumption. */
export function Dashboard({ onOpenInbox }: { onOpenInbox: () => void }) {
  const d = useGetDashboard();
  if (d.isError) return <main className="mx-auto w-full max-w-[1000px] px-4 py-5"><ErrorBlock onRetry={() => d.refetch()} what="the dashboard" /></main>;
  const x = d.data;
  return (
    <main className="mx-auto w-full max-w-[1000px] flex-1 space-y-4 px-4 py-5 md:px-6" data-testid="view-dashboard">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><BarChart3 className="h-6 w-6 text-teal" /> Dashboard</h1>
        <p className="mt-1 text-sm text-ink-soft">Every figure is counted from this shop's quotes and activity log. Demo data is synthetic.</p>
      </div>
      {!x ? <div className="skel h-48 rounded-2xl" /> : x.quotesDrafted === 0 ? (
        <div className="rounded-2xl border bg-card">
          <Empty title="No quotes yet" body="Draft and send a few quotations from the inbox; the numbers appear here."
            action={<button onClick={onOpenInbox} className="text-sm font-semibold text-teal hover:underline">Go to inbox</button>} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<BarChart3 className="h-4 w-4" />} label="Quotes sent" value={String(x.sentToday)} sub={`today · ${x.sentThisWeek} this week · ${x.sentTotal} total`} testId="stat-sent" />
            <Stat icon={<Timer className="h-4 w-4" />} label="Avg response" value={x.avgResponseMinutes === null ? "—" : `${x.avgResponseMinutes} min`}
              sub={`from message to sent · by hand: ${x.manualMinutesPerQuote} min*`} testId="stat-response" />
            <Stat icon={<Clock className="h-4 w-4" />} label="Time saved" value={x.hoursSaved === null ? "—" : `${x.hoursSaved} h`}
              sub={`${x.sentTotal} sent × (${x.manualMinutesPerQuote} − ${x.avgResponseMinutes ?? "?"} min)`} testId="stat-saved" hi />
            <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Owner approvals" value={String(x.ownerApproved)} sub={`approved · ${x.awaitingApproval} waiting`} testId="stat-approvals" />
          </div>
          <p className="text-[11px] text-ink-soft">
            * Manual baseline = {x.manualMinutesPerQuote} minutes per quote. This is an assumption set by the owner in Settings, not a measurement.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4" data-testid="panel-errors-prevented">
              <h2 className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-4 w-4 text-brick" /> Errors prevented</h2>
              <p className="mt-0.5 text-[12px] text-ink-soft">Problems flagged on a draft that a person fixed before the quote went out.</p>
              {x.flagsResolved.length === 0 ? <p className="mt-3 text-[13px] text-ink-soft">None resolved yet.</p> : (
                <ul className="mt-3 space-y-1.5">
                  {x.flagsResolved.map((f) => (
                    <li key={f.flag} className="flex items-center gap-2 text-[13px]">
                      <span className="w-40 shrink-0 truncate">{FLAG_META[f.flag as QuoteLineFlagsItem]?.label ?? f.flag}</span>
                      <span className="h-2 rounded-full bg-brick" style={{ width: `${Math.min(100, f.count * 18)}px` }} />
                      <span className="font-mono tabular-nums">{f.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl border bg-card p-4" data-testid="panel-parser-share">
              <h2 className="flex items-center gap-1.5 font-semibold"><Sparkles className="h-4 w-4 text-teal" /> Who read the messages</h2>
              <p className="mt-0.5 text-[12px] text-ink-soft">Drafts read by AI vs the rules fallback.</p>
              <Share ai={x.parsedByAi} rules={x.parsedByRules} />
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ icon, label, value, sub, testId, hi }: { icon: ReactNode; label: string; value: string; sub: string; testId: string; hi?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${hi ? "bg-tape-wash" : "bg-card"}`} data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{icon}{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-ink-soft">{sub}</div>
    </div>
  );
}

function Share({ ai, rules }: { ai: number; rules: number }) {
  const total = ai + rules;
  const aiPct = total ? Math.round((ai / total) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div className="bg-teal" style={{ width: `${aiPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[13px]">
        <span><b>{ai}</b> by AI ({aiPct}%)</span>
        <span><b>{rules}</b> by rules ({total ? 100 - aiPct : 0}%)</span>
      </div>
    </div>
  );
}
