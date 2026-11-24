import { z } from "zod";
import { db } from "@/server/db";
import {
  AppError,
  claimScope,
  requireInstitution,
  separateDuties,
  type Actor,
} from "@/server/authorization";
import { audit } from "@/modules/audit";
import { cancelRequest, decide, institutionChain, openRequest } from "@/modules/approvals/engine";
import { calculate, claimInput, paymentBalance } from "./calculation";
export async function createClaim(actor: Actor, raw: unknown) {
  const input = claimInput.parse(raw);
  await requireInstitution({...actor,assignments:actor.assignments.filter(a=>a.role!=="CADET")}, input.institutionId, "edit");
  if (!actor.assignments.some((a) => a.role !== "CADET"))
    throw new AppError(403, "Cadets cannot create staff claims.");
  return db.$transaction(
    async (tx) => {
      const existing = await tx.claim.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (existing.ownerId !== actor.id)
          throw new AppError(409, "Duplicate request.");
        return existing;
      }
      const claim = await tx.claim.create({
        data: {
          ...input,
          ownerId: actor.id,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
        },
      });
      await audit(tx, actor.id, "claim.draft", claim.id);
      return claim;
    },
    { isolationLevel: "Serializable" },
  );
}
export const transitionInput = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
    action: z.enum([
      "SUBMIT",
      "REVIEW",
      "NOT_RECOMMEND",
      "APPROVE",
      "RETURN",
      "REJECT",
      "CANCEL",
    ]),
    comment: z.string().max(1000).default(""),
  })
  .strict();
export async function transitionClaim(actor: Actor, raw: unknown) {
  const input = transitionInput.parse(raw);
  return db.$transaction(
    async (tx) => {
      const claim = await tx.claim.findFirst({
        where: {
          AND: [
            { id: input.id },
            claimScope(
              actor,
              ["REVIEW", "NOT_RECOMMEND", "APPROVE", "RETURN", "REJECT"].includes(
                input.action,
              )
                ? "review"
                : "edit",
            ),
          ],
        },
      });
      if (!claim) throw new AppError(404, "Claim not found.");
      if (claim.version !== input.version)
        throw new AppError(409, "Claim changed. Refresh to review it.");
      let next: string;
      let computed:
        | {
            totalPaise: bigint;
            snapshot: ReturnType<typeof calculate>["snapshot"] & {
              entitlementPaise?: string;
              claimedPaise?: string;
            };
          }
        | undefined;
      if (input.action === "SUBMIT") {
        if (
          claim.ownerId !== actor.id ||
          !["DRAFT", "RETURNED"].includes(claim.state)
        )
          throw new AppError(
            403,
            "Only the owner can submit an editable claim.",
          );
        const overlap = await tx.claim.findFirst({
          where: {
            id: { not: claim.id },
            ownerId: claim.ownerId,
            kind: claim.kind,
            state: { notIn: ["DRAFT", "RETURNED", "REJECTED", "CANCELLED"] },
            periodStart: { lte: claim.periodEnd },
            periodEnd: { gte: claim.periodStart },
          },
        });
        if (overlap)
          throw new AppError(409, "A submitted claim overlaps this period.");
        try {
          computed = calculate(
            {
              institutionId: claim.institutionId,
              category: claim.category,
              attendance: claim.attendance,
              sessions: claim.sessions,
              idempotencyKey: claim.idempotencyKey,
              periodStart: claim.periodStart.toISOString().slice(0, 10),
              periodEnd: claim.periodEnd.toISOString().slice(0, 10),
              kind: claim.kind as "REFRESHMENT" | "HONORARIUM",
            },
            await tx.financialRatePolicy.findMany(),
            process.env.APP_MODE === "production",
          );
        } catch (e) {
          throw new AppError(
            400,
            e instanceof Error ? e.message : "Invalid calculation.",
          );
        }
        // Bills carry the amount actually spent. The policy figure is kept
        // only as a reference for the approvers; it is not a limit. The CO
        // and Group Commander decide whether the amount is acceptable.
        const claimed = claim.claimedPaise;
        if (claimed !== null) {
          if (claimed <= 0n)
            throw new AppError(400, "The claimed amount must be positive.");
          computed = {
            totalPaise: claimed,
            snapshot: {
              ...computed.snapshot,
              entitlementPaise: computed.totalPaise.toString(),
              claimedPaise: claimed.toString(),
            },
          };
        }
        const detail = await tx.claim.findUniqueOrThrow({
          where: { id: claim.id },
          select: { refreshment: true, honorarium: true },
        });
        if (detail.refreshment || detail.honorarium) {
          const evidence = await tx.attachment.count({
            where: {
              resourceType: "claim",
              resourceId: claim.id,
              purpose: detail.refreshment ? "BILL" : "DOCUMENT",
              status: { in: ["SCANNING", "CLEAN"] },
            },
          });
          if (!evidence)
            throw new AppError(
              400,
              detail.refreshment
                ? "Upload the refreshment bill before submitting."
                : "Upload the supporting document before submitting.",
            );
        }
        const request = await openRequest(tx, {
          workflow: "BILL",
          resourceId: claim.id,
          chain: await institutionChain(tx, claim.institutionId),
          requesterId: actor.id,
        });
        next = request.stageIndex > 0 ? "UNDER_REVIEW" : "SUBMITTED";
      } else if (input.action === "CANCEL") {
        if (
          claim.ownerId !== actor.id ||
          !["DRAFT", "RETURNED", "SUBMITTED"].includes(claim.state)
        )
          throw new AppError(403, "This claim cannot be cancelled.");
        if (claim.state !== "DRAFT")
          await cancelRequest(tx, "BILL", claim.id, actor.id);
        next = "CANCELLED";
      } else {
        separateDuties(actor, claim.ownerId);
        if (!["SUBMITTED", "UNDER_REVIEW"].includes(claim.state))
          throw new AppError(409, "Invalid workflow transition.");
        if (
          process.env.APP_MODE === "production" &&
          input.action === "APPROVE" &&
          (claim.snapshot as { synthetic?: boolean } | null)?.synthetic
        )
          throw new AppError(
            400,
            "Development policy cannot be approved in production.",
          );
        const request = await decide(tx, actor, {
          workflow: "BILL",
          resourceId: claim.id,
          decision: input.action === "REVIEW" ? "RECOMMEND" : input.action,
          remarks: input.comment,
        });
        next =
          request.status === "PENDING"
            ? request.stageIndex > 0
              ? "UNDER_REVIEW"
              : "SUBMITTED"
            : request.status;
      }
      const updated = await tx.claim.updateMany({
        where: { id: claim.id, version: input.version },
        data: {
          state: next,
          version: { increment: 1 },
          ...(computed
            ? { totalPaise: computed.totalPaise, snapshot: computed.snapshot }
            : {}),
        },
      });
      if (!updated.count) throw new AppError(409, "Claim changed.");
      if (computed)
        await tx.claimLineItem.create({
          data: {
            claimId: claim.id,
            version: input.version + 1,
            totalPaise: computed.totalPaise,
            snapshot: computed.snapshot,
          },
        });
      await tx.approvalAction.create({
        data: {
          claimId: claim.id,
          actorId: actor.id,
          action: input.action,
          comment: input.comment,
          version: input.version + 1,
        },
      });
      await audit(
        tx,
        actor.id,
        `claim.${input.action.toLowerCase()}`,
        claim.id,
        { version: input.version + 1 },
      );
      await tx.notification.create({
        data: {
          userId: claim.ownerId,
          message: `Claim ${claim.id.slice(-6)}: ${next}`,
        },
      });
      return { id: claim.id, state: next, version: input.version + 1 };
    },
    { isolationLevel: "Serializable" },
  );
}
export const paymentInput = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
    amountPaise: z.string().regex(/^[1-9]\d{0,11}$/),
    reference: z.string().min(3).max(100),
    idempotencyKey: z.string().uuid(),
    reversalOf: z.string().optional(),
  })
  .strict();
export async function recordPayment(actor: Actor, raw: unknown) {
  const input = paymentInput.parse(raw);
  return db.$transaction(
    async (tx) => {
      const claim = await tx.claim.findFirst({
        where: { AND: [{ id: input.id }, claimScope(actor, "payment")] },
      });
      if (!claim) throw new AppError(404, "Claim not found.");
      separateDuties(actor, claim.ownerId);
      const previous = await tx.paymentRecord.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (previous) {
        if (previous.claimId !== claim.id)
          throw new AppError(409, "Duplicate payment key.");
        return previous;
      }
      if (
        claim.version !== input.version ||
        !["APPROVED", "PARTIALLY_PAID", "PAID"].includes(claim.state)
      )
        throw new AppError(409, "Review the current claim before payment.");
      let amount = BigInt(input.amountPaise);
      if (input.reversalOf) {
        const original = await tx.paymentRecord.findFirst({
          where: {
            id: input.reversalOf,
            claimId: claim.id,
            amountPaise: amount,
            reversalOf: null,
          },
        });
        if (!original)
          throw new AppError(
            400,
            "Reversal must match an original payment in full.",
          );
        amount = -amount;
      }
      let balance;
      try {
        balance = paymentBalance(claim.totalPaise, claim.paidPaise, amount);
      } catch {
        throw new AppError(400, "Payment exceeds the approved balance.");
      }
      const updated = await tx.claim.updateMany({
        where: { id: claim.id, version: input.version },
        data: { ...balance, version: { increment: 1 } },
      });
      if (!updated.count) throw new AppError(409, "Claim changed.");
      const payment = await tx.paymentRecord.create({
        data: {
          claimId: claim.id,
          actorId: actor.id,
          amountPaise: amount,
          reference: input.reference,
          idempotencyKey: input.idempotencyKey,
          reversalOf: input.reversalOf,
        },
      });
      await audit(
        tx,
        actor.id,
        input.reversalOf ? "payment.reversed" : "payment.recorded",
        claim.id,
        { paymentId: payment.id },
      );
      return payment;
    },
    { isolationLevel: "Serializable" },
  );
}
