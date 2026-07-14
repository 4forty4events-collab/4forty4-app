// TOZVINZWISISA — 4Forty4's official streetwear capsule.
//
// PRESENTATION-ONLY storefront. There is deliberately NO card gateway, Stripe, cart
// backend, or order table here: checkout surfaces LOCAL manual-payment instructions
// only (CCP for Algeria, EcoCash for Zimbabwe) and fulfilment is by local courier /
// livraison. The values under PAYMENT are placeholders — swap them for the real CCP
// account + EcoCash number before launch; nothing else needs to change.

import { colors } from '../../lib/theme';

export const BRAND = 'TOZVINZWISISA';
export const PROCEEDS_TAG = 'All proceeds directly fund 4Forty4 platform engineering & servers.';

// Per-market money + fulfilment context. market comes from useMarket() ('DZ' | 'ZW').
export const MARKETS = {
  DZ: { country: 'Algeria', currency: 'DA', method: 'CCP', courier: 'livraison' },
  ZW: { country: 'Zimbabwe', currency: 'US$', method: 'EcoCash', courier: 'courier delivery' },
};

// Manual payment destinations. REPLACE these placeholders with real accounts.
export const PAYMENT = {
  CCP: {
    label: 'CCP · Algérie Poste',
    tag: 'Virement CCP / BaridiMob',
    lines: [
      ['Compte', '0012345678 clé 09'],
      ['Nom', 'TOZVINZWISISA · 4Forty4'],
      ['RIP', '007 99999 0012345678 09'],
    ],
    note: 'Faites le virement, puis envoyez le reçu + adresse de livraison pour confirmer.',
  },
  EcoCash: {
    label: 'EcoCash · Zimbabwe',
    tag: 'EcoCash merchant',
    lines: [
      ['Number', '+263 77 000 0000'],
      ['Name', 'TOZVINZWISISA · 4Forty4'],
      ['Merchant code', '12345'],
    ],
    note: 'Pay the number above, then send your confirmation SMS + address to confirm.',
  },
};

// Art-direction themes: a 2-stop diagonal `tint` + ambient halo `glow`. Shared by the
// static fallback below AND by DB products (the manager stores a theme KEY, resolved
// through here at render), so every card stays on-palette. Keep keys in sync with the
// merch_products.theme CHECK constraint.
export const THEMES = {
  ember: { tint: ['#F0A968', '#7A2E12'], glow: colors.accent },
  sea: { tint: ['#5FB4D6', '#0E2338'], glow: colors.accent2 },
  gold: { tint: ['#F3C368', '#5A3A0A'], glow: colors.star },
};
export const THEME_KEYS = ['ember', 'sea', 'gold'];
export const THEME_LABELS = { ember: 'Ember', sea: 'Sea', gold: 'Gold' };

// Offerable sizes, in display order. A product stores `sizes` = [{ size, soldOut }]; an
// empty array means one-size / no size choice (e.g. a cap).
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const apparelSizes = ['S', 'M', 'L', 'XL'].map((size) => ({ size, soldOut: false }));

// The in-stock size codes for a product (drops sold-out ones).
export function availableSizes(sizes) {
  return (sizes ?? []).filter((s) => s && !s.soldOut).map((s) => s.size);
}
// A product is fully sold out only when it HAS sizes and every one is sold out.
export function isSoldOut(product) {
  const sizes = product?.sizes ?? [];
  return sizes.length > 0 && sizes.every((s) => s.soldOut);
}

// Static fallback catalog — rendered when the DB is empty/unreachable (offline, or before
// the migration is applied). price: { DZD, USD }.
export const PRODUCTS = [
  {
    id: 'flagship-tee',
    kind: 'FLAGSHIP DROP',
    category: 'TEE',
    name: 'Flagship Heavyweight Tee',
    fabric: '320 GSM heavyweight loopback cotton · boxy oversized cut · ribbed collar',
    price: { DZD: 3200, USD: 22 },
    theme: 'ember',
    ...THEMES.ember,
    sizes: apparelSizes,
    featured: true,
  },
  {
    id: 'night-hoodie',
    kind: 'CAPSULE',
    category: 'HOODIE',
    name: 'Mediterranean Night Hoodie',
    fabric: '450 GSM brushed-back fleece · double-lined hood · embroidered wordmark',
    price: { DZD: 6800, USD: 44 },
    theme: 'sea',
    ...THEMES.sea,
    sizes: apparelSizes,
  },
  {
    id: 'signal-cap',
    kind: 'CAPSULE',
    category: 'HEADWEAR',
    name: 'Signal 6-Panel Cap',
    fabric: 'Structured brushed twill · raised 3D embroidery · adjustable strap',
    price: { DZD: 2400, USD: 16 },
    theme: 'gold',
    ...THEMES.gold,
  },
];

// Direct-support tip tiers, per market currency.
export const TIPS = {
  DZ: [500, 1000, 2500],
  ZW: [2, 5, 10],
};

function group(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // 3200 -> "3 200"
}

// A raw amount in the market's currency -> display string (e.g. "3 200 DA" / "US$22").
export function formatAmount(value, market) {
  const m = MARKETS[market] ?? MARKETS.DZ;
  return market === 'ZW' ? `${m.currency}${value}` : `${group(value)} ${m.currency}`;
}

// A product's price in the market's currency -> display string.
export function formatPrice(price, market) {
  return formatAmount(market === 'ZW' ? price.USD : price.DZD, market);
}
