import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '../ui/Icon';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { uploadBlobToR2 } from '../../lib/r2';
import { compressForUpload } from '../../lib/image';

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|heic)(\?|#|$)/i;

// "Add to gallery" chooser for the venue editor. Two paths, both ending in a permanent
// R2 URL the parent appends to the gallery:
//   • Device  — the local asset picker (same path as the cover picker).
//   • Web link — fetch the pasted URL right now, re-host it to R2 (so it can't rot when
//     the source expires/hotlink-blocks), then commit. Fetch/host failures surface inline.
export function AddGalleryPhotoSheet({ visible, onClose, onAdded }) {
  const [mode, setMode] = useState('choose'); // 'choose' | 'url'
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) { setMode('choose'); setUrl(''); setError(null); setBusy(false); }
  }, [visible]);

  const finish = (r2url) => { onAdded(r2url); onClose(); };

  const pickFromDevice = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Allow photo access to add from your device.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      // Downscale + compress on-device before upload — huge phone photos become light
      // JPEGs, so both the upload and every later gallery render are fast. Output is JPEG.
      const optimizedUri = await compressForUpload(asset.uri, asset.width, asset.height);
      const blob = await (await fetch(optimizedUri)).blob();
      finish(await uploadBlobToR2(blob, 'image/jpeg'));
    } catch {
      setError('Could not upload that photo. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const fetchFromUrl = async () => {
    const link = url.trim();
    if (!link) { setError('Paste an image link first.'); return; }
    if (!/^https?:\/\//i.test(link)) { setError('The link must start with http:// or https://'); return; }
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(link);
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const blob = await resp.blob();
      const type = blob.type || '';
      // Guard against fetching an HTML error page instead of an actual image.
      if (!type.startsWith('image/') && !IMG_EXT.test(link)) throw new Error('not an image');
      finish(await uploadBlobToR2(blob, type || 'image/jpeg'));
    } catch {
      setError('Unable to grab image from this URL. Please try another link or upload a file instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAwareView>
        <View style={styles.fill}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.headRow}>
              {mode === 'url' ? (
                <Pressable onPress={() => { setMode('choose'); setError(null); }} hitSlop={10} style={styles.back}>
                  <Icon name="chevronLeft" size={22} color={colors.textHi} />
                </Pressable>
              ) : <View style={styles.back} />}
              <AppText variant="title" style={styles.title}>{mode === 'url' ? 'Paste image link' : 'Add a photo'}</AppText>
              <View style={styles.back} />
            </View>

            {mode === 'choose' ? (
              <>
                <Pressable onPress={pickFromDevice} disabled={busy} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
                  <View style={styles.optIcon}><AppText style={styles.optEmoji}>📁</AppText></View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySemi">Choose from Gallery / Device</AppText>
                    <AppText variant="label" color={colors.textLo}>Pick a photo already on your phone.</AppText>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMute} />
                </Pressable>

                <Pressable onPress={() => { setMode('url'); setError(null); }} disabled={busy} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
                  <View style={styles.optIcon}><AppText style={styles.optEmoji}>🔗</AppText></View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySemi">Paste Web Image Link</AppText>
                    <AppText variant="label" color={colors.textLo}>We fetch it and save it to your storage.</AppText>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textMute} />
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={(v) => { setUrl(v); if (error) setError(null); }}
                  placeholder="https://example.com/photo.jpg"
                  placeholderTextColor={colors.textMute}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  autoFocus
                  editable={!busy}
                  onSubmitEditing={fetchFromUrl}
                  returnKeyType="done"
                />
                <Pressable onPress={fetchFromUrl} disabled={busy} style={({ pressed }) => [styles.confirm, busy && styles.confirmOff, pressed && !busy && styles.confirmPressed]}>
                  {busy ? <ActivityIndicator color={colors.onAccent} /> : (
                    <>
                      <Icon name="check" size={18} color={colors.onAccent} />
                      <AppText variant="label" color={colors.onAccent}>Fetch & add to gallery</AppText>
                    </>
                  )}
                </Pressable>
              </>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <AppText variant="label" color={colors.danger} style={styles.errorText}>{error}</AppText>
              </View>
            ) : null}

            {busy && mode === 'choose' ? (
              <View style={styles.busyRow}><ActivityIndicator color={colors.accent} /><AppText variant="label" color={colors.textLo}>Uploading…</AppText></View>
            ) : null}

            <View style={{ height: space.sm }} />
          </View>
        </View>
      </KeyboardAwareView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.sm },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.base },
  back: { width: 40, alignItems: 'flex-start' },
  title: { flex: 1, textAlign: 'center' },

  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginBottom: space.md },
  optionPressed: { backgroundColor: colors.bgElevated2, borderColor: colors.glassBorder },
  optIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.bgElevated2, alignItems: 'center', justifyContent: 'center' },
  optEmoji: { fontSize: 22, lineHeight: 28 },

  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, marginBottom: space.md },
  confirm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 15 },
  confirmPressed: { backgroundColor: colors.accentPress },
  confirmOff: { opacity: 0.6 },

  errorBox: { marginTop: space.md, backgroundColor: 'rgba(229,96,94,0.1)', borderWidth: 1, borderColor: 'rgba(229,96,94,0.35)', borderRadius: radius.md, padding: space.md },
  errorText: { lineHeight: 19 },

  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', marginTop: space.md },
});
