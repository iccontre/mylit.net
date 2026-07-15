import { useState } from "react";
import { Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { shareEntryWithGuide } from "../lib/guideContext";
import type { GuideContextSourceType, GuideName } from "../lib/agentTypes";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const GUIDE_LABEL: Record<GuideName, string> = { luna: "Luna", evie: "Evie" };

const USAGE_EXPLANATION: Record<GuideName, string> = {
  luna: "Luna may use this to notice patterns in how you're feeling, sleeping, eating, and resting, and to offer gentler, more supportive check-ins and recovery suggestions. She won't diagnose or prescribe anything.",
  evie: "Evie may use this to understand your goals and suggest quests that fit them — sequencing, pacing, and priorities. Any quest changes she proposes come back to you for review before anything on your schedule actually changes.",
};

type FeedToGuideModalProps = {
  visible: boolean;
  guide: GuideName;
  sourceType: GuideContextSourceType;
  sourceId: string;
  sourceText: string;
  onClose: () => void;
  /** Called after the consent record is actually persisted — never before. */
  onShared?: () => void;
};

/**
 * The one shared consent flow for every "Feed to Luna" / "Feed to Evie" action in the app.
 * Neither guide gets automatic access to any entry — this modal is the ONLY path that can ever
 * create a GuideContextRecord, and it always shows the exact text before asking for
 * confirmation. Sharing itself is never rewarded with steps.
 */
export function FeedToGuideModal({ visible, guide, sourceType, sourceId, sourceText, onClose, onShared }: FeedToGuideModalProps) {
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await shareEntryWithGuide({ guide, sourceType, sourceId, sourceText });
      onShared?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <Image source={guide === "luna" ? uiAssets.guides.luna : uiAssets.guides.evie} style={styles.avatar} resizeMode="contain" />
            <Text style={styles.title}>Feed to {GUIDE_LABEL[guide]}?</Text>
          </View>

          <Text style={styles.sectionLabel}>WHAT WILL BE SHARED</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewText} numberOfLines={8}>{sourceText.trim() || "(empty entry)"}</Text>
          </View>

          <Text style={styles.sectionLabel}>HOW IT MAY BE USED</Text>
          <Text style={styles.usageText}>{USAGE_EXPLANATION[guide]}</Text>
          <Text style={styles.revocableNote}>You can remove this at any time from Guide Context in your account settings.</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]} onPress={handleConfirm} disabled={saving}>
              <Text style={styles.confirmBtnText}>{saving ? "SHARING…" : `SHARE WITH ${GUIDE_LABEL[guide].toUpperCase()}`}</Text>
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
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "#5C4425" },
  title: { flex: 1, color: "#3D2C18", fontFamily: pixelFont, fontSize: 16, fontWeight: "900" },
  sectionLabel: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginTop: 8, marginBottom: 4 },
  previewBox: { backgroundColor: "rgba(58, 42, 21, 0.92)", borderWidth: 2, borderColor: "#8B6B3D", borderRadius: 8, padding: 10, maxHeight: 160 },
  previewText: { color: "#F9FAFB", fontFamily: pixelFont, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  usageText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  revocableNote: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 10, fontStyle: "italic", marginTop: 8, lineHeight: 14 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#E7D3A9" },
  cancelBtnText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  confirmBtn: { flex: 1, borderWidth: 3, borderColor: "#4C1D95", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#7C3AED", shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 2, height: 2 } },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
});
