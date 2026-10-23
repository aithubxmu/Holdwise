"use client";

import { useListQuotes } from "@workspace/api-client-react";
import { fullTime } from "@/lib/format";
import { Empty, ErrorBlock } from "./shared";
import { WhatsAppQuote } from "./whatsapp-quote";

/** Step 5 outcome: quotations that went out, as the customer saw them (simulated WhatsApp). */
export function Outbox({ onOpen }: { onOpen: (messageId: number) => void }) {
  const quotes = useListQuotes({ status: "sent" });
  return (
    <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-5 md:px-6" data-testid="view-outbox">
      <h1 className="font-display text-2xl font-bold">Outbox</h1>
      <p className="mt-1 text-sm text-ink-soft">Sent quotations. Stock for each one is reserved. Sending is simulated: nothing leaves this demo.</p>
      <div className="mt-4 space-y-4">
        {quotes.isLoading ? (
          <div className="skel h-40 rounded-2xl" />
        ) : quotes.isError ? (
          <div className="rounded-2xl border bg-card"><ErrorBlock onRetry={() => quotes.refetch()} what="the outbox" /></div>
        ) : !quotes.data?.length ? (
          <div className="rounded-2xl border bg-card"><Empty title="Nothing sent yet" body="Approved quotations appear here as the customer's WhatsApp would show them." /></div>
        ) : (
          quotes.data.map((q) => (
            <section key={q.id} className="rounded-2xl border bg-[linear-gradient(hsl(var(--teal-wash)/.6),hsl(var(--paper)))] p-4" data-testid={`outbox-${q.id}`}>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
                <b>To {q.customerName}</b>
                <span className="font-mono text-ink-soft">{q.customerPhone}</span>
                <span className="text-ink-soft">· sent {q.sentAt ? fullTime(q.sentAt) : ""}</span>
                <button onClick={() => onOpen(q.messageId)} className="ml-auto font-semibold text-teal hover:underline">Open quote #{q.id}</button>
              </div>
              <WhatsAppQuote q={q} />
            </section>
          ))
        )}
      </div>
    </main>
  );
}
