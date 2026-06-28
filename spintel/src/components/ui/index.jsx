import { useState, useEffect } from "react";
import { G } from "../../utils/tokens";

// ─── Initials helper ──────────────────────────────────────────────────────────
export function initials(name = "?") {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Avatar (initials fallback) ───────────────────────────────────────────────
export function Avatar({ name, size = 40, color = G.green }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
    }}>
      {initials(name)}
    </div>
  );
}

// ─── PhotoAvatar (real image with Avatar fallback) ────────────────────────────
export function PhotoAvatar({ id, name, size = 40, color = G.green, photoUrl }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [photoUrl]);

  if (!photoUrl || failed) return <Avatar name={name} size={size} color={color} />;

  return (
    <img
      src={photoUrl}
      alt={name || "Player"}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        objectFit: "cover", background: G.gray200,
        border: "2px solid rgba(255,255,255,0.15)",
      }}
    />
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ label, color, bg }) {
  return (
    <span style={{
      background: bg || G.greenLight, color: color || G.green,
      padding: "2px 10px", borderRadius: 20, fontSize: 11,
      fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif",
      letterSpacing: 0.5, textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, icon, color = G.green }) {
  return (
    <div style={{
      background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 12,
      padding: "16px 18px", borderTop: `3px solid ${color}`,
    }}>
      <div style={{ marginBottom: 6, color }}>{icon}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, color: G.gray900,
        fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.1,
      }}>
        {value ?? "—"}
      </div>
      <div style={{
        fontSize: 11, color: G.gray500, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2,
      }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: G.gray400, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: G.white, border: `1px solid ${G.gray200}`,
      borderRadius: 12, padding: "20px", ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Section title ────────────────────────────────────────────────────────────
export function SectionTitle({ children, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {icon && <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>{icon}</span>}
      <h3 style={{
        fontSize: 15, fontWeight: 700, color: G.gray800,
        fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3, margin: 0,
      }}>
        {children}
      </h3>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ text = "Loading…" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "40px 0", justifyContent: "center",
      color: G.gray400, fontSize: 13,
    }}>
      <div style={{
        width: 18, height: 18, border: `2px solid ${G.gray200}`,
        borderTop: `2px solid ${G.green}`, borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      {text}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, text }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "60px 24px", gap: 12, color: G.gray400,
    }}>
      <div style={{ opacity: 0.4, color: G.gray400 }}>{icon}</div>
      <div style={{ fontSize: 13, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
        {text}
      </div>
    </div>
  );
}

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────
export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: G.gray900, border: `1px solid ${G.gray700}`,
      borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fff",
    }}>
      <div style={{ color: G.gray300, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#fff" }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── Inline spinner (for inside dropdowns) ────────────────────────────────────
export function InlineSpinner() {
  return (
    <div style={{
      position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
      width: 12, height: 12, border: `2px solid #e5e7eb`,
      borderTop: `2px solid #1a7340`, borderRadius: "50%",
      animation: "spin 0.7s linear infinite", pointerEvents: "none",
    }} />
  );
}
