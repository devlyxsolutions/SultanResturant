import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Vibration, Platform, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useRestaurantStore, OnlineOrder } from '../store/restaurantStore';

/**
 * High-urgency Web Audio chime generator for browser environments
 */
function playWebChime() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Urgent two-tone ascending chime
    playTone(784, now, 0.25);        // G5
    playTone(1046.5, now + 0.15, 0.35); // C6
    playTone(1318.5, now + 0.32, 0.45); // E6
  } catch {}
}

export function FloorManagerNotificationHost() {
  const { user } = useAuthStore();
  const onlineOrders = useRestaurantStore((s) => s.onlineOrders || []);
  const pendingFloorAlert = useRestaurantStore((s) => s.pendingFloorOrderAlert);
  const staff = useRestaurantStore((s) => s.staff || []);
  const confirmOnlineOrder = useRestaurantStore((s) => s.confirmOnlineOrder);
  const rejectOnlineOrder = useRestaurantStore((s) => s.rejectOnlineOrder);

  const [selectedWaiter, setSelectedWaiter] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pulse, setPulse] = useState(false);
  const alertIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if current logged-in user is a Floor Manager, Manager, or Admin
  const isFloorStaff = useMemo(() => {
    if (!user) return false;
    const roleLower = (user.role || '').toLowerCase();
    return (
      roleLower.includes('floor') ||
      roleLower.includes('manager') ||
      roleLower.includes('admin') ||
      user.role === 'floor_manager' ||
      user.role === 'Floor Manager'
    );
  }, [user]);

  // Determine user's assigned floor(s)
  const userAssignedFloors = useMemo<string[]>(() => {
    if (!user) return [];
    const matchedStaff = staff.find(
      (st) =>
        st.id === user.id ||
        st.name?.trim().toLowerCase() === user.name?.trim().toLowerCase()
    );

    if (matchedStaff?.assignedZones && matchedStaff.assignedZones.length > 0) {
      return matchedStaff.assignedZones;
    }
    if (matchedStaff?.assignedZone) {
      return [matchedStaff.assignedZone];
    }
    return [];
  }, [user, staff]);

  // General manager or Admin can see all floors
  const isAllFloors = useMemo(() => {
    if (!user) return false;
    const r = (user.role || '').toLowerCase();
    return r === 'admin' || r === 'manager' || userAssignedFloors.length === 0;
  }, [user, userAssignedFloors]);

  // Filter urgent pending digital orders for this manager's floor
  const pendingOrdersForManager = useMemo(() => {
    if (!isFloorStaff) return [];

    return onlineOrders.filter((o) => {
      if (o.status !== 'PENDING' && o.status !== ('pending' as any)) return false;
      if (isAllFloors) return true;

      const orderFloor = (o.floor || '').trim().toLowerCase();
      return userAssignedFloors.some(
        (f) => f.trim().toLowerCase() === orderFloor || orderFloor.includes(f.trim().toLowerCase())
      );
    });
  }, [onlineOrders, isFloorStaff, isAllFloors, userAssignedFloors]);

  // Active pending order to present
  const currentPendingOrder = pendingOrdersForManager[0] || null;

  // Active floor waiters for dropdown selection
  const floorWaiters = useMemo(() => {
    return staff.filter((st) => {
      const r = (st.role || '').toLowerCase();
      if (!r.includes('waiter') && r !== 'order taker') return false;
      if (st.status === 'Inactive') return false;
      if (isAllFloors) return true;

      const orderFloor = currentPendingOrder?.floor || userAssignedFloors[0] || '';
      if (!orderFloor) return true;

      const zList = st.assignedZones || (st.assignedZone ? [st.assignedZone] : []);
      return zList.some((z) => z.toLowerCase().includes(orderFloor.toLowerCase()));
    });
  }, [staff, isAllFloors, currentPendingOrder, userAssignedFloors]);

  // Auto-select first available floor waiter
  useEffect(() => {
    if (floorWaiters.length > 0 && !selectedWaiter) {
      setSelectedWaiter(floorWaiters[0].name);
    }
  }, [floorWaiters, selectedWaiter]);

  const lastAlarmTimeRef = useRef<number>(0);
  const activeOrderId = currentPendingOrder?.id;

  // Repeating Alarm Effect: Chimes and vibrates every 6.5s until order is confirmed or rejected!
  useEffect(() => {
    if (activeOrderId && isFloorStaff) {
      const triggerAlarm = () => {
        const now = Date.now();
        // Prevent rapid double-chime within 3.5 seconds
        if (now - lastAlarmTimeRef.current < 3500) return;
        lastAlarmTimeRef.current = now;

        playWebChime();
        if (Platform.OS !== 'web') {
          try {
            Vibration.vibrate([0, 500, 200, 500]);
          } catch {}
        }
        setPulse((prev) => !prev);
      };

      // Immediate first chime
      triggerAlarm();

      // Repeating push alarm every 6.5 seconds
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = setInterval(triggerAlarm, 6500);

      return () => {
        if (alertIntervalRef.current) {
          clearInterval(alertIntervalRef.current);
          alertIntervalRef.current = null;
        }
      };
    } else {
      if (alertIntervalRef.current) {
        clearInterval(alertIntervalRef.current);
        alertIntervalRef.current = null;
      }
    }
  }, [activeOrderId, isFloorStaff]);

  if (!isFloorStaff || !currentPendingOrder) {
    return null;
  }

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await confirmOnlineOrder(currentPendingOrder.id, selectedWaiter || 'Floor Manager Confirmed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await rejectOnlineOrder(currentPendingOrder.id, 'Declined by Floor Manager');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!currentPendingOrder}
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Badge */}
            <View style={styles.urgentBadge}>
              <MaterialCommunityIcons name="bell-ring" size={24} color="#FFF" style={styles.pulseIcon} />
              <Text style={styles.urgentTitle}>NEW DIGITAL MENU ORDER — REQUIRES CONFIRMATION</Text>
            </View>

            {/* Subheader Alert Instruction */}
            <View style={styles.instructionBanner}>
              <MaterialCommunityIcons name="information" size={18} color="#D97706" />
              <Text style={styles.instructionText}>
                Digital Menu order placed by customer. Repeating alarm will stay active until confirmed or rejected.
              </Text>
            </View>

            {/* Table & Floor Details */}
            <View style={styles.infoRow}>
              <View style={styles.infoBox}>
                <Text style={styles.label}>FLOOR & TABLE</Text>
                <Text style={styles.valHighlight}>
                  {currentPendingOrder.floor || 'Ground Floor'} • {currentPendingOrder.tableName || currentPendingOrder.tableId}
                </Text>
                {!!currentPendingOrder.seatingType && (
                  <Text style={styles.subtext}>Seating: {currentPendingOrder.seatingType.toUpperCase()}</Text>
                )}
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.label}>ORDER #</Text>
                <Text style={styles.valHighlight}>#{currentPendingOrder.orderNumber}</Text>
                <Text style={styles.subtext}>
                  {currentPendingOrder.roundNumber && currentPendingOrder.roundNumber > 1
                    ? `Round ${currentPendingOrder.roundNumber}`
                    : 'Initial Round'}
                </Text>
              </View>
            </View>

            {/* Customer Details */}
            <View style={styles.customerBox}>
              <MaterialCommunityIcons name="account-circle" size={20} color="#D4AF37" />
              <Text style={styles.customerName}>
                {currentPendingOrder.customer?.name || 'Customer'}
              </Text>
              <Text style={styles.customerPhone}>
                ({currentPendingOrder.customer?.phone || 'No Phone'})
              </Text>
            </View>

            {/* Items Summary */}
            <View style={styles.itemsContainer}>
              <Text style={styles.itemsHeader}>ORDERED ITEMS ({currentPendingOrder.items.length})</Text>
              <ScrollView
                style={styles.itemsListScroll}
                contentContainerStyle={styles.itemsListScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
              >
                {currentPendingOrder.items.map((it, idx) => {
                  const qty = it.qty || it.quantity || 1;
                  const price = it.unitPrice || it.price || 0;
                  return (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemQty}>{qty}x</Text>
                      <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                      <Text style={styles.itemPrice}>Rs. {(price * qty).toLocaleString()}</Text>
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Grand Total (Incl. GST):</Text>
                <Text style={styles.totalVal}>Rs. {(currentPendingOrder.total || 0).toLocaleString()}</Text>
              </View>
            </View>

            {/* Waiter Assignment */}
            <View style={styles.waiterSection}>
              <Text style={styles.waiterLabel}>ASSIGN FLOOR WAITER:</Text>
              <View style={styles.waiterPills}>
                {floorWaiters.slice(0, 4).map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.waiterPill, selectedWaiter === w.name && styles.waiterPillActive]}
                    onPress={() => setSelectedWaiter(w.name)}
                  >
                    <Text style={[styles.waiterPillText, selectedWaiter === w.name && styles.waiterPillTextActive]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnReject]}
                onPress={handleReject}
                disabled={isProcessing}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={22} color="#EF4444" />
                <Text style={styles.btnRejectText}>Reject Order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnConfirm]}
                onPress={handleConfirm}
                disabled={isProcessing}
              >
                <MaterialCommunityIcons name="check-decagram" size={24} color="#FFF" />
                <Text style={styles.btnConfirmText}>
                  {isProcessing ? 'Confirming...' : 'CONFIRM & SEND KOT'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '94%',
    backgroundColor: '#1E1B18',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#DC2626',
    padding: 18,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  cardScroll: {
    maxHeight: '100%',
  },
  cardScrollContent: {
    paddingBottom: 4,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 12,
    gap: 10,
  },
  pulseIcon: {
    transform: [{ scale: 1.1 }],
  },
  urgentTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    flex: 1,
  },
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A1F10',
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
    gap: 8,
  },
  instructionText: {
    color: '#FDE68A',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  infoBox: {
    flex: 1,
    backgroundColor: '#282420',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3D3630',
  },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  valHighlight: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  subtext: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  customerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282420',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
    gap: 8,
  },
  customerName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  customerPhone: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  itemsContainer: {
    backgroundColor: '#282420',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  itemsHeader: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  itemsListScroll: {
    maxHeight: 160,
    overflow: 'hidden',
  },
  itemsListScrollContent: {
    gap: 4,
    paddingRight: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#38322C',
  },
  itemQty: {
    color: '#D4AF37',
    fontWeight: '800',
    width: 34,
    fontSize: 13,
  },
  itemName: {
    color: '#E5E7EB',
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  itemPrice: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#4A423A',
  },
  totalLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  totalVal: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '900',
  },
  waiterSection: {
    marginBottom: 18,
  },
  waiterLabel: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  waiterPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  waiterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#282420',
    borderWidth: 1,
    borderColor: '#4A423A',
  },
  waiterPillActive: {
    backgroundColor: '#0D9488',
    borderColor: '#14B8A6',
  },
  waiterPillText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  waiterPillTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  btnReject: {
    backgroundColor: '#2A1F1F',
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  btnRejectText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  btnConfirm: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  btnConfirmText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
