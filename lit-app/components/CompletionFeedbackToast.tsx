import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from "react-native";

import { subscribeToCompletionFeedback, type QuestCompletionFeedback } from "../lib/completionFeedback";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const VISIBLE_MS = 700;

/**
 * Global "+N STEPS" confirmation — mounted once at the app root so it fires for every
 * completion path (Home's quest board AND Day Plan's checklist toggle), not just whichever
 * screen happens to render the guide/flame. Non-modal, never blocks input, always self-clears.
 */
export function CompletionFeedbackToast() {
  const [event, setEvent] = useState<QuestCompletionFeedback | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (mounted) setReducedMotion(Boolean(enabled));
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (enabled: boolean) =>
      setReducedMotion(Boolean(enabled))
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    return subscribeToCompletionFeedback((next) => {
      // Some events (e.g. logging food outside an active gate) intentionally carry 0 steps —
      // haptic + guide/flame reaction still fire, but the "+N STEPS" text has nothing to say.
      if (next.stepsAwarded <= 0) return;
      setEvent(next);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);

      if (reducedMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
      } else {
        opacity.setValue(0);
        translateY.setValue(8);
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start();
      }

      hideTimeout.current = setTimeout(() => {
        if (reducedMotion) {
          setEvent(null);
          return;
        }
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setEvent(null));
      }, VISIBLE_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  if (!event) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.pill, { opacity, transform: [{ translateY }] }]}>
        <Text style={styles.star}>✦</Text>
        <Text style={styles.text}>+{event.stepsAwarded} STEPS</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 64,
    zIndex: 999,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(8,13,24,0.96)",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  star: {
    color: "#FDE68A",
    fontSize: 14,
  },
  text: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
