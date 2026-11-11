import type { PageOptionDTO, ProductDTO, PublicSettings } from '@shani/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<PublicSettings>('/api/settings'), staleTime: 5 * 60_000 });
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => api.get<ProductDTO[]>('/api/products') });
export const useProduct = (slug: string) => useQuery({ queryKey: ['product', slug], queryFn: () => api.get<ProductDTO>(`/api/products/${encodeURIComponent(slug)}`) });
export const usePageOptions = (enabled = true) =>
  useQuery({ queryKey: ['page-options'], queryFn: () => api.get<PageOptionDTO[]>('/api/page-options'), enabled });
