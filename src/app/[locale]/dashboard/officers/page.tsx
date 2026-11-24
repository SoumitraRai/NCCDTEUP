import { getLocale } from "@/lib/localization/messages";
import { parseList } from "@/modules/platform/query";
import { listOfficers } from "@/modules/identity/officers";
import { moveTargets } from "@/modules/identity/officer-posts";
import { currentActor } from "@/components/app/session";
import { day } from "@/components/app/format";
import { dict } from "@/components/app/i18n";
import { Alert, ButtonLink, ListControls, Pager } from "@/components/app/ui";
import { DutyToggle } from "@/components/app/duty-toggle";
import { OfficerPostForm } from "@/components/app/officer-post-form";
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/officers">) {
  return { title: dict((await params).locale).officers.title };
}
export default async function Officers({ params, searchParams }: PageProps<"/[locale]/dashboard/officers">) {
  const locale = getLocale((await params).locale);
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await currentActor(locale);
  const t = dict(locale).officers;
  const list = await listOfficers(actor, parseList({ ...sp, pageSize: "25" }));
  const managing = list.rows.find((o) => o.id === sp.manage && o.canManage);
  const targets = managing ? await moveTargets(actor, managing.id) : null;
  // Only the DDG and ADG manage the movement duty, so only they see the column.
  const movementColumn = list.rows.some((o) => o.canDelegateMovement);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </div>
      {(sp.changed === "moved" || sp.changed === "ended") && <Alert tone="success">{sp.changed === "moved" ? t.moved : t.ended}</Alert>}
      <ListControls
        placeholder={t.search}
        selects={[{ key: "status", label: t.formation, options: [["", t.all], ...(["DIRECTORATE", "GROUP", "UNIT"].map((l) => [l, t.levels[l]] as [string, string]))] }]}
      />
      <div className="overflow-hidden rounded-xl border bg-surface">
        {list.rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">{t.none}</p>
            <p className="mt-1 text-muted">{t.noneHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="bg-surface-2 text-[13px] text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t.name}</th>
                  <th className="px-5 py-2.5 font-medium">{t.post}</th>
                  <th className="px-5 py-2.5 font-medium">{t.formation}</th>
                  <th className="px-5 py-2.5 font-medium">{t.since}</th>
                  <th className="px-5 py-2.5 font-medium">{t.duty}</th>
                  {movementColumn && <th className="px-5 py-2.5 font-medium">{t.movementDuty}</th>}
                  <th className="px-5 py-2.5"><span className="sr-only">{t.change}</span></th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-5 py-3 font-medium">{o.name}</td>
                    <td className="px-5 py-3">{o.post ?? "—"}</td>
                    <td className="px-5 py-3">
                      {o.formation}
                      <p className="text-[13px] text-muted">{t.levels[o.level] ?? o.level}</p>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">{day(o.since, locale)}</td>
                    <td className="px-5 py-3">
                      {o.head ? t.headDuty : o.canDelegate ? <DutyToggle id={o.id} name={o.name} on={o.duty} /> : o.duty ? "✓" : "—"}
                    </td>
                    {movementColumn && (
                      <td className="px-5 py-3">
                        {o.canDelegateMovement ? <DutyToggle id={o.id} name={o.name} on={o.movement} duty="movement" /> : o.movement ? "✓" : "—"}
                      </td>
                    )}
                    <td className="px-5 py-3 text-right">
                      {o.canManage && (
                        <ButtonLink query={{ manage: o.id, changed: null }}>
                          <span className="whitespace-nowrap">{t.change}</span><span className="sr-only">: {o.name}</span>
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
      {managing && targets && (
        <OfficerPostForm key={managing.id} id={managing.id} name={managing.name} post={`${managing.post ?? "—"}, ${managing.formation}`} targets={targets.posts} />
      )}
    </div>
  );
}
