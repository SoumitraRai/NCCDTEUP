"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { campOptions } from "@/modules/camps/service";
import { Alert, Button, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
import type { Head } from "@/modules/camps/budget-rules";
import { BudgetFields, draftPayload, newDraft } from "./budget-fields";
type Options = Awaited<ReturnType<typeof campOptions>>;
export type CampEdit = { id: string; version: number; unitId: string; catcNo: string; location: string; start: string; end: string; plannedStrength: number; briefing: string; details: string; seats: { unitId: string; seats: number }[] };
const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;
// Plan a camp or, with `edit`, change an upcoming one. The server checks
// every rule again (group, seats, training year, dates).
// A new plan may also carry its initial budget, submitted with it.
export function CampForm({ options, edit, rates, synthetic = false }: { options: Options; edit?: CampEdit; rates?: Record<Head, string | null>; synthetic?: boolean }) {
  const router = useRouter();
  const { set } = useQueryState();
  const all = useT();
  const t = all.camps;
  const [withBudget, setWithBudget] = useState(false);
  const [budget, setBudget] = useState(() => newDraft(null));
  const [unitId, setUnitId] = useState(edit?.unitId ?? (options.hosts.length === 1 ? options.hosts[0].id : ""));
  const [catcNo, setCatcNo] = useState(edit?.catcNo ?? "");
  const [location, setLocation] = useState(edit?.location ?? "");
  const [start, setStart] = useState(edit?.start ?? "");
  const [end, setEnd] = useState(edit?.end ?? "");
  const [planned, setPlanned] = useState(edit ? String(edit.plannedStrength) : "");
  const [briefing, setBriefing] = useState(edit?.briefing ?? "");
  const [seats, setSeats] = useState<Record<string, string>>(Object.fromEntries((edit?.seats ?? []).map((s) => [s.unitId, String(s.seats)])));
  const [details, setDetails] = useState(edit?.details ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const host = options.hosts.find((u) => u.id === unitId) ?? options.units.find((u) => u.id === unitId);
  // The host's group, host first.
  const group = host ? options.units.filter((u) => u.groupId === host.groupId).sort((a, b) => Number(b.id === unitId) - Number(a.id === unitId)) : [];
  const allocated = group.reduce((n, u) => n + (Number(seats[u.id]) || 0), 0);
  const plannedN = Number(planned) || 0;
  const span = start && end ? days(start, end) : null;
  const save = async () => {
    setBusy(true);
    setError("");
    const body = {
      catcNo,
      location,
      start,
      end,
      plannedStrength: planned,
      briefing,
      details,
      // The host always has a row; other units only when given seats.
      seats: group.filter((u) => u.id === unitId || Number(seats[u.id]) > 0).map((u) => ({ unitId: u.id, seats: seats[u.id] || "0" })),
    };
    try {
      if (edit) {
        await api(`camps/${edit.id}`, "PATCH", { ...body, version: edit.version });
        set({ edit: null });
      } else {
        // Cadets default to the seats allocated when left blank.
        const initial = withBudget ? { ...draftPayload(budget), cadets: budget.cadets || String(allocated) } : undefined;
        const made = await api<{ id: string }>("camps", "POST", { unitId, ...body, ...(initial ? { budget: initial } : {}) });
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
          <Button variant="primary" busy={busy} className="shrink-0" onClick={save}>{t.save}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <Alert>{error}</Alert>}
        {edit ? (
          <p className="text-[13.5px]"><span className="text-muted">{t.hostUnit}: </span>{host?.name}</p>
        ) : (
          <Field label={t.hostUnit}>
            <select className={inputClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {options.hosts.length !== 1 && <option value="">{t.choose}</option>}
              {options.hosts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label={t.catcNo}><input className={inputClass} value={catcNo} onChange={(e) => setCatcNo(e.target.value)} maxLength={30} /></Field>
          <Field label={t.location}><input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.start}><input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label={t.end}><input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        {span !== null && <p role="status" className={`text-[13.5px] ${span > 0 ? "font-medium" : "text-danger"}`}>{span > 0 ? t.days(span) : t.range(start, end)}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.plannedStrength}>
            <input type="number" inputMode="numeric" min={1} max={5000} className={`${inputClass} max-w-[160px]`} value={planned} onChange={(e) => setPlanned(e.target.value)} />
          </Field>
          <Field label={t.briefingOptional}>
            <input type="date" className={inputClass} value={briefing} max={start || undefined} onChange={(e) => setBriefing(e.target.value)} />
          </Field>
        </div>
        {group.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] font-medium">{t.seatsFor}</legend>
            {group.map((u) => (
              <label key={u.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[13.5px]">
                <span>{u.name}{u.id === unitId ? ` (${t.host})` : ""}</span>
                <input type="number" inputMode="numeric" min={0} max={5000} aria-label={`${t.seats}, ${u.name}`} className={`${inputClass} max-w-[110px]`} value={seats[u.id] ?? ""} onChange={(e) => setSeats({ ...seats, [u.id]: e.target.value })} />
              </label>
            ))}
            <p role="status" className={`text-[13px] ${allocated > plannedN ? "text-danger" : "text-muted"}`}>{t.seatsSum(allocated, plannedN)}</p>
          </fieldset>
        )}
        <Field label={t.details}>
          <textarea rows={3} className={`${inputClass} h-auto py-2`} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
        </Field>
        {!edit && rates && (
          <section className="space-y-4 rounded-lg border p-4">
            <label className="flex items-center gap-2.5 text-[13.5px] font-medium">
              <input type="checkbox" checked={withBudget} onChange={(e) => setWithBudget(e.target.checked)} />
              {all.budgets.planBudget}
            </label>
            <p className="text-xs text-muted">{all.budgets.planBudgetHint}</p>
            {withBudget && <BudgetFields draft={{ ...budget, cadets: budget.cadets || (allocated ? String(allocated) : "") }} onChange={setBudget} days={span && span > 0 ? span : null} rates={rates} synthetic={synthetic} />}
          </section>
        )}
      </form>
    </Drawer>
  );
}
