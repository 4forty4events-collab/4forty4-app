import React, { useState } from 'react';
import {
  Modal, View, TextInput, TouchableOpacity, Alert, StyleSheet, Pressable,
} from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { useCreateTrip } from '../../lib/coordination/hooks';
import { CalendarRangePicker } from './CalendarRangePicker';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';

export function CreateTripModal({ visible, onClose, userId, market, onCreated }) {
  const { t } = useLocale();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const create = useCreateTrip(userId);
  const dateSummary = start ? (end && end !== start ? `${start}  →  ${end}` : start) : null;

  const close = () => { setTitle(''); setStart(''); setEnd(''); onClose(); };
  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), market, startDate: start || null, endDate: end || null },
      { onSuccess: (trip) => { close(); onCreated?.(trip); }, onError: (e) => Alert.alert('Error', String(e.message ?? e)) },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAwareView style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={close} />
        {/* KeyboardAwareView handles tap-to-dismiss natively only (web would blur the
            focused TextInput on each click); the backdrop handles outside taps. */}
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <AppText variant="title" style={styles.title}>{t('coordination.createTrip')}</AppText>

          <AppText variant="label" color={colors.textLo} style={styles.label}>{t('coordination.tripTitle')}</AppText>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={colors.textMute} />

          <AppText variant="label" color={colors.textLo} style={styles.label}>{t('coordination.dates')}</AppText>
          <TouchableOpacity style={styles.dateField} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
            <AppText variant="bodyMed" color={dateSummary ? colors.textHi : colors.textMute}>
              {dateSummary ?? t('coordination.selectDates')}
            </AppText>
            <Icon name="calendar" size={18} color={colors.textLo} />
          </TouchableOpacity>

          <Button
            label={t('coordination.createTrip')}
            loading={create.isPending}
            disabled={!title.trim()}
            onPress={submit}
            style={styles.submit}
          />
        </View>
      </KeyboardAwareView>

      <CalendarRangePicker
        visible={pickerOpen}
        initialStart={start || null}
        initialEnd={end || null}
        onClose={() => setPickerOpen(false)}
        onConfirm={(s, e) => { setStart(s ?? ''); setEnd(e ?? ''); }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  title: { marginBottom: space.xs },
  label: { marginTop: space.base, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 12 },
  dateIcon: { fontSize: 16 },
  submit: { marginTop: space.lg },
});
