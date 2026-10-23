import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProduct, calculateQuote, approvalRouting, deliveryZone, toSen, fromSen, priceStoredLines, type CatalogProduct } from "./rules.ts";
import { extractItems } from "./extract.ts";

const catalog: CatalogProduct[] = [
  { id: 1, name: "Portland cement 50kg", aliases: ["simen", "semen", "cement", "bag simen"], unit: "bag", priceRm: "19.50", stockQty: 100, reservedQty: 10, variantGroup: null },
  ...["B", "D"].map((cls, i) => ({ id: i + 2, name: `PVC pipe 2 inch Class ${cls}`, aliases: [`paip pvc 2 inci class ${cls}`], unit: "length", priceRm: "16.00", stockQty: 8, reservedQty: 1, variantGroup: "pvc-2-inch" })),
  { id: 4, name: "Fine sand 25kg", aliases: ["pasir halus", "fine sand"], unit: "bag", priceRm: "6.50", stockQty: 50, reservedQty: 0, variantGroup: null },
];
const zones = [{ id: 1, name: "Kajang", feeRm: "15.00" }, { id: 2, name: "Bangi", feeRm: "25.00" }, { id: 3, name: "Self-pickup", feeRm: "0.00" }];
const now = new Date("2026-10-22T00:00:00Z");
const quote = (text: string, customerType: "walk_in" | "regular" | "contractor" = "walk_in") =>
  calculateQuote({ items: extractItems(text, catalog, zones).items, catalog, customerType, zone: deliveryZone(text, 1, zones), now });

test("aliases, case and inch normalization", () => {
  assert.equal(matchProduct("SEMEN", catalog).product?.id, 1);
  assert.equal(matchProduct('paip PVC 2" Class D', catalog).product?.id, 3);
});
test("ambiguous PVC lists both options without assigning a price", () => {
  const result = quote("5 batang paip PVC 2 inci");
  assert.equal(result.lines[0]?.options.length, 2);
  assert.equal(result.lines[0]?.unitPriceSen, null);
  assert.equal(result.status, "needs_review");
  assert.equal(result.canSend.owner, false);
});
test("unknown item never receives a catalog price", () => {
  const result = quote("3 unit solar panel 400W");
  assert.deepEqual(result.lines[0]?.flags, ["unknown_item"]);
  assert.equal(result.lines[0]?.unitPriceSen, null);
});
test("missing quantities stay unresolved", () => {
  const result = quote("boss simen dan pasir halus berapa harga sekarang?");
  assert.equal(result.lines.length, 2);
  assert.ok(result.lines.every(l => l.flags.includes("missing_quantity")));
});
test("mixed Malay quantities and message zone", () => {
  const result = quote("boss, nak 20 bag simen + 5 batang paip PVC 2 inci, hantar Bangi esok, berapa?");
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0]?.qty, 20);
  assert.equal(result.deliverySen, 2500);
});
test("stock accounts for reservations and repeated lines", () => {
  assert.ok(quote("91 bag simen").lines[0]?.flags.includes("insufficient_stock"));
  assert.ok(quote("50 bag simen + 41 bag cement").lines[1]?.flags.includes("insufficient_stock"));
  assert.ok(!quote("90 bag simen").lines[0]?.flags.includes("insufficient_stock"));
});
test("negative, zero and fractional quantities are blocked", () => {
  for (const qty of [-1, 0, 1.5]) assert.equal(quote(`${qty} bag simen`).canSend.owner, false);
});
test("discounts and cents are deterministic", () => {
  assert.equal(quote("20 bag simen").totalSen, 40500);
  assert.equal(quote("20 bag simen", "regular").discountSen, 1170);
  assert.equal(quote("20 bag simen", "contractor").discountSen, 1950);
  assert.equal(quote("1 bag simen", "regular").discountSen, 59);
  assert.equal(toSen("19.5"), 1950);
  assert.throws(() => toSen("NaN"));
});
test("delivery defaults and self pickup", () => {
  assert.equal(deliveryZone("hi", 1, zones).id, 1);
  assert.equal(deliveryZone("hantar Bangi", 1, zones).id, 2);
  assert.equal(deliveryZone("self-pickup", 1, zones).feeRm, "0.00");
  assert.throws(() => deliveryZone("Bangi Kajang", 1, zones));
  assert.throws(() => deliveryZone("hi", 99, zones));
});
test("approval threshold is strictly greater than RM500", () => {
  assert.equal(approvalRouting(50000, 5, false, []).canSend.staff, true);
  assert.equal(approvalRouting(50001, 5, false, []).status, "awaiting_approval");
  assert.equal(approvalRouting(100, 6, false, []).canSend.staff, false);
  assert.equal(approvalRouting(100, 0, true, []).canSend.staff, false);
  assert.equal(approvalRouting(100, 0, false, []).canSend.viewer, false);
  assert.equal(approvalRouting(100, 0, false, ["unknown_item"]).canSend.owner, false);
});
test("low confidence matching is flagged", () => {
  assert.ok(matchProduct("fine gritty sand", catalog).flags.includes("low_confidence"));
});
test("quantity suffix and hidden polite request", () => {
  assert.equal(extractItems("nak paip PVC 2 inci 8 batang", catalog).items[0]?.qty, 8);
  assert.equal(extractItems("Selamat pagi! Harap semua sihat. By the way boleh bagi harga 4 bag simen", catalog).items[0]?.qty, 4);
});
test("valid for exactly three days; empty quotes cannot send", () => {
  assert.equal(quote("1 bag simen").validUntil.toISOString(), "2026-10-25T00:00:00.000Z");
  assert.equal(calculateQuote({ items: [], catalog, customerType: "walk_in", zone: zones[0]!, now }).canSend.owner, false);
});
const stored = (lines: Parameters<typeof priceStoredLines>[0]["lines"], discountPct = 0) =>
  priceStoredLines({ lines, catalog, discountPct, deliverySen: 2500 });
test("resolving an ambiguous line clears its review flag and prices it", () => {
  const open = stored([{ id: 1, productId: null, qty: 5, unitPriceSen: null, reviewFlags: ["ambiguous_variant"] }]);
  assert.deepEqual(open.lines[0]?.flags, ["ambiguous_variant"]);
  assert.equal(open.status, "needs_review");
  const picked = stored([{ id: 1, productId: 3, qty: 5, unitPriceSen: null, reviewFlags: ["ambiguous_variant"] }]);
  assert.deepEqual(picked.lines[0]?.flags, []);
  assert.equal(picked.lines[0]?.lineTotalSen, 8000);
  assert.equal(picked.totalSen, 10500);
});
test("stored lines recheck quantity, stock and low confidence", () => {
  assert.ok(stored([{ id: 1, productId: 1, qty: 0, unitPriceSen: null, reviewFlags: [] }]).lines[0]?.flags.includes("missing_quantity"));
  assert.ok(stored([{ id: 1, productId: 2, qty: 8, unitPriceSen: null, reviewFlags: [] }]).lines[0]?.flags.includes("insufficient_stock"));
  assert.ok(stored([{ id: 1, productId: 4, qty: 2, unitPriceSen: null, reviewFlags: ["low_confidence"] }]).lines[0]?.flags.includes("low_confidence"));
  assert.deepEqual(stored([{ id: 1, productId: null, qty: 2, unitPriceSen: null, reviewFlags: [] }]).lines[0]?.flags, ["unknown_item"]);
});
test("manual price override and discount above 5% need the owner", () => {
  const override = stored([{ id: 1, productId: 1, qty: 2, unitPriceSen: 1800, reviewFlags: [] }]);
  assert.equal(override.priceOverridden, true);
  assert.equal(override.canSend.staff, false);
  assert.equal(override.canSend.owner, true);
  assert.equal(stored([{ id: 1, productId: 1, qty: 2, unitPriceSen: null, reviewFlags: [] }], 8).canSend.staff, false);
  const plain = stored([{ id: 1, productId: 1, qty: 2, unitPriceSen: 1950, reviewFlags: [] }], 3);
  assert.equal(plain.priceOverridden, false);
  assert.equal(plain.canSend.staff, true);
  assert.equal(fromSen(plain.totalSen), "62.83");
});
test("sentence dots do not break matching or delivery zones", () => {
  const roof = [...catalog, { id: 9, name: "Metal roof sheet 8ft", aliases: ["zink", "roof sheet"], unit: "sheet", priceRm: "38.00", stockQty: 40, reservedQty: 0, variantGroup: null }];
  assert.equal(matchProduct("roof sheet.", roof).product?.id, 9);
  assert.equal(deliveryZone("2 bag simen. Hantar Bangi.", 1, zones).id, 2);
  assert.equal(matchProduct("1.5 inch", catalog).product, null);
});
test("chatter before the quantity and after the item is dropped", () => {
  const polite = extractItems("Selamat pagi! Harap semua sihat. By the way boleh bagi harga 4 bag simen dan 3 bag pasir halus?", catalog).items;
  assert.deepEqual(polite.map(i => [i.itemText, i.qty]), [["simen", 4], ["pasir halus", 3]]);
  const asking = extractItems("Boss simen dan pasir halus berapa harga sekarang?", catalog).items;
  assert.deepEqual(asking.map(i => [i.itemText, i.qty]), [["simen", null], ["pasir halus", null]]);
  assert.equal(quote("boss simen dan pasir halus berapa harga sekarang?").lines[1]?.product?.id, 4);
});
test("zone names are not part of the item text", () => {
  assert.deepEqual(extractItems("2 bag simen. Kajang.", catalog, zones).items.map(i => [i.itemText, i.qty]), [["simen", 2]]);
  assert.equal(extractItems("6 bag simen, self-pickup", catalog, zones).deliveryZoneId, 3);
});
