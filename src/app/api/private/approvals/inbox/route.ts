import { route } from "@/server/http";
import { billInbox } from "@/modules/bills/service";
export const GET = route(async ({ actor }) => ({ bills: await billInbox(actor) }));
