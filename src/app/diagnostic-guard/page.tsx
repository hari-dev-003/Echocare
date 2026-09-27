"use client";
import AppLayout from "@/components/AppLayout";
import { useState, useEffect, useMemo } from "react";
import { BACKEND_URL, BackendError, backendJSON, fetchFromBackend } from "@/lib/backend";
import { getStoredToken } from "@/lib/auth";
import { 
  ShieldAlert, 
  AlertCircle, 
  CheckCircle, 
  ChevronRight, 
  FileText, 
  Calendar, 
  User, 
  FileCheck, 
  Sparkles, 
  Printer, 
  Scale, 
  Info, 
  X, 
  Plus, 
  Search, 
  History, 
  UserCheck, 
  FileSpreadsheet, 
  Download,
  AlertTriangle,
  Users,
  Upload
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceDot
} from "recharts";

// Reference knowledge only (not patient data): commonly-discussed lab markers
// per panel, used to suggest what a report may be missing.
const labMarkerCatalog = [
  { name: "Hemoglobin", reason: "Core CBC anemia screen found in most basic blood reports.", id: "hemoglobin", aliases: ["hemoglobin", "haemoglobin", "hgb", "hb"], panels: ["blood"] },
  { name: "Red Cell Indices", reason: "MCV, MCH, and MCHC help classify hidden anemia patterns.", id: "rbc-indices", aliases: ["mcv", "mch", "mchc", "red cell", "rbc"], panels: ["blood"] },
  { name: "White Blood Cells", reason: "Screens broad immune cell count changes.", id: "wbc", aliases: ["wbc", "white blood", "leukocyte", "leucocyte"], panels: ["blood", "inflammation"] },
  { name: "Serum Ferritin", reason: "Measures stored iron. Ferritin depletion can cause fatigue and aches even when hemoglobin is normal.", id: "ferritin", aliases: ["ferritin", "serum ferritin"], panels: ["blood", "nutrient"] },
  { name: "Total Iron Binding Capacity (TIBC)", reason: "Clarifies iron transport and subclinical deficiency patterns.", id: "tibc", aliases: ["tibc", "total iron binding", "transferrin"], panels: ["blood", "nutrient"] },
  { name: "Vitamin B12", reason: "Essential for nerve function, cognition, and fatigue review.", id: "b12", aliases: ["b12", "vitamin b12", "cobalamin"], panels: ["blood", "nutrient"] },
  { name: "Folate", reason: "Complements B12 review for anemia and neurologic symptoms.", id: "folate", aliases: ["folate", "folic acid"], panels: ["blood", "nutrient"] },
  { name: "Vitamin D3", reason: "Often relevant for musculoskeletal pain, fatigue, and immune regulation.", id: "vitd", aliases: ["vitamin d", "vit d", "25-oh", "25 oh", "cholecalciferol"], panels: ["nutrient"] },
  { name: "TSH", reason: "Pituitary thyroid screen. Useful, but not complete by itself.", id: "tsh", aliases: ["tsh", "thyroid stimulating"], panels: ["thyroid"] },
  { name: "Free T3", reason: "Checks active thyroid hormone availability.", id: "ft3", aliases: ["free t3", "ft3", "triiodothyronine"], panels: ["thyroid"] },
  { name: "Free T4", reason: "Measures circulating thyroid gland output.", id: "ft4", aliases: ["free t4", "ft4", "thyroxine"], panels: ["thyroid"] },
  { name: "TPO Antibodies", reason: "Screens autoimmune thyroiditis, which can precede abnormal TSH.", id: "tpo", aliases: ["tpo", "tpoab", "thyroid peroxidase"], panels: ["thyroid"] },
  { name: "Thyroglobulin Antibodies", reason: "Secondary autoimmune thyroiditis marker.", id: "tgab", aliases: ["tgab", "thyroglobulin antibody", "thyroglobulin antibodies"], panels: ["thyroid"] },
  { name: "CRP", reason: "Systemic inflammation marker useful when symptoms persist despite normal basic screens.", id: "crp", aliases: ["crp", "c-reactive", "c reactive"], panels: ["inflammation"] },
  { name: "ESR", reason: "Inflammation trend marker often paired with CRP.", id: "esr", aliases: ["esr", "erythrocyte sedimentation"], panels: ["inflammation"] },
  { name: "ANA", reason: "Broad autoimmune screening marker when joint pain, fatigue, or rashes persist.", id: "ana", aliases: ["ana", "antinuclear"], panels: ["inflammation", "autoimmune"] },
  { name: "Rheumatoid Factor", reason: "Helps screen inflammatory joint conditions.", id: "rf", aliases: ["rheumatoid factor", " rf "], panels: ["inflammation", "autoimmune"] },
  { name: "Anti-CCP", reason: "More specific autoimmune arthritis marker than broad inflammation alone.", id: "anti-ccp", aliases: ["anti-ccp", "anti ccp", "ccp antibody"], panels: ["inflammation", "autoimmune"] },
  { name: "HbA1c", reason: "Shows longer-term glucose pattern beyond a single glucose reading.", id: "hba1c", aliases: ["hba1c", "hba1 c", "glycated"], panels: ["metabolic"] },
  { name: "Fasting Glucose", reason: "Basic metabolic screen for fatigue and energy fluctuations.", id: "glucose", aliases: ["glucose", "fasting sugar", "blood sugar", "fbs"], panels: ["metabolic"] },
] as const;

const subjectiveTranslators = [
  {
    subjective: "Brain Fog",
    clinical: "Executive Cognitive Dysfunction & Derealization",
    code: "ICD-10 R41.841",
    scale: "FACIT-Fatigue Scale / SF-36 Cognitive Subscale",
    desc: "Persistent deficit in working memory, executive planning, and cognitive processing speed. Often linked to reduced cerebral blood flow or subclinical neuroinflammation.",
    examples: ["feel like head is in a bubble", "can't find words", "detached from surroundings"]
  },
  {
    subjective: "Dizzy Standing Up",
    clinical: "Orthostatic Intolerance & Postural Tachycardia",
    code: "ICD-10 I49.8",
    scale: "COMPASS-31 Autonomic Score / Orthostatic Stand Test",
    desc: "Autonomic instability characterized by inadequate cardiovascular compensation when transitioning to an upright posture, leading to cerebral hypoperfusion.",
    examples: ["lightheaded when standing", "heart races standing up", "black out briefly standing"]
  },
  {
    subjective: "Heavy Limbs",
    clinical: "Proximal Motor Lethargy & Exertional Myasthenia",
    code: "ICD-10 G70.9",
    scale: "Hand Grip Dynamometer / Muscle Severity Index",
    desc: "Subjective sensation of extreme muscular resistance and torque fatigue, typically without clinical atrophy, indicating metabolic or neuro-immunological fatigue.",
    examples: ["legs feel like lead", "arms heavy as stone", "exhausted brushing my hair"]
  },
  {
    subjective: "Aches All Over",
    clinical: "Symmetric Connective Tissue Arthralgia & Myalgia",
    code: "ICD-10 M79.1",
    scale: "Fibromyalgia Impact Questionnaire (FIQR)",
    desc: "Widespread pain affecting both sides of the body, above and below the waist, reflecting possible central pain sensitization or early connective tissue dysfunction.",
    examples: ["joints ache constantly", "widespread muscle throbbing", "body feels bruised"]
  }
];

type SurveyContext = Record<string, string | string[] | number | undefined>;

type StoryAnalysisContext = Partial<{
  detectedSymptoms: string[];
  painPoints: string[];
  lifestylePatterns: string[];
  patternSummary: string;
  confidenceScore: number;
  recommendedActions: string[];
  sourceTimeline: Array<{ week?: string; event?: string; fatigue?: number; jointPain?: number; brainFog?: number; dizziness?: number }>;
  clinicalGaps: Array<{ week?: string; name?: string; date?: string; severity?: string; discrepancy?: string; advice?: string; coverage?: number }>;
}>;

type TrackerLog = {
  date?: string;
  fatigue?: number;
  joint_pain?: number;
  brain_fog?: number;
  dizziness?: number;
  notes?: string;
};

type DiagnosticReport = {
  id: string;
  backendId?: string;
  name: string;
  doctor: string;
  specialty: string;
  reportType: string;
  reportDate: string;
  status: "pending-cloudinary" | "uploaded" | "analyzed" | "error";
  cloudinaryUrl?: string;
  extractedText?: string;
  summary?: string;
  error?: string;
};

type ReportDoc = {
  _id: string;
  filename: string;
  doctor?: string;
  specialty?: string;
  report_type?: string;
  report_date?: string;
  extracted_text?: string;
  extraction_status?: string;
};

type DoctorOpinion = { id: string; doctor: string; specialty: string; date: string; opinion_text: string; created_at: string };

type Contradiction = { a_id: string; b_id: string; contradicts: boolean; summary: string; checked_at: string };

type Gap = { theme: string; weeks_present: number; first_seen: string; last_seen: string; addressed_by: string[] };

type GuardState = {
  doctor_opinions: DoctorOpinion[];
  requested_markers: string[];
  escalated: boolean;
  escalated_at: string | null;
  contradictions: Contradiction[];
};

type BriefInsight = { theme: string; title: string; observation: string; confidence: number; low_confidence: boolean };

type BriefData = {
  case_ref: string;
  generated_at: string;
  escalated: boolean;
  gaps: Gap[];
  contradictions: Contradiction[];
  requested_markers: string[];
  doctor_opinions: DoctorOpinion[];
  top_insights: BriefInsight[];
  tracker_averages: { days_logged: number; energy: number | null; pain: number | null; stress: number | null; sleep_hours: number | null; water_glasses: number | null };
};

type SymptomSlot = { key: string; label: string; color: string; bg: string };
type TimelinePoint = { week: string; event?: string; eventId?: string; [key: string]: string | number | undefined };
type MismatchAudit = { name: string; date: string; coverage: number; severity: string; discrepancy: string; advice: string };
type MissingMarker = { name: string; reason: string; id: string };
type LabAudit = {
  name: string;
  verdict: string;
  completeness: number;
  tested: string[];
  missing: MissingMarker[];
  reportName: string;
  reportStatus: DiagnosticReport["status"];
};

const symptomColors = [
  { color: "#0F766E", bg: "rgba(15,118,110,0.06)" },
  { color: "#3B82F6", bg: "rgba(59,130,246,0.06)" },
  { color: "#8B5CF6", bg: "rgba(139,92,246,0.06)" },
  { color: "#F59E0B", bg: "rgba(245,158,11,0.06)" }
];

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

function uniqueCompact(values: Array<string | undefined | null>, limit = 8) {
  const seen = new Set<string>();
  return values
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function sentenceFrom(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function summarizeExtractedText(text?: string) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "PDF uploaded. Text extraction did not return readable content yet.";
  return clean.length > 260 ? `${clean.slice(0, 260)}...` : clean;
}

function buildSymptomSlots(survey: SurveyContext, story: StoryAnalysisContext): SymptomSlot[] {
  const surveySymptoms = Array.isArray(survey.symptoms) ? survey.symptoms.map(String) : [];
  const detected = Array.isArray(story.detectedSymptoms) ? story.detectedSymptoms : [];
  const labels = uniqueCompact([...detected, ...surveySymptoms, typeof survey.mainConcern === "string" ? survey.mainConcern : undefined], 4);
  return labels.slice(0, 4).map((label, index) => ({
    key: `symptom${index + 1}`,
    label,
    color: symptomColors[index].color,
    bg: symptomColors[index].bg
  }));
}

function normalizeReportDate(date?: string) {
  if (!date) return new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function buildTimeline(
  symptomSlots: SymptomSlot[],
  trackerLogs: TrackerLog[],
  story: StoryAnalysisContext,
  reports: DiagnosticReport[]
): TimelinePoint[] {
  if (symptomSlots.length === 0) return [];

  const logs = trackerLogs.slice(0, 8).reverse();
  if (logs.length >= 2) {
    return logs.map((log, index) => {
      const point: TimelinePoint = { week: log.date ? log.date.slice(5) : `Log ${index + 1}` };
      symptomSlots.forEach((slot, slotIndex) => {
        const lower = slot.label.toLowerCase();
        const value =
          lower.includes("joint") || lower.includes("pain") ? log.joint_pain :
          lower.includes("brain") || lower.includes("fog") || lower.includes("concentr") ? log.brain_fog :
          lower.includes("dizz") ? log.dizziness :
          log.fatigue;
        point[slot.key] = Math.max(1, Math.min(10, Number(value) || 4 + slotIndex));
      });
      return point;
    });
  }

  const sourceTimeline = Array.isArray(story.sourceTimeline) ? story.sourceTimeline : [];
  if (sourceTimeline.length >= 3) {
    return sourceTimeline.slice(-8).map((source, index) => {
      const point: TimelinePoint = { week: source.week || `Point ${index + 1}`, event: source.event };
      symptomSlots.forEach((slot, slotIndex) => {
        const lower = slot.label.toLowerCase();
        const value =
          lower.includes("joint") || lower.includes("pain") ? source.jointPain :
          lower.includes("brain") || lower.includes("fog") || lower.includes("concentr") ? source.brainFog :
          lower.includes("dizz") ? source.dizziness :
          source.fatigue;
        point[slot.key] = Math.max(1, Math.min(10, Number(value) || 4 + index + slotIndex * 0.5));
      });
      return point;
    });
  }

  const hasStoryOrReports = reports.length > 0 || (Array.isArray(story.painPoints) && story.painPoints.length > 0) || story.patternSummary;
  if (!hasStoryOrReports) return [];

  const painPointCount = Array.isArray(story.painPoints) ? story.painPoints.length : 0;
  const base = painPointCount > 2 ? 5 : 3;
  const points = Array.from({ length: 8 }, (_, index) => {
    const point: TimelinePoint = { week: `Wk ${index + 1}` };
    symptomSlots.forEach((slot, slotIndex) => {
      point[slot.key] = Math.min(10, base + index * 0.45 + slotIndex * 0.55);
    });
    return point;
  });

  reports.slice(0, 3).forEach((report, index) => {
    const target = Math.min(points.length - 1, 1 + index * 2);
    points[target].event = report.reportType || report.name;
    points[target].eventId = report.id;
  });

  return points;
}

function buildMismatchAudits(
  timeline: TimelinePoint[],
  symptomSlots: SymptomSlot[],
  story: StoryAnalysisContext,
  reports: DiagnosticReport[]
): Record<string, MismatchAudit> {
  const clinicalGaps = Array.isArray(story.clinicalGaps) ? story.clinicalGaps : [];
  const painPoints = Array.isArray(story.painPoints) ? story.painPoints : [];
  const fallbackConcern = painPoints[0] || story.patternSummary || "Symptoms are continuing after earlier checks, so this report should be audited against the symptom timeline.";

  const audits: Record<string, MismatchAudit> = {};
  const eventPoints = timeline.filter(point => point.event);
  eventPoints.forEach((point, index) => {
    const report = reports[index];
    const gap = clinicalGaps[index];
    const severity = symptomSlots
      .map(slot => `${slot.label}: ${Math.round(Number(point[slot.key]) || 0)}/10`)
      .join(" · ");

    audits[point.week] = {
      name: report?.reportType || gap?.name || String(point.event || "Prior diagnostic check"),
      date: normalizeReportDate(report?.reportDate || gap?.date),
      coverage: Math.max(20, Math.min(85, Number(gap?.coverage) || (report ? 45 : 35))),
      severity,
      discrepancy: sentenceFrom(
        gap?.discrepancy,
        `${fallbackConcern} The diagnostic event is a single report point, while the symptom curve shows ongoing burden. The mismatch to review is whether the report actually tested the markers relevant to the symptoms that continued afterward.`
      ),
      advice: sentenceFrom(
        gap?.advice,
        "Ask the clinician to compare this report with the symptom timeline and document which missing markers, functional tests, or specialist reviews are still needed."
      )
    };
  });

  return audits;
}

function normalizeSearchText(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}

function hasAnyAlias(searchText: string, aliases: readonly string[]) {
  return aliases.some(alias => normalizeSearchText(alias).trim() && searchText.includes(normalizeSearchText(alias)));
}

function inferReportPanels(report: DiagnosticReport, searchText: string) {
  const panels = new Set<string>();
  const reportKind = `${report.name} ${report.reportType} ${report.summary ?? ""}`.toLowerCase();

  if (/thyroid|tsh|t3|t4|tpo|tgab/.test(searchText) || /thyroid/.test(reportKind)) panels.add("thyroid");
  if (/cbc|hemoglobin|haemoglobin|hgb|rbc|wbc|platelet|blood count/.test(searchText) || /lab|blood|cbc/.test(reportKind)) {
    panels.add("blood");
    panels.add("nutrient");
  }
  if (/crp|esr|ana|rheumatoid|anti ccp|inflammation|autoimmune/.test(searchText) || /inflammation|autoimmune|rheumatology/.test(reportKind)) {
    panels.add("inflammation");
    panels.add("autoimmune");
  }
  if (/hba1c|glucose|sugar|diabetes|fasting/.test(searchText) || /metabolic|diabetes/.test(reportKind)) panels.add("metabolic");
  if (panels.size === 0 && (report.extractedText || report.summary)) {
    panels.add("blood");
    panels.add("nutrient");
    panels.add("thyroid");
    panels.add("inflammation");
    panels.add("metabolic");
  }

  return panels;
}

function buildLabAudits(reports: DiagnosticReport[]): LabAudit[] {
  return reports
    .filter(report => report.status !== "error")
    .map(report => {
      const text = `${report.name} ${report.reportType} ${report.summary ?? ""} ${report.extractedText ?? ""}`;
      const searchText = normalizeSearchText(text);
      const panels = inferReportPanels(report, searchText);
      const relevantMarkers = labMarkerCatalog.filter(marker => marker.panels.some(panel => panels.has(panel)));
      const testedMarkers = relevantMarkers.filter(marker => hasAnyAlias(searchText, marker.aliases));
      const missingMarkers = relevantMarkers.filter(marker => !hasAnyAlias(searchText, marker.aliases));
      const denominator = Math.max(1, relevantMarkers.length);
      const completeness = Math.round((testedMarkers.length / denominator) * 100);

      return {
        name: report.reportType || "Uploaded Report",
        verdict: report.extractedText
          ? `${testedMarkers.length} detected, ${missingMarkers.length} omitted`
          : "Waiting for extracted report text",
        completeness,
        tested: testedMarkers.map(marker => marker.name),
        missing: missingMarkers.map(marker => ({ name: marker.name, reason: marker.reason, id: marker.id })),
        reportName: report.name,
        reportStatus: report.status,
      };
    });
}

function mapReportDoc(doc: ReportDoc): DiagnosticReport {
  const extracted = doc.extracted_text;
  return {
    id: doc._id,
    backendId: doc._id,
    name: doc.filename,
    doctor: doc.doctor || "",
    specialty: doc.specialty || "",
    reportType: doc.report_type || "Lab report",
    reportDate: doc.report_date || "",
    status: doc.extraction_status === "failed" ? "error" : extracted ? "analyzed" : "uploaded",
    extractedText: extracted,
    summary: summarizeExtractedText(extracted),
  };
}

function humanizeTheme(theme: string) {
  return theme.split("_").map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function formatIsoDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function GapCard({ gap }: { gap: Gap }) {
  return (
    <div style={{ padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)" }}>{humanizeTheme(gap.theme)}</span>
        <span className="badge badge-warning" style={{ fontSize: "10px" }}>Present {gap.weeks_present}/3 weeks</span>
      </div>
      <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
        Logged every week for the last 3 weeks with no report or doctor opinion addressing it yet.
      </p>
      <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: "8px" }}>
        Based on: your tracker/story evidence ({formatIsoDate(gap.first_seen)} – {formatIsoDate(gap.last_seen)})
      </div>
    </div>
  );
}

function ContradictionCard({ contradiction, doctorLabel }: { contradiction: Contradiction; doctorLabel: (id: string) => string }) {
  return (
    <div style={{ padding: "16px", borderRadius: "14px", border: "1.5px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13.5px", fontWeight: 800, color: "var(--text-primary)" }}>{doctorLabel(contradiction.a_id)} vs {doctorLabel(contradiction.b_id)}</span>
        <span className={`badge ${contradiction.contradicts ? "badge-danger" : "badge-success"}`} style={{ fontSize: "10px" }}>
          {contradiction.contradicts ? "Conflicting" : "Consistent"}
        </span>
      </div>
      <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{contradiction.summary}</p>
      <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: "8px" }}>
        Based on: 2 logged doctor opinions · checked {formatIsoDate(contradiction.checked_at)}
      </div>
      <p style={{ fontSize: "10.5px", color: "var(--text-secondary)", margin: 0, fontStyle: "italic" }}>
        This is a discussion guide for your clinician, not a diagnosis.
      </p>
    </div>
  );
}

type LegacyOpinion = { doctor?: string; specialty?: string; verdict?: string; notes?: string; ignoredSymptoms?: string; date?: string };

/** One-time migration off the four localStorage keys this page used to own
 * (see task-20-brief.md). Only writes to the backend when the backend
 * document is still empty, so a second run (or a second tab) never
 * duplicates data. Always clears the legacy keys afterward, including the
 * two that never needed a backend write (reports were already saved server
 * side at upload time; story analysis is now always read live from
 * /api/story/latest). Returns a one-line notice when it actually moved
 * something, else null. */
async function migrateLocalStorageIfNeeded(current: GuardState): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const legacyOpinions = readStoredJson<LegacyOpinion[]>("echocare-doctor-opinions", []);
  const legacyMarkers = readStoredJson<string[]>("echocare-requested-markers", []);
  const legacyEscalated = window.localStorage.getItem("echocare-case-escalated");
  const hasLegacyData = legacyOpinions.length > 0 || legacyMarkers.length > 0 || legacyEscalated !== null;

  let moved = false;
  if (hasLegacyData) {
    const backendEmpty = current.doctor_opinions.length === 0 && current.requested_markers.length === 0 && !current.escalated;
    if (backendEmpty) {
      for (const op of legacyOpinions) {
        if (!op.doctor || !op.specialty) continue;
        const opinionText = [op.verdict, op.notes, op.ignoredSymptoms ? `Ignored: ${op.ignoredSymptoms}` : ""]
          .filter(Boolean)
          .join(". ") || "No details recorded.";
        try {
          await backendJSON("/api/diagnostic-guard/opinions", {
            method: "POST",
            body: JSON.stringify({ doctor: op.doctor, specialty: op.specialty, opinion_text: opinionText, date: op.date }),
          });
          moved = true;
        } catch {
          // Best-effort: keep migrating the rest rather than aborting.
        }
      }
      if (legacyMarkers.length > 0) {
        try {
          await backendJSON("/api/diagnostic-guard/markers", { method: "PUT", body: JSON.stringify({ markers: legacyMarkers }) });
          moved = true;
        } catch {
          // ignore
        }
      }
      if (legacyEscalated === "true") {
        try {
          await backendJSON("/api/diagnostic-guard/escalate", { method: "POST" });
          moved = true;
        } catch {
          // ignore
        }
      }
    }
  }

  window.localStorage.removeItem("echocare-doctor-opinions");
  window.localStorage.removeItem("echocare-requested-markers");
  window.localStorage.removeItem("echocare-case-escalated");
  window.localStorage.removeItem("echocare-diagnostic-reports");
  window.localStorage.removeItem("echocare-story-analysis");

  return moved ? "Moved your saved notes to your account." : null;
}

export default function RedesignedDiagnosticGuard() {
  const [surveyData, setSurveyData] = useState<SurveyContext>({});
  const [storyAnalysis, setStoryAnalysis] = useState<StoryAnalysisContext>({});
  const [trackerLogs, setTrackerLogs] = useState<TrackerLog[]>([]);
  const [uploadedReports, setUploadedReports] = useState<DiagnosticReport[]>([]);
  const [reportDraft, setReportDraft] = useState({ doctor: "", specialty: "", reportType: "Lab report", reportDate: "" });
  const [uploadingReport, setUploadingReport] = useState(false);
  const [reportUploadError, setReportUploadError] = useState("");

  const [timeRange, setTimeRange] = useState<"3M" | "6M" | "8M">("8M");
  const [visibleSymptoms, setVisibleSymptoms] = useState<Record<string, boolean>>({
    symptom1: true,
    symptom2: true,
    symptom3: true,
    symptom4: false,
  });

  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>("Wk 12");
  const [activeAuditorIdx, setActiveAuditorIdx] = useState(0);
  const [requestedMarkers, setRequestedMarkers] = useState<string[]>([]);

  const [doctorOpinions, setDoctorOpinions] = useState<DoctorOpinion[]>([]);
  const [showOpinionForm, setShowOpinionForm] = useState(false);
  const [newDoc, setNewDoc] = useState({ doctor: "", specialty: "", opinion_text: "", date: "" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [opinionError, setOpinionError] = useState("");

  const [gaps, setGaps] = useState<Gap[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [checkingContradictions, setCheckingContradictions] = useState(false);
  const [contradictionError, setContradictionError] = useState("");
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  const [searchTranslation, setSearchTranslation] = useState("");
  const [activeTranslationIdx, setActiveTranslationIdx] = useState<number | null>(0);
  const [caseEscalated, setCaseEscalated] = useState(false);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");

  const symptomSlots = useMemo(() => buildSymptomSlots(surveyData, storyAnalysis), [surveyData, storyAnalysis]);
  const patientTimeline = useMemo(
    () => buildTimeline(symptomSlots, trackerLogs, storyAnalysis, uploadedReports),
    [symptomSlots, trackerLogs, storyAnalysis, uploadedReports]
  );
  const mismatchAudits = useMemo(
    () => buildMismatchAudits(patientTimeline, symptomSlots, storyAnalysis, uploadedReports),
    [patientTimeline, symptomSlots, storyAnalysis, uploadedReports]
  );
  const firstMismatchKey = Object.keys(mismatchAudits)[0] ?? patientTimeline.find(point => point.event)?.week ?? null;
  const effectiveSelectedNodeKey = selectedNodeKey && mismatchAudits[selectedNodeKey] ? selectedNodeKey : firstMismatchKey;
  const activeTestDetails = useMemo(() => {
    if (!effectiveSelectedNodeKey) return null;
    return mismatchAudits[effectiveSelectedNodeKey] ?? null;
  }, [effectiveSelectedNodeKey, mismatchAudits]);
  const labAudits = useMemo(() => buildLabAudits(uploadedReports), [uploadedReports]);
  const activeAuditor = labAudits[Math.min(activeAuditorIdx, Math.max(0, labAudits.length - 1))] ?? null;
  const patientPainPoints = Array.isArray(storyAnalysis.painPoints) ? storyAnalysis.painPoints : [];
  const patientDetectedSymptoms = symptomSlots.map(slot => slot.label);
  const patientDuration = patientTimeline.length >= 8 ? "8 timeline points" : `${patientTimeline.length} timeline points`;
  const activeGapCount = gaps.length + requestedMarkers.length;
  const opinionById = useMemo(() => Object.fromEntries(doctorOpinions.map(o => [o.id, o])), [doctorOpinions]);
  const doctorLabel = (id: string) => {
    const opinion = opinionById[id];
    return opinion ? `${opinion.doctor} (${opinion.specialty})` : "Unknown opinion";
  };

  useEffect(() => {
    let cancelled = false;

    const loadBackendContext = async () => {
      try {
        const [surveyRes, storyRes, trackerRes] = await Promise.all([
          fetchFromBackend("/api/survey"),
          fetchFromBackend("/api/story/latest"),
          fetchFromBackend("/api/tracker/history"),
        ]);

        if (surveyRes.ok) {
          const survey = await surveyRes.json();
          if (survey && typeof survey === "object") setSurveyData(survey);
        }

        if (storyRes.ok) {
          const story = await storyRes.json();
          const analysis = story?.analysis || story?.ai_analysis;
          if (analysis && typeof analysis === "object") setStoryAnalysis(analysis);
        }

        if (trackerRes.ok) {
          const tracker = await trackerRes.json();
          const logs = Array.isArray(tracker) ? tracker : tracker?.logs;
          if (Array.isArray(logs)) setTrackerLogs(logs);
        }

        const [reportsData, guardData] = await Promise.all([
          backendJSON<ReportDoc[]>("/api/story/reports").catch(() => []),
          backendJSON<GuardState>("/api/diagnostic-guard").catch(() => null),
        ]);
        if (cancelled) return;

        setUploadedReports((reportsData || []).map(mapReportDoc));

        const guard: GuardState = guardData ?? { doctor_opinions: [], requested_markers: [], escalated: false, escalated_at: null, contradictions: [] };
        setDoctorOpinions(guard.doctor_opinions);
        setRequestedMarkers(guard.requested_markers);
        setCaseEscalated(guard.escalated);
        setContradictions(guard.contradictions);

        const notice = await migrateLocalStorageIfNeeded(guard);
        if (!cancelled && notice) setMigrationNotice(notice);

        const gapsResult = await backendJSON<{ gaps: Gap[] }>("/api/diagnostic-guard/gaps").catch(() => ({ gaps: [] }));
        if (!cancelled) setGaps(gapsResult.gaps);
      } catch {
        // Keep the page usable even if the backend is briefly unreachable.
      }
    };

    loadBackendContext();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showBriefModal) return;
    let cancelled = false;
    setBriefLoading(true);
    setBriefError("");
    backendJSON<BriefData>("/api/diagnostic-guard/brief")
      .then(data => { if (!cancelled) setBrief(data); })
      .catch(error => { if (!cancelled) setBriefError(error instanceof Error ? error.message : "Could not load the advocacy brief."); })
      .finally(() => { if (!cancelled) setBriefLoading(false); });
    return () => { cancelled = true; };
  }, [showBriefModal]);

  const handleToggleEscalation = async () => {
    const nextState = !caseEscalated;
    setCaseEscalated(nextState);
    try {
      await backendJSON(`/api/diagnostic-guard/escalate`, { method: nextState ? "POST" : "DELETE" });
    } catch {
      setCaseEscalated(!nextState);
    }
  };

  const handleToggleMarker = async (markerName: string) => {
    const previous = requestedMarkers;
    const nextMarkers = previous.includes(markerName)
      ? previous.filter(m => m !== markerName)
      : [...previous, markerName];
    setRequestedMarkers(nextMarkers);
    try {
      await backendJSON("/api/diagnostic-guard/markers", { method: "PUT", body: JSON.stringify({ markers: nextMarkers }) });
    } catch {
      setRequestedMarkers(previous);
    }
  };

  const handleAddOpinion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.doctor || !newDoc.specialty || !newDoc.opinion_text) return;
    setSavingDoc(true);
    setOpinionError("");
    try {
      const created = await backendJSON<DoctorOpinion>("/api/diagnostic-guard/opinions", {
        method: "POST",
        body: JSON.stringify({
          doctor: newDoc.doctor,
          specialty: newDoc.specialty,
          opinion_text: newDoc.opinion_text,
          date: newDoc.date || undefined,
        }),
      });
      setDoctorOpinions(prev => [...prev, created]);
      setNewDoc({ doctor: "", specialty: "", opinion_text: "", date: "" });
      setShowOpinionForm(false);
    } catch (error) {
      setOpinionError(error instanceof Error ? error.message : "Could not save this opinion.");
    } finally {
      setSavingDoc(false);
    }
  };

  const handleDeleteOpinion = async (opinionId: string) => {
    const previous = doctorOpinions;
    setDoctorOpinions(previous.filter(o => o.id !== opinionId));
    setContradictions(prev => prev.filter(c => c.a_id !== opinionId && c.b_id !== opinionId));
    try {
      await backendJSON(`/api/diagnostic-guard/opinions/${opinionId}`, { method: "DELETE" });
    } catch {
      setDoctorOpinions(previous);
    }
  };

  const handleCheckContradictions = async () => {
    setCheckingContradictions(true);
    setContradictionError("");
    try {
      const result = await backendJSON<{ contradictions: Contradiction[] }>("/api/diagnostic-guard/contradictions/check", { method: "POST" });
      setContradictions(result.contradictions);
    } catch (error) {
      if (error instanceof BackendError && error.status === 503) {
        setContradictionError("AI contradiction checks are temporarily unavailable. Your opinions are saved.");
      } else if (error instanceof BackendError && error.status === 429) {
        setContradictionError("Too many contradiction checks — please wait a moment and try again.");
      } else {
        setContradictionError(error instanceof Error ? error.message : "Could not check for contradictions.");
      }
    } finally {
      setCheckingContradictions(false);
    }
  };

  const handleLocalReportAttach = async (files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      setReportUploadError("Please attach PDF reports only.");
      return;
    }

    setUploadingReport(true);
    setReportUploadError("");
    const token = getStoredToken();
    let nextReports = [...uploadedReports];

    for (const file of pdfs) {
      const localId = `${Date.now()}-${file.name}`;
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("doctor", reportDraft.doctor);
        body.append("specialty", reportDraft.specialty);
        body.append("report_type", reportDraft.reportType);
        body.append("report_date", reportDraft.reportDate || new Date().toISOString().slice(0, 10));

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
        nextReports = [{
          id: localId,
          backendId: uploaded.id,
          name: uploaded.filename || file.name,
          doctor: reportDraft.doctor,
          specialty: reportDraft.specialty,
          reportType: reportDraft.reportType,
          reportDate: reportDraft.reportDate || new Date().toISOString().slice(0, 10),
          status: uploaded.extracted_text ? "analyzed" : "uploaded",
          cloudinaryUrl: uploaded.cloudinary_url || uploaded.secure_url,
          extractedText: uploaded.extracted_text,
          summary: summarizeExtractedText(uploaded.extracted_text),
        }, ...nextReports];
      } catch (error) {
        nextReports = [{
          id: localId,
          name: file.name,
          doctor: reportDraft.doctor,
          specialty: reportDraft.specialty,
          reportType: reportDraft.reportType,
          reportDate: reportDraft.reportDate || new Date().toISOString().slice(0, 10),
          status: "error",
          summary: "Upload did not complete, so this report cannot be audited yet.",
          error: error instanceof Error ? error.message : "Upload failed",
        }, ...nextReports];
        setReportUploadError(error instanceof Error ? error.message : "Upload failed");
      }
    }

    setUploadedReports(nextReports);
    setUploadingReport(false);
  };

  const filteredTimeline = useMemo(() => {
    let sliceLength = patientTimeline.length;
    if (timeRange === "3M") sliceLength = Math.min(12, patientTimeline.length);
    if (timeRange === "6M") sliceLength = Math.min(24, patientTimeline.length);
    return patientTimeline.slice(Math.max(0, patientTimeline.length - sliceLength));
  }, [patientTimeline, timeRange]);

  const filteredTranslations = useMemo(() => {
    if (!searchTranslation) return subjectiveTranslators;
    return subjectiveTranslators.filter(t => 
      t.subjective.toLowerCase().includes(searchTranslation.toLowerCase()) || 
      t.clinical.toLowerCase().includes(searchTranslation.toLowerCase())
    );
  }, [searchTranslation]);

  const primaryAvg = patientTimeline.length && symptomSlots[0]
    ? (patientTimeline.reduce((acc, curr) => acc + (Number(curr[symptomSlots[0].key]) || 0), 0) / patientTimeline.length).toFixed(1)
    : "0.0";
  const secondaryAvg = patientTimeline.length && symptomSlots[1]
    ? (patientTimeline.reduce((acc, curr) => acc + (Number(curr[symptomSlots[1].key]) || 0), 0) / patientTimeline.length).toFixed(1)
    : "0.0";

  return (
    <AppLayout 
      title="Diagnostic Guard Hub" 
      subtitle="Expose un-investigated gaps, cross-check doctor contradictions, and build clinical evidence."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "32px", maxWidth: "1100px", margin: "0 auto", paddingBottom: "60px" }}>

        {migrationNotice && (
          <div style={{ padding: "12px 16px", borderRadius: "10px", background: "rgba(15,118,110,0.08)", border: "1px solid rgba(15,118,110,0.2)", color: "#0F766E", fontSize: "13px", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <span>{migrationNotice}</span>
            <button onClick={() => setMigrationNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#0F766E" }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* 1. PROTOCOL STATUS CARD */}
        <div className="card" style={{
          padding: "32px",
          background: "var(--surface)",
          borderLeft: caseEscalated ? "6px solid #EF4444" : "6px solid #0F766E",
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <div style={{
                  width: "52px", height: "52px", borderRadius: "12px",
                  background: caseEscalated ? "rgba(239,68,68,0.06)" : "rgba(15,118,110,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: caseEscalated ? "#EF4444" : "#0F766E", flexShrink: 0
                }}>
                  <ShieldAlert size={28} className={caseEscalated ? "animate-pulse" : ""} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Clinical Case Advocacy Status</span>
                    <span style={{
                      fontSize: "10px", fontWeight: 800, padding: "4px 12px", borderRadius: "100px",
                      background: caseEscalated ? "#EF4444" : "#0F766E", color: "white", textTransform: "uppercase", letterSpacing: "0.08em"
                    }}>
                      {caseEscalated ? "Case Active & Escalated" : "Case Resolved"}
                    </span>
                  </div>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: 1.6 }}>
                    EchoCare uses your survey, patient story, tracker logs, and uploaded reports to keep unresolved symptoms visible until the report gaps and specialist conflicts are reviewed.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button 
                  onClick={handleToggleEscalation}
                  style={{
                    padding: "10px 18px", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700,
                    background: caseEscalated ? "rgba(239,68,68,0.06)" : "#0F766E",
                    color: caseEscalated ? "#EF4444" : "white",
                    border: caseEscalated ? "1.5px solid #EF4444" : "none",
                    cursor: "pointer", transition: "all 0.2s"
                  }}
                >
                  {caseEscalated ? "Dismiss Escalation" : "Re-Open & Escalate Case"}
                </button>
                <button 
                  onClick={() => setShowBriefModal(true)}
                  style={{
                    padding: "10px 18px", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700,
                    background: "#0F766E", color: "white", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 12px rgba(15,118,110,0.2)"
                  }}
                >
                  <Printer size={14} /> Export Advocacy Brief
                </button>
              </div>
            </div>

            <div style={{ height: "1px", background: "#E2E8F0" }} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", fontSize: "13px", color: "var(--text-secondary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle size={15} color="#EF4444" />
                <span>Active Gaps: <strong style={{ color: "var(--text-primary)" }}>{activeGapCount} user-linked items</strong></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={15} color="#8B5CF6" />
                <span>Specialist Gaps: <strong style={{ color: "var(--text-primary)" }}>{doctorOpinions.length} logged opinions</strong></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <History size={15} color="#3B82F6" />
                <span>Chronological Evidence: <strong style={{ color: "var(--text-primary)" }}>{patientDuration}</strong></span>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Upload size={18} color="#0F766E" />
                Report Attachments for Diagnostic Guard
              </h3>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.6 }}>
                Add every PDF report from each doctor with source details. Reports uploaded from the Reports page are reused here for mismatch analysis.
              </p>
            </div>
            <span className="badge badge-muted">{uploadedReports.length} attached</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <input className="form-input" placeholder="Doctor / hospital" value={reportDraft.doctor} onChange={e => setReportDraft({ ...reportDraft, doctor: e.target.value })} />
            <input className="form-input" placeholder="Specialty" value={reportDraft.specialty} onChange={e => setReportDraft({ ...reportDraft, specialty: e.target.value })} />
            <select className="form-input" value={reportDraft.reportType} onChange={e => setReportDraft({ ...reportDraft, reportType: e.target.value })}>
              <option>Lab report</option>
              <option>Scan / Imaging</option>
              <option>Prescription</option>
              <option>Specialist opinion</option>
              <option>Discharge summary</option>
            </select>
            <input type="date" className="form-input" value={reportDraft.reportDate} onChange={e => setReportDraft({ ...reportDraft, reportDate: e.target.value })} />
          </div>

          <label style={{ border: "1.5px dashed var(--border)", borderRadius: "14px", padding: "18px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", cursor: "pointer", color: "#0F766E", fontSize: "13px", fontWeight: 750, background: "var(--background)" }}>
            <Upload size={16} />
            {uploadingReport ? "Uploading and extracting PDF text..." : "Attach multiple PDF reports for analysis"}
            <input type="file" multiple accept=".pdf,application/pdf" disabled={uploadingReport} style={{ display: "none" }} onChange={e => { void handleLocalReportAttach(e.target.files); e.currentTarget.value = ""; }} />
          </label>
          {reportUploadError && (
            <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: "12.5px", fontWeight: 700 }}>
              {reportUploadError}
            </div>
          )}

          {uploadedReports.length === 0 ? (
            <div style={{ padding: "18px", borderRadius: "12px", background: "var(--background)", color: "var(--text-secondary)", fontSize: "13px", border: "1px solid var(--border)" }}>
              No report PDFs are attached yet. Upload reports from this card or from Medical Reports so Diagnostic Guard can compare tests against ongoing symptoms.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {uploadedReports.map(report => (
                <div key={report.id} style={{ padding: "14px", borderRadius: "12px", border: "1.5px solid var(--border)", background: "var(--surface)" }}>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>{report.name}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {report.reportType || "Report"} · {normalizeReportDate(report.reportDate)}
                    <br />
                    {report.doctor || "Doctor not added"} · {report.specialty || "Specialty not added"}
                  </div>
                  <div className={`badge badge-${report.status === "analyzed" || report.status === "uploaded" ? "success" : report.status === "error" ? "danger" : "warning"}`} style={{ marginTop: "10px", fontSize: "10px" }}>
                    {report.status === "analyzed" ? "Text extracted" : report.status === "error" ? "Upload failed" : report.cloudinaryUrl ? "Cloudinary synced" : "Pending upload"}
                  </div>
                  {report.error && <div style={{ fontSize: "11px", color: "#DC2626", marginTop: "8px", lineHeight: 1.4 }}>{report.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. STEP 1: LONGITUDINAL SYMPTOM TIMELINE (SPACIOUS VERTICAL FLOW) */}
        <div className="card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F766E", letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(15,118,110,0.08)", padding: "4px 12px", borderRadius: "100px" }}>Step 1</span>
            <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
              <Scale size={18} color="#0F766E" />
              Symptom Chronicity & Mismatch Explorer
            </h3>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Compare your ongoing daily symptoms against single-point tests. Toggle lines to view symptoms. <strong>Click the orange test dots</strong> on the graph to audit why standard checks missed your symptoms.
            </p>
          </div>

          {/* Controls: Range & Symptom toggles */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
            {/* Range */}
            <div style={{ display: "flex", background: "#F1F5F9", padding: "4px", borderRadius: "8px", gap: "4px" }}>
              {(["3M", "6M", "8M"] as const).map(r => (
                <button 
                  key={r}
                  onClick={() => setTimeRange(r)}
                  style={{
                    padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                    border: "none", cursor: "pointer",
                    background: timeRange === r ? "white" : "transparent",
                    color: timeRange === r ? "#0F766E" : "var(--text-secondary)",
                    boxShadow: timeRange === r ? "0 2px 5px rgba(0,0,0,0.05)" : "none"
                  }}
                >
                  {r} View
                </button>
              ))}
            </div>

            {/* Symptom curve check buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {symptomSlots.length === 0 ? (
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Complete survey/story or upload reports to build symptom curves.</span>
              ) : symptomSlots.map(item => {
                const isActive = visibleSymptoms[item.key] ?? true;
                return (
                  <button
                    key={item.key}
                    onClick={() => setVisibleSymptoms(prev => ({ ...prev, [item.key]: !isActive }))}
                    style={{
                      padding: "6px 14px", borderRadius: "100px", fontSize: "12px", fontWeight: 700,
                      border: `1.5px solid ${isActive ? item.color : "#E2E8F0"}`,
                      background: isActive ? item.bg : "white",
                      color: isActive ? item.color : "var(--text-secondary)",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: item.color }} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Graph wrapper */}
          <div style={{ height: "260px", width: "100%", background: "var(--background)", borderRadius: "16px", padding: "16px", border: "1px solid #F1F5F9" }}>
            {filteredTimeline.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px", lineHeight: 1.6 }}>
                No user-specific timeline yet. Add symptoms in the survey/story, daily tracker logs, or PDF reports to generate the chronicity and mismatch graph.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredTimeline} margin={{ top: 10, right: 10, left: -26, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 600 }} />
                  <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: "var(--text-secondary)", fontWeight: 600 }} />
                  <Tooltip content={() => null} />

                  {symptomSlots.map(slot => (
                    (visibleSymptoms[slot.key] ?? true) && <Line key={slot.key} type="monotone" dataKey={slot.key} stroke={slot.color} strokeWidth={3} dot={false} />
                  ))}

                  {filteredTimeline.filter(point => point.event).map(point => (
                    <ReferenceDot
                      key={point.week}
                      x={point.week}
                      y={Math.max(...symptomSlots.map(slot => Number(point[slot.key]) || 0), 4)}
                      r={7}
                      fill="#EA580C"
                      stroke="#fff"
                      strokeWidth={2}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedNodeKey(point.week)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Active test mismatch info box (Highly readable light design) */}
          {activeTestDetails ? (
            <div style={{
              padding: "24px", borderRadius: "16px",
              background: "var(--background)", border: "1.5px solid var(--border)",
              borderLeft: "5px solid #EA580C"
            }} className="animate-scale-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#EA580C", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tested Details Audit ({activeTestDetails.coverage}% Completeness)</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>Date: {activeTestDetails.date}</span>
              </div>
              <h4 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "8px" }}>{activeTestDetails.name}</h4>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.6 }}>
                  <strong>Peak Symptoms During Test:</strong> <span style={{ fontFamily: "monospace", color: "#0F766E", fontWeight: 700 }}>{activeTestDetails.severity}</span>
                </div>
                <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.6 }}>
                  <strong>Why Tissues Were Omitted (Discrepancy):</strong> {activeTestDetails.discrepancy}
                </div>
                <div style={{ padding: "10px 14px", borderRadius: "10px", background: "rgba(15,118,110,0.05)", border: "1px solid rgba(15,118,110,0.1)", fontSize: "12.5px", color: "#0F766E", display: "flex", gap: "6px" }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span><strong>Clinical Advice:</strong> {activeTestDetails.advice}</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "20px", textAlign: "center", border: "1.5px dashed #E2E8F0", borderRadius: "12px", color: "var(--text-secondary)", fontSize: "13px" }}>
              💡 Select any orange test dot on the timeline graph to view why standard findings conflicted with your actual symptoms.
            </div>
          )}
        </div>

        {/* UNRESOLVED SYMPTOM GAPS (server-detected, Task 19) */}
        <div className="card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle size={18} color="#EA580C" />
              Unresolved Symptom Gaps
            </h3>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Symptoms you have logged every week for the last 3 weeks that no uploaded report or doctor opinion has addressed yet.
            </p>
          </div>
          {gaps.length === 0 ? (
            <div style={{ padding: "18px", borderRadius: "12px", background: "var(--background)", color: "var(--text-secondary)", fontSize: "13px", border: "1px solid var(--border)" }}>
              No unresolved symptom gaps detected yet. Keep logging your daily tracker to build this picture.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
              {gaps.map(gap => <GapCard key={gap.theme} gap={gap} />)}
            </div>
          )}
        </div>

        {/* 3. STEP 2: LAB REPORT AUDITOR & REQUISITION BUILDER (SPACIOUS SPLIT LAYOUT) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          
          {/* Lab Auditor (2 cols) */}
          <div className="card lg:col-span-2" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F766E", letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(15,118,110,0.08)", padding: "4px 12px", borderRadius: "100px" }}>Step 2</span>
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                <FileCheck size={18} color="#0F766E" />
                Lab Report Completeness Auditor
              </h3>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Standard lab reports often skip essential subclinical markers. Audit your reports below and select missing markers to compile your doctor request checklist.
              </p>
            </div>

            {labAudits.length > 0 ? (
              <>
                {/* Selector tabs */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  {labAudits.map((aud, i) => (
                    <div 
                      key={`${aud.reportName}-${i}`}
                      onClick={() => setActiveAuditorIdx(i)}
                      style={{
                        padding: "16px", borderRadius: "16px", border: activeAuditorIdx === i ? "2px solid #0F766E" : "1.5px solid #E2E8F0",
                        background: activeAuditorIdx === i ? "rgba(15,118,110,0.01)" : "white",
                        cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px"
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13.5px", fontWeight: 750, color: "var(--text-primary)" }}>{aud.name}</div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "2px" }}>{aud.reportName}</div>
                        <div style={{ fontSize: "11px", color: aud.reportStatus === "analyzed" ? "#0F766E" : "#EA580C", marginTop: "4px", fontWeight: 700 }}>{aud.verdict}</div>
                      </div>
                      <div style={{ position: "relative", width: "40px", height: "40px" }} className="flex-shrink-0">
                        <svg viewBox="0 0 36 36" width="40" height="40">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#F1F5F9" strokeWidth="3" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke={aud.completeness < 30 ? "#EF4444" : aud.completeness < 70 ? "#F59E0B" : "#0F766E"} strokeWidth="3"
                            strokeDasharray={`${2 * Math.PI * 14}`}
                            strokeDashoffset={`${2 * Math.PI * 14 * (1 - aud.completeness / 100)}`}
                            strokeLinecap="round" transform="rotate(-90 18 18)" />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800, color: "var(--text-primary)" }}>
                          {aud.completeness}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Missing markers checklist */}
                {activeAuditor && (
                  <div style={{ padding: "20px", borderRadius: "16px", background: "var(--background)", border: "1.5px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", marginBottom: "16px", gap: "12px" }}>
                      <div>
                        <h4 style={{ fontSize: "13.5px", fontWeight: 750, color: "var(--text-primary)" }}>
                          Tested Indicators: <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{activeAuditor.tested.length ? activeAuditor.tested.join(", ") : "No recognized markers found in extracted text"}</span>
                        </h4>
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#EF4444", textTransform: "uppercase", whiteSpace: "nowrap" }}>{100 - activeAuditor.completeness}% Untested Gap</span>
                    </div>

                    {activeAuditor.missing.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                        {activeAuditor.missing.map(m => {
                          const isChecked = requestedMarkers.includes(m.name);
                          return (
                            <div 
                              key={m.id}
                              onClick={() => handleToggleMarker(m.name)}
                              style={{
                                padding: "14px", borderRadius: "12px", border: isChecked ? "2px solid #0F766E" : "1.5px solid #E2E8F0",
                                background: "var(--surface)", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "flex-start", gap: "12px"
                              }}
                            >
                              <div style={{
                                width: "20px", height: "20px", borderRadius: "4px", border: "1.5px solid #94A3B8",
                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                background: isChecked ? "#0F766E" : "transparent", borderColor: isChecked ? "#0F766E" : "#94A3B8"
                              }}>
                                {isChecked && <CheckCircle size={12} color="white" />}
                              </div>
                              <div>
                                <div style={{ fontSize: "13px", fontWeight: 750, color: "var(--text-primary)" }}>{m.name}</div>
                                <p style={{ fontSize: "11.5px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.45 }}>{m.reason}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: "18px", borderRadius: "12px", background: "var(--surface)", border: "1.5px solid var(--border)", fontSize: "13px", color: "#0F766E", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckCircle size={16} /> No omitted markers detected for this report category.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "24px", borderRadius: "16px", background: "var(--background)", border: "1.5px dashed var(--border)", textAlign: "center" }}>
                <Upload size={28} color="#0F766E" style={{ margin: "0 auto 10px" }} />
                <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)" }}>No uploaded report data found</div>
                <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5, margin: "6px auto 0", maxWidth: "460px" }}>
                  Upload a PDF report from the Reports page, or attach one in Step 1 above. The auditor will use extracted report text instead of demo panels.
                </p>
              </div>
            )}
          </div>

          {/* GP Requisition checklist sheet (1 col) */}
          <div className="card" style={{
            padding: "32px", display: "flex", flexDirection: "column", justifyContent: "space-between",
            border: "2px dashed #CBD5E1", background: "var(--background)", boxShadow: "none"
          }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h3 style={{ fontSize: "14.5px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FileText size={16} color="#0F766E" />
                  GP Request Checklist
                </h3>
                <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "100px", background: "rgba(15,118,110,0.1)", color: "#0F766E" }}>
                  {requestedMarkers.length} Selected
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "20px" }}>
                Review and select missing indicators on the left to add them here. Use the PDF print brief at your next visit.
              </p>
            </div>

            {requestedMarkers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1, justifyContent: "space-between" }} className="animate-scale-in">
                <div style={{
                  background: "var(--surface)", border: "1.5px solid var(--border)",
                  borderRadius: "12px", padding: "14px 16px", maxHeight: "200px", overflowY: "auto"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {requestedMarkers.map((marker, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12.5px", paddingBottom: "6px", borderBottom: i < requestedMarkers.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                        <span style={{ fontWeight: 750, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0F766E" }} />
                          {marker}
                        </span>
                        <button onClick={() => handleToggleMarker(marker)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => setShowBriefModal(true)}
                  className="btn btn-primary"
                  style={{ width: "100%", fontSize: "13px", paddingTop: "10px", paddingBottom: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <Download size={14} /> Compile Requisition brief
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", flex: 1, color: "var(--text-secondary)", padding: "20px 0" }}>
                <AlertCircle size={32} color="#0F766E" style={{ opacity: 0.3, marginBottom: "8px" }} />
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)" }}>Checklist Empty</div>
                <p style={{ fontSize: "12px", maxWidth: "200px", margin: "4px auto 0", lineHeight: 1.45 }}>Check omitted markers in the auditor tab on the left to add them to your checklist.</p>
              </div>
            )}

            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #E2E8F0", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              *Presenting standard reference ranges checking tissue-level markers makes it harder for GPs to dismiss unexplained symptoms.
            </div>
          </div>
        </div>

        {/* 4. STEP 3: DOCTOR CONSENSUS MATRIX */}
        <div className="card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F766E", letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(15,118,110,0.08)", padding: "4px 12px", borderRadius: "100px" }}>Step 3</span>
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                <UserCheck size={18} color="#0F766E" />
                Specialist Opinions & Conflict Audit
              </h3>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Map contradictory diagnoses side-by-side to highlight indicators ignored by each practitioner.
              </p>
            </div>
            <button 
              onClick={() => setShowOpinionForm(!showOpinionForm)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", border: "1px solid var(--border)" }}
            >
              <Plus size={13} /> Log Specialist Opinion
            </button>
          </div>

          {/* Log Opinion Form */}
          {showOpinionForm && (
            <form onSubmit={handleAddOpinion} style={{ padding: "24px", borderRadius: "16px", background: "var(--background)", border: "1.5px solid var(--border)", display: "flex", flexDirection: "column", gap: "16px" }} className="animate-scale-in">
              <div style={{ fontSize: "14px", fontWeight: 750, color: "var(--text-primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>Enter Doctor Opinion</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "11px", fontWeight: 700 }}>Doctor Name</label>
                  <input type="text" required placeholder="e.g. Dr. Roberts" value={newDoc.doctor} onChange={e => setNewDoc({...newDoc, doctor: e.target.value})} className="form-input" style={{ fontSize: "13px" }} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "11px", fontWeight: 700 }}>Specialty</label>
                  <input type="text" required placeholder="e.g. Rheumatologist" value={newDoc.specialty} onChange={e => setNewDoc({...newDoc, specialty: e.target.value})} className="form-input" style={{ fontSize: "13px" }} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "11px", fontWeight: 700 }}>Consultation Date</label>
                  <input type="date" value={newDoc.date} onChange={e => setNewDoc({...newDoc, date: e.target.value})} className="form-input" style={{ fontSize: "13px" }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: "11px", fontWeight: 700 }}>Opinion (verdict, notes, anything they said or ignored)</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Basic blood work normal. Believes symptoms are stress-related. Did not review joint swelling or temperature fluctuation."
                  value={newDoc.opinion_text}
                  onChange={e => setNewDoc({...newDoc, opinion_text: e.target.value})}
                  className="form-input"
                  style={{ fontSize: "13px", resize: "vertical" }}
                />
              </div>

              {opinionError && (
                <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: "12.5px", fontWeight: 700 }}>
                  {opinionError}
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowOpinionForm(false)} className="btn btn-secondary btn-sm border dark:border-slate-800">Cancel</button>
                <button type="submit" disabled={savingDoc} className="btn btn-primary btn-sm font-bold">
                  {savingDoc ? "Saving..." : "✓ Log Opinion"}
                </button>
              </div>
            </form>
          )}

          {/* Grid stack */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {doctorOpinions.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", padding: "24px", borderRadius: "14px", border: "1.5px dashed var(--border)", color: "var(--text-secondary)", fontSize: "13px", textAlign: "center" }}>
                No specialist opinions logged yet. Add each doctor verdict here so Diagnostic Guard can compare contradictions against the uploaded reports and ongoing symptoms.
              </div>
            ) : doctorOpinions.map(opinion => (
              <div
                key={opinion.id}
                style={{
                  padding: "24px", borderRadius: "18px", border: "1.5px solid var(--border)",
                  background: "var(--surface)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px"
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F1F5F9", paddingBottom: "10px", marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <User size={15} color="#0F766E" />
                      <span style={{ fontSize: "14px", fontWeight: 750, color: "var(--text-primary)" }}>{opinion.doctor}</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700, fontFamily: "monospace" }}>{opinion.date}</span>
                  </div>

                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#0F766E", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                    Specialty: <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{opinion.specialty}</span>
                  </div>

                  <p style={{ fontSize: "13px", color: "#334155", lineHeight: 1.6, fontStyle: "italic" }}>
                    &ldquo;{opinion.opinion_text}&rdquo;
                  </p>
                </div>

                <button
                  onClick={() => handleDeleteOpinion(opinion.id)}
                  style={{ alignSelf: "flex-end", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <X size={12} /> Remove
                </button>
              </div>
            ))}
          </div>

          {/* Contradiction check (real LLM classify call, Task 19) */}
          <div style={{ padding: "20px", borderRadius: "16px", background: "var(--background)", border: "1.5px solid var(--border)", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Scale size={18} color="#0F766E" />
                <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)" }}>Doctor Opinion Contradiction Check</span>
              </div>
              <button
                onClick={handleCheckContradictions}
                disabled={checkingContradictions || doctorOpinions.length < 2}
                className="btn btn-primary btn-sm"
                style={{ fontSize: "12px", fontWeight: 700 }}
              >
                {checkingContradictions ? "Checking..." : "Check for Contradictions"}
              </button>
            </div>
            {doctorOpinions.length < 2 && (
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: 0 }}>Log at least two specialist opinions to run a contradiction check.</p>
            )}
            {contradictionError && (
              <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: "12.5px", fontWeight: 700 }}>
                {contradictionError}
              </div>
            )}
            {contradictions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {contradictions.map(c => (
                  <ContradictionCard key={`${c.a_id}-${c.b_id}`} contradiction={c} doctorLabel={doctorLabel} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 5. STEP 4: SYMPTOM TRANSLATOR (VERTICAL SEARCH LAYOUT) */}
        <div className="card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F766E", letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(15,118,110,0.08)", padding: "4px 12px", borderRadius: "100px" }}>Step 4</span>
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                <Sparkles size={18} color="#8B5CF6" />
                Symptom Translation Wizard
              </h3>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Translate subjective complaints into standard clinical metrics, diagnostic scales, and ICD codes to explain findings clearly to your doctor.
              </p>
            </div>

            {/* Input Search */}
            <div style={{ position: "relative", width: "260px" }}>
              <input 
                type="text" 
                placeholder="Search symptom term..."
                value={searchTranslation}
                onChange={e => setSearchTranslation(e.target.value)}
                className="form-input" 
                style={{ fontSize: "13px", paddingLeft: "36px", borderRadius: "10px" }}
              />
              <Search size={14} color="#94A3B8" style={{ position: "absolute", left: "12px", top: "12px" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2.8fr", gap: "24px", alignItems: "start" }}>
            {/* Sidebar list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredTranslations.map((item, idx) => (
                <button
                  key={item.subjective}
                  onClick={() => setActiveTranslationIdx(idx)}
                  style={{
                    padding: "14px 18px", borderRadius: "12px", textAlign: "left",
                    border: activeTranslationIdx === idx ? "2px solid #8B5CF6" : "1.5px solid #E2E8F0",
                    background: activeTranslationIdx === idx ? "rgba(139,92,246,0.03)" : "white",
                    color: activeTranslationIdx === idx ? "#8B5CF6" : "var(--text-secondary)",
                    cursor: "pointer", transition: "all 0.15s", fontSize: "13px", fontWeight: 700
                  }}
                >
                  {item.subjective}
                </button>
              ))}
            </div>

            {/* Translation details */}
            <div>
              {activeTranslationIdx !== null && filteredTranslations[activeTranslationIdx] ? (
                <div style={{
                  padding: "24px", borderRadius: "20px", border: "1.5px solid rgba(139,92,246,0.15)",
                  background: "rgba(139,92,246,0.01)", display: "flex", flexDirection: "column", gap: "16px"
                }} className="animate-scale-in">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
                    <div>
                      <span style={{ fontSize: "9px", fontWeight: 800, color: "#8B5CF6", letterSpacing: "0.08em", textTransform: "uppercase" }}>Clinical Translation</span>
                      <h4 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>
                        {filteredTranslations[activeTranslationIdx].clinical}
                      </h4>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 12px", borderRadius: "6px", background: "rgba(139,92,246,0.08)", color: "#8B5CF6", fontFamily: "monospace" }}>
                        {filteredTranslations[activeTranslationIdx].code}
                      </span>
                      <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 12px", borderRadius: "6px", background: "rgba(59,130,246,0.08)", color: "#3B82F6", fontFamily: "monospace" }}>
                        Active Scale
                      </span>
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: "4px" }}>Standard Evaluation Scale:</span>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#8B5CF6", fontFamily: "monospace" }}>
                      {filteredTranslations[activeTranslationIdx].scale}
                    </div>
                  </div>

                  <p style={{ fontSize: "13.5px", color: "#334155", lineHeight: 1.65 }}>
                    {filteredTranslations[activeTranslationIdx].desc}
                  </p>

                  <div style={{
                    padding: "12px 16px", borderRadius: "12px", background: "var(--surface)",
                    border: "1px solid var(--border)", fontSize: "12px", color: "var(--text-secondary)",
                    display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center"
                  }}>
                    <span>Subjective descriptions:</span>
                    {filteredTranslations[activeTranslationIdx].examples.map((ex, i) => (
                      <span key={i} style={{ padding: "3px 10px", background: "#F1F5F9", borderRadius: "6px", fontSize: "11.5px", fontStyle: "italic", border: "1px solid var(--border)" }}>
                        &quot;{ex}&quot;
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8", fontSize: "13px" }}>
                  Select a symptom term from the menu to analyze clinical equivalents.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* PRINT ADVOCACY BRIEF MODAL */}
      {showBriefModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "20px"
        }}>
          <div className="card animate-scale-in" style={{
            background: "var(--surface)", color: "black", width: "100%", maxWidth: "800px",
            maxHeight: "90vh", overflowY: "auto", padding: "40px", position: "relative",
            boxShadow: "0 25px 50px rgba(0,0,0,0.25)"
          }}>
            {/* Header controls */}
            <div className="no-print" style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", marginBottom: "24px", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)" }}>Advocacy Brief Preview</h3>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>Hand this directly to your specialist to challenge dismissive consultation patterns.</p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button 
                  onClick={() => window.print()}
                  style={{
                    padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
                    background: "#0F766E", color: "white", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "6px"
                  }}
                >
                  <Printer size={13} /> Print Memo
                </button>
                <button 
                  onClick={() => setShowBriefModal(false)}
                  style={{
                    padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
                    background: "var(--surface)", color: "var(--text-primary)", border: "1.5px solid var(--border)", cursor: "pointer"
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Document contents wrapper */}
            <div id="print-area" style={{ fontFamily: "serif", color: "black", background: "var(--surface)" }}>
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  #print-area, #print-area * { visibility: visible; }
                  #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; color: black !important; background: white !important; }
                  .no-print { display: none !important; }
                }
              `}</style>

              {briefLoading && !brief ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>Loading advocacy brief...</div>
              ) : briefError ? (
                <div style={{ padding: "20px", borderRadius: "10px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: "13px" }}>{briefError}</div>
              ) : brief ? (
                <>
                  <div style={{ borderBottom: "3px solid var(--border)", paddingBottom: "12px", marginBottom: "24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <h1 style={{ fontSize: "20px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em", margin: 0 }}>Clinical Case Advocacy Brief</h1>
                        <span style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--text-secondary)" }}>
                          Protocol Status: {brief.escalated ? "ACTIVE" : "RESOLVED"} | CASE-REF: {brief.case_ref}
                        </span>
                      </div>
                      <div style={{ textAlign: "right", fontSize: "11px", color: "var(--text-secondary)" }}>
                        <div>Logged Days (30d): {brief.tracker_averages.days_logged}</div>
                        <div>Date Compiled: {formatIsoDate(brief.generated_at)}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1.5px solid var(--border)", paddingBottom: "4px", marginBottom: "8px" }}>
                      1. Tracked Symptom Burden (last 30 days)
                    </h2>
                    {brief.tracker_averages.days_logged === 0 ? (
                      <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#1E293B" }}>No tracker logs in the last 30 days yet.</p>
                    ) : (
                      <p style={{ fontSize: "12px", lineHeight: 1.6, color: "#1E293B" }}>
                        Across {brief.tracker_averages.days_logged} logged day{brief.tracker_averages.days_logged === 1 ? "" : "s"}: average energy {brief.tracker_averages.energy ?? "–"}/10,
                        {" "}pain {brief.tracker_averages.pain ?? "–"}/10, stress {brief.tracker_averages.stress ?? "–"}/10, sleep {brief.tracker_averages.sleep_hours ?? "–"}h.
                        Uploaded reports and logged doctor opinions are compared against this ongoing pattern so single-point findings are not treated as the complete clinical picture.
                      </p>
                    )}
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1.5px solid var(--border)", paddingBottom: "4px", marginBottom: "8px" }}>
                      2. Unresolved Symptom Gaps
                    </h2>
                    {brief.gaps.length === 0 ? (
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>No unresolved symptom gaps detected.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {brief.gaps.map(gap => (
                          <div key={gap.theme} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
                            <div style={{ fontSize: "12px", fontWeight: 700 }}>{humanizeTheme(gap.theme)}: present {gap.weeks_present}/3 weeks</div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                              {formatIsoDate(gap.first_seen)} – {formatIsoDate(gap.last_seen)} · not addressed by any uploaded report or doctor opinion.
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {brief.requested_markers.length > 0 && (
                    <div style={{ marginBottom: "20px", padding: "16px", borderRadius: "8px", background: "var(--background)", border: "1.5px solid var(--border)" }}>
                      <h2 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "#0F766E", marginBottom: "8px" }}>
                        3. Recommended Diagnostic Requisitions
                      </h2>
                      <p style={{ fontSize: "11.5px", color: "#334155", marginBottom: "8px" }}>It is recommended to run the following indicators to resolve testing gaps:</p>
                      <ul style={{ paddingLeft: "20px", fontSize: "11.5px", color: "var(--text-primary)", display: "flex", flexDirection: "column", gap: "4px" }}>
                        {brief.requested_markers.map((m, i) => <li key={i} style={{ fontWeight: 700 }}>{m}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1.5px solid var(--border)", paddingBottom: "4px", marginBottom: "8px" }}>
                      4. Specialist Consensus Contradiction Grid
                    </h2>
                    {brief.doctor_opinions.length === 0 ? (
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>No specialist opinions logged yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {brief.doctor_opinions.map(opinion => (
                          <div key={opinion.id} style={{ fontSize: "11.5px", display: "grid", gridTemplateColumns: "1.5fr 3fr", gap: "10px", paddingBottom: "6px", borderBottom: "1px solid #F1F5F9" }}>
                            <span style={{ fontWeight: 700 }}>{opinion.doctor} ({opinion.specialty}) · {opinion.date}</span>
                            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{opinion.opinion_text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {brief.contradictions.length > 0 && (
                      <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {brief.contradictions.map(c => {
                          const a = brief.doctor_opinions.find(o => o.id === c.a_id);
                          const b = brief.doctor_opinions.find(o => o.id === c.b_id);
                          return (
                            <div key={`${c.a_id}-${c.b_id}`} style={{ fontSize: "11px", color: c.contradicts ? "#B91C1C" : "#334155" }}>
                              <strong>{a?.doctor ?? "Unknown"} vs {b?.doctor ?? "Unknown"}:</strong> {c.summary}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {brief.top_insights.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <h2 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1.5px solid var(--border)", paddingBottom: "4px", marginBottom: "8px" }}>
                        5. Evidence-Backed Patterns
                      </h2>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {brief.top_insights.map(insight => (
                          <div key={insight.theme} style={{ fontSize: "11.5px" }}>
                            <strong>{insight.title}</strong> ({Math.round(insight.confidence * 100)}% confidence{insight.low_confidence ? ", low" : ""}): {insight.observation}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", borderTop: "1.5px solid var(--border)", paddingTop: "12px", marginTop: "32px", fontSize: "10px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    <span>This is a discussion guide for your clinician, not a diagnosis.</span>
                    <span>Advocacy Protocol: {brief.escalated ? "ACTIVE" : "RESOLVED"}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}
