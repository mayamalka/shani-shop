import type { OrderStatus } from './schemas';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'ממתינה לתשלום',
  PAID: 'שולמה – ממתינה',
  IN_PROGRESS: 'בטיפול',
  SHIPPED: 'יצאה למשלוח',
  DELIVERED: 'הושלמה',
  CANCELLED: 'בוטלה',
};

export const DELIVERY_LABELS = { SHIPPING: 'משלוח עד הבית', PICKUP: 'איסוף עצמי' } as const;

export function ageRangeLabel(min: number, max: number): string {
  return min === max ? `גיל ${min}` : `גיל ${min}–${max}`;
}
