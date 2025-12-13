import { signInWithEmailAndPassword } from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { cleanFirestoreData } from '@/lib/firestoreCleaners';
import { auth, db } from '../firebase/config';

export const AUTH_USERNAME_NOT_FOUND = 'AUTH_USERNAME_NOT_FOUND';
export const NICKNAME_TAKEN = 'NICKNAME_TAKEN';

export interface SaveNicknameOptions {
  previousNicknameLower?: string | null;
}

export async function loginWithEmailOrNickname(identifier: string, password: string) {
  const trimmed = identifier.trim();

  // Ha emailnek tűnik → sima email+jelszó login
  if (trimmed.includes('@')) {
    return signInWithEmailAndPassword(auth, trimmed, password);
  }

  // Különben nickname → email lookup a "nicknames" collectionből
  const nickLower = trimmed.toLowerCase();
  const nicknameRef = doc(db, 'nicknames', nickLower);
  const nicknameSnap = await getDoc(nicknameRef);

  if (!nicknameSnap.exists()) {
    const error: any = new Error('Nincs ilyen felhasználónév.');
    error.code = AUTH_USERNAME_NOT_FOUND;
    throw error;
  }

  const data = nicknameSnap.data();
  const emailFromNickname = data.email as string | undefined;

  if (!emailFromNickname) {
    const error: any = new Error('Nincs ilyen felhasználónév.');
    error.code = AUTH_USERNAME_NOT_FOUND;
    throw error;
  }

  // Itt már emailt találtunk → sima email login
  return signInWithEmailAndPassword(auth, emailFromNickname, password);
}

export async function saveNicknameForUser(
  uid: string,
  email: string,
  nickname: string,
  options: SaveNicknameOptions = {}
) {
  const nickTrimmed = nickname.trim();
  if (!nickTrimmed) {
    const error: any = new Error('A felhasználónév megadása kötelező.');
    error.code = 'NICKNAME_REQUIRED';
    throw error;
  }

  const nickLower = nickTrimmed.toLowerCase();
  const nicknameRef = doc(db, 'nicknames', nickLower);
  const nicknameSnap = await getDoc(nicknameRef);

  if (nicknameSnap.exists()) {
    const existing = nicknameSnap.data();
    if (existing.uid && existing.uid !== uid) {
      const error: any = new Error('Ez a felhasználónév már foglalt.');
      error.code = NICKNAME_TAKEN;
      throw error;
    }
  }

  const nicknamePayload = cleanFirestoreData({
    nickname: nickTrimmed,
    uid,
  });

  // Firestore rejects undefined values, so the payload must be cleaned before writing.
  await setDoc(nicknameRef, nicknamePayload);

  if (options.previousNicknameLower && options.previousNicknameLower !== nickLower) {
    await deleteDoc(doc(db, 'nicknames', options.previousNicknameLower));
  }

  const userRef = doc(db, 'users', uid);
  await setDoc(
    userRef,
    cleanFirestoreData({
      name: nickTrimmed,
      nickname: nickTrimmed,
      nicknameLower: nickLower,
    }),
    { merge: true }
  );

  return { nickname: nickTrimmed, nicknameLower: nickLower };
}
