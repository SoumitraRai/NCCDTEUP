import { publicContent } from "@/modules/publications/service";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  return Response.json(
    await publicContent(
      p.get("locale") === "hi" ? "hi" : "en",
      p.get("category") ?? undefined,
      p.get("archived") === "true",
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
