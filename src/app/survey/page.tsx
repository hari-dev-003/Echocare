"use client";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, ChevronLeft, Check, Save, User, Stethoscope, FileText, AlertCircle, Loader2 } from "lucide-react";
import { markSurveyCompleted } from "@/lib/auth";
import { backendJSON } from "@/lib/backend";

const steps = [
  { label: "About You", icon: User, color: "#0F766E" },
  { label: "Main Concern", icon: Stethoscope, color: "#3B82F6" },
  { label: "Care Context", icon: FileText, color: "#F59E0B" },
];

type SurveyData = Record<string, string | string[]>;

const initialData: SurveyData = {
  name: "", email: "", age: "", gender: "", height: "", weight: "", occupation: "", dailyRoutine: "", travelTime: "",
  symptoms: [], mainConcern: "", symptomDetails: "", symptomSeverity: "", symptomDuration: "", symptomFrequency: "", careGoal: "",
  sleepHours: "", sleepQuality: "", diet: "", exercise: "", waterIntake: "", smoking: "", alcohol: "",
  stressLevel: "", mood: "", anxiety: "", emotionalConcerns: "",
  existingDiseases: [], previousConsultations: "", currentMedication: "", previousReports: "",
};

const symptomSuggestions = [
  "Pain", "Tiredness", "Stomach / acidity", "Breathing", "Sleep", "Periods / hormones",
  "Skin", "Headache", "Dizziness", "Mood / stress", "Weight change", "Other",
];

function SurveyOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <div
      className={`survey-option ${selected ? "selected" : ""}`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <div className="survey-radio">
        {selected && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "white" }} />}
      </div>
      <span style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function MultiSelectChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "9px 16px", borderRadius: "10px", cursor: "pointer", fontSize: "13px",
        fontWeight: 600, transition: "all 0.2s", userSelect: "none",
        border: `1.5px solid ${selected ? "#0F766E" : "var(--border)"}`,
        background: selected ? "rgba(15,118,110,0.08)" : "var(--surface)",
        color: selected ? "#0F766E" : "var(--text-secondary)",
      }}
    >
      {selected && "✓ "}{label}
    </div>
  );
}

export default function SurveyPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<SurveyData>(initialData);
  const [autoSaved, setAutoSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load survey from MongoDB on mount (fallback to localStorage)
  useEffect(() => {
    async function loadSurvey() {
      const loginProfile = {
        ...(user?.name ? { name: user.name } : {}),
        ...(user?.email ? { email: user.email } : {}),
      };
      // Pre-fill name from logged-in user
      if (Object.keys(loginProfile).length > 0) setData(prev => ({ ...prev, ...loginProfile }));

      try {
        const json = await backendJSON<{ survey_data: SurveyData | null }>("/api/survey");
        if (json?.survey_data) {
          const merged = { ...json.survey_data, ...loginProfile };
          setData(prev => ({ ...prev, ...merged }));
          // Mirror to localStorage for offline fallback (backend wins over cache)
          localStorage.setItem("echocare-survey", JSON.stringify(merged));
          return;
        }
      } catch {}

      // Fallback: load from localStorage if backend unavailable
      const saved = localStorage.getItem("echocare-survey");
      if (saved) {
        try { setData(prev => ({ ...prev, ...JSON.parse(saved), ...loginProfile })); } catch {}
      }
    }
    loadSurvey();
  }, [user]);

  // Debounced auto-save to MongoDB. `isRetry` limits this to a single retry attempt.
  const saveToBackend = useCallback(async (updated: SurveyData, isRetry = false) => {
    setSaving(true);
    try {
      await backendJSON("/api/survey", {
        method: "POST",
        body: JSON.stringify({ survey_data: updated }),
      });
      // Only cache locally once the backend confirms the save.
      localStorage.setItem("echocare-survey", JSON.stringify(updated));
      setSaveError(false);
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    } catch {
      setAutoSaved(false);
      setSaveError(true);
      if (!isRetry) {
        setTimeout(() => saveToBackend(updated, true), 800);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const update = (key: string, val: string | string[]) => {
    const updated = { ...data, [key]: val };
    setData(updated);
    // Debounce — wait 800ms after last keystroke before saving
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToBackend(updated), 800);
  };

  const toggleMulti = (key: string, val: string) => {
    const current = (data[key] as string[]) || [];
    const updated = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
    update(key, updated);
  };

  const isSelected = (key: string, val: string) => {
    const arr = data[key];
    return Array.isArray(arr) ? arr.includes(val) : arr === val;
  };

  const handleFinish = async () => {
    setSubmitted(true);
    try {
      // Final save to MongoDB
      await backendJSON("/api/survey", {
        method: "POST",
        body: JSON.stringify({ survey_data: data }),
      });
      localStorage.setItem("echocare-survey", JSON.stringify(data));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
    markSurveyCompleted();
    if (user) login({ ...user, surveyCompleted: true });
    setTimeout(() => router.push("/story"), 1200);
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  const stepContent = [
    // Step 0 — Personal Details
    <div key="personal" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div className="form-group">
          <label className="form-label">Full Name</label>
          <input className="form-input" placeholder="Your full name" value={data.name as string} onChange={e => update("name", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Login Email</label>
          <input className="form-input" placeholder="Signed-in email" value={data.email as string} onChange={e => update("email", e.target.value)} readOnly style={{ background: "var(--background)", color: "var(--text-muted)" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div className="form-group">
          <label className="form-label">Age</label>
          <input className="form-input" type="number" placeholder="e.g. 32" value={data.age as string} onChange={e => update("age", e.target.value)} min={1} max={120} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div className="form-group">
          <label className="form-label">Gender</label>
          <select className="form-input" value={data.gender as string} onChange={e => update("gender", e.target.value)}>
            <option value="">Select gender</option>
            <option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Occupation</label>
          <input className="form-input" placeholder="e.g. Software Engineer" value={data.occupation as string} onChange={e => update("occupation", e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">What kind of daily routine do you have?</label>
        <input className="form-input" placeholder="e.g. desk job, homemaker, student, night shifts, field work" value={data.dailyRoutine as string} onChange={e => update("dailyRoutine", e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Daily travel time</label>
        <select className="form-input" value={data.travelTime as string} onChange={e => update("travelTime", e.target.value)}>
          <option value="">Select travel time</option>
          <option>No regular travel</option>
          <option>Less than 30 minutes/day</option>
          <option>30–60 minutes/day</option>
          <option>1–2 hours/day</option>
          <option>More than 2 hours/day</option>
          <option>Varies a lot</option>
        </select>
      </div>
    </div>,

    // Step 1 — Symptoms
    <div key="symptoms" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="form-group">
        <label className="form-label">In your own words, what is bothering you most?</label>
        <textarea
          className="form-input"
          placeholder="Example: Burning acidity after meals, bloating, and discomfort that makes it hard to focus at work."
          style={{ minHeight: "110px" }}
          value={data.mainConcern as string}
          onChange={e => update("mainConcern", e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Optional quick tags</label>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>Pick any that help, or skip this and keep your own description above.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
          {symptomSuggestions.map(s => (
            <MultiSelectChip key={s} label={s} selected={isSelected("symptoms", s)} onClick={() => toggleMulti("symptoms", s)} />
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">How much is it affecting your day?</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {["Manageable — I can continue most activities", "Disruptive — it affects work, sleep, food, or movement", "Severe — I need help urgently or cannot function normally"].map(opt => (
            <SurveyOption key={opt} label={opt} selected={data.symptomSeverity === opt} onClick={() => update("symptomSeverity", opt)} />
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div className="form-group">
          <label className="form-label">How long has this been happening?</label>
          <select className="form-input" value={data.symptomDuration as string} onChange={e => update("symptomDuration", e.target.value)}>
            <option value="">Select duration</option>
            <option>Today / a few days</option><option>Less than 1 month</option><option>1–3 months</option><option>3–6 months</option>
            <option>6–12 months</option><option>More than 1 year</option><option>It comes and goes</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">What pattern do you notice?</label>
          <select className="form-input" value={data.symptomFrequency as string} onChange={e => update("symptomFrequency", e.target.value)}>
            <option value="">Select pattern</option>
            <option>Constant</option><option>Comes and goes</option><option>After food</option>
            <option>Morning or night</option><option>After activity</option><option>During stress</option><option>Not sure yet</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">What makes it better or worse? (optional)</label>
        <textarea
          className="form-input"
          placeholder="Example: Worse after tea or late dinner. Slightly better with acidity tablets."
          style={{ minHeight: "84px" }}
          value={data.symptomDetails as string}
          onChange={e => update("symptomDetails", e.target.value)}
        />
      </div>
    </div>,

    // Step 2 — Care Context
    <div key="context" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="form-group">
        <label className="form-label">What do you want help with first?</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {["Understand what may be connected", "Prepare better questions for a doctor", "Track patterns before deciding next step", "Find the right department or specialist"].map(opt => (
            <SurveyOption key={opt} label={opt} selected={data.careGoal === opt} onClick={() => update("careGoal", opt)} />
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Any known conditions? (optional)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {["None", "Diabetes", "Blood pressure", "Thyroid", "Asthma", "Heart condition", "Autoimmune", "Pregnancy / postpartum", "Other"].map(s => (
            <MultiSelectChip key={s} label={s} selected={isSelected("existingDiseases", s)} onClick={() => toggleMulti("existingDiseases", s)} />
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Doctors, medicines, or reports so far? (optional)</label>
        <textarea className="form-input" placeholder="Example: Family doctor gave acidity tablets. Blood test normal. X-ray showed no major issue." style={{ minHeight: "96px" }} value={data.previousConsultations as string} onChange={e => update("previousConsultations", e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Anything important we did not ask?</label>
        <textarea className="form-input" placeholder="Food triggers, period changes, family history, work stress, travel, allergies, or anything else." style={{ minHeight: "80px" }} value={data.previousReports as string} onChange={e => update("previousReports", e.target.value)} />
      </div>
      <div className="alert alert-success" style={{ fontSize: "13px" }}>
        <Check size={14} style={{ flexShrink: 0 }} />
        You&apos;re almost done! After submitting, EchoCare will take you to the AI Patient Story Analyzer to capture your health journey in detail.
      </div>
    </div>,
  ];

  return (
    <AppLayout title="Initial Health Survey" subtitle="A short, human-first check-in before your story analysis">
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        {/* Progress Header */}
        <div style={{ marginBottom: "32px" }}>
          {/* Step indicators */}
          <div style={{ display: "flex", gap: "0", marginBottom: "20px", position: "relative" }}>
            <div style={{ position: "absolute", top: "20px", left: "40px", right: "40px", height: "2px", background: "var(--border-light)", zIndex: 0 }} />
            <div style={{ position: "absolute", top: "20px", left: "40px", height: "2px", background: "linear-gradient(90deg, #0F766E, #14B8A6)", zIndex: 1, transition: "width 0.5s ease", width: `${(currentStep / (steps.length - 1)) * (100 - (80 / steps.length))}%` }} />
            {steps.map((step, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", position: "relative", zIndex: 2, cursor: i <= currentStep ? "pointer" : "default" }} onClick={() => i <= currentStep && setCurrentStep(i)}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    background: done ? "#0F766E" : active ? "white" : "var(--border-light)",
                    border: active ? "3px solid #0F766E" : done ? "none" : "2px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.3s", boxShadow: active ? "0 0 0 4px rgba(15,118,110,0.15)" : "none"
                  }}>
                    {done ? <Check size={16} color="white" /> : <step.icon size={16} color={active ? step.color : "var(--text-muted)"} />}
                  </div>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: active ? "#0F766E" : done ? "#0F766E" : "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap" }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Step {currentStep + 1} of {steps.length}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saving && <span style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Saving...</span>}
              {!saving && autoSaved && <span style={{ fontSize: "12px", color: "#22C55E", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}><Save size={11} /> Saved</span>}
              {!saving && !autoSaved && saveError && <span style={{ fontSize: "12px", color: "#EF4444", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}><AlertCircle size={11} /> Not saved — retrying</span>}
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{Math.round(progress)}% complete</span>
            </div>
          </div>
          <div className="progress-bar" style={{ height: "6px" }}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "36px" }}>
          <div style={{ marginBottom: "28px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
              {steps[currentStep].label}
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              {["Basic context only. You can skip anything uncomfortable.", "Describe the problem your way. The tags are optional.", "Share only care history that helps the next analysis."][currentStep]}
            </p>
          </div>

          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {stepContent[currentStep]}
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--border)" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
              disabled={currentStep === 0}
              style={{ opacity: currentStep === 0 ? 0.4 : 1 }}
            >
              <ChevronLeft size={16} /> Back
            </button>

            {currentStep < steps.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setCurrentStep(s => s + 1)}>
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleFinish}
                disabled={submitted}
                style={{ background: submitted ? "#22C55E" : "linear-gradient(135deg, #0F766E, #22C55E)", minWidth: "200px" }}
              >
                {submitted ? <><Check size={16} /> Saved! Taking you to Story...</> : <><Check size={16} /> Complete Survey</>}
              </button>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="alert alert-warning" style={{ fontSize: "12px", marginTop: "16px" }}>
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          Your responses are securely stored in your personal MongoDB account and used only to generate personalized AI health insights.
        </div>
      </div>
    </AppLayout>
  );
}
