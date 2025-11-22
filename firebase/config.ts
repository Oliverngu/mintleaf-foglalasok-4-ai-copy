import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, Timestamp, serverTimestamp } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCB7ZTAhDlRwueGW6jqDdMqmpfHOI62mtE",
  authDomain: "mintleaf-74d27.firebaseapp.com",
  projectId: "mintleaf-74d27",
  storageBucket: "mintleaf-74d27.firebasestorage.app",
  messagingSenderId: "1053273095803",
  appId: "1:1053273095803:web:84670303a5324c0d816cde",
  measurementId: "G-2Y86CZ0633"
};

const bucket = "gs://mintleaf-74d27.firebasestorage.app"; 
// ha a console tetején gs://mintleaf-74d27.firebasestorage.app van, akkor AZT írd ide

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { Timestamp, serverTimestamp };
export const storage = getStorage(app, "gs://mintleaf-74d27.firebasestorage.app");
