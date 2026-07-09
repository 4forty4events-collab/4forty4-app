import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { AppText, colors, space } from '../../lib/theme';

// Dependency-free daily bar chart (dark). Bars scale to the max value in the series.
export function AnalyticsChart({ daily = [], metric = 'views', color = colors.accent2 }) {
  const max = Math.max(1, ...daily.map((d) => d[metric] ?? 0));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chart}>
      {daily.map((d, i) => (
        <View key={i} style={styles.col}>
          <AppText variant="caption" color={colors.textLo} style={styles.value}>{d[metric] ?? 0}</AppText>
          <View style={styles.track}>
            <View style={[styles.bar, { height: Math.max(3, Math.round(((d[metric] ?? 0) / max) * 96)), backgroundColor: color }]} />
          </View>
          <AppText variant="caption" color={colors.textMute} style={styles.day}>{String(d.date).slice(5)}</AppText>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: 4, paddingTop: 4 },
  col: { alignItems: 'center', width: 34 },
  value: { marginBottom: 3 },
  track: { height: 100, justifyContent: 'flex-end' },
  bar: { width: 20, borderRadius: 5 },
  day: { marginTop: 5, fontSize: 9 },
});
