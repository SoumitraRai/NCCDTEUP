import type { Prisma, ApprovalOutcome } from "@prisma/client";
import { db } from "@/server/db";
import {
  AppError,
  assignmentInclude,
  separateDuties,
  toAssignment,
  type Actor,
  type Assignment,
  type Role,
} from "@/server/authorization";
import { audit } from "@/modules/audit";
type Tx = Prisma.TransactionClient;
export type StageKind = "RECOMMEND" | "APPROVE";
// A stage is held by a role (bills), a named post or a duty. Post and duty
// holders must sit at `scope` in the request's own formation chain.
type Scope = "UNIT" | "GROUP" | "DIRECTORATE";
export type Stage = { code: string; title: string; kind: StageKind; roles?: Role[]; posts?: string[]; duty?: string; scope?: Scope };
// Where a request belongs, filled in up the chain: a unit request also
// carries its group and directorate.
export type Chain = {
  level: "INSTITUTION" | "UNIT" | "GROUP" | "DIRECTORATE";
  institutionId: string | null;
  unitId: string | null;
  groupId: string | null;
  directorateId: string;
};
// Approval routes mirror the NCC office chain. A route is versioned so that a
// request keeps the chain it was opened with.
export const routes: Record<string, { version: number; stages: Stage[] }> = {
  BILL: {
    version: 1,
    stages: [
      { code: "CO", title: "Commanding Officer", roles: ["CO"], kind: "RECOMMEND" },
      { code: "GP_CDR", title: "Group Commander", roles: ["GROUP", "ADMIN"], kind: "APPROVE" },
    ],
  },
  // Temporary duty: the full legacy chain (spec 2026-11-24).
  TD: {
    version: 1,
    stages: [
      { code: "GP_CDR", title: "Group Commander", posts: ["GP_CDR"], scope: "GROUP", kind: "RECOMMEND" },
      { code: "BRANCH", title: "Branch", duty: "movement", scope: "DIRECTORATE", kind: "RECOMMEND" },
      { code: "DIR", title: "Director", posts: ["DIR"], scope: "DIRECTORATE", kind: "RECOMMEND" },
      { code: "DDG", title: "Deputy Director General", posts: ["DDG"], scope: "DIRECTORATE", kind: "RECOMMEND" },
      { code: "ADG", title: "Additional Director General", posts: ["ADG"], scope: "DIRECTORATE", kind: "APPROVE" },
    ],
  },
};
const key = { UNIT: "unitId", GROUP: "groupId", DIRECTORATE: "directorateId" } as const;
// The formation key a role-held stage is matched on.
const roleKey = (role: string) =>
  role === "ADMIN" || role === "DTE_STAFF" ? "directorateId" : role === "GROUP" || role === "GROUP_STAFF" ? "groupId" : role === "CO" ? "unitId" : "institutionId";
// Can this one assignment act at this stage for a request in this chain?
export function holds(a: Assignment, stage: Stage, chain: Chain) {
  if (stage.roles) {
    if (!stage.roles.includes(a.role as Role)) return false;
    const k = roleKey(a.role);
    return !!a.anchor[k] && a.anchor[k] === chain[k];
  }
  const scope = stage.scope ?? "DIRECTORATE";
  const k = key[scope];
  if (a.level !== scope || !chain[k] || a.anchor[k] !== chain[k]) return false;
  if (stage.posts) return !!a.appointmentCode && stage.posts.includes(a.appointmentCode);
  return !!stage.duty && a.capabilities.includes(stage.duty);
}
export async function institutionChain(tx: Tx, institutionId: string): Promise<Chain> {
  const i = await tx.institution.findUniqueOrThrow({ where: { id: institutionId }, include: { unit: { include: { group: true } } } });
  return { level: "INSTITUTION", institutionId: i.id, unitId: i.unitId, groupId: i.unit.groupId, directorateId: i.unit.group.directorateId };
}
const chainOf = (r: { level: string; institutionId: string | null; unitId: string | null; groupId: string | null; directorateId: string | null }): Chain => ({
  level: r.level as Chain["level"],
  institutionId: r.institutionId,
  unitId: r.unitId,
  groupId: r.groupId,
  directorateId: r.directorateId ?? "",
});
export type Decision = "RECOMMEND" | "NOT_RECOMMEND" | "APPROVE" | "RETURN" | "REJECT";
const allowed: Record<StageKind, Decision[]> = {
  RECOMMEND: ["RECOMMEND", "NOT_RECOMMEND", "RETURN"],
  APPROVE: ["APPROVE", "RETURN", "REJECT"],
};
const outcomeOf: Record<Decision, ApprovalOutcome> = {
  RECOMMEND: "RECOMMENDED",
  NOT_RECOMMEND: "NOT_RECOMMENDED",
  APPROVE: "APPROVED",
  RETURN: "RETURNED",
  REJECT: "REJECTED",
};
const live = () => ({
  active: true,
  startsAt: { lte: new Date() },
  OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
});
export function stageOf(workflow: string, index: number) {
  const route = routes[workflow];
  if (!route) throw new AppError(500, "Unknown approval route.");
  return route.stages[index];
}
// "System R": a stage holder who opted in recommends automatically. It never
// applies to the requester and never to an approval (sanction) stage.
async function autoRecommend(tx: Tx, requestId: string) {
  for (;;) {
    const req = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    const stage = stageOf(req.workflow, req.stageIndex);
    if (req.status !== "PENDING" || stage.kind !== "RECOMMEND") return req;
    const chain = chainOf(req);
    const candidates = await tx.roleAssignment.findMany({
      where: {
        ...live(),
        ...(stage.roles ? { role: { in: stage.roles } } : stage.posts ? { appointmentCode: { in: stage.posts } } : { capabilities: { has: stage.duty ?? "" } }),
        userId: { notIn: [req.requesterId, ...(req.travellerId ? [req.travellerId] : [])] },
        user: { active: true, autoRecommend: true },
      },
      include: assignmentInclude,
      orderBy: { userId: "asc" },
    });
    const holder = candidates.find((a) => holds(toAssignment(a), stage, chain));
    if (!holder) return req;
    await tx.approvalStep.create({
      data: {
        requestId,
        cycle: req.cycle,
        stageIndex: req.stageIndex,
        stageCode: stage.code,
        outcome: "RECOMMENDED",
        actorId: holder.userId,
        system: true,
        remarks: "System R",
      },
    });
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { stageIndex: { increment: 1 }, version: { increment: 1 } },
    });
    await audit(tx, holder.userId, "approval.system_recommend", requestId);
  }
}
export async function openRequest(
  tx: Tx,
  input: { workflow: string; resourceId: string; requesterId: string; travellerId?: string | null; chain: Chain; startIndex?: number },
) {
  const route = routes[input.workflow];
  if (!route) throw new AppError(500, "Unknown approval route.");
  const start = input.startIndex ?? 0;
  const existing = await tx.approvalRequest.findUnique({
    where: { workflow_resourceId: { workflow: input.workflow, resourceId: input.resourceId } },
  });
  if (existing && existing.status !== "RETURNED")
    throw new AppError(409, "This request is already in the approval chain.");
  // Nobody sits above the chain's start: recorded as approved, not decided.
  const top = !existing && start >= route.stages.length;
  const { chain } = input;
  const req = existing
    ? await tx.approvalRequest.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          stageIndex: existing.startIndex,
          cycle: { increment: 1 },
          routeVersion: route.version,
          version: { increment: 1 },
        },
      })
    : await tx.approvalRequest.create({
        data: {
          workflow: input.workflow,
          resourceId: input.resourceId,
          requesterId: input.requesterId,
          travellerId: input.travellerId ?? null,
          level: chain.level,
          institutionId: chain.institutionId,
          unitId: chain.unitId,
          groupId: chain.groupId,
          directorateId: chain.directorateId,
          routeVersion: route.version,
          startIndex: start,
          stageIndex: top ? route.stages.length - 1 : start,
          status: top ? "APPROVED" : "PENDING",
        },
      });
  await tx.approvalStep.create({
    data: top
      ? { requestId: req.id, cycle: req.cycle, stageIndex: req.stageIndex, stageCode: "TOP", outcome: "APPROVED", actorId: input.requesterId, system: true, remarks: "Top of chain, no approval above" }
      : { requestId: req.id, cycle: req.cycle, stageIndex: req.stageIndex, stageCode: "SUBMIT", outcome: "SUBMITTED", actorId: input.requesterId },
  });
  return top ? req : autoRecommend(tx, req.id);
}
export async function decide(
  tx: Tx,
  actor: Actor,
  input: { workflow: string; resourceId: string; decision: Decision; remarks: string },
) {
  const req = await tx.approvalRequest.findUnique({
    where: { workflow_resourceId: { workflow: input.workflow, resourceId: input.resourceId } },
  });
  if (!req || req.status !== "PENDING")
    throw new AppError(409, "Nothing is awaiting a decision.");
  separateDuties(actor, req.requesterId);
  if (req.travellerId) separateDuties(actor, req.travellerId);
  const stage = stageOf(req.workflow, req.stageIndex);
  const chain = chainOf(req);
  if (!actor.assignments.some((a) => holds(a, stage, chain)))
    throw new AppError(403, `This step awaits the ${stage.title}.`);
  if (!allowed[stage.kind].includes(input.decision))
    throw new AppError(409, `The ${stage.title} cannot ${input.decision.toLowerCase().replace("_", " ")} at this step.`);
  if (["NOT_RECOMMEND", "RETURN", "REJECT"].includes(input.decision) && !input.remarks.trim())
    throw new AppError(400, "Explain the decision.");
  const last = req.stageIndex === routes[req.workflow].stages.length - 1;
  const status =
    input.decision === "RETURN"
      ? "RETURNED"
      : input.decision === "REJECT"
        ? "REJECTED"
        : input.decision === "APPROVE" && last
          ? "APPROVED"
          : "PENDING";
  const updated = await tx.approvalRequest.updateMany({
    where: { id: req.id, version: req.version },
    data: {
      status,
      stageIndex: status === "PENDING" ? req.stageIndex + 1 : req.stageIndex,
      version: { increment: 1 },
    },
  });
  if (!updated.count) throw new AppError(409, "This request changed. Refresh and review it again.");
  await tx.approvalStep.create({
    data: {
      requestId: req.id,
      cycle: req.cycle,
      stageIndex: req.stageIndex,
      stageCode: stage.code,
      outcome: outcomeOf[input.decision],
      actorId: actor.id,
      remarks: input.remarks.trim(),
    },
  });
  return status === "PENDING" ? autoRecommend(tx, req.id) : tx.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
}
export async function cancelRequest(tx: Tx, workflow: string, resourceId: string, requesterId: string) {
  const req = await tx.approvalRequest.findUnique({
    where: { workflow_resourceId: { workflow, resourceId } },
  });
  if (!req) return;
  if (req.requesterId !== requesterId) throw new AppError(403, "Only the requester can cancel.");
  if (!["PENDING", "RETURNED"].includes(req.status)) throw new AppError(409, "This request can no longer be cancelled.");
  await tx.approvalRequest.update({
    where: { id: req.id },
    data: { status: "CANCELLED", version: { increment: 1 } },
  });
  await tx.approvalStep.create({
    data: { requestId: req.id, cycle: req.cycle, stageIndex: req.stageIndex, stageCode: "CANCEL", outcome: "CANCELLED", actorId: requesterId },
  });
}
// Pending requests whose current stage one of the actor's live assignments
// holds, within that assignment's scope, excluding the actor's own requests.
export async function pendingWhere(actor: Actor): Promise<Prisma.ApprovalRequestWhereInput> {
  const or: Prisma.ApprovalRequestWhereInput[] = [];
  for (const [workflow, route] of Object.entries(routes))
    for (const [stageIndex, stage] of route.stages.entries())
      for (const a of actor.assignments) {
        // The formation key and value this assignment would hold the stage on.
        let k: "institutionId" | "unitId" | "groupId" | "directorateId";
        if (stage.roles) {
          if (!stage.roles.includes(a.role as Role)) continue;
          k = roleKey(a.role);
        } else {
          const scope = stage.scope ?? "DIRECTORATE";
          k = key[scope];
          const can = a.level === scope && (stage.posts ? !!a.appointmentCode && stage.posts.includes(a.appointmentCode) : !!stage.duty && a.capabilities.includes(stage.duty));
          if (!can) continue;
        }
        const value = a.anchor[k];
        if (value) or.push({ workflow, stageIndex, [k]: value });
      }
  return {
    status: "PENDING",
    requesterId: { not: actor.id },
    AND: [{ OR: [{ travellerId: null }, { travellerId: { not: actor.id } }] }, or.length ? { OR: or } : { id: { in: [] } }],
  };
}
export async function timeline(workflow: string, resourceId: string) {
  const req = await db.approvalRequest.findUnique({
    where: { workflow_resourceId: { workflow, resourceId } },
    include: { steps: { orderBy: { createdAt: "asc" } } },
  });
  if (!req) return null;
  const actors = await db.user.findMany({
    where: { id: { in: [...new Set(req.steps.map((s) => s.actorId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(actors.map((u) => [u.id, u.name]));
  return {
    status: req.status,
    stageIndex: req.stageIndex,
    startIndex: req.startIndex,
    cycle: req.cycle,
    stages: routes[workflow].stages.map(({ code, title, kind }) => ({ code, title, kind })),
    steps: req.steps.map((s) => ({
      stageCode: s.stageCode,
      outcome: s.outcome,
      actor: names.get(s.actorId) ?? "Unknown",
      system: s.system,
      remarks: s.remarks,
      at: s.createdAt,
      cycle: s.cycle,
    })),
  };
}
