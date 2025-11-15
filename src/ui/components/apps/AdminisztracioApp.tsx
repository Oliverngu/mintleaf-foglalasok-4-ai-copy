import React, { useState } from 'react';
import { User, Unit, RolePermissions, Permissions } from '../../../core/models/data';
import { db } from '../../../core/firebase/config';
import { doc, setDoc } from 'firebase/firestore';


import FelhasznalokApp from './FelhasznalokApp';
import MeghivokApp from './MeghivokApp';
import EgysegekApp from './EgysegekApp';
import PoziciokApp from './PoziciokApp';
import JogosultsagokApp from './JogosultsagokApp';
import NotificationSettings from './NotificationSettings';


import UsersIcon from '../../../../components/icons/UsersIcon';
import InvitationIcon from '../../../../components/icons/InvitationIcon';
import BuildingIcon from '../../../../components/icons/BuildingIcon';
import BriefcaseIcon from '../../../../components/icons/BriefcaseIcon';
import ShieldIcon from '../../../../components/icons/ShieldIcon';
import SettingsIcon from '../../../../components/icons/SettingsIcon';
import CalendarOffIcon from '../../../../components/icons/CalendarOffIcon';
import BellIcon from '../icons/BellIcon';

interface AdminisztracioAppProps {
    currentUser: User;
    allUnits: Unit[];
    unitPermissions: Record<string, any>;
    activeUnitId: string | null;
    allPermissions: RolePermissions;
    canGenerateInvites: boolean;
}

type AdminTab = 'felhasznalok' | 'meghivok' | 'uzletek' | 'poziciok' | 'jogosultsagok' | 'alkalmazasok' | 'notifications';

const TABS: { id: AdminTab; label: string; icon: React.FC<{className?: string}>; roles: User['role'][] }[] = [
    { id: 'felhasznalok', label: 'Felhasználók', icon: UsersIcon, roles: ['Admin', 'Unit Admin'] },
    { id: 'meghivok', label: 'Meghívók', icon: InvitationIcon, roles: ['Admin', 'Unit Admin'] },
    { id: 'uzletek', label: 'Üzletek', icon: BuildingIcon, roles: ['Admin'] },
    { id: 'poziciok', label: 'Pozíciók', icon: BriefcaseIcon, roles: ['Admin'] },
    { id: 'jogosultsagok', label: 'Jogosultságok', icon: ShieldIcon, roles: ['Admin', 'Unit Admin'] },
    { id: 'alkalmazasok', label: 'Alkalmazások', icon: SettingsIcon, roles: ['Unit Admin'] },
    { id: 'notifications', label: 'Értesítések', icon: BellIcon, roles: ['Admin'] },
];

const APPS_TO_MANAGE = [
    { id: 'foglalasok', label: 'Foglalások' },
    { id: 'todos', label: 'Teendők' },
    { id: 'beosztas', label: 'Beosztás' },
    { id: 'elerhetosegek', label: 'Elérhetőségek' },
    { id: 'tudastar', label: 'Tudástár' },
    { id: 'velemenyek', label: 'Vélemények' },
    { id: 'berezesem', label: 'Óraszámok' },
    { id: 'kerelemek', label: 'Szabadnapok' },
];

const AppManager: React.FC<{ unitId: string; disabledApps: string[]; allUnits: Unit[] }> = ({ unitId, disabledApps, allUnits }) => {
    const [localDisabledApps, setLocalDisabledApps] = useState(disabledApps);
    const [isSaving, setIsSaving] = useState(false);
    const unitName = allUnits.find(u => u.id === unitId)?.name || 'az egység';

    const handleToggle = (appId: string) => {
        setLocalDisabledApps(prev => 
            prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]
        );
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'unit_permissions', unitId), { disabledApps: localDisabledApps }, { merge: true });
            alert('Beállítások sikeresen mentve!');
        } catch (error) {
            console.error("Error saving app settings:", error);
            alert('Hiba történt mentés közben.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800">Alkalmazások engedélyezése / tiltása</h3>
            <p className="text-gray-600 mt-1 mb-4">Válaszd ki, mely alkalmazások legyenek elérhetőek <span className="font-semibold">{unitName}</span> felhasználói számára. A letiltott alkalmazások nem jelennek meg a menüben.</p>
             <div className="space-y-3">
                {APPS_TO_MANAGE.map(app => (
                    <label key={app.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                        <span className="text-gray-700 font-medium">{app.label}</span>
                         <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                             <input
                                type="checkbox"
                                checked={!localDisabledApps.includes(app.id)}
                                onChange={() => handleToggle(app.id)}
                                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                            />
                            <span className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></span>
                         </div>
                    </label>
                ))}
            </div>
             <button onClick={handleSave} disabled={isSaving} className="mt-6 w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
                {isSaving ? 'Mentés...' : 'Beállítások mentése'}
            </button>
        </div>
    );
};


const AdminisztracioApp: React.FC<AdminisztracioAppProps> = (props) => {
    const { currentUser, activeUnitId, unitPermissions, allUnits, allPermissions } = props;
    const availableTabs = TABS.filter(tab => tab.roles.includes(currentUser.role));
    const [activeTab, setActiveTab] = useState<AdminTab>(availableTabs[0]?.id || 'felhasznalok');
    
    const renderContent = () => {
        if (!activeUnitId && (activeTab === 'jogosultsagok' || activeTab === 'alkalmazasok')) {
             return (
                <div className="p-8 text-center bg-white rounded-2xl shadow-md border">
                    <h2 className="text-xl font-bold text-gray-700">Nincs egység kiválasztva</h2>
                    <p className="mt-2 text-gray-600">Ennek a funkciónak a használatához válassz ki pontosan egy egységet a fejlécben.</p>
                </div>
            );
        }

        switch (activeTab) {
            case 'felhasznalok':
                return <FelhasznalokApp currentUser={currentUser} canGenerateInvites={props.canGenerateInvites} />;
            case 'meghivok':
                return <MeghivokApp />;
            case 'uzletek':
                return <EgysegekApp />;
            case 'poziciok':
                return <PoziciokApp />;
            case 'jogosultsagok':
                return <JogosultsagokApp currentUser={currentUser} allPermissions={allPermissions} unitPermissions={unitPermissions} activeUnitId={activeUnitId} />;
            case 'alkalmazasok':
                return <AppManager unitId={activeUnitId!} disabledApps={unitPermissions[activeUnitId!]?.disabledApps || []} allUnits={allUnits} />;
            case 'notifications':
                return <NotificationSettings currentUser={currentUser} />;
            default:
                return null;
        }
    };

    return (
        <div className="p-4 md:p-8">
             <style>{`
                .toggle-checkbox:checked { right: 0; border-color: #16a34a; }
                .toggle-checkbox:checked + .toggle-label { background-color: #16a34a; }
            `}</style>
            <div className="flex flex-col md:flex-row gap-8">
                <aside className="md:w-64 flex-shrink-0">
                    <nav className="flex flex-row overflow-x-auto md:overflow-x-visible md:flex-col gap-2 bg-white p-4 rounded-2xl shadow-md border">
                        {availableTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center p-3 rounded-lg text-base font-medium transition-colors whitespace-nowrap ${
                                    activeTab === tab.id ? 'bg-green-700 text-white shadow' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                            >
                                <tab.icon className="h-6 w-6 mr-3" />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </aside>
                <main className="flex-1 min-w-0">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
};

export default AdminisztracioApp;