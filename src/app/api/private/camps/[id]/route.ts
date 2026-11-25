import { route } from "@/server/http";
import { getCamp, updateCamp } from "@/modules/camps/service";
type P = { id: string };
export const GET = route<P>(({ actor, params }) => getCamp(actor, params.id));
// Edit the plan before the camp starts (host unit or its group).
export const PATCH = route<P>(async ({ actor, params, body }) => updateCamp(actor, params.id, await body()));
