import React, { useState } from 'react';
import { View, TextInput, Image, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocation } from '../providers/LocationProvider';
import { blobFromUri, uploadBlobToR2 } from '../lib/r2';
import { compressForUpload } from '../lib/image';
import { useCreatePost } from '../lib/social/hooks';
import { COMPOSER_TYPES, experienceMeta } from '../lib/social/experiences';
import { VenuePickerModal } from '../components/coordination/VenuePickerModal';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

const MAX_PHOTOS = 4;

// Share Your Experience — the Explorer Network's create flow.
//
// This is not "post a photo". The user declares WHEN the experience is happening, and
// that declaration is what the feed ranks on. Two rules keep it honest:
//
//   - "Live Now" and "On My Way" are about a specific place, so they require one.
//   - "Live Now" is the only claim the app can check, and it is checked SERVER-SIDE:
//     we send coordinates to create_experience_post, which measures the distance to the
//     tagged place and decides. If it doesn't check out the post is stored as a Memory,
//     and we say so rather than pretending it worked.
export default function ComposeMomentScreen({ navigation, route }) {
  const { session } = useSession();
  const { market } = useMarket();
  const { coords, status: locStatus, request: requestLocation } = useLocation();
  const userId = session?.user?.id ?? null;

  const [place, setPlace] = useState(route?.params?.place ?? null); // { kind, id, name } | null
  const [type, setType] = useState(route?.params?.experienceType ?? 'memory');
  const [photoUrls, setPhotoUrls] = useState([]);
  const [body, setBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const create = useCreatePost();

  const meta = experienceMeta(type);
  const needsPlace = meta.requiresPlace && !place;
  // A post needs *something* to say — a photo or words. "On my way to Tipaza" is a
  // legitimate post with no picture yet.
  const hasContent = photoUrls.length > 0 || body.trim().length > 0;

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

  // Picking "Live Now" needs location up front, so the verification line can tell the
  // user what will happen BEFORE they write the post.
  const onSelectType = async (next) => {
    setType(next);
    if (experienceMeta(next).requiresPlace && !place) setPickerOpen(true);
    if (next === 'live' && !coords) {
      setLocating(true);
      try { await requestLocation(); } finally { setLocating(false); }
    }
  };

  const submit = async () => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    if (!hasContent) { Alert.alert('Add something', 'Share a photo or a few words.'); return; }
    if (needsPlace) { setPickerOpen(true); return; }

    // Last chance to get a fix — without one, a live claim can only be a memory.
    let where = coords;
    if (type === 'live' && !where) {
      setLocating(true);
      try { where = await requestLocation(); } finally { setLocating(false); }
    }

    create.mutate(
      { body, photoUrls, place, market, experienceType: type, coords: where },
      {
        onSuccess: (res) => {
          // Say plainly when the claim was downgraded — never silently.
          if (type === 'live' && res?.verification !== 'verified') {
            Alert.alert(
              'Shared as a Memory',
              `We couldn’t confirm you’re at ${place?.name ?? 'this place'} right now, so this went up without the Live badge. It’s still on the feed.`,
              [{ text: 'OK', onPress: () => navigation.goBack() }],
            );
            return;
          }
          navigation.goBack();
        },
        onError: (e) => Alert.alert('Could not share', String(e.message ?? e)),
      },
    );
  };

  // What the user is promised before posting, stated in terms they can act on.
  const verificationHint = () => {
    if (type !== 'live') return null;
    if (!place) return 'Pick the place you’re at to go live.';
    if (locStatus === 'denied') return 'Location is off, so this will post as a Memory. Turn it on to earn the Live badge.';
    if (locating || (!coords && locStatus === 'requesting')) return 'Getting your location…';
    if (!coords) return 'We’ll check your location when you post.';
    return `We’ll confirm you’re at ${place.name} — verified posts get the green Live badge.`;
  };
  const hint = verificationHint();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Icon name="close" size={22} color={colors.textHi} /></TouchableOpacity>
          <AppText variant="heading">Share Your Experience</AppText>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* When is this happening? The answer drives the badge and the feed's ranking. */}
          <View style={styles.typeRow}>
            {COMPOSER_TYPES.map((id) => {
              const m = experienceMeta(id);
              const on = type === id;
              return (
                <Pressable
                  key={id}
                  style={[styles.typeChip, on && { borderColor: m.color, backgroundColor: `${m.color}1F` }]}
                  onPress={() => onSelectType(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <AppText style={styles.typeGlyph}>{m.glyph}</AppText>
                  <AppText variant="label" color={on ? m.color : colors.textLo}>{m.label}</AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="caption" color={colors.textMute} style={styles.hint}>{meta.hint}</AppText>

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
          <AppText variant="caption" color={colors.textMute} style={styles.hint}>Up to {MAX_PHOTOS} photos — optional</AppText>

          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder={type === 'on_the_way' ? 'Where are you heading?' : 'What’s the experience like?'}
            placeholderTextColor={colors.textMute}
            multiline
            maxLength={1000}
          />

          {/* The place. Required for the present-tense types, optional otherwise. */}
          <Pressable style={styles.placeRow} onPress={() => setPickerOpen(true)}>
            <Icon name="pin" size={15} color={place ? colors.accent2 : colors.textMute} />
            <AppText variant="label" color={place ? colors.textHi : colors.textMute} numberOfLines={1} style={styles.placeText}>
              {place ? place.name : meta.requiresPlace ? 'Pick the place — required' : 'Tag a place (optional)'}
            </AppText>
            {place ? (
              <Pressable onPress={() => setPlace(null)} hitSlop={8} accessibilityLabel="Clear place">
                <Icon name="close" size={15} color={colors.textLo} />
              </Pressable>
            ) : (
              <Icon name="chevronRight" size={16} color={colors.textMute} />
            )}
          </Pressable>

          {hint ? (
            <View style={[styles.verifyBox, { borderColor: `${meta.color}66` }]}>
              <AppText style={styles.verifyGlyph}>{meta.glyph}</AppText>
              <AppText variant="caption" color={colors.textLo} style={styles.verifyText}>{hint}</AppText>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={needsPlace ? 'Pick a place' : 'Share'}
            loading={create.isPending || locating}
            disabled={!hasContent || uploading}
            onPress={submit}
          />
        </View>
      </KeyboardAwareView>

      <VenuePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        market={market}
        onPick={(v) => { setPlace({ kind: 'venue', id: v.id, name: v.name }); setPickerOpen(false); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  content: { padding: space.lg },

  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12 },
  typeGlyph: { fontSize: 14 },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  photoBox: { position: 'relative' },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  photoRemove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bgElevated2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: space.sm },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, minHeight: 120, textAlignVertical: 'top', marginTop: space.lg },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.base, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 12 },
  placeText: { flex: 1 },
  verifyBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: space.md, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  verifyGlyph: { fontSize: 13, lineHeight: 18 },
  verifyText: { flex: 1, lineHeight: 18 },
  footer: { padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
