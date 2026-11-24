import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getLocale } from "@/lib/localization/messages";
import { parseList } from "@/modules/platform/query";
import { billInbox, billSummary, categories, getBill, listBills } from "@/modules/bills/service";
import { editableInstitutions, subjects } from "@/modules/visits/service";
import { currentActor, reviewer } from "@/components/app/session";
import { Status } from "@/components/app/status";
import { RouteFull, RouteStrip, stationsFromState, stationsFromTimeline } from "@/components/app/route";
import { Progress } from "@/components/app/charts";
import { day, inr, time } from "@/components/app/format";
import { ButtonLink, Drawer, ListControls, OpenLink, OpenRow, Pager } from "@/components/app/ui";
import { AttachmentLink, DecisionPanel, EvidenceUpload, OwnerActions, PaymentForm } from "@/components/app/bill-actions";
import { BillForm } from "@/components/app/bill-form";
import { dict } from "@/components/app/i18n";
const kinds = { refreshment: "REFRESHMENT", honorarium: "HONORARIUM" } as const;
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/bills/[kind]">) {
  const { locale, kind } = await params;
  const t = dict(locale).bills;
  return { title: kind === "honorarium" ? t.honorariumTitle : t.refreshmentTitle };
}
export default async function Bills({ params, searchParams }: PageProps<"/[locale]/dashboard/bills/[kind]">) {
  const { locale: raw, kind: slug } = await params;
  const locale = getLocale(raw);
  if (!(slug in kinds)) notFound();
  const kind = slug as keyof typeof kinds;
  const KIND = kinds[kind];
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await currentActor(locale);
  const roles = actor.assignments.map((a) => a.role);
  if (roles.every((r) => r === "CADET")) notFound();
  const q = parseList(sp);
  const [list, summary, institutions, subjectList, cats, inbox] = await Promise.all([
    listBills(actor, KIND, q),
    reviewer(roles) ? billSummary(actor, KIND, q.year) : null,
    editableInstitutions(actor),
    kind === "refreshment" ? subjects() : [],
    categories(KIND),
    reviewer(roles) ? billInbox(actor) : [],
  ]);
  const open = sp.open ? await getBill(actor, sp.open).catch(() => null) : null;
  const pending = new Set(inbox.map((b) => b.id));
  const canPay = actor.assignments.some((a) => a.capabilities.includes("payment"));
  const T = dict(locale);
  const t = T.bills;
  const title = kind === "refreshment" ? t.refreshmentTitle : t.honorariumTitle;
  const bill = kind === "refreshment";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-muted">
            {bill ? t.refreshmentIntro(list.year) : t.honorariumIntro(list.year)}
          </p>
        </div>
        {institutions.length > 0 && (
          <ButtonLink query={{ new: "1" }} variant="primary">
            <Plus size={16} /> {bill ? t.newBill : t.newDemand}
          </ButtonLink>
        )}
      </div>

      {summary && summary.rows.length > 0 && (
        <section aria-label={t.byUnit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.rows.map((u) => (
            <div key={u.unitId} className="rounded-xl border bg-surface p-4">
              <p className="font-medium">{u.unit}</p>
              <p className="text-[13px] text-muted">{u.group}</p>
              <div className="mt-3 mb-1.5 flex justify-between text-[13px]">
                <span>{t.paidOf(u.paid, u.submitted)}</span>
                <span className="text-muted">{inr(u.paidPaise)} / {inr(u.claimedPaise)}</span>
              </div>
              <Progress value={u.paid} total={u.submitted} label={t.unitPaid(u.unit)} />
            </div>
          ))}
        </section>
      )}

      <ListControls
        placeholder={t.search}
        selects={[
          {
            key: "status",
            label: T.common.status,
            options: [["", t.allStatuses], ...(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "RETURNED", "APPROVED", "PAID", "REJECTED"].map((s) => [s, T.status.bill[s]] as [string, string]))],
          },
          { key: "sort", label: T.common.order, options: [["newest", T.common.newest], ["oldest", T.common.oldest]] },
        ]}
      />

      <div className="overflow-hidden rounded-xl border bg-surface">
        {list.rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">{bill ? t.noneBills : t.noneDemands}</p>
            <p className="mt-1 text-muted">{q.q || q.status ? t.clearFilters : institutions.length ? (bill ? t.firstBill : t.firstDemand) : t.fromUnits(title)}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-surface-2 text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{T.common.institution}</th>
                  <th className="px-5 py-2.5 font-medium">{bill ? t.training : t.period}</th>
                  <th className="px-5 py-2.5 font-medium">{t.instructor}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.amount}</th>
                  <th className="px-5 py-2.5 font-medium">{t.route}</th>
                  <th className="px-5 py-2.5 font-medium">{T.common.status}</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((b) => (
                  <OpenRow key={b.id} id={b.id}>
                    <td className="px-5 py-3">
                      <OpenLink id={b.id}>{b.institution.name}</OpenLink>
                      <p className="text-[13px] text-muted">{b.institution.unit.name}</p>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {b.refreshment ? (
                        <>
                          {day(b.refreshment.trainingStart, locale)}
                          <p className="text-[13px] text-muted">{T.common.cadetsPeriods(b.refreshment.cadetsPresent, b.refreshment.periods)}</p>
                        </>
                      ) : (
                        <>
                          {day(b.periodStart, locale)}
                          <p className="text-[13px] text-muted">{t.toDate(day(b.periodEnd, locale))}</p>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {b.refreshment?.instructorName ?? b.honorarium?.instructorName}
                      <p className="text-[13px] text-muted">{b.refreshment?.instructorAppointment ?? b.honorarium?.instructorAppointment}</p>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {inr(b.state === "DRAFT" ? b.claimedPaise : b.totalPaise)}
                      {b.paidPaise > 0n && <p className="text-[13px] text-success">{t.paidAmount(inr(b.paidPaise))}</p>}
                    </td>
                    <td className="px-5 py-3"><RouteStrip stations={stationsFromState(b.state)} locale={locale} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Status state={b.state} locale={locale} />
                        {pending.has(b.id) && <span className="text-xs font-medium text-accent">{t.yourTurn}</span>}
                      </div>
                    </td>
                  </OpenRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.total > 0 && <Pager page={list.page} pages={list.pages} total={list.total} />}
      </div>

      {sp.new && institutions.length > 0 && <BillForm kind={kind} institutions={institutions} subjects={subjectList} categories={cats.map((c) => c.category)} />}

      {open && (() => {
        const stage = open.approval && open.approval.status === "PENDING" ? open.approval.stages[open.approval.stageIndex] : null;
        const evidencePurpose = open.refreshment ? "BILL" : "DOCUMENT";
        const hasEvidence = open.attachments.some((a) => a.purpose === evidencePurpose && a.status !== "REJECTED");
        const editable = open.isOwner && ["DRAFT", "RETURNED"].includes(open.state);
        const due = open.totalPaise - open.paidPaise;
        const footer =
          stage && pending.has(open.id) ? (
            <DecisionPanel kind={kind} id={open.id} version={open.version} stage={stage.kind as "RECOMMEND" | "APPROVE"} stageCode={stage.code} stageTitle={stage.title} />
          ) : editable ? (
            <OwnerActions kind={kind} id={open.id} version={open.version} state={open.state} />
          ) : canPay && !open.isOwner && ["APPROVED", "PARTIALLY_PAID"].includes(open.state) && due > 0n ? (
            <PaymentForm kind={kind} id={open.id} version={open.version} duePaise={due.toString()} />
          ) : undefined;
        return (
          <Drawer title={open.institution.name} closeKeys={["open"]} footer={footer}>
            <div className="space-y-7">
              <div className="flex flex-wrap items-center gap-3">
                <Status state={open.state} locale={locale} />
                <span className="text-muted">{open.institution.unit.name}, {open.institution.unit.group.name}</span>
              </div>
              <div className="rounded-lg bg-surface-2/70 px-2 py-4">
                <RouteFull stations={stationsFromTimeline(open.approval, open.state)} locale={locale} />
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {(open.refreshment
                  ? [
                      [t.training, `${day(open.refreshment.trainingStart, locale)}, ${time(open.refreshment.trainingStart)}–${time(open.refreshment.trainingEnd)}`],
                      [t.cadetsAndPeriods, T.common.cadetsPeriods(open.refreshment.cadetsPresent, open.refreshment.periods)],
                      [t.instructor, `${open.refreshment.instructorName} (${open.refreshment.instructorAppointment})`],
                      [t.mobile, open.refreshment.instructorMobile],
                    ]
                  : [
                      [t.period, t.periodRange(day(open.periodStart, locale), day(open.periodEnd, locale))],
                      [t.months, String(open.honorarium?.months ?? "")],
                      [t.officer, `${open.honorarium?.instructorRank} ${open.honorarium?.instructorName} (${open.honorarium?.instructorAppointment})`],
                      [t.category, open.category],
                    ]
                ).map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-[13px] text-muted">{k}</dt>
                    <dd className="font-medium">{val}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid grid-cols-3 gap-3 rounded-lg border p-4">
                <div><p className="text-[13px] text-muted">{t.claimed}</p><p className="text-lg font-semibold">{inr(open.claimedPaise)}</p></div>
                <div><p className="text-[13px] text-muted">{t.policy}</p><p className="text-lg font-semibold">{open.entitlementPaise ? inr(open.entitlementPaise) : t.onSubmission}</p></div>
                <div><p className="text-[13px] text-muted">{t.paid}</p><p className="text-lg font-semibold">{inr(open.paidPaise)}</p></div>
              </div>
              {open.refreshment && open.refreshment.subjects.length > 0 && (
                <div>
                  <h3 className="text-[13px] text-muted">{t.subjects}</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {open.refreshment.subjects.map((s) => <li key={s.id} className="rounded-full bg-surface-2 px-3 py-1 text-[13px]">{s.name}</li>)}
                  </ul>
                </div>
              )}
              <div className="space-y-2">
                <h3 className="text-[13px] text-muted">{t.documents}</h3>
                {open.attachments.length === 0 && <p className="text-[13px]">{t.noDocs} {editable ? (open.refreshment ? t.attachFirstBill : t.attachFirstDoc) : ""}</p>}
                {open.attachments.map((a) => (
                  <AttachmentLink key={a.id} id={a.id} status={a.status} label={`${t.purpose[a.purpose] ?? t.file} (${Math.max(1, Math.round(a.size / 1024))} KB)`} />
                ))}
                {editable && (
                  <div className="flex flex-wrap gap-4 pt-2">
                    {!hasEvidence && <EvidenceUpload resourceId={open.id} institutionId={open.institutionId} purpose={evidencePurpose} label={open.refreshment ? t.attachBill : t.attachDoc} />}
                    {open.refreshment && <EvidenceUpload resourceId={open.id} institutionId={open.institutionId} purpose="PHOTO" label={t.addPhoto} />}
                  </div>
                )}
              </div>
              {open.approval && open.approval.steps.length > 0 && (
                <div>
                  <h3 className="mb-3 text-[13px] text-muted">{t.history}</h3>
                  <ol className="space-y-3 border-l-2 pl-4">
                    {[...open.approval.steps].reverse().map((s, i) => (
                      <li key={i} className="relative">
                        <span aria-hidden className="absolute top-2 -left-[21px] size-2 rounded-full bg-flag-navy" />
                        <p className="text-[13.5px]">
                          {t.step(t.outcome[s.outcome] ?? s.outcome, s.system ? `${s.actor} (${T.route.system})` : s.actor)}
                        </p>
                        <p className="text-xs text-muted">{day(s.at, locale)}, {time(s.at)}{open.approval!.cycle > 1 ? `, ${t.round(s.cycle)}` : ""}</p>
                        {s.remarks && !s.system && <p className="mt-1 rounded-md bg-surface-2 px-3 py-1.5 text-[13px]">{s.remarks}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {open.payments.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[13px] text-muted">{t.payments}</h3>
                  <ul className="space-y-1.5">
                    {open.payments.map((p) => (
                      <li key={p.id} className="flex justify-between text-[13.5px]"><span>{p.reference}</span><span className="font-medium">{inr(p.amountPaise)}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Drawer>
        );
      })()}
    </div>
  );
}
