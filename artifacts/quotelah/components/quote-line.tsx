"use client";

import { useEffect, useState } from "react";
import type { CatalogItem, QuoteLine as Line, QuoteItemUpdate } from "@workspace/api-client-react";
import { ArrowRight, Check, Trash2, TriangleAlert } from "lucide-react";
import { FLAG_META, rm } from "@/lib/format";

type Change = Omit<QuoteItemUpdate, "actorUserId">;

/** One quote line: the customer's words, the matched product, flags with their fixes, and inline edits. */
export function QuoteLine({
  line,
  catalog,
  editable,
  busy,
  onChange,
}: {
  line: Line;
  catalog: CatalogItem[];
  editable: boolean;
  busy: boolean;
  onChange: (change: Change) => void;
}) {
  const flagged = line.flags.length > 0;
  const overridden = line.unitPriceRm !== null && line.catalogPriceRm !== null && line.unitPriceRm !== line.catalogPriceRm;
  const suggested = new Set(line.options.map((o) => o.id));
  const others = catalog.filter((p) => !suggested.has(p.id));

  return (
    <li className={`rounded-xl border p-3 ${flagged ? "border-brick/40 bg-brick-wash/40" : "bg-card"}`} data-testid={`line-${line.id}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-ink-soft" title="What the customer wrote">
          “{line.rawText}”
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-ink-soft" />
        <span className={`font-semibold ${line.productName ? "" : "text-brick"}`} data-testid={`text-line-product-${line.id}`}>
          {line.productName ?? "No product yet"}
        </span>
        <span className="ml-auto font-display text-[15px] font-bold tabular-nums" data-testid={`text-line-total-${line.id}`}>
          {rm(line.lineTotalRm)}
        </span>
      </div>

      <div className="mt-1 font-mono text-[10px] text-ink-soft" data-testid={`text-confidence-${line.id}`}>
        match confidence {Math.round(line.confidence * 100)}%
      </div>
      {flagged && (
        <ul className="mt-2 space-y-1">
          {line.flags.map((f) => (
            <li key={f} className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="flex items-center gap-1 rounded-md bg-brick px-1.5 py-0.5 text-[11px] font-semibold text-white">
                <TriangleAlert className="h-3 w-3" />
                {FLAG_META[f].label}
              </span>
              <span className="text-ink-soft">{why(f, line)} {FLAG_META[f].hint}.</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_90px_110px_auto]">
        <label className="col-span-2 sm:col-span-1">
          <span className="sr-only">Product</span>
          <select
            value={line.productId ?? ""}
            disabled={!editable || busy}
            onChange={(e) => e.target.value && onChange({ productId: Number(e.target.value) })}
            className="w-full rounded-lg border bg-paper px-2 py-1.5 text-[13px] outline-none focus:border-teal disabled:opacity-70"
            data-testid={`select-product-${line.id}`}
          >
            <option value="">Pick a product…</option>
            {line.options.length > 0 && (
              <optgroup label="Matches for this line">
                {line.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {rm(o.priceRm)} · {o.available} in stock
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="All products">
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {rm(p.priceRm)}/{p.unit} · {p.available} in stock
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <NumberField
          label="Qty"
          value={String(line.qty || "")}
          placeholder="Qty"
          disabled={!editable || busy}
          testId={`input-qty-${line.id}`}
          onCommit={(v) => {
            const qty = Number(v);
            if (Number.isInteger(qty) && qty >= 0 && qty !== line.qty) onChange({ qty });
          }}
        />
        <NumberField
          label="Unit price"
          prefix="RM"
          value={line.unitPriceRm ?? ""}
          placeholder="Price"
          disabled={!editable || busy || line.productId === null}
          testId={`input-price-${line.id}`}
          onCommit={(v) => {
            if (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) !== Number(line.unitPriceRm)) onChange({ unitPriceRm: v });
          }}
        />
        <div className="flex items-center justify-end gap-1">
          {editable && line.flags.includes("low_confidence") && (
            <button
              onClick={() => onChange({ confirm: true })}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-teal px-2 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-60"
              data-testid={`button-confirm-${line.id}`}
            >
              <Check className="h-3.5 w-3.5" /> Confirm
            </button>
          )}
          {editable && (
            <button
              onClick={() => onChange({ remove: true })}
              disabled={busy}
              aria-label="Remove line"
              className="grid h-8 w-8 place-items-center rounded-lg border text-ink-soft transition hover:border-brick hover:text-brick active:scale-95 disabled:opacity-60"
              data-testid={`button-remove-${line.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {overridden && (
        <p className="mt-1.5 text-[11px] font-medium text-brick" data-testid={`text-override-${line.id}`}>
          Price changed from catalogue {rm(line.catalogPriceRm)}. Owner approval needed
        </p>
      )}
    </li>
  );
}

/** Plain-words reason for a flag, built from the line itself. */
function why(flag: Line["flags"][number], line: Line) {
  switch (flag) {
    case "unknown_item": return `“${line.rawText}” doesn't match anything the shop sells.`;
    case "ambiguous_variant": return `${line.options.length || "Several"} products fit “${line.rawText}”${line.options.length ? `: ${line.options.map((o) => o.name).join(" or ")}` : ""}.`;
    case "low_confidence": return `Matched ${line.productName ?? "a product"}, but only ${Math.round(line.confidence * 100)}% sure.`;
    case "missing_quantity": return "The customer didn't say how many.";
    case "invalid_quantity": return "The quantity isn't a whole number above zero.";
    case "insufficient_stock": return `Only ${line.available ?? 0} available, ${line.qty} asked for.`;
  }
}

/** Text input that commits on blur or Enter, and resets when the server value changes. */
function NumberField({
  label,
  value,
  placeholder,
  disabled,
  prefix,
  testId,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  prefix?: string;
  testId: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="flex items-center gap-1 rounded-lg border bg-paper px-2 focus-within:border-teal">
      <span className="sr-only">{label}</span>
      {prefix && <span className="text-[11px] text-ink-soft">{prefix}</span>}
      <input
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.trim())}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-full bg-transparent py-1.5 text-[13px] tabular-nums outline-none disabled:opacity-70"
        data-testid={testId}
      />
    </label>
  );
}
