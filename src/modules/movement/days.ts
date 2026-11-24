// TD day count, safe to import in the browser for the form's preview.
// Development default, not NCC policy (see rules.ts).
export type Half = "FN" | "AN";
const DAY = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
// Both dates count; starting in the afternoon or returning in the forenoon
// makes that day a half. Returned in half-days; 0 or less (or NaN) is invalid.
export function halfDaysBetween(start: { date: string; half: Half }, end: { date: string; half: Half }) {
  const days = (utc(end.date) - utc(start.date)) / DAY + 1;
  return 2 * days - (start.half === "AN" ? 1 : 0) - (end.half === "FN" ? 1 : 0);
}
