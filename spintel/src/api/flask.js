// ─── All Flask API calls go through here ─────────────────────────────────────
// In dev, Vite proxies /api/* → http://localhost:5000/* (see vite.config.js)
// In prod, set VITE_API_URL env var to your deployed Flask URL
const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Health ────────────────────────────────────────────────────────────────────
export const checkHealth = () => apiFetch("/health");

// ── Reference data ────────────────────────────────────────────────────────────
export const fetchPlayers    = ()      => apiFetch("/players");
export const fetchVenues     = ()      => apiFetch("/venues");
export const fetchTeams      = ()      => apiFetch("/teams");
export const fetchSpinBowlers = (team) =>
  apiFetch(`/spin-bowlers${team ? `?team=${encodeURIComponent(team)}` : ""}`);

// ── Per-player data ───────────────────────────────────────────────────────────
export const fetchPlayerStats = (id, params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v && v !== "All Seasons" && v !== "All Venues" && v !== "All Spin"))
  ).toString();
  return apiFetch(`/player-stats/${id}${qs ? `?${qs}` : ""}`);
};

export const fetchPlayerSeasons = (id) =>
  apiFetch(`/player-seasons/${id}`);

export const fetchPlayerVenues  = (id) =>
  apiFetch(`/player-venues/${id}`);

// ── Prediction ────────────────────────────────────────────────────────────────
export const runPrediction = (payload) =>
  apiFetch("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// ── Validation stats ──────────────────────────────────────────────────────────
export const fetchValidationStats = () => apiFetch("/validation-stats");
