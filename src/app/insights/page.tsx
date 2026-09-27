"use client";
import AppLayout from "@/components/AppLayout";
import EvidenceCard from "@/components/EvidenceCard";
import type { Excerpt, EvidenceSummary } from "@/components/EvidenceCard";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Hourglass, Info, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import Link from "next/link";
import { backendJSON, BackendError } from "@/lib/backend";

interface Insight {
  id: string;
  theme: string;
  title: string;
  observation: string;
  discussion_points: string[];
  questions_for_clinician: string[];
  evidence: Excerpt[];
  evidence_summary: EvidenceSummary;
  confidence: number;
  low_confidence: boolean;
  provider: string;
  generated_at: string;
}

interface GatedOut {
  theme: string;
  count: number;
  source_types: string[];
  needed: { occurrences: number; source_types: number };
  reason: "insufficient_evidence" | "awaiting_embeddings";
}

interface InsightsResponse {
  insights: Insight[];
  stale: boolean;
  gated_out: GatedOut[];
}

interface RefreshResponse extends InsightsResponse {
  dropped?: { theme: string; reason: string }[];
  unavailable?: string[];
}

type PageStatus = "loading" | "ready" | "unavailable" | "rate_limited" | "error";

function themeLabel(theme: string): string {
  return theme.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function gatedOutLabel(g: GatedOut): string {
  const name = themeLabel(g.theme);
  if (g.reason === "awaiting_embeddings") return `${name} — waiting for AI processing`;
  return `${name} — ${g.count} of ${g.needed.occurrences} occurrences · ${g.source_types.length} of ${g.needed.source_types} source types`;
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  async function load() {
    setStatus("loading");
    try {
      const res = await backendJSON<InsightsResponse>("/api/health-insights");
      setData(res);
      setStatus("ready");
    } catch (err) {
      if (err instanceof BackendError && err.status === 503) setStatus("unavailable");
      else if (err instanceof BackendError && err.status === 429) setStatus("rate_limited");
      else setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const res = await backendJSON<RefreshResponse>("/api/health-insights/refresh", { method: "POST" });
      setData(res);
      setStatus("ready");
      if (res.unavailable && res.unavailable.length > 0) {
        setRefreshNote("Some themes couldn't be analyzed right now (AI unavailable). Your other insights are up to date.");
      }
    } catch (err) {
      if (err instanceof BackendError && err.status === 503) {
        setRefreshNote("Insights temporarily unavailable — the AI service is down. Please try again shortly.");
      } else if (err instanceof BackendError && err.status === 429) {
        setRefreshNote("You're refreshing too often. Please wait a bit before trying again.");
      } else {
        setRefreshNote("Couldn't refresh insights. Please try again.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AppLayout title="AI Health Insights" subtitle="Evidence-based patterns from your tracker, story, surveys and reports">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* AI Disclaimer */}
        <div style={{ padding: "14px 20px", borderRadius: "14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", display: "flex", alignItems: "center", gap: "12px" }}>
          <Info size={16} color="#3B82F6" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: "13px", color: "#1D4ED8", lineHeight: 1.5 }}>
            <strong>AI-Generated Informational Content:</strong> Insights below are discussion guides for your clinician, built only from evidence with at least 3 occurrences across 2 different sources. They are never a diagnosis.
          </p>
        </div>

        {/* Refresh bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Sparkles size={18} color="#0F766E" />
            <span className="section-title">Your Insights</span>
            {data?.stale && <span className="badge badge-warning">Out of date — refresh for the latest</span>}
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing || status === "loading"}
            style={{ gap: "6px" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh insights"}
          </button>
        </div>

        {refreshNote && (
          <div className="alert alert-warning" style={{ fontSize: "13px" }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} /> {refreshNote}
          </div>
        )}

        {status === "loading" && (
          <div className="alert alert-info" style={{ fontSize: "13px" }}>
            <Sparkles size={16} /> Loading your insights…
          </div>
        )}

        {status === "unavailable" && (
          <div className="alert alert-danger" style={{ fontSize: "13px" }}>
            <WifiOff size={16} style={{ flexShrink: 0 }} /> Insights temporarily unavailable. The AI service is down right now — please try again in a moment.
          </div>
        )}

        {status === "rate_limited" && (
          <div className="alert alert-warning" style={{ fontSize: "13px" }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} /> You have hit the insights rate limit. Please wait a bit before trying again.
          </div>
        )}

        {status === "error" && (
          <div className="alert alert-danger" style={{ fontSize: "13px" }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} /> Could not load insights. Please refresh the page.
          </div>
        )}

        {data && (
          <>
            {data.insights.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {data.insights.map(insight => (
                  <EvidenceCard
                    key={insight.id}
                    title={insight.title}
                    body={insight.observation}
                    discussionPoints={insight.discussion_points}
                    questions={insight.questions_for_clinician}
                    confidence={insight.confidence}
                    lowConfidence={insight.low_confidence}
                    evidenceSummary={insight.evidence_summary}
                    excerpts={insight.evidence}
                    provider={insight.provider}
                  />
                ))}
              </div>
            )}

            {data.gated_out.length > 0 && (
              <div className="card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <Hourglass size={16} color="var(--text-muted)" />
                  <span className="section-title">Building evidence</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                  These patterns need more logged data before an insight can be generated — no AI output is shown until the evidence gate is met.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data.gated_out.map(g => (
                    <div key={g.theme} style={{ padding: "10px 14px", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-secondary)" }}>
                      {gatedOutLabel(g)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.insights.length === 0 && data.gated_out.length === 0 && (
              <div className="card" style={{ padding: "24px", color: "var(--text-muted)", fontSize: "13px" }}>
                No insights yet. Log your tracker, complete the survey, upload reports, or write your story — patterns will appear here once there is enough evidence.
              </div>
            )}
          </>
        )}

        {/* CTA to Integrative Explorer */}
        <div style={{ padding: "28px 32px", borderRadius: "20px", background: "linear-gradient(135deg, #0F766E 0%, #0D9488 60%, #14B8A6 100%)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <Sparkles size={20} color="white" />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Next Step</span>
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: 800, color: "white", letterSpacing: "-0.02em", marginBottom: "8px" }}>
              Explore Integrative Treatment Options
            </h3>
            <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.8)", lineHeight: 1.6, maxWidth: "500px", marginBottom: "20px" }}>
              Based on your symptoms and analysis, discover which healthcare systems (Allopathy, Ayurveda, Homeopathy, Naturopathy, Siddha) may be relevant for you — along with verified practitioner recommendations.
            </p>
            <Link href="/integrative" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "12px", background: "white", color: "#0F766E", fontWeight: 700, fontSize: "14px", textDecoration: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
              Explore Integrative Treatments <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className="alert alert-warning" style={{ fontSize: "12px" }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          All insights are generated from your personal health data and should not be considered medical diagnoses. Please consult a qualified healthcare professional for medical advice.
        </div>
      </div>
    </AppLayout>
  );
}
