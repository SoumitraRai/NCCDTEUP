"use client";
import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/localization/messages";
const text = {
  en: { title: "Set your password", password: "New password", hint: "At least 12 characters.", submit: "Set password", busy: "Saving…", doneTitle: "Password set", done: "Sign in with your email and this password.", signIn: "Go to sign in", missing: "This link is incomplete. Open the full link from the email.", failed: "The password could not be set. Try again." },
  hi: { title: "अपना पासवर्ड सेट करें", password: "नया पासवर्ड", hint: "कम से कम 12 अक्षर।", submit: "पासवर्ड सेट करें", busy: "सहेजा जा रहा है…", doneTitle: "पासवर्ड सेट हुआ", done: "अपने ईमेल और इस पासवर्ड से साइन इन करें।", signIn: "साइन इन पर जाएँ", missing: "यह लिंक अधूरा है। ईमेल से पूरा लिंक खोलें।", failed: "पासवर्ड सेट नहीं हो सका। फिर प्रयास करें।" },
};
export function SetPassword({ locale, token }: { locale: Locale; token: string }) {
  const t = text[locale];
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : t.missing);
  if (done)
    return (
      <div className="auth-wrap">
        <h1>{t.doneTitle}</h1>
        <div role="status" className="alert">{t.done}</div>
        <Link className="button navy" href={`/${locale}/login`}>{t.signIn}</Link>
      </div>
    );
  return (
    <div className="auth-wrap">
      <h1>{t.title}</h1>
      {error && <div role="alert" className="alert error">{error}</div>}
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/public/password-setup", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-sampark-locale": locale },
              body: JSON.stringify({ token, password: new FormData(e.currentTarget).get("password") }),
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              throw new Error(d.issues?.[0]?.message ?? d.error ?? t.failed);
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
          {t.password}
          <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="sp-hint" />
          <small id="sp-hint">{t.hint}</small>
        </label>
        <button className="button navy" disabled={!token || busy}>{busy ? t.busy : t.submit}</button>
      </form>
    </div>
  );
}
