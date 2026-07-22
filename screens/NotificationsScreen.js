import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, TouchableOpacity, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useNotifications, useMarkAllRead, useMarkRead, useActorProfiles } from '../lib/notifications/hooks';
import { Avatar } from '../components/social/PostCard';
import { AppText, colors, space } from '../lib/theme';

// Social (person-driven) types vs system (discovery-driven) types. Drives the tabs
// and whether a row renders an actor avatar.
const ACTIVITY_TYPES = new Set(['message', 'story_like', 'new_follower']);
const TYPE_ICON = {
  event_reminder: '⏰', nearby_alert: '📍', recommendation: '✨', organizer_update: '📢',
  radar_alert: '📡', registration_closing: '📅', date_approaching: '📅', feedback_prompt: '📝',
  message: '💬', story_like: '❤️', new_follower: '👤',
};
const TABS = [['all', 'All'], ['activity', 'Activity'], ['system', 'System']];

function relativeTime(iso, t) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('notifications.justNow');
  if (min < 60) return t('notifications.minutesAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('notifications.hoursAgo', { n: hr });
  return t('notifications.daysAgo', { n: Math.floor(hr / 24) });
}

export default function NotificationsScreen({ navigation }) {
  const { session } = useSession();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;

  const [tab, setTab] = useState('all');
  const insets = useSafeAreaInsets();
  const { items, isLoading, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(userId);
  const markAll = useMarkAllRead(userId);
  const markOne = useMarkRead(userId);

  const filtered = useMemo(() => {
    if (tab === 'activity') return items.filter((n) => ACTIVITY_TYPES.has(n.type));
    if (tab === 'system') return items.filter((n) => !ACTIVITY_TYPES.has(n.type));
    return items;
  }, [items, tab]);

  // Resolve avatars for the acting users behind social notifications.
  const actorIds = useMemo(() => filtered.map((n) => n.actorId).filter(Boolean), [filtered]);
  const { data: actors = {} } = useActorProfiles(actorIds);

  const onPressItem = useCallback((n) => {
    if (!n.isRead) markOne.mutate(n.id);
    if (n.link?.screen) navigation.navigate(n.link.screen, n.link.params);
  }, [markOne, navigation]);

  const onEndReached = () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); };

  const renderItem = ({ item: n }) => {
    const actor = n.actorId ? actors[n.actorId] : null;
    return (
      <TouchableOpacity style={[styles.card, !n.isRead && styles.cardUnread]} onPress={() => onPressItem(n)} activeOpacity={0.7}>
        {actor ? (
          <Avatar url={actor.avatarUrl} name={actor.name} size={40} />
        ) : (
          <View style={styles.iconWrap}><AppText style={styles.icon}>{TYPE_ICON[n.type] ?? '🔔'}</AppText></View>
        )}
        <View style={styles.body}>
          <AppText variant="caption" color={colors.textMute}>{relativeTime(n.createdAt, t)}</AppText>
          <AppText variant="bodySemi" numberOfLines={2} style={styles.title}>{n.title}</AppText>
          {n.body ? <AppText variant="label" color={colors.textLo} numberOfLines={2} style={styles.text}>{n.body}</AppText> : null}
        </View>
        {!n.isRead ? <View style={styles.dot} /> : null}
      </TouchableOpacity>
    );
  };

  const allRead = items.every((n) => n.isRead);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <AppText style={styles.back}>‹</AppText>
        </TouchableOpacity>
        <AppText variant="heading">{t('notifications.title')}</AppText>
        <TouchableOpacity onPress={() => markAll.mutate()} hitSlop={8} disabled={markAll.isPending || allRead}>
          <AppText variant="label" color={allRead ? colors.textMute : colors.accent2}>{t('notifications.markAllRead')}</AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} style={[styles.tab, tab === key && styles.tabOn]} onPress={() => setTab(key)}>
            <AppText variant="label" color={tab === key ? colors.textHi : colors.textLo}>{label}</AppText>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.md }]}
          ListEmptyComponent={<View style={styles.center}><AppText variant="body" color={colors.textLo}>{t('notifications.empty')}</AppText></View>}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ paddingVertical: 18 }} color={colors.textLo} /> : null}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshing={isRefetching}
          onRefresh={refetch}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  tabs: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.base, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tab: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: colors.bgElevated, borderColor: colors.accent2 },
  content: { paddingVertical: space.sm },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.base, paddingHorizontal: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cardUnread: { backgroundColor: colors.bgElevated },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgElevated2, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 20 },
  body: { flex: 1 },
  title: { marginTop: 3 },
  text: { marginTop: 2, lineHeight: 18 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent2, marginTop: 6 },
});
