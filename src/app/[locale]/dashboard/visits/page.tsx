import { Plus } from "lucide-react";
import { getLocale } from "@/lib/localization/messages";
import { parseList } from "@/modules/platform/query";
import { editableInstitutions, getVisit, listVisits, subjects } from "@/modules/visits/service";
import { currentActor } from "@/components/app/session";
import { Status } from "@/components/app/status";
import { day, time } from "@/components/app/format";
import { ButtonLink, Drawer, ListControls, OpenLink, OpenRow, Pager } from "@/components/app/ui";
import { RecordDraft, VisitForm } from "@/components/app/visit-form";
import { dict } from "@/components/app/i18n";
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/visits">) {
  return { title: dict((await params).locale).visits.title };
}
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString();
export default async function Visits({ params, searchParams }: PageProps<"/[locale]/dashboard/visits">) {
  const locale = getLocale((await params).locale);
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await currentActor(locale);
  const T = dict(locale);
  const t = T.visits;
  const q = parseList(sp);
  const cadet = actor.assignments.every((a) => a.role === "CADET");
  const [list, institutions, subjectList] = await Promise.all([
    listVisits(actor, q),
    cadet ? [] : editableInstitutions(actor),
    subjects(),
  ]);
  const openId = sp.open ?? sp.edit;
  const open = openId ? await getVisit(actor, openId).catch(() => null) : null;
  const canRecord = institutions.length > 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-muted">{t.intro(list.year)}</p>
        </div>
        {canRecord && (
          <ButtonLink query={{ new: "1" }} variant="primary">
            <Plus size={16} /> {t.record}
          </ButtonLink>
        )}
      </div>
      <ListControls
        placeholder={t.search}
        selects={[
          { key: "status", label: T.common.status, options: [["", t.all], ["SUBMITTED", t.recorded], ["DRAFT", t.drafts]] },
          { key: "sort", label: T.common.order, options: [["newest", T.common.newest], ["oldest", T.common.oldest]] },
        ]}
      />
      <div className="overflow-hidden rounded-xl border bg-surface">
        {list.rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">{t.none}</p>
            <p className="mt-1 text-muted">{q.q ? t.noneSearch : canRecord ? t.noneFirst : t.noneLater}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-surface-2 text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{T.common.institution}</th>
                  <th className="px-5 py-2.5 font-medium">{T.common.date}</th>
                  <th className="px-5 py-2.5 font-medium">{t.officer}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.cadets}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.periods}</th>
                  <th className="px-5 py-2.5 font-medium">{T.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((v) => (
                  <OpenRow key={v.id} id={v.id}>
                    <td className="px-5 py-3">
                      <OpenLink id={v.id}>{v.institution.name}</OpenLink>
                      <p className="text-[13px] text-muted">{v.institution.unit.name}</p>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {day(v.startsAt, locale)}
                      <p className="text-[13px] text-muted">{time(v.startsAt)}–{time(v.endsAt)}</p>
                    </td>
                    <td className="px-5 py-3">
                      {v.visitorRank} {v.visitorName}
                      <p className="text-[13px] text-muted">{t.appointments[v.visitorAppointment] ?? v.visitorAppointment}</p>
                    </td>
                    <td className="px-5 py-3 text-right">{v.cadetsPresent}</td>
                    <td className="px-5 py-3 text-right">{v.periods}</td>
                    <td className="px-5 py-3"><Status kind="visit" state={v.status} locale={locale} /></td>
                  </OpenRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.total > 0 && <Pager page={list.page} pages={list.pages} total={list.total} />}
      </div>

      {sp.new && canRecord && <VisitForm institutions={institutions} subjects={subjectList} />}
      {sp.edit && open && open.status === "DRAFT" && open.ownerId === actor.id && (
        <VisitForm
          institutions={institutions}
          subjects={subjectList}
          draft={{
            id: open.id,
            version: open.version,
            institutionId: open.institutionId,
            date: istDate(open.startsAt).slice(0, 10),
            start: istDate(open.startsAt).slice(11, 16),
            end: istDate(open.endsAt).slice(11, 16),
            purpose: open.purpose,
            visitorName: open.visitorName,
            visitorRank: open.visitorRank,
            visitorAppointment: open.visitorAppointment,
            subjectIds: open.subjects.map((s) => s.id),
            periods: open.periods,
            cadetsPresent: open.cadetsPresent,
            notes: open.notes,
          }}
        />
      )}
      {sp.open && open && (
        <Drawer
          title={open.institution.name}
          closeKeys={["open"]}
          footer={
            open.status === "DRAFT" && open.ownerId === actor.id ? (
              <div className="flex items-center justify-end gap-2">
                <ButtonLink query={{ open: null, edit: open.id }}>{t.editDraft}</ButtonLink>
                <RecordDraft id={open.id} version={open.version} />
              </div>
            ) : undefined
          }
        >
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Status kind="visit" state={open.status} locale={locale} />
              <span className="text-muted">{open.institution.unit.name}, {open.institution.district}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {[
                [T.common.date, day(open.startsAt, locale)],
                [t.time, `${time(open.startsAt)}–${time(open.endsAt)}`],
                [t.officer, `${open.visitorRank} ${open.visitorName}`.trim()],
                [T.common.appointment, t.appointments[open.visitorAppointment] ?? open.visitorAppointment],
                [T.common.cadetsPresent, String(open.cadetsPresent)],
                [t.periodsTaken, String(open.periods)],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="font-medium">{val}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h3 className="text-[13px] text-muted">{t.purpose}</h3>
              <p className="mt-1">{open.purpose || T.common.notGiven}</p>
            </div>
            {open.subjects.length > 0 && (
              <div>
                <h3 className="text-[13px] text-muted">{t.subjects}</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {open.subjects.map((s) => <li key={s.id} className="rounded-full bg-surface-2 px-3 py-1 text-[13px]">{s.name}</li>)}
                </ul>
              </div>
            )}
            {open.notes && (
              <div>
                <h3 className="text-[13px] text-muted">{t.notes}</h3>
                <p className="mt-1 whitespace-pre-wrap">{open.notes}</p>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}
