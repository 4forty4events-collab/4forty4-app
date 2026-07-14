import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, radius, fonts, useReducedMotion } from '../../lib/theme';
import { NAV_ICONS, ExploreIcon } from './NavIcons';

// Distinctive but self-explanatory names — a step up from the generic
// Explore/Saved/Trips set (which reads like every travel app) while staying
// instantly legible for new users. The custom icons + capsule carry the flair.
const LABELS = {
  BrowseTab: 'Discover',    // the live feed — active, on-brand
  FeedTab: 'Feed',          // the social surface — moments from people
  TripsTab: 'Outings',      // on-brand for a going-out app; Budget folds in here
  SavedTab: 'Saved',        // bookmark = curating a collection, not a social heart
  ProfileTab: 'You',        // friendly + modern, not stock "Profile"
};

const POD_PAD = 6; // pod inner padding; the capsule insets to this on all sides

// Custom floating navigation pod. A single fluid capsule (Animated.View) slides
// between tabs and frames the active icon + label as one cohesive unit; inactive
// labels sit muted so the active name shifts into sharp focus. Icon-set + names
// are bespoke. Motion (capsule slide + icon glow) respects reduce-motion.
export function FloatingTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [podWidth, setPodWidth] = useState(0);

  const n = state.routes.length;
  const tabW = podWidth ? (podWidth - POD_PAD * 2) / n : 0;

  // One shared value = the active index; the capsule's X is index × tabWidth.
  const anim = useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    if (reduced) { anim.setValue(state.index); return; }
    Animated.spring(anim, { toValue: state.index, useNativeDriver: true, friction: 9, tension: 80 }).start();
  }, [state.index, reduced, anim]);
  const translateX = Animated.multiply(anim, tabW);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.pod} onLayout={(e) => setPodWidth(e.nativeEvent.layout.width)}>
        {tabW > 0 && (
          <Animated.View pointerEvents="none" style={[styles.capsule, { width: tabW, transform: [{ translateX }] }]} />
        )}

        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const Icon = NAV_ICONS[route.name] ?? ExploreIcon;
          const label = LABELS[route.name] ?? route.name;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              <View style={[styles.iconWrap, focused && styles.iconGlow]}>
                <Icon active={focused} size={22} />
              </View>
              <Text numberOfLines={1} style={[styles.label, focused ? styles.labelOn : styles.labelOff]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: 'transparent', paddingHorizontal: space.base, paddingTop: space.sm },
  // Frosted pill: translucent elevated fill + hairline glass border + soft lift.
  pod: {
    flexDirection: 'row',
    backgroundColor: 'rgba(19,28,46,0.94)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    padding: POD_PAD,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  // The sliding bubble — a warm accent-tinted capsule that frames icon + label.
  capsule: {
    position: 'absolute',
    left: POD_PAD,
    top: POD_PAD,
    bottom: POD_PAD,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(232,137,74,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(232,137,74,0.32)',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 3 },
  iconWrap: { width: 26, height: 24, alignItems: 'center', justifyContent: 'center' },
  // Micro-glow on the selected icon (web/iOS; a graceful no-op on Android, where
  // the dual-tone fill + capsule still carry the active state).
  iconGlow: { shadowColor: colors.accent, shadowOpacity: 0.9, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } },
  // Micro-label: Inter, tiny + sharp, deliberate letter-spacing.
  label: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.5 },
  labelOn: { color: colors.accent },
  labelOff: { color: colors.textMute },
});
