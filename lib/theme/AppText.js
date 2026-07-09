import React from 'react';
import { Text } from 'react-native';
import { type as typeScale, colors, ARABIC_RE, fontForVariant } from './tokens';

// The one text primitive. Pick a `variant` from the type scale; Arabic strings are
// auto-routed to IBM Plex Sans Arabic at a matching weight (Fraunces/Inter have no
// Arabic glyphs). Defaults to hi-contrast text on the dark base. No RTL flip.
export function AppText({ variant = 'body', color, style, children, ...rest }) {
  const base = typeScale[variant] ?? typeScale.body;
  const isArabic = typeof children === 'string' && ARABIC_RE.test(children);
  return (
    <Text
      {...rest}
      style={[base, { fontFamily: fontForVariant(variant, isArabic), color: color ?? colors.textHi }, style]}
    >
      {children}
    </Text>
  );
}
