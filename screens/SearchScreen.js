import React, { useEffect, useMemo, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { useLocation } from '../providers/LocationProvider';
import { discoveryService } from '../lib/discovery/services/discoveryService';
import { DiscoveryList } from '../components/discovery/DiscoveryList';
import { getRecentSearches, addRecentSearch, clearRecentSearches } from '../lib/discovery/recentSearches';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

// Universal search: fuzzy, accent-insensitive, ranked by relevance (the `discover`
// RPC does the work). Instant results as you type (debounced), recent searches
// when the box is empty, and distance shown on cards when we have location.
export default function SearchScreen({ navigation }) {
  const { market } = useMarket();
  const { coords } = useLocation();
  const [raw, setRaw] = useState('');
  const [text, setText] = useState('');      // debounced/committed term
  const [recent, setRecent] = useState([]);

  useEffect(() => { getRecentSearches().then(setRecent); }, []);

  // Debounce keystrokes so we hit the RPC ~5x/sec at most, not per character.
  useEffect(() => {
    const id = setTimeout(() => setText(raw.trim()), 300);
    return () => clearTimeout(id);
  }, [raw]);

  const active = text.length >= 2;
  const query = useMemo(
    () => discoveryService.search({ market, text, near: coords }),
    [market, text, coords],
  );

  const refreshRecent = () => getRecentSearches().then(setRecent);
  const runTerm = (term) => { setRaw(term); setText(term.trim()); addRecentSearch(term).then(refreshRecent); };
  const onPressItem = (item) => { addRecentSearch(text).then(refreshRecent); navigation.navigate('ListingDetail', { item }); };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.searchBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={26} color={colors.textHi} />
        </TouchableOpacity>
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
        ) : null}
      </View>

      {active ? (
        <DiscoveryList query={query} onPressItem={onPressItem} enableAddToTrip emptyText={`No results for "${text}"`} />
      ) : (
        <View style={styles.body}>
          {recent.length > 0 ? (
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
          ) : (
            <AppText variant="body" color={colors.textLo} style={styles.hint}>Try "restaurant", "musée", "café", "park", or an event name.</AppText>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 30, color: colors.textHi, marginTop: -4 },
  input: { flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, fontFamily: fonts.body, color: colors.textHi },
  clear: { fontSize: 16, paddingHorizontal: 4 },
  body: { flex: 1, paddingHorizontal: space.base, paddingTop: space.md },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  recentIcon: { fontSize: 15 },
  hint: { lineHeight: 21, marginTop: space.sm },
});
