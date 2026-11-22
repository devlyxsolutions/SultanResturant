import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Platform } from 'react-native';
import { appStorage } from './storage';

export type Role = 'admin' | 'manager' | 'floor_manager' | 'Floor Manager' | 'waiter' | 'kitchen' | 'juicebar' | 'playland' | string | null;

export interface User {
  id: string;
  name: string;
  username?: string;
  role: Role;
  staffId?: string;
  customRoleId?: string;
  assignedZone?: string;
  assignedZones?: string[];
  sessionId?: string;
  loginTime?: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** True once the saved session has been loaded from storage. */
  hasHydrated: boolean;
  login: (
    name: string,
    role: Role,
    meta?: {
      staffId?: string;
      username?: string;
      customRoleId?: string;
      assignedZone?: string;
      assignedZones?: string[];
      sessionId?: string;
      loginTime?: number;
    }
  ) => void;
  updateUserZones: (assignedZone?: string, assignedZones?: string[]) => void;
  logout: () => void;
  silentLogout: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: Platform.OS === 'web',
      login: (name, role, meta) =>
        set({
          user: {
            id: meta?.staffId || Date.now().toString(),
            name,
            username: meta?.username,
            role,
            staffId: meta?.staffId,
            customRoleId: meta?.customRoleId,
            assignedZone: meta?.assignedZone,
            assignedZones: meta?.assignedZones,
            sessionId: meta?.sessionId,
            loginTime: meta?.loginTime ?? Date.now(),
          },
          isAuthenticated: true,
          hasHydrated: true,
        }),
      updateUserZones: (assignedZone, assignedZones) =>
        set((state) => ({
          user: state.user
            ? {
                ...state.user,
                assignedZone: assignedZone ?? state.user.assignedZone,
                assignedZones: assignedZones ?? state.user.assignedZones,
              }
            : null,
        })),
      silentLogout: () => {
        set({ user: null, isAuthenticated: false, hasHydrated: true });
      },
      logout: () => {
        const prevUser = get().user;
        set({ user: null, isAuthenticated: false, hasHydrated: true });

        // Cleanly release ONLY this user's own session on manual logout (never impacts other users)
        if (prevUser?.sessionId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useRestaurantStore } = require('./restaurantStore');
            useRestaurantStore?.getState()?.unregisterStaffSession?.(prevUser.sessionId);
          } catch {}
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { getActiveServerHttpUrl, getStableDeviceId, broadcastImmediately } = require('../services/syncService');
            const baseUrl = typeof getActiveServerHttpUrl === 'function' ? getActiveServerHttpUrl() : '';
            const devId = typeof getStableDeviceId === 'function' ? getStableDeviceId() : '';
            if (baseUrl) {
              fetch(`${baseUrl}/api/auth/staff-session/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: prevUser.sessionId,
                  staffId: prevUser.staffId || prevUser.id,
                  deviceId: devId,
                }),
              }).catch(() => {});
            }
            if (typeof broadcastImmediately === 'function') {
              broadcastImmediately();
            }
          } catch {}
        }
      },
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'auth-storage',
      storage: appStorage,
      // Only persist the session, not the runtime hydration flag
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hasHydrated = true;
        }
        Promise.resolve().then(() => {
          try {
            useAuthStore?.getState()?.setHasHydrated(true);
          } catch {}
        });
      },
    }
  )
);

/** Where each role lands after login. */
export const ROLE_HOME: Record<string, string> = {
  admin: '/admin/dashboard',
  Admin: '/admin/dashboard',
  manager: '/manager/dashboard',
  Manager: '/manager/dashboard',
  floor_manager: '/floor-manager',
  'Floor Manager': '/floor-manager',
  floormanager: '/floor-manager',
  waiter: '/waiter',
  Waiter: '/waiter',
  kitchen: '/kitchen/kds',
  Kitchen: '/kitchen/kds',
  juicebar: '/juicebar/kds',
  JuiceBar: '/juicebar/kds',
  Juicebar: '/juicebar/kds',
  playland: '/playland',
  Playland: '/playland',
};

export function getRoleHome(role?: Role | null, baseRole?: string | null): string {
  if (!role) return '/login';
  const r = (baseRole || role).toLowerCase().replace(/[\s_-]/g, '');
  if (r.includes('admin')) return '/admin/dashboard';
  if (r.includes('floor')) return '/floor-manager';
  if (r.includes('manager')) return '/manager/dashboard';
  if (r.includes('waiter') || r.includes('ordertaker')) return '/waiter';
  if (r.includes('kitchen') || r.includes('kds') || r.includes('chef') || r.includes('cook')) return '/kitchen/kds';
  if (r.includes('juice') || r.includes('bar') || r.includes('beverage')) return '/juicebar/kds';
  if (r.includes('playland') || r.includes('ride')) return '/playland';
  return ROLE_HOME[role] || (baseRole ? ROLE_HOME[baseRole] : '') || '/manager/dashboard';
}
