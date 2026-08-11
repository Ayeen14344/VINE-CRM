import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { authenticatePortalRequest, canAccessClient } from "../../../lib/server-auth";

export const runtime = "nodejs";

type VaultPayload = {
  action?: "reveal";
  id?: string;
  clientId?: string;
  serviceName?: string;
  websiteUrl?: string;
  username?: string;
  password?: string;
  notes?: string;
};

function encryptionKey() {
  const secret = process.env.VINE_VAULT_ENCRYPTION_KEY;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

function encryptPassword(password: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return {
    password_ciphertext: ciphertext.toString("base64"),
    password_iv: iv.toString("base64"),
    password_tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptPassword(row: { password_ciphertext: string; password_iv: string; password_tag: string }, key: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(row.password_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.password_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.password_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function authorize(request: Request, clientId: string) {
  const auth = await authenticatePortalRequest(request);
  if ("error" in auth) return auth;
  const allowed = await canAccessClient(auth.admin, auth.user.id, auth.profile.role, clientId);
  if (!allowed) return { error: "You do not have access to this DSP vault.", status: 403 as const };
  return auth;
}

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim() ?? "";
  if (!clientId) return Response.json({ error: "Select a DSP." }, { status: 400 });
  const auth = await authorize(request, clientId);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from("shared_credentials")
    .select("id, client_id, service_name, website_url, username, notes, created_by, created_at, updated_at")
    .eq("client_id", clientId)
    .order("service_name");

  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ credentials: data ?? [] });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as VaultPayload;
  const clientId = payload.clientId?.trim() ?? "";
  const auth = await authorize(request, clientId);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const key = encryptionKey();
  if (!key) return Response.json({ error: "Vault encryption is not configured." }, { status: 503 });

  if (payload.action === "reveal") {
    const { data, error } = await auth.admin
      .from("shared_credentials")
      .select("id, password_ciphertext, password_iv, password_tag")
      .eq("id", payload.id ?? "")
      .eq("client_id", clientId)
      .single();
    if (error || !data) return Response.json({ error: "Credential not found." }, { status: 404 });

    try {
      const password = decryptPassword(data, key);
      await auth.admin.from("audit_log").insert({
        actor_id: auth.user.id,
        action: "vault.password_revealed",
        entity_type: "shared_credential",
        entity_id: data.id,
        metadata: { client_id: clientId },
      });
      return Response.json({ password });
    } catch {
      return Response.json({ error: "This credential could not be decrypted. Check the vault encryption key." }, { status: 500 });
    }
  }

  const serviceName = payload.serviceName?.trim() ?? "";
  const username = payload.username?.trim() ?? "";
  const password = payload.password ?? "";
  if (!serviceName || !username || !password) {
    return Response.json({ error: "App name, username, and password are required." }, { status: 400 });
  }

  const { data, error } = await auth.admin.from("shared_credentials").insert({
    client_id: clientId,
    service_name: serviceName,
    website_url: payload.websiteUrl?.trim() || null,
    username,
    ...encryptPassword(password, key),
    notes: payload.notes?.trim() || null,
    created_by: auth.user.id,
  }).select("id, client_id, service_name, website_url, username, notes, created_by, created_at, updated_at").single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  await auth.admin.from("audit_log").insert({
    actor_id: auth.user.id,
    action: "vault.credential_created",
    entity_type: "shared_credential",
    entity_id: data.id,
    metadata: { client_id: clientId, service_name: serviceName },
  });
  return Response.json({ credential: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as VaultPayload;
  const clientId = payload.clientId?.trim() ?? "";
  const auth = await authorize(request, clientId);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const key = encryptionKey();
  if (!key) return Response.json({ error: "Vault encryption is not configured." }, { status: 503 });
  if (!payload.id || !payload.serviceName?.trim() || !payload.username?.trim()) {
    return Response.json({ error: "Credential, app name, and username are required." }, { status: 400 });
  }

  const updates: Record<string, string | null> = {
    service_name: payload.serviceName.trim(),
    website_url: payload.websiteUrl?.trim() || null,
    username: payload.username.trim(),
    notes: payload.notes?.trim() || null,
  };
  if (payload.password) Object.assign(updates, encryptPassword(payload.password, key));

  const { data, error } = await auth.admin.from("shared_credentials")
    .update(updates)
    .eq("id", payload.id)
    .eq("client_id", clientId)
    .select("id, client_id, service_name, website_url, username, notes, created_by, created_at, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });

  await auth.admin.from("audit_log").insert({
    actor_id: auth.user.id,
    action: "vault.credential_updated",
    entity_type: "shared_credential",
    entity_id: payload.id,
    metadata: { client_id: clientId },
  });
  return Response.json({ credential: data });
}

export async function DELETE(request: Request) {
  const payload = (await request.json()) as VaultPayload;
  const clientId = payload.clientId?.trim() ?? "";
  const auth = await authorize(request, clientId);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  if (!payload.id) return Response.json({ error: "Select a credential." }, { status: 400 });

  const { error } = await auth.admin.from("shared_credentials").delete().eq("id", payload.id).eq("client_id", clientId);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  await auth.admin.from("audit_log").insert({
    actor_id: auth.user.id,
    action: "vault.credential_deleted",
    entity_type: "shared_credential",
    entity_id: payload.id,
    metadata: { client_id: clientId },
  });
  return Response.json({ deleted: true });
}
