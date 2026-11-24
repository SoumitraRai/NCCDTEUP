"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { halfDaysBetween, type Half } from "@/modules/movement/days";
import type { tdOptions } from "@/modules/movement/service";
import { Alert, Button, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
type Options = Awaited<ReturnType<typeof tdOptions>>;
type Level = "UNIT" | "GROUP" | "DIRECTORATE";
type When = { date: string; half: Half };
export type TdEdit = { id: string; version: number; traveller: string; from: string; to: string; start: When; end: When; purpose: string; ownArrangement: boolean };
// Radio buttons drawn as one segmented control.
function Segmented<V extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium">{legend}</legend>
      <div className="inline-flex rounded-md border bg-surface-2 p-0.5">
        {options.map(([v, label]) => (
          <label key={v} className={`cursor-pointer rounded px-3 py-1.5 text-[13px] font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${value === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
// New TD (for oneself or sending someone) or, with `edit`, change a returned
// TD and send it again. The server recounts the days and checks every rule.
export function TdForm({ options, edit }: { options: Options; edit?: TdEdit }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT().td;
  const [mode, setMode] = useState<"OWN" | "SEND">(options.ownPosts.length || !options.canSend ? "OWN" : "SEND");
  const [postId, setPostId] = useState(options.ownPosts.length === 1 ? options.ownPosts[0].id : "");
  const [who, setWho] = useState<"ACCOUNT" | "TYPED">(options.people.length ? "ACCOUNT" : "TYPED");
  const [personId, setPersonId] = useState("");
  const [name, setName] = useState("");
  const [rank, setRank] = useState("");
  const [level, setLevel] = useState<Level>(options.formations.UNIT.length ? "UNIT" : options.formations.GROUP.length ? "GROUP" : "DIRECTORATE");
  const [formationId, setFormationId] = useState("");
  const [from, setFrom] = useState(edit?.from ?? (options.ownPosts.length === 1 ? options.ownPosts[0].formation : ""));
  const [fromTouched, setFromTouched] = useState(!!edit);
  const [to, setTo] = useState(edit?.to ?? "");
  const [start, setStart] = useState<When>(edit?.start ?? { date: "", half: "FN" });
  const [end, setEnd] = useState<When>(edit?.end ?? { date: "", half: "AN" });
  const [purpose, setPurpose] = useState(edit?.purpose ?? "");
  const [ownArrangement, setOwnArrangement] = useState(edit?.ownArrangement ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // "From" follows the chosen post or formation until the user edits it.
  const suggest = (place?: string) => !fromTouched && setFrom(place ?? "");
  const halves = start.date && end.date ? halfDaysBetween(start, end) : null;
  const halfOptions = (["FN", "AN"] as const).map((h) => [h, t.halfLong[h]] as [Half, string]);
  const save = async () => {
    setBusy(true);
    setError("");
    const fields = { from, to, start, end, purpose, ownArrangement };
    try {
      if (edit) {
        await api(`td/${edit.id}`, "PATCH", { ...fields, version: edit.version });
        set({ edit: null });
      } else {
        const traveller = who === "ACCOUNT" ? { postId: personId } : { name, rank, formation: { level, id: formationId } };
        const made = await api<{ id: string }>("td", "POST", mode === "OWN" ? { mode, postId, ...fields } : { mode, traveller, ...fields });
        set({ new: null, open: made.id });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={edit ? t.editTitle : t.newTitle}
      closeKeys={edit ? ["edit"] : ["new"]}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{t.defaults}</p>
          <Button variant="primary" busy={busy} className="shrink-0" onClick={save}>{edit ? t.resend : t.send}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <Alert>{error}</Alert>}
        {edit ? (
          <p className="text-[13.5px]"><span className="text-muted">{t.traveller}: </span>{edit.traveller}</p>
        ) : (
          <>
            {options.canSend && options.ownPosts.length > 0 && (
              <Segmented legend={t.whoFor} name="mode" value={mode} options={[["OWN", t.forMyself], ["SEND", t.sendSomeone]]} onChange={setMode} />
            )}
            {mode === "OWN" ? (
              <Field label={t.travellingAs}>
                <select className={inputClass} value={postId} onChange={(e) => { setPostId(e.target.value); suggest(options.ownPosts.find((p) => p.id === e.target.value)?.formation); }}>
                  {options.ownPosts.length !== 1 && <option value="">{t.choose}</option>}
                  {options.ownPosts.map((p) => <option key={p.id} value={p.id}>{p.title}, {p.formation}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-[13px] font-medium">{t.traveller}</legend>
                  {([["ACCOUNT", t.onSampark], ["TYPED", t.notOnSampark]] as const).map(([v, label]) => (
                    <label key={v} className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13.5px]">
                      <input type="radio" name="who" value={v} checked={who === v} disabled={v === "ACCOUNT" && !options.people.length} onChange={() => setWho(v)} />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {who === "ACCOUNT" ? (
                  <Field label={t.person}>
                    <select className={inputClass} value={personId} onChange={(e) => { setPersonId(e.target.value); suggest(options.people.find((p) => p.postId === e.target.value)?.formation); }}>
                      <option value="">{t.choose}</option>
                      {options.people.map((p) => <option key={p.postId} value={p.postId}>{p.name}, {p.post}, {p.formation}</option>)}
                    </select>
                  </Field>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_2fr] gap-3">
                      <Field label={t.rank}><input className={inputClass} value={rank} onChange={(e) => setRank(e.target.value)} maxLength={40} /></Field>
                      <Field label={t.name}><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
                    </div>
                    <div className="grid grid-cols-[1fr_2fr] gap-3">
                      <Field label={t.formationLevel}>
                        <select className={inputClass} value={level} onChange={(e) => { setLevel(e.target.value as Level); setFormationId(""); }}>
                          {(["UNIT", "GROUP", "DIRECTORATE"] as const).filter((l) => options.formations[l].length).map((l) => <option key={l} value={l}>{t.levels[l]}</option>)}
                        </select>
                      </Field>
                      <Field label={t.formation}>
                        <select className={inputClass} value={formationId} onChange={(e) => { setFormationId(e.target.value); suggest(options.formations[level].find((f) => f.id === e.target.value)?.name); }}>
                          <option value="">{t.choose}</option>
                          {options.formations[level].map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </Field>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.from}><input className={inputClass} value={from} onChange={(e) => { setFrom(e.target.value); setFromTouched(true); }} maxLength={120} /></Field>
          <Field label={t.to}><input className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} maxLength={120} /></Field>
        </div>
        {([[t.start, start, setStart, "start"], [t.end, end, setEnd, "end"]] as const).map(([label, value, change, key]) => (
          <div key={key} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={label}>
              <input type="date" className={inputClass} value={value.date} onChange={(e) => change({ ...value, date: e.target.value })} />
            </Field>
            <Segmented legend={`${label}: ${t.halves.FN} / ${t.halves.AN}`} name={`${key}-half`} value={value.half} options={halfOptions} onChange={(half) => change({ ...value, half })} />
          </div>
        ))}
        {halves !== null && (
          <p role="status" className={`text-[13.5px] ${halves > 0 ? "font-medium" : "text-danger"}`}>
            {halves > 0 ? t.preview(t.days(halves)) : t.invalid}
          </p>
        )}
        <Field label={t.purpose}>
          <textarea rows={3} className={`${inputClass} h-auto py-2`} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} />
        </Field>
        <label className="flex items-center gap-2.5 text-[13.5px]">
          <input type="checkbox" checked={ownArrangement} onChange={(e) => setOwnArrangement(e.target.checked)} />
          {t.ownArrangement}
        </label>
      </form>
    </Drawer>
  );
}
