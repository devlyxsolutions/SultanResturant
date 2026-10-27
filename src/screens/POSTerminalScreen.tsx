import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  StatusBar,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  useRestaurantStore, 
  MenuItem, 
  OrderItem, 
  Payment, 
  Invoice, 
  useAuthStore, 
  useDiscountStore, 
  EventDiscount 
} from '../store';
import { useShiftStore } from '../store/shiftStore';
import { useRolePermissions } from '../store/roleStore';
import { calculateOrderDiscount } from '../utils/discountCalculator';
import { broadcastImmediately } from '../services/syncService';
import InvoiceComponent from '../components/Invoice';
import PermissionDeniedScreen from '../components/PermissionDeniedScreen';
import SultanLogo from '../components/SultanLogo';
import {
  getTableFloor,
  getTableSeatingType,
  getFloorMeta,
  sortFloors,
  FLOOR_ORDER,
  SeatingZoneType,
  SEATING_ZONES,
} from '../constants/floors';
import SeatingTypeIcon from '../components/SeatingTypeIcon';

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

const getCuisineMeta = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('pakistan') || lower.includes('desi') || lower.includes('karahi') || lower.includes('bbq')) {
    return { icon: 'flame', emoji: '🇵🇰', color: '#16A34A' };
  }
  if (lower.includes('chinese') || lower.includes('asian')) {
    return { icon: 'restaurant', emoji: '🥢', color: '#DC2626' };
  }
  if (lower.includes('continental') || lower.includes('steak')) {
    return { icon: 'wine', emoji: '🥩', color: '#9333EA' };
  }
  if (lower.includes('arabic') || lower.includes('middle') || lower.includes('mandi')) {
    return { icon: 'moon', emoji: '🧆', color: '#D97706' };
  }
  if (lower.includes('turkish') || lower.includes('kebab')) {
    return { icon: 'sparkles', emoji: '🥙', color: '#E11D48' };
  }
  if (lower.includes('fast') || lower.includes('burger')) {
    return { icon: 'fast-food', emoji: '🍔', color: '#EA580C' };
  }
  if (lower.includes('italian') || lower.includes('pizza') || lower.includes('pasta')) {
    return { icon: 'pizza', emoji: '🍕', color: '#059669' };
  }
  return { icon: 'earth', emoji: '🍽️', color: '#B45309' };
};

interface POSTerminalScreenProps {
  role?: 'admin' | 'manager';
  backRoute?: string;
  shiftRoute?: string;
}

const LivePOSClock = React.memo(() => {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-GB'));
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-GB'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.clockText}>{time}</Text>;
});

export default function POSTerminalScreen({
  role = 'admin',
  backRoute = '/admin/dashboard',
  shiftRoute = '/admin/shift',
}: POSTerminalScreenProps) {
  const router = useRouter();
  const {
    prefillTableId,
    prefillCustomerId,
    prefillCustomerPhone,
    prefillCustomerName,
    prefillCustomerAddress,
    orderType: paramOrderType,
  } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isMobile = width < 850;

  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [categoryViewMode, setCategoryViewMode] = useState<'grid' | 'list'>('grid');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [pendingOrderSearchQuery, setPendingOrderSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const user = useAuthStore(state => state.user);
  const { can, canApplyCustomDiscount } = useRolePermissions();

  // Permission Guard
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

  // Restaurant Store
  const menuItems = useRestaurantStore(state => state.menuItems);
  const categories = useRestaurantStore(state => state.categories);
  const regions = useRestaurantStore(state => state.regions) || [];
  const customers = useRestaurantStore(state => state.customers);
  const tables = useRestaurantStore(state => state.tables);
  const zones = useRestaurantStore(state => state.zones);
  const addCustomer = useRestaurantStore(state => state.addCustomer);
  const updateCustomer = useRestaurantStore(state => state.updateCustomer);
  const saveInvoice = useRestaurantStore(state => state.saveInvoice);
  const placeOrder = useRestaurantStore(state => state.placeOrder);
  const settleBill = useRestaurantStore(state => state.settleBill);
  const markTableBilled = useRestaurantStore(state => state.markTableBilled);
  const dismissTicket = useRestaurantStore(state => state.dismissTicket);
  const clearTableTickets = useRestaurantStore(state => state.clearTableTickets);
  const clearAllOldTickets = useRestaurantStore(state => state.clearAllOldTickets);
  const tickets = useRestaurantStore(state => state.tickets);

  // Shift Store
  const shifts = useShiftStore(state => state.shifts);
  const activeShiftId = useShiftStore(state => state.activeShiftId);
  const activeShift = shifts.find(s => s.id === activeShiftId && s.status === 'open');

  // Menu State
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [variantModalItem, setVariantModalItem] = useState<MenuItem | null>(null);

  // Cart & Order State
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [loadedCart, setLoadedCart] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<'takeaway' | 'dine-in' | 'delivery'>('takeaway');
  
  // Selection State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedServer, setSelectedServer] = useState<string>('');

  // Modals
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [pendingOrdersModalVisible, setPendingOrdersModalVisible] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [customDiscountInput, setCustomDiscountInput] = useState('');

  // New Customer Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [isCreatingNewCustomer, setIsCreatingNewCustomer] = useState(false);

  // Payment & Event Promo State
  const campaigns = useDiscountStore(state => state.campaigns);
  const recordRedemption = useDiscountStore(state => state.recordRedemption);
  const [selectedEventCampaign, setSelectedEventCampaign] = useState<EventDiscount | null>(null);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [payments, setPayments] = useState<Payment[]>([{ type: 'cash', amount: 0 }]);

  const dynamicFloors = useRestaurantStore(state => state.floors);

  // Available floors computed identically to TablesBlueprintScreen (Sultan Architecture)
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

  // Table & Cabin Modal Multi-dimensional Filters
  const [tableModalFloor, setTableModalFloor] = useState<string>('All');
  const [tableModalSeatingType, setTableModalSeatingType] = useState<'all' | SeatingZoneType>('all');
  const [tableModalStatus, setTableModalStatus] = useState<'all' | 'available' | 'occupied'>('all');
  const [floorDropdownOpen, setFloorDropdownOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isCatSearchFocused, setIsCatSearchFocused] = useState(false);
  const [isTableSearchFocused, setIsTableSearchFocused] = useState(false);
  const [isCustSearchFocused, setIsCustSearchFocused] = useState(false);
  const [isPendingSearchFocused, setIsPendingSearchFocused] = useState(false);

  // Filtered Tables & Cabins for Modal
  const filteredModalTables = useMemo(() => {
    return tables.filter(t => {
      // 1. Floor Filter
      const tFloor = getTableFloor(t);
      if (tableModalFloor !== 'All' && tFloor.toLowerCase() !== tableModalFloor.toLowerCase()) {
        return false;
      }
      // 2. Seating Type Filter ('tables' | 'couches' | 'majlis')
      const tType = getTableSeatingType(t);
      if (tableModalSeatingType !== 'all' && tType !== tableModalSeatingType) {
        return false;
      }
      // 3. Status Filter
      if (tableModalStatus !== 'all') {
        if (tableModalStatus === 'available' && t.status !== 'available') return false;
        if (tableModalStatus === 'occupied' && t.status !== 'occupied' && t.status !== 'billed') return false;
      }
      // 4. Search Filter
      if (tableSearchQuery.trim()) {
        const q = tableSearchQuery.toLowerCase().trim();
        const matchesName = t.name.toLowerCase().includes(q);
        const matchesFloor = tFloor.toLowerCase().includes(q);
        const matchesServer = Boolean(t.server && t.server.toLowerCase().includes(q));
        const matchesType = tType.toLowerCase().includes(q) || (tType === 'majlis' && ('majlis'.includes(q) || 'cabin'.includes(q)));
        if (!matchesName && !matchesFloor && !matchesServer && !matchesType) {
          return false;
        }
      }
      return true;
    });
  }, [tables, tableModalFloor, tableModalSeatingType, tableModalStatus, tableSearchQuery]);

  // Print Preview & Post-Payment Table Decision
  const [generatedInvoice, setGeneratedInvoice] = useState<any>(null);
  const [tableDecisionModal, setTableDecisionModal] = useState<{ tableId: string; tableName: string; invoice: any } | null>(null);
  const [loadedTicketId, setLoadedTicketId] = useState<string | null>(null);
  const [shortcutsModalVisible, setShortcutsModalVisible] = useState(false);
  const searchInputRef = useRef<any>(null);
  const prefilledRef = useRef<string | null>(null);

  // Toggle Fullscreen (Browser Kiosk)
  const toggleFullscreen = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      } else {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  // Table Selection
  const handleTableSelect = (tId: string) => {
    setSelectedTableId(tId);
    setOrderType('dine-in');
    setTableModalVisible(false);
    
    const tableTickets = tickets.filter(t => t.tableId === tId);
    const targetTable = tables.find(t => t.id === tId);
    let combinedItems: OrderItem[] = [];

    if (tableTickets.length > 0) {
      tableTickets.forEach(ticket => {
        ticket.items.forEach(ti => {
          const existing = combinedItems.find(i => i.id === ti.id);
          if (existing) {
            existing.qty += ti.qty;
          } else {
            combinedItems.push({ ...ti });
          }
        });
      });
    } else if (targetTable && targetTable.orders && targetTable.orders.length > 0) {
      combinedItems = targetTable.orders.map(o => ({ ...o }));
    }

    const foundWaiter = targetTable?.server || tableTickets.find(t => t.server && !t.server.toLowerCase().includes('pos'))?.server;
    setSelectedServer(foundWaiter || '');

    if (combinedItems.length > 0) {
      setCart(combinedItems);
      setLoadedCart(JSON.parse(JSON.stringify(combinedItems)));
      if (isMobile) {
        setMobileTab('cart');
      }
    } else {
      setCart([]);
      setLoadedCart([]);
    }
  };

  const handleClearSelectedTable = () => {
    if (!selectedTableId) return;
    const targetTable = tables.find(t => t.id === selectedTableId);
    const confirmMsg = `Are you sure you want to release ${targetTable ? targetTable.name : 'this table'}? Running bill will be reset.`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        settleBill(selectedTableId);
        clearTableTickets(selectedTableId);
        setCart([]);
        setLoadedCart([]);
        setSelectedTableId('');
      }
    } else {
      Alert.alert('Release Table', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Release', 
          style: 'destructive', 
          onPress: () => {
            settleBill(selectedTableId);
            clearTableTickets(selectedTableId);
            setCart([]);
            setLoadedCart([]);
            setSelectedTableId('');
          } 
        }
      ]);
    }
  };

  useEffect(() => {
    if (prefillTableId && typeof prefillTableId === 'string' && prefilledRef.current !== prefillTableId) {
      prefilledRef.current = prefillTableId;
      setOrderType('dine-in');
      handleTableSelect(prefillTableId);
    }
  }, [prefillTableId]);

  const prefilledCustRef = useRef<string | null>(null);
  useEffect(() => {
    const custKey = (prefillCustomerId || prefillCustomerPhone) as string | undefined;
    if (custKey && prefilledCustRef.current !== custKey) {
      prefilledCustRef.current = custKey;
      if (prefillCustomerId && typeof prefillCustomerId === 'string') {
        setSelectedCustomerId(prefillCustomerId);
      }
      setSelectedTableId('');
      setOrderType(
        paramOrderType === 'takeaway' || paramOrderType === 'delivery'
          ? paramOrderType
          : 'delivery'
      );
      if (prefillCustomerName && typeof prefillCustomerName === 'string') {
        setCustomerName(prefillCustomerName);
      }
      if (prefillCustomerPhone && typeof prefillCustomerPhone === 'string') {
        setCustomerPhone(prefillCustomerPhone);
      }
      if (prefillCustomerAddress && typeof prefillCustomerAddress === 'string') {
        setCustomerAddress(prefillCustomerAddress);
      }
    }
  }, [
    prefillCustomerId,
    prefillCustomerPhone,
    prefillCustomerName,
    prefillCustomerAddress,
    paramOrderType,
  ]);

  // Categories list for 2-column sidebar (Auto-syncs dynamic categories from catalog)
  const categoryTiles = useMemo(() => {
    const set = new Set<string>();
    (categories || []).forEach(c => {
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
  }, [categories, menuItems, categorySearchQuery]);

  // Live dish count map per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: (menuItems || []).length,
    };
    (menuItems || []).forEach(m => {
      if (m.category) {
        const key = m.category.trim();
        counts[key] = (counts[key] || 0) + 1;
        counts[key.toUpperCase()] = (counts[key.toUpperCase()] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return (menuItems || []).filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        item.name.toLowerCase().includes(q) || 
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.region && item.region.toLowerCase().includes(q)) ||
        (item.badge && item.badge.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Region / Cuisine filter
      if (activeRegion !== 'ALL') {
        if ((item.region || '').trim().toLowerCase() !== activeRegion.trim().toLowerCase()) {
          return false;
        }
      }

      if (activeCategory === 'ALL' || activeCategory === 'All') return true;
      if (activeCategory === '🎁 Deals & Combos' || activeCategory === 'Deals') {
        return Boolean(item.isDeal || (item.category && item.category.toLowerCase() === 'deals'));
      }
      return (item.category || '').trim().toLowerCase() === activeCategory.trim().toLowerCase();
    });
  }, [menuItems, searchQuery, activeCategory, activeRegion]);

  // Real-time cuisine item counts for badges
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    (menuItems || []).forEach(item => {
      const matchesCategory = 
        activeCategory === 'ALL' || activeCategory === 'All' ? true :
        (activeCategory === '🎁 Deals & Combos' || activeCategory === 'Deals') ? Boolean(item.isDeal || (item.category && item.category.toLowerCase() === 'deals')) :
        (item.category || '').trim().toLowerCase() === activeCategory.trim().toLowerCase();

      if (!matchesCategory) return;

      counts.ALL = (counts.ALL || 0) + 1;
      const reg = (item.region || '').trim();
      if (reg) {
        const matched = regions.find(r => r.toLowerCase() === reg.toLowerCase()) || reg;
        counts[matched] = (counts[matched] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems, activeCategory, regions]);

  // Financial Calculations
  const subTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discountVal = parseFloat(discountAmount) || 0;
  const afterDiscount = Math.max(0, subTotal - discountVal);
  const deliveryCharges = orderType === 'delivery' ? 150 : 0;
  const tax = afterDiscount * 0.16;
  const total = afterDiscount + tax + deliveryCharges;

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, total - totalPaid);
  const changeDue = Math.max(0, totalPaid - total);

  const handleSetFullPayment = () => {
    const exact = Math.round(total);
    setPayments(prev => [{ type: prev[0]?.type || 'cash', amount: exact }]);
  };

  const handleSetPaymentAmount = (amt: number) => {
    setPayments(prev => [{ type: prev[0]?.type || 'cash', amount: amt }]);
  };

  const handleCancelRunningOrder = (ticketId: string) => {
    const confirmMsg = `Are you sure you want to cancel and remove Ticket #${ticketId}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        dismissTicket(ticketId);
        if (loadedTicketId === ticketId) setLoadedTicketId(null);
      }
    } else {
      Alert.alert('Cancel Order', confirmMsg, [
        { text: 'Keep Order', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive', 
          onPress: () => {
            dismissTicket(ticketId);
            if (loadedTicketId === ticketId) setLoadedTicketId(null);
          }
        }
      ]);
    }
  };

  const handleClearAllOrphanTickets = () => {
    if ((tickets || []).length === 0) return;
    const confirmMsg = "Are you sure you want to clear all running tickets? This will purge all old pending orders.";
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        clearAllOldTickets();
        setLoadedTicketId(null);
      }
    } else {
      Alert.alert('Purge Running Orders', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive', 
          onPress: () => {
            clearAllOldTickets();
            setLoadedTicketId(null);
          }
        }
      ]);
    }
  };

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);
  const selectedTableObj = tables.find(t => t.id === selectedTableId);

  // ------------------------------------------------------------------
  // GLOBAL POS KEYBOARD SHORTCUTS ENGINE
  // ------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      // F1 or Ctrl+K / Ctrl+/: Focus Dish Search Bar
      if (e.key === 'F1' || (e.ctrlKey && (e.key === 'k' || e.key === 'K' || e.key === '/'))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Escape: Close active modal or clear search
      if (e.key === 'Escape') {
        if (shortcutsModalVisible) {
          setShortcutsModalVisible(false);
          return;
        }
        if (checkoutModalVisible) {
          setCheckoutModalVisible(false);
          return;
        }
        if (pendingOrdersModalVisible) {
          setPendingOrdersModalVisible(false);
          return;
        }
        if (tableModalVisible) {
          setTableModalVisible(false);
          return;
        }
        if (customerModalVisible) {
          setCustomerModalVisible(false);
          return;
        }
        if (discountModalVisible) {
          setDiscountModalVisible(false);
          return;
        }
        if (variantModalItem) {
          setVariantModalItem(null);
          return;
        }
        if (tableDecisionModal) {
          setTableDecisionModal(null);
          return;
        }
        if (searchQuery) {
          setSearchQuery('');
          return;
        }
        searchInputRef.current?.blur();
        return;
      }

      // If Checkout Modal is open
      if (checkoutModalVisible) {
        // F10 or Ctrl+F: Full Payment
        if (e.key === 'F10' || (e.ctrlKey && (e.key === 'f' || e.key === 'F'))) {
          e.preventDefault();
          handleSetFullPayment();
          return;
        }
        // Enter: Finalize and Confirm Payment
        if (e.key === 'Enter') {
          e.preventDefault();
          handleFinalizeOrder();
          return;
        }
      }

      // If typing inside an input/search, don't trigger regular navigation keys unless using F-keys
      if (isInput && !e.key.startsWith('F')) {
        return;
      }

      // F2: Dine-in Mode / Select Table
      if (e.key === 'F2') {
        e.preventDefault();
        handleOrderTypeChange('dine-in');
        return;
      }

      // F3: Takeaway Mode
      if (e.key === 'F3') {
        e.preventDefault();
        handleOrderTypeChange('takeaway');
        return;
      }

      // F4: Delivery Mode
      if (e.key === 'F4') {
        e.preventDefault();
        handleOrderTypeChange('delivery');
        return;
      }

      // F6 or Ctrl+R: Running Orders Modal
      if (e.key === 'F6' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        setPendingOrdersModalVisible(prev => !prev);
        return;
      }

      // F7 or Ctrl+D: Apply Discount Modal
      if (e.key === 'F7' || (e.ctrlKey && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        setDiscountModalVisible(true);
        return;
      }

      // F8 or Ctrl+H: Hold / Send KOT to Kitchen
      if (e.key === 'F8' || (e.ctrlKey && (e.key === 'h' || e.key === 'H'))) {
        e.preventDefault();
        if (cart.length > 0) {
          sendToKitchen();
        }
        return;
      }

      // F9 or Ctrl+Enter: Proceed to Payment / Checkout
      if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (cart.length > 0) {
          openCheckout();
        }
        return;
      }

      // F11 or '?' key: Open Shortcuts Cheat Sheet
      if (e.key === 'F11' || (!isInput && e.key === '?')) {
        e.preventDefault();
        setShortcutsModalVisible(prev => !prev);
        return;
      }

      // F12 or Ctrl+Delete: Clear Cart / New Order
      if (e.key === 'F12' || (e.ctrlKey && e.key === 'Delete')) {
        e.preventDefault();
        if (cart.length > 0) {
          clearCart();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    checkoutModalVisible,
    pendingOrdersModalVisible,
    tableModalVisible,
    customerModalVisible,
    discountModalVisible,
    variantModalItem,
    tableDecisionModal,
    shortcutsModalVisible,
    cart,
    total,
    remaining,
    searchQuery,
    orderType,
  ]);

  // Recalculate Promo Discount
  useEffect(() => {
    if (selectedEventCampaign) {
      if (cart.length === 0) {
        setDiscountAmount('0');
        return;
      }
      const cartWithCat = cart.map(ci => {
        const baseId = ci.id.split('-')[0];
        const mi = menuItems.find(m => m.id === baseId || m.id === ci.id);
        return {
          id: ci.id,
          name: ci.name,
          price: ci.price,
          qty: ci.qty,
          category: mi?.category || 'Mains'
        };
      });
      const res = calculateOrderDiscount(selectedEventCampaign, cartWithCat, subTotal);
      if (res.eligible && res.discountAmount > 0) {
        setDiscountAmount(res.discountAmount.toString());
      } else {
        setDiscountAmount('0');
      }
    }
  }, [cart, selectedEventCampaign, subTotal, menuItems]);

  const handleOrderTypeChange = (type: 'takeaway' | 'dine-in' | 'delivery') => {
    setOrderType(type);
    if (type === 'dine-in') {
      setSelectedCustomerId('');
      setTableModalVisible(true);
    } else {
      setSelectedTableId('');
      setCustomerSearchQuery('');
      setIsCreatingNewCustomer(false);
      setCustomerModalVisible(true);
    }
  };

  const addToCart = (item: MenuItem) => {
    if (item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0) {
      const msg = `⚠️ "${item.name}" is currently Sold Out.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Sold Out', msg);
      return;
    }

    if (item.variants && item.variants.length > 0) {
      setVariantModalItem(item);
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [
        ...prev, 
        { 
          id: item.id, 
          name: item.name, 
          price: item.price, 
          qty: 1, 
          completed: false, 
          station: item.station || 'main' 
        }
      ];
    });
  };

  const handleVariantSelect = (variant: { name: string; price: number }) => {
    if (!variantModalItem) return;

    const variantId = `${variantModalItem.id}-${variant.name}`;
    const variantName = `${variantModalItem.name} (${variant.name})`;

    setCart(prev => {
      const existing = prev.find(i => i.id === variantId);
      if (existing) {
        return prev.map(i => i.id === variantId ? { ...i, qty: i.qty + 1 } : i);
      }
      return [
        ...prev, 
        { 
          id: variantId, 
          name: variantName, 
          price: variant.price, 
          qty: 1, 
          completed: false, 
          station: variantModalItem.station || 'main' 
        }
      ];
    });

    setVariantModalItem(null);
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, qty: Math.max(1, i.qty + delta) };
      }
      return i;
    }));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.id !== id));
  const clearCart = () => {
    setCart([]);
    setLoadedCart([]);
    setSelectedCustomerId('');
    setSelectedTableId('');
    setDiscountAmount('0');
  };

  const handleSaveNewCustomer = () => {
    if (!customerName || !customerPhone) {
      if (Platform.OS === 'web') window.alert("Name and Phone required");
      else Alert.alert("Error", "Name and Phone required");
      return;
    }
    const existing = customers.find(c => c.phone === customerPhone);
    if (existing) {
      updateCustomer(existing.id, { name: customerName, address: customerAddress });
      setSelectedCustomerId(existing.id);
    } else {
      addCustomer({ name: customerName, phone: customerPhone, address: customerAddress });
      if (Platform.OS === 'web') window.alert("Customer registered successfully.");
    }
    setIsCreatingNewCustomer(false);
  };

  const sendToKitchen = () => {
    if (cart.length === 0) return;
    if (orderType === 'dine-in' && !selectedTableId) {
      if (Platform.OS === 'web') window.alert("Please assign a dining table first.");
      return;
    }
    
    const tId = orderType === 'dine-in' ? selectedTableId : orderType;
    
    const kotItems: { item: MenuItem; qty: number }[] = [];
    cart.forEach(cartItem => {
      const loadedItem = loadedCart.find(i => i.id === cartItem.id);
      const loadedQty = loadedItem ? loadedItem.qty : 0;
      if (cartItem.qty > loadedQty) {
        const baseId = cartItem.id.split('-')[0];
        const baseMenu = menuItems.find(m => m.id === baseId || m.id === cartItem.id);
        const itemObj: MenuItem = baseMenu ? {
          ...baseMenu,
          id: cartItem.id,
          name: cartItem.name,
          price: cartItem.price,
          station: cartItem.station || baseMenu.station || 'main'
        } : {
          id: cartItem.id,
          name: cartItem.name,
          price: cartItem.price,
          category: 'Mains',
          station: cartItem.station || 'main'
        };

        kotItems.push({
          item: itemObj,
          qty: cartItem.qty - loadedQty
        });
      }
    });

    if (kotItems.length === 0) {
      if (Platform.OS === 'web') window.alert("No new items to send.");
      else Alert.alert("Info", "No new items to send.");
      return;
    }
    
    const isAddOn = loadedCart.length > 0;
    placeOrder(tId, `${user?.name || 'Staff'} (POS)`, kotItems, isAddOn);
    setLoadedCart(JSON.parse(JSON.stringify(cart)));
    
    const alertMsg = isAddOn 
      ? `Add-on items sent to Kitchen!` 
      : `Order sent to Kitchen! Table occupied.`;
    if (Platform.OS === 'web') window.alert(alertMsg);
    else Alert.alert("Kitchen Notified", alertMsg);
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    if (orderType === 'dine-in' && !selectedTableId) {
      const msg = "Please select a table for Dine-in orders.";
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert("Select Table", msg);
      return;
    }
    if (orderType === 'delivery' && !selectedCustomerId) {
      const msg = "Please select customer contact and address for delivery orders.";
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert("Customer Contact Required", msg);
      return;
    }
    // Pre-fill payment with exact full amount
    setPayments([{ type: 'cash', amount: Math.round(total) }]);
    setCheckoutModalVisible(true);
  };

  const handleCreateBillFromTicket = (ticket: typeof tickets[0], autoOpenCheckout = true) => {
    setLoadedTicketId(ticket.id);

    const isTable = ticket.tableId && ticket.tableId !== 'takeaway' && ticket.tableId !== 'delivery';
    const targetTable = isTable ? tables.find(t => 
      t.id === ticket.tableId || 
      (ticket.tableName && t.name.trim().toLowerCase() === ticket.tableName.trim().toLowerCase())
    ) : null;

    if (targetTable) {
      handleTableSelect(targetTable.id);
    } else {
      const isDelivery = ticket.tableId?.toLowerCase() === 'delivery';
      setOrderType(isDelivery ? 'delivery' : 'takeaway');
      setSelectedTableId('');
      setSelectedServer(ticket.server || '');
      
      const itemsCopy = ticket.items.map(i => ({ ...i }));
      setCart(itemsCopy);
      setLoadedCart(JSON.parse(JSON.stringify(itemsCopy)));
    }

    setPendingOrdersModalVisible(false);

    if (autoOpenCheckout) {
      setTimeout(() => {
        const ticketSub = ticket.items.reduce((s, it) => s + (it.price * it.qty), 0);
        const ticketTax = ticketSub * 0.16;
        const ticketTotal = Math.round(ticketSub + ticketTax);
        setPayments([{ type: 'cash', amount: ticketTotal }]);
        setCheckoutModalVisible(true);
      }, 150);
    } else if (isMobile) {
      setMobileTab('cart');
    }
  };

  const handleFinalizeOrder = () => {
    const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const remainingToCollect = total - totalCollected;

    if (remainingToCollect > 0.01) {
      const msg = `Please collect full payment. Remaining due: Rs. ${remainingToCollect.toFixed(2)}`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert("Incomplete Payment", msg);
      return;
    }

    const targetTableId = selectedTableId;
    const targetTableName = selectedTableObj?.name || `Table ${targetTableId}`;
    const wasDineIn = orderType === 'dine-in' && targetTableId;

    const currentUserName = user?.name ? (user.name.includes('(Admin)') ? user.name : `${user.name} (Admin)`) : 'Junaid Ahsan (Admin)';
    const orderCreator = selectedServer || (wasDineIn ? 'Sara Ahmed' : currentUserName);
    const cashierName = currentUserName;

    const changeDueAmount = Math.max(0, totalCollected - total);

    const invoicePayments = payments
      .filter(p => (Number(p.amount) || 0) > 0)
      .map(p => {
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
      total,
      payments: invoicePayments,
      tenderedAmount: totalCollected,
      changeReturned: changeDueAmount,
    });

    const unsentKotItems: { item: MenuItem; qty: number }[] = [];
    cart.forEach(cartItem => {
      const loadedQty = loadedCart.filter(lc => lc.id === cartItem.id).reduce((s, lc) => s + lc.qty, 0);
      if (cartItem.qty > loadedQty) {
        const baseMenu = menuItems.find(m => m.id === cartItem.id || cartItem.id.startsWith(`${m.id}-`));
        const itemObj: MenuItem = baseMenu ? {
          ...baseMenu,
          id: cartItem.id,
          name: cartItem.name,
          price: cartItem.price,
          station: cartItem.station || baseMenu.station || 'main'
        } : {
          id: cartItem.id,
          name: cartItem.name,
          price: cartItem.price,
          category: 'Mains',
          station: cartItem.station || 'main'
        };
        unsentKotItems.push({ item: itemObj, qty: cartItem.qty - loadedQty });
      }
    });

    if (unsentKotItems.length > 0) {
      const kotTarget = targetTableId || (orderType === 'delivery' ? 'delivery' : 'takeaway');
      placeOrder(kotTarget, cashierName, unsentKotItems, loadedCart.length > 0);
    }

    saveInvoice(invoice);

    // Clean up ticket from pending orders
    if (loadedTicketId) {
      dismissTicket(loadedTicketId);
      setLoadedTicketId(null);
    }
    if (targetTableId) {
      clearTableTickets(targetTableId);
    } else if (orderType === 'takeaway' || orderType === 'delivery') {
      const matching = (tickets || []).find(t => t.tableId === orderType);
      if (matching) {
        dismissTicket(matching.id);
      }
    }

    broadcastImmediately();

    if (selectedCustomerObj) {
      updateCustomer(selectedCustomerObj.id, {
        totalOrders: selectedCustomerObj.totalOrders + 1,
        totalSpent: selectedCustomerObj.totalSpent + total,
      });
    }

    setCart([]);
    setLoadedCart([]);
    setSelectedEventCampaign(null);
    setDiscountAmount('0');
    setCheckoutModalVisible(false);
    setSelectedCustomerId('');
    setSelectedTableId('');

    if (wasDineIn) {
      setTableDecisionModal({
        tableId: targetTableId,
        tableName: targetTableName,
        invoice,
      });
    } else {
      setGeneratedInvoice(invoice);
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

  return (
    <View style={styles.fullscreenContainer}>
      <StatusBar barStyle="light-content" />

      {/* ========================================================
          1. BAITHAK TOP HEADER (Dark Maroon with Gold Accents)
          ======================================================== */}
      <View style={[styles.topHeader, isMobile && { paddingHorizontal: 10, height: 48 }]}>
        {/* Left Side: Back Arrow + Brand Calligraphy + Live Clock */}
        <View style={[styles.headerLeft, isMobile && { gap: 8 }]}>
          <TouchableOpacity 
            style={styles.backBtn}
            onPress={() => router.replace(backRoute as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#D4AF37" />
          </TouchableOpacity>

          <View style={styles.brandBox}>
            <SultanLogo size="xs" width={22} height={22} style={{ marginRight: 6 }} />
            <Text style={styles.brandTitle}>{isMobile ? 'SULTAN POS' : 'SULTAN RESTAURANT'}</Text>
          </View>

          {!isMobile && <LivePOSClock />}
        </View>

        {/* Right Side: Shift Status + Fullscreen + Admin Avatar */}
        <View style={[styles.headerRight, isMobile && { gap: 6 }]}>
          <TouchableOpacity 
            style={[styles.shiftCapsule, isMobile && { paddingHorizontal: 7, paddingVertical: 4 }]} 
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
            onPress={() => router.push(shiftRoute as any)}
            activeOpacity={0.8}
          >
            <View
              {...(Platform.OS === 'web' ? ({ className: 'pulse-beacon' } as any) : {})}
              style={styles.shiftDot}
            />
            <Text style={styles.shiftText}>
              {activeShift ? `Shift #${activeShift.id.slice(-6)}` : 'Shift #Active'}
            </Text>
          </TouchableOpacity>

          {/* Keyboard Shortcuts Capsule Button (Desktop only) */}
          {!isMobile && (
            <TouchableOpacity 
              style={styles.keyboardCapsuleBtn}
              onPress={() => setShortcutsModalVisible(true)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Keyboard Shortcuts (Press F11 or ?)' } as any) : {})}
            >
              <Ionicons name="keypad-outline" size={14} color="#D4AF37" />
              <Text style={styles.keyboardCapsuleText}>Shortcuts</Text>
              <View style={styles.keyInlinePill}>
                <Text style={styles.keyInlinePillText}>F11</Text>
              </View>
            </TouchableOpacity>
          )}

          {!isMobile && Platform.OS === 'web' && (
            <TouchableOpacity 
              style={styles.iconSquareBtn}
              onPress={toggleFullscreen}
              activeOpacity={0.7}
            >
              <Ionicons name={isFullscreen ? "contract-outline" : "scan-outline"} size={16} color="#D4AF37" />
            </TouchableOpacity>
          )}

          <View style={styles.userSection}>
            {!isMobile && <Text style={styles.roleLabel}>{user?.name || 'admin'}</Text>}
            <View style={styles.userAvatarCircle}>
              <Text style={styles.userAvatarText}>
                {(user?.name || 'A')[0].toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Mobile Mode Switcher Bar */}
      {isMobile && (
        <View style={styles.mobileSwitcher}>
          <TouchableOpacity 
            style={[styles.mobileSwitchBtn, mobileTab === 'menu' && styles.mobileSwitchBtnActive]}
            onPress={() => setMobileTab('menu')}
          >
            <Text style={[styles.mobileSwitchText, mobileTab === 'menu' && styles.mobileSwitchTextActive]}>
              Menu Dishes ({filteredItems.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mobileSwitchBtn, mobileTab === 'cart' && styles.mobileSwitchBtnActive]}
            onPress={() => setMobileTab('cart')}
          >
            <Text style={[styles.mobileSwitchText, mobileTab === 'cart' && styles.mobileSwitchTextActive]}>
              Current Cart ({cart.reduce((s, i) => s + i.qty, 0)})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================
          2. MAIN 3-SECTION WORKSPACE
          [LEFT: 2-Col Categories] [CENTER: Dishes Grid] [RIGHT: Cart]
          ======================================================== */}
      <View style={[styles.mainWorkspace, isMobile && { flexDirection: 'column' }]}>

        {/* --------------------------------------------------------
            LEFT: CATEGORIES 2-COLUMN TILES (BAITHAK PATTERN)
            -------------------------------------------------------- */}
        {(!isMobile || mobileTab === 'menu') && (
          <View style={[styles.categorySidebar, isMobile && styles.categorySidebarMobile]}>
            {/* Header: Title + Total Badge + Grid/List Toggle */}
            <View style={styles.categoryHeaderRow}>
              <View style={styles.categoryTitleGroup}>
                <View style={styles.categoryTitleIconOrb}>
                  <Ionicons name="apps" size={12} color="#E5B83B" />
                </View>
                <Text style={styles.categoryHeading}>CATEGORIES</Text>
                <View style={styles.categoryCountPill}>
                  <Text style={styles.categoryCountPillText}>{categoryTiles.length + 1}</Text>
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

            {/* Quick Find Category Search Box */}
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
                categoryViewMode === 'grid' && styles.categoriesGrid,
                categoryViewMode === 'list' && styles.categoriesList,
              ]}
              showsVerticalScrollIndicator={false}
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
            CENTER: DISH CATALOG GRID (5 COLUMNS ON DESKTOP)
            -------------------------------------------------------- */}
        {(!isMobile || mobileTab === 'menu') && (
          <View style={styles.centerCatalog}>
            {/* Catalog Top Subheader Bar */}
            <View style={[styles.catalogSubheader, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }]}>
              <View style={[styles.catalogTitleRow, isMobile && { justifyContent: 'space-between', width: '100%' }]}>
                <Text style={[styles.catalogTitle, isMobile && { fontSize: 13.5 }]}>{isMobile ? 'Menu Catalog' : 'SULTAN RESTAURANT Menu'}</Text>

                {/* Running Orders Pill */}
                <TouchableOpacity 
                  style={styles.runningOrdersPill}
                  {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                  onPress={() => setPendingOrdersModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="time" size={13} color="#D97706" />
                  <Text style={styles.runningOrdersText}>Running</Text>
                  {!isMobile && <View style={styles.keyBadgeTiny}><Text style={styles.keyBadgeTinyText}>F6</Text></View>}
                  <View style={styles.runningOrdersBadge}>
                    <Text style={styles.runningOrdersBadgeText}>{(tickets || []).length}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Sultan Royal Luxury Search Bar */}
              <View 
                style={[
                  styles.searchPillBox, 
                  isSearchFocused && styles.searchPillBoxFocused,
                  isMobile && { minWidth: 0, width: '100%', height: 40 }
                ]}
                {...(Platform.OS === 'web' ? ({ className: 'search-pill-box search-bar-pop', 'data-search-box': 'true' } as any) : {})}
              >
                <View style={[styles.searchIconOrb, isSearchFocused && styles.searchIconOrbFocused]}>
                  <Ionicons name="search" size={15} color={isSearchFocused ? '#D4AF37' : '#52141C'} />
                </View>
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchPillInput}
                  placeholder={isMobile ? "Search dishes or code..." : "Search dishes, codes, or categories... (Press F1)"}
                  placeholderTextColor="#8A7A70"
                  value={searchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                  <TouchableOpacity 
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.searchClearBtn}
                  >
                    <Ionicons name="close-circle" size={18} color="#D4AF37" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.searchShortcutBadge}>
                    <Text style={styles.searchShortcutText}>F1</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Region / Cuisine Quick Filter Pills */}
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
                      size={13} 
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

            {/* Dishes Grid */}
            <ScrollView 
              style={styles.dishesScrollView}
              contentContainerStyle={styles.dishesGridContainer}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.dishesGrid}>
                {filteredItems.map(item => {
                  const inCartQty = cart
                    .filter(c => c.id === item.id || c.id.startsWith(`${item.id}-`))
                    .reduce((sum, c) => sum + c.qty, 0);
                  const isItemInCart = inCartQty > 0;
                  const isOutOfStock = Boolean(item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
                      style={[
                        styles.dishCard,
                        isItemInCart && styles.dishCardInCart,
                        isOutOfStock && { opacity: 0.65 },
                        isMobile && { 
                          width: width < 420 ? '47.5%' : width < 720 ? '31%' : '23.5%', 
                          minWidth: 0, 
                          paddingVertical: 10, 
                          paddingHorizontal: 8,
                          minHeight: 125,
                        }
                      ]}
                      onPress={() => addToCart(item)}
                      activeOpacity={0.75}
                      disabled={isOutOfStock}
                    >
                      {/* Floating M3 In-Cart Badge */}
                      {isItemInCart && (
                        <View style={styles.inCartBadge}>
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
                          <Text style={styles.inCartBadgeText}>{inCartQty}</Text>
                        </View>
                      )}

                      {/* Top: Dish Photo or Fallback Icon */}
                      <View style={[styles.dishCardImageWrapper, isMobile && { height: 76 }]}>
                        {item.imageUri ? (
                          <Image 
                            source={{ uri: item.imageUri }} 
                            style={styles.dishCardImage} 
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.dishCardPlaceholderBox}>
                            <Ionicons 
                              name={item.isDeal ? "gift" : "restaurant-outline"} 
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

                      {/* Bottom: Warm Cream Price Capsule */}
                      <View style={[styles.dishCardPricePill, isItemInCart && styles.dishCardPricePillActive]}>
                        <Text style={[styles.dishCardPriceText, isItemInCart && styles.dishCardPriceTextActive]}>
                          Rs. {item.price.toLocaleString()}
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
          </View>
        )}

        {/* --------------------------------------------------------
            RIGHT: CURRENT CART (BAITHAK SPEC)
            -------------------------------------------------------- */}
        {(!isMobile || mobileTab === 'cart') && (
          <View style={[styles.cartSidebar, isMobile && styles.cartSidebarMobile]}>
            {/* Header: Title + Reset */}
            <View style={styles.cartHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="bag-handle" size={18} color="#52141C" />
                <Text style={styles.cartHeaderTitle}>Current Cart</Text>
                {cart.length > 0 && (
                  <View style={styles.cartCountPill}>
                    <Text style={styles.cartCountText}>{cart.reduce((s, i) => s + i.qty, 0)}</Text>
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

            {/* Order Type Segmented Switcher (Takeaway / Dine-in / Delivery) */}
            <View style={styles.orderTypeTabs}>
              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'takeaway' && styles.orderTypeTabActive]}
                onPress={() => handleOrderTypeChange('takeaway')}
              >
                <Ionicons name="bag-handle" size={12} color={orderType === 'takeaway' ? '#FFFFFF' : '#475569'} style={{ marginRight: 4 }} />
                <Text style={[styles.orderTypeTabText, orderType === 'takeaway' && styles.orderTypeTabTextActive]}>
                  Takeaway
                </Text>
                <View style={[styles.tabKeyBadge, orderType === 'takeaway' && styles.tabKeyBadgeActive]}>
                  <Text style={[styles.tabKeyBadgeText, orderType === 'takeaway' && styles.tabKeyBadgeTextActive]}>F3</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'dine-in' && styles.orderTypeTabActive]}
                onPress={() => handleOrderTypeChange('dine-in')}
              >
                <Ionicons name="restaurant" size={12} color={orderType === 'dine-in' ? '#FFFFFF' : '#475569'} style={{ marginRight: 4 }} />
                <Text style={[styles.orderTypeTabText, orderType === 'dine-in' && styles.orderTypeTabTextActive]}>
                  Dine-in
                </Text>
                <View style={[styles.tabKeyBadge, orderType === 'dine-in' && styles.tabKeyBadgeActive]}>
                  <Text style={[styles.tabKeyBadgeText, orderType === 'dine-in' && styles.tabKeyBadgeTextActive]}>F2</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'delivery' && styles.orderTypeTabActive]}
                onPress={() => handleOrderTypeChange('delivery')}
              >
                <Ionicons name="bicycle" size={12} color={orderType === 'delivery' ? '#FFFFFF' : '#475569'} style={{ marginRight: 4 }} />
                <Text style={[styles.orderTypeTabText, orderType === 'delivery' && styles.orderTypeTabTextActive]}>
                  Delivery
                </Text>
                <View style={[styles.tabKeyBadge, orderType === 'delivery' && styles.tabKeyBadgeActive]}>
                  <Text style={[styles.tabKeyBadgeText, orderType === 'delivery' && styles.tabKeyBadgeTextActive]}>F4</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Table or Customer Bar depending on Order Type */}
            {orderType === 'dine-in' ? (
              <View style={styles.tableCabinBar}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                  <Ionicons name="restaurant" size={14} color="#D97706" />
                  <Text style={styles.tableCabinLabel}>Table / Cabin:</Text>
                  <View style={styles.tableCabinPill}>
                    <Text style={styles.tableCabinPillText}>
                      {selectedTableObj ? selectedTableObj.name : 'None'}
                    </Text>
                    {selectedTableObj && (
                      <Text style={styles.tableCabinPillSub}>
                        ({getTableFloor(selectedTableObj)} • {getTableSeatingType(selectedTableObj) === 'majlis' ? 'Majlis' : getTableSeatingType(selectedTableObj) === 'couches' ? 'Couch' : 'Table'})
                      </Text>
                    )}
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.changeTablePill}
                  onPress={() => setTableModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="swap-horizontal" size={12} color="#475569" style={{ marginRight: 3 }} />
                  <Text style={styles.changeTablePillText}>Change Table</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.tableCabinBar}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="person" size={14} color="#D97706" />
                  <Text style={styles.tableCabinLabel}>Customer:</Text>
                  <View style={styles.tableCabinPill}>
                    <Text style={styles.tableCabinPillText} numberOfLines={1}>
                      {selectedCustomerObj ? selectedCustomerObj.name : 'Walk-in Guest'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.changeTablePill}
                  onPress={() => {
                    setCustomerSearchQuery('');
                    setIsCreatingNewCustomer(false);
                    setCustomerModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add-outline" size={12} color="#475569" style={{ marginRight: 3 }} />
                  <Text style={styles.changeTablePillText}>
                    {selectedCustomerObj ? 'Change' : 'Select'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Columns Subheader */}
            <View style={styles.cartColumnSubheader}>
              <Text style={[styles.cartColLabel, { flex: 1.8 }]}>PRODUCT</Text>
              <Text style={[styles.cartColLabel, { flex: 1, textAlign: 'center' }]}>QTY</Text>
              <Text style={[styles.cartColLabel, { flex: 1, textAlign: 'right' }]}>PRICE</Text>
            </View>

            {/* Cart Items or Empty Bag View */}
            <ScrollView 
              style={styles.cartItemsScroll}
              contentContainerStyle={{ flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
            >
              {cart.length === 0 ? (
                <View style={styles.emptyCartBox}>
                  <Ionicons name="bag" size={54} color="#94A3B8" />
                  <Text style={styles.emptyCartText}>Cart is empty</Text>
                </View>
              ) : (
                cart.map(item => (
                  <View key={item.id} style={styles.cartItemRow}>
                    <View style={{ flex: 1.8, paddingRight: 4 }}>
                      <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.cartItemUnit}>Rs. {item.price.toLocaleString()}</Text>
                    </View>

                    {/* Stepper Controls */}
                    <View style={styles.cartStepperBox}>
                      <TouchableOpacity 
                        style={styles.cartStepBtn} 
                        onPress={() => updateQty(item.id, -1)}
                      >
                        <Text style={styles.cartStepBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.cartStepQty}>{item.qty}</Text>
                      <TouchableOpacity 
                        style={styles.cartStepBtn} 
                        onPress={() => updateQty(item.id, 1)}
                      >
                        <Text style={styles.cartStepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Total & Delete */}
                    <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Text style={styles.cartItemTotal}>
                        Rs. {(item.price * item.qty).toLocaleString()}
                      </Text>
                      <TouchableOpacity 
                        onPress={() => removeFromCart(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={13} color="#DC2626" style={{ marginTop: 3 }} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Settlement Bottom Section */}
            <View style={styles.cartBottomSettlement}>
              {/* Financial Lines */}
              <View style={styles.mathSummaryLines}>
                <View style={styles.mathLine}>
                  <Text style={styles.mathLabel}>Subtotal</Text>
                  <Text style={styles.mathValue}>Rs. {subTotal.toFixed(2)}</Text>
                </View>

                <View style={styles.mathLine}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.mathLabel}>Discount-</Text>
                    <TouchableOpacity 
                      style={styles.discountBadgePill}
                      onPress={() => {
                        setCustomDiscountInput(discountAmount);
                        setDiscountModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pricetag" size={10} color="#059669" />
                      <Text style={styles.discountBadgeText}>
                        {selectedEventCampaign ? selectedEventCampaign.title : (discountVal > 0 ? `Rs. ${discountVal}` : '+ Promo')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.mathValue, { color: '#059669' }]}>Rs. {discountVal.toFixed(2)}</Text>
                </View>

                <View style={styles.mathLine}>
                  <Text style={[styles.mathLabel, { color: '#0284C7' }]}>Delivery+</Text>
                  <Text style={[styles.mathValue, { color: '#0284C7' }]}>Rs. {deliveryCharges.toFixed(2)}</Text>
                </View>

                {/* Payable Grand Total */}
                <View style={styles.payableRow}>
                  <Text style={styles.payableLabel}>PAYABLE</Text>
                  <Text style={styles.payableAmount}>Rs. {total.toFixed(2)}</Text>
                </View>
              </View>

              {/* Big Action Button 1: PROCEED TO PAYMENT */}
              <TouchableOpacity 
                style={[styles.proceedPayBtn, cart.length === 0 && { opacity: 0.55 }]}
                {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                onPress={openCheckout}
                disabled={cart.length === 0}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="card-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.proceedPayBtnText}>PROCEED TO PAYMENT</Text>
                </View>
                <View style={styles.btnShortcutBadge}>
                  <Text style={styles.btnShortcutBadgeText}>F9</Text>
                </View>
              </TouchableOpacity>

              {/* Action Button 2: HOLD / PENDING ORDER */}
              <TouchableOpacity 
                style={[styles.holdOrderBtn, cart.length === 0 && { opacity: 0.55 }]}
                {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                onPress={sendToKitchen}
                disabled={cart.length === 0}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="pause-circle-outline" size={15} color="#52141C" style={{ marginRight: 6 }} />
                  <Text style={styles.holdOrderBtnText}>HOLD / PENDING ORDER</Text>
                </View>
                <View style={[styles.btnShortcutBadge, { backgroundColor: 'rgba(82, 20, 28, 0.1)', borderColor: 'rgba(82, 20, 28, 0.25)' }]}>
                  <Text style={[styles.btnShortcutBadgeText, { color: '#52141C' }]}>F8</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Floating Bottom Quick Cart Bar on Mobile */}
      {isMobile && mobileTab === 'menu' && cart.length > 0 && (
        <View style={styles.mobileFloatingCartContainer}>
          <TouchableOpacity
            style={styles.mobileFloatingCartBtn}
            onPress={() => setMobileTab('cart')}
            activeOpacity={0.88}
          >
            <View style={styles.mobileFloatingCartLeft}>
              <View style={styles.mobileFloatingCartBadge}>
                <Text style={styles.mobileFloatingCartBadgeText}>
                  {cart.reduce((s, i) => s + i.qty, 0)}
                </Text>
              </View>
              <View>
                <Text style={styles.mobileFloatingCartTitle}>View Current Cart</Text>
                <Text style={styles.mobileFloatingCartSub}>
                  {cart.length} {cart.length === 1 ? 'item' : 'items'} in order
                </Text>
              </View>
            </View>

            <View style={styles.mobileFloatingCartRight}>
              <Text style={styles.mobileFloatingCartTotal}>
                Rs. {Math.round(total).toLocaleString()}
              </Text>
              <Ionicons name="arrow-forward-circle" size={24} color="#D4AF37" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================
          MODAL: DINING TABLE & CABIN SELECTION (SULTAN ARCHITECTURE)
          ======================================================== */}
      <Modal visible={tableModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxWidth: 760, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.modalHeaderTitle}>Select Table / Cabin</Text>
                <View style={styles.modalCountBadge}>
                  <Text style={styles.modalCountBadgeText}>
                    {filteredModalTables.length} {filteredModalTables.length === 1 ? 'Unit' : 'Units'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setTableModalVisible(false);
                  setFloorDropdownOpen(false);
                }} 
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#1E293B" />
              </TouchableOpacity>
            </View>

            {/* Control Toolbar Container */}
            <View style={styles.modalControlToolbar}>
              {/* Row 1: Search Input & Floor Dropdown */}
              <View style={styles.modalToolbarTopRow}>
                {/* Search Bar */}
                <View 
                  style={[styles.modalSearchBar, isTableSearchFocused && styles.modalSearchBarFocused]}
                  {...(Platform.OS === 'web' ? ({ className: 'modal-search-bar search-bar-pop', 'data-search-box': 'true' } as any) : {})}
                >
                  <Ionicons name="search" size={15} color={isTableSearchFocused ? '#D4AF37' : '#52141C'} style={{ marginLeft: 2 }} />
                  <TextInput 
                    style={styles.modalSearchInput}
                    placeholder="Search table, server or majlis..."
                    placeholderTextColor="#94A3B8"
                    value={tableSearchQuery}
                    onFocus={() => setIsTableSearchFocused(true)}
                    onBlur={() => setIsTableSearchFocused(false)}
                    onChangeText={setTableSearchQuery}
                  />
                  {tableSearchQuery ? (
                    <TouchableOpacity onPress={() => setTableSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Floor Dropdown Trigger */}
                <View style={{ position: 'relative' }}>
                  <TouchableOpacity
                    style={[styles.floorDropdownBtn, floorDropdownOpen && styles.floorDropdownBtnActive]}
                    onPress={() => setFloorDropdownOpen(prev => !prev)}
                    activeOpacity={0.85}
                  >
                    <View style={[
                      styles.floorDropdownBadge,
                      tableModalFloor !== 'All' && getFloorMeta(tableModalFloor, dynamicFloors)?.color 
                        ? { backgroundColor: getFloorMeta(tableModalFloor, dynamicFloors).color } 
                        : null
                    ]}>
                      <Text style={styles.floorDropdownBadgeText}>
                        {tableModalFloor === 'All' ? 'ALL' : (getFloorMeta(tableModalFloor, dynamicFloors)?.short || tableModalFloor.slice(0, 2).toUpperCase())}
                      </Text>
                    </View>
                    <Text style={styles.floorDropdownSelectedText} numberOfLines={1}>
                      {tableModalFloor === 'All' ? 'All Floors' : tableModalFloor}
                    </Text>
                    <View style={styles.floorDropdownCountPill}>
                      <Text style={styles.floorDropdownCountText}>
                        {tableModalFloor === 'All' ? tables.length : tables.filter(t => getTableFloor(t).toLowerCase() === tableModalFloor.toLowerCase()).length}
                      </Text>
                    </View>
                    <Ionicons name={floorDropdownOpen ? "chevron-up" : "chevron-down"} size={13} color="#52141C" />
                  </TouchableOpacity>

                  {/* Floor Dropdown Floating Popover */}
                  {floorDropdownOpen && (
                    <View style={styles.floorDropdownMenu}>
                      <View style={styles.floorDropdownMenuHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="business" size={13} color="#52141C" />
                          <Text style={styles.floorDropdownMenuHeaderTitle}>Select Restaurant Floor</Text>
                        </View>
                        <TouchableOpacity onPress={() => setFloorDropdownOpen(false)}>
                          <Ionicons name="close-circle" size={17} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                      <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                        {['All', ...availableFloors].map(fl => {
                          const isActive = tableModalFloor === fl;
                          const isAll = fl === 'All';
                          const meta = !isAll ? getFloorMeta(fl, dynamicFloors) : null;
                          const count = isAll
                            ? tables.length
                            : tables.filter(t => getTableFloor(t).toLowerCase() === fl.toLowerCase()).length;

                          return (
                            <TouchableOpacity
                              key={fl}
                              style={[styles.floorDropdownOption, isActive && styles.floorDropdownOptionActive]}
                              onPress={() => {
                                setTableModalFloor(fl);
                                setFloorDropdownOpen(false);
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                <View style={[
                                  styles.floorOptionBadge,
                                  meta?.color ? { backgroundColor: meta.color } : isAll ? { backgroundColor: '#52141C' } : null
                                ]}>
                                  <Text style={styles.floorOptionBadgeText}>
                                    {isAll ? 'ALL' : meta?.short || fl.slice(0, 2).toUpperCase()}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.floorOptionName, isActive && styles.floorOptionNameActive]}>
                                    {isAll ? 'All Floors / Zones' : fl}
                                  </Text>
                                </View>
                              </View>

                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[styles.floorOptionCountPill, isActive && styles.floorOptionCountPillActive]}>
                                  <Text style={[styles.floorOptionCountText, isActive && styles.floorOptionCountTextActive]}>
                                    {count}
                                  </Text>
                                </View>
                                {isActive && (
                                  <Ionicons name="checkmark-circle" size={16} color="#D4AF37" />
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>

              {/* Row 2: Sub-Filter Controls */}
              <View style={styles.modalSubFilterRow}>
                {/* Seating Type Segmented Filter */}
                <View style={styles.seatingTypeFilterBox}>
                  {(
                    [
                      { id: 'all', label: 'All Units' },
                      { id: 'tables', label: '🍽️ Tables' },
                      { id: 'couches', label: '🛋️ Couches' },
                      { id: 'majlis', label: '🕌 Majlis' },
                    ] as const
                  ).map(st => {
                    const active = tableModalSeatingType === st.id;
                    return (
                      <TouchableOpacity
                        key={st.id}
                        style={[styles.seatingTypeBtn, active && styles.seatingTypeBtnActive]}
                        onPress={() => setTableModalSeatingType(st.id)}
                      >
                        <Text style={[styles.seatingTypeBtnText, active && styles.seatingTypeBtnTextActive]}>
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Status Segmented Filter */}
                <View style={styles.statusFilterBox}>
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'available', label: '🟢 Free' },
                      { id: 'occupied', label: '🔴 Busy' },
                    ] as const
                  ).map(st => {
                    const active = tableModalStatus === st.id;
                    return (
                      <TouchableOpacity
                        key={st.id}
                        style={[styles.statusFilterBtn, active && styles.statusFilterBtnActive]}
                        onPress={() => setTableModalStatus(st.id)}
                      >
                        <Text style={[styles.statusFilterBtnText, active && styles.statusFilterBtnTextActive]}>
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Tier 3: Grid of Sultan Tables & Cabins */}
            <ScrollView style={{ maxHeight: 380, padding: 14 }}>
              {filteredModalTables.length === 0 ? (
                <View style={styles.emptyTablesModalBox}>
                  <Ionicons name="search-outline" size={36} color="#CBD5E1" />
                  <Text style={styles.emptyTablesModalTitle}>No Tables or Cabins Match</Text>
                  <Text style={styles.emptyTablesModalSub}>Try resetting the floor, seating type, or search query.</Text>
                  <TouchableOpacity
                    style={styles.resetModalFiltersBtn}
                    onPress={() => {
                      setTableModalFloor('All');
                      setTableModalSeatingType('all');
                      setTableModalStatus('all');
                      setTableSearchQuery('');
                      setFloorDropdownOpen(false);
                    }}
                  >
                    <Text style={styles.resetModalFiltersBtnText}>Reset All Filters</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.tablesModalGrid}>
                  {filteredModalTables.map(t => {
                    const tFloor = getTableFloor(t);
                    const tType = getTableSeatingType(t);
                    const isSelected = selectedTableId === t.id;
                    const isOccupied = t.status === 'occupied' || t.status === 'billed';
                    const isMajlis = tType === 'majlis';
                    const isCouch = tType === 'couches';
                    const meta = getFloorMeta(tFloor, dynamicFloors);

                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.tableModalCard,
                          isOccupied && styles.tableModalCardBusy,
                          t.status === 'available' && styles.tableModalCardAvail,
                          isMajlis && styles.tableModalCardMajlis,
                          isSelected && styles.tableModalCardSelected
                        ]}
                        onPress={() => handleTableSelect(t.id)}
                        activeOpacity={0.85}
                      >
                        {/* Top Strip with Floor Accent */}
                        <View style={[styles.tableCardTopStrip, { backgroundColor: meta.color || '#D4AF37' }]} />

                        {/* Header Row: Type Icon + Name + Status */}
                        <View style={styles.tableCardHeaderRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6 }}>
                            <View style={[
                              styles.tableTypeIconOrb,
                              isMajlis && { backgroundColor: 'rgba(217, 119, 6, 0.12)', borderColor: 'rgba(217, 119, 6, 0.3)' },
                              isCouch && { backgroundColor: 'rgba(99, 102, 241, 0.12)', borderColor: 'rgba(99, 102, 241, 0.3)' }
                            ]}>
                              <SeatingTypeIcon type={tType} size={13} color={isMajlis ? '#B45309' : isCouch ? '#4F46E5' : '#52141C'} />
                            </View>
                            <Text style={styles.tableModalCardName} numberOfLines={1}>
                              {t.name}
                            </Text>
                          </View>

                          <View style={[
                            styles.tableStatusBadge,
                            t.status === 'available' ? styles.tableStatusBadgeAvail :
                            t.status === 'billed' ? styles.tableStatusBadgeBilled :
                            styles.tableStatusBadgeOccupied
                          ]}>
                            <Text style={[
                              styles.tableStatusBadgeText,
                              t.status === 'available' ? { color: '#059669' } :
                              t.status === 'billed' ? { color: '#D97706' } :
                              { color: '#DC2626' }
                            ]}>
                              {t.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        {/* Floor and Type Badges */}
                        <View style={styles.tableCardTagsRow}>
                          <View style={styles.tableModalCardFloorTag}>
                            <Text style={styles.tableModalCardFloorTagText}>{tFloor}</Text>
                          </View>
                          <View style={[
                            styles.tableTypePill,
                            isMajlis && { backgroundColor: '#FEF3C7' },
                            isCouch && { backgroundColor: '#EEF2FF' }
                          ]}>
                            <Text style={[
                              styles.tableTypePillText,
                              isMajlis && { color: '#92400E' },
                              isCouch && { color: '#3730A3' }
                            ]}>
                              {isMajlis ? 'Majlis Cabin' : isCouch ? 'VIP Couch' : 'Dining Table'}
                            </Text>
                          </View>
                        </View>

                        {/* Capacity Row */}
                        <View style={styles.tableCardCapacityRow}>
                          <Ionicons name="people-outline" size={12} color="#64748B" />
                          <Text style={styles.tableCardCapacityText}>
                            {isMajlis ? `Cabin: ${t.seats} Guests` : `${t.seats} Seats`}
                          </Text>
                        </View>

                        {/* Active Bill / Waiter Footer if Busy */}
                        {isOccupied && (
                          <View style={styles.tableCardBillFooter}>
                            {t.billTotal && t.billTotal > 0 ? (
                              <Text style={styles.tableCardBillText}>Rs. {t.billTotal.toLocaleString()}</Text>
                            ) : null}
                            <Text style={styles.tableCardServerText} numberOfLines={1}>
                              Waiter: {t.server || 'Assigned'}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL: CUSTOMER SELECTOR
          ======================================================== */}
      <Modal visible={customerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Select or Register Customer</Text>
              <TouchableOpacity onPress={() => setCustomerModalVisible(false)}>
                <Ionicons name="close" size={22} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              {isCreatingNewCustomer ? (
                <View>
                  <Text style={styles.inputLabel}>Customer Name</Text>
                  <TextInput 
                    style={styles.modalInput}
                    placeholder="e.g. Tariq Khan"
                    value={customerName}
                    onChangeText={setCustomerName}
                  />

                  <Text style={styles.inputLabel}>Mobile Phone</Text>
                  <TextInput 
                    style={styles.modalInput}
                    placeholder="0300-1234567"
                    keyboardType="phone-pad"
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                  />

                  <Text style={styles.inputLabel}>Delivery Address</Text>
                  <TextInput 
                    style={[styles.modalInput, { height: 60 }]}
                    placeholder="Full street address..."
                    multiline
                    value={customerAddress}
                    onChangeText={setCustomerAddress}
                  />

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity 
                      style={[styles.modalSecondaryBtn, { flex: 1 }]}
                      onPress={() => setIsCreatingNewCustomer(false)}
                    >
                      <Text style={styles.modalSecondaryBtnText}>Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.modalPrimaryBtn, { flex: 1 }]}
                      onPress={handleSaveNewCustomer}
                    >
                      <Text style={styles.modalPrimaryBtnText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <View 
                    style={[styles.modalSearchBar, isCustSearchFocused && styles.modalSearchBarFocused, { marginBottom: 12 }]}
                    {...(Platform.OS === 'web' ? ({ className: 'modal-search-bar search-bar-pop', 'data-search-box': 'true' } as any) : {})}
                  >
                    <View style={[styles.modalSearchIconOrb, isCustSearchFocused && { backgroundColor: 'rgba(212, 175, 55, 0.2)', borderColor: '#D4AF37' }]}>
                      <Ionicons name="search" size={14} color={isCustSearchFocused ? '#D4AF37' : '#52141C'} />
                    </View>
                    <TextInput 
                      style={styles.modalSearchInput}
                      placeholder="Search customer by name or phone..."
                      placeholderTextColor="#8A7A70"
                      value={customerSearchQuery}
                      onFocus={() => setIsCustSearchFocused(true)}
                      onBlur={() => setIsCustSearchFocused(false)}
                      onChangeText={setCustomerSearchQuery}
                    />
                    {customerSearchQuery ? (
                      <TouchableOpacity onPress={() => setCustomerSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color="#D4AF37" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <TouchableOpacity 
                    style={styles.addNewCustBar}
                    onPress={() => setIsCreatingNewCustomer(true)}
                  >
                    <Ionicons name="person-add" size={14} color="#BE123C" style={{ marginRight: 6 }} />
                    <Text style={styles.addNewCustBarText}>+ Register New Customer</Text>
                  </TouchableOpacity>

                  <ScrollView style={{ maxHeight: 220 }}>
                    {customers
                      .filter(c => !customerSearchQuery || c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || c.phone.includes(customerSearchQuery))
                      .map(cust => (
                        <TouchableOpacity
                          key={cust.id}
                          style={styles.custRow}
                          onPress={() => {
                            setSelectedCustomerId(cust.id);
                            setCustomerModalVisible(false);
                          }}
                        >
                          <View>
                            <Text style={styles.custRowName}>{cust.name}</Text>
                            <Text style={styles.custRowPhone}>{cust.phone}</Text>
                          </View>
                          <Ionicons name="checkmark-circle" size={18} color="#D4AF37" />
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL: CHECKOUT & MULTI-PAYMENT SPLIT
          ======================================================== */}
      <Modal visible={checkoutModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxWidth: 540 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Settle & Pay Bill</Text>
              <TouchableOpacity onPress={() => setCheckoutModalVisible(false)}>
                <Ionicons name="close" size={22} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 18 }}>
              <View style={styles.checkoutTotalCard}>
                <Text style={styles.checkoutTotalCardLabel}>TOTAL AMOUNT DUE (کل بل رقم)</Text>
                <Text style={styles.checkoutTotalCardVal}>Rs. {total.toFixed(2)}</Text>
              </View>

              {/* Full Payment Quick Action Button */}
              <TouchableOpacity
                style={styles.fullPaymentBtn}
                {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                onPress={handleSetFullPayment}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="flash" size={17} color="#D4AF37" style={{ marginRight: 6 }} />
                  <Text style={styles.fullPaymentBtnText}>
                    ⚡ FULL PAYMENT (Exact Rs. {Math.round(total).toLocaleString()})
                  </Text>
                </View>
                <View style={styles.keyInlinePill}>
                  <Text style={styles.keyInlinePillText}>F10</Text>
                </View>
              </TouchableOpacity>

              {/* Payment Method & Cash Tendered Input */}
              <View style={{ marginVertical: 12 }}>
                <Text style={styles.paymentInputSectionLabel}>Payment Method & Cash Tendered:</Text>
                {payments.map((p, idx) => (
                  <View key={idx} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <View style={styles.payTypeSelector}>
                        {(['cash', 'card', 'online'] as const).map(m => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.payTypePill, p.type === m && styles.payTypePillActive]}
                            onPress={() => updatePayment(idx, 'type', m)}
                          >
                            <Text style={[styles.payTypePillText, p.type === m && styles.payTypePillTextActive]}>
                              {m.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View style={{ flex: 1, position: 'relative' }}>
                        <TextInput 
                          style={styles.payAmountInput}
                          keyboardType="numeric"
                          placeholder="Amount received..."
                          placeholderTextColor="#94A3B8"
                          value={p.amount > 0 ? p.amount.toString() : ''}
                          onChangeText={v => updatePayment(idx, 'amount', v)}
                        />
                        {p.amount > 0 && (
                          <TouchableOpacity 
                            style={styles.payInputClearBtn}
                            onPress={() => updatePayment(idx, 'amount', '0')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle" size={16} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Quick Cash Note Chips */}
                    {p.type === 'cash' && (
                      <View style={styles.quickNotesRow}>
                        <Text style={styles.quickNotesLabel}>Quick Notes:</Text>
                        <TouchableOpacity 
                          style={styles.quickNoteChip} 
                          onPress={() => handleSetPaymentAmount(Math.round(total))}
                        >
                          <Text style={styles.quickNoteChipText}>Exact</Text>
                        </TouchableOpacity>
                        {total <= 500 && (
                          <TouchableOpacity 
                            style={styles.quickNoteChip} 
                            onPress={() => handleSetPaymentAmount(500)}
                          >
                            <Text style={styles.quickNoteChipText}>500</Text>
                          </TouchableOpacity>
                        )}
                        {total <= 1000 && (
                          <TouchableOpacity 
                            style={styles.quickNoteChip} 
                            onPress={() => handleSetPaymentAmount(1000)}
                          >
                            <Text style={styles.quickNoteChipText}>1,000</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity 
                          style={styles.quickNoteChip} 
                          onPress={() => handleSetPaymentAmount(total <= 2000 ? 2000 : Math.ceil(total / 1000) * 1000)}
                        >
                          <Text style={styles.quickNoteChipText}>
                            {total <= 2000 ? '2,000' : `${(Math.ceil(total / 1000) * 1000).toLocaleString()}`}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.quickNoteChip} 
                          onPress={() => handleSetPaymentAmount(5000)}
                        >
                          <Text style={styles.quickNoteChipText}>5,000</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* Dynamic Change to Return / Remaining Status Card */}
              {changeDue > 0.01 ? (
                <View style={styles.changeReturnCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Ionicons name="cash-outline" size={18} color="#059669" />
                    <Text style={styles.changeReturnTitle}>CHANGE TO RETURN (گاہک کو واپس کرنی رقم)</Text>
                  </View>
                  <Text style={styles.changeReturnAmount}>Rs. {changeDue.toFixed(2)}</Text>
                  <Text style={styles.changeReturnSubtitle}>
                    Customer gave: Rs. {totalPaid.toLocaleString()}  •  Net Bill: Rs. {total.toFixed(2)}
                  </Text>
                </View>
              ) : remaining > 0.01 ? (
                <View style={styles.remainingCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="alert-circle-outline" size={17} color="#D97706" />
                    <Text style={styles.remainingText}>
                      Remaining to Collect: <Text style={{ fontWeight: '900', color: '#B45309' }}>Rs. {remaining.toFixed(2)}</Text>
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.exactPaidCard}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.exactPaidText}>Exact Amount Paid — No Change Due</Text>
                </View>
              )}

              <TouchableOpacity 
                style={[styles.proceedPayBtn, remaining > 0.01 && { opacity: 0.55 }, { marginTop: 12 }]}
                onPress={handleFinalizeOrder}
                activeOpacity={0.85}
              >
                <Text style={styles.proceedPayBtnText}>
                  {remaining > 0.01 
                    ? `COLLECT REMAINING (Rs. ${remaining.toFixed(0)})` 
                    : changeDue > 0 
                      ? `CONFIRM PAYMENT & PRINT (Return: Rs. ${changeDue.toFixed(0)})`
                      : 'CONFIRM PAYMENT & PRINT BILL'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL: RUNNING ORDERS / KITCHEN TICKETS
          ======================================================== */}
      <Modal visible={pendingOrdersModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxWidth: 580 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.modalHeaderTitle}>Running Orders ({(tickets || []).length})</Text>
                {(tickets || []).length > 0 && (
                  <TouchableOpacity
                    style={styles.clearAllTicketsBtn}
                    onPress={handleClearAllOrphanTickets}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="trash-outline" size={13} color="#DC2626" />
                    <Text style={styles.clearAllTicketsBtnText}>Clear All</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={() => setPendingOrdersModalVisible(false)}>
                <Ionicons name="close" size={22} color="#1E293B" />
              </TouchableOpacity>
            </View>

            {/* Running Orders Search Bar */}
            <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
              <View 
                style={[styles.modalSearchBar, isPendingSearchFocused && styles.modalSearchBarFocused]}
                {...(Platform.OS === 'web' ? ({ className: 'modal-search-bar search-bar-pop', 'data-search-box': 'true' } as any) : {})}
              >
                <View style={[styles.modalSearchIconOrb, isPendingSearchFocused && { backgroundColor: 'rgba(212, 175, 55, 0.25)' }]}>
                  <Ionicons name="search" size={14} color={isPendingSearchFocused ? '#D4AF37' : '#52141C'} />
                </View>
                <TextInput 
                  style={styles.modalSearchInput}
                  placeholder="Search ticket #, table, or server..."
                  placeholderTextColor="#8A7A70"
                  value={pendingOrderSearchQuery}
                  onFocus={() => setIsPendingSearchFocused(true)}
                  onBlur={() => setIsPendingSearchFocused(false)}
                  onChangeText={setPendingOrderSearchQuery}
                />
                {pendingOrderSearchQuery ? (
                  <TouchableOpacity onPress={() => setPendingOrderSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color="#D4AF37" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <ScrollView style={{ maxHeight: 420, padding: 14 }}>
              {(tickets || []).filter(t => !pendingOrderSearchQuery || 
                t.id.toLowerCase().includes(pendingOrderSearchQuery.toLowerCase()) || 
                t.tableId?.toLowerCase().includes(pendingOrderSearchQuery.toLowerCase()) ||
                t.server?.toLowerCase().includes(pendingOrderSearchQuery.toLowerCase())
              ).length === 0 ? (
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Ionicons name="receipt-outline" size={36} color="#CBD5E1" style={{ marginBottom: 6 }} />
                  <Text style={{ color: '#64748B', fontWeight: '700' }}>No active running orders found.</Text>
                </View>
              ) : (
                (tickets || [])
                  .filter(t => !pendingOrderSearchQuery || 
                    t.id.toLowerCase().includes(pendingOrderSearchQuery.toLowerCase()) || 
                    t.tableId?.toLowerCase().includes(pendingOrderSearchQuery.toLowerCase()) ||
                    t.server?.toLowerCase().includes(pendingOrderSearchQuery.toLowerCase())
                  )
                  .map(t => {
                    const ticketSubtotal = t.items.reduce((sum, it) => sum + (it.price * it.qty), 0);
                    const isTable = t.tableId && t.tableId !== 'takeaway' && t.tableId !== 'delivery';
                    const targetTable = isTable ? tables.find(tbl => tbl.id === t.tableId) : null;
                    const tableNameDisplay = targetTable ? targetTable.name : (t.tableName || (t.tableId ? t.tableId.toUpperCase() : 'TAKEAWAY'));
                    const statusColor = t.status === 'served' ? '#059669' : '#D97706';
                    const statusBg = t.status === 'served' ? 'rgba(209, 250, 229, 0.85)' : 'rgba(254, 243, 199, 0.85)';

                    return (
                      <View key={t.id} style={styles.ticketCard}>
                        {/* Top Row: Ticket ID + Table & Status Badge */}
                        <View style={styles.ticketCardHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="receipt-outline" size={16} color="#52141C" />
                            <Text style={styles.ticketCardNumber}>Ticket #{t.id.slice(-6).toUpperCase()}</Text>
                            <View style={styles.ticketTablePill}>
                              <Ionicons name={isTable ? "restaurant-outline" : "bag-handle-outline"} size={11} color="#52141C" />
                              <Text style={styles.ticketTableText}>{tableNameDisplay}</Text>
                            </View>
                          </View>

                          <View style={[styles.ticketStatusPill, { backgroundColor: statusBg, borderColor: statusColor }]}>
                            <Text style={[styles.ticketStatusText, { color: statusColor }]}>
                              {t.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        {/* Meta info: Server, Items Count, Running Total */}
                        <View style={styles.ticketMetaRow}>
                          <Text style={styles.ticketMetaText}>
                            Server: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{t.server || 'Staff'}</Text> • {t.items.reduce((s, i) => s + i.qty, 0)} items
                          </Text>
                          <Text style={styles.ticketSubtotalText}>
                            Rs. {ticketSubtotal.toLocaleString()}
                          </Text>
                        </View>

                        {/* Items preview list */}
                        <View style={styles.ticketItemsList}>
                          {t.items.map((it, idx) => (
                            <View key={idx} style={styles.ticketItemRow}>
                              <Text style={styles.ticketItemQty}>{it.qty}x</Text>
                              <Text style={styles.ticketItemName} numberOfLines={1}>{it.name}</Text>
                              <Text style={styles.ticketItemPrice}>Rs. {(it.price * it.qty).toLocaleString()}</Text>
                            </View>
                          ))}
                        </View>

                        {/* Interactive Action Row: Cancel / Load Cart / Create Bill & Settle */}
                        <View style={styles.ticketActionRow}>
                          <TouchableOpacity
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                            style={styles.ticketCancelBtn}
                            onPress={() => handleCancelRunningOrder(t.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={13} color="#DC2626" style={{ marginRight: 3 }} />
                            <Text style={styles.ticketCancelBtnText}>Cancel</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                            style={styles.ticketCartBtn}
                            onPress={() => handleCreateBillFromTicket(t, false)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="cart-outline" size={14} color="#475569" style={{ marginRight: 4 }} />
                            <Text style={styles.ticketCartBtnText}>Load Cart</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
                            style={styles.ticketBillBtn}
                            onPress={() => handleCreateBillFromTicket(t, true)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="flash" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.ticketBillBtnText}>⚡ Create Bill & Settle</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Post-Payment Table Decision Modal */}
      {tableDecisionModal && (
        <Modal visible transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 460, padding: 18 }]}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#1E293B', marginBottom: 6 }}>
                Bill Settled for {tableDecisionModal.tableName}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 18, marginBottom: 14 }}>
                Would you like to release this table now, or are guests still seated?
              </Text>

              <TouchableOpacity 
                style={[styles.proceedPayBtn, { marginBottom: 8 }]}
                onPress={() => {
                  settleBill(tableDecisionModal.tableId);
                  clearTableTickets(tableDecisionModal.tableId);
                  setGeneratedInvoice(tableDecisionModal.invoice);
                  setTableDecisionModal(null);
                }}
              >
                <Text style={styles.proceedPayBtnText}>Release Table Now</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.holdOrderBtn}
                onPress={() => {
                  markTableBilled(tableDecisionModal.tableId);
                  clearTableTickets(tableDecisionModal.tableId);
                  setGeneratedInvoice(tableDecisionModal.invoice);
                  setTableDecisionModal(null);
                }}
              >
                <Text style={styles.holdOrderBtnText}>Keep Seated as Billed</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================
          MODAL: KEYBOARD SHORTCUTS CHEAT SHEET
          ======================================================== */}
      <Modal visible={shortcutsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxWidth: 540, padding: 20 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="keypad" size={20} color="#D4AF37" />
                <Text style={styles.modalHeaderTitle}>Keyboard Shortcuts (شارٹ کٹ کیز)</Text>
              </View>
              <TouchableOpacity onPress={() => setShortcutsModalVisible(false)}>
                <Ionicons name="close" size={22} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460, marginTop: 10 }}>
              <Text style={styles.shortcutSectionHeading}>ORDER & POS NAVIGATION</Text>
              
              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F1 / Ctrl+K</Text></View>
                <Text style={styles.shortcutDescText}>Focus Dish Search Bar</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F2</Text></View>
                <Text style={styles.shortcutDescText}>Dine-in Mode / Select Table</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F3</Text></View>
                <Text style={styles.shortcutDescText}>Takeaway Order Mode</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F4</Text></View>
                <Text style={styles.shortcutDescText}>Delivery Order Mode</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F6 / Ctrl+R</Text></View>
                <Text style={styles.shortcutDescText}>Open Running / Pending Orders</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F7 / Ctrl+D</Text></View>
                <Text style={styles.shortcutDescText}>Apply Discount / Event Promo</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F8 / Ctrl+H</Text></View>
                <Text style={styles.shortcutDescText}>Hold / Send KOT to Kitchen</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F9 / Ctrl+Enter</Text></View>
                <Text style={styles.shortcutDescText}>Proceed to Payment / Checkout</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>F12</Text></View>
                <Text style={styles.shortcutDescText}>Clear Cart / Reset Order</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>Esc</Text></View>
                <Text style={styles.shortcutDescText}>Close Modal / Clear Search</Text>
              </View>

              <Text style={[styles.shortcutSectionHeading, { marginTop: 16 }]}>PAYMENT / CHECKOUT MODAL</Text>

              <View style={styles.shortcutItemRow}>
                <View style={[styles.keyBadge, { backgroundColor: '#35080E', borderColor: '#D4AF37' }]}><Text style={[styles.keyBadgeText, { color: '#D4AF37' }]}>F10</Text></View>
                <Text style={styles.shortcutDescText}>⚡ Full Payment (Fill exact bill amount)</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={[styles.keyBadge, { backgroundColor: '#059669', borderColor: '#10B981' }]}><Text style={[styles.keyBadgeText, { color: '#FFFFFF' }]}>Enter</Text></View>
                <Text style={styles.shortcutDescText}>Confirm Payment & Print Receipt</Text>
              </View>

              <View style={styles.shortcutItemRow}>
                <View style={styles.keyBadge}><Text style={styles.keyBadgeText}>Esc</Text></View>
                <Text style={styles.shortcutDescText}>Cancel & Close Checkout Modal</Text>
              </View>
            </ScrollView>

            <TouchableOpacity 
              style={[styles.modalPrimaryBtn, { marginTop: 14 }]} 
              onPress={() => setShortcutsModalVisible(false)}
            >
              <Text style={styles.modalPrimaryBtnText}>Close (Esc)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL: VARIANT / PORTION SELECTION (GLASSMORPHIC)
          ======================================================== */}
      {variantModalItem && (
        <Modal visible transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 440 }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="options-outline" size={18} color="#D4AF37" />
                  <Text style={styles.modalHeaderTitle}>Select Portion / Variant</Text>
                </View>
                <TouchableOpacity onPress={() => setVariantModalItem(null)}>
                  <Ionicons name="close" size={22} color="#1E293B" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 18 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#1E293B', marginBottom: 4 }}>
                  {variantModalItem.name}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 14 }}>
                  Category: {variantModalItem.category} • Choose serving portion
                </Text>

                <View style={{ gap: 8 }}>
                  {variantModalItem.variants?.map((v, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.variantOptionRow}
                      onPress={() => handleVariantSelect(v)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={styles.variantDot} />
                        <Text style={styles.variantOptionName}>{v.name}</Text>
                      </View>
                      <View style={styles.variantPricePill}>
                        <Text style={styles.variantPriceText}>Rs. {v.price.toLocaleString()}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================
          MODAL: DISCOUNT & EVENT PROMO SELECTOR (GLASSMORPHIC)
          ======================================================== */}
      {discountModalVisible && (
        <Modal visible transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 480 }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="pricetags-outline" size={18} color="#059669" />
                  <Text style={styles.modalHeaderTitle}>Apply Discount or Promo</Text>
                </View>
                <TouchableOpacity onPress={() => setDiscountModalVisible(false)}>
                  <Ionicons name="close" size={22} color="#1E293B" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 18 }}>
                {/* Active Event Campaigns */}
                <Text style={styles.inputLabel}>Active Promotional Campaigns</Text>
                {campaigns.filter(c => c.status === 'active').length === 0 ? (
                  <Text style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginBottom: 12 }}>
                    No automated event promos currently active.
                  </Text>
                ) : (
                  <View style={{ gap: 6, marginBottom: 14 }}>
                    {campaigns.filter(c => c.status === 'active').map(camp => {
                      const isSelected = selectedEventCampaign?.id === camp.id;
                      return (
                        <TouchableOpacity
                          key={camp.id}
                          style={[styles.promoCampaignCard, isSelected && styles.promoCampaignCardActive]}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedEventCampaign(null);
                              setDiscountAmount('0');
                            } else {
                              setSelectedEventCampaign(camp);
                            }
                            setDiscountModalVisible(false);
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.promoCampaignTitle, isSelected && { color: '#059669' }]}>
                              {camp.title}
                            </Text>
                            <Text style={styles.promoCampaignSub}>
                              {camp.type === 'percentage' ? `${camp.value}% Off` : `Rs. ${camp.value} Off`}
                              {camp.minSpend ? ` • Min Order: Rs. ${camp.minSpend}` : ''}
                            </Text>
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={18} color="#059669" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Custom Discount Input (Role Guarded) */}
                {canApplyCustomDiscount ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.inputLabel}>Manual Discount Amount (Rs.)</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={customDiscountInput}
                        onChangeText={setCustomDiscountInput}
                      />
                      <TouchableOpacity
                        style={[styles.modalPrimaryBtn, { paddingHorizontal: 16 }]}
                        onPress={() => {
                          setSelectedEventCampaign(null);
                          setDiscountAmount(customDiscountInput || '0');
                          setDiscountModalVisible(false);
                        }}
                      >
                        <Text style={styles.modalPrimaryBtnText}>Apply</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 8, padding: 8, backgroundColor: '#F1F5F9', borderRadius: 8 }}>
                    <Text style={{ fontSize: 10.5, color: '#64748B' }}>
                      Manual custom discount requires Admin or Manager authorization.
                    </Text>
                  </View>
                )}

                {/* Reset Discount Button */}
                {discountVal > 0 && (
                  <TouchableOpacity
                    style={{ marginTop: 12, alignItems: 'center' }}
                    onPress={() => {
                      setSelectedEventCampaign(null);
                      setDiscountAmount('0');
                      setCustomDiscountInput('0');
                      setDiscountModalVisible(false);
                    }}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#DC2626' }}>
                      Remove Discount
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Invoice Print Preview Modal */}
      {generatedInvoice && (
        <Modal visible transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 650, maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderTitle}>Invoice #{generatedInvoice.id}</Text>
                <TouchableOpacity onPress={() => setGeneratedInvoice(null)}>
                  <Ionicons name="close" size={22} color="#1E293B" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1, padding: 14 }}>
                <InvoiceComponent invoice={generatedInvoice} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#F5F1E8',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(circle at 12% 18%, rgba(212, 175, 55, 0.08) 0%, transparent 45%), radial-gradient(circle at 88% 82%, rgba(82, 20, 28, 0.06) 0%, transparent 45%), linear-gradient(135deg, #FBF8F2 0%, #F3EDE2 50%, #ECE4D5 100%)',
        minHeight: '100vh',
      } as any
    }),
  },

  /* --------------------------------------------------------
     1. TOP HEADER (MODERN GLASSMORPHIC MAROON)
     -------------------------------------------------------- */
  topHeader: {
    height: 50,
    backgroundColor: 'rgba(38, 5, 9, 0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.35)',
    zIndex: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.22)',
      } as any
    }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      } as any
    }),
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  clockText: {
    color: '#F59E0B',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      } as any
    }),
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shiftCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        cursor: 'pointer',
      } as any
    }),
  },
  shiftDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  shiftText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  iconSquareBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        cursor: 'pointer',
      } as any
    }),
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '700',
  },
  userAvatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(229, 184, 59, 0.22)',
    borderWidth: 1.5,
    borderColor: '#E5B83B',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(229, 184, 59, 0.3)',
      } as any
    }),
  },
  userAvatarText: {
    color: '#FFE082',
    fontSize: 12,
    fontWeight: '900',
  },

  /* --------------------------------------------------------
     MOBILE SWITCHER
     -------------------------------------------------------- */
  mobileSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(38, 5, 9, 0.96)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.35)',
  },
  mobileSwitchBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  mobileSwitchBtnActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#E5B83B',
  },
  mobileSwitchText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  mobileSwitchTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  /* --------------------------------------------------------
     2. MAIN WORKSPACE
     -------------------------------------------------------- */
  mainWorkspace: {
    flex: 1,
    flexDirection: 'row',
  },

  /* --------------------------------------------------------
     LEFT: CATEGORIES (2-COL FROSTED GLASS TILES)
     -------------------------------------------------------- */
  categorySidebar: {
    width: 200,
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
    transform: [{ scale: 1.03 }, { translateY: -1.5 }],
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(212, 175, 55, 0.4), 0 0 0 2.5px rgba(212, 175, 55, 0.55)',
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
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  categoriesList: {
    flexDirection: 'column',
    gap: 6,
  },
  categoryTile: {
    width: '48%',
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
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any
    }),
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
    fontWeight: '900',
    color: '#FFFFFF',
  },

  /* --------------------------------------------------------
     CENTER: MENU DISHES GRID (FROSTED GLASS)
     -------------------------------------------------------- */
  centerCatalog: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  catalogSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.22)',
    gap: 12,
    zIndex: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 2px 14px rgba(0, 0, 0, 0.03), inset 0 -1px 0 rgba(255, 255, 255, 0.8)',
      } as any
    }),
  },
  catalogTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  catalogTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#32070D',
    letterSpacing: 0.3,
  },
  runningOrdersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 6,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
        cursor: 'pointer',
      } as any
    }),
  },
  runningOrdersText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
  },
  runningOrdersBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  runningOrdersBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '900',
  },
  searchPillBox: {
    flex: 1,
    minWidth: 280,
    maxWidth: 440,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.48)',
    borderRadius: 28,
    height: 44,
    paddingHorizontal: 8,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 4px 18px rgba(82, 20, 28, 0.07), 0 2px 8px rgba(212, 175, 55, 0.15), inset 0 1px 0 rgba(255, 255, 255, 1)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any
    }),
  },
  searchPillBoxFocused: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFFFF',
    transform: [{ scale: 1.025 }, { translateY: -2 }],
    ...Platform.select({
      web: {
        boxShadow: '0 10px 28px rgba(212, 175, 55, 0.32), 0 0 0 2.5px rgba(212, 175, 55, 0.55)',
      } as any
    }),
  },
  searchIconOrb: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any
    }),
  },
  searchClearBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchShortcutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(245, 158, 11, 0.15)',
      } as any
    }),
  },
  searchShortcutText: {
    color: '#92400E',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  dishesScrollView: {
    flex: 1,
  },
  dishesGridContainer: {
    padding: 14,
  },
  dishesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dishCard: {
    width: '18.7%',
    minWidth: 155,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 148,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    position: 'relative',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any
    }),
  },
  dishCardInCart: {
    borderColor: 'rgba(82, 20, 28, 0.55)',
    backgroundColor: 'rgba(255, 248, 248, 0.9)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 10px 28px rgba(82, 20, 28, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        transform: 'translateY(-2px)',
      } as any
    }),
  },
  inCartBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    backgroundColor: '#52141C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 5,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(82, 20, 28, 0.3)',
      } as any
    }),
  },
  inCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  dishCardImageWrapper: {
    width: '100%',
    height: 94,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
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
    fontSize: 11,
    letterSpacing: 1,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
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
  dishCardRegionChip: {
    backgroundColor: 'rgba(82, 20, 28, 0.88)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      } as any,
    }),
  },
  dishCardRegionText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FDE68A',
  },
  dishCardCategoryChip: {
    backgroundColor: 'rgba(241, 245, 249, 0.85)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      } as any
    }),
  },
  dishCardCategory: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  dishCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 17,
    marginVertical: 4,
  },
  dishCardPricePill: {
    backgroundColor: 'rgba(254, 243, 199, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 6,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)',
      } as any
    }),
  },
  dishCardPricePillActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  dishCardPriceText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#92400E',
  },
  dishCardPriceTextActive: {
    color: '#FFFFFF',
  },
  noItemsBox: {
    width: '100%',
    padding: 50,
    alignItems: 'center',
  },
  noItemsText: {
    color: '#94A3B8',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
  },

  /* --------------------------------------------------------
     RIGHT: CURRENT CART (CRYSTAL FROSTED GLASS)
     -------------------------------------------------------- */
  cartSidebar: {
    width: 330,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
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
  orderTypeTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(241, 245, 249, 0.8)',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      } as any
    }),
  },
  orderTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 11,
  },
  orderTypeTabActive: {
    backgroundColor: 'rgba(53, 8, 14, 0.92)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 4px 12px rgba(53, 8, 14, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
      } as any
    }),
  },
  orderTypeTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  orderTypeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  tableCabinBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
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
    maxWidth: 260,
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
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        cursor: 'pointer',
      } as any
    }),
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
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
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
  emptyCartBox: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCartText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
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
  cartStepperBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
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
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        boxShadow: '0 2px 5px rgba(0,0,0,0.06)',
        cursor: 'pointer',
      } as any
    }),
  },
  cartStepBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
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

  /* --------------------------------------------------------
     SETTLEMENT BOTTOM (FROSTED GLASS)
     -------------------------------------------------------- */
  cartBottomSettlement: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(229, 184, 59, 0.55)',
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
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
  discountBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240, 253, 244, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(187, 247, 208, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    gap: 3,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any
    }),
  },
  discountBadgeText: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '800',
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
    fontSize: 20,
    fontWeight: '900',
    color: '#1E293B',
  },
  proceedPayBtn: {
    backgroundColor: '#35080E',
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(229, 184, 59, 0.45)',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #3D070E 0%, #5E121C 50%, #440810 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 6px 20px rgba(53, 8, 14, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
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
    gap: 6,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        cursor: 'pointer',
      } as any
    }),
  },
  holdOrderBtnText: {
    color: '#35080E',
    fontSize: 11.5,
    fontWeight: '800',
  },

  /* --------------------------------------------------------
     MODALS (FROSTED GLASS SURFACES)
     -------------------------------------------------------- */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      } as any
    }),
  },
  modalBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      } as any
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.9)',
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
  },
  modalHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalControlToolbar: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.9)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    zIndex: 100,
  },
  modalToolbarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 101,
  },
  modalSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
      } as any
    }),
  },
  modalSearchBarFocused: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFFFF',
    transform: [{ scale: 1.02 }, { translateY: -1.5 }],
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(212, 175, 55, 0.3), 0 0 0 2px rgba(212, 175, 55, 0.5)',
      } as any
    }),
  },
  modalSearchIconOrb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSearchInput: {
    flex: 1,
    height: '100%',
    fontSize: 12.5,
    fontWeight: '600',
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
  modalCountBadge: {
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  modalCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#52141C',
  },
  floorDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.55)',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    minWidth: 175,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'all 0.15s ease',
      } as any
    }),
  },
  floorDropdownBtnActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFBEB',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 10px rgba(212, 175, 55, 0.25)',
      } as any
    }),
  },
  floorDropdownBadge: {
    backgroundColor: '#52141C',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  floorDropdownBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  floorDropdownSelectedText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    maxWidth: 95,
  },
  floorDropdownCountPill: {
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  floorDropdownCountText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#52141C',
  },
  floorDropdownMenu: {
    position: 'absolute',
    top: 44,
    right: 0,
    width: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    padding: 6,
    zIndex: 9999,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
      } as any,
      default: {
        elevation: 12,
      }
    }),
  },
  floorDropdownMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.9)',
    marginBottom: 4,
  },
  floorDropdownMenuHeaderTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#52141C',
    letterSpacing: 0.3,
  },
  floorDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginVertical: 1.5,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.1s ease',
      } as any
    }),
  },
  floorDropdownOptionActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.5)',
  },
  floorOptionBadge: {
    backgroundColor: '#52141C',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 26,
    alignItems: 'center',
  },
  floorOptionBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  floorOptionName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  floorOptionNameActive: {
    color: '#52141C',
    fontWeight: '900',
  },
  floorOptionCountPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  floorOptionCountPillActive: {
    backgroundColor: 'rgba(82, 20, 28, 0.12)',
  },
  floorOptionCountText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  floorOptionCountTextActive: {
    color: '#52141C',
    fontWeight: '900',
  },
  modalSubFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  seatingTypeFilterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    padding: 2.5,
    gap: 3,
  },
  seatingTypeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 6,
    ...Platform.select({
      web: { cursor: 'pointer' } as any
    }),
  },
  seatingTypeBtnActive: {
    backgroundColor: '#52141C',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(82, 20, 28, 0.25)' } as any
    }),
  },
  seatingTypeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  seatingTypeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  statusFilterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    padding: 2.5,
    gap: 3,
  },
  statusFilterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 6,
    ...Platform.select({
      web: { cursor: 'pointer' } as any
    }),
  },
  statusFilterBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any
    }),
  },
  statusFilterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  statusFilterBtnTextActive: {
    color: '#0F172A',
    fontWeight: '900',
  },
  emptyTablesModalBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  emptyTablesModalTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
  },
  emptyTablesModalSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
  },
  resetModalFiltersBtn: {
    marginTop: 12,
    backgroundColor: '#35080E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  resetModalFiltersBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tablesModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tableModalCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    overflow: 'hidden',
    position: 'relative',
    paddingBottom: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      } as any
    }),
  },
  tableModalCardAvail: {
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'rgba(240, 253, 244, 0.55)',
  },
  tableModalCardBusy: {
    borderColor: 'rgba(220, 38, 38, 0.45)',
    backgroundColor: 'rgba(254, 242, 242, 0.55)',
  },
  tableModalCardMajlis: {
    borderColor: 'rgba(217, 119, 6, 0.45)',
    backgroundColor: 'rgba(255, 251, 235, 0.65)',
  },
  tableModalCardSelected: {
    borderColor: '#D4AF37',
    borderWidth: 2,
    backgroundColor: '#FEF3C7',
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 2px #D4AF37, 0 4px 14px rgba(212, 175, 55, 0.25)',
      } as any
    }),
  },
  tableCardTopStrip: {
    height: 4,
    width: '100%',
  },
  tableCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  tableTypeIconOrb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(82, 20, 28, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableModalCardName: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  tableStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  tableStatusBadgeAvail: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  tableStatusBadgeBilled: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  tableStatusBadgeOccupied: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  tableStatusBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  tableCardTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  tableModalCardFloorTag: {
    backgroundColor: '#F1F5F9',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  tableModalCardFloorTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
  },
  tableTypePill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  tableTypePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },
  tableCardCapacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  tableCardCapacityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  tableCardBillFooter: {
    marginTop: 6,
    marginHorizontal: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableCardBillText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#DC2626',
  },
  tableCardServerText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#8A7A70',
    maxWidth: 90,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    marginBottom: 8,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any
    }),
  },
  addNewCustBar: {
    backgroundColor: 'rgba(255, 241, 242, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(254, 205, 211, 0.9)',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderRadius: 8,
    marginBottom: 10,
  },
  addNewCustBarText: {
    color: '#BE123C',
    fontSize: 11.5,
    fontWeight: '800',
  },
  custRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 9,
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    marginBottom: 6,
  },
  custRowName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  custRowPhone: {
    fontSize: 10.5,
    color: '#64748B',
  },
  modalPrimaryBtn: {
    backgroundColor: '#35080E',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  modalSecondaryBtn: {
    backgroundColor: 'rgba(241, 245, 249, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.9)',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSecondaryBtnText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  checkoutTotalCard: {
    backgroundColor: 'rgba(53, 8, 14, 0.96)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 184, 59, 0.35)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 4px 16px rgba(53, 8, 14, 0.25)',
      } as any
    }),
  },
  checkoutTotalCardLabel: {
    color: '#E5B83B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  checkoutTotalCardVal: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  payTypeSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(241, 245, 249, 0.85)',
    borderRadius: 10,
    padding: 3,
  },
  payTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  payTypePillActive: {
    backgroundColor: '#35080E',
  },
  payTypePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  payTypePillTextActive: {
    color: '#FFFFFF',
  },
  payAmountInput: {
    flex: 1,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.9)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '700',
    paddingRight: 28,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any
    }),
  },
  payInputClearBtn: {
    position: 'absolute',
    right: 8,
    top: 9,
  },
  fullPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#35080E',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(53, 8, 14, 0.25)',
      } as any
    }),
  },
  fullPaymentBtnText: {
    color: '#FBF8F2',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  paymentInputSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  quickNotesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  quickNotesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginRight: 2,
  },
  quickNoteChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    ...Platform.select({
      web: { cursor: 'pointer' } as any
    }),
  },
  quickNoteChipText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#334155',
  },
  changeReturnCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  changeReturnTitle: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  changeReturnAmount: {
    color: '#065F46',
    fontSize: 24,
    fontWeight: '900',
    marginVertical: 2,
  },
  changeReturnSubtitle: {
    color: '#059669',
    fontSize: 10.5,
    fontWeight: '600',
  },
  remainingCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  remainingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  exactPaidCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 9,
    marginTop: 4,
  },
  exactPaidText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#166534',
  },
  ticketCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    ...Platform.select({
      web: { cursor: 'pointer' } as any
    }),
  },
  ticketCancelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  clearAllTicketsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  clearAllTicketsBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  ticketCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    padding: 12,
    marginBottom: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
      } as any
    }),
  },
  ticketCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.9)',
  },
  ticketCardNumber: {
    fontWeight: '900',
    color: '#0F172A',
    fontSize: 12.5,
  },
  ticketTablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  ticketTableText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#52141C',
  },
  ticketStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  ticketStatusText: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  ticketMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  ticketMetaText: {
    fontSize: 11,
    color: '#64748B',
  },
  ticketSubtotalText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#52141C',
  },
  ticketItemsList: {
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderRadius: 8,
    padding: 8,
    marginVertical: 4,
    gap: 4,
  },
  ticketItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketItemQty: {
    width: 24,
    fontSize: 11,
    fontWeight: '800',
    color: '#52141C',
  },
  ticketItemName: {
    flex: 1,
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  ticketItemPrice: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  ticketActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241, 245, 249, 0.9)',
  },
  ticketCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    ...Platform.select({
      web: { cursor: 'pointer' } as any
    }),
  },
  ticketCartBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  ticketBillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#52141C',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(82, 20, 28, 0.25)',
        cursor: 'pointer',
      } as any
    }),
  },
  ticketBillBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  variantOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      } as any
    }),
  },
  variantDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#52141C',
  },
  variantOptionName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  variantPricePill: {
    backgroundColor: 'rgba(254, 243, 199, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  variantPriceText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
  },
  promoCampaignCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  promoCampaignCardActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(240, 253, 244, 0.9)',
  },
  promoCampaignTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  promoCampaignSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },

  /* --------------------------------------------------------
     KEYBOARD SHORTCUT BADGES & CHEAT SHEET MODAL
     -------------------------------------------------------- */
  keyboardCapsuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      } as any,
    }),
  },
  keyboardCapsuleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D4AF37',
  },
  keyInlinePill: {
    backgroundColor: 'rgba(212, 175, 55, 0.25)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  keyInlinePillText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#FDE68A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  tabKeyBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 4,
  },
  tabKeyBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  tabKeyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  tabKeyBadgeTextActive: {
    color: '#FFFFFF',
  },
  btnShortcutBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  btnShortcutBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  keyBadgeTiny: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.35)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 3,
    marginRight: 3,
  },
  keyBadgeTinyText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#B45309',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  shortcutSectionHeading: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#8A7A70',
    letterSpacing: 1.1,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  shortcutItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.7)',
  },
  keyBadge: {
    backgroundColor: '#1E293B',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#F8FAFC',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  shortcutDescText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
    marginLeft: 12,
  },
  posRegionFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(212, 175, 55, 0.22)',
    gap: 10,
    zIndex: 9,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(82, 20, 28, 0.03)',
      } as any,
    }),
  },
  posRegionFilterLead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5ED',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
    flexShrink: 0,
  },
  posRegionLeadIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#52141C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posRegionFilterLeadText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#52141C',
    letterSpacing: 0.6,
  },
  posRegionScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
  },
  posRegionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 20,
    backgroundColor: '#FFFDF9',
    borderWidth: 1.2,
    borderColor: '#E7DEC8',
    gap: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
      } as any,
      default: {
        elevation: 1,
      },
    }),
  },
  posRegionChipActive: {
    backgroundColor: '#52141C',
    borderColor: '#D4AF37',
    borderWidth: 1.5,
    ...Platform.select({
      web: {
        boxShadow: '0 3px 12px rgba(82, 20, 28, 0.28), 0 0 0 1px rgba(212, 175, 55, 0.4)',
        transform: 'translateY(-1px)',
      } as any,
      default: {
        elevation: 3,
      },
    }),
  },
  posRegionEmoji: {
    fontSize: 13,
    lineHeight: 16,
  },
  posRegionChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3D2E24',
    letterSpacing: 0.2,
  },
  posRegionChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  posRegionChipBadge: {
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posRegionChipBadgeActive: {
    backgroundColor: '#D4AF37',
  },
  posRegionChipBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B4F3B',
  },
  posRegionChipBadgeTextActive: {
    color: '#32070D',
    fontWeight: '900',
  },
  mobileFloatingCartContainer: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    zIndex: 99,
  },
  mobileFloatingCartBtn: {
    backgroundColor: '#32070D',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(50, 7, 13, 0.45), 0 2px 8px rgba(212, 175, 55, 0.25)',
        cursor: 'pointer',
      } as any,
      default: {
        elevation: 8,
      },
    }),
  },
  mobileFloatingCartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mobileFloatingCartBadge: {
    backgroundColor: '#D4AF37',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileFloatingCartBadgeText: {
    color: '#32070D',
    fontSize: 13,
    fontWeight: '900',
  },
  mobileFloatingCartTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  mobileFloatingCartSub: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '600',
  },
  mobileFloatingCartRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobileFloatingCartTotal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});

