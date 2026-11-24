import { route } from "@/server/http";
import { recordPayment } from "@/modules/finance/service";
import { billKind } from "../../../kind";
export const POST = route<{ kind: string; id: string }>(async ({ actor, params, body }) => {
  billKind(params.kind);
  const input = (await body()) as Record<string, unknown>;
  return recordPayment(actor, { ...input, id: params.id });
}, 201);
