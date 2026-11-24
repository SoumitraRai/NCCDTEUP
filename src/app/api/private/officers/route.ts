import { route } from "@/server/http";
import { parseList } from "@/modules/platform/query";
import { listOfficers } from "@/modules/identity/officers";
export const GET = route(({ actor, query }) => listOfficers(actor, parseList(query)));
