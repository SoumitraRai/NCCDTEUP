import { csrf, failure, json, localeOf } from "@/server/http";
import { verifyRegistration } from "@/modules/identity/registration";
// Confirms a registration's email. POST from the confirmation page, never a
// GET on the emailed link, so mail scanners that open links do not confirm.
export async function POST(request: Request) {
  try {
    csrf(request);
    const body = await request.json().catch(() => null);
    return json(await verifyRegistration(body));
  } catch (e) {
    return failure(e, localeOf(request));
  }
}
