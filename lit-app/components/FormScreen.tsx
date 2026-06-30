import { type ReactNode, useRef } from "react";
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

export function FormScreen({
  children,
  contentContainerStyle,
  style,
  scrollPaddingBottom = 24,
}: FormScreenProps) {
  const keyboardInset = useKeyboardInset();
  const scrollRef = useRef<ScrollView>(null);
  const bottomPadding = scrollPaddingBottom + keyboardInset;

  const contentStyle = [
    styles.content,
    { paddingBottom: bottomPadding },
    contentContainerStyle,
  ];

  if (Platform.OS === "web") {
    return (
      <ScrollView
        ref={scrollRef}
        style={[styles.flex, style]}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
});
