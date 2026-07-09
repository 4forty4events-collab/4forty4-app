import React, { useState, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { AppText, colors } from '../../lib/theme';

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
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Month grid marking days that hold a saved event (blue dot) or fall within a
// trip's date range (green band). Pure RN — no calendar dependency. LTR-stable.
export function CalendarGrid({ events = [], trips = [] }) {
  const { language } = useLocale();
  const lang = MONTHS[language] ? language : 'en';
  const now = new Date();
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const eventDays = useMemo(() => {
    const s = new Set();
    events.forEach((e) => { if (e.startTime) s.add(keyOf(new Date(e.startTime))); });
    return s;
  }, [events]);

  const inTrip = (key) => trips.some((t) => t.startDate && key >= t.startDate && key <= (t.endDate ?? t.startDate));

  const first = new Date(cur.y, cur.m, 1);
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const todayKey = keyOf(now);
  const shift = (delta) => {
    const m = cur.m + delta;
    setCur({ y: cur.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  };

  return (
    <View style={styles.wrap}>
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
            const key = keyOf(new Date(cur.y, cur.m, d));
            const isToday = key === todayKey;
            return (
              <View key={ci} style={styles.cell}>
                <View style={[styles.dayCircle, isToday && styles.today]}>
                  <AppText variant="label" color={isToday ? colors.onAccent : colors.textHi}>{d}</AppText>
                </View>
                <View style={styles.markers}>
                  {eventDays.has(key) ? <View style={styles.eventDot} /> : null}
                </View>
                {inTrip(key) ? <View style={styles.tripBand} /> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, marginBottom: 12 },
  nav: { fontSize: 24, color: colors.textHi },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 42 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  today: { backgroundColor: colors.accent },
  markers: { flexDirection: 'row', gap: 3, height: 6, marginTop: 1 },
  eventDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent2 },
  tripBand: { position: 'absolute', bottom: 0, height: 3, width: '80%', borderRadius: 2, backgroundColor: colors.success },
});
