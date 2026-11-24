import { notFound } from "next/navigation";
import { getLocale } from "@/lib/localization/messages";
import { currentActor } from "@/components/app/session";
import { isOfficer } from "@/modules/identity/officers";
// Officers only (TDs are for officer posts); others get a real 404.
export default async function TdLayout({ children, params }: LayoutProps<"/[locale]/dashboard/movement/td">) {
  if (!isOfficer(await currentActor(getLocale((await params).locale)))) notFound();
  return children;
}
