import { route } from "@/server/http";
import { cancelBudget } from "@/modules/camps/budgets";
export const POST = route<{ id: string }>(async ({ actor, params, body }) => cancelBudget(actor, params.id, await body()));
