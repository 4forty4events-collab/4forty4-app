import React from 'react';
import { View, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { BrandLogo } from '../components/common/BrandLogo';

// Legal destinations. PLACEHOLDER URLs — repoint these at the real pages once the
// marketing site publishes them; the rows are already wired.
const TERMS_URL = 'https://4forty4.app/terms';
const PRIVACY_URL = 'https://4forty4.app/privacy';

// Version + build come from the running app config, so a shipped binary always
// reports its own numbers rather than a hardcoded string that drifts.
function versionInfo() {
  const cfg = Constants.expoConfig ?? {};
  const version = cfg.version ?? '1.0.0';
  const build = cfg.ios?.buildNumber ?? (cfg.android?.versionCode != null ? String(cfg.android.versionCode) : null) ?? '—';
  return { version, build };
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
        {/* Identity block — logo, wordmark, version. */}
        <View style={styles.identity}>
          <BrandLogo variant="symbol" size="lg" style={styles.logo} />
          <AppText variant="title" style={styles.wordmark}>Purday</AppText>
          <AppText variant="label" color={colors.textLo}>One app. Every plan.</AppText>
          <AppText variant="label" color={colors.textLo}>Version {version} · Build {build}</AppText>
        </View>

        {/* Our Mission — PLACEHOLDER copy pending final brand wording. */}
        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>OUR MISSION</AppText>
        <View style={[styles.card, styles.missionCard]}>
          <AppText variant="body" color={colors.textLo} style={styles.body}>
            4Forty4 exists to make going out effortless. We map the places worth your
            evening — the restaurants, the rooftops, the lounges, the things to actually
            do — and turn them into a plan you can follow tonight.
          </AppText>
          <AppText variant="body" color={colors.textLo} style={styles.body}>
            We build for the cities we live in first, with real local listings, honest
            prices and a community that keeps them current.
          </AppText>
        </View>

        {/* Legal */}
        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>LEGAL</AppText>
        <View style={styles.card}>
          <LinkRow label="Terms of Service" description="The rules for using 4Forty4" onPress={() => Linking.openURL(TERMS_URL)} />
          <View style={styles.divider} />
          <LinkRow label="Privacy Policy" description="What we collect, and why" onPress={() => Linking.openURL(PRIVACY_URL)} />
        </View>

        {/* Support */}
        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>SUPPORT</AppText>
        <View style={styles.card}>
          <LinkRow label="Help & Support" description="FAQs and contact" onPress={() => navigation.navigate('Support')} />
        </View>

        <AppText variant="caption" color={colors.textMute} style={styles.copyright}>
          © {year} 4Forty4. All rights reserved.
        </AppText>
        <View style={{ height: space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  content: { padding: space.base, paddingBottom: space.huge },

  identity: { alignItems: 'center', paddingVertical: space.xl, gap: 6 },
  // Bare mark on transparency — no container, so no radius or background of its
  // own. Sized to the asset's 432x500 canvas so `contain` doesn't letterbox it.
  // Size comes from BrandLogo's `lg` preset; only spacing is set here.
  logo: { marginBottom: space.sm },
  wordmark: { letterSpacing: 0.5 },

  sectionLabel: { marginTop: space.lg, marginBottom: space.sm },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  missionCard: { paddingBottom: 14 },
  body: { lineHeight: 21, paddingHorizontal: 14, paddingTop: 14 },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14, paddingHorizontal: 14 },
  linkText: { flex: 1 },
  linkDesc: { marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 14 },

  copyright: { marginTop: space.xl, textAlign: 'center' },
});
