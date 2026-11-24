import { route } from "@/server/http";
import { decideOfficerRequest } from "@/modules/identity/officer-registration";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => decideOfficerRequest(actor, params.id, await body()));
