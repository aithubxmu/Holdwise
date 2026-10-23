"use client";

import { useGetWallet } from "@workspace/api-client-react";
import { ArrowDownToLine, ArrowUpFromLine, Coins, PlugZap } from "lucide-react";

// Which shared Orbyte hub services the module would use. In this demo each one is our own
// table or log, standing in for the hub; there is no live connection to Orbyte.
const SERVICES = [
  { service: "Clients", reads: "Customer name, type (walk-in / regular / contractor), phone, home zone", writes: "—", demo: "customers table" },
  { service: "Products & Inventory", reads: "Catalogue, aliases, prices, stock, reservations", writes: "Reserves stock when a quote is sent", demo: "products table" },
  { service: "Roles & permissions", reads: "Who is Owner, Staff, Viewer", writes: "—", demo: "users table + role switch" },
  { service: "Workflow & approvals", reads: "Approval rules (RM 500, 5% discount, price changes)", writes: "Approval requests, approvals, returns with comments", demo: "quote status + routing rules" },
  { service: "Audit trail", reads: "—", writes: "Every draft, edit, approval, send, setting and credit", demo: "activity_log" },
  { service: "Notifications", reads: "—", writes: "“Quote waiting for approval” to the owner", demo: "Approvals tab badge" },
  { service: "Credit wallet", reads: "Balance", writes: "1 credit per quote sent", demo: "credit_charged log rows" },
];
const ENDPOINTS = [
  ["GET", "/api/products", "Catalogue with available stock"],
  ["POST", "/api/messages/{id}/quote", "Draft a quotation from any inbound message (AI read, rules priced)"],
  ["PATCH", "/api/quotes/{id}/items/{itemId}", "Fix a line: product, quantity, price, confirm, remove"],
  ["POST", "/api/quotes/{id}/actions", "send · request_approval · approve · return"],
  ["GET", "/api/activity?quoteId=", "Audit trail for one quote"],
  ["GET", "/api/wallet", "Credit balance and usage"],
];

/** How QuoteLah would plug into Orbyte as the missing Sales → Quotations module. */
export function OrbytePage() {
  const wallet = useGetWallet();
  return (
    <main className="mx-auto w-full max-w-[1000px] flex-1 space-y-4 px-4 py-5 md:px-6" data-testid="view-orbyte">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><PlugZap className="h-6 w-6 text-teal" /> How QuoteLah connects to Orbyte</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Orbyte is a business hub for SMEs: one workspace and one sign-in, with shared clients, products, roles, approvals and audit trail,
          and one credit wallet charged per use. It has People, Hiring, Work, eSign and Connect today, but no sales module.
          QuoteLah is that module: Sales → Quotations.
        </p>
        <p className="mt-2 rounded-xl border border-dashed border-brick/40 bg-brick-wash/50 px-3 py-2 text-[13px] text-brick">
          Simulated. We have no access to the real Orbyte platform or WhatsApp. Each hub service below is played by our own table or log so the module can be shown working.
        </p>
      </div>

      <section className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[640px] text-[13px]" data-testid="table-orbyte-services">
          <thead className="bg-paper text-left text-[11px] uppercase tracking-wider text-ink-soft">
            <tr><th className="px-3 py-2">Hub service</th><th><ArrowDownToLine className="mr-1 inline h-3 w-3" />Module reads</th><th><ArrowUpFromLine className="mr-1 inline h-3 w-3" />Module writes</th><th>In this demo</th></tr>
          </thead>
          <tbody>
            {SERVICES.map((s) => (
              <tr key={s.service} className="border-t align-top">
                <td className="px-3 py-2 font-semibold">{s.service}</td><td className="py-2 pr-3">{s.reads}</td><td className="py-2 pr-3">{s.writes}</td>
                <td className="py-2 pr-3 font-mono text-[11px] text-ink-soft">{s.demo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Reusable connector API</h2>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            The quotation engine is a plain JSON API (OpenAPI spec in <span className="font-mono">lib/api-spec/openapi.yaml</span>). Any channel or module
            (a WhatsApp Business connector, email, a POS, another SME's catalogue) can hand it a message and get back a priced, approval-routed quote.
          </p>
          <ul className="mt-3 space-y-1.5">
            {ENDPOINTS.map(([m, path, what]) => (
              <li key={m + path} className="text-[12px]"><span className="mr-1.5 rounded bg-ink px-1 font-mono text-[10px] text-tape">{m}</span><span className="font-mono">{path}</span><div className="text-ink-soft">{what}</div></li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border bg-card p-4" data-testid="panel-wallet">
          <h2 className="flex items-center gap-1.5 font-semibold"><Coins className="h-4 w-4 text-tape" /> Credit wallet (simulated)</h2>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            Orbyte charges when business happens, not per seat. QuoteLah uses {wallet.data?.perQuote ?? 1} credit per quotation actually sent: drafts, edits and returns are free.
          </p>
          {wallet.data && (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[["Top-up", wallet.data.startingCredits], ["Used", wallet.data.used], ["Balance", wallet.data.balance]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-paper py-2"><dt className="text-[10px] uppercase tracking-wider text-ink-soft">{k}</dt><dd className="font-display text-xl font-bold tabular-nums">{v}</dd></div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-[12px] text-ink-soft">Every charge is written to the activity log. The owner sets the top-up in Settings; with no credits left, sending is blocked.</p>
        </section>
      </div>
    </main>
  );
}
