# Holdwise

A synthetic hardware-shop quotation demo for SDC Hackathon 2026, Domain 2:
Orbyte Smart SME Challenge (Alpha Red Solutions).

Holdwise turns messy Malay, English and Manglish WhatsApp enquiries into
human-reviewed quotations. **Current release: M4. The full five-step journey works end to end.**

## The five-step journey
1. Receive a simulated customer enquiry.
2. Connect catalog, prices, stock, customer type and delivery zone.
3. Extract items with AI or rules; calculate all prices and routing deterministically.
4. Staff review; Owner approval for consequential quotations.
5. Send to a simulated outbox, reserve stock, and log every action.

What you can do in the app:
- **Inbox**: pick an enquiry and press **Draft quotation**. Lines the rules could not
  settle are flagged (not in catalogue, which variant, unsure match, no quantity,
  not enough stock) with the fix next to them.
- **Review**: pick a variant or product, change quantity or price, confirm a match,
  remove a line, change the discount. Totals reprice instantly in integer sen.
- **Approval routing**: staff send within limits. Over RM 500, a discount above 5%
  or a changed unit price needs the Owner, who approves & sends or returns the quote
  with a comment. Viewer is read only. The API enforces all of this, not just the UI.
- **Send**: stock is reserved in a row-locked transaction, the quote is locked and
  shown as a simulated WhatsApp message in the **Outbox**.
- **Activity log**: every draft, edit, approval and send with actor and before/after.
- **Reset demo data** (Owner): wipes quotes and restores the seeded demo.
- **Dashboard**: quotes sent, response time vs the owner's manual estimate, hours
  saved, errors prevented, AI vs rules share. Counted from the database only.
- **Orbyte module (simulated)**: Holdwise is shown as the missing Sales →
  Quotations module inside an Orbyte workspace, with a simulated credit wallet
  (1 credit per quote sent). There is no real Orbyte or WhatsApp integration.

The POST webhook for inbound messages is not built yet.

## Safety and demo scope
- Every record is invented, including the fictional shop "Ah Seng Hardware, Kajang".
- Fake phone numbers use `+60 12-000 0001` style.
- No WhatsApp integration, payments, tax filing, real authentication, or real customers.
- The Owner / Staff / Viewer selector is role simulation, not an access-control boundary.
- Prices are final; tax is out of scope.

## Run
Use Node.js 24 and pnpm. Required environment variable names: `DATABASE_URL`,
`PORT` (per service). Do not commit values.

```sh
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
# Run in separate terminals locally:
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=3000 pnpm --filter @workspace/quotelah run dev
```

In Replit, run the existing web app and API Server workflows. The shared proxy
serves Next.js at `/` and Express at `/api`. Outside Replit, provide an equivalent
reverse proxy routing `/api` to port 5000 and all other paths to port 3000.

Seed runs are transactional and non-destructive: if demo users already exist,
they preserve the existing data. To start over, act as Owner and press
**Reset demo data** (POST `/api/demo/reset`), which wipes and reseeds in one transaction.

## AI versus rules
AI does one job: reading the messy Malay / English / Manglish message into items,
quantities and a delivery area (`artifacts/api-server/src/lib/ai-extract.ts`).
The model sees product names and aliases, never prices, and must return strict
JSON validated with zod. Catalogue matching, prices, discounts, stock, totals and
approval routing are deterministic rules (`rules.ts`). If AI is off, has no key,
errors, returns invalid JSON or takes over 8 s, the rules parser is used and the
draft says why.

Configure with environment variables (local `.env` at the repo root, which git
ignores, or Replit Secrets). Main model: **GLM-5.3 on RunPod**, set `RUNPOD_API_KEY`.
Alternatives: `AI_PROVIDER` = `gemini` | `anthropic` | `openai` with `AI_API_KEY`;
optional `AI_MODEL`. With no key at all, everything runs on the rules parser.

Measure it: `pnpm --filter @workspace/api-server run eval`, or the **AI eval**
tab as Owner. Results are on our small synthetic test set (`data/eval-set.json`).

## How We Use RunPod
- **Workload:** model inference. The AI step that reads each WhatsApp message
  into items runs on **GLM-5.3** through the sponsor's RunPod Public Endpoint
  (`https://api.runpod.ai/v2/b1dd8hy2hqo1nb/openai/v1`, OpenAI-compatible chat
  completions), called from `artifacts/api-server/src/lib/llm.ts`.
- **Cost control:** `reasoning_effort: "low"` and `max_tokens: 1000` per call;
  one call per drafted quote (the AI eval makes ~20). The team credit is US$25.
- **Secrets:** `RUNPOD_API_KEY` lives only in Replit Secrets / a git-ignored
  `.env`, never in code or commits.
- **Fallback:** no key, an error, invalid JSON or more than 8 s → the rules parser,
  and the draft says so ("Parsed by rules (fallback): reason").
- Proof of use: `submission/SDC2026_Holdwise_Runpod_POU.pdf`.

## How We Use Replit
- Development started in Replit (Replit Agent), and the app is hosted with Replit
  Deployments at the live URL below: a Next.js static site plus the Express API on
  Replit's PostgreSQL. Secrets are stored in Replit Secrets.

## Technology
Next.js App Router, TypeScript, Tailwind CSS, Express API, PostgreSQL, Drizzle ORM,
Zod, and generated React Query API clients. Built with Replit Agent and Claude Code
(declared in the Tech & Tools Declaration).
See `HANDOFF.md` for implementation status and next steps.

## Live URL
https://quote-lah-hardware-quotation-mvp.replit.app

Next.js exports static HTML
and assets into `artifacts/quotelah/out`; the artifact serves that directory with
an index.html fallback. API routes continue on the separate Express service.

## Rule tests
```sh
pnpm --filter @workspace/api-server run test
```
Tests cover aliases, variant ambiguity, unknown products, missing/invalid
quantities, available stock (including repeated lines), discounts, rounding,
delivery zones, approval boundaries, three-day validity, repricing of edited
lines, price overrides, and punctuation/chatter in real-looking messages.

## License
Apache License 2.0. See the full text in `LICENSE`.
