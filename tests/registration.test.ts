import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actorById, type Actor } from "../src/server/authorization";
import { decideRegistration, listRegistrations, submitRegistration, verifyRegistration } from "../src/modules/identity/registration";
import { parseList } from "../src/modules/platform/query";
const actors: Record<string, Actor> = {};
// These tests exercise the email flow, which is optional and off by default.
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
const run = crypto.randomUUID().slice(0, 8);
const email = (n: string) => `reg-${run}-${n}@example.test`;
const form = (n: string, over: Record<string, unknown> = {}) => ({ name: `Test Person ${n}`, email: email(n), password: "Registration-Test-2026", role: "CADET", institutionId: "institution-1", ...over });
const ip = () => `test-${crypto.randomUUID()}`;
const requestFor = (n: string) => db.registrationRequest.findFirstOrThrow({ where: { email: email(n) } });
// The newest confirmation link sent to this address, read from the outbox as
// the person's inbox would receive it.
// Links sent to "a", captured as soon as each is queued: a running worker
// delivers mail and then clears the body, so old emails cannot be re-read.
const linksA: string[] = [];
async function tokenFor(n: string) {
  const mail = await db.outboundEmail.findFirstOrThrow({ where: { to: email(n) }, orderBy: { createdAt: "desc" } });
  return mail.text.match(/token=([\w-]+)/)![1];
}
beforeAll(async () => {
  // The "known email" case reuses a seeded account, so its daily counter
  // carries over between runs.
  await db.rateLimit.deleteMany({ where: { key: createHash("sha256").update("reg-email:ano@sampark.test").digest("hex") } });
  for (const id of ["ano", "co", "co2"]) {
    actors[id] = await actorById(id);
  }
});
afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: `reg-${run}-` } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.account.deleteMany({ where: { userId: { in: ids } } });
  await db.roleAssignment.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.registrationRequest.deleteMany({ where: { email: { startsWith: `reg-${run}-` } } });
  await db.outboundEmail.deleteMany({ where: { to: { startsWith: `reg-${run}-` } } });
  await db.$disconnect();
});
describe("self-registration", () => {
  it("stores a pending request with a hashed password", async () => {
    expect(await submitRegistration(form("a"), ip())).toEqual({ status: "received" });
    linksA.push(await tokenFor("a"));
    const r = await requestFor("a");
    expect(r.status).toBe("PENDING");
    expect(r.passwordHash).toBeTruthy();
    expect(r.passwordHash).not.toContain("Registration-Test-2026");
    expect(r.emailVerifiedAt).toBeNull();
    const token = await tokenFor("a");
    expect(r.verifyTokenHash).not.toBe(token);
  });
  it("answers the same for known emails without creating anything", async () => {
    await expect(submitRegistration(form("a"), ip())).resolves.toEqual({ status: "received" });
    linksA.push(await tokenFor("a"));
    await expect(submitRegistration(form("x", { email: "ano@sampark.test" }), ip())).resolves.toEqual({ status: "received" });
    expect(await db.registrationRequest.count({ where: { email: email("a") } })).toBe(1);
    expect(await db.registrationRequest.count({ where: { email: "ano@sampark.test" } })).toBe(0);
  });
  it("accepts only publicly listed institutions and the three self-service roles", async () => {
    await expect(submitRegistration(form("b", { institutionId: "institution-1b" }), ip())).rejects.toThrow("Choose your institution.");
    await expect(submitRegistration(form("b", { role: "CO" }), ip())).rejects.toThrow();
  });
  it("limits attempts per email and per client", async () => {
    // Two attempts for "a" so far; the third is allowed, the fourth refused.
    await submitRegistration(form("a"), ip());
    linksA.push(await tokenFor("a"));
    await expect(submitRegistration(form("a"), ip())).rejects.toThrow("Too many registration attempts");
    const client = ip();
    for (let i = 0; i < 5; i++) await submitRegistration(form(`ip${i}`), client);
    await expect(submitRegistration(form("ip5"), client)).rejects.toThrow("Too many registration attempts");
  });
  it("hides unconfirmed requests; a new request replaces the old link", async () => {
    expect((await listRegistrations(actors.co, parseList({ q: email("a") }))).rows).toEqual([]);
    const r = await requestFor("a");
    await expect(decideRegistration(actors.co, r.id, { decision: "ACTIVATE", version: r.version, role: "CADET" })).rejects.toThrow("not been confirmed");
    // "a" asked three times; only the newest link works.
    expect(await db.outboundEmail.count({ where: { to: email("a") } })).toBe(3);
    expect(new Set(linksA).size).toBe(3);
    const old = linksA[0];
    await expect(verifyRegistration({ token: old })).rejects.toThrow("invalid or has expired");
    await expect(verifyRegistration({ token: linksA[2] })).resolves.toEqual({ status: "verified" });
    await expect(verifyRegistration({ token: linksA[2] })).rejects.toThrow("invalid or has expired");
    expect((await requestFor("a")).emailVerifiedAt).not.toBeNull();
  });
  it("ignores new attempts once the email is confirmed", async () => {
    await submitRegistration(form("conf"), ip());
    await verifyRegistration({ token: await tokenFor("conf") });
    await submitRegistration(form("conf"), ip());
    expect(await db.outboundEmail.count({ where: { to: email("conf") } })).toBe(1);
  });
  it("shows requests only to reviewers in scope", async () => {
    const mine = await listRegistrations(actors.co, parseList({ q: email("a") }));
    expect(mine.rows.map((r) => r.email)).toEqual([email("a")]);
    expect(mine.rows[0]).not.toHaveProperty("passwordHash");
    expect((await listRegistrations(actors.co2, parseList({ q: email("a") }))).rows).toEqual([]);
    expect((await listRegistrations(actors.ano, parseList({ q: email("a") }))).rows).toEqual([]);
  });
  it("activates with a version check; the person can then sign in", async () => {
    const r = await requestFor("a");
    await expect(decideRegistration(actors.co2, r.id, { decision: "ACTIVATE", version: r.version, role: "CADET" })).rejects.toThrow("Not permitted");
    await expect(decideRegistration(actors.co, r.id, { decision: "ACTIVATE", version: 99, role: "CADET" })).rejects.toThrow("changed");
    const done = await decideRegistration(actors.co, r.id, { decision: "ACTIVATE", version: r.version, role: "ANO" });
    const user = await db.user.findUniqueOrThrow({ where: { email: email("a") }, include: { assignments: true } });
    expect(done.userId).toBe(user.id);
    expect(user.assignments.map((a) => [a.role, a.appointmentCode, a.institutionId])).toEqual([["ANO", "ANO", "institution-1"]]);
    expect((await requestFor("a")).passwordHash).toBeNull();
    const signed = await auth.api.signInEmail({ body: { email: email("a"), password: "Registration-Test-2026" } });
    expect(signed.user.id).toBe(user.id);
    await expect(decideRegistration(actors.co, r.id, { decision: "REJECT", version: r.version + 1, note: "Too late" })).rejects.toThrow("changed");
  });
  it("with email confirmation off, sends no email and goes straight to the approvers", async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "";
    try {
      await submitRegistration(form("direct"), ip());
      const r = await requestFor("direct");
      expect(r.emailVerifiedAt).not.toBeNull();
      expect(r.verifyTokenHash).toBeNull();
      expect(await db.outboundEmail.count({ where: { to: email("direct") } })).toBe(0);
      expect((await listRegistrations(actors.co, parseList({ q: email("direct") }))).rows.map((x) => x.email)).toEqual([email("direct")]);
    } finally {
      process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    }
  });
  it("requires a reason to reject and creates no account", async () => {
    await submitRegistration(form("c"), ip());
    await verifyRegistration({ token: await tokenFor("c") });
    const r = await requestFor("c");
    await expect(decideRegistration(actors.co, r.id, { decision: "REJECT", version: r.version, note: "" })).rejects.toThrow();
    await decideRegistration(actors.co, r.id, { decision: "REJECT", version: r.version, note: "Not enrolled at this institution" });
    const after = await requestFor("c");
    expect([after.status, after.passwordHash]).toEqual(["REJECTED", null]);
    expect(await db.user.findUnique({ where: { email: email("c") } })).toBeNull();
  });
});
