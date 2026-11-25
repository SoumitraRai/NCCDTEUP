import { afterAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actorById } from "../src/server/authorization";
import { completePasswordSetup, listTopPosts, setPostHolder } from "../src/modules/identity/post-accounts";
// DDG/ADG post accounts: set up and handed over by a directorate admin; a
// handover leaves the old holder no way in.
// These tests exercise the email flow, which is optional and off by default.
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
const run = crypto.randomUUID().slice(0, 8);
const email = (n: string) => `post-${run}-${n}@example.test`;
const linkFor = async (to: string) => {
  const m = await db.outboundEmail.findFirstOrThrow({ where: { to }, orderBy: { createdAt: "desc" } });
  return m.text.match(/token=([\w-]+)/)![1];
};
const signIn = (e: string, password: string) => auth.api.signInEmail({ body: { email: e, password } }).then(() => true, () => false);
let adgUser = "";
// ADG posts this file vacates; given back afterwards so seeded holders keep working.
let vacated: string[] = [];
afterAll(async () => {
  if (vacated.length) await db.roleAssignment.updateMany({ where: { id: { in: vacated } }, data: { active: true } });
  if (adgUser) {
    await db.session.deleteMany({ where: { userId: adgUser } });
    await db.account.deleteMany({ where: { userId: adgUser } });
    await db.passwordSetup.deleteMany({ where: { userId: adgUser } });
    await db.roleAssignment.deleteMany({ where: { userId: adgUser } });
    await db.user.deleteMany({ where: { id: adgUser } });
  }
  await db.outboundEmail.deleteMany({ where: { to: { startsWith: `post-${run}-` } } });
  await db.$disconnect();
});
describe("post accounts", () => {
  it("is for directorate admins only, and not for their own post", async () => {
    await expect(listTopPosts(await actorById("group"))).rejects.toThrow();
    await expect(setPostHolder(await actorById("co"), "ADG", { name: "Lt Gen Test", email: email("x"), phone: "9000000010" })).rejects.toThrow();
    // The demo admin holds the DDG post.
    const admin = await actorById("admin");
    expect((await listTopPosts(admin)).find((p) => p.code === "DDG")?.yours).toBe(true);
    await expect(setPostHolder(admin, "DDG", { name: "Maj Gen Test", email: email("ddg"), phone: "9000000011" })).rejects.toThrow("post you hold");
    await expect(setPostHolder(admin, "DIR", { name: "Col Test", email: email("dir"), phone: "9000000012" })).rejects.toThrow("Post not found");
  });
  it("sets up a vacant post; the holder sets a password once", async () => {
    const admin = await actorById("admin");
    vacated = (await db.roleAssignment.findMany({ where: { appointmentCode: "ADG", active: true }, select: { id: true } })).map((a) => a.id);
    await db.roleAssignment.updateMany({ where: { id: { in: vacated } }, data: { active: false } });
    expect(await setPostHolder(admin, "ADG", { name: "Lt Gen First", email: email("first"), phone: "9000000013" })).toMatchObject({ code: "ADG", status: "created", delivery: "email" });
    const u = await db.user.findUniqueOrThrow({ where: { email: email("first") }, include: { assignments: true } });
    adgUser = u.id;
    expect(u.requireTwoFactor).toBe(true);
    expect(u.assignments.map((a) => [a.role, a.appointmentCode, a.level, a.directorateId])).toEqual([["ADMIN", "ADG", "DIRECTORATE", "dte-up"]]);
    expect(await signIn(email("first"), "Post-Holder-2026!")).toBe(false);
    const token = await linkFor(email("first"));
    await completePasswordSetup({ token, password: "Post-Holder-2026!" });
    await expect(completePasswordSetup({ token, password: "Another-Pass-2026!" })).rejects.toThrow("invalid or has expired");
    expect(await signIn(email("first"), "Post-Holder-2026!")).toBe(true);
    const listed = (await listTopPosts(admin)).find((p) => p.code === "ADG")!;
    expect(listed.holder?.phone).not.toContain("9000000013");
  });
  it("hands over: the old holder's password, authenticator and sessions stop working", async () => {
    const admin = await actorById("admin");
    await db.user.update({ where: { id: adgUser }, data: { twoFactorEnabled: true } });
    await expect(setPostHolder(admin, "ADG", { name: "Lt Gen Second", email: "ano@sampark.test", phone: "9000000014" })).rejects.toThrow("already exists");
    expect(await setPostHolder(admin, "ADG", { name: "Lt Gen Second", email: email("second"), phone: "9000000014" })).toMatchObject({ code: "ADG", status: "handed_over", delivery: "email" });
    const u = await db.user.findUniqueOrThrow({ where: { id: adgUser } });
    expect([u.name, u.email, u.twoFactorEnabled]).toEqual(["Lt Gen Second", email("second"), false]);
    expect(await db.session.count({ where: { userId: adgUser } })).toBe(0);
    expect(await signIn(email("first"), "Post-Holder-2026!")).toBe(false);
    expect(await signIn(email("second"), "Post-Holder-2026!")).toBe(false);
    await completePasswordSetup({ token: await linkFor(email("second")), password: "Second-Holder-2026!" });
    expect(await signIn(email("second"), "Second-Holder-2026!")).toBe(true);
    const handed = await db.auditEvent.findFirstOrThrow({ where: { action: "post.handed_over", resourceId: adgUser } });
    expect(handed.details).toMatchObject({ previousName: "Lt Gen First", previousEmail: email("first") });
  });
  it("with email off, shows the admin a one-time link instead of emailing it", async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "";
    try {
      const admin = await actorById("admin");
      const before = await db.outboundEmail.count({ where: { to: email("third") } });
      const r = await setPostHolder(admin, "ADG", { name: "Lt Gen Third", email: email("third"), phone: "9000000015" });
      expect(r).toMatchObject({ status: "handed_over", delivery: "admin" });
      expect(await db.outboundEmail.count({ where: { to: email("third") } })).toBe(before);
      expect(await signIn(email("third"), "Second-Holder-2026!")).toBe(false);
      const token = new URL((r as { link: string }).link).searchParams.get("token")!;
      await completePasswordSetup({ token, password: "Third-Holder-2026!" });
      expect(await signIn(email("third"), "Third-Holder-2026!")).toBe(true);
    } finally {
      process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    }
  });
});
