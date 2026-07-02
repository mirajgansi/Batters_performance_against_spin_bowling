/* eslint-disable */
import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

import { G, PIE_COLORS, CHART_COLORS, SPIN_TYPE_OPTIONS } from "../utils/tokens";
import {
  KpiCard, Card, SectionTitle, Spinner, EmptyState,
  CustomTooltip, Badge, InlineSpinner, PhotoAvatar,
} from "../components/ui/index.jsx";
import { PlayerSearch } from "../components/ui/PlayerSearch.jsx";
import { AIInsightBox } from "../components/ui/AIInsightBox.jsx";
import { fetchPlayerStats, fetchPlayerSeasons, fetchPlayerVenues, fetchPlayerSpinBreakdown } from "../api/flask";

const DEFAULT_FILTERS = { spinType: "All Spin", season: "All Seasons", venue: "All Venues" };

export function DashboardPage({ players, apiOk, photoMap }) {
  const [player,        setPlayer]        = useState(null);
  const [stats,         setStats]         = useState(null);
  const [statsLoad,     setStatsLoad]     = useState(false);

  // Draft filter values — controlled by the selects, but NOT what's actually
  // being queried for the full dashboard. Nothing fetches the heavy stats
  // until "Apply" is clicked.
  const [spinType,      setSpinType]      = useState(DEFAULT_FILTERS.spinType);
  const [season,        setSeason]        = useState(DEFAULT_FILTERS.season);
  const [venue,         setVenue]         = useState(DEFAULT_FILTERS.venue);

  // The filters that were actually applied and are driving the current fetch.
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);

  // Base option lists (names only), loaded once per player, unfiltered.
  const [playerSeasons, setPlayerSeasons] = useState([]);
  const [seasonsLoad,   setSeasonsLoad]   = useState(false);
  const [playerVenues,  setPlayerVenues]  = useState([]);
  const [venuesLoad,    setVenuesLoad]    = useState(false);

  // LIVE, cross-filtered ball counts for each dropdown — refreshed as soon as
  // the user touches any draft filter (debounced), filtered by whatever the
  // OTHER two draft filters currently are. This is what powers "Option D":
  // dependent dropdowns that show real sample sizes before you even hit Apply.
  const [seasonBallsPreview, setSeasonBallsPreview] = useState({}); // { "2023": 41, ... }
  const [venueBallsPreview,  setVenueBallsPreview]  = useState({}); // { "Wankhede Stadium": 6, ... }
  const [spinBallsPreview,   setSpinBallsPreview]   = useState({}); // { "off spin": 12, "all spin": 41, ... }
  const [previewLoad,        setPreviewLoad]        = useState(false);

  const spinValueFor = (label) => SPIN_TYPE_OPTIONS.find((s) => s.label === label)?.value;

  const spinBallsFor = (label, value) => {
    const key = label?.toLowerCase();
    if (key === "all spin") return spinBallsPreview["all spin"];
    return spinBallsPreview[key] ?? spinBallsPreview[value?.toLowerCase()];
  };

  const hasPendingChanges =
    spinType !== appliedFilters.spinType ||
    season   !== appliedFilters.season   ||
    venue    !== appliedFilters.venue;

  // When the player changes: reload the base season/venue name lists and
  // reset both the draft filters and the applied filters back to defaults.
  useEffect(() => {
    if (!player || !apiOk) {
      setPlayerSeasons([]); setPlayerVenues([]);
      setSpinType(DEFAULT_FILTERS.spinType);
      setSeason(DEFAULT_FILTERS.season);
      setVenue(DEFAULT_FILTERS.venue);
      setAppliedFilters(DEFAULT_FILTERS);
      setSeasonBallsPreview({}); setVenueBallsPreview({}); setSpinBallsPreview({});
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

    setSpinType(DEFAULT_FILTERS.spinType);
    setSeason(DEFAULT_FILTERS.season);
    setVenue(DEFAULT_FILTERS.venue);
    setAppliedFilters(DEFAULT_FILTERS);
    setSeasonBallsPreview({}); setVenueBallsPreview({}); setSpinBallsPreview({});
  }, [player?.ID, apiOk]);

  // Live preview: whenever any draft filter changes, re-fetch lightweight
  // ball-counts for all three dropdowns, each filtered by the OTHER two
  // current draft selections. Debounced ~350ms so clicking through options
  // doesn't fire a request per click.
  useEffect(() => {
    if (!player || !apiOk) return;
    const handle = setTimeout(() => {
      setPreviewLoad(true);
      const spinValue    = spinType !== "All Spin"    ? spinValueFor(spinType) : undefined;
      const seasonParam  = season   !== "All Seasons"  ? season                : undefined;
      const venueParam   = venue    !== "All Venues"   ? venue                 : undefined;

      Promise.all([
        fetchPlayerSeasons(player.ID, { venue: venueParam, spin_type: spinValue }),
        fetchPlayerVenues(player.ID,  { season: seasonParam, spin_type: spinValue }),
        fetchPlayerSpinBreakdown(player.ID, { season: seasonParam, venue: venueParam }),
      ])
        .then(([seasonsRes, venuesRes, spinRes]) => {
          const sMap = {};
          (seasonsRes.seasons || []).forEach((s) => { sMap[s.season] = s.balls; });
          setSeasonBallsPreview(sMap);

          const vMap = {};
          (venuesRes.venues || []).forEach((v) => { vMap[v.venue] = v.balls; });
          setVenueBallsPreview(vMap);

          const spMap = {};
          (spinRes.spinTypes || []).forEach((s) => { if (s.type) spMap[s.type.toLowerCase()] = s.balls; });
          if (typeof spinRes.total_balls === "number") spMap["all spin"] = spinRes.total_balls;
          setSpinBallsPreview(spMap);
        })
        .catch(() => { /* preview is best-effort; ignore failures */ })
        .finally(() => setPreviewLoad(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [player?.ID, apiOk, spinType, season, venue]);

  // Fetch is driven ONLY by appliedFilters — i.e. only after "Apply" is clicked
  // (or a player is (re)selected, which applies the defaults automatically).
  useEffect(() => {
    if (!player || !apiOk) { setStats(null); return; }
    setStatsLoad(true); setStats(null);
    const params = {};
    if (appliedFilters.season !== "All Seasons") params.season = appliedFilters.season;
    if (appliedFilters.venue  !== "All Venues")  params.venue  = appliedFilters.venue;
    if (appliedFilters.spinType !== "All Spin") {
      const v = SPIN_TYPE_OPTIONS.find((s) => s.label === appliedFilters.spinType)?.value;
      if (v) params.spin_type = v;
    }
    fetchPlayerStats(player.ID, params)
      .then((d) => { setStats(d.error ? null : d); setStatsLoad(false); })
      .catch(() => setStatsLoad(false));
  }, [player?.ID, apiOk, appliedFilters]);

  const applyFilters = () => setAppliedFilters({ spinType, season, venue });
  const resetFilters  = () => {
    setSpinType(DEFAULT_FILTERS.spinType);
    setSeason(DEFAULT_FILTERS.season);
    setVenue(DEFAULT_FILTERS.venue);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const weaknesses = useMemo(() => {
    if (!stats?.spinComparison?.length) return [];
    return [...stats.spinComparison]
      .sort((a, b) => b.dismissalProb - a.dismissalProb)
      .map((s, i) => ({ type: s.type, severity: i === 0 ? "high" : i === 1 ? "medium" : "low", dismissalProb: s.dismissalProb, sr: s.sr }));
  }, [stats]);

  const runsDistWithColors = useMemo(() => {
    if (!stats?.runsDistribution) return [];
    return stats.runsDistribution.map((d, i) => ({ ...d, color: PIE_COLORS[i] }));
  }, [stats]);

  const filteredSpin = useMemo(() => {
    if (!stats?.spinComparison) return [];
    if (appliedFilters.spinType === "All Spin") return stats.spinComparison;
    return stats.spinComparison.filter((s) => s.type?.toLowerCase() === appliedFilters.spinType.toLowerCase());
  }, [stats, appliedFilters.spinType]);

  const aiKey    = `${player?.ID}-${appliedFilters.spinType}-${appliedFilters.season}-${appliedFilters.venue}`;
  const aiPrompt = player && stats
    ? `You are an expert IPL cricket analyst. Analyze ${player.longName || player.Name}'s batting performance against spin bowling.
Player: ${player.longName || player.Name}, Style: ${player.longBattingStyles || ""}
Stats vs Spin — SR: ${stats.sr}, Avg: ${stats.avg}, Dot%: ${stats.dot_pct}%, Boundary%: ${stats.boundary_pct}%, Wicket Rate: ${stats.wkt_rate}%
Cluster archetype: ${stats.cluster_name}. Filter: ${appliedFilters.spinType}, Season: ${appliedFilters.season}, Venue: ${appliedFilters.venue}
Provide 4-5 sentences covering: overall assessment, key strengths, key weaknesses, most vulnerable spin type, and a fantasy cricket recommendation. Use cricket terminology.`
    : "";

  if (!apiOk) return (
    <EmptyState
      icon={<Icon icon="solar:plug-circle-broken" width={48} />}
      text="Flask API is offline. Start it with: python app.py"
    />
  );

  const sevColor  = (s) => s === "high" ? G.red     : s === "medium" ? G.amber     : G.green;
  const sevBg     = (s) => s === "high" ? G.redLight : s === "medium" ? G.amberLight : G.greenLight;
  const sevBorder = (s) => s === "high" ? "#fca5a5" : s === "medium" ? "#fcd34d"    : "#86efac";

  return (
    <div>
      {/* Search bar */}
      <div style={{ padding: "20px 24px", background: G.gray50, borderBottom: `1px solid ${G.gray200}` }}>
        <div style={{ maxWidth: 600 }}>
          <PlayerSearch players={players} selected={player} onSelect={setPlayer} photoMap={photoMap} />
        </div>
      </div>

      <div style={{ padding: "24px" }}>
        {!player && (
          <EmptyState
            icon={<Icon icon="solar:magnifer-zoom-in-bold-duotone" width={48} />}
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
              <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, background: `${G.green}20`, borderRadius: "50%", transform: "translate(60px,-60px)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 20, position: "relative" }}>
                <PhotoAvatar id={player.ID} name={player.longName || player.Name} size={72} color={G.green} photoUrl={photoMap?.[String(player.ID)]} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: G.white, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>
                    {player.longName || player.Name}
                  </div>
                  <div style={{ fontSize: 14, color: G.greenMid, fontWeight: 600, marginTop: 2 }}>{player.longTeamNames || ""}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {player.longBattingStyles && <Badge label={player.longBattingStyles} color={G.white} bg={`${G.green}80`} />}
                    {stats?.cluster_name      && <Badge label={stats.cluster_name}       color={G.white} bg="rgba(255,255,255,0.15)" />}
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
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon icon="solar:filter-bold" width={14} color={G.gray500} />
                <span style={{ fontSize: 13, fontWeight: 600, color: G.gray600, fontFamily: "'Barlow Condensed', sans-serif" }}>Filters:</span>
                {previewLoad && <InlineSpinner />}
              </div>
              <select value={spinType} onChange={(e) => setSpinType(e.target.value)} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: "pointer", outline: "none" }}>
                <option value="All Spin">
                  All Spin{typeof spinBallsPreview["all spin"] === "number" ? ` (${spinBallsPreview["all spin"]} balls)` : ""}
                </option>
                {SPIN_TYPE_OPTIONS.map((s) => {
                  const balls = spinBallsFor(s.label, s.value);
                  const isDead = balls === 0;
                  return (
                    <option key={s.value} value={s.label} disabled={isDead}>
                      {s.label}{typeof balls === "number" ? ` (${balls} balls)${isDead ? " — no data" : ""}` : ""}
                    </option>
                  );
                })}
              </select>
              <div style={{ position: "relative" }}>
                <select value={season} onChange={(e) => setSeason(e.target.value)} disabled={seasonsLoad} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: seasonsLoad ? "not-allowed" : "pointer", outline: "none", opacity: seasonsLoad ? 0.6 : 1 }}>
                  <option value="All Seasons">All Seasons</option>
                  {playerSeasons.map((s) => {
                    const balls = seasonBallsPreview[s.season] ?? s.balls;
                    const isDead = balls === 0;
                    return (
                      <option key={s.season} value={s.season} disabled={isDead}>
                        {s.season} ({balls} balls){isDead ? " — no data" : ""}
                      </option>
                    );
                  })}
                </select>
                {seasonsLoad && <InlineSpinner />}
              </div>
              <div style={{ position: "relative" }}>
                <select value={venue} onChange={(e) => setVenue(e.target.value)} disabled={venuesLoad} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", background: G.white, color: G.gray700, cursor: venuesLoad ? "not-allowed" : "pointer", outline: "none", opacity: venuesLoad ? 0.6 : 1 }}>
                  <option value="All Venues">All Venues</option>
                  {playerVenues.map((v) => {
                    const balls = venueBallsPreview[v.venue] ?? v.balls;
                    const isDead = balls === 0;
                    return (
                      <option key={v.venue} value={v.venue} disabled={isDead}>
                        {v.venue} ({balls} balls){isDead ? " — no data" : ""}
                      </option>
                    );
                  })}
                </select>
                {venuesLoad && <InlineSpinner />}
              </div>

              <button
                onClick={applyFilters}
                disabled={!hasPendingChanges || statsLoad}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 16px", borderRadius: 8, border: "none",
                  fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: 0.3,
                  background: hasPendingChanges && !statsLoad ? G.green : G.gray200,
                  color: hasPendingChanges && !statsLoad ? G.white : G.gray400,
                  cursor: hasPendingChanges && !statsLoad ? "pointer" : "not-allowed",
                  transition: "background 0.15s ease",
                }}
              >
                {statsLoad
                  ? <InlineSpinner />
                  : <Icon icon="solar:check-circle-bold" width={15} />}
                Apply
              </button>

              {(spinType !== DEFAULT_FILTERS.spinType || season !== DEFAULT_FILTERS.season || venue !== DEFAULT_FILTERS.venue) && (
                <button
                  onClick={resetFilters}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "7px 10px", borderRadius: 8, border: "none",
                    fontSize: 12, fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif",
                    background: "transparent", color: G.gray500, cursor: "pointer",
                  }}
                >
                  <Icon icon="solar:restart-bold" width={13} />
                  Reset
                </button>
              )}

              {hasPendingChanges && (
                <span style={{ fontSize: 11, color: G.amber, fontWeight: 600 }}>
                  Unapplied changes — click Apply to update
                </span>
              )}
            </div>

            {/* Applied filter summary title */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: "10px 14px", marginBottom: 20,
              background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 10,
            }}>
              <Icon icon="solar:tag-bold" width={14} color={G.gray400} />
              <span style={{ fontSize: 12, color: G.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Showing</span>
              <Badge label={appliedFilters.spinType} color={G.green} bg={G.greenLight} />
              <Badge label={appliedFilters.season}   color={G.blue}  bg="#dbeafe" />
              <Badge label={appliedFilters.venue}    color="#8b5cf6" bg="#ede9fe" />
            </div>

            {/* Data quality note — the counts shown in the Season/Venue dropdowns
                are each independent totals (that season across all venues, that
                venue across all seasons). Combining several filters at once can
                intersect down to far fewer balls than either number alone
                suggests, so the real gating below uses the server's actual
                combined-filter count (stats.balls), not these independent ones. */}
            {(appliedFilters.season !== "All Seasons" || appliedFilters.venue !== "All Venues") && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", marginBottom: 16, background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 10 }}>
                <Icon icon="solar:info-circle-bold" width={18} color={G.gray400} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: G.gray500 }}>
                  Combining Season + Venue narrows to only deliveries matching <strong>both</strong> — this can be far fewer balls than either filter shows on its own.
                </div>
              </div>
            )}

            {statsLoad && <Spinner text="Loading player stats…" />}

            {stats && (() => {
              // Ground truth: the actual number of balls the server found for
              // this exact combination of Season + Venue + Spin Type.
              const totalBalls = typeof stats.balls === "number" ? stats.balls : 0;

              if (totalBalls === 0) {
                return (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", marginBottom: 16, background: G.redLight, border: "1px solid #fca5a5", borderRadius: 10, borderLeft: `4px solid ${G.red}` }}>
                    <Icon icon="solar:danger-circle-bold" width={20} color={G.red} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: G.red, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>No matching deliveries</div>
                      <div style={{ fontSize: 12, color: "#b91c1c" }}>
                        {player.longName || player.Name} faced 0 balls for {appliedFilters.spinType} · {appliedFilters.season} · {appliedFilters.venue} combined. Try loosening one filter (e.g. switch Venue back to "All Venues").
                      </div>
                    </div>
                  </div>
                );
              }

              if (totalBalls < 10) {
                return (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", marginBottom: 16, background: G.amberLight, border: "1px solid #fcd34d", borderRadius: 10, borderLeft: `4px solid ${G.amber}` }}>
                    <Icon icon="solar:danger-triangle-bold" width={20} color={G.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: G.amber, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 2 }}>Too few balls for this combination</div>
                      <div style={{ fontSize: 12, color: "#92400e" }}>
                        Only {totalBalls} balls match {appliedFilters.spinType} · {appliedFilters.season} · {appliedFilters.venue} combined — not enough for reliable stats. Try loosening a filter.
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <>
                  {/* KPI row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
                    <KpiCard label="Strike Rate vs Spin" value={stats.sr}                icon={<Icon icon="solar:bolt-bold"              width={22} />} color={G.green} />
                    <KpiCard label="Dot Ball %"          value={`${stats.dot_pct}%`}     icon={<Icon icon="solar:stop-circle-bold"        width={22} />} color={G.gray500} />
                    <KpiCard label="Boundary %"          value={`${stats.boundary_pct}%`} icon={<Icon icon="solar:arrow-right-up-bold"   width={22} />} color={G.accent} />
                    <KpiCard label="Wicket Rate"         value={`${stats.wkt_rate}%`}    icon={<Icon icon="solar:target-bold"             width={22} />} color={G.red} />
                    <KpiCard label="Average vs Spin"     value={stats.avg}               icon={<Icon icon="solar:graph-up-bold"           width={22} />} color={G.blue} />
                    <KpiCard label="Total Balls Faced"   value={stats.balls}             icon={<Icon icon="solar:hashtag-bold"            width={22} />} color="#8b5cf6" />
                  </div>

                  {/* Charts row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <Card>
                      <SectionTitle icon={<Icon icon="solar:pie-chart-2-bold-duotone" width={18} />}>Runs Distribution</SectionTitle>
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

                    <Card>
                      <SectionTitle icon={<Icon icon="solar:chart-bold-duotone" width={18} />}>Performance by Spin Type</SectionTitle>
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
                      <SectionTitle icon={<Icon icon="solar:graph-up-bold-duotone" width={18} />}>Historical IPL Performance vs Spin</SectionTitle>
                      <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={stats.seasons}>
                            <CartesianGrid strokeDasharray="3 3" stroke={G.gray100} vertical={false} />
                            <XAxis dataKey="season" tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: G.gray500, fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11, color: G.gray500 }} />
                            <Line type="monotone" dataKey="sr" name="Strike Rate" stroke={G.green} strokeWidth={2.5}
                              dot={(props) => { const sel = stats.selected_season && props.payload?.season === String(stats.selected_season); return <circle key={props.key} cx={props.cx} cy={props.cy} r={sel ? 7 : 4} fill={sel ? G.accent : G.green} stroke={G.white} strokeWidth={sel ? 2 : 0} />; }}
                            />
                            <Line type="monotone" dataKey="avg" name="Average" stroke={G.accent} strokeWidth={2.5} strokeDasharray="5 3"
                              dot={(props) => { const sel = stats.selected_season && props.payload?.season === String(stats.selected_season); return <circle key={props.key} cx={props.cx} cy={props.cy} r={sel ? 7 : 4} fill={sel ? G.blue : G.accent} stroke={G.white} strokeWidth={sel ? 2 : 0} />; }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {stats.selected_season && (
                        <div style={{ fontSize: 11, color: G.gray400, marginTop: 6, textAlign: "right" }}>
                          Highlighted dot = selected season ({stats.selected_season}) · Chart always shows full career trend
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Phase breakdown */}
                  {stats.phases?.length > 0 && (
                    <Card style={{ marginBottom: 16 }}>
                      <SectionTitle icon={<Icon icon="solar:clock-circle-bold-duotone" width={18} />}>Performance by Phase</SectionTitle>
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
                      <SectionTitle icon={<Icon icon="solar:danger-triangle-bold-duotone" width={18} />}>Weakness Analysis</SectionTitle>
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
                      <SectionTitle icon={<Icon icon="solar:target-bold-duotone" width={18} />}>Dismissal Analysis</SectionTitle>
                      <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={stats.dismissals} cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={2}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
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
                        <SectionTitle icon={<Icon icon="solar:fire-bold-duotone" width={18} />}>Recent Form</SectionTitle>
                        <div style={{ fontSize: 32, fontWeight: 800, color: G.green, fontFamily: "'Barlow Condensed', sans-serif" }}>{stats.form_sr_last5}</div>
                        <div style={{ fontSize: 12, color: G.gray500, marginTop: 4 }}>Strike Rate (last 5 innings vs spin)</div>
                        <div style={{ fontSize: 12, color: G.gray600, marginTop: 8 }}>Career SR vs spin: <strong>{stats.sr}</strong></div>
                      </Card>
                      <Card style={{ borderTop: `3px solid ${G.blue}` }}>
                        <SectionTitle icon={<Icon icon="solar:brain-bold-duotone" width={18} />}>Batter Archetype</SectionTitle>
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