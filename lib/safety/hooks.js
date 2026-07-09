import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSafetyContacts, createReport, getMyReports } from './safetyRepository';

// React bindings for the safety repository.
export function useSafetyContacts(market, region) {
  return useQuery({
    queryKey: ['safetyContacts', market ?? null, region ?? null],
    queryFn: () => getSafetyContacts(market, { region }),
    enabled: !!market,
    staleTime: 60 * 60 * 1000, // essentially static per market — cache hard
  });
}

export function useMyReports(userId) {
  return useQuery({
    queryKey: ['myReports', userId ?? null],
    queryFn: () => getMyReports(userId),
    enabled: !!userId,
  });
}

export function useCreateReport(userId, market) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, reason, details }) => createReport(userId, target, { reason, details, market }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myReports', userId ?? null] }),
  });
}
