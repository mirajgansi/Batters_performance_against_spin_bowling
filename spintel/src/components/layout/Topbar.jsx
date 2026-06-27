import { G } from "../../utils/tokens";
import { Badge } from "../ui/index.jsx";

const TITLES = {
  dashboard:  "Batter Analysis Dashboard",
  prediction: "Match Prediction",
};
const SUBS = {
  dashboard:  "Spin bowling matchup analysis",
  prediction: "AI-powered performance forecast",
};

export function Topbar({ page, apiStatus, batterCount }) {
  const dotColor =
    apiStatus === "connected"    ? G.green :
    apiStatus === "checking"     ? G.amber : G.red;

  const statusLabel =
    apiStatus === "connected"    ? `Connected · ${batterCount} batters` :
    apiStatus === "checking"     ? "Connecting…" : "API Offline";

  return (
    <div style={{
      height: 58, background: G.white, borderBottom: `2px solid ${G.green}`,
      display: "flex", alignItems: "center", padding: "0 24px", gap: 16,
      position: "sticky", top: 0, zIndex: 100,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 18, fontWeight: 700, color: G.gray900,
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3, lineHeight: 1.2,
        }}>
          {TITLES[page]}
        </div>
        <div style={{ fontSize: 11, color: G.gray500 }}>{SUBS[page]}</div>
      </div>

      {/* API status pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 12px", border: `1px solid ${G.gray200}`, borderRadius: 20,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", background: dotColor,
        }} />
        <span style={{
          fontSize: 11, color: G.gray500,
          fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          {statusLabel}
        </span>
      </div>

      <Badge label="AI-Powered" color="#fff" bg={G.green} />
    </div>
  );
}
