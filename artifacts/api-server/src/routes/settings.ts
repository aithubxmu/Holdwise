import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, activityLog, products, deliveryZones } from "@workspace/db";
import { GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse, RunEvalBody, RunEvalResponse, GetLatestEvalResponse } from "@workspace/api-zod";
import { getSettings, updateSettings } from "../lib/settings.ts";
import { llmConfigFromEnv } from "../lib/llm.ts";
import { runEval, type EvalResult } from "../lib/eval.ts";
import { getActor } from "../lib/quotes.ts";
import { HttpError } from "../lib/http-error.ts";

const router: IRouter = Router();

async function settingsView() {
  const config = llmConfigFromEnv();
  // Only whether a key exists and which model: the key itself never leaves the server.
  return { ...(await getSettings()), ai: { configured: config !== null, provider: config?.provider ?? null, model: config?.model ?? null } };
}
async function requireOwner(actorUserId: number) {
  if ((await getActor(actorUserId)).role !== "owner") throw new HttpError(403, "Only the owner can do this");
}

router.get("/settings", async (_req, res): Promise<void> => {
  res.json(GetSettingsResponse.parse(await settingsView()));
});
router.patch("/settings", async (req, res): Promise<void> => {
  const { actorUserId, ...change } = UpdateSettingsBody.parse(req.body);
  await requireOwner(actorUserId);
  await updateSettings(actorUserId, change);
  res.json(UpdateSettingsResponse.parse(await settingsView()));
});

router.get("/eval", async (_req, res): Promise<void> => {
  const rows = await db.select({ details: activityLog.details }).from(activityLog)
    .where(eq(activityLog.action, "eval_run")).orderBy(desc(activityLog.id)).limit(20);
  const latest = (mode: string) => (rows.find(r => (r.details as EvalResult).mode === mode)?.details ?? null) as EvalResult | null;
  res.json(GetLatestEvalResponse.parse({ ai: latest("ai"), rules: latest("rules") }));
});
router.post("/eval", async (req, res): Promise<void> => {
  const { actorUserId, mode } = RunEvalBody.parse(req.body);
  await requireOwner(actorUserId);
  const config = llmConfigFromEnv();
  if (mode === "ai" && !config) throw new HttpError(409, "No AI key configured on the server (AI_API_KEY)");
  const [catalog, zones] = await Promise.all([
    db.select({ id: products.id, sku: products.sku, name: products.name, aliases: products.aliases, unit: products.unit,
      priceRm: products.priceRm, stockQty: products.stockQty, reservedQty: products.reservedQty, variantGroup: products.variantGroup }).from(products),
    db.select().from(deliveryZones),
  ]);
  const result = await runEval(mode, catalog, zones, config);
  // Saved to the activity log so the /eval page shows the latest numbers without re-running.
  await db.insert(activityLog).values({ actorUserId, action: "eval_run", entity: "eval", entityId: null, details: result });
  res.json(RunEvalResponse.parse(result));
});
export default router;
