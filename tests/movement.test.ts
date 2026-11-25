import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { istDate } from "../src/modules/platform/training-year";
import { parseList } from "../src/modules/platform/query";
import { timeline } from "../src/modules/approvals/engine";
import { cancelTd, createTd, decideTd, getTd, listTd, markTdSeen, resubmitTd, tdInbox, tdNotices, tdOptions } from "../src/modules/movement/service";
// TD requests end to end in the service layer. Seeded: group (Gp Cdr,
// group-1), group2 (Gp Cdr, group-2), admin (DDG). Everyone else is made here.
const run = crypto.randomUUID().slice(0, 8);
const u = {
  ao: `tao-${run}`,
  trav: `ttrav-${run}`,
  gone: `tgone-${run}`,
  two: `ttwo-${run}`,
  branch: `tbr-${run}`,
  dir: `tdir-${run}`,
  adg: `tadg-${run}`,
  lone: `tlone-${run}`,
};
// A group with no Group Commander, so its first step is vacant.
const empty = { group: `tg-${run}`, unit: `tu-${run}` };
const created: string[] = [];
const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.parse(`${istDate()}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const as = (id: string) => actorById(id);
const postOf = async (userId: string, groupId?: string) =>
  (await db.roleAssignment.findFirstOrThrow({ where: { userId, active: true, ...(groupId ? { groupId } : {}) } })).id;
const fields = (start = inDays(5), end = start) => ({
  from: "Unit 1",
  to: "Lucknow",
  start: { date: start, half: "FN" },
  end: { date: end, half: "AN" },
  purpose: "Court of inquiry",
  ownArrangement: false,
});
const keep = <T extends { id: string }>(td: T) => (created.push(td.id), td);
const own = async (userId: string, extra: object = {}) =>
  keep(await createTd(await as(userId), { mode: "OWN", postId: await postOf(userId), ...fields(), ...extra }));
const send = async (by: string, traveller: object, extra: object = {}) =>
  keep(await createTd(await as(by), { mode: "SEND", traveller, ...fields(), ...extra }));
const version = async (id: string) => (await db.tdRequest.findUniqueOrThrow({ where: { id } })).version;
const decideAs = async (userId: string, id: string, decision: string, remarks = "") =>
  decideTd(await as(userId), id, { decision, remarks, version: await version(id) });
const typedPi = { name: "B. Yadav", rank: "Sub", formation: { level: "UNIT", id: "unit-1" } };
beforeAll(async () => {
  await db.group.create({ data: { id: empty.group, name: `Group ${run}`, directorateId: "dte-up", units: { create: { id: empty.unit, name: `Unit ${run}` } } } });
  const posts = [
    [u.ao, "CO", "AO", { level: "UNIT", unitId: "unit-1" }, []],
    [u.trav, "CO", "AO", { level: "UNIT", unitId: "unit-1" }, []],
    [u.gone, "CO", "AO", { level: "UNIT", unitId: "unit-1" }, []],
    [u.two, "GROUP_STAFF", "GP_TRG", { level: "GROUP", groupId: "group-1" }, []],
    [u.two, "GROUP_STAFF", "DGC", { level: "GROUP", groupId: "group-2" }, []],
    [u.branch, "DTE_STAFF", "BR_PNC", { level: "DIRECTORATE", directorateId: "dte-up" }, ["movement"]],
    [u.dir, "DTE_STAFF", "DIR", { level: "DIRECTORATE", directorateId: "dte-up" }, []],
    [u.adg, "ADMIN", "ADG", { level: "DIRECTORATE", directorateId: "dte-up" }, []],
    [u.lone, "CO", "AO", { level: "UNIT", unitId: empty.unit }, []],
  ] as const;
  for (const [id, role, appointmentCode, anchor, capabilities] of posts)
    await db.user.upsert({
      where: { id },
      create: { id, name: id, email: `${id}@example.test` },
      update: {},
    }).then(() => db.roleAssignment.create({ data: { userId: id, role, appointmentCode, capabilities: [...capabilities], ...anchor } }));
});
afterAll(async () => {
  const ids = Object.values(u);
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.approvalRequest.deleteMany({ where: { workflow: "TD", resourceId: { in: created } } });
  await db.tdSubmission.deleteMany({ where: { tdId: { in: created } } });
  await db.tdRequest.deleteMany({ where: { id: { in: created } } });
  await db.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.unit.deleteMany({ where: { id: empty.unit } });
  await db.group.deleteMany({ where: { id: empty.group } });
  await db.$disconnect();
});
describe("temporary duty", () => {
  it("an AO's own TD starts at the Gp Cdr and ends approved by the ADG", async () => {
    const td = await own(u.ao);
    expect(td.status).toBe("PENDING");
    await expect(decideAs(u.branch, td.id, "RECOMMEND")).rejects.toThrow("This step awaits the Group Commander.");
    for (const holder of ["group", u.branch, u.dir, "admin"]) await decideAs(holder, td.id, "RECOMMEND");
    expect((await decideAs(u.adg, td.id, "APPROVE")).status).toBe("APPROVED");
    expect((await db.tdRequest.findUniqueOrThrow({ where: { id: td.id } })).status).toBe("APPROVED");
    const t = await timeline("TD", td.id);
    expect(t?.steps.filter((s) => !["SUBMITTED"].includes(s.outcome)).map((s) => s.stageCode)).toEqual(["GP_CDR", "BRANCH", "DIR", "DDG", "ADG"]);
  });
  it("own request needs 2 days notice, a sent TD does not", async () => {
    await expect(own(u.ao, fields(inDays(1)))).rejects.toThrow("Request temporary duty at least 2 days ahead.");
    expect((await send("group", { postId: await postOf(u.ao) }, fields(inDays(0)))).status).toBe("PENDING");
  });
  it("a Gp Cdr sends a typed-in PI; it starts at Branch and has no traveller account", async () => {
    const td = await send("group", typedPi);
    const row = await db.tdRequest.findUniqueOrThrow({ where: { id: td.id } });
    expect(row).toMatchObject({ travellerId: null, travellerName: "B. Yadav", travellerRank: "Sub", kind: "SENT", level: "UNIT", unitId: "unit-1", groupId: "group-1" });
    expect((await timeline("TD", td.id))?.stageIndex).toBe(1);
    expect((await tdInbox(await as(u.branch))).map((r) => r.id)).toContain(td.id);
    expect((await tdInbox(await as("group"))).map((r) => r.id)).not.toContain(td.id);
  });
  it("refuses a typed formation outside the sender's reach", async () => {
    await expect(send("group2", typedPi)).rejects.toMatchObject({ status: 403 });
    // An AO reaches only their unit, not a group officer.
    await expect(send(u.ao, { postId: await postOf(u.two, "group-1") })).rejects.toMatchObject({ status: 403 });
  });
  it("sends only someone junior: never the DDG the ADG, a DGC the Gp Cdr, an AO the CO", async () => {
    const adgPost = await postOf(u.adg);
    await expect(send("admin", { postId: adgPost })).rejects.toMatchObject({ status: 403 });
    expect((await tdOptions(await as("admin"))).people.map((p) => p.postId)).not.toContain(adgPost);
    await expect(send(u.dir, { postId: (await db.roleAssignment.findFirstOrThrow({ where: { userId: "admin", appointmentCode: "DDG", active: true } })).id })).rejects.toMatchObject({ status: 403 });
    await expect(send(u.branch, { postId: await postOf(u.dir) })).rejects.toMatchObject({ status: 403 });
    await expect(send(u.two, { postId: await postOf("group2") })).rejects.toMatchObject({ status: 403 });
    await expect(send(u.ao, { postId: await postOf("co") })).rejects.toMatchObject({ status: 403 });
    await expect(send(u.ao, typedPi)).rejects.toMatchObject({ status: 403 });
    expect((await tdOptions(await as(u.ao))).canSend).toBe(false);
    // Down the formations it is allowed: a branch officer sends a Gp Cdr.
    expect((await send(u.branch, { postId: await postOf("group") })).status).toBe("PENDING");
    const branch = await tdOptions(await as(u.branch));
    expect(branch.people.map((p) => p.postId)).not.toContain(await postOf(u.dir));
    expect(branch.formations.DIRECTORATE).toEqual([]);
    expect(branch.formations.UNIT.map((f) => f.id)).toContain("unit-1");
  });
  it("the traveller is notified and sees the TD", async () => {
    const td = await send("group", { postId: await postOf(u.trav) });
    const notices = await tdNotices(await as(u.trav));
    expect(notices.filter((n) => n.tdId === td.id)).toHaveLength(1);
    const pending = await listTd(await as(u.trav), { ...parseList({}), queue: "pending" });
    expect(pending.rows.map((r) => r.id)).toContain(td.id);
    expect((await getTd(await as(u.trav), td.id)).canDecide).toBe(false);
    await markTdSeen(await as(u.trav), td.id);
    expect((await tdNotices(await as(u.trav))).filter((n) => n.tdId === td.id)).toHaveLength(0);
  });
  it("another group cannot see or decide", async () => {
    const td = await own(u.ao);
    await expect(getTd(await as("group2"), td.id)).rejects.toMatchObject({ status: 404 });
    await expect(decideTd(await as("group2"), td.id, { decision: "RECOMMEND", remarks: "", version: 1 })).rejects.toMatchObject({ status: 404 });
    expect((await listTd(await as("group2"), { ...parseList({}), queue: "pending" })).rows.map((r) => r.id)).not.toContain(td.id);
  });
  it("return, edit and resubmit keeps both snapshots", async () => {
    const td = await own(u.ao);
    await decideAs("group", td.id, "RECOMMEND");
    await decideAs(u.branch, td.id, "RETURN", "Wrong purpose");
    const back = await getTd(await as(u.ao), td.id);
    expect(back).toMatchObject({ status: "RETURNED", canEdit: true, canCancel: true });
    const again = await resubmitTd(await as(u.ao), td.id, { ...fields(), purpose: "Escort duty", version: back.version });
    expect(again.status).toBe("PENDING");
    const subs = await db.tdSubmission.findMany({ where: { tdId: td.id }, orderBy: { cycle: "asc" } });
    expect(subs.map((s) => [s.cycle, (s.snapshot as { purpose: string }).purpose])).toEqual([[1, "Court of inquiry"], [2, "Escort duty"]]);
    expect((await timeline("TD", td.id))?.stageIndex).toBe(0);
  });
  it("files an own TD from the post chosen, not the first post", async () => {
    const td = keep(await createTd(await as(u.two), { mode: "OWN", postId: await postOf(u.two, "group-2"), ...fields() }));
    expect((await tdInbox(await as("group2"))).map((r) => r.id)).toContain(td.id);
    expect((await tdInbox(await as("group"))).map((r) => r.id)).not.toContain(td.id);
  });
  it("two decisions on the same step succeed once", async () => {
    const td = await own(u.ao);
    const v = await version(td.id);
    const results = await Promise.allSettled([1, 2].map(async () => decideTd(await as("group"), td.id, { decision: "RECOMMEND", remarks: "", version: v })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    // A stale version is a 409; a serialization failure (P2034) maps to 409 at the API.
    expect(failed.reason.status === 409 || failed.reason.code === "P2034").toBe(true);
  });
  it("only the creator changes a sent TD, not the traveller", async () => {
    const td = await send("group", { postId: await postOf(u.trav) });
    await expect(cancelTd(await as(u.trav), td.id, { version: 1 })).rejects.toThrow("Only the person who created this TD can change it.");
    await expect(resubmitTd(await as(u.trav), td.id, { ...fields(), version: 1 })).rejects.toThrow("Only the person who created this TD can change it.");
    await cancelTd(await as("group"), td.id, { version: await version(td.id) });
    expect((await db.tdRequest.findUniqueOrThrow({ where: { id: td.id } })).status).toBe("CANCELLED");
    expect((await tdNotices(await as(u.trav))).filter((n) => n.tdId === td.id).map((n) => n.message)).toContain("Your temporary duty was cancelled.");
  });
  it("keeps going after the traveller's post ends, and the traveller still cannot decide", async () => {
    const td = await send("group", { postId: await postOf(u.gone) });
    await db.roleAssignment.updateMany({ where: { userId: u.gone }, data: { active: false, endsAt: new Date() } });
    await decideAs(u.branch, td.id, "RECOMMEND");
    await expect(decideAs(u.gone, td.id, "RECOMMEND")).rejects.toMatchObject({ status: 403 });
    expect((await timeline("TD", td.id))?.stageIndex).toBe(2);
  });
  it("puts an approved TD in Completed once it has ended, otherwise in Disposed", async () => {
    const past = keep(await createTd(await as(u.adg), { mode: "SEND", traveller: typedPi, ...fields(inDays(-3), inDays(-2)) }));
    const future = keep(await createTd(await as(u.adg), { mode: "SEND", traveller: typedPi, ...fields(inDays(3)) }));
    expect([past.status, future.status]).toEqual(["APPROVED", "APPROVED"]);
    const ids = async (queue: "pending" | "disposed" | "completed") =>
      (await listTd(await as(u.adg), { ...parseList({ pageSize: "50" }), queue, mine: true })).rows.map((r) => r.id);
    expect(await ids("completed")).toContain(past.id);
    expect(await ids("disposed")).not.toContain(past.id);
    expect(await ids("disposed")).toContain(future.id);
    expect(await ids("completed")).not.toContain(future.id);
    const list = await listTd(await as(u.adg), { ...parseList({}), queue: "pending", mine: true });
    expect(list.counts.completed).toBeGreaterThanOrEqual(1);
    expect(list.counts.disposed).toBeGreaterThanOrEqual(1);
  });
  it("offers own posts, and people and formations only within reach", async () => {
    const mine = await tdOptions(await as(u.two));
    expect(mine.ownPosts.map((p) => p.title).sort()).toEqual(["Deputy Group Commander", "Group Training Officer"]);
    const g = await tdOptions(await as("group"));
    expect(g.canSend).toBe(true);
    expect(g.people.map((p) => p.postId)).toContain(await postOf(u.ao));
    expect(g.people.map((p) => p.postId)).not.toContain(await postOf(u.two, "group-2"));
    expect(g.people.some((p) => p.postId === g.ownPosts[0]?.id)).toBe(false);
    expect(g.formations.UNIT.map((f) => f.id)).toContain("unit-1");
    expect(g.formations.UNIT.map((f) => f.id)).not.toContain("unit-2");
    expect(g.formations.DIRECTORATE).toEqual([]);
    expect((await tdOptions(await as("ano"))).canSend).toBe(false);
  });
  it("says when the step it waits at has nobody in the post", async () => {
    const td = await own(u.lone);
    expect((await getTd(await as(u.lone), td.id)).awaiting).toMatchObject({ code: "GP_CDR", vacant: true });
    const held = await own(u.ao);
    expect((await getTd(await as(u.ao), held.id)).awaiting).toMatchObject({ code: "GP_CDR", vacant: false });
  });
});
