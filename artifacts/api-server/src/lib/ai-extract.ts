/**
 * Step 3 of the journey, the only place AI is used: reading a messy Malay/English/Manglish
 * message into a list of requested items. The model never sees or returns prices, discounts,
 * stock or totals. Matching to the catalogue and all money stays in rules.ts.
 */
import { z } from "zod";
import { extractItems } from "./extract.ts";
import { normalize, type CatalogProduct, type DeliveryZone, type ExtractedItem } from "./rules.ts";
import { callLlm, isBusy, type LlmConfig } from "./llm.ts";

/** Strict shape we accept from the model. Unknown keys (e.g. a "price") are dropped by zod. */
export const AiExtractionSchema = z.object({
  items: z.array(z.object({
    raw_text: z.string().min(1).max(300),
    product_guess: z.string().min(1).max(120),
    qty: z.number().nullable(),
    unit: z.string().max(30).nullable(),
    confidence: z.number().min(0).max(1),
  })).max(30),
  delivery_area: z.string().max(60).nullable(),
  requested_date: z.string().max(60).nullable(),
  language: z.string().max(30),
  notes: z.string().max(300).nullable(),
});
export type AiExtraction = z.infer<typeof AiExtractionSchema>;

export interface MessageExtraction {
  items: ExtractedItem[];
  parsedBy: "ai" | "rules";
  deliveryZoneId: number | null;
  model: string | null;
  latencyMs: number;
  /** Why the rules parser was used instead of AI (null when AI succeeded). */
  fallbackReason: string | null;
  language: string | null;
  notes: string | null;
}

export function buildPrompt(text: string, catalog: CatalogProduct[], zones: DeliveryZone[]) {
  // Names and aliases only: the model must not see prices, so it cannot quote or alter them.
  const products = catalog.map(p => `- ${p.name} (customers say: ${p.aliases.join(", ")})`).join("\n");
  const system = `You read WhatsApp messages sent to a Malaysian hardware shop in Malay, English or a mix (Manglish).
Extract ONLY the items the customer wants a price for. Return JSON only, exactly this shape:
{"items":[{"raw_text":string,"product_guess":string,"qty":number|null,"unit":string|null,"confidence":number}],
 "delivery_area":string|null,"requested_date":string|null,"language":string,"notes":string|null}
Rules:
- raw_text: the customer's own words for that item, copied from the message.
- product_guess: the exact catalogue product name below if you are sure; otherwise the customer's words. Never invent products.
- qty: the number the customer asked for (convert words like "sepuluh" to 10). null if they did not say a quantity.
- confidence: 0..1, how sure you are that product_guess and qty are right.
- delivery_area: the place to deliver to, "Self-pickup" if they will collect, null if not said.
- Never output prices, discounts, stock or totals.
Catalogue:
${products}
Delivery areas: ${zones.map(z => z.name).join(", ")}`;
  return { system, user: `Message:\n"""${text}"""` };
}

/** Parses and validates the model's text. Throws on anything that is not the expected JSON. */
export function parseAiResponse(raw: string): AiExtraction {
  // Models without a JSON mode (GLM on RunPod) may add a reasoning preamble or code fences:
  // keep only the outermost {...}; zod still rejects anything that is not exactly our shape.
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  return AiExtractionSchema.parse(JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw));
}

/** Maps a delivery area named by the model onto a known zone; unknown places are ignored. */
function zoneFor(area: string | null, zones: DeliveryZone[]) {
  if (!area) return null;
  const a = normalize(area);
  if (/\b(?:self pickup|pickup|pick up|ambil sendiri|collect)\b/.test(a)) return zones.find(z => normalize(z.name) === "self pickup")?.id ?? null;
  return zones.find(z => normalize(z.name) === a)?.id ?? null;
}

export async function extractMessage(text: string, catalog: CatalogProduct[], zones: DeliveryZone[], opts: {
  aiEnabled: boolean; config: LlmConfig | null; timeoutMs?: number;
  /** Injected in tests instead of a real API call. */
  call?: typeof callLlm;
}): Promise<MessageExtraction> {
  const started = Date.now();
  const rules = (fallbackReason: string | null): MessageExtraction => {
    const r = extractItems(text, catalog, zones);
    return { items: r.items, parsedBy: "rules", deliveryZoneId: r.deliveryZoneId, model: null, fallbackReason,
      latencyMs: Date.now() - started, language: null, notes: null };
  };
  if (!opts.aiEnabled) return rules("AI extraction is switched off in Settings");
  if (!opts.config) return rules("No AI key configured");

  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { system, user } = buildPrompt(text, catalog, zones);
    const call = opts.call ?? callLlm;
    let model = opts.config.model;
    let raw: string;
    try {
      raw = await call(opts.config, system, user, controller.signal);
    } catch (err) {
      // Free tiers get busy: one retry on the lighter model, still inside the same 8 s budget.
      if (!isBusy(err) || !opts.config.fallbackModel) throw err;
      model = opts.config.fallbackModel;
      raw = await call({ ...opts.config, model }, system, user, controller.signal);
    }
    const ai = parseAiResponse(raw);
    const items: ExtractedItem[] = ai.items.map(i => ({
      rawText: i.raw_text, itemText: i.product_guess, unit: i.unit, aiConfidence: i.confidence,
      // Only whole positive numbers count as a quantity; anything else goes to a human as "missing".
      qty: i.qty !== null && Number.isSafeInteger(i.qty) && i.qty > 0 ? i.qty : null,
    }));
    return { items, parsedBy: "ai", deliveryZoneId: zoneFor(ai.delivery_area, zones), model,
      latencyMs: Date.now() - started, fallbackReason: null, language: ai.language, notes: ai.notes };
  } catch (err) {
    const reason = controller.signal.aborted ? `AI timed out after ${timeoutMs / 1000} s`
      : err instanceof SyntaxError || (err as Error)?.name === "ZodError" ? "AI returned invalid JSON"
      : `AI request failed (${String((err as Error)?.message ?? err).slice(0, 80)})`;
    return rules(reason);
  } finally {
    clearTimeout(timer);
  }
}
