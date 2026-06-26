/* eslint-disable */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const API = "http://localhost:5000";
// CSV lives in Vite's /public folder, so it's served from the root path at runtime.
const PLAYERS_CSV_URL = "/2026_players_details.csv";

// ─── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const G = {
  green: "#1a7340", greenLight: "#e8f5ee", greenMid: "#2da060",
  accent: "#f97316", accentLight: "#fff7ed",
  blue: "#1e40af", blueLight: "#eff6ff",
  red: "#dc2626", redLight: "#fef2f2",
  amber: "#d97706", amberLight: "#fffbeb",
  gray50: "#f9fafb", gray100: "#f3f4f6", gray200: "#e5e7eb",
  gray300: "#d1d5db", gray400: "#9ca3af", gray500: "#6b7280",
  gray600: "#4b5563", gray700: "#374151", gray800: "#1f2937",
  gray900: "#111827", white: "#ffffff",
};

// Spin type values that exactly match encoder_spin classes in the model
const SPIN_TYPE_OPTIONS = [
  { value: "right-arm offbreak",     label: "Off Spin",              short: "OB"  },
  { value: "slow left-arm orthodox", label: "Left Arm Orthodox",     short: "SLA" },
  { value: "legbreak",               label: "Leg Spin",              short: "LB"  },
  { value: "legbreak googly",        label: "Leg Spin (Googly)",     short: "LBG" },
  { value: "left-arm wrist-spin",    label: "Left Arm Wrist Spin",   short: "LWS" },
];

// Phase values that match encoder_phase classes
const PHASE_OPTIONS = [
  { value: "Powerplay", label: "Powerplay"    },
  { value: "Middle",    label: "Middle Overs" },
  { value: "Death",     label: "Death Overs"  },
];

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#9ca3af"];
const CHART_COLORS = ["#1a7340", "#f97316", "#3b82f6", "#8b5cf6", "#ef4444"];

// ─── API HELPERS ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── PLAYER PHOTO CSV LOADER ────────────────────────────────────────────────────
// Loads /2026_players_details.csv (Vite public folder) and builds an
// ID -> imgUrl lookup map so player photos can be shown without touching the
// Flask API or player objects it returns.
async function loadPlayerPhotoMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch player CSV: HTTP ${res.status}`);
  const csvText = await res.text();

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const map = {};
        for (const row of results.data) {
          const id = row.ID || row.id;
          const imgUrl = (row.imgUrl || "").trim();
          if (id && imgUrl) map[String(id)] = imgUrl;
        }
        resolve(map);
      },
      error: (err) => reject(err),
    });
  });
}

// ── Ollama config ──────────────────────────────────────────────────────────────
const OLLAMA_URL   = "http://localhost:11434";
const OLLAMA_MODEL = "llama3";   // ← change to whichever model you have pulled

async function callClaude(prompt, onToken) {
  // callClaude name kept so all 3 call sites need no changes
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:  OLLAMA_MODEL,
      prompt: prompt,
      stream: true,
      options: { num_predict: 400, temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status} — is Ollama running? (ollama serve)`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText  = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Ollama streams one JSON object per line
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.response) {
          fullText += chunk.response;
          onToken(fullText);
        }
        if (chunk.done) break;
      } catch {}
    }
  }
  return fullText;
}
// ─── SHARED UI COMPONENTS ──────────────────────────────────────────────────────
function initials(name = "?") {
  return (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ name, size = 40, color = G.green }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
      fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1,
    }}>{initials(name)}</div>
  );
}

// PhotoAvatar: shows the real player photo (from the CSV-derived photoMap) when
// available, and gracefully falls back to the colored-initials Avatar if the
// player has no photo on file or the image fails to load. Used in the
// dashboard hero only.
function PhotoAvatar({ id, name, size = 40, color = G.green, photoUrl }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [photoUrl]);

  if (!photoUrl || failed) {
    return <Avatar name={name} size={size} color={color} />;
  }

  return (
    <img
      src={photoUrl}
      alt={name || "Player"}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        objectFit: "cover", background: G.gray200,
        border: `2px solid rgba(255,255,255,0.15)`,
      }}
    />
  );
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      background: bg || G.greenLight, color: color || G.green,
      padding: "2px 10px", borderRadius: 20, fontSize: 11,
      fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif",
      letterSpacing: 0.5, textTransform: "uppercase",
    }}>{label}</span>
  );
}

function KpiCard({ label, value, sub, icon, color = G.green }) {
  return (
    <div style={{
      background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 12,
      padding: "16px 18px", borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: G.gray900, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.1 }}>{value ?? "—"}</div>
      <div style={{ fontSize: 11, color: G.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: G.gray400, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3, margin: 0 }}>{children}</h3>
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 12, padding: "20px", ...style }}>
      {children}
    </div>
  );
}

function Spinner({ text = "Loading…" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: G.gray400, fontSize: 13 }}>
      <div style={{ width: 18, height: 18, border: `2px solid ${G.gray200}`, borderTop: `2px solid ${G.green}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      {text}
    </div>
  );
}

function EmptyState({ icon = "🏏", text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12, color: G.gray400 }}>
      <div style={{ fontSize: 40, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 13, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: G.gray900, border: `1px solid ${G.gray700}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fff" }}>
      <div style={{ color: G.gray300, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#fff" }}>{p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</strong></div>
      ))}
    </div>
  );
}

// ─── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, collapsed, setCollapsed }) {
  const navItems = [
    { id: "dashboard", label: "Analysis Dashboard", icon: "📊" },
    { id: "prediction", label: "Match Prediction",  icon: "🔮" },
  ];
  return (
    <aside style={{
      width: collapsed ? 60 : 230, background: G.gray900, flexShrink: 0,
      display: "flex", flexDirection: "column", transition: "width 0.2s",
      position: "sticky", top: 0, height: "100vh", overflow: "hidden",
    }}>
      <div style={{ padding: collapsed ? "20px 0" : "20px 16px", borderBottom: `1px solid ${G.gray700}`, display: "flex", alignItems: "center", gap: 10, justifyContent: collapsed ? "center" : "flex-start" }}>
        <span style={{ fontSize: 24 }}>🏏</span>
        {!collapsed && (
          <div>
            <div style={{ color: G.white, fontWeight: 700, fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>SpinIQ</div>
            <div style={{ color: G.green, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>IPL Analytics</div>
          </div>
        )}
      </div>
      {!collapsed && <div style={{ padding: "8px 16px", fontSize: 10, color: G.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 8 }}>Navigation</div>}
      <nav style={{ flex: 1, padding: "4px 8px" }}>
        {navItems.map(item => (
          <button key={item.id} onClick={() => setPage(item.id)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            padding: collapsed ? "11px" : "11px 12px", borderRadius: 8, border: "none",
            background: page === item.id ? G.green : "transparent",
            color: page === item.id ? G.white : G.gray400, cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: 0.3, marginBottom: 2, justifyContent: collapsed ? "center" : "flex-start",
            transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 17, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && item.label}
          </button>
        ))}
      </nav>
      <button onClick={() => setCollapsed(!collapsed)} style={{
        margin: "0 8px 16px", padding: "10px", background: G.gray800,
        border: "none", borderRadius: 8, color: G.gray400, cursor: "pointer",
        fontSize: 16, transition: "all 0.15s",
      }}>{collapsed ? "→" : "←"}</button>
    </aside>
  );
}

// ─── TOPBAR ────────────────────────────────────────────────────────────────────
function Topbar({ page, apiStatus, batterCount }) {
  const titles = { dashboard: "Batter Analysis Dashboard", prediction: "Match Prediction", saved: "Saved Predictions & AI Review" };
  const subs   = { dashboard: "Spin bowling matchup analysis", prediction: "AI-powered performance forecast", saved: "Prediction accuracy tracker" };
  const dotColor = apiStatus === "connected" ? G.green : apiStatus === "checking" ? G.amber : G.red;
  const statusLabel = apiStatus === "connected" ? `Connected · ${batterCount} batters` : apiStatus === "checking" ? "Connecting…" : "API Offline";
  return (
    <div style={{
      height: 58, background: G.white, borderBottom: `2px solid ${G.green}`,
      display: "flex", alignItems: "center", padding: "0 24px", gap: 16,
      position: "sticky", top: 0, zIndex: 100,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: G.gray900, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3, lineHeight: 1.2 }}>{titles[page]}</div>
        <div style={{ fontSize: 11, color: G.gray500 }}>{subs[page]}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", border: `1px solid ${G.gray200}`, borderRadius: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
        <span style={{ fontSize: 11, color: G.gray500, fontFamily: "'Barlow Condensed', sans-serif" }}>{statusLabel}</span>
      </div>
      <Badge label="AI-Powered" color="#fff" bg={G.green} />
    </div>
  );
}

// ─── AI INSIGHT BOX ────────────────────────────────────────────────────────────
function AIInsightBox({ prompt, triggerKey, disabled }) {
  const [text, setText]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    if (disabled) return;
    setLoading(true); setError(null); setText(""); setGenerated(false);
    try {
      await callClaude(prompt, t => setText(t));
      setGenerated(true);
    } catch {
      setError("AI unavailable. Please ensure the Anthropic API is configured.");
    }
    setLoading(false);
  }, [prompt, disabled]);

  useEffect(() => { setGenerated(false); setText(""); }, [triggerKey]);

  return (
    <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", border: `1px solid ${G.green}30`, borderRadius: 12, padding: "18px 20px", borderLeft: `4px solid ${G.green}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Insight</span>
        </div>
        <button onClick={generate} disabled={loading || disabled} style={{
          padding: "6px 14px", background: disabled ? G.gray300 : G.green, color: "#fff", border: "none",
          borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: (loading || disabled) ? "not-allowed" : "pointer",
          fontFamily: "'Barlow Condensed', sans-serif", opacity: loading ? 0.7 : 1,
        }}>{loading ? "Generating…" : generated ? "Refresh" : "Generate Insight"}</button>
      </div>
      {error && <div style={{ color: G.red, fontSize: 13 }}>{error}</div>}
      {loading && !text && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: G.green, opacity: 0.4, animation: `blink 1.2s ${i*0.2}s infinite` }} />)}
          <span style={{ fontSize: 13, color: G.gray500, marginLeft: 6 }}>Analyzing performance data…</span>
        </div>
      )}
      {text && <p style={{ fontSize: 13.5, color: G.gray700, lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{text}</p>}
      {!text && !loading && !error && (
        <p style={{ fontSize: 13, color: G.gray400, margin: 0, fontStyle: "italic" }}>
          {disabled ? "Select a player to enable AI insight." : "Click \"Generate Insight\" to get AI-powered cricket analysis."}
        </p>
      )}
    </div>
  );
}

// ─── PLAYER SEARCH (shared) ────────────────────────────────────────────────────
function PlayerSearch({ players, selected, onSelect, placeholder = "Search IPL Batter…" }) {
  const [q, setQ]       = useState(selected ? (selected.longName || selected.Name || "") : "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected) setQ(selected.longName || selected.Name || "");
  }, [selected?.ID]);

  const filtered = useMemo(() => {
    if (!players?.length) return [];
    const lq = q.toLowerCase();
    return players.filter(p =>
      (p.longName || "").toLowerCase().includes(lq) ||
      (p.Name || "").toLowerCase().includes(lq)
    ).slice(0, 14);
  }, [q, players]);

  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "11px 14px 11px 40px", borderRadius: 10,
          border: `1.5px solid ${G.gray300}`, fontSize: 14, outline: "none",
          background: G.white, fontFamily: "'Barlow Condensed', sans-serif",
          transition: "border-color 0.15s",
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 10,
          zIndex: 200, maxHeight: 260, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}>
          {filtered.map(p => (
            <div key={p.ID} onMouseDown={() => { onSelect(p); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${G.gray100}` }}
              onMouseEnter={e => e.currentTarget.style.background = G.greenLight}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar name={p.longName || p.Name} size={34} color={G.green} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{p.longName || p.Name}</div>
                <div style={{ fontSize: 11, color: G.gray500 }}>{p.longBattingStyles || "Batter"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PAGE 1: DASHBOARD ─────────────────────────────────────────────────────────
function DashboardPage({ players, venues, apiOk, photoMap }) {
  const [player,        setPlayer]        = useState(null);
  const [stats,         setStats]         = useState(null);
  const [statsLoad,     setStatsLoad]     = useState(false);
  const [spinType,      setSpinType]      = useState("All Spin");
  const [season,        setSeason]        = useState("All Seasons");
  const [venue,         setVenue]         = useState("All Venues");
  const [playerSeasons, setPlayerSeasons] = useState([]); // [{season, balls, low_data}]
  const [seasonsLoad,   setSeasonsLoad]   = useState(false);
  const [playerVenues,  setPlayerVenues]  = useState([]); // [{venue, balls, low_data}]
  const [venuesLoad,    setVenuesLoad]    = useState(false);

  // When player changes, fetch their specific seasons+venues and reset filters
  useEffect(() => {
    if (!player || !apiOk) {
      setPlayerSeasons([]); setSeason("All Seasons");
      setPlayerVenues([]);  setVenue("All Venues");
      return;
    }
    setSeasonsLoad(true);
    apiFetch(`/player-seasons/${player.ID}`)
      .then(d => { setPlayerSeasons(d.seasons || []); setSeasonsLoad(false); })
      .catch(() => { setPlayerSeasons([]); setSeasonsLoad(false); });

    setVenuesLoad(true);
    apiFetch(`/player-venues/${player.ID}`)
      .then(d => { setPlayerVenues(d.venues || []); setVenuesLoad(false); })
      .catch(() => { setPlayerVenues([]); setVenuesLoad(false); });

    setSeason("All Seasons");
    setVenue("All Venues");
  }, [player?.ID, apiOk]);

  // Load stats when player changes
useEffect(() => {
  if (!player || !apiOk) { setStats(null); return; }
  setStatsLoad(true); setStats(null);

  const params = new URLSearchParams();
  if (season !== "All Seasons") params.set("season", season);
  if (venue  !== "All Venues")  params.set("venue", venue);
  if (spinType !== "All Spin") {
    const spinVal = SPIN_TYPE_OPTIONS.find(s => s.label === spinType)?.value;
    if (spinVal) params.set("spin_type", spinVal);
  }
  const query = params.toString() ? `?${params.toString()}` : "";

  apiFetch(`/player-stats/${player.ID}${query}`)
    .then(d => { setStats(d.error ? null : d); setStatsLoad(false); })
    .catch(() => setStatsLoad(false));
}, [player?.ID, apiOk, season, spinType, venue]);

  // Build weakness list from spinComparison — sorted by dismissalProb descending
  const weaknesses = useMemo(() => {
    if (!stats?.spinComparison?.length) return [];
    return [...stats.spinComparison]
      .sort((a, b) => b.dismissalProb - a.dismissalProb)
      .map((s, i) => ({
        type: s.type,
        severity: i === 0 ? "high" : i === 1 ? "medium" : "low",
        dismissalProb: s.dismissalProb,
        sr: s.sr,
      }));
  }, [stats]);

  // runsDistribution colours
  const runsDistWithColors = useMemo(() => {
    if (!stats?.runsDistribution) return [];
    return stats.runsDistribution.map((d, i) => ({ ...d, color: PIE_COLORS[i] }));
  }, [stats]);

  // spinComparison filtered by selected spin type
  const filteredSpin = useMemo(() => {
    if (!stats?.spinComparison) return [];
    if (spinType === "All Spin") return stats.spinComparison;
   return stats.spinComparison.filter(s =>
  s.type?.toLowerCase() === spinType.toLowerCase()
);
  }, [stats, spinType]);

  const aiKey    = `${player?.ID}-${spinType}-${season}-${venue}`;
  const aiPrompt = player && stats
    ? `You are an expert IPL cricket analyst. Analyze ${player.longName || player.Name}'s batting performance against spin bowling.
Player: ${player.longName || player.Name}, Style: ${player.longBattingStyles || ""}
Stats vs Spin — SR: ${stats.sr}, Avg: ${stats.avg}, Dot%: ${stats.dot_pct}%, Boundary%: ${stats.boundary_pct}%, Wicket Rate: ${stats.wkt_rate}%
Cluster archetype: ${stats.cluster_name}. Filter: ${spinType}, Season: ${season}, Venue: ${venue}
Provide 4-5 sentences covering: overall assessment, key strengths, key weaknesses, most vulnerable spin type, and a fantasy cricket recommendation. Use cricket terminology.`
    : "";

  if (!apiOk) return <EmptyState icon="🔌" text="Flask API is offline. Start it with: python app.py" />;

  return (
    <div>
      {/* Search Bar */}
      <div style={{ padding: "20px 24px", background: G.gray50, borderBottom: `1px solid ${G.gray200}` }}>
        <div style={{ maxWidth: 600 }}>
          <PlayerSearch players={players} selected={player} onSelect={p => { setPlayer(p); }} />
        </div>
      </div>

      <div style={{ padding: "24px" }}>
        {!player && <EmptyState icon="🔍" text="Search and select an IPL batter above to load their spin bowling analytics." />}

        {player && (
          <>
            {/* Player Hero */}
            <div style={{
              background: `linear-gradient(135deg, ${G.gray900} 0%, #0f2d1c 100%)`,
              borderRadius: 14, padding: "24px", marginBottom: 20, position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, background: `${G.green}20`, borderRadius: "50%", transform: "translate(60px,-60px)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
                <PhotoAvatar
                  id={player.ID}
                  name={player.longName || player.Name}
                  size={72}
                  color={G.green}
                  photoUrl={photoMap?.[String(player.ID)]}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: G.white, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>{player.longName || player.Name}</div>
                  <div style={{ fontSize: 14, color: G.greenMid, fontWeight: 600, marginTop: 2 }}>{player.longTeamNames || ""}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {player.longBattingStyles && <Badge label={player.longBattingStyles} color={G.white} bg={`${G.green}80`} />}
                    {stats?.cluster_name && <Badge label={stats.cluster_name} color={G.white} bg="rgba(255,255,255,0.15)" />}
                  </div>
                </div>
                {stats && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: 800, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{stats.sr}</div>
                    <div style={{ fontSize: 11, color: G.gray400, textTransform: "uppercase", letterSpacing: 1 }}>SR vs Spin</div>
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: G.gray600, fontFamily: "'Barlow Condensed', sans-serif" }}>Filters:</span>
              <select value={spinType} onChange={e => setSpinType(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: "pointer", outline: "none" }}>
                <option>All Spin</option>
                {SPIN_TYPE_OPTIONS.map(s => <option key={s.value}>{s.label}</option>)}
              </select>
              <div style={{ position: "relative" }}>
                <select
                  value={season}
                  onChange={e => setSeason(e.target.value)}
                  disabled={seasonsLoad}
                  style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: seasonsLoad ? "not-allowed" : "pointer", outline: "none", opacity: seasonsLoad ? 0.6 : 1 }}
                >
                  <option value="All Seasons">All Seasons</option>
                  {playerSeasons.map(s => (
                    <option key={s.season} value={s.season}>
                      {s.season}{s.low_data ? " ⚠" : ""} ({s.balls} balls)
                    </option>
                  ))}
                </select>
                {seasonsLoad && (
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, border: `2px solid ${G.gray200}`, borderTop: `2px solid ${G.green}`, borderRadius: "50%", animation: "spin 0.7s linear infinite", pointerEvents: "none" }} />
                )}
              </div>
              <div style={{ position: "relative" }}>
                <select
                  value={venue}
                  onChange={e => setVenue(e.target.value)}
                  disabled={venuesLoad}
                  style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: venuesLoad ? "not-allowed" : "pointer", outline: "none", opacity: venuesLoad ? 0.6 : 1 }}
                >
                  <option value="All Venues">All Venues</option>
                  {playerVenues.length === 0 && player && !venuesLoad && (
                    <option disabled value="">— no venue data in bbb —</option>
                  )}
                  {playerVenues.map(v => (
                    <option key={v.venue} value={v.venue}>
                      {v.venue}{v.low_data ? " ⚠" : ""} ({v.balls} balls)
                    </option>
                  ))}
                </select>
                {venuesLoad && (
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, border: `2px solid ${G.gray200}`, borderTop: `2px solid ${G.green}`, borderRadius: "50%", animation: "spin 0.7s linear infinite", pointerEvents: "none" }} />
                )}
              </div>
            </div>

            {/* Data quality warning for selected season */}
            {(() => {
              if (season === "All Seasons") return null;
              const s = playerSeasons.find(ps => ps.season === season);
              if (!s) return null;
              if (s.balls < 10) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, borderLeft: `4px solid ${G.red}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🚫</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.red, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Too few games in {s.season}</div>
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>Only {s.balls} balls faced vs spin this season — not enough data to show meaningful analysis. Try "All Seasons" or a different year.</div>
                  </div>
                </div>
              );
              if (s.low_data) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: G.amberLight, border: "1px solid #fcd34d", borderRadius: 10, borderLeft: `4px solid ${G.amber}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.amber, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Limited data for {s.season}</div>
                    <div style={{ fontSize: 12, color: "#92400e" }}>Only {s.balls} balls faced vs spin this season — analysis may not be fully reliable. Interpret with caution.</div>
                  </div>
                </div>
              );
              return null;
            })()}

            {/* Data quality warning for selected venue */}
            {(() => {
              if (venue === "All Venues") return null;
              const v = playerVenues.find(pv => pv.venue === venue);
              if (!v) return null;
              if (v.balls < 10) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, borderLeft: `4px solid ${G.red}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🚫</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.red, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Too few balls at {v.venue}</div>
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>Only {v.balls} balls faced vs spin at this venue — not enough data to show meaningful analysis. Try "All Venues" or a different ground.</div>
                  </div>
                </div>
              );
              if (v.low_data) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: G.amberLight, border: "1px solid #fcd34d", borderRadius: 10, borderLeft: `4px solid ${G.amber}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.amber, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Limited data at {v.venue}</div>
                    <div style={{ fontSize: 12, color: "#92400e" }}>Only {v.balls} balls faced vs spin at this venue — analysis may not be fully reliable. Interpret with caution.</div>
                  </div>
                </div>
              );
              return null;
            })()}

            {statsLoad && <Spinner text="Loading player stats…" />}

            {stats && (() => {
              const selectedSeasonData = season !== "All Seasons" ? playerSeasons.find(ps => ps.season === season) : null;
              const selectedVenueData  = venue  !== "All Venues"  ? playerVenues.find(pv => pv.venue === venue)     : null;
              const tooFewBalls = (selectedSeasonData && selectedSeasonData.balls < 10) ||
                                  (selectedVenueData  && selectedVenueData.balls  < 10);
              if (tooFewBalls) return null; // warning banner above already shown
              return (
              <>
                {/* KPI Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
                  <KpiCard label="Strike Rate vs Spin" value={stats.sr}                      icon="⚡" color={G.green} />
                  <KpiCard label="Dot Ball %"           value={`${stats.dot_pct}%`}           icon="⚫" color={G.gray500} />
                  <KpiCard label="Boundary %"           value={`${stats.boundary_pct}%`}      icon="🏏" color={G.accent} />
                  <KpiCard label="Wicket Rate"          value={`${stats.wkt_rate}%`}          icon="🎯" color={G.red} />
                  <KpiCard label="Average vs Spin"      value={stats.avg}                     icon="📈" color={G.blue} />
                  <KpiCard label="Total Balls Faced"    value={stats.balls}                   icon="🔢" color="#8b5cf6" />
                </div>

                {/* Charts Row 1 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  {/* Runs Distribution Pie */}
                  <Card>
                    <SectionTitle icon="🥧">Runs Distribution</SectionTitle>
                    <div style={{ height: 220, display: "flex", alignItems: "center", gap: 16 }}>
                      <ResponsiveContainer width="60%" height="100%">
                        <PieChart>
                          <Pie data={runsDistWithColors} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                            {runsDistWithColors.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1 }}>
                        {runsDistWithColors.map((d, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: G.gray600, flex: 1 }}>{d.name}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{d.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>

                  {/* Spin Type Comparison Bar */}
                  <Card>
                    <SectionTitle icon="📊">Performance by Spin Type</SectionTitle>
                    <div style={{ height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={filteredSpin.length ? filteredSpin : stats.spinComparison} barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" stroke={G.gray100} vertical={false} />
                          <XAxis dataKey="short" tick={{ fill: G.gray500, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: G.gray500, fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11, color: G.gray500 }} />
                          <Bar dataKey="sr"  name="Strike Rate" fill={G.green}  radius={[3,3,0,0]} />
                          <Bar dataKey="avg" name="Average"     fill={G.accent} radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>

                {/* Historical Trend */}
                {stats.seasons?.length > 0 && (
                  <Card style={{ marginBottom: 16 }}>
                    <SectionTitle icon="📈">Historical IPL Performance vs Spin</SectionTitle>
                    <div style={{ height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats.seasons}>
                          <CartesianGrid strokeDasharray="3 3" stroke={G.gray100} vertical={false} />
                          <XAxis dataKey="season" tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11, color: G.gray500 }} />
                          <Line type="monotone" dataKey="sr" name="Strike Rate" stroke={G.green} strokeWidth={2.5}
                            dot={(props) => {
                              const isSelected = stats.selected_season && props.payload?.season === String(stats.selected_season);
                              return <circle key={props.key} cx={props.cx} cy={props.cy} r={isSelected ? 7 : 4} fill={isSelected ? G.accent : G.green} stroke={G.white} strokeWidth={isSelected ? 2 : 0} />;
                            }}
                          />
                          <Line type="monotone" dataKey="avg" name="Average" stroke={G.accent} strokeWidth={2.5} strokeDasharray="5 3"
                            dot={(props) => {
                              const isSelected = stats.selected_season && props.payload?.season === String(stats.selected_season);
                              return <circle key={props.key} cx={props.cx} cy={props.cy} r={isSelected ? 7 : 4} fill={isSelected ? G.blue : G.accent} stroke={G.white} strokeWidth={isSelected ? 2 : 0} />;
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {stats.selected_season && (
                      <div style={{ fontSize: 11, color: G.gray400, marginTop: 6, textAlign: "right" }}>
                        ● Highlighted dot = selected season ({stats.selected_season}) · Chart always shows full career trend
                      </div>
                    )}
                  </Card>
                )}

                {/* Phase Breakdown */}
                {stats.phases?.length > 0 && (
                  <Card style={{ marginBottom: 16 }}>
                    <SectionTitle icon="🕐">Performance by Phase</SectionTitle>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.phases}>
                          <CartesianGrid strokeDasharray="3 3" stroke={G.gray100} vertical={false} />
                          <XAxis dataKey="phase" tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="sr"  name="Strike Rate" fill={G.green}  radius={[3,3,0,0]} />
                          <Bar dataKey="avg" name="Average"     fill={G.blue}   radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {/* Weakness + Dismissal */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <Card>
                    <SectionTitle icon="⚠️">Weakness Analysis</SectionTitle>
                    {weaknesses.map((w, i) => (
                      <div key={i} style={{
                        padding: "12px 14px", borderRadius: 8, marginBottom: 8,
                        background: w.severity === "high" ? G.redLight : w.severity === "medium" ? G.amberLight : G.greenLight,
                        border: `1px solid ${w.severity === "high" ? "#fca5a5" : w.severity === "medium" ? "#fcd34d" : "#86efac"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{w.type}</span>
                          <Badge
                            label={w.severity === "high" ? "Most Vulnerable" : w.severity === "medium" ? "Moderate Risk" : "Comfortable"}
                            color={w.severity === "high" ? G.red : w.severity === "medium" ? G.amber : G.green}
                            bg={w.severity === "high" ? "#fee2e2" : w.severity === "medium" ? "#fef3c7" : G.greenLight}
                          />
                        </div>
                        <div style={{ fontSize: 12, color: G.gray500, marginTop: 4 }}>
                          SR {w.sr} · Dismissal prob {(w.dismissalProb * 100).toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </Card>

                  <Card>
                    <SectionTitle icon="🎯">Dismissal Analysis</SectionTitle>
                    <div style={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={stats.dismissals} cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={2}
                            label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                            {stats.dismissals.map((d, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>

                {/* AI Insight */}
                <AIInsightBox prompt={aiPrompt} triggerKey={aiKey} disabled={!player || !stats} />

                {/* Form SR */}
                {stats.form_sr_last5 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                    <Card style={{ borderTop: `3px solid ${G.green}` }}>
                      <SectionTitle icon="🔥">Recent Form</SectionTitle>
                      <div style={{ fontSize: 32, fontWeight: 800, color: G.green, fontFamily: "'Barlow Condensed', sans-serif" }}>{stats.form_sr_last5}</div>
                      <div style={{ fontSize: 12, color: G.gray500, marginTop: 4 }}>Strike Rate (last 5 innings vs spin)</div>
                      <div style={{ fontSize: 12, color: G.gray600, marginTop: 8 }}>Career SR vs spin: <strong>{stats.sr}</strong></div>
                    </Card>
                    <Card style={{ borderTop: `3px solid ${G.blue}` }}>
                      <SectionTitle icon="🧠">Batter Archetype</SectionTitle>
                      <div style={{ fontSize: 22, fontWeight: 700, color: G.blue, fontFamily: "'Barlow Condensed', sans-serif" }}>{stats.cluster_name}</div>
                      <div style={{ fontSize: 12, color: G.gray500, marginTop: 8 }}>Rotation: {stats.rotation_pct}% · Six rate: {stats.six_pct}%</div>
                    </Card>
                  </div>
                )}
              </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

// ─── PAGE 2: MATCH PREDICTION ──────────────────────────────────────────────────
function PredictionPage({ players, venues, teams, spinBowlers, apiOk }) {
  const [player,      setPlayer]      = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [venue,       setVenue]       = useState("");
  const [oppTeam,     setOppTeam]     = useState("");
  const [phase,       setPhase]       = useState("Middle");
  const [spinType,    setSpinType]    = useState("right-arm offbreak");
  const [innings,     setInnings]     = useState(1);
  const [nBalls,      setNBalls]      = useState(12);
  const [predResult,  setPredResult]  = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [aiPredText,  setAiPredText]  = useState("");
  const [aiPredLoad,  setAiPredLoad]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState("");
  const [oppBowler,   setOppBowler]   = useState(null);

  // Init venue & team when lists load
  useEffect(() => { if (venues.length && !venue) setVenue(venues[0]); }, [venues]);
  useEffect(() => { if (teams.length  && !oppTeam) setOppTeam(teams[0]); }, [teams]);

  // Load player stats when player selected
  useEffect(() => {
    if (!player || !apiOk) { setPlayerStats(null); return; }
    apiFetch(`/player-stats/${player.ID}`)
      .then(d => setPlayerStats(d.error ? null : d))
      .catch(() => {});
  }, [player?.ID, apiOk]);

  const generate = async () => {
    if (!player) return;
    setPredLoading(true); setPredResult(null); setAiPredText(""); setSaveMsg("");
    try {
      const data = await apiFetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: player.ID, spin_type: spinType, phase, venue, innings, n_balls: nBalls }),
      });
      setPredResult(data);

      // AI explanation
      setAiPredLoad(true); setAiPredText("");
      const spinLabel = SPIN_TYPE_OPTIONS.find(s => s.value === spinType)?.label || spinType;
      const prompt = `You are an IPL cricket match predictor. Explain this prediction for ${player.longName || player.Name}:
Match: vs ${oppTeam} at ${venue}, ${PHASE_OPTIONS.find(p=>p.value===phase)?.label}, Innings ${innings}
Spin type: ${spinLabel}, Balls to predict: ${nBalls}${oppBowler ? `\nOpponent Bowler: ${oppBowler.longName || oppBowler.Name} (${oppBowler.spinLabel})` : ""}
Predicted: ${data.predicted_runs} runs, SR: ${data.predicted_sr}, Dismissal prob/ball: ${data.dismissal_prob_pct}%
Expected runs (risk-adj): ${data.expected_runs}, Dismiss in spell: ${data.dismiss_in_spell_pct}%
Confidence: ${data.confidence}%, Cluster: ${data.cluster_name}, Model: ${data.model_version}
Explain in 3-4 sentences: why this was predicted, key tactical factors, what could make it wrong, and a fantasy cricket recommendation.`;
      try { await callClaude(prompt, t => setAiPredText(t)); } catch {}
      setAiPredLoad(false);
    } catch (e) {
      setPredResult({ error: e.message });
    }
    setPredLoading(false);
  };


  const riskColor = predResult?.confidence >= 75 ? G.green : predResult?.confidence >= 55 ? G.amber : G.red;
  const riskLabel = predResult?.confidence >= 75 ? "Low Risk" : predResult?.confidence >= 55 ? "Medium Risk" : "High Risk";

  if (!apiOk) return <EmptyState icon="🔌" text="Flask API is offline. Start it to use Match Prediction." />;

  return (
    <div style={{ padding: "24px" }}>
      {/* Batter selector */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle icon="🏏">Select Batter</SectionTitle>
        <div style={{ maxWidth: 500 }}>
          <PlayerSearch players={players} selected={player} onSelect={p => { setPlayer(p); setPredResult(null); setAiPredText(""); }} />
        </div>
        {player && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "12px 16px", background: G.greenLight, borderRadius: 8 }}>
            <Avatar name={player.longName || player.Name} size={48} color={G.green} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{player.longName || player.Name}</div>
              <div style={{ fontSize: 12, color: G.gray500 }}>{player.longBattingStyles || "Batter"}</div>
            </div>
            {playerStats && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif" }}>{playerStats.sr}</div>
                <div style={{ fontSize: 10, color: G.gray400, textTransform: "uppercase" }}>Career SR vs Spin</div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Match Setup */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionTitle icon="🏟️">Venue & Opponent</SectionTitle>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Venue</label>
            <select value={venue} onChange={e => setVenue(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}>
              {venues.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Opponent Team</label>
              <select value={oppTeam} onChange={e => setOppTeam(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}>
                {teams.map(t => <option key={t}>{t}</option>)}
              </select>
          </div>
        </Card>

        <Card>
          <SectionTitle icon="🕐">Match Phase</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PHASE_OPTIONS.map(p => (
              <div key={p.value} onClick={() => setPhase(p.value)} style={{
                padding: "11px 16px", borderRadius: 8, cursor: "pointer",
                background: phase === p.value ? G.green : G.gray50,
                color: phase === p.value ? G.white : G.gray700,
                border: `1px solid ${phase === p.value ? G.green : G.gray200}`,
                fontSize: 14, fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif",
                transition: "all 0.15s",
              }}>{p.label}</div>
            ))}
          </div>
        </Card>
      </div>

      {/* Spin & Innings Setup */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle icon="🌀">Spin & Innings Setup</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Spin Type</label>
            <select value={spinType} onChange={e => setSpinType(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}>
              {SPIN_TYPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Innings</label>
            <select value={innings} onChange={e => setInnings(Number(e.target.value))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}>
              <option value={1}>Innings 1</option>
              <option value={2}>Innings 2</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Balls to Predict</label>
            <select value={nBalls} onChange={e => setNBalls(Number(e.target.value))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}>
              {[6,12,18,24,30].map(n => <option key={n} value={n}>{n} balls</option>)}
            </select>
          </div>
        </div>
      </Card>

  
      {/* Generate Button */}
      <button onClick={generate} disabled={predLoading || !player} style={{
        width: "100%", padding: "14px", background: !player ? G.gray300 : G.green, color: G.white,
        border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: !player ? "not-allowed" : "pointer",
        fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, marginBottom: 20, transition: "all 0.15s",
      }}>{predLoading ? "⚙ Running Model…" : "✨ Generate AI Prediction"}</button>

      {/* Error */}
      {predResult?.error && (
        <Card style={{ marginBottom: 16, borderLeft: `4px solid ${G.red}`, background: G.redLight }}>
          <div style={{ color: G.red, fontSize: 13 }}>❌ Prediction failed: {predResult.error}</div>
        </Card>
      )}

      {/* Results */}
      {predResult && !predResult.error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            <KpiCard label="Predicted Runs"    value={predResult.predicted_runs}        icon="🏏" color={G.green} />
            <KpiCard label="Strike Rate"       value={predResult.predicted_sr}          icon="⚡" color={G.blue} />
            <KpiCard label="Dismissal Prob/ball" value={`${predResult.dismissal_prob_pct}%`} icon="🎯" color={G.red} />
            <KpiCard label={`Dismiss in ${nBalls}b`} value={`${predResult.dismiss_in_spell_pct}%`} icon="💥" color={G.amber} />
          </div>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionTitle icon="📊">Confidence Score</SectionTitle>
              <Badge label={riskLabel} color={riskColor} bg={riskColor === G.red ? G.redLight : riskColor === G.amber ? G.amberLight : G.greenLight} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: G.gray900, fontFamily: "'Barlow Condensed', sans-serif", minWidth: 60 }}>{predResult.confidence}%</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 10, background: G.gray100, borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: `${predResult.confidence}%`, height: "100%", background: `linear-gradient(90deg, ${G.green}, ${G.greenMid})`, borderRadius: 5, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ fontSize: 11, color: G.gray400, marginTop: 4 }}>
                  {predResult.model_version} model · {predResult.features_used} features · Cluster: {predResult.cluster_name}
                </div>
              </div>
            </div>
          </Card>

          {/* Matchup Notes */}
          <Card style={{ marginBottom: 16, borderLeft: `4px solid ${G.accent}` }}>
            <SectionTitle icon="💡">Matchup Analysis</SectionTitle>
            {[
              `${player.longName || player.Name} predicted SR of ${predResult.predicted_sr} vs ${SPIN_TYPE_OPTIONS.find(s=>s.value===spinType)?.label} at ${venue} (${PHASE_OPTIONS.find(p=>p.value===phase)?.label}).`,
              `Expected runs adjusted for dismissal risk: ${predResult.expected_runs} runs in ${nBalls} balls.`,
              `${predResult.cluster_name} archetype — ${predResult.confidence >= 75 ? "high confidence prediction based on strong historical data." : predResult.confidence >= 55 ? "moderate confidence — some variability expected." : "low confidence — limited historical data for this matchup."}`,
            ].map((note, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ color: G.accent, flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 13, color: G.gray700 }}>{note}</span>
              </div>
            ))}
          </Card>

          {/* AI Explanation */}
          <div style={{ background: G.greenLight, border: `1px solid ${G.green}30`, borderRadius: 12, padding: "18px 20px", borderLeft: `4px solid ${G.green}`, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Prediction Explanation</span>
            </div>
            {aiPredLoad && !aiPredText && <div style={{ color: G.gray400, fontSize: 13 }}>Generating explanation…</div>}
            {aiPredText && <p style={{ fontSize: 13.5, color: G.gray700, lineHeight: 1.8, margin: 0 }}>{aiPredText}</p>}
          </div>

          {/* Save Button */}
          {/* <button onClick={savePred} disabled={saving || !!saveMsg} style={{
            width: "100%", padding: "12px", background: saveMsg ? G.gray200 : G.gray800, color: saveMsg ? G.gray500 : G.white,
            border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 8, transition: "all 0.15s",
          }}>{saving ? "Saving…" : "💾 Save Prediction"}</button>
          {saveMsg && <div style={{ fontSize: 12, color: saveMsg.startsWith("✅") ? G.green : G.red, textAlign: "center" }}>{saveMsg}</div>}
        */}
        </>   
      )}
      
    </div>
  );
}

// ─── PAGE 3: SAVED PREDICTIONS ─────────────────────────────────────────────────
function SavedPage({ apiOk }) {
  const [preds,     setPreds]    = useState([]);
  const [summary,   setSummary]  = useState(null);
  const [loading,   setLoading]  = useState(false);
  const [selected,  setSelected] = useState(null);
  const [aiReview,  setAiReview] = useState("");
  const [aiLoading, setAiLoad]   = useState(false);
  // Update form
  const [actualRuns, setActualRuns] = useState("");
  const [actualSR,   setActualSR]   = useState("");
  const [dismissed,  setDismissed]  = useState(false);
  const [updMsg,     setUpdMsg]     = useState("");

  const load = useCallback(() => {
    if (!apiOk) return;
    setLoading(true);
    apiFetch("/saved-predictions")
      .then(data => {
        // Handle both old bare-array format and new envelope format
        if (Array.isArray(data)) {
          setPreds(data); setSummary(null);
        } else {
          setPreds(data.predictions || []); setSummary(data.summary || null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiOk]);

  useEffect(() => { load(); }, [load]);

  const openDetail = (p) => {
    if (selected?.id === p.id) { setSelected(null); setAiReview(""); setUpdMsg(""); return; }
    setSelected(p); setAiReview(""); setUpdMsg("");
    setActualRuns(p.actual_runs ?? "");
    setActualSR(p.actual_sr ?? "");
    setDismissed(p.dismissed ?? false);
  };

  const updatePred = async () => {
    if (!selected) return;
    try {
      const res = await apiFetch(`/update-prediction/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual_runs: Number(actualRuns), actual_sr: Number(actualSR), dismissed }),
      });
      setUpdMsg(`✅ Marked as: ${res.status}`);
      load();
    } catch { setUpdMsg("❌ Update failed."); }
  };

  const deletePred = async (id) => {
    if (!window.confirm("Delete this prediction?")) return;
    await apiFetch(`/saved-predictions/${id}`, { method: "DELETE" }).catch(() => {});
    if (selected?.id === id) setSelected(null);
    load();
  };

  const generateReview = async (pred) => {
    setAiReview(""); setAiLoad(true);
    const prompt = `You are an IPL cricket AI analyst reviewing prediction accuracy.
Match: ${pred.match} at ${pred.venue || ""} · Phase: ${pred.phase || ""} · Spin: ${pred.spin_type || ""}
Batter: ${pred.batter_name || pred.batter}
Predicted: ${pred.predicted_runs} runs, SR: ${pred.predicted_sr}, Dismissal Prob: ${pred.dismissal_prob}%
Actual: ${pred.actual_runs ?? "not recorded"} runs, SR: ${pred.actual_sr ?? "not recorded"}, ${pred.dismissed ? "Was dismissed" : "Not dismissed"}
Status: ${pred.status} · Model: ${pred.model_version || ""} · Confidence: ${pred.confidence}%
Provide a post-match AI review in 3-4 sentences: why the prediction was ${(pred.status||"").toLowerCase()}, what caused any discrepancy, what the model learned, and how to improve future predictions. End with "What Went Right" and "What Went Wrong".`;
    try { await callClaude(prompt, t => setAiReview(t)); }
    catch { setAiReview("AI review unavailable."); }
    setAiLoad(false);
  };

  const accColor = a => a === "Accurate" ? G.green : a === "Partially Accurate" ? G.amber : a === "Inaccurate" ? G.red : G.gray500;
  const accBg    = a => a === "Accurate" ? G.greenLight : a === "Partially Accurate" ? G.amberLight : a === "Inaccurate" ? G.redLight : G.gray100;

  if (!apiOk) return <EmptyState icon="🔌" text="Flask API is offline. Start it to view saved predictions." />;

  // Use summary from API if available, else compute from local preds
  const total      = summary?.total      ?? preds.length;
  const accurate   = summary?.accurate   ?? preds.filter(p => p.status === "Accurate").length;
  const partial    = summary?.partial    ?? preds.filter(p => p.status === "Partially Accurate").length;
  const avgDiff    = summary?.avg_run_diff ?? (preds.filter(p => p.actual_runs != null).length
    ? Math.round(preds.filter(p=>p.actual_runs!=null).reduce((s,p)=>s+Math.abs((p.actual_runs||0)-(p.predicted_runs||0)),0) / preds.filter(p=>p.actual_runs!=null).length)
    : null);

  return (
    <div style={{ padding: "24px" }}>
      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Predictions" value={total}    icon="📋" color={G.blue} />
        <KpiCard label="Accurate"          value={accurate} icon="✅" color={G.green}
          sub={total > 0 ? `${Math.round(accurate/total*100)}% accuracy` : ""} />
        <KpiCard label="Partially Accurate" value={partial} icon="🟡" color={G.amber} />
        <KpiCard label="Avg Run Difference" value={avgDiff != null ? `${avgDiff}` : "—"} icon="📉" color={G.red} sub="runs off target" />
      </div>

      {/* Table */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <SectionTitle icon="📊">Prediction History</SectionTitle>
          <button onClick={load} style={{ padding: "5px 12px", background: G.gray100, border: `1px solid ${G.gray200}`, borderRadius: 6, fontSize: 12, cursor: "pointer", color: G.gray600, fontFamily: "'Barlow Condensed', sans-serif" }}>↺ Refresh</button>
        </div>

        {loading && <Spinner text="Loading predictions…" />}
        {!loading && preds.length === 0 && (
          <EmptyState icon="📭" text="No saved predictions yet. Generate and save one from Match Prediction." />
        )}
        {!loading && preds.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif" }}>
              <thead>
                <tr style={{ background: G.gray50 }}>
                  {["Batter","Match","Venue","Phase","Spin","Pred Runs","Actual","Diff","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: G.gray600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", borderBottom: `2px solid ${G.gray200}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preds.map(pred => {
                  const diff = pred.actual_runs != null ? (pred.actual_runs - pred.predicted_runs) : null;
                  return (
                    <tr key={pred.id} style={{ borderBottom: `1px solid ${G.gray100}`, background: selected?.id === pred.id ? G.greenLight : "transparent", transition: "background 0.1s", cursor: "pointer" }}
                      onClick={() => openDetail(pred)}
                      onMouseEnter={e => { if (selected?.id !== pred.id) e.currentTarget.style.background = G.gray50; }}
                      onMouseLeave={e => { if (selected?.id !== pred.id) e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ padding: "12px", fontWeight: 700, color: G.gray800 }}>{pred.batter_name || pred.batter}</td>
                      <td style={{ padding: "12px", color: G.gray600 }}>{pred.match}</td>
                      <td style={{ padding: "12px", color: G.gray500, maxWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pred.venue || "—"}</td>
                      <td style={{ padding: "12px", color: G.gray500 }}>{pred.phase || "—"}</td>
                      <td style={{ padding: "12px", color: G.gray500, fontSize: 11 }}>{pred.spin_type || "—"}</td>
                      <td style={{ padding: "12px", fontWeight: 700, color: G.blue }}>{pred.predicted_runs ?? "—"}</td>
                      <td style={{ padding: "12px", fontWeight: 700, color: G.gray800 }}>{pred.actual_runs ?? "—"}</td>
                      <td style={{ padding: "12px", fontWeight: 700, color: diff == null ? G.gray400 : diff >= 0 ? G.green : G.red }}>
                        {diff == null ? "—" : `${diff >= 0 ? "+" : ""}${diff}`}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge label={pred.status || "Pending"} color={accColor(pred.status)} bg={accBg(pred.status)} />
                      </td>
                      <td style={{ padding: "12px" }}>
                        <button onClick={e => { e.stopPropagation(); deletePred(pred.id); }}
                          style={{ padding: "4px 8px", background: "transparent", border: `1px solid ${G.gray200}`, borderRadius: 5, cursor: "pointer", fontSize: 13, color: G.gray400 }}>🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail Panel */}
      {selected && (
        <Card style={{ marginBottom: 16, borderTop: `3px solid ${accColor(selected.status)}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <SectionTitle icon="🔍">Detailed Comparison — {selected.match}</SectionTitle>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge label={selected.status || "Pending"} color={accColor(selected.status)} bg={accBg(selected.status)} />
              <button onClick={() => { setSelected(null); setAiReview(""); }} style={{ padding: "4px 8px", background: G.gray100, border: `1px solid ${G.gray200}`, borderRadius: 5, cursor: "pointer", fontSize: 13, color: G.gray500 }}>✕</button>
            </div>
          </div>

          {/* Predicted vs Actual */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ background: G.blueLight, borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Predicted</div>
              {[
                { label: "Runs",         value: selected.predicted_runs },
                { label: "Strike Rate",  value: selected.predicted_sr   },
                { label: "Dismissal Prob", value: `${selected.dismissal_prob ?? "—"}%` },
                { label: "Confidence",   value: `${selected.confidence  ?? "—"}%` },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: G.gray600 }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{r.value ?? "—"}</span>
                </div>
              ))}
            </div>
            <div style={{ background: G.greenLight, borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Actual</div>
              {[
                { label: "Runs",        value: selected.actual_runs ?? "Not recorded" },
                { label: "Strike Rate", value: selected.actual_sr   ?? "Not recorded" },
                { label: "Dismissed",   value: selected.dismissed === true ? "Yes" : selected.dismissed === false ? "No" : "Unknown" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: G.gray600 }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Update form — only shown for Pending predictions */}
          {(!selected.status || selected.status === "Pending") && (
            <div style={{ marginBottom: 16, padding: "14px 16px", background: G.gray50, borderRadius: 10, border: `1px solid ${G.gray200}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: G.gray700, marginBottom: 12 }}>Enter Actual Results to Update Accuracy</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
                <div>
                  <label style={{ fontSize: 10, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 3 }}>Actual Runs</label>
                  <input type="number" value={actualRuns} onChange={e => setActualRuns(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${G.gray300}`, borderRadius: 7, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 3 }}>Actual SR</label>
                  <input type="number" value={actualSR} onChange={e => setActualSR(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${G.gray300}`, borderRadius: 7, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 3 }}>Dismissed</label>
                  <select value={dismissed.toString()} onChange={e => setDismissed(e.target.value === "true")}
                    style={{ width: "100%", padding: "8px 10px", border: `1px solid ${G.gray300}`, borderRadius: 7, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, outline: "none", cursor: "pointer" }}>
                    <option value="false">Not Out</option>
                    <option value="true">Out</option>
                  </select>
                </div>
                <button onClick={updatePred} style={{ padding: "9px 16px", background: G.green, color: G.white, border: "none", borderRadius: 7, fontWeight: 600, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, whiteSpace: "nowrap" }}>Update</button>
              </div>
              {updMsg && <div style={{ marginTop: 8, fontSize: 12, color: updMsg.startsWith("✅") ? G.green : G.red }}>{updMsg}</div>}
            </div>
          )}

          {/* Comparison chart */}
          {selected.actual_runs != null && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: G.gray600, marginBottom: 8 }}>Predicted vs Actual Runs</div>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ name: "Runs", predicted: selected.predicted_runs, actual: selected.actual_runs }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke={G.gray100} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="predicted" name="Predicted" fill={G.blue}  radius={[3,3,0,0]} />
                    <Bar dataKey="actual"    name="Actual"    fill={G.green} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* AI Post-Match Review */}
          <div style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 10, padding: "16px", borderLeft: `4px solid ${G.green}`, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🤖</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Post-Match Review</span>
              </div>
              <button onClick={() => generateReview(selected)} disabled={aiLoading} style={{ padding: "5px 12px", background: G.green, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {aiLoading ? "Generating…" : "AI Review"}
              </button>
            </div>
            {aiLoading && !aiReview && <div style={{ color: G.gray400, fontSize: 13 }}>Generating AI review…</div>}
            {aiReview && <p style={{ fontSize: 13.5, color: G.gray700, lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{aiReview}</p>}
            {!aiReview && !aiLoading && <p style={{ fontSize: 13, color: G.gray400, margin: 0, fontStyle: "italic" }}>Click "AI Review" to generate a post-match analysis.</p>}
          </div>

          {/* Model Info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { label: "Confidence",    value: `${selected.confidence ?? "—"}%`, color: G.blue  },
              { label: "Prediction Error", value: selected.actual_runs != null ? `${Math.abs(selected.actual_runs - selected.predicted_runs)} runs` : "—", color: G.red },
              { label: "Model",         value: selected.model_version || "—",   color: G.green },
            ].map(m => (
              <div key={m.label} style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: m.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{m.value}</div>
                <div style={{ fontSize: 10, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page,      setPage]      = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [players,   setPlayers]   = useState([]);
  const [venues,    setVenues]    = useState([]);
  const [teams,     setTeams]     = useState([]);
  const [spinBowlers, setSpinBowlers] = useState([]);
  const [photoMap,  setPhotoMap]  = useState({}); // ID -> imgUrl, loaded from /2026_players_details.csv

  // Health poll every 10s
  useEffect(() => {
   const check = async () => {
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2500) });
    setApiStatus(r.ok ? "connected" : "disconnected");
  } catch { setApiStatus("disconnected"); }
};
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  // Load reference data once API is up
  useEffect(() => {
    if (apiStatus !== "connected") return;
    apiFetch("/players").then(setPlayers).catch(() => {});
    apiFetch("/venues").then(d => setVenues(d.map(v => v.venue || v))).catch(() => {});
    apiFetch("/teams").then(setTeams).catch(() => {});
    apiFetch("/spin-bowlers").then(setSpinBowlers).catch(() => {});
  }, [apiStatus]);

  // Load player photo lookup map from the CSV in /public once, independent of API status.
  useEffect(() => {
    loadPlayerPhotoMap(PLAYERS_CSV_URL)
      .then(setPhotoMap)
      .catch(() => setPhotoMap({}));
  }, []);

  const apiOk = apiStatus === "connected";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Inter:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f3f4f6; font-family: 'Inter', sans-serif; min-height: 100vh; }
        button, select, input { font-family: inherit; }
        select { appearance: none; }
        @keyframes blink { 0%,80%,100% { opacity: 0.2; } 40% { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        input:focus, select:focus { border-color: #1a7340 !important; box-shadow: 0 0 0 3px rgba(26,115,64,0.1); }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Topbar page={page} apiStatus={apiStatus} batterCount={players.length} />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {page === "dashboard"  && <DashboardPage  players={players} venues={venues} apiOk={apiOk} photoMap={photoMap} />}
            {page === "prediction" && <PredictionPage players={players} venues={venues} teams={teams} spinBowlers={spinBowlers} apiOk={apiOk} />}
            {page === "saved"      && <SavedPage apiOk={apiOk} />}
          </div>
        </div>
      </div>
    </>
  );
}