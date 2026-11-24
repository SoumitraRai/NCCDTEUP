import { route } from "@/server/http";
import { getVisit, updateVisit } from "@/modules/visits/service";
export const GET = route<{ id: string }>(({ actor, params }) => getVisit(actor, params.id));
export const PATCH = route<{ id: string }>(async ({ actor, params, body }) => updateVisit(actor, params.id, await body()));
