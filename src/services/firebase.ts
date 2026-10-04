import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyAzsBG5kc0gFf83DJaluvF42sk_m-9JdAU",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "sultan-resturant.firebaseapp.com",
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || "https://sultan-resturant-default-rtdb.firebaseio.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "sultan-resturant",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "sultan-resturant.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "948928711162",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:948928711162:web:431be2f25a11cfa2937c43",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.databaseURL && firebaseConfig.apiKey
);

export const FIREBASE_REST_BASE_URL = (firebaseConfig.databaseURL || "https://sultan-resturant-default-rtdb.firebaseio.com").replace(/\/+$/, '');

let dbInstance: Database | null = null;

export function getFirebaseDb(): Database | null {
  if (!isFirebaseConfigured) return null;
  if (!dbInstance) {
    try {
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      dbInstance = getDatabase(app);
    } catch (err) {
      console.warn('[Firebase] Initialization error:', err);
      return null;
    }
  }
  return dbInstance;
}
