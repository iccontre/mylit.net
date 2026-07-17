/**
 * MYLIT World System — the one typed token source for hub chrome, wood surfaces, and Save
 * states. Values are extracted verbatim from the authoritative rendered design export
 * (concepts/world-system/MYLIT World System.html, "COLOR & SURFACE TOKENS" reference frame) —
 * do not hand-tune these hexes per screen; add a new hub/state here instead of inlining a
 * literal color in a screen file. Parchment-specific tokens (body/field/border/ink) already
 * live in constants/parchmentTokens.ts and are re-exported here for convenience.
 */

export {
  parchmentBody,
  parchmentField,
  parchmentBorder,
  parchmentInk,
  parchmentInkMuted,
  parchmentPlaceholder,
  parchmentGeometry,
} from "./parchmentTokens";

/** Every hub/mode that gets its own chrome/edge/accent/text quartet on the token board. Home's
 *  Neutral mode has no separate board entry — it reuses Path's forest-green quartet verbatim,
 *  confirmed by the rendered Home-Neutral frame using the exact same green as the Path hub. */
export type HubKey = "sleep" | "mind" | "path" | "calendar" | "stats" | "progress" | "recovery" | "ldm" | "neutral";

export type HubPalette = {
  /** Banner/chrome fill — WorldChrome, card header strips. */
  chrome: string;
  /** Border/edge color for chrome surfaces and outlined buttons. */
  edge: string;
  /** Brightest accent — icons, active states, highlight text. */
  accent: string;
  /** Body text color for use directly on chrome/edge fills. */
  text: string;
};

export const hubPalettes: Record<HubKey, HubPalette> = {
  sleep: { chrome: "#392A63", edge: "#8B7BC7", accent: "#B9A6F5", text: "#EFEAFB" },
  mind: { chrome: "#241A4A", edge: "#7C3AED", accent: "#C084FC", text: "#ECE4FB" },
  path: { chrome: "#123021", edge: "#22C55E", accent: "#4ADE80", text: "#EAF7EA" },
  calendar: { chrome: "#3A1512", edge: "#B3261E", accent: "#F0A93B", text: "#FBEAE3" },
  stats: { chrome: "#2A2118", edge: "#8A6D3A", accent: "#FBBF24", text: "#F6EEDD" },
  progress: { chrome: "#3A2A0C", edge: "#B45309", accent: "#FBBF24", text: "#FBEFD3" },
  recovery: { chrome: "#2B1E4A", edge: "#7C3AED", accent: "#A78BFA", text: "#EDE7FB" },
  ldm: { chrome: "#1C1440", edge: "#6D28D9", accent: "#C4A7FF", text: "#E7DEFB" },
  /** = path (see doc comment above). */
  neutral: { chrome: "#123021", edge: "#22C55E", accent: "#4ADE80", text: "#EAF7EA" },
};

/** Home's four energy-mode boards, a subset of HubKey used for the live mode banner/board. */
export type HomeModeKey = "neutral" | "progress" | "recovery" | "ldm";

/** Shared surface tiers beyond parchment. */
export const woodSurface = "#3E2A1A";
/** Also the BottomNav / stage-void background. */
export const woodVoid = "#241811";
export const woodBorder = "#5C4425";

export const statsCream = "#F5EFE2";
export const statsInk = "#2B2620";

/** Calendar's red header-strip accent — same hex as calendar.edge, named separately since the
 *  token board lists it as its own "Cal strip red" swatch used on DayCard headers. */
export const calendarStripRed = "#B3261E";

/**
 * SaveButton states — sampled directly from the rendered "SAVE FEEDBACK SEQUENCE" reference
 * frame (pixel-sampled fill/border, not guessed). Idle and Saved are both green so the
 * distinction must never rely on color alone — see the "not color alone" / "+ ✓" annotations on
 * the reference frame, mirrored in the check/warning glyphs below.
 */
export const saveStates = {
  idle: { fill: "#1B6A39", border: "#FBBF24", text: "#FFFFFF" },
  saving: { fill: "#3E2A1A", border: "#8A6D3A", text: "#D8C9A3" },
  saved: { fill: "#15803D", border: "#4ADE80", text: "#FFFFFF" },
  error: { fill: "#7F1D1D", border: "#F87171", text: "#FFFFFF" },
} as const;
