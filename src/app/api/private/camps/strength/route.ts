import { route } from "@/server/http";
import { campStrength } from "@/modules/camps/service";
export const GET = route(({ actor, query }) => campStrength(actor, { year: query.get("year")?.slice(0, 20) || undefined, group: query.get("group")?.slice(0, 40) || undefined }));
