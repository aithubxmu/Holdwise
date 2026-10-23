/**
 * Extraction quality on our synthetic test set (data/eval-set.json): AI vs rules.
 * Same pipeline as a real draft: extract → toDraftLines (deterministic catalogue matching).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractMessage } from "./ai-extract.ts";
import { toDraftLines, type CatalogProduct, type DeliveryZone } from "./rules.ts";
import type { LlmConfig } from "./llm.ts";

interface Expected { sku: string | null; qty: number | null; expect_flag?: string }
interface EvalMessage { id: string; set: "seed" | "held_out"; text: string; zone: string | null; expected: Expected[] }
export type EvalCatalogProduct = CatalogProduct & { sku: string };

export function loadEvalSet(): EvalMessage[] {
  // Works from the repo root (production) and from artifacts/api-server (dev, tests, CLI).
  const file = [path.resolve("data/eval-set.json"), path.resolve("../../data/eval-set.json")].find(existsSync);
  if (!file) throw new Error("data/eval-set.json not found");
  return JSON.parse(readFileSync(file, "utf8")).messages;
}

interface Tally { expected: number; correct: number; qtyCorrect: number; extra: number; flags: number; zoneExpected: number; zoneCorrect: number }
const tally = (): Tally => ({ expected: 0, correct: 0, qtyCorrect: 0, extra: 0, flags: 0, zoneExpected: 0, zoneCorrect: 0 });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export async function runEval(mode: "ai" | "rules", catalog: EvalCatalogProduct[], zones: DeliveryZone[], config: LlmConfig | null) {
  const set = loadEvalSet();
  const totals = { all: tally(), seed: tally(), held_out: tally() };
  const rows = [];
  let latency = 0, fallbacks = 0;
  for (const m of set) {
    let x = await extractMessage(m.text, catalog, zones, { aiEnabled: mode === "ai", config });
    // Free tiers rate-limit bursts: wait once and retry before counting it as a fallback.
    if (mode === "ai" && x.fallbackReason?.includes("429")) {
      await new Promise(r => setTimeout(r, 7000));
      x = await extractMessage(m.text, catalog, zones, { aiEnabled: true, config });
    }
    if (mode === "ai" && x.parsedBy === "rules") fallbacks++;
    latency += x.latencyMs;
    const lines = toDraftLines(x.items, catalog);
    const used = new Set<number>();
    let correct = 0, qtyCorrect = 0;
    for (const e of m.expected) {
      const i = lines.findIndex((l, idx) => !used.has(idx) && (e.sku
        ? l.product && catalog.find(p => p.id === l.product!.id)?.sku === e.sku
        : !l.product && l.reviewFlags.includes(e.expect_flag as never)));
      if (i < 0) continue;
      used.add(i);
      correct++;
      if ((lines[i]!.qty || null) === e.qty) qtyCorrect++;
    }
    const flags = lines.reduce((n, l) => n + l.reviewFlags.length + (l.qty ? 0 : 1), 0);
    const zone = x.deliveryZoneId === null ? null : zones.find(z => z.id === x.deliveryZoneId)?.name ?? null;
    for (const t of [totals.all, totals[m.set]]) {
      t.expected += m.expected.length; t.correct += correct; t.qtyCorrect += qtyCorrect;
      t.extra += lines.length - used.size; t.flags += flags;
      if (m.zone) { t.zoneExpected++; if (zone === m.zone) t.zoneCorrect++; }
    }
    rows.push({ id: m.id, set: m.set, text: m.text, expected: m.expected.length, correct, qtyCorrect, extra: lines.length - used.size,
      flags, parsedBy: x.parsedBy, fallbackReason: mode === "ai" ? x.fallbackReason : null, latencyMs: x.latencyMs,
      lines: lines.map(l => ({ rawText: l.rawText, product: l.product?.name ?? null, qty: l.qty, flags: l.reviewFlags })) });
  }
  const summary = (t: Tally) => ({
    itemsExpected: t.expected, itemsCorrect: t.correct, extractionAccuracyPct: pct(t.correct, t.expected),
    qtyAccuracyPct: pct(t.qtyCorrect, t.correct), extraLines: t.extra, flagsRaised: t.flags, zoneAccuracyPct: pct(t.zoneCorrect, t.zoneExpected),
  });
  return {
    mode, model: mode === "ai" ? config?.model ?? null : null, ranAt: new Date().toISOString(), messages: set.length,
    avgLatencyMs: Math.round(latency / set.length), fallbacks,
    all: summary(totals.all), seed: summary(totals.seed), heldOut: summary(totals.held_out), rows,
  };
}
export type EvalResult = Awaited<ReturnType<typeof runEval>>;
