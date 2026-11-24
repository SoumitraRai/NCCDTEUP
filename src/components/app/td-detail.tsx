import type { getTd } from "@/modules/movement/service";
import { istDate } from "@/modules/platform/training-year";
import { Status } from "./status";
import { RouteFull, tdStations } from "./route";
import { day, time } from "./format";
import { dict } from "./i18n";
import { Drawer } from "./ui";
import { MarkSeen, TdDecision, TdOwnerActions } from "./td-actions";
type Td = Awaited<ReturnType<typeof getTd>>;
type Row = { status: string; end: { date: string } };
// Approved TDs whose return date has passed show as completed.
export const tdState = (r: Row) => (r.status === "APPROVED" && r.end.date < istDate() ? "COMPLETED" : r.status);
export const tdDates = (r: { start: { date: string; half: string }; end: { date: string; half: string } }, locale: string) => {
  const t = dict(locale).td;
  return t.range(`${day(r.start.date, locale)} ${t.halves[r.start.half]}`, `${day(r.end.date, locale)} ${t.halves[r.end.half]}`);
};
export const travellerLine = (r: { traveller: { name: string; rank: string } }) => [r.traveller.rank, r.traveller.name].filter(Boolean).join(" ");
// The TD in the right-hand sheet: fields, the chain, history and actions.
export function TdDetail({ td, locale, unseen }: { td: Td; locale: string; unseen: boolean }) {
  const T = dict(locale);
  const t = T.td;
  const a = td.approval;
  const stage = a && a.status === "PENDING" ? a.stages[a.stageIndex] : null;
  const footer =
    td.canDecide && stage ? (
      <TdDecision id={td.id} version={td.version} kind={stage.kind as "RECOMMEND" | "APPROVE"} stageCode={stage.code} stageTitle={stage.title} />
    ) : td.canCancel ? (
      <TdOwnerActions id={td.id} version={td.version} canEdit={td.canEdit} />
    ) : undefined;
  const top = a?.steps.some((s) => s.stageCode === "TOP");
  return (
    <Drawer title={travellerLine(td)} closeKeys={["open"]} footer={footer}>
      {unseen && <MarkSeen id={td.id} />}
      <div className="space-y-7">
        <div className="flex flex-wrap items-center gap-3">
          <Status state={tdState(td)} kind="td" locale={locale} />
          <span className="text-muted">{[td.traveller.post, td.formation].filter(Boolean).join(", ")}</span>
          {td.returnedToMe && <span className="text-xs font-medium text-warning">{t.returnedToYou}</span>}
        </div>
        <div className="rounded-lg bg-surface-2/70 px-2 py-4">
          <RouteFull stations={tdStations(td, a, td.awaiting?.vacant)} locale={locale} />
          {top && <p className="mt-3 px-2 text-center text-[13px] text-muted">{t.top}</p>}
          {td.awaiting?.vacant && <p className="mt-3 px-2 text-center text-[13px] text-warning">{t.awaitingVacant(T.stages[td.awaiting.code] ?? td.awaiting.title)}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          {[
            [t.fromTo, `${td.from} → ${td.to}`],
            [t.dates, tdDates(td, locale)],
            [t.days_, t.days(td.halfDays)],
            [t.ownArrangement, td.ownArrangement ? t.yes : t.no],
            [t.createdBy, `${td.createdBy} (${t.kind[td.kind]})`],
            [t.traveller, td.traveller.account ? travellerLine(td) : `${travellerLine(td)} (${t.noAccount})`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
          <div className="col-span-2">
            <dt className="text-[13px] text-muted">{t.purpose}</dt>
            <dd className="font-medium whitespace-pre-line">{td.purpose}</dd>
          </div>
        </dl>
        {a && a.steps.length > 0 && (
          <div>
            <h3 className="mb-3 text-[13px] text-muted">{t.history}</h3>
            <ol className="space-y-3 border-l-2 pl-4">
              {[...a.steps].reverse().map((s, i) => (
                <li key={i} className="relative">
                  <span aria-hidden className="absolute top-2 -left-[21px] size-2 rounded-full bg-flag-navy" />
                  <p className="text-[13.5px]">
                    {t.step_(`${t.outcome[s.outcome] ?? s.outcome}${T.stages[s.stageCode] ? ` (${T.stages[s.stageCode]})` : ""}`, s.system ? `${s.actor} (${T.route.system})` : s.actor)}
                  </p>
                  <p className="text-xs text-muted">{day(s.at, locale)}, {time(s.at)}{a.cycle > 1 ? `, ${t.round(s.cycle)}` : ""}</p>
                  {s.remarks && !s.system && <p className="mt-1 rounded-md bg-surface-2 px-3 py-1.5 text-[13px]">{s.remarks}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {td.submissions.length > 1 && (
          <div>
            <h3 className="mb-2 text-[13px] text-muted">{t.versions}</h3>
            <ul className="space-y-2">
              {td.submissions.map((v) => {
                const s = v.snapshot as { from: string; to: string; start: { date: string; half: string }; end: { date: string; half: string }; halfDays: number; purpose: string };
                return (
                  <li key={v.cycle} className="rounded-md border px-3 py-2 text-[13px]">
                    <p className="font-medium">{t.round(v.cycle)}: {s.from} → {s.to}, {tdDates(s, locale)} ({t.days(s.halfDays)})</p>
                    <p className="text-muted">{s.purpose}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  );
}
