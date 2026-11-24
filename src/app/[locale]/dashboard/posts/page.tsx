import { getLocale } from "@/lib/localization/messages";
import { listTopPosts } from "@/modules/identity/post-accounts";
import { currentActor } from "@/components/app/session";
import { dict } from "@/components/app/i18n";
import { Alert, ButtonLink } from "@/components/app/ui";
import { PostHolderForm } from "@/components/app/post-holder-form";
export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/posts">) {
  return { title: dict((await params).locale).posts.title };
}
export default async function Posts({ params, searchParams }: PageProps<"/[locale]/dashboard/posts">) {
  const locale = getLocale((await params).locale);
  const sp = await searchParams;
  const actor = await currentActor(locale);
  const t = dict(locale).posts;
  const posts = await listTopPosts(actor);
  const editing = posts.find((p) => p.code === sp.post && !p.yours);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t.intro}</p>
      </div>
      {sp.saved && <Alert tone="success">{t.saved}</Alert>}
      <div className="overflow-hidden rounded-xl border bg-surface">
        <table className="w-full text-left">
          <thead className="bg-surface-2 text-[13px] text-muted">
            <tr>
              <th className="px-5 py-2.5 font-medium">{t.post}</th>
              <th className="px-5 py-2.5 font-medium">{t.holder}</th>
              <th className="px-5 py-2.5 font-medium">{t.access}</th>
              <th className="px-5 py-2.5"><span className="sr-only">{t.handOver}</span></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.code} className="border-t">
                <td className="px-5 py-3 font-medium">{p.title}</td>
                <td className="px-5 py-3">
                  {p.holder ? (
                    <>
                      {p.holder.name}
                      <p className="text-[13px] text-muted">{p.holder.email}{p.holder.phone ? `, ${p.holder.phone}` : ""}</p>
                    </>
                  ) : (
                    <span className="text-muted">{t.vacant}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-[13px]">
                  {!p.holder ? "—" : !p.holder.passwordSet ? t.noPassword : !p.holder.twoFactor ? t.noTotp : t.ready}
                </td>
                <td className="px-5 py-3 text-right">
                  {p.yours ? (
                    <span className="text-[13px] text-muted">{t.yours}</span>
                  ) : (
                    <ButtonLink query={{ post: p.code, saved: null }} variant={p.holder ? "secondary" : "primary"}>
                      {p.holder ? t.handOver : t.setUp}
                    </ButtonLink>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PostHolderForm key={editing.code} code={editing.code} title={editing.title} handover={!!editing.holder} />}
    </div>
  );
}
