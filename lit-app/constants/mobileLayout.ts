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

function isLikelyKeyboardViewportSqueeze(
  nextWidth: number,
  nextHeight: number,
  stableWidth: number,
  stableHeight: number
): boolean {
  if (stableWidth <= 0 || stableHeight <= 0) return false;
  const heightDropped = nextHeight < stableHeight * 0.85;
  const widthGrew = nextWidth > stableWidth + 8;
  return heightDropped && !widthGrew;
}

export function useMobileFrame(): MobileFrame {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stableSize = useRef({ width: 0, height: 0 });

  if (width > 0 && height > 0) {
    if (stableSize.current.width === 0) {
      stableSize.current = { width, height };
    } else if (
      !isLikelyKeyboardViewportSqueeze(width, height, stableSize.current.width, stableSize.current.height)
    ) {
      const mobileLocked = isMobileFullscreen(stableSize.current.width);
      if (mobileLocked) {
        stableSize.current.width = Math.max(stableSize.current.width, width);
        stableSize.current.height = Math.max(stableSize.current.height, height);
      } else {
        stableSize.current = { width, height };
      }
    }
  }

  const layoutWidth = stableSize.current.width || width;
  const layoutHeight = stableSize.current.height || height;
  const fullscreen = isMobileFullscreen(layoutWidth);
  const bottomNavOffset = 8 + insets.bottom;
  const scrollPaddingBottom = BOTTOM_NAV_CLEARANCE + insets.bottom;
  const formScrollPaddingBottom = scrollPaddingBottom + FORM_KEYBOARD_CLEARANCE;

  if (fullscreen) {
    const pageRootStyle: ViewStyle =
      Platform.OS === "web"
        ? {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "#02040A",
            paddingTop: insets.top,
          }
        : {
            flex: 1,
            width: "100%",
            backgroundColor: "#02040A",
            paddingTop: insets.top,
          };

    return {
      frameWidth: layoutWidth,
      frameHeight: layoutHeight,
      isFullscreen: true,
      pageRootStyle,
      phoneStageStyle: {
        flex: 1,
        width: "100%",
        height: "100%",
        alignSelf: "stretch",
        minHeight: 0,
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
