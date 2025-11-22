import React, { useState, useEffect, useMemo, FC, useCallback } from 'react';
import {
  User,
  Unit,
  FileMetadata,
  KnowledgeCategory,
  KnowledgeNote,
} from '../../../core/models/data';
import { db, storage, serverTimestamp } from '../../../core/firebase/config';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  doc,
  deleteDoc,
  Timestamp,
  getDocs,
  limit,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import BookIcon from '../../../../components/icons/BookIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';
import DownloadIcon from '../../../../components/icons/DownloadIcon';
import PlusIcon from '../../../../components/icons/PlusIcon';

interface TudastarAppProps {
  currentUser: User;
  allUnits: Unit[];
  activeUnitIds: string[];
}

const DEFAULT_CATEGORY_SEED: { title: string; subcategories?: string[] }[] = [
  { title: 'Receptúrák', subcategories: ['Koktélok', 'Alapanyagok'] },
  { title: 'Üzemmel kapcsolatos információk', subcategories: ['Üzemeltetés', 'Karbantartás'] },
  { title: 'Egyéb', subcategories: ['Jegyzetek'] },
];

const notePaperStyles: React.CSSProperties = {
  backgroundColor: '#f8fbff',
  backgroundImage:
    'linear-gradient(to bottom, rgba(96,165,250,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
  backgroundSize: '100% 32px, 100% 64px',
  borderLeft: '6px solid #2563eb',
  boxShadow: '0 10px 30px rgba(37, 99, 235, 0.08)',
  position: 'relative',
};

const FileUploadModal: FC<{
  onClose: () => void;
  currentUser: User;
  allUnits: Unit[];
  categories: KnowledgeCategory[];
  defaultUnitId: string;
  defaultCategoryId?: string | null;
  onSubcategoryCapture: (categoryId: string, subcategory?: string) => Promise<void>;
}> = ({ onClose, currentUser, allUnits, categories, defaultUnitId, defaultCategoryId, onSubcategoryCapture }) => {
  const [file, setFile] = useState<File | null>(null);
  const [unitId, setUnitId] = useState(defaultUnitId);
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId || '');
  const [subcategory, setSubcategory] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Nincs fájl kiválasztva.');
      return;
    }
    if (!unitId) {
      setError('Nincs egység kiválasztva.');
      return;
    }
    if (!categoryId) {
      setError('Nincs kategória kiválasztva.');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const storagePath = `tudastar/${unitId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadResult = await uploadBytes(storageRef, file, {
        contentType: file.type,
      });
      const downloadURL = await getDownloadURL(uploadResult.ref);

      const fileMetadata: Omit<FileMetadata, 'id'> = {
        name: file.name,
        url: downloadURL,
        storagePath: storagePath,
        size: file.size,
        contentType: file.type,
        uploadedBy: currentUser.fullName,
        uploadedByUid: currentUser.id,
        uploadedAt: serverTimestamp() as Timestamp,
        unitId: unitId,
        categoryId,
        subcategory: subcategory || undefined,
      };

      await addDoc(collection(db, 'files'), fileMetadata);
      await onSubcategoryCapture(categoryId, subcategory || undefined);
      onClose();
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err?.message || 'Hiba a fájl feltöltése során.');
    } finally {
      setIsUploading(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === categoryId);
  const availableSubcategories = selectedCategory?.subcategories || [];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleUpload} className="divide-y">
          <div className="p-5">
            <h2 className="text-xl font-bold text-gray-800">Új dokumentum feltöltése</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Fájl kiválasztása</label>
                <input type="file" onChange={handleFileChange} className="w-full mt-1 p-2 border rounded-lg" required />
              </div>
              <div>
                <label className="text-sm font-medium">Egység</label>
                <select
                  value={unitId}
                  onChange={e => setUnitId(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-lg bg-white"
                  required
                >
                  <option value="" disabled>
                    Válassz...
                  </option>
                  {currentUser.role === 'Admin' && (
                    <option value="central">Mindenki (központi)</option>
                  )}
                  {allUnits
                    .filter(u => currentUser.role === 'Admin' || currentUser.unitIds?.includes(u.id))
                    .map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Kategória</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-lg bg-white"
                  required
                >
                  <option value="" disabled>
                    Válassz...
                  </option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Alkategória (opcionális)</label>
                <div className="flex gap-2 mt-1">
                  <select
                    value={availableSubcategories.includes(subcategory) ? subcategory : ''}
                    onChange={e => setSubcategory(e.target.value)}
                    className="flex-1 p-2 border rounded-lg bg-white"
                  >
                    <option value="">Nincs megadva</option>
                    {availableSubcategories.map(sub => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={subcategory}
                    onChange={e => setSubcategory(e.target.value)}
                    placeholder="Új alkategória"
                    className="flex-1 p-2 border rounded-lg"
                  />
                </div>
              </div>
            </div>
            {error && <p className="text-red-500">{error}</p>}
          </div>
          <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-200 px-4 py-2 rounded-lg font-semibold"
            >
              Mégse
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400"
            >
              {isUploading ? 'Feltöltés...' : 'Feltöltés'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const NoteModal: FC<{
  onClose: () => void;
  categories: KnowledgeCategory[];
  defaultCategoryId?: string;
  selectedUnitId: string;
  currentUser: User;
  onSubcategoryCapture: (categoryId: string, subcategory?: string) => Promise<void>;
}> = ({ onClose, categories, defaultCategoryId, selectedUnitId, currentUser, onSubcategoryCapture }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCategoryId || '');
  const [subcategory, setSubcategory] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const selectedCategory = categories.find(c => c.id === categoryId);
  const availableSubcategories = selectedCategory?.subcategories || [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('A cím és a tartalom megadása kötelező.');
      return;
    }
    if (!categoryId) {
      setError('Nincs kategória kiválasztva.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'knowledgeNotes'), {
        title: title.trim(),
        content: content.trim(),
        categoryId,
        subcategory: subcategory || undefined,
        unitId: selectedUnitId,
        createdAt: serverTimestamp() as Timestamp,
        createdBy: currentUser.fullName,
        createdByUid: currentUser.id,
      });
      await onSubcategoryCapture(categoryId, subcategory || undefined);
      onClose();
    } catch (err: any) {
      console.error('Error saving note:', err);
      setError(err?.message || 'Hiba a jegyzet mentésekor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSave} className="divide-y">
          <div className="p-5">
            <h2 className="text-xl font-bold text-gray-800">Új jegyzet</h2>
            <p className="text-gray-500 text-sm mt-1">Rövid jegyzet minimális formázási lehetőségekkel. A sor- és üres sor tördelés megmarad.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Cím</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-lg"
                  placeholder="Pl. Új koktél jegyzet"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Kategória</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full mt-1 p-2 border rounded-lg bg-white"
                  required
                >
                  <option value="" disabled>
                    Válassz...
                  </option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Alkategória (opcionális)</label>
                <div className="flex gap-2 mt-1">
                  <select
                    value={availableSubcategories.includes(subcategory) ? subcategory : ''}
                    onChange={e => setSubcategory(e.target.value)}
                    className="flex-1 p-2 border rounded-lg bg-white"
                  >
                    <option value="">Nincs megadva</option>
                    {availableSubcategories.map(sub => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={subcategory}
                    onChange={e => setSubcategory(e.target.value)}
                    placeholder="Új alkategória"
                    className="flex-1 p-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Egység</label>
                <input
                  type="text"
                  value={selectedUnitId === 'central' ? 'Központi' : selectedUnitId}
                  disabled
                  className="w-full mt-1 p-2 border rounded-lg bg-gray-100 text-gray-600"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Tartalom</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={8}
                className="w-full mt-1 p-3 border rounded-lg font-mono text-sm leading-6"
                placeholder="Írd ide a jegyzetet. Üres sorokkal tagolhatod, *dőlt* és **félkövér** jelölés is használható."
                required
              />
              <p className="text-xs text-gray-500 mt-1">Alap formázás: sorvégi törés, *dőlt* és **félkövér** csillag jelöléssel.</p>
            </div>
            {error && <p className="text-red-500">{error}</p>}
          </div>
          <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-200 px-4 py-2 rounded-lg font-semibold"
            >
              Mégse
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400"
            >
              {saving ? 'Mentés...' : 'Mentés'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CategoryManagerModal: FC<{
  onClose: () => void;
  categories: KnowledgeCategory[];
  selectedUnitId: string;
}> = ({ onClose, categories, selectedUnitId }) => {
  const [localCategories, setLocalCategories] = useState<KnowledgeCategory[]>(categories);
  const [newCategoryTitle, setNewCategoryTitle] = useState('');
  const [draftSubcategories, setDraftSubcategories] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const handleRename = async (category: KnowledgeCategory, title: string) => {
    setLocalCategories(prev => prev.map(c => (c.id === category.id ? { ...c, title } : c)));
    await updateDoc(doc(db, 'knowledgeCategories', category.id), { title });
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryTitle.trim()) return;
    await addDoc(collection(db, 'knowledgeCategories'), {
      title: newCategoryTitle.trim(),
      unitId: selectedUnitId,
      order: categories.length,
      subcategories: [],
    });
    setNewCategoryTitle('');
  };

  const handleAddSubcategory = async (categoryId: string, subcategory: string) => {
    if (!subcategory.trim()) return;
    await updateDoc(doc(db, 'knowledgeCategories', categoryId), {
      subcategories: arrayUnion(subcategory.trim()),
    });
    setDraftSubcategories(prev => ({ ...prev, [categoryId]: '' }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">Kategóriák szerkesztése</h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-semibold">
            Bezárás
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {localCategories.map(category => (
            <div key={category.id} className="border rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Név</label>
                  <input
                    type="text"
                    defaultValue={category.title}
                    onBlur={e => handleRename(category, e.target.value)}
                    className="w-full mt-1 p-2 border rounded-lg"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Új alkategória</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Pl. Desszertek"
                      className="flex-1 p-2 border rounded-lg"
                      value={draftSubcategories[category.id] || ''}
                      onChange={e =>
                        setDraftSubcategories(prev => ({ ...prev, [category.id]: e.target.value }))
                      }
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          await handleAddSubcategory(category.id, draftSubcategories[category.id]);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await handleAddSubcategory(category.id, draftSubcategories[category.id]);
                      }}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
                    >
                      Hozzáadás
                    </button>
                  </div>
                  {category.subcategories && category.subcategories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-600">
                      {category.subcategories.map(sub => (
                        <span key={sub} className="px-2 py-1 bg-gray-100 rounded-full">
                          {sub}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <form onSubmit={handleAddCategory} className="border rounded-xl p-4 bg-gray-50">
            <label className="text-xs text-gray-500">Új kategória</label>
            <div className="flex flex-col md:flex-row gap-2 mt-1">
              <input
                type="text"
                value={newCategoryTitle}
                onChange={e => setNewCategoryTitle(e.target.value)}
                placeholder="Pl. Képzés"
                className="flex-1 p-2 border rounded-lg"
              />
              <button type="submit" className="px-4 py-2 bg-green-700 text-white rounded-lg font-semibold">
                Hozzáadás
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const TudastarApp: React.FC<TudastarAppProps> = ({ currentUser, allUnits, activeUnitIds }) => {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => {
    if (currentUser.role === 'Admin') return 'central';
    return activeUnitIds[0] || currentUser.unitIds?.[0] || 'central';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const canManage = currentUser.role === 'Admin' || currentUser.role === 'Unit Admin';

  const accessibleUnits = useMemo(() => {
    const allowedIds = new Set<string>([...activeUnitIds, ...(currentUser.unitIds || [])]);
    const units = allUnits.filter(u => currentUser.role === 'Admin' || allowedIds.has(u.id));
    if (currentUser.role === 'Admin') {
      return [{ id: 'central', name: 'Központi' }, ...units];
    }
    return units;
  }, [allUnits, activeUnitIds, currentUser]);

  useEffect(() => {
    if (!selectedUnitId && accessibleUnits.length > 0) {
      setSelectedUnitId(accessibleUnits[0].id);
    }
    if (selectedUnitId && accessibleUnits.length > 0 && !accessibleUnits.find(u => u.id === selectedUnitId)) {
      setSelectedUnitId(accessibleUnits[0].id);
    }
  }, [accessibleUnits, selectedUnitId]);

  const ensureDefaultsForUnit = useCallback(
    async (unitId: string) => {
      if (!canManage || !unitId) return;
      const existing = await getDocs(query(collection(db, 'knowledgeCategories'), where('unitId', '==', unitId), limit(1)));
      if (!existing.empty) return;
      await Promise.all(
        DEFAULT_CATEGORY_SEED.map((seed, index) =>
          addDoc(collection(db, 'knowledgeCategories'), {
            title: seed.title,
            unitId,
            order: index,
            subcategories: seed.subcategories || [],
          })
        )
      );
    },
    [canManage]
  );

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const loadCategories = async () => {
      setLoading(true);
      await ensureDefaultsForUnit(selectedUnitId);
      const categoryQuery = query(collection(db, 'knowledgeCategories'), where('unitId', '==', selectedUnitId));
      unsubscribe = onSnapshot(
        categoryQuery,
        snapshot => {
          const fetched = snapshot.docs
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as KnowledgeCategory))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          setCategories(fetched);
          setLoading(false);
          if (!selectedCategoryId && fetched.length > 0) {
            setSelectedCategoryId(fetched[0].id);
          }
        },
        err => {
          console.error('Error fetching categories:', err);
          setError('Hiba a kategóriák betöltésekor.');
          setLoading(false);
        }
      );
    };
    loadCategories();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedUnitId, ensureDefaultsForUnit, selectedCategoryId]);

  useEffect(() => {
    if (!selectedUnitId) return;
    const notesQuery = query(collection(db, 'knowledgeNotes'), where('unitId', '==', selectedUnitId));
    const unsubscribe = onSnapshot(
      notesQuery,
      snapshot => {
        const fetchedNotes = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as KnowledgeNote))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setNotes(fetchedNotes);
      },
      err => {
        console.error('Error fetching notes:', err);
        setError('Hiba a jegyzetek betöltésekor.');
      }
    );
    return () => unsubscribe();
  }, [selectedUnitId]);

  useEffect(() => {
    if (!selectedUnitId) return;
    setLoading(true);
    const filesQuery = query(
      collection(db, 'files'),
      where('unitId', '==', selectedUnitId),
      orderBy('uploadedAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      filesQuery,
      snapshot => {
        const fetchedFiles = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as FileMetadata));
        setFiles(fetchedFiles);
        setLoading(false);
      },
      err => {
        console.error('Error fetching files:', err);
        setError('Hiba a dokumentumok betöltésekor.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [selectedUnitId]);

  const handleDeleteFile = async (file: FileMetadata) => {
    if (window.confirm(`Biztosan törölni szeretnéd a(z) "${file.name}" fájlt?`)) {
      try {
        const storageRef = ref(storage, file.storagePath);
        await deleteObject(storageRef);
        await deleteDoc(doc(db, 'files', file.id));
      } catch (err) {
        console.error('Error deleting file:', err);
        alert('Hiba a fájl törlése során.');
      }
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const selectedCategory = categories.find(c => c.id === selectedCategoryId) || null;
  const subcategoryOptions = selectedCategory?.subcategories || [];

  const filteredNotes = notes.filter(note => {
    if (selectedCategoryId && note.categoryId !== selectedCategoryId) return false;
    if (selectedSubcategory && note.subcategory !== selectedSubcategory) return false;
    return true;
  });

  const filteredFiles = files.filter(file => {
    if (selectedCategoryId && file.categoryId && file.categoryId !== selectedCategoryId) return false;
    if (selectedSubcategory && file.subcategory && file.subcategory !== selectedSubcategory) return false;
    return true;
  });

  const ensureSubcategoryTracked = useCallback(
    async (categoryId: string, subcategory?: string) => {
      if (!subcategory) return;
      const category = categories.find(c => c.id === categoryId);
      if (category && category.subcategories && category.subcategories.includes(subcategory)) return;
      await updateDoc(doc(db, 'knowledgeCategories', categoryId), {
        subcategories: arrayUnion(subcategory),
      });
    },
    [categories]
  );

  const renderNoteContent = (content: string) => {
    const formatted = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');
    return <div className="text-gray-800" dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {isUploadModalOpen && (
        <FileUploadModal
          onClose={() => setIsUploadModalOpen(false)}
          currentUser={currentUser}
          allUnits={allUnits}
          categories={categories}
          defaultUnitId={selectedUnitId}
          defaultCategoryId={selectedCategoryId}
          onSubcategoryCapture={ensureSubcategoryTracked}
        />
      )}
      {isNoteModalOpen && selectedCategory && (
        <NoteModal
          onClose={() => setIsNoteModalOpen(false)}
          categories={categories}
          defaultCategoryId={selectedCategory.id}
          selectedUnitId={selectedUnitId}
          currentUser={currentUser}
          onSubcategoryCapture={ensureSubcategoryTracked}
        />
      )}
      {isCategoryModalOpen && (
        <CategoryManagerModal
          onClose={() => setIsCategoryModalOpen(false)}
          categories={categories}
          selectedUnitId={selectedUnitId}
        />
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Tudástár</h1>
          <p className="text-gray-500">Dokumentumok és jegyzetek egységenként rendezve.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedUnitId}
            onChange={e => setSelectedUnitId(e.target.value)}
            className="p-2 border rounded-lg bg-white"
          >
            {accessibleUnits.map(unit => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          {canManage && (
            <>
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700"
              >
                Kategóriák
              </button>
              <button
                onClick={() => setIsNoteModalOpen(true)}
                className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                Jegyzet
              </button>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 flex items-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                Új feltöltése
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="relative h-64">
          <LoadingSpinner />
        </div>
      )}
      {error && <div className="bg-red-100 p-4 rounded-lg text-red-700">{error}</div>}

      {!loading && !error && (
        <>
          <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl shadow-sm border">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  setSelectedSubcategory(null);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                  selectedCategoryId === category.id
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-200 hover:text-blue-700'
                }`}
              >
                {category.title}
              </button>
            ))}
            {categories.length === 0 && <span className="text-gray-500 px-4 py-2">Nincsenek kategóriák.</span>}
          </div>

          {selectedCategory && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-sm text-gray-600 mr-1">Alkategóriák:</span>
              <button
                onClick={() => setSelectedSubcategory(null)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  !selectedSubcategory ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                Mind
              </button>
              {subcategoryOptions.map(sub => (
                <button
                  key={sub}
                  onClick={() => setSelectedSubcategory(sub)}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    selectedSubcategory === sub
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {filteredNotes.length === 0 && filteredFiles.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl mt-4">
              <BookIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700">Nincs tartalom ebben a nézetben</h3>
              <p className="text-gray-500 mt-1">
                {canManage ? 'Adj hozzá jegyzetet vagy tölts fel dokumentumot.' : 'Nincsenek elérhető elemek.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              <div className="lg:col-span-2 space-y-4">
                {filteredNotes.map(note => (
                  <div key={note.id} className="p-5 rounded-2xl" style={notePaperStyles}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-blue-600 font-semibold">
                          {selectedCategory?.title}
                          {note.subcategory ? ` • ${note.subcategory}` : ''}
                        </p>
                        <h3 className="text-xl font-bold text-gray-900">{note.title}</h3>
                      </div>
                      <span className="text-xs text-gray-500">
                        {note.createdAt?.toDate?.()
                          ? note.createdAt.toDate().toLocaleDateString('hu-HU')
                          : '—'}
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none">
                      {renderNoteContent(note.content)}
                    </div>
                    <div className="mt-3 text-xs text-gray-500">Készítette: {note.createdBy}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-800">Feltöltött fájlok</h2>
                  {canManage && (
                    <button
                      onClick={() => setIsUploadModalOpen(true)}
                      className="text-sm text-blue-700 hover:text-blue-900 font-semibold"
                    >
                      Új fájl
                    </button>
                  )}
                </div>
                {filteredFiles.length === 0 ? (
                  <p className="text-gray-500 text-sm">Nincs feltöltött fájl ebben a kategóriában.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredFiles.map(file => (
                      <div key={file.id} className="bg-white p-4 rounded-xl shadow-sm border flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{file.name}</p>
                          <p className="text-sm text-gray-500">
                            {formatBytes(file.size)} • {file.subcategory ? `${file.subcategory} • ` : ''}
                            {file.uploadedBy} •
                            {' '}
                            {file.uploadedAt?.toDate?.()
                              ? file.uploadedAt.toDate().toLocaleDateString('hu-HU')
                              : '—'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-full"
                            title="Letöltés"
                          >
                            <DownloadIcon className="h-5 w-5" />
                          </a>
                          {canManage && (
                            <button
                              onClick={() => handleDeleteFile(file)}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full"
                              title="Törlés"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TudastarApp;
