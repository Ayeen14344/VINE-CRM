"use client";

import { useEffect, useMemo, useState } from "react";
import { createReportMetrics, type ExtractedValue } from "../lib/report-extraction";
import { supabase, type PortalProfile } from "../lib/supabase-browser";
import {
  emptyWorkspaceRow,
  generatedGroups,
  gridColumns,
  normalizePastedDate,
  normalizeWorkspaceRow,
  parsePastedRows,
  toExtractedRows,
  workspaceRowsFromSaved,
  type WorkspaceRow,
} from "../lib/vertical-workspace";

type ClientOption = { id: string; company_name: string; primary_email: string };
type SavedRow = {
  id: string;
  person_name: string | null;
  data: Record<string, ExtractedValue>;
};

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function valueText(value: ExtractedValue) {
  return value === null || value === undefined ? "" : String(value);
}

function formulaTone(value: ExtractedValue) {
  const normalized = valueText(value).toLowerCase();
  if (["high", "yes", "fail", "failed", "missing"].some((item) => normalized.includes(item))) return "danger";
  if (["moderate", "pending", "reschedule"].some((item) => normalized.includes(item))) return "warning";
  if (["no", "low", "pass", "completed"].some((item) => normalized.includes(item))) return "success";
  return "neutral";
}

export function GeneratedRecordLists({
  verticalId,
  rows,
  title = "Automatically generated views",
}: {
  verticalId: string;
  rows: WorkspaceRow[];
  title?: string;
}) {
  const groups = generatedGroups(verticalId, rows);
  return (
    <section className="generated-lists" aria-label={title}>
      <div className="generated-lists-head">
        <div>
          <p className="eyebrow">Live classifications</p>
          <h3>{title}</h3>
          <p>These lists are calculated from report entries and cannot be edited directly.</p>
        </div>
        <span className="pill">Auto-generated</span>
      </div>
      <div className="generated-list-grid">
        {groups.map((group) => (
          <article className={`generated-list-card generated-tone-${group.tone}`} key={group.title}>
            <header><strong>{group.title}</strong><span>{group.rows.length}</span></header>
            <div className="generated-list-people">
              {group.rows.slice(0, 50).map((row) => (
                <div key={`${group.title}:${row.id}`}>
                  <span className="mini-avatar">{initials(row.personName || "VP")}</span>
                  <span><strong>{row.personName || "Unnamed record"}</strong><small>{valueText(group.detailKey ? row.data[group.detailKey] : row.data.email) || "—"}</small></span>
                </div>
              ))}
              {!group.rows.length && <p className="generated-empty">No matching records.</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function EmployeeDataWorkspace({
  client,
  verticalId,
  profile,
  verticalName,
  onChangeDsp,
  onMessage,
  showChangeDsp = true,
}: {
  client: ClientOption;
  verticalId: string;
  profile: PortalProfile;
  verticalName: string;
  onChangeDsp: () => void;
  onMessage: (message: string) => void;
  showChangeDsp?: boolean;
}) {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<WorkspaceRow[]>([emptyWorkspaceRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [latestVersion, setLatestVersion] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const columns = gridColumns[verticalId] ?? [];
  const calculatedFields = columns.filter((column) => column.kind === "formula").map((column) => column.label);
  const allRowsSelected = rows.length > 0 && rows.every((row) => selectedRows.has(row.id));

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, version, report_rows(id, person_name, data)")
        .eq("client_id", client.id)
        .eq("vertical_id", verticalId)
        .eq("report_date", reportDate)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) {
        onMessage(error.message);
        setRows([emptyWorkspaceRow()]);
        setLatestVersion(0);
      } else {
        const saved = (data?.report_rows ?? []) as SavedRow[];
        setRows(saved.length ? workspaceRowsFromSaved(saved, verticalId) : [emptyWorkspaceRow()]);
        setLatestVersion(Number(data?.version ?? 0));
      }
      setSelectedRows(new Set());
      setLoading(false);
    })();
    return () => { active = false; };
  }, [client.id, onMessage, reportDate, verticalId]);

  const realRows = useMemo(
    () => toExtractedRows(rows, verticalId),
    [rows, verticalId],
  );

  const updateCell = (rowId: string, key: string, value: string) => {
    setRows((current) => current.map((row) => {
      if (row.id !== rowId) return row;
      const updated = normalizeWorkspaceRow({
        ...row,
        data: { ...row.data, [key]: value || null },
      }, verticalId);
      return updated;
    }));
  };

  const pasteDateCell = (event: React.ClipboardEvent<HTMLInputElement>, rowId: string, key: string) => {
    const clipboardValue = event.clipboardData.getData("text").split(/\t|\r?\n/, 1)[0];
    const normalizedDate = normalizePastedDate(clipboardValue);
    if (!normalizedDate) {
      event.preventDefault();
      onMessage(`"${clipboardValue.trim()}" is not a recognized date. Paste an Excel date, MM/DD/YYYY, or YYYY-MM-DD.`);
      return;
    }
    event.preventDefault();
    updateCell(rowId, key, normalizedDate);
  };

  const addPastedRows = () => {
    const parsed = parsePastedRows(pasteText, verticalId);
    if (!parsed.length) {
      onMessage("No tab-separated report rows were found.");
      return;
    }
    setRows((current) => {
      const useful = current.filter((row) => row.personName || Object.values(row.data).some(Boolean));
      return [...useful, ...parsed];
    });
    setPasteText("");
    setPasteOpen(false);
    onMessage(`${parsed.length} row${parsed.length === 1 ? "" : "s"} pasted into the workspace.`);
  };

  const toggleRow = (rowId: string) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleAllRows = () => {
    setSelectedRows(allRowsSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const deleteSelectedRows = () => {
    const count = selectedRows.size;
    if (!count) return;
    setRows((current) => {
      const remaining = current.filter((row) => !selectedRows.has(row.id));
      return remaining.length ? remaining : [emptyWorkspaceRow()];
    });
    setSelectedRows(new Set());
    onMessage(`${count} selected row${count === 1 ? "" : "s"} removed. Save the update to publish this change to the client.`);
  };

  const saveUpdate = async () => {
    if (!supabase) return;
    if (!realRows.length && !latestVersion) {
      onMessage("Add at least one driver or candidate before saving.");
      return;
    }
    setSaving(true);
    const nextVersion = latestVersion + 1;
    const metrics = createReportMetrics(verticalId, realRows);
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert({
        client_id: client.id,
        vertical_id: verticalId,
        report_date: reportDate,
        version: nextVersion,
        source_filename: "VINE Pulse in-app workspace",
        source_file_path: null,
        content_type: "application/vnd.vine-pulse.workspace+json",
        file_size: null,
        created_by: profile.id,
        status: "published",
        extraction_status: "manual_entry",
        extraction_summary: {
          source: "in_app_workspace",
          rows: realRows.length,
          formula_fields: calculatedFields,
        },
        published_by: profile.id,
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (reportError || !report) {
      setSaving(false);
      onMessage(reportError?.message ?? "The update could not be created.");
      return;
    }

    const { error: rowsError } = realRows.length
      ? await supabase.from("report_rows").insert(realRows.map((row) => ({
          report_id: report.id,
          row_type: row.sheetName,
          person_name: row.personName,
          source_row: row.sourceRow,
          data: row.data,
        })))
      : { error: null };
    const { error: metricsError } = metrics.length
      ? await supabase.from("report_metrics").insert(metrics.map((item) => ({
          report_id: report.id,
          metric_key: item.key,
          metric_label: item.label,
          numeric_value: item.value,
        })))
      : { error: null };

    if (rowsError || metricsError) {
      await supabase.from("reports").delete().eq("id", report.id);
      setSaving(false);
      onMessage(rowsError?.message ?? metricsError?.message ?? "The report rows could not be saved.");
      return;
    }
    setLatestVersion(nextVersion);
    setSaving(false);
    onMessage(`${client.company_name} updated successfully. The client can now see version ${nextVersion}.`);
  };

  return (
    <>
      <div className="active-dsp-banner">
        <div><span className="client-avatar">{initials(client.company_name)}</span><div><span>Currently working on</span><strong>{client.company_name}</strong></div></div>
        {showChangeDsp && <button className="secondary-btn" onClick={onChangeDsp}>Change DSP</button>}
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">In-app report workspace · Due 5 PM ET</p>
          <h1>{client.company_name} · {verticalName}</h1>
          <p>Paste rows from another application, maintain driver information here, then save the update directly to the client dashboard.</p>
        </div>
        <span className="pill">Version {latestVersion || "new"}</span>
      </div>

      <section className="panel workspace-sheet">
        <div className="workspace-toolbar">
          <label>Report date<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
          <div className="workspace-toolbar-actions">
            <button className="secondary-btn" onClick={() => setRows((current) => [...current, emptyWorkspaceRow()])}>+ Add row</button>
            <button className="secondary-btn" onClick={() => setPasteOpen(true)}>Paste Excel rows</button>
            <button className="bulk-delete-btn" disabled={!selectedRows.size} onClick={deleteSelectedRows}>Delete selected{selectedRows.size ? ` (${selectedRows.size})` : ""}</button>
            <button className="primary-btn" disabled={saving || loading} onClick={saveUpdate}>{saving ? "Saving…" : "Save & update client"}</button>
          </div>
        </div>
        {calculatedFields.length > 0 && (
          <div className="formula-notice"><strong>Protected formula columns:</strong> {calculatedFields.join(", ")}. They recalculate automatically from the time entries.</div>
        )}
        <div className="sheet-scroll">
          <table className="workspace-grid">
            <thead><tr><th className="row-select"><input type="checkbox" checked={allRowsSelected} onChange={toggleAllRows} aria-label="Select all report rows" /></th><th className="row-number">#</th>{columns.map((column) => <th style={{ minWidth: column.width ?? 150 }} key={column.key}>{column.label}{column.kind === "formula" && <span className="formula-badge">fx</span>}</th>)}<th className="row-action">Action</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr className={selectedRows.has(row.id) ? "selected-row" : ""} key={row.id}>
                  <td className="row-select"><input type="checkbox" checked={selectedRows.has(row.id)} onChange={() => toggleRow(row.id)} aria-label={`Select row ${index + 1}`} /></td>
                  <th className="row-number">{index + 1}</th>
                  {columns.map((column) => {
                    const value = valueText(row.data[column.key]);
                    if (column.kind === "formula") {
                      return <td className={`formula-cell formula-${formulaTone(value)}`} key={column.key}><span>{value || "—"}</span></td>;
                    }
                    if (column.kind === "select") {
                      return <td key={column.key}><select value={value} onChange={(event) => updateCell(row.id, column.key, event.target.value)}><option value="">Select…</option>{column.options?.map((option) => <option key={option}>{option}</option>)}</select></td>;
                    }
                    return <td key={column.key}><input type={column.kind === "date" ? "date" : column.kind === "time" ? "time" : "text"} value={value} onPaste={column.kind === "date" ? (event) => pasteDateCell(event, row.id, column.key) : undefined} onChange={(event) => updateCell(row.id, column.key, event.target.value)} /></td>;
                  })}
                  <td className="row-action"><button aria-label={`Delete row ${index + 1}`} onClick={() => {
                    setRows((current) => current.length === 1 ? [emptyWorkspaceRow()] : current.filter((item) => item.id !== row.id));
                    setSelectedRows((current) => {
                      const next = new Set(current);
                      next.delete(row.id);
                      return next;
                    });
                  }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="sheet-loading">Loading the latest report for this date…</div>}
        <div className="workspace-foot"><span>{realRows.length} report record{realRows.length === 1 ? "" : "s"}</span><span>Saving creates a new audit-safe version; earlier versions remain in the 30-day history.</span></div>
      </section>

      <GeneratedRecordLists verticalId={verticalId} rows={rows.map((row) => normalizeWorkspaceRow(row, verticalId))} title={profile.role === "super_admin" ? "Super Admin report views" : "Employee report views"} />

      {pasteOpen && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="paste-title">
          <section className="preview-dialog paste-dialog">
            <div className="panel-head">
              <div><p className="eyebrow">Bulk entry</p><h2 id="paste-title">Paste rows into {verticalName}</h2><p>Copy cells from Excel, Google Sheets, or another table and paste them below. Keep the same column order shown in the workspace.</p></div>
              <button className="icon-btn" onClick={() => setPasteOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="paste-column-guide">{columns.filter((column) => column.kind !== "formula").map((column, index) => <span key={column.key}>{index + 1}. {column.label}</span>)}</div>
            <textarea autoFocus value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={"Name\tEmail\tPhone Number\t…"} />
            <div className="preview-dialog-actions"><button className="secondary-btn" onClick={() => setPasteOpen(false)}>Cancel</button><button className="primary-btn" onClick={addPastedRows}>Add pasted rows</button></div>
          </section>
        </div>
      )}
    </>
  );
}
