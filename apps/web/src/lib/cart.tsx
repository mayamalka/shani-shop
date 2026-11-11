import type { CartLineInput, Personalization, ProductType } from '@shani/shared';
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';

/**
 * The cart lives in this browser only (localStorage) – it's "strictly necessary" storage, so no consent is needed.
 * Prices here are for display; the server recalculates everything at checkout.
 */
export interface CartItem {
  key: string;
  productId: string;
  slug: string;
  type: ProductType;
  title: string;
  imageUrl: string | null;
  quantity: number;
  /** price per unit when added (display only) */
  unitPrice: number;
  personalization?: Personalization;
  pages?: { id: string; title: string }[];
}

export type CartAction =
  | { type: 'add'; item: CartItem }
  | { type: 'replace'; key: string; item: CartItem }
  | { type: 'setQuantity'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  /** put a removed item back where it was (undo) */
  | { type: 'restore'; item: CartItem; index: number }
  | { type: 'clear' }
  | { type: 'load'; items: CartItem[] };

export const MAX_QTY = 10;

export function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'add': {
      // identical simple products stack; personalized books are always separate lines
      if (action.item.type === 'SIMPLE') {
        const same = state.find((i) => i.productId === action.item.productId);
        if (same) return state.map((i) => (i === same ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + action.item.quantity) } : i));
      }
      return [...state, action.item];
    }
    case 'replace':
      return state.map((i) => (i.key === action.key ? { ...action.item, key: action.key } : i));
    case 'setQuantity':
      return state.map((i) => (i.key === action.key ? { ...i, quantity: Math.max(1, Math.min(MAX_QTY, Math.round(action.quantity))) } : i));
    case 'remove':
      return state.filter((i) => i.key !== action.key);
    case 'restore': {
      if (state.some((i) => i.key === action.item.key)) return state;
      const next = [...state];
      next.splice(Math.min(Math.max(action.index, 0), next.length), 0, action.item);
      return next;
    }
    case 'clear':
      return [];
    case 'load':
      return action.items;
  }
}

export const cartCount = (items: CartItem[]) => items.reduce((s, i) => s + i.quantity, 0);

export const toLineInput = (i: CartItem): CartLineInput => ({
  productId: i.productId,
  quantity: i.quantity,
  ...(i.personalization ? { personalization: i.personalization } : {}),
  ...(i.pages ? { pageIds: i.pages.map((p) => p.id) } : {}),
});

const STORAGE_KEY = 'shani:cart:v1';

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.key === 'string' && typeof i.productId === 'string') : [];
  } catch {
    return [];
  }
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  dispatch: (a: CartAction) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, undefined, loadCart);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* private mode / storage full – cart still works for this visit */
    }
  }, [items]);
  // keep several open tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) dispatch({ type: 'load', items: loadCart() });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const value = useMemo(() => ({ items, count: cartCount(items), dispatch }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}

export const newCartKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
