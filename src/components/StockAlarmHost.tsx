import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useOpsStore } from '../store/opsStore';
import { useKitchenStore } from '../store/kitchenStore';
import { useAlertStore } from '../store/alertStore';
import { buildAlerts, type AlertSeverity, type StockAlert } from '../utils/kitchenForecast';

/**
 * Royal-Tech Global Alarm Host (Mounted once in Root Layout).
 * Watches kitchen handovers + store inventory, displays a luxury obsidian floating bell
 * with live alert count, plays throttled alerts, and opens an ultra-luxury Royal-Tech
 * alarm console with categorized filter tabs, snoozing, and unsnoozing.
 */

const ROYAL = {
  obsidian: '#140205',
  cardBg: 'rgba(28, 5, 10, 0.94)',
  cardBorder: 'rgba(213, 169, 67, 0.25)',
  gold: '#D5A943',
  goldLight: '#F3D179',
  burgundy: '#52171B',
  burgundyDeep: '#2A060C',
  crimson: '#EF4444',
  amber: '#F59E0B',
  purple: '#A855F7',
  emerald: '#10B981',
  textLight: '#FFFFFF',
  textMuted: 'rgba(243, 209, 121, 0.82)',
  textSubtle: 'rgba(255, 255, 255, 0.65)',
};

const SEV: Record<
  AlertSeverity,
  {
    color: string;
    bg: string;
    border: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    badgeBg: string;
  }
> = {
  critical: {
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.14)',
    border: '#EF4444',
    icon: 'alert-circle',
    label: 'URGENT',
    badgeBg: 'rgba(239, 68, 68, 0.25)',
  },
  warning: {
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.14)',
    border: '#F59E0B',
    icon: 'warning',
    label: 'LOW STOCK',
    badgeBg: 'rgba(245, 158, 11, 0.25)',
  },
  info: {
    color: '#D5A943',
    bg: 'rgba(213, 169, 67, 0.14)',
    border: '#D5A943',
    icon: 'information-circle',
    label: 'HEADS-UP',
    badgeBg: 'rgba(213, 169, 67, 0.25)',
  },
};

const REPEAT_CRITICAL_MS = 5 * 60 * 1000;
const SNOOZE_MIN = 30;

// Shared AudioContext instance for Web to avoid browser concurrency limits
let sharedAudioCtx: AudioContext | null = null;

function playAlarm(severity: AlertSeverity) {
  if (Platform.OS === 'web') {
    try {
      const g = globalThis as unknown as {
        AudioContext?: new () => AudioContext;
        webkitAudioContext?: new () => AudioContext;
      };
      const Ctx = g.AudioContext || g.webkitAudioContext;
      if (!Ctx) return;
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new Ctx();
      }
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      const ctx = sharedAudioCtx;
      const freqs = severity === 'critical' ? [880, 660, 880, 660] : [660, 520];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.value = 0.12;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.25;
        osc.start(t);
        osc.stop(t + 0.18);
      });
    } catch {
      // Audio autoplay policy handled safely
    }
  } else {
    Vibration.vibrate(
      severity === 'critical' ? [0, 500, 200, 500, 200, 500] : [0, 300, 150, 300]
    );
  }
}

function routeFor(alert: StockAlert, role: string | null | undefined): string {
  if (role === 'kitchen') return '/kitchen/day';
  const base = role === 'manager' ? '/manager' : '/admin';
  switch (alert.kind) {
    case 'shift_out':
    case 'shift_low':
    case 'shift_short':
      return `${base}/kitchen-handover`;
    case 'no_recipe':
      return `${base}/recipes`;
    default:
      return `${base}/inventory`;
  }
}

type TabType = 'all' | 'urgent' | 'expiry' | 'stock' | 'snoozed';

export default function StockAlarmHost() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const bottomOffset = (isMobile ? 76 : 24) + insets.bottom;
  const isPosScreen = Boolean(pathname && (pathname === '/admin/pos' || pathname.endsWith('/pos')));

  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const enabled = role === 'admin' || role === 'manager' || role === 'kitchen';

  const sessions = useKitchenStore((s) => s.kitchenSessions);
  const consumption = useKitchenStore((s) => s.kitchenConsumption);
  const manual = useKitchenStore((s) => s.kitchenManualUsage);
  const recipes = useKitchenStore((s) => s.recipes);
  const settings = useKitchenStore((s) => s.kitchenSettings);
  const updateSettings = useKitchenStore((s) => s.updateSettings);
  const inventory = useOpsStore((s) => s.inventory);

  const snoozedUntil = useAlertStore((s) => s.snoozedUntil);
  const snooze = useAlertStore((s) => s.snooze);
  const unsnooze = useAlertStore((s) => s.unsnooze);
  const unsnoozeAll = useAlertStore((s) => s.unsnoozeAll);
  const prune = useAlertStore((s) => s.prune);

  // Time-based cadence for expiry & runway checks (every 30 seconds)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // 1. Build alerts with stable derivation
  const allAlerts = useMemo(() => {
    try {
      return enabled
        ? buildAlerts({ sessions, consumption, manual, recipes, inventory, settings, now })
        : [];
    } catch {
      return [];
    }
  }, [enabled, sessions, consumption, manual, recipes, inventory, settings, now]);

  // 2. Partition into Active vs Snoozed
  const activeAlerts = useMemo(
    () => allAlerts.filter((a) => (snoozedUntil[a.id] || 0) <= now),
    [allAlerts, snoozedUntil, now]
  );

  const snoozedAlerts = useMemo(
    () => allAlerts.filter((a) => (snoozedUntil[a.id] || 0) > now),
    [allAlerts, snoozedUntil, now]
  );

  const criticalCount = activeAlerts.filter((a) => a.severity === 'critical').length;
  const expiryCount = activeAlerts.filter((a) => a.kind === 'expiry').length;
  const stockCount = activeAlerts.filter(
    (a) =>
      a.kind === 'store_low' ||
      a.kind === 'store_out' ||
      a.kind === 'shift_low' ||
      a.kind === 'shift_out' ||
      a.kind === 'store_cannot_cover'
  ).length;

  const topSeverity: AlertSeverity | null =
    criticalCount > 0
      ? 'critical'
      : activeAlerts.some((a) => a.severity === 'warning')
      ? 'warning'
      : activeAlerts.length > 0
      ? 'info'
      : null;

  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<StockAlert | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabType>('all');

  // Filtered items based on selected tab
  const displayedAlerts = useMemo(() => {
    if (selectedTab === 'snoozed') return snoozedAlerts;
    if (selectedTab === 'urgent') return activeAlerts.filter((a) => a.severity === 'critical');
    if (selectedTab === 'expiry') return activeAlerts.filter((a) => a.kind === 'expiry');
    if (selectedTab === 'stock')
      return activeAlerts.filter(
        (a) =>
          a.kind === 'store_low' ||
          a.kind === 'store_out' ||
          a.kind === 'shift_low' ||
          a.kind === 'shift_out' ||
          a.kind === 'store_cannot_cover'
      );
    return activeAlerts;
  }, [selectedTab, activeAlerts, snoozedAlerts]);

  // Announce new alerts + repeat unresolved critical ones safely
  const knownRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);
  const lastCriticalBeepRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const known = knownRef.current;
    const fresh = activeAlerts.filter((a) => a.severity !== 'info' && !known.has(a.id));
    const toAnnounce = initialisedRef.current
      ? fresh
      : fresh.filter((a) => a.severity === 'critical');
    initialisedRef.current = true;
    known.clear();
    activeAlerts.forEach((a) => known.add(a.id));

    const repeatDue = criticalCount > 0 && now - lastCriticalBeepRef.current >= REPEAT_CRITICAL_MS;
    if (toAnnounce.length > 0 || repeatDue) {
      const top =
        toAnnounce.find((a) => a.severity === 'critical') ||
        toAnnounce[0] ||
        activeAlerts.find((a) => a.severity === 'critical');
      if (settings.alarmSound) {
        playAlarm(top?.severity === 'critical' || repeatDue ? 'critical' : 'warning');
      }
      if (top) setToast(top);
      if (top?.severity === 'critical') lastCriticalBeepRef.current = now;
    }
  }, [activeAlerts, criticalCount, enabled, now, settings.alarmSound]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    prune();
  }, [now, prune]);

  // Floating Bell Pulse Animation
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (topSeverity !== 'critical') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [topSeverity, pulse]);

  // Don't render bell on POS or unauthorized roles, but if modal is open, keep rendering
  if (!enabled || isPosScreen) return null;
  if (activeAlerts.length === 0 && snoozedAlerts.length === 0 && !panelOpen) return null;

  const snoozeAll = () => {
    snooze(
      activeAlerts.map((a) => a.id),
      SNOOZE_MIN
    );
    setToast(null);
  };

  const openFix = (a: StockAlert) => {
    setPanelOpen(false);
    setToast(null);
    router.push(routeFor(a, role) as never);
  };

  const sevColor =
    criticalCount > 0 ? ROYAL.crimson : activeAlerts.length > 0 ? ROYAL.amber : ROYAL.gold;

  return (
    <>
      {/* Luxury Royal Toast Banner */}
      {toast && (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => {
            setToast(null);
            setPanelOpen(true);
          }}
          style={[
            styles.toast,
            {
              top: insets.top + 12,
              borderLeftColor: SEV[toast.severity].color,
            },
          ]}
        >
          <View style={[styles.toastIconPod, { backgroundColor: SEV[toast.severity].bg }]}>
            <Ionicons
              name={SEV[toast.severity].icon}
              size={20}
              color={SEV[toast.severity].color}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={[
                  styles.tagPill,
                  { backgroundColor: SEV[toast.severity].badgeBg },
                ]}
              >
                <Text style={[styles.tagPillText, { color: SEV[toast.severity].color }]}>
                  {SEV[toast.severity].label}
                </Text>
              </View>
              <Text style={styles.toastTitle} numberOfLines={1}>
                {toast.title}
              </Text>
            </View>
            <Text style={styles.toastDetail} numberOfLines={1}>
              {toast.detail}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={ROYAL.gold} />
        </TouchableOpacity>
      )}

      {/* Floating Action Bell (Luxury Royal-Tech FAB) */}
      <Animated.View
        style={[
          styles.fabWrap,
          {
            bottom: bottomOffset,
            transform: [{ scale: pulse }],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: sevColor }]}
          onPress={() => setPanelOpen(true)}
          activeOpacity={0.88}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={activeAlerts.length === 0 ? 'notifications-outline' : 'notifications'}
            size={25}
            color="#FFFFFF"
          />
          {activeAlerts.length > 0 && (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>
                {activeAlerts.length > 99 ? '99+' : activeAlerts.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Royal-Tech Stock & Kitchen Alarm Console Modal */}
      <Modal
        visible={panelOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setPanelOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setPanelOpen(false)}
          />

          <View style={[styles.panelContainer, isMobile && styles.panelContainerMobile]}>
            {/* Top Gold Laser Accent Line */}
            <View style={styles.topGoldLaserLine} />

            {/* Header */}
            <View style={styles.panelHeader}>
              <View style={styles.headerLeftPod}>
                <View style={styles.headerIconRing}>
                  <Ionicons name="notifications-outline" size={22} color={ROYAL.gold} />
                </View>
                <View>
                  <Text style={styles.panelTitle}>Stock & Kitchen Alarms</Text>
                  <Text style={styles.panelUrduSub}>اسٹاک اور کچن الرٹ مانیٹر</Text>
                </View>
              </View>

              <View style={styles.headerRightActions}>
                {criticalCount > 0 && (
                  <View style={styles.urgentPill}>
                    <View style={styles.urgentPillDot} />
                    <Text style={styles.urgentPillText}>{criticalCount} Urgent</Text>
                  </View>
                )}
                <View style={styles.activePill}>
                  <Text style={styles.activePillText}>{activeAlerts.length} Active</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPanelOpen(false)}
                  style={styles.closeBtnPod}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={20} color={ROYAL.gold} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Toolbar */}
            <View style={styles.panelToolbar}>
              <View style={styles.soundRow}>
                <View style={styles.soundIconPod}>
                  <Ionicons
                    name={settings.alarmSound ? 'volume-high' : 'volume-mute'}
                    size={17}
                    color={ROYAL.gold}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.soundText}>Alarm Sound / Vibration</Text>
                  <Text style={styles.soundSubtext}>
                    {settings.alarmSound ? 'Alert beeps enabled' : 'Audible beeps muted'}
                  </Text>
                </View>
                <Switch
                  value={settings.alarmSound}
                  onValueChange={(v) => updateSettings({ alarmSound: v })}
                  trackColor={{ true: ROYAL.gold, false: 'rgba(255,255,255,0.18)' }}
                  thumbColor={settings.alarmSound ? '#FFFFFF' : '#888888'}
                />
              </View>

              {activeAlerts.length > 0 && (
                <TouchableOpacity
                  style={styles.snoozeAllBtn}
                  onPress={snoozeAll}
                  activeOpacity={0.85}
                >
                  <Ionicons name="time-outline" size={16} color={ROYAL.gold} />
                  <Text style={styles.snoozeAllText}>Snooze All ({SNOOZE_MIN}m)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Smart Filter Tabs */}
            <View style={styles.filterTabsRow}>
              <TouchableOpacity
                style={[styles.tabBtn, selectedTab === 'all' && styles.tabBtnActive]}
                onPress={() => setSelectedTab('all')}
              >
                <Text
                  style={[styles.tabBtnText, selectedTab === 'all' && styles.tabBtnTextActive]}
                >
                  All ({activeAlerts.length})
                </Text>
              </TouchableOpacity>

              {criticalCount > 0 && (
                <TouchableOpacity
                  style={[styles.tabBtn, selectedTab === 'urgent' && styles.tabBtnActiveUrgent]}
                  onPress={() => setSelectedTab('urgent')}
                >
                  <View style={styles.tabDotUrgent} />
                  <Text
                    style={[
                      styles.tabBtnText,
                      selectedTab === 'urgent' && styles.tabBtnTextUrgent,
                    ]}
                  >
                    Urgent ({criticalCount})
                  </Text>
                </TouchableOpacity>
              )}

              {expiryCount > 0 && (
                <TouchableOpacity
                  style={[styles.tabBtn, selectedTab === 'expiry' && styles.tabBtnActive]}
                  onPress={() => setSelectedTab('expiry')}
                >
                  <Text
                    style={[styles.tabBtnText, selectedTab === 'expiry' && styles.tabBtnTextActive]}
                  >
                    Expiry ({expiryCount})
                  </Text>
                </TouchableOpacity>
              )}

              {stockCount > 0 && (
                <TouchableOpacity
                  style={[styles.tabBtn, selectedTab === 'stock' && styles.tabBtnActive]}
                  onPress={() => setSelectedTab('stock')}
                >
                  <Text
                    style={[styles.tabBtnText, selectedTab === 'stock' && styles.tabBtnTextActive]}
                  >
                    Stock ({stockCount})
                  </Text>
                </TouchableOpacity>
              )}

              {snoozedAlerts.length > 0 && (
                <TouchableOpacity
                  style={[styles.tabBtn, selectedTab === 'snoozed' && styles.tabBtnActive]}
                  onPress={() => setSelectedTab('snoozed')}
                >
                  <Ionicons
                    name="moon-outline"
                    size={12}
                    color={selectedTab === 'snoozed' ? ROYAL.gold : 'rgba(255,255,255,0.5)'}
                  />
                  <Text
                    style={[
                      styles.tabBtnText,
                      selectedTab === 'snoozed' && styles.tabBtnTextActive,
                    ]}
                  >
                    Snoozed ({snoozedAlerts.length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* List of Alerts */}
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {displayedAlerts.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconPod}>
                    <Ionicons name="checkmark-circle-outline" size={48} color={ROYAL.emerald} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {selectedTab === 'snoozed'
                      ? 'No Snoozed Alerts'
                      : 'All Kitchen & Store Stocks Healthy'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {selectedTab === 'snoozed'
                      ? 'No active alarms have been silenced.'
                      : 'تمام اسٹاک اور کچن شیڈولز محفوظ اور برقرار ہیں۔'}
                  </Text>

                  {snoozedAlerts.length > 0 && selectedTab !== 'snoozed' && (
                    <TouchableOpacity
                      style={styles.viewSnoozedBtn}
                      onPress={() => setSelectedTab('snoozed')}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="moon-outline" size={15} color={ROYAL.gold} />
                      <Text style={styles.viewSnoozedText}>
                        View {snoozedAlerts.length} Snoozed Alarm
                        {snoozedAlerts.length > 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                displayedAlerts.map((a) => {
                  const m = SEV[a.severity];
                  const isItemSnoozed = (snoozedUntil[a.id] || 0) > now;

                  return (
                    <View
                      key={a.id}
                      style={[
                        styles.card,
                        {
                          borderLeftColor: m.color,
                        },
                      ]}
                    >
                      <View style={[styles.cardIconPod, { backgroundColor: m.bg }]}>
                        <Ionicons name={m.icon} size={22} color={m.color} />
                      </View>

                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.cardHeaderRow}>
                          <View
                            style={[
                              styles.tagPill,
                              { backgroundColor: m.badgeBg, borderColor: m.color },
                            ]}
                          >
                            <Text style={[styles.tagPillText, { color: m.color }]}>
                              {m.label}
                            </Text>
                          </View>
                          <Text style={styles.cardTitle} numberOfLines={2}>
                            {a.title}
                          </Text>
                        </View>

                        <Text style={styles.cardDetail}>{a.detail}</Text>

                        {/* Action Buttons */}
                        <View style={styles.cardActionsRow}>
                          {isItemSnoozed ? (
                            <TouchableOpacity
                              style={styles.unsnoozeBtn}
                              onPress={() => unsnooze(a.id)}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="play-outline" size={14} color="#10B981" />
                              <Text style={styles.unsnoozeBtnText}>Unsnooze (Resume)</Text>
                            </TouchableOpacity>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.fixBtn}
                                onPress={() => openFix(a)}
                                activeOpacity={0.88}
                              >
                                <Text style={styles.fixBtnText}>Fix Now</Text>
                                <Ionicons name="arrow-forward" size={14} color="#140205" />
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.snoozeBtn}
                                onPress={() => snooze([a.id], SNOOZE_MIN)}
                                activeOpacity={0.85}
                              >
                                <Ionicons name="time-outline" size={14} color={ROYAL.gold} />
                                <Text style={styles.snoozeBtnText}>Snooze {SNOOZE_MIN}m</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}

              {/* Snoozed Clear All Option */}
              {selectedTab === 'snoozed' && snoozedAlerts.length > 0 && (
                <TouchableOpacity
                  style={styles.unsnoozeAllBtn}
                  onPress={unsnoozeAll}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh-outline" size={16} color="#10B981" />
                  <Text style={styles.unsnoozeAllText}>Resume All Snoozed Alarms</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  /* Toast Floating Banner */
  toast: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(20, 3, 7, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    borderLeftWidth: 5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: 580,
    alignSelf: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
      },
    }),
  },
  toastIconPod: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  toastDetail: {
    fontSize: 12,
    color: 'rgba(243, 209, 121, 0.85)',
    marginTop: 2,
  },

  /* Floating Action Button (Bell) */
  fabWrap: {
    position: 'absolute',
    right: 18,
    zIndex: 9998,
    elevation: 20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.45)',
    ...Platform.select({
      web: {
        boxShadow: '0 12px 28px rgba(0, 0, 0, 0.55), 0 0 15px rgba(239, 68, 68, 0.4)',
        cursor: 'pointer',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
    }),
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 23,
    height: 23,
    borderRadius: 11.5,
    backgroundColor: '#D5A943',
    borderWidth: 2,
    borderColor: '#140205',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  fabBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#140205',
  },

  /* Modal Overlay */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 1, 2, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      } as any,
    }),
  },

  /* Panel Container (Royal Obsidian Glass) */
  panelContainer: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    backgroundColor: 'rgba(20, 3, 7, 0.98)',
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow:
          '0 28px 70px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.15)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.6,
        shadowRadius: 28,
        elevation: 25,
      },
    }),
  },
  panelContainerMobile: {
    maxWidth: '100%',
    maxHeight: '94%',
    borderRadius: 20,
  },

  topGoldLaserLine: {
    height: 3,
    backgroundColor: '#D5A943',
    width: '100%',
  },

  /* Header */
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(42, 6, 12, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.22)',
  },
  headerLeftPod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  panelUrduSub: {
    color: 'rgba(243, 209, 121, 0.85)',
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urgentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  urgentPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  urgentPillText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
  },
  activePill: {
    backgroundColor: 'rgba(213, 169, 67, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  activePillText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '800',
  },
  closeBtnPod: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  /* Toolbar */
  panelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(15, 2, 5, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.16)',
    gap: 12,
    flexWrap: 'wrap',
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 220,
  },
  soundIconPod: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(213, 169, 67, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  soundSubtext: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: 1,
  },
  snoozeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  snoozeAllText: {
    color: '#D5A943',
    fontWeight: '800',
    fontSize: 11.5,
  },

  /* Filter Tabs */
  filterTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(25, 4, 9, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.14)',
    gap: 8,
    overflow: 'hidden',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(213, 169, 67, 0.16)',
    borderColor: 'rgba(213, 169, 67, 0.4)',
  },
  tabBtnActiveUrgent: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  tabBtnText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11.5,
    fontWeight: '800',
  },
  tabBtnTextActive: {
    color: '#D5A943',
  },
  tabBtnTextUrgent: {
    color: '#EF4444',
  },
  tabDotUrgent: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },

  /* Scroll Content */
  scrollContent: {
    padding: 16,
    gap: 12,
  },

  /* Card */
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(30, 4, 10, 0.88)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.22)',
    borderLeftWidth: 4.5,
    padding: 14,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 22px rgba(0, 0, 0, 0.45)',
      } as any,
    }),
  },
  cardIconPod: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tagPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
  },
  tagPillText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  cardDetail: {
    fontSize: 12,
    color: 'rgba(243, 209, 121, 0.82)',
    marginTop: 4,
    lineHeight: 18,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D5A943',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
  },
  fixBtnText: {
    color: '#140205',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  snoozeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(213, 169, 67, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
  },
  snoozeBtnText: {
    color: '#D5A943',
    fontWeight: '800',
    fontSize: 11.5,
  },
  unsnoozeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
  },
  unsnoozeBtnText: {
    color: '#10B981',
    fontWeight: '800',
    fontSize: 12,
  },

  /* Empty State */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyIconPod: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: 'rgba(243, 209, 121, 0.8)',
    textAlign: 'center',
    marginTop: 2,
  },
  viewSnoozedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 14,
  },
  viewSnoozedText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '800',
  },
  unsnoozeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  unsnoozeAllText: {
    color: '#10B981',
    fontWeight: '900',
    fontSize: 12.5,
  },
});
