import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorFrom, AppError } from "@/server/authorization";
// One actor lookup per request, shared by the layout and the page.
export const currentActor = cache(async (locale: string) => {
  try {
    return await actorFrom(await headers());
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect(`/${locale}/login`);
    throw e;
  }
});
export const reviewer = (roles: string[]) => roles.some((r) => ["CO", "GROUP", "ADMIN"].includes(r));
