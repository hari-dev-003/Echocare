"use client";
import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Brain, Activity, Moon, Droplets, Smile, Zap, FileText, Calendar, ChevronRight, AlertCircle, Sparkles, Star, Users, Leaf, Check, ArrowRight, ClipboardList } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { backendJSON } from "@/lib/backend";
import EvidenceCard from "@/components/EvidenceCard";
import type { Excerpt, EvidenceSummary } from "@/components/EvidenceCard";

// Top-3 dashboard insights come straight from GET /api/health-insights
// (LE-RAG, Task 15) — only the fields the compact EvidenceCard needs.
interface DashboardInsight {
  id: string;
  title: string;
  observation: string;
  confidence: number;
  low_confidence: boolean;
  evidence_summary: EvidenceSummary;
  evidence: Excerpt[];
  provider: string;
}

// Tracker docs may be legacy (fatigue/joint_pain/brain_fog/dizziness/water_intake)
// or current (energy/pain/water_glasses). Prefer the current field; fall back to
// the legacy one; never invent a value that wasn't actually logged.
type TrackerLog = Record<string, unknown> & { date: string; mood: string };
const painOf = (log: TrackerLog): number | undefined => {
  const v = log.pain ?? log.joint_pain;
  return v == null ? undefined : Number(v);
};
const waterOf = (log: TrackerLog): number | undefined => {
  const v = log.water_glasses ?? log.water_intake;
  return v == null ? undefined : Number(v);
};
const fatigueOf = (log: TrackerLog): number | undefined => {
  const v = log.fatigue;
  return v == null ? undefined : Number(v);
};
const sleepOf = (log: TrackerLog): number | undefined => {
  const v = log.sleep_hours;
  return v == null ? undefined : Number(v);
};

type SymptomPoint = { day: string; fatigue: number | null; pain: number | null; mood: number | null };
type SleepPoint = { day: string; hours: number | null };
type Metric = { label: string; value: string; max?: string; icon: typeof Zap; color: string; bg: string; trend: string; up: boolean };
type ReportSummary = { name: string; date: string; status: string };

function HealthScoreRing({ score, size = 120 }: { score: number | null; size?: number }) {
  const [animated, setAnimated] = useState(0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score ?? 0), 300);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg viewBox="0 0 100 100" style={{ width: size, height: size, transform: "rotate(-90deg)" }}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle cx="50" cy="50" r={radius} fill="none"
          stroke="url(#scoreGrad)" strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)", filter: "drop-shadow(0 0 6px rgba(15,118,110,0.5))" }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0F766E" /><stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size === 120 ? "28px" : "20px", fontWeight: 900, color: "#0F766E", letterSpacing: "-0.03em" }}>{score == null ? "—" : animated}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>/100</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<{ system: string; doctor: string; date: string; rating: number }[]>([]);

  // Live data states — empty until real tracker/report data arrives; never fake defaults
  const [symptomTrend, setSymptomTrend] = useState<SymptomPoint[]>([]);
  const [sleepTrend, setSleepTrend] = useState<SleepPoint[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [recentReports, setRecentReports] = useState<ReportSummary[]>([]);
  const [topInsights, setTopInsights] = useState<DashboardInsight[]>([]);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [streakCount, setStreakCount] = useState(0);

  // Hidden print state summaries
  const [profileSummary, setProfileSummary] = useState<any>(null);
  const [surveyData, setSurveyData] = useState<any>(null);
  const [storyText, setStoryText] = useState("");
  const [storyAnalysis, setStoryAnalysis] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const survey = localStorage.getItem("echocare-survey");
      if (survey) {
        setSurveyCompleted(true);
        try { setSurveyData(JSON.parse(survey)); } catch {}
      }

      const profile = localStorage.getItem("echocare-profile");
      if (profile) { try { setProfileSummary(JSON.parse(profile)); } catch {} }

      const story = localStorage.getItem("echocare-story");
      if (story) setStoryText(story);

      const analysis = localStorage.getItem("echocare-story-analysis");
      if (analysis) { try { setStoryAnalysis(JSON.parse(analysis)); } catch {} }

      backendJSON<{ system: string; doctor_name: string; rating: number; created_at?: string }[]>("/api/doctor-feedback")
        .then(data => setFeedbackHistory(
          data.slice(0, 3).map(f => ({
            system: f.system,
            doctor: f.doctor_name,
            date: f.created_at ? new Date(f.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "",
            rating: Math.round(f.rating / 2),
          }))
        ))
        .catch(() => {});

      // Top-3 AI insights (LE-RAG). Fails quietly to an empty state — never
      // fabricated data — since the evidence gate may not be met yet, or the
      // AI provider may be unavailable.
      backendJSON<{ insights: DashboardInsight[] }>("/api/health-insights")
        .then(res => setTopInsights(res.insights.slice(0, 3)))
        .catch(() => {});

      // Load recent reports from localStorage
      const localReports = localStorage.getItem("echocare-diagnostic-reports");
      if (localReports) {
        try {
          const parsed = JSON.parse(localReports);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecentReports(parsed.slice(0, 3).map((r: any) => ({
              name: r.name || "Report File",
              date: r.date || r.reportDate || "Recent",
              status: r.status === "analyzed" ? "Analyzed" : "Uploaded"
            })));
          }
        } catch {}
      }

      // Fetch live tracker history
      backendJSON<{ logs: TrackerLog[]; streak: number }>("/api/tracker/history")
          .then(({ logs, streak }) => {
            if (logs.length > 0) {
              setStreakCount(streak);

              // Process symptom trend (last 7 days) — gaps stay gaps, never invented numbers
              const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              const processedSymptoms = logs.slice(0, 7).reverse().map(log => {
                const dateObj = new Date(log.date);
                const dayName = daysOfWeek[dateObj.getDay()];
                return {
                  day: dayName,
                  fatigue: fatigueOf(log) ?? null,
                  pain: painOf(log) ?? null,
                  mood: log.mood === "great" ? 9 : log.mood === "good" ? 7 : log.mood === "okay" ? 5 : log.mood === "low" ? 3 : 2
                };
              });
              if (processedSymptoms.length > 0) setSymptomTrend(processedSymptoms);

              // Process sleep trend (last 7 days)
              const processedSleep = logs.slice(0, 7).reverse().map(log => {
                const dateObj = new Date(log.date);
                const dayName = daysOfWeek[dateObj.getDay()];
                return {
                  day: dayName,
                  hours: sleepOf(log) ?? null
                };
              });
              if (processedSleep.length > 0) setSleepTrend(processedSleep);

              // Calculate averages over whatever was actually logged
              const sleepValues = logs.map(sleepOf).filter((v): v is number => v != null);
              const waterValues = logs.map(waterOf).filter((v): v is number => v != null);
              const avgSleep = sleepValues.length ? (sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1) : null;
              const avgWater = waterValues.length ? Math.round(waterValues.reduce((a, b) => a + b, 0) / waterValues.length) : null;

              // Live health score — missing fields contribute no penalty rather than a guessed one
              const latestLog = logs[0];
              const latestFatigue = fatigueOf(latestLog) ?? 0;
              const latestPain = painOf(latestLog) ?? 0;
              const latestSleep = sleepOf(latestLog) ?? 8.0;
              const score = Math.max(40, Math.min(100, Math.round(100 - (latestFatigue * 3 + latestPain * 3 + Math.abs(8.0 - latestSleep) * 4))));
              setHealthScore(score);

              const latestWater = waterOf(latestLog);
              const latestFatigueRaw = fatigueOf(latestLog);

              // Update metrics
              const updatedMetrics = [
                { label: "Stress Level", value: latestLog.mood === "bad" ? "High" : latestLog.mood === "low" ? "High" : latestLog.mood === "okay" ? "Moderate" : "Low", icon: Zap, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", trend: "Live", up: latestLog.mood !== "bad" },
                { label: "Sleep Quality", value: avgSleep ?? "–", max: "hrs", icon: Moon, color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", trend: "Average", up: avgSleep != null && Number(avgSleep) >= 7 },
                { label: "Water Intake", value: latestWater != null ? String(latestWater) : "–", max: "/8 cups", icon: Droplets, color: "#3B82F6", bg: "rgba(59,130,246,0.08)", trend: avgWater != null ? `Avg: ${avgWater}` : "No data", up: (latestWater ?? 0) >= 6 },
                { label: "Mood", value: latestLog.mood.charAt(0).toUpperCase() + latestLog.mood.slice(1), icon: Smile, color: "#22C55E", bg: "rgba(34,197,94,0.08)", trend: "Latest", up: ["good", "great"].includes(latestLog.mood) },
                { label: "Fatigue Level", value: latestFatigueRaw != null ? `${latestFatigueRaw}/10` : "Not logged", icon: Activity, color: "#EF4444", bg: "rgba(239,68,68,0.08)", trend: "Latest", up: (latestFatigueRaw ?? 0) <= 4 },
              ];
              setMetrics(updatedMetrics);
            }
          })
          .catch(err => console.error("Failed to load logs:", err));
    }
  }, []);

  const generateDoctorPDF = () => {
    window.print();
  };

  return (
    <AppLayout title="Dashboard" subtitle="One view of your entire health journey">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Date + Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={generateDoctorPDF} className="btn btn-secondary btn-sm" style={{ gap: "6px" }}>
              <Sparkles size={13} /> Generate Doctor PDF
            </button>
            <Link href="/tracker" className="btn btn-secondary btn-sm">Log Today</Link>
            <Link href="/reports" className="btn btn-primary btn-sm">Upload Report</Link>
          </div>
        </div>

        {/* Survey prompt banner */}
        {!surveyCompleted && (
          <div style={{ padding: "18px 22px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(15,118,110,0.08), rgba(20,184,166,0.04))", border: "1px solid rgba(15,118,110,0.25)", display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(15,118,110,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ClipboardList size={22} color="#0F766E" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "3px" }}>Complete Your Health Profile</div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Take the initial survey to unlock personalized AI insights and integrative treatment recommendations.</div>
            </div>
            <Link href="/survey" className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }}>Start Survey <ArrowRight size={13} /></Link>
          </div>
        )}

        {/* Health score + metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "20px", alignItems: "stretch" }}>
          <div className="card" style={{ padding: "28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", minWidth: "180px", background: "linear-gradient(135deg, rgba(15,118,110,0.04), rgba(20,184,166,0.02))" }}>
            <HealthScoreRing score={healthScore} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)" }}>Health Score</div>
              {healthScore == null && (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Log today to see your score</div>
              )}
            </div>
          </div>
          {metrics.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "14px" }}>
              {metrics.map((m, i) => (
                <div key={i} className="metric-card">
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <m.icon size={17} color={m.color} />
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                    {m.value}<span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)" }}>{m.max ?? ""}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>{m.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", fontWeight: 700, color: m.up ? "#16A34A" : "#DC2626" }}>
                    {m.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{m.trend}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: "20px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                Log a few days in the <Link href="/tracker" style={{ color: "#0F766E", fontWeight: 600 }}>Daily Tracker</Link> to see trends
              </div>
            </div>
          )}
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "20px" }}>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div className="section-title">Symptom Trend</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>This week</div>
              </div>
              <div style={{ display: "flex", gap: "14px" }}>
                {[{ label: "Fatigue", color: "#0F766E" }, { label: "Pain", color: "#EF4444" }, { label: "Mood", color: "#3B82F6" }].map(l => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: l.color }} />
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {symptomTrend.length === 0 ? (
              <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", color: "var(--text-muted)" }}>
                Log a few days in the <Link href="/tracker" style={{ color: "#0F766E", fontWeight: 600, marginLeft: "4px" }}>Daily Tracker</Link>&nbsp;to see trends
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={symptomTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} domain={[0, 10]} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} />
                <Line type="monotone" dataKey="fatigue" stroke="#0F766E" strokeWidth={2.5} dot={{ fill: "#0F766E", r: 3 }} />
                <Line type="monotone" dataKey="pain" stroke="#EF4444" strokeWidth={2.5} dot={{ fill: "#EF4444", r: 3 }} />
                <Line type="monotone" dataKey="mood" stroke="#3B82F6" strokeWidth={2.5} dot={{ fill: "#3B82F6", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ marginBottom: "20px" }}>
              <div className="section-title">Sleep Quality</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>Weekly logs</div>
            </div>
            {sleepTrend.length === 0 ? (
              <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", color: "var(--text-muted)" }}>
                Log a few days in the <Link href="/tracker" style={{ color: "#0F766E", fontWeight: 600, marginLeft: "4px" }}>Daily Tracker</Link>&nbsp;to see trends
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={sleepTrend}>
                <defs>
                  <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} domain={[0, 10]} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="hours" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#sleepGrad)" dot={{ fill: "#8B5CF6", r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Main widgets row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
          {/* AI Insights */}
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={16} color="#0F766E" />
                <span className="section-title">AI Insights</span>
              </div>
              <Link href="/insights" style={{ fontSize: "12px", color: "#0F766E", textDecoration: "none", fontWeight: 600 }}>View All</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {topInsights.length > 0 ? (
                topInsights.map(insight => (
                  <EvidenceCard
                    key={insight.id}
                    compact
                    title={insight.title}
                    body={insight.observation}
                    confidence={insight.confidence}
                    lowConfidence={insight.low_confidence}
                    evidenceSummary={insight.evidence_summary}
                    excerpts={insight.evidence}
                    provider={insight.provider}
                  />
                ))
              ) : (
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  No insights yet — keep logging to build evidence.
                </div>
              )}
            </div>
          </div>

          {/* Reports */}
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileText size={16} color="#3B82F6" />
                <span className="section-title">Recent Reports</span>
              </div>
              <Link href="/reports" style={{ fontSize: "12px", color: "#0F766E", textDecoration: "none", fontWeight: 600 }}>View All</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {recentReports.length > 0 ? recentReports.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border)" }}>
                  <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText size={13} color="#3B82F6" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{r.date}</div>
                  </div>
                  <div className={`badge badge-${r.status === "Analyzed" ? "success" : "primary"}`} style={{ fontSize: "10px" }}>{r.status}</div>
                </div>
              )) : (
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  No reports uploaded yet — <Link href="/reports" style={{ color: "#0F766E", fontWeight: 600 }}>upload one</Link>.
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions + Streak */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <Calendar size={15} color="#F59E0B" />
                <span className="section-title">Quick Actions</span>
              </div>
              {[
                { label: "Analyze my story", href: "/story", icon: "📝" },
                { label: "Log today's health", href: "/tracker", icon: "📋" },
                { label: "Integrative Explorer", href: "/integrative", icon: "🌿" },
                { label: "Leave feedback", href: "/feedback", icon: "⭐" },
              ].map((a, i) => (
                <Link key={i} href={a.href} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 0", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: "16px" }}>{a.icon}</span>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>{a.label}</span>
                    <ChevronRight size={13} color="var(--text-muted)" />
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ background: "linear-gradient(135deg, #0F766E, #14B8A6)", borderRadius: "16px", padding: "18px", color: "white", textAlign: "center" }}>
              <div style={{ fontSize: "28px", fontWeight: 900 }}>🔥 {streakCount}</div>
              <div style={{ fontSize: "13px", fontWeight: 700 }}>Day Streak!</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.75)", marginTop: "2px" }}>Keep it up</div>
            </div>
          </div>
        </div>

        {/* Integrative Explorer Widget */}
        <div className="card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Leaf size={16} color="#22C55E" />
              <span className="section-title">Integrative Treatment Explorer</span>
              <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "100px", background: "rgba(15,118,110,0.1)", color: "#0F766E" }}>NEW</span>
            </div>
            <Link href="/integrative" style={{ fontSize: "12px", color: "#0F766E", textDecoration: "none", fontWeight: 600 }}>Explore All →</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[
              { name: "Ayurveda", icon: "🌿", color: "#22C55E" },
              { name: "Naturopathy", icon: "🍃", color: "#0F766E" },
            ].map((sys, i) => (
              <Link key={i} href="/integrative" style={{ textDecoration: "none" }}>
                <div style={{ padding: "16px", borderRadius: "12px", background: `${sys.color}08`, border: `1px solid ${sys.color}25`, display: "flex", alignItems: "center", gap: "12px", transition: "all 0.2s", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"}>
                  <div style={{ fontSize: "28px" }}>{sys.icon}</div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{sys.name}</div>
                    <div style={{ fontSize: "12px", color: sys.color, fontWeight: 600 }}>Explore options</div>
                  </div>
                  <ChevronRight size={16} color={sys.color} style={{ marginLeft: "auto" }} />
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: "14px", padding: "10px 14px", borderRadius: "10px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", fontSize: "12px", color: "#1D4ED8" }}>
            ℹ️ AI suggestions are informational only. Discuss with qualified healthcare professionals before making any treatment decisions.
          </div>
        </div>

        {/* Survey Summary + Feedback History */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Survey summary */}
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ClipboardList size={16} color="#8B5CF6" />
                <span className="section-title">Survey Summary</span>
              </div>
              <Link href="/survey" style={{ fontSize: "12px", color: "#0F766E", textDecoration: "none", fontWeight: 600 }}>Update</Link>
            </div>
            {surveyCompleted ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { label: "Profile", status: "Complete", color: "#22C55E" },
                  { label: "Symptoms", status: `${Array.isArray(surveyData?.symptoms) ? surveyData.symptoms.length : 0} logged`, color: "#0F766E" },
                  { label: "Lifestyle", status: "Assessed", color: "#3B82F6" },
                  { label: "Mental Wellbeing", status: "Assessed", color: "#8B5CF6" },
                  { label: "Medical History", status: "Complete", color: "#F59E0B" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{item.label}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: item.color, display: "flex", alignItems: "center", gap: "4px" }}>
                      <Check size={11} /> {item.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>📋</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>Survey not yet completed</div>
                <Link href="/survey" className="btn btn-primary btn-sm">Start Survey</Link>
              </div>
            )}
          </div>

          {/* Feedback history */}
          <div className="card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Star size={16} color="#F59E0B" />
                <span className="section-title">Feedback History</span>
              </div>
              <Link href="/feedback" style={{ fontSize: "12px", color: "#0F766E", textDecoration: "none", fontWeight: 600 }}>Add Feedback</Link>
            </div>
            {feedbackHistory.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {feedbackHistory.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "18px" }}>{f.system === "Ayurveda" ? "🌿" : f.system === "Allopathy" ? "🏥" : f.system === "Naturopathy" ? "🍃" : f.system === "Homeopathy" ? "💊" : "⚗️"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{f.system} · {f.doctor || "Anonymous"}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{f.date}</div>
                    </div>
                    <div style={{ display: "flex", gap: "2px" }}>
                      {Array.from({ length: 5 }).map((_, j) => <Star key={j} size={11} color="#F59E0B" fill={j < f.rating ? "#F59E0B" : "none"} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: "32px", marginBottom: "10px" }}>⭐</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>No feedback yet</div>
                <Link href="/feedback" className="btn btn-secondary btn-sm">Share Experience</Link>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="alert alert-warning" style={{ fontSize: "12px" }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          All AI-generated insights are based solely on your provided information and are not medical diagnoses. Always consult a qualified healthcare professional.
        </div>
      </div>

      {/* Hidden printable medical summary */}
      <div id="print-area">
        <div style={{ borderBottom: "2px solid #0F766E", paddingBottom: "12px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "24px", color: "#0F766E", fontWeight: "bold" }}>ECHO CARE: PATIENT HEALTH BRIEF</h1>
            <p style={{ fontSize: "12px", color: "#666" }}>Generated on {new Date().toLocaleDateString()}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "bold" }}>Health Score: {healthScore}/100</h3>
            <p style={{ fontSize: "12px", color: "#666" }}>Companion AI Platform</p>
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "16px", color: "#0F766E", borderBottom: "1px solid #ddd", paddingBottom: "4px", marginBottom: "8px" }}>Patient Profile</h2>
          <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 0", fontWeight: "bold", width: "15%" }}>Name:</td>
                <td style={{ padding: "4px 0" }}>{user?.name || "Patient"}</td>
                <td style={{ padding: "4px 0", fontWeight: "bold", width: "15%" }}>Date of Birth:</td>
                <td style={{ padding: "4px 0" }}>{profileSummary?.dob || "Not provided"}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 0", fontWeight: "bold" }}>Email:</td>
                <td style={{ padding: "4px 0" }}>{user?.email || "Email"}</td>
                <td style={{ padding: "4px 0", fontWeight: "bold" }}>Gender:</td>
                <td style={{ padding: "4px 0" }}>{profileSummary?.gender || "Not provided"}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 0", fontWeight: "bold" }}>Blood Type:</td>
                <td style={{ padding: "4px 0" }}>{profileSummary?.bloodType || "Not provided"}</td>
                <td style={{ padding: "4px 0", fontWeight: "bold" }}>Height/Weight:</td>
                <td style={{ padding: "4px 0" }}>{profileSummary?.heightWeight || "Not provided"}</td>
              </tr>
              {profileSummary?.emergencyName && (
                <tr>
                  <td style={{ padding: "4px 0", fontWeight: "bold" }}>Emergency:</td>
                  <td style={{ padding: "4px 0" }} colSpan={3}>
                    {profileSummary.emergencyName} ({profileSummary.emergencyPhone}) — {profileSummary.emergencyCity}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {storyText && (
          <div style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", color: "#0F766E", borderBottom: "1px solid #ddd", paddingBottom: "4px", marginBottom: "8px" }}>Patient Health Story</h2>
            <p style={{ fontSize: "12px", lineHeight: 1.5, color: "#333", whiteSpace: "pre-line" }}>{storyText}</p>
          </div>
        )}

        {storyAnalysis && (
          <div style={{ marginBottom: "20px", pageBreakInside: "avoid" }}>
            <h2 style={{ fontSize: "16px", color: "#0F766E", borderBottom: "1px solid #ddd", paddingBottom: "4px", marginBottom: "8px" }}>AI Story Analysis & Clinical Indicators</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", fontSize: "12px" }}>
              <div>
                <p style={{ fontWeight: "bold", color: "#0F766E" }}>Detected Symptoms:</p>
                <ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
                  {storyAnalysis.detectedSymptoms?.map((s: string, idx: number) => <li key={idx}>{s}</li>)}
                </ul>
                <p style={{ fontWeight: "bold", color: "#0F766E", marginTop: "8px" }}>Pain Points / Key Concerns:</p>
                <ul style={{ paddingLeft: "16px", margin: "4px 0" }}>
                  {storyAnalysis.painPoints?.map((p: string, idx: number) => <li key={idx}>{p}</li>)}
                </ul>
              </div>
              <div>
                <p style={{ fontWeight: "bold", color: "#0F766E" }}>Suggested Departments:</p>
                <ul style={{ paddingLeft: "0", listStyle: "none", margin: "4px 0" }}>
                  {storyAnalysis.suggestedDepartments?.map((d: any, idx: number) => (
                    <li key={idx} style={{ marginBottom: "6px" }}>
                      <strong>{d.dept}</strong> ({d.confidence}% confidence)<br />
                      <span style={{ fontSize: "11px", color: "#555" }}>{d.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {storyAnalysis.patternSummary && (
              <div style={{ marginTop: "8px", fontSize: "12px" }}>
                <p style={{ fontWeight: "bold", color: "#0F766E" }}>Clinical Pattern Summary:</p>
                <p style={{ color: "#333", marginTop: "2px" }}>{storyAnalysis.patternSummary}</p>
              </div>
            )}
          </div>
        )}

        {surveyData && (
          <div style={{ marginBottom: "20px", pageBreakInside: "avoid" }}>
            <h2 style={{ fontSize: "16px", color: "#0F766E", borderBottom: "1px solid #ddd", paddingBottom: "4px", marginBottom: "8px" }}>Initial Health Survey Responses</h2>
            <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <tbody>
                {surveyData.mainConcern && (
                  <tr>
                    <td style={{ padding: "4px 0", fontWeight: "bold", width: "25%" }}>Primary Health Concern:</td>
                    <td style={{ padding: "4px 0" }}>{surveyData.mainConcern}</td>
                  </tr>
                )}
                {surveyData.symptoms && (
                  <tr>
                    <td style={{ padding: "4px 0", fontWeight: "bold" }}>Reported Symptoms:</td>
                    <td style={{ padding: "4px 0" }}>
                      {Array.isArray(surveyData.symptoms) ? surveyData.symptoms.join(", ") : String(surveyData.symptoms)}
                    </td>
                  </tr>
                )}
                {surveyData.dailyRoutine && (
                  <tr>
                    <td style={{ padding: "4px 0", fontWeight: "bold" }}>Daily Activity / Routine:</td>
                    <td style={{ padding: "4px 0" }}>{surveyData.dailyRoutine}</td>
                  </tr>
                )}
                {surveyData.sleepQuality && (
                  <tr>
                    <td style={{ padding: "4px 0", fontWeight: "bold" }}>Sleep Quality:</td>
                    <td style={{ padding: "4px 0" }}>{surveyData.sleepQuality}</td>
                  </tr>
                )}
                {surveyData.stressLevel && (
                  <tr>
                    <td style={{ padding: "4px 0", fontWeight: "bold" }}>Stress Levels:</td>
                    <td style={{ padding: "4px 0" }}>{surveyData.stressLevel}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: "40px", borderTop: "1px solid #ddd", paddingTop: "10px", fontSize: "10px", color: "#666", textAlign: "center" }}>
          <p>This document compiles patient-provided logs and AI companion assistance patterns. It does not constitute medical diagnosis, prescription, or clinical decisions.</p>
          <p>EchoCare Companion Platform · www.echocare.org</p>
        </div>
      </div>
    </AppLayout>
  );
}
