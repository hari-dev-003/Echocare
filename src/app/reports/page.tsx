"use client";
import AppLayout from "@/components/AppLayout";
import { useMemo, useState } from "react";
import { Upload, FileText, Eye, Trash2, Plus, AlertCircle, Sparkles, Loader2, CheckCircle } from "lucide-react";
import { getStoredToken } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/backend";

const REPORTS_KEY = "echocare-diagnostic-reports";

type ReportStatus = "uploaded" | "analyzed" | "error";

type UserReport = {
  id: string;
  backendId?: string;
  name: string;
  date: string;
  type: string;
  size: string;
  status: ReportStatus;
  summary: string;
  extractedText?: string;
  doctor: string;
  specialty: string;
  reportType: string;
  reportDate: string;
  cloudinaryUrl?: string;
  error?: string;
};

function readReports(): UserReport[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(REPORTS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as UserReport[];
  } catch {
    return [];
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeExtractedText(text?: string) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "PDF uploaded. Text extraction did not return readable content yet.";
  return clean.length > 260 ? `${clean.slice(0, 260)}...` : clean;
}

export default function ReportsPage() {
  const [dragging, setDragging] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [reports, setReports] = useState<UserReport[]>(() => readReports());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [reportMeta, setReportMeta] = useState({
    doctor: "",
    specialty: "",
    reportType: "Lab report",
    reportDate: new Date().toISOString().slice(0, 10),
  });

  const selected = selectedReport !== null ? reports[selectedReport] : null;
  const importantValues = useMemo(() => {
    const text = selected?.extractedText ?? "";
    const markers = ["Hemoglobin", "Ferritin", "Vitamin D", "TSH", "CRP", "ESR", "B12", "Glucose"];
    return markers
      .map(marker => {
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = text.match(new RegExp(`(${escaped})\\s*[:\\-]?\\s*([<>]?[0-9.]+\\s*[a-zA-Z/%µμ.\\-/]*)`, "i"));
        return match ? { name: marker, value: match[2].trim() } : null;
      })
      .filter(Boolean) as { name: string; value: string }[];
  }, [selected]);

  const persistReports = (nextReports: UserReport[]) => {
    setReports(nextReports);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REPORTS_KEY, JSON.stringify(nextReports));
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      setUploadError("Please attach PDF reports only for AI extraction.");
      return;
    }

    setUploading(true);
    setUploadError("");
    const token = getStoredToken();
    const nextReports = [...reports];

    for (const file of pdfs) {
      const localId = `${Date.now()}-${file.name}`;
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("doctor", reportMeta.doctor);
        body.append("specialty", reportMeta.specialty);
        body.append("report_type", reportMeta.reportType);
        body.append("report_date", reportMeta.reportDate);

        const response = await fetch(`${BACKEND_URL}/api/story/upload-report`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || "Report upload failed.");
        }

        const uploaded = await response.json();
        nextReports.unshift({
          id: localId,
          backendId: uploaded.id,
          name: uploaded.filename || file.name,
          date: reportMeta.reportDate || new Date().toISOString().slice(0, 10),
          type: reportMeta.reportType,
          size: formatSize(file.size),
          status: uploaded.extracted_text ? "analyzed" : "uploaded",
          summary: summarizeExtractedText(uploaded.extracted_text),
          extractedText: uploaded.extracted_text,
          doctor: reportMeta.doctor,
          specialty: reportMeta.specialty,
          reportType: reportMeta.reportType,
          reportDate: reportMeta.reportDate,
          cloudinaryUrl: uploaded.cloudinary_url || uploaded.secure_url,
        });
      } catch (error) {
        nextReports.unshift({
          id: localId,
          name: file.name,
          date: reportMeta.reportDate || new Date().toISOString().slice(0, 10),
          type: reportMeta.reportType,
          size: formatSize(file.size),
          status: "error",
          summary: "Upload did not complete. Check backend, authentication, and Cloudinary configuration.",
          doctor: reportMeta.doctor,
          specialty: reportMeta.specialty,
          reportType: reportMeta.reportType,
          reportDate: reportMeta.reportDate,
          error: error instanceof Error ? error.message : "Upload failed",
        });
        setUploadError(error instanceof Error ? error.message : "Upload failed");
      }
    }

    persistReports(nextReports);
    setUploading(false);
  };

  const removeReport = (index: number) => {
    const next = reports.filter((_, i) => i !== index);
    persistReports(next);
    setSelectedReport(null);
  };

  return (
    <AppLayout title="Medical Reports" subtitle="Upload and manage your medical reports">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main */}
        <div className="lg:col-span-2" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="card" style={{ padding: "20px" }}>
            <div className="section-title" style={{ marginBottom: "14px" }}>Report Source Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
              <div className="form-group">
                <label className="form-label">Doctor / Hospital</label>
                <input className="form-input" value={reportMeta.doctor} onChange={e => setReportMeta({ ...reportMeta, doctor: e.target.value })} placeholder="e.g. Dr. Mehta" />
              </div>
              <div className="form-group">
                <label className="form-label">Specialty</label>
                <input className="form-input" value={reportMeta.specialty} onChange={e => setReportMeta({ ...reportMeta, specialty: e.target.value })} placeholder="e.g. Endocrinology" />
              </div>
              <div className="form-group">
                <label className="form-label">Report Type</label>
                <select className="form-input" value={reportMeta.reportType} onChange={e => setReportMeta({ ...reportMeta, reportType: e.target.value })}>
                  <option>Lab report</option>
                  <option>Scan / Imaging</option>
                  <option>Prescription</option>
                  <option>Discharge summary</option>
                  <option>Specialist opinion</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Report Date</label>
                <input type="date" className="form-input" value={reportMeta.reportDate} onChange={e => setReportMeta({ ...reportMeta, reportDate: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Upload zone */}
          <div
            className={`upload-zone ${dragging ? "drag-over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input id="file-input" type="file" multiple accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => e.target.files && uploadFiles(e.target.files)} />
            <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: "rgba(15,118,110,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              {uploading ? <Loader2 size={28} color="#0F766E" className="animate-spin" /> : <Upload size={28} color="#0F766E" />}
            </div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>{uploading ? "Uploading and extracting PDF text..." : "Upload New PDF Report"}</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              Attach reports from different doctors. EchoCare sends each PDF to the backend for text extraction and stores the result for Patient Story, Health Insights, and Diagnostic Guard.
            </p>
            <button className="btn btn-primary btn-sm" disabled={uploading} onClick={e => { e.stopPropagation(); document.getElementById("file-input")?.click(); }}>
              <Plus size={14} /> Choose PDF Files
            </button>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "12px" }}>
              Supports multiple PDF files, up to 10 MB each.
            </p>
            {uploadError && (
              <div className="alert alert-warning" style={{ marginTop: "14px", fontSize: "12px", display: "inline-flex" }}>
                <AlertCircle size={14} /> {uploadError}
              </div>
            )}
          </div>

          {/* Report list */}
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div className="section-title">Your Medical Reports</div>
              <div className="badge badge-muted">{reports.length} reports</div>
            </div>

            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 90px 90px 90px", gap: "12px", padding: "8px 12px", marginBottom: "8px" }}>
              {["Report", "Date", "Type", "Status", "Actions"].map(h => (
                <div key={h} style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</div>
              ))}
            </div>

            {reports.length === 0 ? (
              <div style={{ padding: "34px 12px", textAlign: "center", border: "1.5px dashed var(--border)", borderRadius: "14px" }}>
                <FileText size={34} color="var(--text-muted)" style={{ marginBottom: "10px" }} />
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>No reports uploaded yet</div>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Upload PDFs above to begin AI extraction and diagnostic comparison.</p>
              </div>
            ) : reports.map((r, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 100px 90px 90px 90px",
                gap: "12px", padding: "14px 12px", borderRadius: "12px",
                background: selectedReport === i ? "rgba(15,118,110,0.04)" : "transparent",
                border: `1px solid ${selectedReport === i ? "rgba(15,118,110,0.2)" : "transparent"}`,
                cursor: "pointer", transition: "all 0.2s", marginBottom: "4px"
              }}
                onClick={() => setSelectedReport(selectedReport === i ? null : i)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileText size={16} color="#3B82F6" />
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{r.size}</div>
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", alignSelf: "center" }}>{r.date}</div>
                <div style={{ alignSelf: "center" }}><div className="badge badge-accent" style={{ fontSize: "10px" }}>{r.type}</div></div>
                <div style={{ alignSelf: "center" }}><div className={`badge badge-${r.status === "analyzed" ? "success" : r.status === "error" ? "danger" : "primary"}`} style={{ fontSize: "10px" }}>{r.status === "analyzed" ? "Analyzed" : r.status === "error" ? "Error" : "Uploaded"}</div></div>
                <div style={{ display: "flex", gap: "6px", alignSelf: "center" }}>
                  <button className="btn btn-ghost btn-sm" style={{ padding: "6px" }} title="View"><Eye size={13} /></button>
                  {/* Download is hidden until report storage ships (Task 27) — there is no file to fetch yet. */}
                  <button className="btn btn-ghost btn-sm" style={{ padding: "6px", color: "#EF4444" }} title="Delete" onClick={e => { e.stopPropagation(); removeReport(i); }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="card" style={{ padding: "24px" }}>
            <div className="section-title" style={{ marginBottom: "18px" }}>Report Timeline</div>
            {reports.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Timeline will appear after reports are uploaded.</p>
            ) : reports.map((r, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-dot" style={{ width: "28px", height: "28px", background: r.type === "Lab report" ? "#0F766E" : r.type === "Scan / Imaging" ? "#3B82F6" : "#8B5CF6" }}>
                  <FileText size={12} color="white" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>{r.date}</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
                  <div className={`badge badge-${r.type === "Lab report" ? "primary" : "accent"}`} style={{ fontSize: "10px", marginTop: "4px" }}>{r.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar - AI Summary */}
        <div className="lg:col-span-1" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <button
            className="btn btn-primary"
            disabled
            title="Coming soon"
            style={{ width: "100%", gap: "8px", opacity: 0.5, cursor: "not-allowed" }}
          >
            <Sparkles size={14} /> Generate Doctor PDF Report (Coming Soon)
          </button>

          <div className="ai-card">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Sparkles size={16} color="#0F766E" />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>AI Report Summary</span>
              {selected && <div className="badge badge-success" style={{ marginLeft: "auto", fontSize: "10px" }}>Active</div>}
            </div>
            {selected ? (
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>{selected.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                  <div className="badge badge-muted" style={{ justifyContent: "center" }}>{selected.doctor || "Doctor not added"}</div>
                  <div className="badge badge-muted" style={{ justifyContent: "center" }}>{selected.specialty || "Specialty not added"}</div>
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "16px" }}>{selected.summary}</div>
                <div style={{ background: "rgba(15,118,110,0.06)", borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#0F766E", marginBottom: "6px" }}>Extraction Status</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {selected.status === "analyzed" ? "Readable PDF text was extracted and is now available for patient understanding, report generation, and Diagnostic Guard comparisons." : selected.error || "Uploaded, waiting for backend extraction output."}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <FileText size={32} color="var(--text-muted)" style={{ marginBottom: "12px" }} />
                <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Select a report to see the AI summary</p>
              </div>
            )}
          </div>

          {/* Important Values */}
          <div className="card" style={{ padding: "20px" }}>
            <div className="section-title" style={{ marginBottom: "14px" }}>Extracted Values</div>
            {!selected ? (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>Select an analyzed report to view detected lab markers.</p>
            ) : importantValues.length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>No common lab values were detected automatically. The full extracted text is still saved for AI analysis.</p>
            ) : importantValues.map((v, i) => (
              <div key={v.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < importantValues.length - 1 ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{v.name}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F766E" }}>{v.value}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600 }}>Extracted</div>
                </div>
              </div>
            ))}
          </div>

          <div className="alert alert-warning" style={{ fontSize: "12px" }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            Store Cloudinary credentials only in server environment variables. Do not expose the API secret in browser code.
          </div>

          <div className="alert alert-success" style={{ fontSize: "12px" }}>
            <CheckCircle size={14} style={{ flexShrink: 0 }} />
            Uploaded report text is shared with Patient Story, Health Insights, and Diagnostic Guard through the user report cache.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
