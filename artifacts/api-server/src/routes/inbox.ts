import { Router, type IRouter } from "express";
import { count, desc, eq } from "drizzle-orm";
import { db, messages, customers, deliveryZones, products, users } from "@workspace/db";
import { ListMessagesResponse, GetDemoContextResponse } from "@workspace/api-zod";

const router: IRouter = Router();
router.get("/messages", async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: messages.id, customerId: customers.id, customerName: customers.name,
    customerType: customers.type, phone: customers.phone, zone: deliveryZones.name,
    body: messages.body, receivedAt: messages.receivedAt, status: messages.status,
  }).from(messages).innerJoin(customers, eq(messages.customerId, customers.id))
    .innerJoin(deliveryZones, eq(customers.zoneId, deliveryZones.id))
    .orderBy(desc(messages.receivedAt), desc(messages.id));
  res.json(ListMessagesResponse.parse(rows.map(row => ({ ...row, receivedAt: row.receivedAt.toISOString() }))));
});
router.get("/demo-context", async (_req, res): Promise<void> => {
  const [demoUsers, pc, cc, zc] = await Promise.all([
    db.select().from(users).orderBy(users.id),
    db.select({ value: count() }).from(products),
    db.select({ value: count() }).from(customers),
    db.select({ value: count() }).from(deliveryZones),
  ]);
  res.json(GetDemoContextResponse.parse({
    shopName: "Ah Seng Hardware, Kajang", users: demoUsers, productCount: pc[0]?.value ?? 0,
    customerCount: cc[0]?.value ?? 0, zoneCount: zc[0]?.value ?? 0, milestone: "M1 · Inbox foundation",
  }));
});
export default router;
