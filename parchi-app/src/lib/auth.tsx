import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getBusiness } from "./db";
import type { Business } from "./types";

interface AuthState {
  /** undefined while loading */
  session: Session | null | undefined;
  /** undefined while loading, null when not set up yet */
  business: Business | null | undefined;
  businessError: string | null;
  setBusiness: (b: Business) => void;
  reloadBusiness: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [business, setBusiness] = useState<Business | null | undefined>(undefined);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => active && setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const reloadBusiness = useCallback(async () => {
    if (!userId) {
      setBusiness(undefined);
      return;
    }
    setBusinessError(null);
    try {
      setBusiness(await getBusiness());
    } catch {
      setBusinessError("Couldn't load your business details. Check your connection and try again.");
    }
  }, [userId]);

  useEffect(() => {
    setBusiness(undefined);
    reloadBusiness();
  }, [reloadBusiness]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setBusiness(undefined);
  }, []);

  const value = useMemo(
    () => ({ session, business, businessError, setBusiness, reloadBusiness, signOut }),
    [session, business, businessError, reloadBusiness, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** For pages that only render once the business exists. */
export function useBusiness(): Business {
  const { business } = useAuth();
  if (!business) throw new Error("useBusiness before setup");
  return business;
}
