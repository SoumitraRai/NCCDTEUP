import { z } from "zod";
import type { CampState } from "./rules";
// Camp budget rules (docs/superpowers/specs/2026-11-25-camp-budgets-design.md).
// The heads and the reference rates are provisional development fixtures.
export const STAGES = ["INITIAL", "REVISED", "FINAL"] as const;
export type Stage = (typeof STAGES)[number];
// `per` is what a reference rate multiplies: cadet-days, ANO-days,
// staff-days or litres. Heads without one are typed with no reference.
export const HEADS = [
  { head: "CADET_MESSING", per: "cadetDays" },
  { head: "ANO_DA", per: "anoDays" },
  { head: "STAFF_DA", per: "staffDays" },
  { head: "BUS_FARE" },
  { head: "FUEL_DIESEL", per: "litres" },
  { head: "FUEL_PETROL", per: "litres" },
  { head: "RANK_PAY" },
  { head: "CIVILIAN_TA" },
  { head: "INCIDENTAL" },
  { head: "MISC" },
] as const;
export type Head = (typeof HEADS)[number]["head"];
export const HEAD_NAMES = HEADS.map((h) => h.head) as Head[];
// Rupees as typed ("1500" or "1500.50") to exact paise; empty is 0.
export const rupees = z
  .string()
  .trim()
  .regex(/^(\d{1,9}(\.\d{1,2})?)?$/, "Enter an amount in rupees, e.g. 1500")
  .transform((v) => {
    if (!v) return 0n;
    const [whole, frac = ""] = v.split(".");
    return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  });
// Whether a stage may be prepared now, given the camp and the stages so far.
// Returns the reason it may not, or null.
export function stageClosed(stage: Stage, camp: CampState, sanctioned: Partial<Record<Stage, boolean>>): string | null {
  if (camp === "CANCELLED") return "This camp is cancelled.";
  // User, 2026-11-25: initial before the camp starts, revised before it ends.
  if (stage === "INITIAL") return camp === "UPCOMING" ? null : "The initial budget is prepared before the camp starts.";
  if (!sanctioned.INITIAL) return "The initial budget must be sanctioned first.";
  if (stage === "REVISED") return camp === "COMPLETED" ? "A revised budget is prepared before the camp ends." : null;
  return camp === "COMPLETED" ? null : "The final budget is prepared after the camp ends.";
}
// Reference figure for a head: quantity × the dated rate, or null where the
// head has no rate (typed only) or no rate is set.
export function reference(head: Head, basis: { cadets: number; anos: number; staff: number; days: number; litres?: number | null }, rate: bigint | undefined) {
  const h = HEADS.find((x) => x.head === head);
  const per = h && "per" in h ? h.per : undefined;
  if (!per || rate === undefined) return null;
  const n = per === "cadetDays" ? basis.cadets * basis.days : per === "anoDays" ? basis.anos * basis.days : per === "staffDays" ? basis.staff * basis.days : (basis.litres ?? 0);
  return BigInt(n) * rate;
}
