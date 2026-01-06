import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  Request,
  Shift,
  Todo,
  Unit,
  RolePermissions,
  Permissions,
  TimeEntry,
  Feedback,
  Poll,
} from '../../core/models/data';

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
import AdminisztracioApp from './apps/AdminisztracioApp'; // ✅ FIX: helyes import
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

import GlassOverlay from './common/GlassOverlay';

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

type AppName =
  | 'home'
  | 'kerelemek'
  | 'foglalasok'
  | 'beosztas'
  | 'settings'
  | 'todos'
  | 'admin_todos'
  | 'elerhetosegek'
  | 'tudastar'
  | 'keszlet'
  | 'velemenyek'
  | 'berezesem'
  | 'unit_settings'
  | 'adminisztracio'
  | 'szavazasok'
  | 'chat';

const AccessDenied: React.FC<{ message?: string }> = ({ message }) => (
  <div className="flex items-center justify-center h-full p-8 text-center bg-gray-100">
    <div>
      <h2 className="text-2xl font-bold text-red-600">Hozzáférés megtagadva</h2>
      <p className="mt-2 text-gray-600">
        {message || 'Nincs jogosultságod ennek az oldalnak a megtekintéséhez.'}
      </p>
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
  firestoreError,
  themeMode,
  onThemeModeChange,
  themeBases,
  onThemeBasesChange,
  useBrandTheme,
  onBrandChange,
}) => {
  const [activeApp, setActiveApp] = useState<AppName>('home');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const userWrapRef = useRef<HTMLDivElement | null>(null);

  // --- Accordion Menu State ---
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const categoryStorageKey = useMemo(
    () => (currentUser ? `mintleaf_sidebar_categories_${currentUser.id}` : null),
    [currentUser]
  );

  useEffect(() => {
    if (!categoryStorageKey) return;
    try {
      const savedState = localStorage.getItem(categoryStorageKey);
      if (savedState) {
        setOpenCategories(JSON.parse(savedState));
      } else {
        setOpenCategories({
          altalanos: true,
          feladatok: true,
          kommunikacio: true,
          adminisztracio: true,
        });
      }
    } catch (e) {
      console.error('Failed to load sidebar state from localStorage', e);
    }
  }, [categoryStorageKey]);

  useEffect(() => {
    if (!categoryStorageKey || Object.keys(openCategories).length === 0) return;
    try {
      localStorage.setItem(categoryStorageKey, JSON.stringify(openCategories));
    } catch (e) {
      console.error('Failed to save sidebar state to localStorage', e);
    }
  }, [openCategories, categoryStorageKey]);

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };
  // --- End Accordion Menu State ---

  const { selectedUnits: activeUnitIds } = useUnitContext();

  const activeUnit = useMemo(
    () => (activeUnitIds.length ? allUnits.find(u => u.id === activeUnitIds[0]) || null : null),
    [activeUnitIds, allUnits]
  );

  // ✅ Click-outside + ESC: zárja a dropdownokat
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (isUserMenuOpen && userWrapRef.current && !userWrapRef.current.contains(t)) {
        setIsUserMenuOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
        setSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isUserMenuOpen]);

  const closeAllMenus = () => {
    setIsUserMenuOpen(false);
    setSidebarOpen(false);
  };

  if (!currentUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
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
      return (
        currentUser.role === 'Unit Admin' ||
        hasPermission('canManageUsers') ||
        hasPermission('canManagePositions') ||
        hasPermission('canManageUnits')
      );
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

  // ✅ egységes “glass” stílus
  const headerPillStyle: React.CSSProperties = {
    padding: 6,
    background: 'rgba(0,0,0,0.26)',
    border: '1px solid rgba(255,255,255,0.22)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  };

  const glassPanelStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.28)',
    border: '1px solid rgba(255,255,255,0.22)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
  };

  const glassTextPrimary: React.CSSProperties = {
    color: 'rgba(255,255,255,0.96)',
    textShadow: '0 1px 3px rgba(0,0,0,0.55), 0 0 8px rgba(0,0,0,0.35)',
  };

  const UnitSelector: React.FC = () => {
    const { selectedUnits, setSelectedUnits, allUnits: ctxAllUnits } = useUnitContext();

    const userUnits = useMemo(
      () => ctxAllUnits.filter(u => currentUser.unitIds?.includes(u.id)),
      [ctxAllUnits, currentUser]
    );

    const isMultiSelect = currentUser.role === 'Admin';

    const handleToggle = (unitId: string) => {
      if (isMultiSelect) {
        setSelectedUnits(prev =>
          prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]
        );
      } else {
        setSelectedUnits(prev => (prev.includes(unitId) ? [] : [unitId]));
      }
    };

    // 0 unit fallback
    if (!userUnits || userUnits.length === 0) {
      return (
        <GlassOverlay
          elevation="high"
          radius={999}
          className="inline-flex w-fit max-w-[90vw]"
          style={headerPillStyle}
          interactive={false}
        >
          <div className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap text-white">
            Nincs egység
          </div>
        </GlassOverlay>
      );
    }

    // 1 unit
    if (userUnits.length === 1) {
      return (
        <GlassOverlay
          elevation="high"
          radius={999}
          interactive={false}
          className="inline-flex w-fit max-w-full"
          style={headerPillStyle}
        >
          <div
            className="px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap truncate max-w-full"
            style={glassTextPrimary}
          >
            {userUnits[0].name}
          </div>
        </GlassOverlay>
      );
    }

    // ✅ multi unit: HORIZONTAL scroll when narrow (no vertical scroll)
    return (
      <GlassOverlay
        elevation="high"
        radius={22}
        interactive={false}
        className="w-full max-w-full min-w-0" // ✅ fontos
        style={{ ...headerPillStyle, padding: 8, borderRadius: 22 }}
      >
        <div
          className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex flex-nowrap gap-2 w-max">
            {userUnits.map(unit => {
              const isSelected = selectedUnits.includes(unit.id);

              return (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => handleToggle(unit.id)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"
                  style={
                    isSelected
                      ? {
                          background: 'rgba(255,255,255,0.92)',
                          color: '#0f172a',
                          border: '1px solid rgba(255,255,255,0.30)',
                        }
                      : {
                          background: 'rgba(255,255,255,0.14)',
                          color: 'rgba(255,255,255,0.96)',
                          border: '1px solid rgba(255,255,255,0.22)',
                          textShadow: (glassTextPrimary as any).textShadow,
                        }
                  }
                  title={unit.name}
                >
                  {unit.name}
                </button>
              );
            })}
          </div>
        </div>
      </GlassOverlay>
    );
  };

  // ✅ UserBadge dropdown panel: ugyanaz a “glass panel” mint a UnitSelector (magasságérzet + olvashatóság)
  const UserBadge: React.FC = () => {
    return (
      <div ref={userWrapRef} className="relative inline-flex">
        <GlassOverlay
          elevation="high"
          radius={22} // ✅ közelebb a UnitSelectorhoz
          interactive
          className="shrink-0 pointer-events-auto inline-flex max-w-full"
          style={{ ...headerPillStyle, padding: 8, borderRadius: 22 }} // ✅ magasság/érzet egységes
          onClick={() => setIsUserMenuOpen(v => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight max-w-[180px] sm:max-w-none" style={glassTextPrimary}>
              <div className="text-xs sm:text-sm font-semibold truncate">{currentUser.fullName}</div>
              <div className="text-[10px] sm:text-xs opacity-90 truncate">{currentUser.role}</div>
            </div>

            <span className="shrink-0 opacity-90">
              <ArrowDownIcon className={`h-4 w-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
            </span>
          </div>
        </GlassOverlay>

        {isUserMenuOpen && (
          <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(340px,92vw)]">
            <GlassOverlay elevation="high" radius={20} interactive={false} className="w-full" style={glassPanelStyle}>
              <div className="p-2">
                <div
                  className="px-3 py-2 rounded-xl"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.96)',
                    textShadow: (glassTextPrimary as any).textShadow,
                  }}
                >
                  <div className="text-sm font-semibold truncate">{currentUser.fullName}</div>
                  <div className="text-xs opacity-90 truncate">{currentUser.email}</div>
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-xl transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.16)',
                      color: 'rgba(255,255,255,0.96)',
                      border: '1px solid rgba(255,255,255,0.22)',
                      textShadow: (glassTextPrimary as any).textShadow,
                    }}
                    onClick={() => {
                      setActiveApp('settings');
                      closeAllMenus();
                    }}
                  >
                    <div className="text-sm font-semibold">Beállítások</div>
                    <div className="text-xs opacity-85">Fiók, megjelenés, értesítések</div>
                  </button>

                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-xl transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.92)',
                      color: '#0f172a',
                      border: '1px solid rgba(255,255,255,0.30)',
                    }}
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <div className="text-sm font-semibold">Kijelentkezés</div>
                    <div className="text-xs opacity-80">Kilépés a fiókból</div>
                  </button>
                </div>
              </div>
            </GlassOverlay>
          </div>
        )}
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

  const NavItem: React.FC<NavItemProps> = ({
    app,
    icon: Icon,
    label,
    permission,
    disabledAppCheck = true,
  }) => {
    if (permission && !hasPermission(permission)) return null;

    const isAppDisabled =
      disabledAppCheck && activeUnitIds.some(unitId => unitPermissions[unitId]?.disabledApps?.includes(app));
    if (isAppDisabled && currentUser.role !== 'Admin') return null;

    const isActive = activeApp === app;

    return (
      <button
        onClick={() => {
          setActiveApp(app);
          closeAllMenus();
        }}
        className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-colors duration-200 ${
          isActive ? 'shadow-inner' : 'hover:bg-[var(--color-sidebar-hover)]'
        }`}
        style={{
          backgroundColor: isActive ? 'var(--color-secondary)' : 'transparent',
          color: isActive ? 'var(--color-text-on-primary)' : 'var(--color-text-main)',
        }}
        title={label}
        type="button"
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
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[var(--color-sidebar-hover)] transition-colors duration-200"
          aria-expanded={isOpen}
          style={{ color: 'var(--color-text-main)' }}
          type="button"
        >
          <div className="flex items-center">
            <Icon className="h-6 w-6" />
            <span className="ml-4 font-bold text-base whitespace-nowrap">{label}</span>
          </div>
          <ArrowDownIcon className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="pl-6 mt-1 space-y-1 border-l-2 ml-5" style={{ borderColor: 'var(--color-border)' }}>
            {children}
          </div>
        )}
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
            themeMode={themeMode}
            onThemeChange={onThemeModeChange}
            activeUnit={activeUnit}
            themeBases={themeBases}
            onThemeBasesChange={onThemeBasesChange}
            useBrandTheme={useBrandTheme}
            onBrandChange={onBrandChange}
          />
        );
      case 'kerelemek':
        return (
          <KerelemekApp
            requests={requests}
            loading={false}
            error={null}
            currentUser={currentUser}
            canManage={hasPermission('canManageLeaveRequests')}
          />
        );
      case 'foglalasok':
        return (
          <FoglalasokApp
            currentUser={currentUser}
            canAddBookings={hasPermission('canAddBookings')}
            allUnits={allUnits}
            activeUnitIds={activeUnitIds}
          />
        );
      case 'beosztas':
        return (
          <BeosztasApp
            schedule={shifts}
            requests={requests}
            currentUser={currentUser}
            canManage={hasPermission('canManageSchedules')}
            allUnits={allUnits}
            activeUnitIds={activeUnitIds}
            isSidebarOpen={isSidebarOpen}
          />
        );
      case 'settings':
        return <UserSettingsApp user={currentUser} onLogout={onLogout} />;
      case 'todos':
        return (
          <TodoApp
            todos={todos}
            loading={false}
            error={null}
            currentUser={currentUser}
            allUsers={allUsers}
            allUnits={allUnits}
            activeUnitIds={activeUnitIds}
          />
        );
      case 'chat':
        return <ChatApp currentUser={currentUser} allUsers={allUsers} allUnits={allUnits} activeUnitIds={activeUnitIds} />;
      case 'admin_todos':
        return <AdminTodoApp todos={adminTodos} loading={false} error={null} currentUser={currentUser} />;
      case 'elerhetosegek':
        return <ContactsApp currentUser={currentUser} canManage={hasPermission('canManageContacts')} canViewAll={hasPermission('canViewAllContacts')} />;
      case 'tudastar':
        return (
          <TudastarApp
            currentUser={currentUser}
            allUnits={allUnits}
            activeUnitIds={activeUnitIds}
            canManageContent={hasPermission('canManageKnowledgeBase')}
            canManageCategories={hasPermission('canManageKnowledgeCategories')}
          />
        );
      case 'keszlet': {
        const canManageInventory = hasPermission('canManageInventory');
        const canViewInventory = hasPermission('canViewInventory') || canManageInventory;
        if (!canViewInventory) return <AccessDenied message="Nincs jogosultságod a Készlet megtekintéséhez." />;
        return (
          <KeszletApp
            selectedUnitIds={activeUnitIds}
            allUnits={allUnits}
            userUnitIds={currentUser.unitIds || []}
            currentUserId={currentUser.id}
            currentUserName={currentUser.fullName}
            isUnitAdmin={currentUser.role === 'Admin' || currentUser.role === 'Unit Admin'}
            canViewInventory={canViewInventory}
            canManageInventory={canManageInventory}
          />
        );
      }
      case 'velemenyek':
        return <VelemenyekApp currentUser={currentUser} allUnits={allUnits} activeUnitIds={activeUnitIds} feedbackList={feedbackList} />;
      case 'berezesem':
        return <BerezesemApp currentUser={currentUser} schedule={shifts} activeUnitIds={activeUnitIds} timeEntries={timeEntries} allUnits={allUnits} />;
      case 'szavazasok':
        return <PollsApp currentUser={currentUser} canCreatePolls={hasPermission('canCreatePolls')} polls={polls} />;
      case 'unit_settings':
        if (!hasPermission('canManageAdminPage')) return <AccessDenied />;
        return (
          <UnitSettingsPage
            currentUser={currentUser}
            allUnits={allUnits}
            allPermissions={permissions}
            unitPermissions={unitPermissions}
            activeUnitIds={activeUnitIds}
          />
        );
      case 'adminisztracio':
        if (!hasPermission('canManageAdminPage')) return <AccessDenied />;
        return (
          <AdminisztracioApp
            currentUser={currentUser}
            allUnits={allUnits}
            unitPermissions={unitPermissions}
            activeUnitId={activeUnitIds.length === 1 ? activeUnitIds[0] : null}
            allPermissions={permissions}
            canGenerateInvites={hasPermission('canManageUsers')}
          />
        );
      default:
        return null;
    }
  };

  const isChatLayout = activeApp === 'chat';
  const mainOverflowClass = isChatLayout ? 'overflow-y-hidden' : 'overflow-y-auto';

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden transition-colors duration-200"
      style={{
        backgroundColor: 'var(--color-background)',
        backgroundImage: 'var(--ui-bg-image)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        color: 'var(--color-text-main)',
      }}
    >
      {/* Backdrop for sidebar */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 border-r transform transition-transform duration-300 ease-in-out flex items-start ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64`}
        style={{ backgroundColor: 'var(--color-secondary)' }}
      >
        <div
          className="flex h-full w-[calc(100%-6px)] flex-col shadow-xl mr-1.5"
          style={{
            backgroundColor: 'var(--color-sidebar-bg)',
            backgroundImage: 'var(--ui-sidebar-image)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            color: 'var(--color-sidebar-text)',
            overflowY: 'auto',
          }}
        >
          <div className="flex items-center justify-center h-16 px-4 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              <MintLeafLogo className="h-8 w-8" />
              <span className="font-bold text-xl" style={{ color: 'var(--color-sidebar-text)' }}>
                MintLeaf
              </span>
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
              {(hasPermission('canViewInventory') || hasPermission('canManageInventory')) && (
                <NavItem app="keszlet" icon={BriefcaseIcon} label="Készlet" />
              )}
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

          {/* ✅ Bottom actions: Settings + Logout ICON vissza (Glass panel: interactive=false, ikonok kattinthatók) */}
          <div className="p-3 border-t flex-shrink-0">
            <GlassOverlay
              elevation="high"
              radius={22}
              interactive={false} // ✅ kérésed szerint
              className="w-full"
              style={{ ...headerPillStyle, padding: 8, borderRadius: 22 }}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setActiveApp('settings');
                    closeAllMenus();
                  }}
                  className="p-2 rounded-xl pointer-events-auto"
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    color: 'rgba(255,255,255,0.96)',
                  }}
                  title="Beállítások"
                >
                  <SettingsIcon className="h-6 w-6" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    closeAllMenus();
                    onLogout();
                  }}
                  className="p-2 rounded-xl pointer-events-auto"
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    color: 'rgba(255,255,255,0.96)',
                  }}
                  title="Kijelentkezés"
                >
                  <LogoutIcon className="h-6 w-6" />
                </button>
              </div>
            </GlassOverlay>
          </div>

          <div className="p-2 text-center text-gray-400 text-xs">Beta version by Oliver Nguyen</div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-col h-full w-full">
        <header
          className="h-16 shadow-md flex items-center px-6 z-10 flex-shrink-0"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-on-primary)',
            backgroundImage: 'var(--ui-header-image)',
            backgroundBlendMode: 'var(--ui-header-blend-mode)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* grid middle cell MUST allow shrink */}
          <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3 w-full min-w-0">
            <button
              onClick={() => {
                setSidebarOpen(v => !v);
                setIsUserMenuOpen(false);
              }}
              className="p-2 -ml-2 shrink-0"
              type="button"
            >
              <MenuIcon />
            </button>

            {/* ✅ allow horizontal scroll to be visible inside */}
            <div className="min-w-0 w-full">
              <UnitSelector />
            </div>

            <div className="shrink-0 pointer-events-auto">
              <UserBadge />
            </div>
          </div>
        </header>

        <main
          className={`flex-1 min-h-0 overflow-x-hidden ${mainOverflowClass}`}
          style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-main)' }}
        >
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
