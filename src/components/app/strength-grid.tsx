"use client";
import type { institutionStrength } from "@/modules/camps/enrolment";
import { Drawer } from "./ui";
import { useT } from "./i18n-client";
export type Strength = Awaited<ReturnType<typeof institutionStrength>>;
export const TYPES = ["JD", "JW", "SD", "SW"] as const;
type Kind = "authorised" | "enrolled";
export type StrengthValues = Record<Kind, Record<(typeof TYPES)[number], string>>;
export const strengthValues = (s: Strength): StrengthValues => ({
  authorised: Object.fromEntries(TYPES.map((k) => [k, String(s.authorised[k])])) as StrengthValues["authorised"],
  enrolled: Object.fromEntries(TYPES.map((k) => [k, String(s.enrolled[k])])) as StrengthValues["enrolled"],
});
const sum = (c: Record<string, string>) => TYPES.reduce((n, t) => n + (Number(c[t]) || 0), 0);
// Authorised and enrolled cadets of one institution per type. With
// `onChange` the numbers are inputs (the unit's CO or AO), otherwise text.
export function StrengthGrid({ name, year, values, onChange }: { name: string; year: string; values: StrengthValues; onChange?: (v: StrengthValues) => void }) {
  const t = useT().camps;
  const kinds: [Kind, string][] = [["authorised", t.authorised], ["enrolled", t.enrolled]];
  return (
    <section aria-labelledby="strength-grid" className="rounded-lg border">
      <div className="border-b bg-surface-2 px-4 py-2">
        <h3 id="strength-grid" className="text-[13.5px] font-semibold">{t.strengthTitle(name)}</h3>
        <p className="text-xs text-muted">{t.formIntro(year)} {onChange ? "" : t.enteredByUnit}</p>
      </div>
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
                  {onChange ? (
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10000}
                      aria-label={t.countLabel(label, k, name)}
                      className="h-9 w-full rounded-md border bg-surface px-2 text-right text-[14px] focus:border-primary"
                      value={values[kind][k]}
                      onChange={(e) => onChange({ ...values, [kind]: { ...values[kind], [k]: e.target.value } })}
                    />
                  ) : (
                    values[kind][k]
                  )}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">{sum(values[kind])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-4 py-2 text-xs text-muted">{t.typeLegend}</p>
    </section>
  );
}
// Read-only sheet for those who may not edit the institution.
export function StrengthDetails({ data }: { data: Strength }) {
  return (
    <Drawer title={data.name} closeKeys={["details"]}>
      <div className="space-y-5">
        <p className="text-[13.5px] text-muted">{data.district} · {data.unit.name}</p>
        <StrengthGrid name={data.name} year={data.year} values={strengthValues(data)} />
      </div>
    </Drawer>
  );
}
