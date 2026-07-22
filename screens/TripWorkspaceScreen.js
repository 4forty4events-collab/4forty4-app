import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Image, TextInput, ScrollView, FlatList, TouchableOpacity, Pressable, KeyboardAvoidingView, Platform, Switch, ActivityIndicator, Modal, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Swipeable } from 'react-native-gesture-handler';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../providers/SessionProvider';
import { useLocale } from '../providers/LocaleProvider';
import {
  useTripItinerary, useAddTripItem, useAddTripItems, useRemoveTripItem,
  useUpdateTripItem, useReorderTripItems, useAdminDeleteTrip,
  useTripMessages, useSendTripMessage, useSetTripPublic, useSubscribeToTrip,
} from '../lib/coordination/hooks';
import { AiSuggestionCard } from '../components/coordination/AiSuggestionCard';
import { VenuePickerModal } from '../components/coordination/VenuePickerModal';
import { appendSortOrder } from '../components/coordination/AddToTripSheet';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { SegmentedTabs } from '../components/ui/SegmentedTabs';
import { Icon } from '../components/ui/Icon';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';

function groupByDay(items) {
  const map = new Map();
  items.forEach((it) => {
    const k = it.dayDate ?? '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  });
  return Array.from(map.entries());
}

export default function TripWorkspaceScreen({ route, navigation }) {
  const { tripId, title, myRole } = route.params;
  const { session, profile } = useSession();
  const { t } = useLocale();
  const userId = session?.user?.id ?? null;
  const isAdmin = !!profile?.is_admin;
  const [tab, setTab] = useState('itinerary');
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editItem, setEditItem] = useState(null); // stop being edited (slot/day)
  const [editNote, setEditNote] = useState('');
  const [editDay, setEditDay] = useState('');
  const { data: itin } = useTripItinerary(tripId);
  const trip = itin?.trip;

  // Effective role is what the roster says (falls back to the nav param). A
  // signed-in user who isn't on the roster of a public trip is a "visitor".
  const myParticipant = itin?.participants?.find((p) => p.userId === userId);
  const effectiveRole = myParticipant?.role ?? myRole ?? null;
  const canEdit = effectiveRole === 'owner' || effectiveRole === 'editor';
  const isOwner = effectiveRole === 'owner';
  const isPublic = !!trip?.isPublic;
  const isVisitor = !!userId && !effectiveRole && isPublic;

  const addItem = useAddTripItem(tripId, userId);
  const addItems = useAddTripItems(tripId, userId);
  const removeItem = useRemoveTripItem(tripId);
  const updateItem = useUpdateTripItem(tripId);
  const reorder = useReorderTripItems(tripId);
  const adminDelete = useAdminDeleteTrip(userId);
  const setPublic = useSetTripPublic(tripId, userId);
  const subscribe = useSubscribeToTrip(userId, tripId);
  const { data: messages = [] } = useTripMessages(tripId);
  const send = useSendTripMessage(tripId, userId);

  const openDetail = (kind, id) => { if (kind && id) navigation.navigate('ListingDetail', { id, kind }); };
  const onAddBundle = (items) => addItems.mutate(
    items.map((it, i) => ({ target: { type: it.kind, id: it.id }, note: it.slot_title ?? null, sortOrder: i })),
  );

  // Manual "+ Add stop" from the catalog browser — same trip_items path, no AI.
  const onPickVenue = (venue) => {
    setPickerOpen(false);
    if (!venue?.id) return;
    addItem.mutate({ target: { type: 'venue', id: venue.id }, sortOrder: appendSortOrder() });
  };

  // Reorder within a day group: renumber the whole group so ties (single AI adds
  // default to sort_order 0) can't leave the order ambiguous.
  const moveStop = (list, idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    reorder.mutate(next.map((it, i) => ({ id: it.id, sortOrder: i * 10 })));
  };

  const openEdit = (it) => { setEditItem(it); setEditNote(it.note ?? ''); setEditDay(it.dayDate ?? ''); };
  const saveEdit = () => {
    if (!editItem) return;
    updateItem.mutate(
      { itemId: editItem.id, note: editNote.trim() || null, dayDate: editDay.trim() || null },
      { onSuccess: () => setEditItem(null) },
    );
  };

  const confirmDeletePlan = () => {
    const doDelete = () => adminDelete.mutate(tripId, { onSuccess: () => navigation.goBack() });
    if (Platform.OS === 'web') { if (typeof window === 'undefined' || window.confirm(t('coordination.deletePlanConfirm'))) doDelete(); return; }
    Alert.alert(t('coordination.deletePlan'), t('coordination.deletePlanConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('coordination.deletePlan'), style: 'destructive', onPress: doDelete },
    ]);
  };

  const qc = useQueryClient();
  const days = useMemo(() => groupByDay(itin?.items ?? []), [itin]);

  // Cinematic hero: the first stop's photo, the outing's date, and its friend count.
  const heroCover = (itin?.items ?? []).find((it) => it.coverImageUrl)?.coverImageUrl ?? null;
  const friendCount = itin?.participants?.length ?? 0;
  const heroDate = trip?.startDate
    ? new Date(`${trip.startDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  // Realtime: one channel per trip. Any INSERT/DELETE on this trip's messages or
  // itinerary invalidates the matching query so human text + AI cards + pinned
  // stops sync across everyone's screens instantly (replaces the old polling).
  useEffect(() => {
    if (!tripId) return undefined;
    const channel = supabase
      .channel(`trip:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_messages', filter: `trip_id=eq.${tripId}` },
        () => qc.invalidateQueries({ queryKey: ['tripMessages', tripId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_items', filter: `trip_id=eq.${tripId}` },
        () => qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_participants', filter: `trip_id=eq.${tripId}` },
        () => qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId, qc]);

  // Two explicit actions share one composer. Send posts a normal group message
  // (no curator call, no credit spend); Ask AI routes the same text to the curator
  // via ask_ai. onSubmitEditing defaults to Send, so hitting return never spends.
  const submitMessage = (askAi) => {
    if (!userId) { navigation.navigate('SignIn'); return; }
    const body = draft.trim();
    if (!body) return;
    send.mutate({ body, askAi: !!askAi }, { onSuccess: () => setDraft('') });
  };
  const onSend = () => submitMessage(false);
  const onAskAi = () => submitMessage(true);
  const onAddSuggestion = (p) => {
    if (!p?.kind || !p?.id) return;
    addItem.mutate({ target: { type: p.kind, id: p.id } });
  };

  // Swipe (or ✕) to delete a pinned stop. Both call removeItem -> remove_trip_item,
  // the same server path the curator uses for "remove X" messages, so the dropped
  // place is excluded from future suggestions.
  // A stop on the vertical timeline: a rail (dot + connecting line) beside a rich
  // card (photo, slot label, name). Editors can reorder/edit; swipe to delete.
  const renderStop = (it, list, idx) => {
    const first = idx === 0;
    const last = idx === list.length - 1;
    const isEvent = it.kind === 'event';
    const card = (
      <View style={styles.stopCard}>
        <Pressable style={styles.stopMain} onPress={() => openDetail(it.kind, it.targetId)}>
          {it.coverImageUrl ? (
            <Image source={{ uri: it.coverImageUrl }} style={styles.stopThumb} />
          ) : (
            <View style={[styles.stopThumb, styles.thumbFallback]}><AppText style={styles.thumbGlyph}>{isEvent ? '🎫' : '📍'}</AppText></View>
          )}
          <View style={styles.itemText}>
            {it.note ? <AppText variant="caption" color={colors.accent2} numberOfLines={1}>{it.note}</AppText> : null}
            <AppText variant="bodySemi" numberOfLines={1}>{it.title ?? it.kind}</AppText>
          </View>
        </Pressable>
        {canEdit ? (
          <View style={styles.itemControls}>
            <TouchableOpacity onPress={() => moveStop(list, idx, -1)} hitSlop={6} disabled={first}>
              <Icon name="chevronUp" size={17} color={first ? colors.textMute : colors.textLo} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => moveStop(list, idx, 1)} hitSlop={6} disabled={last}>
              <Icon name="chevronDown" size={17} color={last ? colors.textMute : colors.textLo} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openEdit(it)} hitSlop={6}><Icon name="edit" size={16} color={colors.textLo} /></TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
    return (
      <View key={it.id} style={styles.timelineRow}>
        <View style={styles.rail}>
          <View style={styles.railDot} />
          {!last ? <View style={styles.railLine} /> : null}
        </View>
        {canEdit ? (
          <View style={styles.stopFlex}>
            <Swipeable renderRightActions={() => (
              <TouchableOpacity style={styles.swipeDelete} onPress={() => removeItem.mutate(it.id)}><Icon name="trash" size={22} color="#fff" /></TouchableOpacity>
            )}>{card}</Swipeable>
          </View>
        ) : (
          <View style={styles.stopFlex}>{card}</View>
        )}
      </View>
    );
  };

  const renderMessage = ({ item: m }) => {
    if (m.isAiResponse && m.payload) {
      return (
        <AiSuggestionCard
          message={m}
          canEdit={canEdit}
          onAdd={onAddSuggestion}
          onAddBundle={onAddBundle}
          onOpen={openDetail}
          adding={addItem.isPending || addItems.isPending}
        />
      );
    }
    // AI/system status line with no card payload (e.g. "Removed X from the plan.").
    if (m.isAiResponse) {
      return <AppText variant="caption" color={colors.textMute} style={styles.systemMsg}>{m.body}</AppText>;
    }
    const mine = m.userId && m.userId === userId;
    return (
      <View style={[styles.msgRow, mine ? styles.msgMine : styles.msgTheirs]}>
        {!mine ? <AppText variant="caption" color={colors.textLo} style={styles.msgAuthor}>{m.author?.name ?? '—'}</AppText> : null}
        <AppText variant="body" color={mine ? colors.onAccent : colors.textHi}>{m.body}</AppText>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Cinematic hero — the outing's identity: first-stop photo, title, date, friends. */}
      <View style={styles.hero}>
        {heroCover
          ? <Image source={{ uri: heroCover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <LinearGradient colors={['#3A2350', '#7A2A57', '#B8532E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={['rgba(8,12,20,0.4)', 'rgba(8,12,20,0.1)', 'rgba(8,12,20,0.96)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.heroTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.heroBtn}><Icon name="chevronLeft" size={22} color="#fff" /></Pressable>
          {friendCount ? <View style={styles.heroMembers}><Icon name="spark" size={13} color="#fff" /><AppText variant="caption" color="#fff">{friendCount}</AppText></View> : <View />}
        </View>
        <View style={styles.heroBody}>
          <AppText variant="display" color="#fff" numberOfLines={2} style={styles.heroTitle}>{title}</AppText>
          {(heroDate || friendCount) ? (
            <AppText variant="label" color="rgba(255,255,255,0.92)">
              {[heroDate, friendCount ? `${friendCount} friend${friendCount === 1 ? '' : 's'}` : null].filter(Boolean).join('  ·  ')}
            </AppText>
          ) : null}
        </View>
      </View>

      {/* Blueprint (public) card — owners share the outing as a cloneable blueprint. */}
      {isOwner ? (
        <View style={styles.blueprintCard}>
          <View style={styles.blueprintIconWrap}><Icon name="spark" size={16} color={colors.accent} fill /></View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodySemi">{t('coordination.publicBlueprint')}</AppText>
            <AppText variant="caption" color={colors.textLo} numberOfLines={1}>{isPublic ? 'Public · anyone can clone this' : t('coordination.publicHint')}</AppText>
          </View>
          <Switch value={isPublic} onValueChange={(v) => setPublic.mutate(v)} disabled={setPublic.isPending} trackColor={{ true: colors.accent, false: colors.line }} thumbColor="#fff" />
        </View>
      ) : isPublic ? (
        <View style={styles.blueprintCard}>
          <View style={styles.blueprintIconWrap}><Icon name="spark" size={16} color={colors.accent} fill /></View>
          <AppText variant="label" color={colors.textLo} style={{ flex: 1 }}>Public blueprint · anyone can clone this</AppText>
        </View>
      ) : null}

      <View style={styles.tabsWrap}>
        <SegmentedTabs
          tabs={[{ id: 'itinerary', label: t('coordination.itinerary') }, { id: 'chat', label: t('coordination.chat') }]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'itinerary' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.itinContent}>
          {canEdit ? (
            <TouchableOpacity style={styles.addExpBtn} onPress={() => setPickerOpen(true)}>
              <Icon name="plus" size={16} color={colors.accent} />
              <AppText variant="bodySemi" color={colors.accent}>Add Experience</AppText>
            </TouchableOpacity>
          ) : null}

          {days.length === 0 ? (
            <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('coordination.noItems')}</AppText>
          ) : days.map(([day, items]) => (
            <View key={day} style={styles.daySection}>
              {day !== '—' ? <AppText variant="heading" color={colors.accent2} style={styles.dayLabel}>{day}</AppText> : null}
              {items.map((it, idx) => renderStop(it, items, idx))}
            </View>
          ))}

          {isAdmin ? (
            <TouchableOpacity style={styles.deletePlanBtn} onPress={confirmDeletePlan} disabled={adminDelete.isPending}>
              {adminDelete.isPending
                ? <ActivityIndicator color={colors.danger} />
                : <AppText variant="label" color={colors.danger}>🗑  {t('coordination.deletePlan')}</AppText>}
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<AppText variant="body" color={colors.textLo} style={styles.empty}>{t('coordination.noMessages')}</AppText>}
          />
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={draft} onChangeText={setDraft}
              placeholder={t('coordination.messagePlaceholder')} placeholderTextColor={colors.textMute}
              onSubmitEditing={onSend} returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.askAiBtn, (send.isPending || !draft.trim()) && styles.composerDisabled]}
              onPress={onAskAi}
              disabled={send.isPending || !draft.trim()}
            >
              {send.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <View style={styles.askAiInner}><Icon name="spark" size={14} fill color="#fff" strokeWidth={1.4} /><AppText variant="caption" color="#fff">{t('coordination.askAi')}</AppText></View>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (send.isPending || !draft.trim()) && styles.composerDisabled]}
              onPress={onSend}
              disabled={send.isPending || !draft.trim()}
            >
              <Icon name="send" size={18} color={colors.onAccent} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {isVisitor ? (
        <View style={styles.subscribeBar}>
          <Button
            label={`＋ ${t('coordination.subscribeToPlan')}`}
            variant="secondary"
            textColor={colors.accent2}
            loading={subscribe.isPending}
            onPress={() => subscribe.mutate()}
          />
        </View>
      ) : null}

      <VenuePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        market={trip?.market ?? null}
        onPick={onPickVenue}
        busy={addItem.isPending}
      />

      <Modal visible={!!editItem} transparent animationType="fade" onRequestClose={() => setEditItem(null)}>
        {/* KeyboardAwareView centers the dialog and lifts it above the keyboard on
            iOS; the nested Pressables give tap-backdrop-to-close while swallowing taps
            on the sheet itself. */}
        <KeyboardAwareView dismissOnTap={false}>
          <Pressable style={styles.editBackdrop} onPress={() => setEditItem(null)}>
            <Pressable style={styles.editSheet} onPress={() => {}}>
          <AppText variant="title">{t('coordination.editStop')}</AppText>
          <AppText variant="body" color={colors.textLo} numberOfLines={1} style={styles.editVenue}>{editItem?.title}</AppText>
          <TextInput
            style={styles.editInput} value={editNote} onChangeText={setEditNote}
            placeholder={t('coordination.slotLabel')} placeholderTextColor={colors.textMute}
          />
          <TextInput
            style={styles.editInput} value={editDay} onChangeText={setEditDay}
            placeholder={t('coordination.dayField')} placeholderTextColor={colors.textMute} autoCapitalize="none"
          />
          <View style={styles.editBtnRow}>
            <Button label={t('common.cancel')} variant="ghost" full={false} onPress={() => setEditItem(null)} style={styles.editCancel} textColor={colors.textLo} />
            <Button label={t('common.saveChanges')} variant="primary" full={false} loading={updateItem.isPending} onPress={saveEdit} style={styles.editSave} />
          </View>
            </Pressable>
          </Pressable>
        </KeyboardAwareView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  subscribeBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: space.base, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  back: { fontSize: 28, color: colors.textHi },
  topTitle: { flex: 1, textAlign: 'center' },

  hero: { height: 196, justifyContent: 'flex-end', backgroundColor: colors.bgElevated2 },
  heroTop: { position: 'absolute', top: space.md, left: space.base, right: space.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(11,18,32,0.5)', alignItems: 'center', justifyContent: 'center' },
  heroMembers: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(11,18,32,0.5)', borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  heroBody: { padding: space.base, gap: 3 },
  heroTitle: { fontSize: 30, lineHeight: 34 },
  blueprintCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.base, marginTop: space.base, padding: space.base, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  blueprintIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(232,137,74,0.15)', alignItems: 'center', justifyContent: 'center' },

  tabsWrap: { padding: space.md },
  empty: { textAlign: 'center', marginTop: space.xxl },
  itinContent: { padding: space.base, paddingBottom: space.huge },
  publicRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.base, marginBottom: space.base },
  publicHint: { marginTop: 2 },
  daySection: { marginBottom: space.lg },
  dayLabel: { marginBottom: space.sm },
  itemWrap: { borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, paddingRight: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.bgElevated2 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { fontSize: 18 },
  itemText: { flex: 1 },
  itemNote: { marginTop: 2 },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: space.base },
  ctrl: { fontSize: 15 },
  addStopBtn: { borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginBottom: space.base },
  addExpBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 14, marginBottom: space.lg },

  // Vertical timeline: a rail (dot + connecting line) beside each stop card.
  timelineRow: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 22, alignItems: 'center' },
  railDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colors.accent, backgroundColor: colors.bgBase, marginTop: 24 },
  railLine: { width: 2, flex: 1, backgroundColor: colors.line, marginTop: 2, marginBottom: -space.sm },
  stopFlex: { flex: 1, marginBottom: space.sm, borderRadius: radius.md, overflow: 'hidden' },
  stopCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, paddingRight: space.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  stopMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  stopThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.bgElevated2 },
  deletePlanBtn: { marginTop: space.sm, paddingVertical: space.base, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  editBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  editSheet: { marginHorizontal: space.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.lg },
  editVenue: { marginTop: 2, marginBottom: space.base },
  editInput: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.bgBase, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.body, color: colors.textHi, marginBottom: space.sm },
  editBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.xs },
  editCancel: { paddingHorizontal: space.base },
  editSave: { minWidth: 120 },
  swipeDelete: { backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center', width: 64 },
  swipeDeleteText: { fontSize: 20 },
  systemMsg: { alignSelf: 'center', fontStyle: 'italic', textAlign: 'center', marginVertical: 6, paddingHorizontal: space.base },
  chatContent: { padding: space.base },
  msgRow: { maxWidth: '82%', borderRadius: radius.lg, paddingVertical: 9, paddingHorizontal: 13, marginVertical: 4 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  msgTheirs: { alignSelf: 'flex-start', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line },
  msgAuthor: { marginBottom: 2 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bgBase },
  composerInput: { flex: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: space.base, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  sendBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 18 },
  askAiBtn: { height: 44, borderRadius: radius.pill, backgroundColor: colors.accent2, paddingHorizontal: 14, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  askAiInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  composerDisabled: { opacity: 0.4 },
});
