import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { decide, holds, openRequest, pendingWhere, routes, type Chain } from "../src/modules/approvals/engine";
// The engine beyond bills: requests anchored to a unit, group or directorate,
// stages held by a post or a duty, start part-way, traveller never decides.
// Seeded: group (Gp Cdr, group-1), group2 (Gp Cdr, group-2), admin (DDG).
const run = crypto.randomUUID().slice(0, 8);
const u = { ao: `eao-${run}`, dgc: `edgc-${run}`, branch: `ebr-${run}`, dir: `edir-${run}`, adg: `eadg-${run}` };
const unitChain: Chain = { level: "UNIT", institutionId: null, unitId: "unit-1", groupId: "group-1", directorateId: "dte-up" };
const stage = (code: string) => routes.TD.stages.find((s) => s.code === code)!;
const open = (resourceId: string, startIndex = 0, travellerId: string | null = null) =>
  db.$transaction((tx) => openRequest(tx, { workflow: "TD", resourceId, requesterId: u.ao, travellerId, chain: unitChain, startIndex }));
const pendingFor = async (userId: string, resourceId: string) =>
  !!(await db.approvalRequest.findFirst({ where: { AND: [await pendingWhere(await actorById(userId)), { resourceId }] } }));
const decideAs = async (userId: string, resourceId: string, decision: "RECOMMEND" | "RETURN" | "APPROVE") =>
  db.$transaction(async (tx) => decide(tx, await actorById(userId), { workflow: "TD", resourceId, decision, remarks: decision === "RETURN" ? "Fix dates" : "" }));
beforeAll(async () => {
  const posts = [
    [u.ao, "CO", "AO", { level: "UNIT", unitId: "unit-1" }, []],
    [u.dgc, "GROUP_STAFF", "DGC", { level: "GROUP", groupId: "group-1" }, []],
    [u.branch, "DTE_STAFF", "BR_PNC", { level: "DIRECTORATE", directorateId: "dte-up" }, ["movement"]],
    [u.dir, "DTE_STAFF", "DIR", { level: "DIRECTORATE", directorateId: "dte-up" }, []],
    [u.adg, "ADMIN", "ADG", { level: "DIRECTORATE", directorateId: "dte-up" }, []],
  ] as const;
  for (const [id, role, appointmentCode, anchor, capabilities] of posts)
    await db.user.create({ data: { id, name: id, email: `${id}@example.test`, assignments: { create: { role, appointmentCode, capabilities: [...capabilities], ...anchor } } } });
});
afterAll(async () => {
  const ids = Object.values(u);
  await db.approvalRequest.deleteMany({ where: { requesterId: { in: ids } } });
  await db.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
describe("approval engine: formations, posts and duties", () => {
  it("matches TD stage holders by post, duty and scope", async () => {
    const one = async (id: string) => (await actorById(id)).assignments[0];
    expect(holds(await one("group"), stage("GP_CDR"), unitChain)).toBe(true);
    expect(holds(await one("group2"), stage("GP_CDR"), unitChain)).toBe(false);
    expect(holds(await one(u.dgc), stage("GP_CDR"), unitChain)).toBe(false);
    expect(holds(await one(u.branch), stage("BRANCH"), unitChain)).toBe(true);
    expect(holds(await one(u.dir), stage("BRANCH"), unitChain)).toBe(false);
    expect(holds(await one(u.dir), stage("DIR"), unitChain)).toBe(true);
    expect(holds(await one("admin"), stage("DDG"), unitChain)).toBe(true);
    expect(holds(await one("admin"), stage("ADG"), unitChain)).toBe(false);
    expect(holds(await one(u.adg), stage("DDG"), unitChain)).toBe(false);
  });
  it("opens at a start index and waits at that step", async () => {
    const id = `res-${run}-start`;
    const req = await open(id, 1);
    expect(req.stageIndex).toBe(1);
    expect(req.startIndex).toBe(1);
    expect(await pendingFor(u.branch, id)).toBe(true);
    expect(await pendingFor("group", id)).toBe(false);
  });
  it("approves at once when the start is past the end of the chain", async () => {
    const id = `res-${run}-top`;
    const req = await open(id, routes.TD.stages.length);
    expect(req.status).toBe("APPROVED");
    const steps = await db.approvalStep.findMany({ where: { requestId: req.id } });
    expect(steps.map((s) => s.stageCode)).toEqual(["TOP"]);
  });
  it("walks the full chain from the Gp Cdr to the ADG", async () => {
    const id = `res-${run}-full`;
    await open(id);
    for (const who of ["group", u.branch, u.dir, "admin"]) {
      expect(await pendingFor(who, id)).toBe(true);
      await decideAs(who, id, "RECOMMEND");
    }
    const done = await decideAs(u.adg, id, "APPROVE");
    expect(done.status).toBe("APPROVED");
  });
  it("never lets the traveller decide", async () => {
    const id = `res-${run}-trav`;
    await open(id, 2, u.dir);
    expect(await pendingFor(u.dir, id)).toBe(false);
    await expect(decideAs(u.dir, id, "RECOMMEND")).rejects.toThrow("You cannot approve your own submission.");
  });
  it("restarts at the start index after a return", async () => {
    const id = `res-${run}-ret`;
    await open(id, 1);
    await decideAs(u.branch, id, "RECOMMEND");
    await decideAs(u.dir, id, "RETURN");
    const again = await open(id, 1);
    expect(again.stageIndex).toBe(1);
    expect(again.cycle).toBe(2);
  });
});
