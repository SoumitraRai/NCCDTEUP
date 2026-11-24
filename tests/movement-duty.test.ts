import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { setDuty } from "../src/modules/identity/officer-registration";
import { listOfficers } from "../src/modules/identity/officers";
import { parseList } from "../src/modules/platform/query";
// The "movement" duty makes a directorate officer the Branch step of a TD.
// Only the DDG or ADG grant it, to directorate officers, never their own post.
// Seeded: admin (DDG), group (Gp Cdr, group-1).
const run = crypto.randomUUID().slice(0, 8);
const u = { br1: `mbr1-${run}`, br2: `mbr2-${run}`, gtrg: `mgtrg-${run}` };
const postOf = async (userId: string) => (await db.roleAssignment.findFirstOrThrow({ where: { userId, active: true } })).id;
const movement = (enabled: boolean) => ({ duty: "movement", enabled });
beforeAll(async () => {
  const posts = [
    [u.br1, "DTE_STAFF", "BR_PNC", { level: "DIRECTORATE", directorateId: "dte-up" }],
    [u.br2, "DTE_STAFF", "BR_TRG", { level: "DIRECTORATE", directorateId: "dte-up" }],
    [u.gtrg, "GROUP_STAFF", "GP_TRG", { level: "GROUP", groupId: "group-1" }],
  ] as const;
  for (const [id, role, appointmentCode, anchor] of posts)
    await db.user.create({ data: { id, name: id, email: `${id}@example.test`, assignments: { create: { role, appointmentCode, ...anchor } } } });
});
afterAll(async () => {
  const ids = Object.values(u);
  await db.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
describe("movement duty", () => {
  it("lets the DDG give and withdraw it for a directorate officer", async () => {
    const id = await postOf(u.br1);
    await setDuty(await actorById("admin"), id, movement(true));
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id } })).capabilities).toContain("movement");
    expect(await db.auditEvent.count({ where: { action: "duty.movement.granted", resourceId: id } })).toBe(1);
    await setDuty(await actorById("admin"), id, movement(false));
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id } })).capabilities).not.toContain("movement");
    await setDuty(await actorById("admin"), id, movement(true));
  });
  it("refuses a group head, a duty holder and one's own post", async () => {
    const br2 = await postOf(u.br2);
    await expect(setDuty(await actorById("group"), br2, movement(true))).rejects.toThrow("Only the head");
    await expect(setDuty(await actorById(u.br1), br2, movement(true))).rejects.toThrow("Only the head");
    await expect(setDuty(await actorById("admin"), await postOf("admin"), movement(true))).rejects.toThrow("own privileges");
  });
  it("is only for directorate officers", async () => {
    await expect(setDuty(await actorById("group"), await postOf(u.gtrg), movement(true))).rejects.toThrow("This duty is for directorate officers.");
  });
  it("shows the toggle to the DDG only", async () => {
    const row = async (viewer: string) => (await listOfficers(await actorById(viewer), parseList({ q: u.br1 }))).rows[0];
    expect(await row("admin")).toMatchObject({ movement: true, canDelegateMovement: true });
    expect((await row("group")).canDelegateMovement).toBe(false);
  });
});
