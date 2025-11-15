import React, { useState, useEffect } from 'react';
import { User, RolePermissions, Permissions } from '../../../core/models/data';
import { db } from '../../../core/firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';

interface JogosultsagokAppProps {
    currentUser: User;
    allPermissions: RolePermissions;
    unitPermissions: Record<string, any>;
    activeUnitId: string | null;
}

const permissionLabels: Record<keyof Permissions, { label: string; description: string }> = {
    canAddBookings: { label: 'Foglalás hozzáadása', description: 'Engedélyezi új foglalások manuális rögzítését a naptárban.' },
    canManageSchedules: { label: 'Beosztás kezelése', description: 'Engedélyezi a beosztáskészítő teljes körű használatát (szerkesztés, publikálás).' },
    canManageUsers: { label: 'Felhasználók kezelése', description: 'Engedélyezi új felhasználók hozzáadását, meglévők szerkesztését és törlését.' },
    canManagePositions: { label: 'Pozíciók kezelése', description: 'Engedélyezi a pozíciók (pl. Pultos, Felszolgáló) létrehozását és törlését.' },
    canGenerateInvites: { label: 'Meghívók generálása', description: 'Engedélyezi új regisztrációs meghívó linkek létrehozását.' },
    canManageLeaveRequests: { label: 'Szabadságkérelmek kezelése', description: 'Engedélyezi a beérkezett szabadságkérelmek elfogadását és elutasítását.' },
    canSubmitLeaveRequests: { label: 'Szabadság kérése', description: 'Engedélyezi a felhasználónak, hogy szabadságot kérjen magának.' },
    canManageTodos: { label: 'Teendők kezelése', description: 'Engedélyezi új teendők felvételét és a meglévők elvégzettnek jelölését.' },
    canManageContacts: { label: 'Névjegyek kezelése', description: 'Engedélyezi a közös névjegyzék szerkesztését.' },
    canViewAllContacts: { label: 'Összes névjegy látása', description: 'Engedélyezi a rejtett (nem publikus) névjegyek megtekintését is.' },
    canManageUnits: { label: 'Üzletek kezelése', description: 'Engedélyezi új üzletek/egységek hozzáadását és a meglévők szerkesztését.' },
    canCreatePolls: { label: 'Szavazások létrehozása', description: 'Engedélyezi új szavazások kiírását az egységben.' },
};

const ROLES: User['role'][] = ['Admin', 'Unit Admin', 'Unit Leader', 'User', 'Guest'];

const JogosultsagokApp: React.FC<JogosultsagokAppProps> = ({ currentUser, allPermissions, unitPermissions, activeUnitId }) => {
    const [localGlobalPerms, setLocalGlobalPerms] = useState<RolePermissions>({});
    const [localUnitPerms, setLocalUnitPerms] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setLocalGlobalPerms(JSON.parse(JSON.stringify(allPermissions))); // Deep copy
    }, [allPermissions]);

    useEffect(() => {
        if (activeUnitId) {
            setLocalUnitPerms(JSON.parse(JSON.stringify(unitPermissions[activeUnitId] || {}))); // Deep copy
        } else {
            setLocalUnitPerms({});
        }
    }, [unitPermissions, activeUnitId]);
    
    const handleGlobalChange = (role: User['role'], perm: keyof Permissions, value: boolean) => {
        setLocalGlobalPerms(prev => {
            const newPerms = { ...prev };
            if (!newPerms[role]) newPerms[role] = {};
            newPerms[role]![perm] = value;
            return newPerms;
        });
    };
    
    const handleUnitChange = (role: User['role'], perm: keyof Permissions, value: 'inherit' | 'allow' | 'deny') => {
        setLocalUnitPerms((prev: any) => {
            const newPerms = { ...prev };
            if (!newPerms.roles) newPerms.roles = {};
            if (!newPerms.roles[role]) newPerms.roles[role] = {};

            if (value === 'inherit') {
                delete newPerms.roles[role][perm];
            } else {
                newPerms.roles[role][perm] = (value === 'allow');
            }
            return newPerms;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (currentUser.role === 'Admin') {
                await Promise.all(
                    Object.keys(localGlobalPerms).map(role => 
                        setDoc(doc(db, 'permissions', role), localGlobalPerms[role as User['role']])
                    )
                );
            }
            if (activeUnitId) {
                await setDoc(doc(db, 'unit_permissions', activeUnitId), localUnitPerms, { merge: true });
            }
            alert('Jogosultságok mentve!');
        } catch (error) {
            console.error("Error saving permissions:", error);
            alert('Hiba a mentés során.');
        } finally {
            setIsSaving(false);
        }
    };

    const isSuperAdmin = currentUser.role === 'Admin';
    const permissionKeys = Object.keys(permissionLabels) as (keyof Permissions)[];

    return (
        <div className="space-y-8">
            {isSuperAdmin && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Globális Szerepkörök</h3>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3">Jogosultság</th>
                                    {ROLES.map(role => <th key={role} className="px-4 py-3 text-center">{role}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {permissionKeys.map(permKey => (
                                    <tr key={permKey} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900" title={permissionLabels[permKey].description}>{permissionLabels[permKey].label}</td>
                                        {ROLES.map(role => (
                                            <td key={`${role}-${permKey}`} className="px-4 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={!!localGlobalPerms[role]?.[permKey]}
                                                    onChange={(e) => handleGlobalChange(role, permKey, e.target.checked)}
                                                    className="h-5 w-5 rounded"
                                                    disabled={role === 'Admin'}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
             {activeUnitId && (
                 <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Egység-specifikus felülbírálások</h3>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3">Jogosultság</th>
                                    {ROLES.map(role => <th key={role} className="px-4 py-3 text-center">{role}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                 {permissionKeys.map(permKey => (
                                    <tr key={permKey} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900" title={permissionLabels[permKey].description}>{permissionLabels[permKey].label}</td>
                                        {ROLES.map(role => {
                                            const unitPerm = localUnitPerms.roles?.[role]?.[permKey];
                                            let value: 'inherit' | 'allow' | 'deny' = 'inherit';
                                            if (unitPerm === true) value = 'allow';
                                            if (unitPerm === false) value = 'deny';
                                            
                                            return (
                                                <td key={`${role}-${permKey}`} className="px-4 py-3 text-center">
                                                    <select
                                                        value={value}
                                                        onChange={e => handleUnitChange(role, permKey, e.target.value as any)}
                                                        className={`p-1 rounded border text-xs font-semibold ${
                                                            value === 'allow' ? 'bg-green-100 text-green-800 border-green-300' :
                                                            value === 'deny' ? 'bg-red-100 text-red-800 border-red-300' :
                                                            'bg-gray-100 text-gray-800 border-gray-300'
                                                        }`}
                                                        disabled={role === 'Admin'}
                                                    >
                                                        <option value="inherit">Öröklés</option>
                                                        <option value="allow">Engedélyez</option>
                                                        <option value="deny">Tilt</option>
                                                    </select>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {isSaving ? 'Mentés...' : 'Jogosultságok mentése'}
                </button>
            </div>
        </div>
    );
};

export default JogosultsagokApp;
