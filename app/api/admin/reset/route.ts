import { createClient } from "@supabase/supabase-js";

type ResetScope = "reports" | "workspace";

type ResetPayload = {
  scope?: ResetScope;
  confirmation?: string;
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

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
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

  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("role, active, email")
    .eq("id", authData.user.id)
    .single();

  if (requesterError || !requester?.active || requester.role !== "super_admin") {
    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }
  const adminClient = admin;

  async function listAllFiles(bucket: string, prefix = ""): Promise<string[]> {
    const files: string[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await adminClient.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;

      for (const item of data ?? []) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) {
          files.push(itemPath);
        } else {
          files.push(...await listAllFiles(bucket, itemPath));
        }
      }

      if ((data ?? []).length < 1000) break;
      offset += 1000;
    }

    return files;
  }

  const payload = (await request.json()) as ResetPayload;
  const scope = payload.scope;
  const expectedConfirmation =
    scope === "workspace" ? "RESET VINE PULSE" : "CLEAR REPORTS";

  if (
    (scope !== "reports" && scope !== "workspace") ||
    payload.confirmation !== expectedConfirmation
  ) {
    return Response.json(
      { error: `Type ${expectedConfirmation} exactly to confirm this action.` },
      { status: 400 },
    );
  }

  const { data: reportFiles, error: reportFilesError } = await admin
    .from("reports")
    .select("source_file_path")
    .not("source_file_path", "is", null);

  if (reportFilesError) {
    return Response.json({ error: reportFilesError.message }, { status: 400 });
  }

  let bucketFiles: string[] = [];
  const storageWarnings: string[] = [];
  try {
    bucketFiles = await listAllFiles("client-reports");
  } catch (error) {
    storageWarnings.push(
      error instanceof Error ? error.message : "The report bucket could not be listed.",
    );
  }

  const filePaths = Array.from(new Set([
    ...(reportFiles ?? [])
      .map((report) => report.source_file_path)
      .filter((path): path is string => Boolean(path)),
    ...bucketFiles,
  ]));

  const {
    count: reportsDeleted,
    error: reportDeleteError,
  } = await admin
    .from("reports")
    .delete({ count: "exact" })
    .not("id", "is", null);

  if (reportDeleteError) {
    return Response.json({ error: reportDeleteError.message }, { status: 400 });
  }

  let filesDeleted = 0;
  for (const batch of chunks(filePaths, 100)) {
    const { error } = await admin.storage.from("client-reports").remove(batch);
    if (error) {
      storageWarnings.push(error.message);
    } else {
      filesDeleted += batch.length;
    }
  }

  if (scope === "reports") {
    await admin
      .from("audit_log")
      .delete()
      .in("entity_type", ["report", "report_row"]);

    await admin.from("audit_log").insert({
      actor_id: authData.user.id,
      action: "demo.reports_cleared",
      entity_type: "system",
      metadata: {
        reports_deleted: reportsDeleted ?? 0,
        files_deleted: filesDeleted,
        storage_warnings: storageWarnings,
      },
    });

    return Response.json({
      scope,
      reportsDeleted: reportsDeleted ?? 0,
      filesDeleted,
      usersDeleted: 0,
      clientsDeleted: 0,
      warnings: storageWarnings,
    });
  }

  const {
    count: clientsDeleted,
    error: clientDeleteError,
  } = await admin
    .from("clients")
    .delete({ count: "exact" })
    .not("id", "is", null);

  if (clientDeleteError) {
    return Response.json({ error: clientDeleteError.message }, { status: 400 });
  }

  const { error: auditDeleteError } = await admin
    .from("audit_log")
    .delete()
    .not("id", "is", null);

  if (auditDeleteError) {
    return Response.json({ error: auditDeleteError.message }, { status: 400 });
  }

  const authUsers = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    authUsers.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }

  const usersToDelete = authUsers.filter((user) => user.id !== authData.user.id);
  const userDeleteErrors: string[] = [];
  let usersDeleted = 0;

  for (const batch of chunks(usersToDelete, 20)) {
    const results = await Promise.all(
      batch.map(async (user) => ({
        user,
        result: await admin.auth.admin.deleteUser(user.id),
      })),
    );
    results.forEach(({ user, result }) => {
      if (result.error) {
        userDeleteErrors.push(
          `${user.email ?? user.id}: ${result.error.message}`,
        );
      } else {
        usersDeleted += 1;
      }
    });
  }

  await admin
    .from("profiles")
    .update({
      role: "super_admin",
      active: true,
      client_id: null,
      vertical_id: null,
    })
    .eq("id", authData.user.id);

  await admin.from("audit_log").insert({
    actor_id: authData.user.id,
    action: "demo.workspace_reset",
    entity_type: "system",
    metadata: {
      reports_deleted: reportsDeleted ?? 0,
      files_deleted: filesDeleted,
      clients_deleted: clientsDeleted ?? 0,
      users_deleted: usersDeleted,
      storage_warnings: storageWarnings,
      user_delete_errors: userDeleteErrors,
    },
  });

  if (userDeleteErrors.length) {
    return Response.json(
      {
        error: "The workspace data was cleared, but some user accounts could not be deleted.",
        details: userDeleteErrors,
      },
      { status: 500 },
    );
  }

  return Response.json({
    scope,
    reportsDeleted: reportsDeleted ?? 0,
    filesDeleted,
    usersDeleted,
    clientsDeleted: clientsDeleted ?? 0,
    preservedAdminEmail: requester.email,
    warnings: storageWarnings,
  });
}
