import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Pressable, ScrollView, TextInput, Image, StyleSheet } from 'react-native';
import { Icon } from '../ui/Icon';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { useMerchPayment } from '../../lib/merch/hooks';
import { placeMerchOrder } from '../../lib/merch/merchRepository';
import { MARKETS, PAYMENT } from './catalog';

// Merge admin-edited payment rows over the catalog defaults. A method with no saved
// lines falls back entirely to the catalog placeholder.
function mergePayment(dbPay) {
  const pick = (key) => {
    const base = PAYMENT[key];
    const db = dbPay?.[key];
    if (db && Array.isArray(db.lines) && db.lines.length) {
      return { ...base, lines: db.lines, note: db.note ?? base.note };
    }
    return base;
  };
  return { CCP: pick('CCP'), EcoCash: pick('EcoCash') };
}

// One payment destination, rendered as a card. The account values are `selectable`
// so a long-press natively copies them — no clipboard dependency, no fake gateway.
function PaymentBlock({ p, primary }) {
  if (!p) return null;
  return (
    <View style={[styles.payCard, primary && styles.payCardPrimary]}>
      <View style={styles.payHead}>
        <AppText variant="bodySemi" color={primary ? colors.textHi : colors.textLo}>{p.label}</AppText>
        {primary ? <View style={styles.recommend}><AppText style={styles.recommendText}>YOUR REGION</AppText></View> : null}
      </View>
      <AppText variant="caption" color={colors.textMute} style={styles.payTag}>{p.tag}</AppText>
      <View style={styles.lines}>
        {p.lines.map(([k, v]) => (
          <View key={k} style={styles.lineRow}>
            <AppText variant="label" color={colors.textMute} style={styles.lineKey}>{k}</AppText>
            <AppText variant="bodySemi" color={colors.textHi} style={styles.lineVal} selectable>{v}</AppText>
          </View>
        ))}
      </View>
      <AppText variant="label" color={colors.textLo} style={styles.payNote}>{p.note}</AppText>
    </View>
  );
}

// Manual-payment checkout. NO card fields / Stripe / gateway — strictly CCP (Algeria)
// or EcoCash (Zimbabwe), with fulfilment by local courier / livraison. `order` is the
// generic { title, priceLabel } shape shared by apparel and the tip jar.
//
// The delivery step CAPTURES name/phone/address locally (no backend): on confirm the
// sheet flips to a summary the buyer sends alongside their payment receipt, which is
// how orders are reconciled manually today.
export function MerchCheckoutSheet({ visible, order, market, onClose }) {
  const m = MARKETS[market] ?? MARKETS.DZ;
  const primaryKey = m.method; // 'CCP' | 'EcoCash'
  const otherKey = primaryKey === 'CCP' ? 'EcoCash' : 'CCP';
  const isTip = order?.kind === 'tip';

  // Live admin-edited destinations, falling back to the catalog placeholders.
  const { data: dbPay } = useMerchPayment();
  const payment = useMemo(() => mergePayment(dbPay), [dbPay]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [size, setSize] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [placing, setPlacing] = useState(false);

  // Reset the form each time the sheet opens for a new order.
  useEffect(() => {
    if (visible) { setName(''); setPhone(''); setAddress(''); setSize(null); setSubmitted(false); setPlacing(false); }
  }, [visible, order]);

  const hasSizes = !isTip && Array.isArray(order?.sizes) && order.sizes.length > 0;
  // A tip needs no shipping address — just a name/phone so we can say thanks. Apparel
  // with sizes also needs a size chosen.
  const ready = name.trim() && phone.trim() && (isTip || address.trim()) && (!hasSizes || !!size);

  // Persist the order, then flip to the confirmation. Best-effort: a failed save never
  // blocks the buyer — the summary they send with their receipt is the reliable fallback.
  const confirm = async () => {
    if (!ready || placing) return;
    setPlacing(true);
    try {
      await placeMerchOrder({
        kind: isTip ? 'tip' : 'product',
        itemName: order?.title ?? 'Order',
        size: hasSizes ? size : null,
        amountLabel: order?.priceLabel ?? null,
        market,
        payMethod: m.method,
        name: name.trim(),
        phone: phone.trim(),
        address: isTip ? null : address.trim(),
        imageUrl: order?.images?.[0] ?? null,
      });
    } catch {
      /* best-effort */
    } finally {
      setPlacing(false);
      setSubmitted(true);
    }
  };

  const steps = [
    `Transfer the amount via ${primaryKey} using the details below.`,
    'Keep your receipt / confirmation SMS as proof of payment.',
    isTip
      ? 'Send it over and we’ll shout you out — that’s it.'
      : `Send it with the delivery details above — we ship by ${m.courier} across ${m.country}.`,
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAwareView>
        <View style={styles.fill}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {submitted ? (
                <ConfirmationView order={order} market={market} name={name} phone={phone} address={address} size={size} isTip={isTip} onClose={onClose} />
              ) : (
                <>
                  <AppText variant="caption" color={colors.accent} style={styles.kicker}>MANUAL PAYMENT · NO CARD NEEDED</AppText>
                  <AppText variant="title" style={styles.title}>Complete your support</AppText>

                  {order ? (
                    <>
                      <View style={styles.orderRow}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="bodySemi" numberOfLines={2}>{order.title}</AppText>
                          {order.subtitle ? <AppText variant="label" color={colors.textLo} style={styles.orderSub}>{order.subtitle}</AppText> : null}
                        </View>
                        <View style={styles.orderPrice}><AppText style={styles.orderPriceText}>{order.priceLabel}</AppText></View>
                      </View>
                      {order.images?.length ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orderThumbs} keyboardShouldPersistTaps="handled">
                          {order.images.map((uri, i) => <Image key={`${uri}-${i}`} source={{ uri }} style={styles.orderThumb} />)}
                        </ScrollView>
                      ) : null}
                    </>
                  ) : null}

                  {/* Size selection (apparel with sizes) */}
                  {hasSizes ? (
                    <>
                      <AppText variant="caption" color={colors.textMute} style={styles.section}>SELECT SIZE</AppText>
                      <View style={styles.sizeRow}>
                        {order.sizes.map(({ size: code, soldOut }) => {
                          const on = size === code;
                          return (
                            <Pressable
                              key={code}
                              onPress={() => !soldOut && setSize(code)}
                              disabled={soldOut}
                              style={[styles.sizeChip, on && styles.sizeChipOn, soldOut && styles.sizeChipGone]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on, disabled: soldOut }}
                            >
                              <AppText variant="label" color={on ? colors.onAccent : (soldOut ? colors.textMute : colors.textHi)} style={soldOut ? styles.sizeStrike : null}>{code}</AppText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}

                  {/* Delivery capture */}
                  <AppText variant="caption" color={colors.textMute} style={styles.section}>
                    {isTip ? 'YOUR DETAILS' : 'DELIVERY DETAILS'}
                  </AppText>
                  <TextInput
                    style={styles.input}
                    value={name} onChangeText={setName}
                    placeholder="Full name" placeholderTextColor={colors.textMute}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={styles.input}
                    value={phone} onChangeText={setPhone}
                    placeholder="Phone (for delivery confirmation)" placeholderTextColor={colors.textMute}
                    keyboardType="phone-pad"
                  />
                  {!isTip ? (
                    <TextInput
                      style={[styles.input, styles.inputMulti]}
                      value={address} onChangeText={setAddress}
                      placeholder={`Delivery address — neighbourhood, city (${m.country})`}
                      placeholderTextColor={colors.textMute}
                      multiline
                    />
                  ) : null}

                  {/* Payment destinations */}
                  <AppText variant="caption" color={colors.textMute} style={styles.section}>PAYMENT DETAILS</AppText>
                  <PaymentBlock p={payment[primaryKey]} primary />
                  <AppText variant="label" color={colors.textMute} style={styles.alsoLabel}>Also accepted</AppText>
                  <PaymentBlock p={payment[otherKey]} />

                  {/* Delivery notice */}
                  {!isTip ? (
                    <View style={styles.deliveryCard}>
                      <View style={styles.deliveryIcon}><AppText style={styles.deliveryEmoji}>📦</AppText></View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodySemi">Delivered by local courier</AppText>
                        <AppText variant="label" color={colors.textLo} style={styles.deliveryText}>
                          Fulfilment is handled directly via local courier / livraison — no global shipping, no customs.
                          We confirm your address by phone and hand-deliver anywhere in {m.country}.
                        </AppText>
                      </View>
                    </View>
                  ) : null}

                  {/* How it works */}
                  <AppText variant="caption" color={colors.textMute} style={styles.section}>HOW IT WORKS</AppText>
                  {steps.map((s, i) => (
                    <View key={i} style={styles.stepRow}>
                      <View style={styles.stepNum}><AppText style={styles.stepNumText}>{i + 1}</AppText></View>
                      <AppText variant="body" color={colors.textLo} style={styles.stepText}>{s}</AppText>
                    </View>
                  ))}

                  <Pressable
                    onPress={confirm}
                    disabled={!ready || placing}
                    style={({ pressed }) => [styles.done, (!ready || placing) && styles.doneOff, pressed && ready && !placing && styles.donePressed]}
                    accessibilityRole="button"
                  >
                    <AppText variant="label" color={colors.onAccent}>{placing ? 'Placing…' : (isTip ? 'Confirm contribution' : 'Place order')}</AppText>
                    {!placing ? <Icon name="chevronRight" size={18} color={colors.onAccent} /> : null}
                  </Pressable>
                  {!ready ? (
                    <AppText variant="caption" color={colors.textMute} style={styles.gateHint}>
                      {hasSizes && !size
                        ? 'Select a size, then add your name, phone and address.'
                        : (isTip ? 'Add your name and phone to continue.' : 'Add your name, phone and address to continue.')}
                    </AppText>
                  ) : null}
                  <View style={{ height: space.md }} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAwareView>
    </Modal>
  );
}

// Post-confirm summary. Everything is `selectable` so the buyer can copy the whole
// block into WhatsApp/Instagram alongside their payment receipt to finalise the order.
function ConfirmationView({ order, market, name, phone, address, size, isTip, onClose }) {
  const m = MARKETS[market] ?? MARKETS.DZ;
  const rows = [
    ['Item', order?.title],
    ...(size ? [['Size', size]] : []),
    ['Amount', order?.priceLabel],
    ['Pay by', m.method],
    ['Name', name.trim()],
    ['Phone', phone.trim()],
    ...(isTip ? [] : [['Deliver to', address.trim()], ['Courier', `${m.courier} · ${m.country}`]]),
  ];
  return (
    <View>
      <View style={styles.successBadge}><Icon name="check" size={26} color={colors.onAccent} /></View>
      <AppText variant="title" style={styles.successTitle}>{isTip ? 'Contribution noted' : 'Order noted'}</AppText>
      <AppText variant="body" color={colors.textLo} style={styles.successLede}>
        {isTip
          ? 'Complete your transfer, then send the summary below with your receipt — we’ll shout you out.'
          : 'Complete your transfer, then send the summary below with your receipt. We confirm delivery by phone before dispatch.'}
      </AppText>

      <View style={styles.summaryCard}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.summaryRow}>
            <AppText variant="label" color={colors.textMute} style={styles.summaryKey}>{k}</AppText>
            <AppText variant="bodySemi" color={colors.textHi} style={styles.summaryVal} selectable>{v}</AppText>
          </View>
        ))}
      </View>

      <View style={styles.nextCard}>
        <AppText style={styles.nextEmoji}>💬</AppText>
        <AppText variant="label" color={colors.textLo} style={styles.nextText}>
          Send it to our WhatsApp / Instagram with your {m.method} receipt to finalise. No card, no gateway — just a quick message.
        </AppText>
      </View>

      <Pressable onPress={onClose} style={({ pressed }) => [styles.done, pressed && styles.donePressed]} accessibilityRole="button">
        <Icon name="check" size={18} color={colors.onAccent} />
        <AppText variant="label" color={colors.onAccent}>Done</AppText>
      </Pressable>
      <View style={{ height: space.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.66)' },
  sheet: { maxHeight: '90%', backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, paddingTop: space.sm },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.sm },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.lg },

  kicker: { letterSpacing: 1.6, marginTop: space.xs },
  title: { marginTop: 4, marginBottom: space.base },

  orderRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base },
  orderSub: { marginTop: 3 },
  orderPrice: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
  orderPriceText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.onAccent },
  orderThumbs: { gap: space.sm, paddingTop: space.md },
  orderThumb: { width: 72, height: 90, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },

  section: { marginTop: space.xl, marginBottom: space.md },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, marginBottom: space.sm },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },

  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sizeChip: { minWidth: 48, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase },
  sizeChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  sizeChipGone: { opacity: 0.45, borderStyle: 'dashed' },
  sizeStrike: { textDecorationLine: 'line-through' },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.md },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bgElevated2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.accent },
  stepText: { flex: 1, lineHeight: 21 },

  payCard: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md },
  payCardPrimary: { borderColor: colors.accent, backgroundColor: 'rgba(232,137,74,0.07)' },
  payHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recommend: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
  recommendText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, color: colors.onAccent },
  payTag: { marginTop: 3, letterSpacing: 0.5 },
  lines: { marginTop: space.md, gap: space.sm },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  lineKey: { width: 96 },
  lineVal: { flex: 1, textAlign: 'right' },
  payNote: { marginTop: space.md, lineHeight: 19 },

  alsoLabel: { marginBottom: space.sm },

  deliveryCard: { flexDirection: 'row', gap: space.md, backgroundColor: 'rgba(79,190,143,0.09)', borderWidth: 1, borderColor: 'rgba(79,190,143,0.32)', borderRadius: radius.lg, padding: space.base, marginTop: space.md },
  deliveryIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(79,190,143,0.16)' },
  deliveryEmoji: { fontSize: 20, lineHeight: 26 },
  deliveryText: { marginTop: 4, lineHeight: 19 },

  done: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.xl, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15 },
  donePressed: { backgroundColor: colors.accentPress },
  doneOff: { opacity: 0.45 },
  gateHint: { textAlign: 'center', marginTop: space.sm },

  // Confirmation
  successBadge: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: space.md, marginBottom: space.base },
  successTitle: { textAlign: 'center' },
  successLede: { textAlign: 'center', marginTop: space.sm, lineHeight: 22 },
  summaryCard: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginTop: space.lg, gap: space.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  summaryKey: { width: 88, paddingTop: 1 },
  summaryVal: { flex: 1, textAlign: 'right' },
  nextCard: { flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: colors.bgElevated2, borderRadius: radius.lg, padding: space.base, marginTop: space.md },
  nextEmoji: { fontSize: 20, lineHeight: 26 },
  nextText: { flex: 1, lineHeight: 19 },
});
