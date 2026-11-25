import { AppError, type Assignment } from "@/server/authorization";
import { halfDaysBetween, type Half } from "./days";
// Temporary duty rules (docs/superpowers/specs/2026-11-24-movement-td-design.md).
// Development defaults, not NCC policy (spec 2026-11-24): the directorate
// will supply the real day-count and notice rules.
export const TD_DEFAULTS = { noticeDays: 2 } as const;
const DAY = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
export type { Half } from "./days";
export function tdHalfDays(start: { date: string; half: Half }, end: { date: string; half: Half }) {
  const halves = halfDaysBetween(start, end);
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
// Who may send whom (user, 2026-11-24): an officer post sends anyone in a
// formation below its own, and in its own formation only someone it outranks.
// In the directorate ADG > DDG > Director; in a group Gp Cdr > DGC; in a unit
// the CO. Every other officer ranks 0, so peers cannot send each other.
// A typed-in traveller (no account: PI, GCI, staff) is passed with no
// appointment and is junior to every officer of their formation (user,
// 2026-11-25), so an AO may send their unit's PI.
const sendRank: Record<string, number> = { ADG: 3, DDG: 2, DIR: 1, GP_CDR: 2, DGC: 1, CO: 1 };
const depth: Record<string, number> = { UNIT: 1, GROUP: 2, DIRECTORATE: 3 };
const formationKey = { 1: "unitId", 2: "groupId", 3: "directorateId" } as const;
type Post = Pick<Assignment, "level" | "appointmentCode" | "anchor">;
// The traveller's post lies in the sender's formation or below it.
export function within(sender: Post, traveller: Post) {
  const s = depth[sender.level];
  const k = s && formationKey[s as 1 | 2 | 3];
  return !!k && !!depth[traveller.level] && !!sender.anchor[k] && sender.anchor[k] === traveller.anchor[k];
}
export function canSend(sender: Post, traveller: Post) {
  if (!within(sender, traveller)) return false;
  if (depth[traveller.level] < depth[sender.level] || !traveller.appointmentCode) return true;
  const rank = (p: Post) => (p.appointmentCode && sendRank[p.appointmentCode]) || 0;
  return depth[traveller.level] === depth[sender.level] && rank(sender) > rank(traveller);
}
// The TD starts one step above the more senior of creator and traveller, and
// never at the Gp Cdr for a directorate-level traveller. A typed-in traveller
// (no account) passes []. Equal to the chain's length means nobody above.
export function tdStartIndex(creator: Assignment[], traveller: Assignment[], travellerLevel: "UNIT" | "GROUP" | "DIRECTORATE") {
  const start = Math.max(chainLevel(creator), chainLevel(traveller));
  return travellerLevel === "DIRECTORATE" ? Math.max(start, 1) : start;
}
