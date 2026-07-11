import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useMarket } from '../providers/MarketProvider';
import { fetchAllDrops, createDrop, deleteDrop } from '../lib/drops/dropsRepository';
import { uploadBlobToR2 } from '../lib/r2';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Icon } from '../components/ui/Icon';

const MARKETS = [['DZ', 'Algeria'], ['ZW', 'Zimbabwe']];

// Labeled input row. `kind` toggles keyboard for the numeric fields.
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
        multiline={multiline}
        autoCapitalize={kind === 'url' ? 'none' : 'sentences'}
        autoCorrect={kind !== 'url'}
      />
    </View>
  );
}

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Admin: author a new 4Forty4 Drop and manage existing ones. Writes go through the
// SECURITY DEFINER create_drop / delete_drop RPCs (server re-checks is_admin()).
export default function CreateDropScreen({ navigation }) {
  const { market: activeMarket } = useMarket();
  const [market, setMarket] = useState(activeMarket ?? 'DZ');
  const [title, setTitle] = useState('');
  const [teaser, setTeaser] = useState('');
  const [venueName, setVenueName] = useState('');
  const [category, setCategory] = useState('nightlife');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [allocation, setAllocation] = useState('44');
  const [dropInHours, setDropInHours] = useState('0');   // 0 = live immediately
  const [openForDays, setOpenForDays] = useState('30');

  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const [drops, setDrops] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try { setDrops(await fetchAllDrops()); }
    catch { /* list is best-effort */ }
    finally { setLoadingList(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!title.trim()) { setError('Title is required.'); return; }
    const alloc = parseInt(allocation, 10);
    if (!alloc || alloc <= 0) { setError('Allocation must be a positive number.'); return; }

    const hours = Number(dropInHours) || 0;
    const days = Number(openForDays) || 0;
    const dropAt = new Date(Date.now() + hours * 3600e3);
    const endsAt = days > 0 ? new Date(dropAt.getTime() + days * 86400e3) : null;

    setSubmitting(true);
    try {
      await createDrop({
        market, title, teaser, venueName, category,
        coverImageUrl, allocation: alloc,
        dropAt: dropAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
      });
      setNotice(hours > 0 ? `Drop created — goes live in ${hours}h.` : 'Drop created — live now.');
      setTitle(''); setTeaser(''); setVenueName(''); setCoverImageUrl('');
      loadList();
    } catch (e) {
      const m = e?.message || '';
      if (m === 'NOT_ADMIN') setError('You are not an admin.');
      else if (m === 'TITLE_REQUIRED') setError('Title is required.');
      else if (m === 'BAD_ALLOCATION') setError('Allocation must be a positive number.');
      else setError('Could not create the drop. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    try { await deleteDrop(id); loadList(); }
    catch { setError('Could not delete that drop.'); }
  };

  // Optional convenience: pick from the library and upload, filling the cover URL. The
  // URL field stays usable for pasting a link directly — either path sets coverImageUrl.
  const pickImage = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Photo library permission denied.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const blob = await (await fetch(res.assets[0].uri)).blob();
      const url = await uploadBlobToR2(blob, res.assets[0].mimeType ?? 'image/jpeg');
      setCoverImageUrl(url);
      setNotice('Image uploaded.');
    } catch { setError('Upload failed — paste a URL instead.'); }
    finally { setUploading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading">Create Drop</AppText>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.marketRow}>
          {MARKETS.map(([code, name]) => (
            <Chip key={code} label={name} selected={market === code} onPress={() => setMarket(code)} />
          ))}
        </View>

        <Field label="TITLE" value={title} onChangeText={setTitle} placeholder="Rooftop Secret Set — Algiers" />
        <Field label="TEASER (shown while veiled)" value={teaser} onChangeText={setTeaser} placeholder="A hidden rooftop. One night. 44 spots." multiline />
        <Field label="VENUE / LOCATION LABEL" value={venueName} onChangeText={setVenueName} placeholder="Undisclosed · Algiers" />
        <Field label="CATEGORY" value={category} onChangeText={setCategory} placeholder="nightlife" />
        <View style={styles.field}>
          <AppText variant="label" color={colors.textLo}>COVER IMAGE</AppText>
          <TextInput
            style={styles.input}
            value={coverImageUrl}
            onChangeText={setCoverImageUrl}
            placeholder="Paste an image URL…"
            placeholderTextColor={colors.textMute}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.coverRow}>
            <Button
              label={uploading ? 'Uploading…' : 'Pick from library'}
              variant="secondary"
              icon="image"
              onPress={pickImage}
              loading={uploading}
              full={false}
              style={styles.pickBtn}
            />
            {coverImageUrl ? <Image source={{ uri: coverImageUrl }} style={styles.thumb} /> : null}
          </View>
        </View>

        <View style={styles.numRow}>
          <View style={styles.numCell}><Field label="ALLOCATION" value={allocation} onChangeText={setAllocation} kind="num" /></View>
          <View style={styles.numCell}><Field label="DROPS IN (HOURS)" value={dropInHours} onChangeText={setDropInHours} kind="num" /></View>
          <View style={styles.numCell}><Field label="OPEN FOR (DAYS)" value={openForDays} onChangeText={setOpenForDays} kind="num" /></View>
        </View>
        <AppText variant="caption" color={colors.textMute} style={styles.hint}>
          Drops-in 0 = live immediately. Open-for 0 = no hard close.
        </AppText>

        {error ? <AppText variant="body" color={colors.danger} style={styles.msg}>{error}</AppText> : null}
        {notice ? <AppText variant="body" color={colors.accent} style={styles.msg}>{notice}</AppText> : null}

        <Button label="Create Drop" onPress={submit} loading={submitting} icon="plus" style={styles.submit} />

        <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>EXISTING DROPS</AppText>
        {loadingList ? (
          <AppText variant="body" color={colors.textLo}>Loading…</AppText>
        ) : drops.length === 0 ? (
          <AppText variant="body" color={colors.textLo}>No drops yet.</AppText>
        ) : (
          drops.map((d) => (
            <View key={d.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodySemi" color={colors.textHi} numberOfLines={1}>{d.title}</AppText>
                <AppText variant="label" color={colors.textLo}>
                  {d.market} · {d.status} · {d.claimedCount}/{d.allocation} · {fmt(d.dropAt)}
                </AppText>
              </View>
              <TouchableOpacity onPress={() => remove(d.id)} hitSlop={8} style={styles.del}>
                <Icon name="trash" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.sm },
  body: { padding: space.base, paddingBottom: space.huge, gap: space.md },
  marketRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.xs },
  field: { gap: 6 },
  input: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.textHi, fontFamily: fonts.body, fontSize: 15 },
  inputMulti: { minHeight: 62, textAlignVertical: 'top' },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: 2 },
  pickBtn: { flex: 1 },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  numRow: { flexDirection: 'row', gap: space.sm },
  numCell: { flex: 1 },
  hint: { marginTop: -space.xs },
  msg: { marginTop: space.xs },
  submit: { marginTop: space.sm },
  sectionLabel: { marginTop: space.lg, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md },
  del: { padding: 4 },
});
