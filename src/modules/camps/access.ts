import type { Prisma } from "@prisma/client";
import type { Actor, Assignment } from "@/server/authorization";
// Who sees and who handles a camp; shared by camps, reports and budgets.
export const GROUP_ROLES = ["GROUP", "GROUP_STAFF"];
export const DTE_ROLES = ["ADMIN", "DTE_STAFF"];
// Who sees a camp: officers whose post covers its group (or the directorate),
// and unit officers and ANOs/CTOs whose unit hosts it or has seats in it.
export function campScope(actor: Actor): Prisma.CampWhereInput {
  const or: Prisma.CampWhereInput[] = [];
  for (const a of actor.assignments) {
    const { unitId, groupId, directorateId } = a.anchor;
    if (DTE_ROLES.includes(a.role)) or.push({ directorateId });
    else if (GROUP_ROLES.includes(a.role) && groupId) or.push({ groupId });
    else if ((a.role === "CO" || a.role === "ANO") && unitId) or.push({ unitId }, { allocations: { some: { unitId } } });
  }
  return or.length ? { OR: or } : { id: { in: [] } };
}
// Units whose camps this actor plans and reports: CO/AO their own unit, group
// officers every unit of their group.
export const unitPost = (a: Assignment) => a.role === "CO" && a.level === "UNIT" && !!a.anchor.unitId;
export const groupPost = (a: Assignment) => GROUP_ROLES.includes(a.role) && a.level === "GROUP" && !!a.anchor.groupId;
export const handles = (actor: Actor, camp: { unitId: string; groupId: string }) =>
  actor.assignments.some((a) => (unitPost(a) && a.anchor.unitId === camp.unitId) || (groupPost(a) && a.anchor.groupId === camp.groupId));
