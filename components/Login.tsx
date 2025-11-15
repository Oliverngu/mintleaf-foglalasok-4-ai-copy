import React, { useState } from 'react';
import MintLeafLogo from './icons/AppleLogo';
import ArrowIcon from './icons/ArrowIcon';
import EyeIcon from './icons/EyeIcon';
import EyeSlashIcon from './icons/EyeSlashIcon';
import { auth, db } from '../firebase/config';
import { setPersistence, signInWithEmailAndPassword, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';

interface LoginProps {
  loginMessage?: { type: 'success' | 'error'; text: string } | null;
}

const Login: React.FC<LoginProps> = ({ loginMessage }) => {
  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInput && password) {
      setIsLoading(true);
      setError('');
      try {
        // Set persistence based on the "remember me" checkbox
        const persistence = rememberMe 
          ? browserLocalPersistence
          : browserSessionPersistence;
        await setPersistence(auth, persistence);

        let emailToLogin = loginInput.trim();
        const userName = loginInput.trim();

        // If input doesn't look like an email, assume it's a username and find the email
        if (!emailToLogin.includes('@')) {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('name', '==', emailToLogin), limit(1));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            setError('Hibás felhasználónév vagy jelszó.');
            setIsLoading(false);
            return;
          }
          const userData = snapshot.docs[0].data();
          emailToLogin = userData.email;

          if (!emailToLogin) {
            setError(`A(z) '${userName}' nevű felhasználói fiókhoz nem tartozik email cím. A bejelentkezés nem lehetséges. Kérjük, vedd fel a kapcsolatot egy adminisztrátorral.`);
            console.error(`User with name '${userName}' found, but has no email address in Firestore.`);
            setIsLoading(false);
            return;
          }
        }

        await signInWithEmailAndPassword(auth, emailToLogin, password);
        // onAuthStateChanged in App.tsx will handle successful login
      } catch (err: any) {
        switch (err.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            setError('Hibás felhasználónév/email vagy jelszó.');
            break;
          case 'auth/invalid-email':
            setError('Érvénytelen email formátum.');
            break;
          default:
            setError('Hiba a bejelentkezés során. Próbáld újra később.');
            console.error(err);
            break;
        }
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-5xl flex rounded-2xl shadow-2xl overflow-hidden bg-white">
            {/* Left Panel - Visuals */}
            <div className="w-1/2 hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-green-600 to-emerald-500 p-12 text-white text-center">
                <MintLeafLogo className="h-24 w-24 mb-6" />
                <h1 className="text-4xl font-bold mb-3">Üdvözlünk újra!</h1>
                <p className="text-lg text-green-100">
                    Jelentkezz be a fiókodba, hogy elérd a beosztásod és a legfrissebb információkat.
                </p>
            </div>

            {/* Right Panel - Form */}
            <div className="w-full md:w-1/2 p-8 sm:p-12 flex flex-col justify-center">
                <div className="w-full">
                    <div className="flex justify-center md:justify-start mb-4">
                        <MintLeafLogo className="h-14 w-14" />
                    </div>
                    
                    <h2 className="text-3xl font-bold text-gray-800 mb-2">Bejelentkezés</h2>
                    <p className="text-gray-600 mb-8">Kérjük, add meg az adataidat a folytatáshoz.</p>

                    {loginMessage && (
                        <div className={`p-3 rounded-lg mb-4 text-sm font-semibold ${
                          loginMessage.type === 'success' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {loginMessage.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="loginInput" className="text-sm font-medium text-gray-700">Email vagy felhasználónév</label>
                            <input
                                id="loginInput"
                                type="text"
                                value={loginInput}
                                onChange={(e) => setLoginInput(e.target.value)}
                                className="w-full mt-2 px-4 py-3 bg-gray-100 border-2 border-transparent rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                                required
                                autoFocus
                            />
                        </div>
                        <div>
                            <label htmlFor="passwordInput" className="text-sm font-medium text-gray-700">Jelszó</label>
                            <div className="relative mt-2">
                                <input
                                    id="passwordInput"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-100 border-2 border-transparent rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white pr-12 transition"
                                    required
                                />
                                 <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 px-4 flex items-center text-gray-500 hover:text-green-600"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                  >
                                    {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                  </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <label htmlFor="rememberMe" className="flex items-center text-sm text-gray-600 cursor-pointer">
                                <input
                                    id="rememberMe"
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                                />
                                <span className="ml-2">Bejelentkezve maradok</span>
                            </label>
                        </div>
                        
                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <div className="pt-2">
                            <button
                              type="submit"
                              disabled={!loginInput || !password || isLoading}
                              className="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-300"
                            >
                              {isLoading ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <>
                                    <span>Bejelentkezés</span>
                                    <ArrowIcon className="w-5 h-5 ml-2" />
                                </>
                              )}
                            </button>
                        </div>
                    </form>
                     <p className="text-center text-gray-400 text-xs mt-8">
                        Beta version by Oliver Nguyen
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default Login;