import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '../../constants/brand';

interface AppUser {
  id: string;
  name: string;
  phone: string;
  address?: string;
  deviceInfo?: string;
  registeredAt: number;
  lastLoginAt: number;
  totalOrders: number;
  totalSpent: number;
  status: string;
}

interface AppUserLog {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  action: 'SIGNUP' | 'LOGIN' | 'ORDER_PLACED';
  deviceInfo?: string;
  timestamp: number;
  details?: string;
}

interface OnlineOrder {
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
    address: string;
  };
  items: Array<{
    id: string;
    name: string;
    unitPrice: number;
    qty: number;
    totalPrice: number;
    notes?: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: string;
  createdAt: number;
}

export default function AdminAppUsers() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<'users' | 'logs' | 'orders'>('users');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<AppUserLog[]>([]);
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchAppData = async () => {
    try {
      setLoading(true);
      const baseUrl = Platform.OS === 'web' ? 'http://localhost:5050' : 'http://192.168.1.4:5050';

      const [usersRes, logsRes, ordersRes] = await Promise.all([
        fetch(`${baseUrl}/api/admin/app-users`).then(r => r.json()).catch(() => ({ users: [] })),
        fetch(`${baseUrl}/api/admin/app-logs`).then(r => r.json()).catch(() => ({ logs: [] })),
        fetch(`${baseUrl}/api/admin/online-orders`).then(r => r.json()).catch(() => ({ orders: [] })),
      ]);

      setUsers(usersRes.users || []);
      setLogs(logsRes.logs || []);
      setOrders(ordersRes.orders || []);
    } catch (err) {
      console.error('Error fetching mobile app stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppData();
    const interval = setInterval(fetchAppData, 8000); // 8s live refresh
    return () => clearInterval(interval);
  }, []);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      (u.address && u.address.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      l.action.toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  // Total Mobile Revenue
  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.total || 0), 0);
  }, [orders]);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString('en-PK', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      {/* Top Header Card */}
      <View style={styles.headerRow}>
        <View>
          <View style={styles.badgeRow}>
            <View style={styles.livePulseDot} />
            <Text style={styles.liveText}>LIVE MOBILE HUB</Text>
          </View>
          <Text style={styles.title}>Mobile App Users & Downloads</Text>
          <Text style={styles.subtitle}>
            Monitor customer sign-ups, login activities, device types, and online delivery orders in real time.
          </Text>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={fetchAppData} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color={BRAND.surface} />
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Cards Row */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Ionicons name="phone-portrait-outline" size={24} color={BRAND.burgundy} />
          <View style={styles.kpiInfo}>
            <Text style={styles.kpiLabel}>Total App Installs</Text>
            <Text style={styles.kpiValue}>{users.length}</Text>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <Ionicons name="log-in-outline" size={24} color={BRAND.info} />
          <View style={styles.kpiInfo}>
            <Text style={styles.kpiLabel}>Login / Signup Logs</Text>
            <Text style={styles.kpiValue}>{logs.length}</Text>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <Ionicons name="bag-check-outline" size={24} color={BRAND.warn} />
          <View style={styles.kpiInfo}>
            <Text style={styles.kpiLabel}>Online App Orders</Text>
            <Text style={styles.kpiValue}>{orders.length}</Text>
          </View>
        </View>

        <View style={styles.kpiCard}>
          <Ionicons name="cash-outline" size={24} color={BRAND.success} />
          <View style={styles.kpiInfo}>
            <Text style={styles.kpiLabel}>Mobile App Revenue</Text>
            <Text style={styles.kpiValue}>Rs. {totalRevenue.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {/* Tab Controls & Search Bar */}
      <View style={styles.controlsRow}>
        <View style={styles.tabButtonsGroup}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'users' && styles.activeTabBtn]}
            onPress={() => setActiveTab('users')}
          >
            <Ionicons name="people" size={16} color={activeTab === 'users' ? BRAND.surface : BRAND.text} />
            <Text style={[styles.tabBtnText, activeTab === 'users' && styles.activeTabBtnText]}>
              Registered Users ({users.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'logs' && styles.activeTabBtn]}
            onPress={() => setActiveTab('logs')}
          >
            <Ionicons name="list" size={16} color={activeTab === 'logs' ? BRAND.surface : BRAND.text} />
            <Text style={[styles.tabBtnText, activeTab === 'logs' && styles.activeTabBtnText]}>
              Login & Activity Logs ({logs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'orders' && styles.activeTabBtn]}
            onPress={() => setActiveTab('orders')}
          >
            <Ionicons name="cart" size={16} color={activeTab === 'orders' ? BRAND.surface : BRAND.text} />
            <Text style={[styles.tabBtnText, activeTab === 'orders' && styles.activeTabBtnText]}>
              Mobile Orders ({orders.length})
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={BRAND.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, phone or action..."
            placeholderTextColor={BRAND.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={BRAND.burgundy} />
          <Text style={styles.loadingText}>Loading live mobile ecosystem data...</Text>
        </View>
      ) : (
        <ScrollView style={styles.contentScroll} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* TAB 1: USERS LIST */}
          {activeTab === 'users' && (
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>CUSTOMER</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>PHONE NUMBER</Text>
                <Text style={[styles.th, { flex: 2 }]}>DEVICE / OS</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>SIGN UP DATE</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>LAST LOGIN</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>ORDERS</Text>
              </View>

              {filteredUsers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No registered mobile users found.</Text>
                </View>
              ) : (
                filteredUsers.map((u) => (
                  <View key={u.id} style={styles.tableRow}>
                    <View style={[styles.tdCell, { flex: 2 }]}>
                      <Text style={styles.userNameText}>{u.name}</Text>
                      {u.address ? <Text style={styles.userAddressText} numberOfLines={1}>{u.address}</Text> : null}
                    </View>
                    <Text style={[styles.tdText, { flex: 1.5, fontWeight: '600' }]}>{u.phone}</Text>
                    <View style={[styles.tdCell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                      <Ionicons
                        name={u.deviceInfo?.includes('iOS') || u.deviceInfo?.includes('iPhone') ? 'logo-apple' : 'phone-portrait-outline'}
                        size={16}
                        color={BRAND.muted}
                      />
                      <Text style={styles.deviceText} numberOfLines={1}>{u.deviceInfo || 'Mobile App'}</Text>
                    </View>
                    <Text style={[styles.tdText, { flex: 1.5, color: BRAND.muted }]}>{formatDate(u.registeredAt)}</Text>
                    <Text style={[styles.tdText, { flex: 1.5, color: BRAND.info, fontWeight: '600' }]}>{formatDate(u.lastLoginAt)}</Text>
                    <View style={[styles.tdCell, { flex: 1, alignItems: 'flex-end' }]}>
                      <View style={styles.orderCountPill}>
                        <Text style={styles.orderCountPillText}>{u.totalOrders || 0}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 2: AUDIT LOGS */}
          {activeTab === 'logs' && (
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1.2 }]}>ACTION</Text>
                <Text style={[styles.th, { flex: 2 }]}>USER</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>PHONE</Text>
                <Text style={[styles.th, { flex: 2 }]}>DEVICE / CLIENT</Text>
                <Text style={[styles.th, { flex: 2 }]}>DETAILS</Text>
                <Text style={[styles.th, { flex: 1.8, textAlign: 'right' }]}>TIMESTAMP</Text>
              </View>

              {filteredLogs.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No activity logs recorded yet.</Text>
                </View>
              ) : (
                filteredLogs.map((log) => {
                  const isSignup = log.action === 'SIGNUP';
                  const isLogin = log.action === 'LOGIN';
                  const isOrder = log.action === 'ORDER_PLACED';

                  const badgeBg = isSignup ? BRAND.successSoft : isLogin ? BRAND.infoSoft : BRAND.goldSoft;
                  const badgeColor = isSignup ? BRAND.success : isLogin ? BRAND.info : BRAND.burgundy;

                  return (
                    <View key={log.id} style={styles.tableRow}>
                      <View style={[styles.tdCell, { flex: 1.2 }]}>
                        <View style={[styles.actionBadge, { backgroundColor: badgeBg }]}>
                          <Text style={[styles.actionBadgeText, { color: badgeColor }]}>{log.action}</Text>
                        </View>
                      </View>
                      <Text style={[styles.tdText, { flex: 2, fontWeight: '700' }]}>{log.name}</Text>
                      <Text style={[styles.tdText, { flex: 1.5, color: BRAND.text }]}>{log.phone}</Text>
                      <Text style={[styles.tdText, { flex: 2, color: BRAND.muted }]} numberOfLines={1}>
                        {log.deviceInfo || 'Mobile App'}
                      </Text>
                      <Text style={[styles.tdText, { flex: 2, color: BRAND.muted }]} numberOfLines={1}>
                        {log.details || 'Event logged'}
                      </Text>
                      <Text style={[styles.tdText, { flex: 1.8, textAlign: 'right', color: BRAND.muted }]}>
                        {formatDate(log.timestamp)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 3: MOBILE ORDERS */}
          {activeTab === 'orders' && (
            <View style={styles.ordersGrid}>
              {orders.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No mobile delivery orders placed yet.</Text>
                </View>
              ) : (
                orders.map((ord) => (
                  <View key={ord.id} style={styles.orderCard}>
                    <View style={styles.orderCardHeader}>
                      <View>
                        <Text style={styles.orderCardNum}>{ord.orderNumber}</Text>
                        <Text style={styles.orderCardTime}>{formatDate(ord.createdAt)}</Text>
                      </View>
                      <View style={styles.orderStatusBadge}>
                        <Text style={styles.orderStatusBadgeText}>{ord.status}</Text>
                      </View>
                    </View>

                    <View style={styles.customerBox}>
                      <Text style={styles.customerName}>{ord.customer?.name}</Text>
                      <Text style={styles.customerPhone}>📞 {ord.customer?.phone}</Text>
                      <Text style={styles.customerAddress}>📍 {ord.customer?.address}</Text>
                    </View>

                    <View style={styles.orderItemsList}>
                      <Text style={styles.itemsTitle}>Items Ordered:</Text>
                      {ord.items?.map((it, idx) => (
                        <View key={idx} style={styles.itemRow}>
                          <Text style={styles.itemQty}>{it.qty}x</Text>
                          <Text style={styles.itemName}>{it.name}</Text>
                          <Text style={styles.itemPrice}>Rs. {it.totalPrice?.toLocaleString()}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.orderFooter}>
                      <Text style={styles.paymentMethod}>
                        Payment: <Text style={{ fontWeight: 'bold' }}>{ord.paymentMethod?.toUpperCase()}</Text>
                      </Text>
                      <Text style={styles.totalBill}>Rs. {ord.total?.toLocaleString()}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bg,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND.success,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.success,
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BRAND.ink,
  },
  subtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 4,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: BRAND.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  kpiInfo: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 12,
    color: BRAND.muted,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BRAND.ink,
    marginTop: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
    flexWrap: 'wrap',
  },
  tabButtonsGroup: {
    flexDirection: 'row',
    backgroundColor: BRAND.surface,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  activeTabBtn: {
    backgroundColor: BRAND.burgundy,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.text,
  },
  activeTabBtnText: {
    color: BRAND.surface,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    width: 280,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BRAND.ink,
  },
  loadingBox: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: BRAND.muted,
    fontSize: 14,
  },
  contentScroll: {
    flex: 1,
  },
  tableCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BRAND.cream,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  th: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.burgundyDark,
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  tdCell: {
    justifyContent: 'center',
  },
  tdText: {
    fontSize: 13,
    color: BRAND.ink,
  },
  userNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.ink,
  },
  userAddressText: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  deviceText: {
    fontSize: 12,
    color: BRAND.muted,
  },
  orderCountPill: {
    backgroundColor: BRAND.goldSoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  orderCountPillText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: BRAND.burgundy,
  },
  actionBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: BRAND.muted,
    fontSize: 14,
  },
  ordersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  orderCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    width: '48%',
    minWidth: 320,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    paddingBottom: 10,
    marginBottom: 10,
  },
  orderCardNum: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BRAND.burgundy,
  },
  orderCardTime: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  orderStatusBadge: {
    backgroundColor: BRAND.goldSoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  orderStatusBadgeText: {
    color: BRAND.burgundy,
    fontSize: 11,
    fontWeight: 'bold',
  },
  customerBox: {
    backgroundColor: BRAND.cream,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  customerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BRAND.ink,
  },
  customerPhone: {
    fontSize: 12,
    color: BRAND.text,
    marginTop: 2,
  },
  customerAddress: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  orderItemsList: {
    marginVertical: 8,
  },
  itemsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.muted,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  itemQty: {
    fontSize: 12,
    fontWeight: 'bold',
    color: BRAND.burgundy,
    width: 24,
  },
  itemName: {
    flex: 1,
    fontSize: 12,
    color: BRAND.ink,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.ink,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    paddingTop: 10,
    marginTop: 6,
  },
  paymentMethod: {
    fontSize: 12,
    color: BRAND.muted,
  },
  totalBill: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BRAND.burgundy,
  },
});
