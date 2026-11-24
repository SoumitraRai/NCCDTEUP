import { csrf, failure, json, localeOf } from "@/server/http";
import { submitRegistration } from "@/modules/identity/registration";
// Public, unauthenticated. Same-origin only, rate-limited per client and per
// email, and the answer never reveals whether the email already has an
// account. The client key uses the first X-Forwarded-For hop, which the
// deployment's reverse proxy must set (see docs/deployment.md).
export async function POST(request: Request) {
  try {
    csrf(request);
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    return json(await submitRegistration(body, client, localeOf(request)), 202);
  } catch (e) {
    return failure(e, localeOf(request));
  }
}
