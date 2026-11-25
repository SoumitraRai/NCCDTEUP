"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, ButtonLink, Field, api, inputClass } from "./ui";
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
// Host unit or group, before the camp starts: edit or cancel with a reason.
export function CampPlannerActions({ id, version }: { id: string; version: number }) {
  const { busy, error, run } = useRun();
  const t = useT().camps;
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {cancelling && (
        <Field label={t.cancelReason}>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={`${inputClass} h-auto py-2`} />
        </Field>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {cancelling ? (
          <Button variant="danger" busy={busy === "cancel"} onClick={() => run("cancel", () => api(`camps/${id}/cancel`, "POST", { reason, version }), () => setCancelling(false))}>
            {t.confirmCancel}
          </Button>
        ) : (
          <Button variant="danger" onClick={() => setCancelling(true)}>{t.cancel}</Button>
        )}
        <ButtonLink query={{ edit: "1" }} variant="primary">{t.edit}</ButtonLink>
      </div>
    </div>
  );
}
// After the camp: attendance per unit with seats, then submit (the file is
// uploaded separately in the report section).
export function CampReportForm({ id, version, seats }: { id: string; version: number; seats: { unitId: string; unit: string; seats: number; attended: number | null }[] }) {
  const { busy, error, run } = useRun();
  const t = useT().camps;
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(seats.map((s) => [s.unitId, s.attended === null ? "" : String(s.attended)])));
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-2">
        {seats.map((s) => (
          <label key={s.unitId} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span>{t.attendanceFor(s.unit)} <span className="text-muted">({t.seats}: {s.seats})</span></span>
            <input type="number" inputMode="numeric" min={0} max={5000} className={`${inputClass} max-w-[110px]`} value={values[s.unitId]} onChange={(e) => setValues({ ...values, [s.unitId]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="primary" busy={busy === "submit"} onClick={() => run("submit", () => api(`camps/${id}/report`, "POST", { version, attendance: seats.map((s) => ({ unitId: s.unitId, attended: values[s.unitId] || "" })) }))}>
          {t.submitReport}
        </Button>
      </div>
    </div>
  );
}
// A group officer (not the submitter) accepts or returns a submitted report.
export function CampReview({ id, version }: { id: string; version: number }) {
  const { busy, error, run } = useRun();
  const t = useT().camps;
  const [remarks, setRemarks] = useState("");
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Field label={t.remarks} hint={t.remarksHint}>
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} className={`${inputClass} h-auto py-2`} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" busy={busy === "RETURN"} disabled={!!busy} onClick={() => run("RETURN", () => api(`camps/${id}/report/decision`, "POST", { decision: "RETURN", remarks, version }))}>{t.return}</Button>
        <Button variant="primary" busy={busy === "ACCEPT"} disabled={!!busy} onClick={() => run("ACCEPT", () => api(`camps/${id}/report/decision`, "POST", { decision: "ACCEPT", remarks, version }))}>{t.accept}</Button>
      </div>
    </div>
  );
}
