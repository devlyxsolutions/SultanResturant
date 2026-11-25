import { Stack, usePathname, useRouter } from 'expo-router';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  StatusBar, 
  useWindowDimensions, 
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoleGuard } from '../../hooks/useRoleGuard';
import { useRolePermissions } from '../../store/roleStore';
import { useSidebarStore } from '../../store/sidebarStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useRestaurantStore } from '../../store/restaurantStore';
import { DEVICE_ID, broadcastImmediately, getActiveServerHttpUrl } from '../../services/syncService';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import FullscreenButton from '../../components/FullscreenButton';
import SultanLogo from '../../components/SultanLogo';
import BottomNav from '../../components/BottomNav';
import AppSidebar, { NavItem } from '../../components/layout/AppSidebar';

const ADMIN_MENU_ITEMS: NavItem[] = [
  { label: 'Dashboard', route: '/admin/dashboard', icon: 'grid-outline' },
  { label: 'Customer Digital Menu', route: '/menu', icon: 'qr-code-outline', badge: 'QR Menu' },
  { label: 'App Orders Command', route: '/admin/app-orders', icon: 'phone-portrait-outline', badge: 'Live App' },
  { label: 'POS Terminal', route: '/admin/pos', icon: 'calculator-outline', badge: 'POS' },
  { label: 'Live Shift & Cash', route: '/admin/shift', icon: 'time-outline' },
  { label: 'Invoices & Orders', route: '/admin/invoices', icon: 'receipt-outline' },
  { label: 'Sales Returns & Refunds', route: '/admin/returns', icon: 'return-down-back-outline' },
  { label: 'Events & Discounts', route: '/admin/discounts', icon: 'pricetags-outline', badge: 'PROMO' },
  { label: 'Menu Catalog', route: '/admin/menu', icon: 'restaurant-outline' },
  { label: 'Staff & Roles', route: '/admin/staff', icon: 'people-outline' },
  { label: 'Financial Reports', route: '/admin/reports', icon: 'bar-chart-outline' },
  { label: 'Inventory & Stock', route: '/admin/inventory', icon: 'cube-outline' },
  { label: 'Suppliers & Vendors', route: '/admin/suppliers', icon: 'bus-outline' },
  { label: 'Supplier Ledger & Pays', route: '/admin/supplier-ledger', icon: 'book-outline', badge: 'Khata' },
  { label: 'Table Blueprint', route: '/admin/tables', icon: 'grid-outline' },
  { label: 'Customer CRM', route: '/admin/customers', icon: 'person-outline' },
  { label: 'Floor Command', route: '/admin/floors', icon: 'business-outline' },
  { label: 'Business Insights', route: '/admin/insights', icon: 'trending-up-outline' },
  { label: 'Live Expenses', route: '/admin/expenses', icon: 'wallet-outline' },
  { label: 'Assets & Capex', route: '/admin/assets', icon: 'diamond-outline' },
  { label: 'Damage Control', route: '/admin/damages', icon: 'shield-outline' },
  { label: 'Kitchen Handover', route: '/admin/kitchen-handover', icon: 'clipboard-outline' },
  { label: 'Recipe BOM', route: '/admin/recipes', icon: 'fast-food-outline' },
  { label: 'Kitchen Returns', route: '/admin/kitchen-returns', icon: 'checkmark-done-circle-outline' },
  { label: 'Dish Costing', route: '/admin/costing', icon: 'pricetag-outline' },
  { label: 'Playland Hub', route: '/admin/playland', icon: 'balloon-outline' },
  { label: 'System Logs & Audit', route: '/admin/system-logs', icon: 'shield-checkmark-outline', badge: 'LIVE' },
  { label: 'System Settings', route: '/admin/settings', icon: 'settings-outline', badge: 'Control' },
];

export default function AdminLayout() {
  const { ready, user, logout } = useRoleGuard(['admin']);
  const { can } = useRolePermissions();
  const systemSettings = useSettingsStore((s) => s.settings);
  const { width } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();
  
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { isCollapsed, setIsCollapsed, toggleCollapsed } = useSidebarStore();
  const activeStaffSessions = useRestaurantStore((s) => s.activeStaffSessions) || [];
  const terminateAllStaffSessions = useRestaurantStore((s) => s.terminateAllStaffSessions);
  const [logoutAllConfirmOpen, setLogoutAllConfirmOpen] = useState(false);
  const [logoutAllFeedback, setLogoutAllFeedback] = useState<string | null>(null);

  const otherActiveCount = useMemo(
    () =>
      activeStaffSessions.filter(
        (s) => s && (!user?.sessionId || s.sessionId !== user.sessionId)
      ).length,
    [activeStaffSessions, user?.sessionId]
  );

  const handleConfirmLogoutAllUsers = async () => {
    setLogoutAllConfirmOpen(false);
    const kickReason = 'Master Admin نے تمام صارفین کو لاگ آؤٹ کر دیا ہے';
    const mySessionId = user?.sessionId || undefined;
    const localKicked = terminateAllStaffSessions(mySessionId, DEVICE_ID, kickReason);
    const baseUrl = getActiveServerHttpUrl();
    let kickedCount = localKicked;
    if (baseUrl) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/staff-session/kick-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exceptSessionId: mySessionId,
            exceptDeviceId: DEVICE_ID,
            reason: kickReason,
          }),
        });
        const data = await res.json().catch(() => null);
        if (data && typeof data.kickedCount === 'number') {
          kickedCount = Math.max(kickedCount, data.kickedCount);
        }
      } catch {}
    }
    broadcastImmediately();
    const msg =
      kickedCount > 0
        ? `Logged out ${kickedCount} active user(s) across all devices!`
        : 'Logout All sent to all connected devices!';
    setLogoutAllFeedback(msg);
    setTimeout(() => setLogoutAllFeedback((prev) => (prev === msg ? null : prev)), 3500);
  };

  // On tablet screens (768-1023px), default to collapsed dock on route change so screens get full width
  useEffect(() => {
    if (isTablet && !isCollapsed) {
      setIsCollapsed(true);
    }
  }, [pathname, isTablet, isCollapsed, setIsCollapsed]);

  // Auto-collapse sidebar ONLY when user clicks or touches anywhere outside the sidebar
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const isClickInsideSidebar = (e: MouseEvent | TouchEvent): boolean => {
      // 1. Check composedPath for maximum web accuracy across nested DOM trees
      if (typeof e.composedPath === 'function') {
        const path = e.composedPath();
        for (const item of path) {
          if (item instanceof HTMLElement) {
            if (
              item.getAttribute('data-sidebar') === 'true' ||
              item.getAttribute('data-toggle-btn') === 'true' ||
              item.getAttribute('data-testid') === 'sultan-app-sidebar' ||
              item.getAttribute('data-testid') === 'top-sidebar-toggle-btn' ||
              item.id === 'sultan-app-sidebar' ||
              item.id === 'top-sidebar-toggle-btn' ||
              item.classList.contains('sultan-desktop-sidebar') ||
              item.classList.contains('apple-dock-item') ||
              item.classList.contains('sidebar-nav-item')
            ) {
              return true;
            }
          }
        }
      }

      // 2. Check target and closest ancestors
      const target = e.target as HTMLElement | null;
      if (target) {
        if (typeof target.closest === 'function') {
          if (
            target.closest('[data-sidebar="true"]') ||
            target.closest('[data-toggle-btn="true"]') ||
            target.closest('[data-testid="sultan-app-sidebar"]') ||
            target.closest('[data-testid="top-sidebar-toggle-btn"]') ||
            target.closest('#sultan-app-sidebar') ||
            target.closest('#top-sidebar-toggle-btn') ||
            target.closest('.sultan-desktop-sidebar') ||
            target.closest('.apple-dock-item') ||
            target.closest('.sidebar-nav-item')
          ) {
            return true;
          }
        }

        // 3. Fallback container check
        const sidebarEl = 
          document.getElementById('sultan-app-sidebar') ||
          document.querySelector('[data-sidebar="true"]') ||
          document.querySelector('.sultan-desktop-sidebar');
        if (sidebarEl && sidebarEl.contains(target)) return true;

        const toggleBtnEl = 
          document.getElementById('top-sidebar-toggle-btn') ||
          document.querySelector('[data-toggle-btn="true"]') ||
          document.querySelector('[data-testid="top-sidebar-toggle-btn"]');
        if (toggleBtnEl && toggleBtnEl.contains(target)) return true;
      }

      return false;
    };

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      // If sidebar is already collapsed, nothing to do
      if (isCollapsed) return;

      // If user clicked anywhere inside the sidebar or on the top toggle button:
      // DO NOT collapse! Allow navigation or menu interaction to occur freely.
      if (isClickInsideSidebar(e)) return;

      // Click was outside the sidebar (on workspace screen, tables, charts, background, etc.)
      // -> Collapse sidebar smoothly to dock icons
      setIsCollapsed(true);
    };

    // Attach to window in capture phase to reliably detect any outside clicks
    window.addEventListener('click', handleOutsideClick, true);
    window.addEventListener('touchend', handleOutsideClick, true);
    return () => {
      window.removeEventListener('click', handleOutsideClick, true);
      window.removeEventListener('touchend', handleOutsideClick, true);
    };
  }, [isCollapsed, setIsCollapsed]);

  const filteredMenuItems = useMemo(() => {
    return ADMIN_MENU_ITEMS.filter((item) => {
      if (item.route === '/menu' && systemSettings.enableDigitalQrMenu === false) return false;
      if (item.route === '/admin/app-orders' && systemSettings.enableOnlineOrders === false) return false;
      if (item.route === '/admin/pos' && (!can('canAccessPOS') || systemSettings.enablePosModule === false)) return false;
      if (item.route === '/admin/invoices' && (!can('canAccessInvoices') || systemSettings.enableInvoicesModule === false)) return false;
      if (item.route === '/admin/returns' && (!can('canProcessReturns') || systemSettings.enableReturnsModule === false)) return false;
      if (item.route === '/admin/discounts' && (!can('canAccessDiscounts') || systemSettings.enableDiscountsModule === false)) return false;
      if (item.route === '/admin/staff' && (!can('canAccessStaff') || systemSettings.enableStaffHrModule === false)) return false;
      if (item.route === '/admin/reports' && (!can('canAccessReports') || systemSettings.enableReportsModule === false)) return false;
      if (item.route === '/admin/insights' && systemSettings.enableInsightsModule === false) return false;
      if (item.route === '/admin/inventory' && (!can('canAccessInventory') || systemSettings.enableInventoryModule === false)) return false;
      if (item.route === '/admin/suppliers' && (!can('canAccessInventory') || systemSettings.enableSuppliersModule === false)) return false;
      if (item.route === '/admin/damages' && (!can('canAccessInventory') || systemSettings.enableDamagesModule === false)) return false;
      if (item.route === '/admin/expenses' && (!can('canAccessExpenses') || systemSettings.enableExpensesModule === false)) return false;
      if (item.route === '/admin/assets' && (!can('canAccessExpenses') || systemSettings.enableAssetsModule === false)) return false;
      if (item.route === '/admin/kitchen-handover' && (!can('canAccessKitchenHandover') || systemSettings.enableKitchenHandoverModule === false)) return false;
      if (item.route === '/admin/kitchen-returns' && (!can('canAccessKitchenHandover') || systemSettings.enableKitchenHandoverModule === false)) return false;
      if (item.route === '/admin/recipes' && (!can('canAccessRecipes') || systemSettings.enableRecipesBomModule === false)) return false;
      if (item.route === '/admin/costing' && (!can('canAccessRecipes') || !can('canViewCostPrice') || systemSettings.enableRecipesBomModule === false)) return false;
      if (item.route === '/admin/menu' && !can('canModifyMenuPrices')) return false;
      if (item.route === '/admin/customers' && (!can('canViewCustomerContacts') || systemSettings.enableCustomerCrmModule === false)) return false;
      if (item.route === '/admin/shift' && (!can('canStartCloseShift') || systemSettings.enableShiftModule === false)) return false;
      if ((item.route === '/admin/tables' || item.route === '/admin/floors') && systemSettings.enableFloorPlanModule === false) return false;
      if (item.route === '/admin/playland' && systemSettings.enablePlayland === false) return false;
      return true;
    });
  }, [can, systemSettings]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#140306', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" />
        <SultanLogo size="md" width={68} height={68} />
        <ActivityIndicator size="small" color="#D4AF37" style={{ marginTop: 18 }} />
        <Text style={{ color: '#D4AF37', marginTop: 12, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }}>
          LOADING SULTAN ADMIN...
        </Text>
      </View>
    );
  }

  // POS Terminal is Fullscreen (No Sidebar, No Outer Layout Header, No Mobile BottomNav)
  const isPos = pathname === '/admin/pos' || pathname.endsWith('/pos');
  if (isPos) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#140306' }} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" />
        <Stack 
          screenOptions={{ 
            headerShown: false,
            contentStyle: { backgroundColor: '#F8FAFC' }
          }} 
        />
      </SafeAreaView>
    );
  }

  // Find active screen title for desktop breadcrumbs
  const currentItem = filteredMenuItems.find(it => it.route === pathname);
  const screenTitle = currentItem ? currentItem.label : 'Admin Operations';

  // Desktop Sidebar Layout
  if (!isMobile) {
    return (
      <SafeAreaView style={styles.desktopShell} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" />

        {/* Global Web Animations & Micro-Interactions */}
        {Platform.OS === 'web' && (
          <style>{`
            @keyframes sultanPageLanding {
              0% {
                opacity: 0;
                transform: translateY(14px);
              }
              100% {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes pulseBeacon {
              0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
              50% { transform: scale(1.1); opacity: 0.85; box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            }
            @keyframes pulseGlowGold {
              0%, 100% { box-shadow: 0 0 12px rgba(212, 175, 55, 0.3); }
              50% { box-shadow: 0 0 24px rgba(212, 175, 55, 0.55); }
            }
            [data-page-landing="true"],
            .page-animate-fade {
              animation: sultanPageLanding 0.35s cubic-bezier(0.16, 1, 0.3, 1) both !important;
            }
            /* Universal Card / Box / Tile Hover */
            [data-card],
            [data-hover],
            [data-interactive],
            [data-tile],
            [data-box],
            .interactive-card {
              transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                          box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                          filter 0.22s ease,
                          border-color 0.22s ease !important;
            }
            [data-card]:hover,
            [data-hover]:hover,
            [data-interactive]:hover,
            [data-tile]:hover,
            [data-box]:hover,
            .interactive-card:hover {
              transform: translateY(-3.5px) scale(1.006) !important;
              box-shadow: 0 14px 32px rgba(82, 20, 28, 0.14), 0 0 0 1.5px rgba(212, 175, 55, 0.48) !important;
              filter: brightness(1.03) !important;
              z-index: 4 !important;
            }
            [data-card]:active,
            [data-hover]:active,
            [data-interactive]:active,
            [data-tile]:active,
            [data-box]:active,
            .interactive-card:active {
              transform: translateY(-0.5px) scale(0.985) !important;
            }
          `}</style>
        )}

        {/* 1. Permanent Left Liquid Glass Sidebar */}
        <AppSidebar
          role="admin"
          items={filteredMenuItems}
          user={user}
          onLogout={logout}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapsed}
        />

        {/* 2. Main Workspace (Top Bar + Screen Stack) */}
        <View style={styles.workspaceArea}>
          {/* Top Royal Sultan Header Bar */}
          <View style={styles.desktopTopBar}>
            <View style={styles.topBarLeft}>
              {/* Sidebar Toggle Button at Top Nav */}
              <TouchableOpacity
                testID="top-sidebar-toggle-btn"
                style={styles.topSidebarToggleBtn}
                onPress={toggleCollapsed}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' ? {
                  id: 'top-sidebar-toggle-btn',
                  'data-toggle-btn': 'true',
                } as any : {})}
              >
                <Ionicons name={isCollapsed ? 'menu' : 'chevron-back'} size={17} color="#D4AF37" />
                <Text style={styles.topSidebarToggleText}>{isCollapsed ? 'Menu' : 'Collapse'}</Text>
              </TouchableOpacity>

              <View style={styles.topBarDivider} />

              {/* Sultan Brand Title (Clean, elegant text without redundant duplicate logo) */}
              {width >= 1040 && (
                <>
                  <View style={styles.topBrandTitleCapsule}>
                    <Ionicons name="sparkles" size={12} color="#D4AF37" style={{ marginRight: 6 }} />
                    <Text style={styles.topBrandName}>SULTAN RESTAURANT</Text>
                  </View>
                  <View style={styles.topBarDivider} />
                </>
              )}

              {width >= 860 && (
                <>
                  <View style={styles.breadcrumbBadge}>
                    <Ionicons name="shield-checkmark" size={13} color="#D4AF37" />
                    <Text style={styles.breadcrumbAdmin}>{width < 960 ? 'ADMIN' : 'EXECUTIVE ADMIN'}</Text>
                  </View>
                  <Text style={styles.breadcrumbDivider}>/</Text>
                </>
              )}
              <Text style={styles.topBarScreenTitle} numberOfLines={1}>{screenTitle}</Text>
            </View>

            <View style={styles.topBarRight}>
              <FullscreenButton variant={width < 1024 ? 'icon' : 'pill'} />
              <SyncStatusBadge compact={width < 1024} />

              {/* Fast POS Shortcut - Glowing Sultan Gold */}
              {can('canAccessPOS') && systemSettings.enablePosModule !== false && (
                <TouchableOpacity
                  style={[styles.headerPosBtn, isTablet && { paddingHorizontal: 10, paddingVertical: 6 }]}
                  onPress={() => router.push('/admin/pos')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calculator" size={15} color="#24050A" />
                  <Text style={styles.headerPosBtnText}>{width < 900 ? 'POS' : 'POS Billing'}</Text>
                </TouchableOpacity>
              )}

              {/* User greeting with Royal Avatar */}
              <View style={[styles.topUserSnippet, width < 900 && { paddingHorizontal: 5, paddingVertical: 4 }]}>
                <View style={styles.topAvatarCircle}>
                  <Text style={styles.topAvatarText}>
                    {(user?.name || 'Admin')[0].toUpperCase()}
                  </Text>
                </View>
                {width >= 900 && (
                  <View style={styles.userTextCol}>
                    {width >= 1040 && <Text style={styles.userGreetingSub}>Welcome,</Text>}
                    <Text style={styles.topUserName} numberOfLines={1}>
                      {user?.name || 'Admin'}
                    </Text>
                  </View>
                )}
              </View>

              {/* 1-Click Logout All Users (Master Admin Only) */}
              <TouchableOpacity
                style={[
                  styles.logoutBtn,
                  {
                    backgroundColor: 'rgba(220, 38, 38, 0.22)',
                    borderColor: 'rgba(248, 113, 113, 0.55)',
                  },
                  width < 900 && { paddingHorizontal: 8 },
                ]}
                onPress={() => setLogoutAllConfirmOpen(true)}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Ionicons name="power" size={15} color="#FCA5A5" style={width >= 900 ? { marginRight: 5 } : undefined} />
                {width >= 900 && (
                  <Text style={[styles.logoutText, { color: '#FECACA' }]}>
                    {otherActiveCount > 0 ? `Logout All (${otherActiveCount})` : 'Logout All'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Logout button */}
              <TouchableOpacity 
                style={[styles.logoutBtn, width < 900 && { paddingHorizontal: 8 }]}
                onPress={logout}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="log-out-outline" size={16} color="#F87171" style={width >= 900 ? { marginRight: 5 } : undefined} />
                {width >= 900 && <Text style={styles.logoutText}>Logout</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {logoutAllFeedback && (
            <View
              style={{
                backgroundColor: '#991B1B',
                paddingVertical: 7,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="checkmark-circle" size={16} color="#FDE68A" />
              <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>
                {logoutAllFeedback}
              </Text>
            </View>
          )}

          {/* Confirmation Modal for Master Admin 1-Click Logout All Users */}
          <Modal
            visible={logoutAllConfirmOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setLogoutAllConfirmOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
              }}
            >
              <View
                style={{
                  width: '100%',
                  maxWidth: 420,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 20,
                  borderWidth: 1.5,
                  borderColor: '#FCA5A5',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: '#FEF2F2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="power" size={22} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#7F1D1D' }}>
                      Logout All Logged-In Users?
                    </Text>
                    <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600' }}>
                      تمام صارفین کو ایک کلک میں لاگ آؤٹ کریں
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 19, marginBottom: 16 }}>
                  Is button se sab PCs aur Tablets par jitne bhi users login hain ({otherActiveCount} active terminals) foran logout ho jayenge. Aapka apna Master Admin account login rahega.
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      backgroundColor: '#F8FAFC',
                    }}
                    onPress={() => setLogoutAllConfirmOpen(false)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      borderRadius: 9,
                      backgroundColor: '#DC2626',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onPress={handleConfirmLogoutAllUsers}
                  >
                    <Ionicons name="power" size={14} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                      Yes, Logout All
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Screen Content */}
          <View 
            style={styles.desktopContent}
            {...(Platform.OS === 'web' ? ({ dataSet: { pageLanding: 'true' } } as any) : {})}
          >
            <Stack 
              screenOptions={{ 
                headerShown: false,
                contentStyle: { backgroundColor: '#F8FAFC' }
              }} 
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Mobile Layout
  return (
    <SafeAreaView style={styles.mobileShell} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* Mobile Top Header (Royal Baithak Theme) */}
      <View style={styles.mobileHeader}>
        <View style={styles.mobileHeaderLeft}>
          <TouchableOpacity 
            style={styles.hamburgerBtn} 
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={24} color="#F3D179" />
          </TouchableOpacity>
          <View style={styles.mobileLogoBox}>
            <SultanLogo size="xs" width={20} height={20} style={{ marginRight: 6 }} />
            <Text style={styles.mobileHeaderTitle} numberOfLines={1}>
              {currentItem ? currentItem.label.toUpperCase() : 'SULTAN ADMIN'}
            </Text>
          </View>
        </View>

        <View style={styles.mobileHeaderRight}>
          <FullscreenButton variant="compact" />
          <SyncStatusBadge compact />
          <TouchableOpacity 
            style={styles.mobileLogoutBtn}
            onPress={logout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={18} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Mobile Screen Stack */}
      <View 
        style={styles.mobileContent}
        {...(Platform.OS === 'web' ? ({ dataSet: { pageLanding: 'true' } } as any) : {})}
      >
        <Stack 
          screenOptions={{ 
            headerShown: false,
            contentStyle: { backgroundColor: '#F8FAFC' }
          }} 
        />
      </View>

      {/* Mobile Bottom Nav */}
      <BottomNav role="admin" onOpenDrawer={() => setIsDrawerOpen(true)} />

      {/* Mobile Slide-out Drawer */}
      <AppSidebar
        role="admin"
        items={filteredMenuItems}
        user={user}
        onLogout={logout}
        isMobileOpen={isDrawerOpen}
        onCloseMobile={() => setIsDrawerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Desktop
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    ...Platform.select({
      web: {
        height: '100vh' as any,
        maxHeight: '100vh' as any,
        overflow: 'hidden',
      },
    }),
  },
  workspaceArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  desktopTopBar: {
    backgroundColor: '#24050A',
    paddingHorizontal: 22,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.28)',
    zIndex: 10,
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, rgba(56, 10, 17, 0.9) 0%, rgba(30, 4, 8, 0.96) 100%)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      } as any,
    }),
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
    overflow: 'hidden',
  },
  topSidebarToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.42)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 2,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
    }),
  },
  topSidebarToggleText: {
    color: '#F3D179',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  topBarDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(212, 175, 55, 0.28)',
    marginHorizontal: 3,
  },
  topBrandTitleCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  topBrandName: {
    color: '#F3D179',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  breadcrumbBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.42)',
  },
  breadcrumbAdmin: {
    color: '#F3D179',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  breadcrumbDivider: {
    color: 'rgba(212, 175, 55, 0.4)',
    fontSize: 14,
    fontWeight: '700',
    marginHorizontal: 3,
  },
  topBarScreenTitle: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerPosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 14,
    paddingVertical: 7.5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#F3D179',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #F3D179 0%, #D4AF37 55%, #B8860B 100%)',
        boxShadow: '0 4px 16px rgba(212, 175, 55, 0.45)',
        cursor: 'pointer',
      } as any,
    }),
  },
  headerPosBtnText: {
    color: '#24050A',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  topUserSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.28)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      } as any,
    }),
  },
  topAvatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F3D179',
    ...Platform.select({
      web: {
        boxShadow: '0 0 10px rgba(212, 175, 55, 0.4)',
      } as any,
    }),
  },
  topAvatarText: {
    color: '#24050A',
    fontSize: 12,
    fontWeight: '900',
  },
  userTextCol: {
    marginRight: 4,
  },
  userGreetingSub: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 9.5,
    fontWeight: '600',
    lineHeight: 11,
  },
  topUserName: {
    color: '#F3D179',
    fontSize: 12.5,
    fontWeight: '800',
    maxWidth: 130,
    lineHeight: 15,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
    }),
  },
  logoutText: {
    color: '#FCA5A5',
    fontWeight: '700',
    fontSize: 11.5,
  },
  desktopContent: {
    flex: 1,
    backgroundColor: '#F7F4EE',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(circle at 12% 8%, rgba(82, 20, 28, 0.05) 0%, transparent 40%), radial-gradient(circle at 88% 92%, rgba(212, 175, 55, 0.04) 0%, transparent 45%), linear-gradient(180deg, #FBF9F5 0%, #F4EEE4 100%)',
      } as any,
    }),
  },

  // Mobile
  mobileShell: {
    flex: 1,
    backgroundColor: '#200408',
  },
  mobileHeader: {
    backgroundColor: '#200408',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.28)',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, rgba(56, 10, 17, 0.94) 0%, rgba(28, 4, 8, 0.97) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      } as any,
    }),
  },
  mobileHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  hamburgerBtn: {
    padding: 6,
    marginRight: 6,
  },
  mobileLogoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    flexShrink: 1,
  },
  mobileHeaderTitle: {
    color: '#F3D179',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  mobileHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobileLogoutBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  mobileContent: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
