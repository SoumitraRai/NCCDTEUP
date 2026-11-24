import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/server/db";
import { AppError, liveAssignments, requireCapability, type Actor } from "@/server/authorization";
import { encryptField, decryptField, maskPhone } from "@/server/crypto";
import { emailVerificationRequired, mailEnabled, queueMail } from "@/server/mail";
import { audit } from "@/modules/audit";
import { NOT_SELF_SERVICE } from "./officer-registration";
// Post accounts: the DDG and ADG posts are closed to registration. A
// directorate admin sets up the account for the post and, when the holder is
// posted out, hands it over by updating name, email and phone. A handover
// removes the old password, authenticator and sessions and creates a
// one-time link for the new holder to set a password. The link is emailed
// when email verification and mail delivery are both on; otherwise it is
// shown once to the admin, who
// gives it to the new holder in person, so a handover never depends on an
// email arriving. Nobody hands over their own post.
const TOP_POSTS = NOT_SELF_SERVICE;
const SETUP_TTL = 86_400_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function directorateOf(actor: Actor) {
  requireCapability(actor, "admin");
  const a = actor.assignments.find((x) => x.role === "ADMIN");
  if (!a) throw new AppError(403, "Not permitted.");
  return a.anchor.directorateId;
}
export async function listTopPosts(actor: Actor) {
  const directorateId = directorateOf(actor);
  const posts = await db.appointment.findMany({ where: { code: { in: TOP_POSTS } }, orderBy: { sort: "asc" } });
  return Promise.all(
    posts.map(async (p) => {
      const a = await db.roleAssignment.findFirst({
        where: { ...liveAssignments(), appointmentCode: p.code, directorateId },
        include: { user: { include: { accounts: { where: { providerId: "credential" }, select: { password: true } } } } },
      });
      const u = a?.user;
      return {
        code: p.code,
        title: p.title,
        yours: u?.id === actor.id,
        holder: u && {
          name: u.name,
          email: u.email,
          phone: u.phoneEnc ? maskPhone(decryptField(u.phoneEnc)) : null,
          passwordSet: u.accounts.some((x) => !!x.password),
          twoFactor: u.twoFactorEnabled,
        },
      };
    }),
  );
}
const holderInput = z
  .object({
    name: z.string().trim().min(2, "Enter the officer's full name.").max(100, "Keep the name under 100 characters."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number."),
  })
  .strict();
const setupLink = (locale: string, token: string) =>
  `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/${locale === "hi" ? "hi" : "en"}/password/set?token=${token}`;
function setupMail(locale: string, name: string, title: string, token: string) {
  const link = setupLink(locale, token);
  return locale === "hi"
    ? { subject: `सम्पर्क: ${title} खाते के लिए पासवर्ड सेट करें`, text: `नमस्ते ${name},\n\nसम्पर्क पर ${title} का खाता आपके लिए तैयार किया गया है। 24 घंटे के भीतर यह लिंक खोलकर अपना पासवर्ड सेट करें:\n\n${link}` }
    : { subject: `Sampark: set your password for the ${title} account`, text: `Hello ${name},\n\nThe ${title} account on Sampark has been set up for you. Open this link within 24 hours to set your password:\n\n${link}` };
}
export async function setPostHolder(actor: Actor, code: string, raw: unknown, locale = "en") {
  const directorateId = directorateOf(actor);
  if (!TOP_POSTS.includes(code)) throw new AppError(404, "Post not found.");
  const v = holderInput.parse(raw);
  const post = await db.appointment.findUniqueOrThrow({ where: { code } });
  const token = randomBytes(32).toString("base64url");
  return db.$transaction(
    async (tx) => {
      const current = await tx.roleAssignment.findFirst({ where: { ...liveAssignments(), appointmentCode: code, directorateId }, include: { user: true } });
      if (current?.userId === actor.id) throw new AppError(403, "You cannot hand over the post you hold.");
      const clash = await tx.user.findUnique({ where: { email: v.email } });
      if (clash && clash.id !== current?.userId) throw new AppError(409, "An account with this email already exists.");
      let userId: string;
      if (!current) {
        userId = crypto.randomUUID();
        await tx.user.create({
          data: {
            id: userId, name: v.name, email: v.email, phoneEnc: encryptField(v.phone), requireTwoFactor: true,
            assignments: { create: { role: post.role, appointmentCode: code, level: "DIRECTORATE", directorateId } },
          },
        });
        await audit(tx, actor.id, "post.account_created", userId, { post: code });
      } else {
        userId = current.userId;
        // The new holder starts clean: no old password, authenticator or session.
        await tx.user.update({ where: { id: userId }, data: { name: v.name, email: v.email, phoneEnc: encryptField(v.phone), emailVerified: false, twoFactorEnabled: false, requireTwoFactor: true } });
        await tx.twoFactor.deleteMany({ where: { userId } });
        await tx.session.deleteMany({ where: { userId } });
        await tx.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: null } });
        await audit(tx, actor.id, "post.handed_over", userId, { post: code, previousName: current.user.name, previousEmail: current.user.email });
      }
      await tx.passwordSetup.deleteMany({ where: { userId, usedAt: null } });
      await tx.passwordSetup.create({ data: { userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + SETUP_TTL) } });
      const mail = setupMail(locale, v.name, post.title, token);
      if (emailVerificationRequired() && mailEnabled()) {
        await queueMail(tx, { to: v.email, ...mail, ttlMs: SETUP_TTL });
        return { code, status: current ? "handed_over" : "created", delivery: "email" as const };
      }
      await audit(tx, actor.id, "post.setup_link_shown", userId, { post: code });
      return { code, status: current ? "handed_over" : "created", delivery: "admin" as const, link: setupLink(locale, token) };
    },
    { isolationLevel: "Serializable" },
  );
}
// Public: the new holder sets a password from the emailed link.
export async function completePasswordSetup(raw: unknown) {
  const v = z
    .object({ token: z.string().min(20).max(100), password: z.string().min(12, "Use at least 12 characters for the password.").max(128, "Keep the password under 128 characters.") })
    .strict()
    .parse(raw);
  const invalid = () => new AppError(400, "This link is invalid or has expired. Ask the directorate admin for a new one.");
  const setup = await db.passwordSetup.findUnique({ where: { tokenHash: sha(v.token) } });
  if (!setup || setup.usedAt || setup.expiresAt < new Date()) throw invalid();
  const password = await hashPassword(v.password);
  await db.$transaction(async (tx) => {
    const used = await tx.passwordSetup.updateMany({ where: { id: setup.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) throw invalid();
    const existing = await tx.account.findFirst({ where: { userId: setup.userId, providerId: "credential" } });
    if (existing) await tx.account.update({ where: { id: existing.id }, data: { password } });
    else await tx.account.create({ data: { id: crypto.randomUUID(), accountId: setup.userId, providerId: "credential", userId: setup.userId, password } });
    await tx.user.update({ where: { id: setup.userId }, data: { emailVerified: true } });
    await tx.session.deleteMany({ where: { userId: setup.userId } });
    await audit(tx, "public", "post.password_set", setup.userId);
  });
  return { status: "set" as const };
}
