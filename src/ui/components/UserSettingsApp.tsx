import React, { useState } from 'react';
import { User } from '../../core/models/data';
import { auth, db } from '../../core/firebase/config';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import EyeIcon from './icons/EyeIcon';
import EyeSlashIcon from './icons/EyeSlashIcon';

interface UserSettingsAppProps {
  user: User | null;
  onLogout: () => void;
}

const UserSettingsApp: React.FC<UserSettingsAppProps> = ({ user, onLogout }) => {
  const [newLastName, setNewLastName] = useState(user?.lastName || '');
  const [newFirstName, setNewFirstName] = useState(user?.firstName || '');
  const [newUsername, setNewUsername] = useState(user?.name || '');
  
  const [newEmail, setNewEmail] = useState('');
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
  
  const [currentPasswordForPwd, setCurrentPasswordForPwd] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  
  const [showCurrentPasswordForPwd, setShowCurrentPasswordForPwd] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold text-gray-800">Hiba</h1>
        <p className="text-gray-600">A felhasználói adatok nem tölthetők be. Kérlek, jelentkezz be újra.</p>
      </div>
    );
  }

  const clearMessages = () => {
      setError(null);
      setSuccess(null);
  }

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const isNameChanged = newLastName.trim() !== user.lastName || newFirstName.trim() !== user.firstName;
    const isUsernameChanged = newUsername.trim() !== "" && newUsername.trim() !== user.name;
    
    if (!isNameChanged && !isUsernameChanged) {
        setError('Nem történt módosítás.');
        return;
    }
    
    setIsLoading(true);

    try {
        const updates: { lastName?: string; firstName?: string; fullName?: string; name?: string } = {};
        if (isNameChanged) {
            updates.lastName = newLastName.trim();
            updates.firstName = newFirstName.trim();
            updates.fullName = `${newLastName.trim()} ${newFirstName.trim()}`;
        }
        if (isUsernameChanged) updates.name = newUsername.trim();

        await updateDoc(doc(db, 'users', user.id), updates);
        
        if (isNameChanged && updates.fullName) {
            const currentUser = auth.currentUser;
            if (currentUser) {
                // Not updating profile here, as it's not a standard feature in Firebase Auth modular SDK for display name.
            }
        }
        
        setSuccess('A fiók adatai sikeresen frissültek!');
        setTimeout(() => setSuccess(null), 3000);

    } catch(err) {
        console.error("Error updating user settings:", err);
        setError("Hiba történt a mentés során.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!newEmail.trim() || !currentPasswordForEmail) {
        setError("Kérlek, add meg az új email címet és a jelenlegi jelszavadat.");
        return;
    }
    
    setIsLoadingEmail(true);
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
        setError("Felhasználó nem található, kérlek jelentkezz be újra.");
        setIsLoadingEmail(false);
        return;
    }

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPasswordForEmail);
        await reauthenticateWithCredential(currentUser, credential);
        await updateEmail(currentUser, newEmail.trim());
        await updateDoc(doc(db, 'users', user.id), { email: newEmail.trim() });
        
        setSuccess('Email cím sikeresen frissítve! A megerősítő emailt elküldtük az új címedre.');
        setNewEmail('');
        setCurrentPasswordForEmail('');
        setTimeout(() => setSuccess(null), 5000);
    
    } catch (err: any) {
        if (err.code === 'auth/wrong-password') {
            setError('Hibás jelszó.');
        } else if (err.code === 'auth/email-already-in-use') {
            setError('Ez az email cím már használatban van.');
        } else {
            setError('Hiba történt az email cím frissítése során.');
        }
        console.error("Error updating email:", err);
    } finally {
        setIsLoadingEmail(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!currentPasswordForPwd || !newPassword || !confirmNewPassword) {
        setError("Minden jelszó mező kitöltése kötelező.");
        return;
    }
    if (newPassword !== confirmNewPassword) {
        setError("Az új jelszavak nem egyeznek.");
        return;
    }
     if (newPassword.length < 6) {
        setError("Az új jelszónak legalább 6 karakter hosszúnak kell lennie.");
        return;
    }

    setIsLoadingPassword(true);
    const currentUser = auth.currentUser;
     if (!currentUser || !currentUser.email) {
        setError("Felhasználó nem található, kérlek jelentkezz be újra.");
        setIsLoadingPassword(false);
        return;
    }

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPasswordForPwd);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);

        setSuccess('Jelszó sikeresen megváltoztatva!');
        setCurrentPasswordForPwd('');
        setNewPassword('');
        setConfirmNewPassword('');
        setTimeout(() => setSuccess(null), 3000);

    } catch (err: any) {
        if (err.code === 'auth/wrong-password') {
            setError('A jelenlegi jelszavad hibás.');
        } else {
            setError('Hiba történt a jelszó frissítése során.');
        }
        console.error("Error updating password:", err);
    } finally {
        setIsLoadingPassword(false);
    }
  };


  return (
    <div className="p-4 md:p-8 space-y-8 max-w-2xl mx-auto">
        {error && <p className="text-red-500 text-sm font-semibold p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}
        {success && <p className="text-green-700 text-sm font-semibold p-3 bg-green-50 rounded-lg border border-green-200">{success}</p>}
        
        <form onSubmit={handleDetailsSubmit} className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 space-y-6">
            <h2 className="text-xl font-bold text-gray-800">Fiók adatok</h2>
            <div className="flex gap-4">
                 <div className="w-1/2">
                    <label htmlFor="newLastName" className="block text-sm font-medium text-gray-700 mb-1">Vezetéknév</label>
                    <input id="newLastName" type="text" value={newLastName} onChange={e => setNewLastName(e.target.value)} placeholder={user.lastName} className="w-full px-4 py-2 border rounded-lg bg-white text-gray-800" />
                </div>
                 <div className="w-1/2">
                    <label htmlFor="newFirstName" className="block text-sm font-medium text-gray-700 mb-1">Keresztnév</label>
                    <input id="newFirstName" type="text" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} placeholder={user.firstName} className="w-full px-4 py-2 border rounded-lg bg-white text-gray-800" />
                </div>
            </div>
            <div>
                <label htmlFor="newUsername" className="block text-sm font-medium text-gray-700 mb-1">Felhasználónév</label>
                <input id="newUsername" type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder={user.name} className="w-full px-4 py-2 border rounded-lg bg-white text-gray-800" />
            </div>
            <div className="pt-2">
                <button type="submit" disabled={isLoading} className="w-full bg-green-700 text-white font-semibold py-3 rounded-lg hover:bg-green-800 disabled:bg-gray-400">
                  {isLoading ? 'Mentés...' : 'Adatok mentése'}
                </button>
            </div>
        </form>

        <form onSubmit={handlePasswordSubmit} className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 space-y-6">
            <h2 className="text-xl font-bold text-gray-800">Jelszó megváltoztatása</h2>
            <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Jelenlegi jelszó</label>
                <input type={showCurrentPasswordForPwd ? 'text' : 'password'} value={currentPasswordForPwd} onChange={e => setCurrentPasswordForPwd(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2 border rounded-lg bg-white text-gray-800 pr-12" required />
                 <button type="button" onClick={() => setShowCurrentPasswordForPwd(!showCurrentPasswordForPwd)} className="absolute inset-y-0 right-0 top-6 px-4 flex items-center text-gray-500 hover:text-green-600">
                    {showCurrentPasswordForPwd ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
            </div>
            <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Új jelszó</label>
                <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2 border rounded-lg bg-white text-gray-800 pr-12" required />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-0 top-6 px-4 flex items-center text-gray-500 hover:text-green-600">
                    {showNewPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
            </div>
             <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Új jelszó megerősítése</label>
                <input type={showConfirmNewPassword ? 'text' : 'password'} value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2 border rounded-lg bg-white text-gray-800 pr-12" required />
                <button type="button" onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)} className="absolute inset-y-0 right-0 top-6 px-4 flex items-center text-gray-500 hover:text-green-600">
                    {showConfirmNewPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
            </div>
            <div className="pt-2">
                <button type="submit" disabled={isLoadingPassword} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
                    {isLoadingPassword ? 'Mentés...' : 'Jelszó frissítése'}
                </button>
            </div>
        </form>

        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
             <h2 className="text-xl font-bold text-gray-800">Kijelentkezés</h2>
             <p className="text-gray-600 my-4">Biztonsági okokból kijelentkezhetsz az összes eszközödről.</p>
             <button onClick={onLogout} className="w-full bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700">
                Kijelentkezés
            </button>
        </div>
    </div>
  );
};

export default UserSettingsApp;