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
import { broadcastImmediately } from '../../services/syncService';

const TABLE_LAYOUTS: Record<string, { x: number; y: number; shape: 'square' | 'round' | 'rectangle' }> = {
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
  const tickets = useRestaurantStore((state) => state.tickets || []);
  const reservations = useRestaurantStore((state) => state.reservations || []);
  const settleBill = useRestaurantStore((state) => state.settleBill);
  const serveTableTickets = useRestaurantStore((state) => state.serveTableTickets);
  const transferTable = useRestaurantStore((state) => state.transferTable);
  const mergeTables = useRestaurantStore((state) => state.mergeTables);
  const addReservation = useRestaurantStore((state) => state.addReservation);
  const seatReservation = useRestaurantStore((state) => state.seatReservation);
  const cancelReservation = useRestaurantStore((state) => state.cancelReservation);
  const addTable = useRestaurantStore((state) => state.addTable);
  const updateTable = useRestaurantStore((state) => state.updateTable);
  const deleteTable = useRestaurantStore((state) => state.deleteTable);

  const storeZones = useRestaurantStore((state) => state.zones);
  const zones: string[] = storeZones && storeZones.length > 0 ? storeZones : ['Main Hall', 'Rooftop', 'VIP'];

  const [activeZone, setActiveZone] = useState<string>('Main Hall');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Layout Move Mode Settings
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [moveStep, setMoveStep] = useState<number>(20);

  // Add / Edit Table Modal State
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formName, setFormName] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formSeats, setFormSeats] = useState('4');
  const [formShape, setFormShape] = useState<'square' | 'round' | 'rectangle'>('square');

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
  const [resLinkedIds, setResLinkedIds] = useState<string[]>([]);

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

  const getTableEffectiveStatus = (table: Table) => {
    const tableTickets = (tickets || []).filter(t => t.tableId === table.id);
    if (tableTickets.some(t => t.status === 'ready')) return 'ready';
    if (table.status === 'billed' || table.isPaid) return 'billed';
    if (table.status === 'occupied' || tableTickets.some(t => t.status === 'cooking')) return 'occupied';
    if (table.status === 'reserved') return 'reserved';
    return 'available';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return '#007AFF'; // Food Ready: Blue
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
      case 'ready':
        return '#E3F2FD';
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

  // --- Move & Position Functions ---
  const handleNudgeTable = (dx: number, dy: number) => {
    if (!liveSelectedTable) {
      showNotification('Select Table', 'Please tap a table on the floor plan to move it.');
      return;
    }
    const currentX = liveSelectedTable.x ?? (TABLE_LAYOUTS[liveSelectedTable.id]?.x ?? 30);
    const currentY = liveSelectedTable.y ?? (TABLE_LAYOUTS[liveSelectedTable.id]?.y ?? 80);
    const newX = Math.max(10, Math.min(650, currentX + dx));
    const newY = Math.max(10, Math.min(550, currentY + dy));
    updateTable(liveSelectedTable.id, { x: newX, y: newY });
  };

  const handleChangeTableShape = (shape: 'square' | 'round' | 'rectangle') => {
    if (!liveSelectedTable) return;
    updateTable(liveSelectedTable.id, { shape });
  };

  // --- Add / Edit / Delete Table Functions ---
  const openAddTableDialog = () => {
    setEditingTable(null);
    setFormName('');
    setFormZone(effectiveActiveZone);
    setFormSeats('4');
    setFormShape('square');
    setTableModalVisible(true);
  };

  const openEditTableDialog = (table: Table) => {
    setEditingTable(table);
    setFormName(table.name);
    setFormZone(table.zone);
    setFormSeats(table.seats ? table.seats.toString() : '4');
    setFormShape(table.shape || 'square');
    setTableModalVisible(true);
  };

  const handleSaveTableForm = () => {
    if (!formName.trim() || !formZone.trim()) {
      showNotification('Missing Information', 'Please provide table name and select zone.');
      return;
    }
    const seatsNum = parseInt(formSeats, 10);
    if (isNaN(seatsNum) || seatsNum <= 0) {
      showNotification('Invalid Seats', 'Seat count must be a positive number.');
      return;
    }

    if (editingTable) {
      updateTable(editingTable.id, {
        name: formName.trim(),
        zone: formZone.trim(),
        seats: seatsNum,
        shape: formShape,
      });
      showNotification('Table Updated', `Table ${formName.trim()} settings updated.`);
    } else {
      const zoneCount = currentZoneTables.length;
      const newX = 30 + ((zoneCount % 3) * 140);
      const newY = 60 + (Math.floor(zoneCount / 3) * 125);

      addTable({
        name: formName.trim(),
        zone: formZone.trim(),
        seats: seatsNum,
        status: 'available',
        x: newX,
        y: newY,
        shape: formShape,
      });
      showNotification('Table Added', `Table ${formName.trim()} added to ${formZone}.`);
    }
    setTableModalVisible(false);
  };

  const handleDeleteTable = (table: Table) => {
    if (table.status !== 'available') {
      showNotification('Cannot Delete', `Table ${table.name} is currently ${table.status}. Clear it first.`);
      return;
    }
    const msg = `Are you sure you want to remove ${table.name} from the floor?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        deleteTable(table.id);
        setSelectedTableId(null);
      }
    } else {
      Alert.alert('Delete Table', msg, [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => {
            deleteTable(table.id);
            setSelectedTableId(null);
          } 
        }
      ]);
    }
  };

  // --- Bill Receipt Handler ---
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

  // --- Reservation Handlers with Multi-Table Merge ---
  const openReserveDialog = (table: Table) => {
    setResCustomerName('');
    setResPhone('');
    setResDate(new Date().toISOString().split('T')[0]);
    setResTimeSlot('08:00 PM');
    setResGuestsCount(table.seats ? table.seats.toString() : '4');
    setResNotes('');
    setResLinkedIds([]);
    setReserveModalVisible(true);
  };

  const toggleLinkedTable = (tableId: string) => {
    setResLinkedIds(prev => 
      prev.includes(tableId) ? prev.filter(id => id !== tableId) : [...prev, tableId]
    );
  };

  const autoFitTables = () => {
    if (!liveSelectedTable) return;
    const targetGuests = parseInt(resGuestsCount, 10) || 4;
    let currentCapacity = liveSelectedTable.seats;
    if (currentCapacity >= targetGuests) {
      setResLinkedIds([]);
      showNotification('Capacity OK', `${liveSelectedTable.name} already seats ${liveSelectedTable.seats} guests.`);
      return;
    }

    const availableOtherTables = tables
      .filter(t => t.id !== liveSelectedTable.id && t.status === 'available')
      .sort((a, b) => {
        const aSameZone = a.zone === liveSelectedTable.zone ? 0 : 1;
        const bSameZone = b.zone === liveSelectedTable.zone ? 0 : 1;
        return aSameZone - bSameZone || b.seats - a.seats;
      });

    const selected: string[] = [];
    for (const t of availableOtherTables) {
      if (currentCapacity >= targetGuests) break;
      selected.push(t.id);
      currentCapacity += t.seats;
    }

    setResLinkedIds(selected);
    if (currentCapacity < targetGuests) {
      showNotification('Notice', `Selected all available tables, capacity is ${currentCapacity} seats (needs ${targetGuests}).`);
    } else {
      showNotification('Tables Matched', `Combined ${selected.length + 1} tables for ${currentCapacity} seats.`);
    }
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

    const linkedNames = resLinkedIds.map(id => tables.find(t => t.id === id)?.name).filter(Boolean);
    const combinedTableName = linkedNames.length > 0
      ? `${liveSelectedTable.name} + ${linkedNames.join(' + ')}`
      : liveSelectedTable.name;

    addReservation({
      tableId: liveSelectedTable.id,
      tableName: combinedTableName,
      linkedTableIds: resLinkedIds,
      customerName: resCustomerName.trim(),
      phone: resPhone.trim(),
      guestsCount: guests,
      reservationDate: resDate,
      timeSlot: resTimeSlot,
      notes: resNotes.trim(),
      status: 'confirmed',
    });

    showNotification('Confirmed', `${combinedTableName} reserved for ${resCustomerName} at ${resTimeSlot}.`);
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
    const matchingReservation = reservations.find(
      r => r.status === 'confirmed' && (r.id === table.reservationId || r.tableId === table.id)
    );
    const effectiveStatus = getTableEffectiveStatus(table);
    const isBusy = table.status === 'occupied' || table.status === 'billed' || effectiveStatus === 'ready' || effectiveStatus === 'occupied';
    const isReady = effectiveStatus === 'ready';
    const isReserved = table.status === 'reserved';
    const isMergedChild = !!table.mergedInto;
    const parentTable = isMergedChild ? tables.find(t => t.id === table.mergedInto) : null;

    return (
      <ScrollView style={styles.detailsContent} showsVerticalScrollIndicator={false}>
        <View style={styles.detailsHeader}>
          <View>
            <Text style={styles.detailsTitle}>{table.name}</Text>
            <Text style={styles.detailsZone}>
              {table.zone} • {table.seats} Seats • Shape: {table.shape || 'square'}
            </Text>
          </View>
          <View
            style={[styles.statusBadge, { backgroundColor: getStatusColor(effectiveStatus) }]}
          >
            <Text style={styles.statusText}>{effectiveStatus === 'ready' ? 'FOOD READY' : table.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* Merged indicator */}
        {isMergedChild && parentTable && (
          <View style={styles.mergedBanner}>
            <Ionicons name="link" size={16} color="#4F46E5" />
            <Text style={styles.mergedBannerText}>
              Joined with {parentTable.name} (Big Party / Merged Order)
            </Text>
          </View>
        )}

        {/* Occupied or Billed Card */}
        {isBusy && !isMergedChild && (
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
                {matchingReservation.linkedTableIds && matchingReservation.linkedTableIds.length > 0 && (
                  <Text style={{ fontSize: 12, color: '#4F46E5', fontWeight: '700' }}>
                    🔗 Merged Tables: {matchingReservation.tableName}
                  </Text>
                )}
                {matchingReservation.notes ? (
                  <Text style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4 }}>
                    Note: &ldquo;{matchingReservation.notes}&rdquo;
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
                <Text style={styles.actionBtnTextSolid}>Reserve (Merge Tables)</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Busy Table Actions (Occupied, Food Ready, or Billed) */}
          {isBusy && !isMergedChild && (
            <>
              {isReady && (
                <TouchableOpacity
                  style={[styles.actionBtnSolid, { backgroundColor: '#007AFF' }]}
                  onPress={() => {
                    serveTableTickets(table.id);
                    broadcastImmediately();
                    showNotification('Food Served', `All ready orders marked as served for ${table.name}!`);
                  }}
                >
                  <Ionicons name="checkmark-done-circle-outline" size={20} color="#fff" />
                  <Text style={styles.actionBtnTextSolid}>Mark All as Served</Text>
                </TouchableOpacity>
              )}

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

              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: '#2980b9' }]}
                onPress={() => openTransferDialog(table)}
              >
                <Ionicons name="swap-horizontal-outline" size={20} color="#2980b9" />
                <Text style={[styles.actionBtnTextOutline, { color: '#2980b9' }]}>Transfer Table</Text>
              </TouchableOpacity>

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

          {/* Table Management Settings Actions */}
          <View style={styles.divider} />
          <Text style={styles.settingsSubHeader}>Table Layout & Settings</Text>

          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: '#D5A943' }]}
            onPress={() => openEditTableDialog(table)}
          >
            <Ionicons name="pencil-outline" size={18} color="#D5A943" />
            <Text style={[styles.actionBtnTextOutline, { color: '#D5A943' }]}>Edit Table Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: '#5856D6' }]}
            onPress={() => setIsMoveMode(true)}
          >
            <Ionicons name="move-outline" size={18} color="#5856D6" />
            <Text style={[styles.actionBtnTextOutline, { color: '#5856D6' }]}>Move & Reposition</Text>
          </TouchableOpacity>

          {table.status === 'available' && (
            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: '#e74c3c' }]}
              onPress={() => handleDeleteTable(table)}
            >
              <Ionicons name="trash-outline" size={18} color="#e74c3c" />
              <Text style={[styles.actionBtnTextOutline, { color: '#e74c3c' }]}>Delete Table</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  };

  // Reservation capacity summary
  const targetGuestsNum = parseInt(resGuestsCount, 10) || 4;
  const primarySeats = liveSelectedTable?.seats || 0;
  const linkedSeats = resLinkedIds.reduce((sum, id) => {
    const t = tables.find(item => item.id === id);
    return sum + (t?.seats || 0);
  }, 0);
  const totalCombinedSeats = primarySeats + linkedSeats;
  const capacityMet = totalCombinedSeats >= targetGuestsNum;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={styles.title}>Visual Floor Plan</Text>
          <Text style={styles.subtitle}>
            Tap table to Transfer, Merge, Reserve, or launch POS Live Orders
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerBtn, isMoveMode && styles.headerBtnMoveActive]}
            onPress={() => setIsMoveMode(!isMoveMode)}
            activeOpacity={0.8}
          >
            <Ionicons name={isMoveMode ? 'checkmark-circle' : 'move'} size={17} color="#fff" />
            <Text style={styles.headerBtnText}>
              {isMoveMode ? 'Done Moving' : 'Move Tables'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: '#4a121a' }]}
            onPress={openAddTableDialog}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.headerBtnText}>+ Add Table</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Move Mode Active Warning Bar */}
      {isMoveMode && (
        <View style={styles.moveModeBar}>
          <Ionicons name="hand-left" size={18} color="#D5A943" />
          <Text style={styles.moveModeBarText}>
            Move Mode Active • Select any table on the blueprint and use the keypad below to position it.
          </Text>
          <TouchableOpacity 
            style={styles.moveModeCloseBtn}
            onPress={() => setIsMoveMode(false)}
          >
            <Text style={styles.moveModeCloseText}>Exit</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legendBar}>
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
            <View style={[styles.legendDot, { backgroundColor: '#007AFF' }]} />
            <Text style={styles.legendText}>Food Ready</Text>
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
                const layout = {
                  x: table.x ?? (TABLE_LAYOUTS[table.id]?.x ?? (30 + ((index % 3) * 140))),
                  y: table.y ?? (TABLE_LAYOUTS[table.id]?.y ?? (60 + (Math.floor(index / 3) * 125))),
                  shape: table.shape ?? (TABLE_LAYOUTS[table.id]?.shape ?? 'square'),
                };
                const effectiveStatus = getTableEffectiveStatus(table);
                const color = getStatusColor(effectiveStatus);
                const bgColor = getStatusBg(effectiveStatus);
                const isSelected = liveSelectedTable?.id === table.id;

                let tableWidth = 85;
                let tableHeight = 85;
                let borderRadius = 16;

                if (layout.shape === 'round') borderRadius = 45;
                if (layout.shape === 'rectangle') tableWidth = 145;

                return (
                  <TouchableOpacity
                    key={`${table.id}-${table.name}-${index}`}
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
                      isMoveMode && styles.tableMoveModeBorder,
                    ]}
                    onPress={() => setSelectedTableId(table.id)}
                    activeOpacity={0.8}
                  >
                    {isMoveMode && (
                      <View style={styles.moveHandleBadge}>
                        <Ionicons name="move" size={10} color="#fff" />
                      </View>
                    )}
                    {effectiveStatus === 'ready' && (
                      <View style={styles.readyFloaterBadge}>
                        <Ionicons name="restaurant" size={9} color="#fff" />
                        <Text style={styles.readyFloaterText}>READY</Text>
                      </View>
                    )}
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

          {/* D-Pad Floating Move Controller (When Move Mode is ON) */}
          {isMoveMode && (
            <View style={styles.dpadContainer}>
              <View style={styles.dpadHeader}>
                <Text style={styles.dpadTitle}>
                  {liveSelectedTable ? `Moving ${liveSelectedTable.name}` : 'Tap table to move'}
                </Text>
                <View style={styles.stepToggle}>
                  <TouchableOpacity 
                    style={[styles.stepPill, moveStep === 10 && styles.stepPillActive]}
                    onPress={() => setMoveStep(10)}
                  >
                    <Text style={[styles.stepPillText, moveStep === 10 && styles.stepPillTextActive]}>10px</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.stepPill, moveStep === 30 && styles.stepPillActive]}
                    onPress={() => setMoveStep(30)}
                  >
                    <Text style={[styles.stepPillText, moveStep === 30 && styles.stepPillTextActive]}>30px</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.dpadControlsRow}>
                {/* D-Pad Buttons */}
                <View style={styles.dpadCross}>
                  <TouchableOpacity 
                    style={[styles.dpadBtn, styles.dpadUp]} 
                    onPress={() => handleNudgeTable(0, -moveStep)}
                  >
                    <Ionicons name="chevron-up" size={20} color="#1C1C1E" />
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 26 }}>
                    <TouchableOpacity 
                      style={[styles.dpadBtn, styles.dpadLeft]} 
                      onPress={() => handleNudgeTable(-moveStep, 0)}
                    >
                      <Ionicons name="chevron-back" size={20} color="#1C1C1E" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.dpadBtn, styles.dpadRight]} 
                      onPress={() => handleNudgeTable(moveStep, 0)}
                    >
                      <Ionicons name="chevron-forward" size={20} color="#1C1C1E" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity 
                    style={[styles.dpadBtn, styles.dpadDown]} 
                    onPress={() => handleNudgeTable(0, moveStep)}
                  >
                    <Ionicons name="chevron-down" size={20} color="#1C1C1E" />
                  </TouchableOpacity>
                </View>

                {/* Shape Selector for Selected Table */}
                {liveSelectedTable && (
                  <View style={styles.dpadShapeBox}>
                    <Text style={styles.dpadShapeLabel}>Table Shape:</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(['square', 'round', 'rectangle'] as const).map(sh => (
                        <TouchableOpacity
                          key={sh}
                          style={[
                            styles.shapePill,
                            (liveSelectedTable.shape || 'square') === sh && styles.shapePillActive
                          ]}
                          onPress={() => handleChangeTableShape(sh)}
                        >
                          <Text style={[
                            styles.shapePillText,
                            (liveSelectedTable.shape || 'square') === sh && styles.shapePillTextActive
                          ]}>
                            {sh.charAt(0).toUpperCase() + sh.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}
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
          visible={!!liveSelectedTable && !isMoveMode}
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
              <ScrollView contentContainerStyle={[styles.printPreviewContent, { paddingVertical: 12 }]}>
                <InvoiceComponent invoice={billInvoice} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add / Edit Table Modal */}
      <Modal visible={tableModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentForm}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Ionicons name="restaurant" size={22} color="#4a121a" />
              <Text style={styles.formModalTitle}>
                {editingTable ? `Edit ${editingTable.name}` : 'Add New Table'}
              </Text>
            </View>

            <Text style={styles.formLabel}>Table Name / Code:</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. T-07, VIP-02"
              value={formName}
              onChangeText={setFormName}
            />

            <Text style={styles.formLabel}>Floor Zone:</Text>
            <View style={styles.timeSlotRow}>
              {zones.map(z => (
                <TouchableOpacity
                  key={z}
                  style={[
                    styles.timeSlotPill,
                    formZone === z && { backgroundColor: '#4a121a' }
                  ]}
                  onPress={() => setFormZone(z)}
                >
                  <Text style={[
                    styles.timeSlotPillText,
                    formZone === z && { color: '#fff', fontWeight: 'bold' }
                  ]}>
                    {z}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Seats Capacity:</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 4"
              value={formSeats}
              onChangeText={setFormSeats}
              keyboardType="numeric"
            />

            <Text style={styles.formLabel}>Table Shape:</Text>
            <View style={styles.timeSlotRow}>
              {(['square', 'round', 'rectangle'] as const).map(sh => (
                <TouchableOpacity
                  key={sh}
                  style={[
                    styles.timeSlotPill,
                    formShape === sh && { backgroundColor: '#5856D6' }
                  ]}
                  onPress={() => setFormShape(sh)}
                >
                  <Text style={[
                    styles.timeSlotPillText,
                    formShape === sh && { color: '#fff', fontWeight: 'bold' }
                  ]}>
                    {sh.charAt(0).toUpperCase() + sh.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity 
                style={styles.formCancelBtn} 
                onPress={() => setTableModalVisible(false)}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.formSaveBtn, { backgroundColor: '#4a121a' }]} 
                onPress={handleSaveTableForm}
              >
                <Text style={styles.formSaveText}>
                  {editingTable ? 'Update Table' : 'Save Table'}
                </Text>
              </TouchableOpacity>
            </View>
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

      {/* Floor Plan Reserve Table Modal (with Multi-Table Merge!) */}
      <Modal visible={reserveModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentForm, { maxWidth: 520 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="calendar" size={24} color="#5856D6" />
              <Text style={styles.formModalTitle}>Reserve {liveSelectedTable?.name}</Text>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
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
                  <Text style={styles.formLabel}>Guests (Party Size):</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 6"
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

              {/* Multi-Table Merge Section */}
              <View style={styles.mergeSectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Merge More Tables (Big Party):</Text>
                  <Text style={styles.subtext}>Join other free tables to seat larger groups.</Text>
                </View>
                <TouchableOpacity style={styles.autoFitBtn} onPress={autoFitTables}>
                  <Ionicons name="sparkles" size={13} color="#4F46E5" />
                  <Text style={styles.autoFitBtnText}>Auto-Fit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.targetGrid}>
                {tables
                  .filter(t => t.id !== liveSelectedTable?.id && t.status === 'available')
                  .map(t => {
                    const isLinked = resLinkedIds.includes(t.id);
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.targetCard,
                          isLinked && { backgroundColor: '#4F46E5', borderColor: '#3730A3' }
                        ]}
                        onPress={() => toggleLinkedTable(t.id)}
                      >
                        {isLinked && (
                          <View style={styles.linkedCheckBadge}>
                            <Ionicons name="checkmark" size={10} color="#4F46E5" />
                          </View>
                        )}
                        <Text style={[
                          styles.targetCardName,
                          isLinked && { color: '#fff' }
                        ]}>
                          {t.name}
                        </Text>
                        <Text style={[
                          styles.targetCardSub,
                          isLinked && { color: '#E0E7FF' }
                        ]}>
                          {t.zone} ({t.seats}s)
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>

              {/* Capacity Banner */}
              <View style={[
                styles.capacityNotice,
                { backgroundColor: capacityMet ? '#E8F8F5' : '#FDEDEC', borderColor: capacityMet ? '#27ae60' : '#e74c3c' }
              ]}>
                <Ionicons 
                  name={capacityMet ? 'checkmark-circle' : 'alert-circle'} 
                  size={18} 
                  color={capacityMet ? '#27ae60' : '#e74c3c'} 
                />
                <Text style={{ 
                  color: capacityMet ? '#27ae60' : '#e74c3c', 
                  fontWeight: '700', 
                  fontSize: 13,
                  flex: 1 
                }}>
                  {totalCombinedSeats} seats selected for {targetGuestsNum} guests {capacityMet ? '(Capacity satisfied)' : `(Short by ${targetGuestsNum - totalCombinedSeats})`}
                </Text>
              </View>

              <Text style={[styles.formLabel, { marginTop: 10 }]}>Special Notes (Optional):</Text>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#5856D6',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  headerBtnMoveActive: {
    backgroundColor: '#E67E22',
  },
  headerBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  moveModeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF9E7',
    borderBottomWidth: 1,
    borderBottomColor: '#FAD7A0',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  moveModeBarText: {
    fontSize: 12,
    color: '#7D6608',
    fontWeight: '700',
    flex: 1,
  },
  moveModeCloseBtn: {
    backgroundColor: '#E67E22',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  moveModeCloseText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  legendBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
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
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
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
    position: 'relative',
  },
  zoneTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  zoneTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
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
    fontSize: 13,
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
  tableMoveModeBorder: {
    borderStyle: 'dashed',
  },
  moveHandleBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#E67E22',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyFloaterBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  readyFloaterText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  tableName: {
    fontSize: 17,
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
  // Floating D-Pad Move Controller
  dpadContainer: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  dpadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  dpadTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  stepToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  stepPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
  },
  stepPillActive: {
    backgroundColor: '#5856D6',
  },
  stepPillText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '700',
  },
  stepPillTextActive: {
    color: '#fff',
  },
  dpadControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dpadCross: {
    alignItems: 'center',
    gap: 4,
  },
  dpadBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadUp: {},
  dpadDown: {},
  dpadLeft: {},
  dpadRight: {},
  dpadShapeBox: {
    gap: 6,
  },
  dpadShapeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  shapePill: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
  },
  shapePillActive: {
    backgroundColor: '#1C1C1E',
  },
  shapePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  shapePillTextActive: {
    color: '#fff',
  },
  // Details Panel
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
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  detailsZone: {
    fontSize: 13,
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
  mergedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  mergedBannerText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 12,
    flex: 1,
  },
  premiumCard: {
    backgroundColor: '#F9F9FB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 8,
  },
  settingsSubHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
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
  subtext: {
    fontSize: 11,
    color: '#8E8E93',
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
    position: 'relative',
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
  linkedCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
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
  mergeSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  autoFitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  autoFitBtnText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 12,
  },
  capacityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
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
