import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, Table, Reservation } from '../../store/restaurantStore';

type IconName = keyof typeof Ionicons.glyphMap;
type TabKey = 'tables' | 'reservations' | 'zones';
type StatusFilter = 'all' | Table['status'];

const BRAND = '#4a121a';
const GOLD = '#D5A943';

const STATUS_META: Record<Table['status'], { label: string; color: string; bg: string; icon: IconName }> = {
  available: { label: 'Available', color: '#1E9E5A', bg: '#E9F7EF', icon: 'checkmark-circle' },
  occupied: { label: 'Occupied', color: '#D64541', bg: '#FDEDEC', icon: 'people' },
  billed: { label: 'Billed', color: '#E67E22', bg: '#FEF5E7', icon: 'receipt' },
  reserved: { label: 'Reserved', color: '#7D3C98', bg: '#F4ECF7', icon: 'calendar' },
};

const TIME_SLOTS = [
  '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM',
  '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM',
  '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM',
];

const notify = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const confirmAction = (title: string, message: string, confirmText: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmText, style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export default function AdminTables() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const columns = width < 600 ? 2 : width < 1000 ? 3 : width < 1400 ? 4 : 5;

  const tables = useRestaurantStore((s) => s.tables);
  const zones = useRestaurantStore((s) => s.zones);
  const tickets = useRestaurantStore((s) => s.tickets);
  const reservations = useRestaurantStore((s) => s.reservations || []);

  const addTable = useRestaurantStore((s) => s.addTable);
  const updateTable = useRestaurantStore((s) => s.updateTable);
  const deleteTable = useRestaurantStore((s) => s.deleteTable);
  const addZone = useRestaurantStore((s) => s.addZone);
  const deleteZone = useRestaurantStore((s) => s.deleteZone);
  const settleBill = useRestaurantStore((s) => s.settleBill);
  const transferTable = useRestaurantStore((s) => s.transferTable);
  const mergeTables = useRestaurantStore((s) => s.mergeTables);
  const addReservation = useRestaurantStore((s) => s.addReservation);
  const updateReservation = useRestaurantStore((s) => s.updateReservation);
  const cancelReservation = useRestaurantStore((s) => s.cancelReservation);
  const seatReservation = useRestaurantStore((s) => s.seatReservation);

  const [activeTab, setActiveTab] = useState<TabKey>('tables');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [resFilter, setResFilter] = useState<'all' | Reservation['status']>('confirmed');

  // Action sheet for a tapped table
  const [actionTableId, setActionTableId] = useState<string | null>(null);
  const actionTable = actionTableId ? tables.find((t) => t.id === actionTableId) || null : null;

  // Table form
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formName, setFormName] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formSeats, setFormSeats] = useState('');

  // Zone form
  const [zoneModalVisible, setZoneModalVisible] = useState(false);
  const [formNewZone, setFormNewZone] = useState('');

  // Transfer / merge
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferToTableId, setTransferToTableId] = useState('');
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeSecondaryTableId, setMergeSecondaryTableId] = useState('');
  const [sourceTable, setSourceTable] = useState<Table | null>(null);

  // Reservation form
  const [reservationModalVisible, setReservationModalVisible] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [resCustomerName, setResCustomerName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resTableId, setResTableId] = useState('');
  const [resLinkedIds, setResLinkedIds] = useState<string[]>([]);
  const [resDate, setResDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [resTimeSlot, setResTimeSlot] = useState('08:00 PM');
  const [resGuestsCount, setResGuestsCount] = useState('4');
  const [resNotes, setResNotes] = useState('');

  const tableById = (id?: string) => tables.find((t) => t.id === id);
  const reservationForTable = (t: Table) =>
    reservations.find((r) => r.status === 'confirmed' && (r.id === t.reservationId || r.tableId === t.id));

  // ---------- Metrics ----------
  const counts = useMemo(() => {
    const c = { available: 0, occupied: 0, billed: 0, reserved: 0 };
    tables.forEach((t) => { c[t.status] += 1; });
    return c;
  }, [tables]);
  const totalSeats = tables.reduce((s, t) => s + t.seats, 0);
  const occupiedSeats = tables.filter((t) => t.status === 'occupied' || t.status === 'billed').reduce((s, t) => s + t.seats, 0);
  const occupancyPct = totalSeats ? Math.round((occupiedSeats / totalSeats) * 100) : 0;
  const liveRevenue = tables
    .filter((t) => t.status === 'occupied' || t.status === 'billed')
    .reduce((s, t) => s + (t.billTotal || 0), 0);
  const upcomingCount = reservations.filter((r) => r.status === 'confirmed').length;

  // ---------- Filtering ----------
  const filteredTables = tables.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (zoneFilter !== 'all' && t.zone !== zoneFilter) return false;
    if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });
  const zonesToRender = (zoneFilter === 'all' ? zones : [zoneFilter]).filter((z) =>
    filteredTables.some((t) => t.zone === z)
  );
  const orphanTables = filteredTables.filter((t) => !zones.includes(t.zone));

  const filteredReservations = reservations
    .filter((r) => resFilter === 'all' || r.status === resFilter)
    .sort((a, b) => (a.reservationDate + a.timeSlot).localeCompare(b.reservationDate + b.timeSlot));

  // ---------- Table CRUD ----------
  const openAddTableModal = () => {
    setEditingTable(null);
    setFormName('');
    setFormZone(zones[0] || '');
    setFormSeats('4');
    setTableModalVisible(true);
  };

  const openEditTableModal = (table: Table) => {
    setActionTableId(null);
    setEditingTable(table);
    setFormName(table.name);
    setFormZone(table.zone);
    setFormSeats(table.seats.toString());
    setTableModalVisible(true);
  };

  const handleSaveTable = () => {
    const seatsNum = parseInt(formSeats, 10);
    if (!formName.trim() || !formZone.trim()) return notify('Missing info', 'Please enter a table name and select a zone.');
    if (isNaN(seatsNum) || seatsNum <= 0) return notify('Invalid seats', 'Seats must be a positive number.');
    const duplicate = tables.some((t) => t.name.toLowerCase() === formName.trim().toLowerCase() && t.id !== editingTable?.id);
    if (duplicate) return notify('Duplicate name', `A table named ${formName.trim()} already exists.`);

    if (editingTable) {
      updateTable(editingTable.id, { name: formName.trim(), zone: formZone, seats: seatsNum });
    } else {
      addTable({ name: formName.trim(), zone: formZone, seats: seatsNum, status: 'available' });
    }
    setTableModalVisible(false);
  };

  const handleDeleteTable = (table: Table) => {
    if (table.status !== 'available') {
      return notify('Cannot delete', `${table.name} is currently ${table.status}. Free the table first.`);
    }
    confirmAction('Delete table', `Delete ${table.name} permanently?`, 'Delete', () => {
      deleteTable(table.id);
      setActionTableId(null);
    });
  };

  const handleClearTable = (table: Table) => {
    const linkedCount = tables.filter((t) => t.mergedInto === table.id).length;
    const extra = linkedCount ? ` ${linkedCount} merged table(s) will also be released.` : '';
    confirmAction('Clear table', `Release ${table.name}? Running bill and kitchen tickets will be reset.${extra}`, 'Clear', () => {
      settleBill(table.id);
      setActionTableId(null);
    });
  };

  const handleUnlinkTable = (table: Table) => {
    const primary = tableById(table.mergedInto);
    confirmAction('Unlink table', `Detach ${table.name} from ${primary?.name || 'its group'} and make it available?`, 'Unlink', () => {
      updateTable(table.id, { status: 'available', mergedInto: undefined, reservationId: undefined, occupiedSince: undefined });
      setActionTableId(null);
    });
  };

  // ---------- Transfer / Merge ----------
  const openTransferModal = (table: Table) => {
    setActionTableId(null);
    setSourceTable(table);
    setTransferToTableId(tables.find((t) => t.status === 'available' && t.id !== table.id)?.id || '');
    setTransferModalVisible(true);
  };

  const handleConfirmTransfer = () => {
    const target = tableById(transferToTableId);
    if (!sourceTable || !target || target.status !== 'available') return notify('Select table', 'Please select an available destination table.');
    transferTable(sourceTable.id, target.id);
    setTransferModalVisible(false);
    notify('Transferred', `${sourceTable.name} order moved to ${target.name}. Kitchen tickets updated.`);
  };

  const openMergeModal = (table: Table) => {
    setActionTableId(null);
    setSourceTable(table);
    setMergeSecondaryTableId(
      tables.find((t) => (t.status === 'occupied' || t.status === 'billed') && t.id !== table.id && !t.mergedInto)?.id || ''
    );
    setMergeModalVisible(true);
  };

  const handleConfirmMerge = () => {
    const sec = tableById(mergeSecondaryTableId);
    if (!sourceTable || !sec) return notify('Select table', 'Please select a table to merge.');
    mergeTables(sourceTable.id, sec.id);
    setMergeModalVisible(false);
    notify('Merged', `${sec.name} merged into ${sourceTable.name}.`);
  };

  // ---------- Reservations ----------
  const resetReservationForm = () => {
    setResCustomerName('');
    setResPhone('');
    setResLinkedIds([]);
    setResDate(new Date().toISOString().split('T')[0]);
    setResTimeSlot('08:00 PM');
    setResGuestsCount('4');
    setResNotes('');
  };

  const openAddReservationModal = (prefillTableId?: string) => {
    setActionTableId(null);
    setEditingReservation(null);
    resetReservationForm();
    const fallback = tables.find((t) => t.status === 'available')?.id || '';
    setResTableId(prefillTableId || fallback);
    setReservationModalVisible(true);
  };

  const openEditReservationModal = (res: Reservation) => {
    setEditingReservation(res);
    setResCustomerName(res.customerName);
    setResPhone(res.phone);
    setResTableId(res.tableId);
    setResLinkedIds(res.linkedTableIds || []);
    setResDate(res.reservationDate);
    setResTimeSlot(res.timeSlot);
    setResGuestsCount(res.guestsCount.toString());
    setResNotes(res.notes || '');
    setReservationModalVisible(true);
  };

  /** A table can be picked for this reservation if it's free, or already held by the reservation being edited. */
  const isSelectableForReservation = (t: Table) =>
    t.status === 'available' || (!!editingReservation && t.reservationId === editingReservation.id);

  const guestsNum = parseInt(resGuestsCount, 10) || 0;
  const primaryResTable = tableById(resTableId);
  const selectedSeats =
    (primaryResTable?.seats || 0) + resLinkedIds.reduce((s, id) => s + (tableById(id)?.seats || 0), 0);
  const capacityOk = selectedSeats >= guestsNum && guestsNum > 0;

  const selectPrimaryTable = (id: string) => {
    setResTableId(id);
    setResLinkedIds((prev) => prev.filter((x) => x !== id));
  };

  const toggleLinkedTable = (id: string) => {
    setResLinkedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /** Greedy suggestion: fill remaining seats with free tables, same zone first, biggest first. */
  const autoSuggestMerge = () => {
    if (!primaryResTable) return notify('Pick a table', 'Select a primary table first.');
    let needed = guestsNum - primaryResTable.seats;
    if (needed <= 0) {
      setResLinkedIds([]);
      return notify('Fits already', `${primaryResTable.name} has enough seats for ${guestsNum} guests.`);
    }
    const candidates = tables
      .filter((t) => t.id !== primaryResTable.id && isSelectableForReservation(t))
      .sort((a, b) => {
        const za = a.zone === primaryResTable.zone ? 0 : 1;
        const zb = b.zone === primaryResTable.zone ? 0 : 1;
        return za - zb || b.seats - a.seats;
      });
    const picked: string[] = [];
    for (const c of candidates) {
      if (needed <= 0) break;
      picked.push(c.id);
      needed -= c.seats;
    }
    setResLinkedIds(picked);
    if (needed > 0) notify('Not enough tables', `Even with all free tables you are short by ${needed} seat(s).`);
  };

  const handleSaveReservation = () => {
    if (!resCustomerName.trim() || !resPhone.trim()) return notify('Missing info', 'Guest name and phone number are required.');
    if (!primaryResTable) return notify('Select table', 'Please select a primary table.');
    if (guestsNum <= 0) return notify('Invalid guests', 'Please enter a valid party size.');

    const doSave = () => {
      const linked = resLinkedIds.filter((id) => id !== resTableId);
      const tableName = [primaryResTable.name, ...linked.map((id) => tableById(id)?.name || id)].join(' + ');
      const payload = {
        tableId: resTableId,
        tableName,
        linkedTableIds: linked,
        customerName: resCustomerName.trim(),
        phone: resPhone.trim(),
        guestsCount: guestsNum,
        reservationDate: resDate,
        timeSlot: resTimeSlot,
        notes: resNotes.trim(),
      };
      if (editingReservation) {
        updateReservation(editingReservation.id, payload);
      } else {
        addReservation({ ...payload, status: 'confirmed' });
      }
      setReservationModalVisible(false);
      notify(editingReservation ? 'Reservation updated' : 'Reservation confirmed', `${tableName} • ${resTimeSlot} • ${guestsNum} guests`);
    };

    if (!capacityOk) {
      confirmAction(
        'Low capacity',
        `Selected tables seat ${selectedSeats}, but party is ${guestsNum}. Save anyway?`,
        'Save anyway',
        doSave
      );
      return;
    }
    doSave();
  };

  const handleSeatGuests = (res: Reservation) => {
    confirmAction('Check-in guests', `Seat ${res.customerName} (${res.guestsCount}) at ${res.tableName}?`, 'Seat now', () => {
      seatReservation(res.id);
      setActionTableId(null);
    });
  };

  const handleCancelBooking = (res: Reservation) => {
    confirmAction('Cancel reservation', `Cancel booking for ${res.customerName}? All held tables will be released.`, 'Cancel booking', () => {
      cancelReservation(res.id);
      setActionTableId(null);
    });
  };

  // ---------- Zones ----------
  const handleSaveZone = () => {
    const name = formNewZone.trim();
    if (!name) return notify('Error', 'Zone name cannot be empty.');
    if (zones.includes(name)) return notify('Error', 'Zone already exists.');
    addZone(name);
    setZoneModalVisible(false);
    setFormNewZone('');
  };

  const handleDeleteZone = (zoneName: string) => {
    if (tables.some((t) => t.zone === zoneName)) {
      return notify('Zone in use', `Move or delete tables in '${zoneName}' first.`);
    }
    confirmAction('Delete zone', `Delete zone '${zoneName}'?`, 'Delete', () => deleteZone(zoneName));
  };

  // ---------- Render helpers ----------
  const renderTile = (table: Table) => {
    const meta = STATUS_META[table.status];
    const isBusy = table.status === 'occupied' || table.status === 'billed';
    const kotCount = tickets.filter((t) => t.tableId === table.id && t.status !== 'served').length;
    const res = table.status === 'reserved' ? reservationForTable(table) : undefined;
    const primary = table.mergedInto ? tableById(table.mergedInto) : undefined;
    const linkedChildren = tables.filter((t) => t.mergedInto === table.id);

    return (
      <View key={table.id} style={{ width: `${100 / columns}%`, padding: 6 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setActionTableId(table.id)}
          style={[styles.tile, { borderColor: meta.color + '40' }]}
        >
          <View style={[styles.tileStrip, { backgroundColor: meta.color }]} />
          <View style={styles.tileBody}>
            <View style={styles.tileTopRow}>
              <Text style={styles.tileName} numberOfLines={1}>{table.name}</Text>
              <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon} size={11} color={meta.color} />
                <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>

            <View style={styles.tileMetaRow}>
              <Ionicons name="people-outline" size={13} color="#8E8E93" />
              <Text style={styles.tileMetaText}>{table.seats} seats</Text>
              {table.server ? (
                <>
                  <Text style={styles.dot}>•</Text>
                  <Ionicons name="person-outline" size={12} color="#8E8E93" />
                  <Text style={styles.tileMetaText} numberOfLines={1}>{table.server}</Text>
                </>
              ) : null}
            </View>

            <View style={styles.tileFooter}>
              {primary ? (
                <View style={[styles.infoChip, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="link" size={12} color="#4F46E5" />
                  <Text style={[styles.infoChipText, { color: '#4F46E5' }]}>Merged with {primary.name}</Text>
                </View>
              ) : isBusy ? (
                <View style={{ gap: 4 }}>
                  <Text style={styles.tileBill}>Rs. {(table.billTotal || 0).toLocaleString()}</Text>
                  <Text style={styles.tileSub}>
                    {kotCount > 0 ? `${kotCount} KOT in kitchen` : `${table.orders?.length || 0} item(s)`}
                    {table.status === 'billed' ? ' • Paid' : ''}
                  </Text>
                </View>
              ) : res ? (
                <View style={{ gap: 2 }}>
                  <Text style={styles.tileGuest} numberOfLines={1}>{res.customerName}</Text>
                  <Text style={styles.tileSub}>{res.timeSlot} • {res.guestsCount} guests</Text>
                </View>
              ) : (
                <Text style={[styles.tileSub, { color: meta.color, fontWeight: '700' }]}>Ready for guests</Text>
              )}

              {linkedChildren.length > 0 && (
                <View style={[styles.infoChip, { backgroundColor: '#EEF2FF', marginTop: 6 }]}>
                  <Ionicons name="git-merge-outline" size={12} color="#4F46E5" />
                  <Text style={[styles.infoChipText, { color: '#4F46E5' }]}>
                    + {linkedChildren.map((c) => c.name).join(', ')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const ActionRow = ({ icon, label, color = '#1C1C1E', onPress, solid }: { icon: IconName; label: string; color?: string; onPress: () => void; solid?: boolean }) => (
    <TouchableOpacity
      style={[styles.actionRow, solid ? { backgroundColor: color, borderColor: color } : { borderColor: color + '55' }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name={icon} size={18} color={solid ? '#fff' : color} />
      <Text style={[styles.actionRowText, { color: solid ? '#fff' : color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={solid ? '#ffffffaa' : '#C7C7CC'} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );

  const renderActionSheet = () => {
    if (!actionTable) return null;
    const t = actionTable;
    const meta = STATUS_META[t.status];
    const isBusy = t.status === 'occupied' || t.status === 'billed';
    const res = reservationForTable(t);
    const primary = t.mergedInto ? tableById(t.mergedInto) : undefined;

    return (
      <View style={styles.sheetBody}>
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name="restaurant" size={22} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{t.name}</Text>
            <Text style={styles.sheetSub}>{t.zone} • {t.seats} seats • {meta.label}</Text>
          </View>
          <TouchableOpacity onPress={() => setActionTableId(null)} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {isBusy && !primary && (
          <View style={[styles.sheetInfo, { backgroundColor: meta.bg }]}>
            <Text style={[styles.sheetInfoLabel, { color: meta.color }]}>Running bill</Text>
            <Text style={styles.sheetInfoValue}>Rs. {(t.billTotal || 0).toLocaleString()}</Text>
            <Text style={styles.sheetInfoSub}>Server: {t.server || '—'}</Text>
          </View>
        )}
        {res && (
          <View style={[styles.sheetInfo, { backgroundColor: STATUS_META.reserved.bg }]}>
            <Text style={[styles.sheetInfoLabel, { color: STATUS_META.reserved.color }]}>Reservation</Text>
            <Text style={styles.sheetInfoValue}>{res.customerName}</Text>
            <Text style={styles.sheetInfoSub}>{res.phone} • {res.reservationDate} • {res.timeSlot}</Text>
            <Text style={styles.sheetInfoSub}>{res.guestsCount} guests • Tables: {res.tableName}</Text>
          </View>
        )}
        {primary && (
          <View style={[styles.sheetInfo, { backgroundColor: '#EEF2FF' }]}>
            <Text style={[styles.sheetInfoLabel, { color: '#4F46E5' }]}>Merged table</Text>
            <Text style={styles.sheetInfoSub}>This table is joined with {primary.name}. Orders & bill are handled on {primary.name}.</Text>
          </View>
        )}

        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }}>
          {primary ? (
            <>
              <ActionRow icon="open-outline" label={`Open ${primary.name}`} color={BRAND} solid onPress={() => setActionTableId(primary.id)} />
              {t.status !== 'reserved' && (
                <ActionRow icon="unlink" label="Unlink this table" color="#4F46E5" onPress={() => handleUnlinkTable(t)} />
              )}
            </>
          ) : (
            <>
              {t.status === 'available' && (
                <>
                  <ActionRow icon="calculator" label="Start order in POS" color={BRAND} solid onPress={() => { setActionTableId(null); router.push(`/admin/pos?prefillTableId=${t.id}`); }} />
                  <ActionRow icon="calendar-outline" label="Reserve this table" color={STATUS_META.reserved.color} onPress={() => openAddReservationModal(t.id)} />
                </>
              )}
              {isBusy && (
                <>
                  <ActionRow icon="card" label="Checkout in POS" color="#1E9E5A" solid onPress={() => { setActionTableId(null); router.push(`/admin/pos?prefillTableId=${t.id}`); }} />
                  <ActionRow icon="add-circle-outline" label="Add items" color={BRAND} onPress={() => { setActionTableId(null); router.push(`/admin/pos?prefillTableId=${t.id}`); }} />
                  <ActionRow icon="swap-horizontal" label="Transfer to another table" color="#2471A3" onPress={() => openTransferModal(t)} />
                  <ActionRow icon="git-merge-outline" label="Merge another table's order" color="#7D3C98" onPress={() => openMergeModal(t)} />
                  <ActionRow icon="refresh" label="Clear & release" color="#D64541" onPress={() => handleClearTable(t)} />
                </>
              )}
              {t.status === 'reserved' && res && (
                <>
                  <ActionRow icon="checkmark-circle" label="Seat guests (check-in)" color="#1E9E5A" solid onPress={() => handleSeatGuests(res)} />
                  <ActionRow icon="create-outline" label="Edit reservation" color="#2471A3" onPress={() => { setActionTableId(null); openEditReservationModal(res); }} />
                  <ActionRow icon="close-circle-outline" label="Cancel reservation" color="#D64541" onPress={() => handleCancelBooking(res)} />
                </>
              )}
              {t.status === 'reserved' && !res && (
                <ActionRow icon="lock-open-outline" label="Mark available" color="#1E9E5A" onPress={() => { updateTable(t.id, { status: 'available', reservationId: undefined }); setActionTableId(null); }} />
              )}
              <View style={styles.sheetDivider} />
              <ActionRow icon="pencil" label="Edit table details" color="#636366" onPress={() => openEditTableModal(t)} />
              <ActionRow icon="trash-outline" label="Delete table" color="#D64541" onPress={() => handleDeleteTable(t)} />
            </>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderTablePickerCard = (t: Table, selected: boolean, onPress: () => void, accent: string, sub: string) => (
    <TouchableOpacity
      key={t.id}
      onPress={onPress}
      style={[styles.pickCard, selected && { backgroundColor: accent, borderColor: accent }]}
      activeOpacity={0.85}
    >
      {selected && (
        <View style={styles.pickCheck}>
          <Ionicons name="checkmark" size={11} color={accent} />
        </View>
      )}
      <Text style={[styles.pickName, selected && { color: '#fff' }]}>{t.name}</Text>
      <Text style={[styles.pickSub, selected && { color: '#ffffffcc' }]}>{sub}</Text>
    </TouchableOpacity>
  );

  // ---------- UI ----------
  const STATS: { label: string; value: string; icon: IconName; color: string }[] = [
    { label: 'Available', value: `${counts.available}/${tables.length}`, icon: 'checkmark-circle', color: STATUS_META.available.color },
    { label: 'Occupied', value: `${counts.occupied + counts.billed}`, icon: 'people', color: STATUS_META.occupied.color },
    { label: 'Reserved', value: `${counts.reserved}`, icon: 'calendar', color: STATUS_META.reserved.color },
    { label: 'Seat occupancy', value: `${occupancyPct}%`, icon: 'pie-chart', color: '#2471A3' },
    { label: 'Live dine-in bill', value: `Rs. ${liveRevenue.toLocaleString()}`, icon: 'cash', color: GOLD },
  ];

  const TABS: { key: TabKey; label: string; icon: IconName; badge?: number }[] = [
    { key: 'tables', label: 'Floor', icon: 'grid' },
    { key: 'reservations', label: 'Reservations', icon: 'calendar', badge: upcomingCount },
    { key: 'zones', label: 'Zones', icon: 'map' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && { paddingHorizontal: 14 }]}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={styles.title}>Table & Floor Management</Text>
          <Text style={styles.subtitle}>Live sync with POS, Waiter app & Kitchen KDS</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.headerBtn, styles.headerBtnGhost]} onPress={() => openAddReservationModal()}>
            <Ionicons name="calendar-outline" size={16} color={STATUS_META.reserved.color} />
            {!isMobile && <Text style={[styles.headerBtnText, { color: STATUS_META.reserved.color }]}>New Reservation</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={activeTab === 'zones' ? () => { setFormNewZone(''); setZoneModalVisible(true); } : openAddTableModal}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.headerBtnText}>{activeTab === 'zones' ? 'Add Zone' : 'Add Table'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, isMobile && { padding: 12 }]} showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: s.color + '1A' }]}>
                <Ionicons name={s.icon} size={18} color={s.color} />
              </View>
              <View>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Segmented tabs */}
        <View style={styles.segment}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity key={tab.key} style={[styles.segmentItem, active && styles.segmentItemActive]} onPress={() => setActiveTab(tab.key)}>
                <Ionicons name={active ? tab.icon : (`${tab.icon}-outline` as IconName)} size={16} color={active ? '#fff' : '#636366'} />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{tab.label}</Text>
                {!!tab.badge && (
                  <View style={[styles.segmentBadge, active && { backgroundColor: GOLD }]}>
                    <Text style={styles.segmentBadgeText}>{tab.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ---------- FLOOR TAB ---------- */}
        {activeTab === 'tables' && (
          <>
            <View style={styles.toolbar}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#8E8E93" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search table…"
                  placeholderTextColor="#AEAEB2"
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(['all', 'available', 'occupied', 'billed', 'reserved'] as const).map((f) => {
                  const active = statusFilter === f;
                  const color = f === 'all' ? BRAND : STATUS_META[f].color;
                  const count = f === 'all' ? tables.length : counts[f];
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
                      onPress={() => setStatusFilter(f)}
                    >
                      {f !== 'all' && <View style={[styles.chipDot, { backgroundColor: active ? '#fff' : color }]} />}
                      <Text style={[styles.chipText, active && { color: '#fff' }]}>
                        {f === 'all' ? 'All' : STATUS_META[f].label} {count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 6 }}>
              {['all', ...zones].map((z) => {
                const active = zoneFilter === z;
                return (
                  <TouchableOpacity key={z} style={[styles.zoneChip, active && styles.zoneChipActive]} onPress={() => setZoneFilter(z)}>
                    <Text style={[styles.zoneChipText, active && { color: BRAND }]}>{z === 'all' ? 'All zones' : z}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {zonesToRender.map((zone) => {
              const zoneTables = filteredTables.filter((t) => t.zone === zone);
              const free = zoneTables.filter((t) => t.status === 'available').length;
              return (
                <View key={zone} style={styles.zoneSection}>
                  <View style={styles.zoneHeader}>
                    <Text style={styles.zoneTitle}>{zone}</Text>
                    <Text style={styles.zoneMeta}>{free} free of {zoneTables.length}</Text>
                  </View>
                  <View style={styles.grid}>{zoneTables.map(renderTile)}</View>
                </View>
              );
            })}
            {orphanTables.length > 0 && (
              <View style={styles.zoneSection}>
                <View style={styles.zoneHeader}>
                  <Text style={styles.zoneTitle}>Unassigned</Text>
                </View>
                <View style={styles.grid}>{orphanTables.map(renderTile)}</View>
              </View>
            )}
            {filteredTables.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="grid-outline" size={40} color="#C7C7CC" />
                <Text style={styles.emptyText}>No tables match these filters.</Text>
              </View>
            )}
          </>
        )}

        {/* ---------- RESERVATIONS TAB ---------- */}
        {activeTab === 'reservations' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              {(['confirmed', 'seated', 'cancelled', 'all'] as const).map((f) => {
                const active = resFilter === f;
                const count = f === 'all' ? reservations.length : reservations.filter((r) => r.status === f).length;
                return (
                  <TouchableOpacity key={f} style={[styles.chip, active && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setResFilter(f)}>
                    <Text style={[styles.chipText, active && { color: '#fff' }]}>
                      {f === 'all' ? 'All' : f === 'confirmed' ? 'Upcoming' : f.charAt(0).toUpperCase() + f.slice(1)} {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredReservations.map((res) => {
              const isConfirmed = res.status === 'confirmed';
              const statusColor = isConfirmed ? STATUS_META.reserved.color : res.status === 'seated' ? STATUS_META.available.color : '#8E8E93';
              const linkedCount = res.linkedTableIds?.length || 0;
              return (
                <View key={res.id} style={[styles.resCard, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
                  <View style={[styles.resTime, { backgroundColor: statusColor + '14' }]}>
                    <Text style={[styles.resTimeText, { color: statusColor }]}>{res.timeSlot}</Text>
                    <Text style={styles.resDateText}>{res.reservationDate}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={styles.resName}>{res.customerName}</Text>
                      <View style={[styles.statusPill, { backgroundColor: statusColor + '1A' }]}>
                        <Text style={[styles.statusPillText, { color: statusColor }]}>{res.status.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.resMeta}>{res.phone} • {res.guestsCount} guests</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <View style={styles.infoChip}>
                        <Ionicons name="restaurant-outline" size={12} color={BRAND} />
                        <Text style={styles.infoChipText}>{res.tableName}</Text>
                      </View>
                      {linkedCount > 0 && (
                        <View style={[styles.infoChip, { backgroundColor: '#EEF2FF' }]}>
                          <Ionicons name="git-merge-outline" size={12} color="#4F46E5" />
                          <Text style={[styles.infoChipText, { color: '#4F46E5' }]}>{linkedCount + 1} tables merged</Text>
                        </View>
                      )}
                    </View>
                    {res.notes ? <Text style={styles.resNotes}>“{res.notes}”</Text> : null}
                  </View>
                  {isConfirmed && (
                    <View style={styles.resActions}>
                      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: STATUS_META.available.color }]} onPress={() => handleSeatGuests(res)}>
                        <Ionicons name="checkmark-circle" size={14} color="#fff" />
                        <Text style={[styles.smallBtnText, { color: '#fff' }]}>Seat</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.smallBtnGhost]} onPress={() => openEditReservationModal(res)}>
                        <Ionicons name="create-outline" size={14} color="#2471A3" />
                        <Text style={[styles.smallBtnText, { color: '#2471A3' }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.smallBtnGhost]} onPress={() => handleCancelBooking(res)}>
                        <Ionicons name="close-circle-outline" size={14} color="#D64541" />
                        <Text style={[styles.smallBtnText, { color: '#D64541' }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            {filteredReservations.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color="#C7C7CC" />
                <Text style={styles.emptyText}>No reservations here.</Text>
                <TouchableOpacity style={[styles.headerBtn, { marginTop: 8 }]} onPress={() => openAddReservationModal()}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.headerBtnText}>New Reservation</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ---------- ZONES TAB ---------- */}
        {activeTab === 'zones' && (
          <View style={styles.grid}>
            {zones.map((zone) => {
              const zt = tables.filter((t) => t.zone === zone);
              const seats = zt.reduce((s, t) => s + t.seats, 0);
              const busy = zt.filter((t) => t.status !== 'available').length;
              return (
                <View key={zone} style={{ width: `${100 / Math.min(columns, 3)}%`, padding: 6 }}>
                  <View style={styles.zoneCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.statIcon, { backgroundColor: BRAND + '14' }]}>
                        <Ionicons name="map" size={18} color={BRAND} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.zoneCardTitle}>{zone}</Text>
                        <Text style={styles.zoneMeta}>{zt.length} tables • {seats} seats</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteZone(zone)} hitSlop={8} style={styles.closeBtn}>
                        <Ionicons name="trash-outline" size={18} color="#D64541" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${zt.length ? (busy / zt.length) * 100 : 0}%` }]} />
                    </View>
                    <Text style={styles.zoneMeta}>{busy} in use • {zt.length - busy} free</Text>
                  </View>
                </View>
              );
            })}
            {zones.length === 0 && <Text style={styles.emptyText}>No zones yet. Add one to get started.</Text>}
          </View>
        )}
      </ScrollView>

      {/* ---------- Table action sheet ---------- */}
      <Modal visible={!!actionTable} transparent animationType={isMobile ? 'slide' : 'fade'} onRequestClose={() => setActionTableId(null)}>
        <TouchableOpacity activeOpacity={1} style={[styles.overlay, isMobile && { justifyContent: 'flex-end', padding: 0 }]} onPress={() => setActionTableId(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, isMobile && styles.sheetMobile]}>
            {renderActionSheet()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ---------- Add / edit table ---------- */}
      <Modal visible={tableModalVisible} transparent animationType="fade" onRequestClose={() => setTableModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{editingTable ? 'Edit table' : 'Add new table'}</Text>
            <Text style={styles.label}>Table name</Text>
            <TextInput style={styles.input} placeholder="e.g. T-06" value={formName} onChangeText={setFormName} />
            <Text style={styles.label}>Zone</Text>
            <View style={styles.wrapRow}>
              {zones.map((z) => (
                <TouchableOpacity key={z} style={[styles.chip, formZone === z && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setFormZone(z)}>
                  <Text style={[styles.chipText, formZone === z && { color: '#fff' }]}>{z}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Seats</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setFormSeats(String(Math.max(1, (parseInt(formSeats, 10) || 1) - 1)))}>
                <Ionicons name="remove" size={18} color={BRAND} />
              </TouchableOpacity>
              <TextInput style={styles.stepInput} value={formSeats} onChangeText={setFormSeats} keyboardType="numeric" />
              <TouchableOpacity style={styles.stepBtn} onPress={() => setFormSeats(String((parseInt(formSeats, 10) || 0) + 1))}>
                <Ionicons name="add" size={18} color={BRAND} />
              </TouchableOpacity>
            </View>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setTableModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveTable}>
                <Text style={styles.primaryBtnText}>Save table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Add zone ---------- */}
      <Modal visible={zoneModalVisible} transparent animationType="fade" onRequestClose={() => setZoneModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Add floor zone</Text>
            <TextInput style={styles.input} placeholder="e.g. Family Hall" value={formNewZone} onChangeText={setFormNewZone} />
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setZoneModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveZone}>
                <Text style={styles.primaryBtnText}>Save zone</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Transfer ---------- */}
      <Modal visible={transferModalVisible} transparent animationType="fade" onRequestClose={() => setTransferModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Transfer {sourceTable?.name}</Text>
            <Text style={styles.dialogSub}>Bill Rs. {(sourceTable?.billTotal || 0).toLocaleString()} and kitchen tickets will move to the selected table.</Text>
            <View style={styles.wrapRow}>
              {tables.filter((t) => t.status === 'available').map((t) =>
                renderTablePickerCard(t, transferToTableId === t.id, () => setTransferToTableId(t.id), '#2471A3', `${t.zone} • ${t.seats}s`)
              )}
            </View>
            {tables.every((t) => t.status !== 'available') && <Text style={styles.warnText}>No available tables right now.</Text>}
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setTransferModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#2471A3' }]} onPress={handleConfirmTransfer}>
                <Text style={styles.primaryBtnText}>Transfer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Merge running orders ---------- */}
      <Modal visible={mergeModalVisible} transparent animationType="fade" onRequestClose={() => setMergeModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Merge into {sourceTable?.name}</Text>
            <Text style={styles.dialogSub}>The selected table&apos;s order and bill will be added to {sourceTable?.name}, then it becomes available.</Text>
            <View style={styles.wrapRow}>
              {tables
                .filter((t) => (t.status === 'occupied' || t.status === 'billed') && t.id !== sourceTable?.id && !t.mergedInto)
                .map((t) =>
                  renderTablePickerCard(t, mergeSecondaryTableId === t.id, () => setMergeSecondaryTableId(t.id), '#7D3C98', `Rs. ${(t.billTotal || 0).toLocaleString()}`)
                )}
            </View>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setMergeModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#7D3C98' }]} onPress={handleConfirmMerge}>
                <Text style={styles.primaryBtnText}>Merge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Reservation (with multi-table merge) ---------- */}
      <Modal visible={reservationModalVisible} transparent animationType="slide" onRequestClose={() => setReservationModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.dialog, { maxWidth: 620 }]}>
            <Text style={styles.dialogTitle}>{editingReservation ? 'Edit reservation' : 'New reservation'}</Text>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              {/* Guest */}
              <Text style={styles.sectionLabel}>GUEST</Text>
              <View style={[styles.formRow, isMobile && { flexDirection: 'column' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Name</Text>
                  <TextInput style={styles.input} placeholder="Guest name" value={resCustomerName} onChangeText={setResCustomerName} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Phone</Text>
                  <TextInput style={styles.input} placeholder="03xx-xxxxxxx" value={resPhone} onChangeText={setResPhone} keyboardType="phone-pad" />
                </View>
              </View>

              {/* When */}
              <Text style={styles.sectionLabel}>WHEN & HOW MANY</Text>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Date</Text>
                  <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={resDate} onChangeText={setResDate} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Guests</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => setResGuestsCount(String(Math.max(1, guestsNum - 1)))}>
                      <Ionicons name="remove" size={18} color={BRAND} />
                    </TouchableOpacity>
                    <TextInput style={styles.stepInput} value={resGuestsCount} onChangeText={setResGuestsCount} keyboardType="numeric" />
                    <TouchableOpacity style={styles.stepBtn} onPress={() => setResGuestsCount(String(guestsNum + 1))}>
                      <Ionicons name="add" size={18} color={BRAND} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={[styles.wrapRow, { marginBottom: 14 }]}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity key={slot} style={[styles.chip, resTimeSlot === slot && { backgroundColor: BRAND, borderColor: BRAND }]} onPress={() => setResTimeSlot(slot)}>
                    <Text style={[styles.chipText, resTimeSlot === slot && { color: '#fff' }]}>{slot}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Primary table */}
              <Text style={styles.sectionLabel}>PRIMARY TABLE</Text>
              <View style={styles.wrapRow}>
                {tables.filter(isSelectableForReservation).map((t) =>
                  renderTablePickerCard(t, resTableId === t.id, () => selectPrimaryTable(t.id), STATUS_META.reserved.color, `${t.zone} • ${t.seats}s`)
                )}
              </View>
              {tables.filter(isSelectableForReservation).length === 0 && <Text style={styles.warnText}>No available tables to reserve.</Text>}

              {/* Merge tables */}
              <View style={styles.mergeHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionLabel}>MERGE MORE TABLES (BIG PARTY)</Text>
                  <Text style={styles.dialogSub}>Join extra available tables with {primaryResTable?.name || 'the primary table'}.</Text>
                </View>
                <TouchableOpacity style={styles.suggestBtn} onPress={autoSuggestMerge}>
                  <Ionicons name="sparkles" size={14} color="#4F46E5" />
                  <Text style={styles.suggestBtnText}>Auto-fit</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.wrapRow}>
                {tables
                  .filter((t) => t.id !== resTableId && isSelectableForReservation(t))
                  .map((t) =>
                    renderTablePickerCard(
                      t,
                      resLinkedIds.includes(t.id),
                      () => toggleLinkedTable(t.id),
                      '#4F46E5',
                      `${t.zone === primaryResTable?.zone ? 'Same zone' : t.zone} • ${t.seats}s`
                    )
                  )}
              </View>

              {/* Capacity summary */}
              <View style={[styles.capacityBox, { borderColor: capacityOk ? '#1E9E5A55' : '#D6454155', backgroundColor: capacityOk ? '#E9F7EF' : '#FDEDEC' }]}>
                <Ionicons name={capacityOk ? 'checkmark-circle' : 'alert-circle'} size={20} color={capacityOk ? '#1E9E5A' : '#D64541'} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.capacityTitle, { color: capacityOk ? '#1E9E5A' : '#D64541' }]}>
                    {selectedSeats} seats for {guestsNum} guests
                  </Text>
                  <Text style={styles.capacitySub}>
                    {primaryResTable
                      ? [primaryResTable.name, ...resLinkedIds.map((id) => tableById(id)?.name)].filter(Boolean).join(' + ')
                      : 'No table selected'}
                    {!capacityOk && guestsNum > selectedSeats ? ` • need ${guestsNum - selectedSeats} more seat(s)` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, guestsNum ? (selectedSeats / guestsNum) * 100 : 0)}%`,
                      backgroundColor: capacityOk ? '#1E9E5A' : '#D64541',
                    },
                  ]}
                />
              </View>

              <Text style={[styles.label, { marginTop: 14 }]}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, { height: 64, textAlignVertical: 'top' }]}
                placeholder="Birthday, high chair, window side…"
                value={resNotes}
                onChangeText={setResNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setReservationModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: STATUS_META.reserved.color }]} onPress={handleSaveReservation}>
                <Ionicons name="calendar" size={15} color="#fff" />
                <Text style={styles.primaryBtnText}>{editingReservation ? 'Update booking' : 'Confirm booking'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F2EE' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ECE8E1',
  },
  title: { fontSize: 22, fontWeight: '900', color: BRAND },
  subtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  headerBtnGhost: { backgroundColor: '#F4ECF7', borderWidth: 1, borderColor: '#D7BDE2' },
  headerBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  content: { padding: 20, paddingBottom: 40 },

  statsRow: { gap: 10, paddingBottom: 4 },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 160,
    borderWidth: 1,
    borderColor: '#ECE8E1',
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 17, fontWeight: '900', color: '#1C1C1E' },
  statLabel: { fontSize: 11, color: '#8E8E93', fontWeight: '700', textTransform: 'uppercase' },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#E9E5DE',
    borderRadius: 12,
    padding: 4,
    marginVertical: 16,
    alignSelf: 'flex-start',
  },
  segmentItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9 },
  segmentItemActive: { backgroundColor: BRAND },
  segmentText: { fontSize: 14, fontWeight: '700', color: '#636366' },
  segmentTextActive: { color: '#fff' },
  segmentBadge: { backgroundColor: '#7D3C98', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segmentBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  toolbar: { gap: 10, marginBottom: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ECE8E1',
    maxWidth: 360,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#1C1C1E' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E1DA',
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 13, fontWeight: '700', color: '#48484A' },
  zoneChip: { paddingHorizontal: 4, paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: 'transparent', marginRight: 10 },
  zoneChipActive: { borderBottomColor: GOLD },
  zoneChipText: { fontSize: 14, fontWeight: '800', color: '#8E8E93' },

  zoneSection: { marginTop: 14 },
  zoneHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 4 },
  zoneTitle: { fontSize: 16, fontWeight: '900', color: '#1C1C1E' },
  zoneMeta: { fontSize: 12, color: '#8E8E93', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },

  tile: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tileStrip: { height: 5 },
  tileBody: { padding: 14, flex: 1 },
  tileTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tileName: { fontSize: 20, fontWeight: '900', color: '#1C1C1E', flexShrink: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  tileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  tileMetaText: { fontSize: 12, color: '#8E8E93', fontWeight: '600', flexShrink: 1 },
  dot: { color: '#C7C7CC', marginHorizontal: 2 },
  tileFooter: { marginTop: 'auto', paddingTop: 12 },
  tileBill: { fontSize: 18, fontWeight: '900', color: BRAND },
  tileSub: { fontSize: 12, color: '#8E8E93', fontWeight: '600' },
  tileGuest: { fontSize: 14, fontWeight: '800', color: '#7D3C98' },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#F6F3EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  infoChipText: { fontSize: 11, fontWeight: '800', color: BRAND },

  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptyText: { color: '#8E8E93', fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

  resCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECE8E1',
  },
  resTime: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', minWidth: 96 },
  resTimeText: { fontSize: 16, fontWeight: '900' },
  resDateText: { fontSize: 11, color: '#8E8E93', marginTop: 2, fontWeight: '600' },
  resName: { fontSize: 16, fontWeight: '900', color: '#1C1C1E' },
  resMeta: { fontSize: 13, color: '#636366' },
  resNotes: { fontSize: 12, color: '#8E8E93', fontStyle: 'italic' },
  resActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9 },
  smallBtnGhost: { backgroundColor: '#F7F7F8', borderWidth: 1, borderColor: '#E5E5EA' },
  smallBtnText: { fontSize: 12, fontWeight: '800' },

  zoneCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#ECE8E1' },
  zoneCardTitle: { fontSize: 16, fontWeight: '900', color: '#1C1C1E' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#EFEDE8', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: GOLD },

  overlay: { flex: 1, backgroundColor: 'rgba(20,10,12,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 20 },
  sheetMobile: { maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 16 },
  sheetBody: { padding: 18, gap: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#1C1C1E' },
  sheetSub: { fontSize: 13, color: '#8E8E93', fontWeight: '600' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F7' },
  sheetInfo: { borderRadius: 12, padding: 12, gap: 2 },
  sheetInfoLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  sheetInfoValue: { fontSize: 18, fontWeight: '900', color: '#1C1C1E' },
  sheetInfoSub: { fontSize: 12, color: '#636366' },
  sheetDivider: { height: 1, backgroundColor: '#F2F2F7', marginVertical: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, backgroundColor: '#fff' },
  actionRowText: { fontSize: 14, fontWeight: '800' },

  dialog: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 20, padding: 22 },
  dialogTitle: { fontSize: 20, fontWeight: '900', color: BRAND, marginBottom: 6 },
  dialogSub: { fontSize: 12, color: '#8E8E93', marginBottom: 10 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10 },
  ghostBtnText: { color: '#636366', fontWeight: '700', fontSize: 15 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GOLD, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: '#AEAEB2', letterSpacing: 0.8, marginBottom: 8, marginTop: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#3A3A3C', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E1DA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginBottom: 12, backgroundColor: '#FCFBF9' },
  formRow: { flexDirection: 'row', gap: 12 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  warnText: { color: '#D64541', fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E1DA', borderRadius: 10, marginBottom: 12, backgroundColor: '#FCFBF9' },
  stepBtn: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#1C1C1E', paddingVertical: 10 },

  pickCard: {
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E1DA',
    backgroundColor: '#FCFBF9',
    alignItems: 'center',
  },
  pickCheck: { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pickName: { fontSize: 15, fontWeight: '900', color: '#1C1C1E' },
  pickSub: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  mergeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  suggestBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, marginTop: 4 },
  suggestBtnText: { color: '#4F46E5', fontWeight: '800', fontSize: 12 },
  capacityBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  capacityTitle: { fontSize: 14, fontWeight: '900' },
  capacitySub: { fontSize: 12, color: '#636366', marginTop: 2 },
});
