import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./authorization";
import { toHindi } from "./messages-hi";
export const json = (value: unknown, status = 200) =>
  new NextResponse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    },
  );
export const localeOf = (request: Request) =>
  request.headers.get("x-sampark-locale") === "hi" ? "hi" : "en";
// `locale` comes from the dashboard's x-sampark-locale header; messages
// without a Hindi entry stay in English.
export function failure(error: unknown, locale = "en") {
  const say = (m: string) => (locale === "hi" ? toHindi(m) : m);
  if (error instanceof AppError)
    return json({ error: say(error.message) }, error.status);
  if (error instanceof ZodError)
    return json(
      {
        error: say("Check the highlighted fields."),
        issues: error.issues.map((i) => ({ ...i, message: say(i.message) })),
      },
      400,
    );
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["P2002", "P2034"].includes(String(error.code))
  )
    return json(
      {
        error: say(
          "This record changed or already exists. Refresh and try again.",
        ),
      },
      409,
    );
  console.error(
    JSON.stringify({
      event: "request_failure",
      type: error instanceof Error ? error.name : "unknown",
    }),
  );
  return json({ error: say("The request could not be completed.") }, 500);
}
export function csrf(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin
  )
    throw new AppError(403, "Invalid request origin.");
}
// Route handler wrapper: same-origin check for mutations, per-request actor,
// uniform error mapping. Handlers stay thin; logic lives in src/modules.
type Handler<C> = (ctx: {
  request: Request;
  actor: import("./authorization").Actor;
  params: C;
  query: URLSearchParams;
  body: () => Promise<unknown>;
}) => Promise<unknown>;
export function route<C = Record<string, never>>(handler: Handler<C>, status = 200) {
  return async (request: Request, context?: { params: Promise<C> }) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) csrf(request);
      const { actorFrom } = await import("./authorization");
      const actor = await actorFrom(request.headers);
      const params = (await context?.params) ?? ({} as C);
      const result = await handler({
        request,
        actor,
        params,
        query: new URL(request.url).searchParams,
        body: async () => {
          try {
            return await request.json();
          } catch {
            throw new AppError(400, "Send a JSON body.");
          }
        },
      });
      return result instanceof Response ? result : json(result, status);
    } catch (e) {
      return failure(e, localeOf(request));
    }
  };
}
