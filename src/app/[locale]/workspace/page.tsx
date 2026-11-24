import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorFrom, AppError, scope } from "@/server/authorization";
import { db } from "@/server/db";
import { Dashboard } from "@/components/dashboard";
import { getLocale } from "@/lib/localization/messages";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = getLocale((await params).locale);
  let actor;
  try {
    actor = await actorFrom(await headers());
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect(`/${locale}/login`);
    return (
      <main className="prose">
        <h1>Access unavailable / पहुँच उपलब्ध नहीं</h1>
        <p>{e instanceof AppError ? e.message : "Please try again."}</p>
        <a href={`/${locale}/login`}>Sign in / साइन इन</a><br/><a href={`/${locale}/security`}>Set up two-factor authentication / दो-कारक प्रमाणीकरण</a>
      </main>
    );
  }
  const institutions = await db.institution.findMany({
    where: scope(actor, "read"),
    select: { id: true, name: true, district: true },
  });
  return (
    <Dashboard
      locale={locale}
      user={{
        id: actor.id,
        name: actor.name,
        roles: actor.assignments.map((a) => a.role),
        capabilities: actor.assignments.flatMap((a) => a.capabilities),
        institutions,
      }}
      demo={process.env.APP_MODE !== "production"}
    />
  );
}
