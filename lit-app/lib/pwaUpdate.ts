import Constants from "expo-constants";
import { Platform } from "react-native";

type VersionPayload = {
  version: string;
  builtAt: string;
};

let activeBuiltAt: string | null = null;
let pendingReload = false;
let started = false;

/** Guards the one-time startup reload below so a flaky version.json fetch can never loop it. */
const STARTUP_RELOAD_GUARD_KEY = "mylit_pwa_startup_reload_done";

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

/**
 * Catches a client that is ALREADY stale the moment it starts — e.g. a browser/PWA HTTP cache
 * or an old service worker served yesterday's index.html+JS even though version.json (fetched
 * with cache: "no-store") reports today's build. Poll-to-poll drift comparison alone can never
 * see this, since it only compares consecutive checks to each other, not to what's actually
 * running. Safe to reload immediately here (unlike the drift case) — cold start is definitionally
 * a fresh, foregrounded launch with no in-progress interaction to interrupt. Guarded by
 * sessionStorage so a flaky/inconsistent version.json response can never cause a reload loop;
 * if sessionStorage is unavailable we skip the forced reload rather than risk looping.
 */
function reloadOnceIfStartupStale(serverVersion: string): void {
  const runningVersion = Constants.expoConfig?.version;
  if (!runningVersion || runningVersion === serverVersion) return;
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(STARTUP_RELOAD_GUARD_KEY) === "1") return;
    window.sessionStorage.setItem(STARTUP_RELOAD_GUARD_KEY, "1");
  } catch {
    return;
  }
  window.location.reload();
}

export async function checkForPwaUpdate(): Promise<void> {
  if (Platform.OS !== "web") return;

  const payload = await fetchBuildVersion();
  if (!payload?.builtAt) return;

  if (activeBuiltAt && payload.builtAt !== activeBuiltAt) {
    // Flag only — never reload here. This runs on the 5-min timer and on
    // visibilitychange/focus, which fire while the tab/PWA can still be
    // foreground. The actual reload is applied only from onVisible below, right
    // as a NEW session starts, never while backgrounded (see onVisible).
    pendingReload = true;
    return;
  }

  if (!activeBuiltAt && payload.version) {
    reloadOnceIfStartupStale(payload.version);
  }

  activeBuiltAt = payload.builtAt;
}

export function startPwaUpdateChecks(): void {
  if (Platform.OS !== "web" || typeof window === "undefined" || started) return;
  started = true;

  void checkForPwaUpdate();

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    // Apply any update flagged while the app was away BEFORE re-checking — a
    // reload fired while an iOS Home Screen PWA is backgrounded (no browser
    // chrome to recover from a stalled/suspended navigation) can leave the
    // WKWebView on a blank/black frame when the user returns. Reloading right
    // as the app becomes visible again — the start of a fresh session, before
    // any new interaction — is the safe point: never mid-use, never while the
    // OS can suspend the reload in the background.
    if (pendingReload) {
      applyPendingReload();
      return;
    }
    void checkForPwaUpdate();
  };

  document.addEventListener("visibilitychange", onVisible);
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
      // Flag only — see onVisible in startPwaUpdateChecks for why the reload itself
      // never fires while backgrounded.
      pendingReload = true;
    });
  } catch {
    // Service worker registration is optional; version.json polling still works.
  }
}
