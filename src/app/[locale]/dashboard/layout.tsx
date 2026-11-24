import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { IBM_Plex_Sans, IBM_Plex_Sans_Devanagari } from "next/font/google";
import { AppError } from "@/server/authorization";
import { getLocale } from "@/lib/localization/messages";
import { trainingYears, resolveTrainingYear } from "@/modules/platform/training-year";
import { billInbox } from "@/modules/bills/service";
import { tdInbox, tdNotices } from "@/modules/movement/service";
import { pendingRegistrations } from "@/modules/identity/registration";
import { isOfficer } from "@/modules/identity/officers";
import { canApproveOfficers, pendingOfficerRequests } from "@/modules/identity/officer-registration";
import { currentActor, reviewer } from "@/components/app/session";
import { dict } from "@/components/app/i18n";
import { Nav, SignOut, ThemeSwitch, YearPicker, type NavItem } from "@/components/app/shell-client";
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });
const plexDeva = IBM_Plex_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-plex-deva", display: "swap" });
export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };
export default async function DashboardLayout({ children, params }: LayoutProps<"/[locale]/dashboard">) {
  const locale = getLocale((await params).locale);
  const t = dict(locale).shell;
  let actor;
  try {
    actor = await currentActor(locale);
  } catch (e) {
    // Let the sign-in redirect through; only real access errors show here.
    unstable_rethrow(e);
    return (
      <div className={`app ${plex.variable} ${plexDeva.variable} grid place-items-center p-6`}>
        <div className="max-w-md rounded-xl border bg-surface p-8">
          <h1 className="text-xl font-semibold">{t.accessTitle}</h1>
          <p className="mt-2 text-muted">{e instanceof AppError ? e.message : t.accessRetry}</p>
          <div className="mt-6 flex gap-4 text-primary">
            <a href={`/${locale}/login`}>{t.signIn}</a>
            <a href={`/${locale}/security`}>{t.twoFactor}</a>
          </div>
        </div>
      </div>
    );
  }
  const roles = actor.assignments.map((a) => a.role);
  const cadet = roles.every((r) => r === "CADET");
  const approvesOfficers = await canApproveOfficers(actor);
  const officer = isOfficer(actor);
  const [years, { year }, inbox, waitingMembers, waitingOfficers, tdWaiting, tdUnread] = await Promise.all([
    trainingYears(),
    resolveTrainingYear(),
    reviewer(roles) ? billInbox(actor) : [],
    reviewer(roles) ? pendingRegistrations(actor) : 0,
    approvesOfficers ? pendingOfficerRequests(actor) : 0,
    officer ? tdInbox(actor) : [],
    officer ? tdNotices(actor) : [],
  ]);
  const waiting = waitingMembers + waitingOfficers;
  const base = `/${locale}/dashboard`;
  const items: NavItem[] = [
    { href: base, label: t.overview, icon: "overview" },
    ...(reviewer(roles) || officer ? [{ href: `${base}/approvals`, label: t.pending, icon: "approvals" as const, count: inbox.length + tdWaiting.length }] : []),
    { href: `${base}/visits`, label: t.visits, icon: "visits", section: t.sectionVisits },
    ...(cadet
      ? []
      : [
          { href: `${base}/institutions`, label: t.institutions, icon: "institutions" as const, section: t.sectionVisits },
          { href: `${base}/bills/refreshment`, label: t.refreshment, icon: "refreshment" as const, section: t.sectionVisits },
          { href: `${base}/bills/honorarium`, label: t.honorarium, icon: "honorarium" as const, section: t.sectionVisits },
        ]),
    ...(officer ? [{ href: `${base}/movement/td`, label: t.movement, icon: "movement" as const, count: tdUnread.length + tdWaiting.length, section: t.sectionMovement }] : []),
    ...(officer ? [{ href: `${base}/officers`, label: t.officers, icon: "officers" as const, section: t.sectionPeople }] : []),
    ...(reviewer(roles) || approvesOfficers ? [{ href: `${base}/registrations`, label: t.registrations, icon: "registrations" as const, count: waiting, section: t.sectionPeople }] : []),
    ...(roles.includes("ADMIN") ? [{ href: `${base}/posts`, label: t.posts, icon: "posts" as const, section: t.sectionPeople }] : []),
    { href: `/${locale}/workspace`, label: t.other, icon: "workspace", section: t.sectionMore },
  ];
  const assignment = actor.assignments[0];
  const who = (
    <>
      <div className="px-3 pb-2">
        <p className="truncate text-[13px] font-medium text-white">{actor.name}</p>
        <p className="truncate text-xs text-rail-ink/70">{t.roles[assignment.role] ?? assignment.role}</p>
      </div>
      <a href={`/${locale}/security`} className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] text-rail-ink hover:bg-white/5 hover:text-white">
        {t.security}
      </a>
      <SignOut locale={locale} />
    </>
  );
  return (
    <div lang={locale} className={`app ${plex.variable} ${plexDeva.variable} lg:grid lg:grid-cols-[248px_1fr]`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t.skip}
      </a>
      <aside className="sticky top-0 z-40 flex items-center justify-between bg-rail px-4 py-3 lg:h-dvh lg:flex-col lg:items-stretch lg:justify-start lg:px-0 lg:py-5">
        <div className="flex items-center gap-3 lg:mb-6 lg:px-6">
          <span aria-hidden className="flex h-7 w-1.5 flex-col overflow-hidden rounded-full">
            <span className="flex-1 bg-flag-red" />
            <span className="flex-1 bg-flag-navy" />
            <span className="flex-1 bg-flag-sky" />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-white">Sampark</p>
            <p className="text-xs text-rail-ink/70">{t.directorate}</p>
          </div>
        </div>
        <div className="lg:flex-1 lg:overflow-y-auto">
          <Nav items={items} footer={who} />
        </div>
        <div className="hidden border-t border-white/10 px-3 pt-4 lg:block">{who}</div>
      </aside>
      <div className="min-w-0">
        <header className="z-30 lg:sticky lg:top-0 flex flex-wrap items-center justify-end gap-3 border-b bg-bg/90 px-4 py-2.5 backdrop-blur sm:px-8">
          <Suspense>
            <YearPicker years={years.map((y) => y.label)} current={year.label} />
          </Suspense>
          <a href={`/${locale === "en" ? "hi" : "en"}/dashboard`} className="text-[13px] text-muted hover:text-ink" lang={locale === "en" ? "hi" : "en"}>
            {locale === "en" ? "हिन्दी" : "English"}
          </a>
          <ThemeSwitch />
        </header>
        <main id="main" className="mx-auto max-w-[1360px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
