import { notFound } from "next/navigation";
import { getLocale } from "@/lib/localization/messages";
import { currentActor } from "@/components/app/session";
// Access checks live here, above this segment's loading skeleton, so a
// refused request still answers 404 instead of a streamed 200.
export default async function BillsLayout({ children, params }: LayoutProps<"/[locale]/dashboard/bills/[kind]">) {
  const { locale, kind } = await params;
  if (!["refreshment", "honorarium"].includes(kind)) notFound();
  const actor = await currentActor(getLocale(locale));
  if (actor.assignments.every((a) => a.role === "CADET")) notFound();
  return children;
}
