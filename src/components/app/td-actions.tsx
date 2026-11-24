"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, ButtonLink, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
type Decision = "RECOMMEND" | "NOT_RECOMMEND" | "APPROVE" | "RETURN" | "REJECT";
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
// Decision panel for the holder of the TD's current step.
export function TdDecision({ id, version, kind, stageCode, stageTitle }: { id: string; version: number; kind: "RECOMMEND" | "APPROVE"; stageCode: string; stageTitle: string }) {
  const { busy, error, run } = useRun();
  const all = useT();
  const t = all.td;
  const [remarks, setRemarks] = useState("");
  const options: [Decision, "primary" | "secondary" | "danger"][] =
    kind === "RECOMMEND" ? [["RECOMMEND", "primary"], ["NOT_RECOMMEND", "secondary"], ["RETURN", "danger"]] : [["APPROVE", "primary"], ["RETURN", "secondary"], ["REJECT", "danger"]];
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">{t.awaitingYou(all.stages[stageCode] ?? stageTitle)}</p>
      {error && <Alert>{error}</Alert>}
      <Field label={t.remarks} hint={t.remarksHint}>
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} className={`${inputClass} h-auto py-2`} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {options.map(([decision, variant]) => (
          <Button key={decision} variant={variant} busy={busy === decision} disabled={!!busy} onClick={() => run(decision, () => api(`td/${id}/decision`, "POST", { decision, remarks, version }), () => setRemarks(""))}>
            {t.decision[decision]}
          </Button>
        ))}
      </div>
    </div>
  );
}
// The creator cancels a pending or returned TD, or edits a returned one.
export function TdOwnerActions({ id, version, canEdit }: { id: string; version: number; canEdit: boolean }) {
  const { busy, error, run } = useRun();
  const { set } = useQueryState();
  const t = useT().td;
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="danger" busy={busy === "cancel"} disabled={!!busy} onClick={() => run("cancel", () => api(`td/${id}/cancel`, "POST", { version }), () => set({ open: null }))}>
          {t.cancel}
        </Button>
        {canEdit && <ButtonLink query={{ edit: "1" }} variant="primary">{t.edit}</ButtonLink>}
      </div>
    </div>
  );
}
// Opening a TD clears its unread notices for the traveller.
export function MarkSeen({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    api(`td/${id}/seen`, "POST", {}).then(() => router.refresh(), () => {});
  }, [id, router]);
  return null;
}
