import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { FeedToGuideModal } from "../FeedToGuideModal";
import { loadActiveGuideContext, revokeGuideContext } from "../../lib/guideContext";
import type { GuideContextSourceType, GuideName } from "../../lib/agentTypes";
import { filledPurple, filledGreen, parchmentBorder, parchmentInkMuted } from "../../constants/parchmentTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const GUIDE_LABEL: Record<GuideName, string> = { luna: "Luna", evie: "Evie" };
const GUIDE_FILL: Record<GuideName, { fill: string; border: string; text: string }> = { luna: filledPurple, evie: filledGreen };

type FeedToGuideButtonProps = {
  guide: GuideName;
  sourceType: GuideContextSourceType;
  sourceId: string;
  sourceText: string;
};

/**
 * Restyled entry point for the existing consent flow — this component owns none of the consent
 * logic itself. It only (a) checks whether THIS specific entry already has an active
 * GuideContextRecord (to show the shared/undo state) and (b) opens the same, unmodified
 * FeedToGuideModal to create one. Revoking re-uses the existing revokeGuideContext ratchet.
 */
export function FeedToGuideButton({ guide, sourceType, sourceId, sourceText }: FeedToGuideButtonProps) {
  const [sharedRecordId, setSharedRecordId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const checkShared = useCallback(async () => {
    const active = await loadActiveGuideContext(guide);
    const match = active.find((record) => record.sourceId === sourceId);
    setSharedRecordId(match?.id ?? null);
  }, [guide, sourceId]);

  useFocusEffect(
    useCallback(() => {
      void checkShared();
    }, [checkShared])
  );

  async function handleUndo() {
    if (!sharedRecordId) return;
    await revokeGuideContext(sharedRecordId);
    setSharedRecordId(null);
  }

  const fill = GUIDE_FILL[guide];

  if (sharedRecordId) {
    return (
      <View style={styles.row}>
        <View style={[styles.sharedPill, { borderColor: fill.border, backgroundColor: fill.fill }]}>
          <Text style={styles.sharedPillText}>✓ SHARED WITH {GUIDE_LABEL[guide].toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={styles.undoBtn} onPress={handleUndo} accessibilityLabel={`Undo sharing with ${GUIDE_LABEL[guide]}`}>
          <Text style={styles.undoBtnText}>UNDO</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.feedBtn, { borderColor: fill.border, backgroundColor: fill.fill }]}
        onPress={() => setShowModal(true)}
        accessibilityLabel={`Feed to ${GUIDE_LABEL[guide]}`}
      >
        <Text style={styles.feedBtnText}>FEED TO {GUIDE_LABEL[guide].toUpperCase()}</Text>
      </TouchableOpacity>
      <FeedToGuideModal
        visible={showModal}
        guide={guide}
        sourceType={sourceType}
        sourceId={sourceId}
        sourceText={sourceText}
        onClose={() => setShowModal(false)}
        onShared={() => void checkShared()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  feedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  feedBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  sharedPill: { flex: 1, borderWidth: 2, borderRadius: 5, paddingVertical: 9, paddingHorizontal: 12, alignItems: "center" },
  sharedPillText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  undoBtn: { borderWidth: 2, borderColor: parchmentBorder, borderRadius: 5, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: "#E7D3A9" },
  undoBtnText: { color: parchmentInkMuted, fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
});
