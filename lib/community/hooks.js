import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchReviews, getMyReview, createReview, updateReview, deleteReview,
  fetchMyHelpful, fetchQuestions, askQuestion, answerQuestion,
  getCreatorStats, getUserBadges, fetchFeedPosts,
} from './communityRepository';

// React bindings for the community repository. Reads are cached queries; writes
// invalidate the affected keys so the UI stays a thin layer over the repository.
const tkey = (target) => [target?.kind ?? null, target?.id ?? null];

// The Feed's "moments" — recent reviews-with-photos as social posts, per market.
export function useFeedPosts(market) {
  return useQuery({
    queryKey: ['feedPosts', market],
    queryFn: () => fetchFeedPosts({ market }),
    enabled: !!market,
    staleTime: 30_000,
  });
}

export function useReviews(target, sort = 'helpful') {
  return useQuery({
    queryKey: ['reviews', ...tkey(target), sort],
    queryFn: () => fetchReviews(target, { sort }),
    enabled: !!target?.id,
  });
}

export function useMyReview(userId, target) {
  return useQuery({
    queryKey: ['myReview', userId ?? null, ...tkey(target)],
    queryFn: () => getMyReview(userId, target),
    enabled: !!userId && !!target?.id,
  });
}

export function useMyHelpful(userId, reviewIds) {
  const ids = (reviewIds ?? []).slice().sort();
  return useQuery({
    queryKey: ['myHelpful', userId ?? null, ids.join(',')],
    queryFn: () => fetchMyHelpful(userId, ids),
    enabled: !!userId && ids.length > 0,
  });
}

function useTargetInvalidator(target, userId) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['reviews', ...tkey(target)] });
    qc.invalidateQueries({ queryKey: ['myReview', userId ?? null, ...tkey(target)] });
    if (userId) qc.invalidateQueries({ queryKey: ['creatorStats', userId] });
  };
}

export function useSaveReview(target, userId, existingId) {
  const invalidate = useTargetInvalidator(target, userId);
  return useMutation({
    mutationFn: (data) => (existingId ? updateReview(existingId, data) : createReview(userId, target, data)),
    onSuccess: invalidate,
  });
}

export function useDeleteReview(target, userId) {
  const invalidate = useTargetInvalidator(target, userId);
  return useMutation({ mutationFn: (id) => deleteReview(id), onSuccess: invalidate });
}

export function useQuestions(target) {
  return useQuery({
    queryKey: ['questions', ...tkey(target)],
    queryFn: () => fetchQuestions(target),
    enabled: !!target?.id,
  });
}

export function useAskQuestion(target, userId, market) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => askQuestion(userId, target, body, market),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', ...tkey(target)] }),
  });
}

export function useAnswerQuestion(target, userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, body, isOfficial }) => answerQuestion(userId, questionId, body, { isOfficial }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', ...tkey(target)] }),
  });
}

export function useCreatorStats(userId) {
  return useQuery({
    queryKey: ['creatorStats', userId ?? null],
    queryFn: () => getCreatorStats(userId),
    enabled: !!userId,
  });
}

export function useUserBadges(userId) {
  return useQuery({
    queryKey: ['userBadges', userId ?? null],
    queryFn: () => getUserBadges(userId),
    enabled: !!userId,
  });
}
