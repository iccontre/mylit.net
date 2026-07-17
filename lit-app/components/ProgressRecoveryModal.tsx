import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  backupLocalProgressNow,
  getLocalProgressSummary,
  recoverLocalProgressToCloud,
  type ProgressSummary,
} from "../lib/progressStore";
import { getSession } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

type ProgressRecoveryModalProps = {
  visible: boolean;
  onClose: () => void;
  onRecovered?: () => void;
};

export function ProgressRecoveryModal({ visible, onClose, onRecovered }: ProgressRecoveryModalProps) {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void (async () => {
      setMessage("");
      setSummary(await getLocalProgressSummary());
      setSignedIn(Boolean(await getSession()));
    })();
  }, [visible]);

  async function handleBackup() {
    setLoading(true);
    setMessage("");
    try {
      await backupLocalProgressNow();
      setSummary(await getLocalProgressSummary());
      setMessage("Local progress backed up on this device.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMerge() {
    if (!isSupabaseConfigured()) {
      setMessage("Cloud sync is not configured in this build.");
      return;
    }
    if (!signedIn) {
      setMessage("Sign in first to save progress to your account.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const result = await recoverLocalProgressToCloud();
      setMessage(result.message);
      if (result.ok) {
        setSummary(await getLocalProgressSummary());
        onRecovered?.();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>RECOVER LOCAL PROGRESS</Text>
          <Text style={styles.lead}>
            If your progress disappeared after signing in, use this before clearing Safari data or
            deleting the app. MYLIT will back up this device and merge any saved progress into your
            account.
          </Text>

          <ScrollView style={styles.summaryScroll} showsVerticalScrollIndicator={false}>
            {summary ? (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLine}>Keys found: {summary.keysFound}</Text>
                <Text style={styles.summaryLine}>Total steps (stored): {summary.totalSteps}</Text>
                <Text style={styles.summaryLine}>Completed quests: {summary.completedQuestCount}</Text>
                <Text style={styles.summaryLine}>Missed quests: {summary.missedQuestCount}</Text>
                <Text style={styles.summaryLine}>Check-in history: {summary.checkInHistoryCount}</Text>
                <Text style={styles.summaryLine}>
                  Latest check-in: {summary.latestCheckInDate ?? "none"}
                </Text>
                <Text style={styles.summaryLine}>Journal entries: {summary.journalCount}</Text>
                <Text style={styles.summaryLine}>Dream entries: {summary.dreamCount}</Text>
                <Text style={styles.summaryLine}>Reflections: {summary.reflectionCount}</Text>
                <Text style={styles.summaryLine}>Meditations: {summary.meditationCount}</Text>
                <Text style={styles.summaryLine}>
                  Last backup: {summary.lastBackupAt ? new Date(summary.lastBackupAt).toLocaleString() : "none"}
                </Text>
              </View>
            ) : (
              <ActivityIndicator color="#FBBF24" />
            )}
          </ScrollView>

          {!signedIn ? (
            <Text style={styles.warning}>Sign in to merge this device&apos;s progress into your account.</Text>
          ) : null}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleBackup()} disabled={loading}>
            <Text style={styles.secondaryButtonText}>BACK UP LOCAL PROGRESS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryButton} onPress={() => void handleMerge()} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <Text style={styles.primaryButtonText}>MERGE INTO MY ACCOUNT</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelButtonText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "88%",
    backgroundColor: "rgba(8,17,34,0.99)",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 10,
    padding: 14,
  },
  title: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: "center",
  },
  lead: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  summaryScroll: {
    maxHeight: 220,
    marginBottom: 10,
  },
  summaryCard: {
    backgroundColor: "rgba(46,32,20,0.96)",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 6,
    padding: 10,
    gap: 4,
  },
  summaryLine: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  warning: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: "#FBBF24",
    borderWidth: 2,
    borderColor: "#92400E",
    borderRadius: 6,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  primaryButtonText: {
    color: "#111827",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: "rgba(46,32,20,0.96)",
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 6,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: "#E9D5FF",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  cancelButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
  },
});
