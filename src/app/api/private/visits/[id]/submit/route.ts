import { route } from "@/server/http";
import { submitVisit } from "@/modules/visits/service";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => submitVisit(actor, params.id, await body()));
