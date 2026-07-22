import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { FeedToGuideButton } from "./parchment/FeedToGuideButton";
import { readJson } from "../lib/readJson";
import { persistProgressKeys } from "../lib/progressStore";
import { getQuestDayKey } from "../lib/scheduling";
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
 * Mind Hub's Quick Thoughts editor — a lightweight, Apple-Notes-like scratchpad, intentionally
 * separate from journal/dream/reflection logs (see QUICK_THOUGHT_NOTES_KEY). This is the ONE
 * canonical entry point for creating/editing a QuickThoughtNote; Log History (app/log-history.tsx)
 * reads the same storage key read-only, so nothing here duplicates or migrates existing records.
 */
export function QuickThoughtsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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

  const editingNote = editingId && editingId !== "new" ? notes.find((n) => n.id === editingId) ?? null : null;

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
        localDate: getQuestDayKey(),
      };
      nextNotes = [note, ...notes];
      setEditingId(note.id);
    }
    await persistProgressKeys({ [QUICK_THOUGHT_NOTES_KEY]: JSON.stringify(nextNotes) });
    setNotes(nextNotes);
    setSaved(true);
  }

  const isDetailOpen = editingId !== null;
  const savedNote = editingId ? notes.find((n) => n.id === editingId) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.panel} contentContainerStyle={styles.notesContent}>
          {isDetailOpen ? (
            <>
              <Text style={styles.title}>{editingNote ? "EDIT THOUGHT" : "NEW QUICK THOUGHT"}</Text>
              <TextInput
                style={styles.titleInput}
                value={draftTitle}
                onChangeText={(t) => { setDraftTitle(t); setSaved(false); }}
                placeholder="Title"
                placeholderTextColor="#8783C9"
              />
              <TextInput
                style={styles.bodyInput}
                value={draftBody}
                onChangeText={(t) => { setDraftBody(t); setSaved(false); }}
                placeholder="Capture something before it disappears…"
                placeholderTextColor="#8783C9"
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
                <Text style={styles.saveBtnText}>{saved ? "✓ SAVED" : "SAVE"}</Text>
              </TouchableOpacity>
              {saved && savedNote ? (
                <View style={styles.feedRow}>
                  <FeedToGuideButton
                    guide="luna"
                    sourceType="quickThought"
                    sourceId={savedNote.id}
                    sourceText={`${savedNote.title}\n${savedNote.body}`.trim()}
                  />
                </View>
              ) : null}
              <TouchableOpacity style={styles.closeBtn} onPress={() => setEditingId(null)}>
                <Text style={styles.closeBtnText}>BACK TO THOUGHTS</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>💭 QUICK THOUGHTS</Text>
              <Text style={styles.intro}>Capture something before it disappears.</Text>
              <TouchableOpacity style={[styles.row, styles.rowNew]} onPress={openNew}>
                <Text style={styles.rowIcon}>+</Text>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowName}>New Quick Thought</Text>
                </View>
              </TouchableOpacity>
              {notes.length === 0 ? (
                <Text style={styles.emptyText}>No quick thoughts yet.</Text>
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
  panel: { width: "100%", maxWidth: 380, maxHeight: "85%", backgroundColor: "rgba(36,26,74,0.98)", borderWidth: 3, borderColor: "#7C3AED", borderRadius: 12, padding: 16 },
  notesContent: { paddingBottom: 8 },
  title: { color: "#ECE4FB", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", textAlign: "center", marginBottom: 6, letterSpacing: 1 },
  intro: { color: "#C4B5FD", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "rgba(46,32,20,0.9)" },
  rowNew: { borderColor: "#C084FC", backgroundColor: "rgba(76,29,149,0.55)" },
  rowIcon: { fontSize: 22, marginRight: 12, color: "#ECE4FB" },
  rowCopy: { flex: 1 },
  rowName: { color: "#ECE4FB", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  closeBtn: { marginTop: 4, alignItems: "center", paddingVertical: 10 },
  closeBtnText: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  emptyText: { color: "#C4B5FD", fontSize: 11, fontWeight: "700", textAlign: "center", marginVertical: 10 },
  noteListRow: { borderWidth: 2, borderColor: "#4C1D95", borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: "rgba(36,26,74,0.85)" },
  noteListTitle: { color: "#ECE4FB", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  noteListMeta: { color: "#C4B5FD", fontSize: 10, fontWeight: "700", marginTop: 3 },
  titleInput: { backgroundColor: "rgba(36,26,74,0.9)", borderWidth: 2, borderColor: "#4C1D95", borderRadius: 6, padding: 10, fontSize: 14, color: "#ECE4FB", fontWeight: "800", marginBottom: 8 },
  bodyInput: { backgroundColor: "rgba(36,26,74,0.9)", borderWidth: 2, borderColor: "#4C1D95", borderRadius: 6, padding: 10, fontSize: 13, color: "#ECE4FB", fontWeight: "600", minHeight: 120, textAlignVertical: "top", marginBottom: 8 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  categoryChip: { borderWidth: 1, borderColor: "#4C1D95", borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "rgba(46,32,74,0.82)" },
  categoryChipActive: { borderColor: "#C084FC", backgroundColor: "rgba(124,58,237,0.8)" },
  categoryChipText: { color: "#C4B5FD", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  categoryChipTextActive: { color: "#F3E8FF" },
  saveBtn: { borderWidth: 2, borderColor: "#C084FC", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "rgba(88,28,135,0.75)" },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#F3E8FF", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  feedRow: { marginTop: 10 },
});
