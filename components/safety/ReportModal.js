import React, { useState } from 'react';
import {
  Modal, View, TextInput, TouchableOpacity, Alert, StyleSheet, Pressable,
} from 'react-native';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';
import { useLocale } from '../../providers/LocaleProvider';
import { REASONS } from '../../lib/safety/safetyRepository';
import { useCreateReport } from '../../lib/safety/hooks';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { Button } from '../ui/Button';

// Contextual report/flag sheet. target = { type: 'venue'|'event'|'organizer', id }.
export function ReportModal({ visible, onClose, target, userId, market }) {
  const { t } = useLocale();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const create = useCreateReport(userId, market);

  const close = () => { setReason(null); setDetails(''); onClose(); };
  const submit = () => {
    if (!reason || !target?.id) return;
    create.mutate({ target, reason, details }, {
      onSuccess: () => { close(); Alert.alert(t('safety.thanks')); },
      onError: (e) => Alert.alert('Error', String(e.message ?? e)),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAwareView style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={close} />
        {/* No inner tap-to-dismiss wrapper — on web it blurs the TextInput on each
            click (the same bug fixed in CreateTripModal). Backdrop handles outside taps. */}
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <AppText variant="title" style={styles.title}>{t('safety.reportTitle')}</AppText>

          <AppText variant="label" color={colors.textLo} style={styles.label}>{t('safety.reason')}</AppText>
          <View style={styles.chips}>
            {REASONS.map((r) => {
              const on = reason === r;
              return (
                <TouchableOpacity key={r} style={[styles.chip, on && styles.chipOn]} onPress={() => setReason(r)}>
                  <AppText variant="label" color={on ? '#fff' : colors.textLo}>{t(`safety.reason_${r}`)}</AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={styles.input}
            value={details} onChangeText={setDetails}
            placeholder={t('safety.describe')} placeholderTextColor={colors.textMute}
            multiline maxLength={500}
          />

          <Button label={t('safety.submit')} loading={create.isPending} disabled={!reason} onPress={submit} style={styles.submit} />
        </View>
      </KeyboardAwareView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  title: { marginBottom: space.base },
  label: { marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.base },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 13 },
  chipOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, minHeight: 90, textAlignVertical: 'top', marginBottom: space.base },
  submit: { marginTop: space.xs },
});
