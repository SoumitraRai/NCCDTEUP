import { PublicShell } from "@/components/public-shell";
import { VerifyEmail } from "@/components/verify-email";
import { getLocale } from "@/lib/localization/messages";
export const dynamic = "force-dynamic";
// The token stays out of search engines and referrers.
export const metadata = { title: "Confirm email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: PageProps<"/[locale]/register/verify">) {
  const locale = getLocale((await params).locale);
  const token = (await searchParams).token;
  return (
    <PublicShell locale={locale}>
      <VerifyEmail locale={locale} token={typeof token === "string" ? token : ""} />
    </PublicShell>
  );
}
