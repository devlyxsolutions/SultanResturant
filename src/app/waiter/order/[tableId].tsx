import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { printInvoiceReceipt } from '../../../components/Invoice';
import SeatingTypeIcon from '../../../components/SeatingTypeIcon';
import SyncStatusBadge from '../../../components/SyncStatusBadge';
import { getTableFloor, getTableSeatingType } from '../../../constants/floors';
import { broadcastImmediately } from '../../../services/syncService';
import {
  Invoice,
  MenuItem,
  Table,
  useAuthStore,
  useOpsStore,
  useRestaurantStore,
} from '../../../store';
import { useSettingsStore } from '../../../store/settingsStore';
import { resolveMenuImageUri } from '../../../utils/menuImage';
import { doesOrderBelongToUser, isOrderTakerUser } from '../../../utils/orderTakerScope';

const ITEM_NOTE_GROUPS: { label: string; presets: string[] }[] = [
  {
    label: 'Spice & Flavor',
    presets: ['Extra Spicy', 'Medium Spicy', 'Less Spicy', 'Mild / Kids', 'Less Oil', 'Low Salt', 'Extra Gravy', 'Extra Ginger'],
  },
  {
    label: 'Kitchen Prep',
    presets: ['No Onion', 'No Garlic', 'Well Done', 'Extra Crispy', 'Extra Cheese', 'Extra Raita', 'Separate Sauce'],
  },
  {
    label: 'Drinks & Cold',
    presets: ['No Ice', 'Less Ice', 'Less Sugar', 'No Sugar', 'Chilled'],
  },
];

const VARIANT_QUICK_NOTES = ['Extra Spicy', 'Less Spicy', 'Less Oil', 'No Onion', 'Well Done'];

const ORDER_NOTE_PRESETS = [
  'Serve All Together',
  'Starters First',
  'VIP Guest',
  'Separate Plates',
  'Birthday / Event',
  'Kids at Table',
  'Pack Leftovers',
  'Hot & Fresh',
];

function toggleCommaNoteToken(current: string, token: string): string {
  const tokens = current
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const exists = tokens.some((t) => t.toLowerCase() === token.toLowerCase());
  if (exists) {
    return tokens.filter((t) => t.toLowerCase() !== token.toLowerCase()).join(', ');
  }
  return [...tokens, token].join(', ');
}

function hasCommaNoteToken(current: string, token: string): boolean {
  return current
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .includes(token.toLowerCase());
}

function getCategoryIcon(catName: string): keyof typeof Ionicons.glyphMap {
  const c = (catName || '').toLowerCase().trim();
  if (c === 'all') return 'apps';
  if (c.includes('appetizer') || c.includes('starter') || c.includes('snack') || c.includes('fries')) return 'fast-food-outline';
  if (c.includes('main') || c.includes('karahi') || c.includes('handi') || c.includes('curry')) return 'flame-outline';
  if (c.includes('bbq') || c.includes('grill') || c.includes('kebab') || c.includes('tikka')) return 'bonfire-outline';
  if (c.includes('dessert') || c.includes('sweet') || c.includes('kunafa') || c.includes('ice')) return 'ice-cream-outline';
  if (c.includes('drink') || c.includes('beverage') || c.includes('juice') || c.includes('shake') || c.includes('tea')) return 'wine-outline';
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
  { bg: '#ECFDF5', border: '#10B981', text: '#065F46', iconBg: '#D1FAE5', iconColor: '#059669', activeBg: '#047857' },
  { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E', iconBg: '#FEF3C7', iconColor: '#D97706', activeBg: '#B45309' },
  { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF', iconBg: '#DBEAFE', iconColor: '#2563EB', activeBg: '#1D4ED8' },
  { bg: '#FDF2F8', border: '#EC4899', text: '#9D174D', iconBg: '#FCE7F3', iconColor: '#DB2777', activeBg: '#BE185D' },
  { bg: '#F5F3FF', border: '#8B5CF6', text: '#5B21B6', iconBg: '#EDE9FE', iconColor: '#7C3AED', activeBg: '#6D28D9' },
  { bg: '#FFF7ED', border: '#F97316', text: '#9A3412', iconBg: '#FFEDD5', iconColor: '#EA580C', activeBg: '#C2410C' },
  { bg: '#F0FDFA', border: '#14B8A6', text: '#115E59', iconBg: '#CCFBF1', iconColor: '#0D9488', activeBg: '#0F766E' },
  { bg: '#EEF2FF', border: '#6366F1', text: '#3730A3', iconBg: '#E0E7FF', iconColor: '#4F46E5', activeBg: '#4338CA' },
  { bg: '#FEF2F2', border: '#EF4444', text: '#991B1B', iconBg: '#FEE2E2', iconColor: '#DC2626', activeBg: '#B91C1C' },
  { bg: '#FAF5FF', border: '#A855F7', text: '#6B21A8', iconBg: '#F3E8FF', iconColor: '#9333EA', activeBg: '#7E22CE' },
];

function getCategoryTheme(catName: string, index: number) {
  let hash = index;
  for (let i = 0; i < catName.length; i++) {
    hash = (hash * 31 + catName.charCodeAt(i)) % CATEGORY_COLOR_PALETTE.length;
  }
  return CATEGORY_COLOR_PALETTE[Math.abs(hash) % CATEGORY_COLOR_PALETTE.length];
}

function getDefaultItemPrepMins(name: string, category?: string, explicitPrep?: number): number {
  if (typeof explicitPrep === 'number' && explicitPrep > 0) return explicitPrep;
  const c = `${name} ${category || ''}`.toLowerCase();
  if (c.includes('mandi') || c.includes('sajji') || c.includes('dumpukht') || c.includes('platter')) return 25;
  if (c.includes('karahi') || c.includes('handi') || c.includes('bbq') || c.includes('tikka') || c.includes('kebab') || c.includes('steak')) return 22;
  if (c.includes('pizza') || c.includes('biryani') || c.includes('pulao') || c.includes('pasta') || c.includes('chinese')) return 18;
  if (c.includes('burger') || c.includes('sandwich') || c.includes('wrap') || c.includes('roll') || c.includes('soup') || c.includes('appetizer')) return 14;
  if (c.includes('bakery') || c.includes('dessert') || c.includes('kunafa') || c.includes('salad') || c.includes('brunch')) return 10;
  if (c.includes('drink') || c.includes('beverage') || c.includes('mocktail') || c.includes('shake') || c.includes('coffee') || c.includes('juice') || c.includes('tea')) return 6;
  return 15;
}

function formatCountdownMMSS(totalSeconds: number): string {
  const safeSecs = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function estimateOrderPrepTime(
  items: { name: string; qty: number; category?: string; prepTimeMin?: number }[],
  menuLookup?: MenuItem[]
): { totalMins: number; maxItemName: string; itemBreakdown: { name: string; qty: number; mins: number }[] } {
  if (!items || items.length === 0) return { totalMins: 0, maxItemName: '', itemBreakdown: [] };
  let maxMins = 0;
  let maxItemName = '';
  let totalPortions = 0;
  const itemBreakdown: { name: string; qty: number; mins: number }[] = [];

  items.forEach((it) => {
    const matched = menuLookup?.find((m) => m.name === it.name || it.name.startsWith(m.name));
    const baseMins = getDefaultItemPrepMins(
      it.name,
      it.category || matched?.category,
      it.prepTimeMin ?? matched?.prepTimeMin
    );
    const itemTotal = baseMins + Math.max(0, (it.qty - 1) * 2);
    itemBreakdown.push({ name: it.name, qty: it.qty, mins: itemTotal });
    totalPortions += it.qty;
    if (itemTotal > maxMins) {
      maxMins = itemTotal;
      maxItemName = it.name;
    }
  });

  const batchBuffer = Math.min(12, Math.floor(Math.max(0, totalPortions - 2) * 1.5));
  return {
    totalMins: maxMins + batchBuffer,
    maxItemName,
    itemBreakdown,
  };
}

export default function TableOrderScreen() {
  const { tableId } = useLocalSearchParams();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = (width > height && width >= 700) || width >= 1000;
  const isTablet = width >= 600 && width < 1200;
  const isMobile = !isLandscape;
  const numCols = isLandscape
    ? (width < 1100 ? 3 : 4)
    : (width < 500 ? 2 : 3);
  const dishCardWidth = isLandscape
    ? (width < 1100 ? '31.5%' : '23.5%')
    : (width < 480 ? '48%' : '31.5%');

  const [mobileTab, setMobileTab] = useState<'menu' | 'cart' | 'running'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Cart & Customizations
  const [newCart, setNewCart] = useState<{ item: MenuItem; qty: number; notes?: string }[]>([]);

  // Fast O(1) in-cart lookup map to eliminate scroll lag
  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of newCart) {
      const baseId = c.item.id.includes('-') ? c.item.id.split('-')[0] : c.item.id;
      map[baseId] = (map[baseId] || 0) + c.qty;
      map[c.item.id] = (map[c.item.id] || 0) + c.qty;
    }
    return map;
  }, [newCart]);
  const [variantModalItem, setVariantModalItem] = useState<MenuItem | null>(null);
  const [variantNoteDraft, setVariantNoteDraft] = useState('');
  const [editingNoteItem, setEditingNoteItem] = useState<{ item: MenuItem; notes?: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [isRushOrder, setIsRushOrder] = useState(false);

  // Table Operations Modals
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [runningItemsModalVisible, setRunningItemsModalVisible] = useState(false);
  const [customerBillModalVisible, setCustomerBillModalVisible] = useState(false);
  const [waiterPayMethod, setWaiterPayMethod] = useState<'cash' | 'card' | 'online'>('cash');
  const [waiterTenderedInput, setWaiterTenderedInput] = useState('');
  const [waiterPayNote, setWaiterPayNote] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Only tick frequently when running tickets view or modal is active to prevent order screen lag
    const intervalMs = (mobileTab === 'running' || runningItemsModalVisible) ? 1000 : 15000;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [mobileTab, runningItemsModalVisible]);

  // Store bindings
  const tables = useRestaurantStore((state) => state.tables) || [];
  const tickets = useRestaurantStore((state) => state.tickets) || [];
  const staff = useRestaurantStore((state) => state.staff) || [];
  const menuItems = useRestaurantStore((state) => state.menuItems) || [];
  const storeCategories = useRestaurantStore((state) => state.categories) || [];
  const regions = useRestaurantStore((state) => state.regions) || [];
  const placeOrder = useRestaurantStore((state) => state.placeOrder);
  const serveTableTickets = useRestaurantStore((state) => state.serveTableTickets);
  const markItemServed = useRestaurantStore((state) => state.markItemServed);
  const transferTable = useRestaurantStore((state) => state.transferTable);
  const markTableBilled = useRestaurantStore((state) => state.markTableBilled);
  const recordWaiterPaymentCollection = useRestaurantStore((state) => state.recordWaiterPaymentCollection);
  const cancelWaiterPaymentCollection = useRestaurantStore((state) => state.cancelWaiterPaymentCollection);
  const updateTable = useRestaurantStore((state) => state.updateTable);
  const systemSettings = useSettingsStore((state) => state.settings);

  const unavailableIds = useOpsStore((state) => state.unavailableItemIds) || [];
  const unavailableSet = useMemo(() => new Set(unavailableIds), [unavailableIds]);
  const user = useAuthStore((state) => state.user);
  const currentStaff = staff.find(
    (s) =>
      (user?.staffId && s.id === user.staffId) ||
      (user?.name && s.name.trim().toLowerCase() === user.name.trim().toLowerCase())
  );
  const isOrderTaker = isOrderTakerUser(user, currentStaff);

  const isTakeaway = tableId === 'takeaway';
  const table = tables.find((t) => t.id === tableId);
  const tableName = isTakeaway ? 'Takeaway / Counter' : table ? table.name : `Table ${tableId}`;
  const seatingType = table ? getTableSeatingType(table) : 'tables';
  const floorName = isTakeaway ? 'Express Counter' : table ? getTableFloor(table) : 'Ground Floor';

  const activeTickets = tickets.filter((t) => {
    if (t.tableId !== tableId) return false;
    if (isOrderTaker) {
      return doesOrderBelongToUser({ server: t.server, serverId: t.serverId }, user, staff);
    }
    return true;
  });
  const isExistingOrderActive = activeTickets.length > 0 || table?.status === 'occupied' || table?.status === 'billed';

  const alreadyOrderedItems = useMemo(() => {
    const list: {
      id: string;
      name: string;
      price: number;
      qty: number;
      notes?: string;
      status: 'pending' | 'cooking' | 'ready' | 'served';
      ticketId: string;
      timePlaced: number;
      roundNumber?: number;
      station?: 'main' | 'juice';
    }[] = [];

    if (activeTickets.length > 0) {
      activeTickets.forEach((ticket) => {
        (ticket.items || []).forEach((it) => {
          const itemStation = (it.station || 'main') as 'main' | 'juice';
          const stationStatus = ticket.stationStatuses?.[itemStation];
          const itemEffectiveStatus: 'pending' | 'cooking' | 'ready' | 'served' = it.itemStatus
            ? it.itemStatus
            : ticket.status === 'served' || (it.completed && stationStatus === 'served')
              ? 'served'
              : stationStatus === 'ready' || it.completed || ticket.status === 'ready'
                ? 'ready'
                : stationStatus === 'cooking' || ticket.status === 'cooking'
                  ? 'cooking'
                  : 'pending';

          list.push({
            id: it.id,
            name: it.name,
            price: it.price,
            qty: it.qty,
            notes: it.notes,
            status: itemEffectiveStatus,
            station: itemStation,
            ticketId: ticket.id,
            timePlaced: ticket.timePlaced,
            roundNumber: ticket.roundNumber,
          });
        });
      });
    } else if (
      table &&
      table.orders &&
      table.orders.length > 0 &&
      (!isOrderTaker || doesOrderBelongToUser({ server: table.server, serverId: table.serverId }, user, staff))
    ) {
      table.orders.forEach((it) => {
        list.push({
          id: it.id,
          name: it.name,
          price: it.price,
          qty: it.qty,
          notes: it.notes,
          status: 'served',
          ticketId: 'ORDER-SAVED',
          timePlaced: Date.now(),
        });
      });
    }
    return list;
  }, [activeTickets, table, isOrderTaker, user, staff]);

  const categoryList = useMemo(() => {
    const set = new Set<string>();
    (storeCategories || []).forEach((c) => {
      if (c && c !== 'All' && c !== 'ALL') set.add(c);
    });
    menuItems.forEach((m) => {
      if (m.category && m.category !== 'All' && m.category !== 'ALL') set.add(m.category);
    });
    return Array.from(set);
  }, [storeCategories, menuItems]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: menuItems.length };
    menuItems.forEach((m) => {
      if (m.category) {
        counts[m.category] = (counts[m.category] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems]);

  const filteredCategories = useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) return categoryList;
    return categoryList.filter((c) => c.toLowerCase().includes(q));
  }, [categoryList, categorySearchQuery]);

  const cartPrepEstimate = useMemo(() => {
    return estimateOrderPrepTime(
      newCart.map((c) => ({
        name: c.item.name,
        qty: c.qty,
        category: c.item.category,
        prepTimeMin: c.item.prepTimeMin,
      })),
      menuItems
    );
  }, [newCart, menuItems]);

  const runningPrepEstimate = useMemo(() => {
    return estimateOrderPrepTime(
      alreadyOrderedItems.map((it) => ({
        name: it.name,
        qty: it.qty,
      })),
      menuItems
    );
  }, [alreadyOrderedItems, menuItems]);

  const availableTransferTables = useMemo(
    () => tables.filter((t) => t.id !== tableId && t.status === 'available'),
    [tables, tableId]
  );

  const getItemStockStatus = (item: MenuItem) => {
    if (unavailableSet.has(item.id)) return { isSoldOut: true };
    if (item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0) return { isSoldOut: true };
    return { isSoldOut: false };
  };

  const addToCart = (item: MenuItem) => {
    if (getItemStockStatus(item).isSoldOut) {
      const msg = `"${item.name}" is currently Sold Out in the kitchen.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Item Unavailable', msg);
      return;
    }
    if (item.variants && item.variants.length > 0) {
      setVariantNoteDraft('');
      setVariantModalItem(item);
      return;
    }
    setNewCart((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        return prev.map((i) => (i.item.id === item.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const handleVariantSelect = (variant: { name: string; price: number }) => {
    if (!variantModalItem) return;
    const variantId = `${variantModalItem.id}-${variant.name}`;
    const variantName = `${variantModalItem.name} (${variant.name})`;
    const cleanNote = variantNoteDraft.trim() || undefined;
    const variantItem: MenuItem = {
      ...variantModalItem,
      id: variantId,
      name: variantName,
      price: variant.price,
    };
    setNewCart((prev) => {
      const existing = prev.find((i) => i.item.id === variantId);
      if (existing) {
        const mergedNote = cleanNote
          ? Array.from(new Set([existing.notes, cleanNote].filter(Boolean))).join(', ')
          : existing.notes;
        return prev.map((i) => (i.item.id === variantId ? { ...i, qty: i.qty + 1, notes: mergedNote } : i));
      }
      return [...prev, { item: variantItem, qty: 1, notes: cleanNote }];
    });
    setVariantNoteDraft('');
    setVariantModalItem(null);
  };

  const updateCartQty = (itemId: string, delta: number) => {
    setNewCart((prev) =>
      prev
        .map((i) => (i.item.id === itemId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeFromCart = (itemId: string) => {
    setNewCart((prev) => prev.filter((i) => i.item.id !== itemId));
  };

  const openNoteModal = (cartItem: { item: MenuItem; notes?: string }) => {
    setEditingNoteItem(cartItem);
    setNoteDraft(cartItem.notes || '');
  };

  const saveItemNote = () => {
    if (!editingNoteItem) return;
    setNewCart((prev) =>
      prev.map((i) =>
        i.item.id === editingNoteItem.item.id ? { ...i, notes: noteDraft.trim() || undefined } : i
      )
    );
    setEditingNoteItem(null);
    setNoteDraft('');
  };

  const appendNotePreset = (preset: string) => {
    setNoteDraft((prev) => toggleCommaNoteToken(prev, preset));
  };

  const toggleOrderNotePreset = (preset: string) => {
    setOrderNotes((prev) => toggleCommaNoteToken(prev, preset));
  };

  const filteredItems = useMemo(() => {
    return menuItems.filter((i) => {
      if (activeCategory !== 'ALL' && activeCategory !== 'All') {
        if ((i.category || '').toLowerCase() !== activeCategory.toLowerCase()) return false;
      }
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        if ((i.region || '').toLowerCase() !== activeRegion.toLowerCase()) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchName = i.name.toLowerCase().includes(query);
        const matchCat = i.category ? i.category.toLowerCase().includes(query) : false;
        if (!matchName && !matchCat) return false;
      }
      return true;
    });
  }, [menuItems, activeCategory, activeRegion, searchQuery]);

  const alreadyOrderedTotal = alreadyOrderedItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const newCartTotal = newCart.reduce((sum, c) => sum + c.item.price * c.qty, 0);
  const totalBillSoFar = (table?.billTotal || alreadyOrderedTotal) + newCartTotal;
  const totalNewQty = newCart.reduce((s, c) => s + c.qty, 0);

  const handleSendToKitchen = () => {
    if (newCart.length === 0) return;

    const roundNum = activeTickets.length + 1;
    const isAddOn = isExistingOrderActive || activeTickets.length > 0;
    const kotItems = newCart.map((c) => ({
      item: c.item,
      qty: c.qty,
      notes: c.notes?.trim() || undefined,
    }));

    const combinedOrderNote = [
      isRushOrder ? 'RUSH PRIORITY' : '',
      orderNotes.trim(),
    ]
      .filter(Boolean)
      .join(' • ') || undefined;

    const orderServerName =
      table && table.status !== 'available' && table.server
        ? table.server
        : currentStaff?.name || user?.name || 'Order Taker';
    const orderServerId =
      table && table.status !== 'available' && table.serverId
        ? table.serverId
        : currentStaff?.id || user?.staffId || user?.id;

    placeOrder(
      tableId as string,
      orderServerName,
      kotItems,
      isAddOn,
      orderServerId,
      combinedOrderNote
    );

    if (table && table.status !== 'occupied') {
      updateTable(table.id, {
        status: 'occupied',
        occupiedSince: table.occupiedSince || Date.now(),
        server: orderServerName,
        serverId: orderServerId,
        billTotal: totalBillSoFar,
      });
    } else if (table) {
      updateTable(table.id, {
        server: orderServerName,
        serverId: orderServerId,
        billTotal: totalBillSoFar,
      });
    }

    broadcastImmediately();
    setNewCart([]);
    setOrderNotes('');
    setIsRushOrder(false);

    const successMsg = `Round #${roundNum} sent to Kitchen KDS and Juice Bar!`;
    if (Platform.OS === 'web') {
      window.alert(successMsg);
      router.replace('/waiter');
    } else {
      Alert.alert('KOT Dispatched', successMsg, [{ text: 'OK', onPress: () => router.replace('/waiter') }]);
    }
  };

  const handleTransferTable = (targetTable: Table) => {
    if (!table) return;
    transferTable(table.id, targetTable.id);
    broadcastImmediately();
    setTransferModalVisible(false);
    router.replace(`/waiter/order/${targetTable.id}`);
  };

  const handleRequestBill = () => {
    if (!table) return;
    const allItems = alreadyOrderedItems.map((it) => ({
      id: it.id,
      name: it.name,
      price: it.price,
      qty: it.qty,
      completed: true,
    }));
    const subTotal = allItems.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = systemSettings.taxEnabled ? Math.round(subTotal * ((systemSettings.taxRatePercent || 0) / 100)) : 0;
    const service = systemSettings.serviceChargeEnabled
      ? Math.round(subTotal * ((systemSettings.serviceChargePercent || 0) / 100))
      : 0;
    const total = subTotal + tax + service;
    setWaiterTenderedInput(String(total));
    setCustomerBillModalVisible(true);
  };

  // Consolidated Customer Bill Items & Totals (for showing bill to customer & collecting payment)
  const consolidatedOrderedItems = useMemo(() => {
    const map = new Map<string, { id: string; name: string; price: number; qty: number; notes?: string }>();
    alreadyOrderedItems.forEach((it) => {
      const existing = map.get(it.id);
      if (existing) {
        existing.qty += it.qty;
      } else {
        map.set(it.id, { id: it.id, name: it.name, price: it.price, qty: it.qty, notes: it.notes });
      }
    });
    return Array.from(map.values());
  }, [alreadyOrderedItems]);

  const billSubTotal = useMemo(
    () => consolidatedOrderedItems.reduce((s, i) => s + i.price * i.qty, 0),
    [consolidatedOrderedItems]
  );
  const billTax = useMemo(
    () => (systemSettings.taxEnabled ? Math.round(billSubTotal * ((systemSettings.taxRatePercent || 0) / 100)) : 0),
    [billSubTotal, systemSettings.taxEnabled, systemSettings.taxRatePercent]
  );
  const billServiceCharge = useMemo(
    () =>
      systemSettings.serviceChargeEnabled
        ? Math.round(billSubTotal * ((systemSettings.serviceChargePercent || 0) / 100))
        : 0,
    [billSubTotal, systemSettings.serviceChargeEnabled, systemSettings.serviceChargePercent]
  );
  const billGrandTotal = useMemo(() => billSubTotal + billTax + billServiceCharge, [billSubTotal, billTax, billServiceCharge]);
  const billTendered = parseFloat(waiterTenderedInput) || billGrandTotal;
  const billChangeDue = Math.max(0, billTendered - billGrandTotal);

  const openCustomerBillModal = () => {
    setWaiterTenderedInput(String(billGrandTotal));
    setCustomerBillModalVisible(true);
  };

  const handleConfirmWaiterPaymentCollected = () => {
    if (!table || consolidatedOrderedItems.length === 0) return;
    const waiterName = currentStaff?.name || user?.name || table.server || 'Order Taker';
    const waiterId = currentStaff?.id || user?.staffId || user?.id || table.serverId;
    const collectedAmt = parseFloat(waiterTenderedInput) || billGrandTotal;
    if (collectedAmt < billGrandTotal) {
      const msg = `Collected amount (Rs. ${collectedAmt.toLocaleString()}) cannot be less than Bill Total (Rs. ${billGrandTotal.toLocaleString()}).`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Incomplete Amount', msg);
      return;
    }

    recordWaiterPaymentCollection({
      tableId: table.id,
      tableName: table.name,
      floor: floorName,
      collectedByWaiter: waiterName,
      collectedByWaiterId: waiterId,
      subTotal: billSubTotal,
      tax: billTax,
      serviceCharge: billServiceCharge,
      totalAmount: billGrandTotal,
      tenderedAmount: collectedAmt,
      changeReturned: Math.max(0, collectedAmt - billGrandTotal),
      paymentMethod: waiterPayMethod,
      notes: waiterPayNote.trim() || undefined,
    });
    broadcastImmediately();
    setCustomerBillModalVisible(false);
    const okMsg = `Payment of Rs. ${billGrandTotal.toLocaleString()} (${waiterPayMethod.toUpperCase()}) recorded under ${waiterName}!\n\nCashier has been notified. This order will stay PENDING in your name until you hand over the cash/payment to the Cashier.`;
    if (Platform.OS === 'web') window.alert(okMsg);
    else Alert.alert('Payment Recorded — Pending Cashier Handover', okMsg);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: '#24050A' }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* ========================================================
          1. CLEAN TOP COMMAND HEADER
          ======================================================== */}
      <View style={[styles.topBar, isMobile && { paddingHorizontal: 10 }]}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/waiter')}>
            <Ionicons name="arrow-back" size={18} color="#F3D179" />
          </TouchableOpacity>
          <View style={styles.tableBadge}>
            <SeatingTypeIcon type={seatingType} size={16} color="#F3D179" />
            <View>
              <Text style={styles.tableTitle}>{tableName}</Text>
              <Text style={styles.tableSub}>{floorName}</Text>
            </View>
          </View>
        </View>

        {/* Center Search */}
        <View style={[styles.topSearchWrap, isMobile && { flex: 1 }]}>
          <Ionicons name="search" size={15} color="#94A3B8" />
          <TextInput
            style={[styles.topSearchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            placeholder="Search dishes..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Right Actions */}
        <View style={styles.topBarRight}>
          {table && alreadyOrderedItems.length > 0 && (
            <TouchableOpacity
              style={[
                styles.topActionBtn,
                {
                  backgroundColor: table.waiterPaymentCollection?.status === 'pending_cashier' ? '#F59E0B' : '#16A34A',
                  borderColor: table.waiterPaymentCollection?.status === 'pending_cashier' ? '#FDE68A' : '#4ADE80',
                },
              ]}
              onPress={openCustomerBillModal}
            >
              <Ionicons
                name={table.waiterPaymentCollection?.status === 'pending_cashier' ? 'time' : 'receipt'}
                size={15}
                color="#FFFFFF"
              />
              <Text style={[styles.topActionText, { color: '#FFFFFF', fontWeight: '900' }]}>
                {table.waiterPaymentCollection?.status === 'pending_cashier'
                  ? `Pending Cashier (Rs. ${table.waiterPaymentCollection.totalAmount.toLocaleString()})`
                  : `Show Bill / Collect (Rs. ${billGrandTotal.toLocaleString()})`}
              </Text>
            </TouchableOpacity>
          )}

          {alreadyOrderedItems.length > 0 && (
            <TouchableOpacity
              style={styles.topActionBtn}
              onPress={() => setRunningItemsModalVisible(true)}
            >
              <Ionicons name="flame" size={15} color="#F59E0B" />
              {!isMobile && <Text style={styles.topActionText}>Running</Text>}
              <View style={styles.topCountBadge}>
                <Text style={styles.topCountBadgeText}>{alreadyOrderedItems.length}</Text>
              </View>
            </TouchableOpacity>
          )}

          {table && isExistingOrderActive && (
            <TouchableOpacity
              style={styles.topActionBtn}
              onPress={() => setTransferModalVisible(true)}
            >
              <Ionicons name="swap-horizontal" size={15} color="#F3D179" />
              {!isMobile && <Text style={styles.topActionText}>Transfer</Text>}
            </TouchableOpacity>
          )}

          <SyncStatusBadge compact />
        </View>
      </View>

      {/* 2. Top Options Bar: 1. Order / Menu Dishes | 2. Current Cart & KOT | 3. Running KDS */}
      <View style={styles.mobileTabBar}>
        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'menu' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('menu')}
          activeOpacity={0.85}
        >
          <Ionicons name="restaurant" size={16} color={mobileTab === 'menu' ? '#F3D179' : '#475569'} />
          <Text style={[styles.mobileTabText, mobileTab === 'menu' && styles.mobileTabTextActive]}>
            1. Order / Menu Dishes ({filteredItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'cart' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('cart')}
          activeOpacity={0.85}
        >
          <Ionicons name="cart" size={16} color={mobileTab === 'cart' ? '#F3D179' : '#475569'} />
          <Text style={[styles.mobileTabText, mobileTab === 'cart' && styles.mobileTabTextActive]}>
            2. Current Cart & KOT ({totalNewQty}{cartPrepEstimate.totalMins > 0 ? ` • ~${cartPrepEstimate.totalMins}m` : ''})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'running' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('running')}
          activeOpacity={0.85}
        >
          <Ionicons name="flame" size={16} color={mobileTab === 'running' ? '#F3D179' : '#EA580C'} />
          <Text style={[styles.mobileTabText, mobileTab === 'running' && styles.mobileTabTextActive]}>
            3. Running KDS & Prep Time ({alreadyOrderedItems.length}{runningPrepEstimate.totalMins > 0 ? ` • ~${runningPrepEstimate.totalMins}m` : ''})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================
          3. WORKSPACE: DUAL-PANE (LANDSCAPE) / TABBED (PORTRAIT)
          ======================================================== */}
      <View style={[styles.workspace, (!isLandscape || mobileTab !== 'menu') && { flexDirection: 'column' }]}>
        {/* LEFT: Category Rail (Menu Tab) */}
        {mobileTab === 'menu' && (
          <View style={[styles.categoryRail, isLandscape ? { width: width < 1000 ? 175 : width < 1250 ? 195 : 220 } : styles.categoryRailMobile]}>
            {isLandscape && (
              <View style={styles.categoryRailHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={styles.categoryRailTitle}>CATEGORIES</Text>
                  <Text style={styles.categoryRailCount}>{categoryList.length + 1}</Text>
                </View>
                <View style={styles.categorySearchWrap}>
                  <Ionicons name="search" size={15} color="#64748B" />
                  <TextInput
                    style={[styles.categorySearchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
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
              contentContainerStyle={!isLandscape ? styles.categoryRailScrollMobile : styles.categoryRailScroll}
            >
              {(() => {
                const isAll = activeCategory === 'ALL' || activeCategory === 'All';
                return (
                  <TouchableOpacity
                    style={[
                      styles.categoryItem,
                      isMobile && styles.categoryItemMobile,
                      {
                        backgroundColor: isAll ? '#52141C' : '#FFFDF9',
                        borderColor: isAll ? '#D4AF37' : '#D4AF37',
                        borderWidth: 1.5,
                        borderLeftWidth: 5,
                      },
                    ]}
                    onPress={() => setActiveCategory('ALL')}
                  >
                    <View style={[styles.categoryIconBox, isAll && styles.categoryIconBoxActive]}>
                      <Ionicons name="apps" size={18} color={isAll ? '#24050A' : '#52141C'} />
                    </View>
                    <Text style={[styles.categoryName, isAll && styles.categoryNameActive]} numberOfLines={2}>
                      All Dishes
                    </Text>
                    <View style={[styles.categoryBadge, isAll && styles.categoryBadgeActive]}>
                      <Text style={[styles.categoryBadgeText, isAll && styles.categoryBadgeTextActive]}>
                        {menuItems.length}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}

              {filteredCategories.map((cat, idx) => {
                const isActive = activeCategory.toLowerCase() === cat.toLowerCase();
                const count = categoryCounts[cat] || 0;
                const theme = getCategoryTheme(cat, idx);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryItem,
                      isMobile && styles.categoryItemMobile,
                      {
                        backgroundColor: isActive ? theme.activeBg : theme.bg,
                        borderColor: theme.border,
                        borderWidth: 1.5,
                        borderLeftWidth: 5,
                      },
                    ]}
                    onPress={() => setActiveCategory(cat)}
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
                        color={isActive ? theme.activeBg : theme.iconColor}
                      />
                    </View>
                    <Text
                      style={[
                        styles.categoryName,
                        { color: isActive ? '#FFFFFF' : theme.text, fontWeight: isActive ? '900' : '800' },
                      ]}
                      numberOfLines={2}
                    >
                      {cat}
                    </Text>
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: isActive ? 'rgba(255,255,255,0.24)' : '#FFFFFF' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryBadgeText,
                          { color: isActive ? '#FFFFFF' : theme.text },
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

        {/* RIGHT / MAIN: Dish Grid (Menu Tab) */}
        {mobileTab === 'menu' && (
          <View style={styles.catalogPane}>
            <View style={styles.catalogFilterBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.activeCatTitle}>
                  {activeCategory === 'ALL' ? 'All Menu Dishes' : activeCategory}
                </Text>
                <View style={styles.activeCatCountPill}>
                  <Text style={styles.activeCatCountText}>{filteredItems.length} items</Text>
                </View>
              </View>
              {regions.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cuisinePillsRow}>
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

            <FlatList
              key={`waiter-grid-${numCols}`}
              data={filteredItems}
              keyExtractor={(item) => item.id}
              numColumns={numCols}
              columnWrapperStyle={numCols > 1 ? styles.dishRow : undefined}
              contentContainerStyle={[styles.dishGridContent, isMobile && totalNewQty > 0 && { paddingBottom: 90 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              renderItem={({ item }) => {
                const inCartQty = cartQtyMap[item.id] || 0;
                const isInCart = inCartQty > 0;
                const isSoldOut = getItemStockStatus(item).isSoldOut;
                const imageUri = resolveMenuImageUri(item);
                const hasVariants = Boolean(item.variants && item.variants.length > 0);

                return (
                  <TouchableOpacity
                    style={[
                      styles.dishCard,
                      { flex: 1 / numCols },
                      isInCart && styles.dishCardActive,
                      isSoldOut && { opacity: 0.55 },
                    ]}
                    onPress={() => addToCart(item)}
                    activeOpacity={0.78}
                    disabled={isSoldOut}
                  >
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
                          <Ionicons name="restaurant-outline" size={26} color="#D4AF37" />
                        </View>
                      )}

                      {isInCart && (
                        <View style={styles.dishQtyBadge}>
                          <Text style={styles.dishQtyBadgeText}>{inCartQty}×</Text>
                        </View>
                      )}

                      {isSoldOut && (
                        <View style={styles.soldOutOverlay}>
                          <Text style={styles.soldOutOverlayText}>SOLD OUT</Text>
                        </View>
                      )}
                    </View>

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
                          <Ionicons name="add" size={16} color={isInCart ? '#FFFFFF' : '#52141C'} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* TAB 2: CART / KOT TICKET PANEL */}
        {mobileTab === 'cart' && (
          <View style={[styles.ticketPanel, { width: '100%', flex: 1, borderLeftWidth: 0 }]}>
            {/* Top Bar inside Cart: Back to Menu */}
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
                margin: 12,
                marginBottom: 6,
              }}
              onPress={() => setMobileTab('menu')}
            >
              <Ionicons name="arrow-back" size={18} color="#52141C" />
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#52141C' }}>
                + Add More Dishes (Menu)
              </Text>
            </TouchableOpacity>

            <View style={styles.ticketItemsHeader}>
              <Text style={styles.ticketItemsHeaderTitle}>
                NEW KOT ITEMS ({totalNewQty})
              </Text>
              {newCart.length > 0 && (
                <TouchableOpacity style={styles.clearCartLink} onPress={() => setNewCart([])}>
                  <Ionicons name="trash-outline" size={13} color="#DC2626" />
                  <Text style={styles.clearCartLinkText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={styles.ticketItemsScroll}
              contentContainerStyle={styles.ticketItemsContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {newCart.length === 0 ? (
                <View style={styles.emptyTicketBox}>
                  <Ionicons name="restaurant-outline" size={38} color="#CBD5E1" />
                  <Text style={styles.emptyTicketTitle}>No New Dishes Selected</Text>
                  <Text style={styles.emptyTicketSub}>
                    Tap dishes on the menu grid to build a KOT for {tableName}
                  </Text>
                </View>
              ) : (
                <>
                  {newCart.map((c, idx) => (
                    <View key={c.item.id} style={styles.ticketRow}>
                      <View style={styles.ticketRowLeft}>
                        <Text style={styles.ticketRowIndex}>{idx + 1}.</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.ticketRowName} numberOfLines={1}>
                            {c.item.name}
                          </Text>
                          <TouchableOpacity
                            style={[styles.itemNotePillBtn, c.notes && styles.itemNotePillBtnFilled]}
                            onPress={() => openNoteModal(c)}
                            activeOpacity={0.75}
                          >
                            <Ionicons
                              name={c.notes ? 'chatbubble-ellipses' : 'create-outline'}
                              size={12}
                              color={c.notes ? '#92400E' : '#B45309'}
                            />
                            <Text
                              style={[styles.itemNotePillText, c.notes && styles.itemNotePillTextFilled]}
                              numberOfLines={2}
                            >
                              {c.notes ? `${c.notes}  •  Edit` : 'Add Item Note / Comment'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.ticketRowRight}>
                        <View style={styles.qtyStepper}>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => updateCartQty(c.item.id, -1)}>
                            <Ionicons name="remove" size={13} color="#1E293B" />
                          </TouchableOpacity>
                          <Text style={styles.qtyValText}>{c.qty}</Text>
                          <TouchableOpacity
                            style={[styles.qtyBtn, styles.qtyBtnPlus]}
                            onPress={() => updateCartQty(c.item.id, 1)}
                          >
                            <Ionicons name="add" size={13} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => removeFromCart(c.item.id)}>
                          <Ionicons name="close" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  {/* Overall Order Notes & Special Kitchen Comments Section */}
                  <View style={styles.overallNotesCard}>
                    <View style={styles.overallNotesHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <View style={styles.overallNotesIconBox}>
                          <Ionicons name="chatbox-ellipses-outline" size={15} color="#52141C" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.overallNotesTitle}>Overall Order Notes & Comments</Text>
                          <Text style={styles.overallNotesSub}>
                            Applies to entire KOT on Kitchen & Juice Bar KDS
                          </Text>
                        </View>
                      </View>
                      {orderNotes.trim().length > 0 && (
                        <TouchableOpacity
                          style={styles.overallNotesClearBtn}
                          onPress={() => setOrderNotes('')}
                        >
                          <Text style={styles.overallNotesClearText}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.overallNotesChipsRow}>
                      {ORDER_NOTE_PRESETS.map((preset) => {
                        const active = hasCommaNoteToken(orderNotes, preset);
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={[styles.overallPresetChip, active && styles.overallPresetChipActive]}
                            onPress={() => toggleOrderNotePreset(preset)}
                            activeOpacity={0.78}
                          >
                            <Text style={[styles.overallPresetChipText, active && styles.overallPresetChipTextActive]}>
                              {active ? `✓ ${preset}` : `+ ${preset}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <TextInput
                      style={styles.overallNotesInput}
                      placeholder="Write overall order comments (e.g. Serve starters first, make all Karahi medium spicy, VIP table)..."
                      placeholderTextColor="#94A3B8"
                      value={orderNotes}
                      onChangeText={setOrderNotes}
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </>
              )}
            </ScrollView>

            {/* Footer Controls */}
            <View style={styles.ticketFooter}>
              {newCart.length > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FFFBEB',
                    borderWidth: 1.5,
                    borderColor: '#F59E0B',
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        backgroundColor: '#FEF3C7',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="timer-outline" size={20} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#92400E' }}>
                        ⏱️ EST. KITCHEN PREP TIME
                      </Text>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#B45309' }} numberOfLines={1}>
                        Longest Dish: {cartPrepEstimate.maxItemName} • {totalNewQty} Portions
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      backgroundColor: '#D97706',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>
                      ~{cartPrepEstimate.totalMins} Mins
                    </Text>
                  </View>
                </View>
              )}

              {/* Notes Summary Indicator before Punch */}
              {newCart.length > 0 && (orderNotes.trim().length > 0 || newCart.some((c) => !!c.notes)) && (
                <View style={styles.footerNotesSummary}>
                  <Ionicons name="chatbubble-ellipses" size={14} color="#92400E" />
                  <Text style={styles.footerNotesSummaryText} numberOfLines={1}>
                    {[
                      newCart.filter((c) => !!c.notes).length > 0
                        ? `${newCart.filter((c) => !!c.notes).length} item note(s)`
                        : '',
                      orderNotes.trim() ? `Order Note: ${orderNotes.trim()}` : '',
                    ]
                      .filter(Boolean)
                      .join('  •  ')}
                  </Text>
                </View>
              )}

              {/* Rush Order Toggle */}
              <TouchableOpacity
                style={[styles.rushToggleBtn, isRushOrder && styles.rushToggleBtnActive]}
                onPress={() => setIsRushOrder((prev) => !prev)}
              >
                <Ionicons name="flash" size={15} color={isRushOrder ? '#DC2626' : '#64748B'} />
                <Text style={[styles.rushToggleText, isRushOrder && { color: '#DC2626', fontWeight: '900' }]}>
                  {isRushOrder ? 'RUSH / PRIORITY ORDER ACTIVE' : 'Mark as Rush / Priority Order'}
                </Text>
              </TouchableOpacity>

              {alreadyOrderedItems.length > 0 && (
                <View style={styles.secondaryActionsRow}>
                  <TouchableOpacity
                    style={[styles.secActionBtn, styles.secActionKot]}
                    onPress={() => setMobileTab('running')}
                  >
                    <Ionicons name="list" size={15} color="#B45309" />
                    <Text style={styles.secActionKotText}>
                      Running KDS ({alreadyOrderedItems.length} • ~{runningPrepEstimate.totalMins}m)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.secActionBtn,
                      styles.secActionSlip,
                      {
                        backgroundColor: table?.waiterPaymentCollection?.status === 'pending_cashier' ? '#FEF3C7' : '#ECFDF5',
                        borderColor: table?.waiterPaymentCollection?.status === 'pending_cashier' ? '#F59E0B' : '#10B981',
                      },
                    ]}
                    onPress={openCustomerBillModal}
                  >
                    <Ionicons
                      name={table?.waiterPaymentCollection?.status === 'pending_cashier' ? 'time' : 'cash-outline'}
                      size={15}
                      color={table?.waiterPaymentCollection?.status === 'pending_cashier' ? '#B45309' : '#047857'}
                    />
                    <Text
                      style={[
                        styles.secActionSlipText,
                        { color: table?.waiterPaymentCollection?.status === 'pending_cashier' ? '#92400E' : '#065F46' },
                      ]}
                    >
                      {table?.waiterPaymentCollection?.status === 'pending_cashier'
                        ? `Collected Rs. ${table.waiterPaymentCollection.totalAmount.toLocaleString()} (Pending Cashier)`
                        : `Show Bill & Collect (Rs. ${billGrandTotal.toLocaleString()})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryPayBtn, newCart.length === 0 && { opacity: 0.5 }]}
                onPress={handleSendToKitchen}
                disabled={newCart.length === 0}
              >
                <Ionicons name="paper-plane" size={18} color="#24050A" />
                <Text style={styles.primaryPayBtnText}>
                  PUNCH ORDER TO KITCHEN ({totalNewQty} ITEMS • ~{cartPrepEstimate.totalMins} MIN PREP)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB 3: FULL-PAGE RUNNING KDS & PREP TIME */}
        {mobileTab === 'running' && (
          <View style={[styles.ticketPanel, { width: '100%', flex: 1, borderLeftWidth: 0, padding: 16 }]}>
            {(() => {
              const earliestPlaced =
                alreadyOrderedItems.length > 0
                  ? Math.min(...alreadyOrderedItems.map((i) => i.timePlaced || now))
                  : now;
              const totalPrepSecs = runningPrepEstimate.totalMins * 60;
              const elapsedSecs = Math.max(0, Math.floor((now - earliestPlaced) / 1000));
              const remainingSecs = Math.max(0, totalPrepSecs - elapsedSecs);
              const allReady =
                alreadyOrderedItems.length > 0 &&
                alreadyOrderedItems.every((i) => i.status === 'ready' || i.status === 'served');
              return (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: allReady ? '#F0FDF4' : '#FFFBEB',
                    borderWidth: 1.5,
                    borderColor: allReady ? '#22C55E' : '#F59E0B',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 14,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: allReady ? '#15803D' : '#92400E' }}>
                      🔥 Running Kitchen KDS Orders on {tableName}
                    </Text>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: allReady ? '#15803D' : '#B45309', marginTop: 2 }}>
                      Total Kitchen Prep Time: {runningPrepEstimate.totalMins} Minutes • Elapsed: {formatCountdownMMSS(elapsedSecs)}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: allReady ? '#16A34A' : '#D97706',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
                      {allReady
                        ? 'ORDER READY TO SERVE'
                        : remainingSecs > 0
                          ? `⏱️ TIME LEFT: ${formatCountdownMMSS(remainingSecs)}`
                          : '⏱️ DUE NOW'}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {activeTickets.some((tk) => !!tk.notes) && (
              <View style={styles.runningOrderNotesWrap}>
                {activeTickets
                  .filter((tk) => !!tk.notes)
                  .map((tk) => (
                    <View key={`note-${tk.id}`} style={styles.runningOrderNoteBanner}>
                      <Ionicons name="chatbox-ellipses" size={15} color="#92400E" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.runningOrderNoteLabel}>
                          ORDER COMMENT (ROUND #{tk.roundNumber || 1})
                        </Text>
                        <Text style={styles.runningOrderNoteText}>{tk.notes}</Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}

            <ScrollView style={{ flex: 1 }}>
              {alreadyOrderedItems.length === 0 ? (
                <View style={styles.emptyTicketBox}>
                  <Ionicons name="flame-outline" size={42} color="#CBD5E1" />
                  <Text style={styles.emptyTicketTitle}>No Running KDS Dishes on {tableName}</Text>
                  <Text style={styles.emptyTicketSub}>
                    Punch an order to KDS to track live preparation time for each dish.
                  </Text>
                </View>
              ) : (
                alreadyOrderedItems.map((it, idx) => {
                  const matched = menuItems.find((m) => m.name === it.name || it.name.startsWith(m.name));
                  const dishMins =
                    getDefaultItemPrepMins(it.name, matched?.category, matched?.prepTimeMin) +
                    Math.max(0, (it.qty - 1) * 2);
                  const elapsedSecs = Math.max(0, Math.floor((now - (it.timePlaced || now)) / 1000));
                  const remainingSecs = Math.max(0, dishMins * 60 - elapsedSecs);
                  return (
                    <View key={`${it.ticketId}-${it.id}-${idx}`} style={styles.runningOrderCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.runningOrderTitle}>
                          {it.qty}× {it.name}
                        </Text>
                        <Text style={[styles.runningOrderItems, { fontVariant: ['tabular-nums'] }]}>
                          Status: {it.status.toUpperCase()} • Prep: {dishMins}m (
                          {it.status === 'ready' || it.status === 'served'
                            ? 'Ready'
                            : remainingSecs > 0
                              ? `Time Left: ${formatCountdownMMSS(remainingSecs)}`
                              : 'Finalizing'}
                          )
                        </Text>
                        {it.notes ? (
                          <View style={styles.runningItemNoteBadge}>
                            <Ionicons name="pencil" size={11} color="#92400E" />
                            <Text style={styles.runningItemNoteText}>{it.notes}</Text>
                          </View>
                        ) : null}
                      </View>
                      {it.status === 'ready' && (
                        <TouchableOpacity
                          style={[styles.modalPrimaryBtn, { backgroundColor: '#16A34A', height: 34 }]}
                          onPress={() => {
                            markItemServed(it.ticketId, it.id);
                            broadcastImmediately();
                          }}
                        >
                          <Text style={styles.modalPrimaryBtnText}>Mark Served</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Floating Bottom Bar on Menu Tab */}
      {mobileTab === 'menu' && totalNewQty > 0 && (
        <TouchableOpacity
          style={styles.mobileFloatingBar}
          onPress={() => setMobileTab('cart')}
          activeOpacity={0.9}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.mobileFloatingQtyCircle}>
              <Text style={styles.mobileFloatingQtyText}>{totalNewQty}</Text>
            </View>
            <Text style={styles.mobileFloatingLabel}>View Cart & Send to Kitchen</Text>
          </View>
          <Text style={styles.mobileFloatingTotal}>{totalNewQty} Portions • Open Cart ➔</Text>
        </TouchableOpacity>
      )}

      {/* Variant Picker Modal (with optional special cooking note) */}
      <Modal visible={!!variantModalItem} transparent animationType="fade" onRequestClose={() => setVariantModalItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 450 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>{variantModalItem?.name}</Text>
                <Text style={{ fontSize: 11.5, color: '#64748B', fontWeight: '600', marginTop: 1 }}>
                  Optional: add cooking comment, then tap portion size
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setVariantModalItem(null)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <View style={{ gap: 6 }}>
                <Text style={styles.noteGroupTitle}>SPECIAL NOTE FOR THIS DISH (OPTIONAL)</Text>
                <TextInput
                  style={styles.textInputField}
                  placeholder="e.g. Make slightly spicy, extra ginger, less oil..."
                  placeholderTextColor="#94A3B8"
                  value={variantNoteDraft}
                  onChangeText={setVariantNoteDraft}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {VARIANT_QUICK_NOTES.map((preset) => {
                    const active = hasCommaNoteToken(variantNoteDraft, preset);
                    return (
                      <TouchableOpacity
                        key={preset}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                        onPress={() => setVariantNoteDraft((prev) => toggleCommaNoteToken(prev, preset))}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                          {active ? `✓ ${preset}` : preset}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.noteGroupTitle}>SELECT PORTION / SIZE</Text>
                {(variantModalItem?.variants || []).map((v) => (
                  <TouchableOpacity
                    key={v.name}
                    style={styles.variantChoiceBtn}
                    onPress={() => handleVariantSelect(v)}
                  >
                    <View>
                      <Text style={styles.variantChoiceName}>{v.name}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309', marginTop: 2 }}>
                        Rs. {v.price.toLocaleString()}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color="#52141C" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Item-Wise Kitchen Note / Comment Modal */}
      <Modal visible={!!editingNoteItem} transparent animationType="fade" onRequestClose={() => setEditingNoteItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 500, maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  Item Note: {editingNoteItem?.item.name}
                </Text>
                <Text style={{ fontSize: 11.5, color: '#64748B', fontWeight: '600', marginTop: 1 }}>
                  Printed on KOT & highlighted on Kitchen / Juice Bar KDS
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setEditingNoteItem(null)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.noteMultiInput}
                placeholder="Type special cooking instructions (e.g. Make Karahi slightly spicy, extra ginger, less oil)..."
                placeholderTextColor="#94A3B8"
                value={noteDraft}
                onChangeText={setNoteDraft}
                multiline
                numberOfLines={3}
                autoFocus
              />

              {ITEM_NOTE_GROUPS.map((grp) => (
                <View key={grp.label} style={{ gap: 6 }}>
                  <Text style={styles.noteGroupTitle}>{grp.label}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {grp.presets.map((preset) => {
                      const active = hasCommaNoteToken(noteDraft, preset);
                      return (
                        <TouchableOpacity
                          key={preset}
                          style={[styles.filterChip, active && styles.filterChipActive]}
                          onPress={() => appendNotePreset(preset)}
                        >
                          <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                            {active ? `✓ ${preset}` : preset}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.noteModalFooter}>
              <TouchableOpacity
                style={styles.noteModalClearBtn}
                onPress={() => setNoteDraft('')}
              >
                <Text style={styles.noteModalClearText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalPrimaryBtn, { flex: 1 }]} onPress={saveItemNote}>
                <Ionicons name="checkmark-circle" size={16} color="#F3D179" />
                <Text style={[styles.modalPrimaryBtnText, { color: '#F3D179' }]}>Save Item Comment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Running Items on Table Modal */}
      <Modal visible={runningItemsModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 540 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Running Kitchen Items on {tableName} ({alreadyOrderedItems.length})
              </Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setRunningItemsModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400, padding: 16 }}>
              {activeTickets
                .filter((tk) => !!tk.notes)
                .map((tk) => (
                  <View key={`m-note-${tk.id}`} style={[styles.runningOrderNoteBanner, { marginBottom: 10 }]}>
                    <Ionicons name="chatbox-ellipses" size={15} color="#92400E" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.runningOrderNoteLabel}>
                        ORDER COMMENT (ROUND #{tk.roundNumber || 1})
                      </Text>
                      <Text style={styles.runningOrderNoteText}>{tk.notes}</Text>
                    </View>
                  </View>
                ))}
              {alreadyOrderedItems.map((it, idx) => (
                <View key={`${it.ticketId}-${it.id}-${idx}`} style={styles.runningOrderCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.runningOrderTitle}>
                      {it.qty}× {it.name}
                    </Text>
                    <Text style={styles.runningOrderItems}>
                      Status: {it.status.toUpperCase()}
                    </Text>
                    {it.notes ? (
                      <View style={styles.runningItemNoteBadge}>
                        <Ionicons name="pencil" size={11} color="#92400E" />
                        <Text style={styles.runningItemNoteText}>{it.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                  {it.status === 'ready' && (
                    <TouchableOpacity
                      style={[styles.modalPrimaryBtn, { backgroundColor: '#16A34A', height: 34 }]}
                      onPress={() => {
                        markItemServed(it.ticketId, it.id);
                        broadcastImmediately();
                      }}
                    >
                      <Text style={styles.modalPrimaryBtnText}>Mark Served</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
            {activeTickets.length > 0 && (
              <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, { backgroundColor: '#16A34A' }]}
                  onPress={() => {
                    serveTableTickets(tableId as string);
                    broadcastImmediately();
                    setRunningItemsModalVisible(false);
                  }}
                >
                  <Text style={styles.modalPrimaryBtnText}>Mark All Table Items Served</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Transfer Table Modal */}
      <Modal visible={transferModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 560 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transfer {tableName} to Another Table</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setTransferModalVisible(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.tableGridWrap} style={{ maxHeight: 420 }}>
              {availableTransferTables.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.tablePickerCard}
                  onPress={() => handleTransferTable(t)}
                >
                  <Text style={styles.tablePickerName}>{t.name}</Text>
                  <Text style={styles.tablePickerMeta}>
                    {getTableFloor(t)} • {t.seats} Seats
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* CUSTOMER BILL VIEW & ORDER TAKER PAYMENT COLLECTION MODAL */}
      {/* ========================================================================= */}
      <Modal visible={customerBillModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 560, maxHeight: '92%' }]}>
            <View style={[styles.modalHeader, { backgroundColor: '#24050A' }]}>
              <View>
                <Text style={[styles.modalTitle, { color: '#F3D179' }]}>
                  🧾 Customer Bill & Payment Collection
                </Text>
                <Text style={{ fontSize: 12, color: '#E2E8F0', fontWeight: '600', marginTop: 2 }}>
                  {tableName} ({floorName}) • Server: {currentStaff?.name || user?.name || table?.server || 'Order Taker'}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setCustomerBillModalVisible(false)}>
                <Ionicons name="close" size={20} color="#F3D179" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {/* Pending Cashier Liability Alert if already collected */}
              {table?.waiterPaymentCollection?.status === 'pending_cashier' && (
                <View
                  style={{
                    backgroundColor: '#FFFBEB',
                    borderWidth: 2,
                    borderColor: '#F59E0B',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 14,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="warning" size={20} color="#D97706" />
                    <Text style={{ fontSize: 13.5, fontWeight: '900', color: '#92400E', flex: 1 }}>
                      ⏳ PAYMENT PENDING WITH CASHIER (SPEAKING IN {table.waiterPaymentCollection.collectedByWaiter.toUpperCase()}&apos;S NAME)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12.5, color: '#78350F', fontWeight: '700' }}>
                    Collected: Rs. {table.waiterPaymentCollection.totalAmount.toLocaleString()} via{' '}
                    {table.waiterPaymentCollection.paymentMethod.toUpperCase()} at{' '}
                    {new Date(table.waiterPaymentCollection.collectedAt).toLocaleTimeString()}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: '#B45309', fontWeight: '600' }}>
                    This order remains PENDING until the Cashier confirms receiving Rs.{' '}
                    {table.waiterPaymentCollection.totalAmount.toLocaleString()} from{' '}
                    {table.waiterPaymentCollection.collectedByWaiter} at the POS counter.
                  </Text>
                </View>
              )}

              {/* Customer-Facing Royal Bill Card */}
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: '#CBD5E1',
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                <View style={{ alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: '#E2E8F0', paddingBottom: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#52141C', letterSpacing: 0.6 }}>
                    SULTAN RESTAURANT & CAFE
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 2 }}>
                    PROVISIONAL CUSTOMER BILL • {tableName.toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {new Date().toLocaleDateString()} • {new Date().toLocaleTimeString()} • Server:{' '}
                    {currentStaff?.name || user?.name || table?.server || 'Order Taker'}
                  </Text>
                </View>

                {/* Header Row */}
                <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginBottom: 6 }}>
                  <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '900', color: '#475569' }}>DISH / ITEM</Text>
                  <Text style={{ width: 45, textAlign: 'center', fontSize: 11.5, fontWeight: '900', color: '#475569' }}>QTY</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 11.5, fontWeight: '900', color: '#475569' }}>RATE</Text>
                  <Text style={{ width: 85, textAlign: 'right', fontSize: 11.5, fontWeight: '900', color: '#475569' }}>TOTAL</Text>
                </View>

                {consolidatedOrderedItems.map((it) => (
                  <View
                    key={it.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 6,
                      borderBottomWidth: 1,
                      borderBottomColor: '#F1F5F9',
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{it.name}</Text>
                      {it.notes ? (
                        <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }}>Note: {it.notes}</Text>
                      ) : null}
                    </View>
                    <Text style={{ width: 45, textAlign: 'center', fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                      {it.qty}
                    </Text>
                    <Text style={{ width: 70, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: '#475569' }}>
                      {it.price.toLocaleString()}
                    </Text>
                    <Text style={{ width: 85, textAlign: 'right', fontSize: 13, fontWeight: '900', color: '#0F172A' }}>
                      {(it.price * it.qty).toLocaleString()}
                    </Text>
                  </View>
                ))}

                {/* Totals */}
                <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: '#CBD5E1', gap: 5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Subtotal</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                      Rs. {billSubTotal.toLocaleString()}
                    </Text>
                  </View>
                  {billTax > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>
                        {systemSettings.taxLabel || 'GST'} ({systemSettings.taxRatePercent || 0}%)
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                        Rs. {billTax.toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {billServiceCharge > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>
                        Service Charge ({systemSettings.serviceChargePercent || 0}%)
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                        Rs. {billServiceCharge.toLocaleString()}
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#24050A',
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      marginTop: 6,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#F3D179' }}>GRAND TOTAL PAYABLE</Text>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFFFF' }}>
                      Rs. {billGrandTotal.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Step 2: Order Taker Payment Collection Form */}
              <View
                style={{
                  backgroundColor: '#F0FDF4',
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: '#86EFAC',
                  padding: 14,
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#14532D' }}>
                  💵 Collect Payment from Customer & Notify Cashier
                </Text>

                {/* Payment Method Selector */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(
                    [
                      { key: 'cash', label: '💵 Cash', icon: 'cash-outline' },
                      { key: 'card', label: '💳 Card', icon: 'card-outline' },
                      { key: 'online', label: '📱 Online', icon: 'phone-portrait-outline' },
                    ] as const
                  ).map((m) => {
                    const active = waiterPayMethod === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={{
                          flex: 1,
                          paddingVertical: 9,
                          borderRadius: 9,
                          backgroundColor: active ? '#15803D' : '#FFFFFF',
                          borderWidth: 1.5,
                          borderColor: active ? '#15803D' : '#BBF7D0',
                          alignItems: 'center',
                        }}
                        onPress={() => setWaiterPayMethod(m.key)}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '900', color: active ? '#FFFFFF' : '#166534' }}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Amount Received Input + Change Due */}
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#166534', marginBottom: 4 }}>
                      Amount Received from Guest (Rs.)
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1.5,
                        borderColor: '#86EFAC',
                        borderRadius: 9,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 15,
                        fontWeight: '900',
                        color: '#0F172A',
                      }}
                      keyboardType="numeric"
                      value={waiterTenderedInput}
                      onChangeText={setWaiterTenderedInput}
                      placeholder={String(billGrandTotal)}
                    />
                  </View>
                  <View
                    style={{
                      backgroundColor: '#DCFCE7',
                      borderRadius: 9,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minWidth: 130,
                      alignItems: 'flex-end',
                    }}
                  >
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#166534' }}>CHANGE TO RETURN</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#15803D', marginTop: 2 }}>
                      Rs. {billChangeDue.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <TextInput
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#BBF7D0',
                    borderRadius: 9,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: 12.5,
                    fontWeight: '700',
                    color: '#0F172A',
                  }}
                  placeholder="Optional payment note (e.g. Rs. 5000 note received, JazzCash ref)..."
                  placeholderTextColor="#94A3B8"
                  value={waiterPayNote}
                  onChangeText={setWaiterPayNote}
                />

                <TouchableOpacity
                  style={{
                    backgroundColor: '#16A34A',
                    borderRadius: 10,
                    paddingVertical: 13,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  onPress={handleConfirmWaiterPaymentCollected}
                >
                  <Ionicons name="checkmark-circle" size={19} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' }}>
                    {table?.waiterPaymentCollection?.status === 'pending_cashier'
                      ? `Update Collected Payment (Rs. ${billGrandTotal.toLocaleString()})`
                      : `Payment Collected by Me — Notify Cashier (Rs. ${billGrandTotal.toLocaleString()})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
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
  tableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tableTitle: {
    color: '#F3D179',
    fontSize: 14.5,
    fontWeight: '900',
  },
  tableSub: {
    color: '#CBD5E1',
    fontSize: 11,
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
    gap: 8,
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
  workspace: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  categoryRail: {
    width: 265,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1.5,
    borderRightColor: '#CBD5E1',
  },
  categoryRailMobile: {
    width: '100%',
    height: 58,
    borderRightWidth: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
  },
  categoryRailHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  categorySearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  categorySearchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 0,
  },
  categoryRailTitle: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 0.8,
  },
  categoryRailCount: {
    fontSize: 11.5,
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
    gap: 10,
  },
  categoryItemMobile: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    height: 46,
  },
  categoryItemActive: {
    backgroundColor: '#52141C',
  },
  categoryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    color: '#1E293B',
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
    color: '#334155',
  },
  categoryBadgeTextActive: {
    color: '#F3D179',
  },
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeCatCountText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
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
  ticketPanel: {
    width: 370,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    display: 'flex',
    flexDirection: 'column',
  },
  ticketItemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  ticketItemsHeaderTitle: {
    fontSize: 11.5,
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
    paddingVertical: 8,
    gap: 6,
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
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 8,
  },
  ticketRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketRowIndex: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    width: 18,
  },
  ticketRowName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  noteLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
  },
  ticketRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  qtyBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnPlus: {
    backgroundColor: '#52141C',
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  qtyValText: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  ticketFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  rushToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rushToggleBtnActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  rushToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
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
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
  },
  secActionKot: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  secActionKotText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  secActionSlip: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  secActionSlipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  primaryPayBtn: {
    height: 46,
    borderRadius: 10,
    backgroundColor: '#D4AF37',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  primaryPayBtnText: {
    color: '#24050A',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
  },
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
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
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
  filterChip: {
    paddingHorizontal: 11,
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
  },
  runningOrderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  runningOrderItems: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  tableGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 14,
    gap: 10,
  },
  tablePickerCard: {
    width: '31%',
    minWidth: 150,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    gap: 4,
  },
  tablePickerName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  tablePickerMeta: {
    fontSize: 11.5,
    color: '#64748B',
  },
  itemNotePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    maxWidth: '100%',
  },
  itemNotePillBtnFilled: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D5A943',
  },
  itemNotePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
    flexShrink: 1,
  },
  itemNotePillTextFilled: {
    color: '#78350F',
    fontWeight: '800',
  },
  overallNotesCard: {
    marginTop: 10,
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5D5B0',
    padding: 12,
    gap: 10,
  },
  overallNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overallNotesIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F6E7BE',
    borderWidth: 1,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overallNotesTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#24050A',
  },
  overallNotesSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  overallNotesClearBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  overallNotesClearText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
  },
  overallNotesChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  overallPresetChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6CA',
  },
  overallPresetChipActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  overallPresetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  overallPresetChipTextActive: {
    color: '#F3D179',
    fontWeight: '800',
  },
  overallNotesInput: {
    minHeight: 58,
    borderWidth: 1.5,
    borderColor: '#DDD6CA',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },
  footerNotesSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  footerNotesSummaryText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#78350F',
  },
  runningOrderNotesWrap: {
    gap: 8,
    marginBottom: 10,
  },
  runningOrderNoteBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#D5A943',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  runningOrderNoteLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.4,
  },
  runningOrderNoteText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#451A03',
    marginTop: 2,
  },
  runningItemNoteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  runningItemNoteText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#78350F',
  },
  noteGroupTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noteMultiInput: {
    minHeight: 74,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
  },
  noteModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  noteModalClearBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteModalClearText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
  },
});
