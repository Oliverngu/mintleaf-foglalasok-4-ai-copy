import React, { useState, useMemo, useEffect } from 'react';
import { Contact, ContactCategory, User } from '../../data/mockData';
import { db, serverTimestamp } from '../../firebase/config';
import { 
    collection, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    addDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    writeBatch,
    getDocs,
} from 'firebase/firestore';
import LoadingSpinner from '../LoadingSpinner';
import ContactsIcon from '../icons/ContactsIcon';
import EyeIcon from '../icons/EyeIcon';
import EyeSlashIcon from '../icons/EyeSlashIcon';

interface ContactsAppProps {
  currentUser: User;
  canManage: boolean;
  canViewAll: boolean;
}

const CategoryManager: React.FC<{
  categories: ContactCategory[];
  onClose: () => void;
}> = ({ categories, onClose }) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryUserSelectable, setNewCategoryUserSelectable] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ContactCategory | null>(null);

  const handleAddCategory = async () => {
    if (newCategoryName.trim() === '') return;
    await addDoc(collection(db, 'contact_categories'), { 
        name: newCategoryName.trim(),
        isUserSelectable: newCategoryUserSelectable 
    });
    setNewCategoryName('');
    setNewCategoryUserSelectable(false);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || editingCategory.name.trim() === '') return;
    await updateDoc(doc(db, 'contact_categories', editingCategory.id), { 
        name: editingCategory.name.trim(),
        isUserSelectable: editingCategory.isUserSelectable || false
    });
    setEditingCategory(null);
  };
  
  const handleDeleteCategory = async (id: string) => {
    if(window.confirm('Biztosan törölni szeretnéd ezt a kategóriát? A hozzá tartozó névjegyek nem törlődnek, de kategória nélkül maradnak.')) {
        try {
            const batch = writeBatch(db);
            const contactsQuery = query(collection(db, 'contacts'), where('categoryId', '==', id));
            const contactsSnapshot = await getDocs(contactsQuery);
            contactsSnapshot.forEach(contactDoc => {
                batch.update(doc(db, 'contacts', contactDoc.id), { categoryId: '' });
            });
            const categoryRef = doc(db, 'contact_categories', id);
            batch.delete(categoryRef);
            await batch.commit();
        } catch (err) {
            console.error("Error deleting category and updating contacts:", err);
            alert("Hiba történt a kategória törlése során.");
        }
    }
  };


  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Kategóriák kezelése</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">&times;</button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Új kategória neve"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-green-500"
                        />
                        <button onClick={handleAddCategory} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold shrink-0">Hozzáad</button>
                    </div>
                     <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="newCatUserSelectable"
                            checked={newCategoryUserSelectable}
                            onChange={(e) => setNewCategoryUserSelectable(e.target.checked)}
                            className="h-4 w-4 rounded text-green-600"
                        />
                        <label htmlFor="newCatUserSelectable" className="text-sm text-gray-600">Felhasználók számára választható</label>
                    </div>
                </div>
                <div className="space-y-2">
                    {categories.map(cat => (
                        <div key={cat.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                           {editingCategory?.id === cat.id ? (
                               <div className="flex-grow">
                                    <input 
                                        type="text"
                                        value={editingCategory.name}
                                        onChange={(e) => setEditingCategory({...editingCategory, name: e.target.value})}
                                        className="w-full px-2 py-1 border rounded mb-2"
                                    />
                                     <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id={`edit-cat-${cat.id}`}
                                            checked={!!editingCategory.isUserSelectable}
                                            onChange={(e) => setEditingCategory({...editingCategory, isUserSelectable: e.target.checked})}
                                            className="h-4 w-4 rounded text-green-600"
                                        />
                                        <label htmlFor={`edit-cat-${cat.id}`} className="text-sm text-gray-600">Felhasználók számára választható</label>
                                    </div>
                               </div>
                           ) : (
                                <span className="font-medium text-gray-700">{cat.name}</span>
                           )}
                           <div className="flex gap-2 shrink-0 ml-4">
                               {editingCategory?.id === cat.id ? (
                                    <button onClick={handleUpdateCategory} className="text-sm font-semibold text-green-600">Mentés</button>
                               ) : (
                                    <button onClick={() => setEditingCategory(cat)} className="text-sm font-semibold text-blue-600">Szerkeszt</button>
                               )}
                               <button onClick={() => handleDeleteCategory(cat.id)} className="text-sm font-semibold text-red-600">Törlés</button>
                           </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
};


const ContactForm: React.FC<{
  contact?: Contact | null;
  categories: ContactCategory[];
  onClose: () => void;
  currentUser: User;
  isSelfManaged: boolean;
}> = ({ contact, categories, onClose, currentUser, isSelfManaged }) => {
    const isAdmin = currentUser.role === 'Admin';
    const [formData, setFormData] = useState({
        name: isSelfManaged ? currentUser.fullName : (contact?.name || ''),
        phone: contact?.phone || '',
        email: contact?.email || '',
        note: contact?.note || '',
        categoryId: contact?.categoryId || '',
        isVisible: contact?.isVisible !== undefined ? contact.isVisible : true,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const dataToSave: any = {
                ...formData,
                updatedAt: serverTimestamp(),
            };

            if (contact) { // Editing
                await updateDoc(doc(db, 'contacts', contact.id), dataToSave);
            } else { // Creating
                const finalData = {
                    ...dataToSave,
                    unitId: currentUser.unitIds?.[0] || '', // Default to first unit
                    createdAt: serverTimestamp(),
                    ...(isSelfManaged && { createdByUid: currentUser.id, isVisible: true })
                };
                await addDoc(collection(db, 'contacts'), finalData);
            }
            onClose();
        } catch (error) {
            console.error("Error saving contact:", error);
            alert("Hiba történt a mentés során.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>
                    <div className="p-5 border-b">
                        <h2 className="text-xl font-bold text-gray-800">{contact ? 'Névjegy szerkesztése' : 'Új névjegy'}</h2>
                    </div>
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div>
                            <label className="text-sm font-medium">Név</label>
                            <input 
                                type="text" 
                                name="name" 
                                value={formData.name} 
                                onChange={handleChange} 
                                className={`w-full mt-1 p-2 border rounded-lg ${isSelfManaged ? 'bg-gray-100' : ''}`}
                                required 
                                readOnly={isSelfManaged}
                             />
                        </div>
                         <div>
                            <label className="text-sm font-medium">Telefonszám</label>
                            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Email cím (opcionális)</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Megjegyzés (opcionális)</label>
                            <textarea name="note" value={formData.note} onChange={handleChange} rows={3} className="w-full mt-1 p-2 border rounded-lg" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Kategória</label>
                            <select name="categoryId" value={formData.categoryId} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg bg-white" required>
                                <option value="" disabled>Válassz kategóriát</option>
                                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                            </select>
                        </div>
                        {isAdmin && !isSelfManaged && (
                            <div className="flex items-center gap-3">
                                <input type="checkbox" id="isVisible" name="isVisible" checked={formData.isVisible} onChange={handleChange} className="h-5 w-5 rounded text-green-600 focus:ring-green-500" />
                                <label htmlFor="isVisible" className="font-medium text-gray-700">Mindenki számára látható</label>
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
                        <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                        <button type="submit" disabled={isSubmitting} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">{isSubmitting ? 'Mentés...' : 'Mentés'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const ContactsApp: React.FC<ContactsAppProps> = ({ currentUser, canManage, canViewAll }) => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [categories, setCategories] = useState<ContactCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [isManagingCategories, setIsManagingCategories] = useState(false);
    const [isManagingSelf, setIsManagingSelf] = useState(false);

    const isAdmin = canManage;
    const isSuperAdmin = currentUser.role === 'Admin';

    useEffect(() => {
        const categoriesQuery = query(collection(db, 'contact_categories'), orderBy('name'));
        const unsubscribeCategories = onSnapshot(categoriesQuery, snapshot => {
            const fetchedCategories: ContactCategory[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactCategory));
            setCategories(fetchedCategories);
        }, err => {
            console.error("Error fetching contact categories:", err);
            setError("Hiba a kategóriák betöltésekor.");
        });

        let contactsQuery;
        if (!isSuperAdmin) {
            const baseQuery = collection(db, 'contacts');
            const visibilityQuery = where('isVisible', '==', true);
            if (currentUser?.unitIds && currentUser.unitIds.length > 0) {
                contactsQuery = query(baseQuery, visibilityQuery, where('unitId', 'in', currentUser.unitIds));
            } else {
                contactsQuery = query(baseQuery, visibilityQuery);
            }
        } else {
            contactsQuery = query(collection(db, 'contacts'), orderBy('name'));
        }
        
        const unsubscribeContacts = onSnapshot(contactsQuery, snapshot => {
            let fetchedContacts: Contact[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            } as Contact));
            
            if (!isSuperAdmin) {
                fetchedContacts.sort((a, b) => a.name.localeCompare(b.name));
            }

            setContacts(fetchedContacts);
            setLoading(false);
        }, err => {
            console.error("Error fetching contacts:", err);
            setError("Hiba a névjegyek betöltésekor.");
            setLoading(false);
        });

        return () => {
            unsubscribeCategories();
            unsubscribeContacts();
        };
    }, [isSuperAdmin, currentUser?.unitIds]);


    const userContact = useMemo(() => 
        contacts.find(c => c.createdByUid === currentUser.id), 
    [contacts, currentUser.id]);

    const userSelectableCategories = useMemo(() => categories.filter(c => c.isUserSelectable), [categories]);

    const contactsToDisplay = (isAdmin || canViewAll) ? contacts : contacts.filter(c => c.createdByUid !== currentUser.id);

    const contactsByCategory = useMemo(() => {
        const grouped: { [key: string]: Contact[] } = {};
        contactsToDisplay.forEach(contact => {
            const categoryName = categories.find(c => c.id === contact.categoryId)?.name || 'Nincs kategória';
            if (!grouped[categoryName]) {
                grouped[categoryName] = [];
            }
            grouped[categoryName].push(contact);
        });
        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
    }, [contactsToDisplay, categories]);
    
    const handleDeleteContact = async (id: string) => {
        if(window.confirm('Biztosan törölni szeretnéd ezt a névjegyet?')) {
            try {
                await deleteDoc(doc(db, 'contacts', id));
            } catch(err) {
                console.error("Error deleting contact:", err);
                alert("Hiba történt a névjegy törlése közben.");
            }
        }
    };
    
    const openContactForm = (contact: Contact | null, selfManaged: boolean) => {
        setIsManagingSelf(selfManaged);
        if (contact) {
            setEditingContact(contact);
        } else {
            setIsAddingNew(true);
        }
    };

    const closeContactForm = () => {
        setEditingContact(null);
        setIsAddingNew(false);
        setIsManagingSelf(false);
    };

    return (
        <div className="p-4 md:p-8">
            {isAdmin && (
                <div className="flex justify-end mb-6 gap-3">
                    <button onClick={() => setIsManagingCategories(true)} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Kategóriák kezelése</button>
                    <button onClick={() => openContactForm(null, false)} className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800">Új névjegy</button>
                </div>
            )}
            
            {(isAddingNew || editingContact) && (
                <ContactForm 
                    contact={editingContact}
                    categories={isManagingSelf ? userSelectableCategories : categories}
                    onClose={closeContactForm}
                    currentUser={currentUser}
                    isSelfManaged={isManagingSelf}
                />
            )}
            {isManagingCategories && <CategoryManager categories={categories} onClose={() => setIsManagingCategories(false)} />}

             {!isAdmin && (
                <div className="mb-8 p-6 bg-white rounded-2xl shadow-md border">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Saját Névjegyem</h2>
                    {userContact ? (
                         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">{userContact.name}</h3>
                                <p className="text-green-700 font-semibold">{userContact.phone}</p>
                                {userContact.email && <a href={`mailto:${userContact.email}`} className="text-blue-600 hover:underline text-sm">{userContact.email}</a>}
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => openContactForm(userContact, true)} className="text-sm font-semibold text-blue-600 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg">Szerkeszt</button>
                                <button onClick={() => handleDeleteContact(userContact.id)} className="text-sm font-semibold text-red-600 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg">Törlés</button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-gray-600 mb-3">Még nem adtad hozzá a saját elérhetőségedet.</p>
                            <button onClick={() => openContactForm(null, true)} className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800">Saját névjegy hozzáadása</button>
                        </div>
                    )}
                </div>
            )}


            {loading && <div className="relative h-64"><LoadingSpinner /></div>}
            {error && <div className="bg-red-100 p-4 rounded-lg text-red-700">{error}</div>}
            
            {!loading && !error && contacts.length === 0 && !userContact ? (
                 <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl">
                    <ContactsIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700">Nincsenek névjegyek</h3>
                    <p className="text-gray-500 mt-1">{isAdmin ? 'Adj hozzá egy új névjegyet a kezdéshez.' : 'Jelenleg nincsenek megosztott elérhetőségek.'}</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {contactsByCategory.map(([categoryName, contactsInCategory]) => (
                        <div key={categoryName}>
                            <h2 className="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{categoryName}</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {contactsInCategory.map(contact => (
                                    <div key={contact.id} className="bg-white p-5 rounded-xl shadow-md border relative">
                                        {!contact.isVisible && (isAdmin || canViewAll) && (
                                            <div title="Ez a névjegy rejtve van a normál felhasználók elől" className="absolute top-3 right-3 bg-yellow-100 p-1.5 rounded-full">
                                                <EyeSlashIcon />
                                            </div>
                                        )}
                                        <h3 className="font-bold text-lg text-gray-900">{contact.name}</h3>
                                        <p className="text-green-700 font-semibold mt-1">{contact.phone}</p>
                                        {contact.email && <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline text-sm">{contact.email}</a>}
                                        {contact.note && <p className="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-200">{contact.note}</p>}

                                        {isAdmin && (
                                            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-2">
                                                <button onClick={() => openContactForm(contact, false)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">Szerkeszt</button>
                                                <button onClick={() => handleDeleteContact(contact.id)} className="text-sm font-semibold text-red-600 hover:text-red-800">Törlés</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ContactsApp;