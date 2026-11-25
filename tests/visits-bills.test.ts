import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById, type Actor } from "../src/server/authorization";
import { transitionClaim } from "../src/modules/finance/service";
import { createRefreshment, createHonorarium, getBill, listBills, billInbox, billSummary } from "../src/modules/bills/service";
import { createVisit, listVisits, submitVisit, visitExceptions, createInstitution, updateInstitution, deactivateInstitution, editableUnits, listInstitutions } from "../src/modules/visits/service";
import { decryptField } from "../src/server/crypto";
import { parseList } from "../src/modules/platform/query";
const actors: Record<string, Actor> = {};
const claimIds: string[] = [];
const visitIds: string[] = [];
const institutionIds: string[] = [];
let subjectId = "";
beforeAll(async () => {
  for (const id of ["ano", "co", "group", "admin", "cadet", "ano2", "co2"]) {
    actors[id] = await actorById(id);
  }
  subjectId = (await db.subject.findFirstOrThrow()).id;
});
afterAll(async () => {
  await db.user.updateMany({ where: { id: { in: ["co", "co2"] } }, data: { autoRecommend: false } });
  await db.approvalRequest.deleteMany({ where: { resourceId: { in: claimIds } } });
  await db.attachment.deleteMany({ where: { resourceId: { in: claimIds } } });
  await db.approvalAction.deleteMany({ where: { claimId: { in: claimIds } } });
  await db.claimLineItem.deleteMany({ where: { claimId: { in: claimIds } } });
  await db.claim.deleteMany({ where: { id: { in: claimIds } } });
  await db.visit.deleteMany({ where: { id: { in: visitIds } } });
  await db.institution.deleteMany({ where: { id: { in: institutionIds } } });
  await db.$disconnect();
});
let day = 10;
const refreshment = (over: Record<string, unknown> = {}) => {
  const d = `2026-06-${String(day++).padStart(2, "0")}`;
  return {
    institutionId: "institution-1",
    category: "DEMO",
    instructorName: "Test Officer",
    instructorAppointment: "ANO",
    claimedRupees: "500",
    idempotencyKey: crypto.randomUUID(),
    trainingStart: `${d}T10:00`,
    trainingEnd: `${d}T12:00`,
    instructorMobile: "9876543210",
    cadetsPresent: 30,
    subjectIds: [subjectId],
    periods: 3,
    ...over,
  };
};
async function bill(owner = "ano", over: Record<string, unknown> = {}) {
  const c = await createRefreshment(actors[owner], refreshment(over));
  claimIds.push(c.id);
  return c;
}
// Simulates a completed upload so the evidence rule can be exercised without S3.
const evidence = (claimId: string, purpose = "BILL", institutionId = "institution-1") =>
  db.attachment.create({
    data: { ownerId: "ano", institutionId, resourceType: "claim", resourceId: claimId, objectKey: `test/${crypto.randomUUID()}`, declaredType: "image/png", size: 10, status: "SCANNING", purpose },
  });
describe("bills and the approval chain", () => {
  it("stores the mobile number encrypted and masks it in lists", async () => {
    const c = await bill();
    const detail = await db.refreshmentDetail.findUniqueOrThrow({ where: { claimId: c.id } });
    expect(detail.instructorMobileEnc).not.toContain("9876543210");
    expect(decryptField(detail.instructorMobileEnc)).toBe("9876543210");
    const list = await listBills(actors.ano, "REFRESHMENT", parseList({ year: "2026-2027" }));
    expect(list.rows.find((r) => r.id === c.id)?.refreshment?.instructorMobile).toBe("••••••3210");
    expect((await getBill(actors.ano, c.id)).refreshment?.instructorMobile).toBe("9876543210");
  });
  it("rejects training outside 08:00-18:00 and in the future", async () => {
    await expect(createRefreshment(actors.ano, refreshment({ trainingStart: "2026-06-01T07:00", trainingEnd: "2026-06-01T09:00" }))).rejects.toThrow("between 08:00 and 18:00");
    await expect(createRefreshment(actors.ano, refreshment({ trainingStart: "2099-01-01T10:00", trainingEnd: "2099-01-01T11:00" }))).rejects.toThrow("future");
  });
  it("cadets cannot create bills", async () => {
    await expect(createRefreshment(actors.cadet, refreshment())).rejects.toThrow("Cadets");
  });
  it("requires the bill upload before submission", async () => {
    const c = await bill();
    await expect(transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" })).rejects.toThrow("Upload the refreshment bill");
  });
  it("accepts an amount above the policy figure and leaves the decision to the approvers", async () => {
    // DEMO fixture: 30 cadets x Rs 25 = Rs 750 at the policy rate, kept only as a reference.
    const c = await bill("ano", { claimedRupees: "900" });
    await evidence(c.id);
    await transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" });
    const saved = await db.claim.findUniqueOrThrow({ where: { id: c.id } });
    expect(saved.totalPaise).toBe(90000n);
    expect((await getBill(actors.ano, c.id)).entitlementPaise).toBe("75000");
  });
  it("CO recommends, only the Group Commander approves, payable is the claimed amount", async () => {
    const c = await bill("ano", { claimedRupees: "600.50" });
    await evidence(c.id);
    await transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" });
    expect((await billInbox(actors.co)).map((b) => b.id)).toContain(c.id);
    expect((await billInbox(actors.group)).map((b) => b.id)).not.toContain(c.id);
    await expect(transitionClaim(actors.co, { id: c.id, version: 2, action: "APPROVE" })).rejects.toThrow("cannot approve");
    await transitionClaim(actors.co, { id: c.id, version: 2, action: "REVIEW" });
    await expect(transitionClaim(actors.co, { id: c.id, version: 3, action: "APPROVE" })).rejects.toThrow("Group Commander");
    await transitionClaim(actors.group, { id: c.id, version: 3, action: "APPROVE" });
    const saved = await db.claim.findUniqueOrThrow({ where: { id: c.id } });
    expect(saved.state).toBe("APPROVED");
    expect(saved.totalPaise).toBe(60050n);
    const t = (await getBill(actors.ano, c.id)).approval!;
    expect(t.steps.map((s) => s.outcome)).toEqual(["SUBMITTED", "RECOMMENDED", "APPROVED"]);
  });
  it("System R recommends automatically for an opted-in CO, never for own requests", async () => {
    await db.user.update({ where: { id: "co" }, data: { autoRecommend: true } });
    const c = await bill();
    await evidence(c.id);
    const r = await transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" });
    expect(r.state).toBe("UNDER_REVIEW");
    const steps = (await getBill(actors.ano, c.id)).approval!.steps;
    expect(steps[1]).toMatchObject({ outcome: "RECOMMENDED", system: true, remarks: "System R" });
    const own = await bill("co");
    await evidence(own.id);
    expect((await transitionClaim(actors.co, { id: own.id, version: 1, action: "SUBMIT" })).state).toBe("SUBMITTED");
    await db.user.update({ where: { id: "co" }, data: { autoRecommend: false } });
  });
  it("return requires remarks and restarts the chain on resubmission", async () => {
    const c = await bill();
    await evidence(c.id);
    await transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" });
    await expect(transitionClaim(actors.co, { id: c.id, version: 2, action: "RETURN" })).rejects.toThrow("Explain");
    await transitionClaim(actors.co, { id: c.id, version: 2, action: "RETURN", comment: "Bill unreadable" });
    await transitionClaim(actors.ano, { id: c.id, version: 3, action: "SUBMIT" });
    const req = await db.approvalRequest.findUniqueOrThrow({ where: { workflow_resourceId: { workflow: "BILL", resourceId: c.id } } });
    expect(req).toMatchObject({ cycle: 2, stageIndex: 0, status: "PENDING" });
  });
  it("another unit's CO cannot see or act on the bill", async () => {
    const c = await bill();
    await evidence(c.id);
    await transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" });
    expect((await billInbox(actors.co2)).map((b) => b.id)).not.toContain(c.id);
    await expect(transitionClaim(actors.co2, { id: c.id, version: 2, action: "REVIEW" })).rejects.toThrow("not found");
    await expect(getBill(actors.co2, c.id)).rejects.toThrow("not found");
  });
  it("honorarium needs a supporting document and summarises by unit", async () => {
    const h = await createHonorarium(actors.ano, {
      institutionId: "institution-1", category: "DEMO", instructorName: "Test ANO", instructorRank: "Lt", instructorAppointment: "ANO",
      claimedRupees: "1000", idempotencyKey: crypto.randomUUID(), periodStart: "2026-05-01", periodEnd: "2026-05-31",
    });
    claimIds.push(h.id);
    await expect(transitionClaim(actors.ano, { id: h.id, version: 1, action: "SUBMIT" })).rejects.toThrow("supporting document");
    await evidence(h.id, "DOCUMENT");
    await transitionClaim(actors.ano, { id: h.id, version: 1, action: "SUBMIT" });
    const summary = await billSummary(actors.group, "HONORARIUM", "2026-2027");
    expect(summary.rows.find((r) => r.unitId === "unit-1")?.submitted).toBeGreaterThan(0);
  });
});
describe("visits and institutions", () => {
  const visit = (over: Record<string, unknown> = {}) => ({
    institutionId: "institution-1", startsAt: "2026-07-01T10:00", endsAt: "2026-07-01T12:00", purpose: "Test visit",
    visitorName: "Test Visitor", visitorRank: "Hav", visitorAppointment: "PI", subjectIds: [subjectId], periods: 2, cadetsPresent: 25, ...over,
  });
  it("validates times and saves, edits and records a visit", async () => {
    await expect(createVisit(actors.ano, visit({ endsAt: "2026-07-01T09:00" }))).rejects.toThrow("End must be after start");
    await expect(createVisit(actors.ano, visit({ periods: 11 }))).rejects.toThrow();
    const v = await createVisit(actors.ano, visit());
    visitIds.push(v.id);
    await submitVisit(actors.ano, v.id, { version: 1 });
    await expect(submitVisit(actors.ano, v.id, { version: 1 })).rejects.toThrow("changed");
  });
  it("scopes visit lists and supports comma-separated search", async () => {
    const mine = await listVisits(actors.co, parseList({ year: "2026-2027", q: "Test visit, Test Visitor" }));
    expect(mine.rows.every((r) => r.institution.unit.id === "unit-1")).toBe(true);
    const other = await listVisits(actors.co2, parseList({ year: "2026-2027", q: "Test visit" }));
    expect(other.rows.some((r) => visitIds.includes(r.id))).toBe(false);
  });
  it("cadets cannot record visits", async () => {
    await expect(createVisit(actors.cadet, visit())).rejects.toThrow("Not permitted");
  });
  it("lists units without visits as exceptions", async () => {
    const e = await visitExceptions(actors.admin, "2024-2025");
    expect(e.noVisit.map((u) => u.id)).toEqual(expect.arrayContaining(["unit-1"]));
  });
  it("only unit staff above ANO can add institutions; coordinates are coarse", async () => {
    await expect(createInstitution(actors.ano, { name: "Test School", district: "Lucknow", unitId: "unit-1" })).rejects.toThrow("Not permitted");
    await expect(createInstitution(actors.co2, { name: "Test School", district: "Lucknow", unitId: "unit-1" })).rejects.toThrow("Not permitted");
    const i = await createInstitution(actors.co, { name: "Test School", district: "Lucknow", unitId: "unit-1", latitude: 26.84712, longitude: 80.94661 });
    institutionIds.push(i.id);
    expect(i.latitude?.toNumber()).toBe(26.847);
  });
  it("offers each editor only their own units", async () => {
    expect((await editableUnits(actors.co)).map((u) => u.id)).toEqual(["unit-1"]);
    expect((await editableUnits(actors.co2)).map((u) => u.id)).toEqual(["unit-2"]);
    expect(await editableUnits(actors.ano)).toEqual([]);
    expect(await editableUnits(actors.cadet)).toEqual([]);
  });
  it("edits with a version check and deactivates without deleting", async () => {
    const base = { name: "Test Edit School", district: "Lucknow", unitId: "unit-1" };
    const i = await createInstitution(actors.co, base);
    institutionIds.push(i.id);
    await expect(updateInstitution(actors.co2, i.id, { ...base, version: 1 })).rejects.toThrow("Not permitted");
    await expect(updateInstitution(actors.co, i.id, { ...base, unitId: "unit-2", version: 1 })).rejects.toThrow("Not permitted");
    const u = await updateInstitution(actors.co, i.id, { ...base, district: "Lucknow North", version: 1 });
    await expect(updateInstitution(actors.co, i.id, { ...base, district: "Lucknow South", version: 1 })).rejects.toThrow("changed");
    await deactivateInstitution(actors.co, i.id, { version: u.version });
    const list = await listInstitutions(actors.co, parseList({ q: "Test Edit School" }));
    expect(list.rows.some((r) => r.id === i.id)).toBe(false);
    expect((await db.institution.findUniqueOrThrow({ where: { id: i.id } })).active).toBe(false);
  });
});
