import { type ReactNode, useEffect, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useKeyboardInset } from "../hooks/useKeyboardInset";

type FormScreenProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Base bottom padding (nav clearance). Keyboard inset is added automatically. */
  scrollPaddingBottom?: number;
};

function resolvePaddingBottom(style: StyleProp<ViewStyle>, fallback: number): number {
  const flat = StyleSheet.flatten(style);
  if (typeof flat?.paddingBottom === "number") {
    return flat.paddingBottom;
  }
  return fallback;
}

export function FormScreen({
  children,
  contentContainerStyle,
  style,
  scrollPaddingBottom = 24,
}: FormScreenProps) {
  const keyboardInset = useKeyboardInset();
  const scrollRef = useRef<ScrollView>(null);
  const basePadding = resolvePaddingBottom(contentContainerStyle, scrollPaddingBottom);
  const bottomPadding = basePadding + keyboardInset;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const scrollFocusedField = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return;
      if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 120);
    };

    const onFocusIn = (event: FocusEvent) => scrollFocusedField(event.target);
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const contentStyle = [
    styles.content,
    contentContainerStyle,
    { paddingBottom: bottomPadding },
  ];

  const scrollProps = {
    ref: scrollRef,
    keyboardShouldPersistTaps: "handled" as const,
    keyboardDismissMode: Platform.OS === "ios" ? ("interactive" as const) : ("on-drag" as const),
    showsVerticalScrollIndicator: false,
    nestedScrollEnabled: true,
  };

  const containerStyle = [styles.flex, styles.fullWidth, style];

  if (Platform.OS === "web") {
    return (
      <ScrollView
        {...scrollProps}
        style={containerStyle}
        contentContainerStyle={contentStyle}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={containerStyle}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <ScrollView {...scrollProps} style={styles.flex} contentContainerStyle={contentStyle}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  fullWidth: { width: "100%", alignSelf: "stretch" },
  content: { flexGrow: 1, width: "100%", alignSelf: "stretch" },
});
