import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { readJson } from "../lib/readJson";
import { persistProgressKeys } from "../lib/progressStore";
import { QUICK_THOUGHT_NOTES_KEY } from "../lib/storageKeys";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

export type QuickThoughtNoteCategory = "general" | "progress" | "recovery" | "path" | "sleep" | "hobby";

export type QuickThoughtNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  localDate: string;
  category?: QuickThoughtNoteCategory;
};

const CATEGORY_OPTIONS: { value: NonNullable<QuickThoughtNote["category"]>; label: string }[] = [
  { value: "general", label: "General" },
  { value: "progress", label: "Progress" },
  { value: "recovery", label: "Recovery" },
  { value: "path", label: "Path" },
  { value: "sleep", label: "Sleep" },
  { value: "hobby", label: "Hobby" },
];

/**
 * Calendar's "Quick Thoughts" entry point — Luna/Evie reminders plus MYLIT-themed General
 * Notes. Notes are intentionally separate from journal/dream/reflection logs (see
 * QUICK_THOUGHT_NOTES_KEY) — a lightweight, Apple-Notes-like scratchpad, not a guided log.
 */
export function QuickThoughtsModal({
  visible,
  onClose,
  selectedDateKey,
  onOpenLuna,
  onOpenEvie,
}: {
  visible: boolean;
  onClose: () => void;
  selectedDateKey: string;
  onOpenLuna: () => void;
  onOpenEvie: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);

  return (
    <>
      <Modal visible={visible && !showNotes} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.panel}>
            <Text style={styles.title}>QUICK THOUGHTS</Text>
            <Text style={styles.intro}>Capture reminders, thoughts, and notes for this day.</Text>

            <TouchableOpacity style={[styles.row, styles.rowPurple]} onPress={() => { onClose(); onOpenLuna(); }}>
              <Text style={styles.rowIcon}>🌙</Text>
              <View style={styles.rowCopy}>
                <Text style={styles.rowName}>Luna Reminders</Text>
                <Text style={styles.rowExplain}>Recovery reminders</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowGreen]} onPress={() => { onClose(); onOpenEvie(); }}>
              <Text style={styles.rowIcon}>🌲</Text>
              <View style={styles.rowCopy}>
                <Text style={styles.rowName}>Evie Reminders</Text>
                <Text style={styles.rowExplain}>Progress reminders</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, styles.rowGold]} onPress={() => setShowNotes(true)}>
              <Text style={styles.rowIcon}>📝</Text>
              <View style={styles.rowCopy}>
                <Text style={styles.rowName}>General Notes</Text>
                <Text style={styles.rowExplain}>Simple notes for this day</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <GeneralNotesModal visible={visible && showNotes} onClose={() => setShowNotes(false)} selectedDateKey={selectedDateKey} />
    </>
  );
}

function GeneralNotesModal({ visible, onClose, selectedDateKey }: { visible: boolean; onClose: () => void; selectedDateKey: string }) {
  const [notes, setNotes] = useState<QuickThoughtNote[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftCategory, setDraftCategory] = useState<QuickThoughtNote["category"]>("general");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void readJson<QuickThoughtNote[]>(QUICK_THOUGHT_NOTES_KEY, []).then((list) => setNotes(Array.isArray(list) ? list : []));
  }, [visible]);

  function openNew() {
    setEditingId("new");
    setDraftTitle("");
    setDraftBody("");
    setDraftCategory("general");
    setSaved(false);
  }

  function openExisting(note: QuickThoughtNote) {
    setEditingId(note.id);
    setDraftTitle(note.title);
    setDraftBody(note.body);
    setDraftCategory(note.category ?? "general");
    setSaved(false);
  }

  async function saveNote() {
    if (!draftTitle.trim() || saved) return;
    const now = new Date().toISOString();
    let nextNotes: QuickThoughtNote[];
    if (editingId && editingId !== "new") {
      nextNotes = notes.map((note) =>
        note.id === editingId ? { ...note, title: draftTitle.trim(), body: draftBody, category: draftCategory, updatedAt: now } : note
      );
    } else {
      const note: QuickThoughtNote = {
        id: `note-${Date.now()}`,
        title: draftTitle.trim(),
        body: draftBody,
        category: draftCategory,
        createdAt: now,
        updatedAt: now,
        localDate: selectedDateKey,
      };
      nextNotes = [note, ...notes];
    }
    await persistProgressKeys({ [QUICK_THOUGHT_NOTES_KEY]: JSON.stringify(nextNotes) });
    setNotes(nextNotes);
    setSaved(true);
  }

  const isDetailOpen = editingId !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.notesContent}>
          {isDetailOpen ? (
            <>
              <Text style={styles.title}>{editingId === "new" ? "NEW NOTE" : "EDIT NOTE"}</Text>
              <TextInput
                style={styles.titleInput}
                value={draftTitle}
                onChangeText={(t) => { setDraftTitle(t); setSaved(false); }}
                placeholder="Title"
                placeholderTextColor="#8A6D4A"
              />
              <TextInput
                style={styles.bodyInput}
                value={draftBody}
                onChangeText={(t) => { setDraftBody(t); setSaved(false); }}
                placeholder="Write something..."
                placeholderTextColor="#8A6D4A"
                multiline
              />
              <View style={styles.categoryRow}>
                {CATEGORY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.categoryChip, draftCategory === option.value && styles.categoryChipActive]}
                    onPress={() => { setDraftCategory(option.value); setSaved(false); }}
                  >
                    <Text style={[styles.categoryChipText, draftCategory === option.value && styles.categoryChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, (!draftTitle.trim() || saved) && styles.saveBtnDisabled]}
                disabled={!draftTitle.trim() || saved}
                onPress={() => void saveNote()}
              >
                <Text style={styles.saveBtnText}>{saved ? "SAVED" : "SAVE"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setEditingId(null)}>
                <Text style={styles.closeBtnText}>BACK TO NOTES</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>GENERAL NOTES</Text>
              <Text style={styles.intro}>MYLIT-themed notes — separate from your journal and reflections.</Text>
              <TouchableOpacity style={[styles.row, styles.rowGold]} onPress={openNew}>
                <Text style={styles.rowIcon}>+</Text>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowName}>New Note</Text>
                </View>
              </TouchableOpacity>
              {notes.length === 0 ? (
                <Text style={styles.emptyText}>No notes yet.</Text>
              ) : (
                notes.map((note) => (
                  <TouchableOpacity key={note.id} style={styles.noteListRow} onPress={() => openExisting(note)}>
                    <Text style={styles.noteListTitle} numberOfLines={1}>{note.title}</Text>
                    <Text style={styles.noteListMeta} numberOfLines={1}>
                      {note.localDate} · {note.body.trim().slice(0, 40) || "No content"}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>CLOSE</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", alignItems: "center", justifyContent: "center", padding: 18 },
  panel: { width: "100%", maxWidth: 380, maxHeight: "85%", backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderColor: "#334155", borderRadius: 12, padding: 16 },
  notesContent: { paddingBottom: 8 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", textAlign: "center", marginBottom: 6, letterSpacing: 1 },
  intro: { color: "#CBD5E1", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "rgba(15,23,42,0.9)" },
  rowPurple: { borderColor: "#A78BFA" },
  rowGreen: { borderColor: "#22C55E" },
  rowGold: { borderColor: "#FBBF24" },
  rowIcon: { fontSize: 22, marginRight: 12 },
  rowCopy: { flex: 1 },
  rowName: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  rowExplain: { color: "#94A3B8", fontSize: 11, fontWeight: "700", marginTop: 2 },
  closeBtn: { marginTop: 4, alignItems: "center", paddingVertical: 10 },
  closeBtnText: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  emptyText: { color: "#94A3B8", fontSize: 11, fontWeight: "700", textAlign: "center", marginVertical: 10 },
  noteListRow: { borderWidth: 2, borderColor: "#475569", borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: "rgba(15,23,42,0.85)" },
  noteListTitle: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  noteListMeta: { color: "#94A3B8", fontSize: 10, fontWeight: "700", marginTop: 3 },
  titleInput: { backgroundColor: "rgba(15,23,42,0.9)", borderWidth: 2, borderColor: "#475569", borderRadius: 6, padding: 10, fontSize: 14, color: "#F8FAFC", fontWeight: "800", marginBottom: 8 },
  bodyInput: { backgroundColor: "rgba(15,23,42,0.9)", borderWidth: 2, borderColor: "#475569", borderRadius: 6, padding: 10, fontSize: 13, color: "#F8FAFC", fontWeight: "600", minHeight: 120, textAlignVertical: "top", marginBottom: 8 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  categoryChip: { borderWidth: 1, borderColor: "#475569", borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "rgba(30,41,59,0.82)" },
  categoryChipActive: { borderColor: "#FBBF24", backgroundColor: "rgba(113,63,18,0.8)" },
  categoryChipText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  categoryChipTextActive: { color: "#FDE68A" },
  saveBtn: { borderWidth: 2, borderColor: "#FBBF24", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "rgba(69,43,8,0.65)" },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
});
