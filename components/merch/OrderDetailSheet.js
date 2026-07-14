import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, ScrollView, TextInput, Image, Alert, StyleSheet } from 'react-native';
import { Icon } from '../ui/Icon';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { setMerchOrderStatus, updateMerchOrder, deleteMerchOrder } from '../../lib/merch/merchRepository';
import { ORDER_STATUSES, ORDER_STATUS_LABEL, orderStatusColor, formatOrderDate } from './orderMeta';

// Admin order detail + actions. Status changes apply immediately; customer details and the
// note are editable then saved; delete removes the order. `onChanged` reloads the list.
export function OrderDetailSheet({ order, onClose, onChanged }) {
  const [status, setStatus] = useState('new');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!order) return;
    setStatus(order.status ?? 'new');
    setName(order.name ?? '');
    setPhone(order.phone ?? '');
    setAddress(order.address ?? '');
    setNote(order.note ?? '');
    setMsg(null);
  }, [order]);

  if (!order) return null;

  const pickStatus = async (s) => {
    setStatus(s);
    try { await setMerchOrderStatus(order.id, s); onChanged?.(); }
    catch { setMsg('Could not update status — is the orders migration applied?'); }
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await updateMerchOrder(order.id, { name: name.trim(), phone: phone.trim(), address: address.trim(), note: note.trim(), status });
      setMsg('Saved.');
      onChanged?.();
    } catch { setMsg('Could not save changes.'); }
    finally { setBusy(false); }
  };

  const remove = () => {
    Alert.alert('Delete order', `Remove ${order.name}'s order for “${order.itemName}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteMerchOrder(order.id); onChanged?.(); onClose(); }
        catch { setMsg('Could not delete that order.'); }
      } },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAwareView>
        <View style={styles.fill}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {/* Summary */}
              <View style={styles.head}>
                {order.imageUrl
                  ? <Image source={{ uri: order.imageUrl }} style={styles.thumb} />
                  : <View style={[styles.thumb, styles.thumbFallback]}><AppText style={styles.thumbGlyph}>{order.kind === 'tip' ? '🙏' : '👕'}</AppText></View>}
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySemi" numberOfLines={2}>{order.itemName}</AppText>
                  <AppText variant="label" color={colors.textLo}>
                    {[order.size ? `Size ${order.size}` : null, order.amountLabel, order.payMethod].filter(Boolean).join(' · ')}
                  </AppText>
                  <AppText variant="caption" color={colors.textMute} style={styles.date}>{formatOrderDate(order.createdAt)}</AppText>
                </View>
              </View>

              {/* Status */}
              <AppText variant="caption" color={colors.textMute} style={styles.section}>STATUS</AppText>
              <View style={styles.statusRow}>
                {ORDER_STATUSES.map((s) => {
                  const on = status === s;
                  const c = orderStatusColor(s);
                  return (
                    <Pressable key={s} onPress={() => pickStatus(s)} style={[styles.statusChip, on && { backgroundColor: c, borderColor: c }]}>
                      <AppText variant="label" color={on ? colors.onAccent : colors.textLo}>{ORDER_STATUS_LABEL[s]}</AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Customer (editable) */}
              <AppText variant="caption" color={colors.textMute} style={styles.section}>CUSTOMER</AppText>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.textMute} />
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={colors.textMute} keyboardType="phone-pad" />
              {order.kind !== 'tip' ? (
                <TextInput style={[styles.input, styles.inputMulti]} value={address} onChangeText={setAddress} placeholder="Delivery address" placeholderTextColor={colors.textMute} multiline />
              ) : null}
              <TextInput style={[styles.input, styles.inputMulti]} value={note} onChangeText={setNote} placeholder="Admin note (e.g. courier, tracking, paid via…)" placeholderTextColor={colors.textMute} multiline />

              {msg ? <AppText variant="label" color={colors.accent} style={styles.msg}>{msg}</AppText> : null}

              <Pressable onPress={save} disabled={busy} style={({ pressed }) => [styles.save, busy && styles.saveOff, pressed && !busy && styles.savePressed]}>
                <Icon name="check" size={18} color={colors.onAccent} />
                <AppText variant="label" color={colors.onAccent}>{busy ? 'Saving…' : 'Save changes'}</AppText>
              </Pressable>
              <Pressable onPress={remove} style={styles.delete}>
                <Icon name="trash" size={16} color={colors.danger} />
                <AppText variant="label" color={colors.danger}>Delete order</AppText>
              </Pressable>
              <View style={{ height: space.md }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAwareView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.66)' },
  sheet: { maxHeight: '90%', backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, paddingTop: space.sm },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.sm },
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.lg },

  head: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  thumb: { width: 60, height: 72, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { fontSize: 26 },
  date: { marginTop: 4 },

  section: { marginTop: space.xl, marginBottom: space.sm },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  statusChip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase },

  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, marginBottom: space.sm },
  inputMulti: { minHeight: 56, textAlignVertical: 'top' },
  msg: { marginTop: space.xs },

  save: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.md, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15 },
  savePressed: { backgroundColor: colors.accentPress },
  saveOff: { opacity: 0.5 },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.md, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,96,94,0.4)' },
});
