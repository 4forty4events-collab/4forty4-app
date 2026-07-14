import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, Switch, Image, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { uploadBlobToR2 } from '../lib/r2';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { PaymentEditor } from '../components/merch/PaymentEditor';
import { THEMES, THEME_KEYS, THEME_LABELS, SIZES, formatPrice } from '../components/merch/catalog';
import { fetchAllMerchProducts, upsertMerchProduct, deleteMerchProduct } from '../lib/merch/merchRepository';

const EMPTY = {
  id: null, name: '', category: '', kind: '', fabric: '',
  priceDzd: '', priceUsd: '', images: [], theme: 'ember',
  offeredSizes: [], soldOutSizes: [], promoted: false,
  featured: false, active: true, sortOrder: '0',
};

// Labeled input row. `kind='num'` swaps to the numeric keyboard.
function Field({ label, value, onChangeText, placeholder, kind, multiline }) {
  return (
    <View style={styles.field}>
      <AppText variant="label" color={colors.textLo}>{label}</AppText>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMute}
        keyboardType={kind === 'num' ? 'numeric' : 'default'}
        autoCapitalize={kind === 'url' ? 'none' : 'sentences'}
        autoCorrect={kind !== 'url'}
        multiline={multiline}
      />
    </View>
  );
}

// Admin: author the TOZVINZWISISA catalog. Writes go through the SECURITY DEFINER
// upsert/delete RPCs (server re-checks is_admin()); the storefront reads the same table.
export default function MerchManagerScreen({ navigation }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const editing = !!form.id;
  const [uploading, setUploading] = useState(false);

  // Pick one or more photos, upload each to R2, append the permanent URLs. First image
  // in the list is the cover; the store shows the rest as a swipeable gallery.
  const pickImages = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Photo library permission denied.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: true, selectionLimit: 8,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const urls = [];
      for (const asset of res.assets) {
        const blob = await (await fetch(asset.uri)).blob();
        urls.push(await uploadBlobToR2(blob, asset.mimeType ?? 'image/jpeg'));
      }
      setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
    } catch {
      setError('Upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };
  const removeImage = (idx) => setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  const makeCover = (idx) => setForm((f) => {
    const arr = [...f.images];
    const [pick] = arr.splice(idx, 1);
    return { ...f, images: [pick, ...arr] };
  });

  // Toggle whether a size is OFFERED; removing an offered size also clears its sold-out mark.
  const toggleSize = (code) => setForm((f) => {
    const has = f.offeredSizes.includes(code);
    return {
      ...f,
      offeredSizes: has ? f.offeredSizes.filter((s) => s !== code) : [...f.offeredSizes, code],
      soldOutSizes: has ? f.soldOutSizes.filter((s) => s !== code) : f.soldOutSizes,
    };
  });
  const toggleSoldOut = (code) => setForm((f) => ({
    ...f,
    soldOutSizes: f.soldOutSizes.includes(code) ? f.soldOutSizes.filter((s) => s !== code) : [...f.soldOutSizes, code],
  }));

  const loadList = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchAllMerchProducts()); }
    catch { /* table may not exist yet — list stays empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const resetForm = () => { setForm(EMPTY); setError(null); };

  const edit = (p) => {
    setError(null); setNotice(null);
    setForm({
      id: p.id, name: p.name, category: p.category ?? '', kind: p.kind ?? '', fabric: p.fabric ?? '',
      priceDzd: String(p.price?.DZD ?? ''), priceUsd: String(p.price?.USD ?? ''),
      images: p.images ?? [], theme: p.theme ?? 'ember',
      offeredSizes: (p.sizes ?? []).map((s) => s.size),
      soldOutSizes: (p.sizes ?? []).filter((s) => s.soldOut).map((s) => s.size),
      promoted: !!p.promoted,
      featured: !!p.featured, active: p.active !== false, sortOrder: String(p.sortOrder ?? 0),
    });
  };

  const save = async () => {
    setError(null); setNotice(null);
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    try {
      await upsertMerchProduct({
        id: form.id,
        name: form.name,
        category: form.category,
        kind: form.kind,
        fabric: form.fabric,
        priceDzd: parseInt(form.priceDzd, 10) || 0,
        priceUsd: parseInt(form.priceUsd, 10) || 0,
        images: form.images,
        theme: form.theme,
        featured: form.featured,
        active: form.active,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
        sizes: SIZES.filter((s) => form.offeredSizes.includes(s)).map((size) => ({ size, soldOut: form.soldOutSizes.includes(size) })),
        promoted: form.promoted,
      });
      setNotice(editing ? 'Product updated.' : 'Product added.');
      resetForm();
      loadList();
      qc.invalidateQueries({ queryKey: ['merch'] }); // refresh storefront + Discover promo
    } catch (e) {
      const m = e?.message || '';
      if (m === 'NOT_ADMIN') setError('You are not an admin.');
      else if (m === 'NAME_REQUIRED') setError('Name is required.');
      else setError(`Could not save: ${m || 'unknown error'} — is the merch_products migration applied?`);
    } finally {
      setSaving(false);
    }
  };

  const remove = (p) => {
    Alert.alert('Delete product', `Remove “${p.name}” from the store?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteMerchProduct(p.id);
            if (form.id === p.id) resetForm();
            loadList();
            qc.invalidateQueries({ queryKey: ['merch'] });
          } catch { setError('Could not delete that product.'); }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <Icon name="chevronLeft" size={22} color={colors.textHi} />
          </TouchableOpacity>
          <AppText variant="heading">Merch Manager</AppText>
          <TouchableOpacity onPress={() => navigation.navigate('Merch')} hitSlop={10}>
            <AppText variant="label" color={colors.accent2}>View store</AppText>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.ordersLink} onPress={() => navigation.navigate('MerchOrders')} activeOpacity={0.8}>
            <AppText style={styles.ordersEmoji}>📦</AppText>
            <View style={{ flex: 1 }}>
              <AppText variant="bodySemi">Customer orders</AppText>
              <AppText variant="label" color={colors.textLo}>View, mark paid / shipped, edit or delete.</AppText>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textMute} />
          </TouchableOpacity>

          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>
            {editing ? 'EDIT PRODUCT' : 'NEW PRODUCT'}
          </AppText>

          <Field label="NAME" value={form.name} onChangeText={set('name')} placeholder="Flagship Heavyweight Tee" />
          <View style={styles.row2}>
            <View style={styles.cell}><Field label="CATEGORY" value={form.category} onChangeText={set('category')} placeholder="TEE" /></View>
            <View style={styles.cell}><Field label="BADGE" value={form.kind} onChangeText={set('kind')} placeholder="CAPSULE" /></View>
          </View>
          <Field label="FABRIC / SPECS" value={form.fabric} onChangeText={set('fabric')} placeholder="320 GSM heavyweight loopback cotton · oversized" multiline />

          <View style={styles.row2}>
            <View style={styles.cell}><Field label="PRICE (DZD · Algeria)" value={form.priceDzd} onChangeText={set('priceDzd')} placeholder="3200" kind="num" /></View>
            <View style={styles.cell}><Field label="PRICE (USD · Zimbabwe)" value={form.priceUsd} onChangeText={set('priceUsd')} placeholder="22" kind="num" /></View>
          </View>

          <View style={styles.field}>
            <AppText variant="label" color={colors.textLo}>SIZES</AppText>
            <AppText variant="caption" color={colors.textMute}>Tap to offer a size. Leave all off for one-size items (e.g. a cap).</AppText>
            <View style={styles.sizeRow}>
              {SIZES.map((code) => {
                const on = form.offeredSizes.includes(code);
                return (
                  <TouchableOpacity key={code} onPress={() => toggleSize(code)} style={[styles.sizeChip, on && styles.sizeChipOn]} activeOpacity={0.8}>
                    <AppText variant="label" color={on ? colors.onAccent : colors.textLo}>{code}</AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
            {form.offeredSizes.length > 0 ? (
              <>
                <AppText variant="caption" color={colors.textMute} style={styles.soldLabel}>Mark sold out</AppText>
                <View style={styles.sizeRow}>
                  {SIZES.filter((c) => form.offeredSizes.includes(c)).map((code) => {
                    const gone = form.soldOutSizes.includes(code);
                    return (
                      <TouchableOpacity key={code} onPress={() => toggleSoldOut(code)} style={[styles.sizeChip, gone && styles.sizeChipGone]} activeOpacity={0.8}>
                        <AppText variant="label" color={gone ? '#fff' : colors.textLo}>{code}{gone ? '  ✕' : ''}</AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.field}>
            <AppText variant="label" color={colors.textLo}>IMAGES</AppText>
            <AppText variant="caption" color={colors.textMute}>First image is the cover · swipeable gallery in the store · blank = gradient art</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow} keyboardShouldPersistTaps="handled">
              {form.images.map((uri, idx) => (
                <View key={`${uri}-${idx}`} style={styles.thumbWrap}>
                  <Image source={{ uri }} style={styles.galleryThumb} />
                  {idx === 0 ? (
                    <View style={styles.coverBadge}><AppText style={styles.coverBadgeText}>COVER</AppText></View>
                  ) : (
                    <TouchableOpacity style={styles.coverSet} onPress={() => makeCover(idx)}><AppText style={styles.coverSetText}>Set cover</AppText></TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.thumbDel} onPress={() => removeImage(idx)} hitSlop={6}>
                    <Icon name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addTile} onPress={pickImages} disabled={uploading} activeOpacity={0.7}>
                {uploading
                  ? <ActivityIndicator color={colors.accent} />
                  : <><Icon name="plus" size={22} color={colors.accent} /><AppText variant="caption" color={colors.textLo}>Add</AppText></>}
              </TouchableOpacity>
            </ScrollView>
          </View>

          <AppText variant="label" color={colors.textLo} style={styles.themeLabel}>ART THEME</AppText>
          <View style={styles.themeRow}>
            {THEME_KEYS.map((key) => (
              <TouchableOpacity key={key} onPress={() => set('theme')(key)} activeOpacity={0.85} style={styles.themeCell}>
                <View style={[styles.swatch, form.theme === key && styles.swatchOn, { borderColor: form.theme === key ? THEMES[key].glow : colors.line }]}>
                  <View style={[styles.swatchFill, { backgroundColor: THEMES[key].tint[0] }]} />
                  <View style={[styles.swatchFill, { backgroundColor: THEMES[key].tint[1] }]} />
                </View>
                <AppText variant="label" color={form.theme === key ? colors.textHi : colors.textLo} style={styles.themeName}>{THEME_LABELS[key]}</AppText>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodySemi">Featured drop</AppText>
              <AppText variant="label" color={colors.textLo}>Taller card + strong glow. Use on one item.</AppText>
            </View>
            <Switch value={form.featured} onValueChange={set('featured')} trackColor={{ true: colors.accent, false: colors.line }} thumbColor="#fff" />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodySemi">Active</AppText>
              <AppText variant="label" color={colors.textLo}>Off = hidden from the store, not deleted.</AppText>
            </View>
            <Switch value={form.active} onValueChange={set('active')} trackColor={{ true: colors.success, false: colors.line }} thumbColor="#fff" />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodySemi">Feature on Discover</AppText>
              <AppText variant="label" color={colors.textLo}>Show this as an ad card on the Discover page — everyone sees it.</AppText>
            </View>
            <Switch value={form.promoted} onValueChange={set('promoted')} trackColor={{ true: colors.accent2, false: colors.line }} thumbColor="#fff" />
          </View>

          <Field label="SORT ORDER (lower shows first)" value={form.sortOrder} onChangeText={set('sortOrder')} placeholder="0" kind="num" />

          {error ? <AppText variant="body" color={colors.danger} style={styles.msg}>{error}</AppText> : null}
          {notice ? <AppText variant="body" color={colors.accent} style={styles.msg}>{notice}</AppText> : null}

          <Button label={editing ? 'Save changes' : 'Add product'} onPress={save} loading={saving} icon={editing ? undefined : '＋'} style={styles.submit} />
          {editing ? (
            <TouchableOpacity onPress={resetForm} style={styles.cancelEdit}><AppText variant="label" color={colors.textLo}>Cancel edit · new product</AppText></TouchableOpacity>
          ) : null}

          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>CATALOG ({items.length})</AppText>
          {loading ? (
            <AppText variant="body" color={colors.textLo}>Loading…</AppText>
          ) : items.length === 0 ? (
            <AppText variant="body" color={colors.textLo}>No products yet — add your first above. The store shows the built-in demo pieces until you do.</AppText>
          ) : (
            items.map((p) => (
              <View key={p.id} style={[styles.listRow, !p.active && styles.listRowMuted]}>
                {p.image
                  ? <Image source={{ uri: p.image }} style={styles.thumb} />
                  : <View style={[styles.thumb, { backgroundColor: (THEMES[p.theme] ?? THEMES.ember).tint[0] }]} />}
                <TouchableOpacity style={{ flex: 1 }} onPress={() => edit(p)} activeOpacity={0.7}>
                  <AppText variant="bodySemi" numberOfLines={1}>{p.name}</AppText>
                  <AppText variant="label" color={colors.textLo} numberOfLines={1}>
                    {[p.category, formatPrice(p.price, 'DZ'), formatPrice(p.price, 'ZW'), p.featured ? '★ featured' : null, p.promoted ? '📣 Discover' : null, p.soldOut ? 'SOLD OUT' : null, !p.active ? 'hidden' : null].filter(Boolean).join(' · ')}
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => edit(p)} hitSlop={8} style={styles.rowBtn}><Icon name="edit" size={18} color={colors.textLo} /></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(p)} hitSlop={8} style={styles.rowBtn}><Icon name="trash" size={18} color={colors.danger} /></TouchableOpacity>
              </View>
            ))
          )}

          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>PAYMENT DETAILS</AppText>
          <AppText variant="label" color={colors.textLo} style={styles.payHint}>
            Shown to buyers at checkout. These replace the built-in placeholders and go live instantly.
          </AppText>
          <PaymentEditor />

          <View style={{ height: space.huge }} />
        </ScrollView>
      </KeyboardAwareView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.sm },
  body: { padding: space.base, paddingBottom: space.huge, gap: space.md },

  sectionLabel: { marginTop: space.lg, marginBottom: space.xs, letterSpacing: 1.5 },
  payHint: { marginBottom: space.md, lineHeight: 18 },
  ordersLink: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.accent2, borderRadius: radius.md, padding: space.base, marginTop: space.xs },
  ordersEmoji: { fontSize: 20, lineHeight: 26 },
  field: { gap: 6 },
  input: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.textHi, fontFamily: fonts.body, fontSize: 15 },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 1 },

  galleryRow: { gap: space.sm, paddingVertical: space.xs },
  thumbWrap: { width: 88, height: 112, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bgElevated2, borderWidth: 1, borderColor: colors.line },
  galleryThumb: { width: '100%', height: '100%' },
  coverBadge: { position: 'absolute', left: 4, bottom: 4, backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 6 },
  coverBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, color: colors.onAccent },
  coverSet: { position: 'absolute', left: 4, bottom: 4, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 6 },
  coverSetText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.textHi },
  thumbDel: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  addTile: { width: 88, height: 112, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.bgElevated },

  themeLabel: { marginTop: space.xs },
  themeRow: { flexDirection: 'row', gap: space.sm },
  themeCell: { flex: 1, alignItems: 'center', gap: 6 },
  swatch: { width: '100%', height: 46, borderRadius: radius.md, borderWidth: 2, overflow: 'hidden', flexDirection: 'row' },
  swatchOn: { borderWidth: 2 },
  swatchFill: { flex: 1 },
  themeName: { marginTop: 2 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.base },

  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 6 },
  sizeChip: { minWidth: 44, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated },
  sizeChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  sizeChipGone: { backgroundColor: colors.danger, borderColor: colors.danger },
  soldLabel: { marginTop: space.sm },

  msg: { marginTop: space.xs },
  submit: { marginTop: space.sm },
  cancelEdit: { alignItems: 'center', paddingVertical: space.md },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.sm, paddingRight: space.xs },
  listRowMuted: { opacity: 0.55 },
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.bgElevated2 },
  rowBtn: { padding: 8 },
});
