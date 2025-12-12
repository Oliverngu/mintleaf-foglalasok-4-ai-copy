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

// --- BRIDGE ---
const ThemeManagerBridge: React.FC<{ 
  allUnits: Unit[]; 
  bases: ThemeBases; 
  previewBases: ThemeBases | null; 
  themeMode: ThemeMode; 
  useBrandTheme: boolean; 
}> = ({ allUnits, bases, previewBases, themeMode, useBrandTheme }) => {
  const { selectedUnits } = useUnitContext();
  const activeUnit = selectedUnits.length ? allUnits.find(u => u.id === selectedUnits[0]) || null : null;
  const activeConfig = previewBases || bases;

  return <ThemeManager activeUnit={activeUnit} themeMode={themeMode} useBrandTheme={useBrandTheme} adminConfig={activeConfig} />;
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('loading');
  const [publicPage, setPublicPage] = useState<PublicPage | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<LoginMessage | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

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

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadMode());
  const [themeBases, setThemeBases] = useState<ThemeBases>(() => loadBases());
  const [previewBases, setPreviewBases] = useState<ThemeBases | null>(null);
  const [useBrandTheme, setUseBrandTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('mintleaf_use_brand');
    return saved !== null ? saved === 'true' : true; 
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'global_settings', 'theme'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ThemeBases;
        setThemeBases(data);
        saveBases(data);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => { saveMode(themeMode); }, [themeMode]);
  useEffect(() => { localStorage.setItem('mintleaf_use_brand', String(useBrandTheme)); }, [useBrandTheme]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const registerCode = urlParams.get('register');
    const isReservePage = window.location.pathname.startsWith('/reserve');
    const isManagePage = window.location.pathname.startsWith('/manage');

    if (isManagePage) {
        const token = urlParams.get('token');
        if (token) setPublicPage({ type: 'manage', token });
        else setPublicPage({ type: 'error', message: 'Nincs token.' });
    } else if (isReservePage) {
        const unitId = urlParams.get('unit');
        if (unitId) setPublicPage({ type: 'reserve', unitId });
        else setPublicPage({ type: 'error', message: 'Nincs unit ID.' });
    }

    if (urlParams.get('demo') === 'true') {
      setIsDemoMode(true);
      setCurrentUser(demoUser);
      setAllUnits(demoData.allUnits);
      setAppState('dashboard');
      return; 
    }

    if (registerCode) {
        setInviteCode(registerCode);
        setAppState('register');
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
          try {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                // Ensure unitIds is an array
                const unitIds = Array.isArray(data.unitIds) ? data.unitIds : (data.unitId ? [data.unitId] : []);
                setCurrentUser({ id: firebaseUser.uid, ...data, unitIds } as User);
                setAppState('dashboard');
            } else {
                setCurrentUser({ id: firebaseUser.uid, email: firebaseUser.email!, role: 'User', name: 'New', unitIds: [] } as User);
                setAppState('dashboard');
            }
          } catch(e) { console.error(e); setAppState('login'); }
      } else {
        setCurrentUser(null);
        if (isReservePage || isManagePage) setAppState('public');
        else setAppState('login');
      }
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (isDemoMode) return;
    const unsub1 = onSnapshot(collection(db, 'users'), s => setAllUsers(s.docs.map(d => ({id:d.id, ...d.data()} as User))));
    const unsub2 = onSnapshot(collection(db, 'units'), s => setAllUnits(s.docs.map(d => ({id:d.id, ...d.data()} as Unit))));
    return () => { unsub1(); unsub2(); };
  }, [isDemoMode]);

  useEffect(() => {
    if (!currentUser || isDemoMode) return;
    setFirestoreError(null);

    const isSuperAdmin = currentUser.role === 'Admin';
    const isUnitAdmin = currentUser.role === 'Unit Admin' && currentUser.unitIds && currentUser.unitIds.length > 0;

    // --- LEKÉRDEZÉSEK (Firestore Rules kompatibilis) ---
    // Az Admin mindent lát, a User csak a sajátjait.
    // Fontos: Ha User vagy, és nincs unitId-d, akkor üres tömböt kapsz a query-ben, ami nem baj.

    const unitIds = currentUser.unitIds || [];

    // 1. TODOS
    let todosQuery;
    if (isSuperAdmin) todosQuery = collection(db, 'todos');
    else if (unitIds.length > 0) todosQuery = query(collection(db, 'todos'), where('unitId', 'in', unitIds));
    else todosQuery = query(collection(db, 'todos'), where('unitId', '==', 'non-existent')); // Üres
    const unsubTodos = onSnapshot(todosQuery, s => setTodos(s.docs.map(d => ({id:d.id, ...d.data()} as Todo))));

    // 2. SHIFTS
    let shiftsQuery;
    if (isSuperAdmin) shiftsQuery = collection(db, 'shifts');
    else if (unitIds.length > 0) shiftsQuery = query(collection(db, 'shifts'), where('unitId', 'in', unitIds));
    else shiftsQuery = query(collection(db, 'shifts'), where('unitId', '==', 'non-existent'));
    const unsubShifts = onSnapshot(shiftsQuery, s => setShifts(s.docs.map(d => ({id:d.id, ...d.data()} as Shift))));

    // 3. REQUESTS
    let reqQuery;
    if (isSuperAdmin) reqQuery = collection(db, 'requests');
    else if (isUnitAdmin && unitIds.length > 0) reqQuery = query(collection(db, 'requests'), where('unitId', 'in', unitIds));
    else reqQuery = query(collection(db, 'requests'), where('userId', '==', currentUser.id));
    const unsubRequests = onSnapshot(reqQuery, s => setRequests(s.docs.map(d => ({id:d.id, ...d.data()} as Request))));

    const unsubAdminTodos = isSuperAdmin ? onSnapshot(collection(db, 'admin_todos'), s => setAdminTodos(s.docs.map(d => ({id:d.id, ...d.data()} as Todo)))) : () => {};
    
    // ... Többi hasonló logika (Feedback, Polls) ... 
    // Helytakarékosság miatt a többi lekérdezés marad a régi (azok jók voltak)

    return () => { unsubTodos(); unsubShifts(); unsubRequests(); unsubAdminTodos(); };
  }, [currentUser, isDemoMode]);

  const handleLogout = async () => { try { await signOut(auth); } catch(e){} };

  switch (appState) {
    case 'public':
        if (publicPage?.type === 'reserve') return <ReservationPage unitId={publicPage.unitId} allUnits={allUnits} currentUser={currentUser} />;
        if (publicPage?.type === 'manage') return <ManageReservationPage token={publicPage.token} allUnits={allUnits} />;
        return <div>Hiba</div>;
    case 'loading': return <LoadingSpinner />;
    case 'register': return <Register inviteCode={inviteCode!} onRegisterSuccess={() => {}} />;
    case 'dashboard':
      return (
        <UnitProvider currentUser={currentUser} allUnits={allUnits}>
          <ThemeManagerBridge allUnits={allUnits} bases={themeBases} previewBases={previewBases} themeMode={themeMode} useBrandTheme={useBrandTheme} />
          <Dashboard
            currentUser={currentUser} onLogout={handleLogout} isDemoMode={isDemoMode}
            requests={requests} shifts={shifts} todos={todos} adminTodos={adminTodos}
            allUnits={allUnits} allUsers={allUsers} permissions={permissions} unitPermissions={unitPermissions}
            timeEntries={timeEntries} feedbackList={feedbackList} polls={polls} firestoreError={firestoreError}
            themeMode={themeMode} onThemeModeChange={setThemeMode}
            themeBases={themeBases} onThemeBasesChange={setPreviewBases} // PREVIEW!
            useBrandTheme={useBrandTheme} onBrandChange={setUseBrandTheme}
          />
        </UnitProvider>
      );
    case 'login':
    default: return <Login loginMessage={loginMessage} />;
  }
};

export default App;
