import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '../providers/SessionProvider';
import { useMarket } from '../providers/MarketProvider';
import { useBlueprints, useRateBlueprint, useCloneBlueprint } from '../lib/coordination/hooks';
import { Avatar } from '../components/social/PostCard';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';

const COVER_FALLBACK = ['#3A2350', '#7A2A57', '#B8532E'];
const SCRIM = ['rgba(8,12,20,0)', 'rgba(8,12,20,0.4)', 'rgba(8,12,20,0.93)'];

function StarRow({ value, onRate }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onRate(n)} hitSlop={4}>
          <Icon name="star" size={18} color={n <= value ? colors.star : 'rgba(255,255,255,0.45)'} fill={n <= value} />
        </Pressable>
      ))}
    </View>
  );
}

// Blueprints — a browsable gallery of public outings anyone can clone, customize, and
// rate. "Steal a perfect day": tap Clone to copy it into your own outings.
export default function BlueprintsScreen({ navigation }) {
  const { session } = useSession();
  const { market } = useMarket();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id ?? null;
  const { data: blueprints = [], isLoading } = useBlueprints(market);
  const rate = useRateBlueprint();
  const clone = useCloneBlueprint(userId);
  const [myRatings, setMyRatings] = useState({});
  const [cloningId, setCloningId] = useState(null);

  const onRate = (tripId, stars) => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    setMyRatings((m) => ({ ...m, [tripId]: stars }));
    rate.mutate({ tripId, stars });
  };

  const onClone = (bp) => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    Alert.alert('Clone this blueprint?', `"${bp.title}" will be copied into your outings to customize and make your own.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clone',
        onPress: () => {
          setCloningId(bp.id);
          clone.mutate(bp.id, {
            onSuccess: (trip) => { setCloningId(null); navigation.replace('TripWorkspace', { tripId: trip.id, title: trip.title, myRole: 'owner' }); },
            onError: (e) => { setCloningId(null); Alert.alert('Could not clone', String(e?.message ?? e)); },
          });
        },
      },
    ]);
  };

  const renderItem = ({ item: bp }) => {
    const myStars = myRatings[bp.id] ?? Math.round(bp.ratingAvg);
    return (
      <View style={styles.card}>
        {bp.cover
          ? <ExpoImage source={{ uri: bp.cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          : <LinearGradient colors={COVER_FALLBACK} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={SCRIM} style={StyleSheet.absoluteFill} pointerEvents="none" />

        {bp.creatorName ? (
          <View style={styles.creator}>
            <Avatar url={bp.creatorAvatar} name={bp.creatorName} size={22} />
            <AppText variant="caption" color="#fff">{bp.creatorName}</AppText>
          </View>
        ) : null}

        <View style={styles.body}>
          <AppText variant="heading" color="#fff" numberOfLines={1} style={styles.title}>{bp.title}</AppText>
          <AppText variant="label" color="rgba(255,255,255,0.9)" style={styles.meta}>
            {bp.itemCount} stop{bp.itemCount === 1 ? '' : 's'}
            {bp.ratingCount ? `  ·  ★ ${bp.ratingAvg.toFixed(1)} (${bp.ratingCount})` : ''}
            {bp.cloneCount ? `  ·  ↻ ${bp.cloneCount}` : ''}
          </AppText>

          <View style={styles.actions}>
            <StarRow value={myStars} onRate={(n) => onRate(bp.id, n)} />
            <TouchableOpacity style={styles.cloneBtn} onPress={() => onClone(bp)} disabled={cloningId === bp.id} activeOpacity={0.85}>
              {cloningId === bp.id
                ? <ActivityIndicator size="small" color={colors.onAccent} />
                : <><Icon name="plus" size={15} color={colors.onAccent} /><AppText variant="label" color={colors.onAccent}>Clone</AppText></>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><AppText style={styles.back}>‹</AppText></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Blueprints</AppText>
          <AppText variant="caption" color={colors.textLo}>Steal a perfect day</AppText>
        </View>
        <View style={{ width: 26 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : (
        <FlatList
          data={blueprints}
          keyExtractor={(bp) => bp.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={(
            <View style={styles.center}>
              <AppText variant="body" color={colors.textLo} style={styles.emptyText}>No blueprints yet.</AppText>
              <AppText variant="label" color={colors.textMute} style={styles.emptyText}>Make one of your outings public to share it here.</AppText>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: 60, gap: 4 },
  emptyText: { textAlign: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 26, color: colors.textHi },
  content: { padding: space.base },
  card: { height: 200, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated2, marginBottom: space.md, justifyContent: 'flex-end' },
  creator: { position: 'absolute', top: space.md, left: space.md, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(11,18,32,0.5)', borderRadius: radius.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: 10 },
  body: { padding: space.base, gap: 6 },
  title: { fontSize: 20 },
  meta: {},
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stars: { flexDirection: 'row', gap: 4 },
  cloneBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 16, minWidth: 92, justifyContent: 'center' },
});
