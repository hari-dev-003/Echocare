"use client";
import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Calendar, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { backendJSON, BackendError } from "@/lib/backend";

const moods = [
  { emoji: "😊", label: "Great", val: "great" },
  { emoji: "🙂", label: "Good", val: "good" },
  { emoji: "😐", label: "Okay", val: "okay" },
  { emoji: "😔", label: "Low", val: "low" },
  { emoji: "😞", label: "Bad", val: "bad" },
];

const symptoms = ["Fatigue", "Joint Pain", "Headache", "Brain Fog", "Nausea", "Dizziness", "Chest Pain", "Shortness of Breath", "Muscle Weakness", "Digestive Issues"];

type TrackerLogResponse = {
  date: string;
  mood: string;
  symptoms: string[];
  sleep_hours: number;
  water_glasses: number;
  stress: number;
  energy: number;
  pain: number;
  notes: string;
  diet?: string | null;
  activity?: string | null;
  medication?: string | null;
};

const dietOptions = [
  { value: "excellent", label: "Excellent — Healthy balanced meals" },
  { value: "good", label: "Good — Mostly healthy" },
  { value: "average", label: "Average — Some healthy choices" },
  { value: "poor", label: "Poor — Mostly processed food" },
];
const activityOptions = [
  { value: "none", label: "None" },
  { value: "light", label: "Light walk" },
  { value: "moderate", label: "Moderate exercise (30 min)" },
  { value: "intense", label: "Intense workout" },
];
const medicationOptions = [
  { value: "all_taken", label: "Yes, all taken" },
  { value: "missed", label: "Missed dose" },
  { value: "none", label: "No medication" },
  { value: "na", label: "N/A" },
];

type HistoryResponse = { logs: TrackerLogResponse[]; streak: number };

export default function TrackerPage() {
  const [selectedMood, setSelectedMood] = useState("good");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [sleep, setSleep] = useState(7);
  const [water, setWater] = useState(5);
  const [stress, setStress] = useState(4);
  const [energy, setEnergy] = useState(6);
  const [pain, setPain] = useState(3);
  const [notes, setNotes] = useState("");
  const [diet, setDiet] = useState("");
  const [activity, setActivity] = useState("");
  const [medication, setMedication] = useState("");
  const [activeView, setActiveView] = useState<"today" | "week" | "month">("today");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const router = useRouter();

  const [history, setHistory] = useState<TrackerLogResponse[]>([]);
  const [streak, setStreak] = useState(0);

  const loadHistory = () => {
    backendJSON<HistoryResponse>("/api/tracker/history")
      .then(data => {
        setHistory(data.logs);
        setStreak(data.streak);
        const todayStr = new Date().toISOString().split("T")[0];
        const todayLog = data.logs.find(l => l.date === todayStr);
        if (todayLog) {
          setSelectedMood(todayLog.mood);
          setSleep(todayLog.sleep_hours);
          setWater(todayLog.water_glasses);
          setStress(todayLog.stress);
          setEnergy(todayLog.energy);
          setPain(todayLog.pain);
          setNotes(todayLog.notes ?? "");
          setDiet(todayLog.diet ?? "");
          setActivity(todayLog.activity ?? "");
          setMedication(todayLog.medication ?? "");
          setSelectedSymptoms(todayLog.symptoms ?? []);
        }
      })
      .catch(err => console.error("Failed to load logs:", err));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const saveTrackerLog = async (): Promise<boolean> => {
    const payload = {
      mood: selectedMood,
      symptoms: selectedSymptoms,
      sleep_hours: sleep,
      water_glasses: water,
      stress,
      energy,
      pain,
      notes,
      diet: diet || null,
      activity: activity || null,
      medication: medication || null,
      date: new Date().toISOString().split("T")[0],
    };

    setSaving(true);
    setSaveError("");
    try {
      await backendJSON("/api/tracker", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      loadHistory();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (err) {
      setSaveError(err instanceof BackendError ? err.message : "Failed to save check-in. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => saveTrackerLog();

  const handleGenerateInsights = async () => {
    const ok = await saveTrackerLog();
    if (ok) router.push("/insights");
  };

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const SliderInput = ({ label, value, onChange, max, color, suffix }: { label: string; value: number; onChange: (v: number) => void; max: number; color: string; suffix?: string }) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
        <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>{label}</label>
        <span style={{ fontSize: "13px", fontWeight: 700, color }}>{value}{suffix}</span>
      </div>
      <input
        type="range" min={0} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color, height: "4px", cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>0</span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{max}</span>
      </div>
    </div>
  );

  // Last 7 calendar days, populated from real history — no fabricated numbers.
  const moodEmoji: Record<string, string> = { great: "😊", good: "🙂", okay: "😐", low: "😔", bad: "😞" };

  // Current-month calendar grid built from real history — days with a log are highlighted, nothing invented.
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const today = new Date();
  const calYear = today.getFullYear();
  const calMonth = today.getMonth();
  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstWeekdayMon = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // 0 = Monday
  const loggedDates = new Set(history.map(l => l.date));
  const monthCells: (number | null)[] = [
    ...Array.from({ length: firstWeekdayMon }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const iso = d.toISOString().split("T")[0];
    const log = history.find(l => l.date === iso);
    return {
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      isToday: i === 6,
      mood: log ? moodEmoji[log.mood] ?? "•" : null,
      sleep: log ? log.sleep_hours : null,
      stress: log ? log.stress : null,
    };
  });

  return (
    <AppLayout title="Daily Health Tracker" subtitle="Track your health and lifestyle every day">
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* Main form */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Date + View toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button className="btn btn-ghost btn-sm" style={{ padding: "8px" }}><ChevronLeft size={16} /></button>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Calendar size={15} color="#0F766E" />
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ padding: "8px" }}><ChevronRight size={16} /></button>
            </div>
            <div className="tab-list">
              {(["today", "week", "month"] as const).map(v => (
                <button key={v} className={`tab-trigger ${activeView === v ? "active" : ""}`} onClick={() => setActiveView(v)} style={{ textTransform: "capitalize" }}>{v}</button>
              ))}
            </div>
          </div>

          {activeView === "today" && (
            <>
              {/* Mood */}
              <div className="card" style={{ padding: "24px" }}>
                <div className="section-title" style={{ marginBottom: "16px" }}>😊 How are you feeling today?</div>
                <div style={{ display: "flex", gap: "10px" }}>
                  {moods.map(m => (
                    <button key={m.val} className={`mood-btn ${selectedMood === m.val ? "selected" : ""}`} onClick={() => setSelectedMood(m.val)} style={{ flex: 1 }}>
                      <span className="emoji">{m.emoji}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vitals & Sliders */}
              <div className="card" style={{ padding: "24px" }}>
                <div className="section-title" style={{ marginBottom: "20px" }}>📊 Daily Vitals</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
                  <SliderInput label="Sleep Duration" value={sleep} onChange={setSleep} max={12} color="#8B5CF6" suffix=" hrs" />
                  <SliderInput label="Water Intake" value={water} onChange={setWater} max={12} color="#3B82F6" suffix=" cups" />
                  <SliderInput label="Stress Level" value={stress} onChange={setStress} max={10} color="#F59E0B" />
                  <SliderInput label="Energy Level" value={energy} onChange={setEnergy} max={10} color="#22C55E" />
                  <SliderInput label="Pain Level" value={pain} onChange={setPain} max={10} color="#EF4444" />
                </div>
              </div>

              {/* Symptoms */}
              <div className="card" style={{ padding: "24px" }}>
                <div className="section-title" style={{ marginBottom: "16px" }}>🩺 Today&apos;s Symptoms</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
                  {symptoms.map(s => (
                    <button key={s} onClick={() => toggleSymptom(s)} style={{
                      padding: "7px 14px", borderRadius: "100px",
                      border: `1.5px solid ${selectedSymptoms.includes(s) ? "#0F766E" : "var(--border)"}`,
                      background: selectedSymptoms.includes(s) ? "rgba(15,118,110,0.08)" : "var(--surface)",
                      color: selectedSymptoms.includes(s) ? "#0F766E" : "var(--text-secondary)",
                      fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                      fontFamily: "'Inter', sans-serif"
                    }}>{s}</button>
                  ))}
                </div>
                {selectedSymptoms.length > 0 && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {selectedSymptoms.length} symptom{selectedSymptoms.length > 1 ? "s" : ""} selected
                  </div>
                )}
              </div>

              {/* Diet & Medication & Notes */}
              <div className="card" style={{ padding: "24px" }}>
                <div className="section-title" style={{ marginBottom: "16px" }}>📋 Additional Details</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="form-group">
                    <label className="form-label">Diet today</label>
                    <select className="form-input" value={diet} onChange={e => setDiet(e.target.value)}>
                      <option value="">Select diet quality</option>
                      {dietOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Physical activity</label>
                    <select className="form-input" value={activity} onChange={e => setActivity(e.target.value)}>
                      <option value="">Select activity level</option>
                      {activityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Medication taken?</label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {medicationOptions.map(o => {
                        const active = medication === o.value;
                        return (
                          <button key={o.value} type="button" aria-pressed={active}
                            onClick={() => setMedication(active ? "" : o.value)}
                            style={{ padding: "8px 14px", borderRadius: "8px", border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`, background: active ? "rgba(15,118,110,0.06)" : "transparent", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: active ? "var(--primary)" : "var(--text-secondary)", transition: "all 0.2s", fontFamily: "inherit" }}
                          >{o.label}</button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes (optional)</label>
                    <textarea
                      className="form-input"
                      placeholder="Any additional notes about today..."
                      style={{ minHeight: "80px" }}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      maxLength={2000}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "12px 32px", fontSize: "15px" }}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save size={16} />{saving ? "Saving…" : saved ? "✓ Saved!" : "Save Today's Log"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "12px 24px", fontSize: "15px" }}
                    onClick={handleGenerateInsights}
                    disabled={saving}
                  >
                    <Sparkles size={16} /> Generate AI Insights
                  </button>
                </div>
                {saveError && (
                  <div className="alert alert-warning" style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span>{saveError}</span>
                    <button className="btn btn-ghost btn-sm" onClick={handleSave}>Retry</button>
                  </div>
                )}
              </div>
            </>
          )}

          {activeView === "week" && (
            <div className="card" style={{ padding: "24px" }}>
              <div className="section-title" style={{ marginBottom: "20px" }}>Weekly Overview</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px" }}>
                {weekData.map((d, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "8px" }}>{d.day}</div>
                    <div style={{ padding: "12px 8px", borderRadius: "12px", background: d.isToday ? "rgba(15,118,110,0.08)" : "var(--background)", border: `1px solid ${d.isToday ? "#0F766E" : "var(--border)"}` }}>
                      {d.mood ? (
                        <>
                          <div style={{ fontSize: "22px", marginBottom: "6px" }}>{d.mood}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{d.sleep}h</div>
                          <div style={{ fontSize: "11px", color: (d.stress ?? 0) > 5 ? "#F59E0B" : "#22C55E", fontWeight: 600 }}>S:{d.stress}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", padding: "10px 0" }}>No log</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === "month" && (
            <div className="card" style={{ padding: "24px" }}>
              <div className="section-title" style={{ marginBottom: "20px" }}>Monthly Calendar — {monthLabel}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", paddingBottom: "8px" }}>{d}</div>
                ))}
                {monthCells.map((day, i) => {
                  if (day === null) return <div key={`blank-${i}`} />;
                  const dateStr = `${calYear}-${pad2(calMonth + 1)}-${pad2(day)}`;
                  const log = history.find(l => l.date === dateStr);
                  const isToday = day === today.getDate();
                  return (
                    <div key={dateStr} style={{
                      aspectRatio: "1 / 1", padding: "8px 4px", borderRadius: "8px", textAlign: "center",
                      background: log ? "rgba(15,118,110,0.1)" : "transparent",
                      border: `1px solid ${isToday ? "#0F766E" : log ? "rgba(15,118,110,0.4)" : "var(--border)"}`,
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: log ? 700 : 400, color: log ? "#0F766E" : "var(--text-secondary)" }}>{day}</div>
                      {log && <div style={{ fontSize: "14px" }}>{moodEmoji[log.mood] ?? "•"}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: "280px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Today's summary */}
          <div className="card" style={{ padding: "20px" }}>
            <div className="section-title" style={{ marginBottom: "14px" }}>Today&apos;s Summary</div>
            {[
              { label: "Sleep", value: `${sleep} hrs`, color: "#8B5CF6" },
              { label: "Water", value: `${water}/12 cups`, color: "#3B82F6" },
              { label: "Stress", value: `${stress}/10`, color: "#F59E0B" },
              { label: "Energy", value: `${energy}/10`, color: "#22C55E" },
              { label: "Pain", value: `${pain}/10`, color: "#EF4444" },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>{item.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: item.color }}>{item.value}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ background: item.color, width: `${(item.label === "Sleep" ? sleep / 12 : item.label === "Water" ? water / 12 : item.label === "Stress" ? stress / 10 : item.label === "Energy" ? energy / 10 : pain / 10) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Streak */}
          <div style={{ background: "linear-gradient(135deg, #0F766E, #14B8A6)", borderRadius: "16px", padding: "20px", color: "white" }}>
            <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-0.03em" }}>🔥 {streak}</div>
            <div style={{ fontSize: "14px", fontWeight: 700, marginTop: "4px" }}>Day Tracking Streak!</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "4px" }}>Keep it up — you&apos;re doing great.</div>
          </div>

          <div className="privacy-notice">
            <span>🔒</span>
            <span>Your daily logs are encrypted and stored securely.</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
