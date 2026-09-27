"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Heart, Brain, Shield, TrendingUp, ChevronRight, Star, Check, ArrowRight, Stethoscope, Activity, Moon, Zap, Info } from "lucide-react";

// Animated counter hook
function useCounter(end: number, duration: number = 2000, start: boolean = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, duration, start]);
  return count;
}

// Typewriter hook
function useTypewriter(texts: string[], speed: number = 60) {
  const [displayed, setDisplayed] = useState("");
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[textIndex];
    const timeout = setTimeout(() => {
      if (!deleting) {
        setDisplayed(current.slice(0, charIndex + 1));
        if (charIndex + 1 === current.length) {
          setTimeout(() => setDeleting(true), 2000);
        } else {
          setCharIndex(c => c + 1);
        }
      } else {
        setDisplayed(current.slice(0, charIndex - 1));
        if (charIndex === 0) {
          setDeleting(false);
          setTextIndex(i => (i + 1) % texts.length);
        } else {
          setCharIndex(c => c - 1);
        }
      }
    }, deleting ? speed / 2 : speed);
    return () => clearTimeout(timeout);
  }, [charIndex, deleting, textIndex, texts, speed]);

  return displayed;
}

const testimonials = [
  { name: "Priya S.", role: "3 years undiagnosed", text: "EchoCare helped me identify a pattern my doctors missed. I finally got a Rheumatology referral and was diagnosed with fibromyalgia.", avatar: "P" },
  { name: "Rahul M.", role: "Chronic fatigue", text: "After 18 months of 'everything looks normal', EchoCare's AI found a sleep-pain correlation that changed my treatment path completely.", avatar: "R" },
  { name: "Anita K.", role: "Mystery symptoms", text: "The Patient Story feature gave me the language to describe what I was experiencing. My doctor finally took me seriously.", avatar: "A" },
];

const features = [
  { icon: Brain, title: "AI Story Analyzer", desc: "Describe your health in your own words. Our Gemini-powered AI detects patterns, correlations, and suggests medical departments.", color: "#0F766E", bg: "rgba(15,118,110,0.08)" },
  { icon: Activity, title: "Daily Tracking", desc: "Log mood, sleep, pain, and vitals every day. Watch your health story build over time with beautiful visualizations.", color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
  { icon: Stethoscope, title: "Explainable Insights", desc: "Every AI insight shows its evidence. You always know why EchoCare is suggesting what it's suggesting.", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)" },
  { icon: Shield, title: "Private by Design", desc: "Your self-care and vent space have zero reporting trail. Your story is yours — we just help you understand it.", color: "#22C55E", bg: "rgba(34,197,94,0.08)" },
  { icon: TrendingUp, title: "Medical Report AI", desc: "Upload blood tests, MRIs, X-rays. Our AI reads the values, flags borderline results, and explains them in plain language.", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  { icon: Moon, title: "Stress & Self-Care", desc: "Built-in grounding exercises, 4-7-8 breathing, private journaling, and burnout checks — all completely private.", color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
];

const steps = [
  { num: "01", title: "Tell your story", desc: "Write freely about your health, symptoms, and experiences. No medical jargon needed.", icon: "📝" },
  { num: "02", title: "AI finds patterns", desc: "Gemini AI analyzes your story, daily logs, and reports to detect patterns and correlations.", icon: "🧠" },
  { num: "03", title: "Get clear insights", desc: "Receive explainable AI insights with evidence, confidence scores, and department suggestions.", icon: "💡" },
  { num: "04", title: "Walk in prepared", desc: "Go to your next appointment with a clear summary, timeline, and specific questions ready.", icon: "🏥" },
];

export default function LandingPage() {
  const [heroVisible, setHeroVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const typewriter = useTypewriter(["heard.", "understood.", "validated.", "helped."], 70);

  const stories = useCounter(50000, 2000, statsVisible);
  const patterns = useCounter(94, 1500, statsVisible);
  const departments = useCounter(12, 1200, statsVisible);
  const satisfaction = useCounter(98, 1800, statsVisible);

  useEffect(() => {
    setTimeout(() => setHeroVisible(true), 100);
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true); },
      { threshold: 0.3 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#F8FAFC", overflowX: "hidden" }}>
      {/* Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
        background: "rgba(248,250,252,0.85)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(15,118,110,0.1)", padding: "0 max(24px, calc((100vw - 1200px)/2))",
        height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "linear-gradient(135deg, #0F766E, #14B8A6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Heart size={18} color="white" fill="white" />
          </div>
          <span style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.03em" }}>Echo<span style={{ color: "#0F766E" }}>Care</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Link href="/login" style={{ padding: "8px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, color: "#0F766E", textDecoration: "none" }}>Log in</Link>
          <Link href="/signup" style={{ padding: "9px 22px", borderRadius: "10px", fontSize: "14px", fontWeight: 700, color: "white", background: "linear-gradient(135deg, #0F766E, #14B8A6)", textDecoration: "none", boxShadow: "0 4px 14px rgba(15,118,110,0.3)" }}>Get Started →</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: "100px max(24px, calc((100vw - 1100px)/2)) 60px",
        background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(15,118,110,0.12) 0%, transparent 70%)",
        position: "relative", overflow: "hidden"
      }}>
        {/* Background decorations */}
        <div style={{ position: "absolute", top: "15%", right: "8%", width: "420px", height: "420px", borderRadius: "50%", background: "radial-gradient(circle, rgba(20,184,166,0.06), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "5%", width: "300px", height: "300px", borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.05), transparent 70%)", pointerEvents: "none" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center", width: "100%" }}>
          {/* Left — Copy */}
          <div style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s ease" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 16px", borderRadius: "100px", background: "rgba(15,118,110,0.08)", border: "1px solid rgba(15,118,110,0.2)", marginBottom: "24px" }}>
              <Zap size={13} color="#0F766E" fill="#0F766E" />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F766E" }}>Powered by Gemini AI</span>
            </div>

            <h1 style={{ fontSize: "clamp(36px, 5vw, 58px)", fontWeight: 900, color: "#0F172A", letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: "16px" }}>
              Every patient story<br />deserves to be{" "}
              <span style={{ color: "#0F766E", position: "relative" }}>
                {typewriter}
                <span style={{ borderRight: "3px solid #0F766E", marginLeft: "2px", animation: "blink 1s infinite" }} />
              </span>
            </h1>

            <p style={{ fontSize: "18px", color: "#475569", lineHeight: 1.7, marginBottom: "32px", maxWidth: "480px" }}>
              Millions of people are told <em>&quot;your tests are normal&quot;</em> — but they are not fine. EchoCare listens to your complete story, tracks your health daily, and uses AI to find patterns doctors might miss.
            </p>

            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "40px" }}>
              <Link href="/signup" style={{
                padding: "14px 32px", borderRadius: "14px", fontSize: "15px", fontWeight: 700,
                color: "white", background: "linear-gradient(135deg, #0F766E, #14B8A6)",
                textDecoration: "none", display: "flex", alignItems: "center", gap: "8px",
                boxShadow: "0 8px 24px rgba(15,118,110,0.35)", transition: "transform 0.2s"
              }}>
                Start Your Story <ArrowRight size={16} />
              </Link>
            </div>

            <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
              {[{ icon: Shield, text: "HIPAA Aligned" }, { icon: Brain, text: "Gemini AI" }, { icon: Heart, text: "Patient-First" }].map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <b.icon size={13} color="#22C55E" />
                  <span style={{ fontSize: "12px", color: "#64748B", fontWeight: 600 }}>{b.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Floating UI card */}
          <div style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0) rotate(0deg)" : "translateY(30px)", transition: "all 1s ease 0.2s", position: "relative" }}>
            {/* Main dashboard preview card */}
            <div style={{
              background: "white", borderRadius: "24px", padding: "24px",
              boxShadow: "0 32px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
              position: "relative", zIndex: 2
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#EF4444" }} />
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F59E0B" }} />
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ fontSize: "12px", color: "#94A3B8", marginLeft: "8px", fontWeight: 500 }}>EchoCare Dashboard</span>
              </div>

              {/* Health score ring */}
              <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
                <div style={{ position: "relative", width: "80px", height: "80px", flexShrink: 0 }}>
                  <svg viewBox="0 0 80 80" style={{ width: "80px", height: "80px", transform: "rotate(-90deg)" }}>
                    <circle cx="40" cy="40" r="32" fill="none" stroke="#F1F5F9" strokeWidth="8" />
                    <circle cx="40" cy="40" r="32" fill="none" stroke="#0F766E" strokeWidth="8"
                      strokeDasharray="201" strokeDashoffset="54" strokeLinecap="round"
                      style={{ filter: "drop-shadow(0 0 6px rgba(15,118,110,0.4))" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "18px", fontWeight: 900, color: "#0F766E" }}>72</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", marginBottom: "4px" }}>Health Score</div>
                  <div style={{ fontSize: "11px", color: "#64748B", lineHeight: 1.6 }}>Improved +5 pts this week. Sleep and stress are the key drivers.</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "100px", background: "rgba(34,197,94,0.1)", marginTop: "6px" }}>
                    <TrendingUp size={11} color="#16A34A" />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#16A34A" }}>+5 pts</span>
                  </div>
                </div>
              </div>

              {/* Metric pills */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                {[{ label: "Sleep", val: "6.8h", color: "#8B5CF6" }, { label: "Stress", val: "4/10", color: "#F59E0B" }, { label: "Mood", val: "Good", color: "#22C55E" }].map(m => (
                  <div key={m.label} style={{ padding: "10px", borderRadius: "12px", background: "#F8FAFC", textAlign: "center" }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: m.color }}>{m.val}</div>
                    <div style={{ fontSize: "10px", color: "#94A3B8", fontWeight: 600 }}>{m.label}</div>
                  </div>
                ))}
              </div>

              {/* AI insight pill */}
              <div style={{ padding: "12px 14px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(15,118,110,0.06), rgba(20,184,166,0.04))", border: "1px solid rgba(15,118,110,0.12)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Brain size={14} color="#0F766E" />
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F766E" }}>AI Insight</span>
                  <span style={{ fontSize: "10px", color: "#64748B", marginLeft: "auto" }}>87% confidence</span>
                </div>
                <p style={{ fontSize: "12px", color: "#334155", marginTop: "6px", lineHeight: 1.5 }}>
                  Fatigue pattern detected on 18/21 days. Consider Rheumatology referral.
                </p>
              </div>
            </div>

            {/* Floating mini cards */}
            <div style={{
              position: "absolute", top: "-20px", right: "-20px", zIndex: 3,
              background: "white", borderRadius: "16px", padding: "12px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
              animation: "float 3s ease-in-out infinite"
            }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", marginBottom: "4px" }}>AI Detected</div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#0F766E" }}>🏥 Rheumatology</div>
              <div style={{ fontSize: "10px", color: "#94A3B8" }}>87% match</div>
            </div>

            <div style={{
              position: "absolute", bottom: "-16px", left: "-24px", zIndex: 3,
              background: "white", borderRadius: "16px", padding: "12px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
              animation: "float 4s ease-in-out infinite 1s"
            }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", marginBottom: "4px" }}>🔥 14-day streak!</div>
              <div style={{ display: "flex", gap: "3px" }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ width: "18px", height: "18px", borderRadius: "4px", background: i < 5 ? "#0F766E" : "#E2E8F0" }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section ref={statsRef} style={{ padding: "60px max(24px, calc((100vw - 1100px)/2))", background: "linear-gradient(135deg, #0F766E, #0D9488)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.04) 0%, transparent 50%)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "40px", position: "relative" }}>
          {[
            { value: stories.toLocaleString() + "+", label: "Patient Stories", sub: "shared on platform" },
            { value: patterns + "%", label: "Pattern Detection", sub: "accuracy rate" },
            { value: departments + "+", label: "Medical Departments", sub: "in our AI system" },
            { value: satisfaction + "%", label: "User Satisfaction", sub: "would recommend" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 900, color: "white", letterSpacing: "-0.03em" }}>{s.value}</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "rgba(255,255,255,0.9)", marginTop: "4px" }}>{s.label}</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", marginTop: "2px" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Problem Statement */}
      <section style={{ padding: "100px max(24px, calc((100vw - 900px)/2))", textAlign: "center" }}>
        <div style={{ display: "inline-flex", padding: "6px 16px", borderRadius: "100px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", marginBottom: "24px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#EF4444" }}>The Problem We Solve</span>
        </div>
        <blockquote style={{ fontSize: "clamp(18px, 2.5vw, 26px)", fontWeight: 700, color: "#0F172A", lineHeight: 1.5, marginBottom: "32px", fontStyle: "italic", letterSpacing: "-0.01em" }}>
          &quot;I have seen three doctors. Every test comes back normal. I have been told I am fine. But I am <span style={{ color: "#EF4444" }}>not fine</span>. I just cannot prove it, and I don&apos;t know whom to consult next.&quot;
        </blockquote>
        <p style={{ fontSize: "17px", color: "#64748B", lineHeight: 1.7, maxWidth: "620px", margin: "0 auto" }}>
          Millions of people live in a medical <strong style={{ color: "#0F172A" }}>&quot;no man&apos;s land&quot;</strong> — where symptoms are real, but tests appear normal. Current systems aren&apos;t built for them. <strong style={{ color: "#0F766E" }}>EchoCare is.</strong>
        </p>
      </section>

      {/* Features Grid */}
      <section style={{ padding: "80px max(24px, calc((100vw - 1100px)/2))", background: "white" }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em", marginBottom: "12px" }}>
            Everything you need to understand your health
          </h2>
          <p style={{ fontSize: "17px", color: "#64748B", maxWidth: "560px", margin: "0 auto" }}>
            One platform that listens, tracks, analyzes, and guides — designed specifically for people with unexplained symptoms.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          {features.map((f, i) => (
            <div key={i} style={{
              padding: "28px", borderRadius: "20px", border: "1.5px solid #F1F5F9",
              transition: "all 0.3s", cursor: "default",
              background: "white"
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = f.color;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px ${f.color}15`;
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#F1F5F9";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              }}
            >
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <f.icon size={22} color={f.color} />
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", marginBottom: "8px" }}>{f.title}</h3>
              <p style={{ fontSize: "14px", color: "#64748B", lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: "100px max(24px, calc((100vw - 1000px)/2))" }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em", marginBottom: "12px" }}>
            How EchoCare works
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "30px", position: "relative" }}>
          <div style={{ position: "absolute", top: "32px", left: "12.5%", right: "12.5%", height: "2px", background: "linear-gradient(90deg, #0F766E, #14B8A6)", zIndex: 0 }} />
          {steps.map((s, i) => (
            <div key={i} style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "white", border: "3px solid #0F766E", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "28px", boxShadow: "0 4px 20px rgba(15,118,110,0.2)" }}>
                {s.icon}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#0F766E", letterSpacing: "0.08em", marginBottom: "8px" }}>STEP {s.num}</div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0F172A", marginBottom: "8px" }}>{s.title}</h3>
              <p style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: "100px max(24px, calc((100vw - 1100px)/2))", background: "white" }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em" }}>
            Stories that moved us
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
          {testimonials.map((t, i) => (
            <div key={i} style={{ padding: "28px", borderRadius: "20px", background: "#F8FAFC", border: "1.5px solid #F1F5F9" }}>
              <div style={{ display: "flex", marginBottom: "12px" }}>
                {Array.from({ length: 5 }).map((_, j) => <Star key={j} size={14} color="#F59E0B" fill="#F59E0B" />)}
              </div>
              <p style={{ fontSize: "14px", color: "#334155", lineHeight: 1.7, marginBottom: "20px", fontStyle: "italic" }}>
                &quot;{t.text}&quot;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #0F766E, #14B8A6)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "16px" }}>{t.avatar}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>{t.name}</div>
                  <div style={{ fontSize: "12px", color: "#64748B" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing & Plans Section */}
      <section id="pricing" style={{ padding: "100px max(24px, calc((100vw - 1100px)/2))", background: "#F1F5F9" }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "#0F766E", letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(15,118,110,0.08)", padding: "6px 16px", borderRadius: "100px" }}>Subscription Models</span>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em", marginTop: "16px", marginBottom: "12px" }}>
            Simple, transparent pricing
          </h2>
          <p style={{ fontSize: "16px", color: "#64748B", maxWidth: "560px", margin: "0 auto" }}>
            We charge for the AI Companion and care coordination, <strong>never for medical consultations</strong>. Doctor fees belong entirely to them.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
          {[
            {
              plan: "Free",
              price: "₹0",
              period: "forever",
              desc: "Essential health tracking tools for everyone.",
              features: ["Basic symptom tracking", "Limited AI chats", "Daily health logs", "Dashboard", "Limited report uploads"],
              btnText: "Get Started",
              highlight: false
            },
            {
              plan: "Basic",
              price: "₹199–299",
              period: "month",
              desc: "Unlimited AI companionship and detailed insights.",
              features: ["Unlimited AI chat", "Detailed health insights", "Explainable AI", "Report summaries", "Health trends"],
              btnText: "Subscribe Basic",
              highlight: false
            },
            {
              plan: "Premium",
              price: "₹499–799",
              period: "month",
              desc: "Advanced clinical analysis and reports exploration.",
              features: ["Everything in Basic", "Unlimited report analysis", "Priority AI responses", "Advanced analytics", "Wellness plans", "Exportable health reports"],
              btnText: "Go Premium",
              highlight: true
            },
            {
              plan: "Care+",
              price: "₹999–1499",
              period: "month",
              desc: "Human advocacy combined with advanced AI.",
              features: ["Everything in Premium", "Doctor consultation booking", "Care coordinator support", "Family member management", "Priority assistance"],
              btnText: "Join Care+",
              highlight: false
            }
          ].map((p, i) => (
            <div key={i} style={{
              background: "white", borderRadius: "24px", padding: "36px 28px",
              border: p.highlight ? "2.5px solid #0F766E" : "1.5px solid #E2E8F0",
              boxShadow: p.highlight ? "0 12px 32px rgba(15,118,110,0.12)" : "none",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              position: "relative", transform: p.highlight ? "scale(1.03)" : "none"
            }}>
              {p.highlight && (
                <span style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: "#0F766E", color: "white", fontSize: "10px", fontWeight: 800, padding: "4px 12px", borderRadius: "100px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Popular</span>
              )}
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginBottom: "8px" }}>{p.plan}</h3>
                <p style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.5, marginBottom: "24px", minHeight: "40px" }}>{p.desc}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "28px" }}>
                  <span style={{ fontSize: "36px", fontWeight: 900, color: "#0F172A", letterSpacing: "-0.02em" }}>{p.price}</span>
                  <span style={{ fontSize: "13px", color: "#94A3B8" }}>/{p.period}</span>
                </div>
                <div style={{ height: "1px", background: "#E2E8F0", marginBottom: "24px" }} />
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {p.features.map((f, j) => (
                    <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: 1.4, textAlign: "left" }}>
                      <Check size={14} color="#0F766E" style={{ marginTop: "2px", flexShrink: 0 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/signup" style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 700,
                background: p.highlight ? "#0F766E" : "white",
                color: p.highlight ? "white" : "#0F766E",
                border: p.highlight ? "none" : "1.5px solid #0F766E",
                textDecoration: "none", transition: "all 0.2s", textAlign: "center"
              }}
                onMouseOver={e => { if (!p.highlight) { e.currentTarget.style.background = "rgba(15,118,110,0.04)"; } }}
                onMouseOut={e => { if (!p.highlight) { e.currentTarget.style.background = "white"; } }}
              >
                {p.btnText}
              </Link>
            </div>
          ))}
        </div>
        
        <div style={{ marginTop: "40px", padding: "16px 24px", borderRadius: "16px", background: "rgba(15,118,110,0.05)", border: "1px solid rgba(15,118,110,0.15)", maxWidth: "800px", margin: "40px auto 0", display: "flex", alignItems: "start", gap: "12px" }}>
          <Info size={16} color="#0F766E" style={{ flexShrink: 0, marginTop: "2px" }} />
          <p style={{ fontSize: "12px", color: "#475569", lineHeight: 1.6, textAlign: "left" }}>
            <strong>Consultation Fee Clarity:</strong> EchoCare is a health intelligence platform. We do not provide clinical services directly. Booking a consultation through EchoCare Care+ includes routing to partner doctors. Any consultation fee displayed belongs <strong>100% to the doctor</strong>. EchoCare charges a transparent ₹49 platform/service booking fee to cover coordination and medical records indexing, which is waived entirely for Care+ active subscribers.
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{
        padding: "100px max(24px, calc((100vw - 900px)/2))", textAlign: "center",
        background: "linear-gradient(135deg, #0F766E 0%, #0D9488 50%, #0E7490 100%)",
        position: "relative", overflow: "hidden"
      }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08) 0%, transparent 60%)" }} />
        <div style={{ position: "relative" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 900, color: "white", letterSpacing: "-0.03em", marginBottom: "16px" }}>
            Your health story deserves to be told
          </h2>
          <p style={{ fontSize: "18px", color: "rgba(255,255,255,0.8)", marginBottom: "40px", maxWidth: "560px", margin: "0 auto 40px" }}>
            Join thousands of people who found answers with EchoCare. Start for free — no credit card required.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <Link href="/signup" style={{
              padding: "16px 40px", borderRadius: "14px", fontSize: "16px", fontWeight: 700,
              color: "#0F766E", background: "white", textDecoration: "none",
              display: "flex", alignItems: "center", gap: "8px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
            }}>
              Start Free Today <ChevronRight size={18} />
            </Link>
          </div>
          <div style={{ display: "flex", gap: "24px", justifyContent: "center", marginTop: "24px" }}>
            {["Free forever", "No credit card", "HIPAA aligned"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Check size={14} color="rgba(255,255,255,0.8)" />
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "40px max(24px, calc((100vw - 1100px)/2))", background: "#0F172A" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Heart size={16} color="#0F766E" fill="#0F766E" />
            <span style={{ fontSize: "14px", fontWeight: 700, color: "white" }}>EchoCare</span>
            <span style={{ fontSize: "12px", color: "#475569" }}>— Every patient story deserves to be heard.</span>
          </div>
          <div style={{ fontSize: "12px", color: "#475569" }}>© 2025 EchoCare. Built with ❤️ for patients.</div>
        </div>
      </footer>

      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}
