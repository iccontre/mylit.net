import { Platform, useWindowDimensions, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const MAX_FRAME_WIDTH = 520;
export const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
export const BOTTOM_NAV_HEIGHT = 62;
export const BOTTOM_NAV_CLEARANCE = 82;
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
  bottomNavOffset: number;
};

export function useMobileFrame(): MobileFrame {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fullscreen = isMobileFullscreen(width);
  const bottomNavOffset = 8 + insets.bottom;
  const scrollPaddingBottom = BOTTOM_NAV_CLEARANCE + insets.bottom;

  if (fullscreen) {
    return {
      frameWidth: width,
      frameHeight: height,
      isFullscreen: true,
      pageRootStyle: {
        flex: 1,
        width: "100%",
        backgroundColor: "#02040A",
      },
      phoneStageStyle: {
        flex: 1,
        width: "100%",
        height: "100%",
        alignSelf: "stretch",
      },
      scrollPaddingBottom,
      bottomNavOffset,
    };
  }

  const safeWidth = Math.max(0, width - 24);
  const safeHeight = Math.max(0, height - 24);
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
    bottomNavOffset,
  };
}
