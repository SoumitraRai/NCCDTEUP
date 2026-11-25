import { route } from "@/server/http";
import { createCamp, listCamps } from "@/modules/camps/service";
// ?year=&q=&group=&state=UPCOMING|CURRENT|COMPLETED|CANCELLED&report=DUE|OVERDUE|SUBMITTED|RETURNED|ACCEPTED
export const GET = route(({ actor, query }) =>
  listCamps(actor, Object.fromEntries(["year", "q", "group", "state", "report"].map((k) => [k, query.get(k)?.slice(0, 60) || undefined]))),
);
export const POST = route(async ({ actor, body }) => createCamp(actor, await body()), 201);
