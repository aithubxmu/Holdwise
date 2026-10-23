"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetLatestEval, useRunEval, type EvalResult, type EvalSummary } from "@workspace/api-client-react";
import { FlaskConical, Play } from "lucide-react";
import { apiErrorMessage, fullTime } from "@/lib/format";
import { refreshAll, type Actor } from "@/lib/actor";
import { ActionError } from "./shared";

/** AI vs rules extraction quality on our synthetic test set (data/eval-set.json). */
export function AiEval({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const latest = useGetLatestEval();
  const [error, setError] = useState<string | null>(null);
  const run = useRunEval({ mutation: { onSuccess: () => { setError(null); refreshAll(qc); }, onError: (e) => setError(apiErrorMessage(e)) } });
  const owner = actor.role === "owner";
  const results = [latest.data?.ai, latest.data?.rules].filter(Boolean) as EvalResult[];

  return (
    <main className="mx-auto w-full max-w-[1000px] flex-1 space-y-4 px-4 py-5 md:px-6" data-testid="view-eval">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><FlaskConical className="h-6 w-6 text-teal" /> AI extraction quality</h1>
          <p className="mt-1 text-sm text-ink-soft">
            On our synthetic test set: 20 invented WhatsApp messages (15 from the demo inbox, which the rules were tuned on, and 5 held-out ones written separately),
            each with the expected catalogue items and quantities.
          </p>
        </div>
        {owner && (["ai", "rules"] as const).map((mode) => (
          <button key={mode} disabled={run.isPending} onClick={() => actor.userId && run.mutate({ data: { actorUserId: actor.userId, mode } })}
            className="flex items-center gap-1.5 rounded-xl bg-teal-deep px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal active:scale-95 disabled:opacity-50" data-testid={`button-run-eval-${mode}`}>
            <Play className={`h-4 w-4 ${run.isPending && run.variables?.data.mode === mode ? "spin" : ""}`} /> Run {mode === "ai" ? "AI" : "rules"}
          </button>
        ))}
      </div>
      {run.isPending && <p className="text-[13px] text-ink-soft">Running… the AI run calls the model 20 times and can take up to a minute.</p>}
      <ActionError message={error} />
      {!results.length ? (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-[13px] text-ink-soft">No evaluation yet. {owner ? "Run one above." : "Ask the owner to run one."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-[13px]" data-testid="table-eval">
            <thead className="bg-paper text-left text-[11px] uppercase tracking-wider text-ink-soft">
              <tr><th className="px-3 py-2">Parser</th><th>Messages</th><th>Items correct</th><th>Quantity correct</th><th>Extra lines</th><th>Flags for a human</th><th>Delivery zone</th><th>Avg time</th></tr>
            </thead>
            <tbody>
              {results.flatMap((r) => (["all", "seed", "heldOut"] as const).map((part) => (
                <Row key={r.mode + part} r={r} part={part} s={r[part]} />
              )))}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-[11px] text-ink-soft">
            {results.map((r) => `${r.mode === "ai" ? `AI (${r.model})` : "Rules"} run ${fullTime(r.ranAt)}${r.fallbacks ? `, ${r.fallbacks} fell back to rules` : ""}`).join(" · ")}.
            Small synthetic set: treat the numbers as indicative, not a benchmark.
          </p>
        </div>
      )}
      {results.map((r) => <Misses key={r.mode} r={r} />)}
    </main>
  );
}

function Row({ r, part, s }: { r: EvalResult; part: "all" | "seed" | "heldOut"; s: EvalSummary }) {
  const label = { all: "all 20", seed: "15 seed", heldOut: "5 held-out" }[part];
  return (
    <tr className={`border-t ${part === "all" ? "font-semibold" : "text-ink-soft"}`}>
      <td className="px-3 py-2">{part === "all" ? (r.mode === "ai" ? "AI" : "Rules") : ""}</td>
      <td>{label}</td>
      <td className="tabular-nums">{s.itemsCorrect}/{s.itemsExpected} · {s.extractionAccuracyPct ?? "—"}%</td>
      <td className="tabular-nums">{s.qtyAccuracyPct ?? "—"}%</td>
      <td className="tabular-nums">{s.extraLines}</td>
      <td className="tabular-nums">{s.flagsRaised}</td>
      <td className="tabular-nums">{s.zoneAccuracyPct ?? "—"}%</td>
      <td className="tabular-nums">{part === "all" ? `${r.avgLatencyMs} ms` : ""}</td>
    </tr>
  );
}

function Misses({ r }: { r: EvalResult }) {
  const misses = r.rows.filter((row) => row.correct < row.expected || row.extra > 0);
  if (!misses.length) return null;
  return (
    <details className="rounded-2xl border bg-card px-4 py-3 text-[13px]">
      <summary className="cursor-pointer font-semibold">{r.mode === "ai" ? "AI" : "Rules"} misses ({misses.length})</summary>
      <ul className="mt-2 space-y-2">
        {misses.map((row) => (
          <li key={row.id} className="border-l-2 border-line pl-3">
            <div className="font-mono text-[11px] text-ink-soft">{row.id} · {row.correct}/{row.expected} correct · {row.extra} extra{row.fallbackReason ? ` · ${row.fallbackReason}` : ""}</div>
            <div>“{row.text}”</div>
            <div className="text-ink-soft">→ {row.lines.map((l) => `${l.product ?? `? “${l.rawText}”`} × ${l.qty || "?"}`).join(", ") || "nothing extracted"}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}
