import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

/** False until VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set (the app then shows setup steps). */
export const isConfigured = Boolean(url && key);

export const supabase: SupabaseClient = isConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : (null as unknown as SupabaseClient);
