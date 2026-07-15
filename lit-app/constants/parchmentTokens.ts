/**
 * MYLIT parchment content-surface design system — the shared visual language for text/content
 * containers (as opposed to the navy app chrome, full-bleed pixel backgrounds, and navigation,
 * which stay as-is). These are the SAME hex values already established by Calendar's red-strip
 * parchment cards; every other screen should converge on these exact tokens rather than
 * inventing near-duplicates. Presentation only — nothing here affects reward/gate/sync logic.
 */

export const parchmentBody = "#EAD9B6";
export const parchmentField = "#F4E8CE";
export const parchmentBorder = "#5C4425";
export const parchmentInk = "#4A3620";
/** Muted ink for secondary/meta text on parchment — still readable, visually quieter than parchmentInk. */
export const parchmentInkMuted = "#7C5B2B";
/** Placeholder text color on parchmentField — readable but clearly secondary. */
export const parchmentPlaceholder = "#8A5D2B";

export const accentColors = {
  stripRed: "#B3261E",
  gold: "#FBBF24",
  purple: "#A78BFA",
  green: "#22C55E",
  pink: "#F472B6",
  slate: "#334155",
} as const;

export type ParchmentAccent = "progress" | "recovery" | "path" | "mind" | "neutral" | "calendar";

export const accentByParchmentAccent: Record<ParchmentAccent, string> = {
  progress: accentColors.gold,
  recovery: accentColors.purple,
  path: accentColors.green,
  mind: accentColors.pink,
  neutral: accentColors.slate,
  calendar: accentColors.stripRed,
};

export const parchmentGeometry = {
  surfaceBorderWidth: 3,
  fieldBorderWidth: 2,
  surfaceRadius: 8,
  fieldRadius: 7,
  actionRadius: 5,
  hardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
} as const;

/** Purple filled-action pairing already established for Recovery/mandatory Luna cards and the
 *  Dream Journal button — the canonical "filled primary action" treatment. */
export const filledPurple = {
  fill: "#7C3AED",
  border: "#4C1D95",
  text: "#FFFFFF",
} as const;

export const filledGreen = {
  fill: "#16A34A",
  border: "#14532D",
  text: "#FFFFFF",
} as const;
