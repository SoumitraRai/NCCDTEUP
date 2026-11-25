import { route } from "@/server/http";
import { saveUnitStrength, unitStrength } from "@/modules/camps/enrolment";
type P = { unitId: string };
// One unit's institutions with authorised and enrolled cadets for ?year=.
export const GET = route<P>(({ actor, params, query }) => unitStrength(actor, params.unitId, query.get("year")?.slice(0, 20) || undefined));
// The unit's CO or AO saves every institution's figures at once.
export const PUT = route<P>(async ({ actor, params, body }) => saveUnitStrength(actor, { ...((await body()) as object), unitId: params.unitId }));
