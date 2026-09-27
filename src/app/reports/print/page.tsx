"use client";
import { FileText } from "lucide-react";

export default function PrintReportPage() {
  return (
    <div style={{
      maxWidth: "600px", margin: "0 auto", padding: "80px 24px", textAlign: "center",
      fontFamily: "'Inter', sans-serif", color: "#1E293B"
    }}>
      <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: "rgba(15,118,110,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <FileText size={28} color="#0F766E" />
      </div>
      <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px" }}>Consultation summary export is coming soon</h1>
      <p style={{ fontSize: "14px", color: "#64748B", lineHeight: 1.6 }}>
        We&apos;re building a doctor-ready PDF built entirely from your real logs, story analysis, and uploaded reports. No placeholder data will be shown here in the meantime.
      </p>
      <button className="btn btn-secondary btn-sm" style={{ marginTop: "24px" }} onClick={() => window.close()}>Close</button>
    </div>
  );
}
