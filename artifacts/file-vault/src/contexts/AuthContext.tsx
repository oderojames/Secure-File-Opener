import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
  reload,
} from 'firebase/auth';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, googleProvider, db } from '@/lib/firebase';

interface AuthUser extends User {
  role?: 'retailer' | 'wholesaler';
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ role: 'retailer' | 'wholesaler' }>;
  signUpWithEmail: (name: string, email: string, password: string, role?: 'retailer' | 'wholesaler', businessType?: string) => Promise<void>;
  signInWithGoogle: (role?: 'retailer' | 'wholesaler') => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureUserDoc(user: User, role: 'retailer' | 'wholesaler' = 'retailer', businessType = '') {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      role,
      businessType,
      visibilityPreference: null,
      allowedWholesalers: [],
      createdAt: new Date().toISOString(),
    });
  }
  // Ensure wholesaler is discoverable in the wholesalers collection
  const effectiveRole = snap.exists() ? (snap.data()?.role ?? role) : role;
  if (effectiveRole === 'wholesaler') {
    const wsRef = doc(db, 'wholesalers', user.uid);
    const wsSnap = await getDoc(wsRef).catch(() => null);
    if (!wsSnap?.exists()) {
      await setDoc(wsRef, {
        uid: user.uid,
        businessName: user.displayName || snap.data()?.displayName || '',
        businessType: businessType || snap.data()?.businessType || '',
        email: user.email || '',
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid)).catch(() => null);
        const role = (snap?.data()?.role as 'retailer' | 'wholesaler') ?? 'retailer';
        setUser(Object.assign(firebaseUser, { role }));
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithEmail = async (email: string, password: string): Promise<{ role: 'retailer' | 'wholesaler' }> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid)).catch(() => null);
    const role: 'retailer' | 'wholesaler' = (snap?.data()?.role as 'retailer' | 'wholesaler') ?? 'retailer';
    // Backfill wholesaler discoverability for existing accounts
    if (role === 'wholesaler') {
      const wsRef = doc(db, 'wholesalers', cred.user.uid);
      const wsSnap = await getDoc(wsRef).catch(() => null);
      if (!wsSnap?.exists()) {
        await setDoc(wsRef, {
          uid: cred.user.uid,
          businessName: cred.user.displayName || snap?.data()?.displayName || '',
          businessType: snap?.data()?.businessType || '',
          email: cred.user.email || '',
          createdAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
    return { role };
  };

  const signUpWithEmail = async (name: string, email: string, password: string, role: 'retailer' | 'wholesaler' = 'retailer', businessType = '') => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user, role, businessType);
    await sendEmailVerification(cred.user).catch(() => {});
  };

  const sendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const reloadUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    if (auth.currentUser.emailVerified) {
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid)).catch(() => null);
      const role = (snap?.data()?.role as 'retailer' | 'wholesaler') ?? 'retailer';
      setUser(Object.assign(auth.currentUser, { role }));
      return true;
    }
    return false;
  };

  const signInWithGoogle = async (role: 'retailer' | 'wholesaler' = 'retailer') => {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(cred.user, role);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email, {
      url: window.location.origin,
      handleCodeInApp: false,
    });
  };

  const deleteAccount = async (password: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) throw { code: 'auth/no-user' };
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    const snap = await getDoc(doc(db, 'users', currentUser.uid)).catch(() => null);
    const role = snap?.data()?.role ?? 'retailer';
    if (role === 'retailer') {
      const analysesSnap = await getDocs(collection(db, 'users', currentUser.uid, 'vault_analyses')).catch(() => null);
      if (analysesSnap && !analysesSnap.empty) {
        const batch = writeBatch(db);
        analysesSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit().catch(() => {});
      }
      const reportsSnap = await getDocs(query(collection(db, 'retailer_reports'), where('retailerUid', '==', currentUser.uid))).catch(() => null);
      if (reportsSnap && !reportsSnap.empty) {
        const batch = writeBatch(db);
        reportsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit().catch(() => {});
      }
    } else {
      await deleteDoc(doc(db, 'wholesalers', currentUser.uid)).catch(() => {});
    }
    await deleteDoc(doc(db, 'users', currentUser.uid)).catch(() => {});
    await deleteUser(currentUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut, sendPasswordReset, deleteAccount, sendVerificationEmail, reloadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
