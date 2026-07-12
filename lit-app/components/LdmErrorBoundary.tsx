import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

const pixelFont = "monospace";

/**
 * Safety net around the LDM (Lucid Dreaming Mode) render branch on Home. LDM swaps a lot of
 * Home's content at once (background, title, countdown, board) right after "Enter LDM" is
 * pressed — if anything in that branch throws, this shows Luna's fallback message instead of
 * leaving the screen blank/black. It does not swallow or hide the error: render errors still
 * throw to the console/crash reporter via componentDidCatch, this only prevents a blank screen.
 */
export class LdmErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("LDM render error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Luna is preparing your pre-sleep routine...</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center", paddingVertical: 24, paddingHorizontal: 16 },
  fallbackText: { color: "#E9D5FF", fontFamily: pixelFont, fontSize: 13, fontWeight: "700", textAlign: "center" },
});
