import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, serverTimestamp } from '../firebase/config';
import {
  InventoryCategory,
  InventorySupplier,
  InventoryProduct,
  InventoryIdealStock,
  InventoryCurrentStock,
} from '../models/data';
import { assertNoUndefinedDeep, hasUndefinedDeep, sanitizeFirestoreData } from '../../lib/sanitizeFirestoreData';

const unitCollection = (unitId: string, path: string) => collection(db, 'units', unitId, path);
const isDev = process.env.NODE_ENV !== 'production';

export const InventoryService = {
  listenCategories: (unitId: string, cb: (items: InventoryCategory[]) => void) =>
    onSnapshot(query(unitCollection(unitId, 'inventoryCategories'), orderBy('name')), snapshot => {
      cb(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<InventoryCategory, 'id'>) })));
    }),

  listenSuppliers: (unitId: string, cb: (items: InventorySupplier[]) => void) =>
    onSnapshot(query(unitCollection(unitId, 'inventorySuppliers'), orderBy('name')), snapshot => {
      cb(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<InventorySupplier, 'id'>) })));
    }),

  listenProducts: (unitId: string, cb: (items: InventoryProduct[]) => void) =>
    onSnapshot(query(unitCollection(unitId, 'inventoryProducts'), orderBy('name')), snapshot => {
      cb(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<InventoryProduct, 'id'>) })));
    }),

  listenIdealStocks: (unitId: string, cb: (items: InventoryIdealStock[]) => void) =>
    onSnapshot(unitCollection(unitId, 'inventoryIdealStocks'), snapshot => {
      cb(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<InventoryIdealStock, 'id'>) })));
    }),

  listenCurrentStocks: (unitId: string, cb: (items: InventoryCurrentStock[]) => void) =>
    onSnapshot(unitCollection(unitId, 'inventoryCurrentStocks'), snapshot => {
      cb(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<InventoryCurrentStock, 'id'>) })));
    }),

  addCategory: (unitId: string, data: Omit<InventoryCategory, 'id' | 'createdAt' | 'updatedAt'>) => {
    const payload = {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.addCategory] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.addCategory payload');
    return addDoc(unitCollection(unitId, 'inventoryCategories'), cleanPayload);
  },

  updateCategory: (unitId: string, id: string, data: Partial<InventoryCategory>) => {
    const payload = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.updateCategory] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.updateCategory payload');
    return updateDoc(doc(db, 'units', unitId, 'inventoryCategories', id), cleanPayload);
  },

  deleteCategory: (unitId: string, id: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryCategories', id)),

  addSupplier: (unitId: string, data: Omit<InventorySupplier, 'id' | 'createdAt' | 'updatedAt'>) => {
    const payload = {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.addSupplier] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.addSupplier payload');
    return addDoc(unitCollection(unitId, 'inventorySuppliers'), cleanPayload);
  },

  updateSupplier: (unitId: string, id: string, data: Partial<InventorySupplier>) => {
    const payload = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.updateSupplier] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.updateSupplier payload');
    return updateDoc(doc(db, 'units', unitId, 'inventorySuppliers', id), cleanPayload);
  },

  deleteSupplier: (unitId: string, id: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventorySuppliers', id)),

  addProduct: (unitId: string, data: Omit<InventoryProduct, 'id' | 'createdAt' | 'updatedAt'>) => {
    const supplierIds = Array.isArray(data.supplierIds) ? data.supplierIds.filter(Boolean) : [];
    const payload = {
      ...data,
      supplierIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.addProduct] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.addProduct payload');
    return addDoc(unitCollection(unitId, 'inventoryProducts'), cleanPayload);
  },

  updateProduct: (unitId: string, id: string, data: Partial<InventoryProduct>) => {
    const supplierIds =
      data.supplierIds !== undefined
        ? Array.isArray(data.supplierIds)
          ? data.supplierIds.filter(Boolean)
          : []
        : undefined;
    const payload = {
      ...data,
      ...(supplierIds !== undefined ? { supplierIds } : {}),
      updatedAt: serverTimestamp(),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.updateProduct] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.updateProduct payload');
    return updateDoc(doc(db, 'units', unitId, 'inventoryProducts', id), cleanPayload);
  },

  deleteProduct: (unitId: string, id: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryProducts', id)),

  deleteIdealStock: (unitId: string, productId: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryIdealStocks', productId)),

  deleteCurrentStock: (unitId: string, productId: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryCurrentStocks', productId)),

  setIdealStock: (unitId: string, productId: string, idealQuantity: number) => {
    const payload = {
      productId,
      idealQuantity,
      updatedAt: serverTimestamp(),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.setIdealStock] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.setIdealStock payload');
    return setDoc(doc(db, 'units', unitId, 'inventoryIdealStocks', productId), cleanPayload, { merge: true });
  },

  setCurrentStock: (
    unitId: string,
    productId: string,
    currentQuantity: number,
    updatedByUserId?: string
  ) => {
    const payload = {
      productId,
      currentQuantity,
      updatedAt: serverTimestamp(),
      ...(updatedByUserId ? { updatedByUserId } : {}),
    };
    if (isDev && hasUndefinedDeep(payload)) {
      console.warn('[InventoryService.setCurrentStock] Sanitizing payload with undefined values', payload);
    }
    const cleanPayload = sanitizeFirestoreData(payload);
    assertNoUndefinedDeep(cleanPayload, 'InventoryService.setCurrentStock payload');
    return setDoc(doc(db, 'units', unitId, 'inventoryCurrentStocks', productId), cleanPayload, { merge: true });
  },

  listenSettings: (unitId: string, cb: (settings: Record<string, unknown>) => void) =>
    onSnapshot(doc(db, 'units', unitId, 'inventorySettings', 'default'), snapshot => {
      const data = snapshot.data();
      cb(data ? { ...data, id: snapshot.id } : { id: snapshot.id });
    }),
};

export default InventoryService;
