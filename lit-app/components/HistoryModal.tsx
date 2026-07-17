import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  groupHistoryByWeek,
  parseLogArray,
  type HistoryNormalizer,
  type HistoryWeek,
} from "../lib/logHistory";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type HistoryModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  storageKey: string;
  normalize: HistoryNormalizer;
  accent?: string;
};

// Shared popup that shows a feature's saved log entries, grouped by week (newest first).
// It reads the same synced storage key the feature writes to, so cloud-restored logs appear
// here too. It never writes, so it can't duplicate entries or affect steps/energy.
export function HistoryModal({ visible, onClose, title, storageKey, normalize, accent = "#C4A7FF" }: HistoryModalProps) {
  const [weeks, setWeeks] = useState<HistoryWeek[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const raw = await AsyncStorage.getItem(storageKey);
    setWeeks(groupHistoryByWeek(normalize(parseLogArray(raw))));
  }, [storageKey, normalize]);

  useEffect(() => {
    if (visible) {
      setExpanded({});
      void load();
    }
  }, [visible, load]);

  const totalEntries = weeks.reduce((sum, week) => sum + week.entries.length, 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.panel, { borderColor: accent }]} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: accent }]} numberOfLines={1}>{title}</Text>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: accent }]} onPress={onClose}>
              <Text style={[styles.closeBtnText, { color: accent }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {totalEntries === 0 ? (
              <Text style={styles.emptyText}>No saved entries yet. Anything you save here will show up in this history.</Text>
            ) : (
              weeks.map((week) => (
                <View key={week.key} style={styles.week}>
                  <Text style={[styles.weekLabel, { color: accent }]}>{week.label}</Text>
                  {week.entries.map((entry) => {
                    const isOpen = Boolean(expanded[entry.id]);
                    return (
                      <TouchableOpacity
                        key={entry.id}
                        style={styles.entry}
                        activeOpacity={0.85}
                        onPress={() => setExpanded((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                      >
                        <View style={styles.entryTop}>
                          {entry.heading ? <Text style={styles.entryHeading} numberOfLines={1}>{entry.heading}</Text> : <View />}
                          <Text style={styles.entryWhen}>{entry.whenLabel}</Text>
                        </View>
                        {entry.meta ? <Text style={styles.entryMeta} numberOfLines={isOpen ? undefined : 1}>{entry.meta}</Text> : null}
                        {entry.body ? (
                          <Text style={styles.entryBody} numberOfLines={isOpen ? undefined : 2}>
                            {isOpen ? entry.body : entry.preview}
                          </Text>
                        ) : null}
                        <Text style={styles.entryCue}>{isOpen ? "Tap to collapse ▲" : "Tap to read ▾"}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>

          <TouchableOpacity style={[styles.doneBtn, { borderColor: accent }]} onPress={onClose}>
            <Text style={styles.doneBtnText}>DONE</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  panel: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "86%",
    backgroundColor: "rgba(46,32,20,0.99)",
    borderWidth: 3,
    borderRadius: 10,
    padding: 14,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { fontFamily: pixelFont, fontSize: 15, fontWeight: "900", letterSpacing: 0.6, flex: 1, marginRight: 10, textTransform: "uppercase" },
  closeBtn: { width: 30, height: 30, borderWidth: 2, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(46,32,20,0.9)" },
  closeBtnText: { fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  scroll: { maxHeight: 460 },
  scrollContent: { paddingBottom: 6 },
  emptyText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  week: { marginBottom: 14 },
  weekLabel: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" },
  entry: { backgroundColor: "rgba(46,32,20,0.9)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, padding: 11, marginBottom: 8 },
  entryTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, minHeight: 14 },
  entryHeading: { flex: 1, color: "#E9D5FF", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  entryWhen: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 10, fontWeight: "800" },
  entryMeta: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 5 },
  entryBody: { color: "#F8F1D7", fontFamily: pixelFont, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 6 },
  entryCue: { color: "#64748B", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginTop: 7, textTransform: "uppercase", letterSpacing: 0.5 },
  doneBtn: { marginTop: 10, borderWidth: 2, borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "rgba(46,32,20,0.9)" },
  doneBtnText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
});
