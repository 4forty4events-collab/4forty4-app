import React, { useState } from 'react';
import { View, TextInput, Image, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { blobFromUri, uploadBlobToR2 } from '../lib/r2';
import { compressForUpload } from '../lib/image';
import { useCreatePost } from '../lib/social/hooks';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

const MAX_PHOTOS = 4;

// Share a Moment — the Feed's create flow. Photo(s) + caption + an optional place tag
// (passed in when composing from a listing). Photos are compressed and uploaded to R2 before
// the post row is written, so photo_urls are always permanent public URLs.
export default function ComposeMomentScreen({ navigation, route }) {
  const { session } = useSession();
  const { market } = useMarket();
  const userId = session?.user?.id ?? null;
  const place = route?.params?.place ?? null; // { kind, id, name } | null

  const [photoUrls, setPhotoUrls] = useState([]);
  const [body, setBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const create = useCreatePost();

  const addPhoto = async () => {
    if (photoUrls.length >= MAX_PHOTOS) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add a photo.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const optimized = await compressForUpload(asset.uri, asset.width, asset.height);
      const blob = await blobFromUri(optimized);
      const url = await uploadBlobToR2(blob, 'image/jpeg');
      setPhotoUrls((p) => [...p, url]);
    } catch (e) {
      Alert.alert('Upload failed', String(e.message ?? e));
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    if (photoUrls.length === 0) { Alert.alert('Add a photo', 'A moment needs at least one photo.'); return; }
    create.mutate(
      { userId, body, photoUrls, place, market },
      {
        onSuccess: () => navigation.goBack(),
        onError: (e) => Alert.alert('Could not share', String(e.message ?? e)),
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Icon name="close" size={22} color={colors.textHi} /></TouchableOpacity>
          <AppText variant="heading">Share a Moment</AppText>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.photoRow}>
            {photoUrls.map((uri, i) => (
              <View key={uri} style={styles.photoBox}>
                <Image source={{ uri }} style={styles.photo} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoUrls(photoUrls.filter((_, j) => j !== i))}>
                  <Icon name="close" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {photoUrls.length < MAX_PHOTOS && (
              <TouchableOpacity style={styles.addPhoto} onPress={addPhoto} disabled={uploading}>
                {uploading ? <ActivityIndicator color={colors.accent} /> : <Icon name="plus" size={26} color={colors.textLo} />}
              </TouchableOpacity>
            )}
          </View>
          <AppText variant="caption" color={colors.textMute} style={styles.hint}>Add up to {MAX_PHOTOS} photos</AppText>

          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder="What was the experience like?"
            placeholderTextColor={colors.textMute}
            multiline
            maxLength={1000}
          />

          {place ? (
            <View style={styles.placeRow}>
              <Icon name="pin" size={15} color={colors.accent2} />
              <AppText variant="label" color={colors.textHi}>{place.name}</AppText>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Share" loading={create.isPending} disabled={photoUrls.length === 0 || uploading} onPress={submit} />
        </View>
      </KeyboardAwareView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  content: { padding: space.lg },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photoBox: { position: 'relative' },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  photoRemove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bgElevated2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, minHeight: 120, textAlignVertical: 'top', marginTop: space.lg },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.base, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, alignSelf: 'flex-start' },
  footer: { padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
