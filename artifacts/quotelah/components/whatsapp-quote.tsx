"use client";

import type { QuoteDetail } from "@workspace/api-client-react";
import { CheckCheck } from "lucide-react";
import { clock, rm } from "@/lib/format";

/** The outgoing quotation as the customer would see it in WhatsApp (simulated, nothing is sent). */
export function WhatsAppQuote({ q, shopName = "Ah Seng Hardware" }: { q: QuoteDetail; shopName?: string }) {
  const priced = q.lines.filter((l) => l.lineTotalRm !== null);
  const validUntil = new Date(q.validUntil).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="ml-auto max-w-[420px] rounded-2xl rounded-tr-none bg-[#dcf8c6] px-4 py-3 text-[14px] leading-relaxed text-[#111b21] shadow-[0_1px_0_hsl(var(--line))]" data-testid={`bubble-quote-${q.id}`}>
      <p className="font-bold">{shopName}: Quotation #{q.id}</p>
      <p className="mt-1">Hi {q.customerName.replace(/\s*\(demo\)$/, "")}, here is your quotation:</p>
      <ul className="mt-1.5 space-y-0.5">
        {priced.map((l) => (
          <li key={l.id}>
            • {l.qty} × {l.productName} @ {rm(l.unitPriceRm)} = <b>{rm(l.lineTotalRm)}</b>
          </li>
        ))}
      </ul>
      <div className="mt-2 space-y-0.5 border-t border-black/10 pt-2 text-[13px]">
        <p>Subtotal {rm(q.subtotalRm)}</p>
        {q.discountPct > 0 && <p>Discount {q.discountPct}% −{rm(q.discountRm)}</p>}
        <p>{q.deliveryZone === "Self-pickup" ? "Self-pickup at shop RM 0.00" : `Delivery to ${q.deliveryZone} ${rm(q.deliveryRm)}`}</p>
        <p className="text-[15px] font-bold">Total {rm(q.totalRm)}</p>
      </div>
      <p className="mt-2 text-[13px]">Valid until {validUntil}. Reply YES to confirm and we will prepare your order.</p>
      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-black/45">
        {q.sentAt ? clock(q.sentAt) : "preview"}
        {q.sentAt && <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />}
      </div>
    </div>
  );
}
