import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
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
import SultanLogo from '../../components/SultanLogo';
import FullscreenButton from '../../components/FullscreenButton';
import { broadcastImmediately, getActiveServerHttpUrl } from '../../services/syncService';
import { useOpsStore } from '../../store/opsStore';
import { MenuItem, OnlineOrder, Ticket, useRestaurantStore } from '../../store/restaurantStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resolveMenuImageUri } from '../../utils/menuImage';

// ==========================================
// TYPES & STORAGE KEYS
// ==========================================

export interface CartItem {
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
  status:
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'SERVED'
  | 'CANCELLED';
  createdAt: number;
  riderName?: string;
  riderPhone?: string;
  assignedWaiter?: string;
  managerNotes?: string;
  estimatedDeliveryMinutes?: number;
}

const STORAGE_KEY_PROFILE = '@sultan_customer_profile';
const STORAGE_KEY_ORDERS = '@sultan_customer_orders_v2';

// ==========================================
// AUTO CATEGORY SLIDER COMPONENT
// ==========================================

interface AutoCategorySliderProps {
  category: string;
  items: MenuItem[];
  onViewAll: (category: string) => void;
  renderCard: (item: MenuItem, cardKey?: string) => React.ReactNode;
  isDesktop: boolean;
  isTablet: boolean;
  getIcon: (cat: string) => keyof typeof Ionicons.glyphMap;
  getUrdu: (cat: string) => string;
}

const AutoCategorySlider: React.FC<AutoCategorySliderProps> = ({
  category,
  items,
  onViewAll,
  renderCard,
  isDesktop,
  isTablet,
  getIcon,
  getUrdu,
}) => {
  const scrollRef = useRef<any>(null);
  const offsetRef = useRef(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);

  const cardWidth = isDesktop ? 276 : isTablet ? 240 : 210;
  const gap = 12;
  const step = cardWidth + gap;

  const handleManualPrev = () => {
    const prev = Math.max(0, offsetRef.current - step * (isDesktop ? 2 : 1));
    scrollRef.current?.scrollTo({ x: prev, animated: true });
    offsetRef.current = prev;
    setCanScrollPrev(prev > 8);
  };

  const handleManualNext = () => {
    const next = offsetRef.current + step * (isDesktop ? 2 : 1);
    scrollRef.current?.scrollTo({ x: next, animated: true });
    offsetRef.current = next;
    setCanScrollPrev(next > 8);
  };

  return (
    <View style={styles.catGallerySection}>
      {/* Category Row Header */}
      <View style={styles.catGalleryHeader}>
        <View style={styles.catGalleryHeaderLeft}>
          <View style={styles.catGalleryBadgeIcon}>
            <Ionicons name={getIcon(category)} size={20} color="#D4AF37" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.catGalleryTitleRow}>
              <Text style={styles.catGalleryTitle}>{category}</Text>
              <View style={styles.catGalleryCountPill}>
                <Text style={styles.catGalleryCountText}>{items.length} dishes</Text>
              </View>
            </View>
            <Text style={styles.catGallerySubtitle} numberOfLines={1}>
              {getUrdu(category)}
            </Text>
          </View>
        </View>

        {/* Right: Calm Manual Arrows & View All */}
        <View style={styles.sliderControlsRow}>
          {items.length > 2 && (
            <View style={styles.sliderArrowGroup}>
              <TouchableOpacity
                style={[styles.sliderArrowBtn, !canScrollPrev && styles.sliderArrowBtnDisabled]}
                onPress={handleManualPrev}
                disabled={!canScrollPrev}
                activeOpacity={0.7}
                accessibilityLabel={`Previous ${category} dishes`}
              >
                <Ionicons name="chevron-back" size={16} color="#52171B" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sliderArrowBtn}
                onPress={handleManualNext}
                activeOpacity={0.7}
                accessibilityLabel={`Next ${category} dishes`}
              >
                <Ionicons name="chevron-forward" size={16} color="#52171B" />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.catGalleryViewAllBtn}
            onPress={() => onViewAll(category)}
            activeOpacity={0.8}
          >
            <Text style={styles.catGalleryViewAllText}>View All</Text>
            <Ionicons name="arrow-forward" size={13} color="#52171B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Smooth Horizontal Swipe Track (Each dish once — user stays 100% in control) */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catGalleryScrollContent}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          offsetRef.current = x;
          setCanScrollPrev(x > 8);
        }}
        scrollEventThrottle={32}
      >
        {items.map((item) => renderCard(item, `${category}_${item.id}`))}
        {items.length > 4 && (
          <TouchableOpacity
            style={[styles.catGalleryEndCard, { width: isDesktop ? 190 : 165 }]}
            onPress={() => onViewAll(category)}
            activeOpacity={0.85}
          >
            <View style={styles.catGalleryEndIconCircle}>
              <Ionicons name="arrow-forward" size={20} color="#52171B" />
            </View>
            <Text style={styles.catGalleryEndTitle}>See All</Text>
            <Text style={styles.catGalleryEndCat} numberOfLines={1}>
              {category}
            </Text>
            <Text style={styles.catGalleryEndCount}>{items.length} dishes</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

// ==========================================
// MAIN CUSTOMER MENU COMPONENT
// ==========================================

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

  // Stores
  const menuItems = useRestaurantStore((state) => state.menuItems);
  const categories = useRestaurantStore((state) => state.categories);
  const tables = useRestaurantStore((state) => state.tables);
  const onlineOrders = useRestaurantStore((state) => state.onlineOrders) || [];
  const syncFromServer = useRestaurantStore((state) => state.syncFromServer);
  const unavailableIds = useOpsStore((state) => state.unavailableItemIds) || [];
  const systemSettings = useSettingsStore((s) => s.settings);

  const mainScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollOffsetYRef = useRef<number>(0);
  const menuTopYRef = useRef<number>(220);

  // Order Mode & Active Table
  const [orderMode, setOrderMode] = useState<'dine_in' | 'delivery'>(
    params.mode === 'delivery' ? 'delivery' : 'dine_in'
  );
  const [selectedTable, setSelectedTable] = useState<{
    id: string;
    name: string;
    floor: string;
  } | null>(null);
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [activeFloorFilter, setActiveFloorFilter] = useState<string>('Ground Floor');

  // Search & Filters
  const [activeCat, setActiveCat] = useState('All');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'specials' | 'spicy' | 'under600' | 'sharing'>('all');
  const [viewMode, setViewMode] = useState<'gallery' | 'grid'>('grid');
  const [cartToast, setCartToast] = useState<{ title: string; subtitle?: string } | null>(null);
  const cartToastTimerRef = useRef<any>(null);

  const showCartToast = useCallback((title: string, subtitle?: string) => {
    if (cartToastTimerRef.current) clearTimeout(cartToastTimerRef.current);
    setCartToast({ title, subtitle });
    cartToastTimerRef.current = setTimeout(() => {
      setCartToast(null);
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (cartToastTimerRef.current) clearTimeout(cartToastTimerRef.current);
    };
  }, []);

  const handleSelectCategory = useCallback((cat: string) => {
    setActiveCat(cat);
    if (scrollOffsetYRef.current > menuTopYRef.current) {
      mainScrollRef.current?.scrollTo({
        y: Math.max(0, menuTopYRef.current - 62),
        animated: true,
      });
    }
  }, []);

  const shouldShowSpiceOption = useCallback((item?: MenuItem | null) => {
    if (!item) return false;
    const cat = (item.category || '').toLowerCase();
    const nonSpicyCats = ['bakery', 'dessert', 'coffee', 'tea', 'mocktail', 'ice cream', 'cold drinks', 'water', 'salad', 'tandoor', 'sauces'];
    if (nonSpicyCats.some((k) => cat.includes(k))) return false;
    if (item.name.toLowerCase().includes('makhan')) return false;
    return true;
  }, []);

  // Cart & Customizer
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
  const [paymentMethod, setPaymentMethod] = useState<
    'cash_on_delivery' | 'card' | 'jazzcash' | 'easypaisa'
  >('cash_on_delivery');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const isSubmittingOrderRef = useRef(false);

  // Order History List
  const [orderHistory, setOrderHistory] = useState<CustomerOrderHistory[]>([]);
  const [soundMuted, setSoundMuted] = useState(false);

  // Initialize Table & Load Profile / Orders
  useEffect(() => {
    let targetTableId = params.tableId || params.table;
    let targetTableName = params.tableName;
    let targetFloor = params.floor;

    if (targetTableId && tables.length > 0) {
      const matched = tables.find(
        (t) =>
          t.id === targetTableId ||
          t.name.toLowerCase() === targetTableId?.toLowerCase()
      );
      if (matched) {
        setSelectedTable({
          id: matched.id,
          name: matched.name,
          floor: matched.floor || 'Ground Floor',
        });
      } else {
        setSelectedTable({
          id: targetTableId,
          name: targetTableName || targetTableId,
          floor: targetFloor || 'Ground Floor',
        });
      }
    } else if (tables.length > 0 && !selectedTable) {
      const defaultTable = tables.find((t) => t.status === 'available') || tables[0];
      if (defaultTable) {
        setSelectedTable({
          id: defaultTable.id,
          name: defaultTable.name,
          floor: defaultTable.floor || 'Ground Floor',
        });
      }
    }
  }, [params.table, params.tableId, params.tableName, params.floor, tables]);

  // Load Saved Customer Profile & Order History
  useEffect(() => {
    (async () => {
      try {
        const rawProfile = await AsyncStorage.getItem(STORAGE_KEY_PROFILE);
        if (rawProfile) {
          const parsed = JSON.parse(rawProfile);
          if (parsed.name) setCustomerName(parsed.name);
          if (parsed.phone) setCustomerPhone(parsed.phone);
          if (parsed.address) setDeliveryAddress(parsed.address);
        }

        const rawOrders = await AsyncStorage.getItem(STORAGE_KEY_ORDERS);
        if (rawOrders) {
          const parsedOrders = JSON.parse(rawOrders);
          if (Array.isArray(parsedOrders)) {
            setOrderHistory(parsedOrders);
            // If the latest order is still active, track it by default
            const latest = parsedOrders[0];
            if (latest && latest.status !== 'DELIVERED' && latest.status !== 'SERVED' && latest.status !== 'CANCELLED') {
              setActiveTrackingOrder(latest);
            }
          }
        }
      } catch {
        // storage ignored safely
      }
    })();
  }, []);

  // Real-time synchronization of active order status from store (WebSocket sync)
  useEffect(() => {
    if (!onlineOrders || onlineOrders.length === 0) return;

    const ORDER_STATUS_RANK: Record<string, number> = {
      PENDING: 1,
      CONFIRMED: 2,
      PREPARING: 3,
      READY: 4,
      READY_FOR_PICKUP: 4,
      OUT_FOR_DELIVERY: 4,
      SERVED: 5,
      DELIVERED: 5,
      CANCELLED: 99,
    };

    if (activeTrackingOrder) {
      const match = onlineOrders.find(
        (o) => o.id === activeTrackingOrder.id || o.orderNumber === activeTrackingOrder.orderNumber
      );
      if (match) {
        const curRank = ORDER_STATUS_RANK[activeTrackingOrder.status] ?? 0;
        const matchRank = ORDER_STATUS_RANK[match.status] ?? 0;

        // ONLY advance forward! Never revert backwards from e.g. PREPARING to CONFIRMED
        if (matchRank > curRank || match.status === 'CANCELLED') {
          setActiveTrackingOrder((prev) =>
            prev
              ? {
                  ...prev,
                  status: match.status as any,
                  estimatedDeliveryMinutes: match.estimatedDeliveryMinutes ?? prev.estimatedDeliveryMinutes,
                  riderName: match.riderName || prev.riderName,
                  riderPhone: match.riderPhone || prev.riderPhone,
                  assignedWaiter: match.assignedWaiter || prev.assignedWaiter,
                }
              : null
          );
          if (match.status === 'CONFIRMED' || match.status === 'PREPARING' || match.status === 'READY' || match.status === 'SERVED') {
            playChime('status_update');
          }
        }
      }
    }

    setOrderHistory((prevHistory) => {
      let changed = false;
      const updated = prevHistory.map((item) => {
        const match = onlineOrders.find(
          (o) => o.id === item.id || o.orderNumber === item.orderNumber
        );
        if (match) {
          const itemRank = ORDER_STATUS_RANK[item.status] ?? 0;
          const matchRank = ORDER_STATUS_RANK[match.status] ?? 0;
          if (matchRank > itemRank || match.status === 'CANCELLED') {
            changed = true;
            return {
              ...item,
              status: match.status as any,
              estimatedDeliveryMinutes: match.estimatedDeliveryMinutes ?? item.estimatedDeliveryMinutes,
              riderName: match.riderName || item.riderName,
              riderPhone: match.riderPhone || item.riderPhone,
              assignedWaiter: match.assignedWaiter || item.assignedWaiter,
            };
          }
        }
        return item;
      });
      if (changed) {
        AsyncStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(updated)).catch(() => {});
        return updated;
      }
      return prevHistory;
    });
  }, [onlineOrders, activeTrackingOrder?.id, activeTrackingOrder?.status]);

  // Active HTTP Polling when tracking an unresolved order (direct fallback for external guest browsers)
  useEffect(() => {
    if (!activeTrackingOrder) return;
    const currentStatus = activeTrackingOrder.status;
    if (currentStatus === 'DELIVERED' || currentStatus === 'SERVED' || currentStatus === 'CANCELLED') return;

    const ORDER_STATUS_RANK: Record<string, number> = {
      PENDING: 1,
      CONFIRMED: 2,
      PREPARING: 3,
      READY: 4,
      READY_FOR_PICKUP: 4,
      OUT_FOR_DELIVERY: 4,
      SERVED: 5,
      DELIVERED: 5,
      CANCELLED: 99,
    };

    const orderQueryId = activeTrackingOrder.id || activeTrackingOrder.orderNumber;
    let isCancelled = false;

    const pollOrderStatus = async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/public/orders/${orderQueryId}`);
        if (!res.ok) return;
        const data = await res.json();
        const serverOrder = data.order || data.data;
        if (!serverOrder || isCancelled) return;

        const curRank = ORDER_STATUS_RANK[currentStatus] ?? 0;
        const serverRank = ORDER_STATUS_RANK[serverOrder.status] ?? 0;

        // Only update if server order is more advanced (or cancelled), preventing flickering
        if (serverRank > curRank || serverOrder.status === 'CANCELLED') {
          setActiveTrackingOrder((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              status: serverOrder.status,
              estimatedDeliveryMinutes: serverOrder.estimatedDeliveryMinutes ?? prev.estimatedDeliveryMinutes,
              riderName: serverOrder.riderName || prev.riderName,
              riderPhone: serverOrder.riderPhone || prev.riderPhone,
              assignedWaiter: serverOrder.assignedWaiter || prev.assignedWaiter,
            };
          });

          // Sync into store as well so store never lags behind polling
          useRestaurantStore.setState((s) => ({
            onlineOrders: (s.onlineOrders || []).map((o) =>
              (o.id === serverOrder.id || o.orderNumber === serverOrder.orderNumber)
                ? { ...o, status: serverOrder.status }
                : o
            ),
          }));

          if (serverOrder.status === 'CONFIRMED' || serverOrder.status === 'PREPARING' || serverOrder.status === 'READY' || serverOrder.status === 'SERVED') {
            playChime('status_update');
          }

          setOrderHistory((prevHistory) => {
            const updated = prevHistory.map((item) => {
              if (item.id === serverOrder.id || item.orderNumber === serverOrder.orderNumber) {
                return {
                  ...item,
                  status: serverOrder.status,
                  estimatedDeliveryMinutes: serverOrder.estimatedDeliveryMinutes ?? item.estimatedDeliveryMinutes,
                  riderName: serverOrder.riderName || item.riderName,
                  riderPhone: serverOrder.riderPhone || item.riderPhone,
                  assignedWaiter: serverOrder.assignedWaiter || item.assignedWaiter,
                };
              }
              return item;
            });
            AsyncStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(updated)).catch(() => {});
            return updated;
          });
        }
      } catch {
        // silent polling catch
      }
    };

    pollOrderStatus();
    const interval = setInterval(pollOrderStatus, 2500);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [activeTrackingOrder?.id, activeTrackingOrder?.orderNumber, activeTrackingOrder?.status]);

  // Audio Chime
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
            osc.frequency.setValueAtTime(523.25, ctx.currentTime);
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
            osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24);
          } else {
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
          }
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
          osc.start();
          osc.stop(ctx.currentTime + 0.45);
        }
      }
    } catch {
      // Audio autoplay handled
    }
  };

  // Helper: URL base for Central POS & API Hub
  const getBaseUrl = () => {
    return getActiveServerHttpUrl();
  };

  // Helper: Category Icons & Urdu Titles
  const getCategoryIcon = (cat: string): keyof typeof Ionicons.glyphMap => {
    const lower = cat.toLowerCase();
    if (lower === 'all') return 'grid-outline';
    if (lower.includes('salad')) return 'leaf-outline';
    if (lower.includes('pizza')) return 'pizza-outline';
    if (lower.includes('burger') || lower.includes('sandwich')) return 'fast-food-outline';
    if (lower.includes('coffee') || lower.includes('tea')) return 'cafe-outline';
    if (lower.includes('karahi') || lower.includes('handi') || lower.includes('steak')) return 'flame-outline';
    if (
      lower.includes('bbq') ||
      lower.includes('kabab') ||
      lower.includes('grill') ||
      lower.includes('tikka')
    )
      return 'bonfire-outline';
    if (lower.includes('mandi') || lower.includes('arabic')) return 'moon-outline';
    if (lower.includes('biryani') || lower.includes('rice') || lower.includes('pulao'))
      return 'restaurant-outline';
    if (lower.includes('mains') || lower.includes('curry') || lower.includes('pasta') || lower.includes('chinese'))
      return 'restaurant-outline';
    if (
      lower.includes('appetizer') ||
      lower.includes('starter') ||
      lower.includes('soup') ||
      lower.includes('roll')
    )
      return 'sparkles-outline';
    if (lower.includes('naan') || lower.includes('roti') || lower.includes('bread') || lower.includes('tandoor'))
      return 'nutrition-outline';
    if (
      lower.includes('dessert') ||
      lower.includes('sweet') ||
      lower.includes('bakery') ||
      lower.includes('ice cream') ||
      lower.includes('kunafa') ||
      lower.includes('kheer')
    )
      return 'ice-cream-outline';
    if (
      lower.includes('drink') ||
      lower.includes('beverage') ||
      lower.includes('juice') ||
      lower.includes('shake') ||
      lower.includes('mocktail') ||
      lower.includes('water')
    )
      return 'wine-outline';
    if (lower.includes('sauce') || lower.includes('side')) return 'flask-outline';
    if (lower.includes('deal') || lower.includes('combo') || lower.includes('family'))
      return 'pricetags-outline';
    return 'restaurant-outline';
  };

  const getCategoryUrduOrTagline = (cat: string) => {
    const lower = cat.toLowerCase();
    if (lower.includes('salad')) {
      return 'تازہ سلاد • Crisp Garden & Gourmet Salads';
    }
    if (lower.includes('appetizer') || lower.includes('starter') || lower.includes('soup') || lower.includes('roll')) {
      return 'شروع کے لذیذ پکوان • Fresh Starters & Soups';
    }
    if (lower.includes('karahi') || lower.includes('handi')) {
      return 'روایتی کڑاہی اور ہانڈی • Fresh Clay Handi & Wok';
    }
    if (lower.includes('bbq') || lower.includes('grill') || lower.includes('kabab') || lower.includes('tikka')) {
      return 'شاہی باربی کیو اور کباب • Live Charcoal Grills';
    }
    if (lower.includes('mandi') || lower.includes('arabic')) {
      return 'شاہی عربی مندی • Slow-Cooked Arabic Mandi & Rice';
    }
    if (lower.includes('pizza')) {
      return 'تازہ اوون پیزا • Wood-Fired Artisan Pizzas';
    }
    if (lower.includes('burger') || lower.includes('sandwich')) {
      return 'گرلڈ برگرز اور سینڈوچز • Gourmet Burgers & Clubs';
    }
    if (lower.includes('steak')) {
      return 'سزلنگ سٹیکس • Flame-Grilled Sizzling Steaks';
    }
    if (lower.includes('pasta')) {
      return 'کریمی پاستا • Classic Italian Pastas';
    }
    if (lower.includes('chinese')) {
      return 'چائنیز ڈشز • Wok-Tossed Chinese Favorites';
    }
    if (lower.includes('biryani') || lower.includes('rice') || lower.includes('pulao')) {
      return 'شاہی بریانی اور پلاؤ • Aromatic Basmati Specialties';
    }
    if (lower.includes('mains') || lower.includes('curry')) {
      return 'شاہی روایتی کھانے • Royal Pakistani Curries & Mains';
    }
    if (lower.includes('naan') || lower.includes('roti') || lower.includes('bread') || lower.includes('tandoor')) {
      return 'تازہ تندوری نان اور روٹیاں • Fresh Clay Oven Breads';
    }
    if (lower.includes('ice cream')) {
      return 'آئس کریم اور سنڈیز • Creamy Scoops & Sundaes';
    }
    if (lower.includes('dessert') || lower.includes('sweet') || lower.includes('bakery') || lower.includes('kunafa')) {
      return 'شاہی میٹھے اور بیکری • Traditional Desserts & Cakes';
    }
    if (lower.includes('coffee')) {
      return 'تازہ کافی بار • Crafted Espresso & Cold Brews';
    }
    if (lower.includes('tea')) {
      return 'کڑک چائے اور قہوہ • Kashmiri Chai & Traditional Teas';
    }
    if (lower.includes('mocktail')) {
      return 'تازہ موکٹیلز • Signature Chilled Mocktails';
    }
    if (lower.includes('drink') || lower.includes('beverage') || lower.includes('juice') || lower.includes('shake')) {
      return 'تازہ جوس اور شیکس • Chilled Juices, Shakes & Drinks';
    }
    if (lower.includes('sauce') || lower.includes('side')) {
      return 'رائتہ اور چٹنیاں • Fresh Dips, Raita & Sides';
    }
    if (lower.includes('deal') || lower.includes('combo') || lower.includes('family')) {
      return 'شاہی فیملی ڈیلز • Exclusive Value Feasts & Combos';
    }
    return 'شاہی شاہکار پکوان • Authentic Sultan Specialties';
  };

  // Categories List & Live Counts (syncs cleanly with Search & Quick Discovery Filters)
  const categoryTabs = useMemo(() => {
    const set = new Set<string>();
    (categories || []).forEach((c) => {
      const clean = (c || '').trim();
      if (clean && clean.toLowerCase() !== 'all') set.add(clean);
    });
    return ['All', ...Array.from(set)];
  }, [categories]);

  const matchesActiveFilters = useCallback(
    (item: MenuItem) => {
      let matchRegion = true;
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        matchRegion =
          (item.region || '').trim().toLowerCase() === activeRegion.trim().toLowerCase();
      }
      if (!matchRegion) return false;

      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchQuery =
          item.name.toLowerCase().includes(q) ||
          Boolean(item.urduName && item.urduName.toLowerCase().includes(q)) ||
          Boolean(item.description && item.description.toLowerCase().includes(q)) ||
          Boolean(item.category && item.category.toLowerCase().includes(q)) ||
          Boolean(item.region && item.region.toLowerCase().includes(q));
        if (!matchQuery) return false;
      }

      if (dietaryFilter === 'specials') {
        return Boolean(item.badge || item.isDeal);
      } else if (dietaryFilter === 'spicy') {
        const lower = (item.name + ' ' + (item.category || '')).toLowerCase();
        return (
          lower.includes('spicy') ||
          lower.includes('karahi') ||
          lower.includes('tikka') ||
          lower.includes('bbq') ||
          lower.includes('chilli') ||
          lower.includes('peri') ||
          lower.includes('masala')
        );
      } else if (dietaryFilter === 'under600') {
        return Number(item.price || 0) <= 600;
      } else if (dietaryFilter === 'sharing') {
        const lower = (item.name + ' ' + (item.category || '')).toLowerCase();
        return (
          lower.includes('platter') ||
          lower.includes('mandi') ||
          lower.includes('karahi') ||
          lower.includes('handi') ||
          lower.includes('pizza') ||
          Boolean(item.isDeal)
        );
      }

      return true;
    },
    [activeRegion, searchQuery, dietaryFilter]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0, ALL: 0 };
    (menuItems || []).forEach((item) => {
      if (!matchesActiveFilters(item)) return;
      counts['All'] = (counts['All'] || 0) + 1;
      counts['ALL'] = (counts['ALL'] || 0) + 1;
      if (item.category) {
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems, matchesActiveFilters]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat =
        activeCat === 'All' ||
        activeCat === 'ALL' ||
        (item.category || '').toLowerCase() === activeCat.toLowerCase();
      return matchCat && matchesActiveFilters(item);
    });
  }, [menuItems, activeCat, matchesActiveFilters]);

  // Grouped Categories for Organized Menu Grid & Swipe Rows
  const groupedCategoryGalleries = useMemo(() => {
    const orderedCats: string[] = [];
    (categoryTabs || []).forEach((c) => {
      const clean = (c || '').trim();
      if (
        clean &&
        clean.toLowerCase() !== 'all' &&
        !orderedCats.some((x) => x.toLowerCase() === clean.toLowerCase())
      ) {
        orderedCats.push(clean);
      }
    });

    (menuItems || []).forEach((m) => {
      const c = (m.category || 'Mains').trim();
      if (c && !orderedCats.some((x) => x.toLowerCase() === c.toLowerCase())) {
        orderedCats.push(c);
      }
    });

    const baseItems = menuItems.filter(matchesActiveFilters);

    const galleries: { category: string; items: MenuItem[] }[] = [];
    orderedCats.forEach((cat) => {
      const catItems = baseItems.filter(
        (item) => (item.category || 'Mains').trim().toLowerCase() === cat.toLowerCase()
      );
      if (catItems.length > 0) {
        galleries.push({ category: cat, items: catItems });
      }
    });

    return galleries;
  }, [categoryTabs, menuItems, matchesActiveFilters]);

  // Is Sold Out
  const isItemSoldOut = (item: MenuItem) => {
    return (
      unavailableIds.includes(item.id) ||
      item.available === false ||
      (typeof item.stock === 'number' && item.stock <= 0) ||
      (item.trackStock && typeof item.stockQty === 'number' && item.stockQty <= 0)
    );
  };

  const getItemCartQty = (itemId: string) => {
    return cart
      .filter((c) => c.item.id === itemId)
      .reduce((sum, c) => sum + c.qty, 0);
  };

  // Cart Management
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

    const existing = cart.find(
      (c) => c.item.id === item.id && !c.selectedVariant && !c.portionLabel
    );
    if (existing) {
      updateCartQty(existing.cartId, 1);
    } else {
      const newItem: CartItem = {
        cartId: `${item.id}-${Date.now()}`,
        item,
        unitPrice: item.price,
        qty: 1,
      };
      setCart((prev) => [...prev, newItem]);
    }
    showCartToast(`Added ${item.name}`, `Rs. ${item.price.toLocaleString()}`);
  };

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

  const customizerUnitPrice = useMemo(() => {
    if (!customizerItem) return 0;
    if (customizerItem.variants && customizerItem.variants.length > 0 && selectedVariant) {
      const v = customizerItem.variants.find((vr) => vr.name === selectedVariant);
      if (v) return v.price;
    }
    const lowerName = customizerItem.name.toLowerCase();
    const isWeightDish =
      (!customizerItem.variants || customizerItem.variants.length === 0) &&
      (lowerName.includes('karahi') || lowerName.includes('handi') || lowerName.includes('sajji') || lowerName.includes('kg'));
    if (isWeightDish) return Math.round(customizerItem.price * weightKg);
    return customizerItem.price;
  }, [customizerItem, selectedVariant, weightKg]);

  const handleAddFromCustomizer = () => {
    if (!customizerItem) return;

    let finalPrice = customizerItem.price;
    let portionLabel = '';

    const lowerName = customizerItem.name.toLowerCase();
    const isWeightDish =
      (!customizerItem.variants || customizerItem.variants.length === 0) &&
      (lowerName.includes('karahi') ||
        lowerName.includes('handi') ||
        lowerName.includes('sajji') ||
        lowerName.includes('kg'));

    if (customizerItem.variants && customizerItem.variants.length > 0 && selectedVariant) {
      const v = customizerItem.variants.find((vr) => vr.name === selectedVariant);
      if (v) {
        finalPrice = v.price;
        portionLabel = v.name;
      }
    } else if (isWeightDish) {
      finalPrice = Math.round(customizerItem.price * weightKg);
      portionLabel =
        weightKg === 0.25
          ? 'Quarter (0.25 kg)'
          : weightKg === 0.5
            ? 'Half (0.5 kg)'
            : `${weightKg} kg`;
    }

    const noteSegments: string[] = [];
    if (shouldShowSpiceOption(customizerItem) && spiceLevel) {
      noteSegments.push(`Spice: ${spiceLevel}`);
    }
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

    setCart((prev) => [...prev, newItem]);
    showCartToast(
      `Added ${customizerQty}x ${customizerItem.name}`,
      `Rs. ${(finalPrice * customizerQty).toLocaleString()}`
    );
    setCustomizerItem(null);
  };

  const updateCartQty = (cartId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) => {
          if (ci.cartId === cartId) {
            const newQ = ci.qty + delta;
            return newQ > 0 ? { ...ci, qty: newQ } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleQuickDecrease = (itemId: string) => {
    const existing = [...cart].reverse().find((c) => c.item.id === itemId);
    if (existing) {
      updateCartQty(existing.cartId, -1);
    }
  };

  const handleClearCart = () => setCart([]);
  const handleRemoveCartItem = (cartId: string) =>
    setCart((prev) => prev.filter((c) => c.cartId !== cartId));

  // Financial Computations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  }, [cart]);

  const deliveryFee = orderMode === 'dine_in' ? 0 : subtotal >= 2500 ? 0 : 150;
  const tax = Math.round(subtotal * 0.05); // 5% GST
  const grandTotal = subtotal + deliveryFee + tax;
  const totalCartCount = useMemo(() => cart.reduce((sum, i) => sum + i.qty, 0), [cart]);

  // Order Submission
  const handlePlaceOrder = async () => {
    if (isSubmittingOrderRef.current || submittingOrder) return;

    if (systemSettings.enableOnlineOrders === false) {
      const msg = 'Online & QR ordering is currently paused. Please call a waiter or place your order at the counter.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Online Ordering Paused', msg);
      return;
    }
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

    isSubmittingOrderRef.current = true;
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
    } catch {
      // storage ignored
    }

    const orderPayload = {
      orderType: orderMode,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress:
        orderMode === 'delivery'
          ? { addressLine: deliveryAddress.trim(), area: 'Customer Area' }
          : undefined,
      tableId: orderMode === 'dine_in' ? selectedTable?.id || 'T-1' : undefined,
      tableName:
        orderMode === 'dine_in'
          ? `${selectedTable?.floor || 'Ground Floor'} • ${selectedTable?.name || 'Table'}`
          : undefined,
      tableInfo:
        orderMode === 'dine_in' && selectedTable
          ? {
            tableId: selectedTable.id,
            tableName: selectedTable.name,
            floor: selectedTable.floor || 'Ground Floor',
            seatingType: 'tables',
          }
          : undefined,
      paymentMethod,
      items: cart.map((c) => ({
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
            items: cart.map((c) => ({
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

          const formattedOnlineOrder: OnlineOrder = {
            id: returnedOrder.id,
            orderNumber: returnedOrder.orderNumber || orderNum,
            source: 'digital_menu',
            orderType: orderMode as any,
            floor: selectedTable?.floor,
            tableId: selectedTable?.id,
            tableName: orderPayload.tableName,
            customer: {
              name: customerName.trim(),
              phone: customerPhone.trim(),
              address: deliveryAddress.trim(),
            },
            paymentMethod: paymentMethod || 'pay_at_counter',
            items: cart.map((c) => ({
              id: c.item.id,
              name: c.portionLabel ? `${c.item.name} (${c.portionLabel})` : c.item.name,
              unitPrice: c.unitPrice,
              price: c.unitPrice,
              qty: c.qty,
              quantity: c.qty,
              totalPrice: c.unitPrice * c.qty,
              notes: c.notes,
              station: c.item.station || 'main',
            })),
            subtotal,
            deliveryFee,
            tax,
            total: grandTotal,
            status: (returnedOrder.status as any) || 'PENDING',
          };

          const storeOnlineOrders = useRestaurantStore.getState().onlineOrders || [];
          useRestaurantStore.getState().syncFromServer({
            onlineOrders: [formattedOnlineOrder, ...storeOnlineOrders.filter(o => o.id !== formattedOnlineOrder.id)],
            ...(data.pendingConfirmation ? {
              pendingFloorOrderAlert: {
                id: `alert-${Date.now()}`,
                orderId: returnedOrder.id,
                orderNumber: returnedOrder.orderNumber || orderNum,
                floor: selectedTable?.floor || 'Ground Floor',
                tableId: selectedTable?.id || '1',
                tableName: orderPayload.tableName || 'Table',
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                total: grandTotal,
                itemsCount: cart.length,
                itemsSummary: cart.map(c => `${c.qty}x ${c.item.name}`).join(', '),
                time: Date.now(),
              }
            } : {})
          });

          if (data.ticket) {
            const currentTickets = useRestaurantStore.getState().tickets || [];
            if (!currentTickets.some((t: Ticket) => t.id === data.ticket.id)) {
              useRestaurantStore.getState().syncFromServer({
                tickets: [data.ticket, ...currentTickets],
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Menu] Server unreachable, using local fallback:', err);
      }

      // 2. Offline fallback
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
          items: cart.map((c) => ({
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
            server:
              orderMode === 'dine_in'
                ? 'App Guest (Contactless QR)'
                : 'Online Delivery',
            timePlaced: Date.now(),
            status: 'cooking',
            items: cart.map((c) => ({
              id: c.item.id,
              name: c.portionLabel ? `${c.item.name} (${c.portionLabel})` : c.item.name,
              price: c.unitPrice,
              qty: c.qty,
              notes: c.notes,
              completed: false,
              station: c.item.station || 'main',
            })),
          };

          const formattedOnlineOrder: OnlineOrder = {
            id: createdOrder.id,
            orderNumber: createdOrder.orderNumber || orderNum,
            source: 'digital_menu',
            orderType: orderMode as any,
            floor: selectedTable?.floor,
            tableId: selectedTable?.id,
            tableName: orderPayload.tableName,
            customer: {
              name: customerName.trim(),
              phone: customerPhone.trim(),
              address: deliveryAddress.trim(),
            },
            paymentMethod: paymentMethod || 'pay_at_counter',
            items: cart.map((c) => ({
              id: c.item.id,
              name: c.portionLabel ? `${c.item.name} (${c.portionLabel})` : c.item.name,
              unitPrice: c.unitPrice,
              price: c.unitPrice,
              qty: c.qty,
              quantity: c.qty,
              totalPrice: c.unitPrice * c.qty,
              notes: c.notes,
              station: c.item.station || 'main',
            })),
            subtotal,
            deliveryFee,
            tax,
            total: grandTotal,
            status: 'PENDING',
          };

          const storeOnlineOrders = useRestaurantStore.getState().onlineOrders || [];
          useRestaurantStore.getState().syncFromServer({
            onlineOrders: [formattedOnlineOrder, ...storeOnlineOrders.filter(o => o.id !== formattedOnlineOrder.id)],
            ...(orderMode === 'dine_in' ? {
              pendingFloorOrderAlert: {
                id: `alert-${Date.now()}`,
                orderId: createdOrder.id,
                orderNumber: createdOrder.orderNumber || orderNum,
                floor: selectedTable?.floor || 'Ground Floor',
                tableId: selectedTable?.id || '1',
                tableName: orderPayload.tableName || 'Table',
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                total: grandTotal,
                itemsCount: cart.length,
                itemsSummary: cart.map(c => `${c.qty}x ${c.item.name}`).join(', '),
                time: Date.now(),
              }
            } : {})
          });
          syncFromServer({
            tickets: [newTicket, ...(useRestaurantStore.getState().tickets || [])],
          });
        } catch {
          // ticket sync handled
        }
      }

      try {
        broadcastImmediately();
      } catch {
        // sync broadcast handled
      }

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
      setTimeout(() => {
        isSubmittingOrderRef.current = false;
      }, 1500);
    }
  };

  // Status Stepper Helper
  const getProgressStage = (status: string) => {
    switch (status) {
      case 'PENDING':
        return {
          step: 1,
          percent: '20%',
          label: 'Order Received',
          desc: 'Sent to Sultan Front Desk',
        };
      case 'CONFIRMED':
        return {
          step: 2,
          percent: '45%',
          label: 'Order Confirmed',
          desc: 'Sent to Royal Kitchen',
        };
      case 'PREPARING':
        return {
          step: 3,
          percent: '70%',
          label: 'Cooking in Kitchen',
          desc: 'Chefs are preparing your dishes',
        };
      case 'READY':
      case 'READY_FOR_PICKUP':
        return {
          step: 4,
          percent: '88%',
          label: 'Food Ready',
          desc: 'Ready for table serving / rider',
        };
      case 'OUT_FOR_DELIVERY':
        return {
          step: 4,
          percent: '90%',
          label: 'Out for Delivery',
          desc: 'Rider is on the way',
        };
      case 'DELIVERED':
      case 'SERVED':
        return {
          step: 5,
          percent: '100%',
          label: 'Delivered / Served',
          desc: 'Enjoy your Sultan meal!',
        };
      case 'CANCELLED':
        return {
          step: 0,
          percent: '0%',
          label: 'Order Cancelled',
          desc: 'Order was rejected or cancelled',
        };
      default:
        return {
          step: 1,
          percent: '20%',
          label: status,
          desc: 'Processing your order',
        };
    }
  };

  // Render Horizontal Dish Card (used in Swipe Rows mode)
  const renderGalleryItemCard = (item: MenuItem, cardKey?: string) => {
    const isSoldOut = isItemSoldOut(item);
    const inCartQty = getItemCartQty(item.id);
    const isItemInCart = inCartQty > 0;
    const cardWidth = isDesktop ? 276 : isTablet ? 240 : 210;
    const dishImg = resolveMenuImageUri(item);

    const lowerName = item.name.toLowerCase();
    const hasVariants = Boolean(item.variants && item.variants.length > 0);
    const isWeightDish =
      !hasVariants &&
      (lowerName.includes('karahi') ||
        lowerName.includes('handi') ||
        lowerName.includes('sajji') ||
        lowerName.includes('kg'));

    return (
      <TouchableOpacity
        key={cardKey || item.id}
        style={[
          styles.galleryDishCard,
          { width: cardWidth },
          isItemInCart && styles.galleryDishCardInCart,
          isSoldOut && { opacity: 0.6 },
        ]}
        {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
        onPress={() => handleOpenCustomizer(item)}
        activeOpacity={0.88}
        disabled={isSoldOut}
      >
        {/* Top: Full-bleed Appetizing Dish Photo */}
        <View style={styles.galleryCardImageWrapper}>
          {dishImg ? (
            <Image
              source={{ uri: dishImg }}
              style={styles.dishCardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.dishCardPlaceholderBox}>
              <Ionicons
                name={item.isDeal ? 'gift' : 'restaurant-outline'}
                size={32}
                color="#C89B3C"
              />
            </View>
          )}

          {/* Single Clean Badge Top-Left (only when Chef Special / Popular / Deal) */}
          {item.badge ? (
            <View style={styles.dishCardBadgeTopLeft}>
              <Text style={styles.dishCardBadgeText} numberOfLines={1}>
                {item.badge}
              </Text>
            </View>
          ) : item.isDeal ? (
            <View style={[styles.dishCardBadgeTopLeft, { backgroundColor: '#7C3AED' }]}>
              <Text style={[styles.dishCardBadgeText, { color: '#FFF' }]} numberOfLines={1}>
                DEAL
              </Text>
            </View>
          ) : null}

          {/* Floating In-Cart Quantity Badge Top-Right */}
          {isItemInCart && (
            <View style={styles.inCartBadge}>
              <Ionicons name="checkmark" size={11} color="#FFFFFF" style={{ marginRight: 2 }} />
              <Text style={styles.inCartBadgeText}>{inCartQty}</Text>
            </View>
          )}

          {/* Prep Time Hint Bottom-Left */}
          {item.prepTimeMin ? (
            <View style={styles.prepTimeChip}>
              <Ionicons name="time-outline" size={10} color="#FFF" style={{ marginRight: 3 }} />
              <Text style={styles.prepTimeChipText}>{item.prepTimeMin}m</Text>
            </View>
          ) : null}

          {/* Out of Stock Overlay */}
          {isSoldOut && (
            <View style={styles.dishSoldOutOverlay}>
              <Text style={styles.dishSoldOutText}>SOLD OUT</Text>
            </View>
          )}
        </View>

        {/* Body: Left-Aligned Editorial Dish Info */}
        <View style={styles.cardBodyPadding}>
          <View style={styles.galleryDishTitleWrapper}>
            <Text style={styles.galleryDishTitle} numberOfLines={2}>
              {item.name}
            </Text>
            {item.urduName ? (
              <Text style={styles.galleryDishUrdu} numberOfLines={1}>
                {item.urduName}
              </Text>
            ) : null}
            {item.description ? (
              <Text style={styles.galleryDishDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>

          {/* Bottom: Clear Price + One-Tap Add / Inline Stepper */}
          <View style={styles.galleryCardBottomRow}>
            <View>
              {hasVariants ? (
                <Text style={styles.startingFromLabel}>
                  From ({item.variants?.length} sizes)
                </Text>
              ) : null}
              <Text style={styles.cardPriceValue}>
                Rs. {item.price.toLocaleString()}
              </Text>
            </View>

            {isItemInCart ? (
              <View style={styles.cardStepperRow}>
                <TouchableOpacity
                  style={styles.cardStepperBtnMini}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleQuickDecrease(item.id);
                  }}
                  accessibilityLabel="Decrease quantity"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="remove" size={14} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.cardStepperCount}>{inCartQty}</Text>
                <TouchableOpacity
                  style={styles.cardStepperBtnMini}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    hasVariants || isWeightDish
                      ? handleOpenCustomizer(item)
                      : handleQuickAdd(item);
                  }}
                  accessibilityLabel="Increase quantity"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="add" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.galleryQuickAddBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  hasVariants || isWeightDish
                    ? handleOpenCustomizer(item)
                    : handleQuickAdd(item);
                }}
                activeOpacity={0.82}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name={hasVariants || isWeightDish ? 'options-outline' : 'add'}
                  size={15}
                  color="#FFFFFF"
                />
                <Text style={styles.galleryQuickAddText}>
                  {hasVariants || isWeightDish ? 'Options' : 'Add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render Responsive Menu Grid Dish Card (Primary Human-Friendly Menu Card)
  const renderItemCard = (item: MenuItem) => {
    const isSoldOut = isItemSoldOut(item);
    const inCartQty = getItemCartQty(item.id);
    const isItemInCart = inCartQty > 0;
    const cardWidth =
      width >= 1560 ? '23.7%' : width >= 1180 ? '31.8%' : isTablet || isDesktop ? '48.5%' : '100%';
    const dishImg = resolveMenuImageUri(item);

    const lowerName = item.name.toLowerCase();
    const hasVariants = Boolean(item.variants && item.variants.length > 0);
    const isWeightDish =
      !hasVariants &&
      (lowerName.includes('karahi') ||
        lowerName.includes('handi') ||
        lowerName.includes('sajji') ||
        lowerName.includes('kg'));

    // Compact horizontal list-card on mobile phones (just like Uber Eats / Foodpanda!)
    if (isMobile) {
      return (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.mobileDishRowCard,
            isItemInCart && styles.dishCardInCart,
            isSoldOut && { opacity: 0.6 },
          ]}
          onPress={() => handleOpenCustomizer(item)}
          activeOpacity={0.88}
          disabled={isSoldOut}
        >
          {/* Left: Dish Details */}
          <View style={styles.mobileDishInfoCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {item.badge ? (
                <View style={styles.mobileInlineBadge}>
                  <Text style={styles.mobileInlineBadgeText}>{item.badge}</Text>
                </View>
              ) : null}
              {item.prepTimeMin ? (
                <Text style={styles.mobilePrepText}>{item.prepTimeMin} min</Text>
              ) : null}
            </View>
            <Text style={styles.mobileDishTitle} numberOfLines={2}>
              {item.name}
            </Text>
            {item.urduName ? (
              <Text style={styles.dishCardUrdu} numberOfLines={1}>
                {item.urduName}
              </Text>
            ) : null}
            {item.description ? (
              <Text style={styles.mobileDishDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <View style={styles.mobileDishPriceRow}>
              <Text style={styles.cardPriceValue}>
                Rs. {item.price.toLocaleString()}
              </Text>
              {hasVariants ? (
                <Text style={styles.mobileVariantTag}>
                  • {item.variants?.length} sizes
                </Text>
              ) : null}
            </View>
          </View>

          {/* Right: Crisp Square Food Photo + Floating Add/Stepper */}
          <View style={styles.mobileDishImgCol}>
            <View style={styles.mobileDishImgWrap}>
              {dishImg ? (
                <Image
                  source={{ uri: dishImg }}
                  style={styles.dishCardImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.dishCardPlaceholderBox}>
                  <Ionicons name="restaurant-outline" size={26} color="#C89B3C" />
                </View>
              )}
              {isSoldOut && (
                <View style={styles.dishSoldOutOverlay}>
                  <Text style={styles.dishSoldOutText}>SOLD OUT</Text>
                </View>
              )}
            </View>

            <View style={styles.mobileFloatingActionWrap}>
              {isItemInCart ? (
                <View style={styles.cardStepperRow}>
                  <TouchableOpacity
                    style={styles.cardStepperBtnMini}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleQuickDecrease(item.id);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="remove" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                  <Text style={styles.cardStepperCount}>{inCartQty}</Text>
                  <TouchableOpacity
                    style={styles.cardStepperBtnMini}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      hasVariants || isWeightDish
                        ? handleOpenCustomizer(item)
                        : handleQuickAdd(item);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.mobileAddPillBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    hasVariants || isWeightDish
                      ? handleOpenCustomizer(item)
                      : handleQuickAdd(item);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={hasVariants || isWeightDish ? 'options-outline' : 'add'}
                    size={15}
                    color="#FFFFFF"
                  />
                  <Text style={styles.galleryQuickAddText}>
                    {hasVariants || isWeightDish ? 'Choose' : 'Add'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Desktop & Tablet Editorial Food Card
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.dishCard,
          { width: cardWidth as any },
          isItemInCart && styles.dishCardInCart,
          isSoldOut && { opacity: 0.6 },
        ]}
        {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
        onPress={() => handleOpenCustomizer(item)}
        activeOpacity={0.88}
        disabled={isSoldOut}
      >
        <View style={styles.dishCardImageWrapper}>
          {dishImg ? (
            <Image
              source={{ uri: dishImg }}
              style={styles.dishCardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.dishCardPlaceholderBox}>
              <Ionicons
                name={item.isDeal ? 'gift' : 'restaurant-outline'}
                size={34}
                color="#C89B3C"
              />
            </View>
          )}

          {item.badge ? (
            <View style={styles.dishCardBadgeTopLeft}>
              <Text style={styles.dishCardBadgeText} numberOfLines={1}>
                {item.badge}
              </Text>
            </View>
          ) : item.isDeal ? (
            <View style={[styles.dishCardBadgeTopLeft, { backgroundColor: '#7C3AED' }]}>
              <Text style={[styles.dishCardBadgeText, { color: '#FFF' }]} numberOfLines={1}>
                DEAL
              </Text>
            </View>
          ) : null}

          {isItemInCart && (
            <View style={styles.inCartBadge}>
              <Ionicons name="checkmark" size={11} color="#FFFFFF" style={{ marginRight: 2 }} />
              <Text style={styles.inCartBadgeText}>{inCartQty}</Text>
            </View>
          )}

          {item.prepTimeMin ? (
            <View style={styles.prepTimeChip}>
              <Ionicons name="time-outline" size={10} color="#FFF" style={{ marginRight: 3 }} />
              <Text style={styles.prepTimeChipText}>{item.prepTimeMin}m</Text>
            </View>
          ) : null}

          {isSoldOut && (
            <View style={styles.dishSoldOutOverlay}>
              <Text style={styles.dishSoldOutText}>SOLD OUT</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBodyPadding}>
          <View style={styles.dishCardDetails}>
            <Text style={styles.dishCardTitle} numberOfLines={2}>
              {item.name}
            </Text>
            {item.urduName ? (
              <Text style={styles.dishCardUrdu} numberOfLines={1}>
                {item.urduName}
              </Text>
            ) : null}
            {item.description ? (
              <Text style={styles.dishCardDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>

          <View style={styles.dishCardBottom}>
            <View>
              {hasVariants ? (
                <Text style={styles.startingFromLabel}>
                  From • {item.variants?.length} sizes
                </Text>
              ) : null}
              <Text style={styles.cardPriceValue}>
                Rs. {item.price.toLocaleString()}
              </Text>
            </View>

            {isItemInCart ? (
              <View style={styles.cardStepperRow}>
                <TouchableOpacity
                  style={styles.cardStepperBtnMini}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleQuickDecrease(item.id);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="remove" size={14} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.cardStepperCount}>{inCartQty}</Text>
                <TouchableOpacity
                  style={styles.cardStepperBtnMini}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    hasVariants || isWeightDish
                      ? handleOpenCustomizer(item)
                      : handleQuickAdd(item);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="add" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.galleryQuickAddBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  hasVariants || isWeightDish
                    ? handleOpenCustomizer(item)
                    : handleQuickAdd(item);
                }}
                activeOpacity={0.82}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name={hasVariants || isWeightDish ? 'options-outline' : 'add'}
                  size={15}
                  color="#FFFFFF"
                />
                <Text style={styles.galleryQuickAddText}>
                  {hasVariants || isWeightDish ? 'Options' : 'Add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (systemSettings.enableDigitalQrMenu === false) {
    return (
      <SafeAreaView style={[styles.safeContainer, { alignItems: 'center', justifyContent: 'center', padding: 24 }]} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="qr-code-outline" size={58} color="#D4AF37" style={{ marginBottom: 14 }} />
        <Text style={{ fontSize: 21, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 }}>
          Digital QR Menu Offline
        </Text>
        <Text style={{ fontSize: 13.5, color: '#CBD5E1', textAlign: 'center', maxWidth: 420, marginBottom: 22 }}>
          Customer Digital QR Menu is currently disabled in System Settings. Please ask your waiter for assistance.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#D4AF37', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 }}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Text style={{ fontWeight: '800', color: '#140306' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.screenWrapper}>
        <ScrollView
          ref={mainScrollRef}
          style={styles.mainScrollView}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[2]}
          onScroll={(e) => {
            scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}
        >
          {/* ========================================================
              1. SLEEK LUXURY HOSPITALITY HEADER (Balanced 3-Zone Navbar)
             ======================================================== */}
          <View style={styles.heroBanner}>
            {width >= 1080 ? (
              /* DESKTOP & WIDE TABLET: Single Cohesive 3-Zone Top Navbar */
              <View style={styles.desktopHeaderBar}>
                {/* Left Zone: Back + Brand Identity */}
                <View style={styles.headerBrandCluster}>
                  <TouchableOpacity
                    style={styles.heroNavBtn}
                    onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                    activeOpacity={0.8}
                    accessibilityLabel="Go back"
                  >
                    <Ionicons name="arrow-back" size={17} color="#F3D179" />
                  </TouchableOpacity>
                  <View style={styles.headerLogoRing}>
                    <SultanLogo size="sm" width={34} height={30} />
                  </View>
                  <View>
                    <Text style={styles.heroMainTitleMini}>SULTAN RESTAURANT</Text>
                    <Text style={styles.heroSubtitleUrduMini}>
                      سلطان ریستوراں • شاہی دسترخوان
                    </Text>
                  </View>
                </View>

                {/* Center Zone: Unified Dining Mode + Table Capsule (Law of Proximity) */}
                <View style={styles.headerDiningCapsule}>
                  <View style={styles.compactModeToggle}>
                    <TouchableOpacity
                      style={[
                        styles.compactModeBtn,
                        orderMode === 'dine_in' && styles.compactModeBtnActive,
                      ]}
                      onPress={() => setOrderMode('dine_in')}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="restaurant-outline"
                        size={13}
                        color={orderMode === 'dine_in' ? '#1E0408' : 'rgba(255,255,255,0.75)'}
                      />
                      <Text
                        style={[
                          styles.compactModeBtnText,
                          orderMode === 'dine_in' && styles.compactModeBtnTextActive,
                        ]}
                      >
                        Dine-In
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.compactModeBtn,
                        orderMode === 'delivery' && styles.compactModeBtnActive,
                      ]}
                      onPress={() => setOrderMode('delivery')}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="bicycle-outline"
                        size={14}
                        color={orderMode === 'delivery' ? '#1E0408' : 'rgba(255,255,255,0.75)'}
                      />
                      <Text
                        style={[
                          styles.compactModeBtnText,
                          orderMode === 'delivery' && styles.compactModeBtnTextActive,
                        ]}
                      >
                        Delivery
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.capsuleDivider} />

                  {orderMode === 'dine_in' ? (
                    <TouchableOpacity
                      style={styles.capsuleTableBtn}
                      onPress={() => setTableModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.compactTableIconBox}>
                        <Ionicons name="location-outline" size={14} color="#F3D179" />
                      </View>
                      <View>
                        <Text style={styles.compactTableSubLabel}>Dining at</Text>
                        <Text style={styles.compactTablePillText} numberOfLines={1}>
                          {selectedTable?.floor || 'Ground Floor'} •{' '}
                          {selectedTable?.name || 'Table T-01'}
                        </Text>
                      </View>
                      <View style={styles.changeTableTag}>
                        <Text style={styles.changeTableTagText}>Change</Text>
                        <Ionicons name="chevron-down" size={11} color="#F3D179" />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.capsuleDeliveryInfo}>
                      <View
                        style={[
                          styles.compactTableIconBox,
                          { backgroundColor: 'rgba(52, 211, 153, 0.16)' },
                        ]}
                      >
                        <Ionicons name="time-outline" size={14} color="#34D399" />
                      </View>
                      <View>
                        <Text style={[styles.compactTableSubLabel, { color: '#6EE7B7' }]}>
                          Express Delivery
                        </Text>
                        <Text style={styles.compactDeliveryText} numberOfLines={1}>
                          35–45 mins • Free over Rs. 2,500
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Right Zone: Track, Orders, Sound & Fullscreen (Uniform 36px height) */}
                <View style={styles.headerUtilityCluster}>
                  {activeTrackingOrder &&
                    activeTrackingOrder.status !== 'DELIVERED' &&
                    activeTrackingOrder.status !== 'SERVED' &&
                    activeTrackingOrder.status !== 'CANCELLED' && (
                      <TouchableOpacity
                        style={styles.heroTrackLivePill}
                        onPress={() => setTrackingModalVisible(true)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.livePulseDot} />
                        <Text style={styles.heroTrackLiveText}>Track Order</Text>
                      </TouchableOpacity>
                    )}

                  {orderHistory.length > 0 && (
                    <TouchableOpacity
                      style={styles.heroOrdersPill}
                      onPress={() => setHistoryModalVisible(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="receipt-outline" size={14} color="#F3D179" />
                      <Text style={styles.heroOrdersPillText}>
                        Orders ({orderHistory.length})
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.heroIconPill}
                    onPress={() => setSoundMuted(!soundMuted)}
                    accessibilityLabel={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
                    {...(Platform.OS === 'web'
                      ? ({
                          title: soundMuted
                            ? 'Sound Muted — Click to unmute'
                            : 'Sound On — Click to mute',
                        } as any)
                      : {})}
                  >
                    <Ionicons
                      name={soundMuted ? 'volume-mute-outline' : 'volume-medium-outline'}
                      size={16}
                      color={soundMuted ? '#F87171' : '#F3D179'}
                    />
                  </TouchableOpacity>

                  <FullscreenButton
                    variant="pill"
                    style={styles.headerFullscreenBtn}
                  />
                </View>
              </View>
            ) : (
              /* MOBILE & COMPACT TABLET: Clean Breathable 2-Row Header */
              <View style={styles.heroOverlayContent}>
                <View style={styles.heroTopActions}>
                  <View style={styles.headerBrandCluster}>
                    {!isMobile && (
                      <TouchableOpacity
                        style={styles.heroNavBtn}
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                      >
                        <Ionicons name="arrow-back" size={17} color="#F3D179" />
                      </TouchableOpacity>
                    )}
                    <View style={styles.headerLogoRing}>
                      <SultanLogo size="sm" width={32} height={28} />
                    </View>
                    <View>
                      <Text style={styles.heroMainTitleMini}>SULTAN RESTAURANT</Text>
                      <Text style={styles.heroSubtitleUrduMini}>
                        سلطان ریستوراں • شاہی دسترخوان
                      </Text>
                    </View>
                  </View>

                  <View style={styles.headerUtilityCluster}>
                    {activeTrackingOrder &&
                      activeTrackingOrder.status !== 'DELIVERED' &&
                      activeTrackingOrder.status !== 'SERVED' &&
                      activeTrackingOrder.status !== 'CANCELLED' && (
                        <TouchableOpacity
                          style={styles.heroTrackLivePill}
                          onPress={() => setTrackingModalVisible(true)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.livePulseDot} />
                          <Text style={styles.heroTrackLiveText}>Track</Text>
                        </TouchableOpacity>
                      )}

                    {orderHistory.length > 0 && (
                      <TouchableOpacity
                        style={styles.heroOrdersPill}
                        onPress={() => setHistoryModalVisible(true)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="receipt-outline" size={14} color="#F3D179" />
                        <Text style={styles.heroOrdersPillText}>{orderHistory.length}</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.heroIconPill}
                      onPress={() => setSoundMuted(!soundMuted)}
                      accessibilityLabel={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
                    >
                      <Ionicons
                        name={soundMuted ? 'volume-mute-outline' : 'volume-medium-outline'}
                        size={16}
                        color={soundMuted ? '#F87171' : '#F3D179'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.compactDiningBar}>
                  <View style={styles.compactModeToggle}>
                    <TouchableOpacity
                      style={[
                        styles.compactModeBtn,
                        orderMode === 'dine_in' && styles.compactModeBtnActive,
                      ]}
                      onPress={() => setOrderMode('dine_in')}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.compactModeBtnText,
                          orderMode === 'dine_in' && styles.compactModeBtnTextActive,
                        ]}
                      >
                        Dine-In
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.compactModeBtn,
                        orderMode === 'delivery' && styles.compactModeBtnActive,
                      ]}
                      onPress={() => setOrderMode('delivery')}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.compactModeBtnText,
                          orderMode === 'delivery' && styles.compactModeBtnTextActive,
                        ]}
                      >
                        Delivery
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {orderMode === 'dine_in' ? (
                    <TouchableOpacity
                      style={styles.mobileTableSelectChip}
                      onPress={() => setTableModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="location-outline" size={14} color="#F3D179" />
                      <Text style={styles.compactTablePillText} numberOfLines={1}>
                        {selectedTable?.name || 'T-01'} • {selectedTable?.floor || 'Ground'}
                      </Text>
                      <Ionicons name="chevron-down" size={13} color="#F3D179" />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.mobileDeliveryChip}>
                      <Ionicons name="bicycle-outline" size={14} color="#34D399" />
                      <Text style={styles.compactDeliveryText} numberOfLines={1}>
                        35–45m • Free 2.5k+
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* ========================================================
              2. SEARCH & QUICK HUMAN DISCOVERY CHIPS
             ======================================================== */}
          <View style={styles.filterSectionContainer}>
            <View style={styles.filterConsoleCard}>
              {/* Search Bar + Quick Discovery Filter Chips */}
              <View style={[styles.searchRow, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={styles.searchBar}>
                  <Ionicons
                    name="search"
                    size={19}
                    color="#8C6B4A"
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="What are you craving? Search karahi, BBQ, pizza, desserts, drinks..."
                    placeholderTextColor="#9A8F86"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery ? (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#786A5E" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Quick Human Discovery Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={!isMobile ? { flexGrow: 0, flexShrink: 1 } : undefined}
                  contentContainerStyle={styles.discoveryChipsRow}
                >
                  {[
                    { id: 'all', label: 'All Dishes', icon: 'apps-outline' },
                    { id: 'specials', label: 'Chef Specials', icon: 'star-outline' },
                    { id: 'spicy', label: 'BBQ & Spicy', icon: 'flame-outline' },
                    { id: 'sharing', label: 'Sharing & Platters', icon: 'people-outline' },
                    { id: 'under600', label: 'Under Rs. 600', icon: 'pricetag-outline' },
                  ].map((chip) => {
                    const isActive = dietaryFilter === chip.id;
                    return (
                      <TouchableOpacity
                        key={chip.id}
                        style={[styles.discoveryChip, isActive && styles.discoveryChipActive]}
                        onPress={() => setDietaryFilter(chip.id as any)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={chip.icon as any}
                          size={13}
                          color={isActive ? '#FFFFFF' : '#52171B'}
                        />
                        <Text
                          style={[
                            styles.discoveryChipText,
                            isActive && styles.discoveryChipTextActive,
                          ]}
                        >
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>

          {/* ========================================================
              2B. STICKY CATEGORY JUMP BAR (Pinned While Browsing!)
             ======================================================== */}
          <View style={styles.stickyCategoryBarWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stickyCategoryScroll}
            >
              {categoryTabs.map((cat) => {
                const isActive = activeCat.toLowerCase() === cat.toLowerCase();
                const count = categoryCounts[cat] || 0;
                if (cat !== 'All' && count === 0) return null;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.prominentCatTab,
                      isActive && styles.prominentCatTabActive,
                    ]}
                    onPress={() => handleSelectCategory(cat)}
                    activeOpacity={0.82}
                  >
                    <Ionicons
                      name={getCategoryIcon(cat)}
                      size={15}
                      color={isActive ? '#F3D179' : '#52171B'}
                    />
                    <Text
                      style={[
                        styles.prominentCatText,
                        isActive && styles.prominentCatTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                    <View
                      style={[
                        styles.prominentCatCount,
                        isActive && styles.prominentCatCountActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.prominentCatCountText,
                          isActive && styles.prominentCatCountTextActive,
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

          {/* ========================================================
              3. MAIN CONTENT: DISHES FEED & STICKY ORDER SUMMARY
             ======================================================== */}
          <View
            style={styles.contentLayoutContainer}
            onLayout={(e) => {
              menuTopYRef.current = e.nativeEvent.layout.y;
            }}
          >

            {/* Center Dishes Feed */}
            <View style={styles.dishesFeedContainer}>
              <View style={styles.dishesHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.categoryHeading}>
                    {searchQuery.trim()
                      ? `Search Results for "${searchQuery.trim()}"`
                      : activeCat === 'All'
                        ? 'Explore Our Menu'
                        : activeCat}
                  </Text>
                  <Text style={styles.categorySubheading}>
                    {activeCat !== 'All'
                      ? `${getCategoryUrduOrTagline(activeCat)} • ${filteredItems.length} dishes`
                      : `${filteredItems.length} freshly prepared dishes • Tap any dish for details & options`}
                  </Text>
                </View>

                {/* Right controls: Calm View Toggle (Menu Grid vs Swipe Rows) & Reset */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {activeCat === 'All' && !searchQuery.trim() && (
                    <View style={styles.viewModeToggleWrap}>
                      <TouchableOpacity
                        style={[
                          styles.viewModeToggleBtn,
                          viewMode === 'grid' && styles.viewModeToggleBtnActive,
                        ]}
                        onPress={() => setViewMode('grid')}
                        activeOpacity={0.8}
                        accessibilityLabel="Organized Menu Grid"
                      >
                        <Ionicons
                          name="grid-outline"
                          size={14}
                          color={viewMode === 'grid' ? '#4A1018' : '#78716C'}
                        />
                        <Text
                          style={[
                            styles.viewModeToggleText,
                            viewMode === 'grid' && styles.viewModeToggleTextActive,
                          ]}
                        >
                          Menu Grid
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.viewModeToggleBtn,
                          viewMode === 'gallery' && styles.viewModeToggleBtnActive,
                        ]}
                        onPress={() => setViewMode('gallery')}
                        activeOpacity={0.8}
                        accessibilityLabel="Swipeable Category Rows"
                      >
                        <Ionicons
                          name="albums-outline"
                          size={14}
                          color={viewMode === 'gallery' ? '#4A1018' : '#78716C'}
                        />
                        <Text
                          style={[
                            styles.viewModeToggleText,
                            viewMode === 'gallery' && styles.viewModeToggleTextActive,
                          ]}
                        >
                          Swipe Rows
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {(activeCat !== 'All' ||
                    activeRegion !== 'ALL' ||
                    searchQuery ||
                    dietaryFilter !== 'all') && (
                      <TouchableOpacity
                        style={styles.activeFilterResetBtn}
                        onPress={() => {
                          setActiveCat('All');
                          setActiveRegion('ALL');
                          setSearchQuery('');
                          setDietaryFilter('all');
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="refresh"
                          size={13}
                          color="#52171B"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.activeFilterResetText}>Reset</Text>
                      </TouchableOpacity>
                    )}
                </View>
              </View>

              {/* Center Content Body */}
              {filteredItems.length === 0 ? (
                <View style={styles.emptyStateBox}>
                  <Ionicons name="search-outline" size={48} color="#C89B3C" />
                  <Text style={styles.emptyStateTitle}>No matching dishes found</Text>
                  <Text style={styles.emptyStateDesc}>
                    Try another keyword or clear your filters to browse our full menu.
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
                    <Text style={styles.clearSearchBtnText}>Show Full Menu</Text>
                  </TouchableOpacity>
                </View>
              ) : activeCat === 'All' && !searchQuery.trim() && viewMode === 'gallery' ? (
                /* Calm User-Controlled Horizontal Swipe Rows */
                <View style={styles.catGalleriesContainer}>
                  {groupedCategoryGalleries.map(({ category, items }) => (
                    <AutoCategorySlider
                      key={category}
                      category={category}
                      items={items}
                      onViewAll={handleSelectCategory}
                      renderCard={renderGalleryItemCard}
                      isDesktop={isDesktop}
                      isTablet={isTablet}
                      getIcon={getCategoryIcon}
                      getUrdu={getCategoryUrduOrTagline}
                    />
                  ))}
                </View>
              ) : activeCat === 'All' && !searchQuery.trim() ? (
                /* DEFAULT: Clean Organized Category Sections Grid (Human-Friendly Menu) */
                <View style={styles.menuSectionsStack}>
                  {groupedCategoryGalleries.map(({ category, items }) => (
                    <View key={category} style={styles.menuCategorySection}>
                      <View style={styles.menuCategorySectionHeader}>
                        <View style={styles.menuCategorySectionIcon}>
                          <Ionicons name={getCategoryIcon(category)} size={18} color="#C89B3C" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.menuCategorySectionTitle}>{category}</Text>
                            <View style={styles.menuCategoryCountPill}>
                              <Text style={styles.menuCategoryCountText}>{items.length}</Text>
                            </View>
                          </View>
                          <Text style={styles.menuCategorySectionSub} numberOfLines={1}>
                            {getCategoryUrduOrTagline(category)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.dishesGrid}>
                        {items.map(renderItemCard)}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.dishesGrid}>{filteredItems.map(renderItemCard)}</View>
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
                      <Text style={styles.cartItemCountTagText}>
                        {totalCartCount} items
                      </Text>
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
                    <View style={styles.emptyTrayIconCircle}>
                      <Ionicons name="bag-outline" size={28} color="#C89B3C" />
                    </View>
                    <Text style={styles.emptyTrayTitle}>Your order is empty</Text>
                    <Text style={styles.emptyTrayDesc}>
                      Tap any dish to view ingredients & options, or click Add for instant ordering.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cartPanelBody}>
                    {orderMode === 'delivery' && subtotal < 2500 && (
                      <View style={styles.freeDeliveryHint}>
                        <Ionicons name="bicycle-outline" size={14} color="#047857" />
                        <Text style={styles.freeDeliveryHintText}>
                          Add Rs. {(2500 - subtotal).toLocaleString()} more for FREE delivery
                        </Text>
                      </View>
                    )}

                    <ScrollView
                      style={{ maxHeight: 350 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {cart.map((c) => {
                        const thumb = resolveMenuImageUri(c.item);
                        return (
                          <View key={c.cartId} style={styles.trayItemRow}>
                            {thumb ? (
                              <Image
                                source={{ uri: thumb }}
                                style={styles.trayItemThumb}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={styles.trayItemThumbFallback}>
                                <Ionicons name="restaurant-outline" size={16} color="#C89B3C" />
                              </View>
                            )}
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={styles.trayItemName} numberOfLines={1}>
                                {c.item.name}
                              </Text>
                              {c.portionLabel ? (
                                <Text style={styles.trayItemSub} numberOfLines={1}>{c.portionLabel}</Text>
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
                                <Ionicons name="remove" size={13} color="#3A0F12" />
                              </TouchableOpacity>
                              <Text style={styles.trayStepperQty}>{c.qty}</Text>
                              <TouchableOpacity
                                style={styles.trayStepperBtn}
                                onPress={() => updateCartQty(c.cartId, 1)}
                              >
                                <Ionicons name="add" size={13} color="#3A0F12" />
                              </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                              style={styles.trayItemRemoveBtn}
                              onPress={() => handleRemoveCartItem(c.cartId)}
                            >
                              <Ionicons name="close" size={14} color="#9CA3AF" />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>

                    {/* Bill Summary */}
                    <View style={styles.traySummaryCard}>
                      <View style={styles.traySummaryRow}>
                        <Text style={styles.summaryLabel}>Subtotal</Text>
                        <Text style={styles.summaryVal}>
                          Rs. {subtotal.toLocaleString()}
                        </Text>
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
                        <Text style={styles.grandVal}>
                          Rs. {grandTotal.toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {/* Checkout Button */}
                    <TouchableOpacity
                      style={styles.trayCheckoutBtn}
                      onPress={() => setCartModalVisible(true)}
                    >
                      <Text style={styles.trayCheckoutBtnText}>
                        Proceed to Checkout
                      </Text>
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
            4. MOBILE & TABLET FLOATING CART BAR
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
                <Text style={styles.floatingCartTotal}>
                  Rs. {grandTotal.toLocaleString()}
                </Text>
                <View style={styles.floatingCartActionPill}>
                  <Text style={styles.floatingCartActionPillText}>View Tray</Text>
                  <Ionicons name="arrow-forward" size={14} color="#3A0F12" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}
        {/* Instant Add-to-Order Confirmation Toast */}
        {cartToast && (
          <View style={[styles.cartToastContainer, !isDesktop && cart.length > 0 && { bottom: 92 }]}>
            <TouchableOpacity
              style={styles.cartToastPill}
              onPress={() => {
                setCartToast(null);
                setCartModalVisible(true);
              }}
              activeOpacity={0.9}
            >
              <View style={styles.cartToastIcon}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartToastTitle} numberOfLines={1}>{cartToast.title}</Text>
                {cartToast.subtitle ? (
                  <Text style={styles.cartToastSub}>{cartToast.subtitle} • Tap to view order</Text>
                ) : null}
              </View>
              <Text style={styles.cartToastCta}>View</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ========================================================
          MODAL 1: RICH DISH DETAILS & SMART CUSTOMIZER
         ======================================================== */}
      <Modal
        visible={!!customizerItem}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomizerItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCustomizerItem(null)}>
          <Pressable
            style={[styles.customizerModalCard, { padding: 0, overflow: 'hidden' }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Full-Bleed Dish Hero Image */}
            <View style={styles.customizerHeroWrap}>
              {resolveMenuImageUri(customizerItem) ? (
                <Image
                  source={{ uri: resolveMenuImageUri(customizerItem)! }}
                  style={styles.dishCardImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.dishCardPlaceholderBox}>
                  <Ionicons name="restaurant-outline" size={44} color="#C89B3C" />
                </View>
              )}

              {customizerItem?.badge ? (
                <View style={styles.dishCardBadgeTopLeft}>
                  <Text style={styles.dishCardBadgeText}>{customizerItem.badge}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.customizerHeroCloseBtn}
                onPress={() => setCustomizerItem(null)}
                accessibilityLabel="Close dish details"
              >
                <Ionicons name="close" size={20} color="#1C1917" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 18 }}>
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={[styles.customizerModalTitle, { flex: 1 }]}>
                    {customizerItem?.name}
                  </Text>
                  <Text style={styles.customizerHeroPrice}>
                    Rs. {customizerUnitPrice.toLocaleString()}
                  </Text>
                </View>
                {customizerItem?.urduName ? (
                  <Text style={styles.customizerModalUrduTitle}>
                    {customizerItem.urduName}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <Text style={styles.customizerModalCat}>
                    {customizerItem?.category}
                  </Text>
                  {customizerItem?.prepTimeMin ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="time-outline" size={12} color="#8C6B4A" />
                      <Text style={styles.customizerModalCat}>~{customizerItem.prepTimeMin} mins</Text>
                    </View>
                  ) : null}
                </View>
                {customizerItem?.description ? (
                  <Text style={styles.customizerFullDesc}>
                    {customizerItem.description}
                  </Text>
                ) : null}
              </View>

              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {/* Variants */}
                {customizerItem?.variants && customizerItem.variants.length > 0 ? (
                  <View style={styles.customizerSection}>
                    <Text style={styles.sectionLabel}>Choose Size / Portion</Text>
                    <View style={styles.optionsWrap}>
                      {customizerItem.variants.map((v) => (
                        <TouchableOpacity
                          key={v.name}
                          style={[
                            styles.optionPill,
                            selectedVariant === v.name && styles.optionPillActive,
                          ]}
                          onPress={() => setSelectedVariant(v.name)}
                        >
                          <Text
                            style={[
                              styles.optionPillText,
                              selectedVariant === v.name && styles.optionPillTextActive,
                            ]}
                          >
                            {v.name}
                          </Text>
                          <Text
                            style={[
                              styles.optionPillPrice,
                              selectedVariant === v.name && styles.optionPillPriceActive,
                            ]}
                          >
                            Rs. {v.price.toLocaleString()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : customizerItem?.name.toLowerCase().includes('karahi') ||
                  customizerItem?.name.toLowerCase().includes('handi') ? (
                  <View style={styles.customizerSection}>
                    <Text style={styles.sectionLabel}>Choose Weight / Portion</Text>
                    <View style={styles.optionsWrap}>
                      {[
                        { kg: 0.25, label: 'Quarter (0.25 kg)' },
                        { kg: 0.5, label: 'Half (0.5 kg)' },
                        { kg: 1.0, label: 'Full (1.0 kg)' },
                        { kg: 2.0, label: 'Family (2.0 kg)' },
                      ].map((w) => (
                        <TouchableOpacity
                          key={w.kg}
                          style={[
                            styles.optionPill,
                            weightKg === w.kg && styles.optionPillActive,
                          ]}
                          onPress={() => setWeightKg(w.kg)}
                        >
                          <Text
                            style={[
                              styles.optionPillText,
                              weightKg === w.kg && styles.optionPillTextActive,
                            ]}
                          >
                            {w.label}
                          </Text>
                          <Text
                            style={[
                              styles.optionPillPrice,
                              weightKg === w.kg && styles.optionPillPriceActive,
                            ]}
                          >
                            Rs.{' '}
                            {Math.round(
                              (customizerItem?.price || 0) * w.kg
                            ).toLocaleString()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Contextual Spice Level (Only shown for savory dishes — never on desserts/drinks!) */}
                {shouldShowSpiceOption(customizerItem) && (
                  <View style={styles.customizerSection}>
                    <Text style={styles.sectionLabel}>Spice Preference</Text>
                    <View style={styles.optionsWrap}>
                      {(['Mild', 'Medium', 'Spicy', 'Extra Hot'] as const).map((sp) => (
                        <TouchableOpacity
                          key={sp}
                          style={[
                            styles.optionPill,
                            spiceLevel === sp && styles.optionPillActive,
                          ]}
                          onPress={() => setSpiceLevel(sp)}
                        >
                          <Text
                            style={[
                              styles.optionPillText,
                              spiceLevel === sp && styles.optionPillTextActive,
                            ]}
                          >
                            {sp}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Cooking Notes */}
                <View style={styles.customizerSection}>
                  <Text style={styles.sectionLabel}>Special Instructions (Optional)</Text>
                  <TextInput
                    style={styles.customizerNotesInput}
                    placeholder="e.g. Less oil, no onions, extra crispy, less sugar..."
                    placeholderTextColor="#9A8F86"
                    value={customizerNotes}
                    onChangeText={setCustomizerNotes}
                  />
                </View>
              </ScrollView>

              {/* Customizer Actions with Live Calculated Total */}
              <View style={styles.customizerActionRow}>
                <View style={styles.modalStepper}>
                  <TouchableOpacity
                    style={styles.modalStepperBtn}
                    onPress={() => setCustomizerQty(Math.max(1, customizerQty - 1))}
                  >
                    <Ionicons name="remove" size={17} color="#3A0F12" />
                  </TouchableOpacity>
                  <Text style={styles.modalStepperQty}>{customizerQty}</Text>
                  <TouchableOpacity
                    style={styles.modalStepperBtn}
                    onPress={() => setCustomizerQty(customizerQty + 1)}
                  >
                    <Ionicons name="add" size={17} color="#3A0F12" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.addCustomizerBtn}
                  onPress={handleAddFromCustomizer}
                  activeOpacity={0.88}
                >
                  <Text style={styles.addCustomizerBtnText}>
                    Add to Order • Rs. {(customizerUnitPrice * customizerQty).toLocaleString()}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ========================================================
          MODAL 2: FULL CART CHECKOUT MODAL
         ======================================================== */}
      <Modal
        visible={cartModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!submittingOrder) setCartModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!submittingOrder) setCartModalVisible(false);
          }}
        >
          <Pressable
            style={[styles.customizerModalCard, { maxHeight: '90%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>
                  {orderMode === 'dine_in' ? 'Table Dining Tray' : 'Delivery Checkout'}
                </Text>
                <Text style={styles.customizerModalCat}>
                  {orderMode === 'dine_in'
                    ? `${selectedTable?.floor || 'Ground'} • ${selectedTable?.name || 'Table'}`
                    : 'Sultan Express Delivery'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCartModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Order Items List */}
              <View style={styles.checkoutItemsList}>
                {cart.map((c) => {
                  const thumb = resolveMenuImageUri(c.item);
                  return (
                    <View key={c.cartId} style={styles.checkoutItemRow}>
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.trayItemThumb}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.checkoutItemName}>{c.item.name}</Text>
                        {c.portionLabel ? (
                          <Text style={styles.checkoutItemSub}>{c.portionLabel}</Text>
                        ) : null}
                        {c.notes ? (
                          <Text style={styles.checkoutItemNotes}>{c.notes}</Text>
                        ) : null}
                        <Text style={styles.checkoutItemPrice}>
                          Rs. {(c.unitPrice * c.qty).toLocaleString()}
                        </Text>
                      </View>

                      <View style={styles.trayStepper}>
                        <TouchableOpacity
                          style={styles.trayStepperBtn}
                          onPress={() => updateCartQty(c.cartId, -1)}
                        >
                          <Ionicons name="remove" size={13} color="#3A0F12" />
                        </TouchableOpacity>
                        <Text style={styles.trayStepperQty}>{c.qty}</Text>
                        <TouchableOpacity
                          style={styles.trayStepperBtn}
                          onPress={() => updateCartQty(c.cartId, 1)}
                        >
                          <Ionicons name="add" size={13} color="#3A0F12" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Guest Profile Inputs */}
              <View style={styles.checkoutSection}>
                <Text style={styles.sectionLabel}>Diner Details:</Text>
                <TextInput
                  style={styles.checkoutInput}
                  placeholder="Full Name (مثلاً: جنید احسان)"
                  placeholderTextColor="#999"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <TextInput
                  style={styles.checkoutInput}
                  placeholder="Phone Number (0300-1234567)"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                />
                {orderMode === 'delivery' && (
                  <TextInput
                    style={[styles.checkoutInput, { height: 60 }]}
                    placeholder="Complete Delivery Address (گھر کا پتہ اور قریبی نشان)"
                    placeholderTextColor="#999"
                    multiline
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                  />
                )}
              </View>

              {/* Payment Method Selector */}
              <View style={styles.checkoutSection}>
                <Text style={styles.sectionLabel}>Payment Preference:</Text>
                <View style={styles.optionsWrap}>
                  {[
                    { id: 'cash_on_delivery', label: 'Cash on Serving/Delivery' },
                    { id: 'card', label: 'Credit/Debit Card' },
                    { id: 'jazzcash', label: 'JazzCash' },
                    { id: 'easypaisa', label: 'EasyPaisa' },
                  ].map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.optionPill,
                        paymentMethod === p.id && styles.optionPillActive,
                      ]}
                      onPress={() => setPaymentMethod(p.id as any)}
                    >
                      <Text
                        style={[
                          styles.optionPillText,
                          paymentMethod === p.id && styles.optionPillTextActive,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Bill Breakdown */}
              <View style={styles.traySummaryCard}>
                <View style={styles.traySummaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryVal}>Rs. {subtotal.toLocaleString()}</Text>
                </View>
                {deliveryFee > 0 && (
                  <View style={styles.traySummaryRow}>
                    <Text style={styles.summaryLabel}>Delivery Fee</Text>
                    <Text style={styles.summaryVal}>Rs. {deliveryFee}</Text>
                  </View>
                )}
                <View style={styles.traySummaryRow}>
                  <Text style={styles.summaryLabel}>GST (5%)</Text>
                  <Text style={styles.summaryVal}>Rs. {tax.toLocaleString()}</Text>
                </View>
                <View style={styles.trayDivider} />
                <View style={styles.traySummaryRow}>
                  <Text style={styles.grandLabel}>Total Bill</Text>
                  <Text style={styles.grandVal}>Rs. {grandTotal.toLocaleString()}</Text>
                </View>
              </View>
            </ScrollView>

            {/* Confirm Button */}
            <TouchableOpacity
              style={[
                styles.confirmOrderBtn,
                submittingOrder && { opacity: 0.65 },
              ]}
              onPress={handlePlaceOrder}
              disabled={submittingOrder}
            >
              {submittingOrder ? (
                <ActivityIndicator color="#3A0F12" />
              ) : (
                <>
                  <Text style={styles.confirmOrderBtnText}>
                    Confirm & Send to Royal Kitchen
                  </Text>
                  <Ionicons name="restaurant" size={18} color="#3A0F12" />
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ========================================================
          MODAL 3: TABLE SELECTOR MODAL
         ======================================================== */}
      <Modal
        visible={tableModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTableModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setTableModalVisible(false)}>
          <Pressable
            style={[styles.customizerModalCard, { maxHeight: '82%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>Select Your Table</Text>
                <Text style={styles.customizerModalCat}>
                  Pick your seating table for direct KDS dispatch
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTableModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Floor Tabs */}
            <View style={styles.floorTabsRow}>
              {['Ground Floor', '1st Floor', '2nd Floor', 'Rooftop'].map((fl) => (
                <TouchableOpacity
                  key={fl}
                  style={[
                    styles.floorTabBtn,
                    activeFloorFilter === fl && styles.floorTabBtnActive,
                  ]}
                  onPress={() => setActiveFloorFilter(fl)}
                >
                  <Text
                    style={[
                      styles.floorTabBtnText,
                      activeFloorFilter === fl && styles.floorTabBtnTextActive,
                    ]}
                  >
                    {fl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.tablesGrid}>
                {tables
                  .filter(
                    (t) => (t.floor || 'Ground Floor') === activeFloorFilter
                  )
                  .map((t) => {
                    const isSelected = selectedTable?.id === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.tableCard,
                          isSelected && styles.tableCardSelected,
                        ]}
                        onPress={() => {
                          setSelectedTable({
                            id: t.id,
                            name: t.name,
                            floor: t.floor || activeFloorFilter,
                          });
                          setTableModalVisible(false);
                        }}
                      >
                        <Ionicons
                          name="grid"
                          size={18}
                          color={isSelected ? '#52171B' : '#D5A943'}
                        />
                        <Text
                          style={[
                            styles.tableCardName,
                            isSelected && styles.tableCardNameSelected,
                          ]}
                        >
                          {t.name}
                        </Text>
                        <Text style={styles.tableCardSeats}>
                          {t.seats || 4} Seats
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ========================================================
          MODAL 4: LIVE ORDER TRACKER MODAL
         ======================================================== */}
      <Modal
        visible={trackingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTrackingModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setTrackingModalVisible(false)}>
          <Pressable
            style={[styles.customizerModalCard, { maxHeight: '86%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>
                  Live Order Tracker
                </Text>
                <Text style={styles.customizerModalCat}>
                  Order #{activeTrackingOrder?.orderNumber} • Royal Kitchen
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTrackingModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
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
                          <Text
                            style={[
                              styles.trackerMainLabel,
                              isCancelled && { color: '#D32F2F' },
                            ]}
                          >
                            {stage.label}
                          </Text>
                          <Text style={styles.trackerDescLabel}>{stage.desc}</Text>
                        </View>
                        {!isCancelled && (
                          <View style={styles.trackerTimerBadge}>
                            <Ionicons
                              name="time"
                              size={14}
                              color="#D5A943"
                              style={{ marginRight: 4 }}
                            />
                            <Text style={styles.trackerTimerText}>
                              ~{activeTrackingOrder.estimatedDeliveryMinutes || 25} Mins
                            </Text>
                          </View>
                        )}
                      </View>

                      {!isCancelled && (
                        <View style={styles.trackerProgressArea}>
                          <View style={styles.trackerProgressLineBg}>
                            <View
                              style={[
                                styles.trackerProgressLineFill,
                                { width: stage.percent as any },
                              ]}
                            />
                          </View>

                          <View style={styles.trackerStepsRow}>
                            {[
                              { step: 1, label: 'Received' },
                              { step: 2, label: 'Confirmed' },
                              { step: 3, label: 'Cooking' },
                              { step: 4, label: 'Ready' },
                              { step: 5, label: 'Served' },
                            ].map((s) => {
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
                                      <Ionicons name="checkmark" size={11} color="#FFF" />
                                    ) : (
                                      <Text
                                        style={[
                                          styles.trackerNodeNum,
                                          (isPassed || isCurrent) &&
                                          styles.trackerNodeNumActive,
                                        ]}
                                      >
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

                {/* Ordered Items List */}
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
                    <Text style={styles.billGrandLabel}>Total Paid/Due</Text>
                    <Text style={styles.billGrandVal}>
                      Rs. {activeTrackingOrder.total.toLocaleString()}
                    </Text>
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* ========================================================
          MODAL 5: CUSTOMER ORDER HISTORY
         ======================================================== */}
      <Modal
        visible={historyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setHistoryModalVisible(false)}>
          <Pressable
            style={[styles.customizerModalCard, { maxHeight: '86%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>Past Orders</Text>
                <Text style={styles.customizerModalCat}>
                  {orderHistory.length} orders recorded
                </Text>
              </View>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Ionicons name="close-circle" size={26} color="#888" />
              </TouchableOpacity>
            </View>

            {orderHistory.length === 0 ? (
              <View style={styles.emptyHistoryBox}>
                <Ionicons name="receipt-outline" size={44} color="#D5A943" />
                <Text style={styles.emptyHistoryTitle}>No past orders found</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {orderHistory.map((ord) => (
                  <View key={ord.id} style={styles.historyCardBox}>
                    <View style={styles.historyCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyOrdNum}>#{ord.orderNumber}</Text>
                        <Text style={styles.historyOrdTime}>
                          {new Date(ord.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <View style={styles.historyOrdStatusPill}>
                        <Text style={styles.historyOrdStatusText}>{ord.status}</Text>
                      </View>
                    </View>

                    <Text style={styles.historyOrdItems} numberOfLines={2}>
                      {ord.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}
                    </Text>

                    <View style={styles.historyCardBottom}>
                      <Text style={styles.historyOrdTotal}>
                        Rs. {ord.total.toLocaleString()}
                      </Text>
                      <TouchableOpacity
                        style={styles.historyTrackBtn}
                        onPress={() => {
                          setActiveTrackingOrder(ord);
                          setHistoryModalVisible(false);
                          setTrackingModalVisible(true);
                        }}
                      >
                        <Ionicons name="location-outline" size={13} color="#D5A943" />
                        <Text style={styles.historyTrackBtnText}>Track</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  screenWrapper: {
    flex: 1,
  },
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 40,
  },

  // 1. Sleek Luxury Hospitality Header
  heroBanner: {
    backgroundColor: '#2E0A0F',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(213, 169, 67, 0.72)',
    paddingHorizontal: 20,
    paddingVertical: 11,
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #27070C 0%, #3E0F16 55%, #2B090E 100%)',
        boxShadow: '0 4px 20px rgba(24, 5, 8, 0.22)',
      } as any,
      default: {
        shadowColor: '#1E0408',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  },
  desktopHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 48,
  },
  headerBrandCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoRing: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDiningCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 4, 6, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.28)',
    borderRadius: 16,
    padding: 5,
    gap: 10,
  },
  capsuleDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(213, 169, 67, 0.26)',
  },
  capsuleTableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 11,
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'background-color 0.15s ease' } as any,
    }),
  },
  capsuleDeliveryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  headerUtilityCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerFullscreenBtn: {
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(213, 169, 67, 0.35)',
    paddingHorizontal: 12,
  },
  heroOverlayContent: {
    gap: 10,
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213,169,67,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  heroMainTitleMini: {
    color: '#F5D680',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  heroSubtitleUrduMini: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  heroOrdersPill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(213,169,67,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(213,169,67,0.55)',
    paddingHorizontal: 12,
    borderRadius: 12,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  heroOrdersPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Compact Dining Bar (Mobile / Compact Tablet)
  compactDiningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(18, 4, 6, 0.56)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(213,169,67,0.26)',
    gap: 8,
  },
  mobileTableSelectChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mobileDeliveryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  compactTableIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(213,169,67,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTablePillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  compactDeliveryText: {
    color: '#34D399',
    fontSize: 12.5,
    fontWeight: '800',
  },
  compactModeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 11,
    padding: 3,
    gap: 2,
  },
  compactModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'all 0.15s ease' } as any,
    }),
  },
  compactModeBtnActive: {
    backgroundColor: '#D5A943',
  },
  compactModeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
  compactModeBtnTextActive: {
    color: '#1E0408',
    fontWeight: '900',
  },

  // 2. Clean Search & Quick Filter Console
  filterSectionContainer: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  filterConsoleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5DACB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(58, 15, 18, 0.04)',
      } as any,
      default: {
        shadowColor: '#3A0F12',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  searchBar: {
    flex: 1,
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.2,
    borderColor: '#E2D4C3',
    ...Platform.select({
      web: {
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.025)',
      } as any,
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E0408',
    paddingVertical: 0,
  },
  consoleResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A0F12',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  consoleResetText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#F3D179',
  },

  // Prominent Category Nav Section
  categoryNavSection: {
    paddingVertical: 2,
  },
  categoryNavScroll: {
    gap: 10,
    paddingVertical: 2,
  },
  prominentCatTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F5',
    borderWidth: 1.5,
    borderColor: '#DFCBB5',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.16s ease-in-out',
      } as any,
    }),
  },
  prominentCatTabActive: {
    backgroundColor: '#52171B',
    borderColor: '#D5A943',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(82, 23, 27, 0.25)',
      } as any,
      default: {
        elevation: 4,
      },
    }),
  },
  prominentCatEmoji: {
    fontSize: 16,
  },
  prominentCatText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3A0F12',
    letterSpacing: 0.2,
  },
  prominentCatTextActive: {
    color: '#F3D179',
    fontWeight: '900',
  },
  prominentCatCount: {
    backgroundColor: '#EFE5DA',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  prominentCatCountActive: {
    backgroundColor: 'rgba(213, 169, 67, 0.35)',
  },
  prominentCatCountText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#52171B',
  },
  prominentCatCountTextActive: {
    color: '#FFFFFF',
  },

  // Dedicated Cuisine & Dietary Rows
  cuisineRowSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F5',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#EDE3D8',
    gap: 8,
  },
  dietaryRowSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F5',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#EDE3D8',
    gap: 8,
  },
  filterRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 8,
    borderRightWidth: 1.5,
    borderRightColor: '#DFCBB5',
  },
  filterRowHeaderLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#895B1E',
    letterSpacing: 0.8,
  },
  dietaryScroll: {
    gap: 6,
    paddingVertical: 1,
  },
  dietaryChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2D4C3',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dietaryChipActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  dietaryChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52171B',
  },
  dietaryChipTextActive: {
    color: '#F3D179',
    fontWeight: '800',
  },

  // Cuisine row
  posRegionScroll: {
    gap: 6,
    paddingVertical: 1,
  },
  posRegionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2D4C3',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 5,
  },
  posRegionChipActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  posRegionEmoji: {
    fontSize: 12,
  },
  posRegionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A3B32',
  },
  posRegionChipTextActive: {
    color: '#FFFFFF',
  },
  posRegionChipBadge: {
    backgroundColor: '#F3E8DF',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  posRegionChipBadgeActive: {
    backgroundColor: '#D5A943',
  },
  posRegionChipBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#52171B',
  },
  posRegionChipBadgeTextActive: {
    color: '#1E0408',
  },

  // 3. Main Content Layout
  contentLayoutContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginTop: 14,
    gap: 16,
  },

  // Center Feed
  dishesFeedContainer: {
    flex: 1,
  },
  dishesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  categoryHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E0408',
  },
  categorySubheading: {
    fontSize: 11.5,
    color: '#895B1E',
    marginTop: 2,
    fontWeight: '600',
  },
  viewModeToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5DCD1',
    padding: 2,
  },
  viewModeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  viewModeToggleBtnActive: {
    backgroundColor: '#F8F1EB',
  },
  viewModeToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#777',
  },
  viewModeToggleTextActive: {
    color: '#52171B',
    fontWeight: '800',
  },
  activeFilterResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeFilterResetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#895B1E',
  },
  focusedCatBanner: {
    backgroundColor: '#FFF8F0',
    borderWidth: 1.2,
    borderColor: '#D5A943',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  backToGalleriesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  backToGalleriesText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52171B',
  },
  focusedCatBannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  focusedCatBannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedCatBannerEmoji: {
    fontSize: 18,
  },
  focusedCatBannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3A0F12',
  },
  focusedCatBannerSubtitle: {
    fontSize: 11,
    color: '#895B1E',
  },

  // Auto Slider Categories Section
  catGalleriesContainer: {
    gap: 20,
  },
  catGallerySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#E8DED3',
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.02)' } as any,
    }),
  },
  catGalleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  catGalleryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  catGalleryBadgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF8E7',
    borderWidth: 1.5,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catGalleryEmoji: {
    fontSize: 22,
  },
  catGalleryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  catGalleryTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1E0408',
  },
  catGalleryCountPill: {
    backgroundColor: '#F3E8DF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  catGalleryCountText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#52171B',
  },
  autoSliderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  autoSliderBadgePaused: {
    backgroundColor: '#F5EBE1',
    borderColor: '#C4B5A5',
  },
  autoSliderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D5A943',
  },
  autoSliderDotPaused: {
    backgroundColor: '#8A7A70',
  },
  autoSliderBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: '#895B1E',
  },
  autoSliderBadgeTextPaused: {
    color: '#8A7A70',
  },
  catGallerySubtitle: {
    fontSize: 11,
    color: '#895B1E',
    fontWeight: '600',
    marginTop: 2,
  },
  sliderControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sliderArrowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sliderArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderArrowBtnDisabled: {
    opacity: 0.35,
    borderColor: '#D8CFC3',
    backgroundColor: '#F7F4EF',
  },
  catGalleryViewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    borderWidth: 1.2,
    borderColor: '#D5A943',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  catGalleryViewAllText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52171B',
  },
  catGalleryScrollContent: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 12,
  },

  // Gallery Dish Card (Refined Full-Bleed Hospitality Design)
  galleryDishCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAE2D7',
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(28, 25, 23, 0.05)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        cursor: 'pointer',
      } as any,
      default: {
        shadowColor: '#1C1917',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  galleryDishCardInCart: {
    borderColor: '#4A1018',
    borderWidth: 1.5,
    backgroundColor: '#FFFDF9',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 20px rgba(74, 16, 24, 0.12)',
      } as any,
    }),
  },
  inCartBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.22)' } as any,
    }),
  },
  inCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  galleryCardImageWrapper: {
    width: '100%',
    height: 158,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F5EFE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishCardImage: {
    width: '100%',
    height: '100%',
  },
  dishCardPlaceholderBox: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5EFE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryRegionChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(28, 25, 23, 0.78)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 4,
  },
  dishCardRegionText: {
    fontSize: 10,
    color: '#F3D179',
    fontWeight: '700',
  },
  dishCardBadgeTag: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#D5A943',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 4,
  },
  dishCardBadgeTopLeft: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#C89B3C',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 5,
    ...Platform.select({
      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.18)' } as any,
    }),
  },
  dishCardBadgeText: {
    fontSize: 10,
    color: '#1C1917',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  prepTimeChip: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(28, 25, 23, 0.72)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 4,
  },
  prepTimeChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  dishSoldOutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  dishSoldOutText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  cardBodyPadding: {
    padding: 12,
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
  },
  galleryDishTitleWrapper: {
    width: '100%',
    alignItems: 'flex-start',
  },
  galleryDishTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1C1917',
    lineHeight: 20,
  },
  galleryDishUrdu: {
    fontSize: 12,
    color: '#8C6B4A',
    marginTop: 2,
    fontWeight: '600',
  },
  galleryDishDesc: {
    fontSize: 12,
    color: '#6B625B',
    marginTop: 4,
    lineHeight: 17,
  },
  dishCardVariantHint: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 3,
    fontWeight: '700',
  },
  galleryCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3EDE4',
  },
  startingFromLabel: {
    fontSize: 10,
    color: '#8C6B4A',
    fontWeight: '700',
    marginBottom: 1,
  },
  cardPriceValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#4A1018',
  },
  galleryPricePill: {
    backgroundColor: '#F8F1EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  galleryPricePillActive: {
    backgroundColor: '#3A0F12',
  },
  galleryPriceText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#52171B',
  },
  galleryPriceTextActive: {
    color: '#F3D179',
  },
  galleryQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A1018',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    minHeight: 36,
    gap: 4,
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'background-color 0.15s ease' } as any,
    }),
  },
  galleryQuickAddText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A1018',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 36,
    gap: 8,
  },
  cardStepperBtnMini: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStepperCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    minWidth: 16,
    textAlign: 'center',
  },

  // End card in auto-slider
  catGalleryEndCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    minHeight: 236,
  },
  catGalleryEndIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF8E7',
    borderWidth: 1.2,
    borderColor: '#D5A943',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  catGalleryEndTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#52171B',
  },
  catGalleryEndCat: {
    fontSize: 12,
    fontWeight: '700',
    color: '#895B1E',
    marginTop: 2,
  },
  catGalleryEndCount: {
    fontSize: 10.5,
    color: '#777',
    marginTop: 4,
  },

  // Grid view (Primary Human-Friendly Editorial Menu Cards)
  dishesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  dishCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAE2D7',
    marginBottom: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(28, 25, 23, 0.05)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        cursor: 'pointer',
      } as any,
      default: {
        shadowColor: '#1C1917',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  dishCardInCart: {
    borderColor: '#4A1018',
    borderWidth: 1.5,
    backgroundColor: '#FFFDF9',
  },
  dishCardImageWrapper: {
    width: '100%',
    height: 172,
    overflow: 'hidden',
    backgroundColor: '#F5EFE6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dishCardDetails: {
    flex: 1,
  },
  dishCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1917',
    lineHeight: 21,
  },
  dishCardUrdu: {
    fontSize: 12,
    color: '#8C6B4A',
    marginTop: 2,
    fontWeight: '600',
  },
  dishCardDesc: {
    fontSize: 12,
    color: '#6B625B',
    marginTop: 4,
    lineHeight: 17,
  },
  dishCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3EDE4',
  },

  // Desktop Sticky Order Summary Panel
  desktopCartPanel: {
    width: 332,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EAE2D7',
    padding: 16,
    alignSelf: 'flex-start',
    ...Platform.select({
      web: {
        position: 'sticky',
        top: 74,
        maxHeight: 'calc(100vh - 94px)',
        boxShadow: '0 8px 28px rgba(28, 25, 23, 0.06)',
      } as any,
    }),
  },
  cartPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E6DC',
    marginBottom: 10,
  },
  cartPanelTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E0408',
  },
  cartItemCountTag: {
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  cartItemCountTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#52171B',
  },
  clearCartIconBtn: {
    padding: 4,
  },
  emptyTrayBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyTrayTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#52171B',
  },
  emptyTrayDesc: {
    fontSize: 11.5,
    color: '#777',
    textAlign: 'center',
  },
  cartPanelBody: {
    gap: 12,
  },
  trayItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F7EFE9',
  },
  trayItemName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E0408',
  },
  trayItemSub: {
    fontSize: 10,
    color: '#895B1E',
  },
  trayItemPrice: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52171B',
    marginTop: 2,
  },
  trayStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7EFE9',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 6,
  },
  trayStepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayStepperQty: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E0408',
  },
  trayItemRemoveBtn: {
    marginLeft: 6,
    padding: 4,
  },
  traySummaryCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E8DED3',
    gap: 4,
  },
  traySummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 11.5,
    color: '#666',
  },
  summaryVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E0408',
  },
  trayDivider: {
    height: 1,
    backgroundColor: '#E8DED3',
    marginVertical: 4,
  },
  grandLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#52171B',
  },
  grandVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#52171B',
  },
  trayCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  trayCheckoutBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E0408',
  },

  // Floating Cart Mobile Bar
  floatingCartMobileWrapper: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    zIndex: 99,
  },
  floatingCartMobileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#3A0F12',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#D5A943',
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.25)' } as any,
    }),
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
    color: '#1E0408',
  },
  floatingCartTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  floatingCartSubtitle: {
    fontSize: 10.5,
    color: '#F3D179',
  },
  floatingCartRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingCartTotal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  floatingCartActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
  },
  floatingCartActionPillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1E0408',
  },

  // Modals Styling
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  customizerModalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#D5A943',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E6DC',
    marginBottom: 12,
  },
  customizerModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1E0408',
  },
  customizerModalUrduTitle: {
    fontSize: 13,
    color: '#895B1E',
    marginTop: 2,
  },
  customizerModalCat: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  customizerSection: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3A0F12',
    marginBottom: 6,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionPill: {
    borderWidth: 1,
    borderColor: '#D8CFC3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FAF8F5',
  },
  optionPillActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  optionPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4A3B32',
  },
  optionPillTextActive: {
    color: '#F3D179',
  },
  optionPillPrice: {
    fontSize: 10,
    color: '#895B1E',
    marginTop: 1,
  },
  optionPillPriceActive: {
    color: '#FFFFFF',
  },
  customizerNotesInput: {
    borderWidth: 1,
    borderColor: '#D8CFC3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#1E0408',
    backgroundColor: '#FAF8F5',
  },
  customizerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0E6DC',
    gap: 12,
  },
  modalStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5EBE1',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 10,
  },
  modalStepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStepperQty: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E0408',
  },
  addCustomizerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A1018',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 8,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  addCustomizerBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Checkout Modal
  checkoutItemsList: {
    marginBottom: 12,
  },
  checkoutItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8DF',
  },
  checkoutItemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E0408',
  },
  checkoutItemSub: {
    fontSize: 11,
    color: '#895B1E',
  },
  checkoutItemNotes: {
    fontSize: 10.5,
    color: '#777',
    marginTop: 2,
  },
  checkoutItemPrice: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#52171B',
    marginTop: 2,
  },
  checkoutSection: {
    marginBottom: 14,
    gap: 8,
  },
  checkoutInput: {
    borderWidth: 1,
    borderColor: '#D8CFC3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#1E0408',
    backgroundColor: '#FAF8F5',
  },
  confirmOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D5A943',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 12,
    gap: 8,
  },
  confirmOrderBtnText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#1E0408',
  },

  // Table Selector Modal
  floorTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  floorTabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D8CFC3',
    backgroundColor: '#FAF8F5',
  },
  floorTabBtnActive: {
    backgroundColor: '#3A0F12',
    borderColor: '#D5A943',
  },
  floorTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52171B',
  },
  floorTabBtnTextActive: {
    color: '#F3D179',
  },
  tablesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tableCard: {
    width: '31%',
    backgroundColor: '#FAF8F5',
    borderWidth: 1.2,
    borderColor: '#E8DED3',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  tableCardSelected: {
    backgroundColor: '#FFF8E7',
    borderColor: '#52171B',
  },
  tableCardName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E0408',
  },
  tableCardNameSelected: {
    color: '#52171B',
  },
  tableCardSeats: {
    fontSize: 10,
    color: '#895B1E',
  },

  // Tracker Modal
  trackerCardBox: {
    backgroundColor: '#FFFDF9',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#D5A943',
    padding: 14,
    marginBottom: 14,
  },
  trackerStageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trackerMainLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#52171B',
  },
  trackerDescLabel: {
    fontSize: 11,
    color: '#895B1E',
    marginTop: 2,
  },
  trackerTimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A0F12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  trackerTimerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F3D179',
  },
  trackerProgressArea: {
    marginTop: 8,
  },
  trackerProgressLineBg: {
    height: 4,
    backgroundColor: '#E8DFD5',
    borderRadius: 2,
    position: 'relative',
    marginBottom: 10,
  },
  trackerProgressLineFill: {
    height: '100%',
    backgroundColor: '#D5A943',
    borderRadius: 2,
  },
  trackerStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trackerStepNode: {
    alignItems: 'center',
    width: 50,
  },
  trackerNodeDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E8DFD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  trackerNodeDotPassed: {
    backgroundColor: '#10B981',
  },
  trackerNodeDotCurrent: {
    backgroundColor: '#D5A943',
  },
  trackerNodeNum: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#666',
  },
  trackerNodeNumActive: {
    color: '#FFFFFF',
  },
  trackerNodeLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#4A3B32',
    textAlign: 'center',
  },
  trackerDishesCard: {
    backgroundColor: '#FAF8F5',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8DED3',
  },
  trackerDishItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  trackerDishQty: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52171B',
    width: 24,
  },
  trackerDishName: {
    flex: 1,
    fontSize: 12,
    color: '#1E0408',
  },
  trackerDishPrice: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E0408',
  },
  billDivider: {
    height: 1,
    backgroundColor: '#E8DED3',
    marginVertical: 6,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billGrandLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#52171B',
  },
  billGrandVal: {
    fontSize: 12,
    fontWeight: '900',
    color: '#52171B',
  },
  trackerCloseBtn: {
    backgroundColor: '#3A0F12',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  trackerCloseBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F3D179',
  },

  // Order History Modal
  emptyHistoryBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyHistoryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#52171B',
  },
  historyCardBox: {
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8DED3',
    marginBottom: 8,
    gap: 4,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyOrdNum: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E0408',
  },
  historyOrdTime: {
    fontSize: 10,
    color: '#888',
  },
  historyOrdStatusPill: {
    backgroundColor: '#FFF8E7',
    borderWidth: 1,
    borderColor: '#D5A943',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  historyOrdStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#895B1E',
  },
  historyOrdItems: {
    fontSize: 11,
    color: '#666',
  },
  historyCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  historyOrdTotal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52171B',
  },
  historyTrackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#3A0F12',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyTrackBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#F3D179',
  },

  // Empty state
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DED3',
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#52171B',
  },
  emptyStateDesc: {
    fontSize: 11.5,
    color: '#777',
    textAlign: 'center',
    maxWidth: 280,
  },
  clearSearchBtn: {
    backgroundColor: '#3A0F12',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 4,
  },
  clearSearchBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F3D179',
  },

  // Sticky Category Jump Bar (Pinned while scrolling)
  stickyCategoryBarWrapper: {
    backgroundColor: 'rgba(250, 248, 245, 0.96)',
    borderBottomWidth: 1,
    borderBottomColor: '#EAE2D7',
    paddingVertical: 10,
    zIndex: 30,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 14px rgba(28, 25, 23, 0.05)',
      } as any,
      default: {
        elevation: 3,
      },
    }),
  },
  stickyCategoryScroll: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },

  // Human-Friendly Menu UI & HCI Additions
  heroTrackLivePill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#065F46',
    borderWidth: 1,
    borderColor: '#34D399',
    paddingHorizontal: 12,
    borderRadius: 12,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  heroTrackLiveText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroIconPill: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213,169,67,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  compactTableSubLabel: {
    fontSize: 9.5,
    color: 'rgba(243, 209, 121, 0.82)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  changeTableTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(213, 169, 67, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.38)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    marginLeft: 2,
  },
  changeTableTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F3D179',
  },
  discoveryChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  discoveryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FAF7F2',
    borderWidth: 1.2,
    borderColor: '#E5DACB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'all 0.15s ease' } as any,
    }),
  },
  discoveryChipActive: {
    backgroundColor: '#4A1018',
    borderColor: '#4A1018',
  },
  discoveryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A1018',
  },
  discoveryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  menuSectionsStack: {
    gap: 28,
  },
  menuCategorySection: {
    gap: 14,
  },
  menuCategorySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: '#EAE2D7',
  },
  menuCategorySectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF8EB',
    borderWidth: 1,
    borderColor: '#E6D2AE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCategorySectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C1917',
    letterSpacing: -0.2,
  },
  menuCategoryCountPill: {
    backgroundColor: '#F3EDE4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  menuCategoryCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52171B',
  },
  menuCategorySectionSub: {
    fontSize: 12,
    color: '#8C6B4A',
    fontWeight: '600',
    marginTop: 2,
  },

  // Mobile Horizontal Food Card (Uber Eats / Foodpanda Ergonomics)
  mobileDishRowCard: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EAE2D7',
    gap: 12,
    alignItems: 'stretch',
    ...Platform.select({
      default: {
        shadowColor: '#1C1917',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  mobileDishInfoCol: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4,
  },
  mobileInlineBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mobileInlineBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#92400E',
  },
  mobilePrepText: {
    fontSize: 10.5,
    color: '#8C6B4A',
    fontWeight: '600',
  },
  mobileDishTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1917',
    lineHeight: 20,
  },
  mobileDishDesc: {
    fontSize: 12,
    color: '#6B625B',
    lineHeight: 16.5,
  },
  mobileDishPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  mobileVariantTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C6B4A',
  },
  mobileDishImgCol: {
    width: 116,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileDishImgWrap: {
    width: 116,
    height: 98,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5EFE6',
  },
  mobileFloatingActionWrap: {
    marginTop: -16,
    zIndex: 4,
  },
  mobileAddPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A1018',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 82,
    gap: 3,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // Order Tray Enhancements
  emptyTrayIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FAF5EC',
    borderWidth: 1,
    borderColor: '#E6D2AE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  freeDeliveryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  freeDeliveryHintText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  trayItemThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: '#F5EFE6',
  },
  trayItemThumbFallback: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: '#F5EFE6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Live Feedback Toast
  cartToastContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 99,
    pointerEvents: 'box-none',
  },
  cartToastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1C1917',
    borderWidth: 1,
    borderColor: '#C89B3C',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 420,
    width: '100%',
    ...Platform.select({
      web: { boxShadow: '0 10px 28px rgba(0,0,0,0.28)' } as any,
      default: { elevation: 8 },
    }),
  },
  cartToastIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartToastTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cartToastSub: {
    fontSize: 11,
    color: '#D6CFC7',
    marginTop: 1,
  },
  cartToastCta: {
    fontSize: 12,
    fontWeight: '900',
    color: '#F3D179',
    paddingHorizontal: 6,
  },

  // Rich Dish Detail / Customizer Hero
  customizerHeroWrap: {
    width: '100%',
    height: 205,
    backgroundColor: '#F5EFE6',
    position: 'relative',
  },
  customizerHeroCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer' } as any,
    }),
  },
  customizerHeroPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4A1018',
  },
  customizerFullDesc: {
    fontSize: 13,
    color: '#57534E',
    lineHeight: 19,
    marginTop: 8,
  },
});
