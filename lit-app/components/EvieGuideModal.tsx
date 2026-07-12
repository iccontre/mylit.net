import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EvieAiPathCard } from "./EvieAiPathCard";
import { GuideReminderModal } from "./GuideReminderModal";
import { PathPipelineCard } from "./PathPipelineCard";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

/** Shared Evie support modal — used by Path's Evie button and Home's Progress-mode affirmation. */
export function EvieGuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [showReminderModal, setShowReminderModal] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
          <Text style={styles.title}>EVIE</Text>
          <Text style={styles.intro}>
            Evie is a guide, not a replacement for your own choices. Fill in your Life Profile so she can
            actually help with the path you want — the more she knows, the more specific her help gets.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => { onClose(); router.push("/life-profile"); }}>
            <Text style={styles.primaryBtnText}>Formulate my path</Text>
          </TouchableOpacity>

          <PathPipelineCard />
          <EvieAiPathCard />

          <TouchableOpacity style={styles.reminderButton} onPress={() => setShowReminderModal(true)}>
            <Text style={styles.actionIcon}>🎯</Text>
            <Text style={styles.actionText}>Set Reminder</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => { onClose(); router.push("/talk-to-evie"); }}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>Talk to Evie about my path</Text>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <GuideReminderModal visible={showReminderModal} onClose={() => setShowReminderModal(false)} guide="evie" />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", padding: 18, paddingTop: 60, paddingBottom: 40 },
  panel: { flex: 1, backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderColor: "#334155", borderRadius: 12 },
  content: { padding: 16 },
  title: { color: "#FDE047", fontFamily: pixelFont, fontSize: 20, fontWeight: "900", textAlign: "center", marginBottom: 8, letterSpacing: 1 },
  intro: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  primaryBtn: { borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(113,63,18,0.4)", marginBottom: 12 },
  primaryBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  actionButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 3,
    borderColor: "#22C55E",
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  // Gold, filled — Set Reminder is visually distinct from the other (green outline) links, mirroring Luna's dark-pink reminder button.
  reminderButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#B45309",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  actionIcon: { fontSize: 22, marginRight: 10 },
  actionText: { flex: 1, color: "#F9FAFB", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", textAlign: "center" },
  actionArrow: { color: "#4ADE80", fontSize: 26, fontWeight: "900", marginLeft: 8 },
  closeBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10 },
  closeBtnText: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
});
