import React, { useState } from 'react';
import { Unit, Position, User } from '../../data/mockData';
import { db } from '../../firebase/config';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import EyeIcon from '../icons/EyeIcon';
import EyeSlashIcon from '../icons/EyeSlashIcon';

const firebaseConfig = {
  apiKey: "AIzaSyCB7ZTAhDlRwueGW6jqDdMqmpfHOI62mtE",
  authDomain: "mintleaf-74d27.firebaseapp.com",
  projectId: "mintleaf-74d27",
  storageBucket: "mintleaf-74d27.appspot.com",
  messagingSenderId: "1053273095803",
  appId: "1:1053273095803:web:84670303a5324c0d816cde",
  measurementId: "G-2Y86CZ0633"
};

interface AddUserModalProps {
  units: Unit[];
  positions: Position[];
  onClose: () => void;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ units, positions, onClose }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'User' as User['role'],
    unitIds: [] as string[],
    position: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleUnitChange = (unitId: string) => {
    setFormData(prev => {
        const newUnitIds = prev.unitIds.includes(unitId)
            ? prev.unitIds.filter(id => id !== unitId)
            : [...prev.unitIds, unitId];
        return { ...prev, unitIds: newUnitIds };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('A két jelszó nem egyezik.');
      return;
    }
    if (formData.password.length < 6) {
        setError('A jelszónak legalább 6 karakter hosszúnak kell lennie.');
        return;
    }
    if (formData.unitIds.length === 0) {
        setError('Legalább egy egységet ki kell választani.');
        return;
    }


    setIsSubmitting(true);

    const secondaryAppName = 'addUserAuth';
    let secondaryApp;

    try {
        // Check if username is unique
        const usernameQuery = query(collection(db, 'users'), where('name', '==', formData.name.trim()));
        const usernameSnapshot = await getDocs(usernameQuery);
        if (!usernameSnapshot.empty) {
            throw new Error('Ez a felhasználónév már foglalt.');
        }

        const emailToUse = formData.email.trim() || `${formData.name.trim()}@noemail.provided`;

        // Initialize secondary app to create user without logging out admin
        secondaryApp = getApps().find(app => app.name === secondaryAppName) || initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);

        // Create user in Auth
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailToUse, formData.password);
        const newUser = userCredential.user;

        if (!newUser) {
            throw new Error('Firebase Auth user creation failed.');
        }

        // Create user document in Firestore
        const nameParts = formData.fullName.trim().split(' ');
        const firstName = nameParts.pop() || '';
        const lastName = nameParts.join(' ');

        const userData = {
            fullName: formData.fullName.trim(),
            lastName: lastName,
            firstName: firstName,
            name: formData.name.trim(),
            email: emailToUse,
            role: formData.role,
            unitIds: formData.unitIds,
            position: formData.position,
        };
        await setDoc(doc(db, 'users', newUser.uid), userData);

        // Clean up: sign out from secondary app and delete it
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);

        onClose();

    } catch (err: any) {
      let errorMessage = 'Hiba történt a felhasználó létrehozása során.';
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'Ez az email cím már használatban van.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      console.error(err);
      
      // Clean up secondary app on failure as well
      const appToDelete = getApps().find(app => app.name === secondaryAppName);
      if (appToDelete) {
        await signOut(getAuth(appToDelete)).catch(() => {}); // Sign out might fail if no user
        await deleteApp(appToDelete);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b">
            <h2 className="text-xl font-bold text-gray-800">Új felhasználó létrehozása</h2>
          </div>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Teljes Név</label><input type="text" name="fullName" value={formData.fullName} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required /></div>
              <div><label className="text-sm font-medium">Felhasználónév</label><input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" required /></div>
            </div>
             <div><label className="text-sm font-medium">Email cím (opcionális)</label><input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg" /><p className="text-xs text-gray-500 mt-1">Ha üresen hagyod, a felhasználó a felhasználónevével tud majd bejelentkezni.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div className="relative">
                 <label className="text-sm font-medium">Jelszó</label>
                 <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg pr-10" required />
                 <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute bottom-2 right-2 p-1 text-gray-500"><EyeIcon /></button>
              </div>
              <div className="relative">
                 <label className="text-sm font-medium">Jelszó megerősítése</label>
                 <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg pr-10" required />
                 <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute bottom-2 right-2 p-1 text-gray-500"><EyeIcon /></button>
              </div>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div>
                <label className="text-sm font-medium">Pozíció</label>
                <select name="position" value={formData.position} onChange={handleChange} className="w-full mt-1 p-2 border rounded-lg bg-white" required>
                  <option value="" disabled>Válassz...</option>
                  {positions.map(pos => <option key={pos.id} value={pos.name}>{pos.name}</option>)}
                </select>
              </div>
            </div>
            <div>
                <label className="text-sm font-medium">Egységek</label>
                 <div className="mt-2 space-y-2 border p-3 rounded-lg max-h-40 overflow-y-auto">
                    {units.map(unit => (
                        <label key={unit.id} className="flex items-center">
                            <input
                                type="checkbox"
                                checked={formData.unitIds.includes(unit.id)}
                                onChange={() => handleUnitChange(unit.id)}
                                className="h-4 w-4 rounded text-green-600 focus:ring-green-500"
                            />
                            <span className="ml-2 text-gray-700">{unit.name}</span>
                        </label>
                    ))}
                </div>
            </div>
            {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
          </div>
          <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
            <button type="submit" disabled={isSubmitting} className="bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400">{isSubmitting ? 'Létrehozás...' : 'Felhasználó létrehozása'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUserModal;