"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { BadgeIndianRupee, ClipboardCheck, GraduationCap, Inbox, LayoutGrid, LogOut, MapPinned, Menu, Moon, School, Sun, X, Boxes, UserPlus, Users, KeyRound, Plane } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useT } from "./i18n-client";
const icons = { overview: LayoutGrid, approvals: Inbox, visits: MapPinned, institutions: School, refreshment: BadgeIndianRupee, honorarium: GraduationCap, workspace: Boxes, checks: ClipboardCheck, registrations: UserPlus, officers: Users, posts: KeyRound, movement: Plane };
export type NavItem = { href: string; label: string; icon: keyof typeof icons; count?: number; section?: string };
// `footer` (who is signed in, sign out) is shown in the phone menu; on wide
// screens the rail shows it itself.
export function Nav({ items, footer }: { items: NavItem[]; footer?: ReactNode }) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const list = (
    <nav aria-label={t.shell.main} className="flex flex-col gap-0.5 px-3">
      {items.map((item, i) => {
        const Icon = icons[item.icon];
        const active = item.href.split("/").length <= 3 ? path === item.href : path.startsWith(item.href);
        return (
          <div key={item.href}>
            {item.section && items[i - 1]?.section !== item.section && (
              <p className="mt-5 mb-1.5 px-3 text-xs text-rail-ink/60">{item.section}</p>
            )}
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors duration-150 ${
                active ? "bg-white/10 text-white" : "text-rail-ink hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} className={active ? "text-flag-sky" : "opacity-70"} />
              <span className="flex-1">{item.label}</span>
              {!!item.count && (
                <span className="rounded-full bg-flag-red px-1.5 text-[11px] leading-[18px] font-semibold text-white">{item.count}</span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
  return (
    <>
      <div className="hidden lg:block">{list}</div>
      <button className="grid size-9 place-items-center rounded-md text-rail-ink lg:hidden" aria-label={t.shell.openMenu} aria-expanded={open} onClick={() => setOpen(true)}>
        <Menu size={20} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.shell.menu}>
          <button className="absolute inset-0 bg-black/40" aria-label={t.shell.closeMenu} onClick={() => setOpen(false)} />
          <div className="drawer-in absolute inset-y-0 left-0 flex w-72 flex-col bg-rail py-4">
            <button className="mb-3 ml-auto mr-3 grid size-9 place-items-center rounded-md text-rail-ink" aria-label={t.shell.closeMenu} onClick={() => setOpen(false)}>
              <X size={20} />
            </button>
            <div className="flex-1 overflow-y-auto">{list}</div>
            {footer && <div className="border-t border-white/10 px-3 pt-4">{footer}</div>}
          </div>
        </div>
      )}
    </>
  );
}
export function YearPicker({ years, current }: { years: string[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const t = useT();
  const value = params.get("year") ?? current;
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      {t.shell.trainingYear}
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set("year", e.target.value);
          next.delete("page");
          router.push(`${path}?${next}`);
        }}
        className="h-8 rounded-md border bg-surface px-2 text-[13px] text-ink"
      >
        {years.map((y) => (
          <option key={y} value={y}>{y.replace("-", "–")}</option>
        ))}
      </select>
    </label>
  );
}
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useT();
  // The server cannot know the theme, so both icons are rendered and CSS
  // shows the right one; the label stays the same on server and client.
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t.shell.theme}
      className="grid size-8 place-items-center rounded-md border bg-surface text-muted hover:text-ink"
    >
      <Sun size={16} className="hidden dark:block" />
      <Moon size={16} className="dark:hidden" />
    </button>
  );
}
export function SignOut({ locale }: { locale: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const t = useT();
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        router.push(`/${locale}/login`);
      }}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] text-rail-ink hover:bg-white/5 hover:text-white disabled:opacity-60"
    >
      <LogOut size={16} strokeWidth={1.75} /> {t.shell.signOut}
    </button>
  );
}
