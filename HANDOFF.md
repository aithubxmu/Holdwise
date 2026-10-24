# Holdwise handoff

## Current milestone and status
M4 done. The five-step journey works end to end: inbox → draft quotation →
staff review and fixes → owner approval when required → simulated WhatsApp
send with stock reservation, every step in the activity log.

Verified locally (branch `feat/m3-m4-quote-journey`) against a real Postgres
wire-protocol server: 19 rule unit tests, workspace typecheck, production
static export of the frontend, an API journey script (40 checks: roles,
approval routing, return with comment, stock reservation, locking after send,
self-pickup, unknown items, missing quantities, price override, discount),
and a click-through in the browser of the full flow plus mobile width.
**Not yet verified on the published Replit URL**: publish this revision, then
press Reset demo data as Owner (see below) and click through once.

## Publishing this revision on Replit
1. Pull the branch into the Repl (or merge it into `main` first).
2. The post-merge script runs `pnpm install` and `drizzle-kit push`. There are
   **no schema changes** in M3/M4, so the push is a no-op.
3. Publish.
4. Existing databases still hold the old "Demo Customer 01" rows (the seed
   never overwrites data). Act as **Owner** and press **Reset demo data** once to
   load the renamed customers and fixed zones.

## What works
- Schema (unchanged since M1): users, customers, delivery zones, products,
  messages, quotes, quote items, activity log.
- Seed in `lib/db/src/demo/` (`seedDemo`, `resetDemo`), shared by
  `scripts/src/seed.ts` and `POST /api/demo/reset` (owner only).
- API (`artifacts/api-server/src/`):
  - `lib/rules.ts` and `lib/extract.ts`: pure extraction, matching, pricing and
    routing. `priceStoredLines` reprices persisted (edited) lines.
  - `lib/quotes.ts`: draft, line edits, discount, actions, send.
  - `lib/activity.ts`: log reads with one-line summaries.
  - `routes/quotes.ts`: the endpoints in `lib/api-spec/openapi.yaml`.
- Web (`artifacts/quotelah/components/`): `app.tsx` shell with tabs
  (`?view=inbox|approvals|outbox|activity`, `?m=<messageId>`), `inbox.tsx`,
  `quote-panel.tsx` + `quote-line.tsx` editor, `approvals.tsx`, `outbox.tsx`,
  `activity.tsx`, `whatsapp-quote.tsx`.

## Rules worth knowing
- Money is integer sen in code, `numeric(12,2)` in the DB.
- `quote_items.qty` is NOT NULL, so a missing quantity is stored as 0 and
  flagged `missing_quantity`.
- `quote_items.flags` stores only review flags from extraction
  (`unknown_item`, `ambiguous_variant`, `low_confidence`). Picking a product
  clears them; `confirm` clears `low_confidence`. Stock and quantity flags are
  recomputed on every read.
- Price override = stored unit price differs from the current catalogue price.
- Any edit returns the quote to `drafted`/`needs_review`, withdrawing a pending
  approval request. Sent quotes are locked (409).
- Routing: flags block sending for everyone. Total > RM 500, discount > 5% or a
  price override → only the Owner can send (`approve`, or `send` as Owner).
  Viewer gets 403 on every write.
- Send reserves stock with `SELECT … FOR UPDATE` in the same transaction.
- Delivery zone: a zone named in the message wins, "pickup"/"ambil sendiri"
  means Self-pickup (RM 0), otherwise the customer's home zone.

## AI extraction (step 1 of the AI/dashboard/Orbyte round)
- Where AI is used: only `lib/ai-extract.ts` reads the message into
  `{items[{raw_text, product_guess, qty, unit, confidence}], delivery_area,
  requested_date, language, notes}`. The prompt lists product names and aliases,
  never prices. zod strips anything else (e.g. a "price" key).
- Where rules decide: `toDraftLines` in `rules.ts` matches `product_guess`
  (then the customer's words) against the catalogue; prices, discounts, stock and
  totals are unchanged rule code. AI confidence < 0.7 → `low_confidence`; no or
  non-whole quantity → `missing_quantity`; not in catalogue → `unknown_item`.
- Fallback to the rules parser: AI switched off in Settings, no key, API error,
  invalid JSON, or 8 s timeout. The reason is stored on the `quote_drafted` log
  entry and shown as the draft's "Parsed by" badge. The model call happens before
  the DB transaction.
- Provider in use (24 Oct, team decision): **Google Gemini** free tier
  (`AI_PROVIDER=gemini`, `AI_API_KEY`). Free-tier limits: ~5 requests/min for
  Flash, 15 for Flash Lite, plus a daily cap; over the limit Google returns 429
  and drafts fall back to rules. Run the eval (~20 calls) once, not before a demo.
- Optional, not used: **GLM-5.3 on the RunPod Public
  Endpoint**, OpenAI-compatible, `reasoning_effort: "low"`, `max_tokens` 1000.
  Picked automatically when `RUNPOD_API_KEY` is set (or `AI_PROVIDER=runpod`).
  The endpoint URL is in `lib/llm.ts` (override with `AI_BASE_URL`). Without a
  RunPod key, a Gemini `AI_API_KEY` still works, and with no key at all the rules
  parser runs. **Not yet run live with a RunPod key**: the RunPod request shape is
  unit-tested with a stubbed fetch, and the endpoint answers 401 without a token.
  23 Oct, browser check of the whole journey (draft → owner approval → send →
  credit → log → dashboard) passed twice: with AI (Gemini key) and with no key
  (rules fallback badge). 31 unit tests.
- Provider: `lib/llm.ts`, plain fetch. Env: `AI_PROVIDER` (gemini default |
  anthropic | openai), `AI_API_KEY` (secret), optional `AI_MODEL`
  (default gemini-3.5-flash). Locally put them in a git-ignored `.env` at the
  repo root; on Replit in Secrets. Tested live with a free Gemini key on 23 Oct.
- Settings (Owner, `?view=settings`): AI on/off, manual minutes per quote,
  simulated credit top-up. Stored as `setting_changed` log rows (no schema
  change); Reset demo data returns them to defaults.
- Eval: `data/eval-set.json` (15 seed + 5 held-out synthetic messages with
  expected SKU + qty). `pnpm --filter @workspace/api-server run eval` (no DB
  needed) or `?view=eval` (Owner, saved as `eval_run` log rows). Rules today:
  34/37 items (91.9%) overall, 100% on seed (it was tuned on them), 62.5% on
  held-out. First AI run (23 Oct, gemini-3.5-flash, before the variant rule
  below): 35/37 items (94.6%), 87.5% on held-out, quantities 100% correct,
  avg 5.9 s, but 5 of 20 calls fell back to rules (503 busy / 8 s timeout on the
  free tier), so those rows are rules results. Re-run before quoting numbers.
- A busy model (503/429) is retried once on `AI_FALLBACK_MODEL`
  (gemini-flash-lite-latest) inside the same 8 s budget.
- The extractor may not pick a variant the customer did not name: if the
  customer's words still fit several variants, the line stays
  `ambiguous_variant` for a human (AI had chosen Class B for "Class mana murah?").

## Dashboard (step 2, `?view=dashboard`, all roles)
`lib/dashboard.ts`, GET `/api/dashboard`. Everything is counted from the DB:
quotes sent (today in MYT / last 7 days / total), average response
(sent_at − message received_at), time saved = sent × (owner's manual minutes −
actual average) / 60 floored at 0, errors prevented = flags on the draft
(`quote_drafted` log) that are no longer open, AI vs rules share, owner
approvals. The manual minutes are an owner assumption from Settings and the page
says so. With no quotes the page shows an empty state.

## Orbyte module framing (step 3, all simulated)
- `components/orbyte-shell.tsx`: dark "Orbyte workspace · Ah Seng Hardware" bar
  with "Connected to Orbyte (simulated)" and the credit balance; on ≥1024 px a
  left module list where People, Hiring, Work, eSign, Connect are greyed out and
  Sales → Quotations (Holdwise) is active.
- `components/orbyte-page.tsx` (`?view=orbyte`, all roles): which hub services
  the module reads/writes and which of our tables plays each one, the reusable
  JSON API, and the credit model. States clearly there is no real Orbyte or
  WhatsApp connection.
- Credit wallet: `lib/wallet.ts`. Each sent quote writes a `credit_charged` log
  row (1 credit); balance = Settings top-up (default 100) − charges; GET
  `/api/wallet`. An empty wallet blocks sending with a 409 asking the owner to
  top up. Still no schema change.

## Broken or unfinished
- Live AI run and AI eval numbers need the Gemini key (see above).
- POST `/api/messages` webhook is not built.
- Role switching is a demo control, not authentication (by design).

## Next steps in order
1. Publish, reset demo data, click through the journey on the live URL.
2. M6 dashboard (quotes sent, average response time, flags caught, time saved
   with the assumption labelled).
3. M5 AI extraction with fallback, if time allows.

## Local operation
Required env names: `DATABASE_URL`, `PORT`. See README for commands.
`pnpm run typecheck`, `pnpm --filter @workspace/api-server run test`.
After changing `lib/api-spec/openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`.
On macOS the lockfile has only linux-x64 native binaries (Replit); a local
`next build` needs the darwin builds of lightningcss, @tailwindcss/oxide and
@next/swc on `NODE_PATH`. Do not change the lockfile for that.

## Decisions and why
- No schema changes in M3/M4 so publishing cannot break the live database.
- Single page with `?view=` instead of new Next routes: the static export is
  served with an `index.html` fallback, so extra routes would add risk.
- Approvals return with a mandatory comment so staff know what to change.

## RunPod proof of use (only if the team switches to RunPod)
RunPod is not used today, so no proof is needed. If you set `RUNPOD_API_KEY`,
the repo must contain
`submission/SDC2026_Holdwise_Runpod_POU.pdf`. Make it after a few drafts and one
AI eval have run with `RUNPOD_API_KEY` set:
1. Log in to runpod.io with the team leader's account (the one that redeemed the
   voucher on sdchack.my/portal).
2. Screenshot showing **your account** (name/email top right), the **endpoint
   URL** `https://api.runpod.ai/v2/b1dd8hy2hqo1nb/openai/v1` (or its endpoint
   page), and **usage/spend** (Billing or the endpoint's usage graph with a
   non-zero amount, ideally today's date).
3. Optional second screenshot: Holdwise draft showing "Parsed by AI (glm-5.3)".
4. Put the screenshots into one PDF named `SDC2026_Holdwise_Runpod_POU.pdf` in
   `submission/` and reference it from the Tech & Tools Declaration. Never show
   the API key itself on a screenshot.
