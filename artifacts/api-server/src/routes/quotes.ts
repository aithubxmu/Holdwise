import { Router, type IRouter } from "express";
import { db, products } from "@workspace/db";
import { resetDemo } from "@workspace/db/demo";
import {
  ListProductsResponse, DraftQuoteParams, DraftQuoteBody, DraftQuoteResponse, ListQuotesQueryParams, ListQuotesResponse,
  GetQuoteParams, GetQuoteResponse, UpdateQuoteParams, UpdateQuoteBody, UpdateQuoteResponse, UpdateQuoteItemParams,
  UpdateQuoteItemBody, UpdateQuoteItemResponse, QuoteActionParams, QuoteActionBody, QuoteActionResponse,
  ListActivityQueryParams, ListActivityResponse, ResetDemoBody, ResetDemoResponse,
} from "@workspace/api-zod";
import { draftQuote, getQuoteDetail, updateItem, setDiscount, quoteAction, listQuoteIds, getActor } from "../lib/quotes.ts";
import { listActivity } from "../lib/activity.ts";
import { HttpError } from "../lib/http-error.ts";

const router: IRouter = Router();
router.get("/products", async (_req, res): Promise<void> => {
  const rows = await db.select().from(products).orderBy(products.category, products.name);
  res.json(ListProductsResponse.parse(rows.map(p => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, priceRm: p.priceRm,
    available: p.stockQty - p.reservedQty, category: p.category, variantGroup: p.variantGroup }))));
});
router.post("/messages/:messageId/quote", async (req, res): Promise<void> => {
  const { messageId } = DraftQuoteParams.parse(req.params);
  const { actorUserId } = DraftQuoteBody.parse(req.body);
  res.json(DraftQuoteResponse.parse(await draftQuote(messageId, actorUserId)));
});
router.get("/quotes", async (req, res): Promise<void> => {
  const { status } = ListQuotesQueryParams.parse(req.query);
  const ids = await listQuoteIds(status);
  res.json(ListQuotesResponse.parse(await Promise.all(ids.map(getQuoteDetail))));
});
router.get("/quotes/:quoteId", async (req, res): Promise<void> => {
  const { quoteId } = GetQuoteParams.parse(req.params);
  res.json(GetQuoteResponse.parse(await getQuoteDetail(quoteId)));
});
router.patch("/quotes/:quoteId", async (req, res): Promise<void> => {
  const { quoteId } = UpdateQuoteParams.parse(req.params);
  const { actorUserId, discountPct } = UpdateQuoteBody.parse(req.body);
  res.json(UpdateQuoteResponse.parse(await setDiscount(quoteId, actorUserId, discountPct)));
});
router.patch("/quotes/:quoteId/items/:itemId", async (req, res): Promise<void> => {
  const { quoteId, itemId } = UpdateQuoteItemParams.parse(req.params);
  const { actorUserId, ...change } = UpdateQuoteItemBody.parse(req.body);
  res.json(UpdateQuoteItemResponse.parse(await updateItem(quoteId, itemId, actorUserId, change)));
});
router.post("/quotes/:quoteId/actions", async (req, res): Promise<void> => {
  const { quoteId } = QuoteActionParams.parse(req.params);
  const { actorUserId, action, comment } = QuoteActionBody.parse(req.body);
  res.json(QuoteActionResponse.parse(await quoteAction(quoteId, actorUserId, action, comment)));
});
router.get("/activity", async (req, res): Promise<void> => {
  const { quoteId } = ListActivityQueryParams.parse(req.query);
  res.json(ListActivityResponse.parse(await listActivity(quoteId)));
});
router.post("/demo/reset", async (req, res): Promise<void> => {
  const { actorUserId } = ResetDemoBody.parse(req.body);
  if ((await getActor(actorUserId)).role !== "owner") throw new HttpError(403, "Only the owner can reset demo data");
  await resetDemo();
  res.json(ResetDemoResponse.parse({ ok: true }));
});
export default router;
