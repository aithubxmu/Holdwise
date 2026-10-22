import { normalize, type CatalogProduct, type DeliveryZone, type ExtractedItem } from "./rules.ts";

export interface ExtractionResult {
  items: ExtractedItem[];
  parsedBy: "rules";
  deliveryZoneId: number | null;
}
const units = "(?:bags?|bag|batang|lengths?|tins?|pail|pails|sheets?|pieces?|pcs|unit|units|box|boxes|pack|packs|rolls?|set|sets|pairs?|pasang)";
/** No AI dependency in M2. Missing quantities remain null for mandatory human review. */
export function extractItems(text: string, catalog: CatalogProduct[] = [], zones: DeliveryZone[] = []): ExtractionResult {
  const items: ExtractedItem[] = [];
  const parts = text.split(/\s*(?:\+|,|;|\n|\band\b|\bdan\b)\s*/i);
  for (const rawText of parts) {
    const cleaned = rawText
      .replace(/^.*?\b(?:nak|need|quote|harga|order|bagi)\s+/i, "")
      .replace(/^(?:hi|hello|morning|boss|please|can|boleh|tolong)\b[ ,]*/gi, "")
      .replace(/\b(?:hantar|delivery|self[ -]?pickup|pickup)\b.*$/i, "")
      .replace(/\b(?:esok|petang|please|berapa|ada stock|regular price)\b.*$/i, "")
      .replace(/[?!]+/g, "").trim();
    if (!cleaned) continue;
    const prefix = cleaned.match(new RegExp(`^(-?\\d+(?:\\.\\d+)?)\\s*(?:(${units})\\b\\s*)?(.+)$`, "i"));
    const suffix = cleaned.match(new RegExp(`^(.+?)\\s+(-?\\d+(?:\\.\\d+)?)\\s*(${units})\\b.*$`, "i"));
    let itemText = cleaned, qty: number | null = null, unit: string | null = null;
    if (prefix) { qty = Number(prefix[1]); unit = prefix[2] ?? null; itemText = prefix[3]!.trim(); }
    else if (suffix) { itemText = suffix[1]!.trim(); qty = Number(suffix[2]); unit = suffix[3] ?? null; }
    const normalized = normalize(itemText);
    const known = catalog.some(p => [p.name, ...p.aliases].some(a =>
      (` ${normalized} `).includes(` ${normalize(a)} `))) || /\b(?:pipe|pvc|cement)\b/.test(normalized);
    if (!prefix && !suffix && !known) {
      if (/^(?:hi|hello|boss|morning|selamat|harap|hantar|delivery|by the way|class mana|ada stock|regular price)/i.test(cleaned)) continue;
    }
    // Catalog aliases split a no-quantity request like "simen dan pasir" without inventing quantities.
    items.push({ rawText: rawText.trim(), itemText, qty, unit });
  }
  const normalizedText = normalize(text);
  const pickup = /\b(?:pickup|pick up|ambil sendiri)\b/.test(normalizedText);
  const matches = zones.filter(z => pickup ? normalize(z.name) === "self pickup" : (` ${normalizedText} `).includes(` ${normalize(z.name)} `));
  return { items, parsedBy: "rules", deliveryZoneId: matches.length === 1 ? matches[0]!.id : null };
}
