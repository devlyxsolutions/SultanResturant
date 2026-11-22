import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { Platform } from 'react-native';

// During web static rendering (Node, no `window`) storage is unavailable — use a no-op.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// Pending debounced writes for heavy stores so localStorage never blocks UI navigation or login
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

/** Direct high-performance web storage adapter (non-blocking for large stores, instant for auth) */
const webLocalStorage: StateStorage = {
  getItem: (name: string) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(name);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Auth session is tiny (<250B) and must persist synchronously before route transitions
        if (name === 'auth-storage') {
          window.localStorage.setItem(name, value);
          return;
        }
        // Coalesce & defer heavy store writes off the synchronous UI click/login frame
        const existing = pendingWrites.get(name);
        if (existing) clearTimeout(existing);
        pendingWrites.set(
          name,
          setTimeout(() => {
            pendingWrites.delete(name);
            try {
              window.localStorage.setItem(name, value);
            } catch {}
          }, 60)
        );
      }
    } catch {}
  },
  removeItem: (name: string) => {
    try {
      const existing = pendingWrites.get(name);
      if (existing) {
        clearTimeout(existing);
        pendingWrites.delete(name);
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(name);
      }
    } catch {}
  },
};

/**
 * Per-tab isolated web auth storage:
 * - Each browser tab stores its own login exclusively in `window.sessionStorage`.
 * - Refreshing a tab keeps that tab logged in, while opening Tab 2 starts cleanly at Login
 *   so Junaid (Tab 1) and Zain (Tab 2) NEVER share, overwrite, or log out each other's sessions!
 */
const webPerTabAuthStorage: StateStorage = {
  getItem: (name: string) => {
    try {
      if (typeof window === 'undefined') return null;
      if (window.sessionStorage) {
        return window.sessionStorage.getItem(name);
      }
      if (window.localStorage) {
        return window.localStorage.getItem(name);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      if (typeof window === 'undefined') return;
      if (window.sessionStorage) {
        window.sessionStorage.setItem(name, value);
        return;
      }
      if (window.localStorage) {
        window.localStorage.setItem(name, value);
      }
    } catch {}
  },
  removeItem: (name: string) => {
    try {
      if (typeof window === 'undefined') return;
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(name);
        return;
      }
      if (window.localStorage) {
        window.localStorage.removeItem(name);
      }
    } catch {}
  },
};

/** SSR-safe ultra-fast persistent storage shared by all Zustand data stores. */
export const appStorage = createJSONStorage(() => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      return webLocalStorage;
    }
    return noopStorage;
  }
  return AsyncStorage;
});

/** Per-tab isolated storage for `useAuthStore` so multi-tab / multi-account logins never overwrite each other. */
export const authStorage = createJSONStorage(() => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && (window.sessionStorage || window.localStorage)) {
      return webPerTabAuthStorage;
    }
    return noopStorage;
  }
  return AsyncStorage;
});


