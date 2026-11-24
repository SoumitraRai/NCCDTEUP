import { redirect } from "next/navigation";
import { getLocale } from "@/lib/localization/messages";
// Officers sign in on the same page as everyone else.
export default async function Page({ params }: PageProps<"/[locale]/officers/login">) {
  redirect(`/${getLocale((await params).locale)}/login`);
}
