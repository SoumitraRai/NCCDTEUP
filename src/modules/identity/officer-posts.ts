import { z } from "zod";
import { db } from "@/server/db";
import { AppError, assignmentInclude, toAssignment, type Actor } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { anchorKey, approves, approvingPosts, chainOf, officerPosts, type Chain } from "./officer-registration";
// Ending an officer's post, or moving the officer to another post or
// formation (user decision, 2026-11-24). Whoever could approve a post's
// registration may end or move it (officer-registration.ts, approves()); a
// move needs that for both the old and the new post. A move keeps the
// account: the old post closes and the new one opens at the same moment, and
// the new post starts without delegated duties. Nobody changes their own
// post. DDG and ADG are handed over on the Directorate posts page instead.
type Level = keyof typeof anchorKey;
const isOfficerLevel = (l: string): l is Level => l in anchorKey;
// A predicate for the officer list: may this actor end or move this post?
export async function postManager(actor: Actor) {
  const posts = await approvingPosts(actor);
  return (r: { userId: string; level: string; appointmentCode: string | null; chain: Chain }) =>
    r.userId !== actor.id && isOfficerLevel(r.level) && approves(actor, posts, { level: r.level, appointmentCode: r.appointmentCode ?? "" }, r.chain);
}
async function managed(actor: Actor, id: string) {
  const target = await db.roleAssignment.findUnique({ where: { id }, include: { ...assignmentInclude, user: { select: { name: true, active: true } } } });
  if (!target || !target.active || !target.user.active || !isOfficerLevel(target.level)) throw new AppError(404, "Officer not found.");
  if (target.userId === actor.id) throw new AppError(403, "You cannot end or move your own post.");
  const t = toAssignment(target);
  if (!(await postManager(actor))({ userId: target.userId, level: t.level, appointmentCode: t.appointmentCode, chain: t.anchor }))
    throw new AppError(403, "You cannot change this officer's post.");
  return target;
}
// New posts and formations this actor may move the officer to.
export async function moveTargets(actor: Actor, id: string) {
  const target = await managed(actor, id);
  const posts = await approvingPosts(actor);
  const [all, units, groups, dtes] = await Promise.all([
    officerPosts(),
    db.unit.findMany({ select: { id: true, name: true, groupId: true, group: { select: { name: true, directorateId: true } } }, orderBy: { name: "asc" } }),
    db.group.findMany({ select: { id: true, name: true, directorateId: true }, orderBy: { name: "asc" } }),
    db.directorate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const formations = {
    UNIT: units.map((u) => ({ id: u.id, name: `${u.name}, ${u.group.name}`, chain: { unitId: u.id, groupId: u.groupId, directorateId: u.group.directorateId } })),
    GROUP: groups.map((g) => ({ id: g.id, name: g.name, chain: { unitId: null, groupId: g.id, directorateId: g.directorateId } })),
    DIRECTORATE: dtes.map((d) => ({ id: d.id, name: d.name, chain: { unitId: null, groupId: null, directorateId: d.id } })),
  };
  const current = target[anchorKey[target.level as Level]];
  return {
    name: target.user.name,
    posts: all
      .filter((p) => isOfficerLevel(p.level))
      .map((p) => ({
        code: p.code,
        title: p.title,
        level: p.level,
        formations: formations[p.level as Level]
          .filter((f) => !(p.code === target.appointmentCode && f.id === current) && approves(actor, posts, { level: p.level, appointmentCode: p.code }, f.chain))
          .map(({ id, name }) => ({ id, name })),
      }))
      .filter((p) => p.formations.length > 0),
  };
}
const note = z.string().trim().min(3, "Give the reason.").max(300, "Keep the reason under 300 characters.");
const changeInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("END"), note }).strict(),
  z.object({ action: z.literal("MOVE"), appointmentCode: z.string().min(1, "Choose the new post."), formationId: z.string().min(1, "Choose the new unit, group or directorate."), note }).strict(),
]);
export async function changeOfficerPost(actor: Actor, id: string, raw: unknown) {
  const v = changeInput.parse(raw);
  const target = await managed(actor, id);
  let next: { role: string; appointmentCode: string; level: Level; formationId: string } | null = null;
  if (v.action === "MOVE") {
    const post = await db.appointment.findFirst({ where: { code: v.appointmentCode, officer: true } });
    if (!post || !isOfficerLevel(post.level)) throw new AppError(400, "Choose the new post.");
    const level = post.level;
    const chain = await chainOf({ level, unitId: null, groupId: null, directorateId: null, [anchorKey[level]]: v.formationId });
    if (!chain) throw new AppError(400, "Choose the new unit, group or directorate.");
    if (post.code === target.appointmentCode && target[anchorKey[level]] === v.formationId) throw new AppError(400, "The officer already holds this post.");
    if (!approves(actor, await approvingPosts(actor), { level, appointmentCode: post.code }, chain)) throw new AppError(403, "You cannot appoint to this post.");
    next = { role: post.role, appointmentCode: post.code, level, formationId: v.formationId };
  }
  return db.$transaction(
    async (tx) => {
      const now = new Date();
      // Only a post still active can be closed; a concurrent change wins once.
      const closed = await tx.roleAssignment.updateMany({ where: { id, active: true }, data: { active: false, endsAt: now } });
      if (closed.count !== 1) throw new AppError(409, "This post changed. Refresh and try again.");
      if (!next) {
        await audit(tx, actor.id, "officer.post.ended", id, { userId: target.userId, post: target.appointmentCode, note: v.note });
        return { id, status: "ENDED" };
      }
      const created = await tx.roleAssignment.create({
        data: { userId: target.userId, role: next.role, appointmentCode: next.appointmentCode, level: next.level, [anchorKey[next.level]]: next.formationId, capabilities: [], startsAt: now },
      });
      await audit(tx, actor.id, "officer.post.moved", id, { userId: target.userId, from: target.appointmentCode, to: next.appointmentCode, newAssignmentId: created.id, note: v.note });
      return { id, status: "MOVED", newId: created.id };
    },
    { isolationLevel: "Serializable" },
  );
}
