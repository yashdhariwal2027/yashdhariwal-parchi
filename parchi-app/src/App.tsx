import { BrowserRouter, Navigate, Route, Routes, Link } from "react-router";
import { isConfigured } from "@/lib/supabase";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { Notice, PageLoading, ToastProvider, Wordmark } from "@/components/ui";
import { SignIn } from "@/pages/SignIn";
import { Onboarding } from "@/pages/Onboarding";
import { NewInvoice } from "@/pages/NewInvoice";
import { Invoices } from "@/pages/Invoices";
import { InvoiceView } from "@/pages/InvoiceView";
import { Products } from "@/pages/Products";
import { Settings } from "@/pages/Settings";
import { ResetPassword } from "@/pages/ResetPassword";
import { PlanPage, RequirePlan } from "@/pages/Plan";
import { BillingProvider } from "@/lib/billing";
import { Landing } from "@/landing/Landing";
import { Contact, PricingPage, Privacy, Refunds, Shipping, Terms } from "@/landing/Policies";

/** Public pages, open to everyone (the payment provider checks them). */
const POLICY_ROUTES = [
  { path: "/terms", element: <Terms /> },
  { path: "/privacy", element: <Privacy /> },
  { path: "/refunds", element: <Refunds /> },
  { path: "/shipping", element: <Shipping /> },
  { path: "/delivery", element: <Navigate to="/shipping" replace /> },
  { path: "/contact", element: <Contact /> },
  { path: "/pricing", element: <PricingPage /> },
];

/** App pages: a signed-out visitor opening one of these is asked to sign in. */
const APP_PATHS = ["/invoices/*", "/drafts/*", "/products", "/settings", "/plan", "/reset-password"];

export default function App() {
  if (!isConfigured) return <SetupNeeded />;
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function Gate() {
  const { session } = useAuth();

  if (session === undefined) return <PageLoading />;

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        {POLICY_ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        {APP_PATHS.map((p) => (
          <Route key={p} path={p} element={<Navigate to="/signin" replace />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Clarity: mask everything a signed-in seller sees (invoices, customers, business details).
  return (
    <div data-clarity-mask="True" className="contents">
      <SignedIn />
    </div>
  );
}

function SignedIn() {
  const { business, businessError, reloadBusiness } = useAuth();

  if (businessError) {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-16">
        <Notice tone="danger" role="alert" title="Couldn't load your account">
          {businessError}
        </Notice>
        <button type="button" className="btn-secondary mt-4" onClick={reloadBusiness}>
          Try again
        </button>
      </div>
    );
  }
  if (business === undefined) return <PageLoading />;

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      {POLICY_ROUTES.map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      {business === null ? (
        <Route path="*" element={<Onboarding />} />
      ) : (
        <Route
          element={
            <BillingProvider>
              <Layout />
            </BillingProvider>
          }
        >
          <Route
            index
            element={
              <RequirePlan>
                <NewInvoice />
              </RequirePlan>
            }
          />
          <Route
            path="drafts/:id"
            element={
              <RequirePlan>
                <NewInvoice />
              </RequirePlan>
            }
          />
          <Route path="plan" element={<PlanPage />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceView />} />
          <Route path="products" element={<Products />} />
          <Route path="settings" element={<Settings />} />
          <Route path="signin" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      )}
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[480px] py-10 text-center">
      <h1 className="h1">Page not found</h1>
      <Link to="/" className="btn-primary mt-5">
        New invoice
      </Link>
    </div>
  );
}

/** Shown only to whoever deploys the app, until the Supabase settings are added. */
function SetupNeeded() {
  return (
    <main className="mx-auto max-w-[560px] px-4 py-16">
      <Wordmark />
      <h1 className="h1 mt-6">Almost there</h1>
      <p className="mt-2 text-muted">The app isn't connected to its database yet. Add these environment variables, then redeploy:</p>
      <ul className="mt-4 grid gap-2 font-mono text-[14px]">
        <li className="card px-3 py-2">VITE_SUPABASE_URL</li>
        <li className="card px-3 py-2">VITE_SUPABASE_PUBLISHABLE_KEY</li>
        <li className="card px-3 py-2">GEMINI_API_KEY</li>
      </ul>
      <p className="mt-4 text-[14px] text-muted">The README has step-by-step instructions.</p>
    </main>
  );
}
