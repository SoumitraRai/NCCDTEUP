"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
type Option = { id: string; name: string };
export type InstitutionDraft = { id: string; version: number; name: string; district: string; unitId: string; vacancy: number; latitude: number | null; longitude: number | null };
// Adds an institution, or edits one with its version so concurrent edits are caught.
export function InstitutionForm({ units, institution }: { units: Option[]; institution?: InstitutionDraft }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT();
  const T = t.institutions;
  const [v, setV] = useState({
    name: institution?.name ?? "",
    district: institution?.district ?? "",
    unitId: institution?.unitId ?? units[0]?.id ?? "",
    vacancy: String(institution?.vacancy ?? 0),
    latitude: institution?.latitude?.toString() ?? "",
    longitude: institution?.longitude?.toString() ?? "",
  });
  const [busy, setBusy] = useState<"" | "save" | "deactivate">("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const upd = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  // Empty stays null; anything else must be a number.
  const num = (raw: string, what: string) => {
    if (!raw.trim()) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(T.badNumber(what));
    return n;
  };
  const save = async () => {
    setBusy("save");
    setError("");
    try {
      const body = {
        name: v.name,
        district: v.district,
        unitId: v.unitId,
        vacancy: num(v.vacancy, T.vacancyLabel) ?? 0,
        latitude: num(v.latitude, T.latitude),
        longitude: num(v.longitude, T.longitude),
      };
      if (institution) await api(`institutions/${institution.id}`, "PATCH", { ...body, version: institution.version });
      else await api("institutions", "POST", body);
      set({ new: null, edit: null });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : T.saveFailed);
    } finally {
      setBusy("");
    }
  };
  const deactivate = async () => {
    if (!institution) return;
    if (!confirm) return setConfirm(true);
    setBusy("deactivate");
    setError("");
    try {
      await api(`institutions/${institution.id}`, "DELETE", { version: institution.version });
      set({ edit: null });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : T.saveFailed);
    } finally {
      setBusy("");
    }
  };
  return (
    <Drawer
      title={institution ? T.editTitle(institution.name) : T.addTitle}
      closeKeys={["new", "edit"]}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {institution ? (
            <div className="flex items-center gap-3">
              <Button variant="danger" busy={busy === "deactivate"} disabled={!!busy} onClick={deactivate}>
                {confirm ? T.confirmDeactivate : T.deactivate}
              </Button>
              {confirm && <p className="max-w-56 text-xs text-muted">{T.deactivateHint}</p>}
            </div>
          ) : (
            <span />
          )}
          <Button variant="primary" busy={busy === "save"} disabled={!!busy} onClick={save}>{T.save}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <Alert>{error}</Alert>}
        <Field label={T.name}><input className={inputClass} value={v.name} onChange={(e) => upd("name", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={T.district}><input className={inputClass} value={v.district} onChange={(e) => upd("district", e.target.value)} /></Field>
          <Field label={t.common.unit}>
            <select className={inputClass} value={v.unitId} onChange={(e) => upd("unitId", e.target.value)}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label={T.vacancyLabel} hint={T.vacancyHint}>
          <input inputMode="numeric" className={inputClass} value={v.vacancy} onChange={(e) => upd("vacancy", e.target.value.replace(/\D/g, ""))} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">{T.location}</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={T.latitude}><input inputMode="decimal" className={inputClass} value={v.latitude} onChange={(e) => upd("latitude", e.target.value)} placeholder="26.847" /></Field>
            <Field label={T.longitude}><input inputMode="decimal" className={inputClass} value={v.longitude} onChange={(e) => upd("longitude", e.target.value)} placeholder="80.947" /></Field>
          </div>
          <p className="mt-2 text-xs text-muted">{T.locationHint}</p>
        </fieldset>
      </form>
    </Drawer>
  );
}
