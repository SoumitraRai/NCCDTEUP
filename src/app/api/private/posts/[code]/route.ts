import { route, localeOf } from "@/server/http";
import { setPostHolder } from "@/modules/identity/post-accounts";
export const POST = route<{ code: string }>(async ({ actor, params, body, request }) => setPostHolder(actor, params.code, await body(), localeOf(request)));
