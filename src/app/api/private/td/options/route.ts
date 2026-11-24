import { route } from "@/server/http";
import { tdOptions } from "@/modules/movement/service";
export const GET = route(({ actor }) => tdOptions(actor));
