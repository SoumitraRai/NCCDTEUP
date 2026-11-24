import { route } from "@/server/http";
import { parseList } from "@/modules/platform/query";
import { createInstitution, listInstitutions } from "@/modules/visits/service";
export const GET = route(({ actor, query }) => listInstitutions(actor, parseList(query)));
export const POST = route(async ({ actor, body }) => createInstitution(actor, await body()), 201);
