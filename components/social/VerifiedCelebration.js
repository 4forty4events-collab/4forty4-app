import React, { useEffect, useRef } from 'react';
import { View, Modal, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { usePassport } from '../../lib/social/hooks';
import { AppText, colors, space, radius, useReducedMotion } from '../../lib/theme';
import { Icon } from '../ui/Icon';

// The moment a Live claim is confirmed — the one thing in Purday you can genuinely earn.
//
// Everything on this screen is a FACT, read back from the server after the write:
//   · the verdict came from create_experience_post, not from the client
//   · the level and count come from the passport RPC, re-fetched after the post landed
//   · "nearby explorers can discover this" is literally true — the row now qualifies for
//     live_pulse and the Live feed
//
// There is deliberately no XP counter. Purday has no XP ledger to increment, and a
// number that only exists to feel rewarding is the kind of thing this product doesn't
// do. Level is real and derived; it moves when the underlying work does.
const LIVE = '#22C55E';

export function VerifiedCelebration({ visible, userId, placeName, onDone }) {
  const reduced = useReducedMotion();
  const { data: passport } = usePassport(userId);
  const stamp = useRef(new Animated.Value(0)).current;
  const body = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { stamp.setValue(0); body.setValue(0); return undefined; }
    if (reduced) { stamp.setValue(1); body.setValue(1); return undefined; }
    // The stamp lands first and settles; the detail lines follow it in. Passport-stamp
    // timing: a firm press, not a bounce.
    const anim = Animated.sequence([
      Animated.timing(stamp, { toValue: 1, duration: 340, easing: Easing.out(Easing.back(1.7)), useNativeDriver: true }),
      Animated.timing(body, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [visible, reduced, stamp, body]);

  if (!visible) return null;

  const stampStyle = reduced ? {} : {
    opacity: stamp,
    transform: [
      { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
      { rotate: stamp.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '-6deg'] }) },
    ],
  };
  const bodyStyle = reduced ? {} : {
    opacity: body,
    transform: [{ translateY: body.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <Pressable style={styles.backdrop} onPress={onDone} accessibilityRole="button" accessibilityLabel="Dismiss">
        <View style={styles.sheet}>
          <Animated.View style={[styles.stamp, stampStyle]}>
            <Icon name="check" size={30} color={LIVE} strokeWidth={2.6} />
          </Animated.View>

          <AppText variant="title" color={colors.textHi} style={styles.title}>Experience verified</AppText>

          <Animated.View style={[styles.body, bodyStyle]}>
            {placeName ? (
              <AppText variant="body" color={colors.textLo} style={styles.line}>
                We confirmed you at <AppText variant="bodySemi" color={colors.textHi}>{placeName}</AppText>.
              </AppText>
            ) : null}

            {passport ? (
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <AppText variant="title" color={colors.accent}>{passport.level}</AppText>
                  <AppText variant="caption" color={colors.textMute}>Explorer level</AppText>
                </View>
                <View style={styles.stat}>
                  <AppText variant="title" color={LIVE}>{passport.verified}</AppText>
                  <AppText variant="caption" color={colors.textMute}>Verified</AppText>
                </View>
                {passport.cities?.length ? (
                  <View style={styles.stat}>
                    <AppText variant="title" color={colors.accent2}>{passport.cities.length}</AppText>
                    <AppText variant="caption" color={colors.textMute}>Cities</AppText>
                  </View>
                ) : null}
              </View>
            ) : null}

            <AppText variant="caption" color={colors.textLo} style={styles.line}>
              Passport updated. Explorers nearby can discover this while it’s live.
            </AppText>

            <Pressable style={styles.doneBtn} onPress={onDone} accessibilityRole="button">
              <AppText variant="label" color={colors.onAccent}>Done</AppText>
            </Pressable>
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,10,18,0.82)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: {
    width: '100%', maxWidth: 380, alignItems: 'center', padding: space.xl, gap: space.sm,
    borderRadius: radius.xl, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)',
  },
  stamp: {
    width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: LIVE, backgroundColor: 'rgba(34,197,94,0.12)', marginBottom: space.xs,
  },
  title: { fontSize: 22, textAlign: 'center' },
  body: { alignItems: 'center', gap: space.md, alignSelf: 'stretch' },
  line: { textAlign: 'center', lineHeight: 20 },
  statRow: { flexDirection: 'row', justifyContent: 'center', gap: space.xl, marginTop: space.xs },
  stat: { alignItems: 'center', gap: 1 },
  doneBtn: { marginTop: space.xs, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 32 },
});
