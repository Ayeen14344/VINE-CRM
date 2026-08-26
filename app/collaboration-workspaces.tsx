"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortalProfile } from "../lib/supabase-browser";
import { supabase } from "../lib/supabase-browser";

type WorkspaceRole = "admin" | "employee" | "client";
type WorkspaceClient = { id: string; company_name: string; enabled_vertical_ids?: string[] | null };
type SharedWorkspaceProps = {
  clients: WorkspaceClient[];
  client?: WorkspaceClient;
  role: WorkspaceRole;
  profile: PortalProfile;
  onMessage: (message: string) => void;
};

type VaultCredential = {
  id: string;
  client_id: string;
  service_name: string;
  website_url: string | null;
  username: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type TaskStatus = "pending" | "ongoing" | "working" | "done";
type TaskUrgency = "low" | "normal" | "high" | "critical";
type TaskRecurrence = "one_time" | "daily" | "weekly" | "monthly";
type TaskComment = { id: string; author_name: string; body: string; created_at: string };
type TaskAttachment = { id: string; storage_path: string; file_name: string; file_size: number; uploaded_by_name: string; created_at: string };
type ClientTask = {
  id: string;
  client_id: string;
  vertical_id: string | null;
  title: string;
  description: string;
  urgency: TaskUrgency;
  task_status: TaskStatus;
  recurrence: TaskRecurrence;
  due_date: string | null;
  created_by: string | null;
  created_by_name: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  task_comments: TaskComment[];
  task_attachments: TaskAttachment[];
};

const taskVerticalOptions = [
  { id: "00000000-0000-4000-8000-000000000101", name: "Sourcing & Hiring" },
  { id: "00000000-0000-4000-8000-000000000102", name: "Orientation & ADP Setup" },
  { id: "00000000-0000-4000-8000-000000000103", name: "Training, ORE & Work Scheduling" },
  { id: "00000000-0000-4000-8000-000000000104", name: "Time & Attendance" },
];

function taskVerticalName(verticalId: string | null) {
  return taskVerticalOptions.find((vertical) => vertical.id === verticalId)?.name ?? "Unassigned vertical";
}

const boardColumns: { id: TaskStatus; label: string; short: string }[] = [
  { id: "pending", label: "Pending", short: "PN" },
  { id: "ongoing", label: "On going", short: "OG" },
  { id: "working", label: "Currently working", short: "CW" },
  { id: "done", label: "Done / Finished", short: "DN" },
];

function formatWorkspaceDate(value: string | null | undefined) {
  if (!value) return "No due date";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeWebsiteUrl(value: string | null) {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).toString();
  } catch {
    return null;
  }
}

function useActiveClient({ clients, client, role }: Pick<SharedWorkspaceProps, "clients" | "client" | "role">) {
  const [adminClientId, setAdminClientId] = useState(client?.id ?? clients[0]?.id ?? "");
  const resolvedAdminClientId = clients.some((item) => item.id === adminClientId) ? adminClientId : clients[0]?.id ?? "";
  const activeClientId = role === "admin" ? resolvedAdminClientId : client?.id ?? "";
  const activeClient = clients.find((item) => item.id === activeClientId) ?? client;

  return { activeClientId, activeClient, setAdminClientId };
}

async function vaultRequest(method: string, body?: Record<string, unknown>, clientId?: string) {
  const { data } = await supabase!.auth.getSession();
  const response = await fetch(clientId ? `/api/vault?clientId=${encodeURIComponent(clientId)}` : "/api/vault", {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json() as { error?: string; credentials?: VaultCredential[]; credential?: VaultCredential; password?: string };
  if (!response.ok) throw new Error(result.error ?? "The vault request failed.");
  return result;
}

function WorkspaceHeader({ eyebrow, title, copy, activeClient, clients, role, clientId, onClientChange, action }: {
  eyebrow: string;
  title: string;
  copy: string;
  activeClient?: WorkspaceClient;
  clients: WorkspaceClient[];
  role: WorkspaceRole;
  clientId: string;
  onClientChange: (clientId: string) => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="collaboration-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>
      <div className="collaboration-heading-actions">
        {role === "admin" ? (
          <label className="workspace-client-picker"><span>DSP workspace</span><select value={clientId} onChange={(event) => onClientChange(event.target.value)}>{clients.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select></label>
        ) : <span className="pill">{activeClient?.company_name ?? "No DSP selected"}</span>}
        {action}
      </div>
    </div>
  );
}

export function CredentialVault(props: SharedWorkspaceProps) {
  const { onMessage } = props;
  const { activeClientId, activeClient, setAdminClientId } = useActiveClient(props);
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VaultCredential | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [passwordAction, setPasswordAction] = useState<{ id: string; type: "show" | "copy" } | null>(null);
  const [form, setForm] = useState({ serviceName: "", websiteUrl: "", username: "", password: "", notes: "" });

  const loadCredentials = useCallback(async () => {
    if (!activeClientId || !supabase) {
      setCredentials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await vaultRequest("GET", undefined, activeClientId);
      setCredentials(result.credentials ?? []);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The vault could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [activeClientId, onMessage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRevealed({});
      void loadCredentials();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCredentials]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return credentials;
    return credentials.filter((credential) => [credential.service_name, credential.username, credential.website_url, credential.notes].some((value) => String(value ?? "").toLowerCase().includes(query)));
  }, [credentials, search]);

  function openCreate() {
    setEditing(null);
    setForm({ serviceName: "", websiteUrl: "", username: "", password: "", notes: "" });
    setFormOpen(true);
  }

  function openEdit(credential: VaultCredential) {
    setEditing(credential);
    setForm({ serviceName: credential.service_name, websiteUrl: credential.website_url ?? "", username: credential.username, password: "", notes: credential.notes ?? "" });
    setFormOpen(true);
  }

  async function saveCredential(event: React.FormEvent) {
    event.preventDefault();
    if (!activeClientId) return;
    setSaving(true);
    try {
      await vaultRequest(editing ? "PATCH" : "POST", { ...form, clientId: activeClientId, id: editing?.id });
      props.onMessage(editing ? "Credential updated securely." : "Credential added to the shared vault.");
      setFormOpen(false);
      await loadCredentials();
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : "The credential could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function getCredentialPassword(id: string) {
    const cachedPassword = revealed[id];
    if (cachedPassword) return cachedPassword;

    const result = await vaultRequest("POST", { action: "reveal", id, clientId: activeClientId });
    const password = result.password ?? "";
    if (!password) throw new Error("This credential does not have a password to reveal.");
    return password;
  }

  async function revealCredential(id: string) {
    if (revealed[id]) {
      setRevealed((current) => { const next = { ...current }; delete next[id]; return next; });
      return;
    }
    setPasswordAction({ id, type: "show" });
    try {
      const password = await getCredentialPassword(id);
      setRevealed((current) => ({ ...current, [id]: password }));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : "The password could not be revealed.");
    } finally {
      setPasswordAction(null);
    }
  }

  async function copyText(value: string, label: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error(`${label} could not be copied. Please use Show and copy it manually.`);
    }
    props.onMessage(`${label} copied securely.`);
  }

  async function copyCredentialPassword(id: string) {
    setPasswordAction({ id, type: "copy" });
    try {
      const password = await getCredentialPassword(id);
      await copyText(password, "Password");
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : "The password could not be copied.");
    } finally {
      setPasswordAction(null);
    }
  }

  async function deleteCredential(credential: VaultCredential) {
    if (!window.confirm(`Delete the ${credential.service_name} credential? This cannot be undone.`)) return;
    try {
      await vaultRequest("DELETE", { id: credential.id, clientId: activeClientId });
      props.onMessage("Credential deleted.");
      await loadCredentials();
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : "The credential could not be deleted.");
    }
  }

  return (
    <div className="collaboration-workspace vault-workspace">
      <WorkspaceHeader eyebrow="Secure shared access" title="VINE Vault" copy="Encrypted logins shared only with this DSP, its assigned support team, and Super Admins." activeClient={activeClient} clients={props.clients} role={props.role} clientId={activeClientId} onClientChange={setAdminClientId} action={<button className="primary-btn" type="button" onClick={openCreate} disabled={!activeClientId}>+ Add login</button>} />

      <section className="panel vault-toolbar">
        <label className="vault-search"><span>Search vault</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search app, username, or notes" /></label>
        <div className="vault-security-note"><span className="vault-lock">◆</span><div><strong>AES-256 protected</strong><p>Passwords are encrypted before storage and revealed only on request.</p></div></div>
      </section>

      {formOpen && <section className="panel vault-editor"><div className="panel-head"><div><p className="eyebrow">{editing ? "Update access" : "New shared access"}</p><h2>{editing ? `Edit ${editing.service_name}` : "Add a login"}</h2><p>{editing ? "Leave the password blank to keep the current encrypted password." : "This login will be shared with authorized users for this DSP."}</p></div><button className="secondary-btn" type="button" onClick={() => setFormOpen(false)}>Close</button></div><form className="vault-form" onSubmit={saveCredential}>
        <label><span>App / Service name</span><input required value={form.serviceName} onChange={(event) => setForm({ ...form, serviceName: event.target.value })} placeholder="Amazon Logistics" /></label>
        <label><span>Website URL</span><input value={form.websiteUrl} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} placeholder="https://example.com/login" /></label>
        <label><span>Username / Email</span><input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="off" /></label>
        <label><span>{editing ? "New password (optional)" : "Password"}</span><input required={!editing} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></label>
        <label className="vault-notes-field"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Account purpose, recovery instructions, or access notes" /></label>
        <div className="vault-form-actions"><button className="secondary-btn" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving ? "Encrypting…" : editing ? "Save changes" : "Encrypt & save"}</button></div>
      </form></section>}

      {loading ? <section className="panel collaboration-loading"><span className="pulse-loader" /><strong>Opening secure vault…</strong></section> : filtered.length ? <section className="vault-grid">{filtered.map((credential) => {
        const url = safeWebsiteUrl(credential.website_url);
        const password = revealed[credential.id];
        return <article className="panel vault-card" key={credential.id}>
          <div className="vault-card-head"><span className="vault-service-icon">{credential.service_name.slice(0, 2).toUpperCase()}</span><div><h3>{credential.service_name}</h3><p>Updated {formatWorkspaceDate(credential.updated_at)}</p></div><span className="vault-encrypted-pill">Encrypted</span></div>
          <div className="vault-field"><span>Username</span><div><code>{credential.username}</code><button type="button" onClick={() => copyText(credential.username, "Username")}>Copy</button></div></div>
          <div className="vault-field"><span>Password</span><div><code>{password || "••••••••••••"}</code><button type="button" disabled={passwordAction?.id === credential.id} onClick={() => revealCredential(credential.id)}>{passwordAction?.id === credential.id && passwordAction.type === "show" ? "Loading…" : password ? "Hide" : "Show"}</button><button type="button" disabled={passwordAction?.id === credential.id} onClick={() => copyCredentialPassword(credential.id)}>{passwordAction?.id === credential.id && passwordAction.type === "copy" ? "Copying…" : "Copy"}</button></div></div>
          {credential.notes && <p className="vault-card-notes">{credential.notes}</p>}
          <div className="vault-card-actions">{url && <a className="secondary-btn" href={url} target="_blank" rel="noreferrer">Open login</a>}<button className="secondary-btn" type="button" onClick={() => openEdit(credential)}>Edit</button><button className="danger-link" type="button" onClick={() => deleteCredential(credential)}>Delete</button></div>
        </article>;
      })}</section> : <section className="panel collaboration-empty"><span>◆</span><h2>No shared logins yet</h2><p>Add the first encrypted login for {activeClient?.company_name ?? "this DSP"}.</p><button className="primary-btn" type="button" onClick={openCreate}>Add first login</button></section>}
    </div>
  );
}

export function ProjectBoard(props: SharedWorkspaceProps) {
  const { onMessage } = props;
  const { activeClientId, activeClient, setAdminClientId } = useActiveClient(props);
  const [allTasks, setTasks] = useState<ClientTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [uploadingTask, setUploadingTask] = useState<string | null>(null);
  const [verticalFilter, setVerticalFilter] = useState("all");
  const [form, setForm] = useState<{ title: string; description: string; verticalId: string; urgency: TaskUrgency; recurrence: TaskRecurrence; dueDate: string }>({ title: "", description: "", verticalId: "", urgency: "normal", recurrence: "one_time", dueDate: "" });
  const canCreateTasks = props.role === "admin" || props.role === "client";
  const availableVerticals = useMemo(() => {
    if (props.role === "employee") {
      return taskVerticalOptions.filter((vertical) => vertical.id === props.profile.vertical_id);
    }
    const enabled = activeClient?.enabled_vertical_ids;
    return enabled?.length
      ? taskVerticalOptions.filter((vertical) => enabled.includes(vertical.id))
      : taskVerticalOptions;
  }, [activeClient?.enabled_vertical_ids, props.profile.vertical_id, props.role]);

  const loadTasks = useCallback(async () => {
    if (!activeClientId || !supabase) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("client_tasks")
      .select("id, client_id, vertical_id, title, description, urgency, task_status, recurrence, due_date, created_by, created_by_name, completed_at, created_at, updated_at, task_comments(id, author_name, body, created_at), task_attachments(id, storage_path, file_name, file_size, uploaded_by_name, created_at)")
      .eq("client_id", activeClientId)
      .order("created_at", { ascending: false });
    if (props.role === "employee" && props.profile.vertical_id) {
      query = query.eq("vertical_id", props.profile.vertical_id);
    }
    const { data, error } = await query;
    if (error) onMessage(error.message);
    setTasks((data ?? []) as ClientTask[]);
    setLoading(false);
  }, [activeClientId, onMessage, props.profile.vertical_id, props.role]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTasks(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks]);

  const selectedTaskVerticalId = availableVerticals.some((vertical) => vertical.id === form.verticalId)
    ? form.verticalId
    : availableVerticals[0]?.id ?? "";
  const selectedVerticalFilter = verticalFilter === "all" || availableVerticals.some((vertical) => vertical.id === verticalFilter)
    ? verticalFilter
    : "all";
  const visibleTasks = useMemo(
    () => selectedVerticalFilter === "all" ? allTasks : allTasks.filter((task) => task.vertical_id === selectedVerticalFilter),
    [allTasks, selectedVerticalFilter],
  );
  const tasks = visibleTasks;
  const counts = useMemo(() => Object.fromEntries(boardColumns.map((column) => [column.id, visibleTasks.filter((task) => task.task_status === column.id).length])) as Record<TaskStatus, number>, [visibleTasks]);

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !activeClientId || !canCreateTasks || !selectedTaskVerticalId) return;
    setSaving(true);
    const { error } = await supabase.from("client_tasks").insert({
      client_id: activeClientId,
      vertical_id: selectedTaskVerticalId,
      title: form.title.trim(),
      description: form.description.trim(),
      urgency: form.urgency,
      recurrence: form.recurrence,
      due_date: form.dueDate || null,
      created_by: props.profile.id,
      created_by_name: props.profile.full_name || props.profile.email,
    });
    setSaving(false);
    if (error) { props.onMessage(error.message); return; }
    setForm({ title: "", description: "", verticalId: availableVerticals[0]?.id ?? "", urgency: "normal", recurrence: "one_time", dueDate: "" });
    setFormOpen(false);
    props.onMessage("Task added to the shared board.");
    await loadTasks();
  }

  async function moveTask(task: ClientTask, status: TaskStatus) {
    if (!supabase || status === task.task_status) return;
    const { error } = await supabase.from("client_tasks").update({
      task_status: status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    }).eq("id", task.id);
    if (error) { props.onMessage(error.message); return; }
    props.onMessage(`Task moved to ${boardColumns.find((column) => column.id === status)?.label}.`);
    await loadTasks();
  }

  async function addComment(task: ClientTask) {
    const body = commentDrafts[task.id]?.trim();
    if (!supabase || !body) return;
    const { error } = await supabase.from("task_comments").insert({
      task_id: task.id,
      client_id: task.client_id,
      author_id: props.profile.id,
      author_name: props.profile.full_name || props.profile.email,
      body,
    });
    if (error) { props.onMessage(error.message); return; }
    setCommentDrafts((current) => ({ ...current, [task.id]: "" }));
    props.onMessage("Comment added.");
    await loadTasks();
  }

  async function uploadAttachment(task: ClientTask, file: File | undefined) {
    if (!supabase || !file) return;
    if (file.size > 25 * 1024 * 1024) { props.onMessage("Task attachments must be 25 MB or smaller."); return; }
    setUploadingTask(task.id);
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const storagePath = `${task.client_id}/${task.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("task-attachments").upload(storagePath, file, { upsert: false });
    if (uploadError) { setUploadingTask(null); props.onMessage(uploadError.message); return; }
    const { error: metadataError } = await supabase.from("task_attachments").insert({
      task_id: task.id,
      client_id: task.client_id,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type || "application/octet-stream",
      file_size: file.size,
      uploaded_by: props.profile.id,
      uploaded_by_name: props.profile.full_name || props.profile.email,
    });
    if (metadataError) {
      await supabase.storage.from("task-attachments").remove([storagePath]);
      setUploadingTask(null);
      props.onMessage(metadataError.message);
      return;
    }
    setUploadingTask(null);
    props.onMessage("File attached to task.");
    await loadTasks();
  }

  async function openAttachment(attachment: TaskAttachment) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("task-attachments").createSignedUrl(attachment.storage_path, 60);
    if (error || !data?.signedUrl) { props.onMessage(error?.message ?? "The file could not be opened."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteTask(task: ClientTask) {
    if (!supabase || !canCreateTasks || !window.confirm(`Delete “${task.title}”?`)) return;
    const paths = task.task_attachments.map((attachment) => attachment.storage_path);
    if (paths.length) await supabase.storage.from("task-attachments").remove(paths);
    const { error } = await supabase.from("client_tasks").delete().eq("id", task.id);
    if (error) { props.onMessage(error.message); return; }
    props.onMessage("Task deleted.");
    await loadTasks();
  }

  return (
    <div className="collaboration-workspace task-workspace">
      <WorkspaceHeader eyebrow="Shared operations" title="VINE Tasks" copy="A client-to-support workspace for requests, questions, files, urgency, and recurring work." activeClient={activeClient} clients={props.clients} role={props.role} clientId={activeClientId} onClientChange={setAdminClientId} action={canCreateTasks ? <button className="primary-btn" type="button" onClick={() => setFormOpen(true)} disabled={!activeClientId}>+ Add task</button> : undefined} />

      <section className="task-board-controls panel">
        <div><p className="eyebrow">Task routing</p><strong>{props.role === "employee" ? `Tasks sent to ${availableVerticals[0]?.name ?? "your vertical"}` : "Filter the board by support vertical"}</strong></div>
        {props.role !== "employee" && <label><span>Vertical</span><select value={selectedVerticalFilter} onChange={(event) => setVerticalFilter(event.target.value)}><option value="all">All verticals</option>{availableVerticals.map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.name}</option>)}</select></label>}
      </section>

      <section className="task-summary-strip">{boardColumns.map((column) => <article className={`panel task-summary task-summary-${column.id}`} key={column.id}><span>{column.short}</span><div><strong>{counts[column.id]}</strong><small>{column.label}</small></div></article>)}</section>

      {formOpen && <section className="panel task-editor"><div className="panel-head"><div><p className="eyebrow">New request</p><h2>Create a shared task</h2><p>Add urgency, recurrence, and a due date before sending it to the support board.</p></div><button className="secondary-btn" type="button" onClick={() => setFormOpen(false)}>Close</button></div><form className="task-form" onSubmit={createTask}>
        <label className="task-title-field"><span>Task title</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What needs to be completed?" /></label>
        <label className="task-description-field"><span>Description</span><textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add instructions, expected result, and any questions." /></label>
        <label className="task-vertical-field"><span>Send to vertical</span><select required value={selectedTaskVerticalId} onChange={(event) => setForm({ ...form, verticalId: event.target.value })}><option value="" disabled>Choose a support vertical</option>{availableVerticals.map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.name}</option>)}</select></label>
        <label><span>Urgency</span><select value={form.urgency} onChange={(event) => setForm({ ...form, urgency: event.target.value as TaskUrgency })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label><span>Task type</span><select value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value as TaskRecurrence })}><option value="one_time">One-time task</option><option value="daily">Recurring daily</option><option value="weekly">Recurring weekly</option><option value="monthly">Recurring monthly</option></select></label>
        <label><span>Due date</span><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
        <div className="task-form-actions"><button className="secondary-btn" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving ? "Creating…" : "Create task"}</button></div>
      </form></section>}

      {loading ? <section className="panel collaboration-loading"><span className="pulse-loader" /><strong>Loading shared tasks…</strong></section> : <section className="task-board">{boardColumns.map((column) => <div className={`task-column task-column-${column.id}`} key={column.id}><div className="task-column-head"><div><span>{column.short}</span><strong>{column.label}</strong></div><b>{counts[column.id]}</b></div><div className="task-column-list">{tasks.filter((task) => task.task_status === column.id).map((task) => {
        const expanded = expandedTask === task.id;
        return <article className={`panel task-card urgency-${task.urgency}`} key={task.id}>
          <div className="task-card-top"><span className={`urgency-pill urgency-pill-${task.urgency}`}>{task.urgency}</span><span className="recurrence-pill">{task.recurrence === "one_time" ? "One time" : `↻ ${task.recurrence}`}</span></div>
          <span className="task-vertical-pill">{taskVerticalName(task.vertical_id)}</span>
          <h3>{task.title}</h3><p>{task.description}</p>
          <div className="task-meta"><span>Due <strong>{formatWorkspaceDate(task.due_date)}</strong></span><span>By <strong>{task.created_by_name || "Client"}</strong></span></div>
          <div className="task-card-counts"><span>{task.task_comments.length} comments</span><span>{task.task_attachments.length} files</span></div>
          <label className="task-move"><span>Move task</span><select value={task.task_status} onChange={(event) => moveTask(task, event.target.value as TaskStatus)}>{boardColumns.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
          <div className="task-card-actions"><button className="secondary-btn" type="button" onClick={() => setExpandedTask(expanded ? null : task.id)}>{expanded ? "Hide activity" : "Open activity"}</button>{canCreateTasks && <button className="danger-link" type="button" onClick={() => deleteTask(task)}>Delete</button>}</div>
          {expanded && <div className="task-activity"><div className="task-comments"><strong>Conversation</strong>{task.task_comments.length ? [...task.task_comments].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((comment) => <div className="task-comment" key={comment.id}><span>{comment.author_name.slice(0, 2).toUpperCase()}</span><div><strong>{comment.author_name}</strong><p>{comment.body}</p><small>{formatWorkspaceDate(comment.created_at)}</small></div></div>) : <p className="task-activity-empty">No comments yet.</p>}<textarea value={commentDrafts[task.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Comment or ask a question…" /><button className="secondary-btn" type="button" onClick={() => addComment(task)}>Send comment</button></div>
            <div className="task-files"><strong>Files</strong>{task.task_attachments.map((attachment) => <button className="task-file" type="button" onClick={() => openAttachment(attachment)} key={attachment.id}><span>FILE</span><div><strong>{attachment.file_name}</strong><small>{formatFileSize(attachment.file_size)} · {attachment.uploaded_by_name}</small></div></button>)}<label className="task-upload"><input type="file" accept="*/*" onChange={(event) => { void uploadAttachment(task, event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={uploadingTask === task.id} /><span>{uploadingTask === task.id ? "Uploading…" : "+ Upload photo, PDF, CSV, XLSX, or other file"}</span></label></div>
          </div>}
        </article>;
      })}{!counts[column.id] && <div className="task-column-empty">No {column.label.toLowerCase()} tasks</div>}</div></div>)}</section>}
    </div>
  );
}
