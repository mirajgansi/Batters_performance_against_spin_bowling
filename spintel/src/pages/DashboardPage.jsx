/* eslint-disable */
import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

import { G, PIE_COLORS, CHART_COLORS, SPIN_TYPE_OPTIONS } from "../utils/tokens";
import {
  KpiCard, Card, SectionTitle, Spinner, EmptyState,
  CustomTooltip, Badge, InlineSpinner, PhotoAvatar, Avatar,
} from "../components/ui/index.jsx";
import { PlayerSearch }  from "../components/ui/PlayerSearch.jsx";
import { AIInsightBox }  from "../components/ui/AIInsightBox.jsx";
import {
  fetchPlayerStats, fetchPlayerSeasons, fetchPlayerVenues,
} from "../api/flask";

export function DashboardPage({ players, apiOk, photoMap }) {
  const [player,        setPlayer]        = useState(null);
  const [stats,         setStats]         = useState(null);
  const [statsLoad,     setStatsLoad]     = useState(false);
  const [spinType,      setSpinType]      = useState("All Spin");
  const [season,        setSeason]        = useState("All Seasons");
  const [venue,         setVenue]         = useState("All Venues");
  const [playerSeasons, setPlayerSeasons] = useState([]);
  const [seasonsLoad,   setSeasonsLoad]   = useState(false);
  const [playerVenues,  setPlayerVenues]  = useState([]);
  const [venuesLoad,    setVenuesLoad]    = useState(false);

  // Fetch seasons + venues when player changes
  useEffect(() => {
    if (!player || !apiOk) {
      setPlayerSeasons([]); setSeason("All Seasons");
      setPlayerVenues([]);  setVenue("All Venues");
      return;
    }
    setSeasonsLoad(true);
    fetchPlayerSeasons(player.ID)
      .then((d) => { setPlayerSeasons(d.seasons || []); setSeasonsLoad(false); })
      .catch(() => { setPlayerSeasons([]); setSeasonsLoad(false); });

    setVenuesLoad(true);
    fetchPlayerVenues(player.ID)
      .then((d) => { setPlayerVenues(d.venues || []); setVenuesLoad(false); })
      .catch(() => { setPlayerVenues([]); setVenuesLoad(false); });

    setSeason("All Seasons");
    setVenue("All Venues");
  }, [player?.ID, apiOk]);

  // Fetch stats when filters change
  useEffect(() => {
    if (!player || !apiOk) { setStats(null); return; }
    setStatsLoad(true); setStats(null);

    const params = {};
    if (season !== "All Seasons") params.season = season;
    if (venue  !== "All Venues")  params.venue  = venue;
    if (spinType !== "All Spin") {
      const v = SPIN_TYPE_OPTIONS.find((s) => s.label === spinType)?.value;
      if (v) params.spin_type = v;
    }

    fetchPlayerStats(player.ID, params)
      .then((d) => { setStats(d.error ? null : d); setStatsLoad(false); })
      .catch(() => setStatsLoad(false));
  }, [player?.ID, apiOk, season, spinType, venue]);

  // Weakness list — sorted by dismissalProb desc
  const weaknesses = useMemo(() => {
    if (!stats?.spinComparison?.length) return [];
    return [...stats.spinComparison]
      .sort((a, b) => b.dismissalProb - a.dismissalProb)
      .map((s, i) => ({
        type:         s.type,
        severity:     i === 0 ? "high" : i === 1 ? "medium" : "low",
        dismissalProb: s.dismissalProb,
        sr:           s.sr,
      }));
  }, [stats]);

  const runsDistWithColors = useMemo(() => {
    if (!stats?.runsDistribution) return [];
    return stats.runsDistribution.map((d, i) => ({ ...d, color: PIE_COLORS[i] }));
  }, [stats]);

  const filteredSpin = useMemo(() => {
    if (!stats?.spinComparison) return [];
    if (spinType === "All Spin") return stats.spinComparison;
    return stats.spinComparison.filter(
      (s) => s.type?.toLowerCase() === spinType.toLowerCase()
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

  const sevColor = (s) => s === "high" ? G.red    : s === "medium" ? G.amber    : G.green;
  const sevBg    = (s) => s === "high" ? G.redLight : s === "medium" ? G.amberLight : G.greenLight;
  const sevBorder= (s) => s === "high" ? "#fca5a5" : s === "medium" ? "#fcd34d"    : "#86efac";

  return (
    <div>
      {/* Search bar */}
      <div style={{
        padding: "20px 24px", background: G.gray50,
        borderBottom: `1px solid ${G.gray200}`,
      }}>
        <div style={{ maxWidth: 600 }}>
<PlayerSearch
  players={players}
  selected={player}
  onSelect={(p) => { setPlayer(p); setPredResult(null); setAiPredText(""); }}
  photoMap={photoMap}
/>        </div>
      </div>

      <div style={{ padding: "24px" }}>
        {!player && (
          <EmptyState
            icon="🔍"
            text="Search and select an IPL batter above to load their spin bowling analytics."
          />
        )}

        {player && (
          <>
            {/* Player hero */}
            <div style={{
              background: `linear-gradient(135deg, ${G.gray900} 0%, #0f2d1c 100%)`,
              borderRadius: 14, padding: "24px", marginBottom: 20,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, right: 0, width: 200, height: 200,
                background: `${G.green}20`, borderRadius: "50%",
                transform: "translate(60px,-60px)",
              }} />
              <div style={{ display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
                <PhotoAvatar
                  id={player.ID}
                  name={player.longName || player.Name}
                  size={72}
                  color={G.green}
                  photoUrl={photoMap?.[String(player.ID)]}
                />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 28, fontWeight: 700, color: G.white,
                    fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
                  }}>
                    {player.longName || player.Name}
                  </div>
                  <div style={{ fontSize: 14, color: G.greenMid, fontWeight: 600, marginTop: 2 }}>
                    {player.longTeamNames || ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {player.longBattingStyles && (
                      <Badge label={player.longBattingStyles} color={G.white} bg={`${G.green}80`} />
                    )}
                    {stats?.cluster_name && (
                      <Badge label={stats.cluster_name} color={G.white} bg="rgba(255,255,255,0.15)" />
                    )}
                  </div>
                </div>
                {stats && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      fontSize: 36, fontWeight: 800, color: G.green,
                      fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1,
                    }}>
                      {stats.sr}
                    </div>
                    <div style={{ fontSize: 11, color: G.gray400, textTransform: "uppercase", letterSpacing: 1 }}>
                      SR vs Spin
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: G.gray600, fontFamily: "'Barlow Condensed', sans-serif" }}>
                Filters:
              </span>

              {/* Spin type */}
              <select
                value={spinType}
                onChange={(e) => setSpinType(e.target.value)}
                style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: "pointer", outline: "none" }}
              >
                <option>All Spin</option>
                {SPIN_TYPE_OPTIONS.map((s) => <option key={s.value}>{s.label}</option>)}
              </select>

              {/* Season */}
              <div style={{ position: "relative" }}>
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  disabled={seasonsLoad}
                  style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: seasonsLoad ? "not-allowed" : "pointer", outline: "none", opacity: seasonsLoad ? 0.6 : 1 }}
                >
                  <option value="All Seasons">All Seasons</option>
                  {playerSeasons.map((s) => (
                    <option key={s.season} value={s.season}>
                      {s.season}{s.low_data ? " ⚠" : ""} ({s.balls} balls)
                    </option>
                  ))}
                </select>
                {seasonsLoad && <InlineSpinner />}
              </div>

              {/* Venue */}
              <div style={{ position: "relative" }}>
                <select
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  disabled={venuesLoad}
                  style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: venuesLoad ? "not-allowed" : "pointer", outline: "none", opacity: venuesLoad ? 0.6 : 1 }}
                >
                  <option value="All Venues">All Venues</option>
                  {playerVenues.map((v) => (
                    <option key={v.venue} value={v.venue}>
                      {v.venue}{v.low_data ? " ⚠" : ""} ({v.balls} balls)
                    </option>
                  ))}
                </select>
                {venuesLoad && <InlineSpinner />}
              </div>
            </div>

            {/* Data quality warnings */}
            {season !== "All Seasons" && (() => {
              const s = playerSeasons.find((ps) => ps.season === season);
              if (!s) return null;
              if (s.balls < 10) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: G.redLight, border: "1px solid #fca5a5", borderRadius: 10, borderLeft: `4px solid ${G.red}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🚫</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.red, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Too few games in {s.season}</div>
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>Only {s.balls} balls faced vs spin — not enough data. Try "All Seasons" or a different year.</div>
                  </div>
                </div>
              );
              if (s.low_data) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: G.amberLight, border: "1px solid #fcd34d", borderRadius: 10, borderLeft: `4px solid ${G.amber}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.amber, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Limited data for {s.season}</div>
                    <div style={{ fontSize: 12, color: "#92400e" }}>Only {s.balls} balls — interpret with caution.</div>
                  </div>
                </div>
              );
            })()}

            {venue !== "All Venues" && (() => {
              const v = playerVenues.find((pv) => pv.venue === venue);
              if (!v) return null;
              if (v.balls < 10) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: G.redLight, border: "1px solid #fca5a5", borderRadius: 10, borderLeft: `4px solid ${G.red}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🚫</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.red, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Too few balls at {v.venue}</div>
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>Only {v.balls} balls — not enough data.</div>
                  </div>
                </div>
              );
              if (v.low_data) return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, background: G.amberLight, border: "1px solid #fcd34d", borderRadius: 10, borderLeft: `4px solid ${G.amber}` }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: G.amber, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Limited data at {v.venue}</div>
                    <div style={{ fontSize: 12, color: "#92400e" }}>Only {v.balls} balls — interpret with caution.</div>
                  </div>
                </div>
              );
            })()}

            {statsLoad && <Spinner text="Loading player stats…" />}

            {stats && (() => {
              const selSeason = season !== "All Seasons" ? playerSeasons.find((ps) => ps.season === season) : null;
              const selVenue  = venue  !== "All Venues"  ? playerVenues.find((pv) => pv.venue === venue)   : null;
              if ((selSeason?.balls < 10) || (selVenue?.balls < 10)) return null;

              return (
                <>
                  {/* KPI row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
                    <KpiCard label="Strike Rate vs Spin" value={stats.sr}               icon="⚡" color={G.green} />
                    <KpiCard label="Dot Ball %"          value={`${stats.dot_pct}%`}    icon="⚫" color={G.gray500} />
                    <KpiCard label="Boundary %"          value={`${stats.boundary_pct}%`} icon="🏏" color={G.accent} />
                    <KpiCard label="Wicket Rate"         value={`${stats.wkt_rate}%`}   icon="🎯" color={G.red} />
                    <KpiCard label="Average vs Spin"     value={stats.avg}              icon="📈" color={G.blue} />
                    <KpiCard label="Total Balls Faced"   value={stats.balls}            icon="🔢" color="#8b5cf6" />
                  </div>

                  {/* Charts row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    {/* Runs distribution pie */}
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

                    {/* Spin type comparison */}
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

                  {/* Historical trend */}
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
                                const sel = stats.selected_season && props.payload?.season === String(stats.selected_season);
                                return <circle key={props.key} cx={props.cx} cy={props.cy} r={sel ? 7 : 4} fill={sel ? G.accent : G.green} stroke={G.white} strokeWidth={sel ? 2 : 0} />;
                              }}
                            />
                            <Line type="monotone" dataKey="avg" name="Average" stroke={G.accent} strokeWidth={2.5} strokeDasharray="5 3"
                              dot={(props) => {
                                const sel = stats.selected_season && props.payload?.season === String(stats.selected_season);
                                return <circle key={props.key} cx={props.cx} cy={props.cy} r={sel ? 7 : 4} fill={sel ? G.blue : G.accent} stroke={G.white} strokeWidth={sel ? 2 : 0} />;
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

                  {/* Phase breakdown */}
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
                            <Bar dataKey="sr"  name="Strike Rate" fill={G.green} radius={[3,3,0,0]} />
                            <Bar dataKey="avg" name="Average"     fill={G.blue}  radius={[3,3,0,0]} />
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
                        <div key={i} style={{ padding: "12px 14px", borderRadius: 8, marginBottom: 8, background: sevBg(w.severity), border: `1px solid ${sevBorder(w.severity)}` }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: G.gray800, fontFamily: "'Barlow Condensed', sans-serif" }}>{w.type}</span>
                            <Badge
                              label={w.severity === "high" ? "Most Vulnerable" : w.severity === "medium" ? "Moderate Risk" : "Comfortable"}
                              color={sevColor(w.severity)}
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
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false} fontSize={10}
                            >
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

                  {/* Recent form + archetype */}
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
