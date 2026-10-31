import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BRAND } from '../../constants/brand';
import { useRestaurantStore, Ticket } from '../../store/restaurantStore';
import { broadcastImmediately } from '../../services/syncService';

export interface AppOrder {
  id: string;
  orderNumber: string;
  source: string;
  orderType?: 'dine_in' | 'delivery';
  floor?: string;
  seatingType?: 'tables' | 'couches' | 'majlis';
  tableId?: string;
  tableName?: string;
  cabinNumber?: string;
  customer: {
    id?: string;
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
  isPaid?: boolean;
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'SERVED' | 'CANCELLED';
  createdAt: number;
  updatedAt?: number;
  riderName?: string;
  riderPhone?: string;
  assignedWaiter?: string;
  managerNotes?: string;
}

export default function AppManagerOrdersScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'dine_in' | 'delivery'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State for Dispatch / Waiter assignment
  const [selectedOrder, setSelectedOrder] = useState<AppOrder | null>(null);
  const [modalAction, setModalAction] = useState<'RIDER' | 'WAITER' | 'DETAILS' | null>(null);
  const [riderInput, setRiderInput] = useState<string>('');
  const [riderPhoneInput, setRiderPhoneInput] = useState<string>('');
  const [waiterInput, setWaiterInput] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [lastAlertTime, setLastAlertTime] = useState<number>(0);

  const staff = useRestaurantStore(state => state.staff) || [];
  const waiters = staff.filter(s => s.role.toLowerCase() === 'waiter');

  const getBaseUrl = () => {
    if (Platform.OS === 'web') {
      const host = typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? 'localhost' : (window.location.hostname || '192.168.1.4');
      return `http://${host}:5050`;
    }
    return 'http://192.168.1.4:5050';
  };

  const fetchOrders = async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
      const url = `${getBaseUrl()}/api/admin/online-orders`;
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data.orders) ? data.orders : (Array.isArray(data.data) ? data.data : []);
      if (data.success && list) {
        setOrders(list);
      }
    } catch (e) {
      console.warn('[AppManager] Failed to fetch orders:', e);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  // Connect WebSocket for zero-delay Audio & Push alerts
  useEffect(() => {
    fetchOrders();

    const host = typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? 'localhost' : (window.location?.hostname || '192.168.1.4');
    const wsUrl = `ws://${host}:5050`;
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'NEW_ORDER_ALERT' || parsed.type === 'ORDER_STATUS_CHANGED') {
            fetchOrders(true);
            setLastAlertTime(Date.now());
          }
        } catch {}
      };
    } catch {}

    const interval = setInterval(() => fetchOrders(true), 5000);

    return () => {
      clearInterval(interval);
      if (ws) {
        try { ws.close(); } catch {}
      }
    };
  }, []);

  // Update order status with 1-click
  const handleUpdateStatus = async (
    orderId: string, 
    nextStatus: string, 
    extraPayload: { riderName?: string; riderPhone?: string; assignedWaiter?: string; managerNotes?: string } = {}
  ) => {
    setUpdatingId(orderId);
    try {
      const url = `${getBaseUrl()}/api/public/orders/${orderId}/status`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          ...extraPayload
        })
      });
      const data = await res.json();
      if (data.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...data.data, status: nextStatus as any } : o));
        if (modalAction) setModalAction(null);

        // Instantly push/update KOT Ticket in Kitchen Display System (KDS)
        try {
          const store = useRestaurantStore.getState();
          const target = orders.find(o => o.id === orderId) || data.data;
          if (target && (nextStatus === 'CONFIRMED' || nextStatus === 'PREPARING')) {
            const isDineIn = target.orderType === 'dine_in';
            const kotId = `KOT-${(target.orderNumber || '').replace(/\D/g, '') || Math.floor(1000 + Math.random() * 9000)}`;
            const tableDisplayName = target.tableName || (isDineIn ? `${target.floor || 'Floor'} Table` : `Delivery: ${target.customer?.name || 'Customer'}`);

            const existing = (store.tickets || []).find(t => t.id === kotId || (t as any).orderId === target.id);
            if (!existing) {
              const newTicket: Ticket = {
                id: kotId,
                orderId: target.id,
                orderNumber: target.orderNumber,
                tableId: target.tableId || (isDineIn ? 'app-table' : 'delivery'),
                tableName: tableDisplayName,
                server: isDineIn ? (extraPayload.assignedWaiter || target.assignedWaiter || 'Floor Server') : 'Mobile App Delivery',
                timePlaced: Date.now(),
                status: 'cooking',
                items: (target.items || []).map((it: any) => ({
                  id: it.id || `it-${Date.now()}`,
                  name: it.name || it.menuItem?.name || 'Dish Item',
                  price: it.unitPrice || it.price || 0,
                  qty: it.qty || it.quantity || 1,
                  notes: it.notes || it.specialInstructions,
                  completed: false,
                  station: 'main'
                }))
              };
              store.syncFromServer({
                tickets: [newTicket, ...(store.tickets || [])]
              });
            } else {
              store.updateTicketStatus(existing.id, 'cooking');
            }
          } else if (target && (nextStatus === 'READY' || nextStatus === 'READY_FOR_PICKUP')) {
            const existing = (store.tickets || []).find(t => (t as any).orderId === target.id || t.id.includes((target.orderNumber || '').replace(/\D/g, '')));
            if (existing) {
              store.updateTicketStatus(existing.id, 'ready');
            }
          } else if (target && (nextStatus === 'SERVED' || nextStatus === 'DELIVERED')) {
            const existing = (store.tickets || []).find(t => (t as any).orderId === target.id || t.id.includes((target.orderNumber || '').replace(/\D/g, '')));
            if (existing) {
              store.updateTicketStatus(existing.id, 'served');
            }
          }
          broadcastImmediately();
        } catch (e) {
          console.warn('[AppOrders] Failed to sync ticket locally:', e);
        }
      } else {
        if (Platform.OS === 'web') window.alert(data.error || 'Failed to update order');
        else Alert.alert('Error', data.error || 'Failed to update order');
      }
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message);
      else Alert.alert('Error', err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const customerName = (order.customer?.name || '').toLowerCase();
      const customerPhone = order.customer?.phone || '';
      const orderNum = (order.orderNumber || '').toLowerCase();
      const tblName = (order.tableName || '').toLowerCase();
      const query = searchQuery.toLowerCase();

      const matchesSearch = 
        orderNum.includes(query) ||
        customerName.includes(query) ||
        customerPhone.includes(query) ||
        tblName.includes(query);

      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
      const matchesType = typeFilter === 'ALL' || (order.orderType || 'delivery') === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [orders, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const pending = orders.filter(o => o.status === 'PENDING').length;
    const preparing = orders.filter(o => o.status === 'PREPARING' || o.status === 'CONFIRMED').length;
    const dineIn = orders.filter(o => o.orderType === 'dine_in').length;
    const delivery = orders.filter(o => !o.orderType || o.orderType === 'delivery').length;
    const ready = orders.filter(o => o.status === 'READY' || o.status === 'READY_FOR_PICKUP').length;
    return { pending, preparing, dineIn, delivery, ready, total: orders.length };
  }, [orders]);

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { bg: '#FF980020', text: '#E65100', border: '#FF9800', label: '⏳ New Pending' };
      case 'CONFIRMED':
        return { bg: '#2196F320', text: '#1565C0', border: '#2196F3', label: '✓ Confirmed' };
      case 'PREPARING':
        return { bg: '#9C27B020', text: '#7B1FA2', border: '#9C27B0', label: '🍳 Cooking in Kitchen' };
      case 'READY':
      case 'READY_FOR_PICKUP':
        return { bg: '#00968820', text: '#00796B', border: '#009688', label: '✨ Ready for Handover' };
      case 'OUT_FOR_DELIVERY':
        return { bg: '#3F51B520', text: '#283593', border: '#3F51B5', label: '🛵 Rider On the Way' };
      case 'DELIVERED':
      case 'SERVED':
        return { bg: '#4CAF5020', text: '#2E7D32', border: '#4CAF50', label: '🎉 Completed / Served' };
      case 'CANCELLED':
        return { bg: '#F4433620', text: '#C62828', border: '#F44336', label: '✕ Cancelled' };
      default:
        return { bg: '#75757520', text: '#424242', border: '#757575', label: status };
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Banner / Metrics */}
      <View style={styles.headerCard}>
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={styles.headerTitle}>⚡ Sultan App Orders Command Center</Text>
            <Text style={styles.headerSubtitle}>
              Real-time synchronization with Customer Mobile App & In-Restaurant Table QR
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.refreshBtn}
            onPress={() => { setRefreshing(true); fetchOrders(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={18} color="#D5A943" />
            <Text style={styles.refreshBtnText}>Auto-Sync Active</Text>
          </TouchableOpacity>
        </View>

        {/* Counter KPI Chips */}
        <View style={styles.kpiRow}>
          <TouchableOpacity 
            style={[styles.kpiCard, statusFilter === 'PENDING' && styles.kpiCardActive]}
            onPress={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
          >
            <Text style={styles.kpiNumber}>{stats.pending}</Text>
            <Text style={styles.kpiLabel}>⚠️ Action Needed</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.kpiCard, statusFilter === 'PREPARING' && styles.kpiCardActive]}
            onPress={() => setStatusFilter(statusFilter === 'PREPARING' ? 'ALL' : 'PREPARING')}
          >
            <Text style={[styles.kpiNumber, { color: '#9C27B0' }]}>{stats.preparing}</Text>
            <Text style={styles.kpiLabel}>🍳 Kitchen Cooking</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.kpiCard, statusFilter === 'READY' && styles.kpiCardActive]}
            onPress={() => setStatusFilter(statusFilter === 'READY' ? 'ALL' : 'READY')}
          >
            <Text style={[styles.kpiNumber, { color: '#009688' }]}>{stats.ready}</Text>
            <Text style={styles.kpiLabel}>📦 Ready for Handover</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.kpiCard, typeFilter === 'dine_in' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'dine_in' ? 'ALL' : 'dine_in')}
          >
            <Text style={[styles.kpiNumber, { color: '#1976D2' }]}>{stats.dineIn}</Text>
            <Text style={styles.kpiLabel}>🏛️ In-Restaurant</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.kpiCard, typeFilter === 'delivery' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'delivery' ? 'ALL' : 'delivery')}
          >
            <Text style={[styles.kpiNumber, { color: '#E65100' }]}>{stats.delivery}</Text>
            <Text style={styles.kpiLabel}>🛵 Home Delivery</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter and Search Bar */}
      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#888" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Order #, Customer Name, Table, or Phone..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#888" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Status Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusTabsScroll}>
          {['ALL', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'SERVED'].map(st => (
            <TouchableOpacity
              key={st}
              style={[styles.statusTabPill, statusFilter === st && styles.statusTabPillActive]}
              onPress={() => setStatusFilter(st)}
            >
              <Text style={[styles.statusTabText, statusFilter === st && styles.statusTabTextActive]}>
                {st.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main Order Cards Grid / List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#D5A943" />
          <Text style={styles.loadingText}>Connecting to Sultan Live Hub...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="receipt-outline" size={60} color="#4a121a50" />
          <Text style={styles.emptyTitle}>No App Orders Found</Text>
          <Text style={styles.emptySubtitle}>
            When customers place orders from the Sultan Mobile App, they appear here live with instant notification.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.ordersList} showsVerticalScrollIndicator={false}>
          {filteredOrders.map(order => {
            const badge = getStatusBadgeStyle(order.status);
            const isDineIn = order.orderType === 'dine_in';
            const isUpdating = updatingId === order.id;

            return (
              <View key={order.id} style={styles.orderCard}>
                {/* Header Row */}
                <View style={styles.cardHeader}>
                  <View style={styles.orderIdentGroup}>
                    <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                    <View style={[styles.orderTypeTag, isDineIn ? styles.typeDineIn : styles.typeDelivery]}>
                      <Ionicons 
                        name={isDineIn ? "restaurant" : "bicycle"} 
                        size={12} 
                        color={isDineIn ? "#1565C0" : "#E65100"} 
                        style={{ marginRight: 4 }} 
                      />
                      <Text style={[styles.orderTypeText, { color: isDineIn ? "#1565C0" : "#E65100" }]}>
                        {isDineIn ? 'IN-RESTAURANT DINE-IN' : 'HOME DELIVERY'}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>

                {/* Customer & Location Meta */}
                <View style={styles.metaSection}>
                  <View style={styles.metaRow}>
                    <Ionicons name="person" size={14} color="#D5A943" style={{ marginRight: 6 }} />
                    <Text style={styles.customerName}>{order.customer?.name || 'Customer'}</Text>
                    <Text style={styles.phoneSnippet}>({order.customer?.phone || 'N/A'})</Text>
                  </View>

                  {isDineIn ? (
                    <View style={styles.locationBoxDineIn}>
                      <Ionicons name="business" size={15} color="#1565C0" style={{ marginRight: 6 }} />
                      <Text style={styles.locationTextDineIn}>
                        Floor & Table: <Text style={{ fontWeight: '700' }}>{order.tableName || 'Table'}</Text>
                        {order.floor ? ` • ${order.floor}` : ''}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.locationBoxDelivery}>
                      <Ionicons name="location" size={15} color="#E65100" style={{ marginRight: 6 }} />
                      <Text style={styles.locationTextDelivery} numberOfLines={2}>
                        {order.customer?.address || 'Delivery Address'}
                      </Text>
                    </View>
                  )}

                  {/* Rider / Waiter assigned banner if any */}
                  {order.assignedWaiter ? (
                    <View style={styles.assignedSnippet}>
                      <Ionicons name="walk" size={14} color="#2E7D32" />
                      <Text style={styles.assignedSnippetText}>Assigned Server: {order.assignedWaiter}</Text>
                    </View>
                  ) : null}

                  {order.riderName ? (
                    <View style={styles.assignedSnippet}>
                      <Ionicons name="bicycle" size={14} color="#E65100" />
                      <Text style={styles.assignedSnippetText}>Dispatched Rider: {order.riderName} ({order.riderPhone || 'No phone'})</Text>
                    </View>
                  ) : null}
                </View>

                {/* Items Summary */}
                <View style={styles.itemsSummary}>
                  {order.items.map((it, idx) => (
                    <View key={`${it.id}-${idx}`} style={styles.itemRow}>
                      <Text style={styles.itemQty}>{it.qty}x</Text>
                      <Text style={styles.itemName}>{it.name}</Text>
                      <Text style={styles.itemPrice}>Rs. {it.totalPrice.toLocaleString()}</Text>
                    </View>
                  ))}
                  <View style={styles.billDivider} />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                      Total Bill ({order.paymentMethod.replace(/_/g, ' ').toUpperCase()})
                    </Text>
                    <Text style={styles.grandTotalValue}>Rs. {order.total.toLocaleString()}</Text>
                  </View>
                </View>

                {/* Operational Action Buttons (Confirm, Kitchen, Handover) */}
                <View style={styles.actionToolbar}>
                  {/* Step 1: Confirm Order */}
                  {order.status === 'PENDING' ? (
                    <>
                      <TouchableOpacity
                        style={[styles.btnAction, styles.btnConfirm]}
                        onPress={() => handleUpdateStatus(order.id, 'CONFIRMED')}
                        disabled={isUpdating}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.btnActionText}>Confirm & Send to Kitchen</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.btnAction, styles.btnReject]}
                        onPress={() => handleUpdateStatus(order.id, 'CANCELLED')}
                        disabled={isUpdating}
                      >
                        <Ionicons name="close-circle" size={16} color="#D32F2F" />
                        <Text style={[styles.btnActionText, { color: '#D32F2F' }]}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}

                  {/* Step 2: In Kitchen Cooking -> Mark Ready */}
                  {order.status === 'CONFIRMED' || order.status === 'PREPARING' ? (
                    <TouchableOpacity
                      style={[styles.btnAction, styles.btnKitchenReady]}
                      onPress={() => handleUpdateStatus(order.id, 'READY')}
                      disabled={isUpdating}
                    >
                      <Ionicons name="restaurant" size={16} color="#FFF" style={{ marginRight: 6 }} />
                      <Text style={styles.btnActionText}>Food is Ready (Call Handover)</Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Step 3: Food Ready -> Dispatch to Rider OR Serve Table */}
                  {order.status === 'READY' || order.status === 'READY_FOR_PICKUP' ? (
                    isDineIn ? (
                      <TouchableOpacity
                        style={[styles.btnAction, styles.btnServe]}
                        onPress={() => {
                          setSelectedOrder(order);
                          setModalAction('WAITER');
                        }}
                        disabled={isUpdating}
                      >
                        <Ionicons name="walk" size={16} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.btnActionText}>Hand Over to Waiter / Serve Table</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btnAction, styles.btnRider]}
                        onPress={() => {
                          setSelectedOrder(order);
                          setRiderInput(order.riderName || 'Rider Ali');
                          setRiderPhoneInput(order.riderPhone || '03001234567');
                          setModalAction('RIDER');
                        }}
                        disabled={isUpdating}
                      >
                        <Ionicons name="bicycle" size={16} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.btnActionText}>Hand Over to Rider (Dispatch)</Text>
                      </TouchableOpacity>
                    )
                  ) : null}

                  {/* Step 4: Out for Delivery -> Mark Delivered */}
                  {order.status === 'OUT_FOR_DELIVERY' ? (
                    <TouchableOpacity
                      style={[styles.btnAction, styles.btnDelivered]}
                      onPress={() => handleUpdateStatus(order.id, 'DELIVERED')}
                      disabled={isUpdating}
                    >
                      <Ionicons name="checkmark-done" size={16} color="#FFF" style={{ marginRight: 6 }} />
                      <Text style={styles.btnActionText}>Confirm Delivered to Customer</Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Details / History Button */}
                  <TouchableOpacity
                    style={styles.btnDetails}
                    onPress={() => {
                      setSelectedOrder(order);
                      setModalAction('DETAILS');
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={18} color="#D5A943" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modal: Dispatch Rider */}
      <Modal visible={modalAction === 'RIDER'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🛵 Dispatch Order to Delivery Rider</Text>
            <Text style={styles.modalSub}>
              Order #{selectedOrder?.orderNumber} • Destination: {selectedOrder?.customer.address}
            </Text>

            <Text style={styles.inputLabel}>Rider Name:</Text>
            <TextInput
              style={styles.modalInput}
              value={riderInput}
              onChangeText={setRiderInput}
              placeholder="e.g. Rider Hamza"
              placeholderTextColor="#888"
            />

            <Text style={styles.inputLabel}>Rider Contact Phone:</Text>
            <TextInput
              style={styles.modalInput}
              value={riderPhoneInput}
              onChangeText={setRiderPhoneInput}
              placeholder="e.g. 03211234567"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalAction(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  if (selectedOrder) {
                    handleUpdateStatus(selectedOrder.id, 'OUT_FOR_DELIVERY', {
                      riderName: riderInput.trim() || 'Sultan Delivery Rider',
                      riderPhone: riderPhoneInput.trim() || '03001234567'
                    });
                  }
                }}
              >
                <Text style={styles.modalConfirmText}>Confirm Dispatch 🛵</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Assign Waiter for Dine-In Handover */}
      <Modal visible={modalAction === 'WAITER'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🍽️ Assign Server to Table</Text>
            <Text style={styles.modalSub}>
              Destination: {selectedOrder?.tableName} ({selectedOrder?.floor || 'Dining Hall'})
            </Text>

            <Text style={styles.inputLabel}>Select Staff / Waiter:</Text>
            <ScrollView style={{ maxHeight: 150, marginVertical: 8 }}>
              {waiters.map(w => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.staffSelectPill, waiterInput === w.name && styles.staffSelectPillActive]}
                  onPress={() => setWaiterInput(w.name)}
                >
                  <Text style={[styles.staffSelectText, waiterInput === w.name && styles.staffSelectTextActive]}>
                    👤 {w.name} ({w.assignedZone || 'All Floors'})
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.staffSelectPill, waiterInput === 'Counter Staff' && styles.staffSelectPillActive]}
                onPress={() => setWaiterInput('Counter Staff')}
              >
                <Text style={[styles.staffSelectText, waiterInput === 'Counter Staff' && styles.staffSelectTextActive]}>
                  👤 Counter Staff / Self Pickup
                </Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalAction(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  if (selectedOrder) {
                    handleUpdateStatus(selectedOrder.id, 'SERVED', {
                      assignedWaiter: waiterInput || 'Waiter Junaid'
                    });
                  }
                }}
              >
                <Text style={styles.modalConfirmText}>Mark As Served ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Full Order Details */}
      <Modal visible={modalAction === 'DETAILS'} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 600 }]}>
            <Text style={styles.modalTitle}>📄 Order #{selectedOrder?.orderNumber} Audit</Text>
            <ScrollView style={{ maxHeight: 350, marginVertical: 10 }}>
              <Text style={styles.detailSectionTitle}>Customer & Ordering Type:</Text>
              <Text style={styles.detailLine}>Customer: {selectedOrder?.customer.name}</Text>
              <Text style={styles.detailLine}>Phone: {selectedOrder?.customer.phone}</Text>
              <Text style={styles.detailLine}>Type: {selectedOrder?.orderType?.toUpperCase()}</Text>
              <Text style={styles.detailLine}>Target Table / Address: {selectedOrder?.tableName || selectedOrder?.customer.address}</Text>
              <Text style={styles.detailLine}>Placed At: {selectedOrder?.createdAt ? new Date(selectedOrder.createdAt).toLocaleTimeString() : 'N/A'}</Text>
              
              <Text style={[styles.detailSectionTitle, { marginTop: 15 }]}>Ordered Dishes:</Text>
              {selectedOrder?.items.map((it, idx) => (
                <View key={idx} style={styles.detailItemRow}>
                  <Text style={styles.detailItemQty}>{it.qty}x</Text>
                  <Text style={styles.detailItemName}>{it.name} {it.notes ? `(${it.notes})` : ''}</Text>
                  <Text style={styles.detailItemPrice}>Rs. {it.totalPrice}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setModalAction(null)}>
              <Text style={styles.modalCloseBtnText}>Close Audit Window</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0305',
    padding: 16,
  },
  headerCard: {
    backgroundColor: '#1E060A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4A121A',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#D5A943',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#CCC',
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#350A10',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D5A94350',
    gap: 6,
  },
  refreshBtnText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '600',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#140306',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#38090F',
    alignItems: 'center',
  },
  kpiCardActive: {
    borderColor: '#D5A943',
    backgroundColor: '#26060C',
  },
  kpiNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#E65100',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#BBB',
    marginTop: 2,
  },
  filterBar: {
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E060A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#38090F',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
  },
  statusTabsScroll: {
    gap: 8,
  },
  statusTabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1E060A',
    borderWidth: 1,
    borderColor: '#38090F',
  },
  statusTabPillActive: {
    backgroundColor: '#4A121A',
    borderColor: '#D5A943',
  },
  statusTabText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  statusTabTextActive: {
    color: '#D5A943',
  },
  loadingBox: {
    padding: 50,
    alignItems: 'center',
  },
  loadingText: {
    color: '#D5A943',
    marginTop: 10,
    fontSize: 14,
  },
  emptyBox: {
    padding: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#D5A943',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 400,
    marginTop: 6,
  },
  ordersList: {
    gap: 14,
    paddingBottom: 30,
  },
  orderCard: {
    backgroundColor: '#1A0508',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4A121A',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  orderIdentGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  orderTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeDineIn: {
    backgroundColor: '#1565C020',
  },
  typeDelivery: {
    backgroundColor: '#E6510020',
  },
  orderTypeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaSection: {
    backgroundColor: '#120305',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  phoneSnippet: {
    color: '#AAA',
    fontSize: 12,
    marginLeft: 6,
  },
  locationBoxDineIn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D274A30',
    padding: 6,
    borderRadius: 6,
  },
  locationTextDineIn: {
    color: '#90CAF9',
    fontSize: 12,
  },
  locationBoxDelivery: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A1C0D30',
    padding: 6,
    borderRadius: 6,
  },
  locationTextDelivery: {
    color: '#FFCC80',
    fontSize: 12,
  },
  assignedSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  assignedSnippetText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '600',
  },
  itemsSummary: {
    backgroundColor: '#140306',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  itemQty: {
    color: '#D5A943',
    fontWeight: '700',
    fontSize: 12,
    width: 28,
  },
  itemName: {
    color: '#EEE',
    fontSize: 13,
    flex: 1,
  },
  itemPrice: {
    color: '#BBB',
    fontSize: 12,
    fontWeight: '600',
  },
  billDivider: {
    height: 1,
    backgroundColor: '#38090F',
    marginVertical: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
  },
  grandTotalValue: {
    color: '#4CAF50',
    fontSize: 15,
    fontWeight: '800',
  },
  actionToolbar: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  btnAction: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnConfirm: {
    backgroundColor: '#2E7D32',
  },
  btnReject: {
    backgroundColor: '#33080D',
    borderWidth: 1,
    borderColor: '#D32F2F',
    flex: 0.4,
  },
  btnKitchenReady: {
    backgroundColor: '#00796B',
  },
  btnRider: {
    backgroundColor: '#E65100',
  },
  btnServe: {
    backgroundColor: '#1565C0',
  },
  btnDelivered: {
    backgroundColor: '#2E7D32',
  },
  btnActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDetails: {
    padding: 10,
    backgroundColor: '#350A10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D5A94350',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#1E060A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D5A94350',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#D5A943',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#BBB',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: '#CCC',
    marginBottom: 6,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: '#140306',
    borderWidth: 1,
    borderColor: '#4A121A',
    borderRadius: 8,
    color: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    fontSize: 14,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#350A10',
  },
  modalCancelText: {
    color: '#AAA',
    fontSize: 13,
  },
  modalConfirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#D5A943',
  },
  modalConfirmText: {
    color: '#140306',
    fontSize: 13,
    fontWeight: '800',
  },
  staffSelectPill: {
    padding: 10,
    backgroundColor: '#140306',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#38090F',
  },
  staffSelectPillActive: {
    borderColor: '#D5A943',
    backgroundColor: '#350A10',
  },
  staffSelectText: {
    color: '#DDD',
    fontSize: 13,
  },
  staffSelectTextActive: {
    color: '#D5A943',
    fontWeight: '700',
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D5A943',
    marginBottom: 6,
  },
  detailLine: {
    color: '#CCC',
    fontSize: 13,
    marginBottom: 3,
  },
  detailItemRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  detailItemQty: {
    color: '#D5A943',
    width: 30,
    fontWeight: '700',
  },
  detailItemName: {
    color: '#FFF',
    flex: 1,
  },
  detailItemPrice: {
    color: '#BBB',
  },
  modalCloseBtn: {
    marginTop: 14,
    backgroundColor: '#350A10',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D5A94350',
  },
  modalCloseBtnText: {
    color: '#D5A943',
    fontWeight: '700',
  },
});
