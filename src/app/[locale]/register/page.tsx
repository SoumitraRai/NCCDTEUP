import { PublicShell } from "@/components/public-shell";
import { RegisterForm } from "@/components/register-form";
import { getLocale } from "@/lib/localization/messages";
import { emailVerificationRequired } from "@/server/mail";
import { registrationInstitutions } from "@/modules/identity/registration";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: PageProps<"/[locale]/register">) {
  return { title: getLocale((await params).locale) === "hi" ? "पंजीकरण" : "Register" };
}
export default async function Page({ params }: PageProps<"/[locale]/register">) {
  const locale = getLocale((await params).locale);
  return (
    <PublicShell locale={locale}>
      <RegisterForm locale={locale} institutions={await registrationInstitutions()} confirm={emailVerificationRequired()} />
    </PublicShell>
  );
}
