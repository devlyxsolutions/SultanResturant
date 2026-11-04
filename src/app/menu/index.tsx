import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import IslamicHeroBackground from '../../components/IslamicHeroBackground';
import SultanLogo from '../../components/SultanLogo';
import FullscreenButton from '../../components/FullscreenButton';
import { broadcastImmediately } from '../../services/syncService';
import { useOpsStore } from '../../store/opsStore';
import { MenuItem, Ticket, useRestaurantStore } from '../../store/restaurantStore';

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
  screenWidth: number;
  getEmoji: (cat: string) => string;
  getUrdu: (cat: string) => string;
}

const AutoCategorySlider: React.FC<AutoCategorySliderProps> = ({
  category,
  items,
  onViewAll,
  renderCard,
  isDesktop,
  isTablet,
  screenWidth,
  getEmoji,
  getUrdu,
}) => {
  const scrollRef = useRef<any>(null);
  const offsetRef = useRef(0);
  const isInteractingRef = useRef(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Pulse animation for the Auto-Slider Live badge
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isAutoPlaying) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isAutoPlaying, pulseAnim]);

  const cardWidth = isDesktop ? 280 : isTablet ? 235 : 190;
  const gap = 12;
  const step = cardWidth + gap;

  // Build seamless 3-set infinite loop track
  const { sliderItems, singleCycleWidth } = useMemo(() => {
    if (items.length <= 1) {
      return {
        sliderItems: items.map((it, idx) => ({ item: it, key: `${it.id}_${idx}` })),
        singleCycleWidth: items.length * step,
      };
    }

    const minCycleWidth = Math.max(screenWidth, 600);
    const cyclesPerSet = Math.max(1, Math.ceil(minCycleWidth / Math.max(1, items.length * step)));
    const baseSet: MenuItem[] = [];
    for (let c = 0; c < cyclesPerSet; c++) {
      baseSet.push(...items);
    }
    const cycleWidth = baseSet.length * step;

    // 3 identical sets: [Set 0, Set 1 (middle), Set 2]
    const list: { item: MenuItem; key: string }[] = [];
    for (let s = 0; s < 3; s++) {
      baseSet.forEach((it, idx) => {
        list.push({ item: it, key: `${it.id}_s${s}_${idx}` });
      });
    }

    return {
      sliderItems: list,
      singleCycleWidth: cycleWidth,
    };
  }, [items, step, screenWidth]);

  // Silently normalize offset to stay inside Set 1 (middle set)
  const checkAndResetLoop = useCallback(
    (current: number) => {
      if (items.length <= 1 || singleCycleWidth <= 0) return current;

      if (current >= singleCycleWidth * 2) {
        const reset = current - singleCycleWidth;
        scrollRef.current?.scrollTo({ x: reset, animated: false });
        offsetRef.current = reset;
        return reset;
      } else if (current < singleCycleWidth * 0.5) {
        const reset = current + singleCycleWidth;
        scrollRef.current?.scrollTo({ x: reset, animated: false });
        offsetRef.current = reset;
        return reset;
      }
      return current;
    },
    [items.length, singleCycleWidth]
  );

  // Initialize scroll position in the middle set
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (items.length > 1 && singleCycleWidth > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const initialOffset = singleCycleWidth;
      offsetRef.current = initialOffset;
      const timer = setTimeout(() => {
        scrollRef.current?.scrollTo({ x: initialOffset, animated: false });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [items.length, singleCycleWidth]);

  // Auto-scroll loop
  useEffect(() => {
    if (items.length <= 1 || !isAutoPlaying) return;

    // Stagger slightly by category name hash so not all rows slide at the exact millisecond
    const hash = category.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const intervalTime = 3400 + (hash % 800);

    const timer = setInterval(() => {
      if (isInteractingRef.current || !scrollRef.current) return;

      const next = offsetRef.current + step;
      scrollRef.current?.scrollTo({ x: next, animated: true });
      offsetRef.current = next;

      // After animation completes, silent wrap check
      setTimeout(() => {
        checkAndResetLoop(offsetRef.current);
      }, 350);
    }, intervalTime);

    return () => clearInterval(timer);
  }, [items.length, isAutoPlaying, step, category, checkAndResetLoop]);

  const handleManualPrev = () => {
    isInteractingRef.current = true;
    const prev = offsetRef.current - step * (isDesktop ? 2 : 1);
    scrollRef.current?.scrollTo({ x: prev, animated: true });
    offsetRef.current = prev;
    setTimeout(() => {
      checkAndResetLoop(offsetRef.current);
      isInteractingRef.current = false;
    }, 400);
  };

  const handleManualNext = () => {
    isInteractingRef.current = true;
    const next = offsetRef.current + step * (isDesktop ? 2 : 1);
    scrollRef.current?.scrollTo({ x: next, animated: true });
    offsetRef.current = next;
    setTimeout(() => {
      checkAndResetLoop(offsetRef.current);
      isInteractingRef.current = false;
    }, 400);
  };

  return (
    <View style={styles.catGallerySection}>
      {/* Category Slider Header */}
      <View style={styles.catGalleryHeader}>
        <View style={styles.catGalleryHeaderLeft}>
          <View style={styles.catGalleryBadgeIcon}>
            <Text style={styles.catGalleryEmoji}>{getEmoji(category)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.catGalleryTitleRow}>
              <Text style={styles.catGalleryTitle}>{category}</Text>
              <View style={styles.catGalleryCountPill}>
                <Text style={styles.catGalleryCountText}>{items.length} items</Text>
              </View>

              {/* Auto Slider Badge with Play/Pause Toggle */}
              <TouchableOpacity
                style={[
                  styles.autoSliderBadge,
                  !isAutoPlaying && styles.autoSliderBadgePaused,
                ]}
                onPress={() => setIsAutoPlaying(!isAutoPlaying)}
                activeOpacity={0.8}
                accessibilityLabel="Toggle Auto Slider"
              >
                <Animated.View
                  style={[
                    styles.autoSliderDot,
                    !isAutoPlaying && styles.autoSliderDotPaused,
                    { transform: [{ scale: isAutoPlaying ? pulseAnim : 1 }] },
                  ]}
                />
                <Text
                  style={[
                    styles.autoSliderBadgeText,
                    !isAutoPlaying && styles.autoSliderBadgeTextPaused,
                  ]}
                >
                  {isAutoPlaying ? 'AUTO SLIDER' : 'PAUSED'}
                </Text>
                <Ionicons
                  name={isAutoPlaying ? 'pause' : 'play'}
                  size={9}
                  color={isAutoPlaying ? '#D5A943' : '#8A7A70'}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.catGallerySubtitle} numberOfLines={1}>
              {getUrdu(category)}
            </Text>
          </View>
        </View>

        {/* Right: Manual Arrows & View All */}
        <View style={styles.sliderControlsRow}>
          <View style={styles.sliderArrowGroup}>
            <TouchableOpacity
              style={styles.sliderArrowBtn}
              onPress={handleManualPrev}
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

      {/* Horizontal Auto-Scroll Track */}
      <View
        {...(Platform.OS === 'web'
          ? ({
            onMouseEnter: () => {
              isInteractingRef.current = true;
            },
            onMouseLeave: () => {
              isInteractingRef.current = false;
            },
          } as any)
          : {})}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catGalleryScrollContent}
          onScrollBeginDrag={() => {
            isInteractingRef.current = true;
          }}
          onScrollEndDrag={() => {
            setTimeout(() => {
              isInteractingRef.current = false;
            }, 2500);
          }}
          onMomentumScrollEnd={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            offsetRef.current = x;
            checkAndResetLoop(x);
            setTimeout(() => {
              isInteractingRef.current = false;
            }, 1500);
          }}
          onScroll={(e) => {
            offsetRef.current = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={32}
        >
          {sliderItems.map((entry) => renderCard(entry.item, entry.key))}
        </ScrollView>
      </View>
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
  const storeRegions = useRestaurantStore((state) => state.regions);
  const tables = useRestaurantStore((state) => state.tables);
  const syncFromServer = useRestaurantStore((state) => state.syncFromServer);
  const unavailableIds = useOpsStore((state) => state.unavailableItemIds) || [];

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
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'specials' | 'spicy' | 'veg'>('all');
  const [viewMode, setViewMode] = useState<'gallery' | 'grid'>('gallery');

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
          if (Array.isArray(parsedOrders)) setOrderHistory(parsedOrders);
        }
      } catch {
        // storage ignored safely
      }
    })();
  }, []);

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

  // Helper: URL base
  const getBaseUrl = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const loc = window.location;
      if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
      }
      return `${loc.protocol}//${loc.hostname}:3000`;
    }
    return 'http://192.168.100.11:3000';
  };

  // Helper: Category Emoji & Urud Titles
  const getCategoryEmoji = (cat: string) => {
    const lower = cat.toLowerCase();
    if (lower === 'all') return '👑';
    if (lower.includes('karahi') || lower.includes('handi')) return '🥘';
    if (
      lower.includes('bbq') ||
      lower.includes('kabab') ||
      lower.includes('grill') ||
      lower.includes('tikka')
    )
      return '🍢';
    if (lower.includes('biryani') || lower.includes('rice') || lower.includes('pulao'))
      return '🍚';
    if (lower.includes('mains') || lower.includes('curry')) return '🍲';
    if (
      lower.includes('appetizer') ||
      lower.includes('starter') ||
      lower.includes('soup') ||
      lower.includes('roll')
    )
      return '🥟';
    if (lower.includes('naan') || lower.includes('roti') || lower.includes('bread'))
      return '🫓';
    if (
      lower.includes('dessert') ||
      lower.includes('sweet') ||
      lower.includes('kunafa') ||
      lower.includes('kheer')
    )
      return '🍨';
    if (
      lower.includes('drink') ||
      lower.includes('beverage') ||
      lower.includes('juice') ||
      lower.includes('shake')
    )
      return '🍹';
    if (lower.includes('deal') || lower.includes('combo') || lower.includes('family'))
      return '🎁';
    return '🍽️';
  };

  const getCategoryUrduOrTagline = (cat: string) => {
    const lower = cat.toLowerCase();
    if (
      lower.includes('appetizer') ||
      lower.includes('starter') ||
      lower.includes('soup') ||
      lower.includes('roll')
    ) {
      return 'شروع کے لذیذ پکوان • Fresh Starters & Appetizers';
    }
    if (lower.includes('karahi') || lower.includes('handi')) {
      return 'روایتی کڑاہی اور ہانڈی • Fresh Clay Handi & Wok';
    }
    if (
      lower.includes('bbq') ||
      lower.includes('grill') ||
      lower.includes('kabab') ||
      lower.includes('tikka')
    ) {
      return 'شاہی باربی کیو اور کباب • Charcoal Grills & Skewers';
    }
    if (lower.includes('biryani') || lower.includes('rice') || lower.includes('pulao')) {
      return 'شاہی بریانی اور پلاؤ • Aromatic Basmati Specialties';
    }
    if (lower.includes('mains') || lower.includes('curry')) {
      return 'شاہی روایتی کھانے اور سالن • Royal Curries & Signature Dishes';
    }
    if (lower.includes('naan') || lower.includes('roti') || lower.includes('bread')) {
      return 'تازہ تندوری نان اور روٹیاں • Fresh Clay Oven Breads';
    }
    if (
      lower.includes('dessert') ||
      lower.includes('sweet') ||
      lower.includes('kunafa') ||
      lower.includes('kheer')
    ) {
      return 'شاہی میٹھے اور قنافہ • Royal Traditional Desserts & Kunafa';
    }
    if (
      lower.includes('drink') ||
      lower.includes('beverage') ||
      lower.includes('juice') ||
      lower.includes('shake')
    ) {
      return 'تازہ مشروبات اور شیکس • Chilled Refreshments & Shakes';
    }
    if (lower.includes('deal') || lower.includes('combo') || lower.includes('family')) {
      return 'شاہی فیملی ڈیلز • Exclusive Value Feasts & Combos';
    }
    return 'شاہی شاہکار پکوان • Authentic Sultan Specialties';
  };

  const getCuisineMeta = (name: string) => {
    const lower = name.toLowerCase();
    if (
      lower.includes('pakistan') ||
      lower.includes('desi') ||
      lower.includes('karahi') ||
      lower.includes('bbq')
    ) {
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

  // Categories & Regions Lists
  const categoryTabs = useMemo(() => {
    const set = new Set<string>();
    (categories || []).forEach((c) => {
      const clean = (c || '').trim();
      if (clean && clean.toLowerCase() !== 'all') set.add(clean);
    });
    return ['All', ...Array.from(set)];
  }, [categories]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    (storeRegions || []).forEach((r) => {
      const clean = (r || '').trim();
      if (clean && clean.toLowerCase() !== 'all') set.add(clean);
    });
    (menuItems || []).forEach((m) => {
      const clean = (m.region || '').trim();
      if (clean && clean.toLowerCase() !== 'all') set.add(clean);
    });
    return Array.from(set);
  }, [storeRegions, menuItems]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    (menuItems || []).forEach((item) => {
      const matchCat =
        activeCat === 'All' ||
        activeCat === 'ALL' ||
        (item.category || '').toLowerCase() === activeCat.toLowerCase();
      if (!matchCat) return;
      counts['ALL'] = (counts['ALL'] || 0) + 1;
      if (item.region) {
        counts[item.region] = (counts[item.region] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems, activeCat]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0, ALL: 0 };
    (menuItems || []).forEach((item) => {
      let matchRegion = true;
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        matchRegion =
          (item.region || '').trim().toLowerCase() === activeRegion.trim().toLowerCase();
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

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat =
        activeCat === 'All' ||
        activeCat === 'ALL' ||
        (item.category || '').toLowerCase() === activeCat.toLowerCase();

      let matchRegion = true;
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        matchRegion =
          (item.region || '').trim().toLowerCase() === activeRegion.trim().toLowerCase();
      }

      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        Boolean(item.urduName && item.urduName.toLowerCase().includes(q)) ||
        Boolean(item.description && item.description.toLowerCase().includes(q)) ||
        Boolean(item.category && item.category.toLowerCase().includes(q)) ||
        Boolean(item.region && item.region.toLowerCase().includes(q));

      let matchDiet = true;
      if (dietaryFilter === 'specials') {
        matchDiet = Boolean(item.badge || item.isDeal);
      } else if (dietaryFilter === 'spicy') {
        const lower = item.name.toLowerCase();
        matchDiet = lower.includes('spicy') || lower.includes('karahi') || lower.includes('tikka');
      } else if (dietaryFilter === 'veg') {
        const lower = (item.name + ' ' + (item.category || '')).toLowerCase();
        matchDiet =
          lower.includes('veg') ||
          lower.includes('paneer') ||
          lower.includes('daal') ||
          lower.includes('naan') ||
          lower.includes('dessert') ||
          lower.includes('drink');
      }

      return matchCat && matchRegion && matchQuery && matchDiet;
    });
  }, [menuItems, activeCat, activeRegion, searchQuery, dietaryFilter]);

  // Grouped Categories for Front-Page Auto-Slider Galleries
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

    const baseItems = menuItems.filter((item) => {
      let matchRegion = true;
      if (activeRegion !== 'ALL' && activeRegion !== 'All') {
        matchRegion =
          (item.region || '').trim().toLowerCase() === activeRegion.trim().toLowerCase();
      }
      let matchQuery = true;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        matchQuery =
          item.name.toLowerCase().includes(q) ||
          Boolean(item.description && item.description.toLowerCase().includes(q)) ||
          Boolean(item.category && item.category.toLowerCase().includes(q)) ||
          Boolean(item.urduName && item.urduName.toLowerCase().includes(q)) ||
          Boolean(item.region && item.region.toLowerCase().includes(q));
      }
      let matchDiet = true;
      if (dietaryFilter === 'specials') {
        matchDiet = Boolean(item.badge || item.isDeal);
      } else if (dietaryFilter === 'spicy') {
        const lower = item.name.toLowerCase();
        matchDiet = lower.includes('spicy') || lower.includes('karahi') || lower.includes('tikka');
      } else if (dietaryFilter === 'veg') {
        const lower = (item.name + ' ' + (item.category || '')).toLowerCase();
        matchDiet =
          lower.includes('veg') ||
          lower.includes('paneer') ||
          lower.includes('daal') ||
          lower.includes('naan') ||
          lower.includes('dessert') ||
          lower.includes('drink');
      }
      return matchRegion && matchQuery && matchDiet;
    });

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
  }, [categoryTabs, menuItems, activeRegion, searchQuery, dietaryFilter]);

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

    setCart((prev) => [...prev, newItem]);
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
          label: 'Out for Delivery 🛵',
          desc: 'Rider is on the way',
        };
      case 'DELIVERED':
      case 'SERVED':
        return {
          step: 5,
          percent: '100%',
          label: 'Delivered / Served 🎉',
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

  // Render Horizontal Dish Card (used in Auto Sliders)
  const renderGalleryItemCard = (item: MenuItem, cardKey?: string) => {
    const isSoldOut = isItemSoldOut(item);
    const inCartQty = getItemCartQty(item.id);
    const isItemInCart = inCartQty > 0;
    const cardWidth = isDesktop ? 280 : isTablet ? 235 : 190;

    const lowerName = item.name.toLowerCase();
    const hasVariants = Boolean(item.variants && item.variants.length > 0);
    const isWeightDish =
      lowerName.includes('karahi') ||
      lowerName.includes('handi') ||
      lowerName.includes('sajji') ||
      lowerName.includes('kg');

    return (
      <TouchableOpacity
        key={cardKey || item.id}
        style={[
          styles.galleryDishCard,
          { width: cardWidth },
          isItemInCart && styles.galleryDishCardInCart,
          isSoldOut && { opacity: 0.65 },
        ]}
        onPress={() =>
          hasVariants || isWeightDish
            ? handleOpenCustomizer(item)
            : handleQuickAdd(item)
        }
        activeOpacity={0.85}
        disabled={isSoldOut}
      >
        {/* Floating In-Cart Badge */}
        {isItemInCart && (
          <View style={styles.inCartBadge}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
            <Text style={styles.inCartBadgeText}>{inCartQty}</Text>
          </View>
        )}

        {/* Top: Dish Image */}
        <View style={styles.galleryCardImageWrapper}>
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
                size={30}
                color="#D5A943"
              />
            </View>
          )}

          {/* Region Chip */}
          {item.region ? (
            <View style={styles.galleryRegionChip}>
              <Ionicons
                name="globe-outline"
                size={8}
                color="#D5A943"
                style={{ marginRight: 3 }}
              />
              <Text style={styles.dishCardRegionText} numberOfLines={1}>
                {item.region}
              </Text>
            </View>
          ) : null}

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

        {/* Middle: Dish Title & Urdu */}
        <View style={styles.galleryDishTitleWrapper}>
          <Text style={styles.galleryDishTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {item.urduName ? (
            <Text style={styles.galleryDishUrdu} numberOfLines={1}>
              {item.urduName}
            </Text>
          ) : hasVariants || isWeightDish ? (
            <Text style={styles.dishCardVariantHint} numberOfLines={1}>
              {hasVariants ? `${item.variants?.length} Options Available` : 'Custom Weight / Handi'}
            </Text>
          ) : item.description ? (
            <Text style={styles.galleryDishDesc} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>

        {/* Bottom: Price + Quick Add or Stepper */}
        <View style={styles.galleryCardBottomRow}>
          <View
            style={[
              styles.galleryPricePill,
              isItemInCart && styles.galleryPricePillActive,
            ]}
          >
            <Text
              style={[
                styles.galleryPriceText,
                isItemInCart && styles.galleryPriceTextActive,
              ]}
            >
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
              >
                <Ionicons name="remove" size={13} color="#FFFFFF" />
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
              >
                <Ionicons name="add" size={13} color="#FFFFFF" />
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
              activeOpacity={0.8}
            >
              <Ionicons
                name={hasVariants || isWeightDish ? 'options-outline' : 'add'}
                size={13}
                color="#1E0408"
              />
              <Text style={styles.galleryQuickAddText}>
                {hasVariants || isWeightDish ? 'CUSTOMIZE' : '+ ADD'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render Grid Dish Card (used in search or single category view)
  const renderItemCard = (item: MenuItem) => {
    const isSoldOut = isItemSoldOut(item);
    const inCartQty = getItemCartQty(item.id);
    const isItemInCart = inCartQty > 0;
    const cardWidth = isDesktop ? '31.5%' : isTablet ? '31.5%' : width < 350 ? '100%' : '48%';

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
        style={[
          styles.dishCard,
          { width: cardWidth as any },
          isItemInCart && styles.dishCardInCart,
          isSoldOut && { opacity: 0.65 },
        ]}
        onPress={() =>
          hasVariants || isWeightDish
            ? handleOpenCustomizer(item)
            : handleQuickAdd(item)
        }
        activeOpacity={0.85}
        disabled={isSoldOut}
      >
        {isItemInCart && (
          <View style={styles.inCartBadge}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
            <Text style={styles.inCartBadgeText}>{inCartQty}</Text>
          </View>
        )}

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
                size={32}
                color="#D5A943"
              />
            </View>
          )}

          {item.region ? (
            <View style={styles.galleryRegionChip}>
              <Ionicons
                name="globe-outline"
                size={8}
                color="#D5A943"
                style={{ marginRight: 3 }}
              />
              <Text style={styles.dishCardRegionText} numberOfLines={1}>
                {item.region}
              </Text>
            </View>
          ) : null}

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

          {isSoldOut && (
            <View style={styles.dishSoldOutOverlay}>
              <Text style={styles.dishSoldOutText}>SOLD OUT</Text>
            </View>
          )}
        </View>

        <View style={styles.dishCardDetails}>
          <Text style={styles.dishCardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {item.urduName ? (
            <Text style={styles.dishCardUrdu} numberOfLines={1}>
              {item.urduName}
            </Text>
          ) : hasVariants || isWeightDish ? (
            <Text style={styles.dishCardVariantHint} numberOfLines={1}>
              {hasVariants ? `${item.variants?.length} Options` : 'Quarter / Half / 1kg'}
            </Text>
          ) : item.description ? (
            <Text style={styles.dishCardDesc} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.dishCardBottom}>
          <View
            style={[
              styles.galleryPricePill,
              isItemInCart && styles.galleryPricePillActive,
            ]}
          >
            <Text
              style={[
                styles.galleryPriceText,
                isItemInCart && styles.galleryPriceTextActive,
              ]}
            >
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
              >
                <Ionicons name="remove" size={13} color="#FFFFFF" />
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
              >
                <Ionicons name="add" size={13} color="#FFFFFF" />
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
              activeOpacity={0.8}
            >
              <Ionicons
                name={hasVariants || isWeightDish ? 'options-outline' : 'add'}
                size={13}
                color="#1E0408"
              />
              <Text style={styles.galleryQuickAddText}>
                {hasVariants || isWeightDish ? 'CUSTOMIZE' : '+ ADD'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.screenWrapper}>
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ========================================================
              1. REGAL SULTAN COMPACT HERO HEADER
             ======================================================== */}
          <IslamicHeroBackground
            style={[styles.heroBanner, { paddingTop: 10, paddingBottom: 12 }]}
          >
            <View style={styles.heroOverlayContent}>
              <View style={styles.heroTopActions}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {!isMobile && (
                    <TouchableOpacity
                      style={styles.heroNavBtn}
                      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                    >
                      <Ionicons name="arrow-back" size={18} color="#FFF" />
                    </TouchableOpacity>
                  )}
                  {/* Sultan Mini Seal & Brand Name */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <SultanLogo size="sm" width={38} height={34} />
                    <View>
                      <Text style={styles.heroMainTitleMini}>SULTAN RESTAURANT</Text>
                      <Text style={styles.heroSubtitleUrduMini}>
                        سلطان ریستوراں • شاہی دسترخوان
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Right Top Actions: Sound Chime, Fullscreen & My Orders */}
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <FullscreenButton
                    variant="pill"
                    style={{
                      height: 28,
                      backgroundColor: 'rgba(213, 169, 67, 0.14)',
                      borderColor: 'rgba(213, 169, 67, 0.35)',
                      paddingHorizontal: 9,
                    }}
                  />

                  <TouchableOpacity
                    style={styles.heroSoundPill}
                    onPress={() => setSoundMuted(!soundMuted)}
                  >
                    <Ionicons
                      name={soundMuted ? 'volume-mute' : 'volume-high'}
                      size={13}
                      color={soundMuted ? '#EF4444' : '#D5A943'}
                    />
                    <Text
                      style={[
                        styles.heroSoundPillText,
                        soundMuted && { color: '#EF4444' },
                      ]}
                    >
                      {soundMuted ? 'Muted' : 'Sound ON'}
                    </Text>
                  </TouchableOpacity>

                  {orderHistory.length > 0 && (
                    <TouchableOpacity
                      style={styles.heroOrdersPill}
                      onPress={() => setHistoryModalVisible(true)}
                    >
                      <Ionicons name="receipt-outline" size={13} color="#D5A943" />
                      <Text style={styles.heroOrdersPillText}>
                        Orders ({orderHistory.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Compact Unified Dining & Table Floating Bar */}
              <View style={styles.compactDiningBar}>
                {orderMode === 'dine_in' ? (
                  <TouchableOpacity
                    style={styles.compactTablePill}
                    onPress={() => setTableModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.compactTableIconBox}>
                      <Ionicons name="qr-code" size={14} color="#D5A943" />
                    </View>
                    <Text style={styles.compactTablePillText} numberOfLines={1}>
                      {selectedTable?.floor || 'Ground Floor'} •{' '}
                      {selectedTable?.name || 'Table T-01'}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={12}
                      color="#D5A943"
                      style={{ marginLeft: 2 }}
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.compactTablePillDelivery}>
                    <Ionicons name="bicycle" size={14} color="#34D399" />
                    <Text style={styles.compactDeliveryText}>
                      Sultan Express Delivery (35-45m)
                    </Text>
                  </View>
                )}

                {/* Mode Switcher Buttons */}
                <View style={styles.compactModeToggle}>
                  <TouchableOpacity
                    style={[
                      styles.compactModeBtn,
                      orderMode === 'dine_in' && styles.compactModeBtnActive,
                    ]}
                    onPress={() => setOrderMode('dine_in')}
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
              </View>
            </View>
          </IslamicHeroBackground>

          {/* ========================================================
              2. SEARCH, DIETARY & CUISINE FILTERS
             ======================================================== */}
          {/* ========================================================
              2. PROMINENT ROYAL FILTER CONSOLE
             ======================================================== */}
          <View style={styles.filterSectionContainer}>
            <View style={styles.filterConsoleCard}>
              {/* Row 1: Search Input Bar + Quick Active Reset */}
              <View style={styles.searchRow}>
                <View style={styles.searchBar}>
                  <Ionicons
                    name="search"
                    size={20}
                    color="#D5A943"
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search mutton karahi, chicken handi, seekh kababs, kunafa, drinks..."
                    placeholderTextColor="#9E8A79"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery ? (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#895B1E" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {(activeCat !== 'All' ||
                  activeRegion !== 'ALL' ||
                  searchQuery ||
                  dietaryFilter !== 'all') && (
                    <TouchableOpacity
                      style={styles.consoleResetBtn}
                      onPress={() => {
                        setActiveCat('All');
                        setActiveRegion('ALL');
                        setSearchQuery('');
                        setDietaryFilter('all');
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={13} color="#D5A943" style={{ marginRight: 4 }} />
                      <Text style={styles.consoleResetText}>Reset All</Text>
                    </TouchableOpacity>
                  )}
              </View>
            </View>
          </View>

          {/* ========================================================
              3. MAIN CONTENT: DISHES FEED & ORDER TRAY
             ======================================================== */}
          <View style={styles.contentLayoutContainer}>

            {/* Center Dishes Feed & Auto-Sliders */}
            <View style={styles.dishesFeedContainer}>
              <View style={styles.dishesHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.categoryHeading}>
                    {activeCat === 'All' ? 'Front Page Galleries' : activeCat}{' '}
                    {activeRegion !== 'ALL' ? `• ${activeRegion}` : ''}
                  </Text>
                  <Text style={styles.categorySubheading}>
                    {activeCat === 'All' && viewMode === 'gallery' && !searchQuery
                      ? `${groupedCategoryGalleries.length} Signature Categories • Auto-Sliding Dish Showcases`
                      : `${filteredItems.length} authentic dishes prepared to perfection`}
                  </Text>
                </View>

                {/* Right controls: View Mode toggle (Gallery vs Grid) & Reset */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {activeCat === 'All' && !searchQuery && (
                    <View style={styles.viewModeToggleWrap}>
                      <TouchableOpacity
                        style={[
                          styles.viewModeToggleBtn,
                          viewMode === 'gallery' && styles.viewModeToggleBtnActive,
                        ]}
                        onPress={() => setViewMode('gallery')}
                        activeOpacity={0.8}
                        accessibilityLabel="Category Gallery View"
                      >
                        <Ionicons
                          name="images-outline"
                          size={13}
                          color={viewMode === 'gallery' ? '#52171B' : '#777'}
                        />
                        <Text
                          style={[
                            styles.viewModeToggleText,
                            viewMode === 'gallery' && styles.viewModeToggleTextActive,
                          ]}
                        >
                          Auto Sliders
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.viewModeToggleBtn,
                          viewMode === 'grid' && styles.viewModeToggleBtnActive,
                        ]}
                        onPress={() => setViewMode('grid')}
                        activeOpacity={0.8}
                        accessibilityLabel="Grid View"
                      >
                        <Ionicons
                          name="grid-outline"
                          size={13}
                          color={viewMode === 'grid' ? '#52171B' : '#777'}
                        />
                        <Text
                          style={[
                            styles.viewModeToggleText,
                            viewMode === 'grid' && styles.viewModeToggleTextActive,
                          ]}
                        >
                          Grid
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
                          size={12}
                          color="#895B1E"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.activeFilterResetText}>Reset All</Text>
                      </TouchableOpacity>
                    )}
                </View>
              </View>

              {/* Focused Category Hero Banner (shown when a specific category is active) */}
              {activeCat !== 'All' && (
                <View style={styles.focusedCatBanner}>
                  <TouchableOpacity
                    style={styles.backToGalleriesBtn}
                    onPress={() => setActiveCat('All')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="arrow-back" size={15} color="#52171B" />
                    <Text style={styles.backToGalleriesText}>All Galleries</Text>
                  </TouchableOpacity>

                  <View style={styles.focusedCatBannerInfo}>
                    <View style={styles.focusedCatBannerIconBox}>
                      <Text style={styles.focusedCatBannerEmoji}>
                        {getCategoryEmoji(activeCat)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.focusedCatBannerTitle}>{activeCat}</Text>
                      <Text style={styles.focusedCatBannerSubtitle}>
                        {getCategoryUrduOrTagline(activeCat)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Center Content Body */}
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
              ) : activeCat === 'All' && !searchQuery.trim() && viewMode === 'gallery' ? (
                /* Auto-Slider Category Galleries on Front Page */
                <View style={styles.catGalleriesContainer}>
                  {groupedCategoryGalleries.map(({ category, items }) => (
                    <AutoCategorySlider
                      key={category}
                      category={category}
                      items={items}
                      onViewAll={(cat) => setActiveCat(cat)}
                      renderCard={renderGalleryItemCard}
                      isDesktop={isDesktop}
                      isTablet={isTablet}
                      screenWidth={width}
                      getEmoji={getCategoryEmoji}
                      getUrdu={getCategoryUrduOrTagline}
                    />
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
                    <Ionicons name="restaurant-outline" size={42} color="#D5A943" />
                    <Text style={styles.emptyTrayTitle}>Your tray is empty</Text>
                    <Text style={styles.emptyTrayDesc}>
                      Click "+ ADD" on any dish to build your dining order.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.cartPanelBody}>
                    <ScrollView
                      style={{ maxHeight: 340 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {cart.map((c) => (
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
      </View>

      {/* ========================================================
          MODAL 1: DISH CUSTOMIZER / PORTION SIZING
         ======================================================== */}
      <Modal visible={!!customizerItem} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.customizerModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>{customizerItem?.name}</Text>
                {customizerItem?.urduName ? (
                  <Text style={styles.customizerModalUrduTitle}>
                    {customizerItem.urduName}
                  </Text>
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
              {/* Variants */}
              {customizerItem?.variants && customizerItem.variants.length > 0 ? (
                <View style={styles.customizerSection}>
                  <Text style={styles.sectionLabel}>Select Serving Size / Portion:</Text>
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
                  <Text style={styles.sectionLabel}>Select Weight / Portion:</Text>
                  <View style={styles.optionsWrap}>
                    {[
                      { kg: 0.25, label: 'Quarter (0.25 kg)' },
                      { kg: 0.5, label: 'Half (0.5 kg)' },
                      { kg: 1.0, label: 'Full (1.0 kg)' },
                      { kg: 2.0, label: 'Royal Family (2.0 kg)' },
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

              {/* Spice Level */}
              <View style={styles.customizerSection}>
                <Text style={styles.sectionLabel}>Spice Level Preference:</Text>
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

              {/* Cooking Notes */}
              <View style={styles.customizerSection}>
                <Text style={styles.sectionLabel}>Special Cooking Instructions:</Text>
                <TextInput
                  style={styles.customizerNotesInput}
                  placeholder="e.g. Less oil, extra ginger, crisper naan, separate gravy..."
                  placeholderTextColor="#999"
                  value={customizerNotes}
                  onChangeText={setCustomizerNotes}
                />
              </View>
            </ScrollView>

            {/* Customizer Actions */}
            <View style={styles.customizerActionRow}>
              <View style={styles.modalStepper}>
                <TouchableOpacity
                  style={styles.modalStepperBtn}
                  onPress={() => setCustomizerQty(Math.max(1, customizerQty - 1))}
                >
                  <Ionicons name="remove" size={16} color="#3A0F12" />
                </TouchableOpacity>
                <Text style={styles.modalStepperQty}>{customizerQty}</Text>
                <TouchableOpacity
                  style={styles.modalStepperBtn}
                  onPress={() => setCustomizerQty(customizerQty + 1)}
                >
                  <Ionicons name="add" size={16} color="#3A0F12" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.addCustomizerBtn}
                onPress={handleAddFromCustomizer}
              >
                <Text style={styles.addCustomizerBtnText}>Add to Tray</Text>
                <Ionicons name="checkmark-circle" size={18} color="#3A0F12" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 2: FULL CART CHECKOUT MODAL
         ======================================================== */}
      <Modal visible={cartModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.customizerModalCard, { maxHeight: '90%' }]}>
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
                {cart.map((c) => (
                  <View key={c.cartId} style={styles.checkoutItemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.checkoutItemName}>{c.item.name}</Text>
                      {c.portionLabel ? (
                        <Text style={styles.checkoutItemSub}>{c.portionLabel}</Text>
                      ) : null}
                      {c.notes ? (
                        <Text style={styles.checkoutItemNotes}>📝 {c.notes}</Text>
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
                ))}
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
                    { id: 'cash_on_delivery', label: '💵 Cash on Serving/Delivery' },
                    { id: 'card', label: '💳 Credit/Debit Card' },
                    { id: 'jazzcash', label: '📱 JazzCash' },
                    { id: 'easypaisa', label: '📲 EasyPaisa' },
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
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 3: TABLE SELECTOR MODAL
         ======================================================== */}
      <Modal visible={tableModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.customizerModalCard, { maxHeight: '82%' }]}>
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
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 4: LIVE ORDER TRACKER MODAL
         ======================================================== */}
      <Modal visible={trackingModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.customizerModalCard, { maxHeight: '86%' }]}>
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
          </View>
        </View>
      </Modal>

      {/* ========================================================
          MODAL 5: CUSTOMER ORDER HISTORY
         ======================================================== */}
      <Modal visible={historyModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.customizerModalCard, { maxHeight: '86%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customizerModalTitle}>📋 Past Orders</Text>
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
          </View>
        </View>
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

  // 1. Hero Header
  heroBanner: {
    backgroundColor: '#3A0F12',
    borderBottomWidth: 1.5,
    borderBottomColor: '#D5A943',
    paddingHorizontal: 16,
  },
  heroOverlayContent: {
    gap: 10,
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMainTitleMini: {
    color: '#F3D179',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  heroSubtitleUrduMini: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10.5,
    fontWeight: '600',
  },
  heroSoundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(213,169,67,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroSoundPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#F3D179',
  },
  heroOrdersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(213,169,67,0.18)',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroOrdersPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Compact Dining Bar
  compactDiningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(20, 2, 5, 0.65)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(213,169,67,0.25)',
  },
  compactTablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  compactTableIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(213,169,67,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTablePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  compactTablePillDelivery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  compactDeliveryText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '800',
  },
  compactModeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(213,169,67,0.3)',
  },
  compactModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  compactModeBtnActive: {
    backgroundColor: '#D5A943',
  },
  compactModeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  compactModeBtnTextActive: {
    color: '#1E0408',
    fontWeight: '900',
  },

  // 2. Prominent Filter Console Section
  filterSectionContainer: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  filterConsoleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#DFCBB5',
    padding: 14,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 6px 20px rgba(58, 15, 18, 0.06)',
      } as any,
      default: {
        shadowColor: '#3A0F12',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF8F5',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.4,
    borderColor: '#E2D4C3',
    ...Platform.select({
      web: {
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)',
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

  // Gallery Dish Card
  galleryDishCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 236,
    borderWidth: 1.4,
    borderColor: '#E8DED3',
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
      } as any,
    }),
  },
  galleryDishCardInCart: {
    borderColor: '#52171B',
    backgroundColor: '#FFFDF9',
    ...Platform.select({
      web: {
        boxShadow: '0 6px 16px rgba(82, 23, 27, 0.12)',
      } as any,
    }),
  },
  inCartBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  inCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  galleryCardImageWrapper: {
    width: '100%',
    height: 118,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
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
    backgroundColor: '#F8F1EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryRegionChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(58, 15, 18, 0.88)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 0.8,
    borderColor: 'rgba(213, 169, 67, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 4,
  },
  dishCardRegionText: {
    fontSize: 9,
    color: '#F3D179',
    fontWeight: '800',
  },
  dishCardBadgeTag: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#D5A943',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 4,
  },
  dishCardBadgeText: {
    fontSize: 9,
    color: '#1E0408',
    fontWeight: '900',
  },
  dishSoldOutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  dishSoldOutText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  galleryDishTitleWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  galleryDishTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E0408',
    textAlign: 'center',
  },
  galleryDishUrdu: {
    fontSize: 11,
    color: '#895B1E',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '600',
  },
  galleryDishDesc: {
    fontSize: 10.5,
    color: '#777',
    marginTop: 2,
    textAlign: 'center',
  },
  dishCardVariantHint: {
    fontSize: 10,
    color: '#B45309',
    marginTop: 2,
    fontWeight: '700',
  },
  galleryCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0E6DC',
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
    fontSize: 12,
    fontWeight: '900',
    color: '#52171B',
  },
  galleryPriceTextActive: {
    color: '#F3D179',
  },
  galleryQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 3,
  },
  galleryQuickAddText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#1E0408',
  },
  cardStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#52171B',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 6,
  },
  cardStepperBtnMini: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStepperCount: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '900',
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

  // Grid view (fallback / search)
  dishesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dishCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1.2,
    borderColor: '#E8DED3',
    marginBottom: 6,
  },
  dishCardInCart: {
    borderColor: '#52171B',
    backgroundColor: '#FFFDF9',
  },
  dishCardImageWrapper: {
    width: '100%',
    height: 110,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 8,
  },
  dishCardDetails: {
    marginBottom: 8,
  },
  dishCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E0408',
  },
  dishCardUrdu: {
    fontSize: 11,
    color: '#895B1E',
    marginTop: 2,
  },
  dishCardDesc: {
    fontSize: 10.5,
    color: '#777',
    marginTop: 2,
  },
  dishCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0E6DC',
  },

  // Desktop Order Tray Panel
  desktopCartPanel: {
    width: 310,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#E8DED3',
    padding: 14,
    alignSelf: 'flex-start',
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(0,0,0,0.04)' } as any,
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
    backgroundColor: '#D5A943',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  addCustomizerBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E0408',
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
    fontSize: 11,
    fontWeight: '800',
    color: '#F3D179',
  },
});
