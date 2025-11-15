import React, { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { User, Request, Booking, Shift, Todo, Contact, ContactCategory, Position, Unit, RolePermissions, Permissions, TimeEntry, Feedback, Poll } from '../../core/models/data';
import { db } from '../../core/firebase/config';

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
// FIX: Module '"file:///src/ui/components/apps/BerezesemApp"' has no default export.
import BerezesemApp from './apps/BerezesemApp';
import AdminisztracioApp from './apps/AdminisztracioApp';
import HomeDashboard from './HomeDashboard';
import PollsApp from './polls/PollsApp';
import ChatApp from './apps/ChatApp';

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
import { useUnitContext } from '../context/UnitContext';
import UserIcon from '../../../components/icons/UserIcon';
import ArrowDownIcon from '../../../components/icons/ArrowDownIcon';
import InvitationIcon from '../../../components/icons/InvitationIcon';
import BuildingIcon from '../../../components/icons/BuildingIcon';
import CalendarOffIcon from '../../../components/icons/CalendarOffIcon';
import BellIcon from './icons/BellIcon';


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
}

type AppName = 'home' | 'kerelemek' | 'foglalasok' | 'beosztas' | 'settings' | 'todos' | 'admin_todos' | 'elerhetosegek' | 'tudastar' | 'velemenyek' | 'berezesem' | 'adminisztracio' | 'szavazasok' | 'chat';

const AccessDenied: React.FC = () => (
  <div className="flex items-center justify-center h-full p-8 text-center bg-gray-100">
    <div>
      <h2 className="text-2xl font-bold text-red-600">Hozzáférés megtagadva</h2>
      <p className="mt-2 text-gray-600">Nincs jogosultságod ennek az oldalnak a megtekintéséhez.</p>
    </div>
  </div>
);

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
    firestoreError
}) => {
  const [activeApp, setActiveApp] = useState<AppName>('home');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // --- Accordion Menu State ---
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const categoryStorageKey = useMemo(() => 
    currentUser ? `mintleaf_sidebar_categories_${currentUser.id}` : null
  , [currentUser]);

  useEffect(() => {
    if (categoryStorageKey) {
        try {
            const savedState = localStorage.getItem(categoryStorageKey);
            if (savedState) {
                setOpenCategories(JSON.parse(savedState));
            } else {
                // Expand all by default on first load
                setOpenCategories({
                    altalanos: true,
                    feladatok: true,
                    kommunikacio: true,
                    adminisztracio: true,
                });
            }
        } catch (e) {
            console.error("Failed to load sidebar state from localStorage", e);
        }
    }
  }, [categoryStorageKey]);

  useEffect(() => {
    if (categoryStorageKey && Object.keys(openCategories).length > 0) {
        try {
            localStorage.setItem(categoryStorageKey, JSON.stringify(openCategories));
        } catch (e) {
            console.error("Failed to save sidebar state to localStorage", e);
        }
    }
  }, [openCategories, categoryStorageKey]);

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };
  // --- End Accordion Menu State ---

  const { selectedUnits: activeUnitIds, setSelectedUnits: setActiveUnitIds, allUnits: contextAllUnits } = useUnitContext();
  
  // The check for currentUser is handled in App.tsx, so it's safe to assume it's not null here.
  if (!currentUser) {
    return <div className="fixed inset-0 flex items-center justify-center"><LoadingSpinner /></div>;
  }
  
  const hasPermission = (permission: keyof Permissions | 'canManageAdminPage'): boolean => {
    if (currentUser.role === 'Admin') return true;
    if (currentUser.role === 'Demo User') { 
        if (typeof permission === 'string') {
            return permission.startsWith('canView') || permission === 'canSubmitLeaveRequests';
        }
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
  
  const UnitSelector: React.FC = () => {
    const { selectedUnits, setSelectedUnits, allUnits } = useUnitContext();
    const userUnits = useMemo(() => allUnits.filter(u => currentUser.unitIds?.includes(u.id)), [allUnits, currentUser]);
    const isMultiSelect = currentUser.role === 'Admin';

    const handleSelection = (unitId: string) => {
        if (isMultiSelect) {
            setSelectedUnits(prev => prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]);
        } else {
            // For non-admins, allow toggling single selection
            setSelectedUnits(prev => prev.includes(unitId) ? [] : [unitId]);
        }
    };
    
    if (!userUnits || userUnits.length <= 1) {
        // If user has 0 or 1 unit, just display the name, no selection needed.
        return <div className="text-white font-semibold px-3">{userUnits[0]?.name || 'Nincs egység'}</div>;
    }
    
    return (
        <div className="flex items-center gap-2 overflow-x-auto py-2 -my-2 scrollbar-hide">
            {userUnits.map(unit => (
                <button 
                    key={unit.id}
                    onClick={() => handleSelection(unit.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                        selectedUnits.includes(unit.id)
                        ? 'bg-white text-green-800 shadow-md'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                >
                    {unit.name}
                </button>
            ))}
        </div>
    );
  };
  
  interface NavItemProps {
    app: AppName;
    icon: React.FC<{ className?: string }>;
    label: string;
    permission?: keyof Permissions | 'canManageAdminPage';
    disabledAppCheck?: boolean;
  }

  const NavItem: React.FC<NavItemProps> = ({ app, icon: Icon, label, permission, disabledAppCheck = true }) => {
    if (permission && !hasPermission(permission)) return null;
    
    const isAppDisabled = disabledAppCheck && activeUnitIds.some(unitId => unitPermissions[unitId]?.disabledApps?.includes(app));
    if (isAppDisabled && currentUser.role !== 'Admin') return null;

    return (
      <button
        onClick={() => {
          setActiveApp(app);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors duration-200 ${
          activeApp === app
            ? 'bg-green-700 text-white shadow-inner'
            : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'
        }`}
        title={label}
      >
        <Icon className="h-6 w-6" />
        <span className="ml-4 font-semibold text-base whitespace-nowrap">{label}</span>
      </button>
    );
  };

  interface CategoryItemProps {
    name: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    children: React.ReactNode;
  }

  const CategoryItem: React.FC<CategoryItemProps> = ({ name, label, icon: Icon, children }) => {
      const isOpen = !!openCategories[name];
      const hasVisibleChildren = React.Children.toArray(children).some(child => child !== null);
      
      if (!hasVisibleChildren) return null;

      return (
          <div>
              <button
                  onClick={() => toggleCategory(name)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-200"
                  aria-expanded={isOpen}
              >
                  <div className="flex items-center">
                      <Icon className="h-6 w-6" />
                      <span className="ml-4 font-bold text-base whitespace-nowrap">{label}</span>
                  </div>
                  <ArrowDownIcon className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                  <div className="pl-6 mt-1 space-y-1 border-l-2 ml-5">
                      {children}
                  </div>
              )}
          </div>
      );
  };

  const renderApp = () => {
    switch(activeApp){
        case 'home':
            return <HomeDashboard 
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
            />
        case 'kerelemek':
            return <KerelemekApp requests={requests} loading={false} error={null} currentUser={currentUser} canManage={hasPermission('canManageLeaveRequests')} />;
        case 'foglalasok':
            return <FoglalasokApp 
                        currentUser={currentUser} 
                        canAddBookings={hasPermission('canAddBookings')}
                        allUnits={allUnits}
                        activeUnitIds={activeUnitIds}
                    />;
        case 'beosztas':
            return <BeosztasApp schedule={shifts} requests={requests} currentUser={currentUser} canManage={hasPermission('canManageSchedules')} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
        case 'settings':
            return <UserSettingsApp user={currentUser} onLogout={onLogout} />;
        case 'todos':
            return <TodoApp todos={todos} loading={false} error={null} currentUser={currentUser} allUsers={allUsers} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
        case 'chat':
            return <ChatApp currentUser={currentUser} allUsers={allUsers} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
        case 'admin_todos':
            return <AdminTodoApp todos={adminTodos} loading={false} error={null} currentUser={currentUser} />;
        case 'elerhetosegek':
            return <ContactsApp currentUser={currentUser} canManage={hasPermission('canManageContacts')} canViewAll={hasPermission('canViewAllContacts')} />;
        case 'tudastar':
            return <TudastarApp currentUser={currentUser} allUnits={allUnits} activeUnitIds={activeUnitIds}/>;
        case 'velemenyek':
            return <VelemenyekApp currentUser={currentUser} allUnits={allUnits} activeUnitIds={activeUnitIds} feedbackList={feedbackList} />;
        case 'berezesem':
            return <BerezesemApp currentUser={currentUser} schedule={shifts} activeUnitIds={activeUnitIds} timeEntries={timeEntries} allUnits={allUnits} />;
        case 'szavazasok':
            return <PollsApp currentUser={currentUser} canCreatePolls={hasPermission('canCreatePolls')} polls={polls} />;
        case 'adminisztracio':
             if (!hasPermission('canManageAdminPage')) return <AccessDenied />;
             return <AdminisztracioApp currentUser={currentUser} allUnits={allUnits} unitPermissions={unitPermissions} activeUnitId={activeUnitIds.length === 1 ? activeUnitIds[0] : null} allPermissions={permissions} canGenerateInvites={hasPermission('canGenerateInvites')} />;
        default:
            return <HomeDashboard 
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
            />;
    }
  };

  const isChatLayout = activeApp === 'chat';
  const mainOverflowClass = isSidebarOpen || isChatLayout ? 'overflow-y-hidden' : 'overflow-y-auto';

  return (
    <div className="relative h-full bg-gray-50 overflow-hidden">
      {/* Backdrop for sidebar */}
      {isSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/50 z-20" 
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 bg-white border-r transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-64`}>
        <div className="flex items-center justify-center h-16 px-4 border-b flex-shrink-0">
             <div className="flex items-center gap-2">
                <MintLeafLogo className="h-8 w-8" />
                <span className="font-bold text-xl text-gray-800">MintLeaf</span>
             </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            <NavItem app="home" icon={HomeIcon} label="Kezdőlap" disabledAppCheck={false} />
            
            <CategoryItem name="altalanos" label="Általános" icon={ScheduleIcon}>
                <NavItem app="beosztas" icon={ScheduleIcon} label="Beosztás" />
                <NavItem app="foglalasok" icon={BookingIcon} label="Foglalások" />
                <NavItem app="berezesem" icon={MoneyIcon} label="Óraszámok" />
                <NavItem app="kerelemek" icon={CalendarIcon} label="Szabadnapok" permission="canSubmitLeaveRequests" />
            </CategoryItem>
            
            <CategoryItem name="feladatok" label="Feladatok és Tudás" icon={TodoIcon}>
                <NavItem app="todos" icon={TodoIcon} label="Teendők" />
                {currentUser.role === 'Admin' && <NavItem app="admin_todos" icon={AdminTodoIcon} label="Vezetői Teendők" />}
                <NavItem app="tudastar" icon={BookIcon} label="Tudástár" />
            </CategoryItem>

            <CategoryItem name="kommunikacio" label="Kommunikáció" icon={ChatIcon}>
                <NavItem app="chat" icon={ChatIcon} label="Chat" />
                <NavItem app="szavazasok" icon={PollsIcon} label="Szavazások" />
                <NavItem app="velemenyek" icon={FeedbackIcon} label="Vélemények" />
            </CategoryItem>

            <NavItem app="adminisztracio" icon={AdminIcon} label="Adminisztráció" permission="canManageAdminPage" disabledAppCheck={false} />
        </nav>
        <div className="p-3 border-t space-y-1 flex-shrink-0">
             <button
                onClick={() => {
                  setActiveApp('settings');
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors duration-200 ${
                  activeApp === 'settings'
                    ? 'bg-green-700 text-white shadow-inner'
                    : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                }`}
                title="Beállítások"
              >
                <SettingsIcon className="h-6 w-6" />
              </button>
        </div>
        <div className="p-2 text-center text-gray-400 text-xs">
            Beta version by Oliver Nguyen
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col h-full w-full">
        <header className="h-16 bg-green-800 shadow-md text-white flex items-center justify-between px-6 z-10 flex-shrink-0">
           <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2"><MenuIcon /></button>
              <UnitSelector />
           </div>
           <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-semibold">{currentUser.fullName}</div>
                <div className="text-sm text-green-200">{currentUser.role}</div>
              </div>
               <button onClick={onLogout} title="Kijelentkezés" className="p-2 rounded-full hover:bg-white/20">
                <LogoutIcon className="h-6 w-6" />
              </button>
           </div>
        </header>

        <main className={`flex-1 min-h-0 overflow-x-hidden bg-gray-100 ${mainOverflowClass}`}>
            {firestoreError && (
                <div className="sticky top-0 z-20 m-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded-r-lg shadow-lg">
                    <p className="font-bold">Átmeneti adatbázis hiba</p>
                    <p className="text-sm">{firestoreError}</p>
                </div>
            )}
           {renderApp()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;