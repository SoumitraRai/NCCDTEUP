import { route } from "@/server/http";
import { getTd, resubmitTd } from "@/modules/movement/service";
type P = { id: string };
export const GET = route<P>(({ actor, params }) => getTd(actor, params.id));
// Edit and send again after a return (creator only).
export const PATCH = route<P>(async ({ actor, params, body }) => resubmitTd(actor, params.id, await body()));
