"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
// Activate (for members, optionally correcting the role) or reject a pending
// registration. Officer requests keep the post they asked for.
export function RegistrationDecision({ id, version, role = "", officer = false }: { id: string; version: number; role?: string; officer?: boolean }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT().registrations;
  const [as, setAs] = useState(role);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "ACTIVATE" | "REJECT">("");
  const [error, setError] = useState("");
  const decide = async (decision: "ACTIVATE" | "REJECT") => {
    setBusy(decision);
    setError("");
    try {
      await api(
        `${officer ? "officer-registrations" : "registrations"}/${id}/decision`,
        "POST",
        decision === "ACTIVATE" ? (officer ? { decision, version, note } : { decision, version, role: as, note }) : { decision, version, note },
      );
      set({ open: null });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className={`grid gap-3 ${officer ? "" : "grid-cols-[160px_1fr]"}`}>
        {!officer && (
          <Field label={t.activateAs}>
            <select className={inputClass} value={as} onChange={(e) => setAs(e.target.value)}>
              {["CADET", "ANO", "CTO"].map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
            </select>
          </Field>
        )}
        <Field label={t.remarks} hint={t.remarksHint}>
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
      <p className="text-xs text-muted">{officer ? t.officerHint : t.checkHint}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="danger" busy={busy === "REJECT"} disabled={!!busy} onClick={() => decide("REJECT")}>{t.reject}</Button>
        <Button variant="primary" busy={busy === "ACTIVATE"} disabled={!!busy} onClick={() => decide("ACTIVATE")}>{t.activate}</Button>
      </div>
    </div>
  );
}
