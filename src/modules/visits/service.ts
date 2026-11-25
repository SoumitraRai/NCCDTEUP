import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, requireInstitution, scope, type Actor } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { resolveTrainingYear, yearRange } from "@/modules/platform/training-year";
import { istDateTime, istParts, page, terms, type ListQuery } from "@/modules/platform/query";
export const visitorAppointments = ["ANO", "CTO", "PI", "CO", "AO", "GCI", "TO", "OTHER"] as const;
const staff = (actor: Actor) => ({ ...actor, assignments: actor.assignments.filter((a) => a.role !== "CADET") });
const cadetOnly = (actor: Actor) => actor.assignments.every((a) => a.role === "CADET");
export const visitInput = z
  .object({
    institutionId: z.string().min(1),
    startsAt: istDateTime,
    endsAt: istDateTime,
    purpose: z.string().trim().min(3).max(300),
    visitorName: z.string().trim().min(2).max(120),
    visitorRank: z.string().trim().max(60).default(""),
    visitorAppointment: z.enum(visitorAppointments),
    subjectIds: z.array(z.string()).max(20).default([]),
    periods: z.number().int().min(0).max(10),
    cadetsPresent: z.number().int().min(0).max(1000),
    notes: z.string().max(5000).default(""),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start." });
    if (istParts(v.startsAt).date !== istParts(v.endsAt).date)
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "A visit must start and end on the same day." });
    if (v.endsAt.getTime() > Date.now())
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Visits cannot be recorded in advance." });
  });
async function subjectsExist(ids: string[]) {
  if (ids.length && (await db.subject.count({ where: { id: { in: ids }, active: true } })) !== new Set(ids).size)
    throw new AppError(400, "Choose subjects from the list.");
}
const fields = (v: z.infer<typeof visitInput>, institutionName: string) => ({
  institutionId: v.institutionId,
  title: `Visit to ${institutionName}`,
  eventDate: new Date(istParts(v.startsAt).date),
  startsAt: v.startsAt,
  endsAt: v.endsAt,
  purpose: v.purpose,
  visitorName: v.visitorName,
  visitorRank: v.visitorRank,
  visitorAppointment: v.visitorAppointment,
  periods: v.periods,
  cadetsPresent: v.cadetsPresent,
  notes: v.notes,
});
export async function createVisit(actor: Actor, raw: unknown) {
  const v = visitInput.parse(raw);
  await requireInstitution(staff(actor), v.institutionId, "edit");
  await subjectsExist(v.subjectIds);
  const inst = await db.institution.findUniqueOrThrow({ where: { id: v.institutionId } });
  return db.$transaction(async (tx) => {
    const visit = await tx.visit.create({
      data: { ...fields(v, inst.name), ownerId: actor.id, subjects: { connect: v.subjectIds.map((id) => ({ id })) } },
    });
    await audit(tx, actor.id, "visit.created", visit.id);
    return visit;
  });
}
export async function updateVisit(actor: Actor, id: string, raw: unknown) {
  const { version, ...rest } = z.object({ version: z.number().int().positive() }).passthrough().parse(raw);
  const v = visitInput.parse(rest);
  await requireInstitution(staff(actor), v.institutionId, "edit");
  await subjectsExist(v.subjectIds);
  const inst = await db.institution.findUniqueOrThrow({ where: { id: v.institutionId } });
  return db.$transaction(async (tx) => {
    const updated = await tx.visit.updateMany({
      where: { id, version, ownerId: actor.id, status: "DRAFT", institution: scope(actor, "edit") },
      data: { ...fields(v, inst.name), version: { increment: 1 } },
    });
    if (!updated.count) throw new AppError(409, "This visit changed or can no longer be edited.");
    await tx.visit.update({ where: { id }, data: { subjects: { set: v.subjectIds.map((s) => ({ id: s })) } } });
    await audit(tx, actor.id, "visit.updated", id);
    return { id, version: version + 1 };
  });
}
export async function submitVisit(actor: Actor, id: string, raw: unknown) {
  const { version } = z.object({ version: z.number().int().positive() }).strict().parse(raw);
  return db.$transaction(async (tx) => {
    const updated = await tx.visit.updateMany({
      where: { id, version, ownerId: actor.id, status: "DRAFT", institution: scope(actor, "edit") },
      data: { status: "SUBMITTED", version: { increment: 1 } },
    });
    if (!updated.count) throw new AppError(409, "This visit changed or is already recorded.");
    await audit(tx, actor.id, "visit.submitted", id);
    return { id, version: version + 1, status: "SUBMITTED" };
  });
}
export async function visitWhere(actor: Actor, q: ListQuery) {
  const { year } = await resolveTrainingYear(q.year);
  const and: Prisma.VisitWhereInput[] = [
    { institution: scope(actor, "read") },
    { startsAt: yearRange(year) },
  ];
  if (cadetOnly(actor)) and.push({ ownerId: actor.id });
  if (q.unit) and.push({ institution: { unitId: q.unit } });
  if (q.institution) and.push({ institutionId: q.institution });
  if (q.status) and.push({ status: q.status });
  for (const t of terms(q.q))
    and.push({
      OR: [
        { institution: { name: { contains: t, mode: "insensitive" } } },
        { visitorName: { contains: t, mode: "insensitive" } },
        { purpose: { contains: t, mode: "insensitive" } },
        { subjects: { some: { name: { contains: t, mode: "insensitive" } } } },
      ],
    });
  return { where: { AND: and }, year };
}
export async function listVisits(actor: Actor, q: ListQuery) {
  const { where, year } = await visitWhere(actor, q);
  const [rows, total] = await db.$transaction([
    db.visit.findMany({
      where,
      include: {
        subjects: { select: { id: true, name: true } },
        institution: { select: { id: true, name: true, district: true, unit: { select: { id: true, name: true, group: { select: { name: true } } } } } },
      },
      orderBy: { startsAt: q.sort === "oldest" ? "asc" : "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.visit.count({ where }),
  ]);
  return { ...page(rows, total, q), year: year.label };
}
export async function getVisit(actor: Actor, id: string) {
  const visit = await db.visit.findFirst({
    where: { id, institution: scope(actor, "read"), ...(cadetOnly(actor) ? { ownerId: actor.id } : {}) },
    include: {
      subjects: { select: { id: true, name: true } },
      institution: { select: { id: true, name: true, district: true, unit: { select: { id: true, name: true } } } },
    },
  });
  if (!visit) throw new AppError(404, "Visit not found.");
  return visit;
}
// Units in scope with no recorded visit, and units with no visit by a
// Permanent Instructor, in the selected training year.
export async function visitExceptions(actor: Actor, label?: string) {
  const { year } = await resolveTrainingYear(label);
  const units = await db.unit.findMany({
    where: { institutions: { some: { active: true, AND: [scope(actor, "read")] } } },
    select: {
      id: true,
      name: true,
      group: { select: { name: true } },
      institutions: {
        where: { active: true },
        select: { visits: { where: { status: "SUBMITTED", startsAt: yearRange(year) }, select: { visitorAppointment: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  const summary = units.map((u) => {
    const visits = u.institutions.flatMap((i) => i.visits);
    return { id: u.id, name: u.name, group: u.group.name, visits: visits.length, piVisits: visits.filter((v) => v.visitorAppointment === "PI").length };
  });
  return {
    year: year.label,
    noVisit: summary.filter((u) => !u.visits),
    noPiVisit: summary.filter((u) => !u.piVisits),
  };
}
export async function visitMetrics(actor: Actor, label?: string) {
  const { where, year } = await visitWhere(actor, { q: "", page: 1, pageSize: 10, sort: "newest", year: label, status: "SUBMITTED" });
  const visits = await db.visit.findMany({
    where,
    select: { startsAt: true, cadetsPresent: true, periods: true, institutionId: true, institution: { select: { unit: { select: { name: true } } } } },
  });
  const institutions = await db.institution.count({ where: { active: true, AND: [scope(actor, "read")] } });
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year.startsOn);
    d.setUTCMonth(d.getUTCMonth() + i);
    return { month: d.toISOString().slice(0, 7), visits: 0, cadets: 0 };
  });
  const byUnit = new Map<string, number>();
  for (const v of visits) {
    const m = months.find((x) => x.month === istParts(v.startsAt).date.slice(0, 7));
    if (m) {
      m.visits++;
      m.cadets += v.cadetsPresent;
    }
    byUnit.set(v.institution.unit.name, (byUnit.get(v.institution.unit.name) ?? 0) + 1);
  }
  return {
    year: year.label,
    visits: visits.length,
    cadetsReached: visits.reduce((s, v) => s + v.cadetsPresent, 0),
    periods: visits.reduce((s, v) => s + v.periods, 0),
    institutionsVisited: new Set(visits.map((v) => v.institutionId)).size,
    institutions,
    months,
    byUnit: [...byUnit].map(([unit, count]) => ({ unit, count })).sort((a, b) => b.count - a.count),
  };
}
export const subjects = () => db.subject.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });

// Institutions. Coordinates are stored coarsely (3 decimal places, ~100 m).
const coord = (what: string, min: number, max: number) =>
  z
    .number({ error: `Enter the ${what} as a number.` })
    .min(min, `The ${what} must be between ${min} and ${max}.`)
    .max(max, `The ${what} must be between ${min} and ${max}.`)
    .transform((n) => Math.round(n * 1000) / 1000);
export const institutionInput = z
  .object({
    name: z.string().trim().min(3, "Enter the institution's name.").max(160, "Keep the name under 160 characters."),
    district: z.string().trim().min(2, "Enter the district.").max(80, "Keep the district under 80 characters."),
    unitId: z.string().min(1, "Choose a unit."),
    latitude: coord("latitude", 6, 38).nullable().default(null),
    longitude: coord("longitude", 68, 98).nullable().default(null),
  })
  .strict();
const institutionEditor = (actor: Actor) => ({ ...actor, assignments: actor.assignments.filter((a) => ["CO", "GROUP", "ADMIN"].includes(a.role)) });
async function requireUnit(actor: Actor, unitId: string) {
  const unit = await db.unit.findFirst({ where: { id: unitId, institutions: { some: scope(institutionEditor(actor), "edit") } } });
  if (!unit) throw new AppError(403, "Not permitted for this unit.");
}
export async function listInstitutions(actor: Actor, q: ListQuery) {
  const { year } = await resolveTrainingYear(q.year);
  const and: Prisma.InstitutionWhereInput[] = [{ active: true }, scope(actor, "read")];
  if (q.unit) and.push({ unitId: q.unit });
  for (const t of terms(q.q)) and.push({ OR: [{ name: { contains: t, mode: "insensitive" } }, { district: { contains: t, mode: "insensitive" } }] });
  const where = { AND: and };
  const [rows, total] = await db.$transaction([
    db.institution.findMany({
      where,
      select: {
        id: true, name: true, district: true, latitude: true, longitude: true, version: true,
        strengths: { where: { trainingYear: year.label } },
        unit: { select: { id: true, name: true, group: { select: { name: true } } } },
        _count: { select: { visits: { where: { status: "SUBMITTED", startsAt: yearRange(year) } } } },
      },
      orderBy: { name: q.sort === "oldest" ? "desc" : "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.institution.count({ where }),
  ]);
  return {
    ...page(
      rows.map(({ _count, latitude, longitude, strengths: [st], ...r }) => ({
        ...r,
        latitude: latitude?.toNumber() ?? null,
        longitude: longitude?.toNumber() ?? null,
        visits: _count.visits,
        // Cadet strength for the year, entered by the unit (null until then).
        authorised: st ? st.authJD + st.authJW + st.authSD + st.authSW : null,
        enrolled: st ? st.enrJD + st.enrJW + st.enrSD + st.enrSW : null,
      })),
      total,
      q,
    ),
    year: year.label,
  };
}
// Every institution in read scope, for the map. Not paged: a unit has tens of
// institutions, a directorate a few thousand at most.
export async function institutionPoints(actor: Actor, label?: string) {
  const { year } = await resolveTrainingYear(label);
  const rows = await db.institution.findMany({
    where: { AND: [{ active: true }, scope(actor, "read")] },
    select: {
      id: true, name: true, district: true, latitude: true, longitude: true,
      unit: { select: { id: true, name: true } },
      _count: { select: { visits: { where: { status: "SUBMITTED", startsAt: yearRange(year) } } } },
    },
    orderBy: { name: "asc" },
  });
  return {
    year: year.label,
    points: rows.map(({ _count, latitude, longitude, ...r }) => ({ ...r, latitude: latitude?.toNumber() ?? null, longitude: longitude?.toNumber() ?? null, visits: _count.visits })),
  };
}
export async function createInstitution(actor: Actor, raw: unknown) {
  const v = institutionInput.parse(raw);
  await requireUnit(actor, v.unitId);
  return db.$transaction(async (tx) => {
    const inst = await tx.institution.create({ data: v });
    await audit(tx, actor.id, "institution.created", inst.id);
    return inst;
  });
}
export async function updateInstitution(actor: Actor, id: string, raw: unknown) {
  const { version, ...rest } = z.object({ version: z.number().int().positive() }).passthrough().parse(raw);
  const v = institutionInput.parse(rest);
  await requireInstitution(institutionEditor(actor), id, "edit");
  await requireUnit(actor, v.unitId);
  return db.$transaction(async (tx) => {
    const updated = await tx.institution.updateMany({ where: { id, version, active: true }, data: { ...v, version: { increment: 1 } } });
    if (!updated.count) throw new AppError(409, "This institution changed. Refresh and try again.");
    await audit(tx, actor.id, "institution.updated", id);
    return { id, version: version + 1 };
  });
}
// Institutions are deactivated, never deleted, so visit and bill history stays intact.
export async function deactivateInstitution(actor: Actor, id: string, raw: unknown) {
  const { version } = z.object({ version: z.number().int().positive() }).strict().parse(raw);
  await requireInstitution(institutionEditor(actor), id, "edit");
  return db.$transaction(async (tx) => {
    const updated = await tx.institution.updateMany({ where: { id, version, active: true }, data: { active: false, version: { increment: 1 } } });
    if (!updated.count) throw new AppError(409, "This institution changed. Refresh and try again.");
    await audit(tx, actor.id, "institution.deactivated", id);
    return { id, active: false };
  });
}
// Units where the actor may add or edit institutions (CO, Group, Admin).
export const editableUnits = (actor: Actor) =>
  db.unit.findMany({
    where: { institutions: { some: scope(institutionEditor(actor), "edit") } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
// Institutions where the actor may record visits or bills (never as a cadet).
export const editableInstitutions = (actor: Actor) =>
  db.institution.findMany({
    where: { AND: [{ active: true }, scope(staff(actor), "edit")] },
    select: { id: true, name: true, district: true },
    orderBy: { name: "asc" },
  });
