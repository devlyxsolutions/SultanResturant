import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

interface SidebarState {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
}

/**
 * Global persistent store for desktop sidebar open/collapsed state.
 * Preserves the user's sidebar state across all screen navigations.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      // Default to false (open) so the user has full operational visibility on desktop
      isCollapsed: false,
      setIsCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
      toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
    }),
    {
      name: 'sultan-sidebar-storage',
      storage: appStorage,
    }
  )
);
