import React, { useCallback, useState } from 'react';
import {
  View, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useMarket } from '../providers/MarketProvider';
import { AppText, colors, space, radius, fonts } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';

// Admin content Inbox. Pull (ingest-apify for roster accounts) + Queue (pending
// drafts, each Approve → Review form or Delete).
export default function InboxScreen({ navigation }) {
  const { market: activeMarket } = useMarket();
  const [market, setMarket] = useState(activeMarket);
  const [profilesText, setProfilesText] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState(null);
  const [pullError, setPullError] = useState(null);

  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('content_drafts')
      .select('id, market, source, source_shortcode, raw_caption, image_url, created_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('Could not load the Inbox', error.message);
      return;
    }
    setDrafts(data ?? []);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pull = async () => {
    const profiles = profilesText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (profiles.length === 0) {
      setPullError('Add at least one Instagram profile URL (one per line).');
      return;
    }
    setPulling(true);
    setPullError(null);
    setPullResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('ingest-apify', { body: { profiles, market } });
      if (error) throw error;
      if (data?.error) throw new Error(data.detail ? `${data.error} ${data.detail}` : data.error);
      setPullResult(data);
      await load();
    } catch (e) {
      setPullError(e.message ?? 'Pull failed');
    } finally {
      setPulling(false);
    }
  };

  const approve = async (draft) => {
    setBusyId(draft.id);
    try {
      const { data, error } = await supabase.functions.invoke('parse-listing', {
        body: { text: draft.raw_caption, market: draft.market },
      });
      if (error) throw error;
      if (!data?.ok || !data?.parsed) {
        throw new Error(data?.error ?? 'The parser returned nothing usable.');
      }
      navigation.navigate('ReviewListing', {
        parsed: data.parsed,
        raw_caption: draft.raw_caption,
        market: draft.market,
        draftId: draft.id,
        scrapedImageUrl: draft.image_url ?? null,
      });
    } catch (e) {
      Alert.alert('Could not parse this draft', String(e.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = (draft) => {
    Alert.alert('Delete draft?', 'This removes it from the Inbox. It can be re-pulled later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(draft.id);
          const { error } = await supabase.from('content_drafts').update({ status: 'discarded' }).eq('id', draft.id);
          setBusyId(null);
          if (error) { Alert.alert('Delete failed', error.message); return; }
          setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAwareView>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <AppText variant="label" color={colors.textHi}>‹ Back</AppText>
        </TouchableOpacity>
        <AppText variant="heading">Inbox</AppText>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Pull */}
        <View style={styles.pullCard}>
          <AppText variant="heading">Pull from Instagram</AppText>
          <AppText variant="label" color={colors.textLo} style={styles.pullHint}>
            One profile URL per line. Re-pulling won't add posts you've already seen.
          </AppText>

          <View style={styles.marketRow}>
            {['DZ', 'ZW'].map((m) => (
              <Chip key={m} label={m} selected={market === m} onPress={() => setMarket(m)} />
            ))}
          </View>

          <TextInput
            style={styles.profilesInput}
            value={profilesText}
            onChangeText={setProfilesText}
            placeholder={'https://www.instagram.com/account1/\nhttps://www.instagram.com/account2/'}
            placeholderTextColor={colors.textMute}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Button label="Pull posts" loading={pulling} onPress={pull} style={styles.pullButton} />

          {pullError && <AppText variant="label" color={colors.danger} style={styles.pullMsg}>{pullError}</AppText>}
          {pullResult && <AppText variant="label" color={colors.success} style={styles.pullMsg}>{pullResult.message}</AppText>}
        </View>

        {/* Queue */}
        <View style={styles.queueHeader}>
          <AppText variant="heading">Pending review</AppText>
          <View style={styles.queueCount}><AppText variant="caption" color={colors.onAccent}>{drafts.length}</AppText></View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} />
        ) : drafts.length === 0 ? (
          <AppText variant="body" color={colors.textLo} style={styles.emptyText}>Nothing to review. Pull some posts above.</AppText>
        ) : (
          drafts.map((d) => (
            <View key={d.id} style={styles.draftRow}>
              {d.image_url ? (
                <Image source={{ uri: d.image_url }} style={styles.draftThumb} />
              ) : (
                <View style={[styles.draftThumb, styles.draftThumbEmpty]}>
                  <AppText variant="caption" color={colors.textMute}>no img</AppText>
                </View>
              )}
              <View style={styles.draftBody}>
                <View style={styles.draftMeta}>
                  <View style={styles.draftBadge}><AppText variant="caption" color={colors.textLo}>{d.market}</AppText></View>
                  {d.source === 'instagram' && <View style={styles.draftBadgeIg}><AppText variant="caption" color="#fff">IG</AppText></View>}
                </View>
                <AppText variant="label" color={colors.textLo} numberOfLines={3} style={styles.draftCaption}>{d.raw_caption}</AppText>
                <View style={styles.draftActions}>
                  {busyId === d.id ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => approve(d)}>
                        <AppText variant="label" color={colors.onAccent}>Approve →</AppText>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => remove(d)}>
                        <AppText variant="label" color={colors.danger}>Delete</AppText>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      </KeyboardAwareView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.xs },
  content: { padding: space.base, paddingBottom: space.huge },
  pullCard: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.base, backgroundColor: colors.bgElevated },
  pullHint: { marginTop: 4, marginBottom: space.md, lineHeight: 17 },
  marketRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  profilesInput: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.md, padding: 12, fontSize: 13, fontFamily: fonts.body, color: colors.textHi, minHeight: 88 },
  pullButton: { marginTop: space.md },
  pullMsg: { marginTop: space.sm },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm },
  queueCount: { backgroundColor: colors.accent, minWidth: 24, alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  emptyText: { textAlign: 'center', marginTop: 24 },
  draftRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  draftThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.bgElevated2 },
  draftThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  draftBody: { flex: 1 },
  draftMeta: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  draftBadge: { backgroundColor: colors.bgElevated2, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  draftBadgeIg: { backgroundColor: '#B23A78', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  draftCaption: { lineHeight: 18 },
  draftActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, alignItems: 'center' },
  approveBtn: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: space.base, borderRadius: radius.sm },
  deleteBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(229,96,94,0.4)' },
});
