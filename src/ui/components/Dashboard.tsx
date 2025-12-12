import React, { useState, useEffect, useMemo } from 'react';
import { User, Request, Shift, Todo, Unit, RolePermissions, Permissions, TimeEntry, Feedback, Poll } from '../../core/models/data';

// App Components
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

// Icons
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

  // --- 🔥 JAVÍTÁS: AUTOMATIKUS UNIT VÁLASZTÁS 🔥 ---
  useEffect(() => {
    if (activeUnitIds.length === 0 && allUnits.length > 0 && currentUser) {
      let defaultUnitId: string | undefined;
      if (currentUser.role === 'Admin') {
        defaultUnitId = allUnits[0]?.id;
      } else if (currentUser.unitIds && currentUser.unitIds.length > 0) {
        defaultUnitId = currentUser.unitIds.find(id => allUnits.some(u => u.id === id));
      }
      if (defaultUnitId) setActiveUnitIds([defaultUnitId]);
    }
  }, [activeUnitIds.length, allUnits, currentUser, setActiveUnitIds]);

  if (!currentUser) return <div className="fixed inset-0 flex items-center justify-center"><LoadingSpinner /></div>;

  const hasPermission = (permission: keyof Permissions | 'canManageAdminPage'): boolean => {
    if (currentUser.role === 'Admin') return true;
    return true; 
  };

  const UnitSelector = () => {
    if (!activeUnit) return <div className="text-white font-semibold px-3">Nincs egység</div>;
    return (
      <div className="flex items-center gap-2 overflow-x-auto py-2 -my-2 scrollbar-hide">
        {allUnits.filter(u => currentUser.unitIds?.includes(u.id) || currentUser.role === 'Admin').map(unit => (
          <button
            key={unit.id}
            onClick={() => setActiveUnitIds([unit.id])} 
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

  // Navigációs elemek egyszerűsítve a rendereléshez
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
            // TÉMA PROPOK ÁTADÁSA
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

  const NavItem = ({ app, icon: Icon, label }: any) => (
    <button onClick={() => { setActiveApp(app); setSidebarOpen(false); }} className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors ${activeApp === app ? 'bg-[var(--color-secondary)] text-[var(--color-text-on-primary)]' : 'hover:bg-[var(--color-sidebar-hover)]'}`} style={{ color: activeApp === app ? 'var(--color-text-on-primary)' : 'var(--color-text-main)' }}>
      <Icon className="h-6 w-6" /> <span className="ml-4 font-semibold">{label}</span>
    </button>
  );

  return (
    <div className="relative h-full overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--color-background)', backgroundImage: 'var(--ui-bg-image)', backgroundSize: 'cover', backgroundAttachment: 'fixed', color: 'var(--color-text-main)' }}>
        {/* Sidebar (Egyszerűsítve) */}
        <aside className={`fixed inset-y-0 left-0 z-30 border-r transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-64`} style={{ backgroundColor: 'var(--color-sidebar-bg)', color: 'var(--color-sidebar-text)' }}>
            <div className="h-16 flex items-center justify-center border-b"><MintLeafLogo className="h-8 w-8" /><span className="ml-2 font-bold text-xl">MintLeaf</span></div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                <NavItem app="home" icon={HomeIcon} label="Kezdőlap" />
                <NavItem app="beosztas" icon={ScheduleIcon} label="Beosztás" />
                <NavItem app="todos" icon={TodoIcon} label="Teendők" />
                {/* ... Többi menüpont ... */}
                <NavItem app="unit_settings" icon={Cog6ToothIcon} label="Beállítások" />
            </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto bg-transparent">
           {/* Ha nem a Home-on vagyunk, kell a Header */}
           {activeApp !== 'home' && (
             <header className="h-16 shadow-md flex items-center justify-between px-6 z-10 sticky top-0" style={{ backgroundColor: 'var(--color-header-bg)', backgroundImage: 'var(--ui-header-image)', backgroundBlendMode: 'var(--ui-header-blend-mode)', backgroundSize: 'cover', color: 'var(--color-text-on-primary)' }}>
                <div className="flex items-center gap-4">
                   <button onClick={() => setSidebarOpen(!isSidebarOpen)}><MenuIcon/></button>
                   <UnitSelector />
                </div>
                <div className="font-bold">{currentUser.fullName}</div>
             </header>
           )}
           {renderApp()}
        </main>
    </div>
  );
};

export default Dashboard;
