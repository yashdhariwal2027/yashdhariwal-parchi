import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Field, Notice, Spinner, Wordmark } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "forgot";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function authMessage(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/already registered|already been registered|User already registered/i.test(msg)) return "An account with this email already exists. Sign in instead.";
  if (/Email not confirmed/i.test(msg)) return "Confirm your email first. Check your inbox for the link.";
  if (/Password should be|weak/i.test(msg)) return "Choose a stronger password: at least 8 characters.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a few minutes and try again.";
  if (/not authorized|Email address not authorized/i.test(msg)) return "Emails can't be sent yet. The app owner needs to set up email sending in Supabase.";
  if (/fetch|network/i.test(msg)) return "You seem to be offline. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

export function SignIn() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailError = touched && !EMAIL_RE.test(email.trim()) ? "Enter a valid email address." : null;
  const passwordError = touched && mode !== "forgot" && password.length < 8 ? "Use at least 8 characters." : null;

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
    setTouched(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    setInfo(null);
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr) || (mode !== "forgot" && password.length < 8)) return;
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (error) setError(authMessage(error.message));
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: addr,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) setError(authMessage(error.message));
        else if (!data.session) setInfo("Check your inbox and click the link to confirm your email, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) setError(authMessage(error.message));
        else setInfo("If an account exists for this email, a reset link is on its way.");
      }
    } catch (err) {
      setError(authMessage(String((err as Error)?.message ?? err)));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password";
  const action = mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-[400px]">
        <Wordmark className="mb-6" />
        <div className="card p-5 sm:p-7">
          <h1 className="h1">{title}</h1>
          <p className="mt-1.5 text-[15px] text-muted">
            {mode === "forgot"
              ? "We'll email you a link to set a new password."
              : "Turn customer order messages into invoices you can send."}
          </p>

          {mode !== "forgot" && (
            <div role="group" aria-label="Sign in or create an account" className="mt-5 grid grid-cols-2 rounded-control bg-alt p-1">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    "min-h-[40px] rounded-[6px] text-[14px] font-medium",
                    mode === m ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                  )}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}

          <form noValidate onSubmit={onSubmit} className="mt-5 grid gap-4">
            <Field label="Email" error={emailError}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            {mode !== "forgot" && (
              <Field label="Password" error={passwordError} hint={mode === "signup" ? "At least 8 characters." : undefined}>
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
            )}

            {error && (
              <Notice tone="danger" role="alert">
                {error}
              </Notice>
            )}
            {info && (
              <Notice tone="success" role="status">
                {info}
              </Notice>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Spinner label="Please wait..." /> : action}
            </button>
          </form>

          <div className="mt-4 text-center text-[14px]">
            {mode === "signin" && (
              <button type="button" className="text-brand underline-offset-2 hover:underline" onClick={() => switchMode("forgot")}>
                Forgot password?
              </button>
            )}
            {mode === "forgot" && (
              <button type="button" className="text-brand underline-offset-2 hover:underline" onClick={() => switchMode("signin")}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
