"use client";
import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/localization/messages";
const text = {
  en: {
    title: "Confirm your email",
    intro: "Press the button to confirm this address for your Sampark registration.",
    button: "Confirm email",
    busy: "Confirming…",
    doneTitle: "Email confirmed",
    done: "Thank you. An officer of your unit will now review your request. You can sign in with the password you chose once it is approved.",
    missing: "This link is incomplete. Open the full link from the email.",
    failed: "The email could not be confirmed. Try again.",
    signIn: "Go to sign in",
  },
  hi: {
    title: "अपना ईमेल पुष्टि करें",
    intro: "सम्पर्क पंजीकरण के लिए इस पते की पुष्टि करने हेतु बटन दबाएँ।",
    button: "ईमेल की पुष्टि करें",
    busy: "पुष्टि हो रही है…",
    doneTitle: "ईमेल की पुष्टि हुई",
    done: "धन्यवाद। अब आपकी यूनिट के अधिकारी आपके अनुरोध की समीक्षा करेंगे। स्वीकृति के बाद आप अपने चुने पासवर्ड से साइन इन कर सकेंगे।",
    missing: "यह लिंक अधूरा है। ईमेल से पूरा लिंक खोलें।",
    failed: "ईमेल की पुष्टि नहीं हो सकी। फिर प्रयास करें।",
    signIn: "साइन इन पर जाएँ",
  },
};
export function VerifyEmail({ locale, token }: { locale: Locale; token: string }) {
  const t = text[locale];
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState(token ? "" : t.missing);
  if (state === "done")
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
      <p>{t.intro}</p>
      {error && <div role="alert" className="alert error">{error}</div>}
      <button
        className="button navy"
        disabled={!token || state === "busy"}
        onClick={async () => {
          setState("busy");
          setError("");
          try {
            const res = await fetch("/api/public/registrations/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-sampark-locale": locale },
              body: JSON.stringify({ token }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.failed);
            setState("done");
          } catch (e) {
            setError(e instanceof Error ? e.message : t.failed);
            setState("idle");
          }
        }}
      >
        {state === "busy" ? t.busy : t.button}
      </button>
    </div>
  );
}
