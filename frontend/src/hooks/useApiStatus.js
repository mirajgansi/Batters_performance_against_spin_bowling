import { useState, useEffect } from "react";
import { checkHealth } from "../api/flask";

/**
 * Polls Flask /health every 10 seconds.
 * Returns "checking" | "connected" | "disconnected"
 */
export function useApiStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(
          ("https://spin-backend.onrender.com" ) + "/health",
          { signal: AbortSignal.timeout(2500) }
        );
        setStatus(r.ok ? "connected" : "disconnected");
      } catch {
        setStatus("disconnected");
      }
    };

    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  return status;
}
