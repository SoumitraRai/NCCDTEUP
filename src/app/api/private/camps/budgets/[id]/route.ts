import { route } from "@/server/http";
import { resubmitBudget } from "@/modules/camps/budgets";
// Edit and send again after a return (the preparer only).
export const PATCH = route<{ id: string }>(async ({ actor, params, body }) => resubmitBudget(actor, params.id, await body()));
