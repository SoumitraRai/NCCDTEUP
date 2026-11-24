import { PublicShell } from "@/components/public-shell";
import { OfficerRegisterForm } from "@/components/officer-register-form";
import { getLocale } from "@/lib/localization/messages";
import { emailVerificationRequired } from "@/server/mail";
import { officerFormations, officerPosts } from "@/modules/identity/officer-registration";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: PageProps<"/[locale]/officers/register">) {
  return { title: getLocale((await params).locale) === "hi" ? "अधिकारी पंजीकरण" : "Officer registration" };
}
export default async function Page({ params }: PageProps<"/[locale]/officers/register">) {
  const locale = getLocale((await params).locale);
  const [posts, formations] = await Promise.all([officerPosts(), officerFormations()]);
  return (
    <PublicShell locale={locale}>
      <OfficerRegisterForm locale={locale} posts={posts} formations={formations} confirm={emailVerificationRequired()} />
    </PublicShell>
  );
}
