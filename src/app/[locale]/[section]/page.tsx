import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import { StoryCard } from "@/components/story-card";
import { publicContent } from "@/modules/publications/service";
import { getLocale, messages } from "@/lib/localization/messages";
import { db } from "@/server/db";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; section: string }>;
  searchParams: Promise<{ slug?: string; q?: string }>;
}) {
  const { locale: raw, section } = await params;
  const locale = getLocale(raw),
    t = messages[locale],
    hi = locale === "hi";
  const query = await searchParams;
  const categories: Record<string, string | undefined> = {
    stories: undefined,
    visits: "VISIT",
    achievements: "ACHIEVEMENT",
    activities: "ACTIVITY",
    galleries: "GALLERY",
    notices: "NOTICE",
    archive: "NOTICE",
  };
  const titles: Record<string, string> = {
    about: t.about,
    join: t.join,
    institutions: t.institutions,
    stories: t.stories,
    visits: t.visit,
    achievements: t.achievement,
    activities: t.activity,
    galleries: t.gallery,
    notices: t.notices,
    archive: t.archive,
    privacy: t.privacy,
    terms: t.terms,
    accessibility: t.accessibility,
    content: t.content,
    contact: t.contact,
  };
  if (!titles[section]) notFound();
  let content: React.ReactNode;
  if (section in categories) {
    const items = await publicContent(
      locale,
      categories[section],
      section === "archive",
    );
    if(query.slug && !items.some(p=>p.slug===query.slug))items.push(...await publicContent(locale,undefined,true));
    const item = query.slug ? items.find((p) => p.slug === query.slug) : null;
    if (query.slug && !item) notFound();
    content = item ? (
      <article className="prose">
        <span className="tag">{t.synthetic}</span>
        <h2>{item.title}</h2>
        <p>
          {new Intl.DateTimeFormat(locale, {
            dateStyle: "long",
            timeZone: "Asia/Kolkata",
          }).format(item.eventDate)}{" "}
          · {item.institutionDisplayName} · {item.district}
        </p>
        <p>{item.summary}</p>
        <p>{hi ? "अनुमोदित सार्वजनिक सामग्री।" : "Approved public content."}</p>
      </article>
    ) : (
      <section className="section">
        <div className="pill-row">
          {[
            "stories",
            "visits",
            "achievements",
            "activities",
            "galleries",
            "notices",
          ].map((s) => (
            <Link
              className={s === section ? "active" : ""}
              key={s}
              href={`/${locale}/${s}`}
            >
              {titles[s]}
            </Link>
          ))}
        </div>
        {section === "archive" && <div className="alert">{t.archived}</div>}
        <div className="story-grid">
          {items.map((s, i) => (
            <StoryCard key={s.publicId} story={s} locale={locale} index={i} />
          ))}
        </div>
        {!items.length && <div className="empty">{t.empty}</div>}
      </section>
    );
  } else if (section === "institutions") {
    const institutions = await db.institution.findMany({
      where: {
        publicApproved: true,
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { district: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { name: true, district: true, unit: { select: { name: true } } },
      take: 50,
    });
    content = (
      <section className="section">
        <form className="toolbar">
          <label>
            {hi ? "नाम या ज़िला" : "Name or district"}
            <input name="q" defaultValue={query.q} />
          </label>
          <button className="button navy">{hi ? "खोजें" : "Search"}</button>
        </form>
        <div className="story-grid">
          {institutions.map((i) => (
            <article className="panel" key={i.name}>
              <span className="tag">{t.synthetic}</span>
              <h2>{i.name}</h2>
              <p>{i.district}</p>
              <p>{i.unit.name}</p>
            </article>
          ))}
        </div>
      </section>
    );
  } else {
    const copy: Record<string, React.ReactNode> = {
      about: (
        <>
          <h2>
            {hi
              ? "जुड़ाव और सहभागिता का मंच"
              : "A place for connection and participation"}
          </h2>
          <p>
            {hi
              ? "सम्पर्क का यह विकास संस्करण अनुमोदित सार्वजनिक गतिविधियों और सुरक्षित प्रशासनिक कार्यों को एक मंच पर लाता है।"
              : "This development version of Sampark brings approved public stories and secure administrative workflows into one platform."}
          </p>
          <p>
            {hi
              ? "आधिकारिक निदेशालय परिचय, इतिहास और स्वीकृत चिह्न अभी उपलब्ध नहीं हैं।"
              : "The official directorate introduction, history and approved marks are awaiting institutional review."}
          </p>
          <Link className="button navy" href={`/${locale}/join`}>
            {t.join}
          </Link>
        </>
      ),
      join: (
        <>
          <h2>{t.pathway}</h2>
          <p>{t.pathwaySub}</p>
          <ol>
            <li>
              {hi
                ? "अपने संस्थान में एनसीसी की उपलब्धता के बारे में पूछें।"
                : "Ask your institution about NCC availability."}
            </li>
            <li>
              {hi
                ? "अधिकृत संस्थागत संपर्क से वर्तमान जानकारी प्राप्त करें।"
                : "Obtain current information from an authorized institutional contact."}
            </li>
            <li>
              {hi
                ? "आधिकारिक पात्रता और आवेदन सूचना की पुष्टि करें।"
                : "Confirm the official eligibility and application notice."}
            </li>
          </ol>
          <div className="alert">
            {hi
              ? "पात्रता, समय सीमा और नामांकन विवरण अनुमोदन की प्रतीक्षा में हैं। यह पृष्ठ प्रवेश की गारंटी नहीं है।"
              : "Eligibility, deadlines and enrollment details await approval. This page does not guarantee enrollment."}
          </div>
          <Link className="button navy" href={`/${locale}/institutions`}>
            {t.find}
          </Link>
        </>
      ),
      privacy: (
        <>
          <h2>
            {hi
              ? "निजता से शुरू होने वाला जुड़ाव"
              : "Connection starts with privacy"}
          </h2>
          <p>
            {hi
              ? "सार्वजनिक पृष्ठ केवल अनुमोदित प्रकाशन दिखाते हैं। प्रोफ़ाइल, दावे, बिल और आंतरिक टिप्पणियाँ निजी हैं।"
              : "Public pages contain approved publications only. Profiles, claims, bills and internal comments are private and access-controlled."}
          </p>
          <p>
            {hi
              ? "वर्तमान संस्करण में वास्तविक निजी डेटा न डालें। उत्पादन डेटा प्रतिधारण और संपर्क विवरण स्वीकृति के बाद प्रकाशित होंगे।"
              : "Do not enter real personal records into this development preview. Production retention periods and privacy contacts must be approved before launch."}
          </p>
          <p>
            {hi
              ? "डाउनलोड की गई सार्वजनिक तस्वीरें दर्शकों के उपकरणों से वापस नहीं ली जा सकतीं।"
              : "Downloaded public photographs cannot be recalled from visitors’ devices."}
          </p>
        </>
      ),
      terms: (
        <>
          <h2>{hi ? "विकास उपयोग की शर्तें" : "Development terms"}</h2>
          <p>
            {hi
              ? "यह एक परीक्षण मंच है। सामग्री, दरें और संस्थान उदाहरण हैं; इन्हें आधिकारिक निर्देश न मानें।"
              : "This is a test platform. Content, rates and institutions are examples and must not be treated as official instructions."}
          </p>
          <p>
            {hi
              ? "उत्पादन उपयोग की शर्तें अनुमोदन की प्रतीक्षा में हैं।"
              : "Production terms await institutional approval."}
          </p>
        </>
      ),
      accessibility: (
        <>
          <h2>
            {hi ? "सभी के लिए उपयोगी" : "Designed to be usable by everyone"}
          </h2>
          <p>
            {hi
              ? "कीबोर्ड नेविगेशन, दृश्यमान फ़ोकस, उत्तरदायी लेआउट और कम गति विकल्प समर्थित हैं।"
              : "The interface supports keyboard navigation, visible focus, responsive layouts and reduced-motion preferences."}
          </p>
          <p>
            {hi
              ? "WCAG 2.2 AA लक्ष्य है; औपचारिक अनुरूपता का दावा नहीं किया गया है।"
              : "WCAG 2.2 AA is the target. Formal conformance has not been established."}
          </p>
        </>
      ),
      content: (
        <>
          <h2>{hi ? "जिम्मेदारी से साझा करें" : "Share with care"}</h2>
          <p>
            {hi
              ? "हर सार्वजनिक प्रकाशन की समीक्षा और अनुमति आवश्यक है। प्रकाशन हटाने पर सार्वजनिक पहुँच समाप्त होती है। संग्रहित सूचनाओं को ऐतिहासिक रूप में चिह्नित किया जाता है।"
              : "Every public publication requires review and permission. Withdrawal removes public availability. Archived notices are marked as historical content."}
          </p>
          <p>
            {hi
              ? "आंतरिक रिकॉर्ड स्वतः सार्वजनिक नहीं होते। वास्तविक नामों और तस्वीरों के लिए स्पष्ट सहमति आवश्यक है।"
              : "Internal records never become public automatically. Real names and photographs require explicit publication consent."}
          </p>
        </>
      ),
      contact: (
        <>
          <h2>
            {hi ? "सही संपर्क से जुड़ें" : "Connect with the right person"}
          </h2>
          <p>
            {hi
              ? "आधिकारिक सार्वजनिक संपर्क विवरण अनुमोदन की प्रतीक्षा में हैं। फिलहाल अपने संस्थान के अधिकृत एनसीसी संपर्क से जानकारी लें।"
              : "Official public contact details await approval. For now, contact your institution’s authorized NCC representative."}
          </p>
          <p>
            {hi
              ? "इस विकास संस्करण में सार्वजनिक पूछताछ डेटा नहीं लिया जाता।"
              : "This development version does not collect public enquiries."}
          </p>
        </>
      ),
    };
    content = <article className="prose">{copy[section]}</article>;
  }
  return (
    <PublicShell locale={locale}>
      <section className="page-hero">
        <Link className="text-link" href={`/${locale}`}>
          ← {t.back}
        </Link>
        <h1>{titles[section]}</h1>
        <p>{t.demo}</p>
      </section>
      {content}
    </PublicShell>
  );
}
