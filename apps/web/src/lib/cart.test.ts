import { describe, expect, it } from 'vitest';
import { cartCount, cartReducer, MAX_QTY, toLineInput, type CartItem } from './cart';

const simple: CartItem = { key: 'a', productId: 'p-simple', slug: 's', type: 'SIMPLE', title: 'מחזיק', imageUrl: null, quantity: 1, unitPrice: 6000 };
const book: CartItem = {
  key: 'b',
  productId: 'p-book',
  slug: 'b',
  type: 'PRESET',
  title: 'ספר',
  imageUrl: null,
  quantity: 1,
  unitPrice: 30000,
  personalization: { childName: 'נועם', parent1Name: 'מיכל', parent2Name: '', photos: [{ uploadId: 'u1', token: 't'.repeat(64), role: 'CHILD' }] },
};

describe('cart reducer', () => {
  it('stacks identical simple products', () => {
    const s = cartReducer(cartReducer([], { type: 'add', item: simple }), { type: 'add', item: { ...simple, key: 'a2', quantity: 2 } });
    expect(s).toHaveLength(1);
    expect(s[0]!.quantity).toBe(3);
  });
  it('keeps every personalized book as its own line', () => {
    const s = cartReducer(cartReducer([], { type: 'add', item: book }), { type: 'add', item: { ...book, key: 'b2' } });
    expect(s).toHaveLength(2);
  });
  it('clamps quantity between 1 and the max', () => {
    let s = cartReducer([simple], { type: 'setQuantity', key: 'a', quantity: 0 });
    expect(s[0]!.quantity).toBe(1);
    s = cartReducer(s, { type: 'setQuantity', key: 'a', quantity: 99 });
    expect(s[0]!.quantity).toBe(MAX_QTY);
  });
  it('removes, replaces and clears', () => {
    let s = cartReducer([simple, book], { type: 'remove', key: 'a' });
    expect(s.map((i) => i.key)).toEqual(['b']);
    s = cartReducer(s, { type: 'replace', key: 'b', item: { ...book, key: 'other', quantity: 4 } });
    expect(s[0]).toMatchObject({ key: 'b', quantity: 4 });
    expect(cartReducer(s, { type: 'clear' })).toEqual([]);
  });
  it('undo puts a removed item back in its place, only once', () => {
    let s = cartReducer([simple, book], { type: 'remove', key: 'a' });
    s = cartReducer(s, { type: 'restore', item: simple, index: 0 });
    expect(s.map((i) => i.key)).toEqual(['a', 'b']);
    expect(cartReducer(s, { type: 'restore', item: simple, index: 0 })).toBe(s);
  });
  it('counts items and builds the server request', () => {
    expect(cartCount([simple, { ...book, quantity: 2 }])).toBe(3);
    expect(toLineInput(simple)).toEqual({ productId: 'p-simple', quantity: 1 });
    expect(toLineInput({ ...book, pages: [{ id: 'x', title: 'X' }] })).toMatchObject({ pageIds: ['x'], personalization: { childName: 'נועם' } });
  });
});
