import { useState, useEffect, useMemo, useCallback } from "react";
import Papa from "papaparse";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";

// ── Embedded player data (from 2026_players_details.csv) ─────────────────
// In production: replace with Papa.parse('/csv/2026_players_details.csv')
const PLAYERS_CSV_PATH = "/2026_players_details.csv";

// ── Spin type labels ──────────────────────────────────────────────────────
const SPIN_TYPES = {
  "right-arm offbreak": { label: "Off-break", short: "OB", color: "#4F8EF7" },
  "slow left-arm orthodox": { label: "SLA Orthodox", short: "SLA", color: "#A78BFA" },
  "legbreak": { label: "Leg-break", short: "LB", color: "#34D399" },
  "legbreak googly": { label: "Googly", short: "LBG", color: "#F59E0B" },
  "left-arm wrist-spin": { label: "LW Spin", short: "LWS", color: "#F472B6" },
};

const SPIN_STYLE_KEYS = Object.keys(SPIN_TYPES);

// ── IPL Teams ─────────────────────────────────────────────────────────────
const IPL_TEAMS = [
  "Chennai Super Kings", "Mumbai Indians", "Royal Challengers Bengaluru",
  "Kolkata Knight Riders", "Delhi Capitals", "Sunrisers Hyderabad",
  "Rajasthan Royals", "Punjab Kings", "Lucknow Super Giants", "Gujarat Titans",
];

const VENUES = [
  "Wankhede Stadium", "M. A. Chidambaram Stadium", "Eden Gardens",
  "Arun Jaitley Stadium", "Chinnaswamy Stadium", "Rajiv Gandhi Stadium",
  "Sawai Mansingh Stadium", "Punjab Cricket Association IS Bindra Stadium",
  "Ekana Cricket Stadium", "Narendra Modi Stadium",
];

// ── Deterministic mock stats from player ID ───────────────────────────────
function mockStatsFromId(id) {
  const seed = typeof id === "number" ? id : parseInt(id) || 12345;
  const rng = (offset = 0, range = 100, base = 0) =>
    base + Math.round((((seed * 7 + offset * 13) % range) + range) % range);

  const balls = rng(1, 400, 100);
  const sr = rng(2, 80, 90);
  const avg = rng(3, 40, 18);
  const dot_pct = rng(4, 40, 25);
  const boundary_pct = rng(5, 25, 10);
  const six_pct = rng(6, 12, 3);
  const wkt_rate = rng(7, 8, 2);

  const pp = rng(8, 60, 85);
  const mid = rng(9, 70, 95);
  const death = rng(10, 90, 130);
  const pp_avg = rng(11, 30, 15);
  const mid_avg = rng(12, 35, 20);
  const death_avg = rng(13, 25, 12);

  const dismissalSeed = (seed % 100);
  const bowled = Math.max(5, (dismissalSeed * 3) % 30);
  const caught = Math.max(10, (dismissalSeed * 7) % 45);
  const lbw = Math.max(5, (dismissalSeed * 11) % 20);
  const stumped = Math.max(3, (dismissalSeed * 5) % 15);
  const other = 100 - bowled - caught - lbw - stumped;

  const spinComparison = SPIN_STYLE_KEYS.map((type, i) => ({
    type: SPIN_TYPES[type].label,
    short: SPIN_TYPES[type].short,
    sr: rng(20 + i, 60, 85),
    avg: rng(30 + i, 35, 15),
    dismissalProb: parseFloat((rng(40 + i, 10, 2) / 100).toFixed(3)),
    balls: rng(50 + i, 200, 30),
  }));

  // Season trend
const seasons = ["2019", "2020", "2021", "2022", "2023", "2024", "2025","2026","2027"].map((yr, i) => ({
    season: yr,
    sr: rng(60 + i, 50, 95),
    avg: rng(70 + i, 30, 18),
    balls: rng(80 + i, 200, 40),
  }));

  return {
    balls, sr, avg, dot_pct, boundary_pct, six_pct,
    wkt_rate, dismissal_pct: wkt_rate,
    rotation_pct: rng(14, 30, 25),
    phases: [
      { phase: "Powerplay", sr: pp, avg: pp_avg, balls: rng(15, 100, 20) },
      { phase: "Middle", sr: mid, avg: mid_avg, balls: rng(16, 200, 50) },
      { phase: "Death", sr: death, avg: death_avg, balls: rng(17, 80, 15) },
    ],
    dismissals: [
      { name: "Caught", value: caught },
      { name: "Bowled", value: bowled },
      { name: "LBW", value: lbw },
      { name: "Stumped", value: stumped },
      { name: "Other", value: Math.max(0, other) },
    ],
    spinComparison,
    seasons,
  };
}

// ── Mock prediction from player + match context ───────────────────────────
function mockPrediction(player, spinType, phase, venue) {
  if (!player) return null;
  const base = mockStatsFromId(player.ID);
  const spinIdx = SPIN_STYLE_KEYS.indexOf(spinType);
  const sc = base.spinComparison[Math.max(0, spinIdx)];
  const phaseData = base.phases.find(p => p.phase.toLowerCase() === phase.toLowerCase()) || base.phases[1];

  return {
    predicted_sr: Math.round((sc.sr * 0.7 + phaseData.sr * 0.3) * 10) / 10,
    predicted_avg: Math.round((sc.avg * 0.7 + phaseData.avg * 0.3) * 10) / 10,
    dismissal_prob: parseFloat((sc.dismissalProb * 0.8 + base.wkt_rate / 100 * 0.2).toFixed(3)),
    expected_runs: Math.round(sc.avg * (1 - sc.dismissalProb) * 10) / 10,
    confidence: parseFloat(Math.min(95, 60 + Math.sqrt(sc.balls) * 1.2).toFixed(1)),
    spin_type: spinType,
    venue,
    phase,
    balls_faced: sc.balls,
  };
}

// ── Color palette ────────────────────────────────────────────────────────
// const PALETTE = {
//   primary: "#1D6FE8",
//   accent: "#06D6A0",
//   warn: "#F59E0B",
//   danger: "#EF4444",
//   purple: "#8B5CF6",
//   bg: "#0F1117",
//   surface: "#161B27",
//   surfaceHover: "#1E2535",
//   border: "rgba(255,255,255,0.07)",
//   textPrimary: "#F0F4FF",
//   textSecondary: "#8A95A8",
//   textMuted: "#4E5A6E",
// };

const DISMISS_COLORS = ["#4F8EF7", "#A78BFA", "#34D399", "#F59E0B", "#F472B6"];

// ── CSS ───────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&family=Inter:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0F1117;color:#F0F4FF;font-family:'Inter',sans-serif;min-height:100vh}
  .app{display:flex;min-height:100vh}
  .sidebar{width:220px;min-width:220px;background:#0C1020;border-right:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;padding:24px 0;position:sticky;top:0;height:100vh}
  .sidebar-logo{padding:0 20px 24px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:16px}
  .logo-icon{width:32px;height:32px;background:linear-gradient(135deg,#1D6FE8,#06D6A0);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}
  .logo-text{font-family:'Syne',sans-serif;font-weight:700;font-size:15px;color:#F0F4FF;letter-spacing:-0.3px}
  .logo-sub{font-size:10px;color:#4E5A6E;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px}
  .nav-section{padding:0 12px;margin-bottom:4px}
  .nav-label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#4E5A6E;font-family:'DM Mono',monospace;padding:8px 8px 4px}
  .nav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;transition:all .15s;font-size:13.5px;color:#8A95A8;font-weight:500;margin-bottom:2px;border:1px solid transparent}
  .nav-item:hover{background:rgba(29,111,232,0.08);color:#C5D0E6}
  .nav-item.active{background:rgba(29,111,232,0.15);color:#4F8EF7;border-color:rgba(29,111,232,0.25)}
  .nav-icon{width:18px;text-align:center;font-size:16px}
  .main{flex:1;overflow-y:auto;background:#0F1117;min-width:0}
  .topbar{height:56px;background:#0C1020;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;padding:0 28px;gap:16px;position:sticky;top:0;z-index:10}
  .topbar-title{font-family:'Syne',sans-serif;font-weight:700;font-size:17px;flex:1}
  .topbar-badge{background:rgba(29,111,232,0.15);border:1px solid rgba(29,111,232,0.3);color:#4F8EF7;font-size:11px;font-family:'DM Mono',monospace;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px}
  .content{padding:24px 28px;max-width:1200px}
  .card{background:#161B27;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px 22px}
  .card-title{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:#8A95A8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
  .card-title span{font-size:16px}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .stat-card{background:#1A2030;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 18px}
  .stat-val{font-family:'Syne',sans-serif;font-weight:800;font-size:28px;line-height:1}
  .stat-label{font-size:11px;color:#4E5A6E;text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;margin-top:4px}
  .stat-sub{font-size:12px;color:#8A95A8;margin-top:2px}
  .select-wrap{position:relative}
  .select-wrap select{appearance:none;background:#1A2030;border:1px solid rgba(255,255,255,0.1);color:#F0F4FF;padding:9px 36px 9px 12px;border-radius:9px;font-size:13.5px;cursor:pointer;width:100%;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s}
  .select-wrap select:hover,.select-wrap select:focus{border-color:rgba(29,111,232,0.5)}
  .select-wrap::after{content:'▾';position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#4E5A6E;pointer-events:none;font-size:12px}
  .player-search{position:relative}
  .player-search input{width:100%;background:#1A2030;border:1px solid rgba(255,255,255,0.1);color:#F0F4FF;padding:10px 14px 10px 36px;border-radius:9px;font-size:13.5px;outline:none;transition:border-color .15s;font-family:'Inter',sans-serif}
  .player-search input:focus{border-color:rgba(29,111,232,0.5)}
  .player-search .ps-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#4E5A6E;font-size:15px}
  .dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1A2030;border:1px solid rgba(255,255,255,0.1);border-radius:10px;z-index:50;max-height:260px;overflow-y:auto;box-shadow:0 16px 40px rgba(0,0,0,0.5)}
  .dropdown-item{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid rgba(255,255,255,0.04)}
  .dropdown-item:last-child{border-bottom:none}
  .dropdown-item:hover{background:rgba(29,111,232,0.1)}
  .player-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(255,255,255,0.1)}
  .player-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1D6FE8,#8B5CF6);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0}
  .di-name{font-size:13px;font-weight:500;color:#F0F4FF}
  .di-sub{font-size:11px;color:#4E5A6E}
  .profile-hero{display:flex;align-items:center;gap:20px;padding:20px;background:linear-gradient(135deg,rgba(29,111,232,0.12),rgba(139,92,246,0.08));border:1px solid rgba(29,111,232,0.18);border-radius:14px;margin-bottom:20px}
  .profile-img{width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(29,111,232,0.4)}
  .profile-img-placeholder{width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#1D6FE8,#8B5CF6);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;flex-shrink:0}
  .profile-name{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;line-height:1.2}
  .profile-short{font-size:13px;color:#4F8EF7;font-family:'DM Mono',monospace;margin-top:2px}
  .badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:0.5px;font-weight:500}
  .badge-rhb{background:rgba(29,111,232,0.15);color:#4F8EF7;border:1px solid rgba(29,111,232,0.25)}
  .badge-lhb{background:rgba(139,92,246,0.15);color:#A78BFA;border:1px solid rgba(139,92,246,0.25)}
  .badge-spin{background:rgba(6,214,160,0.12);color:#06D6A0;border:1px solid rgba(6,214,160,0.2)}
  .pred-card{background:linear-gradient(135deg,rgba(29,111,232,0.1),rgba(6,214,160,0.06));border:1px solid rgba(29,111,232,0.2);border-radius:14px;padding:20px 22px}
  .pred-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:600;color:#8A95A8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:16px}
  .pred-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .pred-metric{text-align:center}
  .pred-val{font-family:'Syne',sans-serif;font-weight:800;font-size:26px}
  .pred-lbl{font-size:10px;color:#4E5A6E;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px}
  .conf-bar{height:4px;background:rgba(255,255,255,0.08);border-radius:2px;margin-top:16px;overflow:hidden}
  .conf-fill{height:100%;background:linear-gradient(90deg,#1D6FE8,#06D6A0);border-radius:2px;transition:width .6s}
  .spin-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .spin-pill{padding:6px 14px;border-radius:20px;font-size:12px;font-family:'DM Mono',monospace;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:#1A2030;color:#8A95A8;transition:all .15s;font-weight:500}
  .spin-pill.active{border-color:rgba(29,111,232,0.5);background:rgba(29,111,232,0.15);color:#4F8EF7}
  .phase-pill{padding:6px 14px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:#1A2030;color:#8A95A8;transition:all .15s}
  .phase-pill.active{border-color:rgba(6,214,160,0.5);background:rgba(6,214,160,0.1);color:#06D6A0}
  .section-gap{margin-bottom:20px}
  .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;color:#4E5A6E;text-align:center}
  .empty-icon{font-size:48px;margin-bottom:16px;opacity:0.4}
  .empty-text{font-size:14px;line-height:1.6;max-width:300px}
  .chart-container{height:240px;width:100%}
  .chart-container-sm{height:200px;width:100%}
  .tab-row{display:flex;gap:4px;background:#1A2030;padding:3px;border-radius:10px;margin-bottom:20px}
  .tab{flex:1;text-align:center;padding:8px;border-radius:8px;cursor:pointer;font-size:13px;color:#4E5A6E;transition:all .15s;font-weight:500}
  .tab.active{background:#1D6FE8;color:#fff}
  .loading{display:flex;align-items:center;justify-content:center;height:200px;color:#4E5A6E;font-size:14px;gap:8px}
  .dot-anim span{animation:blink 1.2s infinite;display:inline-block}
  .dot-anim span:nth-child(2){animation-delay:.2s}
  .dot-anim span:nth-child(3){animation-delay:.4s}
  @keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
  .spin-type-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px}
  .stg-card{background:#1A2030;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;text-align:center}
  .stg-short{font-family:'DM Mono',monospace;font-size:16px;font-weight:500;margin-bottom:4px}
  .stg-sr{font-size:12px;color:#8A95A8}
  .stg-bar{height:3px;border-radius:2px;margin-top:8px;min-width:10%}
  .scrollbar-hide::-webkit-scrollbar{display:none}
  .scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}
  select option{background:#1A2030}
`;

// ── Custom Tooltip ─────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0C1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
      <div style={{ color: "#8A95A8", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#F0F4FF" }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(1) : p.value}</div>
      ))}
    </div>
  );
};

// ── Sidebar ───────────────────────────────────────────────────────────────
function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: "profile", icon: "👤", label: "Player Profile" },
    { id: "analysis", icon: "📊", label: "Spin Analysis" },
    { id: "prediction", icon: "🔮", label: "Match Prediction" },
    { id: "compare", icon: "⚡", label: "Spin Types" },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🏏</div>
        <div>
          <div className="logo-text">SpinIQ</div>
          <div className="logo-sub">Analytics</div>
        </div>
      </div>
      <div className="nav-section">
        <div className="nav-label">Dashboard</div>
        {navItems.map(item => (
          <div key={item.id} className={`nav-item${activeTab === item.id ? " active" : ""}`} onClick={() => setActiveTab(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: "0 20px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
        <div style={{ fontSize: 10, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Data</div>
        <div style={{ fontSize: 12, color: "#8A95A8", marginTop: 4 }}>2024 IPL Season</div>
        <div style={{ fontSize: 11, color: "#4E5A6E", marginTop: 2 }}>261 players • 5 spin types</div>
      </div>
    </aside>
  );
}

// ── Player Search ──────────────────────────────────────────────────────────
function PlayerSearch({ players, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return players.slice(0, 20);
    const q = query.toLowerCase();
    return players.filter(p =>
      p.longName?.toLowerCase().includes(q) || p.Name?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [query, players]);

  const handleSelect = useCallback((p) => {
    onSelect(p);
    setQuery(p.longName || p.Name);
    setOpen(false);
  }, [onSelect]);

  return (
    <div className="player-search" style={{ position: "relative" }}>
      <span className="ps-icon">🔍</span>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Search player by name…"
      />
      {open && filtered.length > 0 && (
        <div className="dropdown scrollbar-hide">
          {filtered.map(p => (
            <div key={p.ID} className="dropdown-item" onMouseDown={() => handleSelect(p)}>
              <PlayerAvatar player={p} size={30} />
              <div>
                <div className="di-name">{p.longName || p.Name}</div>
                <div className="di-sub">{p.longBattingStyles} • {p.longBowlingStyles !== "Na" ? p.longBowlingStyles : "Bat"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerAvatar({ player, size = 32 }) {
  const [err, setErr] = useState(false);
  if (!err && player?.imgUrl && !player.imgUrl.includes("undefined")) {
    return <img src={player.imgUrl} alt={player.Name} className="player-avatar" style={{ width: size, height: size }} onError={() => setErr(true)} />;
  }
  const initials = (player?.longName || player?.Name || "?").split(" ").map(w => w[0]).slice(0, 2).join("");
  return <div className="player-avatar-placeholder" style={{ width: size, height: size, fontSize: size * 0.35 }}>{initials}</div>;
}

// ── Profile Tab ───────────────────────────────────────────────────────────
function ProfileTab({ player, stats }) {
  if (!player) return (
    <div className="empty-state">
      <div className="empty-icon">🏏</div>
      <div className="empty-text">Select a player to view their profile and performance metrics against spin bowling.</div>
    </div>
  );

  const age = player.dob
    ? Math.floor((Date.now() - new Date(player.dob.split("/").reverse().join("-"))) / (365.25 * 86400000))
    : "—";

  const radarData = [
    { metric: "Strike Rate", value: Math.min(100, stats.sr) },
    { metric: "Average", value: Math.min(100, stats.avg * 2) },
    { metric: "Boundary%", value: stats.boundary_pct },
    { metric: "Rotation", value: stats.rotation_pct },
    { metric: "Dot Resist", value: 100 - stats.dot_pct },
    { metric: "Survival", value: 100 - stats.wkt_rate * 8 },
  ];

  return (
    <>
      {/* Hero */}
      <div className="profile-hero section-gap">
        <PlayerAvatar player={player} size={80} />
        <div>
          <div className="profile-name">{player.longName || player.Name}</div>
          <div className="profile-short" style={{ fontFamily: "'DM Mono', monospace" }}>{player.Name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span className={`badge ${player.battingStyles === "lhb" ? "badge-lhb" : "badge-rhb"}`}>{player.longBattingStyles}</span>
            {player.longBowlingStyles !== "Na" && <span className="badge badge-spin">{player.longBowlingStyles}</span>}
            {age !== "—" && <span className="badge" style={{ background: "rgba(255,255,255,0.05)", color: "#8A95A8", border: "1px solid rgba(255,255,255,0.1)" }}>Age {age}</span>}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <a href={player.espn_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#4F8EF7", fontFamily: "'DM Mono', monospace", textDecoration: "none", border: "1px solid rgba(29,111,232,0.3)", padding: "6px 12px", borderRadius: 8 }}>
            ESPN ↗
          </a>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid-4 section-gap">
        {[
          { val: stats.balls, lbl: "Balls Faced", sub: "vs spin" },
          { val: stats.sr.toFixed(1), lbl: "Strike Rate", sub: "vs spin" },
          { val: stats.avg.toFixed(1), lbl: "Average", sub: "vs spin" },
          { val: `${stats.dot_pct.toFixed(0)}%`, lbl: "Dot Ball %", sub: "pressure metric" },
        ].map(s => (
          <div key={s.lbl} className="stat-card">
            <div className="stat-val" style={{ color: "#4F8EF7" }}>{s.val}</div>
            <div className="stat-label">{s.lbl}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 section-gap">
        {/* Radar */}
        <div className="card">
          <div className="card-title"><span>🕸</span> Batting Profile</div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="rgba(255,255,255,0.07)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#4E5A6E", fontSize: 11 }} />
                <Radar name="Stats" dataKey="value" stroke="#1D6FE8" fill="#1D6FE8" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dismissals */}
        <div className="card">
          <div className="card-title"><span>🎯</span> Dismissal Types</div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.dismissals} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {stats.dismissals.map((_, i) => <Cell key={i} fill={DISMISS_COLORS[i % DISMISS_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Season trend */}
      <div className="card">
        <div className="card-title"><span>📈</span> Season Trend vs Spin</div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.seasons}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="season" tick={{ fill: "#4E5A6E", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4E5A6E", fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#8A95A8" }} />
              <Line type="monotone" dataKey="sr" name="Strike Rate" stroke="#1D6FE8" strokeWidth={2} dot={{ fill: "#1D6FE8", r: 3 }} />
              <Line type="monotone" dataKey="avg" name="Average" stroke="#06D6A0" strokeWidth={2} dot={{ fill: "#06D6A0", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// ── Analysis Tab ──────────────────────────────────────────────────────────
function AnalysisTab({ player, stats }) {
  if (!player) return (
    <div className="empty-state">
      <div className="empty-icon">📊</div>
      <div className="empty-text">Select a player to view detailed spin bowling analysis by phase and matchup.</div>
    </div>
  );

  return (
    <>
      {/* Phase performance */}
      <div className="card section-gap">
        <div className="card-title"><span>🕐</span> Phase-Wise Performance vs Spin</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.phases} barGap={4}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="phase" tick={{ fill: "#4E5A6E", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4E5A6E", fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#8A95A8" }} />
              <Bar dataKey="sr" name="Strike Rate" fill="#1D6FE8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avg" name="Average" fill="#06D6A0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="balls" name="Balls Faced" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Additional stats */}
      <div className="grid-3 section-gap">
        {[
          { val: `${stats.boundary_pct.toFixed(1)}%`, lbl: "Boundary %", icon: "💥", color: "#F59E0B" },
          { val: `${stats.six_pct.toFixed(1)}%`, lbl: "Six Rate", icon: "🚀", color: "#8B5CF6" },
          { val: `${stats.rotation_pct.toFixed(1)}%`, lbl: "Rotation %", icon: "🔄", color: "#06D6A0" },
        ].map(s => (
          <div key={s.lbl} className="stat-card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
            <div className="stat-val" style={{ color: s.color, fontSize: 24 }}>{s.val}</div>
            <div className="stat-label">{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* Phase cards */}
      <div className="grid-3 section-gap">
        {stats.phases.map((ph, i) => (
          <div key={ph.phase} className="card" style={{ borderColor: ["rgba(29,111,232,0.25)", "rgba(139,92,246,0.25)", "rgba(245,158,11,0.25)"][i] }}>
            <div style={{ fontSize: 11, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{ph.phase}</div>
            <div className="stat-val" style={{ color: ["#4F8EF7", "#A78BFA", "#F59E0B"][i], fontSize: 22 }}>{ph.sr}</div>
            <div className="stat-sub">SR • Avg {ph.avg} • {ph.balls} balls</div>
          </div>
        ))}
      </div>

      {/* Dot ball analysis */}
      <div className="card">
        <div className="card-title"><span>⚫</span> Ball-by-Ball Breakdown</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "Dot", val: `${stats.dot_pct.toFixed(0)}%`, color: "#EF4444" },
            { label: "1s", val: `${stats.rotation_pct.toFixed(0)}%`, color: "#F59E0B" },
            { label: "2s", val: `${Math.max(2, Math.floor(stats.rotation_pct * 0.3)).toFixed(0)}%`, color: "#8B5CF6" },
            { label: "4s", val: `${(stats.boundary_pct - stats.six_pct).toFixed(0)}%`, color: "#06D6A0" },
            { label: "6s", val: `${stats.six_pct.toFixed(0)}%`, color: "#1D6FE8" },
          ].map(b => (
            <div key={b.label} style={{ textAlign: "center", padding: "14px 8px", background: "#1A2030", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: b.color, fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700 }}>{b.val}</div>
              <div style={{ fontSize: 10, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Prediction Tab ─────────────────────────────────────────────────────────
function PredictionTab({ player, players, stats }) {
  const [spinType, setSpinType] = useState("right-arm offbreak");
  const [phase, setPhase] = useState("Middle");
  const [venue, setVenue] = useState(VENUES[0]);
  const [oppTeam, setOppTeam] = useState(IPL_TEAMS[0]);
  const [loading, setLoading] = useState(false);
  const [pred, setPred] = useState(null);

 const runPrediction = useCallback(async () => {
  if (!player) return;
  setLoading(true);
  setPred(null);
  try {
    const statsRes = await fetch(`http://localhost:5000/player-stats/${player.ID}`);
    const statsData = statsRes.ok ? await statsRes.json() : {};
    const batter_features = statsData.batter_features ?? {};
    const bvs_rows = statsData.batter_vs_spin ?? [];
    const batter_vs_spin = bvs_rows.find(r => r.spin_type === spinType) ?? bvs_rows[0] ?? {};

    const predRes = await fetch("http://localhost:5000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: player.ID, spin_type: spinType, phase, venue, batter_features, batter_vs_spin }),
    });

    if (!predRes.ok) throw new Error("Flask returned error");
    const result = await predRes.json();

    setPred({
      predicted_sr:   result.predicted_sr,
      predicted_avg:  result.predicted_avg,
      dismissal_prob: result.dismissal_prob,
      expected_runs:  result.expected_runs ?? parseFloat((result.predicted_avg * (1 - result.dismissal_prob)).toFixed(1)),
      confidence:     result.confidence,
      spin_type: spinType, venue, phase,
    });
  } catch (err) {
    console.warn("Flask unavailable, using mock:", err.message);
    setPred(mockPrediction(player, spinType, phase, venue));
  } finally {
    setLoading(false);
  }
}, [player, spinType, phase, venue]);

  if (!player) return (
    <div className="empty-state">
      <div className="empty-icon">🔮</div>
      <div className="empty-text">Select a player, then configure the match scenario to generate a prediction.</div>
    </div>
  );

  return (
    <>
      {/* Config */}
      <div className="card section-gap">
        <div className="card-title"><span>⚙️</span> Match Configuration</div>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Spin Type</div>
            <div className="select-wrap">
              <select value={spinType} onChange={e => setSpinType(e.target.value)}>
                {SPIN_STYLE_KEYS.map(k => <option key={k} value={k}>{SPIN_TYPES[k].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Phase</div>
            <div className="select-wrap">
              <select value={phase} onChange={e => setPhase(e.target.value)}>
                {["Powerplay", "Middle", "Death"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Venue</div>
            <div className="select-wrap">
              <select value={venue} onChange={e => setVenue(e.target.value)}>
                {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Opposition</div>
            <div className="select-wrap">
              <select value={oppTeam} onChange={e => setOppTeam(e.target.value)}>
                {IPL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        <button onClick={runPrediction} disabled={loading} style={{
          width: "100%", padding: "12px", background: loading ? "rgba(29,111,232,0.3)" : "rgba(29,111,232,0.85)",
          color: "#fff", border: "none", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 0.3, transition: "all .15s"
        }}>
          {loading ? "Running Model…" : "🔮 Generate Prediction"}
        </button>
      </div>

      {loading && (
        <div className="loading">
          <span>Running spin model</span>
          <span className="dot-anim"><span>.</span><span>.</span><span>.</span></span>
        </div>
      )}

      {pred && (
        <>
          <div className="pred-card section-gap">
            <div className="pred-title">
              {player.longName} vs {SPIN_TYPES[spinType]?.label} • {phase} Overs • {venue}
            </div>
            <div className="pred-row">
              {[
                { val: pred.predicted_sr.toFixed(1), lbl: "Pred. SR", color: "#1D6FE8" },
                { val: pred.predicted_avg.toFixed(1), lbl: "Pred. Avg", color: "#06D6A0" },
                { val: `${(pred.dismissal_prob * 100).toFixed(1)}%`, lbl: "Dismissal Prob", color: "#F59E0B" },
                { val: pred.expected_runs.toFixed(1), lbl: "Expected Runs", color: "#8B5CF6" },
              ].map(m => (
                <div key={m.lbl} className="pred-metric">
                  <div className="pred-val" style={{ color: m.color }}>{m.val}</div>
                  <div className="pred-lbl">{m.lbl}</div>
                </div>
              ))}
            </div>
            <div className="conf-bar">
              <div className="conf-fill" style={{ width: `${pred.confidence}%` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "#4E5A6E", fontFamily: "'DM Mono', monospace" }}>Model Confidence</span>
              <span style={{ fontSize: 11, color: "#06D6A0", fontFamily: "'DM Mono', monospace" }}>{pred.confidence}%</span>
            </div>
          </div>

          {/* Comparison chart */}
          <div className="card">
            <div className="card-title"><span>📊</span> Historical vs Predicted</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "Historical SR", historical: stats.sr, predicted: pred.predicted_sr },
                  { name: "Historical Avg", historical: stats.avg, predicted: pred.predicted_avg },
                ]}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#4E5A6E", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#4E5A6E", fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#8A95A8" }} />
                  <Bar dataKey="historical" name="Historical" fill="rgba(29,111,232,0.4)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="predicted" name="Predicted" fill="#1D6FE8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </>
      )}
    </>
  );
}

// ── Compare Tab ───────────────────────────────────────────────────────────
function CompareTab({ player, stats }) {
  if (!player) return (
    <div className="empty-state">
      <div className="empty-icon">⚡</div>
      <div className="empty-text">Select a player to compare their performance across all 5 spin bowling types.</div>
    </div>
  );

  const maxSR = Math.max(...stats.spinComparison.map(s => s.sr));

  return (
    <>
      <div className="card section-gap">
        <div className="card-title"><span>🔄</span> Strike Rate vs Each Spin Type</div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.spinComparison} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#4E5A6E", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, maxSR + 20]} />
              <YAxis type="category" dataKey="short" tick={{ fill: "#8A95A8", fontSize: 12, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="sr" name="Strike Rate" radius={[0, 4, 4, 0]}>
                {stats.spinComparison.map((_, i) => (
                  <Cell key={i} fill={Object.values(SPIN_TYPES)[i]?.color || "#4F8EF7"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-title"><span>🎯</span> Dismissal Probability by Spin Type</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.spinComparison}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="short" tick={{ fill: "#4E5A6E", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4E5A6E", fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => `${(v * 100).toFixed(1)}%`} />
              <Bar dataKey="dismissalProb" name="Dismissal Prob" radius={[4, 4, 0, 0]}>
                {stats.spinComparison.map((_, i) => (
                  <Cell key={i} fill={Object.values(SPIN_TYPES)[i]?.color || "#4F8EF7"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        {stats.spinComparison.map((s, i) => {
          const meta = Object.values(SPIN_TYPES)[i];
          return (
            <div key={s.short} className="card" style={{ borderColor: `${meta?.color}25` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: meta?.color }} />
                <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: "#8A95A8" }}>{s.type}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ color: meta?.color, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18 }}>{s.sr}</div>
                  <div style={{ fontSize: 9, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>SR</div>
                </div>
                <div>
                  <div style={{ color: "#06D6A0", fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18 }}>{s.avg}</div>
                  <div style={{ fontSize: 9, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>Avg</div>
                </div>
                <div>
                  <div style={{ color: "#F59E0B", fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18 }}>{s.balls}</div>
                  <div style={{ fontSize: 9, color: "#4E5A6E", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>Balls</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────
export default function App() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [apiStatus, setApiStatus] = useState("checking"); // "checking" | "connected" | "disconnected"

  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch("http://localhost:5000/health", { signal: AbortSignal.timeout(2000) });
        setApiStatus(res.ok ? "connected" : "disconnected");
      } catch {
        setApiStatus("disconnected");
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load players from CSV
  useEffect(() => {
    // Try to load from /csv/2024_players_details.csv via PapaParse
    // Fallback: use embedded sample data if fetch fails
 const tryLoad = async () => {
  try {
    const res = await fetch(PLAYERS_CSV_PATH);
    const text = await res.text();
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (data.length > 0) {
      setPlayers(data.map(r => ({ ...r, ID: parseInt(r.ID) || r.ID })));
      setLoadingPlayers(false);
    } else {
      getFallback();
    }
  } catch (e) {
    console.error("CSV load failed:", e);
    getFallback();
  }
};
    const getFallback = () => {
      // Embedded player list (subset from 2024_players_details.csv)
      setPlayers(FALLBACK_PLAYERS);
      setLoadingPlayers(false);
    };
    tryLoad();
  }, []);

  const stats = useMemo(() => selectedPlayer ? mockStatsFromId(selectedPlayer.ID) : null, [selectedPlayer]);

  const TAB_TITLES = {
    profile: "Player Profile",
    analysis: "Spin Analysis",
    prediction: "Match Prediction",
    compare: "Spin Type Comparison",
  };

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="main">
          <div className="topbar">
            <div className="topbar-title">{TAB_TITLES[activeTab]}</div>
            {selectedPlayer && <span style={{ fontSize: 13, color: "#4F8EF7", fontFamily: "'DM Mono', monospace" }}>{selectedPlayer.longName}</span>}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20,
              background: apiStatus === "connected" ? "rgba(6,214,160,0.1)" : apiStatus === "disconnected" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
              border: `1px solid ${apiStatus === "connected" ? "rgba(6,214,160,0.3)" : apiStatus === "disconnected" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                backgroundColor: apiStatus === "connected" ? "#06D6A0" : apiStatus === "disconnected" ? "#EF4444" : "#F59E0B",
                boxShadow: apiStatus === "connected" ? "0 0 6px #06D6A0" : "none",
                animation: apiStatus === "checking" ? "pulse 1s infinite" : "none",
              }} />
              <span style={{
                fontSize: 11, fontFamily: "'DM Mono', monospace",
                color: apiStatus === "connected" ? "#06D6A0" : apiStatus === "disconnected" ? "#EF4444" : "#F59E0B",
              }}>
                {apiStatus === "connected" ? "API Connected" : apiStatus === "disconnected" ? "API Offline" : "Checking…"}
              </span>
            </div>
            <span className="topbar-badge">IPL 2024</span>
          </div>
          <div className="content">
            {/* Player selector */}
            <div className="card section-gap">
              <div className="card-title"><span>🏏</span> Select Batter</div>
              {loadingPlayers
                ? <div style={{ color: "#4E5A6E", fontSize: 13 }}>Loading players…</div>
                : <PlayerSearch players={players} selected={selectedPlayer} onSelect={setSelectedPlayer} />
              }
              {selectedPlayer && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(29,111,232,0.08)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <PlayerAvatar player={selectedPlayer} size={28} />
                  <span style={{ fontSize: 13, color: "#4F8EF7" }}>{selectedPlayer.longName}</span>
                  <span style={{ fontSize: 11, color: "#4E5A6E", marginLeft: "auto" }}>{selectedPlayer.longBattingStyles} • ID {selectedPlayer.ID}</span>
                </div>
              )}
            </div>

            {/* Active tab */}
            {activeTab === "profile" && <ProfileTab player={selectedPlayer} stats={stats} />}
            {activeTab === "analysis" && <AnalysisTab player={selectedPlayer} stats={stats} />}
            {activeTab === "prediction" && <PredictionTab player={selectedPlayer} players={players} stats={stats} />}
            {activeTab === "compare" && <CompareTab player={selectedPlayer} stats={stats} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Fallback player list (embedded from CSV) ──────────────────────────────
const FALLBACK_PLAYERS = [
  { ID: 95094, Name: "RD Gaikwad", longName: "Ruturaj Gaikwad", battingName: "RD Gaikwad", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/322200/322236.png", dob: "31/1/1997", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "ob", longBowlingStyles: "right-arm offbreak", espn_url: "https://www.espncricinfo.com/cricketers/ruturaj-gaikwad-1060380" },
  { ID: 46597, Name: "MM Ali", longName: "Moeen Ali", battingName: "MM Ali", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/316500/316557.png", dob: "18/6/1987", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "ob", longBowlingStyles: "right-arm offbreak", espn_url: "https://www.espncricinfo.com/cricketers/moeen-ali-8917" },
  { ID: 7593, Name: "MS Dhoni", longName: "MS Dhoni", battingName: "MS Dhoni", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/319900/319946.png", dob: "7/7/1981", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "rm", longBowlingStyles: "right-arm medium", espn_url: "https://www.espncricinfo.com/cricketers/ms-dhoni-28081" },
  { ID: 49247, Name: "RA Jadeja", longName: "Ravindra Jadeja", battingName: "RA Jadeja", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/316600/316600.png", dob: "6/12/1988", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "sla", longBowlingStyles: "slow left-arm orthodox", espn_url: "https://www.espncricinfo.com/cricketers/ravindra-jadeja-234675" },
  { ID: 51096, Name: "AM Rahane", longName: "Ajinkya Rahane", battingName: "AM Rahane", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/316600/316620.png", dob: "6/6/1988", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "rm", longBowlingStyles: "right-arm medium", espn_url: "https://www.espncricinfo.com/cricketers/ajinkya-rahane-277916" },
  { ID: 74975, Name: "S Dube", longName: "Shivam Dube", battingName: "S Dube", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/322700/322703.png", dob: "26/6/1993", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "rm", longBowlingStyles: "right-arm medium", espn_url: "https://www.espncricinfo.com/cricketers/shivam-dube-931581" },
  { ID: 89105, Name: "R Ravindra", longName: "Rachin Ravindra", battingName: "R Ravindra", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/329700/329746.png", dob: "18/11/1999", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "sla", longBowlingStyles: "slow left-arm orthodox", espn_url: "https://www.espncricinfo.com/cricketers/rachin-ravindra-1131647" },
  { ID: 64864, Name: "MJ Santner", longName: "Mitchell Santner", battingName: "MJ Santner", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/319700/319792.png", dob: "5/2/1992", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "sla", longBowlingStyles: "slow left-arm orthodox", espn_url: "https://www.espncricinfo.com/cricketers/mitchell-santner-578555" },
  { ID: 104818, Name: "Sameer Rizvi", longName: "Sameer Rizvi", battingName: "Sameer Rizvi", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/378000/378091.1.png", dob: "10/12/2004", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "ob", longBowlingStyles: "right-arm offbreak", espn_url: "https://www.espncricinfo.com/cricketers/sameer-rizvi-1408676" },
  { ID: 58772, Name: "DJ Mitchell", longName: "Daryl Mitchell", battingName: "DJ Mitchell", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/321200/321212.png", dob: "20/2/1991", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "rm", longBowlingStyles: "right-arm medium", espn_url: "https://www.espncricinfo.com/cricketers/daryl-mitchell-577739" },
  { ID: 110976, Name: "SK Rasheed", longName: "Shaik Rasheed", battingName: "SK Rasheed", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/345000/345086.png", dob: "15/5/2003", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "lb", longBowlingStyles: "legbreak", espn_url: "https://www.espncricinfo.com/cricketers/shaik-rasheed-1408677" },
  { ID: 95065, Name: "AJ Mandal", longName: "Ajay Mandal", battingName: "AJ Mandal", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/314900/314902.jpg", dob: "3/9/1998", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "sla", longBowlingStyles: "slow left-arm orthodox", espn_url: "https://www.espncricinfo.com/cricketers/ajay-mandal-1408678" },
  { ID: 105938, Name: "M Pathirana", longName: "Matheesha Pathirana", battingName: "M Pathirana", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/355400/355402.png", dob: "18/3/2003", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "rf", longBowlingStyles: "right-arm fast", espn_url: "https://www.espncricinfo.com/cricketers/matheesha-pathirana-1408679" },
  { ID: 54674, Name: "Mustafizur Rahman", longName: "Mustafizur Rahman", battingName: "Mustafizur Rahman", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/319700/319734.png", dob: "6/9/1995", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "lfm", longBowlingStyles: "left-arm fast-medium", espn_url: "https://www.espncricinfo.com/cricketers/mustafizur-rahman-781803" },
  { ID: 62022, Name: "DL Chahar", longName: "Deepak Chahar", battingName: "DL Chahar", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/322700/322704.png", dob: "7/8/1992", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "rm", longBowlingStyles: "right-arm medium", espn_url: "https://www.espncricinfo.com/cricketers/deepak-chahar-447261" },
  { ID: 24605, Name: "MJ Clarke", longName: "Mitchell Marsh", battingName: "MJ Clarke", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/316500/316517.png", dob: "20/10/1991", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "rfm", longBowlingStyles: "right-arm fast-medium", espn_url: "https://www.espncricinfo.com/cricketers/mitchell-marsh-272450" },
  { ID: 80607, Name: "TU Deshpande", longName: "Tushar Deshpande", battingName: "TU Deshpande", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/339100/339160.png", dob: "15/5/1995", battingStyles: "lhb", longBattingStyles: "left-hand bat", bowlingStyles: "rm", longBowlingStyles: "right-arm medium", espn_url: "https://www.espncricinfo.com/cricketers/tushar-deshpande-822553" },
  { ID: 63314, Name: "RJ Gleeson", longName: "Richard Gleeson", battingName: "RJ Gleeson", imgUrl: "https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_640,q_50/lsci/db/PICTURES/CMS/324200/324238.png", dob: "2/12/1987", battingStyles: "rhb", longBattingStyles: "right-hand bat", bowlingStyles: "rf", longBowlingStyles: "right-arm fast", espn_url: "https://www.espncricinfo.com/cricketers/richard-gleeson-355262" },
];