import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';
import { Icon } from '../ui/Icon';

// Star rating — readonly for display, tappable for input. Custom geometric star
// (filled = rated). Stars are LTR by convention even in RTL.
export function StarRating({ value = 0, onChange, size = 18, readonly = false }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = <Icon name="star" size={size} fill={filled} color={filled ? colors.star : '#3A465C'} strokeWidth={1.6} />;
        return readonly ? (
          <View key={n} style={styles.slot}>{star}</View>
        ) : (
          <TouchableOpacity key={n} style={styles.slot} onPress={() => onChange?.(n)} hitSlop={6}>{star}</TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  slot: { paddingHorizontal: 1 },
});
