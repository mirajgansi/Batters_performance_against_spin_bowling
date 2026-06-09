import { API_BASE } from "../constants";

// ── AI streaming insight ──────────────────────────────────────────────────
export async function generateAIInsight(prompt, onToken) {
  const res = await fetch(`${API_BASE}/ai-insight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const chunk = JSON.parse(line.slice(6));
          fullText += chunk.token;
          if (onToken) onToken(fullText);
        } catch {}
      }
    }
  }
  return fullText;
}

// ── Health check ──────────────────────────────────────────────────────────
export async function checkApiHealth() {
  const res = await fetch(`${API_BASE}/health`, {
    signal: AbortSignal.timeout(2000),
  });
  return res.ok;
}

// ── Players list ──────────────────────────────────────────────────────────
export async function fetchPlayers() {
  const res = await fetch(`${API_BASE}/players`);
  if (!res.ok) throw new Error("Failed to fetch players");
  return res.json();
}

// ── Player stats ──────────────────────────────────────────────────────────
export async function fetchPlayerStats(playerId) {
  const res = await fetch(`${API_BASE}/player-stats/${playerId}`);
  if (!res.ok) throw new Error("Failed to fetch player stats");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Match prediction ──────────────────────────────────────────────────────
export async function fetchPrediction({ playerId, spinType, phase, venue, batterFeatures, batterVsSpin }) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: playerId,
      spin_type: spinType,
      phase,
      venue,
      batter_features: batterFeatures,
      batter_vs_spin: batterVsSpin,
    }),
  });
  if (!res.ok) throw new Error("Flask error");
  const result = await res.json();
  if (result.error) throw new Error(result.error);
  return result;
}