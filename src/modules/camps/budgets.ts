import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, type Actor } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { cancelRequest, decide, openRequest, pendingWhere, timeline, type Chain } from "@/modules/approvals/engine";
import { terms } from "@/modules/platform/query";
import { istDate, resolveTrainingYear } from "@/modules/platform/training-year";
import { campDays, campState } from "./rules";
import { HEAD_NAMES, HEADS, STAGES, reference, rupees, stageClosed, type Head, type Stage } from "./budget-rules";
import { campScope, handles } from "./access";
// Camp budgets (docs/superpowers/specs/2026-11-25-camp-budgets-design.md).
type Tx = Prisma.TransactionClient;
const WORKFLOW = "CAMP_BUDGET";
const serializable = { isolationLevel: "Serializable" as const };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const OPEN = ["PENDING", "RETURNED", "APPROVED"];
// Dated reference rates per head on the camp's start date; synthetic
// fixtures never count in production.
async function rates(on: Date) {
  const rows = await db.financialRatePolicy.findMany({
    where: { kind: "CAMP", approved: true, effectiveFrom: { lte: on }, effectiveTo: { gte: on }, ...(process.env.APP_MODE === "production" ? { synthetic: false } : {}) },
    orderBy: { version: "desc" },
  });
  const by = new Map<string, bigint>();
  for (const r of rows) if (!by.has(r.category)) by.set(r.category, r.ratePaise);
  return { by, synthetic: rows.some((r) => r.synthetic) };
}
const count = z.coerce.number({ error: "Enter a number." }).int("Enter a whole number.").min(0, "Numbers cannot be negative.").max(10000, "Numbers must be at most 10000.");
const line = z.object({ head: z.enum(HEAD_NAMES as [Head, ...Head[]]), quantity: count.nullable().default(null), amount: rupees, note: z.string().trim().max(300, "Keep the note under 300 characters.").default("") }).strict();
// One amount demanded; the lines (heads) are an optional breakup that must
// add up to it when given (user, 2026-11-25).
export const budgetFields = {
  amount: rupees.refine((p) => p > 0n, "Enter the amount demanded."),
  cadets: count,
  anos: count,
  staff: count,
  note: z.string().trim().max(1000, "Keep the note under 1000 characters.").default(""),
  lines: z.array(line).max(HEADS.length).default([]),
};
const basis = budgetFields;
const createInput = z.object({ campId: z.string().min(1).max(40), stage: z.enum(STAGES), ...basis }).strict();
const resubmitInput = z.object({ ...basis, version: z.number().int().positive() }).strict();
const versionInput = z.object({ version: z.number().int().positive() }).strict();
const decideInput = z
  .object({ decision: z.enum(["RECOMMEND", "NOT_RECOMMEND", "APPROVE", "RETURN", "REJECT"]), remarks: z.string().trim().max(1000).default(""), sanctioned: rupees.optional(), version: z.number().int().positive() })
  .strict();
// Keeps the heads that carry an amount; when any do, they must add up to
// the amount demanded.
const breakup = (amount: bigint, all: z.infer<typeof line>[]) => {
  if (new Set(all.map((l) => l.head)).size !== all.length) throw new AppError(400, "List each head once.");
  const lines = all.filter((l) => l.amount > 0n);
  const sum = lines.reduce((n, l) => n + l.amount, 0n);
  if (lines.length && sum !== amount) throw new AppError(400, `The breakup adds up to ${rupeesText(sum)}, not the ${rupeesText(amount)} demanded.`);
  return lines;
};
const rupeesText = (p: bigint) => `₹${p / 100n}${p % 100n ? `.${(p % 100n).toString().padStart(2, "0")}` : ""}`;
async function visibleCamp(actor: Actor, campId: string, tx: Tx | typeof db = db) {
  const camp = await tx.camp.findFirst({ where: { AND: [{ id: campId }, campScope(actor)] } });
  if (!camp) throw new AppError(404, "Camp not found.");
  return camp;
}
const stateOf = (c: { status: string; startDate: Date; endDate: Date }) => campState({ status: c.status, start: ymd(c.startDate), end: ymd(c.endDate) }, istDate());
const sanctionedStages = async (tx: Tx | typeof db, campId: string) =>
  Object.fromEntries((await tx.campBudget.findMany({ where: { campId, status: "APPROVED" }, select: { stage: true } })).map((b) => [b.stage, true])) as Partial<Record<Stage, boolean>>;
const snapshot = (b: { stage: string; cadets: number; anos: number; staff: number; days: number; demandedPaise: bigint; note: string }, lines: z.infer<typeof line>[]) => ({
  stage: b.stage,
  note: b.note,
  cadets: b.cadets,
  anos: b.anos,
  staff: b.staff,
  days: b.days,
  demandedPaise: b.demandedPaise.toString(),
  lines: lines.map((l) => ({ head: l.head, quantity: l.quantity, amountPaise: l.amount.toString(), note: l.note })),
});
const chainOf = (camp: { unitId: string; groupId: string; directorateId: string }): Chain => ({ level: "UNIT", institutionId: null, unitId: camp.unitId, groupId: camp.groupId, directorateId: camp.directorateId });
// A Gp Cdr's own budget starts at the DDG: nobody junior decides on it.
const startIndex = (actor: Actor, camp: { groupId: string }) =>
  actor.assignments.some((a) => a.appointmentCode === "GP_CDR" && a.level === "GROUP" && a.anchor.groupId === camp.groupId) ? 1 : 0;
export type BudgetInput = { stage: Stage; amount: bigint; cadets: number; anos: number; staff: number; note: string; lines: z.infer<typeof line>[] };
// Prepares and submits a budget for a camp inside the caller's transaction
// (also used when a camp is planned with its initial demand).
export async function prepareBudget(tx: Tx, actor: Actor, camp: { id: string; status: string; startDate: Date; endDate: Date; unitId: string; groupId: string; directorateId: string }, input: BudgetInput) {
  const lines = breakup(input.amount, input.lines);
  if (!handles(actor, camp)) throw new AppError(403, "Only the host unit or its group can prepare this camp's budget.");
  const closed = stageClosed(input.stage, stateOf(camp), await sanctionedStages(tx, camp.id));
  if (closed) throw new AppError(409, closed);
  if (await tx.campBudget.findFirst({ where: { campId: camp.id, stage: input.stage, status: { in: OPEN } } })) throw new AppError(409, "This stage already has a budget.");
  let budget = await tx.campBudget.create({
    data: {
      campId: camp.id,
      stage: input.stage,
      cadets: input.cadets,
      anos: input.anos,
      staff: input.staff,
      days: campDays(ymd(camp.startDate), ymd(camp.endDate)),
      demandedPaise: input.amount,
      note: input.note,
      createdById: actor.id,
      lines: { create: lines.map((l) => ({ head: l.head, quantity: l.quantity, amountPaise: l.amount, note: l.note })) },
    },
  });
  await tx.campBudgetSubmission.create({ data: { budgetId: budget.id, cycle: 1, snapshot: snapshot(budget, lines) } });
  const req = await openRequest(tx, { workflow: WORKFLOW, resourceId: budget.id, requesterId: actor.id, chain: chainOf(camp), startIndex: startIndex(actor, camp) });
  if (req.status !== budget.status) budget = await tx.campBudget.update({ where: { id: budget.id }, data: { status: req.status } });
  await audit(tx, actor.id, "camp.budget.submitted", budget.id, { campId: camp.id, stage: budget.stage, demandedPaise: input.amount.toString() });
  return { id: budget.id, status: budget.status };
}
export async function createBudget(actor: Actor, raw: unknown) {
  const { campId, ...input } = createInput.parse(raw);
  return db.$transaction(async (tx) => prepareBudget(tx, actor, await visibleCamp(actor, campId, tx), input), serializable);
}
// Loads a budget for a change by its preparer at the version they saw.
async function forPreparer(tx: Tx, actor: Actor, id: string, version: number) {
  const budget = await tx.campBudget.findFirst({ where: { id, camp: campScope(actor) }, include: { camp: true } });
  if (!budget) throw new AppError(404, "Budget not found.");
  if (budget.createdById !== actor.id) throw new AppError(403, "Only the officer who prepared this budget can change it.");
  if (budget.version !== version) throw new AppError(409, "This budget changed. Refresh and try again.");
  return budget;
}
const bump = async (tx: Tx, b: { id: string; version: number }, data: Prisma.CampBudgetUpdateManyMutationInput) => {
  const updated = await tx.campBudget.updateMany({ where: { id: b.id, version: b.version }, data: { ...data, version: { increment: 1 } } });
  if (!updated.count) throw new AppError(409, "This budget changed. Refresh and try again.");
};
export async function resubmitBudget(actor: Actor, id: string, raw: unknown) {
  const input = resubmitInput.parse(raw);
  const lines = breakup(input.amount, input.lines);
  const total = input.amount;
  return db.$transaction(async (tx) => {
    const b = await forPreparer(tx, actor, id, input.version);
    if (b.status !== "RETURNED") throw new AppError(409, "Only a returned budget can be edited.");
    await bump(tx, b, { cadets: input.cadets, anos: input.anos, staff: input.staff, demandedPaise: total, note: input.note });
    await tx.campBudgetLine.deleteMany({ where: { budgetId: id } });
    await tx.campBudgetLine.createMany({ data: lines.map((l) => ({ budgetId: id, head: l.head, quantity: l.quantity, amountPaise: l.amount, note: l.note })) });
    const req = await openRequest(tx, { workflow: WORKFLOW, resourceId: id, requesterId: actor.id, chain: chainOf(b.camp) });
    await tx.campBudget.update({ where: { id }, data: { status: req.status } });
    await tx.campBudgetSubmission.create({ data: { budgetId: id, cycle: req.cycle, snapshot: snapshot({ ...b, cadets: input.cadets, anos: input.anos, staff: input.staff, demandedPaise: total, note: input.note }, lines) } });
    await audit(tx, actor.id, "camp.budget.resubmitted", id, { cycle: req.cycle, demandedPaise: total.toString() });
    return { id, status: req.status, version: input.version + 1 };
  }, serializable);
}
export async function cancelBudget(actor: Actor, id: string, raw: unknown) {
  const input = versionInput.parse(raw);
  return db.$transaction(async (tx) => {
    const b = await forPreparer(tx, actor, id, input.version);
    if (!["PENDING", "RETURNED"].includes(b.status)) throw new AppError(409, "This budget can no longer be cancelled.");
    await cancelRequest(tx, WORKFLOW, id, actor.id);
    await bump(tx, b, { status: "CANCELLED" });
    await audit(tx, actor.id, "camp.budget.cancelled", id);
    return { id, status: "CANCELLED", version: input.version + 1 };
  }, serializable);
}
// The holder of the current step decides; the DDG's approval sanctions an
// amount up to the demand (the full demand when none is given).
export async function decideBudget(actor: Actor, id: string, raw: unknown) {
  const input = decideInput.parse(raw);
  return db.$transaction(async (tx) => {
    const b = await tx.campBudget.findFirst({ where: { id, camp: campScope(actor) } });
    if (!b) throw new AppError(404, "Budget not found.");
    if (b.version !== input.version) throw new AppError(409, "This budget changed. Refresh and try again.");
    const sanctioned = input.sanctioned ?? b.demandedPaise;
    if (input.decision === "APPROVE" && (sanctioned <= 0n || sanctioned > b.demandedPaise)) throw new AppError(400, "Sanction an amount above zero and up to the amount demanded.");
    const req = await decide(tx, actor, { workflow: WORKFLOW, resourceId: id, decision: input.decision, remarks: input.remarks });
    await bump(tx, b, { status: req.status, ...(req.status === "APPROVED" ? { sanctionedPaise: sanctioned } : {}) });
    await audit(tx, actor.id, "camp.budget.decided", id, { decision: input.decision, stage: req.stageIndex, ...(req.status === "APPROVED" ? { sanctionedPaise: sanctioned.toString() } : {}) });
    return { id, status: req.status, version: input.version + 1 };
  }, serializable);
}
const include = { camp: { include: { unit: { select: { name: true } }, group: { select: { name: true } } } }, lines: true } satisfies Prisma.CampBudgetInclude;
type Row = Prisma.CampBudgetGetPayload<{ include: typeof include }>;
async function present(actor: Actor, rows: Row[]) {
  const requests = await db.approvalRequest.findMany({ where: { workflow: WORKFLOW, resourceId: { in: rows.map((r) => r.id) } } });
  const byId = new Map(requests.map((r) => [r.resourceId, r]));
  return rows.map((r) => ({
    id: r.id,
    campId: r.campId,
    catcNo: r.camp.catcNo,
    location: r.camp.location,
    unit: r.camp.unit.name,
    group: r.camp.group.name,
    start: ymd(r.camp.startDate),
    end: ymd(r.camp.endDate),
    stage: r.stage as Stage,
    status: r.status,
    version: r.version,
    cadets: r.cadets,
    anos: r.anos,
    staff: r.staff,
    days: r.days,
    demandedPaise: r.demandedPaise.toString(),
    sanctionedPaise: r.sanctionedPaise?.toString() ?? null,
    note: r.note,
    lines: Object.fromEntries(r.lines.map((l) => [l.head, { quantity: l.quantity, amountPaise: l.amountPaise.toString(), note: l.note }])) as Partial<Record<Head, { quantity: number | null; amountPaise: string; note: string }>>,
    createdAt: r.createdAt,
    mine: r.createdById === actor.id,
    returnedToMe: r.status === "RETURNED" && r.createdById === actor.id,
    stageIndex: byId.get(r.id)?.stageIndex ?? 0,
    startIndex: byId.get(r.id)?.startIndex ?? 0,
    waitingSince: byId.get(r.id)?.updatedAt ?? r.updatedAt,
  }));
}
export type BudgetRow = Awaited<ReturnType<typeof present>>[number];
const awaitingMe = async (actor: Actor) =>
  (await db.approvalRequest.findMany({ where: { AND: [await pendingWhere(actor), { workflow: WORKFLOW }] }, select: { resourceId: true } })).map((r) => r.resourceId);
export const BUDGET_QUEUES = ["pending", "process", "disposed", "due"] as const;
export type BudgetQueue = (typeof BUDGET_QUEUES)[number];
// Budgets of the year's camps in scope, by queue, with counts and the
// completed camps still owing a sanctioned final budget ("due").
export async function listBudgets(actor: Actor, f: { year?: string; q?: string; queue: BudgetQueue }) {
  const { year } = await resolveTrainingYear(f.year);
  const search = terms(f.q ?? "").map((t) => ({ camp: { OR: [{ catcNo: { contains: t, mode: "insensitive" as const } }, { location: { contains: t, mode: "insensitive" as const } }, { unit: { name: { contains: t, mode: "insensitive" as const } } }] } }));
  const base: Prisma.CampBudgetWhereInput[] = [{ camp: { AND: [campScope(actor), { trainingYear: year.label }] } }, ...search];
  const mine = await awaitingMe(actor);
  const queues: Record<Exclude<BudgetQueue, "due">, Prisma.CampBudgetWhereInput> = {
    pending: { id: { in: mine } },
    process: { status: { in: ["PENDING", "RETURNED"] } },
    disposed: { status: { in: ["APPROVED", "REJECTED", "CANCELLED"] } },
  };
  const today = istDate();
  const completed = await db.camp.findMany({
    where: { AND: [campScope(actor), { trainingYear: year.label, status: "PLANNED", endDate: { lt: new Date(`${today}T00:00:00Z`) } }] },
    include: { unit: { select: { name: true } }, group: { select: { name: true } }, budgets: { where: { status: { in: OPEN } }, select: { stage: true, status: true } } },
    orderBy: { endDate: "asc" },
  });
  const due = completed
    .filter((c) => !c.budgets.some((b) => b.stage === "FINAL" && b.status === "APPROVED"))
    .map((c) => ({ id: c.id, catcNo: c.catcNo, location: c.location, unit: c.unit.name, group: c.group.name, end: ymd(c.endDate), daysSince: Math.round((Date.parse(today) - c.endDate.getTime()) / 86_400_000), final: c.budgets.find((b) => b.stage === "FINAL")?.status ?? null }));
  const count = (k: Exclude<BudgetQueue, "due">) => db.campBudget.count({ where: { AND: [...base, queues[k]] } });
  const [rows, pending, process, disposed, sanctioned] = await Promise.all([
    f.queue === "due" ? [] : db.campBudget.findMany({ where: { AND: [...base, queues[f.queue]] }, include, orderBy: { createdAt: f.queue === "disposed" ? "desc" : "asc" }, take: 200 }),
    count("pending"),
    count("process"),
    count("disposed"),
    db.campBudget.aggregate({ where: { AND: [...base, { status: "APPROVED", stage: "INITIAL" }] }, _sum: { sanctionedPaise: true } }),
  ]);
  return {
    year: year.label,
    rows: await present(actor, rows),
    due,
    counts: { pending, process, disposed, due: due.length },
    initialSanctionedPaise: (sanctioned._sum.sanctionedPaise ?? 0n).toString(),
  };
}
// Everything about one camp's budgets: each stage side by side (the open
// budget, else the latest), the route, what may be prepared now and the
// reference figures for the form.
export async function getCampBudgets(actor: Actor, campId: string) {
  const camp = await visibleCamp(actor, campId);
  const all = await db.campBudget.findMany({ where: { campId }, include, orderBy: { createdAt: "asc" } });
  const shown = await present(actor, all);
  const mine = new Set(await awaitingMe(actor));
  const sanctioned = Object.fromEntries(shown.filter((b) => b.status === "APPROVED").map((b) => [b.stage, true])) as Partial<Record<Stage, boolean>>;
  const state = stateOf(camp);
  const { by, synthetic } = await rates(camp.startDate);
  const seats = await db.campAllocation.findMany({ where: { campId }, select: { seats: true, attended: true } });
  const stages = await Promise.all(
    STAGES.map(async (stage) => {
      const list = shown.filter((b) => b.stage === stage);
      const b = list.find((x) => OPEN.includes(x.status)) ?? list.at(-1) ?? null;
      const host = handles(actor, camp);
      const closed = stageClosed(stage, state, sanctioned);
      return {
        stage,
        budget: b && {
          ...b,
          route: await timeline(WORKFLOW, b.id),
          submissions: (await db.campBudgetSubmission.findMany({ where: { budgetId: b.id }, orderBy: { cycle: "asc" } })).map((s) => ({ cycle: s.cycle, at: s.createdAt, snapshot: s.snapshot })),
          canDecide: mine.has(b.id),
          canEdit: b.mine && b.status === "RETURNED",
          canCancel: b.mine && ["PENDING", "RETURNED"].includes(b.status),
        },
        canPrepare: host && !closed && !(b && OPEN.includes(b.status)),
        closed,
      };
    }),
  );
  const references = Object.fromEntries(HEADS.map((h) => [h.head, by.get(h.head)?.toString() ?? null])) as Record<Head, string | null>;
  return {
    camp: { id: camp.id, catcNo: camp.catcNo, location: camp.location, start: ymd(camp.startDate), end: ymd(camp.endDate), state, days: campDays(ymd(camp.startDate), ymd(camp.endDate)) },
    stages,
    rates: references,
    syntheticRates: synthetic,
    // Form defaults: seats before the camp, attendance for the final budget.
    defaults: { cadets: seats.reduce((n, s) => n + s.seats, 0), attended: seats.some((s) => s.attended !== null) ? seats.reduce((n, s) => n + (s.attended ?? 0), 0) : null },
  };
}
// Reference figure for one head of a budget, in paise (null without a rate).
export const referenceFor = (head: Head, b: { cadets: number; anos: number; staff: number; days: number }, quantity: number | null, rate: string | null) =>
  reference(head, { ...b, litres: quantity }, rate === null ? undefined : BigInt(rate));
// Budgets awaiting this actor, oldest first (Pending for me, Overview).
export async function budgetInbox(actor: Actor) {
  const ids = await awaitingMe(actor);
  if (!ids.length) return [];
  const rows = await db.campBudget.findMany({ where: { id: { in: ids }, camp: campScope(actor) }, include });
  return (await present(actor, rows)).sort((a, b) => +a.waitingSince - +b.waitingSince);
}
