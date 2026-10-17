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
import SultanLogo from '../../components/SultanLogo';
import UniversalPortalNav from '../../components/UniversalPortalNav';
import { BRAND } from '../../constants/brand';

interface CartItem {
  cartId: string;
  item: MenuItem;
  selectedVariant?: string;
  unitPrice: number;
  qty: number;
  notes?: string;
  portionLabel?: string;
}

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
  const params = useLocalSearchParams<{ tableId?: string; floor?: string; mode?: string }>();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const menuItems = useRestaurantStore(state => state.menuItems);
  const categories = useRestaurantStore(state => state.categories);
  const tables = useRestaurantStore(state => state.tables);
  const syncFromServer = useRestaurantStore(state => state.syncFromServer);

  // Mode Selection
  const [orderMode, setOrderMode] = useState<'dine_in' | 'delivery'>('dine_in');
  const [selectedTable, setSelectedTable] = useState<{ id: string; name: string; floor: string } | null>(null);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [activeFloorFilter, setActiveFloorFilter] = useState<string>('Ground Floor');

  // Category and Search
  const [activeCat, setActiveCat] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Item Customizer
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customizerItem, setCustomizerItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [customizerQty, setCustomizerQty] = useState<number>(1);
  const [customizerNotes, setCustomizerNotes] = useState<string>('');
  const [weightKg, setWeightKg] = useState<number>(1.0);

  // Modals
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<CustomerOrderHistory | null>(null);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);

  // Customer Profile Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'card' | 'jazzcash' | 'easypaisa'>('cash_on_delivery');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Order History List
  const [orderHistory, setOrderHistory] = useState<CustomerOrderHistory[]>([]);

  // Sound Chime Trigger
  const playChime = (type: 'order_placed' | 'status_update') => {
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
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12); // A5
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
          } else {
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
            osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
          }
        }
      }
    } catch {}
  };

  // Base API URL
  const getBaseUrl = () => {
    if (Platform.OS === 'web') {
      const host = typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? 'localhost' : (window.location?.hostname || '192.168.1.11');
      return `http://${host}:5000`;
    }
    return 'http://192.168.1.11:5000';
  };

  // 1. Initial Load: Profile, Saved Orders, and QR params
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

  // 2. Handle URL Query Params (Table QR scan)
  useEffect(() => {
    if (params.tableId) {
      setOrderMode('dine_in');
      const found = tables.find(t => t.id === params.tableId);
      if (found) {
        setSelectedTable({
          id: found.id,
          name: found.name,
          floor: found.floor || params.floor || 'Ground Floor',
        });
      } else {
        setSelectedTable({
          id: params.tableId,
          name: params.tableId,
          floor: params.floor || 'Ground Floor',
        });
      }
    } else if (params.mode === 'delivery') {
      setOrderMode('delivery');
    }
  }, [params.tableId, params.floor, params.mode, tables]);

  // 3. Fallback table if none selected for Dine-In
  useEffect(() => {
    if (orderMode === 'dine_in' && !selectedTable && tables.length > 0) {
      const firstAvailable = tables.find(t => t.status === 'available') || tables[0];
      setSelectedTable({
        id: firstAvailable.id,
        name: firstAvailable.name,
        floor: firstAvailable.floor || 'Ground Floor',
      });
    }
  }, [orderMode, selectedTable, tables]);

  // 4. WebSocket & Polling for Live Order Tracking
  useEffect(() => {
    if (!activeTrackingOrder) return;

    const orderId = activeTrackingOrder.id;
    const fetchLatestStatus = async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/public/orders/${orderId}`);
        const data = await res.json();
        if (data.success && data.order) {
          const updated: CustomerOrderHistory = {
            ...activeTrackingOrder,
            ...data.order,
          };
          if (updated.status !== activeTrackingOrder.status) {
            playChime('status_update');
          }
          setActiveTrackingOrder(updated);
          setOrderHistory(prev =>
            prev.map(o => (o.id === orderId ? updated : o))
          );
          await AsyncStorage.setItem(
            STORAGE_KEY_ORDERS,
            JSON.stringify(orderHistory.map(o => (o.id === orderId ? updated : o)))
          );
        }
      } catch {}
    };

    fetchLatestStatus();
    const interval = setInterval(fetchLatestStatus, 4000);

    // WebSocket listener
    let ws: WebSocket | null = null;
    try {
      const host = typeof window !== 'undefined' && window.location?.hostname === 'localhost' ? 'localhost' : (window.location?.hostname || '192.168.1.11');
      ws = new WebSocket(`ws://${host}:5000`);
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
  }, [activeTrackingOrder?.id]);

  // Helper Fallback Image
  const getFallbackImage = (category: string) => {
    switch (category) {
      case 'Mains': return 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500&q=80';
      case 'Appetizers': return 'https://images.unsplash.com/photo-1577906096429-f73c2c312435?w=500&q=80';
      case 'Desserts': return 'https://images.unsplash.com/photo-1608836561226-d621b10a26e8?w=500&q=80';
      case 'Drinks':
      case 'Beverages': return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&q=80';
      case 'BBQ': return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&q=80';
      default: return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&q=80';
    }
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = activeCat === 'All' || item.category === activeCat;
      const matchQuery =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [menuItems, activeCat, searchQuery]);

  // Open Item Customizer
  const handleOpenCustomizer = (item: MenuItem) => {
    setCustomizerItem(item);
    setCustomizerQty(1);
    setCustomizerNotes('');
    setWeightKg(1.0);
    if (item.variants && item.variants.length > 0) {
      setSelectedVariant(item.variants[0].name);
    } else {
      setSelectedVariant('');
    }
  };

  // Add Item to Cart
  const handleAddToCart = () => {
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

    const cartId = `${customizerItem.id}-${selectedVariant}-${weightKg}-${Date.now()}`;
    const newItem: CartItem = {
      cartId,
      item: customizerItem,
      selectedVariant: selectedVariant || undefined,
      portionLabel: portionLabel || undefined,
      unitPrice: finalPrice,
      qty: customizerQty,
      notes: customizerNotes.trim() || undefined,
    };

    setCart(prev => [...prev, newItem]);
    setCustomizerItem(null);
  };

  // Cart Adjustments
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

  // Financial Computations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  }, [cart]);

  const deliveryFee = orderMode === 'dine_in' ? 0 : subtotal >= 2500 ? 0 : 150;
  const tax = Math.round(subtotal * 0.05); // 5% GST
  const grandTotal = subtotal + deliveryFee + tax;
  const totalCartCount = useMemo(() => cart.reduce((sum, i) => sum + i.qty, 0), [cart]);

  // Submit Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter your Name and Phone Number to confirm your order.');
      } else {
        Alert.alert('Required Information', 'Please enter your Name and Phone Number to confirm your order.');
      }
      return;
    }

    if (orderMode === 'delivery' && !deliveryAddress.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter your Delivery Address for home delivery.');
      } else {
        Alert.alert('Address Needed', 'Please enter your Delivery Address.');
      }
      return;
    }

    setSubmittingOrder(true);

    // Save Customer Profile for future visits
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
      deliveryAddress: orderMode === 'delivery' ? { addressLine: deliveryAddress.trim(), area: 'Customer Location' } : undefined,
      tableId: orderMode === 'dine_in' ? (selectedTable?.id || 'T-DINE') : undefined,
      tableName: orderMode === 'dine_in' ? `${selectedTable?.floor || 'Ground Floor'} • ${selectedTable?.name || 'Table'}` : undefined,
      tableInfo: orderMode === 'dine_in' ? {
        floor: selectedTable?.floor || 'Ground Floor',
        tableName: selectedTable?.name || 'Table',
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
        specialInstructions: c.notes,
        notes: c.notes,
      })),
    };

    try {
      let createdOrder: CustomerOrderHistory | null = null;
      let orderNum = `SLT-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Try sending to Central Server
      try {
        const res = await fetch(`${getBaseUrl()}/api/public/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });
        const data = await res.json();
        if (data.success && data.order) {
          createdOrder = {
            id: data.order.id,
            orderNumber: data.order.orderNumber || orderNum,
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
        }
      } catch (err) {
        console.warn('[Menu] Server request fallback to local sync:', err);
      }

      // 2. Offline / Local fallback if server is unreachable
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

        // Create local KOT Ticket for kitchen display
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

      // Update Order History
      const updatedHistory = [createdOrder, ...orderHistory];
      setOrderHistory(updatedHistory);
      await AsyncStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(updatedHistory));

      // Play audio chime
      playChime('order_placed');

      // Clear Cart & Open Live Tracking
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

  // Helper for 5-Stage Status Progress
  const getProgressStage = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { step: 1, percent: '20%', label: 'Order Received', desc: 'Sent to Sultan Front Desk for approval' };
      case 'CONFIRMED':
        return { step: 2, percent: '45%', label: 'Order Confirmed', desc: 'Accepted by Manager & Sent to Royal Kitchen' };
      case 'PREPARING':
        return { step: 3, percent: '70%', label: 'Cooking in Kitchen', desc: 'Chefs are preparing your dishes fresh' };
      case 'READY':
      case 'READY_FOR_PICKUP':
        return { step: 4, percent: '88%', label: 'Food Ready', desc: 'Ready for table serving or rider handover' };
      case 'OUT_FOR_DELIVERY':
        return { step: 4, percent: '90%', label: 'Out for Delivery 🛵', desc: 'Rider is en route to your location' };
      case 'DELIVERED':
      case 'SERVED':
        return { step: 5, percent: '100%', label: 'Delivered / Served 🎉', desc: 'Enjoy your Sultan culinary experience!' };
      case 'CANCELLED':
        return { step: 0, percent: '0%', label: 'Order Cancelled', desc: 'Order was rejected or cancelled' };
      default:
        return { step: 1, percent: '20%', label: status, desc: 'Processing your order' };
    }
  };

  // Unique floors
  const floorsList = useMemo(() => {
    const set = new Set<string>();
    tables.forEach(t => { if (t.floor) set.add(t.floor); });
    return ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Rooftop'].filter(
      f => set.has(f) || true
    );
  }, [tables]);

  const filteredTablesByFloor = useMemo(() => {
    return tables.filter(t => (t.floor || 'Ground Floor') === activeFloorFilter);
  }, [tables, activeFloorFilter]);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#3A0F12" />

      {/* Universal Portal Nav */}
      <UniversalPortalNav
        portalName="Sultan Digital Menu & Orders"
        portalRole="Customer App"
        showTabs={false}
      />

      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[2]}>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1000&q=80' }}
              style={styles.heroImage}
            />
            <View style={styles.heroOverlay}>
              <View style={styles.heroTopRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                >
                  <Ionicons name="arrow-back" size={22} color="#FFF" />
                </TouchableOpacity>

                <View style={styles.heroActionsRow}>
                  {orderHistory.length > 0 && (
                    <TouchableOpacity
                      style={styles.historyBtn}
                      onPress={() => setHistoryModalVisible(true)}
                    >
                      <Ionicons name="receipt-outline" size={16} color="#D5A943" />
                      <Text style={styles.historyBtnText}>My Orders ({orderHistory.length})</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.heroTextContainer}>
                <SultanLogo size="lg" width={60} height={55} style={{ marginBottom: 4 }} />
                <Text style={styles.heroTitle}>Sultan Restaurant</Text>
                <Text style={styles.heroSubtitle}>A Royal Mughlai & Barbecue Culinary Journey</Text>
              </View>
            </View>
          </View>

          {/* Mode Selector & Table QR Banner */}
          <View style={styles.orderModeCard}>
            <View style={styles.modeTabsRow}>
              <TouchableOpacity
                style={[styles.modeTab, orderMode === 'dine_in' && styles.modeTabActive]}
                onPress={() => setOrderMode('dine_in')}
              >
                <Ionicons
                  name="restaurant"
                  size={18}
                  color={orderMode === 'dine_in' ? '#D5A943' : '#888'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.modeTabText, orderMode === 'dine_in' && styles.modeTabTextActive]}>
                  Table QR Dine-In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTab, orderMode === 'delivery' && styles.modeTabActive]}
                onPress={() => setOrderMode('delivery')}
              >
                <Ionicons
                  name="bicycle"
                  size={18}
                  color={orderMode === 'delivery' ? '#D5A943' : '#888'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.modeTabText, orderMode === 'delivery' && styles.modeTabTextActive]}>
                  Online Home Delivery
                </Text>
              </TouchableOpacity>
            </View>

            {orderMode === 'dine_in' ? (
              <View style={styles.tableInfoBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tableInfoFloor}>
                    📍 {selectedTable?.floor || 'Ground Floor'} • {selectedTable?.name || 'Select Table'}
                  </Text>
                  <Text style={styles.tableInfoSub}>
                    Contactless ordering straight to Sultan kitchen display
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.tableChangeBtn}
                  onPress={() => setTableModalVisible(true)}
                >
                  <Ionicons name="qr-code-outline" size={16} color="#D5A943" style={{ marginRight: 4 }} />
                  <Text style={styles.tableChangeBtnText}>Change Table</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.deliveryInfoBanner}>
                <Ionicons name="flash" size={16} color="#2E7D32" style={{ marginRight: 6 }} />
                <Text style={styles.deliveryInfoText}>
                  Fast Express Delivery • Free Delivery on orders above Rs. 2,500
                </Text>
              </View>
            )}
          </View>

          {/* Sticky Categories & Search Bar */}
          <View style={styles.stickyFilterBar}>
            {/* Search Input */}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#999" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search royal dishes, karahi, kababs, drinks..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#999" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Categories Scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
              {['All', ...categories].map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBadge, activeCat === cat && styles.catBadgeActive]}
                  onPress={() => setActiveCat(cat)}
                >
                  <Text style={[styles.catText, activeCat === cat && styles.catTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Menu Catalog */}
          <View style={styles.menuContainer}>
            <View style={styles.menuHeaderRow}>
              <Text style={styles.sectionTitle}>
                {activeCat} {activeCat === 'All' ? 'Catalog' : 'Selection'}
              </Text>
              <Text style={styles.itemCountText}>{filteredItems.length} Dishes Available</Text>
            </View>

            <View style={styles.grid}>
              {filteredItems.map(item => (
                <View key={item.id} style={styles.menuCard}>
                  <Image
                    source={{ uri: item.imageUri || getFallbackImage(item.category) }}
                    style={styles.itemImage}
                  />
                  <View style={styles.itemContent}>
                    <View style={styles.itemHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                        {item.badge && (
                          <View style={styles.badgePill}>
                            <Text style={styles.badgePillText}>{item.badge}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.itemPrice}>Rs. {item.price.toFixed(0)}</Text>
                        {item.dealOriginalPrice && item.dealOriginalPrice > item.price && (
                          <Text style={styles.dealSavingsText}>
                            Save Rs. {(item.dealOriginalPrice - item.price).toFixed(0)}
                          </Text>
                        )}
                      </View>
                    </View>

                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {item.description || `Exquisite ${item.name.toLowerCase()} prepared fresh with authentic Sultan royal spices.`}
                    </Text>

                    {item.isDeal && item.dealItems && item.dealItems.length > 0 && (
                      <Text style={styles.comboIncludesText} numberOfLines={1}>
                        Includes: {item.dealItems.map(d => `${d.qty}x ${d.name}`).join(' • ')}
                      </Text>
                    )}

                    <View style={styles.cardBottomRow}>
                      {item.variants && item.variants.length > 0 ? (
                        <Text style={styles.variantsHintText}>{item.variants.length} Sizes Available</Text>
                      ) : <View />}

                      <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => handleOpenCustomizer(item)}
                      >
                        <Ionicons name="add" size={20} color="#3A0F12" />
                        <Text style={styles.addBtnText}>ADD</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

        </ScrollView>

        {/* Floating Cart Drawer Trigger */}
        {cart.length > 0 && (
          <View style={styles.floatingCartContainer}>
            <TouchableOpacity
              style={styles.floatingCartBar}
              onPress={() => setCartModalVisible(true)}
              activeOpacity={0.9}
            >
              <View style={styles.cartBarLeft}>
                <View style={styles.cartBadgeCircle}>
                  <Text style={styles.cartBadgeCircleText}>{totalCartCount}</Text>
                </View>
                <View>
                  <Text style={styles.cartBarTitle}>
                    {totalCartCount} {totalCartCount === 1 ? 'Dish' : 'Dishes'} in Royal Cart
                  </Text>
                  <Text style={styles.cartBarSub}>
                    {orderMode === 'dine_in'
                      ? `Table: ${selectedTable?.name || 'Selected Table'}`
                      : 'Home Express Delivery'}
                  </Text>
                </View>
              </View>

              <View style={styles.cartBarRight}>
                <Text style={styles.cartBarTotal}>Rs. {grandTotal.toLocaleString()}</Text>
                <View style={styles.viewCartPill}>
                  <Text style={styles.viewCartPillText}>Checkout</Text>
                  <Ionicons name="arrow-forward" size={14} color="#3A0F12" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modal 1: Dish Customizer / Portion / Variant Sizing */}
      <Modal visible={!!customizerItem} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.customizerCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{customizerItem?.name}</Text>
                <Text style={styles.modalSubtitle}>{customizerItem?.category} • Authentic Recipe</Text>
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
                  <View style={styles.variantGrid}>
                    {customizerItem.variants.map(v => (
                      <TouchableOpacity
                        key={v.name}
                        style={[styles.variantPill, selectedVariant === v.name && styles.variantPillActive]}
                        onPress={() => setSelectedVariant(v.name)}
                      >
                        <Text style={[styles.variantPillName, selectedVariant === v.name && styles.variantPillTextActive]}>
                          {v.name}
                        </Text>
                        <Text style={[styles.variantPillPrice, selectedVariant === v.name && styles.variantPillTextActive]}>
                          Rs. {v.price}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Weight Dish Engine (Quarter, Half, Full kg) */}
              {customizerItem &&
                (customizerItem.name.toLowerCase().includes('karahi') ||
                 customizerItem.name.toLowerCase().includes('handi') ||
                 customizerItem.name.toLowerCase().includes('sajji') ||
                 customizerItem.name.toLowerCase().includes('fish') ||
                 customizerItem.name.toLowerCase().includes('kg')) &&
                (!customizerItem.variants || customizerItem.variants.length === 0) ? (
                <View style={styles.customizerSection}>
                  <Text style={styles.sectionLabel}>Weight-Based Sizing (Karahi / Handi):</Text>
                  <View style={styles.weightRow}>
                    {[
                      { label: 'Quarter (0.25 kg)', val: 0.25 },
                      { label: 'Half (0.5 kg)', val: 0.5 },
                      { label: 'Full (1.0 kg)', val: 1.0 },
                    ].map(w => (
                      <TouchableOpacity
                        key={w.label}
                        style={[styles.weightPill, weightKg === w.val && styles.weightPillActive]}
                        onPress={() => setWeightKg(w.val)}
                      >
                        <Text style={[styles.weightPillText, weightKg === w.val && styles.weightPillTextActive]}>
                          {w.label}
                        </Text>
                        <Text style={[styles.weightPriceText, weightKg === w.val && styles.weightPillTextActive]}>
                          Rs. {Math.round(customizerItem.price * w.val)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Cooking / Preparation Notes Presets */}
              <View style={styles.customizerSection}>
                <Text style={styles.sectionLabel}>Special Cooking Instructions:</Text>
                <View style={styles.notesPresetsRow}>
                  {['Less Spicy 🌶️', 'Extra Spicy 🔥', 'No Onion 🧅', 'Crispy 🌟', 'Extra Gravy 🍲'].map(p => (
                    <TouchableOpacity
                      key={p}
                      style={styles.presetPill}
                      onPress={() =>
                        setCustomizerNotes(prev => (prev ? `${prev}, ${p}` : p))
                      }
                    >
                      <Text style={styles.presetPillText}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.notesInput}
                  placeholder="e.g. Mild spice for children, serve hot..."
                  placeholderTextColor="#999"
                  value={customizerNotes}
                  onChangeText={setCustomizerNotes}
                />
              </View>

              {/* Quantity Selector */}
              <View style={styles.customizerSection}>
                <Text style={styles.sectionLabel}>Quantity:</Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setCustomizerQty(Math.max(1, customizerQty - 1))}
                  >
                    <Ionicons name="remove" size={20} color="#3A0F12" />
                  </TouchableOpacity>
                  <Text style={styles.qtyValueText}>{customizerQty}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setCustomizerQty(customizerQty + 1)}
                  >
                    <Ionicons name="add" size={20} color="#3A0F12" />
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalAddCartBtn}
              onPress={handleAddToCart}
            >
              <Ionicons name="cart" size={20} color="#3A0F12" style={{ marginRight: 8 }} />
              <Text style={styles.modalAddCartText}>Add to Royal Cart</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Cart & Customer Checkout Sheet */}
      <Modal visible={cartModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.customizerCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Royal Cart & Order Checkout</Text>
                <Text style={styles.modalSubtitle}>
                  {orderMode === 'dine_in'
                    ? `Dine-In • ${selectedTable?.floor} (${selectedTable?.name})`
                    : 'Home Delivery Express'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCartModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {/* Dishes List */}
              <View style={styles.cartItemsList}>
                {cart.map(c => (
                  <View key={c.cartId} style={styles.cartItemRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.cartItemName}>
                        {c.item.name} {c.portionLabel ? `(${c.portionLabel})` : ''}
                      </Text>
                      {c.notes ? <Text style={styles.cartItemNotes}>Note: {c.notes}</Text> : null}
                      <Text style={styles.cartItemUnitRate}>Rs. {c.unitPrice} each</Text>
                    </View>

                    <View style={styles.cartItemQtyControls}>
                      <TouchableOpacity
                        style={styles.cartQtyBtn}
                        onPress={() => updateCartQty(c.cartId, -1)}
                      >
                        <Ionicons name="remove" size={14} color="#3A0F12" />
                      </TouchableOpacity>
                      <Text style={styles.cartQtyText}>{c.qty}</Text>
                      <TouchableOpacity
                        style={styles.cartQtyBtn}
                        onPress={() => updateCartQty(c.cartId, 1)}
                      >
                        <Ionicons name="add" size={14} color="#3A0F12" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.cartItemTotal}>Rs. {(c.unitPrice * c.qty).toLocaleString()}</Text>
                  </View>
                ))}
              </View>

              {/* Bill Financials */}
              <View style={styles.billSummaryCard}>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryVal}>Rs. {subtotal.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>
                    {orderMode === 'dine_in' ? 'Table Service' : 'Delivery Fee'}
                  </Text>
                  <Text style={[styles.summaryVal, deliveryFee === 0 && { color: '#2E7D32' }]}>
                    {deliveryFee === 0 ? 'FREE' : `Rs. ${deliveryFee}`}
                  </Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Govt Sales Tax (GST 5%)</Text>
                  <Text style={styles.summaryVal}>Rs. {tax.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryLine}>
                  <Text style={styles.grandTotalLabel}>Grand Total</Text>
                  <Text style={styles.grandTotalVal}>Rs. {grandTotal.toLocaleString()}</Text>
                </View>
              </View>

              {/* Customer Profile Inputs */}
              <View style={styles.profileSection}>
                <Text style={styles.sectionLabel}>Customer Contact (Mandatory):</Text>

                <TextInput
                  style={styles.inputField}
                  placeholder="Your Full Name (e.g. Tariq Mehmood)"
                  placeholderTextColor="#999"
                  value={customerName}
                  onChangeText={setCustomerName}
                />

                <TextInput
                  style={styles.inputField}
                  placeholder="Your Phone Number (e.g. 0300 1234567)"
                  placeholderTextColor="#999"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                />

                {orderMode === 'delivery' && (
                  <TextInput
                    style={[styles.inputField, { height: 60 }]}
                    placeholder="Delivery House Address & Street / Area..."
                    placeholderTextColor="#999"
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                    multiline
                  />
                )}
              </View>

              {/* Payment Method Selector */}
              <View style={styles.paymentSection}>
                <Text style={styles.sectionLabel}>Payment Method:</Text>
                <View style={styles.paymentGrid}>
                  {[
                    { id: 'cash_on_delivery', label: orderMode === 'dine_in' ? 'Pay at Counter / Cash' : 'Cash on Delivery (COD)' },
                    { id: 'card', label: 'Credit / Debit Card' },
                    { id: 'jazzcash', label: 'JazzCash' },
                    { id: 'easypaisa', label: 'EasyPaisa' },
                  ].map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.paymentPill, paymentMethod === p.id && styles.paymentPillActive]}
                      onPress={() => setPaymentMethod(p.id as any)}
                    >
                      <Ionicons
                        name={paymentMethod === p.id ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={paymentMethod === p.id ? '#D5A943' : '#999'}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.paymentPillText, paymentMethod === p.id && styles.paymentPillTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalAddCartBtn, submittingOrder && { opacity: 0.7 }]}
              onPress={handlePlaceOrder}
              disabled={submittingOrder}
            >
              {submittingOrder ? (
                <ActivityIndicator size="small" color="#3A0F12" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#3A0F12" style={{ marginRight: 8 }} />
                  <Text style={styles.modalAddCartText}>
                    Confirm & Place Order (Rs. {grandTotal.toLocaleString()})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Table QR Code & Floor Selector */}
      <Modal visible={tableModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.customizerCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Sultan 5-Floor Table Selector</Text>
                <Text style={styles.modalSubtitle}>Pick your active table or cabin in the restaurant</Text>
              </View>
              <TouchableOpacity onPress={() => setTableModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Floor Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 45, marginBottom: 12 }}>
              {floorsList.map(fl => (
                <TouchableOpacity
                  key={fl}
                  style={[styles.floorTab, activeFloorFilter === fl && styles.floorTabActive]}
                  onPress={() => setActiveFloorFilter(fl)}
                >
                  <Text style={[styles.floorTabText, activeFloorFilter === fl && styles.floorTabTextActive]}>
                    {fl}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tables Grid */}
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <View style={styles.tablePillsGrid}>
                {filteredTablesByFloor.map(tbl => (
                  <TouchableOpacity
                    key={tbl.id}
                    style={[
                      styles.tableSelectCard,
                      selectedTable?.id === tbl.id && styles.tableSelectCardActive,
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
                        styles.tableSelectName,
                        selectedTable?.id === tbl.id && styles.tableSelectNameActive,
                      ]}
                    >
                      {tbl.name}
                    </Text>
                    <Text style={styles.tableSeatsBadge}>{tbl.seats} Seats</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal 4: Live Order Status Lifecycle & Animated Progress Bar */}
      <Modal visible={trackingModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.customizerCard, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>⚡ Sultan Live Order Tracker</Text>
                <Text style={styles.modalSubtitle}>Order #{activeTrackingOrder?.orderNumber}</Text>
              </View>
              <TouchableOpacity onPress={() => setTrackingModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            {activeTrackingOrder ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Visual Progress Bar Card */}
                {(() => {
                  const stage = getProgressStage(activeTrackingOrder.status);
                  const isCancelled = activeTrackingOrder.status === 'CANCELLED';

                  return (
                    <View style={styles.trackerStageCard}>
                      <View style={styles.stageHeader}>
                        <View>
                          <Text style={[styles.stageMainLabel, isCancelled && { color: '#D32F2F' }]}>
                            {stage.label}
                          </Text>
                          <Text style={styles.stageDescText}>{stage.desc}</Text>
                        </View>
                        {!isCancelled && (
                          <View style={styles.estTimeBadge}>
                            <Ionicons name="time" size={14} color="#D5A943" style={{ marginRight: 4 }} />
                            <Text style={styles.estTimeText}>
                              ~{activeTrackingOrder.estimatedDeliveryMinutes || 25} Mins
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* 5-Step Progress Indicators */}
                      {!isCancelled ? (
                        <View style={styles.stepProgressContainer}>
                          <View style={styles.stepTrackBackground}>
                            <View style={[styles.stepTrackFill, { width: stage.percent as any }]} />
                          </View>

                          <View style={styles.stepNodesRow}>
                            {[
                              { step: 1, label: 'Received' },
                              { step: 2, label: 'Confirmed' },
                              { step: 3, label: 'Cooking' },
                              { step: 4, label: 'Ready/Out' },
                              { step: 5, label: 'Served' },
                            ].map(s => {
                              const isPassed = stage.step >= s.step;
                              const isCurrent = stage.step === s.step;
                              return (
                                <View key={s.step} style={styles.nodeColumn}>
                                  <View
                                    style={[
                                      styles.nodeCircle,
                                      isPassed && styles.nodeCirclePassed,
                                      isCurrent && styles.nodeCircleCurrent,
                                    ]}
                                  >
                                    {isPassed && !isCurrent ? (
                                      <Ionicons name="checkmark" size={12} color="#FFF" />
                                    ) : (
                                      <Text
                                        style={[
                                          styles.nodeText,
                                          (isPassed || isCurrent) && styles.nodeTextActive,
                                        ]}
                                      >
                                        {s.step}
                                      </Text>
                                    )}
                                  </View>
                                  <Text style={styles.nodeLabelText}>{s.label}</Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}

                      {/* Cancellation Alert Banner */}
                      {isCancelled && (
                        <View style={styles.cancelledBanner}>
                          <Ionicons name="alert-circle" size={24} color="#D32F2F" style={{ marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cancelledTitle}>Order Cancelled by Manager</Text>
                            <Text style={styles.cancelledReason}>
                              Reason: {activeTrackingOrder.managerNotes || 'Kitchen item out of stock / Capacity exceeded.'}
                            </Text>
                            <TouchableOpacity
                              style={styles.callDeskBtn}
                              onPress={() => Linking.openURL('tel:042111785826')}
                            >
                              <Ionicons name="call" size={14} color="#FFF" style={{ marginRight: 4 }} />
                              <Text style={styles.callDeskBtnText}>Contact Front Desk Help</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Assigned Rider Card (if Out for Delivery) */}
                {activeTrackingOrder.orderType === 'delivery' && activeTrackingOrder.riderName ? (
                  <View style={styles.riderCard}>
                    <View style={styles.riderAvatar}>
                      <Ionicons name="bicycle" size={24} color="#D5A943" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.riderRoleLabel}>Assigned Delivery Rider</Text>
                      <Text style={styles.riderName}>{activeTrackingOrder.riderName}</Text>
                      <Text style={styles.riderPhone}>{activeTrackingOrder.riderPhone || '0300 1234567'}</Text>
                    </View>
                    <View style={styles.riderActionsRow}>
                      {activeTrackingOrder.riderPhone && (
                        <TouchableOpacity
                          style={styles.riderCallBtn}
                          onPress={() => Linking.openURL(`tel:${activeTrackingOrder.riderPhone}`)}
                        >
                          <Ionicons name="call" size={18} color="#FFF" />
                        </TouchableOpacity>
                      )}
                      {activeTrackingOrder.riderPhone && (
                        <TouchableOpacity
                          style={[styles.riderCallBtn, { backgroundColor: '#25D366' }]}
                          onPress={() => Linking.openURL(`https://wa.me/${activeTrackingOrder.riderPhone}`)}
                        >
                          <Ionicons name="logo-whatsapp" size={18} color="#FFF" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : null}

                {/* Assigned Waiter Card (if Dine-In) */}
                {activeTrackingOrder.orderType === 'dine_in' && activeTrackingOrder.assignedWaiter ? (
                  <View style={styles.waiterCard}>
                    <Ionicons name="walk" size={20} color="#2E7D32" style={{ marginRight: 8 }} />
                    <Text style={styles.waiterCardText}>
                      Assigned Server: <Text style={{ fontWeight: '700' }}>{activeTrackingOrder.assignedWaiter}</Text>
                    </Text>
                  </View>
                ) : null}

                {/* Order Summary Breakdown */}
                <View style={styles.trackingItemsCard}>
                  <Text style={styles.sectionLabel}>Ordered Royal Dishes:</Text>
                  {activeTrackingOrder.items.map((it, idx) => (
                    <View key={idx} style={styles.trackingItemRow}>
                      <Text style={styles.trackingItemQty}>{it.qty}x</Text>
                      <Text style={styles.trackingItemName}>{it.name}</Text>
                      <Text style={styles.trackingItemPrice}>Rs. {(it.price * it.qty).toLocaleString()}</Text>
                    </View>
                  ))}
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryLine}>
                    <Text style={styles.grandTotalLabel}>Total Paid / Payable</Text>
                    <Text style={styles.grandTotalVal}>Rs. {activeTrackingOrder.total.toLocaleString()}</Text>
                  </View>
                </View>
              </ScrollView>
            ) : null}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setTrackingModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close Tracker</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 5: Customer Past Orders History */}
      <Modal visible={historyModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.customizerCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>📋 My Order History</Text>
                <Text style={styles.modalSubtitle}>All past orders placed on Sultan Restaurant</Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {orderHistory.map(ord => (
                <TouchableOpacity
                  key={ord.id}
                  style={styles.historyCard}
                  onPress={() => {
                    setActiveTrackingOrder(ord);
                    setHistoryModalVisible(false);
                    setTrackingModalVisible(true);
                  }}
                >
                  <View style={styles.historyCardHeader}>
                    <View>
                      <Text style={styles.historyOrderNum}>Order #{ord.orderNumber}</Text>
                      <Text style={styles.historyTime}>
                        {new Date(ord.createdAt).toLocaleDateString()} • {new Date(ord.createdAt).toLocaleTimeString()}
                      </Text>
                    </View>
                    <View style={styles.historyStatusPill}>
                      <Text style={styles.historyStatusText}>{ord.status.replace(/_/g, ' ')}</Text>
                    </View>
                  </View>

                  <Text style={styles.historyItemsSnippet} numberOfLines={2}>
                    {ord.items.map(i => `${i.qty}x ${i.name}`).join(' • ')}
                  </Text>

                  <View style={styles.historyCardFooter}>
                    <Text style={styles.historyTotalText}>Total: Rs. {ord.total.toLocaleString()}</Text>
                    <View style={styles.trackLiveBtn}>
                      <Text style={styles.trackLiveBtnText}>Track Live ➔</Text>
                    </View>
                  </View>
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
  safeContainer: {
    flex: 1,
    backgroundColor: '#3A0F12',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  heroSection: {
    height: 250,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(58, 15, 18, 0.72)',
    justifyContent: 'space-between',
    padding: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 20 : 0,
  },
  backBtn: {
    width: 38,
    height: 38,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: '#D5A94380',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  historyBtnText: {
    color: '#D5A943',
    fontSize: 12,
    fontWeight: '700',
  },
  heroTextContainer: {
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D5A943',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  orderModeCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: -24,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F1F5',
    borderRadius: 10,
    padding: 4,
    gap: 6,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#3A0F12',
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  modeTabTextActive: {
    color: '#D5A943',
    fontWeight: '700',
  },
  tableInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  tableInfoFloor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  tableInfoSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  tableChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A0F12',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tableChangeBtnText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '700',
  },
  deliveryInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  deliveryInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  stickyFilterBar: {
    backgroundColor: '#F8F9FA',
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1C1C1E',
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catBadge: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  catBadgeActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#3A0F12',
  },
  catText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  catTextActive: {
    color: '#D5A943',
    fontWeight: '700',
  },
  menuContainer: {
    padding: 16,
    maxWidth: 1000,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 100,
  },
  menuHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  itemCountText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  menuCard: {
    width: Platform.OS === 'web' ? '48%' : '100%',
    minWidth: 300,
    backgroundColor: '#FFF',
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  itemImage: {
    width: 110,
    height: 110,
  },
  itemContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3A0F12',
  },
  dealSavingsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6A1B9A',
  },
  itemDesc: {
    fontSize: 12,
    color: '#777',
    lineHeight: 16,
    marginTop: 2,
  },
  badgePill: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  badgePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8C6B1B',
  },
  comboIncludesText: {
    fontSize: 10,
    color: '#6A1B9A',
    backgroundColor: '#F8EEFF',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  variantsHintText: {
    fontSize: 11,
    color: '#D5A943',
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 2,
  },
  addBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3A0F12',
  },
  floatingCartContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  floatingCartBar: {
    backgroundColor: '#3A0F12',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#D5A943',
  },
  cartBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartBadgeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeCircleText: {
    color: '#3A0F12',
    fontSize: 13,
    fontWeight: '900',
  },
  cartBarTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cartBarSub: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '600',
  },
  cartBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartBarTotal: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
  },
  viewCartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  viewCartPillText: {
    color: '#3A0F12',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  customizerCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 550,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  customizerSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3A0F12',
    marginBottom: 8,
  },
  variantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  variantPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  variantPillActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  variantPillName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },
  variantPillPrice: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  variantPillTextActive: {
    color: '#D5A943',
  },
  weightRow: {
    flexDirection: 'row',
    gap: 8,
  },
  weightPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  weightPillActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  weightPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
  weightPriceText: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  weightPillTextActive: {
    color: '#D5A943',
  },
  notesPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  presetPill: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#D5A94350',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  presetPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8C6B1B',
  },
  notesInput: {
    backgroundColor: '#F9F9FB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#1C1C1E',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValueText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    minWidth: 24,
    textAlign: 'center',
  },
  modalAddCartBtn: {
    backgroundColor: '#D5A943',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  modalAddCartText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#3A0F12',
  },
  cartItemsList: {
    marginBottom: 12,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  cartItemNotes: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  cartItemUnitRate: {
    fontSize: 11,
    color: '#8C6B1B',
    fontWeight: '600',
  },
  cartItemQtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 6,
    marginRight: 12,
  },
  cartQtyBtn: {
    padding: 4,
  },
  cartQtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3A0F12',
    minWidth: 65,
    textAlign: 'right',
  },
  billSummaryCard: {
    backgroundColor: '#F9F9FB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 6,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3A0F12',
  },
  grandTotalVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#3A0F12',
  },
  profileSection: {
    marginBottom: 14,
  },
  inputField: {
    backgroundColor: '#F9F9FB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#1C1C1E',
    marginBottom: 8,
  },
  paymentSection: {
    marginBottom: 14,
  },
  paymentGrid: {
    gap: 6,
  },
  paymentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F9F9FB',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  paymentPillActive: {
    backgroundColor: '#FFF9E6',
    borderColor: '#D5A943',
  },
  paymentPillText: {
    fontSize: 12,
    color: '#444',
  },
  paymentPillTextActive: {
    fontWeight: '700',
    color: '#8C6B1B',
  },
  floorTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F1F5',
    marginRight: 8,
  },
  floorTabActive: {
    backgroundColor: '#3A0F12',
  },
  floorTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  floorTabTextActive: {
    color: '#D5A943',
    fontWeight: '700',
  },
  tablePillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tableSelectCard: {
    width: '31%',
    minWidth: 90,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  tableSelectCardActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  tableSelectName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  tableSelectNameActive: {
    color: '#D5A943',
  },
  tableSeatsBadge: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  trackerStageCard: {
    backgroundColor: '#FBF9F6',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EADFC7',
    marginBottom: 14,
  },
  stageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  stageMainLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#3A0F12',
  },
  stageDescText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  estTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A0F12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  estTimeText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '800',
  },
  stepProgressContainer: {
    marginVertical: 10,
  },
  stepTrackBackground: {
    height: 6,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  stepTrackFill: {
    height: '100%',
    backgroundColor: '#D5A943',
  },
  stepNodesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nodeColumn: {
    alignItems: 'center',
    width: 60,
  },
  nodeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  nodeCirclePassed: {
    backgroundColor: '#2E7D32',
  },
  nodeCircleCurrent: {
    backgroundColor: '#D5A943',
  },
  nodeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#777',
  },
  nodeTextActive: {
    color: '#FFF',
  },
  nodeLabelText: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#D32F2F',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  cancelledTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D32F2F',
  },
  cancelledReason: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  callDeskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  callDeskBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  riderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3A0F12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderRoleLabel: {
    fontSize: 10,
    color: '#8C6B1B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  riderName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  riderPhone: {
    fontSize: 12,
    color: '#666',
  },
  riderActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  riderCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waiterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  waiterCardText: {
    fontSize: 12,
    color: '#2E7D32',
  },
  trackingItemsCard: {
    backgroundColor: '#F9F9FB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  trackingItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  trackingItemQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3A0F12',
    width: 24,
  },
  trackingItemName: {
    fontSize: 12,
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  trackingItemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalCloseBtn: {
    backgroundColor: '#3A0F12',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCloseBtnText: {
    color: '#D5A943',
    fontSize: 13,
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  historyOrderNum: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3A0F12',
  },
  historyTime: {
    fontSize: 10,
    color: '#888',
    marginTop: 1,
  },
  historyStatusPill: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8C6B1B',
  },
  historyItemsSnippet: {
    fontSize: 12,
    color: '#555',
    marginVertical: 4,
  },
  historyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 6,
  },
  historyTotalText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  trackLiveBtn: {
    backgroundColor: '#3A0F12',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trackLiveBtnText: {
    color: '#D5A943',
    fontSize: 11,
    fontWeight: '700',
  },
});
