import { signInWithEmailAndPassword } from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export const AUTH_USERNAME_NOT_FOUND = 'AUTH_USERNAME_NOT_FOUND';
export const NICKNAME_TAKEN = 'NICKNAME_TAKEN';

export interface SaveNicknameOptions {
  previousNicknameLower?: string | null;
}

export async function loginWithEmailOrNickname(identifier: string, password: string) {
  const trimmed = identifier.trim();

  if (trimmed.includes('@')) {
    return signInWithEmailAndPassword(auth, trimmed, password);
  }

  const nickLower = trimmed.toLowerCase();
  const nicknameRef = doc(db, 'nicknames', nickLower);
  const nicknameSnap = await getDoc(nicknameRef);

  if (!nicknameSnap.exists()) {
    const error: any = new Error('Nincs ilyen felhasználónév.');
    error.code = AUTH_USERNAME_NOT_FOUND;
    throw error;
  }

  const data = nicknameSnap.data();
  const uidFromNickname = data.uid as string | undefined;

  if (!uidFromNickname) {
    const error: any = new Error('Nincs ilyen felhasználónév.');
    error.code = AUTH_USERNAME_NOT_FOUND;
    throw error;
  }

  const userRef = doc(db, 'users', uidFromNickname);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const error: any = new Error('Nincs ilyen felhasználónév.');
    error.code = AUTH_USERNAME_NOT_FOUND;
    throw error;
  }

  const userData = userSnap.data();
  const emailFromUser = userData.email as string | undefined;

  if (!emailFromUser) {
    const error: any = new Error('A felhasználóhoz nem tartozik email.');
    error.code = AUTH_USERNAME_NOT_FOUND;
    throw error;
  }

  return signInWithEmailAndPassword(auth, emailFromUser, password);
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

  await setDoc(nicknameRef, {
    nickname: nickTrimmed,
    uid,
  });

  if (options.previousNicknameLower && options.previousNicknameLower !== nickLower) {
    await deleteDoc(doc(db, 'nicknames', options.previousNicknameLower));
  }

  const userRef = doc(db, 'users', uid);
  await setDoc(
    userRef,
    {
      name: nickTrimmed,
      nickname: nickTrimmed,
      nicknameLower: nickLower,
    },
    { merge: true }
  );

  return { nickname: nickTrimmed, nicknameLower: nickLower };
}
