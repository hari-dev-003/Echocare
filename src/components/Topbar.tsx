"use client";
import { Bell, Search, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface TopbarProps {
  title?: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const [dark, setDark] = useState(false);
  const { user } = useAuth();
  const displayName = user?.name ?? "Patient";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <header className="topbar">
      <div style={{ flex: 1 }}>
        {title && <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{title}</h1>}
        {subtitle && <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "1px" }}>{subtitle}</p>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Search */}
        <button className="btn btn-ghost btn-sm" style={{ gap: "6px", color: "var(--text-muted)" }}>
          <Search size={16} />
          <span style={{ fontSize: "13px" }}>Search</span>
          <span style={{ fontSize: "11px", padding: "2px 6px", background: "var(--border-light)", borderRadius: "6px", color: "var(--text-muted)" }}>⌘K</span>
        </button>

        {/* Theme toggle */}
        <button onClick={toggleDark} className="btn btn-ghost btn-sm" style={{ padding: "8px" }}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications */}
        <button className="btn btn-ghost btn-sm" style={{ padding: "8px", position: "relative" }}>
          <Bell size={16} />
          <span style={{
            position: "absolute", top: "6px", right: "6px",
            width: "7px", height: "7px", borderRadius: "50%",
            background: "var(--danger)", border: "1.5px solid var(--surface)"
          }} />
        </button>

        {/* Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "4px" }}>
          <div className="avatar" style={{ width: "36px", height: "36px", fontSize: "13px" }}>{avatarInitial}</div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              {displayName}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{user?.email ?? "Patient"}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
