import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SultanLogo from '../SultanLogo';
import { useRolePermissions } from '../../store/roleStore';

export type NavItem = {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  category?: string;
};

interface AppSidebarProps {
  role: 'admin' | 'manager';
  items: NavItem[];
  user: { name?: string; role?: string | null; email?: string } | null;
  onLogout: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export type NavCategoryGroup = {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  badgeColor?: string;
  routes: string[];
};

// Categorize items into structured, logical, and managed operational groups
function getCategoryGroups(role: 'admin' | 'manager'): NavCategoryGroup[] {
  if (role === 'admin') {
    return [
      {
        id: 'ops_floor',
        title: 'POS & FLOOR COMMAND',
        icon: 'flash-outline',
        routes: [
          '/admin/dashboard',
          '/menu',
          '/admin/app-orders',
          '/admin/pos',
          '/admin/shift',
          '/admin/tables',
          '/admin/floors',
        ],
      },
      {
        id: 'sales_billing',
        title: 'SALES & BILLING CRM',
        icon: 'receipt-outline',
        routes: [
          '/admin/invoices',
          '/admin/returns',
          '/admin/discounts',
          '/admin/customers',
        ],
      },
      {
        id: 'inventory_procurement',
        title: 'INVENTORY & SUPPLY',
        icon: 'cube-outline',
        routes: [
          '/admin/inventory',
          '/admin/suppliers',
          '/admin/damages',
        ],
      },
      {
        id: 'kitchen_craft',
        title: 'KITCHEN & RECIPES',
        icon: 'restaurant-outline',
        routes: [
          '/admin/kitchen-handover',
          '/admin/kitchen-returns',
          '/admin/menu',
          '/admin/recipes',
          '/admin/costing',
        ],
      },
      {
        id: 'finance_intelligence',
        title: 'FINANCE & REPORTS',
        icon: 'bar-chart-outline',
        routes: [
          '/admin/reports',
          '/admin/expenses',
          '/admin/assets',
          '/admin/insights',
        ],
      },
      {
        id: 'admin_management',
        title: 'STAFF & MANAGEMENT',
        icon: 'people-outline',
        routes: [
          '/admin/staff',
          '/admin/playland',
        ],
      },
    ];
  }

  // Manager specific categorization
  return [
    {
      id: 'manager_floor',
      title: 'FLOOR & POS TERMINAL',
      icon: 'flash-outline',
      routes: [
        '/manager/dashboard',
        '/menu',
        '/manager/app-orders',
        '/manager/pos',
        '/manager/floor-plan',
        '/manager/floors',
        '/manager/shift',
      ],
    },
    {
      id: 'manager_billing',
      title: 'GUEST ORDERS & BILLING',
      icon: 'receipt-outline',
      routes: [
        '/manager/invoices',
        '/manager/returns',
        '/manager/discounts',
      ],
    },
    {
      id: 'manager_inventory',
      title: 'STOCK & PROCUREMENT',
      icon: 'cube-outline',
      routes: [
        '/manager/inventory',
        '/manager/suppliers',
        '/manager/damages',
      ],
    },
    {
      id: 'manager_kitchen',
      title: 'KITCHEN PRODUCTION',
      icon: 'restaurant-outline',
      routes: [
        '/manager/kitchen-handover',
        '/manager/kitchen-returns',
        '/manager/recipes',
        '/manager/costing',
      ],
    },
    {
      id: 'manager_finance',
      title: 'FINANCIALS & EXPENSES',
      icon: 'wallet-outline',
      routes: [
        '/manager/reports',
        '/manager/expenses',
        '/manager/assets',
      ],
    },
  ];
}

export default function AppSidebar({
  role,
  items,
  user,
  onLogout,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState(isCollapsed);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const { roleName, roleBadgeColor } = useRolePermissions();

  // Apple-style floating tooltip state for collapsed icon dock
  const [hoveredTooltip, setHoveredTooltip] = useState<{
    label: string;
    badge?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    top: number;
    color?: string;
  } | null>(null);

  const rawRole = roleName || user?.role || role || 'Staff';
  const displayRole = rawRole.toUpperCase();
  const badgeColor =
    roleBadgeColor && roleBadgeColor !== '#52171B' && roleBadgeColor !== '#1A1A1A'
      ? roleBadgeColor
      : '#D4AF37';

  const toggle = () => {
    setHoveredTooltip(null);
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setCollapsed(!collapsed);
    }
  };

  const currentCollapsed = onToggleCollapse !== undefined ? isCollapsed : collapsed;
  const groups = useMemo(() => getCategoryGroups(role), [role]);

  // Toggle single category accordion
  const toggleCategory = (catId: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleNavigate = (route: string) => {
    setHoveredTooltip(null);
    if (onCloseMobile) onCloseMobile();
    // Keep sidebar open on menu selection - do not auto collapse here.
    // The sidebar stays open so the user sees the page, and will only collapse
    // when the user presses/clicks anywhere on the screen outside the sidebar!
    router.push(route as any);
  };

  // Double click anywhere on sidebar to open when collapsed
  const handleDoubleClick = () => {
    if (currentCollapsed) {
      setHoveredTooltip(null);
      if (onToggleCollapse) {
        onToggleCollapse();
      } else {
        setCollapsed(false);
      }
    }
  };

  // Attach DOM dblclick listener to ensure double-click works anywhere on the sidebar
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sidebarEl = 
      document.getElementById('sultan-app-sidebar') || 
      document.querySelector('[data-sidebar="true"]') ||
      document.querySelector('.sultan-desktop-sidebar');
    if (!sidebarEl) return;
    const handleDomDblClick = () => {
      if (currentCollapsed) {
        setHoveredTooltip(null);
        if (onToggleCollapse) {
          onToggleCollapse();
        } else {
          setCollapsed(false);
        }
      }
    };
    sidebarEl.addEventListener('dblclick', handleDomDblClick);
    return () => sidebarEl.removeEventListener('dblclick', handleDomDblClick);
  }, [currentCollapsed, onToggleCollapse]);

  // Helper for setting floating dock tooltip on web
  const handleItemMouseEnter = (
    e: any,
    item: { label: string; badge?: string; icon?: keyof typeof Ionicons.glyphMap; color?: string }
  ) => {
    if (!currentCollapsed || Platform.OS !== 'web') return;
    const target = e?.currentTarget;
    if (target && target.getBoundingClientRect) {
      const rect = target.getBoundingClientRect();
      setHoveredTooltip({
        label: item.label,
        badge: item.badge,
        icon: item.icon,
        top: rect.top + rect.height / 2,
        color: item.color,
      });
    }
  };

  const handleItemMouseLeave = () => {
    if (hoveredTooltip) setHoveredTooltip(null);
  };

  // Filter items by search query if user is searching
  const isSearching = searchQuery.trim().length > 0;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const renderSidebarContent = (isMobileDrawer: boolean) => {
    const showExpanded = isMobileDrawer || !currentCollapsed;

    return (
      <View 
        style={[styles.sidebarInner, isMobileDrawer && styles.sidebarInnerMobile]}
        {...(Platform.OS === 'web' ? { 'data-sidebar': 'true' } as any : {})}
      >
        {/* CSS for Apple Dock Magnification, Tooltips & Liquid Glass */}
        {Platform.OS === 'web' && (
          <style>{`
            .liquid-glass-sidebar {
              background: linear-gradient(180deg, rgba(56, 10, 17, 0.92) 0%, rgba(28, 4, 8, 0.96) 55%, rgba(18, 3, 5, 0.99) 100%) !important;
              backdrop-filter: blur(28px) saturate(180%) !important;
              -webkit-backdrop-filter: blur(28px) saturate(180%) !important;
            }
            [data-nav="item"], .sidebar-nav-item {
              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
              cursor: pointer !important;
            }
            [data-nav="item"]:hover:not(.sidebar-nav-active) {
              background: rgba(212, 175, 55, 0.12) !important;
              border-color: rgba(212, 175, 55, 0.3) !important;
              transform: translateX(4px) !important;
            }

            /* Apple Dock / iPhone Magnification on Collapsed Icons */
            .apple-dock-item {
              position: relative !important;
              transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1),
                          background 0.2s ease,
                          box-shadow 0.2s ease !important;
              cursor: pointer !important;
            }
            .apple-dock-item:hover {
              transform: scale(1.22) translateX(4px) !important;
              z-index: 1000 !important;
            }
            .apple-dock-item:hover .dock-icon-box {
              background: linear-gradient(135deg, rgba(212, 175, 55, 0.32) 0%, rgba(82, 20, 28, 0.92) 100%) !important;
              box-shadow: 0 0 16px rgba(212, 175, 55, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
              border-color: #F3D179 !important;
              border-radius: 10px !important;
            }
            .apple-dock-item:active {
              transform: scale(1.05) !important;
            }

            /* Tooltip Entrance Spring Animation */
            @keyframes appleTooltipSpring {
              0% {
                opacity: 0;
                transform: translateY(-50%) translateX(-8px) scale(0.88);
              }
              100% {
                opacity: 1;
                transform: translateY(-50%) translateX(0) scale(1);
              }
            }
            .apple-tooltip-animate {
              animation: appleTooltipSpring 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both !important;
            }

            .sidebar-search-input:focus {
              border-color: rgba(243, 209, 121, 0.75) !important;
              box-shadow: 0 0 16px rgba(212, 175, 55, 0.28) !important;
            }
            .liquid-glass-card {
              background: rgba(255, 255, 255, 0.05) !important;
              backdrop-filter: blur(16px) !important;
              -webkit-backdrop-filter: blur(16px) !important;
            }
            .sidebar-scroll::-webkit-scrollbar {
              width: 4px;
            }
            .sidebar-scroll::-webkit-scrollbar-thumb {
              background: rgba(212, 175, 55, 0.22);
              border-radius: 4px;
            }
            .sidebar-scroll::-webkit-scrollbar-thumb:hover {
              background: rgba(212, 175, 55, 0.45);
            }
          `}</style>
        )}

        {/* 1. BRAND HEADER (Liquid Glass Glow Header) */}
        <View style={[styles.brandHeader, !showExpanded && styles.brandHeaderCollapsed]}>
          <TouchableOpacity 
            style={[styles.brandRow, !showExpanded && styles.brandRowCollapsed]} 
            activeOpacity={0.8}
            onPress={!showExpanded ? toggle : () => handleNavigate(role === 'admin' ? '/admin/dashboard' : '/manager/dashboard')}
            {...(Platform.OS === 'web' && !showExpanded ? {
              onMouseEnter: (e: any) => handleItemMouseEnter(e, { label: 'Sultan POS (Click to Expand)', badge: 'Menu', icon: 'chevron-forward' }),
              onMouseLeave: handleItemMouseLeave,
              className: 'apple-dock-item',
            } : {})}
          >
            <View style={[styles.logoGlassOrb, !showExpanded && styles.logoGlassOrbCollapsed, !showExpanded && ({ className: 'dock-icon-box' } as any)]}>
              <SultanLogo size={showExpanded ? 'sm' : 'xs'} width={showExpanded ? 34 : 26} height={showExpanded ? 34 : 26} />
              <View style={styles.orbGlowOverlay} />
            </View>
            {showExpanded && (
              <View style={styles.brandTextCol}>
                <View style={styles.brandTitleRow}>
                  <Text style={styles.brandTitle}>SULTAN</Text>
                  <View
                    style={[
                      styles.roleTagGlass,
                      badgeColor !== '#D4AF37' && {
                        backgroundColor: badgeColor + '22',
                        borderColor: badgeColor + '66',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleTagText,
                        badgeColor !== '#D4AF37' && { color: badgeColor },
                      ]}
                    >
                      {displayRole}
                    </Text>
                  </View>
                </View>
                <Text style={styles.brandSubtitle}>Restaurant Operations</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Action icon: Close for Mobile Drawer */}
          {isMobileDrawer && (
            <TouchableOpacity onPress={onCloseMobile} style={styles.glassCircleBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#F3D179" />
            </TouchableOpacity>
          )}
        </View>

        {/* 3. QUICK SEARCH & FILTER BAR */}
        {showExpanded && (
          <View style={styles.searchContainer}>
            <View style={styles.searchBarGlass}>
              <Ionicons name="search-outline" size={14} color="rgba(243, 209, 121, 0.7)" style={{ marginRight: 8 }} />
              <TextInput
                style={[
                  styles.searchInput,
                  Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
                ]}
                placeholder="Search screens..."
                placeholderTextColor="rgba(255, 255, 255, 0.38)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {isSearching && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={15} color="rgba(255, 255, 255, 0.6)" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* 4. PROPERLY CATEGORIZED NAVIGATION ITEMS */}
        <ScrollView 
          style={styles.navScrollView} 
          contentContainerStyle={styles.navScrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={() => { if (hoveredTooltip) setHoveredTooltip(null); }}
          scrollEventThrottle={16}
        >
          {groups.map((group) => {
            const groupItemsList = items.filter(it => {
              const inGroup = group.routes.includes(it.route);
              if (!inGroup) return false;
              if (isSearching) {
                return it.label.toLowerCase().includes(normalizedQuery);
              }
              return true;
            });

            if (groupItemsList.length === 0) return null;

            // Check if active route is in this category to keep it open
            const hasActiveRoute = group.routes.some(r => pathname === r);
            const isGroupCollapsed = showExpanded && !isSearching && !!collapsedCategories[group.id] && !hasActiveRoute;

            return (
              <View key={group.id} style={styles.groupCardSection}>
                {/* Category Header */}
                {showExpanded ? (
                  <TouchableOpacity 
                    style={styles.groupHeaderRow} 
                    onPress={() => toggleCategory(group.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.groupHeaderLeft}>
                      <View style={styles.groupIconSphere}>
                        <Ionicons name={group.icon} size={12} color="#F3D179" />
                      </View>
                      <Text style={styles.groupHeaderTitle}>{group.title}</Text>
                    </View>
                    <View style={styles.groupHeaderRight}>
                      <View style={styles.groupCountPill}>
                        <Text style={styles.groupCountText}>{groupItemsList.length}</Text>
                      </View>
                      <Ionicons 
                        name={isGroupCollapsed ? 'chevron-down' : 'chevron-up'} 
                        size={12} 
                        color="rgba(243, 209, 121, 0.65)" 
                        style={{ marginLeft: 4 }}
                      />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.groupDividerMini} />
                )}

                {/* Items in this category */}
                {!isGroupCollapsed && groupItemsList.map((item, iIdx) => {
                  const isActive = pathname === item.route;

                  return (
                    <TouchableOpacity
                      key={iIdx}
                      style={[
                        styles.navItem,
                        !showExpanded && styles.navItemCollapsed,
                        isActive && styles.navItemActive,
                      ]}
                      onPress={() => handleNavigate(item.route)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? {
                        'data-sidebar': 'true',
                        className: !showExpanded ? 'apple-dock-item' : 'sidebar-nav-item',
                        onMouseEnter: (e: any) => handleItemMouseEnter(e, item),
                        onMouseLeave: handleItemMouseLeave,
                      } as any : {})}
                    >
                      {/* Active liquid highlight bar */}
                      {isActive && <View style={styles.activeIndicatorLiquidBar} />}

                      <View 
                        style={[
                          styles.navIconBox, 
                          isActive && styles.navIconBoxActive,
                          !showExpanded && ({ className: 'dock-icon-box' } as any),
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={showExpanded ? 18 : 20}
                          color={isActive ? '#200408' : '#F3D179'}
                        />
                      </View>

                      {showExpanded && (
                        <View style={styles.navLabelContainer}>
                          <Text
                            style={[
                              styles.navLabel,
                              isActive && styles.navLabelActive,
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                          {item.badge && (
                            <View style={[styles.itemBadgeGlass, isActive && styles.itemBadgeGlassActive]}>
                              <Text style={[styles.itemBadgeText, isActive && styles.itemBadgeTextActive]}>
                                {item.badge}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {showExpanded && isActive && (
                        <Ionicons name="chevron-forward" size={13} color="#200408" style={styles.activeChevron} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          {/* Any remaining unassigned items (Safety Net) */}
          {(() => {
            const allGroupedRoutes = groups.flatMap(g => g.routes);
            const unassignedItems = items.filter(it => {
              if (allGroupedRoutes.includes(it.route)) return false;
              if (isSearching) {
                return it.label.toLowerCase().includes(normalizedQuery);
              }
              return true;
            });
            if (unassignedItems.length === 0) return null;

            return (
              <View style={styles.groupCardSection}>
                {showExpanded ? (
                  <View style={styles.groupHeaderRow}>
                    <View style={styles.groupHeaderLeft}>
                      <View style={styles.groupIconSphere}>
                        <Ionicons name="apps-outline" size={12} color="#F3D179" />
                      </View>
                      <Text style={styles.groupHeaderTitle}>OTHER OPERATIONS</Text>
                    </View>
                    <View style={styles.groupCountPill}>
                      <Text style={styles.groupCountText}>{unassignedItems.length}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.groupDividerMini} />
                )}

                {unassignedItems.map((item, iIdx) => {
                  const isActive = pathname === item.route;
                  return (
                    <TouchableOpacity
                      key={`unassigned-${iIdx}`}
                      style={[
                        styles.navItem,
                        !showExpanded && styles.navItemCollapsed,
                        isActive && styles.navItemActive,
                      ]}
                      onPress={() => handleNavigate(item.route)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? {
                        'data-sidebar': 'true',
                        className: !showExpanded ? 'apple-dock-item' : 'sidebar-nav-item',
                        onMouseEnter: (e: any) => handleItemMouseEnter(e, item),
                        onMouseLeave: handleItemMouseLeave,
                      } as any : {})}
                    >
                      {isActive && <View style={styles.activeIndicatorLiquidBar} />}

                      <View 
                        style={[
                          styles.navIconBox, 
                          isActive && styles.navIconBoxActive,
                          !showExpanded && ({ className: 'dock-icon-box' } as any),
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={showExpanded ? 18 : 20}
                          color={isActive ? '#200408' : '#F3D179'}
                        />
                      </View>

                      {showExpanded && (
                        <View style={styles.navLabelContainer}>
                          <Text
                            style={[
                              styles.navLabel,
                              isActive && styles.navLabelActive,
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                          {item.badge && (
                            <View style={[styles.itemBadgeGlass, isActive && styles.itemBadgeGlassActive]}>
                              <Text style={[styles.itemBadgeText, isActive && styles.itemBadgeTextActive]}>
                                {item.badge}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {showExpanded && isActive && (
                        <Ionicons name="chevron-forward" size={13} color="#200408" style={styles.activeChevron} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })()}
        </ScrollView>

        {/* 5. FOOTER QUICK ACTION & LOGOUT */}
        <View style={[styles.sidebarFooterGlass, !showExpanded && styles.sidebarFooterCollapsed]}>
          {/* Quick POS Terminal Shortcut CTA */}
          <TouchableOpacity
            style={[
              styles.quickPosGlassBtn,
              !showExpanded && styles.quickPosBtnCollapsed,
            ]}
            onPress={() => handleNavigate(role === 'admin' ? '/admin/pos' : '/manager/pos')}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' && !showExpanded ? {
              className: 'apple-dock-item',
              onMouseEnter: (e: any) => handleItemMouseEnter(e, { label: 'Launch POS Terminal', badge: 'Billing', icon: 'flash', color: '#D4AF37' }),
              onMouseLeave: handleItemMouseLeave,
            } : {})}
          >
            <View style={!showExpanded ? ({ className: 'dock-icon-box' } as any) : undefined}>
              <Ionicons name="flash" size={16} color="#200408" />
            </View>
            {showExpanded && <Text style={styles.quickPosBtnText}>Launch POS Terminal</Text>}
          </TouchableOpacity>

          {/* Logout Action */}
          <TouchableOpacity
            style={[
              styles.logoutGlassBtn,
              !showExpanded && styles.logoutBtnCollapsed,
            ]}
            onPress={onLogout}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && !showExpanded ? {
              className: 'apple-dock-item',
              onMouseEnter: (e: any) => handleItemMouseEnter(e, { label: 'Sign Out / Lock Portal', badge: 'Lock', icon: 'log-out-outline', color: '#EF4444' }),
              onMouseLeave: handleItemMouseLeave,
            } : {})}
          >
            <View style={!showExpanded ? ({ className: 'dock-icon-box' } as any) : undefined}>
              <Ionicons name="log-out-outline" size={17} color="#EF4444" />
            </View>
            {showExpanded && <Text style={styles.logoutBtnText}>Sign Out</Text>}
          </TouchableOpacity>

          {showExpanded && (
            <Text style={styles.versionStamp}>SULTAN CLOUD POS • v2.5</Text>
          )}
        </View>

        {/* 6. APPLE DOCK FLOATING TOOLTIP (RENDERED FIXED OUTSIDE SCROLLVIEW SO NEVER CLIPPED) */}
        {Platform.OS === 'web' && !showExpanded && hoveredTooltip && (
          <View
            style={[
              styles.appleDockFloatingTooltip,
              {
                top: hoveredTooltip.top,
                position: 'fixed' as any,
                left: 82,
              },
            ]}
            {...({ className: 'apple-tooltip-animate' } as any)}
            pointerEvents="none"
          >
            <View style={styles.appleDockTooltipArrow} />
            {hoveredTooltip.icon && (
              <Ionicons
                name={hoveredTooltip.icon as any}
                size={14}
                color={hoveredTooltip.color || '#F3D179'}
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={styles.appleDockTooltipText}>
              {hoveredTooltip.label}
            </Text>
            {hoveredTooltip.badge && (
              <View style={styles.appleDockTooltipBadge}>
                <Text style={styles.appleDockTooltipBadgeText}>
                  {hoveredTooltip.badge}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // If rendered in Mobile Drawer mode (onCloseMobile provided)
  if (onCloseMobile !== undefined) {
    if (!isMobileOpen) {
      return null;
    }
    return (
      <Modal
        visible={isMobileOpen}
        transparent
        animationType="fade"
        onRequestClose={onCloseMobile}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onCloseMobile} />
          <View
            style={[
              styles.mobileDrawerContainer,
              {
                paddingTop: Math.max(insets.top, 6),
                paddingBottom: Math.max(insets.bottom, 8),
              },
            ]}
          >
            {renderSidebarContent(true)}
          </View>
        </View>
      </Modal>
    );
  }

  // Desktop/Tablet Sidebar with double-click support to open
  return (
    <View 
      testID="sultan-app-sidebar"
      style={[styles.desktopSidebar, currentCollapsed && styles.desktopSidebarCollapsed]}
      {...(Platform.OS === 'web' ? { 
        id: 'sultan-app-sidebar',
        'data-sidebar': 'true',
        className: `liquid-glass-sidebar sultan-desktop-sidebar ${currentCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`,
        onDoubleClick: handleDoubleClick 
      } as any : {})}
    >
      {renderSidebarContent(false)}
    </View>
  );
}

const styles = StyleSheet.create({
  desktopSidebar: {
    width: 275,
    backgroundColor: '#1E0408',
    borderRightWidth: 1,
    borderRightColor: 'rgba(212, 175, 55, 0.25)',
    zIndex: 100,
    height: '100%',
    ...Platform.select({
      web: {
        transition: 'width 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        backgroundImage: 'linear-gradient(180deg, rgba(56, 10, 17, 0.94) 0%, rgba(30, 4, 8, 0.97) 55%, rgba(18, 3, 5, 0.99) 100%)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.35)',
        userSelect: 'none',
      } as any,
    }),
  },
  desktopSidebarCollapsed: {
    width: 78,
  },
  sidebarInner: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  sidebarInnerMobile: {
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    flexDirection: 'row',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mobileDrawerContainer: {
    width: 295,
    maxWidth: '85%',
    backgroundColor: '#1E0408',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: 'rgba(212, 175, 55, 0.28)',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(180deg, rgba(56, 10, 17, 0.92) 0%, rgba(26, 4, 8, 0.97) 100%)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
      } as any,
    }),
  },

  // 1. Brand Header
  brandHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 175, 55, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  brandHeaderCollapsed: {
    paddingHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  brandRowCollapsed: {
    flex: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  logoGlassOrbCollapsed: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  logoGlassOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 0 16px rgba(212, 175, 55, 0.35)',
      } as any,
    }),
  },
  orbGlowOverlay: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(243, 209, 121, 0.25)',
  },
  brandTextCol: {
    marginLeft: 11,
    flex: 1,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: '#F3D179',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  roleTagGlass: {
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  roleTagText: {
    color: '#F3D179',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  brandSubtitle: {
    color: 'rgba(243, 209, 121, 0.65)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  glassCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCircleBtnCollapsed: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },

  // 2. User Profile Card
  userCardGlass: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  userCardCollapsed: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 175, 55, 0.12)',
  },
  avatarGlowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarGlowCircleSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    color: '#FFD778',
    fontSize: 14,
    fontWeight: '900',
  },
  avatarTextSmall: {
    color: '#FFD778',
    fontSize: 14,
    fontWeight: '900',
  },
  onlineBeaconLive: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#1E0408',
  },
  onlineBeaconLiveSmall: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#1E0408',
  },
  userInfo: {
    marginLeft: 10,
    flex: 1,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  userStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 5,
  },
  userStatusText: {
    color: 'rgba(243, 209, 121, 0.7)',
    fontSize: 10,
    fontWeight: '600',
  },

  // 3. Search Bar
  searchContainer: {
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
  },
  searchBarGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.22)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      } as any,
    }),
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    padding: 0,
    fontWeight: '500',
  },

  // 4. Group Section & Navigation Items
  navScrollView: {
    flex: 1,
  },
  navScrollContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 20,
  },
  groupCardSection: {
    marginBottom: 10,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 2,
    borderRadius: 8,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  groupIconSphere: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 175, 55, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderTitle: {
    color: 'rgba(243, 209, 121, 0.85)',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupCountPill: {
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  groupCountText: {
    color: '#F3D179',
    fontSize: 9,
    fontWeight: '800',
  },
  groupDividerMini: {
    height: 1,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    marginHorizontal: 12,
    marginVertical: 6,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    marginBottom: 3,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 8,
    marginHorizontal: 6,
  },
  navItemActive: {
    backgroundColor: '#D4AF37',
    borderWidth: 1,
    borderColor: '#F3D179',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #F3D179 0%, #D4AF37 50%, #B8860B 100%)',
        boxShadow: '0 4px 18px rgba(212, 175, 55, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      } as any,
    }),
  },
  activeIndicatorLiquidBar: {
    position: 'absolute',
    left: 0,
    top: 5,
    bottom: 5,
    width: 3.5,
    borderRadius: 2,
    backgroundColor: '#200408',
  },
  navIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navIconBoxActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  navLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 10,
  },
  navLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    flex: 1,
  },
  navLabelActive: {
    color: '#200408',
    fontWeight: '900',
  },
  itemBadgeGlass: {
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    marginLeft: 6,
  },
  itemBadgeGlassActive: {
    backgroundColor: 'rgba(32, 4, 8, 0.15)',
    borderColor: 'rgba(32, 4, 8, 0.35)',
  },
  itemBadgeText: {
    color: '#F3D179',
    fontSize: 9.5,
    fontWeight: '900',
  },
  itemBadgeTextActive: {
    color: '#200408',
  },
  activeChevron: {
    marginLeft: 4,
  },

  // 5. Footer Quick Actions
  sidebarFooterGlass: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 175, 55, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    gap: 8,
  },
  sidebarFooterCollapsed: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  quickPosGlassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D4AF37',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #F3D179 0%, #D4AF37 55%, #B8860B 100%)',
        boxShadow: '0 4px 18px rgba(212, 175, 55, 0.45)',
        cursor: 'pointer',
      } as any,
    }),
  },
  quickPosBtnCollapsed: {
    width: 44,
    height: 44,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 12,
  },
  quickPosBtnText: {
    color: '#200408',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  logoutGlassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
    }),
  },
  logoutBtnCollapsed: {
    width: 44,
    height: 44,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 12,
  },
  logoutBtnText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '800',
  },
  versionStamp: {
    color: 'rgba(243, 209, 121, 0.4)',
    fontSize: 9.5,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  // 6. Apple Dock Floating Tooltip Styles
  appleDockFloatingTooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 4, 8, 0.96)',
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    zIndex: 999999,
    transform: [{ translateY: -18 }],
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 12px 28px rgba(0, 0, 0, 0.65), 0 0 16px rgba(212, 175, 55, 0.35)',
        pointerEvents: 'none',
      } as any,
    }),
  },
  appleDockTooltipArrow: {
    position: 'absolute',
    left: -6,
    top: '50%',
    marginTop: -5,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderTopColor: 'transparent',
    borderBottomWidth: 5,
    borderBottomColor: 'transparent',
    borderRightWidth: 6,
    borderRightColor: 'rgba(212, 175, 55, 0.55)',
  },
  appleDockTooltipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  appleDockTooltipBadge: {
    marginLeft: 7,
    backgroundColor: 'rgba(212, 175, 55, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.5)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  appleDockTooltipBadgeText: {
    color: '#F3D179',
    fontSize: 10,
    fontWeight: '900',
  },
});
