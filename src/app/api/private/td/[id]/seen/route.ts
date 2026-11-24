import { route } from "@/server/http";
import { markTdSeen } from "@/modules/movement/service";
export const POST = route<{ id: string }>(async ({ actor, params }) => (await markTdSeen(actor, params.id), { ok: true }));
