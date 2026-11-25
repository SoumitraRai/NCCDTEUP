import { route } from "@/server/http";
import { decideReport } from "@/modules/camps/service";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => decideReport(actor, params.id, await body()));
