import Link from "next/link";
import { Plus } from "lucide-react";
import { getLocale } from "@/lib/localization/messages";
import { campOptions, campStrength, getCamp, listCamps, type Camp } from "@/modules/camps/service";
import { currentActor } from "@/components/app/session";
import { Status } from "@/components/app/status";
import { Progress } from "@/components/app/charts";
import { dict } from "@/components/app/i18n";
import { day } from "@/components/app/format";
import { ButtonLink, ListControls, OpenLink, OpenRow } from "@/components/app/ui";
import { CampForm } from "@/components/app/camp-form";
import { CampDetail, campDates } from "@/components/app/camp-detail";
const VIEWS = ["timeline", "strength", "reports"] as const;
const QUEUES = ["OVERDUE", "DUE", "SUBMITTED", "RETURNED", "ACCEPTED"] as const;
const STATES = ["UPCOMING", "CURRENT", "COMPLETED", "CANCELLED"] as const;
const DAY = 86_400_000;
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/camps">) {
  return { title: dict((await params).locale).camps.title };
}
const monthOf = (date: string, locale: string) =>
  new Date(`${date.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
export default async function Camps({ params, searchParams }: PageProps<"/[locale]/dashboard/camps">) {
  const locale = getLocale((await params).locale);
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await currentActor(locale);
  const T = dict(locale);
  const t = T.camps;
  const view = VIEWS.find((v) => v === sp.view) ?? "timeline";
  const state = STATES.find((s) => s === sp.state);
  const filter = { year: sp.year, q: sp.q, group: sp.group, state: view === "timeline" ? state : undefined };
  const [list, strength, options] = await Promise.all([listCamps(actor, filter), campStrength(actor, { year: sp.year, group: sp.group }), campOptions(actor)]);
  const queue = QUEUES.find((q) => q === sp.report) ?? QUEUES.find((q) => list.reports[q] > 0) ?? "OVERDUE";
  const open = sp.open ? await getCamp(actor, sp.open).catch(() => null) : null;
  const href = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    for (const [k, v] of Object.entries(updates)) if (v) next.set(k, v); else next.delete(k);
    return `?${next}`;
  };
  const groups = strength.groups.map((g) => [g.id, g.name] as [string, string]);
  const tiles: [string, number, string][] = [
    [t.tiles.total, list.total, href({ view: null, state: null, report: null, open: null })],
    ...(["UPCOMING", "CURRENT", "COMPLETED"] as const).map((s) => [t.tiles[s], list.states[s], href({ view: null, state: s, report: null, open: null })] as [string, number, string]),
    [t.tiles.OVERDUE, list.reports.OVERDUE, href({ view: "reports", report: "OVERDUE", state: null, open: null })],
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-muted">{t.intro(list.year)}</p>
        </div>
        {options.canPlan && (
          <ButtonLink query={{ new: "1", open: null, edit: null }} variant="primary">
            <Plus size={16} /> {t.plan}
          </ButtonLink>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, n, link], i) => (
          <li key={label}>
            <Link href={link} scroll={false} className="block rounded-xl border bg-surface px-4 py-3 hover:bg-surface-2/70">
              <p className="text-[13px] text-muted">{label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${i === 4 && n > 0 ? "text-danger" : ""}`}>{n}</p>
            </Link>
          </li>
        ))}
      </ul>
      <nav aria-label={t.title} className="inline-flex rounded-md border bg-surface-2 p-0.5">
        {VIEWS.map((v) => (
          <Link key={v} href={href({ view: v === "timeline" ? null : v, open: null, report: null, state: null })} scroll={false} aria-current={v === view ? "page" : undefined}
            className={`rounded px-3 py-1.5 text-[13px] font-medium ${v === view ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
            {t.views[v]}
          </Link>
        ))}
      </nav>
      {view !== "strength" && (
        <ListControls
          placeholder={t.search}
          selects={[
            ...(groups.length > 1 ? [{ key: "group", label: t.group, options: [["", t.allGroups] as [string, string], ...groups] }] : []),
            ...(view === "timeline" ? [{ key: "state", label: t.state, options: [["", t.allStates] as [string, string], ...STATES.map((s) => [s, T.status.camp[s]] as [string, string])] }] : []),
          ]}
        />
      )}
      {view === "timeline" && <Timeline camps={list.camps} today={list.today} locale={locale} filtered={!!(sp.q || sp.group || state)} />}
      {view === "strength" && <Strength data={strength} locale={locale} />}
      {view === "reports" && (
        <>
          <nav aria-label={t.views.reports} className="inline-flex flex-wrap rounded-md border bg-surface-2 p-0.5">
            {QUEUES.map((q) => (
              <Link key={q} href={href({ report: q, open: null })} scroll={false} aria-current={q === queue ? "page" : undefined}
                className={`rounded px-3 py-1.5 text-[13px] font-medium ${q === queue ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {t.queues[q]} <span className="ml-1 text-muted">{list.reports[q]}</span>
              </Link>
            ))}
          </nav>
          <Reports camps={list.camps.filter((c) => c.report === queue)} today={list.today} locale={locale} />
        </>
      )}
      {sp.new && options.canPlan && <CampForm options={options} />}
      {open && sp.edit && open.canEdit ? (
        <CampForm key={open.id} options={options} edit={{ id: open.id, version: open.version, unitId: open.unit.id, catcNo: open.catcNo, location: open.location, start: open.start, end: open.end, plannedStrength: open.plannedStrength, details: open.details, seats: open.seats }} />
      ) : (
        open && <CampDetail camp={open} locale={locale} />
      )}
    </div>
  );
}
// Camps in date order, a heading per month, and a "today" line before the
// first camp still to start.
function Timeline({ camps, today, locale, filtered }: { camps: Camp[]; today: string; locale: string; filtered: boolean }) {
  const t = dict(locale).camps;
  if (!camps.length)
    return (
      <div className="rounded-xl border bg-surface px-6 py-14 text-center">
        <p className="font-medium">{t.none}</p>
        <p className="mt-1 text-muted">{filtered ? t.clearFilters : t.noneHint}</p>
      </div>
    );
  const months = new Map<string, Camp[]>();
  for (const c of camps) months.set(c.start.slice(0, 7), [...(months.get(c.start.slice(0, 7)) ?? []), c]);
  // The "today" line goes before the first camp still to start: inside its
  // month when that month is the current one, otherwise between months.
  const firstAhead = camps.find((c) => c.start > today);
  const between = !firstAhead || firstAhead.start.slice(0, 7) !== today.slice(0, 7);
  const line = (
    <p className="flex items-center gap-3 px-4 py-2 text-[13px] font-medium text-primary">
      <span aria-hidden className="h-px flex-1 bg-primary/40" />
      {t.today(day(today, locale))}
      <span aria-hidden className="h-px flex-1 bg-primary/40" />
    </p>
  );
  return (
    <div className="space-y-6">
      {[...months.entries()].map(([ym, rows]) => (
        <div key={ym} className="space-y-6">
          {between && firstAhead && rows[0].id === firstAhead.id && line}
          <section aria-labelledby={`m-${ym}`}>
            <h2 id={`m-${ym}`} className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">{t.month(monthOf(`${ym}-01`, locale), rows.length)}</h2>
            <ol className="divide-y overflow-hidden rounded-xl border bg-surface">
              {rows.map((c) => (
                <TimelineRow key={c.id} c={c} locale={locale} before={!between && c.id === firstAhead?.id ? <li>{line}</li> : null} />
              ))}
            </ol>
          </section>
        </div>
      ))}
      {!firstAhead && line}
    </div>
  );
}
function TimelineRow({ c, locale, before }: { c: Camp; locale: string; before: React.ReactNode }) {
  const t = dict(locale).camps;
  const date = new Date(`${c.start}T00:00:00Z`);
  return (
    <>
      {before}
      <li className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 ${c.state === "CURRENT" ? "bg-primary-soft/50" : ""}`}>
        <div className="w-12 shrink-0 text-center" aria-hidden>
          <p className="text-xl leading-none font-semibold tabular-nums">{date.getUTCDate()}</p>
          <p className="text-xs text-muted uppercase">{date.toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", { month: "short", timeZone: "UTC" })}</p>
        </div>
        <div className="min-w-[220px] flex-1">
          <OpenLink id={c.id}>{t.catc(c.catcNo)} · {c.location}</OpenLink>
          <p className="text-[13px] text-muted">{c.unit.name}, {c.group.name} · {campDates(c, locale)} ({t.days(c.days)})</p>
        </div>
        <div className="w-40 shrink-0 space-y-1">
          <p className="text-[13px] tabular-nums">{t.seatsOf(c.allocated, c.plannedStrength)}</p>
          <Progress value={c.allocated} total={c.plannedStrength} label={t.seatsLabel(c.catcNo)} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:w-[260px]">
          <Status state={c.state} kind="camp" locale={locale} />
          {c.state === "COMPLETED" && <Status state={c.report} kind="report" locale={locale} />}
        </div>
      </li>
    </>
  );
}
function Strength({ data, locale }: { data: Awaited<ReturnType<typeof campStrength>>; locale: string }) {
  const t = dict(locale).camps;
  const facts: [string, number, boolean][] = [
    [t.units, data.totals.units, false],
    [t.seats, data.totals.seats, false],
    [t.attended, data.totals.attended, false],
    [t.without, data.totals.without, data.totals.without > 0],
  ];
  return (
    <div className="space-y-6">
      <p className="text-[13.5px] text-muted">{t.strengthIntro}</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {facts.map(([k, v, warn]) => (
          <div key={k} className="rounded-xl border bg-surface px-4 py-3">
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-warning" : ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {data.groups.map((g) => (
        <section key={g.id} aria-labelledby={`g-${g.id}`} className="overflow-hidden rounded-xl border bg-surface">
          <h2 id={`g-${g.id}`} className="border-b bg-surface-2 px-5 py-2.5 font-semibold">{g.name}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-left">
              <thead className="text-[13px] text-muted">
                <tr>
                  <th className="w-[36%] px-5 py-2 font-medium">{t.unit}</th>
                  <th className="px-5 py-2 text-right font-medium">{t.hosted}</th>
                  <th className="px-5 py-2 text-right font-medium">{t.campsWithSeats}</th>
                  <th className="px-5 py-2 text-right font-medium">{t.seats}</th>
                  <th className="px-5 py-2 text-right font-medium">{t.attended}</th>
                </tr>
              </thead>
              <tbody>
                {g.units.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-5 py-2.5">
                      {u.name}
                      {u.camps === 0 && <span className="ml-2 rounded-full bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning">{t.noSeats}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{u.hosted}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{u.camps}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{u.seats}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{u.attended}</td>
                  </tr>
                ))}
                <tr className="border-t bg-surface-2/60 font-medium">
                  <td className="px-5 py-2.5">{t.total}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{g.totals.hosted}</td>
                  <td className="px-5 py-2.5 text-right" />
                  <td className="px-5 py-2.5 text-right tabular-nums">{g.totals.seats}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{g.totals.attended}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
function Reports({ camps, today, locale }: { camps: Camp[]; today: string; locale: string }) {
  const t = dict(locale).camps;
  if (!camps.length)
    return (
      <div className="rounded-xl border bg-surface px-6 py-14 text-center">
        <p className="font-medium">{t.noReports}</p>
        <p className="mt-1 text-muted">{t.noReportsHint}</p>
      </div>
    );
  const since = (end: string) => Math.round((Date.parse(today) - Date.parse(end)) / DAY);
  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      <ul className="divide-y md:hidden">
        {camps.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <OpenLink id={c.id}>{t.catc(c.catcNo)}</OpenLink>
              <Status state={c.report} kind="report" locale={locale} />
            </div>
            <p className="text-[13px] text-muted">{c.unit.name}, {c.group.name}</p>
            <p className="text-[13px]">{t.ended} {day(c.end, locale)}, {t.sinceEnd(since(c.end))}</p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-left">
          <thead className="bg-surface-2 text-[13px] text-muted">
            <tr>
              <th className="px-5 py-2.5 font-medium">CATC</th>
              <th className="px-5 py-2.5 font-medium">{t.unit}</th>
              <th className="px-5 py-2.5 font-medium">{t.ended}</th>
              <th className="px-5 py-2.5 font-medium">{t.dueBy}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.attended}</th>
              <th className="px-5 py-2.5 font-medium">{t.reportCol}</th>
            </tr>
          </thead>
          <tbody>
            {camps.map((c) => (
              <OpenRow key={c.id} id={c.id}>
                <td className="px-5 py-3"><OpenLink id={c.id}>{t.catc(c.catcNo)}</OpenLink><p className="text-[13px] text-muted">{c.location}</p></td>
                <td className="px-5 py-3">{c.unit.name}<p className="text-[13px] text-muted">{c.group.name}</p></td>
                <td className="px-5 py-3 whitespace-nowrap">{day(c.end, locale)}<p className="text-[13px] text-muted">{t.sinceEnd(since(c.end))}</p></td>
                <td className={`px-5 py-3 whitespace-nowrap ${c.report === "OVERDUE" ? "font-medium text-danger" : ""}`}>{day(c.reportDue, locale)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{t.attendedOf(c.attended, c.allocated)}</td>
                <td className="px-5 py-3"><Status state={c.report} kind="report" locale={locale} /></td>
              </OpenRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
