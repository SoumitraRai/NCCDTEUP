"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
// Switches between English and Hindi on the same page, keeping the query
// (filters, the open record, the training year).
function Switch({ locale, className }: { locale: string; className?: string }) {
  const path = usePathname();
  const query = useSearchParams().toString();
  const other = locale === "en" ? "hi" : "en";
  const rest = path.replace(/^\/(en|hi)(?=\/|$)/, "");
  return (
    <Link href={`/${other}${rest}${query ? `?${query}` : ""}`} className={className} lang={other} scroll={false}>
      {locale === "en" ? "हिन्दी" : "English"}
    </Link>
  );
}
export function LanguageLink({ locale, className }: { locale: string; className?: string }) {
  // Until the address is known (it is read on the client), link to home.
  return (
    <Suspense fallback={<Link href={`/${locale === "en" ? "hi" : "en"}`} className={className} lang={locale === "en" ? "hi" : "en"}>{locale === "en" ? "हिन्दी" : "English"}</Link>}>
      <Switch locale={locale} className={className} />
    </Suspense>
  );
}
