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

/** True on native apps and phone/tablet browsers — never use the centered desktop phone frame. */
export function isTouchMobileWeb(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return coarse || /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
}

export function isMobileFullscreen(width: number): boolean {
  if (isTouchMobileWeb()) return true;
  if (Platform.OS !== "web") return true;
  return width < MOBILE_FULLSCREEN_BREAKPOINT;
}

function readInitialLayoutSize(): { width: number; height: number } {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const screenWidth = window.screen?.width ?? 0;
    const screenHeight = window.screen?.height ?? 0;
    const innerWidth = window.innerWidth ?? 0;
    const innerHeight = window.innerHeight ?? 0;
    return {
      width: Math.max(screenWidth, innerWidth),
      height: Math.max(screenHeight, innerHeight),
    };
  }
  return { width: 0, height: 0 };
}

export type MobileFrame = {
  frameWidth: number;
  frameHeight: number;
  isFullscreen: boolean;
  /** Always true on phone/tablet — use to apply full-width shell overrides. */
  touchMobile: boolean;
  pageRootStyle: ViewStyle;
  phoneStageStyle: ViewStyle;
  scrollPaddingBottom: number;
  formScrollPaddingBottom: number;
  bottomNavOffset: number;
  /** Preferred phone stage styles — always full-width on touch mobile. */
  stageShellStyle: ViewStyle;
};

function isLikelyKeyboardViewportSqueeze(
  nextWidth: number,
  nextHeight: number,
  stableWidth: number,
  stableHeight: number
): boolean {
  if (stableWidth <= 0 || stableHeight <= 0) return false;
  const heightDropped = nextHeight < stableHeight * 0.92;
  const widthShrunk = nextWidth < stableWidth * 0.97;
  const widthGrew = nextWidth > stableWidth + 8;
  if (heightDropped && !widthGrew) return true;
  if (heightDropped && widthShrunk) return true;
  return false;
}

export function useMobileFrame(): MobileFrame {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const touchMobile = isTouchMobileWeb();
  const stableSize = useRef(readInitialLayoutSize());

  if (width > 0 && height > 0) {
    if (stableSize.current.width === 0 || stableSize.current.height === 0) {
      stableSize.current = readInitialLayoutSize();
      if (stableSize.current.width === 0) {
        stableSize.current = { width, height };
      }
    }

    if (!isLikelyKeyboardViewportSqueeze(width, height, stableSize.current.width, stableSize.current.height)) {
      if (touchMobile || isMobileFullscreen(stableSize.current.width)) {
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
            maxWidth: "100%",
            height: "100%",
            alignItems: "stretch",
            justifyContent: "flex-start",
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
      touchMobile,
      pageRootStyle,
      phoneStageStyle: {
        flex: 1,
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        alignSelf: "stretch",
        minHeight: 0,
      },
      stageShellStyle: {
        flex: 1,
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        alignSelf: "stretch",
        minHeight: 0,
        aspectRatio: undefined,
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

  const desktopStage = {
    width: frameWidth,
    height: frameHeight,
    alignSelf: "center" as const,
  };

  return {
    frameWidth,
    frameHeight,
    isFullscreen: false,
    touchMobile,
    pageRootStyle: {
      flex: 1,
      backgroundColor: "#02040A",
      alignItems: "center",
      justifyContent: "center",
    },
    phoneStageStyle: desktopStage,
    stageShellStyle: desktopStage,
    scrollPaddingBottom,
    formScrollPaddingBottom,
    bottomNavOffset,
  };
}

/** Merge onto local phoneStage styles so the shell stays full-width on phones. */
export function mobileStageStyleOverrides(mobile: MobileFrame): ViewStyle {
  if (!mobile.touchMobile && !mobile.isFullscreen) {
    return {};
  }
  return {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    height: "100%",
    alignSelf: "stretch",
    aspectRatio: undefined,
  };
}
