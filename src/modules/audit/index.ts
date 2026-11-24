import type { Prisma } from "@prisma/client";
export function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  resourceId: string,
  details: Prisma.InputJsonValue = {},
) {
  return tx.auditEvent.create({
    data: {
      actorId,
      action,
      resourceId,
      details,
      correlationId: crypto.randomUUID(),
    },
  });
}
