import type { budgetOptions, getCampBudgets } from "@/modules/camps/budgets";
import { HEADS } from "@/modules/camps/budget-rules";
import { stageOf } from "@/modules/approvals/engine";
import { RouteFull, budgetStations } from "./route";
import { day, inr } from "./format";
import { dict } from "./i18n";
import { ButtonLink, Drawer } from "./ui";
import { BudgetDecision, BudgetPreparerActions } from "./budget-actions";
type Data = Awaited<ReturnType<typeof getCampBudgets>>;
const tone: Record<string, string> = { PENDING: "bg-info/10 text-info", RETURNED: "bg-warning/12 text-warning", APPROVED: "bg-success/12 text-success", REJECTED: "bg-danger/10 text-danger", CANCELLED: "bg-surface-2 text-ink/80" };
export function BudgetStatus({ status, locale }: { status: string; locale: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tone[status] ?? tone.CANCELLED}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {dict(locale).budgets.status[status] ?? status}
    </span>
  );
}
const rupees = (p: string) => (BigInt(p) % 100n ? (Number(p) / 100).toFixed(2) : String(BigInt(p) / 100n));
// A camp's budgets: each stage with its amounts, basis, route and actions,
// and the breakups side by side where any were given.
export function BudgetSheet({ data, locale }: { data: Data; locale: string }) {
  const T = dict(locale);
  const t = T.budgets;
  const withLines = data.stages.filter((s) => s.budget && Object.keys(s.budget.lines).length);
  return (
    <Drawer title={t.sheetTitle(T.camps.catc(data.camp.catcNo))} closeKeys={["budget"]}>
      <div className="space-y-6">
        <p className="text-[13.5px] text-muted">
          {data.camp.location} · {T.camps.range(day(data.camp.start, locale), day(data.camp.end, locale))} · <span className="font-medium text-ink">{T.status.camp[data.camp.state]}</span>
        </p>
        {data.stages.map(({ stage, budget: b, canPrepare, closed }) => {
          const label = t.stages[stage];
          const step = b && b.status === "PENDING" ? stageOf("CAMP_BUDGET", b.stageIndex) : null;
          return (
            <section key={stage} aria-labelledby={`stage-${stage}`} className="rounded-lg border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-surface-2 px-4 py-2.5">
                <h3 id={`stage-${stage}`} className="font-semibold">{t.stageBudget(label)}</h3>
                {b ? <BudgetStatus status={b.status} locale={locale} /> : <span className="text-[13px] text-muted">{canPrepare ? "" : closed ?? t.notStarted}</span>}
              </div>
              <div className="space-y-4 px-4 py-3">
                {b ? (
                  <>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                      {[
                        [t.demanded, inr(b.demandedPaise)],
                        [t.sanctioned, b.sanctionedPaise ? inr(b.sanctionedPaise) : "–"],
                        [t.cadets, `${b.cadets} · ${t.anos} ${b.anos} · ${t.staff} ${b.staff}`],
                        [t.days, String(b.days)],
                      ].map(([k, v]) => (
                        <div key={k} className={k === t.cadets ? "col-span-2" : ""}>
                          <dt className="text-[13px] text-muted">{k}</dt>
                          <dd className="font-medium tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {b.note && <p className="rounded-md bg-surface-2 px-3 py-2 text-[13.5px] whitespace-pre-line">{b.note}</p>}
                    <div className="rounded-lg bg-surface-2/70 px-2 py-3">
                      <RouteFull stations={budgetStations(b, b.route)} locale={locale} />
                    </div>
                    {b.canDecide && step && <BudgetDecision id={b.id} version={b.version} kind={step.kind} demandedRupees={rupees(b.demandedPaise)} />}
                    {b.canCancel && <BudgetPreparerActions id={b.id} version={b.version} canEdit={b.canEdit} stage={stage} />}
                    {b.submissions.length > 1 && <p className="text-xs text-muted">{t.rounds(b.submissions.length)}</p>}
                  </>
                ) : null}
                {canPrepare && (
                  <div className="flex justify-end">
                    <ButtonLink query={{ prepare: stage, editBudget: null }} variant="primary">{t.prepare(label)}</ButtonLink>
                  </div>
                )}
              </div>
            </section>
          );
        })}
        {withLines.length > 0 && (
          <section aria-labelledby="breakup" className="overflow-x-auto rounded-lg border">
            <h3 id="breakup" className="border-b bg-surface-2 px-4 py-2.5 font-semibold">{t.breakupTitle}</h3>
            <table className="w-full min-w-[420px] text-[13.5px]">
              <thead className="text-[12.5px] text-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">{t.head}</th>
                  {withLines.map((s) => <th key={s.stage} className="px-3 py-1.5 text-right font-medium">{t.stages[s.stage]}</th>)}
                </tr>
              </thead>
              <tbody>
                {HEADS.filter((h) => withLines.some((s) => s.budget!.lines[h.head])).map((h) => (
                  <tr key={h.head} className="border-t">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">{t.heads[h.head]}</th>
                    {withLines.map((s) => {
                      const l = s.budget!.lines[h.head];
                      return <td key={s.stage} className="px-3 py-1.5 text-right tabular-nums">{l ? `${inr(l.amountPaise)}${l.quantity !== null ? ` (${l.quantity} L)` : ""}` : "–"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <p className="text-xs text-muted">{t.provisional}</p>
      </div>
    </Drawer>
  );
}
// "New budget": camps the actor may prepare a budget for now, and a way to
// plan a new camp with its initial budget instead.
export function BudgetPicker({ options, locale, canPlan }: { options: Awaited<ReturnType<typeof budgetOptions>>; locale: string; canPlan: boolean }) {
  const T = dict(locale);
  const t = T.budgets;
  return (
    <Drawer title={t.pickTitle} closeKeys={["pick"]}>
      <div className="space-y-4">
        <p className="text-[13.5px] text-muted">{t.pickIntro}</p>
        {options.length === 0 && <p className="text-[13.5px]">{t.pickNone}</p>}
        <ul className="divide-y rounded-lg border">
          {options.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{T.camps.catc(o.catcNo)} · {o.location}</p>
                <p className="text-[13px] text-muted">{o.unit} · {T.camps.range(day(o.start, locale), day(o.end, locale))}</p>
              </div>
              <ButtonLink query={{ pick: null, budget: o.id, prepare: o.stage }} variant="primary">{t.prepare(t.stages[o.stage])}</ButtonLink>
            </li>
          ))}
        </ul>
        {canPlan && <ButtonLink query={{ pick: null, new: "1", view: null }} variant="ghost">{t.planInstead}</ButtonLink>}
      </div>
    </Drawer>
  );
}
