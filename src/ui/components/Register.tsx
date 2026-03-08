import React, { useState, useEffect } from 'react';
import { auth, db, functions } from '../../core/firebase/config';
import { createUserWithEmailAndPassword, deleteUser, sendEmailVerification, updateProfile } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import MintLeafLogo from '../../../components/icons/AppleLogo';
import ArrowIcon from '../../../components/icons/ArrowIcon';
import EyeIcon from '../../../components/icons/EyeIcon';
import EyeSlashIcon from '../../../components/icons/EyeSlashIcon';
import { NICKNAME_TAKEN, saveNicknameForUser } from '../../core/auth/authHelpers';
import { enqueueQueuedEmail } from '../../core/services/emailQueueService';
import {
  isInvitationRedeemable,
  mapClaimRecoveryErrorMessage,
  resolveInvitationMode,
  validateClaimExistingInvitation,
} from './registerInvitationFlow';

interface RegisterProps {
  inviteCode: string;
  onRegisterSuccess: () => void;
}

const Register: React.FC<RegisterProps> = ({ inviteCode, onRegisterSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [username, setUsername] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [inviteDetails, setInviteDetails] = useState<{ 
      role: string; 
      unitId: string; 
      position: string; 
      prefilledLastName?: string;
      prefilledFirstName?: string;
      mode: 'create' | 'claim_existing';
      existingUserId?: string;
      email?: string;
      expiresAt?: { toDate: () => Date } | null;
    } | null>(null);

  useEffect(() => {
    const fetchInviteDetails = async () => {
      try {
        const inviteDoc = await getDoc(doc(db, 'invitations', inviteCode));
        if (inviteDoc.exists()) {
          const data = inviteDoc.data() || {};
          if (!isInvitationRedeemable(data as any)) {
            setError('A meghívó lejárt vagy már felhasznált.');
            return;
          }

          const claimValidationError = validateClaimExistingInvitation(data as any);
          if (claimValidationError) {
            setError(claimValidationError);
            return;
          }

          setInviteDetails({
            role: data?.role || 'User',
            unitId: data?.unitId || '',
            position: data?.position || '',
            prefilledLastName: data?.prefilledLastName,
            prefilledFirstName: data?.prefilledFirstName,
            mode: resolveInvitationMode(data as any),
            existingUserId: data?.existingUserId,
            email: data?.email,
            expiresAt: data?.expiresAt || null,
          });
          if (data?.prefilledLastName) {
              setLastName(data.prefilledLastName);
          }
          if (data?.prefilledFirstName) {
              setFirstName(data.prefilledFirstName);
          }
          if (typeof data?.email === 'string' && data.email.trim()) {
            setEmail(data.email.trim());
          }
        } else {
          setError('Érvénytelen meghívó kód.');
        }
      } catch (err) {
        setError('Hiba a meghívó adatainak lekérésekor.');
        console.error(err);
      }
    };
    fetchInviteDetails();
  }, [inviteCode]);

  const getClaimFinalizeErrorMessage = (code?: string) => {
    switch (code) {
      case 'already-exists':
        return 'Ez a felhasználó már egy másik fiókhoz van kapcsolva.';
      case 'deadline-exceeded':
        return 'A meghívó lejárt.';
      case 'failed-precondition':
        return 'A meghívó már nem használható fel.';
      case 'not-found':
        return 'A meghívóhoz tartozó felhasználó nem található.';
      default:
        return 'Hiba a meglévő felhasználó aktiválása során. Próbáld újra később.';
    }
  };


  const claimEmailInUseRecoveryMessage =
    'Ehhez az email címhez már tartozik egy fiók. Ha ez egy korábbi félbeszakadt regisztráció, próbáld újra pár másodperc múlva.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('A két jelszó nem egyezik.');
      return;
    }
    if (!inviteDetails) {
        setError('A meghívó adatai még töltődnek, vagy érvénytelenek.');
        return;
    }
    setIsLoading(true);
    setError('');

    try {
      const trimmedUsername = username.trim();
      const inviteMode = resolveInvitationMode(inviteDetails as any);
      const finalizeClaim = httpsCallable<
        { inviteCode: string; profile: Record<string, unknown> },
        { ok: boolean; userId: string }
      >(functions, 'finalizeClaimExistingInvitation');
      const cleanupFailedClaim = httpsCallable<
        { inviteCode: string; email: string },
        { ok: boolean; deleted: boolean; reason?: string }
      >(functions, 'cleanupFailedClaimExistingAuthUser');
      const recoverClaimExistingOrphan = httpsCallable<
        { inviteCode: string; email: string },
        { ok: boolean; deleted: boolean; reason?: string }
      >(functions, 'recoverClaimExistingOrphanByEmail');

      const runClaimExistingRegistrationAttempt = async () => {
        const normalizedEmail = email.trim();
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const user = userCredential.user;
        if (!user) throw new Error('User creation failed.');

        await saveNicknameForUser(user.uid, normalizedEmail, trimmedUsername);
        await sendEmailVerification(user);

        const userFullName = `${lastName.trim()} ${firstName.trim()}`;
        await updateProfile(user, {
          displayName: userFullName,
        });

        const userDataForDb = {
          name: trimmedUsername,
          nickname: trimmedUsername,
          nicknameLower: trimmedUsername.toLowerCase(),
          lastName: lastName.trim(),
          firstName: firstName.trim(),
          fullName: userFullName,
          email: normalizedEmail,
          role: inviteDetails.role,
          unitIds: [inviteDetails.unitId],
          position: inviteDetails.position,
          registrationEmailSent: true,
          notifications: {
            newSchedule: true,
          },
        };

        try {
          await finalizeClaim({
            inviteCode,
            profile: {
              name: userDataForDb.name,
              nickname: userDataForDb.nickname,
              nicknameLower: userDataForDb.nicknameLower,
              lastName: userDataForDb.lastName,
              firstName: userDataForDb.firstName,
              fullName: userDataForDb.fullName,
              email: userDataForDb.email,
              registrationEmailSent: true,
            },
          });
        } catch (claimError: any) {
          try {
            await deleteUser(user);
          } catch (rollbackError) {
            console.error('Failed to rollback auth user after claim_existing error:', rollbackError);
          }

          try {
            await cleanupFailedClaim({
              inviteCode,
              email: normalizedEmail,
            });
          } catch (cleanupError) {
            console.error('Failed to cleanup orphaned auth user after claim_existing error:', cleanupError);
          }

          const mappedError: any = new Error('Claim finalize failed');
          mappedError.code = 'claim-finalize-failed';
          mappedError.userMessage = getClaimFinalizeErrorMessage(claimError?.code);
          throw mappedError;
        }

        return userDataForDb;
      };

      if (inviteMode === 'claim_existing') {
        let claimResultData;
        try {
          claimResultData = await runClaimExistingRegistrationAttempt();
        } catch (claimAttemptError: any) {
          if (claimAttemptError?.code === 'claim-finalize-failed') {
            setError(claimAttemptError?.userMessage || getClaimFinalizeErrorMessage());
            setIsLoading(false);
            return;
          }

          if (claimAttemptError?.code === 'auth/email-already-in-use') {
            try {
              const recoveryResult = await recoverClaimExistingOrphan({
                inviteCode,
                email: email.trim(),
              });

              if (!recoveryResult.data?.deleted) {
                setError(claimEmailInUseRecoveryMessage);
                setIsLoading(false);
                return;
              }
            } catch (recoveryError) {
              const recoveryCode = recoveryError?.code;
              const recoveryDetails = recoveryError?.details;
              console.error('Failed to recover claim_existing orphan auth user:', {
                code: recoveryCode,
                message: recoveryError?.message,
                details: recoveryDetails,
                raw: recoveryError,
              });
              setError(mapClaimRecoveryErrorMessage(claimEmailInUseRecoveryMessage, recoveryCode, recoveryDetails));
              setIsLoading(false);
              return;
            }

            try {
              claimResultData = await runClaimExistingRegistrationAttempt();
            } catch (retryError: any) {
              if (retryError?.code === 'claim-finalize-failed') {
                setError(retryError?.userMessage || getClaimFinalizeErrorMessage());
              } else if (retryError?.code === 'auth/email-already-in-use') {
                setError(claimEmailInUseRecoveryMessage);
              } else {
                throw retryError;
              }
              setIsLoading(false);
              return;
            }
          } else {
            throw claimAttemptError;
          }
        }

        await enqueueQueuedEmail('register_welcome', null, {
          name: claimResultData.firstName,
          email: claimResultData.email,
        });

        onRegisterSuccess();
        return;
      }

      // create mode unchanged
      const normalizedEmail = email.trim();
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;
      if (!user) throw new Error('User creation failed.');

      await saveNicknameForUser(user.uid, normalizedEmail, trimmedUsername);
      await sendEmailVerification(user);

      const userFullName = `${lastName.trim()} ${firstName.trim()}`;
      await updateProfile(user, {
        displayName: userFullName,
      });

      const userDataForDb = {
        name: trimmedUsername,
        nickname: trimmedUsername,
        nicknameLower: trimmedUsername.toLowerCase(),
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        fullName: userFullName,
        email: normalizedEmail,
        role: inviteDetails.role,
        unitIds: [inviteDetails.unitId],
        position: inviteDetails.position,
        registrationEmailSent: true,
        notifications: {
          newSchedule: true,
        },
      };

      await setDoc(doc(db, 'users', user.uid), userDataForDb);

      await updateDoc(doc(db, 'invitations', inviteCode), {
        status: 'used',
        usedBy: user.uid,
        usedAt: new Date(),
      });

      await enqueueQueuedEmail('register_welcome', null, {
        name: userDataForDb.firstName,
        email: userDataForDb.email,
      });

      onRegisterSuccess();
    } catch (err: any) {
      switch (err.code) {
        case NICKNAME_TAKEN:
          setError('Ez a felhasználónév már foglalt.');
          break;
        case 'auth/email-already-in-use':
          setError('Ezzel az email címmel már regisztráltak.');
          break;
        case 'auth/invalid-email':
          setError('Érvénytelen email formátum.');
          break;
        case 'auth/weak-password':
          setError('A jelszó túl gyenge. Legalább 6 karakter hosszú legyen.');
          break;
        default:
          setError('Hiba a regisztráció során. Próbáld újra később.');
          console.error(err);
          break;
      }
      setIsLoading(false);
    }
  };

  if (!inviteDetails && !error) {
    return (
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
             <div className="flex justify-center mb-4"><MintLeafLogo /></div>
             <p>Meghívó ellenőrzése...</p>
        </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
      <div className="flex justify-center mb-4">
        <MintLeafLogo />
      </div>
      
      <h1 className="text-3xl font-bold text-gray-800 mb-1">MintLeaf</h1>
      <p className="text-xl text-gray-600 mb-6">Regisztráció</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-4">
            <input 
                type="text" 
                value={lastName} 
                onChange={(e) => setLastName(e.target.value)} 
                placeholder="Vezetéknév" 
                required 
                autoFocus 
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow ${
                    inviteDetails?.prefilledLastName ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                readOnly={!!inviteDetails?.prefilledLastName}
            />
             <input 
                type="text" 
                value={firstName} 
                onChange={(e) => setFirstName(e.target.value)} 
                placeholder="Keresztnév" 
                required 
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow ${
                    inviteDetails?.prefilledFirstName ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                readOnly={!!inviteDetails?.prefilledFirstName}
            />
        </div>
        <div><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Felhasználónév" required className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"/></div>
        <div><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email cím" required className={`w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 ${inviteDetails?.email ? 'bg-gray-100 cursor-not-allowed' : ''}`} readOnly={!!inviteDetails?.email}/></div>
        <div className="relative">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Jelszó" required className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 pr-12"/>
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-4 flex items-center text-gray-500 hover:text-green-600">
              {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
        </div>
        <div className="relative">
            <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Jelszó megerősítése" required className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 pr-12"/>
            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 px-4 flex items-center text-gray-500 hover:text-green-600">
              {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
        </div>
        
        {error && <p className="text-red-500 text-sm pt-2">{error}</p>}

        <div className="pt-2">
            <button type="submit" disabled={isLoading} className="w-12 h-12 bg-green-700 text-white rounded-full flex items-center justify-center mx-auto hover:bg-green-800 disabled:bg-gray-400">
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <ArrowIcon className="w-5 h-5" />
              )}
            </button>
        </div>
      </form>
    </div>
  );
};

export default Register;
