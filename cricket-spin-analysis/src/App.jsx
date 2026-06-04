import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from "recharts";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const G = {
  green: "#1a7340",
  greenLight: "#e8f5ee",
  greenMid: "#2da060",
  accent: "#f97316",
  accentLight: "#fff7ed",
  blue: "#1e40af",
  blueLight: "#eff6ff",
  red: "#dc2626",
  redLight: "#fef2f2",
  amber: "#d97706",
  amberLight: "#fffbeb",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",
  white: "#ffffff",
};

// ─── MOCK DATA ─────────────────────────────────────────────────────────────────
const PLAYERS = [
  { id: 1, name: "Virat Kohli", team: "Royal Challengers Bengaluru", role: "Top Order Batter", style: "Right Handed Bat", img: "https://i.ibb.co/7NbR2Hj/kohli.png", age: 36, debut: 2008 },
  { id: 2, name: "Rohit Sharma", team: "Mumbai Indians", role: "Top Order Batter", style: "Right Handed Bat", img: null, age: 37, debut: 2007 },
  { id: 3, name: "KL Rahul", team: "Lucknow Super Giants", role: "Top Order Batter / WK", style: "Right Handed Bat", img: null, age: 32, debut: 2016 },
  { id: 4, name: "Shubman Gill", team: "Gujarat Titans", role: "Top Order Batter", style: "Right Handed Bat", img: null, age: 25, debut: 2019 },
  { id: 5, name: "David Warner", team: "Delhi Capitals", role: "Top Order Batter", style: "Left Handed Bat", img: null, age: 37, debut: 2009 },
  { id: 6, name: "Rishabh Pant", team: "Delhi Capitals", role: "Wicket Keeper Batter", style: "Left Handed Bat", img: null, age: 26, debut: 2016 },
  { id: 7, name: "Hardik Pandya", team: "Mumbai Indians", role: "All Rounder", style: "Right Handed Bat", img: null, age: 30, debut: 2015 },
  { id: 8, name: "Suryakumar Yadav", team: "Mumbai Indians", role: "Middle Order Batter", style: "Right Handed Bat", img: null, age: 33, debut: 2012 },
];

const SPIN_TYPES = ["Off Spin", "Leg Spin", "Left Arm Orthodox", "Left Arm Wrist Spin", "All Spin"];
const SEASONS = ["All Seasons", "2024", "2023", "2022", "2021", "2020"];
const VENUES = ["All Venues", "Wankhede Stadium", "M. A. Chidambaram Stadium", "Eden Gardens", "Arun Jaitley Stadium", "Chinnaswamy Stadium"];
const IPL_TEAMS = ["Chennai Super Kings", "Mumbai Indians", "Royal Challengers Bengaluru", "Kolkata Knight Riders", "Delhi Capitals", "Sunrisers Hyderabad", "Rajasthan Royals", "Punjab Kings", "Lucknow Super Giants", "Gujarat Titans"];
const PHASES = ["Powerplay", "Middle Overs", "Death Overs"];

const SPIN_BOWLERS = [
  { id: 1, name: "Yuzvendra Chahal", type: "Leg Spin", team: "Rajasthan Royals" },
  { id: 2, name: "Ravindra Jadeja", type: "Left Arm Orthodox", team: "Chennai Super Kings" },
  { id: 3, name: "Varun Chakravarthy", type: "Off Spin", team: "Kolkata Knight Riders" },
  { id: 4, name: "Kuldeep Yadav", type: "Left Arm Wrist Spin", team: "Delhi Capitals" },
  { id: 5, name: "R. Ashwin", type: "Off Spin", team: "Chennai Super Kings" },
  { id: 6, name: "Imran Tahir", type: "Leg Spin", team: "Chennai Super Kings" },
];

function getPlayerStats(playerId) {
  const seed = playerId * 13;
  const rand = (min, max, s = 1) => Math.round((min + ((seed * s * 7919) % (max - min))) * 10) / 10;
  return {
    strikeRate: rand(95, 148),
    dotBallPct: rand(22, 38),
    boundaryPct: rand(14, 26),
    dismissalRate: rand(8, 18),
    avgRuns: rand(24, 48),
    ballsPerDismissal: rand(18, 42),
    spinComparison: [
      { type: "Off Spin", sr: rand(100, 145, 1), avg: rand(28, 52, 1), balls: rand(80, 280, 1) },
      { type: "Leg Spin", sr: rand(88, 135, 2), avg: rand(22, 45, 2), balls: rand(60, 220, 2) },
      { type: "LA Orthodox", sr: rand(110, 155, 3), avg: rand(30, 55, 3), balls: rand(40, 180, 3) },
      { type: "LA Wrist Spin", sr: rand(82, 130, 4), avg: rand(18, 42, 4), balls: rand(30, 140, 4) },
    ],
    runsDistribution: [
      { name: "Singles", value: rand(38, 48, 1), color: "#22c55e" },
      { name: "Twos", value: rand(8, 14, 2), color: "#3b82f6" },
      { name: "Fours", value: rand(18, 28, 3), color: "#f59e0b" },
      { name: "Sixes", value: rand(8, 16, 4), color: "#ef4444" },
      { name: "Dots", value: rand(10, 18, 5), color: "#9ca3af" },
    ],
    seasonalTrend: [
      { season: "2019", sr: rand(90, 130, 1), avg: rand(20, 40, 1) },
      { season: "2020", sr: rand(92, 132, 2), avg: rand(22, 42, 2) },
      { season: "2021", sr: rand(95, 140, 3), avg: rand(25, 45, 3) },
      { season: "2022", sr: rand(100, 145, 4), avg: rand(28, 48, 4) },
      { season: "2023", sr: rand(105, 150, 5), avg: rand(30, 50, 5) },
      { season: "2024", sr: rand(108, 155, 6), avg: rand(32, 52, 6) },
    ],
    weaknesses: [
      { type: "Leg Spin", severity: "high", dismissals: rand(8, 18, 2) },
      { type: "Left Arm Wrist Spin", severity: "medium", dismissals: rand(5, 12, 3) },
      { type: "Off Spin", severity: "low", dismissals: rand(3, 8, 1) },
    ],
    dismissalTypes: [
      { name: "Caught", value: 42, color: "#ef4444" },
      { name: "LBW", value: 24, color: "#f59e0b" },
      { name: "Bowled", value: 18, color: "#3b82f6" },
      { name: "Stumped", value: 16, color: "#8b5cf6" },
    ],
  };
}

const SAVED_PREDICTIONS = [
  { id: 1, match: "RCB vs RR", date: "Apr 14, 2024", venue: "Chinnaswamy Stadium", batter: "Virat Kohli", predictedRuns: 42, actualRuns: 38, predictedSR: 135.5, actualSR: 122.6, dismissalProb: 68, dismissed: true, accuracy: "Partially Accurate" },
  { id: 2, match: "MI vs CSK", date: "Apr 21, 2024", venue: "Wankhede Stadium", batter: "Rohit Sharma", predictedRuns: 31, actualRuns: 35, predictedSR: 118.2, actualSR: 134.6, dismissalProb: 52, dismissed: false, accuracy: "Accurate" },
  { id: 3, match: "DC vs KKR", date: "May 1, 2024", venue: "Arun Jaitley Stadium", batter: "David Warner", predictedRuns: 28, actualRuns: 8, predictedSR: 109.4, actualSR: 57.1, dismissalProb: 74, dismissed: true, accuracy: "Inaccurate" },
  { id: 4, match: "LSG vs GT", date: "May 8, 2024", venue: "Ekana Cricket Stadium", batter: "KL Rahul", predictedRuns: 45, actualRuns: 48, predictedSR: 140.6, actualSR: 137.2, dismissalProb: 45, dismissed: false, accuracy: "Accurate" },
];

// ─── AI CALL ───────────────────────────────────────────────────────────────────
async function callClaude(prompt, onToken) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "content_block_delta" && data.delta?.text) {
            fullText += data.delta.text;
            onToken(fullText);
          }
        } catch {}
      }
    }
  }
  return fullText;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────────
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
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
      <div style={{ fontSize: 24, fontWeight: 700, color: G.gray900, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.1 }}>{value}</div>
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

function Chip({ label, active, onClick, color = G.green }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
      fontFamily: "'Barlow Condensed', sans-serif", cursor: "pointer", border: "none",
      background: active ? color : G.gray100, color: active ? "#fff" : G.gray600,
      transition: "all 0.15s", letterSpacing: 0.3,
    }}>{label}</button>
  );
}

const CHART_COLORS = ["#1a7340", "#f97316", "#3b82f6", "#8b5cf6", "#ef4444"];

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
    { id: "prediction", label: "Match Prediction", icon: "🔮" },
    { id: "saved", label: "Saved Predictions", icon: "📋" },
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
function Topbar({ page }) {
  const titles = { dashboard: "Batter Analysis Dashboard", prediction: "Match Prediction", saved: "Saved Predictions & AI Review" };
  const subs = { dashboard: "Spin bowling matchup analysis", prediction: "AI-powered performance forecast", saved: "Prediction accuracy tracker" };
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: G.greenMid }} />
        <span style={{ fontSize: 12, color: G.gray500, fontFamily: "'Barlow Condensed', sans-serif" }}>IPL 2025 Season</span>
      </div>
      <Badge label="AI-Powered" color="#fff" bg={G.green} />
    </div>
  );
}

// ─── AI INSIGHT BOX ────────────────────────────────────────────────────────────
function AIInsightBox({ prompt, triggerKey }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true); setError(null); setText(""); setGenerated(false);
    try {
      await callClaude(prompt, (t) => setText(t));
      setGenerated(true);
    } catch (e) {
      setError("AI unavailable. Please ensure the Anthropic API is configured.");
    }
    setLoading(false);
  }, [prompt]);

  useEffect(() => { setGenerated(false); setText(""); }, [triggerKey]);

  return (
    <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", border: `1px solid ${G.green}30`, borderRadius: 12, padding: "18px 20px", borderLeft: `4px solid ${G.green}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Insight</span>
        </div>
        <button onClick={generate} disabled={loading} style={{
          padding: "6px 14px", background: G.green, color: "#fff", border: "none",
          borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "'Barlow Condensed', sans-serif", opacity: loading ? 0.7 : 1,
        }}>{loading ? "Generating…" : generated ? "Refresh" : "Generate Insight"}</button>
      </div>
      {error && <div style={{ color: G.red, fontSize: 13 }}>{error}</div>}
      {loading && !text && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: G.green, opacity: 0.4, animation: `blink 1.2s ${i * 0.2}s infinite` }} />)}
          <span style={{ fontSize: 13, color: G.gray500, marginLeft: 6 }}>Analyzing performance data…</span>
        </div>
      )}
      {text && <p style={{ fontSize: 13.5, color: G.gray700, lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{text}</p>}
      {!text && !loading && !error && (
        <p style={{ fontSize: 13, color: G.gray400, margin: 0, fontStyle: "italic" }}>Click "Generate Insight" to get AI-powered cricket analysis for this player and matchup.</p>
      )}
    </div>
  );
}

// ─── PAGE 1: DASHBOARD ─────────────────────────────────────────────────────────
function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(PLAYERS[0]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [spinType, setSpinType] = useState("All Spin");
  const [season, setSeason] = useState("All Seasons");
  const [venue, setVenue] = useState("All Venues");
  const searchRef = useRef(null);

  const filtered = PLAYERS.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.team.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = getPlayerStats(selectedPlayer.id);
  const aiKey = `${selectedPlayer.id}-${spinType}-${season}-${venue}`;
  const aiPrompt = `You are an expert IPL cricket analyst. Analyze ${selectedPlayer.name}'s batting performance against spin bowling in detail. 
Player: ${selectedPlayer.name}, Team: ${selectedPlayer.team}, Style: ${selectedPlayer.style}
Stats vs Spin — Strike Rate: ${stats.strikeRate}, Average: ${stats.avgRuns}, Dot Ball %: ${stats.dotBallPct}%, Boundary %: ${stats.boundaryPct}%, Dismissal Rate: ${stats.dismissalRate}%
Filter: ${spinType}, Season: ${season}, Venue: ${venue}

Provide 4-5 sentences covering:
1. Overall assessment vs spin
2. Key strengths and weaknesses
3. Most vulnerable spin type and why
4. Recommended bowling strategy
5. Fantasy cricket recommendation

Be specific, use actual cricket terminology, and mention the stats provided.`;

  return (
    <div>
      {/* Search */}
      <div style={{ padding: "20px 24px", background: G.gray50, borderBottom: `1px solid ${G.gray200}` }}>
        <div style={{ maxWidth: 600, position: "relative" }} ref={searchRef}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
            placeholder="Search IPL Batter…"
            style={{
              width: "100%", padding: "11px 14px 11px 40px", borderRadius: 10,
              border: `1.5px solid ${G.gray300}`, fontSize: 14, outline: "none",
              background: G.white, fontFamily: "'Barlow Condensed', sans-serif",
              transition: "border-color 0.15s",
            }}
            onFocus2={e => { e.target.style.borderColor = G.green; setShowDropdown(true); }}
          />
          {showDropdown && filtered.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 10,
              zIndex: 200, maxHeight: 260, overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}>
              {filtered.map(p => (
                <div key={p.id} onMouseDown={() => { setSelectedPlayer(p); setSearchQuery(p.name); setShowDropdown(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${G.gray100}` }}
                  onMouseEnter={e => e.currentTarget.style.background = G.greenLight}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Avatar name={p.name} size={34} color={G.green} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: G.gray500 }}>{p.team} · {p.style}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "24px" }}>
        {/* Player Hero */}
        <div style={{
          background: `linear-gradient(135deg, ${G.gray900} 0%, #0f2d1c 100%)`,
          borderRadius: 14, padding: "24px", marginBottom: 20, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, background: `${G.green}20`, borderRadius: "50%", transform: "translate(60px,-60px)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
            <Avatar name={selectedPlayer.name} size={72} color={G.green} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: G.white, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>{selectedPlayer.name}</div>
              <div style={{ fontSize: 14, color: G.greenMid, fontWeight: 600, marginTop: 2 }}>{selectedPlayer.team}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Badge label={selectedPlayer.style} color={G.white} bg={`${G.green}80`} />
                <Badge label={selectedPlayer.role} color={G.white} bg="rgba(255,255,255,0.15)" />
                <Badge label={`Age ${selectedPlayer.age}`} color={G.white} bg="rgba(255,255,255,0.1)" />
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{stats.strikeRate}</div>
              <div style={{ fontSize: 11, color: G.gray400, textTransform: "uppercase", letterSpacing: 1 }}>SR vs Spin</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: G.gray600, fontFamily: "'Barlow Condensed', sans-serif" }}>Filters:</span>
          {[
            { label: "Spin Type", value: spinType, options: SPIN_TYPES, set: setSpinType },
            { label: "Season", value: season, options: SEASONS, set: setSeason },
            { label: "Venue", value: venue, options: VENUES, set: setVenue },
          ].map(f => (
            <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)} style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`,
              fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white,
              color: G.gray700, cursor: "pointer", outline: "none",
            }}>
              {f.options.map(o => <option key={o}>{o}</option>)}
            </select>
          ))}
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
          <KpiCard label="Strike Rate vs Spin" value={stats.strikeRate} icon="⚡" color={G.green} />
          <KpiCard label="Dot Ball %" value={`${stats.dotBallPct}%`} icon="⚫" color="#6b7280" />
          <KpiCard label="Boundary %" value={`${stats.boundaryPct}%`} icon="🏏" color={G.accent} />
          <KpiCard label="Dismissal Rate" value={`${stats.dismissalRate}%`} icon="🎯" color={G.red} />
          <KpiCard label="Average vs Spin" value={stats.avgRuns} icon="📈" color={G.blue} />
          <KpiCard label="Balls / Dismissal" value={stats.ballsPerDismissal} icon="🔢" color="#8b5cf6" />
        </div>

        {/* Charts Row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SectionTitle icon="🥧">Runs Distribution</SectionTitle>
            <div style={{ height: 220, display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie data={stats.runsDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                    {stats.runsDistribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {stats.runsDistribution.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: G.gray600, flex: 1 }}>{d.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle icon="📊">Performance by Spin Type</SectionTitle>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.spinComparison} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke={G.gray100} vertical={false} />
                  <XAxis dataKey="type" tick={{ fill: G.gray500, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: G.gray500, fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: G.gray500 }} />
                  <Bar dataKey="sr" name="Strike Rate" fill={G.green} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="avg" name="Average" fill={G.accent} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Historical Trend */}
        <Card style={{ marginBottom: 16 }}>
          <SectionTitle icon="📈">Historical IPL Performance vs Spin</SectionTitle>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.seasonalTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={G.gray100} vertical={false} />
                <XAxis dataKey="season" tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: G.gray500 }} />
                <Line type="monotone" dataKey="sr" name="Strike Rate" stroke={G.green} strokeWidth={2.5} dot={{ fill: G.green, r: 4 }} />
                <Line type="monotone" dataKey="avg" name="Average" stroke={G.accent} strokeWidth={2.5} dot={{ fill: G.accent, r: 4 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Weakness + Dismissal Analysis */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SectionTitle icon="⚠️">Weakness Analysis</SectionTitle>
            {stats.weaknesses.map((w, i) => (
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
                <div style={{ fontSize: 12, color: G.gray500, marginTop: 4 }}>{w.dismissals} dismissals across IPL seasons</div>
              </div>
            ))}
          </Card>

          <Card>
            <SectionTitle icon="🎯">Dismissal Analysis</SectionTitle>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.dismissalTypes} cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={2}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {stats.dismissalTypes.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* AI Insight */}
        <AIInsightBox prompt={aiPrompt} triggerKey={aiKey} />

        {/* Strengths / Weaknesses Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <Card style={{ borderTop: `3px solid ${G.green}` }}>
            <SectionTitle icon="💪">Key Strengths</SectionTitle>
            {["Exceptional timing against Off Spin", "High boundary percentage in Powerplay", "Consistent average across seasons"].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ color: G.green, fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: G.gray700 }}>{s}</span>
              </div>
            ))}
          </Card>
          <Card style={{ borderTop: `3px solid ${G.red}` }}>
            <SectionTitle icon="⚡">Key Weaknesses</SectionTitle>
            {["Struggles against Leg Spin in Death Overs", "High dot ball percentage vs Wrist Spin", "Dismissal frequency rises in middle overs"].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ color: G.red, fontWeight: 700, flexShrink: 0 }}>✗</span>
                <span style={{ fontSize: 13, color: G.gray700 }}>{s}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE 2: MATCH PREDICTION ──────────────────────────────────────────────────
function PredictionPage() {
  const [batter, setBatter] = useState(PLAYERS[0]);
  const [venue, setVenue] = useState(VENUES[1]);
  const [oppTeam, setOppTeam] = useState(IPL_TEAMS[0]);
  const [phase, setPhase] = useState("Middle Overs");
  const [selectedBowlers, setSelectedBowlers] = useState([]);
  const [predResult, setPredResult] = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [aiPredText, setAiPredText] = useState("");
  const [aiPredLoading, setAiPredLoading] = useState(false);
  const [batSearch, setBatSearch] = useState(PLAYERS[0].name);
  const [batOpen, setBatOpen] = useState(false);

  const toggleBowler = (b) => setSelectedBowlers(prev => prev.some(x => x.id === b.id) ? prev.filter(x => x.id !== b.id) : [...prev, b]);

  const generate = async () => {
    if (selectedBowlers.length === 0) return;
    setPredLoading(true);
    await new Promise(r => setTimeout(r, 800));
    const stats = getPlayerStats(batter.id);
    const sr = stats.strikeRate + (phase === "Powerplay" ? 12 : phase === "Death Overs" ? 18 : 0);
    const balls = phase === "Powerplay" ? Math.round(18 + Math.random() * 10) : phase === "Death Overs" ? Math.round(6 + Math.random() * 6) : Math.round(14 + Math.random() * 12);
    const runs = Math.round(balls * sr / 100);
    const dismissalProb = Math.round(stats.dismissalRate + selectedBowlers.length * 3 + Math.random() * 10);
    const conf = Math.round(72 + Math.random() * 20);
    const risk = dismissalProb > 65 ? "High Risk" : dismissalProb > 45 ? "Medium Risk" : "Low Risk";
    setPredResult({ runs, balls, sr: sr.toFixed(1), dismissalProb: Math.min(90, dismissalProb), confidence: conf, risk });
    setPredLoading(false);

    setAiPredLoading(true); setAiPredText("");
    const prompt = `You are an IPL cricket match predictor. Predict ${batter.name}'s performance against selected spin bowlers.
Match Setup: vs ${oppTeam} at ${venue}, ${phase}
Selected Bowlers: ${selectedBowlers.map(b => `${b.name} (${b.type})`).join(", ")}
Predicted Stats: ${runs} runs off ${balls} balls, SR: ${sr.toFixed(1)}, Dismissal Prob: ${Math.min(90, dismissalProb)}%, Confidence: ${conf}%

Explain in 3-4 sentences:
1. Why this prediction was generated based on historical matchups
2. Key tactical factors affecting the prediction
3. What could cause the prediction to be wrong
4. Fantasy cricket recommendation (Captain/VC or avoid)`;

    try {
      await callClaude(prompt, t => setAiPredText(t));
    } catch {}
    setAiPredLoading(false);
  };

  const riskColor = predResult?.risk === "High Risk" ? G.red : predResult?.risk === "Medium Risk" ? G.amber : G.green;
  const filteredBatters = PLAYERS.filter(p => p.name.toLowerCase().includes(batSearch.toLowerCase()));

  return (
    <div style={{ padding: "24px" }}>
      {/* Batter selector */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle icon="🏏">Select Batter</SectionTitle>
        <div style={{ position: "relative", maxWidth: 400 }}>
          <input value={batSearch} onChange={e => { setBatSearch(e.target.value); setBatOpen(true); }}
            onFocus={() => setBatOpen(true)} onBlur={() => setTimeout(() => setBatOpen(false), 160)}
            placeholder="Search batter…"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${G.gray300}`, fontSize: 13, outline: "none", fontFamily: "'Barlow Condensed', sans-serif" }} />
          {batOpen && filteredBatters.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 8, zIndex: 200, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
              {filteredBatters.map(p => (
                <div key={p.id} onMouseDown={() => { setBatter(p); setBatSearch(p.name); setBatOpen(false); setPredResult(null); setAiPredText(""); }}
                  style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", borderBottom: `1px solid ${G.gray100}` }}
                  onMouseEnter={e => e.currentTarget.style.background = G.greenLight}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >{p.name} <span style={{ color: G.gray400, fontSize: 11 }}>· {p.team}</span></div>
              ))}
            </div>
          )}
        </div>
        {batter && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "12px 16px", background: G.greenLight, borderRadius: 8 }}>
            <Avatar name={batter.name} size={48} color={G.green} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{batter.name}</div>
              <div style={{ fontSize: 12, color: G.gray500 }}>{batter.team} · {batter.style}</div>
            </div>
          </div>
        )}
      </Card>

      {/* Match Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionTitle icon="🏟️">Venue & Opponent</SectionTitle>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Venue</label>
            <select value={venue} onChange={e => setVenue(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}>
              {VENUES.filter(v => v !== "All Venues").map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Opponent Team</label>
            <select value={oppTeam} onChange={e => setOppTeam(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none" }}>
              {IPL_TEAMS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </Card>

        <Card>
          <SectionTitle icon="🕐">Match Phase</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PHASES.map(p => (
              <div key={p} onClick={() => setPhase(p)} style={{
                padding: "11px 16px", borderRadius: 8, cursor: "pointer",
                background: phase === p ? G.green : G.gray50,
                color: phase === p ? G.white : G.gray700,
                border: `1px solid ${phase === p ? G.green : G.gray200}`,
                fontSize: 14, fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif",
                transition: "all 0.15s",
              }}>{p}</div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bowler Selection */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle icon="🎳">Select Spin Bowlers</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {SPIN_BOWLERS.map(b => {
            const sel = selectedBowlers.some(x => x.id === b.id);
            return (
              <div key={b.id} onClick={() => toggleBowler(b)} style={{
                padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                border: `2px solid ${sel ? G.green : G.gray200}`,
                background: sel ? G.greenLight : G.white, transition: "all 0.15s",
              }}>
                <Avatar name={b.name} size={36} color={sel ? G.green : G.gray400} />
                <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{b.name}</div>
                <div style={{ fontSize: 11, color: G.gray500, marginTop: 2 }}>{b.type}</div>
                <div style={{ fontSize: 10, color: G.gray400 }}>{b.team}</div>
              </div>
            );
          })}
        </div>
        {selectedBowlers.length === 0 && (
          <div style={{ fontSize: 12, color: G.amber, marginTop: 10, fontStyle: "italic" }}>⚠ Select at least one spin bowler to generate prediction</div>
        )}
      </Card>

      <button onClick={generate} disabled={predLoading || selectedBowlers.length === 0} style={{
        width: "100%", padding: "14px", background: selectedBowlers.length === 0 ? G.gray300 : G.green, color: G.white,
        border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: selectedBowlers.length === 0 ? "not-allowed" : "pointer",
        fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, marginBottom: 20, transition: "all 0.15s",
      }}>{predLoading ? "⚙ Generating Prediction…" : "✨ Generate AI Prediction"}</button>

      {/* Prediction Results */}
      {predResult && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Predicted Runs", value: predResult.runs, icon: "🏏", color: G.green },
              { label: "Predicted Balls", value: predResult.balls, icon: "⚽", color: G.blue },
              { label: "Strike Rate", value: predResult.sr, icon: "⚡", color: G.accent },
              { label: "Dismissal Prob", value: `${predResult.dismissalProb}%`, icon: "🎯", color: G.red },
            ].map(c => <KpiCard key={c.label} {...c} />)}
          </div>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionTitle icon="📊">Confidence Score</SectionTitle>
              <Badge label={predResult.risk} color={riskColor === G.red ? G.red : riskColor === G.amber ? G.amber : G.green} bg={riskColor === G.red ? G.redLight : riskColor === G.amber ? G.amberLight : G.greenLight} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: G.gray900, fontFamily: "'Barlow Condensed', sans-serif", minWidth: 60 }}>{predResult.confidence}%</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 10, background: G.gray100, borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: `${predResult.confidence}%`, height: "100%", background: `linear-gradient(90deg, ${G.green}, ${G.greenMid})`, borderRadius: 5, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ fontSize: 11, color: G.gray400, marginTop: 4 }}>Model confidence based on historical matchup data</div>
              </div>
            </div>
          </Card>

          {/* Matchup notes */}
          <Card style={{ marginBottom: 16, borderLeft: `4px solid ${G.accent}` }}>
            <SectionTitle icon="💡">Matchup Analysis</SectionTitle>
            {[
              `${batter.name} historically shows ${predResult.sr > 130 ? "strong" : "moderate"} performance in ${phase} against spin at ${venue}.`,
              selectedBowlers.length > 0 ? `${selectedBowlers[0].name} (${selectedBowlers[0].type}) is a key threat — watch for flight and turn.` : null,
              `Risk indicator: ${predResult.risk} — ${predResult.risk === "High Risk" ? "expect significant challenge from selected bowlers." : "conditions favour balanced performance."}`,
            ].filter(Boolean).map((note, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ color: G.accent, flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 13, color: G.gray700 }}>{note}</span>
              </div>
            ))}
          </Card>

          {/* AI Explanation */}
          <div style={{ background: G.greenLight, border: `1px solid ${G.green}30`, borderRadius: 12, padding: "18px 20px", borderLeft: `4px solid ${G.green}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Prediction Explanation</span>
            </div>
            {aiPredLoading && !aiPredText && (
              <div style={{ color: G.gray400, fontSize: 13 }}>Generating explanation…</div>
            )}
            {aiPredText && <p style={{ fontSize: 13.5, color: G.gray700, lineHeight: 1.8, margin: 0 }}>{aiPredText}</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── PAGE 3: SAVED PREDICTIONS ─────────────────────────────────────────────────
function SavedPage() {
  const [selected, setSelected] = useState(null);
  const [aiReview, setAiReview] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const generateReview = async (pred) => {
    setSelected(pred); setAiReview(""); setAiLoading(true);
    const prompt = `You are an IPL cricket AI analyst reviewing prediction accuracy.
Match: ${pred.match} at ${pred.venue}
Batter: ${pred.batter}
Predicted: ${pred.predictedRuns} runs, SR: ${pred.predictedSR}, Dismissal Prob: ${pred.dismissalProb}%
Actual: ${pred.actualRuns} runs, SR: ${pred.actualSR}, ${pred.dismissed ? "Was dismissed" : "Not dismissed"}
Accuracy: ${pred.accuracy}
Difference: ${pred.actualRuns - pred.predictedRuns} runs

Provide a post-match AI review in 3-4 sentences covering:
1. Why the prediction was ${pred.accuracy.toLowerCase()}
2. What factors caused any discrepancy (pitch, bowling changes, batting form)
3. What the model learned from this prediction
4. How this improves future predictions

End with a "What Went Right" and "What Went Wrong" section.`;
    try {
      await callClaude(prompt, t => setAiReview(t));
    } catch {
      setAiReview("AI review unavailable.");
    }
    setAiLoading(false);
  };

  const accColor = (a) => a === "Accurate" ? G.green : a === "Partially Accurate" ? G.amber : G.red;
  const accBg = (a) => a === "Accurate" ? G.greenLight : a === "Partially Accurate" ? G.amberLight : G.redLight;

  const totalPredictions = SAVED_PREDICTIONS.length;
  const accurate = SAVED_PREDICTIONS.filter(p => p.accuracy === "Accurate").length;
  const partial = SAVED_PREDICTIONS.filter(p => p.accuracy === "Partially Accurate").length;
  const avgDiff = Math.round(SAVED_PREDICTIONS.reduce((s, p) => s + Math.abs(p.actualRuns - p.predictedRuns), 0) / totalPredictions);

  return (
    <div style={{ padding: "24px" }}>
      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Predictions" value={totalPredictions} icon="📋" color={G.blue} />
        <KpiCard label="Accurate" value={accurate} icon="✅" color={G.green} sub={`${Math.round(accurate/totalPredictions*100)}% accuracy`} />
        <KpiCard label="Partially Accurate" value={partial} icon="🟡" color={G.amber} />
        <KpiCard label="Avg Run Difference" value={`${avgDiff}`} icon="📉" color={G.red} sub="runs off target" />
      </div>

      {/* Prediction History Table */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle icon="📊">Prediction History</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif" }}>
            <thead>
              <tr style={{ background: G.gray50 }}>
                {["Match", "Date", "Venue", "Batter", "Pred Runs", "Actual Runs", "Difference", "Accuracy", "Action"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: G.gray600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", borderBottom: `2px solid ${G.gray200}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SAVED_PREDICTIONS.map((pred, i) => {
                const diff = pred.actualRuns - pred.predictedRuns;
                return (
                  <tr key={pred.id} style={{ borderBottom: `1px solid ${G.gray100}`, transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = G.gray50}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px", fontWeight: 700, color: G.gray800 }}>{pred.match}</td>
                    <td style={{ padding: "12px", color: G.gray500 }}>{pred.date}</td>
                    <td style={{ padding: "12px", color: G.gray600, maxWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pred.venue}</td>
                    <td style={{ padding: "12px", fontWeight: 600, color: G.gray700 }}>{pred.batter}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: G.blue }}>{pred.predictedRuns}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: G.gray800 }}>{pred.actualRuns}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: diff >= 0 ? G.green : G.red }}>{diff >= 0 ? "+" : ""}{diff}</td>
                    <td style={{ padding: "12px" }}>
                      <Badge label={pred.accuracy} color={accColor(pred.accuracy)} bg={accBg(pred.accuracy)} />
                    </td>
                    <td style={{ padding: "12px" }}>
                      <button onClick={() => generateReview(pred)} style={{
                        padding: "5px 12px", background: G.green, color: "#fff", border: "none",
                        borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600,
                        fontFamily: "'Barlow Condensed', sans-serif",
                      }}>AI Review</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail View */}
      {selected && (
        <Card style={{ marginBottom: 16, borderTop: `3px solid ${accColor(selected.accuracy)}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <SectionTitle icon="🔍">Detailed Comparison — {selected.match}</SectionTitle>
            <Badge label={selected.accuracy} color={accColor(selected.accuracy)} bg={accBg(selected.accuracy)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: G.blueLight, borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Predicted</div>
              {[
                { label: "Runs", value: selected.predictedRuns },
                { label: "Strike Rate", value: selected.predictedSR },
                { label: "Dismissal Prob", value: `${selected.dismissalProb}%` },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: G.gray600 }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{r.value}</span>
                </div>
              ))}
            </div>
            <div style={{ background: G.greenLight, borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Actual</div>
              {[
                { label: "Runs", value: selected.actualRuns },
                { label: "Strike Rate", value: selected.actualSR },
                { label: "Dismissed", value: selected.dismissed ? "Yes" : "No" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: G.gray600 }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Post-Match Review */}
          <div style={{ marginTop: 16, background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 10, padding: "16px", borderLeft: `4px solid ${G.green}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>🤖</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>AI Post-Match Review</span>
            </div>
            {aiLoading && !aiReview && <div style={{ color: G.gray400, fontSize: 13 }}>Generating AI review…</div>}
            {aiReview && <p style={{ fontSize: 13.5, color: G.gray700, lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>{aiReview}</p>}
          </div>

          {/* Model Learning */}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { label: "Prediction Confidence", value: "78%", color: G.blue },
              { label: "Prediction Error", value: `${Math.abs(selected.actualRuns - selected.predictedRuns)} runs`, color: G.red },
              { label: "Accuracy Rating", value: selected.accuracy.split(" ")[0], color: accColor(selected.accuracy) },
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
  const [page, setPage] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Inter:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f3f4f6; font-family: 'Inter', sans-serif; min-height: 100vh; }
        button, select, input { font-family: inherit; }
        select { appearance: none; }
        @keyframes blink { 0%,80%,100% { opacity: 0.2; } 40% { opacity: 1; } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        input:focus, select:focus { border-color: #1a7340 !important; box-shadow: 0 0 0 3px rgba(26,115,64,0.1); }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar page={page} setPage={setPage} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Topbar page={page} />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {page === "dashboard" && <DashboardPage />}
            {page === "prediction" && <PredictionPage />}
            {page === "saved" && <SavedPage />}
          </div>
        </div>
      </div>
    </>
  );
}