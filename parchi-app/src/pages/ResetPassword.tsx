import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { Field, Notice, Spinner, Wordmark } from "@/components/ui";

/** Reached from the password reset email. Supabase signs the person in from the link, then they pick a new password. */
export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const short = touched && password.length < 8;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (password.length < 8) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(/session|JWT|expired/i.test(error.message) ? "This reset link has expired. Request a new one from the sign-in page." : "Couldn't update your password. Please try again.");
    else navigate("/", { replace: true });
  }

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-[400px]">
        <Wordmark className="mb-6" />
        <form noValidate onSubmit={onSubmit} className="card grid gap-4 p-5 sm:p-7">
          <h1 className="h1">Choose a new password</h1>
          <Field label="New password" error={short ? "Use at least 8 characters." : null}>
            {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {error && (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Spinner label="Saving..." /> : "Save password"}
          </button>
        </form>
      </div>
    </main>
  );
}
