import { route } from "@/server/http";
import { parseList } from "@/modules/platform/query";
import { listRegistrations } from "@/modules/identity/registration";
export const GET = route(({ actor, query }) => listRegistrations(actor, parseList(query)));
