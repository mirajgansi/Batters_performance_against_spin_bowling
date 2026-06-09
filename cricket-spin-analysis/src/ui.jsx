import { useState } from "react";
import { Sparkles } from "lucide-react";

// ── Recharts custom tooltip ───────────────────────────────────────────────
export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0C1020",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <div style={{ color: "#8A95A8", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#F0F4FF" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Player avatar with fallback initials ──────────────────────────────────
export function PlayerAvatar({ player, size = 32 }) {
  const [err, setErr] = useState(false);

  if (!err && player?.imgUrl && !player.imgUrl.includes("undefined")) {
    return (
      <img
        src={player.imgUrl}
        alt={player.Name}
        className="player-avatar"
        style={{ width: size, height: size }}
        onError={() => setErr(true)}
      />
    );
  }

  const initials = (player?.longName || player?.Name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  return (
    <div
      className="player-avatar-placeholder"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

// ── AI insight card ───────────────────────────────────────────────────────
export function AIInsightCard({ title, insight, loading, cacheStatus }) {
  return (
    <div className="ai-card section-gap">
      <div className="ai-card-title">
        <Sparkles size={15} /> {title}
        {cacheStatus && !loading && (
          <span className={`cache-badge ${cacheStatus}`}>
            {cacheStatus === "hit" ? "✓ cached" : "✦ fresh"}
          </span>
        )}
      </div>
      {loading ? (
        <div className="ai-loading">
          <Sparkles size={13} />
          <span>
            Generating insight
            <DotAnimation />
          </span>
        </div>
      ) : (
        <p className="ai-text">{insight}</p>
      )}
    </div>
  );
}

// ── Animated loading dots ─────────────────────────────────────────────────
export function DotAnimation() {
  return (
    <span className="dot-anim">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

// ── Full-area loading state ───────────────────────────────────────────────
export function LoadingState({ text }) {
  return (
    <div className="loading">
      <span>{text}</span>
      <DotAnimation />
    </div>
  );
}

// ── Empty / no-player state ───────────────────────────────────────────────
export function EmptyState({ icon, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-text">{text}</div>
    </div>
  );
}

// ── API status indicator ──────────────────────────────────────────────────
export function ApiStatusBadge({ status }) {
  const colors = {
    connected: { bg: "rgba(6,214,160,0.1)", border: "rgba(6,214,160,0.3)", dot: "#06D6A0", text: "#06D6A0", label: "API Connected" },
    disconnected: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", dot: "#EF4444", text: "#EF4444", label: "API Offline" },
    checking: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", dot: "#F59E0B", text: "#F59E0B", label: "Checking…" },
  };
  const c = colors[status] ?? colors.checking;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          backgroundColor: c.dot,
          boxShadow: status === "connected" ? `0 0 6px ${c.dot}` : "none",
          animation: status === "checking" ? "pulse 1s infinite" : "none",
        }}
      />
      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: c.text }}>
        {c.label}
      </span>
    </div>
  );
}