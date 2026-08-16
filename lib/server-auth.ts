import { createClient } from "@supabase/supabase-js";

export type ServerPortalRole = "super_admin" | "viewer_admin" | "employee" | "client";

export function createServerAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticatePortalRequest(request: Request) {
  const admin = createServerAdmin();
  if (!admin) {
    return { error: "Supabase server configuration is incomplete.", status: 503 as const };
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return { error: "Authentication is required.", status: 401 as const };

  const { data: authData, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !authData.user) return { error: "Your session is invalid.", status: 401 as const };

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name, role, active, client_id")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile?.active) return { error: "Your portal account is inactive.", status: 403 as const };
  return { admin, user: authData.user, profile: profile as typeof profile & { role: ServerPortalRole } };
}

export async function canAccessClient(
  admin: NonNullable<ReturnType<typeof createServerAdmin>>,
  userId: string,
  role: ServerPortalRole,
  clientId: string,
) {
  if (role === "super_admin") return true;
  if (role === "viewer_admin") return false;
  const table = role === "employee" ? "employee_client_assignments" : "client_memberships";
  const userColumn = role === "employee" ? "employee_id" : "user_id";
  const { data } = await admin.from(table).select("client_id").eq(userColumn, userId).eq("client_id", clientId).maybeSingle();
  return Boolean(data);
}
