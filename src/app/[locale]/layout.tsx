import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { messages, getLocale } from "@/lib/localization/messages";
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!["en", "hi"].includes(locale)) notFound();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages[getLocale(locale)]}
      timeZone="Asia/Kolkata"
    >
      <div lang={locale}>{children}</div>
    </NextIntlClientProvider>
  );
}
