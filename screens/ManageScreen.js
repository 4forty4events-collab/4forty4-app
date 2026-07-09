import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Image, FlatList, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useMarket } from '../providers/MarketProvider';
import { CATEGORIES, CATEGORY_COLORS } from '../lib/categories';
import {
  fetchManageVenues,
  fetchManageUpcomingEvents,
  fetchPastEvents,
  deleteListing,
  setVenueFeatured,
  VenueHasEventsError,
} from '../lib/curation';
import { AppText, colors, space, radius } from '../lib/theme';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

const TABS = [
  { key: 'venues', label: 'Venues' },
  { key: 'events', label: 'Events' },
  { key: 'past', label: 'Past events' },
];

const SOURCE_FILTERS = [
  { key: 'all', label: 'All sources', match: () => true },
  { key: 'scraped', label: 'Scraped', match: (v) => (v.source ?? '').startsWith('google') },
  { key: 'manual', label: 'Manual', match: (v) => !(v.source ?? '').startsWith('google') },
];

// The admin catalog-cleaning cockpit: every venue + every event (upcoming and
// past), each row with Edit + Delete, plus filters to find what needs work.
export default function ManageScreen({ navigation }) {
  const { market, marketReady } = useMarket();
  const [tab, setTab] = useState('venues');
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [pendingMenuOnly, setPendingMenuOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const load = useCallback(async () => {
    if (!marketReady) return;
    setLoading(true);
    setError(null);
    try {
      const [v, e, p] = await Promise.all([
        fetchManageVenues(market),
        fetchManageUpcomingEvents(market),
        fetchPastEvents(market),
      ]);
      setVenues(v);
      setEvents(e);
      setPastEvents(p);
    } catch (err) {
      setError(err.message ?? 'Could not load the catalog');
    } finally {
      setLoading(false);
    }
  }, [market, marketReady]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const inCategory = useCallback(
    (item) => categoryFilter === 'all' || item.category === categoryFilter,
    [categoryFilter],
  );

  const visibleVenues = useMemo(() => {
    const srcMatch = (SOURCE_FILTERS.find((s) => s.key === sourceFilter) ?? SOURCE_FILTERS[0]).match;
    return venues.filter((v) => {
      if (pendingMenuOnly && v.menuStatus !== 'pending_manual') return false;
      return srcMatch(v) && inCategory(v);
    });
  }, [venues, pendingMenuOnly, sourceFilter, inCategory]);

  const visibleEvents = useMemo(() => events.filter(inCategory), [events, inCategory]);
  const visiblePast = useMemo(() => pastEvents.filter(inCategory), [pastEvents, inCategory]);

  const data = tab === 'venues' ? visibleVenues : tab === 'events' ? visibleEvents : visiblePast;

  const confirmDelete = (item) => {
    const runDelete = async (cascade = false) => {
      try {
        await deleteListing(item.kind, item.id, { cascade });
        load();
      } catch (e) {
        if (e instanceof VenueHasEventsError) {
          const n = e.count;
          Alert.alert(
            'This venue has events',
            `${n} event${n === 1 ? '' : 's'} use this venue. Deleting it will also delete ${n === 1 ? 'that event' : `those ${n} events`}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: `Delete venue + ${n} event${n === 1 ? '' : 's'}`, style: 'destructive', onPress: () => runDelete(true) },
            ],
          );
          return;
        }
        Alert.alert('Delete failed', e.message ?? 'Please try again.');
      }
    };
    Alert.alert(
      `Delete this ${item.kind}?`,
      'Delete this permanently? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runDelete(false) },
      ],
    );
  };

  const toggleFeatured = async (item) => {
    try {
      await setVenueFeatured(item.id, !item.isFeatured);
      load();
    } catch (e) {
      Alert.alert('Could not update', e.message ?? 'Please try again.');
    }
  };

  const subtitle = (item) => {
    if (item.kind === 'venue') {
      const bits = [item.city, item.category].filter(Boolean);
      if (item.isFeatured) bits.push('★ featured');
      if (item.menuStatus) bits.push(`menu: ${item.menuStatus}`);
      if (item.isStub) bits.push('stub');
      return bits.join(' · ');
    }
    return [item.venueName, item.startTime ? new Date(item.startTime).toLocaleDateString() : null]
      .filter(Boolean)
      .join(' · ');
  };

  const renderRow = ({ item }) => {
    const isPast = tab === 'past';
    const thumb = item.imageUrl ?? (item.imageUrls?.length ? item.imageUrls[0] : null);
    return (
      <View style={styles.row}>
        <TouchableOpacity style={styles.rowMain} onPress={() => navigation.navigate('ListingDetail', { id: item.id, kind: item.kind })}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <AppText variant="caption" color={colors.textLo}>{item.kind === 'event' ? 'EVT' : 'PLC'}</AppText>
            </View>
          )}
          <View style={styles.rowText}>
            <AppText variant="bodySemi" numberOfLines={1}>{item.title}</AppText>
            <AppText variant="caption" color={colors.textLo} numberOfLines={1} style={styles.rowSubtitle}>{subtitle(item)}</AppText>
          </View>
        </TouchableOpacity>
        <View style={styles.rowActions}>
          {item.kind === 'venue' && (
            <TouchableOpacity style={styles.featBtn} onPress={() => toggleFeatured(item)} hitSlop={6}>
              <Icon name="star" size={19} fill={item.isFeatured} color={item.isFeatured ? colors.star : colors.textMute} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('ReviewListing', { mode: 'edit', item })}>
            <AppText variant="label">Edit</AppText>
          </TouchableOpacity>
          {!isPast && (
            <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(item)}>
              <AppText variant="label" color={colors.danger}>Delete</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="label" color={colors.textHi} style={styles.back}>‹ Back</AppText>
        </TouchableOpacity>
        <AppText variant="title">Manage catalog ({market})</AppText>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tt) => {
          const on = tab === tt.key;
          return (
            <TouchableOpacity key={tt.key} style={[styles.tab, on && styles.tabActive]} onPress={() => setTab(tt.key)}>
              <AppText variant="label" color={on ? colors.onAccent : colors.textLo}>{tt.label}</AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'venues' && (
        <View style={styles.filters}>
          <Chip label="Needs menu" selected={pendingMenuOnly} onPress={() => setPendingMenuOnly((v) => !v)} />
          {SOURCE_FILTERS.map((s) => (
            <Chip key={s.key} label={s.label} selected={sourceFilter === s.key} onPress={() => setSourceFilter(s.key)} />
          ))}
        </View>
      )}

      <View style={styles.catWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
          <Chip label="All" selected={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={categoryFilter === c} tint={CATEGORY_COLORS[c]} onPress={() => setCategoryFilter(categoryFilter === c ? 'all' : c)} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : error ? (
        <View style={styles.center}>
          <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error}</AppText>
          <Button label="Retry" variant="secondary" full={false} onPress={load} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <AppText variant="body" color={colors.textLo}>
            {tab === 'past' ? 'No past events yet.' : tab === 'events' ? 'No upcoming events.' : 'No venues match.'}
          </AppText>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  header: { paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  back: { marginBottom: 6 },
  tabRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.base, paddingBottom: space.sm },
  tab: { flex: 1, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: 9, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.base, paddingBottom: space.sm },
  catWrap: { height: 48, marginBottom: space.sm },
  catScroll: { flexGrow: 0 },
  catScrollContent: { paddingHorizontal: space.base, paddingVertical: 6, gap: space.sm, alignItems: 'center' },
  listContent: { padding: space.base, paddingTop: space.xs, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.sm, gap: space.sm },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.bgElevated2 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowSubtitle: { marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: space.md },
  featBtn: { justifyContent: 'center', paddingHorizontal: 4 },
  featBtnText: { fontSize: 20 },
  deleteBtn: { backgroundColor: 'rgba(229,96,94,0.12)', borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: space.md },
});
