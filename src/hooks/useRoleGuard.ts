import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore, Role } from '../store/authStore';

/**
 * Protects a role section. Waits for the saved session to load,
 * then redirects to /login if the user is not allowed here.
 */
export function useRoleGuard(allowed: Exclude<Role, null>[]) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const logoutStore = useAuthStore((s) => s.logout);

  const isAllowed = isAuthenticated && !!user?.role && allowed.includes(user.role);

  useEffect(() => {
    if (hasHydrated && !isAllowed) {
      router.replace('/login');
    }
  }, [hasHydrated, isAllowed, router]);

  const logout = () => {
    logoutStore();
    router.replace('/');
  };

  return { ready: hasHydrated && isAllowed, user, logout };
}
