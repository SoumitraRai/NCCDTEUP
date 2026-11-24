"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Drawer, Field, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
type Target = { code: string; title: string; level: string; formations: { id: string; name: string }[] };
// Move an officer to another post or formation, or end their post. The
// server offers only posts the viewer may appoint to and checks again.
export function OfficerPostForm({ id, name, post, targets }: { id: string; name: string; post: string; targets: Target[] }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT().officers;
  const [action, setAction] = useState<"MOVE" | "END">(targets.length ? "MOVE" : "END");
  const [code, setCode] = useState("");
  const [formationId, setFormationId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formations = targets.find((p) => p.code === code)?.formations ?? [];
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`officers/${id}/post`, "POST", action === "MOVE" ? { action, appointmentCode: code, formationId, note } : { action, note });
      set({ manage: null, changed: action === "MOVE" ? "moved" : "ended" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={t.changeTitle(name)}
      closeKeys={["manage"]}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{action === "MOVE" ? t.moveHint : t.endHint}</p>
          <Button variant={action === "END" ? "danger" : "primary"} busy={busy} className="shrink-0" onClick={save}>{action === "MOVE" ? t.move : t.end}</Button>
        </div>
      }
    >
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {error && <Alert>{error}</Alert>}
        <p className="text-[13.5px]"><span className="text-muted">{t.current}: </span>{post}</p>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium">{t.whatChange}</legend>
          {(["MOVE", "END"] as const).map((a) => (
            <label key={a} className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13.5px] ${a === "MOVE" && !targets.length ? "opacity-60" : ""}`}>
              <input type="radio" name="action" value={a} checked={action === a} disabled={a === "MOVE" && !targets.length} onChange={() => setAction(a)} />
              {a === "MOVE" ? t.moveOption : t.endOption}
            </label>
          ))}
          {!targets.length && <p className="text-xs text-muted">{t.noTargets}</p>}
        </fieldset>
        {action === "MOVE" && (
          <>
            <Field label={t.newPost}>
              <select className={inputClass} value={code} onChange={(e) => { setCode(e.target.value); setFormationId(""); }}>
                <option value="">{t.choose}</option>
                {["UNIT", "GROUP", "DIRECTORATE"].map((l) => {
                  const here = targets.filter((p) => p.level === l);
                  return here.length ? (
                    <optgroup key={l} label={t.levels[l]}>
                      {here.map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </Field>
            <Field label={t.newFormation}>
              <select className={inputClass} value={formationId} disabled={!code} onChange={(e) => setFormationId(e.target.value)}>
                <option value="">{t.choose}</option>
                {formations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label={t.reason} hint={t.reasonHint}>
          <textarea rows={3} className={`${inputClass} h-auto py-2`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </form>
    </Drawer>
  );
}
