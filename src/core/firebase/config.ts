import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCB7ZTAhDlRwueGW6jqDdMqmpfHOI62mtE",
  authDomain: "mintleaf-74d27.firebaseapp.com",
  projectId: "mintleaf-74d27",
  storageBucket: "mintleaf-74d27.firebasestorage.app",
  messagingSenderId: "1053273095803",
  appId: "1:1053273095803:web:84670303a5324c0d816cde",
  measurementId: "G-2Y86CZ0633",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// DEV MODE FIX: Disabling IndexedDB to avoid Firestore INTERNAL ASSERTION bug on Cloud Shell / Vite dev.
// Use in-memory cache during development; keep persistent cache for production builds. Easily revertable when SDK is fixed.
const firestoreCache = import.meta.env.DEV
  ? { localCache: memoryLocalCache() }
  : { localCache: persistentLocalCache() };

export const auth = getAuth(app);
export const db = initializeFirestore(app, firestoreCache);

// ✅ csak egyszer exportáld, explicit bucket URL-lel
export const storage = getStorage(app, "gs://mintleaf-74d27.firebasestorage.app");

export { Timestamp, serverTimestamp };
