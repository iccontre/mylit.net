import { useLayoutEffect } from "react";
import { Platform } from "react-native";

function applyLockedSize(w: number, h: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--mylit-layout-width", `${w}px`);
  root.style.setProperty("--mylit-layout-height", `${h}px`);
}

function readMaxLayoutSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }
  return {
    width: Math.max(window.screen?.width ?? 0, window.innerWidth ?? 0),
    height: Math.max(window.screen?.height ?? 0, window.innerHeight ?? 0),
  };
}

/**
 * Locks CSS layout viewport size on web/PWA so the virtual keyboard cannot
 * shrink the app shell. Updates on orientation change and real window resize only.
 */
export function StableViewportLock() {
  useLayoutEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    let locked = readMaxLayoutSize();
    applyLockedSize(locked.width, locked.height);

    const onOrientationChange = () => {
      window.setTimeout(() => {
        locked = readMaxLayoutSize();
        applyLockedSize(locked.width, locked.height);
      }, 100);
    };

    const onResize = () => {
      const next = readMaxLayoutSize();
      const liveWidth = window.innerWidth;
      const liveHeight = window.innerHeight;
      const heightDropped = liveHeight < locked.height * 0.92;
      const widthGrew = liveWidth > locked.width + 8;

      if (heightDropped && !widthGrew) {
        return;
      }

      locked = {
        width: Math.max(locked.width, next.width, liveWidth),
        height: Math.max(locked.height, next.height, liveHeight),
      };
      applyLockedSize(locked.width, locked.height);
    };

    window.addEventListener("orientationchange", onOrientationChange);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("orientationchange", onOrientationChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
