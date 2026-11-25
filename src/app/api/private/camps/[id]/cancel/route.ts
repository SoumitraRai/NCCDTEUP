import { route } from "@/server/http";
import { cancelCamp } from "@/modules/camps/service";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => cancelCamp(actor, params.id, await body()));
