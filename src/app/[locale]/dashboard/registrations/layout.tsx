import { notFound } from "next/navigation";
import { getLocale } from "@/lib/localization/messages";
import { currentActor, reviewer } from "@/components/app/session";
import { canApproveOfficers } from "@/modules/identity/officer-registration";
// Only those who can decide some registrations see this page: reviewers (CO,
// Group, Admin) for members, heads and delegates for officers. Checked above
// the loading skeleton so others get a real 404.
export default async function RegistrationsLayout({ children, params }: LayoutProps<"/[locale]/dashboard/registrations">) {
  const actor = await currentActor(getLocale((await params).locale));
  if (!reviewer(actor.assignments.map((a) => a.role)) && !(await canApproveOfficers(actor))) notFound();
  return children;
}
