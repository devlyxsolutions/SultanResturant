import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore, Ticket } from '../../store/restaurantStore';
import { useAuthStore } from '../../store/authStore';
import { useOpsStore } from '../../store/opsStore';
import { useSettingsStore } from '../../store/settingsStore';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import FullscreenButton from '../../components/FullscreenButton';
import OrderSlip, { printOrderSlip } from '../../components/OrderSlip';
import { broadcastImmediately, getActiveServerHttpUrl } from '../../services/syncService';

// Dual-Tone Audio Chime using Web Audio API
function playKitchenChime(isAddOn: boolean = false) {
  if (useSettingsStore.getState().settings.kdsSoundAlerts === false) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (isAddOn) {
          // Energetic 3-tone rapid ascending alert for Add-on order
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880, now + 0.12); // A5
          osc.frequency.setValueAtTime(1174.66, now + 0.24); // D6
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
          osc.start(now);
          osc.stop(now + 0.65);
        } else {
          // Warm 2-tone restaurant chime for new regular order
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
          osc.start(now);
          osc.stop(now + 0.55);
        }
      }
    } catch (e) {
      // AudioContext could require initial user gesture
    }
  }
}

export default function KitchenDisplayScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const tickets = useRestaurantStore((state) => state.tickets);
  const systemSettings = useSettingsStore((s) => s.settings);
  const toggleItem = useRestaurantStore((state) => state.toggleTicketItem);
  const bumpTicket = useRestaurantStore((state) => state.bumpTicket);
  const updateTicketStatus = useRestaurantStore((state) => state.updateTicketStatus);
  const startCookingTicket = useRestaurantStore((state) => state.startCookingTicket);
  const markItemReady = useRestaurantStore((state) => state.markItemReady);
  const markItemServed = useRestaurantStore((state) => state.markItemServed);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'cooking' | 'ready' | 'addons' | 'served'>('all');
  const stationFilter: 'juice' = 'juice';
  const [now, setNow] = useState(() => Date.now());
  const [latestAlert, setLatestAlert] = useState<{
    id: string;
    tableName: string;
    isAddOn: boolean;
    roundNumber?: number;
    itemCount: number;
    server: string;
  } | null>(null);

  const [printingTicket, setPrintingTicket] = useState<Ticket | null>(null);

  // Juice Bar Handover & Inventory Modal state
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('All');
  const inventory = useOpsStore((s) => s.inventory);

  const juiceCategories = ['All', 'Juice & Fruits', 'Dairy', 'Beverages', 'Packaging', 'Supplies'];

  const filteredJuiceInventory = useMemo(() => {
    return (inventory || []).filter((item) => {
      if (!item) return false;
      const isJuiceItem =
        item.category === 'Juice & Fruits' ||
        item.category === 'Beverages' ||
        (item.category === 'Dairy' && ((item.name || '').toLowerCase().includes('milk') || (item.name || '').toLowerCase().includes('cream'))) ||
        (item.category === 'Packaging' && ((item.name || '').toLowerCase().includes('glass') || (item.name || '').toLowerCase().includes('straw') || (item.name || '').toLowerCase().includes('cup'))) ||
        (item.category === 'Supplies' && (item.name || '').toLowerCase().includes('ice'));

      if (!isJuiceItem) return false;

      if (inventoryCategory !== 'All' && item.category !== inventoryCategory) {
        return false;
      }
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        const matchesName = (item.name || '').toLowerCase().includes(q);
        const matchesUrdu = (item.urduName || '').toLowerCase().includes(q);
        const matchesCode = (item.itemCode || '').toLowerCase().includes(q);
        const matchesLoc = (item.location || '').toLowerCase().includes(q);
        return matchesName || matchesUrdu || matchesCode || matchesLoc;
      }
      return true;
    });
  }, [inventory, inventoryCategory, inventorySearch]);

  const lowStockCount = useMemo(() => {
    return (inventory || []).filter((item) => {
      if (!item) return false;
      const isJuiceItem =
        item.category === 'Juice & Fruits' ||
        item.category === 'Beverages' ||
        (item.category === 'Dairy' && ((item.name || '').toLowerCase().includes('milk') || (item.name || '').toLowerCase().includes('cream'))) ||
        (item.category === 'Packaging' && ((item.name || '').toLowerCase().includes('glass') || (item.name || '').toLowerCase().includes('straw')));
      if (!isJuiceItem) return false;
      return item.stock <= item.threshold;
    }).length;
  }, [inventory]);

  const handleLogout = () => {
    const doLogout = () => {
      useAuthStore.getState().logout();
      router.replace('/login');
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to log out of Juice Bar KDS?')) {
        doLogout();
      }
    } else {
      Alert.alert('Logout Juice Bar KDS', 'Are you sure you want to log out of the Juice Bar Display?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: doLogout },
      ]);
    }
  };

  // Track seen tickets to trigger notification on newly incoming tickets
  const seenTicketIdsRef = useRef<Set<string>>(new Set((tickets || []).filter((t) => !!t && !!t.id).map((t) => t.id)));
  const isInitialMount = useRef(true);

  // Live ticking clock (1s) so KOT countdown timer and elapsed-time colors refresh in real-time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Watch for new tickets arriving (from waiter device / server sync)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const newlyAdded = (tickets || []).filter((t) => {
      if (!t || !t.id) return false;
      if (seenTicketIdsRef.current.has(t.id)) return false;
      const items = Array.isArray(t.items) ? t.items : [];
      const matchingItems = items.filter((i) => (i?.station || 'main') === stationFilter);
      const stationStatus = (t.stationStatuses && t.stationStatuses[stationFilter]) ? t.stationStatuses[stationFilter]! : t.status;
      return matchingItems.length > 0 && (stationStatus === 'pending' || stationStatus === 'cooking');
    });

    (tickets || []).forEach((t) => {
      if (t?.id) seenTicketIdsRef.current.add(t.id);
    });

    if (newlyAdded.length > 0) {
      const newest = newlyAdded[newlyAdded.length - 1];
      const isAddOn = !!newest.isAddOn;

      playKitchenChime(isAddOn);

      const items = Array.isArray(newest.items) ? newest.items : [];
      const stationItemCount = items
        .filter((i) => (i?.station || 'main') === stationFilter)
        .reduce((sum, it) => sum + (it?.qty || 0), 0);

      setLatestAlert({
        id: newest.id,
        tableName: newest.tableName,
        isAddOn,
        roundNumber: newest.roundNumber,
        itemCount: stationItemCount,
        server: newest.server,
      });

      const timer = setTimeout(() => {
        setLatestAlert(null);
      }, 8000);

      return () => clearTimeout(timer);
    }
  }, [tickets]);

  // Deduplicate tickets by orderId / orderNumber so the beverage station never sees duplicate cards
  const uniqueTickets = useMemo(() => {
    const seenOrderKeys = new Map<string, Ticket>();
    const withoutOrder: Ticket[] = [];

    for (const t of tickets || []) {
      if (!t || !t.id) continue;
      const orderKey = t.orderId
        ? `oid_${t.orderId}`
        : (t.orderNumber ? `onum_${t.orderNumber}` : null);

      if (!orderKey) {
        withoutOrder.push(t);
        continue;
      }

      const existing = seenOrderKeys.get(orderKey);
      if (!existing) {
        seenOrderKeys.set(orderKey, t);
      } else {
        const STATUS_RANK: Record<string, number> = { pending: 0, cooking: 1, ready: 2, served: 3 };
        const extRank = STATUS_RANK[existing.status] ?? 0;
        const curRank = STATUS_RANK[t.status] ?? 0;
        if (curRank > extRank) {
          seenOrderKeys.set(orderKey, t);
        } else if (curRank === extRank) {
          const existingCount = Array.isArray(existing.items) ? existing.items.length : 0;
          const currentCount = Array.isArray(t.items) ? t.items.length : 0;
          if (currentCount > existingCount || (t.timePlaced || 0) > (existing.timePlaced || 0)) {
            seenOrderKeys.set(orderKey, t);
          }
        }
      }
    }
    return [...seenOrderKeys.values(), ...withoutOrder];
  }, [tickets]);

  const stationTickets = uniqueTickets
    .filter((t) => !!t && Array.isArray(t.items))
    .map((t) => {
      const items = Array.isArray(t.items) ? t.items : [];
      const matchingItems = items.filter((i) => (i?.station || 'main') === stationFilter);
      const stationStatus = (t.stationStatuses && t.stationStatuses[stationFilter])
        ? t.stationStatuses[stationFilter]!
        : t.status;

      return { ...t, items: matchingItems, stationStatus };
    })
    .filter((t) => Array.isArray(t.items) && t.items.length > 0);

  const activeTickets = stationTickets.filter((t) => t.stationStatus === 'pending' || t.stationStatus === 'cooking' || t.stationStatus === 'ready');
  const pendingCount = stationTickets.filter((t) => t.stationStatus === 'pending').length;
  const cookingCount = stationTickets.filter((t) => t.stationStatus === 'cooking').length;
  const readyCount = stationTickets.filter((t) => t.stationStatus === 'ready').length;
  const servedCount = stationTickets.filter((t) => t.stationStatus === 'served').length;
  const addOnsCount = stationTickets.filter((t) => t.isAddOn && (t.stationStatus === 'pending' || t.stationStatus === 'cooking')).length;

  const filteredTickets = stationTickets.filter((t) => {
    if (activeFilter === 'pending') return t.stationStatus === 'pending';
    if (activeFilter === 'cooking') return t.stationStatus === 'cooking';
    if (activeFilter === 'ready') return t.stationStatus === 'ready';
    if (activeFilter === 'served') return t.stationStatus === 'served';
    if (activeFilter === 'addons') return t.isAddOn && (t.stationStatus === 'pending' || t.stationStatus === 'cooking');
    return t.stationStatus === 'pending' || t.stationStatus === 'cooking' || t.stationStatus === 'ready';
  });

  // Sort newest first so new orders appear at Column 1 and push earlier orders forward!
  const sortedTickets = [...filteredTickets].sort((a, b) => (b.timePlaced || 0) - (a.timePlaced || 0));

  const handleTicketAction = (ticket: typeof stationTickets[0]) => {
    const baseHttpUrl = getActiveServerHttpUrl();
    const orderId = (ticket as any).orderId || ticket.orderNumber;

    if (ticket.stationStatus === 'pending') {
      startCookingTicket(ticket.id, stationFilter);
      if (orderId) {
        fetch(`${baseHttpUrl}/api/public/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'PREPARING' })
        }).catch(() => { });
      }
    } else if (ticket.stationStatus === 'cooking') {
      updateTicketStatus(ticket.id, 'ready', stationFilter);
      if (orderId) {
        fetch(`${baseHttpUrl}/api/public/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'READY' })
        }).catch(() => { });
      }
    } else if (ticket.stationStatus === 'ready') {
      bumpTicket(ticket.id, stationFilter);
      if (orderId) {
        fetch(`${baseHttpUrl}/api/public/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SERVED' })
        }).catch(() => { });
      }
    } else {
      updateTicketStatus(ticket.id, 'ready', stationFilter);
    }
    broadcastImmediately();
  };

  const renderTicket = (item: typeof stationTickets[0]) => {
    const items = Array.isArray(item.items) ? item.items : [];
    const defaultPrepTime = 5;
    const maxPrepTimeMin = items.length > 0
      ? Math.max(...items.map((i) => i.prepTimeMin || defaultPrepTime))
      : defaultPrepTime;

    const isPending = item.stationStatus === 'pending';
    const isCooking = item.stationStatus === 'cooking';
    const isReady = item.stationStatus === 'ready';
    const isServed = item.stationStatus === 'served';
    const isAddOn = !!item.isAddOn;

    // Countdown calculations
    const startTime = item.cookingStartedAt || item.timePlaced || now;
    const elapsedSeconds = isCooking ? Math.max(0, Math.floor((now - startTime) / 1000)) : 0;
    const totalAllowedSeconds = maxPrepTimeMin * 60;
    const remainingSeconds = totalAllowedSeconds - elapsedSeconds;
    const isOverdue = isCooking && remainingSeconds <= 0;
    const overdueSeconds = Math.abs(remainingSeconds);
    const progressPct = Math.min(100, Math.max(0, (elapsedSeconds / totalAllowedSeconds) * 100));

    let headerColor = '#10B981'; // Green on track
    if (isServed) {
      headerColor = '#48484A'; // Neutral slate
    } else if (isReady) {
      headerColor = '#007AFF'; // Blue for ready to pick up
    } else if (isPending) {
      headerColor = '#D97706'; // Amber for awaiting start
    } else if (isOverdue) {
      headerColor = '#DC2626'; // Crimson red (> max prep time)
    } else if (remainingSeconds <= 90) {
      headerColor = '#EA580C'; // Orange for urgency (< 1.5 mins)
    } else if (isAddOn) {
      headerColor = '#D5A943'; // Gold for Add-on
    }

    const allItemsCompleted = items.length > 0 && items.every((i) => i.completed || i.itemStatus === 'ready' || i.itemStatus === 'served');

    return (
      <View
        style={[
          styles.ticketCard,
          isPending && { borderColor: '#D97706', borderWidth: 1.5 },
          isReady && styles.ticketCardReady,
          isAddOn && !isReady && !isServed && !isPending && styles.ticketCardAddOn,
          isServed && { opacity: 0.85, borderColor: '#48484A' },
        ]}
      >
        {/* Ticket Header */}
        <View style={[styles.ticketHeader, { backgroundColor: headerColor }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.ticketId}>{item.id}</Text>
              {isPending && (
                <View style={[styles.addOnTag, { backgroundColor: '#78350F' }]}>
                  <Ionicons name="time" size={11} color="#FDE68A" />
                  <Text style={[styles.addOnTagText, { color: '#FDE68A' }]}>QUEUED</Text>
                </View>
              )}
              {isAddOn && (
                <View style={styles.addOnTag}>
                  <Ionicons name="flash" size={11} color="#000" />
                  <Text style={styles.addOnTagText}>ROUND #{item.roundNumber || 2}</Text>
                </View>
              )}
              {isReady && (
                <View style={styles.readyTag}>
                  <Text style={styles.readyTagText}>READY</Text>
                </View>
              )}
              {isServed && (
                <View style={[styles.readyTag, { backgroundColor: '#3A3A3C' }]}>
                  <Text style={[styles.readyTagText, { color: '#bbb' }]}>SERVED</Text>
                </View>
              )}
            </View>
            <Text style={styles.ticketTable} numberOfLines={1}>
              {item.tableName} • {item.server}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[
              styles.timeBadge, 
              isPending && { backgroundColor: '#78350F' },
              isOverdue && { backgroundColor: '#7F1D1D' },
              isReady && { backgroundColor: '#1E3A8A' }
            ]}>
              <Ionicons 
                name={isPending ? 'hourglass-outline' : isOverdue ? 'alert-circle' : isReady ? 'checkmark-circle' : 'timer-outline'} 
                size={13} 
                color={isOverdue ? '#FCA5A5' : isPending ? '#FDE68A' : '#fff'} 
              />
              <Text style={[styles.timeText, isOverdue && { color: '#FCA5A5' }, isPending && { color: '#FDE68A' }]}>
                {isPending 
                  ? `${maxPrepTimeMin}m (Est)` 
                  : isReady
                    ? 'READY'
                    : isServed
                      ? 'SERVED'
                      : isOverdue 
                        ? `+${Math.floor(overdueSeconds / 60)}m ${overdueSeconds % 60}s` 
                        : `${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')}`}
              </Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => setPrintingTicket(item)}
            >
              <Ionicons name="print-outline" size={12} color="#fff" />
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: 'bold' }}>PRINT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Timer Progress Bar (When Preparing) */}
        {isCooking && (
          <View style={{ height: 4, backgroundColor: 'rgba(0,0,0,0.3)', width: '100%' }}>
            <View 
              style={{ 
                height: 4, 
                backgroundColor: isOverdue ? '#EF4444' : remainingSeconds <= 90 ? '#F97316' : '#34D399', 
                width: `${progressPct}%` 
              }} 
            />
          </View>
        )}

        {/* Add-On Notice Ribbon if this is extra items for table */}
        {isAddOn && !isServed && (
          <View style={styles.addOnRibbon}>
            <Ionicons name="add-circle" size={13} color="#D5A943" style={{ marginRight: 4 }} />
            <Text style={styles.addOnRibbonText}>
              ADD-ON ITEMS • EXPEDITE FOR RUNNING TABLE
            </Text>
          </View>
        )}

        {/* Ticket Items */}
        <ScrollView style={styles.ticketBody} showsVerticalScrollIndicator={false}>
          {items.map((food) => {
            const isItemDone = food.completed || food.itemStatus === 'served' || isServed;
            const isItemReady = food.itemStatus === 'ready';

            return (
              <View
                key={food.id}
                style={[styles.foodRow, isItemDone && styles.foodRowCompleted]}
              >
                <TouchableOpacity
                  style={[
                    styles.qtyBox,
                    isItemDone && { backgroundColor: '#1E3A24' },
                    isItemReady && { backgroundColor: '#1E3A5F' }
                  ]}
                  onPress={() => {
                    if (!isServed) {
                      toggleItem(item.id, food.id);
                      broadcastImmediately();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {isItemDone ? (
                    <Ionicons name="checkmark" size={18} color="#34C759" />
                  ) : isItemReady ? (
                    <Ionicons name="flash" size={16} color="#60A5FA" />
                  ) : (
                    <Text style={styles.qtyText}>{food.qty}</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.foodDetails}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <Text
                      style={[
                        styles.foodName,
                        isItemDone && styles.textCompleted,
                      ]}
                    >
                      {food.name}
                    </Text>
                    <View style={styles.itemPrepPill}>
                      <Ionicons name="stopwatch-outline" size={10} color="#D5A943" />
                      <Text style={styles.itemPrepText}>{food.prepTimeMin || defaultPrepTime}m</Text>
                    </View>
                  </View>

                  {food.notes ? (
                    <View style={styles.notesContainer}>
                      <Ionicons name="pencil" size={12} color="#D5A943" />
                      <Text style={styles.foodNotes}>{food.notes}</Text>
                    </View>
                  ) : null}

                  {/* Fast Serve / Ready Actions for this item */}
                  {!isServed && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {isItemReady ? (
                        <>
                          <View style={styles.itemReadyBadge}>
                            <Ionicons name="flash" size={11} color="#60A5FA" />
                            <Text style={styles.itemReadyBadgeText}>READY (AWAITING SERVER)</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.itemMarkServedBtn}
                            onPress={() => {
                              markItemServed(item.id, food.id, stationFilter);
                              broadcastImmediately();
                            }}
                          >
                            <Ionicons name="checkmark-done" size={11} color="#fff" />
                            <Text style={styles.itemMarkServedBtnText}>SERVE</Text>
                          </TouchableOpacity>
                        </>
                      ) : food.itemStatus === 'served' ? (
                        <View style={styles.itemServedBadge}>
                          <Ionicons name="checkmark-done-circle" size={12} color="#34C759" />
                          <Text style={styles.itemServedBadgeText}>SERVED</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.itemFastReadyBtn}
                          onPress={() => {
                            markItemReady(item.id, food.id, stationFilter);
                            broadcastImmediately();
                          }}
                        >
                          <Ionicons name="flash" size={11} color="#000" />
                          <Text style={styles.itemFastReadyBtnText}>SERVE FIRST / READY</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Ticket Footer / Action */}
        {isPending ? (
          <TouchableOpacity
            style={[styles.bumpButton, { backgroundColor: '#F59E0B' }]}
            onPress={() => handleTicketAction(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="wine" size={20} color="#000" />
            <Text style={[styles.bumpButtonText, { color: '#000', fontWeight: '900' }]}>
              🍹 START PREPARING (NOTIFY WAITER)
            </Text>
          </TouchableOpacity>
        ) : isCooking ? (
          <TouchableOpacity
            style={[
              styles.bumpButton,
              allItemsCompleted ? styles.bumpButtonReady : null,
            ]}
            onPress={() => handleTicketAction(item)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={allItemsCompleted ? 'notifications' : 'chevron-forward-circle'}
              size={18}
              color={allItemsCompleted ? '#000' : '#888'}
            />
            <Text
              style={[
                styles.bumpButtonText,
                allItemsCompleted ? styles.bumpTextReady : null,
              ]}
            >
              {allItemsCompleted ? 'NOTIFY SERVER (READY)' : 'MARK ALL READY'}
            </Text>
          </TouchableOpacity>
        ) : isReady ? (
          <TouchableOpacity
            style={[styles.bumpButton, styles.bumpButtonDispatched]}
            onPress={() => handleTicketAction(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
            <Text style={[styles.bumpButtonText, styles.bumpTextWhite]}>
              MARK ALL DISPATCHED
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.bumpButton, { backgroundColor: '#2C2C2E', borderColor: '#48484A' }]}
            onPress={() => handleTicketAction(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-undo" size={18} color="#bbb" />
            <Text style={[styles.bumpButtonText, { color: '#bbb' }]}>
              DISPATCHED (TAP TO RECALL)
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (systemSettings.enableKdsModule === false) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Ionicons name="lock-closed-outline" size={56} color="#FF9500" style={{ marginBottom: 14 }} />
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', marginBottom: 6 }}>
          Juice Bar KDS Module Disabled
        </Text>
        <Text style={{ fontSize: 13.5, color: '#9CA3AF', textAlign: 'center', maxWidth: 420, marginBottom: 20 }}>
          The Kitchen & Juice Bar KDS module has been disabled in System Settings by Admin.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#FF9500', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Text style={{ fontWeight: '800', color: '#140306' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top KDS Navbar */}
      <View style={[styles.navbar, isMobile && { flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 12, paddingVertical: 10, gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <View style={styles.navLeft}>
            <View style={styles.stationBadge}>
              <Ionicons name="wine" size={20} color="#FF9500" />
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.navTitle, isMobile && { fontSize: 16 }]}>SULTAN JUICE BAR</Text>
                <View style={styles.liveIndicator}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.liveIndicatorText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.navSubtitle}>Juice Station • Shakes & Beverages</Text>
            </View>
          </View>

          {isMobile && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={styles.inventoryNavBtn}
                onPress={() => setShowInventoryModal(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="nutrition" size={15} color="#FF9500" />
                {lowStockCount > 0 && (
                  <View style={styles.inventoryBadge}>
                    <Text style={styles.inventoryBadgeText}>{lowStockCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutNavBtn}
                onPress={handleLogout}
                activeOpacity={0.75}
              >
                <Ionicons name="log-out-outline" size={15} color="#FF453A" />
              </TouchableOpacity>
              <FullscreenButton variant="compact" />
              <SyncStatusBadge compact />
            </View>
          )}
        </View>

        {/* Status Filter Badges - Horizontal Scrollable on Mobile */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2, alignItems: 'center' }}
        >
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
              Active ({activeTickets.length})
            </Text>
          </TouchableOpacity>

          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'pending' && { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }]}
              onPress={() => setActiveFilter('pending')}
            >
              <View style={[styles.dot, { backgroundColor: '#F59E0B' }]} />
              <Text style={[styles.filterPillText, activeFilter === 'pending' && { color: '#000', fontWeight: '800' }]}>
                Pending ({pendingCount})
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'cooking' && styles.filterPillActiveCooking]}
            onPress={() => setActiveFilter('cooking')}
          >
            <View style={[styles.dot, { backgroundColor: '#FF9500' }]} />
            <Text style={[styles.filterPillText, activeFilter === 'cooking' && styles.filterPillTextActive]}>
              Preparing ({cookingCount})
            </Text>
          </TouchableOpacity>

          {addOnsCount > 0 && (
            <TouchableOpacity
              style={[styles.filterPill, activeFilter === 'addons' && styles.filterPillActiveAddons]}
              onPress={() => setActiveFilter('addons')}
            >
              <Ionicons name="flash" size={12} color={activeFilter === 'addons' ? '#000' : '#D5A943'} />
              <Text style={[styles.filterPillText, activeFilter === 'addons' && styles.filterPillActiveAddons]}>
                Add-ons ({addOnsCount})
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'ready' && styles.filterPillActiveReady]}
            onPress={() => setActiveFilter('ready')}
          >
            <View style={[styles.dot, { backgroundColor: '#007AFF' }]} />
            <Text style={[styles.filterPillText, activeFilter === 'ready' && styles.filterPillTextActive]}>
              Ready ({readyCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'served' && { backgroundColor: '#48484A', borderColor: '#636366' }]}
            onPress={() => setActiveFilter('served')}
          >
            <Ionicons name="checkmark-done" size={12} color={activeFilter === 'served' ? '#fff' : '#8E8E93'} />
            <Text style={[styles.filterPillText, activeFilter === 'served' && { color: '#fff' }]}>
              Served ({servedCount})
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Right Action Buttons: Desktop Only */}
        {!isMobile && (
          <View style={styles.navRightActions}>
            <TouchableOpacity
              style={styles.inventoryNavBtn}
              onPress={() => setShowInventoryModal(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="nutrition" size={16} color="#FF9500" />
              <Text style={styles.inventoryNavBtnText}>Juice Handover & Stock</Text>
              {lowStockCount > 0 && (
                <View style={styles.inventoryBadge}>
                  <Text style={styles.inventoryBadgeText}>{lowStockCount} Low</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutNavBtn}
              onPress={handleLogout}
              activeOpacity={0.75}
            >
              <Ionicons name="log-out-outline" size={16} color="#FF453A" />
              <Text style={styles.logoutNavBtnText}>Logout</Text>
            </TouchableOpacity>

            <FullscreenButton variant="pill" />
            <SyncStatusBadge />
          </View>
        )}
      </View>

      {/* Real-time Incoming Order Alert Banner */}
      {latestAlert && (
        <View style={[styles.alertBanner, latestAlert.isAddOn ? styles.alertBannerAddOn : styles.alertBannerNew]}>
          <View style={styles.alertIconBox}>
            <Ionicons
              name={latestAlert.isAddOn ? 'flash' : 'notifications'}
              size={22}
              color="#fff"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.alertHeading}>
                {latestAlert.isAddOn ? '⚡ ADD-ON ORDER RECEIVED!' : '🔔 NEW KOT TICKET!'}
              </Text>
              {latestAlert.isAddOn && (
                <View style={styles.alertRoundPill}>
                  <Text style={styles.alertRoundText}>ROUND #{latestAlert.roundNumber || 2}</Text>
                </View>
              )}
            </View>
            <Text style={styles.alertDetail}>
              {latestAlert.tableName} • {latestAlert.itemCount} items ordered by {latestAlert.server} ({latestAlert.id})
            </Text>
          </View>
          <TouchableOpacity
            style={styles.alertDismissBtn}
            onPress={() => setLatestAlert(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Main Ticket Area - Multi-Column Responsive Grid */}
      <View style={styles.body}>
        {sortedTickets.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="wine-outline" size={48} color="#444" />
            </View>
            <Text style={styles.emptyText}>Juice Bar is Clear!</Text>
            <Text style={styles.emptySubText}>
              {activeFilter === 'ready'
                ? 'No beverage tickets currently waiting for pickup.'
                : activeFilter === 'cooking'
                ? 'No drinks currently in the preparation queue.'
                : activeFilter === 'addons'
                ? 'No add-on drink orders currently pending.'
                : 'All beverage tickets have been prepared and served.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.columnsContainer, isMobile && { padding: 10, gap: 12 }]}
            showsVerticalScrollIndicator={true}
          >
            {sortedTickets.map((ticket) => (
              <View key={ticket.id} style={[styles.ticketColumnWrap, isMobile && { width: '100%', maxWidth: '100%', minHeight: 320 }]}>
                {renderTicket(ticket)}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Print Preview Modal */}
      <Modal visible={!!printingTicket} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.printPreviewContent}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPrintingTicket(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            
            {printingTicket && <OrderSlip ticket={printingTicket} />}
            
            <TouchableOpacity style={styles.printBtnAction} onPress={() => {
                if (printingTicket) {
                  printOrderSlip(printingTicket);
                } else if (typeof window !== 'undefined') {
                  window.print();
                }
            }}>
              <Text style={styles.printBtnText}>Print Slip</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Juice Corner Inventory & Handover Quick Modal */}
      <Modal
        visible={showInventoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInventoryModal(false)}
      >
        <View style={styles.inventoryModalOverlay}>
          <View style={styles.inventoryModalContainer}>
            {/* Modal Header */}
            <View style={styles.inventoryModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.inventoryIconBadge}>
                  <Ionicons name="nutrition" size={22} color="#FF9500" />
                </View>
                <View>
                  <Text style={styles.inventoryModalTitle}>Juice Corner Stock & Handover</Text>
                  <Text style={styles.inventoryModalSubtitle}>
                    Fresh fruits, dairy, syrups, disposable glasses & straws
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* Full Handover Module Shortcut Button */}
                <TouchableOpacity
                  style={styles.handoverNavBtn}
                  onPress={() => {
                    setShowInventoryModal(false);
                    router.push('/juicebar/handover');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="clipboard-outline" size={16} color="#FF9500" />
                  <Text style={styles.handoverNavBtnText}>Open Handover & Wastage</Text>
                </TouchableOpacity>

                {/* Close Button */}
                <TouchableOpacity
                  style={styles.invModalCloseBtn}
                  onPress={() => setShowInventoryModal(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Stats Strip */}
            <View style={styles.invStatsStrip}>
              <View style={styles.invStatBox}>
                <Text style={styles.invStatLabel}>Juice Corner Items</Text>
                <Text style={styles.invStatValue}>{filteredJuiceInventory.length}</Text>
              </View>
              <View style={[styles.invStatBox, lowStockCount > 0 && { borderColor: '#E65100' }]}>
                <Text style={styles.invStatLabel}>Low / Reorder Alert</Text>
                <Text style={[styles.invStatValue, lowStockCount > 0 && { color: '#FF9500' }]}>
                  {lowStockCount} items
                </Text>
              </View>
              <View style={styles.invStatBox}>
                <Text style={styles.invStatLabel}>Active Category</Text>
                <Text style={[styles.invStatValue, { color: '#FF9500' }]}>{inventoryCategory}</Text>
              </View>
            </View>

            {/* Search and Category Filters */}
            <View style={styles.invFilterSection}>
              <View style={styles.invSearchBar}>
                <Ionicons name="search" size={16} color="#8E8E93" />
                <TextInput
                  style={styles.invSearchInput}
                  placeholder="Search fruits, milk, syrups, glasses..."
                  placeholderTextColor="#666"
                  value={inventorySearch}
                  onChangeText={setInventorySearch}
                />
                {inventorySearch.length > 0 && (
                  <TouchableOpacity onPress={() => setInventorySearch('')}>
                    <Ionicons name="close-circle" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.invCategoryScroll}
              >
                {juiceCategories.map((cat) => {
                  const isSel = inventoryCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.invCatPill, isSel && styles.invCatPillActiveJuice]}
                      onPress={() => setInventoryCategory(cat)}
                    >
                      <Text style={[styles.invCatPillText, isSel && styles.invCatPillTextActiveJuice]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Items List */}
            <FlatList
              data={filteredJuiceInventory}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.invListContainer}
              ListEmptyComponent={
                <View style={styles.invEmptyContainer}>
                  <Ionicons name="nutrition-outline" size={40} color="#48484A" />
                  <Text style={styles.invEmptyTitle}>No juice corner items matched</Text>
                  <Text style={styles.invEmptySub}>Try a different search or clear category filters.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isOut = item.stock <= 0;
                const isCritical = !isOut && item.stock <= item.threshold * 0.5;
                const isLow = !isOut && !isCritical && item.stock <= item.threshold;
                const isOk = !isOut && !isCritical && !isLow;

                return (
                  <View style={[styles.invRowCard, isOut && styles.invRowOut, (isLow || isCritical) && styles.invRowLow]}>
                    <View style={styles.invRowLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.invItemName}>{item.name}</Text>
                        {item.urduName ? <Text style={styles.invItemUrdu}>{item.urduName}</Text> : null}
                      </View>
                      <View style={styles.invRowMeta}>
                        <View style={styles.invCategoryTag}>
                          <Text style={styles.invCategoryTagText}>{item.category}</Text>
                        </View>
                        {item.location ? (
                          <Text style={styles.invLocationText}>📍 {item.location}</Text>
                        ) : null}
                        <Text style={styles.invThresholdText}>Min threshold: {item.threshold} {item.unit}</Text>
                      </View>
                    </View>

                    <View style={styles.invRowRight}>
                      <View
                        style={[
                          styles.invBadge,
                          isOut && styles.invBadgeOut,
                          isCritical && styles.invBadgeCritical,
                          isLow && styles.invBadgeLow,
                          isOk && styles.invBadgeOk,
                        ]}
                      >
                        <Ionicons
                          name={isOut ? 'close-circle' : (isLow || isCritical ? 'alert-circle' : 'checkmark-circle')}
                          size={14}
                          color={isOut ? '#FF453A' : (isCritical ? '#FF3B30' : (isLow ? '#FF9F0A' : '#30D158'))}
                        />
                        <Text
                          style={[
                            styles.invStockValueText,
                            isOut && { color: '#FF453A' },
                            isCritical && { color: '#FF3B30' },
                            isLow && { color: '#FF9F0A' },
                            isOk && { color: '#30D158' },
                          ]}
                        >
                          {item.stock} {item.unit}
                        </Text>
                      </View>
                      <Text style={styles.invStatusLabel}>
                        {isOut ? 'OUT OF STOCK' : (isCritical ? 'CRITICAL LEVEL' : (isLow ? 'LOW STOCK' : 'IN STOCK'))}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#18181D',
    borderBottomWidth: 1,
    borderBottomColor: '#282830',
    flexWrap: 'wrap',
    gap: 12,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stationBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#193322',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  liveIndicatorText: {
    color: '#34C759',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  navSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  filterPills: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#24242C',
  },
  filterPillActive: {
    backgroundColor: '#3A3A48',
  },
  filterPillActiveCooking: {
    backgroundColor: '#4A3319',
  },
  filterPillActiveReady: {
    backgroundColor: '#19334D',
  },
  filterPillActiveAddons: {
    backgroundColor: '#4A3C19',
  },
  filterPillText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  filterPillTextActiveAddons: {
    color: '#D5A943',
    fontWeight: '700',
  },
  navRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inventoryNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#26262E',
    borderWidth: 1,
    borderColor: '#3A3A48',
  },
  inventoryNavBtnText: {
    color: '#FF9500',
    fontSize: 13,
    fontWeight: '700',
  },
  inventoryBadge: {
    backgroundColor: '#E65100',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 2,
  },
  inventoryBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  logoutNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  logoutNavBtnText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    flex: 1,
  },
  columnsContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'stretch',
  },
  ticketColumnWrap: {
    width: 330,
    minHeight: 380,
    maxHeight: 520,
    flexGrow: 1,
    maxWidth: 420,
  },
  ticketCard: {
    flex: 1,
    backgroundColor: '#1C1C22',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#2C2C36',
    display: 'flex',
    flexDirection: 'column',
  },
  ticketCardReady: {
    borderColor: '#007AFF',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ticketId: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000',
  },
  readyTag: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  readyTagText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#007AFF',
  },
  ticketTable: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(0,0,0,0.85)',
    marginTop: 2,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  ticketBody: {
    flex: 1,
    padding: 12,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#262630',
    padding: 12,
    borderRadius: 10,
  },
  foodRowCompleted: {
    backgroundColor: '#1A1A22',
    opacity: 0.65,
  },
  qtyBox: {
    width: 38,
    height: 38,
    backgroundColor: '#343442',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  qtyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  foodDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  foodName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  foodNotes: {
    color: '#F3D179',
    fontSize: 14,
    fontWeight: '700',
  },
  textCompleted: {
    textDecorationLine: 'line-through',
    color: '#777',
  },
  itemPrepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E1E26',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#343442',
  },
  itemPrepText: {
    color: '#F3D179',
    fontSize: 12,
    fontWeight: '800',
  },
  itemFastReadyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  itemFastReadyBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },
  itemReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.35)',
  },
  itemReadyBadgeText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '800',
  },
  itemMarkServedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  itemMarkServedBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  itemServedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  itemServedBadgeText: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '800',
  },
  bumpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#262630',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#2C2C38',
  },
  bumpButtonReady: {
    backgroundColor: '#D5A943', // Gold highlight
  },
  bumpButtonDispatched: {
    backgroundColor: '#007AFF', // Blue served
  },
  bumpButtonText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bumpTextReady: {
    color: '#000',
  },
  bumpTextWhite: {
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E1E26',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubText: {
    color: '#8E8E93',
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 360,
  },
  ticketCardAddOn: {
    borderColor: '#D5A943',
    borderWidth: 1.5,
  },
  addOnTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addOnTagText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#D5A943',
  },
  addOnRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(213, 169, 67, 0.3)',
  },
  addOnRibbonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D5A943',
    letterSpacing: 0.5,
  },
  soundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#262630',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A3A48',
  },
  soundButtonText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '700',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  alertBannerAddOn: {
    backgroundColor: '#8B4500',
    borderBottomWidth: 2,
    borderBottomColor: '#FF9500',
  },
  alertBannerNew: {
    backgroundColor: '#1E4620',
    borderBottomWidth: 2,
    borderBottomColor: '#34C759',
  },
  alertIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertHeading: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  alertRoundPill: {
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertRoundText: {
    color: '#8B4500',
    fontSize: 12,
    fontWeight: '900',
  },
  alertDetail: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  alertDismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  printPreviewContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginVertical: 40,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    backgroundColor: '#f1f2f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  closeBtnText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 12,
  },
  printBtnAction: {
    backgroundColor: '#D5A943',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  printBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  // Juice Inventory Modal Styles
  inventoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  inventoryModalContainer: {
    width: '100%',
    maxWidth: 820,
    maxHeight: '90%',
    backgroundColor: '#18181D',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E2E38',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  inventoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#202028',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C36',
    flexWrap: 'wrap',
    gap: 12,
  },
  inventoryIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inventoryModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  inventoryModalSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  handoverNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.4)',
  },
  handoverNavBtnText: {
    color: '#FF9500',
    fontSize: 12,
    fontWeight: '700',
  },
  invModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A2A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invStatsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#15151A',
    borderBottomWidth: 1,
    borderBottomColor: '#24242C',
    gap: 12,
  },
  invStatBox: {
    flex: 1,
    minWidth: 110,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#1E1E26',
    borderWidth: 1,
    borderColor: '#2A2A36',
  },
  invStatLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '700',
  },
  invStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginTop: 2,
  },
  invFilterSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#24242C',
    gap: 10,
  },
  invSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#24242C',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#343440',
  },
  invSearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  invCategoryScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  invCatPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#22222A',
    borderWidth: 1,
    borderColor: '#2E2E3A',
  },
  invCatPillActiveJuice: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  invCatPillText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  invCatPillTextActiveJuice: {
    color: '#000',
    fontWeight: '800',
  },
  invListContainer: {
    padding: 20,
    gap: 10,
  },
  invRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#202028',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  invRowLow: {
    borderColor: 'rgba(255, 159, 10, 0.4)',
    backgroundColor: 'rgba(255, 159, 10, 0.05)',
  },
  invRowOut: {
    borderColor: 'rgba(255, 69, 58, 0.4)',
    backgroundColor: 'rgba(255, 69, 58, 0.06)',
  },
  invRowLeft: {
    flex: 1,
    marginRight: 16,
  },
  invItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  invItemUrdu: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '600',
  },
  invRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  invCategoryTag: {
    backgroundColor: '#2A2A36',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  invCategoryTagText: {
    fontSize: 12.5,
    color: '#E2E8F0',
    fontWeight: '700',
  },
  invLocationText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  invThresholdText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  invRowRight: {
    alignItems: 'flex-end',
  },
  invBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  invBadgeOk: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
  },
  invBadgeLow: {
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
  },
  invBadgeCritical: {
    backgroundColor: 'rgba(255, 59, 48, 0.18)',
  },
  invBadgeOut: {
    backgroundColor: 'rgba(255, 69, 58, 0.2)',
  },
  invStockValueText: {
    fontSize: 15,
    fontWeight: '800',
  },
  invStatusLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#CBD5E1',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  invEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  invEmptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  invEmptySub: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
});
