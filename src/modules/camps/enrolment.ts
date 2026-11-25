import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, scope, type Actor } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { resolveTrainingYear } from "@/modules/platform/training-year";
// Cadet strength per institution and training year (user, 2026-11-25): the
// unit's CO or AO enters authorised and enrolled cadets for each type; unit,
// group and directorate totals add up from the institutions.
export const TYPES = ["JD", "JW", "SD", "SW"] as const;
export type CadetType = (typeof TYPES)[number];
type Counts = Record<CadetType, number>;
const zero = (): Counts => ({ JD: 0, JW: 0, SD: 0, SW: 0 });
const split = (r: { authJD: number; authJW: number; authSD: number; authSW: number; enrJD: number; enrJW: number; enrSD: number; enrSW: number } | undefined) => ({
  authorised: r ? { JD: r.authJD, JW: r.authJW, SD: r.authSD, SW: r.authSW } : zero(),
  enrolled: r ? { JD: r.enrJD, JW: r.enrJW, SD: r.enrSD, SW: r.enrSW } : zero(),
});
export const total = (c: Counts) => TYPES.reduce((n, t) => n + c[t], 0);
// Units whose strength this actor enters: CO and AO of that unit.
export const entersFor = (actor: Actor, unitId: string) => actor.assignments.some((a) => a.role === "CO" && a.level === "UNIT" && a.anchor.unitId === unitId);
const readable = (actor: Actor): Prisma.InstitutionWhereInput => ({ AND: [scope({ ...actor, assignments: actor.assignments.filter((a) => a.role !== "CADET") }, "read")] });
// One unit's institutions with their strength for the year.
export async function unitStrength(actor: Actor, unitId: string, yearLabel?: string) {
  const { year } = await resolveTrainingYear(yearLabel);
  const institutions = await db.institution.findMany({
    where: { AND: [readable(actor), { unitId, active: true }] },
    include: { strengths: { where: { trainingYear: year.label } } },
    orderBy: { name: "asc" },
  });
  if (!institutions.length && !entersFor(actor, unitId)) throw new AppError(404, "Unit not found.");
  const unit = await db.unit.findUniqueOrThrow({ where: { id: unitId }, select: { id: true, name: true } });
  return {
    year: year.label,
    unit,
    canEdit: entersFor(actor, unitId),
    institutions: institutions.map((i) => ({ id: i.id, name: i.name, version: i.strengths[0]?.version ?? null, ...split(i.strengths[0]) })),
  };
}
const n = z.coerce.number({ error: "Enter a number." }).int("Enter a whole number.").min(0, "Strength cannot be negative.").max(10000, "Strength must be at most 10000.");
const counts = z.object({ JD: n, JW: n, SD: n, SW: n }).strict();
const saveInput = z
  .object({
    unitId: z.string().min(1).max(40),
    year: z.string().max(20),
    rows: z.array(z.object({ institutionId: z.string().min(1).max(40), version: z.number().int().positive().nullable(), authorised: counts, enrolled: counts }).strict()).min(1).max(200),
  })
  .strict();
export async function saveUnitStrength(actor: Actor, raw: unknown) {
  const input = saveInput.parse(raw);
  if (!entersFor(actor, input.unitId)) throw new AppError(403, "Only the unit's CO or AO can enter its cadet strength.");
  const { year } = await resolveTrainingYear(input.year);
  const ids = input.rows.map((r) => r.institutionId);
  if (new Set(ids).size !== ids.length) throw new AppError(400, "List each institution once.");
  if ((await db.institution.count({ where: { id: { in: ids }, unitId: input.unitId, active: true } })) !== ids.length)
    throw new AppError(400, "Enter strength only for the unit's own institutions.");
  return db.$transaction(
    async (tx) => {
      for (const r of input.rows) {
        const data = {
          authJD: r.authorised.JD, authJW: r.authorised.JW, authSD: r.authorised.SD, authSW: r.authorised.SW,
          enrJD: r.enrolled.JD, enrJW: r.enrolled.JW, enrSD: r.enrolled.SD, enrSW: r.enrolled.SW,
          updatedById: actor.id,
        };
        const stale = () => new AppError(409, "Someone changed this strength. Refresh and try again.");
        if (r.version === null) {
          if (await tx.cadetStrength.findUnique({ where: { institutionId_trainingYear: { institutionId: r.institutionId, trainingYear: year.label } } })) throw stale();
          await tx.cadetStrength.create({ data: { ...data, institutionId: r.institutionId, trainingYear: year.label } });
        } else {
          const updated = await tx.cadetStrength.updateMany({ where: { institutionId: r.institutionId, trainingYear: year.label, version: r.version }, data: { ...data, version: { increment: 1 } } });
          if (!updated.count) throw stale();
        }
      }
      await audit(tx, actor.id, "strength.saved", input.unitId, { year: year.label, rows: input.rows });
      return { unitId: input.unitId, year: year.label };
    },
    { isolationLevel: "Serializable" },
  );
}
// Authorised and enrolled totals per unit for the year (Strength view).
export async function unitTotals(actor: Actor, unitIds: string[], yearLabel: string) {
  const rows = await db.cadetStrength.findMany({ where: { trainingYear: yearLabel, institution: { AND: [readable(actor), { unitId: { in: unitIds }, active: true }] } }, include: { institution: { select: { unitId: true } } } });
  const by = new Map<string, { authorised: Counts; enrolled: Counts }>();
  for (const r of rows) {
    const t = by.get(r.institution.unitId) ?? { authorised: zero(), enrolled: zero() };
    const s = split(r);
    for (const k of TYPES) {
      t.authorised[k] += s.authorised[k];
      t.enrolled[k] += s.enrolled[k];
    }
    by.set(r.institution.unitId, t);
  }
  return (unitId: string) => by.get(unitId) ?? { authorised: zero(), enrolled: zero() };
}
