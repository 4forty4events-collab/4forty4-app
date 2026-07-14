import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText, colors, space } from '../../lib/theme';
import { Icon } from '../ui/Icon';

// WEB build of ExploreMap. `react-native-maps` imports native-only RN internals
// (codegenNativeCommands) that Metro cannot bundle for web, so even a guarded
// require() would break the web bundle at build time. Metro resolves this
// `.web.js` file on web and the native `ExploreMap.js` everywhere else, so the
// maps module is never referenced on web. We show the same friendly fallback the
// native file uses inside Expo Go, pointing users back to the working List view.
export function ExploreMap({ items }) {
  const count = useMemo(
    () => (items ?? []).filter((it) => it.latitude != null && it.longitude != null).length,
    [items],
  );

  return (
    <View style={styles.fallback}>
      <Icon name="pin" size={30} color={colors.textLo} />
      <AppText variant="title" style={styles.fallbackTitle}>Map view isn’t available on web</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.fallbackBody}>
        The interactive map runs in the mobile app build.
        {count ? ` There ${count === 1 ? 'is' : 'are'} ${count} place${count === 1 ? '' : 's'} nearby — switch to List to explore them.` : ' Switch to List to explore what’s nearby.'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl, gap: space.sm },
  fallbackTitle: { textAlign: 'center', marginTop: space.xs },
  fallbackBody: { textAlign: 'center', lineHeight: 21 },
});
