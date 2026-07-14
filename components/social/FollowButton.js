import React from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { AppText, colors, radius, space } from '../../lib/theme';

// Presentational follow toggle. Filled accent = "Follow", quiet outline =
// "Following" (so unfollowing reads as the reversible action). Parent owns state.
export function FollowButton({ isFollowing, loading, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.btn, isFollowing ? styles.following : styles.follow, style]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ selected: !!isFollowing }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isFollowing ? colors.textHi : colors.onAccent} />
      ) : (
        <AppText variant="label" color={isFollowing ? colors.textHi : colors.onAccent}>
          {isFollowing ? 'Following' : 'Follow'}
        </AppText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { minWidth: 104, paddingVertical: 9, paddingHorizontal: space.base, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  follow: { backgroundColor: colors.accent, borderColor: colors.accent },
  following: { backgroundColor: 'transparent', borderColor: colors.line },
});
