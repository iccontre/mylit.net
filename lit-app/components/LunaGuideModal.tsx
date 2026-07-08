import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { LunaSupportPanel } from "./LunaSupportPanel";
import type { QuestCategory } from "../lib/agentTypes";
import type { LunaDayReminder } from "../lib/lunaReminders";
import { persistProgressKeys } from "../lib/progressStore";
import { type WeekdayName } from "../lib/scheduling";
import { LUNA_DAY_REMINDERS_KEY, USER_STATS_KEY } from "../lib/storageKeys";
import { readJson } from "../lib/readJson";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const WEEKDAYS: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CATEGORY_OPTIONS: { value: QuestCategory; label: string }[] = [
  { value: "work", label: "Work" },
  { value: "social", label: "Social" },
  { value: "health", label: "Health" },
  { value: "purpose", label: "Purpose" },
];

/** Shared Luna support modal — used by Path's Luna button and Home's Talk to Luna button. */
export function LunaGuideModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [until, setUntil] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [category, setCategory] = useState<QuestCategory | null>(null);
  const [weekdays, setWeekdays] = useState<WeekdayName[]>([]);
  const [saved, setSaved] = useState(false);

  function toggleWeekday(day: WeekdayName) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    setSaved(false);
  }

  function resetReminderForm() {
    setText("");
    setTime("");
    setUntil("");
    setDurationMinutes("");
    setCategory(null);
    setWeekdays([]);
    setSaved(false);
  }

  async function saveReminder() {
    if (!text.trim() || saved) return;
    const reminders = await readJson<LunaDayReminder[]>(LUNA_DAY_REMINDERS_KEY, []);
    const entry: LunaDayReminder = {
      id: `reminder-${Date.now()}`,
      text: text.trim(),
      time: time.trim() || undefined,
      until: until.trim() || undefined,
      durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : undefined,
      category: category ?? undefined,
      weekdays: weekdays.length > 0 ? weekdays : undefined,
      createdAt: new Date().toISOString(),
      stepAwarded: true,
    };
    await persistProgressKeys({ [LUNA_DAY_REMINDERS_KEY]: JSON.stringify([entry, ...reminders]) });

    // +1 step once per reminder — guarded by `saved` above so repeated taps can't double-award.
    const stats = await readJson<Record<string, unknown>>(USER_STATS_KEY, {});
    await persistProgressKeys({ [USER_STATS_KEY]: JSON.stringify({ ...stats, totalSteps: Number(stats.totalSteps ?? 0) + 1 }) });

    setSaved(true);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
          <Text style={styles.title}>LUNA</Text>
          <Text style={styles.intro}>
            Recovery support, sleep support, and reminders — all in one place. Luna won't judge you for a
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

      <Modal visible={showReminderModal} transparent animationType="fade" onRequestClose={() => setShowReminderModal(false)}>
        <View style={styles.backdrop}>
          <View style={styles.reminderPanel}>
            <Text style={styles.reminderTitle}>Set a Reminder</Text>

            <Text style={styles.fieldLabel}>Reminder text</Text>
            <TextInput style={styles.input} value={text} onChangeText={(t) => { setText(t); setSaved(false); }} placeholder="e.g. Stretch for 5 minutes" placeholderTextColor="#7A2049" />

            <Text style={styles.fieldLabel}>What time?</Text>
            <TextInput style={styles.input} value={time} onChangeText={(t) => { setTime(t); setSaved(false); }} placeholder="e.g. 3:00 PM (optional)" placeholderTextColor="#7A2049" />

            <Text style={styles.fieldLabel}>Until when?</Text>
            <TextInput style={styles.input} value={until} onChangeText={(t) => { setUntil(t); setSaved(false); }} placeholder="e.g. 6:00 PM (optional)" placeholderTextColor="#7A2049" />

            <Text style={styles.fieldLabel}>How long? (minutes, optional)</Text>
            <TextInput style={styles.input} value={durationMinutes} onChangeText={(t) => { setDurationMinutes(t); setSaved(false); }} placeholder="e.g. 15" placeholderTextColor="#7A2049" keyboardType="numeric" />

            <Text style={styles.fieldLabel}>Repeat on</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((day) => (
                <TouchableOpacity key={day} style={[styles.weekdayChip, weekdays.includes(day) && styles.weekdayChipActive]} onPress={() => toggleWeekday(day)}>
                  <Text style={[styles.weekdayChipText, weekdays.includes(day) && styles.weekdayChipTextActive]}>{day.slice(0, 3)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.weekdayRow}>
              {CATEGORY_OPTIONS.map((option) => (
                <TouchableOpacity key={option.value} style={[styles.weekdayChip, category === option.value && styles.weekdayChipActive]} onPress={() => { setCategory((prev) => (prev === option.value ? null : option.value)); setSaved(false); }}>
                  <Text style={[styles.weekdayChipText, category === option.value && styles.weekdayChipTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.reminderSaveBtn, (!text.trim() || saved) && styles.reminderSaveBtnDisabled]} disabled={!text.trim() || saved} onPress={() => void saveReminder()}>
              <Text style={styles.reminderSaveBtnText}>{saved ? "SAVED" : "SAVE REMINDER · +1 STEP"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setShowReminderModal(false); resetReminderForm(); }}>
              <Text style={styles.closeBtnText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  reminderPanel: { width: "100%", maxWidth: 380, alignSelf: "center", backgroundColor: "#FCE7F3", borderWidth: 3, borderColor: "#9D174D", borderRadius: 10, padding: 16, marginTop: "auto", marginBottom: "auto" },
  reminderTitle: { color: "#500724", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 8, textAlign: "center" },
  fieldLabel: { color: "#500724", fontSize: 11, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: "#FFF1F6", borderWidth: 2, borderColor: "#DB2777", borderRadius: 6, padding: 10, fontSize: 14, color: "#500724", fontWeight: "700" },
  weekdayRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  weekdayChip: { borderWidth: 1, borderColor: "#DB2777", borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#FFF1F6" },
  weekdayChipActive: { backgroundColor: "#9D174D" },
  weekdayChipText: { color: "#9D174D", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  weekdayChipTextActive: { color: "#FCE7F3" },
  reminderSaveBtn: { marginTop: 14, borderWidth: 2, borderColor: "#9D174D", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#DB2777" },
  reminderSaveBtnDisabled: { backgroundColor: "#F5D0E5", borderColor: "#F5D0E5" },
  reminderSaveBtnText: { color: "#FFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
});
