import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProfile, updateProfileMetadata, updateAvatar,
  getSettings, updateSettings,
  getTravelStats,
} from './profileRepository';

// React bindings for the profile/settings repository. Reads are cached queries;
// writes are mutations that update the cache on success, so the UI stays a thin
// presentation layer over the framework-agnostic repository.

export function useProfile(userId) {
  return useQuery({
    queryKey: ['profile', userId ?? null],
    queryFn: () => getProfile(userId),
    enabled: !!userId,
  });
}

export function useUpdateProfile(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch) => updateProfileMetadata(userId, patch),
    onSuccess: (updated) => qc.setQueryData(['profile', userId ?? null], updated),
  });
}

// Commits a freshly-uploaded avatar URL. Updates the profile cache so the header
// reflects it instantly; feed/comment author rows read avatar_url from
// public_profiles and pick it up on their next fetch.
export function useUpdateAvatar(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (avatarUrl) => updateAvatar(userId, avatarUrl),
    onSuccess: (updated) => qc.setQueryData(['profile', userId ?? null], updated),
  });
}

export function useSettings(userId) {
  return useQuery({
    queryKey: ['settings', userId ?? null],
    queryFn: () => getSettings(userId),
    enabled: !!userId,
  });
}

export function useUpdateSettings(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch) => updateSettings(userId, patch),
    // Optimistic: reflect the toggle immediately, roll back on error.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['settings', userId ?? null] });
      const prev = qc.getQueryData(['settings', userId ?? null]);
      if (prev) qc.setQueryData(['settings', userId ?? null], { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(['settings', userId ?? null], ctx.prev);
    },
    onSuccess: (updated) => qc.setQueryData(['settings', userId ?? null], updated),
  });
}

export function useTravelStats(userId, market) {
  return useQuery({
    queryKey: ['travelStats', userId ?? null, market ?? null],
    queryFn: () => getTravelStats(market),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
