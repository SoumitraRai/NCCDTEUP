"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { messages, type Locale } from "@/lib/localization/messages";
// One sign-in page for everyone: email and password. Accounts that have an
// authenticator (optional) are then asked for its code. If REQUIRE_TWO_FACTOR
// is on, officers without one are sent to set it up.
export function LoginForm({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const enter = async () => {
    const me = await fetch("/api/private/me");
    if (me.status === 403 && /two-factor|दो-चरणीय/.test((await me.json().catch(() => ({}))).error ?? "")) return router.push(`/${locale}/security`);
    router.push(`/${locale}/dashboard`);
    router.refresh();
  };
  return (
    <div className="auth-wrap">
      <h1>{t.login}</h1>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            if (mfa) {
              const result = await authClient.twoFactor.verifyTotp({ code: String(f.get("code")) });
              if (result.error) throw new Error(result.error.message);
              await enter();
            } else {
              const result = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
              if (result.error) throw new Error(result.error.message);
              if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) setMfa(true);
              else await enter();
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : t.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mfa ? (
          <label>
            {t.code}
            <input name="code" autoComplete="one-time-code" inputMode="numeric" required pattern="[0-9]{6}" />
          </label>
        ) : (
          <>
            <label>
              {t.email}
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              {t.password}
              <input name="password" type="password" autoComplete="current-password" required minLength={12} />
            </label>
          </>
        )}
        <button disabled={busy} className="button navy">
          {busy ? t.loading : t.signIn}
        </button>
      </form>
      <p style={{ marginTop: 20 }}>
        <Link href={`/${locale}/register`}>{t.register}</Link>
      </p>
    </div>
  );
}
