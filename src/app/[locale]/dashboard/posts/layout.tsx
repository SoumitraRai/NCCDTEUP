import { notFound } from "next/navigation";
import { getLocale } from "@/lib/localization/messages";
import { currentActor } from "@/components/app/session";
// Directorate admins only; others get a real 404.
export default async function PostsLayout({ children, params }: LayoutProps<"/[locale]/dashboard/posts">) {
  const actor = await currentActor(getLocale((await params).locale));
  if (!actor.assignments.some((a) => a.role === "ADMIN")) notFound();
  return children;
}
