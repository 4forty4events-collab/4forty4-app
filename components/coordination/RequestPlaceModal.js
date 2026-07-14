import React, { useState } from 'react';
import {
  Modal, View, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet, Pressable,
} from 'react-native';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';
import { useLocale } from '../../providers/LocaleProvider';
import { useLocation } from '../../providers/LocationProvider';
import { CATEGORIES } from '../../lib/categories';
import { useRequestPlace } from '../../lib/coordination/hooks';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';

// Suggest a missing place. No native map in Expo Go, so the "pin" is the device's
// current location (converted to WKT downstream in requestPlace). Coordinates
// display so the user can confirm the drop point.
export function RequestPlaceModal({ visible, onClose, userId, market }) {
  const { t } = useLocale();
  const { coords } = useLocation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [loc, setLoc] = useState(null);
  const request = useRequestPlace(userId);

  const close = () => { setName(''); setDescription(''); setLoc(null); onClose(); };
  const useMine = () => {
    if (coords?.latitude != null) setLoc({ lat: coords.latitude, lng: coords.longitude });
    else Alert.alert(t('coordination.noLocation'));
  };
  const submit = () => {
    if (!name.trim()) return;
    request.mutate(
      { name, description, suggestedCategory: category, lat: loc?.lat, lng: loc?.lng, market },
      { onSuccess: () => { close(); Alert.alert(t('coordination.requestThanks')); }, onError: (e) => Alert.alert('Error', String(e.message ?? e)) },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAwareView style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <AppText variant="title" style={styles.title}>{t('coordination.suggestTitle')}</AppText>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <AppText variant="label" color={colors.textLo} style={styles.label}>{t('coordination.placeName')}</AppText>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.textMute} />

            <AppText variant="label" color={colors.textLo} style={styles.label}>{t('coordination.placeDesc')}</AppText>
            <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline maxLength={300} placeholderTextColor={colors.textMute} />

            <AppText variant="label" color={colors.textLo} style={styles.label}>{t('coordination.placeCategory')}</AppText>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>

            <AppText variant="label" color={colors.textLo} style={styles.label}>{t('coordination.location')}</AppText>
            <TouchableOpacity style={styles.locBtn} onPress={useMine}>
              <AppText style={styles.locIcon}>📍</AppText>
              <AppText variant="bodyMed">{loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : t('coordination.useMyLocation')}</AppText>
            </TouchableOpacity>
          </ScrollView>

          <Button label={t('coordination.submit')} loading={request.isPending} disabled={!name.trim()} onPress={submit} style={styles.submit} />
        </View>
      </KeyboardAwareView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xl, maxHeight: '86%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  title: { marginBottom: space.sm },
  label: { marginTop: space.base, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', borderRadius: radius.md, padding: 14 },
  locIcon: { fontSize: 18 },
  submit: { marginTop: space.base },
});
