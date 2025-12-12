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
import AdminThemeEditor from './components/theme/AdminThemeEditor'; // Import ellenőrzése!

type AppState = 'login' | 'register' | 'dashboard' | 'loading' | 'public';
type LoginMessage = { type: 'success' | 'error'; text: string };
type PublicPage = { type: 'reserve'; unitId: string } | { type: 'manage'; token: string } | { type: 'error'; message: string };

// --- BRIDGE: PREVIEW TÁMOGATÁS ---
const ThemeManagerBridge: React.FC<{ 
  allUnits: Unit[]; 
  bases: ThemeBases; 
  previewBases: ThemeBases | null; // <--- ÚJ: Preview Config
  themeMode: ThemeMode; 
  useBrandTheme: boolean; 
}> = ({
  allUnits,
  bases,
  previewBases, // <--- ÚJ
  themeMode,
  useBrandTheme, 
}) => {
  const { selectedUnits } = useUnitContext();
  const activeUnit = selectedUnits.length ? allUnits.find(u => u.id === selectedUnits[0]) || null : null;

  // HA VAN PREVIEW (szerkesztés alatt), AZT HASZNÁLJUK!
  const activeConfig = previewBases || bases;

  return (
    <ThemeManager 
      activeUnit={activeUnit} 
      themeMode={themeMode}         
      useBrandTheme={useBrandTheme} 
      adminConfig={activeConfig} // Itt adjuk át a megfelelőt
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

  // Data States
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

  // --- THEME STATES ---
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadMode());
  const [themeBases, setThemeBases] = useState<ThemeBases>(() => loadBases());
  
  // ÚJ: LIVE PREVIEW STATE (Ez tárolja a szerkesztő ideiglenes állapotát)
  const [previewBases, setPreviewBases] = useState<ThemeBases | null>(null);

  const [useBrandTheme, setUseBrandTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('mintleaf_use_brand');
    return saved !== null ? saved === 'true' : true; 
  });

  // Globális téma betöltése
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

  // Effects
  useEffect(() => { saveMode(themeMode); }, [themeMode]);
  useEffect(() => { localStorage.setItem('mintleaf_use_brand', String(useBrandTheme)); }, [useBrandTheme]);

  // Init Logic (Authentication & Routing)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const isDemo = urlParams.get('demo') === 'true';
    const registerCode = urlParams.get('register');
    const isReservePage = pathname.startsWith('/reserve');
    const isManagePage = pathname.startsWith('/manage');

    if (isManagePage) {
        const token = urlParams.get('token');
        if (token) setPublicPage({ type: 'manage', token });
        else setPublicPage({ type: 'error', message: 'Nincs token.' });
    } else if (isReservePage) {
        const unitId = urlParams.get('unit');
        if (unitId) setPublicPage({ type: 'reserve', unitId });
        else setPublicPage({ type: 'error', message: 'Nincs unit ID.' });
    }

    if (isDemo) {
      setIsDemoMode(true);
      setCurrentUser(demoUser);
      // ... demo data setup ...
      setRequests(demoData.requests); setShifts(demoData.shifts); setTodos(demoData.todos);
      setAdminTodos(demoData.adminTodos); setAllUnits(demoData.allUnits); setAllUsers(demoData.allUsers);
      setAppState('dashboard');
      return; 
    }

    if (registerCode) {
        // ... register logic ...
        setInviteCode(registerCode);
        setAppState('register');
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
          // ... user fetching logic (simplified for brevity) ...
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
             setCurrentUser({ id: firebaseUser.uid, ...userDoc.data() } as User);
             setAppState('dashboard');
          } else {
             // First time setup logic here
             setCurrentUser({ id: firebaseUser.uid, email: firebaseUser.email, role: 'User', name: 'New' } as User);
             setAppState('dashboard');
          }
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

  const handleLogout = async () => { try { await signOut(auth); } catch(e){} };

  // --- RENDER ---
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
          
          {/* BRIDGE: Most már megkapja a PREVIEW-t is! */}
          <ThemeManagerBridge 
            allUnits={allUnits} 
            bases={themeBases} 
            previewBases={previewBases} // <--- PREVIEW ÁTADÁSA
            themeMode={themeMode} 
            useBrandTheme={useBrandTheme} 
          />

          <Dashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            isDemoMode={isDemoMode}
            // ... data props ...
            requests={requests} shifts={shifts} todos={todos} adminTodos={adminTodos}
            allUnits={allUnits} allUsers={allUsers} permissions={permissions} unitPermissions={unitPermissions}
            timeEntries={timeEntries} feedbackList={feedbackList} polls={polls}
            firestoreError={firestoreError}
            
            // THEME PROPS
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
            themeBases={themeBases} // Ez a mentett
            onThemeBasesChange={(newBases) => {
                // FONTOS: Ez a függvény hívódik meg az Editorból minden változtatáskor!
                // Itt állítjuk be a PREVIEW-t, hogy azonnal látszódjon.
                setPreviewBases(newBases);
            }}
            
            // BRAND PROPS
            useBrandTheme={useBrandTheme}
            onBrandChange={setUseBrandTheme}
          />
          
          {/* Editor kikapcsolásakor töröljük a preview-t */}
          {/* Ezt a logikát érdemes a Dashboardba tenni a "Close" gombra, 
              de egyelőre a save/cancel gombok kezelik az Editorban. */}

        </UnitProvider>
      );
    case 'login':
    default: return <Login loginMessage={loginMessage} />;
  }
};

export default App;
