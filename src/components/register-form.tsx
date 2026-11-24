"use client";
import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/localization/messages";
const text = {
  en: {
    eyebrow: "Request an account",
    title: "Register for Sampark",
    intro: "Cadets, ANOs and CTOs can ask for an account. An officer of your unit checks the request before you can sign in.",
    name: "Full name",
    email: "Email address",
    password: "Password",
    passwordHint: "At least 12 characters. You will use it to sign in once your account is approved.",
    role: "I am registering as",
    roles: { CADET: "Cadet", ANO: "Associate NCC Officer (ANO)", CTO: "Caretaker Officer (CTO)" },
    institution: "Institution",
    choose: "Choose your institution",
    note: "Note for the approving officer (optional)",
    noteHint: "For example, your enrolment number or year of joining.",
    submit: "Send request",
    sending: "Sending…",
    doneTitle: "Request received",
    done: "If this email does not already have an account, we have sent it a link. Open it within 24 hours to confirm the address; an officer of your unit then reviews the request. You can sign in with the password you chose once it is approved.",
    doneDirect: "An officer of your unit will review your request. You can sign in with the password you chose once it is approved.",
    signIn: "Go to sign in",
    have: "Already have an account?",
    failed: "The request could not be sent. Try again.",
    staff: "Officers at a unit, group or the directorate register on the officer page.",
    officer: "Officer at a unit, group or the directorate? Register here",
  },
  hi: {
    eyebrow: "खाते के लिए अनुरोध",
    title: "सम्पर्क पर पंजीकरण",
    intro: "कैडेट, ANO और CTO खाते के लिए अनुरोध कर सकते हैं। साइन इन से पहले आपकी यूनिट के अधिकारी अनुरोध की जाँच करते हैं।",
    name: "पूरा नाम",
    email: "ईमेल पता",
    password: "पासवर्ड",
    passwordHint: "कम से कम 12 अक्षर। खाता स्वीकृत होने पर इसी से साइन इन करेंगे।",
    role: "मैं इस रूप में पंजीकरण कर रहा/रही हूँ",
    roles: { CADET: "कैडेट", ANO: "एसोसिएट एनसीसी ऑफिसर (ANO)", CTO: "केयरटेकर ऑफिसर (CTO)" },
    institution: "संस्थान",
    choose: "अपना संस्थान चुनें",
    note: "स्वीकृति देने वाले अधिकारी के लिए टिप्पणी (वैकल्पिक)",
    noteHint: "जैसे आपका नामांकन नंबर या जुड़ने का वर्ष।",
    submit: "अनुरोध भेजें",
    sending: "भेजा जा रहा है…",
    doneTitle: "अनुरोध प्राप्त हुआ",
    done: "यदि इस ईमेल का पहले से खाता नहीं है, तो हमने उस पर एक लिंक भेजा है। पता पुष्टि करने के लिए उसे 24 घंटे में खोलें; इसके बाद आपकी यूनिट के अधिकारी अनुरोध की समीक्षा करेंगे। स्वीकृति के बाद आप अपने चुने पासवर्ड से साइन इन कर सकेंगे।",
    doneDirect: "आपकी यूनिट के अधिकारी आपके अनुरोध की समीक्षा करेंगे। स्वीकृति के बाद आप अपने चुने पासवर्ड से साइन इन कर सकेंगे।",
    signIn: "साइन इन पर जाएँ",
    have: "पहले से खाता है?",
    failed: "अनुरोध नहीं भेजा जा सका। फिर प्रयास करें।",
    staff: "यूनिट, ग्रुप या निदेशालय के अधिकारी अधिकारी पेज पर पंजीकरण करते हैं।",
    officer: "यूनिट, ग्रुप या निदेशालय के अधिकारी? यहाँ पंजीकरण करें",
  },
};
export function RegisterForm({ locale, institutions, confirm }: { locale: Locale; institutions: { id: string; name: string; district: string }[]; confirm: boolean }) {
  const t = text[locale];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="auth-wrap">
        <h1>{t.doneTitle}</h1>
        <div role="status" className="alert">{confirm ? t.done : t.doneDirect}</div>
        <Link className="button navy" href={`/${locale}/login`}>{t.signIn}</Link>
      </div>
    );
  return (
    <div className="auth-wrap">
      <div className="eyebrow">{t.eyebrow}</div>
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
      {error && <div role="alert" className="alert error">{error}</div>}
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const res = await fetch("/api/public/registrations", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-sampark-locale": locale },
              body: JSON.stringify({
                name: f.get("name"),
                email: f.get("email"),
                password: f.get("password"),
                role: f.get("role"),
                institutionId: f.get("institutionId"),
                note: f.get("note"),
              }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.issues?.[0]?.message ?? data.error ?? t.failed);
            }
            setDone(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : t.failed);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t.name}
          <input name="name" autoComplete="name" required minLength={2} maxLength={100} />
        </label>
        <label>
          {t.email}
          <input name="email" type="email" autoComplete="email" required maxLength={200} />
        </label>
        <label>
          {t.password}
          <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="pw-hint" />
          <small id="pw-hint">{t.passwordHint}</small>
        </label>
        <label>
          {t.role}
          <select name="role" defaultValue="CADET">
            {(["CADET", "ANO", "CTO"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
          </select>
          <small>{t.staff}</small>
        </label>
        <label>
          {t.institution}
          <select name="institutionId" required defaultValue="">
            <option value="" disabled>{t.choose}</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}, {i.district}</option>)}
          </select>
        </label>
        <label>
          {t.note}
          <textarea name="note" rows={2} maxLength={300} aria-describedby="note-hint" />
          <small id="note-hint">{t.noteHint}</small>
        </label>
        <button disabled={busy} className="button navy">{busy ? t.sending : t.submit}</button>
      </form>
      <p style={{ marginTop: 20 }}>
        {t.have} <Link href={`/${locale}/login`}>{t.signIn}</Link>
      </p>
      <p>
        <Link href={`/${locale}/officers/register`}>{t.officer}</Link>
      </p>
    </div>
  );
}
