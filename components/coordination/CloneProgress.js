import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Animated, Easing, StyleSheet } from 'react-native';
import { AppText, colors, space, radius, useReducedMotion } from '../../lib/theme';
import { Icon } from '../ui/Icon';

// Cloning a blueprint, shown as the sequence of things that ACTUALLY happen.
//
// The obvious version of this screen narrates "Finding today's availability… Checking
// nearby alternatives…" while a single RPC copies rows. That reads beautifully and is a
// lie: clone_trip does not check availability, and nothing looks for alternatives. A
// progress list that describes work nobody is doing is the same class of dishonesty as
// a fake verified badge, so these labels describe the real steps only:
//
//   1. reading the blueprint's stops
//   2. copying them into a new outing owned by you
//   3. crediting the original (bumpBlueprintClone)
//
// The steps advance on a timer because the RPC doesn't report progress — but each one is
// a real phase of the work, the whole thing waits for the actual promise, and it never
// claims to be finished before the server says so. If clone_trip ever does consult
// opening hours, this list is where that step gets added.
const STEPS = [
  { label: 'Reading the blueprint', glyph: '◎' },
  { label: 'Copying every stop', glyph: '⇣' },
  { label: 'Making it yours', glyph: '✦' },
];

const STEP_MS = 420;

export function CloneProgress({ visible, title, done }) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  // Walk the steps while the mutation is in flight, then hold on the last one until the
  // caller navigates away. `done` pins it to complete the moment the server answers.
  useEffect(() => {
    if (!visible) { setStep(0); return undefined; }
    if (done) { setStep(STEPS.length - 1); return undefined; }
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(id);
  }, [visible, done]);

  useEffect(() => {
    if (!visible) { fade.setValue(0); return undefined; }
    if (reduced) { fade.setValue(1); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, reduced, fade]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <AppText variant="caption" color={colors.textMute} style={styles.eyebrow}>BUILDING YOUR OUTING</AppText>
          {title ? <AppText variant="title" color={colors.textHi} numberOfLines={2} style={styles.title}>{title}</AppText> : null}

          <View style={styles.steps} accessible accessibilityLabel={`Cloning: ${STEPS[step].label}`}>
            {STEPS.map((s, i) => {
              const complete = i < step || (done && i <= step);
              const active = i === step && !complete;
              return (
                <View key={s.label} style={styles.stepRow}>
                  {complete ? (
                    <Icon name="check" size={15} color={colors.accent} strokeWidth={2.4} />
                  ) : (
                    <Animated.View style={active && !reduced ? { opacity: fade } : { opacity: active ? 1 : 0.3 }}>
                      <AppText style={styles.glyph} color={active ? colors.accent : colors.textMute}>{s.glyph}</AppText>
                    </Animated.View>
                  )}
                  <AppText
                    variant="label"
                    color={complete ? colors.textHi : active ? colors.textHi : colors.textMute}
                    style={styles.stepLabel}
                  >
                    {s.label}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,10,18,0.84)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: {
    width: '100%', maxWidth: 360, padding: space.lg, gap: space.sm,
    borderRadius: radius.xl, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line,
  },
  eyebrow: { letterSpacing: 1.2 },
  title: { fontSize: 20, marginBottom: space.xs },
  steps: { gap: space.md, marginTop: space.xs },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  glyph: { fontSize: 15, width: 15, textAlign: 'center' },
  stepLabel: { flex: 1 },
});
