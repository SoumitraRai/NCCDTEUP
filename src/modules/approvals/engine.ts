import type { Prisma, ApprovalOutcome } from "@prisma/client";
import { db } from "@/server/db";
import {
  AppError,
  assignmentInclude,
  covers,
  reach,
  separateDuties,
  toAssignment,
  type Actor,
  type Role,
} from "@/server/authorization";
import { audit } from "@/modules/audit";
type Tx = Prisma.TransactionClient;
export type StageKind = "RECOMMEND" | "APPROVE";
export type Stage = { code: string; title: string; roles: Role[]; kind: StageKind };
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
};
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
const institutionOf = (tx: Tx, id: string) =>
  tx.institution.findUniqueOrThrow({
    where: { id },
    include: { unit: { include: { group: true } } },
  });
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
    const inst = await institutionOf(tx, req.institutionId);
    const candidates = await tx.roleAssignment.findMany({
      where: {
        ...live(),
        role: { in: stage.roles },
        userId: { not: req.requesterId },
        user: { active: true, autoRecommend: true },
      },
      include: assignmentInclude,
      orderBy: { userId: "asc" },
    });
    const holder = candidates.find((a) => covers(toAssignment(a), inst));
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
  input: { workflow: string; resourceId: string; institutionId: string; requesterId: string },
) {
  const route = routes[input.workflow];
  if (!route) throw new AppError(500, "Unknown approval route.");
  const existing = await tx.approvalRequest.findUnique({
    where: { workflow_resourceId: { workflow: input.workflow, resourceId: input.resourceId } },
  });
  if (existing && existing.status !== "RETURNED")
    throw new AppError(409, "This request is already in the approval chain.");
  const req = existing
    ? await tx.approvalRequest.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          stageIndex: 0,
          cycle: { increment: 1 },
          routeVersion: route.version,
          version: { increment: 1 },
        },
      })
    : await tx.approvalRequest.create({ data: { ...input, routeVersion: route.version } });
  await tx.approvalStep.create({
    data: {
      requestId: req.id,
      cycle: req.cycle,
      stageIndex: 0,
      stageCode: "SUBMIT",
      outcome: "SUBMITTED",
      actorId: input.requesterId,
    },
  });
  return autoRecommend(tx, req.id);
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
  const stage = stageOf(req.workflow, req.stageIndex);
  const inst = await institutionOf(tx, req.institutionId);
  if (!actor.assignments.some((a) => stage.roles.includes(a.role as Role) && covers(a, inst)))
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
      for (const a of actor.assignments.filter((x) => stage.roles.includes(x.role as Role))) {
        const ids = (
          await db.institution.findMany({
            where: reach(a),
            select: { id: true },
          })
        ).map((i) => i.id);
        or.push({ workflow, stageIndex, institutionId: { in: ids } });
      }
  return { status: "PENDING", requesterId: { not: actor.id }, ...(or.length ? { OR: or } : { id: { in: [] } }) };
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
