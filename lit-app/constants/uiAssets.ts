/** Shared heading text for every Log History entry point (page header, entry-point card, etc). */
export const LOG_HISTORY_HEADING = "📜 LOG HISTORY";

export const uiAssets = {
  backgrounds: {
    default: require("../assets/ui/backgrounds/default-background.png"),
    journal: require("../assets/ui/backgrounds/journal-background.png"),
    neutral: require("../assets/ui/backgrounds/neutral-background.png"),
    progress: require("../assets/ui/backgrounds/progress-background.png"),
    recovery: require("../assets/ui/backgrounds/recovery-background.png"),
  },
  guides: {
    luna: require("../assets/ui/guides/luna-guide.png"),
    evie: require("../assets/ui/guides/evie-guide.png"),
  },
  fires: {
    ember: require("../assets/ui/fires/ember-image.png"),
    lowFlame: require("../assets/ui/fires/low-flame.png"),
    steadyFlame: require("../assets/ui/fires/steady-flame.png"),
    brightFlame: require("../assets/ui/fires/bright-flame.png"),
    blazingFlame: require("../assets/ui/fires/blazing-flame.png"),
  },
  fireAnimations: {
    // 6x6 grid spritesheets (36 frames each), all sharing the same layout convention.
    emberSheet: require("../assets/ui/animations/flame/mylit-flame-ember-spritesheet.png"),
    lowSheet: require("../assets/ui/animations/flame/mylit-flame-low-spritesheet.png"),
    steadySheet: require("../assets/ui/animations/flame/mylit-flame-steady-spritesheet.png"),
    brightSheet: require("../assets/ui/animations/flame/mylit-flame-bright-spritesheet.png"),
    blazingSheet: require("../assets/ui/animations/flame/mylit-flame-blazing-spritesheet.png"),
  },
  logo: {
    mylit: require("../assets/ui/logo/mylit-logo.png"),
  },
  references: {
    neutralHome: require("../assets/ui/references/neutral-home-reference.png"),
    progressHome: require("../assets/ui/references/progress-home-reference.png"),
    recoveryHome: require("../assets/ui/references/recovery-home-reference.png"),
  },
};