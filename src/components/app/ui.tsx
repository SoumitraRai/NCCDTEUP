"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useT } from "./i18n-client";
// Tells the server which language to answer errors in, from the page URL.
export const localeHeader = () => ({ "x-sampark-locale": location.pathname.split("/")[1] === "hi" ? "hi" : "en" });
// Calls a private endpoint and turns the server's error into a readable message.
export async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/private/${path}`, {
    method,
    headers: { ...localeHeader(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = (data.issues as { message: string; path: string[] }[] | undefined)?.[0];
    throw new Error(issue ? `${issue.message}` : (data.error ?? "The request could not be completed."));
  }
  return data as T;
}
export function useQueryState() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const set = (updates: Record<string, string | null>, opts: { scroll?: boolean } = {}) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.push(qs ? `${path}?${qs}` : path, { scroll: opts.scroll ?? false });
  };
  return { params, set, path };
}
const btn = {
  primary: "bg-primary text-on-primary hover:bg-primary/90",
  secondary: "border bg-surface text-ink hover:bg-surface-2",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger/5",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
};
export function Button({
  variant = "secondary",
  busy,
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof btn; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[13.5px] font-medium transition-[background-color,transform] duration-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${btn[variant]} ${className}`}
    >
      {busy && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}
// With `query`, the link keeps the current search params (year, filters)
// and only changes the keys given.
export function ButtonLink({ href, query, variant = "secondary", children }: { href?: string; query?: Record<string, string | null>; variant?: keyof typeof btn; children: ReactNode }) {
  const { params, path } = useQueryState();
  if (query) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(query)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    href = `${path}?${next}`;
  }
  return (
    <Link href={href ?? path} scroll={false} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[13.5px] font-medium ${btn[variant]}`}>
      {children}
    </Link>
  );
}
const controlBase = "h-9 rounded-md border bg-surface px-3 text-[14px] text-ink placeholder:text-muted/70 focus:border-primary";
const control = `${controlBase} w-full`;
export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
export const inputClass = control;
export function Alert({ tone = "danger", children }: { tone?: "danger" | "success"; children: ReactNode }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-[13px] ${tone === "danger" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
      {children}
    </p>
  );
}
// Right-hand sheet. Its open state lives in the URL (?open=… or ?new=1).
export function Drawer({ title, closeKeys, children, footer }: { title: string; closeKeys: string[]; children: ReactNode; footer?: ReactNode }) {
  const { set } = useQueryState();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const close = () => set(Object.fromEntries(closeKeys.map((k) => [k, null])));
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Everything outside the sheet is inert while it is open, so keyboard and
    // screen-reader users stay inside it.
    const inerted: Element[] = [];
    for (let el: Element | null = ref.current?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
      for (const sib of el.parentElement?.children ?? []) {
        if (sib !== el && !sib.hasAttribute("inert") && sib.tagName !== "SCRIPT") {
          sib.setAttribute("inert", "");
          inerted.push(sib);
        }
      }
    }
    return () => {
      inerted.forEach((el) => el.removeAttribute("inert"));
      removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={t.common.close} tabIndex={-1} className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" onClick={close} />
      <div ref={ref} tabIndex={-1} className="drawer-in absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-surface shadow-2xl outline-none">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={close} aria-label={t.common.close} className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t bg-surface-2/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
// Search with comma-separated terms, plus optional selects. Values live in the URL.
export function ListControls({ placeholder, selects = [] }: { placeholder: string; selects?: { key: string; label: string; options: [string, string][] }[] }) {
  const { params, set } = useQueryState();
  const t = useT();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => set({ q: q || null, page: null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[260px] flex-1">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input type="search" aria-label={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={`${control} pl-9`} />
      </div>
      {selects.map((s) => (
        <select
          key={s.key}
          aria-label={s.label}
          value={params.get(s.key) ?? ""}
          onChange={(e) => set({ [s.key]: e.target.value || null, page: null })}
          className={controlBase}
        >
          {s.options.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      ))}
    </div>
  );
}
export function Pager({ page, pages, total }: { page: number; pages: number; total: number }) {
  const { set } = useQueryState();
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-[13px] text-muted">
      <span>{t.common.records(total)}</span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>{t.common.previous}</Button>
        <span>{t.common.page(page, pages)}</span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>{t.common.next}</Button>
      </div>
    </div>
  );
}
// A table row that opens its record in the drawer.
export function OpenRow({ id, children }: { id: string; children: ReactNode }) {
  const { set, params } = useQueryState();
  const active = params.get("open") === id;
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        set({ open: id });
      }}
      className={`cursor-pointer border-t transition-colors duration-100 hover:bg-surface-2/70 ${active ? "bg-primary-soft/60" : ""}`}
    >
      {children}
    </tr>
  );
}
export function OpenLink({ id, children }: { id: string; children: ReactNode }) {
  const { set } = useQueryState();
  return (
    <button onClick={() => set({ open: id })} className="text-left font-medium hover:text-primary">
      {children}
    </button>
  );
}
