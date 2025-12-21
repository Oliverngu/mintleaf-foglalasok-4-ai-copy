import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import ReservationPage from './components/public/ReservationPage';
import ManageReservationPage from './components/public/ManageReservationPage';
import { User, Request, Booking, Shift, Todo, Unit, RolePermissions, Permissions, demoUser, demoUnit, demoData, TimeEntry, Feedback, Poll } from '../core/models/data';
import { auth, db } from '../core/firebase/config';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { collection, collectionGroup, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, where, orderBy } from 'firebase/firestore';
import LoadingSpinner from '../../components/LoadingSpinner';
import { UnitProvider, useUnitContext } from './context/UnitContext';
import ThemeManager from '../core/theme/ThemeManager';
import { ThemeMode, ThemeBases } from '../core/theme/types';
import { loadBases, loadMode, saveBases, saveMode } from '../core/theme/storage';

type AppState = 'login' | 'register' | 'dashboard' | 'loading' | 'public';
type LoginMessage = { type: 'success' | 'error'; text: string };
type PublicPage = { type: 'reserve'; unitId: string } | { type: 'manage'; token: string } | { type: 'error'; message: string };

// --- 1. JAVÍTÁS: A Bridge Prop neveinek szinkronizálása a ThemeManagerrel ---
const ThemeManagerBridge: React.FC<{
  allUnits: Unit[];
  bases: ThemeBases;
  previewBases?: ThemeBases | null;
  themeMode: ThemeMode;
  useBrandTheme: boolean;
}> = ({
  allUnits,
  bases,
  previewBases,
  themeMode,
  useBrandTheme,
}) => {
  const { selectedUnits } = useUnitContext();
  const [unitTheme, setUnitTheme] = useState<ThemeBases | null>(null);
  const activeUnit = selectedUnits.length
    ? allUnits.find(u => u.id === selectedUnits[0]) || null
    : null;

  const resolvedBases = previewBases || bases;

  useEffect(() => {
    if (!activeUnit) {
      setUnitTheme(null);
      return;
    }
    const ref = doc(db, 'unit_themes', activeUnit.id);
    const unsub = onSnapshot(
      ref,
      snap => {
        setUnitTheme((snap.data() as ThemeBases) || null);
      },
      err => {
        console.warn('Unit theme load failed', err);
        setUnitTheme(null);
      }
    );
    return () => unsub();
  }, [activeUnit]);

  // JAVÍTVA: adminConfig={bases}, themeMode={themeMode}
  return (
    <ThemeManager
      activeUnit={activeUnit}
      themeMode={themeMode}
      useBrandTheme={useBrandTheme}
      adminConfig={resolvedBases} // Fontos: adminConfig a neve, nem bases!
      unitTheme={unitTheme}
    />
  );
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
  // Kezdetben üres vagy lokális, később a Firestore felülírja
  const [themeBases, setThemeBases] = useState<ThemeBases>(() => loadBases());
  const [previewBases, setPreviewBases] = useState<ThemeBases | null>(null);

  // --- Brand Theme State ---
  const [useBrandTheme, setUseBrandTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('mintleaf_use_brand');
    return saved !== null ? saved === 'true' : true; 
  });

  // --- 2. JAVÍTÁS: GLOBÁLIS TÉMA FIGYELÉSE FIRESTORE-BÓL ---
  // Ez biztosítja, hogy amit az Admin beállít és elment, azt mindenki megkapja.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'global_settings', 'theme'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ThemeBases;
        setThemeBases(data);
        saveBases(data); // Elmentjük lokálisan is cache gyanánt
      }
    }, (error) => {
        // Ha nincs jogod olvasni (pl. kijelentkezve), vagy nem létezik, nem baj
        console.warn("Theme load info:", error.message);
    });
    return () => unsub();
  }, []);

  // Theme Effects (Lokális mentések)
  useEffect(() => {
    saveMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    // A themeBases-t most már a fenti onSnapshot frissíti, de azért elmentjük
    saveBases(themeBases);
  }, [themeBases]);

  useEffect(() => {
    // Ha új alapok érkeznek (pl. mentés után), töröljük az előnézeti módosításokat
    setPreviewBases(null);
  }, [themeBases]);

  useEffect(() => {
    localStorage.setItem('mintleaf_use_brand', String(useBrandTheme));
  }, [useBrandTheme]);


  // --- Initialization Logic ---
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const isDemo = urlParams.get('demo') === 'true';
    const registerCode = urlParams.get('register');
    const isReservePage = pathname.startsWith('/reserve');
    const isManagePage = pathname.startsWith('/manage');

    if (isManagePage) {
        const token = urlParams.get('token');
        if (token) {
            setPublicPage({ type: 'manage', token });
        } else {
            setPublicPage({ type: 'error', message: 'Nincs foglalási azonosító megadva.' });
        }
    } else if (isReservePage) {
        const unitId = urlParams.get('unit');
        if (unitId) {
            setPublicPage({ type: 'reserve', unitId });
        } else {
            setPublicPage({ type: 'error', message: 'Nincs egység azonosító megadva a foglaláshoz.' });
        }
    }

    // Handle Demo Mode
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
      setAppState('dashboard');
      return; 
    }

    // Handle Registration
    if (registerCode) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const validateInvite = async () => {
        try {
          const inviteDoc = await getDoc(doc(db, 'invitations', registerCode));
          if (inviteDoc.exists() && inviteDoc.data()?.status === 'active') {
            setInviteCode(registerCode);
            setAppState('register');
          } else {
            setLoginMessage({ type: 'error', text: 'Érvénytelen vagy már felhasznált meghívó.' });
            setAppState('login');
          }
        } catch (error) {
          console.error("Error validating invite code:", error);
          setLoginMessage({ type: 'error', text: 'Hiba a meghívó ellenőrzésekor.' });
          setAppState('login');
        }
      };
      validateInvite();
      return; 
    }

    // Handle Standard Authentication
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      let finalUserData: User | null = null;
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let userDoc = await getDoc(userDocRef);
          let userData: User;

          if (userDoc.exists()) {
            const data = userDoc.data();
            let userUnits: string[] = [];
            if (data?.unitIds && Array.isArray(data.unitIds)) userUnits = data.unitIds;
            else if (data?.unitId) userUnits = [data.unitId];

            const lastName = data?.lastName || '';
            const firstName = data?.firstName || '';

            userData = {
              id: firebaseUser.uid,
              name: data?.name || firebaseUser.email!,
              lastName: lastName,
              firstName: firstName,
              fullName: data?.fullName || `${lastName} ${firstName}`.trim(),
              email: data?.email || firebaseUser.email!,
              role: data?.role || 'User',
              unitIds: userUnits,
              position: data?.position,
              dashboardConfig: data?.dashboardConfig,
            };
          } else {
            // First time user logic...
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
              lastName: lastName,
              firstName: firstName,
              fullName: `${lastName} ${firstName}`.trim(),
              email: firebaseUser.email!,
              role: role,
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
          finalUserData = userData;
          setCurrentUser(userData);
        } catch (error) {
          console.error("Error fetching user data:", error);
          await signOut(auth);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }

      if (isReservePage || isManagePage) setAppState('public');
      else if (finalUserData) setAppState('dashboard');
      else setAppState('login');
    });

    return () => unsubscribe();
  }, []);


  // --- DATA LISTENERS ---
  useEffect(() => {
    if (isDemoMode) return;
    const unsubUsers = onSnapshot(collection(db, 'users'), snapshot => setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User))));
    const unsubUnits = onSnapshot(collection(db, 'units'), snapshot => setAllUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit))));
    const unsubPerms = onSnapshot(collection(db, 'permissions'), snapshot => {
        const perms: RolePermissions = {};
        snapshot.forEach(doc => { perms[doc.id as User['role']] = doc.data() as Partial<Permissions>; });
        setPermissions(perms);
    });
    return () => { unsubUsers(); unsubUnits(); unsubPerms(); };
  }, [isDemoMode]);

  // Authenticated Data Listeners
  useEffect(() => {
    if (!currentUser || isDemoMode) return;
    setFirestoreError(null);

    const isSuperAdmin = currentUser.role === 'Admin';
    const isUnitAdmin = currentUser.role === 'Unit Admin' && currentUser.unitIds && currentUser.unitIds.length > 0;

    const firestoreErrorHandler = (listenerName: string) => (err: any) => {
        console.error(`${listenerName} listener error:`, err);
        if (err.message.includes("index")) {
            setFirestoreError("Adatbázis index frissítés folyamatban...");
        }
    };

    const unsubUnitPerms = (currentUser.unitIds || []).map(unitId => 
      onSnapshot(doc(db, 'unit_permissions', unitId), doc => {
        if (doc.exists()) setUnitPermissions(prev => ({ ...prev, [unitId]: doc.data() }));
      })
    );

    let todosQueryRef;
    if (!isSuperAdmin && currentUser.unitIds?.length) {
      todosQueryRef = query(collection(db, 'todos'), where('unitId', 'in', currentUser.unitIds));
    } else {
      todosQueryRef = collection(db, 'todos');
    }
    const unsubTodos = onSnapshot(todosQueryRef, snapshot => setTodos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Todo))));

    let unsubAdminTodos = () => {};
    if (isSuperAdmin) {
        unsubAdminTodos = onSnapshot(collection(db, 'admin_todos'), snapshot => setAdminTodos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Todo))));
    }

    let shiftsQueryRef;
    if (currentUser.role !== 'Admin' && currentUser.unitIds?.length) {
      shiftsQueryRef = query(collection(db, 'shifts'), where('unitId', 'in', currentUser.unitIds));
    } else {
      shiftsQueryRef = collection(db, 'shifts');
    }
    const unsubShifts = onSnapshot(shiftsQueryRef, snapshot => setShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift))));

    let requestsQueryRef;
    if (isUnitAdmin) {
        requestsQueryRef = query(collection(db, 'requests'), where('unitId', 'in', currentUser.unitIds!));
    } else if (!isSuperAdmin) {
        requestsQueryRef = query(collection(db, 'requests'), where('userId', '==', currentUser.id));
    } else {
        requestsQueryRef = collection(db, 'requests');
    }
    const unsubRequests = onSnapshot(requestsQueryRef, snapshot => setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Request))));

    const timeEntriesQuery = query(collection(db, 'time_entries'), where('userId', '==', currentUser.id));
    const unsubTimeEntries = onSnapshot(timeEntriesQuery, snapshot => setTimeEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeEntry))));

    const unsubFeedback = (() => {
      let queryRef;
      if (!isSuperAdmin && currentUser.unitIds?.length) {
        queryRef = query(collectionGroup(db, 'feedback'), where('unitId', 'in', currentUser.unitIds), orderBy('unitId'), orderBy('createdAt', 'desc'));
        return onSnapshot(queryRef, snapshot => 
            setFeedbackList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Feedback)))
          , firestoreErrorHandler("Feedback"));
      }
      queryRef = collectionGroup(db, 'feedback');
      return onSnapshot(queryRef, snapshot => {
        const feedbackData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Feedback));
        feedbackData.sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setFeedbackList(feedbackData);
      }, firestoreErrorHandler("Feedback"));
    })();

    const unsubPolls = (() => {
      let queryRef;
      if (!isSuperAdmin && currentUser.unitIds?.length) {
        queryRef = query(collectionGroup(db, 'polls'), where('unitId', 'in', currentUser.unitIds), orderBy('unitId'), orderBy('createdAt', 'desc'));
        return onSnapshot(queryRef, snapshot =>
            setPolls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Poll)))
          , firestoreErrorHandler("Polls"));
      }
      queryRef = collectionGroup(db, 'polls');
      return onSnapshot(queryRef, snapshot => {
        const pollsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Poll));
        pollsData.sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setPolls(pollsData);
      }, firestoreErrorHandler("Polls"));
    })();

    return () => {
      unsubUnitPerms.forEach(unsub => unsub());
      unsubTodos();
      unsubAdminTodos();
      unsubShifts();
      unsubRequests();
      unsubTimeEntries();
      unsubFeedback();
      unsubPolls();
    };
  }, [currentUser, isDemoMode]);

  useEffect(() => {
    switch (appState) {
      case 'login': document.title = 'Sign in - mintleaf.hu'; break;
      case 'register': document.title = 'Regisztráció - mintleaf.hu'; break;
      case 'dashboard': document.title = 'Dashboard - mintleaf.hu'; break;
      default: document.title = 'MintLeaf';
    }
  }, [appState]);

  const handleLogout = async () => {
    if (isDemoMode) {
        window.location.href = window.location.pathname;
        return;
    }
    try { await signOut(auth); } catch (error) { console.error(error); }
  };

  const handleRegisterSuccess = () => {
    window.location.href = window.location.pathname;
  }

  switch (appState) {
    case 'public':
        if (publicPage?.type === 'reserve') return <ReservationPage unitId={publicPage.unitId} allUnits={allUnits} currentUser={currentUser} />;
        if (publicPage?.type === 'manage') return <ManageReservationPage token={publicPage.token} allUnits={allUnits} />;
        return <div className="fixed inset-0 flex items-center justify-center">Hiba: {publicPage?.message}</div>;
    case 'loading':
      return <div className="fixed inset-0 flex items-center justify-center"><LoadingSpinner /></div>;
    case 'register':
      return <div className="fixed inset-0 flex items-center justify-center"><Register inviteCode={inviteCode!} onRegisterSuccess={handleRegisterSuccess} /></div>;
    case 'dashboard':
      return (
        <UnitProvider currentUser={currentUser} allUnits={allUnits}>
          
          {/* Bridge: Propok helyes továbbítása a ThemeManagernek */}
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
            // Téma propok
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
            themeBases={themeBases}
            onThemeBasesChange={setPreviewBases}
            // Brand propok
            useBrandTheme={useBrandTheme}
            onBrandChange={setUseBrandTheme}
          />
        </UnitProvider>
      );
    case 'login':
    default:
      return <div className="fixed inset-0"><Login loginMessage={loginMessage} /></div>;
  }
};

export default App;
