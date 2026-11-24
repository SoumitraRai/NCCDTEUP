import { z } from "zod";
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const claimInput = z
  .object({
    institutionId: z.string().min(1),
    kind: z.enum(["REFRESHMENT", "HONORARIUM"]),
    category: z.string().min(1).max(60),
    periodStart: dateOnly,
    periodEnd: dateOnly,
    attendance: z.number().int().min(0).max(1000),
    sessions: z.number().int().min(1).max(100),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type ClaimInput = z.infer<typeof claimInput>;
export type Policy = {
  id: string;
  version: number;
  kind: string;
  category: string;
  effectiveFrom: Date;
  effectiveTo: Date;
  ratePaise: bigint;
  capPaise: bigint;
  partialMonthRule: string;
  approved: boolean;
  synthetic: boolean;
};
const day = 86400000;
export function calculate(
  input: ClaimInput,
  policies: Policy[],
  production = false,
  today = new Date(),
) {
  claimInput.parse(input);
  const start = new Date(input.periodStart),
    end = new Date(input.periodEnd);
  if (end < start || end.getTime() - start.getTime() > 366 * day)
    throw new Error("Choose a valid period of at most 367 days.");
  if (
    end.toISOString().slice(0, 10) >
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(today)
  )
    throw new Error("Future claims are not allowed.");
  const matching = policies.filter(
    (p) =>
      p.kind === input.kind &&
      p.category === input.category &&
      p.approved &&
      (!production || !p.synthetic),
  );
  let total = 0n;
  const segments: {
    date: string;
    policyId: string;
    version: number;
    paise: string;
  }[] = [];
  if (input.kind === "REFRESHMENT" && start.getTime() !== end.getTime())
    throw new Error("Refreshment claims must identify one event date.");
  for (let t = start.getTime(); t <= end.getTime(); t += day) {
    const date = new Date(t),
      active = matching.filter(
        (p) => p.effectiveFrom.getTime() <= t && p.effectiveTo.getTime() >= t,
      );
    if (active.length !== 1)
      throw new Error(
        "Exactly one approved policy must cover each date and category.",
      );
    const p = active[0];
    if (p.ratePaise <= 0n || p.capPaise <= 0n)
      throw new Error("Invalid policy values.");
    let amount: bigint;
    if (input.kind === "REFRESHMENT") {
      if (!input.attendance) throw new Error("Attendance must be positive.");
      amount = BigInt(input.attendance) * p.ratePaise * BigInt(input.sessions);
    } else {
      if (p.partialMonthRule !== "ACTUAL_DAYS_HALF_UP_DAILY")
        throw new Error("An explicit partial-month rule is required.");
      const days = BigInt(
        new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate(),
      );
      amount = (p.ratePaise * 2n + days) / (2n * days);
    }
    total += amount;
    if (total > p.capPaise) throw new Error("Policy cap exceeded.");
    segments.push({
      date: date.toISOString().slice(0, 10),
      policyId: p.id,
      version: p.version,
      paise: amount.toString(),
    });
  }
  return {
    totalPaise: total,
    snapshot: {
      inputs: input,
      rounding: "HALF_UP_DAILY",
      segments,
      totalPaise: total.toString(),
      synthetic: matching.some((p) => p.synthetic),
    },
  };
}
export function paymentBalance(total: bigint, paid: bigint, amount: bigint) {
  const next = paid + amount;
  if (!amount || next < 0n || next > total)
    throw new Error("Payment would exceed the approved balance.");
  return {
    paidPaise: next,
    state: next === total ? "PAID" : next > 0n ? "PARTIALLY_PAID" : "APPROVED",
  };
}
export function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
