import { dict } from "./i18n";
// One status vocabulary for every workflow.
const tone = {
  neutral: "bg-surface-2 text-muted",
  info: "bg-info/10 text-info",
  warning: "bg-warning/12 text-warning",
  success: "bg-success/12 text-success",
  danger: "bg-danger/10 text-danger",
  primary: "bg-primary-soft text-primary",
} as const;
const states: Record<string, keyof typeof tone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  APPROVED: "primary",
  PARTIALLY_PAID: "primary",
  PAID: "success",
  RETURNED: "warning",
  REJECTED: "danger",
  CANCELLED: "neutral",
};
const visitStates: Record<string, keyof typeof tone> = { DRAFT: "neutral", SUBMITTED: "success" };
const tdStates: Record<string, keyof typeof tone> = { PENDING: "info", RETURNED: "warning", APPROVED: "primary", COMPLETED: "success", REJECTED: "danger", CANCELLED: "neutral" };
export function Status({ state, kind = "bill", locale }: { state: string; kind?: "bill" | "visit" | "td"; locale: string }) {
  const t = (kind === "visit" ? visitStates : kind === "td" ? tdStates : states)[state] ?? "neutral";
  const label = dict(locale).status[kind][state] ?? state.toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tone[t]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
