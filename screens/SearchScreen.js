import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useLocation } from '../providers/LocationProvider';
import { discoveryService } from '../lib/discovery/services/discoveryService';
import { useCategoryFacets } from '../lib/discovery/hooks/useCategoryFacets';
import { useSuggestions } from '../lib/discovery/hooks/useSuggestions';
import { DiscoveryList } from '../components/discovery/DiscoveryList';
import { SearchFilterSheet, DEFAULT_FILTERS } from '../components/discovery/SearchFilterSheet';
import { getRecentSearches, addRecentSearch, clearRecentSearches } from '../lib/discovery/recentSearches';
import { getSavedSearches, saveSearch, removeSavedSearch } from '../lib/discovery/savedSearches';
import { useVoiceSearch } from '../lib/voice/useVoiceSearch';
import { CATEGORY_COLORS, categoryLabel } from '../lib/categories';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Chip } from '../components/ui/Chip';
import { Icon } from '../components/ui/Icon';

const SORT_LABEL = { relevance: 'Best match', rating: 'Top rated', distance: 'Nearest', recent: 'Newest' };

// Universal search 2.0: fuzzy relevance results (the `discover` RPC), plus smart
// autocomplete, saved + recent searches, advanced filters (kind / sort / category),
// and a voice-ready seam. All filters ride the same DiscoveryQuery pipeline.
export default function SearchScreen({ navigation }) {
  const { market } = useMarket();
  const { coords } = useLocation();
  const { data: facets = [] } = useCategoryFacets(market);

  const [raw, setRaw] = useState('');
  const [text, setText] = useState('');           // debounced/committed term
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [recent, setRecent] = useState([]);
  const [saved, setSaved] = useState([]);

  const refreshRecent = useCallback(() => getRecentSearches().then(setRecent), []);
  const refreshSaved = useCallback(() => getSavedSearches().then(setSaved), []);
  useEffect(() => { refreshRecent(); refreshSaved(); }, [refreshRecent, refreshSaved]);

  // Debounce keystrokes so we hit the RPC ~5x/sec at most.
  useEffect(() => { const id = setTimeout(() => setText(raw.trim()), 300); return () => clearTimeout(id); }, [raw]);

  const active = text.length >= 2;
  const { data: suggestions = [] } = useSuggestions(market, text, coords);
  const voice = useVoiceSearch({ onResult: (t) => runTerm(t) });

  const filtersActive =
    filters.kind !== 'all' || filters.category !== 'all' || filters.sort !== 'relevance';
  const filterCount =
    (filters.kind !== 'all' ? 1 : 0) + (filters.category !== 'all' ? 1 : 0) + (filters.sort !== 'relevance' ? 1 : 0);

  const query = useMemo(
    () => discoveryService.search({
      market,
      text,
      near: coords,
      categories: filters.category === 'all' ? null : [filters.category],
      kinds: filters.kind === 'all' ? null : [filters.kind],
      sort: filters.sort,
    }),
    [market, text, coords, filters],
  );

  const runTerm = (term) => { setRaw(term); setText(term.trim()); addRecentSearch(term).then(refreshRecent); };
  const onPressItem = (item) => { addRecentSearch(text).then(refreshRecent); navigation.navigate('ListingDetail', { item }); };

  const applySaved = (s) => { setFilters(s.filters ?? DEFAULT_FILTERS); runTerm(s.term); };
  const onSaveSearch = () => { saveSearch({ term: text, filters }).then(refreshSaved); };

  const filterSummary = [
    filters.kind !== 'all' ? (filters.kind === 'venue' ? 'Places' : 'Events') : null,
    filters.category !== 'all' ? categoryLabel(filters.category) : null,
    filters.sort !== 'relevance' ? SORT_LABEL[filters.sort] : null,
  ].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.searchBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={26} color={colors.textHi} />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Search places, events, cafés…"
            placeholderTextColor={colors.textMute}
            value={raw}
            onChangeText={setRaw}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => runTerm(raw)}
          />
          {raw ? (
            <TouchableOpacity onPress={() => { setRaw(''); setText(''); }} hitSlop={10}>
              <Icon name="close" size={18} color={colors.textLo} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={voice.start} hitSlop={10} accessibilityLabel="Voice search">
              <Icon name="mic" size={19} color={colors.textLo} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.toolRow}>
        <TouchableOpacity style={[styles.filterBtn, filtersActive && styles.filterBtnOn]} onPress={() => setFilterOpen(true)}>
          <Icon name="settings" size={16} color={filtersActive ? colors.accent2 : colors.textLo} />
          <AppText variant="label" color={filtersActive ? colors.accent2 : colors.textLo}>
            {filtersActive ? filterSummary : 'Filters'}{filterCount ? ` (${filterCount})` : ''}
          </AppText>
        </TouchableOpacity>
        {active ? (
          <TouchableOpacity style={styles.saveBtn} onPress={onSaveSearch} hitSlop={8} accessibilityLabel="Save search">
            <Icon name="bookmark" size={16} color={colors.textLo} />
            <AppText variant="label" color={colors.textLo}>Save</AppText>
          </TouchableOpacity>
        ) : null}
      </View>

      {active ? (
        <>
          {suggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestStrip} contentContainerStyle={styles.suggestContent}>
              {suggestions.slice(0, 6).map((s) => (
                <TouchableOpacity key={`${s.kind}-${s.id}`} style={styles.suggestPill} onPress={() => onPressItem(s)}>
                  <Icon name="search" size={13} color={colors.textMute} />
                  <AppText variant="label" numberOfLines={1} style={styles.suggestText}>{s.title}</AppText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <DiscoveryList query={query} onPressItem={onPressItem} enableAddToTrip emptyText={`No results for "${text}"`} />
        </>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          {saved.length > 0 && (
            <>
              <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>SAVED SEARCHES</AppText>
              {saved.map((s) => (
                <View key={s.id} style={styles.savedRow}>
                  <TouchableOpacity style={styles.savedMain} onPress={() => applySaved(s)}>
                    <Icon name="bookmark" size={16} color={colors.accent2} fill />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyLg" numberOfLines={1}>{s.term || 'All'}</AppText>
                      {s.filters && (s.filters.kind !== 'all' || s.filters.category !== 'all' || s.filters.sort !== 'relevance') ? (
                        <AppText variant="caption" color={colors.textMute} numberOfLines={1}>
                          {[s.filters.kind !== 'all' ? (s.filters.kind === 'venue' ? 'Places' : 'Events') : null, s.filters.category !== 'all' ? categoryLabel(s.filters.category) : null, s.filters.sort !== 'relevance' ? SORT_LABEL[s.filters.sort] : null].filter(Boolean).join(' · ')}
                        </AppText>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeSavedSearch(s.id).then(refreshSaved)} hitSlop={10}>
                    <Icon name="close" size={16} color={colors.textMute} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {recent.length > 0 && (
            <>
              <View style={styles.recentHeader}>
                <AppText variant="caption" color={colors.textMute}>RECENT</AppText>
                <TouchableOpacity onPress={() => clearRecentSearches().then(() => setRecent([]))}>
                  <AppText variant="label" color={colors.accent2}>Clear</AppText>
                </TouchableOpacity>
              </View>
              {recent.map((term) => (
                <TouchableOpacity key={term} style={styles.recentRow} onPress={() => runTerm(term)}>
                  <Icon name="clock" size={16} color={colors.textMute} />
                  <AppText variant="bodyLg">{term}</AppText>
                </TouchableOpacity>
              ))}
            </>
          )}

          {facets.length > 0 && (
            <>
              <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>BROWSE BY CATEGORY</AppText>
              <View style={styles.catWrap}>
                {facets.map(({ category: c }) => (
                  <Chip key={c} label={categoryLabel(c)} tint={CATEGORY_COLORS[c]} onPress={() => { setFilters((f) => ({ ...f, category: c })); runTerm(categoryLabel(c)); }} />
                ))}
              </View>
            </>
          )}

          {saved.length === 0 && recent.length === 0 && facets.length === 0 ? (
            <AppText variant="body" color={colors.textLo} style={styles.hint}>Try "restaurant", "musée", "café", "park", or an event name.</AppText>
          ) : null}
        </ScrollView>
      )}

      <SearchFilterSheet
        visible={filterOpen}
        filters={filters}
        facets={facets}
        hasLocation={!!coords}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.sm },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 10, fontSize: 16, fontFamily: fonts.body, color: colors.textHi },
  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingBottom: space.sm, gap: space.sm },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: space.md, flexShrink: 1 },
  filterBtnOn: { borderColor: colors.accent2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: space.sm },
  suggestStrip: { flexGrow: 0, maxHeight: 44 },
  suggestContent: { paddingHorizontal: space.base, gap: space.sm, paddingBottom: space.sm },
  suggestPill: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: space.md },
  suggestText: { flexShrink: 1 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space.base, paddingTop: space.xs, paddingBottom: space.xxl },
  sectionLabel: { marginTop: space.base, marginBottom: space.sm },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  savedMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.base, marginBottom: space.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hint: { lineHeight: 21, marginTop: space.md },
});
