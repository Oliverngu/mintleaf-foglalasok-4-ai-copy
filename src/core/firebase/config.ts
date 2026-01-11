import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, Timestamp, serverTimestamp } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
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

export const auth = getAuth(app);
const isDev = process.env.NODE_ENV !== "production";
export const db = isDev
  // Dev-only long polling helps CloudShell/proxy/mobile environments avoid transport aborts.
  ? initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false })
  : getFirestore(app);
export const functions = getFunctions(app, "europe-west3");

// ✅ csak egyszer exportáld, explicit bucket URL-lel
export const storage = getStorage(app, "gs://mintleaf-74d27.firebasestorage.app");

export { Timestamp, serverTimestamp };
