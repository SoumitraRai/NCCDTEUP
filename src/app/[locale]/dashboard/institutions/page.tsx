import { getLocale } from "@/lib/localization/messages";
import { parseList } from "@/modules/platform/query";
import { editableUnits, institutionPoints, listInstitutions } from "@/modules/visits/service";
import Link from "next/link";
import { InstitutionMap } from "@/components/app/institution-map";
import { currentActor } from "@/components/app/session";
import { Plus } from "lucide-react";
import { ButtonLink, ListControls, Pager } from "@/components/app/ui";
import { InstitutionForm } from "@/components/app/institution-form";
import { dict } from "@/components/app/i18n";
import { StrengthDetails } from "@/components/app/strength-grid";
import { institutionStrength } from "@/modules/camps/enrolment";
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/institutions">) {
  return { title: dict((await params).locale).institutions.title };
}
export default async function Institutions({ params, searchParams }: PageProps<"/[locale]/dashboard/institutions">) {
  const locale = getLocale((await params).locale);
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await currentActor(locale);
  const T = dict(locale);
  const t = T.institutions;
  const mapView = sp.view === "map";
  const q = parseList(sp);
  const [list, units, map] = await Promise.all([listInstitutions(actor, q), editableUnits(actor), mapView ? institutionPoints(actor, q.year) : null]);
  // The college open in Edit or More details, with its cadet strength.
  const strengthFor = sp.edit ?? sp.details;
  const strength = strengthFor ? await institutionStrength(actor, strengthFor, sp.year).catch(() => null) : null;
  // Switching views keeps the training year but drops list-only params.
  const viewHref = (view: string | null) => {
    const next = new URLSearchParams(sp.year ? { year: sp.year } : {});
    if (view) next.set("view", view);
    const qs = next.toString();
    return `/${locale}/dashboard/institutions${qs ? `?${qs}` : ""}`;
  };
  const visitsHref = (p: { name: string }) => `/${locale}/dashboard/visits?${new URLSearchParams({ q: p.name, ...(sp.year ? { year: sp.year } : {}) })}`;
  const canEdit = units.length > 0;
  const editing = sp.edit ? list.rows.find((i) => i.id === sp.edit) : undefined;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-muted">{t.intro(list.year)}</p>
        </div>
        {canEdit && (
          <ButtonLink query={{ new: "1", edit: null }} variant="primary">
            <Plus size={16} /> {t.add}
          </ButtonLink>
        )}
      </div>
      <nav aria-label={t.view} className="inline-flex rounded-md border bg-surface p-0.5 text-[13px]">
        {([[null, t.list], ["map", t.map]] as const).map(([view, label]) => {
          const on = (view === "map") === mapView;
          return (
            <Link key={label} href={viewHref(view)} aria-current={on ? "page" : undefined} className={`rounded px-3 py-1.5 ${on ? "bg-primary-soft font-medium text-primary" : "text-muted hover:text-ink"}`}>
              {label}
            </Link>
          );
        })}
      </nav>
      {sp.unit && !mapView && (
        <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 font-medium text-primary">{t.onlyUnit(list.rows[0]?.unit.name ?? "")}</span>
          <Link href={viewHref(null)} className="text-primary hover:underline">{t.showAll}</Link>
        </p>
      )}
      {map ? (
        <InstitutionMap points={map.points} locale={locale} hrefFor={visitsHref} />
      ) : (
      <>
      <ListControls placeholder={t.search} />
      <div className="overflow-hidden rounded-xl border bg-surface">
        {list.rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">{t.none}</p>
            <p className="mt-1 text-muted">{t.noneHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-surface-2 text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{T.common.institution}</th>
                  <th className="px-5 py-2.5 font-medium">{T.common.unit}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.authorised}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.enrolled}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.visitsYear}</th>
                  <th className="w-32 px-5 py-2.5"><span className="sr-only">{t.edit}</span></th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-5 py-3">
                      <p className="font-medium">{i.name}</p>
                      <p className="text-[13px] text-muted">{i.district}</p>
                    </td>
                    <td className="px-5 py-3">
                      {i.unit.name}
                      <p className="text-[13px] text-muted">{i.unit.group.name}</p>
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums ${i.authorised === null ? "text-muted" : ""}`}>{i.authorised ?? t.notEntered}</td>
                    <td className={`px-5 py-3 text-right tabular-nums ${i.enrolled === null ? "text-muted" : ""}`}>{i.enrolled ?? t.notEntered}</td>
                    <td className={`px-5 py-3 text-right ${i.visits ? "" : "text-danger"}`}>{i.visits || t.noneYet}</td>
                    <td className="px-5 py-3 text-right">
                      {units.some((u) => u.id === i.unit.id) ? (
                        <ButtonLink query={{ edit: i.id, new: null, details: null }} variant="ghost">
                          {t.edit}<span className="sr-only"> {i.name}</span>
                        </ButtonLink>
                      ) : (
                        <ButtonLink query={{ details: i.id, edit: null, new: null }} variant="ghost">
                          {T.camps.byCollege}<span className="sr-only"> {i.name}</span>
                        </ButtonLink>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.total > 0 && <Pager page={list.page} pages={list.pages} total={list.total} />}
      </div>
      </>
      )}
      {sp.details && !sp.edit && strength && <StrengthDetails key={strength.id} data={strength} />}
      {sp.new && canEdit && <InstitutionForm units={units} />}
      {editing && units.some((u) => u.id === editing.unit.id) && (
        <InstitutionForm
          key={`${editing.id}-${editing.version}-${strength?.version ?? 0}`}
          units={units}
          institution={{ id: editing.id, version: editing.version, name: editing.name, district: editing.district, unitId: editing.unit.id, latitude: editing.latitude, longitude: editing.longitude }}
          strength={strength ?? undefined}
        />
      )}
    </div>
  );
}
