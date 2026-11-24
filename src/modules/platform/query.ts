import { z } from "zod";
// Shared list parameters. Every list is paginated and sorted on the server.
export const listQuery = z.object({
  q: z.string().max(200).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 25, 50].includes(n)).default(10),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  year: z.string().max(20).optional(),
  unit: z.string().max(40).optional(),
  institution: z.string().max(40).optional(),
  status: z.string().max(30).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;
export const parseList = (params: URLSearchParams | Record<string, string | undefined>) =>
  listQuery.parse(
    Object.fromEntries(
      Object.entries(params instanceof URLSearchParams ? Object.fromEntries(params) : params).filter(
        ([, v]) => v !== undefined && v !== "",
      ),
    ),
  );
// "a, b c" -> ["a", "b c"]: comma-separated terms, every term must match.
export const terms = (q: string) =>
  q
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
// Parses a datetime-local value entered in India Standard Time.
export const istDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .transform((v) => new Date(`${v}:00+05:30`))
  .refine((d) => !Number.isNaN(d.getTime()), "Invalid date and time");
export const istParts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return { date: `${v("year")}-${v("month")}-${v("day")}`, hour: Number(v("hour")), minute: Number(v("minute")) };
};
export const page = <T>(rows: T[], total: number, q: ListQuery) => ({
  rows,
  total,
  page: q.page,
  pageSize: q.pageSize,
  pages: Math.max(1, Math.ceil(total / q.pageSize)),
});
