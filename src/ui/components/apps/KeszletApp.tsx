import React, { useEffect, useMemo, useState } from 'react';
import { User, Unit } from '../../../core/models/data';
import {
  CurrentStock,
  IdealStock,
  Product,
  ProductCategory,
  Supplier,
  calculateRecommendedOrder,
} from '../../../core/models/inventory';
import {
  createCategory,
  createProduct,
  createSupplier,
  deleteCategory,
  deleteCurrentStock,
  deleteIdealStock,
  deleteProduct,
  deleteSupplier,
  subscribeToCategories,
  subscribeToCurrentStocks,
  subscribeToIdealStocks,
  subscribeToProducts,
  subscribeToSuppliers,
  updateCategory,
  updateProduct,
  updateSupplier,
  upsertCurrentStock,
  upsertIdealStock,
} from '../../../core/api/inventoryService';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import PlusIcon from '../../../../components/icons/PlusIcon';
import PencilIcon from '../../../../components/icons/PencilIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';
import BriefcaseIcon from '../../../../components/icons/BriefcaseIcon';

interface KeszletAppProps {
  currentUser: User;
  allUnits: Unit[];
  activeUnitIds: string[];
}

const UnitBadge: React.FC<{ unit: Unit | undefined }> = ({ unit }) => {
  if (!unit) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <div className="h-6 w-6 rounded-full overflow-hidden bg-gray-200 border border-gray-200">
        {unit.logoUrl ? (
          <img src={unit.logoUrl} alt={unit.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[10px] font-semibold text-gray-700">
            {unit.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <span>{unit.name}</span>
    </div>
  );
};

const TabButton: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-md font-semibold transition-colors ${
      isActive ? 'bg-green-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
    }`}
  >
    {label}
  </button>
);

const ProductManagement: React.FC<{
  categories: ProductCategory[];
  products: Product[];
  units: Unit[];
  activeUnitIds: string[];
}> = ({ categories, products, units, activeUnitIds }) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryUnit, setCategoryUnit] = useState<string>(activeUnitIds[0] || '');
  const [newProduct, setNewProduct] = useState({
    name: '',
    categoryId: '',
    unitOfMeasure: 'Darab',
    description: '',
    unitId: activeUnitIds[0] || '',
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    unitOfMeasure: 'Darab',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCategoryUnit(activeUnitIds[0] || '');
    setNewProduct(prev => ({ ...prev, unitId: activeUnitIds[0] || '' }));
  }, [activeUnitIds]);

  const filteredCategories = useMemo(
    () => categories.filter(cat => activeUnitIds.includes(cat.unitId)),
    [categories, activeUnitIds]
  );

  const groupedProducts = useMemo(() => {
    const map: Record<string, Product[]> = {};
    products.forEach(prod => {
      if (!activeUnitIds.includes(prod.unitId)) return;
      if (!map[prod.categoryId]) map[prod.categoryId] = [];
      map[prod.categoryId].push(prod);
    });
    return map;
  }, [products, activeUnitIds]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !categoryUnit) return;
    setLoading(true);
    setError(null);
    try {
      await createCategory(categoryUnit, { name: newCategoryName.trim() });
      setNewCategoryName('');
    } catch (err) {
      console.error(err);
      setError('Nem sikerült létrehozni a kategóriát.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCategory = async (category: ProductCategory) => {
    setLoading(true);
    setError(null);
    try {
      await updateCategory(category.unitId, category.id, { name: editingCategoryName.trim() });
      setEditingCategoryId(null);
      setEditingCategoryName('');
    } catch (err) {
      console.error(err);
      setError('Nem sikerült frissíteni a kategóriát.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.categoryId || !newProduct.unitId) return;
    setLoading(true);
    setError(null);
    try {
      await createProduct(newProduct.unitId, {
        name: newProduct.name.trim(),
        categoryId: newProduct.categoryId,
        unitOfMeasure: newProduct.unitOfMeasure,
        description: newProduct.description || undefined,
      });
      setNewProduct(prev => ({ ...prev, name: '', description: '' }));
    } catch (err) {
      console.error(err);
      setError('Nem sikerült létrehozni a terméket.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProduct = async (product: Product) => {
    setLoading(true);
    setError(null);
    try {
      await updateProduct(product.unitId, product.id, {
        name: productForm.name.trim(),
        unitOfMeasure: productForm.unitOfMeasure,
        description: productForm.description || undefined,
      });
      setEditingProductId(null);
    } catch (err) {
      console.error(err);
      setError('Nem sikerült frissíteni a terméket.');
    } finally {
      setLoading(false);
    }
  };

  const unitOptions = units.filter(u => activeUnitIds.includes(u.id));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <PlusIcon className="h-5 w-5" />
          Új kategória
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Kategória neve"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
          <select
            value={categoryUnit}
            onChange={e => setCategoryUnit(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="">Válassz egységet</option>
            {unitOptions.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAddCategory}
          className="px-4 py-2 bg-green-700 text-white rounded-md font-semibold hover:bg-green-800 disabled:opacity-50"
          disabled={loading}
        >
          Kategória hozzáadása
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <PlusIcon className="h-5 w-5" />
          Új termék
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={newProduct.categoryId}
            onChange={e => setNewProduct(prev => ({ ...prev, categoryId: e.target.value }))}
            className="border rounded-md px-3 py-2"
          >
            <option value="">Válassz kategóriát</option>
            {filteredCategories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({units.find(u => u.id === cat.unitId)?.name || 'Ismeretlen egység'})
              </option>
            ))}
          </select>
          <select
            value={newProduct.unitId}
            onChange={e => setNewProduct(prev => ({ ...prev, unitId: e.target.value }))}
            className="border rounded-md px-3 py-2"
          >
            <option value="">Válassz egységet</option>
            {unitOptions.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Termék neve"
            value={newProduct.name}
            onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
            className="border rounded-md px-3 py-2"
          />
          <input
            type="text"
            placeholder="Mértékegység (pl. Liter, Kg, Doboz)"
            value={newProduct.unitOfMeasure}
            onChange={e => setNewProduct(prev => ({ ...prev, unitOfMeasure: e.target.value }))}
            className="border rounded-md px-3 py-2"
          />
          <div className="md:col-span-2">
            <textarea
              placeholder="Megjegyzés"
              value={newProduct.description}
              onChange={e => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
        </div>
        <button
          onClick={handleAddProduct}
          className="px-4 py-2 bg-green-700 text-white rounded-md font-semibold hover:bg-green-800 disabled:opacity-50"
          disabled={loading}
        >
          Termék hozzáadása
        </button>
      </div>

      <div className="space-y-4">
        {filteredCategories.length === 0 && (
          <p className="text-gray-600">Nincs megjeleníthető kategória a kiválasztott egységekben.</p>
        )}
        {filteredCategories.map(category => (
          <div key={category.id} className="bg-white rounded-lg shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UnitBadge unit={units.find(u => u.id === category.unitId)} />
                {editingCategoryId === category.id ? (
                  <input
                    className="border rounded-md px-2 py-1"
                    value={editingCategoryName}
                    onChange={e => setEditingCategoryName(e.target.value)}
                  />
                ) : (
                  <h4 className="text-lg font-semibold text-gray-800">{category.name}</h4>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingCategoryId === category.id ? (
                  <>
                    <button
                      onClick={() => handleUpdateCategory(category)}
                      className="px-3 py-1 bg-green-700 text-white rounded-md"
                      disabled={loading}
                    >
                      Mentés
                    </button>
                    <button
                      onClick={() => {
                        setEditingCategoryId(null);
                        setEditingCategoryName('');
                      }}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md"
                    >
                      Mégse
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setEditingCategoryName(category.name);
                      }}
                      className="p-2 text-gray-600 hover:text-green-700"
                      title="Szerkesztés"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteCategory(category.unitId, category.id)}
                      className="p-2 text-gray-600 hover:text-red-600"
                      title="Törlés"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {(groupedProducts[category.id] || []).map(prod => (
                <div
                  key={prod.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between border rounded-md px-3 py-2 gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <UnitBadge unit={units.find(u => u.id === prod.unitId)} />
                      {editingProductId === prod.id ? (
                        <input
                          className="border rounded-md px-2 py-1"
                          value={productForm.name}
                          onChange={e => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                        />
                      ) : (
                        <p className="font-semibold text-gray-800">{prod.name}</p>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">Mértékegység: {editingProductId === prod.id ? (
                      <input
                        className="border rounded-md px-2 py-1 ml-2"
                        value={productForm.unitOfMeasure}
                        onChange={e => setProductForm(prev => ({ ...prev, unitOfMeasure: e.target.value }))}
                      />
                    ) : (
                      prod.unitOfMeasure
                    )}</p>
                    {editingProductId === prod.id ? (
                      <textarea
                        className="w-full border rounded-md px-2 py-1"
                        value={productForm.description}
                        onChange={e => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                      />
                    ) : (
                      prod.description && <p className="text-sm text-gray-500">{prod.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingProductId === prod.id ? (
                      <>
                        <button
                          onClick={() => handleUpdateProduct(prod)}
                          className="px-3 py-1 bg-green-700 text-white rounded-md"
                          disabled={loading}
                        >
                          Mentés
                        </button>
                        <button
                          onClick={() => setEditingProductId(null)}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md"
                        >
                          Mégse
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingProductId(prod.id);
                            setProductForm({
                              name: prod.name,
                              unitOfMeasure: prod.unitOfMeasure,
                              description: prod.description || '',
                            });
                          }}
                          className="p-2 text-gray-600 hover:text-green-700"
                          title="Szerkesztés"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteProduct(prod.unitId, prod.id)}
                          className="p-2 text-gray-600 hover:text-red-600"
                          title="Törlés"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {(groupedProducts[category.id] || []).length === 0 && (
                <p className="text-sm text-gray-500">Nincs termék ebben a kategóriában.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StockTable: React.FC<{
  products: Product[];
  idealStocks: IdealStock[];
  currentStocks: CurrentStock[];
  units: Unit[];
  type: 'ideal' | 'current';
}> = ({ products, idealStocks, currentStocks, units, type }) => {
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const idealMap = useMemo(() => {
    const map: Record<string, IdealStock> = {};
    idealStocks.forEach(stock => {
      map[`${stock.unitId}-${stock.productId}`] = stock;
    });
    return map;
  }, [idealStocks]);

  const currentMap = useMemo(() => {
    const map: Record<string, CurrentStock> = {};
    currentStocks.forEach(stock => {
      map[`${stock.unitId}-${stock.productId}`] = stock;
    });
    return map;
  }, [currentStocks]);

  const handleSave = async (product: Product) => {
    const key = `${product.unitId}-${product.id}`;
    const value = Number(editingValues[key]);
    setLoadingId(key);
    try {
      if (type === 'ideal') {
        await upsertIdealStock(product.unitId, product.id, value);
      } else {
        await upsertCurrentStock(product.unitId, product.id, value);
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (product: Product) => {
    if (type === 'ideal') {
      await deleteIdealStock(product.unitId, product.id);
    } else {
      await deleteCurrentStock(product.unitId, product.id);
    }
  };

  const rows = useMemo(() => products.sort((a, b) => a.name.localeCompare(b.name)), [products]);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Termék</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Egység</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                {type === 'ideal' ? 'Ideális készlet' : 'Aktuális készlet'}
              </th>
              {type === 'current' && (
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Figyelmeztetés</th>
              )}
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Műveletek</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.map(product => {
              const key = `${product.unitId}-${product.id}`;
              const ideal = idealMap[key]?.idealQuantity ?? 0;
              const current = currentMap[key]?.currentQuantity ?? 0;
              const warning = type === 'current' && current < ideal;
              const unit = units.find(u => u.id === product.unitId);
              return (
                <tr key={product.id} className={warning ? 'bg-red-50' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UnitBadge unit={unit} />
                      <div>
                        <p className="font-semibold text-gray-800">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{product.unitOfMeasure}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-24 border rounded-md px-2 py-1"
                        value={
                          editingValues[key] !== undefined
                            ? editingValues[key]
                            : type === 'ideal'
                            ? ideal
                            : current
                        }
                        onChange={e =>
                          setEditingValues(prev => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                      <span className="text-xs text-gray-500">{product.unitOfMeasure}</span>
                    </div>
                  </td>
                  {type === 'current' && (
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {warning ? (
                        <span className="inline-flex items-center gap-2 text-red-700 font-semibold">
                          Hiány ({current}/{ideal})
                        </span>
                      ) : (
                        <span className="text-green-700 font-semibold">OK</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleSave(product)}
                      className="px-3 py-1 bg-green-700 text-white rounded-md"
                      disabled={loadingId === key}
                    >
                      Mentés
                    </button>
                    <button
                      onClick={() => handleDelete(product)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md"
                    >
                      Nullázás
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SuppliersTab: React.FC<{
  suppliers: Supplier[];
  units: Unit[];
  activeUnitIds: string[];
}> = ({ suppliers, units, activeUnitIds }) => {
  const [form, setForm] = useState({
    name: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
    unitId: activeUnitIds[0] || '',
    sharedUnitIds: activeUnitIds,
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setForm(prev => ({ ...prev, unitId: activeUnitIds[0] || '', sharedUnitIds: activeUnitIds }));
  }, [activeUnitIds]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.unitId) return;
    if (editingId) {
      await updateSupplier(form.unitId, editingId, {
        name: form.name.trim(),
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        notes: form.notes || undefined,
        sharedUnitIds: form.sharedUnitIds.length ? form.sharedUnitIds : [form.unitId],
      });
      setEditingId(null);
    } else {
      await createSupplier(form.unitId, {
        name: form.name.trim(),
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        notes: form.notes || undefined,
        sharedUnitIds: form.sharedUnitIds.length ? form.sharedUnitIds : [form.unitId],
      });
    }
    setForm({
      name: '',
      contactEmail: '',
      contactPhone: '',
      notes: '',
      unitId: activeUnitIds[0] || '',
      sharedUnitIds: activeUnitIds,
    });
  };

  const visibleSuppliers = suppliers.filter(s => s.sharedUnitIds?.some(id => activeUnitIds.includes(id)));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <PlusIcon className="h-5 w-5" />
          {editingId ? 'Beszállító szerkesztése' : 'Új beszállító'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Név"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="border rounded-md px-3 py-2"
          />
          <select
            value={form.unitId}
            onChange={e => setForm(prev => ({ ...prev, unitId: e.target.value }))}
            className="border rounded-md px-3 py-2"
          >
            <option value="">Válassz egységet</option>
            {units
              .filter(u => activeUnitIds.includes(u.id))
              .map(unit => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </select>
          <input
            type="text"
            placeholder="Telefon"
            value={form.contactPhone}
            onChange={e => setForm(prev => ({ ...prev, contactPhone: e.target.value }))}
            className="border rounded-md px-3 py-2"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.contactEmail}
            onChange={e => setForm(prev => ({ ...prev, contactEmail: e.target.value }))}
            className="border rounded-md px-3 py-2"
          />
          <div className="md:col-span-2">
            <textarea
              placeholder="Megjegyzés"
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Megosztott egységek</label>
            <div className="flex flex-wrap gap-2">
              {units.map(unit => (
                <label key={unit.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.sharedUnitIds.includes(unit.id)}
                    onChange={e => {
                      setForm(prev => ({
                        ...prev,
                        sharedUnitIds: e.target.checked
                          ? [...prev.sharedUnitIds, unit.id]
                          : prev.sharedUnitIds.filter(id => id !== unit.id),
                      }));
                    }}
                  />
                  {unit.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-green-700 text-white rounded-md font-semibold"
          >
            {editingId ? 'Mentés' : 'Hozzáadás'}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm({
                  name: '',
                  contactEmail: '',
                  contactPhone: '',
                  notes: '',
                  unitId: activeUnitIds[0] || '',
                  sharedUnitIds: activeUnitIds,
                });
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md"
            >
              Mégse
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Név</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Elérhetőség</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Megjegyzés</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Egységek</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Műveletek</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {visibleSuppliers.map(supplier => (
              <tr key={supplier.id}>
                <td className="px-4 py-3 font-semibold text-gray-800">{supplier.name}</td>
                <td className="px-4 py-3 text-sm text-gray-700 space-y-1">
                  {supplier.contactPhone && <p>{supplier.contactPhone}</p>}
                  {supplier.contactEmail && <p>{supplier.contactEmail}</p>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{supplier.notes}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <div className="flex flex-wrap gap-2">
                    {(supplier.sharedUnitIds || [supplier.unitId]).map(unitId => (
                      <UnitBadge key={unitId} unit={units.find(u => u.id === unitId)} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => {
                      setEditingId(supplier.id);
                      setForm({
                        name: supplier.name,
                        contactEmail: supplier.contactEmail || '',
                        contactPhone: supplier.contactPhone || '',
                        notes: supplier.notes || '',
                        unitId: supplier.unitId,
                        sharedUnitIds: supplier.sharedUnitIds || [supplier.unitId],
                      });
                    }}
                    className="px-3 py-1 bg-green-700 text-white rounded-md"
                  >
                    Szerkesztés
                  </button>
                  <button
                    onClick={() => deleteSupplier(supplier.unitId, supplier.id)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md"
                  >
                    Törlés
                  </button>
                </td>
              </tr>
            ))}
            {visibleSuppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Nincs beszállító a kiválasztott egységekhez.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PlanningPlaceholder: React.FC = () => {
  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-3">
      <h3 className="text-xl font-semibold text-gray-800">Rendelés tervezés (hamarosan)</h3>
      <p className="text-gray-700">
        A modul a jövőben Gemini alapú ajánlásokkal segít a rendelési mennyiségek meghatározásában.
        Az adatszerkezet már fel van készítve az ideális és aktuális készlet közötti különbség
        számítására, így a javasolt rendelési mennyiségek könnyen integrálhatók lesznek.
      </p>
      <div className="p-4 bg-gray-50 rounded-md border border-dashed border-gray-200">
        <p className="font-semibold text-gray-800 mb-2">Példa előkészített számításra:</p>
        <p className="text-gray-700">
          Ha egy termék ideális készlete 10 egység és az aktuális készlet 6 egység,
          akkor az ajánlott rendelési mennyiség: {calculateRecommendedOrder(10, 6)}.
        </p>
      </div>
    </div>
  );
};

const KeszletApp: React.FC<KeszletAppProps> = ({ currentUser, allUnits, activeUnitIds }) => {
  const [activeTab, setActiveTab] = useState<'products' | 'ideal' | 'current' | 'suppliers' | 'planning'>('products');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [idealStocks, setIdealStocks] = useState<IdealStock[]>([]);
  const [currentStocks, setCurrentStocks] = useState<CurrentStock[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribes = [
      subscribeToCategories(activeUnitIds, setCategories),
      subscribeToProducts(activeUnitIds, setProducts),
      subscribeToIdealStocks(activeUnitIds, setIdealStocks),
      subscribeToCurrentStocks(activeUnitIds, setCurrentStocks),
      subscribeToSuppliers(activeUnitIds, setSuppliers),
    ];
    setLoading(false);
    return () => unsubscribes.forEach(unsub => unsub());
  }, [activeUnitIds]);

  if (!activeUnitIds.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600">
        Nincs kiválasztott egység. Válassz legalább egy egységet a készlet megjelenítéséhez.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const filteredProducts = products.filter(p => activeUnitIds.includes(p.unitId));

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-green-800 font-bold text-xl">
          <BriefcaseIcon className="h-7 w-7" />
          <span>Készlet</span>
        </div>
        <div className="flex items-center gap-2">
          {activeUnitIds.map(id => (
            <UnitBadge key={id} unit={allUnits.find(u => u.id === id)} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton label="Termékek" isActive={activeTab === 'products'} onClick={() => setActiveTab('products')} />
        <TabButton label="Ideális készlet" isActive={activeTab === 'ideal'} onClick={() => setActiveTab('ideal')} />
        <TabButton label="Aktuális készlet" isActive={activeTab === 'current'} onClick={() => setActiveTab('current')} />
        <TabButton label="Beszállítók" isActive={activeTab === 'suppliers'} onClick={() => setActiveTab('suppliers')} />
        <TabButton label="Rendelés tervezés" isActive={activeTab === 'planning'} onClick={() => setActiveTab('planning')} />
      </div>

      {activeTab === 'products' && (
        <ProductManagement
          categories={categories}
          products={products}
          units={allUnits}
          activeUnitIds={activeUnitIds}
        />
      )}

      {activeTab === 'ideal' && (
        <StockTable
          products={filteredProducts}
          idealStocks={idealStocks}
          currentStocks={currentStocks}
          units={allUnits}
          type="ideal"
        />
      )}

      {activeTab === 'current' && (
        <StockTable
          products={filteredProducts}
          idealStocks={idealStocks}
          currentStocks={currentStocks}
          units={allUnits}
          type="current"
        />
      )}

      {activeTab === 'suppliers' && (
        <SuppliersTab suppliers={suppliers} units={allUnits} activeUnitIds={activeUnitIds} />
      )}

      {activeTab === 'planning' && <PlanningPlaceholder />}
    </div>
  );
};

export default KeszletApp;
