import React, { useState, useEffect, useMemo } from 'react';
import { User, Unit, Position } from '../../../core/models/data';
import { db } from '../../../core/firebase/config';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import UserPlusIcon from '../../../../components/icons/UserPlusIcon';
import SearchIcon from '../../../../components/icons/SearchIcon';
import AddUserModal from './AddUserModal';
import PencilIcon from '../../../../components/icons/PencilIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';
import CheckIcon from '../../../../components/icons/CheckIcon';
import XIcon from '../../../../components/icons/XIcon';

interface FelhasznalokAppProps {
  currentUser: User;
  canGenerateInvites: boolean; // Not used here, but passed by parent
}

const FelhasznalokApp: React.FC<FelhasznalokAppProps> = ({ currentUser }) => {
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [allUnits, setAllUnits] = useState<Unit[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editFormData, setEditFormData] = useState<Partial<User>>({});

    useEffect(() => {
        const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('lastName')), snapshot => {
            const users = snapshot.docs.map(d => ({id: d.id, ...d.data(), fullName: `${d.data().lastName || ''} ${d.data().firstName || ''}`.trim()} as User));
            setAllUsers(users);
            setIsLoading(false);
        });
        const unsubUnits = onSnapshot(collection(db, 'units'), snapshot => setAllUnits(snapshot.docs.map(d => ({id: d.id, ...d.data()} as Unit))));
        const unsubPositions = onSnapshot(query(collection(db, 'positions'), orderBy('name')), snapshot => setPositions(snapshot.docs.map(d => ({id: d.id, ...d.data()} as Position))));
        return () => { unsubUsers(); unsubUnits(); unsubPositions(); };
    }, []);

    const filteredUsers = useMemo(() => allUsers.filter(user => 
        user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.position?.toLowerCase().includes(searchTerm.toLowerCase())
    ), [allUsers, searchTerm]);
    
    const usersToDisplay = useMemo(() => {
        if (currentUser.role === 'Admin') {
            return filteredUsers;
        }
        const adminUnitIds = new Set(currentUser.unitIds || []);
        return filteredUsers.filter(user => user.unitIds?.some(unitId => adminUnitIds.has(unitId)));
    }, [filteredUsers, currentUser]);

    const startEditing = (user: User) => {
        setEditingUser(user);
        setEditFormData({
            role: user.role,
            position: user.position,
            unitIds: user.unitIds || [],
        });
    };

    const cancelEditing = () => {
        setEditingUser(null);
        setEditFormData({});
    };

    const handleUpdateUser = async () => {
        if (!editingUser) return;
        await updateDoc(doc(db, 'users', editingUser.id), editFormData);
        cancelEditing();
    };

    const handleDeleteUser = async (userId: string) => {
        if(window.confirm('Biztosan törölni szeretnéd ezt a felhasználót? Ez a művelet NEM törli a bejelentkezési fiókot, csak az adatbázis bejegyzést.')) {
            await deleteDoc(doc(db, 'users', userId));
        }
    };
    
    const handleUnitChange = (unitId: string) => {
        const currentUnitIds = editFormData.unitIds || [];
        const newUnitIds = currentUnitIds.includes(unitId)
            ? currentUnitIds.filter(id => id !== unitId)
            : [...currentUnitIds, unitId];
        setEditFormData(prev => ({ ...prev, unitIds: newUnitIds }));
    };

    if (isLoading) {
        return <div className="relative h-64"><LoadingSpinner /></div>;
    }

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            {isAddModalOpen && <AddUserModal units={allUnits} positions={positions} onClose={() => setIsAddModalOpen(false)} />}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Felhasználók kezelése</h2>
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-grow">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input 
                            type="text"
                            placeholder="Keresés..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border rounded-lg"
                        />
                    </div>
                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 whitespace-nowrap">
                        <UserPlusIcon /> Új felhasználó
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th scope="col" className="px-6 py-3">Név</th>
                            <th scope="col" className="px-6 py-3">Szerepkör</th>
                            <th scope="col" className="px-6 py-3">Pozíció</th>
                            <th scope="col" className="px-6 py-3">Egységek</th>
                            <th scope="col" className="px-6 py-3 text-right">Műveletek</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usersToDisplay.map(user => (
                            <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
                                {editingUser?.id === user.id ? (
                                    <>
                                        <td className="px-6 py-4 font-medium text-gray-900">{user.fullName}</td>
                                        <td className="px-6 py-4"><select value={editFormData.role} onChange={e => setEditFormData(prev => ({...prev, role: e.target.value as User['role']}))} className="p-1 border rounded bg-white w-32"><option value="User">User</option><option value="Unit Leader">Unit Leader</option><option value="Guest">Guest</option><option value="Unit Admin">Unit Admin</option><option value="Admin">Admin</option></select></td>
                                        <td className="px-6 py-4"><select value={editFormData.position} onChange={e => setEditFormData(prev => ({...prev, position: e.target.value}))} className="p-1 border rounded bg-white w-32"><option value="">Nincs</option>{positions.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></td>
                                        <td className="px-6 py-4"><div className="flex flex-wrap gap-1 max-w-xs">{allUnits.map(unit => (<label key={unit.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={editFormData.unitIds?.includes(unit.id)} onChange={() => handleUnitChange(unit.id)} /> {unit.name}</label>))}</div></td>
                                        <td className="px-6 py-4 text-right space-x-2"><button onClick={handleUpdateUser} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><CheckIcon className="h-5 w-5"/></button><button onClick={cancelEditing} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><XIcon className="h-5 w-5"/></button></td>
                                    </>
                                ) : (
                                    <>
                                        <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{user.fullName} <br/><span className="font-normal text-gray-500">{user.email}</span></th>
                                        <td className="px-6 py-4">{user.role}</td>
                                        <td className="px-6 py-4">{user.position}</td>
                                        <td className="px-6 py-4">{user.unitIds?.map(uid => allUnits.find(u => u.id === uid)?.name).join(', ')}</td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button onClick={() => startEditing(user)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full" title="Szerkesztés"><PencilIcon /></button>
                                            {currentUser.id !== user.id && <button onClick={() => handleDeleteUser(user.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Törlés"><TrashIcon /></button>}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FelhasznalokApp;
