import { pgEnum, pgTable, serial, text, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const roleEnum = pgEnum("role", ["owner", "staff", "viewer"]);
export const customerTypeEnum = pgEnum("customer_type", ["walk_in", "regular", "contractor"]);
export const users = pgTable("users", {
  id: serial("id").primaryKey(), name: text("name").notNull(), role: roleEnum("role").notNull(),
});
export const deliveryZones = pgTable("delivery_zones", {
  id: serial("id").primaryKey(), name: text("name").notNull().unique(),
  feeRm: numeric("fee_rm", { precision: 12, scale: 2 }).notNull(),
});
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(), name: text("name").notNull(),
  phone: text("phone").notNull().unique(), type: customerTypeEnum("type").notNull(),
  zoneId: integer("zone_id").notNull().references(() => deliveryZones.id),
});
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true });
export const insertZoneSchema = createInsertSchema(deliveryZones).omit({ id: true });
export type Customer = typeof customers.$inferSelect;
