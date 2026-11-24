import { route } from "@/server/http";
import { getBill } from "@/modules/bills/service";
import { billKind } from "../../kind";
export const GET = route<{ kind: string; id: string }>(async ({ actor, params }) => {
  billKind(params.kind);
  return getBill(actor, params.id);
});
