import React from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../providers/SessionProvider';
import { useConversations } from '../lib/social/hooks';
import { Avatar } from '../components/social/PostCard';
import { AppText, colors, space } from '../lib/theme';

// Compact relative time: 2m, 1h, 3d, else a short date.
function ago(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

// The user's 1:1 DM conversations — reached from the Feed chat icon. Tapping a row
// opens the thread. (Story replies create these; there's no separate inbox concept.)
export default function ConversationsScreen({ navigation }) {
  const { session } = useSession();
  const meId = session?.user?.id ?? null;
  const insets = useSafeAreaInsets();
  const { data: conversations = [], isLoading, refetch, isRefetching } = useConversations(meId);

  const open = (c) => navigation.navigate('DmThread', { otherUserId: c.otherId, otherName: c.name ?? 'Chat' });

  const renderItem = ({ item: c }) => (
    <TouchableOpacity style={styles.row} onPress={() => open(c)} activeOpacity={0.7}>
      <Avatar url={c.avatarUrl} name={c.name} size={48} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <AppText variant="bodySemi" numberOfLines={1} style={styles.name}>{c.name ?? 'Traveler'}</AppText>
          <AppText variant="caption" color={colors.textMute}>{ago(c.lastAt)}</AppText>
        </View>
        <AppText
          variant="label"
          color={c.unread > 0 ? colors.textHi : colors.textLo}
          numberOfLines={1}
          style={styles.preview}
        >
          {c.lastMine ? 'You: ' : ''}{c.lastBody}
        </AppText>
      </View>
      {c.unread > 0 ? <View style={styles.badge}><AppText variant="caption" color={colors.onAccent}>{c.unread}</AppText></View> : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <AppText style={styles.back}>‹</AppText>
        </TouchableOpacity>
        <AppText variant="heading">Messages</AppText>
        <View style={{ width: 26 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.otherId}
          renderItem={renderItem}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.md }]}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={(
            <View style={styles.center}>
              <AppText variant="body" color={colors.textLo} style={styles.emptyText}>No messages yet.</AppText>
              <AppText variant="label" color={colors.textMute} style={styles.emptyText}>Reply to a story to start a conversation.</AppText>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 4 },
  emptyText: { textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  content: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.base },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1 },
  preview: { marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
