import { csrf, failure, json, localeOf } from "@/server/http";
import { completePasswordSetup } from "@/modules/identity/post-accounts";
// Public: sets a password from a one-time emailed link (POST from a form).
export async function POST(request: Request) {
  try {
    csrf(request);
    return json(await completePasswordSetup(await request.json().catch(() => null)));
  } catch (e) {
    return failure(e, localeOf(request));
  }
}
