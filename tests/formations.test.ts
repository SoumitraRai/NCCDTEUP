import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById, assignmentsWithin, scope } from "../src/server/authorization";
import { billInbox } from "../src/modules/bills/service";
import { listOfficers } from "../src/modules/identity/officers";
import { parseList } from "../src/modules/platform/query";
// Formation-level posts: unit AO with CO powers, group and directorate staff
// officers who read their whole level but approve nothing.
const run = crypto.randomUUID().slice(0, 8);
const users = { ao: `ao-${run}`, gstaff: `gstaff-${run}`, dstaff: `dstaff-${run}` };
const ids = async (actor: Awaited<ReturnType<typeof actorById>>, action: "read" | "review") =>
  (await db.institution.findMany({ where: scope(actor, action), select: { id: true }, orderBy: { id: "asc" } })).map((i) => i.id);
beforeAll(async () => {
  const posts = [
    [users.ao, "CO", "AO", { level: "UNIT", unitId: "unit-1" }],
    [users.gstaff, "GROUP_STAFF", "GP_TRG", { level: "GROUP", groupId: "group-1" }],
    [users.dstaff, "DTE_STAFF", "DIR", { level: "DIRECTORATE", directorateId: "dte-up" }],
  ] as const;
  for (const [id, role, appointmentCode, anchor] of posts)
    await db.user.create({ data: { id, name: id, email: `${id}@example.test`, assignments: { create: { role, appointmentCode, ...anchor } } } });
});
afterAll(async () => {
  await db.roleAssignment.deleteMany({ where: { userId: { in: Object.values(users) } } });
  await db.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await db.$disconnect();
});
describe("formation-level posts", () => {
  it("gives a unit AO the same reach as the CO", async () => {
    const [ao, co] = [await actorById(users.ao), await actorById("co")];
    expect(await ids(ao, "review")).toEqual(await ids(co, "review"));
    expect(await ids(ao, "review")).toEqual(expect.arrayContaining(["institution-1", "institution-1b"]));
    expect(await ids(ao, "review")).not.toContain("institution-2");
  });
  it("lets group and directorate staff read their whole level but not review", async () => {
    const [g, d] = [await actorById(users.gstaff), await actorById(users.dstaff)];
    const group1 = await ids(await actorById("group"), "read");
    expect(await ids(g, "read")).toEqual(group1);
    expect(await ids(g, "review")).toEqual([]);
    expect((await ids(d, "read")).length).toBe(await db.institution.count({ where: { unit: { group: { directorateId: "dte-up" } } } }));
    expect(await ids(d, "review")).toEqual([]);
    expect(await billInbox(d)).toEqual([]);
  });
  it("refuses an assignment whose anchor does not match its level", async () => {
    await expect(
      db.roleAssignment.create({ data: { userId: users.gstaff, role: "GROUP_STAFF", level: "GROUP", institutionId: "institution-1" } }),
    ).rejects.toThrow();
    await expect(
      db.roleAssignment.create({ data: { userId: users.gstaff, role: "GROUP_STAFF", level: "GROUP", groupId: "group-1", unitId: "unit-1" } }),
    ).rejects.toThrow();
  });
  it("lists every officer to every officer, whatever the post", async () => {
    const seen = async (id: string) => (await listOfficers(await actorById(id), parseList({ pageSize: "50" }))).rows.map((r) => r.userId);
    for (const viewer of ["co", users.ao, users.gstaff, users.dstaff, "group", "admin"]) {
      const ids = await seen(viewer);
      expect(ids).toEqual(expect.arrayContaining(["admin", "group", "group2", "co", "co2", ...Object.values(users)]));
      expect(ids).not.toContain("ano");
      expect(ids).not.toContain("cadet");
    }
    await expect(listOfficers(await actorById("ano"), parseList({}))).rejects.toThrow("Only officers");
    await expect(listOfficers(await actorById("cadet"), parseList({}))).rejects.toThrow("Only officers");
    const units = await listOfficers(await actorById("co"), parseList({ status: "UNIT", pageSize: "50" }));
    expect(units.rows.every((r) => r.level === "UNIT")).toBe(true);
  });
  // Managing (granting posts or duties) stays limited to the actor's own
  // level and below; only seeing the list is open to all officers.
  it("limits who can manage which posts to the actor's level and below", async () => {
    const admin = await actorById("admin");
    const found = await db.roleAssignment.findMany({ where: { AND: [assignmentsWithin(admin, "admin"), { userId: { in: Object.values(users) } }] }, select: { userId: true } });
    expect(found.map((f) => f.userId).sort()).toEqual(Object.values(users).sort());
    const co = await actorById("co");
    expect(await db.roleAssignment.count({ where: { AND: [assignmentsWithin(co, "review"), { userId: users.dstaff }] } })).toBe(0);
  });
});
