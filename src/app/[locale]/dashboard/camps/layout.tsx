import { notFound } from "next/navigation";
import { getLocale } from "@/lib/localization/messages";
import { currentActor } from "@/components/app/session";
// Camps are for officers, ANOs and CTOs; cadets get a real 404.
export default async function CampsLayout({ children, params }: LayoutProps<"/[locale]/dashboard/camps">) {
  if ((await currentActor(getLocale((await params).locale))).assignments.every((a) => a.role === "CADET")) notFound();
  return children;
}
