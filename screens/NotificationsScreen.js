import React, { useCallback } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useLocale } from '../providers/LocaleProvider';
import { useNotifications, useMarkAllRead, useMarkRead } from '../lib/notifications/hooks';
import { AppText, colors, space } from '../lib/theme';

const TYPE_ICON = {
  event_reminder: '⏰', nearby_alert: '📍', recommendation: '✨', organizer_update: '📢',
};

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

  const { items, isLoading, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(userId);
  const markAll = useMarkAllRead(userId);
  const markOne = useMarkRead(userId);

  const onPressItem = useCallback((n) => {
    if (!n.isRead) markOne.mutate(n.id);
    if (n.link?.screen) navigation.navigate(n.link.screen, n.link.params);
  }, [markOne, navigation]);

  const onEndReached = () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); };

  const renderItem = ({ item: n }) => (
    <TouchableOpacity style={[styles.card, !n.isRead && styles.cardUnread]} onPress={() => onPressItem(n)} activeOpacity={0.7}>
      <AppText style={styles.icon}>{TYPE_ICON[n.type] ?? '🔔'}</AppText>
      <View style={styles.body}>
        <AppText variant="caption" color={colors.textMute}>{t(`notifications.type_${n.type}`)} · {relativeTime(n.createdAt, t)}</AppText>
        <AppText variant="bodySemi" numberOfLines={2} style={styles.title}>{n.title}</AppText>
        {n.body ? <AppText variant="label" color={colors.textLo} numberOfLines={2} style={styles.text}>{n.body}</AppText> : null}
      </View>
      {!n.isRead ? <View style={styles.dot} /> : null}
    </TouchableOpacity>
  );

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

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
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
  content: { paddingVertical: space.sm },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.base, paddingHorizontal: space.base, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cardUnread: { backgroundColor: colors.bgElevated },
  icon: { fontSize: 20, marginTop: 2 },
  body: { flex: 1 },
  title: { marginTop: 3 },
  text: { marginTop: 2, lineHeight: 18 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent2, marginTop: 6 },
});
