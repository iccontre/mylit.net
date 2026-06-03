/**
 * LLM (Ollama) configuration for goal milestone generation.
 *
 * The model runs on a ROG/Windows machine via Ollama, reachable over
 * **Tailscale** at a stable tailnet IP (`100.116.162.41`) — the shared dev
 * environment across projects (same host the EAO project points at). Unlike a
 * raw LAN IP, this works from anywhere both machines are on the tailnet.
 *
 * NOTE: This is NOT used on the user runtime path — goal generation runs fully
 * offline against `constants/goalDatabase.ts`. This config is for the
 * build-time data factory (`scripts/generateGoalDatabase.mjs`) and any future
 * optional online "enhance" mode.
 *
 * To point at a different host, override via an Expo public env var:
 *   EXPO_PUBLIC_LLM_BASE_URL=http://100.116.162.41:11434
 *
 * See: Notion spec "Goal Setting & Quest Board Pipeline (5/27 follow-up)".
 */

const DEFAULT_BASE_URL = "http://100.116.162.41:11434";

const DEFAULT_MODEL = "qwen2.5:14b-instruct-q4_K_M";

function clean(value: string | undefined): string | undefined {
  // EXPO_PUBLIC_* vars must be accessed statically so Expo can inline them.
  return value && value.trim() ? value.trim() : undefined;
}

export const LLM_CONFIG = {
  /** Whether to attempt LLM generation at all. Templates are always the fallback. */
  enabled: clean(process.env.EXPO_PUBLIC_LLM_ENABLED) !== "false",

  /** Base URL of the Ollama server. */
  baseUrl: clean(process.env.EXPO_PUBLIC_LLM_BASE_URL) || DEFAULT_BASE_URL,

  /** Model tag as shown by `ollama list`. */
  model: clean(process.env.EXPO_PUBLIC_LLM_MODEL) || DEFAULT_MODEL,

  /**
   * Hard timeout for a generation request, in ms. qwen2.5:14b on the ROG
   * takes ~10-12s for three milestones once loaded, so we allow generous
   * headroom but still bound it so the UI's "Generating…" state can't hang.
   */
  timeoutMs: Number(clean(process.env.EXPO_PUBLIC_LLM_TIMEOUT_MS) || "20000"),

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
