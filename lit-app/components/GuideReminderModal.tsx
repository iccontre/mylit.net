import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import type { QuestCategory } from "../lib/agentTypes";
import { reminderGuide, type LunaDayReminder, type ReminderGuide } from "../lib/lunaReminders";
import { persistProgressKeys } from "../lib/progressStore";
import { readJson } from "../lib/readJson";
import { type WeekdayName } from "../lib/scheduling";
import { LUNA_DAY_REMINDERS_KEY, USER_STATS_KEY } from "../lib/storageKeys";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const WEEKDAYS: WeekdayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CATEGORY_OPTIONS: { value: QuestCategory; label: string }[] = [
  { value: "work", label: "Work" },
  { value: "social", label: "Social" },
  { value: "health", label: "Health" },
  { value: "purpose", label: "Purpose" },
];

const GUIDE_THEME: Record<
  ReminderGuide,
  {
    label: string;
    subtitle: string;
    panelBg: string;
    panelBorder: string;
    fieldBg: string;
    fieldBorder: string;
    fieldText: string;
    chipActiveBg: string;
    chipText: string;
    chipTextActive: string;
    saveBg: string;
    saveBorder: string;
    saveDisabledBg: string;
    tabActiveBg: string;
  }
> = {
  luna: {
    label: "Luna",
    subtitle: "Recovery, rest, and support reminders.",
    panelBg: "#FCE7F3",
    panelBorder: "#9D174D",
    fieldBg: "#FFF1F6",
    fieldBorder: "#DB2777",
    fieldText: "#500724",
    chipActiveBg: "#9D174D",
    chipText: "#9D174D",
    chipTextActive: "#FCE7F3",
    saveBg: "#DB2777",
    saveBorder: "#9D174D",
    saveDisabledBg: "#F5D0E5",
    tabActiveBg: "#9D174D",
  },
  evie: {
    label: "Evie",
    subtitle: "Progress, action, and path reminders.",
    panelBg: "#ECFDF3",
    panelBorder: "#166534",
    fieldBg: "#F0FDF4",
    fieldBorder: "#16A34A",
    fieldText: "#14532D",
    chipActiveBg: "#166534",
    chipText: "#166534",
    chipTextActive: "#ECFDF3",
    saveBg: "#16A34A",
    saveBorder: "#166534",
    saveDisabledBg: "#BBF7D0",
    tabActiveBg: "#166534",
  },
};

/**
 * Shared reminder setup + history UI for both guides — one storage key/type (see
 * lib/lunaReminders.ts), just themed and filtered by `guide`. Used by both LunaGuideModal
 * and EvieGuideModal so the two never drift into separate reminder systems.
 */
export function GuideReminderModal({ visible, onClose, guide }: { visible: boolean; onClose: () => void; guide: ReminderGuide }) {
  const theme = GUIDE_THEME[guide];
  const [tab, setTab] = useState<"setup" | "history">("setup");
  const [reminders, setReminders] = useState<LunaDayReminder[]>([]);
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [until, setUntil] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [category, setCategory] = useState<QuestCategory | null>(null);
  const [weekdays, setWeekdays] = useState<WeekdayName[]>([]);
  const [saved, setSaved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTab("setup");
    void loadReminders();
  }, [visible]);

  async function loadReminders() {
    const stored = await readJson<LunaDayReminder[]>(LUNA_DAY_REMINDERS_KEY, []);
    setReminders(Array.isArray(stored) ? stored : []);
  }

  function toggleWeekday(day: WeekdayName) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    setSaved(false);
  }

  function resetForm() {
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
    const existing = await readJson<LunaDayReminder[]>(LUNA_DAY_REMINDERS_KEY, []);
    const entry: LunaDayReminder = {
      id: `reminder-${Date.now()}`,
      guide,
      text: text.trim(),
      time: time.trim() || undefined,
      until: until.trim() || undefined,
      durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : undefined,
      category: category ?? undefined,
      weekdays: weekdays.length > 0 ? weekdays : undefined,
      createdAt: new Date().toISOString(),
      stepAwarded: true,
    };
    const next = [entry, ...existing];
    await persistProgressKeys({ [LUNA_DAY_REMINDERS_KEY]: JSON.stringify(next) });

    // +1 step once per reminder — guarded by `saved` above so repeated taps can't double-award.
    const stats = await readJson<Record<string, unknown>>(USER_STATS_KEY, {});
    await persistProgressKeys({ [USER_STATS_KEY]: JSON.stringify({ ...stats, totalSteps: Number(stats.totalSteps ?? 0) + 1 }) });

    setReminders(next);
    setSaved(true);
  }

  const guideReminders = reminders
    .filter((entry) => reminderGuide(entry) === guide)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.panel, { backgroundColor: theme.panelBg, borderColor: theme.panelBorder }]}>
          <Text style={[styles.title, { color: theme.fieldText }]}>{theme.label.toUpperCase()} REMINDERS</Text>
          <Text style={[styles.subtitle, { color: theme.fieldText }]}>{theme.subtitle}</Text>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, { borderColor: theme.panelBorder }, tab === "setup" && { backgroundColor: theme.tabActiveBg }]}
              onPress={() => setTab("setup")}
            >
              <Text style={[styles.tabBtnText, { color: tab === "setup" ? "#FFF" : theme.fieldText }]}>Set Reminder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, { borderColor: theme.panelBorder }, tab === "history" && { backgroundColor: theme.tabActiveBg }]}
              onPress={() => setTab("history")}
            >
              <Text style={[styles.tabBtnText, { color: tab === "history" ? "#FFF" : theme.fieldText }]}>Reminder History</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {tab === "setup" ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.fieldText }]}>Reminder text</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.fieldBg, borderColor: theme.fieldBorder, color: theme.fieldText }]}
                  value={text}
                  onChangeText={(t) => { setText(t); setSaved(false); }}
                  placeholder="e.g. Stretch for 5 minutes"
                  placeholderTextColor={theme.fieldBorder}
                />

                <Text style={[styles.fieldLabel, { color: theme.fieldText }]}>What time?</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.fieldBg, borderColor: theme.fieldBorder, color: theme.fieldText }]}
                  value={time}
                  onChangeText={(t) => { setTime(t); setSaved(false); }}
                  placeholder="e.g. 3:00 PM (optional)"
                  placeholderTextColor={theme.fieldBorder}
                />

                <Text style={[styles.fieldLabel, { color: theme.fieldText }]}>Until when?</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.fieldBg, borderColor: theme.fieldBorder, color: theme.fieldText }]}
                  value={until}
                  onChangeText={(t) => { setUntil(t); setSaved(false); }}
                  placeholder="e.g. 6:00 PM (optional)"
                  placeholderTextColor={theme.fieldBorder}
                />

                <Text style={[styles.fieldLabel, { color: theme.fieldText }]}>How long? (minutes, optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.fieldBg, borderColor: theme.fieldBorder, color: theme.fieldText }]}
                  value={durationMinutes}
                  onChangeText={(t) => { setDurationMinutes(t); setSaved(false); }}
                  placeholder="e.g. 15"
                  placeholderTextColor={theme.fieldBorder}
                  keyboardType="numeric"
                />

                <Text style={[styles.fieldLabel, { color: theme.fieldText }]}>Repeat on</Text>
                <View style={styles.chipRow}>
                  {WEEKDAYS.map((day) => {
                    const selected = weekdays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.chip, { borderColor: theme.fieldBorder, backgroundColor: theme.fieldBg }, selected && { backgroundColor: theme.chipActiveBg }]}
                        onPress={() => toggleWeekday(day)}
                      >
                        <Text style={[styles.chipText, { color: selected ? theme.chipTextActive : theme.chipText }]}>{day.slice(0, 3)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { color: theme.fieldText }]}>Category</Text>
                <View style={styles.chipRow}>
                  {CATEGORY_OPTIONS.map((option) => {
                    const selected = category === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.chip, { borderColor: theme.fieldBorder, backgroundColor: theme.fieldBg }, selected && { backgroundColor: theme.chipActiveBg }]}
                        onPress={() => { setCategory((prev) => (prev === option.value ? null : option.value)); setSaved(false); }}
                      >
                        <Text style={[styles.chipText, { color: selected ? theme.chipTextActive : theme.chipText }]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { backgroundColor: theme.saveBg, borderColor: theme.saveBorder },
                    (!text.trim() || saved) && { backgroundColor: theme.saveDisabledBg, borderColor: theme.saveDisabledBg },
                  ]}
                  disabled={!text.trim() || saved}
                  onPress={() => void saveReminder()}
                >
                  <Text style={styles.saveBtnText}>{saved ? "SAVED" : "SAVE REMINDER · +1 STEP"}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {guideReminders.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.fieldText }]}>No {theme.label} reminders yet.</Text>
                ) : (
                  guideReminders.map((entry) => {
                    const expanded = expandedId === entry.id;
                    const preview = entry.text.length > 42 ? `${entry.text.slice(0, 42)}…` : entry.text;
                    const dateLabel = new Date(entry.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
                    return (
                      <TouchableOpacity
                        key={entry.id}
                        style={[styles.historyRow, { borderColor: theme.fieldBorder, backgroundColor: theme.fieldBg }]}
                        onPress={() => setExpandedId(expanded ? null : entry.id)}
                      >
                        <Text style={[styles.historyRowTitle, { color: theme.fieldText }]} numberOfLines={expanded ? undefined : 1}>
                          {expanded ? entry.text : preview}
                        </Text>
                        <Text style={[styles.historyRowMeta, { color: theme.fieldText }]}>
                          {theme.label} · {dateLabel}{entry.time ? ` · ${entry.time}` : ""}{entry.category ? ` · ${entry.category}` : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={() => { onClose(); resetForm(); }}>
            <Text style={styles.closeBtnText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", alignItems: "center", justifyContent: "center", padding: 18 },
  panel: { width: "100%", maxWidth: 380, maxHeight: "85%", borderWidth: 3, borderRadius: 10, padding: 16 },
  title: { fontFamily: pixelFont, fontSize: 15, fontWeight: "900", textAlign: "center", letterSpacing: 1 },
  subtitle: { fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 4, marginBottom: 10 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tabBtn: { flex: 1, borderWidth: 2, borderRadius: 6, paddingVertical: 8, alignItems: "center" },
  tabBtnText: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: 8 },
  fieldLabel: { fontSize: 11, fontWeight: "800", marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 2, borderRadius: 6, padding: 10, fontSize: 14, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8 },
  chipText: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  saveBtn: { marginTop: 14, borderWidth: 2, borderRadius: 6, paddingVertical: 11, alignItems: "center" },
  saveBtnText: { color: "#FFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  emptyText: { fontSize: 12, fontWeight: "700", textAlign: "center", marginVertical: 10 },
  historyRow: { borderWidth: 2, borderRadius: 8, padding: 10, marginBottom: 8 },
  historyRowTitle: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  historyRowMeta: { fontSize: 10, fontWeight: "700", marginTop: 4, opacity: 0.8 },
  closeBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10 },
  closeBtnText: { color: "#64748B", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
});
