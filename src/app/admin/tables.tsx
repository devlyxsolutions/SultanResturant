import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Modal, 
  Alert, 
  Platform 
} from 'react-native';
import { useRestaurantStore, Table, Reservation } from '../../store/restaurantStore';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AdminTables() {
  const router = useRouter();
  const tables = useRestaurantStore((state) => state.tables);
  const zones = useRestaurantStore((state) => state.zones);
  const tickets = useRestaurantStore((state) => state.tickets);
  const reservations = useRestaurantStore((state) => state.reservations || []);

  const addTable = useRestaurantStore((state) => state.addTable);
  const updateTable = useRestaurantStore((state) => state.updateTable);
  const deleteTable = useRestaurantStore((state) => state.deleteTable);
  
  const addZone = useRestaurantStore((state) => state.addZone);
  const deleteZone = useRestaurantStore((state) => state.deleteZone);

  const settleBill = useRestaurantStore((state) => state.settleBill);
  const transferTable = useRestaurantStore((state) => state.transferTable);
  const mergeTables = useRestaurantStore((state) => state.mergeTables);
  const addReservation = useRestaurantStore((state) => state.addReservation);
  const updateReservation = useRestaurantStore((state) => state.updateReservation);
  const cancelReservation = useRestaurantStore((state) => state.cancelReservation);
  const seatReservation = useRestaurantStore((state) => state.seatReservation);

  const [activeTab, setActiveTab] = useState<'tables' | 'reservations' | 'zones'>('tables');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'billed' | 'reserved'>('all');
  const [resFilter, setResFilter] = useState<'all' | 'confirmed' | 'seated' | 'cancelled'>('all');

  // --- Table Modal State ---
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formName, setFormName] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formSeats, setFormSeats] = useState('');

  // --- Zone Modal State ---
  const [zoneModalVisible, setZoneModalVisible] = useState(false);
  const [formNewZone, setFormNewZone] = useState('');

  // --- Transfer Modal State ---
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferFromTable, setTransferFromTable] = useState<Table | null>(null);
  const [transferToTableId, setTransferToTableId] = useState('');

  // --- Merge Modal State ---
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergePrimaryTable, setMergePrimaryTable] = useState<Table | null>(null);
  const [mergeSecondaryTableId, setMergeSecondaryTableId] = useState('');

  // --- Reservation Modal State ---
  const [reservationModalVisible, setReservationModalVisible] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [resCustomerName, setResCustomerName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resTableId, setResTableId] = useState('');
  const [resDate, setResDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [resTimeSlot, setResTimeSlot] = useState('08:00 PM');
  const [resGuestsCount, setResGuestsCount] = useState('4');
  const [resNotes, setResNotes] = useState('');

  const TIME_SLOTS = [
    '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM',
    '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', 
    '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM'
  ];

  // Helper alerts
  const showNotification = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // --- Table Functions ---
  const openAddTableModal = () => {
    setEditingTable(null);
    setFormName('');
    setFormZone(zones[0] || '');
    setFormSeats('');
    setTableModalVisible(true);
  };

  const openEditTableModal = (table: Table) => {
    setEditingTable(table);
    setFormName(table.name);
    setFormZone(table.zone);
    setFormSeats(table.seats.toString());
    setTableModalVisible(true);
  };

  const handleSaveTable = () => {
    if (!formName.trim() || !formZone.trim() || !formSeats.trim()) {
      showNotification('Error', 'Please fill all fields');
      return;
    }

    const seatsNum = parseInt(formSeats, 10);
    if (isNaN(seatsNum) || seatsNum <= 0) {
      showNotification('Error', 'Seats must be a positive number');
      return;
    }

    if (editingTable) {
      updateTable(editingTable.id, {
        name: formName.trim(),
        zone: formZone.trim(),
        seats: seatsNum,
      });
    } else {
      addTable({
        name: formName.trim(),
        zone: formZone.trim(),
        seats: seatsNum,
        status: 'available',
      });
    }
    setTableModalVisible(false);
  };

  const handleDeleteTable = (id: string) => {
    const table = tables.find(t => t.id === id);
    if (table && (table.status === 'occupied' || table.status === 'billed')) {
      showNotification('Cannot Delete', `Table ${table.name} has an active order. Please clear or checkout first.`);
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this table?')) {
        deleteTable(id);
      }
    } else {
      Alert.alert('Delete Table', 'Are you sure you want to delete this table?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTable(id) }
      ]);
    }
  };

  const handleClearTable = (table: Table) => {
    const confirmMsg = `Are you sure you want to clear & release ${table.name}? Active tickets and running bill will be reset.`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        settleBill(table.id);
      }
    } else {
      Alert.alert('Clear Table', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear & Release', style: 'destructive', onPress: () => settleBill(table.id) }
      ]);
    }
  };

  // --- Table Transfer Functions ---
  const openTransferModal = (table: Table) => {
    setTransferFromTable(table);
    // Find first available target table that is not the same
    const firstAvailable = tables.find(t => t.status === 'available' && t.id !== table.id);
    setTransferToTableId(firstAvailable ? firstAvailable.id : '');
    setTransferModalVisible(true);
  };

  const handleConfirmTransfer = () => {
    if (!transferFromTable || !transferToTableId) {
      showNotification('Error', 'Please select a destination table');
      return;
    }

    const toTable = tables.find(t => t.id === transferToTableId);
    if (!toTable || toTable.status !== 'available') {
      showNotification('Error', 'Selected target table is no longer available');
      return;
    }

    transferTable(transferFromTable.id, transferToTableId);
    showNotification('Success', `Table ${transferFromTable.name} orders successfully transferred to ${toTable.name}`);
    setTransferModalVisible(false);
    setTransferFromTable(null);
    setTransferToTableId('');
  };

  // --- Table Merge Functions ---
  const openMergeModal = (table: Table) => {
    setMergePrimaryTable(table);
    // Find other busy tables that can be merged
    const otherBusy = tables.find(t => (t.status === 'occupied' || t.status === 'billed') && t.id !== table.id);
    setMergeSecondaryTableId(otherBusy ? otherBusy.id : '');
    setMergeModalVisible(true);
  };

  const handleConfirmMerge = () => {
    if (!mergePrimaryTable || !mergeSecondaryTableId) {
      showNotification('Error', 'Please select a second table to merge');
      return;
    }

    const secTable = tables.find(t => t.id === mergeSecondaryTableId);
    if (!secTable) {
      showNotification('Error', 'Selected secondary table not found');
      return;
    }

    mergeTables(mergePrimaryTable.id, mergeSecondaryTableId);
    showNotification('Tables Merged', `Orders from ${secTable.name} have been merged into ${mergePrimaryTable.name}. ${secTable.name} is now available.`);
    setMergeModalVisible(false);
    setMergePrimaryTable(null);
    setMergeSecondaryTableId('');
  };

  // --- Reservation Functions ---
  const openAddReservationModal = (prefillTableId?: string) => {
    setEditingReservation(null);
    setResCustomerName('');
    setResPhone('');
    setResTableId(prefillTableId || tables.find(t => t.status === 'available')?.id || (tables[0]?.id || ''));
    setResDate(new Date().toISOString().split('T')[0]);
    setResTimeSlot('08:00 PM');
    setResGuestsCount('4');
    setResNotes('');
    setReservationModalVisible(true);
  };

  const openEditReservationModal = (res: Reservation) => {
    setEditingReservation(res);
    setResCustomerName(res.customerName);
    setResPhone(res.phone);
    setResTableId(res.tableId);
    setResDate(res.reservationDate);
    setResTimeSlot(res.timeSlot);
    setResGuestsCount(res.guestsCount.toString());
    setResNotes(res.notes || '');
    setReservationModalVisible(true);
  };

  const handleSaveReservation = () => {
    if (!resCustomerName.trim() || !resPhone.trim() || !resTableId) {
      showNotification('Incomplete Form', 'Please provide guest name, phone number, and assign a table.');
      return;
    }

    const guests = parseInt(resGuestsCount, 10);
    if (isNaN(guests) || guests <= 0) {
      showNotification('Invalid Guests', 'Please enter a valid guest party size.');
      return;
    }

    const targetTable = tables.find(t => t.id === resTableId);
    const tableName = targetTable ? targetTable.name : `Table ${resTableId}`;

    if (editingReservation) {
      updateReservation(editingReservation.id, {
        customerName: resCustomerName.trim(),
        phone: resPhone.trim(),
        tableId: resTableId,
        tableName,
        reservationDate: resDate,
        timeSlot: resTimeSlot,
        guestsCount: guests,
        notes: resNotes.trim(),
      });
      showNotification('Updated', 'Reservation details updated successfully.');
    } else {
      addReservation({
        tableId: resTableId,
        tableName,
        customerName: resCustomerName.trim(),
        phone: resPhone.trim(),
        guestsCount: guests,
        reservationDate: resDate,
        timeSlot: resTimeSlot,
        notes: resNotes.trim(),
        status: 'confirmed',
      });
      showNotification('Confirmed', `Table ${tableName} reserved for ${resCustomerName} at ${resTimeSlot}.`);
    }

    setReservationModalVisible(false);
  };

  const handleSeatGuests = (res: Reservation) => {
    const msg = `Check in ${res.customerName} (${res.guestsCount} guests) at ${res.tableName}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        seatReservation(res.id);
        showNotification('Guests Seated', `${res.customerName} has been seated at ${res.tableName}.`);
      }
    } else {
      Alert.alert('Check-in Guests', msg, [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Seat Guests', 
          onPress: () => {
            seatReservation(res.id);
            showNotification('Guests Seated', `${res.customerName} has been seated at ${res.tableName}.`);
          } 
        }
      ]);
    }
  };

  const handleCancelBooking = (res: Reservation) => {
    const msg = `Cancel reservation for ${res.customerName} at ${res.tableName}? The table will be made available.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        cancelReservation(res.id);
      }
    } else {
      Alert.alert('Cancel Reservation', msg, [
        { text: 'No', style: 'cancel' },
        { text: 'Cancel Booking', style: 'destructive', onPress: () => cancelReservation(res.id) }
      ]);
    }
  };

  // --- Zone Functions ---
  const handleSaveZone = () => {
    if (!formNewZone.trim()) {
      showNotification('Error', 'Zone name cannot be empty');
      return;
    }
    
    if (zones.includes(formNewZone.trim())) {
      showNotification('Error', 'Zone already exists');
      return;
    }

    addZone(formNewZone.trim());
    setZoneModalVisible(false);
    setFormNewZone('');
  };

  const handleDeleteZone = (zoneName: string) => {
    const isZoneUsed = tables.some(t => t.zone === zoneName);
    if (isZoneUsed) {
      showNotification('Error', `Cannot delete '${zoneName}' because it has tables assigned to it.`);
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete zone '${zoneName}'?`)) {
        deleteZone(zoneName);
      }
    } else {
      Alert.alert('Delete', `Delete zone '${zoneName}'?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteZone(zoneName) }
      ]);
    }
  };

  // Metrics
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  const availableCount = tables.filter(t => t.status === 'available').length;
  const billedCount = tables.filter(t => t.status === 'billed').length;
  const reservedCount = tables.filter(t => t.status === 'reserved').length;
  const totalActiveRevenue = tables
    .filter(t => t.status === 'occupied' || t.status === 'billed')
    .reduce((sum, t) => sum + (t.billTotal || 0), 0);

  // Reservation Metrics
  const confirmedResCount = reservations.filter(r => r.status === 'confirmed').length;
  const seatedResCount = reservations.filter(r => r.status === 'seated').length;
  const cancelledResCount = reservations.filter(r => r.status === 'cancelled').length;

  const filteredTables = tables.filter(t => {
    if (statusFilter === 'available') return t.status === 'available';
    if (statusFilter === 'occupied') return t.status === 'occupied';
    if (statusFilter === 'billed') return t.status === 'billed';
    if (statusFilter === 'reserved') return t.status === 'reserved';
    return true;
  });

  const filteredReservations = reservations.filter(r => {
    if (resFilter === 'confirmed') return r.status === 'confirmed';
    if (resFilter === 'seated') return r.status === 'seated';
    if (resFilter === 'cancelled') return r.status === 'cancelled';
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#27ae60';
      case 'occupied': return '#e74c3c';
      case 'billed': return '#f39c12';
      case 'reserved': return '#8e44ad';
      default: return '#7f8c8d';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Table & Floor Management</Text>
          <Text style={styles.subtitle}>Directly synced with POS, Floor Plan & Live Kitchen KDS</Text>
        </View>
        <View style={styles.headerActions}>
          {activeTab === 'tables' && (
            <TouchableOpacity style={styles.addButton} onPress={openAddTableModal}>
              <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.addButtonText}>Add Table</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'reservations' && (
            <TouchableOpacity style={[styles.addButton, { backgroundColor: '#8e44ad' }]} onPress={() => openAddReservationModal()}>
              <Ionicons name="calendar" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.addButtonText}>New Reservation</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'zones' && (
            <TouchableOpacity style={[styles.addButton, styles.addButtonSecondary]} onPress={() => { setFormNewZone(''); setZoneModalVisible(true); }}>
              <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
              <Text style={[styles.addButtonText, styles.addButtonTextSecondary]}>Add Zone</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Live Table Metrics Bar */}
      <View style={styles.metricsBar}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Tables</Text>
          <Text style={styles.metricValue}>{tables.length}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#27ae60' }]}>
          <Text style={styles.metricLabel}>Available</Text>
          <Text style={[styles.metricValue, { color: '#27ae60' }]}>{availableCount}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#e74c3c' }]}>
          <Text style={styles.metricLabel}>Occupied</Text>
          <Text style={[styles.metricValue, { color: '#e74c3c' }]}>{occupiedCount}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#8e44ad' }]}>
          <Text style={styles.metricLabel}>Reserved</Text>
          <Text style={[styles.metricValue, { color: '#8e44ad' }]}>{reservedCount}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#f39c12' }]}>
          <Text style={styles.metricLabel}>Active Dine-In Bill</Text>
          <Text style={[styles.metricValue, { color: '#4a121a' }]}>Rs. {totalActiveRevenue.toLocaleString()}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'tables' && styles.activeTab]} 
          onPress={() => setActiveTab('tables')}
        >
          <Ionicons name="grid-outline" size={17} color={activeTab === 'tables' ? '#4a121a' : '#666'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'tables' && styles.activeTabText]}>
            Tables ({tables.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'reservations' && styles.activeTab]} 
          onPress={() => setActiveTab('reservations')}
        >
          <Ionicons name="calendar-outline" size={17} color={activeTab === 'reservations' ? '#4a121a' : '#666'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'reservations' && styles.activeTabText]}>
            Reservations ({confirmedResCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'zones' && styles.activeTab]} 
          onPress={() => setActiveTab('zones')}
        >
          <Ionicons name="map-outline" size={17} color={activeTab === 'zones' ? '#4a121a' : '#666'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'zones' && styles.activeTabText]}>
            Zones ({zones.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab 1: Tables List */}
      {activeTab === 'tables' && (
        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
          {/* Status Filter Bar */}
          <View style={styles.filterPillsRow}>
            {(['all', 'available', 'occupied', 'billed', 'reserved'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.statusFilterPill, statusFilter === f && styles.statusFilterPillActive]}
                onPress={() => setStatusFilter(f)}
              >
                <Text style={[styles.statusFilterPillText, statusFilter === f && styles.statusFilterPillTextActive]}>
                  {f === 'all' ? `All (${tables.length})` 
                    : f === 'available' ? `Available (${availableCount})` 
                    : f === 'occupied' ? `Occupied (${occupiedCount})` 
                    : f === 'billed' ? `Billed (${billedCount})` 
                    : `Reserved (${reservedCount})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredTables.map((table) => {
            const tableTickets = tickets.filter(t => t.tableId === table.id);
            const isBusy = table.status === 'occupied' || table.status === 'billed';
            const isReserved = table.status === 'reserved';
            const statusColor = getStatusColor(table.status);
            const matchingReservation = reservations.find(r => r.tableId === table.id && r.status === 'confirmed');

            return (
              <View key={table.id} style={styles.tableCard}>
                <View style={styles.tableMainRow}>
                  {/* Left Column: Info */}
                  <View style={styles.tableInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.tableName}>{table.name}</Text>
                      <View style={[styles.badge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
                        <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.badgeText, { color: statusColor }]}>
                          {table.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.tableMeta}>
                      Zone: <Text style={{ fontWeight: '700', color: '#1C1C1E' }}>{table.zone}</Text> • Seats: {table.seats}
                      {table.server ? ` • Server: ${table.server}` : ''}
                    </Text>

                    {/* Active Order Details */}
                    {isBusy && (
                      <View style={styles.runningOrderRow}>
                        <Text style={styles.runningBillText}>
                          Live Bill: <Text style={{ color: '#4a121a', fontWeight: '900' }}>Rs. {(table.billTotal || 0).toLocaleString()}</Text>
                        </Text>
                        <Text style={styles.ticketsCountText}>
                          • {tableTickets.length > 0 ? `${tableTickets.length} active KOT(s) in kitchen` : `${table.orders?.length || 0} order item(s)`}
                        </Text>
                      </View>
                    )}

                    {/* Reservation Notice */}
                    {isReserved && matchingReservation && (
                      <View style={styles.reservationInfoBox}>
                        <Ionicons name="calendar" size={14} color="#8e44ad" />
                        <Text style={styles.reservationInfoText}>
                          Booked for <Text style={{ fontWeight: '800' }}>{matchingReservation.customerName}</Text> • {matchingReservation.timeSlot} ({matchingReservation.guestsCount} guests)
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Right Column: Actions Group */}
                  <View style={styles.posActionsGroup}>
                    {isBusy && (
                      <>
                        <TouchableOpacity 
                          style={styles.checkoutPosBtn} 
                          onPress={() => router.push(`/admin/pos?prefillTableId=${table.id}`)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="card" size={14} color="#fff" style={{ marginRight: 4 }} />
                          <Text style={styles.posBtnTextWhite}>Checkout</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.addOrderPosBtn} 
                          onPress={() => router.push(`/admin/pos?prefillTableId=${table.id}`)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add-circle" size={14} color="#000" style={{ marginRight: 4 }} />
                          <Text style={styles.posBtnTextDark}>Add Items</Text>
                        </TouchableOpacity>

                        {/* Transfer Table Button */}
                        <TouchableOpacity 
                          style={styles.transferBtn} 
                          onPress={() => openTransferModal(table)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="swap-horizontal" size={15} color="#2980b9" style={{ marginRight: 4 }} />
                          <Text style={styles.transferBtnText}>Transfer</Text>
                        </TouchableOpacity>

                        {/* Merge Table Button */}
                        <TouchableOpacity 
                          style={styles.mergeBtn} 
                          onPress={() => openMergeModal(table)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="git-merge-outline" size={15} color="#8e44ad" style={{ marginRight: 4 }} />
                          <Text style={styles.mergeBtnText}>Merge</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.clearTableBtn} 
                          onPress={() => handleClearTable(table)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="refresh" size={13} color="#e74c3c" />
                          <Text style={styles.clearTableText}>Clear</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {isReserved && matchingReservation && (
                      <>
                        <TouchableOpacity 
                          style={styles.seatGuestsBtn}
                          onPress={() => handleSeatGuests(matchingReservation)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark-circle" size={15} color="#fff" style={{ marginRight: 4 }} />
                          <Text style={styles.posBtnTextWhite}>Seat Guests</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.cancelBookingBtn}
                          onPress={() => handleCancelBooking(matchingReservation)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="close-circle-outline" size={15} color="#e74c3c" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#e74c3c', fontSize: 12, fontWeight: '700' }}>Cancel Booking</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {table.status === 'available' && (
                      <>
                        <TouchableOpacity 
                          style={styles.startOrderPosBtn} 
                          onPress={() => router.push(`/admin/pos?prefillTableId=${table.id}`)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="calculator" size={15} color="#fff" style={{ marginRight: 6 }} />
                          <Text style={styles.posBtnTextWhite}>Open in POS</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.reserveTableBtn}
                          onPress={() => openAddReservationModal(table.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="calendar-outline" size={14} color="#8e44ad" style={{ marginRight: 4 }} />
                          <Text style={{ color: '#8e44ad', fontSize: 12, fontWeight: '700' }}>Reserve</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity style={styles.editBtn} onPress={() => openEditTableModal(table)}>
                      <Ionicons name="pencil" size={13} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteTable(table.id)}>
                      <Ionicons name="trash" size={13} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
          {filteredTables.length === 0 && <Text style={styles.emptyText}>No tables found matching criteria.</Text>}
        </ScrollView>
      )}

      {/* Tab 2: Reservations Management */}
      {activeTab === 'reservations' && (
        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
          {/* Filter Pills */}
          <View style={styles.filterPillsRow}>
            {(['all', 'confirmed', 'seated', 'cancelled'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.statusFilterPill, resFilter === f && styles.statusFilterPillActive]}
                onPress={() => setResFilter(f)}
              >
                <Text style={[styles.statusFilterPillText, resFilter === f && styles.statusFilterPillTextActive]}>
                  {f === 'all' ? `All Bookings (${reservations.length})` 
                    : f === 'confirmed' ? `Confirmed (${confirmedResCount})` 
                    : f === 'seated' ? `Seated (${seatedResCount})` 
                    : `Cancelled (${cancelledResCount})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredReservations.map((res) => {
            const isConfirmed = res.status === 'confirmed';
            const isSeated = res.status === 'seated';
            const statusBg = isConfirmed ? '#F4ECF7' : isSeated ? '#E8F8F5' : '#F2F4F4';
            const statusTextColor = isConfirmed ? '#8e44ad' : isSeated ? '#27ae60' : '#7f8c8d';

            return (
              <View key={res.id} style={styles.reservationCard}>
                <View style={styles.reservationMainRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={styles.resCustomerName}>{res.customerName}</Text>
                      <View style={[styles.badge, { backgroundColor: statusBg, borderColor: statusTextColor }]}>
                        <Text style={[styles.badgeText, { color: statusTextColor }]}>
                          {res.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.resMeta}>
                      📞 {res.phone} • 📅 {res.reservationDate} • ⏰ <Text style={{ fontWeight: '800', color: '#1C1C1E' }}>{res.timeSlot}</Text>
                    </Text>

                    <View style={styles.resTableDetailRow}>
                      <View style={styles.tableTag}>
                        <Ionicons name="restaurant" size={13} color="#4a121a" />
                        <Text style={styles.tableTagText}>Assigned: {res.tableName}</Text>
                      </View>
                      <View style={styles.tableTag}>
                        <Ionicons name="people" size={13} color="#666" />
                        <Text style={styles.tableTagText}>{res.guestsCount} Guests</Text>
                      </View>
                    </View>

                    {res.notes ? (
                      <Text style={styles.resNotesText}>Note: "{res.notes}"</Text>
                    ) : null}
                  </View>

                  {/* Actions for this reservation */}
                  <View style={styles.resActionGroup}>
                    {isConfirmed && (
                      <>
                        <TouchableOpacity 
                          style={styles.seatGuestsBtn}
                          onPress={() => handleSeatGuests(res)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark-circle" size={15} color="#fff" style={{ marginRight: 4 }} />
                          <Text style={styles.posBtnTextWhite}>Seat & Check-in</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.editBtnSecondary}
                          onPress={() => openEditReservationModal(res)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="create-outline" size={14} color="#2980b9" />
                          <Text style={{ color: '#2980b9', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.cancelBookingBtn}
                          onPress={() => handleCancelBooking(res)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="trash-outline" size={14} color="#e74c3c" />
                          <Text style={{ color: '#e74c3c', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>Cancel</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {isSeated && (
                      <View style={styles.seatedBanner}>
                        <Ionicons name="checkmark-done" size={16} color="#27ae60" />
                        <Text style={{ color: '#27ae60', fontWeight: '800', fontSize: 12 }}>Currently Dining</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}

          {filteredReservations.length === 0 && (
            <Text style={styles.emptyText}>No reservations found in this category.</Text>
          )}
        </ScrollView>
      )}

      {/* Tab 3: Zones List */}
      {activeTab === 'zones' && (
        <ScrollView style={styles.listContainer}>
          {zones.map((zone, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.tableInfo}>
                <Text style={styles.tableName}>{zone}</Text>
                <Text style={styles.tableMeta}>{tables.filter(t => t.zone === zone).length} Tables</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteZone(zone)}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {zones.length === 0 && <Text style={styles.emptyText}>No zones found. Add a zone to get started.</Text>}
        </ScrollView>
      )}

      {/* Table Modal (Add / Edit) */}
      <Modal visible={tableModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTable ? 'Edit Table' : 'Add New Table'}</Text>
            
            <Text style={styles.label}>Table Name / Code:</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. T-01, Rooftop-04"
              value={formName}
              onChangeText={setFormName}
            />

            <Text style={styles.label}>Floor Zone:</Text>
            <View style={styles.zoneSelector}>
              {zones.map(z => (
                <TouchableOpacity 
                  key={z} 
                  style={[styles.zonePill, formZone === z && styles.zonePillActive]}
                  onPress={() => setFormZone(z)}
                >
                  <Text style={[styles.zonePillText, formZone === z && styles.zonePillTextActive]}>{z}</Text>
                </TouchableOpacity>
              ))}
              {zones.length === 0 && <Text style={styles.emptyText}>No zones available. Please add a zone first.</Text>}
            </View>

            <Text style={styles.label}>Seat Capacity:</Text>
            <TextInput
              style={styles.input}
              placeholder="Number of Seats (e.g. 4)"
              value={formSeats}
              onChangeText={setFormSeats}
              keyboardType="numeric"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTableModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTable}>
                <Text style={styles.saveBtnText}>Save Table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Zone Modal */}
      <Modal visible={zoneModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Floor Zone</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Zone Name (e.g. Courtyard, Family Hall)"
              value={formNewZone}
              onChangeText={setFormNewZone}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setZoneModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveZone}>
                <Text style={styles.saveBtnText}>Save Zone</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer Table Modal */}
      <Modal visible={transferModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="swap-horizontal" size={24} color="#2980b9" />
              <Text style={styles.modalTitle}>Transfer Table Order</Text>
            </View>

            {transferFromTable && (
              <View style={styles.transferSummaryBox}>
                <Text style={{ fontSize: 14, color: '#666' }}>From Current Table:</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#1C1C1E', marginTop: 2 }}>
                  {transferFromTable.name} ({transferFromTable.zone})
                </Text>
                <Text style={{ fontSize: 14, color: '#4a121a', fontWeight: '700', marginTop: 4 }}>
                  Running Bill: Rs. {(transferFromTable.billTotal || 0).toLocaleString()} • {transferFromTable.orders?.length || 0} Item(s)
                </Text>
              </View>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Select Available Target Table:</Text>
            <View style={styles.transferTargetGrid}>
              {tables
                .filter(t => t.status === 'available')
                .map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.targetTableCard,
                      transferToTableId === t.id && styles.targetTableCardActive
                    ]}
                    onPress={() => setTransferToTableId(t.id)}
                  >
                    <Ionicons 
                      name="restaurant" 
                      size={18} 
                      color={transferToTableId === t.id ? '#fff' : '#27ae60'} 
                    />
                    <Text style={[
                      styles.targetTableName,
                      transferToTableId === t.id && styles.targetTableNameActive
                    ]}>
                      {t.name}
                    </Text>
                    <Text style={[
                      styles.targetTableSub,
                      transferToTableId === t.id && styles.targetTableSubActive
                    ]}>
                      {t.zone} • {t.seats}s
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            {tables.filter(t => t.status === 'available').length === 0 && (
              <Text style={{ color: '#e74c3c', fontSize: 13, fontStyle: 'italic', marginVertical: 8 }}>
                No available tables currently. Please free a table first.
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTransferModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, { backgroundColor: '#2980b9' }]} 
                onPress={handleConfirmTransfer}
              >
                <Text style={styles.saveBtnText}>Transfer Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Merge Tables Modal */}
      <Modal visible={mergeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="git-merge-outline" size={24} color="#8e44ad" />
              <Text style={styles.modalTitle}>Merge Tables & Orders</Text>
            </View>

            {mergePrimaryTable && (
              <View style={[styles.transferSummaryBox, { backgroundColor: '#F4ECF7', borderColor: '#D7BDE2' }]}>
                <Text style={{ fontSize: 13, color: '#666' }}>Primary Table (Keeps Running):</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#4a121a', marginTop: 2 }}>
                  {mergePrimaryTable.name} ({mergePrimaryTable.zone}) — Rs. {(mergePrimaryTable.billTotal || 0).toLocaleString()}
                </Text>
              </View>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Select Table to Merge into {mergePrimaryTable?.name}:</Text>
            <View style={styles.transferTargetGrid}>
              {tables
                .filter(t => (t.status === 'occupied' || t.status === 'billed') && t.id !== mergePrimaryTable?.id)
                .map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.targetTableCard,
                      mergeSecondaryTableId === t.id && styles.targetTableCardActive
                    ]}
                    onPress={() => setMergeSecondaryTableId(t.id)}
                  >
                    <Ionicons 
                      name="layers" 
                      size={18} 
                      color={mergeSecondaryTableId === t.id ? '#fff' : '#8e44ad'} 
                    />
                    <Text style={[
                      styles.targetTableName,
                      mergeSecondaryTableId === t.id && styles.targetTableNameActive
                    ]}>
                      {t.name}
                    </Text>
                    <Text style={[
                      styles.targetTableSub,
                      mergeSecondaryTableId === t.id && styles.targetTableSubActive
                    ]}>
                      Rs. {(t.billTotal || 0).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            {tables.filter(t => (t.status === 'occupied' || t.status === 'billed') && t.id !== mergePrimaryTable?.id).length === 0 && (
              <Text style={{ color: '#888', fontSize: 13, fontStyle: 'italic', marginVertical: 8 }}>
                No other occupied tables available to merge with.
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setMergeModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, { backgroundColor: '#8e44ad' }]} 
                onPress={handleConfirmMerge}
              >
                <Text style={styles.saveBtnText}>Confirm Merge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reservation Modal (New / Edit) */}
      <Modal visible={reservationModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 520 }]}>
            <Text style={styles.modalTitle}>
              {editingReservation ? 'Edit Reservation' : 'New Table Reservation'}
            </Text>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Guest Full Name:</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Hamza Malik"
                value={resCustomerName}
                onChangeText={setResCustomerName}
              />

              <Text style={styles.label}>Phone Number:</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 0321-9988776"
                value={resPhone}
                onChangeText={setResPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Select Table:</Text>
              <View style={styles.zoneSelector}>
                {tables.map(t => {
                  const isSelected = resTableId === t.id;
                  const isAvail = t.status === 'available' || (editingReservation && editingReservation.tableId === t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.zonePill,
                        isSelected && { backgroundColor: '#8e44ad', borderColor: '#8e44ad' }
                      ]}
                      onPress={() => setResTableId(t.id)}
                    >
                      <Text style={[
                        styles.zonePillText,
                        isSelected && { color: '#fff', fontWeight: 'bold' }
                      ]}>
                        {t.name} ({t.seats}s - {t.zone}) {!isAvail ? `[${t.status}]` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Date (YYYY-MM-DD):</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={resDate}
                    onChangeText={setResDate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Guests (Party Size):</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 4"
                    value={resGuestsCount}
                    onChangeText={setResGuestsCount}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.label}>Time Slot:</Text>
              <View style={styles.zoneSelector}>
                {TIME_SLOTS.map(slot => (
                  <TouchableOpacity
                    key={slot}
                    style={[
                      styles.zonePill,
                      resTimeSlot === slot && { backgroundColor: '#4a121a', borderColor: '#4a121a' }
                    ]}
                    onPress={() => setResTimeSlot(slot)}
                  >
                    <Text style={[
                      styles.zonePillText,
                      resTimeSlot === slot && { color: '#fff', fontWeight: 'bold' }
                    ]}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Special Requests / Notes (Optional):</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="e.g. Birthday decor, window corner, high chair"
                value={resNotes}
                onChangeText={setResNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReservationModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, { backgroundColor: '#8e44ad' }]} 
                onPress={handleSaveReservation}
              >
                <Text style={styles.saveBtnText}>Save Booking</Text>
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
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4a121a',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  addButton: {
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButtonSecondary: {
    backgroundColor: '#4a121a',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  addButtonTextSecondary: {
    color: '#fff',
  },
  metricsBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4a121a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: '#888',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#4a121a',
  },
  tabText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#4a121a',
    fontWeight: '800',
  },
  listContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  statusFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  statusFilterPillActive: {
    backgroundColor: '#4a121a',
  },
  statusFilterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636366',
  },
  statusFilterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tableMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  tableInfo: {
    flex: 1,
    minWidth: 220,
  },
  tableName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tableMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  runningOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  runningBillText: {
    fontSize: 13,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  ticketsCountText: {
    fontSize: 12,
    color: '#D5A943',
    fontWeight: '700',
  },
  reservationInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F4ECF7',
    padding: 6,
    borderRadius: 6,
    marginTop: 6,
  },
  reservationInfoText: {
    color: '#8e44ad',
    fontSize: 12,
    fontWeight: '600',
  },
  posActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  checkoutPosBtn: {
    backgroundColor: '#27ae60',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addOrderPosBtn: {
    backgroundColor: '#F6F3EC',
    borderWidth: 1,
    borderColor: '#D5A943',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  transferBtn: {
    backgroundColor: '#EBF5FB',
    borderWidth: 1,
    borderColor: '#2980b9',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  transferBtnText: {
    color: '#2980b9',
    fontSize: 12,
    fontWeight: '800',
  },
  mergeBtn: {
    backgroundColor: '#F4ECF7',
    borderWidth: 1,
    borderColor: '#8e44ad',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  mergeBtnText: {
    color: '#8e44ad',
    fontSize: 12,
    fontWeight: '800',
  },
  clearTableBtn: {
    borderWidth: 1,
    borderColor: '#e74c3c',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearTableText: {
    color: '#e74c3c',
    fontSize: 11,
    fontWeight: '700',
  },
  seatGuestsBtn: {
    backgroundColor: '#27ae60',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  cancelBookingBtn: {
    borderWidth: 1,
    borderColor: '#e74c3c',
    backgroundColor: '#FDEDEC',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  startOrderPosBtn: {
    backgroundColor: '#4a121a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
  },
  reserveTableBtn: {
    backgroundColor: '#F4ECF7',
    borderWidth: 1,
    borderColor: '#8e44ad',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  posBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  posBtnTextDark: {
    color: '#4a121a',
    fontSize: 12,
    fontWeight: '800',
  },
  editBtn: {
    backgroundColor: '#3498db',
    padding: 7,
    borderRadius: 6,
  },
  deleteBtn: {
    backgroundColor: '#e74c3c',
    padding: 7,
    borderRadius: 6,
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    paddingVertical: 24,
    fontStyle: 'italic',
  },
  // Reservation Card Styles
  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  reservationMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  resCustomerName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  resMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  resTableDetailRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  tableTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F6F6F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tableTagText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  resNotesText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 6,
  },
  resActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  editBtnSecondary: {
    borderWidth: 1,
    borderColor: '#2980b9',
    backgroundColor: '#EBF5FB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  seatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27ae60',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    width: '100%',
    maxWidth: 450,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#4a121a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  zoneSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  zonePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#eee',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  zonePillActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  zonePillText: {
    color: '#666',
    fontSize: 13,
  },
  zonePillTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#D5A943',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  transferSummaryBox: {
    backgroundColor: '#EBF5FB',
    borderColor: '#AED6F1',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  transferTargetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 10,
  },
  targetTableCard: {
    backgroundColor: '#F8F9F9',
    borderWidth: 1.5,
    borderColor: '#E5E7E9',
    borderRadius: 8,
    padding: 10,
    minWidth: 90,
    alignItems: 'center',
    gap: 3,
  },
  targetTableCardActive: {
    backgroundColor: '#2980b9',
    borderColor: '#1f618d',
  },
  targetTableName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  targetTableNameActive: {
    color: '#FFFFFF',
  },
  targetTableSub: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  targetTableSubActive: {
    color: '#EBF5FB',
  },
});
