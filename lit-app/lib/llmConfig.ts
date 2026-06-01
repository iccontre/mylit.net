/**
 * LLM (Ollama) configuration for goal milestone generation — Phase 2.
 *
 * The model runs on a local-network machine (a ROG laptop) via Ollama.
 * Because that host is only reachable on the LAN, the LLM is treated as an
 * *enhancement layer*: when it is reachable we use it, and when it is not
 * (offline, off-network, timed out) we silently fall back to the
 * deterministic templates in `goalGeneration.ts`. The app never blocks on
 * or breaks because of the LLM.
 *
 * To point at a different host (e.g. a tunnel, a cloud box, or a teammate's
 * machine), override LLM_BASE_URL via an Expo public env var:
 *   EXPO_PUBLIC_LLM_BASE_URL=http://10.145.163.105:11434
 *
 * See: Notion spec "Goal Setting & Quest Board Pipeline (5/27 follow-up)".
 */

const DEFAULT_BASE_URL = "http://10.145.163.105:11434";

const DEFAULT_MODEL = "qwen2.5:14b-instruct-q4_K_M";

function readEnv(key: string): string | undefined {
  // process.env is statically inlined by Expo for EXPO_PUBLIC_* vars.
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

export const LLM_CONFIG = {
  /** Whether to attempt LLM generation at all. Templates are always the fallback. */
  enabled: readEnv("EXPO_PUBLIC_LLM_ENABLED") !== "false",

  /** Base URL of the Ollama server. */
  baseUrl: readEnv("EXPO_PUBLIC_LLM_BASE_URL") || DEFAULT_BASE_URL,

  /** Model tag as shown by `ollama list`. */
  model: readEnv("EXPO_PUBLIC_LLM_MODEL") || DEFAULT_MODEL,

  /**
   * Hard timeout for a generation request, in ms. qwen2.5:14b on the ROG
   * takes ~10-12s for three milestones once loaded, so we allow generous
   * headroom but still bound it so the UI's "Generating…" state can't hang.
   */
  timeoutMs: Number(readEnv("EXPO_PUBLIC_LLM_TIMEOUT_MS") || "20000"),

  /**
   * Short timeout for the health probe used to decide whether to even try
   * the LLM. Keeps the path responsive when off-network.
   */
  probeTimeoutMs: 2500,
} as const;

export function llmChatUrl(): string {
  return `${LLM_CONFIG.baseUrl.replace(/\/$/, "")}/api/chat`;
}

export function llmVersionUrl(): string {
  return `${LLM_CONFIG.baseUrl.replace(/\/$/, "")}/api/version`;
}
