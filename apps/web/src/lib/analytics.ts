/**
 * GA4 + Meta Pixel + TikTok Pixel – loaded ONLY after the visitor agrees (see consent.tsx),
 * and only when an ID is set in admin settings. We never send names, emails, phones or photos.
 */
type Fn = (...args: unknown[]) => void;
interface TrackerWindow {
  dataLayer?: unknown[];
  gtag?: Fn;
  fbq?: Fn & { callMethod?: Fn; queue?: unknown[]; loaded?: boolean; version?: string; push?: Fn };
  _fbq?: unknown;
  ttq?: Record<string, unknown> & { page?: () => void; track?: Fn; load?: (id: string) => void };
  TiktokAnalyticsObject?: string;
  __trackersLoaded?: { analytics: boolean; marketing: boolean };
}
const w = () => window as unknown as TrackerWindow;

function addScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  s.id = id;
  document.head.appendChild(s);
}

export interface TrackerIds {
  ga4Id: string;
  metaPixelId: string;
  tiktokPixelId: string;
}

export function loadTrackers(ids: TrackerIds, consent: { analytics: boolean; marketing: boolean }) {
  const win = w();
  const loaded = (win.__trackersLoaded ??= { analytics: false, marketing: false });

  if (consent.analytics && ids.ga4Id && !loaded.analytics) {
    loaded.analytics = true;
    win.dataLayer = win.dataLayer || [];
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments);
    };
    win.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: consent.marketing ? 'granted' : 'denied', ad_user_data: consent.marketing ? 'granted' : 'denied', ad_personalization: consent.marketing ? 'granted' : 'denied' });
    win.gtag('js', new Date());
    // SPA: page views are sent by trackPageView on every route change
    win.gtag('config', ids.ga4Id, { send_page_view: false, anonymize_ip: true });
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga4Id)}`, 'ga4-script');
  }

  if (consent.marketing && !loaded.marketing && (ids.metaPixelId || ids.tiktokPixelId)) {
    loaded.marketing = true;
    if (ids.metaPixelId) {
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      } as NonNullable<TrackerWindow['fbq']>;
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.push = fbq;
      win.fbq = fbq;
      win._fbq = fbq;
      addScript('https://connect.facebook.net/en_US/fbevents.js', 'meta-pixel');
      fbq('init', ids.metaPixelId);
    }
    if (ids.tiktokPixelId) {
      // official TikTok loader, written out
      win.TiktokAnalyticsObject = 'ttq';
      const ttq = (win.ttq = (win.ttq || []) as unknown as NonNullable<TrackerWindow['ttq']>) as unknown as unknown[] & Record<string, unknown>;
      const methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      for (const m of methods) ttq[m] = (...args: unknown[]) => ttq.push([m, ...args]);
      ttq._i = { [ids.tiktokPixelId]: [] };
      ttq._t = { [ids.tiktokPixelId]: Date.now() };
      ttq._o = { [ids.tiktokPixelId]: {} };
      addScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(ids.tiktokPixelId)}&lib=ttq`, 'tiktok-pixel');
    }
  }
}

export function trackPageView(path: string, title: string) {
  const win = w();
  win.gtag?.('event', 'page_view', { page_path: path, page_title: title, page_location: location.origin + path });
  win.fbq?.('track', 'PageView');
  win.ttq?.page?.();
}

export interface EcomItem {
  id: string;
  name: string;
  price: number; // shekels
  quantity: number;
}

type ShopEvent = 'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase';
const META: Record<ShopEvent, string> = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase' };
const TIKTOK: Record<ShopEvent, string> = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'CompletePayment' };

/** Shop events → all trackers that are loaded. Values in shekels. */
export function trackShopEvent(event: ShopEvent, data: { value: number; items: EcomItem[]; transactionId?: string }) {
  const win = w();
  win.gtag?.('event', event, {
    currency: 'ILS',
    value: data.value,
    transaction_id: data.transactionId,
    items: data.items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  const contents = data.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price }));
  win.fbq?.('track', META[event], { currency: 'ILS', value: data.value, content_type: 'product', contents });
  win.ttq?.track?.(TIKTOK[event], { currency: 'ILS', value: data.value, contents: data.items.map((i) => ({ content_id: i.id, content_name: i.name, quantity: i.quantity, price: i.price })) });
}
