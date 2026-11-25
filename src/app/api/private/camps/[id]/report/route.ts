import { route } from "@/server/http";
import { submitReport } from "@/modules/camps/service";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => submitReport(actor, params.id, await body()));
