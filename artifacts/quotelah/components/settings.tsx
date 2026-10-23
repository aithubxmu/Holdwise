"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetSettings, useUpdateSettings, type SettingsUpdate } from "@workspace/api-client-react";
import { KeyRound, Lock, Sparkles } from "lucide-react";
import { apiErrorMessage } from "@/lib/format";
import { refreshAll, type Actor } from "@/lib/actor";
import { ActionError, ErrorBlock } from "./shared";

/** Owner settings. Every change is written to the activity log. */
export function SettingsView({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const settings = useGetSettings();
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateSettings({ mutation: { onSuccess: () => { setError(null); refreshAll(qc); }, onError: (e) => setError(apiErrorMessage(e)) } });
  const owner = actor.role === "owner";
  const save = (change: Omit<SettingsUpdate, "actorUserId">) => actor.userId && update.mutate({ data: { actorUserId: actor.userId, ...change } });

  if (settings.isError) return <main className="mx-auto w-full max-w-[720px] px-4 py-5"><ErrorBlock onRetry={() => settings.refetch()} what="settings" /></main>;
  const s = settings.data;
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 space-y-4 px-4 py-5 md:px-6" data-testid="view-settings">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {owner ? "Changes apply to new drafts and are recorded in the activity log." : <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Only the Owner can change settings.</span>}
        </p>
      </div>
      <ActionError message={error} />
      {!s ? <div className="skel h-48 rounded-2xl" /> : (
        <>
          <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 text-teal" />
              <div className="flex-1">
                <h2 className="font-semibold">AI message reading</h2>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  AI only reads the customer's message into items and quantities. Products, prices, stock, discounts and totals always come from the shop's rules.
                  Switch it off to show the rules-only fallback.
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[12px]" data-testid="text-ai-key">
                  <KeyRound className="h-3.5 w-3.5" />
                  {s.ai.configured ? <>Key configured · {s.ai.provider} · <span className="font-mono">{s.ai.model}</span></> : <span className="text-brick">No AI key on the server (AI_API_KEY), so drafts use the rules parser.</span>}
                </p>
              </div>
              <button role="switch" aria-checked={s.aiExtraction} disabled={!owner || update.isPending} onClick={() => save({ aiExtraction: !s.aiExtraction })}
                className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${s.aiExtraction ? "bg-teal" : "bg-muted border"}`} data-testid="switch-ai">
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${s.aiExtraction ? "left-6" : "left-1"}`} />
                <span className="sr-only">AI extraction</span>
              </button>
            </div>
          </section>
          <NumberSetting label="Minutes to write one quote by hand" note="Assumption set by the owner. Used for the time-saved figure on the dashboard."
            value={s.manualMinutesPerQuote} disabled={!owner || update.isPending} testId="input-manual-minutes" onSave={(v) => save({ manualMinutesPerQuote: v })} />
          <NumberSetting label="Orbyte Credit wallet top-up (simulated)" note="Each quote actually sent uses 1 credit. Balance = top-up − credits used."
            value={s.startingCredits} disabled={!owner || update.isPending} testId="input-starting-credits" onSave={(v) => save({ startingCredits: Math.round(v) })} />
        </>
      )}
    </main>
  );
}

function NumberSetting({ label, note, value, disabled, testId, onSave }: { label: string; note: string; value: number; disabled: boolean; testId: string; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const v = Number(draft); if (Number.isFinite(v) && v > 0 && v !== value) onSave(v); else setDraft(String(value)); };
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{label}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">{note}</p>
      </div>
      <input value={draft} disabled={disabled} inputMode="decimal" onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-24 rounded-xl border bg-paper px-3 py-2 text-right tabular-nums outline-none focus:border-teal disabled:opacity-60" data-testid={testId} />
    </section>
  );
}
