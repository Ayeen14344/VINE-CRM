"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  isSupabaseConfigured,
  type PortalProfile,
  supabase,
} from "../lib/supabase-browser";

type Role = "admin" | "employee" | "client";
type Page = "overview" | "recruiting" | "orientation" | "training" | "time";
type Verdict = "pending" | "valid" | "invalid";
type ClientOption = { id: string; company_name: string; primary_email: string };
type UploadPreview = {
  name: string;
  size: string;
  reportId?: string;
  clientName: string;
  verticalName: string;
};

const verticalTemplateMeta: Record<string, { filename: string; summary: string }> = {
  "00000000-0000-4000-8000-000000000101": {
    filename: "Vertical 1 - Sourcing and Hiring.xlsx",
    summary: "Sourcing and Hiring + Background Check sheets / 16 mapped fields",
  },
  "00000000-0000-4000-8000-000000000102": {
    filename: "Vertical 2 - Orientation and ADP Set-up.xlsx",
    summary: "Orientation and ADP Set-up / 10 mapped fields",
  },
  "00000000-0000-4000-8000-000000000103": {
    filename: "Vertical 3 - Training, ORE, and Scheduling.xlsx",
    summary: "Training, ORE, and Scheduling / 9 mapped fields",
  },
  "00000000-0000-4000-8000-000000000104": {
    filename: "Vertical 4 - Time and Attendance.xlsx",
    summary: "Time and Attendance / 17 mapped fields",
  },
};

const verticalOptions = [
  { id: "00000000-0000-4000-8000-000000000101", key: "recruiting" as Page, name: "Sourcing & Hiring" },
  { id: "00000000-0000-4000-8000-000000000102", key: "orientation" as Page, name: "Orientation & ADP Setup" },
  { id: "00000000-0000-4000-8000-000000000103", key: "training" as Page, name: "Training, ORE & Work Scheduling" },
  { id: "00000000-0000-4000-8000-000000000104", key: "time" as Page, name: "Time & Attendance" },
];

const demoClients: ClientOption[] = [
  { id: "10000000-0000-4000-8000-000000000001", company_name: "Northstar Delivery", primary_email: "operations@northstar.example.test" },
  { id: "10000000-0000-4000-8000-000000000002", company_name: "Evergreen Logistics", primary_email: "reports@evergreen.example.test" },
  { id: "10000000-0000-4000-8000-000000000003", company_name: "Summit Route Partners", primary_email: "admin@summitroute.example.test" },
];

const navItems: { id: Page; short: string; label: string }[] = [
  { id: "overview", short: "OV", label: "Overview" },
  { id: "recruiting", short: "SH", label: "Sourcing & Hiring" },
  { id: "orientation", short: "OA", label: "Orientation & ADP" },
  { id: "training", short: "TR", label: "Training & Scheduling" },
  { id: "time", short: "TA", label: "Time & Attendance" },
];

const verticalCards = [
  { id: "recruiting" as Page, num: "01", title: "Sourcing & Hiring", today: 62, month: 468, status: "Updated", tone: "ok" },
  { id: "orientation" as Page, num: "02", title: "Orientation & ADP Setup", today: 24, month: 183, status: "Updated", tone: "ok" },
  { id: "training" as Page, num: "03", title: "Training, ORE & Work Scheduling", today: 17, month: 126, status: "Updated", tone: "ok" },
  { id: "time" as Page, num: "04", title: "Time & Attendance", today: 19, month: 141, status: "3 to review", tone: "review" },
];

const chartA = [48, 57, 42, 65, 78, 51, 43, 68, 82, 74, 61, 88, 72, 91];
const chartB = [22, 29, 18, 33, 26, 37, 24, 35, 40, 31, 45, 38, 49, 43];

const reportConfig = {
  recruiting: {
    title: "Sourcing & Hiring",
    subtitle: "Candidate movement from initial contact through Amazon portal readiness.",
    metrics: [["Contacted from Indeed", 186], ["Reviewed applicants", 70], ["In-person interview", 68], ["Added to Amazon portal", 7], ["Drug tests ordered", 8]],
    rows: [
      ["Dominic Allen", "dominic.allen@example.test", "Amazon Portal", "Jul 25, 2026", "Karen Lee"],
      ["Robert Lipinski", "robert.lipinski@example.test", "Ready for offer", "Jul 25, 2026", "Karen Lee"],
      ["Ryan Harrison", "ryan.harrison@example.test", "Drug test pending", "Jul 24, 2026", "Karen Lee"],
      ["Glenn Washington", "glenn.w@example.test", "Background check", "Jul 24, 2026", "Karen Lee"],
      ["Chris Durham", "chris.durham@example.test", "Offer letter", "Jul 23, 2026", "Karen Lee"],
    ],
  },
  orientation: {
    title: "Orientation & ADP Setup",
    subtitle: "Onboarding documents, offer letters, and payroll readiness.",
    metrics: [["Payroll data collection", 10], ["ID collection", 16], ["Moved to offer letter", 8], ["Ready for ADP", 2], ["Completed this month", 43]],
    rows: [
      ["Houssem Mamri", "DL + I-9 complete", "Ready for ADP", "Jul 25, 2026", "Mia Chen"],
      ["Myloick Watson", "Offer signed", "ADP setup", "Jul 25, 2026", "Mia Chen"],
      ["Tymeer Harris", "I-9 complete", "Offer letter", "Jul 24, 2026", "Mia Chen"],
      ["Zachary Vega", "DL received", "ID collection", "Jul 24, 2026", "Mia Chen"],
      ["Justin Fleming", "Payroll form received", "Data collection", "Jul 23, 2026", "Mia Chen"],
    ],
  },
  training: {
    title: "Training, ORE & Work Scheduling",
    subtitle: "Training readiness, reschedules, and first work deployment.",
    metrics: [["Scheduled for training", 36], ["For reschedule", 5], ["Work deployment", 18], ["ORE completed", 29], ["Completion rate", 84]],
    rows: [
      ["Christopher Lopez", "Training cohort 07/28", "Scheduled", "Jul 25, 2026", "Noah Davis"],
      ["Robert Lipinski", "Route 14 / Wave 2", "Work deployment", "Jul 25, 2026", "Noah Davis"],
      ["Chris Durham", "Awaiting trainer", "For reschedule", "Jul 24, 2026", "Noah Davis"],
      ["Marquis McKnight", "ORE passed", "Work deployment", "Jul 24, 2026", "Noah Davis"],
      ["Kevin Moore", "Training cohort 07/27", "Scheduled", "Jul 23, 2026", "Noah Davis"],
    ],
  },
};

const timeRows = [
  { id: 1, name: "Andre Collins", issue: "Early punch in", detail: "18 min before scheduled shift", date: "Jul 25", hours: "0.30 h" },
  { id: 2, name: "Marcus Bell", issue: "Late punch out", detail: "27 min after route completion", date: "Jul 25", hours: "0.45 h" },
  { id: 3, name: "Jordan Price", issue: "Payroll / Flex mismatch", detail: "Payroll exceeds Flex by 42 min", date: "Jul 24", hours: "0.70 h" },
  { id: 4, name: "Evan Brooks", issue: "Lunch over 1 hour", detail: "Recorded lunch duration: 1h 22m", date: "Jul 24", hours: "0.37 h" },
];

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function roleFromProfile(profile: PortalProfile | null): Role {
  if (profile?.role === "super_admin") return "admin";
  if (profile?.role === "employee") return "employee";
  return "client";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function OpsConsole() {
  const [demoRole, setDemoRole] = useState<Role>("client");
  const [page, setPage] = useState<Page>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [upload, setUpload] = useState<UploadPreview | null>(null);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [clients, setClients] = useState<ClientOption[]>(demoClients);
  const [employeeDspId, setEmployeeDspId] = useState<string | null>(null);

  const role = isSupabaseConfigured ? roleFromProfile(profile) : demoRole;
  const employeeDsp = clients.find((client) => client.id === employeeDspId);
  const selectedClient = role === "employee"
    ? employeeDsp
    : clients.find((client) => client.id === profile?.client_id) ?? clients[0];
  const clientName = selectedClient?.company_name ?? (role === "employee" ? "Choose a DSP" : "Client workspace");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    async function loadPortal(nextSession: Session | null) {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      const [{ data: profileData }, { data: clientData }] = await Promise.all([
        client.from("profiles").select("*").eq("id", nextSession.user.id).single(),
        client.from("clients").select("id, company_name, primary_email").eq("active", true).order("company_name"),
      ]);
      setProfile((profileData as PortalProfile | null) ?? null);
      if (clientData?.length) setClients(clientData as ClientOption[]);
      setAuthReady(true);
    }

    client.auth.getSession().then(({ data }) => loadPortal(data.session));
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      loadPortal(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const pageTitle = useMemo(() => {
    if (role === "admin") return "Super Admin command center";
    if (role === "employee") return "Employee workspace";
    return page === "overview" ? "Operations overview" : navItems.find((item) => item.id === page)?.label ?? "Operations";
  }, [page, role]);

  function selectPage(nextPage: Page) {
    setPage(nextPage);
    setMobileOpen(false);
  }

  async function handleUpload(file: File | undefined, clientId: string, verticalId: string, reportDate: string) {
    if (!file) return;
    const client = clients.find((item) => item.id === clientId);
    const vertical = verticalOptions.find((item) => item.id === verticalId);
    let reportId: string | undefined;

    if (supabase && session && profile) {
      const { data: report, error: reportError } = await supabase
        .from("reports")
        .insert({
          client_id: clientId,
          vertical_id: verticalId,
          report_date: reportDate,
          status: "processing",
          source_filename: file.name,
          content_type: file.type || "application/octet-stream",
          file_size: file.size,
          created_by: profile.id,
          extraction_status: "queued",
        })
        .select("id")
        .single();
      if (reportError || !report) {
        setToast(reportError?.message ?? "The upload could not be started.");
        return;
      }
      reportId = report.id;
      const safeFilename = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
      const path = `${clientId}/${verticalId}/${reportDate}/${report.id}/${safeFilename}`;
      const { error: storageError } = await supabase.storage.from("client-reports").upload(path, file, { upsert: false });
      if (storageError) {
        await supabase.from("reports").update({ status: "failed", extraction_status: storageError.message }).eq("id", report.id);
        setToast(storageError.message);
        return;
      }
      await supabase.from("reports").update({
        source_file_path: path,
        status: "needs_review",
        extraction_status: "sample_parser_ready",
      }).eq("id", report.id);
    }

    setUpload({
      name: file.name,
      size: `${Math.max(0.1, file.size / 1024 / 1024).toFixed(1)} MB`,
      reportId,
      clientName: client?.company_name ?? "Selected client",
      verticalName: vertical?.name ?? "Assigned vertical",
    });
    setToast("File secured and analyzed. Your client preview is ready.");
  }

  async function publishUpload() {
    if (supabase && upload?.reportId && profile) {
      const { error } = await supabase.from("reports").update({
        status: "published",
        published_by: profile.id,
        published_at: new Date().toISOString(),
      }).eq("id", upload.reportId);
      if (error) {
        setToast(error.message);
        return;
      }
    }
    setToast("Daily report published to the client dashboard.");
  }

  async function exportDashboard(format: "csv" | "xlsx" | "pdf" | "png" | "jpeg") {
    const rows = [
      ["Vertical", "Today", "Rolling 30 Days", "Status"],
      ...verticalCards.map((item) => [item.title, item.today, item.month, item.status]),
    ];
    const basename = `VINE-Pulse-${clientName.replace(/\s+/g, "-")}-30-day-report`;

    if (format === "csv") {
      const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${basename}.csv`);
    } else if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "30-Day Summary");
      XLSX.writeFile(book, `${basename}.xlsx`);
    } else if (format === "pdf") {
      const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(20);
      doc.setTextColor(20, 38, 58);
      doc.text("VINE Pulse", 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(0, 140, 99);
      doc.text(`${clientName} | Rolling 30-day operations report`, 14, 25);
      autoTableModule.default(doc, { head: [rows[0]], body: rows.slice(1), startY: 32, theme: "striped", headStyles: { fillColor: [0, 140, 99] } });
      doc.save(`${basename}.pdf`);
    } else {
      const target = document.querySelector<HTMLElement>("[data-export-region]");
      if (!target) return;
      const image = await import("html-to-image");
      const dataUrl = format === "png"
        ? await image.toPng(target, { backgroundColor: "#F5F7F6", pixelRatio: 2 })
        : await image.toJpeg(target, { backgroundColor: "#F5F7F6", pixelRatio: 2, quality: 0.92 });
      const anchor = document.createElement("a");
      anchor.download = `${basename}.${format}`;
      anchor.href = dataUrl;
      anchor.click();
    }
    setToast(`${format.toUpperCase()} export prepared.`);
  }

  if (!authReady) {
    return <div className="loading-screen"><span className="pulse-loader" /><strong>Opening VINE Pulse…</strong></div>;
  }

  if (isSupabaseConfigured && !session) {
    return <LoginScreen onMessage={setToast} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">VP</div>
          <div>
            <span className="brand-name">VINE <em>Pulse</em></span>
            <span className="brand-sub">Reporting & operations</span>
          </div>
        </div>

        <div className="nav-label">{role === "admin" ? "Administration" : role === "employee" ? "Client preview" : "Client reports"}</div>
        <nav className="nav">
          {(role === "admin" ? [{ id: "overview" as Page, short: "SA", label: "Command center" }] : navItems).map((item) => (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => selectPage(item.id)}>
              <span className="nav-icon">{item.short}</span>
              <span className="nav-copy">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <p className="eyebrow">Daily deadline</p>
          <p>Reports are due by 5:00 PM Eastern Time. Missing client/vertical updates are flagged automatically.</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label="Open navigation">☰</button>
          <div className="client-select">
            <div className="client-avatar">{role === "admin" ? "SA" : initials(clientName)}</div>
            <div>
              <strong>{role === "admin" ? "All DSPs" : clientName}</strong>
              <span>{role === "employee" && employeeDsp ? "Active DSP workspace" : isSupabaseConfigured ? "Secure production workspace" : "Demo mode · Supabase ready"}</span>
            </div>
            {role === "employee" && employeeDsp && <button className="link-btn topbar-change-dsp" onClick={() => setEmployeeDspId(null)}>Change DSP</button>}
          </div>
          <div className="top-actions">
            {!isSupabaseConfigured ? (
              <div className="role-switch" aria-label="Switch demo role">
                <button className={role === "admin" ? "active" : ""} onClick={() => setDemoRole("admin")}>Super Admin</button>
                <button className={role === "employee" ? "active" : ""} onClick={() => setDemoRole("employee")}>Employee</button>
                <button className={role === "client" ? "active" : ""} onClick={() => setDemoRole("client")}>Client</button>
              </div>
            ) : (
              <span className="pill">{profile?.role.replace("_", " ")}</span>
            )}
            <button className="icon-btn" aria-label="Notifications" onClick={() => setToast("You have 3 items waiting for attention.")}>3</button>
            <div className="user-avatar">{profile ? initials(profile.full_name || profile.email) : role === "admin" ? "SA" : role === "employee" ? "KL" : "CL"}</div>
            {isSupabaseConfigured && <button className="secondary-btn" onClick={() => supabase?.auth.signOut()}>Sign out</button>}
          </div>
        </header>

        <div className="content">
          {role === "admin" ? (
            <AdminWorkspace
              clients={clients}
              session={session}
              onClientsChange={setClients}
              onMessage={setToast}
            />
          ) : role === "employee" ? (
            employeeDsp ? (
              <EmployeeWorkspace
                client={employeeDsp}
                assignedVerticalId={profile?.vertical_id ?? verticalOptions[0].id}
                upload={upload}
                onFile={handleUpload}
                onPreview={() => setDemoRole("client")}
                onPublish={publishUpload}
                onChangeDsp={() => setEmployeeDspId(null)}
              />
            ) : (
              <DspLanding
                clients={clients}
                assignedVerticalId={profile?.vertical_id ?? verticalOptions[0].id}
                onSelect={setEmployeeDspId}
              />
            )
          ) : (
            <div data-export-region>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{clientName} · Daily report</p>
                  <h1>{pageTitle}</h1>
                  <p>{page === "overview" ? "Summary totals first, with individual names available only inside your company’s operational drill-down. Data is shown in a rolling 30-day window." : "Daily activity, current pipeline, and the last 30 days of updates for this operational vertical."}</p>
                </div>
                <div className="heading-actions">
                  <div className="date-control"><span className="live-dot" /><span>Latest 30 days</span></div>
                  <ExportControl onExport={exportDashboard} />
                </div>
              </div>
              {page === "overview" && <Overview onOpen={selectPage} />}
              {(page === "recruiting" || page === "orientation" || page === "training") && <VerticalReport page={page} onExport={exportDashboard} />}
              {page === "time" && <TimeAttendance verdicts={verdicts} onVerdict={(id, verdict) => {
                setVerdicts((current) => ({ ...current, [id]: verdict }));
                setToast(`Time-theft item marked ${verdict}.`);
              }} />}
            </div>
          )}
        </div>
      </main>
      {toast && <div className="toast" role="status"><span className="toast-mark">✓</span>{toast}</div>}
    </div>
  );
}

function LoginScreen({ onMessage }: { onMessage: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) onMessage(error.message);
  }

  return (
    <main className="login-shell">
      <section className="login-brand-panel">
        <Image src="/vine-pulse-logo.png" width={1680} height={908} priority alt="VINE Pulse - Client Reporting and Operations Portal" />
        <div className="login-proof">
          <span>Secure client separation</span>
          <span>Daily 5 PM ET deadline</span>
          <span>30-day reporting</span>
        </div>
      </section>
      <section className="login-form-panel">
        <form className="login-card" onSubmit={signIn}>
          <p className="eyebrow">Welcome back</p>
          <h1>Sign in to VINE Pulse</h1>
          <p>Use the email and password issued by your Super Admin.</p>
          <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label>Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          <button className="primary-btn login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
          <small>Accounts are created by a VINE Pulse Super Admin. Public registration is disabled.</small>
        </form>
      </section>
    </main>
  );
}

function ExportControl({ onExport }: { onExport: (format: "csv" | "xlsx" | "pdf" | "png" | "jpeg") => void }) {
  return (
    <select className="export-select" defaultValue="" onChange={(event) => {
      if (event.target.value) onExport(event.target.value as "csv" | "xlsx" | "pdf" | "png" | "jpeg");
      event.target.value = "";
    }} aria-label="Export dashboard">
      <option value="" disabled>Export report</option>
      <option value="csv">CSV</option>
      <option value="xlsx">XLSX</option>
      <option value="pdf">PDF</option>
      <option value="png">PNG</option>
      <option value="jpeg">JPEG</option>
    </select>
  );
}

function Overview({ onOpen }: { onOpen: (page: Page) => void }) {
  return (
    <>
      <div className="hero-grid">
        <section className="panel overview-panel">
          <div className="panel-head">
            <div><h2>Today at a glance</h2><p>Summary totals across all four managed verticals</p></div>
            <span className="pill">↑ 12.4% vs. yesterday</span>
          </div>
          <div className="stats-grid">
            <Stat index="01" label="Candidates touched" value="62" note="Contacted or reviewed today" />
            <Stat index="02" label="Onboarding actions" value="24" note="Documents and ADP progress" />
            <Stat index="03" label="Training actions" value="17" note="Scheduled or deployed" />
            <Stat index="04" label="Time exceptions" value="19" note="3 require your review" />
          </div>
          <div className="chart-wrap">
            <div className="chart-meta"><strong>Daily operational volume</strong><div className="legend"><span><i /> Completed</span><span><i className="coral" /> Exceptions</span></div></div>
            <div className="bar-chart" aria-label="Fourteen day operational volume chart">
              {chartA.map((height, i) => <div className="bar-day" key={i}><span className="bar" style={{ height: `${height}%` }} /><span className="bar coral" style={{ height: `${chartB[i]}%` }} /></div>)}
            </div>
            <div className="chart-labels"><span>Jul 12</span><span>14</span><span>16</span><span>18</span><span>20</span><span>22</span><span>Today</span></div>
          </div>
        </section>
        <section className="panel activity-panel">
          <div className="panel-head"><div><h3>Latest updates</h3><p>Published by your VINE Pulse team</p></div><span className="pill">Live</span></div>
          <div className="activity-list">
            {[["TA", "Time exceptions published", "19 records · 3 need validation", "4:28 PM"], ["SH", "Recruiting report updated", "62 candidate actions added", "4:12 PM"], ["OA", "ADP readiness updated", "6 candidates advanced", "3:46 PM"], ["TR", "Deployment schedule published", "4 drivers assigned", "2:18 PM"], ["SH", "Drug test results received", "2 passed · 1 pending", "11:35 AM"]].map(([symbol, title, copy, time]) => (
              <div className="activity-item" key={title}><span className="activity-symbol">{symbol}</span><div><strong>{title}</strong><p>{copy}</p></div><time>{time}</time></div>
            ))}
          </div>
        </section>
      </div>
      <section className="vertical-grid" aria-label="Operational verticals">
        {verticalCards.map((vertical) => (
          <article className="vertical-card" key={vertical.id} onClick={() => onOpen(vertical.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpen(vertical.id)}>
            <div className="vertical-number"><span>VERTICAL {vertical.num}</span><span className={`status-${vertical.tone}`}>{vertical.status}</span></div>
            <h3>{vertical.title}</h3>
            <div className="vertical-metrics"><div><strong>{vertical.today}</strong><span>today</span></div><div><strong>{vertical.month}</strong><span>30 days</span></div></div>
          </article>
        ))}
      </section>
    </>
  );
}

function Stat({ index, label, value, note }: { index: string; label: string; value: string; note: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-index">{index}</span></div><div className="stat-value"><strong>{value}</strong><span className="trend">↑ 8%</span></div><p>{note}</p></div>;
}

function VerticalReport({ page, onExport }: { page: "recruiting" | "orientation" | "training"; onExport: (format: "csv" | "xlsx" | "pdf" | "png" | "jpeg") => void }) {
  const config = reportConfig[page];
  return (
    <div className="section-grid">
      <section className="panel report-panel">
        <div className="panel-head"><div><h2>{config.title}</h2><p>{config.subtitle}</p></div><ExportControl onExport={onExport} /></div>
        <div className="metric-strip">{config.metrics.map(([label, value]) => <div className="metric-cell" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Person</th><th>Current stage</th><th>Last update</th><th>Owner</th></tr></thead>
            <tbody>{config.rows.map(([name, detail, stage, date, owner]) => <tr key={name}><td><div className="person-cell"><span className="person-avatar">{initials(name)}</span><div><strong>{name}</strong><div className="small-muted">{detail}</div></div></div></td><td><span className="pill">{stage}</span></td><td>{date}</td><td>{owner}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <aside className="side-stack">
        <section className="panel side-panel"><div className="panel-head"><div><h3>30-day progress</h3><p>Current pipeline conversion</p></div></div><div className="progress-list">{config.metrics.slice(0, 4).map(([label], index) => <div key={label}><div className="progress-head"><span>{label}</span><span>{Math.max(18, 92 - index * 17)}%</span></div><div className="progress-track"><span style={{ width: `${Math.max(18, 92 - index * 17)}%` }} /></div></div>)}</div></section>
        <section className="panel side-panel"><div className="panel-head"><div><h3>Privacy rule</h3><p>Names are limited to your company</p></div></div><div className="note-box">The overview uses totals. Individual names appear only inside authorized operational detail screens. Raw DL and I-9 documents remain outside the dashboard.</div></section>
      </aside>
    </div>
  );
}

function TimeAttendance({ verdicts, onVerdict }: { verdicts: Record<number, Verdict>; onVerdict: (id: number, verdict: Verdict) => void }) {
  const metrics = [["Missed punches", "7"], ["Missing lunch break", "4"], ["Daily hours violation", "3"], ["7-day rolling", "2"], ["Attendance", "5"]];
  return (
    <div className="section-grid">
      <section className="panel report-panel">
        <div className="panel-head"><div><h2>Time & Attendance</h2><p>Daily exceptions with client validation for potential time theft.</p></div><span className="pill">3 awaiting review</span></div>
        <div className="metric-strip">{metrics.map(([label, value]) => <div className="metric-cell" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Potential time theft</th><th>Date</th><th>Variance</th><th>Client decision</th></tr></thead><tbody>
          {timeRows.map((row) => {
            const verdict = verdicts[row.id] ?? "pending";
            return <tr key={row.id}><td><div className="person-cell"><span className="person-avatar">{initials(row.name)}</span><strong>{row.name}</strong></div></td><td><strong>{row.issue}</strong><div className="small-muted">{row.detail}</div></td><td>{row.date}</td><td>{row.hours}</td><td><div className="validation-btns"><button className={`valid-btn ${verdict === "valid" ? "selected" : ""}`} onClick={() => onVerdict(row.id, "valid")}>Valid</button><button className={`invalid-btn ${verdict === "invalid" ? "selected" : ""}`} onClick={() => onVerdict(row.id, "invalid")}>Invalid</button></div></td></tr>;
          })}
        </tbody></table></div>
      </section>
      <aside className="side-stack"><section className="panel side-panel"><div className="panel-head"><div><h3>Compliance summary</h3><p>Last 30 days</p></div></div><div className="progress-list"><div><div className="progress-head"><span>Exceptions resolved</span><span>89%</span></div><div className="progress-track"><span style={{ width: "89%" }} /></div></div><div><div className="progress-head"><span>Lunch compliance</span><span>94%</span></div><div className="progress-track"><span style={{ width: "94%" }} /></div></div></div></section><section className="panel side-panel"><div className="panel-head"><div><h3>Decision requirement</h3></div></div><div className="note-box">Invalid and Needs More Information decisions require a client comment. VINE Pulse records the decision-maker and timestamp in the audit history.</div></section></aside>
    </div>
  );
}

function DspLanding({ clients, assignedVerticalId, onSelect }: { clients: ClientOption[]; assignedVerticalId: string; onSelect: (clientId: string) => void }) {
  const [query, setQuery] = useState("");
  const vertical = verticalOptions.find((item) => item.id === assignedVerticalId) ?? verticalOptions[0];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = clients.filter((client) =>
    `${client.company_name} ${client.primary_email}`.toLowerCase().includes(normalizedQuery),
  );

  return (
    <section className="dsp-landing" aria-labelledby="dsp-landing-title">
      <div className="dsp-landing-copy">
        <p className="eyebrow">Employee landing page</p>
        <h1 id="dsp-landing-title">Which DSP are you working on?</h1>
        <p>Select an assigned delivery service partner before opening the upload workspace. Your active DSP will remain visible at the top of every page.</p>
        <span className="pill">Assigned vertical · {vertical.name}</span>
      </div>
      <div className="panel dsp-picker-panel">
        <label className="dsp-search">
          <span>Search assigned DSPs</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by company name or email…" autoFocus />
        </label>
        <div className="dsp-results" aria-live="polite">
          {filtered.map((client) => (
            <button className="dsp-choice" key={client.id} onClick={() => onSelect(client.id)}>
              <span className="client-avatar">{initials(client.company_name)}</span>
              <span><strong>{client.company_name}</strong><small>{client.primary_email}</small></span>
              <span className="dsp-open">Open workspace →</span>
            </button>
          ))}
          {!filtered.length && (
            <div className="dsp-empty">
              <strong>No assigned DSP found</strong>
              <span>Try another company name or ask your Super Admin to review your DSP assignments.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function EmployeeWorkspace({ client, assignedVerticalId, upload, onFile, onPreview, onPublish, onChangeDsp }: { client: ClientOption; assignedVerticalId: string; upload: UploadPreview | null; onFile: (file: File | undefined, clientId: string, verticalId: string, reportDate: string) => void; onPreview: () => void; onPublish: () => void; onChangeDsp: () => void }) {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const vertical = verticalOptions.find((item) => item.id === assignedVerticalId) ?? verticalOptions[0];
  const template = verticalTemplateMeta[vertical.id];

  return (
    <>
      <div className="active-dsp-banner">
        <div><span className="client-avatar">{initials(client.company_name)}</span><div><span>Currently working on</span><strong>{client.company_name}</strong></div></div>
        <button className="secondary-btn" onClick={onChangeDsp}>Change DSP</button>
      </div>
      <div className="page-heading">
        <div><p className="eyebrow">Daily data submission · Due 5 PM ET</p><h1>{client.company_name} workspace</h1><p>You are assigned to <strong>{vertical.name}</strong>. Upload the source report, verify the extraction, and publish it to this DSP only.</p></div>
        <span className="pill">One employee · one vertical</span>
      </div>
      {upload && <div className="preview-banner"><div><strong>Preview ready · {upload.name}</strong><p>{upload.size} · {upload.clientName} · {upload.verticalName} · 43 records recognized</p></div><div className="preview-actions"><button className="secondary-btn" onClick={onPreview}>View client preview</button><button className="primary-btn" onClick={onPublish}>Publish update</button></div></div>}
      <div className="upload-hero">
        <section className="panel upload-panel">
          <div className="panel-head"><div><h2>Upload today&apos;s source</h2><p>Files are stored in {client.company_name}&apos;s private Supabase folder</p></div><span className="pill">Private storage</span></div>
          <div className="upload-context">
            <label>DSP<input value={client.company_name} readOnly /></label>
            <label>Report date<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
            <label>Vertical<input value={vertical.name} readOnly /></label>
          </div>
          <label className="dropzone">
            <input type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpeg,.jpg" onChange={(event) => onFile(event.target.files?.[0], client.id, vertical.id, reportDate)} aria-label="Upload daily source report" />
            <div><div className="upload-icon">↑</div><h3>{upload ? upload.name : "Drop a report here or click to browse"}</h3><p>{upload ? "Analysis complete — your preview is ready." : "Accepted: Excel, CSV, PDF, PNG, and JPEG up to 25 MB."}</p><div className="file-types"><span>XLSX</span><span>CSV</span><span>PDF</span><span>PNG</span><span>JPEG</span></div></div>
          </label>
        </section>
        <section className="panel steps-panel">
          <div className="panel-head"><div><h3>Employee resources</h3><p>Use the approved report for your vertical</p></div></div>
          <div className="template-callout"><strong>{template.summary}</strong><span>Mapped from the report supplied for this vertical.</span></div>
          <a className="resource-link" href={`/templates/verticals/${encodeURIComponent(template.filename)}`} download>Download your vertical template <span>→</span></a>
          {[["Upload source", `This upload is locked to ${client.company_name}.`], ["Review extraction", "Confirm totals, names, stages, and exceptions."], ["Preview client view", "See the dashboard before it is visible."], ["Publish update", "Add today’s data to the rolling 30-day report."]].map(([title, copy], index) => <div className="step" key={title}><span className="step-number">0{index + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}
        </section>
      </div>
    </>
  );
}

function AdminWorkspace({ clients, session, onClientsChange, onMessage }: { clients: ClientOption[]; session: Session | null; onClientsChange: (clients: ClientOption[]) => void; onMessage: (message: string) => void }) {
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [users, setUsers] = useState([
    { name: "Karen Lee", email: "karen.lee@example.test", role: "Employee", assignment: "Sourcing & Hiring · 3 clients" },
    { name: "Mia Chen", email: "mia.chen@example.test", role: "Employee", assignment: "Orientation & ADP · 3 clients" },
    { name: "Jordan Avery", email: "jordan.avery@example.test", role: "Client", assignment: "Northstar Delivery" },
  ]);
  const [userForm, setUserForm] = useState({ fullName: "", email: "", password: "", role: "employee", clientId: clients[0]?.id ?? "", verticalId: verticalOptions[0].id, clientIds: [] as string[] });

  async function addClient(event: React.FormEvent) {
    event.preventDefault();
    if (!clientCompany.trim() || !clientEmail.trim()) return;
    if (supabase && session) {
      const { data, error } = await supabase.from("clients").insert({ company_name: clientCompany.trim(), primary_email: clientEmail.trim().toLowerCase(), created_by: session.user.id }).select("id, company_name, primary_email").single();
      if (error) return onMessage(error.message);
      onClientsChange([...clients, data as ClientOption].sort((a, b) => a.company_name.localeCompare(b.company_name)));
    } else {
      onClientsChange([...clients, { id: crypto.randomUUID(), company_name: clientCompany.trim(), primary_email: clientEmail.trim().toLowerCase() }]);
    }
    setClientCompany("");
    setClientEmail("");
    onMessage("DSP workspace created.");
  }

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    if (!userForm.fullName || !userForm.email || !userForm.password) return;
    if (userForm.role === "employee" && !userForm.clientIds.length) {
      onMessage("Select at least one DSP for this employee.");
      return;
    }
    if (supabase && session) {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          ...userForm,
          clientId: userForm.role === "client" ? userForm.clientId : null,
          verticalId: userForm.role === "employee" ? userForm.verticalId : null,
          clientIds: userForm.role === "employee" ? userForm.clientIds : [],
          role: userForm.role === "admin" ? "super_admin" : userForm.role,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) return onMessage(result.error ?? "User creation failed.");
    }
    const vertical = verticalOptions.find((item) => item.id === userForm.verticalId);
    const client = clients.find((item) => item.id === userForm.clientId);
    setUsers([...users, { name: userForm.fullName, email: userForm.email, role: userForm.role === "admin" ? "Super Admin" : userForm.role === "employee" ? "Employee" : "Client", assignment: userForm.role === "employee" ? `${vertical?.name} · ${userForm.clientIds.length} DSPs` : userForm.role === "client" ? client?.company_name ?? "Client" : "All access" }]);
    setUserForm({ ...userForm, fullName: "", email: "", password: "" });
    onMessage("User account created.");
  }

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">System-wide visibility</p><h1>Super Admin command center</h1><p>Create DSP workspaces, issue employee and client accounts, and assign one vertical per employee across selected DSPs.</p></div><span className="pill">5 PM ET daily deadline</span></div>
      <div className="admin-stat-grid">
        <Stat index="01" label="Active DSPs" value={String(clients.length)} note="Manually managed workspaces" />
        <Stat index="02" label="Portal users" value={String(users.length)} note="Admins, employees, and clients" />
        <Stat index="03" label="Vertical coverage" value="100%" note="One owner per client/vertical" />
        <Stat index="04" label="Reports due" value="12" note="Today by 5:00 PM ET" />
      </div>
      <div className="admin-form-grid">
        <section className="panel admin-form-panel">
          <div className="panel-head"><div><h2>Add DSP</h2><p>Create a workspace from company name and primary email</p></div></div>
          <form className="admin-form" onSubmit={addClient}>
            <label>Company name<input required value={clientCompany} onChange={(event) => setClientCompany(event.target.value)} placeholder="Example Logistics LLC" /></label>
            <label>Primary DSP email<input required type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} placeholder="operations@example.com" /></label>
            <button className="primary-btn">Create DSP workspace</button>
          </form>
        </section>
        <section className="panel admin-form-panel">
          <div className="panel-head"><div><h2>Add user</h2><p>Email/password access with role-based permissions</p></div></div>
          <form className="admin-form" onSubmit={addUser}>
            <div className="form-row"><label>Full name<input required value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} /></label><label>Email<input required type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label></div>
            <div className="form-row"><label>Temporary password<input required minLength={10} type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} placeholder="Minimum 10 characters" /></label><label>Role<select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="employee">Employee</option><option value="client">Client</option><option value="admin">Super Admin</option></select></label></div>
            {userForm.role === "employee" && <label>Employee vertical<select value={userForm.verticalId} onChange={(event) => setUserForm({ ...userForm, verticalId: event.target.value })}>{verticalOptions.map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.name}</option>)}</select><small>The employee will be assigned this one vertical across all selected DSPs.</small></label>}
            {userForm.role === "employee" && <fieldset className="dsp-assignment-fieldset"><legend>Assigned DSPs</legend><div className="dsp-assignment-list">{clients.map((client) => <label key={client.id}><input type="checkbox" checked={userForm.clientIds.includes(client.id)} onChange={(event) => setUserForm({ ...userForm, clientIds: event.target.checked ? [...userForm.clientIds, client.id] : userForm.clientIds.filter((id) => id !== client.id) })} /><span>{client.company_name}</span></label>)}</div><small>Only selected DSPs will appear on the employee landing page.</small></fieldset>}
            {userForm.role === "client" && <label>Client company<select value={userForm.clientId} onChange={(event) => setUserForm({ ...userForm, clientId: event.target.value })}>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select></label>}
            <button className="primary-btn">Create user account</button>
          </form>
        </section>
      </div>
      <div className="admin-table-grid">
        <section className="panel report-panel">
          <div className="panel-head"><div><h2>DSPs</h2><p>Every DSP is isolated by database and Storage policies</p></div></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Company</th><th>Primary email</th><th>Status</th></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td><strong>{client.company_name}</strong></td><td>{client.primary_email}</td><td><span className="status-ok">Active</span></td></tr>)}</tbody></table></div>
        </section>
        <section className="panel report-panel">
          <div className="panel-head"><div><h2>Users & assignments</h2><p>Employee verticals and client membership</p></div></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Access</th></tr></thead><tbody>{users.map((user) => <tr key={user.email}><td><div className="person-cell"><span className="person-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><div className="small-muted">{user.email}</div></div></div></td><td><span className="pill">{user.role}</span></td><td>{user.assignment}</td></tr>)}</tbody></table></div>
        </section>
      </div>
      <section className="panel admin-resource-panel">
        <div><p className="eyebrow">Approved resources</p><h3>Vertical report templates</h3><p>The four supplied workbooks are now mapped to their matching employee vertical.</p></div>
        <div className="preview-actions">{verticalOptions.map((vertical, index) => <a className="secondary-btn link-btn" key={vertical.id} href={`/templates/verticals/${encodeURIComponent(verticalTemplateMeta[vertical.id].filename)}`} download>V{index + 1} XLSX</a>)}</div>
      </section>
    </>
  );
}
