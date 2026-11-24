import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, assignmentInclude, toAssignment, type Actor, type Assignment } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { page, terms, type ListQuery } from "@/modules/platform/query";
import { DAY, fileRequest } from "./registration";
// Officer self-registration (docs/decisions/002-officer-registration.md).
// An officer asks for one post at one formation; who may approve depends on
// where the post sits:
//   unit post (CO, AO)        -> an officer in post at the same unit, or the
//                                group or the directorate
//   Gp Cdr, Deputy Gp Cdr     -> any officer in post at that group, or the
//                                directorate
//   other group posts         -> the group or the directorate
//   directorate posts         -> the directorate
// "The group/directorate" means holding its head post (Gp Cdr, DDG, ADG) or
// the delegated "registrations" duty there. DDG and ADG are never
// self-service: a directorate admin sets them up (post-accounts.ts).
export const DUTY = "registrations";
export const NOT_SELF_SERVICE = ["ADG", "DDG"];
const GROUP_PEER_POSTS = ["GP_CDR", "DGC"];
export const officerPosts = () =>
  db.appointment.findMany({
    where: { officer: true, code: { notIn: NOT_SELF_SERVICE } },
    select: { code: true, title: true, level: true },
    orderBy: { sort: "asc" },
  });
// Formation names for the public form: names and ids only.
export async function officerFormations() {
  const [units, groups, directorates] = await Promise.all([
    db.unit.findMany({ select: { id: true, name: true, group: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db.group.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.directorate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    UNIT: units.map((u) => ({ id: u.id, name: `${u.name}, ${u.group.name}` })),
    GROUP: groups,
    DIRECTORATE: directorates,
  };
}
export const officerInput = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(100, "Keep your name under 100 characters."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
    password: z.string().min(12, "Use at least 12 characters for the password.").max(128, "Keep the password under 128 characters."),
    appointmentCode: z.string().min(1, "Choose your post."),
    formationId: z.string().min(1, "Choose your unit, group or directorate."),
    note: z.string().trim().max(300, "Keep the note under 300 characters.").default(""),
  })
  .strict();
export const anchorKey = { UNIT: "unitId", GROUP: "groupId", DIRECTORATE: "directorateId" } as const;
export async function submitOfficerRegistration(raw: unknown, client: string, locale = "en") {
  const v = officerInput.parse(raw);
  const post = NOT_SELF_SERVICE.includes(v.appointmentCode) ? null : await db.appointment.findFirst({ where: { code: v.appointmentCode, officer: true } });
  if (!post || !(post.level in anchorKey)) throw new AppError(400, "Choose your post.");
  const level = post.level as keyof typeof anchorKey;
  const exists =
    level === "UNIT" ? await db.unit.findUnique({ where: { id: v.formationId } })
    : level === "GROUP" ? await db.group.findUnique({ where: { id: v.formationId } })
    : await db.directorate.findUnique({ where: { id: v.formationId } });
  if (!exists) throw new AppError(400, "Choose your unit, group or directorate.");
  return fileRequest(v, { kind: "OFFICER", level, role: post.role, appointmentCode: post.code, [anchorKey[level]]: v.formationId, note: v.note }, client, locale);
}
export type Chain = { unitId: string | null; groupId: string | null; directorateId: string };
// Where a request's formation sits, filled in up the chain.
export async function chainOf(r: { level: string; unitId: string | null; groupId: string | null; directorateId: string | null }): Promise<Chain | null> {
  if (r.level === "UNIT" && r.unitId) {
    const u = await db.unit.findUnique({ where: { id: r.unitId }, include: { group: true } });
    return u && { unitId: u.id, groupId: u.groupId, directorateId: u.group.directorateId };
  }
  if (r.level === "GROUP" && r.groupId) {
    const g = await db.group.findUnique({ where: { id: r.groupId } });
    return g && { unitId: null, groupId: g.id, directorateId: g.directorateId };
  }
  if (r.level === "DIRECTORATE" && r.directorateId) return { unitId: null, groupId: null, directorateId: r.directorateId };
  return null;
}
let headCache: { at: number; codes: Set<string> } | null = null;
async function headPosts() {
  if (!headCache || Date.now() - headCache.at > 60_000)
    headCache = { at: Date.now(), codes: new Set((await db.appointment.findMany({ where: { head: true }, select: { code: true } })).map((a) => a.code)) };
  return headCache.codes;
}
// Assignments through which the actor may approve officer registrations.
export async function approvingPosts(actor: Actor) {
  const heads = await headPosts();
  return actor.assignments.filter((a) => ["GROUP", "DIRECTORATE"].includes(a.level) && ((a.appointmentCode && heads.has(a.appointmentCode)) || a.capabilities.includes(DUTY)));
}
// Officers in post at a unit or group can approve some peers there, so they
// may have requests to decide even without a head post or the duty.
const officerAt = (a: Assignment) => (a.level === "UNIT" && a.role === "CO") || (a.level === "GROUP" && ["GROUP", "GROUP_STAFF"].includes(a.role));
export const canApproveOfficers = async (actor: Actor) => actor.assignments.some(officerAt) || (await approvingPosts(actor)).length > 0;
export function approves(actor: Actor, posts: Assignment[], target: { level: string; appointmentCode: string }, chain: Chain) {
  const atGroup = posts.some((a) => a.level === "GROUP" && a.anchor.groupId === chain.groupId);
  const atDte = posts.some((a) => a.level === "DIRECTORATE" && a.anchor.directorateId === chain.directorateId);
  if (target.level === "UNIT") {
    const unitPeer = actor.assignments.some((a) => a.level === "UNIT" && a.role === "CO" && a.anchor.unitId === chain.unitId);
    return unitPeer || atGroup || atDte;
  }
  if (target.level === "GROUP") {
    if (!GROUP_PEER_POSTS.includes(target.appointmentCode)) return atGroup || atDte;
    const groupPeer = actor.assignments.some((a) => officerAt(a) && a.level === "GROUP" && a.anchor.groupId === chain.groupId);
    return groupPeer || atDte;
  }
  if (target.level === "DIRECTORATE") return !NOT_SELF_SERVICE.includes(target.appointmentCode) && atDte;
  return false;
}
const select = {
  id: true, name: true, email: true, appointmentCode: true, level: true, unitId: true, groupId: true, directorateId: true,
  note: true, status: true, decisionNote: true, decidedAt: true, createdAt: true, version: true,
} satisfies Prisma.RegistrationRequestSelect;
// Confirmed officer requests this actor may decide. Filtering happens in
// code because the rule depends on the post; a directorate has at most a few
// hundred pending officer requests.
async function decidable(actor: Actor, where: Prisma.RegistrationRequestWhereInput) {
  const posts = await approvingPosts(actor);
  if (!posts.length && !actor.assignments.some(officerAt)) return [];
  const rows = await db.registrationRequest.findMany({
    where: { AND: [where, { kind: "OFFICER", emailVerifiedAt: { not: null } }] },
    select,
    orderBy: { createdAt: "desc" },
  });
  const out = [];
  for (const r of rows) {
    const chain = await chainOf(r);
    if (chain && approves(actor, posts, { level: r.level, appointmentCode: r.appointmentCode }, chain)) out.push(r);
  }
  return out;
}
type Located = { appointmentCode: string; unitId: string | null; groupId: string | null; directorateId: string | null };
// Adds the post title and formation name for display.
async function describe<T extends Located>(rows: T[]) {
  const [posts, units, groups, dtes] = await Promise.all([
    db.appointment.findMany({ select: { code: true, title: true } }),
    db.unit.findMany({ where: { id: { in: rows.map((r) => r.unitId ?? "") } }, select: { id: true, name: true, group: { select: { name: true } } } }),
    db.group.findMany({ where: { id: { in: rows.map((r) => r.groupId ?? "") } }, select: { id: true, name: true } }),
    db.directorate.findMany({ where: { id: { in: rows.map((r) => r.directorateId ?? "") } }, select: { id: true, name: true } }),
  ]);
  return rows.map((r) => ({
    ...r,
    post: posts.find((p) => p.code === r.appointmentCode)?.title ?? r.appointmentCode,
    formation: (() => {
      const u = units.find((x) => x.id === r.unitId);
      return u ? `${u.name}, ${u.group.name}` : (groups.find((g) => g.id === r.groupId)?.name ?? dtes.find((d) => d.id === r.directorateId)?.name ?? "");
    })(),
  }));
}
export async function listOfficerRequests(actor: Actor, q: ListQuery) {
  const status = q.status ?? "PENDING";
  const and: Prisma.RegistrationRequestWhereInput[] = [{ status }];
  for (const t of terms(q.q)) and.push({ OR: [{ name: { contains: t, mode: "insensitive" } }, { email: { contains: t, mode: "insensitive" } }] });
  const [rows, all] = await Promise.all([decidable(actor, { AND: and }), decidable(actor, {})]);
  if (q.sort === "oldest") rows.reverse();
  const slice = rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  return {
    ...page(await describe(slice), rows.length, q),
    counts: Object.fromEntries(["PENDING", "ACTIVATED", "REJECTED"].map((s) => [s, all.filter((r) => r.status === s).length])) as Record<"PENDING" | "ACTIVATED" | "REJECTED", number>,
  };
}
export const pendingOfficerRequests = async (actor: Actor) => (await decidable(actor, { status: "PENDING" })).length;
export async function getOfficerRequest(actor: Actor, id: string) {
  const [r] = await decidable(actor, { id });
  if (!r) throw new AppError(404, "Registration not found.");
  return (await describe([r]))[0];
}
const decisionInput = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("ACTIVATE"), version: z.number().int().positive(), note: z.string().trim().max(300).default("") }).strict(),
  z.object({ decision: z.literal("REJECT"), version: z.number().int().positive(), note: z.string().trim().min(3, "Explain the decision.").max(300) }).strict(),
]);
export async function decideOfficerRequest(actor: Actor, id: string, raw: unknown) {
  const v = decisionInput.parse(raw);
  const [r] = await decidable(actor, { id });
  if (!r) throw new AppError(403, "You cannot decide this registration.");
  const post = await db.appointment.findUniqueOrThrow({ where: { code: r.appointmentCode } });
  return db.$transaction(
    async (tx) => {
      const cur = await tx.registrationRequest.findUnique({ where: { id } });
      if (!cur || cur.status !== "PENDING" || cur.version !== v.version || !cur.passwordHash)
        throw new AppError(409, "This registration changed. Refresh and review it again.");
      if (v.decision === "REJECT") {
        await tx.registrationRequest.update({ where: { id }, data: { status: "REJECTED", passwordHash: null, decidedById: actor.id, decidedAt: new Date(), decisionNote: v.note, version: { increment: 1 }, deleteAfter: new Date(Date.now() + 30 * DAY) } });
        await audit(tx, actor.id, "registration.rejected", id, { kind: "OFFICER" });
        return { id, status: "REJECTED" };
      }
      if (await tx.user.findUnique({ where: { email: cur.email } })) throw new AppError(409, "An account with this email already exists.");
      const userId = crypto.randomUUID();
      const level = cur.level as keyof typeof anchorKey;
      await tx.user.create({
        data: {
          id: userId, name: cur.name, email: cur.email, emailVerified: true, requireTwoFactor: true,
          accounts: { create: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", password: cur.passwordHash } },
          assignments: { create: { role: post.role, appointmentCode: post.code, level, [anchorKey[level]]: cur[anchorKey[level]]!, capabilities: [] } },
        },
      });
      await tx.registrationRequest.update({ where: { id }, data: { status: "ACTIVATED", passwordHash: null, userId, decidedById: actor.id, decidedAt: new Date(), decisionNote: v.note, version: { increment: 1 }, deleteAfter: new Date(Date.now() + 365 * DAY) } });
      await audit(tx, actor.id, "registration.activated", id, { kind: "OFFICER", userId, post: post.code });
      return { id, status: "ACTIVATED", userId };
    },
    { isolationLevel: "Serializable" },
  );
}
// Heads (Gp Cdr, DDG, ADG) give or withdraw a duty to officers of their own
// formation; it cannot be passed on. "registrations": approve officer
// registrations. "movement": the Branch step of temporary duty, for
// directorate officers only, given by the DDG or ADG.
export const DUTIES = [DUTY, "movement"] as const;
export async function setDuty(actor: Actor, assignmentId: string, raw: unknown) {
  const { duty, enabled } = z.object({ duty: z.enum(DUTIES).default(DUTY), enabled: z.boolean() }).strict().parse(raw);
  const target = await db.roleAssignment.findUnique({ where: { id: assignmentId }, include: assignmentInclude });
  if (!target || !target.active) throw new AppError(404, "Officer not found.");
  if (target.userId === actor.id) throw new AppError(403, "Cannot change your own privileges.");
  if (duty === "movement" && target.level !== "DIRECTORATE") throw new AppError(400, "This duty is for directorate officers.");
  const t = toAssignment(target);
  const heads = await headPosts();
  const sameFormation = (a: Assignment) =>
    a.level === t.level && (t.level === "GROUP" ? a.anchor.groupId === t.anchor.groupId : t.level === "DIRECTORATE" && a.anchor.directorateId === t.anchor.directorateId);
  if (!["GROUP", "DIRECTORATE"].includes(t.level) || !actor.assignments.some((a) => a.appointmentCode && heads.has(a.appointmentCode) && sameFormation(a)))
    throw new AppError(403, "Only the head of this formation can change this duty.");
  const capabilities = enabled ? [...new Set([...target.capabilities, duty])] : target.capabilities.filter((c) => c !== duty);
  await db.$transaction(async (tx) => {
    await tx.roleAssignment.update({ where: { id: assignmentId }, data: { capabilities } });
    await audit(tx, actor.id, `duty.${duty}.${enabled ? "granted" : "withdrawn"}`, assignmentId, { userId: target.userId });
  });
  return { id: assignmentId, duty, enabled };
}
export const setRegistrationDuty = (actor: Actor, assignmentId: string, raw: unknown) => setDuty(actor, assignmentId, raw);
