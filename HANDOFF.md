# QuoteLah handoff

## Current milestone and status
M1 — complete. API and Next.js workflows run; development preview renders seeded
inbox data. Backend, schema and seed TypeScript checks pass; frontend typecheck
passed during implementation. No end-to-end browser test suite was run.
The user now requests a production repair and republish; this supersedes the
initial no-deployment instruction. Publishing must be initiated by the user.

## What works
- PostgreSQL schema for users, customers, delivery zones, products, messages,
  quotes, quote items, and activity log.
- Transactional, repeat-safe seed: 40 products with aliases, three low-stock
  products, 10 invented customers, six zones, three simulated users, 15 enquiries.
- Seeded receipt events in activity log; no invented sent/approved states.
- Read APIs for inbox and demo metadata, with generated response validation.
- Next.js inbox and simulated role selection.
- Full Apache 2.0 license and ignore rules for secrets/dependencies/build output.

## Broken or unfinished
M2–M7 functionality is intentionally not implemented yet. No quotation
generation, extraction, line editing, approvals, outbox, stock reservation,
dashboard, product settings, reset button, or incoming POST webhook.
Role switching is a client-side demo choice, not authentication.
The screenshot browser reported a development HMR WebSocket proxy warning;
the page and data rendered successfully.

## Production serving repair
Production logs identified the root cause:
`static artifact publicDir does not exist ... artifacts/quotelah/dist/public`
followed by `static handler not found for matched path`.
The frontend had been converted to Next.js, but the artifact retained the Vite
static directory. The API was unaffected.

Fixed by enabling Next.js static export (`output: "export"`), setting the
artifact's production publicDir to `artifacts/quotelah/out` through validated
manifest replacement, and adding an explicit `/inbox` page. The existing
`/*` → `/index.html` fallback is retained. Deployment build command remains
`pnpm --filter @workspace/quotelah run build`; frontend needs no Node run command
because production serves the exported files. The separate API service keeps
its existing build/run commands. Removed the obsolete `next start` serve script,
which is not compatible with static export.

Added GET `/api/health` returning `{"ok":true}` without changing `/api/healthz`.
Production build succeeds and exports `/` and `/inbox`. User must publish this
revision before live checks can pass. Do not claim that preview verification
means the published deployment has been repaired.

## Next steps in order
1. M2: pure matching/pricing/stock/routing rules and rule extractor with unit tests.
2. M3: persistent editable quote drafts, resolvable flags and before/after logs.
3. M4: owner approvals, simulated outbox and atomic stock reservation.
4. M5: strict AI JSON extraction, Zod validation, eight-second timeout/fallback.
5. M6: dashboard, settings, owner-only reset, POST /api/messages.
6. M7: polish and checks only. Skip deployment unless the user changes their instruction.

## Local operation
See README for commands. Required environment names: DATABASE_URL and PORT.
No AI credentials required. Use pnpm, `@workspace/db` push for development schema,
`@workspace/scripts` seed for non-destructive initial data. API and frontend
workflows must both run. Root typecheck: `pnpm run typecheck`.

## Data model notes
Money uses exact PostgreSQL numeric columns; API business calculations must use
integer cents in later milestones. Stock and reserved quantities are constrained
nonnegative and reserved cannot exceed stock. Messages/quotes use a shared status
enum. Quote items allow null product, unit price and line total for unknown items.
All timestamps are timezone-aware. No quote or item rows exist before M2/M3.
The seed uses an advisory transaction lock and never wipes existing work.

## Decisions and why
- Next.js App Router frontend with existing shared Express API: satisfies the
  requested frontend stack while preserving the provided API routing and codegen.
- Only M1 in this increment, following the brief's "Start with M1 now".
- All initial messages are new, so the app does not imply unimplemented approvals
  or sends have happened.
- Seeded identities are fictional; the role selector is not real authentication.
- Development preview only because the user explicitly excluded deployments.
