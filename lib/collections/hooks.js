import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { normalizeVenue, normalizeEvent } from '../feed';
import {
  fetchCollections, createCollection, renameCollection, setCollectionPinned,
  deleteCollection, addToCollection, removeFromCollection,
  fetchCollectionIdsForItem, fetchCollectionItems,
  setCollectionPublic, fetchPublicCollections, fetchCollectionBySlug,
} from './collectionsRepository';

const KEY = (userId) => ['collections', userId ?? null];

export function useCollections(userId) {
  return useQuery({
    queryKey: KEY(userId),
    queryFn: () => fetchCollections(userId),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useCollectionItems(collectionId) {
  return useQuery({
    queryKey: ['collectionItems', collectionId ?? null],
    queryFn: () => fetchCollectionItems(collectionId, normalizeVenue, normalizeEvent),
    enabled: !!collectionId,
    staleTime: 15_000,
  });
}

// Which of the user's collections contain a given listing (for the add sheet).
export function useItemCollections(userId, kind, id) {
  return useQuery({
    queryKey: ['itemCollections', userId ?? null, kind, id],
    queryFn: () => fetchCollectionIdsForItem(kind, id),
    enabled: !!userId && !!kind && !!id,
    staleTime: 10_000,
  });
}

export function useCreateCollection(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => createCollection(userId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(userId) }),
  });
}

export function useRenameCollection(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => renameCollection(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(userId) }),
  });
}

export function useSetCollectionPinned(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }) => setCollectionPinned(id, pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(userId) }),
  });
}

export function useSetCollectionPublic(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPublic }) => setCollectionPublic(id, isPublic),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(userId) }),
  });
}

// Another user's public collections (for their profile). Read-only, cross-user.
export function usePublicCollections(userId) {
  return useQuery({
    queryKey: ['publicCollections', userId ?? null],
    queryFn: () => fetchPublicCollections(userId),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

// Resolve a shared collection from a deep-link slug.
export function useCollectionBySlug(slug) {
  return useQuery({
    queryKey: ['collectionBySlug', slug ?? null],
    queryFn: () => fetchCollectionBySlug(slug),
    enabled: !!slug,
    staleTime: 60_000,
  });
}

export function useDeleteCollection(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteCollection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(userId) }),
  });
}

// Add/remove a listing to/from a collection. Invalidates the collection list (counts),
// that collection's items, and the item's membership set so every surface stays live.
export function useToggleCollectionItem(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, kind, id, add }) => {
      if (add) await addToCollection(collectionId, kind, id);
      else await removeFromCollection(collectionId, kind, id);
      return { collectionId, kind, id, add };
    },
    onSuccess: ({ collectionId, kind, id }) => {
      qc.invalidateQueries({ queryKey: KEY(userId) });
      qc.invalidateQueries({ queryKey: ['collectionItems', collectionId] });
      qc.invalidateQueries({ queryKey: ['itemCollections', userId ?? null, kind, id] });
    },
  });
}
