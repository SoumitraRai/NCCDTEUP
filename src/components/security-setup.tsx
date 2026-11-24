"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { renderSVG } from "uqr";
import { authClient } from "@/lib/auth-client";
import type { Locale } from "@/lib/localization/messages";
const text = {
  en: {
    title: "Set up your authenticator",
    intro: "Optional: add a second step at sign-in, a six-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar). If you lose the phone, you will need a backup code to sign in.",
    on: "Your authenticator is set up. You will be asked for a code each time you sign in.",
    continue: "Continue to the dashboard",
    step1: "Confirm your password",
    password: "Current password",
    next: "Continue",
    step2: "Scan this code with your authenticator app",
    manual: "Can't scan? Enter this key in the app instead:",
    code: "Six-digit code from the app",
    verify: "Confirm code",
    step3: "Save your backup codes",
    backupHint: "Each code signs you in once if you lose your phone. Keep them somewhere safe and private; they are shown only now.",
    download: "Download codes",
    busy: "Please wait…",
    failed: "That did not work. Check and try again.",
    stepOf: (n: number) => `Step ${n} of 3`,
  },
  hi: {
    title: "अपना ऑथेंटिकेटर सेट करें",
    intro: "वैकल्पिक: साइन इन पर एक दूसरा चरण जोड़ें, आपके फ़ोन के ऑथेंटिकेटर ऐप (Google Authenticator, Microsoft Authenticator या ऐसा कोई) से छह अंकों का कोड। फ़ोन खो जाने पर साइन इन के लिए बैकअप कोड चाहिए होगा।",
    on: "आपका ऑथेंटिकेटर सेट है। हर बार साइन इन पर आपसे कोड माँगा जाएगा।",
    continue: "डैशबोर्ड पर जाएँ",
    step1: "अपने पासवर्ड की पुष्टि करें",
    password: "वर्तमान पासवर्ड",
    next: "आगे",
    step2: "इस कोड को अपने ऑथेंटिकेटर ऐप से स्कैन करें",
    manual: "स्कैन नहीं हो रहा? ऐप में यह कुंजी डालें:",
    code: "ऐप से छह अंकों का कोड",
    verify: "कोड की पुष्टि करें",
    step3: "अपने बैकअप कोड सहेजें",
    backupHint: "फ़ोन खो जाने पर हर कोड से एक बार साइन इन हो सकता है। इन्हें सुरक्षित और निजी जगह रखें; ये केवल अभी दिखाए जा रहे हैं।",
    download: "कोड डाउनलोड करें",
    busy: "कृपया प्रतीक्षा करें…",
    failed: "यह नहीं हुआ। जाँचकर फिर प्रयास करें।",
    stepOf: (n: number) => `चरण ${n} / 3`,
  },
};
export function SecuritySetup({ locale, enabled }: { locale: Locale; enabled: boolean }) {
  const t = text[locale];
  const [step, setStep] = useState<1 | 2 | 3 | "on">(enabled ? "on" : 1);
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The QR code is drawn locally from the otpauth URI; nothing leaves the page.
  const qr = useMemo(() => (uri ? renderSVG(uri, { border: 2 }) : ""), [uri]);
  const secret = useMemo(() => (uri ? (new URL(uri).searchParams.get("secret") ?? "") : ""), [uri]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  };
  const done = (
    <Link className="button navy" href={`/${locale}/dashboard`}>
      {t.continue}
    </Link>
  );
  return (
    <div className="auth-wrap">
      <h1>{t.title}</h1>
      {step === "on" ? (
        <>
          <div role="status" className="alert">{t.on}</div>
          {done}
        </>
      ) : (
        <>
          <p>{t.intro}</p>
          <p className="eyebrow" aria-live="polite">{t.stepOf(step)}</p>
          {error && <div role="alert" className="alert error">{error}</div>}
          {step === 1 && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const password = String(new FormData(e.currentTarget).get("password"));
                run(async () => {
                  const r = await authClient.twoFactor.enable({ password });
                  if (r.error || !r.data || r.data.method !== "totp") throw new Error(r.error?.message ?? "");
                  setUri(r.data.totpURI);
                  setCodes(r.data.backupCodes);
                  setStep(2);
                });
              }}
            >
              <h2>{t.step1}</h2>
              <label>
                {t.password}
                <input type="password" name="password" autoComplete="current-password" required minLength={12} />
              </label>
              <button className="button navy" disabled={busy}>{busy ? t.busy : t.next}</button>
            </form>
          )}
          {step === 2 && (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const code = String(new FormData(e.currentTarget).get("code"));
                run(async () => {
                  const r = await authClient.twoFactor.verifyTotp({ code });
                  if (r.error) throw new Error(r.error.message ?? "");
                  setStep(3);
                });
              }}
            >
              <h2>{t.step2}</h2>
              {/* SVG generated by uqr from our own otpauth URI. */}
              <div role="img" aria-label={t.step2} style={{ width: 200, height: 200, background: "#fff", borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: qr }} />
              <p>
                {t.manual}
                <br />
                <code style={{ wordBreak: "break-all", fontSize: 15, letterSpacing: 1 }}>{secret.match(/.{1,4}/g)?.join(" ")}</code>
              </p>
              <label>
                {t.code}
                <input name="code" autoComplete="one-time-code" inputMode="numeric" required pattern="[0-9]{6}" maxLength={6} />
              </label>
              <button className="button navy" disabled={busy}>{busy ? t.busy : t.verify}</button>
            </form>
          )}
          {step === 3 && (
            <div className="form-stack">
              <h2>{t.step3}</h2>
              <p>{t.backupHint}</p>
              <ul style={{ columns: 2, fontFamily: "monospace", fontSize: 15, listStyle: "none", padding: 0 }}>
                {codes.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <button
                type="button"
                className="button"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([`Sampark backup codes\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
                  a.download = "sampark-backup-codes.txt";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                {t.download}
              </button>
              {done}
            </div>
          )}
        </>
      )}
    </div>
  );
}
