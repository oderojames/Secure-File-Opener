import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: 'ai-engine-8c4e4',
  authDomain: 'ai-engine-8c4e4.firebaseapp.com',
  storageBucket: 'ai-engine-8c4e4.appspot.com',
  messagingSenderId: '',
  appId: '',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
