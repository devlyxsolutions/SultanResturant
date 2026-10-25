import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

// During web static rendering (Node, no `window`) storage is unavailable — use a no-op.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** Direct high-performance synchronous web storage adapter */
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
        window.localStorage.setItem(name, value);
      }
    } catch {}
  },
  removeItem: (name: string) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(name);
      }
    } catch {}
  },
};

/** SSR-safe ultra-fast persistent storage shared by all Zustand stores. */
export const appStorage = createJSONStorage(() => {
  if (typeof window === 'undefined') return noopStorage;
  if (typeof window !== 'undefined' && window.localStorage) return webLocalStorage;
  return AsyncStorage;
});

