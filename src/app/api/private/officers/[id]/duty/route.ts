import { route } from "@/server/http";
import { setDuty } from "@/modules/identity/officer-registration";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => setDuty(actor, params.id, await body()));
