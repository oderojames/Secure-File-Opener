import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: 'tournament-ddcb7',
  authDomain: 'tournament-ddcb7.firebaseapp.com',
  storageBucket: 'tournament-ddcb7.appspot.com',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
