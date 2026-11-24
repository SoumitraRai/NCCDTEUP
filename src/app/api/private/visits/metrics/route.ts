import { route } from "@/server/http";
import { visitMetrics } from "@/modules/visits/service";
export const GET = route(({ actor, query }) => visitMetrics(actor, query.get("year") ?? undefined));
