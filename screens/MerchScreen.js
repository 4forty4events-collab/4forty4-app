import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useSession } from '../providers/SessionProvider';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { LookbookCard } from '../components/merch/LookbookCard';
import { TipJarCard } from '../components/merch/TipJarCard';
import { MerchCheckoutSheet } from '../components/merch/MerchCheckoutSheet';
import { useMerchProducts } from '../lib/merch/hooks';
import { BRAND, PRODUCTS, PROCEEDS_TAG, MARKETS, formatPrice } from '../components/merch/catalog';

// The Merch & Support lookbook — an ultra-premium storefront for the TOZVINZWISISA
// capsule that funds the platform. Editorial, spacious, image-forward. Checkout is
// strictly local manual payment (CCP / EcoCash) + courier delivery; see catalog.js.
export default function MerchScreen({ navigation }) {
  const { market } = useMarket();
  const { profile } = useSession();
  const m = MARKETS[market] ?? MARKETS.DZ;
  const [order, setOrder] = useState(null); // { title, subtitle, priceLabel } | null

  // Live catalog from the admin-managed table; falls back to the built-in demo pieces
  // when empty/unreachable (offline, or before the merch_products migration is applied).
  const { data: liveProducts } = useMerchProducts();
  const products = liveProducts && liveProducts.length ? liveProducts : PRODUCTS;

  const openProduct = (p) =>
    setOrder({
      kind: 'product', title: p.name, subtitle: `${p.category} · ${BRAND}`,
      priceLabel: formatPrice(p.price, market),
      images: p.images?.length ? p.images : (p.image ? [p.image] : []),
      sizes: p.sizes ?? [],
    });
  const openTip = (amountLabel) =>
    setOrder({ kind: 'tip', title: 'Direct contribution', subtitle: 'Tip the Vision · thank you 🙏', priceLabel: amountLabel });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={24} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading">Merch & Support</AppText>
        {profile?.is_admin ? (
          <TouchableOpacity onPress={() => navigation.navigate('MerchManager')} hitSlop={10}>
            <AppText variant="label" color={colors.accent2}>Manage</AppText>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Editorial masthead */}
        <AppText variant="caption" color={colors.accent} style={styles.brandKicker}>{BRAND} · OFFICIAL CAPSULE</AppText>
        <AppText style={styles.h1}>Support the Vision</AppText>
        <AppText style={styles.h1sub}>· Wear the Flagship</AppText>
        <AppText variant="bodyLg" color={colors.textLo} style={styles.lede}>
          A small-batch streetwear capsule, cut heavy and finished clean. Every piece keeps 4Forty4
          independent — no ads, no investors, just you and the culture.
        </AppText>

        {/* Proceeds pledge */}
        <View style={styles.pledge}>
          <View style={styles.pledgeDot} />
          <AppText variant="label" color={colors.textHi} style={styles.pledgeText}>{PROCEEDS_TAG}</AppText>
        </View>

        {/* The lookbook */}
        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>THE COLLECTION</AppText>
        {products.map((p) => (
          <LookbookCard key={p.id} product={p} market={market} onPress={() => openProduct(p)} />
        ))}

        {/* Direct support */}
        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>OR JUST SUPPORT</AppText>
        <TipJarCard market={market} onContribute={openTip} />

        {/* Fulfilment footer */}
        <View style={styles.footer}>
          <AppText variant="label" color={colors.textHi} style={styles.footerHead}>Made to last · delivered local</AppText>
          <AppText variant="body" color={colors.textLo} style={styles.footerText}>
            Pay by {m.method} — no card required. We fulfil every order by local courier / {m.courier} across {m.country},
            confirming your address personally before it ships.
          </AppText>
        </View>
        <View style={{ height: space.huge }} />
      </ScrollView>

      <MerchCheckoutSheet visible={!!order} order={order} market={market} onClose={() => setOrder(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.sm },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },

  brandKicker: { letterSpacing: 2.4, marginBottom: space.sm },
  h1: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.textHi },
  h1sub: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.accent },
  lede: { marginTop: space.base, lineHeight: 25 },

  pledge: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, backgroundColor: 'rgba(79,190,143,0.09)', borderWidth: 1, borderColor: 'rgba(79,190,143,0.3)', borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.base },
  pledgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  pledgeText: { flex: 1, lineHeight: 19 },

  sectionLabel: { marginTop: space.huge, marginBottom: space.lg, letterSpacing: 2 },

  footer: { marginTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: space.lg },
  footerHead: { letterSpacing: 0.3 },
  footerText: { marginTop: space.sm, lineHeight: 22 },
});
