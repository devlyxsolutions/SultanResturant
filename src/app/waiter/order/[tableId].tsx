import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
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
import { resolveMenuImageUri } from '../../../utils/menuImage';

const NOTE_PRESETS = [
  'Less Spicy',
  'Extra Spicy',
  'No Onion',
  'Extra Crispy',
  'Starter First',
  'Jaldi / Rush',
  'Low Salt',
  'Pack To-Go',
  'Less Sugar',
  'Extra Ice',
  'Extra Cheese',
  'Extra Raita',
];

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
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1120;

  const [mobileTab, setMobileTab] = useState<'menu' | 'cart' | 'running'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Cart & Customizations
  const [newCart, setNewCart] = useState<{ item: MenuItem; qty: number; notes?: string }[]>([]);
  const [variantModalItem, setVariantModalItem] = useState<MenuItem | null>(null);
  const [editingNoteItem, setEditingNoteItem] = useState<{ item: MenuItem; notes?: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isRushOrder, setIsRushOrder] = useState(false);

  // Table Operations Modals
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [runningItemsModalVisible, setRunningItemsModalVisible] = useState(false);
  const [now] = useState(() => Date.now());

  // Store bindings
  const tables = useRestaurantStore((state) => state.tables) || [];
  const tickets = useRestaurantStore((state) => state.tickets) || [];
  const menuItems = useRestaurantStore((state) => state.menuItems) || [];
  const storeCategories = useRestaurantStore((state) => state.categories) || [];
  const regions = useRestaurantStore((state) => state.regions) || [];
  const placeOrder = useRestaurantStore((state) => state.placeOrder);
  const serveTableTickets = useRestaurantStore((state) => state.serveTableTickets);
  const markItemServed = useRestaurantStore((state) => state.markItemServed);
  const transferTable = useRestaurantStore((state) => state.transferTable);
  const markTableBilled = useRestaurantStore((state) => state.markTableBilled);
  const updateTable = useRestaurantStore((state) => state.updateTable);

  const unavailableIds = useOpsStore((state) => state.unavailableItemIds) || [];
  const unavailableSet = useMemo(() => new Set(unavailableIds), [unavailableIds]);
  const user = useAuthStore((state) => state.user);

  const isTakeaway = tableId === 'takeaway';
  const table = tables.find((t) => t.id === tableId);
  const tableName = isTakeaway ? 'Takeaway / Counter' : table ? table.name : `Table ${tableId}`;
  const seatingType = table ? getTableSeatingType(table) : 'tables';
  const floorName = isTakeaway ? 'Express Counter' : table ? getTableFloor(table) : 'Ground Floor';

  const activeTickets = tickets.filter((t) => t.tableId === tableId);
  const isExistingOrderActive = activeTickets.length > 0 || table?.status === 'occupied' || table?.status === 'billed';

  const alreadyOrderedItems: {
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

        alreadyOrderedItems.push({
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
  } else if (table && table.orders && table.orders.length > 0) {
    table.orders.forEach((it) => {
      alreadyOrderedItems.push({
        id: it.id,
        name: it.name,
        price: it.price,
        qty: it.qty,
        notes: it.notes,
        status: 'served',
        ticketId: 'ORDER-SAVED',
        timePlaced: now,
      });
    });
  }

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
    const variantItem: MenuItem = {
      ...variantModalItem,
      id: variantId,
      name: variantName,
      price: variant.price,
    };
    setNewCart((prev) => {
      const existing = prev.find((i) => i.item.id === variantId);
      if (existing) {
        return prev.map((i) => (i.item.id === variantId ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { item: variantItem, qty: 1 }];
    });
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
    if (noteDraft.includes(preset)) {
      setNoteDraft((prev) => prev.replace(preset, '').replace(/,\s*,/g, ',').trim());
    } else {
      setNoteDraft((prev) => (prev ? `${prev}, ${preset}` : preset));
    }
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
      notes: [c.notes, isRushOrder ? 'RUSH / JALDI' : ''].filter(Boolean).join(' • ') || undefined,
    }));

    placeOrder(
      tableId as string,
      table?.server || user?.name || 'Staff (Order Taker)',
      kotItems,
      isAddOn
    );

    if (table && table.status !== 'occupied') {
      updateTable(table.id, {
        status: 'occupied',
        occupiedSince: table.occupiedSince || Date.now(),
        server: table.server || user?.name || 'Order Taker',
        billTotal: totalBillSoFar,
      });
    } else if (table) {
      updateTable(table.id, {
        billTotal: totalBillSoFar,
      });
    }

    broadcastImmediately();
    setNewCart([]);
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
    const tax = Math.round(subTotal * 0.16);
    const total = subTotal + tax;
    const unpaidInvoice: Invoice = {
      id: `CHK-${table.name.replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`,
      orderType: 'dine-in',
      tableId: table.id,
      tableName: table.name,
      server: table.server || user?.name || 'Order Taker',
      orderTakenBy: table.server || user?.name || 'Order Taker',
      cashier: user?.name || 'Order Taker',
      timePlaced: Date.now(),
      timeSettled: Date.now(),
      items: allItems,
      subTotal,
      discount: 0,
      tax,
      total,
      payments: [],
      status: 'unpaid',
      isUnpaidBill: true,
    };
    markTableBilled(table.id, unpaidInvoice.id);
    broadcastImmediately();
    printInvoiceReceipt(unpaidInvoice);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
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

      {/* Full-Page Mode Switcher (All Devices: Menu vs Cart vs Running KDS Prep Time) */}
      <View style={styles.mobileTabBar}>
        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'menu' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('menu')}
        >
          <Ionicons name="restaurant" size={18} color={mobileTab === 'menu' ? '#F3D179' : '#475569'} />
          <Text style={[styles.mobileTabText, mobileTab === 'menu' && styles.mobileTabTextActive]}>
            1. Order Dena / Menu Dishes ({filteredItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'cart' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('cart')}
        >
          <Ionicons name="cart" size={18} color={mobileTab === 'cart' ? '#F3D179' : '#475569'} />
          <Text style={[styles.mobileTabText, mobileTab === 'cart' && styles.mobileTabTextActive]}>
            2. Current Cart & KOT ({totalNewQty} Items{cartPrepEstimate.totalMins > 0 ? ` • ~${cartPrepEstimate.totalMins}m` : ''})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mobileTabBtn, mobileTab === 'running' && styles.mobileTabBtnActive]}
          onPress={() => setMobileTab('running')}
        >
          <Ionicons name="flame" size={18} color={mobileTab === 'running' ? '#F3D179' : '#EA580C'} />
          <Text style={[styles.mobileTabText, mobileTab === 'running' && styles.mobileTabTextActive]}>
            3. Running KDS & Prep Time ({alreadyOrderedItems.length}{runningPrepEstimate.totalMins > 0 ? ` • ~${runningPrepEstimate.totalMins}m` : ''})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================
          2. FULL-PAGE WORKSPACE (TAB 1: MENU | TAB 2: CART | TAB 3: RUNNING KDS)
          ======================================================== */}
      <View style={[styles.workspace, isMobile && { flexDirection: 'column' }]}>
        {/* LEFT: Category Rail */}
        {mobileTab === 'menu' && (
          <View style={[styles.categoryRail, isTablet && { width: 230 }, isMobile && styles.categoryRailMobile]}>
            <View style={styles.categoryRailHeader}>
              {!isMobile && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={styles.categoryRailTitle}>CATEGORIES</Text>
                  <Text style={styles.categoryRailCount}>{categoryList.length + 1}</Text>
                </View>
              )}
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
            <ScrollView
              horizontal={isMobile}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={isMobile ? styles.categoryRailScrollMobile : styles.categoryRailScroll}
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

        {/* CENTER: Dish Grid */}
        {mobileTab === 'menu' && (
          <View style={styles.catalogPane}>
            <View style={styles.catalogFilterBar}>
              <Text style={styles.activeCatTitle}>
                {activeCategory === 'ALL' ? 'All Menu Dishes' : activeCategory}
              </Text>
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

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.dishGridContent, isMobile && totalNewQty > 0 && { paddingBottom: 90 }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.dishGrid}>
                {filteredItems.map((item) => {
                  const inCartQty = newCart
                    .filter((c) => c.item.id === item.id || c.item.id.startsWith(`${item.id}-`))
                    .reduce((sum, c) => sum + c.qty, 0);
                  const isInCart = inCartQty > 0;
                  const isSoldOut = getItemStockStatus(item).isSoldOut;
                  const imageUri = resolveMenuImageUri(item);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.dishCard,
                        isTablet && { width: '31.5%' },
                        isMobile && { width: width < 380 ? '100%' : '48%' },
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
                          <Text style={styles.dishCategoryLabel} numberOfLines={1}>
                            {item.variants?.length ? `${item.variants.length} Sizes` : item.category}
                          </Text>
                          <View style={[styles.dishAddIcon, isInCart && styles.dishAddIconActive]}>
                            <Ionicons name="add" size={15} color={isInCart ? '#FFFFFF' : '#52141C'} />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* FULL-PAGE CART: Order KOT Ticket Panel */}
        {mobileTab === 'cart' && (
          <View style={[styles.ticketPanel, { width: '100%', flex: 1, borderLeftWidth: 0 }]}>
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

            <ScrollView style={styles.ticketItemsScroll} contentContainerStyle={styles.ticketItemsContent}>
              {newCart.length === 0 ? (
                <View style={styles.emptyTicketBox}>
                  <Ionicons name="restaurant-outline" size={38} color="#CBD5E1" />
                  <Text style={styles.emptyTicketTitle}>No New Dishes Selected</Text>
                  <Text style={styles.emptyTicketSub}>
                    Tap dishes on the menu grid to build a KOT for {tableName}
                  </Text>
                </View>
              ) : (
                newCart.map((c, idx) => (
                  <View key={c.item.id} style={styles.ticketRow}>
                    <View style={styles.ticketRowLeft}>
                      <Text style={styles.ticketRowIndex}>{idx + 1}.</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ticketRowName} numberOfLines={1}>
                          {c.item.name}
                        </Text>
                        <TouchableOpacity onPress={() => openNoteModal(c)}>
                          <Text style={styles.noteLinkText} numberOfLines={1}>
                            {c.notes ? `📝 ${c.notes}` : '+ Add Kitchen Note'}
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
                ))
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
                        ⏱️ EST. KITCHEN PREP TIME (کھانا تیار ہونے کا وقت)
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

              {/* Rush Order Toggle */}
              <TouchableOpacity
                style={[styles.rushToggleBtn, isRushOrder && styles.rushToggleBtnActive]}
                onPress={() => setIsRushOrder((prev) => !prev)}
              >
                <Ionicons name="flash" size={15} color={isRushOrder ? '#DC2626' : '#64748B'} />
                <Text style={[styles.rushToggleText, isRushOrder && { color: '#DC2626', fontWeight: '900' }]}>
                  {isRushOrder ? 'RUSH / PRIORITY ORDER ACTIVE' : 'Mark as Rush Order (Jaldi)'}
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
                    style={[styles.secActionBtn, styles.secActionSlip]}
                    onPress={handleRequestBill}
                  >
                    <Ionicons name="receipt-outline" size={15} color="#334155" />
                    <Text style={styles.secActionSlipText}>Print Check</Text>
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
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#FFFBEB',
                borderWidth: 1.5,
                borderColor: '#F59E0B',
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#92400E' }}>
                  🔥 Running Kitchen KDS Orders on {tableName}
                </Text>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#B45309', marginTop: 2 }}>
                  Total Kitchen Prep Time (پورا کھانا تیار ہونے کا وقت): ~{runningPrepEstimate.totalMins} Minutes
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#D97706',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
                  ⏱️ ~{runningPrepEstimate.totalMins} Mins
                </Text>
              </View>
            </View>

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
                  const elapsedMins = Math.max(0, Math.floor((Date.now() - (it.timePlaced || now)) / 60000));
                  const remainingMins = Math.max(0, dishMins - elapsedMins);
                  return (
                    <View key={`${it.ticketId}-${it.id}-${idx}`} style={styles.runningOrderCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.runningOrderTitle}>
                          {it.qty}× {it.name}
                        </Text>
                        <Text style={styles.runningOrderItems}>
                          Status: {it.status.toUpperCase()} • Est. Prep: ~{dishMins}m (
                          {it.status === 'ready' || it.status === 'served'
                            ? '✅ Ready'
                            : remainingMins > 0
                              ? `⏳ ~${remainingMins}m remaining`
                              : '🔥 Finalizing'}
                          ) {it.notes ? `• ${it.notes}` : ''}
                        </Text>
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

      {/* Floating Bottom Bar on Menu Tab (All Devices) */}
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
            <Text style={styles.mobileFloatingLabel}>Cart Dekhein & Kitchen Bhejein</Text>
          </View>
          <Text style={styles.mobileFloatingTotal}>{totalNewQty} Portions • Open Cart ➔</Text>
        </TouchableOpacity>
      )}

      {/* Variant Picker Modal */}
      <Modal visible={!!variantModalItem} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 420 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{variantModalItem?.name}</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setVariantModalItem(null)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              {(variantModalItem?.variants || []).map((v) => (
                <TouchableOpacity
                  key={v.name}
                  style={styles.variantChoiceBtn}
                  onPress={() => handleVariantSelect(v)}
                >
                  <Text style={styles.variantChoiceName}>{v.name}</Text>
                  <Ionicons name="add-circle" size={20} color="#52141C" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Kitchen Note Modal */}
      <Modal visible={!!editingNoteItem} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 460 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kitchen Note: {editingNoteItem?.item.name}</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setEditingNoteItem(null)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <TextInput
                style={styles.textInputField}
                placeholder="Type special cooking instructions..."
                value={noteDraft}
                onChangeText={setNoteDraft}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {NOTE_PRESETS.map((preset) => {
                  const active = noteDraft.includes(preset);
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => appendNotePreset(preset)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={saveItemNote}>
                <Text style={styles.modalPrimaryBtnText}>Save Note</Text>
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
              {alreadyOrderedItems.map((it, idx) => (
                <View key={`${it.ticketId}-${it.id}-${idx}`} style={styles.runningOrderCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.runningOrderTitle}>
                      {it.qty}× {it.name}
                    </Text>
                    <Text style={styles.runningOrderItems}>
                      Status: {it.status.toUpperCase()} {it.notes ? `• ${it.notes}` : ''}
                    </Text>
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 12,
  },
  mobileTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  mobileTabBtnActive: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
  },
  mobileTabText: {
    fontSize: 15,
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
    height: 112,
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
  dishCard: {
    width: '23.6%',
    minWidth: 150,
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
  dishCategoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    flex: 1,
  },
  dishAddIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
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
  },
  primaryPayBtnText: {
    color: '#24050A',
    fontSize: 13.5,
    fontWeight: '900',
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
});
