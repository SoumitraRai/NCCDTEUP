import { afterAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { resolveTrainingYear } from "../src/modules/platform/training-year";
import { saveUnitStrength, unitStrength } from "../src/modules/camps/enrolment";
import { campStrength } from "../src/modules/camps/service";
// Cadet strength per institution, entered by the unit (seeded: unit-1 has
// institution-1, -1b, -1c; co and ao hold unit-1; co2 unit-2).
const as = (id: string) => actorById(id);
let year = "";
const counts = (n: number) => ({ JD: n, JW: n + 1, SD: n + 2, SW: n + 3 });
const before = new Map<string, unknown>();
afterAll(async () => {
  // Put back what the seed had, so other runs and the dev DB stay as they were.
  for (const [id, row] of before) {
    if (row) await db.cadetStrength.update({ where: { institutionId_trainingYear: { institutionId: id, trainingYear: year } }, data: row as object });
    else await db.cadetStrength.deleteMany({ where: { institutionId: id, trainingYear: year } });
  }
  await db.auditEvent.deleteMany({ where: { action: "strength.saved", actorId: { in: ["co", "ao"] }, createdAt: { gte: new Date(Date.now() - 600_000) } } });
  await db.$disconnect();
});
describe("cadet strength", () => {
  it("the unit's CO or AO enters every institution; others read only", async () => {
    year = (await resolveTrainingYear()).year.label;
    const unit = await unitStrength(await as("co"), "unit-1");
    for (const i of unit.institutions) {
      const row = await db.cadetStrength.findUnique({ where: { institutionId_trainingYear: { institutionId: i.id, trainingYear: year } } });
      before.set(i.id, row && { authJD: row.authJD, authJW: row.authJW, authSD: row.authSD, authSW: row.authSW, enrJD: row.enrJD, enrJW: row.enrJW, enrSD: row.enrSD, enrSW: row.enrSW, version: row.version });
    }
    expect(unit.canEdit).toBe(true);
    expect(unit.institutions.map((i) => i.id)).toEqual(expect.arrayContaining(["institution-1", "institution-1b"]));
    const rows = unit.institutions.map((i, k) => ({ institutionId: i.id, version: i.version, authorised: counts(10 * (k + 1)), enrolled: counts(5 * (k + 1)) }));
    await saveUnitStrength(await as("ao"), { unitId: "unit-1", year, rows });
    const saved = await unitStrength(await as("group"), "unit-1");
    expect(saved.canEdit).toBe(false);
    expect(saved.institutions.find((i) => i.id === rows[0].institutionId)?.enrolled).toEqual(counts(5));
    expect((await unitStrength(await as("admin"), "unit-1")).institutions.length).toBe(rows.length);
    await expect(saveUnitStrength(await as("group"), { unitId: "unit-1", year, rows })).rejects.toMatchObject({ status: 403 });
    await expect(saveUnitStrength(await as("co2"), { unitId: "unit-1", year, rows })).rejects.toMatchObject({ status: 403 });
    await expect(unitStrength(await as("co2"), "unit-1")).rejects.toMatchObject({ status: 404 });
  });
  it("refuses a stale version, another unit's institution and negative counts", async () => {
    const unit = await unitStrength(await as("co"), "unit-1");
    const row = (k: number) => ({ institutionId: unit.institutions[k].id, version: unit.institutions[k].version, authorised: counts(1), enrolled: counts(1) });
    await expect(saveUnitStrength(await as("co"), { unitId: "unit-1", year, rows: [{ ...row(0), version: (row(0).version ?? 0) + 5 }] })).rejects.toMatchObject({ status: 409 });
    await expect(saveUnitStrength(await as("co"), { unitId: "unit-1", year, rows: [{ ...row(0), institutionId: "institution-2" }] })).rejects.toThrow("Enter strength only for the unit's own institutions.");
    await expect(saveUnitStrength(await as("co"), { unitId: "unit-1", year, rows: [{ ...row(0), enrolled: { ...counts(1), SW: -1 } }] })).rejects.toThrow("Strength cannot be negative.");
  });
  it("adds up per unit and group in the Strength view, with how many are short of a seat", async () => {
    const unit = await unitStrength(await as("co"), "unit-1");
    const enrolled = unit.institutions.reduce((n, i) => n + i.enrolled.JD + i.enrolled.JW + i.enrolled.SD + i.enrolled.SW, 0);
    const s = await campStrength(await as("admin"));
    const u1 = s.groups.flatMap((g) => g.units).find((u) => u.id === "unit-1")!;
    expect(u1.enrolled).toBe(enrolled);
    expect(u1.canEnter).toBe(false);
    expect((await campStrength(await as("co"))).groups[0].units.find((u) => u.id === "unit-1")!.canEnter).toBe(true);
    const g1 = s.groups.find((g) => g.id === "group-1")!;
    expect(g1.totals.short).toBe(g1.units.reduce((n, u) => n + Math.max(0, u.enrolled - u.seats), 0));
  });
});
