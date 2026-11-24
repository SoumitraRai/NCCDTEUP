import { route } from "@/server/http";
import { cancelTd } from "@/modules/movement/service";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => cancelTd(actor, params.id, await body()));
