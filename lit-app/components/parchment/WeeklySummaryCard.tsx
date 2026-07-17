import { Platform, StyleSheet, Text, View } from "react-native";

import { WoodSurface } from "./WoodSurface";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

export type WeeklySummaryBar = {
  label: string;
  /** 0-1 fraction of the chart's max height. */
  heightFraction: number;
  color: string;
};

type WeeklySummaryCardProps = {
  title: string;
  icon?: string;
  bars: WeeklySummaryBar[];
  maxBarHeight?: number;
};

/** Wood-surface daily-energy bar chart — Weekly Summary's "DAILY ENERGY" card. */
export function WeeklySummaryCard({ title, icon = "📊", bars, maxBarHeight = 140 }: WeeklySummaryCardProps) {
  return (
    <WoodSurface title={title} icon={icon}>
      <View style={[styles.chartRow, { height: maxBarHeight }]}>
        {bars.map((bar, i) => (
          <View key={`${bar.label}-${i}`} style={styles.barCol}>
            <View style={[styles.bar, { height: Math.max(6, bar.heightFraction * maxBarHeight), backgroundColor: bar.color }]} />
            <Text style={styles.barLabel}>{bar.label}</Text>
          </View>
        ))}
      </View>
    </WoodSurface>
  );
}

const styles = StyleSheet.create({
  chartRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "70%", borderRadius: 3 },
  barLabel: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", color: "#D8C9A3", marginTop: 6 },
});
