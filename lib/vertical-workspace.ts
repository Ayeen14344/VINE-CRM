import type { ExtractedReportRow, ExtractedValue } from "./report-extraction";

export type GridColumn = {
  key: string;
  label: string;
  kind?: "text" | "date" | "time" | "select" | "formula";
  options?: string[];
  width?: number;
};

export type WorkspaceRow = {
  id: string;
  personName: string;
  data: Record<string, ExtractedValue>;
};

export type GeneratedGroup = {
  title: string;
  tone: "success" | "warning" | "danger" | "neutral";
  rows: WorkspaceRow[];
  detailKey?: string;
};

const yesNo = ["Yes", "No"];
const completeStatuses = ["Completed", "In Progress", "Pending", "For Scheduling", "Off-boarded"];
const timeStatuses = ["Entered", "Pending", "No Response", "Completed", "Valid", "Invalid"];
const dispatchStatuses = ["Yes", "Fixed by Driver", "No"];

export const gridColumns: Record<string, GridColumn[]> = {
  "00000000-0000-4000-8000-000000000101": [
    { key: "candidate_name", label: "Name", width: 190 },
    { key: "email", label: "Email", width: 210 },
    { key: "phone_number", label: "Phone Number", width: 145 },
    { key: "activity_date", label: "Activity Date", kind: "date", width: 145 },
    { key: "interview_invite_sent", label: "Interview Invite Sent", kind: "select", options: yesNo, width: 160 },
    { key: "scheduled_interview", label: "Scheduled Interview", kind: "date", width: 165 },
    { key: "interview_confirmed", label: "Confirmed Interview", kind: "select", options: yesNo, width: 165 },
    { key: "no_response", label: "No Response", kind: "select", options: yesNo, width: 130 },
    { key: "rescheduled", label: "Rescheduled Date", kind: "date", width: 155 },
    { key: "interview_result", label: "Interview Result", kind: "select", options: ["Pass", "Fail", "Pending"], width: 150 },
    { key: "background_check", label: "Background Check", kind: "select", options: ["Pass", "Fail", "Pending"], width: 155 },
    { key: "clinic_details_sent", label: "Clinic Details Sent", kind: "select", options: yesNo, width: 155 },
    { key: "drug_test", label: "Drug Test", kind: "select", options: ["Pass", "Fail", "Pending"], width: 135 },
    { key: "cortex_onboarded", label: "Cortex Onboarded", kind: "select", options: yesNo, width: 155 },
  ],
  "00000000-0000-4000-8000-000000000102": [
    { key: "candidate_name", label: "Name", width: 190 },
    { key: "email", label: "Email", width: 210 },
    { key: "phone_number", label: "Number", width: 145 },
    { key: "orientation_docs_adp_status", label: "Orientation Docs / ADP", kind: "select", options: ["Completed", "Pending", "Off-boarded"], width: 190 },
    { key: "safety_standard_sent", label: "Safety Standard Sent", kind: "date", width: 165 },
    { key: "safety_standard_completed", label: "Safety Standard Completed", kind: "date", width: 190 },
    { key: "orientation_sent", label: "Orientation Sent", kind: "date", width: 155 },
    { key: "orientation_completed", label: "Orientation Completed", kind: "date", width: 185 },
    { key: "adp_payroll_setup", label: "ADP Payroll Set-up", kind: "date", width: 170 },
    { key: "adp_payroll_completed", label: "ADP Payroll Completed", kind: "date", width: 190 },
    { key: "training_schedule", label: "Training Schedule", width: 170 },
    { key: "remarks", label: "Status / Remarks", kind: "select", options: completeStatuses, width: 165 },
    { key: "note", label: "Note", width: 220 },
  ],
  "00000000-0000-4000-8000-000000000103": [
    { key: "driver_name", label: "Name", width: 190 },
    { key: "email", label: "Email", width: 210 },
    { key: "phone_number", label: "Phone Number", width: 145 },
    { key: "reminder_sent", label: "Sent Reminders", kind: "select", options: yesNo, width: 145 },
    { key: "day_1_attendance", label: "Day 1 Attendance", kind: "select", options: ["Present", "Absent", "Reschedule"], width: 160 },
    { key: "day_2_attendance", label: "Day 2 Attendance", kind: "select", options: ["Present", "Absent", "Reschedule"], width: 160 },
    { key: "training_status", label: "Training Status", kind: "select", options: ["Pass", "Fail", "Reschedule", "In Progress", "Pending"], width: 155 },
    { key: "ore_schedule", label: "ORE Schedule", kind: "date", width: 150 },
    { key: "work_schedule_plotted", label: "Work Schedule Plotted", kind: "date", width: 190 },
  ],
  "00000000-0000-4000-8000-000000000104": [
    { key: "station", label: "Station", width: 130 },
    { key: "driver_name", label: "Name", width: 190 },
    { key: "phone_number", label: "Phone Number", width: 145 },
    { key: "cortex_app_in", label: "Cortex App In", kind: "time", width: 140 },
    { key: "cortex_app_out", label: "Cortex App Out", kind: "time", width: 140 },
    { key: "adp_clock_in", label: "ADP Clock In", kind: "time", width: 140 },
    { key: "adp_clock_out", label: "ADP Clock Out", kind: "time", width: 140 },
    { key: "total_break_time_used", label: "Total Break Time Used", width: 175 },
    { key: "comments", label: "Comments", width: 240 },
    { key: "sign_in_difference", label: "Sign In Difference", kind: "formula", width: 165 },
    { key: "sign_out_difference", label: "Sign Out Difference", kind: "formula", width: 175 },
    { key: "missed_punch_in", label: "Missed Punch In", kind: "formula", width: 145 },
    { key: "missed_punch_out", label: "Missed Punch Out", kind: "formula", width: 155 },
    { key: "missed_punch_in_followup", label: "Follow up for Missed Punch In", kind: "select", options: yesNo, width: 210 },
    { key: "missed_punch_in_status", label: "Punch In Status", kind: "select", options: timeStatuses, width: 150 },
    { key: "missed_punch_out_followup", label: "Follow up for Missed Punch Out", kind: "select", options: yesNo, width: 220 },
    { key: "missed_punch_out_status", label: "Punch Out Status", kind: "select", options: timeStatuses, width: 155 },
    { key: "possible_time_theft", label: "Possible Time Theft", kind: "formula", width: 175 },
    { key: "sent_to_dispatch", label: "Sent To Dispatch", kind: "select", options: dispatchStatuses, width: 165 },
  ],
};

function text(value: ExtractedValue) {
  return String(value ?? "").trim();
}

function normalized(value: ExtractedValue) {
  return text(value).toLowerCase();
}

function hasValue(value: ExtractedValue) {
  return !!text(value) && !["no", "false", "n/a", "na", "-", "0", "missing"].includes(normalized(value));
}

function matches(value: ExtractedValue, expected: string) {
  return normalized(value) === expected.toLowerCase();
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyWorkspaceRow(): WorkspaceRow {
  return { id: newId(), personName: "", data: {} };
}

function validDateParts(year: number, month: number, day: number) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function dateParts(year: number, month: number, day: number) {
  if (!validDateParts(year, month, day)) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizePastedDate(value: ExtractedValue) {
  const raw = text(value)
    .replace(/^["']|["']$/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!raw) return "";

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 25000 && numeric <= 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(numeric) * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const iso = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s]|$)/);
  if (iso) {
    const normalizedIso = dateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (normalizedIso) return normalizedIso;
  }

  const numericDate = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\s|$)/);
  if (numericDate) {
    const first = Number(numericDate[1]);
    const second = Number(numericDate[2]);
    const shortYear = Number(numericDate[3]);
    const year = numericDate[3].length === 2
      ? (shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear)
      : shortYear;
    // VINE Pulse reports use US month/day/year. If the first value is above
    // 12, safely recognize it as a day/month/year value instead.
    const month = first > 12 && second <= 12 ? second : first;
    const day = first > 12 && second <= 12 ? first : second;
    const normalizedNumericDate = dateParts(year, month, day);
    if (normalizedNumericDate) return normalizedNumericDate;
  }

  if (/[a-z]/i.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.valueOf())) {
      return dateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    }
  }

  return "";
}

function timeFraction(value: ExtractedValue): number | null {
  const raw = text(value);
  if (!raw || normalized(value) === "missing") return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric < 2) return numeric % 1;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return (hour * 60 + minute) / 1440;
}

function displayMinutes(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded : rounded.toFixed(2);
}

function inputTime(value: ExtractedValue) {
  const fraction = timeFraction(value);
  if (fraction === null) return value;
  const minutes = Math.round(fraction * 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function applyVerticalFourFormulas(data: Record<string, ExtractedValue>) {
  const next = { ...data };
  const cortexIn = timeFraction(next.cortex_app_in);
  const cortexOut = timeFraction(next.cortex_app_out);
  const adpIn = timeFraction(next.adp_clock_in);
  const adpOut = timeFraction(next.adp_clock_out);
  const signIn = cortexIn === null || adpIn === null ? null : (cortexIn - adpIn) * 1440;
  const signOut = cortexOut === null || adpOut === null ? null : (cortexOut - adpOut) * 1440;

  next.sign_in_difference = signIn === null ? "missing" : displayMinutes(signIn);
  next.sign_out_difference = signOut === null ? "missing" : displayMinutes(signOut);
  next.missed_punch_in = adpIn === null ? "Yes" : "No";
  next.missed_punch_out = adpOut === null ? "Yes" : "No";

  // Workbook rule: combined absolute sign-in and sign-out variance above
  // 15 minutes is Low, above 30 is Moderate, and above 45 is High.
  if (signIn === null || signOut === null || adpIn === null || adpOut === null) {
    next.possible_time_theft = "missing";
  } else if (Math.abs(signIn) + Math.abs(signOut) > 45) {
    next.possible_time_theft = "High";
  } else if (Math.abs(signIn) + Math.abs(signOut) > 30) {
    next.possible_time_theft = "Moderate";
  } else if (Math.abs(signIn) + Math.abs(signOut) > 15) {
    next.possible_time_theft = "Low";
  } else {
    next.possible_time_theft = "No";
  }
  return next;
}

export function normalizeWorkspaceRow(row: WorkspaceRow, verticalId: string) {
  const normalizedData = { ...row.data };
  (gridColumns[verticalId] ?? []).forEach((column) => {
    if (column.kind === "date" && normalizedData[column.key]) {
      normalizedData[column.key] = normalizePastedDate(normalizedData[column.key]) || normalizedData[column.key];
    }
    if (column.kind === "time" && normalizedData[column.key]) {
      normalizedData[column.key] = inputTime(normalizedData[column.key]);
    }
  });
  const data = verticalId.endsWith("0104") ? applyVerticalFourFormulas(normalizedData) : normalizedData;
  const personName = text(data.candidate_name ?? data.driver_name ?? row.personName);
  return { ...row, personName, data };
}

export function parsePastedRows(raw: string, verticalId: string): WorkspaceRow[] {
  const columns = gridColumns[verticalId] ?? [];
  const matrix = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((row) => row.some((cell) => cell.trim()));
  if (!matrix.length) return [];

  const headerMatches = matrix[0].filter((cell) =>
    columns.some((column) => column.label.toLowerCase() === cell.trim().toLowerCase()),
  ).length;
  const body = headerMatches >= 2 ? matrix.slice(1) : matrix;
  return body.map((cells) => {
    const data: Record<string, ExtractedValue> = {};
    const includesFormulaSlots = cells.length >= columns.length;
    let editableIndex = 0;
    columns.forEach((column, index) => {
      if (column.kind === "formula") return;
      const sourceIndex = includesFormulaSlots ? index : editableIndex;
      editableIndex += 1;
      let value = cells[sourceIndex]?.trim() ?? "";
      if (column.kind === "date") value = normalizePastedDate(value);
      data[column.key] = value || null;
    });
    return normalizeWorkspaceRow({ id: newId(), personName: "", data }, verticalId);
  });
}

export function toExtractedRows(rows: WorkspaceRow[], verticalId: string): ExtractedReportRow[] {
  return rows
    .map((row) => normalizeWorkspaceRow(row, verticalId))
    .filter((row) => row.personName || hasValue(row.data.email) || hasValue(row.data.phone_number))
    .map((row, index) => ({
      sheetName: "VINE Pulse in-app workspace",
      sourceRow: index + 2,
      personName: row.personName || text(row.data.email ?? row.data.phone_number) || "Unnamed record",
      data: row.data,
    }));
}

export function workspaceRowsFromSaved(rows: Array<{ id: string; person_name: string | null; data: Record<string, ExtractedValue> }>, verticalId: string) {
  return rows.map((row) => normalizeWorkspaceRow({
    id: row.id,
    personName: row.person_name ?? "",
    data: row.data,
  }, verticalId));
}

export function generatedGroups(verticalId: string, rows: WorkspaceRow[]): GeneratedGroup[] {
  const group = (title: string, tone: GeneratedGroup["tone"], predicate: (row: WorkspaceRow) => boolean, detailKey?: string): GeneratedGroup => ({
    title,
    tone,
    rows: rows.filter(predicate),
    detailKey,
  });

  if (verticalId.endsWith("0101")) {
    return [
      group("Scheduled for interview", "neutral", (row) => hasValue(row.data.scheduled_interview), "scheduled_interview"),
      group("Confirmed interviews", "success", (row) => matches(row.data.interview_confirmed, "yes"), "scheduled_interview"),
      group("Passed interview", "success", (row) => matches(row.data.interview_result, "pass"), "interview_result"),
      group("Failed interview", "danger", (row) => matches(row.data.interview_result, "fail"), "interview_result"),
    ];
  }
  if (verticalId.endsWith("0102")) {
    return [
      group("Orientation completed", "success", (row) => hasValue(row.data.orientation_completed), "orientation_completed"),
      group("ADP payroll set-up", "neutral", (row) => hasValue(row.data.adp_payroll_setup), "adp_payroll_setup"),
      group("ADP payroll completed", "success", (row) => hasValue(row.data.adp_payroll_completed), "adp_payroll_completed"),
      group("Active trainees", "success", (row) => matches(row.data.training_schedule, "active"), "training_schedule"),
      group("Scheduled for training", "neutral", (row) => hasValue(row.data.training_schedule) && !["active", "incomplete"].includes(normalized(row.data.training_schedule)), "training_schedule"),
      ...completeStatuses.map((status) =>
        group(status, status === "Completed" ? "success" : status === "Off-boarded" ? "danger" : "warning", (row) => matches(row.data.remarks, status), "remarks"),
      ),
    ];
  }
  if (verticalId.endsWith("0103")) {
    return [
      group("Present on Day 1", "success", (row) => matches(row.data.day_1_attendance, "present"), "day_1_attendance"),
      group("Present on Day 2", "success", (row) => matches(row.data.day_2_attendance, "present"), "day_2_attendance"),
      group("Training passed", "success", (row) => matches(row.data.training_status, "pass"), "training_status"),
      group("Training failed", "danger", (row) => matches(row.data.training_status, "fail"), "training_status"),
      group("Training reschedule", "warning", (row) => matches(row.data.training_status, "reschedule"), "training_status"),
      group("Schedule plotted", "neutral", (row) => hasValue(row.data.work_schedule_plotted), "work_schedule_plotted"),
    ];
  }
  return [
    group("Missed punch in", "danger", (row) => matches(row.data.missed_punch_in, "yes"), "missed_punch_in_status"),
    group("Missed punch out", "danger", (row) => matches(row.data.missed_punch_out, "yes"), "missed_punch_out_status"),
    group("High time-theft risk", "danger", (row) => matches(row.data.possible_time_theft, "high"), "possible_time_theft"),
    group("Moderate time-theft risk", "warning", (row) => matches(row.data.possible_time_theft, "moderate"), "possible_time_theft"),
    group("Low time-theft risk", "warning", (row) => matches(row.data.possible_time_theft, "low"), "possible_time_theft"),
    group("Sent to dispatch", "neutral", (row) => matches(row.data.sent_to_dispatch, "yes") || matches(row.data.sent_to_dispatch, "fixed by driver"), "sent_to_dispatch"),
  ];
}
