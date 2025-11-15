import React, { useState, useEffect, useMemo } from 'react';
import { Invitation, Unit, Position, User } from '../../../core/models/data';
import { db, serverTimestamp } from '../../../core/firebase/config';
import { collection, onSnapshot, query, orderBy, addDoc, doc, deleteDoc, getDocs, where, setDoc } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import PlusIcon from '../../../../components/icons/PlusIcon';
import CopyIcon from '../../../../components/icons/CopyIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';

const CreateInviteModal: React.FC<{
  units: Unit[];
  positions: Position[];
  onClose: () => void;
}> = ({ units, positions, onClose }) => {
  const [formData, setFormData] = useState({
    role: 'User' as User['role'],
    unitId: '',
    position: '',
    prefilledLastName: '',
    prefilledFirstName: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.unitId || !formData.position || !formData.role) {
      setError('Az egység, pozíció és szerepkör kitöltése kötelező.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      const newInviteRef = doc(collection(db, 'invitations'));
      await setDoc(newInviteRef, {
        code: newInviteRef.id, // Using the doc ID as the code
        ...formData,
        status: 'active',
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Hiba történt a meghívó létrehozása közben.');
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b">
            <h2 className="text-xl font-bold text-gray-800">Új meghívó link generálása</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Egység</label><select name="unitId" value={formData.unitId} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg bg-white" required><option value="" disabled>Válassz...</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                <div><label className="text-sm font-medium">Pozíció</label><select name="position" value={formData.position} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg bg-white" required><option value="" disabled>Válassz...</option>{positions.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
            </div>
            <div>
                <label className="text-sm font-medium">Szerepkör</label>
                <select name="role" value={formData.role} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg bg-white">
                  <option value="User">User</option>
                  <option value="Unit Leader">Unit Leader</option>
                  <option value="Guest">Guest (Vendég)</option>
                  <option value="Unit Admin">Unit Admin</option>
                  <option value="Admin">Admin (Super Admin)</option>
                </select>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Vezetéknév (opcionális)</label><input type="text" name="prefilledLastName" value={formData.prefilledLastName} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" placeholder="Kitölti a regisztrációs űrlapot"/></div>
                <div><label className="text-sm font-medium">Keresztnév (opcionális)</label><input type="text" name="prefilledFirstName" value={formData.prefilledFirstName} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg"/></div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
          <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
            <button type="submit" disabled={isSubmitting} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">{isSubmitting ? 'Generálás...' : 'Link generálása'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};


const MeghivokApp: React.FC = () => {
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    useEffect(() => {
        const unsubInvites = onSnapshot(query(collection(db, 'invitations'), orderBy('createdAt', 'desc')), snapshot => {
            setInvitations(snapshot.docs.map(d => ({id: d.id, ...d.data()} as Invitation)));
            setLoading(false);
        });
        const unsubUnits = onSnapshot(collection(db, 'units'), snapshot => setUnits(snapshot.docs.map(d => ({id: d.id, ...d.data()} as Unit))));
        const unsubPositions = onSnapshot(query(collection(db, 'positions'), orderBy('name')), snapshot => setPositions(snapshot.docs.map(d => ({id: d.id, ...d.data()} as Position))));
        const unsubUsers = onSnapshot(collection(db, 'users'), snapshot => setUsers(snapshot.docs.map(d => ({id: d.id, ...d.data()} as User))));

        return () => { unsubInvites(); unsubUnits(); unsubPositions(); unsubUsers(); };
    }, []);

    const handleCopyLink = (code: string) => {
        const link = `${window.location.origin}?register=${code}`;
        navigator.clipboard.writeText(link);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleRevoke = async (id: string) => {
        if (window.confirm('Biztosan visszavonod ezt a meghívót? A link érvénytelenné válik.')) {
            await deleteDoc(doc(db, 'invitations', id));
        }
    };

    const getUnitName = (id: string) => units.find(u => u.id === id)?.name || 'Ismeretlen';
    const getUserName = (id: string) => users.find(u => u.id === id)?.fullName || 'Ismeretlen';

    if (loading) {
        return <div className="relative h-64"><LoadingSpinner /></div>;
    }

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            {isModalOpen && <CreateInviteModal units={units} positions={positions} onClose={() => setIsModalOpen(false)} />}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Meghívók</h2>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800">
                    <PlusIcon /> Új meghívó
                </button>
            </div>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th scope="col" className="px-6 py-3">Státusz</th>
                            <th scope="col" className="px-6 py-3">Jogosultság</th>
                            <th scope="col" className="px-6 py-3">Létrehozva</th>
                            <th scope="col" className="px-6 py-3">Felhasználva</th>
                            <th scope="col" className="px-6 py-3">Műveletek</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invitations.map(invite => (
                             <tr key={invite.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 font-semibold rounded-full text-xs ${invite.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                                        {invite.status === 'active' ? 'Aktív' : 'Felhasznált'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    {getUnitName(invite.unitId)} / {invite.position}
                                    <span className="block text-xs font-normal text-gray-500">Szerepkör: {invite.role}</span>
                                </td>
                                <td className="px-6 py-4">{invite.createdAt?.toDate().toLocaleDateString('hu-HU')}</td>
                                <td className="px-6 py-4">{invite.usedAt ? `${getUserName(invite.usedBy || '')} - ${invite.usedAt.toDate().toLocaleDateString('hu-HU')}` : '-'}</td>
                                <td className="px-6 py-4 flex items-center gap-2">
                                    {invite.status === 'active' && (
                                        <>
                                            <button onClick={() => handleCopyLink(invite.id)} className="flex items-center gap-1 text-blue-600 font-semibold text-xs">
                                                <CopyIcon className="h-4 w-4" /> {copiedCode === invite.id ? 'Másolva!' : 'Link másolása'}
                                            </button>
                                            <button onClick={() => handleRevoke(invite.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Visszavonás"><TrashIcon className="h-4 w-4" /></button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MeghivokApp;
