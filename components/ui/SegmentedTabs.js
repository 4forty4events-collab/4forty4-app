import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { AppText, colors, radius, space } from '../../lib/theme';

// Two-or-more segment control (Itinerary / Chat, etc.). Active segment gets an
// elevated fill + accent underline; inactive stays quiet. LTR-stable (no RTL flip).
export function SegmentedTabs({ tabs, value, onChange, style }) {
  return (
    <View style={[styles.wrap, style]}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.seg, on && styles.segOn]}
          >
            <AppText variant="label" color={on ? colors.textHi : colors.textLo}>{t.label}</AppText>
            {on ? <View style={styles.underline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.xs },
  seg: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  segOn: { backgroundColor: colors.bgElevated2 },
  underline: { position: 'absolute', bottom: 4, height: 2, width: 22, borderRadius: 1, backgroundColor: colors.accent },
});
