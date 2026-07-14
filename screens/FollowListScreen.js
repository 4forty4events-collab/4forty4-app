import React from 'react';
import { View, Image, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFollowList } from '../lib/social/hooks';
import { TrustBadge } from '../components/safety/TrustBadge';
import { AppText, colors, space } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

// Followers / following list for a user. mode + title come from the route. Rows open
// each person's public profile.
export default function FollowListScreen({ route, navigation }) {
  const { userId, mode, title } = route.params ?? {};
  const { data: people = [], isLoading } = useFollowList(userId, mode);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </TouchableOpacity>
        <AppText variant="heading">{title ?? 'People'}</AppText>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<AppText variant="body" color={colors.textLo} style={styles.empty}>Nobody here yet.</AppText>}
          renderItem={({ item: p }) => {
            const initial = ((p.full_name ?? '?')[0] ?? '?').toUpperCase();
            return (
              <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('PublicProfile', { userId: p.id })}>
                {p.avatar_url
                  ? <Image source={{ uri: p.avatar_url }} style={styles.avatar} />
                  : <View style={[styles.avatar, styles.avatarFallback]}><AppText color={colors.onAccent} style={styles.avatarInitial}>{initial}</AppText></View>}
                <AppText variant="bodySemi" style={{ flex: 1 }} numberOfLines={1}>{p.full_name || 'Explorer'}</AppText>
                <TrustBadge tier={p.trust_tier} compact />
                <Icon name="chevronRight" size={18} color={colors.textMute} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.sm, paddingBottom: space.xs },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: space.base, gap: space.xs },
  empty: { textAlign: 'center', marginTop: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 17, fontWeight: '700' },
});
