import { route } from "@/server/http";
import { parseList } from "@/modules/platform/query";
import { listOfficerRequests } from "@/modules/identity/officer-registration";
export const GET = route(({ actor, query }) => listOfficerRequests(actor, parseList(query)));
