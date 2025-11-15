import React, { useState, useEffect } from 'react';
import { Unit } from '../../../core/models/data';
import { db, storage } from '../../../core/firebase/config';
import { collection, onSnapshot, query, orderBy, addDoc, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import BuildingIcon from '../../../../components/icons/BuildingIcon';
import PencilIcon from '../../../../components/icons/PencilIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';
import ImageIcon from '../../../../components/icons/ImageIcon';
import CheckIcon from '../../../../components/icons/CheckIcon';
import XIcon from '../../../../components/icons/XIcon';

const EgysegekApp: React.FC = () => {
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormVisible, setIsFormVisible] = useState(false);
    
    // Form state for new unit
    const [newUnitName, setNewUnitName] = useState('');
    const [newUnitLogo, setNewUnitLogo] = useState<File | null>(null);

    // State for editing
    const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
    const [editUnitName, setEditUnitName] = useState('');
    const [editUnitLogo, setEditUnitLogo] = useState<File | null>(null);

    useEffect(() => {
        const q = query(collection(db, 'units'), orderBy('name'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching units:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const resetForm = () => {
        setNewUnitName('');
        setNewUnitLogo(null);
        setIsFormVisible(false);
    };

    const handleAddUnit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUnitName) return;
        setIsLoading(true);

        try {
            const newUnitRef = doc(collection(db, 'units'));
            
            let logoUrl: string | undefined = undefined;
            if (newUnitLogo) {
                const logoRef = ref(storage, `unit_logos/${newUnitRef.id}/logo_${newUnitLogo.name}`);
                await uploadBytes(logoRef, newUnitLogo);
                logoUrl = await getDownloadURL(logoRef);
            }

            await setDoc(newUnitRef, { name: newUnitName, ...(logoUrl && { logoUrl }) });

            resetForm();
        } catch (error) {
            console.error("Error adding unit:", error);
            alert("Hiba történt az egység hozzáadása során.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateUnit = async (unitId: string) => {
        if (!editUnitName) return;
        setIsLoading(true);

        try {
            const unitRef = doc(db, 'units', unitId);
            const updates: { name: string; logoUrl?: string } = { name: editUnitName };

            if (editUnitLogo) {
                 const logoRef = ref(storage, `unit_logos/${unitId}/logo_${editUnitLogo.name}`);
                await uploadBytes(logoRef, editUnitLogo);
                updates.logoUrl = await getDownloadURL(logoRef);
            }

            await updateDoc(unitRef, updates);
            setEditingUnit(null);
        } catch (error) {
            console.error("Error updating unit:", error);
            alert("Hiba történt a frissítés során.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDeleteUnit = async (unit: Unit) => {
        if (window.confirm(`Biztosan törölni szeretnéd a(z) "${unit.name}" egységet? Ez a művelet nem vonható vissza.`)) {
             setIsLoading(true);
            try {
                if (unit.logoUrl) {
                    try {
                        const logoRef = ref(storage, unit.logoUrl);
                        await deleteObject(logoRef);
                    } catch (storageError: any) {
                        if (storageError.code !== 'storage/object-not-found') {
                            throw storageError;
                        }
                    }
                }
                await deleteDoc(doc(db, 'units', unit.id));
            } catch (error) {
                console.error("Error deleting unit:", error);
                alert("Hiba a törlés során.");
            } finally {
                 setIsLoading(false);
            }
        }
    };
    
    const startEditing = (unit: Unit) => {
        setEditingUnit(unit);
        setEditUnitName(unit.name);
        setEditUnitLogo(null);
    };

    const cancelEditing = () => {
        setEditingUnit(null);
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Üzletek / Egységek</h2>
                <button onClick={() => setIsFormVisible(!isFormVisible)} className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800">
                    {isFormVisible ? 'Mégse' : 'Új egység'}
                </button>
            </div>

            {isFormVisible && (
                 <form onSubmit={handleAddUnit} className="mb-6 p-4 bg-gray-50 border rounded-lg space-y-4">
                     <input type="text" value={newUnitName} onChange={e => setNewUnitName(e.target.value)} placeholder="Új egység neve" className="w-full p-2 border rounded" required />
                     <div>
                        <label htmlFor="new-logo-upload" className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 hover:text-blue-600">
                           <ImageIcon className="h-5 w-5" />
                           <span>{newUnitLogo ? newUnitLogo.name : 'Logó feltöltése (opcionális)'}</span>
                        </label>
                        <input id="new-logo-upload" type="file" accept="image/*" onChange={e => setNewUnitLogo(e.target.files ? e.target.files[0] : null)} className="hidden"/>
                     </div>
                     <button type="submit" className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Mentés</button>
                 </form>
            )}

            {isLoading && units.length === 0 ? <div className="relative h-48"><LoadingSpinner /></div> : (
                <div className="space-y-3">
                    {units.map(unit => (
                        <div key={unit.id} className="p-3 border rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors">
                           {editingUnit?.id === unit.id ? (
                               <div className="flex-grow flex items-center gap-3 w-full">
                                   <input type="text" value={editUnitName} onChange={e => setEditUnitName(e.target.value)} className="p-2 border rounded-md flex-grow" />
                                   <div>
                                       <label htmlFor={`edit-logo-${unit.id}`} className="text-sm cursor-pointer text-blue-600 hover:underline whitespace-nowrap">{editUnitLogo ? editUnitLogo.name : 'Új logó'}</label>
                                       <input id={`edit-logo-${unit.id}`} type="file" accept="image/*" onChange={e => setEditUnitLogo(e.target.files ? e.target.files[0] : null)} className="hidden"/>
                                   </div>
                                   <button onClick={() => handleUpdateUnit(unit.id)} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><CheckIcon className="h-5 w-5"/></button>
                                   <button onClick={cancelEditing} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><XIcon className="h-5 w-5"/></button>
                               </div>
                           ) : (
                               <>
                                <div className="flex items-center gap-4">
                                    {unit.logoUrl ? <img src={unit.logoUrl} alt={unit.name} className="h-12 w-12 rounded-md object-cover bg-gray-100" /> : <div className="h-12 w-12 rounded-md bg-gray-100 flex items-center justify-center"><BuildingIcon className="h-8 w-8 text-gray-400"/></div>}
                                    <span className="font-semibold text-lg">{unit.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => startEditing(unit)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full" title="Szerkesztés"><PencilIcon /></button>
                                    <button onClick={() => handleDeleteUnit(unit)} className="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Törlés"><TrashIcon /></button>
                                </div>
                                </>
                           )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default EgysegekApp;
