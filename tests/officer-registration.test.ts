import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actorById, actorFrom } from "../src/server/authorization";
import { verifyRegistration } from "../src/modules/identity/registration";
import {
  canApproveOfficers,
  decideOfficerRequest,
  getOfficerRequest,
  setRegistrationDuty,
  submitOfficerRegistration,
} from "../src/modules/identity/officer-registration";
// Officer registration: unit peers, group peers for the Gp Cdr and Deputy,
// the level above or a delegate otherwise; DDG/ADG closed; TOTP required.
// These tests exercise the email flow, which is optional and off by default.
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
const run = crypto.randomUUID().slice(0, 8);
const email = (n: string) => `off-${run}-${n}@example.test`;
const ip = () => `test-${crypto.randomUUID()}`;
const staff = { gtrg: `gtrg-${run}`, gadm: `gadm-${run}`, adg: `adg-${run}` };
const assignmentOf = async (userId: string) => (await db.roleAssignment.findFirstOrThrow({ where: { userId } })).id;
async function request(n: string, appointmentCode: string, formationId: string) {
  await submitOfficerRegistration({ name: `Officer ${n}`, email: email(n), password: "Officer-Test-2026!", appointmentCode, formationId }, ip());
  const mail = await db.outboundEmail.findFirstOrThrow({ where: { to: email(n) }, orderBy: { createdAt: "desc" } });
  await verifyRegistration({ token: mail.text.match(/token=([\w-]+)/)![1] });
  return db.registrationRequest.findFirstOrThrow({ where: { email: email(n) } });
}
const sees = async (userId: string, id: string) => !!(await getOfficerRequest(await actorById(userId), id).catch(() => null));
beforeAll(async () => {
  const posts = [
    [staff.gtrg, "GROUP_STAFF", "GP_TRG", { level: "GROUP", groupId: "group-1" }],
    [staff.gadm, "GROUP_STAFF", "GP_ADM", { level: "GROUP", groupId: "group-1" }],
    [staff.adg, "ADMIN", "ADG", { level: "DIRECTORATE", directorateId: "dte-up" }],
  ] as const;
  for (const [id, role, appointmentCode, anchor] of posts)
    await db.user.create({ data: { id, name: id, email: `${id}@example.test`, assignments: { create: { role, appointmentCode, ...anchor } } } });
});
afterAll(async () => {
  const made = await db.user.findMany({ where: { email: { startsWith: `off-${run}-` } }, select: { id: true } });
  const ids = [...made.map((u) => u.id), ...Object.values(staff)];
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.account.deleteMany({ where: { userId: { in: ids } } });
  await db.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.registrationRequest.deleteMany({ where: { email: { startsWith: `off-${run}-` } } });
  await db.outboundEmail.deleteMany({ where: { to: { startsWith: `off-${run}-` } } });
  await db.$disconnect();
});
describe("officer registration", () => {
  it("lets the unit's CO, its group or the directorate approve a unit post", async () => {
    const r = await request("ao", "AO", "unit-1");
    expect(await sees("co", r.id)).toBe(true);
    expect(await canApproveOfficers(await actorById("co"))).toBe(true);
    expect(await sees("co2", r.id)).toBe(false);
    expect(await sees("group", r.id)).toBe(true);
    expect(await sees("admin", r.id)).toBe(true);
    expect(await sees("group2", r.id)).toBe(false);
    expect(await sees(staff.gtrg, r.id)).toBe(false);
  });
  it("lets only the head give the duty, inside the head's own formation", async () => {
    const r = await db.registrationRequest.findFirstOrThrow({ where: { email: email("ao") } });
    const gtrg = await assignmentOf(staff.gtrg);
    await expect(setRegistrationDuty(await actorById("group2"), gtrg, { enabled: true })).rejects.toThrow("Only the head");
    await expect(setRegistrationDuty(await actorById(staff.gadm), gtrg, { enabled: true })).rejects.toThrow("Only the head");
    await setRegistrationDuty(await actorById("group"), gtrg, { enabled: true });
    expect(await sees(staff.gtrg, r.id)).toBe(true);
    // A delegate cannot pass the duty on.
    await expect(setRegistrationDuty(await actorById(staff.gtrg), await assignmentOf(staff.gadm), { enabled: true })).rejects.toThrow("Only the head");
    await expect(setRegistrationDuty(await actorById("group"), await assignmentOf("group"), { enabled: false })).rejects.toThrow("own privileges");
  });
  it("lets every officer at the group approve the Gp Cdr and Deputy", async () => {
    await setRegistrationDuty(await actorById("group"), await assignmentOf(staff.gtrg), { enabled: false });
    const gc = await request("gc", "GP_CDR", "group-1");
    const dgc = await request("gstaff", "DGC", "group-1");
    for (const id of [gc.id, dgc.id]) {
      expect(await sees("group", id)).toBe(true);
      expect(await sees(staff.gtrg, id)).toBe(true);
      expect(await sees(staff.gadm, id)).toBe(true);
      expect(await sees("admin", id)).toBe(true);
      expect(await sees("group2", id)).toBe(false);
      expect(await sees("co", id)).toBe(false);
    }
    // Other group posts still need the head, a delegate or the directorate.
    const trg = await request("trg", "GP_TRG", "group-1");
    expect(await sees(staff.gadm, trg.id)).toBe(false);
    expect(await sees("group", trg.id)).toBe(true);
  });
  it("never accepts the DDG or ADG post, or a post at the wrong kind of formation", async () => {
    await expect(submitOfficerRegistration({ name: "Officer X", email: email("adg"), password: "Officer-Test-2026!", appointmentCode: "ADG", formationId: "dte-up" }, ip())).rejects.toThrow("Choose your post");
    await expect(submitOfficerRegistration({ name: "Officer X", email: email("ddg"), password: "Officer-Test-2026!", appointmentCode: "DDG", formationId: "dte-up" }, ip())).rejects.toThrow("Choose your post");
    await expect(submitOfficerRegistration({ name: "Officer X", email: email("bad"), password: "Officer-Test-2026!", appointmentCode: "AO", formationId: "group-1" }, ip())).rejects.toThrow("Choose your unit");
    await expect(submitOfficerRegistration({ name: "Officer X", email: email("cdt"), password: "Officer-Test-2026!", appointmentCode: "ANO", formationId: "unit-1" }, ip())).rejects.toThrow("Choose your post");
  });
  it("activates the post with a version check; an authenticator is optional unless required", async () => {
    const r = await db.registrationRequest.findFirstOrThrow({ where: { email: email("ao") } });
    await expect(decideOfficerRequest(await actorById("co2"), r.id, { decision: "ACTIVATE", version: r.version })).rejects.toThrow("cannot decide");
    await expect(decideOfficerRequest(await actorById("co"), r.id, { decision: "ACTIVATE", version: r.version + 5 })).rejects.toThrow("changed");
    await decideOfficerRequest(await actorById("co"), r.id, { decision: "ACTIVATE", version: r.version });
    const user = await db.user.findUniqueOrThrow({ where: { email: email("ao") }, include: { assignments: true } });
    expect(user.requireTwoFactor).toBe(true);
    expect(user.assignments.map((a) => [a.role, a.appointmentCode, a.level, a.unitId])).toEqual([["CO", "AO", "UNIT", "unit-1"]]);
    const signed = await auth.api.signInEmail({ body: { email: email("ao"), password: "Officer-Test-2026!" }, returnHeaders: true });
    const cookie = signed.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    // Authenticators are optional by default: password alone gives access.
    expect((await actorFrom(new Headers({ cookie }))).id).toBe(user.id);
    // With REQUIRE_TWO_FACTOR on, the same officer is refused until set up.
    process.env.REQUIRE_TWO_FACTOR = "true";
    try {
      await expect(actorFrom(new Headers({ cookie }))).rejects.toThrow("two-factor");
    } finally {
      delete process.env.REQUIRE_TWO_FACTOR;
    }
  });
  it("needs a reason to reject", async () => {
    const r = await db.registrationRequest.findFirstOrThrow({ where: { email: email("gstaff") } });
    await expect(decideOfficerRequest(await actorById("group"), r.id, { decision: "REJECT", version: r.version, note: "" })).rejects.toThrow();
    await decideOfficerRequest(await actorById("group"), r.id, { decision: "REJECT", version: r.version, note: "Not posted here" });
    expect((await db.registrationRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("REJECTED");
  });
});
