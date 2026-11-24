import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, liveAssignments, type Actor } from "@/server/authorization";
import { page, terms, type ListQuery } from "@/modules/platform/query";
import { postManager } from "./officer-posts";
// The officer list. Every officer sees every officer in their directorate,
// whatever the post (user decision, 2026-11-20). Seeing is not managing:
// granting posts or duties stays limited by assignmentsWithin().
export const officerRoles = ["CO", "GROUP", "ADMIN", "GROUP_STAFF", "DTE_STAFF"];
export const isOfficer = (actor: Actor) => actor.assignments.some((a) => officerRoles.includes(a.role));
export async function listOfficers(actor: Actor, q: ListQuery) {
  if (!isOfficer(actor)) throw new AppError(403, "Only officers can see the officer list.");
  const dirs = [...new Set(actor.assignments.map((a) => a.anchor.directorateId))];
  const inDirectorate: Prisma.RoleAssignmentWhereInput = {
    OR: [
      { directorateId: { in: dirs } },
      { group: { directorateId: { in: dirs } } },
      { unit: { group: { directorateId: { in: dirs } } } },
    ],
  };
  const and: Prisma.RoleAssignmentWhereInput[] = [liveAssignments(), inDirectorate, { role: { in: officerRoles } }, { user: { active: true } }];
  for (const t of terms(q.q))
    and.push({
      OR: [
        { user: { name: { contains: t, mode: "insensitive" } } },
        { appointment: { title: { contains: t, mode: "insensitive" } } },
        { unit: { name: { contains: t, mode: "insensitive" } } },
        { group: { name: { contains: t, mode: "insensitive" } } },
      ],
    });
  if (q.status && ["UNIT", "GROUP", "DIRECTORATE"].includes(q.status)) and.push({ level: q.status });
  const where = { AND: and };
  const [rows, total] = await db.$transaction([
    db.roleAssignment.findMany({
      where,
      select: {
        id: true, level: true, startsAt: true, capabilities: true, groupId: true, directorateId: true, appointmentCode: true,
        user: { select: { id: true, name: true } },
        appointment: { select: { title: true, sort: true } },
        unitId: true,
        unit: { select: { name: true, groupId: true, group: { select: { name: true, directorateId: true } } } },
        group: { select: { name: true, directorateId: true } },
        directorate: { select: { name: true } },
      },
      // Directorate first, then groups, then units; within a level, by post.
      orderBy: [{ level: "asc" }, { appointment: { sort: "asc" } }, { user: { name: "asc" } }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.roleAssignment.count({ where }),
  ]);
  // Heads may give or withdraw the registration duty for officers of their own
  // group or directorate (not their own post).
  const heads = new Set((await db.appointment.findMany({ where: { head: true }, select: { code: true } })).map((a) => a.code));
  const leads = actor.assignments.filter((a) => a.appointmentCode && heads.has(a.appointmentCode));
  const canDelegate = (r: { level: string; groupId: string | null; directorateId: string | null; userId: string }) =>
    r.userId !== actor.id &&
    leads.some((a) => a.level === r.level && ((r.level === "GROUP" && a.anchor.groupId === r.groupId) || (r.level === "DIRECTORATE" && a.anchor.directorateId === r.directorateId)));
  // The movement duty (TD Branch step) is for directorate officers only.
  const canDelegateMovement = (r: { level: string; groupId: string | null; directorateId: string | null; userId: string }) => r.level === "DIRECTORATE" && canDelegate(r);
  const manages = await postManager(actor);
  return page(
    rows.map((r) => ({
      canManage: manages({
        userId: r.user.id,
        level: r.level,
        appointmentCode: r.appointmentCode,
        chain: r.unit
          ? { unitId: r.unitId, groupId: r.unit.groupId, directorateId: r.unit.group.directorateId }
          : { unitId: null, groupId: r.groupId, directorateId: r.group?.directorateId ?? r.directorateId! },
      }),
      duty: r.capabilities.includes("registrations"),
      movement: r.capabilities.includes("movement"),
      canDelegateMovement: canDelegateMovement({ level: r.level, groupId: r.groupId, directorateId: r.directorateId, userId: r.user.id }),
      // Group and directorate heads approve officer registrations; unit heads do not.
      head: !!r.appointmentCode && heads.has(r.appointmentCode) && r.level !== "UNIT",
      canDelegate: canDelegate({ level: r.level, groupId: r.groupId, directorateId: r.directorateId, userId: r.user.id }),
      id: r.id,
      userId: r.user.id,
      name: r.user.name,
      post: r.appointment?.title ?? null,
      level: r.level,
      formation: r.unit ? `${r.unit.name}, ${r.unit.group.name}` : (r.group?.name ?? r.directorate?.name ?? ""),
      since: r.startsAt,
    })),
    total,
    q,
  );
}
