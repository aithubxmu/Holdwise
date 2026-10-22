import { pgTable, serial, text, integer, numeric, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
export const products = pgTable("products", {
  id: serial("id").primaryKey(), sku: text("sku").notNull().unique(),
  name: text("name").notNull(), aliases: text("aliases").array().notNull(),
  unit: text("unit").notNull(), priceRm: numeric("price_rm", { precision: 12, scale: 2 }).notNull(),
  stockQty: integer("stock_qty").notNull(), reservedQty: integer("reserved_qty").notNull().default(0),
  category: text("category").notNull(), variantGroup: text("variant_group"),
}, (t) => [
  check("nonnegative_price", sql`${t.priceRm} >= 0`),
  check("valid_stock", sql`${t.stockQty} >= 0 AND ${t.reservedQty} >= 0 AND ${t.reservedQty} <= ${t.stockQty}`),
]);
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export type Product = typeof products.$inferSelect;
