import { PublicShell } from "@/components/public-shell";
import { LoginForm } from "@/components/login-form";
import { getLocale } from "@/lib/localization/messages";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = getLocale((await params).locale);
  return (
    <PublicShell locale={locale}>
      <LoginForm locale={locale} />
    </PublicShell>
  );
}
