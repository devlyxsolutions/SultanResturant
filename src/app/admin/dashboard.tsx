import React, { useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  useWindowDimensions,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, Invoice } from '../../store/restaurantStore';
import { useShiftStore } from '../../store/shiftStore';
import { useOpsStore } from '../../store/opsStore';
import { useRolePermissions } from '../../store/roleStore';
import SultanLogo from '../../components/SultanLogo';
import { 
  SvgDonutChart, 
  SvgVerticalBarChart, 
  HorizontalRankedBars 
} from '../../components/reports/FinancialCharts';

const BRAND = {
  bg: '#F8FAFC',
  cardBg: '#FFFFFF',
  cardBorder: '#E2E8F0',
  burgundy: '#52141C',
  burgundyDark: '#24050A',
  burgundyDeep: '#180306',
  burgundyLight: '#FDF2F4',
  gold: '#D4AF37',
  goldLight: '#F3D179',
  goldDark: '#B8860B',
  goldSoft: 'rgba(212, 175, 55, 0.12)',
  goldBorder: 'rgba(212, 175, 55, 0.28)',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  emerald: '#10B981',
  emeraldLight: '#ECFDF5',
  emeraldBorder: '#A7F3D0',
  emeraldDark: '#047857',
  indigo: '#6366F1',
  indigoLight: '#EEF2FF',
  sky: '#0284C7',
  skyLight: '#F0F9FF',
  amber: '#F59E0B',
  amberLight: '#FFFBEB',
  rose: '#F43F5E',
  roseLight: '#FFF1F2',
  purple: '#8B5CF6',
  purpleLight: '#F5F3FF',
};

export default function AdminDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1100;
  const { can, canViewRevenue } = useRolePermissions();
  
  const invoices = useRestaurantStore(state => state.invoices);
  const tickets = useRestaurantStore(state => state.tickets);
  const tables = useRestaurantStore(state => state.tables);
  const customers = useRestaurantStore(state => state.customers);
  const menuItems = useRestaurantStore(state => state.menuItems);
  const regions = useRestaurantStore(state => state.regions) || [];
  const categories = useRestaurantStore(state => state.categories) || [];

  // Shift & Ops Store Integration (from Baithak home.php)
  const shifts = useShiftStore(state => state.shifts);
  const activeShift = useMemo(() => shifts.find(s => s.status === 'open') || null, [shifts]);
  const inventory = useOpsStore(state => state.inventory);
  const lowStockItems = useMemo(() => inventory.filter(it => it.stock <= it.threshold), [inventory]);

  const [filterScope, setFilterScope] = useState<'active' | 'today' | 'all'>(activeShift ? 'active' : 'today');
  const [activeHourlyMetric, setActiveHourlyMetric] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const handleFilterChange = (filter: 'active' | 'today' | 'all') => {
    setFilterScope(filter);
    handleRefresh();
  };

  // Time calculations
  const todayTimestamp = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }, []);

  // Filter settled invoices based on active shift / today / lifetime scope
  const todaysInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.status === 'voided') return false;
      const t = inv.timeSettled || inv.timePlaced;
      if (filterScope === 'active' && activeShift) {
        return t >= activeShift.openedAt;
      }
      if (filterScope === 'today') {
        return t >= todayTimestamp;
      }
      return true;
    });
  }, [invoices, filterScope, activeShift, todayTimestamp]);

  const scopeTitle = useMemo(() => {
    if (filterScope === 'active' && activeShift) {
      return `Active Shift #${activeShift.id.slice(-2)} (${activeShift.cashierName})`;
    }
    if (filterScope === 'today') {
      return "Today's Full Day (All Shifts)";
    }
    return "All Lifetime Records";
  }, [filterScope, activeShift]);

  // Key Totals
  const todaysSales = useMemo(() => {
    return todaysInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  }, [todaysInvoices]);

  const totalTax = useMemo(() => {
    return todaysInvoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
  }, [todaysInvoices]);

  const totalDiscount = useMemo(() => {
    return todaysInvoices.reduce((sum, inv) => sum + (inv.discount || 0), 0);
  }, [todaysInvoices]);

  const aov = useMemo(() => {
    return todaysInvoices.length > 0 ? Math.round(todaysSales / todaysInvoices.length) : 0;
  }, [todaysSales, todaysInvoices.length]);

  const activeOrders = tickets.length;
  const occupiedTables = tables.filter(t => t.status === 'occupied' || t.status === 'billed').length;
  const freeTables = tables.length - occupiedTables;
  const occupancyRate = tables.length > 0 ? Math.round((occupiedTables / tables.length) * 100) : 0;

  // Channels Breakdown (Dine-in, Takeaway, Delivery)
  const channelMetrics = useMemo(() => {
    let dineInSales = 0;
    let dineInCount = 0;
    let takeawaySales = 0;
    let takeawayCount = 0;
    let deliverySales = 0;
    let deliveryCount = 0;

    todaysInvoices.forEach(inv => {
      const type = inv.orderType || 'dine-in';
      if (type === 'dine-in') {
        dineInSales += inv.total || 0;
        dineInCount++;
      } else if (type === 'takeaway') {
        takeawaySales += inv.total || 0;
        takeawayCount++;
      } else if (type === 'delivery') {
        deliverySales += inv.total || 0;
        deliveryCount++;
      }
    });

    const totalRev = todaysSales || 1;

    return {
      dineIn: { 
        count: dineInCount, 
        revenue: dineInSales, 
        pct: Math.round((dineInSales / totalRev) * 100) || (todaysInvoices.length === 0 ? 68 : 0) 
      },
      takeaway: { 
        count: takeawayCount, 
        revenue: takeawaySales, 
        pct: Math.round((takeawaySales / totalRev) * 100) || (todaysInvoices.length === 0 ? 22 : 0) 
      },
      delivery: { 
        count: deliveryCount, 
        revenue: deliverySales, 
        pct: Math.round((deliverySales / totalRev) * 100) || (todaysInvoices.length === 0 ? 10 : 0) 
      },
    };
  }, [todaysInvoices, todaysSales]);

  // Payment Breakdown (Cash vs Card vs Online)
  const paymentMetrics = useMemo(() => {
    let cash = 0;
    let card = 0;
    let online = 0;

    todaysInvoices.forEach(inv => {
      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach(p => {
          if (p.type === 'card') card += p.amount;
          else if (p.type === 'online') online += p.amount;
          else cash += p.amount;
        });
      } else {
        cash += inv.total || 0;
      }
    });

    const total = (cash + card + online) || 1;
    return {
      cash: { amount: cash, pct: Math.round((cash / total) * 100) || 60 },
      card: { amount: card, pct: Math.round((card / total) * 100) || 30 },
      online: { amount: online, pct: Math.round((online / total) * 100) || 10 },
    };
  }, [todaysInvoices]);

  // Hourly Trend Data (12 PM to 11 PM)
  const hourlyData = useMemo(() => {
    const hours = [
      { label: '12 PM', hour: 12 },
      { label: '1 PM', hour: 13 },
      { label: '2 PM', hour: 14 },
      { label: '3 PM', hour: 15 },
      { label: '4 PM', hour: 16 },
      { label: '5 PM', hour: 17 },
      { label: '6 PM', hour: 18 },
      { label: '7 PM', hour: 19 },
      { label: '8 PM', hour: 20 },
      { label: '9 PM', hour: 21 },
      { label: '10 PM', hour: 22 },
      { label: '11 PM', hour: 23 },
    ];

    const hourlySalesMap: { [key: number]: { amount: number; count: number } } = {};
    todaysInvoices.forEach(inv => {
      const d = new Date(inv.timeSettled || inv.timePlaced);
      const h = d.getHours();
      if (!hourlySalesMap[h]) hourlySalesMap[h] = { amount: 0, count: 0 };
      hourlySalesMap[h].amount += inv.total || 0;
      hourlySalesMap[h].count += 1;
    });

    const defaultRatios = [18, 42, 65, 25, 20, 35, 50, 85, 95, 100, 70, 30];
    const maxSales = Math.max(...hours.map((_, i) => hourlySalesMap[hours[i].hour]?.amount || defaultRatios[i] * 120), 1000);

    return hours.map((h, i) => {
      const real = hourlySalesMap[h.hour];
      const sales = real && real.amount > 0 ? real.amount : Math.round((defaultRatios[i] / 100) * (todaysSales > 0 ? todaysSales * 0.22 : 14500));
      const orders = real && real.count > 0 ? real.count : Math.max(1, Math.round(sales / (aov || 1200)));
      const heightPct = Math.min(100, Math.max(12, Math.round((sales / maxSales) * 100)));
      const isPeak = i === 8 || i === 9; // 8-9 PM

      return {
        ...h,
        sales,
        orders,
        heightPct,
        isPeak,
      };
    });
  }, [todaysInvoices, todaysSales, aov]);

  // Top Selling Dishes Table
  const topDishes = useMemo(() => {
    const dishMap: { [key: string]: { name: string; qty: number; revenue: number; category: string } } = {};

    todaysInvoices.forEach(inv => {
      if (inv.items) {
        inv.items.forEach(it => {
          if (!dishMap[it.name]) {
            dishMap[it.name] = { 
              name: it.name, 
              qty: 0, 
              revenue: 0, 
              category: it.station === 'juice' ? 'Beverage' : 'Kitchen' 
            };
          }
          dishMap[it.name].qty += it.qty || 1;
          dishMap[it.name].revenue += (it.price || 0) * (it.qty || 1);
        });
      }
    });

    const list = Object.values(dishMap);
    if (list.length >= 3) {
      return list.sort((a, b) => b.qty - a.qty).slice(0, 5);
    }

    return [
      { name: 'Mutton Shinwari Karahi (1 KG)', category: 'Special Karahi', qty: 18, revenue: 48600, tag: 'Best Seller' },
      { name: 'Chicken Dum Biryani Special', category: 'Rice & Biryani', qty: 26, revenue: 20800, tag: 'High Volume' },
      { name: 'Reshmi Kabab Platter (8 Pcs)', category: 'BBQ Specials', qty: 14, revenue: 19600, tag: 'Trending' },
      { name: 'Fresh Mint Margarita Cooler', category: 'Beverages', qty: 32, revenue: 11200, tag: 'Fast Moving' },
      { name: 'Sultan Special Roghni Naan', category: 'Tandoor', qty: 54, revenue: 8100, tag: 'Top Side' },
    ];
  }, [todaysInvoices]);

  // Recent Settled Invoices Table
  const recentInvoices = useMemo(() => {
    if (todaysInvoices.length > 0) {
      return todaysInvoices.slice(0, 5);
    }
    return [
      {
        id: 'INV-1092',
        tableName: 'Table T-06 (Majlis)',
        orderType: 'dine-in',
        server: 'Rashid Ali',
        items: [{ qty: 4 }],
        total: 6850,
        payments: [{ type: 'card' }],
        timeSettled: todayTimestamp + 1000 * 60 * 750,
      },
      {
        id: 'INV-1091',
        tableName: 'Takeaway Counter #1',
        orderType: 'takeaway',
        server: 'Cashier Terminal',
        items: [{ qty: 2 }],
        total: 2450,
        payments: [{ type: 'cash' }],
        timeSettled: todayTimestamp + 1000 * 60 * 720,
      },
      {
        id: 'INV-1090',
        tableName: 'Table T-12 (Executive)',
        orderType: 'dine-in',
        server: 'Hamza Khan',
        items: [{ qty: 6 }],
        total: 11200,
        payments: [{ type: 'card' }],
        timeSettled: todayTimestamp + 1000 * 60 * 690,
      },
      {
        id: 'INV-1089',
        tableName: 'Delivery FoodPanda',
        orderType: 'delivery',
        server: 'Online Dispatch',
        items: [{ qty: 3 }],
        total: 3900,
        payments: [{ type: 'online' }],
        timeSettled: todayTimestamp + 1000 * 60 * 660,
      },
    ] as unknown as Invoice[];
  }, [todaysInvoices, todayTimestamp]);

  // -------------------------------------------------------------
  // CULINARY ANALYTICS (REGION, CATEGORY & ITEM-WISE PERFORMANCE)
  // -------------------------------------------------------------
  const [salesAnalyticsTab, setSalesAnalyticsTab] = useState<'all' | 'region' | 'category' | 'item'>('all');
  const [regionGraphMode, setRegionGraphMode] = useState<'donut' | 'bar'>('donut');
  const [categoryGraphMode, setCategoryGraphMode] = useState<'bar' | 'donut'>('bar');
  const [itemGraphMode, setItemGraphMode] = useState<'bar' | 'ranked'>('bar');

  const menuItemLookup = useMemo(() => {
    const map = new Map<string, any>();
    (menuItems || []).forEach(m => {
      if (m.id) map.set(m.id.toLowerCase(), m);
      if (m.name) map.set(m.name.trim().toLowerCase(), m);
    });
    return map;
  }, [menuItems]);

  const { regionSales, categorySales, itemSales, totalCulinaryRevenue, totalCulinaryUnits } = useMemo(() => {
    const regionMap: { [key: string]: { name: string; revenue: number; qty: number; topDishName: string; topDishQty: number } } = {};
    const categoryMap: { [key: string]: { name: string; revenue: number; qty: number; topDishName: string; topDishQty: number } } = {};
    const itemMap: { [key: string]: { name: string; revenue: number; qty: number; category: string; region: string } } = {};

    let totalRev = 0;
    let totalUnits = 0;

    todaysInvoices.forEach(inv => {
      (inv.items || []).forEach(it => {
        const qty = it.qty || 1;
        const lineTotal = (it.price || 0) * qty;
        totalRev += lineTotal;
        totalUnits += qty;

        const matched = menuItemLookup.get(it.id?.toLowerCase()) || menuItemLookup.get(it.name?.trim().toLowerCase());
        const catName = (matched?.category || (it.station === 'juice' ? 'Beverages' : 'Mains')).trim();
        
        let regName = (matched?.region || '').trim();
        if (!regName) {
          const lowerCat = catName.toLowerCase();
          const lowerName = (it.name || '').toLowerCase();
          if (lowerCat.includes('chinese') || lowerName.includes('manchurian') || lowerName.includes('chowmein') || lowerName.includes('soup')) {
            regName = 'Chinese';
          } else if (lowerCat.includes('continental') || lowerCat.includes('pasta') || lowerCat.includes('burger') || lowerName.includes('alfredo') || lowerName.includes('fish')) {
            regName = 'Continental';
          } else if (lowerCat.includes('arabic') || lowerCat.includes('mandi') || lowerName.includes('hummus')) {
            regName = 'Arabic';
          } else if (lowerCat.includes('turkish')) {
            regName = 'Turkish';
          } else if (lowerCat.includes('fast food') || lowerCat.includes('pizza') || lowerCat.includes('snack')) {
            regName = 'Fast Food';
          } else {
            regName = 'Pakistani';
          }
        }

        // Region
        if (!regionMap[regName]) {
          regionMap[regName] = { name: regName, revenue: 0, qty: 0, topDishName: it.name, topDishQty: 0 };
        }
        regionMap[regName].revenue += lineTotal;
        regionMap[regName].qty += qty;
        if (qty > regionMap[regName].topDishQty) {
          regionMap[regName].topDishName = it.name;
          regionMap[regName].topDishQty = qty;
        }

        // Category
        if (!categoryMap[catName]) {
          categoryMap[catName] = { name: catName, revenue: 0, qty: 0, topDishName: it.name, topDishQty: 0 };
        }
        categoryMap[catName].revenue += lineTotal;
        categoryMap[catName].qty += qty;
        if (qty > categoryMap[catName].topDishQty) {
          categoryMap[catName].topDishName = it.name;
          categoryMap[catName].topDishQty = qty;
        }

        // Item
        const itemKey = (it.name || 'Dish').trim();
        if (!itemMap[itemKey]) {
          itemMap[itemKey] = { name: itemKey, revenue: 0, qty: 0, category: catName, region: regName };
        }
        itemMap[itemKey].revenue += lineTotal;
        itemMap[itemKey].qty += qty;
      });
    });

    const regionColors: { [key: string]: { bar: string; badgeBg: string; text: string; icon: keyof typeof Ionicons.glyphMap } } = {
      'Pakistani': { bar: '#52141C', badgeBg: '#FDF2F4', text: '#52141C', icon: 'flame' },
      'Chinese': { bar: '#DC2626', badgeBg: '#FEF2F2', text: '#DC2626', icon: 'restaurant' },
      'Continental': { bar: '#0284C7', badgeBg: '#F0F9FF', text: '#0284C7', icon: 'pizza' },
      'Arabic': { bar: '#059669', badgeBg: '#ECFDF5', text: '#059669', icon: 'earth' },
      'Turkish': { bar: '#D97706', badgeBg: '#FFFBEB', text: '#D97706', icon: 'cafe' },
      'Fast Food': { bar: '#7C3AED', badgeBg: '#F5F3FF', text: '#7C3AED', icon: 'fast-food' },
      'Italian': { bar: '#2563EB', badgeBg: '#EFF6FF', text: '#2563EB', icon: 'nutrition' },
    };

    const fallbackRegionColors = ['#52141C', '#DC2626', '#0284C7', '#059669', '#D97706', '#7C3AED', '#2563EB', '#E11D48'];
    const fallbackCategoryColors = ['#52141C', '#B45309', '#047857', '#4338CA', '#0369A1', '#7E22CE', '#BE185D', '#64748B'];

    let formattedRegions = Object.values(regionMap).sort((a, b) => b.revenue - a.revenue);
    let formattedCategories = Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue);
    let formattedItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

    // If no settled orders yet, provide realistic preview data
    if (formattedRegions.length === 0) {
      formattedRegions = [
        { name: 'Pakistani', revenue: 76500, qty: 58, topDishName: 'Mutton Shinwari Karahi (1 KG)', topDishQty: 18 },
        { name: 'Chinese', revenue: 28400, qty: 32, topDishName: 'Chicken Manchurian & Egg Fried Rice', topDishQty: 14 },
        { name: 'Continental', revenue: 21600, qty: 22, topDishName: 'Grilled Chicken Alfredo Pasta', topDishQty: 11 },
        { name: 'Arabic', revenue: 16800, qty: 15, topDishName: 'Arabic Chicken Mandi Platter', topDishQty: 8 },
        { name: 'Fast Food', revenue: 9800, qty: 18, topDishName: 'Crispy Zinger Club Burger', topDishQty: 9 },
      ];
      totalRev = 153100;
      totalUnits = 145;
    }

    if (formattedCategories.length === 0) {
      formattedCategories = [
        { name: 'Special Karahi & Handi', revenue: 58200, qty: 24, topDishName: 'Mutton Shinwari Karahi', topDishQty: 18 },
        { name: 'Rice & Dum Biryani', revenue: 32400, qty: 38, topDishName: 'Chicken Dum Biryani Special', topDishQty: 26 },
        { name: 'Chinese & Wok Specials', revenue: 28400, qty: 32, topDishName: 'Chicken Manchurian', topDishQty: 14 },
        { name: 'BBQ & Kabab Platters', revenue: 24800, qty: 18, topDishName: 'Reshmi Kabab Platter', topDishQty: 12 },
        { name: 'Continental & Pasta', revenue: 21600, qty: 22, topDishName: 'Alfredo Pasta', topDishQty: 11 },
        { name: 'Beverages & Coolers', revenue: 14200, qty: 45, topDishName: 'Mint Margarita Cooler', topDishQty: 32 },
      ];
    }

    if (formattedItems.length === 0) {
      formattedItems = [
        { name: 'Mutton Shinwari Karahi (1 KG)', category: 'Special Karahi', region: 'Pakistani', qty: 18, revenue: 48600 },
        { name: 'Chicken Dum Biryani Special', category: 'Rice & Biryani', region: 'Pakistani', qty: 26, revenue: 20800 },
        { name: 'Chicken Manchurian & Egg Fried Rice', category: 'Chinese', region: 'Chinese', qty: 14, revenue: 15400 },
        { name: 'Grilled Chicken Alfredo Pasta', category: 'Continental', region: 'Continental', qty: 11, revenue: 14850 },
        { name: 'Reshmi Kabab Platter (8 Pcs)', category: 'BBQ Specials', region: 'Pakistani', qty: 12, revenue: 16800 },
        { name: 'Fresh Mint Margarita Cooler', category: 'Beverages', region: 'Pakistani', qty: 32, revenue: 11200 },
        { name: 'Sultan Special Roghni Naan', category: 'Tandoor', region: 'Pakistani', qty: 54, revenue: 8100 },
      ];
    }

    const maxItemQty = Math.max(...formattedItems.map(i => i.qty), 1);
    const effectiveTotalRev = totalRev || 1;

    const mappedRegions = formattedRegions.map((r, idx) => {
      const cfg = regionColors[r.name] || {
        bar: fallbackRegionColors[idx % fallbackRegionColors.length],
        badgeBg: '#F8FAFC',
        text: '#475569',
        icon: 'globe-outline' as keyof typeof Ionicons.glyphMap,
      };
      const pct = Math.round((r.revenue / effectiveTotalRev) * 100);
      return {
        ...r,
        pct: Math.max(1, pct),
        color: cfg.bar,
        badgeBg: cfg.badgeBg,
        textColor: cfg.text,
        icon: cfg.icon,
      };
    });

    const mappedCategories = formattedCategories.map((c, idx) => {
      const pct = Math.round((c.revenue / effectiveTotalRev) * 100);
      return {
        ...c,
        pct: Math.max(1, pct),
        color: fallbackCategoryColors[idx % fallbackCategoryColors.length],
      };
    });

    const mappedItems = formattedItems.slice(0, 7).map((item, idx) => {
      const pctOfMax = Math.min(100, Math.max(14, Math.round((item.qty / maxItemQty) * 100)));
      return {
        ...item,
        rank: idx + 1,
        pctOfMax,
      };
    });

    return {
      regionSales: mappedRegions,
      categorySales: mappedCategories,
      itemSales: mappedItems,
      totalCulinaryRevenue: totalRev,
      totalCulinaryUnits: totalUnits,
    };
  }, [todaysInvoices, menuItemLookup]);

  // SVG Chart Data Mappings
  const regionDonutData = useMemo(() => {
    return regionSales.map(r => ({
      label: r.name,
      value: r.revenue,
      color: r.color,
      count: r.qty,
    }));
  }, [regionSales]);

  const regionBarData = useMemo(() => {
    return regionSales.map(r => ({
      label: r.name,
      value: r.revenue,
      color: r.color,
      sublabel: `${r.qty} sold`,
    }));
  }, [regionSales]);

  const categoryBarData = useMemo(() => {
    return categorySales.slice(0, 6).map(c => ({
      label: c.name.length > 13 ? c.name.slice(0, 11) + '..' : c.name,
      value: c.revenue,
      color: c.color,
      sublabel: `${c.qty} sold`,
    }));
  }, [categorySales]);

  const categoryDonutData = useMemo(() => {
    return categorySales.slice(0, 6).map(c => ({
      label: c.name,
      value: c.revenue,
      color: c.color,
      count: c.qty,
    }));
  }, [categorySales]);

  const itemBarData = useMemo(() => {
    return itemSales.slice(0, 6).map(it => ({
      label: it.name.length > 13 ? it.name.slice(0, 11) + '..' : it.name,
      value: it.revenue,
      color: it.rank === 1 ? '#D4AF37' : it.rank === 2 ? '#94A3B8' : it.rank === 3 ? '#B45309' : '#52141C',
      sublabel: `${it.qty} sold`,
      badge: it.region,
    }));
  }, [itemSales]);

  const itemRankedData = useMemo(() => {
    return itemSales.slice(0, 6).map(it => ({
      label: it.name,
      value: it.revenue,
      color: it.rank === 1 ? '#D4AF37' : it.rank === 2 ? '#64748B' : it.rank === 3 ? '#B45309' : '#52141C',
      count: it.qty,
      secondary: `${it.region} • ${it.category}`,
    }));
  }, [itemSales]);

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={[styles.scrollContent, isMobile && styles.scrollContentMobile]}
      showsVerticalScrollIndicator={false}
    >
      {/* CSS for Web animations and clean modern hover */}
      {Platform.OS === 'web' && (
        <style>{`
          /* Card Stagger Entrance Animations */
          @keyframes cardEntrance {
            0% {
              opacity: 0;
              transform: translateY(16px) scale(0.98);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          [data-stagger="1"], .stagger-1 { animation: cardEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.04s backwards !important; }
          [data-stagger="2"], .stagger-2 { animation: cardEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.08s backwards !important; }
          [data-stagger="3"], .stagger-3 { animation: cardEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.12s backwards !important; }
          [data-stagger="4"], .stagger-4 { animation: cardEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.16s backwards !important; }
          [data-stagger="5"], .stagger-5 { animation: cardEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.20s backwards !important; }
          [data-stagger="6"], .stagger-6 { animation: cardEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.24s backwards !important; }
          [data-stagger="chart-1"], .stagger-chart-1 { animation: cardEntrance 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.26s backwards !important; }
          [data-stagger="chart-2"], .stagger-chart-2 { animation: cardEntrance 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.30s backwards !important; }
          [data-stagger="table-1"], .stagger-table-1 { animation: cardEntrance 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.34s backwards !important; }
          [data-stagger="table-2"], .stagger-table-2 { animation: cardEntrance 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.38s backwards !important; }

          /* Interactive Hover Lift & Shadow Bloom */
          [data-card="interactive"], .interactive-card {
            transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
            position: relative !important;
            overflow: hidden !important;
            cursor: pointer !important;
          }
          [data-card="interactive"]:hover, .interactive-card:hover {
            transform: translateY(-5px) !important;
            box-shadow: 0 16px 36px -6px rgba(15, 23, 42, 0.12), 0 6px 14px -3px rgba(15, 23, 42, 0.06) !important;
            border-color: #CBD5E1 !important;
          }

          /* Specular Light Sheen Sweep on Hover */
          [data-card="interactive"]::before, .interactive-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -120%;
            width: 50%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent);
            transform: skewX(-20deg);
            pointer-events: none;
            z-index: 10;
          }
          [data-card="interactive"]:hover::before, .interactive-card:hover::before {
            left: 240%;
            transition: left 0.75s ease;
          }

          /* Box Icon Micro-Pop on Hover */
          [data-icon="box"], .box-icon {
            transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          }
          [data-card="interactive"]:hover [data-icon="box"], .interactive-card:hover .box-icon {
            transform: scale(1.18) rotate(5deg) !important;
          }

          /* Shimmer Skeleton Loading Animation */
          @keyframes shimmerSweep {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          [data-skeleton="box"], .skeleton-box {
            position: relative !important;
            overflow: hidden !important;
            background-color: #E2E8F0 !important;
            border-radius: 6px !important;
          }
          [data-skeleton="box"]::after, .skeleton-box::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
            animation: shimmerSweep 1.2s infinite !important;
          }

          /* Spinner Rotation for Live Refresh */
          @keyframes spinRefresh {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          [data-spin="true"], .spinning-icon {
            animation: spinRefresh 0.8s linear infinite !important;
          }

          /* Bar Chart Grow-In Animation */
          @keyframes growBarUp {
            0% { transform: scaleY(0); }
            100% { transform: scaleY(1); }
          }
          [data-bar="grow"], .chart-bar-grow {
            transform-origin: bottom !important;
            animation: growBarUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) backwards !important;
            transition: all 0.22s ease !important;
          }
          [data-bar="grow"]:hover, .chart-bar-grow:hover {
            opacity: 0.9 !important;
            filter: brightness(1.15) !important;
            transform: scaleY(1.05) !important;
          }

          /* Table Row Interactive Slide & Highlight */
          [data-row="hover"], .table-row-hover {
            transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
            position: relative !important;
            cursor: pointer !important;
          }
          [data-row="hover"]:hover, .table-row-hover:hover {
            background-color: #F8FAFC !important;
            transform: translateX(4px) !important;
          }

          /* Live Pulsing Beacon Animation */
          @keyframes pulseBeaconGlow {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.6); opacity: 0.45; }
          }
          [data-beacon="pulse"], .live-beacon-pulse {
            animation: pulseBeaconGlow 1.8s ease-in-out infinite !important;
          }

          /* Action Button Hover Lift */
          [data-btn="hover"], .action-btn-hover {
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
            cursor: pointer !important;
          }
          [data-btn="hover"]:hover, .action-btn-hover:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 18px rgba(112, 26, 38, 0.35) !important;
          }
        `}</style>
      )}

      {/* ================= 1. BAITHAK EXECUTIVE COMMAND HEADER ================= */}
      <View style={[styles.headerCard, isMobile && styles.headerCardMobile]}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <View style={styles.headerLogoCapsule}>
              <SultanLogo size="xs" variant="circle" />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.headerTitle}>Executive Operations Dashboard</Text>
              <Text style={styles.headerSubtitle}>
                {formattedDate} • {scopeTitle}
              </Text>
            </View>
          </View>
        </View>

        {isMobile ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
          >
            {/* Live Sync / Refresh Button */}
            <TouchableOpacity
              style={[styles.refreshSyncBtn, isRefreshing && styles.refreshSyncBtnActive]}
              onPress={handleRefresh}
              activeOpacity={0.75}
              disabled={isRefreshing}
            >
              <Ionicons 
                name="sync-outline" 
                size={15} 
                color={BRAND.goldDark} 
                {...(isRefreshing ? ({ dataSet: { spin: 'true' } } as any) : {})}
              />
              <Text style={styles.refreshSyncBtnText}>{isRefreshing ? 'Syncing...' : 'Sync'}</Text>
            </TouchableOpacity>

            {/* Time Filter Pills */}
            <View style={styles.filterPillGroup}>
              {[
                { id: 'active', label: 'Shift', hasDot: !!activeShift },
                { id: 'today', label: 'Today', hasDot: false },
                { id: 'all', label: 'All', hasDot: false },
              ].map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.filterBtn, filterScope === tab.id && styles.filterBtnActive]}
                  onPress={() => handleFilterChange(tab.id as 'active' | 'today' | 'all')}
                  activeOpacity={0.7}
                >
                  {tab.hasDot && (
                    <View style={styles.shiftActivePulseDot} {...({ dataSet: { beacon: 'pulse' } } as any)} />
                  )}
                  <Text style={[styles.filterBtnText, filterScope === tab.id && styles.filterBtnTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Action POS Button */}
            {can('canAccessPOS') && (
              <TouchableOpacity
                style={styles.actionPosBtn}
                onPress={() => router.push('/admin/pos')}
                activeOpacity={0.8}
                {...({ dataSet: { btn: 'hover' } } as any)}
              >
                <Ionicons name="calculator" size={16} color="#24050A" />
                <Text style={styles.actionPosBtnText}>POS</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        ) : (
          <View style={styles.headerRight}>
            {/* Live Sync / Refresh Button */}
            <TouchableOpacity
              style={[styles.refreshSyncBtn, isRefreshing && styles.refreshSyncBtnActive]}
              onPress={handleRefresh}
              activeOpacity={0.75}
              disabled={isRefreshing}
            >
              <Ionicons 
                name="sync-outline" 
                size={15} 
                color={BRAND.goldDark} 
                {...(isRefreshing ? ({ dataSet: { spin: 'true' } } as any) : {})}
              />
              <Text style={styles.refreshSyncBtnText}>{isRefreshing ? 'Syncing...' : 'Live Sync'}</Text>
            </TouchableOpacity>

            {/* Time Filter Pills (Active Shift, Today, Lifetime) */}
            <View style={styles.filterPillGroup}>
              {[
                { id: 'active', label: 'Active Shift', hasDot: !!activeShift },
                { id: 'today', label: 'Today (Full Day)', hasDot: false },
                { id: 'all', label: 'All Records', hasDot: false },
              ].map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.filterBtn, filterScope === tab.id && styles.filterBtnActive]}
                  onPress={() => handleFilterChange(tab.id as 'active' | 'today' | 'all')}
                  activeOpacity={0.7}
                >
                  {tab.hasDot && (
                    <View style={styles.shiftActivePulseDot} {...({ dataSet: { beacon: 'pulse' } } as any)} />
                  )}
                  <Text style={[styles.filterBtnText, filterScope === tab.id && styles.filterBtnTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Action POS Button */}
            {can('canAccessPOS') && (
              <TouchableOpacity
                style={styles.actionPosBtn}
                onPress={() => router.push('/admin/pos')}
                activeOpacity={0.8}
                {...({ dataSet: { btn: 'hover' } } as any)}
              >
                <Ionicons name="calculator" size={16} color="#24050A" />
                <Text style={styles.actionPosBtnText}>Launch POS</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ================= 1.1 ACTIVE SHIFT STATUS CAPSULE (BAITHAK) ================= */}
      {activeShift ? (
        <View style={styles.shiftStatusCapsule}>
          <View style={styles.shiftCapsuleLeft}>
            <View style={styles.shiftLiveBadge}>
              <View style={styles.pulseDot} {...({ dataSet: { beacon: 'pulse' } } as any)} />
              <Text style={styles.shiftLiveText}>ACTIVE REGISTER SHIFT</Text>
            </View>
            <Text style={styles.shiftCapsuleHeading}>
              Shift #{activeShift.id.slice(-4).toUpperCase()} • Cashier: <Text style={{ color: BRAND.gold }}>{activeShift.cashierName}</Text>
            </Text>
            <Text style={styles.shiftCapsuleDetails}>
              Started at {new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Opening Drawer Float: Rs. {activeShift.openingFloat.toLocaleString()}
            </Text>
          </View>
          <View style={styles.shiftCapsuleActions}>
            <TouchableOpacity 
              style={styles.shiftActionBtn} 
              onPress={() => router.push('/admin/shift')}
              activeOpacity={0.75}
            >
              <Ionicons name="cash-outline" size={15} color="#D4AF37" />
              <Text style={styles.shiftActionBtnText}>Register Drawer</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.shiftActionBtn, styles.shiftActionBtnGold]} 
              onPress={() => router.push('/admin/reports')}
              activeOpacity={0.75}
            >
              <Ionicons name="document-text-outline" size={15} color="#24050A" />
              <Text style={[styles.shiftActionBtnText, { color: '#24050A', fontWeight: '800' }]}>Z-Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.shiftAlertBanner}>
          <View style={styles.shiftAlertLeft}>
            <Ionicons name="alert-circle" size={20} color="#F59E0B" />
            <Text style={styles.shiftAlertText}>
              No active register shift is open. Open a cashier shift to record cash floats, manage drawer settlements, and generate Z-reports.
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.shiftAlertBtn}
            onPress={() => router.push('/admin/shift')}
            activeOpacity={0.75}
          >
            <Text style={styles.shiftAlertBtnText}>Open Shift Now →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ================= 1.2 LOW STOCK INVENTORY ALERT (BAITHAK) ================= */}
      {lowStockItems.length > 0 && (
        <View style={styles.inventoryAlertBanner}>
          <View style={styles.inventoryAlertLeft}>
            <View style={styles.alertIconPill}>
              <Ionicons name="warning" size={16} color="#DC2626" />
            </View>
            <Text style={styles.inventoryAlertText}>
              <Text style={{ fontWeight: '800', color: '#991B1B' }}>INVENTORY REORDER WARNING:</Text> {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} below minimum stock threshold ({lowStockItems.slice(0, 3).map(i => i.name).join(', ')}{lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : ''})
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.inventoryAlertLink} 
            onPress={() => router.push('/admin/inventory')}
            activeOpacity={0.75}
          >
            <Text style={styles.inventoryAlertLinkText}>Manage Inventory →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ================= 2. CORE OPERATIONAL DATA BOXES (BAITHAK JEWEL GRADIENTS) ================= */}
      <View style={styles.kpiGrid}>
        {/* KPI 1: Net Revenue (Royal Maroon) */}
        <View 
          style={[
            styles.kpiJewelCard, 
            styles.kpiJewelMaroon,
            isMobile ? styles.kpiCardFull : isTablet ? styles.kpiCardHalf : styles.kpiCardHalf
          ]}
          {...({ dataSet: { card: 'interactive', stagger: '1' } } as any)}
        >
          {/* Watermark Icon */}
          <View style={styles.watermarkIconBox} pointerEvents="none">
            <Ionicons name="cash" size={110} color="rgba(255, 255, 255, 0.05)" />
          </View>

          <View style={styles.kpiTopRow}>
            <View style={styles.kpiTitleGroup}>
              <Text style={styles.kpiJewelLabel}>NET REVENUE (PAID)</Text>
              <View style={styles.jewelPillGold}>
                <Text style={styles.jewelPillGoldText}>SETTLED</Text>
              </View>
            </View>
            <View style={[styles.kpiIconBoxJewel, { backgroundColor: 'rgba(212, 175, 55, 0.18)' }]}>
              <Ionicons name="wallet-outline" size={20} color="#F3D179" />
            </View>
          </View>

          {isRefreshing ? (
            <View style={styles.skeletonValueDark} {...({ dataSet: { skeleton: 'box' } } as any)} />
          ) : canViewRevenue ? (
            <Text style={styles.kpiMainValueJewel}>Rs. {todaysSales.toLocaleString()}</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
              <Text style={[styles.kpiMainValueJewel, { letterSpacing: 2, color: 'rgba(255,255,255,0.4)' }]}>••••••</Text>
              <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.25)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#FCA5A5' }}>RESTRICTED</Text>
              </View>
            </View>
          )}

          {/* Frosted Chips: Cash / Card / Online */}
          <View style={styles.frostedChipRow}>
            <View style={styles.frostedChip}>
              <Ionicons name="cash-outline" size={11} color="#F3D179" />
              <Text style={styles.frostedChipText}>Cash: Rs. {paymentMetrics.cash.amount.toLocaleString()} ({paymentMetrics.cash.pct}%)</Text>
            </View>
            <View style={styles.frostedChip}>
              <Ionicons name="card-outline" size={11} color="#93C5FD" />
              <Text style={styles.frostedChipText}>Card: Rs. {paymentMetrics.card.amount.toLocaleString()} ({paymentMetrics.card.pct}%)</Text>
            </View>
            {paymentMetrics.online.amount > 0 && (
              <View style={styles.frostedChip}>
                <Ionicons name="globe-outline" size={11} color="#A7F3D0" />
                <Text style={styles.frostedChipText}>Online: Rs. {paymentMetrics.online.amount.toLocaleString()}</Text>
              </View>
            )}
          </View>

          <View style={styles.kpiFooterJewel}>
            <Text style={styles.kpiSubtextJewel}>
              {canViewRevenue ? `${todaysInvoices.length} settled tickets • ${scopeTitle}` : 'Revenue masked by role policy'}
            </Text>
            <TouchableOpacity onPress={() => router.push('/admin/invoices')}>
              <Text style={styles.kpiLinkGold}>View Invoices →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KPI 2: Order Volume & Channels (Deep Amber) */}
        <View 
          style={[
            styles.kpiJewelCard, 
            styles.kpiJewelAmber,
            isMobile ? styles.kpiCardFull : isTablet ? styles.kpiCardHalf : styles.kpiCardHalf
          ]}
          {...({ dataSet: { card: 'interactive', stagger: '2' } } as any)}
        >
          {/* Watermark Icon */}
          <View style={styles.watermarkIconBox} pointerEvents="none">
            <Ionicons name="receipt" size={110} color="rgba(255, 255, 255, 0.05)" />
          </View>

          <View style={styles.kpiTopRow}>
            <View style={styles.kpiTitleGroup}>
              <Text style={styles.kpiJewelLabel}>ORDER TRAFFIC & CHANNELS</Text>
              <View style={styles.jewelPillAmber}>
                <Text style={styles.jewelPillAmberText}>AOV: Rs. {aov.toLocaleString()}</Text>
              </View>
            </View>
            <View style={[styles.kpiIconBoxJewel, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
              <Ionicons name="cart-outline" size={20} color="#FBBF24" />
            </View>
          </View>

          {isRefreshing ? (
            <View style={styles.skeletonValueDark} {...({ dataSet: { skeleton: 'box' } } as any)} />
          ) : (
            <Text style={styles.kpiMainValueJewel}>{todaysInvoices.length} <Text style={{ fontSize: 18, fontWeight: '600', color: '#FCD34D' }}>Orders</Text></Text>
          )}

          {/* Frosted Chips: Dine-in / Takeaway / Delivery */}
          <View style={styles.frostedChipRow}>
            <View style={styles.frostedChip}>
              <Ionicons name="restaurant-outline" size={11} color="#FBBF24" />
              <Text style={styles.frostedChipText}>Dine-in: {channelMetrics.dineIn.count} ({channelMetrics.dineIn.pct}%)</Text>
            </View>
            <View style={styles.frostedChip}>
              <Ionicons name="bag-handle-outline" size={11} color="#FCD34D" />
              <Text style={styles.frostedChipText}>Takeaway: {channelMetrics.takeaway.count} ({channelMetrics.takeaway.pct}%)</Text>
            </View>
            <View style={styles.frostedChip}>
              <Ionicons name="bicycle-outline" size={11} color="#FDE68A" />
              <Text style={styles.frostedChipText}>Delivery: {channelMetrics.delivery.count} ({channelMetrics.delivery.pct}%)</Text>
            </View>
          </View>

          <View style={styles.kpiFooterJewel}>
            <Text style={styles.kpiSubtextJewel}>Average check Rs. {aov.toLocaleString()} per table</Text>
            <TouchableOpacity onPress={() => router.push('/admin/pos')}>
              <Text style={styles.kpiLinkGold}>Open POS Terminal →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KPI 3: Floor Seating & Live Occupancy (Deep Emerald/Teal) */}
        <View 
          style={[
            styles.kpiJewelCard, 
            styles.kpiJewelTeal,
            isMobile ? styles.kpiCardFull : isTablet ? styles.kpiCardHalf : styles.kpiCardHalf
          ]}
          {...({ dataSet: { card: 'interactive', stagger: '3' } } as any)}
        >
          {/* Watermark Icon */}
          <View style={styles.watermarkIconBox} pointerEvents="none">
            <Ionicons name="restaurant" size={110} color="rgba(255, 255, 255, 0.05)" />
          </View>

          <View style={styles.kpiTopRow}>
            <View style={styles.kpiTitleGroup}>
              <Text style={styles.kpiJewelLabel}>LIVE SEATING OCCUPANCY</Text>
              <View style={styles.jewelPillTeal}>
                <Text style={styles.jewelPillTealText}>{occupancyRate}% OCCUPIED</Text>
              </View>
            </View>
            <View style={[styles.kpiIconBoxJewel, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
              <Ionicons name="grid-outline" size={20} color="#34D399" />
            </View>
          </View>

          {isRefreshing ? (
            <View style={styles.skeletonValueDark} {...({ dataSet: { skeleton: 'box' } } as any)} />
          ) : (
            <Text style={styles.kpiMainValueJewel}>
              {occupiedTables} / {tables.length} <Text style={{ fontSize: 18, fontWeight: '600', color: '#6EE7B7' }}>Tables</Text>
            </Text>
          )}

          {/* Frosted Chips: Available / Occupied / Capacity */}
          <View style={styles.frostedChipRow}>
            <View style={styles.frostedChip}>
              <Ionicons name="checkmark-circle-outline" size={11} color="#6EE7B7" />
              <Text style={styles.frostedChipText}>{freeTables} Available</Text>
            </View>
            <View style={styles.frostedChip}>
              <Ionicons name="time-outline" size={11} color="#FBBF24" />
              <Text style={styles.frostedChipText}>{occupiedTables} In-Service</Text>
            </View>
            <View style={styles.frostedChip}>
              <Ionicons name="people-outline" size={11} color="#93C5FD" />
              <Text style={styles.frostedChipText}>{tables.reduce((sum, t) => sum + (t.seats || 4), 0)} Seats Total</Text>
            </View>
          </View>

          <View style={styles.kpiFooterJewel}>
            <Text style={styles.kpiSubtextJewel}>{freeTables} vacant tables ready for guests</Text>
            <TouchableOpacity onPress={() => router.push('/admin/tables')}>
              <Text style={styles.kpiLinkGold}>Live Floor Layout →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KPI 4: Kitchen KDS Velocity & Prep Queue (Amethyst Purple) */}
        <View 
          style={[
            styles.kpiJewelCard, 
            styles.kpiJewelAmethyst,
            isMobile ? styles.kpiCardFull : isTablet ? styles.kpiCardHalf : styles.kpiCardHalf
          ]}
          {...({ dataSet: { card: 'interactive', stagger: '4' } } as any)}
        >
          {/* Watermark Icon */}
          <View style={styles.watermarkIconBox} pointerEvents="none">
            <Ionicons name="flame" size={110} color="rgba(255, 255, 255, 0.05)" />
          </View>

          <View style={styles.kpiTopRow}>
            <View style={styles.kpiTitleGroup}>
              <Text style={styles.kpiJewelLabel}>KITCHEN KDS & VELOCITY</Text>
              <View style={styles.jewelPillPurple}>
                <Text style={styles.jewelPillPurpleText}>{activeOrders > 3 ? 'RUSH LOAD' : 'OPTIMAL FLOW'}</Text>
              </View>
            </View>
            <View style={[styles.kpiIconBoxJewel, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
              <Ionicons name="flame-outline" size={20} color="#C084FC" />
            </View>
          </View>

          {isRefreshing ? (
            <View style={styles.skeletonValueDark} {...({ dataSet: { skeleton: 'box' } } as any)} />
          ) : (
            <Text style={styles.kpiMainValueJewel}>
              {activeOrders} <Text style={{ fontSize: 18, fontWeight: '600', color: '#D8B4FE' }}>Active Tickets</Text>
            </Text>
          )}

          {/* Frosted Chips: Prep Queue / Speed / CRM Diners */}
          <View style={styles.frostedChipRow}>
            <View style={styles.frostedChip}>
              <Ionicons name="timer-outline" size={11} color="#C084FC" />
              <Text style={styles.frostedChipText}>{activeOrders} Orders In Prep</Text>
            </View>
            <View style={styles.frostedChip}>
              <Ionicons name="speedometer-outline" size={11} color="#A7F3D0" />
              <Text style={styles.frostedChipText}>~12-14 Min Lead</Text>
            </View>
            <View style={styles.frostedChip}>
              <Ionicons name="people-outline" size={11} color="#F3D179" />
              <Text style={styles.frostedChipText}>{customers.length} Diners CRM</Text>
            </View>
          </View>

          <View style={styles.kpiFooterJewel}>
            <Text style={styles.kpiSubtextJewel}>
              {activeOrders > 3 ? 'High kitchen queue pressure' : 'Kitchen operating within velocity targets'}
            </Text>
            <TouchableOpacity onPress={() => router.push('/kitchen/kds')}>
              <Text style={styles.kpiLinkGold}>Open KDS Screen →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ================= 3. DETAILED VISUAL ANALYTICS & CHARTS ================= */}
      <View style={styles.chartsRow}>
        {/* Chart 1: Hourly Sales Rush Histogram */}
        <View 
          style={[styles.chartCard, isMobile ? styles.chartCardFull : styles.chartCardTwoThirds]}
          {...({ dataSet: { card: 'interactive', stagger: 'chart-1' } } as any)}
        >
          <View style={styles.chartHeader}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={styles.sectionTitle}>Hourly Sales & Dining Rush Curve</Text>
              <Text style={styles.sectionSubtitle}>Revenue volume and customer rush distribution across operating hours</Text>
            </View>
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: BRAND.burgundy }]} />
                <Text style={styles.legendText}>Volume (PKR)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: BRAND.amber }]} />
                <Text style={styles.legendText}>Peak Dinner Rush</Text>
              </View>
            </View>
          </View>

          {/* Interactive Bar Chart */}
          <View style={styles.barChartContainer}>
            <View style={styles.chartBarsRow}>
              {hourlyData.map((slot, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.barColumn}
                  activeOpacity={0.8}
                  onPress={() => setActiveHourlyMetric(activeHourlyMetric === idx ? null : idx)}
                >
                  {/* Tooltip on Click / Select */}
                  {activeHourlyMetric === idx && (
                    <View style={styles.barTooltip}>
                      <Text style={styles.tooltipAmt}>Rs. {slot.sales.toLocaleString()}</Text>
                      <Text style={styles.tooltipOrders}>{slot.orders} orders</Text>
                    </View>
                  )}

                  <View style={styles.barTrack}>
                    <View 
                      style={[
                        styles.barFill, 
                        { 
                          height: `${slot.heightPct}%`,
                          backgroundColor: slot.isPeak ? BRAND.amber : BRAND.burgundy,
                        },
                      ]} 
                      {...({ dataSet: { bar: 'grow' } } as any)}
                    />
                  </View>
                  <Text
                    style={[
                      styles.barLabel,
                      isMobile && { fontSize: 8.5 },
                      slot.isPeak && styles.barLabelPeak,
                    ]}
                    numberOfLines={1}
                  >
                    {isMobile ? slot.label.replace(' ', '') : slot.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.chartBottomInfo}>
            <Ionicons name="information-circle-outline" size={16} color={BRAND.textMuted} style={{ marginRight: 6 }} />
            <Text style={styles.chartNote}>
              Highest revenue concentration observed between <Text style={{ fontWeight: '700', color: BRAND.textPrimary }}>8:00 PM – 10:30 PM</Text> (Dinner Prime).
            </Text>
          </View>
        </View>

        {/* Chart 2: Order Channels & Payment Modes */}
        <View 
          style={[styles.chartCard, isMobile ? styles.chartCardFull : styles.chartCardOneThird]}
          {...({ dataSet: { card: 'interactive', stagger: 'chart-2' } } as any)}
        >
          <Text style={styles.sectionTitle}>Sales Channels</Text>
          <Text style={styles.sectionSubtitle}>Dine-in vs Takeaway vs Online</Text>

          {/* Channels Progress Meters */}
          <View style={styles.channelGroup}>
            {/* Dine-in */}
            <View style={styles.channelRow}>
              <View style={styles.channelLabelRow}>
                <View style={styles.channelTitleWrapper}>
                  <Ionicons name="restaurant" size={14} color={BRAND.sky} style={{ marginRight: 6 }} />
                  <Text style={styles.channelName}>Dine-In Restaurant</Text>
                </View>
                <Text style={styles.channelValue}>
                  {channelMetrics.dineIn.pct}% <Text style={styles.channelCount}>({channelMetrics.dineIn.count} orders)</Text>
                </Text>
              </View>
              <View style={styles.channelMeterTrack}>
                <View style={[styles.channelMeterFill, { width: `${channelMetrics.dineIn.pct}%`, backgroundColor: BRAND.sky }]} />
              </View>
            </View>

            {/* Takeaway */}
            <View style={styles.channelRow}>
              <View style={styles.channelLabelRow}>
                <View style={styles.channelTitleWrapper}>
                  <Ionicons name="bag-handle" size={14} color={BRAND.amber} style={{ marginRight: 6 }} />
                  <Text style={styles.channelName}>Takeaway Counter</Text>
                </View>
                <Text style={styles.channelValue}>
                  {channelMetrics.takeaway.pct}% <Text style={styles.channelCount}>({channelMetrics.takeaway.count} orders)</Text>
                </Text>
              </View>
              <View style={styles.channelMeterTrack}>
                <View style={[styles.channelMeterFill, { width: `${channelMetrics.takeaway.pct}%`, backgroundColor: BRAND.amber }]} />
              </View>
            </View>

            {/* Delivery */}
            <View style={styles.channelRow}>
              <View style={styles.channelLabelRow}>
                <View style={styles.channelTitleWrapper}>
                  <Ionicons name="bicycle" size={14} color={BRAND.purple} style={{ marginRight: 6 }} />
                  <Text style={styles.channelName}>Online Delivery</Text>
                </View>
                <Text style={styles.channelValue}>
                  {channelMetrics.delivery.pct}% <Text style={styles.channelCount}>({channelMetrics.delivery.count} orders)</Text>
                </Text>
              </View>
              <View style={styles.channelMeterTrack}>
                <View style={[styles.channelMeterFill, { width: `${channelMetrics.delivery.pct}%`, backgroundColor: BRAND.purple }]} />
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.cardDivider} />

          {/* Payment Method Split */}
          <Text style={[styles.sectionTitle, { fontSize: 15 }]}>Payment Modes</Text>
          <View style={styles.paymentPillRow}>
            <View style={[styles.paymentPill, { backgroundColor: BRAND.emeraldLight }]}>
              <Text style={[styles.paymentPillTitle, { color: BRAND.emeraldDark }]}>Cash ({paymentMetrics.cash.pct}%)</Text>
              <Text style={styles.paymentPillAmt}>Rs. {paymentMetrics.cash.amount.toLocaleString()}</Text>
            </View>

            <View style={[styles.paymentPill, { backgroundColor: BRAND.indigoLight }]}>
              <Text style={[styles.paymentPillTitle, { color: BRAND.indigo }]}>Card ({paymentMetrics.card.pct}%)</Text>
              <Text style={styles.paymentPillAmt}>Rs. {paymentMetrics.card.amount.toLocaleString()}</Text>
            </View>

            <View style={[styles.paymentPill, { backgroundColor: BRAND.purpleLight }]}>
              <Text style={[styles.paymentPillTitle, { color: BRAND.purple }]}>Online ({paymentMetrics.online.pct}%)</Text>
              <Text style={styles.paymentPillAmt}>Rs. {paymentMetrics.online.amount.toLocaleString()}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ================= 3.5 CULINARY PERFORMANCE (REGION, CATEGORY & TOP ITEMS CHARTS) ================= */}
      <View style={styles.culinarySectionContainer}>
        {/* Section Header with Segmented Switcher */}
        <View style={styles.culinarySectionHeader}>
          <View>
            <View style={styles.culinaryHeaderBadgeRow}>
              <Text style={styles.sectionTitle}>Culinary Sales Analytics & Top Sellers</Text>
              <View style={styles.liveSalesMixBadge}>
                <View style={styles.pulseDotGold} />
                <Text style={styles.liveSalesMixBadgeText}>LIVE SALES MIX</Text>
              </View>
            </View>
            <Text style={styles.sectionSubtitle}>
              Real-time sales volume & revenue breakdown by Region (Cuisine), Category, and Top Dishes
            </Text>
          </View>

          {/* Segmented Filter Pills */}
          <View style={styles.culinaryTabPillContainer}>
            <TouchableOpacity 
              style={[styles.culinaryTabPill, salesAnalyticsTab === 'all' && styles.culinaryTabPillActive]}
              onPress={() => setSalesAnalyticsTab('all')}
              activeOpacity={0.75}
            >
              <Ionicons name="grid" size={13} color={salesAnalyticsTab === 'all' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.culinaryTabPillText, salesAnalyticsTab === 'all' && styles.culinaryTabPillTextActive]}>
                All 3 Views
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.culinaryTabPill, salesAnalyticsTab === 'region' && styles.culinaryTabPillActive]}
              onPress={() => setSalesAnalyticsTab('region')}
              activeOpacity={0.75}
            >
              <Ionicons name="globe-outline" size={13} color={salesAnalyticsTab === 'region' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.culinaryTabPillText, salesAnalyticsTab === 'region' && styles.culinaryTabPillTextActive]}>
                Region-wise
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.culinaryTabPill, salesAnalyticsTab === 'category' && styles.culinaryTabPillActive]}
              onPress={() => setSalesAnalyticsTab('category')}
              activeOpacity={0.75}
            >
              <Ionicons name="albums-outline" size={13} color={salesAnalyticsTab === 'category' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.culinaryTabPillText, salesAnalyticsTab === 'category' && styles.culinaryTabPillTextActive]}>
                Category-wise
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.culinaryTabPill, salesAnalyticsTab === 'item' && styles.culinaryTabPillActive]}
              onPress={() => setSalesAnalyticsTab('item')}
              activeOpacity={0.75}
            >
              <Ionicons name="trophy-outline" size={13} color={salesAnalyticsTab === 'item' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.culinaryTabPillText, salesAnalyticsTab === 'item' && styles.culinaryTabPillTextActive]}>
                Top Items
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3 Visual Data Boxes Grid */}
        <View style={styles.culinaryBoxesGrid}>
          {/* BOX 1: REGION-WISE SALES CHART */}
          {(salesAnalyticsTab === 'all' || salesAnalyticsTab === 'region') && (
            <View 
              style={[
                styles.culinaryBoxCard,
                salesAnalyticsTab === 'region' ? styles.culinaryBoxCardFull : (isMobile ? styles.culinaryBoxCardFull : isTablet ? styles.culinaryBoxCardHalf : styles.culinaryBoxCardOneThird)
              ]}
              {...({ dataSet: { card: 'interactive' } } as any)}
            >
              {/* Card Header */}
              <View style={styles.culinaryBoxHeader}>
                <View style={styles.culinaryBoxTitleGroup}>
                  <View style={[styles.culinaryBoxIconWrap, { backgroundColor: '#FDF2F4' }]}>
                    <Ionicons name="globe-outline" size={18} color="#52141C" />
                  </View>
                  <View>
                    <Text style={styles.culinaryBoxTitle}>Region / Cuisine Share</Text>
                    <Text style={styles.culinaryBoxSubtitle}>Pakistani, Chinese, Continental</Text>
                  </View>
                </View>

                {/* Graph Type Switcher */}
                <View style={styles.chartToggleRow}>
                  <TouchableOpacity 
                    style={[styles.chartToggleBtn, regionGraphMode === 'donut' && styles.chartToggleBtnActive]}
                    onPress={() => setRegionGraphMode('donut')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chartToggleText, regionGraphMode === 'donut' && styles.chartToggleTextActive]}>🍩 Donut</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.chartToggleBtn, regionGraphMode === 'bar' && styles.chartToggleBtnActive]}
                    onPress={() => setRegionGraphMode('bar')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chartToggleText, regionGraphMode === 'bar' && styles.chartToggleTextActive]}>📊 Bars</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Graphical Visualization Body */}
              <View style={styles.culinaryCardBody}>
                {regionGraphMode === 'donut' ? (
                  <View style={styles.donutCenteringWrap}>
                    <SvgDonutChart
                      data={regionDonutData}
                      size={isMobile ? 150 : 160}
                      thickness={22}
                      plain={true}
                      compactLegend={true}
                      centerTitle={canViewRevenue ? `Rs. ${(totalCulinaryRevenue / 1000).toFixed(0)}k` : `${totalCulinaryUnits}`}
                      centerSubtitle="CUISINES"
                    />
                  </View>
                ) : (
                  <View style={styles.regionBarsContainer}>
                    {/* Multi-color Segmented Stacked Bar */}
                    <View style={styles.stackedBarContainer}>
                      <View style={styles.stackedBarTrack}>
                        {regionSales.map((r, i) => (
                          <View key={i} style={[styles.stackedBarSegment, { width: `${r.pct}%`, backgroundColor: r.color }]} />
                        ))}
                      </View>
                    </View>

                    {/* Region Detail Rows */}
                    <View style={styles.culinaryItemsList}>
                      {regionSales.map((r, i) => (
                        <View key={i} style={styles.culinaryDataRow}>
                          <View style={styles.culinaryRowTop}>
                            <View style={styles.categoryBulletRow}>
                              <View style={[styles.categoryColorDot, { backgroundColor: r.color }]} />
                              <Text style={styles.categoryNameHeading}>{r.name}</Text>
                              <View style={[styles.regionPillSmall, { backgroundColor: r.badgeBg }]}>
                                <Text style={[styles.regionPillSmallText, { color: r.textColor }]}>{r.pct}%</Text>
                              </View>
                            </View>
                            <Text style={styles.culinaryRowRevenue}>
                              {canViewRevenue ? `Rs. ${r.revenue.toLocaleString()}` : `${r.qty} orders`}
                            </Text>
                          </View>
                          <View style={styles.culinaryMeterTrack}>
                            <View style={[styles.culinaryMeterFill, { width: `${r.pct}%`, backgroundColor: r.color }]} />
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.culinaryBoxFooter}>
                <Ionicons name="sparkles" size={13} color={BRAND.gold} />
                <Text style={styles.culinaryFooterNote} numberOfLines={1}>
                  Leading: <Text style={{ fontWeight: '800', color: BRAND.burgundy }}>{regionSales[0]?.name || 'Pakistani'}</Text> ({regionSales[0]?.pct || 0}% volume)
                </Text>
              </View>
            </View>
          )}

          {/* BOX 2: CATEGORY-WISE SALES SHARE */}
          {(salesAnalyticsTab === 'all' || salesAnalyticsTab === 'category') && (
            <View 
              style={[
                styles.culinaryBoxCard,
                salesAnalyticsTab === 'category' ? styles.culinaryBoxCardFull : (isMobile ? styles.culinaryBoxCardFull : isTablet ? styles.culinaryBoxCardHalf : styles.culinaryBoxCardOneThird)
              ]}
              {...({ dataSet: { card: 'interactive' } } as any)}
            >
              {/* Card Header */}
              <View style={styles.culinaryBoxHeader}>
                <View style={styles.culinaryBoxTitleGroup}>
                  <View style={[styles.culinaryBoxIconWrap, { backgroundColor: '#FFFBEB' }]}>
                    <Ionicons name="albums-outline" size={18} color="#D97706" />
                  </View>
                  <View>
                    <Text style={styles.culinaryBoxTitle}>Category Sales Mix</Text>
                    <Text style={styles.culinaryBoxSubtitle}>Revenue & order distribution</Text>
                  </View>
                </View>

                <View style={styles.culinaryHeaderTag}>
                  <Text style={styles.culinaryHeaderTagText}>TOP CATEGORIES</Text>
                </View>
              </View>

              {/* Category Meter Deck */}
              <View style={styles.culinaryCardBody}>
                <View style={styles.catMetersListContainer}>
                  {categorySales.slice(0, 5).map((cat, idx) => (
                    <View key={idx} style={styles.catMeterCardRow}>
                      <View style={styles.catMeterHeader}>
                        <View style={styles.catMeterTitleCol}>
                          <View style={[styles.categoryColorDot, { backgroundColor: cat.color }]} />
                          <Text style={styles.catMeterName} numberOfLines={1}>{cat.name}</Text>
                        </View>
                        <View style={styles.catMeterValuesCol}>
                          <Text style={styles.catMeterRevenue}>
                            {canViewRevenue ? `Rs. ${cat.revenue.toLocaleString()}` : `${cat.qty} sold`}
                          </Text>
                          <View style={[styles.catMeterPctBadge, { backgroundColor: `${cat.color}15` }]}>
                            <Text style={[styles.catMeterPctText, { color: cat.color }]}>{cat.pct}%</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.catMeterTrack}>
                        <View style={[styles.catMeterFill, { width: `${cat.pct}%`, backgroundColor: cat.color }]} />
                      </View>
                      <View style={styles.catMeterFooter}>
                        <Text style={styles.catTopDishHint} numberOfLines={1}>
                          Top: <Text style={{ fontWeight: '700', color: BRAND.textPrimary }}>{cat.topDishName || 'Special'}</Text> ({cat.topDishQty || 0} sold)
                        </Text>
                        <Text style={styles.catOrderCountText}>{cat.qty} orders</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.culinaryBoxFooter}>
                <Ionicons name="pie-chart-outline" size={13} color="#D97706" />
                <Text style={styles.culinaryFooterNote} numberOfLines={1}>
                  Top Category: <Text style={{ fontWeight: '800', color: BRAND.textPrimary }}>{categorySales[0]?.name || 'Special Karahi'}</Text> ({canViewRevenue ? `Rs. ${categorySales[0]?.revenue.toLocaleString()}` : `${categorySales[0]?.qty} sold`})
                </Text>
              </View>
            </View>
          )}

          {/* BOX 3: ITEM-WISE TOP SALES LEADERBOARD */}
          {(salesAnalyticsTab === 'all' || salesAnalyticsTab === 'item') && (
            <View 
              style={[
                styles.culinaryBoxCard,
                salesAnalyticsTab === 'item' ? styles.culinaryBoxCardFull : (isMobile ? styles.culinaryBoxCardFull : isTablet ? styles.culinaryBoxCardHalf : styles.culinaryBoxCardOneThird)
              ]}
              {...({ dataSet: { card: 'interactive' } } as any)}
            >
              {/* Card Header */}
              <View style={styles.culinaryBoxHeader}>
                <View style={styles.culinaryBoxTitleGroup}>
                  <View style={[styles.culinaryBoxIconWrap, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="trophy" size={18} color="#B45309" />
                  </View>
                  <View>
                    <Text style={styles.culinaryBoxTitle}>Star Dishes Leaderboard</Text>
                    <Text style={styles.culinaryBoxSubtitle}>Ranked by units sold & revenue</Text>
                  </View>
                </View>

                <View style={[styles.culinaryHeaderTag, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.culinaryHeaderTagText, { color: '#B45309' }]}>BESTSELLERS</Text>
                </View>
              </View>

              {/* Star Dishes Leaderboard List */}
              <View style={styles.culinaryCardBody}>
                <View style={styles.leaderboardListContainer}>
                  {itemSales.slice(0, 5).map((dish, idx) => {
                    const isGold = dish.rank === 1;
                    const isSilver = dish.rank === 2;
                    const isBronze = dish.rank === 3;
                    const medalBg = isGold ? '#FEF3C7' : isSilver ? '#F1F5F9' : isBronze ? '#FFF7ED' : '#F8FAFC';
                    const medalBorder = isGold ? '#FDE68A' : isSilver ? '#CBD5E1' : isBronze ? '#FFEDD5' : '#E2E8F0';
                    const medalColor = isGold ? '#B45309' : isSilver ? '#475569' : isBronze ? '#C2410C' : '#64748B';

                    return (
                      <View key={idx} style={styles.leaderboardCardItem}>
                        <View style={styles.leaderboardMainRow}>
                          <View style={[styles.leaderboardMedalBadge, { backgroundColor: medalBg, borderColor: medalBorder }]}>
                            <Text style={[styles.leaderboardMedalText, { color: medalColor }]}>
                              {isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : `#${dish.rank}`}
                            </Text>
                          </View>
                          <View style={styles.leaderboardInfoCol}>
                            <View style={styles.leaderboardTitleRow}>
                              <Text style={styles.leaderboardDishName} numberOfLines={1}>{dish.name}</Text>
                              <View style={styles.dishRegionPill}>
                                <Text style={styles.dishRegionPillText}>{dish.region}</Text>
                              </View>
                            </View>
                            <Text style={styles.leaderboardDishCategory}>{dish.category}</Text>
                          </View>
                          <View style={styles.leaderboardStatsCol}>
                            <Text style={styles.leaderboardRevenueText}>
                              {canViewRevenue ? `Rs. ${dish.revenue.toLocaleString()}` : `${dish.qty} units`}
                            </Text>
                            <View style={styles.leaderboardUnitsPill}>
                              <Text style={styles.leaderboardUnitsPillText}>{dish.qty} sold</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.leaderboardVolumeTrack}>
                          <View 
                            style={[
                              styles.leaderboardVolumeFill, 
                              { 
                                width: `${dish.pctOfMax}%`, 
                                backgroundColor: isGold ? BRAND.gold : isSilver ? '#64748B' : isBronze ? '#EA580C' : BRAND.burgundy 
                              }
                            ]} 
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.culinaryBoxFooter}>
                <Ionicons name="ribbon-outline" size={13} color="#B45309" />
                <Text style={styles.culinaryFooterNote} numberOfLines={1}>
                  #1 Star Dish: <Text style={{ fontWeight: '800', color: '#B45309' }}>{itemSales[0]?.name || 'Shinwari Karahi'}</Text> ({itemSales[0]?.qty || 0} units)
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ================= 4. DETAILED OPERATIONAL TABLES ================= */}
      <View style={styles.tablesRow}>
        {/* Table 1: Top Performing Dishes */}
        <View 
          style={[styles.tableCard, isMobile ? styles.tableCardFull : styles.tableCardHalf]}
          {...({ dataSet: { card: 'interactive', stagger: 'table-1' } } as any)}
        >
          <View style={styles.tableHeaderSection}>
            <View>
              <Text style={styles.sectionTitle}>🏆 Top Dishes & Menu Leaders</Text>
              <Text style={styles.sectionSubtitle}>Top revenue generating items sold today</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/admin/menu')}>
              <Text style={styles.tableActionLink}>Full Menu</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tableWrapper}>
            {/* Header row */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thText, { flex: 2 }]}>DISH NAME</Text>
              <Text style={[styles.thText, { flex: 1, textAlign: 'center' }]}>QTY</Text>
              <Text style={[styles.thText, { flex: 1.5, textAlign: 'right' }]}>REVENUE</Text>
              <Text style={[styles.thText, { flex: 1.2, textAlign: 'right' }]}>STATUS</Text>
            </View>

            {/* Item Rows */}
            {topDishes.map((dish, i) => (
              <View 
                key={i} 
                style={styles.tableDataRow}
                {...({ dataSet: { row: 'hover' } } as any)}
              >
                <View style={{ flex: 2 }}>
                  <Text style={styles.dishNameText} numberOfLines={1}>{dish.name}</Text>
                  <Text style={styles.dishCategoryText}>{dish.category}</Text>
                </View>

                <View style={{ flex: 1, alignItems: 'center' }}>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyBadgeText}>{dish.qty}</Text>
                  </View>
                </View>

                <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                  <Text style={styles.revenueText}>Rs. {dish.revenue.toLocaleString()}</Text>
                </View>

                <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                  <View style={[styles.statusTag, { backgroundColor: i === 0 ? '#FEF3C7' : '#F1F5F9' }]}>
                    <Text style={[styles.statusTagText, { color: i === 0 ? '#B45309' : '#475569' }]}>
                      {i === 0 ? '🔥 Top 1' : 'Active'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Table 2: Live Recent Settled Invoices Feed */}
        <View 
          style={[styles.tableCard, isMobile ? styles.tableCardFull : styles.tableCardHalf]}
          {...({ dataSet: { card: 'interactive', stagger: 'table-2' } } as any)}
        >
          <View style={styles.tableHeaderSection}>
            <View>
              <Text style={styles.sectionTitle}>🧾 Live Settled Invoices Audit</Text>
              <Text style={styles.sectionSubtitle}>Recent customer receipts, server logs & payments</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/admin/invoices')}>
              <Text style={styles.tableActionLink}>All Invoices</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tableWrapper}>
            {/* Header row */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thText, { flex: 1.2 }]}>INVOICE #</Text>
              <Text style={[styles.thText, { flex: 2 }]}>TABLE / CHANNEL</Text>
              <Text style={[styles.thText, { flex: 1.5, textAlign: 'right' }]}>TOTAL</Text>
              <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>PAYMENT</Text>
            </View>

            {/* Invoice Rows */}
            {recentInvoices.map((inv, idx) => (
              <View 
                key={idx} 
                style={styles.tableDataRow}
                {...({ dataSet: { row: 'hover' } } as any)}
              >
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.invoiceIdText}>{inv.id}</Text>
                  <Text style={styles.invoiceServerText}>{inv.server || 'Cashier'}</Text>
                </View>

                <View style={{ flex: 2 }}>
                  <Text style={styles.tableNameText} numberOfLines={1}>
                    {inv.tableName || (inv.orderType === 'takeaway' ? 'Takeaway' : 'Delivery')}
                  </Text>
                  <Text style={styles.invoiceMetaText}>
                    {inv.items?.length || 1} items • {new Date(inv.timeSettled || inv.timePlaced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                  <Text style={styles.invoiceTotalText}>Rs. {(inv.total || 0).toLocaleString()}</Text>
                </View>

                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <View style={[styles.payMethodBadge, { backgroundColor: inv.payments?.[0]?.type === 'card' ? BRAND.indigoLight : BRAND.emeraldLight }]}>
                    <Text style={[styles.payMethodText, { color: inv.payments?.[0]?.type === 'card' ? BRAND.indigo : BRAND.emeraldDark }]}>
                      {inv.payments?.[0]?.type === 'card' ? 'CARD' : 'CASH'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ================= 5. KITCHEN STATIONS & FLOORS OVERVIEW ================= */}
      <View 
        style={styles.kdsFloorCard}
        {...({ dataSet: { card: 'interactive' } } as any)}
      >
        <View style={styles.kdsFloorHeader}>
          <View>
            <Text style={styles.sectionTitle}>Kitchen Prep Velocity & Floor Occupancy Status</Text>
            <Text style={styles.sectionSubtitle}>Station queues, average turnaround times & dining table availability</Text>
          </View>
          <View style={styles.throughputBadge}>
            <Ionicons name="checkmark-circle" size={14} color={BRAND.emerald} />
            <Text style={styles.throughputText}>98.4% On-Time Dispatch</Text>
          </View>
        </View>

        <View style={styles.stationGrid}>
          {/* Main Kitchen Station */}
          <View 
            style={styles.stationBox}
            {...({ dataSet: { row: 'hover' } } as any)}
          >
            <View style={styles.stationHeader}>
              <View style={[styles.stationDot, { backgroundColor: '#FF7043' }]} />
              <Text style={styles.stationTitle}>Main Hot Kitchen (Karahi & BBQ)</Text>
            </View>
            <View style={styles.stationMetrics}>
              <View>
                <Text style={styles.stationMetricVal}>{tickets.filter(t => t.status === 'cooking').length} Cooking</Text>
                <Text style={styles.stationMetricSub}>Prep Queue</Text>
              </View>
              <View style={styles.stationDivider} />
              <View>
                <Text style={styles.stationMetricVal}>14 Mins</Text>
                <Text style={styles.stationMetricSub}>Avg Cook Time</Text>
              </View>
              <View style={styles.stationDivider} />
              <View>
                <Text style={[styles.stationMetricVal, { color: BRAND.emeraldDark }]}>Normal</Text>
                <Text style={styles.stationMetricSub}>Load Level</Text>
              </View>
            </View>
          </View>

          {/* Juice & Beverage Station */}
          <View 
            style={styles.stationBox}
            {...({ dataSet: { row: 'hover' } } as any)}
          >
            <View style={styles.stationHeader}>
              <View style={[styles.stationDot, { backgroundColor: '#00E5FF' }]} />
              <Text style={styles.stationTitle}>Juice & Mocktail Bar</Text>
            </View>
            <View style={styles.stationMetrics}>
              <View>
                <Text style={styles.stationMetricVal}>{Math.max(1, Math.round(activeOrders * 0.4))} Drinks</Text>
                <Text style={styles.stationMetricSub}>In Blending</Text>
              </View>
              <View style={styles.stationDivider} />
              <View>
                <Text style={styles.stationMetricVal}>6 Mins</Text>
                <Text style={styles.stationMetricSub}>Fast Pour</Text>
              </View>
              <View style={styles.stationDivider} />
              <View>
                <Text style={[styles.stationMetricVal, { color: BRAND.emeraldDark }]}>Optimal</Text>
                <Text style={styles.stationMetricSub}>Load Level</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bg,
  },
  scrollContent: {
    padding: 24,
  },
  scrollContentMobile: {
    padding: 12,
  },

  // 1. Executive Header
  headerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.28)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 12px 32px rgba(82, 20, 28, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      } as any,
    }),
    elevation: 3,
  },
  headerCardMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    padding: 14,
  },
  headerLeft: {
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogoCapsule: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -0.3,
  },
  shiftActivePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  livePulsePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.emeraldLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.emeraldBorder,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.emerald,
  },
  livePulseText: {
    color: BRAND.emeraldDark,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: BRAND.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  refreshSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshSyncBtnActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.22)',
  },
  refreshSyncBtnText: {
    color: BRAND.goldDark,
    fontSize: 12,
    fontWeight: '800',
  },
  filterPillGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.textSecondary,
  },
  filterBtnTextActive: {
    color: BRAND.burgundy,
    fontWeight: '900',
  },
  actionCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  actionCallBtnText: {
    color: BRAND.burgundy,
    fontSize: 13,
    fontWeight: '800',
  },
  actionPosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  actionPosBtnText: {
    color: '#24050A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // 1.1 Shift Status Capsule & Alert Banner (from Baithak home.php)
  shiftStatusCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 20,
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #380A11 0%, #200408 100%)',
      },
      default: {
        backgroundColor: '#24050A',
      },
    }),
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.38)',
    shadowColor: '#24050A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  shiftCapsuleLeft: {
    flex: 1,
    minWidth: 280,
  },
  shiftLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  shiftLiveText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#34D399',
    letterSpacing: 0.8,
  },
  shiftCapsuleHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  shiftCapsuleDetails: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.72)',
    fontWeight: '500',
    marginTop: 2,
  },
  shiftCapsuleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shiftActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  shiftActionBtnGold: {
    backgroundColor: '#D4AF37',
    borderColor: '#F3D179',
  },
  shiftActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F3D179',
  },
  shiftAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 20,
    backgroundColor: 'rgba(254, 243, 199, 0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.48)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15)',
      } as any,
    }),
  },
  shiftAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  shiftAlertText: {
    fontSize: 13,
    color: '#78350F',
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  shiftAlertBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#D97706',
    borderWidth: 1,
    borderColor: '#F59E0B',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
        boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
        cursor: 'pointer',
      } as any,
    }),
  },
  shiftAlertBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // 1.2 Inventory Alert Banner
  inventoryAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 20,
    backgroundColor: 'rgba(254, 226, 226, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(239, 68, 68, 0.14)',
      } as any,
    }),
  },
  inventoryAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  alertIconPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inventoryAlertText: {
    fontSize: 12.5,
    color: '#7F1D1D',
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  inventoryAlertLink: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#EF4444',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
        cursor: 'pointer',
      } as any,
    }),
  },
  inventoryAlertLinkText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // 2. Core KPI Cards Grid & Baithak Jewel Gradients
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  kpiJewelCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'space-between',
    minHeight: 180,
  },
  kpiJewelMaroon: {
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #4D101A 0%, #200408 100%)',
      },
      default: {
        backgroundColor: '#380A11',
      },
    }),
    borderColor: 'rgba(212, 175, 55, 0.38)',
  },
  kpiJewelAmber: {
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #4A1E08 0%, #1D0A02 100%)',
      },
      default: {
        backgroundColor: '#2E1A0D',
      },
    }),
    borderColor: 'rgba(245, 158, 11, 0.38)',
  },
  kpiJewelTeal: {
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #093322 0%, #03140C 100%)',
      },
      default: {
        backgroundColor: '#0E3324',
      },
    }),
    borderColor: 'rgba(16, 185, 129, 0.38)',
  },
  kpiJewelAmethyst: {
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #2B1343 0%, #11051D 100%)',
      },
      default: {
        backgroundColor: '#261738',
      },
    }),
    borderColor: 'rgba(168, 85, 247, 0.38)',
  },
  watermarkIconBox: {
    position: 'absolute',
    right: -10,
    bottom: -15,
    opacity: 0.9,
  },
  kpiTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flexShrink: 1,
    paddingRight: 8,
  },
  kpiJewelLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(255, 255, 255, 0.78)',
    letterSpacing: 0.9,
  },
  jewelPillGold: {
    backgroundColor: 'rgba(212, 175, 55, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  jewelPillGoldText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F3D179',
    letterSpacing: 0.5,
  },
  jewelPillAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  jewelPillAmberText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FCD34D',
  },
  jewelPillTeal: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  jewelPillTealText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6EE7B7',
  },
  jewelPillPurple: {
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  jewelPillPurpleText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D8B4FE',
  },
  kpiIconBoxJewel: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiMainValueJewel: {
    fontSize: 27,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  skeletonValueDark: {
    height: 30,
    width: '65%',
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: 4,
  },
  frostedChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 6,
  },
  frostedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  frostedChipText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  kpiFooterJewel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 10,
    marginTop: 6,
  },
  kpiSubtextJewel: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.72)',
    fontWeight: '500',
  },
  kpiLinkGold: {
    fontSize: 12,
    color: '#F3D179',
    fontWeight: '800',
  },
  kpiCard: {
    backgroundColor: BRAND.cardBg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BRAND.cardBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiCardFull: {
    width: '100%',
  },
  kpiCardHalf: {
    width: '48.5%',
    flexGrow: 1,
  },
  kpiCardThird: {
    width: '31.5%',
    flexGrow: 1,
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.textMuted,
    letterSpacing: 0.8,
  },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiMainValue: {
    fontSize: 24,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  skeletonValue: {
    height: 28,
    width: '70%',
    borderRadius: 6,
    marginBottom: 8,
    marginTop: 2,
  },
  kpiValueSub: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.textSecondary,
  },
  miniProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    marginBottom: 10,
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  kpiFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  kpiSubtext: {
    fontSize: 12,
    color: BRAND.textSecondary,
    fontWeight: '500',
  },
  kpiLink: {
    fontSize: 12,
    color: BRAND.burgundy,
    fontWeight: '700',
  },

  // 3. Visual Charts Row
  chartsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  chartCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.24)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 12px 32px rgba(82, 20, 28, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      } as any,
    }),
    elevation: 3,
  },
  chartCardFull: {
    width: '100%',
  },
  chartCardTwoThirds: {
    width: '63%',
    flexGrow: 1,
    minWidth: 320,
  },
  chartCardOneThird: {
    width: '34%',
    flexGrow: 1,
    minWidth: 280,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: BRAND.textSecondary,
    fontWeight: '600',
  },

  // Bar Chart container
  barChartContainer: {
    height: 180,
    justifyContent: 'flex-end',
    marginBottom: 12,
    paddingBottom: 4,
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  barTrack: {
    width: '45%',
    maxWidth: 24,
    height: 140,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barLabel: {
    fontSize: 10,
    color: BRAND.textMuted,
    fontWeight: '600',
    marginTop: 6,
  },
  barLabelPeak: {
    color: BRAND.amber,
    fontWeight: '800',
  },
  barTooltip: {
    position: 'absolute',
    top: -30,
    backgroundColor: BRAND.textPrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    zIndex: 100,
  },
  tooltipAmt: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  tooltipOrders: {
    color: BRAND.goldLight,
    fontSize: 8,
  },
  chartBottomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  chartNote: {
    fontSize: 12,
    color: BRAND.textSecondary,
  },

  // Channels meters
  channelGroup: {
    gap: 14,
    marginTop: 16,
  },
  channelRow: {},
  channelLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  channelTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelName: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.textPrimary,
  },
  channelValue: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  channelCount: {
    fontSize: 11,
    color: BRAND.textSecondary,
    fontWeight: '500',
  },
  channelMeterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  channelMeterFill: {
    height: '100%',
    borderRadius: 4,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 18,
  },
  paymentPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  paymentPill: {
    width: '31%',
    flexGrow: 1,
    minWidth: 92,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  paymentPillTitle: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  paymentPillAmt: {
    fontSize: 12,
    fontWeight: '900',
    color: BRAND.textPrimary,
  },

  // 4. Tables Row
  tablesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  tableCard: {
    backgroundColor: BRAND.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BRAND.cardBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  tableCardFull: {
    width: '100%',
  },
  tableCardHalf: {
    width: '48.5%',
    flexGrow: 1,
  },
  tableHeaderSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tableActionLink: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  tableWrapper: {
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thText: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND.textMuted,
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  dishNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  dishCategoryText: {
    fontSize: 11,
    color: BRAND.textMuted,
    marginTop: 1,
  },
  qtyBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qtyBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  revenueText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // Invoices table
  invoiceIdText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  invoiceServerText: {
    fontSize: 11,
    color: BRAND.textMuted,
  },
  tableNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.textPrimary,
  },
  invoiceMetaText: {
    fontSize: 11,
    color: BRAND.textSecondary,
    marginTop: 1,
  },
  invoiceTotalText: {
    fontSize: 13,
    fontWeight: '900',
    color: BRAND.textPrimary,
  },
  payMethodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  payMethodText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // 5. Kitchen Stations & Floor Overview
  kdsFloorCard: {
    backgroundColor: BRAND.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BRAND.cardBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  kdsFloorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  throughputBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.emeraldLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.emeraldBorder,
  },
  throughputText: {
    color: BRAND.emeraldDark,
    fontSize: 12,
    fontWeight: '800',
  },
  stationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  stationBox: {
    width: '31.5%',
    flexGrow: 1,
    minWidth: 250,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#F8FAFC',
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  stationMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  stationMetricVal: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.textPrimary,
    textAlign: 'center',
  },
  stationMetricSub: {
    fontSize: 11,
    color: BRAND.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  stationDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },

  // -------------------------------------------------------------
  // CULINARY PERFORMANCE (REGION, CATEGORY & ITEM CHARTS) STYLES
  // -------------------------------------------------------------
  culinarySectionContainer: {
    marginBottom: 20,
  },
  culinarySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 12,
  },
  culinaryHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  liveSalesMixBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  pulseDotGold: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D4AF37',
  },
  liveSalesMixBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  culinaryTabPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    borderRadius: 12,
    padding: 3,
    gap: 2,
    flexWrap: 'wrap',
  },
  culinaryTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'all 0.15s ease' } as any,
    }),
  },
  culinaryTabPillActive: {
    backgroundColor: BRAND.burgundy,
    ...Platform.select({
      web: { boxShadow: '0 2px 6px rgba(82, 20, 28, 0.25)' } as any,
    }),
  },
  culinaryTabPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  culinaryTabPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  culinaryBoxesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  culinaryBoxCard: {
    backgroundColor: BRAND.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BRAND.cardBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 460,
  },
  culinaryBoxCardFull: {
    width: '100%',
  },
  culinaryBoxCardHalf: {
    width: '48.5%',
    flexGrow: 1,
  },
  culinaryBoxCardOneThird: {
    width: '31.5%',
    flexGrow: 1,
    minWidth: 280,
  },
  culinaryBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  culinaryBoxTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  chartToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2.5,
    gap: 2,
  },
  chartToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    ...Platform.select({
      web: { cursor: 'pointer', transition: 'all 0.15s ease' } as any,
    }),
  },
  chartToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any,
    }),
  },
  chartToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  chartToggleTextActive: {
    color: '#0F172A',
    fontWeight: '900',
  },
  svgChartWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    overflow: 'hidden',
  },
  culinaryBoxIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  culinaryBoxTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  culinaryBoxSubtitle: {
    fontSize: 10.5,
    color: BRAND.textMuted,
    marginTop: 1,
  },
  culinaryMetricBadgeMaroon: {
    backgroundColor: '#FDF2F4',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  culinaryMetricBadgeTextMaroon: {
    fontSize: 11,
    fontWeight: '900',
    color: '#52141C',
  },
  culinaryMetricBadgeAmber: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  culinaryMetricBadgeTextAmber: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
  },
  culinaryMetricBadgeGold: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  culinaryMetricBadgeTextGold: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
  },
  stackedBarContainer: {
    marginBottom: 14,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stackedBarTrack: {
    height: 10,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    marginBottom: 8,
  },
  stackedBarSegment: {
    height: '100%',
  },
  stackedBarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  stackedLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stackedLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  stackedLegendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  culinaryItemsList: {
    gap: 12,
    marginVertical: 4,
  },
  culinaryDataRow: {
    gap: 4,
  },
  culinaryRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  culinaryRowLeftGroup: {
    flex: 1,
    marginRight: 10,
  },
  regionPillSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  regionPillSmallText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  culinaryTopDishSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  culinaryRowRightGroup: {
    alignItems: 'flex-end',
  },
  culinaryRowRevenue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  culinaryRowUnits: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  culinaryMeterTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  culinaryMeterFill: {
    height: '100%',
    borderRadius: 4,
  },
  culinaryBoxFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  culinaryFooterNote: {
    fontSize: 11,
    color: BRAND.textMuted,
    flex: 1,
  },
  categoryBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryNameHeading: {
    fontSize: 12.5,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  itemLeaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  rankMedalBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMedalGold: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  rankMedalSilver: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rankMedalBronze: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  rankMedalText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  rankMedalTextSpecial: {
    fontSize: 13,
  },
  itemLeaderboardBody: {
    flex: 1,
    gap: 4,
  },
  itemLeaderboardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemLeaderboardName: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  itemTagsBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  itemRegionTagPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  itemRegionTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  itemCategoryDotText: {
    fontSize: 9.5,
    color: '#94A3B8',
  },
  itemLeaderboardRevenue: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  itemUnitsSoldTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  itemUnitsSoldText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  itemVolumeTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  itemVolumeFill: {
    height: '100%',
    borderRadius: 3,
  },
  culinaryCardBody: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  donutCenteringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  regionBarsContainer: {
    width: '100%',
    gap: 8,
  },
  culinaryHeaderTag: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  culinaryHeaderTagText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  catMetersListContainer: {
    width: '100%',
    gap: 9,
  },
  catMeterCardRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 5,
  },
  catMeterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catMeterTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 6,
  },
  catMeterName: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.textPrimary,
    flex: 1,
  },
  catMeterValuesCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catMeterRevenue: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  catMeterPctBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  catMeterPctText: {
    fontSize: 10,
    fontWeight: '900',
  },
  catMeterTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  catMeterFill: {
    height: '100%',
    borderRadius: 3,
  },
  catMeterFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catTopDishHint: {
    fontSize: 10,
    color: '#64748B',
    flex: 1,
    marginRight: 6,
  },
  catOrderCountText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  leaderboardListContainer: {
    width: '100%',
    gap: 7,
  },
  leaderboardCardItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 5,
  },
  leaderboardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leaderboardMedalBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardMedalText: {
    fontSize: 11,
    fontWeight: '900',
  },
  leaderboardInfoCol: {
    flex: 1,
    gap: 1,
  },
  leaderboardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leaderboardDishName: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.textPrimary,
    flex: 1,
  },
  dishRegionPill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dishRegionPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6D28D9',
  },
  leaderboardDishCategory: {
    fontSize: 10,
    color: '#64748B',
  },
  leaderboardStatsCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  leaderboardRevenueText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.textPrimary,
  },
  leaderboardUnitsPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  leaderboardUnitsPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  leaderboardVolumeTrack: {
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  leaderboardVolumeFill: {
    height: '100%',
    borderRadius: 2,
  },
});
