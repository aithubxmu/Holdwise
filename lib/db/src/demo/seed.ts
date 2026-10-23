import { sql } from "drizzle-orm";
import { db, users, deliveryZones, customers, products, messages, activityLog } from "../index";
import { productSeeds, messageSeeds, zoneSeeds, customerSeeds } from "./seed-data";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const LOCK = sql`SELECT pg_advisory_xact_lock(4182026)`;

async function insertDemo(tx: Tx) {
  await tx.insert(users).values([
    { name: "Ah Seng", role: "owner" }, { name: "Aina", role: "staff" }, { name: "Mei Ling", role: "viewer" },
  ]);
  const zones = await tx.insert(deliveryZones).values(
    zoneSeeds.map(([name, fee]) => ({ name, feeRm: fee.toFixed(2) })),
  ).returning();
  const zoneId = (name: string) => zones.find(z => z.name === name)!.id;
  const people = await tx.insert(customers).values(customerSeeds.map(([name, type, zone], i) => ({
    name, type, zoneId: zoneId(zone), phone: `+60 12-000 ${String(i + 1).padStart(4, "0")}`,
  }))).returning();
  await tx.insert(products).values(productSeeds.map(([name, unit, price, stock, category, aliases, variantGroup], i) => ({
    sku: `QL-${String(i + 1).padStart(3, "0")}`, name, unit, priceRm: price.toFixed(2),
    stockQty: stock, reservedQty: 0, category, aliases, variantGroup: variantGroup ?? null,
  })));
  const now = Date.now();
  const received = await tx.insert(messages).values(messageSeeds.map((body, i) => ({
    customerId: people[(i === 3 ? 2 : i) % people.length]!.id, body,
    receivedAt: new Date(now - i * 7 * 60_000), status: "new" as const,
  }))).returning();
  await tx.insert(activityLog).values(received.map(m => ({
    action: "message_received", entity: "message", entityId: m.id, at: m.receivedAt,
    details: { source: "synthetic_seed", before: null, after: { body: m.body, status: m.status } },
  })));
}

/** Seeds an empty database. Never wipes existing work. Returns false if data already exists. */
export async function seedDemo() {
  return db.transaction(async tx => {
    // Serialize concurrent seed runs without resetting existing work.
    await tx.execute(LOCK);
    const existing = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing.length) return false;
    await insertDemo(tx);
    return true;
  });
}

/** Wipes every demo table and reseeds from scratch, in one transaction. */
export async function resetDemo() {
  await db.transaction(async tx => {
    await tx.execute(LOCK);
    await tx.execute(sql`TRUNCATE activity_log, quote_items, quotes, messages, customers, products, delivery_zones, users RESTART IDENTITY CASCADE`);
    await insertDemo(tx);
  });
}
