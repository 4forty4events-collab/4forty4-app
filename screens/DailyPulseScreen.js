import React, { useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarket } from '../providers/MarketProvider';
import { DailyPulse } from '../components/discovery/DailyPulse';
import { colors, space } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

// The Daily Pulse surface — a full-screen, living heartbeat of upcoming local
// culture. The component owns its own masthead ("Tonight in {city}"), so the
// wrapper adds only a slim floating back control over the cinematic feed.
export default function DailyPulseScreen({ navigation }) {
  const { market } = useMarket();
  const cityLabel = market === 'ZW' ? 'Harare' : 'Algiers';

  const onPressEvent = useCallback(
    (event) => navigation.navigate('ListingDetail', { id: event.id, kind: 'event' }),
    [navigation],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
      </View>
      <DailyPulse market={market} cityLabel={cityLabel} onPressEvent={onPressEvent} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { paddingHorizontal: space.base, paddingTop: space.xs, paddingBottom: space.xs },
  backBtn: { alignSelf: 'flex-start' },
});
