import Link from "next/link";
import { getLocale } from "@/lib/localization/messages";
import { parseList } from "@/modules/platform/query";
import { getRegistration, listRegistrations } from "@/modules/identity/registration";
import { canApproveOfficers, getOfficerRequest, listOfficerRequests } from "@/modules/identity/officer-registration";
import { currentActor, reviewer } from "@/components/app/session";
import { day } from "@/components/app/format";
import { dict } from "@/components/app/i18n";
import { Drawer, ListControls, OpenLink, OpenRow, Pager } from "@/components/app/ui";
import { RegistrationDecision } from "@/components/app/registration-decision";
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/registrations">) {
  return { title: dict((await params).locale).registrations.title };
}
const statuses = ["PENDING", "ACTIVATED", "REJECTED"] as const;
type Row = { id: string; name: string; email: string; where: string; whereSub: string; what: string; createdAt: Date };
// Two kinds of request share this page: members (cadets, ANOs, CTOs), decided
// by reviewers in scope, and officers, decided at the level above or by a
// delegated officer. Each tab appears only to those who can decide it.
export default async function Registrations({ params, searchParams }: PageProps<"/[locale]/dashboard/registrations">) {
  const locale = getLocale((await params).locale);
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await currentActor(locale);
  const T = dict(locale);
  const t = T.registrations;
  const canMembers = reviewer(actor.assignments.map((a) => a.role));
  const canOfficers = await canApproveOfficers(actor);
  const officer = canOfficers && (sp.type === "officer" || !canMembers);
  const status = statuses.includes(sp.status as (typeof statuses)[number]) ? (sp.status as (typeof statuses)[number]) : "PENDING";
  const q = parseList({ ...sp, status });
  const label = { PENDING: t.pending, ACTIVATED: t.activated, REJECTED: t.rejected };
  let rows: Row[];
  let list: { total: number; page: number; pages: number; counts: Record<(typeof statuses)[number], number> };
  let open: { id: string; name: string; status: string; version: number; note: string; decidedAt: Date | null; decisionNote: string; fields: [string, string][]; role?: string } | null = null;
  if (officer) {
    const l = await listOfficerRequests(actor, q);
    list = l;
    rows = l.rows.map((r) => ({ id: r.id, name: r.name, email: r.email, where: r.formation, whereSub: T.officers.levels[r.level] ?? r.level, what: r.post, createdAt: r.createdAt }));
    const o = sp.open ? await getOfficerRequest(actor, sp.open).catch(() => null) : null;
    if (o)
      open = {
        ...o,
        fields: [
          [T.common.name, o.name],
          [T.common.email, o.email],
          [t.post, o.post],
          [t.formation, `${o.formation} (${T.officers.levels[o.level] ?? o.level})`],
          [t.requested, day(o.createdAt, locale)],
        ],
      };
  } else {
    const l = await listRegistrations(actor, q);
    list = l;
    rows = l.rows.map((r) => ({ id: r.id, name: r.name, email: r.email, where: r.institution.name, whereSub: r.institution.unit.name, what: t.roles[r.role] ?? r.role, createdAt: r.createdAt }));
    const m = sp.open ? await getRegistration(actor, sp.open).catch(() => null) : null;
    if (m)
      open = {
        ...m,
        fields: [
          [T.common.name, m.name],
          [T.common.email, m.email],
          [T.common.institution, `${m.institution.name}, ${m.institution.district}`],
          [T.common.unit, m.institution.unit.name],
          [t.asRole, t.roles[m.role] ?? m.role],
          [t.requested, day(m.createdAt, locale)],
        ],
      };
  }
  const base = `/${locale}/dashboard/registrations`;
  const href = (s: string, type = officer ? "officer" : "") => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (s !== "PENDING") p.set("status", s);
    return p.size ? `${base}?${p}` : base;
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </div>
      {canMembers && canOfficers && (
        <nav aria-label={t.title} className="inline-flex rounded-md border bg-surface p-0.5 text-[13px]">
          {([["", t.members], ["officer", t.officerTab]] as const).map(([type, name]) => {
            const on = (type === "officer") === officer;
            return (
              <Link key={name} href={href("PENDING", type)} aria-current={on ? "page" : undefined} className={`rounded px-3 py-1.5 ${on ? "bg-primary-soft font-medium text-primary" : "text-muted hover:text-ink"}`}>
                {name}
              </Link>
            );
          })}
        </nav>
      )}
      <nav aria-label={T.common.status} className="grid gap-3 sm:grid-cols-3">
        {statuses.map((s) => (
          <Link
            key={s}
            href={href(s)}
            aria-current={s === status ? "page" : undefined}
            className={`rounded-xl border bg-surface p-4 transition-colors duration-150 ${s === status ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"}`}
          >
            <p className="text-[28px] leading-8 font-semibold">{list.counts[s]}</p>
            <p className="text-muted">{label[s]}</p>
          </Link>
        ))}
      </nav>
      <ListControls placeholder={t.search} selects={[{ key: "sort", label: T.common.order, options: [["newest", T.common.newest], ["oldest", T.common.oldest]] }]} />
      <div className="overflow-hidden rounded-xl border bg-surface">
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">{t.none(label[status])}</p>
            {status === "PENDING" && <p className="mt-1 text-muted">{t.nonePending}</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-surface-2 text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t.person}</th>
                  <th className="px-5 py-2.5 font-medium">{officer ? t.formation : T.common.institution}</th>
                  <th className="px-5 py-2.5 font-medium">{officer ? t.post : t.asRole}</th>
                  <th className="px-5 py-2.5 font-medium">{t.requested}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <OpenRow key={r.id} id={r.id}>
                    <td className="px-5 py-3">
                      <OpenLink id={r.id}>{r.name}</OpenLink>
                      <p className="text-[13px] text-muted">{r.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      {r.where}
                      <p className="text-[13px] text-muted">{r.whereSub}</p>
                    </td>
                    <td className="px-5 py-3">{r.what}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{day(r.createdAt, locale)}</td>
                  </OpenRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.total > 0 && <Pager page={list.page} pages={list.pages} total={list.total} />}
      </div>
      {open && (
        <Drawer
          title={t.reviewTitle(open.name)}
          closeKeys={["open"]}
          footer={open.status === "PENDING" ? <RegistrationDecision key={open.version} id={open.id} version={open.version} role={open.role} officer={officer} /> : undefined}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {open.fields.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="font-medium break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6">
            <h3 className="text-[13px] text-muted">{t.note}</h3>
            <p className="mt-1 whitespace-pre-wrap">{open.note || t.noNote}</p>
          </div>
          {open.status !== "PENDING" && (
            <div className="mt-6 rounded-lg border p-4">
              <h3 className="text-[13px] text-muted">{t.decision}</h3>
              <p className="mt-1 font-medium">{label[open.status as (typeof statuses)[number]]}</p>
              {open.decidedAt && <p className="text-xs text-muted">{t.decidedOn(day(open.decidedAt, locale))}</p>}
              {open.decisionNote && <p className="mt-2 rounded-md bg-surface-2 px-3 py-1.5 text-[13px]">{open.decisionNote}</p>}
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
