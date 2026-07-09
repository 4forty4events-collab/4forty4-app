import React, { useState, useEffect } from 'react';
import { Modal, View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { AppText, colors, space, radius } from '../../lib/theme';
import { Button } from '../ui/Button';

// Localized labels mirror CalendarGrid so the two calendars read identically.
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};
const WEEKDAYS = {
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  fr: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  ar: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
};

const pad = (n) => String(n).padStart(2, '0');
// Same YYYY-MM-DD key shape the DB stores (start_date / end_date).
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Anchor the visible month to the existing start date (or today).
function anchorMonth(startStr) {
  if (startStr && /^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
    const [y, m] = startStr.split('-').map(Number);
    return { y, m: m - 1 };
  }
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() };
}

// Tap-to-pick range calendar (dark). First tap sets the start, second tap (on or
// after start) sets the end; tapping again begins a fresh range. End is optional.
// Emits YYYY-MM-DD strings — no Date objects leak out.
export function CalendarRangePicker({ visible, initialStart, initialEnd, onClose, onConfirm }) {
  const { t, language } = useLocale();
  const lang = MONTHS[language] ? language : 'en';

  const [start, setStart] = useState(initialStart ?? null);
  const [end, setEnd] = useState(initialEnd ?? null);
  const [cur, setCur] = useState(() => anchorMonth(initialStart));

  useEffect(() => {
    if (!visible) return;
    setStart(initialStart ?? null);
    setEnd(initialEnd ?? null);
    setCur(anchorMonth(initialStart));
  }, [visible, initialStart, initialEnd]);

  const shift = (delta) => {
    const m = cur.m + delta;
    setCur({ y: cur.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  const pick = (key) => {
    if (!start || (start && end)) { setStart(key); setEnd(null); return; }
    if (key < start) { setStart(key); return; }
    setEnd(key);
  };

  const inRange = (key) => start && key > start && end && key < end;
  const isEnd = (key) => key === start || key === end;

  const clear = () => { setStart(null); setEnd(null); };
  const confirm = () => { onConfirm(start ?? null, end ?? null); onClose(); };

  const first = new Date(cur.y, cur.m, 1);
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const summary = start ? (end && end !== start ? `${start}  →  ${end}` : start) : t('coordination.selectDates');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <AppText variant="bodySemi" style={styles.summary}>{summary}</AppText>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => shift(-1)} hitSlop={12}><AppText style={styles.nav}>‹</AppText></TouchableOpacity>
          <AppText variant="heading">{MONTHS[lang][cur.m]} {cur.y}</AppText>
          <TouchableOpacity onPress={() => shift(1)} hitSlop={12}><AppText style={styles.nav}>›</AppText></TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS[lang].map((w, i) => <AppText key={i} variant="caption" color={colors.textMute} style={styles.weekday}>{w}</AppText>)}
        </View>

        {rows.map((row, ri) => (
          <View key={ri} style={styles.weekRow}>
            {row.map((d, ci) => {
              if (d == null) return <View key={ci} style={styles.cell} />;
              const key = keyOf(cur.y, cur.m, d);
              const end_ = isEnd(key);
              const mid = inRange(key);
              return (
                <TouchableOpacity key={ci} style={styles.cell} activeOpacity={0.7} onPress={() => pick(key)}>
                  {mid ? <View style={styles.band} /> : null}
                  <View style={[styles.dayCircle, end_ && styles.dayCircleOn]}>
                    <AppText variant="bodyMed" color={end_ ? colors.onAccent : colors.textHi}>{d}</AppText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={styles.footer}>
          <Button label={t('coordination.clearDates')} variant="ghost" full={false} textColor={colors.textLo} onPress={clear} />
          <Button label={t('coordination.done')} variant="primary" full={false} onPress={confirm} style={styles.doneBtn} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', left: space.base, right: space.base, top: '18%', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.xl, padding: space.base },
  summary: { textAlign: 'center', marginBottom: space.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, marginBottom: space.md },
  nav: { fontSize: 24, color: colors.textHi },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, minHeight: 42 },
  band: { position: 'absolute', top: 8, bottom: 8, left: 0, right: 0, backgroundColor: 'rgba(79,163,199,0.18)' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleOn: { backgroundColor: colors.accent },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.base },
  doneBtn: { paddingHorizontal: space.xl },
});
