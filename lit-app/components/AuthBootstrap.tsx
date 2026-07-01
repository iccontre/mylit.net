import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { getSession } from "../lib/auth";
import { resolveRequiredRouteForPath } from "../lib/authFlow";
import { mergeCloudIntoLocalSafely } from "../lib/progressStore";
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
  const hasSyncedProgressRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function syncProgressIfNeeded() {
      if (!isSupabaseConfigured() || hasSyncedProgressRef.current) return;
      const session = await getSession();
      if (!session || cancelled) return;
      hasSyncedProgressRef.current = true;
      await mergeCloudIntoLocalSafely();
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
