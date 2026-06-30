import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { resolveRequiredRouteForPath } from "../lib/authFlow";

type AuthBootstrapProps = {
  children: ReactNode;
};

export function AuthBootstrap({ children }: AuthBootstrapProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const redirectingRef = useRef(false);
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function enforceRoute() {
      if (redirectingRef.current) return;

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
