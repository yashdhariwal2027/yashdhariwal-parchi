import { useAuth } from "@/lib/auth";
import { createBusiness } from "@/lib/db";
import { friendlyError } from "@/lib/errors";
import { BusinessForm, EMPTY_BUSINESS } from "@/components/BusinessForm";
import { Wordmark } from "@/components/ui";

export function Onboarding() {
  const { setBusiness, signOut, session } = useAuth();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="wrap flex h-14 items-center justify-between md:h-16">
          <Wordmark />
          <button type="button" className="btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="wrap max-w-[760px] py-6 md:py-10">
        <h1 className="h1">Set up your business</h1>
        <p className="mt-1 text-muted">
          This takes a minute. You can add your logo, signature and UPI later in Settings.
          {session?.user.email ? <span className="block text-[14px]">Signed in as {session.user.email}</span> : null}
        </p>
        <div className="mt-6">
          <BusinessForm
            initial={EMPTY_BUSINESS}
            submitLabel="Continue"
            onSave={async (input) => {
              try {
                setBusiness(await createBusiness(input));
              } catch (e) {
                throw new Error(friendlyError(e, "Couldn't save your business details. Please try again."));
              }
            }}
          />
        </div>
      </main>
    </div>
  );
}
