import type { getCamp } from "@/modules/camps/service";
import { Status } from "./status";
import { day, time } from "./format";
import { dict } from "./i18n";
import { Drawer } from "./ui";
import { AttachmentLink, EvidenceUpload } from "./bill-actions";
import { CampPlannerActions, CampReportForm, CampReview } from "./camp-actions";
import { BudgetStatus } from "./budget-sheet";
import { inr } from "./format";
import { ButtonLink } from "./ui";
type Camp = Awaited<ReturnType<typeof getCamp>>;
export const campDates = (c: { start: string; end: string }, locale: string) => dict(locale).camps.range(day(c.start, locale), day(c.end, locale));
// One camp in the right-hand sheet: facts, seats against attendance, the
// report and its history. Actions appear only for those who may take them.
export function CampDetail({ camp, locale }: { camp: Camp; locale: string }) {
  const t = dict(locale).camps;
  const B = dict(locale).budgets;
  const footer = camp.canReview ? <CampReview id={camp.id} version={camp.version} /> : camp.canEdit ? <CampPlannerActions id={camp.id} version={camp.version} /> : undefined;
  const reportNote =
    camp.report === "NOT_YET" ? t.notYet(day(camp.reportDue, locale))
    : camp.report === "DUE" ? t.dueOn(day(camp.reportDue, locale))
    : camp.report === "OVERDUE" ? t.overdueSince(day(camp.reportDue, locale))
    : camp.report === "SUBMITTED" ? t.submittedNote
    : camp.report === "ACCEPTED" ? t.acceptedNote
    : t.returnedNote(camp.returnRemarks);
  return (
    <Drawer title={t.catc(camp.catcNo)} closeKeys={["open"]} footer={footer}>
      <div className="space-y-7">
        <div className="flex flex-wrap items-center gap-2">
          <Status state={camp.state} kind="camp" locale={locale} />
          {camp.state !== "CANCELLED" && <Status state={camp.report} kind="report" locale={locale} />}
        </div>
        {camp.state === "CANCELLED" && <p className="rounded-md bg-surface-2 px-3 py-2 text-[13.5px]">{t.cancelledBecause(camp.cancelReason)}</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          {[
            [t.host, camp.unit.name],
            [t.group, camp.group.name],
            [t.location, camp.location],
            [t.dates, `${campDates(camp, locale)} (${t.days(camp.days)})`],
            ...(camp.briefing ? [[t.briefing, day(camp.briefing, locale)]] : []),
            [t.planned, String(camp.plannedStrength)],
            [t.allocated, `${camp.allocated}, ${t.unallocated(camp.plannedStrength - camp.allocated)}`],
            ...(camp.attended !== null ? [[t.attendedTotal, t.attendedOf(camp.attended, camp.allocated)]] : []),
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
          {camp.details && (
            <div className="col-span-2">
              <dt className="text-[13px] text-muted">{t.details}</dt>
              <dd className="font-medium whitespace-pre-line">{camp.details}</dd>
            </div>
          )}
        </dl>
        <div>
          <h3 className="mb-2 text-[13px] text-muted">{t.seatsTitle}</h3>
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[13px] text-muted">
              <tr>
                <th className="py-1.5 font-medium">{t.unit}</th>
                <th className="py-1.5 text-right font-medium">{t.seats}</th>
                <th className="py-1.5 text-right font-medium">{t.attended}</th>
              </tr>
            </thead>
            <tbody>
              {camp.seats.map((s) => (
                <tr key={s.unitId} className="border-t">
                  <td className="py-2">{s.unit}{s.unitId === camp.unit.id ? ` (${t.host})` : ""}</td>
                  <td className="py-2 text-right tabular-nums">{s.seats}</td>
                  <td className="py-2 text-right tabular-nums">{s.attended ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {camp.state !== "CANCELLED" && (
          <section className="space-y-3">
            <h3 className="text-[13px] text-muted">{t.report}</h3>
            <p className={`text-[13.5px] ${camp.report === "OVERDUE" || camp.report === "RETURNED" ? "font-medium text-danger" : ""}`}>{reportNote}</p>
            <div className="space-y-2">
              {camp.files.length ? camp.files.map((f, i) => <AttachmentLink key={f.id} id={f.id} status={f.status} label={`${t.files} ${i + 1}`} />) : camp.state === "COMPLETED" && <p className="text-[13px] text-muted">{t.noFiles}</p>}
            </div>
            {camp.canReport && (
              <div className="space-y-4 rounded-lg border p-4">
                <p className="text-[13px] text-muted">{t.reportHint}</p>
                <EvidenceUpload resourceId={camp.id} institutionId="" resourceType="camp" purpose="REPORT" label={t.uploadReport} />
                <CampReportForm id={camp.id} version={camp.version} seats={camp.seats} />
              </div>
            )}
          </section>
        )}
        {camp.state !== "CANCELLED" && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] text-muted">{B.campSection}</h3>
              <ButtonLink query={{ budget: camp.id, open: null }} variant="ghost">{B.open}</ButtonLink>
            </div>
            {camp.budgets.length === 0 ? (
              <p className="text-[13.5px] text-muted">{B.campNone}</p>
            ) : (
              <ul className="divide-y rounded-lg border text-[13.5px]">
                {camp.budgets.map((b) => (
                  <li key={b.stage} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{B.stageBudget(B.stages[b.stage])}</span>
                    <span className="tabular-nums">{inr(b.demandedPaise)}{b.sanctionedPaise ? ` → ${inr(b.sanctionedPaise)}` : ""}</span>
                    <BudgetStatus status={b.status} locale={locale} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {camp.history.length > 0 && (
          <div>
            <h3 className="mb-3 text-[13px] text-muted">{t.history}</h3>
            <ol className="space-y-3 border-l-2 pl-4">
              {[...camp.history].reverse().map((h, i) => (
                <li key={i} className="relative">
                  <span aria-hidden className="absolute top-2 -left-[21px] size-2 rounded-full bg-flag-navy" />
                  <p className="text-[13.5px]">{t.by(t.events[h.action] ?? h.action, h.by)}</p>
                  <p className="text-xs text-muted">{day(h.at, locale)}, {time(h.at)}</p>
                  {h.remarks && <p className="mt-1 rounded-md bg-surface-2 px-3 py-1.5 text-[13px]">{h.remarks}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Drawer>
  );
}
