import { route } from "@/server/http";
import { visitExceptions } from "@/modules/visits/service";
export const GET = route(({ actor, query }) => visitExceptions(actor, query.get("year") ?? undefined));
