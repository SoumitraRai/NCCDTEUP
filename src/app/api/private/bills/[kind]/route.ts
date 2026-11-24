import { route } from "@/server/http";
import { parseList } from "@/modules/platform/query";
import { createHonorarium, createRefreshment, listBills } from "@/modules/bills/service";
import { billKind } from "../kind";
type P = { kind: string };
export const GET = route<P>(({ actor, params, query }) => listBills(actor, billKind(params.kind), parseList(query)));
export const POST = route<P>(async ({ actor, params, body }) =>
  billKind(params.kind) === "REFRESHMENT" ? createRefreshment(actor, await body()) : createHonorarium(actor, await body()),
201);
