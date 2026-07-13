import { useEffect, useState, type ReactNode } from "react";
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View, type AppStateStatus } from "react-native";

import {
  clearMylitRuntimeCaches,
  fetchLiveVersion,
  getRunningVersion,
  registerPwaServiceWorker,
  unregisterServiceWorkers,
} from "../lib/pwaUpdate";

type PwaUpdateBootstrapProps = {
  children: ReactNode;
};

type UpdateStatus = "idle" | "updating" | "stuck";

/** Persists across the forced-update reload (same tab/session) — caps automatic recovery at one attempt. */
const RELOAD_ATTEMPT_KEY = "mylit_pwa_update_attempts";
const MAX_AUTO_RELOAD_ATTEMPTS = 1;
const FOREGROUND_POLL_MS = 5 * 60 * 1000;

// Module-level (not component refs) on purpose: AuthBootstrap's own route-enforcement effect
// can cause several rapid router.replace calls right at startup, which can remount this
// component more than once within the same page load. Per-instance useRef guards reset on
// every remount, so multiple independent instances could each decide "I haven't recovered
// yet" and each fire their own reload — burning through the one-attempt budget before the
// first reload ever gets a chance to actually land. A module-level guard is shared across
// every mount within this same JS realm, so only the very first check to find a mismatch
// ever acts on it.
let checkInFlight = false;
let hasRecoveredThisPageLoad = false;

function readReloadAttempts(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_ATTEMPT_KEY) || "0");
  } catch {
    return 0;
  }
}

function writeReloadAttempts(count: number): void {
  try {
    window.sessionStorage.setItem(RELOAD_ATTEMPT_KEY, String(count));
  } catch {
    // sessionStorage unavailable — recovery still runs once, just unguarded against a loop.
  }
}

/**
 * Web/PWA forced-update gate. Compares the running bundle's build-time version against live
 * production version.json on startup, on foreground, and on a foreground poll. On a mismatch,
 * shows a visible "Updating MYLIT…" state (never a silent reload that could look like a black
 * screen if it stalls), unregisters this origin's service workers, deletes only MYLIT's own
 * runtime caches (never localStorage/AsyncStorage — account data and auth survive), then
 * reloads once with the live version as a query param. A sessionStorage-backed attempt counter
 * caps automatic recovery at one try; if the mismatch persists after that, this shows a
 * "Refresh MYLIT" button instead of retrying forever.
 */
export function PwaUpdateBootstrap({ children }: PwaUpdateBootstrapProps) {
  const [status, setStatus] = useState<UpdateStatus>(hasRecoveredThisPageLoad ? "updating" : "idle");

  async function runControlledUpdate(liveVersion: string) {
    if (hasRecoveredThisPageLoad) return;
    hasRecoveredThisPageLoad = true;
    setStatus("updating");

    const attempts = readReloadAttempts();
    if (attempts >= MAX_AUTO_RELOAD_ATTEMPTS) {
      setStatus("stuck");
      return;
    }
    writeReloadAttempts(attempts + 1);

    try {
      await unregisterServiceWorkers();
      await clearMylitRuntimeCaches();
    } catch {
      // Cleanup is best-effort — still attempt the reload below regardless.
    }

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("v", liveVersion);
      window.location.href = url.toString();
    } catch {
      setStatus("stuck");
    }
  }

  async function checkVersion() {
    if (Platform.OS !== "web" || checkInFlight || hasRecoveredThisPageLoad) return;
    checkInFlight = true;
    try {
      const payload = await fetchLiveVersion();
      const running = getRunningVersion();
      if (payload?.version && running && payload.version !== running) {
        await runControlledUpdate(payload.version);
      }
    } finally {
      checkInFlight = false;
    }
  }

  function handleManualRefresh() {
    writeReloadAttempts(0);
    hasRecoveredThisPageLoad = false;
    window.location.reload();
  }

  useEffect(() => {
    if (Platform.OS !== "web") return;

    void registerPwaServiceWorker(() => void checkVersion());
    void checkVersion();

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") void checkVersion();
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    const pollId = setInterval(() => {
      if (AppState.currentState === "active") void checkVersion();
    }, FOREGROUND_POLL_MS);

    return () => {
      subscription.remove();
      clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "updating") {
    return (
      <View style={styles.overlay}>
        <Text style={styles.title}>Updating MYLIT…</Text>
      </View>
    );
  }

  if (status === "stuck") {
    return (
      <View style={styles.overlay}>
        <Text style={styles.title}>MYLIT needs to refresh.</Text>
        <TouchableOpacity style={styles.button} onPress={handleManualRefresh}>
          <Text style={styles.buttonText}>Refresh MYLIT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#0E0703",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    color: "#F8F1D7",
    fontFamily: "monospace",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  button: {
    borderWidth: 2,
    borderColor: "#9BE331",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(155,227,49,0.15)",
  },
  buttonText: {
    color: "#9BE331",
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
