import { route } from "@/server/http";
import { campOptions } from "@/modules/camps/service";
export const GET = route(({ actor }) => campOptions(actor));
