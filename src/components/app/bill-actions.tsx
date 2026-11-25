"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Download, Paperclip, Upload } from "lucide-react";
import { Alert, Button, Field, api, inputClass, localeHeader } from "./ui";
import { useT } from "./i18n-client";
function useAction() {
  const router = useRouter();
  const t = useT();
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
      setError(e instanceof Error ? e.message : t.common.requestFailed);
    } finally {
      setBusy("");
    }
  };
  return { busy, error, run };
}
type Decision = "REVIEW" | "NOT_RECOMMEND" | "APPROVE" | "RETURN" | "REJECT";
// Decision panel for the officer holding the current stage.
export function DecisionPanel({ kind, id, version, stage, stageCode, stageTitle }: { kind: string; id: string; version: number; stage: "RECOMMEND" | "APPROVE"; stageCode: string; stageTitle: string }) {
  const { busy, error, run } = useAction();
  const all = useT();
  const t = all.actions;
  const [remarks, setRemarks] = useState("");
  const options: [Decision, string, "primary" | "secondary" | "danger"][] =
    stage === "RECOMMEND"
      ? [["REVIEW", t.recommend, "primary"], ["NOT_RECOMMEND", t.notRecommend, "secondary"], ["RETURN", t.return, "danger"]]
      : [["APPROVE", t.sanction, "primary"], ["RETURN", t.return, "secondary"], ["REJECT", t.reject, "danger"]];
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">{t.awaiting(all.stages[stageCode] ?? stageTitle)}</p>
      {error && <Alert>{error}</Alert>}
      <Field label={t.remarks} hint={t.remarksHint}>
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} className={`${inputClass} h-auto py-2`} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {options.map(([action, label, variant]) => (
          <Button
            key={action}
            variant={variant}
            busy={busy === action}
            disabled={!!busy}
            onClick={() => run(action, () => api(`bills/${kind}/${id}/decision`, "POST", { version, action, comment: remarks }), () => setRemarks(""))}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
export function OwnerActions({ kind, id, version, state }: { kind: string; id: string; version: number; state: string }) {
  const { busy, error, run } = useAction();
  const t = useT().actions;
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="danger" busy={busy === "CANCEL"} disabled={!!busy} onClick={() => run("CANCEL", () => api(`bills/${kind}/${id}/decision`, "POST", { version, action: "CANCEL" }))}>
          {t.cancel}
        </Button>
        <Button variant="primary" busy={busy === "SUBMIT"} disabled={!!busy} onClick={() => run("SUBMIT", () => api(`bills/${kind}/${id}/decision`, "POST", { version, action: "SUBMIT" }))}>
          {state === "RETURNED" ? t.resubmit : t.submit}
        </Button>
      </div>
    </div>
  );
}
const toPaise = (rupees: string) => {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(rupees.trim())) return null;
  const [w, f = ""] = rupees.trim().split(".");
  return (BigInt(w) * 100n + BigInt(f.padEnd(2, "0"))).toString();
};
export function PaymentForm({ kind, id, version, duePaise }: { kind: string; id: string; version: number; duePaise: string }) {
  const { busy, error, run } = useAction();
  const t = useT().actions;
  const due = BigInt(duePaise);
  const [amount, setAmount] = useState(`${due / 100n}${due % 100n ? `.${(due % 100n).toString().padStart(2, "0")}` : ""}`);
  const [reference, setReference] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [localError, setLocalError] = useState("");
  return (
    <div className="space-y-3">
      {(error || localError) && <Alert>{error || localError}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.amountPaid}><input inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t.reference}><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t.referenceHint} /></Field>
      </div>
      <div className="flex justify-end">
        <Button
          variant="primary"
          busy={busy === "pay"}
          onClick={() => {
            const paise = toPaise(amount);
            if (!paise || paise === "0") return setLocalError(t.rupeesHint);
            setLocalError("");
            run("pay", () => api(`bills/${kind}/${id}/payments`, "POST", { version, amountPaise: paise, reference, idempotencyKey: key }));
          }}
        >
          {t.recordPayment}
        </Button>
      </div>
    </div>
  );
}
const types: Record<string, string> = { "image/jpeg": "image/jpeg", "image/png": "image/png", "application/pdf": "application/pdf" };
export function EvidenceUpload({ resourceId, institutionId, purpose, label, resourceType = "claim" }: { resourceId: string; institutionId: string; purpose: "BILL" | "DOCUMENT" | "PHOTO" | "REPORT"; label: string; resourceType?: "claim" | "camp" }) {
  const { busy, error, run } = useAction();
  const t = useT().actions;
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <input
        ref={input}
        type="file"
        accept={purpose === "PHOTO" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          run("upload", async () => {
            if (!types[file.type]) throw new Error(t.fileType);
            if (file.size > 10 * 1024 * 1024) throw new Error(t.fileSize);
            const intent = await api<{ id: string }>("attachments/intent", "POST", { institutionId, resourceType, resourceId, declaredType: file.type, size: file.size, purpose });
            const res = await fetch(`/api/private/attachments/${intent.id}`, { method: "PUT", body: file, headers: { "Content-Type": file.type, ...localeHeader() } });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.uploadFailed);
          });
        }}
      />
      <Button busy={busy === "upload"} onClick={() => input.current?.click()}>
        <Upload size={15} /> {label}
      </Button>
      <p className="text-xs text-muted">{t.uploadHint}</p>
    </div>
  );
}
export function AttachmentLink({ id, label, status }: { id: string; label: string; status: string }) {
  const [error, setError] = useState("");
  const t = useT().actions;
  const clean = status === "CLEAN";
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="flex items-center gap-2 text-[13px]">
        <Paperclip size={14} className="text-muted" /> {label}
      </span>
      {clean ? (
        <button
          className="flex items-center gap-1 text-[13px] text-primary hover:underline"
          onClick={async () => {
            try {
              location.href = (await api<{ url: string }>(`attachments/${id}`, "GET")).url;
            } catch (e) {
              setError(e instanceof Error ? e.message : t.downloadFailed);
            }
          }}
        >
          <Download size={14} /> {t.download}
        </button>
      ) : (
        <span className="text-[13px] text-muted">{status === "REJECTED" ? t.blocked : t.scanning}</span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
