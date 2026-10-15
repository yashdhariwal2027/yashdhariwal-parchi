import { useAuth, useBusiness } from "@/lib/auth";
import { updateBusiness } from "@/lib/db";
import { friendlyError } from "@/lib/errors";
import { BusinessForm } from "@/components/BusinessForm";
import { useToast } from "@/components/ui";

export function Settings() {
  const biz = useBusiness();
  const { session, setBusiness, signOut } = useAuth();
  const toast = useToast();

  return (
    <div className="mx-auto max-w-[760px]">
      <h1 className="h1">Settings</h1>
      <p className="mt-1 text-muted">These details appear on every new invoice. Invoices you've already issued keep the details they were issued with.</p>
      <div className="mt-5">
        <BusinessForm
          full
          initial={biz}
          submitLabel="Save changes"
          onSave={async (input) => {
            try {
              setBusiness(await updateBusiness(biz.user_id, input));
              toast("Settings saved");
            } catch (e) {
              throw new Error(friendlyError(e, "Couldn't save your settings. Please try again."));
            }
          }}
        />
      </div>

      <section className="card mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-labelledby="acct">
        <div>
          <h2 id="acct" className="h3">
            Account
          </h2>
          <p className="mt-0.5 text-[14px] text-muted">Signed in as {session?.user.email}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={signOut}>
          Sign out
        </button>
      </section>
    </div>
  );
}
