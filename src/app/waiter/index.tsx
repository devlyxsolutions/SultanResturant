import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore } from '../../store/restaurantStore';
import SyncStatusBadge from '../../components/SyncStatusBadge';

export default function TablesScreen() {
  const router = useRouter();
  const tables = useRestaurantStore((state) => state.tables);
  const tickets = useRestaurantStore((state) => state.tickets);

  const readyTickets = tickets.filter((t) => t.status === 'ready');

  const handleTablePress = (id: string) => {
    router.push(`/waiter/order/${id}`);
  };

  const renderTable = ({ item }: { item: typeof tables[0] }) => {
    const isOccupied = item.status === 'occupied';

    // Check if this table has any active tickets in kitchen
    const tableTickets = tickets.filter((t) => t.tableId === item.id);
    const isFoodReady = tableTickets.some((t) => t.status === 'ready');
    const isCooking = tableTickets.some((t) => t.status === 'cooking');
    const roundCount = tableTickets.length;

    let statusColor = '#34C759'; // Available: Green
    if (isFoodReady) statusColor = '#007AFF'; // Food Ready: Blue
    else if (isOccupied) statusColor = '#FF3B30'; // Occupied: Red
    else if (item.status === 'billed') statusColor = '#FFCC00'; // Billed: Yellow
    else if (item.status === 'reserved') statusColor = '#5856D6'; // Reserved: Purple

    return (
      <TouchableOpacity
        style={[
          styles.tableCard,
          { borderTopColor: statusColor },
          isFoodReady && styles.tableCardFoodReady,
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

          {item.billTotal !== undefined && item.billTotal > 0 && (
            <Text style={styles.billText}>Rs. {item.billTotal.toFixed(0)}</Text>
          )}

          {/* Kitchen Live Status Badge */}
          {isFoodReady && (
            <View style={styles.foodReadyPill}>
              <Ionicons name="restaurant" size={13} color="#007AFF" />
              <Text style={styles.foodReadyPillText}>
                {roundCount > 1 ? `FOOD READY (R#${roundCount})` : 'FOOD READY!'}
              </Text>
            </View>
          )}
          {isCooking && !isFoodReady && (
            <View style={styles.cookingPill}>
              <Ionicons name="flame" size={13} color="#FF9500" />
              <Text style={styles.cookingPillText}>
                {roundCount > 1 ? `Cooking (Round ${roundCount})` : 'In Kitchen...'}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.cardFooter, { backgroundColor: statusColor + '15' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {isFoodReady ? 'SERVE NOW' : item.status.toUpperCase()}
          </Text>
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
  cardFooter: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
