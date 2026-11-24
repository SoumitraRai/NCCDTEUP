import { route } from "@/server/http";
import { setRegistrationDuty } from "@/modules/identity/officer-registration";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => setRegistrationDuty(actor, params.id, await body()));
