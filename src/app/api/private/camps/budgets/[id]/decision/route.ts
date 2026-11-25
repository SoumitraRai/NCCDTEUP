import { route } from "@/server/http";
import { decideBudget } from "@/modules/camps/budgets";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => decideBudget(actor, params.id, await body()));
