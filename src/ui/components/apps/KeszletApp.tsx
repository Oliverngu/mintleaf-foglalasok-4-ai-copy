import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import InventoryService from '../../../core/api/inventoryService';
import {
  Contact,
  InventoryCategory,
  InventorySupplier,
  InventoryProduct,
  InventoryIdealStock,
  InventoryCurrentStock,
  Unit,
} from '../../../core/models/data';
import { db } from '../../../core/firebase/config';

interface KeszletAppProps {
  selectedUnitIds: string[];
  allUnits: Unit[];
  userUnitIds?: string[];
  currentUserId?: string;
  currentUserName?: string;
  isUnitAdmin?: boolean;
}

interface ProductRow {
  unitId: string;
  product: InventoryProduct;
  idealQuantity: number;
  currentQuantity: number;
  categoryName?: string;
  supplierName?: string;
}

type TabKey = 'products' | 'suppliers' | 'categories';

export const KeszletApp: React.FC<KeszletAppProps> = ({
  selectedUnitIds,
  allUnits,
  userUnitIds = [],
  currentUserId,
  currentUserName,
  isUnitAdmin = true,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('products');

  const [categoriesByUnit, setCategoriesByUnit] = useState<Record<string, InventoryCategory[]>>({});
  const [suppliersByUnit, setSuppliersByUnit] = useState<Record<string, InventorySupplier[]>>({});
  const [productsByUnit, setProductsByUnit] = useState<Record<string, InventoryProduct[]>>({});
  const [idealStocksByUnit, setIdealStocksByUnit] = useState<Record<string, InventoryIdealStock[]>>({});
  const [currentStocksByUnit, setCurrentStocksByUnit] = useState<Record<string, InventoryCurrentStock[]>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [activeCategoryFilters, setActiveCategoryFilters] = useState<Set<string>>(new Set());

  const [currentInputs, setCurrentInputs] = useState<Record<string, string>>({});
  const [idealInputs, setIdealInputs] = useState<Record<string, string>>({});
  const [savingCurrent, setSavingCurrent] = useState<Record<string, boolean>>({});

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContactId, setNewSupplierContactId] = useState('');
  const [categoryEdits, setCategoryEdits] = useState<Record<string, string>>({});
  const [supplierEdits, setSupplierEdits] = useState<Record<string, string>>({});
  const [supplierContactEdits, setSupplierContactEdits] = useState<Record<string, string>>({});

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductSupplierIds, setNewProductSupplierIds] = useState<string[]>([]);
  const [newProductUnit, setNewProductUnit] = useState('');
  const [newProductIdeal, setNewProductIdeal] = useState('');
  const [newProductCurrent, setNewProductCurrent] = useState('');
  const [newProductUnits, setNewProductUnits] = useState<string[]>(selectedUnitIds);

  const [productEditorProduct, setProductEditorProduct] = useState<InventoryProduct | null>(null);
  const [productEditorForm, setProductEditorForm] = useState({
    name: '',
    unitOfMeasure: '',
    categoryId: '',
    supplierIds: [] as string[],
    unitIds: [] as string[],
  });
  const [productEditorOriginal, setProductEditorOriginal] = useState<typeof productEditorForm | null>(null);
  const [idealEditorProduct, setIdealEditorProduct] = useState<InventoryProduct | null>(null);
  const [idealEditorValues, setIdealEditorValues] = useState<Record<string, string>>({});
  const [idealEditorOriginal, setIdealEditorOriginal] = useState<Record<string, string>>({});

  useEffect(() => {
    setNewProductUnits(selectedUnitIds);
  }, [selectedUnitIds]);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'contacts'));
        setContacts(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<Contact, 'id'>) })));
      } catch (err) {
        console.error('Failed to load contacts', err);
      }
    };

    loadContacts();
  }, []);

  useEffect(() => {
    if (selectedUnitIds.length === 0) return;

    const unsubs: (() => void)[] = [];

    selectedUnitIds.forEach(unitId => {
      unsubs.push(
        InventoryService.listenCategories(unitId, items =>
          setCategoriesByUnit(prev => ({ ...prev, [unitId]: items }))
        )
      );
      unsubs.push(
        InventoryService.listenSuppliers(unitId, items =>
          setSuppliersByUnit(prev => ({ ...prev, [unitId]: items }))
        )
      );
      unsubs.push(
        InventoryService.listenProducts(unitId, items =>
          setProductsByUnit(prev => ({ ...prev, [unitId]: items }))
        )
      );
      unsubs.push(
        InventoryService.listenIdealStocks(unitId, items =>
          setIdealStocksByUnit(prev => ({ ...prev, [unitId]: items }))
        )
      );
      unsubs.push(
        InventoryService.listenCurrentStocks(unitId, items =>
          setCurrentStocksByUnit(prev => ({ ...prev, [unitId]: items }))
        )
      );
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [selectedUnitIds]);

  useEffect(() => {
    const currentMap: Record<string, string> = {};
    selectedUnitIds.forEach(unitId => {
      (currentStocksByUnit[unitId] || []).forEach(stock => {
        currentMap[`${unitId}:${stock.productId}`] = stock.currentQuantity?.toString() ?? '';
      });
    });
    setCurrentInputs(currentMap);
  }, [selectedUnitIds, currentStocksByUnit]);

  useEffect(() => {
    const idealMap: Record<string, string> = {};
    selectedUnitIds.forEach(unitId => {
      (idealStocksByUnit[unitId] || []).forEach(stock => {
        idealMap[`${unitId}:${stock.productId}`] = stock.idealQuantity?.toString() ?? '';
      });
    });
    setIdealInputs(idealMap);
  }, [selectedUnitIds, idealStocksByUnit]);

  const allCategories = useMemo(
    () =>
      selectedUnitIds.flatMap(unitId =>
        (categoriesByUnit[unitId] || []).map(category => ({ ...category, unitId }))
      ),
    [categoriesByUnit, selectedUnitIds]
  );

  const allSuppliers = useMemo(
    () =>
      selectedUnitIds.flatMap(unitId =>
        (suppliersByUnit[unitId] || []).map(supplier => ({ ...supplier, unitId }))
      ),
    [selectedUnitIds, suppliersByUnit]
  );

  const allProducts = useMemo(
    () =>
      selectedUnitIds.flatMap(unitId =>
        (productsByUnit[unitId] || []).map(product => ({ ...product, unitId }))
      ),
    [productsByUnit, selectedUnitIds]
  );

  const getSupplierIds = (product: InventoryProduct) => {
    if (product.supplierIds && product.supplierIds.length > 0) return product.supplierIds;
    if (product.supplierId) return [product.supplierId];
    return [];
  };

  const idealMap = useMemo(() => {
    const map: Record<string, number> = {};
    selectedUnitIds.forEach(unitId => {
      (idealStocksByUnit[unitId] || []).forEach(stock => {
        map[`${unitId}:${stock.productId}`] = stock.idealQuantity;
      });
    });
    return map;
  }, [idealStocksByUnit, selectedUnitIds]);

  const currentMap = useMemo(() => {
    const map: Record<string, number> = {};
    selectedUnitIds.forEach(unitId => {
      (currentStocksByUnit[unitId] || []).forEach(stock => {
        map[`${unitId}:${stock.productId}`] = stock.currentQuantity;
      });
    });
    return map;
  }, [currentStocksByUnit, selectedUnitIds]);

  const categoryNameMap = useMemo(
    () => Object.fromEntries(allCategories.map(c => [c.id, c.name])),
    [allCategories]
  );
  const supplierNameMap = useMemo(
    () => Object.fromEntries(allSuppliers.map(s => [s.id, s.name])),
    [allSuppliers]
  );

  const productNameUnits = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    allProducts.forEach(p => {
      const key = p.name.trim().toLowerCase();
      if (!map[key]) map[key] = new Set();
      map[key].add(p.unitId);
    });
    return map;
  }, [allProducts]);

  const filteredProducts: ProductRow[] = useMemo(() => {
    const applyCategoryFilter = (product: InventoryProduct) => {
      if (activeCategoryFilters.size === 0) return true;
      return product.categoryId ? activeCategoryFilters.has(product.categoryId) : activeCategoryFilters.has('none');
    };

    return allProducts
      .filter(p => applyCategoryFilter(p))
      .filter(p => {
        if (!filterSupplier) return true;
        const supplierIds = getSupplierIds(p);
        return supplierIds.includes(filterSupplier);
      })
      .map(product => {
        const supplierIds = getSupplierIds(product);
        return {
          unitId: product.unitId,
          product,
          idealQuantity: idealMap[`${product.unitId}:${product.id}`] ?? 0,
          currentQuantity: currentMap[`${product.unitId}:${product.id}`] ?? 0,
          categoryName: product.categoryId ? categoryNameMap[product.categoryId] : undefined,
          supplierName: supplierIds.length ? supplierIds.map(id => supplierNameMap[id]).filter(Boolean).join(', ') : undefined,
        };
      });
  }, [activeCategoryFilters, allProducts, categoryNameMap, currentMap, filterSupplier, idealMap, supplierNameMap]);

  const groupedProducts = useMemo(() => {
    const groups: Record<string, { label: string; items: ProductRow[] }> = {};
    filteredProducts.forEach(row => {
      const key = row.product.categoryId || 'none';
      if (!groups[key]) {
        groups[key] = { label: row.categoryName || 'Kategória nélkül', items: [] };
      }
      groups[key].items.push(row);
    });
    return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredProducts]);

  const showUnitBadges = selectedUnitIds.length > 1 && userUnitIds.length !== 1;

  const toggleCategoryFilter = (categoryId: string) => {
    setActiveCategoryFilters(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleSaveCurrent = async (unitId: string, productId: string) => {
    const value = parseFloat(currentInputs[`${unitId}:${productId}`] ?? '0');
    if (isNaN(value)) return;
    setSavingCurrent(prev => ({ ...prev, [`${unitId}:${productId}`]: true }));
    try {
      await InventoryService.setCurrentStock(unitId, productId, value, currentUserId);
    } finally {
      setSavingCurrent(prev => ({ ...prev, [`${unitId}:${productId}`]: false }));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUnitId = selectedUnitIds[0];
    if (!targetUnitId || !newCategoryName.trim()) return;
    await InventoryService.addCategory(targetUnitId, { name: newCategoryName.trim() });
    setNewCategoryName('');
  };

  const handleUpdateCategory = async (unitId: string, categoryId: string) => {
    const name = categoryEdits[`${unitId}:${categoryId}`];
    if (!name?.trim()) return;
    await InventoryService.updateCategory(unitId, categoryId, { name: name.trim() });
  };

  const handleDeleteCategory = async (unitId: string, categoryId: string) => {
    await InventoryService.deleteCategory(unitId, categoryId);
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUnitId = selectedUnitIds[0];
    if (!targetUnitId || !newSupplierName.trim()) return;
    await InventoryService.addSupplier(targetUnitId, {
      name: newSupplierName.trim(),
      contactId: newSupplierContactId || undefined,
    });
    setNewSupplierName('');
    setNewSupplierContactId('');
  };

  const handleUpdateSupplier = async (unitId: string, supplierId: string) => {
    const name = supplierEdits[`${unitId}:${supplierId}`];
    const contactId = supplierContactEdits[`${unitId}:${supplierId}`];
    const payload: Partial<InventorySupplier> = {};
    if (name?.trim()) payload.name = name.trim();
    if (contactId !== undefined) payload.contactId = contactId || undefined;
    if (!Object.keys(payload).length) return;
    await InventoryService.updateSupplier(unitId, supplierId, payload);
  };

  const handleDeleteSupplier = async (unitId: string, supplierId: string) => {
    await InventoryService.deleteSupplier(unitId, supplierId);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitsToUse = newProductUnits.length ? newProductUnits : selectedUnitIds;
    if (unitsToUse.length === 0) return;
    if (!newProductName.trim() || !newProductUnit.trim()) return;
    const idealValue = parseFloat(newProductIdeal || '0');
    const currentValue = newProductCurrent ? parseFloat(newProductCurrent) : undefined;

    await Promise.all(
      unitsToUse.map(async unitId => {
        const productRef = await InventoryService.addProduct(unitId, {
          name: newProductName.trim(),
          categoryId: newProductCategory || undefined,
          supplierIds: newProductSupplierIds.length ? newProductSupplierIds : undefined,
          unitOfMeasure: newProductUnit.trim(),
        });
        await InventoryService.setIdealStock(unitId, productRef.id, isNaN(idealValue) ? 0 : idealValue);
        if (!isNaN(currentValue ?? NaN)) {
          await InventoryService.setCurrentStock(unitId, productRef.id, currentValue as number);
        }
      })
    );

    setNewProductName('');
    setNewProductCategory('');
    setNewProductSupplierIds([]);
    setNewProductUnit('');
    setNewProductIdeal('');
    setNewProductCurrent('');
    setIsProductModalOpen(false);
  };

  const normalizedKey = (name: string) => name.trim().toLowerCase();

  const openProductEditor = (product: InventoryProduct) => {
    const linked = allProducts.filter(p => normalizedKey(p.name) === normalizedKey(product.name));
    const supplierIds = getSupplierIds(product);
    const unitIds = Array.from(new Set(linked.map(p => p.unitId)));
    setProductEditorProduct(product);
    const formState = {
      name: product.name,
      unitOfMeasure: product.unitOfMeasure,
      categoryId: product.categoryId || '',
      supplierIds,
      unitIds: unitIds.length ? unitIds : [product.unitId],
    };
    setProductEditorForm(formState);
    setProductEditorOriginal(formState);
  };

  const closeProductEditor = () => {
    if (productEditorOriginal && JSON.stringify(productEditorOriginal) !== JSON.stringify(productEditorForm)) {
      const confirmClose = window.confirm(
        'Változtatásokat nem mentetted. Biztosan bezárod a szerkesztőt?'
      );
      if (!confirmClose) return;
    }
    setProductEditorProduct(null);
  };

  const handleProductEditorSave = async () => {
    if (!productEditorProduct) return;
    const linked = allProducts.filter(p => normalizedKey(p.name) === normalizedKey(productEditorProduct.name));
    const targetUnits = productEditorForm.unitIds.length ? productEditorForm.unitIds : [productEditorProduct.unitId];

    await Promise.all(
      targetUnits.map(async unitId => {
        const existing = linked.find(p => p.unitId === unitId);
        const payload = {
          name: productEditorForm.name.trim(),
          unitOfMeasure: productEditorForm.unitOfMeasure.trim(),
          categoryId: productEditorForm.categoryId || undefined,
          supplierIds: productEditorForm.supplierIds,
        };
        if (existing) {
          await InventoryService.updateProduct(unitId, existing.id, payload);
        } else {
          await InventoryService.addProduct(unitId, payload);
        }
      })
    );

    const existingUnits = linked.map(p => p.unitId);
    const removedUnits = existingUnits.filter(unitId => !targetUnits.includes(unitId));
    if (removedUnits.length > 0) {
      const confirmRemoval = window.confirm(
        'Eltávolítod a terméket a kijelölt egységekből? A hozzá tartozó ideális és aktuális készlet is törlődik.'
      );
      if (confirmRemoval) {
        await Promise.all(
          removedUnits.map(async unitId => {
            const existing = linked.find(p => p.unitId === unitId);
            if (!existing) return;
            await InventoryService.deleteProduct(unitId, existing.id);
            await InventoryService.deleteIdealStock(unitId, existing.id);
            await InventoryService.deleteCurrentStock(unitId, existing.id);
          })
        );
      }
    }

    setProductEditorProduct(null);
  };

  const handleDeleteProduct = async () => {
    if (!productEditorProduct) return;
    const confirmDelete = window.confirm('Biztosan törlöd ezt a terméket és készletadatait?');
    if (!confirmDelete) return;
    const unitId = productEditorProduct.unitId;
    const productId = productEditorProduct.id;
    await InventoryService.deleteProduct(unitId, productId);
    await InventoryService.deleteIdealStock(unitId, productId);
    await InventoryService.deleteCurrentStock(unitId, productId);
    setProductEditorProduct(null);
  };

  const openIdealEditor = (product: InventoryProduct) => {
    const linked = allProducts.filter(p => normalizedKey(p.name) === normalizedKey(product.name));
    const unitIds = linked.map(p => p.unitId);
    const values: Record<string, string> = {};
    unitIds.forEach(unitId => {
      const key = `${unitId}:${product.id}`;
      const stockKeyed = idealMap[`${unitId}:${product.id}`];
      const fallback = linked.find(p => p.unitId === unitId)?.id;
      const mapKey = fallback ? `${unitId}:${fallback}` : key;
      const quantity = idealInputs[mapKey] ?? idealMap[mapKey] ?? 0;
      values[unitId] = quantity.toString();
    });
    setIdealEditorProduct(product);
    setIdealEditorValues(values);
    setIdealEditorOriginal(values);
  };

  const closeIdealEditor = () => {
    if (JSON.stringify(idealEditorOriginal) !== JSON.stringify(idealEditorValues)) {
      const confirmClose = window.confirm(
        'Változtatásokat nem mentetted. Biztosan bezárod a szerkesztőt?'
      );
      if (!confirmClose) return;
    }
    setIdealEditorProduct(null);
  };

  const handleSaveIdealEditor = async () => {
    if (!idealEditorProduct) return;
    const linked = allProducts.filter(p => normalizedKey(p.name) === normalizedKey(idealEditorProduct.name));
    await Promise.all(
      Object.entries(idealEditorValues).map(async ([unitId, value]) => {
        const numeric = parseFloat(value);
        if (isNaN(numeric)) return;
        const productForUnit = linked.find(p => p.unitId === unitId) || idealEditorProduct;
        await InventoryService.setIdealStock(unitId, productForUnit.id, numeric);
      })
    );
    setIdealEditorProduct(null);
  };

  if (selectedUnitIds.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded">
          <p>Kérjük, válassz ki legalább egy egységet a felső sávban a készlet kezeléséhez.</p>
        </div>
      </div>
    );
  }

  const renderUnitBadge = (unitId: string) => {
    const unit = allUnits.find(u => u.id === unitId);
    if (!unit) return null;
    return (
      <div
        key={unitId}
        className="w-7 h-7 rounded-full bg-gray-100 border flex items-center justify-center text-[10px] font-semibold text-gray-700 overflow-hidden"
        title={unit.name}
      >
        {unit.logoUrl ? (
          <img src={unit.logoUrl} alt={unit.name} className="w-full h-full object-cover" />
        ) : (
          <span>{unit.name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
    );
  };

  const renderTabButton = (key: TabKey, label: string) => (
    <button
      key={key}
      onClick={() => setActiveTab(key)}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition border ${
        activeTab === key
          ? 'bg-green-700 text-white border-green-700'
          : 'bg-white text-gray-700 border-gray-200 hover:border-green-500'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Készlet</h1>
          <p className="text-gray-600">Termékek, ideális és aktuális készlet egységenként.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {renderTabButton('products', 'Termékek')}
          {renderTabButton('suppliers', 'Beszállítók')}
          {renderTabButton('categories', 'Kategóriák')}
        </div>
      </div>

      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <select
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
                className="border rounded-lg px-3 py-2 bg-white shadow-sm min-w-[200px]"
              >
                <option value="">Összes beszállító</option>
                {allSuppliers.map(supplier => (
                  <option key={`${supplier.unitId}:${supplier.id}`} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setIsProductModalOpen(true)}
              className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-green-800"
            >
              <span className="text-lg">+</span>
              <span>Új termék</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {allCategories.map(category => {
              const isActive = activeCategoryFilters.has(category.id);
              return (
                <button
                  key={`${category.unitId}:${category.id}`}
                  onClick={() => toggleCategoryFilter(category.id)}
                  className={`px-3 py-1 rounded-full border text-sm transition ${
                    isActive ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {category.name}
                </button>
              );
            })}
            <button
              onClick={() => setActiveCategoryFilters(new Set())}
              className={`px-3 py-1 rounded-full border text-sm transition ${
                activeCategoryFilters.size === 0
                  ? 'bg-green-50 text-green-800 border-green-200'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              Összes
            </button>
          </div>

          <div className="space-y-4">
            {groupedProducts.length === 0 && (
              <div className="bg-white border rounded-xl p-6 text-center text-gray-500 shadow-sm">
                Nincs megjeleníthető termék.
              </div>
            )}

            {groupedProducts.map(group => (
              <div key={group.label} className="bg-white border rounded-xl shadow-sm">
                <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-gray-800 text-lg flex items-center gap-2">
                  <span>//</span> <span>{group.label}</span>
                </div>
                <div className="divide-y">
                  {group.items.map(({ product, idealQuantity, currentQuantity, unitId }) => {
                    const shortage = idealQuantity - currentQuantity;
                    const badgeUnits = Array.from(productNameUnits[product.name.trim().toLowerCase()] || []);
                    const supplierIds = getSupplierIds(product);
                    const supplierBadges = supplierIds
                      .map(id => supplierNameMap[id])
                      .filter(Boolean)
                      .slice(0, 3);
                    const supplierOverflow = Math.max(0, supplierIds.length - supplierBadges.length);
                    const idealValue = idealMap[`${unitId}:${product.id}`] ?? idealQuantity;
                    const currentKey = `${unitId}:${product.id}`;
                    const currentInputValue = currentInputs[currentKey] ?? currentQuantity.toString();
                    const currentSavedValue = currentMap[currentKey] ?? 0;
                    const isCurrentDirty = parseFloat(currentInputValue) !== currentSavedValue;
                    const currentMeta = (currentStocksByUnit[unitId] || []).find(s => s.productId === product.id);
                    const updatedLabel = currentMeta?.updatedAt
                      ? new Date(currentMeta.updatedAt.toDate()).toLocaleString()
                      : 'N/A';
                    const updaterName = currentMeta?.updatedByUserId
                      ? currentMeta.updatedByUserId === currentUserId
                        ? currentUserName || currentMeta.updatedByUserId
                        : currentMeta.updatedByUserId
                      : 'Ismeretlen';
                    return (
                      <div key={`${unitId}:${product.id}`} className="px-4 py-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => openProductEditor(product)}
                              className="font-semibold text-gray-900 hover:text-green-700"
                            >
                              {product.name}
                            </button>
                            {supplierBadges.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-gray-600 flex-wrap">
                                {supplierBadges.map(name => (
                                  <span key={name} className="px-2 py-1 bg-gray-100 rounded-full border text-[11px]">
                                    {name}
                                  </span>
                                ))}
                                {supplierOverflow > 0 && (
                                  <span className="px-2 py-1 bg-gray-100 rounded-full border text-[11px]">+{supplierOverflow}</span>
                                )}
                              </div>
                            )}
                            {showUnitBadges && badgeUnits.length > 0 && (
                              <div className="flex items-center gap-1">{badgeUnits.map(renderUnitBadge)}</div>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">{product.unitOfMeasure}</div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500">Ideális készlet</span>
                            <button
                              onClick={() => openIdealEditor(product)}
                              className="text-left w-full px-3 py-2 border rounded-lg bg-gray-50 hover:bg-gray-100"
                            >
                              {idealValue}
                            </button>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500">Aktuális készlet</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={currentInputValue}
                                onChange={e =>
                                  setCurrentInputs(prev => ({ ...prev, [currentKey]: e.target.value }))
                                }
                                className="w-full border rounded-lg px-3 py-2"
                              />
                              {isCurrentDirty && (
                                <button
                                  onClick={() => handleSaveCurrent(unitId, product.id)}
                                  className="px-3 py-2 bg-green-700 text-white rounded-lg text-xs hover:bg-green-800"
                                  disabled={savingCurrent[currentKey]}
                                >
                                  {savingCurrent[currentKey] ? 'Mentés...' : 'Mentés'}
                                </button>
                              )}
                            </div>
                            <span className="text-[11px] text-gray-500">
                              Utoljára módosítva: {updatedLabel} – {updaterName}
                            </span>
                          </div>

                          <div className="flex flex-col justify-center">
                            <span className="text-xs text-gray-500">Eltérés</span>
                            <div
                              className={`font-semibold ${
                                shortage > 0 ? 'text-red-600' : shortage < 0 ? 'text-green-700' : 'text-gray-700'
                              }`}
                            >
                              {shortage === 0 ? 'OK' : `${shortage > 0 ? 'Hiány' : 'Többlet'}: ${shortage}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Beszállítók</h2>
            <div className="divide-y">
              {allSuppliers.length === 0 && (
                <div className="py-4 text-gray-500 text-center">Nincs beszállító.</div>
              )}
              {allSuppliers.map(supplier => (
                <div key={`${supplier.unitId}:${supplier.id}`} className="py-3 flex flex-col gap-2">
                  <div className="text-xs text-gray-500">Egység: {allUnits.find(u => u.id === supplier.unitId)?.name || supplier.unitId}</div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        defaultValue={supplier.name}
                        onChange={e =>
                          setSupplierEdits(prev => ({ ...prev, [`${supplier.unitId}:${supplier.id}`]: e.target.value }))
                        }
                        className="flex-1 border rounded-lg px-3 py-2"
                      />
                      <select
                        value={
                          supplierContactEdits[`${supplier.unitId}:${supplier.id}`] ?? supplier.contactId ?? ''
                        }
                        onChange={e =>
                          setSupplierContactEdits(prev => ({
                            ...prev,
                            [`${supplier.unitId}:${supplier.id}`]: e.target.value,
                          }))
                        }
                        className="border rounded-lg px-3 py-2 min-w-[200px]"
                      >
                        <option value="">Nincs kapcsolattartó</option>
                        {contacts.map(contact => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateSupplier(supplier.unitId, supplier.id)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                      >
                        Mentés
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier.unitId, supplier.id)}
                        className="px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100"
                      >
                        Törlés
                      </button>
                    </div>
                  </div>
                  {supplier.contactId && (
                    <span className="text-xs text-gray-500">Kapcsolattartó: {contacts.find(c => c.id === supplier.contactId)?.name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Új beszállító</h2>
            <form onSubmit={handleAddSupplier} className="space-y-2">
              <input
                value={newSupplierName}
                onChange={e => setNewSupplierName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Beszállító neve"
              />
              <select
                value={newSupplierContactId}
                onChange={e => setNewSupplierContactId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">Nincs kapcsolattartó</option>
                {contacts.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">Az első kijelölt egységhez kerül mentésre.</p>
              <button
                type="submit"
                className="w-full bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800"
              >
                Hozzáadás
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Kategóriák</h2>
            <div className="divide-y">
              {allCategories.length === 0 && (
                <div className="py-4 text-gray-500 text-center">Nincs kategória.</div>
              )}
              {allCategories.map(category => (
                <div key={`${category.unitId}:${category.id}`} className="py-3 flex flex-col gap-2">
                  <div className="text-xs text-gray-500">Egység: {allUnits.find(u => u.id === category.unitId)?.name || category.unitId}</div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      defaultValue={category.name}
                      onChange={e =>
                        setCategoryEdits(prev => ({ ...prev, [`${category.unitId}:${category.id}`]: e.target.value }))
                      }
                      className="flex-1 border rounded-lg px-3 py-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateCategory(category.unitId, category.id)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                      >
                        Mentés
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.unitId, category.id)}
                        className="px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100"
                      >
                        Törlés
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Új kategória</h2>
            <form onSubmit={handleAddCategory} className="space-y-2">
              <input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Kategória neve"
              />
              <p className="text-xs text-gray-500">Az első kijelölt egységhez kerül mentésre.</p>
              <button
                type="submit"
                className="w-full bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800"
              >
                Hozzáadás
              </button>
            </form>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Új termék</h3>
                <p className="text-sm text-gray-500">Töltsd ki az alapadatokat, és rendeld hozzá a kívánt egységekhez.</p>
              </div>
              <button onClick={() => setIsProductModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Terméknév</label>
                  <input
                    value={newProductName}
                    onChange={e => setNewProductName(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Pl. Pepsi 0.33"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Mértékegység</label>
                  <input
                    value={newProductUnit}
                    onChange={e => setNewProductUnit(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="kg, db, L..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Kategória</label>
                  <select
                    value={newProductCategory}
                    onChange={e => setNewProductCategory(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Nincs</option>
                    {allCategories.map(category => (
                      <option key={`${category.unitId}:${category.id}`} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Beszállítók</label>
                  <select
                    multiple
                    value={newProductSupplierIds}
                    onChange={e =>
                      setNewProductSupplierIds(
                        Array.from(e.target.selectedOptions).map(option => option.value)
                      )
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {allSuppliers.map(supplier => (
                      <option key={`${supplier.unitId}:${supplier.id}`} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">Több beszállító is kiválasztható.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Ideális készlet</label>
                  <input
                    type="number"
                    value={newProductIdeal}
                    onChange={e => setNewProductIdeal(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="pl. 10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">Aktuális készlet (opcionális)</label>
                  <input
                    type="number"
                    value={newProductCurrent}
                    onChange={e => setNewProductCurrent(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="pl. 4"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-gray-600 font-semibold">Elérhető egységek</div>
                <div className="flex flex-wrap gap-3">
                  {selectedUnitIds.map(unitId => {
                    const unit = allUnits.find(u => u.id === unitId);
                    const checked = newProductUnits.includes(unitId);
                    return (
                      <label
                        key={unitId}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer ${
                          checked ? 'border-green-600 bg-green-50' : 'border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            setNewProductUnits(prev => {
                              if (e.target.checked) return Array.from(new Set([...prev, unitId]));
                              return prev.filter(id => id !== unitId);
                            });
                          }}
                        />
                        <span>{unit?.name || unitId}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700"
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-green-700 text-white font-semibold hover:bg-green-800"
                >
                  Mentés
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {productEditorProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Termék szerkesztése</h3>
                <p className="text-sm text-gray-500">
                  Módosítsd a termék adatait, beszállítóit és egység-hozzárendelését.
                </p>
              </div>
              <button onClick={closeProductEditor} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-gray-600">Terméknév</label>
                <input
                  value={productEditorForm.name}
                  onChange={e => setProductEditorForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-600">Mértékegység</label>
                <input
                  value={productEditorForm.unitOfMeasure}
                  onChange={e => setProductEditorForm(prev => ({ ...prev, unitOfMeasure: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-gray-600">Kategória</label>
                <select
                  value={productEditorForm.categoryId}
                  onChange={e => setProductEditorForm(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Nincs</option>
                  {allCategories.map(category => (
                    <option key={`${category.unitId}:${category.id}`} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-600">Beszállítók</label>
                <select
                  multiple
                  value={productEditorForm.supplierIds}
                  onChange={e =>
                    setProductEditorForm(prev => ({
                      ...prev,
                      supplierIds: Array.from(e.target.selectedOptions).map(option => option.value),
                    }))
                  }
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {allSuppliers.map(supplier => (
                    <option key={`${supplier.unitId}:${supplier.id}`} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">Választhatsz több beszállítót is.</p>
              </div>
            </div>

            {isUnitAdmin && (userUnitIds?.length || 0) > 1 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-700">Egységek hozzárendelése</div>
                <div className="flex flex-wrap gap-3">
                  {(userUnitIds?.length ? allUnits.filter(u => userUnitIds.includes(u.id)) : allUnits).map(unit => {
                    const checked = productEditorForm.unitIds.includes(unit.id);
                    return (
                      <label
                        key={unit.id}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer ${
                          checked ? 'border-green-600 bg-green-50' : 'border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e =>
                            setProductEditorForm(prev => ({
                              ...prev,
                              unitIds: e.target.checked
                                ? Array.from(new Set([...prev.unitIds, unit.id]))
                                : prev.unitIds.filter(id => id !== unit.id),
                            }))
                          }
                        />
                        <span>{unit.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={handleDeleteProduct}
                className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                Termék törlése
              </button>
              <div className="flex gap-2">
                <button
                  onClick={closeProductEditor}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700"
                >
                  Mégse
                </button>
                <button
                  onClick={handleProductEditorSave}
                  className="px-4 py-2 rounded-lg bg-green-700 text-white font-semibold hover:bg-green-800"
                >
                  Mentés
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {idealEditorProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Ideális készlet szerkesztése</h3>
                <p className="text-sm text-gray-500">Egységenként állíthatod be az ideális készletet.</p>
              </div>
              <button onClick={closeIdealEditor} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="space-y-3">
              {Array.from(
                new Set(
                  allProducts
                    .filter(p => normalizedKey(p.name) === normalizedKey(idealEditorProduct.name))
                    .map(p => p.unitId)
                )
              ).map(unitId => {
                const unit = allUnits.find(u => u.id === unitId);
                return (
                  <div key={unitId} className="flex flex-col md:flex-row md:items-center gap-2">
                    <div className="flex items-center gap-2 w-full md:w-1/2">
                      {renderUnitBadge(unitId)}
                      <div>
                        <div className="font-semibold text-gray-800">{unit?.name || unitId}</div>
                        <div className="text-xs text-gray-500">Ideális érték</div>
                      </div>
                    </div>
                    <input
                      type="number"
                      value={idealEditorValues[unitId] ?? ''}
                      onChange={e => setIdealEditorValues(prev => ({ ...prev, [unitId]: e.target.value }))}
                      className="border rounded-lg px-3 py-2 w-full md:w-1/2"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={closeIdealEditor}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700"
              >
                Mégse
              </button>
              <button
                onClick={handleSaveIdealEditor}
                className="px-4 py-2 rounded-lg bg-green-700 text-white font-semibold hover:bg-green-800"
              >
                Mentés
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeszletApp;
