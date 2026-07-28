import { createClient } from "@supabase/supabase-js";

type CreateUserPayload = {
  email?: string;
  password?: string;
  fullName?: string;
  role?: "super_admin" | "employee" | "client";
  clientId?: string | null;
  verticalId?: string | null;
  clientIds?: string[];
};

type DeleteUserPayload = {
  userId?: string;
};

function serverClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  const missing: string[] = [];

  if (!url) missing.push("Supabase URL");
  if (!serviceKey) missing.push("Supabase server key");

  return {
    admin:
      url && serviceKey
        ? createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null,
    missing,
  };
}

export async function POST(request: Request) {
  const { admin, missing } = serverClient();
  if (!admin) {
    return Response.json(
      {
        error: `Supabase server configuration is incomplete. Missing: ${missing.join(
          ", ",
        )}.`,
      },
      { status: 503 },
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return Response.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !authData.user) {
    return Response.json({ error: "Your session is invalid." }, { status: 401 });
  }

  const { data: requester } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", authData.user.id)
    .single();

  if (!requester?.active || requester.role !== "super_admin") {
    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }

  const payload = (await request.json()) as CreateUserPayload;
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password ?? "";
  const fullName = payload.fullName?.trim() ?? "";
  const role = payload.role;

  if (!email || !fullName || !role || password.length < 10) {
    return Response.json(
      { error: "Name, role, email, and a password of at least 10 characters are required." },
      { status: 400 },
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { portal_role: role },
  });

  if (createError || !created.user) {
    return Response.json({ error: createError?.message ?? "User creation failed." }, { status: 400 });
  }

  const profile = {
    id: created.user.id,
    email,
    full_name: fullName,
    role,
    active: true,
    client_id: role === "client" ? payload.clientId ?? null : null,
    vertical_id: role === "employee" ? payload.verticalId ?? null : null,
  };

  const { error: profileError } = await admin.from("profiles").upsert(profile);
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: profileError.message }, { status: 400 });
  }

  if (role === "client" && payload.clientId) {
    await admin.from("client_memberships").upsert({
      user_id: created.user.id,
      client_id: payload.clientId,
    });
  }

  if (role === "employee" && payload.verticalId) {
    await admin.from("employee_assignments").upsert({
      employee_id: created.user.id,
      vertical_id: payload.verticalId,
    });
    const clientRows = (payload.clientIds ?? []).map((clientId) => ({
      employee_id: created.user.id,
      client_id: clientId,
      vertical_id: payload.verticalId,
    }));
    if (clientRows.length) {
      await admin.from("employee_client_assignments").upsert(clientRows);
    }
  }

  await admin.from("audit_log").insert({
    actor_id: authData.user.id,
    action: "user.created",
    entity_type: "profile",
    entity_id: created.user.id,
    metadata: { email, role },
  });

  return Response.json({ user: profile }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { admin, missing } = serverClient();
  if (!admin) {
    return Response.json(
      {
        error: `Supabase server configuration is incomplete. Missing: ${missing.join(
          ", ",
        )}.`,
      },
      { status: 503 },
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return Response.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(bearer);
  if (authError || !authData.user) {
    return Response.json({ error: "Your session is invalid." }, { status: 401 });
  }

  const { data: requester } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", authData.user.id)
    .single();

  if (!requester?.active || requester.role !== "super_admin") {
    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }

  const payload = (await request.json()) as DeleteUserPayload;
  const userId = payload.userId?.trim();

  if (!userId) {
    return Response.json({ error: "Select a user to delete." }, { status: 400 });
  }

  if (userId === authData.user.id) {
    return Response.json(
      { error: "You cannot delete the Super Admin account you are currently using." },
      { status: 400 },
    );
  }

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .single();

  if (targetError || !target) {
    return Response.json({ error: "The selected user no longer exists." }, { status: 404 });
  }

  const { error: createdReportsError } = await admin
    .from("reports")
    .update({ created_by: authData.user.id })
    .eq("created_by", userId);

  if (createdReportsError) {
    return Response.json({ error: createdReportsError.message }, { status: 400 });
  }

  const { error: publishedReportsError } = await admin
    .from("reports")
    .update({ published_by: authData.user.id })
    .eq("published_by", userId);

  if (publishedReportsError) {
    return Response.json({ error: publishedReportsError.message }, { status: 400 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 400 });
  }

  await admin.from("audit_log").insert({
    actor_id: authData.user.id,
    action: "user.deleted",
    entity_type: "profile",
    entity_id: userId,
    metadata: {
      email: target.email,
      full_name: target.full_name,
      role: target.role,
    },
  });

  return Response.json({
    deletedUser: {
      id: userId,
      email: target.email,
    },
  });
}
