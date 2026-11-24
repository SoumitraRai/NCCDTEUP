import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { messages, type Locale } from "@/lib/localization/messages";
export function PublicShell({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const t = messages[locale];
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content / मुख्य सामग्री
      </a>
      <div className="demo-banner">{t.demo}</div>
      <header className="public-header">
        <Link href={`/${locale}`} className="brand">
          <span className="brand-mark" aria-hidden="true">
            S<span>●</span>
          </span>
          <span>
            <strong>
              {t.brand}
              <i> / सम्पर्क</i>
            </strong>
            <small>{t.directorate}</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href={`/${locale}`}>{t.home}</Link>
          <Link href={`/${locale}/about`}>{t.about}</Link>
          <Link href={`/${locale}/stories`}>{t.stories}</Link>
          <Link href={`/${locale}/notices`}>{t.notices}</Link>
        </nav>
        <div className="header-tools">
          <Link
            className="language"
            href={`/${locale === "en" ? "hi" : "en"}`}
            lang={locale === "en" ? "hi" : "en"}
          >
            {locale === "en" ? "हिन्दी" : "English"}
          </Link>
          <ThemeToggle />
          <Link className="button small navy" href={`/${locale}/login`}>
            {t.dashboard}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">
        <div>
          <div className="footer-brand">
            {t.brand}
            <span> / सम्पर्क</span>
          </div>
          <p>{t.footer}</p>
          <small>
            {locale === "en"
              ? "Development identity • not an official NCC mark"
              : "विकास पहचान • आधिकारिक एनसीसी चिह्न नहीं"}
          </small>
        </div>
        <nav aria-label="Footer">
          {(
            ["contact", "privacy", "accessibility", "terms", "content"] as const
          ).map((k) => (
            <Link href={`/${locale}/${k}`} key={k}>
              {t[k]}
            </Link>
          ))}
        </nav>
        <div className="footer-bottom">
          <span>© 2026 Sampark · Development preview</span>
          <span>
            <ShieldCheck size={15} /> {t.secure}
          </span>
        </div>
      </footer>
    </>
  );
}
