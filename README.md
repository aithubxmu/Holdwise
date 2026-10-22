# QuoteLah

A synthetic hardware-shop quotation demo for SDC Hackathon 2026, Domain 2:
Orbyte Smart SME Challenge (Alpha Red Solutions).

QuoteLah turns messy Malay, English and Manglish WhatsApp enquiries into
human-reviewed quotations. **Current release: M1, inbox foundation only.**

## Planned five-step journey
1. Receive a simulated customer enquiry.
2. Connect catalog, prices, stock, customer type and delivery zone.
3. Extract items with AI or rules; calculate all prices and routing deterministically.
4. Staff review; Owner approval for consequential quotations.
5. Send to a simulated outbox, reserve stock, and log every action.

Only the seeded inbox, customer context, search/filter/read, and simulated role
selection are implemented in M1. Quotation calculation, approval, sending,
dashboard, settings and incoming webhook follow in M2–M6.

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

In Replit, run the existing QuoteLah and API Server workflows. The shared proxy
serves Next.js at `/` and Express at `/api`. Outside Replit, provide an equivalent
reverse proxy routing `/api` to port 5000 and all other paths to port 3000.

Seed runs are transactional and non-destructive: if demo users already exist,
they preserve the existing data. The owner-only **Reset demo data** interface
is planned for M6; there is no destructive reset command in M1.

## AI versus rules
M1 makes no AI calls and needs no AI key. In M2, rule-based extraction and pure
business rules will be added. M5 will add schema-validated AI extraction with an
eight-second timeout and automatic rules fallback. AI will never set prices,
invent catalog products, decide discounts, or approve quotations.

## Technology
Next.js App Router, TypeScript, Tailwind CSS, Express API, PostgreSQL, Drizzle ORM,
Zod, and generated React Query API clients. Built with Replit Agent.
See `HANDOFF.md` for implementation status and next steps.

## Live URL
**Not deployed, by explicit user request.** Use development preview only.

## License
Apache License 2.0. See the full text in `LICENSE`.
