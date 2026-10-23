# Holdwise

Synthetic Malaysian hardware quotation demo. See README.md and HANDOFF.md for scope and progress.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Keep the Next.js frontend statically exportable and server operations in the
  shared Express API. This preserves the artifact's static production hosting;
  introducing server actions or request-time rendering requires changing the
  serving model and validating it, not just changing the Next.js source.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

The user now requests publishing to repair production (supersedes the initial no-deploy instruction). Publishing is user-initiated. Work in runnable milestones.
All data must be synthetic, and role switching is simulated rather than real authentication.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
