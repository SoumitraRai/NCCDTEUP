import Link from "next/link";
import { ArrowUpRight, CornerUpLeft, FilePen, Inbox, Plane, Tent } from "lucide-react";
import { getLocale } from "@/lib/localization/messages";
import { visitExceptions, visitMetrics } from "@/modules/visits/service";
import { billInbox, billSummary, myBillWork } from "@/modules/bills/service";
import { tdInbox, tdNotices } from "@/modules/movement/service";
import { campWork } from "@/modules/camps/service";
import { isOfficer } from "@/modules/identity/officers";
import { tdDates } from "@/components/app/td-detail";
import { currentActor, reviewer } from "@/components/app/session";
import { MonthBars, Progress } from "@/components/app/charts";
import { ago, day, inr } from "@/components/app/format";
import { dict } from "@/components/app/i18n";
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard">) {
  return { title: dict((await params).locale).overview.title };
}
export default async function Overview({ params, searchParams }: PageProps<"/[locale]/dashboard">) {
  const locale = getLocale((await params).locale);
  const T = dict(locale);
  const t = T.overview;
  const year = ((await searchParams).year as string | undefined) || undefined;
  const actor = await currentActor(locale);
  const roles = actor.assignments.map((a) => a.role);
  const cadet = roles.every((r) => r === "CADET");
  const officer = isOfficer(actor);
  const [metrics, exceptions, inbox, mine, refreshment, honorarium, tdWaiting, notices, camps] = await Promise.all([
    visitMetrics(actor, year),
    visitExceptions(actor, year),
    reviewer(roles) ? billInbox(actor) : [],
    cadet ? { drafts: [], returned: [] } : myBillWork(actor),
    cadet ? null : billSummary(actor, "REFRESHMENT", year),
    cadet ? null : billSummary(actor, "HONORARIUM", year),
    officer ? tdInbox(actor) : [],
    officer ? tdNotices(actor) : [],
    cadet ? null : campWork(actor, year),
  ]);
  const base = `/${locale}/dashboard`;
  const q = year ? `?year=${year}` : "";
  // One bill opens directly; several open the list of the oldest bill's kind.
  const ownLink = (rows: { id: string; kind: string }[], status: string) => {
    const slug = rows[0]?.kind === "HONORARIUM" ? "honorarium" : "refreshment";
    return rows.length === 1 ? `${base}/bills/${slug}?open=${rows[0].id}` : `${base}/bills/${slug}?status=${status}`;
  };
  const queue = [
    reviewer(roles) && { href: `${base}/approvals`, icon: Inbox, count: inbox.length, label: t.waiting, since: inbox[0]?.waitingSince, tone: "text-accent" },
    tdWaiting.length > 0 && { href: `${base}/approvals`, icon: Plane, count: tdWaiting.length, label: t.tdWaiting, since: tdWaiting[0]?.waitingSince, tone: "text-accent" },
    camps && camps.toReview.length > 0 && { href: camps.toReview.length === 1 ? `${base}/camps?view=reports&report=SUBMITTED&open=${camps.toReview[0].id}` : `${base}/camps?view=reports&report=SUBMITTED`, icon: Tent, count: camps.toReview.length, label: t.campReview, since: camps.toReview[0].since, tone: "text-accent" },
    camps && camps.toReport.length > 0 && { href: camps.toReport.length === 1 ? `${base}/camps?view=reports&report=${camps.toReport[0].report}&open=${camps.toReport[0].id}` : `${base}/camps?view=reports`, icon: Tent, count: camps.toReport.length, label: t.campReport, since: new Date(`${camps.toReport[0].end}T00:00:00Z`), tone: camps.toReport.some((c) => c.report !== "DUE") ? "text-danger" : "text-warning" },
    mine.returned.length > 0 && { href: ownLink(mine.returned, "RETURNED"), icon: CornerUpLeft, count: mine.returned.length, label: t.returned, since: mine.returned[0]?.updatedAt, tone: "text-warning" },
    mine.drafts.length > 0 && { href: ownLink(mine.drafts, "DRAFT"), icon: FilePen, count: mine.drafts.length, label: t.drafts, since: mine.drafts[0]?.updatedAt, tone: "text-muted" },
  ].filter(Boolean) as { href: string; icon: typeof Inbox; count: number; label: string; since?: Date; tone: string }[];
  const coverage = metrics.institutions ? Math.round((metrics.institutionsVisited / metrics.institutions) * 100) : 0;
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro(metrics.year)}</p>
      </div>

      {notices.length > 0 && (
        <section aria-labelledby="td-notices">
          <h2 id="td-notices" className="mb-3 text-base font-semibold">{t.tdNotices}</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {notices.map((n) => (
              <li key={n.id} className="flex items-start gap-4 rounded-xl border border-accent/40 bg-surface p-4">
                <Plane size={20} className="mt-0.5 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{T.td.notices[n.message] ?? n.message}</p>
                  <p className="text-[13px] text-muted">{t.tdBy(n.td.createdBy)}</p>
                  <p className="mt-2 text-[13.5px]">{n.td.from} → {n.td.to}</p>
                  <p className="text-[13.5px]">{tdDates(n.td, locale)}, {T.td.days(n.td.halfDays)}</p>
                  <p className="truncate text-[13px] text-muted">{n.td.purpose}</p>
                </div>
                <Link href={`/${locale}${n.link}`} className="shrink-0 text-[13px] font-medium text-primary hover:underline">{t.open}<span className="sr-only">: {n.td.purpose}</span></Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {queue.length > 0 && (
        <section aria-labelledby="queue">
          <h2 id="queue" className="mb-3 text-base font-semibold">{t.needsAction}</h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {queue.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="group flex items-start gap-4 rounded-xl border bg-surface p-4 transition-colors duration-150 hover:border-primary/40">
                  <item.icon size={20} className={`mt-1 ${item.tone}`} />
                  <div className="flex-1">
                    <p className="text-[28px] leading-8 font-semibold">{item.count}</p>
                    <p className="text-muted">{item.label}</p>
                    {item.since && item.count > 0 && <p className="mt-1 text-xs text-muted">{t.oldest(ago(item.since, locale))}</p>}
                  </div>
                  <ArrowUpRight size={16} className="text-muted transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="visits" className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-xl border bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="visits" className="text-base font-semibold">{t.visitsMonthly}</h2>
            <Link href={`${base}/visits${q}`} className="text-[13px] text-primary hover:underline">{t.allVisits}</Link>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-4">
            {[
              [t.visits, metrics.visits],
              [t.cadetsReached, metrics.cadetsReached],
              [t.periodsTaught, metrics.periods],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="text-2xl font-semibold">{Number(v).toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6">
            <MonthBars data={metrics.months.map((m) => ({ month: m.month, value: m.visits }))} locale={locale} label={t.visits} />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border bg-surface p-5">
            <h2 className="text-base font-semibold">{t.coverage}</h2>
            <p className="mt-3 text-[28px] leading-8 font-semibold">{coverage}%</p>
            <p className="mb-3 text-muted">
              {t.coverageOf(metrics.institutionsVisited, metrics.institutions)}
            </p>
            <Progress value={metrics.institutionsVisited} total={metrics.institutions} label={t.visited} />
          </div>
          <div className="rounded-xl border bg-surface p-5">
            <h2 className="text-base font-semibold">{t.followUp}</h2>
            {exceptions.noVisit.length + exceptions.noPiVisit.length === 0 ? (
              <p className="mt-2 text-muted">{t.allCovered}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {exceptions.noVisit.map((u) => (
                  <li key={`n-${u.id}`} className="flex justify-between gap-3"><span>{u.name}</span><span className="text-[13px] text-danger">{t.noVisit}</span></li>
                ))}
                {exceptions.noPiVisit
                  .filter((u) => !exceptions.noVisit.some((n) => n.id === u.id))
                  .map((u) => (
                    <li key={`p-${u.id}`} className="flex justify-between gap-3"><span>{u.name}</span><span className="text-[13px] text-warning">{t.noPi}</span></li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {camps && (
        <section aria-labelledby="camps">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="camps" className="text-base font-semibold">{t.campsYear}</h2>
            <Link href={`${base}/camps${q}`} className="text-[13px] text-primary hover:underline">{t.campsAll}</Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {([
              [T.camps.tiles.CURRENT, camps.camps.filter((c) => c.state === "CURRENT").length, `state=CURRENT`, ""],
              [T.camps.tiles.UPCOMING, camps.camps.filter((c) => c.state === "UPCOMING").length, `state=UPCOMING`, ""],
              [T.status.report.DUE, camps.camps.filter((c) => c.report === "DUE").length, `view=reports&report=DUE`, ""],
              [T.camps.tiles.OVERDUE, camps.camps.filter((c) => c.report === "OVERDUE").length, `view=reports&report=OVERDUE`, "text-danger"],
            ] as const).map(([label, n, link, tone]) => (
              <li key={label}>
                <Link href={`${base}/camps?${link}${year ? `&year=${year}` : ""}`} className="block rounded-xl border bg-surface px-4 py-3 hover:bg-surface-2/70">
                  <p className="text-[13px] text-muted">{label}</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${n > 0 ? tone : ""}`}>{n}</p>
                </Link>
              </li>
            ))}
          </ul>
          {(() => {
            const next = camps.camps.find((c) => c.state === "UPCOMING");
            return <p className="mt-3 text-[13.5px] text-muted">{next ? t.nextCamp(T.camps.catc(next.catcNo), `${next.location} (${next.unit.name})`, day(next.start, locale)) : t.noNextCamp}</p>;
          })()}
          {(() => {
            // Briefings from today up to 7 days ahead, soonest first.
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            const until = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
            const soon = camps.camps.filter((c) => c.state === "UPCOMING" && c.briefing && c.briefing >= today && c.briefing <= until).sort((a, b) => a.briefing!.localeCompare(b.briefing!));
            return soon.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-[13px] font-medium text-muted">{t.briefingsSoon}</h3>
                <ul className="divide-y rounded-xl border bg-surface">
                  {soon.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px]">
                      <Link href={`${base}/camps?open=${c.id}`} className="font-medium hover:text-primary">{T.camps.catc(c.catcNo)} · {c.location}</Link>
                      <span className="font-medium text-primary">{T.camps.briefingOn(day(c.briefing!, locale))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </section>
      )}

      {refreshment && honorarium && (
        <section aria-labelledby="bills">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="bills" className="text-base font-semibold">{t.billsYear}</h2>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-surface">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-surface-2 text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t.bill}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.submitted}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.inReview}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.returnedCol}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.sanctioned}</th>
                  <th className="px-5 py-2.5 font-medium">{t.paid}</th>
                </tr>
              </thead>
              <tbody>
                {([[t.refreshment, "refreshment", refreshment], [t.honorarium, "honorarium", honorarium]] as const).map(([label, slug, s]) => (
                  <tr key={slug} className="border-t">
                    <td className="px-5 py-3">
                      <Link href={`${base}/bills/${slug}${q}`} className="font-medium hover:text-primary">{label}</Link>
                      <p className="text-[13px] text-muted">{t.claimed(inr(s.totals.claimedPaise))}</p>
                    </td>
                    <td className="px-5 py-3 text-right">{s.totals.submitted}</td>
                    <td className="px-5 py-3 text-right">{s.totals.inReview}</td>
                    <td className="px-5 py-3 text-right">{s.totals.returned}</td>
                    <td className="px-5 py-3 text-right">{s.totals.approved}</td>
                    <td className="w-56 px-5 py-3">
                      <div className="mb-1.5 flex justify-between text-[13px]"><span>{t.paidCount(s.totals.paid)}</span><span className="text-muted">{inr(s.totals.paidPaise)}</span></div>
                      <Progress value={s.totals.paid} total={s.totals.submitted} label={t.billsPaid(label)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
