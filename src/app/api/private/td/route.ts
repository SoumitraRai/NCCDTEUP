import { z } from "zod";
import { route } from "@/server/http";
import { parseList } from "@/modules/platform/query";
import { createTd, listTd } from "@/modules/movement/service";
const queue = z.enum(["pending", "disposed", "completed"]).catch("pending");
// ?queue=pending|disposed|completed&mine=1 plus the usual list parameters.
export const GET = route(({ actor, query }) =>
  listTd(actor, { ...parseList(Object.fromEntries([...query].filter(([k]) => !["queue", "mine"].includes(k)))), queue: queue.parse(query.get("queue")), mine: query.get("mine") === "1" }),
);
export const POST = route(async ({ actor, body }) => createTd(actor, await body()), 201);
