/**
 * Measurable benefit, computed only from the database. No invented numbers: with no data,
 * values are 0 or null and the page shows an empty state.
 */
import { eq, inArray } from "drizzle-orm";
import { db, quotes, messages, activityLog } from "@workspace/db";
import { getSettings } from "./settings.ts";
import { getQuoteDetail } from "./quotes.ts";

const MYT = "Asia/Kuala_Lumpur";
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: MYT });
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getDashboard() {
  const [settings, rows, drafts, approvals] = await Promise.all([
    getSettings(),
    db.select({ id: quotes.id, status: quotes.status, parsedBy: quotes.parsedBy, sentAt: quotes.sentAt, receivedAt: messages.receivedAt })
      .from(quotes).innerJoin(messages, eq(quotes.messageId, messages.id)),
    db.select({ entityId: activityLog.entityId, details: activityLog.details }).from(activityLog).where(eq(activityLog.action, "quote_drafted")),
    db.select({ entityId: activityLog.entityId }).from(activityLog).where(inArray(activityLog.action, ["quote_approved"])),
  ]);
  const now = new Date();
  const sent = rows.filter(r => r.status === "sent" && r.sentAt);
  const minutes = sent.map(r => (r.sentAt!.getTime() - r.receivedAt.getTime()) / 60000);
  const avgResponseMinutes = minutes.length ? round1(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null;
  // Time saved = quotes sent × (owner's manual-minutes assumption − actual average) / 60, never negative.
  const hoursSaved = avgResponseMinutes === null ? null
    : round1(Math.max(0, sent.length * (settings.manualMinutesPerQuote - avgResponseMinutes) / 60));

  // "Errors prevented": flags raised when the draft was made that a person has since resolved.
  const byType: Record<string, number> = {};
  for (const d of drafts) {
    const raised = ((d.details as { after?: { flags?: string[] } }).after?.flags ?? []);
    if (!raised.length || d.entityId === null) continue;
    const open = [...(await getQuoteDetail(d.entityId)).lines.flatMap(l => l.flags)];
    for (const f of raised) {
      const i = open.indexOf(f as never);
      if (i >= 0) open.splice(i, 1); else byType[f] = (byType[f] ?? 0) + 1;
    }
  }
  return {
    quotesDrafted: rows.length,
    sentToday: sent.filter(r => dayOf(r.sentAt!) === dayOf(now)).length,
    sentThisWeek: sent.filter(r => now.getTime() - r.sentAt!.getTime() < 7 * 24 * 3600_000).length,
    sentTotal: sent.length,
    avgResponseMinutes,
    manualMinutesPerQuote: settings.manualMinutesPerQuote,
    hoursSaved,
    flagsResolved: Object.entries(byType).map(([flag, count]) => ({ flag, count })).sort((a, b) => b.count - a.count),
    parsedByAi: rows.filter(r => r.parsedBy === "ai").length,
    parsedByRules: rows.filter(r => r.parsedBy === "rules").length,
    ownerApproved: new Set(approvals.map(a => a.entityId)).size,
    awaitingApproval: rows.filter(r => r.status === "awaiting_approval").length,
  };
}
