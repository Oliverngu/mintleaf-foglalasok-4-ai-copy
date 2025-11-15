import React, { useState, useEffect } from 'react';
import { Position } from '../../../core/models/data';
import { db } from '../../../core/firebase/config';
import { collection, onSnapshot, query, orderBy, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import BriefcaseIcon from '../../../../components/icons/BriefcaseIcon';
import PencilIcon from '../../../../components/icons/PencilIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';
import CheckIcon from '../../../../components/icons/CheckIcon';
import XIcon from '../../../../components/icons/XIcon';

const PoziciokApp: React.FC = () => {
    const [positions, setPositions] = useState<Position[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newPositionName, setNewPositionName] = useState('');
    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    const [editPositionName, setEditPositionName] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'positions'), orderBy('name'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPositions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Position)));
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching positions:", error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAddPosition = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPositionName.trim()) return;
        
        await addDoc(collection(db, 'positions'), { name: newPositionName.trim() });
        setNewPositionName('');
    };

    const handleUpdatePosition = async (positionId: string) => {
        if (!editPositionName.trim()) return;
        
        await updateDoc(doc(db, 'positions', positionId), { name: editPositionName.trim() });
        setEditingPosition(null);
    };

    const handleDeletePosition = async (positionId: string) => {
        if (window.confirm('Biztosan törölni szeretnéd ezt a pozíciót?')) {
            await deleteDoc(doc(db, 'positions', positionId));
        }
    };

    const startEditing = (position: Position) => {
        setEditingPosition(position);
        setEditPositionName(position.name);
    };

    const cancelEditing = () => {
        setEditingPosition(null);
        setEditPositionName('');
    };

    if (isLoading) {
        return <div className="relative h-48"><LoadingSpinner /></div>;
    }

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <BriefcaseIcon className="h-8 w-8" />
                Pozíciók kezelése
            </h2>
            
            <form onSubmit={handleAddPosition} className="mb-6 flex gap-3">
                <input 
                    type="text"
                    value={newPositionName}
                    onChange={(e) => setNewPositionName(e.target.value)}
                    placeholder="Új pozíció neve"
                    className="w-full p-2 border rounded-lg focus:ring-green-500"
                    required
                />
                <button type="submit" className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800">
                    Hozzáadás
                </button>
            </form>

            <div className="space-y-3">
                {positions.map(pos => (
                    <div key={pos.id} className="p-3 border rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors">
                        {editingPosition?.id === pos.id ? (
                            <div className="flex-grow flex items-center gap-2">
                                <input 
                                    type="text"
                                    value={editPositionName}
                                    onChange={(e) => setEditPositionName(e.target.value)}
                                    className="p-1 border rounded-md flex-grow"
                                    autoFocus
                                />
                                <button onClick={() => handleUpdatePosition(pos.id)} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><CheckIcon className="h-5 w-5"/></button>
                                <button onClick={cancelEditing} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><XIcon className="h-5 w-5"/></button>
                            </div>
                        ) : (
                            <>
                                <span className="font-medium text-lg">{pos.name}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => startEditing(pos)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full" title="Szerkesztés"><PencilIcon /></button>
                                    <button onClick={() => handleDeletePosition(pos.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Törlés"><TrashIcon /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PoziciokApp;
