import React, { useState } from 'react';
import {
  Modal, View, TextInput, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useLocale } from '../../providers/LocaleProvider';
import { CATEGORIES } from '../../lib/categories';
import { uploadBlobToR2 } from '../../lib/r2';
import { useSaveEvent } from '../../lib/organizer/hooks';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';

// Wall-clock (market-local) "YYYY-MM-DD HH:MM" -> UTC ISO, using the app's fixed
// market offsets (same model the feed/detail display use).
function toStartISO(str, market) {
  const m = (str ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const offset = market === 'ZW' ? 2 : 1;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - offset, +m[5])).toISOString();
}

export function EventComposer({ visible, onClose, userId, organizerId, market, venues = [], existing }) {
  const { t } = useLocale();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [when, setWhen] = useState('');
  const [venueId, setVenueId] = useState(existing?.venueId ?? (venues[0]?.id ?? null));
  const [category, setCategory] = useState(existing?.category ?? 'music_event');
  const [price, setPrice] = useState(existing?.price != null ? String(existing.price) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [coverUrl, setCoverUrl] = useState(existing?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const save = useSaveEvent(userId, organizerId, existing?.id);

  const addCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const blob = await (await fetch(res.assets[0].uri)).blob();
      setCoverUrl(await uploadBlobToR2(blob, res.assets[0].mimeType ?? 'image/jpeg'));
    } catch (e) { Alert.alert('Upload failed', String(e.message ?? e)); } finally { setUploading(false); }
  };

  const startTime = existing ? undefined : toStartISO(when, market);
  const canSave = title.trim() && (existing || startTime);

  const submit = () => {
    if (!canSave) return;
    const patch = {
      title: title.trim(), category, description,
      price: price === '' ? null : Number(price),
      currency: market === 'ZW' ? 'USD' : 'DZD',
      coverImageUrl: coverUrl, venueId, market,
    };
    if (startTime) patch.startTime = startTime;
    save.mutate(patch, { onSuccess: onClose, onError: (e) => Alert.alert('Could not save', String(e.message ?? e)) });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
       <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}><AppText style={styles.close}>✕</AppText></TouchableOpacity>
          <AppText variant="heading">{existing ? t('organizer.editEvent') : t('organizer.newEvent')}</AppText>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <AppText variant="label" color={colors.textLo} style={styles.label}>{t('organizer.eventTitle')}</AppText>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={colors.textMute} />

          {!existing ? (
            <>
              <AppText variant="label" color={colors.textLo} style={styles.label}>{t('organizer.eventDate')}</AppText>
              <TextInput style={styles.input} value={when} onChangeText={setWhen} placeholder="2026-08-01 20:00" placeholderTextColor={colors.textMute} />
            </>
          ) : null}

          {venues.length > 0 ? (
            <>
              <AppText variant="label" color={colors.textLo} style={styles.label}>{t('organizer.myVenues')}</AppText>
              <View style={styles.wrapRow}>
                {venues.map((v) => (
                  <Chip key={v.id} label={v.title} selected={venueId === v.id} onPress={() => setVenueId(v.id)} style={styles.venueChip} />
                ))}
              </View>
            </>
          ) : null}

          <AppText variant="label" color={colors.textLo} style={styles.label}>{t('profile.favoriteCategories')}</AppText>
          <View style={styles.wrapRow}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>

          <AppText variant="label" color={colors.textLo} style={styles.label}>{market === 'ZW' ? 'Price (USD)' : 'Price (DZD)'}</AppText>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor={colors.textMute} />

          <AppText variant="label" color={colors.textLo} style={styles.label}>{t('organizer.description')}</AppText>
          <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline maxLength={500} placeholderTextColor={colors.textMute} />

          <TouchableOpacity style={styles.coverBtn} onPress={addCover} disabled={uploading}>
            {uploading ? <ActivityIndicator color={colors.accent} /> : coverUrl ? <Image source={{ uri: coverUrl }} style={styles.coverPreview} /> : <AppText color={colors.textLo}>{t('organizer.cover')}</AppText>}
          </TouchableOpacity>
          <View style={{ height: space.lg }} />
        </ScrollView>

        <View style={styles.footer}>
          <Button label={existing ? t('organizer.save') : t('organizer.create')} loading={save.isPending} disabled={!canSave} onPress={submit} />
        </View>
       </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  close: { fontSize: 20, color: colors.textHi },
  content: { padding: space.lg },
  label: { marginTop: space.base, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  venueChip: { maxWidth: 200 },
  coverBtn: { marginTop: space.base, height: 120, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverPreview: { width: '100%', height: '100%' },
  footer: { padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
