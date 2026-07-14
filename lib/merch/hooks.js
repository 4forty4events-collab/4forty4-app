import { useQuery } from '@tanstack/react-query';
import { fetchMerchProducts, fetchMerchPayment, fetchPromotedMerch } from './merchRepository';

// Storefront product read. fetchMerchProducts already swallows failures into [], so the
// caller can fall back to the static catalog when this resolves empty. No retry — a
// missing table (pre-migration) shouldn't thrash the network.
export function useMerchProducts() {
  return useQuery({
    queryKey: ['merch', 'products'],
    queryFn: fetchMerchProducts,
    staleTime: 60_000,
    retry: false,
  });
}

// Promoted products for the Discover ad card. Empty result -> render nothing.
export function usePromotedMerch() {
  return useQuery({
    queryKey: ['merch', 'promoted'],
    queryFn: fetchPromotedMerch,
    staleTime: 60_000,
    retry: false,
  });
}

// Admin-editable payment destinations, merged with catalog.js defaults by the caller.
export function useMerchPayment() {
  return useQuery({
    queryKey: ['merch', 'payment'],
    queryFn: fetchMerchPayment,
    staleTime: 60_000,
    retry: false,
  });
}
