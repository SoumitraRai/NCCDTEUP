import { AppError, type Assignment } from "@/server/authorization";
// Temporary duty rules (docs/superpowers/specs/2026-11-24-movement-td-design.md).
// Development defaults, not NCC policy (spec 2026-11-24): the directorate
// will supply the real day-count and notice rules.
export const TD_DEFAULTS = { noticeDays: 2 } as const;
export type Half = "FN" | "AN";
const DAY = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
// Both dates count; starting in the afternoon or returning in the forenoon
// makes that day a half. Returned in half-days.
export function tdHalfDays(start: { date: string; half: Half }, end: { date: string; half: Half }) {
  const days = (utc(end.date) - utc(start.date)) / DAY + 1;
  const halves = 2 * days - (start.half === "AN" ? 1 : 0) - (end.half === "FN" ? 1 : 0);
  if (!Number.isFinite(halves) || halves <= 0) throw new AppError(400, "The return must be after the start.");
  return halves;
}
// `today` is the IST date (istDate()).
export function checkNotice(startDate: string, today: string) {
  if (utc(startDate) < utc(today) + TD_DEFAULTS.noticeDays * DAY)
    throw new AppError(400, "Request temporary duty at least 2 days ahead.");
}
// The highest TD step a person holds: Gp Cdr 1, Branch (movement duty) 2,
// Director 3, DDG 4, ADG 5; anyone else 0.
const postLevel: Record<string, number> = { GP_CDR: 1, DIR: 3, DDG: 4, ADG: 5 };
export function chainLevel(assignments: Assignment[]) {
  let level = 0;
  for (const a of assignments) {
    level = Math.max(level, (a.appointmentCode && postLevel[a.appointmentCode]) || 0);
    if (a.level === "DIRECTORATE" && a.capabilities.includes("movement")) level = Math.max(level, 2);
  }
  return level;
}
// The TD starts one step above the more senior of creator and traveller, and
// never at the Gp Cdr for a directorate-level traveller. A typed-in traveller
// (no account) passes []. Equal to the chain's length means nobody above.
export function tdStartIndex(creator: Assignment[], traveller: Assignment[], travellerLevel: "UNIT" | "GROUP" | "DIRECTORATE") {
  const start = Math.max(chainLevel(creator), chainLevel(traveller));
  return travellerLevel === "DIRECTORATE" ? Math.max(start, 1) : start;
}
