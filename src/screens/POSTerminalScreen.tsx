import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FullscreenButton from '../components/FullscreenButton';
import InvoiceComponent, { printInvoiceReceipt } from '../components/Invoice';
import PermissionDeniedScreen from '../components/PermissionDeniedScreen';
import SeatingTypeIcon from '../components/SeatingTypeIcon';
import SultanLogo from '../components/SultanLogo';
import { TouchNumericKeypad } from '../components/TouchNumericKeypad';
import {
  FLOOR_ORDER,
  getTableFloor,
  getTableSeatingType,
  SeatingZoneType,
  sortFloors,
} from '../constants/floors';
import {
  CustomerDisplayState,
  INITIAL_CFD_STATE,
  publishCustomerDisplayState,
  subscribeToCustomerDisplay,
} from '../services/customerDisplaySync';
import { broadcastImmediately } from '../services/syncService';
import {
  EventDiscount,
  Invoice,
  MenuItem,
  OrderItem,
  Payment,
  useAuthStore,
  useDiscountStore,
  useRestaurantStore,
} from '../store';
import { useOpsStore } from '../store/opsStore';
import { useRolePermissions, type RolePermissions } from '../store/roleStore';
import { useSettingsStore } from '../store/settingsStore';
import { useShiftStore } from '../store/shiftStore';
import { calculateOrderDiscount } from '../utils/discountCalculator';
import { resolveMenuImageUri } from '../utils/menuImage';
import { findTableReservation, getReservationTableCount, isGroupReservation } from '../utils/reservationHelpers';

function createInvoicePayload(data: Omit<Invoice, 'id' | 'timePlaced' | 'timeSettled'>): Invoice {
  const now = Date.now();
  return {
    ...data,
    id: `INV-${Math.floor(Math.random() * 90000) + 10000}`,
    timePlaced: now,
    timeSettled: now,
  };
}

function getCategoryIcon(catName: string): keyof typeof Ionicons.glyphMap {
  const c = (catName || '').toLowerCase().trim();
  if (c === 'all') return 'apps';
  if (c.includes('appetizer') || c.includes('starter') || c.includes('snack') || c.includes('fries')) return 'fast-food-outline';
  if (c.includes('main') || c.includes('karahi') || c.includes('handi') || c.includes('curry')) return 'flame-outline';
  if (c.includes('bbq') || c.includes('grill') || c.includes('kebab') || c.includes('tikka')) return 'bonfire-outline';
  if (c.includes('dessert') || c.includes('sweet') || c.includes('kunafa') || c.includes('ice') || c.includes('bakery')) return 'ice-cream-outline';
  if (c.includes('drink') || c.includes('beverage') || c.includes('juice') || c.includes('shake') || c.includes('tea') || c.includes('mocktail') || c.includes('coffee')) return 'wine-outline';
  if (c.includes('deal') || c.includes('combo') || c.includes('special') || c.includes('platter')) return 'pricetags-outline';
  if (c.includes('rice') || c.includes('biryani') || c.includes('pulao') || c.includes('mandi')) return 'restaurant-outline';
  if (c.includes('bread') || c.includes('naan') || c.includes('roti')) return 'nutrition-outline';
  if (c.includes('burger') || c.includes('sandwich') || c.includes('wrap')) return 'fast-food-outline';
  if (c.includes('pizza') || c.includes('pasta')) return 'pizza-outline';
  if (c.includes('fish') || c.includes('seafood') || c.includes('prawn')) return 'fish-outline';
  if (c.includes('salad') || c.includes('soup')) return 'leaf-outline';
  return 'restaurant-outline';
}

const CATEGORY_COLOR_PALETTE = [
  { primary: '#059669', softBg: '#ECFDF5', iconBg: '#D1FAE5', border: '#A7F3D0' }, // Emerald
  { primary: '#D97706', softBg: '#FFFBEB', iconBg: '#FEF3C7', border: '#FDE68A' }, // Amber
  { primary: '#0284C7', softBg: '#F0F9FF', iconBg: '#E0F2FE', border: '#BAE6FD' }, // Sky Blue
  { primary: '#E11D48', softBg: '#FFF1F2', iconBg: '#FFE4E6', border: '#FECDD3' }, // Rose
  { primary: '#7C3AED', softBg: '#F5F3FF', iconBg: '#EDE9FE', border: '#DDD6FE' }, // Purple
  { primary: '#EA580C', softBg: '#FFF7ED', iconBg: '#FFEDD5', border: '#FED7AA' }, // Orange
  { primary: '#0D9488', softBg: '#F0FDFA', iconBg: '#CCFBF1', border: '#99F6E4' }, // Teal
  { primary: '#4F46E5', softBg: '#EEF2FF', iconBg: '#E0E7FF', border: '#C7D2FE' }, // Indigo
  { primary: '#DC2626', softBg: '#FEF2F2', iconBg: '#FEE2E2', border: '#FECACA' }, // Red
  { primary: '#9333EA', softBg: '#FAF5FF', iconBg: '#F3E8FF', border: '#E9D5FF' }, // Violet
];

function getCategoryTheme(catName: string, index: number) {
  const c = (catName || '').toLowerCase();
  if (c.includes('karahi') || c.includes('bbq') || c.includes('main')) return CATEGORY_COLOR_PALETTE[8];
  if (c.includes('salad') || c.includes('green') || c.includes('soup')) return CATEGORY_COLOR_PALETTE[0];
  if (c.includes('mocktail') || c.includes('beverage') || c.includes('drink') || c.includes('juice')) return CATEGORY_COLOR_PALETTE[2];
  if (c.includes('bakery') || c.includes('dessert') || c.includes('sweet')) return CATEGORY_COLOR_PALETTE[3];
  if (c.includes('pizza') || c.includes('burger') || c.includes('appetizer')) return CATEGORY_COLOR_PALETTE[5];
  if (c.includes('continental') || c.includes('steak')) return CATEGORY_COLOR_PALETTE[4];
  if (c.includes('chinese') || c.includes('rice')) return CATEGORY_COLOR_PALETTE[1];
  return CATEGORY_COLOR_PALETTE[index % CATEGORY_COLOR_PALETTE.length];
}

function getDefaultItemPrepMins(name?: string, category?: string, explicitPrep?: number): number {
  if (typeof explicitPrep === 'number' && explicitPrep > 0) return explicitPrep;
  const text = `${name || ''} ${category || ''}`.toLowerCase();
  if (text.includes('drink') || text.includes('beverage') || text.includes('mocktail') || text.includes('shake') || text.includes('coffee') || text.includes('salad')) return 8;
  if (text.includes('soup') || text.includes('appetizer') || text.includes('fries') || text.includes('bakery') || text.includes('dessert')) return 12;
  if (text.includes('chinese') || text.includes('burger') || text.includes('sandwich') || text.includes('pasta')) return 16;
  if (text.includes('pizza') || text.includes('continental') || text.includes('steak') || text.includes('fish')) return 20;
  if (text.includes('karahi') || text.includes('handi') || text.includes('bbq') || text.includes('mandi') || text.includes('platter')) return 25;
  return 15;
}

function formatCountdownMMSS(totalSeconds: number): string {
  const safeSecs = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function estimateOrderPrepTime(
  items: { id?: string; name?: string; qty?: number; prepTimeMin?: number; category?: string }[],
  menuCatalog: MenuItem[],
  timePlaced?: number,
  nowMs: number = Date.now()
) {
  if (!items || items.length === 0) {
    return {
      totalPrepMins: 0,
      totalPrepSeconds: 0,
      elapsedMins: 0,
      elapsedSeconds: 0,
      remainingMins: 0,
      remainingSeconds: 0,
      countdownText: '00:00',
      elapsedText: '00:00',
      progressPct: 0,
      itemBreakdowns: [] as { name: string; qty: number; prepMins: number; remainingSecs: number; countdown: string }[],
    };
  }
  let maxPrep = 0;
  let totalPortions = 0;
  const elapsedSeconds = timePlaced ? Math.max(0, Math.floor((nowMs - timePlaced) / 1000)) : 0;

  const itemBreakdowns = items.map((it) => {
    const baseId = (it.id || '').split('-')[0];
    const catalogMatch = menuCatalog.find((m) => m.id === it.id || m.id === baseId || m.name === it.name);
    const prepMins = getDefaultItemPrepMins(
      it.name,
      it.category || catalogMatch?.category,
      it.prepTimeMin ?? catalogMatch?.prepTimeMin
    );
    const qty = Number(it.qty) || 1;
    totalPortions += qty;
    if (prepMins > maxPrep) maxPrep = prepMins;
    const itemTotalSecs = prepMins * 60;
    const itemRemSecs = Math.max(0, itemTotalSecs - elapsedSeconds);
    return {
      name: it.name || 'Dish',
      qty,
      prepMins,
      remainingSecs: itemRemSecs,
      countdown: formatCountdownMMSS(itemRemSecs),
    };
  });

  // Parallel kitchen stations: longest dish + 2 mins buffer per extra portion beyond first (max +12 mins buffer)
  const extraBuffer = Math.min(12, Math.max(0, totalPortions - 1) * 2);
  const totalPrepMins = maxPrep + extraBuffer;
  const totalPrepSeconds = totalPrepMins * 60;
  const remainingSeconds = Math.max(0, totalPrepSeconds - elapsedSeconds);
  const elapsedMins = Math.floor(elapsedSeconds / 60);
  const remainingMins = Math.ceil(remainingSeconds / 60);
  const progressPct =
    totalPrepSeconds > 0 ? Math.min(100, Math.round((elapsedSeconds / totalPrepSeconds) * 100)) : 0;

  return {
    totalPrepMins,
    totalPrepSeconds,
    elapsedMins,
    elapsedSeconds,
    remainingMins,
    remainingSeconds,
    countdownText: formatCountdownMMSS(remainingSeconds),
    elapsedText: formatCountdownMMSS(elapsedSeconds),
    progressPct,
    itemBreakdowns,
  };
}

interface POSTerminalScreenProps {
  role?: 'admin' | 'manager' | 'floor_manager';
  backRoute?: string;
  shiftRoute?: string;
}

export default function POSTerminalScreen({
  role = 'admin',
  backRoute = '/admin/dashboard',
  shiftRoute = '/admin/shift',
}: POSTerminalScreenProps) {
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const prefillTableId = (searchParams.prefillTableId || searchParams.tableId) as string | undefined;
  const prefillCustomerId = searchParams.prefillCustomerId as string | undefined;
  const prefillCustomerPhone = searchParams.prefillCustomerPhone as string | undefined;
  const prefillCustomerName = searchParams.prefillCustomerName as string | undefined;
  const prefillCustomerAddress = searchParams.prefillCustomerAddress as string | undefined;
  const paramOrderType = searchParams.orderType as string | undefined;

  const { width, height } = useWindowDimensions();
  const isLandscape = (width > height && width >= 700) || width >= 1000;
  const isTablet = width >= 700 && width < 1120;
  const isMobile = width < 700;
  const numCols = isLandscape
    ? (width >= 1120 ? 4 : 3)
    : (width < 500 ? 2 : 3);

  const [mobileTab, setMobileTab] = useState<'menu' | 'cart' | 'running'>('menu');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [pendingOrderSearchQuery, setPendingOrderSearchQuery] = useState('');

  const user = useAuthStore((state) => state.user);
  const { can, roleName, permissions } = useRolePermissions();

  const requirePosPerm = (permKey: keyof RolePermissions, actionLabel: string): boolean => {
    if (role === 'admin' || can(permKey)) return true;
    const msg = `Permission Restricted: Your account (${user?.name || roleName}) is not authorized to ${actionLabel}. Please contact Admin in System Settings.`;
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Permission Restricted', msg);
    return false;
  };

  const isOrderTakerRole = useMemo(() => {
    const userRole = (user?.role || '').toLowerCase();
    const posRole = (role || '').toString().toLowerCase();
    const customRole = (user?.customRoleId || '').toLowerCase();
    return (
      userRole === 'waiter' ||
      userRole === 'order_taker' ||
      userRole === 'ordertaker' ||
      posRole === 'waiter' ||
      posRole === 'order_taker' ||
      customRole === 'role-waiter' ||
      customRole === 'role-order-taker'
    );
  }, [user?.role, user?.customRoleId, role]);

  const isCashierOrManagement = useMemo(() => {
    if (isOrderTakerRole) return false;
    const userRole = (user?.role || '').toLowerCase();
    const posRole = (role || '').toString().toLowerCase();
    const customRole = (user?.customRoleId || '').toLowerCase();
    if (posRole === 'admin' || posRole === 'manager' || posRole === 'floor_manager') return true;
    if (userRole === 'admin' || userRole === 'manager' || userRole === 'cashier' || userRole.includes('floor')) return true;
    if (customRole === 'role-admin' || customRole === 'role-manager' || customRole === 'role-cashier' || customRole.includes('floor')) return true;
    return can('canAccessPOS') || can('canAccessInvoices');
  }, [isOrderTakerRole, user?.role, user?.customRoleId, role, can]);

  const [orderTakerMode, setOrderTakerMode] = useState<boolean>(false);
  const hidePrices = isOrderTakerRole ? true : isCashierOrManagement ? orderTakerMode : true;

  // Stores
  const menuItems = useRestaurantStore((state) => state.menuItems) || [];
  const regions = useRestaurantStore((state) => state.regions) || [];
  const customers = useRestaurantStore((state) => state.customers) || [];
  const tables = useRestaurantStore((state) => state.tables) || [];
  const reservations = useRestaurantStore((state) => state.reservations) || [];
  const seatReservation = useRestaurantStore((state) => state.seatReservation);
  const dynamicFloors = useRestaurantStore((state) => state.floors) || [];
  const addCustomer = useRestaurantStore((state) => state.addCustomer);
  const updateCustomer = useRestaurantStore((state) => state.updateCustomer);
  const saveInvoice = useRestaurantStore((state) => state.saveInvoice);
  const placeOrder = useRestaurantStore((state) => state.placeOrder);
  const settleBill = useRestaurantStore((state) => state.settleBill);
  const markTableBilled = useRestaurantStore((state) => state.markTableBilled);
  const dismissTicket = useRestaurantStore((state) => state.dismissTicket);
  const clearTableTickets = useRestaurantStore((state) => state.clearTableTickets);
  const clearAllOldTickets = useRestaurantStore((state) => state.clearAllOldTickets);
  const logCancelledPunchedItems = useRestaurantStore((state) => state.logCancelledPunchedItems);
  const tickets = useRestaurantStore((state) => state.tickets) || [];
  const activeRunningTickets = useMemo(
    () => tickets.filter((t) => t && t.status !== 'served'),
    [tickets]
  );
  const invoices = useRestaurantStore((state) => state.invoices) || [];

  const systemSettings = useSettingsStore((s) => s.settings);
  const shifts = useShiftStore((state) => state.shifts);
  const activeShiftId = useShiftStore((state) => state.activeShiftId);
  const activeShift = shifts.find((s) => s.id === activeShiftId && s.status === 'open');
  const soldOutIds = useOpsStore((state) => state.unavailableItemIds);

  // Catalog Filters
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [variantModalItem, setVariantModalItem] = useState<MenuItem | null>(null);

  // Cart & Order Context
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [editingNoteItem, setEditingNoteItem] = useState<OrderItem | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [variantNoteDraft, setVariantNoteDraft] = useState('');
  const [cancelOrderModal, setCancelOrderModal] = useState<{
    mode: 'ticket' | 'table' | 'all';
    ticketId?: string;
    tableId?: string;
    title: string;
    subtitle: string;
    items: OrderItem[];
    totalAmount: number;
  } | null>(null);
  const [cancelReasonDraft, setCancelReasonDraft] = useState('');

  const CANCEL_REASON_PRESETS = [
    'Customer Changed Mind',
    'Wrong Item Punched',
    'Duplicate KOT',
    'Item Out of Stock',
    'Guest Left Early',
    'Kitchen Delay',
  ];

  const ITEM_NOTE_PRESETS = [
    'Less Spicy',
    'Medium Spicy',
    'Extra Spicy',
    'No Onion',
    'No Garlic',
    'Less Oil',
    'Well Done',
    'Extra Sauce',
    'No Mayo',
    'Cheese on Top',
    'Less Sugar',
    'Less Ice',
    'No Ice',
    'Room Temp',
    'Pack Separately',
  ];

  const ORDER_NOTE_PRESETS = [
    'Serve Starters First',
    'Serve All Together',
    'Medium Spicy Overall',
    'Less Spicy Overall',
    'Family / Kids Table',
    'VIP Guest Priority',
    'Pack Leftovers',
    'Extra Cutlery & Napkins',
  ];

  const toggleCommaNoteToken = (current: string, token: string): string => {
    const parts = current
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const exists = parts.some((p) => p.toLowerCase() === token.toLowerCase());
    if (exists) {
      return parts.filter((p) => p.toLowerCase() !== token.toLowerCase()).join(', ');
    }
    return [...parts, token].join(', ');
  };

  const hasCommaNoteToken = (current: string, token: string): boolean =>
    current
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .includes(token.toLowerCase());

  const openItemNoteModal = (item: OrderItem) => {
    setEditingNoteItem(item);
    setNoteDraft(item.notes || '');
  };

  const saveItemNote = () => {
    if (!editingNoteItem) return;
    const clean = noteDraft.trim() || undefined;
    setCart((prev) => prev.map((i) => (i.id === editingNoteItem.id ? { ...i, notes: clean } : i)));
    setEditingNoteItem(null);
    setNoteDraft('');
  };

  // Fast O(1) in-cart lookup map to eliminate scroll lag
  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cart) {
      const baseId = c.id.includes('-') ? c.id.split('-')[0] : c.id;
      map[baseId] = (map[baseId] || 0) + c.qty;
      map[c.id] = (map[c.id] || 0) + c.qty;
    }
    return map;
  }, [cart]);
  const [loadedCart, setLoadedCart] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<'takeaway' | 'dine-in' | 'delivery'>('takeaway');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedServer, setSelectedServer] = useState<string>('');

  // Modals
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [pendingOrdersModalVisible, setPendingOrdersModalVisible] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    // Only tick frequently when running tickets view/modal is active to avoid 1-second render thrashing during billing
    const intervalMs = (mobileTab === 'running' || pendingOrdersModalVisible) ? 1000 : 15000;
    const timer = setInterval(() => setNowTick(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [mobileTab, pendingOrdersModalVisible]);
  const [kdsModalFilter, setKdsModalFilter] = useState<'all' | 'pending' | 'cooking' | 'ready' | 'takeaway' | 'dine-in' | 'delivery'>('all');
  const [kdsStatusToast, setKdsStatusToast] = useState<string | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [customDiscountInput, setCustomDiscountInput] = useState('');

  // Customer Creation Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [isCreatingNewCustomer, setIsCreatingNewCustomer] = useState(false);

  // Discounts & Payments
  const campaigns = useDiscountStore((state) => state.campaigns) || [];
  const [selectedEventCampaign, setSelectedEventCampaign] = useState<EventDiscount | null>(null);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [payments, setPayments] = useState<Payment[]>([{ type: 'cash', amount: 0 }]);
  const [activePaymentIndex, setActivePaymentIndex] = useState<number>(0);

  // Table Modal Filters
  const [tableModalFloor, setTableModalFloor] = useState<string>('All');
  const [tableModalSeatingType, setTableModalSeatingType] = useState<'all' | SeatingZoneType>('all');
  const [tableModalStatus, setTableModalStatus] = useState<'all' | 'available' | 'occupied' | 'reserved'>('all');

  const [generatedInvoice, setGeneratedInvoice] = useState<any>(null);
  const [tableDecisionModal, setTableDecisionModal] = useState<{ tableId: string; tableName: string; invoice: any } | null>(null);
  const [loadedTicketId, setLoadedTicketId] = useState<string | null>(null);
  const [shortcutsModalVisible, setShortcutsModalVisible] = useState(false);
  const [recentInvoicesModalVisible, setRecentInvoicesModalVisible] = useState(false);

  const searchInputRef = useRef<any>(null);
  const prefilledRef = useRef<string | null>(null);
  const prefilledCustRef = useRef<string | null>(null);

  const availableFloors = useMemo(() => {
    const configured = (dynamicFloors || []).map((f) => f.name.trim()).filter(Boolean);
    if (configured.length > 0) {
      const extraWithTables = Array.from(
        new Set(
          tables
            .map((t) => getTableFloor(t).trim())
            .filter((fl) => fl && !configured.some((c) => c.toLowerCase() === fl.toLowerCase()))
        )
      );
      return [...configured, ...extraWithTables];
    }
    const discovered = Array.from(new Set(tables.map((t) => getTableFloor(t)).filter(Boolean)));
    return sortFloors(discovered.length > 0 ? discovered : FLOOR_ORDER);
  }, [dynamicFloors, tables]);

  const filteredModalTables = useMemo(() => {
    return tables.filter((t) => {
      const tFloor = getTableFloor(t);
      if (tableModalFloor !== 'All' && tFloor.toLowerCase() !== tableModalFloor.toLowerCase()) return false;
      const tType = getTableSeatingType(t);
      if (tType === 'majlis' && systemSettings.enableMajlisSeating === false) return false;
      if (tType === 'couches' && systemSettings.enableCouchSeating === false) return false;
      if (tableModalSeatingType !== 'all' && tType !== tableModalSeatingType) return false;
      if (tableModalStatus !== 'all') {
        if (tableModalStatus === 'available' && t.status !== 'available') return false;
        if (tableModalStatus === 'occupied' && t.status !== 'occupied' && t.status !== 'billed') return false;
        if (tableModalStatus === 'reserved' && t.status !== 'reserved') return false;
      }
      if (tableSearchQuery.trim()) {
        const q = tableSearchQuery.toLowerCase().trim();
        const res = findTableReservation(t, reservations);
        const matchesName = t.name.toLowerCase().includes(q);
        const matchesFloor = tFloor.toLowerCase().includes(q);
        const matchesServer = Boolean(t.server && t.server.toLowerCase().includes(q));
        const matchesGuest = Boolean(res?.customerName?.toLowerCase().includes(q));
        const matchesOccasion = Boolean(res?.occasion?.toLowerCase().includes(q));
        if (!matchesName && !matchesFloor && !matchesServer && !matchesGuest && !matchesOccasion) return false;
      }
      return true;
    });
  }, [tables, reservations, tableModalFloor, tableModalSeatingType, tableModalStatus, tableSearchQuery, systemSettings.enableMajlisSeating, systemSettings.enableCouchSeating]);

  const recent8Invoices = useMemo(() => {
    return [...invoices]
      .filter((inv) => inv && inv.id && inv.status !== 'voided')
      .sort((a, b) => (b.timeSettled || b.timePlaced || 0) - (a.timeSettled || a.timePlaced || 0))
      .slice(0, 8);
  }, [invoices]);

  // Select Table & Load Running Orders
  const handleTableSelect = (tId: string) => {
    setSelectedTableId(tId);
    setOrderType('dine-in');
    setTableModalVisible(false);

    const targetTable = tables.find((t) => t.id === tId || t.name.toLowerCase() === tId.toLowerCase());
    const tableTickets = tickets.filter(
      (t) =>
        t.tableId === tId ||
        (targetTable &&
          (t.tableId === targetTable.id || t.tableName?.trim().toLowerCase() === targetTable.name.trim().toLowerCase()))
    );
    let combinedItems: OrderItem[] = [];

    if (tableTickets.length > 0) {
      tableTickets.forEach((ticket) => {
        ticket.items.forEach((ti) => {
          const existing = combinedItems.find((i) => i.id === ti.id && i.name === ti.name);
          if (existing) {
            existing.qty += ti.qty;
          } else {
            combinedItems.push({ ...ti });
          }
        });
      });
    }
    if (targetTable && targetTable.orders && targetTable.orders.length > 0) {
      if (combinedItems.length === 0) {
        combinedItems = targetTable.orders.map((o) => ({ ...o }));
      } else {
        targetTable.orders.forEach((to) => {
          const existing = combinedItems.find((i) => i.id === to.id || i.name === to.name);
          if (!existing) {
            combinedItems.push({ ...to });
          }
        });
      }
    }

    const foundWaiter =
      targetTable?.server || tableTickets.find((t) => t.server && !t.server.toLowerCase().includes('pos'))?.server;
    setSelectedServer(foundWaiter || '');

    if (combinedItems.length > 0) {
      setCart(combinedItems);
      setLoadedCart(JSON.parse(JSON.stringify(combinedItems)));
      setMobileTab('cart');
    } else {
      setCart([]);
      setLoadedCart([]);
    }
  };

  const handleClearSelectedTable = () => {
    if (!selectedTableId) return;
    if (!requirePosPerm('posCanReleaseTable', 'release occupied tables without billing')) return;
    const targetTable = tables.find((t) => t.id === selectedTableId);
    const tableTickets = tickets.filter((tk) => tk.tableId === selectedTableId);
    const allItems =
      tableTickets.length > 0
        ? tableTickets.flatMap((tk) => tk.items || [])
        : targetTable?.orders || [];
    const totalAmt = allItems.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 1), 0);

    if (allItems.length === 0 && tableTickets.length === 0) {
      settleBill(selectedTableId);
      setCart([]);
      setLoadedCart([]);
      setSelectedTableId('');
      broadcastImmediately();
      return;
    }

    setCancelReasonDraft('');
    setCancelOrderModal({
      mode: 'table',
      tableId: selectedTableId,
      title: `Cancel & Release ${targetTable ? targetTable.name : 'Table'}`,
      subtitle: `${tableTickets.length || 1} active order(s) • Logged to Daily Cancellation Report`,
      items: allItems,
      totalAmount: totalAmt,
    });
  };

  useEffect(() => {
    if (prefillTableId && typeof prefillTableId === 'string' && prefilledRef.current !== prefillTableId) {
      prefilledRef.current = prefillTableId;
      setOrderType('dine-in');
      handleTableSelect(prefillTableId);
    }
  }, [prefillTableId]);

  useEffect(() => {
    const custKey = (prefillCustomerId || prefillCustomerPhone) as string | undefined;
    if (custKey && prefilledCustRef.current !== custKey) {
      prefilledCustRef.current = custKey;
      if (prefillCustomerId && typeof prefillCustomerId === 'string') {
        setSelectedCustomerId(prefillCustomerId);
      }
      setSelectedTableId('');
      setOrderType(paramOrderType === 'takeaway' || paramOrderType === 'delivery' ? paramOrderType : 'delivery');
      if (prefillCustomerName && typeof prefillCustomerName === 'string') setCustomerName(prefillCustomerName);
      if (prefillCustomerPhone && typeof prefillCustomerPhone === 'string') setCustomerPhone(prefillCustomerPhone);
      if (prefillCustomerAddress && typeof prefillCustomerAddress === 'string') setCustomerAddress(prefillCustomerAddress);
    }
  }, [prefillCustomerId, prefillCustomerPhone, prefillCustomerName, prefillCustomerAddress, paramOrderType]);

  // Categories
  const categoryList = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((m) => {
      if (m.category && m.category !== 'All' && m.category !== 'ALL') {
        set.add(m.category);
      }
    });
    let list = Array.from(set);
    if (systemSettings.posShowDealsTab === false) {
      list = list.filter((c) => !c.toLowerCase().includes('deal'));
    }
    if (categorySearchQuery.trim()) {
      const q = categorySearchQuery.toLowerCase().trim();
      list = list.filter((c) => c.toLowerCase().includes(q));
    }
    return list;
  }, [menuItems, systemSettings.posShowDealsTab, categorySearchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: menuItems.length };
    menuItems.forEach((m) => {
      if (m.category) {
        const key = m.category.trim();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.region && item.region.toLowerCase().includes(q));
      if (!matchesSearch) return false;

      if (activeRegion !== 'ALL') {
        if ((item.region || '').trim().toLowerCase() !== activeRegion.trim().toLowerCase()) return false;
      }

      if (activeCategory === 'ALL' || activeCategory === 'All') return true;
      if (activeCategory === 'Deals & Combos' || activeCategory === 'Deals') {
        return Boolean(item.isDeal || (item.category && item.category.toLowerCase() === 'deals'));
      }
      return (item.category || '').trim().toLowerCase() === activeCategory.trim().toLowerCase();
    });
  }, [menuItems, searchQuery, activeCategory, activeRegion]);

  // Financial Calculations
  useEffect(() => {
    const canTakeaway = systemSettings.enableTakeaway !== false && (role === 'admin' || can('posCanTakeaway'));
    const canDineIn = systemSettings.enableDineIn !== false && (role === 'admin' || can('posCanDineIn'));
    const canDelivery = systemSettings.enableDelivery !== false && (role === 'admin' || can('posCanDelivery'));

    if (orderType === 'takeaway' && !canTakeaway) {
      if (canDineIn) setOrderType('dine-in');
      else if (canDelivery) setOrderType('delivery');
    } else if (orderType === 'dine-in' && !canDineIn) {
      if (canTakeaway) setOrderType('takeaway');
      else if (canDelivery) setOrderType('delivery');
    } else if (orderType === 'delivery' && !canDelivery) {
      if (canTakeaway) setOrderType('takeaway');
      else if (canDineIn) setOrderType('dine-in');
    }
  }, [orderType, systemSettings.enableTakeaway, systemSettings.enableDineIn, systemSettings.enableDelivery, role, permissions]);

  const effectiveTaxRate = systemSettings.taxEnabled ? (systemSettings.taxRatePercent || 0) / 100 : 0;
  const subTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountVal = parseFloat(discountAmount) || 0;
  const afterDiscount = Math.max(0, subTotal - discountVal);
  const serviceCharge = systemSettings.serviceChargeEnabled
    ? afterDiscount * ((systemSettings.serviceChargePercent || 0) / 100)
    : 0;
  const deliveryCharges = orderType === 'delivery' ? (systemSettings.deliveryFeeDefault ?? 150) : 0;
  const tax = afterDiscount * effectiveTaxRate;
  const rawTotal = afterDiscount + tax + serviceCharge + deliveryCharges;
  const total = systemSettings.roundTotals ? Math.round(rawTotal) : rawTotal;

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, total - totalPaid);
  const changeDue = Math.max(0, totalPaid - total);

  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomerId);
  const selectedTableObj = tables.find((t) => t.id === selectedTableId);

  const handleSetFullPayment = () => {
    const exact = Math.round(total);
    setPayments((prev) => [{ type: prev[0]?.type || 'cash', amount: exact }]);
  };

  const handleSetPaymentAmount = (amt: number) => {
    setPayments((prev) => [{ type: prev[0]?.type || 'cash', amount: amt }]);
  };

  const handleCancelRunningOrder = (ticketId: string) => {
    if (!requirePosPerm('posCanDismissTicket', 'cancel or dismiss running kitchen orders')) return;
    const targetTicket = tickets.find((tk) => tk.id === ticketId);
    const items = targetTicket?.items || [];
    const totalAmt = items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 1), 0);
    setPendingOrdersModalVisible(false);
    setCancelReasonDraft('');
    setCancelOrderModal({
      mode: 'ticket',
      ticketId,
      tableId: targetTicket?.tableId,
      title: `Cancel Punched Order #${ticketId}`,
      subtitle: `${targetTicket?.tableName || 'Running Order'} • Server: ${targetTicket?.server || 'Staff'}`,
      items,
      totalAmount: totalAmt,
    });
  };

  const handleClearAllOrphanTickets = () => {
    if (!requirePosPerm('posCanDismissTicket', 'cancel or purge all running kitchen orders')) return;
    const allItems = tickets.flatMap((tk) => tk.items || []);
    const totalAmt = allItems.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 1), 0);
    setPendingOrdersModalVisible(false);
    setCancelReasonDraft('');
    setCancelOrderModal({
      mode: 'all',
      title: `Cancel All ${tickets.length} Running Punched Orders`,
      subtitle: 'All active KOTs will be cancelled and recorded in the Daily Audit Report',
      items: allItems,
      totalAmount: totalAmt,
    });
  };

  const handleConfirmCancelPunchedOrder = () => {
    if (!cancelOrderModal) return;
    const reason = cancelReasonDraft.trim();
    if (!reason) {
      if (Platform.OS === 'web') window.alert('Please enter or select a cancellation reason for the Daily Report.');
      else Alert.alert('Reason Required', 'Please enter or select a cancellation reason for the Daily Report.');
      return;
    }
    const actorName = user?.name || 'POS Staff';
    const actorRole =
      user?.customRoleId === 'role-cashier'
        ? 'Cashier'
        : String(user?.role || role || 'Staff');

    if (cancelOrderModal.mode === 'ticket' && cancelOrderModal.ticketId) {
      dismissTicket(cancelOrderModal.ticketId, {
        reason,
        cancelledBy: actorName,
        cancelledByRole: actorRole,
        source: 'cancel_ticket',
      });
      if (loadedTicketId === cancelOrderModal.ticketId) {
        setLoadedTicketId(null);
        setCart([]);
        setLoadedCart([]);
      }
      showKdsToast(`❌ Cancelled #${cancelOrderModal.ticketId} — logged to Daily Report`);
    } else if (cancelOrderModal.mode === 'table' && cancelOrderModal.tableId) {
      // Log & clear table tickets BEFORE settling so every punched KOT item is captured accurately
      clearTableTickets(cancelOrderModal.tableId, {
        reason,
        cancelledBy: actorName,
        cancelledByRole: actorRole,
        source: 'release_table',
      });
      settleBill(cancelOrderModal.tableId);
      setCart([]);
      setLoadedCart([]);
      setSelectedTableId('');
      showKdsToast(`❌ Cancelled orders & released table — logged to Daily Report`);
    } else if (cancelOrderModal.mode === 'all') {
      clearAllOldTickets({
        reason,
        cancelledBy: actorName,
        cancelledByRole: actorRole,
        source: 'purge_all',
      });
      setLoadedTicketId(null);
      setCart([]);
      setLoadedCart([]);
      setSelectedTableId('');
      showKdsToast(`❌ Cancelled all running orders — logged to Daily Report`);
    }
    broadcastImmediately();
    setCancelOrderModal(null);
    setCancelReasonDraft('');
  };

  // Dual-Screen Customer Display Sync
  const isRecentlyPaidRef = useRef(false);
  const getCurrentCfdState = (): CustomerDisplayState => {
    const hasItems = cart.length > 0;
    return {
      isPosActive: true,
      status: hasItems ? 'active' : 'idle',
      cart: hasItems
        ? cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          qty: item.qty,
          notes: item.notes,
          selectedVariant: (item as any).selectedVariant,
          selectedAddons: (item as any).selectedAddons,
          subtotal: item.price * item.qty,
        }))
        : [],
      itemCount: hasItems ? cart.reduce((s, i) => s + i.qty, 0) : 0,
      subTotal: hasItems ? subTotal : 0,
      discountVal: hasItems ? discountVal : 0,
      tax: hasItems ? tax : 0,
      serviceCharge: hasItems ? serviceCharge : 0,
      deliveryCharges: hasItems ? deliveryCharges : 0,
      total: hasItems ? total : 0,
      tenderedAmount: hasItems ? totalPaid : 0,
      changeDue: hasItems ? changeDue : 0,
      orderType,
      tableName: hasItems ? selectedTableObj?.name : '',
      customerName: hasItems ? selectedCustomerObj?.name : '',
      cashierName: user?.name || 'Cashier',
      lastUpdated: Date.now(),
    };
  };

  useEffect(() => {
    publishCustomerDisplayState(getCurrentCfdState());
    return () => {
      try {
        publishCustomerDisplayState({
          ...getCurrentCfdState(),
          isPosActive: false,
          status: 'idle',
        });
      } catch { }
    };
  }, []);

  useEffect(() => {
    if (cart.length > 0) {
      isRecentlyPaidRef.current = false;
    } else if (isRecentlyPaidRef.current) {
      return;
    }
    const currentState = getCurrentCfdState();
    publishCustomerDisplayState(currentState);
    const unsubscribe = subscribeToCustomerDisplay(() => { }, () => getCurrentCfdState());
    return () => unsubscribe();
  }, [cart, subTotal, discountVal, tax, serviceCharge, deliveryCharges, total, totalPaid, changeDue, orderType, selectedTableObj?.name, selectedCustomerObj?.name, user?.name]);

  const handleOpenCustomerDisplay = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const cfdWindow = window.open(
        '/customer-display',
        'SultanCustomerDisplay',
        'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no'
      );
      if (cfdWindow) cfdWindow.focus();
    } else {
      Alert.alert('Dual Screen Customer Display', 'Open /customer-display in a browser on the customer monitor.');
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (e.key === 'F1' || (e.ctrlKey && (e.key === 'k' || e.key === 'K' || e.key === '/'))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (shortcutsModalVisible) return setShortcutsModalVisible(false);
        if (checkoutModalVisible) return setCheckoutModalVisible(false);
        if (pendingOrdersModalVisible) return setPendingOrdersModalVisible(false);
        if (tableModalVisible) return setTableModalVisible(false);
        if (customerModalVisible) return setCustomerModalVisible(false);
        if (discountModalVisible) return setDiscountModalVisible(false);
        if (variantModalItem) return setVariantModalItem(null);
        if (tableDecisionModal) return setTableDecisionModal(null);
        if (searchQuery) return setSearchQuery('');
        searchInputRef.current?.blur();
        return;
      }
      if (checkoutModalVisible) {
        if (e.key === 'F10' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
          e.preventDefault();
          handleSetFullPayment();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          handleFinalizeOrder();
          return;
        }
      }
      if (isInput && !e.key.startsWith('F')) return;

      if (e.key === 'F2') {
        e.preventDefault();
        handleOrderTypeChange('dine-in');
      } else if (e.key === 'F3') {
        e.preventDefault();
        handleOrderTypeChange('takeaway');
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleOrderTypeChange('delivery');
      } else if (e.key === 'F6' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        setPendingOrdersModalVisible((prev) => !prev);
      } else if (e.key === 'F7' || (e.ctrlKey && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        if (!requirePosPerm('canApplyCustomDiscount', 'apply custom discounts')) return;
        setDiscountModalVisible(true);
      } else if (e.key === 'F8' || (e.ctrlKey && (e.key === 'h' || e.key === 'H'))) {
        e.preventDefault();
        if (cart.length > 0) sendToKitchen();
      } else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (cart.length > 0) openCheckout();
      } else if (e.key === 'F10' || (e.ctrlKey && (e.key === 'i' || e.key === 'I'))) {
        e.preventDefault();
        setRecentInvoicesModalVisible((prev) => !prev);
      } else if (e.key === 'F11' || (!isInput && e.key === '?')) {
        e.preventDefault();
        setShortcutsModalVisible((prev) => !prev);
      } else if (e.key === 'F12' || (e.ctrlKey && e.key === 'Delete')) {
        e.preventDefault();
        if (cart.length > 0) clearCart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Recalculate Event Campaign Discount
  useEffect(() => {
    if (selectedEventCampaign) {
      if (cart.length === 0) {
        setDiscountAmount('0');
        return;
      }
      const cartWithCat = cart.map((ci) => {
        const baseId = ci.id.split('-')[0];
        const mi = menuItems.find((m) => m.id === baseId || m.id === ci.id);
        return {
          id: ci.id,
          name: ci.name,
          price: ci.price,
          qty: ci.qty,
          category: mi?.category || 'Mains',
        };
      });
      const res = calculateOrderDiscount(selectedEventCampaign, cartWithCat, subTotal);
      setDiscountAmount(res.eligible && res.discountAmount > 0 ? res.discountAmount.toString() : '0');
    }
  }, [cart, selectedEventCampaign, subTotal, menuItems]);

  const handleOrderTypeChange = (type: 'takeaway' | 'dine-in' | 'delivery') => {
    if (type === 'dine-in' && !requirePosPerm('posCanDineIn', 'take Dine-In table orders')) return;
    if (type === 'takeaway' && !requirePosPerm('posCanTakeaway', 'process Takeaway counter orders')) return;
    if (type === 'delivery' && !requirePosPerm('posCanDelivery', 'create Delivery orders')) return;
    setOrderType(type);
    if (type === 'dine-in') {
      setSelectedCustomerId('');
      if (!selectedTableId) setTableModalVisible(true);
    } else {
      setSelectedTableId('');
      if (type === 'delivery' && !selectedCustomerId) {
        setCustomerSearchQuery('');
        setIsCreatingNewCustomer(false);
        setCustomerModalVisible(true);
      }
    }
  };

  const isPosItemBlocked = (item: MenuItem) => {
    const isSoldOutFlag = (soldOutIds || []).includes(item.id);
    const isZeroStock = Boolean(item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0);
    if (isZeroStock) return true;
    if (isSoldOutFlag && systemSettings.blockOutOfStockPosOrders) return true;
    return false;
  };

  const addToCart = (item: MenuItem) => {
    if (isPosItemBlocked(item)) {
      const msg = `"${item.name}" is currently Sold Out.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Sold Out', msg);
      return;
    }
    if (item.variants && item.variants.length > 0) {
      setVariantModalItem(item);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          price: item.price,
          qty: 1,
          completed: false,
          station: item.station || 'main',
        },
      ];
    });
  };

  const handleVariantSelect = (variant: { name: string; price: number }) => {
    if (!variantModalItem) return;
    const variantId = `${variantModalItem.id}-${variant.name}`;
    const variantName = `${variantModalItem.name} (${variant.name})`;
    const cleanNote = variantNoteDraft.trim() || undefined;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === variantId);
      if (existing) {
        const mergedNote = cleanNote
          ? Array.from(new Set([existing.notes, cleanNote].filter(Boolean))).join(', ')
          : existing.notes;
        return prev.map((i) => (i.id === variantId ? { ...i, qty: i.qty + 1, notes: mergedNote } : i));
      }
      return [
        ...prev,
        {
          id: variantId,
          name: variantName,
          price: variant.price,
          qty: 1,
          notes: cleanNote,
          completed: false,
          station: variantModalItem.station || 'main',
        },
      ];
    });
    setVariantNoteDraft('');
    setVariantModalItem(null);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));

  const clearCart = () => {
    setCart([]);
    setLoadedCart([]);
    setOrderNotes('');
    setSelectedCustomerId('');
    setSelectedTableId('');
    setSelectedEventCampaign(null);
    setDiscountAmount('0');
  };

  const handleSaveNewCustomer = () => {
    if (!requirePosPerm('posCanManageCustomers', 'register or edit customer profiles')) return;
    if (!customerName || !customerPhone) {
      if (Platform.OS === 'web') window.alert('Name and Phone required');
      else Alert.alert('Error', 'Name and Phone required');
      return;
    }
    const existing = customers.find((c) => c.phone === customerPhone);
    if (existing) {
      updateCustomer(existing.id, { name: customerName, address: customerAddress });
      setSelectedCustomerId(existing.id);
    } else {
      addCustomer({ name: customerName, phone: customerPhone, address: customerAddress });
    }
    setIsCreatingNewCustomer(false);
  };

  const showKdsToast = (msg: string) => {
    setKdsStatusToast(msg);
    setTimeout(() => {
      setKdsStatusToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handlePrintPendingSlipForTicket = (ticket: typeof tickets[0]) => {
    if (!requirePosPerm('posCanPrintUnpaidBill', 'print pending order slips')) return;
    const isTable = ticket.tableId && ticket.tableId !== 'takeaway' && ticket.tableId !== 'delivery';
    const targetTable = isTable ? tables.find((tbl) => tbl.id === ticket.tableId) : null;
    const targetTableName = targetTable
      ? targetTable.name
      : ticket.tableName || (ticket.tableId ? ticket.tableId.toUpperCase() : 'TAKEAWAY');
    const derivedOrderType: 'dine-in' | 'takeaway' | 'delivery' = isTable
      ? 'dine-in'
      : ticket.tableId?.toLowerCase() === 'delivery'
        ? 'delivery'
        : 'takeaway';

    const ticketSub = (ticket.items || []).reduce((sum, it) => sum + it.price * it.qty, 0);
    const ticketTax = ticketSub * effectiveTaxRate;
    const ticketService =
      derivedOrderType === 'dine-in' && systemSettings.serviceChargeEnabled
        ? ticketSub * ((systemSettings.serviceChargePercent || 0) / 100)
        : 0;
    const rawTicketTotal = ticketSub + ticketTax + ticketService;
    const ticketTotal = systemSettings.roundTotals ? Math.round(rawTicketTotal) : rawTicketTotal;

    const pendingInvoice: Invoice = {
      id: `PND-${ticket.id.replace(/^KOT-/, '')}`,
      orderType: derivedOrderType,
      tableId: isTable ? ticket.tableId : undefined,
      tableName: targetTableName,
      server: ticket.server || user?.name || 'Staff',
      orderTakenBy: ticket.server || user?.name || 'Staff',
      cashier: user?.name || 'POS Staff',
      timePlaced: ticket.timePlaced || Date.now(),
      timeSettled: Date.now(),
      items: ticket.items || [],
      subTotal: ticketSub,
      discount: 0,
      tax: ticketTax,
      serviceCharge: ticketService > 0 ? ticketService : undefined,
      total: ticketTotal,
      payments: [],
      status: 'unpaid',
      isUnpaidBill: true,
      notes: `Pending Order Slip • KOT #${ticket.id}`,
    };

    printInvoiceReceipt(pendingInvoice);
    showKdsToast(`Pending Slip printed for ${targetTableName}`);
  };

  const sendToKitchen = () => {
    if (!requirePosPerm('posCanSendKot', 'dispatch KOT tickets to Kitchen')) return;
    if (cart.length === 0) return;
    if (orderType === 'dine-in' && systemSettings.posRequireTableForDineIn !== false && !selectedTableId) {
      setTableModalVisible(true);
      return;
    }

    const tId = orderType === 'dine-in' ? selectedTableId : orderType;
    const targetTable = selectedTableId ? tables.find((t) => t.id === selectedTableId) : null;
    const targetTableName = targetTable
      ? targetTable.name
      : selectedCustomerObj?.name
        ? `${orderType === 'delivery' ? 'Delivery' : 'Takeaway'} • ${selectedCustomerObj.name}`
        : orderType === 'delivery'
          ? 'Delivery'
          : 'Takeaway';

    const kotItems: { item: MenuItem; qty: number; notes?: string }[] = [];
    cart.forEach((cartItem) => {
      const loadedItem = loadedCart.find((i) => i.id === cartItem.id);
      const loadedQty = loadedItem ? loadedItem.qty : 0;
      if (cartItem.qty > loadedQty) {
        const baseId = cartItem.id.split('-')[0];
        const baseMenu = menuItems.find((m) => m.id === baseId || m.id === cartItem.id);
        const itemObj: MenuItem = baseMenu
          ? {
            ...baseMenu,
            id: cartItem.id,
            name: cartItem.name,
            price: cartItem.price,
            station: cartItem.station || baseMenu.station || 'main',
          }
          : {
            id: cartItem.id,
            name: cartItem.name,
            price: cartItem.price,
            category: 'Mains',
            station: cartItem.station || 'main',
          };
        kotItems.push({
          item: itemObj,
          qty: cartItem.qty - loadedQty,
          notes: cartItem.notes,
        });
      }
    });

    if (kotItems.length === 0) {
      showKdsToast('All items in cart are already sent to KDS.');
      return;
    }

    const isAddOn = loadedCart.length > 0;
    const serverLabel = selectedCustomerObj?.name
      ? `${user?.name || 'POS'} • ${selectedCustomerObj.name}`
      : `${user?.name || 'Staff'} (POS)`;

    const hasMain = kotItems.some((k) => (k.item.station || 'main') === 'main');
    const hasJuice = kotItems.some((k) => (k.item.station || 'main') === 'juice');
    const stationSummary = hasMain && hasJuice ? 'Kitchen + Juice KDS' : hasJuice ? 'Juice Bar KDS' : 'Kitchen KDS';
    const sentPrepEst = estimateOrderPrepTime(
      kotItems.map((k) => ({ id: k.item.id, name: k.item.name, qty: k.qty, prepTimeMin: k.item.prepTimeMin, category: k.item.category })),
      menuItems
    );

    placeOrder(tId, serverLabel, kotItems, isAddOn, undefined, orderNotes.trim() || undefined);
    broadcastImmediately();

    const latestTicket = useRestaurantStore.getState().tickets?.[0];
    const pendingSlipId = latestTicket?.id
      ? `PND-${latestTicket.id.replace(/^KOT-/, '')}`
      : `PND-${Date.now().toString().slice(-4)}`;

    const pendingSlipInvoice: Invoice = {
      id: pendingSlipId,
      orderType: orderType === 'dine-in' ? 'dine-in' : (orderType as any),
      tableId: selectedTableId || undefined,
      tableName: targetTableName,
      customer: selectedCustomerObj,
      server: selectedServer || user?.name || 'Staff',
      orderTakenBy: selectedServer || user?.name || 'Staff',
      cashier: user?.name || 'POS Staff',
      timePlaced: Date.now(),
      timeSettled: Date.now(),
      items: cart,
      subTotal,
      discount: discountVal,
      tax,
      serviceCharge: serviceCharge > 0 ? serviceCharge : undefined,
      total,
      payments: [],
      status: 'unpaid',
      isUnpaidBill: true,
      notes: `Pending Slip • Sent to ${stationSummary}${latestTicket?.id ? ` (${latestTicket.id})` : ''}`,
    };
    printInvoiceReceipt(pendingSlipInvoice);

    if (orderType === 'dine-in') {
      setLoadedCart(JSON.parse(JSON.stringify(cart)));
    } else {
      setCart([]);
      setLoadedCart([]);
      setOrderNotes('');
      setLoadedTicketId(null);
      setSelectedCustomerId('');
      setSelectedEventCampaign(null);
      setDiscountAmount('0');
    }

    showKdsToast(
      isAddOn
        ? `Add-on sent to ${stationSummary} • ⏱️ Est. Prep Time: ~${sentPrepEst.totalPrepMins} Mins`
        : `Order sent to ${stationSummary} (${targetTableName}) • ⏱️ Est. Prep Time: ~${sentPrepEst.totalPrepMins} Mins`
    );
  };

  const openCheckout = () => {
    if (!requirePosPerm('posCanSettleBill', 'settle bills and collect payment')) return;
    if (cart.length === 0) return;
    if (systemSettings.requireActiveShiftForPos && !activeShift) {
      const msg = 'An open cash register shift is required before POS billing. Please open a shift first.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Active Shift Required', msg);
      return;
    }
    if (orderType === 'dine-in' && systemSettings.posRequireTableForDineIn !== false && !selectedTableId) {
      setTableModalVisible(true);
      return;
    }
    if (
      orderType === 'delivery' &&
      systemSettings.posRequireCustomerForDelivery !== false &&
      (!selectedCustomerObj || !selectedCustomerObj.phone)
    ) {
      setCustomerModalVisible(true);
      return;
    }
    setPayments([{ type: 'cash', amount: Math.round(total) }]);
    setActivePaymentIndex(0);
    setCheckoutModalVisible(true);
  };

  const handleCreateBillFromTicket = (ticket: typeof tickets[0], autoOpenCheckout = true) => {
    if (autoOpenCheckout && !requirePosPerm('posCanSettleBill', 'settle bills and collect payment')) return;
    setLoadedTicketId(ticket.id);

    const isTable = ticket.tableId && ticket.tableId !== 'takeaway' && ticket.tableId !== 'delivery';
    const targetTable = isTable
      ? tables.find(
        (t) =>
          t.id === ticket.tableId ||
          (ticket.tableName && t.name.trim().toLowerCase() === ticket.tableName.trim().toLowerCase())
      )
      : null;

    if (targetTable) {
      handleTableSelect(targetTable.id);
    } else {
      const isDelivery = ticket.tableId?.toLowerCase() === 'delivery';
      setOrderType(isDelivery ? 'delivery' : 'takeaway');
      setSelectedTableId('');
      setSelectedServer(ticket.server || '');
      const itemsCopy = ticket.items.map((i) => ({ ...i }));
      setCart(itemsCopy);
      setLoadedCart(JSON.parse(JSON.stringify(itemsCopy)));
    }

    if (ticket.notes) {
      setOrderNotes(ticket.notes);
    }
    setPendingOrdersModalVisible(false);

    if (autoOpenCheckout) {
      setTimeout(() => {
        const ticketSub = ticket.items.reduce((s, it) => s + it.price * it.qty, 0);
        const ticketTax = ticketSub * effectiveTaxRate;
        const ticketService = systemSettings.serviceChargeEnabled
          ? ticketSub * ((systemSettings.serviceChargePercent || 0) / 100)
          : 0;
        const rawTicketTotal = ticketSub + ticketTax + ticketService;
        const ticketTotal = systemSettings.roundTotals ? Math.round(rawTicketTotal) : rawTicketTotal;
        setPayments([{ type: 'cash', amount: ticketTotal }]);
        setCheckoutModalVisible(true);
      }, 120);
    } else {
      setMobileTab('cart');
    }
  };

  const handleFinalizeOrder = () => {
    if (!requirePosPerm('posCanSettleBill', 'settle bills and collect payment')) return;
    const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const remainingToCollect = total - totalCollected;

    if (remainingToCollect > 0.01) {
      const msg = `Please collect full payment. Remaining due: Rs. ${remainingToCollect.toFixed(0)}`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Incomplete Payment', msg);
      return;
    }

    const targetTableId = selectedTableId;
    const targetTableName = selectedTableObj?.name || `Table ${targetTableId}`;
    const wasDineIn = orderType === 'dine-in' && targetTableId;

    const userRoleLabel = user?.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : role === 'admin'
        ? 'Admin'
        : role === 'floor_manager'
          ? 'Floor Manager'
          : 'Cashier';
    const currentUserName = user?.name
      ? user.name.includes(`(${userRoleLabel})`)
        ? user.name
        : `${user.name} (${userRoleLabel})`
      : 'POS Cashier';
    const orderCreator = selectedServer || currentUserName;
    const cashierName = currentUserName;
    const changeDueAmount = Math.max(0, totalCollected - total);

    const invoicePayments = payments
      .filter((p) => (Number(p.amount) || 0) > 0)
      .map((p) => {
        if (p.type === 'cash' && changeDueAmount > 0) {
          return {
            ...p,
            tendered: p.amount,
            amount: Math.max(0, p.amount - changeDueAmount),
            change: changeDueAmount,
          };
        }
        return p;
      });

    const invoice = createInvoicePayload({
      orderType,
      server: orderCreator,
      orderTakenBy: orderCreator,
      cashier: cashierName,
      customer: selectedCustomerObj,
      tableName: selectedTableObj?.name,
      tableId: selectedTableObj?.id,
      items: cart,
      subTotal,
      discount: discountVal,
      tax,
      serviceCharge: serviceCharge > 0 ? serviceCharge : undefined,
      total,
      payments: invoicePayments,
      tenderedAmount: totalCollected,
      changeReturned: changeDueAmount,
    });

    const unsentKotItems: { item: MenuItem; qty: number; notes?: string }[] = [];
    cart.forEach((cartItem) => {
      const loadedQty = loadedCart.filter((lc) => lc.id === cartItem.id).reduce((s, lc) => s + lc.qty, 0);
      if (cartItem.qty > loadedQty) {
        const baseMenu = menuItems.find((m) => m.id === cartItem.id || cartItem.id.startsWith(`${m.id}-`));
        const itemObj: MenuItem = baseMenu
          ? {
            ...baseMenu,
            id: cartItem.id,
            name: cartItem.name,
            price: cartItem.price,
            station: cartItem.station || baseMenu.station || 'main',
          }
          : {
            id: cartItem.id,
            name: cartItem.name,
            price: cartItem.price,
            category: 'Mains',
            station: cartItem.station || 'main',
          };
        unsentKotItems.push({ item: itemObj, qty: cartItem.qty - loadedQty, notes: cartItem.notes });
      }
    });

    if (unsentKotItems.length > 0 && systemSettings.autoSendKdsOnOrder !== false && systemSettings.enableKdsModule !== false) {
      const kotTarget = targetTableId || (orderType === 'delivery' ? 'delivery' : 'takeaway');
      placeOrder(kotTarget, cashierName, unsentKotItems, loadedCart.length > 0, undefined, orderNotes.trim() || undefined);
    }

    // Detect if any already-punched KOT items were removed or reduced before billing, and log them to Daily Cancellation Report
    if (loadedCart.length > 0) {
      const removedPunchedItems: {
        id: string;
        name: string;
        qty: number;
        price: number;
        lineTotal: number;
        station?: 'main' | 'juice';
        notes?: string;
      }[] = [];
      loadedCart.forEach((loadedItem) => {
        const finalItem = cart.find((c) => c.id === loadedItem.id);
        const finalQty = finalItem ? finalItem.qty : 0;
        if (finalQty < loadedItem.qty) {
          const diffQty = loadedItem.qty - finalQty;
          removedPunchedItems.push({
            id: loadedItem.id,
            name: loadedItem.name,
            qty: diffQty,
            price: loadedItem.price,
            lineTotal: loadedItem.price * diffQty,
            station: loadedItem.station,
            notes: loadedItem.notes,
          });
        }
      });
      if (removedPunchedItems.length > 0) {
        const remQty = removedPunchedItems.reduce((s, i) => s + i.qty, 0);
        const remAmt = removedPunchedItems.reduce((s, i) => s + i.lineTotal, 0);
        const targetTbl = targetTableId ? tables.find((t) => t.id === targetTableId) : undefined;
        logCancelledPunchedItems({
          ticketId: loadedTicketId || invoice.id,
          tableId: targetTableId || orderType,
          tableName: targetTableName,
          floor: targetTbl?.floor || targetTbl?.zone,
          orderType: orderType === 'dine-in' ? 'dine-in' : (orderType as any),
          server: selectedServer || user?.name || 'Staff',
          cancelledBy: user?.name || 'POS Staff',
          cancelledByRole: user?.customRoleId === 'role-cashier' ? 'Cashier' : String(user?.role || role || 'Staff'),
          reason: `Removed/reduced from punched order during checkout (Bill ${invoice.id})`,
          source: 'removed_at_billing',
          items: removedPunchedItems,
          totalQty: remQty,
          totalAmount: remAmt,
          timePlaced: Date.now(),
        });
      }
    }

    saveInvoice(invoice);

    if (loadedTicketId) {
      dismissTicket(loadedTicketId, { isSettlementCleanup: true });
      setLoadedTicketId(null);
    }
    if (targetTableId) {
      clearTableTickets(targetTableId, { isSettlementCleanup: true });
    }

    broadcastImmediately();

    if (selectedCustomerObj) {
      updateCustomer(selectedCustomerObj.id, {
        totalOrders: selectedCustomerObj.totalOrders + 1,
        totalSpent: selectedCustomerObj.totalSpent + total,
      });
    }

    isRecentlyPaidRef.current = true;
    publishCustomerDisplayState({
      isPosActive: true,
      status: 'paid',
      cart: cart.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty,
        notes: item.notes,
        subtotal: item.price * item.qty,
      })),
      itemCount: cart.reduce((s, i) => s + i.qty, 0),
      subTotal,
      discountVal,
      tax,
      serviceCharge,
      deliveryCharges,
      total,
      tenderedAmount: totalCollected,
      changeDue: changeDueAmount,
      orderType,
      tableName: targetTableName,
      customerName: selectedCustomerObj?.name,
      cashierName,
      invoiceId: invoice.id,
      lastUpdated: Date.now(),
    });
    setTimeout(() => {
      isRecentlyPaidRef.current = false;
      publishCustomerDisplayState({
        ...INITIAL_CFD_STATE,
        isPosActive: true,
        status: 'idle',
        cashierName,
        lastUpdated: Date.now(),
      });
    }, 5000);

    setCart([]);
    setLoadedCart([]);
    setOrderNotes('');
    setSelectedEventCampaign(null);
    setDiscountAmount('0');
    setCheckoutModalVisible(false);
    setSelectedCustomerId('');
    setSelectedTableId('');

    printInvoiceReceipt(invoice);

    if (wasDineIn && systemSettings.posEnableTableReleaseConfirm !== false) {
      setTableDecisionModal({
        tableId: targetTableId,
        tableName: targetTableName,
        invoice,
      });
    } else if (wasDineIn && targetTableId) {
      settleBill(targetTableId);
    }
  };

  const updatePayment = (idx: number, field: 'type' | 'amount', value: string) => {
    const newP = [...payments];
    if (field === 'type') {
      newP[idx].type = value as any;
    } else {
      newP[idx].amount = parseFloat(value) || 0;
    }
    setPayments(newP);
  };

  const handlePrintUnpaidBill = () => {
    if (!requirePosPerm('posCanPrintUnpaidBill', 'print provisional unpaid bills')) return;
    if (cart.length === 0) return;

    const targetTable = selectedTableId ? tables.find((t) => t.id === selectedTableId) : null;
    const targetTableName = targetTable ? targetTable.name : orderType === 'dine-in' ? 'Table' : orderType.toUpperCase();

    const unpaidInvoice: Invoice = {
      id: `CHK-${targetTableName.replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`,
      orderType: orderType === 'dine-in' ? 'dine-in' : (orderType as any),
      tableId: selectedTableId || undefined,
      tableName: targetTableName,
      customer: selectedCustomerObj,
      server: selectedServer || user?.name || 'Staff',
      orderTakenBy: selectedServer || user?.name || 'Staff',
      cashier: user?.name || 'POS Staff',
      timePlaced: Date.now(),
      timeSettled: Date.now(),
      items: cart,
      subTotal,
      discount: discountVal,
      tax,
      serviceCharge: serviceCharge > 0 ? serviceCharge : undefined,
      total,
      payments: [],
      status: 'unpaid',
      isUnpaidBill: true,
      notes: 'Provisional Unpaid Bill',
    };

    if (selectedTableId) {
      markTableBilled(selectedTableId, unpaidInvoice.id);
    }
    broadcastImmediately();
    printInvoiceReceipt(unpaidInvoice);
    showKdsToast(`Pending Bill printed for ${targetTableName}`);
  };

  const totalCartQty = cart.reduce((s, i) => s + i.qty, 0);
  const cartPrepEstimate = useMemo(
    () => estimateOrderPrepTime(cart, menuItems, undefined),
    [cart, menuItems]
  );

  // Live Order Taker Payment Collections Pending Cashier Handover ("Order Taker ke naam par bolti hui pending payments")
  const pendingWaiterCollections = useMemo(
    () =>
      tables.filter(
        (t) => t && t.status !== 'available' && t.waiterPaymentCollection?.status === 'pending_cashier'
      ),
    [tables]
  );

  const waiterLiabilitySummary = useMemo(() => {
    const byWaiter = new Map<string, { waiterName: string; totalAmount: number; count: number; tables: string[] }>();
    pendingWaiterCollections.forEach((t) => {
      const col = t.waiterPaymentCollection;
      if (!col) return;
      const wName = col.collectedByWaiter || t.server || 'Order Taker';
      const key = wName.trim().toLowerCase();
      const prev = byWaiter.get(key) || { waiterName: wName, totalAmount: 0, count: 0, tables: [] };
      prev.totalAmount += col.totalAmount || 0;
      prev.count += 1;
      prev.tables.push(t.name);
      byWaiter.set(key, prev);
    });
    return Array.from(byWaiter.values());
  }, [pendingWaiterCollections]);

  const seenWaiterPayIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    pendingWaiterCollections.forEach((t) => {
      const col = t.waiterPaymentCollection;
      if (col && col.id && !seenWaiterPayIdsRef.current.has(col.id)) {
        seenWaiterPayIdsRef.current.add(col.id);
        showKdsToast(
          `💰 Payment Collected by ${col.collectedByWaiter} on ${t.name} (Rs. ${col.totalAmount.toLocaleString()} • ${col.paymentMethod.toUpperCase()}) — Waiting for Cashier Receive!`
        );
      }
    });
  }, [pendingWaiterCollections]);

  const handleReceiveWaiterPaymentAndSettle = (targetTable: typeof tables[0]) => {
    if (!requirePosPerm('posCanSettleBill', 'receive Order Taker payment and settle bill')) return;
    const col = targetTable.waiterPaymentCollection;
    if (!col) return;

    const tableTickets = tickets.filter((tk) => tk.tableId === targetTable.id);
    const rawItems: OrderItem[] =
      tableTickets.length > 0
        ? tableTickets.flatMap((tk) => (tk.items || []).map((i) => ({ ...i })))
        : (targetTable.orders || []).map((i) => ({ ...i }));
    const mergedMap = new Map<string, OrderItem>();
    rawItems.forEach((it) => {
      const prev = mergedMap.get(it.id);
      if (prev) {
        prev.qty += it.qty;
      } else {
        mergedMap.set(it.id, { ...it });
      }
    });
    const finalItems = Array.from(mergedMap.values());
    const cashierName = user?.name ? `${user.name} (Cashier)` : 'POS Cashier';
    const payType = col.paymentMethod === 'card' ? 'card' : col.paymentMethod === 'online' ? 'online' : 'cash';

    const invoice = createInvoicePayload({
      orderType: 'dine-in',
      server: col.collectedByWaiter || targetTable.server || 'Order Taker',
      orderTakenBy: col.collectedByWaiter || targetTable.server || 'Order Taker',
      cashier: cashierName,
      tableName: targetTable.name,
      tableId: targetTable.id,
      items: finalItems,
      subTotal: col.subTotal || finalItems.reduce((s, i) => s + i.price * i.qty, 0),
      discount: 0,
      tax: col.tax || 0,
      serviceCharge: col.serviceCharge > 0 ? col.serviceCharge : undefined,
      total: col.totalAmount,
      payments: [
        {
          type: payType as any,
          amount: col.totalAmount,
          tendered: col.tenderedAmount || col.totalAmount,
          change: col.changeReturned || 0,
        },
      ],
      tenderedAmount: col.tenderedAmount || col.totalAmount,
      changeReturned: col.changeReturned || 0,
    });
    invoice.notes = `Collected by Order Taker: ${col.collectedByWaiter} (${col.paymentMethod.toUpperCase()}) • Received by Cashier: ${cashierName}${col.notes ? ` • ${col.notes}` : ''}`;

    saveInvoice(invoice);
    clearTableTickets(targetTable.id, { isSettlementCleanup: true });
    settleBill(targetTable.id);
    if (selectedTableId === targetTable.id) {
      setCart([]);
      setLoadedCart([]);
      setOrderNotes('');
      setSelectedTableId('');
    }
    broadcastImmediately();
    printInvoiceReceipt(invoice);
    showKdsToast(
      `✅ Received Rs. ${col.totalAmount.toLocaleString()} from ${col.collectedByWaiter} & settled ${targetTable.name}!`
    );
  };

  if (role !== 'admin' && !can('canAccessPOS')) {
    return (
      <PermissionDeniedScreen
        moduleName="POS Billing Terminal"
        urduModuleName="پی او ایس بلنگ ٹرمینل"
        requiredPermission="canAccessPOS"
        backRoute={backRoute}
      />
    );
  }

  if (systemSettings.enablePosModule === false) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Ionicons name="lock-closed-outline" size={56} color="#B45309" style={{ marginBottom: 12 }} />
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#1E293B', marginBottom: 6 }}>
          POS Terminal Module Disabled
        </Text>
        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', maxWidth: 420, marginBottom: 20 }}>
          Enable the POS module in System Settings to resume billing.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#52141C', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }}
          onPress={() => router.replace(backRoute as any)}
        >
          <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: '#24050A' }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* ========================================================
          1. CLEAN STREAMLINED TOP COMMAND BAR
          ======================================================== */}
      <View style={[styles.topBar, isMobile && { paddingHorizontal: 10, height: 54 }]}>
        {/* Left: Back + Brand + Order Type Switcher */}
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace(backRoute as any)}>
            <Ionicons name="arrow-back" size={18} color="#F3D179" />
          </TouchableOpacity>

          <View style={styles.brandWrap}>
            <SultanLogo size="xs" width={24} height={24} />
            {!isMobile && <Text style={styles.brandText}>SULTAN POS</Text>}
          </View>

          {/* Order Type Pill Switcher directly in Top Bar on Desktop/Tablet */}
          {!isMobile && (
            <View style={styles.topOrderTypeGroup}>
              {systemSettings.enableDineIn !== false && (role === 'admin' || can('posCanDineIn')) && (
                <TouchableOpacity
                  style={[styles.topOrderTypeBtn, orderType === 'dine-in' && styles.topOrderTypeBtnActive]}
                  onPress={() => handleOrderTypeChange('dine-in')}
                >
                  <Ionicons name="restaurant-outline" size={14} color={orderType === 'dine-in' ? '#24050A' : '#E2E8F0'} />
                  <Text style={[styles.topOrderTypeText, orderType === 'dine-in' && styles.topOrderTypeTextActive]}>
                    Dine-In
                  </Text>
                  <Text style={[styles.topOrderKey, orderType === 'dine-in' && { color: '#24050A' }]}>F2</Text>
                </TouchableOpacity>
              )}
              {systemSettings.enableTakeaway !== false && (role === 'admin' || can('posCanTakeaway')) && (
                <TouchableOpacity
                  style={[styles.topOrderTypeBtn, orderType === 'takeaway' && styles.topOrderTypeBtnActive]}
                  onPress={() => handleOrderTypeChange('takeaway')}
                >
                  <Ionicons name="bag-handle-outline" size={14} color={orderType === 'takeaway' ? '#24050A' : '#E2E8F0'} />
                  <Text style={[styles.topOrderTypeText, orderType === 'takeaway' && styles.topOrderTypeTextActive]}>
                    Takeaway
                  </Text>
                  <Text style={[styles.topOrderKey, orderType === 'takeaway' && { color: '#24050A' }]}>F3</Text>
                </TouchableOpacity>
              )}
              {systemSettings.enableDelivery !== false && (role === 'admin' || can('posCanDelivery')) && (
                <TouchableOpacity
                  style={[styles.topOrderTypeBtn, orderType === 'delivery' && styles.topOrderTypeBtnActive]}
                  onPress={() => handleOrderTypeChange('delivery')}
                >
                  <Ionicons name="bicycle-outline" size={14} color={orderType === 'delivery' ? '#24050A' : '#E2E8F0'} />
                  <Text style={[styles.topOrderTypeText, orderType === 'delivery' && styles.topOrderTypeTextActive]}>
                    Delivery
                  </Text>
                  <Text style={[styles.topOrderKey, orderType === 'delivery' && { color: '#24050A' }]}>F4</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Center: Clean Fast Search Input */}
        <View style={[styles.topSearchWrap, isMobile && { flex: 1, marginHorizontal: 6 }]}>
          <Ionicons name="search" size={16} color="#94A3B8" />
          <TextInput
            ref={searchInputRef}
            style={[styles.topSearchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            placeholder={isMobile ? 'Search dishes...' : 'Search dish name or category... (F1)'}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={17} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Right: Essential Quick Actions */}
        <View style={styles.topBarRight}>
          {/* Running KDS Orders */}
          <TouchableOpacity
            style={[styles.topActionBtn, activeRunningTickets.length > 0 && styles.topActionBtnHighlight]}
            onPress={() => setPendingOrdersModalVisible(true)}
          >
            <Ionicons name="flame" size={15} color={activeRunningTickets.length > 0 ? '#F59E0B' : '#F3D179'} />
            {!isMobile && <Text style={styles.topActionText}>Running</Text>}
            <View style={styles.topCountBadge}>
              <Text style={styles.topCountBadgeText}>{activeRunningTickets.length}</Text>
            </View>
          </TouchableOpacity>

          {/* Recent Bills Reprint */}
          <TouchableOpacity style={styles.topActionBtn} onPress={() => setRecentInvoicesModalVisible(true)}>
            <Ionicons name="receipt-outline" size={15} color="#F3D179" />
            {!isMobile && !isTablet && <Text style={styles.topActionText}>Recents</Text>}
          </TouchableOpacity>

          {/* Customer Display (Desktop/Tablet) */}
          {!isMobile && (
            <TouchableOpacity style={styles.topActionBtn} onPress={handleOpenCustomerDisplay}>
              <Ionicons name="desktop-outline" size={15} color="#F3D179" />
              {!isTablet && <Text style={styles.topActionText}>Customer Screen</Text>}
            </TouchableOpacity>
          )}

          {/* Shift Status */}
          {!isMobile && (
            <TouchableOpacity style={styles.topShiftBtn} onPress={() => router.push(shiftRoute as any)}>
              <View style={styles.shiftGreenDot} />
              <Text style={styles.topShiftText}>{activeShift ? 'Shift Open' : 'Shift'}</Text>
            </TouchableOpacity>
          )}

          {!isMobile && !isTablet && (
            <TouchableOpacity style={styles.topActionBtn} onPress={() => setShortcutsModalVisible(true)}>
              <Ionicons name="keypad-outline" size={15} color="#F3D179" />
            </TouchableOpacity>
          )}

          <FullscreenButton variant="compact" />
        </View>
      </View>

      {/* ========================================================
          FULL-PAGE MODE SWITCHER (ON ALL DEVICES: MENU vs CART vs RUNNING KDS)
          ======================================================== */}
      <View style={styles.mobileTabBar}>
        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'menu' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('menu')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="restaurant"
            size={18}
            color={mobileTab === 'menu' ? '#F3D179' : '#475569'}
          />
          <Text style={[styles.mobileTabText, mobileTab === 'menu' && styles.mobileTabTextActive]}>
            1. Order / Menu Dishes ({filteredItems.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'cart' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('cart')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="cart"
            size={19}
            color={mobileTab === 'cart' ? '#F3D179' : '#475569'}
          />
          <Text style={[styles.mobileTabText, mobileTab === 'cart' && styles.mobileTabTextActive]}>
            2. Current Cart & Bill ({totalCartQty}
            {!hidePrices && totalCartQty > 0 ? ` • Rs. ${Math.round(total).toLocaleString()}` : ''})
          </Text>
          {totalCartQty > 0 && (
            <View
              style={{
                backgroundColor: mobileTab === 'cart' ? '#D4AF37' : '#52141C',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  color: mobileTab === 'cart' ? '#24050A' : '#FFFFFF',
                  fontSize: 12,
                  fontWeight: '900',
                }}
              >
                {totalCartQty}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mobileTabBtn,
            mobileTab === 'running' && { backgroundColor: '#B45309', borderColor: '#F59E0B' },
          ]}
          onPress={() => setMobileTab('running')}
          activeOpacity={0.85}
        >
          <Ionicons
            name="flame"
            size={19}
            color={mobileTab === 'running' ? '#FFFFFF' : '#B45309'}
          />
          <Text
            style={[
              styles.mobileTabText,
              mobileTab === 'running' && { color: '#FFFFFF', fontWeight: '900' },
            ]}
          >
            3. Running KDS & Prep Time ({activeRunningTickets.length})
          </Text>
          {activeRunningTickets.length > 0 && (
            <View
              style={{
                backgroundColor: mobileTab === 'running' ? '#FFFFFF' : '#FEF3C7',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#F59E0B',
              }}
            >
              <Text
                style={{
                  color: '#B45309',
                  fontSize: 12,
                  fontWeight: '900',
                }}
              >
                {activeRunningTickets.length} Live
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Toast Notification */}
      {kdsStatusToast && (
        <View style={styles.toastBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#10B981" />
          <Text style={styles.toastBannerText}>{kdsStatusToast}</Text>
          <TouchableOpacity onPress={() => setKdsStatusToast(null)}>
            <Ionicons name="close" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================================
          LIVE CASHIER ALERT BANNER: ORDER TAKER COLLECTED PAYMENTS (PENDING CASHIER RECEIVE)
          ======================================================================== */}
      {pendingWaiterCollections.length > 0 && (
        <View
          style={{
            backgroundColor: '#FFFBEB',
            borderBottomWidth: 2,
            borderBottomColor: '#F59E0B',
            paddingHorizontal: 14,
            paddingVertical: 10,
            gap: 8,
          }}
        >
          {/* Row 1: Alert Title + Per-Order-Taker Liability Summary Pills ("Kis Order Taker ke Naam Par Payment Bol Rahi Hai") */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  backgroundColor: '#D97706',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Ionicons name="notifications" size={14} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' }}>
                  PENDING CASHIER RECEIVE ({pendingWaiterCollections.length})
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#92400E' }}>
                Order Taker Collected Payments — Waiting for Cashier Handover:
              </Text>
            </View>

            {/* Per-Waiter Liability Pills */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {waiterLiabilitySummary.map((w) => (
                <View
                  key={w.waiterName}
                  style={{
                    backgroundColor: '#FEF3C7',
                    borderWidth: 1.5,
                    borderColor: '#D97706',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Ionicons name="person" size={12} color="#92400E" />
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#78350F' }}>
                    {w.waiterName}: Rs. {w.totalAmount.toLocaleString()} ({w.count} {w.count === 1 ? 'Order' : 'Orders'} Pending)
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Row 2: Actionable Pending Table Collection Cards */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {pendingWaiterCollections.map((t) => {
              const col = t.waiterPaymentCollection!;
              return (
                <View
                  key={col.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: '#F59E0B',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>{t.name}</Text>
                      <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#92400E' }}>
                          {col.paymentMethod.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#15803D' }}>
                        Rs. {col.totalAmount.toLocaleString()}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#B45309', marginTop: 2 }}>
                      👤 Collected by: {col.collectedByWaiter} • {new Date(col.collectedAt).toLocaleTimeString()}
                      {col.notes ? ` • "${col.notes}"` : ''}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#F1F5F9',
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 8,
                      }}
                      onPress={() => {
                        handleTableSelect(t.id);
                        setMobileTab('cart');
                      }}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#334155' }}>Open Bill</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        backgroundColor: '#16A34A',
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                      }}
                      onPress={() => handleReceiveWaiterPaymentAndSettle(t)}
                    >
                      <Ionicons name="checkmark-done-circle" size={15} color="#FFFFFF" />
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFFFFF' }}>
                        Receive Cash & Settle
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ========================================================
          2. FULL-PAGE WORKSPACE (TAB 1: MENU | TAB 2: FULL-PAGE CART | TAB 3: RUNNING KDS)
          ======================================================== */}
      <View style={[styles.workspace, (!isLandscape || mobileTab !== 'menu') && { flexDirection: 'column' }]}>
        {/* --------------------------------------------------------
            TAB 1 (MENU): LEFT CATEGORY RAIL
            -------------------------------------------------------- */}
        {mobileTab === 'menu' && (
          <View style={[styles.categoryRail, isLandscape ? { width: width < 1000 ? 180 : width < 1250 ? 205 : 230 } : styles.categoryRailMobile]}>
            {isLandscape && (
              <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.categoryRailTitle}>CATEGORIES</Text>
                  <Text style={styles.categoryRailCount}>{categoryList.length + 1}</Text>
                </View>
                {/* Category Search Box */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 9,
                    borderWidth: 1.5,
                    borderColor: '#CBD5E1',
                    paddingHorizontal: 10,
                    height: 38,
                    gap: 6,
                  }}
                >
                  <Ionicons name="search" size={15} color="#52141C" />
                  <TextInput
                    style={[
                      { flex: 1, fontSize: 13, fontWeight: '700', color: '#0F172A', paddingVertical: 0 },
                      Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
                    ]}
                    placeholder="Search category..."
                    placeholderTextColor="#94A3B8"
                    value={categorySearchQuery}
                    onChangeText={setCategorySearchQuery}
                  />
                  {categorySearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setCategorySearchQuery('')}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
            <ScrollView
              horizontal={!isLandscape}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={isMobile ? styles.categoryRailScrollMobile : styles.categoryRailScroll}
            >
              {/* All Items Button */}
              {(() => {
                const isAll = activeCategory === 'ALL' || activeCategory === 'All';
                return (
                  <TouchableOpacity
                    style={[
                      styles.categoryItem,
                      {
                        backgroundColor: isAll ? '#52141C' : '#FDF2F4',
                        borderColor: isAll ? '#D4AF37' : '#FBCFE8',
                        borderLeftColor: '#52141C',
                      },
                      isMobile && styles.categoryItemMobile,
                    ]}
                    onPress={() => setActiveCategory('ALL')}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.categoryIconBox,
                        { backgroundColor: isAll ? '#D4AF37' : '#FCE7F3' },
                      ]}
                    >
                      <Ionicons name="apps" size={18} color={isAll ? '#24050A' : '#52141C'} />
                    </View>
                    <Text
                      style={[styles.categoryName, isAll && styles.categoryNameActive]}
                      numberOfLines={2}
                    >
                      All Dishes
                    </Text>
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: isAll ? 'rgba(212, 175, 55, 0.28)' : '#FCE7F3' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryBadgeText,
                          { color: isAll ? '#F3D179' : '#52141C' },
                        ]}
                      >
                        {menuItems.length}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}

              {/* Colorful Larger Category Rows */}
              {categoryList.map((cat, idx) => {
                const isActive = activeCategory.toLowerCase() === cat.toLowerCase();
                const count = categoryCounts[cat] || 0;
                const theme = getCategoryTheme(cat, idx);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryItem,
                      {
                        backgroundColor: isActive ? theme.primary : theme.softBg,
                        borderColor: isActive ? theme.primary : theme.border,
                        borderLeftColor: theme.primary,
                      },
                      isMobile && styles.categoryItemMobile,
                    ]}
                    onPress={() => setActiveCategory(cat)}
                    activeOpacity={0.82}
                  >
                    <View
                      style={[
                        styles.categoryIconBox,
                        { backgroundColor: isActive ? '#FFFFFF' : theme.iconBg },
                      ]}
                    >
                      <Ionicons
                        name={getCategoryIcon(cat)}
                        size={18}
                        color={theme.primary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.categoryName,
                        { color: isActive ? '#FFFFFF' : '#0F172A' },
                        isActive && styles.categoryNameActive,
                      ]}
                      numberOfLines={2}
                    >
                      {cat}
                    </Text>
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: isActive ? 'rgba(255,255,255,0.24)' : theme.iconBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryBadgeText,
                          { color: isActive ? '#FFFFFF' : theme.primary },
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
        )}

        {/* --------------------------------------------------------
            TAB 1 (MENU): SPACIOUS FULL-WIDTH DISHES CATALOG GRID
            -------------------------------------------------------- */}
        {mobileTab === 'menu' && (
          <View style={styles.catalogPane}>
            {/* Slim Filter Strip: Active Category Title + Cuisine Pills */}
            <View style={styles.catalogFilterBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.activeCatTitle}>
                  {activeCategory === 'ALL' ? 'All Menu Dishes' : activeCategory}
                </Text>
                <View style={styles.activeCatCountPill}>
                  <Text style={styles.activeCatCountText}>{filteredItems.length} items</Text>
                </View>
              </View>

              {regions.length > 0 && systemSettings.posShowCuisineFilter !== false && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cuisinePillsRow}
                >
                  <TouchableOpacity
                    style={[styles.cuisinePill, activeRegion === 'ALL' && styles.cuisinePillActive]}
                    onPress={() => setActiveRegion('ALL')}
                  >
                    <Text style={[styles.cuisinePillText, activeRegion === 'ALL' && styles.cuisinePillTextActive]}>
                      All Cuisines
                    </Text>
                  </TouchableOpacity>
                  {regions.map((r) => {
                    const active = activeRegion.toLowerCase() === r.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.cuisinePill, active && styles.cuisinePillActive]}
                        onPress={() => setActiveRegion(active ? 'ALL' : r)}
                      >
                        <Text style={[styles.cuisinePillText, active && styles.cuisinePillTextActive]}>{r}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Dish Grid */}
            <FlatList
              key={`pos-grid-${numCols}`}
              data={filteredItems}
              keyExtractor={(item) => item.id}
              numColumns={numCols}
              columnWrapperStyle={numCols > 1 ? styles.dishRow : undefined}
              contentContainerStyle={[styles.dishGridContent, totalCartQty > 0 && { paddingBottom: 96 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              ListEmptyComponent={
                <View style={styles.emptyCatalogBox}>
                  <Ionicons name="search-outline" size={44} color="#CBD5E1" />
                  <Text style={styles.emptyCatalogTitle}>No dishes found</Text>
                  <Text style={styles.emptyCatalogSub}>Try clearing the search or choosing another category</Text>
                </View>
              }
              renderItem={({ item }) => {
                const inCartQty = cartQtyMap[item.id] || 0;
                const isInCart = inCartQty > 0;
                const isOutOfStock = isPosItemBlocked(item);
                const hasVariants = Boolean(item.variants && item.variants.length > 0);
                const imageUri = resolveMenuImageUri(item);

                return (
                  <TouchableOpacity
                    style={[
                      styles.dishCard,
                      { flex: 1 / numCols },
                      isInCart && styles.dishCardActive,
                      isOutOfStock && { opacity: 0.55 },
                    ]}
                    onPress={() => addToCart(item)}
                    activeOpacity={0.78}
                    disabled={isOutOfStock}
                  >
                    {/* Dish Image */}
                    <View style={styles.dishImgBox}>
                      {imageUri && !failedImages[item.id] ? (
                        <Image
                          source={{ uri: imageUri }}
                          style={styles.dishImg}
                          resizeMode="cover"
                          onError={() => setFailedImages((prev) => ({ ...prev, [item.id]: true }))}
                        />
                      ) : (
                        <View style={styles.dishImgFallback}>
                          <Ionicons
                            name={item.isDeal ? 'gift-outline' : 'restaurant-outline'}
                            size={26}
                            color="#D4AF37"
                          />
                        </View>
                      )}

                      {/* Single Clean Price Badge or Variant Tag */}
                      {!hidePrices && (
                        <View style={[styles.dishPriceTag, isInCart && styles.dishPriceTagActive]}>
                          <Text style={[styles.dishPriceTagText, isInCart && { color: '#24050A' }]}>
                            Rs. {item.price.toLocaleString()}
                          </Text>
                        </View>
                      )}

                      {/* Quantity Badge when in Cart */}
                      {isInCart && (
                        <View style={styles.dishQtyBadge}>
                          <Text style={styles.dishQtyBadgeText}>{inCartQty}×</Text>
                        </View>
                      )}

                      {isOutOfStock && (
                        <View style={styles.soldOutOverlay}>
                          <Text style={styles.soldOutOverlayText}>SOLD OUT</Text>
                        </View>
                      )}
                    </View>

                    {/* Dish Info */}
                    <View style={styles.dishBody}>
                      <Text style={styles.dishTitle} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <View style={styles.dishFooterRow}>
                        <View style={styles.dishMetaWrap}>
                          <Text style={styles.dishCategoryLabel} numberOfLines={1}>
                            {hasVariants ? `${item.variants?.length} Sizes` : item.category}
                          </Text>
                          <Text style={styles.dishPriceText}>
                            {hasVariants ? `From Rs. ${item.price.toLocaleString()}` : `Rs. ${item.price.toLocaleString()}`}
                          </Text>
                        </View>
                        <View style={[styles.dishAddIcon, isInCart && styles.dishAddIconActive]}>
                          <Ionicons
                            name="add"
                            size={16}
                            color={isInCart ? '#FFFFFF' : '#52141C'}
                          />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* --------------------------------------------------------
            TAB 2 (CART): FULL-PAGE SPACIOUS ORDER CART & BILLING VIEW (SEPARATE PAGE)
            -------------------------------------------------------- */}
        {mobileTab === 'cart' && (
          <View style={[styles.ticketPanel, { width: '100%', flex: 1, borderLeftWidth: 0 }]}>
            {/* Top Bar inside Full-Page Cart: Back to Menu + Order Type Switcher */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 18,
                paddingVertical: 12,
                backgroundColor: '#FFFFFF',
                borderBottomWidth: 1,
                borderBottomColor: '#E2E8F0',
                gap: 12,
              }}
            >
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#F1F5F9',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                }}
                onPress={() => setMobileTab('menu')}
              >
                <Ionicons name="arrow-back" size={18} color="#52141C" />
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#52141C' }}>
                  + Add More Dishes (Menu)
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(['dine-in', 'takeaway', 'delivery'] as const).map((t) => {
                  const active = orderType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        {
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: active ? '#52141C' : '#F1F5F9',
                          borderWidth: 1,
                          borderColor: active ? '#52141C' : '#CBD5E1',
                        },
                      ]}
                      onPress={() => handleOrderTypeChange(t)}
                    >
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontWeight: '900',
                          color: active ? '#F3D179' : '#334155',
                        }}
                      >
                        {t.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Full-Page Cart Main Body: 2 Wide Columns on Desktop/Landscape, Stacked on Mobile */}
            <View style={{ flex: 1, flexDirection: !isLandscape ? 'column' : 'row', overflow: 'hidden' }}>
              {/* LEFT SIDE OF FULL-PAGE CART: Table/Customer Context + Large Cart Item Rows + Cooking Comments */}
              <View style={{ flex: 1.4, borderRightWidth: !isLandscape ? 0 : 1, borderRightColor: '#E2E8F0', display: 'flex', flexDirection: 'column' }}>

            {/* 1. Order Context Header (Table or Customer Selector) */}
            <View style={styles.ticketContextCard}>
              {orderType === 'dine-in' ? (
                <View style={styles.contextRow}>
                  <TouchableOpacity
                    style={styles.contextSelectBtn}
                    onPress={() => setTableModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.contextIconOrb, selectedTableObj && { backgroundColor: '#DCFCE7' }]}>
                      <Ionicons
                        name="restaurant"
                        size={16}
                        color={selectedTableObj ? '#15803D' : '#B45309'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contextSmallLabel}>DINE-IN TABLE / CABIN</Text>
                      <Text style={styles.contextMainValue} numberOfLines={1}>
                        {selectedTableObj
                          ? `${selectedTableObj.name} • ${getTableFloor(selectedTableObj)}`
                          : 'Tap to Select Table'}
                      </Text>
                    </View>
                    <View style={styles.contextActionPill}>
                      <Text style={styles.contextActionPillText}>
                        {selectedTableObj ? 'Change' : 'Select'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {selectedTableObj && (
                    <TouchableOpacity
                      style={styles.releaseTableIconBtn}
                      onPress={handleClearSelectedTable}
                      {...(Platform.OS === 'web' ? ({ title: 'Release Table' } as any) : {})}
                    >
                      <Ionicons name="refresh-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.contextSelectBtn}
                  onPress={() => {
                    setCustomerSearchQuery('');
                    setIsCreatingNewCustomer(false);
                    setCustomerModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.contextIconOrb, selectedCustomerObj && { backgroundColor: '#DBEAFE' }]}>
                    <Ionicons
                      name={orderType === 'delivery' ? 'bicycle' : 'person'}
                      size={16}
                      color={selectedCustomerObj ? '#1D4ED8' : '#52141C'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contextSmallLabel}>
                      {orderType === 'delivery' ? 'DELIVERY CUSTOMER' : 'TAKEAWAY GUEST'}
                    </Text>
                    <Text style={styles.contextMainValue} numberOfLines={1}>
                      {selectedCustomerObj
                        ? `${selectedCustomerObj.name} (${selectedCustomerObj.phone})`
                        : orderType === 'delivery'
                          ? 'Select Delivery Customer *'
                          : 'Walk-in Guest (Optional)'}
                    </Text>
                  </View>
                  <View style={styles.contextActionPill}>
                    <Text style={styles.contextActionPillText}>
                      {selectedCustomerObj ? 'Change' : 'Customer'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* 2. Cart Header Bar */}
            <View style={styles.ticketItemsHeader}>
              <Text style={styles.ticketItemsHeaderTitle}>
                ORDER ITEMS ({totalCartQty})
              </Text>
              {cart.length > 0 && (
                <TouchableOpacity style={styles.clearCartLink} onPress={clearCart}>
                  <Ionicons name="trash-outline" size={13} color="#DC2626" />
                  <Text style={styles.clearCartLinkText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 3. Compact Single-Row Order Items List (Fits 8-10 items without scrolling) */}
            <ScrollView
              style={styles.ticketItemsScroll}
              contentContainerStyle={styles.ticketItemsContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {cart.length === 0 ? (
                <View style={styles.emptyTicketBox}>
                  <Ionicons name="receipt-outline" size={38} color="#CBD5E1" />
                  <Text style={styles.emptyTicketTitle}>No Items Added Yet</Text>
                  <Text style={styles.emptyTicketSub}>
                    Tap any dish on the menu grid to add it to this bill
                  </Text>
                </View>
              ) : (
                <>
                  {cart.map((item, idx) => (
                    <View key={item.id} style={styles.ticketRow}>
                      <View style={styles.ticketRowLeft}>
                        <Text style={styles.ticketRowIndex}>{idx + 1}.</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ticketRowName} numberOfLines={2}>
                            {item.name}
                          </Text>
                          {!hidePrices && (
                            <Text style={styles.ticketRowUnit}>
                              Rs. {item.price.toLocaleString()} each
                            </Text>
                          )}
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              alignSelf: 'flex-start',
                              gap: 5,
                              marginTop: 5,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 8,
                              backgroundColor: item.notes ? '#FEF3C7' : '#F8FAFC',
                              borderWidth: 1,
                              borderColor: item.notes ? '#F59E0B' : '#CBD5E1',
                            }}
                            onPress={() => openItemNoteModal(item)}
                            activeOpacity={0.78}
                          >
                            <Ionicons
                              name={item.notes ? 'chatbubble-ellipses' : 'create-outline'}
                              size={12}
                              color={item.notes ? '#92400E' : '#64748B'}
                            />
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: '800',
                                color: item.notes ? '#92400E' : '#475569',
                              }}
                              numberOfLines={2}
                            >
                              {item.notes ? `${item.notes}  •  Edit Note` : '+ Add Item Note / Comment'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.ticketRowRight}>
                        <View style={styles.qtyStepper}>
                          <TouchableOpacity
                            style={styles.qtyBtn}
                            onPress={() => updateQty(item.id, -1)}
                          >
                            <Ionicons name="remove" size={13} color="#1E293B" />
                          </TouchableOpacity>
                          <Text style={styles.qtyValText}>{item.qty}</Text>
                          <TouchableOpacity
                            style={[styles.qtyBtn, styles.qtyBtnPlus]}
                            onPress={() => updateQty(item.id, 1)}
                          >
                            <Ionicons name="add" size={13} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>

                        {!hidePrices && (
                          <Text style={styles.ticketRowSubtotal}>
                            Rs. {(item.price * item.qty).toLocaleString()}
                          </Text>
                        )}

                        <TouchableOpacity
                          style={styles.removeRowBtn}
                          onPress={() => removeFromCart(item.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close" size={15} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  {/* Overall Order Notes & Special Kitchen Comments Section */}
                  <View
                    style={{
                      backgroundColor: '#FFFBEB',
                      borderWidth: 1.5,
                      borderColor: '#FDE68A',
                      borderRadius: 12,
                      padding: 12,
                      marginTop: 8,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons name="chatbox-ellipses-outline" size={17} color="#92400E" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '900', color: '#78350F' }}>
                            Overall Order Notes & Kitchen Comments
                          </Text>
                          <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }}>
                            Prints on KOT slip & displays on Kitchen / Juice Bar KDS
                          </Text>
                        </View>
                      </View>
                      {orderNotes.trim().length > 0 && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#FEF2F2',
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: '#FECACA',
                          }}
                          onPress={() => setOrderNotes('')}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626' }}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {ORDER_NOTE_PRESETS.map((preset) => {
                        const active = hasCommaNoteToken(orderNotes, preset);
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 8,
                              backgroundColor: active ? '#52141C' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: active ? '#52141C' : '#FCD34D',
                            }}
                            onPress={() => setOrderNotes((prev) => toggleCommaNoteToken(prev, preset))}
                            activeOpacity={0.78}
                          >
                            <Text
                              style={{
                                fontSize: 11.5,
                                fontWeight: '800',
                                color: active ? '#F3D179' : '#78350F',
                              }}
                            >
                              {active ? `✓ ${preset}` : `+ ${preset}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <TextInput
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#FCD34D',
                        borderRadius: 9,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 12.5,
                        fontWeight: '700',
                        color: '#0F172A',
                        minHeight: 46,
                      }}
                      placeholder="Write overall order comments (e.g. Serve starters first, make all Karahi medium spicy, VIP table)..."
                      placeholderTextColor="#94A3B8"
                      value={orderNotes}
                      onChangeText={setOrderNotes}
                      multiline
                    />
                  </View>
                </>
              )}
            </ScrollView>
              </View>

              {/* RIGHT SIDE OF FULL-PAGE CART: Large Financial Summary & Big Action Buttons */}
              <View style={[styles.ticketFooter, isLandscape && { width: 420, borderTopWidth: 0, justifyContent: 'space-between', padding: 20, backgroundColor: '#F8FAFC' }]}>
              {/* Estimated Kitchen Preparation Time Banner */}
              {cart.length > 0 && (
                <View
                  style={{
                    backgroundColor: '#FFFBEB',
                    borderWidth: 1.5,
                    borderColor: '#F59E0B',
                    borderRadius: 12,
                    padding: 12,
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="time" size={18} color="#B45309" />
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#92400E' }}>
                        EST. KITCHEN PREP TIME
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: '#B45309',
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' }}>
                        ~{cartPrepEstimate.totalPrepMins} Mins
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11.5, color: '#B45309', fontWeight: '600' }} numberOfLines={2}>
                    {cartPrepEstimate.itemBreakdowns
                      .map((b) => `${b.qty}x ${b.name} (${b.prepMins}m)`)
                      .join(' • ')}
                  </Text>
                </View>
              )}
              {!hidePrices && (
                <View style={styles.summaryBox}>
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>Subtotal</Text>
                    <Text style={styles.summaryVal}>Rs. {subTotal.toLocaleString()}</Text>
                  </View>

                  <View style={styles.summaryLine}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.summaryLabel}>Discount</Text>
                      <TouchableOpacity
                        style={styles.promoMiniBtn}
                        onPress={() => {
                          if (!requirePosPerm('canApplyCustomDiscount', 'apply custom discounts')) return;
                          setCustomDiscountInput(discountAmount);
                          setDiscountModalVisible(true);
                        }}
                      >
                        <Ionicons name="pricetag" size={10} color="#059669" />
                        <Text style={styles.promoMiniBtnText}>
                          {selectedEventCampaign
                            ? selectedEventCampaign.title
                            : discountVal > 0
                              ? 'Edit'
                              : '+ Add'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.summaryVal, { color: '#059669' }]}>
                      - Rs. {discountVal.toLocaleString()}
                    </Text>
                  </View>

                  {systemSettings.taxEnabled && (
                    <View style={styles.summaryLine}>
                      <Text style={styles.summaryLabel}>
                        {systemSettings.taxLabel || 'GST'} ({systemSettings.taxRatePercent || 0}%)
                      </Text>
                      <Text style={styles.summaryVal}>Rs. {Math.round(tax).toLocaleString()}</Text>
                    </View>
                  )}

                  {orderType === 'delivery' && (
                    <View style={styles.summaryLine}>
                      <Text style={styles.summaryLabel}>Delivery Fee</Text>
                      <Text style={styles.summaryVal}>Rs. {deliveryCharges.toLocaleString()}</Text>
                    </View>
                  )}

                  <View style={styles.grandTotalRow}>
                    <Text style={styles.grandTotalLabel}>TOTAL PAYABLE</Text>
                    <Text style={styles.grandTotalAmount}>
                      Rs. {Math.round(total).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}

              {/* Clean Action Buttons */}
              {hidePrices ? (
                <TouchableOpacity
                  style={[styles.primaryPayBtn, cart.length === 0 && { opacity: 0.5 }]}
                  onPress={sendToKitchen}
                  disabled={cart.length === 0}
                >
                  <Ionicons name="paper-plane" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryPayBtnText}>SEND ORDER TO KITCHEN (F8)</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 8 }}>
                  {/* Secondary Actions Row: Send KOT & Print Unpaid Bill side-by-side */}
                  <View style={styles.secondaryActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.secActionBtn,
                        styles.secActionKot,
                        (cart.length === 0 || (role !== 'admin' && !can('posCanSendKot'))) && { opacity: 0.5 },
                      ]}
                      onPress={sendToKitchen}
                      disabled={cart.length === 0}
                    >
                      <Ionicons name="flame" size={15} color="#B45309" />
                      <Text style={styles.secActionKotText}>Send KOT (F8)</Text>
                    </TouchableOpacity>

                    {(role === 'admin' || can('posCanPrintUnpaidBill')) && (
                      <TouchableOpacity
                        style={[styles.secActionBtn, styles.secActionSlip, cart.length === 0 && { opacity: 0.5 }]}
                        onPress={handlePrintUnpaidBill}
                        disabled={cart.length === 0}
                      >
                        <Ionicons name="print-outline" size={15} color="#475569" />
                        <Text style={styles.secActionSlipText}>Pending Bill</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Primary Checkout Button */}
                  <TouchableOpacity
                    style={[
                      styles.primaryPayBtn,
                      (cart.length === 0 || (role !== 'admin' && !can('posCanSettleBill'))) && { opacity: 0.5 },
                    ]}
                    onPress={openCheckout}
                    disabled={cart.length === 0}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="card" size={18} color="#24050A" />
                      <Text style={styles.primaryPayBtnText}>
                        COLLECT PAYMENT & PRINT BILL
                      </Text>
                    </View>
                    <View style={styles.payBtnF9Badge}>
                      <Text style={styles.payBtnF9Text}>F9</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            </View>
          </View>
        )}

        {/* --------------------------------------------------------
            TAB 3 (RUNNING KDS & PENDING BILLS): FULL-PAGE VIEW WITH PREP TIME & LIVE COUNTDOWN
            -------------------------------------------------------- */}
        {mobileTab === 'running' && (
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                gap: 10,
              }}
            >
              <View>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A' }}>
                  Running Kitchen Orders & Pending Bills ({activeRunningTickets.length} Active{tickets.length > activeRunningTickets.length ? ` • ${tickets.length - activeRunningTickets.length} Dispatched` : ''})
                </Text>
                <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                  Live second-by-second kitchen preparation countdown timer for all active orders
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View style={[styles.modalSearchBox, { minWidth: 240, backgroundColor: '#FFFFFF' }]}>
                  <Ionicons name="search" size={16} color="#94A3B8" />
                  <TextInput
                    style={[styles.modalSearchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    placeholder="Search table, ticket or dish..."
                    value={pendingOrderSearchQuery}
                    onChangeText={setPendingOrderSearchQuery}
                  />
                </View>
                {tickets.length > 0 && (role === 'admin' || can('posCanDismissTicket')) && (
                  <TouchableOpacity
                    style={[styles.filterChip, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', paddingVertical: 9 }]}
                    onPress={handleClearAllOrphanTickets}
                  >
                    <Text style={[styles.filterChipText, { color: '#DC2626' }]}>Clear All Running</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
              {tickets
                .filter((t) => {
                  const q = pendingOrderSearchQuery.toLowerCase().trim();
                  if (!q) return true;
                  return (
                    t.id.toLowerCase().includes(q) ||
                    (t.tableName && t.tableName.toLowerCase().includes(q)) ||
                    t.items.some((i) => i.name.toLowerCase().includes(q))
                  );
                })
                .map((t) => {
                  const tSub = t.items.reduce((s, i) => s + i.price * i.qty, 0);
                  const prepEst = estimateOrderPrepTime(t.items, menuItems, t.timePlaced, nowTick);
                  const isServed = t.status === 'served';
                  const isReady = t.status === 'ready' || isServed;
                  const isOverdue = !isReady && prepEst.remainingSeconds === 0 && prepEst.elapsedSeconds >= prepEst.totalPrepSeconds;

                  return (
                    <View
                      key={t.id}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: isServed ? '#94A3B8' : isReady ? '#22C55E' : isOverdue ? '#EF4444' : '#E2E8F0',
                        padding: 16,
                        gap: 12,
                      }}
                    >
                      {/* Top Row: Table / Order Name + Status + Total Prep & Remaining Countdown */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>
                            {t.tableName || t.tableId?.toUpperCase() || 'TAKEAWAY'}
                          </Text>
                          <View
                            style={{
                              backgroundColor: isServed ? '#E2E8F0' : isReady ? '#DCFCE7' : '#FEF3C7',
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 8,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '900',
                                color: isServed ? '#334155' : isReady ? '#15803D' : '#B45309',
                              }}
                            >
                              {isServed ? 'DISPATCHED / SERVED' : (t.status || 'pending').toUpperCase()}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>
                            Ticket #{t.id.slice(-5)}
                          </Text>
                          {!hidePrices && (
                            <Text style={{ fontSize: 16, fontWeight: '900', color: '#52141C' }}>
                              • Rs. {tSub.toLocaleString()}
                            </Text>
                          )}
                        </View>

                        {/* Action Buttons */}
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            style={[styles.runningActionBtn, { paddingHorizontal: 12, height: 38, flexDirection: 'row', gap: 6 }]}
                            onPress={() => handlePrintPendingSlipForTicket(t)}
                          >
                            <Ionicons name="print-outline" size={16} color="#334155" />
                            <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#334155' }}>Print Slip</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.runningActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', paddingHorizontal: 14, height: 38 }]}
                            onPress={() => handleCreateBillFromTicket(t, false)}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '900', color: '#1D4ED8' }}>Load in Cart</Text>
                          </TouchableOpacity>
                          {!hidePrices && (
                            <TouchableOpacity
                              style={[styles.runningActionBtn, { backgroundColor: '#52141C', borderColor: '#52141C', paddingHorizontal: 16, height: 38 }]}
                              onPress={() => handleCreateBillFromTicket(t, true)}
                            >
                              <Text style={{ fontSize: 13, fontWeight: '900', color: '#F3D179' }}>Settle & Pay Bill</Text>
                            </TouchableOpacity>
                          )}
                          {(role === 'admin' || can('posCanDismissTicket')) && (
                            <TouchableOpacity
                              style={[styles.runningActionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', height: 38, width: 38 }]}
                              onPress={() => handleCancelRunningOrder(t.id)}
                            >
                              <Ionicons name="trash-outline" size={16} color="#DC2626" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* Kitchen Preparation Time & Live Progress Box */}
                      <View
                        style={{
                          backgroundColor: isReady ? '#F0FDF4' : isOverdue ? '#FEF2F2' : '#FFFBEB',
                          borderRadius: 10,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: isReady ? '#BBF7D0' : isOverdue ? '#FECACA' : '#FDE68A',
                          gap: 8,
                        }}
                      >
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons
                              name={isReady ? 'checkmark-circle' : 'stopwatch'}
                              size={20}
                              color={isReady ? '#15803D' : isOverdue ? '#DC2626' : '#B45309'}
                            />
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: '900',
                                color: isReady ? '#15803D' : isOverdue ? '#DC2626' : '#92400E',
                              }}
                            >
                              Total Kitchen Prep Time: {prepEst.totalPrepMins} Mins • Elapsed: {prepEst.elapsedText}
                            </Text>
                          </View>

                          <View
                            style={{
                              backgroundColor: isServed ? '#475569' : isReady ? '#16A34A' : isOverdue ? '#DC2626' : '#D97706',
                              paddingHorizontal: 14,
                              paddingVertical: 6,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Ionicons name={isReady ? 'checkmark-done' : 'timer-outline'} size={16} color="#FFFFFF" />
                            <Text
                              style={{
                                color: '#FFFFFF',
                                fontSize: 14,
                                fontWeight: '900',
                                fontVariant: ['tabular-nums'],
                              }}
                            >
                              {isServed
                                ? 'DISPATCHED FROM KITCHEN'
                                : isReady
                                  ? 'ORDER READY TO SERVE'
                                  : prepEst.remainingSeconds > 0
                                    ? `TIME LEFT: ${prepEst.countdownText}`
                                    : `OVERDUE (${prepEst.elapsedText} ELAPSED)`}
                            </Text>
                          </View>
                        </View>

                        {/* Live Visual Progress Bar */}
                        <View
                          style={{
                            height: 8,
                            backgroundColor: 'rgba(0,0,0,0.08)',
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <View
                            style={{
                              width: `${isReady ? 100 : prepEst.progressPct}%`,
                              height: '100%',
                              backgroundColor: isReady ? '#16A34A' : isOverdue ? '#DC2626' : '#F59E0B',
                            }}
                          />
                        </View>

                        {/* Per-Dish Prep Time Breakdown with Live Second Countdown */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {prepEst.itemBreakdowns.map((b, bIdx) => (
                            <View
                              key={bIdx}
                              style={{
                                backgroundColor: '#FFFFFF',
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                              }}
                            >
                              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#1E293B', fontVariant: ['tabular-nums'] }}>
                                {b.qty}× {b.name}{' '}
                                <Text style={{ color: isReady || b.remainingSecs === 0 ? '#16A34A' : '#B45309', fontWeight: '900' }}>
                                  ({isReady || b.remainingSecs === 0 ? 'Ready' : `${b.countdown} left / ${b.prepMins}m`})
                                </Text>
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  );
                })}

              {tickets.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <Ionicons name="checkmark-done-circle-outline" size={54} color="#CBD5E1" />
                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#475569', marginTop: 10 }}>
                    No Running Kitchen Orders Right Now
                  </Text>
                  <Text style={{ fontSize: 13.5, color: '#94A3B8', marginTop: 4 }}>
                    Orders dispatched via "Send KOT (F8)" will appear here with a live preparation countdown timer.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Floating Bottom Bar on Menu Tab (All Devices) to Jump to Full-Page Cart */}
      {mobileTab === 'menu' && totalCartQty > 0 && (
        <TouchableOpacity
          style={styles.mobileFloatingBar}
          onPress={() => setMobileTab('cart')}
          activeOpacity={0.9}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.mobileFloatingQtyCircle}>
              <Text style={styles.mobileFloatingQtyText}>{totalCartQty}</Text>
            </View>
            <Text style={styles.mobileFloatingLabel}>
              View Cart & Bill ({totalCartQty} {totalCartQty === 1 ? 'Item' : 'Items'} Added)
            </Text>
          </View>
          <Text style={styles.mobileFloatingTotal}>
            {hidePrices ? `Open Cart (${totalCartQty}) ➔` : `Rs. ${Math.round(total).toLocaleString()} • Open Cart ➔`}
          </Text>
        </TouchableOpacity>
      )}

      {/* ========================================================
          MODAL 1: TABLE & CABIN SELECTION
          ======================================================== */}
      <Modal visible={tableModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 820, maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Dining Table or Majlis Cabin</Text>
                <Text style={styles.modalSub}>{filteredModalTables.length} seating units shown</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setTableModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Filters Bar */}
            <View style={styles.tableModalFilters}>
              {/* Floor Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {['All', ...availableFloors].map((fl) => {
                  const active = tableModalFloor.toLowerCase() === fl.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={fl}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setTableModalFloor(fl)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {fl === 'All' ? 'All Floors' : fl}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Search + Status & Seating Type */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <View style={[styles.modalSearchBox, { flex: 1, minWidth: 180 }]}>
                  <Ionicons name="search" size={15} color="#94A3B8" />
                  <TextInput
                    style={[styles.modalSearchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    placeholder="Search table or cabin..."
                    value={tableSearchQuery}
                    onChangeText={setTableSearchQuery}
                  />
                </View>

                {(['all', 'available', 'occupied', 'reserved'] as const).map((st) => {
                  const active = tableModalStatus === st;
                  const count =
                    st === 'all'
                      ? tables.length
                      : st === 'occupied'
                      ? tables.filter((x) => x.status === 'occupied' || x.status === 'billed').length
                      : tables.filter((x) => x.status === st).length;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.filterChip,
                        active && styles.filterChipActive,
                        st === 'reserved' && !active && count > 0 && { borderColor: '#C4B5FD', backgroundColor: '#FAF5FF' },
                      ]}
                      onPress={() => setTableModalStatus(st)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active && styles.filterChipTextActive,
                          st === 'reserved' && !active && count > 0 && { color: '#6D28D9' },
                        ]}
                      >
                        {st.charAt(0).toUpperCase() + st.slice(1)} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.tableGridWrap}>
              {filteredModalTables.map((t) => {
                const isSelected = selectedTableId === t.id;
                const isBusy = t.status === 'occupied' || t.status === 'billed';
                const isReserved = t.status === 'reserved';
                const res = findTableReservation(t, reservations, ['confirmed', 'seated']);
                const isGroup = isGroupReservation(res);
                const primaryTable = t.mergedInto ? tables.find((x) => x.id === t.mergedInto) : undefined;
                const sType = getTableSeatingType(t);
                const tTickets = tickets.filter((tk) => tk.tableId === t.id);
                const runningBill =
                  t.billTotal ||
                  tTickets.reduce(
                    (sum, tk) => sum + tk.items.reduce((s, i) => s + i.price * i.qty, 0),
                    0
                  );

                const onPickTable = () => {
                  if (isReserved && res && res.status === 'confirmed') {
                    const msg = `${t.name} is RESERVED for ${res.customerName} (${res.guestsCount} Guests at ${res.timeSlot}${
                      res.occasion ? ` • ${res.occasion}` : ''
                    }).\n\nCheck-in & seat this ${isGroup ? 'group arrangement' : 'reservation'} now and open order on ${
                      primaryTable ? primaryTable.name : t.name
                    }?`;
                    const proceed = () => {
                      seatReservation(res.id);
                      broadcastImmediately();
                      handleTableSelect(res.tableId || t.id);
                    };
                    if (Platform.OS === 'web') {
                      if (window.confirm(msg)) proceed();
                    } else {
                      Alert.alert('Reserved Table Check-In', msg, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Seat & Open Order', onPress: proceed },
                      ]);
                    }
                    return;
                  }
                  // If tapping a secondary joined table of a seated group, route to the primary table so all items stay on one unified bill
                  handleTableSelect(primaryTable ? primaryTable.id : t.id);
                };

                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.tablePickerCard,
                      isBusy && styles.tablePickerCardBusy,
                      isReserved && { borderColor: '#A855F7', backgroundColor: '#FAF5FF' },
                      isSelected && styles.tablePickerCardSelected,
                    ]}
                    onPress={onPickTable}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <SeatingTypeIcon
                          type={sType}
                          size={16}
                          color={isReserved ? '#7C3AED' : isBusy ? '#DC2626' : '#15803D'}
                        />
                        <Text style={styles.tablePickerName} numberOfLines={1}>{t.name}</Text>
                      </View>
                      <View
                        style={[
                          styles.tableStatusDot,
                          { backgroundColor: isReserved ? '#7C3AED' : isBusy ? '#DC2626' : '#16A34A' },
                        ]}
                      />
                    </View>
                    <Text style={styles.tablePickerMeta}>
                      {getTableFloor(t)} • {t.seats} Seats
                    </Text>
                    {isReserved && res ? (
                      <View style={{ marginTop: 4, gap: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#6D28D9' }} numberOfLines={1}>
                          {isGroup ? `GROUP • ${res.guestsCount}G` : `RESERVED • ${res.guestsCount}G`} • {res.timeSlot}
                        </Text>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#4C1D95' }} numberOfLines={1}>
                          {res.customerName}
                          {primaryTable ? ` (Joined ${primaryTable.name})` : getReservationTableCount(res) > 1 ? ` (${getReservationTableCount(res)} units)` : ''}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.tablePickerStatus,
                          { color: isBusy ? '#DC2626' : '#15803D' },
                        ]}
                        numberOfLines={2}
                      >
                        {primaryTable
                          ? `Joined with ${primaryTable.name}${res && isGroup ? ` (${res.guestsCount}G)` : ''}`
                          : isBusy
                          ? !hidePrices && runningBill > 0
                            ? `${res && isGroup ? `Group ${res.guestsCount}G • ` : ''}Occupied • Rs. ${runningBill.toLocaleString()}`
                            : res && isGroup
                            ? `Seated Group • ${res.guestsCount} Guests`
                            : 'Occupied'
                          : 'Available'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 2: CUSTOMER SELECTION & REGISTRATION
          ======================================================== */}
      <Modal visible={customerModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 540 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customer Profile</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setCustomerModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {isCreatingNewCustomer ? (
              <View style={{ padding: 16, gap: 12 }}>
                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.textInputField}
                  placeholder="Enter customer name"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.textInputField}
                  placeholder="03XX-XXXXXXX"
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                />
                <Text style={styles.inputLabel}>Delivery Address</Text>
                <TextInput
                  style={[styles.textInputField, { height: 70 }]}
                  placeholder="House #, Street, Sector / Area"
                  multiline
                  value={customerAddress}
                  onChangeText={setCustomerAddress}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[styles.modalSecBtn, { flex: 1 }]}
                    onPress={() => setIsCreatingNewCustomer(false)}
                  >
                    <Text style={styles.modalSecBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, { flex: 1 }]}
                    onPress={handleSaveNewCustomer}
                  >
                    <Text style={styles.modalPrimaryBtnText}>Save & Select</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ padding: 16, gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={[styles.modalSearchBox, { flex: 1 }]}>
                    <Ionicons name="search" size={16} color="#94A3B8" />
                    <TextInput
                      style={styles.modalSearchInput}
                      placeholder="Search name or phone..."
                      value={customerSearchQuery}
                      onChangeText={setCustomerSearchQuery}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.modalPrimaryBtn}
                    onPress={() => {
                      setCustomerName('');
                      setCustomerPhone(customerSearchQuery);
                      setCustomerAddress('');
                      setIsCreatingNewCustomer(true);
                    }}
                  >
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                    <Text style={styles.modalPrimaryBtnText}>New</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 340 }}>
                  {customers
                    .filter((c) => {
                      const q = customerSearchQuery.toLowerCase().trim();
                      return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
                    })
                    .map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.custListRow,
                          selectedCustomerId === c.id && styles.custListRowActive,
                        ]}
                        onPress={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerModalVisible(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.custListName}>{c.name}</Text>
                          <Text style={styles.custListPhone}>
                            {c.phone} {c.address ? `• ${c.address}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 3: VARIANT / PORTION SIZE PICKER
          ======================================================== */}
      <Modal visible={!!variantModalItem} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{variantModalItem?.name}</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setVariantModalItem(null)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                Select portion size / variant:
              </Text>
              {(variantModalItem?.variants || []).map((v) => (
                <TouchableOpacity
                  key={v.name}
                  style={styles.variantChoiceBtn}
                  onPress={() => handleVariantSelect(v)}
                >
                  <Text style={styles.variantChoiceName}>{v.name}</Text>
                  {!hidePrices && (
                    <Text style={styles.variantChoicePrice}>Rs. {v.price.toLocaleString()}</Text>
                  )}
                </TouchableOpacity>
              ))}
              <View style={{ marginTop: 6, gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#475569' }}>
                  Optional Cooking Note / Comment for this Dish:
                </Text>
                <TextInput
                  style={styles.textInputField}
                  placeholder="e.g. Less spicy, extra sauce, no onion..."
                  placeholderTextColor="#94A3B8"
                  value={variantNoteDraft}
                  onChangeText={setVariantNoteDraft}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 3B: ITEM-WISE COOKING COMMENT & NOTE EDITOR
          ======================================================== */}
      <Modal visible={!!editingNoteItem} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 520 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Dish Cooking Note / Comment</Text>
                <Text style={styles.modalSub}>{editingNoteItem?.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  setEditingNoteItem(null);
                  setNoteDraft('');
                }}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 12 }}>
              <Text style={styles.inputLabel}>Quick Kitchen & Bar Instructions (Tap to Toggle)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {ITEM_NOTE_PRESETS.map((preset) => {
                  const active = hasCommaNoteToken(noteDraft, preset);
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={{
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: active ? '#52141C' : '#F8FAFC',
                        borderWidth: 1,
                        borderColor: active ? '#52141C' : '#CBD5E1',
                      }}
                      onPress={() => setNoteDraft((prev) => toggleCommaNoteToken(prev, preset))}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: active ? '#F3D179' : '#334155',
                        }}
                      >
                        {active ? `✓ ${preset}` : `+ ${preset}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Custom Instruction for Chef / Barman</Text>
              <TextInput
                style={[styles.textInputField, { minHeight: 60 }]}
                placeholder="Type special cooking instruction for this item..."
                placeholderTextColor="#94A3B8"
                value={noteDraft}
                onChangeText={setNoteDraft}
                multiline
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                {noteDraft.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.modalSecBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                    onPress={() => setNoteDraft('')}
                  >
                    <Text style={[styles.modalSecBtnText, { color: '#DC2626' }]}>Clear Note</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.modalSecBtn}
                  onPress={() => {
                    setEditingNoteItem(null);
                    setNoteDraft('');
                  }}
                >
                  <Text style={styles.modalSecBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPrimaryBtn} onPress={saveItemNote}>
                  <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.modalPrimaryBtnText}>Save Dish Note</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 4: DISCOUNT & PROMO CAMPAIGN PICKER
          ======================================================== */}
      <Modal visible={discountModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply Discount or Promotion</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDiscountModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 14 }}>
              <Text style={styles.inputLabel}>Custom Discount Amount (Rs.)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.textInputField, { flex: 1 }]}
                  keyboardType="numeric"
                  placeholder="0"
                  value={customDiscountInput}
                  onChangeText={setCustomDiscountInput}
                />
                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  onPress={() => {
                    setSelectedEventCampaign(null);
                    setDiscountAmount(String(Math.max(0, parseFloat(customDiscountInput) || 0)));
                    setDiscountModalVisible(false);
                  }}
                >
                  <Text style={styles.modalPrimaryBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Percentage Buttons */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[5, 10, 15, 20].map((pct) => (
                  <TouchableOpacity
                    key={pct}
                    style={[styles.filterChip, { flex: 1, alignItems: 'center' }]}
                    onPress={() => {
                      const amt = Math.round((subTotal * pct) / 100);
                      setSelectedEventCampaign(null);
                      setDiscountAmount(String(amt));
                      setDiscountModalVisible(false);
                    }}
                  >
                    <Text style={styles.filterChipText}>{pct}% Off</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {campaigns.filter((c) => c.status === 'active').length > 0 && (
                <>
                  <Text style={styles.inputLabel}>Active Promotional Campaigns</Text>
                  <ScrollView style={{ maxHeight: 200 }}>
                    {campaigns
                      .filter((c) => c.status === 'active')
                      .map((camp) => (
                        <TouchableOpacity
                          key={camp.id}
                          style={[
                            styles.custListRow,
                            selectedEventCampaign?.id === camp.id && styles.custListRowActive,
                          ]}
                          onPress={() => {
                            setSelectedEventCampaign(camp);
                            setDiscountModalVisible(false);
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.custListName}>{camp.title}</Text>
                            <Text style={styles.custListPhone}>{camp.description || camp.type}</Text>
                          </View>
                          <Ionicons name="pricetag" size={16} color="#059669" />
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </>
              )}

              {discountVal > 0 && (
                <TouchableOpacity
                  style={[styles.modalSecBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}
                  onPress={() => {
                    setSelectedEventCampaign(null);
                    setDiscountAmount('0');
                    setCustomDiscountInput('0');
                    setDiscountModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalSecBtnText, { color: '#DC2626' }]}>Remove Discount</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 5: CLEAN FAST CHECKOUT & PAYMENT SETTLEMENT
          ======================================================== */}
      <Modal visible={checkoutModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 820 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Settle Bill & Print Receipt</Text>
                <Text style={styles.modalSub}>
                  {orderType.toUpperCase()}{' '}
                  {selectedTableObj ? `• ${selectedTableObj.name}` : ''}{' '}
                  {selectedCustomerObj ? `• ${selectedCustomerObj.name}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setCheckoutModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <View style={[styles.checkoutBody, isMobile && { flexDirection: 'column' }]}>
              {/* Left Column: Totals, Payment Method, Denomination Pills */}
              <View style={styles.checkoutLeftCol}>
                {/* Total Banner */}
                <View style={styles.checkoutTotalBanner}>
                  <View>
                    <Text style={styles.checkoutTotalLabel}>NET PAYABLE</Text>
                    <Text style={styles.checkoutTotalItems}>{totalCartQty} items</Text>
                  </View>
                  <Text style={styles.checkoutTotalValue}>
                    Rs. {Math.round(total).toLocaleString()}
                  </Text>
                </View>

                {/* Payment Lines */}
                {payments.map((p, idx) => (
                  <View key={idx} style={styles.paymentLineCard}>
                    <View style={styles.paymentMethodTabs}>
                      {(['cash', 'card', 'online'] as const).map((method) => {
                        const active = p.type === method;
                        return (
                          <TouchableOpacity
                            key={method}
                            style={[styles.payMethodTab, active && styles.payMethodTabActive]}
                            onPress={() => updatePayment(idx, 'type', method)}
                          >
                            <Ionicons
                              name={
                                method === 'cash'
                                  ? 'cash-outline'
                                  : method === 'card'
                                    ? 'card-outline'
                                    : 'phone-portrait-outline'
                              }
                              size={15}
                              color={active ? '#FFFFFF' : '#475569'}
                            />
                            <Text style={[styles.payMethodTabText, active && { color: '#FFFFFF' }]}>
                              {method.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Tendered Rs.</Text>
                      <TextInput
                        style={[styles.textInputField, { flex: 1, fontSize: 18, fontWeight: '900' }]}
                        keyboardType="numeric"
                        value={String(p.amount || '')}
                        onFocus={() => setActivePaymentIndex(idx)}
                        onChangeText={(val) => updatePayment(idx, 'amount', val)}
                      />
                      {payments.length > 1 && (
                        <TouchableOpacity
                          onPress={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                {/* Split Payment Button */}
                {systemSettings.posAllowSplitPayment !== false &&
                  (role === 'admin' || can('posCanSplitPayment')) &&
                  payments.length < 3 && (
                    <TouchableOpacity
                      style={styles.splitPayBtn}
                      onPress={() =>
                        setPayments((prev) => [...prev, { type: 'card', amount: Math.max(0, Math.round(remaining)) }])
                      }
                    >
                      <Ionicons name="git-branch-outline" size={15} color="#52141C" />
                      <Text style={styles.splitPayBtnText}>+ Add Split Payment Method</Text>
                    </TouchableOpacity>
                  )}

                {/* Quick Cash Denominations */}
                <View style={styles.quickCashRow}>
                  <TouchableOpacity style={styles.quickCashPill} onPress={handleSetFullPayment}>
                    <Text style={styles.quickCashText}>Exact ({Math.round(total)})</Text>
                  </TouchableOpacity>
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={styles.quickCashPill}
                      onPress={() => handleSetPaymentAmount(amt)}
                    >
                      <Text style={styles.quickCashText}>Rs. {amt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Change Due / Balance Status */}
                <View
                  style={[
                    styles.changeDueBanner,
                    remaining > 0 ? { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' } : { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                  ]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: remaining > 0 ? '#DC2626' : '#065F46' }}>
                    {remaining > 0 ? 'REMAINING BALANCE DUE' : 'CHANGE TO RETURN'}
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: remaining > 0 ? '#DC2626' : '#059669' }}>
                    Rs. {Math.round(remaining > 0 ? remaining : changeDue).toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Right Column: Touch Keypad + Finalize CTA */}
              <View style={styles.checkoutRightCol}>
                {!isMobile && (
                  <TouchNumericKeypad
                    value={String(payments[activePaymentIndex]?.amount || '')}
                    onChangeText={(nextVal: string) => updatePayment(activePaymentIndex, 'amount', nextVal)}
                    exactAmount={Math.round(total)}
                    compact
                  />
                )}

                <TouchableOpacity
                  style={[styles.confirmSettleBtn, remaining > 0.01 && { opacity: 0.55 }]}
                  onPress={handleFinalizeOrder}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#24050A" />
                  <Text style={styles.confirmSettleBtnText}>
                    CONFIRM & PRINT RECEIPT (ENTER)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 6: RUNNING KDS ORDERS (F6)
          ======================================================== */}
      <Modal visible={pendingOrdersModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 760, maxHeight: '86%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Running Kitchen Orders ({tickets.length})</Text>
                <Text style={styles.modalSub}>Tap any order to load into POS for billing or add-ons</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {tickets.length > 0 && (role === 'admin' || can('posCanDismissTicket')) && (
                  <TouchableOpacity
                    style={[styles.filterChip, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}
                    onPress={handleClearAllOrphanTickets}
                  >
                    <Text style={[styles.filterChipText, { color: '#DC2626' }]}>Clear All</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPendingOrdersModalVisible(false)}>
                  <Ionicons name="close" size={20} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              <View style={styles.modalSearchBox}>
                <Ionicons name="search" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search table, ticket ID, or dish..."
                  value={pendingOrderSearchQuery}
                  onChangeText={setPendingOrderSearchQuery}
                />
              </View>

              <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 10 }}>
                {tickets
                  .filter((t) => {
                    const q = pendingOrderSearchQuery.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      t.id.toLowerCase().includes(q) ||
                      (t.tableName && t.tableName.toLowerCase().includes(q)) ||
                      t.items.some((i) => i.name.toLowerCase().includes(q))
                    );
                  })
                  .map((t) => {
                    const tSub = t.items.reduce((s, i) => s + i.price * i.qty, 0);
                    const prepEst = estimateOrderPrepTime(t.items, menuItems, t.timePlaced, nowTick);
                    const isServed = t.status === 'served';
                    const isReady = t.status === 'ready' || isServed;
                    return (
                      <View key={t.id} style={styles.runningOrderCard}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={styles.runningOrderTitle}>
                              {t.tableName || t.tableId?.toUpperCase() || 'TAKEAWAY'}
                            </Text>
                            <View style={styles.runningStatusPill}>
                              <Text style={styles.runningStatusText}>{isServed ? 'DISPATCHED' : (t.status || 'pending').toUpperCase()}</Text>
                            </View>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                backgroundColor: isServed ? '#F1F5F9' : isReady ? '#DCFCE7' : '#FFFBEB',
                                borderWidth: 1,
                                borderColor: isServed ? '#94A3B8' : isReady ? '#22C55E' : '#F59E0B',
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Ionicons
                                name={isServed ? 'checkmark-done' : 'time-outline'}
                                size={13}
                                color={isServed ? '#334155' : isReady ? '#15803D' : '#B45309'}
                              />
                              <Text
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: '900',
                                  color: isServed ? '#334155' : isReady ? '#15803D' : '#B45309',
                                  fontVariant: ['tabular-nums'],
                                }}
                              >
                                {isServed
                                  ? 'Dispatched from Kitchen'
                                  : isReady
                                    ? 'Ready to Serve!'
                                    : `Prep: ${prepEst.totalPrepMins}m • Time Left: ${prepEst.remainingSeconds > 0 ? prepEst.countdownText : 'Due now'}`}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>#{t.id.slice(-5)}</Text>
                          </View>
                          <Text style={styles.runningOrderItems} numberOfLines={2}>
                            {prepEst.itemBreakdowns.map((b) => `${b.qty}x ${b.name} (${b.prepMins}m)`).join(', ')}
                          </Text>
                          {!hidePrices && (
                            <Text style={styles.runningOrderAmount}>Rs. {tSub.toLocaleString()}</Text>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TouchableOpacity
                            style={styles.runningActionBtn}
                            onPress={() => handlePrintPendingSlipForTicket(t)}
                          >
                            <Ionicons name="print-outline" size={15} color="#475569" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.runningActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                            onPress={() => handleCreateBillFromTicket(t, false)}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1D4ED8' }}>Load</Text>
                          </TouchableOpacity>
                          {!hidePrices && (
                            <TouchableOpacity
                              style={[styles.runningActionBtn, { backgroundColor: '#52141C', borderColor: '#52141C' }]}
                              onPress={() => handleCreateBillFromTicket(t, true)}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#F3D179' }}>Pay Bill</Text>
                            </TouchableOpacity>
                          )}
                          {(role === 'admin' || can('posCanDismissTicket')) && (
                            <TouchableOpacity
                              style={[styles.runningActionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}
                              onPress={() => handleCancelRunningOrder(t.id)}
                            >
                              <Ionicons name="trash-outline" size={15} color="#DC2626" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })}

                {tickets.length === 0 && (
                  <View style={{ alignItems: 'center', padding: 36 }}>
                    <Ionicons name="checkmark-done-circle-outline" size={44} color="#CBD5E1" />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#64748B', marginTop: 8 }}>
                      No active orders in kitchen
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 7: RECENT 8 INVOICES (F10 QUICK REPRINT)
          ======================================================== */}
      <Modal visible={recentInvoicesModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 680 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recent Settled Invoices (Quick Reprint)</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setRecentInvoicesModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 440, padding: 16 }}>
              {recent8Invoices.map((inv) => (
                <View key={inv.id} style={styles.runningOrderCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.runningOrderTitle}>
                      {inv.id} • {inv.tableName || inv.orderType?.toUpperCase()}
                    </Text>
                    <Text style={styles.runningOrderItems}>
                      {new Date(inv.timeSettled || inv.timePlaced).toLocaleTimeString()} •{' '}
                      {(inv.items || []).length} items
                    </Text>
                    {!hidePrices && (
                      <Text style={styles.runningOrderAmount}>Rs. {Math.round(inv.total).toLocaleString()}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, { paddingHorizontal: 14 }]}
                    onPress={() => printInvoiceReceipt(inv)}
                  >
                    <Ionicons name="print-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.modalPrimaryBtnText}>Reprint</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {recent8Invoices.length === 0 && (
                <Text style={{ textAlign: 'center', color: '#64748B', padding: 24 }}>
                  No recent invoices found.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 8: POST-PAYMENT TABLE RELEASE DECISION
          ======================================================== */}
      <Modal visible={!!tableDecisionModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 440, padding: 20, gap: 14 }]}>
            <Text style={styles.modalTitle}>Bill Settled for {tableDecisionModal?.tableName}</Text>
            <Text style={{ fontSize: 13.5, color: '#475569' }}>
              Would you like to release {tableDecisionModal?.tableName} and mark it Available now, or keep it occupied?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.modalSecBtn, { flex: 1 }]}
                onPress={() => setTableDecisionModal(null)}
              >
                <Text style={styles.modalSecBtnText}>Keep Occupied</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { flex: 1, backgroundColor: '#16A34A' }]}
                onPress={() => {
                  if (tableDecisionModal?.tableId) {
                    settleBill(tableDecisionModal.tableId);
                  }
                  setTableDecisionModal(null);
                }}
              >
                <Text style={styles.modalPrimaryBtnText}>Release Table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 8B: CANCEL PUNCHED ORDER WITH REASON (DAILY AUDIT)
          ======================================================== */}
      <Modal
        visible={!!cancelOrderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelOrderModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 500, overflow: 'hidden' }]}>
            <View
              style={[
                styles.modalHeader,
                { backgroundColor: '#FEF2F2', borderBottomColor: '#FECACA' },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#FEE2E2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="warning" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: '#991B1B' }]} numberOfLines={1}>
                    {cancelOrderModal?.title || 'Cancel Punched Order'}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: '#B91C1C', fontWeight: '600' }} numberOfLines={1}>
                    {cancelOrderModal?.subtitle}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setCancelOrderModal(null)}
              >
                <Ionicons name="close" size={20} color="#991B1B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {/* Itemized Preview of Punched Dishes Being Cancelled */}
              {cancelOrderModal && cancelOrderModal.items.length > 0 && (
                <View
                  style={{
                    backgroundColor: '#FFF7ED',
                    borderWidth: 1,
                    borderColor: '#FED7AA',
                    borderRadius: 10,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: '#9A3412', letterSpacing: 0.5 }}>
                      PUNCHED ITEMS TO CANCEL ({cancelOrderModal.items.reduce((s, i) => s + Number(i.qty || 1), 0)} QTY)
                    </Text>
                    <Text style={{ fontSize: 13.5, fontWeight: '900', color: '#DC2626' }}>
                      Rs. {cancelOrderModal.totalAmount.toLocaleString()}
                    </Text>
                  </View>
                  {cancelOrderModal.items.slice(0, 10).map((it, idx) => (
                    <View
                      key={`${it.id}-${idx}`}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: 4,
                        borderTopWidth: idx === 0 ? 1 : 0,
                        borderTopColor: '#FFEDD5',
                      }}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#1E293B', flex: 1 }} numberOfLines={1}>
                        {it.qty}x {it.name}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#475569' }}>
                        Rs. {(Number(it.price || 0) * Number(it.qty || 1)).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                  {cancelOrderModal.items.length > 10 && (
                    <Text style={{ fontSize: 11, color: '#9A3412', fontWeight: '700' }}>
                      +{cancelOrderModal.items.length - 10} more item(s)
                    </Text>
                  )}
                </View>
              )}

              {/* Quick Reason Chips */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#334155', letterSpacing: 0.4 }}>
                  SELECT QUICK REASON (REQUIRED FOR DAILY REPORT)
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {CANCEL_REASON_PRESETS.map((preset) => {
                    const active = cancelReasonDraft.trim().toLowerCase() === preset.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={preset}
                        onPress={() => setCancelReasonDraft(preset)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? '#DC2626' : '#CBD5E1',
                          backgroundColor: active ? '#FEE2E2' : '#F8FAFC',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: '700',
                            color: active ? '#991B1B' : '#334155',
                          }}
                        >
                          {preset}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Custom Reason Note Input */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#334155' }}>
                  CANCELLATION REASON / DETAILS *
                </Text>
                <TextInput
                  value={cancelReasonDraft}
                  onChangeText={setCancelReasonDraft}
                  placeholder="Write exact reason why this punched order is being cancelled..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  style={{
                    borderWidth: 1.5,
                    borderColor: cancelReasonDraft.trim() ? '#DC2626' : '#CBD5E1',
                    borderRadius: 10,
                    padding: 11,
                    fontSize: 13,
                    color: '#0F172A',
                    backgroundColor: '#FFFFFF',
                    minHeight: 74,
                    textAlignVertical: 'top',
                  }}
                />
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  This cancellation, full dish breakdown, PKR total, and your name ({user?.name || 'Staff'}) will be saved in System Logs & Daily Reports and sent as an alert to Cashier/Management.
                </Text>
              </View>
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                padding: 14,
                borderTopWidth: 1,
                borderTopColor: '#E2E8F0',
                backgroundColor: '#F8FAFC',
              }}
            >
              <TouchableOpacity
                style={[styles.modalSecBtn, { flex: 1 }]}
                onPress={() => setCancelOrderModal(null)}
              >
                <Text style={styles.modalSecBtnText}>Keep Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalPrimaryBtn,
                  {
                    flex: 1.4,
                    backgroundColor: cancelReasonDraft.trim() ? '#DC2626' : '#FCA5A5',
                  },
                ]}
                onPress={handleConfirmCancelPunchedOrder}
              >
                <Text style={styles.modalPrimaryBtnText}>Confirm Cancel & Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 9: KEYBOARD SHORTCUTS (F11)
          ======================================================== */}
      <Modal visible={shortcutsModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 460 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>POS Keyboard Shortcuts</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShortcutsModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              {[
                ['F1 / Ctrl+K', 'Focus Dish Search'],
                ['F2', 'Switch to Dine-In & Select Table'],
                ['F3', 'Switch to Takeaway'],
                ['F4', 'Switch to Delivery'],
                ['F6', 'Open Running Kitchen Orders'],
                ['F7', 'Apply Discount / Promotion'],
                ['F8', 'Send KOT to Kitchen & Print Pending Slip'],
                ['F9 / Ctrl+Enter', 'Collect Payment & Checkout'],
                ['F10', 'Recent 8 Invoices (Quick Reprint)'],
                ['F12', 'Clear Current Order Cart'],
              ].map(([key, desc]) => (
                <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#334155', fontWeight: '600' }}>{desc}</Text>
                  <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#52141C' }}>{key}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {generatedInvoice && (
        <Modal visible={!!generatedInvoice} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: 440, padding: 16 }]}>
              <InvoiceComponent invoice={generatedInvoice} />
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { marginTop: 12 }]}
                onPress={() => setGeneratedInvoice(null)}
              >
                <Text style={styles.modalPrimaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  /* 1. TOP COMMAND BAR */
  topBar: {
    height: 54,
    backgroundColor: '#24050A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 175, 55, 0.3)',
    gap: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandText: {
    color: '#F3D179',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  topOrderTypeGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 9,
    padding: 3,
    gap: 3,
    marginLeft: 6,
  },
  topOrderTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  topOrderTypeBtnActive: {
    backgroundColor: '#D4AF37',
  },
  topOrderTypeText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  topOrderTypeTextActive: {
    color: '#24050A',
    fontWeight: '900',
  },
  topOrderKey: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginLeft: 2,
  },
  topSearchWrap: {
    flex: 1,
    maxWidth: 400,
    height: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 7,
  },
  topSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  topActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  topActionBtnHighlight: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: '#F59E0B',
  },
  topActionText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  topCountBadge: {
    backgroundColor: '#D4AF37',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  topCountBadgeText: {
    color: '#24050A',
    fontSize: 11,
    fontWeight: '900',
  },
  topShiftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  shiftGreenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  topShiftText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
  },

  /* FULL-PAGE MODE SWITCHER */
  mobileTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
  mobileTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  mobileTabBtnActive: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
  },
  mobileTabText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  mobileTabTextActive: {
    color: '#F3D179',
    fontWeight: '900',
  },

  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toastBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },

  /* 2. WORKSPACE */
  workspace: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },

  /* LEFT CATEGORY RAIL */
  categoryRail: {
    width: 265,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  categoryRailMobile: {
    width: '100%',
    height: 62,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  categoryRailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  categoryRailTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    letterSpacing: 0.8,
  },
  categoryRailCount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#52141C',
    backgroundColor: '#FDF2F4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryRailScroll: {
    padding: 10,
    gap: 8,
  },
  categoryRailScrollMobile: {
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
    gap: 10,
  },
  categoryItemMobile: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    height: 44,
  },
  categoryItemActive: {
    backgroundColor: '#52141C',
  },
  categoryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#FDF2F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconBoxActive: {
    backgroundColor: '#D4AF37',
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  categoryNameActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  categoryBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryBadgeActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.25)',
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
  },
  categoryBadgeTextActive: {
    color: '#F3D179',
  },

  /* CENTER DISH CATALOG */
  catalogPane: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  catalogFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  activeCatTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  activeCatCountPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeCatCountText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  cuisinePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cuisinePill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cuisinePillActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  cuisinePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  cuisinePillTextActive: {
    color: '#F3D179',
  },

  dishGridContent: {
    padding: 12,
  },
  dishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dishRow: {
    gap: 10,
    marginBottom: 10,
  },
  dishCard: {
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  dishCardActive: {
    borderColor: '#52141C',
    backgroundColor: '#FFFDF9',
  },
  dishImgBox: {
    height: 92,
    backgroundColor: '#1E080C',
    position: 'relative',
  },
  dishImg: {
    width: '100%',
    height: '100%',
  },
  dishImgFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishPriceTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dishPriceTagActive: {
    backgroundColor: '#D4AF37',
  },
  dishPriceTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  dishQtyBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#52141C',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  dishQtyBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '900',
  },
  soldOutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  dishBody: {
    padding: 10,
    justifyContent: 'space-between',
    flex: 1,
    gap: 6,
  },
  dishTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  dishFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dishMetaWrap: {
    flex: 1,
    marginRight: 6,
  },
  dishCategoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  dishPriceText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#52141C',
    marginTop: 2,
  },
  dishAddIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishAddIconActive: {
    backgroundColor: '#52141C',
  },
  emptyCatalogBox: {
    width: '100%',
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCatalogTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#475569',
    marginTop: 10,
  },
  emptyCatalogSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },

  /* RIGHT ORDER TICKET PANEL */
  ticketPanel: {
    width: 390,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    display: 'flex',
    flexDirection: 'column',
  },
  mobileOrderTypeRow: {
    flexDirection: 'row',
    padding: 8,
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mobileOrderTypeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
  },
  mobileOrderTypeBtnActive: {
    backgroundColor: '#52141C',
  },
  mobileOrderTypeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  mobileOrderTypeTextActive: {
    color: '#F3D179',
  },
  ticketContextCard: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contextSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  contextIconOrb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextSmallLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  contextMainValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  contextActionPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  contextActionPillText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#52141C',
  },
  releaseTableIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  ticketItemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  ticketItemsHeaderTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  clearCartLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearCartLinkText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },

  ticketItemsScroll: {
    flex: 1,
  },
  ticketItemsContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  emptyTicketBox: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTicketTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 8,
  },
  emptyTicketSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
    maxWidth: 220,
  },

  /* SPACIOUS FULL-PAGE TICKET ITEM ROW */
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  ticketRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ticketRowIndex: {
    fontSize: 14,
    fontWeight: '900',
    color: '#64748B',
    width: 24,
  },
  ticketRowName: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  ticketRowUnit: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  ticketRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  qtyBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnPlus: {
    backgroundColor: '#52141C',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  qtyValText: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  ticketRowSubtotal: {
    minWidth: 80,
    textAlign: 'right',
    fontSize: 15.5,
    fontWeight: '900',
    color: '#52141C',
  },
  removeRowBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* FOOTER & TOTALS */
  ticketFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  summaryBox: {
    gap: 4,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '800',
  },
  promoMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  promoMiniBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  grandTotalAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#52141C',
  },

  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
  },
  secActionKot: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  secActionKotText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#B45309',
  },
  secActionSlip: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  secActionSlipText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  primaryPayBtn: {
    height: 46,
    borderRadius: 10,
    backgroundColor: '#D4AF37',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  primaryPayBtnText: {
    color: '#24050A',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  payBtnF9Badge: {
    backgroundColor: 'rgba(36, 5, 10, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  payBtnF9Text: {
    color: '#24050A',
    fontSize: 11,
    fontWeight: '900',
  },

  /* MOBILE FLOATING CART BAR */
  mobileFloatingBar: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#24050A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
  },
  mobileFloatingQtyCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileFloatingQtyText: {
    color: '#24050A',
    fontSize: 13,
    fontWeight: '900',
  },
  mobileFloatingLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  mobileFloatingTotal: {
    color: '#F3D179',
    fontSize: 15,
    fontWeight: '900',
  },

  /* MODALS */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableModalFilters: {
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  modalSearchBox: {
    height: 38,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  tableGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 14,
    gap: 10,
  },
  tablePickerCard: {
    width: '31.5%',
    minWidth: 160,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    gap: 4,
  },
  tablePickerCardBusy: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  tablePickerCardSelected: {
    borderColor: '#52141C',
    borderWidth: 2,
  },
  tablePickerName: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  tableStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  tablePickerMeta: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  tablePickerStatus: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  textInputField: {
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  modalPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#52141C',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalSecBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
  },
  modalSecBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
  },
  custListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  custListRowActive: {
    backgroundColor: '#FDF2F4',
  },
  custListName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  custListPhone: {
    fontSize: 12,
    color: '#64748B',
  },
  variantChoiceBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  variantChoiceName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  variantChoicePrice: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#52141C',
  },
  checkoutBody: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  checkoutLeftCol: {
    flex: 1.2,
    gap: 12,
  },
  checkoutRightCol: {
    flex: 1,
    gap: 12,
    justifyContent: 'space-between',
  },
  checkoutTotalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#24050A',
    padding: 14,
    borderRadius: 12,
  },
  checkoutTotalLabel: {
    color: '#F3D179',
    fontSize: 11,
    fontWeight: '800',
  },
  checkoutTotalItems: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  checkoutTotalValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  paymentLineCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paymentMethodTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  payMethodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  payMethodTabActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  payMethodTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  splitPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#52141C',
  },
  splitPayBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#52141C',
  },
  quickCashRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickCashPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickCashText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  changeDueBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  confirmSettleBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#D4AF37',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmSettleBtnText: {
    color: '#24050A',
    fontSize: 14,
    fontWeight: '900',
  },
  runningOrderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  runningOrderTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  runningStatusPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  runningStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
  },
  runningOrderItems: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2,
  },
  runningOrderAmount: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#52141C',
    marginTop: 2,
  },
  runningActionBtn: {
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
