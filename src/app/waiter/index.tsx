import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, useAuthStore } from '../../store';
import { Ticket } from '../../store/restaurantStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  sortFloors,
  getFloorMeta,
  getTableFloor,
  getTableSeatingType,
  SeatingZoneType,
  SEATING_ZONES,
  SEATING_ZONE_TYPES,
} from '../../constants/floors';
import SeatingTypeIcon from '../../components/SeatingTypeIcon';
import FullscreenButton from '../../components/FullscreenButton';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import { broadcastImmediately } from '../../services/syncService';
import { BRAND as BRAND_PALETTE } from '../../constants/brand';

const BRAND = BRAND_PALETTE.burgundy;

function playFoodReadyChime() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.12);
        osc.frequency.setValueAtTime(783.99, now + 0.24);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.55);
      }
    } catch (_) {}
  }
}

export default function OrderTakerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const columns = width < 520 ? 1 : width < 860 ? 2 : width < 1250 ? 3 : 4;

  // Stores
  const tables = useRestaurantStore((state) => state.tables) || [];
  const tickets = useRestaurantStore((state) => state.tickets) || [];
  const staff = useRestaurantStore((state) => state.staff) || [];
  const dynamicFloors = useRestaurantStore((state) => state.floors) || [];
  const settleBill = useRestaurantStore((state) => state.settleBill);
  const serveTableTickets = useRestaurantStore((state) => state.serveTableTickets);
  const lastBillPaidAlert = useRestaurantStore((state) => state.lastBillPaidAlert);
  const clearBillPaidAlert = useRestaurantStore((state) => state.clearBillPaidAlert);
  const lastFoodReadyAlert = useRestaurantStore((state) => state.lastFoodReadyAlert);
  const clearFoodReadyAlert = useRestaurantStore((state) => state.clearFoodReadyAlert);

  const user = useAuthStore((state) => state.user);
  const systemSettings = useSettingsStore((state) => state.settings);

  // 1. Reactively lookup active staff member so floor assignment changes by Admin reflect immediately
  const currentStaff = staff.find(
    (s) =>
      (user?.staffId && s.id === user.staffId) ||
      (user?.name && s.name.trim().toLowerCase() === user.name.trim().toLowerCase())
  );

  // 2. Resolve assigned floors
  const assignedZonesList: string[] =
    currentStaff?.assignedZones && currentStaff.assignedZones.length > 0
      ? currentStaff.assignedZones
      : currentStaff?.assignedZone
      ? [currentStaff.assignedZone]
      : user?.assignedZones && user.assignedZones.length > 0
      ? user.assignedZones
      : user?.assignedZone
      ? [user.assignedZone]
      : ['All Floors'];

  const isAllFloors =
    systemSettings.enableWaiterFloorLock === false ||
    assignedZonesList.includes('All Floors') ||
    assignedZonesList.length === 0;

  // System-wide available floors from store
  const systemFloors = useMemo(() => {
    const configured = (dynamicFloors || []).map((f) => f.name.trim()).filter(Boolean);
    if (configured.length > 0) return configured;
    const discovered = Array.from(new Set(tables.map((t) => getTableFloor(t)).filter(Boolean)));
    return sortFloors(discovered);
  }, [dynamicFloors, tables]);

  // Authorized floors for this specific Order Taker
  const authorizedFloors: string[] = isAllFloors ? systemFloors : assignedZonesList;

  // Active Floor Filter Tab
  const [selectedFloor, setSelectedFloor] = useState<string>('All');
  // Active Seating Zone Filter (All, Tables, Couches, Majlis Cabins)
  const [seatingTypeFilter, setSeatingTypeFilter] = useState<'all' | SeatingZoneType>('all');
  // Active Status Filter Tab (All, Free, Occupied, Food Ready, Billed)
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'ready' | 'billed'>('all');
  // Search query
  const [search, setSearch] = useState<string>('');
  // Manual sync feedback state
  const [isSyncing, setIsSyncing] = useState(false);

  // Persisted set of dismissed bill paid alert keys so tapping X permanently hides only that specific alert occurrence
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('@sultan_dismissed_bill_alerts')
      .then((val) => {
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              // Sanitize: filter out legacy raw table names/ids (e.g. 'table 1', 'tbl-1') which permanently muted tables
              // Clean alert keys contain timestamp underscores (e.g. 'bill_1_1729800000000' or '1729800000000')
              const clean = parsed.filter(
                (k) => typeof k === 'string' && (k.includes('_') || /^\d{10,}$/.test(k))
              );
              setDismissedAlerts(clean);
              AsyncStorage.setItem('@sultan_dismissed_bill_alerts', JSON.stringify(clean.slice(-60))).catch(() => {});
            }
          } catch (e) {}
        }
      })
      .catch(() => {});
  }, []);

  const handleDismissBillPaidAlert = async () => {
    if (!lastBillPaidAlert) {
      clearBillPaidAlert();
      broadcastImmediately();
      return;
    }

    const alertKey = lastBillPaidAlert.id || (lastBillPaidAlert.time ? `bill_${lastBillPaidAlert.tableId}_${lastBillPaidAlert.time}` : '');
    const newDismissed = Array.from(new Set([...dismissedAlerts, alertKey].filter(Boolean)));
    setDismissedAlerts(newDismissed);

    try {
      await AsyncStorage.setItem('@sultan_dismissed_bill_alerts', JSON.stringify(newDismissed.slice(-60)));
    } catch (e) {}

    clearBillPaidAlert(lastBillPaidAlert.id || lastBillPaidAlert.tableId);
    clearBillPaidAlert();
    broadcastImmediately();
  };

  const handleReleaseTable = async (tableId: string, tableName: string) => {
    settleBill(tableId);
    clearBillPaidAlert(tableId);
    clearBillPaidAlert(tableName);
    clearBillPaidAlert();

    // Only dismiss the specific active alert occurrence if it matches this table, NEVER the raw table ID or name!
    if (
      lastBillPaidAlert &&
      (lastBillPaidAlert.tableId === tableId ||
        lastBillPaidAlert.tableName.trim().toLowerCase() === tableName.trim().toLowerCase())
    ) {
      const alertKey = lastBillPaidAlert.id || (lastBillPaidAlert.time ? `bill_${tableId}_${lastBillPaidAlert.time}` : '');
      if (alertKey) {
        const newDismissed = Array.from(new Set([...dismissedAlerts, alertKey].filter(Boolean)));
        setDismissedAlerts(newDismissed);
        try {
          await AsyncStorage.setItem('@sultan_dismissed_bill_alerts', JSON.stringify(newDismissed.slice(-60)));
        } catch (e) {}
      }
    }

    broadcastImmediately();
  };

  // Determine if the bill-paid alert banner should actually be shown
  const shouldShowBillPaidAlert = useMemo(() => {
    if (!lastBillPaidAlert) return false;

    const alertKey = lastBillPaidAlert.id || (lastBillPaidAlert.time ? `bill_${lastBillPaidAlert.tableId}_${lastBillPaidAlert.time}` : '');
    const timeKey = lastBillPaidAlert.time ? String(lastBillPaidAlert.time) : '';

    // If this specific alert instance was dismissed by user, do not show
    if (
      (alertKey && dismissedAlerts.includes(alertKey)) ||
      (timeKey && dismissedAlerts.includes(timeKey))
    ) {
      return false;
    }

    // If alert is older than 30 minutes, do not show
    if (lastBillPaidAlert.time && Math.abs(Date.now() - lastBillPaidAlert.time) > 30 * 60 * 1000) {
      return false;
    }

    // Critical check: table MUST still exist and its current status MUST be 'billed' or 'isPaid'!
    const matchingTable = tables.find(
      (t) =>
        t.id === lastBillPaidAlert.tableId ||
        t.name.trim().toLowerCase() === (lastBillPaidAlert.tableName || '').trim().toLowerCase()
    );

    if (!matchingTable || (matchingTable.status !== 'billed' && !matchingTable.isPaid)) {
      return false;
    }

    // If order taker has assigned floors, only show if table is on an authorized floor
    if (!isAllFloors) {
      const tableFloor = getTableFloor(matchingTable);
      if (!authorizedFloors.some((af) => af.toLowerCase() === tableFloor.toLowerCase())) {
        return false;
      }
    }

    return true;
  }, [lastBillPaidAlert, dismissedAlerts, tables, isAllFloors, authorizedFloors]);

  // Check if Food Ready alert applies to this waiter's floor
  const shouldShowFoodReadyAlert = useMemo(() => {
    if (!lastFoodReadyAlert) return false;
    if (lastFoodReadyAlert.time && Math.abs(Date.now() - lastFoodReadyAlert.time) > 25 * 60 * 1000) {
      return false;
    }
    const matchingTable = tables.find(
      (t) =>
        t.id === lastFoodReadyAlert.tableId ||
        t.name.trim().toLowerCase() === (lastFoodReadyAlert.tableName || '').trim().toLowerCase()
    );
    if (!matchingTable) return false;
    if (!isAllFloors) {
      const tableFloor = getTableFloor(matchingTable);
      if (!authorizedFloors.some((af) => af.toLowerCase() === tableFloor.toLowerCase())) {
        return false;
      }
    }
    return true;
  }, [lastFoodReadyAlert, tables, isAllFloors, authorizedFloors]);

  // Audio chime when kitchen/juice bar marks food ready
  useEffect(() => {
    if (shouldShowFoodReadyAlert && lastFoodReadyAlert) {
      playFoodReadyChime();
    }
  }, [lastFoodReadyAlert?.id, lastFoodReadyAlert?.time]);

  // Effective active floor
  const activeFloor =
    !isAllFloors && authorizedFloors.length === 1
      ? authorizedFloors[0]
      : selectedFloor !== 'All' && authorizedFloors.includes(selectedFloor)
      ? selectedFloor
      : 'All';

  // 3. Scoped tables by Floor authorization, seating zone toggles & selected floor tab
  const scopedByFloorTables = useMemo(() => {
    return tables.filter((t) => {
      const tType = getTableSeatingType(t);
      if (tType === 'majlis' && systemSettings.enableMajlisSeating === false) return false;
      if (tType === 'couches' && systemSettings.enableCouchSeating === false) return false;
      const tableFloor = getTableFloor(t);
      if (!isAllFloors && !authorizedFloors.some((af) => af.toLowerCase() === tableFloor.toLowerCase())) {
        return false;
      }
      if (activeFloor !== 'All' && tableFloor.toLowerCase() !== activeFloor.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [tables, isAllFloors, authorizedFloors, activeFloor, systemSettings.enableMajlisSeating, systemSettings.enableCouchSeating]);

  // 4. Zone Breakdown Summary (how many Tables, Couches, Majlis Cabins on this floor)
  const zoneSummary = useMemo(() => {
    const tablesList = scopedByFloorTables.filter((t) => getTableSeatingType(t) === 'tables');
    const couchesList = scopedByFloorTables.filter((t) => getTableSeatingType(t) === 'couches');
    const majlisList = scopedByFloorTables.filter((t) => getTableSeatingType(t) === 'majlis');

    return {
      tables: {
        count: tablesList.length,
        seats: tablesList.reduce((s, t) => s + t.seats, 0),
        available: tablesList.filter((t) => t.status === 'available').length,
      },
      couches: {
        count: couchesList.length,
        seats: couchesList.reduce((s, t) => s + t.seats, 0),
        available: couchesList.filter((t) => t.status === 'available').length,
      },
      majlis: {
        cabinsCount: majlisList.length,
        sittingCapacity: majlisList.reduce((s, t) => s + t.seats, 0),
        availableCabins: majlisList.filter((t) => t.status === 'available').length,
      },
    };
  }, [scopedByFloorTables]);

  const isTicketReadyForPickup = (t: Ticket) => {
    if (t.status === 'served') return false;
    if (t.status === 'ready') return true;
    if (t.stationStatuses?.main === 'ready' || t.stationStatuses?.juice === 'ready') return true;
    if (Array.isArray(t.items) && t.items.some((i) => i.itemStatus === 'ready')) return true;
    return false;
  };

  // Status breakdown counts on this scoped floor
  const statusCounts = useMemo(() => {
    let free = 0;
    let occupied = 0;
    let ready = 0;
    let billed = 0;

    scopedByFloorTables.forEach((table) => {
      const tableTickets = tickets.filter((t) => t.tableId === table.id);
      const isFoodReady = tableTickets.some(isTicketReadyForPickup);
      const isTableBilled = table.status === 'billed' || table.isPaid;
      if (isFoodReady) ready++;
      else if (isTableBilled) billed++;
      else if (table.status === 'occupied') occupied++;
      else if (table.status === 'available') free++;
    });

    return { free, occupied, ready, billed };
  }, [scopedByFloorTables, tickets]);

  // 5. Final Visible Tables filtered by Seating Type, Status Tab & Search
  const visibleTables = useMemo(() => {
    return scopedByFloorTables.filter((t) => {
      const tType = getTableSeatingType(t);
      if (seatingTypeFilter !== 'all' && tType !== seatingTypeFilter) {
        return false;
      }
      if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) {
        return false;
      }
      if (statusFilter !== 'all') {
        const tableTickets = tickets.filter((tk) => tk.tableId === t.id);
        const isFoodReady = tableTickets.some(isTicketReadyForPickup);
        const isTableBilled = t.status === 'billed' || t.isPaid;
        const isOccupied = t.status === 'occupied';

        if (statusFilter === 'ready' && !isFoodReady) return false;
        if (statusFilter === 'billed' && !isTableBilled) return false;
        if (statusFilter === 'occupied' && (!isOccupied || isFoodReady || isTableBilled)) return false;
        if (statusFilter === 'available' && t.status !== 'available') return false;
      }
      return true;
    });
  }, [scopedByFloorTables, seatingTypeFilter, statusFilter, search, tickets]);

  // 6. Filter ready tickets to only tables belonging to authorized floors
  const readyTickets = tickets.filter((t) => {
    if (!isTicketReadyForPickup(t)) return false;
    const targetTable = tables.find((tab) => tab.id === t.tableId);
    if (!targetTable) return true;
    const tableFloor = getTableFloor(targetTable);
    if (!isAllFloors && !authorizedFloors.some((af) => af.toLowerCase() === tableFloor.toLowerCase())) return false;
    return true;
  });

  const handleTablePress = (id: string) => {
    router.push(`/waiter/order/${id}`);
  };

  const renderTable = ({ item }: { item: typeof tables[0] }) => {
    const isOccupied = item.status === 'occupied';
    const isBilled = item.status === 'billed' || item.isPaid;

    const tableTickets = tickets.filter((t) => t.tableId === item.id);
    const isFoodReady = tableTickets.some(isTicketReadyForPickup);
    const isCooking = tableTickets.some((t) => (t.status === 'pending' || t.status === 'cooking') && !isFoodReady);
    const roundCount = tableTickets.length;

    const assignedServer =
      item.server || (tableTickets.length > 0 ? tableTickets[tableTickets.length - 1].server : null);

    const seatingType = getTableSeatingType(item);
    const floorName = getTableFloor(item);
    const floorMeta = getFloorMeta(floorName, dynamicFloors);
    const zoneMeta = SEATING_ZONES[seatingType];

    const isMajlis = seatingType === 'majlis';
    const isCouch = seatingType === 'couches';

    let statusColor = '#34C759'; // Available: Green
    if (isFoodReady) statusColor = '#007AFF'; // Food Ready: Blue
    else if (isBilled) statusColor = '#E67E22'; // Billed/Paid: Orange/Amber
    else if (isOccupied) statusColor = '#D64541'; // Occupied: Red
    else if (item.status === 'reserved') statusColor = '#7D3C98'; // Reserved: Purple

    return (
      <TouchableOpacity
        style={[
          styles.tableCard,
          columns === 1 && { marginBottom: 10 },
          isMajlis && styles.majlisTableCard,
          isCouch && styles.couchTableCard,
          isFoodReady && styles.tableCardFoodReady,
          isBilled && styles.tableCardBilled,
          isOccupied && !isFoodReady && !isBilled && styles.tableCardOccupied,
        ]}
        onPress={() => handleTablePress(item.id)}
        activeOpacity={0.84}
      >
        {/* Zone Top Accent Stripe */}
        <View
          style={[
            styles.cardAccentStripe,
            { backgroundColor: isMajlis ? '#D5A943' : isCouch ? '#E65100' : isFoodReady ? '#007AFF' : statusColor },
          ]}
        />

        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View
              style={[
                styles.seatingIconBubble,
                isMajlis
                  ? styles.majlisIconBubble
                  : isCouch
                  ? styles.couchIconBubble
                  : styles.tableIconBubble,
              ]}
            >
              <SeatingTypeIcon type={seatingType} size={20} color={isMajlis ? '#D5A943' : zoneMeta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tableName} numberOfLines={1}>{item.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <View
                  style={[
                    styles.zoneMiniTag,
                    isMajlis && { backgroundColor: 'rgba(213, 169, 67, 0.15)', borderColor: '#D5A943' },
                    isCouch && { backgroundColor: 'rgba(230, 81, 0, 0.12)', borderColor: '#E65100' },
                  ]}
                >
                  <Text
                    style={[
                      styles.zoneTypeBadge,
                      { color: isMajlis ? '#8A5D00' : zoneMeta.color },
                    ]}
                  >
                    {isMajlis ? 'Majlis Cabin' : isCouch ? 'Couch Lounge' : 'Dining Table'}
                  </Text>
                </View>
                <Text style={styles.dot}>•</Text>
                <Ionicons name={floorMeta.icon || 'business-outline'} size={11} color={floorMeta.color || '#8E8E93'} />
                <Text style={[styles.floorTagText, { color: floorMeta.color || '#8E8E93' }]} numberOfLines={1}>
                  {floorName}
                </Text>
              </View>
            </View>
          </View>

          {/* Status Indicator Pill with glowing dot */}
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  statusColor === '#34C759'
                    ? '#E8F8EE'
                    : statusColor === '#007AFF'
                    ? '#E8F2FF'
                    : statusColor === '#E67E22'
                    ? '#FEF5E7'
                    : '#FDEDEC',
                borderColor: statusColor + '55',
              },
            ]}
          >
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusIndicatorText, { color: statusColor }]}>
              {isFoodReady ? 'READY' : isBilled ? 'BILLED' : item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Card Body */}
        <View style={styles.cardBody}>
          {/* Capacity and Guest Tag */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <View style={[styles.capacityRow, isMajlis && styles.majlisCapacityRow]}>
              <Ionicons name="people" size={13} color={isMajlis ? '#4a121a' : '#555'} />
              <Text style={[styles.capacityText, isMajlis && { color: '#4a121a', fontWeight: '800' }]}>
                {isMajlis
                  ? `Capacity: ${item.seats} Guests (Family Cabin)`
                  : isCouch
                  ? `Seating: ${item.seats} Guests (Lounge)`
                  : `Seating: ${item.seats} Guests`}
              </Text>
            </View>

            {(isOccupied || isBilled) && item.occupiedSince ? (
              <View style={styles.seatedTimerPill}>
                <Ionicons name="time-outline" size={11} color="#C0392B" style={{ marginRight: 3 }} />
                <Text style={styles.seatedTimerText}>
                  {Math.max(1, Math.floor((Date.now() - item.occupiedSince) / 60000))}m seated
                </Text>
              </View>
            ) : null}
          </View>

          {/* Status Pill and Server Assigned (No Prices for Order Taker) */}
          <View style={styles.billServerRow}>
            {item.status === 'occupied' || item.status === 'billed' ? (
              <View style={[styles.freeNoticePill, { backgroundColor: 'rgba(217, 119, 6, 0.12)' }]}>
                <Ionicons name="restaurant" size={12} color="#D97706" />
                <Text style={[styles.freeNoticeText, { color: '#D97706', fontWeight: '800' }]}>
                  {item.status === 'billed' ? 'Bill Requested' : 'Active Order'}
                </Text>
              </View>
            ) : (
              <View style={[styles.freeNoticePill, { backgroundColor: statusColor + '12' }]}>
                <Ionicons
                  name={item.status === 'available' ? 'sparkles' : 'time-outline'}
                  size={12}
                  color={statusColor}
                />
                <Text style={[styles.freeNoticeText, { color: statusColor }]}>
                  Ready for Seating
                </Text>
              </View>
            )}

            {assignedServer && (isOccupied || isBilled) && (
              <View style={styles.waiterBadge}>
                <Ionicons name="person" size={11} color="#4a121a" style={{ marginRight: 3 }} />
                <Text style={styles.waiterBadgeText} numberOfLines={1}>{assignedServer}</Text>
              </View>
            )}
          </View>

          {/* Kitchen Live Status Badges */}
          {isFoodReady && !isBilled && (() => {
            const readyItems = tableTickets.flatMap((t) => (t.items || []).filter((i) => i.itemStatus === 'ready'));
            const isPartialItemReady = readyItems.length > 0 && tableTickets.every((t) => t.status !== 'ready');
            const itemNames = readyItems.map((i) => `${i.qty > 1 ? `${i.qty}x ` : ''}${i.name}`).slice(0, 2).join(', ');
            const extraCount = readyItems.length > 2 ? ` +${readyItems.length - 2} more` : '';
            return (
              <View style={styles.foodReadyPill}>
                <Ionicons name="flash" size={12} color="#007AFF" />
                <Text style={styles.foodReadyPillText} numberOfLines={1}>
                  {isPartialItemReady
                    ? `READY: ${itemNames}${extraCount}`
                    : roundCount > 1
                    ? `FOOD READY AT PASS (Round #${roundCount})`
                    : 'FOOD READY AT PASS!'}
                </Text>
              </View>
            );
          })()}
          {isCooking && !isFoodReady && !isBilled && (
            <View style={styles.cookingPill}>
              <Ionicons name="flame" size={12} color="#FF9500" />
              <Text style={styles.cookingPillText}>
                {roundCount > 1 ? `In Kitchen Prep (Round #${roundCount})` : 'Order Cooking in Kitchen...'}
              </Text>
            </View>
          )}
        </View>

        {/* Card Footer Actions */}
        <View style={[styles.cardFooter, { backgroundColor: isMajlis ? 'rgba(213, 169, 67, 0.08)' : '#FAFAFA' }]}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.tapToOrderPrompt,
                isFoodReady && { color: '#007AFF' },
                isOccupied && !isFoodReady && { color: '#C0392B' },
              ]}
            >
              {isOccupied
                ? 'View items / Add punch ➔'
                : isBilled
                ? 'Guests Dining / Billed ➔'
                : 'Take customer order ➔'}
            </Text>
          </View>

          {isFoodReady && !isBilled && (
            <TouchableOpacity
              style={styles.serveNowBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                serveTableTickets(item.id);
                broadcastImmediately();
                const msg = `Food marked served for ${item.name}!`;
                if (Platform.OS !== 'web') {
                  Alert.alert('Served', msg);
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.serveNowBtnText}>Serve Now</Text>
            </TouchableOpacity>
          )}

          {isBilled && (
            <TouchableOpacity
              style={styles.releaseTableBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                const msg = `Release ${item.name}? Table will become AVAILABLE for new guests.`;
                if (Platform.OS === 'web') {
                  if (window.confirm(msg)) handleReleaseTable(item.id, item.name);
                } else {
                  Alert.alert('Release Table', msg, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Release', style: 'destructive', onPress: () => handleReleaseTable(item.id, item.name) },
                  ]);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.releaseTableBtnText}>Release</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const displayName = currentStaff?.name || user?.name || 'Order Taker';

  return (
    <View style={[styles.container, isMobile && { paddingHorizontal: 12 }]}>
      {/* Compact High-Efficiency Order Taker Header */}
      <View style={[styles.compactHeader, width < 420 && { flexWrap: 'wrap', gap: 8 }]}>
        <View style={[styles.compactHeaderLeft, { marginRight: 6 }]}>
          <View style={styles.waiterAvatar}>
            <Ionicons name="person" size={13} color="#4a121a" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.waiterNameText} numberOfLines={1}>{displayName}</Text>
              <View
                style={[
                  styles.compactFloorBadge,
                  !isAllFloors ? styles.floorBadgeActive : styles.floorBadgeAll,
                  { maxWidth: '100%' }
                ]}
              >
                <Ionicons
                  name={!isAllFloors ? 'location' : 'earth'}
                  size={10}
                  color={!isAllFloors ? '#2E7D32' : '#007AFF'}
                />
                <Text
                  style={[
                    styles.compactFloorBadgeText,
                    !isAllFloors ? styles.floorBadgeTextActive : styles.floorBadgeTextAll,
                  ]}
                  numberOfLines={1}
                >
                  {!isAllFloors ? authorizedFloors.join(', ') : 'All Floors'}
                </Text>
              </View>
            </View>
            <Text style={styles.compactFloorCountText}>
              {visibleTables.length} unit{visibleTables.length === 1 ? '' : 's'}{' '}
              {activeFloor === 'All' ? 'authorized' : `on ${activeFloor}`}
            </Text>
          </View>
        </View>

        <View style={styles.compactHeaderRight}>
          <SyncStatusBadge compact />
          <FullscreenButton
            variant={width < 420 ? 'compact' : 'pill'}
            style={{
              height: 28,
              backgroundColor: '#4a121a',
              borderColor: 'rgba(213, 169, 67, 0.4)',
              paddingHorizontal: width < 420 ? 0 : 8,
            }}
          />

          <TouchableOpacity 
            style={[styles.compactSyncBtn, isSyncing && styles.compactSyncBtnActive]}
            onPress={() => {
              setIsSyncing(true);
              broadcastImmediately();
              setTimeout(() => setIsSyncing(false), 600);
            }}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="sync-outline" 
              size={13} 
              color={isSyncing ? '#D4AF37' : '#636366'} 
            />
            <Text style={[styles.compactSyncText, isSyncing && { color: '#D4AF37' }]}>
              {isSyncing ? 'Synced' : 'Sync'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.compactTakeawayBtn}
            onPress={() => router.push('/waiter/order/takeaway')}
            activeOpacity={0.8}
          >
            <Ionicons name="bag-handle" size={13} color="#D4AF37" style={{ marginRight: 4 }} />
            <Text style={styles.compactTakeawayText}>Takeaway</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Compact Search Bar */}
      <View style={styles.compactSearchBar}>
        <Ionicons name="search" size={15} color="#8E8E93" />
        <TextInput
          style={styles.compactSearchInput}
          placeholder="Search tables, couches, cabins by name..."
          placeholderTextColor="#AEAEB2"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={15} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>

      {/* Floor Filter Tabs */}
      {(isAllFloors || authorizedFloors.length > 1) && (
        <View style={{ marginBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.floorTabsContent}
          >
            <TouchableOpacity
              style={[
                styles.floorTab,
                activeFloor === 'All' && styles.floorTabActive,
              ]}
              onPress={() => setSelectedFloor('All')}
            >
              <Ionicons
                name="grid-outline"
                size={13}
                color={activeFloor === 'All' ? '#fff' : BRAND}
              />
              <Text
                style={[
                  styles.floorTabText,
                  activeFloor === 'All' && styles.floorTabTextActive,
                ]}
              >
                All Floors ({tables.filter((t) => isAllFloors || authorizedFloors.includes(getTableFloor(t))).length})
              </Text>
            </TouchableOpacity>

            {authorizedFloors.map((floor) => {
              const count = tables.filter((t) => getTableFloor(t).toLowerCase() === floor.toLowerCase()).length;
              const meta = getFloorMeta(floor, dynamicFloors);
              const isActive = activeFloor.toLowerCase() === floor.toLowerCase();
              return (
                <TouchableOpacity
                  key={floor}
                  style={[
                    styles.floorTab,
                    isActive && {
                      backgroundColor: meta.color || BRAND,
                      borderColor: meta.color || BRAND,
                    },
                  ]}
                  onPress={() => setSelectedFloor(floor)}
                >
                  <Ionicons
                    name={meta.icon || 'business-outline'}
                    size={13}
                    color={isActive ? '#fff' : meta.color || BRAND}
                  />
                  <Text
                    style={[
                      styles.floorTabText,
                      isActive && styles.floorTabTextActive,
                    ]}
                  >
                    {floor} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Unified Single-Row Filter Toolbar (Status & Seating Types in One Line) */}
      <View style={styles.singleFilterToolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.singleFilterContent}
        >
          {/* --- Status Filters Segment --- */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              styles.filterPillAll,
              statusFilter === 'all' && styles.filterPillActivePrimary,
            ]}
            onPress={() => setStatusFilter('all')}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.filterPillText,
                statusFilter === 'all' && styles.filterPillTextActive,
              ]}
            >
              All Status
            </Text>
            <View
              style={[
                styles.pillCountBadge,
                statusFilter === 'all' ? styles.pillCountBadgeActive : styles.pillCountBadgeNeutral,
              ]}
            >
              <Text
                style={[
                  styles.pillCountBadgeText,
                  statusFilter === 'all' && styles.pillCountBadgeTextActive,
                ]}
              >
                {scopedByFloorTables.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              styles.filterPillAvailable,
              statusFilter === 'available' && styles.filterPillActiveAvailable,
            ]}
            onPress={() => setStatusFilter('available')}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: statusFilter === 'available' ? '#fff' : '#16A34A' },
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                styles.filterPillTextAvailable,
                statusFilter === 'available' && styles.filterPillTextActive,
              ]}
            >
              Available
            </Text>
            <View
              style={[
                styles.pillCountBadge,
                statusFilter === 'available'
                  ? styles.pillCountBadgeActive
                  : styles.pillCountBadgeAvailable,
              ]}
            >
              <Text
                style={[
                  styles.pillCountBadgeText,
                  styles.pillCountBadgeTextAvailable,
                  statusFilter === 'available' && styles.pillCountBadgeTextActive,
                ]}
              >
                {statusCounts.free}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              styles.filterPillOccupied,
              statusFilter === 'occupied' && styles.filterPillActiveOccupied,
            ]}
            onPress={() => setStatusFilter('occupied')}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: statusFilter === 'occupied' ? '#fff' : '#DC2626' },
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                styles.filterPillTextOccupied,
                statusFilter === 'occupied' && styles.filterPillTextActive,
              ]}
            >
              Occupied
            </Text>
            <View
              style={[
                styles.pillCountBadge,
                statusFilter === 'occupied'
                  ? styles.pillCountBadgeActive
                  : styles.pillCountBadgeOccupied,
              ]}
            >
              <Text
                style={[
                  styles.pillCountBadgeText,
                  styles.pillCountBadgeTextOccupied,
                  statusFilter === 'occupied' && styles.pillCountBadgeTextActive,
                ]}
              >
                {statusCounts.occupied}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              styles.filterPillReady,
              statusFilter === 'ready' && styles.filterPillActiveReady,
            ]}
            onPress={() => setStatusFilter('ready')}
            activeOpacity={0.75}
          >
            <Ionicons
              name="notifications"
              size={12}
              color={statusFilter === 'ready' ? '#fff' : '#2563EB'}
            />
            <Text
              style={[
                styles.filterPillText,
                styles.filterPillTextReady,
                statusFilter === 'ready' && styles.filterPillTextActive,
              ]}
            >
              Food Ready
            </Text>
            <View
              style={[
                styles.pillCountBadge,
                statusFilter === 'ready'
                  ? styles.pillCountBadgeActive
                  : styles.pillCountBadgeReady,
              ]}
            >
              <Text
                style={[
                  styles.pillCountBadgeText,
                  styles.pillCountBadgeTextReady,
                  statusFilter === 'ready' && styles.pillCountBadgeTextActive,
                ]}
              >
                {statusCounts.ready}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              styles.filterPillBilled,
              statusFilter === 'billed' && styles.filterPillActiveBilled,
            ]}
            onPress={() => setStatusFilter('billed')}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.filterDot,
                { backgroundColor: statusFilter === 'billed' ? '#fff' : '#D97706' },
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                styles.filterPillTextBilled,
                statusFilter === 'billed' && styles.filterPillTextActive,
              ]}
            >
              Billed
            </Text>
            <View
              style={[
                styles.pillCountBadge,
                statusFilter === 'billed'
                  ? styles.pillCountBadgeActive
                  : styles.pillCountBadgeBilled,
              ]}
            >
              <Text
                style={[
                  styles.pillCountBadgeText,
                  styles.pillCountBadgeTextBilled,
                  statusFilter === 'billed' && styles.pillCountBadgeTextActive,
                ]}
              >
                {statusCounts.billed}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Clean Vertical Divider */}
          <View style={styles.filterVerticalDivider} />

          {/* --- Seating Zone Type Segment --- */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              styles.filterPillAll,
              seatingTypeFilter === 'all' && styles.filterPillActivePrimary,
            ]}
            onPress={() => setSeatingTypeFilter('all')}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.filterPillText,
                seatingTypeFilter === 'all' && styles.filterPillTextActive,
              ]}
            >
              All Types
            </Text>
            <View
              style={[
                styles.pillCountBadge,
                seatingTypeFilter === 'all' ? styles.pillCountBadgeActive : styles.pillCountBadgeNeutral,
              ]}
            >
              <Text
                style={[
                  styles.pillCountBadgeText,
                  seatingTypeFilter === 'all' && styles.pillCountBadgeTextActive,
                ]}
              >
                {scopedByFloorTables.length}
              </Text>
            </View>
          </TouchableOpacity>

          {SEATING_ZONE_TYPES.filter((type) => {
            if (type === 'majlis' && systemSettings.enableMajlisSeating === false) return false;
            if (type === 'couches' && systemSettings.enableCouchSeating === false) return false;
            return true;
          }).map((type) => {
            const meta = SEATING_ZONES[type];
            const isActive = seatingTypeFilter === type;
            const count = scopedByFloorTables.filter((t) => getTableSeatingType(t) === type).length;
            const tintBg = type === 'tables' ? '#EFF6FF' : type === 'couches' ? '#FFF7ED' : '#FEFCE8';
            const tintBorder = type === 'tables' ? '#BFDBFE' : type === 'couches' ? '#FED7AA' : '#FEF08A';
            const tintText = type === 'tables' ? '#1D4ED8' : type === 'couches' ? '#C2410C' : '#A16207';
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterPill,
                  { backgroundColor: tintBg, borderColor: tintBorder },
                  isActive && { backgroundColor: meta.color, borderColor: meta.color },
                ]}
                onPress={() => setSeatingTypeFilter(type)}
                activeOpacity={0.75}
              >
                <SeatingTypeIcon type={type} size={13} color={isActive ? '#fff' : tintText} />
                <Text
                  style={[
                    styles.filterPillText,
                    { color: tintText },
                    isActive && styles.filterPillTextActive,
                  ]}
                >
                  {meta.label}
                </Text>
                <View
                  style={[
                    styles.pillCountBadge,
                    { backgroundColor: isActive ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.06)' },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillCountBadgeText,
                      { color: isActive ? '#fff' : tintText },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

        {/* Real-time Food Ready Alert Banner */}
        {shouldShowFoodReadyAlert && lastFoodReadyAlert && (
          <View style={[styles.billPaidAlertBanner, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
            <View style={[styles.billPaidIconBox, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="restaurant" size={20} color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.billPaidAlertTitle, { color: '#15803D' }]}>
                Dish Ready: {lastFoodReadyAlert.tableName}!
              </Text>
              <Text style={[styles.billPaidAlertDesc, { color: '#166534' }]}>
                {lastFoodReadyAlert.station === 'juice' ? 'Juice Bar' : 'Kitchen'} marked{' '}
                <Text style={{ fontWeight: '700' }}>
                  {lastFoodReadyAlert.singleItemName || lastFoodReadyAlert.itemsSummary}
                </Text>{' '}
                ready. Tap to view table.
              </Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: '#16A34A',
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 8,
                marginRight: 6,
              }}
              onPress={() => router.push(`/waiter/order/${lastFoodReadyAlert.tableId}` as any)}
            >
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>View ➔</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.billPaidDismissBtn}
              onPress={() => clearFoodReadyAlert(lastFoodReadyAlert.id || lastFoodReadyAlert.tableId)}
            >
              <Ionicons name="close" size={18} color="#166534" />
            </TouchableOpacity>
          </View>
        )}

        {/* Real-time Bill Paid Alert Banner */}
        {shouldShowBillPaidAlert && lastBillPaidAlert && (
          <View style={styles.billPaidAlertBanner}>
            <View style={styles.billPaidIconBox}>
              <Ionicons name="card" size={20} color="#E67E22" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.billPaidAlertTitle}>
                Bill Paid: {lastBillPaidAlert.tableName}!
              </Text>
              <Text style={styles.billPaidAlertDesc}>
                Bill settled at Cashier counter. Guests are still seated — tap Release below when vacated.
              </Text>
            </View>
            <TouchableOpacity style={styles.billPaidDismissBtn} onPress={handleDismissBillPaidAlert}>
              <Ionicons name="close" size={18} color="#666" />
            </TouchableOpacity>
          </View>
        )}

        {/* Notification banner if food is ready for this Order Taker's tables */}
        {readyTickets.length > 0 && (
          <View style={styles.readyAlertBanner}>
            <Ionicons name="notifications" size={22} color="#007AFF" />
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={styles.readyAlertTitle}>
                {readyTickets.length} Order{readyTickets.length > 1 ? 's' : ''} Ready for Pickup!
              </Text>
              <Text style={styles.readyAlertDesc}>
                {Array.from(new Set(readyTickets.map((t) => t.tableName))).join(', ')} ready at the pass.
              </Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: '#007AFF',
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
              onPress={() => {
                readyTickets.forEach((t) => serveTableTickets(t.tableId));
                broadcastImmediately();
                const msg = 'All ready orders marked served!';
                if (Platform.OS !== 'web') Alert.alert('Served', msg);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Serve All</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tables & Cabins Grid */}
        {visibleTables.length > 0 ? (
          <FlatList
            data={visibleTables}
            keyExtractor={(item) => item.id}
            renderItem={renderTable}
            numColumns={columns}
            key={`waiter-cols-${columns}`}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={columns > 1 ? styles.rowWrapper : undefined}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyTitle}>No units found</Text>
            <Text style={styles.emptySubtitle}>
              No tables or cabins match the selected filters on{' '}
              <Text style={{ fontWeight: '700', color: '#1C1C1E' }}>
                {activeFloor === 'All' ? authorizedFloors.join(', ') : activeFloor}
              </Text>.
            </Text>
          </View>
        )}
      </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: '#F8F9FA',
  },
  header: {
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  terminalBadge: {
    backgroundColor: '#4a121a15',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a121a30',
  },
  terminalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4a121a',
    letterSpacing: 0.5,
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },

  // Compact Header
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  compactHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  waiterAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4a121a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
  },
  waiterNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  compactFloorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  floorBadgeActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  floorBadgeAll: {
    backgroundColor: '#EBF3FF',
    borderWidth: 1,
    borderColor: '#D4E2F6',
  },
  compactFloorBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  floorBadgeTextActive: {
    color: '#2E7D32',
  },
  floorBadgeTextAll: {
    color: '#007AFF',
  },
  compactFloorCountText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  compactHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  compactSyncBtnActive: {
    backgroundColor: '#FFF9E6',
    borderColor: '#D4AF37',
  },
  compactSyncText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#636366',
  },
  compactTakeawayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4a121a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  compactTakeawayText: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '800',
  },

  // Compact Search Bar
  compactSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 7,
    gap: 6,
    height: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  compactSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1C1C1E',
    padding: 0,
  },

  floorTabsContent: {
    gap: 6,
    paddingHorizontal: 2,
  },
  floorTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  floorTabActive: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  floorTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND,
  },
  floorTabTextActive: {
    color: '#fff',
  },

  // Unified Filter Toolbar
  singleFilterToolbar: {
    marginBottom: 8,
  },
  singleFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 9,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
    elevation: 1,
  },
  filterPillAll: {
    backgroundColor: '#F7F7F9',
    borderColor: '#E5E5EA',
  },
  filterPillAvailable: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  filterPillOccupied: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  filterPillReady: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  filterPillBilled: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },

  filterPillActivePrimary: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  filterPillActiveAvailable: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  filterPillActiveOccupied: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  filterPillActiveReady: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterPillActiveBilled: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },

  filterPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  filterPillTextAvailable: {
    color: '#15803D',
  },
  filterPillTextOccupied: {
    color: '#B91C1C',
  },
  filterPillTextReady: {
    color: '#1D4ED8',
  },
  filterPillTextBilled: {
    color: '#B45309',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Count Badges inside Pills
  pillCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 3,
  },
  pillCountBadgeNeutral: {
    backgroundColor: '#E5E7EB',
  },
  pillCountBadgeAvailable: {
    backgroundColor: '#DCFCE7',
  },
  pillCountBadgeOccupied: {
    backgroundColor: '#FEE2E2',
  },
  pillCountBadgeReady: {
    backgroundColor: '#DBEAFE',
  },
  pillCountBadgeBilled: {
    backgroundColor: '#FEF3C7',
  },
  pillCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  pillCountBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
  },
  pillCountBadgeTextAvailable: {
    color: '#15803D',
  },
  pillCountBadgeTextOccupied: {
    color: '#B91C1C',
  },
  pillCountBadgeTextReady: {
    color: '#1D4ED8',
  },
  pillCountBadgeTextBilled: {
    color: '#B45309',
  },
  pillCountBadgeTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  filterVerticalDivider: {
    width: 1.5,
    height: 18,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 3,
  },

  readyAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F2FF',
    borderWidth: 1.5,
    borderColor: '#B8D7FF',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 12,
  },
  readyAlertTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#007AFF',
  },
  readyAlertDesc: {
    fontSize: 13.5,
    color: '#0051A8',
    marginTop: 2,
  },
  billPaidAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderWidth: 1.5,
    borderColor: '#FFE082',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 12,
  },
  billPaidIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billPaidAlertTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#E67E22',
  },
  billPaidAlertDesc: {
    fontSize: 13.5,
    color: '#8D6E63',
    marginTop: 2,
    lineHeight: 18,
  },
  billPaidDismissBtn: {
    padding: 6,
  },

  listContent: {
    paddingBottom: 110,
  },
  rowWrapper: {
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  // Table & Cabin Cards
  tableCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8E5DD',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  cardAccentStripe: {
    height: 4,
    width: '100%',
  },
  majlisTableCard: {
    backgroundColor: '#FCFAF6',
    borderColor: 'rgba(213, 169, 67, 0.45)',
  },
  couchTableCard: {
    backgroundColor: '#FFFDFB',
    borderColor: 'rgba(230, 81, 0, 0.35)',
  },
  tableCardOccupied: {
    borderColor: 'rgba(214, 69, 65, 0.45)',
  },
  tableCardFoodReady: {
    borderColor: '#007AFF',
    borderWidth: 2,
    shadowColor: '#007AFF',
    shadowOpacity: 0.15,
  },
  tableCardBilled: {
    borderColor: '#E67E22',
    borderWidth: 2,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 12,
    paddingBottom: 6,
  },
  seatingIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  majlisIconBubble: {
    backgroundColor: 'rgba(213, 169, 67, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
  },
  couchIconBubble: {
    backgroundColor: 'rgba(230, 81, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(230, 81, 0, 0.25)',
  },
  tableIconBubble: {
    backgroundColor: 'rgba(25, 118, 210, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(25, 118, 210, 0.25)',
  },
  tableName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  zoneMiniTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  zoneTypeBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  dot: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  floorTagText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },

  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusIndicatorText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  cardBody: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  majlisCapacityRow: {
    backgroundColor: 'rgba(213, 169, 67, 0.14)',
  },
  capacityText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  seatedTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    alignSelf: 'flex-start',
  },
  seatedTimerText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#C0392B',
  },

  billServerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  billBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  billCurrency: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#D5A943',
  },
  billText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  freeNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  freeNoticeText: {
    fontSize: 12.5,
    fontWeight: '700',
  },

  waiterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F4EC',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  waiterBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
  },

  foodReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E8F2FF',
    borderWidth: 1.2,
    borderColor: '#B8D7FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  foodReadyPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#007AFF',
  },
  cookingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF3E0',
    borderWidth: 1.2,
    borderColor: '#FFE0B2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  cookingPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF9500',
  },

  cardFooter: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0ECE3',
  },
  tapToOrderPrompt: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND,
  },
  serveNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
  },
  serveNowBtnText: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  releaseTableBtn: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  releaseTableBtnText: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '800',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
