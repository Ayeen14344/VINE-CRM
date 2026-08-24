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
import { clockHoursBetween, workspaceRowsFromSaved } from "../lib/vertical-workspace";
import {
  EmployeeDataWorkspace,
  GeneratedRecordLists,
} from "./vertical-data-workspace";
import { CredentialVault, ProjectBoard } from "./collaboration-workspaces";

type Role = "admin" | "viewer" | "employee" | "client";
type Page = "overview" | "analytics" | "vault" | "tasks" | "admin-reports" | "admin-client-view" | "recruiting" | "orientation" | "training" | "time" | "amzn-adp";
type Verdict = "pending" | "valid" | "invalid";
type SignalTone = "success" | "warning" | "danger" | "neutral";
type ResetScope = "reports" | "workspace";
type ExportFormat = "csv" | "xlsx" | "pdf" | "png" | "jpeg";
type ClientOption = { id: string; company_name: string; primary_email: string; enabled_vertical_ids: string[] | null };
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
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  portalRole: "super_admin" | "viewer_admin" | "employee" | "client";
  assignment: string;
  verticalId: string | null;
  clientIds: string[];
};
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
type JourneyStage = "contacted" | "live_interviewed" | "interview_passed" | "training" | "training_passed" | "for_scheduling" | "active_operations";
type JourneyPerson = {
  id: string;
  name: string;
  aliases: Set<string>;
  reached: Set<JourneyStage>;
  stage: JourneyStage;
  stageIndex: number;
  latestDate: string;
};
type JourneyIndex = { people: JourneyPerson[]; byAlias: Map<string, JourneyPerson> };
type CalendarPerson = { id: string; name: string; detail: string; confirmed?: boolean };
type CalendarActivityDay = {
  date: string;
  interviews: CalendarPerson[];
  orientations: CalendarPerson[];
  training: CalendarPerson[];
};

const verticalTemplateMeta: Record<string, { filename: string; summary: string }> = {
  "00000000-0000-4000-8000-000000000101": {
    filename: "Vertical 1 - Sourcing and Hiring.xlsx",
    summary: "Sourcing, interview results, Cortex onboarding, background check, and drug test / 17 mapped fields",
  },
  "00000000-0000-4000-8000-000000000102": {
    filename: "Vertical 2 - Orientation and ADP Set-up.xlsx",
    summary: "Orientation, safety standard, ADP payroll, Day 1 and Day 2 training schedules, and remarks / 14 mapped fields",
  },
  "00000000-0000-4000-8000-000000000103": {
    filename: "Vertical 3 - Training, ORE, and Scheduling.xlsx",
    summary: "Training, ORE, and Scheduling / 9 mapped fields",
  },
  "00000000-0000-4000-8000-000000000104": {
    filename: "Vertical 4 - Time and Attendance.xlsx",
    summary: "Time and Attendance / 19 mapped fields",
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

const amazonVsAdpNavItem: { id: Page; short: string; label: string } = {
  id: "amzn-adp",
  short: "AA",
  label: "Amzn VS ADP",
};

const analyticsNavItem: { id: Page; short: string; label: string } = {
  id: "analytics",
  short: "AN",
  label: "Analytics",
};

const sharedNavigationItems: { id: Page; short: string; label: string }[] = [
  { id: "vault", short: "VA", label: "VINE Vault" },
  { id: "tasks", short: "TK", label: "VINE Tasks" },
];

const timeAttendanceVerticalId = "00000000-0000-4000-8000-000000000104";

function enabledVerticalIds(client: ClientOption | undefined) {
  return client?.enabled_vertical_ids ?? verticalOptions.map((vertical) => vertical.id);
}

function clientNavigation(client: ClientOption | undefined) {
  const allowed = new Set(enabledVerticalIds(client));
  const items = navItems.filter((item) => {
    if (item.id === "overview") return true;
    const vertical = verticalOptions.find((option) => option.key === item.id);
    return Boolean(vertical && allowed.has(vertical.id));
  });
  items.splice(1, 0, analyticsNavItem);
  if (allowed.has(timeAttendanceVerticalId)) items.push(amazonVsAdpNavItem);
  items.push(...sharedNavigationItems);
  return items;
}

const reportViewerNavItems: { id: Page; short: string; label: string }[] = [
  { id: "overview", short: "OV", label: "Overview" },
  analyticsNavItem,
  ...navItems.filter((item) => item.id !== "overview"),
  amazonVsAdpNavItem,
];

const adminNavItems: { id: Page; short: string; label: string }[] = [
  { id: "overview", short: "SA", label: "Command center" },
  { id: "admin-reports", short: "AR", label: "All vertical reports" },
  { id: "admin-client-view", short: "CV", label: "Client view" },
  ...sharedNavigationItems,
];

const viewerNavItems: { id: Page; short: string; label: string }[] = [
  { id: "admin-client-view", short: "RV", label: "DSP report viewer" },
];

const employeeNavItems: { id: Page; short: string; label: string }[] = [
  { id: "overview", short: "WS", label: "Vertical workspace" },
  ...sharedNavigationItems,
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
  if (profile?.role === "viewer_admin") return "viewer";
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

function reportDates(reports: PublishedReport[]) {
  return Array.from(new Set(reports.map((report) => report.report_date))).sort((a, b) => b.localeCompare(a));
}

function reportsForDate(reports: PublishedReport[], reportDate: string) {
  return reportDate ? reports.filter((report) => report.report_date === reportDate) : reports;
}

function reportTotal(report: PublishedReport | undefined) {
  return report?.report_metrics.reduce((sum, item) => sum + metricNumber(item), 0) ?? 0;
}

function buildVerticalCards(reports: PublishedReport[], historyReports: PublishedReport[] = reports) {
  return verticalOptions.map((vertical, index) => {
    const matching = reports.filter((report) => report.vertical_id === vertical.id);
    const historyMatching = historyReports.filter((report) => report.vertical_id === vertical.id);
    const latest = matching[0];
    return {
      id: vertical.key,
      num: `0${index + 1}`,
      title: vertical.name,
      today: reportTotal(latest),
      month: historyMatching.reduce((sum, report) => sum + reportTotal(report), 0),
      status: latest ? `Updated ${latest.report_date}` : "Awaiting report",
      tone: latest ? "ok" : "review",
    };
  });
}

async function exportDashboardData(reports: PublishedReport[], clientName: string, format: ExportFormat) {
  const cards = buildVerticalCards(reports);
  const rows = [
    ["Vertical", "Today", "Rolling 30 Days", "Status"],
    ...cards.map((item) => [item.title, item.today, item.month, item.status]),
  ];
  const basename = `VINE-Pulse-${clientName.replace(/\s+/g, "-")}-90-day-report`;

  if (format === "csv") {
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${basename}.csv`);
    return;
  }
  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "30-Day Summary");
    XLSX.writeFile(book, `${basename}.xlsx`);
    return;
  }
  if (format === "pdf") {
    const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(20);
    doc.setTextColor(20, 38, 58);
    doc.text("VINE Pulse", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(0, 140, 99);
    doc.text(`${clientName} | Rolling 90-day operations report`, 14, 25);
    autoTableModule.default(doc, { head: [rows[0]], body: rows.slice(1), startY: 32, theme: "striped", headStyles: { fillColor: [0, 140, 99] } });
    doc.save(`${basename}.pdf`);
    return;
  }

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

function displayDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normalizedCalendarDate(value: unknown) {
  if (typeof value === "number" && value > 0) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + Math.round(value) * 86_400_000);
    return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const usDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    return `${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function isConfirmedInterview(value: unknown) {
  return /^(yes|y|true|1|confirmed)$/.test(String(value ?? "").trim().toLowerCase());
}

function calendarMonthLabel(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "Calendar";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftCalendarMonth(month: string, offset: number) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1)
    : new Date();
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function shiftCalendarDate(date: string, offset: number) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  const shifted = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offset);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}

function calendarMonthEnd(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const end = new Date(Number(match[1]), Number(match[2]), 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

function calendarMonthDates(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return [] as (string | null)[];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const leadingDays = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - leadingDays + 1;
    return day >= 1 && day <= daysInMonth
      ? `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : null;
  });
}

function calendarPerson(row: SavedRow): CalendarPerson {
  const name = String(row.person_name ?? row.data.name ?? row.data.candidate_name ?? row.data.driver_name ?? "Unnamed driver").trim();
  const detail = String(row.data.email ?? row.data.email_address ?? row.data.phone_number ?? row.data.number ?? "No contact information").trim();
  return {
    id: personAliases(row)[0] ?? `row:${row.id}`,
    name: name || "Unnamed driver",
    detail: detail || "No contact information",
  };
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

const journeyStages: { id: JourneyStage; label: string; shortLabel: string }[] = [
  { id: "contacted", label: "Applicants contacted", shortLabel: "Contacted" },
  { id: "live_interviewed", label: "Live interviewed", shortLabel: "Live interview" },
  { id: "interview_passed", label: "Passed interview", shortLabel: "Interview passed" },
  { id: "training", label: "Entered training", shortLabel: "Training" },
  { id: "training_passed", label: "Passed training", shortLabel: "Training passed" },
  { id: "for_scheduling", label: "For scheduling", shortLabel: "For scheduling" },
  { id: "active_operations", label: "Active operations", shortLabel: "Active operations" },
];
const analyticsFunnelStages = journeyStages.slice(0, 6);

function normalizedIdentityValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function personAliases(row: SavedRow) {
  const aliases: string[] = [];
  const email = String(row.data.email ?? row.data.email_address ?? "").trim().toLowerCase();
  const phone = String(row.data.phone_number ?? row.data.number ?? "").replace(/\D/g, "");
  const name = normalizedIdentityValue(row.person_name ?? row.data.candidate_name ?? row.data.driver_name ?? row.data.name);
  if (email) aliases.push(`email:${email}`);
  if (phone.length >= 7) aliases.push(`phone:${phone}`);
  if (name) aliases.push(`name:${name}`);
  return aliases;
}

function rowJourneyEvidence(report: PublishedReport, row: SavedRow): JourneyStage[] {
  const verticalIndex = verticalOptions.findIndex((vertical) => vertical.id === report.vertical_id);
  const text = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const isYes = (value: unknown) => /^(yes|y|true|1|complete|completed|pass|passed)$/.test(text(value));
  const interviewResult = text(row.data.interview_result);
  const trainingStatus = text(row.data.training_status);

  if (verticalIndex === 0) {
    const evidence: JourneyStage[] = ["contacted"];
    if (isYes(row.data.interview_confirmed)) evidence.push("live_interviewed");
    if (/pass|fail|completed|attended/.test(interviewResult)) evidence.push("live_interviewed");
    if (/pass/.test(interviewResult) || isYes(row.data.cortex_onboarded) || /pass|clear|complete/.test(text(row.data.background_check)) || /pass|clear|complete/.test(text(row.data.drug_test))) {
      evidence.push("live_interviewed", "interview_passed");
    }
    return evidence;
  }

  if (verticalIndex === 1) {
    const evidence: JourneyStage[] = ["contacted", "live_interviewed", "interview_passed"];
    if (
      hasDisplayValue(row.data.day_1_training_schedule) ||
      hasDisplayValue(row.data.day_2_training_schedule) ||
      hasDisplayValue(row.data.training_schedule) ||
      /active|training|in progress|completed|for scheduling/.test(text(row.data.remarks))
    ) evidence.push("training");
    if (/for scheduling/.test(text(row.data.remarks))) evidence.push("training_passed", "for_scheduling");
    return evidence;
  }

  if (verticalIndex === 2) {
    const evidence: JourneyStage[] = ["contacted", "live_interviewed", "interview_passed", "training"];
    if (/pass|complete/.test(trainingStatus)) evidence.push("training_passed");
    if (hasDisplayValue(row.data.work_schedule_plotted) || /for scheduling|scheduled/.test(trainingStatus)) {
      evidence.push("training_passed", "for_scheduling");
    }
    return evidence;
  }

  if (verticalIndex === 3) return ["active_operations"];
  return [];
}

function buildApplicantJourney(reports: PublishedReport[]): JourneyIndex {
  const people = new Map<string, JourneyPerson>();
  const aliasOwner = new Map<string, string>();
  const orderedReports = [...reports].sort((a, b) => a.report_date.localeCompare(b.report_date));

  orderedReports.forEach((report) => {
    mergeReportRows(report.report_rows).forEach((row) => {
      const aliases = personAliases(row);
      const existingIds = Array.from(new Set(aliases.map((alias) => aliasOwner.get(alias)).filter(Boolean) as string[]));
      const personId = existingIds[0] ?? aliases[0] ?? `row:${row.id}`;
      let person = people.get(personId);

      if (!person) {
        person = {
          id: personId,
          name: row.person_name ?? "Unnamed record",
          aliases: new Set<string>(),
          reached: new Set<JourneyStage>(),
          stage: "contacted",
          stageIndex: -1,
          latestDate: report.report_date,
        };
        people.set(personId, person);
      }

      existingIds.slice(1).forEach((duplicateId) => {
        const duplicate = people.get(duplicateId);
        if (!duplicate || duplicate === person) return;
        duplicate.aliases.forEach((alias) => {
          person?.aliases.add(alias);
          aliasOwner.set(alias, personId);
        });
        duplicate.reached.forEach((stage) => person?.reached.add(stage));
        if (duplicate.stageIndex > person!.stageIndex) {
          person!.stage = duplicate.stage;
          person!.stageIndex = duplicate.stageIndex;
        }
        if (duplicate.latestDate > person!.latestDate) person!.latestDate = duplicate.latestDate;
        people.delete(duplicateId);
      });

      aliases.forEach((alias) => {
        person!.aliases.add(alias);
        aliasOwner.set(alias, personId);
      });
      rowJourneyEvidence(report, row).forEach((stage) => {
        person!.reached.add(stage);
        const index = journeyStages.findIndex((item) => item.id === stage);
        if (index > person!.stageIndex) {
          person!.stage = stage;
          person!.stageIndex = index;
        }
      });
      if (report.report_date >= person.latestDate) {
        person.latestDate = report.report_date;
        if (row.person_name) person.name = row.person_name;
      }
    });
  });

  const byAlias = new Map<string, JourneyPerson>();
  people.forEach((person) => person.aliases.forEach((alias) => byAlias.set(alias, person)));
  return { people: Array.from(people.values()), byAlias };
}

function journeyPersonForRow(journey: JourneyIndex, row: SavedRow) {
  for (const alias of personAliases(row)) {
    const person = journey.byAlias.get(alias);
    if (person) return person;
  }
  return undefined;
}

function JourneyStatus({ person }: { person: JourneyPerson | undefined }) {
  if (!person || person.stageIndex < 0) return <span className="detail-empty">Not linked</span>;
  const stage = journeyStages[person.stageIndex];
  return (
    <div className={`journey-badge journey-stage-${person.stage}`}>
      <span className="journey-step">{String(person.stageIndex + 1).padStart(2, "0")}</span>
      <span><strong>{stage.shortLabel}</strong><small>Updated {displayDate(person.latestDate)}</small></span>
    </div>
  );
}

const detailColumns: Record<
  "recruiting" | "orientation" | "training",
  { key: string; label: string; legacyKey?: string; date?: boolean; status?: boolean }[]
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
    { key: "day_1_training_schedule", legacyKey: "training_schedule", label: "Day 1 training", date: true },
    { key: "day_2_training_schedule", label: "Day 2 training", date: true },
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
  const [clientReportDate, setClientReportDate] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Legacy upload support remains available for historical reports, but the
  // employee UI now uses the in-app workspace below.
  void previewOpen;
  void handleUpload;
  void publishUpload;
  void EmployeeWorkspace;

  const role = roleFromProfile(profile);
  const activePage = role === "viewer" ? "admin-client-view" : page;
  const employeeDsp = clients.find((client) => client.id === employeeDspId);
  const selectedClient = role === "employee"
    ? employeeDsp
    : clients.find((client) => client.id === profile?.client_id) ?? clients[0];
  const clientName = selectedClient?.company_name ?? (role === "employee" ? "Choose a DSP" : "Client workspace");
  const clientNavItems = useMemo(() => clientNavigation(selectedClient), [selectedClient]);
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
        portalClient.from("clients").select("id, company_name, primary_email, enabled_vertical_ids").eq("active", true).order("company_name"),
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
    if (!supabase || !session || !selectedClient?.id || role === "admin" || role === "viewer") {
      return;
    }
    const selectedClientId = selectedClient.id;
    let active = true;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 89);
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
    if (role === "admin") {
      if (page === "admin-reports") return "All vertical reports";
      if (page === "admin-client-view") return "Client view";
      if (page === "vault") return "VINE Vault";
      if (page === "tasks") return "VINE Tasks";
      return "Super Admin command center";
    }
    if (role === "viewer") return "DSP report viewer";
    if (role === "employee") return employeeNavItems.find((item) => item.id === page)?.label ?? "Employee workspace";
    return page === "overview" ? "Operations overview" : [...navItems, analyticsNavItem, amazonVsAdpNavItem, ...sharedNavigationItems].find((item) => item.id === page)?.label ?? "Operations";
  }, [page, role]);
  const availableClientReportDates = reportDates(publishedReports);
  const selectedClientReportDate = clientReportDate === null || (clientReportDate && !availableClientReportDates.includes(clientReportDate))
    ? availableClientReportDates[0] ?? ""
    : clientReportDate;
  const visiblePublishedReports = reportsForDate(publishedReports, selectedClientReportDate);
  const allowedPublishedReports = publishedReports.filter((report) => enabledVerticalIds(selectedClient).includes(report.vertical_id));

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

  async function exportDashboard(format: ExportFormat) {
    await exportDashboardData(visiblePublishedReports, clientName, format);
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

        <div className="nav-label">{role === "admin" ? "Administration" : role === "viewer" ? "Read-only administration" : role === "employee" ? "Client preview" : "Client reports"}</div>
        <nav className="nav">
          {(role === "admin" ? adminNavItems : role === "viewer" ? viewerNavItems : role === "client" ? clientNavItems : employeeNavItems).map((item) => (
            <button key={item.id} className={activePage === item.id ? "active" : ""} onClick={() => selectPage(item.id)}>
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
            <div className="client-avatar">{role === "admin" ? "SA" : role === "viewer" ? "AV" : initials(clientName)}</div>
            <div>
              <strong>{role === "admin" || role === "viewer" ? "All DSPs" : clientName}</strong>
              <span>{role === "viewer" ? "Read-only report access" : role === "employee" && employeeDsp ? "Active DSP workspace" : "Secure production workspace"}</span>
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
            page === "vault" && profile ? (
              <CredentialVault clients={clients} role="admin" profile={profile} onMessage={setToast} />
            ) : page === "tasks" && profile ? (
              <ProjectBoard clients={clients} role="admin" profile={profile} onMessage={setToast} />
            ) : page === "admin-reports" && profile ? (
              <AdminReportAccess clients={clients} profile={profile} onMessage={setToast} />
            ) : page === "admin-client-view" ? (
              <AdminClientView clients={clients} profile={profile!} onMessage={setToast} />
            ) : (
              <AdminWorkspace
                clients={clients}
                session={session}
                onClientsChange={setClients}
                onMessage={setToast}
              />
            )
          ) : role === "viewer" ? (
            profile ? <AdminClientView clients={clients} profile={profile} onMessage={setToast} readOnly /> : null
          ) : role === "employee" ? (
            employeeDsp ? (
              session && profile ? (
                page === "vault" ? <CredentialVault clients={clients} client={employeeDsp} role="employee" profile={profile} onMessage={setToast} />
                  : page === "tasks" ? <ProjectBoard clients={clients} client={employeeDsp} role="employee" profile={profile} onMessage={setToast} />
                    : <EmployeeDataWorkspace
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
              {page !== "vault" && page !== "tasks" && <div className="page-heading">
                <div>
                  <p className="eyebrow">{clientName} · Daily report</p>
                  <h1>{pageTitle}</h1>
                  <p>{page === "analytics"
                    ? "Identity-matched conversion analytics across the latest 90 days of published reports."
                    : selectedClientReportDate
                      ? `Showing the published report for ${displayDate(selectedClientReportDate)}, with the rolling 90-day comparison retained in the overview.`
                      : "Showing all published reports in the rolling 90-day window."}</p>
                </div>
                <div className="heading-actions">
                  {page !== "analytics" && <ReportDayControl reports={publishedReports} value={selectedClientReportDate} onChange={setClientReportDate} />}
                  <ExportControl onExport={exportDashboard} />
                </div>
              </div>}
              {page === "overview" && <Overview onOpen={selectPage} reports={visiblePublishedReports} historyReports={publishedReports} selectedDate={selectedClientReportDate} allowedVerticalIds={enabledVerticalIds(selectedClient)} />}
              {page === "analytics" && <AnalyticsDashboard reports={allowedPublishedReports} hasTimeAccess={Boolean(selectedClient && enabledVerticalIds(selectedClient).includes(timeAttendanceVerticalId))} />}
              {page === "vault" && profile && selectedClient && <CredentialVault clients={clients} client={selectedClient} role="client" profile={profile} onMessage={setToast} />}
              {page === "tasks" && profile && selectedClient && <ProjectBoard clients={clients} client={selectedClient} role="client" profile={profile} onMessage={setToast} />}
              {(page === "recruiting" || page === "orientation" || page === "training") && <VerticalReport page={page} reports={visiblePublishedReports} journeyReports={allowedPublishedReports} onExport={exportDashboard} />}
              {page === "time" && <TimeAttendance reports={visiblePublishedReports} journeyReports={allowedPublishedReports} verdicts={verdicts} onVerdict={(id, verdict) => {
                setVerdicts((current) => ({ ...current, [id]: verdict }));
                setToast(`Time-theft item marked ${verdict}.`);
              }} />}
              {page === "amzn-adp" && <AmazonVsAdp reports={visiblePublishedReports} />}
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
      <LoginBrandPanel />
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
      <LoginBrandPanel />
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

function LoginBrandPanel() {
  return (
    <section className="login-brand-panel">
      <Image src="/vine-pulse-logo.png" width={1680} height={908} priority alt="VINE Pulse - Client Reporting and Operations Portal" />
      <div className="login-brand-copy">
        <p className="eyebrow">Operations intelligence, connected</p>
        <h1>One pulse across every client operation.</h1>
        <p>Recruiting, onboarding, training, scheduling, and attendance—secured in one clear daily reporting system.</p>
      </div>
      <div className="login-proof">
        <span>Secure client separation</span>
        <span>Daily 5 PM ET deadline</span>
        <span>90-day reporting</span>
      </div>
    </section>
  );
}

function ExportControl({ onExport }: { onExport: (format: ExportFormat) => void }) {
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

function ReportDayControl({
  reports,
  value,
  onChange,
}: {
  reports: PublishedReport[];
  value: string;
  onChange: (value: string) => void;
}) {
  const dates = reportDates(reports);
  return (
    <label className="report-day-control">
      <span>View report day</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="View report day">
        <option value="">All available days</option>
        {dates.map((date) => <option value={date} key={date}>{displayDate(date)}</option>)}
      </select>
    </label>
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

function Overview({
  onOpen,
  reports,
  historyReports = reports,
  selectedDate = "",
  allowedVerticalIds,
}: {
  onOpen: (page: Page) => void;
  reports: PublishedReport[];
  historyReports?: PublishedReport[];
  selectedDate?: string;
  allowedVerticalIds?: string[];
}) {
  const cards = buildVerticalCards(reports, historyReports).filter((card) => {
    if (!allowedVerticalIds) return true;
    const vertical = verticalOptions.find((item) => item.key === card.id);
    return Boolean(vertical && allowedVerticalIds.includes(vertical.id));
  });
  return (
    <>
      <div className="hero-grid">
        <section className="panel overview-panel">
          <div className="panel-head">
            <div><h2>{selectedDate ? `${displayDate(selectedDate)} at a glance` : "90-day overview"}</h2><p>Summary totals across your active VINE Pulse services</p></div>
            <span className="pill">Live data only</span>
          </div>
          <div className="stats-grid">
            {cards.map((card) => <Stat key={card.id} index={card.num} label={card.title} value={String(card.today)} note={card.status} />)}
          </div>
          {!reports.length && <EmptyState title="No operational data yet" copy="Your first published report will create the dashboard totals and rolling 90-day history." />}
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
            <div className="vertical-metrics"><div><strong>{vertical.today}</strong><span>{selectedDate ? "selected day" : "latest day"}</span></div><div><strong>{vertical.month}</strong><span>90 days</span></div></div>
          </article>
        ))}
      </section>
    </>
  );
}

function Stat({ index, label, value, note }: { index: string; label: string; value: string; note: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-index">{index}</span></div><div className="stat-value"><strong>{value}</strong></div><p>{note}</p></div>;
}

function VerticalReport({ page, reports, journeyReports, onExport }: { page: "recruiting" | "orientation" | "training"; reports: PublishedReport[]; journeyReports: PublishedReport[]; onExport: (format: ExportFormat) => void }) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const journey = useMemo(() => buildApplicantJourney(journeyReports), [journeyReports]);
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
        <div className="journey-explainer"><span className="journey-explainer-icon">↗</span><div><strong>Cross-vertical journey tracking</strong><p>Each person stays in this report while their latest stage updates from linked records across all enabled verticals.</p></div><span>{journey.people.length} linked people</span></div>
        <div className="report-detail-toolbar">
          <div><strong>Detailed person records</strong><span>{rows.length} record{rows.length === 1 ? "" : "s"} in this view</span></div>
          <button className="secondary-btn" type="button" aria-expanded={detailsVisible} onClick={() => setDetailsVisible((visible) => !visible)}>
            {detailsVisible ? "Hide detailed records" : "Show detailed records"}
          </button>
        </div>
        {detailsVisible && (
          <div className="table-wrap">
            <table className="data-table detail-data-table">
              <thead><tr><th>Person</th><th>Latest journey stage</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Report date</th></tr></thead>
              <tbody>
                {rows.map(({ report, row }) => {
                  const detail = String(row.data.email ?? row.data.phone_number ?? row.row_type);
                  return <tr className={`report-row report-row-${rowTone(row.data)}`} key={`${report.id}:${row.id}`}>
                    <td><div className="person-cell"><span className="person-avatar">{initials(row.person_name ?? "VP")}</span><div><strong>{row.person_name ?? "Unnamed record"}</strong><div className="small-muted">{detail}</div></div></div></td>
                    <td><JourneyStatus person={journeyPersonForRow(journey, row)} /></td>
                    {columns.map((column) => <td key={column.key}><DetailValue value={row.data[column.key] ?? (column.legacyKey ? row.data[column.legacyKey] : null)} date={column.date} status={column.status} /></td>)}
                    <td>{displayDate(report.report_date)}</td>
                  </tr>;
                })}
                {!rows.length && <tr><td colSpan={columns.length + 3}><EmptyState title="No report rows yet" copy="Published records for this vertical will appear here." /></td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <GeneratedRecordLists verticalId={verticalOptions.find((item) => item.key === page)?.id ?? ""} rows={generatedRows} title="Client operational lists" />
      </section>
      <aside className="side-stack">
        <section className="panel side-panel"><div className="panel-head"><div><h3>{matching.length <= 1 ? "Daily activity" : "90-day activity"}</h3><p>Published source reports</p></div></div>{matching.length ? <div className="metric-strip compact-metrics"><div className="metric-cell"><strong>{matching.length}</strong><span>reporting days</span></div><div className="metric-cell"><strong>{recordCount}</strong><span>records</span></div></div> : <EmptyState title="No progress data" copy="Progress rates will be calculated after reports are published." />}</section>
        <section className="panel side-panel"><div className="panel-head"><div><h3>Privacy rule</h3><p>Names are limited to your company</p></div></div><div className="note-box">The overview uses totals. Individual names appear only inside authorized operational detail screens. Raw DL and I-9 documents remain outside the dashboard.</div></section>
      </aside>
    </div>
  );
}

function TimeAttendance({ reports, journeyReports, verdicts, onVerdict }: { reports: PublishedReport[]; journeyReports: PublishedReport[]; verdicts: Record<string, Verdict>; onVerdict?: (id: string, verdict: Verdict) => void }) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const journey = useMemo(() => buildApplicantJourney(journeyReports), [journeyReports]);
  const matching = reportsForPage(reports, "time");
  const latest = matching[0];
  const metrics = latest
    ? latest.report_metrics.map((item) => [item.metric_label, String(metricNumber(item))])
    : [["Missed punches", "0"], ["Missing lunch break", "0"], ["Daily hours violation", "0"], ["7-day rolling", "0"], ["Attendance", "0"], ["Potential time theft", "0"]];
  const rows = matching.flatMap((report) => report.report_rows.map((row) => ({ report, row }))).slice(0, 100);
  const awaitingReview = rows.filter(({ row }) => /^(low|moderate|high)$/i.test(String(row.data.possible_time_theft ?? "").trim())).length;
  const generatedRows = latest ? workspaceRowsFromSaved(latest.report_rows, latest.vertical_id) : [];
  return (
    <div className="section-grid">
      <section className="panel report-panel">
        <div className="panel-head"><div><h2>Time & Attendance</h2><p>Daily exceptions with client validation for potential time theft.</p></div><span className="pill">{awaitingReview} awaiting review</span></div>
        <div className="metric-strip">{metrics.map(([label, value]) => <div className={`metric-cell metric-tone-${metricTone(label, value)}`} key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <StatusLegend />
        <div className="journey-explainer"><span className="journey-explainer-icon">↗</span><div><strong>Cross-vertical journey tracking</strong><p>Driver history remains intact while this page shows their latest linked operational stage.</p></div><span>{journey.people.length} linked people</span></div>
        <div className="report-detail-toolbar">
          <div><strong>Detailed attendance records</strong><span>{rows.length} record{rows.length === 1 ? "" : "s"} in this view</span></div>
          <button className="secondary-btn" type="button" aria-expanded={detailsVisible} onClick={() => setDetailsVisible((visible) => !visible)}>
            {detailsVisible ? "Hide detailed records" : "Show detailed records"}
          </button>
        </div>
        {detailsVisible && <div className="table-wrap"><table className="data-table attendance-detail-table"><thead><tr><th>Station</th><th>Employee</th><th>Latest journey stage</th><th>Phone Number</th><th>Cortex App In</th><th>Cortex App Out</th><th>ADP Clock In</th><th>ADP Clock Out</th><th>Total Break Time Used</th><th>Comments</th><th>Sign In Difference</th><th>Sign Out Difference</th><th>Missed Punch In</th><th>Missed Punch Out</th><th>Follow up for Missed Punch In</th><th>Punch In Status</th><th>Follow up for Missed Punch Out</th><th>Punch Out Status</th><th>Possible Time Theft</th><th>Sent To Dispatch</th><th>Report Date</th>{onVerdict && <th>Client Decision</th>}</tr></thead><tbody>
          {rows.map(({ report, row }) => {
            const verdict = verdicts[row.id] ?? "pending";
            return <tr className={`report-row report-row-${verdict === "invalid" ? "danger" : verdict === "valid" ? "success" : rowTone(row.data)}`} key={row.id}>
              <td><DetailValue value={row.data.station} /></td>
              <td><div className="person-cell"><span className="person-avatar">{initials(row.person_name ?? "VP")}</span><strong>{row.person_name ?? "Unnamed employee"}</strong></div></td>
              <td><JourneyStatus person={journeyPersonForRow(journey, row)} /></td>
              <td><DetailValue value={row.data.phone_number} /></td>
              <td><DetailValue value={row.data.cortex_app_in} /></td>
              <td><DetailValue value={row.data.cortex_app_out} /></td>
              <td><DetailValue value={row.data.adp_clock_in} /></td>
              <td><DetailValue value={row.data.adp_clock_out} /></td>
              <td><DetailValue value={row.data.total_break_time_used} /></td>
              <td><DetailValue value={row.data.comments} /></td>
              <td><DetailValue value={row.data.sign_in_difference} status /></td>
              <td><DetailValue value={row.data.sign_out_difference} status /></td>
              <td><DetailValue value={row.data.missed_punch_in} status /></td>
              <td><DetailValue value={row.data.missed_punch_out} status /></td>
              <td><DetailValue value={row.data.missed_punch_in_followup} status /></td>
              <td><DetailValue value={row.data.missed_punch_in_status} status /></td>
              <td><DetailValue value={row.data.missed_punch_out_followup} status /></td>
              <td><DetailValue value={row.data.missed_punch_out_status} status /></td>
              <td><DetailValue value={row.data.possible_time_theft} status /></td>
              <td><DetailValue value={row.data.sent_to_dispatch} status /></td>
              <td>{displayDate(report.report_date)}</td>
              {onVerdict && <td><div className="validation-btns"><button className={`valid-btn ${verdict === "valid" ? "selected" : ""}`} onClick={() => onVerdict(row.id, "valid")}>Valid</button><button className={`invalid-btn ${verdict === "invalid" ? "selected" : ""}`} onClick={() => onVerdict(row.id, "invalid")}>Invalid</button></div></td>}
            </tr>;
          })}
          {!rows.length && <tr><td colSpan={onVerdict ? 22 : 21}><EmptyState title="No time and attendance exceptions" copy="Uploaded and published exceptions will appear here for client review." /></td></tr>}
        </tbody></table></div>}
        <GeneratedRecordLists verticalId={verticalOptions[3].id} rows={generatedRows} title="Client attendance lists" />
      </section>
      <aside className="side-stack"><section className="panel side-panel"><div className="panel-head"><div><h3>Compliance summary</h3><p>Last 90 days</p></div></div><EmptyState title="No compliance data" copy="Compliance rates will be calculated from published reports." /></section><section className="panel side-panel"><div className="panel-head"><div><h3>Decision requirement</h3></div></div><div className="note-box">Invalid and Needs More Information decisions require a client comment. VINE Pulse records the decision-maker and timestamp in the audit history.</div></section></aside>
    </div>
  );
}

function AnalyticsDashboard({ reports, hasTimeAccess = false }: { reports: PublishedReport[]; hasTimeAccess?: boolean }) {
  const availableDates = useMemo(() => reportDates(reports), [reports]);
  const earliestDate = availableDates[availableDates.length - 1] ?? "";
  const latestDate = availableDates[0] ?? "";
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const selectedRangeStart = rangeStart && rangeStart >= earliestDate && rangeStart <= latestDate ? rangeStart : earliestDate;
  const selectedRangeEnd = rangeEnd && rangeEnd >= earliestDate && rangeEnd <= latestDate ? rangeEnd : latestDate;

  const rangeReports = useMemo(() => reports.filter((report) =>
    (!selectedRangeStart || report.report_date >= selectedRangeStart)
    && (!selectedRangeEnd || report.report_date <= selectedRangeEnd),
  ), [reports, selectedRangeEnd, selectedRangeStart]);
  const journey = useMemo(() => buildApplicantJourney(rangeReports), [rangeReports]);
  const funnelStages = analyticsFunnelStages;
  const counts = useMemo(() => {
    const next = new Map<JourneyStage, number>(
      funnelStages.map((stage) => [stage.id, journey.people.filter((person) => person.reached.has(stage.id)).length]),
    );
    const confirmedPeople = new Set<string>();
    reportsForPage(rangeReports, "recruiting").forEach((report) => {
      mergeReportRows(report.report_rows).forEach((row) => {
        const confirmation = String(row.data.interview_confirmed ?? "").trim().toLowerCase();
        if (!/^(yes|y|true|1|confirmed)$/.test(confirmation)) return;
        const linkedPerson = journeyPersonForRow(journey, row);
        const fallbackIdentity = personAliases(row)[0] ?? `row:${row.id}`;
        confirmedPeople.add(linkedPerson?.id ?? fallbackIdentity);
      });
    });
    next.set("live_interviewed", confirmedPeople.size);
    return next;
  }, [funnelStages, journey, rangeReports]);
  const countFor = (stage: JourneyStage) => counts.get(stage) ?? 0;
  const comparisons: { from: JourneyStage; to: JourneyStage; label: string }[] = [
    { from: "contacted", to: "live_interviewed", label: "Contacted → Live interviewed" },
    { from: "live_interviewed", to: "interview_passed", label: "Live interviewed → Passed interview" },
    { from: "interview_passed", to: "training", label: "Passed interview → Training" },
    { from: "training", to: "training_passed", label: "Training → Passed training" },
    { from: "training_passed", to: "for_scheduling", label: "Passed training → For scheduling" },
  ];
  const interviewed = countFor("live_interviewed");
  const scheduled = countFor("for_scheduling");
  const mainMaximum = Math.max(interviewed, scheduled, 1);
  const mainConversion = interviewed > 0 ? Math.round((scheduled / interviewed) * 100) : 0;
  const stageMaximum = Math.max(...funnelStages.map((stage) => countFor(stage.id)), 1);
  const trackedPeople = journey.people.filter((person) => funnelStages.some((stage) => person.reached.has(stage.id))).length;
  const reportDayCount = new Set(rangeReports.map((report) => report.report_date)).size;
  const hasAnalytics = funnelStages.some((stage) => countFor(stage.id) > 0);
  const stageLabel = (id: JourneyStage) => journeyStages.find((stage) => stage.id === id)?.shortLabel ?? id;
  const calendarActivity = useMemo(() => {
    type DraftDay = {
      date: string;
      interviews: Map<string, CalendarPerson>;
      orientations: Map<string, CalendarPerson>;
      training: Map<string, CalendarPerson>;
    };
    const days = new Map<string, DraftDay>();
    const dayFor = (date: string) => {
      const existing = days.get(date);
      if (existing) return existing;
      const day: DraftDay = { date, interviews: new Map(), orientations: new Map(), training: new Map() };
      days.set(date, day);
      return day;
    };

    reportsForPage(rangeReports, "recruiting").forEach((report) => {
      mergeReportRows(report.report_rows).forEach((row) => {
        const date = normalizedCalendarDate(row.data.scheduled_interview);
        if (!date) return;
        const person = calendarPerson(row);
        const day = dayFor(date);
        const current = day.interviews.get(person.id);
        day.interviews.set(person.id, {
          ...person,
          confirmed: Boolean(current?.confirmed) || isConfirmedInterview(row.data.interview_confirmed),
        });
      });
    });

    reportsForPage(rangeReports, "orientation").forEach((report) => {
      mergeReportRows(report.report_rows).forEach((row) => {
        const person = calendarPerson(row);
        const orientationDate = normalizedCalendarDate(row.data.orientation_completed);
        const trainingDate = normalizedCalendarDate(row.data.day_1_training_schedule);
        if (orientationDate) dayFor(orientationDate).orientations.set(person.id, person);
        if (trainingDate) dayFor(trainingDate).training.set(person.id, person);
      });
    });

    return Array.from(days.values())
      .map<CalendarActivityDay>((day) => ({
        date: day.date,
        interviews: Array.from(day.interviews.values()).sort((a, b) => a.name.localeCompare(b.name)),
        orientations: Array.from(day.orientations.values()).sort((a, b) => a.name.localeCompare(b.name)),
        training: Array.from(day.training.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rangeReports]);
  const activityByDate = useMemo(() => new Map(calendarActivity.map((day) => [day.date, day])), [calendarActivity]);
  const latestActivityDate = calendarActivity[calendarActivity.length - 1]?.date ?? latestDate;
  const [selectedActivityDate, setSelectedActivityDate] = useState("");
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState("");
  const activeActivityDate = selectedActivityDate || latestActivityDate;
  const visibleCalendarMonth = selectedCalendarMonth || activeActivityDate.slice(0, 7) || new Date().toISOString().slice(0, 7);
  const calendarDates = useMemo(() => calendarMonthDates(visibleCalendarMonth), [visibleCalendarMonth]);
  const selectedActivity = activityByDate.get(activeActivityDate) ?? {
    date: activeActivityDate,
    interviews: [],
    orientations: [],
    training: [],
  };
  const selectedConfirmed = selectedActivity.interviews.filter((person) => person.confirmed).length;
  const timeReports = useMemo(() => reportsForPage(reports, "time"), [reports]);
  const timeReportDates = useMemo(() => reportDates(timeReports), [timeReports]);
  const earliestTimeReportDate = timeReportDates[timeReportDates.length - 1] ?? "";
  const latestTimeReportDate = timeReportDates[0] ?? "";
  const [commentPeriod, setCommentPeriod] = useState<"weekly" | "monthly" | "custom">("weekly");
  const [commentWeekEnding, setCommentWeekEnding] = useState("");
  const [commentMonth, setCommentMonth] = useState("");
  const [commentCustomStart, setCommentCustomStart] = useState("");
  const [commentCustomEnd, setCommentCustomEnd] = useState("");
  const [selectedCommentKey, setSelectedCommentKey] = useState("all");
  const effectiveCommentWeekEnd = commentWeekEnding || latestTimeReportDate;
  const effectiveCommentMonth = commentMonth || latestTimeReportDate.slice(0, 7);
  const effectiveCommentCustomStart = commentCustomStart || earliestTimeReportDate;
  const effectiveCommentCustomEnd = commentCustomEnd || latestTimeReportDate;
  const commentRangeStart = commentPeriod === "weekly"
    ? (effectiveCommentWeekEnd ? shiftCalendarDate(effectiveCommentWeekEnd, -6) : "")
    : commentPeriod === "monthly"
      ? (effectiveCommentMonth ? `${effectiveCommentMonth}-01` : "")
      : effectiveCommentCustomStart;
  const commentRangeEnd = commentPeriod === "weekly"
    ? effectiveCommentWeekEnd
    : commentPeriod === "monthly"
      ? calendarMonthEnd(effectiveCommentMonth)
      : effectiveCommentCustomEnd;
  const commentRangeReports = useMemo(() => timeReports.filter((report) =>
    (!commentRangeStart || report.report_date >= commentRangeStart)
    && (!commentRangeEnd || report.report_date <= commentRangeEnd),
  ), [commentRangeEnd, commentRangeStart, timeReports]);
  const commentOptions = useMemo(() => {
    const options = new Map<string, string>();
    commentRangeReports.forEach((report) => {
      mergeReportRows(report.report_rows).forEach((row) => {
        const comment = String(row.data.comments ?? "").replace(/\s+/g, " ").trim();
        if (!comment || /^(?:-|—|n\/?a|none|no comment)$/i.test(comment)) return;
        const key = comment.toLowerCase();
        if (!options.has(key)) options.set(key, comment);
      });
    });
    return Array.from(options, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [commentRangeReports]);
  const activeCommentKey = selectedCommentKey === "all" || commentOptions.some((option) => option.key === selectedCommentKey)
    ? selectedCommentKey
    : "all";
  const timeCommentGroups = useMemo(() => {
    type CommentPerson = CalendarPerson & { reportDate: string };
    type CommentGroup = { comment: string; people: Map<string, CommentPerson> };
    const grouped = new Map<string, CommentGroup>();

    commentRangeReports.forEach((report) => {
      mergeReportRows(report.report_rows).forEach((row) => {
        const comment = String(row.data.comments ?? "").replace(/\s+/g, " ").trim();
        if (!comment || /^(?:-|—|n\/?a|none|no comment)$/i.test(comment)) return;

        const groupKey = comment.toLowerCase();
        if (activeCommentKey !== "all" && groupKey !== activeCommentKey) return;
        const group = grouped.get(groupKey) ?? { comment, people: new Map<string, CommentPerson>() };
        const person = calendarPerson(row);
        const current = group.people.get(person.id);
        if (!current || report.report_date >= current.reportDate) {
          group.people.set(person.id, { ...person, reportDate: report.report_date });
        }
        grouped.set(groupKey, group);
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        comment: group.comment,
        people: Array.from(group.people.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.people.length - a.people.length || a.comment.localeCompare(b.comment));
  }, [activeCommentKey, commentRangeReports]);
  const commentedPeopleTotal = new Set(timeCommentGroups.flatMap((group) => group.people.map((person) => person.id))).size;

  return (
    <div className="analytics-dashboard">
      <section className="panel analytics-range-bar">
        <div><p className="eyebrow">Analytics reporting window</p><h3>Count unique people across all reports</h3><p>Live interviewed counts only unique Sourcing & Hiring records where Confirmed Interview is Yes or Confirmed.</p></div>
        <div className="analytics-range-controls">
          <label><span>From</span><input type="date" value={selectedRangeStart} min={earliestDate} max={selectedRangeEnd || latestDate} disabled={!availableDates.length} onChange={(event) => setRangeStart(event.target.value)} /></label>
          <label><span>To</span><input type="date" value={selectedRangeEnd} min={selectedRangeStart || earliestDate} max={latestDate} disabled={!availableDates.length} onChange={(event) => setRangeEnd(event.target.value)} /></label>
          <button className="secondary-btn" type="button" disabled={!availableDates.length} onClick={() => { setRangeStart(""); setRangeEnd(""); }}>All available data</button>
        </div>
        <div className="analytics-range-summary"><strong>{rangeReports.length}</strong><span>published vertical reports across {reportDayCount} report day{reportDayCount === 1 ? "" : "s"}</span></div>
      </section>

      <section className="panel analytics-hero">
        <div className="analytics-hero-copy">
          <p className="eyebrow">Primary conversion</p>
          <h2>Live interviewed <span>→</span> For scheduling</h2>
          <p>The clearest end-to-end view of how live interviews become deployment-ready drivers.</p>
          <div className="analytics-conversion-value"><strong>{mainConversion}%</strong><span>selected-range conversion</span></div>
          <div className="analytics-hero-meta">
            <span><strong>{interviewed}</strong> live interviewed</span>
            <span><strong>{scheduled}</strong> for scheduling</span>
            <span><strong>{trackedPeople}</strong> unique people tracked</span>
          </div>
        </div>
        <div className="analytics-main-chart" role="img" aria-label={`${interviewed} live interviewed compared with ${scheduled} for scheduling`}>
          <div className="analytics-chart-grid"><span /><span /><span /><span /></div>
          {[
            { label: "Live interviewed", value: interviewed, tone: "interviewed" },
            { label: "For scheduling", value: scheduled, tone: "scheduled" },
          ].map((bar) => (
            <div className="analytics-main-column" key={bar.label}>
              <strong>{bar.value}</strong>
              <div className={`analytics-main-bar analytics-main-bar-${bar.tone}`} style={{ height: `${Math.max((bar.value / mainMaximum) * 100, bar.value ? 8 : 2)}%` }} />
              <span>{bar.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel analytics-calendar-panel">
        <div className="panel-head analytics-calendar-head">
          <div>
            <p className="eyebrow">Daily staffing calendar</p>
            <h2>Interviews, orientation and training</h2>
            <p>Choose a date to see the people scheduled or completed on that day.</p>
          </div>
          <label className="analytics-calendar-date-picker"><span>Choose date</span><input type="date" value={activeActivityDate} onChange={(event) => { setSelectedActivityDate(event.target.value); setSelectedCalendarMonth(event.target.value.slice(0, 7)); }} /></label>
        </div>

        <div className="analytics-calendar-layout">
          <div className="analytics-calendar">
            <div className="analytics-calendar-toolbar">
              <button type="button" aria-label="Previous month" onClick={() => setSelectedCalendarMonth(shiftCalendarMonth(visibleCalendarMonth, -1))}>←</button>
              <strong>{calendarMonthLabel(visibleCalendarMonth)}</strong>
              <button type="button" aria-label="Next month" onClick={() => setSelectedCalendarMonth(shiftCalendarMonth(visibleCalendarMonth, 1))}>→</button>
            </div>
            <div className="analytics-calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="analytics-calendar-grid">
              {calendarDates.map((date, index) => {
                if (!date) return <span className="analytics-calendar-blank" key={`blank-${index}`} />;
                const activity = activityByDate.get(date);
                const total = (activity?.interviews.length ?? 0) + (activity?.orientations.length ?? 0) + (activity?.training.length ?? 0);
                return (
                  <button className={`analytics-calendar-day ${date === activeActivityDate ? "selected" : ""} ${total ? "has-activity" : ""}`} type="button" key={date} aria-label={`${displayDate(date)}${total ? `, ${total} activities` : ", no activities"}`} onClick={() => setSelectedActivityDate(date)}>
                    <strong>{Number(date.slice(-2))}</strong>
                    <span className="analytics-calendar-badges">
                      {activity?.interviews.length ? <i className="interview">I {activity.interviews.length}</i> : null}
                      {activity?.orientations.length ? <i className="orientation">O {activity.orientations.length}</i> : null}
                      {activity?.training.length ? <i className="training">T {activity.training.length}</i> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="analytics-calendar-legend"><span><i className="interview" /> Interviews</span><span><i className="orientation" /> Orientation completed</span><span><i className="training" /> Day 1 training</span></div>
          </div>

          <aside className="analytics-calendar-details">
            <div className="analytics-calendar-details-head"><div><p className="eyebrow">Selected day</p><h3>{displayDate(activeActivityDate)}</h3></div><span className="pill">{selectedActivity.interviews.length + selectedActivity.orientations.length + selectedActivity.training.length} activities</span></div>
            <div className="analytics-day-summary">
              <span><strong>{selectedActivity.interviews.length}</strong> interviews</span>
              <span><strong>{selectedConfirmed}</strong> confirmed</span>
              <span><strong>{selectedActivity.orientations.length}</strong> orientation completed</span>
              <span><strong>{selectedActivity.training.length}</strong> Day 1 training</span>
            </div>
            <div className="analytics-day-lists">
              {[
                { key: "interviews", label: "Scheduled interviews", people: selectedActivity.interviews, tone: "interview" },
                { key: "orientations", label: "Orientation completed", people: selectedActivity.orientations, tone: "orientation" },
                { key: "training", label: "Day 1 training", people: selectedActivity.training, tone: "training" },
              ].map((group) => (
                <section className="analytics-day-list" key={group.key}>
                  <div className="analytics-day-list-head"><span><i className={group.tone} />{group.label}</span><strong>{group.people.length}</strong></div>
                  {group.people.length ? <ul>{group.people.map((person) => <li key={person.id}><span className="person-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.detail}</small></div>{group.key === "interviews" && person.confirmed ? <em>Confirmed</em> : null}</li>)}</ul> : <p>No drivers for this date.</p>}
                </section>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {hasTimeAccess && (
        <section className="panel analytics-comment-report">
          <div className="panel-head analytics-comment-head">
            <div>
              <p className="eyebrow">Time &amp; Attendance insights</p>
              <h2>Employees grouped by matching comments</h2>
              <p>Choose a reporting period and a Vertical 4 comment to focus the employee list.</p>
            </div>
            <div className="analytics-comment-summary">
              <span className="analytics-comment-window"><strong>{commentRangeStart && commentRangeEnd ? `${displayDate(commentRangeStart)} – ${displayDate(commentRangeEnd)}` : "No dates"}</strong> reporting window</span>
              <span><strong>{timeCommentGroups.length}</strong> comment group{timeCommentGroups.length === 1 ? "" : "s"}</span>
              <span><strong>{commentedPeopleTotal}</strong> employee{commentedPeopleTotal === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div className="analytics-comment-filterbar">
            <label>
              <span>Reporting period</span>
              <select value={commentPeriod} disabled={!timeReportDates.length} onChange={(event) => setCommentPeriod(event.target.value as "weekly" | "monthly" | "custom")}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom date range</option>
              </select>
            </label>
            {commentPeriod === "weekly" && (
              <label>
                <span>Week ending</span>
                <input type="date" value={effectiveCommentWeekEnd} min={earliestTimeReportDate} max={latestTimeReportDate} disabled={!timeReportDates.length} onChange={(event) => setCommentWeekEnding(event.target.value)} />
              </label>
            )}
            {commentPeriod === "monthly" && (
              <label>
                <span>Month</span>
                <input type="month" value={effectiveCommentMonth} min={earliestTimeReportDate.slice(0, 7)} max={latestTimeReportDate.slice(0, 7)} disabled={!timeReportDates.length} onChange={(event) => setCommentMonth(event.target.value)} />
              </label>
            )}
            {commentPeriod === "custom" && (
              <>
                <label>
                  <span>From</span>
                  <input type="date" value={effectiveCommentCustomStart} min={earliestTimeReportDate} max={effectiveCommentCustomEnd || latestTimeReportDate} disabled={!timeReportDates.length} onChange={(event) => setCommentCustomStart(event.target.value)} />
                </label>
                <label>
                  <span>To</span>
                  <input type="date" value={effectiveCommentCustomEnd} min={effectiveCommentCustomStart || earliestTimeReportDate} max={latestTimeReportDate} disabled={!timeReportDates.length} onChange={(event) => setCommentCustomEnd(event.target.value)} />
                </label>
              </>
            )}
            <label className="analytics-comment-picker">
              <span>Comment</span>
              <select value={activeCommentKey} disabled={!commentOptions.length} onChange={(event) => setSelectedCommentKey(event.target.value)}>
                <option value="all">All comments</option>
                {commentOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
              </select>
            </label>
          </div>

          {timeCommentGroups.length ? (
            <div className={`analytics-comment-grid ${activeCommentKey !== "all" ? "single" : ""}`}>
              {timeCommentGroups.map((group, index) => (
                <article className={`analytics-comment-card analytics-comment-card-${index % 4}`} key={group.comment.toLowerCase()}>
                  <div className="analytics-comment-card-head">
                    <span className="analytics-comment-mark">CM</span>
                    <div><p>Shared comment</p><h3>{group.comment}</h3></div>
                    <strong>{group.people.length}</strong>
                  </div>
                  <ul>
                    {group.people.map((person) => (
                      <li key={person.id}>
                        <span className="person-avatar">{initials(person.name)}</span>
                        <div><strong>{person.name}</strong><small>{person.detail}</small></div>
                        <time dateTime={person.reportDate}>{displayDate(person.reportDate)}</time>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No matching Vertical 4 comments" copy="Choose another reporting period or comment. Published Time & Attendance comments will appear here automatically." />
          )}
        </section>
      )}

      {!hasAnalytics && <section className="panel"><EmptyState title="No analytics data in this range" copy="Choose a wider date range or publish Sourcing, Orientation, or Training reports to populate the funnel." /></section>}

      <div className="analytics-layout">
        <section className="panel analytics-funnel-panel">
          <div className="panel-head"><div><p className="eyebrow">Pipeline progression</p><h3>Applicant-to-schedule funnel</h3><p>Unique people matched across every published report inside the selected reporting window.</p></div><span className="pill">{selectedRangeStart && selectedRangeEnd ? `${displayDate(selectedRangeStart)} - ${displayDate(selectedRangeEnd)}` : "No reports"}</span></div>
          <div className="analytics-funnel-bars">
            {funnelStages.map((stage, index) => {
              const value = countFor(stage.id);
              const contacted = countFor("contacted");
              const retention = contacted > 0 ? Math.round((value / contacted) * 100) : 0;
              const source = stage.id === "live_interviewed"
                ? "Unique drivers with Confirmed Interview = Yes"
                : `${retention}% of contacted applicants`;
              return (
                <div className="analytics-funnel-row" key={stage.id}>
                  <span className="analytics-stage-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="analytics-stage-copy"><strong>{stage.label}</strong><span>{source}</span></div>
                  <div className="analytics-track"><span style={{ width: `${(value / stageMaximum) * 100}%` }} /></div>
                  <strong className="analytics-stage-value">{value}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="panel analytics-quality-panel">
          <p className="eyebrow">Data confidence</p>
          <h3>Unique applicant journey</h3>
          <p className="analytics-range-explainer">People are matched by email, then phone, then normalized name. Live interviewed uses only the Confirmed Interview field and counts each confirmed driver once.</p>
          <p>Live interviewed now comes directly from the published “Moved to In-person Interview” total. Other journey stages connect people by email, phone, then normalized name.</p>
          <div className="analytics-confidence-list">
            <span><i /> Includes every report day in range</span>
            <span><i /> Live interview requires confirmation</span>
            <span><i /> Respects each client&apos;s vertical access</span>
          </div>
        </aside>
      </div>

      <section className="analytics-comparison-section">
        <div className="panel-head"><div><p className="eyebrow">Stage comparisons</p><h2>Conversion performance</h2><p>Side-by-side results for every major handoff in the hiring journey.</p></div></div>
        <div className="analytics-comparison-grid">
          {comparisons.map((comparison) => {
            const fromValue = countFor(comparison.from);
            const toValue = countFor(comparison.to);
            const maximum = Math.max(fromValue, toValue, 1);
            const conversion = fromValue > 0 ? Math.round((toValue / fromValue) * 100) : 0;
            return (
              <article className="panel analytics-comparison-card" key={comparison.label}>
                <div className="analytics-comparison-head"><span>{comparison.label}</span><strong>{conversion}%</strong></div>
                <div className="analytics-comparison-bar"><span className="comparison-from" style={{ width: `${(fromValue / maximum) * 100}%` }} /></div>
                <div className="analytics-comparison-bar"><span className="comparison-to" style={{ width: `${(toValue / maximum) * 100}%` }} /></div>
                <div className="analytics-comparison-values"><span>{stageLabel(comparison.from)} <strong>{fromValue}</strong></span><span>{stageLabel(comparison.to)} <strong>{toValue}</strong></span></div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AmazonVsAdp({ reports }: { reports: PublishedReport[] }) {
  const matching = reportsForPage(reports, "time");
  const rows = matching.flatMap((report) => report.report_rows.map((row) => {
    const amazonHours = clockHoursBetween(row.data.cortex_app_in, row.data.cortex_app_out);
    const adpHours = clockHoursBetween(row.data.adp_clock_in, row.data.adp_clock_out);
    return {
      report,
      row,
      amazonHours,
      adpHours,
      difference: amazonHours !== null && adpHours !== null ? Math.round((amazonHours - adpHours) * 100) / 100 : null,
    };
  }));
  const amazonTotal = rows.reduce((sum, item) => sum + (item.amazonHours ?? 0), 0);
  const adpTotal = rows.reduce((sum, item) => sum + (item.adpHours ?? 0), 0);
  const difference = Math.round((amazonTotal - adpTotal) * 100) / 100;
  const completeComparisons = rows.filter((item) => item.difference !== null).length;
  const formatHours = (value: number | null) => value === null ? "Missing" : `${value.toFixed(2)} hrs`;
  const differenceTone = (value: number | null) => {
    if (value === null) return "neutral";
    const absolute = Math.abs(value);
    if (absolute <= 0.25) return "success";
    if (absolute <= 0.5) return "warning";
    return "danger";
  };

  return (
    <section className="panel amazon-adp-panel">
      <div className="panel-head">
        <div>
          <h2>Amzn VS ADP</h2>
          <p>Side-by-side clock-hour totals from the current Time & Attendance report.</p>
        </div>
        <span className="pill">Vertical 4 access</span>
      </div>
      <div className="amazon-adp-summary">
        <div className="amazon-adp-card amazon-card"><span>Amazon total hours</span><strong>{amazonTotal.toFixed(2)}</strong><small>Cortex App In to Cortex App Out</small></div>
        <div className="amazon-adp-card adp-card"><span>ADP total hours</span><strong>{adpTotal.toFixed(2)}</strong><small>ADP Clock In to ADP Clock Out</small></div>
        <div className={`amazon-adp-card difference-card difference-${differenceTone(difference)}`}><span>Amazon minus ADP</span><strong>{difference > 0 ? "+" : ""}{difference.toFixed(2)}</strong><small>{completeComparisons} complete comparison{completeComparisons === 1 ? "" : "s"}</small></div>
      </div>
      <div className="note-box amazon-adp-note">This first version compares the elapsed clock-in to clock-out span from the current Vertical 4 data. Break deductions and additional employee-side rules can be added after the revised requirements are confirmed.</div>
      <div className="table-wrap">
        <table className="data-table amazon-adp-table">
          <thead><tr><th>Station</th><th>Employee</th><th>Amazon In</th><th>Amazon Out</th><th>Amazon Hours</th><th>ADP In</th><th>ADP Out</th><th>ADP Hours</th><th>Difference</th><th>Report Date</th></tr></thead>
          <tbody>
            {rows.map(({ report, row, amazonHours, adpHours, difference: rowDifference }) => (
              <tr className={`report-row report-row-${differenceTone(rowDifference)}`} key={`${report.id}:${row.id}`}>
                <td><DetailValue value={row.data.station} /></td>
                <td><div className="person-cell"><span className="person-avatar">{initials(row.person_name ?? "VP")}</span><strong>{row.person_name ?? "Unnamed employee"}</strong></div></td>
                <td><DetailValue value={row.data.cortex_app_in} /></td>
                <td><DetailValue value={row.data.cortex_app_out} /></td>
                <td><span className="hours-badge tone-neutral">{formatHours(amazonHours)}</span></td>
                <td><DetailValue value={row.data.adp_clock_in} /></td>
                <td><DetailValue value={row.data.adp_clock_out} /></td>
                <td><span className="hours-badge tone-neutral">{formatHours(adpHours)}</span></td>
                <td><span className={`hours-badge tone-${differenceTone(rowDifference)}`}>{rowDifference !== null && rowDifference > 0 ? "+" : ""}{formatHours(rowDifference)}</span></td>
                <td>{displayDate(report.report_date)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10}><EmptyState title="No Time & Attendance hours yet" copy="This comparison will populate after a Vertical 4 report is published." /></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
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
          {[["Upload source", `This upload is locked to ${client.company_name}.`], ["Review extraction", "Confirm totals, names, stages, and exceptions."], ["Preview client view", "See the dashboard before it is visible."], ["Publish update", "Add today’s data to the rolling 90-day report."]].map(([title, copy], index) => <div className="step" key={title}><span className="step-number">0{index + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}
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

function AdminClientView({ clients, profile, onMessage, readOnly = false }: { clients: ClientOption[]; profile: PortalProfile; onMessage: (message: string) => void; readOnly?: boolean }) {
  const [clientId, setClientId] = useState("");
  const [clientPage, setClientPage] = useState<Page>("overview");
  const [reports, setReports] = useState<PublishedReport[]>([]);
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [loading, setLoading] = useState(true);
  const selectedClient = clients.find((client) => client.id === clientId) ?? clients[0];
  const selectedClientNavItems = useMemo(
    () => readOnly ? reportViewerNavItems : clientNavigation(selectedClient),
    [readOnly, selectedClient],
  );

  useEffect(() => {
    if (!supabase || !selectedClient?.id) return;
    const selectedClientId = selectedClient.id;
    const portalClient = supabase;
    let active = true;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 89);

    async function loadClientReports() {
      const { data, error } = await portalClient
        .from("reports")
        .select("id, vertical_id, report_date, version, published_at, report_metrics(metric_key, metric_label, numeric_value, text_value), report_rows(id, row_type, person_name, data, source_row)")
        .eq("client_id", selectedClientId)
        .eq("status", "published")
        .gte("report_date", startDate.toISOString().slice(0, 10))
        .order("report_date", { ascending: false })
        .order("version", { ascending: false });
      if (!active) return;
      setLoading(false);
      if (error) {
        setReports([]);
        onMessage(`Client reports could not be loaded: ${error.message}`);
        return;
      }
      setReports(dedupePublishedReports((data ?? []) as unknown as PublishedReport[]));
    }

    loadClientReports();
    const refreshTimer = window.setInterval(loadClientReports, 30000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [selectedClient?.id, onMessage]);

  const availableReportDates = reportDates(reports);
  const selectedReportDate = reportDate === null || (reportDate && !availableReportDates.includes(reportDate))
    ? availableReportDates[0] ?? ""
    : reportDate;
  const visibleReports = reportsForDate(reports, selectedReportDate);
  const allowedReports = readOnly
    ? reports
    : reports.filter((report) => enabledVerticalIds(selectedClient).includes(report.vertical_id));
  const visibleVerticalIds = readOnly
    ? verticalOptions.map((vertical) => vertical.id)
    : enabledVerticalIds(selectedClient);

  if (!selectedClient) {
    return (
      <section className="panel admin-report-empty">
        <p className="eyebrow">{readOnly ? "Admin viewer access" : "Super Admin + client access"}</p>
        <h1>Add a DSP before opening the client view</h1>
        <p>{readOnly ? "A Super Admin must create a DSP before its published reports can be viewed." : "Create your first client in the Command center, then return here to see its published dashboard."}</p>
      </section>
    );
  }

  const clientPageTitle = clientPage === "overview"
    ? "Operations overview"
    : [...navItems, analyticsNavItem, amazonVsAdpNavItem, ...sharedNavigationItems].find((item) => item.id === clientPage)?.label ?? "Operations";

  async function exportClientDashboard(format: ExportFormat) {
    try {
      await exportDashboardData(visibleReports, selectedClient.company_name, format);
      onMessage(`${format.toUpperCase()} export prepared.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The export could not be prepared.");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{readOnly ? "All-DSP report access" : "Super Admin + client access"}</p>
          <h1>{readOnly ? "Read-only DSP report viewer" : "Client dashboard view"}</h1>
          <p>{readOnly ? "Select any DSP to view and download its published reports across every vertical. Editing, uploading, and administration are disabled." : "Select any DSP to see the same published 90-day dashboard and vertical reports available to that client."}</p>
        </div>
        <span className="pill">{readOnly ? "View and download only" : "Published client data"}</span>
      </div>
      <section className="panel admin-report-selector admin-client-selector">
        <label>
          <span>DSP / Client</span>
          <select
            value={selectedClient.id}
            onChange={(event) => {
              setLoading(true);
              setClientId(event.target.value);
              setClientPage("overview");
              setReportDate(null);
              setVerdicts({});
            }}
          >
            {clients.map((client) => <option value={client.id} key={client.id}>{client.company_name}</option>)}
          </select>
        </label>
        <div className="admin-report-access-note">
          <strong>Viewing as {selectedClient.company_name}</strong>
          <span>This preview only shows reports published to this DSP during the latest 90 days.</span>
        </div>
      </section>

      <section className="admin-client-frame">
        <div className="admin-client-context">
          <div>
            <span className="client-avatar">{initials(selectedClient.company_name)}</span>
            <div>
              <small>Client dashboard preview</small>
              <strong>{selectedClient.company_name}</strong>
            </div>
          </div>
          <span className="pill">{readOnly ? "Admin viewer · read only" : "Super Admin viewing as client"}</span>
        </div>
        <nav className="admin-client-nav" aria-label={`${selectedClient.company_name} client report navigation`}>
          {selectedClientNavItems.map((item) => (
            <button
              key={item.id}
              className={clientPage === item.id ? "active" : ""}
              onClick={() => setClientPage(item.id)}
            >
              <span>{item.short}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="admin-client-dashboard" data-export-region>
          {clientPage !== "vault" && clientPage !== "tasks" && <div className="page-heading admin-client-heading">
            <div>
              <p className="eyebrow">{selectedClient.company_name} · Daily report</p>
              <h1>{clientPageTitle}</h1>
              <p>{clientPage === "analytics"
                ? "Identity-matched conversion analytics across the latest 90 days of published reports."
                : selectedReportDate
                  ? `Showing the published report for ${displayDate(selectedReportDate)}, with the rolling 90-day comparison retained in the overview.`
                  : "Showing all published reports in the rolling 90-day window."}</p>
            </div>
            <div className="heading-actions">
              {clientPage !== "analytics" && <ReportDayControl reports={reports} value={selectedReportDate} onChange={setReportDate} />}
              <ExportControl onExport={exportClientDashboard} />
            </div>
          </div>}

          {loading ? (
            <section className="panel admin-client-loading"><span className="pulse-loader" /><strong>Loading {selectedClient.company_name}&apos;s published reports…</strong></section>
          ) : (
            <>
              {clientPage === "overview" && <Overview onOpen={setClientPage} reports={visibleReports} historyReports={reports} selectedDate={selectedReportDate} allowedVerticalIds={visibleVerticalIds} />}
              {clientPage === "analytics" && <AnalyticsDashboard reports={allowedReports} hasTimeAccess={visibleVerticalIds.includes(timeAttendanceVerticalId)} />}
              {!readOnly && clientPage === "vault" && <CredentialVault clients={clients} client={selectedClient} role="client" profile={profile} onMessage={onMessage} />}
              {!readOnly && clientPage === "tasks" && <ProjectBoard clients={clients} client={selectedClient} role="client" profile={profile} onMessage={onMessage} />}
              {(clientPage === "recruiting" || clientPage === "orientation" || clientPage === "training") && (
                <VerticalReport page={clientPage} reports={visibleReports} journeyReports={allowedReports} onExport={exportClientDashboard} />
              )}
              {clientPage === "time" && (
                <TimeAttendance
                  reports={visibleReports}
                  journeyReports={allowedReports}
                  verdicts={verdicts}
                  onVerdict={readOnly ? undefined : (id, verdict) => {
                    setVerdicts((current) => ({ ...current, [id]: verdict }));
                    onMessage(`Time-theft item marked ${verdict} in the client preview.`);
                  }}
                />
              )}
              {clientPage === "amzn-adp" && <AmazonVsAdp reports={visibleReports} />}
            </>
          )}
        </div>
      </section>
    </>
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
  const [clientVerticalIds, setClientVerticalIds] = useState<string[]>(verticalOptions.map((vertical) => vertical.id));
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reportsCount, setReportsCount] = useState(0);
  const [resetScope, setResetScope] = useState<ResetScope | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editAccess, setEditAccess] = useState({ verticalId: verticalOptions[0].id, clientIds: [] as string[] });
  const [editAccessBusy, setEditAccessBusy] = useState(false);
  const [editingClientAccess, setEditingClientAccess] = useState<ClientOption | null>(null);
  const [editClientDetails, setEditClientDetails] = useState({ companyName: "", primaryEmail: "" });
  const [editClientVerticalIds, setEditClientVerticalIds] = useState<string[]>([]);
  const [editClientAccessBusy, setEditClientAccessBusy] = useState(false);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
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
      supabase
        .from("employee_client_assignments")
        .select("employee_id, client_id, vertical_id"),
    ]).then(([{ data, error }, { count, error: reportCountError }, { data: assignmentData, error: assignmentError }]) => {
        if (!active) return;
        if (error) {
          onMessage(error.message);
          return;
        }
        if (reportCountError) {
          onMessage(reportCountError.message);
        }
        if (assignmentError) {
          onMessage(assignmentError.message);
        }
        setReportsCount(count ?? 0);
        setUsers((data ?? []).map((user) => {
          const vertical = verticalOptions.find((item) => item.id === user.vertical_id);
          const client = clients.find((item) => item.id === user.client_id);
          const clientIds = (assignmentData ?? [])
            .filter((assignment) => assignment.employee_id === user.id)
            .map((assignment) => assignment.client_id);
          return {
            id: user.id,
            name: user.full_name || user.email,
            email: user.email,
            role: user.role === "super_admin" ? "Super Admin" : user.role === "viewer_admin" ? "Admin Viewer" : user.role === "employee" ? "Employee" : "Client",
            portalRole: user.role as AdminUser["portalRole"],
            assignment: user.role === "super_admin"
              ? "All access"
              : user.role === "viewer_admin"
                ? "All DSPs · view and download only"
                : user.role === "employee"
                  ? `${vertical?.name ?? "Vertical pending"} · ${clientIds.length} DSP${clientIds.length === 1 ? "" : "s"}`
                  : client?.company_name ?? "DSP pending",
            verticalId: user.vertical_id,
            clientIds,
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
    const { data, error } = await supabase.from("clients").insert({ company_name: clientCompany.trim(), primary_email: clientEmail.trim().toLowerCase(), enabled_vertical_ids: clientVerticalIds, created_by: session.user.id }).select("id, company_name, primary_email, enabled_vertical_ids").single();
    if (error) return onMessage(error.message);
    onClientsChange([...clients, data as ClientOption].sort((a, b) => a.company_name.localeCompare(b.company_name)));
    setClientCompany("");
    setClientEmail("");
    setClientVerticalIds(verticalOptions.map((vertical) => vertical.id));
    onMessage("DSP workspace created.");
  }

  function openClientAccess(client: ClientOption) {
    setEditingClientAccess(client);
    setEditClientDetails({ companyName: client.company_name, primaryEmail: client.primary_email });
    setEditClientVerticalIds(enabledVerticalIds(client));
  }

  async function saveClientAccess() {
    if (!supabase || !editingClientAccess) return;
    const companyName = editClientDetails.companyName.trim();
    const primaryEmail = editClientDetails.primaryEmail.trim().toLowerCase();
    if (!companyName || !/^\S+@\S+\.\S+$/.test(primaryEmail)) {
      onMessage("Enter a company name and a valid primary email address.");
      return;
    }
    setEditClientAccessBusy(true);
    const { data, error } = await supabase
      .from("clients")
      .update({
        company_name: companyName,
        primary_email: primaryEmail,
        enabled_vertical_ids: editClientVerticalIds,
      })
      .eq("id", editingClientAccess.id)
      .select("id, company_name, primary_email, enabled_vertical_ids")
      .single();
    setEditClientAccessBusy(false);
    if (error) {
      onMessage(error.message);
      return;
    }
    onClientsChange(clients
      .map((client) => client.id === editingClientAccess.id ? data as ClientOption : client)
      .sort((a, b) => a.company_name.localeCompare(b.company_name)));
    onMessage(`${companyName}'s client information was updated.`);
    setEditingClientAccess(null);
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
        role: userForm.role === "admin" ? "super_admin" : userForm.role === "viewer" ? "viewer_admin" : userForm.role,
      }),
    });
    const result = await response.json() as { error?: string; user?: { id: string } };
    if (!response.ok) return onMessage(result.error ?? "User creation failed.");
    const vertical = verticalOptions.find((item) => item.id === userForm.verticalId);
    const client = clients.find((item) => item.id === selectedClientId);
    setUsers([...users, {
      id: result.user?.id ?? "",
      name: userForm.fullName,
      email: userForm.email,
      role: userForm.role === "admin" ? "Super Admin" : userForm.role === "viewer" ? "Admin Viewer" : userForm.role === "employee" ? "Employee" : "Client",
      portalRole: userForm.role === "admin" ? "super_admin" : userForm.role === "viewer" ? "viewer_admin" : userForm.role as "employee" | "client",
      assignment: userForm.role === "employee" ? `${vertical?.name} · ${userForm.clientIds.length} DSP${userForm.clientIds.length === 1 ? "" : "s"}` : userForm.role === "client" ? client?.company_name ?? "Client" : userForm.role === "viewer" ? "All DSPs · view and download only" : "All access",
      verticalId: userForm.role === "employee" ? userForm.verticalId : null,
      clientIds: userForm.role === "employee" ? [...userForm.clientIds] : [],
    }]);
    setUserForm({ ...userForm, fullName: "", email: "", password: "" });
    onMessage("User account created.");
  }

  function openEmployeeAccess(user: AdminUser) {
    setEditingUser(user);
    setEditAccess({
      verticalId: user.verticalId ?? verticalOptions[0].id,
      clientIds: [...user.clientIds],
    });
  }

  async function saveEmployeeAccess() {
    if (!session || !editingUser) return;
    if (!editAccess.clientIds.length) {
      onMessage("Select at least one DSP for this employee.");
      return;
    }
    setEditAccessBusy(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: editingUser.id,
          verticalId: editAccess.verticalId,
          clientIds: editAccess.clientIds,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        onMessage(result.error ?? "Employee access could not be updated.");
        return;
      }
      const vertical = verticalOptions.find((item) => item.id === editAccess.verticalId);
      setUsers((current) => current.map((user) => user.id === editingUser.id ? {
        ...user,
        verticalId: editAccess.verticalId,
        clientIds: [...editAccess.clientIds],
        assignment: `${vertical?.name ?? "Vertical pending"} · ${editAccess.clientIds.length} DSP${editAccess.clientIds.length === 1 ? "" : "s"}`,
      } : user));
      onMessage(`${editingUser.name}'s client access was updated.`);
      setEditingUser(null);
    } catch {
      onMessage("The employee access request could not reach the server.");
    } finally {
      setEditAccessBusy(false);
    }
  }

  function openPasswordEditor(user: AdminUser) {
    setPasswordUser(user);
    setNewPassword("");
    setShowNewPassword(false);
  }

  function closePasswordEditor() {
    if (passwordBusy) return;
    setPasswordUser(null);
    setNewPassword("");
    setShowNewPassword(false);
  }

  async function saveNewPassword() {
    if (!session || !passwordUser) return;
    if (newPassword.length < 10) {
      onMessage("The new password must contain at least 10 characters.");
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "update_password",
          userId: passwordUser.id,
          password: newPassword,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        onMessage(result.error ?? "The password could not be updated.");
        return;
      }

      onMessage(`${passwordUser.name}'s password was updated.`);
      setPasswordUser(null);
      setNewPassword("");
      setShowNewPassword(false);
    } catch {
      onMessage("The password request could not reach the server.");
    } finally {
      setPasswordBusy(false);
    }
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
      <div className="page-heading"><div><p className="eyebrow">System-wide visibility</p><h1>Super Admin command center</h1><p>Create DSP workspaces, issue employee, client, and read-only admin accounts, and assign one vertical per employee across selected DSPs.</p></div><span className="pill">5 PM ET daily deadline</span></div>
      <div className="admin-stat-grid">
        <Stat index="01" label="Active DSPs" value={String(clients.length)} note="Manually managed workspaces" />
        <Stat index="02" label="Portal users" value={String(users.length)} note="Admins, viewers, employees, and clients" />
        <Stat index="03" label="Verticals configured" value="4" note="Production report structures" />
        <Stat index="04" label="Reports received" value={String(reportsCount)} note={reportsCount ? "Stored report versions" : "No client reports uploaded yet"} />
      </div>
      <div className="admin-form-grid">
        <section className="panel admin-form-panel">
          <div className="panel-head"><div><h2>Add DSP</h2><p>Create a workspace from company name and primary email</p></div></div>
          <form className="admin-form" onSubmit={addClient}>
            <label>Company name<input required value={clientCompany} onChange={(event) => setClientCompany(event.target.value)} placeholder="Example Logistics LLC" /></label>
            <label>Primary DSP email<input required type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} placeholder="operations@example.com" /></label>
            <fieldset className="dsp-assignment-fieldset"><legend>Unlocked client verticals</legend><div className="dsp-assignment-list">{verticalOptions.map((vertical) => <label key={vertical.id}><input type="checkbox" checked={clientVerticalIds.includes(vertical.id)} onChange={(event) => setClientVerticalIds((current) => event.target.checked ? [...current, vertical.id] : current.filter((id) => id !== vertical.id))} /><span>{vertical.name}</span></label>)}</div><small>Only checked verticals will appear for this client. Amzn VS ADP follows Time & Attendance access.</small></fieldset>
            <button className="primary-btn">Create DSP workspace</button>
          </form>
        </section>
        <section className="panel admin-form-panel">
          <div className="panel-head"><div><h2>Add user</h2><p>Email/password access with role-based permissions</p></div></div>
          <form className="admin-form" onSubmit={addUser}>
            <div className="form-row"><label>Full name<input required value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} /></label><label>Email<input required type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label></div>
            <div className="form-row"><label>Temporary password<input required minLength={10} type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} placeholder="Minimum 10 characters" /></label><label>Role<select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="employee">Employee</option><option value="client">Client</option><option value="viewer">Admin Viewer</option><option value="admin">Super Admin</option></select></label></div>
            {userForm.role === "viewer" && <div className="note-box">Admin Viewers can open every DSP, view every vertical, and download published reports. They cannot upload, edit, publish, manage users or clients, access VINE Vault, or change tasks.</div>}
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
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Company</th><th>Primary email</th><th>Client access</th><th>Status</th><th>Action</th></tr></thead><tbody>{clients.map((client) => { const access = enabledVerticalIds(client); return <tr key={client.id}><td><strong>{client.company_name}</strong></td><td>{client.primary_email}</td><td><div className="client-access-summary"><strong>{access.length} of 4 verticals</strong><span>{verticalOptions.filter((vertical) => access.includes(vertical.id)).map((vertical) => vertical.name).join(" · ") || "Overview only"}</span></div></td><td><span className="status-ok">Active</span></td><td><button className="table-edit-btn" type="button" onClick={() => openClientAccess(client)}>Edit client</button></td></tr>; })}{!clients.length && <tr><td colSpan={5}><EmptyState title="No DSPs added" copy="Use the Add DSP form to create your practice client workspace." /></td></tr>}</tbody></table></div>
        </section>
        <section className="panel report-panel">
          <div className="panel-head"><div><h2>Users & assignments</h2><p>Employee verticals and client membership</p></div></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Access</th><th>Action</th></tr></thead><tbody>{users.map((user) => { const isCurrentUser = user.id === session?.user.id; return <tr key={user.id || user.email}><td><div className="person-cell"><span className="person-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><div className="small-muted">{user.email}</div></div></div></td><td><span className="pill">{user.role}</span></td><td>{user.assignment}</td><td><div className="user-action-buttons">{isCurrentUser && <span className="current-account-label">Current account</span>}{user.portalRole === "employee" && <button className="table-edit-btn" onClick={() => openEmployeeAccess(user)} disabled={!user.id}>Edit access</button>}<button className="table-edit-btn password-action" onClick={() => openPasswordEditor(user)} disabled={!user.id}>Change password</button>{!isCurrentUser && <button className="table-delete-btn" onClick={() => setDeleteUserTarget(user)} disabled={!user.id}>Delete user</button>}</div></td></tr>; })}{!users.length && <tr><td colSpan={4}><EmptyState title="No portal users found" copy="Create an employee or client login after adding the DSP." /></td></tr>}</tbody></table></div>
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
      {editingClientAccess && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="client-vertical-access-title">
          <section className="preview-dialog employee-access-dialog">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Client information and access</p>
                <h2 id="client-vertical-access-title">Manage {editingClientAccess.company_name}</h2>
                <p>Update the DSP information and unlock only the services included for this client.</p>
              </div>
              <button className="icon-btn" onClick={() => setEditingClientAccess(null)} disabled={editClientAccessBusy} aria-label="Close">×</button>
            </div>
            <div className="client-details-form">
              <label>Company name<input required value={editClientDetails.companyName} onChange={(event) => setEditClientDetails((current) => ({ ...current, companyName: event.target.value }))} /></label>
              <label>Primary DSP email<input required type="email" value={editClientDetails.primaryEmail} onChange={(event) => setEditClientDetails((current) => ({ ...current, primaryEmail: event.target.value }))} /></label>
            </div>
            <fieldset className="dsp-assignment-fieldset client-vertical-fieldset"><legend>Unlocked verticals</legend><div className="dsp-assignment-list">{verticalOptions.map((vertical) => <label key={vertical.id}><input type="checkbox" checked={editClientVerticalIds.includes(vertical.id)} onChange={(event) => setEditClientVerticalIds((current) => event.target.checked ? [...current, vertical.id] : current.filter((id) => id !== vertical.id))} /><span>{vertical.name}</span></label>)}</div><small>Amzn VS ADP is automatically unlocked when Time & Attendance is checked.</small></fieldset>
            <div className="client-access-impact">
              <strong>{editClientVerticalIds.length} of 4 verticals unlocked</strong>
              <span>{editClientVerticalIds.includes(timeAttendanceVerticalId) ? "Amzn VS ADP will be visible." : "Amzn VS ADP will be locked with Time & Attendance."}</span>
            </div>
            <div className="preview-dialog-actions">
              <button className="secondary-btn" onClick={() => setEditingClientAccess(null)} disabled={editClientAccessBusy}>Cancel</button>
              <button className="primary-btn" onClick={saveClientAccess} disabled={editClientAccessBusy}>{editClientAccessBusy ? "Saving client…" : "Save client changes"}</button>
            </div>
          </section>
        </div>
      )}
      {passwordUser && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title">
          <section className="preview-dialog password-dialog">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Secure password management</p>
                <h2 id="password-dialog-title">Change {passwordUser.name}&apos;s password</h2>
                <p>Existing passwords cannot be viewed because Supabase stores only a secure one-way hash. Enter a replacement password below.</p>
              </div>
              <button className="icon-btn" onClick={closePasswordEditor} disabled={passwordBusy} aria-label="Close">×</button>
            </div>
            <label className="password-field">
              New password
              <span className="password-input-wrap">
                <input
                  autoFocus
                  minLength={10}
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Minimum 10 characters"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowNewPassword((visible) => !visible)}>{showNewPassword ? "Hide" : "Show"}</button>
              </span>
              <small>The password is visible only while you enter it and is never stored in the dashboard.</small>
            </label>
            <div className="preview-dialog-actions">
              <button className="secondary-btn" onClick={closePasswordEditor} disabled={passwordBusy}>Cancel</button>
              <button className="primary-btn" onClick={saveNewPassword} disabled={passwordBusy || newPassword.length < 10}>{passwordBusy ? "Updating password…" : "Update password"}</button>
            </div>
          </section>
        </div>
      )}
      {editingUser && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-access-dialog-title">
          <section className="preview-dialog employee-access-dialog">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Employee access</p>
                <h2 id="edit-access-dialog-title">Edit {editingUser.name}</h2>
                <p>Choose one vertical and every DSP this employee is allowed to work on.</p>
              </div>
              <button className="icon-btn" onClick={() => setEditingUser(null)} disabled={editAccessBusy} aria-label="Close">×</button>
            </div>
            <label className="employee-access-vertical">Employee vertical<select value={editAccess.verticalId} onChange={(event) => setEditAccess((current) => ({ ...current, verticalId: event.target.value }))}>{verticalOptions.map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.name}</option>)}</select><small>This vertical applies across every selected DSP.</small></label>
            <fieldset className="dsp-assignment-fieldset"><legend>Assigned DSPs / clients</legend><div className="dsp-assignment-list">{clients.map((client) => <label key={client.id}><input type="checkbox" checked={editAccess.clientIds.includes(client.id)} onChange={(event) => setEditAccess((current) => ({ ...current, clientIds: event.target.checked ? [...current.clientIds, client.id] : current.clientIds.filter((id) => id !== client.id) }))} /><span>{client.company_name}</span></label>)}</div><small>The employee landing page will show all selected DSPs.</small></fieldset>
            <div className="preview-dialog-actions">
              <button className="secondary-btn" onClick={() => setEditingUser(null)} disabled={editAccessBusy}>Cancel</button>
              <button className="primary-btn" onClick={saveEmployeeAccess} disabled={editAccessBusy || !editAccess.clientIds.length}>{editAccessBusy ? "Saving access…" : "Save employee access"}</button>
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
