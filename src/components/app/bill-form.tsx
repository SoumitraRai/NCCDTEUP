"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
type Option = { id: string; name: string };
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
// Creates the bill as a draft. Evidence is attached from the bill itself,
// and the approvers review the amount once it is submitted.
export function BillForm({ kind, institutions, subjects, categories }: { kind: "refreshment" | "honorarium"; institutions: Option[]; subjects: Option[]; categories: string[] }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT();
  const T = t.billForm;
  const [key] = useState(() => crypto.randomUUID());
  const [v, setV] = useState({
    institutionId: institutions[0]?.id ?? "",
    category: categories[0] ?? "",
    instructorName: "",
    instructorAppointment: "ANO",
    instructorRank: "",
    instructorMobile: "",
    claimedRupees: "",
    date: today(),
    start: "09:00",
    end: "11:00",
    cadetsPresent: 0,
    periods: 1,
    subjectIds: [] as string[],
    periodStart: "",
    periodEnd: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upd = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const save = async () => {
    setBusy(true);
    setError("");
    const common = { institutionId: v.institutionId, category: v.category, instructorName: v.instructorName, instructorAppointment: v.instructorAppointment, claimedRupees: v.claimedRupees, idempotencyKey: key };
    try {
      const bill = await api<{ id: string }>(
        `bills/${kind}`,
        "POST",
        kind === "refreshment"
          ? { ...common, trainingStart: `${v.date}T${v.start}`, trainingEnd: `${v.date}T${v.end}`, instructorMobile: v.instructorMobile, cadetsPresent: v.cadetsPresent, periods: v.periods, subjectIds: v.subjectIds }
          : { ...common, instructorRank: v.instructorRank, periodStart: v.periodStart, periodEnd: v.periodEnd },
      );
      set({ new: null, open: bill.id });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : T.saveFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={kind === "refreshment" ? T.newBill : T.newDemand}
      closeKeys={["new"]}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{T.savedAsDraft(kind === "refreshment")}</p>
          <Button variant="primary" busy={busy} onClick={save}>{T.saveDraft}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <Field label={t.common.institution}>
            <select className={inputClass} value={v.institutionId} onChange={(e) => upd("institutionId", e.target.value)}>
              {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <Field label={T.category}>
            <select className={inputClass} value={v.category} onChange={(e) => upd("category", e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-[13px] font-medium">{kind === "refreshment" ? T.instructor : T.officer}</legend>
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <Field label={t.common.name}><input className={inputClass} value={v.instructorName} onChange={(e) => upd("instructorName", e.target.value)} /></Field>
            <Field label={t.common.appointment}>
              <select className={inputClass} value={v.instructorAppointment} onChange={(e) => upd("instructorAppointment", e.target.value)}>
                <option value="ANO">ANO</option>
                <option value="CTO">CTO</option>
              </select>
            </Field>
          </div>
          {kind === "refreshment" ? (
            <Field label={T.mobile} hint={T.mobileHint}>
              <input inputMode="numeric" autoComplete="off" maxLength={10} className={inputClass} value={v.instructorMobile} onChange={(e) => upd("instructorMobile", e.target.value.replace(/\D/g, ""))} />
            </Field>
          ) : (
            <Field label={t.common.rank}><input className={inputClass} value={v.instructorRank} onChange={(e) => upd("instructorRank", e.target.value)} /></Field>
          )}
        </fieldset>
        {kind === "refreshment" ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label={T.trainingDate}><input type="date" max={today()} className={inputClass} value={v.date} onChange={(e) => upd("date", e.target.value)} /></Field>
              <Field label={t.common.from}><input type="time" min="08:00" max="18:00" className={inputClass} value={v.start} onChange={(e) => upd("start", e.target.value)} /></Field>
              <Field label={t.common.to}><input type="time" min="08:00" max="18:00" className={inputClass} value={v.end} onChange={(e) => upd("end", e.target.value)} /></Field>
            </div>
            <p className="-mt-3 text-xs text-muted">{T.window}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.common.cadetsPresent}><input type="number" min={1} max={1000} className={inputClass} value={v.cadetsPresent} onChange={(e) => upd("cadetsPresent", Number(e.target.value))} /></Field>
              <Field label={T.periods}><input type="number" min={1} max={10} className={inputClass} value={v.periods} onChange={(e) => upd("periods", Number(e.target.value))} /></Field>
            </div>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">{T.subjects}</legend>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const on = v.subjectIds.includes(s.id);
                  return (
                    <button type="button" key={s.id} aria-pressed={on} onClick={() => upd("subjectIds", on ? v.subjectIds.filter((x) => x !== s.id) : [...v.subjectIds, s.id])} className={`rounded-full border px-3 py-1 text-[13px] ${on ? "border-primary bg-primary-soft text-primary" : "bg-surface text-muted hover:text-ink"}`}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={T.periodFrom}><input type="date" className={inputClass} value={v.periodStart} onChange={(e) => upd("periodStart", e.target.value)} /></Field>
            <Field label={T.periodTo}><input type="date" className={inputClass} value={v.periodEnd} onChange={(e) => upd("periodEnd", e.target.value)} /></Field>
          </div>
        )}
        <Field label={T.amount} hint={T.amountHint}>
          <input inputMode="decimal" className={inputClass} value={v.claimedRupees} onChange={(e) => upd("claimedRupees", e.target.value)} placeholder={T.amountExample} />
        </Field>
      </form>
    </Drawer>
  );
}
