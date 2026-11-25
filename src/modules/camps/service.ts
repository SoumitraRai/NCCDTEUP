import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, actorById, type Actor, type Assignment } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { terms } from "@/modules/platform/query";
import { istDate, resolveTrainingYear } from "@/modules/platform/training-year";
import { canSend } from "@/modules/movement/rules";
import { entersFor, total, unitTotals } from "./enrolment";
import { DTE_ROLES, GROUP_ROLES, campScope, groupPost, handles, unitPost } from "./access";
import { budgetFields, prepareBudget } from "./budgets";
import { campDays, campState, checkPlan, reportDueDate, reportState, type CampState, type ReportState } from "./rules";
// Camps (docs/superpowers/specs/2026-11-25-camps-design.md).
export { campScope, handles } from "./access";
type Tx = Prisma.TransactionClient;
const serializable = { isolationLevel: "Serializable" as const };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
// Seniority is the TD rule (user, 2026-11-25): one may overrule, change or
// review another's work on a camp only if one outranks them (movement/rules
// canSend). `posts` are the other person's live posts tied to this camp.
const campPosts = async (userId: string, camp: { unitId: string; groupId: string }) =>
  (await actorById(userId).catch(() => ({ assignments: [] as Assignment[] }))).assignments.filter(
    (a) => (unitPost(a) && a.anchor.unitId === camp.unitId) || (groupPost(a) && a.anchor.groupId === camp.groupId),
  );
const outranks = (mine: Assignment[], theirs: Assignment[]) => mine.some((s) => theirs.every((p) => canSend(s, p)));
// Edit and cancel: the planner, or a host-unit or group officer senior to
// them. If the planner no longer holds a post here, any host or group officer.
async function changes(actor: Actor, camp: { unitId: string; groupId: string; createdById: string }) {
  if (!handles(actor, camp)) return false;
  if (camp.createdById === actor.id) return true;
  const theirs = await campPosts(camp.createdById, camp);
  return !theirs.length || outranks(actor.assignments.filter((a) => (unitPost(a) && a.anchor.unitId === camp.unitId) || (groupPost(a) && a.anchor.groupId === camp.groupId)), theirs);
}
// Review: an officer senior to the submitter, never the submitter. Group
// officers review; a report the Gp Cdr submitted (nobody in the group is
// senior) goes to the directorate. A submitter who left: any group officer.
async function reviews(actor: Actor, camp: { unitId: string; groupId: string; directorateId: string }, submitterId: string | undefined) {
  if (!submitterId || submitterId === actor.id) return false;
  const theirs = await campPosts(submitterId, camp);
  const top = theirs.some((p) => p.appointmentCode === "GP_CDR");
  const mine = actor.assignments.filter((a) => (top ? DTE_ROLES.includes(a.role) && a.level === "DIRECTORATE" && a.anchor.directorateId === camp.directorateId : groupPost(a) && a.anchor.groupId === camp.groupId));
  return mine.length > 0 && (!theirs.length || outranks(mine, theirs));
}
export async function plannableUnits(actor: Actor) {
  const units = actor.assignments.filter(unitPost).map((a) => a.anchor.unitId!);
  const groups = actor.assignments.filter(groupPost).map((a) => a.anchor.groupId!);
  if (!units.length && !groups.length) return [];
  return db.unit.findMany({ where: { OR: [{ id: { in: units } }, { groupId: { in: groups } }] }, select: { id: true, name: true, groupId: true }, orderBy: { name: "asc" } });
}
const count = z.coerce.number({ error: "Enter a number." }).int("Enter a whole number.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date.");
const planInput = z
  .object({
    unitId: z.string().min(1, "Choose the host unit.").max(40),
    catcNo: z.string().trim().min(1, "Enter the CATC number.").max(30, "Keep the CATC number under 30 characters."),
    location: z.string().trim().min(1, "Enter where the camp is.").max(120, "Keep the location under 120 characters."),
    start: date,
    end: date,
    plannedStrength: count.min(1, "Planned strength must be at least 1.").max(5000, "Planned strength must be at most 5000."),
    // Optional; "" clears it.
    briefing: z.union([date, z.literal("")]).default(""),
    seats: z.array(z.object({ unitId: z.string().min(1).max(40), seats: count.min(0, "Seats cannot be negative.").max(5000) }).strict()).min(1).max(60),
    details: z.string().trim().max(2000, "Keep the details under 2000 characters.").default(""),
  })
  .strict();
const version = { version: z.number().int().positive() };
const editInput = planInput.omit({ unitId: true }).extend(version).strict();
// Planning may also submit the initial budget in the same step.
const createInput = planInput.extend({ budget: z.object(budgetFields).strict().optional() }).strict();
const cancelInput = z.object({ reason: z.string().trim().min(3, "Give a reason for cancelling.").max(500), ...version }).strict();
const reportInput = z.object({ attendance: z.array(z.object({ unitId: z.string().min(1).max(40), attended: count.min(0, "Attendance cannot be negative.").max(5000) }).strict()).max(60), ...version }).strict();
const decisionInput = z
  .object({ decision: z.enum(["ACCEPT", "RETURN"]), remarks: z.string().trim().max(1000).default(""), ...version })
  .strict()
  .refine((v) => v.decision === "ACCEPT" || v.remarks.length >= 3, { message: "Say what needs fixing.", path: ["remarks"] });
// Checks the plan against the host unit's group and the training year.
async function checked(input: z.infer<typeof editInput>, host: { id: string; groupId: string }) {
  checkPlan({ ...input, hostUnitId: host.id });
  const others = await db.unit.count({ where: { id: { in: input.seats.map((s) => s.unitId) }, groupId: host.groupId } });
  if (others !== input.seats.length) throw new AppError(400, "Allocate seats only to units of the host unit's group.");
  const { years } = await resolveTrainingYear();
  const year = years.find((y) => ymd(y.startsOn) <= input.start && ymd(y.endsOn) >= input.start);
  if (!year) throw new AppError(400, "The start date is outside every training year.");
  if (input.end > ymd(year.endsOn)) throw new AppError(400, "The camp must end within the training year it starts in.");
  return year.label;
}
const unique = (e: unknown) => {
  if ((e as { code?: string }).code === "P2002") throw new AppError(409, "This group already has a camp with that CATC number this year.");
  throw e;
};
const fields = (input: z.infer<typeof editInput>) => ({
  catcNo: input.catcNo,
  location: input.location,
  startDate: day(input.start),
  endDate: day(input.end),
  plannedStrength: input.plannedStrength,
  briefingDate: input.briefing ? day(input.briefing) : null,
  details: input.details,
});
export async function createCamp(actor: Actor, raw: unknown) {
  const { budget, ...input } = createInput.parse(raw);
  const host = await db.unit.findUnique({ where: { id: input.unitId }, include: { group: true } });
  if (!host || !handles(actor, { unitId: host.id, groupId: host.groupId })) throw new AppError(403, "You can plan camps only for your unit or the units of your group.");
  if (input.start <= istDate()) throw new AppError(400, "Plan a camp that starts after today.");
  const trainingYear = await checked({ ...input, version: 1 }, host);
  return db
    .$transaction(async (tx) => {
      const camp = await tx.camp.create({
        data: {
          ...fields({ ...input, version: 1 }),
          trainingYear,
          unitId: host.id,
          groupId: host.groupId,
          directorateId: host.group.directorateId,
          createdById: actor.id,
          allocations: { create: input.seats.map((s) => ({ unitId: s.unitId, seats: s.seats })) },
        },
      });
      await audit(tx, actor.id, "camp.planned", camp.id, { catcNo: camp.catcNo, seats: input.seats });
      const initial = budget ? await prepareBudget(tx, actor, camp, { stage: "INITIAL", ...budget }) : null;
      return { id: camp.id, version: camp.version, budgetId: initial?.id ?? null };
    }, serializable)
    .catch(unique);
}
// Loads a camp for a change by a planner at the version they saw.
async function forChange(tx: Tx, actor: Actor, id: string, v: number, senior = false) {
  const camp = await tx.camp.findFirst({ where: { AND: [{ id }, campScope(actor)] } });
  if (!camp) throw new AppError(404, "Camp not found.");
  if (!handles(actor, camp)) throw new AppError(403, "Only the host unit or its group can change this camp.");
  if (senior && !(await changes(actor, camp))) throw new AppError(403, "Only the officer who planned this camp or someone senior to them can change it.");
  if (camp.version !== v) throw new AppError(409, "This camp changed. Refresh and try again.");
  return camp;
}
const bump = async (tx: Tx, camp: { id: string; version: number }, data: Prisma.CampUpdateManyMutationInput) => {
  const updated = await tx.camp.updateMany({ where: { id: camp.id, version: camp.version }, data: { ...data, version: { increment: 1 } } });
  if (!updated.count) throw new AppError(409, "This camp changed. Refresh and try again.");
};
const upcoming = (camp: { status: string; startDate: Date; endDate: Date }) =>
  campState({ status: camp.status, start: ymd(camp.startDate), end: ymd(camp.endDate) }, istDate()) === "UPCOMING";
export async function updateCamp(actor: Actor, id: string, raw: unknown) {
  const input = editInput.parse(raw);
  return db
    .$transaction(async (tx) => {
      const camp = await forChange(tx, actor, id, input.version, true);
      if (!upcoming(camp)) throw new AppError(409, "A camp can be changed only before it starts.");
      if (input.start <= istDate()) throw new AppError(400, "Plan a camp that starts after today.");
      const trainingYear = await checked(input, { id: camp.unitId, groupId: camp.groupId });
      await bump(tx, camp, { ...fields(input), trainingYear });
      await tx.campAllocation.deleteMany({ where: { campId: id } });
      await tx.campAllocation.createMany({ data: input.seats.map((s) => ({ campId: id, unitId: s.unitId, seats: s.seats })) });
      await audit(tx, actor.id, "camp.edited", id, { seats: input.seats });
      return { id, version: input.version + 1 };
    }, serializable)
    .catch(unique);
}
export async function cancelCamp(actor: Actor, id: string, raw: unknown) {
  const input = cancelInput.parse(raw);
  return db.$transaction(async (tx) => {
    const camp = await forChange(tx, actor, id, input.version, true);
    if (!upcoming(camp)) throw new AppError(409, "A camp can be cancelled only before it starts.");
    await bump(tx, camp, { status: "CANCELLED", cancelReason: input.reason });
    await audit(tx, actor.id, "camp.cancelled", id, { reason: input.reason });
    return { id, version: input.version + 1 };
  }, serializable);
}
// Report files, through the scanned upload flow (storage authorizeResource).
export async function campForFiles(actor: Actor, id: string, write: boolean) {
  const camp = await db.camp.findFirst({ where: { AND: [{ id }, campScope(actor)] } });
  if (!camp) throw new AppError(404, "Resource not found.");
  if (write && (!handles(actor, camp) || campState({ status: camp.status, start: ymd(camp.startDate), end: ymd(camp.endDate) }, istDate()) !== "COMPLETED" || !["NONE", "RETURNED"].includes(camp.reportStatus)))
    throw new AppError(403, "Report files can be added by the host unit or its group after the camp, until the report is submitted.");
}
const reportFiles = (campId: string) => db.attachment.findMany({ where: { resourceType: "camp", resourceId: campId, status: { not: "REJECTED" } }, select: { id: true, status: true, declaredType: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } });
export async function submitReport(actor: Actor, id: string, raw: unknown) {
  const input = reportInput.parse(raw);
  return db.$transaction(async (tx) => {
    const camp = await forChange(tx, actor, id, input.version);
    if (campState({ status: camp.status, start: ymd(camp.startDate), end: ymd(camp.endDate) }, istDate()) !== "COMPLETED") throw new AppError(409, "The report can be submitted once the camp is over.");
    if (!["NONE", "RETURNED"].includes(camp.reportStatus)) throw new AppError(409, "This report is already submitted.");
    const seats = await tx.campAllocation.findMany({ where: { campId: id } });
    const given = new Map(input.attendance.map((a) => [a.unitId, a.attended]));
    if (given.size !== input.attendance.length || seats.length !== given.size || seats.some((s) => !given.has(s.unitId)))
      throw new AppError(400, "Enter attendance for every unit with seats.");
    const files = await tx.attachment.findMany({ where: { resourceType: "camp", resourceId: id, status: { not: "REJECTED" } }, select: { id: true } });
    if (!files.length) throw new AppError(400, "Upload the camp report before submitting.");
    for (const s of seats) await tx.campAllocation.update({ where: { id: s.id }, data: { attended: given.get(s.unitId)! } });
    const round = (await tx.campReportSubmission.count({ where: { campId: id } })) + 1;
    await tx.campReportSubmission.create({
      data: { campId: id, round, submittedById: actor.id, snapshot: { attendance: seats.map((s) => ({ unitId: s.unitId, seats: s.seats, attended: given.get(s.unitId)! })), files: files.map((f) => f.id) } },
    });
    await bump(tx, camp, { reportStatus: "SUBMITTED" });
    await audit(tx, actor.id, "camp.report.submitted", id, { round });
    return { id, version: input.version + 1 };
  }, serializable);
}
export async function decideReport(actor: Actor, id: string, raw: unknown) {
  const input = decisionInput.parse(raw);
  return db.$transaction(async (tx) => {
    const camp = await tx.camp.findFirst({ where: { AND: [{ id }, campScope(actor)] } });
    if (!camp) throw new AppError(404, "Camp not found.");
    if (camp.version !== input.version) throw new AppError(409, "This camp changed. Refresh and try again.");
    if (camp.reportStatus !== "SUBMITTED") throw new AppError(409, "There is no submitted report to review.");
    const last = await tx.campReportSubmission.findFirstOrThrow({ where: { campId: id }, orderBy: { round: "desc" } });
    if (last.submittedById === actor.id) throw new AppError(403, "You cannot review a report you submitted.");
    if (!(await reviews(actor, camp, last.submittedById))) throw new AppError(403, "Only an officer senior to the one who submitted the report can review it.");
    const decision = input.decision === "ACCEPT" ? "ACCEPTED" : "RETURNED";
    await tx.campReportSubmission.update({ where: { id: last.id }, data: { decision, decidedById: actor.id, decidedAt: new Date(), remarks: input.remarks } });
    await bump(tx, camp, { reportStatus: decision });
    await audit(tx, actor.id, `camp.report.${decision.toLowerCase()}`, id, { round: last.round, remarks: input.remarks });
    return { id, version: input.version + 1 };
  }, serializable);
}
const include = { unit: { select: { name: true } }, group: { select: { name: true } }, allocations: { include: { unit: { select: { name: true } } }, orderBy: { seats: "desc" } } } satisfies Prisma.CampInclude;
type CampRow = Prisma.CampGetPayload<{ include: typeof include }>;
function present(c: CampRow, today: string) {
  const at = { status: c.status, start: ymd(c.startDate), end: ymd(c.endDate), reportStatus: c.reportStatus };
  const allocated = c.allocations.reduce((n, a) => n + a.seats, 0);
  const attended = c.allocations.some((a) => a.attended !== null) ? c.allocations.reduce((n, a) => n + (a.attended ?? 0), 0) : null;
  return {
    id: c.id,
    version: c.version,
    trainingYear: c.trainingYear,
    catcNo: c.catcNo,
    unit: { id: c.unitId, name: c.unit.name },
    group: { id: c.groupId, name: c.group.name },
    directorateId: c.directorateId,
    location: c.location,
    start: at.start,
    end: at.end,
    days: campDays(at.start, at.end),
    plannedStrength: c.plannedStrength,
    briefing: c.briefingDate ? ymd(c.briefingDate) : null,
    allocated,
    attended,
    details: c.details,
    state: campState(at, today) as CampState,
    report: reportState(at, today) as ReportState,
    reportDue: reportDueDate(at.end),
    cancelReason: c.cancelReason,
    seats: c.allocations.map((a) => ({ unitId: a.unitId, unit: a.unit.name, seats: a.seats, attended: a.attended })),
  };
}
export type Camp = ReturnType<typeof present>;
const STATES = ["UPCOMING", "CURRENT", "COMPLETED", "CANCELLED"] as const;
const REPORTS = ["DUE", "OVERDUE", "SUBMITTED", "RETURNED", "ACCEPTED"] as const;
export type CampFilter = { year?: string; q?: string; group?: string; state?: string; report?: string };
// Every camp of the year in scope, in date order (a year holds at most a few
// hundred), with counts by state and report for the tiles and tabs.
export async function listCamps(actor: Actor, f: CampFilter = {}) {
  const { year } = await resolveTrainingYear(f.year);
  const search = terms(f.q ?? "").map((t) => ({
    OR: [{ catcNo: { contains: t, mode: "insensitive" as const } }, { location: { contains: t, mode: "insensitive" as const } }, { unit: { name: { contains: t, mode: "insensitive" as const } } }],
  }));
  const rows = await db.camp.findMany({
    where: { AND: [campScope(actor), { trainingYear: year.label }, ...(f.group ? [{ groupId: f.group }] : []), ...search] },
    include,
    orderBy: [{ startDate: "asc" }, { catcNo: "asc" }],
    take: 500,
  });
  const today = istDate();
  const all = rows.map((r) => present(r, today));
  const states = Object.fromEntries(STATES.map((s) => [s, all.filter((c) => c.state === s).length])) as Record<(typeof STATES)[number], number>;
  const reports = Object.fromEntries(REPORTS.map((s) => [s, all.filter((c) => c.report === s).length])) as Record<(typeof REPORTS)[number], number>;
  const shown = all.filter((c) => (!f.state || c.state === f.state) && (!f.report || c.report === f.report));
  return { year: year.label, today, camps: shown, states, reports, total: all.length };
}
export async function getCamp(actor: Actor, id: string) {
  const row = await db.camp.findFirst({ where: { AND: [{ id }, campScope(actor)] }, include });
  if (!row) throw new AppError(404, "Camp not found.");
  const camp = present(row, istDate());
  const [rounds, events, files, budgetRows] = await Promise.all([
    db.campReportSubmission.findMany({ where: { campId: id }, orderBy: { round: "asc" } }),
    db.auditEvent.findMany({ where: { resourceId: id, action: { startsWith: "camp." } }, orderBy: { createdAt: "asc" } }),
    reportFiles(id),
    db.campBudget.findMany({ where: { campId: id }, orderBy: { createdAt: "asc" }, select: { stage: true, status: true, demandedPaise: true, sanctionedPaise: true } }),
  ]);
  // Per stage, the open budget or else the latest (summary for the sheet).
  const budgets = (["INITIAL", "REVISED", "FINAL"] as const).flatMap((stage) => {
    const list = budgetRows.filter((b) => b.stage === stage);
    const b = list.find((x) => ["PENDING", "RETURNED", "APPROVED"].includes(x.status)) ?? list.at(-1);
    return b ? [{ stage, status: b.status, demandedPaise: b.demandedPaise.toString(), sanctionedPaise: b.sanctionedPaise?.toString() ?? null }] : [];
  });
  const people = new Map((await db.user.findMany({ where: { id: { in: [...new Set(events.map((e) => e.actorId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const last = rounds.at(-1);
  const host = handles(actor, row);
  const [mayChange, mayReview] = await Promise.all([changes(actor, row), row.reportStatus === "SUBMITTED" ? reviews(actor, row, last?.submittedById) : false]);
  return {
    ...camp,
    files,
    budgets,
    history: events.map((e) => ({ action: e.action.slice(5), by: people.get(e.actorId) ?? "", at: e.createdAt, remarks: (e.details as { remarks?: string; reason?: string }).remarks ?? (e.details as { reason?: string }).reason ?? "" })),
    rounds: rounds.map((r) => ({ round: r.round, at: r.createdAt, decision: r.decision, remarks: r.remarks })),
    returnRemarks: camp.report === "RETURNED" ? (last?.remarks ?? "") : "",
    canEdit: mayChange && camp.state === "UPCOMING",
    canReport: host && camp.state === "COMPLETED" && ["NONE", "RETURNED"].includes(row.reportStatus),
    canReview: mayReview,
  };
}
// Strength per unit for the year: camps hosted, seats allocated and attended
// across camps that are not cancelled. Units in the actor's read reach.
export async function campStrength(actor: Actor, f: { year?: string; group?: string } = {}) {
  const { year } = await resolveTrainingYear(f.year);
  const or: Prisma.UnitWhereInput[] = [];
  for (const a of actor.assignments) {
    if (DTE_ROLES.includes(a.role)) or.push({ group: { directorateId: a.anchor.directorateId } });
    else if (GROUP_ROLES.includes(a.role) && a.anchor.groupId) or.push({ groupId: a.anchor.groupId });
    else if ((a.role === "CO" || a.role === "ANO") && a.anchor.unitId) or.push({ id: a.anchor.unitId });
  }
  if (!or.length) return { year: year.label, groups: [], totals: sum([]) };
  const units = await db.unit.findMany({
    where: { AND: [{ OR: or }, ...(f.group ? [{ groupId: f.group }] : [])] },
    include: {
      group: { select: { id: true, name: true } },
      camps: { where: { trainingYear: year.label, status: "PLANNED" }, select: { id: true } },
      campSeats: { where: { camp: { trainingYear: year.label, status: "PLANNED" } }, select: { seats: true, attended: true } },
    },
    orderBy: [{ group: { name: "asc" } }, { name: "asc" }],
  });
  const cadets = await unitTotals(actor, units.map((u) => u.id), year.label);
  const groups = new Map<string, { id: string; name: string; units: UnitStrength[] }>();
  for (const u of units) {
    const g = groups.get(u.group.id) ?? { id: u.group.id, name: u.group.name, units: [] };
    const c = cadets(u.id);
    g.units.push({
      id: u.id,
      name: u.name,
      hosted: u.camps.length,
      camps: u.campSeats.length,
      seats: u.campSeats.reduce((n, s) => n + s.seats, 0),
      attended: u.campSeats.reduce((n, s) => n + (s.attended ?? 0), 0),
      authorised: total(c.authorised),
      enrolled: total(c.enrolled),
      byType: c,
      canEnter: entersFor(actor, u.id),
    });
    groups.set(g.id, g);
  }
  const list = [...groups.values()].map((g) => ({ ...g, totals: sum(g.units) }));
  return { year: year.label, groups: list, totals: sum(list.flatMap((g) => g.units)) };
}
type UnitStrength = { id: string; name: string; hosted: number; seats: number; attended: number; camps: number; authorised: number; enrolled: number; byType: Awaited<ReturnType<typeof unitTotals>> extends (id: string) => infer R ? R : never; canEnter: boolean };
// Short by: enrolled cadets without a camp seat this year (never below 0).
const sum = (units: Pick<UnitStrength, "hosted" | "seats" | "attended" | "camps" | "authorised" | "enrolled">[]) => ({
  units: units.length,
  hosted: units.reduce((n, u) => n + u.hosted, 0),
  seats: units.reduce((n, u) => n + u.seats, 0),
  attended: units.reduce((n, u) => n + u.attended, 0),
  without: units.filter((u) => u.camps === 0).length,
  authorised: units.reduce((n, u) => n + u.authorised, 0),
  enrolled: units.reduce((n, u) => n + u.enrolled, 0),
  short: units.reduce((n, u) => n + Math.max(0, u.enrolled - u.seats), 0),
});
// What the plan form offers: host units, and for each group its units (seats).
export async function campOptions(actor: Actor) {
  const hosts = await plannableUnits(actor);
  const groupIds = [...new Set(hosts.map((u) => u.groupId))];
  const siblings = await db.unit.findMany({ where: { groupId: { in: groupIds } }, select: { id: true, name: true, groupId: true }, orderBy: { name: "asc" } });
  return { hosts, units: siblings, canPlan: hosts.length > 0 };
}
// For the Overview: camp reports this actor should review, and reports their
// unit or group owes (due, overdue or returned), oldest camp first.
export async function campWork(actor: Actor, year?: string) {
  const { camps } = await listCamps(actor, { year });
  const toReport = camps.filter((c) => ["DUE", "OVERDUE", "RETURNED"].includes(c.report) && handles(actor, { unitId: c.unit.id, groupId: c.group.id }));
  const submitted = camps.filter((c) => c.report === "SUBMITTED");
  const lasts = await db.campReportSubmission.findMany({ where: { campId: { in: submitted.map((c) => c.id) } }, orderBy: { round: "desc" }, distinct: ["campId"] });
  const by = new Map(lasts.map((l) => [l.campId, l]));
  const flags = await Promise.all(submitted.map((c) => reviews(actor, { unitId: c.unit.id, groupId: c.group.id, directorateId: c.directorateId }, by.get(c.id)?.submittedById)));
  const toReview = submitted.filter((_, i) => flags[i]).map((c) => ({ ...c, since: by.get(c.id)!.createdAt }));
  return { toReport, toReview, camps };
}
