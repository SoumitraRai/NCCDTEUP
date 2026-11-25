"use client";
import { HEADS, reference, type Head } from "@/modules/camps/budget-rules";
import { Field, inputClass } from "./ui";
import { inr } from "./format";
import { useT } from "./i18n-client";
type Line = { amount: string; quantity: string };
export type BudgetDraft = { amount: string; cadets: string; anos: string; staff: string; note: string; showBreakup: boolean; lines: Record<Head, Line> };
const emptyLines = () => Object.fromEntries(HEADS.map((h) => [h.head, { amount: "", quantity: "" }])) as Record<Head, Line>;
export const newDraft = (cadets: number | null, from?: { demandedPaise: string; cadets: number; anos: number; staff: number; note: string; lines: Partial<Record<Head, { quantity: number | null; amountPaise: string }>> }): BudgetDraft => {
  const rupees = (p: string) => (BigInt(p) % 100n ? (Number(p) / 100).toFixed(2) : String(BigInt(p) / 100n));
  const lines = emptyLines();
  for (const [head, l] of Object.entries(from?.lines ?? {})) if (l) lines[head as Head] = { amount: rupees(l.amountPaise), quantity: l.quantity === null ? "" : String(l.quantity) };
  return {
    amount: from ? rupees(from.demandedPaise) : "",
    cadets: String(from?.cadets ?? cadets ?? ""),
    anos: String(from?.anos ?? ""),
    staff: String(from?.staff ?? ""),
    note: from?.note ?? "",
    showBreakup: !!from && Object.keys(from.lines).length > 0,
    lines,
  };
};
// What the server takes: heads only when the breakup is shown and filled.
export const draftPayload = (d: BudgetDraft) => ({
  amount: d.amount,
  cadets: d.cadets || "0",
  anos: d.anos || "0",
  staff: d.staff || "0",
  note: d.note,
  lines: d.showBreakup
    ? HEADS.filter((h) => d.lines[h.head].amount.trim()).map((h) => ({ head: h.head, amount: d.lines[h.head].amount, quantity: d.lines[h.head].quantity ? d.lines[h.head].quantity : null }))
    : [],
});
// Paise from typed rupees, for the live breakup total (the server re-checks).
const paise = (v: string) => (/^\d{1,9}(\.\d{1,2})?$/.test(v.trim()) ? BigInt(v.trim().split(".")[0]) * 100n + BigInt((v.trim().split(".")[1] ?? "").padEnd(2, "0")) : 0n);
// The amount demanded with its basis and note, and an optional breakup by
// head that must add up to the amount (reference figures beside rated heads).
export function BudgetFields({ draft, onChange, days, rates, synthetic }: { draft: BudgetDraft; onChange: (d: BudgetDraft) => void; days: number | null; rates: Record<Head, string | null>; synthetic: boolean }) {
  const t = useT().budgets;
  const set = (patch: Partial<BudgetDraft>) => onChange({ ...draft, ...patch });
  const line = (head: Head, patch: Partial<Line>) => set({ lines: { ...draft.lines, [head]: { ...draft.lines[head], ...patch } } });
  const sum = HEADS.reduce((n, h) => n + paise(draft.lines[h.head].amount), 0n);
  const amount = paise(draft.amount);
  const basis = { cadets: Number(draft.cadets) || 0, anos: Number(draft.anos) || 0, staff: Number(draft.staff) || 0, days: days ?? 0 };
  const num = (label: string, key: "cadets" | "anos" | "staff") => (
    <Field label={label}>
      <input type="number" inputMode="numeric" min={0} max={10000} className={inputClass} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  );
  return (
    <div className="grid gap-4">
      <Field label={t.amount}>
        <input inputMode="decimal" className={`${inputClass} max-w-[220px]`} value={draft.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="250000" />
      </Field>
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <legend className="mb-1.5 text-[13px] font-medium">{t.basis}</legend>
        {num(t.cadets, "cadets")}
        {num(t.anos, "anos")}
        {num(t.staff, "staff")}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">{t.days}</span>
          <span className="flex h-9 items-center text-[14px] tabular-nums">{days ?? "–"}</span>
        </div>
      </fieldset>
      <Field label={t.note}>
        <textarea rows={2} className={`${inputClass} h-auto py-2`} value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} />
      </Field>
      <label className="flex items-center gap-2.5 text-[13.5px] font-medium">
        <input type="checkbox" checked={draft.showBreakup} onChange={(e) => set({ showBreakup: e.target.checked })} />
        {t.breakup}
      </label>
      {draft.showBreakup && (
        <div className="rounded-lg border">
          <p className="border-b bg-surface-2 px-4 py-2 text-xs text-muted">{t.breakupHint}</p>
          <table className="w-full table-fixed text-[13.5px]">
            <thead className="text-[12.5px] text-muted">
              <tr>
                <th className="w-[40%] px-3 py-1.5 text-left font-medium">{t.head}</th>
                <th className="px-1 py-1.5 text-right font-medium">₹</th>
                <th className="w-[34%] px-3 py-1.5 text-right font-medium"><span className="sr-only">{t.reference("")}</span></th>
              </tr>
            </thead>
            <tbody>
              {HEADS.map((h) => {
                const fuel = "per" in h && h.per === "litres";
                const ref = reference(h.head, { ...basis, litres: Number(draft.lines[h.head].quantity) || 0 }, rates[h.head] === null ? undefined : BigInt(rates[h.head]!));
                return (
                  <tr key={h.head} className="border-t align-top">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      {t.heads[h.head]}
                      {fuel && (
                        <input type="number" inputMode="numeric" min={0} aria-label={t.litres(t.heads[h.head])} placeholder="L" className={`${inputClass} mt-1 max-w-[100px]`} value={draft.lines[h.head].quantity} onChange={(e) => line(h.head, { quantity: e.target.value })} />
                      )}
                    </th>
                    <td className="px-1 py-1.5">
                      <input inputMode="decimal" aria-label={t.rupeesFor(t.heads[h.head])} className={`${inputClass} text-right`} value={draft.lines[h.head].amount} onChange={(e) => line(h.head, { amount: e.target.value })} />
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs text-muted">{ref !== null && ref > 0n ? t.reference(inr(ref)) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p role="status" className={`border-t px-4 py-2 text-[13px] ${sum > 0n && sum !== amount ? "font-medium text-danger" : "text-muted"}`}>{t.breakupSum(inr(sum), inr(amount))}</p>
          {synthetic && <p className="border-t px-4 py-2 text-xs text-muted">{t.referenceNote}</p>}
        </div>
      )}
    </div>
  );
}
