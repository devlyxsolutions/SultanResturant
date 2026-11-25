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
import { useRestaurantStore } from '../store/restaurantStore';
import { useAuthStore } from '../store';
import { isOrderTakerUser } from '../utils/orderTakerScope';
import { playNotificationSound } from '../../modules/call-detector/src';

let opsAudioCtx: AudioContext | null = null;

function getOpsAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!opsAudioCtx || opsAudioCtx.state === 'closed') {
      opsAudioCtx = new AudioCtx();
    }
    if (opsAudioCtx.state === 'suspended') {
      opsAudioCtx.resume().catch(() => {});
    }
    return opsAudioCtx;
  } catch {
    return null;
  }
}

/** Distinct 2-note warm service chime for Table Move */
function playTableMoveChime() {
  if (Platform.OS === 'web') {
    try {
      const ctx = getOpsAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const freqs = [587.33, 880]; // D5 -> A5
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0, now + idx * 0.14);
        gain.gain.linearRampToValueAtTime(0.24, now + idx * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.36);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.38);
      });
    } catch {}
  } else {
    try {
      Vibration.vibrate([0, 220, 100, 260]);
      playNotificationSound('bill_paid');
    } catch {}
  }
}

/** Distinct alert tone for Punched Order Cancellation */
function playOrderCancelledChime() {
  if (Platform.OS === 'web') {
    try {
      const ctx = getOpsAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const freqs = [740, 554.37, 440]; // Descending F#5 -> C#5 -> A4 alert
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.13);
        gain.gain.setValueAtTime(0, now + idx * 0.13);
        gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.13 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.13 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.13);
        osc.stop(now + idx * 0.13 + 0.32);
      });
    } catch {}
  } else {
    try {
      Vibration.vibrate([0, 320, 120, 320, 120, 400]);
      playNotificationSound('food_ready');
    } catch {}
  }
}

type ActiveOpsToast =
  | {
      kind: 'table_move';
      id: string;
      fromTableName: string;
      toTableId: string;
      toTableName: string;
      fromFloor?: string;
      toFloor?: string;
      movedBy: string;
      movedByRole?: string;
      note: string;
      activeTicketsCount: number;
      itemsCount: number;
      billTotal: number;
      time: number;
    }
  | {
      kind: 'order_cancelled';
      id: string;
      ticketId: string;
      tableId: string;
      tableName: string;
      floor?: string;
      cancelledBy: string;
      cancelledByRole?: string;
      reason: string;
      itemsSummary: string;
      totalQty: number;
      totalAmount: number;
      time: number;
    };

export default function CashierOpsNotificationHost() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const user = useAuthStore((s) => s.user);
  const staffRaw = useRestaurantStore((s) => s.staff);
  const staff = useMemo(() => staffRaw || [], [staffRaw]);
  const lastTableMoveAlert = useRestaurantStore((s) => s.lastTableMoveAlert);
  const lastOrderCancelledAlert = useRestaurantStore((s) => s.lastOrderCancelledAlert);

  const [activeToast, setActiveToast] = useState<ActiveOpsToast | null>(null);
  const [slideAnim] = useState(() => new Animated.Value(-160));
  const seenIdsRef = useRef<Set<string>>(new Set());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStaff = useMemo(
    () =>
      staff.find(
        (s) =>
          (user?.staffId && s.id === user.staffId) ||
          (user?.name && s.name.trim().toLowerCase() === user.name.trim().toLowerCase())
      ),
    [staff, user]
  );

  // Strictly notify Cashier, Admin, Manager, and Floor Manager terminals (NOT Order Takers, Kitchen, JuiceBar, Playland)
  const isCashierOrManagement = useMemo(() => {
    if (!user) return false;
    if (isOrderTakerUser(user, currentStaff)) return false;
    const roleLower = String(user.role || '').toLowerCase();
    const customRoleId = String(user.customRoleId || currentStaff?.customRoleId || '').toLowerCase();
    const desigLower = String(currentStaff?.designation || '').toLowerCase();
    if (roleLower === 'kitchen' || roleLower === 'juicebar' || roleLower === 'playland') {
      return false;
    }
    return (
      roleLower === 'cashier' ||
      roleLower === 'admin' ||
      roleLower === 'manager' ||
      roleLower.includes('manager') ||
      roleLower.includes('floor') ||
      customRoleId.includes('cashier') ||
      customRoleId.includes('admin') ||
      customRoleId.includes('manager') ||
      desigLower.includes('cashier')
    );
  }, [user, currentStaff]);

  const isAdminOrManager = useMemo(() => {
    if (!user) return false;
    const r = String(user.role || '').toLowerCase();
    return r === 'admin' || r === 'manager';
  }, [user]);

  const hideToast = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    Animated.timing(slideAnim, {
      toValue: -170,
      duration: 240,
      useNativeDriver: true,
    }).start(() => {
      setActiveToast(null);
    });
  }, [slideAnim]);

  const showToast = useCallback(
    (toast: ActiveOpsToast) => {
      setActiveToast(toast);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 5,
      }).start();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        hideToast();
      }, 18000);
    },
    [slideAnim, hideToast]
  );

  // Unlock Web Audio on first click/touch
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const unlock = () => {
        getOpsAudioContext();
      };
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });
      return () => {
        window.removeEventListener('click', unlock);
        window.removeEventListener('touchstart', unlock);
      };
    }
  }, []);

  // 1. Watch live Table Move alerts
  useEffect(() => {
    if (!isCashierOrManagement || !lastTableMoveAlert || !lastTableMoveAlert.id) return;
    if (seenIdsRef.current.has(lastTableMoveAlert.id)) return;
    if (lastTableMoveAlert.time && Math.abs(Date.now() - lastTableMoveAlert.time) > 10 * 60 * 1000) return;

    seenIdsRef.current.add(lastTableMoveAlert.id);
    playTableMoveChime();

    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(`Table Moved: ${lastTableMoveAlert.fromTableName} → ${lastTableMoveAlert.toTableName}`, {
          body: `By ${lastTableMoveAlert.movedBy} • Note: "${lastTableMoveAlert.note}" • Bill Rs. ${Number(
            lastTableMoveAlert.billTotal || 0
          ).toLocaleString()}`,
          icon: '/favicon.ico',
        });
      } catch {}
    }

    const toastTimer = setTimeout(() => {
      showToast({
        kind: 'table_move',
        id: lastTableMoveAlert.id,
        fromTableName: lastTableMoveAlert.fromTableName,
        toTableId: lastTableMoveAlert.toTableId,
        toTableName: lastTableMoveAlert.toTableName,
        fromFloor: lastTableMoveAlert.fromFloor,
        toFloor: lastTableMoveAlert.toFloor,
        movedBy: lastTableMoveAlert.movedBy,
        movedByRole: lastTableMoveAlert.movedByRole,
        note: lastTableMoveAlert.note,
        activeTicketsCount: lastTableMoveAlert.activeTicketsCount,
        itemsCount: lastTableMoveAlert.itemsCount,
        billTotal: lastTableMoveAlert.billTotal,
        time: lastTableMoveAlert.time,
      });
    }, 0);
    return () => clearTimeout(toastTimer);
  }, [isCashierOrManagement, lastTableMoveAlert, showToast]);

  // 2. Watch live Punched Order Cancellation alerts
  useEffect(() => {
    if (!isCashierOrManagement || !lastOrderCancelledAlert || !lastOrderCancelledAlert.id) return;
    if (seenIdsRef.current.has(lastOrderCancelledAlert.id)) return;
    if (lastOrderCancelledAlert.time && Math.abs(Date.now() - lastOrderCancelledAlert.time) > 10 * 60 * 1000) return;

    seenIdsRef.current.add(lastOrderCancelledAlert.id);
    playOrderCancelledChime();

    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(`Punched Order Cancelled: ${lastOrderCancelledAlert.tableName}`, {
          body: `${lastOrderCancelledAlert.ticketId} • Rs. ${Number(
            lastOrderCancelledAlert.totalAmount || 0
          ).toLocaleString()} • By ${lastOrderCancelledAlert.cancelledBy} • Reason: "${lastOrderCancelledAlert.reason}"`,
          icon: '/favicon.ico',
        });
      } catch {}
    }

    const toastTimer = setTimeout(() => {
      showToast({
        kind: 'order_cancelled',
        id: lastOrderCancelledAlert.id,
        ticketId: lastOrderCancelledAlert.ticketId,
        tableId: lastOrderCancelledAlert.tableId,
        tableName: lastOrderCancelledAlert.tableName,
        floor: lastOrderCancelledAlert.floor,
        cancelledBy: lastOrderCancelledAlert.cancelledBy,
        cancelledByRole: lastOrderCancelledAlert.cancelledByRole,
        reason: lastOrderCancelledAlert.reason,
        itemsSummary: lastOrderCancelledAlert.itemsSummary,
        totalQty: lastOrderCancelledAlert.totalQty,
        totalAmount: lastOrderCancelledAlert.totalAmount,
        time: lastOrderCancelledAlert.time,
      });
    }, 0);
    return () => clearTimeout(toastTimer);
  }, [isCashierOrManagement, lastOrderCancelledAlert, showToast]);

  const handleOpenInPos = () => {
    if (!activeToast) return;
    const roleLower = String(user?.role || '').toLowerCase();
    const posBase =
      roleLower === 'admin' ? '/admin/pos' : roleLower === 'manager' ? '/manager/pos' : '/pos';
    if (activeToast.kind === 'table_move' && activeToast.toTableId) {
      router.push(`${posBase}?tableId=${encodeURIComponent(activeToast.toTableId)}` as any);
    } else {
      router.push(posBase as any);
    }
    hideToast();
  };

  const handleOpenAuditReport = () => {
    const roleLower = String(user?.role || '').toLowerCase();
    const reportPath = roleLower === 'manager' ? '/manager/reports?tab=audit' : '/admin/reports?tab=audit';
    router.push(reportPath as any);
    hideToast();
  };

  if (!isCashierOrManagement || !activeToast) return null;

  const isMove = activeToast.kind === 'table_move';
  const accentColor = isMove ? '#D97706' : '#DC2626';
  const iconBg = isMove ? '#FEF3C7' : '#FEE2E2';
  const noteBg = isMove ? '#FFFBEB' : '#FEF2F2';
  const noteBorder = isMove ? '#FCD34D' : '#FCA5A5';
  const timeLabel = activeToast.time
    ? new Date(activeToast.time).toLocaleTimeString('en-PK', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ translateY: slideAnim }],
          width: isMobile ? '94%' : 560,
        },
      ]}
    >
      <View style={[styles.card, { borderColor: accentColor }]}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
          <Ionicons
            name={isMove ? 'swap-horizontal' : 'close-circle'}
            size={24}
            color={accentColor}
          />
        </View>

        <View style={styles.bodyCol}>
          <View style={styles.topRow}>
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text style={styles.badgeText}>
                {isMove ? 'TABLE MOVED' : 'ORDER CANCELLED'}
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {isMove
                ? `${activeToast.fromTableName} ➔ ${activeToast.toTableName}`
                : `${activeToast.tableName} (${activeToast.ticketId})`}
            </Text>
            <Text style={styles.timeText}>{timeLabel}</Text>
          </View>

          {isMove ? (
            <>
              <Text style={styles.metaText} numberOfLines={2}>
                Moved by <Text style={styles.metaBold}>{activeToast.movedBy}</Text>
                {activeToast.movedByRole ? ` (${activeToast.movedByRole})` : ''}
                {activeToast.fromFloor || activeToast.toFloor
                  ? ` • ${activeToast.fromFloor || ''} ➔ ${activeToast.toFloor || ''}`
                  : ''}
                {activeToast.billTotal > 0
                  ? ` • Bill: Rs. ${activeToast.billTotal.toLocaleString()}`
                  : ''}
                {activeToast.activeTicketsCount > 0 ? ` (${activeToast.activeTicketsCount} KOT)` : ''}
              </Text>
              <View style={[styles.noteBox, { backgroundColor: noteBg, borderColor: noteBorder }]}>
                <Ionicons name="document-text-outline" size={14} color="#92400E" />
                <Text style={[styles.noteText, { color: '#78350F' }]} numberOfLines={2}>
                  Note: &ldquo;{activeToast.note}&rdquo;
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.metaText} numberOfLines={2}>
                Cancelled by <Text style={styles.metaBold}>{activeToast.cancelledBy}</Text>
                {activeToast.cancelledByRole ? ` (${activeToast.cancelledByRole})` : ''} •{' '}
                <Text style={[styles.metaBold, { color: '#B91C1C' }]}>
                  {activeToast.totalQty} item{activeToast.totalQty === 1 ? '' : 's'} (Rs.{' '}
                  {activeToast.totalAmount.toLocaleString()})
                </Text>
              </Text>
              <Text style={styles.itemsPreview} numberOfLines={1}>
                Items: {activeToast.itemsSummary}
              </Text>
              <View style={[styles.noteBox, { backgroundColor: noteBg, borderColor: noteBorder }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#991B1B" />
                <Text style={[styles.noteText, { color: '#7F1D1D' }]} numberOfLines={2}>
                  Reason: &ldquo;{activeToast.reason}&rdquo;
                </Text>
              </View>
            </>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: accentColor }]}
              onPress={handleOpenInPos}
              activeOpacity={0.82}
            >
              <Ionicons name="desktop-outline" size={14} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>
                {isMove ? `Open ${activeToast.toTableName} in POS` : 'Open POS'}
              </Text>
            </TouchableOpacity>

            {isAdminOrManager && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleOpenAuditReport}
                activeOpacity={0.82}
              >
                <Ionicons name="bar-chart-outline" size={14} color="#52141C" />
                <Text style={styles.secondaryBtnText}>Daily Report</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.dismissBtn} onPress={hideToast} activeOpacity={0.8}>
              <Text style={styles.dismissBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.closeIconBtn}
          onPress={hideToast}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={19} color="#64748B" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    top: 16,
    alignSelf: 'center',
    zIndex: 100000,
    elevation: 14,
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        left: '50%',
        marginLeft: -280,
      },
      default: {
        position: 'absolute',
      },
    }),
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 12,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginLeft: 2,
    marginTop: 2,
  },
  bodyCol: {
    flex: 1,
    gap: 5,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  metaText: {
    fontSize: 12.2,
    color: '#475569',
    lineHeight: 17,
  },
  metaBold: {
    fontWeight: '800',
    color: '#0F172A',
  },
  itemsPreview: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 1,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6.5,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FAF5EC',
    borderWidth: 1,
    borderColor: '#E5D3B3',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  secondaryBtnText: {
    color: '#52141C',
    fontSize: 12,
    fontWeight: '800',
  },
  dismissBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dismissBtnText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  closeIconBtn: {
    padding: 4,
    marginLeft: 4,
  },
});
