import { notFound } from "next/navigation";
import { getLocale } from "@/lib/localization/messages";
import { currentActor } from "@/components/app/session";
import { isOfficer } from "@/modules/identity/officers";
// Officers only; others get a real 404 (checked above the loading skeleton).
export default async function OfficersLayout({ children, params }: LayoutProps<"/[locale]/dashboard/officers">) {
  if (!isOfficer(await currentActor(getLocale((await params).locale)))) notFound();
  return children;
}
