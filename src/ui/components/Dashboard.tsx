import React, { useState, useEffect, useMemo } from 'react';
import {
  User, Request, Shift, Todo, Unit, RolePermissions, Permissions, TimeEntry, Feedback, Poll,
} from '../../core/models/data';

// --- FIREBASE IMPORTOK ---
import { db, auth } from '../../core/firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

// Import App Components
import { KerelemekApp } from './apps/KerelemekApp';
import FoglalasokApp from './apps/FoglalasokApp';
import { BeosztasApp } from './apps/BeosztasKeszitoApp';
import UserSettingsApp from './apps/UserSettingsApp';
import TodoApp from './apps/TodoApp';
import AdminTodoApp from './apps/AdminTodoApp';
import ContactsApp from './apps/ContactsApp';
import TudastarApp from './apps/TudastarApp';
import VelemenyekApp from './apps/VelemenyekApp';
import { BerezesemApp } from './apps/BerezesemApp';
import AdminisztracioApp from './apps/AdminisztracioApp';
import HomeDashboard from './HomeDashboard';
import PollsApp from './polls/PollsApp';
import ChatApp from './apps/ChatApp';
import { KeszletApp } from './apps/KeszletApp';
import UnitSettingsPage from '../pages/UnitSettingsPage';

// Import Icons
import HomeIcon from '../../../components/icons/HomeIcon';
import CalendarIcon from '../../../components/icons/CalendarIcon';
import BookingIcon from '../../../components/icons/BookingIcon';
import ScheduleIcon from '../../../components/icons/ScheduleIcon';
import SettingsIcon from '../../../components/icons/SettingsIcon';
import LogoutIcon from '../../../components/icons/LogoutIcon';
import MenuIcon from '../../../components/icons/MenuIcon';
import MintLeafLogo from '../../../components/icons/AppleLogo';
import LoadingSpinner from '../../../components/LoadingSpinner';
import TodoIcon from '../../../components/icons/TodoIcon';
import AdminTodoIcon from '../../../components/icons/AdminTodoIcon';
import ContactsIcon from '../../../components/icons/ContactsIcon';
import BookIcon from '../../../components/icons/BookIcon';
import FeedbackIcon from '../../../components/icons/FeedbackIcon';
import MoneyIcon from '../../../components/icons/MoneyIcon';
import AdminIcon from '../../../components/icons/AdminIcon';
import PollsIcon from '../../../components/icons/PollsIcon';
import ChatIcon from '../../../components/icons/ChatIcon';
import BriefcaseIcon from '../../../components/icons/BriefcaseIcon';
import ArrowDownIcon from '../../../components/icons/ArrowDownIcon';
import Cog6ToothIcon from '../../../components/icons/Cog6ToothIcon';

import { useUnitContext } from '../context/UnitContext';
import { ThemeMode, ThemeBases } from '../../core/theme/types';
import ThemeSelector from './dashboard/ThemeSelector';

interface DashboardProps {
  currentUser: User | null;
  onLogout: () => void;
  isDemoMode: boolean;
  requests: Request[];
  shifts: Shift[];
  todos: Todo[];
  adminTodos: Todo[];
  allUnits: Unit[];
  allUsers: User[];
  permissions: RolePermissions;
  unitPermissions: Record<string, any>;
  timeEntries: TimeEntry[];
  feedbackList: Feedback[];
  polls: Poll[];
  firestoreError?: string | null;
  
  // Theme Props
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  themeBases: ThemeBases;
  onThemeBasesChange: (bases: ThemeBases) => void;
  useBrandTheme: boolean;
  onBrandChange: (enabled: boolean) => void;
}

type AppName = 'home' | 'kerelemek' | 'foglalasok' | 'beosztas' | 'settings' | 'todos' | 'admin_todos' | 'elerhetosegek' | 'tudastar' | 'keszlet' | 'velemenyek' | 'berezesem' | 'unit_settings' | 'adminisztracio' | 'szavazasok' | 'chat';

const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  onLogout,
  isDemoMode,
  requests,
  shifts,
  todos,
  adminTodos,
  allUnits,
  allUsers,
  permissions,
  unitPermissions,
  timeEntries,
  feedbackList,
  polls,
  firestoreError,
  themeMode,
  onThemeModeChange,
  themeBases,
  onThemeBasesChange,
  useBrandTheme,
  onBrandChange
}) => {
  const [activeApp, setActiveApp] = useState<AppName>('home');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({ altalanos: true, feladatok: true, kommunikacio: true, adminisztracio: true });

  const { selectedUnits: activeUnitIds, setSelectedUnits: setActiveUnitIds } = useUnitContext();

  const activeUnit = useMemo(() => (activeUnitIds.length ? allUnits.find(u => u.id === activeUnitIds[0]) || null : null), [activeUnitIds, allUnits]);

  // --- AUTOMATIKUS UNIT VÁLASZTÁS JAVÍTVA ---
  // Ha a user belép, és még nincs kiválasztva semmi, kiválasztjuk az összes hozzá tartozó egységet.
  // Ez azért fontos, mert enélkül az adatlisták üresek (filter miatt).
  useEffect(() => {
    // Ha már van kiválasztás, nem nyúlunk hozzá
    if (activeUnitIds.length > 0) return;

    if (currentUser && allUnits.length > 0) {
      const preferredUnitIds = (currentUser.unitIds && currentUser.unitIds.length > 0)
        ? currentUser.unitIds
        : allUnits.map(u => u.id);

      const unitsToSelect = preferredUnitIds.filter(id => allUnits.some(u => u.id === id));

      if (unitsToSelect.length > 0) {
        console.log("Auto-selecting units for data visibility:", unitsToSelect);
        setActiveUnitIds(unitsToSelect);
      }
    }
  }, [activeUnitIds.length, allUnits, currentUser, setActiveUnitIds]);

  // Sidebar State Mentés
  const categoryStorageKey = useMemo(() => (currentUser ? `mintleaf_sidebar_categories_${currentUser.id}` : null), [currentUser]);
  useEffect(() => {
    if (categoryStorageKey) {
      try {
        const savedState = localStorage.getItem(categoryStorageKey);
        if (savedState) setOpenCategories(JSON.parse(savedState));
      } catch (e) { console.error('Sidebar load error', e); }
    }
  }, [categoryStorageKey]);
  useEffect(() => {
    if (categoryStorageKey) localStorage.setItem(categoryStorageKey, JSON.stringify(openCategories));
  }, [openCategories, categoryStorageKey]);

  const toggleCategory = (category: string) => setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));

  if (!currentUser) return <div className="fixed inset-0 flex items-center justify-center"><LoadingSpinner /></div>;

  const hasPermission = (permission: keyof Permissions | 'canManageAdminPage'): boolean => {
    if (currentUser.role === 'Admin') return true;
    if (currentUser.role === 'Demo User') {
      if (typeof permission === 'string') return permission.startsWith('canView') || permission === 'canSubmitLeaveRequests';
      return false;
    }
    if (permission === 'canManageAdminPage') {
      return currentUser.role === 'Unit Admin' || hasPermission('canManageUsers') || hasPermission('canManagePositions') || hasPermission('canManageUnits');
    }
    let unitPermissionValue: boolean | undefined = undefined;
    for (const unitId of activeUnitIds) {
      const perm = unitPermissions[unitId]?.roles?.[currentUser.role]?.[permission];
      if (perm === true) return true;
      if (perm === false) unitPermissionValue = false;
    }
    if (unitPermissionValue === false) return false;
    const globalPerms = permissions[currentUser.role];
    if (!globalPerms) return false;
    return globalPerms[permission as keyof Permissions] || false;
  };

  const UnitSelector = () => {
    if (allUnits.length === 0) return <div className="text-white px-2">Betöltés...</div>;

    // Admin lásson mindent, User csak a sajátját
    const visibleUnits = currentUser.role === 'Admin'
      ? allUnits
      : allUnits.filter(u => currentUser.unitIds?.includes(u.id));

    const allVisibleUnitIds = visibleUnits.map(u => u.id);

    const handleSelection = (unitId: string) => {
      setActiveUnitIds(prev => prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]);
    };

    const toggleAllUnits = () => {
      setActiveUnitIds(prev => {
        const hasAllSelected = allVisibleUnitIds.length > 0 && allVisibleUnitIds.every(id => prev.includes(id));
        return hasAllSelected ? [] : allVisibleUnitIds;
      });
    };

    return (
      <div className="flex items-center gap-2 overflow-x-auto py-2 -my-2 scrollbar-hide">
        {allVisibleUnitIds.length > 1 && (
          <button
            onClick={toggleAllUnits}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
              allVisibleUnitIds.length > 0 && allVisibleUnitIds.every(id => activeUnitIds.includes(id))
                ? 'bg-white text-green-800 shadow-md'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            Összes
          </button>
        )}

        {visibleUnits.map(unit => (
          <button
            key={unit.id}
            onClick={() => handleSelection(unit.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
              activeUnitIds.includes(unit.id) ? 'bg-white text-green-800 shadow-md' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {unit.name}
          </button>
        ))}
      </div>
    );
  };

  const NavItem: React.FC<any> = ({ app, icon: Icon, label, permission, disabledAppCheck = true }) => {
    if (permission && !hasPermission(permission)) return null;
    const isAppDisabled = disabledAppCheck && activeUnitIds.some(unitId => unitPermissions[unitId]?.disabledApps?.includes(app));
    if (isAppDisabled && currentUser.role !== 'Admin') return null;
    const isActive = activeApp === app;
    return (
      <button 
        onClick={() => { setActiveApp(app); setSidebarOpen(false); }} 
        className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors duration-200 
          ${isActive ? 'shadow-inner bg-[var(--color-secondary)]' : 'hover:bg-black/5'}`} 
        style={{ 
            color: isActive ? 'var(--color-text-on-primary)' : 'inherit'
        }} 
        title={label}
      >
        <Icon className="h-6 w-6" /> <span className="ml-4 font-semibold text-base whitespace-nowrap">{label}</span>
      </button>
    );
  };

  const CategoryItem: React.FC<any> = ({ name, label, icon: Icon, children }) => {
    const isOpen = !!openCategories[name];
    const hasVisibleChildren = React.Children.toArray(children).some(child => child !== null);
    if (!hasVisibleChildren) return null;
    return (
      <div>
        <button 
            onClick={() => toggleCategory(name)} 
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 transition-colors duration-200" 
            aria-expanded={isOpen} 
            style={{ color: 'inherit' }}
        >
          <div className="flex items-center"><Icon className="h-6 w-6" /><span className="ml-4 font-bold text-base whitespace-nowrap">{label}</span></div>
          <ArrowDownIcon className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && <div className="pl-6 mt-1 space-y-1 border-l-2 ml-5" style={{ borderColor: 'var(--color-border)' }}>{children}</div>}
      </div>
    );
  };

  const renderApp = () => {
    switch (activeApp) {
      case 'home':
        return (
          <HomeDashboard
            currentUser={currentUser}
            requests={requests}
            schedule={shifts}
            todos={todos}
            adminTodos={adminTodos}
            timeEntries={timeEntries}
            setActiveApp={setActiveApp}
            feedbackList={feedbackList}
            polls={polls}
            activeUnitIds={activeUnitIds}
            allUnits={allUnits}
            // Theme Props
            themeMode={themeMode}
            onThemeChange={onThemeModeChange}
            themeBases={themeBases}
            onThemeBasesChange={onThemeBasesChange}
            activeUnit={activeUnit}
            useBrandTheme={useBrandTheme}
            onBrandChange={onBrandChange}
          />
        );
      case 'kerelemek': return <KerelemekApp requests={requests} loading={false} error={null} currentUser={currentUser} canManage={hasPermission('canManageLeaveRequests')} />;
      case 'foglalasok': return <FoglalasokApp currentUser={currentUser} canAddBookings={hasPermission('canAddBookings')} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
      case 'beosztas': return <BeosztasApp schedule={shifts} requests={requests} currentUser={currentUser} canManage={hasPermission('canManageSchedules')} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
      case 'settings': return <UserSettingsApp user={currentUser} onLogout={onLogout} />;
      case 'todos': return <TodoApp todos={todos} loading={false} error={null} currentUser={currentUser} allUsers={allUsers} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
      case 'chat': return <ChatApp currentUser={currentUser} allUsers={allUsers} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
      case 'admin_todos': return <AdminTodoApp todos={adminTodos} loading={false} error={null} currentUser={currentUser} />;
      case 'elerhetosegek': return <ContactsApp currentUser={currentUser} canManage={hasPermission('canManageContacts')} canViewAll={hasPermission('canViewAllContacts')} />;
      case 'tudastar': return <TudastarApp currentUser={currentUser} allUnits={allUnits} activeUnitIds={activeUnitIds} canManageContent={hasPermission('canManageKnowledgeBase')} canManageCategories={hasPermission('canManageKnowledgeCategories')} />;
      case 'keszlet': return <KeszletApp selectedUnitIds={activeUnitIds} allUnits={allUnits} userUnitIds={currentUser.unitIds || []} currentUserId={currentUser.id} currentUserName={currentUser.fullName} isUnitAdmin={currentUser.role === 'Admin' || currentUser.role === 'Unit Admin'} canViewInventory={hasPermission('canViewInventory')} canManageInventory={hasPermission('canManageInventory')} />;
      case 'velemenyek': return <VelemenyekApp currentUser={currentUser} allUnits={allUnits} activeUnitIds={activeUnitIds} feedbackList={feedbackList} />;
      case 'berezesem': return <BerezesemApp currentUser={currentUser} schedule={shifts} activeUnitIds={activeUnitIds} timeEntries={timeEntries} allUnits={allUnits} />;
      case 'szavazasok': return <PollsApp currentUser={currentUser} canCreatePolls={hasPermission('canCreatePolls')} polls={polls} />;
      case 'unit_settings': return <UnitSettingsPage currentUser={currentUser} allUnits={allUnits} allPermissions={permissions} unitPermissions={unitPermissions} activeUnitIds={activeUnitIds} />;
      case 'adminisztracio': return <AdminisztracioApp currentUser={currentUser} allUnits={allUnits} unitPermissions={unitPermissions} activeUnitId={activeUnitIds.length === 1 ? activeUnitIds[0] : null} allPermissions={permissions} canGenerateInvites={hasPermission('canManageUsers')} />;
      default: return null;
    }
  };

  const isChatLayout = activeApp === 'chat';
  const mainOverflowClass = isSidebarOpen || isChatLayout ? 'overflow-y-hidden' : 'overflow-y-auto';

  return (
    <div 
        className="relative h-full overflow-hidden flex flex-col transition-colors duration-200" 
        style={{ 
            backgroundColor: 'var(--color-background)', 
            backgroundImage: 'var(--ui-bg-image)', 
            backgroundSize: 'cover', 
            backgroundAttachment: 'fixed', 
            backgroundPosition: 'center', 
            color: 'var(--color-text-main)' 
        }}
    >
        {/* Backdrop for sidebar */}
        {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-20" onClick={() => setSidebarOpen(false)} aria-hidden="true"></div>}

        {/* Sidebar */}
        <aside
            className={`fixed inset-y-0 left-0 z-30 border-r transform transition-transform duration-300 ease-in-out flex flex-col shadow-xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-64`}
            style={{
                backgroundColor: 'var(--color-sidebar-bg) !important' as any, // !important hogy felülírja a Tailwindet
                color: 'var(--color-sidebar-text)',
                borderColor: 'var(--color-border)',
            }}
        >
            <div className="flex items-center justify-center h-16 px-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                  <MintLeafLogo className="h-8 w-8" style={{ color: 'var(--color-primary)' }} />
                  <span className="font-bold text-xl">MintLeaf</span>
              </div>
            </div>
            
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-hide">
                <NavItem app="home" icon={HomeIcon} label="Kezdőlap" disabledAppCheck={false} />
                <CategoryItem name="altalanos" label="Általános" icon={ScheduleIcon}>
                    <NavItem app="beosztas" icon={ScheduleIcon} label="Beosztás" />
                    <NavItem app="foglalasok" icon={BookingIcon} label="Foglalások" />
                    <NavItem app="berezesem" icon={MoneyIcon} label="Óraszámok" />
                    <NavItem app="kerelemek" icon={CalendarIcon} label="Szabadnapok" permission="canSubmitLeaveRequests" />
                </CategoryItem>
                <CategoryItem name="feladatok" label="Feladatok" icon={TodoIcon}>
                    <NavItem app="todos" icon={TodoIcon} label="Teendők" />
                    {currentUser.role === 'Admin' && <NavItem app="admin_todos" icon={AdminTodoIcon} label="Vezetői Teendők" />}
                    <NavItem app="tudastar" icon={BookIcon} label="Tudástár" />
                    {(hasPermission('canViewInventory') || hasPermission('canManageInventory')) && <NavItem app="keszlet" icon={BriefcaseIcon} label="Készlet" />}
                    <NavItem app="elerhetosegek" icon={ContactsIcon} label="Kapcsolatok" />
                </CategoryItem>
                <CategoryItem name="kommunikacio" label="Kommunikáció" icon={ChatIcon}>
                    <NavItem app="chat" icon={ChatIcon} label="Chat" />
                    <NavItem app="szavazasok" icon={PollsIcon} label="Szavazások" />
                    <NavItem app="velemenyek" icon={FeedbackIcon} label="Vélemények" />
                </CategoryItem>
                <NavItem app="unit_settings" icon={Cog6ToothIcon} label="Üzlet Beállítások" permission="canManageAdminPage" disabledAppCheck={false} />
                <NavItem app="adminisztracio" icon={AdminIcon} label="Adminisztráció" permission="canManageAdminPage" disabledAppCheck={false} />
            </nav>

            <div className="p-3 border-t border-gray-200/20 space-y-1 flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
              <button onClick={() => { setActiveApp('settings'); setSidebarOpen(false); }} className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors duration-200 ${activeApp === 'settings' ? 'shadow-inner bg-[var(--color-secondary)] text-[var(--color-text-on-primary)]' : 'hover:bg-black/5'}`} style={{ color: activeApp === 'settings' ? 'var(--color-text-on-primary)' : 'inherit' }}>
                <SettingsIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-2 text-center opacity-60 text-xs">Beta version by Oliver Nguyen</div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 min-h-0 overflow-x-hidden ${mainOverflowClass} bg-transparent`}>
           {firestoreError && <div className="sticky top-0 z-50 m-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded-r-lg shadow-lg"><p className="font-bold">Hiba</p><p>{firestoreError}</p></div>}
           
           {/* GLOBAL HEADER (Most már Home-on is látszik, de a ThemeSelector csak a Home komponensben van) */}
           {/* Kivettem a feltételt (activeApp !== 'home'), így mindig látszik */}
           <header className="h-16 shadow-sm flex items-center justify-between px-6 z-10 sticky top-0 backdrop-blur-md" 
                style={{ 
                    backgroundColor: 'var(--color-header-bg)', 
                    backgroundImage: 'var(--ui-header-image)', 
                    backgroundBlendMode: 'var(--ui-header-blend-mode)', 
                    backgroundSize: 'cover', 
                    backgroundPosition: 'center', 
                    color: 'var(--color-text-on-primary)' 
                }}
             >
                <div className="absolute inset-0 bg-black/10 pointer-events-none" />
                <div className="flex items-center gap-4 relative z-10">
                   <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 rounded-lg hover:bg-white/20 transition-colors"><MenuIcon/></button>
                   <UnitSelector />
                </div>
                <div className="flex items-center gap-3 relative z-10">
                    <div className="text-right hidden md:block">
                        <div className="font-semibold text-sm">{currentUser.fullName}</div>
                        <div className="text-xs opacity-80">{currentUser.role}</div>
                    </div>
                    <button onClick={onLogout} className="p-2 hover:bg-white/20 rounded-full transition-colors"><LogoutIcon className="w-5 h-5"/></button>
                </div>
             </header>
           
           {renderApp()}
        </main>
    </div>
  );
};

export default Dashboard;
