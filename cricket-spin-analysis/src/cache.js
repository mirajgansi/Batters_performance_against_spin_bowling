import { CACHE_TTL_MS } from "../constants";

// ── Stats Fingerprints ────────────────────────────────────────────────────
// Short strings that represent the key metrics for a given stats object.
// If the stats change, the fingerprint changes, busting the cache.

export function buildStatsFingerprint(stats) {
  if (!stats) return "";
  return [
    stats.sr?.toFixed(2),
    stats.avg?.toFixed(2),
    stats.dot_pct?.toFixed(2),
    stats.boundary_pct?.toFixed(2),
    stats.wkt_rate?.toFixed(2),
    stats.balls,
    stats.phases?.map((p) => `${p.sr}|${p.avg}`).join(","),
  ].join("_");
}

export function buildPredFingerprint(pred) {
  if (!pred) return "";
  return [
    pred.spin_type,
    pred.phase,
    pred.venue,
    pred.predicted_sr?.toFixed(2),
    pred.predicted_avg?.toFixed(2),
    pred.dismissal_prob?.toFixed(4),
  ].join("_");
}

// ── localStorage AI Insight Cache ─────────────────────────────────────────
// Key format:  ai_insight_{type}_{playerId}_{statsFingerprint}
// Stale entries for the same player are pruned on write to keep storage lean.

const LS_PREFIX = "ai_insight_";

function lsCacheKey(type, playerId, fingerprint) {
  return `${LS_PREFIX}${type}_${playerId}_${fingerprint}`.replace(/\s+/g, "_");
}

export function getCachedInsight(type, playerId, fingerprint) {
  try {
    const key = lsCacheKey(type, playerId, fingerprint);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { text, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

export function setCachedInsight(type, playerId, fingerprint, text) {
  try {
    prunePlayerInsights(type, playerId, fingerprint);
    const key = lsCacheKey(type, playerId, fingerprint);
    localStorage.setItem(key, JSON.stringify({ text, savedAt: Date.now() }));
  } catch (e) {
    console.warn("Could not cache AI insight:", e);
  }
}

function prunePlayerInsights(type, playerId, currentFingerprint) {
  try {
    const prefix = `${LS_PREFIX}${type}_${playerId}_`;
    const currentKey = lsCacheKey(type, playerId, currentFingerprint);
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k !== currentKey) {
        toDelete.push(k);
      }
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch {}
}