import { route } from "@/server/http";
import { getCampBudgets } from "@/modules/camps/budgets";
// Every budget stage of one camp side by side, with what may be prepared now.
export const GET = route<{ id: string }>(({ actor, params }) => getCampBudgets(actor, params.id));
