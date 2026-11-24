import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, claimScope, requireInstitution, type Actor } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { dateOnly } from "@/modules/finance/calculation";
import { pendingWhere, timeline } from "@/modules/approvals/engine";
import { resolveTrainingYear } from "@/modules/platform/training-year";
import { istDateTime, istParts, page, terms, type ListQuery } from "@/modules/platform/query";
import { decryptField, encryptField, maskPhone } from "@/server/crypto";
export type BillKind = "REFRESHMENT" | "HONORARIUM";
// Rupees as typed ("1500" or "1500.50") to exact paise, without floating point.
const rupees = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount in rupees, e.g. 1500")
  .transform((v) => {
    const [whole, frac = ""] = v.split(".");
    return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  })
  .refine((p) => p > 0n, "Amount must be positive.");
const common = {
  institutionId: z.string().min(1),
  category: z.string().min(1).max(60),
  instructorName: z.string().trim().min(2).max(120),
  instructorAppointment: z.enum(["ANO", "CTO"]),
  claimedRupees: rupees,
  idempotencyKey: z.string().uuid(),
};
export const refreshmentInput = z
  .object({
    ...common,
    trainingStart: istDateTime,
    trainingEnd: istDateTime,
    instructorMobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number."),
    cadetsPresent: z.number().int().min(1).max(1000),
    subjectIds: z.array(z.string()).min(1, "Choose at least one subject.").max(20),
    periods: z.number().int().min(1).max(10),
    paymentComments: z.string().max(500).default(""),
    visitId: z.string().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const s = istParts(v.trainingStart), e = istParts(v.trainingEnd);
    if (v.trainingEnd <= v.trainingStart) ctx.addIssue({ code: "custom", path: ["trainingEnd"], message: "End must be after start." });
    if (s.date !== e.date) ctx.addIssue({ code: "custom", path: ["trainingEnd"], message: "Training must start and end on the same day." });
    if (s.hour < 8 || e.hour > 18 || (e.hour === 18 && e.minute > 0))
      ctx.addIssue({ code: "custom", path: ["trainingStart"], message: "Training time must be between 08:00 and 18:00." });
    if (v.trainingEnd.getTime() > Date.now()) ctx.addIssue({ code: "custom", path: ["trainingEnd"], message: "Training cannot be in the future." });
  });
export const honorariumInput = z
  .object({
    ...common,
    instructorRank: z.string().trim().min(2).max(60),
    periodStart: dateOnly,
    periodEnd: dateOnly,
  })
  .strict()
  .refine((v) => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "End must not be before start." });
const staff = (actor: Actor) => ({ ...actor, assignments: actor.assignments.filter((a) => a.role !== "CADET") });
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1;
async function prepare(actor: Actor, institutionId: string, key: string) {
  if (!actor.assignments.some((a) => a.role !== "CADET")) throw new AppError(403, "Cadets cannot create bills.");
  await requireInstitution(staff(actor), institutionId, "edit");
  const existing = await db.claim.findUnique({ where: { idempotencyKey: key } });
  if (existing && existing.ownerId !== actor.id) throw new AppError(409, "Duplicate request.");
  return existing;
}
export async function createRefreshment(actor: Actor, raw: unknown) {
  const v = refreshmentInput.parse(raw);
  const existing = await prepare(actor, v.institutionId, v.idempotencyKey);
  if (existing) return existing;
  if ((await db.subject.count({ where: { id: { in: v.subjectIds }, active: true } })) !== new Set(v.subjectIds).size)
    throw new AppError(400, "Choose subjects from the list.");
  const day = new Date(istParts(v.trainingStart).date);
  return db.$transaction(
    async (tx) => {
      const claim = await tx.claim.create({
        data: {
          ownerId: actor.id,
          institutionId: v.institutionId,
          kind: "REFRESHMENT",
          category: v.category,
          periodStart: day,
          periodEnd: day,
          attendance: v.cadetsPresent,
          sessions: 1,
          claimedPaise: v.claimedRupees,
          idempotencyKey: v.idempotencyKey,
          refreshment: {
            create: {
              trainingStart: v.trainingStart,
              trainingEnd: v.trainingEnd,
              instructorName: v.instructorName,
              instructorAppointment: v.instructorAppointment,
              instructorMobileEnc: encryptField(v.instructorMobile),
              cadetsPresent: v.cadetsPresent,
              periods: v.periods,
              paymentComments: v.paymentComments,
              visitId: v.visitId,
              subjects: { connect: v.subjectIds.map((id) => ({ id })) },
            },
          },
        },
      });
      await audit(tx, actor.id, "bill.refreshment.draft", claim.id);
      return claim;
    },
    { isolationLevel: "Serializable" },
  );
}
export async function createHonorarium(actor: Actor, raw: unknown) {
  const v = honorariumInput.parse(raw);
  const existing = await prepare(actor, v.institutionId, v.idempotencyKey);
  if (existing) return existing;
  return db.$transaction(
    async (tx) => {
      const claim = await tx.claim.create({
        data: {
          ownerId: actor.id,
          institutionId: v.institutionId,
          kind: "HONORARIUM",
          category: v.category,
          periodStart: new Date(v.periodStart),
          periodEnd: new Date(v.periodEnd),
          attendance: 1,
          sessions: 1,
          claimedPaise: v.claimedRupees,
          idempotencyKey: v.idempotencyKey,
          honorarium: {
            create: {
              instructorName: v.instructorName,
              instructorRank: v.instructorRank,
              instructorAppointment: v.instructorAppointment,
              months: Math.max(1, Math.round(daysBetween(v.periodStart, v.periodEnd) / 30.4375)),
            },
          },
        },
      });
      await audit(tx, actor.id, "bill.honorarium.draft", claim.id);
      return claim;
    },
    { isolationLevel: "Serializable" },
  );
}
export async function categories(kind: BillKind) {
  const rows = await db.financialRatePolicy.findMany({
    where: { kind, approved: true, ...(process.env.APP_MODE === "production" ? { synthetic: false } : {}) },
    select: { category: true, synthetic: true },
    distinct: ["category"],
  });
  return rows;
}
async function billWhere(actor: Actor, kind: BillKind, q: ListQuery) {
  const { year } = await resolveTrainingYear(q.year);
  const and: Prisma.ClaimWhereInput[] = [
    claimScope(actor),
    { kind, periodStart: { gte: year.startsOn, lte: year.endsOn } },
    kind === "REFRESHMENT" ? { refreshment: { isNot: null } } : { honorarium: { isNot: null } },
  ];
  if (q.status) and.push({ state: q.status });
  if (q.unit) and.push({ institution: { unitId: q.unit } });
  for (const t of terms(q.q))
    and.push({
      OR: [
        { institution: { name: { contains: t, mode: "insensitive" } } },
        { institution: { unit: { name: { contains: t, mode: "insensitive" } } } },
        { refreshment: { instructorName: { contains: t, mode: "insensitive" } } },
        { honorarium: { instructorName: { contains: t, mode: "insensitive" } } },
      ],
    });
  return { where: { AND: and }, year };
}
const listInclude = {
  institution: { select: { id: true, name: true, district: true, unit: { select: { id: true, name: true, group: { select: { name: true } } } } } },
  refreshment: { include: { subjects: { select: { id: true, name: true } } } },
  honorarium: true,
} satisfies Prisma.ClaimInclude;
type BillRow = Prisma.ClaimGetPayload<{ include: typeof listInclude }>;
function present(c: BillRow, showMobile: boolean) {
  const { refreshment, idempotencyKey: _key, snapshot: _snapshot, ...rest } = c;
  void _key;
  void _snapshot;
  return {
    ...rest,
    refreshment: refreshment && {
      ...refreshment,
      instructorMobileEnc: undefined,
      instructorMobile: showMobile ? decryptField(refreshment.instructorMobileEnc) : maskPhone(decryptField(refreshment.instructorMobileEnc)),
    },
  };
}
export async function listBills(actor: Actor, kind: BillKind, q: ListQuery) {
  const { where, year } = await billWhere(actor, kind, q);
  const [rows, total] = await db.$transaction([
    db.claim.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: q.sort === "oldest" ? "asc" : "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.claim.count({ where }),
  ]);
  return { ...page(rows.map((r) => present(r, false)), total, q), year: year.label };
}
export async function getBill(actor: Actor, id: string) {
  const bill = await db.claim.findFirst({
    where: { AND: [{ id }, claimScope(actor)] },
    include: { ...listInclude, payments: { orderBy: { createdAt: "asc" } } },
  });
  if (!bill || (!bill.refreshment && !bill.honorarium)) throw new AppError(404, "Bill not found.");
  // The full mobile number is shown to the owner and to reviewers in scope.
  const reviewer = !!(await db.claim.count({ where: { AND: [{ id }, claimScope(actor, "review")] } }));
  const showMobile = !!bill.refreshment && (bill.ownerId === actor.id || reviewer);
  if (showMobile) await db.$transaction((tx) => audit(tx, actor.id, "bill.mobile.read", id));
  const attachments = await db.attachment.findMany({
    where: { resourceType: "claim", resourceId: id },
    select: { id: true, purpose: true, status: true, declaredType: true, size: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const { payments, ...rest } = bill;
  return {
    ...present(rest, showMobile),
    payments,
    attachments,
    entitlementPaise: (bill.snapshot as { entitlementPaise?: string } | null)?.entitlementPaise ?? null,
    approval: await timeline("BILL", id),
    isOwner: bill.ownerId === actor.id,
  };
}
// Bills submitted vs paid per unit, grouped by group, for the training year.
export async function billSummary(actor: Actor, kind: BillKind, label?: string) {
  const { where, year } = await billWhere(actor, kind, { q: "", page: 1, pageSize: 10, sort: "newest", year: label });
  const bills = await db.claim.findMany({
    where: { AND: [where, { state: { notIn: ["DRAFT", "CANCELLED"] } }] },
    select: { state: true, totalPaise: true, paidPaise: true, institution: { select: { unit: { select: { id: true, name: true, group: { select: { name: true } } } } } } },
  });
  const units = new Map<string, { unitId: string; unit: string; group: string; submitted: number; paid: number; claimedPaise: bigint; paidPaise: bigint }>();
  for (const b of bills) {
    const u = b.institution.unit;
    const row = units.get(u.id) ?? { unitId: u.id, unit: u.name, group: u.group.name, submitted: 0, paid: 0, claimedPaise: 0n, paidPaise: 0n };
    row.submitted++;
    if (b.state === "PAID") row.paid++;
    row.claimedPaise += b.totalPaise;
    row.paidPaise += b.paidPaise;
    units.set(u.id, row);
  }
  const rows = [...units.values()].sort((a, b) => a.group.localeCompare(b.group) || a.unit.localeCompare(b.unit));
  const count = (s: string[]) => bills.filter((b) => s.includes(b.state)).length;
  return {
    year: year.label,
    rows,
    totals: {
      submitted: bills.length,
      inReview: count(["SUBMITTED", "UNDER_REVIEW"]),
      approved: count(["APPROVED", "PARTIALLY_PAID"]),
      paid: count(["PAID"]),
      returned: count(["RETURNED"]),
      claimedPaise: bills.reduce((s, b) => s + b.totalPaise, 0n),
      paidPaise: bills.reduce((s, b) => s + b.paidPaise, 0n),
    },
  };
}
// Bills awaiting a decision by this actor.
export async function billInbox(actor: Actor) {
  const requests = await db.approvalRequest.findMany({
    where: { AND: [await pendingWhere(actor), { workflow: "BILL" }] },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  const bills = await db.claim.findMany({
    where: { AND: [{ id: { in: requests.map((r) => r.resourceId) } }, claimScope(actor, "review")] },
    include: listInclude,
  });
  const byId = new Map(bills.map((b) => [b.id, b]));
  return requests.flatMap((r) => {
    const b = byId.get(r.resourceId);
    return b ? [{ ...present(b, false), waitingSince: r.updatedAt, stageIndex: r.stageIndex }] : [];
  });
}
// The actor's own bills that need their attention: drafts and returns.
export async function myBillWork(actor: Actor) {
  const own = (state: string) =>
    db.claim.findMany({
      where: { ownerId: actor.id, state, kind: { in: ["REFRESHMENT", "HONORARIUM"] }, OR: [{ refreshment: { isNot: null } }, { honorarium: { isNot: null } }] },
      select: { id: true, kind: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
    });
  const [drafts, returned] = await Promise.all([own("DRAFT"), own("RETURNED")]);
  return { drafts, returned };
}
