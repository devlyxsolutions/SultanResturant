import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore } from '../../store/restaurantStore';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import { broadcastImmediately } from '../../services/syncService';

export default function TablesScreen() {
  const router = useRouter();
  const tables = useRestaurantStore((state) => state.tables);
  const tickets = useRestaurantStore((state) => state.tickets);
  const settleBill = useRestaurantStore((state) => state.settleBill);
  const serveTableTickets = useRestaurantStore((state) => state.serveTableTickets);
  const lastBillPaidAlert = useRestaurantStore((state) => state.lastBillPaidAlert);
  const clearBillPaidAlert = useRestaurantStore((state) => state.clearBillPaidAlert);

  const readyTickets = tickets.filter((t) => t.status === 'ready');

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

    // Server (waiter) assigned to this table
    // Prefer item.server, fallback to the latest ticket's server
    const assignedServer = item.server 
      || (tableTickets.length > 0 ? tableTickets[tableTickets.length - 1].server : null);

    let statusColor = '#34C759'; // Available: Green
    if (isFoodReady) statusColor = '#007AFF'; // Food Ready: Blue
    else if (isBilled) statusColor = '#E67E22'; // Billed/Paid: Orange/Amber
    else if (isOccupied) statusColor = '#FF3B30'; // Occupied: Red
    else if (item.status === 'reserved') statusColor = '#5856D6'; // Reserved: Purple

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
          <Text style={styles.tableName}>{item.name}</Text>
          <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.seatsRow}>
            <Ionicons name="people-outline" size={16} color="#8E8E93" />
            <Text style={styles.seatsText}>{item.seats} Seats</Text>
          </View>

          {/* Waiter Assigned Badge */}
          {assignedServer && (isOccupied || isBilled) && (
            <View style={styles.waiterBadge}>
              <Ionicons name="person" size={12} color="#4a121a" style={{ marginRight: 4 }} />
              <Text style={styles.waiterBadgeText}>{assignedServer}</Text>
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
              {isFoodReady ? 'FOOD READY' : (isBilled ? 'PAID (GUESTS SEATED)' : item.status.toUpperCase())}
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
              <Ionicons name="checkmark-done-circle" size={15} color="#fff" style={{ marginRight: 4 }} />
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

  return (
    <View style={styles.container}>
      {/* Header Banner */}
      <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Table Service</Text>
          <Text style={styles.screenSubtitle}>Tap a table to take order or manage bill</Text>
        </View>
        <SyncStatusBadge />
      </View>

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
          <TouchableOpacity
            style={styles.billPaidDismissBtn}
            onPress={clearBillPaidAlert}
          >
            <Ionicons name="close" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* Notification banner if food is ready */}
      {readyTickets.length > 0 && (
        <View style={styles.readyAlertBanner}>
          <Ionicons name="notifications" size={20} color="#007AFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.readyAlertTitle}>
              {readyTickets.length} Order{readyTickets.length > 1 ? 's' : ''} Ready for Pickup!
            </Text>
            <Text style={styles.readyAlertDesc}>
              {readyTickets.map((t) => t.tableName).join(', ')} is ready at the pass.
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={tables}
        keyExtractor={(item) => item.id}
        renderItem={renderTable}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.rowWrapper}
        showsVerticalScrollIndicator={false}
      />
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
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
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
    marginBottom: 16,
  },
  readyAlertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#007AFF',
  },
  readyAlertDesc: {
    fontSize: 12,
    color: '#0055B3',
    marginTop: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  rowWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tableCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 16,
    borderTopWidth: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 10px rgba(0,0,0,0.04)' },
    }),
  },
  tableCardFoodReady: {
    borderColor: '#007AFF',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tableName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardBody: {
    paddingHorizontal: 16,
    marginBottom: 14,
    minHeight: 46,
    justifyContent: 'center',
  },
  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  seatsText: {
    fontSize: 13,
    color: '#8E8E93',
    marginLeft: 6,
    fontWeight: '500',
  },
  billText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  foodReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  foodReadyPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#007AFF',
  },
  cookingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF4E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  cookingPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF9500',
  },
  tableCardBilled: {
    borderColor: '#E67E22',
    borderWidth: 1.5,
  },
  billedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  billedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E67E22',
  },
  serveNowBtn: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  serveNowBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  releaseTableBtn: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 10,
  },
  releaseTableBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
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
    marginBottom: 16,
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
  cardFooter: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  waiterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F0E8',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  waiterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4a121a',
  },
  serverFooterText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#636366',
    marginTop: 2,
  },
});
