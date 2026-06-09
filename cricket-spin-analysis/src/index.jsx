import { useState, useEffect, useCallback } from "react";
import { checkApiHealth, fetchPlayers, fetchPlayerStats } from "../utils/api";

// ── API health polling ────────────────────────────────────────────────────
export function useApiStatus(intervalMs = 10_000) {
  const [status, setStatus] = useState("checking"); // "checking" | "connected" | "disconnected"

  useEffect(() => {
    const check = async () => {
      try {
        const ok = await checkApiHealth();
        setStatus(ok ? "connected" : "disconnected");
      } catch {
        setStatus("disconnected");
      }
    };

    check();
    const interval = setInterval(check, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return status;
}

// ── Players list ──────────────────────────────────────────────────────────
export function usePlayers(apiStatus) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (apiStatus !== "connected") return;
    setLoading(true);
    fetchPlayers()
      .then((data) => {
        console.log("Players loaded:", data.length);
        setPlayers(data);
      })
      .catch((err) => console.error("Failed to load players:", err))
      .finally(() => setLoading(false));
  }, [apiStatus]);

  return { players, loading };
}

// ── Player stats ──────────────────────────────────────────────────────────
export function usePlayerStats(selectedPlayer, apiStatus) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedPlayer || apiStatus !== "connected") {
      setStats(null);
      return;
    }
    setLoading(true);
    fetchPlayerStats(selectedPlayer.ID)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selectedPlayer, apiStatus]);

  return { stats, loading };
}

// ── AI insight with localStorage caching ─────────────────────────────────
export function useAIInsight({ enabled, type, playerId, fingerprint, prompt, generateFn, getCached, setCached }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cacheStatus, setCacheStatus] = useState(null); // "hit" | "fresh" | null

  const run = useCallback(async () => {
    if (!enabled || !playerId || !fingerprint) return;

    const cached = getCached(type, playerId, fingerprint);
    if (cached) {
      setInsight(cached);
      setLoading(false);
      setCacheStatus("hit");
      return;
    }

    setInsight(null);
    setLoading(true);
    setCacheStatus(null);

    try {
      const text = await generateFn(prompt, (partial) => setInsight(partial));
      if (text) {
        setCached(type, playerId, fingerprint, text);
        setCacheStatus("fresh");
      }
    } catch {
      setInsight("AI insight unavailable — make sure Ollama is running.");
    } finally {
      setLoading(false);
    }
  }, [enabled, type, playerId, fingerprint, prompt, generateFn, getCached, setCached]);

  useEffect(() => {
    run();
  }, [run]);

  return { insight, loading, cacheStatus };
}