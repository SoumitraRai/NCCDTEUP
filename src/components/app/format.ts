import { dict } from "./i18n";
// Display helpers. All dates are shown in Indian Standard Time.
const tz = "Asia/Kolkata";
export function inr(paise: bigint | string | number | null | undefined, opts: { compact?: boolean } = {}) {
  if (paise === null || paise === undefined) return "—";
  const p = BigInt(paise);
  const rupees = p / 100n;
  const rest = p % 100n;
  if (opts.compact && rupees >= 100000n) {
    const lakh = Number(rupees) / 100000;
    return `₹${lakh.toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
  }
  const whole = rupees.toLocaleString("en-IN");
  return rest ? `₹${whole}.${rest.toString().padStart(2, "0")}` : `₹${whole}`;
}
export const day = (d: Date | string, locale = "en") =>
  new Date(d).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
export const time = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-IN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
export const monthLabel = (ym: string, locale = "en") =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", { month: "short", timeZone: "UTC" });
export function ago(d: Date | string, locale = "en") {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  const t = dict(locale).common;
  return days < 1 ? t.today : t.days(days);
}
