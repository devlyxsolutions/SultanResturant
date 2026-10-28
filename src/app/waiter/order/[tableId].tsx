import React, { useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ScrollView, 
  Platform, 
  Alert, 
  StatusBar, 
  TextInput, 
  useWindowDimensions, 
  Modal,
  Image,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { 
  useRestaurantStore, 
  MenuItem, 
  OrderItem, 
  useAuthStore, 
  useOpsStore,
  Table,
  Invoice
} from '../../../store';
import { getTableFloor, getTableSeatingType, getFloorMeta } from '../../../constants/floors';
import SeatingTypeIcon from '../../../components/SeatingTypeIcon';
import SyncStatusBadge from '../../../components/SyncStatusBadge';
import { broadcastImmediately } from '../../../services/syncService';
import { printInvoiceReceipt } from '../../../components/Invoice';
import { BRAND } from '../../../constants/brand';

const NOTE_PRESETS = [
  '🌶️ Less Spicy',
  '🔥 Extra Spicy',
  '🧅 No Onion',
  '🍟 Extra Crispy',
  '🥗 Starter First',
  '⚡ Jaldi / Rush',
  '🧂 Low Salt',
  '🥡 Pack To-Go',
  '☕ Less Sugar',
  '🧊 Extra Ice',
  '🧀 Extra Cheese',
  '🥣 Extra Raita',
];

function getCategoryIcon(catName: string): keyof typeof Ionicons.glyphMap {
  const c = (catName || '').toLowerCase().trim();
  if (c === 'all') return 'grid';
  if (c.includes('appetizer') || c.includes('starter') || c.includes('snack') || c.includes('fries') || c.includes('pita') || c.includes('hummus')) return 'pizza';
  if (c.includes('main') || c.includes('karahi') || c.includes('handi') || c.includes('curry') || c.includes('gravy')) return 'flame';
  if (c.includes('bbq') || c.includes('grill') || c.includes('kebab') || c.includes('tikka') || c.includes('ribs') || c.includes('shinwari')) return 'bonfire';
  if (c.includes('dessert') || c.includes('sweet') || c.includes('cake') || c.includes('kunafa') || c.includes('ice') || c.includes('lava') || c.includes('halwa')) return 'ice-cream';
  if (c.includes('drink') || c.includes('beverage') || c.includes('juice') || c.includes('shake') || c.includes('margarita') || c.includes('tea') || c.includes('coffee') || c.includes('soda')) return 'wine';
  if (c.includes('deal') || c.includes('combo') || c.includes('special') || c.includes('feast') || c.includes('offer')) return 'pricetags';
  if (c.includes('rice') || c.includes('biryani') || c.includes('pulao')) return 'restaurant';
  if (c.includes('bread') || c.includes('naan') || c.includes('roti') || c.includes('kulcha')) return 'nutrition';
  if (c.includes('burger') || c.includes('sandwich') || c.includes('wrap')) return 'fast-food';
  if (c.includes('pizza')) return 'pizza';
  if (c.includes('fish') || c.includes('seafood') || c.includes('prawn')) return 'fish';
  if (c.includes('salad') || c.includes('diet') || c.includes('green')) return 'leaf';
  return 'restaurant';
}

function getCuisineMeta(cuisineName: string) {
  const c = (cuisineName || '').toLowerCase();
  if (c.includes('pakistan') || c.includes('desi')) return { emoji: '🍛', icon: 'flame' as const };
  if (c.includes('chine') || c.includes('asian')) return { emoji: '🥢', icon: 'restaurant' as const };
  if (c.includes('continen') || c.includes('steak')) return { emoji: '🥩', icon: 'nutrition' as const };
  if (c.includes('arab') || c.includes('mandi') || c.includes('kabsa')) return { emoji: '🍢', icon: 'bonfire' as const };
  if (c.includes('turk')) return { emoji: '🥙', icon: 'flame' as const };
  if (c.includes('fast') || c.includes('burger')) return { emoji: '🍔', icon: 'fast-food' as const };
  if (c.includes('ital') || c.includes('pizza') || c.includes('pasta')) return { emoji: '🍕', icon: 'pizza' as const };
  if (c.includes('bbq') || c.includes('grill')) return { emoji: '🔥', icon: 'flame' as const };
  if (c.includes('bever') || c.includes('drink') || c.includes('juice')) return { emoji: '🍹', icon: 'wine' as const };
  if (c.includes('sweet') || c.includes('dessert')) return { emoji: '🍨', icon: 'ice-cream' as const };
  return { emoji: '🍽️', icon: 'restaurant' as const };
}

export default function TableOrderScreen() {
  const { tableId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 850;

  // Tabs & Filters
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [activeStation, setActiveStation] = useState<'all' | 'main' | 'juice' | 'deals'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [categoryViewMode, setCategoryViewMode] = useState<'grid' | 'list'>('grid');
  const [isCatSearchFocused, setIsCatSearchFocused] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Cart & Item customisations
  const [newCart, setNewCart] = useState<{ item: MenuItem; qty: number; notes?: string }[]>([]);
  const [variantModalItem, setVariantModalItem] = useState<MenuItem | null>(null);
  const [dealDetailItem, setDealDetailItem] = useState<MenuItem | null>(null);
  const [editingNoteItem, setEditingNoteItem] = useState<{ item: MenuItem; notes?: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isRushOrder, setIsRushOrder] = useState(false);

  // Modals for Table Operations
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [billSlipModalVisible, setBillSlipModalVisible] = useState(false);
  const [guestCountModalVisible, setGuestCountModalVisible] = useState(false);
  
  // Timestamp for running timers
  const [now] = useState(() => Date.now());

  // Store bindings
  const tables = useRestaurantStore(state => state.tables) || [];
  const tickets = useRestaurantStore(state => state.tickets) || [];
  const menuItems = useRestaurantStore(state => state.menuItems) || [];
  const storeCategories = useRestaurantStore(state => state.categories) || [];
  const regions = useRestaurantStore(state => state.regions) || [];
  const dynamicFloors = useRestaurantStore(state => state.floors) || [];
  const placeOrder = useRestaurantStore(state => state.placeOrder);
  const serveTableTickets = useRestaurantStore(state => state.serveTableTickets);
  const markItemServed = useRestaurantStore(state => state.markItemServed);
  const transferTable = useRestaurantStore(state => state.transferTable);
  const markTableBilled = useRestaurantStore(state => state.markTableBilled);
  const updateTable = useRestaurantStore(state => state.updateTable);
  
  // Kitchen 86'd / Unavailable stock check
  const unavailableIds = useOpsStore(state => state.unavailableItemIds) || [];
  const unavailableSet = useMemo(() => new Set(unavailableIds), [unavailableIds]);

  const user = useAuthStore(state => state.user);

  // Support takeaway / express counter or table
  const isTakeaway = tableId === 'takeaway';
  const table = tables.find(t => t.id === tableId);
  const tableName = isTakeaway ? '🛍️ Takeaway / Counter' : (table ? table.name : `Table ${tableId}`);
  const seatingType = table ? getTableSeatingType(table) : 'tables';
  const floorName = isTakeaway ? 'Express Counter' : (table ? getTableFloor(table) : 'Ground Floor');
  const floorMeta = getFloorMeta(floorName, dynamicFloors);
  const isMajlis = seatingType === 'majlis';
  const isCouch = seatingType === 'couches';

  // Active tickets & orders for this table
  const activeTickets = tickets.filter(t => t.tableId === tableId);
  const isExistingOrderActive = activeTickets.length > 0 || table?.status === 'occupied' || table?.status === 'billed';
  const isBilled = table?.status === 'billed' || table?.isPaid;

  // Flatten already placed items
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
    prepTimeMin?: number;
  }[] = [];

  if (activeTickets.length > 0) {
    activeTickets.forEach(ticket => {
      (ticket.items || []).forEach(it => {
        const itemStation = (it.station || 'main') as 'main' | 'juice';
        const stationStatus = ticket.stationStatuses?.[itemStation];
        const itemEffectiveStatus: 'pending' | 'cooking' | 'ready' | 'served' =
          it.itemStatus
            ? it.itemStatus
            : ticket.status === 'served' || (it.completed && stationStatus === 'served')
            ? 'served'
            : stationStatus === 'ready' || it.completed || ticket.status === 'ready'
            ? 'ready'
            : (stationStatus === 'cooking' || ticket.status === 'cooking')
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
          prepTimeMin: it.prepTimeMin,
        });
      });
    });
  } else if (table && table.orders && table.orders.length > 0) {
    table.orders.forEach(it => {
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

  // Categories list for 2-column sidebar (Auto-syncs dynamic categories from catalog)
  const categoryTiles = useMemo(() => {
    const set = new Set<string>();
    (storeCategories || []).forEach(c => {
      if (c && c !== 'All' && c !== 'ALL') set.add(c);
    });
    // Ensure all unique categories assigned to menu items are visible in POS tiles
    (menuItems || []).forEach(m => {
      if (m.category && m.category !== 'All' && m.category !== 'ALL') {
        set.add(m.category);
      }
    });
    const list = Array.from(set);
    if (!categorySearchQuery) return list;
    const q = categorySearchQuery.toLowerCase().trim();
    return list.filter(c => c.toLowerCase().includes(q));
  }, [storeCategories, menuItems, categorySearchQuery]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: (menuItems || []).length };
    (menuItems || []).forEach(m => {
      if (m.category) {
        counts[m.category] = (counts[m.category] || 0) + 1;
        counts[m.category.toUpperCase()] = (counts[m.category.toUpperCase()] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems]);

  // Region counts
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: (menuItems || []).length };
    (menuItems || []).forEach(m => {
      if (m.region) {
        counts[m.region] = (counts[m.region] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems]);

  // Available tables for transfer
  const availableTransferTables = useMemo(() => {
    return tables.filter(t => t.id !== tableId && t.status === 'available');
  }, [tables, tableId]);

  // Check item stock status
  const getItemStockStatus = (item: MenuItem) => {
    if (unavailableSet.has(item.id)) {
      return { isSoldOut: true, label: 'Sold Out (86\'d)', isLowStock: false };
    }
    if (item.trackStock && typeof item.stockQty === 'number') {
      if (item.stockQty <= 0) {
        return { isSoldOut: true, label: 'Sold Out', isLowStock: false };
      }
      const threshold = item.lowStockThreshold ?? 5;
      if (item.stockQty <= threshold) {
        return { isSoldOut: false, label: `Only ${item.stockQty} Left`, isLowStock: true, remaining: item.stockQty };
      }
    }
    return { isSoldOut: false, label: '', isLowStock: false };
  };

  // Add item to cart with stock guard
  const addToCart = (item: MenuItem) => {
    const stockStatus = getItemStockStatus(item);
    if (stockStatus.isSoldOut) {
      const msg = `"${item.name}" is currently Sold Out in the kitchen.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Item Unavailable', msg);
      return;
    }

    if (item.variants && item.variants.length > 0) {
      setVariantModalItem(item);
      return;
    }

    setNewCart(prev => {
      const existing = prev.find(i => i.item.id === item.id);
      if (existing) {
        if (item.trackStock && typeof item.stockQty === 'number' && existing.qty >= item.stockQty) {
          const msg = `Kitchen stock limit reached: Only ${item.stockQty} portions available.`;
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Stock Limit', msg);
          return prev;
        }
        return prev.map(i => i.item.id === item.id ? { ...i, qty: i.qty + 1 } : i);
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
    
    setNewCart(prev => {
      const existing = prev.find(i => i.item.id === variantId);
      if (existing) {
        if (variantModalItem.trackStock && typeof variantModalItem.stockQty === 'number' && existing.qty >= variantModalItem.stockQty) {
          const msg = `Kitchen stock limit reached: Only ${variantModalItem.stockQty} portions available.`;
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Stock Limit', msg);
          return prev;
        }
        return prev.map(i => i.item.id === variantId ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { item: variantItem, qty: 1 }];
    });
    
    setVariantModalItem(null);
  };

  const updateCartQty = (itemId: string, delta: number) => {
    setNewCart(prev => {
      return prev
        .map(i => {
          if (i.item.id === itemId) {
            const itemDef = menuItems.find(m => m.id === i.item.id || i.item.id.startsWith(`${m.id}-`));
            if (delta > 0 && itemDef?.trackStock && typeof itemDef.stockQty === 'number') {
              if (i.qty + delta > itemDef.stockQty) {
                const msg = `Kitchen stock limit: Only ${itemDef.stockQty} portions available.`;
                if (Platform.OS === 'web') window.alert(msg);
                else Alert.alert('Stock Limit', msg);
                return i;
              }
            }
            const newQty = i.qty + delta;
            return newQty > 0 ? { ...i, qty: newQty } : null;
          }
          return i;
        })
        .filter(Boolean) as { item: MenuItem; qty: number; notes?: string }[];
    });
  };

  const removeFromCart = (itemId: string) => {
    setNewCart(prev => prev.filter(i => i.item.id !== itemId));
  };

  const clearCart = () => {
    if (newCart.length === 0) return;
    const confirm = () => setNewCart([]);
    if (Platform.OS === 'web') {
      if (window.confirm('Clear all pending items from cart?')) confirm();
    } else {
      Alert.alert('Clear Cart', 'Remove all unsaved items from cart?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: confirm }
      ]);
    }
  };

  // Open note modal for item
  const openNoteModal = (cartItem: { item: MenuItem; notes?: string }) => {
    setEditingNoteItem(cartItem);
    setNoteDraft(cartItem.notes || '');
  };

  const saveItemNote = () => {
    if (!editingNoteItem) return;
    setNewCart(prev =>
      prev.map(i =>
        i.item.id === editingNoteItem.item.id ? { ...i, notes: noteDraft.trim() || undefined } : i
      )
    );
    setEditingNoteItem(null);
    setNoteDraft('');
  };

  const appendNotePreset = (preset: string) => {
    if (noteDraft.includes(preset)) {
      setNoteDraft(prev => prev.replace(preset, '').replace(/,\s*,/g, ',').trim());
    } else {
      setNoteDraft(prev => (prev ? `${prev}, ${preset}` : preset));
    }
  };

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((i) => {
      // Category filter
      if (activeCategory !== 'ALL' && activeCategory !== 'All') {
        if ((i.category || '').toLowerCase() !== activeCategory.toLowerCase()) return false;
      }

      // Region / Cuisine filter
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        if ((i.region || '').toLowerCase() !== activeRegion.toLowerCase()) return false;
      }

      // Station filter
      if (activeStation === 'main' && i.station !== 'main') return false;
      if (activeStation === 'juice' && i.station !== 'juice') return false;
      if (activeStation === 'deals' && !i.isDeal && i.category !== 'Deals') return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchName = i.name.toLowerCase().includes(query);
        const matchCat = i.category ? i.category.toLowerCase().includes(query) : false;
        const matchDesc = i.description ? i.description.toLowerCase().includes(query) : false;
        const matchRegion = i.region ? i.region.toLowerCase().includes(query) : false;
        if (!matchName && !matchCat && !matchDesc && !matchRegion) return false;
      }
      return true;
    });
  }, [menuItems, activeCategory, activeRegion, activeStation, searchQuery]);

  // Totals
  const alreadyOrderedTotal = alreadyOrderedItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const newCartTotal = newCart.reduce((sum, c) => sum + (c.item.price * c.qty), 0);
  const totalBillSoFar = (table?.billTotal || alreadyOrderedTotal) + newCartTotal;

  // Send order / punch to kitchen
  const handleSendToKitchen = () => {
    if (newCart.length === 0) return;

    const roundNum = activeTickets.length + 1;
    const isAddOn = isExistingOrderActive || activeTickets.length > 0;
    const kotItems = newCart.map(c => ({
      item: c.item,
      qty: c.qty,
      notes: [c.notes, isRushOrder ? '⚡ RUSH / JALDI' : ''].filter(Boolean).join(' • ') || undefined,
    }));

    // Place order via store
    placeOrder(
      tableId as string,
      table?.server || user?.name || 'Staff (Order Taker)',
      kotItems,
      isAddOn
    );

    // Mark table occupied & live bill
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

    // Broadcast immediately over WebSocket/Firebase
    broadcastImmediately();

    setNewCart([]);
    setIsRushOrder(false);

    const successMsg = `Round #${roundNum} sent to Kitchen KDS and Juice Bar!`;
    if (Platform.OS === 'web') {
      window.alert(successMsg);
    } else {
      Alert.alert('KOT Dispatched', successMsg);
    }
  };

  // Manual Sync trigger
  const handleManualSync = () => {
    setIsManualSyncing(true);
    broadcastImmediately();
    setTimeout(() => {
      setIsManualSyncing(false);
      const msg = 'Real-time state synchronized with central POS & KDS.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Synced', msg);
    }, 450);
  };

  // Go Back
  const goBack = () => {
    if (newCart.length > 0) {
      const confirmMsg = 'You have unsaved dishes in your cart. Leave without sending to kitchen?';
      if (Platform.OS === 'web') {
        if (!window.confirm(confirmMsg)) return;
      } else {
        Alert.alert('Unsaved Order', confirmMsg, [
          { text: 'Stay Here', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => router.push('/waiter') },
        ]);
        return;
      }
    }
    router.push('/waiter');
  };

  // Transfer Table
  const handleTransferTable = (targetTable: Table) => {
    if (!table) return;
    const confirmMsg = `Transfer running order from "${table.name}" to "${targetTable.name}"?`;
    
    const execute = () => {
      transferTable(table.id, targetTable.id);
      broadcastImmediately();
      setTransferModalVisible(false);
      
      const successMsg = `Order successfully moved to ${targetTable.name}!`;
      if (Platform.OS === 'web') window.alert(successMsg);
      else Alert.alert('Table Moved', successMsg);

      router.replace(`/waiter/order/${targetTable.id}`);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) execute();
    } else {
      Alert.alert('Confirm Table Transfer', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Move Order', style: 'default', onPress: execute },
      ]);
    }
  };

  // Request Bill from Cashier / Mark Billed
  const handleRequestBill = () => {
    if (!table) return;
    const confirmMsg = `Request final bill for "${table.name}"? This alerts Cashier & Manager POS to print invoice.`;

    const execute = () => {
      markTableBilled(table.id);
      broadcastImmediately();
      const successMsg = `Bill requested! Cashier and Manager POS have been notified.`;
      if (Platform.OS === 'web') window.alert(successMsg);
      else Alert.alert('Bill Requested', successMsg);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) execute();
    } else {
      Alert.alert('Request Final Bill', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Request Bill', style: 'default', onPress: execute },
      ]);
    }
  };

  // Update guest seats
  const handleSetGuestCount = (count: number) => {
    if (!table) return;
    updateTable(table.id, { seats: count });
    broadcastImmediately();
    setGuestCountModalVisible(false);
  };

  // Running Bill Slip Invoice Payload
  const runningInvoicePreview: Invoice = useMemo(() => {
    const allItems: OrderItem[] = [
      ...alreadyOrderedItems.map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        qty: it.qty,
        notes: it.notes,
        completed: it.status === 'served',
      })),
      ...newCart.map(c => ({
        id: c.item.id,
        name: c.item.name,
        price: c.item.price,
        qty: c.qty,
        notes: c.notes,
        completed: false,
      }))
    ];

    return {
      id: `DRAFT-${tableId}`,
      orderType: isTakeaway ? 'takeaway' : 'dine-in',
      tableName,
      tableId: tableId as string,
      server: table?.server || user?.name || 'Order Taker',
      timePlaced: table?.occupiedSince || now,
      timeSettled: now,
      items: allItems,
      subTotal: totalBillSoFar,
      discount: 0,
      tax: 0,
      total: totalBillSoFar,
      payments: [{ type: 'cash', amount: totalBillSoFar }],
      status: 'settled',
    };
  }, [alreadyOrderedItems, newCart, isTakeaway, tableName, tableId, table, user, now, totalBillSoFar]);

  const totalCartCount = newCart.reduce((s, c) => s + c.qty, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* ================= ROYAL SULTAN TOP BAR ================= */}
      <View style={styles.topBar}>
        {/* Standalone Back Button */}
        <TouchableOpacity 
          style={styles.topBarBackBtn} 
          onPress={goBack} 
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={16} color="#D4AF37" />
          <Text style={styles.topBarBackText}>Tables</Text>
        </TouchableOpacity>

        {/* Table & Order Info Block */}
        <View style={styles.topBarTableBlock}>
          <View style={styles.topBarTitleRow}>
            <View
              style={[
                styles.topBarIconOrb,
                { backgroundColor: isMajlis ? 'rgba(212, 175, 55, 0.22)' : isCouch ? 'rgba(230, 81, 0, 0.22)' : 'rgba(2, 132, 199, 0.22)' },
              ]}
            >
              <SeatingTypeIcon type={seatingType} size={14} color="#D4AF37" />
            </View>
            <Text style={styles.topBarTableTitle}>{tableName}</Text>
            
            {/* Status Badge */}
            <View style={[
              styles.statusBadge, 
              isBilled ? styles.statusBadgeBilled : isExistingOrderActive ? styles.statusBadgeOccupied : styles.statusBadgeAvailable
            ]}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: isBilled ? '#F59E0B' : isExistingOrderActive ? '#EF4444' : '#10B981' }
              ]} />
              <Text style={[
                styles.statusBadgeText,
                { color: isBilled ? '#F59E0B' : isExistingOrderActive ? '#EF4444' : '#10B981' }
              ]}>
                {isBilled ? 'BILL REQUESTED' : isExistingOrderActive ? 'ACTIVE ORDER' : 'AVAILABLE'}
              </Text>
            </View>

            {/* Active Order Items Badge (No Prices) */}
            {(alreadyOrderedItems.length > 0 || newCart.length > 0) && (
              <View style={styles.topBarItemsPill}>
                <Ionicons name="restaurant" size={12} color="#D4AF37" />
                <Text style={styles.topBarItemsLabel}>Order:</Text>
                <Text style={styles.topBarItemsCount}>
                  {alreadyOrderedItems.length + newCart.length} Items ({alreadyOrderedItems.reduce((s, i) => s + i.qty, 0) + newCart.reduce((s, i) => s + i.qty, 0)} Portions)
                </Text>
              </View>
            )}
          </View>

          {/* Subtitle Row with Seating type, Guest Pax, Floor */}
          <View style={styles.topBarSubtitleRow}>
            <Text style={styles.topBarSubtitleType}>
              {isMajlis ? '🕌 Majlis Cabin' : isCouch ? '🛋️ Couch Lounge' : isTakeaway ? '🛍️ Parcel Counter' : '🍽️ Dining Table'}
            </Text>
            <Text style={styles.topBarDot}>•</Text>
            
            {!isTakeaway && (
              <TouchableOpacity 
                style={styles.paxChip} 
                onPress={() => setGuestCountModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="people" size={11} color="#F3D179" style={{ marginRight: 3 }} />
                <Text style={styles.paxChipText}>{table?.seats || 4} Guests</Text>
                <Ionicons name="chevron-down" size={10} color="#F3D179" style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            )}
            
            <Text style={styles.topBarDot}>•</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={floorMeta.icon || 'business-outline'} size={11} color="rgba(255,255,255,0.75)" />
              <Text style={styles.topBarSubtitleFloor}>{floorName}</Text>
            </View>
          </View>
        </View>

        {/* Right Action Icons */}
        <View style={styles.topBarActions}>
          <TouchableOpacity 
            style={[styles.topBarActionBtn, isManualSyncing && { backgroundColor: 'rgba(212, 175, 55, 0.25)' }]} 
            onPress={handleManualSync}
            disabled={isManualSyncing}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isManualSyncing ? (
              <ActivityIndicator size="small" color="#D4AF37" />
            ) : (
              <Ionicons name="refresh" size={15} color="#D4AF37" />
            )}
            <Text style={styles.topBarActionBtnText}>Sync</Text>
          </TouchableOpacity>

          {isExistingOrderActive && !isTakeaway && (
            <TouchableOpacity 
              style={styles.topBarActionBtn} 
              onPress={() => setTransferModalVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="swap-horizontal" size={15} color="#D4AF37" />
              <Text style={styles.topBarActionBtnText}>Move</Text>
            </TouchableOpacity>
          )}

          {isExistingOrderActive && (
            <TouchableOpacity 
              style={styles.topBarActionBtn} 
              onPress={() => setBillSlipModalVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="receipt-outline" size={15} color="#D4AF37" />
              <Text style={styles.topBarActionBtnText}>Slip</Text>
            </TouchableOpacity>
          )}

          <SyncStatusBadge compact={isMobile} />
        </View>
      </View>

      {/* ================= MOBILE SWITCHER (< 850px) ================= */}
      {isMobile && (
        <View style={styles.mobileSwitcher}>
          <TouchableOpacity 
            style={[styles.mobileSwitchBtn, mobileTab === 'menu' && styles.mobileSwitchBtnActive]}
            onPress={() => setMobileTab('menu')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="restaurant-outline" 
              size={15} 
              color={mobileTab === 'menu' ? '#E5B83B' : 'rgba(255,255,255,0.6)'} 
              style={{ marginRight: 6 }} 
            />
            <Text style={[styles.mobileSwitchText, mobileTab === 'menu' && styles.mobileSwitchTextActive]}>
              Menu Catalog
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.mobileSwitchBtn, mobileTab === 'cart' && styles.mobileSwitchBtnActive]}
            onPress={() => setMobileTab('cart')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="bag-handle-outline" 
              size={15} 
              color={mobileTab === 'cart' ? '#E5B83B' : 'rgba(255,255,255,0.6)'} 
              style={{ marginRight: 6 }} 
            />
            <Text style={[styles.mobileSwitchText, mobileTab === 'cart' && styles.mobileSwitchTextActive]}>
              Table Order ({alreadyOrderedItems.length + newCart.length})
            </Text>
            {totalCartCount > 0 && (
              <View style={styles.mobileTabBadge}>
                <Text style={styles.mobileTabBadgeText}>{totalCartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ================= MAIN WORKSPACE (MATCHING MAIN POS ARCHITECTURE) ================= */}
      <View style={[styles.mainWorkspace, isMobile && { flexDirection: 'column' }]}>

        {/* --------------------------------------------------------
            LEFT: CATEGORIES SIDEBAR (AUTHENTIC POS VELVET THEME)
            -------------------------------------------------------- */}
        {(!isMobile || mobileTab === 'menu') && (
          <View style={[styles.categorySidebar, isMobile && styles.categorySidebarMobile]}>
            {/* Header: CATEGORIES + Count + Grid/List Toggle */}
            <View style={styles.categoryHeaderRow}>
              <View style={styles.categoryTitleGroup}>
                <View style={styles.categoryTitleIconOrb}>
                  <Ionicons name="apps" size={12} color="#E5B83B" />
                </View>
                <Text style={styles.categoryHeading}>CATEGORIES</Text>
                <View style={styles.categoryCountPill}>
                  <Text style={styles.categoryCountPillText}>
                    {categoryTiles.length + 1}
                  </Text>
                </View>
              </View>

              {/* View Mode Switcher (Grid 2-col vs List 1-col) */}
              {!isMobile && (
                <View style={styles.categoryViewSwitcher}>
                  <TouchableOpacity 
                    style={[styles.viewSwitchBtn, categoryViewMode === 'grid' && styles.viewSwitchBtnActive]}
                    onPress={() => setCategoryViewMode('grid')}
                    activeOpacity={0.8}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Ionicons 
                      name="grid" 
                      size={11} 
                      color={categoryViewMode === 'grid' ? '#1E293B' : '#A38B7C'} 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.viewSwitchBtn, categoryViewMode === 'list' && styles.viewSwitchBtnActive]}
                    onPress={() => setCategoryViewMode('list')}
                    activeOpacity={0.8}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Ionicons 
                      name="list" 
                      size={13} 
                      color={categoryViewMode === 'list' ? '#1E293B' : '#A38B7C'} 
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Quick Find Category Filter */}
            <View 
              style={[styles.quickFindBox, isCatSearchFocused && styles.quickFindBoxFocused]}
              {...(Platform.OS === 'web' ? ({ className: 'quick-find-box search-bar-pop', 'data-search-box': 'true' } as any) : {})}
            >
              <View style={[styles.quickFindIconOrb, isCatSearchFocused && { backgroundColor: 'rgba(212, 175, 55, 0.25)', borderColor: '#D4AF37' }]}>
                <Ionicons name="search" size={12} color={isCatSearchFocused ? '#D4AF37' : '#52141C'} />
              </View>
              <TextInput
                style={styles.quickFindInput}
                placeholder="Find category..."
                placeholderTextColor="#64748B"
                value={categorySearchQuery}
                onFocus={() => setIsCatSearchFocused(true)}
                onBlur={() => setIsCatSearchFocused(false)}
                onChangeText={setCategorySearchQuery}
              />
              {categorySearchQuery ? (
                <TouchableOpacity onPress={() => setCategorySearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={15} color="#D4AF37" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Categories Scrollable Container */}
            <ScrollView 
              style={styles.categoriesScroll}
              contentContainerStyle={[
                styles.categoriesContainer,
                isMobile 
                  ? styles.categoriesScrollMobile 
                  : (categoryViewMode === 'grid' ? styles.categoriesGrid : styles.categoriesList)
              ]}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              horizontal={isMobile}
            >
              {/* ALL Category Item */}
              {(() => {
                const isAllActive = activeCategory === 'ALL' || activeCategory === 'All';
                const allCount = (menuItems || []).length;
                return (
                  <TouchableOpacity
                    {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
                    style={[
                      categoryViewMode === 'grid' ? styles.categoryTile : styles.categoryListRow,
                      isMobile && styles.categoryTileMobile,
                      isAllActive && (categoryViewMode === 'grid' ? styles.categoryTileActive : styles.categoryListRowActive)
                    ]}
                    onPress={() => setActiveCategory('ALL')}
                    activeOpacity={0.8}
                  >
                    {categoryViewMode === 'grid' ? (
                      <>
                        <View style={styles.tileTopRow}>
                          <View style={[styles.tileIconOrb, isAllActive && styles.tileIconOrbActive]}>
                            <Ionicons 
                              name="grid" 
                              size={13} 
                              color={isAllActive ? '#1E293B' : '#E5B83B'} 
                            />
                          </View>
                          <View style={[styles.tileCountBadge, isAllActive && styles.tileCountBadgeActive]}>
                            <Text style={[styles.tileCountText, isAllActive && styles.tileCountTextActive]}>
                              {allCount}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.categoryTileText, isAllActive && styles.categoryTileTextActive]}>
                          ALL
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={[styles.listIconOrb, isAllActive && styles.listIconOrbActive]}>
                          <Ionicons 
                            name="grid" 
                            size={14} 
                            color={isAllActive ? '#1E293B' : '#E5B83B'} 
                          />
                        </View>
                        <Text style={[styles.categoryListText, isAllActive && styles.categoryListTextActive]} numberOfLines={1}>
                          ALL ITEMS
                        </Text>
                        <View style={[styles.listCountBadge, isAllActive && styles.listCountBadgeActive]}>
                          <Text style={[styles.listCountText, isAllActive && styles.listCountTextActive]}>
                            {allCount}
                          </Text>
                        </View>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}

              {/* Dynamic Categories */}
              {categoryTiles.map(cat => {
                const isActive = activeCategory.toLowerCase() === cat.toLowerCase();
                const count = categoryCounts[cat] || categoryCounts[cat.toUpperCase()] || 0;
                const iconName = getCategoryIcon(cat);

                return (
                  <TouchableOpacity
                    key={cat}
                    {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
                    style={[
                      categoryViewMode === 'grid' ? styles.categoryTile : styles.categoryListRow,
                      isMobile && styles.categoryTileMobile,
                      isActive && (categoryViewMode === 'grid' ? styles.categoryTileActive : styles.categoryListRowActive)
                    ]}
                    onPress={() => setActiveCategory(cat)}
                    activeOpacity={0.8}
                  >
                    {categoryViewMode === 'grid' ? (
                      <>
                        <View style={styles.tileTopRow}>
                          <View style={[styles.tileIconOrb, isActive && styles.tileIconOrbActive]}>
                            <Ionicons 
                              name={iconName} 
                              size={13} 
                              color={isActive ? '#1E293B' : '#E5B83B'} 
                            />
                          </View>
                          <View style={[styles.tileCountBadge, isActive && styles.tileCountBadgeActive]}>
                            <Text style={[styles.tileCountText, isActive && styles.tileCountTextActive]}>
                              {count}
                            </Text>
                          </View>
                        </View>
                        <Text 
                          style={[styles.categoryTileText, isActive && styles.categoryTileTextActive]}
                          numberOfLines={2}
                        >
                          {cat.toUpperCase()}
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={[styles.listIconOrb, isActive && styles.listIconOrbActive]}>
                          <Ionicons 
                            name={iconName} 
                            size={14} 
                            color={isActive ? '#1E293B' : '#E5B83B'} 
                          />
                        </View>
                        <Text 
                          style={[styles.categoryListText, isActive && styles.categoryListTextActive]}
                          numberOfLines={1}
                        >
                          {cat.toUpperCase()}
                        </Text>
                        <View style={[styles.listCountBadge, isActive && styles.listCountBadgeActive]}>
                          <Text style={[styles.listCountText, isActive && styles.listCountTextActive]}>
                            {count}
                          </Text>
                        </View>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Bottom Status & Quick Filter Panel */}
            {!isMobile && (
              <View style={styles.categoryBottomPanel}>
                <View style={styles.bottomStatusHeader}>
                  <Text style={styles.bottomStatusTitle}>FILTER</Text>
                  <Text style={styles.bottomStatusCount}>
                    {(activeCategory === 'ALL' || activeCategory === 'All') 
                      ? `${(menuItems || []).length} items` 
                      : `${categoryCounts[activeCategory] || categoryCounts[activeCategory.toUpperCase()] || 0} items`}
                  </Text>
                </View>

                <View style={styles.bottomActiveCard}>
                  <View style={styles.bottomActiveIconOrb}>
                    <Ionicons name={getCategoryIcon(activeCategory)} size={12} color="#D4AF37" />
                  </View>
                  <Text style={styles.bottomActiveName} numberOfLines={1}>
                    {activeCategory.toUpperCase()}
                  </Text>
                  {(activeCategory !== 'ALL' && activeCategory !== 'All') && (
                    <TouchableOpacity 
                      style={styles.bottomResetPill}
                      onPress={() => setActiveCategory('ALL')}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close" size={10} color="#FFFFFF" />
                      <Text style={styles.bottomResetText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* --------------------------------------------------------
            CENTER: MENU DISHES GRID (AUTHENTIC POS THEME)
            -------------------------------------------------------- */}
        {(!isMobile || mobileTab === 'menu') && (
          <View style={styles.centerCatalog}>
            {/* Catalog Subheader: Search + Station chips */}
            <View style={styles.catalogSubheader}>
              {/* Luxury Search Pill Box */}
              <View style={[styles.searchPillBox, isSearchFocused && styles.searchPillBoxFocused]}>
                <View style={[styles.searchIconOrb, isSearchFocused && styles.searchIconOrbFocused]}>
                  <Ionicons name="search" size={14} color="#D4AF37" />
                </View>
                <TextInput
                  style={styles.searchPillInput}
                  placeholder="Search dishes, karahi, bbq, drinks, deals..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity 
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.searchClearBtn}
                  >
                    <Ionicons name="close-circle" size={16} color="#D4AF37" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Station Quick Filter Chips */}
              <View style={styles.stationChipsRow}>
                <TouchableOpacity 
                  style={[styles.stationPill, activeStation === 'all' && styles.stationPillActive]}
                  onPress={() => setActiveStation('all')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.stationPillText, activeStation === 'all' && styles.stationPillTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.stationPill, activeStation === 'deals' && styles.stationPillActive]}
                  onPress={() => setActiveStation('deals')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.stationPillText, activeStation === 'deals' && styles.stationPillTextActive]}>
                    ⭐ Deals
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.stationPill, activeStation === 'main' && styles.stationPillActive]}
                  onPress={() => setActiveStation('main')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.stationPillText, activeStation === 'main' && styles.stationPillTextActive]}>
                    🍳 Kitchen KDS
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.stationPill, activeStation === 'juice' && styles.stationPillActive]}
                  onPress={() => setActiveStation('juice')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.stationPillText, activeStation === 'juice' && styles.stationPillTextActive]}>
                    🍹 Juice Bar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Region / Cuisine Quick Filter Pills (POS Standard) */}
            {regions.length > 0 && (
              <View style={styles.posRegionFilterRow}>
                <View style={styles.posRegionFilterLead}>
                  <View style={styles.posRegionLeadIconWrap}>
                    <Ionicons name="restaurant" size={11} color="#D4AF37" />
                  </View>
                  <Text style={styles.posRegionFilterLeadText}>CUISINE</Text>
                </View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.posRegionScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.posRegionChip,
                      activeRegion === 'ALL' && styles.posRegionChipActive,
                    ]}
                    onPress={() => setActiveRegion('ALL')}
                    activeOpacity={0.75}
                  >
                    <Ionicons 
                      name="globe-outline" 
                      size={12} 
                      color={activeRegion === 'ALL' ? '#D4AF37' : '#8A7A70'} 
                      style={{ marginRight: 2 }} 
                    />
                    <Text style={[
                      styles.posRegionChipText,
                      activeRegion === 'ALL' && styles.posRegionChipTextActive,
                    ]}>
                      All Cuisines
                    </Text>
                    <View style={[
                      styles.posRegionChipBadge,
                      activeRegion === 'ALL' && styles.posRegionChipBadgeActive
                    ]}>
                      <Text style={[
                        styles.posRegionChipBadgeText,
                        activeRegion === 'ALL' && styles.posRegionChipBadgeTextActive
                      ]}>
                        {regionCounts['ALL'] ?? 0}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {regions.map(r => {
                    const isSelected = activeRegion.toLowerCase() === r.toLowerCase();
                    const meta = getCuisineMeta(r);
                    const count = regionCounts[r] || 0;

                    return (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.posRegionChip,
                          isSelected && styles.posRegionChipActive,
                        ]}
                        onPress={() => setActiveRegion(isSelected ? 'ALL' : r)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.posRegionEmoji}>{meta.emoji}</Text>
                        <Text style={[
                          styles.posRegionChipText,
                          isSelected && styles.posRegionChipTextActive,
                        ]}>
                          {r}
                        </Text>
                        {count > 0 && (
                          <View style={[
                            styles.posRegionChipBadge,
                            isSelected && styles.posRegionChipBadgeActive
                          ]}>
                            <Text style={[
                              styles.posRegionChipBadgeText,
                              isSelected && styles.posRegionChipBadgeTextActive
                            ]}>
                              {count}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Dishes Grid (Authentic POS dishCard) */}
            <ScrollView 
              style={styles.dishesScrollView}
              contentContainerStyle={[
                styles.dishesGridContainer,
                isMobile && { paddingBottom: Math.max(120, insets.bottom + 90) }
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.dishesGrid}>
                {filteredItems.map(item => {
                  const inCartQty = newCart
                    .filter(c => c.item.id === item.id || c.item.id.startsWith(`${item.id}-`))
                    .reduce((sum, c) => sum + c.qty, 0);
                  const isItemInCart = inCartQty > 0;
                  const stockStatus = getItemStockStatus(item);
                  const isOutOfStock = stockStatus.isSoldOut;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
                      style={[
                        styles.dishCard,
                        isItemInCart && styles.dishCardInCart,
                        isOutOfStock && { opacity: 0.65 },
                        isMobile && { width: '47.5%', minWidth: 140 }
                      ]}
                      onPress={() => addToCart(item)}
                      activeOpacity={0.75}
                      disabled={isOutOfStock}
                    >
                      {/* Floating In-Cart Badge */}
                      {isItemInCart && (
                        <View style={styles.inCartBadge}>
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
                          <Text style={styles.inCartBadgeText}>{inCartQty}</Text>
                        </View>
                      )}

                      {/* Top: Dish Photo or Fallback Icon */}
                      <View style={styles.dishCardImageWrapper}>
                        {item.imageUri ? (
                          <Image 
                            source={{ uri: item.imageUri }} 
                            style={styles.dishCardImage} 
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.dishCardPlaceholderBox}>
                            <Ionicons 
                              name={item.isDeal ? "gift" : item.station === 'juice' ? "wine-outline" : "restaurant-outline"} 
                              size={26} 
                              color="#D4AF37" 
                            />
                          </View>
                        )}

                        {/* Category & Region Chips */}
                        <View style={styles.dishCardChipsRow}>
                          <View style={styles.dishCardCategoryChip}>
                            <Text style={styles.dishCardCategory} numberOfLines={1}>
                              {(item.category || 'Mains').toUpperCase()}
                            </Text>
                          </View>
                          {item.region ? (
                            <View style={styles.dishCardRegionChip}>
                              <Ionicons name="globe-outline" size={8} color="#D4AF37" style={{ marginRight: 2 }} />
                              <Text style={styles.dishCardRegionText} numberOfLines={1}>
                                {item.region}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Special Badge tag */}
                        {item.badge ? (
                          <View style={styles.dishCardBadgeTag}>
                            <Text style={styles.dishCardBadgeText} numberOfLines={1}>
                              {item.badge}
                            </Text>
                          </View>
                        ) : null}

                        {/* Out of Stock Overlay */}
                        {isOutOfStock && (
                          <View style={styles.dishSoldOutOverlay}>
                            <Text style={styles.dishSoldOutText}>SOLD OUT</Text>
                          </View>
                        )}
                      </View>

                      {/* Middle: Dish Name */}
                      <Text style={styles.dishCardTitle} numberOfLines={2}>
                        {item.name}
                      </Text>

                      {/* Bottom: Order Taker Selection Capsule (No Prices) */}
                      <View style={[styles.dishCardOrderPill, isItemInCart && styles.dishCardOrderPillActive]}>
                        <Ionicons 
                          name={isItemInCart ? "checkmark-circle" : "add-circle-outline"} 
                          size={12} 
                          color={isItemInCart ? "#10B981" : "#B45309"} 
                          style={{ marginRight: 3 }}
                        />
                        <Text style={[styles.dishCardOrderText, isItemInCart && styles.dishCardOrderTextActive]}>
                          {isItemInCart ? `${inCartQty} in Cart` : 'Add Dish'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {filteredItems.length === 0 && (
                  <View style={styles.noItemsBox}>
                    <Ionicons name="search" size={40} color="#CBD5E1" />
                    <Text style={styles.noItemsText}>No items found matching your filter</Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Mobile Floating Review Bar if Cart has items */}
            {isMobile && totalCartCount > 0 && (
              <TouchableOpacity 
                style={[
                  styles.floatingCartBar,
                  { bottom: Math.max(16, insets.bottom + 8) }
                ]}
                onPress={() => setMobileTab('cart')}
                activeOpacity={0.9}
              >
                <View style={styles.floatingCartLeft}>
                  <View style={styles.floatingBadge}>
                    <Text style={styles.floatingBadgeText}>{totalCartCount}</Text>
                  </View>
                  <View>
                    <Text style={styles.floatingCartText}>
                      {isExistingOrderActive ? 'Review Add-on Round' : 'Review & Punch KOT'}
                    </Text>
                    <Text style={styles.floatingCartSubText}>
                      {newCart.length} item{newCart.length > 1 ? 's' : ''} ready to punch
                    </Text>
                  </View>
                </View>
                <View style={styles.floatingCartRight}>
                  <Text style={styles.floatingCartPrice}>{totalCartCount} portions</Text>
                  <View style={styles.floatingCartArrow}>
                    <Ionicons name="arrow-forward" size={14} color="#35080E" />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* --------------------------------------------------------
            RIGHT: CART & ORDER PANE (AUTHENTIC POS THEME)
            -------------------------------------------------------- */}
        {(!isMobile || mobileTab === 'cart') && (
          <View style={[styles.cartSidebar, isMobile && styles.cartSidebarMobile]}>
            {/* Header: Title + Reset Button */}
            <View style={styles.cartHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="bag-handle" size={18} color="#52141C" />
                <Text style={styles.cartHeaderTitle}>
                  {isExistingOrderActive ? 'Table Order Cart' : 'New Table Order'}
                </Text>
                {totalCartCount > 0 && (
                  <View style={styles.cartCountPill}>
                    <Text style={styles.cartCountText}>{totalCartCount}</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity 
                style={styles.cartResetBtn}
                onPress={clearCart}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={15} color="#DC2626" />
              </TouchableOpacity>
            </View>

            {/* Table / Cabin Info Bar */}
            <View style={styles.tableCabinBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                <Ionicons name="restaurant" size={14} color="#D97706" />
                <Text style={styles.tableCabinLabel}>Table:</Text>
                <View style={styles.tableCabinPill}>
                  <Text style={styles.tableCabinPillText} numberOfLines={1}>
                    {tableName}
                  </Text>
                  <Text style={styles.tableCabinPillSub}>
                    ({floorName} • {table?.seats || 4} Guests)
                  </Text>
                </View>
              </View>

              {!isTakeaway && (
                <TouchableOpacity 
                  style={styles.changeTablePill}
                  onPress={() => setTransferModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="swap-horizontal" size={12} color="#475569" style={{ marginRight: 3 }} />
                  <Text style={styles.changeTablePillText}>Change Table</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Columns Subheader */}
            <View style={styles.cartColumnSubheader}>
              <Text style={[styles.cartColLabel, { flex: 1.8 }]}>PRODUCT</Text>
              <Text style={[styles.cartColLabel, { flex: 1, textAlign: 'center' }]}>QTY</Text>
              <Text style={[styles.cartColLabel, { flex: 1, textAlign: 'right' }]}>PORTIONS</Text>
            </View>

            {/* Scrollable Cart & Ticket Content */}
            <ScrollView 
              style={styles.cartItemsScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* SECTION A: ALREADY IN KITCHEN (TICKETS) */}
              {alreadyOrderedItems.length > 0 && (
                <View style={styles.existingTicketSection}>
                  <View style={styles.ticketSectionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="flame" size={14} color="#D97706" />
                      <Text style={styles.ticketSectionTitle}>
                        In Kitchen ({alreadyOrderedItems.length})
                      </Text>
                    </View>
                    <View style={styles.ticketPortionsBadge}>
                      <Text style={styles.ticketPortionsBadgeText}>
                        {alreadyOrderedItems.reduce((sum, i) => sum + i.qty, 0)} portions
                      </Text>
                    </View>
                  </View>

                  {/* Ready to Serve Alert Banner */}
                  {(alreadyOrderedItems.some(i => i.status === 'ready') || activeTickets.some(t => t.status === 'ready' || t.stationStatuses?.main === 'ready' || t.stationStatuses?.juice === 'ready')) && (
                    <View style={styles.readyAlertBanner}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="notifications" size={18} color="#0284C7" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.readyAlertTitle}>Food / Drinks Ready!</Text>
                          <Text style={styles.readyAlertSubtitle}>Kitchen KDS has dispatched items</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.readyServeBtn}
                        onPress={() => {
                          serveTableTickets(tableId as string);
                          broadcastImmediately();
                          if (Platform.OS !== 'web') {
                            Alert.alert('Served', 'All ready items marked as served!');
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-done" size={13} color="#fff" style={{ marginRight: 3 }} />
                        <Text style={styles.readyServeBtnText}>Serve All</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* List of kitchen items */}
                  {alreadyOrderedItems.map((item, idx) => (
                    <View key={`${item.ticketId}-${idx}`} style={styles.ticketItemRow}>
                      <View style={{ flex: 1.8 }}>
                        <Text style={styles.ticketItemName} numberOfLines={1}>{item.name}</Text>
                        {item.notes ? (
                          <Text style={styles.ticketItemNote} numberOfLines={1}>📝 {item.notes}</Text>
                        ) : null}
                        <Text style={styles.ticketItemMeta}>
                          {item.station === 'juice' ? '🍹 Bar' : '🍳 Main'} • {Math.max(0, Math.floor((now - item.timePlaced) / 60000))}m ago
                        </Text>
                      </View>

                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <TouchableOpacity 
                          style={[
                            styles.statusPillBadge,
                            item.status === 'served' 
                              ? styles.statusServedPill 
                              : item.status === 'ready' 
                                ? styles.statusReadyPill 
                                : item.status === 'pending'
                                  ? styles.statusPendingPill
                                  : styles.statusCookingPill
                          ]}
                          onPress={() => {
                            if (item.status === 'ready') {
                              markItemServed(item.ticketId, item.id, item.station || 'main');
                              broadcastImmediately();
                              if (Platform.OS !== 'web') {
                                Alert.alert('Served', `${item.name} served!`);
                              }
                            }
                          }}
                          disabled={item.status !== 'ready'}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.statusPillBadgeText,
                            { 
                              color: item.status === 'served' 
                                ? '#10B981' 
                                : item.status === 'ready' 
                                  ? '#0284C7' 
                                  : item.status === 'pending'
                                    ? '#D97706'
                                    : '#EA580C' 
                            }
                          ]}>
                            {item.qty}x {item.status === 'served' ? 'SERVED' : item.status === 'ready' ? 'SERVE' : item.status === 'pending' ? 'QUEUED' : 'COOKING'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={styles.ticketPortionText}>
                          {item.qty} {item.qty > 1 ? 'portions' : 'portion'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* SECTION B: NEW ROUND / CART ITEMS */}
              <View style={styles.newCartItemsContainer}>
                {newCart.length > 0 && (
                  <View style={styles.newAddonHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="add-circle" size={15} color="#10B981" />
                      <Text style={styles.newAddonHeaderTitle}>
                        {alreadyOrderedItems.length > 0 ? `New Round Add-on (#${activeTickets.length + 1})` : 'New Items'}
                      </Text>
                    </View>
                    <View style={styles.newAddonPortionsBadge}>
                      <Text style={styles.newAddonPortionsBadgeText}>
                        +{newCart.reduce((sum, c) => sum + c.qty, 0)} portions
                      </Text>
                    </View>
                  </View>
                )}

                {newCart.length === 0 && alreadyOrderedItems.length === 0 ? (
                  <View style={styles.emptyCartBox}>
                    <Ionicons name="fast-food-outline" size={40} color="#CBD5E1" />
                    <Text style={styles.emptyCartText}>No items in order</Text>
                    <Text style={styles.emptyCartSub}>Tap dishes on the menu to start order</Text>
                    {isMobile && (
                      <TouchableOpacity 
                        style={styles.openMenuCatalogBtn}
                        onPress={() => setMobileTab('menu')}
                      >
                        <Ionicons name="restaurant" size={14} color="#52141C" style={{ marginRight: 4 }} />
                        <Text style={styles.openMenuCatalogBtnText}>Browse Menu</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  newCart.map(c => (
                    <View key={c.item.id} style={styles.cartItemRow}>
                      <View style={{ flex: 1.8 }}>
                        <Text style={styles.cartItemName} numberOfLines={1}>{c.item.name}</Text>

                        {/* Cooking note chip */}
                        <TouchableOpacity 
                          style={[styles.cartItemNoteChip, c.notes && styles.cartItemNoteChipActive]}
                          onPress={() => openNoteModal(c)}
                          activeOpacity={0.7}
                        >
                          <Ionicons 
                            name="create-outline" 
                            size={11} 
                            color={c.notes ? '#B45309' : '#64748B'} 
                            style={{ marginRight: 3 }} 
                          />
                          <Text style={[styles.cartItemNoteText, c.notes && styles.cartItemNoteTextActive]} numberOfLines={1}>
                            {c.notes || '+ Note'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Stepper */}
                      <View style={styles.cartStepperBox}>
                        <TouchableOpacity 
                          style={styles.cartStepBtn}
                          onPress={() => updateCartQty(c.item.id, -1)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="remove" size={13} color="#1E293B" />
                        </TouchableOpacity>
                        <Text style={styles.cartStepQty}>{c.qty}</Text>
                        <TouchableOpacity 
                          style={styles.cartStepBtn}
                          onPress={() => updateCartQty(c.item.id, 1)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="add" size={13} color="#1E293B" />
                        </TouchableOpacity>
                      </View>

                      {/* Portions & Remove */}
                      <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <View style={styles.portionBadge}>
                          <Text style={styles.portionBadgeText}>
                            {c.qty} {c.qty > 1 ? 'portions' : 'portion'}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          onPress={() => removeFromCart(c.item.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={{ marginTop: 4 }}
                        >
                          <Ionicons name="close-circle" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            {/* --------------------------------------------------------
                BOTTOM SETTLEMENT CARD (AUTHENTIC POS CRYSTAL CARD)
                -------------------------------------------------------- */}
            <View style={[styles.cartBottomSettlement, isMobile && { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
              {/* Order Taker Summary Box (No Prices or Totals) */}
              <View style={styles.orderTakerSummaryBox}>
                <View style={styles.orderTakerSummaryRow}>
                  <View style={styles.orderTakerSummaryItem}>
                    <Text style={styles.orderTakerSummaryLabel}>In Kitchen</Text>
                    <Text style={styles.orderTakerSummaryValue}>
                      {alreadyOrderedItems.length} ({alreadyOrderedItems.reduce((s, i) => s + i.qty, 0)} portions)
                    </Text>
                  </View>
                  <View style={styles.orderTakerSummaryDivider} />
                  <View style={styles.orderTakerSummaryItem}>
                    <Text style={styles.orderTakerSummaryLabel}>New Round</Text>
                    <Text style={[styles.orderTakerSummaryValue, { color: '#10B981' }]}>
                      +{newCart.length} ({newCart.reduce((s, c) => s + c.qty, 0)} portions)
                    </Text>
                  </View>
                  <View style={styles.orderTakerSummaryDivider} />
                  <View style={styles.orderTakerSummaryItem}>
                    <Text style={styles.orderTakerSummaryLabel}>Round #</Text>
                    <Text style={[styles.orderTakerSummaryValue, { color: '#52141C' }]}>
                      #{activeTickets.length + 1}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Rush Order Priority Flag Toggle */}
              {newCart.length > 0 && (
                <TouchableOpacity 
                  style={[styles.rushOrderToggle, isRushOrder && styles.rushOrderToggleActive]}
                  onPress={() => setIsRushOrder(!isRushOrder)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash" size={15} color={isRushOrder ? '#D4AF37' : '#94A3B8'} />
                  <Text style={[styles.rushOrderToggleText, isRushOrder && styles.rushOrderToggleTextActive]}>
                    {isRushOrder ? '⚡ VIP RUSH PRIORITY' : 'Mark as Rush Order (Jaldi)'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Action Buttons */}
              {newCart.length > 0 ? (
                <TouchableOpacity 
                  style={styles.proceedPayBtn}
                  onPress={handleSendToKitchen}
                  activeOpacity={0.8}
                >
                  <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                  <Text style={styles.proceedPayBtnText}>
                    {alreadyOrderedItems.length > 0 
                      ? `Punch Add-on (Round #${activeTickets.length + 1})` 
                      : 'Send Order to Kitchen (KOT)'}
                  </Text>
                </TouchableOpacity>
              ) : isExistingOrderActive && !isTakeaway ? (
                <TouchableOpacity 
                  style={[styles.holdOrderBtn, isBilled && styles.holdOrderBtnDone]}
                  onPress={handleRequestBill}
                  activeOpacity={0.8}
                >
                  <Ionicons 
                    name={isBilled ? "checkmark-circle" : "receipt"} 
                    size={16} 
                    color={isBilled ? "#047857" : "#B45309"} 
                    style={{ marginRight: 6 }} 
                  />
                  <Text style={[styles.holdOrderBtnText, isBilled && styles.holdOrderBtnTextDone]}>
                    {isBilled ? 'Bill Requested from Cashier' : 'Request Final Bill from Cashier'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={styles.holdOrderBtn}
                  onPress={goBack}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={16} color="#52141C" style={{ marginRight: 6 }} />
                  <Text style={styles.holdOrderBtnText}>Back to Tables Floor</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

      </View>

      {/* ================= MODAL 1: COOKING INSTRUCTIONS / NOTES ================= */}
      <Modal visible={!!editingNoteItem} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Cooking Instructions</Text>
                <Text style={styles.modalSubtitle}>{editingNoteItem?.item.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditingNoteItem(null)}>
                <Ionicons name="close-circle" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Quick Presets Grid */}
            <Text style={styles.notePresetTitle}>Tap Quick Kitchen Presets:</Text>
            <View style={styles.notePresetsWrap}>
              {NOTE_PRESETS.map((p) => (
                <TouchableOpacity 
                  key={p} 
                  style={[styles.notePresetChip, noteDraft.includes(p) && styles.notePresetChipActive]}
                  onPress={() => appendNotePreset(p)}
                >
                  <Text style={[styles.notePresetText, noteDraft.includes(p) && styles.notePresetTextActive]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Cooking Note Input */}
            <Text style={[styles.notePresetTitle, { marginTop: 14 }]}>Custom Cooking Note:</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. Serve extra hot, separate sauces, no garnish..."
              placeholderTextColor="#94A3B8"
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn}
                onPress={() => setEditingNoteItem(null)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSaveBtn}
                onPress={saveItemNote}
              >
                <Text style={styles.modalSaveBtnText}>Save Instructions</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 2: VARIANT SELECTION ================= */}
      <Modal visible={!!variantModalItem} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxWidth: 400 }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVariantModalItem(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>Select Size / Portion</Text>
            <Text style={{ textAlign: 'center', marginBottom: 16, color: '#64748B', fontSize: 14 }}>
              {variantModalItem?.name}
            </Text>

            <View style={{ gap: 10 }}>
              {variantModalItem?.variants?.map((v, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.variantBtn}
                  onPress={() => handleVariantSelect(v)}
                >
                  <Text style={styles.variantName}>{v.name}</Text>
                  <Text style={[styles.variantPrice, { color: '#B45309' }]}>Select</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 3: MOVE / TRANSFER TABLE ================= */}
      <Modal visible={transferModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxWidth: 460, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🔀 Move Table Order</Text>
                <Text style={styles.modalSubtitle}>From: {tableName}</Text>
              </View>
              <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                <Ionicons name="close-circle" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 12 }}>
              Select an available table or Majlis cabin to move all active tickets and running orders:
            </Text>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {availableTransferTables.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="business-outline" size={36} color="#CBD5E1" />
                  <Text style={{ color: '#94A3B8', marginTop: 8, fontSize: 13 }}>No other tables currently available.</Text>
                </View>
              ) : (
                availableTransferTables.map((t) => {
                  const sType = getTableSeatingType(t);
                  const fName = getTableFloor(t);
                  return (
                    <TouchableOpacity 
                      key={t.id} 
                      style={styles.transferTableRow}
                      onPress={() => handleTransferTable(t)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <SeatingTypeIcon type={sType} size={18} color="#D4AF37" />
                        <View>
                          <Text style={styles.transferTableName}>{t.name}</Text>
                          <Text style={styles.transferTableFloor}>{fName} • {t.seats} Seats</Text>
                        </View>
                      </View>
                      <View style={styles.transferPickBtn}>
                        <Text style={styles.transferPickBtnText}>Move Here</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 4: GUEST COUNT (PAX) ================= */}
      <Modal visible={guestCountModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxWidth: 360 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Guest Count (Pax)</Text>
              <TouchableOpacity onPress={() => setGuestCountModalVisible(false)}>
                <Ionicons name="close-circle" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              How many guests are seated at {tableName}?
            </Text>

            <View style={styles.paxSelectorGrid}>
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((num) => (
                <TouchableOpacity 
                  key={num} 
                  style={[styles.paxBtn, table?.seats === num && styles.paxBtnActive]}
                  onPress={() => handleSetGuestCount(num)}
                >
                  <Text style={[styles.paxBtnText, table?.seats === num && styles.paxBtnTextActive]}>
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 5: RUNNING BILL SLIP PREVIEW ================= */}
      <Modal visible={billSlipModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxWidth: 440, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🧾 Running Bill Slip</Text>
                <Text style={styles.modalSubtitle}>{tableName}</Text>
              </View>
              <TouchableOpacity onPress={() => setBillSlipModalVisible(false)}>
                <Ionicons name="close-circle" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              <View style={styles.slipHeader}>
                <Text style={styles.slipBrand}>SULTAN RESTAURANT</Text>
                <Text style={styles.slipSub}>Table Bill Check • Server: {table?.server || user?.name || 'Sara Ahmed'}</Text>
                <Text style={styles.slipTime}>Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>

              <View style={styles.slipDivider} />

              {/* Items List */}
              <View style={{ gap: 6 }}>
                {runningInvoicePreview.items.map((it, idx) => (
                  <View key={idx} style={styles.slipItemRow}>
                    <Text style={styles.slipItemQty}>{it.qty}x</Text>
                    <Text style={styles.slipItemName}>{it.name}</Text>
                    <Text style={styles.slipItemPrice}>{it.qty} {it.qty > 1 ? 'portions' : 'portion'}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.slipDivider} />

              <View style={styles.slipTotalRow}>
                <Text style={styles.slipTotalLabel}>TOTAL PORTIONS:</Text>
                <Text style={styles.slipTotalVal}>
                  {runningInvoicePreview.items.reduce((s, i) => s + i.qty, 0)} portions
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity 
                style={styles.modalPrintBtn}
                onPress={() => printInvoiceReceipt(runningInvoicePreview)}
              >
                <Ionicons name="print" size={16} color="#52141C" style={{ marginRight: 6 }} />
                <Text style={styles.modalPrintBtnText}>Print Bill Slip</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSaveBtn}
                onPress={() => setBillSlipModalVisible(false)}
              >
                <Text style={styles.modalSaveBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#32070D', // Royal Sultan Burgundy safe area
  },

  /* --------------------------------------------------------
     1. TOP BAR (AUTHENTIC ROYAL SULTAN BURGUNDY THEME)
     -------------------------------------------------------- */
  topBar: {
    backgroundColor: '#35080E',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.35)',
    gap: 12,
  },
  topBarBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.2,
    borderColor: 'rgba(212, 175, 55, 0.38)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      } as any,
    }),
  },
  topBarBackText: {
    color: '#F3D179',
    fontSize: 12,
    fontWeight: '800',
  },
  topBarTableBlock: {
    flex: 1,
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  topBarIconOrb: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTableTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F3D179',
    letterSpacing: 0.3,
  },
  topBarSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  topBarSubtitleType: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F3D179',
  },
  topBarSubtitleFloor: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  topBarDot: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.35)',
  },
  paxChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  paxChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F3D179',
  },
  topBarBillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  topBarBillLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F3D179',
    textTransform: 'uppercase',
  },
  topBarBillAmount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  topBarActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.28)',
  },
  topBarActionBtnText: {
    color: '#F3D179',
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeOccupied: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  statusBadgeBilled: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  statusBadgeAvailable: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* --------------------------------------------------------
     2. MOBILE SWITCHER (< 850px)
     -------------------------------------------------------- */
  mobileSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(38, 5, 9, 0.98)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.35)',
  },
  mobileSwitchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  mobileSwitchBtnActive: {
    borderBottomColor: '#E5B83B',
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
  },
  mobileSwitchText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  mobileSwitchTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  mobileTabBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    marginLeft: 6,
  },
  mobileTabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  /* --------------------------------------------------------
     3. MAIN WORKSPACE
     -------------------------------------------------------- */
  mainWorkspace: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FAF8F5',
  },

  /* --------------------------------------------------------
     LEFT: CATEGORIES SIDEBAR (AUTHENTIC POS THEME)
     -------------------------------------------------------- */
  categorySidebar: {
    width: 220,
    backgroundColor: '#190306',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        backgroundImage: 'radial-gradient(circle at 50% 15%, rgba(212, 175, 55, 0.08) 0%, transparent 70%), linear-gradient(180deg, rgba(32, 5, 10, 0.98) 0%, rgba(18, 2, 5, 0.98) 100%)',
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.25)',
      } as any
    }),
    padding: 10,
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(212, 175, 55, 0.28)',
  },
  categorySidebarMobile: {
    width: '100%',
    maxHeight: 110,
    padding: 6,
    borderRightWidth: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.25)',
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  categoryTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryTitleIconOrb: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryHeading: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#E5B83B',
    letterSpacing: 1.1,
  },
  categoryCountPill: {
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  categoryCountPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FDE68A',
  },
  categoryViewSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 7,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 2,
  },
  viewSwitchBtn: {
    width: 22,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewSwitchBtnActive: {
    backgroundColor: '#E5B83B',
  },
  quickFindBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.55)',
    borderRadius: 22,
    paddingHorizontal: 7,
    paddingRight: 9,
    height: 38,
    marginBottom: 10,
    gap: 7,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 3px 14px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any
    }),
  },
  quickFindBoxFocused: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFFFF',
    transform: [{ scale: 1.02 }, { translateY: -1 }],
    ...Platform.select({
      web: {
        boxShadow: '0 6px 20px rgba(212, 175, 55, 0.35), 0 0 0 2px rgba(212, 175, 55, 0.5)',
      } as any
    }),
  },
  quickFindIconOrb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickFindInput: {
    flex: 1,
    height: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 2,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any
    }),
  },
  categoriesScroll: {
    flex: 1,
  },
  categoriesContainer: {
    paddingBottom: 10,
  },
  categoriesScrollMobile: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'space-between',
  },
  categoriesList: {
    flexDirection: 'column',
    gap: 6,
  },
  categoryTile: {
    width: Platform.OS === 'web' ? ('calc(50% - 4px)' as any) : '48%',
    height: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.2,
    borderColor: 'rgba(212, 175, 55, 0.18)',
    borderRadius: 12,
    padding: 7,
    justifyContent: 'space-between',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 3px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any
    }),
  },
  categoryTileMobile: {
    width: 105,
    height: 64,
  },
  categoryTileActive: {
    backgroundColor: '#E5B83B',
    borderColor: '#FFE082',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #F3C44E 0%, #D4AF37 55%, #B3861E 100%)',
        boxShadow: '0 8px 22px rgba(229, 184, 59, 0.45), inset 0 1px 0 rgba(255,255,255,0.8)',
        transform: 'translateY(-1.5px)',
      } as any
    }),
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileIconOrb: {
    width: 25,
    height: 25,
    borderRadius: 7,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconOrbActive: {
    backgroundColor: 'rgba(30, 41, 59, 0.15)',
    borderColor: 'rgba(30, 41, 59, 0.3)',
  },
  tileCountBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  tileCountBadgeActive: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
  },
  tileCountText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FDE68A',
  },
  tileCountTextActive: {
    color: '#F8FAFC',
  },
  categoryTileText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F1F5F9',
    textAlign: 'left',
    letterSpacing: 0.3,
  },
  categoryTileTextActive: {
    color: '#1E293B',
    fontWeight: '900',
  },
  categoryListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.2,
    borderColor: 'rgba(212, 175, 55, 0.18)',
    borderRadius: 10,
    paddingHorizontal: 9,
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any
    }),
  },
  categoryListRowActive: {
    backgroundColor: '#E5B83B',
    borderColor: '#FFE082',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #F3C44E 0%, #D4AF37 55%, #B3861E 100%)',
        boxShadow: '0 6px 18px rgba(229, 184, 59, 0.4), inset 0 1px 0 rgba(255,255,255,0.8)',
        transform: 'translateX(3px)',
      } as any
    }),
  },
  listIconOrb: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listIconOrbActive: {
    backgroundColor: 'rgba(30, 41, 59, 0.15)',
    borderColor: 'rgba(30, 41, 59, 0.3)',
  },
  categoryListText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: 0.3,
  },
  categoryListTextActive: {
    color: '#1E293B',
    fontWeight: '900',
  },
  listCountBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  listCountBadgeActive: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
  },
  listCountText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#FDE68A',
  },
  listCountTextActive: {
    color: '#F8FAFC',
  },
  categoryBottomPanel: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 175, 55, 0.22)',
    gap: 6,
  },
  bottomStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  bottomStatusTitle: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#A38B7C',
    letterSpacing: 0.9,
  },
  bottomStatusCount: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#E5B83B',
  },
  bottomActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 7,
  },
  bottomActiveIconOrb: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActiveName: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.4,
  },
  bottomResetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  bottomResetText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* --------------------------------------------------------
     CENTER: MENU DISHES GRID (AUTHENTIC POS THEME)
     -------------------------------------------------------- */
  centerCatalog: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  catalogSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.22)',
    gap: 10,
    flexWrap: 'wrap',
  },
  searchPillBox: {
    flex: 1,
    minWidth: 240,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.48)',
    borderRadius: 24,
    height: 40,
    paddingHorizontal: 8,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchPillBoxFocused: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFFFF',
  },
  searchIconOrb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconOrbFocused: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderColor: '#D4AF37',
  },
  searchPillInput: {
    flex: 1,
    height: '100%',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 2,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any
    }),
  },
  searchClearBtn: {
    padding: 3,
  },
  stationChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  stationPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stationPillActive: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
  },
  stationPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stationPillTextActive: {
    color: '#F3D179',
    fontWeight: '800',
  },

  /* Region / Cuisine Quick Filter Pills */
  posRegionFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.85)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 8,
  },
  posRegionFilterLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 6,
    borderRightWidth: 1,
    borderRightColor: 'rgba(226, 232, 240, 0.9)',
  },
  posRegionLeadIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posRegionFilterLeadText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#8A7A70',
    letterSpacing: 0.8,
  },
  posRegionScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
  },
  posRegionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 4,
  },
  posRegionChipActive: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
  },
  posRegionEmoji: {
    fontSize: 11,
  },
  posRegionChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  posRegionChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  posRegionChipBadge: {
    backgroundColor: 'rgba(241, 245, 249, 0.9)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  posRegionChipBadgeActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.3)',
  },
  posRegionChipBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
  },
  posRegionChipBadgeTextActive: {
    color: '#FDE68A',
  },

  /* Dishes Grid & Cards */
  dishesScrollView: {
    flex: 1,
  },
  dishesGridContainer: {
    padding: 12,
  },
  dishesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dishCard: {
    width: '18.8%',
    minWidth: 148,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 146,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    position: 'relative',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any
    }),
  },
  dishCardInCart: {
    borderColor: 'rgba(82, 20, 28, 0.55)',
    backgroundColor: 'rgba(255, 248, 248, 0.95)',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(82, 20, 28, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        transform: 'translateY(-2px)',
      } as any
    }),
  },
  inCartBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#52141C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 5,
  },
  inCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '900',
  },
  dishCardImageWrapper: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 7,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.7)',
  },
  dishCardImage: {
    width: '100%',
    height: '100%',
  },
  dishCardPlaceholderBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.35)',
  },
  dishCardChipsRow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 4,
    flexWrap: 'wrap',
  },
  dishCardCategoryChip: {
    backgroundColor: 'rgba(241, 245, 249, 0.88)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  dishCardCategory: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  dishCardRegionChip: {
    backgroundColor: 'rgba(82, 20, 28, 0.88)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  dishCardRegionText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FDE68A',
  },
  dishCardBadgeTag: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(82, 20, 28, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 4,
  },
  dishCardBadgeText: {
    color: '#D4AF37',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  dishSoldOutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  dishSoldOutText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.8,
    backgroundColor: '#DC2626',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  dishCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 16,
    marginVertical: 4,
  },
  dishCardPricePill: {
    backgroundColor: 'rgba(254, 243, 199, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  dishCardPricePillActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  dishCardPriceText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
  },
  dishCardPriceTextActive: {
    color: '#FFFFFF',
  },
  noItemsBox: {
    width: '100%',
    padding: 40,
    alignItems: 'center',
  },
  noItemsText: {
    color: '#94A3B8',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
  },

  /* Floating mobile review bar */
  floatingCartBar: {
    position: 'absolute',
    bottom: 16,
    left: 14,
    right: 14,
    backgroundColor: '#35080E',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingCartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingBadge: {
    backgroundColor: '#D4AF37',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBadgeText: {
    color: '#35080E',
    fontSize: 12,
    fontWeight: '900',
  },
  floatingCartText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  floatingCartRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingCartPrice: {
    color: '#F3D179',
    fontSize: 14.5,
    fontWeight: '900',
  },
  floatingCartSubText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 1,
  },
  floatingCartArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  /* --------------------------------------------------------
     RIGHT: CART SIDEBAR (AUTHENTIC POS CRYSTAL THEME)
     -------------------------------------------------------- */
  cartSidebar: {
    width: 430,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(212, 175, 55, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '-4px 0 28px rgba(0, 0, 0, 0.05), inset 1px 0 0 rgba(255, 255, 255, 0.8)',
      } as any
    }),
  },
  cartSidebarMobile: {
    width: '100%',
    borderLeftWidth: 0,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.8)',
  },
  cartHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E293B',
  },
  cartCountPill: {
    backgroundColor: '#52141C',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  cartCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  cartResetBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(254, 242, 242, 0.8)',
  },
  tableCabinBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.8)',
  },
  tableCabinLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  tableCabinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    maxWidth: 200,
  },
  tableCabinPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  tableCabinPillSub: {
    color: '#F59E0B',
    fontSize: 9.5,
    fontWeight: '700',
    marginLeft: 3,
  },
  changeTablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 14,
  },
  changeTablePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  cartColumnSubheader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.8)',
    backgroundColor: 'rgba(250, 250, 250, 0.6)',
  },
  cartColLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
  cartItemsScroll: {
    flex: 1,
  },

  /* Tickets Section (Already in Kitchen) */
  existingTicketSection: {
    backgroundColor: 'rgba(254, 252, 248, 0.95)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(229, 184, 59, 0.3)',
    padding: 10,
  },
  ticketSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  ticketSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  ticketSectionAmount: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#52141C',
  },
  readyAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#0284C7',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    gap: 8,
  },
  readyAlertTitle: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#0369A1',
  },
  readyAlertSubtitle: {
    fontSize: 10,
    color: '#075985',
  },
  readyServeBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  readyServeBtnText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '800',
  },
  ticketItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.9)',
  },
  ticketItemName: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  ticketItemNote: {
    fontSize: 10,
    color: '#B45309',
    marginTop: 1,
    fontStyle: 'italic',
  },
  ticketItemMeta: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },
  ticketItemPrice: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  statusPillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusPendingPill: {
    backgroundColor: '#FEF3C7',
  },
  statusCookingPill: {
    backgroundColor: '#FFEDD5',
  },
  statusReadyPill: {
    backgroundColor: '#E0F2FE',
  },
  statusServedPill: {
    backgroundColor: '#ECFDF5',
  },
  statusPillBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },

  /* New Cart Additions */
  newCartItemsContainer: {
    padding: 10,
  },
  newAddonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  newAddonHeaderTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  newAddonHeaderTotal: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#10B981',
  },
  emptyCartBox: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyCartText: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 6,
  },
  emptyCartSub: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  openMenuCatalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  openMenuCatalogBtnText: {
    color: '#52141C',
    fontSize: 12,
    fontWeight: '800',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.8)',
  },
  cartItemName: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  cartItemUnit: {
    fontSize: 10,
    color: '#94A3B8',
  },
  cartItemNoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
    alignSelf: 'flex-start',
    maxWidth: 160,
  },
  cartItemNoteChipActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  cartItemNoteText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  cartItemNoteTextActive: {
    color: '#92400E',
    fontWeight: '700',
  },
  cartStepperBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cartStepBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 245, 249, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStepQty: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#1E293B',
    minWidth: 18,
    textAlign: 'center',
  },
  cartItemTotal: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#1E293B',
  },

  /* Settlement Bottom (Frosted Glass) */
  cartBottomSettlement: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(229, 184, 59, 0.55)',
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.04)',
      } as any
    }),
  },
  mathSummaryLines: {
    gap: 3,
    marginBottom: 8,
  },
  mathLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mathLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  mathValue: {
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '700',
  },
  payableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.8)',
  },
  payableLabel: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  payableAmount: {
    fontSize: 19,
    fontWeight: '900',
    color: '#52141C',
  },
  rushOrderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.85)',
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 8,
  },
  rushOrderToggleActive: {
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    borderColor: '#D4AF37',
  },
  rushOrderToggleText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  rushOrderToggleTextActive: {
    color: '#92400E',
    fontWeight: '900',
  },
  proceedPayBtn: {
    backgroundColor: '#35080E',
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(229, 184, 59, 0.45)',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #3D070E 0%, #5E121C 50%, #440810 100%)',
        boxShadow: '0 6px 20px rgba(53, 8, 14, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
        cursor: 'pointer',
      } as any
    }),
  },
  proceedPayBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  holdOrderBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(203, 213, 225, 0.9)',
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdOrderBtnDone: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  holdOrderBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#52141C',
  },
  holdOrderBtnTextDone: {
    color: '#047857',
  },

  /* --------------------------------------------------------
     MODALS
     -------------------------------------------------------- */
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    width: '100%',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#52141C',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  closeBtnText: {
    color: '#EF4444',
    fontWeight: 'bold',
  },
  variantBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  variantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  variantPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#52141C',
  },
  notePresetTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  notePresetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  notePresetChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notePresetChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D4AF37',
  },
  notePresetText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  notePresetTextActive: {
    color: '#92400E',
    fontWeight: '800',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
    minHeight: 65,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
  },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: '#52141C',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  modalPrintBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#D4AF37',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrintBtnText: {
    color: '#52141C',
    fontWeight: '800',
    fontSize: 13,
  },
  transferTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  transferTableName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  transferTableFloor: {
    fontSize: 11,
    color: '#64748B',
  },
  transferPickBtn: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#D4AF37',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  transferPickBtnText: {
    color: '#52141C',
    fontSize: 11,
    fontWeight: '800',
  },
  paxSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  paxBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  paxBtnActive: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
  },
  paxBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  paxBtnTextActive: {
    color: '#F3D179',
  },
  slipHeader: {
    alignItems: 'center',
    marginBottom: 6,
  },
  slipBrand: {
    fontSize: 15,
    fontWeight: '900',
    color: '#52141C',
    letterSpacing: 1.5,
  },
  slipSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  slipTime: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  slipDivider: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  slipItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slipItemQty: {
    width: 24,
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  slipItemName: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
  },
  slipItemPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  slipTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  slipTotalLabel: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#1E293B',
  },
  slipTotalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#52141C',
  },
  topBarItemsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 14,
    gap: 5,
  },
  topBarItemsLabel: {
    fontSize: 11,
    color: '#F3D179',
    fontWeight: '700',
  },
  topBarItemsCount: {
    fontSize: 11.5,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  dishCardOrderPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  dishCardOrderPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10B981',
  },
  dishCardOrderText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
  },
  dishCardOrderTextActive: {
    color: '#059669',
    fontWeight: '900',
  },
  ticketPortionsBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  ticketPortionsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  ticketPortionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  newAddonPortionsBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  newAddonPortionsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  portionBadge: {
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(82, 20, 28, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52141C',
  },
  orderTakerSummaryBox: {
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  orderTakerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderTakerSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  orderTakerSummaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(203, 213, 225, 0.8)',
  },
  orderTakerSummaryLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  orderTakerSummaryValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
});
