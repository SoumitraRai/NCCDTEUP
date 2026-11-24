import { route } from "@/server/http";
import { deactivateInstitution, updateInstitution } from "@/modules/visits/service";
export const PATCH = route<{ id: string }>(async ({ actor, params, body }) => updateInstitution(actor, params.id, await body()));
export const DELETE = route<{ id: string }>(async ({ actor, params, body }) => deactivateInstitution(actor, params.id, await body()));
