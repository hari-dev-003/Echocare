"use client";
import AppLayout from "@/components/AppLayout";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
  return (
    <AppLayout title="Notifications" subtitle="Stay on top of your health reminders and alerts">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ padding: "60px 12px", textAlign: "center", border: "1.5px dashed var(--border)", borderRadius: "14px" }}>
          <Bell size={32} color="var(--text-muted)" style={{ marginBottom: "12px" }} />
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>No notifications yet</div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>You&apos;ll see reminders and alerts here as they happen.</p>
        </div>

        {/* Notification settings */}
        <div className="card" style={{ padding: "24px" }}>
          <div className="section-title" style={{ marginBottom: "16px" }}>Notification Preferences</div>
          {[
            { label: "Daily check-in reminders", desc: "Remind me to log my health daily", on: true },
            { label: "Medication reminders", desc: "Alert me to take my medications", on: true },
            { label: "Appointment reminders", desc: "Notify me before consultancy sessions", on: true },
            { label: "AI insight alerts", desc: "Alert me when new insights are detected", on: false },
            { label: "Weekly summaries", desc: "Send weekly health overview", on: true },
          ].map((pref, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{pref.label}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{pref.desc}</div>
              </div>
              <button className={`switch ${pref.on ? "on" : ""}`} />
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
