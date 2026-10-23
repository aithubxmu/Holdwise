"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useListMessages,
  useGetDemoContext,
  type InboxMessage,
  type InboxMessageStatus,
  type InboxMessageCustomerType,
} from "@workspace/api-client-react";
import { ArrowLeft, MapPin, Phone, Search, X } from "lucide-react";
import { STATUS_META, TYPE_META, relTime, fullTime, clock } from "@/lib/format";
import type { Actor } from "@/lib/actor";
import { Avatar, Chip, DetailSkeleton, Empty, ErrorBlock, RowSkeleton } from "./shared";
import { QuotePanel } from "./quote-panel";

type StatusFilter = "all" | InboxMessageStatus;
type TypeFilter = "all" | InboxMessageCustomerType;

/** Step 1 of the journey: the WhatsApp enquiries waiting to become quotations. */
export function Inbox({ actor, selectedId, onSelect }: { actor: Actor; selectedId: number | null; onSelect: (id: number) => void }) {
  const messages = useListMessages();
  const ctx = useGetDemoContext();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [ctype, setCtype] = useState<TypeFilter>("all");
  const [mobileDetail, setMobileDetail] = useState(selectedId !== null);
  // A link like ?m=12 (from Approvals or Outbox) opens the message straight away on phones too.
  useEffect(() => { if (selectedId !== null) setMobileDetail(true); }, [selectedId]);

  const all = useMemo(
    () => [...(messages.data ?? [])].sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt)),
    [messages.data],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const m of all) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [all]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (m) =>
        (status === "all" || m.status === status) &&
        (ctype === "all" || m.customerType === ctype) &&
        (!q || [m.customerName, m.body, m.zone, m.phone].some((f) => f.toLowerCase().includes(q))),
    );
  }, [all, query, status, ctype]);

  const selected = all.find((m) => m.id === selectedId) ?? filtered[0] ?? null;
  const history = selected ? all.filter((m) => m.customerId === selected.customerId) : [];
  const filtersActive = query !== "" || status !== "all" || ctype !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setCtype("all");
  };

  return (
    <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[minmax(300px,380px)_1fr] md:px-6 md:py-5">
      <section className={`flex min-h-0 flex-col ${mobileDetail ? "hidden md:flex" : "flex"}`}>
        <Stats ctx={ctx.data} loading={ctx.isLoading} counts={counts} />
        <div className="mt-3 rounded-2xl border bg-card">
          <div className="p-3">
            <label className="flex items-center gap-2 rounded-xl border bg-paper px-3 py-2 transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
              <Search className="h-4 w-4 text-ink-soft" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, item, zone, phone"
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink-soft/70" data-testid="input-search" />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search" data-testid="button-clear-search">
                  <X className="h-4 w-4 text-ink-soft hover:text-ink" />
                </button>
              )}
            </label>
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              <Chip on={status === "all"} onClick={() => setStatus("all")} count={counts.all ?? 0} id="all">All</Chip>
              {(Object.keys(STATUS_META) as InboxMessageStatus[]).map((s) => (
                <Chip key={s} on={status === s} onClick={() => setStatus(s)} count={counts[s] ?? 0} id={s} dot={STATUS_META[s].dot}>
                  {STATUS_META[s].label}
                </Chip>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-ink-soft">Customer</span>
              <select value={ctype} onChange={(e) => setCtype(e.target.value as TypeFilter)}
                className="rounded-lg border bg-paper px-2 py-1 text-xs font-medium outline-none focus:border-teal" data-testid="select-customer-type">
                <option value="all">All types</option>
                {(Object.keys(TYPE_META) as InboxMessageCustomerType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_META[t].label}</option>
                ))}
              </select>
              <span className="ml-auto font-mono text-ink-soft" data-testid="text-result-count">{filtered.length}/{all.length}</span>
            </div>
          </div>
          <ul className="max-h-[calc(100dvh-360px)] min-h-[240px] overflow-y-auto border-t" data-testid="list-messages">
            {messages.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
            ) : messages.isError ? (
              <ErrorBlock onRetry={() => messages.refetch()} what="the inbox" />
            ) : all.length === 0 ? (
              <Empty title="Inbox is quiet" body="No WhatsApp enquiries yet. New ones from the seeded demo will appear here." />
            ) : filtered.length === 0 ? (
              <Empty title="Nothing matches" body="Try a shorter word, like 'cement' or a zone name."
                action={filtersActive ? <button onClick={clearFilters} className="text-sm font-semibold text-teal underline-offset-4 hover:underline" data-testid="button-clear-filters">Clear filters</button> : null} />
            ) : (
              filtered.map((m, i) => (
                <MessageRow key={m.id} m={m} i={i} active={selected?.id === m.id} onClick={() => { onSelect(m.id); setMobileDetail(true); }} />
              ))
            )}
          </ul>
        </div>
      </section>

      <section className={`min-h-0 ${mobileDetail ? "block" : "hidden md:block"}`}>
        <button onClick={() => setMobileDetail(false)} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-teal md:hidden" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </button>
        {messages.isLoading ? (
          <DetailSkeleton />
        ) : messages.isError ? (
          <div className="rounded-2xl border bg-card"><ErrorBlock onRetry={() => messages.refetch()} what="this message" /></div>
        ) : selected ? (
          <Detail key={selected.id} m={selected} history={history} actor={actor} />
        ) : (
          <div className="grid h-full min-h-[300px] place-items-center rounded-2xl border border-dashed bg-card/60">
            <Empty title="Pick a message" body="Select an enquiry to read the original WhatsApp text and draft a quotation." />
          </div>
        )}
      </section>
    </main>
  );
}

function Stats({ ctx, loading, counts }: { ctx?: { productCount: number; customerCount: number }; loading: boolean; counts: Record<string, number> }) {
  const items = [
    { k: "New", v: counts.new ?? 0, hi: true },
    { k: "To review", v: counts.needs_review ?? 0 },
    { k: "Sent", v: counts.sent ?? 0 },
    { k: "Products", v: ctx?.productCount, slow: true },
  ];
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-2xl border bg-card">
      {items.map((it, i) => (
        <div key={it.k} className={`px-3 py-2.5 ${i ? "border-l" : ""} ${it.hi ? "bg-tape-wash" : ""}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{it.k}</div>
          <div className="font-display text-xl font-bold tabular-nums" data-testid={`stat-${it.k.toLowerCase().replace(" ", "-")}`}>
            {loading && it.slow ? <span className="skel mt-1 block h-5 w-8" /> : it.v ?? "–"}
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageRow({ m, i, active, onClick }: { m: InboxMessage; i: number; active: boolean; onClick: () => void }) {
  const st = STATUS_META[m.status];
  return (
    <li className="rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
      <button onClick={onClick} data-testid={`row-message-${m.id}`}
        className={`group relative flex w-full gap-3 border-b px-3 py-3 text-left transition-colors ${active ? "bg-teal-wash/70" : "hover:bg-paper"}`}>
        <span className={`absolute inset-y-0 left-0 w-1 origin-center transition-transform duration-200 ${active ? "scale-y-100 bg-teal" : "scale-y-0 bg-teal"}`} />
        <Avatar name={m.customerName} type={m.customerType} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`truncate text-sm ${m.status === "new" ? "font-bold" : "font-semibold"}`}>{m.customerName}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-soft">{relTime(m.receivedAt)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{m.body}</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
            <span className={`rounded-md px-1.5 py-0.5 font-semibold ${st.cls}`}>{st.label}</span>
            <span className="truncate text-ink-soft">{TYPE_META[m.customerType].label} · {m.zone}</span>
          </div>
        </div>
      </button>
    </li>
  );
}

function Detail({ m, history, actor }: { m: InboxMessage; history: InboxMessage[]; actor: Actor }) {
  const st = STATUS_META[m.status];
  const others = history.filter((h) => h.id !== m.id);
  return (
    <div className="rise grid gap-4 2xl:grid-cols-[1fr_280px]">
      <article className="overflow-hidden rounded-2xl border bg-card" data-testid="panel-message-detail">
        <div className="flex items-center gap-3 border-b px-4 py-3 md:px-5">
          <Avatar name={m.customerName} type={m.customerType} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold" data-testid="text-customer-name">{m.customerName}</h1>
            <div className="font-mono text-xs text-ink-soft" data-testid="text-received-at">
              #{m.id} · {fullTime(m.receivedAt)} · {TYPE_META[m.customerType].label} · {m.phone}
            </div>
          </div>
          <span className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${st.cls}`} data-testid="status-message">{st.label}</span>
        </div>
        <div className="bg-[linear-gradient(hsl(var(--teal-wash)/.5),hsl(var(--paper)))] px-4 py-5 md:px-8">
          <div className="mb-3 text-center font-mono text-[10px] uppercase tracking-[.2em] text-ink-soft">Original WhatsApp message</div>
          <div className="bubble ml-2 max-w-[560px] rounded-2xl rounded-tl-none bg-card px-4 py-3 shadow-[0_1px_0_hsl(var(--line)),0_8px_24px_-12px_hsl(var(--teal-deep)/.25)]">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed" data-testid="text-message-body">{m.body}</p>
            <div className="mt-1 text-right font-mono text-[10px] text-ink-soft">{clock(m.receivedAt)}</div>
          </div>
        </div>
        <div className="border-t px-4 py-4 md:px-5">
          <QuotePanel messageId={m.id} quoteId={m.quoteId} actor={actor} />
        </div>
      </article>

      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card p-4" data-testid="panel-customer">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">Customer</div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={m.customerName} type={m.customerType} size="lg" />
            <div>
              <div className="font-display font-bold">{m.customerName}</div>
              <span className="mt-1 inline-block rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-tape" data-testid="text-customer-type">
                {TYPE_META[m.customerType].short}
              </span>
            </div>
          </div>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5"><Phone className="h-4 w-4 text-ink-soft" /><dd className="font-mono text-[13px]" data-testid="text-customer-phone">{m.phone}</dd></div>
            <div className="flex items-center gap-2.5"><MapPin className="h-4 w-4 text-ink-soft" /><dd data-testid="text-customer-zone">Home zone: {m.zone}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">Other enquiries</div>
            <span className="font-mono text-xs text-ink-soft">{others.length}</span>
          </div>
          {others.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-soft">First enquiry from this customer in the inbox.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {others.slice(0, 5).map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-2.5" data-testid={`history-message-${h.id}`}>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[h.status].dot}`} />
                    <span className="text-ink-soft">{STATUS_META[h.status].label}</span>
                    <span className="ml-auto font-mono text-ink-soft">{relTime(h.receivedAt)}</span>
                  </div>
                  <p className="line-clamp-2 text-[13px]">{h.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
