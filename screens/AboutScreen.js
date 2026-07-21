import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Linking, StyleSheet, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Defs, LinearGradient as SvgLinearGradient, RadialGradient, Stop, Rect, Text as SvgText } from 'react-native-svg';
import { AppText, colors, space, radius, fonts, useReducedMotion } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { BrandLogo } from '../components/common/BrandLogo';
import { supabase } from '../lib/supabase';

// Owner mark for the footer. Uses the light-text variant — the charcoal "4FORTY4"
// recolored to near-white, red star + "EVENTS" preserved — so it reads on the dark
// background with no chip. Rendered via expo-image, not RN Image, for the same
// reason BrandLogo is (core <Image> hangs on Metro-served assets in Expo Go iOS).
const EVENTS_LOGO = require('../assets/brand/events-logo-light.png');

// Legal destinations. PLACEHOLDER URLs — repoint these at the real pages once the
// marketing site publishes them; the rows are already wired.
const TERMS_URL = 'https://4forty4.app/terms';
const PRIVACY_URL = 'https://4forty4.app/privacy';

// About-only surface palette — one notch deeper than the global tokens so the
// cards lift off the page with a soft shadow instead of a flat hairline.
const ABOUT_BG = '#08111F';
const CARD_BG = '#121B2C';
const CARD_BORDER = 'rgba(255,255,255,0.06)';
// Brand gradient sampled from the Purday mark: warm orange → magenta → violet.
const BRAND_STOPS = ['#FF8A3D', '#FF2E7E', '#8A3BE2'];

// A different line greets you most visits — tiny bit of personality under the mark.
const VIBES = [
  'Made for explorers.',
  'Designed for unforgettable nights.',
  'Every city has a story.',
  "Discover what's worth leaving home for.",
  'Find your next favorite place.',
];

// Version + build come from the running app config, so a shipped binary always
// reports its own numbers rather than a hardcoded string that drifts.
function versionInfo() {
  const cfg = Constants.expoConfig ?? {};
  const version = cfg.version ?? '1.0.0';
  const build = cfg.ios?.buildNumber ?? (cfg.android?.versionCode != null ? String(cfg.android.versionCode) : null) ?? 'Dev';
  return { version, build };
}

// Real, lightweight backend health check — a HEAD count on a public table. No
// data leaves the server; we just learn reachable vs not. Never a hardcoded dot.
const STATUS_META = {
  checking: { color: colors.star, label: 'Checking…' },
  operational: { color: colors.success, label: 'Operational' },
  offline: { color: colors.danger, label: 'Unreachable' },
};
function useApiStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let alive = true;
    const probe = supabase
      .from('venues')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
      .then(({ error }) => (error ? 'offline' : 'operational'))
      .catch(() => 'offline');
    const timeout = new Promise((r) => setTimeout(() => r('offline'), 5000));
    Promise.race([probe, timeout]).then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);
  return status;
}

// Mount reveal: fade + a short upward slide, staggered by `delay`. Collapses to an
// instant show when the OS "reduce motion" setting is on.
function Reveal({ delay = 0, reduced, style, children }) {
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const ty = useRef(new Animated.Value(reduced ? 0 : 14)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start();
  }, [reduced]);
  return <Animated.View style={[style, { opacity, transform: [{ translateY: ty }] }]}>{children}</Animated.View>;
}

// Gradient-filled text via SVG (no masked-view dep). One line per array entry so
// nothing has to wrap — SVG text doesn't reflow.
function GradientText({ lines, fontSize = 17, lineHeight = 24, fontFamily = fonts.bodyBold }) {
  return (
    <Svg width="100%" height={lines.length * lineHeight + 4} accessibilityLabel={lines.join(' ')}>
      <Defs>
        <SvgLinearGradient id="brandText" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={BRAND_STOPS[0]} />
          <Stop offset="0.5" stopColor={BRAND_STOPS[1]} />
          <Stop offset="1" stopColor={BRAND_STOPS[2]} />
        </SvgLinearGradient>
      </Defs>
      {lines.map((ln, i) => (
        <SvgText key={i} fill="url(#brandText)" fontFamily={fontFamily} fontSize={fontSize} x="50%" y={i * lineHeight + fontSize + 2} textAnchor="middle">
          {ln}
        </SvgText>
      ))}
    </Svg>
  );
}

// Soft radial brand glow behind the hero card — magenta/violet from the top, a
// warm orange kiss from the lower-left. Purely decorative, never intercepts touch.
function HeroGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glowA" cx="50%" cy="8%" r="80%">
          <Stop offset="0" stopColor="#FF2E7E" stopOpacity="0.30" />
          <Stop offset="0.55" stopColor="#8A3BE2" stopOpacity="0.14" />
          <Stop offset="1" stopColor="#8A3BE2" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glowB" cx="16%" cy="96%" r="60%">
          <Stop offset="0" stopColor="#FF8A3D" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowA)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowB)" />
    </Svg>
  );
}

function SectionLabel({ emoji, children }) {
  return (
    <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>
      {emoji}  {children}
    </AppText>
  );
}

function CreditCard({ icon, label, name, tagline }) {
  return (
    <View style={[styles.card, styles.creditCard]}>
      <View style={styles.creditIcon}>{icon}</View>
      <AppText variant="caption" color={colors.textMute} style={styles.creditKicker}>{label}</AppText>
      <AppText variant="heading" color={colors.textHi} style={styles.creditName}>{name}</AppText>
      <AppText variant="label" color={colors.textLo} style={styles.creditTagline}>{tagline}</AppText>
    </View>
  );
}

function InfoRow({ label, children }) {
  return (
    <View style={styles.infoRow}>
      <AppText variant="label" color={colors.textMute}>{label}</AppText>
      <View style={styles.infoValue}>{children}</View>
    </View>
  );
}

function LinkRow({ label, description, onPress }) {
  return (
    <TouchableOpacity style={styles.linkRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.linkText}>
        <AppText variant="bodySemi">{label}</AppText>
        {description ? <AppText variant="label" color={colors.textLo} style={styles.linkDesc}>{description}</AppText> : null}
      </View>
      <Icon name="chevronRight" size={18} color={colors.textLo} />
    </TouchableOpacity>
  );
}

export default function AboutScreen({ navigation }) {
  const { version, build } = versionInfo();
  const year = new Date().getFullYear();
  const reduced = useReducedMotion();
  const vibe = useMemo(() => VIBES[Math.floor(Math.random() * VIBES.length)], []);
  const apiStatus = useApiStatus();
  const status = STATUS_META[apiStatus];
  const sdk = Constants.expoConfig?.sdkVersion ?? '54.0.0';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <AppText variant="label" color={colors.textHi}>‹ Back</AppText>
        </TouchableOpacity>
        <AppText variant="heading">About</AppText>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Identity — mark, wordmark, a rotating line, and the version pill. */}
        <Reveal reduced={reduced} style={styles.identity}>
          <BrandLogo variant="symbol" size="lg" style={styles.logo} />
          <AppText variant="title" style={styles.wordmark}>Purday</AppText>
          <AppText variant="label" color={colors.textLo}>{vibe}</AppText>
          <View style={styles.pill}>
            <AppText variant="label" color={colors.textLo}>Version {version}</AppText>
          </View>
        </Reveal>

        {/* Visual identity card — the page centerpiece, brand glow behind it. */}
        <Reveal reduced={reduced} delay={80}>
          <View style={styles.heroShadow}>
            <View style={styles.heroClip}>
              <HeroGlow />
              <View style={styles.heroInner}>
                <AppText variant="title" color={colors.textHi} style={styles.heroTitle}>Your City. Reimagined.</AppText>
                <AppText variant="body" color={colors.textLo} style={styles.heroBody}>
                  Discover exceptional places, unforgettable experiences, and exclusive events, all curated in one beautifully designed app.
                </AppText>
                <AppText variant="bodySemi" color={colors.textHi} style={styles.heroTagline}>One app. Every plan.</AppText>
              </View>
            </View>
          </View>
        </Reveal>

        {/* Our Mission — broken into a lead, two paragraphs, and a gradient close. */}
        <Reveal reduced={reduced} delay={140}>
          <SectionLabel emoji="✨">OUR MISSION</SectionLabel>
          <View style={[styles.card, styles.missionCard]}>
            <AppText variant="heading" color={colors.textHi} style={styles.missionLead}>Life happens outside.</AppText>
            <AppText variant="body" color={colors.textLo} style={styles.body}>
              Purday is your gateway to the very best your city has to offer. Discover exceptional restaurants, cafés,
              rooftops, nightlife, attractions, hidden gems, and unforgettable experiences, all thoughtfully curated in
              one beautifully designed app.
            </AppText>
            <AppText variant="body" color={colors.textLo} style={styles.body}>
              Whether you're planning a spontaneous meetup, a romantic date, or an unforgettable night out, Purday
              transforms endless searching into effortless planning. Get plugged into the exclusive events you've been
              craving, uncover places only locals know, and turn every outing into a story worth telling.
            </AppText>
            <View style={styles.missionPunch}>
              <GradientText lines={['Spend less time searching.', 'More time living.']} />
            </View>
          </View>
        </Reveal>

        {/* Credits — two typographic cards, no logo. */}
        <Reveal reduced={reduced} delay={200}>
          <SectionLabel emoji="🏢">CREDITS</SectionLabel>
          <View style={styles.creditRowWrap}>
            <CreditCard
              icon={<Icon name="code" size={24} color={colors.accent2} />}
              label="BUILT BY"
              name="4Forty4 Developers"
              tagline="Designed and engineered with passion."
            />
            <CreditCard
              icon={<Icon name="spark" size={24} color={colors.accent} fill />}
              label="OWNED BY"
              name="4Forty4 Events"
              tagline="Creating unforgettable experiences."
            />
          </View>
        </Reveal>

        {/* Legal */}
        <Reveal reduced={reduced} delay={260}>
          <SectionLabel emoji="📜">LEGAL</SectionLabel>
          <View style={styles.card}>
            <LinkRow label="Terms of Service" description="The rules for using Purday" onPress={() => Linking.openURL(TERMS_URL)} />
            <View style={styles.divider} />
            <LinkRow label="Privacy Policy" description="What we collect, and why" onPress={() => Linking.openURL(PRIVACY_URL)} />
          </View>
        </Reveal>

        {/* Support */}
        <Reveal reduced={reduced} delay={300}>
          <SectionLabel emoji="🛟">SUPPORT</SectionLabel>
          <View style={styles.card}>
            <LinkRow label="Help & Support" description="FAQs and contact" onPress={() => navigation.navigate('Support')} />
          </View>
        </Reveal>

        {/* Platform info — real values + a live backend status dot. */}
        <Reveal reduced={reduced} delay={340}>
          <SectionLabel emoji="🧭">PLATFORM</SectionLabel>
          <View style={styles.card}>
            <InfoRow label="Version"><AppText variant="label" color={colors.textHi}>{version}</AppText></InfoRow>
            <View style={styles.divider} />
            <InfoRow label="Build"><AppText variant="label" color={colors.textHi}>{build}</AppText></InfoRow>
            <View style={styles.divider} />
            <InfoRow label="Runtime"><AppText variant="label" color={colors.textHi}>Expo SDK {sdk}</AppText></InfoRow>
            <View style={styles.divider} />
            <InfoRow label="Platform"><AppText variant="label" color={colors.textHi}>{Platform.OS} {String(Platform.Version)}</AppText></InfoRow>
            <View style={styles.divider} />
            <InfoRow label="API Status">
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <AppText variant="label" color={colors.textHi}>{status.label}</AppText>
            </InfoRow>
          </View>
        </Reveal>

        {/* Footer — small owner mark + startup sign-off. */}
        <Reveal reduced={reduced} delay={380}>
          <View style={styles.footer}>
            <ExpoImage source={EVENTS_LOGO} style={styles.footerLogo} contentFit="contain" accessible accessibilityRole="image" accessibilityLabel="4Forty4 Events" />
            <AppText variant="label" color={colors.textLo} style={styles.footerLine}>Made with ❤️ by 4Forty4 Developers</AppText>
            <AppText variant="caption" color={colors.textMute} style={styles.footerCopy}>© {year} 4Forty4 Events</AppText>
          </View>
        </Reveal>

        <View style={{ height: space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Shared soft-shadow lift for the cards (item: give the cards depth).
const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.28,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
};

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: ABOUT_BG },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  content: { padding: space.base, paddingBottom: space.huge },

  identity: { alignItems: 'center', paddingTop: space.lg, paddingBottom: space.base, gap: 6 },
  // Bare mark on transparency. Hero size for the identity block; keeps the mark's
  // 432x500 (0.864) aspect so `contain` doesn't letterbox it.
  logo: { width: 108, height: 125, marginBottom: space.sm },
  wordmark: { letterSpacing: 0.5 },
  pill: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: CARD_BORDER },

  // Card base: deeper fill + faint white border + soft shadow for depth.
  card: { backgroundColor: CARD_BG, borderRadius: radius.lg, borderWidth: 1, borderColor: CARD_BORDER, ...cardShadow },

  // Hero: outer holds the shadow (no clip), inner clips the radial glow to the radius.
  heroShadow: { borderRadius: radius.xl, marginTop: space.sm, ...cardShadow },
  heroClip: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER },
  heroInner: { paddingVertical: space.xl, paddingHorizontal: space.lg, alignItems: 'center', gap: space.sm },
  heroTitle: { textAlign: 'center' },
  heroBody: { textAlign: 'center', lineHeight: 22 },
  heroTagline: { textAlign: 'center', letterSpacing: 0.3, marginTop: 2 },

  sectionLabel: { marginTop: space.xl, marginBottom: space.sm },

  missionCard: { padding: 16, gap: 12 },
  missionLead: { marginBottom: 2 },
  body: { lineHeight: 22 },
  missionPunch: { marginTop: 4, alignSelf: 'stretch' },

  creditRowWrap: { flexDirection: 'row', gap: space.md },
  creditCard: { flex: 1, alignItems: 'center', paddingVertical: space.lg, paddingHorizontal: space.md, gap: 4 },
  creditIcon: { marginBottom: 6 },
  creditKicker: {},
  creditName: { textAlign: 'center', marginTop: 2 },
  creditTagline: { textAlign: 'center', lineHeight: 18, marginTop: 2 },

  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14 },
  infoValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14, paddingHorizontal: 14 },
  linkText: { flex: 1 },
  linkDesc: { marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: CARD_BORDER, marginLeft: 14 },

  footer: { alignItems: 'center', marginTop: space.xxl, gap: 8 },
  // Light-text mark on transparency (no chip) with a soft red brand glow (no offset
  // = even halo). Sized to the asset's 819x657 (1.247) aspect so contain is crisp.
  footerLogo: { width: 55, height: 44, marginBottom: 8, shadowColor: '#FF3B30', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  footerLine: { textAlign: 'center' },
  footerCopy: { textAlign: 'center' },
});
