import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { PublicShell } from "@/components/public-shell";
import { SecuritySetup } from "@/components/security-setup";
import { getLocale } from "@/lib/localization/messages";
export const dynamic = "force-dynamic";
export const metadata = { title: "Account security", robots: { index: false, follow: false } };
// Optional authenticator set-up. Needs a signed-in session but not dashboard
// access (when REQUIRE_TWO_FACTOR is on, officers without one are sent here).
export default async function Security({ params }: PageProps<"/[locale]/security">) {
  const locale = getLocale((await params).locale);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);
  return (
    <PublicShell locale={locale}>
      <SecuritySetup locale={locale} enabled={!!session.user.twoFactorEnabled} />
    </PublicShell>
  );
}
