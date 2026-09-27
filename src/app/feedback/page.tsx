"use client";
import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { Star, Check, AlertCircle, Shield, Send, ChevronDown } from "lucide-react";
import Link from "next/link";
import { backendJSON } from "@/lib/backend";

type FeedbackStep = "select" | "rate" | "review" | "done";

type FeedbackHistoryItem = {
  system: string;
  doctor_name: string;
  rating: number;
  review?: string;
  created_at?: string;
};

const healthcareSystems = ["Allopathy", "Ayurveda", "Siddha", "Homeopathy", "Naturopathy"];

function StarRating({ value, onChange, size = 28 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: "flex", gap: "6px" }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(0)} onClick={() => onChange(i)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", lineHeight: 1 }}>
          <Star size={size} color="#F59E0B" fill={(hovered || value) >= i ? "#F59E0B" : "none"} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function SliderRating({ label, value, onChange, color = "#0F766E" }: { label: string; value: number; onChange: (v: number) => void; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>{label}</label>
        <span style={{ fontSize: "14px", fontWeight: 800, color }}>{value}/10</span>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color, height: "6px", cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)" }}>
        <span>Poor</span><span>Excellent</span>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const [step, setStep] = useState<FeedbackStep>("select");
  const [system, setSystem] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [rating, setRating] = useState(0);
  const [helpfulness, setHelpfulness] = useState(7);
  const [communication, setCommunication] = useState(7);
  const [followUp, setFollowUp] = useState(7);
  const [satisfaction, setSatisfaction] = useState(7);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [history, setHistory] = useState<FeedbackHistoryItem[]>([]);

  const ratingLabels = ["", "Very Poor", "Poor", "Below Average", "Average", "Good", "Very Good", "Great", "Excellent", "Outstanding", "Perfect"];

  const loadHistory = async () => {
    try {
      const data = await backendJSON<FeedbackHistoryItem[]>("/api/doctor-feedback");
      setHistory(data);
    } catch {}
  };

  useEffect(() => { loadHistory(); }, []);

  const handleSubmit = async () => {
    if (!system || !doctorName || rating === 0) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await backendJSON("/api/doctor-feedback", {
        method: "POST",
        body: JSON.stringify({
          doctor_name: doctorName,
          system,
          rating,
          helpfulness,
          communication,
          follow_up: followUp,
          satisfaction,
          review,
        }),
      });
      setStep("done");
      loadHistory();
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title="Treatment Feedback" subtitle="Help improve community insights by sharing your consultation experience">
      <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Privacy notice */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", borderRadius: "12px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <Shield size={14} color="#22C55E" />
          <span style={{ fontSize: "12px", color: "#15803D", fontWeight: 500 }}>
            Your feedback is completely anonymous. No personally identifiable information is stored. It helps other users with similar profiles.
          </span>
        </div>

        {step === "done" ? (
          <div className="card" style={{ padding: "60px 40px", textAlign: "center" }}>
            <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Check size={32} color="#22C55E" />
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "10px" }}>Thank you for your feedback!</h2>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "28px" }}>
              Your anonymous experience has been added to our community insights. It will help others with similar health profiles make informed decisions about their care journey.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
              <button className="btn btn-secondary" onClick={() => { setStep("select"); setRating(0); setSystem(""); setDoctorName(""); setReview(""); }}>Submit Another</button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress */}
            <div style={{ display: "flex", gap: "8px" }}>
              {[{ key: "select", label: "1. Select" }, { key: "rate", label: "2. Rate" }, { key: "review", label: "3. Review" }].map((s, i) => {
                const idx = ["select", "rate", "review"].indexOf(step);
                const thisIdx = i;
                return (
                  <div key={s.key} style={{ flex: 1, padding: "10px", borderRadius: "10px", textAlign: "center", fontSize: "12px", fontWeight: 700,
                    background: thisIdx <= idx ? "rgba(15,118,110,0.08)" : "var(--background)",
                    color: thisIdx <= idx ? "#0F766E" : "var(--text-muted)",
                    border: `1px solid ${thisIdx <= idx ? "rgba(15,118,110,0.3)" : "var(--border)"}` }}>
                    {thisIdx < idx ? "✓ " : ""}{s.label}
                  </div>
                );
              })}
            </div>

            {/* Step 1: Select system & doctor */}
            {step === "select" && (
              <div className="card" style={{ padding: "32px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>Which consultation are you reviewing?</h2>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>Select the healthcare system and enter the practitioner's name.</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div className="form-group">
                    <label className="form-label">Healthcare System</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                      {healthcareSystems.map(sys => (
                        <button key={sys} onClick={() => setSystem(sys)} style={{
                          padding: "10px 20px", borderRadius: "100px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                          border: `2px solid ${system === sys ? "#0F766E" : "var(--border)"}`,
                          background: system === sys ? "rgba(15,118,110,0.08)" : "var(--surface)",
                          color: system === sys ? "#0F766E" : "var(--text-secondary)",
                          fontFamily: "'Inter', sans-serif", transition: "all 0.2s"
                        }}>{sys}</button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Practitioner Name (optional)</label>
                    <input className="form-input" placeholder="e.g. Dr. Ramesh Nair" value={doctorName} onChange={e => setDoctorName(e.target.value)} />
                  </div>

                  <button className="btn btn-primary" style={{ alignSelf: "flex-end" }} disabled={!system} onClick={() => setStep("rate")}>
                    Next: Rate your experience →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Ratings */}
            {step === "rate" && (
              <div className="card" style={{ padding: "32px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                  <span style={{ padding: "4px 14px", borderRadius: "100px", background: "rgba(15,118,110,0.1)", fontSize: "12px", fontWeight: 700, color: "#0F766E" }}>{system}</span>
                  {doctorName && <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>{doctorName}</span>}
                </div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>Rate your experience</h2>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "28px" }}>Your honest ratings help others make informed decisions.</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "10px" }}>Overall Rating</div>
                    <StarRating value={rating} onChange={setRating} size={32} />
                    {rating > 0 && <div style={{ fontSize: "13px", color: "#F59E0B", fontWeight: 700, marginTop: "8px" }}>{ratingLabels[rating]}</div>}
                  </div>

                  <div style={{ height: "1px", background: "var(--border)" }} />

                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <SliderRating label="Helpfulness of Consultation" value={helpfulness} onChange={setHelpfulness} />
                    <SliderRating label="Doctor Communication" value={communication} onChange={setCommunication} color="#3B82F6" />
                    <SliderRating label="Would Recommend Follow-up" value={followUp} onChange={setFollowUp} color="#8B5CF6" />
                    <SliderRating label="Overall Satisfaction" value={satisfaction} onChange={setSatisfaction} color="#22C55E" />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <button className="btn btn-secondary" onClick={() => setStep("select")}>← Back</button>
                    <button className="btn btn-primary" disabled={rating === 0} onClick={() => setStep("review")}>Next: Written Review →</button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Written review */}
            {step === "review" && (
              <div className="card" style={{ padding: "32px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>Share your experience (optional)</h2>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>Describe your consultation in your own words. This helps others understand what to expect.</p>

                {/* Summary of ratings */}
                <div style={{ padding: "16px", borderRadius: "12px", background: "var(--background)", border: "1px solid var(--border)", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <StarRating value={rating} onChange={() => {}} size={16} />
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{ratingLabels[rating]}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {[{ label: "Helpfulness", val: helpfulness }, { label: "Communication", val: communication }, { label: "Follow-up", val: followUp }, { label: "Satisfaction", val: satisfaction }].map(r => (
                      <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
                        <span style={{ fontWeight: 700, color: "#0F766E" }}>{r.val}/10</span>
                      </div>
                    ))}
                  </div>
                </div>

                <textarea className="form-input" placeholder="e.g. The doctor was very attentive and took my concerns seriously. The treatment plan was clear and I noticed improvements after 3 weeks..." style={{ minHeight: "140px" }} value={review} onChange={e => setReview(e.target.value)} maxLength={500} />
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "right", marginTop: "4px" }}>{review.length}/500</div>

                <div className="alert alert-info" style={{ fontSize: "12px", marginTop: "12px" }}>
                  <AlertCircle size={12} style={{ flexShrink: 0 }} />
                  Your review will be anonymized before being used in community insights. No personal details will be visible.
                </div>

                {submitError && (
                  <div className="alert alert-warning" style={{ fontSize: "12px", marginTop: "12px" }}>
                    <AlertCircle size={12} style={{ flexShrink: 0 }} />
                    Could not submit feedback. Please try again.
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
                  <button className="btn btn-secondary" onClick={() => setStep("rate")}>← Back</button>
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting} style={{ minWidth: "160px" }}>
                    {submitting ? "Submitting..." : <><Send size={14} /> Submit Feedback</>}
                  </button>
                </div>
              </div>
            )}

            {/* Past feedback history */}
            <div className="card" style={{ padding: "24px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>Your Feedback History</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {history.length === 0 && <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>No feedback submitted yet.</p>}
                {history.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--background)" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(15,118,110,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>
                      {f.system === "Ayurveda" ? "🌿" : f.system === "Allopathy" ? "🏥" : "⚗️"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{f.doctor_name}</span>
                        <span style={{ padding: "2px 8px", borderRadius: "100px", background: "rgba(15,118,110,0.1)", fontSize: "10px", fontWeight: 700, color: "#0F766E" }}>{f.system}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{f.created_at ? new Date(f.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>{f.review || `${ratingLabels[f.rating]} experience with ${f.doctor_name}.`}</div>
                    </div>
                    <div style={{ display: "flex", gap: "2px" }}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} size={12} color="#F59E0B" fill={j < Math.round(f.rating / 2) ? "#F59E0B" : "none"} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
