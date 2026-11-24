import { PublicShell } from "@/components/public-shell";
import { SetPassword } from "@/components/set-password";
import { getLocale } from "@/lib/localization/messages";
export const dynamic = "force-dynamic";
// The token stays out of search engines and referrers.
export const metadata = { title: "Set password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: PageProps<"/[locale]/password/set">) {
  const locale = getLocale((await params).locale);
  const token = (await searchParams).token;
  return (
    <PublicShell locale={locale}>
      <SetPassword locale={locale} token={typeof token === "string" ? token : ""} />
    </PublicShell>
  );
}
