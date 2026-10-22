import { pgEnum, pgTable, serial, text, integer, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { customers, users } from "./people";
import { products } from "./products";
export const statusEnum = pgEnum("quote_status", ["new", "drafted", "needs_review", "awaiting_approval", "sent", "rejected"]);
export const parsedEnum = pgEnum("parsed_by", ["ai", "rules"]);
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(), customerId: integer("customer_id").notNull().references(() => customers.id),
  body: text("body").notNull(), receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  status: statusEnum("status").notNull().default("new"),
});
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(), messageId: integer("message_id").notNull().unique().references(() => messages.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  status: statusEnum("status").notNull().default("drafted"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull(),
  discountRm: numeric("discount_rm", { precision: 12, scale: 2 }).notNull(),
  deliveryRm: numeric("delivery_rm", { precision: 12, scale: 2 }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  parsedBy: parsedEnum("parsed_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
});
export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(), quoteId: integer("quote_id").notNull().references(() => quotes.id),
  rawText: text("raw_text").notNull(), productId: integer("product_id").references(() => products.id),
  qty: integer("qty").notNull(), unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  flags: text("flags").array().notNull().default([]),
});
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(), at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorUserId: integer("actor_user_id").references(() => users.id),
  action: text("action").notNull(), entity: text("entity").notNull(), entityId: integer("entity_id"),
  details: jsonb("details").notNull(),
});
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true });
export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({ id: true });
export const insertActivitySchema = createInsertSchema(activityLog).omit({ id: true });
export type Message = typeof messages.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
