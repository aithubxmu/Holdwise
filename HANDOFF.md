# QuoteLah handoff

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
- Provider: `lib/llm.ts`, plain fetch. Env: `AI_PROVIDER` (gemini default |
  anthropic | openai), `AI_API_KEY` (secret), optional `AI_MODEL`
  (default gemini-2.5-flash). Locally put them in a git-ignored `.env` at the
  repo root; on Replit in Secrets. **No key has been tested live yet**: the AI
  path is covered by unit tests with a stubbed model only.
- Settings (Owner, `?view=settings`): AI on/off, manual minutes per quote,
  simulated credit top-up. Stored as `setting_changed` log rows (no schema
  change); Reset demo data returns them to defaults.
- Eval: `data/eval-set.json` (15 seed + 5 held-out synthetic messages with
  expected SKU + qty). `pnpm --filter @workspace/api-server run eval` (no DB
  needed) or `?view=eval` (Owner, saved as `eval_run` log rows). Rules today:
  34/37 items (91.9%) overall, 100% on seed (it was tuned on them), 62.5% on
  held-out. Run the AI eval once a key is set and use those numbers in the PRD.

## Broken or unfinished
- Live AI run and AI eval numbers need the Gemini key (see above).
- Dashboard and Orbyte shell are the next two steps; POST `/api/messages`
  webhook is not built.
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
