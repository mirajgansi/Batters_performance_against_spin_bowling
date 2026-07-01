// ─── Gemini streaming helper (via Flask backend) ─────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * Stream a prompt through your Flask backend's /ai-insight endpoint (Gemini),
 * calling onToken(fullTextSoFar) on each chunk.
 * Returns the complete text when done.
 */
export async function streamGemini(prompt, onToken) {
  const response = await fetch(`${API_BASE}/ai-insight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`AI insight error ${response.status}`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let full      = "";
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line for next chunk

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        if (chunk.token) {
          full += chunk.token;
          onToken(full);
        }
        if (chunk.done) return full;
      } catch {
        // malformed chunk — skip
      }
    }
  }
  return full;
}