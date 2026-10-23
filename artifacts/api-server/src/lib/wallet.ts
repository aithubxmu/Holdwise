/**
 * Simulated Orbyte Credit wallet: our transaction-based pricing. Each quote actually sent
 * costs 1 credit. Balance = owner's top-up (Settings) − credit_charged rows in the activity log.
 * Nothing is billed; this only demonstrates the business model.
 */
import { count, eq } from "drizzle-orm";
import { db, activityLog } from "@workspace/db";
import { getSettings } from "./settings.ts";

export const CREDITS_PER_QUOTE = 1;
type Db = Pick<typeof db, "select" | "insert">;

export async function getWallet(q: Db = db) {
  const [settings, [used]] = await Promise.all([
    getSettings(q),
    q.select({ n: count() }).from(activityLog).where(eq(activityLog.action, "credit_charged")),
  ]);
  const usedCredits = (used?.n ?? 0) * CREDITS_PER_QUOTE;
  return { startingCredits: settings.startingCredits, used: usedCredits, balance: settings.startingCredits - usedCredits, perQuote: CREDITS_PER_QUOTE };
}
