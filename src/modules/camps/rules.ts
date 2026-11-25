import { AppError } from "@/server/authorization";
// Camp rules (docs/superpowers/specs/2026-11-25-camps-design.md). The
// 15-day report deadline was confirmed by the user (2026-11-25); the 30-day
// camp limit is still a development default.
export const CAMP_DEFAULTS = { reportDueDays: 15 } as const;
const DAY = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
export type CampState = "UPCOMING" | "CURRENT" | "COMPLETED" | "CANCELLED";
// Dates are YYYY-MM-DD; `today` is the IST date (istDate()).
export function campState(c: { status: string; start: string; end: string }, today: string): CampState {
  if (c.status === "CANCELLED") return "CANCELLED";
  return today < c.start ? "UPCOMING" : today > c.end ? "COMPLETED" : "CURRENT";
}
// Both dates count.
export const campDays = (start: string, end: string) => Math.round((utc(end) - utc(start)) / DAY) + 1;
export const reportDueDate = (end: string) => new Date(utc(end) + CAMP_DEFAULTS.reportDueDays * DAY).toISOString().slice(0, 10);
// Where a camp's report stands. DUE and OVERDUE are for completed camps
// with nothing submitted (or a returned report not yet sent again).
export type ReportState = "NOT_YET" | "DUE" | "OVERDUE" | "SUBMITTED" | "ACCEPTED" | "RETURNED";
export function reportState(c: { status: string; start: string; end: string; reportStatus: string }, today: string): ReportState {
  if (c.reportStatus === "SUBMITTED" || c.reportStatus === "ACCEPTED" || c.reportStatus === "RETURNED") return c.reportStatus;
  if (campState(c, today) !== "COMPLETED") return "NOT_YET";
  return today > reportDueDate(c.end) ? "OVERDUE" : "DUE";
}
export function checkPlan(p: { start: string; end: string; plannedStrength: number; seats: { unitId: string; seats: number }[]; hostUnitId: string }) {
  if (p.end < p.start) throw new AppError(400, "The camp must end on or after its start.");
  if (campDays(p.start, p.end) > 30) throw new AppError(400, "A camp can last at most 30 days.");
  if (new Set(p.seats.map((s) => s.unitId)).size !== p.seats.length) throw new AppError(400, "List each unit once.");
  if (!p.seats.some((s) => s.unitId === p.hostUnitId)) throw new AppError(400, "Give the host unit its seats.");
  const total = p.seats.reduce((n, s) => n + s.seats, 0);
  if (total > p.plannedStrength) throw new AppError(400, `Seats allocated (${total}) are more than the planned strength (${p.plannedStrength}).`);
  return total;
}
