import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { istDate } from "../src/modules/platform/training-year";
import { campOptions, campStrength, cancelCamp, createCamp, decideReport, getCamp, listCamps, submitReport, updateCamp } from "../src/modules/camps/service";
import { listAttachments, uploadIntent } from "../src/server/storage";
// Camps in the service layer. Seeded: co, ao (unit-1), co2 (unit-2), group
// (Gp Cdr, group-1), group2 (group-2), admin (DDG), ano (institution-1 in
// unit-1), ano2, cadet. A second unit of group-1 and a group staff officer
// are made here.
const run = crypto.randomUUID().slice(0, 8);
const sib = `tcu-${run}`;
const staff = `tcs-${run}`;
const bare = `tcb-${run}`;
const created: string[] = [];
const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.parse(`${istDate()}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const as = (id: string) => actorById(id);
let catc = 0;
const plan = (extra: object = {}) => ({
  unitId: "unit-1",
  catcNo: `CATC-${run}-${++catc}`,
  location: "Demo camp ground",
  start: inDays(10),
  end: inDays(19),
  plannedStrength: 400,
  seats: [{ unitId: "unit-1", seats: 250 }, { unitId: sib, seats: 100 }],
  ...extra,
});
const make = async (by = "co", extra: object = {}) => {
  const c = await createCamp(await as(by), plan(extra));
  created.push(c.id);
  return c;
};
// Moves a camp into the past (only the service's date rule stops planning one).
const over = async (id: string, endedDaysAgo = 2) =>
  db.camp.update({ where: { id }, data: { startDate: new Date(`${inDays(-endedDaysAgo - 5)}T00:00:00Z`), endDate: new Date(`${inDays(-endedDaysAgo)}T00:00:00Z`) } });
// The edit form sends the plan without the host unit.
const edit = (extra: object = {}) => Object.fromEntries(Object.entries(plan(extra)).filter(([k]) => k !== "unitId"));
const fileFor = (id: string, ownerId: string) =>
  db.attachment.create({ data: { ownerId, institutionId: "", resourceType: "camp", resourceId: id, objectKey: `clean/test-${crypto.randomUUID()}`, declaredType: "application/pdf", purpose: "REPORT", size: 10, status: "CLEAN" } });
beforeAll(async () => {
  await db.unit.create({ data: { id: sib, name: `Unit ${run}`, groupId: "group-1" } });
  await db.unit.create({ data: { id: bare, name: `Bare unit ${run}`, groupId: "group-2" } });
  await db.user.create({ data: { id: staff, name: staff, email: `${staff}@example.test` } });
  await db.roleAssignment.create({ data: { userId: staff, role: "GROUP_STAFF", appointmentCode: "GP_TRG", level: "GROUP", groupId: "group-1" } });
});
afterAll(async () => {
  await db.attachment.deleteMany({ where: { resourceType: "camp", resourceId: { in: created } } });
  await db.camp.deleteMany({ where: { id: { in: created } } });
  await db.auditEvent.deleteMany({ where: { resourceId: { in: created } } });
  await db.roleAssignment.deleteMany({ where: { userId: staff } });
  await db.user.deleteMany({ where: { id: staff } });
  await db.unit.deleteMany({ where: { id: { in: [sib, bare] } } });
  await db.$disconnect();
});
describe("camps", () => {
  it("a CO plans for their unit with seats for a unit of the same group", async () => {
    const c = await make();
    const camp = await getCamp(await as("co"), c.id);
    expect(camp).toMatchObject({ state: "UPCOMING", report: "NOT_YET", days: 10, allocated: 350, plannedStrength: 400, unit: { id: "unit-1" }, group: { id: "group-1" }, canEdit: true, canReport: false });
    expect(camp.history.map((h) => h.action)).toEqual(["planned"]);
    expect(camp.briefing).toBeNull();
    const briefed = await make("co", { briefing: inDays(7) });
    expect((await getCamp(await as("admin"), briefed.id)).briefing).toBe(inDays(7));
    await updateCamp(await as("co"), briefed.id, { ...edit({ briefing: "" }), version: 1 });
    expect((await getCamp(await as("co"), briefed.id)).briefing).toBeNull();
    await expect(make("co", { briefing: inDays(11) })).rejects.toThrow("Hold the briefing on or before the first day of the camp.");
  });
  it("refuses another unit, another group's seats, over-allocation, a past start and a repeated CATC", async () => {
    await expect(createCamp(await as("co"), plan({ unitId: "unit-2", seats: [{ unitId: "unit-2", seats: 10 }] }))).rejects.toMatchObject({ status: 403 });
    await expect(createCamp(await as("co"), plan({ seats: [{ unitId: "unit-1", seats: 10 }, { unitId: "unit-2", seats: 10 }] }))).rejects.toThrow("Allocate seats only to units of the host unit's group.");
    await expect(createCamp(await as("co"), plan({ plannedStrength: 300 }))).rejects.toMatchObject({ status: 400 });
    await expect(createCamp(await as("co"), plan({ start: istDate() }))).rejects.toThrow("Plan a camp that starts after today.");
    await expect(createCamp(await as("ano"), plan())).rejects.toMatchObject({ status: 403 });
    const first = await make();
    const again = (await getCamp(await as("co"), first.id)).catcNo;
    await expect(createCamp(await as("group"), plan({ catcNo: again, unitId: sib, seats: [{ unitId: sib, seats: 10 }] }))).rejects.toMatchObject({ status: 409 });
  });
  it("group officers plan for any unit of their group; the directorate only reads", async () => {
    expect((await campOptions(await as("group"))).hosts.map((u) => u.id)).toEqual(expect.arrayContaining(["unit-1", sib]));
    expect((await campOptions(await as("admin"))).canPlan).toBe(false);
    expect((await campOptions(await as("ano"))).canPlan).toBe(false);
    const c = await make("group", { unitId: sib, seats: [{ unitId: sib, seats: 50 }, { unitId: "unit-1", seats: 50 }] });
    expect((await getCamp(await as("admin"), c.id)).canEdit).toBe(false);
  });
  it("is seen by the host, units with seats, the group and the directorate, not by others", async () => {
    const c = await make("group", { unitId: sib, seats: [{ unitId: sib, seats: 50 }, { unitId: "unit-1", seats: 20 }] });
    for (const id of ["co", "ano", "group", "admin"]) expect((await listCamps(await as(id))).camps.map((x) => x.id)).toContain(c.id);
    for (const id of ["co2", "group2", "ano2", "cadet"]) await expect(getCamp(await as(id), c.id)).rejects.toMatchObject({ status: 404 });
    // The CO of a unit with seats reads it but does not plan or report it.
    expect((await getCamp(await as("co"), c.id)).canEdit).toBe(false);
  });
  it("lists camps in date order with counts by state", async () => {
    const later = await make("co", { start: inDays(40), end: inDays(42) });
    const sooner = await make("co", { start: inDays(5), end: inDays(6) });
    const list = await listCamps(await as("co"));
    const ids = list.camps.map((c) => c.id);
    expect(ids.indexOf(sooner.id)).toBeLessThan(ids.indexOf(later.id));
    expect(list.states.UPCOMING).toBeGreaterThanOrEqual(2);
    expect((await listCamps(await as("co"), { state: "COMPLETED" })).camps.map((c) => c.id)).not.toContain(sooner.id);
  });
  it("edits and cancels only while upcoming, at the version seen", async () => {
    const c = await make();
    await updateCamp(await as("co"), c.id, { ...edit({ location: "New ground" }), version: 1 });
    await expect(updateCamp(await as("co"), c.id, { ...edit(), version: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await getCamp(await as("co"), c.id)).location).toBe("New ground");
    await expect(cancelCamp(await as("co2"), c.id, { reason: "Not ours", version: 2 })).rejects.toMatchObject({ status: 404 });
    await cancelCamp(await as("co"), c.id, { reason: "Ground flooded", version: 2 });
    const camp = await getCamp(await as("co"), c.id);
    expect([camp.state, camp.cancelReason, camp.history.map((h) => h.action)]).toEqual(["CANCELLED", "Ground flooded", ["planned", "edited", "cancelled"]]);
    const past = await make();
    await over(past.id);
    await expect(cancelCamp(await as("co"), past.id, { reason: "Too late", version: 1 })).rejects.toMatchObject({ status: 409 });
  });
  it("changes follow TD seniority: the planner or someone senior to them", async () => {
    const byCo = await make("co");
    await expect(cancelCamp(await as("ao"), byCo.id, { reason: "AO overrules", version: 1 })).rejects.toThrow("Only the officer who planned this camp or someone senior to them can change it.");
    expect((await getCamp(await as("ao"), byCo.id)).canEdit).toBe(false);
    // Group staff are senior to a unit (a lower formation); so is the Gp Cdr.
    expect((await getCamp(await as(staff), byCo.id)).canEdit).toBe(true);
    await updateCamp(await as(staff), byCo.id, { ...edit({ location: "Moved by group" }), version: 1 });
    const byAo = await make("ao");
    expect((await getCamp(await as("co"), byAo.id)).canEdit).toBe(true);
    const byGroup = await make("group");
    await expect(updateCamp(await as(staff), byGroup.id, { ...edit(), version: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(cancelCamp(await as("co"), byGroup.id, { reason: "CO overrules", version: 1 })).rejects.toMatchObject({ status: 403 });
    await cancelCamp(await as("group"), byCo.id, { reason: "Gp Cdr decides", version: 2 });
  });
  it("report: is due after the camp, needs a file and attendance for every unit, overdue after 15 days", async () => {
    const c = await make();
    await expect(submitReport(await as("co"), c.id, { attendance: [], version: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(uploadIntent(await as("co"), { institutionId: "", resourceType: "camp", resourceId: c.id, declaredType: "application/pdf", size: 100, purpose: "REPORT" })).rejects.toMatchObject({ status: 403 });
    await over(c.id);
    expect((await getCamp(await as("co"), c.id)).report).toBe("DUE");
    await expect(submitReport(await as("co"), c.id, { attendance: [{ unitId: "unit-1", attended: 240 }, { unitId: sib, attended: 90 }], version: 1 })).rejects.toThrow("Upload the camp report before submitting.");
    await fileFor(c.id, "co");
    await expect(submitReport(await as("co"), c.id, { attendance: [{ unitId: "unit-1", attended: 240 }], version: 1 })).rejects.toThrow("Enter attendance for every unit with seats.");
    await expect(uploadIntent(await as("co2"), { institutionId: "", resourceType: "camp", resourceId: c.id, declaredType: "application/pdf", size: 100, purpose: "REPORT" })).rejects.toMatchObject({ status: 404 });
    const late = await make();
    await over(late.id, 16);
    expect((await getCamp(await as("co"), late.id)).report).toBe("OVERDUE");
  });
  it("report: the host submits, the group returns with a remark, the host fixes and the group accepts; never the submitter", async () => {
    const c = await make();
    await over(c.id);
    await fileFor(c.id, "co");
    await submitReport(await as("co"), c.id, { attendance: [{ unitId: "unit-1", attended: 240 }, { unitId: sib, attended: 90 }], version: 1 });
    let camp = await getCamp(await as("group"), c.id);
    expect([camp.report, camp.attended, camp.canReview, camp.seats.find((s) => s.unitId === sib)?.attended]).toEqual(["SUBMITTED", 330, true, 90]);
    await expect(decideReport(await as("co"), c.id, { decision: "ACCEPT", version: 2 })).rejects.toMatchObject({ status: 403 });
    await expect(decideReport(await as("admin"), c.id, { decision: "ACCEPT", version: 2 })).rejects.toMatchObject({ status: 403 });
    await expect(decideReport(await as("group"), c.id, { decision: "RETURN", remarks: "", version: 2 })).rejects.toThrow("Say what needs fixing.");
    await decideReport(await as("group"), c.id, { decision: "RETURN", remarks: "Attendance sheet missing", version: 2 });
    camp = await getCamp(await as("co"), c.id);
    expect([camp.report, camp.returnRemarks, camp.canReport]).toEqual(["RETURNED", "Attendance sheet missing", true]);
    await submitReport(await as("ao"), c.id, { attendance: [{ unitId: "unit-1", attended: 238 }, { unitId: sib, attended: 90 }], version: 3 });
    await decideReport(await as(staff), c.id, { decision: "ACCEPT", version: 4 });
    camp = await getCamp(await as("admin"), c.id);
    expect([camp.report, camp.attended, camp.rounds.map((r) => r.decision)]).toEqual(["ACCEPTED", 328, ["RETURNED", "ACCEPTED"]]);
    // The directorate (DDG and staff) sees every report, file and remark, but does not review.
    const dir = `tcd-${run}`;
    await db.user.create({ data: { id: dir, name: dir, email: `${dir}@example.test` } });
    await db.roleAssignment.create({ data: { userId: dir, role: "DTE_STAFF", appointmentCode: "AD_ADM", level: "DIRECTORATE", directorateId: "dte-up" } });
    try {
      for (const id of ["admin", dir]) {
        const seen = await getCamp(await as(id), c.id);
        expect([seen.files.length, seen.rounds.map((r) => r.remarks), seen.canReview, seen.canReport]).toEqual([1, ["Attendance sheet missing", ""], false, false]);
        expect(await listAttachments(await as(id), "camp", c.id, "")).toHaveLength(1);
        expect((await listCamps(await as(id), { report: "ACCEPTED" })).camps.map((x) => x.id)).toContain(c.id);
      }
    } finally {
      await db.roleAssignment.deleteMany({ where: { userId: dir } });
      await db.user.deleteMany({ where: { id: dir } });
    }
    const own = await make("group", { unitId: sib, seats: [{ unitId: sib, seats: 10 }] });
    await over(own.id);
    await fileFor(own.id, "group");
    await submitReport(await as("group"), own.id, { attendance: [{ unitId: sib, attended: 9 }], version: 1 });
    await expect(decideReport(await as("group"), own.id, { decision: "ACCEPT", version: 2 })).rejects.toThrow("You cannot review a report you submitted.");
    // Nobody in the group is senior to the Gp Cdr: the directorate reviews it.
    await expect(decideReport(await as(staff), own.id, { decision: "RETURN", remarks: "Staff overrules", version: 2 })).rejects.toThrow("Only an officer senior to the one who submitted the report can review it.");
    expect((await getCamp(await as(staff), own.id)).canReview).toBe(false);
    expect((await getCamp(await as("admin"), own.id)).canReview).toBe(true);
    await decideReport(await as("admin"), own.id, { decision: "ACCEPT", version: 2 });
    // A report by group staff goes to the Gp Cdr, not another staff peer.
    const byStaff = await make(staff, { unitId: sib, seats: [{ unitId: sib, seats: 10 }] });
    await over(byStaff.id);
    await fileFor(byStaff.id, staff);
    await submitReport(await as(staff), byStaff.id, { attendance: [{ unitId: sib, attended: 8 }], version: 1 });
    expect((await getCamp(await as("admin"), byStaff.id)).canReview).toBe(false);
    expect((await getCamp(await as("group"), byStaff.id)).canReview).toBe(true);
    await expect(decideReport(await as("admin"), byStaff.id, { decision: "RETURN", remarks: "Directorate overrules", version: 2 })).rejects.toMatchObject({ status: 403 });
  });
  it("strength: seats and attendance per unit, units with no seats flagged", async () => {
    const s = await campStrength(await as("group"));
    const g1 = s.groups.find((g) => g.id === "group-1")!;
    const unit1 = g1.units.find((u) => u.id === "unit-1")!;
    expect(unit1.seats).toBeGreaterThan(0);
    expect(unit1.hosted).toBeGreaterThan(0);
    expect(s.groups.map((g) => g.id)).toEqual(["group-1"]);
    expect((await campStrength(await as("admin"))).groups.map((g) => g.id)).toEqual(expect.arrayContaining(["group-1", "group-2"]));
    expect((await campStrength(await as("admin"))).groups.find((g) => g.id === "group-2")!.units.find((u) => u.id === bare)).toMatchObject({ camps: 0, seats: 0 });
    expect((await campStrength(await as("cadet"))).groups).toEqual([]);
  });
});
