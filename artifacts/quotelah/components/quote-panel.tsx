"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDraftQuote,
  useGetQuote,
  useListActivity,
  useListProducts,
  useQuoteAction,
  useUpdateQuote,
  useUpdateQuoteItem,
  getGetQuoteQueryKey,
  type QuoteActionRequestAction,
  type QuoteDetail,
  type QuoteItemUpdate,
} from "@workspace/api-client-react";
import { CircleCheck, FileText, Lock, MessageSquareWarning, Send, ShieldCheck, Sparkles, Undo2, UserCheck } from "lucide-react";
import { STATUS_META, apiErrorMessage, fullTime, rm } from "@/lib/format";
import { refreshAll, type Actor } from "@/lib/actor";
import { ActionError } from "./shared";
import { QuoteLine } from "./quote-line";
import { WhatsAppQuote } from "./whatsapp-quote";

// Mirrors the API's customer-type discounts; shown so staff see when they changed the default.
const DEFAULT_DISCOUNT = { walk_in: 0, regular: 3, contractor: 5 } as const;

/** Step 2–5 of the journey for one message: draft, review, approve and send. */
export function QuotePanel({ messageId, quoteId, actor }: { messageId: number; quoteId: number | null; actor: Actor }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const draft = useDraftQuote({
    mutation: {
      onSuccess: (q) => { qc.setQueryData(getGetQuoteQueryKey(q.id), q); refreshAll(qc); },
      onError: (e) => setError(apiErrorMessage(e)),
    },
  });

  if (quoteId === null) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-teal/40 bg-teal-wash/40 p-3.5" data-testid="panel-no-quote">
        <FileText className="h-5 w-5 shrink-0 text-teal" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-teal-deep">No quotation yet</div>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            QuoteLah reads the message, matches items to the catalogue, checks stock and prices them with the shop's rules.
            Anything unclear is flagged for a person.
          </p>
        </div>
        {actor.role === "viewer" ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-soft"><Lock className="h-3.5 w-3.5" /> Viewers can't draft</span>
        ) : (
          <button
            onClick={() => { setError(null); actor.userId && draft.mutate({ messageId, data: { actorUserId: actor.userId } }); }}
            disabled={draft.isPending || !actor.userId}
            className="flex items-center gap-2 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal active:scale-95 disabled:opacity-60"
            data-testid="button-draft-quote"
          >
            <Sparkles className={`h-4 w-4 ${draft.isPending ? "spin" : ""}`} />
            {draft.isPending ? "Drafting…" : "Draft quotation"}
          </button>
        )}
        <div className="w-full"><ActionError message={error} /></div>
      </div>
    );
  }
  return <QuoteEditor quoteId={quoteId} actor={actor} />;
}

function QuoteEditor({ quoteId, actor }: { quoteId: number; actor: Actor }) {
  const qc = useQueryClient();
  const quote = useGetQuote(quoteId);
  const products = useListProducts();
  const [error, setError] = useState<string | null>(null);
  const done = { onSuccess: (q: QuoteDetail) => { setError(null); qc.setQueryData(getGetQuoteQueryKey(q.id), q); refreshAll(qc); }, onError: (e: unknown) => setError(apiErrorMessage(e)) };
  const item = useUpdateQuoteItem({ mutation: done });
  const discount = useUpdateQuote({ mutation: done });
  const action = useQuoteAction({ mutation: done });
  const busy = item.isPending || discount.isPending || action.isPending;

  if (quote.isLoading) return <div className="skel h-40 w-full rounded-xl" />;
  if (!quote.data) return <ActionError message="Couldn't load this quotation. Refresh and try again." />;
  const q = quote.data;
  const sent = q.status === "sent";
  const editable = actor.role !== "viewer" && !sent;
  const st = STATUS_META[q.status];
  const uid = actor.userId ?? 0;
  const edit = (itemId: number, change: Omit<QuoteItemUpdate, "actorUserId">) => item.mutate({ quoteId, itemId, data: { actorUserId: uid, ...change } });
  const act = (a: QuoteActionRequestAction, comment?: string) => action.mutate({ quoteId, data: { actorUserId: uid, action: a, comment } });

  return (
    <section className="space-y-3" data-testid="panel-quote">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold">Quotation #{q.id}</h2>
        <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${st.cls}`} data-testid="status-quote">{st.label}</span>
        <ParserBadge q={q} />
        <span className="ml-auto font-mono text-[11px] text-ink-soft">{q.lines.length} lines · drafted {fullTime(q.createdAt)}</span>
      </div>

      {q.lastComment && !sent && (
        <div className="flex gap-2 rounded-xl border border-tape bg-tape-wash px-3 py-2 text-[13px]" data-testid="text-return-comment">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Owner returned this quote:</b> “{q.lastComment}”</span>
        </div>
      )}

      {q.lines.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-[13px] text-ink-soft">No items left. This quote can't be sent.</p>
      ) : (
        <ul className="space-y-2">
          {q.lines.map((line) => (
            <QuoteLine key={line.id} line={line} catalog={products.data ?? []} editable={editable} busy={busy} onChange={(c) => edit(line.id, c)} />
          ))}
        </ul>
      )}

      <Totals q={q} editable={editable} busy={busy} onDiscount={(pct) => discount.mutate({ quoteId, data: { actorUserId: uid, discountPct: pct } })} />
      <Routing q={q} />
      <ActionError message={error} />
      <Actions q={q} actor={actor} busy={busy} act={act} />
      {q.openFlags === 0 && q.lines.length > 0 && (
        <div className="rounded-2xl bg-[linear-gradient(hsl(var(--teal-wash)/.6),hsl(var(--paper)))] p-4">
          <div className="mb-2 text-center font-mono text-[10px] uppercase tracking-[.2em] text-ink-soft">
            {sent ? "Sent to customer · simulated WhatsApp" : "Customer will receive · preview"}
          </div>
          <WhatsAppQuote q={q} />
        </div>
      )}
      <Trail quoteId={quoteId} />
    </section>
  );
}

/** Shows who read the message: the AI model, or the rules parser and why AI was not used. */
function ParserBadge({ q }: { q: QuoteDetail }) {
  const p = q.parser;
  if (q.parsedBy === "ai")
    return (
      <span className="flex items-center gap-1 rounded-md bg-teal-wash px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-teal-deep" data-testid="badge-parser"
        title={[p.language && `Language: ${p.language}`, p.notes, p.latencyMs !== null && `${p.latencyMs} ms`].filter(Boolean).join(" · ")}>
        <Sparkles className="h-3 w-3" /> Parsed by AI ({p.model})
      </span>
    );
  return (
    <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft" data-testid="badge-parser" title={p.fallbackReason ?? undefined}>
      Parsed by rules (fallback){p.fallbackReason ? `: ${p.fallbackReason}` : ""}
    </span>
  );
}

function Totals({ q, editable, busy, onDiscount }: { q: QuoteDetail; editable: boolean; busy: boolean; onDiscount: (pct: number) => void }) {
  const [pct, setPct] = useState(String(q.discountPct));
  useEffect(() => setPct(String(q.discountPct)), [q.discountPct]);
  const commit = () => { const v = Number(pct); if (Number.isFinite(v) && v >= 0 && v <= 100 && v !== q.discountPct) onDiscount(v); else setPct(String(q.discountPct)); };
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border bg-paper px-4 py-3 text-[13px]" data-testid="panel-totals">
      <dt className="text-ink-soft">Subtotal</dt><dd className="text-right tabular-nums">{rm(q.subtotalRm)}</dd>
      <dt className="flex items-center gap-2 text-ink-soft">
        Discount
        <span className="flex items-center rounded-md border bg-card px-1.5">
          <input value={pct} disabled={!editable || busy} onChange={(e) => setPct(e.target.value)} onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} inputMode="decimal"
            className="w-9 bg-transparent py-0.5 text-right tabular-nums outline-none" aria-label="Discount percent" data-testid="input-discount" />%
        </span>
        <span className="text-[11px]">({q.customerType.replace("_", "-")} rate {DEFAULT_DISCOUNT[q.customerType]}%)</span>
      </dt>
      <dd className="text-right tabular-nums">−{rm(q.discountRm)}</dd>
      <dt className="text-ink-soft">{q.deliveryZone === "Self-pickup" ? "Self-pickup" : `Delivery · ${q.deliveryZone}`}</dt>
      <dd className="text-right tabular-nums">{rm(q.deliveryRm)}</dd>
      <dt className="mt-1 border-t pt-1.5 font-display text-base font-bold">Total</dt>
      <dd className="mt-1 border-t pt-1.5 text-right font-display text-base font-bold tabular-nums" data-testid="text-quote-total">
        {rm(q.totalRm)}{!q.totalsComplete && <span className="ml-1 text-[11px] font-normal text-brick">incomplete</span>}
      </dd>
    </dl>
  );
}

function Routing({ q }: { q: QuoteDetail }) {
  if (q.status === "sent") return null;
  if (q.openFlags > 0)
    return <p className="rounded-xl bg-brick-wash px-3 py-2 text-[13px] text-brick" data-testid="text-routing">Fix {q.openFlags} flagged {q.openFlags === 1 ? "item" : "items"} above before this quote can go out.</p>;
  if (q.needsOwner)
    return (
      <div className="rounded-xl border border-ink/15 bg-muted px-3 py-2 text-[13px]" data-testid="text-routing">
        <div className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4" /> Owner approval needed because:</div>
        <ul className="mt-1 list-disc pl-6 text-ink-soft">{q.approvalReasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    );
  return <p className="flex items-center gap-1.5 rounded-xl bg-teal-wash px-3 py-2 text-[13px] text-teal-deep" data-testid="text-routing"><CircleCheck className="h-4 w-4" /> Within staff limits. Staff can send this directly.</p>;
}

function Actions({ q, actor, busy, act }: { q: QuoteDetail; actor: Actor; busy: boolean; act: (a: QuoteActionRequestAction, comment?: string) => void }) {
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  if (q.status === "sent")
    return <p className="flex items-center gap-1.5 text-[13px] font-semibold text-teal-deep" data-testid="text-sent"><Send className="h-4 w-4" /> Sent {q.sentAt ? fullTime(q.sentAt) : ""}. Stock reserved, quote locked.</p>;
  if (actor.role === "viewer")
    return <p className="flex items-center gap-1.5 text-[13px] text-ink-soft"><Lock className="h-4 w-4" /> Read only. Switch to Staff or Owner to act.</p>;
  const blocked = busy || q.openFlags > 0 || q.lines.length === 0;
  const primary = "flex items-center gap-2 rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
  const secondary = "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:border-ink active:scale-95 disabled:opacity-50";

  if (actor.role === "owner" && q.status === "awaiting_approval")
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button className={primary} disabled={blocked} onClick={() => act("approve")} data-testid="button-approve"><UserCheck className="h-4 w-4" /> Approve & send</button>
          <button className={secondary} disabled={busy} onClick={() => setReturning((v) => !v)} data-testid="button-return"><Undo2 className="h-4 w-4" /> Return to staff</button>
        </div>
        {returning && (
          <div className="flex flex-wrap gap-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="What should staff change?"
              className="min-w-[220px] flex-1 rounded-xl border bg-paper px-3 py-2 text-sm outline-none focus:border-teal" data-testid="input-return-comment" />
            <button className={secondary} disabled={busy || !comment.trim()} onClick={() => { act("return", comment); setReturning(false); setComment(""); }} data-testid="button-return-confirm">Send back</button>
          </div>
        )}
      </div>
    );
  if (q.status === "awaiting_approval")
    return <p className="flex items-center gap-1.5 text-[13px] font-semibold" data-testid="text-waiting"><ShieldCheck className="h-4 w-4" /> Waiting for the owner to approve. Editing will withdraw the request.</p>;
  if (q.needsOwner && actor.role === "staff")
    return <button className={primary} disabled={blocked} onClick={() => act("request_approval")} data-testid="button-request-approval"><ShieldCheck className="h-4 w-4" /> Ask owner to approve</button>;
  return (
    <button className={primary} disabled={blocked} onClick={() => act("send")} data-testid="button-send">
      <Send className="h-4 w-4" /> {q.needsOwner ? "Approve & send to customer" : "Send to customer"}
    </button>
  );
}

function Trail({ quoteId }: { quoteId: number }) {
  const log = useListActivity({ quoteId });
  if (!log.data?.length) return null;
  return (
    <details className="rounded-xl border bg-card px-3 py-2 text-[13px]" data-testid="panel-quote-trail">
      <summary className="cursor-pointer font-semibold">Activity for this quote ({log.data.length})</summary>
      <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
        {log.data.map((e) => (
          <li key={e.id}>
            <span className="font-mono text-[11px] text-ink-soft">{fullTime(e.at)}</span> · <b>{e.actorName ?? "System"}:</b> {e.summary}
          </li>
        ))}
      </ol>
    </details>
  );
}
