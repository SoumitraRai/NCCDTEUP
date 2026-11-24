import { getRequestConfig } from "next-intl/server";
import { messages, getLocale } from "@/lib/localization/messages";
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = getLocale((await requestLocale) ?? "en");
  return { locale, messages: messages[locale], timeZone: "Asia/Kolkata" };
});
