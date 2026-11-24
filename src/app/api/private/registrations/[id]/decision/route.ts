import { route } from "@/server/http";
import { decideRegistration } from "@/modules/identity/registration";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => decideRegistration(actor, params.id, await body()));
