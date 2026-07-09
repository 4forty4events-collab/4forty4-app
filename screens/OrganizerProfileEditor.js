import React, { useState } from 'react';
import {
  View, TextInput, ScrollView, TouchableOpacity, Image, Alert, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useLocale } from '../providers/LocaleProvider';
import { uploadBlobToR2 } from '../lib/r2';
import { useSaveOrganizer } from '../lib/organizer/hooks';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';

// Hoisted so each keystroke doesn't remount the input (which would drop focus).
function LabeledInput({ label, value, onChangeText, placeholder, keyboardType }) {
  return (
    <>
      <AppText variant="label" color={colors.textLo} style={styles.label}>{label}</AppText>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMute}
        autoCapitalize="none"
        keyboardType={keyboardType}
      />
    </>
  );
}

// Create OR edit an organizer profile. Branding (logo/cover via R2) + contact set.
export default function OrganizerProfileEditor({ route, navigation }) {
  const existing = route.params?.organizer ?? null;
  const { session } = useSession();
  const { market } = useMarket();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [logoUrl, setLogoUrl] = useState(existing?.logoUrl ?? null);
  const [coverUrl, setCoverUrl] = useState(existing?.coverUrl ?? null);
  const [contactEmail, setEmail] = useState(existing?.contactEmail ?? '');
  const [contactPhone, setPhone] = useState(existing?.contactPhone ?? '');
  const [contactWhatsapp, setWhatsapp] = useState(existing?.contactWhatsapp ?? '');
  const [website, setWebsite] = useState(existing?.website ?? '');
  const [instagram, setInstagram] = useState(existing?.instagram ?? '');
  const [uploading, setUploading] = useState(null); // 'logo' | 'cover' | null

  const save = useSaveOrganizer(userId, existing?.id);

  const pickImage = async (which) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(which);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const url = await uploadBlobToR2(blob, asset.mimeType ?? 'image/jpeg');
      (which === 'logo' ? setLogoUrl : setCoverUrl)(url);
    } catch (e) {
      Alert.alert('Upload failed', String(e.message ?? e));
    } finally {
      setUploading(null);
    }
  };

  const submit = () => {
    if (!name.trim()) return;
    save.mutate(
      { name: name.trim(), description, logoUrl, coverUrl, contactEmail, contactPhone, contactWhatsapp, website, instagram, market },
      { onSuccess: () => navigation.goBack(), onError: (e) => Alert.alert('Could not save', String(e.message ?? e)) },
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
     <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
        <AppText variant="heading">{existing ? t('organizer.manageBusiness') : t('organizer.onboardTitle')}</AppText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {!existing ? <AppText variant="body" color={colors.textLo} style={styles.intro}>{t('organizer.onboardBody')}</AppText> : null}

        {/* Cover + logo */}
        <TouchableOpacity style={styles.coverBox} onPress={() => pickImage('cover')}>
          {coverUrl ? <Image source={{ uri: coverUrl }} style={styles.cover} /> : <AppText color={colors.textLo}>{uploading === 'cover' ? '…' : `＋ ${t('organizer.cover')}`}</AppText>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoBox} onPress={() => pickImage('logo')}>
          {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logo} /> : <AppText variant="caption" color={colors.textLo}>{uploading === 'logo' ? '…' : t('organizer.logo')}</AppText>}
        </TouchableOpacity>

        <LabeledInput label={t('organizer.name')} value={name} onChangeText={setName} placeholder="…" />
        <AppText variant="label" color={colors.textLo} style={styles.label}>{t('organizer.description')}</AppText>
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline maxLength={300} placeholderTextColor={colors.textMute} />

        <LabeledInput label={t('organizer.whatsapp')} value={contactWhatsapp} onChangeText={setWhatsapp} placeholder="213…" keyboardType="phone-pad" />
        <LabeledInput label={t('organizer.phone')} value={contactPhone} onChangeText={setPhone} keyboardType="phone-pad" />
        <LabeledInput label={t('organizer.email')} value={contactEmail} onChangeText={setEmail} keyboardType="email-address" />
        <LabeledInput label={t('organizer.website')} value={website} onChangeText={setWebsite} placeholder="https://…" />
        <LabeledInput label={t('organizer.instagram')} value={instagram} onChangeText={setInstagram} placeholder="@handle" />

        <View style={{ height: space.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <Button label={existing ? t('organizer.save') : t('organizer.create')} loading={save.isPending} disabled={!name.trim()} onPress={submit} />
      </View>
     </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  content: { padding: space.lg },
  intro: { marginBottom: space.base, lineHeight: 20 },
  coverBox: { height: 120, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cover: { width: '100%', height: '100%' },
  logoBox: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.bgElevated2, alignItems: 'center', justifyContent: 'center', marginTop: -36, marginLeft: space.base, borderWidth: 3, borderColor: colors.bgBase, overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
  label: { marginTop: space.base, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  footer: { padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
