import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { ScheduleConflict } from "../../lib/scheduling";
import { parchmentBody, parchmentBorder, parchmentField, parchmentInk, parchmentInkMuted } from "../../constants/parchmentTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type ScheduleConflictModalProps = {
  visible: boolean;
  /** The item currently being saved — shown as "Your item" in the warning. */
  proposedTitle: string;
  conflicts: ScheduleConflict[];
  onAdjustTime: () => void;
  onSaveAnyway: () => void;
};

/**
 * Themed schedule-conflict warning — shared by the checklist, quest/task, and hobby editors
 * (see findScheduleConflicts in lib/scheduling.ts). Never blocks saving on its own; the caller
 * decides whether to persist after ADJUST TIME (closes, returns to editing) or SAVE ANYWAY
 * (caller re-runs its own save with the conflict check bypassed for that one attempt).
 */
export function ScheduleConflictModal({ visible, proposedTitle, conflicts, onAdjustTime, onSaveAnyway }: ScheduleConflictModalProps) {
  if (conflicts.length === 0) return null;
  const first = conflicts[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onAdjustTime}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Text style={styles.title}>⚠ SCHEDULE CONFLICT</Text>

          <Text style={styles.lead}>This overlaps with:</Text>
          {conflicts.map((conflict) => (
            <View key={conflict.conflictingRecordId} style={styles.conflictRow}>
              <Text style={styles.conflictTitle} numberOfLines={1}>&ldquo;{conflict.conflictingTitle}&rdquo;</Text>
              <Text style={styles.conflictTime}>{conflict.existingStart}–{conflict.existingEnd}</Text>
            </View>
          ))}

          <Text style={styles.lead}>Your item:</Text>
          <View style={styles.conflictRow}>
            <Text style={styles.conflictTitle} numberOfLines={1}>&ldquo;{proposedTitle}&rdquo;</Text>
            <Text style={styles.conflictTime}>{first.proposedStart}–{first.proposedEnd}</Text>
          </View>

          <Text style={styles.overlapNote}>
            {conflicts.length === 1
              ? `${first.overlapMinutes} minute${first.overlapMinutes === 1 ? "" : "s"} overlap.`
              : `${conflicts.length} conflicts, up to ${Math.max(...conflicts.map((c) => c.overlapMinutes))} minutes overlap.`}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.adjustBtn} onPress={onAdjustTime}>
              <Text style={styles.adjustBtnText}>ADJUST TIME</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveAnywayBtn} onPress={onSaveAnyway}>
              <Text style={styles.saveAnywayBtnText}>SAVE ANYWAY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  panel: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: parchmentBody,
    borderWidth: 3,
    borderColor: "#92400E",
    borderRadius: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  title: { color: "#92400E", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", letterSpacing: 0.6, marginBottom: 10 },
  lead: { color: parchmentInkMuted, fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 8, marginBottom: 4 },
  conflictRow: { backgroundColor: parchmentField, borderWidth: 2, borderColor: parchmentBorder, borderRadius: 6, padding: 9, marginBottom: 4 },
  conflictTitle: { color: parchmentInk, fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  conflictTime: { color: parchmentInkMuted, fontFamily: pixelFont, fontSize: 11, fontWeight: "700", marginTop: 2 },
  overlapNote: { color: "#92400E", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 10, textAlign: "center" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  adjustBtn: { flex: 1, borderWidth: 2, borderColor: parchmentBorder, borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#E7D3A9" },
  adjustBtnText: { color: parchmentInk, fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  saveAnywayBtn: { flex: 1, borderWidth: 3, borderColor: "#92400E", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#B45309" },
  saveAnywayBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
});
