"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
type Option = { id: string; name: string };
export type VisitDraft = {
  id: string;
  version: number;
  institutionId: string;
  date: string;
  start: string;
  end: string;
  purpose: string;
  visitorName: string;
  visitorRank: string;
  visitorAppointment: string;
  subjectIds: string[];
  periods: number;
  cadetsPresent: number;
  notes: string;
};
const appointments = ["PI", "ANO", "CTO", "CO", "AO", "GCI", "TO", "OTHER"];
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
// A default slot that has already ended (visits cannot be recorded in
// advance): the last two whole hours today, or yesterday 10:00–12:00 before
// 10:00 IST.
function pastSlot() {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const hour = ist.getUTCHours();
  if (hour < 10) return { date: new Date(ist.getTime() - 86_400_000).toISOString().slice(0, 10), start: "10:00", end: "12:00" };
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return { date: ist.toISOString().slice(0, 10), start: pad(hour - 2), end: pad(hour) };
}
export function VisitForm({ institutions, subjects, draft }: { institutions: Option[]; subjects: Option[]; draft?: VisitDraft }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT();
  const T = t.visits;
  const [slot] = useState(pastSlot);
  const [v, setV] = useState({
    institutionId: draft?.institutionId ?? institutions[0]?.id ?? "",
    date: draft?.date ?? slot.date,
    start: draft?.start ?? slot.start,
    end: draft?.end ?? slot.end,
    purpose: draft?.purpose ?? "",
    visitorName: draft?.visitorName ?? "",
    visitorRank: draft?.visitorRank ?? "",
    visitorAppointment: draft?.visitorAppointment ?? "PI",
    subjectIds: draft?.subjectIds ?? ([] as string[]),
    periods: draft?.periods ?? 1,
    cadetsPresent: draft?.cadetsPresent ?? 0,
    notes: draft?.notes ?? "",
  });
  const [busy, setBusy] = useState<"" | "save" | "record">("");
  const [error, setError] = useState("");
  const upd = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const payload = () => {
    const { date, start, end, ...rest } = v;
    return { ...rest, startsAt: `${date}T${start}`, endsAt: `${date}T${end}` };
  };
  const save = async (record: boolean) => {
    setBusy(record ? "record" : "save");
    setError("");
    try {
      const saved = draft
        ? await api<{ id: string; version: number }>(`visits/${draft.id}`, "PATCH", { ...payload(), version: draft.version })
        : await api<{ id: string; version: number }>("visits", "POST", payload());
      if (record) await api(`visits/${saved.id}/submit`, "POST", { version: saved.version });
      set({ new: null, edit: null, open: saved.id });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : T.saveFailed);
    } finally {
      setBusy("");
    }
  };
  return (
    <Drawer
      title={draft ? T.editTitle : T.record}
      closeKeys={["new", "edit"]}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button busy={busy === "save"} disabled={!!busy} onClick={() => save(false)}>{T.saveDraft}</Button>
          <Button variant="primary" busy={busy === "record"} disabled={!!busy} onClick={() => save(true)}>{T.recordVisit}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(true); }}>
        {error && <Alert>{error}</Alert>}
        <Field label={t.common.institution}>
          <select className={inputClass} value={v.institutionId} onChange={(e) => upd("institutionId", e.target.value)}>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t.common.date}><input type="date" max={today()} className={inputClass} value={v.date} onChange={(e) => upd("date", e.target.value)} /></Field>
          <Field label={t.common.from}><input type="time" className={inputClass} value={v.start} onChange={(e) => upd("start", e.target.value)} /></Field>
          <Field label={t.common.to}><input type="time" className={inputClass} value={v.end} onChange={(e) => upd("end", e.target.value)} /></Field>
        </div>
        <Field label={T.purposeLabel}>
          <input className={inputClass} value={v.purpose} onChange={(e) => upd("purpose", e.target.value)} placeholder={T.purposeHint} />
        </Field>
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-[13px] font-medium">{T.officer}</legend>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label={t.common.name}><input className={inputClass} value={v.visitorName} onChange={(e) => upd("visitorName", e.target.value)} /></Field>
            <Field label={t.common.rank}><input className={inputClass} value={v.visitorRank} onChange={(e) => upd("visitorRank", e.target.value)} /></Field>
          </div>
          <Field label={t.common.appointment}>
            <select className={inputClass} value={v.visitorAppointment} onChange={(e) => upd("visitorAppointment", e.target.value)}>
              {appointments.map((k) => <option key={k} value={k}>{T.appointments[k]}</option>)}
            </select>
          </Field>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.common.cadetsPresent}><input type="number" min={0} max={1000} className={inputClass} value={v.cadetsPresent} onChange={(e) => upd("cadetsPresent", Number(e.target.value))} /></Field>
          <Field label={T.periodsTaken} hint={T.upTo10}><input type="number" min={0} max={10} className={inputClass} value={v.periods} onChange={(e) => upd("periods", Number(e.target.value))} /></Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">{T.subjects}</legend>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const on = v.subjectIds.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  aria-pressed={on}
                  onClick={() => upd("subjectIds", on ? v.subjectIds.filter((x) => x !== s.id) : [...v.subjectIds, s.id])}
                  className={`rounded-full border px-3 py-1 text-[13px] transition-colors duration-100 ${on ? "border-primary bg-primary-soft text-primary" : "bg-surface text-muted hover:text-ink"}`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label={T.notes} hint={T.notesHint}>
          <textarea rows={3} className={`${inputClass} h-auto py-2`} value={v.notes} onChange={(e) => upd("notes", e.target.value)} />
        </Field>
      </form>
    </Drawer>
  );
}
export function RecordDraft({ id, version }: { id: string; version: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useT();
  return (
    <div className="flex flex-col items-end gap-2">
      {error && <Alert>{error}</Alert>}
      <Button
        variant="primary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(`visits/${id}/submit`, "POST", { version });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : t.visits.recordFailed);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.visits.recordVisit}
      </Button>
    </div>
  );
}
