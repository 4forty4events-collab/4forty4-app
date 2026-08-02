import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { categoryLabel, CATEGORY_COLORS } from '../../lib/categories';
import { AppText, colors, space, radius } from '../../lib/theme';

// The Passport — what a Purday profile is instead of a follower count. ("Explorer"
// survives as the person and the level, not as a prefix on the object: your Passport
// shows your Explorer Level.)
//
// Opening someone's profile should answer "how does this person experience the world?",
// not "how popular are they?". Every figure here is derived from real rows by the
// explorer_passport RPC; a stat with nothing behind it is HIDDEN rather than shown as a
// zero, because a passport full of noughts reads as failure instead of "new explorer".
//
// The one number that carries weight is verified experiences: those were confirmed by
// the server at the moment of posting and cannot be self-declared.

const PASSPORT_GRADIENT = ['#16233C', '#1B2740', '#101A2C'];

// Screen readers get "12 verified experiences", not a bare number floating next to a
// truncated label.
function Stat({ value, label, a11y }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={a11y ?? `${value} ${label}`}>
      <AppText variant="title" color={colors.textHi} style={styles.statValue}>{value}</AppText>
      <AppText variant="caption" color={colors.textLo}>{label}</AppText>
    </View>
  );
}

function Row({ label, children }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" color={colors.textMute} style={styles.rowLabel}>{label}</AppText>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

export function Passport({ passport, name, loading }) {
  if (loading || !passport) return null;

  const {
    level = 1, experiences = 0, verified = 0, cities = [], categories = [],
    streakWeeks = 0, blueprints = 0, clones = 0, helpful = 0, answers = 0, outings = 0,
  } = passport;

  // A brand-new explorer still gets a passport — it just says so, honestly, instead of
  // rendering a grid of zeroes.
  const isNew = experiences === 0 && outings === 0 && blueprints === 0;

  return (
    <View style={styles.card}>
      <LinearGradient colors={PASSPORT_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      <View style={styles.head}>
        <AppText variant="caption" color={colors.accent} style={styles.eyebrow}>PASSPORT</AppText>
        <View style={styles.levelPill} accessible accessibilityLabel={`Explorer level ${level}`}>
          <AppText variant="caption" color={colors.onAccent}>EXPLORER LEVEL {level}</AppText>
        </View>
      </View>
      {name ? <AppText variant="title" color={colors.textHi} style={styles.name} numberOfLines={1}>{name}</AppText> : null}

      {isNew ? (
        <AppText variant="body" color={colors.textLo} style={styles.newText}>
          Hasn’t explored yet. A passport fills up with verified experiences, outings and blueprints.
        </AppText>
      ) : (
        <>
          <View style={styles.stats}>
            {verified > 0 ? (
              <Stat value={verified} label="Verified" a11y={`${verified} verified ${verified === 1 ? 'experience' : 'experiences'}`} />
            ) : null}
            {experiences > 0 ? <Stat value={experiences} label="Experiences" /> : null}
            {outings > 0 ? <Stat value={outings} label="Outings" /> : null}
            {cities.length > 0 ? (
              <Stat value={cities.length} label={cities.length === 1 ? 'City' : 'Cities'} a11y={`${cities.length} cities explored`} />
            ) : null}
          </View>

          {cities.length > 0 ? (
            <Row label="CITIES EXPLORED">
              <AppText variant="label" color={colors.textHi} numberOfLines={2}>{cities.join('  ·  ')}</AppText>
            </Row>
          ) : null}

          {categories.length > 0 ? (
            <Row label="FAVORITE CATEGORIES">
              <View style={styles.chips}>
                {categories.map((c) => {
                  const tint = CATEGORY_COLORS[c] ?? CATEGORY_COLORS.other;
                  return (
                    <View key={c} style={[styles.chip, { borderColor: `${tint}88` }]}>
                      <AppText variant="caption" color={colors.textHi}>{categoryLabel(c)}</AppText>
                    </View>
                  );
                })}
              </View>
            </Row>
          ) : null}

          {streakWeeks > 1 ? (
            <Row label="EXPLORATION STREAK">
              <AppText variant="label" color={colors.accent}>
                Exploring {streakWeeks} weeks running
              </AppText>
            </Row>
          ) : null}

          {blueprints > 0 ? (
            <Row label="PUBLIC BLUEPRINTS">
              <AppText variant="label" color={colors.textHi}>
                {blueprints} shared{clones > 0 ? ` · copied ${clones}×` : ''}
              </AppText>
            </Row>
          ) : null}

          {/* Two different things, kept apart rather than blended into one flattering
              number: replies they wrote, and helpful marks their reviews received. */}
          {answers > 0 ? (
            <Row label="HELPFUL REPLIES">
              <AppText variant="label" color={colors.textHi}>{answers} answered</AppText>
            </Row>
          ) : null}

          {helpful > 0 ? (
            <Row label="TRUSTED BY">
              <AppText variant="label" color={colors.textHi}>{helpful} helpful marks</AppText>
            </Row>
          ) : null}
        </>
      )}
    </View>
  );
}

// The progression ladder, shown to the viewer about THEMSELVES. Framed as progress, not
// punishment — the app is asking you to go outside, not withholding a feature.
export function PassportUnlocks({ passport }) {
  if (!passport) return null;
  const { credits = 0, unlocks = {} } = passport;
  const steps = [
    { at: 1, label: 'Explorer Chat', on: unlocks.chat },
    { at: 5, label: 'Create groups', on: unlocks.groups },
    { at: 20, label: 'Host public meetups', on: unlocks.meetups },
  ];
  const next = steps.find((s) => !s.on);

  return (
    <View style={styles.unlockCard}>
      <AppText variant="caption" color={colors.textMute} style={styles.eyebrow}>PROGRESSION</AppText>
      {steps.map((s) => (
        <View
          key={s.label}
          style={styles.unlockRow}
          accessible
          accessibilityLabel={`${s.label}: ${s.on ? 'unlocked' : `locked, needs ${s.at} credits`}`}
        >
          <AppText style={styles.unlockGlyph}>{s.on ? '✓' : '○'}</AppText>
          <AppText variant="label" color={s.on ? colors.textHi : colors.textMute} style={styles.unlockLabel}>{s.label}</AppText>
          <AppText variant="caption" color={colors.textMute}>{s.at}</AppText>
        </View>
      ))}
      <AppText variant="caption" color={colors.textLo} style={styles.unlockHint}>
        {next
          ? `${credits} of ${next.at} — a verified experience or a completed outing counts.`
          : 'Everything unlocked. Go host something.'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', padding: space.base, borderWidth: 1, borderColor: colors.line, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { letterSpacing: 1.2 },
  levelPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 10 },
  name: { fontSize: 22 },
  newText: { lineHeight: 20, marginTop: 2 },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, marginTop: space.xs },
  stat: { gap: 1 },
  statValue: { fontSize: 22 },

  row: { marginTop: space.sm, gap: 3 },
  rowLabel: { letterSpacing: 1 },
  rowBody: {},
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },

  unlockCard: { borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, padding: space.base, gap: 6 },
  unlockRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  unlockGlyph: { width: 16, color: colors.accent, fontSize: 13 },
  unlockLabel: { flex: 1 },
  unlockHint: { marginTop: 4, lineHeight: 17 },
});
