import React, { useState } from 'react';
import { View, Image, Pressable, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { blobFromUri, uploadBlobToR2 } from '../lib/r2';
import { compressForUpload } from '../lib/image';
import { useCreateStory } from '../lib/social/hooks';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

// Story builder — ONE photo + optional caption, posted as an ephemeral Story (24h),
// NOT a feed post (that separation is the whole point of Stage 2). The photo uploads
// to R2 as soon as it's picked, so "Share" only writes the tiny stories row. The
// preview is full-bleed on black, mirroring how the viewer renders it.
export default function ComposeStoryScreen({ navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const userId = session?.user?.id ?? null;

  const [uri, setUri] = useState(null);          // local optimized uri (preview)
  const [mediaUrl, setMediaUrl] = useState(null); // uploaded R2 url (set when upload done)
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const create = useCreateStory();

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add a story.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(true);
    setMediaUrl(null);
    try {
      const optimized = await compressForUpload(asset.uri, asset.width, asset.height);
      setUri(optimized);
      const blob = await blobFromUri(optimized);
      const url = await uploadBlobToR2(blob, 'image/jpeg');
      setMediaUrl(url);
    } catch (e) {
      Alert.alert('Upload failed', String(e.message ?? e));
      setUri(null);
    } finally {
      setUploading(false);
    }
  };

  const share = () => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    if (!mediaUrl) { Alert.alert('Add a photo', 'A story needs a photo.'); return; }
    create.mutate(
      { userId, mediaUrl, caption, market },
      {
        onSuccess: () => navigation.goBack(),
        onError: (e) => Alert.alert('Could not post', String(e.message ?? e)),
      },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAwareView style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}><Icon name="close" size={22} color="#fff" /></Pressable>
          <AppText variant="heading" color="#fff">New story</AppText>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.stage}>
          {uri ? (
            <>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} blurRadius={24} resizeMode="cover" />
              <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              {uploading ? <View style={styles.stageOverlay}><ActivityIndicator color="#fff" /></View> : null}
              {caption ? (
                <View style={styles.captionPreview} pointerEvents="none">
                  <AppText variant="body" color="#fff" style={styles.captionPreviewText}>{caption}</AppText>
                </View>
              ) : null}
            </>
          ) : (
            <Pressable style={styles.pickArea} onPress={pick} disabled={uploading}>
              {uploading ? <ActivityIndicator color={colors.accent} /> : (
                <>
                  <Icon name="image" size={40} color={colors.textLo} />
                  <AppText variant="body" color={colors.textLo} style={styles.pickHint}>Tap to pick a photo</AppText>
                </>
              )}
            </Pressable>
          )}
        </View>

        {uri ? (
          <TextInput
            style={styles.caption}
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption (optional)"
            placeholderTextColor="rgba(255,255,255,0.55)"
            maxLength={200}
          />
        ) : null}

        <View style={styles.footer}>
          {uri
            ? <Pressable onPress={pick} disabled={uploading} hitSlop={8}><AppText variant="label" color={colors.textLo}>Replace photo</AppText></Pressable>
            : <View />}
          <Button label="Share to story" full={false} loading={create.isPending} disabled={!mediaUrl || uploading} onPress={share} />
        </View>
      </KeyboardAwareView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md },
  stage: { flex: 1, marginHorizontal: space.base, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' },
  stageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  pickArea: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  pickHint: { marginTop: space.sm },
  captionPreview: { position: 'absolute', left: space.base, right: space.base, bottom: space.lg },
  captionPreviewText: { textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  caption: { color: '#fff', fontFamily: fonts.body, fontSize: 15, paddingHorizontal: space.base, paddingVertical: space.md },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, padding: space.base },
});
