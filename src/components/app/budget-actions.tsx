"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Head } from "@/modules/camps/budget-rules";
import { Alert, Button, ButtonLink, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { BudgetFields, draftPayload, newDraft } from "./budget-fields";
import { useT } from "./i18n-client";
function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const run = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      after?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    } finally {
      setBusy("");
    }
  };
  return { busy, error, run };
}
type Decision = "RECOMMEND" | "NOT_RECOMMEND" | "APPROVE" | "RETURN" | "REJECT";
// The holder of the budget's current step; the sanctioning officer enters
// the amount to sanction (the demand by default).
export function BudgetDecision({ id, version, kind, demandedRupees }: { id: string; version: number; kind: "RECOMMEND" | "APPROVE"; demandedRupees: string }) {
  const { busy, error, run } = useRun();
  const t = useT().budgets;
  const [remarks, setRemarks] = useState("");
  const [sanction, setSanction] = useState(demandedRupees);
  const options: [Decision, "primary" | "secondary" | "danger"][] =
    kind === "RECOMMEND" ? [["RECOMMEND", "primary"], ["NOT_RECOMMEND", "secondary"], ["RETURN", "danger"]] : [["APPROVE", "primary"], ["RETURN", "secondary"], ["REJECT", "danger"]];
  return (
    <div className="space-y-3 rounded-lg border bg-surface-2/60 p-3">
      {error && <Alert>{error}</Alert>}
      {kind === "APPROVE" && (
        <Field label={t.sanctionAmount} hint={t.sanctionHint}>
          <input inputMode="decimal" className={`${inputClass} max-w-[220px]`} value={sanction} onChange={(e) => setSanction(e.target.value)} />
        </Field>
      )}
      <Field label={t.remarks} hint={t.remarksHint}>
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} className={`${inputClass} h-auto py-2`} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {options.map(([decision, variant]) => (
          <Button key={decision} variant={variant} busy={busy === decision} disabled={!!busy}
            onClick={() => run(decision, () => api(`camps/budgets/${id}/decision`, "POST", { decision, remarks, version, ...(decision === "APPROVE" ? { sanctioned: sanction } : {}) }))}>
            {t.decision[decision]}
          </Button>
        ))}
      </div>
    </div>
  );
}
// The preparer cancels a pending or returned budget, or edits a returned one.
export function BudgetPreparerActions({ id, version, canEdit, stage }: { id: string; version: number; canEdit: boolean; stage: string }) {
  const { busy, error, run } = useRun();
  const t = useT().budgets;
  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="danger" busy={busy === "cancel"} onClick={() => run("cancel", () => api(`camps/budgets/${id}/cancel`, "POST", { version }))}>{t.cancel}</Button>
        {canEdit && <ButtonLink query={{ prepare: stage, editBudget: id }} variant="primary">{t.edit}</ButtonLink>}
      </div>
    </div>
  );
}
type Existing = { id: string; version: number; demandedPaise: string; cadets: number; anos: number; staff: number; note: string; lines: Partial<Record<Head, { quantity: number | null; amountPaise: string }>> };
// Prepare a stage's budget for a camp, or edit a returned one and send again.
export function BudgetForm({ campId, catcNo, stage, days, rates, synthetic, cadets, edit }: { campId: string; catcNo: string; stage: string; days: number; rates: Record<Head, string | null>; synthetic: boolean; cadets: number | null; edit?: Existing }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT().budgets;
  const [draft, setDraft] = useState(() => newDraft(cadets, edit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = t.stages[stage] ?? stage;
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (edit) await api(`camps/budgets/${edit.id}`, "PATCH", { ...draftPayload(draft), version: edit.version });
      else await api("camps/budgets", "POST", { campId, stage, ...draftPayload(draft) });
      set({ prepare: null, editBudget: null });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={edit ? t.editTitle(label) : `${t.prepare(label)}, ${catcNo}`}
      closeKeys={["prepare", "editBudget"]}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{t.provisional}</p>
          <Button variant="primary" busy={busy} className="shrink-0" onClick={save}>{edit ? t.resubmit : t.submit}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <Alert>{error}</Alert>}
        <BudgetFields draft={draft} onChange={setDraft} days={days} rates={rates} synthetic={synthetic} />
      </form>
    </Drawer>
  );
}
