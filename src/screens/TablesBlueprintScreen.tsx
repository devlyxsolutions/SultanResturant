import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import RoyalDropdown from '../components/RoyalDropdown';
import SeatingTypeIcon from '../components/SeatingTypeIcon';
import {
  FLOOR_ORDER,
  FLOOR_TEMPLATE,
  SEATING_ZONES,
  SEATING_ZONE_TYPES,
  SeatingZoneType,
  getFloorMeta,
  getTableFloor,
  getTableSeatingType,
  sortFloors,
} from '../constants/floors';
import { broadcastImmediately } from '../services/syncService';
import { Reservation, Table, useRestaurantStore } from '../store/restaurantStore';
import { useRolePermissions } from '../store/roleStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  generateTableQrCode,
  getTableMenuUrl,
  printAllTablesStandeesHtml,
  printTableStandeeHtml,
} from '../utils/qrCode';
import {
  findTableReservation,
  getFloorActiveReservations,
  getReservationFloor,
  getReservationTableCount,
  isGroupReservation,
} from '../utils/reservationHelpers';

type IconName = keyof typeof Ionicons.glyphMap;
type TabKey = 'tables' | 'reservations' | 'zones';
type StatusFilter = 'all' | Table['status'];

const BRAND = '#4a121a';
const GOLD = '#D5A943';
const GROUP_ACCENT = '#6D28D9';

const STATUS_META: Record<Table['status'], { label: string; color: string; bg: string; icon: IconName }> = {
  available: { label: 'Available', color: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  occupied: { label: 'Occupied', color: '#DC2626', bg: '#FEE2E2', icon: 'people' },
  billed: { label: 'Billed', color: '#D97706', bg: '#FEF3C7', icon: 'receipt' },
  reserved: { label: 'Reserved', color: '#7C3AED', bg: '#F3E8FF', icon: 'calendar' },
};

const MEAL_TIME_GROUPS: {
  key: 'lunch' | 'hitea' | 'dinner' | 'custom';
  label: string;
  sub: string;
  icon: IconName;
  slots: string[];
}[] = [
  {
    key: 'lunch',
    label: 'Lunch',
    sub: '12–4 PM',
    icon: 'sunny-outline',
    slots: ['12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM'],
  },
  {
    key: 'hitea',
    label: 'Hi-Tea',
    sub: '4–7 PM',
    icon: 'cafe-outline',
    slots: ['04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM'],
  },
  {
    key: 'dinner',
    label: 'Dinner',
    sub: '7–11:30 PM',
    icon: 'moon-outline',
    slots: ['07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM'],
  },
  {
    key: 'custom',
    label: 'Custom',
    sub: 'Exact Time',
    icon: 'options-outline',
    slots: [],
  },
];

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toLocalIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseIsoDateSafe = (iso?: string): Date => {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const formatDisplayDate = (iso?: string): string => {
  const d = parseIsoDateSafe(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

const parseTimeSlotParts = (slot: string): { hour: number; minute: number; period: 'AM' | 'PM' } => {
  const match = String(slot || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    const h = Math.min(12, Math.max(1, parseInt(match[1], 10) || 8));
    const m = Math.min(59, Math.max(0, parseInt(match[2], 10) || 0));
    const p = match[3].toUpperCase() === 'AM' ? 'AM' : 'PM';
    return { hour: h, minute: m, period: p };
  }
  return { hour: 8, minute: 0, period: 'PM' };
};

const formatTimeSlotParts = (hour: number, minute: number, period: 'AM' | 'PM') =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;

const getMealPeriodLabel = (slot: string): string => {
  const { hour, period } = parseTimeSlotParts(slot);
  const h24 = period === 'AM' ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12);
  if (h24 >= 12 && h24 < 16) return 'Lunch';
  if (h24 >= 16 && h24 < 19) return 'Hi-Tea';
  if (h24 >= 19 || h24 < 2) return 'Dinner';
  return 'Morning';
};

const GUEST_PRESETS = [4, 8, 12, 15, 20, 25, 30, 40, 50];

const EVENT_OCCASIONS = [
  'Family Gathering',
  'Birthday Party',
  'Corporate Dinner',
  'Private Feast',
  'Engagement / Nikkah',
  'Friends Meetup',
  'VIP Group',
];

const ARRANGEMENT_STYLES = [
  'Joined Long Table',
  'U-Shape Setup',
  'Rooftop Open Lounge',
  'Private Majlis Cabins',
  'Dedicated Floor Section',
  'Full Floor Exclusive',
];

const getDateOffsetIso = (daysOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return toLocalIsoDate(d);
};

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

export interface TablesBlueprintScreenProps {
  role?: 'admin' | 'manager';
  backRoute?: string;
  posRoute?: string;
  floorsRoute?: string;
}

export default function TablesBlueprintScreen({
  role = 'admin',
  backRoute = role === 'manager' ? '/manager/dashboard' : '/admin/dashboard',
  posRoute = role === 'manager' ? '/manager/pos' : '/admin/pos',
  floorsRoute = role === 'manager' ? '/manager/floors' : '/admin/floors',
}: TablesBlueprintScreenProps = {}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ prefillFloor?: string }>();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isSmallMobile = width < 420;
  const columns = width < 420 ? 1 : width < 760 ? 2 : width < 1120 ? 3 : width < 1460 ? 4 : 5;

  const {
    can,
    canViewRevenue,
    canAddTables,
    canEditTables,
    canDeleteTables,
  } = useRolePermissions(role === 'manager' ? 'manager' : undefined);

  const systemSettings = useSettingsStore((s) => s.settings);
  const rawTables = useRestaurantStore((s) => s.tables) || [];
  const tables = useMemo(() => {
    const seen = new Set<string>();
    return rawTables.filter((t) => {
      if (!t || !t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [rawTables]);

  const zones = useRestaurantStore((s) => s.zones) || [];
  const dynamicFloors = useRestaurantStore((s) => s.floors) || [];
  const tickets = useRestaurantStore((s) => s.tickets) || [];
  const reservations = useRestaurantStore((s) => s.reservations) || [];

  const addTable = useRestaurantStore((s) => s.addTable);
  const updateTable = useRestaurantStore((s) => s.updateTable);
  const deleteTable = useRestaurantStore((s) => s.deleteTable);
  const addZone = useRestaurantStore((s) => s.addZone);
  const settleBill = useRestaurantStore((s) => s.settleBill);
  const transferTable = useRestaurantStore((s) => s.transferTable);
  const mergeTables = useRestaurantStore((s) => s.mergeTables);
  const addReservation = useRestaurantStore((s) => s.addReservation);
  const updateReservation = useRestaurantStore((s) => s.updateReservation);
  const cancelReservation = useRestaurantStore((s) => s.cancelReservation);
  const seatReservation = useRestaurantStore((s) => s.seatReservation);

  const [activeTab, setActiveTab] = useState<TabKey>('tables');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [floorFilter, setFloorFilter] = useState<string>(() => params.prefillFloor || 'all');
  const [seatingTypeFilter, setSeatingTypeFilter] = useState<'all' | SeatingZoneType>('all');
  const [search, setSearch] = useState('');

  // Reservations tab filters
  const [resFilter, setResFilter] = useState<'all' | Reservation['status']>('confirmed');
  const [resTypeFilter, setResTypeFilter] = useState<'all' | 'group_event' | 'regular'>('all');
  const [resFloorFilter, setResFloorFilter] = useState<string>('all');

  const [prevPrefill, setPrevPrefill] = useState(params.prefillFloor);
  if (params.prefillFloor !== prevPrefill) {
    setPrevPrefill(params.prefillFloor);
    setFloorFilter(params.prefillFloor || 'all');
  }

  // Action sheet for a tapped table
  const [actionTableId, setActionTableId] = useState<string | null>(null);
  const actionTable = actionTableId ? tables.find((t) => t.id === actionTableId) || null : null;

  // Table & Cabin form
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formFloor, setFormFloor] = useState<string>('Ground Floor');
  const [formSeatingType, setFormSeatingType] = useState<SeatingZoneType>('tables');
  const [formName, setFormName] = useState('');
  const [formSeats, setFormSeats] = useState('4');

  // Zone form
  const [zoneModalVisible, setZoneModalVisible] = useState(false);
  const [formNewZone, setFormNewZone] = useState('');

  // Transfer / merge
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferToTableId, setTransferToTableId] = useState('');
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeSecondaryTableId, setMergeSecondaryTableId] = useState('');
  const [sourceTable, setSourceTable] = useState<Table | null>(null);

  // Reservation & Group Event Arrangement form
  const [reservationModalVisible, setReservationModalVisible] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [resBookingType, setResBookingType] = useState<'regular' | 'group_event'>('group_event');
  const [resFloor, setResFloor] = useState<string>('Rooftop');
  const [resIncludeOtherFloors, setResIncludeOtherFloors] = useState(false);
  const [resCustomerName, setResCustomerName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resTableId, setResTableId] = useState('');
  const [resLinkedIds, setResLinkedIds] = useState<string[]>([]);
  const [resDate, setResDate] = useState(() => getDateOffsetIso(0));
  const [resTimeSlot, setResTimeSlot] = useState('08:00 PM');
  const [activeSchedulePicker, setActiveSchedulePicker] = useState<'none' | 'date' | 'time'>('none');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [activeTimeTab, setActiveTimeTab] = useState<'lunch' | 'hitea' | 'dinner' | 'custom'>('dinner');
  const [resGuestsCount, setResGuestsCount] = useState('25');
  const [resOccasion, setResOccasion] = useState('Family Gathering');
  const [resArrangementStyle, setResArrangementStyle] = useState('Joined Long Table');
  const [resAdvanceDeposit, setResAdvanceDeposit] = useState('');
  const [resIsFullFloor, setResIsFullFloor] = useState(false);
  const [resNotes, setResNotes] = useState('');

  const [now, setNow] = useState(() => Date.now());

  // Table QR Code Generation & Acrylic Standee Printing
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Batch Floor Standees Printing
  const [batchQrModalVisible, setBatchQrModalVisible] = useState(false);
  const [batchQrMap, setBatchQrMap] = useState<Record<string, string>>({});
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const tableById = (id?: string) => tables.find((t) => t.id === id);

  // Floors list: strictly case-insensitive deduplicated & ordered (prevents "Rooftop" + "ROOFTOP" duplicates)
  const availableFloors = useMemo(() => {
    const floorMap = new Map<string, string>();
    const addUnique = (raw?: string) => {
      const cleaned = (raw || '').trim();
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (!floorMap.has(key)) {
        floorMap.set(key, cleaned);
      } else {
        // Prefer Title Case (e.g. "Rooftop") over ALL CAPS ("ROOFTOP")
        const existing = floorMap.get(key)!;
        if (existing === existing.toUpperCase() && cleaned !== cleaned.toUpperCase()) {
          floorMap.set(key, cleaned);
        }
      }
    };

    (dynamicFloors || []).forEach((f) => addUnique(f?.name));
    tables.forEach((t) => addUnique(getTableFloor(t)));

    const list = Array.from(floorMap.values());
    return sortFloors(list.length > 0 ? list : FLOOR_ORDER);
  }, [dynamicFloors, tables]);

  // Visible seating units respecting system settings
  const enabledTables = useMemo(() => {
    return tables.filter((t) => {
      const tType = getTableSeatingType(t);
      if (tType === 'majlis' && systemSettings.enableMajlisSeating === false) return false;
      if (tType === 'couches' && systemSettings.enableCouchSeating === false) return false;
      return true;
    });
  }, [tables, systemSettings.enableMajlisSeating, systemSettings.enableCouchSeating]);

  // ---------- Metrics ----------
  const counts = useMemo(() => {
    const c = { available: 0, occupied: 0, billed: 0, reserved: 0 };
    enabledTables.forEach((t) => {
      if (t.status in c) c[t.status] += 1;
      else c.available += 1;
    });
    return c;
  }, [enabledTables]);

  const totalSeats = useMemo(() => enabledTables.reduce((s, t) => s + (t.seats || 0), 0), [enabledTables]);
  const availableSeats = useMemo(
    () => enabledTables.filter((t) => t.status === 'available').reduce((s, t) => s + (t.seats || 0), 0),
    [enabledTables]
  );
  const occupiedSeats = useMemo(
    () =>
      enabledTables
        .filter((t) => t.status === 'occupied' || t.status === 'billed')
        .reduce((s, t) => s + (t.seats || 0), 0),
    [enabledTables]
  );
  const occupancyPct = totalSeats ? Math.round((occupiedSeats / totalSeats) * 100) : 0;
  const liveRevenue = useMemo(
    () =>
      enabledTables
        .filter((t) => t.status === 'occupied' || t.status === 'billed')
        .reduce((s, t) => s + (t.billTotal || 0), 0),
    [enabledTables]
  );

  const activeReservations = useMemo(
    () => reservations.filter((r) => r.status === 'confirmed' || r.status === 'seated'),
    [reservations]
  );
  const upcomingConfirmedCount = useMemo(
    () => reservations.filter((r) => r.status === 'confirmed').length,
    [reservations]
  );
  const activeGroupBookings = useMemo(
    () =>
      activeReservations
        .filter((r) => isGroupReservation(r))
        .sort((a, b) => (a.reservationDate + a.timeSlot).localeCompare(b.reservationDate + b.timeSlot)),
    [activeReservations]
  );

  // Per-floor summary stats for floor tabs & group planner
  const floorCapacityMap = useMemo(() => {
    const map: Record<
      string,
      {
        totalUnits: number;
        availableUnits: number;
        totalSeats: number;
        availableSeats: number;
        reservedUnits: number;
        occupiedUnits: number;
        activeGroups: number;
      }
    > = {};

    availableFloors.forEach((fl) => {
      const flTables = enabledTables.filter((t) => getTableFloor(t).toLowerCase() === fl.toLowerCase());
      const flGroups = getFloorActiveReservations(reservations, tables, fl).filter(isGroupReservation);
      map[fl.toLowerCase()] = {
        totalUnits: flTables.length,
        availableUnits: flTables.filter((t) => t.status === 'available').length,
        totalSeats: flTables.reduce((s, t) => s + (t.seats || 0), 0),
        availableSeats: flTables.filter((t) => t.status === 'available').reduce((s, t) => s + (t.seats || 0), 0),
        reservedUnits: flTables.filter((t) => t.status === 'reserved').length,
        occupiedUnits: flTables.filter((t) => t.status === 'occupied' || t.status === 'billed').length,
        activeGroups: flGroups.length,
      };
    });
    return map;
  }, [availableFloors, enabledTables, reservations, tables]);

  // ---------- Filtering ----------
  const scopedTables = useMemo(() => {
    return enabledTables.filter((t) => {
      if (floorFilter === 'all') return true;
      return getTableFloor(t).toLowerCase() === floorFilter.toLowerCase();
    });
  }, [enabledTables, floorFilter]);

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedTables.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      const tType = getTableSeatingType(t);
      if (seatingTypeFilter !== 'all' && tType !== seatingTypeFilter) return false;
      if (q) {
        const res = findTableReservation(t, reservations);
        const matchesName = t.name.toLowerCase().includes(q);
        const matchesFloor = getTableFloor(t).toLowerCase().includes(q);
        const matchesGuest = Boolean(res?.customerName?.toLowerCase().includes(q));
        const matchesOccasion = Boolean(res?.occasion?.toLowerCase().includes(q));
        if (!matchesName && !matchesFloor && !matchesGuest && !matchesOccasion) return false;
      }
      return true;
    });
  }, [scopedTables, statusFilter, seatingTypeFilter, search, reservations]);

  // Grouped by floor when viewing All Floors
  const groupedBlueprintFloors = useMemo(() => {
    if (floorFilter !== 'all') {
      return [{ floor: floorFilter, items: filteredTables }];
    }
    const groups: { floor: string; items: Table[] }[] = [];
    availableFloors.forEach((fl) => {
      const items = filteredTables.filter((t) => getTableFloor(t).toLowerCase() === fl.toLowerCase());
      if (items.length > 0) groups.push({ floor: fl, items });
    });
    const coveredIds = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
    const leftovers = filteredTables.filter((t) => !coveredIds.has(t.id));
    if (leftovers.length > 0) groups.push({ floor: 'Other Floor', items: leftovers });
    return groups;
  }, [floorFilter, availableFloors, filteredTables]);

  const zoneSummary = useMemo(() => {
    const tablesList = scopedTables.filter((t) => getTableSeatingType(t) === 'tables');
    const couchesList = scopedTables.filter((t) => getTableSeatingType(t) === 'couches');
    const majlisList = scopedTables.filter((t) => getTableSeatingType(t) === 'majlis');
    const freeSeatsCount = scopedTables
      .filter((t) => t.status === 'available')
      .reduce((s, t) => s + (t.seats || 0), 0);

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
      freeSeats: freeSeatsCount,
    };
  }, [scopedTables]);

  const filteredReservations = useMemo(() => {
    return reservations
      .filter((r) => {
        if (resFilter !== 'all' && r.status !== resFilter) return false;
        if (resTypeFilter === 'group_event' && !isGroupReservation(r)) return false;
        if (resTypeFilter === 'regular' && isGroupReservation(r)) return false;
        if (resFloorFilter !== 'all') {
          const rf = getReservationFloor(r, tables).toLowerCase();
          if (rf !== resFloorFilter.toLowerCase()) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Confirmed & seated first, then by date/time
        const rank = (s: Reservation['status']) =>
          s === 'confirmed' ? 0 : s === 'seated' ? 1 : s === 'completed' ? 2 : 3;
        return rank(a.status) - rank(b.status) || (a.reservationDate + a.timeSlot).localeCompare(b.reservationDate + b.timeSlot);
      });
  }, [reservations, resFilter, resTypeFilter, resFloorFilter, tables]);

  // ---------- QR Actions ----------
  const openTableQrModal = async (table: Table) => {
    setActionTableId(null);
    setQrTable(table);
    setQrDataUrl('');
    setIsGeneratingQr(true);
    setCopiedLink(false);
    setQrModalVisible(true);
    try {
      const url = await generateTableQrCode(table.id, table.floor, table.name);
      setQrDataUrl(url);
    } catch {
      notify('QR Generation', 'Could not generate QR code for this table.');
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const openBatchQrModal = async () => {
    setBatchQrModalVisible(true);
    setIsBatchGenerating(true);
    const targetTables = floorFilter === 'all' ? enabledTables : filteredTables;
    const newMap: Record<string, string> = { ...batchQrMap };
    for (const t of targetTables) {
      if (!newMap[t.id]) {
        try {
          newMap[t.id] = await generateTableQrCode(t.id, t.floor, t.name);
        } catch { }
      }
    }
    setBatchQrMap(newMap);
    setIsBatchGenerating(false);
  };

  const handleCopyTableLink = (table: Table) => {
    const link = getTableMenuUrl(table.id, table.floor, table.name);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } else {
      notify('Table Link', link);
    }
  };

  // ---------- 5-Floor Auto-Gen ----------
  const handlePopulateDefault5Floors = () => {
    if (!canAddTables) {
      return notify('Access Denied', 'You do not have permission to add tables.');
    }
    const msg =
      'Auto-generate standard Sultan 5-Floor seating layout (Ground, 1st, 2nd Banquet, 3rd VIP Lounge, and Rooftop BBQ)? Existing tables will be preserved.';
    confirmAction('5-Floor Auto-Generator', msg, 'Auto-Generate', () => {
      let created = 0;
      FLOOR_TEMPLATE.forEach((f) => {
        const existingForFloor = tables.filter((t) => getTableFloor(t).toLowerCase() === f.zone.toLowerCase());
        if (existingForFloor.length === 0) {
          f.seats.forEach((seatCount, idx) => {
            const tableNum = String(idx + 1).padStart(2, '0');
            addTable({
              name: `${f.prefix}-${tableNum}`,
              floor: f.zone,
              zone: f.zone,
              seatingType: 'tables',
              seats: seatCount,
              status: 'available',
            });
            created++;
          });
        }
      });
      broadcastImmediately();
      notify(
        '5-Floor Auto-Generator',
        created > 0
          ? `Successfully created ${created} tables across the Sultan 5-floor layout.`
          : 'All 5 Sultan floors already have seating units configured.'
      );
    });
  };

  // ---------- Table & Cabin CRUD ----------
  const openAddTableModal = (defaultFloor?: string, defaultType?: SeatingZoneType) => {
    if (!canAddTables) {
      return notify('Permission Denied', 'You do not have permission to add seating units.');
    }
    setEditingTable(null);
    const chosenFloor = defaultFloor || (floorFilter !== 'all' ? floorFilter : availableFloors[0] || 'Ground Floor');
    const chosenType = defaultType || (seatingTypeFilter !== 'all' ? seatingTypeFilter : 'tables');
    setFormFloor(chosenFloor);
    setFormSeatingType(chosenType);

    const floorItems = tables.filter(
      (t) => getTableFloor(t).toLowerCase() === chosenFloor.toLowerCase() && getTableSeatingType(t) === chosenType
    );
    const nextNum = floorItems.length + 1;

    if (chosenType === 'majlis') {
      setFormName(`Cabin ${nextNum}`);
      setFormSeats('8');
    } else if (chosenType === 'couches') {
      setFormName(`Couch ${nextNum}`);
      setFormSeats('6');
    } else {
      const meta = getFloorMeta(chosenFloor, dynamicFloors);
      setFormName(`${meta.short || 'T'}-${String(nextNum).padStart(2, '0')}`);
      setFormSeats('4');
    }
    setTableModalVisible(true);
  };

  const openEditTableModal = (table: Table) => {
    if (!canEditTables) {
      return notify('Permission Denied', 'You do not have permission to edit tables.');
    }
    setActionTableId(null);
    setEditingTable(table);
    setFormFloor(getTableFloor(table));
    setFormSeatingType(getTableSeatingType(table));
    setFormName(table.name);
    setFormSeats(table.seats.toString());
    setTableModalVisible(true);
  };

  const handleSaveTable = () => {
    if (editingTable ? !canEditTables : !canAddTables) {
      return notify('Permission Denied', 'You do not have permission to save table changes.');
    }
    const seatsNum = parseInt(formSeats, 10);
    if (!formName.trim() || !formFloor.trim()) {
      return notify('Missing Info', 'Please enter a name/number and select a floor.');
    }
    if (isNaN(seatsNum) || seatsNum <= 0) {
      return notify('Invalid Capacity', 'Sitting capacity must be a positive number.');
    }
    const duplicate = tables.some(
      (t) => t.name.toLowerCase() === formName.trim().toLowerCase() && t.id !== editingTable?.id
    );
    if (duplicate) {
      return notify('Duplicate Name', `A seating unit named "${formName.trim()}" already exists.`);
    }

    const payload: Partial<Table> = {
      name: formName.trim(),
      floor: formFloor,
      zone: formFloor,
      seatingType: formSeatingType,
      cabinNumber: formSeatingType === 'majlis' ? formName.trim() : undefined,
      seats: seatsNum,
    };

    if (editingTable) {
      updateTable(editingTable.id, payload);
    } else {
      addTable({
        ...payload,
        status: 'available',
      } as any);
    }
    broadcastImmediately();
    setTableModalVisible(false);
  };

  const handleDeleteTable = (table: Table) => {
    if (!canDeleteTables) {
      return notify('Permission Denied', 'You do not have permission to delete tables.');
    }
    if (table.status !== 'available') {
      return notify('Cannot Delete', `${table.name} is currently ${table.status}. Release it first.`);
    }
    confirmAction('Delete Unit', `Delete ${table.name} permanently?`, 'Delete', () => {
      deleteTable(table.id);
      broadcastImmediately();
      setActionTableId(null);
    });
  };

  const handleClearTable = (table: Table) => {
    const linkedCount = tables.filter((t) => t.mergedInto === table.id).length;
    const extra = linkedCount ? ` ${linkedCount} joined table(s) will also be released.` : '';
    confirmAction(
      'Clear & Release Table',
      `Release ${table.name}? Running bill and kitchen tickets will be reset.${extra}`,
      'Clear & Release',
      () => {
        settleBill(table.id);
        broadcastImmediately();
        setActionTableId(null);
      }
    );
  };

  const handleUnlinkTable = (table: Table) => {
    const primary = tableById(table.mergedInto);
    confirmAction(
      'Unlink Table',
      `Detach ${table.name} from ${primary?.name || 'its group'} and make it available?`,
      'Unlink',
      () => {
        updateTable(table.id, {
          status: 'available',
          mergedInto: undefined,
          reservationId: undefined,
          occupiedSince: undefined,
        });
        broadcastImmediately();
        setActionTableId(null);
      }
    );
  };

  // ---------- Transfer / Merge ----------
  const openTransferModal = (table: Table) => {
    setActionTableId(null);
    setSourceTable(table);
    setTransferToTableId(enabledTables.find((t) => t.status === 'available' && t.id !== table.id)?.id || '');
    setTransferModalVisible(true);
  };

  const handleConfirmTransfer = () => {
    const target = tableById(transferToTableId);
    if (!sourceTable || !target || target.status !== 'available') {
      return notify('Select Table', 'Please select an available destination table.');
    }
    transferTable(sourceTable.id, target.id);
    broadcastImmediately();
    setTransferModalVisible(false);
    notify('Transferred', `${sourceTable.name} order moved to ${target.name}. Kitchen tickets updated.`);
  };

  const openMergeModal = (table: Table) => {
    setActionTableId(null);
    setSourceTable(table);
    setMergeSecondaryTableId(
      enabledTables.find((t) => (t.status === 'occupied' || t.status === 'billed') && t.id !== table.id && !t.mergedInto)?.id || ''
    );
    setMergeModalVisible(true);
  };

  const handleConfirmMerge = () => {
    const sec = tableById(mergeSecondaryTableId);
    if (!sourceTable || !sec) return notify('Select Table', 'Please select a table to merge.');
    mergeTables(sourceTable.id, sec.id);
    broadcastImmediately();
    setMergeModalVisible(false);
    notify('Merged', `${sec.name} merged into ${sourceTable.name}.`);
  };

  // ---------- Group / Event & Table Reservations ----------
  const isSelectableForReservation = (t: Table) =>
    t.status === 'available' ||
    (!!editingReservation &&
      (t.reservationId === editingReservation.id ||
        editingReservation.tableId === t.id ||
        Boolean(editingReservation.linkedTableIds?.includes(t.id))));

  const findRooftopOrDefaultFloor = (preferredFloor?: string) => {
    if (preferredFloor && preferredFloor !== 'all') return preferredFloor;
    const rooftop = availableFloors.find((fl) => fl.toLowerCase().includes('roof'));
    return rooftop || availableFloors[0] || 'Ground Floor';
  };

  const autoPickTablesForFloor = (targetFloor: string, targetGuests: number, includeOther = false) => {
    const sameFloorCandidates = enabledTables
      .filter((t) => isSelectableForReservation(t) && getTableFloor(t).toLowerCase() === targetFloor.toLowerCase())
      .sort((a, b) => b.seats - a.seats);

    const otherFloorCandidates = includeOther
      ? enabledTables
        .filter((t) => isSelectableForReservation(t) && getTableFloor(t).toLowerCase() !== targetFloor.toLowerCase())
        .sort((a, b) => b.seats - a.seats)
      : [];

    const pool = [...sameFloorCandidates, ...otherFloorCandidates];
    if (pool.length === 0) {
      return { primaryId: '', linkedIds: [] as string[], coveredSeats: 0 };
    }

    // If a single table on the floor fits cleanly (closest >= targetGuests), prefer it for small parties
    if (targetGuests <= 10) {
      const exactSingle = [...sameFloorCandidates]
        .filter((t) => t.seats >= targetGuests)
        .sort((a, b) => a.seats - b.seats)[0];
      if (exactSingle) {
        return { primaryId: exactSingle.id, linkedIds: [], coveredSeats: exactSingle.seats };
      }
    }

    const picked: Table[] = [];
    let covered = 0;
    for (const candidate of pool) {
      if (covered >= targetGuests) break;
      picked.push(candidate);
      covered += candidate.seats || 0;
    }

    return {
      primaryId: picked[0]?.id || '',
      linkedIds: picked.slice(1).map((t) => t.id),
      coveredSeats: covered,
    };
  };

  const openReservationModal = (opts?: {
    mode?: 'regular' | 'group_event';
    prefillTableId?: string;
    prefillFloor?: string;
    defaultGuests?: number;
  }) => {
    setActionTableId(null);
    setEditingReservation(null);
    const mode = opts?.mode || 'regular';
    const prefillTable = opts?.prefillTableId ? tableById(opts.prefillTableId) : undefined;
    const chosenFloor = prefillTable
      ? getTableFloor(prefillTable)
      : findRooftopOrDefaultFloor(opts?.prefillFloor || (floorFilter !== 'all' ? floorFilter : undefined));

    const guests = opts?.defaultGuests ?? (mode === 'group_event' ? 25 : prefillTable?.seats || 4);

    setResBookingType(mode);
    setResFloor(chosenFloor);
    setResIncludeOtherFloors(false);
    setResCustomerName('');
    setResPhone('');
    setResDate(getDateOffsetIso(0));
    const todayDate = new Date();
    setCalendarMonth({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
    setActiveSchedulePicker('none');
    setActiveTimeTab('dinner');
    setResTimeSlot('08:00 PM');
    setResGuestsCount(String(guests));
    setResOccasion(mode === 'group_event' ? 'Family Gathering' : '');
    setResArrangementStyle(
      chosenFloor.toLowerCase().includes('roof') ? 'Rooftop Open Lounge' : 'Joined Long Table'
    );
    setResAdvanceDeposit('');
    setResIsFullFloor(false);
    setResNotes('');

    if (prefillTable) {
      setResTableId(prefillTable.id);
      setResLinkedIds([]);
    } else {
      const picked = autoPickTablesForFloor(chosenFloor, guests, false);
      setResTableId(picked.primaryId);
      setResLinkedIds(picked.linkedIds);
    }
    setReservationModalVisible(true);
  };

  const openEditReservationModal = (res: Reservation) => {
    setActionTableId(null);
    setEditingReservation(res);
    const floor = getReservationFloor(res, tables);
    setResBookingType(isGroupReservation(res) ? 'group_event' : 'regular');
    setResFloor(floor);
    const hasOtherFloorTable = [res.tableId, ...(res.linkedTableIds || [])].some((id) => {
      const tb = tableById(id);
      return tb && getTableFloor(tb).toLowerCase() !== floor.toLowerCase();
    });
    setResIncludeOtherFloors(hasOtherFloorTable);
    setResCustomerName(res.customerName);
    setResPhone(res.phone);
    setResTableId(res.tableId);
    setResLinkedIds(res.linkedTableIds || []);
    setResDate(res.reservationDate);
    const parsedEditDate = parseIsoDateSafe(res.reservationDate);
    setCalendarMonth({ year: parsedEditDate.getFullYear(), month: parsedEditDate.getMonth() });
    setActiveSchedulePicker('none');
    setResTimeSlot(res.timeSlot);
    setResGuestsCount(String(res.guestsCount));
    setResOccasion(res.occasion || 'Family Gathering');
    setResArrangementStyle(res.arrangementStyle || 'Joined Long Table');
    setResAdvanceDeposit(res.advanceDeposit ? String(res.advanceDeposit) : '');
    setResIsFullFloor(Boolean(res.isFullFloor));
    setResNotes(res.notes || '');
    setReservationModalVisible(true);
  };

  const guestsNum = parseInt(resGuestsCount, 10) || 0;
  const allSelectedIds = useMemo(
    () => (resTableId ? [resTableId, ...resLinkedIds.filter((id) => id !== resTableId)] : []),
    [resTableId, resLinkedIds]
  );
  const primaryResTable = tableById(resTableId);
  const selectedSeats = useMemo(
    () => allSelectedIds.reduce((sum, id) => sum + (tableById(id)?.seats || 0), 0),
    [allSelectedIds, tables]
  );
  const seatsShortfall = Math.max(0, guestsNum - selectedSeats);
  const capacityOk = selectedSeats >= guestsNum && guestsNum > 0;

  const modalFloorUnits = useMemo(() => {
    const primaryFloorUnits = enabledTables.filter(
      (t) => getTableFloor(t).toLowerCase() === resFloor.toLowerCase()
    );
    if (!resIncludeOtherFloors) return primaryFloorUnits;
    const otherUnits = enabledTables.filter(
      (t) => getTableFloor(t).toLowerCase() !== resFloor.toLowerCase()
    );
    return [...primaryFloorUnits, ...otherUnits];
  }, [enabledTables, resFloor, resIncludeOtherFloors]);

  const handleToggleModalUnit = (tableId: string) => {
    setResIsFullFloor(false);
    if (resTableId === tableId) {
      // Promote first linked table to primary, or clear
      if (resLinkedIds.length > 0) {
        setResTableId(resLinkedIds[0]);
        setResLinkedIds(resLinkedIds.slice(1));
      } else {
        setResTableId('');
      }
      return;
    }
    if (resLinkedIds.includes(tableId)) {
      setResLinkedIds((prev) => prev.filter((id) => id !== tableId));
      return;
    }
    if (!resTableId) {
      setResTableId(tableId);
    } else {
      setResLinkedIds((prev) => [...prev, tableId]);
    }
  };

  const handleAutoArrangeFloor = () => {
    if (guestsNum <= 0) {
      return notify('Enter Guest Count', 'Please enter how many guests you are arranging seating for.');
    }
    const picked = autoPickTablesForFloor(resFloor, guestsNum, resIncludeOtherFloors);
    if (!picked.primaryId) {
      return notify(
        'No Free Seating Units',
        `There are no available tables or cabins on ${resFloor} right now. Try selecting another floor or enabling "Include Other Floors".`
      );
    }
    setResIsFullFloor(false);
    setResTableId(picked.primaryId);
    setResLinkedIds(picked.linkedIds);
    if (picked.coveredSeats < guestsNum) {
      notify(
        'Partial Capacity Selected',
        `Selected all ${1 + picked.linkedIds.length} available unit(s) on ${resFloor} (${picked.coveredSeats} seats). You can arrange +${guestsNum - picked.coveredSeats} extra chairs or enable "Include Other Floors".`
      );
    }
  };

  const handleReserveEntireFloor = () => {
    const freeOnFloor = enabledTables.filter(
      (t) => isSelectableForReservation(t) && getTableFloor(t).toLowerCase() === resFloor.toLowerCase()
    );
    if (freeOnFloor.length === 0) {
      return notify('Floor Unavailable', `No available seating units found on ${resFloor}.`);
    }
    setResTableId(freeOnFloor[0].id);
    setResLinkedIds(freeOnFloor.slice(1).map((t) => t.id));
    setResIsFullFloor(true);
    setResBookingType('group_event');
    setResArrangementStyle('Full Floor Exclusive');
  };

  const handleSwitchReservationFloor = (newFloor: string) => {
    setResFloor(newFloor);
    setResIsFullFloor(false);
    if (newFloor.toLowerCase().includes('roof')) {
      setResArrangementStyle('Rooftop Open Lounge');
    }
    if (!editingReservation) {
      const picked = autoPickTablesForFloor(newFloor, guestsNum || 20, false);
      setResTableId(picked.primaryId);
      setResLinkedIds(picked.linkedIds);
    }
  };

  const handleSaveReservation = () => {
    if (!resCustomerName.trim() || !resPhone.trim()) {
      return notify('Missing Guest Info', 'Customer name and phone number are required.');
    }
    if (!primaryResTable) {
      return notify('Select Seating Units', `Please select at least one table or cabin on ${resFloor}.`);
    }
    if (guestsNum <= 0) {
      return notify('Invalid Party Size', 'Please enter a valid number of guests.');
    }

    const doSave = () => {
      const linked = resLinkedIds.filter((id) => id !== resTableId);
      const tableName = [primaryResTable.name, ...linked.map((id) => tableById(id)?.name || id)].join(' + ');
      const depositVal = parseFloat(resAdvanceDeposit) || 0;
      const effectiveType: 'regular' | 'group_event' =
        resBookingType === 'group_event' || guestsNum >= 10 || linked.length > 0 || resIsFullFloor
          ? 'group_event'
          : 'regular';

      const payload = {
        tableId: resTableId,
        tableName,
        floor: resFloor,
        linkedTableIds: linked,
        bookingType: effectiveType,
        occasion: effectiveType === 'group_event' ? resOccasion || 'Group Event' : resOccasion || undefined,
        arrangementStyle:
          effectiveType === 'group_event' ? resArrangementStyle || 'Joined Long Table' : undefined,
        advanceDeposit: depositVal > 0 ? depositVal : undefined,
        extraChairsNeeded: seatsShortfall > 0 ? seatsShortfall : undefined,
        isFullFloor: resIsFullFloor || undefined,
        customerName: resCustomerName.trim(),
        phone: resPhone.trim(),
        guestsCount: guestsNum,
        reservationDate: resDate.trim() || getDateOffsetIso(0),
        timeSlot: resTimeSlot,
        notes: resNotes.trim(),
      };

      if (editingReservation) {
        updateReservation(editingReservation.id, payload);
      } else {
        addReservation({ ...payload, status: 'confirmed' });
      }
      broadcastImmediately();
      setReservationModalVisible(false);
      notify(
        editingReservation
          ? 'Arrangement Updated'
          : effectiveType === 'group_event'
            ? 'Group Arrangement Confirmed'
            : 'Reservation Confirmed',
        `${resFloor} • ${guestsNum} Guests • ${resTimeSlot}\nUnits: ${tableName}${seatsShortfall > 0 ? `\nNote: Arrange +${seatsShortfall} extra chairs` : ''
        }`
      );
    };

    if (!capacityOk) {
      confirmAction(
        'Extra Chairs Needed',
        `Selected units seat ${selectedSeats} guests, while the party is ${guestsNum} guests (+${seatsShortfall} extra chairs needed on ${resFloor}). Save arrangement with extra-chair note?`,
        'Confirm Arrangement',
        doSave
      );
      return;
    }
    doSave();
  };

  const handleSeatGuests = (res: Reservation) => {
    const unitCount = getReservationTableCount(res);
    const floor = getReservationFloor(res, tables);
    confirmAction(
      'Check-In & Seat Party',
      `Seat ${res.customerName} (${res.guestsCount} guests) on ${floor} across ${unitCount} unit(s): ${res.tableName}?`,
      'Seat Now',
      () => {
        seatReservation(res.id);
        broadcastImmediately();
        setActionTableId(null);
      }
    );
  };

  const handleCancelBooking = (res: Reservation) => {
    confirmAction(
      'Cancel Booking',
      `Cancel booking for ${res.customerName} (${res.guestsCount} guests)? All ${getReservationTableCount(res)} reserved table(s) will be released immediately across all modules.`,
      'Cancel Booking',
      () => {
        cancelReservation(res.id);
        broadcastImmediately();
        setActionTableId(null);
      }
    );
  };

  // ---------- Zones ----------
  const handleSaveZone = () => {
    const name = formNewZone.trim();
    if (!name) return notify('Error', 'Zone name cannot be empty.');
    if (zones.includes(name)) return notify('Error', 'Zone already exists.');
    addZone(name);
    broadcastImmediately();
    setZoneModalVisible(false);
    setFormNewZone('');
  };

  // ---------- Render Tile ----------
  const renderTile = (table: Table, index?: number) => {
    const meta = STATUS_META[table.status] || STATUS_META.available;
    const isBusy = table.status === 'occupied' || table.status === 'billed';
    const kotCount = tickets.filter((t) => t.tableId === table.id && t.status !== 'served').length;
    const res = findTableReservation(table, reservations, ['confirmed', 'seated']);
    const isGroup = isGroupReservation(res);
    const primary = table.mergedInto ? tableById(table.mergedInto) : undefined;
    const linkedChildren = tables.filter((t) => t.mergedInto === table.id);

    const seatingType = getTableSeatingType(table);
    const floorName = getTableFloor(table);
    const zoneMeta = SEATING_ZONES[seatingType];
    const isMajlis = seatingType === 'majlis';
    const isCouch = seatingType === 'couches';

    const tableTickets = tickets.filter((t) => t.tableId === table.id);
    const earliestTicketTime = tableTickets.length > 0 ? Math.min(...tableTickets.map((t) => t.timePlaced)) : undefined;
    const occupiedStartTime = table.occupiedSince || earliestTicketTime;

    let tableOccupiedElapsed: { text: string; color: string; bg: string; border: string } | null = null;
    if (isBusy && occupiedStartTime) {
      const elapsedMins = Math.max(0, Math.floor((now - occupiedStartTime) / 60000));
      const text = elapsedMins >= 60 ? `${Math.floor(elapsedMins / 60)}h ${elapsedMins % 60}m` : `${elapsedMins}m`;
      if (elapsedMins < 30) {
        tableOccupiedElapsed = { text, color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' };
      } else if (elapsedMins < 60) {
        tableOccupiedElapsed = { text, color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' };
      } else {
        tableOccupiedElapsed = { text, color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' };
      }
    }

    const stripColor =
      table.status === 'reserved' && isGroup
        ? GROUP_ACCENT
        : table.status === 'reserved'
          ? STATUS_META.reserved.color
          : isBusy
            ? meta.color
            : isMajlis
              ? '#4a121a'
              : isCouch
                ? '#E65100'
                : meta.color;

    return (
      <View key={`${table.id}-${index ?? 0}`} style={{ width: `${100 / columns}%`, padding: 6 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setActionTableId(table.id)}
          {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          style={[
            styles.tile,
            { borderColor: table.status === 'reserved' && isGroup ? '#7C3AED88' : meta.color + '40' },
            isMajlis && { backgroundColor: '#FDF8F5' },
            table.status === 'reserved' && isGroup && { backgroundColor: '#FAF5FF', borderWidth: 1.5 },
          ]}
        >
          <View style={[styles.tileStrip, { backgroundColor: stripColor }]} />
          <View style={styles.tileBody}>
            {/* Top Row */}
            <View style={styles.tileTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                <View
                  style={[
                    styles.tileIconBubble,
                    { backgroundColor: isMajlis ? '#4a121a14' : isCouch ? '#E6510014' : '#1976D214' },
                  ]}
                >
                  <SeatingTypeIcon type={seatingType} size={16} color={zoneMeta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileName} numberOfLines={1}>
                    {table.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.tileTypeBadge, { color: zoneMeta.color }]}>
                      {isMajlis ? 'Majlis' : isCouch ? 'Couch' : 'Table'}
                    </Text>
                    <Text style={styles.tileDot}>•</Text>
                    <Text style={styles.tileFloorTag} numberOfLines={1}>
                      {table.seats} Seats
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <TouchableOpacity
                  style={styles.qrMiniBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    openTableQrModal(table);
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="qr-code-outline" size={12} color="#895B1E" />
                </TouchableOpacity>

                <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={11} color={meta.color} />
                  <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            </View>

            {/* Floor / Server Tag */}
            <View style={[styles.tileCapacityRow, isMajlis && styles.tileMajlisCapacityRow]}>
              <Ionicons name="layers-outline" size={12} color={isMajlis ? '#4a121a' : '#64748B'} />
              <Text style={[styles.tileCapacityText, isMajlis && { color: '#4a121a', fontWeight: '800' }]} numberOfLines={1}>
                {floorName}
              </Text>
              {table.server ? (
                <>
                  <Text style={styles.dot}>•</Text>
                  <Ionicons name="person-outline" size={12} color="#64748B" />
                  <Text style={styles.tileMetaText} numberOfLines={1}>
                    {table.server}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Footer Status & Group / Reservation / Bill Details */}
            <View style={styles.tileFooter}>
              {table.status === 'reserved' && res ? (
                <View style={{ gap: 4 }}>
                  {isGroup && (
                    <View style={styles.groupBadgePill}>
                      <Ionicons name="sparkles" size={11} color="#fff" />
                      <Text style={styles.groupBadgeText}>
                        {res.isFullFloor ? 'FULL FLOOR' : 'GROUP'} • {res.guestsCount} GUESTS
                      </Text>
                    </View>
                  )}
                  <Text style={styles.tileGuest} numberOfLines={1}>
                    {res.customerName}
                  </Text>
                  <Text style={styles.tileSub} numberOfLines={1}>
                    {res.timeSlot} • {res.occasion || `${res.guestsCount} Guests`}
                  </Text>
                  {primary ? (
                    <View style={[styles.infoChip, { backgroundColor: '#EDE9FE' }]}>
                      <Ionicons name="link" size={11} color={GROUP_ACCENT} />
                      <Text style={[styles.infoChipText, { color: GROUP_ACCENT }]}>
                        Part of {primary.name} Group
                      </Text>
                    </View>
                  ) : linkedChildren.length > 0 ? (
                    <View style={[styles.infoChip, { backgroundColor: '#EDE9FE' }]}>
                      <Ionicons name="git-merge-outline" size={11} color={GROUP_ACCENT} />
                      <Text style={[styles.infoChipText, { color: GROUP_ACCENT }]} numberOfLines={1}>
                        +{linkedChildren.length} joined ({linkedChildren.map((c) => c.name).join(', ')})
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : primary ? (
                <View style={{ gap: 4 }}>
                  <View style={[styles.infoChip, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="link" size={12} color="#4F46E5" />
                    <Text style={[styles.infoChipText, { color: '#4F46E5' }]}>Joined with {primary.name}</Text>
                  </View>
                  {res && isGroup && (
                    <Text style={[styles.tileSub, { color: GROUP_ACCENT }]} numberOfLines={1}>
                      {res.customerName} • {res.guestsCount} Guests
                    </Text>
                  )}
                </View>
              ) : isBusy ? (
                <View style={{ gap: 4 }}>
                  {res && isGroup && (
                    <View style={[styles.groupBadgePill, { backgroundColor: '#0F766E' }]}>
                      <Ionicons name="people" size={11} color="#fff" />
                      <Text style={styles.groupBadgeText}>
                        SEATED GROUP • {res.guestsCount} GUESTS
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.tileBill}>
                      {canViewRevenue ? `Rs. ${(table.billTotal || 0).toLocaleString()}` : 'Rs. ••••••'}
                    </Text>
                    {tableOccupiedElapsed && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          backgroundColor: tableOccupiedElapsed.bg,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: tableOccupiedElapsed.border,
                        }}
                      >
                        <Ionicons name="stopwatch-outline" size={11} color={tableOccupiedElapsed.color} />
                        <Text style={{ fontSize: 10, fontWeight: '900', color: tableOccupiedElapsed.color }}>
                          {tableOccupiedElapsed.text}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.tileSub}>
                    {kotCount > 0 ? `${kotCount} KOT in kitchen` : `${table.orders?.length || 0} item(s)`}
                    {table.status === 'billed' ? ' • Billed' : ''}
                  </Text>
                  {linkedChildren.length > 0 && (
                    <View style={[styles.infoChip, { backgroundColor: '#EEF2FF', marginTop: 2 }]}>
                      <Ionicons name="git-merge-outline" size={11} color="#4F46E5" />
                      <Text style={[styles.infoChipText, { color: '#4F46E5' }]} numberOfLines={1}>
                        + {linkedChildren.map((c) => c.name).join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={[styles.tileSub, { color: meta.color, fontWeight: '700' }]}>Ready for guests</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const ActionRow = ({
    icon,
    label,
    color = '#1C1C1E',
    onPress,
    solid,
  }: {
    icon: IconName;
    label: string;
    color?: string;
    onPress: () => void;
    solid?: boolean;
  }) => (
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

  // ---------- Action Sheet ----------
  const renderActionSheet = () => {
    if (!actionTable) return null;
    const t = actionTable;
    const meta = STATUS_META[t.status] || STATUS_META.available;
    const isBusy = t.status === 'occupied' || t.status === 'billed';
    const res = findTableReservation(t, reservations, ['confirmed', 'seated']);
    const isGroup = isGroupReservation(res);
    const primary = t.mergedInto ? tableById(t.mergedInto) : undefined;
    const seatingType = getTableSeatingType(t);
    const floorName = getTableFloor(t);
    const zoneMeta = SEATING_ZONES[seatingType];
    const isMajlis = seatingType === 'majlis';

    const canPOS = role === 'admin' || can('canAccessPOS');

    const handlePosNavigation = (targetId = t.id) => {
      if (!canPOS) {
        return notify('Access Restricted', 'POS access has not been granted by Administrator.');
      }
      setActionTableId(null);
      router.push(`${posRoute}?prefillTableId=${targetId}` as any);
    };

    return (
      <View style={styles.sheetBody}>
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetIcon, { backgroundColor: isMajlis ? '#4a121a15' : meta.bg }]}>
            <SeatingTypeIcon type={seatingType} size={24} color={zoneMeta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{t.name}</Text>
            <Text style={styles.sheetSub}>
              {floorName} • {zoneMeta.label} • {t.seats} Seats • {meta.label}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setActionTableId(null)} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {isBusy && !primary && (
          <View style={[styles.sheetInfo, { backgroundColor: meta.bg }]}>
            <Text style={[styles.sheetInfoLabel, { color: meta.color }]}>Running Bill</Text>
            <Text style={styles.sheetInfoValue}>
              {canViewRevenue ? `Rs. ${(t.billTotal || 0).toLocaleString()}` : 'Rs. ••••••'}
            </Text>
            <Text style={styles.sheetInfoSub}>Server: {t.server || 'Unassigned'}</Text>
          </View>
        )}

        {res && (
          <View style={[styles.sheetInfo, { backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.sheetInfoLabel, { color: GROUP_ACCENT }]}>
                {isGroup ? (res.isFullFloor ? 'Full Floor Group Event' : 'Group Event Arrangement') : 'Table Reservation'}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: res.status === 'seated' ? '#DCFCE7' : '#EDE9FE' }]}>
                <Text style={[styles.statusPillText, { color: res.status === 'seated' ? '#15803D' : GROUP_ACCENT }]}>
                  {res.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.sheetInfoValue}>
              {res.customerName} ({res.guestsCount} Guests)
            </Text>
            <Text style={styles.sheetInfoSub}>
              {can('canViewCustomerContacts') ? res.phone : '03xx-xxxxxxx'} • {res.reservationDate} • {res.timeSlot}
            </Text>
            <Text style={styles.sheetInfoSub}>
              Floor: {getReservationFloor(res, tables)} • Units: {res.tableName}
            </Text>
            {(res.occasion || res.arrangementStyle) && (
              <Text style={[styles.sheetInfoSub, { color: '#4C1D95', fontWeight: '700' }]}>
                {[res.occasion, res.arrangementStyle].filter(Boolean).join(' • ')}
              </Text>
            )}
            {!!res.advanceDeposit && res.advanceDeposit > 0 && (
              <Text style={[styles.sheetInfoSub, { color: '#15803D', fontWeight: '800' }]}>
                Advance Deposit Paid: Rs. {res.advanceDeposit.toLocaleString()}
              </Text>
            )}
            {!!res.extraChairsNeeded && res.extraChairsNeeded > 0 && (
              <Text style={[styles.sheetInfoSub, { color: '#B45309', fontWeight: '700' }]}>
                Extra Chairs Needed: +{res.extraChairsNeeded} chairs
              </Text>
            )}
            {!!res.notes && <Text style={[styles.sheetInfoSub, { fontStyle: 'italic' }]}>“{res.notes}”</Text>}
          </View>
        )}

        {primary && (
          <View style={[styles.sheetInfo, { backgroundColor: '#EEF2FF' }]}>
            <Text style={[styles.sheetInfoLabel, { color: '#4F46E5' }]}>Joined Unit</Text>
            <Text style={styles.sheetInfoSub}>
              This unit is joined with {primary.name}. Orders & billing are managed on {primary.name}.
            </Text>
          </View>
        )}

        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
          {/* Confirmed reservation actions work whether user tapped primary OR any linked unit */}
          {t.status === 'reserved' && res && res.status === 'confirmed' ? (
            <>
              <ActionRow
                icon="checkmark-circle"
                label={`Seat ${isGroup ? `Entire Group (${res.guestsCount} Guests)` : 'Guests (Check-In)'}`}
                color="#15803D"
                solid
                onPress={() => handleSeatGuests(res)}
              />
              <ActionRow
                icon="create-outline"
                label={isGroup ? 'Edit Group Arrangement' : 'Edit Reservation'}
                color="#2563EB"
                onPress={() => openEditReservationModal(res)}
              />
              <ActionRow
                icon="close-circle-outline"
                label={`Cancel Booking & Release ${getReservationTableCount(res)} Unit(s)`}
                color="#DC2626"
                onPress={() => handleCancelBooking(res)}
              />
              {primary && (
                <ActionRow
                  icon="open-outline"
                  label={`Open Primary Unit (${primary.name})`}
                  color={BRAND}
                  onPress={() => setActionTableId(primary.id)}
                />
              )}
            </>
          ) : primary ? (
            <>
              <ActionRow
                icon="calculator"
                label={`Open ${primary.name} in POS`}
                color="#15803D"
                solid
                onPress={() => handlePosNavigation(primary.id)}
              />
              <ActionRow
                icon="open-outline"
                label={`Manage Primary Unit (${primary.name})`}
                color={BRAND}
                onPress={() => setActionTableId(primary.id)}
              />
              <ActionRow
                icon="unlink"
                label="Unlink This Table from Group"
                color="#4F46E5"
                onPress={() => handleUnlinkTable(t)}
              />
            </>
          ) : (
            <>
              {t.status === 'available' && (
                <>
                  <ActionRow icon="calculator" label="Start Order in POS" color={BRAND} solid onPress={() => handlePosNavigation()} />
                  <ActionRow
                    icon="calendar-outline"
                    label="Reserve This Table"
                    color={STATUS_META.reserved.color}
                    onPress={() => openReservationModal({ mode: 'regular', prefillTableId: t.id })}
                  />
                  <ActionRow
                    icon="people-outline"
                    label={`Arrange Group Event on ${floorName}`}
                    color={GROUP_ACCENT}
                    onPress={() =>
                      openReservationModal({
                        mode: 'group_event',
                        prefillFloor: floorName,
                        defaultGuests: 25,
                      })
                    }
                  />
                </>
              )}
              {isBusy && (
                <>
                  <ActionRow icon="card" label="Checkout / Add Items in POS" color="#15803D" solid onPress={() => handlePosNavigation()} />
                  <ActionRow icon="swap-horizontal" label="Transfer to Another Table" color="#2563EB" onPress={() => openTransferModal(t)} />
                  <ActionRow icon="git-merge-outline" label="Merge Another Table's Order" color="#7C3AED" onPress={() => openMergeModal(t)} />
                  <ActionRow icon="refresh" label="Clear & Release Table" color="#DC2626" onPress={() => handleClearTable(t)} />
                </>
              )}
              {t.status === 'reserved' && !res && (
                <ActionRow
                  icon="lock-open-outline"
                  label="Release Orphan Reserved Table"
                  color="#15803D"
                  solid
                  onPress={() => {
                    updateTable(t.id, { status: 'available', reservationId: undefined, mergedInto: undefined });
                    broadcastImmediately();
                    setActionTableId(null);
                  }}
                />
              )}
            </>
          )}

          <ActionRow
            icon="qr-code-outline"
            label="Table QR Code & Acrylic Standee"
            color="#B8860B"
            onPress={() => openTableQrModal(t)}
          />

          {(canEditTables || canDeleteTables) && <View style={styles.sheetDivider} />}
          {canEditTables && (
            <ActionRow icon="pencil" label="Edit Table / Cabin Details" color="#475569" onPress={() => openEditTableModal(t)} />
          )}
          {canDeleteTables && (
            <ActionRow icon="trash-outline" label="Delete Seating Unit" color="#DC2626" onPress={() => handleDeleteTable(t)} />
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

  // ---------- KPI Cards ----------
  const STATS: {
    key: StatusFilter | 'revenue' | 'occupancy';
    label: string;
    value: string;
    sub: string;
    icon: IconName;
    color: string;
    bg: string;
    border: string;
    iconBg: string;
  }[] = [
      {
        key: 'available',
        label: 'Available',
        value: `${counts.available}/${enabledTables.length}`,
        sub: `${availableSeats} Free Seats`,
        icon: 'checkmark-circle',
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        iconBg: '#D1FAE5',
      },
      {
        key: 'occupied',
        label: 'Occupied',
        value: `${counts.occupied + counts.billed}`,
        sub: `${occupiedSeats} Seated`,
        icon: 'people',
        color: '#DC2626',
        bg: '#FEF2F2',
        border: '#FECACA',
        iconBg: '#FEE2E2',
      },
      {
        key: 'reserved',
        label: 'Reserved',
        value: `${counts.reserved}`,
        sub: `${activeGroupBookings.length} Group Event${activeGroupBookings.length === 1 ? '' : 's'}`,
        icon: 'calendar',
        color: '#7C3AED',
        bg: '#FAF5FF',
        border: '#DDD6FE',
        iconBg: '#EDE9FE',
      },
      {
        key: 'occupancy',
        label: 'Occupancy',
        value: `${occupancyPct}%`,
        sub: `${totalSeats} Total Seats`,
        icon: 'pie-chart',
        color: '#0284C7',
        bg: '#F0F9FF',
        border: '#BAE6FD',
        iconBg: '#E0F2FE',
      },
      {
        key: 'revenue',
        label: 'Live Dine-In',
        value: canViewRevenue ? `Rs. ${liveRevenue.toLocaleString()}` : 'Rs. ••••••',
        sub: 'Running Bills',
        icon: 'cash',
        color: '#B45309',
        bg: '#FFFBEB',
        border: '#FDE68A',
        iconBg: '#FEF3C7',
      },
    ];

  const TABS: { key: TabKey; label: string; icon: IconName; badge?: number }[] = [
    { key: 'tables', label: 'Blueprint', icon: 'grid' },
    { key: 'reservations', label: 'Bookings & Events', icon: 'calendar', badge: upcomingConfirmedCount },
    { key: 'zones', label: 'Floors & Cabins', icon: 'layers' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, isMobile && { padding: 10 }]} showsVerticalScrollIndicator={false}>
        {/* Clean Floating Light Executive Command Bar (Eliminates Heavy Double Dark Bar) */}
        <View style={[styles.topCommandCard, isMobile && { flexDirection: 'column', alignItems: 'stretch', padding: 10 }]}>
          <View style={styles.headerLeftGroup}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as any))}
            >
              <Ionicons name="arrow-back" size={17} color={BRAND} />
            </TouchableOpacity>
            <View style={styles.titleIconBadge}>
              <Ionicons name="grid" size={16} color="#F3D179" />
            </View>
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.title, isMobile && { fontSize: 16 }]} numberOfLines={1}>
                  Table Blueprint
                </Text>
                {!isSmallMobile && (
                  <View style={styles.liveSummaryBadge}>
                    <View style={styles.liveSummaryDot} />
                    <Text style={styles.liveSummaryText}>
                      {counts.available} FREE • {totalSeats} SEATS
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Clean Inline Segmented Tab Control */}
            {!isMobile && (
              <View style={styles.headerTabsWrap}>
                {TABS.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.headerTabPill, active && styles.headerTabPillActive]}
                      onPress={() => setActiveTab(tab.key)}
                    >
                      <Ionicons
                        name={active ? tab.icon : (`${tab.icon}-outline` as IconName)}
                        size={14}
                        color={active ? '#F3D179' : '#64748B'}
                      />
                      <Text style={[styles.headerTabText, active && styles.headerTabTextActive]} numberOfLines={1}>
                        {tab.label}
                      </Text>
                      {!!tab.badge && (
                        <View style={[styles.segmentBadge, active && { backgroundColor: GOLD }]}>
                          <Text style={[styles.segmentBadgeText, active && { color: '#24050A' }]}>{tab.badge}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.headerActions}
            style={isMobile ? { marginTop: 8 } : { flexGrow: 0 }}
          >
            <TouchableOpacity
              style={[styles.cmdBtn, styles.cmdBtnGroup]}
              onPress={() =>
                openReservationModal({
                  mode: 'group_event',
                  prefillFloor: floorFilter !== 'all' ? floorFilter : undefined,
                  defaultGuests: 25,
                })
              }
            >
              <Ionicons name="sparkles" size={14} color="#fff" />
              <Text style={[styles.cmdBtnText, { color: '#fff' }]}>Group / Event</Text>
            </TouchableOpacity>

            {canAddTables && (
              <TouchableOpacity
                style={[styles.cmdBtn, styles.cmdBtnPrimary]}
                onPress={() => openAddTableModal()}
              >
                <Ionicons name="add" size={15} color="#F3D179" />
                <Text style={[styles.cmdBtnText, { color: '#F3D179' }]}>Add Unit</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.cmdBtn, styles.cmdBtnOutline]} onPress={openBatchQrModal}>
              <Ionicons name="qr-code-outline" size={14} color={BRAND} />
              <Text style={[styles.cmdBtnText, { color: BRAND }]}>QRs</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cmdBtn, styles.cmdBtnOutline]}
              onPress={() => router.push(floorsRoute as any)}
            >
              <Ionicons name="layers-outline" size={14} color={BRAND} />
              <Text style={[styles.cmdBtnText, { color: BRAND }]}>Floors</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Mobile-only Tabs */}
        {isMobile && (
          <View style={[styles.segment, { alignSelf: 'stretch', width: '100%', marginBottom: 10 }]}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.segmentItem, { flex: 1, justifyContent: 'center', paddingHorizontal: 6 }, active && styles.segmentItemActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Ionicons name={active ? tab.icon : (`${tab.icon}-outline` as IconName)} size={14} color={active ? '#24050A' : '#64748B'} />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive, isSmallMobile && { fontSize: 11.5 }]} numberOfLines={1}>
                    {tab.label}
                  </Text>
                  {!!tab.badge && (
                    <View style={[styles.segmentBadge, active && { backgroundColor: '#24050A' }]}>
                      <Text style={styles.segmentBadgeText}>{tab.badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Full-Width Edge-to-Edge Slim Executive KPI Bar (No Awkward Right Gap) */}
        <View style={[styles.kpiGridRow, isMobile && { gap: 6 }]}>
          {STATS.map((s) => {
            const isFilterable = s.key === 'available' || s.key === 'occupied' || s.key === 'reserved';
            const isActiveFilter = isFilterable && activeTab === 'tables' && statusFilter === s.key;
            return (
              <TouchableOpacity
                key={s.label}
                activeOpacity={isFilterable ? 0.78 : 1}
                onPress={() => {
                  if (!isFilterable) return;
                  setActiveTab('tables');
                  setStatusFilter(statusFilter === s.key ? 'all' : (s.key as StatusFilter));
                }}
                style={[
                  styles.kpiSlimCard,
                  { borderLeftColor: s.color },
                  isActiveFilter && { borderColor: s.color, backgroundColor: s.bg, borderWidth: 1.5, borderLeftWidth: 4 },
                ]}
              >
                <View style={[styles.kpiSlimIcon, { backgroundColor: s.iconBg }]}>
                  <Ionicons name={s.icon} size={17} color={s.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.kpiSlimLabel, { color: s.color }]} numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text style={[styles.kpiSlimValue, { color: '#0F172A' }]} numberOfLines={1}>
                    {s.value}
                  </Text>
                  <Text style={styles.kpiSlimSub} numberOfLines={1}>
                    {s.sub}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ============================================================
            TAB 1: FLOOR BLUEPRINT
           ============================================================ */}
        {activeTab === 'tables' && (
          <>
            {/* Live Group / Event Arrangements Banner (only appears when group bookings exist) */}
            {activeGroupBookings.length > 0 && (
              <View style={styles.groupStripContainer}>
                <View style={styles.groupStripHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={15} color={GROUP_ACCENT} />
                    <Text style={styles.groupStripTitle}>
                      Active Group & Floor Arrangements ({activeGroupBookings.length})
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setActiveTab('reservations')}>
                    <Text style={styles.groupStripLink}>Manage All ➔</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {activeGroupBookings.map((grp) => {
                    const grpFloor = getReservationFloor(grp, tables);
                    const isSeated = grp.status === 'seated';
                    return (
                      <View
                        key={grp.id}
                        style={[
                          styles.groupStripCard,
                          isSeated && { borderColor: '#15803D55', backgroundColor: '#F0FDF4' },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <View style={[styles.floorMiniTag, { backgroundColor: isSeated ? '#15803D' : GROUP_ACCENT }]}>
                              <Text style={styles.floorMiniTagText}>{grpFloor}</Text>
                            </View>
                            <Text style={styles.groupStripGuests}>{grp.guestsCount} Guests</Text>
                          </View>
                          <Text style={styles.groupStripTime}>{grp.timeSlot}</Text>
                        </View>
                        <Text style={styles.groupStripName} numberOfLines={1}>
                          {grp.customerName} {grp.occasion ? `• ${grp.occasion}` : ''}
                        </Text>
                        <Text style={styles.groupStripUnits} numberOfLines={1}>
                          {getReservationTableCount(grp)} Units: {grp.tableName}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                          {!isSeated ? (
                            <TouchableOpacity
                              style={[styles.miniPillBtn, { backgroundColor: '#15803D' }]}
                              onPress={() => handleSeatGuests(grp)}
                            >
                              <Ionicons name="checkmark-circle" size={12} color="#fff" />
                              <Text style={[styles.miniPillBtnText, { color: '#fff' }]}>Seat Group</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={[styles.miniPillBtn, { backgroundColor: BRAND }]}
                              onPress={() => router.push(`${posRoute}?prefillTableId=${grp.tableId}` as any)}
                            >
                              <Ionicons name="calculator" size={12} color="#F3D179" />
                              <Text style={[styles.miniPillBtnText, { color: '#F3D179' }]}>Open POS</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={[styles.miniPillBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1' }]}
                            onPress={() => openEditReservationModal(grp)}
                          >
                            <Text style={[styles.miniPillBtnText, { color: '#334155' }]}>Edit</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Ultra-Clean Unified 2-Row Filter & Floor Toolbar */}
            <View style={styles.controlCard}>
              {/* Row 1: Floor Tabs (left) + Search Box (right) */}
              <View style={[styles.controlTopRow, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, alignItems: 'center' }}
                  style={{ flex: 1 }}
                >
                  <TouchableOpacity
                    style={[styles.floorPill, floorFilter === 'all' && styles.floorPillActive]}
                    onPress={() => setFloorFilter('all')}
                  >
                    <Ionicons name="layers" size={13} color={floorFilter === 'all' ? '#24050A' : '#64748B'} />
                    <Text style={[styles.floorPillText, floorFilter === 'all' && styles.floorPillTextActive]}>
                      All Floors
                    </Text>
                    <View style={[styles.floorPillBadge, floorFilter === 'all' && styles.floorPillBadgeActive]}>
                      <Text style={[styles.floorPillBadgeText, floorFilter === 'all' && { color: '#F3D179' }]}>
                        {availableSeats}s
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {availableFloors.map((fl) => {
                    const active = floorFilter.toLowerCase() === fl.toLowerCase();
                    const cap = floorCapacityMap[fl.toLowerCase()];
                    const meta = getFloorMeta(fl, dynamicFloors);
                    return (
                      <TouchableOpacity
                        key={fl}
                        style={[styles.floorPill, active && styles.floorPillActive]}
                        onPress={() => setFloorFilter(fl)}
                      >
                        <Ionicons
                          name={(meta?.icon as any) || 'business-outline'}
                          size={13}
                          color={active ? '#24050A' : meta?.color || '#64748B'}
                        />
                        <Text style={[styles.floorPillText, active && styles.floorPillTextActive]}>{fl}</Text>
                        <View style={[styles.floorPillBadge, active && styles.floorPillBadgeActive]}>
                          <Text style={[styles.floorPillBadgeText, active && { color: '#F3D179' }]}>
                            {cap?.availableSeats || 0}s
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={[styles.searchBox, !isMobile && { width: 210 }]}>
                  <Ionicons name="search" size={14} color="#94A3B8" />
                  <TextInput
                    style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    placeholder="Search table, guest…"
                    placeholderTextColor="#94A3B8"
                    value={search}
                    onChangeText={setSearch}
                  />
                  {!!search && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={15} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Row 2: Status Filter Pills (left) + Seating Zone Chips (right) */}
              <View style={styles.capacityStripRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
                  {(['all', 'available', 'occupied', 'billed', 'reserved'] as const).map((st) => {
                    const active = statusFilter === st;
                    const color = st === 'all' ? BRAND : STATUS_META[st].color;
                    const count =
                      st === 'all'
                        ? scopedTables.length
                        : scopedTables.filter((t) => t.status === st).length;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.chip,
                          active && { backgroundColor: color, borderColor: color },
                        ]}
                        onPress={() => setStatusFilter(st)}
                      >
                        {st !== 'all' && (
                          <View style={[styles.chipDot, { backgroundColor: active ? '#fff' : color }]} />
                        )}
                        <Text style={[styles.chipText, active && { color: '#fff' }]}>
                          {st === 'all' ? 'All' : STATUS_META[st].label} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  <View style={styles.toolbarDivider} />

                  <TouchableOpacity
                    style={[styles.typeMiniChip, seatingTypeFilter === 'all' && styles.typeMiniChipActive]}
                    onPress={() => setSeatingTypeFilter('all')}
                  >
                    <Text style={[styles.typeMiniChipText, seatingTypeFilter === 'all' && { color: '#fff' }]}>
                      All Units
                    </Text>
                  </TouchableOpacity>

                  {SEATING_ZONE_TYPES.filter((type) => {
                    if (type === 'majlis' && systemSettings.enableMajlisSeating === false) return false;
                    if (type === 'couches' && systemSettings.enableCouchSeating === false) return false;
                    return true;
                  }).map((type) => {
                    const active = seatingTypeFilter === type;
                    const meta = SEATING_ZONES[type];
                    const countVal =
                      type === 'tables'
                        ? zoneSummary.tables.count
                        : type === 'couches'
                          ? zoneSummary.couches.count
                          : zoneSummary.majlis.cabinsCount;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.typeMiniChip,
                          active && { backgroundColor: meta.color, borderColor: meta.color },
                        ]}
                        onPress={() => setSeatingTypeFilter(type)}
                      >
                        <SeatingTypeIcon type={type} size={12} color={active ? '#fff' : meta.color} />
                        <Text style={[styles.typeMiniChipText, active && { color: '#fff' }]}>
                          {meta.label} ({countVal})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {floorFilter !== 'all' && (
                  <TouchableOpacity
                    style={styles.inlineArrangeBtn}
                    onPress={() =>
                      openReservationModal({
                        mode: 'group_event',
                        prefillFloor: floorFilter,
                        defaultGuests: 25,
                      })
                    }
                  >
                    <Ionicons name="sparkles" size={12} color="#fff" />
                    <Text style={styles.inlineArrangeBtnText}>Book Group on {floorFilter}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Blueprint Grid (Grouped by Floor when viewing All Floors) */}
            {filteredTables.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={42} color="#CBD5E1" />
                <Text style={styles.emptyText}>No seating units match your current filter.</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  {(statusFilter !== 'all' || seatingTypeFilter !== 'all' || !!search) && (
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#E2E8F0' }]}
                      onPress={() => {
                        setStatusFilter('all');
                        setSeatingTypeFilter('all');
                        setSearch('');
                      }}
                    >
                      <Text style={[styles.smallBtnText, { color: '#1E293B' }]}>Reset Filters</Text>
                    </TouchableOpacity>
                  )}
                  {canAddTables && (
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: BRAND }]}
                      onPress={() => openAddTableModal()}
                    >
                      <Ionicons name="add" size={14} color="#F3D179" />
                      <Text style={[styles.smallBtnText, { color: '#F3D179' }]}>Add Unit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              groupedBlueprintFloors.map(({ floor, items }) => {
                const fMeta = getFloorMeta(floor, dynamicFloors);
                const freeOnThisFloor = items
                  .filter((t) => t.status === 'available')
                  .reduce((s, t) => s + (t.seats || 0), 0);
                const totalOnThisFloor = items.reduce((s, t) => s + (t.seats || 0), 0);
                const reservedCount = items.filter((t) => t.status === 'reserved').length;

                return (
                  <View key={floor} style={styles.floorGroupSection}>
                    <View style={styles.floorGroupHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={[styles.floorGroupIcon, { backgroundColor: (fMeta.color || BRAND) + '18' }]}>
                          <Ionicons name={(fMeta.icon as any) || 'layers-outline'} size={16} color={fMeta.color || BRAND} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.floorGroupTitle}>{floor}</Text>
                          <Text style={styles.floorGroupMeta}>
                            {items.length} Units • {freeOnThisFloor}/{totalOnThisFloor} Seats Available
                            {reservedCount > 0 ? ` • ${reservedCount} Reserved` : ''}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.floorQuickBookBtn}
                        onPress={() =>
                          openReservationModal({
                            mode: 'group_event',
                            prefillFloor: floor,
                            defaultGuests: 25,
                          })
                        }
                      >
                        <Ionicons name="calendar-outline" size={13} color={GROUP_ACCENT} />
                        <Text style={styles.floorQuickBookText}>+ Book Group</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.grid}>{items.map((t, idx) => renderTile(t, idx))}</View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ============================================================
            TAB 2: RESERVATIONS & GROUP ARRANGEMENTS
           ============================================================ */}
        {activeTab === 'reservations' && (
          <>
            <View style={styles.controlCard}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {(['confirmed', 'seated', 'completed', 'cancelled', 'all'] as const).map((st) => {
                    const active = resFilter === st;
                    const count =
                      st === 'all' ? reservations.length : reservations.filter((r) => r.status === st).length;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[styles.chip, active && { backgroundColor: BRAND, borderColor: BRAND }]}
                        onPress={() => setResFilter(st)}
                      >
                        <Text style={[styles.chipText, active && { color: '#fff' }]}>
                          {st.charAt(0).toUpperCase() + st.slice(1)} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#7C3AED' }]}
                    onPress={() => openReservationModal({ mode: 'group_event', defaultGuests: 25 })}
                  >
                    <Ionicons name="sparkles" size={14} color="#fff" />
                    <Text style={[styles.smallBtnText, { color: '#fff' }]}>+ Group Arrangement</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: BRAND }]}
                    onPress={() => openReservationModal({ mode: 'regular', defaultGuests: 4 })}
                  >
                    <Ionicons name="add" size={14} color="#F3D179" />
                    <Text style={[styles.smallBtnText, { color: '#F3D179' }]}>+ Table Booking</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Secondary filters: Type & Floor */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                {([
                  { key: 'all', label: 'All Types' },
                  { key: 'group_event', label: 'Group / Event Arrangements' },
                  { key: 'regular', label: 'Regular Tables' },
                ] as const).map((item) => {
                  const active = resTypeFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.typeMiniChip, active && { backgroundColor: GROUP_ACCENT, borderColor: GROUP_ACCENT }]}
                      onPress={() => setResTypeFilter(item.key)}
                    >
                      <Text style={[styles.typeMiniChipText, active && { color: '#fff' }]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}

                <View style={{ width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 4 }} />

                {['all', ...availableFloors].map((fl) => {
                  const active = resFloorFilter.toLowerCase() === fl.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={fl}
                      style={[styles.typeMiniChip, active && styles.typeMiniChipActive]}
                      onPress={() => setResFloorFilter(fl)}
                    >
                      <Text style={[styles.typeMiniChipText, active && { color: '#fff' }]}>
                        {fl === 'all' ? 'All Floors' : fl}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {filteredReservations.map((res) => {
              const primary = tableById(res.tableId);
              const unitCount = getReservationTableCount(res);
              const isGroup = isGroupReservation(res);
              const resFloorName = getReservationFloor(res, tables);
              const isConfirmed = res.status === 'confirmed';
              const isSeated = res.status === 'seated';

              const statusColor = isConfirmed
                ? '#7C3AED'
                : isSeated
                  ? '#15803D'
                  : res.status === 'completed'
                    ? '#0284C7'
                    : '#64748B';
              const statusBg = isConfirmed
                ? '#F3E8FF'
                : isSeated
                  ? '#DCFCE7'
                  : res.status === 'completed'
                    ? '#E0F2FE'
                    : '#F1F5F9';

              return (
                <View
                  key={res.id}
                  style={[
                    styles.resCard,
                    isGroup && { borderColor: '#DDD6FE', borderLeftWidth: 4, borderLeftColor: isSeated ? '#15803D' : GROUP_ACCENT },
                  ]}
                >
                  <View style={[styles.resTime, { backgroundColor: statusBg }]}>
                    <Text style={[styles.resTimeText, { color: statusColor }]}>{res.timeSlot}</Text>
                    <Text style={styles.resDateText}>{res.reservationDate}</Text>
                    <View style={[styles.resGuestBubble, { backgroundColor: statusColor }]}>
                      <Text style={styles.resGuestBubbleText}>{res.guestsCount} Guests</Text>
                    </View>
                  </View>

                  <View style={{ flex: 1, minWidth: 190, gap: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.resName}>{res.customerName}</Text>
                      {isGroup && (
                        <View style={styles.groupBadgePill}>
                          <Ionicons name="sparkles" size={10} color="#fff" />
                          <Text style={styles.groupBadgeText}>
                            {res.isFullFloor ? 'FULL FLOOR EVENT' : 'GROUP ARRANGEMENT'}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
                        <Text style={[styles.statusPillText, { color: statusColor }]}>{res.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    <Text style={styles.resMeta}>
                      {can('canViewCustomerContacts') ? res.phone : '03xx-xxxxxxx'} • Floor:{' '}
                      <Text style={{ fontWeight: '800', color: BRAND }}>{resFloorName}</Text>
                      {res.occasion ? ` • ${res.occasion}` : ''}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <View style={[styles.infoChip, { backgroundColor: '#FDF8F5' }]}>
                        <Ionicons name="restaurant-outline" size={12} color={BRAND} />
                        <Text style={styles.infoChipText}>{res.tableName || primary?.name || 'Table'}</Text>
                      </View>
                      {unitCount > 1 && (
                        <View style={[styles.infoChip, { backgroundColor: '#EEF2FF' }]}>
                          <Ionicons name="git-merge-outline" size={12} color="#4F46E5" />
                          <Text style={[styles.infoChipText, { color: '#4F46E5' }]}>{unitCount} Units Joined</Text>
                        </View>
                      )}
                      {!!res.arrangementStyle && (
                        <View style={[styles.infoChip, { backgroundColor: '#F5F3FF' }]}>
                          <Ionicons name="layers-outline" size={12} color={GROUP_ACCENT} />
                          <Text style={[styles.infoChipText, { color: GROUP_ACCENT }]}>{res.arrangementStyle}</Text>
                        </View>
                      )}
                      {!!res.advanceDeposit && res.advanceDeposit > 0 && (
                        <View style={[styles.infoChip, { backgroundColor: '#DCFCE7' }]}>
                          <Ionicons name="cash-outline" size={12} color="#15803D" />
                          <Text style={[styles.infoChipText, { color: '#15803D' }]}>
                            Advance: Rs. {res.advanceDeposit.toLocaleString()}
                          </Text>
                        </View>
                      )}
                      {!!res.extraChairsNeeded && res.extraChairsNeeded > 0 && (
                        <View style={[styles.infoChip, { backgroundColor: '#FEF3C7' }]}>
                          <Ionicons name="add-circle-outline" size={12} color="#B45309" />
                          <Text style={[styles.infoChipText, { color: '#B45309' }]}>
                            +{res.extraChairsNeeded} Extra Chairs
                          </Text>
                        </View>
                      )}
                    </View>

                    {!!res.notes && <Text style={styles.resNotes}>“{res.notes}”</Text>}
                  </View>

                  <View style={styles.resActions}>
                    {isConfirmed && (
                      <>
                        <TouchableOpacity
                          style={[styles.smallBtn, { backgroundColor: '#15803D' }]}
                          onPress={() => handleSeatGuests(res)}
                        >
                          <Ionicons name="checkmark-circle" size={14} color="#fff" />
                          <Text style={[styles.smallBtnText, { color: '#fff' }]}>
                            {isGroup ? 'Seat Group' : 'Seat'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.smallBtn, styles.smallBtnGhost]}
                          onPress={() => openEditReservationModal(res)}
                        >
                          <Ionicons name="create-outline" size={14} color="#2563EB" />
                          <Text style={[styles.smallBtnText, { color: '#2563EB' }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.smallBtn, styles.smallBtnGhost]}
                          onPress={() => handleCancelBooking(res)}
                        >
                          <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                          <Text style={[styles.smallBtnText, { color: '#DC2626' }]}>Cancel</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {isSeated && (
                      <TouchableOpacity
                        style={[styles.smallBtn, { backgroundColor: BRAND }]}
                        onPress={() => router.push(`${posRoute}?prefillTableId=${res.tableId}` as any)}
                      >
                        <Ionicons name="calculator" size={14} color="#F3D179" />
                        <Text style={[styles.smallBtnText, { color: '#F3D179' }]}>Open in POS</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}

            {filteredReservations.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={42} color="#CBD5E1" />
                <Text style={styles.emptyText}>No bookings or group arrangements match this filter.</Text>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: '#7C3AED', marginTop: 10 }]}
                  onPress={() => openReservationModal({ mode: 'group_event', defaultGuests: 25 })}
                >
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <Text style={[styles.smallBtnText, { color: '#fff' }]}>Create Group / Floor Arrangement</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ============================================================
            TAB 3: FLOORS & CABINS DIRECTORY
           ============================================================ */}
        {activeTab === 'zones' && (
          <View style={{ gap: 16 }}>
            <View style={styles.floorBannerNotice}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.floorBannerIcon}>
                  <Ionicons name="layers" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.floorBannerTitle}>Floor Command & 5-Floor Template</Text>
                  <Text style={styles.floorBannerSub}>
                    Configure floor levels, color themes, prefixes, or auto-generate the default 5-floor layout.
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {canAddTables && (
                  <TouchableOpacity
                    style={[styles.floorBannerBtn, { backgroundColor: GOLD }]}
                    onPress={handlePopulateDefault5Floors}
                  >
                    <Text style={[styles.floorBannerBtnText, { color: '#24050A' }]}>5-Floor Auto-Gen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.floorBannerBtn} onPress={() => router.push(floorsRoute as any)}>
                  <Text style={styles.floorBannerBtnText}>
                    {canAddTables || canEditTables ? 'Manage Floors ➔' : 'View Floors ➔'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {availableFloors.map((floorName) => {
              const floorTables = enabledTables.filter(
                (t) => getTableFloor(t).toLowerCase() === floorName.toLowerCase()
              );
              const meta = getFloorMeta(floorName, dynamicFloors);
              const tableItems = floorTables.filter((t) => getTableSeatingType(t) === 'tables');
              const couchItems = floorTables.filter((t) => getTableSeatingType(t) === 'couches');
              const majlisItems = floorTables.filter((t) => getTableSeatingType(t) === 'majlis');
              const totalFloorSeats = floorTables.reduce((s, t) => s + t.seats, 0);
              const freeFloorSeats = floorTables
                .filter((t) => t.status === 'available')
                .reduce((s, t) => s + t.seats, 0);

              return (
                <View key={floorName} style={styles.floorCardContainer}>
                  <View style={styles.floorCardHeader}>
                    <View style={[styles.floorHeaderBadge, { backgroundColor: meta.color + '18' }]}>
                      <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.floorCardName}>{floorName}</Text>
                      <Text style={styles.floorCardBlurb}>{meta.blurb}</Text>
                    </View>
                    <View style={styles.floorHeaderStats}>
                      <Text style={styles.floorTotalCount}>
                        {floorTables.length} Units • {freeFloorSeats}/{totalFloorSeats} Free Seats
                      </Text>
                      <TouchableOpacity
                        style={styles.floorEditMiniBtn}
                        onPress={() =>
                          openReservationModal({
                            mode: 'group_event',
                            prefillFloor: floorName,
                            defaultGuests: 25,
                          })
                        }
                      >
                        <Ionicons name="sparkles" size={12} color={GROUP_ACCENT} />
                        <Text style={[styles.floorEditMiniBtnText, { color: GROUP_ACCENT }]}>
                          Book Group on {floorName}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.floorZonesGrid}>
                    {/* Dining Tables */}
                    <View style={[styles.floorZoneBox, { borderColor: '#1976D230' }]}>
                      <View style={styles.floorZoneBoxHeader}>
                        <View style={[styles.miniIconBubble, { backgroundColor: '#1976D218' }]}>
                          <SeatingTypeIcon type="tables" size={16} color="#1976D2" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.floorZoneTitle, { color: '#1976D2' }]}>Tables Zone</Text>
                          <Text style={styles.floorZoneSub}>
                            {tableItems.length} tables • {tableItems.reduce((s, t) => s + t.seats, 0)} seats
                          </Text>
                        </View>
                        {canAddTables && (
                          <TouchableOpacity
                            style={[styles.tinyAddBtn, { backgroundColor: '#1976D2' }]}
                            onPress={() => openAddTableModal(floorName, 'tables')}
                          >
                            <Ionicons name="add" size={13} color="#fff" />
                            <Text style={styles.tinyAddBtnText}>Table</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.unitPillsRow}>
                        {tableItems.map((u) => (
                          <TouchableOpacity
                            key={u.id}
                            style={[
                              styles.unitPill,
                              u.status === 'occupied' && { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
                              u.status === 'reserved' && { borderColor: '#7C3AED', backgroundColor: '#FAF5FF' },
                            ]}
                            onPress={() => setActionTableId(u.id)}
                          >
                            <Text style={styles.unitPillName}>{u.name}</Text>
                            <Text style={styles.unitPillSeats}>{u.seats}s</Text>
                          </TouchableOpacity>
                        ))}
                        {tableItems.length === 0 && <Text style={styles.noUnitsText}>No tables configured.</Text>}
                      </View>
                    </View>

                    {/* Couches */}
                    {systemSettings.enableCouchSeating !== false && (
                      <View style={[styles.floorZoneBox, { borderColor: '#E6510030' }]}>
                        <View style={styles.floorZoneBoxHeader}>
                          <View style={[styles.miniIconBubble, { backgroundColor: '#E6510018' }]}>
                            <SeatingTypeIcon type="couches" size={16} color="#E65100" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.floorZoneTitle, { color: '#E65100' }]}>Couches Lounge</Text>
                            <Text style={styles.floorZoneSub}>
                              {couchItems.length} couches • {couchItems.reduce((s, t) => s + t.seats, 0)} seats
                            </Text>
                          </View>
                          {canAddTables && (
                            <TouchableOpacity
                              style={[styles.tinyAddBtn, { backgroundColor: '#E65100' }]}
                              onPress={() => openAddTableModal(floorName, 'couches')}
                            >
                              <Ionicons name="add" size={13} color="#fff" />
                              <Text style={styles.tinyAddBtnText}>Couch</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={styles.unitPillsRow}>
                          {couchItems.map((u) => (
                            <TouchableOpacity
                              key={u.id}
                              style={[
                                styles.unitPill,
                                u.status === 'occupied' && { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
                                u.status === 'reserved' && { borderColor: '#7C3AED', backgroundColor: '#FAF5FF' },
                              ]}
                              onPress={() => setActionTableId(u.id)}
                            >
                              <Text style={styles.unitPillName}>{u.name}</Text>
                              <Text style={styles.unitPillSeats}>{u.seats}s</Text>
                            </TouchableOpacity>
                          ))}
                          {couchItems.length === 0 && <Text style={styles.noUnitsText}>No couches configured.</Text>}
                        </View>
                      </View>
                    )}

                    {/* Majlis Cabins */}
                    {systemSettings.enableMajlisSeating !== false && (
                      <View style={[styles.floorZoneBox, styles.majlisFloorZoneBox]}>
                        <View style={styles.floorZoneBoxHeader}>
                          <View style={[styles.miniIconBubble, { backgroundColor: '#4a121a18' }]}>
                            <SeatingTypeIcon type="majlis" size={16} color="#4a121a" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.floorZoneTitle, { color: '#4a121a' }]}>Arabian Majlis Cabins</Text>
                            <Text style={styles.floorZoneSub}>
                              {majlisItems.length} cabins • {majlisItems.reduce((s, t) => s + t.seats, 0)} guests capacity
                            </Text>
                          </View>
                          {canAddTables && (
                            <TouchableOpacity
                              style={[styles.tinyAddBtn, { backgroundColor: '#4a121a' }]}
                              onPress={() => openAddTableModal(floorName, 'majlis')}
                            >
                              <Ionicons name="add" size={13} color="#fff" />
                              <Text style={styles.tinyAddBtnText}>Cabin</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={styles.unitPillsRow}>
                          {majlisItems.map((cabin) => (
                            <TouchableOpacity
                              key={cabin.id}
                              style={[
                                styles.cabinDetailedCard,
                                cabin.status === 'occupied' && { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
                                cabin.status === 'reserved' && { borderColor: '#7C3AED', backgroundColor: '#FAF5FF' },
                              ]}
                              onPress={() => setActionTableId(cabin.id)}
                            >
                              <SeatingTypeIcon type="majlis" size={14} color="#4a121a" />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.cabinDetailedName}>{cabin.name}</Text>
                                <Text style={styles.cabinDetailedCapacity}>{cabin.seats} Guests Capacity</Text>
                              </View>
                              <View style={[styles.statusMiniDot, { backgroundColor: STATUS_META[cabin.status].color }]} />
                            </TouchableOpacity>
                          ))}
                          {majlisItems.length === 0 && (
                            <Text style={styles.noUnitsText}>No Majlis Cabins configured on this floor.</Text>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ---------- Table Action Sheet ---------- */}
      <Modal visible={!!actionTable} transparent animationType={isMobile ? 'slide' : 'fade'} onRequestClose={() => setActionTableId(null)}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.overlay, isMobile && { justifyContent: 'flex-end', padding: 0 }]}
          onPress={() => setActionTableId(null)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, isMobile && styles.sheetMobile]}>
            {renderActionSheet()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ---------- Add / Edit Seating Unit Modal ---------- */}
      <Modal visible={tableModalVisible} transparent animationType="fade" onRequestClose={() => setTableModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <SeatingTypeIcon type={formSeatingType} size={22} color={SEATING_ZONES[formSeatingType].color} />
              <Text style={styles.dialogTitle}>
                {editingTable ? `Edit ${SEATING_ZONES[formSeatingType].unitLabel}` : `Add ${SEATING_ZONES[formSeatingType].unitLabel}`}
              </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.label}>Floor Location *</Text>
                <TouchableOpacity
                  onPress={() => {
                    setTableModalVisible(false);
                    router.push(floorsRoute as any);
                  }}
                >
                  <Text style={{ fontSize: 12, color: BRAND, fontWeight: '700' }}>+ Manage Floors</Text>
                </TouchableOpacity>
              </View>
              <RoyalDropdown
                placeholder="Choose floor level..."
                options={availableFloors.map((fl) => {
                  const meta = getFloorMeta(fl, dynamicFloors);
                  return {
                    label: fl,
                    value: fl,
                    icon: (meta?.icon as any) || 'layers-outline',
                  };
                })}
                value={formFloor}
                onSelect={(fl) => setFormFloor(fl)}
                icon="layers-outline"
              />
            </View>

            <Text style={styles.label}>Seating Zone Type</Text>
            <View style={styles.seatingTypePickerRow}>
              {SEATING_ZONE_TYPES.filter((type) => {
                if (type === 'majlis' && systemSettings.enableMajlisSeating === false) return false;
                if (type === 'couches' && systemSettings.enableCouchSeating === false) return false;
                return true;
              }).map((type) => {
                const meta = SEATING_ZONES[type];
                const active = formSeatingType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.seatingTypeChoiceCard,
                      active && { borderColor: meta.color, backgroundColor: `${meta.color}10` },
                    ]}
                    onPress={() => {
                      setFormSeatingType(type);
                      setFormSeats(String(meta.defaultSeats));
                      if (!editingTable) {
                        const floorItems = tables.filter(
                          (t) => getTableFloor(t).toLowerCase() === formFloor.toLowerCase() && getTableSeatingType(t) === type
                        );
                        const nextNum = floorItems.length + 1;
                        if (type === 'majlis') setFormName(`Cabin ${nextNum}`);
                        else if (type === 'couches') setFormName(`Couch ${nextNum}`);
                        else setFormName(`${getFloorMeta(formFloor, dynamicFloors).short || 'T'}-${String(nextNum).padStart(2, '0')}`);
                      }
                    }}
                  >
                    <SeatingTypeIcon type={type} size={22} color={active ? meta.color : '#8E8E93'} />
                    <Text style={[styles.seatingTypeChoiceTitle, active && { color: meta.color, fontWeight: '900' }]}>
                      {meta.label}
                    </Text>
                    <Text style={styles.seatingTypeChoiceSub}>{meta.unitLabel}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>
              {formSeatingType === 'majlis'
                ? 'Majlis Cabin Name / Number *'
                : formSeatingType === 'couches'
                  ? 'Couch Name / Number *'
                  : 'Table Name / Number *'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={
                formSeatingType === 'majlis'
                  ? 'e.g. Cabin 1, Royal Cabin A'
                  : formSeatingType === 'couches'
                    ? 'e.g. Couch 1, Lounge Sofa 2'
                    : 'e.g. RT-01, Table 5'
              }
              value={formName}
              onChangeText={setFormName}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.label}>Sitting Capacity (Guests) *</Text>
              <Text style={{ fontSize: 12, color: SEATING_ZONES[formSeatingType].color, fontWeight: '700' }}>
                {formSeats} Guests
              </Text>
            </View>

            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setFormSeats(String(Math.max(1, (parseInt(formSeats, 10) || 1) - 1)))}
              >
                <Ionicons name="remove" size={18} color={BRAND} />
              </TouchableOpacity>
              <TextInput style={styles.stepInput} value={formSeats} onChangeText={setFormSeats} keyboardType="numeric" />
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setFormSeats(String((parseInt(formSeats, 10) || 0) + 1))}
              >
                <Ionicons name="add" size={18} color={BRAND} />
              </TouchableOpacity>
            </View>

            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setTableModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: SEATING_ZONES[formSeatingType].color }]}
                onPress={handleSaveTable}
              >
                <Text style={styles.primaryBtnText}>
                  {editingTable ? 'Save Changes' : `Create ${SEATING_ZONES[formSeatingType].unitLabel}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Add Zone Modal ---------- */}
      <Modal visible={zoneModalVisible} transparent animationType="fade" onRequestClose={() => setZoneModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Add Floor Zone</Text>
            <TextInput style={styles.input} placeholder="e.g. Family Hall" value={formNewZone} onChangeText={setFormNewZone} />
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setZoneModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveZone}>
                <Text style={styles.primaryBtnText}>Save Zone</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Transfer Table Modal ---------- */}
      <Modal visible={transferModalVisible} transparent animationType="fade" onRequestClose={() => setTransferModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Transfer {sourceTable?.name}</Text>
            <Text style={styles.dialogSub}>
              Bill {canViewRevenue ? `Rs. ${(sourceTable?.billTotal || 0).toLocaleString()}` : 'Rs. ••••••'} and kitchen tickets will move to the selected table.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              <View style={styles.wrapRow}>
                {enabledTables
                  .filter((t) => t.status === 'available')
                  .map((t) =>
                    renderTablePickerCard(t, transferToTableId === t.id, () => setTransferToTableId(t.id), '#2563EB', `${getTableFloor(t)} • ${t.seats}s`)
                  )}
              </View>
            </ScrollView>
            {enabledTables.every((t) => t.status !== 'available') && (
              <Text style={styles.warnText}>No available tables right now.</Text>
            )}
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setTransferModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#2563EB' }]} onPress={handleConfirmTransfer}>
                <Text style={styles.primaryBtnText}>Transfer Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Merge Running Orders Modal ---------- */}
      <Modal visible={mergeModalVisible} transparent animationType="fade" onRequestClose={() => setMergeModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Merge Into {sourceTable?.name}</Text>
            <Text style={styles.dialogSub}>
              The selected table&apos;s order and bill will be combined into {sourceTable?.name}, then that table becomes available.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              <View style={styles.wrapRow}>
                {enabledTables
                  .filter((t) => (t.status === 'occupied' || t.status === 'billed') && t.id !== sourceTable?.id && !t.mergedInto)
                  .map((t) =>
                    renderTablePickerCard(
                      t,
                      mergeSecondaryTableId === t.id,
                      () => setMergeSecondaryTableId(t.id),
                      '#7C3AED',
                      canViewRevenue ? `Rs. ${(t.billTotal || 0).toLocaleString()}` : 'Rs. ••••••'
                    )
                  )}
              </View>
            </ScrollView>
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setMergeModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#7C3AED' }]} onPress={handleConfirmMerge}>
                <Text style={styles.primaryBtnText}>Merge Tables</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================
          FLOOR-FIRST GROUP / EVENT ARRANGEMENT & RESERVATION MODAL
         ============================================================ */}
      <Modal visible={reservationModalVisible} transparent animationType="fade" onRequestClose={() => setReservationModalVisible(false)}>
        <View style={styles.overlay}>
          <View
            style={[
              styles.dialog,
              styles.resModalShell,
              width >= 960 ? { maxWidth: 980, width: '95%' } : { maxWidth: 680, width: '96%' },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.resModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={[
                    styles.resModalHeaderIcon,
                    { backgroundColor: resBookingType === 'group_event' ? '#F3E8FF' : '#FAF5EA' },
                  ]}
                >
                  <Ionicons
                    name={resBookingType === 'group_event' ? 'sparkles' : 'calendar'}
                    size={20}
                    color={resBookingType === 'group_event' ? GROUP_ACCENT : BRAND}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dialogTitle} numberOfLines={1}>
                    {editingReservation
                      ? 'Edit Booking / Group Arrangement'
                      : resBookingType === 'group_event'
                        ? 'Group / Floor Event Arrangement'
                        : 'New Table Reservation'}
                  </Text>
                  <Text style={[styles.dialogSub, { marginBottom: 0 }]} numberOfLines={1}>
                    Plan 10–100+ guest arrangements on Rooftop or any floor with live cross-module sync
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setReservationModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Booking Mode Switcher */}
            <View style={styles.modeSwitchRow}>
              <TouchableOpacity
                style={[styles.modeSwitchBtn, resBookingType === 'group_event' && styles.modeSwitchBtnActiveGroup]}
                onPress={() => {
                  setResBookingType('group_event');
                  if (guestsNum < 10) setResGuestsCount('25');
                }}
              >
                <Ionicons name="sparkles" size={14} color={resBookingType === 'group_event' ? '#fff' : GROUP_ACCENT} />
                <Text style={[styles.modeSwitchText, resBookingType === 'group_event' && { color: '#fff' }]}>
                  Group / Party Arrangement (10–100+)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeSwitchBtn, resBookingType === 'regular' && styles.modeSwitchBtnActiveRegular]}
                onPress={() => {
                  setResBookingType('regular');
                  setResIsFullFloor(false);
                  if (guestsNum >= 15) setResGuestsCount('4');
                }}
              >
                <Ionicons name="calendar-outline" size={14} color={resBookingType === 'regular' ? '#fff' : BRAND} />
                <Text style={[styles.modeSwitchText, resBookingType === 'regular' && { color: '#fff' }]}>
                  Standard Table Booking
                </Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable Body (2-Column Side-by-Side on Desktop >= 900px, Clean Stack on Mobile) */}
            <ScrollView
              style={styles.resModalScroll}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={true}
            >
              <View style={[styles.resModalColumns, width < 900 && { flexDirection: 'column' }]}>
                {/* LEFT COLUMN: HOST, SCHEDULE & EVENT DETAILS */}
                <View style={styles.resModalCol}>
                  {/* Section Card 1: Host & Schedule */}
                  <View style={styles.resSectionCard}>
                    <Text style={styles.resSectionHeading}>1. HOST & SCHEDULE</Text>
                    <View style={[styles.formRow, isMobile && { flexDirection: 'column', gap: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Customer / Host Name *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Mr. Usman Ali"
                          placeholderTextColor="#94A3B8"
                          value={resCustomerName}
                          onChangeText={setResCustomerName}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Phone Number *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="03xx-xxxxxxx"
                          placeholderTextColor="#94A3B8"
                          value={resPhone}
                          onChangeText={setResPhone}
                          keyboardType="phone-pad"
                        />
                      </View>
                    </View>

                    {/* Interactive Date & Time Picker Trigger Fields */}
                    <View style={[styles.formRow, isMobile && { flexDirection: 'column', gap: 0 }]}>
                      <View style={{ flex: 1, marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <Text style={[styles.label, { marginBottom: 0 }]}>Event Date *</Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => {
                                const iso = getDateOffsetIso(0);
                                setResDate(iso);
                                const d = parseIsoDateSafe(iso);
                                setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
                              }}
                            >
                              <Text style={[styles.quickLinkText, resDate === getDateOffsetIso(0) && { color: BRAND, textDecorationLine: 'underline' }]}>
                                Today
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                const iso = getDateOffsetIso(1);
                                setResDate(iso);
                                const d = parseIsoDateSafe(iso);
                                setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
                              }}
                            >
                              <Text style={[styles.quickLinkText, resDate === getDateOffsetIso(1) && { color: BRAND, textDecorationLine: 'underline' }]}>
                                Tomorrow
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.scheduleTriggerBtn,
                            activeSchedulePicker === 'date' && styles.scheduleTriggerBtnActive,
                          ]}
                          activeOpacity={0.8}
                          onPress={() => {
                            const d = parseIsoDateSafe(resDate);
                            setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
                            setActiveSchedulePicker((cur) => (cur === 'date' ? 'none' : 'date'));
                          }}
                        >
                          <View style={styles.scheduleTriggerIcon}>
                            <Ionicons name="calendar" size={16} color={BRAND} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.scheduleTriggerValue} numberOfLines={1}>
                              {formatDisplayDate(resDate)}
                            </Text>
                            <Text style={styles.scheduleTriggerSub} numberOfLines={1}>
                              Tap to open calendar
                            </Text>
                          </View>
                          <Ionicons
                            name={activeSchedulePicker === 'date' ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="#64748B"
                          />
                        </TouchableOpacity>
                      </View>

                      <View style={{ flex: 1, marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <Text style={[styles.label, { marginBottom: 0 }]}>Event Time *</Text>
                          <Text style={styles.mealBadgeInline}>{getMealPeriodLabel(resTimeSlot)}</Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.scheduleTriggerBtn,
                            activeSchedulePicker === 'time' && styles.scheduleTriggerBtnActive,
                          ]}
                          activeOpacity={0.8}
                          onPress={() => setActiveSchedulePicker((cur) => (cur === 'time' ? 'none' : 'time'))}
                        >
                          <View style={[styles.scheduleTriggerIcon, { backgroundColor: '#F3E8FF' }]}>
                            <Ionicons name="time" size={16} color={GROUP_ACCENT} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.scheduleTriggerValue} numberOfLines={1}>
                              {resTimeSlot}
                            </Text>
                            <Text style={styles.scheduleTriggerSub} numberOfLines={1}>
                              Tap to pick slot or dial
                            </Text>
                          </View>
                          <Ionicons
                            name={activeSchedulePicker === 'time' ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="#64748B"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* INLINE INTERACTIVE MONTHLY CALENDAR */}
                    {activeSchedulePicker === 'date' && (() => {
                      const { year, month } = calendarMonth;
                      const firstDayOfWeek = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const todayIso = getDateOffsetIso(0);
                      const bookedDatesSet = new Set(
                        reservations
                          .filter((r) => r.status === 'confirmed' || r.status === 'seated')
                          .map((r) => r.reservationDate)
                      );

                      const cells: (number | null)[] = [];
                      for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
                      for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                      while (cells.length % 7 !== 0) cells.push(null);

                      const shiftMonth = (delta: number) => {
                        const next = new Date(year, month + delta, 1);
                        setCalendarMonth({ year: next.getFullYear(), month: next.getMonth() });
                      };

                      return (
                        <View style={styles.calendarBox}>
                          {/* Month Navigation */}
                          <View style={styles.calendarHeader}>
                            <TouchableOpacity style={styles.calNavBtn} onPress={() => shiftMonth(-1)}>
                              <Ionicons name="chevron-back" size={16} color={BRAND} />
                            </TouchableOpacity>
                            <Text style={styles.calendarMonthTitle}>
                              {MONTHS_FULL[month]} {year}
                            </Text>
                            <TouchableOpacity style={styles.calNavBtn} onPress={() => shiftMonth(1)}>
                              <Ionicons name="chevron-forward" size={16} color={BRAND} />
                            </TouchableOpacity>
                          </View>

                          {/* Weekday Headers */}
                          <View style={styles.calWeekRow}>
                            {WEEKDAYS_SHORT.map((wd) => (
                              <Text key={wd} style={styles.calWeekLabel}>
                                {wd}
                              </Text>
                            ))}
                          </View>

                          {/* Days Grid */}
                          <View style={styles.calDaysGrid}>
                            {cells.map((dayNum, idx) => {
                              if (!dayNum) {
                                return <View key={`empty-${idx}`} style={styles.calDayCell} />;
                              }
                              const cellIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                              const isSelected = cellIso === resDate;
                              const isToday = cellIso === todayIso;
                              const isPast = cellIso < todayIso;
                              const hasEvent = bookedDatesSet.has(cellIso);

                              return (
                                <TouchableOpacity
                                  key={cellIso}
                                  disabled={isPast}
                                  style={[
                                    styles.calDayCell,
                                    isToday && !isSelected && styles.calDayCellToday,
                                    isSelected && styles.calDayCellSelected,
                                    isPast && { opacity: 0.32 },
                                  ]}
                                  onPress={() => {
                                    setResDate(cellIso);
                                    setActiveSchedulePicker('time');
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.calDayText,
                                      isToday && !isSelected && { color: BRAND, fontWeight: '900' },
                                      isSelected && styles.calDayTextSelected,
                                    ]}
                                  >
                                    {dayNum}
                                  </Text>
                                  {hasEvent && (
                                    <View
                                      style={[
                                        styles.calEventDot,
                                        isSelected && { backgroundColor: GOLD },
                                      ]}
                                    />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Calendar Quick Footer */}
                          <View style={styles.calFooterRow}>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              {[
                                { label: 'Today', offset: 0 },
                                { label: 'Tomorrow', offset: 1 },
                                { label: '+3 Days', offset: 3 },
                                { label: '+7 Days', offset: 7 },
                              ].map((q) => {
                                const qIso = getDateOffsetIso(q.offset);
                                return (
                                  <TouchableOpacity
                                    key={q.label}
                                    style={[styles.calQuickChip, resDate === qIso && { backgroundColor: BRAND, borderColor: BRAND }]}
                                    onPress={() => {
                                      setResDate(qIso);
                                      const d = parseIsoDateSafe(qIso);
                                      setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
                                      setActiveSchedulePicker('none');
                                    }}
                                  >
                                    <Text style={[styles.calQuickChipText, resDate === qIso && { color: '#F3D179' }]}>
                                      {q.label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <TouchableOpacity onPress={() => setActiveSchedulePicker('none')}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND }}>Done</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })()}

                    {/* INLINE ROYAL TIME PICKER (MEAL PERIODS + CUSTOM EXACT TIME DIAL) */}
                    {activeSchedulePicker === 'time' && (() => {
                      const activeGroup = MEAL_TIME_GROUPS.find((g) => g.key === activeTimeTab) || MEAL_TIME_GROUPS[2];
                      const { hour, minute, period } = parseTimeSlotParts(resTimeSlot);
                      const setDial = (h: number, m: number, p: 'AM' | 'PM') => {
                        setResTimeSlot(formatTimeSlotParts(h, m, p));
                      };

                      return (
                        <View style={styles.timePickerBox}>
                          {/* Meal Period Tabs */}
                          <View style={styles.mealTabsRow}>
                            {MEAL_TIME_GROUPS.map((grp) => {
                              const active = activeTimeTab === grp.key;
                              return (
                                <TouchableOpacity
                                  key={grp.key}
                                  style={[styles.mealTabBtn, active && styles.mealTabBtnActive]}
                                  onPress={() => setActiveTimeTab(grp.key)}
                                >
                                  <Ionicons
                                    name={grp.icon}
                                    size={13}
                                    color={active ? '#F3D179' : '#64748B'}
                                  />
                                  <View>
                                    <Text style={[styles.mealTabTitle, active && { color: '#F3D179' }]}>
                                      {grp.label}
                                    </Text>
                                    <Text style={[styles.mealTabSub, active && { color: 'rgba(255,255,255,0.75)' }]}>
                                      {grp.sub}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Slots Grid OR Custom Exact Time Dial */}
                          {activeTimeTab !== 'custom' ? (
                            <View style={styles.timeGridWrap}>
                              {activeGroup.slots.map((slot) => {
                                const active = resTimeSlot === slot;
                                return (
                                  <TouchableOpacity
                                    key={slot}
                                    style={[styles.timeSlotBtn, active && styles.timeSlotBtnActive]}
                                    onPress={() => {
                                      setResTimeSlot(slot);
                                      setActiveSchedulePicker('none');
                                    }}
                                  >
                                    <Ionicons
                                      name="time-outline"
                                      size={12}
                                      color={active ? '#F3D179' : '#64748B'}
                                    />
                                    <Text style={[styles.timeSlotBtnText, active && styles.timeSlotBtnTextActive]}>
                                      {slot}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : (
                            <View style={styles.customDialBox}>
                              <View style={styles.dialRow}>
                                {/* Hour Stepper */}
                                <View style={styles.dialCol}>
                                  <Text style={styles.dialLabel}>HOUR</Text>
                                  <View style={styles.dialStepper}>
                                    <TouchableOpacity
                                      style={styles.dialStepBtn}
                                      onPress={() => setDial(hour === 1 ? 12 : hour - 1, minute, period)}
                                    >
                                      <Ionicons name="remove" size={16} color={BRAND} />
                                    </TouchableOpacity>
                                    <Text style={styles.dialValue}>{String(hour).padStart(2, '0')}</Text>
                                    <TouchableOpacity
                                      style={styles.dialStepBtn}
                                      onPress={() => setDial(hour === 12 ? 1 : hour + 1, minute, period)}
                                    >
                                      <Ionicons name="add" size={16} color={BRAND} />
                                    </TouchableOpacity>
                                  </View>
                                </View>

                                {/* Minute Presets */}
                                <View style={[styles.dialCol, { flex: 1.4 }]}>
                                  <Text style={styles.dialLabel}>MINUTE</Text>
                                  <View style={{ flexDirection: 'row', gap: 5 }}>
                                    {[0, 15, 30, 45].map((m) => {
                                      const active = minute === m;
                                      return (
                                        <TouchableOpacity
                                          key={m}
                                          style={[styles.dialMinChip, active && styles.dialMinChipActive]}
                                          onPress={() => setDial(hour, m, period)}
                                        >
                                          <Text style={[styles.dialMinText, active && { color: '#F3D179' }]}>
                                            :{String(m).padStart(2, '0')}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </View>

                                {/* AM / PM Toggle */}
                                <View style={styles.dialCol}>
                                  <Text style={styles.dialLabel}>AM / PM</Text>
                                  <View style={{ flexDirection: 'row', gap: 5 }}>
                                    {(['AM', 'PM'] as const).map((p) => {
                                      const active = period === p;
                                      return (
                                        <TouchableOpacity
                                          key={p}
                                          style={[styles.dialMinChip, active && styles.dialMinChipActive]}
                                          onPress={() => setDial(hour, minute, p)}
                                        >
                                          <Text style={[styles.dialMinText, active && { color: '#F3D179' }]}>{p}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </View>
                              </View>
                            </View>
                          )}

                          <View style={styles.calFooterRow}>
                            <Text style={{ fontSize: 11.5, color: '#64748B', fontWeight: '700' }}>
                              Selected: <Text style={{ color: BRAND, fontWeight: '900' }}>{resTimeSlot}</Text> ({getMealPeriodLabel(resTimeSlot)})
                            </Text>
                            <TouchableOpacity onPress={() => setActiveSchedulePicker('none')}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND }}>Done</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Section Card 2: Party Size & Event Details */}
                  <View style={styles.resSectionCard}>
                    <Text style={styles.resSectionHeading}>2. PARTY SIZE & EVENT SETUP</Text>

                    <View style={[styles.formRow, isMobile && { flexDirection: 'column', gap: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Total Guests *</Text>
                        <View style={styles.stepper}>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setResGuestsCount(String(Math.max(1, guestsNum - (guestsNum >= 10 ? 5 : 1))))}
                          >
                            <Ionicons name="remove" size={18} color={BRAND} />
                          </TouchableOpacity>
                          <TextInput
                            style={styles.stepInput}
                            value={resGuestsCount}
                            onChangeText={setResGuestsCount}
                            keyboardType="numeric"
                          />
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setResGuestsCount(String(guestsNum + (guestsNum >= 10 ? 5 : 1)))}
                          >
                            <Ionicons name="add" size={18} color={BRAND} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {resBookingType === 'group_event' && (
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>Advance Deposit (Rs.)</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. 10000 (optional)"
                            placeholderTextColor="#94A3B8"
                            value={resAdvanceDeposit}
                            onChangeText={setResAdvanceDeposit}
                            keyboardType="numeric"
                          />
                        </View>
                      )}
                    </View>

                    {/* Quick Guest Presets */}
                    <View style={[styles.wrapRow, { marginBottom: 10 }]}>
                      {GUEST_PRESETS.map((num) => {
                        const active = guestsNum === num;
                        return (
                          <TouchableOpacity
                            key={num}
                            style={[
                              styles.presetPill,
                              active && { backgroundColor: GROUP_ACCENT, borderColor: GROUP_ACCENT },
                            ]}
                            onPress={() => {
                              setResGuestsCount(String(num));
                              if (num >= 10) setResBookingType('group_event');
                              const picked = autoPickTablesForFloor(resFloor, num, resIncludeOtherFloors);
                              if (picked.primaryId) {
                                setResTableId(picked.primaryId);
                                setResLinkedIds(picked.linkedIds);
                                setResIsFullFloor(false);
                              }
                            }}
                          >
                            <Text style={[styles.presetPillText, active && { color: '#fff' }]}>{num} Guests</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {resBookingType === 'group_event' && (
                      <>
                        <Text style={styles.label}>Occasion / Event Type</Text>
                        <View style={[styles.wrapRow, { marginBottom: 10 }]}>
                          {EVENT_OCCASIONS.map((occ) => {
                            const active = resOccasion === occ;
                            return (
                              <TouchableOpacity
                                key={occ}
                                style={[styles.chip, active && { backgroundColor: GROUP_ACCENT, borderColor: GROUP_ACCENT }]}
                                onPress={() => setResOccasion(occ)}
                              >
                                <Text style={[styles.chipText, active && { color: '#fff' }]}>{occ}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        <Text style={styles.label}>Seating Arrangement Style</Text>
                        <View style={[styles.wrapRow, { marginBottom: 10 }]}>
                          {ARRANGEMENT_STYLES.map((st) => {
                            const active = resArrangementStyle === st;
                            return (
                              <TouchableOpacity
                                key={st}
                                style={[styles.chip, active && { backgroundColor: BRAND, borderColor: BRAND }]}
                                onPress={() => setResArrangementStyle(st)}
                              >
                                <Text style={[styles.chipText, active && { color: '#fff' }]}>{st}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    )}

                    <Text style={styles.label}>Setup, Decor & Menu Notes (optional)</Text>
                    <TextInput
                      style={[styles.input, { height: 64, textAlignVertical: 'top', marginBottom: 0 }]}
                      placeholder="e.g. Rooftop setup for 25 guests, BBQ platters pre-order, birthday decor, high chairs…"
                      placeholderTextColor="#94A3B8"
                      value={resNotes}
                      onChangeText={setResNotes}
                      multiline
                    />
                  </View>
                </View>

                {/* RIGHT COLUMN: FLOOR PICKER & INTERACTIVE SEATING PLANNER */}
                <View style={styles.resModalCol}>
                  {/* Section Card 3: Floor Picker */}
                  <View style={styles.resSectionCard}>
                    <Text style={styles.resSectionHeading}>3. CHOOSE FLOOR</Text>
                    <View style={styles.modalFloorGrid}>
                      {availableFloors.map((fl) => {
                        const active = resFloor.toLowerCase() === fl.toLowerCase();
                        const cap = floorCapacityMap[fl.toLowerCase()];
                        const meta = getFloorMeta(fl, dynamicFloors);
                        return (
                          <TouchableOpacity
                            key={fl}
                            style={[
                              styles.modalFloorCard,
                              active && { borderColor: GROUP_ACCENT, backgroundColor: '#F5F3FF' },
                            ]}
                            onPress={() => handleSwitchReservationFloor(fl)}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <Ionicons
                                name={(meta?.icon as any) || 'layers-outline'}
                                size={14}
                                color={active ? GROUP_ACCENT : meta?.color || '#64748B'}
                              />
                              <Text style={[styles.modalFloorCardTitle, active && { color: GROUP_ACCENT }]} numberOfLines={1}>
                                {fl}
                              </Text>
                            </View>
                            <Text style={styles.modalFloorCardSub} numberOfLines={1}>
                              {cap?.availableSeats || 0} Free • {cap?.availableUnits || 0} units
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Section Card 4: Floor Seating Units & Auto-Arrange */}
                  <View style={styles.resSectionCard}>
                    <Text style={styles.resSectionHeading}>4. {resFloor.toUpperCase()} SEATING UNITS</Text>
                    <Text style={[styles.dialogSub, { marginTop: 0, marginBottom: 10 }]}>
                      Tap units to join for this party. First selected unit is Primary (handles unified billing).
                    </Text>

                    {/* Smart Arrangement Action Buttons */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      <TouchableOpacity style={styles.autoArrangeBtn} onPress={handleAutoArrangeFloor}>
                        <Ionicons name="sparkles" size={13} color="#fff" />
                        <Text style={styles.autoArrangeBtnText}>
                          Auto-Arrange {guestsNum || 0}G on {resFloor}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.fullFloorBtn} onPress={handleReserveEntireFloor}>
                        <Ionicons name="shield-checkmark-outline" size={13} color={BRAND} />
                        <Text style={styles.fullFloorBtnText}>Full {resFloor}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.typeMiniChip,
                          resIncludeOtherFloors && { backgroundColor: '#0284C7', borderColor: '#0284C7' },
                        ]}
                        onPress={() => setResIncludeOtherFloors((v) => !v)}
                      >
                        <Text style={[styles.typeMiniChipText, resIncludeOtherFloors && { color: '#fff' }]}>
                          {resIncludeOtherFloors ? '✓ + Other Floors' : '+ Other Floors'}
                        </Text>
                      </TouchableOpacity>

                      {allSelectedIds.length > 0 && (
                        <TouchableOpacity
                          style={styles.typeMiniChip}
                          onPress={() => {
                            setResTableId('');
                            setResLinkedIds([]);
                            setResIsFullFloor(false);
                          }}
                        >
                          <Text style={[styles.typeMiniChipText, { color: '#DC2626' }]}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Interactive Units Grid */}
                    <View style={[styles.wrapRow, { marginBottom: 12 }]}>
                      {modalFloorUnits.map((t) => {
                        const selectable = isSelectableForReservation(t);
                        const isPrimary = resTableId === t.id;
                        const isLinked = resLinkedIds.includes(t.id);
                        const isPicked = isPrimary || isLinked;
                        const accent = isPrimary ? BRAND : GROUP_ACCENT;
                        const tFloor = getTableFloor(t);

                        return (
                          <TouchableOpacity
                            key={t.id}
                            disabled={!selectable}
                            onPress={() => handleToggleModalUnit(t.id)}
                            style={[
                              styles.pickCard,
                              !selectable && { opacity: 0.42, backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
                              isPicked && { backgroundColor: accent, borderColor: accent },
                            ]}
                            activeOpacity={0.85}
                          >
                            {isPicked && (
                              <View style={styles.pickCheck}>
                                <Ionicons name="checkmark" size={11} color={accent} />
                              </View>
                            )}
                            <Text style={[styles.pickName, isPicked && { color: '#fff' }]}>{t.name}</Text>
                            <Text style={[styles.pickSub, isPicked && { color: '#ffffffdd' }]}>
                              {isPrimary
                                ? `PRIMARY • ${t.seats}s`
                                : isLinked
                                  ? `JOINED • ${t.seats}s`
                                  : !selectable
                                    ? `${t.status.toUpperCase()} • ${t.seats}s`
                                    : `${tFloor.toLowerCase() === resFloor.toLowerCase() ? getTableSeatingType(t) : tFloor} • ${t.seats}s`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {modalFloorUnits.filter(isSelectableForReservation).length === 0 && (
                      <Text style={styles.warnText}>
                        No available seating units on {resFloor} right now. Switch floors or enable &ldquo;+ Other Floors&rdquo;.
                      </Text>
                    )}

                    {/* Live Capacity Progress Box */}
                    <View
                      style={[
                        styles.capacityBox,
                        {
                          borderColor: capacityOk ? '#15803D55' : '#D9770655',
                          backgroundColor: capacityOk ? '#F0FDF4' : '#FFFBEB',
                        },
                      ]}
                    >
                      <Ionicons
                        name={capacityOk ? 'checkmark-circle' : 'alert-circle'}
                        size={20}
                        color={capacityOk ? '#15803D' : '#D97706'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.capacityTitle, { color: capacityOk ? '#15803D' : '#B45309' }]}>
                          {selectedSeats} / {guestsNum} Seats Covered ({allSelectedIds.length} Unit{allSelectedIds.length === 1 ? '' : 's'})
                          {resIsFullFloor ? ` • Full ${resFloor}` : ''}
                        </Text>
                        <Text style={styles.capacitySub}>
                          {allSelectedIds.length > 0
                            ? allSelectedIds.map((id) => tableById(id)?.name).filter(Boolean).join(' + ')
                            : 'No seating units selected yet'}
                          {seatsShortfall > 0 && allSelectedIds.length > 0
                            ? ` • +${seatsShortfall} extra chairs needed`
                            : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(100, guestsNum ? (selectedSeats / guestsNum) * 100 : 0)}%`,
                            backgroundColor: capacityOk ? '#15803D' : '#D97706',
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Sticky Footer Bar */}
            <View style={styles.resModalFooter}>
              {!isMobile && (
                <View style={styles.resFooterSummary}>
                  <Ionicons name="location-outline" size={14} color={GROUP_ACCENT} />
                  <Text style={styles.resFooterSummaryText} numberOfLines={1}>
                    {resFloor} • {guestsNum || 0} Guests • {resTimeSlot} • {allSelectedIds.length} Unit(s)
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setReservationModalVisible(false)}>
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: resBookingType === 'group_event' ? GROUP_ACCENT : BRAND }]}
                  onPress={handleSaveReservation}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {editingReservation
                      ? 'Update Arrangement'
                      : resBookingType === 'group_event'
                        ? `Confirm ${guestsNum || 0}-Guest Arrangement`
                        : 'Confirm Booking'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Single Table QR Standee Modal (English Only) ---------- */}
      <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.dialog, { maxWidth: 440, padding: 20 }]}>
            {qrTable && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: '#FAF5EA',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#D5A943',
                      }}
                    >
                      <Ionicons name="qr-code" size={18} color="#895B1E" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 17, fontWeight: '900', color: '#1C1C1E' }}>
                        Table QR • {qrTable.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B' }}>
                        {getTableFloor(qrTable)} • {getTableSeatingType(qrTable).toUpperCase()} ({qrTable.seats} Seats)
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setQrModalVisible(false)}>
                    <Ionicons name="close-circle" size={24} color="#8E8E93" />
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    backgroundColor: '#FAF8F5',
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: '#D5A943',
                    padding: 16,
                    alignItems: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#3A0F12', letterSpacing: 1 }}>
                    SULTAN RESTAURANT
                  </Text>
                  <Text style={{ fontSize: 11, color: '#895B1E', fontWeight: '800' }}>
                    DIGITAL TABLE MENU & ORDERING
                  </Text>

                  <View
                    style={{
                      backgroundColor: '#3A0F12',
                      paddingHorizontal: 14,
                      paddingVertical: 5,
                      borderRadius: 20,
                      marginVertical: 10,
                      borderWidth: 1,
                      borderColor: '#D5A943',
                    }}
                  >
                    <Text style={{ color: '#D5A943', fontSize: 15, fontWeight: '900' }}>{qrTable.name}</Text>
                  </View>

                  <View
                    style={{
                      width: 190,
                      height: 190,
                      backgroundColor: '#FFF',
                      borderRadius: 10,
                      padding: 8,
                      borderWidth: 1.5,
                      borderColor: '#E6D5B8',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isGeneratingQr ? (
                      <ActivityIndicator size="large" color="#895B1E" />
                    ) : qrDataUrl ? (
                      <Image source={{ uri: qrDataUrl }} style={{ width: 170, height: 170 }} resizeMode="contain" />
                    ) : (
                      <Text style={{ color: '#888', fontSize: 12 }}>Generating QR...</Text>
                    )}
                  </View>

                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#3A0F12', marginTop: 10 }}>
                    Scan with Phone Camera to View Menu & Order
                  </Text>
                  <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                    Works on Mobile Data (4G/5G) & Restaurant Wi-Fi
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: '#F1F5F9',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#475569', flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {getTableMenuUrl(qrTable.id, qrTable.floor, qrTable.name)}
                  </Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: copiedLink ? '#10B981' : '#3A0F12',
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 6,
                    }}
                    onPress={() => handleCopyTableLink(qrTable)}
                  >
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>
                      {copiedLink ? '✓ Copied' : 'Copy URL'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#B8860B',
                      paddingVertical: 12,
                      borderRadius: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onPress={() => {
                      if (qrDataUrl) printTableStandeeHtml(qrTable, qrDataUrl);
                    }}
                    disabled={!qrDataUrl}
                  >
                    <Ionicons name="print" size={17} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>
                      Print Luxury Acrylic Table Standee
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      backgroundColor: '#FAF5EA',
                      borderWidth: 1,
                      borderColor: '#D5A943',
                      paddingVertical: 9,
                      borderRadius: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onPress={() => {
                      const link = getTableMenuUrl(qrTable.id, qrTable.floor, qrTable.name);
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.open(link, '_blank');
                      } else {
                        router.push(`/menu?tableId=${qrTable.id}&floor=${qrTable.floor || ''}` as any);
                      }
                      setQrModalVisible(false);
                    }}
                  >
                    <Ionicons name="eye-outline" size={16} color="#895B1E" />
                    <Text style={{ color: '#895B1E', fontWeight: '800', fontSize: 12 }}>
                      Test Guest View for {qrTable.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ---------- Batch Floor QRs Modal ---------- */}
      <Modal visible={batchQrModalVisible} transparent animationType="fade" onRequestClose={() => setBatchQrModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.dialog, { maxWidth: 650, maxHeight: '90%', padding: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#1C1C1E' }}>Batch Table QR Standees</Text>
                <Text style={{ fontSize: 12, color: '#64748B' }}>
                  Print acrylic tent cards for all tables on {floorFilter === 'all' ? 'All Floors' : floorFilter}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBatchQrModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {isBatchGenerating ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size="large" color="#895B1E" />
                <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '700' }}>
                  Generating QR codes for {(floorFilter === 'all' ? enabledTables : filteredTables).length} tables...
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380, marginBottom: 14 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {(floorFilter === 'all' ? enabledTables : filteredTables).map((tbl) => {
                    const qr = batchQrMap[tbl.id];
                    return (
                      <View
                        key={tbl.id}
                        style={{
                          width: '31%',
                          minWidth: 145,
                          flexGrow: 1,
                          backgroundColor: '#FAF8F5',
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: '#D5A94380',
                          padding: 10,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '900', color: '#3A0F12' }}>{tbl.name}</Text>
                        <Text style={{ fontSize: 10, color: '#64748B' }}>
                          {getTableFloor(tbl)} • {tbl.seats}s
                        </Text>
                        <View
                          style={{
                            width: 90,
                            height: 90,
                            backgroundColor: '#FFF',
                            borderRadius: 6,
                            marginVertical: 6,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: '#E0E0E0',
                          }}
                        >
                          {qr ? (
                            <Image source={{ uri: qr }} style={{ width: 80, height: 80 }} resizeMode="contain" />
                          ) : (
                            <ActivityIndicator size="small" color="#895B1E" />
                          )}
                        </View>
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#3A0F12',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 4,
                          }}
                          onPress={() => printTableStandeeHtml(tbl, qr || '')}
                        >
                          <Text style={{ color: '#D5A943', fontSize: 10, fontWeight: '800' }}>Print 1</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 12 }}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setBatchQrModalVisible(false)}>
                <Text style={styles.ghostBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#B8860B',
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
                onPress={() => {
                  const targetList = floorFilter === 'all' ? enabledTables : filteredTables;
                  printAllTablesStandeesHtml(targetList, batchQrMap);
                }}
                disabled={isBatchGenerating}
              >
                <Ionicons name="print" size={17} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>
                  Print All {(floorFilter === 'all' ? enabledTables : filteredTables).length} Standees
                </Text>
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
  topCommandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E1DA',
    shadowColor: '#24050A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  headerLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 260, flexWrap: 'wrap' },
  titleIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#3B0B12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
  },
  liveSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  liveSummaryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveSummaryText: { fontSize: 10.5, fontWeight: '900', color: '#047857', letterSpacing: 0.3 },
  headerTabsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F4F2EE',
    borderRadius: 10,
    padding: 3,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#E5E1DA',
  },
  headerTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
  },
  headerTabPillActive: {
    backgroundColor: '#4A121A',
    shadowColor: '#4A121A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTabText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  headerTabTextActive: { color: '#F3D179', fontWeight: '900' },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FAF7F2',
    borderWidth: 1,
    borderColor: '#E5E1DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17.5, fontWeight: '900', color: '#24050A', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  cmdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7.5,
    borderRadius: 9,
    borderWidth: 1,
  },
  cmdBtnGroup: {
    backgroundColor: '#6D28D9',
    borderColor: '#5B21B6',
  },
  cmdBtnPrimary: {
    backgroundColor: '#4A121A',
    borderColor: '#3B0B12',
  },
  cmdBtnOutline: {
    backgroundColor: '#FAF8F4',
    borderColor: '#DDD6CA',
  },
  cmdBtnText: { fontWeight: '800', fontSize: 12.5 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 70 },

  // Full-Width Slim Executive KPI Strip
  kpiGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  kpiSlimCard: {
    flex: 1,
    minWidth: 165,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E1DA',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiSlimIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  kpiSlimValue: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  kpiSlimLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  kpiSlimSub: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 1 },
  toolbarDivider: { width: 1, height: 20, backgroundColor: '#E2E8F0', marginHorizontal: 4 },

  statsRow: { gap: 10, paddingBottom: 4 },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    minWidth: 162,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 17, fontWeight: '900', color: '#1C1C1E' },
  statLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  statSub: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 1 },

  tabRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 14 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  segmentItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  segmentItemActive: {
    ...Platform.select({
      web: { backgroundImage: 'linear-gradient(90deg, #D4AF37 0%, #B8860B 100%)' },
      default: { backgroundColor: '#D4AF37' },
    }),
  },
  segmentText: { fontSize: 13.5, fontWeight: '700', color: '#64748B' },
  segmentTextActive: { color: '#24050A', fontWeight: '900' },
  segmentBadge: { backgroundColor: '#7C3AED', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segmentBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  // Active Group Strip
  groupStripContainer: {
    backgroundColor: '#FAF5FF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    padding: 12,
    marginBottom: 12,
  },
  groupStripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupStripTitle: { fontSize: 13.5, fontWeight: '900', color: '#4C1D95' },
  groupStripLink: { fontSize: 12.5, fontWeight: '800', color: GROUP_ACCENT },
  groupStripCard: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: 11,
    gap: 4,
  },
  floorMiniTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  floorMiniTagText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
  groupStripGuests: { fontSize: 12.5, fontWeight: '900', color: '#1E293B' },
  groupStripTime: { fontSize: 12, fontWeight: '800', color: GROUP_ACCENT },
  groupStripName: { fontSize: 13.5, fontWeight: '800', color: '#0F172A' },
  groupStripUnits: { fontSize: 11.5, color: '#64748B', fontWeight: '600' },
  miniPillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  miniPillBtnText: { fontSize: 11.5, fontWeight: '800' },

  // Floor Pills
  floorPillsRow: { gap: 6, paddingVertical: 2 },
  floorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  floorPillActive: { backgroundColor: '#F3D179', borderColor: '#B8860B' },
  floorPillText: { fontSize: 12.5, fontWeight: '800', color: '#334155' },
  floorPillTextActive: { color: '#24050A', fontWeight: '900' },
  floorPillBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 7 },
  floorPillBadgeActive: { backgroundColor: '#24050A' },
  floorPillBadgeText: { fontSize: 10.5, fontWeight: '800', color: '#475569' },

  // Unified Control Card
  controlCard: {
    backgroundColor: '#fff',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E5E1DA',
    marginBottom: 12,
  },
  controlTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#F8FAFC',
    borderRadius: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, paddingVertical: 6.5, fontSize: 13, color: '#0F172A' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  capacityStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  typeMiniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typeMiniChipActive: { backgroundColor: BRAND, borderColor: BRAND },
  typeMiniChipText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  inlineArrangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GROUP_ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inlineArrangeBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Floor Grouped Sections
  floorGroupSection: { marginBottom: 16 },
  floorGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 6,
    gap: 8,
  },
  floorGroupIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  floorGroupTitle: { fontSize: 16, fontWeight: '900', color: '#1E293B' },
  floorGroupMeta: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  floorQuickBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  floorQuickBookText: { fontSize: 12, fontWeight: '800', color: GROUP_ACCENT },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  tile: {
    backgroundColor: '#fff',
    borderRadius: 15,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  tileStrip: { height: 5 },
  tileBody: { padding: 12, flex: 1 },
  tileTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tileName: { fontSize: 17, fontWeight: '900', color: '#0F172A', flexShrink: 1 },
  qrMiniBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FAF5EA',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9 },
  statusPillText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.2 },
  tileIconBubble: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tileTypeBadge: { fontSize: 11.5, fontWeight: '800' },
  tileDot: { fontSize: 11, color: '#CBD5E1' },
  tileFloorTag: { fontSize: 11.5, color: '#64748B', fontWeight: '700' },
  tileCapacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    marginTop: 8,
  },
  tileMajlisCapacityRow: { backgroundColor: '#4a121a10' },
  tileCapacityText: { fontSize: 12, fontWeight: '700', color: '#334155', flexShrink: 1 },
  tileMetaText: { fontSize: 12, color: '#475569', fontWeight: '600', flexShrink: 1 },
  dot: { color: '#CBD5E1' },
  tileFooter: { marginTop: 'auto', paddingTop: 10 },
  tileBill: { fontSize: 16.5, fontWeight: '900', color: BRAND },
  tileSub: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  tileGuest: { fontSize: 14, fontWeight: '900', color: '#5B21B6' },
  groupBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: GROUP_ACCENT,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  groupBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
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
  infoChipText: { fontSize: 11.5, fontWeight: '800', color: BRAND },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { color: '#64748B', fontSize: 14.5, textAlign: 'center', fontWeight: '600' },

  // Reservations Tab
  resCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E1DA',
  },
  resTime: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', minWidth: 102, gap: 3 },
  resTimeText: { fontSize: 15, fontWeight: '900' },
  resDateText: { fontSize: 11.5, color: '#64748B', fontWeight: '600' },
  resGuestBubble: { marginTop: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  resGuestBubbleText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  resName: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  resMeta: { fontSize: 13, color: '#475569' },
  resNotes: { fontSize: 12.5, color: '#64748B', fontStyle: 'italic' },
  resActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9 },
  smallBtnGhost: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  smallBtnText: { fontSize: 12.5, fontWeight: '800' },

  // Modals & Action Sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15, 10, 14, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 20 },
  sheetMobile: { maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 16 },
  sheetBody: { padding: 18, gap: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  sheetSub: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  sheetInfo: { borderRadius: 12, padding: 12, gap: 3 },
  sheetInfoLabel: { fontSize: 11.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  sheetInfoValue: { fontSize: 17, fontWeight: '900', color: '#0F172A' },
  sheetInfoSub: { fontSize: 13, color: '#334155' },
  sheetDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, backgroundColor: '#fff' },
  actionRowText: { fontSize: 13.5, fontWeight: '800' },

  dialog: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  dialogTitle: { fontSize: 19, fontWeight: '900', color: BRAND },
  dialogSub: { fontSize: 12.5, color: '#64748B', marginTop: 2, marginBottom: 8 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10 },
  ghostBtnText: { color: '#64748B', fontWeight: '700', fontSize: 14.5 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GOLD, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },

  // Group Modal specific styles
  resModalShell: {
    maxHeight: '92%',
    padding: 18,
    overflow: 'hidden',
  },
  resModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 12,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resModalHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resModalScroll: {
    maxHeight: 560,
  },
  resModalColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  resModalCol: {
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  resSectionCard: {
    backgroundColor: '#FAF9F6',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E5E1DA',
    padding: 12,
  },
  resSectionHeading: {
    fontSize: 11,
    fontWeight: '900',
    color: BRAND,
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  timeGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  timeSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeSlotBtnActive: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  timeSlotBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  timeSlotBtnTextActive: {
    color: '#F3D179',
    fontWeight: '900',
  },
  quickLinkText: { fontSize: 11, fontWeight: '800', color: GROUP_ACCENT },
  mealBadgeInline: {
    fontSize: 10.5,
    fontWeight: '900',
    color: GROUP_ACCENT,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scheduleTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scheduleTriggerBtnActive: {
    borderColor: BRAND,
    backgroundColor: '#FFFDF8',
  },
  scheduleTriggerIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FAF5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleTriggerValue: { fontSize: 13.5, fontWeight: '900', color: '#0F172A' },
  scheduleTriggerSub: { fontSize: 10.5, color: '#64748B', fontWeight: '600' },
  calendarBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DDD6CA',
    padding: 12,
    marginTop: 2,
    gap: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FAF7F2',
    borderWidth: 1,
    borderColor: '#E5E1DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: { fontSize: 14, fontWeight: '900', color: BRAND },
  calWeekRow: { flexDirection: 'row' },
  calWeekLabel: {
    width: '14.285%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    paddingVertical: 3,
  },
  calDaysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDayCell: {
    width: '14.285%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    position: 'relative',
  },
  calDayCellToday: {
    borderWidth: 1.5,
    borderColor: GOLD,
    backgroundColor: '#FFFBEB',
  },
  calDayCellSelected: {
    backgroundColor: BRAND,
  },
  calDayText: { fontSize: 12.5, fontWeight: '700', color: '#1E293B' },
  calDayTextSelected: { color: '#F3D179', fontWeight: '900' },
  calEventDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: GROUP_ACCENT,
  },
  calFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  calQuickChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  calQuickChipText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  timePickerBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    padding: 12,
    marginTop: 2,
    gap: 10,
  },
  mealTabsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mealTabBtn: {
    flex: 1,
    minWidth: 85,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  mealTabBtnActive: {
    backgroundColor: BRAND,
    borderColor: BRAND,
  },
  mealTabTitle: { fontSize: 11.5, fontWeight: '900', color: '#1E293B' },
  mealTabSub: { fontSize: 9.5, fontWeight: '600', color: '#64748B' },
  customDialBox: {
    backgroundColor: '#FAF9F6',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E1DA',
  },
  dialRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  dialCol: { flex: 1, minWidth: 92, gap: 5 },
  dialLabel: { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 0.5 },
  dialStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  dialStepBtn: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  dialValue: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  dialMinChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  dialMinChipActive: { backgroundColor: BRAND, borderColor: BRAND },
  dialMinText: { fontSize: 11.5, fontWeight: '800', color: '#334155' },
  modalFloorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E1DA',
  },
  resFooterSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 1,
  },
  resFooterSummaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4C1D95',
  },
  modeSwitchRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  modeSwitchBtn: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modeSwitchBtnActiveGroup: { backgroundColor: GROUP_ACCENT, borderColor: GROUP_ACCENT },
  modeSwitchBtnActiveRegular: { backgroundColor: BRAND, borderColor: BRAND },
  modeSwitchText: { fontSize: 12.5, fontWeight: '800', color: '#334155' },

  modalFloorCard: {
    flexGrow: 1,
    minWidth: 128,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 2,
  },
  modalFloorCardTitle: { fontSize: 13.5, fontWeight: '900', color: '#1E293B' },
  modalFloorCardSub: { fontSize: 11.5, color: '#64748B', fontWeight: '600' },

  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    backgroundColor: '#FAF5FF',
  },
  presetPillText: { fontSize: 12, fontWeight: '800', color: GROUP_ACCENT },

  autoArrangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GROUP_ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
  },
  autoArrangeBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  fullFloorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
  },
  fullFloorBtnText: { color: BRAND, fontSize: 12.5, fontWeight: '800' },

  sectionLabel: { fontSize: 11.5, fontWeight: '900', color: '#64748B', letterSpacing: 0.8, marginBottom: 8, marginTop: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, marginBottom: 12, backgroundColor: '#FCFBF9' },
  formRow: { flexDirection: 'row', gap: 12 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  warnText: { color: '#DC2626', fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, marginBottom: 12, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  stepBtn: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: '#F8FAFC' },
  stepInput: { flex: 1, minWidth: 0, width: 40, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0F172A', paddingVertical: 8 },

  pickCard: {
    minWidth: 104,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 9,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  pickCheck: { position: 'absolute', top: 4, right: 4, width: 15, height: 15, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pickName: { fontSize: 13.5, fontWeight: '900', color: '#0F172A', paddingHorizontal: 10 },
  pickSub: { fontSize: 11.5, color: '#64748B', marginTop: 2, fontWeight: '700' },
  mergeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  capacityBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  capacityTitle: { fontSize: 14, fontWeight: '900' },
  capacitySub: { fontSize: 12.5, color: '#334155', marginTop: 2 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4 },

  // Directory Tab Styles
  floorCardContainer: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E1DA', padding: 16, gap: 14 },
  floorBannerNotice: {
    backgroundColor: '#24050A',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  floorBannerIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(212, 175, 55, 0.2)', alignItems: 'center', justifyContent: 'center' },
  floorBannerTitle: { fontSize: 14.5, fontWeight: '800', color: '#F3D179' },
  floorBannerSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.78)', marginTop: 2, maxWidth: 520 },
  floorBannerBtn: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  floorBannerBtnText: { fontSize: 12.5, fontWeight: '800', color: '#1E293B' },
  floorCardHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  floorHeaderBadge: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  floorCardName: { fontSize: 18, fontWeight: '900', color: BRAND },
  floorCardBlurb: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  floorHeaderStats: { alignItems: 'flex-end', gap: 5 },
  floorTotalCount: { fontSize: 13, fontWeight: '800', color: '#1E293B' },
  floorEditMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
  },
  floorEditMiniBtnText: { fontSize: 12, fontWeight: '800', color: BRAND },

  floorZonesGrid: { gap: 10 },
  floorZoneBox: { backgroundColor: '#FCFBF9', borderRadius: 14, borderWidth: 1.5, padding: 12, gap: 10 },
  majlisFloorZoneBox: { backgroundColor: '#FFFAF7', borderColor: '#4a121a40' },
  floorZoneBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniIconBubble: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  floorZoneTitle: { fontSize: 14, fontWeight: '900' },
  floorZoneSub: { fontSize: 12.5, color: '#64748B', fontWeight: '600' },
  tinyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  tinyAddBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  unitPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unitPillName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  unitPillSeats: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  noUnitsText: { fontSize: 12.5, color: '#94A3B8', fontStyle: 'italic', paddingVertical: 4 },

  cabinDetailedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a121a30',
    minWidth: 160,
  },
  cabinDetailedName: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  cabinDetailedCapacity: { fontSize: 12, color: '#4a121a', fontWeight: '700' },
  statusMiniDot: { width: 8, height: 8, borderRadius: 4 },

  seatingTypePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  seatingTypeChoiceCard: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#FCFBF9',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  seatingTypeChoiceTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  seatingTypeChoiceSub: { fontSize: 11.5, color: '#64748B' },
});
