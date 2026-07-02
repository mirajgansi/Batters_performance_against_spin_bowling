// ─── All Flask API calls go through here ─────────────────────────────────────
// In dev, Vite proxies /api/* → http://localhost:5000/* (see vite.config.js)
// In prod, set VITE_API_URL env var to your deployed Flask URL
const BASE = "VITE_API_URL" in import.meta.env ? import.meta.env.VITE_API_URL : "/api";

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Health ────────────────────────────────────────────────────────────────────
export const checkHealth = () => apiFetch("/health");

// ── Reference data ────────────────────────────────────────────────────────────
export const fetchPlayers     = ()     => apiFetch("/players");
export const fetchVenues      = ()     => apiFetch("/venues");
export const fetchTeams       = ()     => apiFetch("/teams");
export const fetchSpinBowlers = (team) =>
  apiFetch(`/spin-bowlers${team ? `?team=${encodeURIComponent(team)}` : ""}`);

// Shared helper — drops empty/sentinel filter values so every per-player call
// builds its query string the same way (no "?season=All Seasons" garbage).
const buildFilterQs = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v && v !== "All Seasons" && v !== "All Venues" && v !== "All Spin")
    )
  ).toString();
  return qs ? `?${qs}` : "";
};

// ── Per-player data ───────────────────────────────────────────────────────────
export const fetchPlayerStats = (id, params = {}) =>
  apiFetch(`/player-stats/${id}${buildFilterQs(params)}`);

export const fetchPlayerSeasons = (id, params = {}) =>
  // params: { venue?, spin_type? } — used for the live dropdown preview.
  // Called with no params on initial player load to get the base season list.
  apiFetch(`/player-seasons/${id}${buildFilterQs(params)}`);

export const fetchPlayerVenues = (id, params = {}) =>
  // params: { season?, spin_type? }
  apiFetch(`/player-venues/${id}${buildFilterQs(params)}`);

export const fetchPlayerSpinBreakdown = (id, params = {}) =>
  // params: { season?, venue? } → { spinTypes: [{type, short, balls}], total_balls }
  apiFetch(`/player-spin-breakdown/${id}${buildFilterQs(params)}`);

// ── Prediction ────────────────────────────────────────────────────────────────
export const runPrediction = (payload) =>
  apiFetch("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// ── Validation stats ──────────────────────────────────────────────────────────
export const fetchValidationStats = () => apiFetch("/validation-stats");