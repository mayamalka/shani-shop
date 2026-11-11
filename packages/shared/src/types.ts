import type { Agorot } from './money';
import type { CustomPricing, CustomPriceLine, TaxStatus, DeliveryMethod } from './pricing';
import type { OrderStatus, PhotoRole } from './schemas';

export type ProductType = 'PRESET' | 'CUSTOM' | 'SIMPLE';

export interface ProductImageDTO {
  id: string;
  url: string;
  alt: string;
}

export interface ProductDTO {
  id: string;
  slug: string;
  type: ProductType;
  title: string;
  description: string;
  ageLabel: string;
  price: Agorot;
  discountPrice: Agorot | null;
  discountEndsAt: string | null;
  active: boolean;
  sortOrder: number;
  images: ProductImageDTO[];
  /** only for CUSTOM products */
  pricing?: CustomPricing;
}

export interface PageOptionDTO {
  id: string;
  title: string;
  summary: string;
  minAge: number;
  maxAge: number;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
}

export interface PublicSettings {
  businessName: string;
  businessEmail: string;
  whatsappNumber: string;
  whatsappMessage: string;
  instagramUrl: string;
  tiktokUrl: string;
  taxStatus: TaxStatus;
  vatRate: number;
  shippingFee: Agorot;
  pickupAddress: string;
  aboutTitle: string;
  aboutText: string;
  aboutImageUrl: string | null;
  accessibilityCoordinator: string;
  photoRetentionDays: number;
  ga4Id: string;
  metaPixelId: string;
  tiktokPixelId: string;
}

export interface QuoteLine {
  index: number;
  productId: string;
  title: string;
  unitPrice: Agorot;
  /** regular price before discount, when a discount applies */
  regularUnitPrice: Agorot | null;
  quantity: number;
  lineTotal: Agorot;
  pageBreakdown?: CustomPriceLine[];
}

export interface QuoteResponse {
  lines: QuoteLine[];
  subtotal: Agorot;
  shipping: Agorot;
  total: Agorot;
  vatIncluded: Agorot;
  taxStatus: TaxStatus;
  /** human-readable problems (e.g. product no longer available), keyed by line index */
  problems: { index: number; message: string }[];
}

export interface OrderItemDTO {
  id: string;
  productId: string | null;
  title: string;
  productType: ProductType;
  unitPrice: Agorot;
  quantity: number;
  childName: string | null;
  parent1Name: string | null;
  parent2Name: string | null;
  pages: { id: string; title: string }[];
  photos: { id: string; role: PhotoRole; url: string }[];
}

export interface OrderSummaryDTO {
  id: string;
  number: number;
  createdAt: string;
  status: OrderStatus;
  fullName: string;
  itemCount: number;
  total: Agorot;
}

export interface OrderDetailDTO extends OrderSummaryDTO {
  email: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  city: string;
  street: string;
  houseNumber: string;
  apartment: string;
  notes: string;
  subtotal: Agorot;
  shipping: Agorot;
  vatIncluded: Agorot;
  paidAt: string | null;
  paymentRef: string | null;
  marketingOptIn: boolean;
  photosDeletedAt: string | null;
  items: OrderItemDTO[];
  history: { status: OrderStatus; at: string }[];
}

export interface CityDTO {
  code: number;
  name: string;
}

export interface AdminMe {
  email: string;
  csrfToken: string;
}
