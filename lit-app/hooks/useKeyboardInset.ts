import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * Returns extra bottom inset when the virtual keyboard is open (web/PWA).
 * With interactive-widget=overlays-content this is often 0, but some iOS
 * builds still resize the visual viewport — padding keeps inputs scrollable.
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

    const update = () => {
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
