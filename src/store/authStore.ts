import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

export type Role = 'admin' | 'manager' | 'waiter' | 'kitchen' | 'juicebar' | null;

interface User {
  id: string;
  name: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** True once the saved session has been loaded from storage. */
  hasHydrated: boolean;
  login: (name: string, role: Role) => void;
  logout: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      login: (name, role) => set({ user: { id: Date.now().toString(), name, role }, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'auth-storage',
      storage: appStorage,
      // Only persist the session, not the runtime hydration flag
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => () => {
        useAuthStore.getState().setHasHydrated(true);
      },
    }
  )
);

/** Where each role lands after login. */
export const ROLE_HOME: Record<Exclude<Role, null>, string> = {
  admin: '/admin/dashboard',
  manager: '/manager/dashboard',
  waiter: '/waiter',
  kitchen: '/kitchen/kds',
  juicebar: '/juicebar/kds',
};
