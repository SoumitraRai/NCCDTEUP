"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { unitStrength } from "@/modules/camps/enrolment";
import { Alert, Button, Drawer, api, inputClass, useQueryState } from "./ui";
import { useT } from "./i18n-client";
type Data = Awaited<ReturnType<typeof unitStrength>>;
const TYPES = ["JD", "JW", "SD", "SW"] as const;
type Kind = "authorised" | "enrolled";
type Grid = Record<string, Record<Kind, Record<(typeof TYPES)[number], string>>>;
const sum = (c: Record<string, string | number>) => TYPES.reduce((n, t) => n + (Number(c[t]) || 0), 0);
// A unit's institutions with authorised and enrolled cadets per type. The
// unit's CO or AO edits and saves them all at once; others read them.
export function StrengthForm({ data }: { data: Data }) {
  const router = useRouter();
  const { set } = useQueryState();
  const t = useT().camps;
  const [grid, setGrid] = useState<Grid>(() =>
    Object.fromEntries(data.institutions.map((i) => [i.id, { authorised: Object.fromEntries(TYPES.map((k) => [k, String(i.authorised[k])])), enrolled: Object.fromEntries(TYPES.map((k) => [k, String(i.enrolled[k])])) }])) as Grid,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`camps/strength/${data.unit.id}`, "PUT", {
        year: data.year,
        rows: data.institutions.map((i) => ({ institutionId: i.id, version: i.version, authorised: grid[i.id].authorised, enrolled: grid[i.id].enrolled })),
      });
      set({ strength: null });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };
  const kinds: [Kind, string][] = [["authorised", t.authorised], ["enrolled", t.enrolled]];
  return (
    <Drawer
      title={t.strengthTitle(data.unit.name)}
      closeKeys={["strength"]}
      footer={data.canEdit && data.institutions.length > 0 ? <div className="flex justify-end"><Button variant="primary" busy={busy} onClick={save}>{t.saveStrength}</Button></div> : undefined}
    >
      <div className="space-y-5">
        <p className="text-[13.5px] text-muted">{t.formIntro(data.year)} {data.canEdit ? "" : t.enteredByUnit}</p>
        <p className="text-xs text-muted">{t.typeLegend}</p>
        {error && <Alert>{error}</Alert>}
        {data.institutions.length === 0 && <p className="text-[13.5px]">{t.noInstitutions}</p>}
        {data.institutions.map((i) => (
          <section key={i.id} aria-labelledby={`i-${i.id}`} className="rounded-lg border">
            <h3 id={`i-${i.id}`} className="border-b bg-surface-2 px-4 py-2 text-[13.5px] font-semibold">{i.name}</h3>
            <table className="w-full table-fixed text-[13.5px]">
              <thead className="text-[12.5px] text-muted">
                <tr>
                  <th className="w-[26%] px-3 py-1.5 text-left font-medium"><span className="sr-only">{t.institution}</span></th>
                  {TYPES.map((k) => <th key={k} className="px-1 py-1.5 text-right font-medium">{k}</th>)}
                  <th className="px-3 py-1.5 text-right font-medium">{t.total}</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map(([kind, label]) => (
                  <tr key={kind} className="border-t">
                    <th scope="row" className="px-3 py-1.5 text-left font-medium">{label}</th>
                    {TYPES.map((k) => (
                      <td key={k} className="px-1 py-1.5 text-right tabular-nums">
                        {data.canEdit ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={10000}
                            aria-label={t.countLabel(label, k, i.name)}
                            className={`${inputClass} px-2 text-right`}
                            value={grid[i.id][kind][k]}
                            onChange={(e) => setGrid({ ...grid, [i.id]: { ...grid[i.id], [kind]: { ...grid[i.id][kind], [k]: e.target.value } } })}
                          />
                        ) : (
                          i[kind][k]
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">{sum(grid[i.id][kind])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
