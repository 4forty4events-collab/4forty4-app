import React, { useState } from 'react';
import { View, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useToggleFollow } from '../../lib/social/hooks';
import { FollowButton } from './FollowButton';
import { AppText, colors, space, radius } from '../../lib/theme';

// Discover's "Travelers Nearby" row: recently-active community members you can follow,
// as a horizontal card row. Parent supplies the list (see useActiveTravelers); follow
// state is optimistic and per-card. Hidden entirely when there's no one to show, so it
// never renders as a dead/empty shelf.
function initialOf(name) {
  return (name || 'T').trim().charAt(0).toUpperCase();
}

export function TravelersRow({ travelers, viewerId, onOpenProfile, onRequireAuth, subtitle }) {
  const [override, setOverride] = useState({}); // id -> bool (optimistic)
  const toggle = useToggleFollow(viewerId);

  if (!travelers?.length) return null;

  const isFollowing = (t) => override[t.id] ?? t.isFollowing;
  const onFollow = (t) => {
    if (!viewerId) { onRequireAuth?.(); return; }
    const next = !isFollowing(t);
    setOverride((m) => ({ ...m, [t.id]: next }));
    toggle.mutate({ targetId: t.id, follow: next }, {
      onError: () => setOverride((m) => ({ ...m, [t.id]: !next })),
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText variant="title" style={styles.title}>Travelers Nearby</AppText>
        {subtitle ? <AppText variant="label" color={colors.textLo}>{subtitle}</AppText> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {travelers.map((t) => (
          <View key={t.id} style={styles.card}>
            <TouchableOpacity style={styles.top} onPress={() => onOpenProfile?.(t.id)} activeOpacity={0.85}>
              {t.avatar_url ? (
                <Image source={{ uri: t.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <AppText variant="title" color={colors.textHi}>{initialOf(t.full_name)}</AppText>
                </View>
              )}
              <AppText variant="bodySemi" numberOfLines={1} style={styles.name}>{t.full_name || 'Traveler'}</AppText>
            </TouchableOpacity>
            <FollowButton
              isFollowing={isFollowing(t)}
              loading={toggle.isPending && toggle.variables?.targetId === t.id}
              onPress={() => onFollow(t)}
              style={styles.followBtn}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_W = 118;
const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  header: { paddingHorizontal: space.base, marginBottom: space.sm },
  title: { fontSize: 20 },
  row: { paddingHorizontal: space.base, gap: space.sm },
  card: { width: CARD_W, alignItems: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.sm, gap: space.xs },
  top: { alignItems: 'center', gap: 6, width: '100%' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgElevated2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { textAlign: 'center', maxWidth: '100%' },
  // Compact pill: the row is a browse surface, so Follow reads as a light action rather
  // than a full-width call to action. minWidth clears FollowButton's default 104.
  followBtn: { minWidth: 0, alignSelf: 'center', paddingVertical: 5, paddingHorizontal: space.md },
});
