import { db, pool, users, deliveryZones, customers, products, messages, activityLog } from "@workspace/db";
import { sql } from "drizzle-orm";
import { productSeeds, messageSeeds } from "./seed-data";

async function seed() {
  await db.transaction(async tx => {
    // Serialize concurrent seed runs without resetting existing work.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(4182026)`);
    const existing = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing.length) { process.stdout.write("Demo already seeded; existing work preserved.\n"); return; }
    await tx.insert(users).values([
      { name: "Ah Seng", role: "owner" }, { name: "Aina", role: "staff" }, { name: "Mei Ling", role: "viewer" },
    ]);
    const zones = await tx.insert(deliveryZones).values(
      [["Kajang", 15], ["Bangi", 25], ["Semenyih", 30], ["Cheras", 35], ["Putrajaya", 40], ["Self-pickup", 0]]
        .map(([name, fee]) => ({ name: String(name), feeRm: String(fee) }))
    ).returning();
    const people = await tx.insert(customers).values(Array.from({ length: 10 }, (_, i) => ({
      name: `Demo Customer ${String(i + 1).padStart(2, "0")}`,
      phone: `+60 12-000 ${String(i + 1).padStart(4, "0")}`,
      type: (["walk_in", "regular", "contractor"] as const)[i % 3]!,
      zoneId: zones[i % zones.length]!.id,
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
    process.stdout.write(`Seeded ${productSeeds.length} products, 10 customers, 6 zones, 3 users, 15 messages.\n`);
  });
}
seed().catch(() => { process.stderr.write("Seeding failed. Check database configuration and schema.\n"); process.exitCode = 1; })
  .finally(() => pool.end());
