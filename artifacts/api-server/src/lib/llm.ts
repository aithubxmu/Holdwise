/**
 * Thin LLM adapter. Switch provider with environment variables only:
 *   AI_PROVIDER=runpod|gemini|anthropic|openai   (if unset: runpod when RUNPOD_API_KEY exists, else gemini)
 *   RUNPOD_API_KEY  key for RunPod (GLM-5.3 on the sponsor's Public Endpoint)
 *   AI_API_KEY      key for gemini / anthropic / openai
 *   AI_MODEL, AI_BASE_URL, AI_FALLBACK_MODEL     optional overrides
 * Keys live only in Replit Secrets or a local, git-ignored .env. Plain fetch, no SDK needed:
 * RunPod's endpoint speaks the OpenAI chat-completions API, so it shares the OpenAI code path.
 */
export type Provider = "runpod" | "gemini" | "anthropic" | "openai";
export interface LlmConfig { provider: Provider; apiKey: string; model: string; fallbackModel: string | null; baseUrl?: string }

const DEFAULT_MODEL: Record<Provider, string> = {
  runpod: "glm-5.3",
  // gemini-2.5-flash is closed to new keys (404); 3.5-flash answered in ~2 s on the free tier (Oct 2026).
  gemini: "gemini-3.5-flash",
  anthropic: "claude-haiku-5-5",
  openai: "gpt-4o-mini",
};
/** OpenAI-compatible base URLs. RunPod's comes from the organisers' announcement (23 Oct). */
const BASE_URL: Partial<Record<Provider, string>> = {
  runpod: "https://api.runpod.ai/v2/b1dd8hy2hqo1nb/openai/v1",
  openai: "https://api.openai.com/v1",
};
/** Tried once when the main model is overloaded (503) or rate-limited (429). */
const FALLBACK_MODEL: Record<Provider, string | null> = { runpod: null, gemini: "gemini-flash-lite-latest", anthropic: null, openai: null };
/** Our answers are short JSON; capping output keeps the RunPod credit (US$25 per team) from draining. */
export const MAX_OUTPUT_TOKENS = 1000;

/** Returns null when no key is configured; the caller then falls back to the rules parser. */
export function llmConfigFromEnv(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  const runpodKey = env.RUNPOD_API_KEY?.trim();
  const provider = (env.AI_PROVIDER?.trim().toLowerCase() || (runpodKey ? "runpod" : "gemini")) as Provider;
  if (!(provider in DEFAULT_MODEL)) throw new Error(`Unknown AI_PROVIDER "${provider}"`);
  const apiKey = provider === "runpod" ? runpodKey : env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  return { provider, apiKey, model: env.AI_MODEL?.trim() || DEFAULT_MODEL[provider],
    fallbackModel: env.AI_FALLBACK_MODEL?.trim() || FALLBACK_MODEL[provider],
    baseUrl: env.AI_BASE_URL?.trim() || BASE_URL[provider] };
}

export const isBusy = (err: unknown) => /^(?:429|503)\b/.test(String((err as Error)?.message ?? ""));

/** Sends one system + user prompt, asks for JSON, returns the model's raw text. */
export async function callLlm(cfg: LlmConfig, system: string, user: string, signal: AbortSignal): Promise<string> {
  if (cfg.provider === "gemini") {
    const data = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
      { "x-goog-api-key": cfg.apiKey }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }, signal);
    return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  }
  if (cfg.provider === "anthropic") {
    const data = await post("https://api.anthropic.com/v1/messages",
      { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      { model: cfg.model, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0, system, messages: [{ role: "user", content: user }] }, signal);
    return data?.content?.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("") ?? "";
  }
  // OpenAI-compatible chat completions: OpenAI itself, or GLM-5.3 on RunPod.
  const body: Record<string, unknown> = {
    model: cfg.model, temperature: 0, max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  };
  // GLM is a reasoning model: "low" keeps it fast and cheap (organisers' recommendation for the shared credit).
  if (cfg.provider === "runpod") body.reasoning_effort = "low";
  else body.response_format = { type: "json_object" };
  const data = await post(`${cfg.baseUrl}/chat/completions`, { authorization: `Bearer ${cfg.apiKey}` }, body, signal);
  return data?.choices?.[0]?.message?.content ?? "";
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  // Never include the request (it holds the key) in errors; status + a short body is enough to debug.
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<any>;
}
