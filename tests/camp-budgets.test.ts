import { afterAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { istDate } from "../src/modules/platform/training-year";
import { createCamp } from "../src/modules/camps/service";
import { budgetInbox, cancelBudget, createBudget, decideBudget, getCampBudgets, listBudgets, referenceFor, resubmitBudget } from "../src/modules/camps/budgets";
// Camp budgets in the service layer. Seeded: co, ao (unit-1), co2 (unit-2),
// group (Gp Cdr, group-1), admin (DDG), dir (Director), unit-1b in group-1,
// synthetic CAMP rates (messing 150/cadet-day, ANO DA 500/day).
const run = crypto.randomUUID().slice(0, 8);
const camps: string[] = [];
const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.parse(`${istDate()}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const as = (id: string) => actorById(id);
let n = 0;
const camp = async (by = "co") => {
  const c = await createCamp(await as(by), { unitId: "unit-1", catcNo: `B-${run}-${++n}`, location: "Budget ground", start: inDays(10), end: inDays(19), plannedStrength: 300, seats: [{ unitId: "unit-1", seats: 200 }, { unitId: "unit-1b", seats: 80 }] });
  camps.push(c.id);
  return c.id;
};
// Holds a camp running (-2..+7) or over (-12..-3); only the planning rule stops this.
const when = (id: string, state: "CURRENT" | "COMPLETED") =>
  db.camp.update({ where: { id }, data: state === "CURRENT" ? { startDate: new Date(`${inDays(-2)}T00:00:00Z`), endDate: new Date(`${inDays(7)}T00:00:00Z`) } : { startDate: new Date(`${inDays(-12)}T00:00:00Z`), endDate: new Date(`${inDays(-3)}T00:00:00Z`) } });
const lines = (messing = "450000", bus = "60000") => [
  { head: "CADET_MESSING", amount: messing },
  { head: "ANO_DA", amount: "50000" },
  { head: "BUS_FARE", amount: bus, note: "Two buses" },
  { head: "FUEL_DIESEL", quantity: 200, amount: "18000" },
];
const budget = (campId: string, stage = "INITIAL", by = "co", extra: object = {}) => as(by).then((a) => createBudget(a, { campId, stage, cadets: 280, anos: 10, staff: 4, lines: lines(), ...extra }));
const version = async (id: string) => (await db.campBudget.findUniqueOrThrow({ where: { id } })).version;
const decideAs = async (by: string, id: string, decision: string, extra: object = {}) => decideBudget(await as(by), id, { decision, remarks: "", version: await version(id), ...extra });
afterAll(async () => {
  const ids = (await db.campBudget.findMany({ where: { campId: { in: camps } }, select: { id: true } })).map((b) => b.id);
  await db.approvalRequest.deleteMany({ where: { workflow: "CAMP_BUDGET", resourceId: { in: ids } } });
  await db.campBudget.deleteMany({ where: { id: { in: ids } } });
  await db.auditEvent.deleteMany({ where: { resourceId: { in: [...ids, ...camps] } } });
  await db.camp.deleteMany({ where: { id: { in: camps } } });
  await db.$disconnect();
});
describe("camp budgets", () => {
  it("initial: the host prepares, the Gp Cdr recommends, the DDG sanctions up to the demand", async () => {
    const c = await camp();
    const b = await budget(c);
    expect(b.status).toBe("PENDING");
    const row = await db.campBudget.findUniqueOrThrow({ where: { id: b.id } });
    expect([row.demandedPaise, row.days, row.cadets]).toEqual([57800000n, 10, 280]);
    expect((await budgetInbox(await as("group"))).map((r) => r.id)).toContain(b.id);
    expect((await budgetInbox(await as("admin"))).map((r) => r.id)).not.toContain(b.id);
    await expect(decideAs("admin", b.id, "APPROVE")).rejects.toMatchObject({ status: 403 });
    await decideAs("group", b.id, "RECOMMEND");
    await expect(decideAs("admin", b.id, "APPROVE", { sanctioned: "600000" })).rejects.toThrow("Sanction an amount above zero and up to the amount demanded.");
    await decideAs("admin", b.id, "APPROVE", { sanctioned: "500000" });
    const done = await db.campBudget.findUniqueOrThrow({ where: { id: b.id } });
    expect([done.status, done.sanctionedPaise]).toEqual(["APPROVED", 50000000n]);
    const view = await getCampBudgets(await as("dir"), c);
    const initial = view.stages.find((s) => s.stage === "INITIAL")!;
    expect([initial.budget?.sanctionedPaise, initial.budget?.route?.status, initial.canPrepare]).toEqual(["50000000", "APPROVED", false]);
    expect(initial.budget?.lines.BUS_FARE).toMatchObject({ amountPaise: "6000000", note: "Two buses" });
  });
  it("refuses other units, a second open budget, an empty budget, and the wrong stage window", async () => {
    const c = await camp();
    await expect(budget(c, "INITIAL", "co2")).rejects.toMatchObject({ status: 404 });
    await expect(budget(c, "INITIAL", "dir")).rejects.toMatchObject({ status: 403 });
    await expect(budget(c, "INITIAL", "co", { lines: [{ head: "MISC", amount: "" }] })).rejects.toThrow("Enter at least one amount.");
    await expect(budget(c, "INITIAL", "co", { lines: [{ head: "MISC", amount: "1" }, { head: "MISC", amount: "2" }] })).rejects.toThrow("List each head once.");
    await budget(c);
    await expect(budget(c, "INITIAL", "ao")).rejects.toThrow("This stage already has a budget.");
    await expect(budget(c, "REVISED")).rejects.toThrow("The initial budget must be sanctioned first.");
    await expect(budget(c, "FINAL")).rejects.toThrow("The initial budget must be sanctioned first.");
  });
  it("revised while running, final after; each needs the initial sanctioned", async () => {
    const c = await camp();
    const initial = await budget(c);
    await decideAs("group", initial.id, "RECOMMEND");
    await decideAs("admin", initial.id, "APPROVE");
    await expect(budget(c, "REVISED")).rejects.toThrow("A revised budget is prepared while the camp is running.");
    await when(c, "CURRENT");
    const revised = await budget(c, "REVISED", "co", { lines: lines("480000") });
    expect(revised.status).toBe("PENDING");
    await expect(budget(c, "FINAL")).rejects.toThrow("The final budget is prepared after the camp ends.");
    await when(c, "COMPLETED");
    expect((await listBudgets(await as("admin"), { queue: "due" })).due.map((d) => d.id)).toContain(c);
    const final = await budget(c, "FINAL", "co", { cadets: 268, lines: lines("402000", "58000") });
    await decideAs("group", final.id, "RECOMMEND");
    await decideAs("admin", final.id, "APPROVE");
    expect((await listBudgets(await as("admin"), { queue: "due" })).due.map((d) => d.id)).not.toContain(c);
    const view = await getCampBudgets(await as("co"), c);
    expect(view.stages.map((s) => s.budget?.stage)).toEqual(["INITIAL", "REVISED", "FINAL"]);
  });
  it("return, edit and resubmit by the preparer only; cancel, then prepare again", async () => {
    const c = await camp();
    const b = await budget(c);
    await decideAs("group", b.id, "RETURN", { remarks: "Bus fare looks high." });
    await expect(resubmitBudget(await as("ao"), b.id, { cadets: 280, anos: 10, staff: 4, lines: lines(), version: await version(b.id) })).rejects.toThrow("Only the officer who prepared this budget can change it.");
    await resubmitBudget(await as("co"), b.id, { cadets: 280, anos: 10, staff: 4, lines: lines("450000", "40000"), version: await version(b.id) });
    const after = await getCampBudgets(await as("co"), c);
    const initial = after.stages[0].budget!;
    expect([initial.status, initial.demandedPaise, initial.submissions.length]).toEqual(["PENDING", "55800000", 2]);
    await cancelBudget(await as("co"), b.id, { version: await version(b.id) });
    expect((await getCampBudgets(await as("co"), c)).stages[0].canPrepare).toBe(true);
    const again = await budget(c);
    expect(again.status).toBe("PENDING");
  });
  it("a Gp Cdr's budget goes straight to the DDG; the preparer never decides", async () => {
    const c = await camp("group");
    const b = await budget(c, "INITIAL", "group");
    expect((await db.approvalRequest.findUniqueOrThrow({ where: { workflow_resourceId: { workflow: "CAMP_BUDGET", resourceId: b.id } } })).stageIndex).toBe(1);
    expect((await budgetInbox(await as("admin"))).map((r) => r.id)).toContain(b.id);
    await expect(decideAs("group", b.id, "RECOMMEND")).rejects.toMatchObject({ status: 403 });
  });
  it("lists by queue with counts; the directorate sees every budget", async () => {
    const c = await camp();
    const b = await budget(c);
    const forGroup = await listBudgets(await as("group"), { queue: "pending" });
    expect(forGroup.rows.map((r) => r.id)).toContain(b.id);
    expect(forGroup.counts.pending).toBeGreaterThanOrEqual(1);
    expect((await listBudgets(await as("dir"), { queue: "process" })).rows.map((r) => r.id)).toContain(b.id);
    expect((await listBudgets(await as("co2"), { queue: "process" })).rows.map((r) => r.id)).not.toContain(b.id);
  });
  it("shows reference figures from the dated rates", async () => {
    const c = await camp();
    const view = await getCampBudgets(await as("co"), c);
    expect(view.syntheticRates).toBe(true);
    expect(view.defaults.cadets).toBe(280);
    expect(referenceFor("CADET_MESSING", { cadets: 280, anos: 10, staff: 4, days: view.camp.days }, null, view.rates.CADET_MESSING)).toBe(280n * 10n * 15000n);
    expect(referenceFor("BUS_FARE", { cadets: 280, anos: 10, staff: 4, days: 10 }, null, view.rates.BUS_FARE)).toBeNull();
  });
});
