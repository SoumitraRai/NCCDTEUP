import { route } from "@/server/http";
import { transitionClaim } from "@/modules/finance/service";
import { billKind } from "../../../kind";
// action: SUBMIT | CANCEL (owner) or REVIEW | NOT_RECOMMEND | APPROVE | RETURN | REJECT (stage holder)
export const POST = route<{ kind: string; id: string }>(async ({ actor, params, body }) => {
  billKind(params.kind);
  const input = (await body()) as Record<string, unknown>;
  return transitionClaim(actor, { ...input, id: params.id });
});
