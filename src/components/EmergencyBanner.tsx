"use client";
import { AlertTriangle, Phone } from "lucide-react";

export interface EmergencyResource {
  label: string;
  number_or_url: string;
}

export interface EmergencyResult {
  category: string;
  message: string;
  resources: EmergencyResource[];
}

/**
 * Full-width, high-contrast emergency alert (Task 17 spec, created early in
 * Task 16 so both can reuse it). Rendered whenever services/safety.py's
 * check_emergency() fires on free-text input (story, chat).
 */
export default function EmergencyBanner({ escalation }: { escalation: EmergencyResult }) {
  return (
    <div
      role="alert"
      style={{
        width: "100%",
        background: "#B91C1C",
        color: "#FFFFFF",
        borderRadius: "14px",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        boxShadow: "0 4px 16px rgba(185,28,28,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <AlertTriangle size={22} style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <div style={{ fontSize: "15px", fontWeight: 800 }}>{escalation.message}</div>
          <div style={{ fontSize: "13px", fontWeight: 500, marginTop: "4px", opacity: 0.95 }}>
            This is not a diagnosis. If you are in immediate danger, please contact one of the resources below now.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {escalation.resources.map(resource => {
          const isPhoneNumber = /^[\d+][\d\s-]*$/.test(resource.number_or_url);
          return (
            <a
              key={resource.label}
              href={isPhoneNumber ? `tel:${resource.number_or_url}` : resource.number_or_url}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: "100px",
                padding: "8px 14px",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Phone size={13} />
              {resource.label}: {resource.number_or_url}
            </a>
          );
        })}
      </div>
    </div>
  );
}
