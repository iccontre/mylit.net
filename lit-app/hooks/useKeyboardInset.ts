import { useEffect, useState } from "react";
import { Platform } from "react-native";

function readLayoutHeight(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(window.screen?.height ?? 0, window.innerHeight ?? 0);
}

/**
 * Returns extra bottom inset when the virtual keyboard resizes the layout.
 * With interactive-widget=overlays-content the keyboard usually overlays —
 * we avoid padding that squashes the whole screen toward the top.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const layoutHeight = readLayoutHeight();

    const update = () => {
      const currentLayoutHeight = readLayoutHeight();
      const layoutResized = currentLayoutHeight < layoutHeight * 0.92;
      const viewportShrunk = viewport.height < currentLayoutHeight * 0.75;

      if (viewportShrunk && !layoutResized) {
        setInset(0);
        return;
      }

      const keyboardHeight = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setInset(keyboardHeight > 48 ? keyboardHeight : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return inset;
}
