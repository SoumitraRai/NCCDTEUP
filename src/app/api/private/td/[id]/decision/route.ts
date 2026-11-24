import { route } from "@/server/http";
import { decideTd } from "@/modules/movement/service";
// decision: RECOMMEND | NOT_RECOMMEND | RETURN, or APPROVE | RETURN | REJECT at the ADG.
export const POST = route<{ id: string }>(async ({ actor, params, body }) => decideTd(actor, params.id, await body()));
