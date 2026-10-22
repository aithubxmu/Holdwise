"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMessages,
  getListMessagesQueryKey,
  useGetDemoContext,
  getGetDemoContextQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey,
  type InboxMessage,
  type InboxMessageStatus,
  type InboxMessageCustomerType,
  type DemoUserRole,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  CircleAlert,
  FileText,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Inbox as InboxIcon,
  X,
  Wrench,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { STATUS_META, TYPE_META, initials, relTime, fullTime, clock } from "@/lib/format";

const ROLE_KEY = "quotelah.actingRole";
const ROLES: { role: DemoUserRole; label: string; note: string }[] = [
  { role: "owner", label: "Owner", note: "Will approve quotes" },
  { role: "staff", label: "Staff", note: "Will draft quotes" },
  { role: "viewer", label: "Viewer", note: "Read only" },
];
const ROLE_ICON = { owner: ShieldCheck, staff: Wrench, viewer: Eye } as const;

type StatusFilter = "all" | InboxMessageStatus;
type TypeFilter = "all" | InboxMessageCustomerType;

export function Inbox() {
  const qc = useQueryClient();
  const messages = useListMessages();
  const ctx = useGetDemoContext();
  const health = useHealthCheck();

  const [role, setRole] = useState<DemoUserRole>("staff");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [ctype, setCtype] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(ROLE_KEY);
    if (saved === "owner" || saved === "staff" || saved === "viewer") setRole(saved);
  }, []);
  const chooseRole = (r: DemoUserRole) => {
    setRole(r);
    window.localStorage.setItem(ROLE_KEY, r);
  };

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

  const actingUser = ctx.data?.users.find((u) => u.role === role);
  const refreshing = messages.isFetching || ctx.isFetching;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListMessagesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDemoContextQueryKey() });
    qc.invalidateQueries({ queryKey: getHealthCheckQueryKey() });
  };

  const filtersActive = query !== "" || status !== "all" || ctype !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setCtype("all");
  };

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-col">
      <div className="tape-stripe h-1.5 w-full" aria-hidden />

      {/* Header */}
      <header className="border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-deep font-display text-lg font-extrabold text-tape">
              Q
            </div>
            <div className="leading-tight">
              <div className="font-display text-xl font-extrabold tracking-tight" data-testid="text-app-name">
                QuoteLah
              </div>
              <div className="text-xs text-ink-soft" data-testid="text-shop-name">
                {ctx.isLoading ? <span className="skel inline-block h-3 w-32 align-middle" /> : ctx.data?.shopName ?? "Ah Seng Hardware"}
                {" "}· Kajang
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <span
              className="rounded-full border border-dashed border-teal/50 bg-teal-wash px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider text-teal-deep"
              data-testid="text-milestone"
            >
              {ctx.data?.milestone ?? "M1"} · Inbox
            </span>
            <HealthDot ok={health.data?.status === "ok"} loading={health.isLoading} error={health.isError} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Act as"
              className="flex items-center rounded-xl border bg-paper p-1"
              data-testid="switch-role"
            >
              <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft sm:inline">
                Act as
              </span>
              {ROLES.map(({ role: r, label }) => {
                const Icon = ROLE_ICON[r];
                const on = role === r;
                return (
                  <button
                    key={r}
                    role="radio"
                    aria-checked={on}
                    onClick={() => chooseRole(r)}
                    data-testid={`button-role-${r}`}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95 ${
                      on ? "bg-teal-deep text-white shadow-sm" : "text-ink-soft hover:bg-muted hover:text-ink"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh inbox"
              data-testid="button-refresh"
              className="grid h-10 w-10 place-items-center rounded-xl border bg-card text-ink-soft transition hover:border-teal hover:text-teal active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "spin" : ""}`} />
            </button>
          </div>
        </div>
        <div className="border-t bg-paper/70">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs text-ink-soft md:px-6">
            <span data-testid="text-acting-user">
              Acting as <b className="text-ink">{actingUser?.name ?? ROLES.find((x) => x.role === role)?.label}</b>{" "}
              ({ROLES.find((x) => x.role === role)?.note.toLowerCase()}) · simulated, no real sign-in
            </span>
            <span className="ml-auto font-mono">
              Demo data only. All customers, phones and messages are synthetic.
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[minmax(320px,420px)_1fr] md:px-6 md:py-5">
        {/* List column */}
        <section className={`flex min-h-0 flex-col ${mobileDetail ? "hidden md:flex" : "flex"}`}>
          <Stats ctx={ctx.data} loading={ctx.isLoading} newCount={counts.new ?? 0} />

          <div className="mt-3 rounded-2xl border bg-card">
            <div className="p-3">
              <label className="flex items-center gap-2 rounded-xl border bg-paper px-3 py-2 transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
                <Search className="h-4 w-4 text-ink-soft" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, item, zone, phone"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-ink-soft/70"
                  data-testid="input-search"
                />
                {query && (
                  <button onClick={() => setQuery("")} aria-label="Clear search" data-testid="button-clear-search">
                    <X className="h-4 w-4 text-ink-soft hover:text-ink" />
                  </button>
                )}
              </label>
              <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                <Chip on={status === "all"} onClick={() => setStatus("all")} count={counts.all ?? 0} id="all">
                  All
                </Chip>
                {(Object.keys(STATUS_META) as InboxMessageStatus[]).map((s) => (
                  <Chip key={s} on={status === s} onClick={() => setStatus(s)} count={counts[s] ?? 0} id={s} dot={STATUS_META[s].dot}>
                    {STATUS_META[s].label}
                  </Chip>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-ink-soft">Customer</span>
                <select
                  value={ctype}
                  onChange={(e) => setCtype(e.target.value as TypeFilter)}
                  className="rounded-lg border bg-paper px-2 py-1 text-xs font-medium outline-none focus:border-teal"
                  data-testid="select-customer-type"
                >
                  <option value="all">All types</option>
                  {(Object.keys(TYPE_META) as InboxMessageCustomerType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_META[t].label}
                    </option>
                  ))}
                </select>
                <span className="ml-auto font-mono text-ink-soft" data-testid="text-result-count">
                  {filtered.length}/{all.length}
                </span>
              </div>
            </div>

            <ul className="max-h-[calc(100dvh-330px)] min-h-[240px] overflow-y-auto border-t" data-testid="list-messages">
              {messages.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
              ) : messages.isError ? (
                <ErrorBlock onRetry={() => messages.refetch()} what="the inbox" />
              ) : all.length === 0 ? (
                <Empty title="Inbox is quiet" body="No WhatsApp enquiries yet. New ones from the seeded demo will appear here." />
              ) : filtered.length === 0 ? (
                <Empty
                  title="Nothing matches"
                  body="Try a shorter word, like 'cement' or a zone name."
                  action={
                    filtersActive ? (
                      <button onClick={clearFilters} className="text-sm font-semibold text-teal underline-offset-4 hover:underline" data-testid="button-clear-filters">
                        Clear filters
                      </button>
                    ) : null
                  }
                />
              ) : (
                filtered.map((m, i) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    i={i}
                    active={selected?.id === m.id}
                    onClick={() => {
                      setSelectedId(m.id);
                      setMobileDetail(true);
                    }}
                  />
                ))
              )}
            </ul>
          </div>
        </section>

        {/* Detail column */}
        <section className={`min-h-0 ${mobileDetail ? "block" : "hidden md:block"}`}>
          <button
            onClick={() => setMobileDetail(false)}
            className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-teal md:hidden"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back to inbox
          </button>
          {messages.isLoading ? (
            <DetailSkeleton />
          ) : messages.isError ? (
            <div className="rounded-2xl border bg-card">
              <ErrorBlock onRetry={() => messages.refetch()} what="this message" />
            </div>
          ) : selected ? (
            <Detail key={selected.id} m={selected} history={history} />
          ) : (
            <div className="grid h-full min-h-[300px] place-items-center rounded-2xl border border-dashed bg-card/60">
              <Empty title="Pick a message" body="Select an enquiry to read the original WhatsApp text and customer context." />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function HealthDot({ ok, loading, error }: { ok: boolean; loading: boolean; error: boolean }) {
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

function Stats({
  ctx,
  loading,
  newCount,
}: {
  ctx?: { productCount: number; customerCount: number; zoneCount: number };
  loading: boolean;
  newCount: number;
}) {
  const items = [
    { k: "New", v: newCount, hi: true },
    { k: "Customers", v: ctx?.customerCount },
    { k: "Products", v: ctx?.productCount },
    { k: "Zones", v: ctx?.zoneCount },
  ];
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-2xl border bg-card">
      {items.map((it, i) => (
        <div key={it.k} className={`px-3 py-2.5 ${i ? "border-l" : ""} ${it.hi ? "bg-tape-wash" : ""}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{it.k}</div>
          <div className="font-display text-xl font-bold tabular-nums" data-testid={`stat-${it.k.toLowerCase()}`}>
            {loading && !it.hi ? <span className="skel mt-1 block h-5 w-8" /> : it.v ?? "–"}
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({
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

function Avatar({ name, type, size = "md" }: { name: string; type: InboxMessageCustomerType; size?: "md" | "lg" }) {
  const tone =
    type === "contractor" ? "bg-teal-deep text-tape" : type === "regular" ? "bg-teal-wash text-teal-deep" : "bg-muted text-ink";
  return (
    <div className={`grid shrink-0 place-items-center rounded-full font-display font-bold ${tone} ${size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm"}`}>
      {initials(name)}
    </div>
  );
}

function MessageRow({ m, i, active, onClick }: { m: InboxMessage; i: number; active: boolean; onClick: () => void }) {
  const st = STATUS_META[m.status];
  return (
    <li className="rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
      <button
        onClick={onClick}
        data-testid={`row-message-${m.id}`}
        className={`group relative flex w-full gap-3 border-b px-3 py-3 text-left transition-colors ${
          active ? "bg-teal-wash/70" : "hover:bg-paper"
        }`}
      >
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
            <span className="truncate text-ink-soft">
              {TYPE_META[m.customerType].label} · {m.zone}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

function Detail({ m, history }: { m: InboxMessage; history: InboxMessage[] }) {
  const st = STATUS_META[m.status];
  const others = history.filter((h) => h.id !== m.id);
  return (
    <div className="rise grid gap-4 xl:grid-cols-[1fr_300px]">
      <article className="overflow-hidden rounded-2xl border bg-card" data-testid="panel-message-detail">
        <div className="flex items-center gap-3 border-b px-4 py-3 md:px-5">
          <Avatar name={m.customerName} type={m.customerType} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold" data-testid="text-customer-name">
              {m.customerName}
            </h1>
            <div className="font-mono text-xs text-ink-soft" data-testid="text-received-at">
              #{m.id} · {fullTime(m.receivedAt)}
            </div>
          </div>
          <span className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${st.cls}`} data-testid="status-message">
            {st.label}
          </span>
        </div>

        <div className="bg-[linear-gradient(hsl(var(--teal-wash)/.5),hsl(var(--paper)))] px-4 py-6 md:px-8">
          <div className="mb-3 text-center font-mono text-[10px] uppercase tracking-[.2em] text-ink-soft">Original WhatsApp message</div>
          <div className="bubble ml-2 max-w-[560px] rounded-2xl rounded-tl-none bg-card px-4 py-3 shadow-[0_1px_0_hsl(var(--line)),0_8px_24px_-12px_hsl(var(--teal-deep)/.25)]">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed" data-testid="text-message-body">
              {m.body}
            </p>
            <div className="mt-1 text-right font-mono text-[10px] text-ink-soft">{clock(m.receivedAt)}</div>
          </div>
        </div>

        <div className="border-t px-4 py-4 md:px-5">
          <div className="flex gap-3 rounded-xl border border-dashed border-teal/40 bg-teal-wash/40 p-3.5">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
            <div>
              <div className="text-sm font-semibold text-teal-deep">Quotation drafting comes next</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
                In the next milestone, QuoteLah will read this message, match items to the shop catalogue and prepare a
                draft quotation for staff to review. For now, this inbox is read only.
              </p>
            </div>
          </div>
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
            <div className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 text-ink-soft" />
              <dd className="font-mono text-[13px]" data-testid="text-customer-phone">{m.phone}</dd>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 text-ink-soft" />
              <dd data-testid="text-customer-zone">{m.zone}</dd>
            </div>
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

function RowSkeleton() {
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

function DetailSkeleton() {
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

function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
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

function ErrorBlock({ onRetry, what }: { onRetry: () => void; what: string }) {
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
