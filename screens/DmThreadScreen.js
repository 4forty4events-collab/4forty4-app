import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { useSession } from '../providers/SessionProvider';
import { useThread, useSendMessage, useMarkThreadRead } from '../lib/social/hooks';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

// Lightweight 1:1 DM thread. Reached from a story reply or a message notification
// (route 'DmThread', params { otherUserId, otherName }). Polls while open; marks the
// other person's messages read on focus.
export default function DmThreadScreen({ navigation, route }) {
  const { session } = useSession();
  const meId = session?.user?.id ?? null;
  const otherUserId = route?.params?.otherUserId ?? null;
  const otherName = route?.params?.otherName || 'Chat';

  const { data: messages = [], isLoading } = useThread(meId, otherUserId);
  const send = useSendMessage(meId, otherUserId);
  const markRead = useMarkThreadRead();
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  // Mark the incoming side read whenever the screen is focused (and after new arrivals).
  useFocusEffect(useCallback(() => {
    if (meId && otherUserId) markRead.mutate({ meId, otherId: otherUserId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, otherUserId, messages.length]));

  useEffect(() => {
    if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
  }, [messages.length]);

  const submit = () => {
    const body = draft.trim();
    if (!body || !meId || !otherUserId) return;
    setDraft('');
    send.mutate({ body }, { onError: () => setDraft(body) });
  };

  const renderItem = ({ item }) => (
    <View style={[styles.row, item.mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {item.storyId ? (
          <AppText variant="caption" color={item.mine ? 'rgba(11,18,32,0.6)' : colors.textMute} style={styles.storyTag}>
            Replying to a story
          </AppText>
        ) : null}
        <AppText variant="body" color={item.mine ? colors.onAccent : colors.textHi}>{item.body}</AppText>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}><AppText variant="label" color={colors.textHi}>‹ Back</AppText></Pressable>
          <AppText variant="heading" numberOfLines={1} style={styles.headerTitle}>{otherName}</AppText>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
        ) : messages.length === 0 ? (
          <View style={styles.center}>
            <AppText variant="body" color={colors.textLo} style={styles.emptyText}>No messages yet.</AppText>
            <AppText variant="label" color={colors.textMute} style={styles.emptyText}>Say hello and plan something.</AppText>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={colors.textMute}
            multiline
            maxLength={1000}
            onSubmitEditing={submit}
          />
          <Pressable
            style={[styles.sendBtn, (!draft.trim() || send.isPending) && styles.sendBtnOff]}
            onPress={submit}
            disabled={!draft.trim() || send.isPending}
            accessibilityLabel="Send message"
          >
            {send.isPending ? <ActivityIndicator color={colors.onAccent} size="small" /> : <Icon name="send" size={18} color={colors.onAccent} />}
          </Pressable>
        </View>
      </KeyboardAwareView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headerTitle: { flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  emptyText: { textAlign: 'center' },
  listContent: { padding: space.base, gap: space.sm },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: radius.sm },
  storyTag: { marginBottom: 3 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  input: { flex: 1, maxHeight: 120, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.5 },
});
