import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import ReservationPage from './components/public/ReservationPage';
import ManageReservationPage from './components/public/ManageReservationPage'; // Új import
import { User, Request, Booking, Shift, Todo, Unit, RolePermissions, Permissions, demoUser, demoUnit, demoData, TimeEntry, Feedback, Poll } from '../core/models/data';
import { auth, db } from '../core/firebase/config';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { collection, collectionGroup, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, where, orderBy } from 'firebase/firestore';
import LoadingSpinner from '../../components/LoadingSpinner';
import { UnitProvider } from './context/UnitContext';

type AppState = 'login' | 'register' | 'dashboard' | 'loading' | 'public';
type LoginMessage = { type: 'success' | 'error'; text: string };
// Bővítettük a PublicPage típust a 'manage' állapottal
type PublicPage = { type: 'reserve'; unitId: string } | { type: 'manage'; token: string } | { type: 'error'; message: string };

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('loading');
  const [publicPage, setPublicPage] = useState<PublicPage | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<LoginMessage | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // --- Data States lifted from Dashboard ---
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


  useEffect(() => {
    // Check for URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const isDemo = urlParams.get('demo') === 'true';
    const registerCode = urlParams.get('register');
    const isReservePage = pathname.startsWith('/reserve');
    const isManagePage = pathname.startsWith('/manage'); // Új ellenőrzés

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

    // --- 1. Handle Demo Mode ---
    if (isDemo) {
      setIsDemoMode(true);
      setCurrentUser(demoUser);
      // Populate state with demo data
      setRequests(demoData.requests);
      setShifts(demoData.shifts);
      setTodos(demoData.todos);
      setAdminTodos(demoData.adminTodos);
      setAllUnits(demoData.allUnits);
      setAllUsers(demoData.allUsers);
      setTimeEntries([]);
      setFeedbackList([]);
      setPolls([]);
      // Set dummy permissions for demo user to see nav items
      setPermissions({ 'Demo User': { canSubmitLeaveRequests: true, canManageTodos: true } });
      setAppState('dashboard');
      return; // Stop processing, we are in demo mode.
    }

    // --- 2. Handle Registration ---
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
      return; // Stop processing, we are in registration mode.
    }

    // --- 3. Handle Standard Authentication ---
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
            if (data?.unitIds && Array.isArray(data.unitIds)) {
                userUnits = data.unitIds;
            } else if (data?.unitId) {
                userUnits = [data.unitId];
            }
            
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
            // This case handles the very first user registering or a user whose DB entry was deleted
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
          console.error("Error fetching or creating user data:", error);
          await signOut(auth);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }

      // Now, determine the final app state
      if (isReservePage || isManagePage) {
        setAppState('public');
      } else if (finalUserData) {
        setAppState('dashboard');
      } else {
        setAppState('login');
      }
    });

    return () => unsubscribe();
  }, []);


  // --- DATA LISTENERS MOVED FROM DASHBOARD ---
  useEffect(() => {
    if (isDemoMode) return;
    const unsubUsers = onSnapshot(collection(db, 'users'), snapshot => setAllUsers(snapshot.docs.map(doc => {
        const data = doc.data();
        const lastName = data.lastName || '';
        const firstName = data.firstName || '';
        return { 
            id: doc.id, 
            ...data,
            fullName: data.fullName || `${lastName} ${firstName}`.trim(),
        } as User
    })));
    const unsubUnits = onSnapshot(collection(db, 'units'), snapshot => {
        const unitsFromDb = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit));
        setAllUnits(unitsFromDb);
    });
    const unsubPerms = onSnapshot(collection(db, 'permissions'), snapshot => {
        const perms: RolePermissions = {};
        snapshot.forEach(doc => { perms[doc.id as User['role']] = doc.data() as Partial<Permissions>; });
        setPermissions(perms);
    });
    return () => { unsubUsers(); unsubUnits(); unsubPerms(); };
  }, [isDemoMode]);
  
  // Data listeners that depend on currentUser
  useEffect(() => {
    if (!currentUser || isDemoMode) return;
    setFirestoreError(null);

    const isSuperAdmin = currentUser.role === 'Admin';
    const isUnitAdmin = currentUser.role === 'Unit Admin' && currentUser.unitIds && currentUser.unitIds.length > 0;

    const firestoreErrorHandler = (listenerName: string) => (err: any) => {
        console.error(`${listenerName} listener error:`, err);
        if (err.message.includes("currently building") || err.message.includes("The query requires an index")) {
            setFirestoreError("Az adatbázis indexek frissülnek a háttérben. Ez néhány percig is eltarthat. A funkciók korlátozottak lehetnek, amíg a folyamat befejeződik. Kérjük, próbálja meg később frissíteni az oldalt.");
        }
    };

    // Unit Permissions
    const unsubUnitPerms = (currentUser.unitIds || []).map(unitId => 
      onSnapshot(doc(db, 'unit_permissions', unitId), doc => {
        if (doc.exists()) setUnitPermissions(prev => ({ ...prev, [unitId]: doc.data() }));
      })
    );

    // Todos
    let todosQueryRef;
    if (!isSuperAdmin && currentUser.unitIds && currentUser.unitIds.length > 0) {
      todosQueryRef = query(collection(db, 'todos'), where('unitId', 'in', currentUser.unitIds));
    } else {
      todosQueryRef = collection(db, 'todos');
    }
    const unsubTodos = onSnapshot(todosQueryRef, snapshot => setTodos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Todo))));

    // Admin Todos
    let unsubAdminTodos = () => {};
    if (isSuperAdmin) {
        unsubAdminTodos = onSnapshot(collection(db, 'admin_todos'), snapshot => setAdminTodos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Todo))));
    }

    // Shifts
    let shiftsQueryRef;
    if (currentUser.role !== 'Admin' && currentUser.unitIds && currentUser.unitIds.length > 0) {
      shiftsQueryRef = query(collection(db, 'shifts'), where('unitId', 'in', currentUser.unitIds));
    } else {
      shiftsQueryRef = collection(db, 'shifts');
    }
    const unsubShifts = onSnapshot(shiftsQueryRef, snapshot => setShifts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift))));

    // Requests
    let requestsQueryRef;
    if (isUnitAdmin) {
        requestsQueryRef = query(collection(db, 'requests'), where('unitId', 'in', currentUser.unitIds!));
    } else if (!isSuperAdmin) {
        requestsQueryRef = query(collection(db, 'requests'), where('userId', '==', currentUser.id));
    } else {
        requestsQueryRef = collection(db, 'requests');
    }
    const unsubRequests = onSnapshot(requestsQueryRef, snapshot => setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Request))));
    
    // Time Entries (Clock-in/out)
    const timeEntriesQuery = query(collection(db, 'time_entries'), where('userId', '==', currentUser.id));
    const unsubTimeEntries = onSnapshot(timeEntriesQuery, snapshot => setTimeEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeEntry))));

    // Feedback
    const unsubFeedback = (() => {
      let queryRef;
      if (!isSuperAdmin && currentUser.unitIds && currentUser.unitIds.length > 0) {
        // For 'in' queries, the first orderBy must be on the same field.
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

    // Polls
    const unsubPolls = (() => {
      let queryRef;
      if (!isSuperAdmin && currentUser.unitIds && currentUser.unitIds.length > 0) {
        // For 'in' queries, the first orderBy must be on the same field.
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
      case 'login':
        document.title = 'Sign in - mintleaf.hu';
        break;
      case 'register':
        document.title = 'Regisztráció - mintleaf.hu';
        break;
      case 'dashboard':
        document.title = 'Dashboard - mintleaf.hu';
        break;
      case 'public':
         if(publicPage?.type === 'reserve') document.title = 'Foglalás - mintleaf.hu';
         else if (publicPage?.type === 'manage') document.title = 'Foglalás kezelése - mintleaf.hu';
        break;
      case 'loading':
        document.title = 'MintLeaf';
        break;
      default:
        document.title = 'MintLeaf';
    }
  }, [appState, publicPage]);

  const handleLogout = async () => {
    if (isDemoMode) {
        window.location.href = window.location.pathname; // Reload without query params
        return;
    }
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };
  
  const handleRegisterSuccess = () => {
    // onRegisterSuccess is called after a user is created and automatically signed in by Firebase Auth.
    // We reload the page to re-trigger the entire app initialization.
    // The onAuthStateChanged listener will then pick up the signed-in user and navigate to the dashboard.
    // This also clears any URL params like ?register=... from the URL.
    window.location.href = window.location.pathname;
  }

  switch (appState) {
    case 'public':
        if (publicPage?.type === 'reserve') {
            return <ReservationPage unitId={publicPage.unitId} allUnits={allUnits} currentUser={currentUser} />;
        }
        if (publicPage?.type === 'manage') {
            return <ManageReservationPage token={publicPage.token} allUnits={allUnits} />;
        }
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-gray-50 p-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-red-600">Hiba</h1>
                    <p className="mt-2 text-gray-700">{publicPage?.message || 'Ismeretlen hiba történt.'}</p>
                </div>
            </div>
        );
    case 'loading':
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
          <LoadingSpinner />
        </div>
      );
    case 'register':
      return (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100">
          <Register inviteCode={inviteCode!} onRegisterSuccess={handleRegisterSuccess} />
        </div>
      );
    case 'dashboard':
      return (
        <UnitProvider currentUser={currentUser} allUnits={allUnits}>
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