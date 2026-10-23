"use client";

import type { ReactNode } from "react";
import { useGetWallet } from "@workspace/api-client-react";
import { Briefcase, Coins, FileSignature, Link2, PlugZap, Receipt, Users } from "lucide-react";

// Orbyte's existing modules (from Alpha Red's introduction deck). Shown greyed out: they are not part of this demo.
const OTHER_MODULES = [
  { label: "People", note: "Leave · Claims · OT", icon: Users },
  { label: "Hiring", note: "AI screening", icon: Briefcase },
  { label: "Work", note: "Projects · Tasks", icon: Briefcase },
  { label: "eSign", note: "Documenso", icon: FileSignature },
  { label: "Connect", note: "Partner services", icon: Link2 },
];

/**
 * Simulated Orbyte workspace around Holdwise. There is no real Orbyte or WhatsApp integration;
 * the bar and sidebar only show where the module would live in the hub.
 */
export function OrbyteShell({ shopName, onConnect, children }: { shopName: string; onConnect: () => void; children: ReactNode }) {
  const wallet = useGetWallet();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-1 bg-ink px-4 py-1.5 text-[12px] text-paper md:px-6" data-testid="bar-orbyte">
        <span className="flex items-center gap-1.5 font-semibold"><span className="grid h-5 w-5 place-items-center rounded-md bg-tape font-display text-[11px] font-extrabold text-ink">O</span>Orbyte workspace</span>
        <span className="text-paper/60">·</span>
        <span className="truncate">{shopName}</span>
        <button onClick={onConnect} className="flex items-center gap-1 rounded-full border border-paper/25 px-2 py-0.5 text-[11px] hover:border-tape" data-testid="badge-orbyte">
          <PlugZap className="h-3 w-3 text-tape" /> Connected to Orbyte (simulated)
        </button>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-paper/10 px-2 py-0.5" title="Simulated Orbyte Credit wallet. Each quote sent uses 1 credit." data-testid="text-credits">
          <Coins className="h-3.5 w-3.5 text-tape" />
          Credits <b className="tabular-nums">{wallet.data ? wallet.data.balance : "…"}</b>
        </span>
      </div>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r bg-card/70 px-3 py-4 lg:block" aria-label="Orbyte modules">
          <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">Orbyte modules</div>
          <ul className="mt-2 space-y-0.5">
            {OTHER_MODULES.map(({ label, note, icon: Icon }) => (
              <li key={label} aria-disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-soft/50" title="Not part of this demo">
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}<span className="block text-[10px]">{note}</span></span>
              </li>
            ))}
          </ul>
          <div className="mt-4 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">Sales</div>
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-teal-deep px-2 py-1.5 text-[13px] font-semibold text-white" aria-current="page">
            <Receipt className="h-4 w-4 text-tape" />
            <span className="flex-1">Quotations<span className="block text-[10px] font-normal text-white/70">Holdwise · new module</span></span>
          </div>
          <p className="mt-6 px-2 text-[11px] leading-snug text-ink-soft">
            Orbyte has no sales module today. Holdwise adds Sales → Quotations on top of the hub's shared clients, products, roles, approvals and audit trail.
          </p>
        </aside>
        <div className="relative min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
