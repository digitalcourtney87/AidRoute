// Single fetch wrapper for the Claude API, per handoff §Stack: model pinned,
// temperature 0, 30s timeout, server routes only. Routes own the canned-demo
// fallback; this module only fails cleanly.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 30_000;

// Live calls are unavailable as a matter of configuration, not because the
// visitor did anything wrong: no key, or a key the API rejects. Routes catch
// this one type and degrade to the demo-only notice (docs/adr/0005 §3.3), so
// a stale or revoked key on the deployment can never become a red error.
export class LiveLlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveLlmUnavailableError";
  }
}

export function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

// The prompts forbid fences and preamble, but parse defensively anyway: strip
// fences, then fall back to slicing from the first bracket to the last.
export function parseModelJson<T>(text: string): T {
  const stripped = stripJsonFences(text);
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const start = stripped.search(/[[{]/);
    const end = Math.max(stripped.lastIndexOf("]"), stripped.lastIndexOf("}"));
    if (start !== -1 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1)) as T;
    }
    throw new Error(
      `Model response is not valid JSON: ${stripped.slice(0, 120)}…`,
    );
  }
}

export interface ClaudeCallOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  // The handoff's 30s default fits extraction; checklist generation is a much
  // longer output and needs more headroom (the canned demo path is instant
  // regardless).
  timeoutMs?: number;
}

export async function callClaude({
  system,
  prompt,
  maxTokens = 4096,
  timeoutMs = TIMEOUT_MS,
}: ClaudeCallOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LiveLlmUnavailableError(
      "ANTHROPIC_API_KEY is not set — copy .env.example to .env.local and add the key.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      const detail = `Claude API ${res.status}: ${body.slice(0, 300)}`;
      // 401/403 mean the key is gone, stale or revoked — the same situation as
      // no key at all. Anything else (429, 5xx) is transient and stays a plain
      // error, so the route still invites a retry.
      if (res.status === 401 || res.status === 403) {
        throw new LiveLlmUnavailableError(detail);
      }
      throw new Error(detail);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      stop_reason: string;
    };
    return data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Claude API call timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
