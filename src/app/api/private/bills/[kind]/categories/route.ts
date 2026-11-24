import { route } from "@/server/http";
import { categories } from "@/modules/bills/service";
import { billKind } from "../../kind";
export const GET = route<{ kind: string }>(({ params }) => categories(billKind(params.kind)));
