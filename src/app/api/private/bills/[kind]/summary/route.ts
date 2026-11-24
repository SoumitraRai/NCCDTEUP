import { route } from "@/server/http";
import { billSummary } from "@/modules/bills/service";
import { billKind } from "../../kind";
export const GET = route<{ kind: string }>(({ actor, params, query }) => billSummary(actor, billKind(params.kind), query.get("year") ?? undefined));
