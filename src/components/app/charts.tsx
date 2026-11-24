import { monthLabel } from "./format";
import { dict } from "./i18n";
// Hand-drawn SVG charts. Each chart carries a text summary for screen readers
// and a table alternative inside <details>.
export function MonthBars({
  data,
  locale,
  label,
}: {
  data: { month: string; value: number; secondary?: number }[];
  locale: string;
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  const total = data.reduce((s, d) => s + d.value, 0);
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  const n = data.length;
  const t = dict(locale).chart;
  // Bars are drawn in a 100-unit-wide SVG stretched to the card; labels are
  // HTML so they stay readable at any width.
  return (
    <figure>
      <div className="grid grid-cols-[24px_1fr] gap-x-2 pt-2">
        <div className="relative h-40 text-right text-[11px] text-muted" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>{t}</span>
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-40 w-full overflow-visible" role="img" aria-label={t.summary(label, total, monthLabel(peak.month, locale), peak.value)}>
          {ticks.map((t) => (
            <line key={t} x1={0} x2={100} y1={(1 - t / max) * 100} y2={(1 - t / max) * 100} className="stroke-line" vectorEffect="non-scaling-stroke" strokeDasharray={t ? "2 4" : undefined} />
          ))}
          {data.map((d, i) =>
            d.value > 0 ? (
              <rect key={d.month} x={(i + 0.25) * (100 / n)} y={(1 - d.value / max) * 100} width={(100 / n) * 0.5} height={(d.value / max) * 100} className="bar-grow fill-flag-navy" style={{ animationDelay: `${i * 30}ms` }}>
                <title>{`${monthLabel(d.month, locale)}: ${d.value}`}</title>
              </rect>
            ) : null,
          )}
        </svg>
        <div />
        <div className="mt-1.5 grid text-center text-[11px] text-muted" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
          {data.map((d, i) => (
            <span key={d.month} className={i % 2 ? "max-sm:invisible" : ""}>{monthLabel(d.month, locale)}</span>
          ))}
        </div>
      </div>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none">{t.table}</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th className="py-1 font-medium">{t.month}</th><th className="py-1 text-right font-medium">{label}</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t"><td className="py-1">{monthLabel(d.month, locale)} {d.month.slice(0, 4)}</td><td className="py-1 text-right">{d.value}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
// A thin two-part bar: done vs total.
export function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-flag-sky transition-[width] duration-500 ease-enter" style={{ width: `${pct}%` }} />
    </div>
  );
}
