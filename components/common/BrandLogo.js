import React from 'react';
import { Image } from 'react-native';

// The one place brand artwork enters the UI. `variant` picks the asset, `size`
// picks a preset box — both dimensions are always explicit so the image reserves
// its space before decode and nothing reflows around it.
//
// Renders a bare Image on purpose: no wrapper View, no background, border,
// radius or padding. The mark is a standalone graphic, never a chip or badge —
// callers supply spacing only, and any framing belongs to a sibling element.
//
// Sizes honour each asset's true aspect, so `contain` never letterboxes:
//   symbol      432x500 (0.864)  — the bare mark, reads on dark
//   full-slogan 1024x1024        — mark + wordmark + slogan, DARK artwork
//   icon        1024x1024        — the rounded app-icon badge
//
// Heads up: `full-slogan` is dark navy on transparency. It disappears on the
// dark cinematic UI. Use `symbol` plus real text on dark surfaces; reach for
// full-slogan only on a light background.
const ASSETS = {
  symbol: require('../../assets/brand/logo-symbol.png'),
  'full-slogan': require('../../assets/brand/logo-slogan.png'),
  icon: require('../../assets/brand/app-icon.png'),
};

const SIZES = {
  symbol: { sm: { width: 21, height: 24 }, md: { width: 28, height: 32 }, lg: { width: 66, height: 76 } },
  'full-slogan': { sm: { width: 140, height: 140 }, md: { width: 190, height: 190 }, lg: { width: 240, height: 240 } },
  icon: { sm: { width: 32, height: 32 }, md: { width: 48, height: 48 }, lg: { width: 64, height: 64 } },
};

export function BrandLogo({ variant = 'symbol', size = 'md', style, accessibilityLabel = 'Purday' }) {
  const source = ASSETS[variant] ?? ASSETS.symbol;
  const box = (SIZES[variant] ?? SIZES.symbol)[size] ?? SIZES[variant].md;
  return (
    <Image
      source={source}
      style={[box, style]}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
