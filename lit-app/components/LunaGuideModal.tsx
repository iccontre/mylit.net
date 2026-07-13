import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { GuideReminderModal } from "./GuideReminderModal";
import { LunaSupportPanel } from "./LunaSupportPanel";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

/** Shared Luna support modal — used by Path's Luna button and Home's Talk to Luna button. */
export function LunaGuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [showReminderModal, setShowReminderModal] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
          <Text style={styles.title}>LUNA</Text>
          <Text style={styles.intro}>
            Recovery support, sleep support, and reminders — all in one place. Luna won&apos;t judge you for a
            hard week. This is supportive guidance, not therapy or medical advice.
          </Text>

          <LunaSupportPanel />

          <TouchableOpacity style={styles.actionButton} onPress={() => { onClose(); router.push("/day-plan"); }}>
            <Text style={styles.actionIcon}>🌸</Text>
            <Text style={styles.actionText}>Set Hobby (in Day Plan)</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => { onClose(); router.push("/sleep-calendar"); }}>
            <Text style={styles.actionIcon}>🌙</Text>
            <Text style={styles.actionText}>Sleep support</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => { onClose(); router.push("/affirmations"); }}>
            <Text style={styles.actionIcon}>✦</Text>
            <Text style={styles.actionText}>Affirmations</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reminderButton} onPress={() => setShowReminderModal(true)}>
            <Text style={styles.actionIcon}>💗</Text>
            <Text style={styles.actionText}>Set Reminder</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => { onClose(); router.push("/talk-to-luna"); }}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>Talk to Luna</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <GuideReminderModal visible={showReminderModal} onClose={() => setShowReminderModal(false)} guide="luna" />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", padding: 18, paddingTop: 60, paddingBottom: 40 },
  panel: { flex: 1, backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderColor: "#334155", borderRadius: 12 },
  content: { padding: 16 },
  title: { color: "#FDE047", fontFamily: pixelFont, fontSize: 20, fontWeight: "900", textAlign: "center", marginBottom: 8, letterSpacing: 1 },
  intro: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  actionButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 3,
    borderColor: "#A78BFA",
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  // Dark pink, filled — Set Reminder is visually distinct from the other (purple outline) links.
  reminderButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#9D174D",
    borderWidth: 3,
    borderColor: "#DB2777",
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  actionIcon: { fontSize: 22, marginRight: 10 },
  actionText: { flex: 1, color: "#F9FAFB", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", textAlign: "center" },
  actionArrow: { color: "#C4B5FD", fontSize: 26, fontWeight: "900", marginLeft: 8 },
  closeBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10 },
  closeBtnText: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
});
