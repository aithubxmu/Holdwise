"use client";

import { useListQuotes } from "@workspace/api-client-react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { relTime, rm } from "@/lib/format";
import type { Actor } from "@/lib/actor";
import { Avatar, Empty, ErrorBlock } from "./shared";

/** The owner's queue: quotes that exceed staff limits and wait for a decision. */
export function Approvals({ actor, onOpen }: { actor: Actor; onOpen: (messageId: number) => void }) {
  const quotes = useListQuotes({ status: "awaiting_approval" });
  return (
    <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-5 md:px-6" data-testid="view-approvals">
      <h1 className="font-display text-2xl font-bold">Waiting for owner approval</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Staff send routine quotes themselves. Anything over RM 500, with a discount above 5% or a changed price comes here first.
        {actor.role !== "owner" && " Switch to Owner to approve."}
      </p>
      <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
        {quotes.isLoading ? (
          <div className="skel m-4 h-24" />
        ) : quotes.isError ? (
          <ErrorBlock onRetry={() => quotes.refetch()} what="approvals" />
        ) : !quotes.data?.length ? (
          <Empty title="Nothing to approve" body="When staff ask for approval, the quote shows up here with the reasons." />
        ) : (
          <ul>
            {quotes.data.map((q) => (
              <li key={q.id} className="border-b last:border-b-0">
                <button onClick={() => onOpen(q.messageId)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-paper" data-testid={`row-approval-${q.id}`}>
                  <Avatar name={q.customerName} type={q.customerType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">Quote #{q.id} · {q.customerName}</span>
                      <span className="ml-auto shrink-0 font-display text-lg font-bold tabular-nums">{rm(q.totalRm)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {q.approvalReasons.map((r) => (
                        <span key={r} className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">
                          <ShieldCheck className="h-3 w-3" /> {r}
                        </span>
                      ))}
                      <span className="text-[11px] text-ink-soft">{q.lines.length} lines · received {relTime(q.receivedAt)}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
