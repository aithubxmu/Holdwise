"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMessages,
  useGetDemoContext,
  useHealthCheck,
  useResetDemo,
  type DemoUserRole,
} from "@workspace/api-client-react";
import { BarChart3, Eye, FlaskConical, PlugZap, History, Inbox as InboxIcon, RefreshCw, RotateCcw, Send, Settings2, ShieldCheck, Wrench } from "lucide-react";
import { refreshAll, type Actor } from "@/lib/actor";
import { apiErrorMessage } from "@/lib/format";
import { HealthDot } from "./shared";
import { Inbox } from "./inbox";
import { Approvals } from "./approvals";
import { Outbox } from "./outbox";
import { ActivityLog } from "./activity";
import { SettingsView } from "./settings";
import { Dashboard } from "./dashboard";
import { OrbyteShell } from "./orbyte-shell";
import { OrbytePage } from "./orbyte-page";
import { AiEval } from "./ai-eval";

const ROLE_KEY = "quotelah.actingRole";
const ROLES: { role: DemoUserRole; label: string; note: string }[] = [
  { role: "owner", label: "Owner", note: "Approves quotes over the limits" },
  { role: "staff", label: "Staff", note: "Drafts and sends routine quotes" },
  { role: "viewer", label: "Viewer", note: "Read only" },
];
const ROLE_ICON = { owner: ShieldCheck, staff: Wrench, viewer: Eye } as const;
const VIEWS = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "outbox", label: "Outbox", icon: Send },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "activity", label: "Activity log", icon: History },
  { id: "orbyte", label: "Orbyte", icon: PlugZap },
  { id: "eval", label: "AI eval", icon: FlaskConical, ownerOnly: true },
  { id: "settings", label: "Settings", icon: Settings2, ownerOnly: true },
] as const;
export type View = (typeof VIEWS)[number]["id"];

/** Single-page shell: views live in `?view=` so the static export needs no extra routes. */
function useUrlState() {
  const [view, setView] = useState<View>("inbox");
  const [messageId, setMessageId] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const v = p.get("view");
      setView(VIEWS.some((x) => x.id === v) ? (v as View) : "inbox");
      const m = Number(p.get("m"));
      setMessageId(Number.isInteger(m) && m > 0 ? m : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const go = useCallback((next: View, m: number | null = null) => {
    const p = new URLSearchParams();
    if (next !== "inbox") p.set("view", next);
    if (m) p.set("m", String(m));
    window.history.pushState(null, "", p.toString() ? `?${p}` : window.location.pathname);
    setView(next);
    setMessageId(m);
    window.scrollTo({ top: 0 });
  }, []);
  return { view, messageId, go, setMessageId };
}

export function App() {
  const qc = useQueryClient();
  const messages = useListMessages();
  const ctx = useGetDemoContext();
  const health = useHealthCheck();
  const { view, messageId, go, setMessageId } = useUrlState();
  const [role, setRole] = useState<DemoUserRole>("staff");
  const reset = useResetDemo({ mutation: { onSuccess: () => refreshAll(qc), onError: (e) => window.alert(apiErrorMessage(e)) } });

  useEffect(() => {
    const saved = window.localStorage.getItem(ROLE_KEY);
    if (saved === "owner" || saved === "staff" || saved === "viewer") setRole(saved);
  }, []);
  const chooseRole = (r: DemoUserRole) => {
    setRole(r);
    window.localStorage.setItem(ROLE_KEY, r);
  };
  const user = ctx.data?.users.find((u) => u.role === role);
  const actor: Actor = { role, userId: user?.id ?? null, name: user?.name ?? role };
  const count = (s: string) => (messages.data ?? []).filter((m) => m.status === s).length;
  const badges: Record<View, number> = { inbox: count("new") + count("needs_review"), approvals: count("awaiting_approval"), outbox: count("sent"), activity: 0, eval: 0, settings: 0, dashboard: 0, orbyte: 0 };
  const refreshing = messages.isFetching || ctx.isFetching;

  return (
    <OrbyteShell shopName={ctx.data?.shopName ?? "Ah Seng Hardware"} onConnect={() => go("orbyte")}>
    <div className="relative z-10 flex min-h-full flex-col">
      <div className="tape-stripe h-1.5 w-full" aria-hidden />
      <header className="border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
          <button onClick={() => go("inbox")} className="flex items-center gap-3 text-left">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-deep font-display text-lg font-extrabold text-tape">H</div>
            <div className="leading-tight">
              <div className="font-display text-xl font-extrabold tracking-tight" data-testid="text-app-name">Holdwise</div>
              <div className="text-xs text-ink-soft" data-testid="text-shop-name">
                {ctx.isLoading ? <span className="skel inline-block h-3 w-32 align-middle" /> : ctx.data?.shopName ?? "Ah Seng Hardware"}
              </div>
            </div>
          </button>
          <div className="hidden lg:block">
            <HealthDot ok={health.data?.status === "ok"} loading={health.isLoading} error={health.isError} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div role="radiogroup" aria-label="Act as" className="flex items-center rounded-xl border bg-paper p-1" data-testid="switch-role">
              <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft sm:inline">Act as</span>
              {ROLES.map(({ role: r, label }) => {
                const Icon = ROLE_ICON[r];
                const on = role === r;
                return (
                  <button key={r} role="radio" aria-checked={on} onClick={() => chooseRole(r)} data-testid={`button-role-${r}`}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95 ${on ? "bg-teal-deep text-white shadow-sm" : "text-ink-soft hover:bg-muted hover:text-ink"}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => refreshAll(qc)} disabled={refreshing} aria-label="Refresh" data-testid="button-refresh"
              className="grid h-10 w-10 place-items-center rounded-xl border bg-card text-ink-soft transition hover:border-teal hover:text-teal active:scale-95 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "spin" : ""}`} />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:px-6" aria-label="Sections">
          {VIEWS.filter((v) => !("ownerOnly" in v) || role === "owner").map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => go(id)} data-testid={`tab-${id}`} aria-current={view === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${view === id ? "border-teal text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
              <Icon className="h-4 w-4" />
              {label}
              {badges[id] > 0 && <span className={`rounded-full px-1.5 font-mono text-[10px] ${id === "approvals" ? "bg-tape text-ink" : "bg-muted text-ink-soft"}`}>{badges[id]}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t bg-paper/70">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs text-ink-soft md:px-6">
            <span data-testid="text-acting-user">
              Acting as <b className="text-ink">{actor.name}</b> ({ROLES.find((x) => x.role === role)?.note.toLowerCase()}) · simulated, no real sign-in
            </span>
            {role === "owner" && (
              <button
                onClick={() => user && window.confirm("Wipe all quotes and restore the demo data?") && reset.mutate({ data: { actorUserId: user.id } })}
                disabled={reset.isPending}
                className="flex items-center gap-1 font-semibold text-brick hover:underline disabled:opacity-60"
                data-testid="button-reset-demo"
              >
                <RotateCcw className={`h-3 w-3 ${reset.isPending ? "spin" : ""}`} /> Reset demo data
              </button>
            )}
            <span className="ml-auto font-mono">Demo data only. All customers, phones and messages are synthetic.</span>
          </div>
        </div>
      </header>

      {view === "inbox" && <Inbox actor={actor} selectedId={messageId} onSelect={setMessageId} />}
      {view === "approvals" && <Approvals actor={actor} onOpen={(m) => go("inbox", m)} />}
      {view === "outbox" && <Outbox onOpen={(m) => go("inbox", m)} />}
      {view === "dashboard" && <Dashboard onOpenInbox={() => go("inbox")} />}
      {view === "activity" && <ActivityLog />}
      {view === "eval" && <AiEval actor={actor} />}
      {view === "settings" && <SettingsView actor={actor} />}
      {view === "orbyte" && <OrbytePage />}
    </div>
    </OrbyteShell>
  );
}
