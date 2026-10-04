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
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, Table, OrderItem, Reservation } from '../../store/restaurantStore';
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

const TIME_SLOTS = [
  '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM',
  '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', 
  '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM'
];

export default function FloorPlanScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const tables = useRestaurantStore((state) => state.tables);
  const reservations = useRestaurantStore((state) => state.reservations || []);
  const settleBill = useRestaurantStore((state) => state.settleBill);
  const transferTable = useRestaurantStore((state) => state.transferTable);
  const mergeTables = useRestaurantStore((state) => state.mergeTables);
  const addReservation = useRestaurantStore((state) => state.addReservation);
  const seatReservation = useRestaurantStore((state) => state.seatReservation);
  const cancelReservation = useRestaurantStore((state) => state.cancelReservation);

  const storeZones = useRestaurantStore((state) => state.zones);
  const zones: string[] = storeZones && storeZones.length > 0 ? storeZones : ['Main Hall', 'Rooftop', 'VIP'];

  const [activeZone, setActiveZone] = useState<string>('Main Hall');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Bill Modal
  const [viewBillModalVisible, setViewBillModalVisible] = useState(false);
  const [billInvoice, setBillInvoice] = useState<any>(null);

  // Transfer Modal
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferToTableId, setTransferToTableId] = useState('');

  // Merge Modal
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeSecondaryTableId, setMergeSecondaryTableId] = useState('');

  // Reserve Modal
  const [reserveModalVisible, setReserveModalVisible] = useState(false);
  const [resCustomerName, setResCustomerName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resDate, setResDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [resTimeSlot, setResTimeSlot] = useState('08:00 PM');
  const [resGuestsCount, setResGuestsCount] = useState('4');
  const [resNotes, setResNotes] = useState('');

  const liveSelectedTable = selectedTableId ? tables.find(t => t.id === selectedTableId) || null : null;
  const effectiveActiveZone = zones.includes(activeZone) ? activeZone : (zones[0] || 'Main Hall');
  const currentZoneTables = tables.filter((t) => t.zone === effectiveActiveZone);

  const showNotification = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

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

  // --- Transfer Handlers ---
  const openTransferDialog = (table: Table) => {
    const avail = tables.find(t => t.status === 'available' && t.id !== table.id);
    setTransferToTableId(avail ? avail.id : '');
    setTransferModalVisible(true);
  };

  const handleConfirmTransfer = () => {
    if (!liveSelectedTable || !transferToTableId) {
      showNotification('Error', 'Please select a destination table');
      return;
    }
    const targetTable = tables.find(t => t.id === transferToTableId);
    if (!targetTable || targetTable.status !== 'available') {
      showNotification('Error', 'Target table is no longer available');
      return;
    }

    transferTable(liveSelectedTable.id, transferToTableId);
    showNotification('Success', `Transferred ${liveSelectedTable.name} to ${targetTable.name}`);
    setTransferModalVisible(false);
    setSelectedTableId(targetTable.id);
  };

  // --- Merge Handlers ---
  const openMergeDialog = (table: Table) => {
    const busy = tables.find(t => (t.status === 'occupied' || t.status === 'billed') && t.id !== table.id);
    setMergeSecondaryTableId(busy ? busy.id : '');
    setMergeModalVisible(true);
  };

  const handleConfirmMerge = () => {
    if (!liveSelectedTable || !mergeSecondaryTableId) {
      showNotification('Error', 'Please select a secondary table to merge');
      return;
    }
    const secTable = tables.find(t => t.id === mergeSecondaryTableId);
    if (!secTable) return;

    mergeTables(liveSelectedTable.id, mergeSecondaryTableId);
    showNotification('Success', `Merged ${secTable.name} into ${liveSelectedTable.name}`);
    setMergeModalVisible(false);
  };

  // --- Reservation Handlers ---
  const openReserveDialog = (table: Table) => {
    setResCustomerName('');
    setResPhone('');
    setResDate(new Date().toISOString().split('T')[0]);
    setResTimeSlot('08:00 PM');
    setResGuestsCount(table.seats ? table.seats.toString() : '4');
    setResNotes('');
    setReserveModalVisible(true);
  };

  const handleSaveReservation = () => {
    if (!liveSelectedTable || !resCustomerName.trim() || !resPhone.trim()) {
      showNotification('Incomplete Form', 'Please enter guest name and phone number');
      return;
    }
    const guests = parseInt(resGuestsCount, 10);
    if (isNaN(guests) || guests <= 0) {
      showNotification('Invalid Guests', 'Please enter a valid guest party size');
      return;
    }

    addReservation({
      tableId: liveSelectedTable.id,
      tableName: liveSelectedTable.name,
      customerName: resCustomerName.trim(),
      phone: resPhone.trim(),
      guestsCount: guests,
      reservationDate: resDate,
      timeSlot: resTimeSlot,
      notes: resNotes.trim(),
      status: 'confirmed',
    });

    showNotification('Confirmed', `${liveSelectedTable.name} reserved for ${resCustomerName} at ${resTimeSlot}.`);
    setReserveModalVisible(false);
  };

  const handleSeatGuests = (res: Reservation) => {
    seatReservation(res.id);
    showNotification('Guests Checked In', `${res.customerName} has been seated at ${res.tableName}.`);
  };

  const handleCancelReservation = (res: Reservation) => {
    const msg = `Cancel booking for ${res.customerName} at ${res.tableName}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) cancelReservation(res.id);
    } else {
      Alert.alert('Cancel Reservation', msg, [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancelReservation(res.id) }
      ]);
    }
  };

  const renderTableDetailsContent = (table: Table) => {
    const matchingReservation = reservations.find(r => r.tableId === table.id && r.status === 'confirmed');
    const isBusy = table.status === 'occupied' || table.status === 'billed';
    const isReserved = table.status === 'reserved';

    return (
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

        {/* Occupied or Billed Card */}
        {isBusy && (
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
            {table.status === 'billed' && (
              <View style={{ backgroundColor: '#FFF3E0', padding: 8, borderRadius: 8, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle" size={16} color="#E67E22" />
                <Text style={{ color: '#E67E22', fontWeight: '800', fontSize: 12 }}>
                  BILL PAID • GUESTS CURRENTLY SEATED
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Reserved Information Card */}
        {isReserved && (
          <View style={[styles.premiumCard, { borderColor: '#D7BDE2', backgroundColor: '#FDFEFE' }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="calendar" size={24} color="#5856D6" />
              <Text style={[styles.cardHeaderTitle, { color: '#5856D6' }]}>Reservation Details</Text>
            </View>
            {matchingReservation ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1C1C1E' }}>
                  {matchingReservation.customerName}
                </Text>
                <Text style={{ fontSize: 13, color: '#666' }}>
                  📞 {matchingReservation.phone}
                </Text>
                <Text style={{ fontSize: 13, color: '#666' }}>
                  📅 {matchingReservation.reservationDate} • ⏰ <Text style={{ fontWeight: '700', color: '#5856D6' }}>{matchingReservation.timeSlot}</Text>
                </Text>
                <Text style={{ fontSize: 13, color: '#666' }}>
                  👥 Party Size: <Text style={{ fontWeight: '700' }}>{matchingReservation.guestsCount} Guests</Text>
                </Text>
                {matchingReservation.notes ? (
                  <Text style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4 }}>
                    Note: "{matchingReservation.notes}"
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: '#666', fontSize: 13 }}>Table is marked as reserved.</Text>
            )}
          </View>
        )}

        <Text style={styles.actionsTitle}>Quick Floor Actions</Text>
        <View style={styles.actionsGrid}>
          {/* Reserved Table Actions */}
          {isReserved && (
            <>
              {matchingReservation && (
                <TouchableOpacity
                  style={styles.actionBtnSuccess}
                  onPress={() => handleSeatGuests(matchingReservation)}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.actionBtnTextSolid}>Seat Guests (Check-in)</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionBtnSolid}
                onPress={() => {
                  setSelectedTableId(null);
                  router.push(`/manager/pos?prefillTableId=${table.id}`);
                }}
              >
                <Ionicons name="calculator-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnTextSolid}>Open in POS</Text>
              </TouchableOpacity>

              {matchingReservation && (
                <TouchableOpacity
                  style={[styles.actionBtnOutline, { borderColor: '#e74c3c' }]}
                  onPress={() => handleCancelReservation(matchingReservation)}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#e74c3c" />
                  <Text style={[styles.actionBtnTextOutline, { color: '#e74c3c' }]}>Cancel Reservation</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Available Table Actions */}
          {table.status === 'available' && (
            <>
              <TouchableOpacity
                style={styles.actionBtnSuccess}
                onPress={() => {
                  setSelectedTableId(null);
                  router.push(`/manager/pos?prefillTableId=${table.id}`);
                }}
              >
                <Ionicons name="calculator-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnTextSolid}>Start Order in POS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtnSolid}
                onPress={() => openReserveDialog(table)}
              >
                <Ionicons name="calendar-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnTextSolid}>Reserve Table</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Busy Table Actions (Occupied or Billed) */}
          {isBusy && (
            <>
              <TouchableOpacity
                style={styles.actionBtnSuccess}
                onPress={() => {
                  setSelectedTableId(null);
                  router.push(`/manager/pos?prefillTableId=${table.id}`);
                }}
              >
                <Ionicons name="card-outline" size={20} color="#fff" />
                <Text style={styles.actionBtnTextSolid}>Checkout in POS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtnOutline}
                onPress={() => {
                  setSelectedTableId(null);
                  router.push(`/manager/pos?prefillTableId=${table.id}`);
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#1C1C1E" />
                <Text style={styles.actionBtnTextOutline}>Add Items in POS</Text>
              </TouchableOpacity>

              {/* Table Transfer Action */}
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: '#2980b9' }]}
                onPress={() => openTransferDialog(table)}
              >
                <Ionicons name="swap-horizontal-outline" size={20} color="#2980b9" />
                <Text style={[styles.actionBtnTextOutline, { color: '#2980b9' }]}>Transfer Table</Text>
              </TouchableOpacity>

              {/* Table Merge Action */}
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: '#8e44ad' }]}
                onPress={() => openMergeDialog(table)}
              >
                <Ionicons name="git-merge-outline" size={20} color="#8e44ad" />
                <Text style={[styles.actionBtnTextOutline, { color: '#8e44ad' }]}>Merge Tables</Text>
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
                      setSelectedTableId(null);
                    }
                  } else {
                    Alert.alert('Release Table', confirmMsg, [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Release', 
                        style: 'destructive', 
                        onPress: () => {
                          settleBill(table.id);
                          setSelectedTableId(null);
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
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Visual Floor Plan</Text>
          <Text style={styles.subtitle}>
            Tap table to Transfer, Merge, Reserve, or launch POS Live Orders
          </Text>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: getStatusColor('available') }]} />
            <Text style={styles.legendText}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: getStatusColor('occupied') }]} />
            <Text style={styles.legendText}>Occupied</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: getStatusColor('billed') }]} />
            <Text style={styles.legendText}>Billed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: getStatusColor('reserved') }]} />
            <Text style={styles.legendText}>Reserved</Text>
          </View>
        </View>
      </View>

      {/* Main Floor Workspace */}
      <View style={styles.workspace}>
        {/* Visual Blueprint Area */}
        <View style={styles.blueprintContainer}>
          {/* Zone Selector Tabs */}
          <View style={styles.zoneTabs}>
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
                  setSelectedTableId(null);
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
                const isSelected = liveSelectedTable?.id === table.id;

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
                    onPress={() => setSelectedTableId(table.id)}
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
            {liveSelectedTable ? (
              renderTableDetailsContent(liveSelectedTable)
            ) : (
              <View style={styles.emptyDetails}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="grid-outline" size={48} color="#ccc" />
                </View>
                <Text style={styles.emptyDetailsTitle}>No Table Selected</Text>
                <Text style={styles.emptyDetailsText}>
                  Tap on any table on the blueprint to view its live status, transfer, merge, or reserve.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Mobile Bottom Sheet Modal for Table Details */}
      {isMobile && (
        <Modal
          visible={!!liveSelectedTable}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedTableId(null)}
        >
          <View style={styles.mobileSheetOverlay}>
            <View style={styles.mobileSheetContent}>
              <View style={styles.mobileSheetTopBar}>
                <View style={styles.mobileSheetHandle} />
                <TouchableOpacity
                  onPress={() => setSelectedTableId(null)}
                  style={styles.mobileSheetCloseBtn}
                >
                  <Ionicons name="close" size={22} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              {liveSelectedTable && renderTableDetailsContent(liveSelectedTable)}
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

      {/* Floor Plan Transfer Table Modal */}
      <Modal visible={transferModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentForm}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="swap-horizontal" size={24} color="#2980b9" />
              <Text style={styles.formModalTitle}>Transfer Table</Text>
            </View>

            {liveSelectedTable && (
              <View style={styles.summaryBanner}>
                <Text style={{ fontSize: 13, color: '#666' }}>From Table:</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#1C1C1E', marginTop: 2 }}>
                  {liveSelectedTable.name} ({liveSelectedTable.zone}) — Rs. {(liveSelectedTable.billTotal || 0).toLocaleString()}
                </Text>
              </View>
            )}

            <Text style={[styles.formLabel, { marginTop: 12 }]}>Select Available Destination Table:</Text>
            <View style={styles.targetGrid}>
              {tables
                .filter(t => t.status === 'available')
                .map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.targetCard,
                      transferToTableId === t.id && styles.targetCardActive
                    ]}
                    onPress={() => setTransferToTableId(t.id)}
                  >
                    <Ionicons 
                      name="restaurant" 
                      size={18} 
                      color={transferToTableId === t.id ? '#fff' : '#27ae60'} 
                    />
                    <Text style={[
                      styles.targetCardName,
                      transferToTableId === t.id && styles.targetCardNameActive
                    ]}>
                      {t.name}
                    </Text>
                    <Text style={[
                      styles.targetCardSub,
                      transferToTableId === t.id && styles.targetCardSubActive
                    ]}>
                      {t.zone} ({t.seats}s)
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            {tables.filter(t => t.status === 'available').length === 0 && (
              <Text style={{ color: '#e74c3c', fontSize: 13, fontStyle: 'italic', marginVertical: 8 }}>
                No available tables at the moment.
              </Text>
            )}

            <View style={styles.formActions}>
              <TouchableOpacity 
                style={styles.formCancelBtn} 
                onPress={() => setTransferModalVisible(false)}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.formSaveBtn, { backgroundColor: '#2980b9' }]} 
                onPress={handleConfirmTransfer}
              >
                <Text style={styles.formSaveText}>Transfer Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floor Plan Merge Tables Modal */}
      <Modal visible={mergeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentForm}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="git-merge-outline" size={24} color="#8e44ad" />
              <Text style={styles.formModalTitle}>Merge Tables</Text>
            </View>

            {liveSelectedTable && (
              <View style={[styles.summaryBanner, { backgroundColor: '#F4ECF7', borderColor: '#D7BDE2' }]}>
                <Text style={{ fontSize: 13, color: '#666' }}>Primary Table:</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#4a121a', marginTop: 2 }}>
                  {liveSelectedTable.name} ({liveSelectedTable.zone}) — Rs. {(liveSelectedTable.billTotal || 0).toLocaleString()}
                </Text>
              </View>
            )}

            <Text style={[styles.formLabel, { marginTop: 12 }]}>Select Table to Merge into {liveSelectedTable?.name}:</Text>
            <View style={styles.targetGrid}>
              {tables
                .filter(t => (t.status === 'occupied' || t.status === 'billed') && t.id !== liveSelectedTable?.id)
                .map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.targetCard,
                      mergeSecondaryTableId === t.id && styles.targetCardActive
                    ]}
                    onPress={() => setMergeSecondaryTableId(t.id)}
                  >
                    <Ionicons 
                      name="layers" 
                      size={18} 
                      color={mergeSecondaryTableId === t.id ? '#fff' : '#8e44ad'} 
                    />
                    <Text style={[
                      styles.targetCardName,
                      mergeSecondaryTableId === t.id && styles.targetCardNameActive
                    ]}>
                      {t.name}
                    </Text>
                    <Text style={[
                      styles.targetCardSub,
                      mergeSecondaryTableId === t.id && styles.targetCardSubActive
                    ]}>
                      Rs. {(t.billTotal || 0).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            {tables.filter(t => (t.status === 'occupied' || t.status === 'billed') && t.id !== liveSelectedTable?.id).length === 0 && (
              <Text style={{ color: '#888', fontSize: 13, fontStyle: 'italic', marginVertical: 8 }}>
                No other occupied tables found to merge.
              </Text>
            )}

            <View style={styles.formActions}>
              <TouchableOpacity 
                style={styles.formCancelBtn} 
                onPress={() => setMergeModalVisible(false)}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.formSaveBtn, { backgroundColor: '#8e44ad' }]} 
                onPress={handleConfirmMerge}
              >
                <Text style={styles.formSaveText}>Confirm Merge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floor Plan Reserve Table Modal */}
      <Modal visible={reserveModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentForm}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="calendar" size={24} color="#5856D6" />
              <Text style={styles.formModalTitle}>Reserve {liveSelectedTable?.name}</Text>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Guest Name:</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Full Name"
                value={resCustomerName}
                onChangeText={setResCustomerName}
              />

              <Text style={styles.formLabel}>Phone Number:</Text>
              <TextInput
                style={styles.formInput}
                placeholder="0300-1234567"
                value={resPhone}
                onChangeText={setResPhone}
                keyboardType="phone-pad"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Date:</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="YYYY-MM-DD"
                    value={resDate}
                    onChangeText={setResDate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Guests:</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Party Size"
                    value={resGuestsCount}
                    onChangeText={setResGuestsCount}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.formLabel}>Select Time Slot:</Text>
              <View style={styles.timeSlotRow}>
                {TIME_SLOTS.map(slot => (
                  <TouchableOpacity
                    key={slot}
                    style={[
                      styles.timeSlotPill,
                      resTimeSlot === slot && styles.timeSlotPillActive
                    ]}
                    onPress={() => setResTimeSlot(slot)}
                  >
                    <Text style={[
                      styles.timeSlotPillText,
                      resTimeSlot === slot && styles.timeSlotPillTextActive
                    ]}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Special Notes (Optional):</Text>
              <TextInput
                style={[styles.formInput, { height: 55 }]}
                placeholder="Window seat, anniversary, etc."
                value={resNotes}
                onChangeText={setResNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.formActions}>
              <TouchableOpacity 
                style={styles.formCancelBtn} 
                onPress={() => setReserveModalVisible(false)}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.formSaveBtn, { backgroundColor: '#5856D6' }]} 
                onPress={handleSaveReservation}
              >
                <Text style={styles.formSaveText}>Save Reservation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  workspace: {
    flex: 1,
    flexDirection: 'row',
  },
  blueprintContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  zoneTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
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
  // Forms & Modal Dialogs
  modalContentForm: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
  },
  formModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  summaryBanner: {
    backgroundColor: '#EBF5FB',
    borderColor: '#AED6F1',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 11,
    marginBottom: 12,
    fontSize: 15,
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  targetCard: {
    backgroundColor: '#F8F9F9',
    borderWidth: 1.5,
    borderColor: '#E5E7E9',
    borderRadius: 8,
    padding: 10,
    minWidth: 88,
    alignItems: 'center',
    gap: 3,
  },
  targetCardActive: {
    backgroundColor: '#2980b9',
    borderColor: '#1f618d',
  },
  targetCardName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  targetCardNameActive: {
    color: '#FFFFFF',
  },
  targetCardSub: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  targetCardSubActive: {
    color: '#EBF5FB',
  },
  timeSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  timeSlotPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
  },
  timeSlotPillActive: {
    backgroundColor: '#5856D6',
  },
  timeSlotPillText: {
    fontSize: 12,
    color: '#666',
  },
  timeSlotPillTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  formCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  formCancelText: {
    color: '#8E8E93',
    fontWeight: '600',
    fontSize: 15,
  },
  formSaveBtn: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  formSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
