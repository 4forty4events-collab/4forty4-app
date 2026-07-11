import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, TextInput, Animated, Easing,
  ActivityIndicator, StyleSheet, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Scrim } from '../ui/Scrim';
import { Icon } from '../ui/Icon';
import { colors, space, radius, fonts, useReducedMotion } from '../../lib/theme';

// ── The 4Forty4 Drop hero ────────────────────────────────────────────────────────────
// The most-anticipated slot of The Daily Pulse. Three lifecycles over ONE mounted card:
//   teaser   — veiled details, ticking countdown, "remind me"
//   live     — details revealed, neon aura pulses, 44-allocation meter, CLAIM button
//   aftermath— desaturated, "claimed out in Xm", SMS priority waitlist
// The poster image never unmounts across the teaser->live boundary; only overlay opacity
// and a reveal spring animate, so the zero-second flip is seamless (see notes at bottom).

const ALLOC = 44;

function pad(n) { return String(n).padStart(2, '0'); }
function splitCountdown(ms) {
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
function claimedSpeed(dropAt, soldOutAt) {
  if (!dropAt || !soldOutAt) return null;
  const ms = new Date(soldOutAt).getTime() - new Date(dropAt).getTime();
  if (ms <= 0) return 'in seconds';
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  if (min <= 0) return `in ${sec}s`;
  return `in ${min}m ${pad(sec)}s`;
}

function Poster({ uri, muted }) {
  if (!uri) return <View style={[StyleSheet.absoluteFill, styles.posterFallback]} />;
  return (
    <>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {muted && <View style={[StyleSheet.absoluteFill, styles.grayVeil]} pointerEvents="none" />}
    </>
  );
}

// A single countdown cell (value over a small label).
function TimeCell({ value, label }) {
  return (
    <View style={styles.timeCell}>
      <Text style={styles.timeVal}>{pad(value)}</Text>
      <Text style={styles.timeLabel}>{label}</Text>
    </View>
  );
}

// The neon aura — a border-glow ring that breathes. Two moods: a slow, hypnotic cool
// breath while veiled (teaser), and an energetic warm pulse once live. All on the native
// driver (opacity only) so it never touches the JS thread while the feed scrolls.
function NeonAura({ mode }) { // 'teaser' | 'live' | null
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(mode === 'live' ? 1 : 0.4)).current;
  useEffect(() => {
    if (!mode || reduced) { a.setValue(mode ? (mode === 'live' ? 1 : 0.45) : 0); return undefined; }
    const [lo, hi, dur] = mode === 'live' ? [0.35, 1, 850] : [0.14, 0.5, 2100];
    a.setValue(lo);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: hi, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(a, { toValue: lo, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [mode, reduced, a]);
  if (!mode) return null;
  const glow = mode === 'live' ? colors.accent : colors.accent2;
  return <Animated.View pointerEvents="none" style={[styles.aura, { opacity: a, borderColor: glow, shadowColor: glow }]} />;
}

// The LIVE badge blinks urgently — a hard, attention-grabbing on/off pulse (native driver).
function LiveBadge() {
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.3, duration: 560, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, a]);
  return (
    <Animated.View style={[styles.badgeGlass, styles.badgeLive, { opacity: a }]}>
      <View style={styles.liveDot} /><Text style={styles.badgeTextLive}>LIVE NOW</Text>
    </Animated.View>
  );
}

// The depleting 44-allocation meter — the bar shrinks as spots are claimed, live.
function AllocationMeter({ remaining, allocation }) {
  const reduced = useReducedMotion();
  const w = useRef(new Animated.Value(remaining / allocation)).current;
  useEffect(() => {
    const to = Math.max(0, Math.min(1, remaining / allocation));
    if (reduced) { w.setValue(to); return; }
    Animated.timing(w, { toValue: to, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [remaining, allocation, reduced, w]);
  const pct = w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const low = remaining <= 8;
  return (
    <View style={styles.meterBlock}>
      <View style={styles.meterHeadRow}>
        <Text style={styles.meterCount}>{remaining}<Text style={styles.meterOf}> / {allocation} left</Text></Text>
        {low && remaining > 0 && <Text style={styles.meterLow}>ALMOST GONE</Text>}
      </View>
      <View style={styles.meterTrack}>
        <Animated.View style={[styles.meterFillWrap, { width: pct }]}>
          <LinearGradient
            colors={low ? [colors.danger, colors.accent] : [colors.accent2, colors.accent]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

export function DropHero({ state, onPressDetail, flush }) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { drop, phase, msRemaining, remaining, claiming, claimResult, actionError, claim, remind, waitlist } = state;

  const reveal = useRef(new Animated.Value(0)).current; // 0 = veiled, 1 = revealed
  const [reminded, setReminded] = useState(false);
  const [phone, setPhone] = useState('');
  const [waitlisted, setWaitlisted] = useState(false);

  // Drive the reveal from the phase. teaser keeps it at 0; live/aftermath spring it to 1.
  useEffect(() => {
    if (!phase) return;
    const to = phase === 'teaser' ? 0 : 1;
    if (reduced) { reveal.setValue(to); return; }
    Animated.timing(reveal, { toValue: to, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [phase, reduced, reveal]);

  if (!drop || !phase) return null;

  const height = Math.round(width * 1.12);
  const veilOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const cd = splitCountdown(msRemaining);
  const soldOut = phase === 'aftermath';

  const onRemind = async () => { const ok = await remind(); setReminded(ok); };
  const onWaitlist = async () => {
    const ok = await waitlist(phone.trim());
    if (ok) { setWaitlisted(true); setPhone(''); }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.kicker, flush && styles.flushX]}>
        <View style={styles.kickerDot} />
        <Text style={styles.kickerText}>THE 4FORTY4 DROP</Text>
      </View>

      <View style={[styles.card, { height }, flush && styles.flushX]}>
        <Poster uri={drop.coverImageUrl} muted={soldOut} />
        <Scrim colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.96)']} locations={[0, 0.45, 1]} />
        <NeonAura mode={soldOut ? null : phase} />

        {/* Top ribbon — state badge */}
        <View style={styles.topRow}>
          {phase === 'teaser' && (
            <View style={styles.badgeGlass}><Icon name="clock" size={13} color={colors.textHi} /><Text style={styles.badgeText}>DROPPING SOON</Text></View>
          )}
          {phase === 'live' && <LiveBadge />}
          {soldOut && (
            <View style={[styles.badgeGlass, styles.badgeGone]}><Text style={styles.badgeTextGone}>SOLD OUT</Text></View>
          )}
        </View>

        {/* ── LIVE / AFTERMATH content (revealed) ───────────────────────────────── */}
        <Animated.View style={[styles.bottom, { opacity: reveal }]} pointerEvents={phase === 'teaser' ? 'none' : 'auto'}>
          {drop.category ? <Text style={styles.cat}>{drop.category.toUpperCase()}</Text> : null}
          <Pressable onPress={() => onPressDetail?.(drop)}>
            <Text style={styles.title} numberOfLines={2}>{drop.title}</Text>
          </Pressable>
          {drop.venueName ? <Text style={styles.venue} numberOfLines={1}>{drop.venueName}</Text> : null}

          {phase === 'live' && (
            <>
              <AllocationMeter remaining={remaining} allocation={drop.allocation ?? ALLOC} />
              {claimResult ? (
                <View style={styles.claimedPill}>
                  <Icon name="check" size={16} color={colors.onAccent} />
                  <Text style={styles.claimedText}>You're in — spot #{claimResult.position} of {drop.allocation ?? ALLOC}</Text>
                </View>
              ) : (
                <Pressable onPress={claim} disabled={claiming} style={({ pressed }) => [styles.claimBtn, pressed && styles.pressed]}>
                  <LinearGradient colors={[colors.accent2, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.claimGrad}>
                    {claiming
                      ? <ActivityIndicator color={colors.onAccent} />
                      : <Text style={styles.claimText}>CLAIM EXCLUSIVE ACCESS</Text>}
                  </LinearGradient>
                </Pressable>
              )}
              {actionError ? <Text style={styles.errText}>{actionError}</Text> : null}
            </>
          )}

          {soldOut && (
            <View style={styles.aftermath}>
              <Text style={styles.soldLine}>
                All {drop.allocation ?? ALLOC} claimed{claimedSpeed(drop.dropAt, drop.soldOutAt) ? ` — ${claimedSpeed(drop.dropAt, drop.soldOutAt)}` : ''}.
              </Text>
              {waitlisted ? (
                <View style={styles.claimedPill}>
                  <Icon name="check" size={16} color={colors.onAccent} />
                  <Text style={styles.claimedText}>On the priority list — we'll text you first.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.waitLabel}>Priority SMS waitlist</Text>
                  <View style={styles.waitRow}>
                    <TextInput
                      style={styles.waitInput}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="Your mobile number"
                      placeholderTextColor={colors.textMute}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                      onSubmitEditing={onWaitlist}
                    />
                    <Pressable onPress={onWaitlist} disabled={phone.trim().length < 6} style={[styles.waitBtn, phone.trim().length < 6 && styles.waitBtnOff]}>
                      <Icon name="send" size={18} color={colors.onAccent} />
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}
        </Animated.View>

        {/* ── TEASER overlay (veiled) — a true native frosted lock over the poster. The
            whole layer's opacity is native-driven, so at zero it cross-fades out to reveal
            the crisp image beneath without ever remounting. Content sits ABOVE the blur. */}
        <Animated.View style={[styles.veil, { opacity: veilOpacity }]} pointerEvents={phase === 'teaser' ? 'auto' : 'none'}>
          <BlurView
            intensity={75}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.veilTint]} pointerEvents="none" />
          <View style={styles.veilInner}>
            <View style={styles.lockRow}><Icon name="star" size={16} color={colors.star} fill /><Text style={styles.veilKicker}>UNLOCKS AT ZERO</Text></View>
            <Text style={styles.veilTeaser} numberOfLines={2}>{drop.teaser ?? 'Something exclusive is about to drop.'}</Text>
            <View style={styles.clockRow}>
              {cd.d > 0 && <><TimeCell value={cd.d} label="DAYS" /><Text style={styles.colon}>:</Text></>}
              <TimeCell value={cd.h} label="HRS" /><Text style={styles.colon}>:</Text>
              <TimeCell value={cd.m} label="MIN" /><Text style={styles.colon}>:</Text>
              <TimeCell value={cd.s} label="SEC" />
            </View>
            <Pressable onPress={onRemind} disabled={reminded} style={({ pressed }) => [styles.remindBtn, pressed && styles.pressed, reminded && styles.remindDone]}>
              <Icon name={reminded ? 'check' : 'bell'} size={16} color={reminded ? colors.accent : colors.textHi} />
              <Text style={[styles.remindText, reminded && styles.remindTextDone]}>{reminded ? 'We’ll remind you' : 'Remind me'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  flushX: { marginHorizontal: 0 }, // carousel controls width; drop the built-in side gutter
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.base, marginBottom: space.sm },
  kickerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.9, shadowRadius: 6, elevation: 6 },
  kickerText: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 3 },

  card: { marginHorizontal: space.base, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated2, justifyContent: 'flex-end' },
  posterFallback: { backgroundColor: colors.bgElevated2 },
  grayVeil: { backgroundColor: 'rgba(20,24,32,0.62)' },
  aura: { ...StyleSheet.absoluteFillObject, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.9, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } },

  topRow: { position: 'absolute', top: space.base, left: space.base, right: space.base, flexDirection: 'row', justifyContent: 'space-between' },
  badgeGlass: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 11 },
  badgeText: { color: colors.textHi, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.4 },
  badgeLive: { backgroundColor: colors.danger, borderColor: colors.danger, shadowColor: colors.danger, shadowOpacity: 0.7, shadowRadius: 12, elevation: 8 },
  badgeTextLive: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  badgeGone: { backgroundColor: 'rgba(0,0,0,0.55)', borderColor: colors.glassBorder },
  badgeTextGone: { color: colors.textLo, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.4 },

  bottom: { padding: space.lg, gap: space.sm },
  cat: { color: colors.textLo, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2 },
  title: { color: '#fff', fontFamily: fonts.display, fontSize: 30, lineHeight: 34 },
  venue: { color: 'rgba(255,255,255,0.82)', fontFamily: fonts.bodySemi, fontSize: 14 },

  meterBlock: { marginTop: space.sm, gap: 7 },
  meterHeadRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  meterCount: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 18 },
  meterOf: { color: 'rgba(255,255,255,0.7)', fontFamily: fonts.bodySemi, fontSize: 13 },
  meterLow: { color: colors.danger, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.4 },
  meterTrack: { height: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  meterFillWrap: { height: '100%', borderRadius: 999, overflow: 'hidden' },

  claimBtn: { marginTop: space.md, borderRadius: radius.pill, overflow: 'hidden', shadowColor: colors.accent, shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  claimGrad: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  claimText: { color: colors.onAccent, fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 1.5 },
  pressed: { opacity: 0.85 },
  claimedPill: { marginTop: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 16 },
  claimedText: { color: colors.onAccent, fontFamily: fonts.bodyBold, fontSize: 14 },
  errText: { color: colors.danger, fontFamily: fonts.bodySemi, fontSize: 13, textAlign: 'center', marginTop: space.xs },

  // Aftermath
  aftermath: { marginTop: space.sm, gap: space.sm },
  soldLine: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.bodySemi, fontSize: 14 },
  waitLabel: { color: colors.textLo, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5, marginTop: 2 },
  waitRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  waitInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.textHi, fontFamily: fonts.bodySemi, fontSize: 15 },
  waitBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  waitBtnOff: { opacity: 0.5 },

  // Teaser veil
  veil: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  veilTint: { backgroundColor: 'rgba(8,12,20,0.42)' }, // contrast wash over the frosted blur
  veilInner: { padding: space.lg, gap: space.md },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  veilKicker: { color: colors.star, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2 },
  veilTeaser: { color: '#fff', fontFamily: fonts.display, fontSize: 24, lineHeight: 29 },
  clockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  timeCell: { alignItems: 'center', minWidth: 46, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 6 },
  timeVal: { color: '#fff', fontFamily: fonts.display, fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'], textShadowColor: colors.accent2, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  timeLabel: { color: colors.textLo, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.2, marginTop: 2 },
  colon: { color: 'rgba(255,255,255,0.5)', fontFamily: fonts.display, fontSize: 26, lineHeight: 44 },
  remindBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: 18 },
  remindText: { color: colors.textHi, fontFamily: fonts.bodyBold, fontSize: 14 },
  remindDone: { borderColor: colors.accent },
  remindTextDone: { color: colors.accent },
});
