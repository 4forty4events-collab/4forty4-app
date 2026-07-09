import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import {
  requestPlace, getMyVenueRequests, getUpcomingSavedEvents,
  createGroupTrip, getMyTrips, fetchTripItinerary, addTripItem, addTripItems, removeTripItem,
  updateTripItem, reorderTripItems, adminDeleteTrip, searchVenuesForPicker,
  fetchTripMessages, sendTripMessage,
  setTripPublic, fetchPublicTrips, cloneTrip, subscribeToTrip, adminIngestItinerary,
} from './coordinationRepository';

// ---- place requests --------------------------------------------------------
export function useMyVenueRequests(userId) {
  return useQuery({ queryKey: ['venueRequests', userId ?? null], queryFn: () => getMyVenueRequests(userId), enabled: !!userId });
}
export function useRequestPlace(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => requestPlace(userId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venueRequests', userId ?? null] }),
  });
}

// ---- calendar --------------------------------------------------------------
export function useUpcomingSavedEvents(userId) {
  return useQuery({ queryKey: ['savedEvents', userId ?? null], queryFn: () => getUpcomingSavedEvents(userId), enabled: !!userId });
}

// ---- trips -----------------------------------------------------------------
export function useMyTrips(userId) {
  return useQuery({ queryKey: ['trips', userId ?? null], queryFn: () => getMyTrips(userId), enabled: !!userId });
}
export function useCreateTrip(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => createGroupTrip(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips', userId ?? null] }),
  });
}
export function useTripItinerary(tripId) {
  return useQuery({ queryKey: ['tripItinerary', tripId ?? null], queryFn: () => fetchTripItinerary(tripId), enabled: !!tripId });
}
export function useAddTripItem(tripId, addedBy) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, dayDate, note, sortOrder }) => addTripItem(tripId, target, { dayDate, note, sortOrder, addedBy }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] }),
  });
}
export function useRemoveTripItem(tripId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => removeTripItem(itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] }),
  });
}
export function useAddTripItems(tripId, addedBy) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items) => addTripItems(tripId, items, addedBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] }),
  });
}
export function useUpdateTripItem(tripId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, dayDate, note, sortOrder }) => updateTripItem(itemId, { dayDate, note, sortOrder }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] }),
  });
}
export function useReorderTripItems(tripId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedItems) => reorderTripItems(orderedItems),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] }),
  });
}
export function useAdminDeleteTrip(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId) => adminDeleteTrip(tripId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips', userId ?? null] }),
  });
}
// Venue picker search (manual "+ Add stop" / "Add to trip"). Debounce-friendly:
// key includes the term; enabled only once a market is known.
export function usePickerVenueSearch(market, term) {
  return useQuery({
    queryKey: ['venuePicker', market ?? null, (term ?? '').trim()],
    queryFn: () => searchVenuesForPicker(market, term),
    enabled: !!market,
    staleTime: 30000,
  });
}

// ---- public blueprints -----------------------------------------------------
export function useSetTripPublic(tripId, userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (isPublic) => setTripPublic(tripId, isPublic),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] });
      qc.invalidateQueries({ queryKey: ['trips', userId ?? null] });
      qc.invalidateQueries({ queryKey: ['publicTrips'] });
    },
  });
}
export function usePublicTrips({ limit = 20 } = {}) {
  return useQuery({ queryKey: ['publicTrips', limit], queryFn: () => fetchPublicTrips({ limit }) });
}
export function useCloneTrip(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceTripId) => cloneTrip(sourceTripId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips', userId ?? null] }),
  });
}
export function useSubscribeToTrip(userId, tripId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => subscribeToTrip(tripId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tripItinerary', tripId] });
      qc.invalidateQueries({ queryKey: ['trips', userId ?? null] });
    },
  });
}
export function useAdminIngest() {
  return useMutation({ mutationFn: (payload) => adminIngestItinerary(payload) });
}

// ---- trip chat -------------------------------------------------------------
export function useTripMessages(tripId) {
  return useQuery({
    queryKey: ['tripMessages', tripId ?? null],
    queryFn: () => fetchTripMessages(tripId),
    enabled: !!tripId,
    // Live updates come from the Realtime channel in TripWorkspaceScreen (no polling).
  });
}
export function useSendTripMessage(tripId, userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, payload }) => sendTripMessage(tripId, userId, { body, payload }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tripMessages', tripId] });
      // Fire the AI curator ONLY when the user tapped "Ask AI" — a plain Send posts
      // to group chat with no curator call (and no credit spend). ask_ai marks the
      // request explicit so the server skips the intent gate / cooldown. Fire-and-
      // forget — chat still works if it fails.
      if (variables?.askAi) {
        supabase.functions.invoke('coordination-ai-curator', { body: { trip_id: tripId, ask_ai: true } })
          .then(() => qc.invalidateQueries({ queryKey: ['tripMessages', tripId] }))
          .catch(() => {});
      }
    },
  });
}
