import { pool } from "@workspace/db";
import { seedDemo } from "@workspace/db/demo";
import { productSeeds, messageSeeds, customerSeeds, zoneSeeds } from "@workspace/db/demo/seed-data";

async function seed() {
  if (!(await seedDemo())) { process.stdout.write("Demo already seeded; existing work preserved.\n"); return; }
  process.stdout.write(`Seeded ${productSeeds.length} products, ${customerSeeds.length} customers, ${zoneSeeds.length} zones, 3 users, ${messageSeeds.length} messages.\n`);
}
seed().catch(() => { process.stderr.write("Seeding failed. Check database configuration and schema.\n"); process.exitCode = 1; })
  .finally(() => pool.end());
