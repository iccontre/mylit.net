import { Platform } from "react-native";

type VersionPayload = {
  version: string;
  builtAt: string;
};

let activeBuiltAt: string | null = null;
let pendingReload = false;
let started = false;

async function fetchBuildVersion(): Promise<VersionPayload | null> {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;

  try {
    const response = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as VersionPayload;
  } catch {
    return null;
  }
}

function applyPendingReload() {
  if (!pendingReload || typeof window === "undefined") return;
  pendingReload = false;
  window.location.reload();
}

export async function checkForPwaUpdate(): Promise<void> {
  if (Platform.OS !== "web") return;

  const payload = await fetchBuildVersion();
  if (!payload?.builtAt) return;

  if (activeBuiltAt && payload.builtAt !== activeBuiltAt) {
    pendingReload = true;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      applyPendingReload();
    }
    return;
  }

  activeBuiltAt = payload.builtAt;
}

export function startPwaUpdateChecks(): void {
  if (Platform.OS !== "web" || typeof window === "undefined" || started) return;
  started = true;

  void checkForPwaUpdate();

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void checkForPwaUpdate().then(() => {
      if (pendingReload) applyPendingReload();
    });
  };

  const onHidden = () => {
    if (document.visibilityState === "hidden" && pendingReload) {
      applyPendingReload();
    }
  };

  document.addEventListener("visibilitychange", () => {
    onVisible();
    onHidden();
  });

  window.addEventListener("focus", onVisible);
  window.setInterval(() => {
    void checkForPwaUpdate();
  }, 5 * 60 * 1000);
}

export async function registerPwaServiceWorker(): Promise<void> {
  if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          installing.postMessage({ type: "SKIP_WAITING" });
          pendingReload = true;
        }
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (document.visibilityState === "hidden") {
        applyPendingReload();
      } else {
        pendingReload = true;
      }
    });
  } catch {
    // Service worker registration is optional; version.json polling still works.
  }
}
