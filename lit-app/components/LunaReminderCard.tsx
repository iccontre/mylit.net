import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { persistProgressKeys } from "../lib/progressStore";
import { LUNA_DAY_REMINDERS_KEY, USER_STATS_KEY } from "../lib/storageKeys";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type LunaDayReminder = {
  id: string;
  dateKey: string;
  text: string;
  time?: string;
  until?: string;
  durationMinutes?: number;
  createdAt: string;
  stepAwarded: boolean;
};

const ROTATING_REMINDERS = [
  "Drink some water.",
  "You're making progress no matter what.",
  "Small steps still count as steps.",
  "Take a breath — you're doing better than you think.",
  "Rest is part of the plan, not a break from it.",
];

const HOBBY_REMINDERS = [
  "Make a little time for something you actually enjoy today.",
  "Your hobby counts too — it's not wasted time.",
  "Self-care isn't a reward you have to earn first.",
];

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function isReminderActiveNow(reminder: LunaDayReminder): boolean {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const start = reminder.time ? parseTimeToMinutes(reminder.time) : null;
  const end = reminder.until ? parseTimeToMinutes(reminder.until) : null;
  if (start !== null && nowMinutes < start) return false;
  if (end !== null && nowMinutes > end) return false;
  return true;
}

/** Rotates by minute-of-day so it feels alive without needing a timer/interval. */
function pickRotating(pool: string[]): string {
  const minuteOfDay = new Date().getHours() * 60 + new Date().getMinutes();
  return pool[minuteOfDay % pool.length];
}

export function LunaReminderCard({ selectedDateKey }: { selectedDateKey: string }) {
  const [reminders, setReminders] = useState<LunaDayReminder[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [until, setUntil] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void readJson<LunaDayReminder[]>(LUNA_DAY_REMINDERS_KEY, []).then(setReminders);
  }, [selectedDateKey]);

  const activeUserReminder = useMemo(() => {
    const forDay = reminders.filter((r) => r.dateKey === selectedDateKey);
    return forDay.find(isReminderActiveNow) ?? null;
  }, [reminders, selectedDateKey]);

  // Hobby/self-care reminders take most of the day (per spec) unless a user reminder is active.
  const displayedText = activeUserReminder
    ? activeUserReminder.text
    : new Date().getMinutes() % 3 === 0
      ? pickRotating(ROTATING_REMINDERS)
      : pickRotating(HOBBY_REMINDERS);

  async function saveReminder() {
    if (!text.trim() || saved) return;
    const entry: LunaDayReminder = {
      id: `reminder-${Date.now()}`,
      dateKey: selectedDateKey,
      text: text.trim(),
      time: time.trim() || undefined,
      until: until.trim() || undefined,
      durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : undefined,
      createdAt: new Date().toISOString(),
      stepAwarded: true,
    };
    const next = [entry, ...reminders];
    await persistProgressKeys({ [LUNA_DAY_REMINDERS_KEY]: JSON.stringify(next) });

    // +1 step once per reminder — guarded by `saved` above so repeated taps on the same
    // open modal can't double-award before the modal closes.
    const stats = await readJson<Record<string, unknown>>(USER_STATS_KEY, {});
    await persistProgressKeys({ [USER_STATS_KEY]: JSON.stringify({ ...stats, totalSteps: Number(stats.totalSteps ?? 0) + 1 }) });

    setReminders(next);
    setSaved(true);
  }

  function closeModal() {
    setShowModal(false);
    setText("");
    setTime("");
    setUntil("");
    setDurationMinutes("");
    setSaved(false);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>REMINDER FROM LUNA</Text>
      <Text style={styles.text}>{displayedText}</Text>
      <TouchableOpacity style={styles.setButton} onPress={() => setShowModal(true)}>
        <Text style={styles.setButtonText}>✎ SET A REMINDER</Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.backdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>Set a Reminder</Text>
            <Text style={styles.modalSubtitle}>Just for today — reminders don't carry over yet.</Text>

            <Text style={styles.fieldLabel}>Reminder text</Text>
            <TextInput style={styles.input} value={text} onChangeText={(t) => { setText(t); setSaved(false); }} placeholder="e.g. Stretch for 5 minutes" placeholderTextColor="#8A6D4A" />

            <Text style={styles.fieldLabel}>What time?</Text>
            <TextInput style={styles.input} value={time} onChangeText={(t) => { setTime(t); setSaved(false); }} placeholder="e.g. 3:00 PM (optional)" placeholderTextColor="#8A6D4A" />

            <Text style={styles.fieldLabel}>Until when?</Text>
            <TextInput style={styles.input} value={until} onChangeText={(t) => { setUntil(t); setSaved(false); }} placeholder="e.g. 6:00 PM (optional)" placeholderTextColor="#8A6D4A" />

            <Text style={styles.fieldLabel}>How long? (minutes, optional)</Text>
            <TextInput style={styles.input} value={durationMinutes} onChangeText={(t) => { setDurationMinutes(t); setSaved(false); }} placeholder="e.g. 15" placeholderTextColor="#8A6D4A" keyboardType="numeric" />

            <TouchableOpacity style={[styles.modalSaveButton, (!text.trim() || saved) && styles.modalSaveButtonDisabled]} disabled={!text.trim() || saved} onPress={() => void saveReminder()}>
              <Text style={styles.modalSaveButtonText}>{saved ? "SAVED" : "SAVE REMINDER · +1 STEP"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal}>
              <Text style={styles.modalCloseButtonText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(253, 242, 248, 0.12)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#F472B6",
  },
  label: { color: "#F9A8D4", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 5 },
  text: { color: "#FCE7F3", fontSize: 13, lineHeight: 18, fontWeight: "700", marginBottom: 8 },
  setButton: { borderWidth: 2, borderColor: "#F472B6", borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(131,24,67,0.25)" },
  setButtonText: { color: "#FBCFE8", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalPanel: { width: "100%", maxWidth: 380, backgroundColor: "#FCE7F3", borderWidth: 3, borderColor: "#F472B6", borderRadius: 10, padding: 16 },
  modalTitle: { color: "#831843", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", marginBottom: 4, textAlign: "center" },
  modalSubtitle: { color: "#9D174D", fontSize: 11, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  fieldLabel: { color: "#831843", fontSize: 11, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: "#FFF1F6", borderWidth: 2, borderColor: "#F9A8D4", borderRadius: 6, padding: 10, fontSize: 14, color: "#831843", fontWeight: "700" },
  modalSaveButton: { marginTop: 14, borderWidth: 2, borderColor: "#DB2777", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#F472B6" },
  modalSaveButtonDisabled: { backgroundColor: "#F5D0E5", borderColor: "#F5D0E5" },
  modalSaveButtonText: { color: "#FFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  modalCloseButton: { marginTop: 8, alignItems: "center", paddingVertical: 8 },
  modalCloseButtonText: { color: "#9D174D", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
});
