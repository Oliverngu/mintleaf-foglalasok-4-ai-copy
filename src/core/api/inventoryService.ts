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
import { cleanFirestoreData } from '@/lib/firestoreCleaners';

const unitCollection = (unitId: string, path: string) => collection(db, 'units', unitId, path);

// Firestore rejects undefined values, so every payload is cleaned before writes.
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

  addCategory: (unitId: string, data: Omit<InventoryCategory, 'id' | 'createdAt' | 'updatedAt'>) =>
    addDoc(
      unitCollection(unitId, 'inventoryCategories'),
      cleanFirestoreData({
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ),

  updateCategory: (unitId: string, id: string, data: Partial<InventoryCategory>) =>
    updateDoc(
      doc(db, 'units', unitId, 'inventoryCategories', id),
      cleanFirestoreData({
        ...data,
        updatedAt: serverTimestamp(),
      })
    ),

  deleteCategory: (unitId: string, id: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryCategories', id)),

  addSupplier: (unitId: string, data: Omit<InventorySupplier, 'id' | 'createdAt' | 'updatedAt'>) =>
    addDoc(
      unitCollection(unitId, 'inventorySuppliers'),
      cleanFirestoreData({
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ),

  updateSupplier: (unitId: string, id: string, data: Partial<InventorySupplier>) =>
    updateDoc(
      doc(db, 'units', unitId, 'inventorySuppliers', id),
      cleanFirestoreData({
        ...data,
        updatedAt: serverTimestamp(),
      })
    ),

  deleteSupplier: (unitId: string, id: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventorySuppliers', id)),

  addProduct: (unitId: string, data: Omit<InventoryProduct, 'id' | 'createdAt' | 'updatedAt'>) =>
    addDoc(
      unitCollection(unitId, 'inventoryProducts'),
      cleanFirestoreData({
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    ),

  updateProduct: (unitId: string, id: string, data: Partial<InventoryProduct>) =>
    updateDoc(
      doc(db, 'units', unitId, 'inventoryProducts', id),
      cleanFirestoreData({
        ...data,
        updatedAt: serverTimestamp(),
      })
    ),

  deleteProduct: (unitId: string, id: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryProducts', id)),

  deleteIdealStock: (unitId: string, productId: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryIdealStocks', productId)),

  deleteCurrentStock: (unitId: string, productId: string) =>
    deleteDoc(doc(db, 'units', unitId, 'inventoryCurrentStocks', productId)),

  setIdealStock: (unitId: string, productId: string, idealQuantity: number) =>
    setDoc(
      doc(db, 'units', unitId, 'inventoryIdealStocks', productId),
      cleanFirestoreData({
        productId,
        idealQuantity,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    ),

  setCurrentStock: (
    unitId: string,
    productId: string,
    currentQuantity: number,
    updatedByUserId?: string
  ) =>
    setDoc(
      doc(db, 'units', unitId, 'inventoryCurrentStocks', productId),
      cleanFirestoreData({
        productId,
        currentQuantity,
        updatedAt: serverTimestamp(),
        ...(updatedByUserId !== undefined ? { updatedByUserId } : {}),
      }),
      { merge: true }
    ),

  listenSettings: (unitId: string, cb: (settings: Record<string, unknown>) => void) =>
    onSnapshot(doc(db, 'units', unitId, 'inventorySettings', 'default'), snapshot => {
      const data = snapshot.data();
      cb(data ? { ...data, id: snapshot.id } : { id: snapshot.id });
    }),
};

export default InventoryService;
