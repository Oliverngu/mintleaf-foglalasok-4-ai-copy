// src/ui/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import ReservationPage from './components/public/ReservationPage';
import ManageReservationPage from './components/public/ManageReservationPage';

import {
  User,
  Request,
  Shift,
  Todo,
  Unit,
  RolePermissions,
  Permissions,
  demoUser,
  demoData,
  TimeEntry,
  Feedback,
  Poll,
} from '../core/models/data';

import { auth, db } from '../core/firebase/config';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  orderBy,
  documentId,
  type DocumentData,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

import LoadingSpinner from '../../components/LoadingSpinner';
import { UnitProvider, useUnitContext } from './context/UnitContext';

import ThemeManager from '../core/theme/ThemeManager';
import { ThemeMode, ThemeBases } from '../core/theme/types';
import { loadBases, loadMode, saveBases, saveMode } from '../core/theme/storage';

type AppState = 'login' | 'register' | 'dashboard' | 'loading' | 'public';
type LoginMessage = { type: 'success' | 'error'; text: string };
type PublicPage =
  | { type: 'reserve'; unitId: string }
  | { type: 'manage'; unitId: string; reservationId: string; manageToken: string }
  | { type: 'error'; message: string };

const ThemeManagerBridge: React.FC<{
  allUnits: Unit[];
  bases: ThemeBases;
  previewBases?: ThemeBases | null;
  themeMode: ThemeMode;
  useBrandTheme: boolean;
}> = ({ allUnits, bases, previewBases, themeMode, useBrandTheme }) => {
  const { selectedUnits } = useUnitContext();

  const activeUnit = selectedUnits.length
    ? allUnits.find(u => u.id === selectedUnits[0]) || null
    : null;

  const resolvedBases = previewBases || bases;

  return (
    <ThemeManager
      activeUnit={activeUnit}
      themeMode={themeMode}
      useBrandTheme={useBrandTheme}
      adminConfig={resolvedBases}
    />
  );
};

const normalizeUserUnitIds = (data: any): string[] => {
  const u1 = Array.isArray(data?.unitIds) ? data.unitIds : [];
  const u2 = Array.isArray(data?.unitIDs) ? data.unitIDs : [];
  const u3 = typeof data?.unitId === 'string' && data.unitId ? [data.unitId] : [];
  return u1.length ? u1 : u2.length ? u2 : u3;
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('loading');
  const [publicPage, setPublicPage] = useState<PublicPage | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<LoginMessage | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // --- Data States ---
  const [requests, setRequests] = useState<Request[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [adminTodos, setAdminTodos] = useState<Todo[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<RolePermissions>({});
  const [unitPermissions, setUnitPermissions] = useState<Record<string, any>>({});
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);

  // --- Theme States ---
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadMode());
  const [themeBases, setThemeBases] = useState<ThemeBases>(() => loadBases());
  const [previewBases, setPreviewBases] = useState<ThemeBases | null>(null);

  const [useBrandTheme, setUseBrandTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('mintleaf_use_brand');
    return saved !== null ? saved === 'true' : true;
  });

  // ---------- URL routing + demo/register ----------
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;

    const isDemo = urlParams.get('demo') === 'true';
    const registerCode = urlParams.get('register');
    const isReservePage = pathname.startsWith('/reserve');
    const isManagePage = pathname.startsWith('/manage');

    if (isManagePage) {
      const manageToken = urlParams.get('token') || '';
      const reservationId = urlParams.get('reservationId') || '';
      const unitId = urlParams.get('unitId') || '';
      setPublicPage({ type: 'manage', unitId, reservationId, manageToken });
    } else if (isReservePage) {
      const unitId = urlParams.get('unit');
      if (unitId) setPublicPage({ type: 'reserve', unitId });
      else setPublicPage({ type: 'error', message: 'Nincs egység azonosító megadva a foglaláshoz.' });
    }

    // Demo mode: no Firestore
    if (isDemo) {
      setIsDemoMode(true);
      setCurrentUser(demoUser);
      setRequests(demoData.requests);
      setShifts(demoData.shifts);
      setTodos(demoData.todos);
      setAdminTodos(demoData.adminTodos);
      setAllUnits(demoData.allUnits);
      setAllUsers(demoData.allUsers);
      setTimeEntries([]);
      setFeedbackList([]);
      setPolls([]);
      setPermissions({ 'Demo User': { canSubmitLeaveRequests: true, canManageTodos: true } });
      setAppState(isReservePage || isManagePage ? 'public' : 'dashboard');
      return;
    }

    // Register (invite) page
    if (registerCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      (async () => {
        try {
          const inviteDoc = await getDoc(doc(db, 'invitations', registerCode));
          if (inviteDoc.exists() && inviteDoc.data()?.status === 'active') {
            setInviteCode(registerCode);
            setAppState('register');
          } else {
            setLoginMessage({ type: 'error', text: 'Érvénytelen vagy már felhasznált meghívó.' });
            setAppState('login');
          }
        } catch (err) {
          console.error('Error validating invite code:', err);
          setLoginMessage({ type: 'error', text: 'Hiba a meghívó ellenőrzésekor.' });
          setAppState('login');
        }
      })();
      return;
    }

    // Default state until auth resolves
    setAppState(isReservePage || isManagePage ? 'public' : 'loading');
  }, []);

  // ---------- Local theme persistence ----------
  useEffect(() => {
    saveMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    saveBases(themeBases);
  }, [themeBases]);

  useEffect(() => {
    setPreviewBases(null);
  }, [themeBases]);

  useEffect(() => {
    localStorage.setItem('mintleaf_use_brand', String(useBrandTheme));
  }, [useBrandTheme]);

  // ---------- Auth / user bootstrap ----------
  useEffect(() => {
    if (isDemoMode) return;

    const pathname = window.location.pathname;
    const isReservePage = pathname.startsWith('/reserve');
    const isManagePage = pathname.startsWith('/manage');

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      setFirestoreError(null);

      if (!firebaseUser) {
        setCurrentUser(null);
        setAppState(isReservePage || isManagePage ? 'public' : 'login');
        return;
      }

      try {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        let userData: User;

        if (userDoc.exists()) {
          const data = userDoc.data();
          const unitIds = normalizeUserUnitIds(data);

          const lastName = (data as any)?.lastName || '';
          const firstName = (data as any)?.firstName || '';

          userData = {
            id: firebaseUser.uid,
            name: (data as any)?.name || firebaseUser.email!,
            lastName,
            firstName,
            fullName: (data as any)?.fullName || `${lastName} ${firstName}`.trim(),
            email: (data as any)?.email || firebaseUser.email!,
            role: (data as any)?.role || 'User',
            unitIds,
            position: (data as any)?.position,
            dashboardConfig: (data as any)?.dashboardConfig,
          };
        } else {
          // first user -> Admin, else User
          const allUsersQuery = query(collection(db, 'users'), limit(1));
          const allUsersSnapshot = await getDocs(allUsersQuery);
          const role = allUsersSnapshot.empty ? 'Admin' : 'User';

          const displayName = firebaseUser.displayName || firebaseUser.email!;
          const nameParts = displayName.split(' ');
          const firstName = nameParts.pop() || '';
          const lastName = nameParts.join(' ');

          userData = {
            id: firebaseUser.uid,
            name: firebaseUser.email!,
            lastName,
            firstName,
            fullName: `${lastName} ${firstName}`.trim(),
            email: firebaseUser.email!,
            role,
            unitIds: [],
          };

          await setDoc(userDocRef, {
            name: userData.name,
            lastName: userData.lastName,
            firstName: userData.firstName,
            fullName: userData.fullName,
            email: userData.email,
            role: userData.role,
            unitIds: userData.unitIds,
          });
        }

        setCurrentUser(userData);
        setAppState(isReservePage || isManagePage ? 'public' : 'dashboard');
      } catch (err) {
        console.error('Error fetching user data:', err);
        // ne törd meg a login page-t: csak logout + login view
        try {
          await signOut(auth);
        } catch {}
        setCurrentUser(null);
        setAppState('login');
      }
    });

    return () => unsubscribe();
  }, [isDemoMode]);

  // ---------- Global theme Firestore listener (ONLY after currentUser exists) ----------
  useEffect(() => {
    if (isDemoMode) return;
    if (!currentUser?.id) return;

    const unsub = onSnapshot(
      doc(db, 'global_settings', 'theme'),
      snap => {
        if (!snap.exists()) return;
        const data = snap.data() as any;

        // igazítsd a te global_settings/theme struktúrádhoz
        if (data?.bases) setThemeBases(data.bases as ThemeBases);
        if (data?.mode) setThemeMode(data.mode as ThemeMode);
      },
      err => {
        console.warn('Theme load info:', err?.message || String(err));
      }
    );

    return () => unsub();
  }, [isDemoMode, currentUser?.id]);

  // ---------- Minimal listeners needed for dashboard shell (NO denied) ----------
  // Admin: users + permissions
  // Units: Admin => all, non-admin => only documentId in unitIds
  useEffect(() => {
    if (isDemoMode) return;
    if (!currentUser) return;

    const isAdmin = currentUser.role === 'Admin';
    const unitIds = currentUser.unitIds || [];

    let unsubUsers: undefined | (() => void);
    let unsubPerms: undefined | (() => void);
    let unsubUnits: undefined | (() => void);

    if (isAdmin) {
      unsubUsers = onSnapshot(collection(db, 'users'), snap => {
        setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      });

      unsubPerms = onSnapshot(collection(db, 'permissions'), snap => {
        const perms: RolePermissions = {};
        snap.forEach(d => {
          perms[d.id as User['role']] = d.data() as Partial<Permissions>;
        });
        setPermissions(perms);
      });

      unsubUnits = onSnapshot(collection(db, 'units'), snap => {
        setAllUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
      });
    } else {
      // non-admin cannot read the full units collection anymore
      if (!unitIds.length) {
        setAllUnits([]);
      } else {
        const qUnits = query(collection(db, 'units'), where(documentId(), 'in', unitIds.slice(0, 10)));
        unsubUnits = onSnapshot(qUnits, snap => {
          setAllUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Unit)));
        });
      }
      setAllUsers([]); // non-admin: no global staff list
      setPermissions({});
    }

    return () => {
      unsubUsers?.();
      unsubPerms?.();
      unsubUnits?.();
    };
  }, [isDemoMode, currentUser?.id, currentUser?.role, JSON.stringify(currentUser?.unitIds ?? [])]);

  // ---------- Authenticated data listeners (NO collectionGroup for top-level polls/feedback) ----------
  useEffect(() => {
    if (!currentUser || isDemoMode) return;

    setFirestoreError(null);

    const isSuperAdmin = currentUser.role === 'Admin';
    const isUnitAdmin =
      currentUser.role === 'Unit Admin' && Array.isArray(currentUser.unitIds) && currentUser.unitIds.length > 0;

    const onIndexOrPerms = (listenerName: string) => (err: any) => {
      console.error(`${listenerName} listener error:`, err);
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('index')) {
        setFirestoreError('Adatbázis index frissítés folyamatban...');
      }
      // ne dobd ki a usert: a dashboard menjen minimál módban is
    };

    // unit_permissions: RULES nálad Admin-only → csak admin hallgassa
    const unsubUnitPerms: Array<() => void> = [];
    if (isSuperAdmin) {
      (currentUser.unitIds || []).forEach(unitId => {
        unsubUnitPerms.push(
          onSnapshot(
            doc(db, 'unit_permissions', unitId),
            snap => {
              if (snap.exists()) setUnitPermissions(prev => ({ ...prev, [unitId]: snap.data() }));
            },
            onIndexOrPerms('unit_permissions')
          )
        );
      });
    } else {
      setUnitPermissions({});
    }

    // todos
    const todosQueryRef =
      !isSuperAdmin && currentUser.unitIds?.length
        ? query(collection(db, 'todos'), where('unitId', 'in', currentUser.unitIds.slice(0, 10)))
        : collection(db, 'todos');
    const unsubTodos = onSnapshot(
      todosQueryRef,
      snap => setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Todo))),
      onIndexOrPerms('todos')
    );

    // admin_todos
    let unsubAdminTodos: () => void = () => {};
    if (isSuperAdmin) {
      unsubAdminTodos = onSnapshot(
        collection(db, 'admin_todos'),
        snap => setAdminTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Todo))),
        onIndexOrPerms('admin_todos')
      );
    } else {
      setAdminTodos([]);
    }

    // shifts
    const shiftsQueryRef: Query<DocumentData> =
      currentUser.role !== 'Admin' && currentUser.unitIds?.length
        ? query(collection(db, 'shifts'), where('unitId', 'in', currentUser.unitIds.slice(0, 10)))
        : collection(db, 'shifts');
    const unsubShifts = onSnapshot(
      shiftsQueryRef,
      (snap: QuerySnapshot<DocumentData>) =>
        setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift))),
      onIndexOrPerms('shifts')
    );

    // requests
    let requestsQueryRef: Query<DocumentData>;
    if (isUnitAdmin) {
      requestsQueryRef = query(collection(db, 'requests'), where('unitId', 'in', currentUser.unitIds!.slice(0, 10)));
    } else if (!isSuperAdmin) {
      requestsQueryRef = query(collection(db, 'requests'), where('userId', '==', currentUser.id));
    } else {
      requestsQueryRef = collection(db, 'requests');
    }
    const unsubRequests = onSnapshot(
      requestsQueryRef,
      (snap: QuerySnapshot<DocumentData>) =>
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as Request))),
      onIndexOrPerms('requests')
    );

    // time_entries (self)
    const timeEntriesQuery = query(collection(db, 'time_entries'), where('userId', '==', currentUser.id));
    const unsubTimeEntries = onSnapshot(
      timeEntriesQuery,
      (snap: QuerySnapshot<DocumentData>) =>
        setTimeEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeEntry))),
      onIndexOrPerms('time_entries')
    );

    // feedback (TOP-LEVEL per rules: /feedback/{feedbackId})
    const feedbackQueryRef =
      !isSuperAdmin && currentUser.unitIds?.length
        ? query(
            collection(db, 'feedback'),
            where('unitId', 'in', currentUser.unitIds.slice(0, 10)),
            orderBy('unitId'),
            orderBy('createdAt', 'desc')
          )
        : query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));

    const unsubFeedback = onSnapshot(
      feedbackQueryRef,
      snap => setFeedbackList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Feedback))),
      onIndexOrPerms('feedback')
    );

    // polls (TOP-LEVEL per rules: /polls/{pollId})
    const pollsQueryRef =
      !isSuperAdmin && currentUser.unitIds?.length
        ? query(
            collection(db, 'polls'),
            where('unitId', 'in', currentUser.unitIds.slice(0, 10)),
            orderBy('unitId'),
            orderBy('createdAt', 'desc')
          )
        : query(collection(db, 'polls'), orderBy('createdAt', 'desc'));

    const unsubPolls = onSnapshot(
      pollsQueryRef,
      snap => setPolls(snap.docs.map(d => ({ id: d.id, ...d.data() } as Poll))),
      onIndexOrPerms('polls')
    );

    return () => {
      unsubUnitPerms.forEach(u => u());
      unsubTodos();
      unsubAdminTodos();
      unsubShifts();
      unsubRequests();
      unsubTimeEntries();
      unsubFeedback();
      unsubPolls();
    };
  }, [currentUser?.id, currentUser?.role, isDemoMode, JSON.stringify(currentUser?.unitIds ?? [])]);

  // ---------- Title ----------
  useEffect(() => {
    switch (appState) {
      case 'login':
        document.title = 'Sign in - mintleaf.hu';
        break;
      case 'register':
        document.title = 'Regisztráció - mintleaf.hu';
        break;
      case 'dashboard':
        document.title = 'Dashboard - mintleaf.hu';
        break;
      default:
        document.title = 'MintLeaf';
    }
  }, [appState]);

  const handleLogout = async () => {
    if (isDemoMode) {
      window.location.href = window.location.pathname;
      return;
    }
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegisterSuccess = () => {
    window.location.href = window.location.pathname;
  };

  // ---------- Render ----------
  switch (appState) {
    case 'public':
      if (publicPage?.type === 'reserve') {
        return <ReservationPage unitId={publicPage.unitId} />;
      }
      if (publicPage?.type === 'manage') {
        return (
          <ManageReservationPage
            unitId={publicPage.unitId}
            reservationId={publicPage.reservationId}
            manageToken={publicPage.manageToken}
          />
        );
      }
      return <div className="fixed inset-0 flex items-center justify-center">Hiba: {publicPage?.message}</div>;

    case 'loading':
      return (
        <div className="fixed inset-0 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      );

    case 'register':
      return (
        <div className="fixed inset-0 flex items-center justify-center">
          <Register inviteCode={inviteCode!} onRegisterSuccess={handleRegisterSuccess} />
        </div>
      );

    case 'dashboard':
      return (
        <UnitProvider currentUser={currentUser} allUnits={allUnits}>
          <ThemeManagerBridge
            allUnits={allUnits}
            bases={themeBases}
            previewBases={previewBases}
            themeMode={themeMode}
            useBrandTheme={useBrandTheme}
          />
          <Dashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            isDemoMode={isDemoMode}
            requests={requests}
            shifts={shifts}
            todos={todos}
            adminTodos={adminTodos}
            allUnits={allUnits}
            allUsers={allUsers}
            permissions={permissions}
            unitPermissions={unitPermissions}
            timeEntries={timeEntries}
            feedbackList={feedbackList}
            polls={polls}
            firestoreError={firestoreError}
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
            themeBases={themeBases}
            onThemeBasesChange={setPreviewBases}
            useBrandTheme={useBrandTheme}
            onBrandChange={setUseBrandTheme}
          />
        </UnitProvider>
      );

    case 'login':
    default:
      return (
        <div className="fixed inset-0">
          <Login loginMessage={loginMessage} />
        </div>
      );
  }
};

export default App;
