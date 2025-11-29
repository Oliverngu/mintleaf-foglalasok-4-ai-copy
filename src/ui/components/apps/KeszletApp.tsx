import React, { useEffect, useMemo, useState } from 'react';
import InventoryService from '../../../core/api/inventoryService';
import {
  InventoryCategory,
  InventorySupplier,
  InventoryProduct,
  InventoryIdealStock,
  InventoryCurrentStock,
} from '../../../core/models/data';

interface KeszletAppProps {
  selectedUnitId: string;
}

interface ProductRow {
  product: InventoryProduct;
  idealQuantity: number;
  currentQuantity: number;
  categoryName?: string;
  supplierName?: string;
}

export const KeszletApp: React.FC<KeszletAppProps> = ({ selectedUnitId }) => {
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [idealStocks, setIdealStocks] = useState<InventoryIdealStock[]>([]);
  const [currentStocks, setCurrentStocks] = useState<InventoryCurrentStock[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [currentInputs, setCurrentInputs] = useState<Record<string, string>>({});
  const [idealInputs, setIdealInputs] = useState<Record<string, string>>({});
  const [savingCurrent, setSavingCurrent] = useState<Record<string, boolean>>({});
  const [savingIdeal, setSavingIdeal] = useState<Record<string, boolean>>({});

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductSupplier, setNewProductSupplier] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('');

  useEffect(() => {
    if (!selectedUnitId) return;

    const unsubCategories = InventoryService.listenCategories(selectedUnitId, setCategories);
    const unsubSuppliers = InventoryService.listenSuppliers(selectedUnitId, setSuppliers);
    const unsubProducts = InventoryService.listenProducts(selectedUnitId, setProducts);
    const unsubIdeal = InventoryService.listenIdealStocks(selectedUnitId, setIdealStocks);
    const unsubCurrent = InventoryService.listenCurrentStocks(selectedUnitId, setCurrentStocks);

    return () => {
      unsubCategories();
      unsubSuppliers();
      unsubProducts();
      unsubIdeal();
      unsubCurrent();
    };
  }, [selectedUnitId]);

  useEffect(() => {
    const currentMap: Record<string, string> = {};
    currentStocks.forEach(stock => {
      currentMap[stock.productId] = stock.currentQuantity?.toString() ?? '';
    });
    setCurrentInputs(currentMap);
  }, [currentStocks]);

  useEffect(() => {
    const idealMap: Record<string, string> = {};
    idealStocks.forEach(stock => {
      idealMap[stock.productId] = stock.idealQuantity?.toString() ?? '';
    });
    setIdealInputs(idealMap);
  }, [idealStocks]);

  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories]);
  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map(s => [s.id, s.name])), [suppliers]);
  const idealMap = useMemo(
    () => Object.fromEntries(idealStocks.map(stock => [stock.productId, stock.idealQuantity])),
    [idealStocks]
  );
  const currentMap = useMemo(
    () => Object.fromEntries(currentStocks.map(stock => [stock.productId, stock.currentQuantity])),
    [currentStocks]
  );

  const filteredProducts: ProductRow[] = useMemo(() => {
    return products
      .filter(p => !filterCategory || p.categoryId === filterCategory)
      .filter(p => !filterSupplier || p.supplierId === filterSupplier)
      .map(product => ({
        product,
        idealQuantity: idealMap[product.id] ?? 0,
        currentQuantity: currentMap[product.id] ?? 0,
        categoryName: product.categoryId ? categoryMap[product.categoryId] : undefined,
        supplierName: product.supplierId ? supplierMap[product.supplierId] : undefined,
      }));
  }, [products, filterCategory, filterSupplier, idealMap, currentMap, categoryMap, supplierMap]);

  const handleSaveCurrent = async (productId: string) => {
    if (!selectedUnitId) return;
    const value = parseFloat(currentInputs[productId] ?? '0');
    if (isNaN(value)) return;
    setSavingCurrent(prev => ({ ...prev, [productId]: true }));
    try {
      await InventoryService.setCurrentStock(selectedUnitId, productId, value);
    } finally {
      setSavingCurrent(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleSaveIdeal = async (productId: string) => {
    if (!selectedUnitId) return;
    const value = parseFloat(idealInputs[productId] ?? '0');
    if (isNaN(value)) return;
    setSavingIdeal(prev => ({ ...prev, [productId]: true }));
    try {
      await InventoryService.setIdealStock(selectedUnitId, productId, value);
    } finally {
      setSavingIdeal(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId || !newCategoryName.trim()) return;
    await InventoryService.addCategory(selectedUnitId, { name: newCategoryName.trim() });
    setNewCategoryName('');
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId || !newSupplierName.trim()) return;
    await InventoryService.addSupplier(selectedUnitId, { name: newSupplierName.trim() });
    setNewSupplierName('');
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId || !newProductName.trim() || !newProductUnit.trim()) return;
    await InventoryService.addProduct(selectedUnitId, {
      name: newProductName.trim(),
      categoryId: newProductCategory || undefined,
      supplierId: newProductSupplier || undefined,
      unitOfMeasure: newProductUnit.trim(),
    });
    setNewProductName('');
    setNewProductCategory('');
    setNewProductSupplier('');
    setNewProductUnit('');
  };

  if (!selectedUnitId) {
    return (
      <div className="p-6">
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded">
          <p>Kérjük, válassz ki egy egységet a felső sávban a készlet kezeléséhez.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Készlet</h1>
          <p className="text-gray-600">Termékek, ideális és aktuális készlet egységenként.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="border rounded-lg px-3 py-2 bg-white shadow-sm"
          >
            <option value="">Összes kategória</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="border rounded-lg px-3 py-2 bg-white shadow-sm"
          >
            <option value="">Összes beszállító</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Új kategória</h2>
          <form onSubmit={handleAddCategory} className="space-y-2">
            <input
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Kategória neve"
            />
            <button
              type="submit"
              className="w-full bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800"
            >
              Hozzáadás
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Új beszállító</h2>
          <form onSubmit={handleAddSupplier} className="space-y-2">
            <input
              value={newSupplierName}
              onChange={e => setNewSupplierName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Beszállító neve"
            />
            <button
              type="submit"
              className="w-full bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800"
            >
              Hozzáadás
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Új termék</h2>
          <form onSubmit={handleAddProduct} className="space-y-2">
            <input
              value={newProductName}
              onChange={e => setNewProductName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Termék neve"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newProductCategory}
                onChange={e => setNewProductCategory(e.target.value)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="">Kategória</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                value={newProductSupplier}
                onChange={e => setNewProductSupplier(e.target.value)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="">Beszállító</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={newProductUnit}
              onChange={e => setNewProductUnit(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Mértékegység (pl. kg, db)"
            />
            <button
              type="submit"
              className="w-full bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800"
            >
              Hozzáadás
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="grid grid-cols-7 gap-3 px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">
          <div>Termék</div>
          <div>Kategória</div>
          <div>Beszállító</div>
          <div className="text-center">Egység</div>
          <div className="text-center">Ideális készlet</div>
          <div className="text-center">Aktuális készlet</div>
          <div className="text-center">Hiány / többlet</div>
        </div>
        <div className="divide-y">
          {filteredProducts.length === 0 && (
            <div className="p-4 text-gray-500 text-center">Nincs megjeleníthető termék.</div>
          )}
          {filteredProducts.map(({ product, idealQuantity, currentQuantity, categoryName, supplierName }) => {
            const shortage = idealQuantity - currentQuantity;
            return (
              <div key={product.id} className="grid grid-cols-7 gap-3 px-4 py-3 items-center text-sm">
                <div>
                  <div className="font-semibold text-gray-900">{product.name}</div>
                  <div className="text-xs text-gray-500">#{product.id}</div>
                </div>
                <div className="text-gray-700">{categoryName || '—'}</div>
                <div className="text-gray-700">{supplierName || '—'}</div>
                <div className="text-center text-gray-700">{product.unitOfMeasure}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={idealInputs[product.id] ?? idealQuantity}
                      onChange={e =>
                        setIdealInputs(prev => ({ ...prev, [product.id]: e.target.value }))
                      }
                      className="w-full border rounded-lg px-2 py-1"
                    />
                    <button
                      onClick={() => handleSaveIdeal(product.id)}
                      className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700"
                      disabled={savingIdeal[product.id]}
                    >
                      {savingIdeal[product.id] ? 'Mentés...' : 'Mentés'}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={currentInputs[product.id] ?? currentQuantity}
                      onChange={e =>
                        setCurrentInputs(prev => ({ ...prev, [product.id]: e.target.value }))
                      }
                      className="w-full border rounded-lg px-2 py-1"
                    />
                    <button
                      onClick={() => handleSaveCurrent(product.id)}
                      className="px-2 py-1 bg-green-700 text-white rounded-lg text-xs hover:bg-green-800"
                      disabled={savingCurrent[product.id]}
                    >
                      {savingCurrent[product.id] ? 'Mentés...' : 'Mentés'}
                    </button>
                  </div>
                </div>
                <div className={`text-center font-semibold ${shortage > 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {shortage === 0 ? 'OK' : `${shortage > 0 ? 'Hiány' : 'Többlet'}: ${shortage}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KeszletApp;
