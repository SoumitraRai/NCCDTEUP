import { PublicShell } from "@/components/public-shell";
import { LoginForm } from "@/components/login-form";
// The single sign-in page for everyone (cadets, ANOs, CTOs and officers).
// /en/login and /hi/login show the same form; this is the short address.
export const metadata = { title: "Sign in" };
export default function Login() {
  return (
    <div lang="en">
      <PublicShell locale="en">
        <LoginForm locale="en" />
      </PublicShell>
    </div>
  );
}
