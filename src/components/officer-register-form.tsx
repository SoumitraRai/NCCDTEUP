"use client";
import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/localization/messages";
type Option = { id: string; name: string };
type Post = { code: string; title: string; level: string };
const text = {
  en: {
    eyebrow: "Officers",
    title: "Officer registration",
    intro: "For officers at a unit, a group or the directorate. Your request is approved by the level above you, or by an officer your head has asked to approve registrations.",
    name: "Full name, with rank",
    email: "Email address",
    password: "Password",
    passwordHint: "At least 12 characters. You will use it to sign in once your account is approved.",
    post: "Post",
    choosePost: "Choose your post",
    levels: { UNIT: "Unit", GROUP: "Group", DIRECTORATE: "Directorate" } as Record<string, string>,
    formation: { UNIT: "Unit", GROUP: "Group", DIRECTORATE: "Directorate" } as Record<string, string>,
    chooseFormation: "Choose where you are posted",
    note: "Note for the approving officer (optional)",
    noteHint: "For example, your personal number or date of joining this post.",
    submit: "Send request",
    sending: "Sending…",
    doneTitle: "Request received",
    done: "If this email does not already have an account, we have sent it a link. Open it within 24 hours to confirm the address; the approving officer then reviews your request. Once approved, sign in with the password you chose.",
    doneDirect: "The approving officer will review your request. Once approved, sign in with the password you chose.",
    signIn: "Go to sign in",
    have: "Already have an account?",
    member: "Cadet, ANO or CTO? Use the other registration page.",
    failed: "The request could not be sent. Try again.",
  },
  hi: {
    eyebrow: "अधिकारी",
    title: "अधिकारी पंजीकरण",
    intro: "यूनिट, ग्रुप या निदेशालय में तैनात अधिकारियों के लिए। आपका अनुरोध आपसे ऊपर के स्तर द्वारा, या उस अधिकारी द्वारा स्वीकृत होता है जिसे आपके प्रमुख ने पंजीकरण स्वीकृत करने का कार्य दिया है।",
    name: "पूरा नाम, रैंक सहित",
    email: "ईमेल पता",
    password: "पासवर्ड",
    passwordHint: "कम से कम 12 अक्षर। खाता स्वीकृत होने पर इसी से साइन इन करेंगे।",
    post: "पद",
    choosePost: "अपना पद चुनें",
    levels: { UNIT: "यूनिट", GROUP: "ग्रुप", DIRECTORATE: "निदेशालय" } as Record<string, string>,
    formation: { UNIT: "यूनिट", GROUP: "ग्रुप", DIRECTORATE: "निदेशालय" } as Record<string, string>,
    chooseFormation: "चुनें कि आप कहाँ तैनात हैं",
    note: "स्वीकृति देने वाले अधिकारी के लिए टिप्पणी (वैकल्पिक)",
    noteHint: "जैसे आपका पर्सनल नंबर या इस पद पर जुड़ने की तारीख।",
    submit: "अनुरोध भेजें",
    sending: "भेजा जा रहा है…",
    doneTitle: "अनुरोध प्राप्त हुआ",
    done: "यदि इस ईमेल का पहले से खाता नहीं है, तो हमने उस पर एक लिंक भेजा है। पता पुष्टि करने के लिए उसे 24 घंटे में खोलें; इसके बाद स्वीकृति देने वाले अधिकारी अनुरोध की समीक्षा करेंगे। स्वीकृति के बाद अपने चुने पासवर्ड से साइन इन करें।",
    doneDirect: "स्वीकृति देने वाले अधिकारी आपके अनुरोध की समीक्षा करेंगे। स्वीकृति के बाद अपने चुने पासवर्ड से साइन इन करें।",
    signIn: "साइन इन पर जाएँ",
    have: "पहले से खाता है?",
    member: "कैडेट, ANO या CTO? दूसरे पंजीकरण पेज का उपयोग करें।",
    failed: "अनुरोध नहीं भेजा जा सका। फिर प्रयास करें।",
  },
};
export function OfficerRegisterForm({ locale, posts, formations, confirm }: { locale: Locale; posts: Post[]; formations: Record<string, Option[]>; confirm: boolean }) {
  const t = text[locale];
  const [post, setPost] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const level = posts.find((p) => p.code === post)?.level ?? "";
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
            const res = await fetch("/api/public/officer-registrations", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-sampark-locale": locale },
              body: JSON.stringify({ name: f.get("name"), email: f.get("email"), password: f.get("password"), appointmentCode: post, formationId: f.get("formationId"), note: f.get("note") }),
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
          <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="opw-hint" />
          <small id="opw-hint">{t.passwordHint}</small>
        </label>
        <label>
          {t.post}
          <select name="appointmentCode" required value={post} onChange={(e) => setPost(e.target.value)}>
            <option value="" disabled>{t.choosePost}</option>
            {["UNIT", "GROUP", "DIRECTORATE"].map((l) => (
              <optgroup key={l} label={t.levels[l]}>
                {posts.filter((p) => p.level === l).map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {level && (
          <label>
            {t.formation[level]}
            <select key={level} name="formationId" required defaultValue="">
              <option value="" disabled>{t.chooseFormation}</option>
              {(formations[level] ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        <label>
          {t.note}
          <textarea name="note" rows={2} maxLength={300} aria-describedby="onote-hint" />
          <small id="onote-hint">{t.noteHint}</small>
        </label>
        <button disabled={busy} className="button navy">{busy ? t.sending : t.submit}</button>
      </form>
      <p style={{ marginTop: 20 }}>
        {t.have} <Link href={`/${locale}/login`}>{t.signIn}</Link>
      </p>
      <p>
        <Link href={`/${locale}/register`}>{t.member}</Link>
      </p>
    </div>
  );
}
