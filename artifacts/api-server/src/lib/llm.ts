/**
 * Thin LLM adapter. Switch provider with one variable: AI_PROVIDER=gemini|anthropic|openai.
 * The key lives only in AI_API_KEY (Replit Secrets or a local, git-ignored .env). AI_MODEL is optional.
 * Uses plain fetch, so no provider SDK is needed.
 */
export type Provider = "gemini" | "anthropic" | "openai";
export interface LlmConfig { provider: Provider; apiKey: string; model: string }

const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: "gemini-2.5-flash",
  anthropic: "claude-haiku-5-5",
  openai: "gpt-4o-mini",
};

/** Returns null when no key is configured; the caller then falls back to the rules parser. */
export function llmConfigFromEnv(env: Record<string, string | undefined> = process.env): LlmConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  const provider = (env.AI_PROVIDER?.trim().toLowerCase() || "gemini") as Provider;
  if (!(provider in DEFAULT_MODEL)) throw new Error(`Unknown AI_PROVIDER "${provider}"`);
  return { provider, apiKey, model: env.AI_MODEL?.trim() || DEFAULT_MODEL[provider] };
}

/** Sends one system + user prompt, asks for JSON, returns the model's raw text. */
export async function callLlm(cfg: LlmConfig, system: string, user: string, signal: AbortSignal): Promise<string> {
  if (cfg.provider === "gemini") {
    const data = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
      { "x-goog-api-key": cfg.apiKey }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }, signal);
    return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  }
  if (cfg.provider === "anthropic") {
    const data = await post("https://api.anthropic.com/v1/messages",
      { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      { model: cfg.model, max_tokens: 1500, temperature: 0, system, messages: [{ role: "user", content: user }] }, signal);
    return data?.content?.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("") ?? "";
  }
  const data = await post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${cfg.apiKey}` }, {
    model: cfg.model, temperature: 0, response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  }, signal);
  return data?.choices?.[0]?.message?.content ?? "";
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  // Never include the request (it holds the key) in errors; status + a short body is enough to debug.
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<any>;
}
