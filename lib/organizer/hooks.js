import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyOrganizers, createOrganizer, updateOrganizer,
  claimVenue, listMyVenues, listMyEvents,
  createEvent, updateEvent, deleteEvent,
  getListingAnalytics,
} from './organizerRepository';

// React bindings for the organizer repository.
export function useMyOrganizers(userId) {
  return useQuery({
    queryKey: ['myOrganizers', userId ?? null],
    queryFn: () => getMyOrganizers(userId),
    enabled: !!userId,
  });
}

export function useSaveOrganizer(userId, existingId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => (existingId ? updateOrganizer(existingId, data) : createOrganizer(userId, data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myOrganizers', userId ?? null] }),
  });
}

export function useMyVenues(organizerId) {
  return useQuery({
    queryKey: ['myVenues', organizerId ?? null],
    queryFn: () => listMyVenues(organizerId),
    enabled: !!organizerId,
  });
}

export function useMyEvents(organizerId) {
  return useQuery({
    queryKey: ['myEvents', organizerId ?? null],
    queryFn: () => listMyEvents(organizerId),
    enabled: !!organizerId,
  });
}

export function useClaimVenue(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizerId, venueId }) => claimVenue(organizerId, venueId),
    onSuccess: (_r, { organizerId }) => {
      qc.invalidateQueries({ queryKey: ['myVenues', organizerId] });
    },
  });
}

export function useSaveEvent(userId, organizerId, existingId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => (existingId ? updateEvent(existingId, data) : createEvent(userId, organizerId, data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myEvents', organizerId] }),
  });
}

export function useDeleteEvent(organizerId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myEvents', organizerId] }),
  });
}

export function useListingAnalytics(kind, id, days = 30) {
  return useQuery({
    queryKey: ['listingAnalytics', kind, id, days],
    queryFn: () => getListingAnalytics(kind, id, days),
    enabled: !!kind && !!id,
  });
}
