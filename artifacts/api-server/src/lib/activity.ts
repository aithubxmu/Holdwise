/** Activity log reads with a one-line human summary per entry. */
import { and, desc, eq, or } from "drizzle-orm";
import { db, activityLog, users, quotes } from "@workspace/db";

type Details = Record<string, any>;
function summarize(action: string, entity: string, entityId: number | null, d: Details) {
  const q = `quote #${entityId}`;
  switch (action) {
    case "message_received": return `WhatsApp enquiry #${entityId} received`;
    case "quote_drafted": return `Drafted ${q} from message #${d.messageId}: ${d.after?.lines ?? 0} lines, ${d.after?.flags?.length ?? 0} flags, delivery ${d.after?.deliveryZone}`;
    case "line_updated": return `Edited line "${d.rawText}" on ${q}`;
    case "line_removed": return `Removed line "${d.rawText}" from ${q}`;
    case "discount_changed": return `Discount on ${q}: ${d.before?.discountPct}% → ${d.after?.discountPct}%`;
    case "approval_requested": return `Asked the owner to approve ${q} (${(d.reasons ?? []).join("; ")})`;
    case "approval_returned": return `Returned ${q} to staff: "${d.comment}"`;
    case "quote_approved": return `Approved ${q}`;
    case "stock_reserved": return `Reserved stock for ${q}: ${(d.after ?? []).map((r: Details) => `${r.qty} × ${r.product}`).join(", ")}`;
    case "quote_sent": return `Sent ${q} to the customer (RM ${d.after?.totalRm}, simulated WhatsApp)`;
    default: return `${action.replaceAll("_", " ")} on ${entity} #${entityId}`;
  }
}

export async function listActivity(quoteId?: number) {
  let where;
  if (quoteId !== undefined) {
    const [quote] = await db.select({ messageId: quotes.messageId }).from(quotes).where(eq(quotes.id, quoteId));
    const forQuote = and(eq(activityLog.entity, "quote"), eq(activityLog.entityId, quoteId));
    where = quote ? or(forQuote, and(eq(activityLog.entity, "message"), eq(activityLog.entityId, quote.messageId))) : forQuote;
  }
  const rows = await db.select({ log: activityLog, actorName: users.name, actorRole: users.role })
    .from(activityLog).leftJoin(users, eq(activityLog.actorUserId, users.id))
    .where(where).orderBy(desc(activityLog.at), desc(activityLog.id)).limit(200);
  return rows.map(({ log, actorName, actorRole }) => ({
    id: log.id, at: log.at.toISOString(), actorName, actorRole, action: log.action, entity: log.entity,
    entityId: log.entityId, summary: summarize(log.action, log.entity, log.entityId, log.details as Details),
    details: log.details as Details,
  }));
}
