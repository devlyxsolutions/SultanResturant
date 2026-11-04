import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Vibration,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore, FoodReadyAlert, Ticket } from '../store/restaurantStore';
import { useAuthStore } from '../store';
import { getTableFloor } from '../constants/floors';
import { broadcastImmediately } from '../services/syncService';
import { playNotificationSound } from '../../modules/call-detector/src';

// Reusable Web Audio synth context
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (e) {
    return null;
  }
}

/**
 * High-definition 3-tone pleasant restaurant chime for Food/Drinks Ready:
 * C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz)
 */
function playFoodReadyChime() {
  if (Platform.OS === 'web') {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99]; // Major triad service chime
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0, now + idx * 0.14);
        gain.gain.linearRampToValueAtTime(0.24, now + idx * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.4);
      });
    } catch (e) {}
  } else {
    Vibration.vibrate([0, 300, 150, 300]);
    try {
      playNotificationSound('food_ready');
    } catch (e) {}
  }
}

/**
 * 2-tone notification for Bill Paid
 */
function playBillPaidChime() {
  if (Platform.OS === 'web') {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const freqs = [659.25, 880];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);
        gain.gain.setValueAtTime(0.22, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.36);
      });
    } catch (e) {}
  } else {
    Vibration.vibrate([0, 200, 100, 200]);
    try {
      playNotificationSound('bill_paid');
    } catch (e) {}
  }
}

export default function WaiterNotificationHost() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  // Stores
  const lastFoodReadyAlert = useRestaurantStore((state) => state.lastFoodReadyAlert);
  const clearFoodReadyAlert = useRestaurantStore((state) => state.clearFoodReadyAlert);
  const lastBillPaidAlert = useRestaurantStore((state) => state.lastBillPaidAlert);
  const clearBillPaidAlert = useRestaurantStore((state) => state.clearBillPaidAlert);
  const settleBill = useRestaurantStore((state) => state.settleBill);
  const serveTableTickets = useRestaurantStore((state) => state.serveTableTickets);
  const tables = useRestaurantStore((state) => state.tables) || [];
  const tickets = useRestaurantStore((state) => state.tickets) || [];
  const staff = useRestaurantStore((state) => state.staff) || [];
  const user = useAuthStore((state) => state.user);

  // Active Toast State
  const [activeToast, setActiveToast] = useState<{
    id: string;
    type: 'food' | 'bill' | 'cooking' | 'item_ready';
    tableId: string;
    tableName: string;
    title: string;
    subtitle: string;
    badge: string;
    station?: 'main' | 'juice' | 'all';
    billTotal?: number;
  } | null>(null);

  const [slideAnim] = useState(() => new Animated.Value(-120));
  const lastProcessedFoodAlertId = useRef<string>('');
  const lastProcessedBillAlertId = useRef<string>('');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Order Taker authorized floors lookup
  const currentStaff = staff.find(
    (s) =>
      (user?.staffId && s.id === user.staffId) ||
      (user?.name && s.name.trim().toLowerCase() === user.name.trim().toLowerCase())
  );

  const assignedZonesList: string[] = useMemo(() => {
    return currentStaff?.assignedZones && currentStaff.assignedZones.length > 0
      ? currentStaff.assignedZones
      : currentStaff?.assignedZone
      ? [currentStaff.assignedZone]
      : user?.assignedZones && user.assignedZones.length > 0
      ? user.assignedZones
      : user?.assignedZone
      ? [user.assignedZone]
      : ['All Floors'];
  }, [currentStaff, user]);

  const isAllFloors =
    assignedZonesList.includes('All Floors') || assignedZonesList.length === 0;

  const isTableAuthorized = useCallback(
    (tableId: string, tableName?: string): boolean => {
      if (isAllFloors) return true;
      const target = tables.find(
        (t) =>
          t.id === tableId ||
          (tableName && t.name.trim().toLowerCase() === tableName.trim().toLowerCase())
      );
      if (!target) return true;
      const floor = getTableFloor(target);
      return assignedZonesList.some((af) => af.toLowerCase() === floor.toLowerCase());
    },
    [isAllFloors, tables, assignedZonesList]
  );

  // 1. One-touch Audio & Web Notification Unlocker
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const unlockAudio = () => {
        getAudioContext();
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      };
      window.addEventListener('click', unlockAudio, { once: true });
      window.addEventListener('touchstart', unlockAudio, { once: true });
      return () => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
    }
  }, []);

  const hideToast = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -140,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setActiveToast(null);
    });
  }, [slideAnim]);

  // 2. Watch for Food Ready Alerts
  useEffect(() => {
    if (!lastFoodReadyAlert) return;
    if (lastFoodReadyAlert.id === lastProcessedFoodAlertId.current) return;

    // Check if alert is fresh (< 15 mins with skew buffer)
    if (Math.abs(Date.now() - lastFoodReadyAlert.time) > 15 * 60 * 1000) return;

    // Check floor authorization
    if (!isTableAuthorized(lastFoodReadyAlert.tableId, lastFoodReadyAlert.tableName)) return;

    lastProcessedFoodAlertId.current = lastFoodReadyAlert.id;

    // Play pleasant doorbell service chime
    playFoodReadyChime();

    // Trigger browser push notification if permitted
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(`🔔 Food Ready: ${lastFoodReadyAlert.tableName}`, {
          body: `${lastFoodReadyAlert.stationLabel}: ${lastFoodReadyAlert.itemsSummary}`,
          icon: '/favicon.ico',
        });
      } catch {}
    }

    // Show interactive top toast
    const isJuice = lastFoodReadyAlert.station === 'juice';
    const isCooking = lastFoodReadyAlert.type === 'cooking_started';
    const isItemReady = lastFoodReadyAlert.type === 'item_ready';

    let title = isJuice ? 'Juice Bar: Drinks Ready!' : 'Kitchen: Food Ready!';
    let badge = isJuice ? 'DRINKS READY' : 'FOOD READY';
    if (isCooking) {
      title = `${lastFoodReadyAlert.stationLabel}: Cooking Started!`;
      badge = 'COOKING STARTED';
    } else if (isItemReady) {
      title = `🔥 Fast Serve: ${lastFoodReadyAlert.tableName}`;
      badge = 'ITEM READY - SERVE NOW';
    }

    const toastTimer = setTimeout(() => {
      setActiveToast({
        id: lastFoodReadyAlert.id,
        type: isCooking ? 'cooking' : isItemReady ? 'item_ready' : 'food',
        tableId: lastFoodReadyAlert.tableId,
        tableName: lastFoodReadyAlert.tableName,
        title,
        subtitle: `${lastFoodReadyAlert.tableName} • ${lastFoodReadyAlert.itemsSummary}`,
        badge,
        station: lastFoodReadyAlert.station,
      });

      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
      }).start();
    }, 0);

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      hideToast();
    }, 12000);

    return () => clearTimeout(toastTimer);
  }, [lastFoodReadyAlert, isTableAuthorized, slideAnim, hideToast]);

  // 3. Watch for Bill Paid Alerts
  useEffect(() => {
    if (!lastBillPaidAlert) return;
    const alertId = lastBillPaidAlert.id || `bill_${lastBillPaidAlert.tableId}_${lastBillPaidAlert.time}`;
    if (alertId === lastProcessedBillAlertId.current) return;
    if (lastBillPaidAlert.time && Math.abs(Date.now() - lastBillPaidAlert.time) > 15 * 60 * 1000) return;
    if (!isTableAuthorized(lastBillPaidAlert.tableId, lastBillPaidAlert.tableName)) return;

    lastProcessedBillAlertId.current = alertId;

    playBillPaidChime();

    const toastTimer = setTimeout(() => {
      setActiveToast({
        id: alertId,
        type: 'bill',
        tableId: lastBillPaidAlert.tableId,
        tableName: lastBillPaidAlert.tableName,
        title: `Bill Paid: ${lastBillPaidAlert.tableName}`,
        subtitle: `Rs. ${lastBillPaidAlert.billTotal?.toLocaleString()} collected. Guests still seated — release table when vacated.`,
        badge: 'BILL PAID',
        billTotal: lastBillPaidAlert.billTotal,
      });

      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
      }).start();
    }, 0);

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      hideToast();
    }, 14000);

    return () => clearTimeout(toastTimer);
  }, [lastBillPaidAlert, isTableAuthorized, slideAnim, hideToast]);

  const handleServeNow = () => {
    if (!activeToast) return;
    serveTableTickets(activeToast.tableId);
    clearFoodReadyAlert(activeToast.id);
    clearFoodReadyAlert(activeToast.tableId);
    broadcastImmediately();
    hideToast();
  };

  const handleReleaseTableFromToast = () => {
    if (!activeToast) return;
    settleBill(activeToast.tableId);
    clearBillPaidAlert(activeToast.id);
    clearBillPaidAlert(activeToast.tableId);
    clearBillPaidAlert();
    broadcastImmediately();
    hideToast();
  };

  const handleViewTable = () => {
    if (!activeToast) return;
    const targetId = activeToast.tableId;
    hideToast();
    router.push(`/waiter/order/${targetId}` as any);
  };

  const handleDismiss = () => {
    if (!activeToast) return;
    if (activeToast.type === 'bill') {
      clearBillPaidAlert(activeToast.id);
      clearBillPaidAlert(activeToast.tableId);
      clearBillPaidAlert();
    } else {
      clearFoodReadyAlert(activeToast.id);
      clearFoodReadyAlert(activeToast.tableId);
    }
    broadcastImmediately();
    hideToast();
  };

  if (!activeToast) return null;

  const isBill = activeToast.type === 'bill';
  const isCooking = activeToast.type === 'cooking';
  const isItemReady = activeToast.type === 'item_ready';
  const isFood = activeToast.type === 'food' || isItemReady;
  const isJuice = activeToast.station === 'juice';

  let accentColor = isJuice ? '#FF9500' : '#007AFF';
  let iconName: any = isJuice ? 'wine' : 'restaurant';
  let iconBg = isJuice ? '#FFF3E0' : '#EBF5FF';
  let iconColor = isJuice ? '#E65100' : '#007AFF';

  if (isCooking) {
    accentColor = '#FF9500';
    iconName = 'flame';
    iconBg = '#FFF8E1';
    iconColor = '#F57C00';
  } else if (isItemReady) {
    accentColor = '#34C759';
    iconName = 'flash';
    iconBg = '#E8F5E9';
    iconColor = '#2E7D32';
  } else if (isBill) {
    accentColor = '#E67E22';
    iconName = 'card';
    iconBg = '#FDF2E9';
    iconColor = '#D35400';
  }

  return (
    <Animated.View
      style={[
        styles.toastWrapper,
        {
          transform: [{ translateY: slideAnim }],
          width: isMobile ? '94%' : 540,
        },
      ]}
    >
      <View style={[styles.toastCard, isBill && styles.toastCardBill]}>
        {/* Accent Left Bar */}
        <View
          style={[
            styles.accentBar,
            { backgroundColor: accentColor },
          ]}
        />

        {/* Icon Circle */}
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: iconBg },
          ]}
        >
          <Ionicons
            name={iconName}
            size={22}
            color={iconColor}
          />
        </View>

        {/* Info */}
        <View style={styles.infoCol}>
          <View style={styles.topRow}>
            <View
              style={[
                styles.badgeWrap,
                { backgroundColor: accentColor },
              ]}
            >
              <Text style={styles.badgeText}>{activeToast.badge}</Text>
            </View>
            <Text style={styles.toastTitle} numberOfLines={1}>
              {activeToast.title}
            </Text>
          </View>
          <Text style={styles.toastSubtitle} numberOfLines={2}>
            {activeToast.subtitle}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            {isFood && (
              <TouchableOpacity
                style={[styles.serveBtn, isItemReady && { backgroundColor: '#34C759' }]}
                onPress={handleServeNow}
                activeOpacity={0.82}
              >
                <Ionicons name="checkmark-done" size={15} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.serveBtnText}>{isItemReady ? 'Mark Served' : 'Serve Now'}</Text>
              </TouchableOpacity>
            )}
            {isBill && (
              <TouchableOpacity
                style={[styles.serveBtn, { backgroundColor: '#E67E22' }]}
                onPress={handleReleaseTableFromToast}
                activeOpacity={0.82}
              >
                <Ionicons name="checkmark-circle" size={15} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.serveBtnText}>Release Table</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.viewTableBtn}
              onPress={handleViewTable}
              activeOpacity={0.82}
            >
              <Text style={styles.viewTableBtnText}>
                Open Table ➔
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dismiss Button */}
        <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastWrapper: {
    top: 14,
    alignSelf: 'center',
    zIndex: 99999,
    elevation: 10,
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        left: '50%',
        transform: [{ translateX: -270 } as any],
      },
      default: {
        position: 'absolute',
      },
    }),
  },
  toastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
    overflow: 'hidden',
  },
  toastCardBill: {
    borderColor: '#E67E22',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 5,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoCol: {
    flex: 1,
    paddingRight: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  badgeWrap: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  toastSubtitle: {
    fontSize: 12,
    color: '#636366',
    lineHeight: 16,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serveBtn: {
    backgroundColor: '#34C759',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  serveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  viewTableBtn: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  viewTableBtnText: {
    color: '#1C1C1E',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
    alignSelf: 'flex-start',
  },
});
