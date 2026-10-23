import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, extractMessage, parseAiResponse } from "./ai-extract.ts";
import { priceStoredLines, toDraftLines, toSen, type CatalogProduct } from "./rules.ts";
import type { LlmConfig } from "./llm.ts";

const catalog: CatalogProduct[] = [
  { id: 1, name: "Portland cement 50kg", aliases: ["simen", "cement"], unit: "bag", priceRm: "19.50", stockQty: 100, reservedQty: 0, variantGroup: null },
  { id: 2, name: "Paint primer 5L", aliases: ["primer", "cat alas"], unit: "tin", priceRm: "45.00", stockQty: 10, reservedQty: 0, variantGroup: null },
];
const zones = [{ id: 1, name: "Kajang", feeRm: "15.00" }, { id: 2, name: "Self-pickup", feeRm: "0.00" }];
const config: LlmConfig = { provider: "gemini", apiKey: "test-key", model: "test-model", fallbackModel: "test-lite" };
const reply = (body: object) => async () => JSON.stringify(body);
const good = { items: [{ raw_text: "sepuluh beg simen", product_guess: "Portland cement 50kg", qty: 10, unit: "beg", confidence: 0.95 }],
  delivery_area: "Kajang", requested_date: null, language: "ms", notes: null };

test("valid AI JSON is accepted, code fences tolerated, unknown keys like price dropped", () => {
  const parsed = parseAiResponse("```json\n" + JSON.stringify({ ...good, total: 1, items: [{ ...good.items[0], price: 1 }] }) + "\n```");
  assert.equal(parsed.items[0]?.qty, 10);
  assert.equal("price" in parsed.items[0]!, false);
  assert.equal("total" in parsed, false);
});
test("malformed or wrongly shaped AI output is rejected", () => {
  assert.throws(() => parseAiResponse("not json"));
  assert.throws(() => parseAiResponse(JSON.stringify({ items: "cement" })));
  assert.throws(() => parseAiResponse(JSON.stringify({ ...good, items: [{ ...good.items[0], confidence: 3 }] })));
});
test("AI result is used when valid", async () => {
  const x = await extractMessage("Tolong sediakan sebut harga: sepuluh beg simen", catalog, zones, { aiEnabled: true, config, call: reply(good) });
  assert.equal(x.parsedBy, "ai");
  assert.equal(x.model, "test-model");
  assert.equal(x.items[0]?.qty, 10);
  assert.equal(x.deliveryZoneId, 1);
});
test("falls back to rules: no key, switched off, API error, invalid JSON, timeout", async () => {
  const text = "nak 2 bag simen";
  const cases: [Parameters<typeof extractMessage>[3], RegExp][] = [
    [{ aiEnabled: true, config: null }, /No AI key/],
    [{ aiEnabled: false, config, call: reply(good) }, /switched off/],
    [{ aiEnabled: true, config, call: async () => { throw new Error("503 overloaded"); } }, /AI request failed \(503/],
    [{ aiEnabled: true, config, call: async () => "{\"items\": [" }, /invalid JSON/],
    [{ aiEnabled: true, config, timeoutMs: 30, call: (_c, _s, _u, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) }, /timed out/],
  ];
  for (const [opts, reason] of cases) {
    const x = await extractMessage(text, catalog, zones, opts);
    assert.equal(x.parsedBy, "rules");
    assert.match(x.fallbackReason ?? "", reason);
    assert.equal(x.items[0]?.qty, 2, "rules parser still extracts the item");
  }
});
test("AI can never set a price: catalogue price wins, invented products get no price", async () => {
  const sneaky = { ...good, items: [
    { raw_text: "20 simen", product_guess: "Portland cement 50kg at RM 1.00", qty: 20, unit: "bag", confidence: 0.99, price: 1, unit_price: "1.00" },
    { raw_text: "solar panel", product_guess: "Solar panel 400W", qty: 3, unit: null, confidence: 0.99 },
  ] };
  const x = await extractMessage("20 simen, 3 solar panel", catalog, zones, { aiEnabled: true, config, call: reply(sneaky) });
  const lines = toDraftLines(x.items, catalog);
  assert.equal(lines[0]?.product?.priceRm, "19.50");
  assert.deepEqual(lines[1]?.reviewFlags, ["unknown_item"]);
  const priced = priceStoredLines({ discountPct: 0, deliverySen: 0, lines: lines.map((l, i) => ({
    id: i, productId: l.product?.id ?? null, qty: l.qty, unitPriceSen: l.product ? toSen(l.product.priceRm) : null, reviewFlags: l.reviewFlags })), catalog });
  assert.equal(priced.lines[0]?.lineTotalSen, 20 * 1950);
  assert.equal(priced.lines[1]?.lineTotalSen, null);
});
test("low AI confidence and non-whole quantities go to a human", async () => {
  const unsure = { ...good, items: [{ raw_text: "cat alas", product_guess: "Paint primer 5L", qty: 2.5, unit: null, confidence: 0.5 }] };
  const x = await extractMessage("cat alas 2.5", catalog, zones, { aiEnabled: true, config, call: reply(unsure) });
  const [line] = toDraftLines(x.items, catalog);
  assert.equal(line?.product?.id, 2);
  assert.ok(line?.reviewFlags.includes("low_confidence"));
  assert.equal(line?.qty, 0, "2.5 is not a valid quantity, so it is treated as missing");
  assert.equal(line?.confidence, 0.5);
});
test("the prompt sends product names and aliases, never prices", () => {
  const { system } = buildPrompt("hi", catalog, zones);
  assert.match(system, /Portland cement 50kg \(customers say: simen, cement\)/);
  assert.doesNotMatch(system, /19\.50|45\.00|RM/);
});
test("a busy model (503/429) is retried once on the lighter model", async () => {
  const seen: string[] = [];
  const x = await extractMessage("nak 2 bag simen", catalog, zones, { aiEnabled: true, config, call: async (c) => {
    seen.push(c.model);
    if (c.model === "test-model") throw new Error("503 high demand");
    return JSON.stringify(good);
  } });
  assert.deepEqual(seen, ["test-model", "test-lite"]);
  assert.equal(x.parsedBy, "ai");
  assert.equal(x.model, "test-lite");
  const other = await extractMessage("nak 2 bag simen", catalog, zones, { aiEnabled: true, config, call: async () => { throw new Error("400 bad request"); } });
  assert.equal(other.parsedBy, "rules", "non-busy errors are not retried");
});
test("AI cannot choose a pipe class the customer did not name", () => {
  const pipes: CatalogProduct[] = ["B", "D"].map((cls, i) => ({ id: 10 + i, name: `PVC pipe 3 inch Class ${cls}`, aliases: [`paip pvc 3 inci class ${cls.toLowerCase()}`],
    unit: "length", priceRm: "24.00", stockQty: 60, reservedQty: 0, variantGroup: "pvc-3-inch" }));
  const [guessed] = toDraftLines([{ rawText: "paip PVC 3 inci 8 batang", itemText: "PVC pipe 3 inch Class B", qty: 8, unit: "batang", aiConfidence: 0.9 }], pipes);
  assert.equal(guessed?.product, null);
  assert.deepEqual(guessed?.reviewFlags, ["ambiguous_variant"]);
  const [named] = toDraftLines([{ rawText: "paip PVC 3 inci class D", itemText: "PVC pipe 3 inch Class D", qty: 8, unit: null, aiConfidence: 0.9 }], pipes);
  assert.equal(named?.product?.id, 11, "a class the customer named is kept");
});
