import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRolePermissions } from '../store/roleStore';
import { isManagerRouteAllowed } from '../constants/managerAccess';

export type BottomNavRole = 'admin' | 'manager' | 'waiter';

const NAV_CONFIG = {
  admin: [
    { label: 'Dash', route: '/admin/dashboard', icon: 'grid-outline', activeIcon: 'grid' },
    { label: 'POS', route: '/admin/pos', icon: 'calculator-outline', activeIcon: 'calculator' },
    { label: 'Tables', route: '/admin/tables', icon: 'browsers-outline', activeIcon: 'browsers' },
    { label: 'Menu', route: '/admin/menu', icon: 'restaurant-outline', activeIcon: 'restaurant' },
    { label: 'More', action: 'open_drawer', icon: 'menu-outline', activeIcon: 'menu' },
  ],
  manager: [
    { label: 'Dash', route: '/manager/dashboard', icon: 'grid-outline', activeIcon: 'grid' },
    { label: 'POS', route: '/manager/pos', icon: 'calculator-outline', activeIcon: 'calculator' },
    { label: 'Floor', route: '/manager/floor-plan', icon: 'business-outline', activeIcon: 'business' },
    { label: 'Shift', route: '/manager/shift', icon: 'time-outline', activeIcon: 'time' },
    { label: 'More', action: 'open_drawer', icon: 'menu-outline', activeIcon: 'menu' },
  ],
  waiter: [
    { label: 'Floor', route: '/waiter', icon: 'apps-outline', activeIcon: 'apps' },
    { label: 'Logout', action: 'logout', icon: 'log-out-outline', activeIcon: 'log-out' },
  ],
};

const BRAND = {
  burgundy: '#52141C',
  gold: '#F3D179',
  inactive: 'rgba(255, 255, 255, 0.55)',
  bg: '#24050A',
  border: 'rgba(212, 175, 55, 0.28)',
  activePill: 'rgba(212, 175, 55, 0.16)',
};


interface BottomNavProps {
  role: BottomNavRole;
  onOpenDrawer?: () => void;
  onLogout?: () => void;
}

export default function BottomNav({ role, onOpenDrawer, onLogout }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { can } = useRolePermissions(role === 'manager' ? 'manager' : undefined);

  // On desktop/tablets, admin and manager use the modern left sidebar layout
  if (!isMobile && (role === 'admin' || role === 'manager')) {
    return null;
  }

  const rawTabs = NAV_CONFIG[role] || [];
  const tabs = rawTabs.filter((tab) => {
    if (role === 'manager' && tab.route) return isManagerRouteAllowed(tab.route, can);
    if (tab.route === '/admin/pos' && !can('canAccessPOS')) return false;
    if (tab.route === '/admin/menu' && !can('canModifyMenuPrices')) return false;
    return true;
  });

  const handlePress = (tab: any) => {
    if (tab.action === 'open_drawer' && onOpenDrawer) {
      onOpenDrawer();
    } else if (tab.action === 'logout' && onLogout) {
      onLogout();
    } else if (tab.route) {
      router.push(tab.route as any);
    }
  };

  if (role === 'waiter') {
    // Hide when inside order taking flow so it doesn't collide with the order cart/action bar
    if (pathname.includes('/order/')) {
      return null;
    }

    return (
      <View 
        style={[
          styles.waiterCapsuleContainer, 
          { bottom: Math.max(insets.bottom + 10, 18) }
        ]} 
        pointerEvents="box-none"
      >
        <View style={styles.waiterCapsule}>
          {tabs.map((tab, idx) => {
            const isActive = pathname === tab.route;
            const isLogout = tab.action === 'logout';
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <View style={styles.waiterCapsuleDivider} />}
                <TouchableOpacity
                  style={[
                    styles.waiterCapsuleBtn,
                    isActive && styles.waiterCapsuleBtnActive,
                    isLogout && styles.waiterCapsuleLogoutBtn,
                  ]}
                  onPress={() => handlePress(tab)}
                  activeOpacity={0.78}
                >
                  <Ionicons 
                    name={isActive ? (tab.activeIcon as any) : (tab.icon as any)} 
                    size={19} 
                    color={isActive ? BRAND.gold : isLogout ? '#FF7A7A' : 'rgba(255, 255, 255, 0.7)'} 
                    style={{ marginRight: 7 }}
                  />
                  <Text style={[
                    styles.waiterCapsuleLabel, 
                    isActive && styles.waiterCapsuleLabelActive,
                    isLogout && styles.waiterCapsuleLogoutLabel,
                  ]}>
                    {tab.label}
                  </Text>
                  {isActive && <View style={styles.waiterActiveGlowDot} />}
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.tabContainer}>
        {tabs.map((tab, idx) => {
          const isActive = pathname === tab.route;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handlePress(tab)}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={isActive ? (tab.activeIcon as any) : (tab.icon as any)} 
                size={22} 
                color={isActive ? BRAND.gold : BRAND.inactive} 
                style={styles.icon}
              />
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {tab.label}
              </Text>
              {isActive && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E0408',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(212, 175, 55, 0.28)',
    paddingTop: 8,
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        backgroundImage: 'linear-gradient(180deg, rgba(56, 10, 17, 0.95) 0%, rgba(26, 4, 8, 0.98) 100%)',
        boxShadow: '0 -8px 28px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      } as any,
    }),
  },

  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    borderColor: 'rgba(212, 175, 55, 0.4)',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 12px rgba(212, 175, 55, 0.25)',
      } as any,
    }),
  },
  icon: {
    marginBottom: 3,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  labelActive: {
    color: '#F3D179',
    fontWeight: '900',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F3D179',
    marginTop: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 0 6px rgba(243, 209, 121, 0.8)',
      } as any,
    }),
  },

  // Waiter Floating Capsule Bar Styles
  waiterCapsuleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  waiterCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#24050A',
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 16,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px) saturate(190%)',
        WebkitBackdropFilter: 'blur(24px) saturate(190%)',
        backgroundImage: 'linear-gradient(135deg, rgba(56, 10, 17, 0.96) 0%, rgba(26, 4, 8, 0.98) 100%)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(212, 175, 55, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
      } as any,
    }),
  },
  waiterCapsuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  waiterCapsuleBtnActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.22)',
    borderColor: 'rgba(212, 175, 55, 0.55)',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 14px rgba(212, 175, 55, 0.3)',
      } as any,
    }),
  },
  waiterCapsuleLogoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  waiterCapsuleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 0.3,
  },
  waiterCapsuleLabelActive: {
    color: '#F3D179',
    fontWeight: '900',
  },
  waiterCapsuleLogoutLabel: {
    color: '#FFA1A1',
    fontWeight: '800',
  },
  waiterCapsuleDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(212, 175, 55, 0.28)',
    marginHorizontal: 3,
  },
  waiterActiveGlowDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F3D179',
    marginLeft: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 0 8px rgba(243, 209, 121, 0.9)',
      } as any,
    }),
  },
});
