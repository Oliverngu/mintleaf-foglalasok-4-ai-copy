import { Timestamp } from 'firebase/firestore';

export interface ProductCategory {
  id: string;
  unitId: string;
  name: string;
  description?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Product {
  id: string;
  unitId: string;
  name: string;
  categoryId: string;
  unitOfMeasure: string;
  description?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface IdealStock {
  id: string;
  unitId: string;
  productId: string;
  idealQuantity: number;
  updatedAt?: Timestamp;
}

export interface CurrentStock {
  id: string;
  unitId: string;
  productId: string;
  currentQuantity: number;
  updatedAt?: Timestamp;
}

export interface Supplier {
  id: string;
  unitId: string;
  name: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  sharedUnitIds?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InventoryUnitContext {
  unitId: string;
  unitName: string;
  logoUrl?: string;
}

export interface InventoryRecommendation {
  productId: string;
  recommendedOrderQuantity: number;
  unitId: string;
}

export const calculateRecommendedOrder = (
  idealQuantity: number,
  currentQuantity: number
): number => Math.max(idealQuantity - currentQuantity, 0);
