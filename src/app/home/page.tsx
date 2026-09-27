"use client";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useState } from "react";
import { MessageCircle, Leaf, Bell, TrendingUp, FileText, Heart, ArrowRight, Play, Zap } from "lucide-react";


export default function HomePage() {
  const { user } = useAuth();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";
  const displayName = user?.name ?? "there";

  const reminders = [
    { text: "Log today's symptoms", icon: "📋", time: "Now", type: "primary" },
    { text: "Take your medication", icon: "💊", time: "2:00 PM", type: "warning" },
    { text: "Weekly health survey due", icon: "📊", time: "Today", type: "accent" },
  ];

  const stats = [
    { label: "Health Score", value: "72", unit: "/100", color: "#0F766E", bg: "rgba(15,118,110,0.08)" },
    { label: "Days Tracked", value: "14", unit: " days", color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
    { label: "Insights", value: "8", unit: " new", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)" },
    { label: "Mood Avg", value: "😊", unit: " Good", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #F0FDF9 0%, #F8FAFC 50%, #EFF6FF 100%)",
      fontFamily: "'Inter', sans-serif", padding: "0"
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px", background: "rgba(255,255,255,0.8)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(226,232,240,0.6)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #0F766E, #14B8A6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Heart size={18} color="white" fill="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: "18px", color: "#0F172A", letterSpacing: "-0.03em" }}>EchoCare</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button style={{ background: "none", border: "none", cursor: "pointer", position: "relative" }}>
            <Bell size={20} color="#64748B" />
            <span style={{ position: "absolute", top: "-2px", right: "-2px", width: "8px", height: "8px", borderRadius: "50%", background: "#EF4444", border: "1.5px solid white" }} />
          </button>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg, #0F766E, #14B8A6)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "14px" }}>{displayName.charAt(0).toUpperCase()}</div>
        </div>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 32px" }}>
        {/* Greeting */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "14px", color: "#64748B", marginBottom: "6px" }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 900, color: "#0F172A", letterSpacing: "-0.03em", marginBottom: "8px" }}>
            {greeting}, {displayName} 👋
          </h1>
          <p style={{ fontSize: "16px", color: "#64748B", marginBottom: "20px" }}>How are you feeling today?</p>
        </div>

        {/* Main Entry Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "40px" }}>
          {/* Report card */}
          <Link href="/chat" style={{ textDecoration: "none" }}>
            <div style={{
              background: "linear-gradient(135deg, #0F766E 0%, #0D9488 60%, #14B8A6 100%)",
              borderRadius: "24px", padding: "36px 32px",
              cursor: "pointer", transition: "all 0.3s ease",
              boxShadow: "0 8px 32px rgba(15,118,110,0.25)",
              position: "relative", overflow: "hidden"
            }}
              onMouseOver={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 48px rgba(15,118,110,0.35)"; }}
              onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(15,118,110,0.25)"; }}
            >
              <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px", borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
              <div style={{ position: "absolute", bottom: "-30px", right: "20px", width: "80px", height: "80px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
              <div style={{ width: "52px", height: "52px", borderRadius: "16px", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                <MessageCircle size={26} color="white" />
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: 800, color: "white", letterSpacing: "-0.02em", marginBottom: "10px" }}>
                I need to talk /<br />report something
              </h2>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.75)", lineHeight: 1.6, marginBottom: "24px" }}>
                Talk to our AI companion or report your concerns. Private & secure.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "white", fontWeight: 600, fontSize: "14px" }}>
                Start Conversation <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Self-care card */}
          <Link href="/self-care" style={{ textDecoration: "none" }}>
            <div style={{
              background: "white", borderRadius: "24px", padding: "36px 32px",
              cursor: "pointer", border: "1.5px solid #E2E8F0",
              transition: "all 0.3s ease", boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              position: "relative", overflow: "hidden"
            }}
              onMouseOver={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.12)"; e.currentTarget.style.borderColor = "#14B8A6"; }}
              onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "#E2E8F0"; }}
            >
              <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px", borderRadius: "50%", background: "rgba(15,118,110,0.04)" }} />
              <div style={{ width: "52px", height: "52px", borderRadius: "16px", background: "rgba(15,118,110,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                <Leaf size={26} color="#0F766E" />
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", marginBottom: "10px" }}>
                I just need<br />a moment
              </h2>
              <p style={{ fontSize: "14px", color: "#64748B", lineHeight: 1.6, marginBottom: "24px" }}>
                Take a break and try our self-care tools. Grounding, breathing, journaling.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0F766E", fontWeight: 600, fontSize: "14px" }}>
                Explore Tools <ArrowRight size={16} />
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "32px" }}>
          {stats.map((stat, i) => (
            <div key={i} style={{
              background: "white", borderRadius: "16px", padding: "18px 16px",
              border: "1px solid #E2E8F0", textAlign: "center"
            }}>
              <div style={{ fontSize: "24px", fontWeight: 800, color: stat.color, letterSpacing: "-0.02em" }}>
                {stat.value}<span style={{ fontSize: "13px", fontWeight: 600, color: "#94A3B8" }}>{stat.unit}</span>
              </div>
              <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "4px", fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Reminders & Quick Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Reminders */}
          <div style={{ background: "white", borderRadius: "20px", padding: "24px", border: "1px solid #E2E8F0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A" }}>Upcoming Reminders</span>
              <Bell size={16} color="#94A3B8" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {reminders.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "12px", background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
                  <span style={{ fontSize: "20px" }}>{r.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{r.text}</div>
                    <div style={{ fontSize: "11px", color: "#94A3B8" }}>{r.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ background: "white", borderRadius: "20px", padding: "24px", border: "1px solid #E2E8F0" }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A", marginBottom: "18px" }}>Quick Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { icon: TrendingUp, label: "Log Today's Health", href: "/tracker", color: "#0F766E" },
                { icon: FileText, label: "Upload Medical Report", href: "/reports", color: "#3B82F6" },
                { icon: MessageCircle, label: "Continue Patient Story", href: "/story", color: "#8B5CF6" },
              ].map((action, i) => (
                <Link key={i} href={action.href} style={{ textDecoration: "none" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "12px 14px", borderRadius: "12px", border: "1px solid #E2E8F0",
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}06`; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `${action.color}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <action.icon size={15} color={action.color} />
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}>{action.label}</span>
                    <ArrowRight size={14} color="#94A3B8" style={{ marginLeft: "auto" }} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Privacy assurance */}
        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#94A3B8" }}>🔒</span>
            <span style={{ fontSize: "12px", color: "#94A3B8" }}>Your privacy and trust are our priority. Your data is safe with us.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
