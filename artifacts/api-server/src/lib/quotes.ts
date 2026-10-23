/** Quote persistence: drafting, line edits, approval routing and send with stock reservation. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, messages, customers, deliveryZones, products, quotes, quoteItems, activityLog, users } from "@workspace/db";
import { extractMessage } from "./ai-extract.ts";
import { llmConfigFromEnv } from "./llm.ts";
import { getSettings } from "./settings.ts";
import { getWallet, CREDITS_PER_QUOTE } from "./wallet.ts";
import { matchProduct, deliveryZone, priceStoredLines, toDraftLines, toSen, fromSen, discounts,
  type CatalogProduct, type DeliveryZone, type Flag, type StoredLine } from "./rules.ts";
import { HttpError } from "./http-error.ts";

type Role = "owner" | "staff" | "viewer";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;
const DAY = 24 * 60 * 60 * 1000;

export async function getActor(actorUserId: number) {
  const [actor] = await db.select().from(users).where(eq(users.id, actorUserId));
  if (!actor) throw new HttpError(400, "Unknown demo user");
  return actor;
}
function requireRole(actor: { role: Role }, ...roles: Role[]) {
  if (!roles.includes(actor.role)) throw new HttpError(403, `The ${actor.role} role cannot do this`);
}
async function loadCatalog(q: Db = db): Promise<CatalogProduct[]> {
  return q.select({ id: products.id, name: products.name, aliases: products.aliases, unit: products.unit,
    priceRm: products.priceRm, stockQty: products.stockQty, reservedQty: products.reservedQty,
    variantGroup: products.variantGroup }).from(products).orderBy(products.id);
}
const loadZones = (q: Db = db): Promise<DeliveryZone[]> => q.select().from(deliveryZones).orderBy(deliveryZones.id);
function pickZone(body: string, customerZoneId: number, zones: DeliveryZone[]) {
  try { return deliveryZone(body, customerZoneId, zones); }
  catch { return zones.find(z => z.id === customerZoneId)!; }
}
function log(q: Db, actorUserId: number | null, action: string, entity: string, entityId: number, details: object) {
  return q.insert(activityLog).values({ actorUserId, action, entity, entityId, details });
}

async function loadQuote(quoteId: number, q: Db = db) {
  const [row] = await q.select({ quote: quotes, message: messages, customer: customers })
    .from(quotes).innerJoin(messages, eq(quotes.messageId, messages.id))
    .innerJoin(customers, eq(quotes.customerId, customers.id)).where(eq(quotes.id, quoteId));
  if (!row) throw new HttpError(404, "Quote not found");
  const items = await q.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId)).orderBy(quoteItems.id);
  return { ...row, items };
}
type Loaded = Awaited<ReturnType<typeof loadQuote>>;

function price(loaded: Loaded, catalog: CatalogProduct[]) {
  // A sent quote already holds its reservation, so give it back before checking stock.
  const own = loaded.quote.status === "sent" ? loaded.items : [];
  const live = catalog.map(p => ({ ...p, reservedQty: p.reservedQty - own.filter(i => i.productId === p.id).reduce((s, i) => s + i.qty, 0) }));
  const lines: StoredLine[] = loaded.items.map(i => ({ id: i.id, productId: i.productId, qty: i.qty,
    unitPriceSen: i.unitPrice === null ? null : toSen(i.unitPrice), reviewFlags: i.flags as Flag[] }));
  return priceStoredLines({ lines, catalog: live, discountPct: Number(loaded.quote.discountPct), deliverySen: toSen(loaded.quote.deliveryRm) });
}

/** Persists recomputed totals and the status a quote should hold after an edit (edits clear a pending approval). */
async function settle(q: Db, quoteId: number) {
  const loaded = await loadQuote(quoteId, q);
  const priced = price(loaded, await loadCatalog(q));
  const status = priced.flags.length ? "needs_review" as const : "drafted" as const;
  await q.update(quotes).set({ status, subtotal: fromSen(priced.subtotalSen), discountRm: fromSen(priced.discountSen),
    total: fromSen(priced.totalSen) }).where(eq(quotes.id, quoteId));
  for (const line of priced.lines) {
    await q.update(quoteItems).set({ lineTotal: line.lineTotalSen === null ? null : fromSen(line.lineTotalSen) }).where(eq(quoteItems.id, line.id));
  }
  await q.update(messages).set({ status }).where(eq(messages.id, loaded.quote.messageId));
  return { status, totalRm: fromSen(priced.totalSen), flags: priced.flags };
}

export async function getQuoteDetail(quoteId: number) {
  const [loaded, catalog, zones] = await Promise.all([loadQuote(quoteId), loadCatalog(), loadZones()]);
  const priced = price(loaded, catalog);
  const [lastDecision] = await db.select().from(activityLog)
    .where(and(eq(activityLog.entity, "quote"), eq(activityLog.entityId, quoteId),
      inArray(activityLog.action, ["approval_requested", "approval_returned", "quote_sent"])))
    .orderBy(desc(activityLog.id)).limit(1);
  const returned = lastDecision?.action === "approval_returned" ? (lastDecision.details as { comment?: string }).comment ?? null : null;
  // How the message was read (AI model or rules fallback) is recorded on the draft's log entry.
  const [drafted] = await db.select({ details: activityLog.details }).from(activityLog)
    .where(and(eq(activityLog.entity, "quote"), eq(activityLog.entityId, quoteId), eq(activityLog.action, "quote_drafted"))).limit(1);
  const d = (drafted?.details ?? {}) as { model?: string | null; latencyMs?: number; fallbackReason?: string | null;
    language?: string | null; notes?: string | null; after?: { deliveryZone?: string } };
  const { quote, message, customer } = loaded;
  return {
    id: quote.id, messageId: message.id, messageBody: message.body, receivedAt: message.receivedAt.toISOString(),
    customerName: customer.name, customerType: customer.type, customerPhone: customer.phone,
    deliveryZone: d.after?.deliveryZone ?? pickZone(message.body, customer.zoneId, zones).name, status: quote.status, parsedBy: quote.parsedBy,
    parser: { model: d.model ?? null, latencyMs: d.latencyMs ?? null, fallbackReason: d.fallbackReason ?? null,
      language: d.language ?? null, notes: d.notes ?? null },
    lines: priced.lines.map(line => ({
      id: line.id, rawText: loaded.items.find(i => i.id === line.id)!.rawText, productId: line.product?.id ?? null,
      productName: line.product?.name ?? null, unit: line.product?.unit ?? null, qty: line.qty,
      unitPriceRm: line.unitPriceSen === null ? null : fromSen(line.unitPriceSen),
      catalogPriceRm: line.catalogPriceSen === null ? null : fromSen(line.catalogPriceSen),
      lineTotalRm: line.lineTotalSen === null ? null : fromSen(line.lineTotalSen),
      confidence: Number(loaded.items.find(i => i.id === line.id)!.confidence), flags: line.flags, available: line.available,
      options: line.flags.includes("ambiguous_variant")
        ? matchProduct(loaded.items.find(i => i.id === line.id)!.rawText, catalog).options.map(p => ({
          id: p.id, name: p.name, priceRm: p.priceRm, available: p.stockQty - p.reservedQty }))
        : [],
    })),
    subtotalRm: fromSen(priced.subtotalSen), discountPct: priced.discountPct, discountRm: fromSen(priced.discountSen),
    deliveryRm: fromSen(priced.deliverySen), totalRm: fromSen(priced.totalSen), totalsComplete: priced.totalsComplete,
    approvalReasons: priced.reasons, openFlags: priced.flags.length, canSend: priced.canSend,
    needsOwner: priced.reasons.length > 0, createdAt: quote.createdAt.toISOString(),
    sentAt: quote.sentAt?.toISOString() ?? null, validUntil: quote.validUntil.toISOString(), lastComment: returned,
  };
}

export async function draftQuote(messageId: number, actorUserId: number) {
  const actor = await getActor(actorUserId);
  requireRole(actor, "owner", "staff");
  const [existing] = await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.messageId, messageId));
  if (existing) return getQuoteDetail(existing.id);
  const [found] = await db.select({ body: messages.body }).from(messages).where(eq(messages.id, messageId));
  if (!found) throw new HttpError(404, "Message not found");
  // Read the message with AI (or rules) before the DB transaction, so a slow model never holds locks.
  const [catalog0, zones0, settings] = await Promise.all([loadCatalog(), loadZones(), getSettings()]);
  const extraction = await extractMessage(found.body, catalog0, zones0, { aiEnabled: settings.aiExtraction, config: llmConfigFromEnv() });

  const id = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(4182027, ${messageId})`);
    const [again] = await tx.select({ id: quotes.id }).from(quotes).where(eq(quotes.messageId, messageId));
    if (again) return again.id;
    const [row] = await tx.select({ message: messages, customer: customers }).from(messages)
      .innerJoin(customers, eq(messages.customerId, customers.id)).where(eq(messages.id, messageId));
    if (!row) throw new HttpError(404, "Message not found");
    const [catalog, zones] = await Promise.all([loadCatalog(tx), loadZones(tx)]);
    const zone = zones.find(z => z.id === extraction.deliveryZoneId) ?? pickZone(row.message.body, row.customer.zoneId, zones);
    // Deterministic from here on: the catalogue picks products and prices, never the extractor.
    const drafted = toDraftLines(extraction.items, catalog);
    const discountPct = discounts[row.customer.type];
    const [quote] = await tx.insert(quotes).values({
      messageId, customerId: row.customer.id, status: "drafted", subtotal: "0", discountPct: String(discountPct),
      discountRm: "0", deliveryRm: zone.feeRm, total: "0", parsedBy: extraction.parsedBy,
      validUntil: new Date(Date.now() + 3 * DAY),
    }).returning();
    if (drafted.length) await tx.insert(quoteItems).values(drafted.map(line => ({
      quoteId: quote!.id, rawText: line.rawText, productId: line.product?.id ?? null, qty: line.qty,
      unitPrice: line.product?.priceRm ?? null, confidence: line.confidence.toFixed(3), flags: line.reviewFlags,
    })));
    const after = await settle(tx, quote!.id);
    await log(tx, actor.id, "quote_drafted", "quote", quote!.id, {
      before: null, after: { ...after, lines: drafted.length, deliveryZone: zone.name }, messageId,
      parsedBy: extraction.parsedBy, model: extraction.model, latencyMs: extraction.latencyMs,
      fallbackReason: extraction.fallbackReason, language: extraction.language, notes: extraction.notes,
    });
    return quote!.id;
  });
  return getQuoteDetail(id);
}

function assertEditable(loaded: Loaded) {
  if (loaded.quote.status === "sent") throw new HttpError(409, "This quote was already sent");
}

export async function updateItem(quoteId: number, itemId: number, actorUserId: number,
  change: { productId?: number; qty?: number; unitPriceRm?: string; confirm?: boolean; remove?: boolean }) {
  const actor = await getActor(actorUserId);
  requireRole(actor, "owner", "staff");
  await db.transaction(async tx => {
    const loaded = await loadQuote(quoteId, tx);
    assertEditable(loaded);
    const item = loaded.items.find(i => i.id === itemId);
    if (!item) throw new HttpError(404, "Line not found");
    const before = { productId: item.productId, qty: item.qty, unitPrice: item.unitPrice, flags: item.flags };
    if (change.remove) {
      await tx.delete(quoteItems).where(eq(quoteItems.id, itemId));
      const after = await settle(tx, quoteId);
      await log(tx, actor.id, "line_removed", "quote", quoteId, { itemId, rawText: item.rawText, before, after });
      return;
    }
    const next = { productId: item.productId, qty: item.qty, unitPrice: item.unitPrice, flags: item.flags };
    if (change.productId !== undefined) {
      const [product] = await tx.select().from(products).where(eq(products.id, change.productId));
      if (!product) throw new HttpError(400, "Unknown product");
      Object.assign(next, { productId: product.id, unitPrice: product.priceRm, flags: [] });
    }
    if (change.qty !== undefined) next.qty = change.qty;
    if (change.unitPriceRm !== undefined) {
      if (next.productId === null) throw new HttpError(409, "Pick a product before changing its price");
      next.unitPrice = fromSen(toSen(change.unitPriceRm));
    }
    if (change.confirm) next.flags = next.flags.filter(f => f !== "low_confidence");
    await tx.update(quoteItems).set(next).where(eq(quoteItems.id, itemId));
    const after = await settle(tx, quoteId);
    await log(tx, actor.id, "line_updated", "quote", quoteId, { itemId, rawText: item.rawText, before, after: { ...next, quote: after } });
  });
  return getQuoteDetail(quoteId);
}

export async function setDiscount(quoteId: number, actorUserId: number, discountPct: number) {
  const actor = await getActor(actorUserId);
  requireRole(actor, "owner", "staff");
  await db.transaction(async tx => {
    const loaded = await loadQuote(quoteId, tx);
    assertEditable(loaded);
    await tx.update(quotes).set({ discountPct: discountPct.toFixed(2) }).where(eq(quotes.id, quoteId));
    const after = await settle(tx, quoteId);
    await log(tx, actor.id, "discount_changed", "quote", quoteId, { before: { discountPct: Number(loaded.quote.discountPct) }, after: { discountPct, quote: after } });
  });
  return getQuoteDetail(quoteId);
}

export async function quoteAction(quoteId: number, actorUserId: number, action: "send" | "request_approval" | "approve" | "return", comment?: string) {
  const actor = await getActor(actorUserId);
  await db.transaction(async tx => {
    const loaded = await loadQuote(quoteId, tx);
    assertEditable(loaded);
    const priced = price(loaded, await loadCatalog(tx));
    const needsOwner = priced.reasons.length > 0;
    const status = loaded.quote.status;
    if (action === "return") {
      requireRole(actor, "owner");
      if (status !== "awaiting_approval") throw new HttpError(409, "Only quotes awaiting approval can be returned");
      if (!comment?.trim()) throw new HttpError(400, "Add a comment so staff know what to change");
      const after = await settle(tx, quoteId);
      await log(tx, actor.id, "approval_returned", "quote", quoteId, { before: { status }, after, comment: comment.trim() });
      return;
    }
    if (priced.flags.length) throw new HttpError(409, "Resolve every flagged line first");
    if (action === "request_approval") {
      requireRole(actor, "owner", "staff");
      if (!needsOwner) throw new HttpError(409, "No approval needed. Send it directly");
      await tx.update(quotes).set({ status: "awaiting_approval" }).where(eq(quotes.id, quoteId));
      await tx.update(messages).set({ status: "awaiting_approval" }).where(eq(messages.id, loaded.quote.messageId));
      await log(tx, actor.id, "approval_requested", "quote", quoteId, { before: { status }, after: { status: "awaiting_approval" }, reasons: priced.reasons });
      return;
    }
    if (action === "approve") {
      requireRole(actor, "owner");
      if (status !== "awaiting_approval") throw new HttpError(409, "Only quotes awaiting approval can be approved");
    } else {
      requireRole(actor, "owner", "staff");
      if (needsOwner && actor.role !== "owner") throw new HttpError(403, "Owner approval needed: request approval instead");
    }
    if (needsOwner) await log(tx, actor.id, "quote_approved", "quote", quoteId, { reasons: priced.reasons, before: { status }, after: { status: "approved" } });
    await sendQuote(tx, loaded, actor.id);
  });
  return getQuoteDetail(quoteId);
}

/** Reserves stock atomically (row locks) and marks the quote sent. */
async function sendQuote(tx: Tx, loaded: Loaded, actorId: number) {
  // Orbyte charges per transaction: no credits, no send (the owner tops up in Settings).
  const wallet = await getWallet(tx);
  if (wallet.balance < CREDITS_PER_QUOTE) throw new HttpError(409, "The Orbyte credit wallet is empty. The owner can top up in Settings");
  const wanted = new Map<number, number>();
  for (const i of loaded.items) if (i.productId !== null) wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.qty);
  const ids = [...wanted.keys()];
  const locked = ids.length
    ? await tx.select().from(products).where(inArray(products.id, ids)).for("update")
    : [];
  for (const p of locked) {
    if (wanted.get(p.id)! > p.stockQty - p.reservedQty) throw new HttpError(409, `Not enough stock for ${p.name}`);
  }
  for (const p of locked) {
    await tx.update(products).set({ reservedQty: p.reservedQty + wanted.get(p.id)! }).where(eq(products.id, p.id));
  }
  const now = new Date();
  await tx.update(quotes).set({ status: "sent", sentAt: now, validUntil: new Date(now.getTime() + 3 * DAY) }).where(eq(quotes.id, loaded.quote.id));
  await tx.update(messages).set({ status: "sent" }).where(eq(messages.id, loaded.quote.messageId));
  await log(tx, actorId, "stock_reserved", "quote", loaded.quote.id, {
    before: null, after: locked.map(p => ({ product: p.name, qty: wanted.get(p.id), reservedBefore: p.reservedQty, reservedAfter: p.reservedQty + wanted.get(p.id)! })),
  });
  await log(tx, actorId, "credit_charged", "quote", loaded.quote.id, {
    before: { balance: wallet.balance }, after: { balance: wallet.balance - CREDITS_PER_QUOTE }, credits: CREDITS_PER_QUOTE, simulated: true,
  });
  await log(tx, actorId, "quote_sent", "quote", loaded.quote.id, {
    before: { status: loaded.quote.status }, after: { status: "sent", totalRm: loaded.quote.total, channel: "simulated_whatsapp" },
  });
}

export async function listQuoteIds(status?: string) {
  const rows = await db.select({ id: quotes.id }).from(quotes)
    .where(status ? eq(quotes.status, status as typeof quotes.$inferSelect.status) : undefined).orderBy(desc(quotes.id));
  return rows.map(r => r.id);
}
