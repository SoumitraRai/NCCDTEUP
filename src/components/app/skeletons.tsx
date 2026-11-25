"use client";
import { useT } from "./i18n-client";
// Placeholders shown while a dashboard page loads. They mirror the shape of
// the page so nothing jumps when the content arrives.
const Bar = ({ className }: { className: string }) => <div className={`skeleton ${className}`} />;
type Page = "visits" | "institutions" | "refreshment" | "pending" | "registrations" | "officers" | "movement" | "camps";
export function ListSkeleton({ page }: { page: Page }) {
  const t = useT();
  return (
    <div className="space-y-6" role="status" aria-label={t.common.loading(t.shell[page])}>
      <div className="space-y-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-4 w-72" />
      </div>
      <div className="flex gap-2">
        <Bar className="h-9 flex-1" />
        <Bar className="h-9 w-36" />
        <Bar className="h-9 w-36" />
      </div>
      <div className="space-y-3 rounded-xl border bg-surface p-5">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-6">
            <Bar className="h-4 flex-[2]" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-4 flex-1" />
            <Bar className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
export function OverviewSkeleton() {
  const t = useT();
  return (
    <div className="space-y-10" role="status" aria-label={t.common.loading(t.shell.overview)}>
      <div className="space-y-2">
        <Bar className="h-7 w-40" />
        <Bar className="h-4 w-80" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Bar key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Bar className="h-72 rounded-xl" />
        <Bar className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
