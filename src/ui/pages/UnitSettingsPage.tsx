import React, { useMemo, useState } from 'react';
import { RolePermissions, Unit, User } from '../../core/models/data';
import EmailSettingsApp from '../components/admin/EmailSettingsApp';
import PoziciokApp from '../components/apps/PoziciokApp';
import NotificationSettings from '../components/apps/NotificationSettings';
import JogosultsagokApp from '../components/apps/JogosultsagokApp';
import ReservationSettingsForm from '../components/apps/ReservationSettingsForm';
import { useUnitContext } from '../context/UnitContext';

export type UnitSettingsTab =
  | 'email'
  | 'positions'
  | 'notifications'
  | 'permissions'
  | 'reservations';

interface UnitSettingsPageProps {
  currentUser: User;
  allUnits: Unit[];
  allPermissions: RolePermissions;
  unitPermissions: Record<string, any>;
  activeUnitIds: string[];
  unitId?: string;
}

const UnitSettingsPage: React.FC<UnitSettingsPageProps> = ({
  currentUser,
  allUnits,
  allPermissions,
  unitPermissions,
  activeUnitIds,
  unitId,
}) => {
  const { selectedUnits } = useUnitContext();
  const [activeTab, setActiveTab] = useState<UnitSettingsTab>('email');

  const effectiveUnitId = useMemo(() => {
    return unitId || selectedUnits[0] || activeUnitIds[0] || allUnits[0]?.id || null;
  }, [unitId, selectedUnits, activeUnitIds, allUnits]);

  const resolvedUnit = useMemo(
    () => allUnits.find((u) => u.id === effectiveUnitId),
    [allUnits, effectiveUnitId]
  );

  const tabs: { id: UnitSettingsTab; label: string }[] = [
    { id: 'email', label: 'Email beállítások' },
    { id: 'positions', label: 'Pozíciók' },
    { id: 'notifications', label: 'Értesítések' },
    { id: 'permissions', label: 'Jogosultságok' },
    { id: 'reservations', label: 'Foglalások' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'email':
        return <EmailSettingsApp currentUser={currentUser} allUnits={allUnits} />;
      case 'positions':
        return <PoziciokApp />;
      case 'notifications':
        return <NotificationSettings currentUser={currentUser} />;
      case 'permissions':
        return (
          <JogosultsagokApp
            currentUser={currentUser}
            allPermissions={allPermissions}
            unitPermissions={unitPermissions}
            activeUnitId={effectiveUnitId}
          />
        );
      case 'reservations':
        return effectiveUnitId ? (
          <ReservationSettingsForm unitId={effectiveUnitId} layout="page" />
        ) : (
          <div className="p-6 bg-white rounded-xl shadow-sm border">Válassz ki egy egységet a beállítások szerkesztéséhez.</div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-800">Üzlet beállítások</h1>
        <p className="text-gray-600">
          Központi hely az egység kommunikációs, pozíció, értesítési és foglalási beállításainak kezeléséhez.
        </p>
        {resolvedUnit && (
          <p className="text-sm text-gray-500">Aktív egység: {resolvedUnit.name}</p>
        )}
      </div>

      <div className="flex gap-3 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2 px-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[60vh]">{renderContent()}</div>
    </div>
  );
};

export default UnitSettingsPage;
