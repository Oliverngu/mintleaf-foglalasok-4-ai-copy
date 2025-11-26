import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  Unsubscribe,
  Query,
  QuerySnapshot,
  query,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  CurrentStock,
  IdealStock,
  Product,
  ProductCategory,
  Supplier,
} from '../models/inventory';

// DEV MODE WORKAROUND: In Cloud Shell Web Preview the Firestore watch stream can throw
// INTERNAL ASSERTION errors when using realtime listeners. To keep the Készlet app stable
// in development, fall back to a one-shot fetch while preserving realtime updates in prod.
const subscribeOnceOrRealtime = <T>(
  queryRef: Query,
  unitId: string,
  mapSnapshot: (snapshot: QuerySnapshot, currentUnitId: string) => T[],
  onChange: (data: T[]) => void
): Unsubscribe => {
  if (import.meta.env.DEV) {
    getDocs(queryRef)
      .then(snapshot => onChange(mapSnapshot(snapshot, unitId)))
      .catch(error => {
        console.error('Firestore one-shot fetch failed', error);
        onChange([]);
      });
    return () => undefined;
  }

  return onSnapshot(queryRef, snapshot => onChange(mapSnapshot(snapshot, unitId)));
};

const buildUnitScopedSubscriber = <T>(
  unitIds: string[],
  pathSegment: string,
  mapper: (docSnap: any, unitId: string) => T,
  onChange: (data: T[]) => void
): Unsubscribe => {
  if (!unitIds.length) {
    onChange([]);
    return () => undefined;
  }

  const perUnitData = new Map<string, T[]>();
  const unsubs = unitIds.map(unitId => {
    const collectionRef = collection(db, 'units', unitId, pathSegment);
    const queryRef = query(collectionRef);

    return subscribeOnceOrRealtime(
      queryRef,
      unitId,
      (snapshot, currentUnitId) =>
        snapshot.docs.map(docSnap => mapper(docSnap, currentUnitId)),
      data => {
        perUnitData.set(unitId, data);
        const merged = Array.from(perUnitData.values()).flat();
        onChange(merged);
      }
    );
  });

  return () => unsubs.forEach(unsub => unsub());
};

export const subscribeToCategories = (
  unitIds: string[],
  onChange: (categories: ProductCategory[]) => void
): Unsubscribe =>
  buildUnitScopedSubscriber(unitIds, 'inventoryCategories', (docSnap, unitId) => ({
    id: docSnap.id,
    unitId,
    ...(docSnap.data() as Omit<ProductCategory, 'id' | 'unitId'>),
  }), onChange);

export const subscribeToProducts = (
  unitIds: string[],
  onChange: (products: Product[]) => void
): Unsubscribe =>
  buildUnitScopedSubscriber(unitIds, 'inventoryProducts', (docSnap, unitId) => ({
    id: docSnap.id,
    unitId,
    ...(docSnap.data() as Omit<Product, 'id' | 'unitId'>),
  }), onChange);

export const subscribeToIdealStocks = (
  unitIds: string[],
  onChange: (stocks: IdealStock[]) => void
): Unsubscribe =>
  buildUnitScopedSubscriber(unitIds, 'inventoryIdealStocks', (docSnap, unitId) => ({
    id: docSnap.id,
    unitId,
    ...(docSnap.data() as Omit<IdealStock, 'id' | 'unitId'>),
  }), onChange);

export const subscribeToCurrentStocks = (
  unitIds: string[],
  onChange: (stocks: CurrentStock[]) => void
): Unsubscribe =>
  buildUnitScopedSubscriber(unitIds, 'inventoryCurrentStocks', (docSnap, unitId) => ({
    id: docSnap.id,
    unitId,
    ...(docSnap.data() as Omit<CurrentStock, 'id' | 'unitId'>),
  }), onChange);

export const subscribeToSuppliers = (
  unitIds: string[],
  onChange: (suppliers: Supplier[]) => void
): Unsubscribe =>
  buildUnitScopedSubscriber(unitIds, 'inventorySuppliers', (docSnap, unitId) => ({
    id: docSnap.id,
    unitId,
    ...(docSnap.data() as Omit<Supplier, 'id' | 'unitId'>),
  }), onChange);

export const createCategory = async (
  unitId: string,
  payload: Omit<ProductCategory, 'id' | 'unitId'>
): Promise<void> => {
  await addDoc(collection(db, 'units', unitId, 'inventoryCategories'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateCategory = async (
  unitId: string,
  categoryId: string,
  payload: Partial<ProductCategory>
): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'inventoryCategories', categoryId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteCategory = async (unitId: string, categoryId: string): Promise<void> => {
  await deleteDoc(doc(db, 'units', unitId, 'inventoryCategories', categoryId));
};

export const createProduct = async (
  unitId: string,
  payload: Omit<Product, 'id' | 'unitId'>
): Promise<void> => {
  await addDoc(collection(db, 'units', unitId, 'inventoryProducts'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateProduct = async (
  unitId: string,
  productId: string,
  payload: Partial<Product>
): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'inventoryProducts', productId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteProduct = async (unitId: string, productId: string): Promise<void> => {
  await deleteDoc(doc(db, 'units', unitId, 'inventoryProducts', productId));
};

export const upsertIdealStock = async (
  unitId: string,
  productId: string,
  idealQuantity: number
): Promise<void> => {
  await setDoc(
    doc(db, 'units', unitId, 'inventoryIdealStocks', productId),
    {
      productId,
      idealQuantity,
      updatedAt: serverTimestamp(),
      unitId,
    },
    { merge: true }
  );
};

export const upsertCurrentStock = async (
  unitId: string,
  productId: string,
  currentQuantity: number
): Promise<void> => {
  await setDoc(
    doc(db, 'units', unitId, 'inventoryCurrentStocks', productId),
    {
      productId,
      currentQuantity,
      updatedAt: serverTimestamp(),
      unitId,
    },
    { merge: true }
  );
};

export const deleteIdealStock = async (unitId: string, productId: string): Promise<void> => {
  await deleteDoc(doc(db, 'units', unitId, 'inventoryIdealStocks', productId));
};

export const deleteCurrentStock = async (unitId: string, productId: string): Promise<void> => {
  await deleteDoc(doc(db, 'units', unitId, 'inventoryCurrentStocks', productId));
};

export const createSupplier = async (
  unitId: string,
  payload: Omit<Supplier, 'id' | 'unitId'>
): Promise<void> => {
  await addDoc(collection(db, 'units', unitId, 'inventorySuppliers'), {
    ...payload,
    sharedUnitIds: payload.sharedUnitIds || [unitId],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateSupplier = async (
  unitId: string,
  supplierId: string,
  payload: Partial<Supplier>
): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'inventorySuppliers', supplierId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

export const deleteSupplier = async (unitId: string, supplierId: string): Promise<void> => {
  await deleteDoc(doc(db, 'units', unitId, 'inventorySuppliers', supplierId));
};

export const fetchProductsOnce = async (unitId: string) => {
  const productsRef = query(collection(db, 'units', unitId, 'inventoryProducts'));
  return productsRef;
};
