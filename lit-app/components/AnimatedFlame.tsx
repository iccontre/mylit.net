import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Image, View, type ImageSourcePropType, type ImageStyle } from "react-native";

/**
 * Sprite-sheet frame cycling for the Home flame — not GIF/video. The full grid sheet renders
 * once behind a fixed-size clipped window; a setInterval-driven frame index shifts it via
 * translateX/translateY so only one cell shows at a time, stepping left-to-right then
 * top-to-bottom through the grid.
 */
export function AnimatedFlame({
  source,
  fallbackSource,
  frameCount,
  columns,
  rows,
  sheetWidth,
  sheetHeight,
  fps = 9,
  size,
  reducedMotion,
  glowStyle,
}: {
  /** The animated spritesheet. If omitted or it fails to load, fallbackSource renders statically. */
  source?: ImageSourcePropType;
  fallbackSource: ImageSourcePropType;
  frameCount: number;
  columns: number;
  rows: number;
  sheetWidth: number;
  sheetHeight: number;
  fps?: number;
  size: number;
  /** Explicit override — if omitted, the component checks AccessibilityInfo itself. */
  reducedMotion?: boolean;
  glowStyle?: ImageStyle;
}) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => { if (mounted) setSystemReducedMotion(Boolean(enabled)); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (enabled: boolean) =>
      setSystemReducedMotion(Boolean(enabled))
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  const effectiveReducedMotion = reducedMotion ?? systemReducedMotion;
  const shouldAnimate = Boolean(source) && !failed && !effectiveReducedMotion;

  useEffect(() => {
    if (!shouldAnimate) return;
    const intervalMs = Math.max(1, Math.round(1000 / fps));
    const id = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % frameCount;
      setFrame(frameRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [shouldAnimate, fps, frameCount]);

  const frameWidth = sheetWidth / columns;
  const frameHeight = sheetHeight / rows;

  if (!shouldAnimate || frameWidth <= 0 || frameHeight <= 0) {
    return <Image source={fallbackSource} style={[{ width: size, height: size }, glowStyle]} resizeMode="contain" />;
  }

  const scale = size / frameHeight;
  const scaledFrameWidth = frameWidth * scale;
  const scaledSheetWidth = sheetWidth * scale;
  const scaledSheetHeight = sheetHeight * scale;
  const col = frame % columns;
  const row = Math.floor(frame / columns) % rows;

  return (
    <View style={[{ width: scaledFrameWidth, height: size, overflow: "hidden" }, glowStyle]}>
      <Image
        source={source}
        onError={() => setFailed(true)}
        style={{
          width: scaledSheetWidth,
          height: scaledSheetHeight,
          transform: [{ translateX: -col * scaledFrameWidth }, { translateY: -row * size }],
        }}
        resizeMode="stretch"
      />
    </View>
  );
}
