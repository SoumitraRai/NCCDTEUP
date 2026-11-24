import { route } from "@/server/http";
import { subjects } from "@/modules/visits/service";
export const GET = route(() => subjects());
