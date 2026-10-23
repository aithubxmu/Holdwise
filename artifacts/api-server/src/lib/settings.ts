/**
 * Owner settings, stored as "setting_changed" rows in the activity log: no schema change is
 * needed, and every change is audited. The current value is the newest row for each key.
 */
import { desc, eq } from "drizzle-orm";
import { db, activityLog } from "@workspace/db";

export const DEFAULT_SETTINGS = {
  aiExtraction: true,
  /** Owner's estimate of how long one quote takes by hand. An assumption, shown as such. */
  manualMinutesPerQuote: 8,
  /** Simulated Orbyte Credit wallet top-up; each sent quote costs 1 credit. */
  startingCredits: 100,
};
export type Settings = typeof DEFAULT_SETTINGS;
type Db = Pick<typeof db, "select" | "insert">;

export async function getSettings(q: Db = db): Promise<Settings> {
  const rows = await q.select({ details: activityLog.details }).from(activityLog)
    .where(eq(activityLog.action, "setting_changed")).orderBy(desc(activityLog.id));
  const settings = { ...DEFAULT_SETTINGS };
  const seen = new Set<string>();
  for (const { details } of rows) {
    const { key, after } = details as { key: keyof Settings; after: never };
    if (key in settings && !seen.has(key)) { seen.add(key); settings[key] = after; }
  }
  return settings;
}

export async function updateSettings(actorUserId: number, change: Partial<Settings>) {
  const current = await getSettings();
  for (const key of Object.keys(change) as (keyof Settings)[]) {
    if (change[key] === undefined || change[key] === current[key]) continue;
    await db.insert(activityLog).values({ actorUserId, action: "setting_changed", entity: "settings", entityId: null,
      details: { key, before: current[key], after: change[key] } });
  }
  return getSettings();
}
