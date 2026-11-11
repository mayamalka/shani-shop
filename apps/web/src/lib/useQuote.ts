import type { QuoteResponse } from '@shani/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { toLineInput, type CartItem } from './cart';

/** Authoritative prices for the current cart, calculated by the server. */
export function useQuote(items: CartItem[], delivery: 'SHIPPING' | 'PICKUP') {
  const lines = items.map(toLineInput);
  return useQuery({
    queryKey: ['quote', lines, delivery],
    queryFn: () => api.post<QuoteResponse>('/api/cart/quote', { items: lines, delivery }),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
  });
}
