// ─── Ollama local LLM streaming helper ───────────────────────────────────────
const OLLAMA_URL   = "http://localhost:11434";
const OLLAMA_MODEL = "llama3"; // change to whatever model you have pulled

/**
 * Stream a prompt through Ollama, calling onToken(fullTextSoFar) on each chunk.
 * Returns the complete text when done.
 */
export async function streamOllama(prompt, onToken) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:   OLLAMA_MODEL,
      prompt,
      stream:  true,
      options: { num_predict: 400, temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama error ${response.status} — is Ollama running? (run: ollama serve)`
    );
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let full      = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.response) {
          full += chunk.response;
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
