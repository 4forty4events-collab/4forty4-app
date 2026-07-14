import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { Icon } from '../ui/Icon';
import { Avatar, timeAgo } from './PostCard';
import { AppText, colors, space, radius } from '../../lib/theme';

const VERB_ICON = { reviewed: 'star', shared_collection: 'bookmark', followed: 'heart' };

function phrase(a) {
  if (a.verb === 'reviewed') return { verb: 'reviewed', obj: a.target_title };
  if (a.verb === 'shared_collection') return { verb: 'shared a collection', obj: a.target_title };
  return { verb: 'started following', obj: a.subject_name };
}

// One friend-activity line — what someone you follow just did (review / shared collection /
// follow). Taps deep-link to the thing (or the actor's profile). Same shape as ActivityScreen.
export function ActivityRow({ activity, onOpen, onOpenActor }) {
  const p = phrase(activity);
  return (
    <Pressable style={styles.row} onPress={() => onOpen(activity)}>
      <Pressable onPress={() => onOpenActor(activity.actor_id)} hitSlop={6}>
        <Avatar url={activity.actor_avatar} name={activity.actor_name} size={42} />
      </Pressable>
      <View style={styles.body}>
        <AppText variant="body" numberOfLines={2}>
          <AppText variant="bodySemi">{activity.actor_name || 'Someone'}</AppText>
          {` ${p.verb} `}
          {p.obj ? <AppText variant="bodySemi">{p.obj}</AppText> : null}
        </AppText>
        <AppText variant="caption" color={colors.textMute}>{timeAgo(activity.created_at)}</AppText>
      </View>
      {activity.target_image
        ? <Image source={{ uri: activity.target_image }} style={styles.thumb} />
        : <View style={styles.badge}><Icon name={VERB_ICON[activity.verb] ?? 'spark'} size={16} color={colors.textLo} /></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.base, paddingVertical: space.sm },
  body: { flex: 1, gap: 2 },
  thumb: { width: 46, height: 46, borderRadius: radius.sm },
  badge: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
});
