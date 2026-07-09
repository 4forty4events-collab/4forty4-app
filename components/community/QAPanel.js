import React, { useMemo, useState } from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { TrustBadge } from '../safety/TrustBadge';
import { useLocale } from '../../providers/LocaleProvider';
import { useSession } from '../../providers/SessionProvider';
import { useQuestions, useAskQuestion, useAnswerQuestion } from '../../lib/community/hooks';
import { AppText, colors, space, radius, fonts } from '../../lib/theme';

// Inline Q&A for a Detail view: anyone signed in can ask; answers show their
// author, and answers from an admin/organizer carry an "Official" verified badge.
export function QAPanel({ item, navigation }) {
  const { t } = useLocale();
  const { session, profile } = useSession();
  const userId = session?.user?.id ?? null;
  const isOrganizer = !!profile?.is_admin;
  const target = useMemo(() => ({ kind: item.kind, id: item.id }), [item.kind, item.id]);

  const { data: questions = [], isLoading } = useQuestions(target);
  const ask = useAskQuestion(target, userId, item.market);
  const answer = useAnswerQuestion(target, userId);

  const [draft, setDraft] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState({});

  const submitQuestion = () => {
    if (!userId) { navigation?.navigate('SignIn'); return; }
    const body = draft.trim();
    if (!body) return;
    ask.mutate(body, { onSuccess: () => setDraft('') });
  };

  const submitAnswer = (questionId) => {
    const body = (answerDrafts[questionId] ?? '').trim();
    if (!userId || !body) return;
    answer.mutate({ questionId, body, isOfficial: isOrganizer }, {
      onSuccess: () => setAnswerDrafts((d) => ({ ...d, [questionId]: '' })),
    });
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="title" style={styles.heading}>{t('community.qa')}</AppText>

      <View style={styles.askRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={draft} onChangeText={setDraft}
          placeholder={t('community.askPlaceholder')} placeholderTextColor={colors.textMute}
          returnKeyType="send" onSubmitEditing={submitQuestion}
        />
        <TouchableOpacity style={styles.askBtn} onPress={submitQuestion} disabled={ask.isPending}>
          <AppText variant="label" color={colors.onAccent}>{t('community.ask')}</AppText>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginVertical: space.md }} color={colors.accent} />
      ) : questions.length === 0 ? (
        <AppText variant="body" color={colors.textLo} style={styles.empty}>{t('community.noQuestions')}</AppText>
      ) : (
        questions.map((q) => (
          <View key={q.id} style={styles.qBlock}>
            <AppText variant="bodySemi">{q.body}</AppText>
            <View style={styles.authorRow}>
              <AppText variant="caption" color={colors.textLo}>{q.author?.name ?? t('profile.explorer')}</AppText>
              <TrustBadge tier={q.author?.trustTier} compact />
            </View>

            {q.answers.map((a) => (
              <View key={a.id} style={styles.answer}>
                <View style={styles.answerHead}>
                  <AppText variant="label">{a.author?.name ?? t('profile.explorer')}</AppText>
                  <TrustBadge tier={a.author?.trustTier} compact />
                  {a.isOfficial ? <AppText variant="caption" color={colors.success} style={styles.official}>✓ {t('community.official')}</AppText> : null}
                </View>
                <AppText variant="body" color={colors.textLo} style={styles.answerBody}>{a.body}</AppText>
              </View>
            ))}

            {userId ? (
              <View style={styles.answerInputRow}>
                <TextInput
                  style={[styles.answerInput, { flex: 1 }]}
                  value={answerDrafts[q.id] ?? ''}
                  onChangeText={(v) => setAnswerDrafts((d) => ({ ...d, [q.id]: v }))}
                  placeholder={t('community.answerPlaceholder')} placeholderTextColor={colors.textMute}
                />
                <TouchableOpacity style={styles.answerBtn} onPress={() => submitAnswer(q.id)}>
                  <AppText variant="label" color={colors.textHi}>{t('community.answer')}</AppText>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xl },
  heading: { marginBottom: space.md },
  askRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 11, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  askBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.base, justifyContent: 'center' },
  empty: { paddingVertical: space.sm },
  qBlock: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.base, marginBottom: space.md },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  answer: { marginTop: space.sm, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: colors.line },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  official: { overflow: 'hidden' },
  answerBody: { marginTop: 3 },
  answerInputRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  answerInput: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgBase, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: space.sm, fontSize: 14, fontFamily: fonts.body, color: colors.textHi },
  answerBtn: { paddingHorizontal: space.base, justifyContent: 'center', backgroundColor: colors.bgElevated2, borderRadius: radius.sm },
});
