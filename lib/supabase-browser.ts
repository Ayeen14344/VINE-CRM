import { createClient } from "@supabase/supabase-js";

// These browser-safe values are embedded during the production build.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type PortalRole = "super_admin" | "viewer_admin" | "employee" | "client";

export type PortalProfile = {
  id: string;
  email: string;
  full_name: string;
  role: PortalRole;
  active: boolean;
  client_id: string | null;
  vertical_id: string | null;
};
