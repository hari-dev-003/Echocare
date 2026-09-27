"use client";
import * as Accordion from "@radix-ui/react-accordion";
import { AlertTriangle, CheckCircle2, ChevronDown, Gauge, MessageCircleQuestion } from "lucide-react";

export interface Excerpt {
  id: string;
  source_type: string;
  date: string;
  excerpt: string;
  score?: number;
}

export interface EvidenceSummary {
  [source_type: string]: number | string | undefined;
  from?: string;
  to?: string;
}

export interface EvidenceCardProps {
  title: string;
  body: string;
  discussionPoints?: string[];
  questions?: string[];
  confidence: number; // 0-1
  lowConfidence: boolean;
  evidenceSummary: EvidenceSummary;
  excerpts: Excerpt[];
  provider?: string;
  /** Dense layout for the dashboard (no discussion points/questions, no accordion). */
  compact?: boolean;
}

const SOURCE_ORDER = ["tracker", "report", "survey", "narrative"] as const;
const SOURCE_LABELS: Record<string, (n: number) => string> = {
  tracker: n => `${n} tracker ${n === 1 ? "entry" : "entries"}`,
  report: n => `${n} ${n === 1 ? "report" : "reports"}`,
  survey: n => `${n} survey ${n === 1 ? "response" : "responses"}`,
  narrative: () => "your story",
};
const SOURCE_DISPLAY: Record<string, string> = {
  tracker: "Tracker",
  report: "Report",
  survey: "Survey",
  narrative: "Your story",
};

function formatDateRange(from?: string, to?: string): string {
  if (!from || !to) return "";
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return "";
  const fMonth = f.toLocaleDateString("en-US", { month: "short" });
  const tMonth = t.toLocaleDateString("en-US", { month: "short" });
  if (from === to) return `${fMonth} ${f.getDate()}`;
  return fMonth === tMonth
    ? `${fMonth} ${f.getDate()}–${t.getDate()}`
    : `${fMonth} ${f.getDate()} – ${tMonth} ${t.getDate()}`;
}

function confidenceMeta(score: number): { label: string; Icon: typeof CheckCircle2; color: string } {
  if (score >= 0.75) return { label: "High confidence", Icon: CheckCircle2, color: "var(--success)" };
  if (score >= 0.55) return { label: "Moderate confidence", Icon: Gauge, color: "var(--accent)" };
  return { label: "Low confidence", Icon: AlertTriangle, color: "var(--warning)" };
}

/**
 * Every AI-generated insight in the app renders through this component:
 * confidence is always a percentage + text label + icon (never colour alone),
 * a low-confidence pill calls out insights below the LE-RAG gate's TAU, and
 * the footer always names the evidence behind the text with an expandable
 * excerpt list. The disclaimer line is fixed and never edited per-insight.
 */
export default function EvidenceCard({
  title,
  body,
  discussionPoints = [],
  questions = [],
  confidence,
  lowConfidence,
  evidenceSummary,
  excerpts,
  provider,
  compact = false,
}: EvidenceCardProps) {
  const pct = Math.round(confidence * 100);
  const { label, Icon, color } = confidenceMeta(confidence);
  const range = formatDateRange(evidenceSummary.from, evidenceSummary.to);
  const sourceParts = SOURCE_ORDER
    .filter(key => typeof evidenceSummary[key] === "number" && (evidenceSummary[key] as number) > 0)
    .map(key => SOURCE_LABELS[key](evidenceSummary[key] as number));
  const footerText = sourceParts.length
    ? `Based on: ${sourceParts.join(", ")}${range ? ` (${range})` : ""}`
    : "Based on the evidence below.";

  return (
    <div
      className="card"
      style={{ padding: compact ? "16px" : "20px", display: "flex", flexDirection: "column", gap: compact ? "10px" : "14px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: compact ? "14px" : "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>
          {title}
        </h3>
        <div
          title={`${pct}% — ${label}`}
          style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color, whiteSpace: "nowrap", flexShrink: 0 }}
        >
          <Icon size={13} />
          <span>{pct}%</span>
          <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{label}</span>
        </div>
      </div>

      {lowConfidence && (
        <div
          className="badge badge-warning"
          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <AlertTriangle size={11} /> Low confidence — discuss with caution
        </div>
      )}

      <p style={{ fontSize: compact ? "12px" : "13px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
        {body}
      </p>

      {!compact && discussionPoints.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
            Discussion points
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {discussionPoints.map((point, i) => (
              <li key={i} style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {!compact && questions.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
            <MessageCircleQuestion size={12} /> Ask your clinician
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {questions.map((q, i) => (
              <li key={i} style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {excerpts.length > 0 ? (
        <Accordion.Root type="single" collapsible>
          <Accordion.Item value="evidence" style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
            <Accordion.Header>
              <Accordion.Trigger
                className="evidence-accordion-trigger"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                  background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left",
                  fontSize: "11px", color: "var(--text-muted)", fontWeight: 600,
                }}
              >
                <span>{footerText}</span>
                <ChevronDown size={13} className="accordion-chevron" style={{ flexShrink: 0, transition: "transform 0.15s ease" }} />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {excerpts.map(ex => (
                <div key={ex.id} style={{ padding: "8px 10px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span className="badge badge-muted" style={{ fontSize: "10px" }}>{SOURCE_DISPLAY[ex.source_type] ?? ex.source_type}</span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{ex.date}</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
                    &ldquo;{ex.excerpt}&rdquo;
                  </p>
                </div>
              ))}
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      ) : (
        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
          {footerText}
        </div>
      )}

      <p style={{ fontSize: "10.5px", color: "var(--text-muted)", margin: 0, fontStyle: "italic" }}>
        This is a discussion guide for your clinician, not a diagnosis.
      </p>
      {!compact && provider && (
        <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: 0 }}>Generated by {provider}</p>
      )}
    </div>
  );
}
