import { Platform, useWindowDimensions, type ViewStyle } from "react-native";
import { useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const MAX_FRAME_WIDTH = 520;
export const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
export const BOTTOM_NAV_HEIGHT = 62;
export const BOTTOM_NAV_CLEARANCE = 82;
/** Extra scroll room so form fields stay above keyboard + bottom nav on mobile. */
export const FORM_KEYBOARD_CLEARANCE = 48;
export const MOBILE_FULLSCREEN_BREAKPOINT = 768;

export function isMobileFullscreen(width: number): boolean {
  if (Platform.OS !== "web") return true;
  return width < MOBILE_FULLSCREEN_BREAKPOINT;
}

export type MobileFrame = {
  frameWidth: number;
  frameHeight: number;
  isFullscreen: boolean;
  pageRootStyle: ViewStyle;
  phoneStageStyle: ViewStyle;
  scrollPaddingBottom: number;
  formScrollPaddingBottom: number;
  bottomNavOffset: number;
};

export function useMobileFrame(): MobileFrame {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stableViewport = useRef({ width, height });

  // Width changes = rotation or real layout change. Height-only shrink = virtual keyboard.
  if (Math.abs(stableViewport.current.width - width) > 1) {
    stableViewport.current = { width, height };
  } else if (height > stableViewport.current.height) {
    stableViewport.current.height = height;
  }

  const layoutWidth = stableViewport.current.width;
  const layoutHeight = stableViewport.current.height;
  const fullscreen = isMobileFullscreen(layoutWidth);
  const bottomNavOffset = 8 + insets.bottom;
  const scrollPaddingBottom = BOTTOM_NAV_CLEARANCE + insets.bottom;
  const formScrollPaddingBottom = scrollPaddingBottom + FORM_KEYBOARD_CLEARANCE;

  if (fullscreen) {
    return {
      frameWidth: layoutWidth,
      frameHeight: layoutHeight,
      isFullscreen: true,
      pageRootStyle: {
        flex: 1,
        width: "100%",
        backgroundColor: "#02040A",
        paddingTop: insets.top,
      },
      phoneStageStyle: {
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
      },
      scrollPaddingBottom,
      formScrollPaddingBottom,
      bottomNavOffset,
    };
  }

  const safeWidth = Math.max(0, layoutWidth - 24);
  const safeHeight = Math.max(0, layoutHeight - 24);
  const frameWidth = Math.min(MAX_FRAME_WIDTH, safeWidth, safeHeight * APP_FRAME_ASPECT_RATIO);
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  return {
    frameWidth,
    frameHeight,
    isFullscreen: false,
    pageRootStyle: {
      flex: 1,
      backgroundColor: "#02040A",
      alignItems: "center",
      justifyContent: "center",
    },
    phoneStageStyle: {
      width: frameWidth,
      height: frameHeight,
      alignSelf: "center",
    },
    scrollPaddingBottom,
    formScrollPaddingBottom,
    bottomNavOffset,
  };
}
