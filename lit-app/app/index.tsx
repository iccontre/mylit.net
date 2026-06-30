import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { resolveInitialRoute } from "../lib/authFlow";

export default function IndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function go() {
      const route = await resolveInitialRoute();
      if (!cancelled) {
        router.replace(route);
      }
    }

    void go();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.bootScreen}>
      <ActivityIndicator color="#9BE331" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    backgroundColor: "#0E0703",
    alignItems: "center",
    justifyContent: "center",
  },
});
