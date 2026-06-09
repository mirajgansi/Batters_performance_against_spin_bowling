import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { PlayerAvatar, CustomTooltip, EmptyState } from "../components/ui";
import { DISMISS_COLORS } from "../constants";

export function ProfileTab({ player, stats }) {
  if (!player) {
    return (
      <EmptyState
        icon="🏏"
        text="Select a player to view their profile and performance metrics against spin bowling."
      />
    );
  }

  const age = player.dob
    ? Math.floor(
        (Date.now() -
          new Date(player.dob.split("/").reverse().join("-"))) /
          (365.25 * 86400000)
      )
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
          <div className="profile-short" style={{ fontFamily: "'DM Mono', monospace" }}>
            {player.Name}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span className={`badge ${player.battingStyles === "lhb" ? "badge-lhb" : "badge-rhb"}`}>
              {player.longBattingStyles}
            </span>
            {player.longBowlingStyles !== "Na" && (
              <span className="badge badge-spin">{player.longBowlingStyles}</span>
            )}
            {age !== "—" && (
              <span
                className="badge"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "#8A95A8",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                Age {age}
              </span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <a
            href={player.espn_url}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12,
              color: "#4F8EF7",
              fontFamily: "'DM Mono', monospace",
              textDecoration: "none",
              border: "1px solid rgba(29,111,232,0.3)",
              padding: "6px 12px",
              borderRadius: 8,
            }}
          >
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
        ].map((s) => (
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
                <Pie
                  data={stats.dismissals}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={11}
                >
                  {stats.dismissals.map((_, i) => (
                    <Cell key={i} fill={DISMISS_COLORS[i % DISMISS_COLORS.length]} />
                  ))}
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