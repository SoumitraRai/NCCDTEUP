import { route } from "@/server/http";
import { parseList } from "@/modules/platform/query";
import { createVisit, listVisits } from "@/modules/visits/service";
export const GET = route(({ actor, query }) => listVisits(actor, parseList(query)));
export const POST = route(async ({ actor, body }) => createVisit(actor, await body()), 201);
