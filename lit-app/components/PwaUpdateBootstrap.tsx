import { useEffect, type ReactNode } from "react";
import { Platform } from "react-native";

import { registerPwaServiceWorker, startPwaUpdateChecks } from "../lib/pwaUpdate";

type PwaUpdateBootstrapProps = {
  children: ReactNode;
};

export function PwaUpdateBootstrap({ children }: PwaUpdateBootstrapProps) {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    void registerPwaServiceWorker();
    startPwaUpdateChecks();
  }, []);

  return <>{children}</>;
}
