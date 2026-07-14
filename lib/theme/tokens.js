// Dark cinematic design tokens — the single source of truth for the redesign.
// Presentation only. Every screen/component composes from here; no per-screen
// one-off hex or font strings. Dark is the only theme (by design), so this is a
// plain module, not a context — cheapest possible read at render time.

export const colors = {
  bgBase: '#0B1220', // deep Mediterranean night-blue (near-black, blue not gray)
  bgElevated: '#131C2E', // cards / sheets / composer — one step up from base
  bgElevated2: '#1B2740', // pressed / nested surface
  line: '#1F2A3C', // hairline borders — elevation on dark reads as border, not shadow

  textHi: '#F2F4F8', // primary (~15:1 on base)
  textLo: '#9AA6B8', // secondary / caption (~6.3:1)
  textMute: '#6B7890', // disabled / tertiary

  accent: '#E8894A', // warm Algerian light — ONE moment per screen
  accentPress: '#CE7538',
  onAccent: '#0B1220', // text/icon on an accent fill (dark, for contrast on warm)
  accent2: '#4FA3C7', // sea-blue — links, secondary highlight
  accent2Press: '#3E8AAB',

  danger: '#E5605E',
  success: '#4FBE8F',
  star: '#F0B54A', // rating gold

  // Feed / hero image scrims (bottom-up 3-stop) and floating pill backgrounds.
  scrimTop: 'rgba(11,18,32,0)',
  scrimMid: 'rgba(11,18,32,0.35)',
  scrimBottom: 'rgba(11,18,32,0.94)',
  glass: 'rgba(11,18,32,0.55)', // floating chips over photography
  glassBorder: 'rgba(242,244,248,0.14)',
};

export const space = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, huge: 48 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const motion = { fast: 120, base: 220, slow: 360 };

// One stroke weight for the whole bespoke icon system (Icon.js + NavIcons.js), so
// the header marks and the nav pod can never visually drift apart.
export const strokeW = 1.75;

// Custom fonts: each weight is its own family (fontWeight is a no-op with loaded
// TTFs), so we reference families explicitly. Keys mirror the useFonts map in App.js.
export const fonts = {
  display: 'Fraunces_700Bold', // venue names, hero, screen titles
  displaySemi: 'Fraunces_600SemiBold', // section headers
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  arabic: 'IBMPlexSansArabic_400Regular',
  arabicSemi: 'IBMPlexSansArabic_600SemiBold',
  arabicBold: 'IBMPlexSansArabic_700Bold',
};

// Type scale: 34 / 24 / 18 / 15 / 13 / 11 with intentional families.
export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40 },
  title: { fontFamily: fonts.displaySemi, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.displaySemi, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.body, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyMed: { fontFamily: fonts.bodyMed, fontSize: 15, lineHeight: 22 },
  bodySemi: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14, letterSpacing: 0.5 },
  num: { fontFamily: fonts.bodySemi, fontSize: 14, fontVariant: ['tabular-nums'] },
};

// Arabic (U+0600–06FF etc.) has no Latin-display equivalent in Fraunces, so Arabic
// strings route to IBM Plex Sans Arabic at a matching weight. No RTL flip (spec).
export const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

const ARABIC_FOR = {
  display: fonts.arabicBold,
  title: fonts.arabicBold,
  heading: fonts.arabicSemi,
  bodyLg: fonts.arabic,
  body: fonts.arabic,
  bodyMed: fonts.arabic,
  bodySemi: fonts.arabicSemi,
  label: fonts.arabicSemi,
  caption: fonts.arabicBold,
  num: fonts.arabicSemi,
};

export function fontForVariant(variant, isArabic) {
  if (isArabic) return ARABIC_FOR[variant] ?? fonts.arabic;
  return (type[variant] ?? type.body).fontFamily;
}

// The full list App.js hands to useFonts. Kept here so the token module owns the
// font contract end-to-end.
export function fontAssets() {
  return {
    Fraunces_600SemiBold: require('@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
    Fraunces_700Bold: require('@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    IBMPlexSansArabic_400Regular: require('@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf'),
    IBMPlexSansArabic_600SemiBold: require('@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold/IBMPlexSansArabic_600SemiBold.ttf'),
    IBMPlexSansArabic_700Bold: require('@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf'),
  };
}
