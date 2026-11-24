import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { changeOfficerPost, moveTargets } from "../src/modules/identity/officer-posts";
import { listOfficers } from "../src/modules/identity/officers";
import { parseList } from "../src/modules/platform/query";
// Ending and moving officer posts: whoever may approve a post may end or
// move it; a move also needs that for the new post. Seeded: co (unit-1),
// co2 (unit-2), group (Gp Cdr group-1), group2, admin (DDG).
const run = crypto.randomUUID().slice(0, 8);
const u = { ao: `pao-${run}`, ao2: `pao2-${run}`, ao3: `pao3-${run}`, gtrg: `pgtrg-${run}`, gc: `pgc-${run}`, adg: `padg-${run}` };
const post = async (userId: string) => db.roleAssignment.findFirstOrThrow({ where: { userId, active: true } });
const end = async (actorId: string, userId: string) => changeOfficerPost(await actorById(actorId), (await post(userId)).id, { action: "END", note: "Posted out" });
beforeAll(async () => {
  const posts = [
    [u.ao, "CO", "AO", { level: "UNIT", unitId: "unit-1" }],
    [u.ao2, "CO", "AO", { level: "UNIT", unitId: "unit-1" }],
    [u.ao3, "CO", "AO", { level: "UNIT", unitId: "unit-1" }],
    [u.gtrg, "GROUP_STAFF", "GP_TRG", { level: "GROUP", groupId: "group-1" }],
    [u.gc, "GROUP", "GP_CDR", { level: "GROUP", groupId: "group-1" }],
    [u.adg, "ADMIN", "ADG", { level: "DIRECTORATE", directorateId: "dte-up" }],
  ] as const;
  for (const [id, role, appointmentCode, anchor] of posts)
    await db.user.create({ data: { id, name: id, email: `${id}@example.test`, assignments: { create: { role, appointmentCode, capabilities: id === u.ao2 ? ["registrations"] : [], ...anchor } } } });
});
afterAll(async () => {
  const ids = Object.values(u);
  await db.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
describe("officer posts", () => {
  it("shows Manage to those who could approve the post, never on one's own", async () => {
    const manageable = async (actorId: string, userId: string) =>
      (await listOfficers(await actorById(actorId), parseList({ pageSize: "25", q: userId }))).rows.find((r) => r.userId === userId)?.canManage;
    expect(await manageable("co", u.ao)).toBe(true);
    expect(await manageable("group", u.ao)).toBe(true);
    expect(await manageable("admin", u.ao)).toBe(true);
    expect(await manageable("co2", u.ao)).toBe(false);
    expect(await manageable("group2", u.ao)).toBe(false);
    expect(await manageable(u.gtrg, u.ao)).toBe(false);
    expect(await manageable(u.ao, u.ao)).toBe(false);
    expect(await manageable("admin", u.adg)).toBe(false);
  });
  it("refuses one's own post, other formations and DDG/ADG posts", async () => {
    await expect(end(u.ao, u.ao)).rejects.toThrow("your own post");
    await expect(end("co2", u.ao)).rejects.toThrow("cannot change this officer's post");
    await expect(end(u.gtrg, u.ao)).rejects.toThrow("cannot change this officer's post");
    await expect(end("admin", u.adg)).rejects.toThrow("cannot change this officer's post");
    expect((await post(u.ao)).active).toBe(true);
  });
  it("lets a unit peer end a post, once, with a reason and an audit entry", async () => {
    const id = (await post(u.ao)).id;
    await expect(changeOfficerPost(await actorById("co"), id, { action: "END", note: "" })).rejects.toThrow();
    const results = await Promise.allSettled([1, 2].map(async () => changeOfficerPost(await actorById("co"), id, { action: "END", note: "Posted out" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const closed = await db.roleAssignment.findUniqueOrThrow({ where: { id } });
    expect(closed.active).toBe(false);
    expect(closed.endsAt).not.toBeNull();
    expect((await actorById(u.ao)).assignments).toHaveLength(0);
    expect(await db.auditEvent.count({ where: { action: "officer.post.ended", resourceId: id } })).toBe(1);
  });
  it("lets group peers end the Gp Cdr post, as they may approve it", async () => {
    await end(u.gtrg, u.gc);
    expect(await db.roleAssignment.count({ where: { userId: u.gc, active: true } })).toBe(0);
  });
  it("moves an officer to a new post on the same account, without duties", async () => {
    const old = await post(u.ao2);
    // A unit peer cannot appoint to a group post.
    await expect(changeOfficerPost(await actorById("co"), old.id, { action: "MOVE", appointmentCode: "GP_ADM", formationId: "group-1", note: "Transfer" })).rejects.toThrow("cannot appoint");
    await expect(changeOfficerPost(await actorById("group"), old.id, { action: "MOVE", appointmentCode: "AO", formationId: "unit-1", note: "Same" })).rejects.toThrow("already holds");
    const r = await changeOfficerPost(await actorById("group"), old.id, { action: "MOVE", appointmentCode: "GP_ADM", formationId: "group-1", note: "Transfer" });
    expect(r.status).toBe("MOVED");
    const now = await post(u.ao2);
    expect(now).toMatchObject({ role: "GROUP_STAFF", appointmentCode: "GP_ADM", level: "GROUP", groupId: "group-1", capabilities: [] });
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id: old.id } })).active).toBe(false);
    expect((await actorById(u.ao2)).assignments).toHaveLength(1);
  });
  it("offers only the posts and formations the actor may appoint to", async () => {
    const id = (await post(u.ao3)).id;
    const forCo = await moveTargets(await actorById("co"), id);
    expect(forCo.posts.map((p) => p.code)).toEqual(["CO", "AO"].filter((c) => forCo.posts.some((p) => p.code === c)));
    expect(forCo.posts.flatMap((p) => p.formations.map((f) => f.id))).toEqual(expect.arrayContaining(["unit-1"]));
    expect(forCo.posts.flatMap((p) => p.formations.map((f) => f.id))).not.toContain("unit-2");
    // The current post is not offered as a move.
    expect(forCo.posts.find((p) => p.code === "AO")?.formations ?? []).toHaveLength(0);
    const forAdmin = await moveTargets(await actorById("admin"), id);
    const codes = forAdmin.posts.map((p) => p.code);
    expect(codes).toContain("DIR");
    expect(codes).not.toContain("DDG");
    expect(codes).not.toContain("ADG");
  });
});
