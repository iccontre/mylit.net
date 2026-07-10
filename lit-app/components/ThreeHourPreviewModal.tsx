import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { parseTimeToMinutes } from "../lib/scheduling";

const pixelFont = "monospace";

export type PreviewSlot = {
  id: string;
  title: string;
  startTime?: string;
  duration?: string;
  kind?: "progress" | "recovery" | string;
};

/** Compact 3-hour-window preview shown right after creating/editing any task — small slot
 * cards, not a text dump. Reused across Quests/Day Plan/Tomorrow's Queue. */
export function ThreeHourPreviewModal({
  visible,
  onClose,
  anchorTime,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  anchorTime?: string;
  items: PreviewSlot[];
}) {
  const anchorMinutes = anchorTime ? parseTimeToMinutes(anchorTime) : null;
  const windowItems =
    anchorMinutes === null
      ? items
      : items
          .filter((item) => {
            const m = item.startTime ? parseTimeToMinutes(item.startTime) : null;
            return m !== null && m >= anchorMinutes - 30 && m <= anchorMinutes + 180;
          })
          .sort((a, b) => (parseTimeToMinutes(a.startTime) ?? 0) - (parseTimeToMinutes(b.startTime) ?? 0));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Text style={styles.title}>NEXT 3 HOURS</Text>
          {windowItems.length === 0 ? (
            <Text style={styles.emptyText}>Nothing else scheduled in this window.</Text>
          ) : (
            windowItems.map((item) => (
              <View key={item.id} style={[styles.slotCard, item.kind === "recovery" ? styles.slotRecovery : styles.slotProgress]}>
                <Text style={styles.slotTime}>{item.startTime ?? "—"}</Text>
                <Text style={styles.slotTitle} numberOfLines={1}>{item.title}</Text>
                {item.duration ? <Text style={styles.slotDuration}>{item.duration}</Text> : null}
              </View>
            ))
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  panel: { width: "100%", maxWidth: 360, backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderColor: "#334155", borderRadius: 12, padding: 16 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", textAlign: "center", marginBottom: 10, letterSpacing: 1 },
  emptyText: { color: "#94A3B8", fontSize: 11, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  slotCard: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderRadius: 6, padding: 8, marginBottom: 6, backgroundColor: "rgba(15,23,42,0.9)" },
  slotProgress: { borderColor: "#FBBF24" },
  slotRecovery: { borderColor: "#A78BFA" },
  slotTime: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", width: 62 },
  slotTitle: { flex: 1, color: "#F8FAFC", fontSize: 11, fontWeight: "800" },
  slotDuration: { color: "#94A3B8", fontSize: 9, fontWeight: "700" },
  closeBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10, borderWidth: 2, borderColor: "#FBBF24", borderRadius: 6, backgroundColor: "rgba(69,43,8,0.65)" },
  closeBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
});
