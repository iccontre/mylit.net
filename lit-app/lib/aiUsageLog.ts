import type { AiUnavailableReason } from "./agentTypes";

// Dev-safe AI usage telemetry for MYLIT's server-only AI routes. Logs ONLY sizes/metadata —
// never prompt/completion content, and never the API key. Safe to leave on in production
// (Vercel function logs) since nothing here is user-identifying or secret.

export type AiUsageLogEntry = {
  route: string;
  promptChars: number;
  /** Only ever set when a completion was actually received. */
  completionChars?: number | null;
  ok: boolean;
  reason?: string;
};

export function logAiUsage(entry: AiUsageLogEntry): void {
  console.log(
    JSON.stringify({
      tag: "ai_usage",
      route: entry.route,
      promptChars: entry.promptChars,
      completionChars: entry.completionChars ?? null,
      ok: entry.ok,
      reason: entry.reason ?? null,
      timestamp: new Date().toISOString(),
    })
  );
}

/** Classifies a caught AI-call error into a friendly, client-safe reason — never echoes the raw error object (which could vary by SDK/provider and isn't guaranteed secret-free). */
export function classifyAiError(error: unknown): AiUnavailableReason {
  const status = (error as { status?: number } | null | undefined)?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429 || /\b429\b/.test(message)) {
    return /quota/i.test(message) ? "quota_exceeded" : "rate_limited";
  }
  return "error";
}
