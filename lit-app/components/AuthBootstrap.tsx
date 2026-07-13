import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { getSession } from "../lib/auth";
import { bootstrapSignedInSession, resolveRequiredRouteForPath } from "../lib/authFlow";
import { isSupabaseConfigured } from "../lib/supabase";

type AuthBootstrapProps = {
  children: ReactNode;
};

export function AuthBootstrap({ children }: AuthBootstrapProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const redirectingRef = useRef(false);
  const hasBootstrappedRef = useRef(false);
  // Tracks WHICH user's cloud data was last hydrated, not just "has synced once ever" — a
  // plain boolean guard meant sign-out + a different (or the same) account signing back in
  // within the same long-lived app session never re-triggered the cloud merge, so the new
  // session just kept reading whatever local snapshot was left over. Resetting to null when
  // there's no session ensures the NEXT sign-in — same device, same or different account —
  // always re-hydrates from that account's cloud data.
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncProgressIfNeeded() {
      if (!isSupabaseConfigured()) return;
      const session = await getSession();
      if (!session || cancelled) {
        syncedUserIdRef.current = null;
        return;
      }
      if (syncedUserIdRef.current === session.user.id) return;
      syncedUserIdRef.current = session.user.id;
      await bootstrapSignedInSession();
    }

    async function enforceRoute() {
      if (redirectingRef.current) return;

      await syncProgressIfNeeded();

      const redirectTo = await resolveRequiredRouteForPath(pathname || "/");
      if (cancelled) return;

      if (redirectTo && redirectTo !== pathname) {
        redirectingRef.current = true;
        router.replace(redirectTo);
        redirectingRef.current = false;
      }

      hasBootstrappedRef.current = true;
      setReady(true);
    }

    if (!hasBootstrappedRef.current) {
      setReady(false);
    }

    void enforceRoute();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <View style={styles.bootScreen}>
        <ActivityIndicator color="#9BE331" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    backgroundColor: "#0E0703",
    alignItems: "center",
    justifyContent: "center",
  },
});
