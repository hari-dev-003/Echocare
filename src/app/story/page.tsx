"use client";
import AppLayout from "@/components/AppLayout";
import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Save, Clock, Paperclip, Stethoscope, Lightbulb, ChevronRight, Sparkles, AlertCircle, Loader2, Check, Edit3, X, Heart, Frown, Activity, Calendar, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getStoredToken } from "@/lib/auth";
import { BACKEND_URL, backendJSON, BackendError } from "@/lib/backend";
import EmergencyBanner, { EmergencyResult } from "@/components/EmergencyBanner";

const tabs = ["Your Story", "Timeline", "Past Consultations", "Attachments"];

interface Analysis {
  detectedSymptoms: string[];
  timeline: string;
  emotionalThemes: string[];
  painPoints: string[];
  lifestylePatterns: string[];
  suggestedDepartments: { dept: string; reason: string; confidence: number }[];
  patternSummary: string;
  urgencyLevel: "low" | "medium" | "high";
  recommendedActions: string[];
  confidenceScore: number;
  sourceTimeline?: TimelineEvent[];
  clinicalGaps?: ClinicalGap[];
}

interface EditableCard {
  title: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  items: string[];
  key: keyof Analysis;
}

interface TimelineEvent {
  week?: string;
  event?: string;
  fatigue?: number;
  jointPain?: number;
  brainFog?: number;
  dizziness?: number;
}

interface ClinicalGap {
  week?: string;
  name?: string;
  date?: string;
  severity?: string;
  discrepancy?: string;
  advice?: string;
  coverage?: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onstart?: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function timelineDescription(item: TimelineEvent) {
  const scores = [
    typeof item.fatigue === "number" ? `Fatigue ${item.fatigue}/10` : "",
    typeof item.jointPain === "number" ? `Joint pain ${item.jointPain}/10` : "",
    typeof item.brainFog === "number" ? `Brain fog ${item.brainFog}/10` : "",
    typeof item.dizziness === "number" ? `Dizziness ${item.dizziness}/10` : "",
  ].filter(Boolean);

  return scores.length > 0 ? scores.join(" · ") : "Timeline point extracted from your story.";
}

interface DoctorFeedbackEntry {
  doctor_name: string;
  system: string;
  review?: string;
  consultation_date?: string;
  created_at?: string;
}

const STORY_KEY = "echocare-story";
const ANALYSIS_KEY = "echocare-story-analysis";
const voiceLanguages = [
  { code: "en-IN", label: "English" },
  { code: "ta-IN", label: "Tamil" },
] as const;

export default function StoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [story, setStory] = useState("");
  const [recording, setRecording] = useState(false);
  const [saved, setSaved] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [surveyContext, setSurveyContext] = useState<Record<string, string | string[]>>({});
  const [analysisError, setAnalysisError] = useState("");
  const [escalation, setEscalation] = useState<EmergencyResult | null>(null);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editedAnalysis, setEditedAnalysis] = useState<Analysis | null>(null);
  const [consultations, setConsultations] = useState<DoctorFeedbackEntry[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState<(typeof voiceLanguages)[number]["code"]>("en-IN");
  const [translatingVoice, setTranslatingVoice] = useState(false);
  const wordCount = story.trim() ? story.trim().split(/\s+/).length : 0;

  // Load story from MongoDB on mount, fallback to localStorage
  useEffect(() => {
    async function loadStory() {
      const savedSurvey = localStorage.getItem("echocare-survey");
      if (savedSurvey) {
        try { setSurveyContext(JSON.parse(savedSurvey)); } catch {}
      }
      try {
        const token = getStoredToken();
        if (token) {
          const res = await fetch(`${BACKEND_URL}/api/story/latest`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            if (json?.story_text) {
              setStory(json.story_text);
              localStorage.setItem(STORY_KEY, json.story_text);
              if (json.analysis) {
                setAnalysis(json.analysis);
                setEditedAnalysis(json.analysis);
                localStorage.setItem(ANALYSIS_KEY, JSON.stringify(json.analysis));
              }
              return;
            }
          }
        }
      } catch {}
      // Fallback to localStorage
      const savedStory = localStorage.getItem(STORY_KEY);
      if (savedStory) setStory(savedStory);
      const savedAnalysis = localStorage.getItem(ANALYSIS_KEY);
      if (savedAnalysis) { try { setAnalysis(JSON.parse(savedAnalysis)); } catch {} }
    }
    loadStory();
    backendJSON<DoctorFeedbackEntry[]>("/api/doctor-feedback")
      .then(setConsultations)
      .catch(() => {});
  }, [user]);

  // Save story text to MongoDB (debounced)
  const saveStoryToBackend = async (text: string) => {
    try {
      const token = getStoredToken();
      if (!token) return;
      await fetch(`${BACKEND_URL}/api/story/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ story_text: text }),
      });
    } catch {}
    localStorage.setItem(STORY_KEY, text);
  };

  const handleStoryChange = (text: string) => {
    setStory(text);
    if (analysis) {
      setAnalysis(null);
      setEditedAnalysis(null);
      localStorage.removeItem(ANALYSIS_KEY);
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveStoryToBackend(text), 1000);
  };

  const handleSave = async () => {
    await saveStoryToBackend(story);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const stopMicStream = () => {
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;
  };

  const translateTamilTranscript = async (transcript: string) => {
    setTranslatingVoice(true);
    setVoiceStatus("Speech received. Translating and polishing to English for analysis...");
    try {
      const response = await fetch("/api/translate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript, sourceLanguage: voiceLanguage }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Translation failed");
      return typeof data.translatedText === "string" && data.translatedText.trim()
        ? data.translatedText.trim()
        : transcript;
    } catch {
      setVoiceError("Speech was captured, but translation/polishing to English failed. The original transcript was added so you can edit it manually.");
      return transcript;
    } finally {
      setTranslatingVoice(false);
      setVoiceStatus(recording ? "Microphone connected. Listening and converting speech to text..." : "");
    }
  };

  const appendVoiceTranscript = async (transcript: string) => {
    const clean = transcript.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const analysisText = await translateTamilTranscript(clean);
    if (analysis) {
      setAnalysis(null);
      setEditedAnalysis(null);
      localStorage.removeItem(ANALYSIS_KEY);
    }
    setStory(prev => {
      const updated = prev.trim() ? `${prev.trim()} ${analysisText}` : analysisText;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveStoryToBackend(updated), 800);
      localStorage.setItem(STORY_KEY, updated);
      return updated;
    });
  };

  const toggleVoice = async () => {
    setVoiceError("");
    setVoiceStatus("");
    setInterimTranscript("");
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      stopMicStream();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionAPI = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setVoiceError("Voice input is not supported in this browser. Please use Chrome or Edge, or type your story below.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Microphone capture is not available in this browser. Please use a recent Chrome or Edge browser.");
      return;
    }
    
    try {
      setVoiceStatus("Checking microphone permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const rec = new SpeechRecognitionAPI();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = voiceLanguage;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setVoiceStatus(voiceLanguage === "ta-IN"
          ? "Microphone connected. Listening in Tamil..."
          : "Microphone connected. Listening and converting speech to text...");
      };
      
      rec.onresult = (event: SpeechRecognitionEventLike) => {
        let finalTranscript = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += ` ${event.results[i][0].transcript}`;
          } else {
            interim += ` ${event.results[i][0].transcript}`;
          }
        }
        setInterimTranscript(interim.trim());
        void appendVoiceTranscript(finalTranscript);
      };

      rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
        if (event.error === "not-allowed") {
          setVoiceError("Microphone access was denied. Click the lock icon in the address bar, allow microphone access, then try again.");
        } else if (event.error === "network") {
          setVoiceError("Your microphone is available, but the browser speech-to-text service is blocked or offline. Try Chrome/Edge with speech services allowed, or type the story and click Analyze with AI.");
        } else if (event.error === "no-speech") {
          setVoiceError("No speech detected. Please speak clearly after pressing the mic button.");
        } else {
          setVoiceError(`Voice input error: ${event.error}. Please try again or type your story manually.`);
        }
        setRecording(false);
        setVoiceStatus("");
        setInterimTranscript("");
        stopMicStream();
      };

      rec.onend = () => {
        setRecording(false);
        setVoiceStatus("");
        setInterimTranscript("");
        stopMicStream();
      };

      rec.start();
      recognitionRef.current = rec;
      setRecording(true);
    } catch (err) {
      console.error("Speech initiation failed:", err);
      setVoiceError(err instanceof DOMException && err.name === "NotAllowedError"
        ? "Microphone access was denied. Allow microphone permission in the browser and try again."
        : "Could not start microphone capture. Check that your mic is connected and not being used by another app.");
      setRecording(false);
      setVoiceStatus("");
      stopMicStream();
    }
  };

  const handleAnalyze = async () => {
    if (story.trim().length < 30) {
      setAnalysisError("Please write at least a few sentences about your health journey.");
      return;
    }
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);
    setEscalation(null);
    try {
      const data = await backendJSON<Analysis | { escalation: EmergencyResult }>("/api/story/analyze", {
        method: "POST",
        body: JSON.stringify({ story_text: story }),
      });
      if ("escalation" in data) {
        // Story is saved by the backend even on an escalation hit; no analysis runs.
        setEscalation(data.escalation);
        return;
      }
      setAnalysis(data);
      setEditedAnalysis(data);
      // Backend already persisted story text + analysis; these are caches only.
      localStorage.setItem(ANALYSIS_KEY, JSON.stringify(data));
      localStorage.setItem(STORY_KEY, story);
    } catch (err) {
      if (err instanceof BackendError && err.status === 503) {
        setAnalysisError("Analysis temporarily unavailable — your story is saved.");
      } else {
        setAnalysisError("Analysis failed. Please try again.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleProceed = () => {
    const finalAnalysis = editedAnalysis || analysis;
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(finalAnalysis));
    localStorage.setItem(STORY_KEY, story);
    router.push("/insights");
  };

  const updateEditedItem = (key: keyof Analysis, idx: number, val: string) => {
    if (!editedAnalysis) return;
    const arr = [...(editedAnalysis[key] as string[])];
    arr[idx] = val;
    setEditedAnalysis({ ...editedAnalysis, [key]: arr });
  };

  const removeEditedItem = (key: keyof Analysis, idx: number) => {
    if (!editedAnalysis) return;
    const arr = (editedAnalysis[key] as string[]).filter((_, i) => i !== idx);
    setEditedAnalysis({ ...editedAnalysis, [key]: arr });
  };

  const urgencyColor = { low: "#22C55E", medium: "#F59E0B", high: "#EF4444" };

  const displayedTimelineEvents = (analysis?.sourceTimeline ?? []).map((item, index) => ({
    date: item.week ?? `Point ${index + 1}`,
    title: item.event ?? "Symptom update",
    desc: timelineDescription(item),
    type: item.event ? "report" : "start",
  }));

  const editableCards: EditableCard[] = analysis ? [
    { title: "Detected Symptoms", icon: <Activity size={14} />, color: "#EF4444", bg: "rgba(239,68,68,0.08)", items: (editedAnalysis?.detectedSymptoms ?? analysis.detectedSymptoms), key: "detectedSymptoms" },
    { title: "Emotional Themes", icon: <Heart size={14} />, color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", items: (editedAnalysis?.emotionalThemes ?? analysis.emotionalThemes), key: "emotionalThemes" },
    { title: "Pain Points", icon: <Frown size={14} />, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", items: (editedAnalysis?.painPoints ?? analysis.painPoints ?? []), key: "painPoints" },
    { title: "Lifestyle Patterns", icon: <Lightbulb size={14} />, color: "#3B82F6", bg: "rgba(59,130,246,0.08)", items: (editedAnalysis?.lifestylePatterns ?? analysis.lifestylePatterns ?? []), key: "lifestylePatterns" },
  ] : [];

  const surveySummary = [
    { label: "Name", value: surveyContext.name },
    { label: "Occupation", value: surveyContext.occupation },
    { label: "Travel", value: surveyContext.travelTime },
    { label: "Routine", value: surveyContext.dailyRoutine },
    { label: "Main concern", value: surveyContext.mainConcern },
    { label: "Pattern", value: surveyContext.symptomFrequency },
  ].filter(item => typeof item.value === "string" && item.value.trim().length > 0);

  return (
    <AppLayout title="AI Patient Story Analyzer" subtitle="Tell your health journey through voice or text — our AI will extract key insights">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main editor */}
        <div className="lg:col-span-2" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="card" style={{ padding: "28px" }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: "4px", background: "var(--border-light)", padding: "4px", borderRadius: "12px", width: "fit-content", marginBottom: "24px" }}>
              {tabs.map((tab, i) => (
                <button key={i} className={`tab-trigger ${activeTab === i ? "active" : ""}`} onClick={() => setActiveTab(i)} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  {i === 2 && <Stethoscope size={12} />}
                  {i === 3 && <Paperclip size={12} />}
                  {tab}
                </button>
              ))}
            </div>

            {/* Story tab */}
            {activeTab === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {escalation && <EmergencyBanner escalation={escalation} />}

                <div style={{ background: "rgba(15,118,110,0.05)", border: "1px solid rgba(15,118,110,0.15)", borderRadius: "12px", padding: "14px 16px" }}>
                  <p style={{ fontSize: "13px", color: "#0F766E", lineHeight: 1.6 }}>
                    💡 <strong>Tips:</strong> Write or speak freely — include how it started, what makes it better/worse, how it affects your daily life, and your experiences with doctors. The more detail you share, the better the AI analysis.
                  </p>
                </div>

                {surveySummary.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                    {surveySummary.map(item => (
                      <div key={item.label} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "10px", background: "var(--background)" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>{item.label}</div>
                        <div style={{ fontSize: "12px", fontWeight: 650, color: "var(--text-primary)", lineHeight: 1.4 }}>{item.value as string}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Voice recording indicator */}
                {recording && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#EF4444", animation: "pulse 1.5s infinite" }} />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#EF4444" }}>
                        {translatingVoice ? "Translating Tamil speech to English..." : voiceStatus || "Recording... Speak clearly into your microphone"}
                      </span>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: "auto" }} onClick={toggleVoice}>Stop Recording</button>
                    </div>
                    {interimTranscript && (
                      <div style={{ fontSize: "13px", color: "#7F1D1D", lineHeight: 1.5, background: "rgba(255,255,255,0.65)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "8px", padding: "8px 10px" }}>
                        {interimTranscript}
                      </div>
                    )}
                  </div>
                )}

                <textarea
                  className="form-input"
                  style={{ minHeight: "280px", fontSize: "15px", lineHeight: 1.8, resize: "vertical" }}
                  placeholder="Start writing about your health journey... Describe your symptoms, when they started, how they affect your daily life, what doctors have told you, and anything else you want to share."
                  value={story}
                  onChange={e => handleStoryChange(e.target.value)}
                />

                {analysisError && (
                  <div className="alert alert-warning" style={{ fontSize: "13px" }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />{analysisError}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{wordCount} words</span>
                    {saved && <span style={{ fontSize: "12px", color: "#22C55E", fontWeight: 600 }}>✓ Saved to MongoDB</span>}
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <select
                      className="form-input"
                      value={voiceLanguage}
                      disabled={recording || translatingVoice}
                      onChange={e => setVoiceLanguage(e.target.value as (typeof voiceLanguages)[number]["code"])}
                      style={{ width: "118px", height: "36px", fontSize: "12px", fontWeight: 700 }}
                      aria-label="Voice language"
                    >
                      {voiceLanguages.map(language => (
                        <option key={language.code} value={language.code}>{language.label}</option>
                      ))}
                    </select>
                    <button className={`btn btn-sm ${recording ? "btn-danger" : "btn-secondary"}`} onClick={toggleVoice}>
                      {recording ? <MicOff size={14} /> : <Mic size={14} />}
                      {recording ? "Stop Voice" : voiceLanguage === "ta-IN" ? "Speak Tamil" : "Voice Input"}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleSave}>
                      <Save size={14} />{saved ? "Saved!" : "Save Draft"}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={analyzing} style={{ minWidth: "150px" }}>
                      {analyzing ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Analyzing...</> : <><Sparkles size={14} /> Analyze with AI</>}
                    </button>
                  </div>
                </div>

                {/* Inline voice error — no popup alerts */}
                {voiceError && (
                  <div style={{
                    marginTop: "12px", padding: "10px 14px", borderRadius: "10px",
                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                    display: "flex", alignItems: "flex-start", gap: "10px"
                  }}>
                    <AlertCircle size={15} color="#D97706" style={{ flexShrink: 0, marginTop: "1px" }} />
                    <span style={{ fontSize: "13px", color: "#92400E", flex: 1, lineHeight: 1.5 }}>{voiceError}</span>
                    <button onClick={() => setVoiceError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#D97706", padding: "0", flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 1 && (
              <div>
                {displayedTimelineEvents.length === 0 ? (
                  <div style={{ padding: "34px 12px", textAlign: "center", border: "1.5px dashed var(--border)", borderRadius: "14px" }}>
                    <Clock size={28} color="var(--text-muted)" style={{ marginBottom: "10px" }} />
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Your timeline appears after you analyze your story.</div>
                  </div>
                ) : displayedTimelineEvents.map((ev, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-dot" style={{ background: ev.type === "start" ? "#EF4444" : ev.type === "doctor" ? "#0F766E" : "#3B82F6" }}>
                      <Clock size={14} color="white" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>{ev.date}</div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>{ev.title}</div>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{ev.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary btn-sm" onClick={() => router.push("/feedback")}>+ Add Consultation</button>
                </div>
                {consultations.length === 0 ? (
                  <div style={{ padding: "34px 12px", textAlign: "center", border: "1.5px dashed var(--border)", borderRadius: "14px" }}>
                    <Stethoscope size={28} color="var(--text-muted)" style={{ marginBottom: "10px" }} />
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No consultations logged yet — add one via Feedback.</div>
                  </div>
                ) : consultations.map((c, i) => {
                  const dateStr = c.consultation_date || c.created_at;
                  return (
                    <div key={i} className="card" style={{ padding: "20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: "15px", fontWeight: 700 }}>{c.doctor_name}</div>
                          <div style={{ fontSize: "12px", color: "#0F766E", fontWeight: 600 }}>{c.system}</div>
                          {dateStr && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>}
                        </div>
                        <div className="badge badge-muted">{c.system}</div>
                      </div>
                      {c.review && (
                        <div style={{ marginTop: "12px", padding: "10px 12px", background: "var(--background)", borderRadius: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                          📋 {c.review}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 3 && (
              <div className="upload-zone">
                <Paperclip size={32} color="var(--text-muted)" style={{ marginBottom: "12px" }} />
                <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "6px" }}>Attach medical files</div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>Photos, lab reports, prescriptions, or any relevant documents</div>
                <button className="btn btn-primary btn-sm">Choose Files</button>
              </div>
            )}
          </div>

          {/* Editable extraction cards */}
          {analysis && editableCards.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>AI Extracted Information</h3>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Review and edit these cards — your corrections help improve the analysis accuracy.</p>
                </div>
                <div className="badge badge-primary" style={{ fontSize: "11px" }}>Editable</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {editableCards.map(card => (
                  <div key={card.title} className="card" style={{ padding: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: card.bg, display: "flex", alignItems: "center", justifyContent: "center", color: card.color }}>{card.icon}</div>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{card.title}</span>
                      </div>
                      <button onClick={() => setEditingCard(editingCard === card.title ? null : card.title)} style={{ background: "none", border: "none", cursor: "pointer", color: editingCard === card.title ? "#0F766E" : "var(--text-muted)", padding: "4px" }}>
                        <Edit3 size={13} />
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {card.items.map((item, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "100px", background: card.bg, border: `1px solid ${card.color}20` }}>
                          {editingCard === card.title ? (
                            <>
                              <input value={item} onChange={e => updateEditedItem(card.key, idx, e.target.value)} style={{ fontSize: "11px", fontWeight: 600, color: card.color, background: "none", border: "none", outline: "none", width: `${Math.max(item.length, 5)}ch` }} />
                              <button onClick={() => removeEditedItem(card.key, idx)} style={{ background: "none", border: "none", cursor: "pointer", color: card.color, padding: "0", lineHeight: 1 }}>
                                <X size={10} />
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: "11px", fontWeight: 600, color: card.color }}>{item}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Proceed button */}
              <div style={{ marginTop: "20px", padding: "20px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(15,118,110,0.06), rgba(20,184,166,0.04))", border: "1px solid rgba(15,118,110,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Ready to proceed?</div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Your story and extracted insights are saved. Proceed to AI Health Analysis.</div>
                </div>
                <button className="btn btn-primary" onClick={handleProceed} style={{ whiteSpace: "nowrap" }}>
                  View AI Analysis <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="ai-card" style={{ minHeight: "200px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(15,118,110,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={14} color="#0F766E" />
              </div>
              <span style={{ fontSize: "13px", fontWeight: 700 }}>Clinical Story Analysis</span>
              {analysis && <div className="badge badge-success" style={{ marginLeft: "auto", fontSize: "10px" }}>Complete</div>}
            </div>

            {analyzing && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <Loader2 size={28} color="#0F766E" style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Analyzing your story...</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Detecting symptoms, patterns & timelines</div>
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {["Detecting symptoms", "Extracting timeline", "Identifying pain points", "Matching departments"].map((s, i) => (
                    <div key={i} style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "100px", background: "rgba(15,118,110,0.08)", color: "#0F766E", fontWeight: 600 }}>{s}</div>
                  ))}
                </div>
              </div>
            )}

            {!analyzing && !analysis && (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.7 }}>
                Write your health story or use voice input, then click <strong style={{ color: "#0F766E" }}>Analyze with AI</strong> to extract symptoms, timelines, clinical gaps, and suggested departments.
              </div>
            )}

            {analysis && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>Story evidence score</span>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#22C55E" }}>{analysis.confidenceScore}%</span>
                </div>
                <div className="confidence-bar"><div className="confidence-fill" style={{ width: `${analysis.confidenceScore}%` }} /></div>

                <div style={{ padding: "12px 14px", background: "rgba(15,118,110,0.05)", borderRadius: "10px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {analysis.patternSummary}
                </div>

                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Timeline</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, display: "flex", gap: "8px" }}>
                    <Calendar size={12} color="#0F766E" style={{ flexShrink: 0, marginTop: "2px" }} />
                    {analysis.timeline}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Suggested Departments</div>
                  {analysis.suggestedDepartments.slice(0, 2).map((d, i) => (
                    <div key={i} style={{ padding: "10px 12px", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border)", marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F766E" }}>🏥 {d.dept}</span>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#22C55E" }}>{d.confidence}%</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>{d.reason}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "10px 14px", borderRadius: "10px", border: `1px solid ${urgencyColor[analysis.urgencyLevel]}25`, background: `${urgencyColor[analysis.urgencyLevel]}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>Urgency Level</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: urgencyColor[analysis.urgencyLevel], textTransform: "capitalize" }}>{analysis.urgencyLevel}</span>
                </div>
              </div>
            )}
          </div>

          {analysis && (
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px" }}>Recommended Next Steps</div>
              {analysis.recommendedActions.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < analysis.recommendedActions.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "rgba(15,118,110,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
                    <Check size={11} color="#0F766E" />
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{a}</span>
                </div>
              ))}
              <button className="btn btn-primary btn-sm" style={{ width: "100%", marginTop: "14px" }} onClick={handleProceed}>
                <ChevronRight size={13} /> Proceed to AI Health Analysis
              </button>
            </div>
          )}

          {analysis?.clinicalGaps && analysis.clinicalGaps.length > 0 && (
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px" }}>Clinical Gaps Found</div>
              {analysis.clinicalGaps.slice(0, 3).map((gap, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: i < Math.min(analysis.clinicalGaps?.length ?? 0, 3) - 1 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{gap.name ?? "Reported diagnostic gap"}</span>
                    {gap.week && <span style={{ fontSize: "10px", fontWeight: 700, color: "#0F766E", whiteSpace: "nowrap" }}>{gap.week}</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>{gap.discrepancy ?? gap.severity}</div>
                </div>
              ))}
            </div>
          )}

          {!analysis && (
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "14px" }}>Writing Prompts</div>
              {["When did your symptoms first start?", "Which symptoms bother you most?", "What makes symptoms better or worse?", "How do symptoms affect your daily life?", "What treatments have you tried?"].map((p, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }} onClick={() => setStory(prev => prev + (prev ? "\n\n" : "") + p + " ")}>
                    💬 {p}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="privacy-notice">
            <Lightbulb size={13} color="#15803D" />
            <span>Your story is encrypted and analyzed only to produce your health summary.</span>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </AppLayout>
  );
}
