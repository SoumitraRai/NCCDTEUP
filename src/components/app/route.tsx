import { Check, CornerUpLeft, X } from "lucide-react";
import { day } from "./format";
import { dict } from "./i18n";
// The approval route: a bill's or a TD's journey drawn as a line of stations.
type Label = "submitted" | "co" | "gpCdr" | "paid" | "branch" | "dir" | "ddg" | "adg";
type Station = { key: string; label: Label; state: "done" | "now" | "todo" | "returned" | "rejected" | "skipped"; system?: boolean; who?: string; at?: Date | string; remarks?: string; vacant?: boolean };
const base = [
  { key: "SUBMIT", label: "submitted" },
  { key: "CO", label: "co" },
  { key: "GP_CDR", label: "gpCdr" },
  { key: "PAID", label: "paid" },
] as const;
// Compact form for list rows, derived from the claim state alone.
export function stationsFromState(state: string): Station[] {
  const reached =
    { DRAFT: -1, SUBMITTED: 1, UNDER_REVIEW: 2, APPROVED: 3, PARTIALLY_PAID: 3, PAID: 4, RETURNED: 1, REJECTED: 2, CANCELLED: -1 }[state] ?? -1;
  return base.map((s, i) => ({
    ...s,
    state:
      i < reached
        ? "done"
        : i === reached
          ? state === "RETURNED"
            ? "returned"
            : state === "REJECTED"
              ? "rejected"
              : "now"
          : "todo",
  }));
}
type Timeline = {
  status: string;
  stageIndex: number;
  cycle: number;
  steps: { stageCode: string; outcome: string; actor: string; system: boolean; remarks: string; at: Date | string; cycle: number }[];
};
// Chain steps (TD, camp budgets): those before the start are not applicable;
// the request waits at `stageIndex` while pending and stops there when
// returned or rejected.
const tdLabels: [string, Label][] = [["GP_CDR", "gpCdr"], ["BRANCH", "branch"], ["DIR", "dir"], ["DDG", "ddg"], ["ADG", "adg"]];
const budgetLabels: [string, Label][] = [["GP_CDR", "gpCdr"], ["DDG", "ddg"]];
type ChainRow = { status: string; stageIndex: number; startIndex: number };
export const tdStations = (r: ChainRow, t?: Timeline | null, vacant = false) => chainStations(tdLabels, r, t, vacant);
export const budgetStations = (r: ChainRow, t?: Timeline | null) => chainStations(budgetLabels, r, t, false);
function chainStations(labels: [string, Label][], r: ChainRow, t: Timeline | null | undefined, vacant: boolean): Station[] {
  const top = r.startIndex >= labels.length;
  const stations: Station[] = labels.map(([key, label], i) => ({
    key,
    label,
    state:
      top || i < r.startIndex
        ? "skipped"
        : r.status === "APPROVED" || i < r.stageIndex
          ? "done"
          : i > r.stageIndex || r.status === "CANCELLED"
            ? "todo"
            : r.status === "RETURNED"
              ? "returned"
              : r.status === "REJECTED"
                ? "rejected"
                : "now",
    vacant: r.status === "PENDING" && i === r.stageIndex && vacant,
  }));
  for (const s of t?.steps.filter((s) => s.cycle === t.cycle) ?? []) {
    const st = stations.find((x) => x.key === s.stageCode);
    if (st) Object.assign(st, { who: s.actor, at: s.at, system: s.system, remarks: s.remarks });
  }
  return stations;
}
// Full form for the drawer: the latest cycle's steps, with who and when.
export function stationsFromTimeline(t: Timeline | null, state: string): Station[] {
  const stations = stationsFromState(state);
  if (!t) return stations;
  const steps = t.steps.filter((s) => s.cycle === t.cycle);
  for (const s of steps) {
    const st = stations.find((x) => x.key === s.stageCode);
    if (!st) continue;
    Object.assign(st, { who: s.actor, at: s.at, system: s.system, remarks: s.remarks });
    if (s.outcome === "RETURNED") st.state = "returned";
    if (s.outcome === "REJECTED") st.state = "rejected";
  }
  return stations;
}
const dot = {
  done: "bg-flag-navy text-white border-flag-navy",
  now: "bg-surface border-accent text-accent route-now",
  todo: "bg-surface border-line text-muted",
  returned: "bg-warning border-warning text-white",
  rejected: "bg-danger border-danger text-white",
  skipped: "bg-surface border-dashed border-line text-muted",
};
const icon = (s: Station["state"]) =>
  s === "done" ? <Check size={10} strokeWidth={3} /> : s === "returned" ? <CornerUpLeft size={10} strokeWidth={3} /> : s === "rejected" ? <X size={10} strokeWidth={3} /> : null;
const describe = (s: Station, locale: string) => {
  const r = dict(locale).route;
  return `${r[s.label]}: ${r[s.state]}`;
};
export function RouteStrip({ stations, locale }: { stations: Station[]; locale: string }) {
  return (
    <ol className="flex items-center" aria-label={stations.map((s) => describe(s, locale)).join(", ")}>
      {stations.map((s, i) => (
        <li key={s.key} className="flex items-center" title={describe(s, locale)}>
          {i > 0 && <span aria-hidden className={`h-0.5 w-4 ${["todo", "skipped"].includes(s.state) ? "bg-line" : "bg-flag-navy"}`} />}
          <span aria-hidden className={`grid size-4 place-items-center rounded-full border-2 ${dot[s.state]}`}>
            {icon(s.state)}
          </span>
        </li>
      ))}
    </ol>
  );
}
export function RouteFull({ stations, locale }: { stations: Station[]; locale: string }) {
  const r = dict(locale).route;
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${stations.length}, minmax(0, 1fr))` }}>
      {stations.map((s, i) => (
        <li key={s.key} className="relative pt-1">
          {i > 0 && (
            <span aria-hidden className={`absolute top-3.5 right-1/2 left-[-50%] h-0.5 ${["todo", "skipped"].includes(s.state) ? "bg-line" : "bg-flag-navy"}`} />
          )}
          <span aria-hidden className={`relative mx-auto grid size-6 place-items-center rounded-full border-2 ${dot[s.state]}`}>
            {icon(s.state)}
          </span>
          <div className="mt-2 px-1 text-center">
            <p className="text-[13px] font-semibold">{r[s.label]}</p>
            <p className="text-xs text-muted">
              {s.who ? (s.system ? r.system : s.who) : s.state === "now" ? (s.vacant ? r.vacant : r.waiting) : s.state === "skipped" ? r.skipped : " "}
            </p>
            {s.at && <p className="text-xs text-muted">{day(s.at, locale)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
