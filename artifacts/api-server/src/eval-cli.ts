/**
 * `pnpm --filter @workspace/api-server run eval` — prints AI vs rules extraction quality on the
 * synthetic test set. Uses the seed catalogue directly, so no database is needed. Reads AI_* from ../../.env.
 */
import { productSeeds, zoneSeeds } from "@workspace/db/demo/seed-data";
import { runEval, type EvalCatalogProduct } from "./lib/eval.ts";
import { llmConfigFromEnv } from "./lib/llm.ts";

const catalog: EvalCatalogProduct[] = productSeeds.map(([name, unit, price, stock, , aliases, variantGroup], i) => ({
  id: i + 1, sku: `QL-${String(i + 1).padStart(3, "0")}`, name, unit, aliases, priceRm: price.toFixed(2),
  stockQty: stock, reservedQty: 0, variantGroup: variantGroup ?? null,
}));
const zones = zoneSeeds.map(([name, fee], i) => ({ id: i + 1, name, feeRm: fee.toFixed(2) }));
const config = llmConfigFromEnv();

const results = [await runEval("rules", catalog, zones, null)];
if (config) results.push(await runEval("ai", catalog, zones, config));
else console.log("No AI_API_KEY set: showing rules only.\n");

console.log("QuoteLah extraction eval (synthetic test set, 20 messages: 15 seed + 5 held-out)\n");
console.table(results.flatMap(r => (["all", "seed", "heldOut"] as const).map(part => ({
  parser: r.mode === "ai" ? `AI ${r.model}` : "rules", subset: part, ...r[part],
  avgLatencyMs: r.avgLatencyMs, fallbacks: r.fallbacks,
}))));
for (const r of results) {
  const misses = r.rows.filter(row => row.correct < row.expected || row.extra > 0);
  console.log(`\n${r.mode} misses (${misses.length}):`);
  for (const row of misses) console.log(` ${row.id}: ${row.correct}/${row.expected} correct, ${row.extra} extra${row.fallbackReason ? ` [${row.fallbackReason}]` : ""} → ${JSON.stringify(row.lines.map(l => [l.product ?? l.rawText, l.qty]))}`);
}
