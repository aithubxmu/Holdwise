/** Pure quotation rules. Currency calculations are integer sen, never LLM output. */
export interface CatalogProduct {
  id: number; name: string; aliases: string[]; unit: string; priceRm: string;
  stockQty: number; reservedQty: number; variantGroup: string | null;
}
export type Flag = "unknown_item" | "ambiguous_variant" | "low_confidence" | "missing_quantity" | "invalid_quantity" | "insufficient_stock";
/** itemText is what we match against the catalogue; aiConfidence is set only when AI read the message. */
export interface ExtractedItem { rawText: string; itemText: string; qty: number | null; unit: string | null; aiConfidence?: number }
export interface Match { product: CatalogProduct | null; confidence: number; flags: Flag[]; options: CatalogProduct[] }
export const normalize = (text: string) => text.toLowerCase()
  .replace(/(\d)\s*"/g, "$1 inch").replace(/\binci\b/g, "inch")
  .replace(/\bpaip\b/g, "pipe").replace(/\b(?:semen|simen)\b/g, "cement")
  .replace(/\b(?:kelas|class)\s*([bd])\b/g, "class $1")
  // Keep decimal points ("1.5") but drop sentence dots ("roof sheet.", "Hantar Putrajaya.").
  .replace(/[^a-z0-9.]+/g, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ").trim().replace(/\s+/g, " ");

function contains(haystack: string, needle: string) {
  return ` ${haystack} `.includes(` ${needle} `);
}
export function matchProduct(text: string, catalog: CatalogProduct[]): Match {
  const input = normalize(text);
  if (!input) return { product: null, confidence: 0, flags: ["unknown_item"], options: [] };
  // Never select a pipe class implicitly. Diameter is part of the variant group.
  if (/\b(?:pvc|pipe)\b/.test(input) && !/\b(?:glue|elbow|tee|gam|siku)\b/.test(input)) {
    const size = input.match(/\b([123])\s*(?:inch)\b/)?.[1];
    const cls = input.match(/\bclass\s+([bd])\b/)?.[1];
    const options = catalog.filter(p => p.variantGroup?.startsWith("pvc-")
      && (!size || p.variantGroup === `pvc-${size}-inch`)
      && (!cls || normalize(p.name).includes(`class ${cls}`)));
    if (options.length > 1) return { product: null, confidence: 0.9, flags: ["ambiguous_variant"], options };
    if (options.length === 1 && size) return { product: options[0]!, confidence: 1, flags: [], options };
    return { product: null, confidence: 0, flags: ["unknown_item"], options: [] };
  }
  const scored = catalog.map(product => {
    let score = 0;
    for (const raw of [product.name, ...product.aliases]) {
      const alias = normalize(raw);
      if (input === alias) score = Math.max(score, 1);
      else if (contains(input, alias)) score = Math.max(score, 0.95);
      else {
        const a = new Set(alias.split(" ")), b = new Set(input.split(" "));
        const intersection = [...a].filter(token => b.has(token)).length;
        score = Math.max(score, intersection / (a.size + b.size - intersection));
      }
    }
    return { product, score };
  }).filter(x => x.score >= 0.35).sort((a, b) => b.score - a.score || a.product.id - b.product.id);
  const best = scored[0];
  if (!best) return { product: null, confidence: 0, flags: ["unknown_item"], options: [] };
  const tied = scored.filter(x => x.score === best.score);
  if (tied.length > 1) return { product: null, confidence: best.score, flags: ["ambiguous_variant"], options: tied.map(x => x.product) };
  return { product: best.product, confidence: best.score, flags: best.score < 0.7 ? ["low_confidence"] : [], options: [best.product] };
}

export function toSen(rm: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(rm)) throw new Error("Invalid nonnegative RM amount");
  const [whole, fraction = ""] = rm.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value)) throw new Error("Amount exceeds safe range");
  return value;
}
export const discounts = { walk_in: 0, regular: 3, contractor: 5 } as const;
export interface DeliveryZone { id: number; name: string; feeRm: string }
export function deliveryZone(text: string, customerZoneId: number, zones: DeliveryZone[]) {
  const input = normalize(text);
  if (/\b(?:self pickup|self pick up|pickup|pick up|ambil sendiri)\b/.test(input)) {
    const pickup = zones.find(z => normalize(z.name) === "self pickup");
    if (pickup) return pickup;
  }
  const mentioned = zones.filter(z => contains(input, normalize(z.name)));
  if (mentioned.length > 1) throw new Error("Multiple delivery zones require human review");
  const zone = mentioned[0] ?? zones.find(z => z.id === customerZoneId);
  if (!zone) throw new Error("Unknown customer delivery zone");
  return zone;
}
export function approvalRouting(totalSen: number, discountPct: number, priceOverridden: boolean, flags: readonly string[], thresholdSen = 50_000) {
  const reasons: string[] = [];
  if (totalSen > thresholdSen) reasons.push(`Total exceeds RM ${(thresholdSen / 100).toFixed(2)}`);
  if (discountPct > 5) reasons.push("Discount exceeds 5%");
  if (priceOverridden) reasons.push("Unit price was manually overridden");
  return { status: flags.length ? "needs_review" : reasons.length ? "awaiting_approval" : "drafted", reasons,
    canSend: { owner: flags.length === 0, staff: flags.length === 0 && reasons.length === 0, viewer: false } };
}
/** A persisted quote line. qty 0 means "quantity missing". reviewFlags are extraction flags a human must clear. */
export interface StoredLine { id: number; productId: number | null; qty: number; unitPriceSen: number | null; reviewFlags: Flag[] }
export const REVIEW_FLAGS: readonly Flag[] = ["unknown_item", "ambiguous_variant", "low_confidence"];
/** Reprices persisted lines against the live catalogue. Stock and quantity flags are always recomputed. */
export function priceStoredLines(input: {
  lines: StoredLine[]; catalog: CatalogProduct[]; discountPct: number; deliverySen: number; approvalThresholdSen?: number;
}) {
  const used = new Map<number, number>();
  let priceOverridden = false;
  const lines = input.lines.map(line => {
    const product = line.productId === null ? null : input.catalog.find(p => p.id === line.productId) ?? null;
    const flags: Flag[] = product
      ? line.reviewFlags.filter(f => f === "low_confidence")
      : line.reviewFlags.some(f => f === "unknown_item" || f === "ambiguous_variant")
        ? line.reviewFlags.filter(f => f !== "low_confidence") : ["unknown_item"];
    if (line.qty <= 0) flags.push("missing_quantity");
    const available = product ? product.stockQty - product.reservedQty : null;
    if (product && line.qty > 0) {
      const totalQty = (used.get(product.id) ?? 0) + line.qty;
      used.set(product.id, totalQty);
      if (totalQty > available!) flags.push("insufficient_stock");
    }
    const catalogPriceSen = product ? toSen(product.priceRm) : null;
    const unitPriceSen = product ? line.unitPriceSen ?? catalogPriceSen : null;
    if (product && unitPriceSen !== catalogPriceSen) priceOverridden = true;
    const lineTotalSen = unitPriceSen !== null && line.qty > 0 ? unitPriceSen * line.qty : null;
    if (lineTotalSen !== null && !Number.isSafeInteger(lineTotalSen)) throw new Error("Line amount exceeds safe range");
    return { ...line, product, flags, available, catalogPriceSen, unitPriceSen, lineTotalSen };
  });
  const { discountPct, deliverySen } = input;
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) throw new Error("Invalid discount");
  const subtotalSen = lines.reduce((sum, line) => sum + (line.lineTotalSen ?? 0), 0);
  const discountSen = Math.round(subtotalSen * discountPct / 100);
  const totalSen = subtotalSen - discountSen + deliverySen;
  const flags = lines.flatMap(line => line.flags);
  if (!lines.length) flags.push("unknown_item");
  return { lines, subtotalSen, discountPct, discountSen, deliverySen, totalSen, priceOverridden, flags,
    totalsComplete: lines.length > 0 && lines.every(line => line.lineTotalSen !== null),
    ...approvalRouting(totalSen, discountPct, priceOverridden, flags, input.approvalThresholdSen),
  };
}
export const fromSen = (sen: number) => (sen / 100).toFixed(2);

/**
 * Turns extracted items (from AI or rules) into draft lines. This is deterministic: the catalogue
 * decides the product and the price, never the extractor. Below 0.7 AI confidence → low_confidence.
 */
export function toDraftLines(items: ExtractedItem[], catalog: CatalogProduct[]) {
  return items.map(item => {
    let match = matchProduct(item.itemText, catalog);
    // AI may paraphrase; the customer's own words get a second chance before we give up.
    if (!match.product && item.rawText !== item.itemText) {
      const alt = matchProduct(item.rawText, catalog);
      if (alt.product || alt.options.length > match.options.length) match = alt;
    }
    // Never let the extractor pick a variant the customer did not name ("paip 3 inci, class mana murah?"):
    // if their own words still fit several variants, a human chooses.
    if (match.product?.variantGroup && item.rawText !== item.itemText) {
      const own = matchProduct(item.rawText, catalog);
      if (own.flags.includes("ambiguous_variant") && own.options.some(o => o.id === match.product!.id)) match = own;
    }
    const flags = [...match.flags];
    let confidence = match.confidence;
    if (item.aiConfidence !== undefined) {
      confidence = Math.min(confidence, item.aiConfidence);
      if (match.product && item.aiConfidence < 0.7 && !flags.includes("low_confidence")) flags.push("low_confidence");
    }
    const qty = item.qty !== null && Number.isSafeInteger(item.qty) && item.qty > 0 ? item.qty : 0;
    return { rawText: item.rawText, product: match.product, qty, confidence, reviewFlags: flags.filter(f => REVIEW_FLAGS.includes(f)) };
  });
}
export function calculateQuote(input: {
  items: ExtractedItem[]; catalog: CatalogProduct[]; customerType: keyof typeof discounts;
  zone: DeliveryZone; now: Date; discountPct?: number; priceOverridden?: boolean; approvalThresholdSen?: number;
}) {
  const used = new Map<number, number>();
  const lines = input.items.map(item => {
    const match = matchProduct(item.itemText, input.catalog);
    const flags = [...match.flags];
    if (item.qty === null) flags.push("missing_quantity");
    else if (!Number.isSafeInteger(item.qty) || item.qty <= 0) flags.push("invalid_quantity");
    const validQty = item.qty !== null && Number.isSafeInteger(item.qty) && item.qty > 0;
    const available = match.product ? match.product.stockQty - match.product.reservedQty : null;
    if (match.product && validQty) {
      const totalQty = (used.get(match.product.id) ?? 0) + item.qty!;
      used.set(match.product.id, totalQty);
      if (totalQty > available!) flags.push("insufficient_stock");
    }
    const unitPriceSen = match.product ? toSen(match.product.priceRm) : null;
    const lineTotalSen = unitPriceSen !== null && validQty ? unitPriceSen * item.qty! : null;
    if (lineTotalSen !== null && !Number.isSafeInteger(lineTotalSen)) throw new Error("Line amount exceeds safe range");
    return { ...item, ...match, flags, available, unitPriceSen, lineTotalSen };
  });
  const discountPct = input.discountPct ?? discounts[input.customerType];
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) throw new Error("Invalid discount");
  const subtotalSen = lines.reduce((sum, line) => sum + (line.lineTotalSen ?? 0), 0);
  if (!Number.isSafeInteger(subtotalSen)) throw new Error("Subtotal exceeds safe range");
  const discountSen = Math.round(subtotalSen * discountPct / 100);
  const deliverySen = toSen(input.zone.feeRm);
  const totalSen = subtotalSen - discountSen + deliverySen;
  const flags = lines.flatMap(line => line.flags);
  if (!lines.length) flags.push("unknown_item");
  return { lines, subtotalSen, discountPct, discountSen, deliverySen, totalSen,
    totalsComplete: lines.length > 0 && lines.every(line => line.lineTotalSen !== null),
    validUntil: new Date(input.now.getTime() + 3 * 24 * 60 * 60 * 1000),
    ...approvalRouting(totalSen, discountPct, input.priceOverridden ?? false, flags, input.approvalThresholdSen),
  };
}
