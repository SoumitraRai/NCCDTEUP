import { route } from "@/server/http";
import { changeOfficerPost, moveTargets } from "@/modules/identity/officer-posts";
export const GET = route<{ id: string }>(({ actor, params }) => moveTargets(actor, params.id));
export const POST = route<{ id: string }>(async ({ actor, params, body }) => changeOfficerPost(actor, params.id, await body()));
