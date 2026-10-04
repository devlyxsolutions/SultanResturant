import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, Table, OrderItem } from '../../store/restaurantStore';
import InvoiceComponent from '../../components/Invoice';

type Zone = 'Main Hall' | 'Rooftop' | 'VIP';

// Define static positioning and shapes for the tables, combining with dynamic store data
const TABLE_LAYOUTS: Record<string, { x: number; y: number; shape: string }> = {
  '1': { x: 30, y: 80, shape: 'square' },
  '2': { x: 160, y: 80, shape: 'round' },
  '3': { x: 290, y: 80, shape: 'square' },
  '4': { x: 30, y: 220, shape: 'rectangle' },
  '5': { x: 220, y: 220, shape: 'round' },
  'R-01': { x: 60, y: 100, shape: 'square' },
  'V-01': { x: 80, y: 120, shape: 'rectangle' },
};

export default function FloorPlanScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const tables = useRestaurantStore((state) => state.tables);
  const settleBill = useRestaurantStore((state) => state.settleBill);

  const storeZones = useRestaurantStore((state) => state.zones);
  const zones: string[] = storeZones && storeZones.length > 0 ? storeZones : ['Main Hall', 'Rooftop', 'VIP'];

  const [activeZone, setActiveZone] = useState<string>('Main Hall');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [viewBillModalVisible, setViewBillModalVisible] = useState(false);
  const [billInvoice, setBillInvoice] = useState<any>(null);

  const effectiveActiveZone = zones.includes(activeZone) ? activeZone : (zones[0] || 'Main Hall');
  const currentZoneTables = tables.filter((t) => t.zone === effectiveActiveZone);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#34C759';
      case 'occupied':
        return '#FF3B30';
      case 'billed':
        return '#FF9500';
      case 'reserved':
        return '#5856D6';
      default:
        return '#ccc';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'available':
        return '#E8F5E9';
      case 'occupied':
        return '#FFEBEE';
      case 'billed':
        return '#FFF3E0';
      case 'reserved':
        return '#E8EAF6';
      default:
        return '#f5f5f5';
    }
  };

  const handleViewBill = (table: Table) => {
    const tickets = useRestaurantStore
      .getState()
      .tickets.filter((t) => t.tableId === table.id);
    let combinedItems: OrderItem[] = [];
    if (tickets.length > 0) {
      tickets.forEach((ticket) => {
        ticket.items.forEach((ti) => {
          const existing = combinedItems.find((i) => i.id === ti.id);
          if (existing) {
            existing.qty += ti.qty;
          } else {
            combinedItems.push({ ...ti });
          }
        });
      });
    } else if (table.orders && table.orders.length > 0) {
      combinedItems = table.orders.map(o => ({ ...o }));
    }
    const subTotal = combinedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const tax = subTotal * 0.16;
    const total = subTotal + tax;

    setBillInvoice({
      id: `INV-${table.id}-${Date.now().toString().slice(-4)}`,
      orderType: 'dine-in',
      server: table.server || 'Unknown',
      timePlaced: Date.now(),
      timeSettled: Date.now(),
      tableName: table.name,
      items: combinedItems,
      subTotal,
      discount: 0,
      tax,
      total,
      payments: [],
    });
    setViewBillModalVisible(true);
  };

  const renderTableDetailsContent = (table: Table) => (
    <ScrollView style={styles.detailsContent} showsVerticalScrollIndicator={false}>
      <View style={styles.detailsHeader}>
        <View>
          <Text style={styles.detailsTitle}>{table.name}</Text>
          <Text style={styles.detailsZone}>
            {table.zone} • {table.seats} Seats
          </Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: getStatusColor(table.status) }]}
        >
          <Text style={styles.statusText}>{table.status.toUpperCase()}</Text>
        </View>
      </View>

      {table.status === 'occupied' || table.status === 'billed' ? (
        <View style={styles.premiumCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="receipt-outline" size={24} color="#D5A943" />
            <Text style={styles.cardHeaderTitle}>Current Order</Text>
          </View>
          <View style={styles.billBox}>
            <Text style={styles.billLabel}>Total Amount</Text>
            <Text style={styles.billValue}>
              Rs. {(table.billTotal || 0).toFixed(0)}
            </Text>
          </View>
          <View style={styles.serverRow}>
            <Ionicons name="person-circle-outline" size={20} color="#666" />
            <Text style={styles.serverText}>
              Served by{' '}
              <Text style={{ fontWeight: 'bold', color: '#1C1C1E' }}>
                {table.server || 'Staff'}
              </Text>
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.actionsTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        {table.status === 'available' && (
          <>
            <TouchableOpacity
              style={styles.actionBtnSuccess}
              onPress={() => {
                setSelectedTable(null);
                router.push(`/manager/pos?prefillTableId=${table.id}`);
              }}
            >
              <Ionicons name="calculator-outline" size={20} color="#fff" />
              <Text style={styles.actionBtnTextSolid}>Start Order in POS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnSolid}
              onPress={() => {
                if (Platform.OS === 'web') window.alert(`${table.name} has been marked as reserved.`);
                else Alert.alert('Reserved', `${table.name} has been marked as reserved.`);
              }}
            >
              <Ionicons name="calendar-outline" size={20} color="#fff" />
              <Text style={styles.actionBtnTextSolid}>Reserve Table</Text>
            </TouchableOpacity>
          </>
        )}

        {(table.status === 'billed' || table.status === 'occupied') && (
          <>
            <TouchableOpacity
              style={styles.actionBtnSuccess}
              onPress={() => {
                setSelectedTable(null);
                router.push(`/manager/pos?prefillTableId=${table.id}`);
              }}
            >
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={styles.actionBtnTextSolid}>Checkout in POS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnOutline}
              onPress={() => {
                setSelectedTable(null);
                router.push(`/manager/pos?prefillTableId=${table.id}`);
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color="#1C1C1E" />
              <Text style={styles.actionBtnTextOutline}>Add Items in POS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnOutline}
              onPress={() => handleViewBill(table)}
            >
              <Ionicons name="eye-outline" size={20} color="#1C1C1E" />
              <Text style={styles.actionBtnTextOutline}>View Bill</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: '#e74c3c' }]}
              onPress={() => {
                const confirmMsg = `Release ${table.name}? Active tickets and running bill will be cleared.`;
                if (Platform.OS === 'web') {
                  if (window.confirm(confirmMsg)) {
                    settleBill(table.id);
                    setSelectedTable(null);
                  }
                } else {
                  Alert.alert('Release Table', confirmMsg, [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Release', 
                      style: 'destructive', 
                      onPress: () => {
                        settleBill(table.id);
                        setSelectedTable(null);
                      } 
                    }
                  ]);
                }
              }}
            >
              <Ionicons name="refresh-outline" size={20} color="#e74c3c" />
              <Text style={[styles.actionBtnTextOutline, { color: '#e74c3c' }]}>Release Table</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/manager/dashboard'))}
        >
          <View style={styles.backIconWrapper}>
            <Ionicons name="chevron-back" size={22} color="#1C1C1E" />
          </View>
          <Text style={[styles.headerTitle, isMobile && { fontSize: 20 }]}>Floor Plan</Text>
        </TouchableOpacity>

        <View style={[styles.legend, isMobile && styles.legendMobile]}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={styles.legendText}>Occupied</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF9500' }]} />
            <Text style={styles.legendText}>Billed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#5856D6' }]} />
            <Text style={styles.legendText}>Reserved</Text>
          </View>
        </View>
      </View>

      <View style={[styles.mainLayout, isMobile && { flexDirection: 'column' }]}>
        {/* Map Section */}
        <View style={[styles.mapSection, isMobile && { flex: 1 }]}>
          {/* Zone Tabs */}
          <View style={[styles.zoneTabs, isMobile && { padding: 12 }]}>
            {zones.map((z) => (
              <TouchableOpacity
                key={z}
                style={[
                  styles.zoneTab,
                  effectiveActiveZone === z && styles.zoneTabActive,
                  isMobile && { paddingHorizontal: 16, paddingVertical: 8 },
                ]}
                onPress={() => {
                  setActiveZone(z);
                  setSelectedTable(null);
                }}
              >
                <Text
                  style={[
                    styles.zoneTabText,
                    effectiveActiveZone === z && styles.zoneTabTextActive,
                    isMobile && { fontSize: 13 },
                  ]}
                >
                  {z}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Interactive Canvas */}
          <ScrollView
            horizontal={isMobile}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={isMobile ? { minWidth: 460, flexGrow: 1 } : { flex: 1 }}
          >
            <View style={[styles.canvasContainer, isMobile && { width: 460, minHeight: 450 }]}>
              <View style={styles.gridBackground} />
              {currentZoneTables.map((table, index) => {
                const layout = TABLE_LAYOUTS[table.id] || {
                  x: 30 + ((index % 3) * 140),
                  y: 60 + (Math.floor(index / 3) * 125),
                  shape: 'square',
                };
                const color = getStatusColor(table.status);
                const bgColor = getStatusBg(table.status);
                const isSelected = selectedTable?.id === table.id;

                let tableWidth = 85;
                let tableHeight = 85;
                let borderRadius = 16;

                if (layout.shape === 'round') borderRadius = 45;
                if (layout.shape === 'rectangle') tableWidth = 150;

                return (
                  <TouchableOpacity
                    key={table.id}
                    style={[
                      styles.tableShape,
                      {
                        left: layout.x,
                        top: layout.y,
                        width: tableWidth,
                        height: tableHeight,
                        borderRadius,
                        backgroundColor: bgColor,
                        borderColor: color,
                      },
                      isSelected && [styles.tableSelected, { shadowColor: color }],
                    ]}
                    onPress={() => setSelectedTable(table)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tableName, { color }]}>{table.name}</Text>
                    <View style={styles.seatsBadge}>
                      <Ionicons name="people" size={11} color="#666" />
                      <Text style={styles.tableSeats}>{table.seats}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Desktop Side Panel */}
        {!isMobile && (
          <View style={styles.detailsPanel}>
            {selectedTable ? (
              renderTableDetailsContent(selectedTable)
            ) : (
              <View style={styles.emptyDetails}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="grid-outline" size={48} color="#ccc" />
                </View>
                <Text style={styles.emptyDetailsTitle}>No Table Selected</Text>
                <Text style={styles.emptyDetailsText}>
                  Tap on any table on the blueprint to view its live status and manage orders.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Mobile Bottom Sheet Modal for Table Details */}
      {isMobile && (
        <Modal
          visible={!!selectedTable}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedTable(null)}
        >
          <View style={styles.mobileSheetOverlay}>
            <View style={styles.mobileSheetContent}>
              <View style={styles.mobileSheetTopBar}>
                <View style={styles.mobileSheetHandle} />
                <TouchableOpacity
                  onPress={() => setSelectedTable(null)}
                  style={styles.mobileSheetCloseBtn}
                >
                  <Ionicons name="close" size={22} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              {selectedTable && renderTableDetailsContent(selectedTable)}
            </View>
          </View>
        </Modal>
      )}

      {/* View Bill Modal */}
      <Modal visible={viewBillModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentLarge, isMobile && { padding: 14, width: '96%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Table Bill Receipt</Text>
              <TouchableOpacity onPress={() => setViewBillModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            {billInvoice && (
              <View style={styles.printPreviewContent}>
                <InvoiceComponent invoice={billInvoice} />
                <TouchableOpacity
                  style={styles.printBtn}
                  onPress={() => {
                    if (Platform.OS === 'web') window.print();
                    else Alert.alert('Print', 'Printing triggered.');
                  }}
                >
                  <Ionicons name="print-outline" size={20} color="#fff" />
                  <Text style={styles.printBtnText}>Print Bill</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
    }),
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  legendMobile: {
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  mapSection: {
    flex: 2,
    backgroundColor: '#F9F9FB',
  },
  zoneTabs: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  zoneTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  zoneTabActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  zoneTabText: {
    fontWeight: '700',
    color: '#8E8E93',
    fontSize: 14,
  },
  zoneTabTextActive: {
    color: '#fff',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  gridBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.35,
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(#d1d1d6 2px, transparent 2px)',
        backgroundSize: '30px 30px',
      },
    }),
  },
  tableShape: {
    position: 'absolute',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  tableSelected: {
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: 3,
    transform: [{ scale: 1.05 }],
  },
  tableName: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 2,
  },
  seatsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tableSeats: {
    fontSize: 11,
    color: '#666',
    fontWeight: 'bold',
    marginLeft: 3,
  },
  detailsPanel: {
    width: 380,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#F2F2F7',
  },
  detailsContent: {
    padding: 20,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  detailsTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  detailsZone: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  premiumCard: {
    backgroundColor: '#F9F9FB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F2F2F7',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  billBox: {
    marginBottom: 10,
  },
  billLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  billValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 2,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
  },
  serverText: {
    fontSize: 13,
    color: '#666',
  },
  actionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  actionsGrid: {
    gap: 10,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#fff',
  },
  actionBtnTextOutline: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  actionBtnSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
  },
  actionBtnTextSolid: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  actionBtnSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#34C759',
  },
  emptyDetails: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 10,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyDetailsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  emptyDetailsText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
  },
  // Mobile Bottom Sheet
  mobileSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  mobileSheetContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    maxHeight: '75%',
  },
  mobileSheetTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  mobileSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D1D6',
    alignSelf: 'center',
    position: 'absolute',
    left: '50%',
    marginLeft: -18,
    top: 8,
  },
  mobileSheetCloseBtn: {
    padding: 4,
    marginLeft: 'auto',
  },
  // Modal View Bill
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContentLarge: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  printPreviewContent: {
    alignItems: 'center',
    gap: 16,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4a121a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
  },
  printBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
