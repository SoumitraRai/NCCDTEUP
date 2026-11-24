"use client";
import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FileCheck,
  Newspaper,
  Settings,
  ShieldCheck,
  Users,
  MessageSquare,
  Bell,
  Plane,
  TentTree,
  CalendarDays,
  ClipboardList,
  Landmark,
  ContactRound,
  BookOpen,
  User,
  LogOut,
  ArrowUpRight,
  Plus,
  Download,
  LockKeyhole,
} from "lucide-react";
import { messages, type Locale } from "@/lib/localization/messages";
import { authClient } from "@/lib/auth-client";
import { ThemeToggle } from "./theme-toggle";
import { Dialog } from "./dialog";
import { Attachments } from "./attachments";
type UserData = {
  id: string;
  name: string;
  roles: string[];
  capabilities: string[];
  institutions: { id: string; name: string; district: string }[];
};
type Claim = {
  attendance: number;
  sessions: number;
  idempotencyKey: string;
  institutionId: string;
  id: string;
  ownerId: string;
  kind: string;
  category: string;
  state: string;
  version: number;
  totalPaise: string;
  paidPaise: string;
  periodStart: string;
  periodEnd: string;
  institution: { name: string };
  payments: {
    id: string;
    amountPaise: string;
    reference: string;
    reversalOf: string | null;
  }[];
};
type RecordData = {
  institutionId?: string;
  id: string;
  title?: string;
  notes?: string;
  ownerId?: string;
  body?: string;
  status?: string;
  state?: string;
  version?: number;
  name?: string;
  active?: boolean;
  createdAt?: string;
  eventDate?: string;
  action?: string;
  actorId?: string;
  resourceId?: string;
  message?: string;
  ratePaise?: string;
  kind?: string;
  synthetic?: boolean;
  assignments?: { role: string }[];
  revisions?: { title: string; summary: string; consentId: string | null }[];
};
type Module =
  | "overview"
  | "claims"
  | "visits"
  | "publications"
  | "policies"
  | "audit"
  | "users"
  | "profile"
  | "discussions"
  | "notifications"
  | "notices"
  | "tickets"
  | "cht"
  | "movement"
  | "gci"
  | "campBudgets"
  | "catc"
  | "reports"
  | "funds"
  | "leave"
  | "cms"
  | "cadets";
const links: {
  id: Module;
  icon: typeof Users;
  label: keyof typeof messages.en;
}[] = [
  { id: "overview", icon: LayoutDashboard, label: "overview" },
  { id: "tickets", icon: MessageSquare, label: "tickets" },
  { id: "cht", icon: FileCheck, label: "cht" },
  { id: "movement", icon: Plane, label: "movement" },
  { id: "gci", icon: Plane, label: "gci" },
  { id: "campBudgets", icon: Landmark, label: "campBudgets" },
  { id: "catc", icon: TentTree, label: "catc" },
  { id: "reports", icon: ClipboardList, label: "reports" },
  { id: "funds", icon: Landmark, label: "funds" },
  { id: "leave", icon: CalendarDays, label: "leave" },
  { id: "cms", icon: BookOpen, label: "cms" },
  { id: "cadets", icon: ContactRound, label: "cadets" },
  { id: "publications", icon: Newspaper, label: "publications" },
  { id: "notices", icon: Bell, label: "internal" },
  { id: "discussions", icon: MessageSquare, label: "discussions" },
  { id: "policies", icon: Settings, label: "policies" },
  { id: "users", icon: Users, label: "users" },
  { id: "audit", icon: ShieldCheck, label: "audit" },
  { id: "notifications", icon: Bell, label: "notifications" },
  { id: "profile", icon: User, label: "profile" },
];
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/private/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}
export function Dashboard(props: {
  locale: Locale;
  user: UserData;
  demo: boolean;
}) {
  return (
    <Suspense>
      <Workspace {...props} />
    </Suspense>
  );
}
function Workspace({
  locale,
  user,
  demo,
}: {
  locale: Locale;
  user: UserData;
  demo: boolean;
}) {
  const t = messages[locale],
    router = useRouter(),
    params = useSearchParams();
  const view = (
    links.some((l) => l.id === params.get("view"))
      ? params.get("view")
      : "overview"
  ) as Module;
  const page = Number(params.get("page") ?? 1),
    query = params.get("q") ?? "",
    state = params.get("state") ?? "";
  const [claims, setClaims] = useState<Claim[]>([]),
    [records, setRecords] = useState<RecordData[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState<string | null>(null),
    [target, setTarget] = useState<Claim | RecordData | null>(null),
    [refresh, setRefresh] = useState(0),
    [showKind, setShowKind] = useState(true);
  const cadet = user.roles.every((r) => r === "CADET"),
    admin = user.roles.includes("ADMIN"),
    reviewer = user.roles.some((r) => ["CO", "GROUP", "ADMIN"].includes(r));
  const money = (s: string) =>
    new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", {
      style: "currency",
      currency: "INR",
    }).format(Number(s) / 100);
  const status = (s: string) =>
    locale === "hi"
      ? ((
          {
            DRAFT: "ड्राफ्ट",
            SUBMITTED: "प्रस्तुत",
            UNDER_REVIEW: "समीक्षाधीन",
            APPROVED: "अनुमोदित",
            PARTIALLY_PAID: "आंशिक भुगतान",
            PAID: "भुगतान पूर्ण",
            RETURNED: "वापस",
            REJECTED: "अस्वीकृत",
            CANCELLED: "रद्द",
            PUBLISHED: "प्रकाशित",
            ARCHIVED: "संग्रहित",
            WITHDRAWN: "हटाया गया",
          } as Record<string, string>
        )[s] ?? s)
      : s.replaceAll("_", " ");
  const close = useCallback(() => {
    setDialog(null);
    setTarget(null);
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      setError("");
      try {
        if (view === "claims" || view === "overview") {
          const result = await api<{ rows: Claim[]; total: number }>(
            `claims?page=${page}&q=${encodeURIComponent(query)}&state=${state}`,
          );
          if (active) {
            setClaims(result.rows);
            setTotal(result.total);
          }
        } else if (
          ![
            "profile",
            "tickets",
            "cht",
            "movement",
            "gci",
            "campBudgets",
            "catc",
            "reports",
            "funds",
            "leave",
            "cms",
            "cadets",
          ].includes(view)
        ) {
          const result = await api<RecordData[]>(view);
          if (active) setRecords(result);
        } else if (
          [
            "tickets",
            "cht",
            "movement",
            "gci",
            "campBudgets",
            "catc",
            "reports",
            "funds",
            "leave",
            "cms",
            "cadets",
          ].includes(view) &&
          active
        ) {
          setRecords([]);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : t.error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [view, page, query, state, refresh, t.error]);
  const navigate = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/${locale}/workspace?${next}`);
  };
  const mutate = async (path: string, body: unknown) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(path, body);
      setSuccess(locale === "hi" ? "परिवर्तन सहेजा गया।" : "Changes saved.");
      close();
      setRefresh((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  };
  const action = (kind: string, row: Claim | RecordData) => {
    setTarget(row);
    setDialog(kind);
    setError("");
  };
  const claimTable = (
    <>
      <div
        className="table-wrap"
        role="region"
        aria-label={t.claims}
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>
                {locale === "hi" ? "दावा / संस्थान" : "Claim / institution"}
              </th>
              {showKind && <th>{locale === "hi" ? "प्रकार" : "Type"}</th>}
              <th>{t.status}</th>
              <th>{t.amount}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.id.slice(-8).toUpperCase()}</strong>
                  <small>{c.institution.name}</small>
                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(c.periodStart))}
                  </small>
                </td>
                {showKind && (
                  <td>
                    {c.kind === "REFRESHMENT"
                      ? locale === "hi"
                        ? "जलपान"
                        : "Refreshment"
                      : locale === "hi"
                        ? "मानदेय"
                        : "Honorarium"}
                  </td>
                )}
                <td>
                  <span className="badge">{status(c.state)}</span>
                </td>
                <td>
                  {money(c.totalPaise)}
                  <small>
                    {locale === "hi" ? "भुगतान" : "Paid"}: {money(c.paidPaise)}
                  </small>
                </td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => action("attachments", c)}>
                      Files
                    </button>
                    <button onClick={() => action("details", c)}>
                      {locale === "hi" ? "विवरण" : "Details"}
                    </button>
                    {c.ownerId === user.id &&
                      ["DRAFT", "RETURNED"].includes(c.state) && (
                        <>
                          <button onClick={() => action("correct", c)}>
                            Edit / सुधारें
                          </button>
                          <button onClick={() => action("SUBMIT", c)}>
                            {t.submit}
                          </button>
                        </>
                      )}
                    {reviewer &&
                      c.ownerId !== user.id &&
                      c.state === "SUBMITTED" && (
                        <button onClick={() => action("REVIEW", c)}>
                          {t.review}
                        </button>
                      )}
                    {reviewer &&
                      c.ownerId !== user.id &&
                      c.state === "UNDER_REVIEW" && (
                        <>
                          <button onClick={() => action("APPROVE", c)}>
                            {t.approve}
                          </button>
                          <button onClick={() => action("RETURN", c)}>
                            {t.return}
                          </button>
                          <button onClick={() => action("REJECT", c)}>
                            {t.reject}
                          </button>
                        </>
                      )}
                    {user.capabilities.includes("payment") &&
                      c.ownerId !== user.id &&
                      ["APPROVED", "PARTIALLY_PAID"].includes(c.state) && (
                        <button onClick={() => action("payment", c)}>
                          {t.pay}
                        </button>
                      )}
                    {c.ownerId === user.id &&
                      ["DRAFT", "RETURNED", "SUBMITTED"].includes(c.state) && (
                        <button onClick={() => action("CANCEL", c)}>
                          {t.cancel}
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!claims.length && !loading && (
          <div className="empty">{t.noRecords}</div>
        )}
      </div>
      <div className="pagination">
        <span>
          {total} {locale === "hi" ? "रिकॉर्ड" : "records"} ·{" "}
          {locale === "hi" ? "पृष्ठ" : "Page"} {page}
        </span>
        <div className="button-row" style={{ margin: 0 }}>
          <button
            className="button outline small"
            disabled={page <= 1}
            onClick={() => navigate({ page: String(page - 1) })}
          >
            {t.previous}
          </button>
          <button
            className="button outline small"
            disabled={page * 10 >= total}
            onClick={() => navigate({ page: String(page + 1) })}
          >
            {t.next}
          </button>
        </div>
      </div>
    </>
  );
  return (
    <div className="workspace-layout">
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" href={`/${locale}`}>
          <span className="brand-mark">S</span>
          <span>
            <strong>{t.brand}</strong>
            <small>{t.directorate}</small>
          </span>
        </Link>
        <div className="eyebrow" style={{ color: "#a5bcb6", marginBottom: 0 }}>
          {t.workspace}
        </div>
        <nav aria-label="Workspace">
          <span className="nav-group-label">OPERATIONS</span>
          {links
            .filter(
              (l) =>
                !(
                  ["claims", "policies", "publications"].includes(l.id) && cadet
                ) &&
                !(["audit", "users"].includes(l.id) && !admin) &&
                !(l.id === "policies" && !reviewer),
            )
            .map((l) => (
              <Link
                key={l.id}
                className={view === l.id ? "active" : ""}
                href={`/${locale}/workspace?view=${l.id}`}
              >
                <l.icon size={18} />
                {t[l.label]}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href={`/${locale}/dashboard`}>
            {locale === "hi" ? "नया डैशबोर्ड" : "New dashboard"}
          </Link>
          <Link href={`/${locale}`}>
            {locale === "hi" ? "सार्वजनिक साइट" : "Public website"} ↗
          </Link>
          <span>
            <LockKeyhole size={13} /> {t.private}
          </span>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <span>
            {t.private}{" "}
            <span style={{ color: "var(--muted)" }}>
              {" "}
              / {t[links.find((l) => l.id === view)!.label]}
            </span>
          </span>
          <div>
            <Link
              href={`/${locale === "en" ? "hi" : "en"}/workspace?view=${view}`}
            >
              {locale === "en" ? "हिन्दी" : "English"}
            </Link>
            <ThemeToggle />
            <span>{user.name}</span>
            <button
              className="icon-button"
              aria-label={t.logout}
              onClick={async () => {
                await authClient.signOut();
                router.push(`/${locale}/login`);
                router.refresh();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="workspace-body" id="workspace-content">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">{user.roles.join(" · ")}</div>
              <h1>
                {view === "overview"
                  ? `${t.welcome}, ${user.name}`
                  : t[links.find((l) => l.id === view)!.label]}
              </h1>
              <p>{user.institutions.map((i) => i.name).join(" · ")}</p>
            </div>
            {[
              "claims",
              "visits",
              "publications",
              "discussions",
              "notices",
              "policies",
            ].includes(view) &&
              !(view === "notices" && !reviewer) &&
              !(view === "policies" && !admin) && (
                <button
                  className="button navy"
                  onClick={() => setDialog(`new-${view}`)}
                >
                  <Plus size={16} />
                  {view === "claims"
                    ? t.newClaim
                    : view === "visits"
                      ? t.newVisit
                      : locale === "hi"
                        ? "नया रिकॉर्ड"
                        : "New record"}
                </button>
              )}
          </div>
          {demo && <div className="alert">{t.demo}</div>}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="alert success" role="status">
              {success}
            </div>
          )}
          {loading && <p role="status">{t.loading}</p>}
          {view === "overview" && (
            <>
              <section
                aria-labelledby="operations-heading"
                className="module-section"
              >
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">
                      {locale === "hi" ? "परिचालन" : "OPERATIONS"}
                    </div>
                    <h2 id="operations-heading">
                      {locale === "hi" ? "कार्यप्रवाह" : "Workflows"}
                    </h2>
                  </div>
                </div>
                <div className="module-grid">
                  {links
                    .filter((l) =>
                      [
                        "tickets",
                        "cht",
                        "movement",
                        "gci",
                        "campBudgets",
                        "catc",
                        "reports",
                        "funds",
                        "leave",
                        "visits",
                        "claims",
                      ].includes(l.id),
                    )
                    .map((l) => (
                      <Link
                        key={l.id}
                        className="module-card"
                        href={`/${locale}/workspace?view=${l.id}`}
                      >
                        <l.icon />
                        <span>{t[l.label]}</span>
                        <ArrowUpRight size={16} />
                      </Link>
                    ))}
                </div>
              </section>
              <div className="stats-grid">
                <div className="stat">
                  <span>
                    {locale === "hi"
                      ? "सुलभ संस्थान"
                      : "Accessible institutions"}
                  </span>
                  <strong>{user.institutions.length}</strong>
                  <small>
                    {locale === "hi"
                      ? "आपके सक्रिय दायरे में"
                      : "Within your active scope"}
                  </small>
                </div>
                <div className="stat">
                  <span>{t.claims}</span>
                  <strong>{total}</strong>
                  <small>
                    {locale === "hi"
                      ? "केवल अधिकृत रिकॉर्ड"
                      : "Authorized records only"}
                  </small>
                </div>
                <div className="stat">
                  <span>
                    {locale === "hi" ? "सक्रिय भूमिकाएँ" : "Active roles"}
                  </span>
                  <strong>{user.roles.length}</strong>
                  <small>{user.roles.join(" · ")}</small>
                </div>
              </div>
              <div className="panel-grid">
                <section className="panel">
                  <h2>
                    {locale === "hi"
                      ? "कार्य शुरू करें"
                      : "Make your next move"}
                  </h2>
                  <p>
                    {locale === "hi"
                      ? "संस्थान भ्रमण दर्ज करें या समीक्षा के लिए दावा तैयार करें।"
                      : "Record an institution visit or prepare a claim for review."}
                  </p>
                  <div className="button-row">
                    <Link
                      className="button outline"
                      href={`/${locale}/dashboard/visits`}
                    >
                      {t.visits}
                      <ArrowUpRight size={16} />
                    </Link>
                    {!cadet && (
                      <Link
                        className="button navy"
                        href={`/${locale}/dashboard/bills/refreshment`}
                      >
                        {t.claims}
                        <ArrowUpRight size={16} />
                      </Link>
                    )}
                  </div>
                </section>
                <section className="panel">
                  <h2>
                    {locale === "hi"
                      ? "निजी से सार्वजनिक, समीक्षा के साथ"
                      : "Private to public, with review"}
                  </h2>
                  <p>
                    {locale === "hi"
                      ? "आंतरिक रिकॉर्ड स्वतः प्रकाशित नहीं होते। सार्वजनिक कहानी के लिए अलग अनुमति और समीक्षा आवश्यक है।"
                      : "Internal records are never published automatically. Public stories require a separate permission and review process."}
                  </p>
                  <div className="button-row">
                    <Link className="text-link" href={`/${locale}/content`}>
                      {t.content}
                      <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </section>
              </div>
              {!cadet && (
                <>
                  <h2 style={{ fontSize: 22, marginBottom: 20 }}>
                    {locale === "hi" ? "हाल के दावे" : "Recent claims"}
                  </h2>
                  {claimTable}
                </>
              )}
            </>
          )}
          {view === "claims" && (
            <>
              <div className="toolbar">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    navigate({
                      q: String(new FormData(e.currentTarget).get("q")),
                      page: "1",
                    });
                  }}
                  style={{ display: "flex", gap: 8 }}
                >
                  <input
                    name="q"
                    aria-label={t.search}
                    placeholder={t.search}
                    defaultValue={query}
                  />
                  <button className="button outline small">
                    {locale === "hi" ? "खोजें" : "Search"}
                  </button>
                </form>
                <select
                  aria-label="Filter by status"
                  value={state}
                  onChange={(e) =>
                    navigate({ state: e.target.value, page: "1" })
                  }
                >
                  <option value="">
                    {locale === "hi" ? "सभी स्थितियाँ" : "All statuses"}
                  </option>
                  {[
                    "DRAFT",
                    "SUBMITTED",
                    "UNDER_REVIEW",
                    "APPROVED",
                    "PARTIALLY_PAID",
                    "PAID",
                    "RETURNED",
                    "REJECTED",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {status(s)}
                    </option>
                  ))}
                </select>
                <a
                  download="claims.csv"
                  className="button outline small"
                  href="/api/private/export"
                >
                  <Download size={15} />
                  CSV
                </a>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={showKind}
                    onChange={(e) => setShowKind(e.target.checked)}
                  />
                  {locale === "hi" ? "प्रकार दिखाएँ" : "Show type"}
                </label>
              </div>
              {(query || state) && (
                <p>
                  {locale === "hi" ? "सक्रिय फ़िल्टर" : "Active filters"}:{" "}
                  {query} {state}
                </p>
              )}
              {claimTable}
            </>
          )}
          {[
            "tickets",
            "cht",
            "movement",
            "gci",
            "campBudgets",
            "catc",
            "reports",
            "funds",
            "leave",
            "cms",
            "cadets",
          ].includes(view) && (
            <section className="panel">
              <span className="badge">
                {locale === "hi" ? "विन्यास लंबित" : "SETUP PENDING"}
              </span>
              <h2>{t[view]}</h2>
              <p>
                {locale === "hi"
                  ? "इस कार्यप्रवाह के आधिकारिक फ़ील्ड, नियम और अनुमोदन चरण अभी निर्धारित नहीं हैं। स्क्रीन का संदर्भ उपलब्ध है; वास्तविक रिकॉर्ड और गणना सक्षम करने से पहले संस्थागत नीति आवश्यक है।"
                  : "The reference overview identifies this workflow, but its approved fields, rules and approval steps have not been defined for NCC DTE UP. This section remains unavailable until those contracts are reviewed."}
              </p>
              <p>
                {locale === "hi"
                  ? "कोई काल्पनिक रिकॉर्ड या गणना नहीं दिखाई जा रही है।"
                  : "No invented records or totals are shown."}
              </p>
            </section>
          )}
          {view === "profile" && (
            <section className="panel">
              <h2>{user.name}</h2>
              <p>
                {t.secure} · {user.roles.join(", ")}
              </p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate("profile", {
                    inApp: new FormData(e.currentTarget).get("inApp") === "on",
                  });
                }}
              >
                <label className="check-label">
                  <input type="checkbox" name="inApp" defaultChecked />
                  {locale === "hi" ? "इन-ऐप सूचनाएँ" : "In-app notifications"}
                </label>
                <button className="button navy" disabled={busy}>
                  {t.save}
                </button>
              </form>
              <div className="button-row">
                <button
                  className="button outline"
                  onClick={() => setDialog("mfa")}
                >
                  {locale === "hi"
                    ? "दो-कारक प्रमाणीकरण सेट करें"
                    : "Set up two-factor authentication"}
                </button>
              </div>
            </section>
          )}
          {!["overview", "claims", "profile"].includes(view) && (
            <div className="record-list">
              {records.map((r) => (
                <article className="record" key={r.id}>
                  <div className="meta">
                    <span>
                      {r.status
                        ? status(r.status)
                        : (r.kind ?? r.action ?? view)}
                    </span>
                    <span>
                      {r.createdAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeZone: "Asia/Kolkata",
                          }).format(new Date(r.createdAt))
                        : ""}
                    </span>
                  </div>
                  <h3>
                    {r.revisions?.[0]?.title ??
                      r.title ??
                      r.name ??
                      r.message ??
                      r.action ??
                      r.id}
                  </h3>
                  <p>
                    {r.revisions?.[0]?.summary ??
                      r.notes ??
                      r.body ??
                      (r.ratePaise ? money(r.ratePaise) : (r.resourceId ?? ""))}
                  </p>
                  {r.synthetic && (
                    <div className="alert">{t.policyWarning}</div>
                  )}
                  {r.assignments && (
                    <p>
                      {r.assignments.map((a) => a.role).join(", ")} ·{" "}
                      {r.active ? "Active" : "Inactive"}
                    </p>
                  )}
                  <div className="row-actions">
                    {["visits", "publications"].includes(view) && (
                      <button onClick={() => action("attachments", r)}>
                        Files
                      </button>
                    )}
                    {view === "visits" && r.status === "DRAFT" && (
                      <button
                        onClick={() =>
                          void mutate("visits/submit", {
                            id: r.id,
                            version: r.version,
                          })
                        }
                      >
                        {t.submit}
                      </button>
                    )}
                    {view === "publications" && (
                      <>
                        {["DRAFT", "RETURNED"].includes(r.status ?? "") && (
                          <>
                            <button onClick={() => action("pub-SUBMIT", r)}>
                              {t.submit}
                            </button>
                            {reviewer && (
                              <button onClick={() => action("consent", r)}>
                                {locale === "hi"
                                  ? "अनुमति दर्ज करें"
                                  : "Record permission"}
                              </button>
                            )}
                          </>
                        )}
                        {r.status === "SUBMITTED" && reviewer && (
                          <>
                            <button onClick={() => action("pub-APPROVE", r)}>
                              {t.approve}
                            </button>
                            <button onClick={() => action("pub-RETURN", r)}>
                              {t.return}
                            </button>
                            <button onClick={() => action("pub-REJECT", r)}>
                              {t.reject}
                            </button>
                          </>
                        )}
                        {user.capabilities.includes("publish") && (
                          <>
                            {r.status === "APPROVED" && (
                              <button onClick={() => action("pub-PUBLISH", r)}>
                                {t.publish}
                              </button>
                            )}
                            {["PUBLISHED", "ARCHIVED", "APPROVED"].includes(
                              r.status ?? "",
                            ) && (
                              <button onClick={() => action("pub-WITHDRAW", r)}>
                                {t.withdraw}
                              </button>
                            )}
                            {r.status === "PUBLISHED" && (
                              <button onClick={() => action("pub-ARCHIVE", r)}>
                                {t.archive}
                              </button>
                            )}
                          </>
                        )}
                        {[
                          "PUBLISHED",
                          "ARCHIVED",
                          "REJECTED",
                          "RETURNED",
                        ].includes(r.status ?? "") && (
                          <button onClick={() => action("pub-REVISE", r)}>
                            {locale === "hi" ? "नया संशोधन" : "New revision"}
                          </button>
                        )}
                      </>
                    )}
                    {view === "users" && r.id !== user.id && r.active && (
                      <button onClick={() => action("revoke", r)}>
                        {locale === "hi" ? "पहुँच हटाएँ" : "Revoke access"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!records.length && !loading && (
                <div className="empty">{t.noRecords}</div>
              )}
            </div>
          )}
        </main>
      </div>
      {dialog && (
        <Dialog
          title={
            dialog.startsWith("new-")
              ? locale === "hi"
                ? "नया रिकॉर्ड"
                : "New record"
              : dialog === "details"
                ? locale === "hi"
                  ? "दावे का विवरण"
                  : "Claim details"
                : locale === "hi"
                  ? "समीक्षा एवं पुष्टि"
                  : "Review & confirm"
          }
          onClose={close}
        >
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          {dialog === "attachments" && target ? (
            <Attachments
              resourceId={target.id}
              resourceType={
                view === "claims"
                  ? "claim"
                  : view === "visits"
                    ? "visit"
                    : "publication"
              }
              institutionId={target.institutionId ?? ""}
              canPublish={
                view === "publications" && user.capabilities.includes("publish")
              }
            />
          ) : dialog.startsWith("new-") || dialog === "correct" ? (
            <CreateForm
              kind={dialog === "correct" ? "claims" : dialog.slice(4)}
              initialClaim={
                dialog === "correct" ? (target as Claim) : undefined
              }
              locale={locale}
              user={user}
              busy={busy}
              onCancel={close}
              onSubmit={(body) =>
                void mutate(
                  dialog === "correct" ? "claims/correct" : dialog.slice(4),
                  dialog === "correct"
                    ? {
                        ...(body as object),
                        id: target!.id,
                        version: target!.version,
                      }
                    : body,
                )
              }
            />
          ) : dialog === "mfa" ? (
            <MfaForm />
          ) : dialog === "details" && target && "payments" in target ? (
            <>
              <dl className="definition">
                <dt>ID</dt>
                <dd>{target.id}</dd>
                <dt>{t.status}</dt>
                <dd>{status(target.state)}</dd>
                <dt>{t.amount}</dt>
                <dd>{money(target.totalPaise)}</dd>
                <dt>Paid</dt>
                <dd>{money(target.paidPaise)}</dd>
              </dl>
              <h3 style={{ marginTop: 20 }}>Payment history</h3>
              {target.payments.map((p) => (
                <p key={p.id}>
                  {money(p.amountPaise)} · {p.reference}
                  {!p.reversalOf &&
                    BigInt(p.amountPaise) > 0n &&
                    user.capabilities.includes("payment") && (
                      <button
                        className="button outline small"
                        onClick={() => {
                          setDialog(`reverse:${p.id}:${p.amountPaise}`);
                        }}
                      >
                        Reverse
                      </button>
                    )}
                </p>
              ))}
              <button className="button outline" onClick={close}>
                {t.cancel}
              </button>
            </>
          ) : (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (!target) return;
                const f = new FormData(e.currentTarget);
                if (dialog === "payment" || dialog.startsWith("reverse:")) {
                  const parts = dialog.split(":");
                  void mutate("claims/payment", {
                    id: target.id,
                    version: target.version,
                    amountPaise: parts[2] ?? String(f.get("amountPaise")),
                    reference: String(f.get("reference")),
                    idempotencyKey: crypto.randomUUID(),
                    ...(parts[1] ? { reversalOf: parts[1] } : {}),
                  });
                } else if (dialog === "consent") {
                  void mutate("consents", {
                    publicationId: target.id,
                    guardianRequired: f.get("guardianRequired") === "on",
                    guardianConfirmed: f.get("guardianConfirmed") === "on",
                    permissionConfirmed: f.get("permissionConfirmed") === "on",
                    ...(f.get("evidenceAttachmentId")
                      ? {
                          evidenceAttachmentId: String(
                            f.get("evidenceAttachmentId"),
                          ),
                        }
                      : {}),
                  });
                } else if (dialog === "revoke")
                  void mutate("users/revoke", { userId: target.id });
                else if (dialog.startsWith("pub-"))
                  void mutate("publications/transition", {
                    id: target.id,
                    version: target.version,
                    action: dialog.slice(4),
                    ...(dialog === "pub-REVISE"
                      ? {
                          title: String(f.get("title")),
                          summary: String(f.get("summary")),
                        }
                      : {}),
                  });
                else
                  void mutate("claims/transition", {
                    id: target.id,
                    version: target.version,
                    action: dialog,
                    comment: String(f.get("comment") ?? ""),
                  });
              }}
            >
              <p>
                {locale === "hi"
                  ? "रिकॉर्ड की जाँच करें। पुष्टि होने पर यह कार्रवाई दर्ज होगी।"
                  : "Check the record before confirming. This action will be recorded in the audit history."}
              </p>
              <p className="mono">{target?.id}</p>
              {dialog === "payment" && (
                <>
                  <p>
                    Approved:{" "}
                    {"totalPaise" in (target ?? {})
                      ? money((target as Claim).totalPaise)
                      : ""}{" "}
                    · Paid:{" "}
                    {"paidPaise" in (target ?? {})
                      ? money((target as Claim).paidPaise)
                      : ""}
                  </p>
                  <label>
                    Amount in paise (₹1 = 100 paise)
                    <input
                      name="amountPaise"
                      inputMode="numeric"
                      pattern="[1-9][0-9]*"
                      required
                    />
                  </label>
                </>
              )}
              {(dialog === "payment" || dialog.startsWith("reverse:")) && (
                <label>
                  Payment reference / reversal reason
                  <input
                    name="reference"
                    minLength={3}
                    maxLength={100}
                    required
                  />
                </label>
              )}
              {["RETURN", "REJECT"].includes(dialog) && (
                <label>
                  Reason / कारण
                  <textarea name="comment" required maxLength={1000} />
                </label>
              )}
              {dialog === "consent" && (
                <>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      name="permissionConfirmed"
                      required
                    />
                    Permission documented / अनुमति दर्ज है
                  </label>
                  <label className="check-label">
                    <input type="checkbox" name="guardianRequired" />
                    Guardian consent required
                  </label>
                  <label className="check-label">
                    <input type="checkbox" name="guardianConfirmed" />
                    Guardian consent confirmed
                  </label>
                  <label>
                    Private evidence attachment ID
                    <input name="evidenceAttachmentId" required={!demo} />
                  </label>
                  <p>
                    Downloaded public images cannot be recalled from visitors’
                    devices.
                  </p>
                </>
              )}
              {dialog === "pub-REVISE" && (
                <>
                  <label>
                    Title
                    <input
                      name="title"
                      defaultValue={
                        (target as RecordData)?.revisions?.[0]?.title
                      }
                      required
                      minLength={3}
                    />
                  </label>
                  <label>
                    Summary
                    <textarea
                      name="summary"
                      defaultValue={
                        (target as RecordData)?.revisions?.[0]?.summary
                      }
                      required
                      minLength={10}
                    />
                  </label>
                </>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="button outline"
                  onClick={close}
                >
                  {t.cancel}
                </button>
                <button className="button navy" disabled={busy}>
                  {busy
                    ? t.loading
                    : locale === "hi"
                      ? "पुष्टि करें"
                      : "Confirm"}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
function CreateForm({
  kind,
  locale,
  user,
  busy,
  onSubmit,
  onCancel,
  initialClaim,
}: {
  kind: string;
  initialClaim?: Claim;
  locale: Locale;
  user: UserData;
  busy: boolean;
  onSubmit: (body: unknown) => void;
  onCancel: () => void;
}) {
  const t = messages[locale];
  const [claimKind, setClaimKind] = useState(
      initialClaim?.kind ?? "REFRESHMENT",
    ),
    [preview, setPreview] = useState(""),
    [previewError, setPreviewError] = useState("");
  const [input, setInput] = useState({
    institutionId:
      initialClaim?.institutionId ?? user.institutions[0]?.id ?? "",
    kind: initialClaim?.kind ?? "REFRESHMENT",
    category: initialClaim?.category ?? "DEMO",
    periodStart: initialClaim?.periodStart.slice(0, 10) ?? "",
    periodEnd: initialClaim?.periodEnd.slice(0, 10) ?? "",
    attendance: initialClaim?.attendance ?? 1,
    sessions: initialClaim?.sessions ?? 1,
    idempotencyKey: initialClaim?.idempotencyKey ?? crypto.randomUUID(),
  });
  useEffect(() => {
    if (kind !== "claims" || !input.periodStart || !input.periodEnd) return;
    let active = true;
    const timer = setTimeout(() => {
      api<{ totalPaise: string }>("claims/preview", input)
        .then((r) => {
          if (active) {
            setPreview(
              new Intl.NumberFormat(locale === "hi" ? "hi-IN" : "en-IN", {
                style: "currency",
                currency: "INR",
              }).format(Number(r.totalPaise) / 100),
            );
            setPreviewError("");
          }
        })
        .catch((e) => {
          if (active) {
            setPreview("");
            setPreviewError(e.message);
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [input, kind, locale]);
  return (
    <form
      className="form-stack"
      onChange={(e) => {
        if (kind === "claims") {
          const f = new FormData(e.currentTarget);
          setInput({
            ...input,
            institutionId: String(f.get("institutionId")),
            kind: String(f.get("kind")),
            category: String(f.get("category")),
            periodStart: String(f.get("periodStart")),
            periodEnd: String(f.get("periodEnd")),
            attendance: Number(f.get("attendance") ?? 1),
            sessions: Number(f.get("sessions") ?? 1),
          });
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "");
        if (kind === "claims") onSubmit(input);
        else if (kind === "visits")
          onSubmit({
            institutionId: s("institutionId"),
            title: s("title"),
            eventDate: s("eventDate"),
            notes: s("notes"),
          });
        else if (kind === "discussions")
          onSubmit({ institutionId: s("institutionId"), body: s("body") });
        else if (kind === "publications")
          onSubmit({
            institutionId: s("institutionId"),
            slug: s("slug"),
            category: s("category"),
            title: s("title"),
            summary: s("summary"),
            locale,
            institutionDisplayName:
              user.institutions.find((i) => i.id === s("institutionId"))
                ?.name ?? "",
            district:
              user.institutions.find((i) => i.id === s("institutionId"))
                ?.district ?? "",
            eventDate: s("eventDate"),
            publishAt: new Date(s("publishAt")).toISOString(),
            ...(s("expiresAt")
              ? { expiresAt: new Date(s("expiresAt")).toISOString() }
              : {}),
          });
        else if (kind === "notices")
          onSubmit({
            institutionId: s("institutionId"),
            title: s("title"),
            body: s("body"),
            locale,
            publishAt: new Date(s("publishAt")).toISOString(),
            expiresAt: new Date(s("expiresAt")).toISOString(),
          });
        else if (kind === "policies")
          onSubmit({
            name: s("name"),
            version: Number(s("version")),
            kind: s("kind"),
            category: s("category"),
            effectiveFrom: s("effectiveFrom"),
            effectiveTo: s("effectiveTo"),
            ratePaise: s("ratePaise"),
            capPaise: s("capPaise"),
            partialMonthRule: "ACTUAL_DAYS_HALF_UP_DAILY",
            approved: f.get("approved") === "on",
            synthetic: f.get("synthetic") === "on",
          });
      }}
    >
      <div className="form-grid">
        {kind !== "policies" && (
          <label className="full-width">
            {locale === "hi" ? "संस्थान" : "Institution"}
            <select
              name="institutionId"
              required
              defaultValue={initialClaim?.institutionId}
            >
              {user.institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {["claims", "policies"].includes(kind) && (
          <>
            <label>
              {locale === "hi" ? "दावे का प्रकार" : "Claim type"}
              <select
                name="kind"
                value={claimKind}
                onChange={(e) => setClaimKind(e.target.value)}
              >
                <option value="REFRESHMENT">
                  {locale === "hi" ? "जलपान" : "Refreshment"}
                </option>
                <option value="HONORARIUM">
                  {locale === "hi" ? "मानदेय" : "Honorarium"}
                </option>
              </select>
            </label>
            <label>
              {locale === "hi" ? "नीति श्रेणी" : "Policy category"}
              <input
                name="category"
                defaultValue={initialClaim?.category ?? "DEMO"}
                required
                maxLength={60}
              />
            </label>
          </>
        )}
        {kind === "claims" && (
          <>
            <label>
              {locale === "hi" ? "प्रारंभ दिनांक" : "Period start"}
              <input
                name="periodStart"
                type="date"
                defaultValue={initialClaim?.periodStart.slice(0, 10)}
                required
              />
            </label>
            <label>
              {locale === "hi" ? "अंतिम दिनांक" : "Period end"}
              <input
                name="periodEnd"
                type="date"
                defaultValue={initialClaim?.periodEnd.slice(0, 10)}
                required
              />
            </label>
            <label>
              {locale === "hi" ? "पात्र उपस्थिति" : "Eligible attendance"}
              <input
                name="attendance"
                type="number"
                min={1}
                max={1000}
                defaultValue={1}
                required
              />
            </label>
            <label>
              {locale === "hi" ? "सत्र" : "Sessions"}
              <input
                name="sessions"
                type="number"
                min={1}
                max={100}
                defaultValue={1}
                required
              />
            </label>
            <div className="alert full-width">
              {t.policyWarning}
              <p>
                {locale === "hi" ? "सर्वर द्वारा गणना" : "Server calculation"}:{" "}
                {preview || "—"}
              </p>
              <p role="status">{previewError}</p>
              {claimKind === "REFRESHMENT" && (
                <p>
                  {locale === "hi"
                    ? "जलपान के लिए एक ही कार्यक्रम दिनांक चुनें।"
                    : "Choose the same start and end date for refreshment claims."}
                </p>
              )}
            </div>
          </>
        )}
        {["visits", "publications", "notices"].includes(kind) && (
          <label className="full-width">
            {locale === "hi" ? "शीर्षक" : "Title"}
            <input name="title" required minLength={3} maxLength={160} />
          </label>
        )}
        {["visits", "publications"].includes(kind) && (
          <label>
            {locale === "hi" ? "कार्यक्रम दिनांक" : "Event date"}
            <input type="date" name="eventDate" required />
          </label>
        )}
        {kind === "visits" && (
          <label className="full-width">
            {locale === "hi" ? "निजी नोट्स" : "Private notes"}
            <textarea name="notes" maxLength={5000} />
          </label>
        )}
        {kind === "publications" && (
          <>
            <label>
              Category
              <select name="category">
                <option value="VISIT">{t.visit}</option>
                <option value="ACHIEVEMENT">{t.achievement}</option>
                <option value="ACTIVITY">{t.activity}</option>
                <option value="GALLERY">{t.gallery}</option>
                <option value="NOTICE">{t.notices}</option>
              </select>
            </label>
            <label className="full-width">
              URL slug
              <input name="slug" pattern="[a-z0-9-]{3,100}" required />
            </label>
            <label className="full-width">
              {locale === "hi" ? "सार्वजनिक सारांश" : "Public summary"}
              <textarea
                name="summary"
                required
                minLength={10}
                maxLength={5000}
              />
            </label>
            <div className="alert full-width">
              {locale === "hi"
                ? "निजी संपर्क, नाम, बिल विवरण या आंतरिक टिप्पणियाँ शामिल न करें।"
                : "Do not include private contacts, unapproved names, bill details or internal comments."}
            </div>
          </>
        )}
        {["publications", "notices"].includes(kind) && (
          <>
            <label>
              {locale === "hi" ? "प्रकाशन समय" : "Publish at (your local time)"}
              <input type="datetime-local" name="publishAt" required />
            </label>
            <label>
              {locale === "hi" ? "समाप्ति समय" : "Expires at"}
              <input
                type="datetime-local"
                name="expiresAt"
                required={kind === "notices"}
              />
            </label>
          </>
        )}
        {["discussions", "notices"].includes(kind) && (
          <label className="full-width">
            {locale === "hi" ? "संदेश" : "Message"}
            <textarea
              name="body"
              required
              minLength={3}
              maxLength={kind === "discussions" ? 2000 : 5000}
            />
          </label>
        )}
        {kind === "policies" && (
          <>
            <label className="full-width">
              Policy name
              <input name="name" required minLength={3} />
            </label>
            <label>
              Version
              <input name="version" type="number" min={1} required />
            </label>
            <label>
              Rate in paise
              <input name="ratePaise" pattern="[1-9][0-9]*" required />
            </label>
            <label>
              Cap in paise
              <input name="capPaise" pattern="[1-9][0-9]*" required />
            </label>
            <label>
              Effective from
              <input name="effectiveFrom" type="date" required />
            </label>
            <label>
              Effective to
              <input name="effectiveTo" type="date" required />
            </label>
            <label className="check-label">
              <input name="approved" type="checkbox" />
              Approved policy
            </label>
            <label className="check-label">
              <input name="synthetic" type="checkbox" defaultChecked />
              Development fixture
            </label>
            <p className="full-width">
              Monthly amounts use actual calendar days with daily half-up
              rounding. This rule must be explicitly approved before production
              use.
            </p>
          </>
        )}
      </div>
      <div className="dialog-actions">
        <button type="button" className="button outline" onClick={onCancel}>
          {t.cancel}
        </button>
        <button className="button navy" disabled={busy}>
          {busy ? t.loading : t.save}
        </button>
      </div>
    </form>
  );
}
export function MfaForm() {
  const [uri, setUri] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [message, setMessage] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (!uri) {
          const r = await authClient.twoFactor.enable({
            password: String(f.get("password")),
          });
          if (r.error) setMessage(r.error.message ?? "Could not enable MFA.");
          else if (r.data?.method === "totp") {
            setUri(r.data.totpURI);
            setCodes(r.data.backupCodes);
          }
        } else {
          const r = await authClient.twoFactor.verifyTotp({
            code: String(f.get("code")),
          });
          setMessage(
            r.error?.message ??
              "Two-factor authentication enabled. Store backup codes privately.",
          );
        }
      }}
    >
      {!uri ? (
        <label>
          Current password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
      ) : (
        <>
          <p>Import this URI into your authenticator. Keep it private.</p>
          <code className="mono">{uri}</code>
          <p>Backup codes: {codes.join(" · ")}</p>
          <label>
            Authenticator code
            <input
              name="code"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6}"
            />
          </label>
        </>
      )}
      <p role="status">{message}</p>
      <button className="button navy">
        {uri ? "Verify code" : "Enable authenticator"}
      </button>
    </form>
  );
}
