/* eslint-disable */
import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { G, SPIN_TYPE_OPTIONS, PHASE_OPTIONS } from "../utils/tokens";
import {
  KpiCard, Card, SectionTitle, EmptyState, Badge, PhotoAvatar,
} from "../components/ui/index.jsx";
import { PlayerSearch } from "../components/ui/PlayerSearch.jsx";
import { fetchPlayerStats, runPrediction } from "../api/flask";
import { streamOllama } from "../api/ollama";

export function PredictionPage({ players, venues, teams, apiOk, photoMap = {} }) {
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

  useEffect(() => { if (venues.length && !venue) setVenue(venues[0]); }, [venues]);
  useEffect(() => { if (teams.length  && !oppTeam) setOppTeam(teams[0]); }, [teams]);

  useEffect(() => {
    if (!player || !apiOk) { setPlayerStats(null); return; }
    fetchPlayerStats(player.ID)
      .then((d) => setPlayerStats(d.error ? null : d))
      .catch(() => {});
  }, [player?.ID, apiOk]);

  const generate = async () => {
    if (!player) return;
    setPredLoading(true); setPredResult(null); setAiPredText("");
    try {
      const data = await runPrediction({ player_id: player.ID, spin_type: spinType, phase, venue, innings, n_balls: nBalls });
      setPredResult(data);
      setAiPredLoad(true);
      const spinLabel = SPIN_TYPE_OPTIONS.find((s) => s.value === spinType)?.label || spinType;
      const prompt = `You are an IPL cricket analyst explaining a machine learning prediction.

Player: ${player.longName || player.Name}
Match: vs ${oppTeam}
Venue: ${venue}
Phase: ${PHASE_OPTIONS.find((p) => p.value === phase)?.label}
Innings: ${innings}
Bowling Type: ${spinLabel}
Balls Predicted: ${nBalls}

Prediction:
- Predicted Runs: ${data.predicted_runs}
- Predicted Strike Rate: ${data.predicted_sr}
- Expected Runs (adjusted for dismissal risk): ${data.expected_runs}
- Dismissal Probability per Ball: ${data.dismissal_prob_pct}%
- Chance of Dismissal During Spell: ${data.dismiss_in_spell_pct}%
- Confidence: ${data.confidence}%
- Player Archetype: ${data.cluster_name}
- Model Version: ${data.model_version}

Write a concise analysis in 3-4 sentences. Explain why the model predicts this performance, which player strengths, matchup, venue, and phase contribute, and the biggest uncertainty that could cause actual performance to differ. Do NOT repeat every statistic above. Write in the style of a professional Cricbuzz or ESPNcricinfo analyst.`;
      try { await streamOllama(prompt, (t) => setAiPredText(t)); } catch {}
      setAiPredLoad(false);
    } catch (e) {
      setPredResult({ error: e.message });
    }
    setPredLoading(false);
  };

  const riskColor = predResult?.confidence >= 75 ? G.green : predResult?.confidence >= 55 ? G.amber : G.red;
  const riskLabel = predResult?.confidence >= 75 ? "Low Risk" : predResult?.confidence >= 55 ? "Medium Risk" : "High Risk";
  const sel = (s) => ({ padding: "9px 12px", borderRadius: 8, border: `1px solid ${G.gray300}`, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif", outline: "none", width: "100%" });

  if (!apiOk) return (
    <EmptyState
      icon={<Icon icon="solar:plug-circle-broken" width={48} />}
      text="Flask API is offline. Start it to use Match Prediction."
    />
  );

  const phaseIcons = { Powerplay: "solar:sun-bold-duotone", Middle: "solar:calendar-bold-duotone", Death: "solar:moon-bold-duotone" };

  return (
    <div style={{ padding: "24px" }}>

      {/* Batter selector */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle icon={<Icon icon="solar:cricket-bold-duotone" width={18} />}>Select Batter</SectionTitle>
        <div style={{ maxWidth: 500 }}>
          <PlayerSearch players={players} selected={player} onSelect={(p) => { setPlayer(p); setPredResult(null); setAiPredText(""); }} photoMap={photoMap} />
        </div>
        {player && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "12px 16px", background: G.greenLight, borderRadius: 8 }}>
            <PhotoAvatar id={player.ID} name={player.longName || player.Name} size={48} color={G.green} photoUrl={photoMap?.[String(player.ID)]} />
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

      {/* Venue + Phase */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionTitle icon={<Icon icon="solar:map-point-bold-duotone" width={18} />}>Venue & Opponent</SectionTitle>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Venue</label>
            <select value={venue} onChange={(e) => setVenue(e.target.value)} style={sel()}>
              {venues.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Opponent Team</label>
            <select value={oppTeam} onChange={(e) => setOppTeam(e.target.value)} style={sel()}>
              {teams.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </Card>

        <Card>
          <SectionTitle icon={<Icon icon="solar:clock-circle-bold-duotone" width={18} />}>Match Phase</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PHASE_OPTIONS.map((p) => (
              <div key={p.value} onClick={() => setPhase(p.value)} style={{
                padding: "11px 16px", borderRadius: 8, cursor: "pointer",
                background: phase === p.value ? G.green : G.gray50,
                color: phase === p.value ? G.white : G.gray700,
                border: `1px solid ${phase === p.value ? G.green : G.gray200}`,
                fontSize: 14, fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif",
                transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10,
              }}>
                <Icon icon={phaseIcons[p.value]} width={16} color={phase === p.value ? G.white : G.gray400} />
                {p.label}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Spin + Innings Setup */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle icon={<Icon icon="solar:wind-bold-duotone" width={18} />}>Spin & Innings Setup</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Spin Type</label>
            <select value={spinType} onChange={(e) => setSpinType(e.target.value)} style={sel()}>
              {SPIN_TYPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Innings</label>
            <select value={innings} onChange={(e) => setInnings(Number(e.target.value))} style={sel()}>
              <option value={1}>Innings 1</option>
              <option value={2}>Innings 2</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: G.gray500, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Balls to Predict</label>
            <select value={nBalls} onChange={(e) => setNBalls(Number(e.target.value))} style={sel()}>
              {[6, 12, 18, 24, 30].map((n) => <option key={n} value={n}>{n} balls</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Generate button */}
      <button onClick={generate} disabled={predLoading || !player} style={{
        width: "100%", padding: "14px", background: !player ? G.gray300 : G.green,
        color: G.white, border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700,
        cursor: !player ? "not-allowed" : "pointer", fontFamily: "'Barlow Condensed', sans-serif",
        letterSpacing: 0.5, marginBottom: 20, transition: "all 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        {predLoading
          ? <><Icon icon="svg-spinners:3-dots-fade" width={22} /> Running Model…</>
          : <><Icon icon="solar:magic-stick-3-bold-duotone" width={20} /> Generate AI Prediction</>
        }
      </button>

      {/* Error */}
      {predResult?.error && (
        <Card style={{ marginBottom: 16, borderLeft: `4px solid ${G.red}`, background: G.redLight }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: G.red, fontSize: 13 }}>
            <Icon icon="solar:close-circle-bold" width={16} />
            Prediction failed: {predResult.error}
          </div>
        </Card>
      )}

      {/* Results */}
      {predResult && !predResult.error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            <KpiCard label="Predicted Runs"       value={predResult.predicted_runs}           icon={<Icon icon="solar:cricket-bold"         width={22} />} color={G.green} />
            <KpiCard label="Strike Rate"          value={predResult.predicted_sr}             icon={<Icon icon="solar:bolt-bold"            width={22} />} color={G.blue} />
            <KpiCard label="Dismissal Prob/ball"  value={`${predResult.dismissal_prob_pct}%`} icon={<Icon icon="solar:target-bold"          width={22} />} color={G.red} />
            <KpiCard label={`Dismiss in ${nBalls}b`} value={`${predResult.dismiss_in_spell_pct}%`} icon={<Icon icon="solar:bomb-bold"       width={22} />} color={G.amber} />
          </div>

          {/* Confidence */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionTitle icon={<Icon icon="solar:chart-square-bold-duotone" width={18} />}>Confidence Score</SectionTitle>
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

          {/* Matchup notes */}
          <Card style={{ marginBottom: 16, borderLeft: `4px solid ${G.accent}` }}>
            <SectionTitle icon={<Icon icon="solar:lightbulb-bold-duotone" width={18} />}>Matchup Analysis</SectionTitle>
            {[
              `${player.longName || player.Name} predicted SR of ${predResult.predicted_sr} vs ${SPIN_TYPE_OPTIONS.find((s) => s.value === spinType)?.label} at ${venue} (${PHASE_OPTIONS.find((p) => p.value === phase)?.label}).`,
              `Expected runs adjusted for dismissal risk: ${predResult.expected_runs} runs in ${nBalls} balls.`,
              `${predResult.cluster_name} archetype — ${predResult.confidence >= 75 ? "high confidence prediction based on strong historical data." : predResult.confidence >= 55 ? "moderate confidence — some variability expected." : "low confidence — limited historical data for this matchup."}`,
            ].map((note, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Icon icon="solar:arrow-right-bold" width={14} color={G.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13, color: G.gray700 }}>{note}</span>
              </div>
            ))}
          </Card>

          {/* AI explanation */}
          <div style={{ background: G.greenLight, border: `1px solid ${G.green}30`, borderRadius: 12, padding: "18px 20px", borderLeft: `4px solid ${G.green}`, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon icon="solar:robot-bold-duotone" width={20} color={G.green} />
              <span style={{ fontSize: 14, fontWeight: 700, color: G.green, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "uppercase", letterSpacing: 0.5 }}>
                AI Prediction Explanation
              </span>
            </div>
            {aiPredLoad && !aiPredText && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon="svg-spinners:3-dots-fade" width={24} color={G.green} />
                <span style={{ fontSize: 13, color: G.gray500 }}>Generating explanation…</span>
              </div>
            )}
            {aiPredText && <p style={{ fontSize: 13.5, color: G.gray700, lineHeight: 1.8, margin: 0 }}>{aiPredText}</p>}
          </div>
        </>
      )}
    </div>
  );
}
