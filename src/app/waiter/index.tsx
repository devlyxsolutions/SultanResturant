import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, useAuthStore } from '../../store';
import { sortFloors, getFloorMeta } from '../../constants/floors';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import { broadcastImmediately } from '../../services/syncService';

export default function OrderTakerScreen() {
  const router = useRouter();

  // Stores
  const tables = useRestaurantStore((state) => state.tables) || [];
  const tickets = useRestaurantStore((state) => state.tickets) || [];
  const staff = useRestaurantStore((state) => state.staff) || [];
  const storeZones = useRestaurantStore((state) => state.zones) || [];
  const settleBill = useRestaurantStore((state) => state.settleBill);
  const serveTableTickets = useRestaurantStore((state) => state.serveTableTickets);
  const lastBillPaidAlert = useRestaurantStore((state) => state.lastBillPaidAlert);
  const clearBillPaidAlert = useRestaurantStore((state) => state.clearBillPaidAlert);

  const user = useAuthStore((state) => state.user);

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
    assignedZonesList.includes('All Floors') ||
    assignedZonesList.length === 0;

  // System-wide available floors from store and tables
  const systemFloors = sortFloors(
    Array.from(new Set([...storeZones, ...tables.map((t) => t.zone)].filter(Boolean)))
  );

  // Authorized floors for this specific Order Taker
  const authorizedFloors: string[] = isAllFloors ? systemFloors : assignedZonesList;

  // Active Floor Filter Tab
  const [selectedFloor, setSelectedFloor] = useState<string>('All');

  // Derive effective active floor:
  // If locked to a single floor, always lock to authorizedFloors[0].
  // Otherwise use selectedFloor if it's within authorizedFloors, or fallback to 'All'.
  const activeFloor =
    !isAllFloors && authorizedFloors.length === 1
      ? authorizedFloors[0]
      : selectedFloor !== 'All' && authorizedFloors.includes(selectedFloor)
      ? selectedFloor
      : 'All';

  // 3. Filter tables strictly based on Order Taker's assigned floor(s)
  const visibleTables = tables.filter((t) => {
    // Permission check: Table's floor must be authorized for this user
    if (!isAllFloors && !authorizedFloors.includes(t.zone)) {
      return false;
    }
    // Tab check: If user selected a specific floor tab
    if (activeFloor !== 'All' && t.zone !== activeFloor) {
      return false;
    }
    return true;
  });

  // 4. Filter ready tickets to only tables belonging to authorized floors
  const readyTickets = tickets.filter((t) => {
    if (t.status !== 'ready') return false;
    const targetTable = tables.find((tab) => tab.id === t.tableId);
    if (!targetTable) return true;
    if (!isAllFloors && !authorizedFloors.includes(targetTable.zone)) return false;
    return true;
  });

  const handleTablePress = (id: string) => {
    router.push(`/waiter/order/${id}`);
  };

  const renderTable = ({ item }: { item: typeof tables[0] }) => {
    const isOccupied = item.status === 'occupied';
    const isBilled = item.status === 'billed' || item.isPaid;

    // Check if this table has any active tickets in kitchen
    const tableTickets = tickets.filter((t) => t.tableId === item.id);
    const isFoodReady = tableTickets.some((t) => t.status === 'ready');
    const isCooking = tableTickets.some((t) => t.status === 'cooking');
    const roundCount = tableTickets.length;

    // Server (order taker) assigned to this table
    const assignedServer =
      item.server || (tableTickets.length > 0 ? tableTickets[tableTickets.length - 1].server : null);

    let statusColor = '#34C759'; // Available: Green
    if (isFoodReady) statusColor = '#007AFF'; // Food Ready: Blue
    else if (isBilled) statusColor = '#E67E22'; // Billed/Paid: Orange/Amber
    else if (isOccupied) statusColor = '#FF3B30'; // Occupied: Red
    else if (item.status === 'reserved') statusColor = '#5856D6'; // Reserved: Purple

    const floorMeta = getFloorMeta(item.zone);

    return (
      <TouchableOpacity
        style={[
          styles.tableCard,
          { borderTopColor: statusColor },
          isFoodReady && styles.tableCardFoodReady,
          isBilled && styles.tableCardBilled,
        ]}
        onPress={() => handleTablePress(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tableName}>{item.name}</Text>
            <View style={[styles.zoneBadge, { backgroundColor: (floorMeta.color || '#4a121a') + '15' }]}>
              <Ionicons
                name={floorMeta.icon || 'business-outline'}
                size={11}
                color={floorMeta.color || '#4a121a'}
              />
              <Text style={[styles.zoneBadgeText, { color: floorMeta.color || '#4a121a' }]} numberOfLines={1}>
                {item.zone || 'Main Hall'}
              </Text>
            </View>
          </View>
          <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.seatsRow}>
            <Ionicons name="people-outline" size={16} color="#8E8E93" />
            <Text style={styles.seatsText}>{item.seats} Seats</Text>
          </View>

          {/* Order Taker Assigned Badge */}
          {assignedServer && (isOccupied || isBilled) && (
            <View style={styles.waiterBadge}>
              <Ionicons name="person" size={12} color="#4a121a" style={{ marginRight: 4 }} />
              <Text style={styles.waiterBadgeText} numberOfLines={1}>{assignedServer}</Text>
            </View>
          )}

          {item.billTotal !== undefined && item.billTotal > 0 && (
            <Text style={styles.billText}>Rs. {item.billTotal.toFixed(0)}</Text>
          )}

          {/* Billed Notice */}
          {isBilled && (
            <View style={styles.billedPill}>
              <Ionicons name="checkmark-circle" size={13} color="#E67E22" />
              <Text style={styles.billedPillText}>BILL PAID • SEATED</Text>
            </View>
          )}

          {/* Kitchen Live Status Badge */}
          {isFoodReady && !isBilled && (
            <View style={styles.foodReadyPill}>
              <Ionicons name="restaurant" size={13} color="#007AFF" />
              <Text style={styles.foodReadyPillText}>
                {roundCount > 1 ? `FOOD READY (R#${roundCount})` : 'FOOD READY!'}
              </Text>
            </View>
          )}
          {isCooking && !isFoodReady && !isBilled && (
            <View style={styles.cookingPill}>
              <Ionicons name="flame" size={13} color="#FF9500" />
              <Text style={styles.cookingPillText}>
                {roundCount > 1 ? `Cooking (Round ${roundCount})` : 'In Kitchen...'}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.cardFooter, { backgroundColor: statusColor + '15' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {isFoodReady ? 'FOOD READY' : isBilled ? 'PAID (GUESTS SEATED)' : item.status.toUpperCase()}
            </Text>
            {assignedServer && (isOccupied || isBilled) && (
              <Text style={styles.serverFooterText} numberOfLines={1}>
                👤 {assignedServer}
              </Text>
            )}
          </View>
          {isFoodReady && !isBilled && (
            <TouchableOpacity
              style={styles.serveNowBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                serveTableTickets(item.id);
                broadcastImmediately();
                const msg = `Food served for ${item.name}!`;
                if (Platform.OS !== 'web') {
                  Alert.alert('Served', msg);
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="checkmark-done-circle"
                size={15}
                color="#fff"
                style={{ marginRight: 4 }}
              />
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
                  if (window.confirm(msg)) settleBill(item.id);
                } else {
                  Alert.alert('Release Table', msg, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Release', style: 'destructive', onPress: () => settleBill(item.id) },
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
    <View style={styles.container}>
      {/* Header Banner */}
      <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.screenTitle}>Order Taker Terminal</Text>
            <View style={styles.terminalBadge}>
              <Text style={styles.terminalBadgeText}>LIVE POS</Text>
            </View>
          </View>
          <Text style={styles.screenSubtitle}>
            Floor-based table orders & instant kitchen dispatch
          </Text>
        </View>
        <SyncStatusBadge />
      </View>

      {/* Floor Assignment Badge Banner */}
      <View style={styles.assignmentBanner}>
        <View style={styles.assignmentBannerLeft}>
          <View
            style={[
              styles.assignmentIconCircle,
              { backgroundColor: !isAllFloors ? '#E8F5E9' : '#EBF3FF' },
            ]}
          >
            <Ionicons
              name={!isAllFloors ? 'business' : 'grid'}
              size={18}
              color={!isAllFloors ? '#2E7D32' : '#007AFF'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.staffNameTitle}>{displayName}</Text>
              <View
                style={[
                  styles.floorLockBadge,
                  !isAllFloors ? styles.floorLockBadgeActive : styles.floorLockBadgeAll,
                ]}
              >
                <Ionicons
                  name={!isAllFloors ? 'lock-closed' : 'earth'}
                  size={11}
                  color={!isAllFloors ? '#2E7D32' : '#007AFF'}
                />
                <Text
                  style={[
                    styles.floorLockBadgeText,
                    !isAllFloors ? styles.floorLockBadgeTextActive : styles.floorLockBadgeTextAll,
                  ]}
                >
                  {!isAllFloors
                    ? `Assigned: ${authorizedFloors.join(', ')}`
                    : 'All Floors (Unrestricted)'}
                </Text>
              </View>
            </View>
            <Text style={styles.assignmentSubText}>
              Showing {visibleTables.length} table{visibleTables.length === 1 ? '' : 's'}{' '}
              {activeFloor === 'All' ? 'in your assigned zone' : `on ${activeFloor}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Floor Tabs Filter (if order taker has access to multiple floors or All Floors) */}
      {(isAllFloors || authorizedFloors.length > 1) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.floorTabsScroll}
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
              color={activeFloor === 'All' ? '#fff' : '#4a121a'}
            />
            <Text
              style={[
                styles.floorTabText,
                activeFloor === 'All' && styles.floorTabTextActive,
              ]}
            >
              All Assigned ({tables.filter((t) => isAllFloors || authorizedFloors.includes(t.zone)).length})
            </Text>
          </TouchableOpacity>

          {authorizedFloors.map((floor) => {
            const count = tables.filter((t) => t.zone === floor).length;
            const meta = getFloorMeta(floor);
            const isActive = activeFloor === floor;
            return (
              <TouchableOpacity
                key={floor}
                style={[
                  styles.floorTab,
                  isActive && {
                    backgroundColor: meta.color || '#4a121a',
                    borderColor: meta.color || '#4a121a',
                  },
                ]}
                onPress={() => setSelectedFloor(floor)}
              >
                <Ionicons
                  name={meta.icon || 'business-outline'}
                  size={13}
                  color={isActive ? '#fff' : meta.color || '#333'}
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
      )}

      {/* Real-time Bill Paid Alert Banner */}
      {lastBillPaidAlert && (
        <View style={styles.billPaidAlertBanner}>
          <View style={styles.billPaidIconBox}>
            <Ionicons name="card" size={20} color="#E67E22" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.billPaidAlertTitle}>
              🔔 Bill Paid: {lastBillPaidAlert.tableName}!
            </Text>
            <Text style={styles.billPaidAlertDesc}>
              Rs. {lastBillPaidAlert.billTotal?.toLocaleString()} collected. Guests are still seated — tap Release below when vacated.
            </Text>
          </View>
          <TouchableOpacity style={styles.billPaidDismissBtn} onPress={clearBillPaidAlert}>
            <Ionicons name="close" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* Notification banner if food is ready for this Order Taker's tables */}
      {readyTickets.length > 0 && (
        <View style={styles.readyAlertBanner}>
          <Ionicons name="notifications" size={20} color="#007AFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.readyAlertTitle}>
              {readyTickets.length} Order{readyTickets.length > 1 ? 's' : ''} Ready for Pickup!
            </Text>
            <Text style={styles.readyAlertDesc}>
              {readyTickets.map((t) => t.tableName).join(', ')} ready at the pass.
            </Text>
          </View>
        </View>
      )}

      {/* Table Grid */}
      {visibleTables.length > 0 ? (
        <FlatList
          data={visibleTables}
          keyExtractor={(item) => item.id}
          renderItem={renderTable}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.rowWrapper}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={48} color="#C7C7CC" />
          <Text style={styles.emptyTitle}>No tables found</Text>
          <Text style={styles.emptySubtitle}>
            There are no tables assigned to{' '}
            <Text style={{ fontWeight: '700', color: '#1C1C1E' }}>
              {activeFloor === 'All' ? authorizedFloors.join(', ') : activeFloor}
            </Text>
            . Please check Admin Floor Plan or switch floor.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#F8F9FA',
  },
  header: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
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
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  assignmentBanner: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  assignmentBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  assignmentIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffNameTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  floorLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  floorLockBadgeActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  floorLockBadgeAll: {
    backgroundColor: '#EBF3FF',
    borderWidth: 1,
    borderColor: '#D4E2F6',
  },
  floorLockBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  floorLockBadgeTextActive: {
    color: '#2E7D32',
  },
  floorLockBadgeTextAll: {
    color: '#007AFF',
  },
  assignmentSubText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 3,
  },
  floorTabsScroll: {
    marginBottom: 12,
  },
  floorTabsContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  floorTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  floorTabActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  floorTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4a121a',
  },
  floorTabTextActive: {
    color: '#fff',
  },
  readyAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F2FF',
    borderWidth: 1,
    borderColor: '#B8D7FF',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 14,
  },
  readyAlertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#007AFF',
  },
  readyAlertDesc: {
    fontSize: 12,
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
    marginBottom: 14,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#E67E22',
  },
  billPaidAlertDesc: {
    fontSize: 12,
    color: '#8D6E63',
    marginTop: 2,
    lineHeight: 16,
  },
  billPaidDismissBtn: {
    padding: 6,
  },
  listContent: {
    paddingBottom: 24,
  },
  rowWrapper: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tableCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderTopWidth: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginHorizontal: 5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  tableCardFoodReady: {
    borderColor: '#007AFF',
    borderWidth: 2,
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
    paddingBottom: 8,
  },
  tableName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  zoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  zoneBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    minHeight: 65,
    justifyContent: 'center',
  },
  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  seatsText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  waiterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F0E8',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  waiterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4a121a',
  },
  billText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 4,
  },
  billedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  billedPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E67E22',
    letterSpacing: 0.3,
  },
  foodReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F2FF',
    borderWidth: 1,
    borderColor: '#B8D7FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  foodReadyPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#007AFF',
    letterSpacing: 0.3,
  },
  cookingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  cookingPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FF9500',
  },
  cardFooter: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  serverFooterText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#636366',
    marginTop: 2,
  },
  serveNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  serveNowBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  releaseTableBtn: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  releaseTableBtnText: {
    color: '#fff',
    fontSize: 11,
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
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
