// usePrediction.js
// Drop this file into your React project's src/ folder.
// Replace the mockPrediction() calls in App.jsx with this hook.

import { useState, useCallback } from "react";

const API_BASE = "http://localhost:5000"; // Change if Flask runs elsewhere

/**
 * Fetch pre-computed batter stats from the backend CSV data.
 * Returns { batter_features, batter_vs_spin } or null on error.
 */
export async function fetchPlayerStats(playerId) {
  try {
    const res = await fetch(`${API_BASE}/player-stats/${playerId}`);
    if (!res.ok) throw new Error("Failed to fetch player stats");
    return await res.json();
  } catch (err) {
    console.warn("fetchPlayerStats error:", err);
    return null;
  }
}

/**
 * Call the Flask /predict endpoint.
 *
 * @param {object} player     - player object from FALLBACK_PLAYERS / CSV
 * @param {string} spinType   - e.g. "right-arm offbreak"
 * @param {string} phase      - "Powerplay" | "Middle" | "Death"
 * @param {string} venue      - venue name string
 * @returns prediction object or null
 */
export async function fetchPrediction(player, spinType, phase, venue) {
  if (!player) return null;

  // 1. Get this player's pre-computed stats from the backend
  const statsData = await fetchPlayerStats(player.ID);

  const batter_features = statsData?.batter_features ?? {};
  // If batter_vs_spin is an array, pick the row matching spinType
  const bvs_rows = statsData?.batter_vs_spin ?? [];
  const batter_vs_spin =
    bvs_rows.find?.((r) => r.spin_type === spinType) ?? bvs_rows[0] ?? {};

  // 2. Send to Flask model
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: player.ID,
      spin_type: spinType,
      phase,
      venue,
      batter_features,
      batter_vs_spin,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Prediction failed");
  }

  return res.json();
}

/**
 * React hook — use this in your PredictionTab component.
 *
 * Usage:
 *   const { prediction, loading, error, predict } = usePrediction();
 *   // call predict(player, spinType, phase, venue) on button click or select change
 */
export function usePrediction() {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const predict = useCallback(async (player, spinType, phase, venue) => {
    if (!player) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPrediction(player, spinType, phase, venue);
      setPrediction(result);
    } catch (err) {
      setError(err.message);
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { prediction, loading, error, predict };
}
