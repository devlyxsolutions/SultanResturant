import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

// During web static rendering (Node, no `window`) storage is unavailable — use a no-op.
const noopStorage: StateStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

/** SSR-safe persistent storage shared by all Zustand stores. */
export const appStorage = createJSONStorage(() =>
  typeof window === 'undefined' ? noopStorage : AsyncStorage
);
