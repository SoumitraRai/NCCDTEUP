import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { auth } from "../auth";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// GROUP_STAFF and DTE_STAFF are branch and staff officers: they read their
// whole group or directorate and act only at workflow steps named for their
// appointment (docs/decisions/002-officer-registration.md).
export type Role = "CADET" | "ANO" | "CO" | "GROUP" | "ADMIN" | "GROUP_STAFF" | "DTE_STAFF";
// Where an assignment sits, filled in up the chain: an institution-level
// assignment knows its unit, group and directorate; a group-level one only
// its group and directorate.
export type Anchor = {
  institutionId: string | null;
  unitId: string | null;
  groupId: string | null;
  directorateId: string;
};
export type Assignment = {
  role: string;
  level: string;
  appointmentCode: string | null;
  capabilities: string[];
  anchor: Anchor;
};
export type Actor = { id: string; name: string; assignments: Assignment[] };
export type Action =
  "read" | "edit" | "review" | "publish" | "payment" | "admin" | "audit";
const roles: Record<Action, Role[]> = {
  read: ["CADET", "ANO", "CO", "GROUP", "ADMIN", "GROUP_STAFF", "DTE_STAFF"],
  edit: ["CADET", "ANO", "CO", "GROUP", "ADMIN"],
  review: ["CO", "GROUP", "ADMIN"],
  publish: ["ADMIN"],
  payment: ["CO", "GROUP", "ADMIN"],
  admin: ["ADMIN"],
  audit: ["ADMIN"],
};
export function permittedAssignments(actor: Actor, action: Action) {
  return actor.assignments.filter(
    (a) =>
      roles[action].includes(a.role as Role) &&
      (!["publish", "payment"].includes(action) ||
        a.capabilities.includes(action)),
  );
}
export function scope(
  actor: Actor,
  action: Action,
): Prisma.InstitutionWhereInput {
  const permitted = permittedAssignments(actor, action);
  // Prisma 7 treats an empty OR nested inside AND as "match everything", so
  // no permitted assignment must be an explicit never-matching filter.
  if (!permitted.length) return { id: { in: [] } };
  return { OR: permitted.map(reach) };
}
// Assignments that sit inside the actor's scope for an action: at or below
// the level each permitted assignment reaches, never above it. A unit CO sees
// the unit's own posts and its institutions' posts, not the group's.
const reachLevel = (role: string) =>
  ["ADMIN", "DTE_STAFF"].includes(role) ? 3 : ["GROUP", "GROUP_STAFF"].includes(role) ? 2 : role === "CO" ? 1 : 0;
export function assignmentsWithin(actor: Actor, action: Action): Prisma.RoleAssignmentWhereInput {
  const or: Prisma.RoleAssignmentWhereInput[] = [];
  for (const a of permittedAssignments(actor, action)) {
    const { unitId, groupId, directorateId } = a.anchor;
    const lvl = reachLevel(a.role);
    or.push({ institution: reach(a) });
    if (lvl === 1 && unitId) or.push({ unitId });
    if (lvl === 2 && groupId) or.push({ unit: { groupId } }, { groupId });
    if (lvl === 3) or.push({ unit: { group: { directorateId } } }, { group: { directorateId } }, { directorateId });
  }
  return or.length ? { OR: or } : { id: { in: [] } };
}
// How far a role reaches from its anchor, as an institution filter.
export function reach(a: Assignment): Prisma.InstitutionWhereInput {
  const { institutionId, unitId, groupId, directorateId } = a.anchor;
  switch (a.role) {
    case "ADMIN":
    case "DTE_STAFF":
      return { unit: { group: { directorateId } } };
    case "GROUP":
    case "GROUP_STAFF":
      return groupId ? { unit: { groupId } } : { id: { in: [] } };
    case "CO":
      return unitId ? { unitId } : { id: { in: [] } };
    default:
      return institutionId ? { id: institutionId } : { id: { in: [] } };
  }
}
// The same rule for one institution already loaded.
export function covers(a: Assignment, inst: { id: string; unitId: string; unit: { groupId: string; group: { directorateId: string } } }) {
  switch (a.role) {
    case "ADMIN":
    case "DTE_STAFF":
      return a.anchor.directorateId === inst.unit.group.directorateId;
    case "GROUP":
    case "GROUP_STAFF":
      return a.anchor.groupId === inst.unit.groupId;
    case "CO":
      return a.anchor.unitId === inst.unitId;
    default:
      return a.anchor.institutionId === inst.id;
  }
}
// Loads live assignments with their anchors. Used for the signed-in actor and
// for loading any user's assignments (approval engine, tests).
export const assignmentInclude = {
  institution: { include: { unit: { include: { group: true } } } },
  unit: { include: { group: true } },
  group: true,
} satisfies Prisma.RoleAssignmentInclude;
type AssignmentRow = Prisma.RoleAssignmentGetPayload<{ include: typeof assignmentInclude }>;
export function toAssignment(r: AssignmentRow): Assignment {
  const anchor: Anchor = r.institution
    ? { institutionId: r.institution.id, unitId: r.institution.unitId, groupId: r.institution.unit.groupId, directorateId: r.institution.unit.group.directorateId }
    : r.unit
      ? { institutionId: null, unitId: r.unit.id, groupId: r.unit.groupId, directorateId: r.unit.group.directorateId }
      : r.group
        ? { institutionId: null, unitId: null, groupId: r.group.id, directorateId: r.group.directorateId }
        : { institutionId: null, unitId: null, groupId: null, directorateId: r.directorateId! };
  return { role: r.role, level: r.level, appointmentCode: r.appointmentCode, capabilities: r.capabilities, anchor };
}
export const liveAssignments = () => ({
  active: true,
  startsAt: { lte: new Date() },
  OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
});
// An actor for a known user id, without a session. For server jobs and tests.
export async function actorById(id: string): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({ where: { id }, include: { assignments: { where: liveAssignments(), include: assignmentInclude } } });
  return { id: u.id, name: u.name, assignments: u.assignments.map(toAssignment) };
}
export function claimScope(
  actor: Actor,
  action: Action = "read",
): Prisma.ClaimWhereInput {
  const permitted = permittedAssignments(actor, action).filter(
    (a) => a.role !== "CADET",
  );
  if (!permitted.length) return { id: { in: [] } };
  return {
    OR: permitted.map((a) => ({
        institution: scope({ ...actor, assignments: [a] }, action),
      })),
  };
}
export async function actorFrom(headers: Headers): Promise<Actor> {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AppError(401, "Please sign in.");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      assignments: { where: liveAssignments(), include: assignmentInclude },
    },
  });
  if (!user?.active || !user.assignments.length)
    throw new AppError(403, "Your access is inactive.");
  const storedSession=await db.session.findUnique({where:{id:session.session.id}});
  if(!storedSession)throw new AppError(401,"Session expired.");
  if (
    Date.now() - session.session.createdAt.getTime() > 8 * 3600_000 ||
    Date.now() - storedSession.lastSeenAt.getTime() > 60 * 60_000
  ) {
    await db.session.deleteMany({ where: { id: session.session.id } });
    throw new AppError(401, "Session expired.");
  }
  // Authenticators are optional unless REQUIRE_TWO_FACTOR=true (user
  // decision, 2026-11-21: password only for now). When it is on, officer
  // accounts (requireTwoFactor) need TOTP, and in production every reviewing
  // role does.
  if (
    process.env.REQUIRE_TWO_FACTOR === "true" &&
    !user.twoFactorEnabled &&
    (user.requireTwoFactor ||
      (process.env.APP_MODE === "production" &&
        user.assignments.some((a) => ["CO", "GROUP", "ADMIN"].includes(a.role))))
  )
    throw new AppError(
      403,
      "Set up two-factor authentication before privileged access.",
    );
  await db.session.update({where:{id:session.session.id},data:{lastSeenAt:new Date()}});
  return { id: user.id, name: user.name, assignments: user.assignments.map(toAssignment) };
}
export async function requireInstitution(
  actor: Actor,
  id: string,
  action: Action,
) {
  if (
    !(await db.institution.findFirst({
      where: { AND: [{ id }, scope(actor, action)] },
    }))
  )
    throw new AppError(403, "Not permitted in this institution.");
}
export function separateDuties(actor: Actor, ownerId: string) {
  if (actor.id === ownerId)
    throw new AppError(403, "You cannot approve your own submission.");
}
export function requireCapability(actor: Actor, action: Action) {
  if (!permittedAssignments(actor, action).length)
    throw new AppError(403, "Not permitted.");
}
