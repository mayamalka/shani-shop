import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { AboutPage } from './pages/About';
import { CartPage } from './pages/Cart';
import { CheckoutPage } from './pages/Checkout';
import { CheckoutCancelledPage, CheckoutSuccessPage } from './pages/CheckoutResult';
import { ContactPage } from './pages/Contact';
import { HomePage } from './pages/Home';
import { AccessibilityStatementPage, PrivacyPage, ShippingPage, TermsPage } from './pages/Legal';
import { NotFoundPage } from './pages/NotFound';
import { ProductPage } from './pages/Product';
import { ShopPage } from './pages/Shop';

// The admin area is loaded only when someone opens it – shoppers never download it.
const AdminLogin = lazy(() => import('./admin/Login'));
const AdminShell = lazy(() => import('./admin/AdminShell'));
const AdminOrders = lazy(() => import('./admin/Orders'));
const AdminProductEditor = lazy(() => import('./admin/ProductEditor'));
const AdminPages = lazy(() => import('./admin/PageOptions'));
const AdminSettings = lazy(() => import('./admin/Settings'));

const lazyEl = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'shop', element: <ShopPage /> },
      { path: 'shop/:slug', element: <ProductPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'checkout/success', element: <CheckoutSuccessPage /> },
      { path: 'checkout/cancelled', element: <CheckoutCancelledPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'accessibility', element: <AccessibilityStatementPage /> },
      { path: 'shipping', element: <ShippingPage /> },
      { path: 'admin/login', element: lazyEl(<AdminLogin />) },
      {
        path: 'admin',
        element: lazyEl(<AdminShell />),
        children: [
          { index: true, element: lazyEl(<AdminOrders />) },
          { path: 'orders', element: lazyEl(<AdminOrders />) },
          { path: 'orders/:id', element: lazyEl(<AdminOrders />) },
          // products are managed from the shop itself (pencil on each product)
          { path: 'products', element: <Navigate to="/shop" replace /> },
          { path: 'products/new', element: lazyEl(<AdminProductEditor />) },
          { path: 'products/:id', element: lazyEl(<AdminProductEditor />) },
          { path: 'pages', element: lazyEl(<AdminPages />) },
          { path: 'settings', element: lazyEl(<AdminSettings />) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
