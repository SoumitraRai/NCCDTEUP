import { z } from "zod";
import { route } from "@/server/http";
import { BUDGET_QUEUES, createBudget, listBudgets } from "@/modules/camps/budgets";
const queue = z.enum(BUDGET_QUEUES).catch("pending");
// ?queue=pending|process|disposed|due&year=&q=
export const GET = route(({ actor, query }) =>
  listBudgets(actor, { queue: queue.parse(query.get("queue")), year: query.get("year")?.slice(0, 20) || undefined, q: query.get("q")?.slice(0, 200) || undefined }),
);
export const POST = route(async ({ actor, body }) => createBudget(actor, await body()), 201);
