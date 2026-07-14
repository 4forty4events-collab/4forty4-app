import React, { useState } from 'react';
import { Modal, View, TextInput, FlatList, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { KeyboardAwareView } from '../ui/KeyboardAwareView';
import { usePostComments, useAddComment, useDeleteComment } from '../../lib/social/hooks';
import { Avatar, timeAgo } from './PostCard';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';

// Comments for a moment — a bottom sheet with the thread + a composer. Reads/writes the
// post_comments table (comment_count is trigger-maintained). Own comments are deletable.
export function PostCommentsSheet({ visible, onClose, post, userId, onRequireAuth }) {
  const postId = visible ? post?.id : null;
  const { data: comments = [], isLoading } = usePostComments(postId);
  const add = useAddComment(post?.id);
  const del = useDeleteComment(post?.id);
  const [text, setText] = useState('');

  const submit = () => {
    if (!userId) { onRequireAuth?.(); return; }
    const body = text.trim();
    if (!body) return;
    add.mutate({ userId, body }, {
      onSuccess: () => setText(''),
      onError: (e) => Alert.alert('Could not comment', String(e?.message ?? e)),
    });
  };

  const confirmDelete = (c) => Alert.alert('Delete comment?', null, [
    { text: 'Delete', style: 'destructive', onPress: () => del.mutate(c.id) },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAwareView style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <AppText variant="title" style={styles.title}>Comments</AppText>

          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              isLoading
                ? <View style={styles.empty}><ActivityIndicator color={colors.accent} /></View>
                : <View style={styles.empty}><AppText variant="body" color={colors.textLo}>No comments yet — be the first.</AppText></View>
            }
            renderItem={({ item: c }) => (
              <View style={styles.row}>
                <Avatar url={c.author?.avatarUrl} name={c.author?.name} size={34} />
                <View style={styles.rowBody}>
                  <AppText variant="body"><AppText variant="bodySemi">{c.author?.name || 'Someone'}</AppText>{`  ${c.body}`}</AppText>
                  <AppText variant="caption" color={colors.textMute}>{timeAgo(c.createdAt)}</AppText>
                </View>
                {c.userId === userId ? (
                  <Pressable onPress={() => confirmDelete(c)} hitSlop={8}><Icon name="trash" size={15} color={colors.textMute} /></Pressable>
                ) : null}
              </View>
            )}
          />

          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={userId ? 'Add a comment…' : 'Sign in to comment'}
              placeholderTextColor={colors.textMute}
              editable={!!userId}
              onFocus={() => { if (!userId) onRequireAuth?.(); }}
              maxLength={500}
              multiline
            />
            <Pressable style={[styles.send, (!text.trim() || add.isPending) && styles.sendOff]} onPress={submit} disabled={!text.trim() || add.isPending}>
              {add.isPending ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Icon name="send" size={18} color={colors.onAccent} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAwareView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, paddingTop: space.md, paddingBottom: space.base, maxHeight: '82%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.sm },
  title: { paddingHorizontal: space.base, marginBottom: space.sm },
  list: { paddingHorizontal: space.base },
  empty: { paddingVertical: space.xl, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
  rowBody: { flex: 1, gap: 2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.base, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  input: { flex: 1, maxHeight: 110, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.5 },
});
