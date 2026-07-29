"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  isSupabaseConfigured,
  type PortalProfile,
  supabase,
} from "../lib/supabase-browser";
import {
  extractReportFromFile,
  type ExtractedReportMetric,
  type ExtractedReportRow,
} from "../lib/report-extraction";
import { workspaceRowsFromSaved } from "../lib/vertical-workspace";
import {
  EmployeeDataWorkspace,
  GeneratedRecordLists,
} from "./vertical-data-workspace";

type Role = "admin" | "employee" | "client";
type Page = "overview" | "admin-reports" | "recruiting" | "orientation" | "training" | "time";
type Verdict = "pending" | "valid" | "invalid";
type SignalTone = "success" | "warning" | "danger" | "neutral";
type ResetScope = "reports" | "workspace";
type ClientOption = { id: string; company_name: string; primary_email: string };
type UploadPreview = {
  name: string;
  size: string;
  reportId?: string;
  clientName: string;
  verticalName: string;
  verticalId: string;
  reportDate: string;
  metrics: ExtractedReportMetric[];
  rows: ExtractedReportRow[];
  published: boolean;
};
type ReportMetric = [string, number];
type AdminUser = { id: string; name: string; email: string; role: string; assignment: string };
type ResetResult = {
  error?: string;
  details?: string[];
  reportsDeleted?: number;
  filesDeleted?: number;
  usersDeleted?: number;
  clientsDeleted?: number;
  warnings?: string[];
};
type SavedMetric = {
  metric_key: string;
  metric_label: string;
  numeric_value: number | string | null;
  text_value: string | null;
};
type SavedRow = {
  id: string;
  row_type: string;
  person_name: string | null;
  data: Record<string, string | number | boolean | null>;
  source_row: number | null;
};
type PublishedReport = {
  id: string;
  vertical_id: string;
  report_date: string;
  version: number;
  published_at: string | null;
  report_metrics: SavedMetric[];
  report_rows: SavedRow[];
};

const verticalTemplateMeta: Record<string, { filename: string; summary: string }> = {
  "00000000-0000-4000-8000-000000000101": {
    filename: "Vertical 1 - Sourcing and Hiring.xlsx",
    summary: "Sourcing, interview results, Cortex onboarding, background check, and drug test / 17 mapped fields",
  },
  "00000000-0000-4000-8000-000000000102": {
    filename: "Vertical 2 - Orientation and ADP Set-up.xlsx",
    summary: "Orientation, safety standard, ADP payroll, training schedule, and remarks / 13 mapped fields",
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

const navItems: { id: Page; short: string; label: string }[] = [
  { id: "overview", short: "OV", label: "Overview" },
  { id: "recruiting", short: "SH", label: "Sourcing & Hiring" },
  { id: "orientation", short: "OA", label: "Orientation & ADP" },
  { id: "training", short: "TR", label: "Training & Scheduling" },
  { id: "time", short: "TA", label: "Time & Attendance" },
];

const adminNavItems: { id: Page; short: string; label: string }[] = [
  { id: "overview", short: "SA", label: "Command center" },
  { id: "admin-reports", short: "AR", label: "All vertical reports" },
];

const reportConfig: Record<"recruiting" | "orientation" | "training", {
  title: string;
  subtitle: string;
  emptyMetrics: ReportMetric[];
}> = {
  recruiting: {
    title: "Sourcing & Hiring",
    subtitle: "Interview booking, hiring results, Cortex onboarding, background checks, and drug tests.",
    emptyMetrics: [["Contacted from Indeed", 0], ["Reviewed applicants", 0], ["In-person interview", 0], ["Added to Amazon portal", 0], ["Drug tests ordered", 0], ["Interview passed", 0], ["Interview failed", 0], ["Cortex onboarded", 0]],
  },
  orientation: {
    title: "Orientation & ADP Setup",
    subtitle: "Orientation completion, safety standards, ADP payroll completion, and training readiness.",
    emptyMetrics: [["Payroll data collection", 0], ["ID collection", 0], ["Moved to offer letter", 0], ["Ready for ADP", 0], ["Orientation completed", 0], ["ADP setup completed", 0]],
  },
  training: {
    title: "Training, ORE & Work Scheduling",
    subtitle: "Training outcomes, reschedules, ORE readiness, and first work deployment.",
    emptyMetrics: [["Scheduled for training", 0], ["Training passed", 0], ["Training failed", 0], ["For reschedule", 0], ["Work deployment", 0]],
  },
};

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

function metricNumber(metric: SavedMetric) {
  const value = Number(metric.numeric_value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dedupePublishedReports(reports: PublishedReport[]) {
  const latest = new Map<string, PublishedReport>();
  reports.forEach((report) => {
    const key = `${report.vertical_id}:${report.report_date}`;
    const current = latest.get(key);
    if (!current || report.version > current.version) latest.set(key, report);
  });
  return Array.from(latest.values()).sort((a, b) => b.report_date.localeCompare(a.report_date));
}

function reportsForPage(reports: PublishedReport[], page: Page) {
  const vertical = verticalOptions.find((option) => option.key === page);
  return vertical ? reports.filter((report) => report.vertical_id === vertical.id) : [];
}

function reportTotal(report: PublishedReport | undefined) {
  return report?.report_metrics.reduce((sum, item) => sum + metricNumber(item), 0) ?? 0;
}

function buildVerticalCards(reports: PublishedReport[]) {
  return verticalOptions.map((vertical, index) => {
    const matching = reports.filter((report) => report.vertical_id === vertical.id);
    const latest = matching[0];
    return {
      id: vertical.key,
      num: `0${index + 1}`,
      title: vertical.name,
      today: reportTotal(latest),
      month: matching.reduce((sum, report) => sum + reportTotal(report), 0),
      status: latest ? `Updated ${latest.report_date}` : "Awaiting report",
      tone: latest ? "ok" : "review",
    };
  });
}

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function hasDisplayValue(value: SavedRow["data"][string]) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function mergeReportRows(rows: SavedRow[]) {
  const merged = new Map<string, SavedRow>();
  rows.forEach((row) => {
    const identity = String(
      row.data.email ??
        row.data.phone_number ??
        row.person_name ??
        `${row.row_type}:${row.source_row ?? row.id}`,
    )
      .trim()
      .toLowerCase();
    const current = merged.get(identity);
    if (!current) {
      merged.set(identity, { ...row, data: { ...row.data } });
      return;
    }
    const nextData = { ...current.data };
    Object.entries(row.data).forEach(([key, value]) => {
      if (hasDisplayValue(value)) nextData[key] = value;
    });
    merged.set(identity, {
      ...current,
      person_name: current.person_name || row.person_name,
      data: nextData,
    });
  });
  return Array.from(merged.values());
}

const detailColumns: Record<
  "recruiting" | "orientation" | "training",
  { key: string; label: string; date?: boolean; status?: boolean }[]
> = {
  recruiting: [
    { key: "scheduled_interview", label: "Interview booking", date: true },
    { key: "interview_result", label: "Interview result", status: true },
    { key: "cortex_onboarded", label: "Cortex onboarded", status: true },
    { key: "background_check", label: "Background check", status: true },
    { key: "drug_test", label: "Drug test", status: true },
  ],
  orientation: [
    { key: "orientation_docs_adp_status", label: "Orientation status", status: true },
    { key: "orientation_completed", label: "Orientation completed", date: true },
    { key: "adp_payroll_setup", label: "ADP setup", date: true },
    { key: "adp_payroll_completed", label: "ADP completed", date: true },
    { key: "training_schedule", label: "Training schedule" },
    { key: "remarks", label: "Remarks", status: true },
  ],
  training: [
    { key: "training_status", label: "Training status", status: true },
    { key: "day_1_attendance", label: "Day 1", status: true },
    { key: "day_2_attendance", label: "Day 2", status: true },
    { key: "ore_schedule", label: "ORE schedule", date: true },
    { key: "work_schedule_plotted", label: "Work schedule" },
  ],
};

function signalTone(value: SavedRow["data"][string]): SignalTone {
  const text = String(value ?? "").toLowerCase();
  if (/fail|off.?board|invalid|violation|absent|time.?theft|missed punch/.test(text)) return "danger";
  if (/resched|pending|progress|incomplete|not complete|scheduling|dns|half.?day|needs review/.test(text)) return "warning";
  if (/pass|complete|active|onboard|yes|present|valid|ready/.test(text)) return "success";
  return "neutral";
}

function statusTone(value: SavedRow["data"][string]) {
  return `detail-status-${signalTone(value)}`;
}

function rowTone(data: SavedRow["data"]): SignalTone {
  const tones = Object.entries(data)
    .filter(([key]) => /status|result|attendance|remarks|cortex|background|drug_test|time_theft|violation/.test(key))
    .map(([, value]) => signalTone(value));
  if (tones.includes("danger")) return "danger";
  if (tones.includes("warning")) return "warning";
  if (tones.includes("success")) return "success";
  return "neutral";
}

function metricTone(label: string, value: number | string): SignalTone {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "neutral";
  const text = label.toLowerCase();
  if (/fail|violation|theft|absent|invalid/.test(text)) return "danger";
  if (/resched|pending|awaiting|missing|missed/.test(text)) return "warning";
  if (/pass|complete|onboard|ready|scheduled|contacted|reviewed|added/.test(text)) return "success";
  return "neutral";
}

function DetailValue({
  value,
  date,
  status,
}: {
  value: SavedRow["data"][string];
  date?: boolean;
  status?: boolean;
}) {
  if (!hasDisplayValue(value)) return <span className="detail-empty">Not reported</span>;
  const text = date ? displayDate(String(value)) : String(value);
  return status ? <span className={`detail-status ${statusTone(value)}`}>{text}</span> : <span>{text}</span>;
}

function StatusLegend() {
  return (
    <div className="status-legend" aria-label="Report color guide">
      <span><i className="legend-dot legend-success" />Completed / Passed / Valid</span>
      <span><i className="legend-dot legend-warning" />Pending / Reschedule / Review</span>
      <span><i className="legend-dot legend-danger" />Failed / Invalid / Violation</span>
      <span><i className="legend-dot legend-neutral" />Not reported / Informational</span>
    </div>
  );
}

export function OpsConsole() {
  const [page, setPage] = useState<Page>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [upload, setUpload] = useState<UploadPreview | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [employeeDspId, setEmployeeDspId] = useState<string | null>(null);
  const [publishedReports, setPublishedReports] = useState<PublishedReport[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Legacy upload support remains available for historical reports, but the
  // employee UI now uses the in-app workspace below.
  void previewOpen;
  void handleUpload;
  void publishUpload;
  void EmployeeWorkspace;

  const role = roleFromProfile(profile);
  const employeeDsp = clients.find((client) => client.id === employeeDspId);
  const selectedClient = role === "employee"
    ? employeeDsp
    : clients.find((client) => client.id === profile?.client_id) ?? clients[0];
  const clientName = selectedClient?.company_name ?? (role === "employee" ? "Choose a DSP" : "Client workspace");
  const verticalCards = useMemo(() => buildVerticalCards(publishedReports), [publishedReports]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!supabase) return;
    const portalClient = supabase;

    async function loadPortal(nextSession: Session | null) {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      const [{ data: profileData }, { data: clientData }] = await Promise.all([
        portalClient.from("profiles").select("*").eq("id", nextSession.user.id).single(),
        portalClient.from("clients").select("id, company_name, primary_email").eq("active", true).order("company_name"),
      ]);
      setProfile((profileData as PortalProfile | null) ?? null);
      setClients((clientData as ClientOption[] | null) ?? []);
      setAuthReady(true);
    }

    portalClient.auth.getSession().then(({ data }) => loadPortal(data.session));
    const { data: listener } = portalClient.auth.onAuthStateChange((_event, nextSession) => {
      loadPortal(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || !selectedClient?.id || role === "admin") {
      return;
    }
    const selectedClientId = selectedClient.id;
    let active = true;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29);
    async function loadPublishedReports() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("reports")
        .select("id, vertical_id, report_date, version, published_at, report_metrics(metric_key, metric_label, numeric_value, text_value), report_rows(id, row_type, person_name, data, source_row)")
        .eq("client_id", selectedClientId)
        .eq("status", "published")
        .gte("report_date", startDate.toISOString().slice(0, 10))
        .order("report_date", { ascending: false })
        .order("version", { ascending: false });
        if (!active) return;
        if (error) {
          setToast(`Client reports could not be loaded: ${error.message}`);
          setPublishedReports([]);
        } else {
          setPublishedReports(dedupePublishedReports((data ?? []) as unknown as PublishedReport[]));
        }
    }
    loadPublishedReports();
    const refreshTimer = window.setInterval(loadPublishedReports, 30000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [role, selectedClient?.id, session]);

  const pageTitle = useMemo(() => {
    if (role === "admin") return page === "admin-reports" ? "All vertical reports" : "Super Admin command center";
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
    let extraction;

    try {
      setToast("Reading the uploaded report…");
      extraction = await extractReportFromFile(file, verticalId);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The report could not be read.");
      return;
    }

    if (supabase && session && profile) {
      const { data: previousReports } = await supabase
        .from("reports")
        .select("version")
        .eq("client_id", clientId)
        .eq("vertical_id", verticalId)
        .eq("report_date", reportDate)
        .order("version", { ascending: false })
        .limit(1);
      const version = Number(previousReports?.[0]?.version ?? 0) + 1;
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
          version,
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

      const [{ error: metricError }, { error: rowError }] = await Promise.all([
        supabase.from("report_metrics").insert(extraction.metrics.map((item) => ({
          report_id: report.id,
          metric_key: item.key,
          metric_label: item.label,
          numeric_value: item.value,
        }))),
        supabase.from("report_rows").insert(extraction.rows.map((item) => ({
          report_id: report.id,
          row_type: item.sheetName,
          person_name: item.personName,
          data: item.data,
          source_row: item.sourceRow,
          confidence: 1,
        }))),
      ]);
      if (metricError || rowError) {
        const message = metricError?.message ?? rowError?.message ?? "Extracted data could not be saved.";
        await supabase.from("reports").update({ status: "failed", extraction_status: message }).eq("id", report.id);
        setToast(message);
        return;
      }

      await supabase.from("reports").update({
        source_file_path: path,
        status: "needs_review",
        extraction_status: "complete",
        extraction_summary: {
          row_count: extraction.rows.length,
          metric_count: extraction.metrics.length,
          sheets: Array.from(new Set(extraction.rows.map((item) => item.sheetName))),
        },
      }).eq("id", report.id);
    }

    setUpload({
      name: file.name,
      size: `${Math.max(0.1, file.size / 1024 / 1024).toFixed(1)} MB`,
      reportId,
      clientName: client?.company_name ?? "Selected client",
      verticalName: vertical?.name ?? "Assigned vertical",
      verticalId,
      reportDate,
      metrics: extraction.metrics,
      rows: extraction.rows,
      published: false,
    });
    setPreviewOpen(true);
    setToast(`${extraction.rows.length} report record${extraction.rows.length === 1 ? "" : "s"} extracted and ready for review.`);
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
    setUpload((current) => current ? { ...current, published: true } : current);
    setPreviewOpen(false);
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

  if (!isSupabaseConfigured) {
    return <ConfigurationRequired />;
  }

  if (!authReady) {
    return <div className="loading-screen"><span className="pulse-loader" /><strong>Opening VINE Pulse…</strong></div>;
  }

  if (!session) {
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
          {(role === "admin" ? adminNavItems : navItems).map((item) => (
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
              <span>{role === "employee" && employeeDsp ? "Active DSP workspace" : "Secure production workspace"}</span>
            </div>
            {role === "employee" && employeeDsp && <button className="link-btn topbar-change-dsp" onClick={() => setEmployeeDspId(null)}>Change DSP</button>}
          </div>
          <div className="top-actions">
            <span className="pill">{profile?.role.replace("_", " ")}</span>
            <button className="icon-btn" aria-label="Notifications" onClick={() => setToast("No pending notifications.")}>0</button>
            <div className="user-avatar">{profile ? initials(profile.full_name || profile.email) : "VP"}</div>
            <button className="secondary-btn" onClick={() => supabase?.auth.signOut()}>Sign out</button>
          </div>
        </header>

        <div className="content">
          {role === "admin" ? (
            page === "admin-reports" && profile ? (
              <AdminReportAccess clients={clients} profile={profile} onMessage={setToast} />
            ) : (
              <AdminWorkspace
                clients={clients}
                session={session}
                onClientsChange={setClients}
                onMessage={setToast}
              />
            )
          ) : role === "employee" ? (
            employeeDsp ? (
              session && profile ? (
                <EmployeeDataWorkspace
                  client={employeeDsp}
                  verticalId={profile.vertical_id ?? verticalOptions[0].id}
                  verticalName={verticalOptions.find((item) => item.id === profile.vertical_id)?.name ?? verticalOptions[0].name}
                  profile={profile}
                  onMessage={setToast}
                  onChangeDsp={() => setEmployeeDspId(null)}
                />
              ) : null
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
              {page === "overview" && <Overview onOpen={selectPage} reports={publishedReports} />}
              {(page === "recruiting" || page === "orientation" || page === "training") && <VerticalReport page={page} reports={publishedReports} onExport={exportDashboard} />}
              {page === "time" && <TimeAttendance reports={publishedReports} verdicts={verdicts} onVerdict={(id, verdict) => {
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

function ConfigurationRequired() {
  return (
    <main className="login-shell">
      <section className="login-brand-panel">
        <Image src="/vine-pulse-logo.png" width={1680} height={908} priority alt="VINE Pulse - Client Reporting and Operations Portal" />
      </section>
      <section className="login-form-panel">
        <div className="login-card">
          <p className="eyebrow">Configuration required</p>
          <h1>VINE Pulse is not connected</h1>
          <p>The production Supabase connection is missing. Contact the system administrator before using this portal.</p>
        </div>
      </section>
    </main>
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

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state-mark">0</span>
      <div><strong>{title}</strong><p>{copy}</p></div>
    </div>
  );
}

function Overview({ onOpen, reports }: { onOpen: (page: Page) => void; reports: PublishedReport[] }) {
  const cards = buildVerticalCards(reports);
  return (
    <>
      <div className="hero-grid">
        <section className="panel overview-panel">
          <div className="panel-head">
            <div><h2>Today at a glance</h2><p>Summary totals across all four managed verticals</p></div>
            <span className="pill">Live data only</span>
          </div>
          <div className="stats-grid">
            {cards.map((card) => <Stat key={card.id} index={card.num} label={card.title} value={String(card.today)} note={card.status} />)}
          </div>
          {!reports.length && <EmptyState title="No operational data yet" copy="Your first published report will create the dashboard totals and rolling 30-day history." />}
        </section>
        <section className="panel activity-panel">
          <div className="panel-head"><div><h3>Latest updates</h3><p>Published by your VINE Pulse team</p></div><span className="pill">Live</span></div>
          {reports.length ? <div className="activity-list">{reports.slice(0, 6).map((report) => {
            const vertical = verticalOptions.find((item) => item.id === report.vertical_id);
            return <div className="activity-item" key={report.id}><span className="activity-symbol">{vertical?.key.slice(0, 2).toUpperCase()}</span><div><strong>{vertical?.name ?? "Operational report"}</strong><p>{report.report_rows.length} records · {reportTotal(report)} tracked actions</p></div><time>{displayDate(report.report_date)}</time></div>;
          })}</div> : <EmptyState title="No updates published" copy="Updates will appear here after an assigned employee publishes a client report." />}
        </section>
      </div>
      <section className="vertical-grid" aria-label="Operational verticals">
        {cards.map((vertical) => (
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
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-index">{index}</span></div><div className="stat-value"><strong>{value}</strong></div><p>{note}</p></div>;
}

function VerticalReport({ page, reports, onExport }: { page: "recruiting" | "orientation" | "training"; reports: PublishedReport[]; onExport: (format: "csv" | "xlsx" | "pdf" | "png" | "jpeg") => void }) {
  const config = reportConfig[page];
  const matching = reportsForPage(reports, page);
  const latest = matching[0];
  const columns = detailColumns[page];
  const metrics: ReportMetric[] = latest
    ? latest.report_metrics.map((item) => [item.metric_label, metricNumber(item)])
    : config.emptyMetrics;
  const rows = matching
    .flatMap((report) => mergeReportRows(report.report_rows).map((row) => ({ report, row })))
    .slice(0, 100);
  const recordCount = matching.reduce((sum, report) => sum + report.report_rows.length, 0);
  const generatedRows = latest
    ? workspaceRowsFromSaved(mergeReportRows(latest.report_rows), latest.vertical_id)
    : [];
  return (
    <div className="section-grid">
      <section className="panel report-panel">
        <div className="panel-head"><div><h2>{config.title}</h2><p>{config.subtitle}</p></div><ExportControl onExport={onExport} /></div>
        <div className="metric-strip">{metrics.map(([label, value]) => <div className={`metric-cell metric-tone-${metricTone(label, value)}`} key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <StatusLegend />
        <div className="table-wrap">
          <table className="data-table detail-data-table">
            <thead><tr><th>Person</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Report date</th></tr></thead>
            <tbody>
              {rows.map(({ report, row }) => {
                const detail = String(row.data.email ?? row.data.phone_number ?? row.row_type);
                return <tr className={`report-row report-row-${rowTone(row.data)}`} key={`${report.id}:${row.id}`}>
                  <td><div className="person-cell"><span className="person-avatar">{initials(row.person_name ?? "VP")}</span><div><strong>{row.person_name ?? "Unnamed record"}</strong><div className="small-muted">{detail}</div></div></div></td>
                  {columns.map((column) => <td key={column.key}><DetailValue value={row.data[column.key]} date={column.date} status={column.status} /></td>)}
                  <td>{displayDate(report.report_date)}</td>
                </tr>;
              })}
              {!rows.length && <tr><td colSpan={columns.length + 2}><EmptyState title="No report rows yet" copy="Published records for this vertical will appear here." /></td></tr>}
            </tbody>
          </table>
        </div>
        <GeneratedRecordLists verticalId={verticalOptions.find((item) => item.key === page)?.id ?? ""} rows={generatedRows} title="Client operational lists" />
      </section>
      <aside className="side-stack">
        <section className="panel side-panel"><div className="panel-head"><div><h3>30-day activity</h3><p>Published source reports</p></div></div>{matching.length ? <div className="metric-strip compact-metrics"><div className="metric-cell"><strong>{matching.length}</strong><span>reporting days</span></div><div className="metric-cell"><strong>{recordCount}</strong><span>records</span></div></div> : <EmptyState title="No progress data" copy="Progress rates will be calculated after reports are published." />}</section>
        <section className="panel side-panel"><div className="panel-head"><div><h3>Privacy rule</h3><p>Names are limited to your company</p></div></div><div className="note-box">The overview uses totals. Individual names appear only inside authorized operational detail screens. Raw DL and I-9 documents remain outside the dashboard.</div></section>
      </aside>
    </div>
  );
}

function TimeAttendance({ reports, verdicts, onVerdict }: { reports: PublishedReport[]; verdicts: Record<string, Verdict>; onVerdict: (id: string, verdict: Verdict) => void }) {
  const matching = reportsForPage(reports, "time");
  const latest = matching[0];
  const metrics = latest
    ? latest.report_metrics.map((item) => [item.metric_label, String(metricNumber(item))])
    : [["Missed punches", "0"], ["Missing lunch break", "0"], ["Daily hours violation", "0"], ["7-day rolling", "0"], ["Attendance", "0"], ["Potential time theft", "0"]];
  const rows = matching.flatMap((report) => report.report_rows.map((row) => ({ report, row }))).slice(0, 100);
  const awaitingReview = rows.filter(({ row }) => row.data.possible_time_theft).length;
  const generatedRows = latest ? workspaceRowsFromSaved(latest.report_rows, latest.vertical_id) : [];
  return (
    <div className="section-grid">
      <section className="panel report-panel">
        <div className="panel-head"><div><h2>Time & Attendance</h2><p>Daily exceptions with client validation for potential time theft.</p></div><span className="pill">{awaitingReview} awaiting review</span></div>
        <div className="metric-strip">{metrics.map(([label, value]) => <div className={`metric-cell metric-tone-${metricTone(label, value)}`} key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <StatusLegend />
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Potential time theft</th><th>Date</th><th>Variance</th><th>Client decision</th></tr></thead><tbody>
          {rows.map(({ report, row }) => {
            const verdict = verdicts[row.id] ?? "pending";
            const issue = String(row.data.possible_time_theft ?? (row.data.missed_punch_in || row.data.missed_punch_out ? "Missed punch" : "Attendance record"));
            const detail = `Sign in: ${String(row.data.sign_in_difference ?? "—")} · Sign out: ${String(row.data.sign_out_difference ?? "—")}`;
            const variance = `${String(row.data.sign_in_difference ?? "0")} / ${String(row.data.sign_out_difference ?? "0")}`;
            return <tr className={`report-row report-row-${verdict === "invalid" ? "danger" : verdict === "valid" ? "success" : rowTone(row.data)}`} key={row.id}><td><div className="person-cell"><span className="person-avatar">{initials(row.person_name ?? "VP")}</span><strong>{row.person_name ?? "Unnamed employee"}</strong></div></td><td><strong>{issue}</strong><div className="small-muted">{detail}</div></td><td>{displayDate(report.report_date)}</td><td>{variance}</td><td><div className="validation-btns"><button className={`valid-btn ${verdict === "valid" ? "selected" : ""}`} onClick={() => onVerdict(row.id, "valid")}>Valid</button><button className={`invalid-btn ${verdict === "invalid" ? "selected" : ""}`} onClick={() => onVerdict(row.id, "invalid")}>Invalid</button></div></td></tr>;
          })}
          {!rows.length && <tr><td colSpan={5}><EmptyState title="No time and attendance exceptions" copy="Uploaded and published exceptions will appear here for client review." /></td></tr>}
        </tbody></table></div>
        <GeneratedRecordLists verticalId={verticalOptions[3].id} rows={generatedRows} title="Client attendance lists" />
      </section>
      <aside className="side-stack"><section className="panel side-panel"><div className="panel-head"><div><h3>Compliance summary</h3><p>Last 30 days</p></div></div><EmptyState title="No compliance data" copy="Compliance rates will be calculated from published reports." /></section><section className="panel side-panel"><div className="panel-head"><div><h3>Decision requirement</h3></div></div><div className="note-box">Invalid and Needs More Information decisions require a client comment. VINE Pulse records the decision-maker and timestamp in the audit history.</div></section></aside>
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
        <p>Select an assigned delivery service partner before opening the in-app report workspace. Your active DSP will remain visible at the top of every page.</p>
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

function EmployeeWorkspace({ client, assignedVerticalId, upload, previewOpen, onFile, onPreview, onClosePreview, onPublish, onChangeDsp }: { client: ClientOption; assignedVerticalId: string; upload: UploadPreview | null; previewOpen: boolean; onFile: (file: File | undefined, clientId: string, verticalId: string, reportDate: string) => void; onPreview: () => void; onClosePreview: () => void; onPublish: () => void; onChangeDsp: () => void }) {
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
      {upload && <div className="preview-banner"><div><strong>{upload.published ? "Published" : "Ready for review"} · {upload.name}</strong><p>{upload.size} · {upload.clientName} · {upload.verticalName} · {upload.rows.length} extracted records</p></div><div className="preview-actions"><button className="secondary-btn" onClick={onPreview}>View client preview</button><button className="primary-btn" onClick={onPublish} disabled={upload.published}>{upload.published ? "Published" : "Publish update"}</button></div></div>}
      <div className="upload-hero">
        <section className="panel upload-panel">
          <div className="panel-head"><div><h2>Upload today&apos;s source</h2><p>Files are stored in {client.company_name}&apos;s private Supabase folder</p></div><span className="pill">Private storage</span></div>
          <div className="upload-context">
            <label>DSP<input value={client.company_name} readOnly /></label>
            <label>Report date<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
            <label>Vertical<input value={vertical.name} readOnly /></label>
          </div>
          <label className="dropzone">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onFile(event.target.files?.[0], client.id, vertical.id, reportDate)} aria-label="Upload daily source report" />
            <div><div className="upload-icon">↑</div><h3>{upload ? upload.name : "Drop a report here or click to browse"}</h3><p>{upload ? `${upload.rows.length} real records extracted — no sample records added.` : "Automatic extraction: Excel and CSV up to 25 MB."}</p><div className="file-types"><span>XLSX</span><span>XLS</span><span>CSV</span></div></div>
          </label>
        </section>
        <section className="panel steps-panel">
          <div className="panel-head"><div><h3>Employee resources</h3><p>Use the approved report for your vertical</p></div></div>
          <div className="template-callout"><strong>{template.summary}</strong><span>Mapped from the report supplied for this vertical.</span></div>
          <a className="resource-link" href={`/templates/verticals/${encodeURIComponent(template.filename)}`} download>Download your vertical template <span>→</span></a>
          {[["Upload source", `This upload is locked to ${client.company_name}.`], ["Review extraction", "Confirm totals, names, stages, and exceptions."], ["Preview client view", "See the dashboard before it is visible."], ["Publish update", "Add today’s data to the rolling 30-day report."]].map(([title, copy], index) => <div className="step" key={title}><span className="step-number">0{index + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}
        </section>
      </div>
      {upload && previewOpen && <ExtractionPreview upload={upload} onClose={onClosePreview} onPublish={onPublish} />}
    </>
  );
}

function ExtractionPreview({ upload, onClose, onPublish }: { upload: UploadPreview; onClose: () => void; onPublish: () => void }) {
  const verticalPage = verticalOptions.find((item) => item.id === upload.verticalId)?.key;
  const detailPage =
    verticalPage === "recruiting" || verticalPage === "orientation" || verticalPage === "training"
      ? verticalPage
      : null;
  const columns = detailPage ? detailColumns[detailPage] : [];
  const previewRows = detailPage
    ? mergeReportRows(upload.rows.map((row) => ({
        id: `${row.sheetName}:${row.sourceRow}`,
        row_type: row.sheetName,
        person_name: row.personName,
        data: row.data,
        source_row: row.sourceRow,
      })))
    : [];

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <section className="preview-dialog">
        <div className="panel-head">
          <div><p className="eyebrow">Client preview · {upload.clientName}</p><h2 id="preview-title">{upload.verticalName}</h2><p>{displayDate(upload.reportDate)} · {upload.rows.length} extracted records</p></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close preview">×</button>
        </div>
        <div className="metric-strip">{upload.metrics.map((item) => <div className={`metric-cell metric-tone-${metricTone(item.label, item.value)}`} key={item.key}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>
        <StatusLegend />
        <div className="table-wrap preview-table">
          {detailPage ? (
            <table className="data-table detail-data-table">
              <thead><tr><th>Person</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
              <tbody>
                {previewRows.slice(0, 100).map((row) => (
                  <tr className={`report-row report-row-${rowTone(row.data)}`} key={row.id}>
                    <td><div className="person-cell"><span className="person-avatar">{initials(row.person_name ?? "VP")}</span><div><strong>{row.person_name ?? "Unnamed record"}</strong><div className="small-muted">{String(row.data.email ?? row.data.phone_number ?? row.row_type)}</div></div></div></td>
                    {columns.map((column) => <td key={column.key}><DetailValue value={row.data[column.key]} date={column.date} status={column.status} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead><tr><th>Person</th><th>Source sheet</th><th>Extracted details</th></tr></thead>
              <tbody>{upload.rows.slice(0, 100).map((row) => {
                const details = Object.entries(row.data)
                  .filter(([, value]) => value !== null && value !== "")
                  .slice(0, 5)
                  .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
                  .join(" · ");
                return <tr key={`${row.sheetName}:${row.sourceRow}`}><td><strong>{row.personName}</strong></td><td>{row.sheetName}</td><td className="preview-details">{details}</td></tr>;
              })}</tbody>
            </table>
          )}
        </div>
        <div className="preview-dialog-actions"><button className="secondary-btn" onClick={onClose}>Back to upload</button><button className="primary-btn" onClick={onPublish} disabled={upload.published}>{upload.published ? "Already published" : "Publish to client dashboard"}</button></div>
      </section>
    </div>
  );
}

function AdminReportAccess({ clients, profile, onMessage }: { clients: ClientOption[]; profile: PortalProfile; onMessage: (message: string) => void }) {
  const [clientId, setClientId] = useState("");
  const [verticalId, setVerticalId] = useState(verticalOptions[0].id);
  const selectedClient = clients.find((client) => client.id === clientId) ?? clients[0];
  const selectedVertical = verticalOptions.find((vertical) => vertical.id === verticalId) ?? verticalOptions[0];

  if (!selectedClient) {
    return (
      <section className="panel admin-report-empty">
        <p className="eyebrow">Super Admin report access</p>
        <h1>Add a DSP before opening vertical reports</h1>
        <p>Create your first client in the Command center, then return here to view and update every vertical.</p>
      </section>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Super Admin + employee access</p>
          <h1>All vertical report workspaces</h1>
          <p>Select any DSP and any vertical to review, paste, edit, bulk delete, or publish report records.</p>
        </div>
        <span className="pill">Full operational access</span>
      </div>
      <section className="panel admin-report-selector">
        <label>
          <span>DSP / Client</span>
          <select value={selectedClient.id} onChange={(event) => setClientId(event.target.value)}>
            {clients.map((client) => <option value={client.id} key={client.id}>{client.company_name}</option>)}
          </select>
        </label>
        <label>
          <span>Vertical report</span>
          <select value={selectedVertical.id} onChange={(event) => setVerticalId(event.target.value)}>
            {verticalOptions.map((vertical) => <option value={vertical.id} key={vertical.id}>{vertical.name}</option>)}
          </select>
        </label>
        <div className="admin-report-access-note">
          <strong>Super Admin access</strong>
          <span>You can work on every client and vertical without changing employee assignments.</span>
        </div>
      </section>
      <EmployeeDataWorkspace
        client={selectedClient}
        verticalId={selectedVertical.id}
        verticalName={selectedVertical.name}
        profile={profile}
        onMessage={onMessage}
        onChangeDsp={() => undefined}
        showChangeDsp={false}
      />
    </>
  );
}

function AdminWorkspace({ clients, session, onClientsChange, onMessage }: { clients: ClientOption[]; session: Session | null; onClientsChange: (clients: ClientOption[]) => void; onMessage: (message: string) => void }) {
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reportsCount, setReportsCount] = useState(0);
  const [resetScope, setResetScope] = useState<ResetScope | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [userForm, setUserForm] = useState({ fullName: "", email: "", password: "", role: "employee", clientId: clients[0]?.id ?? "", verticalId: verticalOptions[0].id, clientIds: [] as string[] });
  const selectedClientId = userForm.clientId || clients[0]?.id || "";
  const resetPhrase = resetScope === "workspace" ? "RESET VINE PULSE" : "CLEAR REPORTS";

  useEffect(() => {
    if (!supabase || !session) return;
    let active = true;

    Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, role, client_id, vertical_id")
        .eq("active", true)
        .order("created_at"),
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true }),
    ]).then(([{ data, error }, { count, error: reportCountError }]) => {
        if (!active) return;
        if (error) {
          onMessage(error.message);
          return;
        }
        if (reportCountError) {
          onMessage(reportCountError.message);
        }
        setReportsCount(count ?? 0);
        setUsers((data ?? []).map((user) => {
          const vertical = verticalOptions.find((item) => item.id === user.vertical_id);
          const client = clients.find((item) => item.id === user.client_id);
          return {
            id: user.id,
            name: user.full_name || user.email,
            email: user.email,
            role: user.role === "super_admin" ? "Super Admin" : user.role === "employee" ? "Employee" : "Client",
            assignment: user.role === "super_admin" ? "All access" : user.role === "employee" ? vertical?.name ?? "Vertical pending" : client?.company_name ?? "DSP pending",
          };
        }));
      });

    return () => {
      active = false;
    };
  }, [clients, onMessage, session]);

  async function addClient(event: React.FormEvent) {
    event.preventDefault();
    if (!clientCompany.trim() || !clientEmail.trim()) return;
    if (!supabase || !session) return onMessage("The production database is unavailable.");
    const { data, error } = await supabase.from("clients").insert({ company_name: clientCompany.trim(), primary_email: clientEmail.trim().toLowerCase(), created_by: session.user.id }).select("id, company_name, primary_email").single();
    if (error) return onMessage(error.message);
    onClientsChange([...clients, data as ClientOption].sort((a, b) => a.company_name.localeCompare(b.company_name)));
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
    if (userForm.role === "client" && !selectedClientId) {
      onMessage("Create a DSP before adding a client user.");
      return;
    }
    if (!supabase || !session) return onMessage("The production database is unavailable.");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        ...userForm,
        clientId: userForm.role === "client" ? selectedClientId : null,
        verticalId: userForm.role === "employee" ? userForm.verticalId : null,
        clientIds: userForm.role === "employee" ? userForm.clientIds : [],
        role: userForm.role === "admin" ? "super_admin" : userForm.role,
      }),
    });
    const result = await response.json() as { error?: string; user?: { id: string } };
    if (!response.ok) return onMessage(result.error ?? "User creation failed.");
    const vertical = verticalOptions.find((item) => item.id === userForm.verticalId);
    const client = clients.find((item) => item.id === selectedClientId);
    setUsers([...users, { id: result.user?.id ?? "", name: userForm.fullName, email: userForm.email, role: userForm.role === "admin" ? "Super Admin" : userForm.role === "employee" ? "Employee" : "Client", assignment: userForm.role === "employee" ? `${vertical?.name} · ${userForm.clientIds.length} DSPs` : userForm.role === "client" ? client?.company_name ?? "Client" : "All access" }]);
    setUserForm({ ...userForm, fullName: "", email: "", password: "" });
    onMessage("User account created.");
  }

  function openReset(scope: ResetScope) {
    setResetScope(scope);
    setResetConfirmation("");
  }

  function closeReset() {
    if (resetBusy) return;
    setResetScope(null);
    setResetConfirmation("");
  }

  async function performReset() {
    if (!session || !resetScope || resetConfirmation !== resetPhrase) return;
    setResetBusy(true);

    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          scope: resetScope,
          confirmation: resetConfirmation,
        }),
      });
      const result = await response.json() as ResetResult;

      if (!response.ok) {
        const details = result.details?.length ? ` ${result.details.join(" ")}` : "";
        onMessage(`${result.error ?? "The reset could not be completed."}${details}`);
        return;
      }

      setReportsCount(0);
      if (resetScope === "workspace") {
        onClientsChange([]);
        setUsers((current) => current.filter((user) => user.id === session.user.id));
        setUserForm((current) => ({
          ...current,
          clientId: "",
          clientIds: [],
        }));
      }

      const summary = resetScope === "workspace"
        ? `Demo workspace reset: ${result.reportsDeleted ?? 0} reports, ${result.clientsDeleted ?? 0} DSPs, and ${result.usersDeleted ?? 0} users removed.`
        : `Report data cleared: ${result.reportsDeleted ?? 0} reports and ${result.filesDeleted ?? 0} uploaded files removed.`;
      onMessage(result.warnings?.length ? `${summary} Storage cleanup needs review.` : summary);
      setResetScope(null);
      setResetConfirmation("");
    } catch {
      onMessage("The reset request could not reach the server.");
    } finally {
      setResetBusy(false);
    }
  }

  async function deleteSelectedUser() {
    if (!session || !deleteUserTarget || deleteUserTarget.id === session.user.id) return;
    setDeleteUserBusy(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: deleteUserTarget.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        onMessage(result.error ?? "The user could not be deleted.");
        return;
      }

      setUsers((current) => current.filter((user) => user.id !== deleteUserTarget.id));
      onMessage(`${deleteUserTarget.name} was deleted.`);
      setDeleteUserTarget(null);
    } catch {
      onMessage("The delete request could not reach the server.");
    } finally {
      setDeleteUserBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">System-wide visibility</p><h1>Super Admin command center</h1><p>Create DSP workspaces, issue employee and client accounts, and assign one vertical per employee across selected DSPs.</p></div><span className="pill">5 PM ET daily deadline</span></div>
      <div className="admin-stat-grid">
        <Stat index="01" label="Active DSPs" value={String(clients.length)} note="Manually managed workspaces" />
        <Stat index="02" label="Portal users" value={String(users.length)} note="Admins, employees, and clients" />
        <Stat index="03" label="Verticals configured" value="4" note="Production report structures" />
        <Stat index="04" label="Reports received" value={String(reportsCount)} note={reportsCount ? "Stored report versions" : "No client reports uploaded yet"} />
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
            {userForm.role === "client" && <label>Client company<select value={selectedClientId} onChange={(event) => setUserForm({ ...userForm, clientId: event.target.value })}>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select></label>}
            <button className="primary-btn">Create user account</button>
          </form>
        </section>
      </div>
      <div className="admin-table-grid">
        <section className="panel report-panel">
          <div className="panel-head"><div><h2>DSPs</h2><p>Every DSP is isolated by database and Storage policies</p></div></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Company</th><th>Primary email</th><th>Status</th></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td><strong>{client.company_name}</strong></td><td>{client.primary_email}</td><td><span className="status-ok">Active</span></td></tr>)}{!clients.length && <tr><td colSpan={3}><EmptyState title="No DSPs added" copy="Use the Add DSP form to create your practice client workspace." /></td></tr>}</tbody></table></div>
        </section>
        <section className="panel report-panel">
          <div className="panel-head"><div><h2>Users & assignments</h2><p>Employee verticals and client membership</p></div></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Access</th><th>Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.id || user.email}><td><div className="person-cell"><span className="person-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><div className="small-muted">{user.email}</div></div></div></td><td><span className="pill">{user.role}</span></td><td>{user.assignment}</td><td>{user.id === session?.user.id ? <span className="current-account-label">Current account</span> : <button className="table-delete-btn" onClick={() => setDeleteUserTarget(user)} disabled={!user.id}>Delete user</button>}</td></tr>)}{!users.length && <tr><td colSpan={4}><EmptyState title="No portal users found" copy="Create an employee or client login after adding the DSP." /></td></tr>}</tbody></table></div>
        </section>
      </div>
      <section className="panel danger-zone">
        <div className="danger-zone-copy">
          <p className="eyebrow">Demo controls</p>
          <h3>Clear or reset the practice environment</h3>
          <p>Report cleanup keeps DSPs and users. A full demo reset removes all DSPs, reports, uploads, assignments, and every user except your currently signed-in Super Admin account.</p>
        </div>
        <div className="danger-zone-actions">
          <button className="secondary-btn warning-action" onClick={() => openReset("reports")}>Clear report data</button>
          <button className="danger-btn" onClick={() => openReset("workspace")}>Reset demo workspace</button>
        </div>
      </section>
      <section className="panel admin-resource-panel">
        <div><p className="eyebrow">Approved resources</p><h3>Vertical report templates</h3><p>The four supplied workbooks are now mapped to their matching employee vertical.</p></div>
        <div className="preview-actions">{verticalOptions.map((vertical, index) => <a className="secondary-btn link-btn" key={vertical.id} href={`/templates/verticals/${encodeURIComponent(verticalTemplateMeta[vertical.id].filename)}`} download>V{index + 1} XLSX</a>)}</div>
      </section>
      {resetScope && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title">
          <section className="preview-dialog reset-dialog">
            <div className="reset-symbol" aria-hidden="true">!</div>
            <p className="eyebrow">Super Admin confirmation</p>
            <h2 id="reset-dialog-title">{resetScope === "workspace" ? "Reset the entire demo workspace?" : "Clear all report data?"}</h2>
            <p>
              {resetScope === "workspace"
                ? "This permanently removes every DSP, uploaded report, report row, assignment, employee, client, and other Super Admin. Your signed-in Super Admin account and the four vertical templates remain."
                : "This permanently removes all uploaded reports, extracted rows, metrics, review decisions, and source files. DSPs and user accounts remain."}
            </p>
            <label className="reset-confirmation">
              Type <strong>{resetPhrase}</strong> to continue
              <input
                autoFocus
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
                placeholder={resetPhrase}
                autoComplete="off"
              />
            </label>
            <div className="preview-dialog-actions">
              <button className="secondary-btn" onClick={closeReset} disabled={resetBusy}>Cancel</button>
              <button
                className="danger-btn"
                onClick={performReset}
                disabled={resetBusy || resetConfirmation !== resetPhrase}
              >
                {resetBusy ? "Clearing data…" : resetScope === "workspace" ? "Reset demo workspace" : "Clear all report data"}
              </button>
            </div>
          </section>
        </div>
      )}
      {deleteUserTarget && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-user-dialog-title">
          <section className="preview-dialog reset-dialog">
            <div className="reset-symbol" aria-hidden="true">!</div>
            <p className="eyebrow">Delete portal user</p>
            <h2 id="delete-user-dialog-title">Delete {deleteUserTarget.name}?</h2>
            <p>This permanently removes the login for <strong>{deleteUserTarget.email}</strong> and all of their DSP and vertical assignments. Existing reports are preserved under your Super Admin account.</p>
            <div className="preview-dialog-actions">
              <button className="secondary-btn" onClick={() => setDeleteUserTarget(null)} disabled={deleteUserBusy}>Cancel</button>
              <button className="danger-btn" onClick={deleteSelectedUser} disabled={deleteUserBusy}>
                {deleteUserBusy ? "Deleting user…" : "Delete user"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
