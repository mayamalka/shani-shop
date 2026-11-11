import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './index.css';
import { A11yProvider } from './lib/a11y';
import { CartProvider } from './lib/cart';
import { ConsentProvider } from './lib/consent';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <A11yProvider>
        <ConsentProvider>
          <CartProvider>
            <RouterProvider router={router} />
          </CartProvider>
        </ConsentProvider>
      </A11yProvider>
    </QueryClientProvider>
  </StrictMode>,
);
