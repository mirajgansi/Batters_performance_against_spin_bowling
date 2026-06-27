import { useState, useEffect, useCallback } from "react";
import { G } from "../../utils/tokens";
import { streamOllama } from "../../api/ollama";

export function AIInsightBox({ prompt, triggerKey, disabled }) {
  const [text,      setText]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    if (disabled) return;
    setLoading(true); setError(null); setText(""); setGenerated(false);
    try {
      await streamOllama(prompt, (t) => setText(t));
      setGenerated(true);
    } catch {
      setError("AI unavailable. Make sure Ollama is running: ollama serve");
    }
    setLoading(false);
  }, [prompt, disabled]);

  useEffect(() => { setGenerated(false); setText(""); }, [triggerKey]);

  return (
    <div style={{
      background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
      border: `1px solid ${G.green}30`, borderRadius: 12,
      padding: "18px 20px", borderLeft: `4px solid ${G.green}`,
    }}>
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <span style={{
            fontSize: 14, fontWeight: 700, color: G.green,
            fontFamily: "'Barlow Condensed', sans-serif",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            AI Insight
          </span>
        </div>
        <button
          onClick={generate}
          disabled={loading || disabled}
          style={{
            padding: "6px 14px",
            background: disabled ? G.gray300 : G.green,
            color: "#fff", border: "none", borderRadius: 20,
            fontSize: 12, fontWeight: 600,
            cursor: loading || disabled ? "not-allowed" : "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Generating…" : generated ? "Refresh" : "Generate Insight"}
        </button>
      </div>

      {error && <div style={{ color: G.red, fontSize: 13 }}>{error}</div>}

      {loading && !text && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: G.green, opacity: 0.4,
                animation: `blink 1.2s ${i * 0.2}s infinite`,
              }}
            />
          ))}
          <span style={{ fontSize: 13, color: G.gray500, marginLeft: 6 }}>
            Analysing performance data…
          </span>
        </div>
      )}

      {text && (
        <p style={{
          fontSize: 13.5, color: G.gray700, lineHeight: 1.8,
          margin: 0, whiteSpace: "pre-wrap",
        }}>
          {text}
        </p>
      )}

      {!text && !loading && !error && (
        <p style={{ fontSize: 13, color: G.gray400, margin: 0, fontStyle: "italic" }}>
          {disabled
            ? "Select a player to enable AI insight."
            : 'Click "Generate Insight" to get AI-powered cricket analysis.'}
        </p>
      )}
    </div>
  );
}
