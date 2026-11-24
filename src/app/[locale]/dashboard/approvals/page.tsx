import Link from "next/link";
import { getLocale } from "@/lib/localization/messages";
import { billInbox } from "@/modules/bills/service";
import { tdInbox } from "@/modules/movement/service";
import { currentActor, reviewer } from "@/components/app/session";
import { RouteStrip, stationsFromState, tdStations } from "@/components/app/route";
import { tdDates, travellerLine } from "@/components/app/td-detail";
import { Status } from "@/components/app/status";
import { ago, day, inr } from "@/components/app/format";
import { dict } from "@/components/app/i18n";
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/approvals">) {
  return { title: dict((await params).locale).approvals.title };
}
export default async function Approvals({ params }: PageProps<"/[locale]/dashboard/approvals">) {
  const locale = getLocale((await params).locale);
  const actor = await currentActor(locale);
  const T = dict(locale);
  const t = T.approvals;
  const [bills, tds] = await Promise.all([reviewer(actor.assignments.map((a) => a.role)) ? billInbox(actor) : [], tdInbox(actor)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </div>
      {tds.length > 0 && (
        <section aria-labelledby="td-inbox" className="space-y-3">
          <h2 id="td-inbox" className="text-base font-semibold">{t.td}</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-surface">
            {tds.map((r) => (
              <li key={r.id}>
                <Link href={`/${locale}/dashboard/movement/td?open=${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-surface-2/70 md:grid-cols-[1.4fr_1fr_auto_auto]">
                  <div>
                    <p className="font-medium">{travellerLine(r)}</p>
                    <p className="text-[13px] text-muted">{r.from} → {r.to}, {r.formation}</p>
                  </div>
                  <p className="text-[13px] text-muted">{tdDates(r, locale)}, {T.td.days(r.halfDays)}</p>
                  <RouteStrip stations={tdStations(r)} locale={locale} />
                  <span className="text-xs whitespace-nowrap text-muted">{t.waiting(ago(r.waitingSince, locale))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tds.length > 0 && bills.length > 0 && <h2 className="text-base font-semibold">{t.bills}</h2>}
      {bills.length === 0 ? (
        tds.length > 0 ? null : (
        <div className="rounded-xl border bg-surface px-6 py-14 text-center">
          <p className="font-medium">{t.none}</p>
          <p className="mt-1 text-muted">{t.noneHint}</p>
        </div>
        )
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-surface">
          {bills.map((b) => {
            const slug = b.kind === "HONORARIUM" ? "honorarium" : "refreshment";
            return (
              <li key={b.id}>
                <Link href={`/${locale}/dashboard/bills/${slug}?open=${b.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-surface-2/70 md:grid-cols-[1.4fr_1fr_auto_auto_auto]">
                  <div>
                    <p className="font-medium">{b.institution.name}</p>
                    <p className="text-[13px] text-muted">{slug === "honorarium" ? T.overview.honorarium : T.overview.refreshment}, {b.institution.unit.name}</p>
                  </div>
                  <p className="text-[13px] text-muted">{day(b.refreshment?.trainingStart ?? b.periodStart, locale)}</p>
                  <p className="text-right font-medium">{inr(b.totalPaise)}</p>
                  <RouteStrip stations={stationsFromState(b.state)} locale={locale} />
                  <div className="flex items-center gap-3">
                    <Status state={b.state} locale={locale} />
                    <span className="text-xs whitespace-nowrap text-muted">{t.waiting(ago(b.waitingSince, locale))}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
