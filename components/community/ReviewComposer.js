import React, { useState } from 'react';
import {
  Modal, View, TextInput, TouchableOpacity, Image, ScrollView, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { StarRating } from './StarRating';
import { useLocale } from '../../providers/LocaleProvider';
import { uploadBlobToR2 } from '../../lib/r2';
import { useSaveReview } from '../../lib/community/hooks';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { Button } from '../ui/Button';

// Review composer modal (dark). 1–5 star selector, optional title, body, and photo
// preview boxes that upload to R2. Handles both new reviews and editing your own.
export function ReviewComposer({ visible, onClose, target, userId, market, existing }) {
  const { t } = useLocale();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [photoUrls, setPhotoUrls] = useState(existing?.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const save = useSaveReview(target, userId, existing?.id);

  const addPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add photos.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const url = await uploadBlobToR2(blob, asset.mimeType ?? 'image/jpeg');
      setPhotoUrls((p) => [...p, url]);
    } catch (e) {
      Alert.alert('Upload failed', String(e.message ?? e));
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (rating < 1) return;
    save.mutate(
      { rating, title, body, photoUrls, market },
      { onSuccess: onClose, onError: (e) => Alert.alert('Could not post', String(e.message ?? e)) },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
       <KeyboardAwareView style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}><AppText style={styles.close}>✕</AppText></TouchableOpacity>
          <AppText variant="heading">{existing ? t('community.editReview') : t('community.writeReview')}</AppText>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="label" color={colors.textLo} style={styles.label}>{t('community.ratingLabel')}</AppText>
          <StarRating value={rating} onChange={setRating} size={34} />

          <TextInput
            style={[styles.input, { marginTop: 20 }]}
            value={title} onChangeText={setTitle}
            placeholder={t('community.titlePlaceholder')} placeholderTextColor={colors.textMute} maxLength={80}
          />
          <TextInput
            style={[styles.input, styles.body]}
            value={body} onChangeText={setBody}
            placeholder={t('community.bodyPlaceholder')} placeholderTextColor={colors.textMute}
            multiline maxLength={1000}
          />

          <View style={styles.photoRow}>
            {photoUrls.map((uri, i) => (
              <View key={i} style={styles.photoBox}>
                <Image source={{ uri }} style={styles.photo} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoUrls(photoUrls.filter((_, j) => j !== i))}>
                  <AppText color="#fff" style={styles.photoRemoveText}>✕</AppText>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addPhoto} onPress={addPhoto} disabled={uploading}>
              {uploading ? <ActivityIndicator color={colors.accent} /> : <AppText style={styles.addPhotoText} color={colors.textLo}>＋</AppText>}
            </TouchableOpacity>
          </View>
          <AppText variant="caption" color={colors.textMute} style={styles.hint}>{t('community.addPhotos')}</AppText>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={existing ? t('community.updateReview') : t('community.postReview')}
            loading={save.isPending}
            disabled={rating < 1}
            onPress={submit}
          />
        </View>
       </KeyboardAwareView>
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
  label: { marginBottom: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, marginTop: space.md },
  body: { minHeight: 120, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.base },
  photoBox: { position: 'relative' },
  photo: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  photoRemove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bgElevated2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { fontSize: 12 },
  addPhoto: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addPhotoText: { fontSize: 28 },
  hint: { marginTop: space.sm },
  footer: { padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
