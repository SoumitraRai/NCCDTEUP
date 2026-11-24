import Link from "next/link";
import { Plus } from "lucide-react";
import { getLocale } from "@/lib/localization/messages";
import { parseList } from "@/modules/platform/query";
import { getTd, listTd, tdInbox, tdNotices, tdOptions, type TdQueue } from "@/modules/movement/service";
import { currentActor } from "@/components/app/session";
import { Status } from "@/components/app/status";
import { RouteStrip, tdStations } from "@/components/app/route";
import { dict } from "@/components/app/i18n";
import { ButtonLink, ListControls, OpenLink, OpenRow, Pager } from "@/components/app/ui";
import { TdForm } from "@/components/app/td-form";
import { TdDetail, tdDates, tdState, travellerLine } from "@/components/app/td-detail";
const QUEUES: TdQueue[] = ["pending", "disposed", "completed"];
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/movement/td">) {
  return { title: dict((await params).locale).td.title };
}
export default async function TemporaryDuty({ params, searchParams }: PageProps<"/[locale]/dashboard/movement/td">) {
  const locale = getLocale((await params).locale);
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await currentActor(locale);
  const T = dict(locale);
  const t = T.td;
  const queue = QUEUES.find((x) => x === sp.queue) ?? "pending";
  const mine = sp.mine === "1";
  const q = parseList(sp);
  const [list, options, inbox, notices] = await Promise.all([listTd(actor, { ...q, queue, mine }), tdOptions(actor), tdInbox(actor), tdNotices(actor)]);
  const open = sp.open ? await getTd(actor, sp.open).catch(() => null) : null;
  const yours = new Set(inbox.map((r) => r.id));
  const canCreate = options.ownPosts.length > 0 || options.canSend;
  // Links that keep the filters and change only the keys given.
  const href = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    for (const [k, v] of Object.entries(updates)) if (v) next.set(k, v); else next.delete(k);
    return `?${next}`;
  };
  const badges = (r: (typeof list.rows)[number]) => (
    <>
      {yours.has(r.id) && <span className="text-xs font-medium text-accent">{t.yourTurn}</span>}
      {r.returnedToMe && <span className="text-xs font-medium text-warning">{t.returnedToYou}</span>}
    </>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-muted">{t.intro(list.year)}</p>
        </div>
        {canCreate && (
          <ButtonLink query={{ new: "1", open: null, edit: null }} variant="primary">
            <Plus size={16} /> {t.newTd}
          </ButtonLink>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t.title} className="inline-flex rounded-md border bg-surface-2 p-0.5">
          {QUEUES.map((x) => (
            <Link key={x} href={href({ queue: x === "pending" ? null : x, page: null, open: null })} scroll={false} aria-current={x === queue ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-[13px] font-medium ${x === queue ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
              {t.queues[x]} <span className="ml-1 text-muted">{list.counts[x]}</span>
            </Link>
          ))}
        </nav>
        <Link href={href({ mine: mine ? null : "1", page: null })} scroll={false} aria-pressed={mine} role="button"
          className={`inline-flex h-9 items-center rounded-md border px-3.5 text-[13.5px] font-medium ${mine ? "border-primary bg-primary-soft text-primary" : "bg-surface text-ink hover:bg-surface-2"}`}>
          {t.mine}
        </Link>
      </div>
      <ListControls placeholder={t.search} selects={[{ key: "sort", label: T.common.order, options: [["newest", T.common.newest], ["oldest", T.common.oldest]] }]} />
      <div className="overflow-hidden rounded-xl border bg-surface">
        {list.rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">{t.none}</p>
            <p className="mt-1 text-muted">{q.q || mine ? t.clearFilters : t.noneHint}</p>
          </div>
        ) : (
          <>
            <ul className="divide-y md:hidden">
              {list.rows.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <OpenLink id={r.id}>{travellerLine(r)}</OpenLink>
                    <Status state={tdState(r)} kind="td" locale={locale} />
                  </div>
                  <p className="text-[13px] text-muted">{r.from} → {r.to}</p>
                  <p className="text-[13px]">{tdDates(r, locale)}, {t.days(r.halfDays)}</p>
                  <div className="mt-2 flex items-center gap-3"><RouteStrip stations={tdStations(r)} locale={locale} />{badges(r)}</div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] text-left">
                <thead className="bg-surface-2 text-[13px] text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">{t.traveller}</th>
                    <th className="px-5 py-2.5 font-medium">{t.fromTo}</th>
                    <th className="px-5 py-2.5 font-medium">{t.dates}</th>
                    <th className="px-5 py-2.5 font-medium">{t.purpose}</th>
                    <th className="px-5 py-2.5 font-medium">{t.step}</th>
                    <th className="px-5 py-2.5 font-medium">{T.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <OpenRow key={r.id} id={r.id}>
                      <td className="px-5 py-3">
                        <OpenLink id={r.id}>{travellerLine(r)}</OpenLink>
                        <p className="text-[13px] text-muted">{[r.traveller.post, r.formation].filter(Boolean).join(", ")}</p>
                      </td>
                      <td className="px-5 py-3">{r.from} → {r.to}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {tdDates(r, locale)}
                        <p className="text-[13px] text-muted">{t.days(r.halfDays)}</p>
                      </td>
                      <td className="max-w-[240px] truncate px-5 py-3" title={r.purpose}>{r.purpose}</td>
                      <td className="px-5 py-3"><RouteStrip stations={tdStations(r)} locale={locale} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2"><Status state={tdState(r)} kind="td" locale={locale} />{badges(r)}</div>
                      </td>
                    </OpenRow>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {list.total > 0 && <Pager page={list.page} pages={list.pages} total={list.total} />}
      </div>
      {sp.new && canCreate && <TdForm options={options} />}
      {open && sp.edit && open.canEdit ? (
        <TdForm
          key={open.id}
          options={options}
          edit={{ id: open.id, version: open.version, traveller: travellerLine(open), from: open.from, to: open.to, start: open.start, end: open.end, purpose: open.purpose, ownArrangement: open.ownArrangement }}
        />
      ) : (
        open && <TdDetail td={open} locale={locale} unseen={notices.some((n) => n.tdId === open.id)} />
      )}
    </div>
  );
}
