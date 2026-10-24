import { test } from "node:test";
import assert from "node:assert/strict";
import { callLlm, llmConfigFromEnv, MAX_OUTPUT_TOKENS } from "./llm.ts";
import { parseAiResponse } from "./ai-extract.ts";

test("provider is chosen from environment variables only", () => {
  assert.equal(llmConfigFromEnv({}), null, "no key: rules fallback");
  const runpod = llmConfigFromEnv({ RUNPOD_API_KEY: "rp-test" });
  assert.equal(runpod?.provider, "runpod");
  assert.equal(runpod?.model, "glm-5.3");
  assert.equal(runpod?.baseUrl, "https://api.runpod.ai/v2/b1dd8hy2hqo1nb/openai/v1");
  assert.equal(llmConfigFromEnv({ AI_API_KEY: "g-test" })?.provider, "gemini");
  assert.equal(llmConfigFromEnv({ AI_PROVIDER: "gemini", AI_API_KEY: "g-test", RUNPOD_API_KEY: "rp-test" })?.provider, "gemini", "AI_PROVIDER wins");
  assert.equal(llmConfigFromEnv({ AI_PROVIDER: "runpod", AI_API_KEY: "g-test" }), null, "runpod needs RUNPOD_API_KEY");
  assert.throws(() => llmConfigFromEnv({ AI_PROVIDER: "nope", AI_API_KEY: "x" }));
});

test("RunPod call is OpenAI-compatible with low reasoning effort and capped tokens", async () => {
  const realFetch = globalThis.fetch;
  let seen: { url: string; headers: Record<string, string>; body: any } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const out = await callLlm(llmConfigFromEnv({ RUNPOD_API_KEY: "rp-test" })!, "sys", "user", new AbortController().signal);
    assert.equal(out, "{\"ok\":true}");
    assert.equal(seen!.url, "https://api.runpod.ai/v2/b1dd8hy2hqo1nb/openai/v1/chat/completions");
    assert.equal(seen!.headers.authorization, "Bearer rp-test");
    assert.equal(seen!.body.model, "glm-5.3");
    assert.equal(seen!.body.reasoning_effort, "low");
    assert.equal(seen!.body.max_tokens, MAX_OUTPUT_TOKENS);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a reasoning preamble around the JSON is tolerated, garbage is not", () => {
  const body = { items: [], delivery_area: null, requested_date: null, language: "en", notes: null };
  assert.equal(parseAiResponse(`<think>reading the message…</think>\n${JSON.stringify(body)}`).language, "en");
  assert.throws(() => parseAiResponse("<think>no json here</think>"));
});
