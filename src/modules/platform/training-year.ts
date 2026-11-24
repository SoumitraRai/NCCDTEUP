import { db } from "@/server/db";
import { AppError } from "@/server/authorization";
export type TrainingYear = { label: string; startsOn: Date; endsOn: Date };
export const istDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
export async function trainingYears() {
  return db.trainingYear.findMany({ orderBy: { startsOn: "desc" } });
}
// Resolves ?year=<label>, defaulting to the year containing today (IST).
export async function resolveTrainingYear(label?: string | null) {
  const years = await trainingYears();
  if (!years.length) throw new AppError(500, "No training years configured.");
  if (label) {
    const year = years.find((y) => y.label === label);
    if (!year) throw new AppError(400, "Unknown training year.");
    return { year, years };
  }
  const today = istDate();
  const year =
    years.find(
      (y) =>
        y.startsOn.toISOString().slice(0, 10) <= today &&
        y.endsOn.toISOString().slice(0, 10) >= today,
    ) ?? years[0];
  return { year, years };
}
// Half-open UTC range covering the year from 00:00 IST on its first day to
// the end of its last IST day.
export const yearRange = (y: TrainingYear) => ({
  gte: new Date(y.startsOn.getTime() - 330 * 60_000),
  lt: new Date(y.endsOn.getTime() + 86_400_000 - 330 * 60_000),
});
