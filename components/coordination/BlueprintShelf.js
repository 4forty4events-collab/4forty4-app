import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocale } from '../../providers/LocaleProvider';
import { usePublicTrips } from '../../lib/coordination/hooks';
import { AppText, colors, space, radius } from '../../lib/theme';

// Discovery shelf of published trip blueprints. Tapping opens a read-only preview
// with a Clone action. Renders nothing until at least one public trip exists.
export function BlueprintShelf({ navigation }) {
  const { t } = useLocale();
  const { data: trips = [] } = usePublicTrips({ limit: 12 });
  if (!trips.length) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="title" style={styles.heading}>{t('coordination.communityBlueprints')}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {trips.map((tr) => (
          <TouchableOpacity key={tr.id} style={styles.card} activeOpacity={0.85}
            onPress={() => navigation.navigate('BlueprintPreview', { tripId: tr.id, title: tr.title })}>
            <AppText style={styles.emoji}>🗺️</AppText>
            <AppText variant="bodySemi" numberOfLines={2} style={styles.title}>{tr.title}</AppText>
            <AppText variant="caption" color={colors.accent2} style={styles.meta}>{t('coordination.stops', { n: tr.itemCount })}{tr.market ? ` · ${tr.market}` : ''}</AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.sm, marginBottom: 6 },
  heading: { marginHorizontal: space.base, marginBottom: space.sm },
  row: { paddingHorizontal: space.md, gap: space.md },
  card: { width: 160, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, marginHorizontal: 4 },
  emoji: { fontSize: 26, marginBottom: space.sm },
  title: { minHeight: 38 },
  meta: { marginTop: 6 },
});
