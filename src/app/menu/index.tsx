import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
  TextInput,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRestaurantStore, MenuItem, Table, Ticket } from '../../store/restaurantStore';
import { useOpsStore } from '../../store/opsStore';
import { broadcastImmediately } from '../../services/syncService';
import SultanLogo from '../../components/SultanLogo';
import IslamicHeroBackground from '../../components/IslamicHeroBackground';
import { BRAND } from '../../constants/brand';
import { getTableMenuUrl } from '../../utils/qrCode';

// Cart Item Type
interface CartItem {
  cartId: string;
  item: MenuItem;
  selectedVariant?: string;
  unitPrice: number;
  qty: number;
  notes?: string;
  portionLabel?: string;
}

// Customer Order Record
export interface CustomerOrderHistory {
  id: string;
  orderNumber: string;
  orderType: 'dine_in' | 'delivery';
  tableId?: string;
  tableName?: string;
  floor?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    notes?: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'SERVED' | 'CANCELLED';
  createdAt: number;
  riderName?: string;
  riderPhone?: string;
  assignedWaiter?: string;
  managerNotes?: string;
  estimatedDeliveryMinutes?: number;
}

const STORAGE_KEY_PROFILE = '@sultan_customer_profile';
const STORAGE_KEY_ORDERS = '@sultan_customer_orders_v2';

export default function CustomerMenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    table?: string;
    tableId?: string;
    tableName?: string;
    floor?: string;
    mode?: string;
  }>();

  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 640 && width < 1024;
  const isMobile = width < 640;

  const menuItems = useRestaurantStore(state => state.menuItems);
  const categories = useRestaurantStore(state => state.categories);
  const storeRegions = useRestaurantStore(state => state.regions);
  const tables = useRestaurantStore(state => state.tables);
  const syncFromServer = useRestaurantStore(state => state.syncFromServer);
  const unavailableIds = useOpsStore(state => state.unavailableItemIds) || [];

  // Order Mode & Active Table
  const [orderMode, setOrderMode] = useState<'dine_in' | 'delivery'>(
    params.mode === 'delivery' ? 'delivery' : 'dine_in'
  );
  const [selectedTable, setSelectedTable] = useState<{ id: string; name: string; floor: string } | null>(null);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [activeFloorFilter, setActiveFloorFilter] = useState<string>('Ground Floor');
  const [copiedLink, setCopiedLink] = useState(false);

  // Search, Category & Region Filters
  const [activeCat, setActiveCat] = useState('All');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'specials' | 'spicy' | 'veg'>('all');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [customizerQty, setCustomizerQty] = useState<number>(1);
  const [customizerNotes, setCustomizerNotes] = useState<string>('');
  const [weightKg, setWeightKg] = useState<number>(1.0);
  const [spiceLevel, setSpiceLevel] = useState<'Mild' | 'Medium' | 'Spicy' | 'Extra Hot'>('Medium');

  // Modals
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<CustomerOrderHistory | null>(null);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);

  // Profile Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'card' | 'jazzcash' | 'easypaisa'>('cash_on_delivery');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Order History List
  const [orderHistory, setOrderHistory] = useState<CustomerOrderHistory[]>([]);

  // Audio Chime & Mute Controller
  const [soundMuted, setSoundMuted] = useState(false);
  const lastPlayedStatusRef = useRef<Record<string, string>>({});

  // Audio Chime (Guaranteed Single Playback per Status Transition)
  const playChime = (type: 'order_placed' | 'status_update') => {
    if (soundMuted) return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          if (type === 'order_placed') {
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
          } else {
            osc.frequency.setValueAtTime(523.25, ctx.currentTime);
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
          }
        }
      }
    } catch {}
  };

  // Delete single order from customer history
  const handleDeleteOrder = (orderId: string) => {
    const nextList = orderHistory.filter(o => o.id !== orderId);
    setOrderHistory(nextList);
    AsyncStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(nextList)).catch(() => {});
    if (activeTrackingOrder?.id === orderId) {
      setActiveTrackingOrder(null);
      setTrackingModalVisible(false);
    }
  };

  // Clear completed orders (Served, Delivered, Cancelled)
  const handleClearCompletedOrders = () => {
    const nextList = orderHistory.filter(
      o => o.status !== 'DELIVERED' && o.status !== 'SERVED' && o.status !== 'CANCELLED'
    );
    setOrderHistory(nextList);
    AsyncStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(nextList)).catch(() => {});
  };

  // Clear all order history
  const handleClearAllHistory = () => {
    setOrderHistory([]);
    AsyncStorage.removeItem(STORAGE_KEY_ORDERS).catch(() => {});
    setActiveTrackingOrder(null);
  };

  // Clear entire cart tray
  const handleClearCart = () => {
    setCart([]);
  };

  // Remove single item from cart tray
  const handleRemoveCartItem = (cartId: string) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId));
  };

  const getBaseUrl = () => {
    if (Platform.OS === 'web') {
      const host = typeof window !== 'undefined' && window.location?.hostname && window.location.hostname !== '127.0.0.1'
        ? (window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname)
        : '192.168.1.4';
      return `http://${host}:5050`;
    }
    return 'http://192.168.1.4:5050';
  };

  const getWsUrl = () => {
    if (Platform.OS === 'web') {
      const host = typeof window !== 'undefined' && window.location?.hostname && window.location.hostname !== '127.0.0.1'
        ? (window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname)
        : '192.168.1.4';
      return `ws://${host}:5050`;
    }
    return 'ws://192.168.1.4:5050';
  };

  // 1. Load Saved Profile & Orders
  useEffect(() => {
    (async () => {
      try {
        const savedProfile = await AsyncStorage.getItem(STORAGE_KEY_PROFILE);
        if (savedProfile) {
          const prof = JSON.parse(savedProfile);
          if (prof.name) setCustomerName(prof.name);
          if (prof.phone) setCustomerPhone(prof.phone);
          if (prof.address) setDeliveryAddress(prof.address);
        }

        const savedOrders = await AsyncStorage.getItem(STORAGE_KEY_ORDERS);
        if (savedOrders) {
          const parsed = JSON.parse(savedOrders);
          if (Array.isArray(parsed)) setOrderHistory(parsed);
        }
      } catch (e) {
        console.warn('[Menu] Failed to load local storage:', e);
      }
    })();
  }, []);

  // 1b. Real-Time Catalog & Tables Sync from Server on Mount
  useEffect(() => {
    let isMounted = true;
    const fetchLatestCatalog = async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/sync`);
        if (res.ok && isMounted) {
          const remoteState = await res.json();
          if (remoteState) {
            useRestaurantStore.getState().syncFromServer(remoteState);
          }
        }
      } catch (err) {
        try {
          const [menuRes, catRes, tablesRes] = await Promise.all([
            fetch(`${getBaseUrl()}/api/public/menu`).catch(() => null),
            fetch(`${getBaseUrl()}/api/public/categories`).catch(() => null),
            fetch(`${getBaseUrl()}/api/public/tables`).catch(() => null),
          ]);
          if (menuRes && menuRes.ok && isMounted) {
            const menuJson = await menuRes.json();
            if (menuJson.success && Array.isArray(menuJson.data)) {
              useRestaurantStore.getState().syncFromServer({ menuItems: menuJson.data });
            }
          }
          if (catRes && catRes.ok && isMounted) {
            const catJson = await catRes.json();
            if (catJson.success && Array.isArray(catJson.data)) {
              useRestaurantStore.getState().syncFromServer({ categories: catJson.data });
            }
          }
          if (tablesRes && tablesRes.ok && isMounted) {
            const tblJson = await tablesRes.json();
            if (tblJson.success && Array.isArray(tblJson.data)) {
              useRestaurantStore.getState().syncFromServer({ tables: tblJson.data });
            }
          }
        } catch {}
      }
    };

    fetchLatestCatalog();
    return () => { isMounted = false; };
  }, []);

  // 2. Read URL Search Params (Table QR deep linking)
  const targetTableParam = (params.table || params.tableId || '') as string;
  const targetTableName = (params.tableName || '') as string;

  useEffect(() => {
    if (targetTableParam && tables.length > 0) {
      const matched = tables.find(
        t => t.id === targetTableParam || t.name === targetTableParam || (targetTableName && t.name === targetTableName)
      );
      if (matched) {
        setSelectedTable(prev => {
          if (prev?.id === matched.id) return prev;
          return {
            id: matched.id,
            name: matched.name,
            floor: matched.floor || 'Ground Floor',
          };
        });
        const targetFloor = matched.floor || 'Ground Floor';
        setActiveFloorFilter(prev => (prev === targetFloor ? prev : targetFloor));
        setOrderMode(prev => (prev === 'dine_in' ? prev : 'dine_in'));
        return;
      }
    }

    // Fallback: pick first table only if none is selected
    if (tables.length > 0 && orderMode === 'dine_in') {
      setSelectedTable(prev => {
        if (prev) return prev;
        const firstAvailable = tables[0];
        return {
          id: firstAvailable.id,
          name: firstAvailable.name,
          floor: firstAvailable.floor || 'Ground Floor',
        };
      });
    }
  }, [targetTableParam, targetTableName, tables, orderMode]);

  // 3. WebSocket / Polling for Active Tracking (No Infinite Beeping)
  useEffect(() => {
    if (!activeTrackingOrder) return;

    const orderId = activeTrackingOrder.id;
    if (!lastPlayedStatusRef.current[orderId]) {
      lastPlayedStatusRef.current[orderId] = activeTrackingOrder.status;
    }

    const fetchLatestStatus = async () => {
      // If order is completed or cancelled, stop polling
      if (
        activeTrackingOrder.status === 'DELIVERED' ||
        activeTrackingOrder.status === 'SERVED' ||
        activeTrackingOrder.status === 'CANCELLED'
      ) {
        return;
      }

      try {
        const res = await fetch(`${getBaseUrl()}/api/public/orders/${orderId}`);
        const data = await res.json();
        const orderData = data.order || data.data;
        if (data.success && orderData) {
          const newStatus = orderData.status;
          const oldStatus = lastPlayedStatusRef.current[orderId] || activeTrackingOrder.status;

          // ONLY play chime once when status ACTUALLY transitions
          if (newStatus && newStatus !== oldStatus) {
            lastPlayedStatusRef.current[orderId] = newStatus;
            playChime('status_update');
          }

          const updated: CustomerOrderHistory = {
            ...activeTrackingOrder,
            ...orderData,
          };

          setActiveTrackingOrder(updated);
          setOrderHistory(prev => {
            const nextList = prev.map(o => (o.id === orderId ? updated : o));
            AsyncStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(nextList)).catch(() => {});
            return nextList;
          });
        }
      } catch {}
    };

    fetchLatestStatus();
    const interval = setInterval(fetchLatestStatus, 5000);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getWsUrl());
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (
            (parsed.type === 'ORDER_STATUS_CHANGED' || parsed.type === 'STATUS_UPDATE') &&
            parsed.orderId === orderId
          ) {
            fetchLatestStatus();
          }
        } catch {}
      };
    } catch {}

    return () => {
      clearInterval(interval);
      if (ws) {
        try { ws.close(); } catch {}
      }
    };
  }, [activeTrackingOrder?.id, activeTrackingOrder?.status]);

  // Image Fallback
  const getFallbackImage = (category: string) => {
    switch (category) {
      case 'Mains':
      case 'Karahi & Handi':
        return 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&q=80';
      case 'BBQ':
      case 'Grill':
        return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80';
      case 'Biryani & Rice':
        return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80';
      case 'Desserts':
        return 'https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=600&q=80';
      case 'Drinks':
      case 'Beverages':
        return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&q=80';
      default:
        return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80';
    }
  };

  const getCategoryEmoji = (cat: string) => {
    const lower = cat.toLowerCase();
    if (lower === 'all') return '👑';
    if (lower.includes('karahi') || lower.includes('handi')) return '🥘';
    if (lower.includes('bbq') || lower.includes('kabab') || lower.includes('grill') || lower.includes('tikka')) return '🍢';
    if (lower.includes('biryani') || lower.includes('rice') || lower.includes('pulao')) return '🍚';
    if (lower.includes('mains') || lower.includes('curry')) return '🍲';
    if (lower.includes('appetizer') || lower.includes('starter') || lower.includes('soup') || lower.includes('roll')) return '🥟';
    if (lower.includes('naan') || lower.includes('roti') || lower.includes('bread')) return '🫓';
    if (lower.includes('dessert') || lower.includes('sweet') || lower.includes('kunafa') || lower.includes('kheer')) return '🍨';
    if (lower.includes('drink') || lower.includes('beverage') || lower.includes('juice') || lower.includes('shake')) return '🍹';
    if (lower.includes('deal') || lower.includes('combo') || lower.includes('family')) return '🎁';
    return '🍽️';
  };

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

  // Guaranteed unique category list starting with 'All'
  const categoryTabs = useMemo(() => {
    const set = new Set<string>();
    (categories || []).forEach(c => {
      const clean = (c || '').trim();
      if (clean && clean.toLowerCase() !== 'all') set.add(clean);
    });
    return ['All', ...Array.from(set)];
  }, [categories]);

  // Unique list of active Cuisines / Regions (excluding 'ALL')
  const regions = useMemo(() => {
    const set = new Set<string>();
    (storeRegions || []).forEach(r => {
      const clean = (r || '').trim();
      if (clean && clean.toLowerCase() !== 'all') set.add(clean);
    });
    (menuItems || []).forEach(m => {
      const clean = (m.region || '').trim();
      if (clean && clean.toLowerCase() !== 'all') set.add(clean);
    });
    return Array.from(set);
  }, [storeRegions, menuItems]);

  // Real-time cuisine counts for active category
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    (menuItems || []).forEach(item => {
      const matchCat = activeCat === 'All' || activeCat === 'ALL' || (item.category || '').toLowerCase() === activeCat.toLowerCase();
      if (!matchCat) return;
      counts['ALL'] = (counts['ALL'] || 0) + 1;
      if (item.region) {
        counts[item.region] = (counts[item.region] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems, activeCat]);

  // Real-time category counts for active region
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0, ALL: 0 };
    (menuItems || []).forEach(item => {
      let matchRegion = true;
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        matchRegion = (item.region || '').trim().toLowerCase() === activeRegion.trim().toLowerCase();
      }
      if (!matchRegion) return;
      counts['All'] = (counts['All'] || 0) + 1;
      counts['ALL'] = (counts['ALL'] || 0) + 1;
      if (item.category) {
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems, activeRegion]);

  // Filtered Menu Items (Matching Category, Region, Search Query & Dietary Filter)
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      // 1. Category Filter
      const matchCat = activeCat === 'All' || activeCat === 'ALL' || (item.category || '').toLowerCase() === activeCat.toLowerCase();

      // 2. Region / Cuisine Filter
      let matchRegion = true;
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        matchRegion = (item.region || '').trim().toLowerCase() === activeRegion.trim().toLowerCase();
      }

      // 3. Search Query
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.urduName && item.urduName.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.region && item.region.toLowerCase().includes(q));

      // 4. Dietary Filter
      let matchDiet = true;
      if (dietaryFilter === 'specials') {
        matchDiet = Boolean(item.badge || item.isDeal);
      } else if (dietaryFilter === 'spicy') {
        const lower = item.name.toLowerCase();
        matchDiet = lower.includes('spicy') || lower.includes('karahi') || lower.includes('tikka');
      } else if (dietaryFilter === 'veg') {
        const lower = (item.name + ' ' + (item.category || '')).toLowerCase();
        matchDiet = lower.includes('veg') || lower.includes('paneer') || lower.includes('daal') || lower.includes('naan') || lower.includes('dessert') || lower.includes('drink');
      }

      return matchCat && matchRegion && matchQuery && matchDiet;
    });
  }, [menuItems, activeCat, activeRegion, searchQuery, dietaryFilter]);

  // Is Sold Out
  const isItemSoldOut = (item: MenuItem) => {
    return (
      unavailableIds.includes(item.id) ||
      item.available === false ||
      (typeof item.stock === 'number' && item.stock <= 0) ||
      (item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0)
    );
  };

  // Find item count in cart
  const getItemCartQty = (itemId: string) => {
    return cart
      .filter(c => c.item.id === itemId)
      .reduce((sum, c) => sum + c.qty, 0);
  };

  // Quick Direct Add to Cart (for simple items)
  const handleQuickAdd = (item: MenuItem) => {
    if (isItemSoldOut(item)) return;

    const lowerName = item.name.toLowerCase();
    const hasVariants = item.variants && item.variants.length > 0;
    const isWeightDish =
      lowerName.includes('karahi') ||
      lowerName.includes('handi') ||
      lowerName.includes('sajji') ||
      lowerName.includes('kg');

    if (hasVariants || isWeightDish) {
      handleOpenCustomizer(item);
      return;
    }

    const existing = cart.find(c => c.item.id === item.id && !c.selectedVariant && !c.portionLabel);
    if (existing) {
      updateCartQty(existing.cartId, 1);
    } else {
      const newItem: CartItem = {
        cartId: `${item.id}-${Date.now()}`,
        item,
        unitPrice: item.price,
        qty: 1,
      };
      setCart(prev => [...prev, newItem]);
    }
  };

  // Open Customizer
  const handleOpenCustomizer = (item: MenuItem) => {
    if (isItemSoldOut(item)) {
      if (Platform.OS === 'web') {
        window.alert(`"${item.name}" is currently Sold Out (ختم ہو گیا).`);
      } else {
        Alert.alert('Sold Out', `"${item.name}" is currently Sold Out (ختم ہو گیا).`);
      }
      return;
    }

    setCustomizerItem(item);
    setCustomizerQty(1);
    setCustomizerNotes('');
    setWeightKg(1.0);
    setSpiceLevel('Medium');
    if (item.variants && item.variants.length > 0) {
      setSelectedVariant(item.variants[0].name);
    } else {
      setSelectedVariant('');
    }
  };

  // Add from Customizer Modal
  const handleAddFromCustomizer = () => {
    if (!customizerItem) return;

    let finalPrice = customizerItem.price;
    let portionLabel = '';

    const lowerName = customizerItem.name.toLowerCase();
    const isWeightDish =
      lowerName.includes('karahi') ||
      lowerName.includes('handi') ||
      lowerName.includes('sajji') ||
      lowerName.includes('roast') ||
      lowerName.includes('fish') ||
      lowerName.includes('kg');

    if (customizerItem.variants && customizerItem.variants.length > 0 && selectedVariant) {
      const v = customizerItem.variants.find(vr => vr.name === selectedVariant);
      if (v) {
        finalPrice = v.price;
        portionLabel = v.name;
      }
    } else if (isWeightDish) {
      finalPrice = Math.round(customizerItem.price * weightKg);
      portionLabel = weightKg === 0.25 ? 'Quarter (0.25 kg)' : weightKg === 0.5 ? 'Half (0.5 kg)' : `${weightKg} kg`;
    }

    const noteSegments = [];
    if (spiceLevel) noteSegments.push(`Spice: ${spiceLevel}`);
    if (customizerNotes.trim()) noteSegments.push(customizerNotes.trim());

    const cartId = `${customizerItem.id}-${selectedVariant}-${weightKg}-${Date.now()}`;
    const newItem: CartItem = {
      cartId,
      item: customizerItem,
      selectedVariant: selectedVariant || undefined,
      portionLabel: portionLabel || undefined,
      unitPrice: finalPrice,
      qty: customizerQty,
      notes: noteSegments.join(' | ') || undefined,
    };

    setCart(prev => [...prev, newItem]);
    setCustomizerItem(null);
  };

  // Update Cart Quantity
  const updateCartQty = (cartId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(ci => {
          if (ci.cartId === cartId) {
            const newQ = ci.qty + delta;
            return newQ > 0 ? { ...ci, qty: newQ } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Quick decrease from card
  const handleQuickDecrease = (itemId: string) => {
    const existing = [...cart].reverse().find(c => c.item.id === itemId);
    if (existing) {
      updateCartQty(existing.cartId, -1);
    }
  };

  // Financial Computations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  }, [cart]);

  const deliveryFee = orderMode === 'dine_in' ? 0 : subtotal >= 2500 ? 0 : 150;
  const tax = Math.round(subtotal * 0.05); // 5% GST
  const grandTotal = subtotal + deliveryFee + tax;
  const totalCartCount = useMemo(() => cart.reduce((sum, i) => sum + i.qty, 0), [cart]);

  // Place Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      const msg = 'Please enter your Name and Phone Number to confirm your order.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Required Info', msg);
      return;
    }

    if (orderMode === 'delivery' && !deliveryAddress.trim()) {
      const msg = 'Please enter your complete Delivery Address for home delivery.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Address Needed', msg);
      return;
    }

    setSubmittingOrder(true);

    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_PROFILE,
        JSON.stringify({
          name: customerName.trim(),
          phone: customerPhone.trim(),
          address: deliveryAddress.trim(),
        })
      );
    } catch {}

    const orderPayload = {
      orderType: orderMode,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: orderMode === 'delivery' ? { addressLine: deliveryAddress.trim(), area: 'Customer Area' } : undefined,
      tableId: orderMode === 'dine_in' ? (selectedTable?.id || 'T-1') : undefined,
      tableName: orderMode === 'dine_in' ? `${selectedTable?.floor || 'Ground Floor'} • ${selectedTable?.name || 'Table'}` : undefined,
      tableInfo: orderMode === 'dine_in' && selectedTable ? {
        tableId: selectedTable.id,
        tableName: selectedTable.name,
        floor: selectedTable.floor || 'Ground Floor',
        seatingType: 'tables',
      } : undefined,
      paymentMethod,
      items: cart.map(c => ({
        id: c.item.id,
        name: c.portionLabel ? `${c.item.name} (${c.portionLabel})` : c.item.name,
        qty: c.qty,
        quantity: c.qty,
        price: c.unitPrice,
        unitPrice: c.unitPrice,
        selectedVariant: c.selectedVariant,
        notes: c.notes,
      })),
    };

    try {
      let createdOrder: CustomerOrderHistory | null = null;
      let orderNum = `SLT-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Send to Backend
      try {
        const res = await fetch(`${getBaseUrl()}/api/public/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });
        const data = await res.json();
        const returnedOrder = data.data || data.order;
        if (data.success && returnedOrder) {
          createdOrder = {
            id: returnedOrder.id,
            orderNumber: returnedOrder.orderNumber || orderNum,
            orderType: orderMode,
            tableId: selectedTable?.id,
            tableName: orderPayload.tableName,
            floor: selectedTable?.floor,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            deliveryAddress: deliveryAddress.trim(),
            items: cart.map(c => ({
              name: c.portionLabel ? `${c.item.name} (${c.portionLabel})` : c.item.name,
              qty: c.qty,
              price: c.unitPrice,
              notes: c.notes,
            })),
            subtotal,
            deliveryFee,
            tax,
            total: grandTotal,
            status: returnedOrder.status || 'PENDING',
            createdAt: returnedOrder.createdAt || Date.now(),
            estimatedDeliveryMinutes: orderMode === 'dine_in' ? 20 : 35,
          };

          // Also reconcile ticket locally if returned
          if (data.ticket) {
            const currentTickets = useRestaurantStore.getState().tickets || [];
            if (!currentTickets.some((t: Ticket) => t.id === data.ticket.id)) {
              useRestaurantStore.getState().syncFromServer({
                tickets: [data.ticket, ...currentTickets]
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Menu] Server unreachable, using local fallback:', err);
      }

      // 2. Offline / Local fallback
      if (!createdOrder) {
        const fallbackId = `ORD-LOC-${Date.now().toString().slice(-6)}`;
        createdOrder = {
          id: fallbackId,
          orderNumber: orderNum,
          orderType: orderMode,
          tableId: selectedTable?.id,
          tableName: orderPayload.tableName,
          floor: selectedTable?.floor,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          items: cart.map(c => ({
            name: c.portionLabel ? `${c.item.name} (${c.portionLabel})` : c.item.name,
            qty: c.qty,
            price: c.unitPrice,
            notes: c.notes,
          })),
          subtotal,
          deliveryFee,
          tax,
          total: grandTotal,
          status: 'PENDING',
          createdAt: Date.now(),
          estimatedDeliveryMinutes: orderMode === 'dine_in' ? 20 : 35,
        };

        try {
          const newTicket: Ticket = {
            id: `KOT-${Math.floor(1000 + Math.random() * 9000)}`,
            orderId: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            tableId: selectedTable?.id || 'dine-in-app',
            tableName: orderPayload.tableName || 'Customer Table',
            server: orderMode === 'dine_in' ? 'App Guest (Contactless QR)' : 'Online Delivery',
            timePlaced: Date.now(),
            status: 'cooking',
            items: cart.map(c => ({
              id: c.item.id,
              name: c.portionLabel ? `${c.item.name} (${c.portionLabel})` : c.item.name,
              price: c.unitPrice,
              qty: c.qty,
              notes: c.notes,
              completed: false,
              station: c.item.station || 'main',
            })),
          };
          syncFromServer({
            tickets: [newTicket, ...(useRestaurantStore.getState().tickets || [])],
          });
        } catch {}
      }

      try {
        broadcastImmediately();
      } catch {}

      const updatedHistory = [createdOrder, ...orderHistory];
      setOrderHistory(updatedHistory);
      await AsyncStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(updatedHistory));

      playChime('order_placed');
      setCart([]);
      setCartModalVisible(false);
      setActiveTrackingOrder(createdOrder);
      setTrackingModalVisible(true);
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message || 'Failed to place order');
      else Alert.alert('Error', e.message || 'Failed to place order');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Status Stepper Helper
  const getProgressStage = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { step: 1, percent: '20%', label: 'Order Received', desc: 'Sent to Sultan Front Desk' };
      case 'CONFIRMED':
        return { step: 2, percent: '45%', label: 'Order Confirmed', desc: 'Sent to Royal Kitchen' };
      case 'PREPARING':
        return { step: 3, percent: '70%', label: 'Cooking in Kitchen', desc: 'Chefs are preparing your dishes' };
      case 'READY':
      case 'READY_FOR_PICKUP':
        return { step: 4, percent: '88%', label: 'Food Ready', desc: 'Ready for table serving / rider' };
      case 'OUT_FOR_DELIVERY':
        return { step: 4, percent: '90%', label: 'Out for Delivery 🛵', desc: 'Rider is on the way' };
      case 'DELIVERED':
      case 'SERVED':
        return { step: 5, percent: '100%', label: 'Delivered / Served 🎉', desc: 'Enjoy your Sultan meal!' };
      case 'CANCELLED':
        return { step: 0, percent: '0%', label: 'Order Cancelled', desc: 'Order was rejected or cancelled' };
      default:
        return { step: 1, percent: '20%', label: status, desc: 'Processing your order' };
    }
  };

  const floorsList = useMemo(() => {
    const set = new Set<string>();
    tables.forEach(t => { if (t.floor) set.add(t.floor); });
    return ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Rooftop'];
  }, [tables]);

  const filteredTablesByFloor = useMemo(() => {
    return tables.filter(t => (t.floor || 'Ground Floor') === activeFloorFilter);
  }, [tables, activeFloorFilter]);

  // Render Card Component (Exact POS Terminal Design Language)
  const renderItemCard = (item: MenuItem) => {
    const isSoldOut = isItemSoldOut(item);
    const inCartQty = getItemCartQty(item.id);
    const isItemInCart = inCartQty > 0;
    const cardWidth = isDesktop ? '31.5%' : isTablet ? '31.5%' : '48%';

    const lowerName = item.name.toLowerCase();
    const hasVariants = Boolean(item.variants && item.variants.length > 0);
    const isWeightDish =
      lowerName.includes('karahi') ||
      lowerName.includes('handi') ||
      lowerName.includes('sajji') ||
      lowerName.includes('kg');

    return (
      <TouchableOpacity
        key={item.id}
        {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
        style={[
          styles.dishCard,
          { width: cardWidth as any },
          isItemInCart && styles.dishCardInCart,
          isSoldOut && { opacity: 0.65 },
        ]}
        onPress={() => (hasVariants || isWeightDish ? handleOpenCustomizer(item) : handleQuickAdd(item))}
        activeOpacity={0.8}
        disabled={isSoldOut}
      >
        {/* Floating M3 In-Cart Badge */}
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
                name={item.isDeal ? 'gift' : 'restaurant-outline'}
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
          ) : item.isDeal ? (
            <View style={[styles.dishCardBadgeTag, { backgroundColor: '#7C3AED' }]}>
              <Text style={[styles.dishCardBadgeText, { color: '#FFF' }]} numberOfLines={1}>
                DEAL
              </Text>
            </View>
          ) : null}

          {/* Out of Stock Overlay */}
          {isSoldOut && (
            <View style={styles.dishSoldOutOverlay}>
              <Text style={styles.dishSoldOutText}>SOLD OUT</Text>
            </View>
          )}
        </View>

        {/* Middle: Dish Name */}
        <View style={styles.dishTitleWrapper}>
          <Text style={styles.dishCardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          {item.urduName ? (
            <Text style={styles.dishCardUrduText} numberOfLines={1}>
              {item.urduName}
            </Text>
          ) : (hasVariants || isWeightDish) ? (
            <Text style={styles.dishCardVariantHint} numberOfLines={1}>
              {hasVariants ? `${item.variants?.length} Sizes` : 'Quarter/Half/1kg'}
            </Text>
          ) : null}
        </View>

        {/* Bottom: Warm Cream Price Capsule & Action Controls */}
        <View style={styles.dishCardBottomSection}>
          <View style={[styles.dishCardPricePill, isItemInCart && styles.dishCardPricePillActive]}>
            <Text style={[styles.dishCardPriceText, isItemInCart && styles.dishCardPriceTextActive]}>
              Rs. {item.price.toLocaleString()}
            </Text>
          </View>

          {/* Quick Stepper or Quick Add */}
          {isItemInCart ? (
            <View style={styles.cardStepperRow}>
              <TouchableOpacity
                style={styles.cardStepperBtnMini}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleQuickDecrease(item.id);
                }}
                accessibilityLabel="Decrease quantity"
              >
                <Ionicons name="remove" size={13} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.cardStepperCount}>{inCartQty}</Text>
              <TouchableOpacity
                style={styles.cardStepperBtnMini}
                onPress={(e) => {
                  e.stopPropagation?.();
                  hasVariants || isWeightDish ? handleOpenCustomizer(item) : handleQuickAdd(item);
                }}
                accessibilityLabel="Increase quantity"
              >
                <Ionicons name="add" size={13} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.cardQuickAddBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                hasVariants || isWeightDish ? handleOpenCustomizer(item) : handleQuickAdd(item);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name={hasVariants || isWeightDish ? "options-outline" : "add"} size={13} color="#3A0F12" />
              <Text style={styles.cardQuickAddText}>{hasVariants || isWeightDish ? 'CUSTOMIZE' : 'ADD'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#24050A" />

      <View style={styles.screenWrapper}>
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ========================================================
              1. REGAL SULTAN HERO & COVER HEADER WITH ISLAMIC PATTERN
             ======================================================== */}
          <IslamicHeroBackground style={styles.heroBanner}>
            <View style={styles.heroOverlayContent}>
              <View style={[styles.heroTopActions, isMobile && { justifyContent: 'flex-end', marginBottom: 10 }]}>
                {!isMobile && (
                  <TouchableOpacity
                    style={styles.heroNavBtn}
                    onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                  >
                    <Ionicons name="arrow-back" size={18} color="#FFF" />
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {/* Mute / Unmute Sound Toggle Button */}
                  <TouchableOpacity
                    style={styles.heroSoundPill}
                    onPress={() => setSoundMuted(!soundMuted)}
                  >
                    <Ionicons
                      name={soundMuted ? 'volume-mute' : 'volume-high'}
                      size={14}
                      color={soundMuted ? '#EF4444' : '#D5A943'}
                    />
                    <Text style={[styles.heroSoundPillText, soundMuted && { color: '#EF4444' }]}>
                      {soundMuted ? 'Muted' : 'Sound ON'}
                    </Text>
                  </TouchableOpacity>

                  {orderHistory.length > 0 && (
                    <TouchableOpacity
                      style={styles.heroOrdersPill}
                      onPress={() => setHistoryModalVisible(true)}
                    >
                      <Ionicons name="receipt-outline" size={14} color="#D5A943" />
                      <Text style={styles.heroOrdersPillText}>My Orders ({orderHistory.length})</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Royal Crest & Branding: Logo on Left, Details on Right (Mobile Optimized) */}
              <View style={[styles.heroBrandingRow, isMobile && styles.heroBrandingRowMobile]}>
                {/* Left: Prominent & Grand Logo in Royal Glowing Halo */}
                <View style={styles.heroLogoCol}>
                  <View style={[styles.crestHaloOuter, isMobile && styles.crestHaloOuterMobile]}>
                    <View style={[styles.crestHalo, isMobile && styles.crestHaloMobile]}>
                      <SultanLogo
                        size={isMobile ? 'sm' : 'lg'}
                        width={isMobile ? 64 : 96}
                        height={isMobile ? 58 : 88}
                      />
                    </View>
                  </View>
                </View>

                {/* Right: Restaurant Details */}
                <View style={styles.heroDetailsCol}>
                  {/* Royal Urdu Calligraphy Crown */}
                  <View style={styles.heroUrduCrownRow}>
                    <Text style={[styles.heroUrduStar, isMobile && { fontSize: 10 }]}>✦</Text>
                    <Text style={[styles.heroSubtitleUrdu, isMobile && { fontSize: 13 }]}>سلطان ریستوراں</Text>
                    <Text style={[styles.heroUrduStar, isMobile && { fontSize: 10 }]}>✦</Text>
                  </View>

                  <Text
                    style={[styles.heroMainTitle, isMobile && styles.heroMainTitleMobile]}
                    numberOfLines={1}
                  >
                    SULTAN RESTAURANT
                  </Text>
                  <Text style={[styles.heroSubDesc, isMobile && styles.heroSubDescMobile]} numberOfLines={1}>
                    مغلئی شاہی ذائقے اور باربی کیو • Royal Mughlai
                  </Text>

                  {/* Highlights Row */}
                  <View style={[styles.heroHighlightsRow, isMobile && styles.heroHighlightsRowMobile]}>
                    <View style={[styles.highlightBadge, isMobile && styles.highlightBadgeMobile]}>
                      <Ionicons name="star" size={isMobile ? 10 : 11} color="#D5A943" />
                      <Text style={[styles.highlightText, isMobile && styles.highlightTextMobile]}>4.9 (1.8k+)</Text>
                    </View>
                    <View style={[styles.highlightBadge, isMobile && styles.highlightBadgeMobile]}>
                      <Ionicons name="shield-checkmark" size={isMobile ? 10 : 11} color="#4ADE80" />
                      <Text style={[styles.highlightText, isMobile && styles.highlightTextMobile]}>100% Halal</Text>
                    </View>
                    <View style={[styles.highlightBadge, isMobile && styles.highlightBadgeMobile]}>
                      <Ionicons name="flame" size={isMobile ? 10 : 11} color="#F97316" />
                      <Text style={[styles.highlightText, isMobile && styles.highlightTextMobile]}>Charcoal BBQ</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </IslamicHeroBackground>

          {/* ========================================================
              2. DINE-IN TABLE / DELIVERY MODE SELECTOR CARD
             ======================================================== */}
          <View style={styles.modeControlContainer}>
            <View style={styles.modeToggleBar}>
              <TouchableOpacity
                style={[styles.modeToggleBtn, orderMode === 'dine_in' && styles.modeToggleBtnActive]}
                onPress={() => setOrderMode('dine_in')}
              >
                <Ionicons
                  name="restaurant"
                  size={16}
                  color={orderMode === 'dine_in' ? '#D5A943' : '#888'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.modeToggleText, orderMode === 'dine_in' && styles.modeToggleTextActive]}>
                  Table QR Dine-In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeToggleBtn, orderMode === 'delivery' && styles.modeToggleBtnActive]}
                onPress={() => setOrderMode('delivery')}
              >
                <Ionicons
                  name="bicycle"
                  size={16}
                  color={orderMode === 'delivery' ? '#D5A943' : '#888'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.modeToggleText, orderMode === 'delivery' && styles.modeToggleTextActive]}>
                  Home Delivery
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mode Details Strip */}
            {orderMode === 'dine_in' ? (
              <View style={styles.tableBannerRow}>
                <View style={styles.tableIconWrapper}>
                  <Ionicons name="qr-code" size={18} color="#D5A943" />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.tableTitleText}>
                    {selectedTable?.floor || 'Ground Floor'} • {selectedTable?.name || 'Table Selected'}
                  </Text>
                  <Text style={styles.tableSubText}>
                    Order sent directly to Royal Kitchen KDS at your table
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeTableBtn}
                  onPress={() => setTableModalVisible(true)}
                >
                  <Text style={styles.changeTableBtnText}>Change Table</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.tableBannerRow}>
                <View style={[styles.tableIconWrapper, { backgroundColor: '#064E3B' }]}>
                  <Ionicons name="flash" size={18} color="#34D399" />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.tableTitleText, { color: '#065F46' }]}>
                    Sultan Express Delivery (35-45 mins)
                  </Text>
                  <Text style={styles.tableSubText}>
                    Free delivery on orders above Rs. 2,500 (Standard: Rs. 150)
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* ========================================================
              3. SEARCH & DIETARY FILTER PILLS
             ======================================================== */}
          <View style={styles.filterSectionContainer}>
            {/* Search Input Box */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#895B1E" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search mutton karahi, chicken handi, seekh kababs, kunafa, drinks..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#888" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Dietary Tags */}
            <View style={styles.dietaryRow}>
              {[
                { id: 'all', label: 'All Dishes' },
                { id: 'specials', label: '⭐ Chef Specials' },
                { id: 'spicy', label: '🌶️ Spicy Royal' },
                { id: 'veg', label: '🌿 Vegetarian & Breads' },
              ].map(tag => (
                <TouchableOpacity
                  key={tag.id}
                  style={[styles.dietaryChip, dietaryFilter === tag.id && styles.dietaryChipActive]}
                  onPress={() => setDietaryFilter(tag.id as any)}
                >
                  <Text style={[styles.dietaryChipText, dietaryFilter === tag.id && styles.dietaryChipTextActive]}>
                    {tag.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Region / Cuisine Filter Bar (Exact POS Terminal Style) */}
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
                    <Text
                      style={[
                        styles.posRegionChipText,
                        activeRegion === 'ALL' && styles.posRegionChipTextActive,
                      ]}
                    >
                      All Cuisines
                    </Text>
                    <View
                      style={[
                        styles.posRegionChipBadge,
                        activeRegion === 'ALL' && styles.posRegionChipBadgeActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.posRegionChipBadgeText,
                          activeRegion === 'ALL' && styles.posRegionChipBadgeTextActive,
                        ]}
                      >
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
                        <Text
                          style={[
                            styles.posRegionChipText,
                            isSelected && styles.posRegionChipTextActive,
                          ]}
                        >
                          {r}
                        </Text>
                        {count > 0 && (
                          <View
                            style={[
                              styles.posRegionChipBadge,
                              isSelected && styles.posRegionChipBadgeActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.posRegionChipBadgeText,
                                isSelected && styles.posRegionChipBadgeTextActive,
                              ]}
                            >
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

            {/* Category Horizontal Slider (with item count badges & icons) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mobileCategoryScroll}
            >
              {categoryTabs.map(cat => {
                const isActive = activeCat.toLowerCase() === cat.toLowerCase();
                const count = categoryCounts[cat] || (cat === 'All' ? categoryCounts['All'] || menuItems.length : 0);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, isActive && styles.catChipActive]}
                    onPress={() => setActiveCat(cat)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.catChipEmoji}>{getCategoryEmoji(cat)}</Text>
                    <Text style={[styles.catChipText, isActive && styles.catChipTextActive]}>
                      {cat}
                    </Text>
                    <View style={[styles.catCountBadge, isActive && styles.catCountBadgeActive]}>
                      <Text style={[styles.catCountBadgeText, isActive && styles.catCountBadgeTextActive]}>
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ========================================================
              4. MAIN CONTENT: DESKTOP SPLIT LAYOUT OR MOBILE FEED
             ======================================================== */}
          <View style={styles.contentLayoutContainer}>
            {/* Desktop Left Categories & Cuisines Sidebar */}
            {isDesktop && (
              <View style={styles.desktopSidebar}>
                <View style={styles.sidebarHeader}>
                  <Text style={styles.sidebarTitle}>Menu Categories</Text>
                  <Text style={styles.sidebarSubtitle}>Select a section</Text>
                </View>

                {categoryTabs.map(cat => {
                  const isActive = activeCat.toLowerCase() === cat.toLowerCase();
                  const count = categoryCounts[cat] || (cat === 'All' ? categoryCounts['All'] || menuItems.length : 0);

                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.sidebarCatItem, isActive && styles.sidebarCatItemActive]}
                      onPress={() => setActiveCat(cat)}
                    >
                      <Text style={styles.sidebarCatEmoji}>{getCategoryEmoji(cat)}</Text>
                      <Text style={[styles.sidebarCatName, isActive && styles.sidebarCatNameActive]}>
                        {cat}
                      </Text>
                      <View style={[styles.sidebarCountBadge, isActive && styles.sidebarCountBadgeActive]}>
                        <Text style={[styles.sidebarCountText, isActive && styles.sidebarCountTextActive]}>
                          {count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Cuisines & Regions in Sidebar */}
                {regions.length > 0 && (
                  <>
                    <View style={[styles.sidebarHeader, { marginTop: 18 }]}>
                      <Text style={styles.sidebarTitle}>Regional Cuisines</Text>
                      <Text style={styles.sidebarSubtitle}>Filter by culinary region</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.sidebarCatItem, activeRegion === 'ALL' && styles.sidebarCatItemActive]}
                      onPress={() => setActiveRegion('ALL')}
                    >
                      <Ionicons
                        name="globe-outline"
                        size={15}
                        color={activeRegion === 'ALL' ? '#D5A943' : '#888'}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.sidebarCatName, activeRegion === 'ALL' && styles.sidebarCatNameActive]}>
                        All Cuisines
                      </Text>
                      <View style={[styles.sidebarCountBadge, activeRegion === 'ALL' && styles.sidebarCountBadgeActive]}>
                        <Text style={[styles.sidebarCountText, activeRegion === 'ALL' && styles.sidebarCountTextActive]}>
                          {regionCounts['ALL'] || 0}
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
                          style={[styles.sidebarCatItem, isSelected && styles.sidebarCatItemActive]}
                          onPress={() => setActiveRegion(isSelected ? 'ALL' : r)}
                        >
                          <Text style={styles.sidebarCatEmoji}>{meta.emoji}</Text>
                          <Text style={[styles.sidebarCatName, isSelected && styles.sidebarCatNameActive]}>
                            {r}
                          </Text>
                          <View style={[styles.sidebarCountBadge, isSelected && styles.sidebarCountBadgeActive]}>
                            <Text style={[styles.sidebarCountText, isSelected && styles.sidebarCountTextActive]}>
                              {count}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </View>
            )}

            {/* Center Dishes Grid */}
            <View style={styles.dishesFeedContainer}>
              <View style={styles.dishesHeaderRow}>
                <View>
                  <Text style={styles.categoryHeading}>
                    {activeCat} {activeCat === 'All' ? 'Menu' : ''} {activeRegion !== 'ALL' ? `• ${activeRegion}` : ''}
                  </Text>
                  <Text style={styles.categorySubheading}>
                    {filteredItems.length} authentic dishes prepared to perfection
                  </Text>
                </View>
                {(activeCat !== 'All' || activeRegion !== 'ALL' || searchQuery || dietaryFilter !== 'all') && (
                  <TouchableOpacity
                    style={styles.activeFilterResetBtn}
                    onPress={() => {
                      setActiveCat('All');
                      setActiveRegion('ALL');
                      setSearchQuery('');
                      setDietaryFilter('all');
                    }}
                  >
                    <Ionicons name="refresh" size={12} color="#895B1E" style={{ marginRight: 4 }} />
                    <Text style={styles.activeFilterResetText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>

              {filteredItems.length === 0 ? (
                <View style={styles.emptyStateBox}>
                  <Ionicons name="search-outline" size={48} color="#D5A943" />
                  <Text style={styles.emptyStateTitle}>No dishes found</Text>
                  <Text style={styles.emptyStateDesc}>
                    Try searching for another keyword or select a different category / cuisine.
                  </Text>
                  <TouchableOpacity
                    style={styles.clearSearchBtn}
                    onPress={() => {
                      setSearchQuery('');
                      setActiveCat('All');
                      setActiveRegion('ALL');
                      setDietaryFilter('all');
                    }}
                  >
                    <Text style={styles.clearSearchBtnText}>Reset All Filters</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.dishesGrid}>
                  {filteredItems.map(renderItemCard)}
                </View>
              )}
            </View>

            {/* Desktop Right Side Sticky Cart Panel */}
            {isDesktop && (
              <View style={styles.desktopCartPanel}>
                <View style={styles.cartPanelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="cart" size={20} color="#D5A943" />
                    <Text style={styles.cartPanelTitle}>Royal Order Tray</Text>
                  </View>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.cartItemCountTag}>
                      <Text style={styles.cartItemCountTagText}>{totalCartCount} items</Text>
                    </View>
                    {cart.length > 0 && (
                      <TouchableOpacity
                        style={styles.clearCartIconBtn}
                        onPress={handleClearCart}
                        accessibilityLabel="Clear Tray"
                      >
                        <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {cart.length === 0 ? (
                  <View style={styles.emptyTrayBox}>
                    <Ionicons name="restaurant-outline" size={42} color="#D5A943" />
                    <Text style={styles.emptyTrayTitle}>Your tray is empty</Text>
                    <Text style={styles.emptyTrayDesc}>
                      Click "+ ADD" on any dish to build your dining order.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cartPanelBody}>
                    <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                      {cart.map(c => (
                        <View key={c.cartId} style={styles.trayItemRow}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={styles.trayItemName} numberOfLines={1}>
                              {c.item.name}
                            </Text>
                            {c.portionLabel ? (
                              <Text style={styles.trayItemSub}>{c.portionLabel}</Text>
                            ) : null}
                            <Text style={styles.trayItemPrice}>
                              Rs. {(c.unitPrice * c.qty).toLocaleString()}
                            </Text>
                          </View>

                          <View style={styles.trayStepper}>
                            <TouchableOpacity
                              style={styles.trayStepperBtn}
                              onPress={() => updateCartQty(c.cartId, -1)}
                            >
                              <Ionicons name="remove" size={12} color="#3A0F12" />
                            </TouchableOpacity>
                            <Text style={styles.trayStepperQty}>{c.qty}</Text>
                            <TouchableOpacity
                              style={styles.trayStepperBtn}
                              onPress={() => updateCartQty(c.cartId, 1)}
                            >
                              <Ionicons name="add" size={12} color="#3A0F12" />
                            </TouchableOpacity>
                          </View>

                          {/* 1-Click Delete item from cart */}
                          <TouchableOpacity
                            style={styles.trayItemRemoveBtn}
                            onPress={() => handleRemoveCartItem(c.cartId)}
                          >
                            <Ionicons name="close" size={14} color="#888" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>

                    {/* Bill Summary */}
                    <View style={styles.traySummaryCard}>
                      <View style={styles.traySummaryRow}>
                        <Text style={styles.summaryLabel}>Subtotal</Text>
                        <Text style={styles.summaryVal}>Rs. {subtotal.toLocaleString()}</Text>
                      </View>
                      {deliveryFee > 0 && (
                        <View style={styles.traySummaryRow}>
                          <Text style={styles.summaryLabel}>Delivery</Text>
                          <Text style={styles.summaryVal}>Rs. {deliveryFee}</Text>
                        </View>
                      )}
                      <View style={styles.traySummaryRow}>
                        <Text style={styles.summaryLabel}>GST (5%)</Text>
                        <Text style={styles.summaryVal}>Rs. {tax.toLocaleString()}</Text>
                      </View>
                      <View style={styles.trayDivider} />
                      <View style={styles.traySummaryRow}>
                        <Text style={styles.grandLabel}>Grand Total</Text>
                        <Text style={styles.grandVal}>Rs. {grandTotal.toLocaleString()}</Text>
                      </View>
                    </View>

                    {/* Checkout Button */}
                    <TouchableOpacity
                      style={styles.trayCheckoutBtn}
                      onPress={() => setCartModalVisible(true)}
                    >
                      <Text style={styles.trayCheckoutBtnText}>Proceed to Checkout</Text>
                      <Ionicons name="arrow-forward" size={16} color="#3A0F12" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ========================================================
            5. MOBILE FLOATING CART BAR (Mobile & Tablet)
           ======================================================== */}
        {!isDesktop && cart.length > 0 && (
          <View style={styles.floatingCartMobileWrapper}>
            <TouchableOpacity
              style={styles.floatingCartMobileBar}
              onPress={() => setCartModalVisible(true)}
              activeOpacity={0.9}
            >
              <View style={styles.floatingCartLeft}>
                <View style={styles.floatingCountCircle}>
                  <Text style={styles.floatingCountCircleText}>{totalCartCount}</Text>
                </View>
                <View>
                  <Text style={styles.floatingCartTitle}>
                    {totalCartCount} {totalCartCount === 1 ? 'Dish' : 'Dishes'} in Tray
                  </Text>
                  <Text style={styles.floatingCartSubtitle}>
                    {orderMode === 'dine_in'
                      ? `Table: ${selectedTable?.name || 'Selected'}`
                      : 'Express Delivery'}
                  </Text>
                </View>
              </View>

              <View style={styles.floatingCartRight}>
                <Text style={styles.floatingCartTotal}>Rs. {grandTotal.toLocaleString()}</Text>
                <View style={styles.floatingCartActionPill}>
                  <Text style={styles.floatingCartActionPillText}>View Tray</Text>
                  <Ionicons name="arrow-forward" size={14} color="#3A0F12" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ========================================================
          MODAL 1: DISH CUSTOMIZER / PORTION SIZING (CENTERED)
         ======================================================== */}
      <Modal visible={!!customizerItem} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.customizerModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>{customizerItem?.name}</Text>
                {customizerItem?.urduName ? (
                  <Text style={styles.customizerModalUrduTitle}>{customizerItem.urduName}</Text>
                ) : null}
                <Text style={styles.customizerModalCat}>
                  {customizerItem?.category} • Authentic Royal Preparation
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCustomizerItem(null)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {/* Variants / Sizing */}
              {customizerItem?.variants && customizerItem.variants.length > 0 ? (
                <View style={styles.customizerSection}>
                  <Text style={styles.sectionLabel}>Select Serving Size / Portion:</Text>
                  <View style={styles.optionsWrap}>
                    {customizerItem.variants.map(v => (
                      <TouchableOpacity
                        key={v.name}
                        style={[styles.optionPill, selectedVariant === v.name && styles.optionPillActive]}
                        onPress={() => setSelectedVariant(v.name)}
                      >
                        <Text style={[styles.optionPillText, selectedVariant === v.name && styles.optionPillTextActive]}>
                          {v.name}
                        </Text>
                        <Text style={[styles.optionPillPrice, selectedVariant === v.name && styles.optionPillPriceActive]}>
                          Rs. {v.price.toLocaleString()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (customizerItem?.name.toLowerCase().includes('karahi') || customizerItem?.name.toLowerCase().includes('handi')) ? (
                <View style={styles.customizerSection}>
                  <Text style={styles.sectionLabel}>Select Weight / Portion:</Text>
                  <View style={styles.optionsWrap}>
                    {[
                      { kg: 0.25, label: 'Quarter (0.25 kg)' },
                      { kg: 0.5, label: 'Half (0.5 kg)' },
                      { kg: 1.0, label: 'Full (1.0 kg)' },
                      { kg: 2.0, label: 'Royal Family (2.0 kg)' },
                    ].map(w => (
                      <TouchableOpacity
                        key={w.kg}
                        style={[styles.optionPill, weightKg === w.kg && styles.optionPillActive]}
                        onPress={() => setWeightKg(w.kg)}
                      >
                        <Text style={[styles.optionPillText, weightKg === w.kg && styles.optionPillTextActive]}>
                          {w.label}
                        </Text>
                        <Text style={[styles.optionPillPrice, weightKg === w.kg && styles.optionPillPriceActive]}>
                          Rs. {Math.round((customizerItem?.price || 0) * w.kg).toLocaleString()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Spice Level Preference */}
              <View style={styles.customizerSection}>
                <Text style={styles.sectionLabel}>Spice Level Preference:</Text>
                <View style={styles.optionsWrap}>
                  {(['Mild', 'Medium', 'Spicy', 'Extra Hot'] as const).map(sp => (
                    <TouchableOpacity
                      key={sp}
                      style={[styles.spicePill, spiceLevel === sp && styles.spicePillActive]}
                      onPress={() => setSpiceLevel(sp)}
                    >
                      <Text style={[styles.spicePillText, spiceLevel === sp && styles.spicePillTextActive]}>
                        {sp === 'Mild' ? '🍃 Mild' : sp === 'Medium' ? '🌶️ Medium' : sp === 'Spicy' ? '🔥 Spicy' : '💥 Extra Hot'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Special Cooking Notes */}
              <View style={styles.customizerSection}>
                <Text style={styles.sectionLabel}>Special Cooking Instructions:</Text>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="e.g., less oil, crispier naan, extra salad & raita..."
                  placeholderTextColor="#999"
                  value={customizerNotes}
                  onChangeText={setCustomizerNotes}
                />
              </View>

              {/* Quantity Stepper */}
              <View style={styles.customizerSection}>
                <Text style={styles.sectionLabel}>Quantity:</Text>
                <View style={styles.qtyControlRow}>
                  <TouchableOpacity
                    style={styles.qtyControlBtn}
                    onPress={() => setCustomizerQty(Math.max(1, customizerQty - 1))}
                  >
                    <Ionicons name="remove" size={18} color="#3A0F12" />
                  </TouchableOpacity>
                  <Text style={styles.qtyControlVal}>{customizerQty}</Text>
                  <TouchableOpacity
                    style={styles.qtyControlBtn}
                    onPress={() => setCustomizerQty(customizerQty + 1)}
                  >
                    <Ionicons name="add" size={18} color="#3A0F12" />
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalAddCartBtn}
              onPress={handleAddFromCustomizer}
              activeOpacity={0.88}
            >
              <Ionicons name="cart" size={20} color="#3A0F12" style={{ marginRight: 8 }} />
              <Text style={styles.modalAddCartBtnText}>Add to Tray</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 2: CHECKOUT & ORDER REVIEW DRAWER (CENTERED)
         ======================================================== */}
      <Modal visible={cartModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.customizerModalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>Review & Confirm Order</Text>
                <Text style={styles.customizerModalCat}>
                  {orderMode === 'dine_in'
                    ? `Dine-In • Table: ${selectedTable?.name || 'Selected'}`
                    : 'Home Express Delivery'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCartModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Order Items List */}
              <View style={styles.checkoutSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.checkoutSectionHeader}>Ordered Dishes ({cart.length})</Text>
                  {cart.length > 0 && (
                    <TouchableOpacity onPress={handleClearCart}>
                      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>Clear All</Text>
                    </TouchableOpacity>
                  )}
                </View>
                
                {cart.map(c => (
                  <View key={c.cartId} style={styles.checkoutItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkoutItemName}>{c.item.name}</Text>
                      {c.portionLabel ? (
                        <Text style={styles.checkoutItemSub}>{c.portionLabel}</Text>
                      ) : null}
                      {c.notes ? (
                        <Text style={styles.checkoutItemNote}>Note: {c.notes}</Text>
                      ) : null}
                      <Text style={styles.checkoutItemPrice}>
                        Rs. {(c.unitPrice * c.qty).toLocaleString()}
                      </Text>
                    </View>

                    <View style={styles.checkoutStepper}>
                      <TouchableOpacity
                        style={styles.checkoutStepperBtn}
                        onPress={() => updateCartQty(c.cartId, -1)}
                      >
                        <Ionicons name="remove" size={14} color="#3A0F12" />
                      </TouchableOpacity>
                      <Text style={styles.checkoutStepperQty}>{c.qty}</Text>
                      <TouchableOpacity
                        style={styles.checkoutStepperBtn}
                        onPress={() => updateCartQty(c.cartId, 1)}
                      >
                        <Ionicons name="add" size={14} color="#3A0F12" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={{ padding: 4, marginLeft: 6 }}
                      onPress={() => handleRemoveCartItem(c.cartId)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Customer Contact Details */}
              <View style={styles.checkoutSection}>
                <Text style={styles.checkoutSectionHeader}>Your Contact Details</Text>
                <View style={styles.inputField}>
                  <Text style={styles.inputFieldLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.textInputBox}
                    placeholder="Enter your name"
                    placeholderTextColor="#999"
                    value={customerName}
                    onChangeText={setCustomerName}
                  />
                </View>

                <View style={styles.inputField}>
                  <Text style={styles.inputFieldLabel}>Mobile Number *</Text>
                  <TextInput
                    style={styles.textInputBox}
                    placeholder="e.g. 0300 1234567"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                  />
                </View>

                {orderMode === 'delivery' && (
                  <View style={styles.inputField}>
                    <Text style={styles.inputFieldLabel}>Delivery Address *</Text>
                    <TextInput
                      style={[styles.textInputBox, { height: 60, textAlignVertical: 'top' }]}
                      placeholder="House/Office #, Street, Block, City"
                      placeholderTextColor="#999"
                      multiline
                      value={deliveryAddress}
                      onChangeText={setDeliveryAddress}
                    />
                  </View>
                )}
              </View>

              {/* Payment Method */}
              <View style={styles.checkoutSection}>
                <Text style={styles.checkoutSectionHeader}>Payment Method</Text>
                <View style={styles.optionsWrap}>
                  {[
                    { id: 'cash_on_delivery', label: orderMode === 'dine_in' ? '💵 Cash at Table' : '💵 Cash on Delivery' },
                    { id: 'card', label: '💳 Credit / Debit Card' },
                    { id: 'jazzcash', label: '📱 JazzCash' },
                    { id: 'easypaisa', label: '📲 EasyPaisa' },
                  ].map(pm => (
                    <TouchableOpacity
                      key={pm.id}
                      style={[styles.paymentPill, paymentMethod === pm.id && styles.paymentPillActive]}
                      onPress={() => setPaymentMethod(pm.id as any)}
                    >
                      <Text style={[styles.paymentPillText, paymentMethod === pm.id && styles.paymentPillTextActive]}>
                        {pm.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Bill Breakdown */}
              <View style={styles.billBreakdownCard}>
                <View style={styles.billRow}>
                  <Text style={styles.billRowLabel}>Subtotal</Text>
                  <Text style={styles.billRowVal}>Rs. {subtotal.toLocaleString()}</Text>
                </View>
                {deliveryFee > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billRowLabel}>Delivery Fee</Text>
                    <Text style={styles.billRowVal}>Rs. {deliveryFee}</Text>
                  </View>
                )}
                <View style={styles.billRow}>
                  <Text style={styles.billRowLabel}>Government Tax (GST 5%)</Text>
                  <Text style={styles.billRowVal}>Rs. {tax.toLocaleString()}</Text>
                </View>
                <View style={styles.billDivider} />
                <View style={styles.billRow}>
                  <Text style={styles.billGrandLabel}>Total Payable</Text>
                  <Text style={styles.billGrandVal}>Rs. {grandTotal.toLocaleString()}</Text>
                </View>
              </View>
            </ScrollView>

            {/* Place Order CTA */}
            <TouchableOpacity
              style={styles.confirmOrderCTA}
              onPress={handlePlaceOrder}
              disabled={submittingOrder}
              activeOpacity={0.88}
            >
              {submittingOrder ? (
                <ActivityIndicator size="small" color="#3A0F12" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#3A0F12" style={{ marginRight: 8 }} />
                  <Text style={styles.confirmOrderCTAText}>
                    Confirm & Send Order (Rs. {grandTotal.toLocaleString()})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 3: 5-FLOOR TABLE SELECTOR (CENTERED)
         ======================================================== */}
      <Modal visible={tableModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.customizerModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>Select Your Table</Text>
                <Text style={styles.customizerModalCat}>Sultan 5-Floor Restaurant Blueprint</Text>
              </View>
              <TouchableOpacity onPress={() => setTableModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Floor Filter Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 45, marginBottom: 14 }}>
              {floorsList.map(fl => (
                <TouchableOpacity
                  key={fl}
                  style={[styles.floorChip, activeFloorFilter === fl && styles.floorChipActive]}
                  onPress={() => setActiveFloorFilter(fl)}
                >
                  <Text style={[styles.floorChipText, activeFloorFilter === fl && styles.floorChipTextActive]}>
                    {fl}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tables Grid */}
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={styles.tablesPickerGrid}>
                {filteredTablesByFloor.map(tbl => (
                  <TouchableOpacity
                    key={tbl.id}
                    style={[
                      styles.tableSelectTile,
                      selectedTable?.id === tbl.id && styles.tableSelectTileActive,
                    ]}
                    onPress={() => {
                      setSelectedTable({
                        id: tbl.id,
                        name: tbl.name,
                        floor: tbl.floor || activeFloorFilter,
                      });
                      setTableModalVisible(false);
                    }}
                  >
                    <Ionicons
                      name="restaurant-outline"
                      size={20}
                      color={selectedTable?.id === tbl.id ? '#D5A943' : '#666'}
                    />
                    <Text
                      style={[
                        styles.tableSelectTileName,
                        selectedTable?.id === tbl.id && styles.tableSelectTileNameActive,
                      ]}
                    >
                      {tbl.name}
                    </Text>
                    <Text style={styles.tableSelectTileSeats}>{tbl.seats} Seats</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 4: LIVE ORDER TRACKING MODAL (CENTERED)
         ======================================================== */}
      <Modal visible={trackingModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.customizerModalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>⚡ Sultan Live Order Tracker</Text>
                <Text style={styles.customizerModalCat}>Order #{activeTrackingOrder?.orderNumber}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {/* Mute button inside modal */}
                <TouchableOpacity
                  style={styles.modalSoundBtn}
                  onPress={() => setSoundMuted(!soundMuted)}
                >
                  <Ionicons
                    name={soundMuted ? 'volume-mute' : 'volume-high'}
                    size={15}
                    color={soundMuted ? '#EF4444' : '#D5A943'}
                  />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setTrackingModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#888" />
                </TouchableOpacity>
              </View>
            </View>

            {activeTrackingOrder ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {(() => {
                  const stage = getProgressStage(activeTrackingOrder.status);
                  const isCancelled = activeTrackingOrder.status === 'CANCELLED';

                  return (
                    <View style={styles.trackerCardBox}>
                      <View style={styles.trackerStageTop}>
                        <View>
                          <Text style={[styles.trackerMainLabel, isCancelled && { color: '#D32F2F' }]}>
                            {stage.label}
                          </Text>
                          <Text style={styles.trackerDescLabel}>{stage.desc}</Text>
                        </View>
                        {!isCancelled && (
                          <View style={styles.trackerTimerBadge}>
                            <Ionicons name="time" size={14} color="#D5A943" style={{ marginRight: 4 }} />
                            <Text style={styles.trackerTimerText}>
                              ~{activeTrackingOrder.estimatedDeliveryMinutes || 25} Mins
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* 5-Step Progress */}
                      {!isCancelled && (
                        <View style={styles.trackerProgressArea}>
                          <View style={styles.trackerProgressLineBg}>
                            <View style={[styles.trackerProgressLineFill, { width: stage.percent as any }]} />
                          </View>

                          <View style={styles.trackerStepsRow}>
                            {[
                              { step: 1, label: 'Received' },
                              { step: 2, label: 'Confirmed' },
                              { step: 3, label: 'Cooking' },
                              { step: 4, label: 'Ready' },
                              { step: 5, label: 'Served' },
                            ].map(s => {
                              const isPassed = stage.step >= s.step;
                              const isCurrent = stage.step === s.step;
                              return (
                                <View key={s.step} style={styles.trackerStepNode}>
                                  <View
                                    style={[
                                      styles.trackerNodeDot,
                                      isPassed && styles.trackerNodeDotPassed,
                                      isCurrent && styles.trackerNodeDotCurrent,
                                    ]}
                                  >
                                    {isPassed && !isCurrent ? (
                                      <Ionicons name="checkmark" size={12} color="#FFF" />
                                    ) : (
                                      <Text style={[styles.trackerNodeNum, (isPassed || isCurrent) && styles.trackerNodeNumActive]}>
                                        {s.step}
                                      </Text>
                                    )}
                                  </View>
                                  <Text style={styles.trackerNodeLabel}>{s.label}</Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Items in this Order */}
                <View style={styles.trackerDishesCard}>
                  <Text style={styles.sectionLabel}>Ordered Dishes:</Text>
                  {activeTrackingOrder.items.map((it, idx) => (
                    <View key={idx} style={styles.trackerDishItem}>
                      <Text style={styles.trackerDishQty}>{it.qty}x</Text>
                      <Text style={styles.trackerDishName}>{it.name}</Text>
                      <Text style={styles.trackerDishPrice}>
                        Rs. {(it.price * it.qty).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.billDivider} />
                  <View style={styles.billRow}>
                    <Text style={styles.billGrandLabel}>Total Amount</Text>
                    <Text style={styles.billGrandVal}>Rs. {activeTrackingOrder.total.toLocaleString()}</Text>
                  </View>
                </View>
              </ScrollView>
            ) : null}

            <TouchableOpacity
              style={styles.trackerCloseBtn}
              onPress={() => setTrackingModalVisible(false)}
            >
              <Text style={styles.trackerCloseBtnText}>Close Tracker</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 5: CUSTOMER ORDER HISTORY (CENTERED & DISMISSABLE)
         ======================================================== */}
      <Modal visible={historyModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.customizerModalCard, { maxHeight: '86%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>📋 My Order History</Text>
                <Text style={styles.customizerModalCat}>
                  {orderHistory.length} {orderHistory.length === 1 ? 'order' : 'orders'} placed
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {orderHistory.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearHistoryPill}
                    onPress={handleClearCompletedOrders}
                  >
                    <Ionicons name="checkmark-done" size={13} color="#2E7D32" />
                    <Text style={styles.clearHistoryPillText}>Clear Completed</Text>
                  </TouchableOpacity>
                )}

                {orderHistory.length > 0 && (
                  <TouchableOpacity
                    style={[styles.clearHistoryPill, { borderColor: '#EF4444' }]}
                    onPress={handleClearAllHistory}
                  >
                    <Ionicons name="trash-outline" size={13} color="#DC2626" />
                    <Text style={[styles.clearHistoryPillText, { color: '#DC2626' }]}>Clear All</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#888" />
                </TouchableOpacity>
              </View>
            </View>

            {orderHistory.length === 0 ? (
              <View style={styles.emptyHistoryBox}>
                <Ionicons name="receipt-outline" size={44} color="#D5A943" />
                <Text style={styles.emptyHistoryTitle}>No orders in history</Text>
                <Text style={styles.emptyHistoryDesc}>All past orders have been cleared.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {orderHistory.map(ord => (
                  <View key={ord.id} style={styles.historyCardBox}>
                    <View style={styles.historyCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyOrderNumber}>Order #{ord.orderNumber}</Text>
                        <Text style={styles.historyOrderDate}>
                          {new Date(ord.createdAt).toLocaleDateString()} • {new Date(ord.createdAt).toLocaleTimeString()}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={styles.historyBadge}>
                          <Text style={styles.historyBadgeText}>{ord.status.replace(/_/g, ' ')}</Text>
                        </View>

                        {/* Delete Single Order Button */}
                        <TouchableOpacity
                          style={styles.deleteOrderBtn}
                          onPress={() => handleDeleteOrder(ord.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Delete Order"
                        >
                          <Ionicons name="trash-outline" size={15} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={styles.historySummaryText} numberOfLines={2}>
                      {ord.items.map(i => `${i.qty}x ${i.name}`).join(' • ')}
                    </Text>

                    <View style={styles.historyCardBottom}>
                      <Text style={styles.historyTotalAmount}>Rs. {ord.total.toLocaleString()}</Text>
                      <TouchableOpacity
                        style={styles.trackOrderBtn}
                        onPress={() => {
                          setActiveTrackingOrder(ord);
                          setHistoryModalVisible(false);
                          setTrackingModalVisible(true);
                        }}
                      >
                        <Text style={styles.trackOrderBtnText}>Track Order ➔</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ========================================================
// ROYAL SULTAN MASTER STYLESHEET (CENTERED POPUPS)
// ========================================================
const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#24050A',
  },
  screenWrapper: {
    flex: 1,
    backgroundColor: '#F8F6F2',
  },
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
  },

  // 1. Hero Cover Banner with Islamic Pattern
  heroBanner: {
    backgroundColor: '#1C0408',
    borderBottomWidth: 2,
    borderBottomColor: '#D5A943',
    paddingTop: 14,
    paddingBottom: 28,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  heroOverlayContent: {
    maxWidth: 1300,
    alignSelf: 'center',
    width: '100%',
  },
  heroTopActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSoundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 4, 8, 0.75)',
    borderWidth: 1.2,
    borderColor: '#D5A94380',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 22,
    gap: 6,
  },
  heroSoundPillText: {
    color: '#D5A943',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroOrdersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(213, 169, 67, 0.22)',
    borderWidth: 1.2,
    borderColor: '#D5A943',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 22,
    gap: 7,
  },
  heroOrdersPillText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '800',
  },
  heroBrandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 20,
    paddingVertical: 8,
    width: '100%',
    maxWidth: 960,
  },
  heroBrandingRowMobile: {
    gap: 12,
    paddingVertical: 4,
    justifyContent: 'flex-start',
  },
  heroLogoCol: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroDetailsCol: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  crestHaloOuter: {
    padding: 5,
    borderRadius: 66,
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.65)',
    backgroundColor: 'rgba(213, 169, 67, 0.08)',
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  crestHaloOuterMobile: {
    padding: 3,
    borderRadius: 44,
    borderWidth: 1.2,
    shadowRadius: 8,
    elevation: 4,
  },
  crestHalo: {
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: 'rgba(32, 6, 11, 0.85)',
    borderWidth: 2.5,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestHaloMobile: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.8,
  },
  heroUrduCrownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 1,
  },
  heroUrduStar: {
    color: '#D5A943',
    fontSize: 11,
    opacity: 0.9,
  },
  heroSubtitleUrdu: {
    fontSize: 15,
    color: '#F5E8C7',
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'left',
  },
  heroMainTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'left',
    textShadowColor: 'rgba(213, 169, 67, 0.6)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 10,
  },
  heroMainTitleMobile: {
    fontSize: 17.5,
    letterSpacing: 1.2,
  },
  heroSubDesc: {
    fontSize: 12,
    color: '#D5A943',
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'left',
    letterSpacing: 0.2,
  },
  heroSubDescMobile: {
    fontSize: 10.5,
    marginTop: 1,
  },
  heroHighlightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 10,
    gap: 7,
  },
  heroHighlightsRowMobile: {
    marginTop: 6,
    gap: 4.5,
  },
  highlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(18, 4, 7, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 16,
  },
  highlightBadgeMobile: {
    gap: 3.5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  highlightText: {
    fontSize: 11,
    color: '#F3F4F6',
    fontWeight: '600',
  },
  highlightTextMobile: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  highlightDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(213, 169, 67, 0.35)',
  },

  // 2. Mode Selector (Dine-in / Delivery)
  modeControlContainer: {
    maxWidth: 1300,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 16,
    marginTop: -16,
  },
  modeToggleBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1.5,
    borderColor: '#E8DFCE',
    elevation: 3,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeToggleBtnActive: {
    backgroundColor: '#3A0F12',
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  modeToggleTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  tableBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DFCE',
    elevation: 1,
  },
  tableIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3A0F12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tableTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  tableSubText: {
    fontSize: 11,
    color: '#777',
    marginTop: 1,
  },
  changeTableBtn: {
    backgroundColor: '#FAF5EA',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  changeTableBtnText: {
    fontSize: 11,
    color: '#895B1E',
    fontWeight: '800',
  },

  // 3. Search & Dietary Bar
  filterSectionContainer: {
    maxWidth: 1300,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E8DFCE',
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1C1C1E',
  },
  dietaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  dietaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2DBD0',
  },
  dietaryChipActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  dietaryChipText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  dietaryChipTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  posRegionFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    marginTop: 8,
    gap: 8,
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
    gap: 5,
    flexShrink: 0,
  },
  posRegionLeadIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3A0F12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posRegionFilterLeadText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3A0F12',
    letterSpacing: 0.6,
  },
  posRegionScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
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
    backgroundColor: '#3A0F12',
    borderColor: '#D4AF37',
    borderWidth: 1.5,
    ...Platform.select({
      web: {
        boxShadow: '0 3px 12px rgba(58, 15, 18, 0.28), 0 0 0 1px rgba(212, 175, 55, 0.4)',
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
    backgroundColor: 'rgba(58, 15, 18, 0.08)',
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
    color: '#3A0F12',
    fontWeight: '900',
  },
  mobileCategoryScroll: {
    paddingVertical: 10,
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 22,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2DBD0',
    gap: 6,
  },
  catChipActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  catChipEmoji: {
    fontSize: 14,
  },
  catChipText: {
    fontSize: 12.5,
    color: '#555',
    fontWeight: '700',
  },
  catChipTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  catCountBadge: {
    backgroundColor: 'rgba(58, 15, 18, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginLeft: 3,
  },
  catCountBadgeActive: {
    backgroundColor: 'rgba(213, 169, 67, 0.25)',
  },
  catCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#777',
  },
  catCountBadgeTextActive: {
    color: '#D5A943',
    fontWeight: '900',
  },
  activeFilterResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5ED',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  activeFilterResetText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#895B1E',
  },

  // 4. Split Content Layout
  contentLayoutContainer: {
    maxWidth: 1300,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 18,
  },

  // Desktop Left Sidebar
  desktopSidebar: {
    width: 240,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ECE4D8',
    alignSelf: 'flex-start',
    elevation: 1,
  },
  sidebarHeader: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE4',
  },
  sidebarTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#24050A',
  },
  sidebarSubtitle: {
    fontSize: 11,
    color: '#888',
  },
  sidebarCatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  sidebarCatItemActive: {
    backgroundColor: '#3A0F12',
  },
  sidebarCatEmoji: {
    fontSize: 15,
    marginRight: 8,
  },
  sidebarCatName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
  },
  sidebarCatNameActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  sidebarCountBadge: {
    backgroundColor: '#F3EFEA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sidebarCountBadgeActive: {
    backgroundColor: 'rgba(213, 169, 67, 0.25)',
  },
  sidebarCountText: {
    fontSize: 10,
    color: '#777',
    fontWeight: '800',
  },
  sidebarCountTextActive: {
    color: '#D5A943',
  },

  // Center Feed
  dishesFeedContainer: {
    flex: 1,
  },
  dishesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  categoryHeading: {
    fontSize: 20,
    fontWeight: '900',
    color: '#24050A',
  },
  categorySubheading: {
    fontSize: 11.5,
    color: '#777',
    marginTop: 2,
  },
  dishesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  // POS Terminal Styled Dish Card
  dishCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 188,
    borderWidth: 1.5,
    borderColor: 'rgba(235, 225, 215, 0.9)',
    position: 'relative',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      } as any,
    }),
  },
  dishCardInCart: {
    borderColor: 'rgba(58, 15, 18, 0.65)',
    backgroundColor: 'rgba(255, 248, 248, 0.96)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 10px 26px rgba(58, 15, 18, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        transform: 'translateY(-2px)',
      } as any,
    }),
  },
  inCartBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    backgroundColor: '#3A0F12',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(58, 15, 18, 0.35)',
      } as any,
    }),
  },
  inCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  dishCardImageWrapper: {
    width: '100%',
    height: 102,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 6,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
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
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      } as any,
    }),
  },
  dishCardCategory: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  dishCardRegionChip: {
    backgroundColor: 'rgba(58, 15, 18, 0.88)',
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
  dishCardBadgeTag: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(58, 15, 18, 0.92)',
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
    fontSize: 10.5,
    letterSpacing: 1,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dishTitleWrapper: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 4,
    minHeight: 34,
    justifyContent: 'center',
  },
  dishCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 17,
  },
  dishCardUrduText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#895B1E',
    marginTop: 2,
    textAlign: 'center',
  },
  dishCardVariantHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
    textAlign: 'center',
  },
  dishCardBottomSection: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  dishCardPricePill: {
    backgroundColor: 'rgba(254, 243, 199, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)',
      } as any,
    }),
  },
  dishCardPricePillActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#3A0F12',
  },
  dishCardPriceText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#92400E',
  },
  dishCardPriceTextActive: {
    color: '#FFFFFF',
  },
  cardStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A0F12',
    borderRadius: 8,
    padding: 2,
    gap: 6,
  },
  cardStepperBtnMini: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#52141C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStepperCount: {
    color: '#D5A943',
    fontSize: 11.5,
    fontWeight: '900',
    minWidth: 16,
    textAlign: 'center',
  },
  cardQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  cardQuickAddText: {
    color: '#3A0F12',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Empty State
  emptyStateBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECE4D8',
    marginTop: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 10,
  },
  emptyStateDesc: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
    textAlign: 'center',
  },
  clearSearchBtn: {
    backgroundColor: '#3A0F12',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  clearSearchBtnText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '800',
  },

  // Desktop Right Cart Panel
  desktopCartPanel: {
    width: 320,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE4D8',
    alignSelf: 'flex-start',
    elevation: 2,
  },
  cartPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE4',
  },
  cartPanelTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#24050A',
  },
  cartItemCountTag: {
    backgroundColor: '#FAF5EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D5A943',
  },
  cartItemCountTagText: {
    fontSize: 10.5,
    color: '#895B1E',
    fontWeight: '800',
  },
  clearCartIconBtn: {
    padding: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  emptyTrayBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTrayTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#333',
    marginTop: 8,
  },
  emptyTrayDesc: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 14,
  },
  cartPanelBody: {
    marginTop: 10,
  },
  trayItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F5F0',
  },
  trayItemName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  trayItemSub: {
    fontSize: 10.5,
    color: '#895B1E',
  },
  trayItemPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3A0F12',
    marginTop: 2,
  },
  trayStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5EA',
    borderRadius: 6,
    padding: 2,
  },
  trayStepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayStepperQty: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#3A0F12',
    paddingHorizontal: 6,
  },
  trayItemRemoveBtn: {
    padding: 4,
    marginLeft: 6,
  },
  traySummaryCard: {
    backgroundColor: '#FAF8F5',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#EFEAE0',
  },
  traySummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  summaryLabel: {
    fontSize: 11.5,
    color: '#666',
  },
  summaryVal: {
    fontSize: 11.5,
    color: '#333',
    fontWeight: '700',
  },
  trayDivider: {
    height: 1,
    backgroundColor: '#E5DFD4',
    marginVertical: 6,
  },
  grandLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  grandVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#3A0F12',
  },
  trayCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
    gap: 6,
  },
  trayCheckoutBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#3A0F12',
  },

  // 5. Mobile Floating Cart Bar
  floatingCartMobileWrapper: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    elevation: 6,
  },
  floatingCartMobileBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#3A0F12',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#D5A943',
  },
  floatingCartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingCountCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCountCircleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#3A0F12',
  },
  floatingCartTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  floatingCartSubtitle: {
    fontSize: 10.5,
    color: '#D5A943',
  },
  floatingCartRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingCartTotal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFF',
  },
  floatingCartActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  floatingCartActionPillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#3A0F12',
  },

  // ========================================================
  // CENTERED POPUP MODALS ENGINE
  // ========================================================
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  customizerModalCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 20,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: '#D5A94370',
    elevation: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE4',
    marginBottom: 10,
  },
  customizerModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#24050A',
  },
  customizerModalUrduTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#895B1E',
    marginTop: 1,
  },
  customizerModalCat: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  modalSoundBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FAF5EA',
    borderWidth: 1,
    borderColor: '#D5A94380',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customizerSection: {
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E4DDD0',
    minWidth: 110,
  },
  optionPillActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  optionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#444',
  },
  optionPillTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  optionPillPrice: {
    fontSize: 11,
    color: '#895B1E',
    fontWeight: '800',
    marginTop: 2,
  },
  optionPillPriceActive: {
    color: '#FFF',
  },
  spicePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E4DDD0',
  },
  spicePillActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  spicePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
  },
  spicePillTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  modalTextInput: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E4DDD0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#1C1C1E',
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qtyControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyControlVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  modalAddCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  modalAddCartBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#3A0F12',
  },

  // Checkout Modal
  checkoutSection: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0ECE4',
  },
  checkoutSectionHeader: {
    fontSize: 13,
    fontWeight: '900',
    color: '#24050A',
  },
  checkoutItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  checkoutItemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  checkoutItemSub: {
    fontSize: 11,
    color: '#895B1E',
  },
  checkoutItemNote: {
    fontSize: 10.5,
    color: '#777',
    fontStyle: 'italic',
  },
  checkoutItemPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3A0F12',
    marginTop: 2,
  },
  checkoutStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5EA',
    borderRadius: 8,
    padding: 2,
  },
  checkoutStepperBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutStepperQty: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3A0F12',
    paddingHorizontal: 8,
  },
  inputField: {
    marginBottom: 8,
  },
  inputFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    marginBottom: 4,
  },
  textInputBox: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E4DDD0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1C1C1E',
  },
  paymentPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E4DDD0',
  },
  paymentPillActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  paymentPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
  },
  paymentPillTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  billBreakdownCard: {
    backgroundColor: '#FAF8F5',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4DDD0',
    marginTop: 6,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  billRowLabel: {
    fontSize: 12,
    color: '#666',
  },
  billRowVal: {
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  billDivider: {
    height: 1,
    backgroundColor: '#E4DDD0',
    marginVertical: 6,
  },
  billGrandLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  billGrandVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3A0F12',
  },
  confirmOrderCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  confirmOrderCTAText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#3A0F12',
  },

  // Floor & Tables Picker
  floorChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3EFEA',
    marginRight: 8,
  },
  floorChipActive: {
    backgroundColor: '#3A0F12',
  },
  floorChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  floorChipTextActive: {
    color: '#D5A943',
    fontWeight: '800',
  },
  tablesPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tableSelectTile: {
    width: '31%',
    minWidth: 90,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E4DDD0',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  tableSelectTileActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  tableSelectTileName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#333',
    marginTop: 4,
  },
  tableSelectTileNameActive: {
    color: '#D5A943',
  },
  tableSelectTileSeats: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },

  // Live Tracker Modal
  trackerCardBox: {
    backgroundColor: '#FAF8F5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4DDD0',
    marginBottom: 12,
  },
  trackerStageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  trackerMainLabel: {
    fontSize: 17,
    fontWeight: '900',
    color: '#3A0F12',
  },
  trackerDescLabel: {
    fontSize: 11.5,
    color: '#666',
    marginTop: 2,
  },
  trackerTimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A0F12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trackerTimerText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '800',
  },
  trackerProgressArea: {
    marginTop: 6,
  },
  trackerProgressLineBg: {
    height: 6,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  trackerProgressLineFill: {
    height: '100%',
    backgroundColor: '#D5A943',
  },
  trackerStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trackerStepNode: {
    alignItems: 'center',
    width: 58,
  },
  trackerNodeDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  trackerNodeDotPassed: {
    backgroundColor: '#2E7D32',
  },
  trackerNodeDotCurrent: {
    backgroundColor: '#D5A943',
  },
  trackerNodeNum: {
    fontSize: 10,
    fontWeight: '800',
    color: '#777',
  },
  trackerNodeNumActive: {
    color: '#FFF',
  },
  trackerNodeLabel: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
  },
  trackerDishesCard: {
    backgroundColor: '#FAF8F5',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4DDD0',
  },
  trackerDishItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  trackerDishQty: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3A0F12',
    width: 24,
  },
  trackerDishName: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
  trackerDishPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  trackerCloseBtn: {
    backgroundColor: '#3A0F12',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  trackerCloseBtnText: {
    color: '#D5A943',
    fontSize: 13,
    fontWeight: '800',
  },

  // History Modal
  clearHistoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5EA',
    borderWidth: 1,
    borderColor: '#D5A94380',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  clearHistoryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#895B1E',
  },
  deleteOrderBtn: {
    padding: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  emptyHistoryBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHistoryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 8,
  },
  emptyHistoryDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  historyCardBox: {
    backgroundColor: '#FAF8F5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E4DDD0',
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  historyOrderNumber: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#3A0F12',
  },
  historyOrderDate: {
    fontSize: 10,
    color: '#888',
    marginTop: 1,
  },
  historyBadge: {
    backgroundColor: '#FAF5EA',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#895B1E',
  },
  historySummaryText: {
    fontSize: 11.5,
    color: '#555',
    marginVertical: 4,
  },
  historyCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 6,
    marginTop: 4,
  },
  historyTotalAmount: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  trackOrderBtn: {
    backgroundColor: '#3A0F12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  trackOrderBtnText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '800',
  },
});
