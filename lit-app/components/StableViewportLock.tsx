import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Locks CSS layout viewport size on web/PWA so the virtual keyboard cannot
 * shrink the app shell. Updates on orientation change and real window resize only.
 */
export function StableViewportLock() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    const applySize = (w: number, h: number) => {
      root.style.setProperty("--mylit-layout-width", `${w}px`);
      root.style.setProperty("--mylit-layout-height", `${h}px`);
    };

    let lockedWidth = window.innerWidth;
    let lockedHeight = window.innerHeight;
    applySize(lockedWidth, lockedHeight);

    const onOrientationChange = () => {
      window.setTimeout(() => {
        lockedWidth = window.innerWidth;
        lockedHeight = window.innerHeight;
        applySize(lockedWidth, lockedHeight);
      }, 100);
    };

    const onResize = () => {
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      const heightDropped = nextHeight < lockedHeight * 0.85;
      const widthGrew = nextWidth > lockedWidth + 8;

      if (heightDropped && !widthGrew) {
        return;
      }

      lockedWidth = nextWidth;
      lockedHeight = Math.max(lockedHeight, nextHeight);
      applySize(lockedWidth, lockedHeight);
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
