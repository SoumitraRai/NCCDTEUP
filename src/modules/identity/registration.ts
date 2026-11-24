import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/server/db";
import { AppError, requireInstitution, scope, type Actor } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { emailVerificationRequired, queueMail } from "@/server/mail";
import { page, terms, type ListQuery } from "@/modules/platform/query";
// Self-registration with approval. Anyone may ask for a cadet, ANO or CTO
// account at a publicly listed institution, confirms their email from a
// one-time link, and an officer with review scope over that institution then
// activates or rejects it. Higher roles are only
// provisioned by an operator (scripts/provision.ts).
export const DAY = 86_400_000;
export const requestedRoles = ["CADET", "ANO", "CTO"] as const;
const assignmentFor = (r: (typeof requestedRoles)[number]) =>
  r === "CADET" ? { role: "CADET", appointmentCode: null } : { role: "ANO", appointmentCode: r };
export const registrationInput = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(100, "Keep your name under 100 characters."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
    password: z.string().min(12, "Use at least 12 characters for the password.").max(128, "Keep the password under 128 characters."),
    role: z.enum(requestedRoles, { error: "Choose who you are registering as." }),
    institutionId: z.string().min(1, "Choose your institution."),
    note: z.string().trim().max(300, "Keep the note under 300 characters.").default(""),
  })
  .strict();
// Fixed-window counter in the RateLimit table. Keys are hashed so no raw IP
// address or email is stored.
export async function hit(key: string, max: number, windowMs: number) {
  const id = createHash("sha256").update(key).digest("hex");
  const now = new Date();
  const row = await db.$transaction(
    async (tx) => {
      const cur = await tx.rateLimit.findUnique({ where: { key: id } });
      if (!cur || cur.expiresAt <= now)
        return tx.rateLimit.upsert({ where: { key: id }, create: { key: id, count: 1, expiresAt: new Date(now.getTime() + windowMs) }, update: { count: 1, expiresAt: new Date(now.getTime() + windowMs) } });
      return tx.rateLimit.update({ where: { key: id }, data: { count: { increment: 1 } } });
    },
    { isolationLevel: "Serializable" },
  );
  if (row.count > max) throw new AppError(429, "Too many registration attempts. Try again later.");
}
// Institutions a registrant may choose: the same allowlist as the public
// institutions page (publicApproved), and only id, name and district.
export const registrationInstitutions = () =>
  db.institution.findMany({ where: { active: true, publicApproved: true }, select: { id: true, name: true, district: true }, orderBy: { name: "asc" } });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const VERIFY_TTL = DAY;
// The confirmation email. Only the token's hash is stored on the request.
function verificationMail(locale: string, name: string, token: string, officer = false) {
  const link = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/${locale === "hi" ? "hi" : "en"}/register/verify?token=${token}`;
  return locale === "hi"
    ? { subject: "सम्पर्क: अपना ईमेल पता पुष्टि करें", text: `नमस्ते ${name},\n\nसम्पर्क पर पंजीकरण पूरा करने के लिए 24 घंटे के भीतर यह लिंक खोलें और "ईमेल की पुष्टि करें" दबाएँ:\n\n${link}\n\nपुष्टि के बाद ${officer ? "स्वीकृति देने वाले अधिकारी" : "आपकी यूनिट के अधिकारी"} अनुरोध की समीक्षा करेंगे।\nयदि आपने पंजीकरण नहीं किया, तो इस ईमेल को अनदेखा करें।` }
    : { subject: "Sampark: confirm your email address", text: `Hello ${name},\n\nTo finish registering for Sampark, open this link within 24 hours and press "Confirm email":\n\n${link}\n\nAfter that, ${officer ? "the approving officer" : "an officer of your unit"} will review your request.\nIf you did not register, ignore this email.` };
}
// Always answers the same way, whether or not the email is known, so the form
// cannot be used to find out who has an account. The password is hashed on
// every path so timing does not tell either. A new request, or an unconfirmed
// one asked for again, gets a fresh confirmation link by email. Shared by the
// member and officer forms; `details` is what that form adds.
export async function fileRequest(
  v: { name: string; email: string; password: string },
  details: Omit<Prisma.RegistrationRequestUncheckedCreateInput, "email" | "name" | "passwordHash" | "deleteAfter">,
  client: string,
  locale: string,
) {
  await hit(`reg-ip:${client}`, 5, 3600_000);
  await hit(`reg-email:${v.email}`, 3, DAY);
  const passwordHash = await hashPassword(v.password);
  const [user, pending] = await Promise.all([
    db.user.findUnique({ where: { email: v.email } }),
    db.registrationRequest.findFirst({ where: { email: v.email, status: "PENDING" } }),
  ]);
  if (user || pending?.emailVerifiedAt) return { status: "received" as const };
  // With confirmation off, the request goes straight to the approvers and no
  // email is sent.
  const confirm = emailVerificationRequired();
  const token = randomBytes(32).toString("base64url");
  const verify = confirm
    ? { verifyTokenHash: sha(token), verifyExpiresAt: new Date(Date.now() + VERIFY_TTL), deleteAfter: new Date(Date.now() + 2 * DAY) }
    : { emailVerifiedAt: new Date(), verifyTokenHash: null, verifyExpiresAt: null, deleteAfter: new Date(Date.now() + 30 * DAY) };
  // A repeat request replaces every formation field, so clear them first.
  const data = { institutionId: null, unitId: null, groupId: null, directorateId: null, ...details, name: v.name, passwordHash };
  await db.$transaction(async (tx) => {
    const r = pending
      ? await tx.registrationRequest.update({ where: { id: pending.id }, data: { ...data, ...verify, version: { increment: 1 } } })
      : await tx.registrationRequest.create({ data: { email: v.email, ...data, ...verify } });
    if (confirm) await queueMail(tx, { to: v.email, ...verificationMail(locale, v.name, token, details.kind === "OFFICER"), ttlMs: VERIFY_TTL });
    await audit(tx, "public", pending ? "registration.reissued" : "registration.requested", r.id, { kind: details.kind ?? "MEMBER", post: details.appointmentCode });
  });
  return { status: "received" as const };
}
export async function submitRegistration(raw: unknown, client: string, locale = "en") {
  const v = registrationInput.parse(raw);
  const institution = await db.institution.findFirst({ where: { id: v.institutionId, active: true, publicApproved: true } });
  if (!institution) throw new AppError(400, "Choose your institution.");
  return fileRequest(v, { kind: "MEMBER", level: "INSTITUTION", role: v.role, appointmentCode: v.role, institutionId: v.institutionId, note: v.note }, client, locale);
}
// Confirms the email from the link. Officers only see confirmed requests.
export async function verifyRegistration(raw: unknown) {
  const { token } = z.object({ token: z.string().min(20).max(100) }).strict().parse(raw);
  const r = await db.registrationRequest.findUnique({ where: { verifyTokenHash: sha(token) } });
  if (!r || r.status !== "PENDING" || r.emailVerifiedAt || !r.verifyExpiresAt || r.verifyExpiresAt < new Date())
    throw new AppError(400, "This link is invalid or has expired. Register again to get a new one.");
  await db.$transaction(async (tx) => {
    const done = await tx.registrationRequest.updateMany({
      where: { id: r.id, verifyTokenHash: r.verifyTokenHash },
      data: { emailVerifiedAt: new Date(), verifyTokenHash: null, verifyExpiresAt: null, deleteAfter: new Date(Date.now() + 30 * DAY), version: { increment: 1 } },
    });
    if (!done.count) throw new AppError(400, "This link is invalid or has expired. Register again to get a new one.");
    await audit(tx, "public", "registration.email_verified", r.id);
  });
  return { status: "verified" as const };
}
const select = {
  id: true, name: true, email: true, role: true, note: true, status: true, decisionNote: true, decidedAt: true, createdAt: true, version: true,
  institutionId: true,
} satisfies Prisma.RegistrationRequestSelect;
async function withInstitutions<T extends { institutionId: string | null }>(rows: T[]) {
  const inst = await db.institution.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.institutionId ?? ""))] } },
    select: { id: true, name: true, district: true, unit: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, institution: inst.find((i) => i.id === r.institutionId)! }));
}
async function inScope(actor: Actor) {
  return (await db.institution.findMany({ where: scope(actor, "review"), select: { id: true } })).map((i) => i.id);
}
export async function listRegistrations(actor: Actor, q: ListQuery) {
  const ids = await inScope(actor);
  const base: Prisma.RegistrationRequestWhereInput = { kind: "MEMBER", institutionId: { in: ids }, emailVerifiedAt: { not: null } };
  const and: Prisma.RegistrationRequestWhereInput[] = [base, { status: q.status ?? "PENDING" }];
  for (const t of terms(q.q)) and.push({ OR: [{ name: { contains: t, mode: "insensitive" } }, { email: { contains: t, mode: "insensitive" } }] });
  const where = { AND: and };
  const [rows, total, counts] = await Promise.all([
    db.registrationRequest.findMany({ where, select, orderBy: { createdAt: q.sort === "oldest" ? "asc" : "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.registrationRequest.count({ where }),
    db.registrationRequest.groupBy({ by: ["status"], where: base, _count: true }),
  ]);
  return {
    ...page(await withInstitutions(rows), total, q),
    counts: Object.fromEntries(["PENDING", "ACTIVATED", "REJECTED"].map((s) => [s, counts.find((c) => c.status === s)?._count ?? 0])) as Record<"PENDING" | "ACTIVATED" | "REJECTED", number>,
  };
}
export const pendingRegistrations = async (actor: Actor) => db.registrationRequest.count({ where: { kind: "MEMBER", status: "PENDING", emailVerifiedAt: { not: null }, institutionId: { in: await inScope(actor) } } });
export async function getRegistration(actor: Actor, id: string) {
  const r = await db.registrationRequest.findFirst({ where: { id, kind: "MEMBER", emailVerifiedAt: { not: null }, institutionId: { in: await inScope(actor) } }, select });
  if (!r) throw new AppError(404, "Registration not found.");
  return (await withInstitutions([r]))[0];
}
const decisionInput = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("ACTIVATE"), version: z.number().int().positive(), role: z.enum(requestedRoles), note: z.string().trim().max(300).default("") }).strict(),
  z.object({ decision: z.literal("REJECT"), version: z.number().int().positive(), note: z.string().trim().min(3, "Explain the decision.").max(300) }).strict(),
]);
export async function decideRegistration(actor: Actor, id: string, raw: unknown) {
  const v = decisionInput.parse(raw);
  const r = await db.registrationRequest.findUnique({ where: { id } });
  if (!r || r.kind !== "MEMBER" || !r.institutionId) throw new AppError(404, "Registration not found.");
  await requireInstitution(actor, r.institutionId, "review");
  return db.$transaction(
    async (tx) => {
      const changed = () => new AppError(409, "This registration changed. Refresh and review it again.");
      const cur = await tx.registrationRequest.findUnique({ where: { id } });
      if (!cur || cur.status !== "PENDING" || cur.version !== v.version || !cur.passwordHash) throw changed();
      if (!cur.emailVerifiedAt) throw new AppError(409, "The email address has not been confirmed yet.");
      if (v.decision === "REJECT") {
        await tx.registrationRequest.update({ where: { id }, data: { status: "REJECTED", passwordHash: null, decidedById: actor.id, decidedAt: new Date(), decisionNote: v.note, version: { increment: 1 }, deleteAfter: new Date(Date.now() + 30 * DAY) } });
        await audit(tx, actor.id, "registration.rejected", id);
        return { id, status: "REJECTED" };
      }
      if (await tx.user.findUnique({ where: { email: cur.email } })) throw new AppError(409, "An account with this email already exists.");
      const userId = crypto.randomUUID();
      const a = assignmentFor(v.role);
      await tx.user.create({
        data: {
          id: userId, name: cur.name, email: cur.email, emailVerified: true,
          accounts: { create: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", password: cur.passwordHash } },
          assignments: { create: { institutionId: cur.institutionId!, role: a.role, appointmentCode: a.appointmentCode, capabilities: [] } },
        },
      });
      await tx.registrationRequest.update({ where: { id }, data: { status: "ACTIVATED", role: v.role, passwordHash: null, userId, decidedById: actor.id, decidedAt: new Date(), decisionNote: v.note, version: { increment: 1 }, deleteAfter: new Date(Date.now() + 365 * DAY) } });
      await audit(tx, actor.id, "registration.activated", id, { userId, role: v.role });
      return { id, status: "ACTIVATED", userId };
    },
    { isolationLevel: "Serializable" },
  );
}
