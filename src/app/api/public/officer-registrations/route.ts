import { csrf, failure, json, localeOf } from "@/server/http";
import { submitOfficerRegistration } from "@/modules/identity/officer-registration";
// Public officer registration: same protections as the member form
// (same-origin, rate limits, identical answer for known emails).
export async function POST(request: Request) {
  try {
    csrf(request);
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
    const body = await request.json().catch(() => null);
    return json(await submitOfficerRegistration(body, client, localeOf(request)), 202);
  } catch (e) {
    return failure(e, localeOf(request));
  }
}
