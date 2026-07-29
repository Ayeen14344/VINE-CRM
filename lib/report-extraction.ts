export type ExtractedValue = string | number | boolean | null;

export type ExtractedReportRow = {
  sheetName: string;
  sourceRow: number;
  personName: string;
  data: Record<string, ExtractedValue>;
};

export type ExtractedReportMetric = {
  key: string;
  label: string;
  value: number;
};

export type ExtractedReport = {
  rows: ExtractedReportRow[];
  metrics: ExtractedReportMetric[];
};

type Field = {
  key: string;
  label: string;
  aliases?: string[];
  occurrence?: number;
};
type SheetDefinition = { names: string[]; fields: Field[] };

const definitions: Record<string, SheetDefinition[]> = {
  "00000000-0000-4000-8000-000000000101": [
    {
      names: ["Sourcing and hiring"],
      fields: [
        { key: "candidate_name", label: "Name from indeed or smart recruiter" },
        { key: "email", label: "Email" },
        { key: "phone_number", label: "Phone Number" },
        { key: "activity_date", label: "Date" },
        { key: "interview_invite_sent", label: "Invite for Interview Sent" },
        { key: "scheduled_interview", label: "Scheduled Interview" },
        { key: "interview_confirmed", label: "Confirm Interview" },
        { key: "no_response", label: "No response" },
        { key: "rescheduled", label: "Rescheduled" },
        { key: "interview_result", label: "Interview Result" },
      ],
    },
    {
      names: ["Background check"],
      fields: [
        { key: "candidate_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone_number", label: "Phone Number" },
        { key: "background_check", label: "Background Check" },
        { key: "clinic_details_sent", label: "Clinic Details Sent" },
        { key: "drug_test", label: "Drug Test" },
        {
          key: "cortex_onboarded",
          label: "Cortex Onboarded",
          aliases: ["Onboarded in Cortex", "Added to Cortex"],
        },
      ],
    },
  ],
  "00000000-0000-4000-8000-000000000102": [
    {
      names: ["Orientation and ADP Set-up", "Orientation and ADP Setup"],
      fields: [
        { key: "candidate_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone_number", label: "Number" },
        { key: "orientation_docs_adp_status", label: "Orientation docs/ADP" },
        { key: "safety_standard_sent", label: "Safety Standard Sent" },
        { key: "safety_standard_completed", label: "Safety Standard Completed" },
        { key: "orientation_sent", label: "Orientation Sent" },
        { key: "orientation_completed", label: "Orientation Completed" },
        { key: "adp_payroll_setup", label: "ADP Payroll Set-up" },
        { key: "adp_payroll_completed", label: "ADP Payroll Completed" },
        { key: "training_schedule", label: "Training Schedule" },
        { key: "remarks", label: "Remarks" },
        { key: "note", label: "Note" },
      ],
    },
    {
      names: ["Orientation and ADP Set-up", "Orientation and ADP Setup"],
      fields: [
        { key: "candidate_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone_number", label: "Number" },
        { key: "docs_followup_sent", label: "Follow up message sent for Docs?" },
        { key: "orientation_sent", label: "Orientation Docs" },
        { key: "orientation_completed", label: "Completed", occurrence: 0 },
        { key: "adp_payroll_setup", label: "ADP Section 1 Sent" },
        { key: "adp_payroll_completed", label: "Completed", occurrence: 1 },
        { key: "book_for_training", label: "Book For Training" },
        { key: "training_schedule", label: "Scheduled Training" },
      ],
    },
  ],
  "00000000-0000-4000-8000-000000000103": [
    {
      names: ["Training, ORE, and Scheduling"],
      fields: [
        { key: "driver_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone_number", label: "Phone number" },
        { key: "reminder_sent", label: "Sent Reminders" },
        { key: "day_1_attendance", label: "Day 1 Attendance" },
        { key: "day_2_attendance", label: "Day 2 Attendance" },
        { key: "training_status", label: "Training Status" },
        { key: "ore_schedule", label: "Schedule for ORE (On the road evaluation)" },
        { key: "work_schedule_plotted", label: "Work Schedule Plotted" },
      ],
    },
  ],
  "00000000-0000-4000-8000-000000000104": [
    {
      names: ["Time and Attendance"],
      fields: [
        { key: "driver_name", label: "Name" },
        { key: "phone_number", label: "Phone number" },
        { key: "cortex_app_in", label: "Cortex App In" },
        { key: "cortex_app_out", label: "Cortex App Out" },
        { key: "adp_clock_in", label: "ADP Clock in" },
        { key: "adp_clock_out", label: "ADP Clock Out" },
        { key: "total_break_time_used", label: "Total Break Time Used" },
        { key: "sign_in_difference", label: "Sign in Difference" },
        { key: "sign_out_difference", label: "Sign Out Difference" },
        { key: "missed_punch_in", label: "Missed Punch In" },
        { key: "missed_punch_out", label: "Missed Punch Out" },
        { key: "missed_punch_in_followup", label: "Follow up for Missed punch In" },
        { key: "missed_punch_in_status", label: "Status" },
        { key: "missed_punch_out_followup", label: "Follow up for Missed punch Out" },
        { key: "missed_punch_out_status", label: "Status" },
        { key: "possible_time_theft", label: "Possible Time Theft" },
        { key: "sent_to_dispatch", label: "Sent To Dispatch" },
      ],
    },
  ],
};

function clean(value: unknown): ExtractedValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value).trim();
  return text || null;
}

function normalized(value: ExtractedValue) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizedHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasValue(value: ExtractedValue) {
  const text = normalized(value);
  return text !== "" && !["no", "false", "n/a", "na", "-", "0"].includes(text);
}

function isYes(value: ExtractedValue) {
  return ["yes", "y", "true", "1", "sent", "confirmed", "entered", "pass", "passed", "present", "plotted"].some((token) =>
    normalized(value).includes(token),
  );
}

function isPass(value: ExtractedValue) {
  return ["pass", "passed", "complete", "completed"].some((token) =>
    normalized(value).includes(token),
  );
}

function isFail(value: ExtractedValue) {
  return ["fail", "failed"].some((token) => normalized(value).includes(token));
}

function isReschedule(value: ExtractedValue) {
  return ["reschedule", "for rescheduling", "dns"].some((token) =>
    normalized(value).includes(token),
  );
}

function count(rows: ExtractedReportRow[], predicate: (row: ExtractedReportRow) => boolean) {
  return rows.filter(predicate).length;
}

function metric(key: string, label: string, value: number): ExtractedReportMetric {
  return { key, label, value };
}

export function createReportMetrics(verticalId: string, rows: ExtractedReportRow[]): ExtractedReportMetric[] {
  if (verticalId.endsWith("0101")) {
    const sourcingRows = rows.filter((row) => normalized(row.sheetName).includes("sourcing"));
    const backgroundRows = rows.filter((row) => normalized(row.sheetName).includes("background"));
    const sourcing = sourcingRows.length ? sourcingRows : rows;
    const background = backgroundRows.length ? backgroundRows : rows;
    return [
      metric("contacted_from_indeed", "Contacted from Indeed", sourcing.length),
      metric("reviewed_applicants", "Reviewed Applicants", count(sourcing, (row) => hasValue(row.data.interview_invite_sent) || hasValue(row.data.interview_result))),
      metric("moved_to_in_person_interview", "Moved to In-person Interview", count(sourcing, (row) => hasValue(row.data.scheduled_interview) || isYes(row.data.interview_confirmed))),
      metric("added_to_amazon_portal", "Added to Amazon Portal", count(background, (row) => hasValue(row.data.background_check))),
      metric("drug_test_ordered", "Drug Test Ordered", count(background, (row) => hasValue(row.data.clinic_details_sent) || hasValue(row.data.drug_test))),
      metric("interview_passed", "Interview Passed", count(sourcing, (row) => isPass(row.data.interview_result))),
      metric("interview_failed", "Interview Failed", count(sourcing, (row) => isFail(row.data.interview_result))),
      metric("cortex_onboarded", "Cortex Onboarded", count(background, (row) => isYes(row.data.cortex_onboarded))),
    ];
  }

  if (verticalId.endsWith("0102")) {
    return [
      metric("payroll_data_collection", "Moved to Payroll System Data Collection", count(rows, (row) => hasValue(row.data.orientation_sent) || hasValue(row.data.orientation_docs_adp_status))),
      metric("id_collection", "ID Collection (DL and I-9)", count(rows, (row) => hasValue(row.data.safety_standard_completed) || hasValue(row.data.orientation_completed))),
      metric("moved_to_offer_letter", "Moved to Offer Letter", count(rows, (row) => hasValue(row.data.adp_payroll_setup))),
      metric("ready_for_adp", "Ready for ADP", count(rows, (row) => hasValue(row.data.adp_payroll_completed))),
      metric("orientation_completed", "Orientation Completed", count(rows, (row) => hasValue(row.data.orientation_completed))),
      metric("adp_setup_completed", "ADP Setup Completed", count(rows, (row) => hasValue(row.data.adp_payroll_completed))),
    ];
  }

  if (verticalId.endsWith("0103")) {
    return [
      metric("scheduled_for_training", "Scheduled for Training", count(rows, (row) => hasValue(row.data.reminder_sent) || hasValue(row.data.day_1_attendance))),
      metric("training_passed", "Training Passed", count(rows, (row) => isPass(row.data.training_status))),
      metric("training_failed", "Training Failed", count(rows, (row) => isFail(row.data.training_status))),
      metric("for_reschedule", "For Reschedule", count(rows, (row) => isReschedule(row.data.training_status) || isReschedule(row.data.day_1_attendance) || isReschedule(row.data.day_2_attendance))),
      metric("work_deployment", "Scheduled for Work Deployment", count(rows, (row) => hasValue(row.data.work_schedule_plotted))),
    ];
  }

  const missedPunches = count(rows, (row) => isYes(row.data.missed_punch_in) || isYes(row.data.missed_punch_out));
  const missingLunch = count(rows, (row) => normalized(row.data.total_break_time_used) === "0" || normalized(row.data.total_break_time_used).includes("00:00"));
  const timeTheft = count(rows, (row) => hasValue(row.data.possible_time_theft));
  return [
    metric("missed_punches", "Missed Punches", missedPunches),
    metric("missing_lunch_break", "Missing Lunch Break", missingLunch),
    metric("daily_hours_violation", "Daily Working Hours Violation", 0),
    metric("rolling_7_days", "7 Rolling Days", 0),
    metric("attendance", "Attendance", 0),
    metric("time_theft", "Potential Time Theft", timeTheft),
  ];
}

function fieldColumn(field: Field, headerRow: unknown[]) {
  const aliases = [field.label, ...(field.aliases ?? [])].map(normalizedHeader);
  const matches = headerRow.reduce<number[]>((indexes, header, index) => {
    if (aliases.includes(normalizedHeader(header))) indexes.push(index);
    return indexes;
  }, []);
  return matches[field.occurrence ?? 0];
}

function definitionScore(definition: SheetDefinition, headerRow: unknown[]) {
  return definition.fields.reduce(
    (score, field) => score + (fieldColumn(field, headerRow) === undefined ? 0 : 1),
    0,
  );
}

function findSheetDefinition(verticalId: string, sheetName: string, index: number, headerRow: unknown[]) {
  const sheets = definitions[verticalId] ?? [];
  const candidates = sheets.filter((sheet) =>
    sheet.names.some((name) => normalized(name) === normalized(sheetName)),
  );
  if (!candidates.length) return sheets[index];
  return candidates.sort(
    (left, right) =>
      definitionScore(right, headerRow) - definitionScore(left, headerRow),
  )[0];
}

export async function extractReportFromFile(file: File, verticalId: string): Promise<ExtractedReport> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(extension ?? "")) {
    throw new Error("Automatic extraction currently requires an Excel or CSV file. PDF and image uploads cannot be published until AI document processing is connected.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const rows: ExtractedReportRow[] = [];

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
      dateNF: "m/d/yyyy h:mm AM/PM",
    });
    const headerRowIndex = matrix.slice(0, 5).reduce((bestIndex, row, index) => {
      const bestDefinition = findSheetDefinition(verticalId, sheetName, sheetIndex, matrix[bestIndex] ?? []);
      const candidateDefinition = findSheetDefinition(verticalId, sheetName, sheetIndex, row);
      return definitionScore(candidateDefinition, row) >
        definitionScore(bestDefinition, matrix[bestIndex] ?? [])
        ? index
        : bestIndex;
    }, 0);
    const headerRow = matrix[headerRowIndex] ?? [];
    const definition = findSheetDefinition(verticalId, sheetName, sheetIndex, headerRow);
    if (!definition) return;

    matrix.slice(headerRowIndex + 1).forEach((source, rowIndex) => {
      const data: Record<string, ExtractedValue> = {};
      definition.fields.forEach((field) => {
        const columnIndex = fieldColumn(field, headerRow);
        data[field.key] = clean(
          columnIndex === undefined ? null : source[columnIndex],
        );
      });
      const personName = String(data.candidate_name ?? data.driver_name ?? "").trim();
      const identityPresent = personName || data.email || data.phone_number;
      if (!identityPresent) return;
      rows.push({
        sheetName,
        sourceRow: rowIndex + headerRowIndex + 2,
        personName: personName || String(data.email ?? data.phone_number ?? "Unnamed record"),
        data,
      });
    });
  });

  if (!rows.length) {
    throw new Error("No report records were found. Keep the template header row and add data beneath it, then upload the file again.");
  }

  return { rows, metrics: createReportMetrics(verticalId, rows) };
}
