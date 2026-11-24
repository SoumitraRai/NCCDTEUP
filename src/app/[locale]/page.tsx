import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  Users,
  Heart,
  ChevronRight,
  Flag,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { StoryCard } from "@/components/story-card";
import { publicContent } from "@/modules/publications/service";
import { getLocale, messages } from "@/lib/localization/messages";
export const dynamic = "force-dynamic";
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = getLocale((await params).locale),
    t = messages[locale];
  const content = await publicContent(locale);
  const stories = content.filter((p) =>
    ["VISIT", "ACHIEVEMENT", "ACTIVITY"].includes(p.category),
  );
  const notices = content.filter((p) => p.category === "NOTICE");
  return (
    <PublicShell locale={locale}>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span />
            {t.eyebrow}
          </div>
          <h1>
            {t.hero.split("\n").map((line, i) => (
              <span key={line} className={i ? "accent-text" : ""}>
                {line}
              </span>
            ))}
          </h1>
          <p>{t.intro}</p>
          <div className="button-row">
            <Link href={`/${locale}/about`} className="button navy">
              {t.explore}
              <ArrowUpRight size={18} />
            </Link>
            <Link href={`/${locale}/join`} className="button outline">
              {t.joinCta}
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-note">
            <span className="tricolor" />
            {locale === "en"
              ? "Rooted in service. Connected through Sampark."
              : "सेवा से प्रेरित। सम्पर्क से जुड़े।"}
          </div>
        </div>
        <div
          className="hero-visual"
          aria-label={
            locale === "en"
              ? "Decorative illustration of connection, service and growth"
              : "जुड़ाव, सेवा और विकास का सजावटी चित्र"
          }
        >
          <div className="visual-grid" />
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-label">
            UTTAR PRADESH <span>26.85° N / 80.95° E</span>
          </div>
          <div className="hero-symbol">
            <Compass size={145} strokeWidth={0.75} />
            <span>एकता और अनुशासन</span>
          </div>
          <div className="visual-card card-service">
            <Heart size={22} />
            <span>
              {locale === "en" ? "The spirit of service" : "सेवा की भावना"}
              <small>01 / PURPOSE</small>
            </span>
          </div>
          <div className="visual-card card-together">
            <Users size={23} />
            <span>
              {locale === "en" ? "Stronger, together" : "एक साथ, सशक्त"}
              <small>02 / CONNECTION</small>
            </span>
          </div>
          <div className="visual-bottom">
            <span>LEARN · LEAD · SERVE</span>
            <ArrowUpRight size={30} />
          </div>
        </div>
      </section>
      <section className="path-strip" aria-label="Explore">
        <Link href={`/${locale}/institutions`}>
          <Users />
          <span>
            <strong>{t.institutions}</strong>
            <small>
              {locale === "en"
                ? "Find your local connection"
                : "स्थानीय संस्थान खोजें"}
            </small>
          </span>
          <ChevronRight />
        </Link>
        <Link href={`/${locale}/activities`}>
          <Flag />
          <span>
            <strong>{t.activity}</strong>
            <small>
              {locale === "en"
                ? "Discover participation in action"
                : "भागीदारी की झलकियाँ देखें"}
            </small>
          </span>
          <ChevronRight />
        </Link>
        <Link href={`/${locale}/galleries`}>
          <Compass />
          <span>
            <strong>{t.gallery}</strong>
            <small>
              {locale === "en"
                ? "A window into our community"
                : "हमारे समुदाय की झलक"}
            </small>
          </span>
          <ChevronRight />
        </Link>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              {locale === "en"
                ? "PEOPLE. PURPOSE. POSSIBILITY."
                : "लोग। उद्देश्य। संभावनाएँ।"}
            </div>
            <h2>{t.latest}</h2>
            <p>{t.latestSub}</p>
          </div>
          <Link href={`/${locale}/stories`} className="text-link">
            {t.all}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="story-grid">
          {stories.map((story, i) => (
            <StoryCard
              key={story.publicId}
              story={story}
              locale={locale}
              index={i}
            />
          ))}
        </div>
      </section>
      <section className="section notices-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">{t.notices}</div>
            <h2>{t.notice}</h2>
            <p>{t.noticeSub}</p>
          </div>
          <Link className="text-link" href={`/${locale}/archive`}>
            {t.archive}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        {notices.map((n) => (
          <Link
            key={n.publicId}
            href={`/${locale}/stories?slug=${n.slug}`}
            className="notice-row"
          >
            <span className="notice-date">
              {new Intl.DateTimeFormat(locale, {
                day: "2-digit",
                timeZone: "Asia/Kolkata",
              }).format(n.publicationDate)}
              <small>
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  timeZone: "Asia/Kolkata",
                }).format(n.publicationDate)}
              </small>
            </span>
            <div>
              <span className="tag">{t.synthetic}</span>
              <h3>{n.title}</h3>
              <p>{n.summary}</p>
            </div>
            <ArrowUpRight />
          </Link>
        ))}
      </section>
      <section className="join-panel">
        <div className="join-icon">
          <Compass size={60} strokeWidth={1} />
        </div>
        <div>
          <div className="eyebrow">{t.join}</div>
          <h2>{t.pathway}</h2>
          <p>{t.pathwaySub}</p>
        </div>
        <Link className="button cream" href={`/${locale}/join`}>
          {t.joinCta}
          <ArrowUpRight size={18} />
        </Link>
      </section>
    </PublicShell>
  );
}
