import React, { useState, useMemo, useEffect } from 'react';
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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useRestaurantStore, Table, Ticket, OnlineOrder, OrderItem, Invoice, BeverageOrderAlert } from '../../store/restaurantStore';
import { useOpsStore, InventoryItem } from '../../store/opsStore';
import { printInvoiceReceipt } from '../../components/Invoice';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import { broadcastImmediately } from '../../services/syncService';

function playFloorAttentionChime() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.45);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1760, now + 0.18);
        gain2.gain.setValueAtTime(0.25, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.65);
      }
    } catch (_) {}
  }
}

export default function FloorManagerScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { width, height } = useWindowDimensions();

  const isMobile = width < 768;
  const isSmallMobile = width < 420;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;

  // Responsive column counts & card widths (bulletproof calculation preventing premature row wraps)
  const numTableColumns = useMemo(() => {
    if (width >= 1480) return 5;
    if (width >= 1140) return 4;
    if (width >= 800) return 3;
    if (width >= 540) return 2;
    return 1;
  }, [width]);

  const tableCardWidth = useMemo(() => {
    if (numTableColumns === 1) return '100%';
    const scrollbarGutter = Platform.OS === 'web' ? 18 : 0;
    const padding = isMobile ? 24 : 40;
    const totalGaps = (numTableColumns - 1) * (isMobile ? 10 : 14);
    const available = width - padding - scrollbarGutter - totalGaps - 2;
    return Math.max(180, Math.floor(available / numTableColumns));
  }, [width, numTableColumns, isMobile]);

  const kdsCardWidth = useMemo(() => {
    if (numTableColumns === 1) return '100%';
    const scrollbarGutter = Platform.OS === 'web' ? 18 : 0;
    const padding = isMobile ? 24 : 40;
    const totalGaps = (numTableColumns - 1) * (isMobile ? 10 : 14);
    const available = width - padding - scrollbarGutter - totalGaps - 2;
    return Math.max(180, Math.floor(available / numTableColumns));
  }, [width, numTableColumns, isMobile]);

  const kpiColumns = useMemo(() => {
    if (width >= 1100) return 6;
    if (width >= 768) return 3;
    if (width >= 480) return 2;
    return 1;
  }, [width]);

  const kpiCardWidth = useMemo(() => {
    if (kpiColumns === 1) return '100%';
    const scrollbarGutter = Platform.OS === 'web' ? 18 : 0;
    const padding = isMobile ? 24 : 40;
    const totalGaps = (kpiColumns - 1) * 12;
    const available = width - padding - scrollbarGutter - totalGaps - 2;
    return Math.max(110, Math.floor(available / kpiColumns));
  }, [width, kpiColumns, isMobile]);

  const tables = useRestaurantStore((s) => s.tables || []);
  const tickets = useRestaurantStore((s) => s.tickets || []);
  const staff = useRestaurantStore((s) => s.staff || []);
  const floors = useRestaurantStore((s) => s.floors || []);
  const onlineOrders = useRestaurantStore((s) => s.onlineOrders || []);
  const invoices = useRestaurantStore((s) => s.invoices || []);

  const assignTableServer = useRestaurantStore((s) => s.assignTableServer);
  const transferTable = useRestaurantStore((s) => s.transferTable);
  const serveTableTickets = useRestaurantStore((s) => s.serveTableTickets);
  const settleBill = useRestaurantStore((s) => s.settleBill);
  const markTableBilled = useRestaurantStore((s) => s.markTableBilled);
  const confirmOnlineOrder = useRestaurantStore((s) => s.confirmOnlineOrder);
  const rejectOnlineOrder = useRestaurantStore((s) => s.rejectOnlineOrder);
  const lastBeverageOrderAlert = useRestaurantStore((s) => s.lastBeverageOrderAlert);
  const clearBeverageOrderAlert = useRestaurantStore((s) => s.clearBeverageOrderAlert);

  // Ops Inventory Store for Floor Chiller Management
  const inventory = useOpsStore((s) => s.inventory || []);
  const chillerHandovers = useOpsStore((s) => s.chillerHandovers || []);
  const adjustFloorChillerStock = useOpsStore((s) => s.adjustFloorChillerStock);

  // View Mode: 'tables' | 'kds' | 'chiller'
  const [activeView, setActiveView] = useState<'tables' | 'kds' | 'chiller'>('tables');
  const [kdsFilter, setKdsFilter] = useState<'all' | 'cooking' | 'ready' | 'pending'>('all');

  // Quick Chiller Adjust Modal State
  const [chillerAdjustItem, setChillerAdjustItem] = useState<InventoryItem | null>(null);
  const [chillerAdjustStockVal, setChillerAdjustStockVal] = useState('');
  const [chillerAdjustReason, setChillerAdjustReason] = useState('Stock Count Verification');

  // Identify manager's assigned floor(s)
  const userAssignedFloors = useMemo<string[]>(() => {
    if (!user) return ['Ground Floor'];
    const matchedStaff = staff.find(
      (st) =>
        st.id === user.id ||
        st.name?.trim().toLowerCase() === user.name?.trim().toLowerCase()
    );

    if (matchedStaff?.assignedZones && matchedStaff.assignedZones.length > 0) {
      return matchedStaff.assignedZones;
    }
    if (matchedStaff?.assignedZone) {
      return [matchedStaff.assignedZone];
    }
    return ['Ground Floor'];
  }, [user, staff]);

  const canSwitchFloors = useMemo(() => {
    if (!user) return false;
    const r = (user.role || '').toLowerCase();
    return r === 'admin' || r === 'manager' || userAssignedFloors.length > 1;
  }, [user, userAssignedFloors]);

  // Active Floor Selection
  const [selectedFloor, setSelectedFloor] = useState<string>(userAssignedFloors[0] || 'Ground Floor');

  useEffect(() => {
    if (userAssignedFloors.length > 0 && !canSwitchFloors) {
      setSelectedFloor(userAssignedFloors[0]);
    }
  }, [userAssignedFloors, canSwitchFloors]);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'occupied' | 'ready' | 'available' | 'billed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [reassignModalTable, setReassignModalTable] = useState<Table | null>(null);
  const [transferModalTable, setTransferModalTable] = useState<Table | null>(null);
  const [selectedTargetTableId, setSelectedTargetTableId] = useState<string>('');
  const [selectedWaiterName, setSelectedWaiterName] = useState<string>('');
  const [detailsModalTable, setDetailsModalTable] = useState<Table | null>(null);

  // Fullscreen State & Handler
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const handleFsChange = () => {
        setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
      };
      document.addEventListener('fullscreenchange', handleFsChange);
      document.addEventListener('webkitfullscreenchange', handleFsChange);
      return () => {
        document.removeEventListener('fullscreenchange', handleFsChange);
        document.removeEventListener('webkitfullscreenchange', handleFsChange);
      };
    }
  }, []);

  const toggleFullscreen = () => {
    if (typeof document !== 'undefined') {
      const doc = document as any;
      const docEl = document.documentElement as any;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    }
  };

  // Available floors list
  const floorList = useMemo(() => {
    if (floors && floors.length > 0) {
      return floors.map((f) => f.name);
    }
    return ['Ground Floor', '1st Floor', '2nd Floor', 'Rooftop'];
  }, [floors]);

  // Tables strictly on this floor
  const floorTables = useMemo(() => {
    return tables.filter((t) => {
      const tFloor = (t.floor || t.zone || '').trim().toLowerCase();
      const sFloor = selectedFloor.trim().toLowerCase();
      return tFloor === sFloor || tFloor.includes(sFloor);
    });
  }, [tables, selectedFloor]);

  // Floor Table Lookup Map for O(1) resolution
  const floorTableMap = useMemo(() => {
    const map = new Map<string, Table>();
    floorTables.forEach((t) => {
      map.set(t.id, t);
      map.set(t.name.trim().toLowerCase(), t);
    });
    return map;
  }, [floorTables]);

  // Active tickets strictly on this floor (excluding already fully served tickets)
  const floorTickets = useMemo(() => {
    return tickets.filter((tk) => {
      if (tk.status === 'served') return false;
      const matchedTable =
        floorTableMap.get(tk.tableId) ||
        (tk.tableName ? floorTableMap.get(tk.tableName.trim().toLowerCase()) : undefined);
      return !!matchedTable;
    });
  }, [tickets, floorTableMap]);

  // Live Floor KDS Metrics
  const kdsMetrics = useMemo(() => {
    let cookingCount = 0;
    let readyCount = 0;
    let pendingCount = 0;
    let totalDishes = 0;

    floorTickets.forEach((tk) => {
      const isReady =
        tk.status === 'ready' ||
        (tk.items && tk.items.some((i) => i.itemStatus === 'ready'));
      const isCooking =
        tk.status === 'cooking' ||
        (tk.items && tk.items.some((i) => i.itemStatus === 'cooking'));

      if (isReady) readyCount++;
      else if (isCooking) cookingCount++;
      else pendingCount++;

      totalDishes += (tk.items || []).reduce((s, it) => s + (it.qty || 1), 0);
    });

    return { cookingCount, readyCount, pendingCount, totalDishes };
  }, [floorTickets]);

  // Filtered KDS Tickets for Floor Manager
  const displayedKdsTickets = useMemo(() => {
    return floorTickets.filter((tk) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTable = (tk.tableName || '').toLowerCase().includes(q);
        const matchServer = (tk.server || '').toLowerCase().includes(q);
        const matchItems = (tk.items || []).some((it) => (it.name || '').toLowerCase().includes(q));
        if (!matchTable && !matchServer && !matchItems) return false;
      }

      if (kdsFilter === 'all') return true;
      if (kdsFilter === 'ready') {
        return tk.status === 'ready' || (tk.items && tk.items.some((it) => it.itemStatus === 'ready'));
      }
      if (kdsFilter === 'cooking') {
        return tk.status === 'cooking' || (tk.items && tk.items.some((it) => it.itemStatus === 'cooking'));
      }
      if (kdsFilter === 'pending') {
        return tk.status === 'pending' && !(tk.items && tk.items.some((it) => it.itemStatus === 'cooking' || it.itemStatus === 'ready'));
      }
      return true;
    });
  }, [floorTickets, kdsFilter, searchQuery]);

  // Print Provisional Unpaid Bill for any table
  const handlePrintTableUnpaidBill = (targetTable: Table) => {
    const targetIdStr = String(targetTable.id).trim().toLowerCase();
    const targetNameStr = targetTable.name?.trim().toLowerCase();

    // 1. Gather all tickets belonging to this table by ID or Name (regardless of served status)
    const tableTickets = (tickets || []).filter((tk) => {
      const tkTableIdStr = String(tk.tableId).trim().toLowerCase();
      const tkTableNameStr = tk.tableName ? tk.tableName.trim().toLowerCase() : '';
      return tkTableIdStr === targetIdStr || (targetNameStr && tkTableNameStr === targetNameStr);
    });

    const allItems: OrderItem[] = [];

    tableTickets.forEach((tk) => {
      if (tk.items && tk.items.length > 0) {
        tk.items.forEach((it) => {
          const existing = allItems.find((x) => x.id === it.id && x.name === it.name);
          if (existing) {
            existing.qty = (Number(existing.qty) || 0) + (Number(it.qty) || 1);
          } else {
            allItems.push({ ...it, qty: Number(it.qty) || 1 });
          }
        });
      }
    });

    // 2. Also incorporate items from targetTable.orders (so orders placed or held on the table are included)
    if (targetTable.orders && targetTable.orders.length > 0) {
      if (allItems.length === 0) {
        targetTable.orders.forEach((o) => {
          allItems.push({ ...o, qty: Number(o.qty) || 1 });
        });
      } else {
        targetTable.orders.forEach((to) => {
          const existing = allItems.find((x) => x.id === to.id || x.name === to.name);
          if (!existing) {
            allItems.push({ ...to, qty: Number(to.qty) || 1 });
          }
        });
      }
    }

    if (allItems.length === 0) {
      const msg = `Table ${targetTable.name} has no active food items to bill.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert("No Active Items", msg);
      return;
    }

    const subTotal = allItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
      0
    );
    const tax = Math.round(subTotal * 0.16);
    const total = Math.round(subTotal + tax);

    const unpaidInvoice: Invoice = {
      id: `CHK-${targetTable.name.replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`,
      orderType: 'dine-in',
      tableId: targetTable.id,
      tableName: targetTable.name,
      server: targetTable.server || tableTickets[0]?.server || user?.name || 'Floor Staff',
      orderTakenBy: targetTable.server || tableTickets[0]?.server || 'Floor Staff',
      cashier: user?.name || 'Floor Manager',
      timePlaced: tableTickets[0]?.timePlaced || targetTable.occupiedSince || Date.now(),
      timeSettled: Date.now(),
      items: allItems,
      subTotal,
      discount: 0,
      tax,
      total,
      payments: [],
      status: 'unpaid',
      isUnpaidBill: true,
      notes: `Provisional check (Unpaid bill) printed by Floor Manager (${user?.name || 'Manager'})`,
    };

    markTableBilled(targetTable.id, unpaidInvoice.id);
    broadcastImmediately();
    printInvoiceReceipt(unpaidInvoice);

    const alertMsg = `✅ Unpaid Bill (غیر ادا شدہ بل) printed for ${targetTable.name}!\nTable marked as BILLED / PAYING.`;
    if (Platform.OS === 'web') window.alert(alertMsg);
    else Alert.alert("Bill Printed", alertMsg);
  };

  // Floor Waiters
  const floorWaiters = useMemo(() => {
    return staff.filter((st) => {
      const r = (st.role || '').toLowerCase();
      if (!r.includes('waiter') && r !== 'order taker') return false;
      if (st.status === 'Inactive') return false;

      const zList = st.assignedZones || (st.assignedZone ? [st.assignedZone] : []);
      if (zList.length === 0) return true;
      return zList.some((z) => z.toLowerCase().includes(selectedFloor.toLowerCase()));
    });
  }, [staff, selectedFloor]);

  // Urgent pending digital menu orders on this floor
  const pendingFloorOrders = useMemo(() => {
    return onlineOrders.filter((o) => {
      if (o.status !== 'PENDING' && o.status !== ('pending' as any)) return false;
      const orderFloor = (o.floor || '').trim().toLowerCase();
      const currentFloor = selectedFloor.trim().toLowerCase();
      if (orderFloor === currentFloor || orderFloor.includes(currentFloor)) return true;
      const matchedTable = tables.find(
        (t) => t.id === o.tableId || t.name.toLowerCase() === (o.tableName || '').toLowerCase()
      );
      if (matchedTable) {
        const tFloor = (matchedTable.floor || matchedTable.zone || '').trim().toLowerCase();
        return tFloor === currentFloor || tFloor.includes(currentFloor);
      }
      return false;
    });
  }, [onlineOrders, selectedFloor, tables]);

  // Urgent recurring chime while pending digital menu orders await confirmation
  useEffect(() => {
    if (pendingFloorOrders.length === 0) return;

    playFloorAttentionChime();
    const intervalId = setInterval(() => {
      playFloorAttentionChime();
    }, 3800);

    return () => clearInterval(intervalId);
  }, [pendingFloorOrders.length]);

  // Filter beverages for current floor's chiller
  const floorBeverages = useMemo(() => {
    return inventory.filter((item) => {
      const isBev =
        (item.category || '').toLowerCase() === 'beverages' ||
        (item.category || '').toLowerCase() === 'drinks' ||
        (item.category || '').toLowerCase().includes('juice') ||
        (item.name || '').toLowerCase().includes('pepsi') ||
        (item.name || '').toLowerCase().includes('coke') ||
        (item.name || '').toLowerCase().includes('water') ||
        (item.name || '').toLowerCase().includes('sprite');
      return isBev;
    });
  }, [inventory]);

  // Floor Chiller summary stats
  const chillerStats = useMemo(() => {
    let totalCans = 0;
    let lowCount = 0;
    floorBeverages.forEach((b) => {
      const qty = Number(b.chillerStock?.[selectedFloor] || 0);
      totalCans += qty;
      if (qty <= (b.chillerThreshold || 5)) lowCount++;
    });
    return { totalCans, lowCount, variety: floorBeverages.length };
  }, [floorBeverages, selectedFloor]);

  // Active beverage orders for this floor (from live tickets placed recently or alert)
  const floorActiveBeverageOrders = useMemo(() => {
    const activeBevTickets: {
      ticketId: string;
      tableName: string;
      server?: string;
      items: OrderItem[];
      timePlaced: number;
    }[] = [];

    floorTickets.forEach((tk) => {
      if (tk.status === 'served') return;
      const bevItems = (tk.items || []).filter(
        (it) =>
          (it.station || '') === 'juice' ||
          it.name.toLowerCase().includes('water') ||
          it.name.toLowerCase().includes('coke') ||
          it.name.toLowerCase().includes('pepsi') ||
          it.name.toLowerCase().includes('soda')
      );
      if (bevItems.length > 0) {
        activeBevTickets.push({
          ticketId: tk.id,
          tableName: tk.tableName || 'Table',
          server: tk.server,
          items: bevItems,
          timePlaced: tk.timePlaced || Date.now(),
        });
      }
    });

    return activeBevTickets;
  }, [floorTickets]);

  // Check if there is an active Beverage Order Alert for this floor
  const isMatchingFloorBeverageAlert = useMemo(() => {
    if (!lastBeverageOrderAlert || lastBeverageOrderAlert.status !== 'pending') return false;
    const alertFloor = (lastBeverageOrderAlert.floor || '').trim().toLowerCase();
    const currFloor = selectedFloor.trim().toLowerCase();
    const isFloorMatch = alertFloor === currFloor || alertFloor.includes(currFloor) || currFloor.includes(alertFloor);
    const isRecent = Date.now() - (lastBeverageOrderAlert.time || 0) < 15 * 60 * 1000;
    return isFloorMatch && isRecent;
  }, [lastBeverageOrderAlert, selectedFloor]);

  // Audio chime when a new beverage order hits this floor's chiller
  useEffect(() => {
    if (isMatchingFloorBeverageAlert) {
      playFloorAttentionChime();
    }
  }, [isMatchingFloorBeverageAlert, lastBeverageOrderAlert?.id]);

  // Floor KPIs
  const kpis = useMemo(() => {
    const total = floorTables.length;
    const occupied = floorTables.filter((t) => t.status === 'occupied').length;
    const billed = floorTables.filter((t) => t.status === 'billed').length;
    const available = floorTables.filter((t) => t.status === 'available').length;

    // Check which tables have food ready at pass
    const readyCount = floorTables.filter((t) => {
      const tableTickets = tickets.filter((tk) => tk.tableId === t.id && tk.status !== 'served');
      return tableTickets.some(
        (tk) => tk.status === 'ready' || (tk.items && tk.items.some((it) => it.itemStatus === 'ready'))
      );
    }).length;

    const occupancyRate = total > 0 ? Math.round(((occupied + billed) / total) * 100) : 0;

    // Calculate today's sales on this floor from invoices
    const floorTableNames = new Set(floorTables.map((t) => t.name.toLowerCase()));
    const today = new Date().toISOString().split('T')[0];
    const floorSales = invoices
      .filter((inv) => {
        const invTime = inv.timeSettled || inv.timePlaced;
        const invDate = invTime ? new Date(invTime).toISOString().split('T')[0] : '';
        if (invDate !== today) return false;
        const invTableName = (inv.tableName || '').toLowerCase();
        return floorTableNames.has(invTableName);
      })
      .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

    return { total, occupied, billed, available, readyCount, occupancyRate, floorSales };
  }, [floorTables, tickets, invoices]);

  // Filtered tables for display
  const displayedTables = useMemo(() => {
    return floorTables.filter((t) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = t.name.toLowerCase().includes(q);
        const matchServer = (t.server || '').toLowerCase().includes(q);
        const matchType = (t.seatingType || '').toLowerCase().includes(q);
        if (!matchName && !matchServer && !matchType) return false;
      }

      // Status
      if (statusFilter === 'all') return true;
      if (statusFilter === 'occupied') return t.status === 'occupied';
      if (statusFilter === 'available') return t.status === 'available';
      if (statusFilter === 'billed') return t.status === 'billed';
      if (statusFilter === 'ready') {
        const tableTickets = tickets.filter((tk) => tk.tableId === t.id && tk.status !== 'served');
        return tableTickets.some(
          (tk) => tk.status === 'ready' || (tk.items && tk.items.some((it) => it.itemStatus === 'ready'))
        );
      }
      return true;
    });
  }, [floorTables, searchQuery, statusFilter, tickets]);

  // Quick Reassign Waiter Action
  const handleReassign = () => {
    if (!reassignModalTable || !selectedWaiterName) return;
    assignTableServer(reassignModalTable.id, selectedWaiterName);
    broadcastImmediately();
    setReassignModalTable(null);
    setSelectedWaiterName('');
  };

  // Quick Table Transfer Action
  const handleTransfer = () => {
    if (!transferModalTable || !selectedTargetTableId) return;
    transferTable(transferModalTable.id, selectedTargetTableId);
    broadcastImmediately();
    setTransferModalTable(null);
    setSelectedTargetTableId('');
  };

  // Quick Chiller Adjust / Physical Audit Action
  const handleSaveChillerAdjust = () => {
    if (!chillerAdjustItem) return;
    const newQty = Number(chillerAdjustStockVal);
    if (isNaN(newQty) || newQty < 0) {
      const msg = 'Please enter a valid non-negative quantity for chiller stock.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid Quantity', msg);
      return;
    }
    adjustFloorChillerStock({
      itemId: chillerAdjustItem.id,
      floor: selectedFloor,
      newStock: newQty,
      reason: chillerAdjustReason || 'Stock Count Verification',
      by: user?.name || 'Floor Manager',
    });
    broadcastImmediately();
    setChillerAdjustItem(null);
    setChillerAdjustStockVal('');
    setChillerAdjustReason('Stock Count Verification');
  };

  return (
    <View style={styles.container}>
      {/* 1. TOP HEADER BAR */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={[styles.headerLeft, isMobile && { flex: 1, minWidth: isSmallMobile ? 160 : 200 }]}>
          <View style={[styles.floorBadgeIcon, isSmallMobile && { width: 36, height: 36, borderRadius: 10 }]}>
            <MaterialCommunityIcons name="layers-triple" size={isSmallMobile ? 20 : 24} color="#0D9488" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[styles.headerTitle, isSmallMobile && { fontSize: 15 }]} numberOfLines={1}>
                {selectedFloor.toUpperCase()}
              </Text>
              <View style={styles.livePulse}>
                <View style={styles.pulseDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              <Text style={{ color: '#0F766E', fontWeight: '800' }}>{user?.name || 'Manager'}</Text> • Sultan Royal Ops
            </Text>
          </View>
        </View>

        <View style={[styles.headerRight, isMobile && styles.headerRightMobile]}>
          <SyncStatusBadge compact />
          {/* Toggle Full Screen Button (Web only) */}
          {Platform.OS === 'web' && !isSmallMobile && (
            <TouchableOpacity
              style={[styles.navBtn, isFullscreen && styles.navBtnActiveFullscreen, isMobile && styles.navBtnCompact]}
              onPress={toggleFullscreen}
            >
              <MaterialCommunityIcons
                name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
                size={16}
                color={isFullscreen ? '#0D9488' : '#0284C7'}
              />
              <Text style={[styles.navBtnText, isFullscreen && { color: '#0D9488' }]}>
                {isFullscreen ? 'Exit Full' : 'Full'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnPos, isMobile && styles.navBtnCompact]}
            onPress={() => router.push('/floor-manager/pos' as any)}
          >
            <MaterialCommunityIcons name="point-of-sale" size={16} color="#854D0E" />
            <Text style={[styles.navBtnText, { color: '#854D0E' }]}>
              {isSmallMobile ? 'POS' : 'Open POS'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navBtn,
              activeView === 'kds' && { borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.15)' },
              isMobile && styles.navBtnCompact,
            ]}
            onPress={() => setActiveView(activeView === 'kds' ? 'tables' : 'kds')}
          >
            <MaterialCommunityIcons
              name="chef-hat"
              size={16}
              color={activeView === 'kds' ? '#F59E0B' : '#10B981'}
            />
            <Text style={[styles.navBtnText, activeView === 'kds' && { color: '#F59E0B' }]}>
              {activeView === 'kds' ? (isSmallMobile ? 'Tables' : 'View Tables') : (isSmallMobile ? 'KDS' : 'Floor KDS')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, styles.logoutBtn, isMobile && styles.navBtnCompact]}
            onPress={logout}
          >
            <MaterialCommunityIcons name="logout" size={16} color="#EF4444" />
            {!isSmallMobile && <Text style={[styles.navBtnText, { color: '#EF4444' }]}>Logout</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. FLOOR SELECTOR TABS (Available to Admins & Multi-Zone Managers) */}
      {canSwitchFloors && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.floorTabBar, { paddingHorizontal: isMobile ? 12 : 20 }]}
          style={styles.floorTabBarScroll}
        >
          <Text style={styles.floorTabLabel}>FLOORS:</Text>
          {floorList.map((fName) => {
            const isCurrent = fName.toLowerCase() === selectedFloor.toLowerCase();
            return (
              <TouchableOpacity
                key={fName}
                style={[styles.floorTab, isCurrent && styles.floorTabActive]}
                onPress={() => setSelectedFloor(fName)}
              >
                <MaterialCommunityIcons
                  name="storefront"
                  size={15}
                  color={isCurrent ? '#FFF' : '#9CA3AF'}
                />
                <Text style={[styles.floorTabText, isCurrent && styles.floorTabTextActive]}>
                  {fName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 2B. PRIMARY CONSOLE VIEW SWITCHER (Floor Tables vs Live KDS) */}
      <View style={[styles.viewSwitcherBar, isMobile && { paddingHorizontal: 12, gap: 8 }]}>
        <TouchableOpacity
          style={[styles.viewTab, activeView === 'tables' && styles.viewTabActiveTables, isMobile && { flex: 1, justifyContent: 'center', paddingHorizontal: 8 }]}
          onPress={() => setActiveView('tables')}
        >
          <MaterialCommunityIcons
            name="table-furniture"
            size={18}
            color={activeView === 'tables' ? '#0D9488' : '#9CA3AF'}
          />
          <Text
            style={[styles.viewTabText, activeView === 'tables' && styles.viewTabTextActiveTables]}
            numberOfLines={1}
          >
            {isSmallMobile ? `Tables (${floorTables.length})` : `Floor Tables (${floorTables.length})`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewTab, activeView === 'kds' && styles.viewTabActiveKds, isMobile && { flex: 1, justifyContent: 'center', paddingHorizontal: 8 }]}
          onPress={() => setActiveView('kds')}
        >
          <MaterialCommunityIcons
            name="chef-hat"
            size={18}
            color={activeView === 'kds' ? '#F59E0B' : '#9CA3AF'}
          />
          <Text
            style={[styles.viewTabText, activeView === 'kds' && styles.viewTabTextActiveKds]}
            numberOfLines={1}
          >
            {isSmallMobile ? `KDS (${floorTickets.length})` : `Live KDS (${floorTickets.length})`}
          </Text>
          {(kdsMetrics.cookingCount > 0 || kdsMetrics.readyCount > 0) && (
            <View style={[styles.kdsLiveBadge, kdsMetrics.readyCount > 0 ? styles.kdsBadgeReady : styles.kdsBadgeCooking]}>
              <Text style={styles.kdsBadgeText}>
                {kdsMetrics.readyCount > 0 ? `🔔 ${kdsMetrics.readyCount}` : `🔥 ${kdsMetrics.cookingCount}`}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.viewTab,
            activeView === 'chiller' && { backgroundColor: '#F0F9FF', borderColor: '#0284C7' },
            isMobile && { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
          ]}
          onPress={() => setActiveView('chiller')}
        >
          <MaterialCommunityIcons
            name="snowflake"
            size={18}
            color={activeView === 'chiller' ? '#0284C7' : '#9CA3AF'}
          />
          <Text
            style={[
              styles.viewTabText,
              activeView === 'chiller' && { color: '#0369A1', fontWeight: '900' },
            ]}
            numberOfLines={1}
          >
            {isSmallMobile ? `Chiller (${chillerStats.totalCans})` : `Floor Chiller (${chillerStats.totalCans})`}
          </Text>
          {chillerStats.lowCount > 0 && (
            <View style={[styles.kdsLiveBadge, { backgroundColor: '#DC2626' }]}>
              <Text style={styles.kdsBadgeText}>⚠️ {chillerStats.lowCount} Low</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 2C. LIVE BEVERAGE ORDER ALERT BANNER (CHILLER NOTIFICATION) */}
      {isMatchingFloorBeverageAlert && lastBeverageOrderAlert && (
        <View
          style={{
            marginHorizontal: isMobile ? 12 : 20,
            marginBottom: 12,
            backgroundColor: '#0284C7',
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: '#0284C7',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <MaterialCommunityIcons name="glass-cocktail" size={26} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#BAE6FD', letterSpacing: 0.5 }}>
                  NEW BEVERAGE ORDER • {lastBeverageOrderAlert.floor.toUpperCase()} CHILLER
                </Text>
                <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#0369A1' }}>DISPENSE NOW</Text>
                </View>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#FFFFFF', marginTop: 2 }}>
                Table {lastBeverageOrderAlert.tableName} — {lastBeverageOrderAlert.itemsSummary}
              </Text>
              <Text style={{ fontSize: 11.5, color: '#E0F2FE', marginTop: 1 }}>
                Order taken by: {lastBeverageOrderAlert.server || 'Waiter'} • Auto-deducted from {lastBeverageOrderAlert.floor} Chiller stock
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#FFFFFF',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
              }}
              onPress={() => clearBeverageOrderAlert(lastBeverageOrderAlert.id)}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0369A1' }}>
                ✓ Served / Dismiss
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 3. URGENT PENDING DIGITAL MENU ORDERS QUEUE */}
      {pendingFloorOrders.length > 0 && (
        <View style={[styles.urgentQueueBox, isMobile && { paddingHorizontal: 12, paddingVertical: 8 }]}>
          <View style={styles.urgentQueueHeader}>
            <MaterialCommunityIcons name="bell-ring" size={18} color="#DC2626" />
            <Text style={styles.urgentQueueTitle} numberOfLines={1}>
              {pendingFloorOrders.length} PENDING ORDER{pendingFloorOrders.length > 1 ? 'S' : ''} AWAITING CONFIRMATION
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.urgentQueueScroll}>
            {pendingFloorOrders.map((pOrder) => (
              <View
                key={pOrder.id}
                style={[
                  styles.urgentOrderCard,
                  { width: isMobile ? Math.min(width - 40, 280) : 280 },
                ]}
              >
                <View style={styles.urgentOrderCardHeader}>
                  <Text style={styles.urgentOrderTable}>{pOrder.tableName || pOrder.tableId}</Text>
                  <Text style={styles.urgentOrderTotal}>Rs. {pOrder.total.toLocaleString()}</Text>
                </View>
                <Text style={styles.urgentCustomer} numberOfLines={1}>
                  {pOrder.customer?.name} • {pOrder.customer?.phone}
                </Text>
                <Text style={styles.urgentItems} numberOfLines={2}>
                  {pOrder.items.map((it) => `${it.qty || 1}x ${it.name}`).join(', ')}
                </Text>
                <View style={styles.urgentCardActions}>
                  <TouchableOpacity
                    style={styles.urgentBtnReject}
                    onPress={() => rejectOnlineOrder(pOrder.id, 'Declined by Floor Manager')}
                  >
                    <Text style={styles.urgentBtnRejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.urgentBtnConfirm}
                    onPress={() => confirmOnlineOrder(pOrder.id, floorWaiters[0]?.name || 'Floor Manager')}
                  >
                    <Text style={styles.urgentBtnConfirmText}>✓ Confirm KOT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 4. FLOOR METRICS (KPIs) STRIP */}
      <View style={[styles.kpiContainer, isMobile && { paddingHorizontal: 12, paddingVertical: 10, gap: 8 }]}>
        <View style={[styles.kpiCard, { width: kpiCardWidth, borderTopColor: '#0D9488', borderTopWidth: 3 }]}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>OCCUPANCY</Text>
            <MaterialCommunityIcons name="chart-donut" size={16} color="#0D9488" />
          </View>
          <Text style={[styles.kpiValue, { color: kpis.occupancyRate > 70 ? '#EF4444' : '#0F766E', fontSize: isSmallMobile ? 18 : 22 }]}>
            {kpis.occupancyRate}%
          </Text>
          <Text style={styles.kpiSub} numberOfLines={1}>{kpis.occupied + kpis.billed}/{kpis.total} In Use</Text>
        </View>

        <TouchableOpacity 
          style={[styles.kpiCard, { width: kpiCardWidth, borderTopColor: '#F59E0B', borderTopWidth: 3 }, activeView === 'kds' && { borderColor: '#F59E0B' }]}
          onPress={() => {
            setActiveView('kds');
            setKdsFilter('cooking');
          }}
        >
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>KDS COOKING</Text>
            <MaterialCommunityIcons name="fire" size={16} color="#F59E0B" />
          </View>
          <Text style={[styles.kpiValue, { color: kdsMetrics.cookingCount > 0 ? '#D97706' : '#64748B', fontSize: isSmallMobile ? 18 : 22 }]}>
            {kdsMetrics.cookingCount}
          </Text>
          <Text style={styles.kpiSub} numberOfLines={1}>{kdsMetrics.totalDishes} In Kitchen</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.kpiCard, { width: kpiCardWidth, borderTopColor: '#10B981', borderTopWidth: 3 }, activeView === 'kds' && { borderColor: '#10B981' }]}
          onPress={() => {
            setActiveView('kds');
            setKdsFilter('ready');
          }}
        >
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>FOOD READY</Text>
            <MaterialCommunityIcons name="bell-ring" size={16} color="#10B981" />
          </View>
          <Text style={[styles.kpiValue, { color: kdsMetrics.readyCount > 0 ? '#059669' : '#64748B', fontSize: isSmallMobile ? 18 : 22 }]}>
            {kdsMetrics.readyCount}
          </Text>
          <Text style={styles.kpiSub} numberOfLines={1}>Pickup Needed</Text>
        </TouchableOpacity>

        <View style={[styles.kpiCard, { width: kpiCardWidth, borderTopColor: '#3B82F6', borderTopWidth: 3 }]}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>BILLED</Text>
            <MaterialCommunityIcons name="receipt" size={16} color="#3B82F6" />
          </View>
          <Text style={[styles.kpiValue, { color: '#2563EB', fontSize: isSmallMobile ? 18 : 22 }]}>{kpis.billed}</Text>
          <Text style={styles.kpiSub} numberOfLines={1}>Awaiting Pay</Text>
        </View>

        <View style={[styles.kpiCard, { width: kpiCardWidth, borderTopColor: '#059669', borderTopWidth: 3 }]}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>AVAILABLE</Text>
            <MaterialCommunityIcons name="check-circle" size={16} color="#059669" />
          </View>
          <Text style={[styles.kpiValue, { color: '#059669', fontSize: isSmallMobile ? 18 : 22 }]}>{kpis.available}</Text>
          <Text style={styles.kpiSub} numberOfLines={1}>Ready for Guests</Text>
        </View>

        <View style={[styles.kpiCard, { width: kpiCardWidth, borderTopColor: '#D97706', borderTopWidth: 3 }]}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>TODAY'S SALES</Text>
            <MaterialCommunityIcons name="cash-register" size={16} color="#D97706" />
          </View>
          <Text style={[styles.kpiValue, { color: '#B45309', fontSize: isSmallMobile ? 16 : 20 }]} numberOfLines={1}>
            Rs. {kpis.floorSales.toLocaleString()}
          </Text>
          <Text style={styles.kpiSub} numberOfLines={1}>Settled Today</Text>
        </View>
      </View>

      {/* 5. CONTROLS: SEARCH & VIEW-SPECIFIC FILTERS */}
      <View style={[styles.controlsBar, isMobile && { paddingHorizontal: 12, gap: 10 }]}>
        <View style={[styles.searchBox, isMobile && { minWidth: '100%', width: '100%' }]}>
          <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeView === 'kds'
                ? "Search items, table, or waiter..."
                : "Search table, assigned waiter, or type..."
            }
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {activeView === 'tables' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsScroll}
            style={isMobile ? { width: '100%' } : undefined}
          >
            {(['all', 'occupied', 'ready', 'available', 'billed'] as const).map((filter) => {
              const isActive = statusFilter === filter;
              const count =
                filter === 'all'
                  ? kpis.total
                  : filter === 'occupied'
                  ? kpis.occupied
                  : filter === 'ready'
                  ? kpis.readyCount
                  : filter === 'available'
                  ? kpis.available
                  : kpis.billed;

              return (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setStatusFilter(filter)}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {filter === 'all' && 'All Tables'}
                    {filter === 'occupied' && 'Occupied'}
                    {filter === 'ready' && 'Food Ready'}
                    {filter === 'available' && 'Available'}
                    {filter === 'billed' && 'Billed'}
                  </Text>
                  <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                    <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsScroll}
            style={isMobile ? { width: '100%' } : undefined}
          >
            {(['all', 'cooking', 'ready', 'pending'] as const).map((fKey) => {
              const isActive = kdsFilter === fKey;
              const count =
                fKey === 'all'
                  ? floorTickets.length
                  : fKey === 'cooking'
                  ? kdsMetrics.cookingCount
                  : fKey === 'ready'
                  ? kdsMetrics.readyCount
                  : kdsMetrics.pendingCount;

              return (
                <TouchableOpacity
                  key={fKey}
                  style={[styles.filterPill, isActive && styles.filterPillActiveKds]}
                  onPress={() => setKdsFilter(fKey)}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {fKey === 'all' && 'All KOTs'}
                    {fKey === 'cooking' && '🔥 Cooking'}
                    {fKey === 'ready' && '🔔 Ready'}
                    {fKey === 'pending' && '⏳ Queue'}
                  </Text>
                  <View style={[styles.filterBadge, isActive && styles.filterBadgeActiveKds]}>
                    <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* 6. PRIMARY CONTENT AREA: TABLES BLUEPRINT OR LIVE FLOOR KDS */}
      {activeView === 'tables' ? (
        <ScrollView contentContainerStyle={[styles.tablesScroll, isMobile && { paddingHorizontal: 12, paddingBottom: 60 }]}>
          <View style={[styles.tablesGrid, isMobile && { gap: 10 }]}>
            {displayedTables.map((table) => {
              const tableIdStr = String(table.id).trim().toLowerCase();
              const tableNameStr = table.name.trim().toLowerCase();
              const tableAllTickets = tickets.filter(
                (tk) =>
                  String(tk.tableId).trim().toLowerCase() === tableIdStr ||
                  (tk.tableName && tk.tableName.trim().toLowerCase() === tableNameStr)
              );
              const unservedTickets = tableAllTickets.filter((tk) => tk.status !== 'served');
              const allTableItems = tableAllTickets.flatMap((tk) => tk.items || []);
              const cookingItems = allTableItems.filter(
                (i) => i.itemStatus === 'cooking' || (!i.itemStatus && unservedTickets.some((tk) => tk.status === 'cooking'))
              );
              const readyItems = allTableItems.filter(
                (i) => i.itemStatus === 'ready' || (!i.itemStatus && unservedTickets.some((tk) => tk.status === 'ready'))
              );
              const hasReadyFood =
                readyItems.length > 0 ||
                unservedTickets.some(
                  (tk) => tk.status === 'ready' || (tk.items && tk.items.some((it) => it.itemStatus === 'ready'))
                );

              // Determine status badge color
              let statusBadge = { bg: '#ECFDF5', label: 'AVAILABLE', text: '#065F46', border: '#A7F3D0' };
              if (table.status === 'occupied') {
                statusBadge = hasReadyFood
                  ? { bg: '#FEF3C7', label: 'FOOD READY', text: '#92400E', border: '#FCD34D' }
                  : { bg: '#FEE2E2', label: 'OCCUPIED', text: '#DC2626', border: '#FCA5A5' };
              } else if (table.status === 'billed') {
                statusBadge = { bg: '#EFF6FF', label: 'BILLED', text: '#1D4ED8', border: '#BFDBFE' };
              }

              return (
                <View
                  key={table.id}
                  style={[
                    styles.tableCard,
                    { width: tableCardWidth, maxWidth: '100%' },
                    hasReadyFood && styles.tableCardFoodReady,
                    table.status === 'occupied' && !hasReadyFood && styles.tableCardOccupied,
                    table.status === 'billed' && styles.tableCardBilled,
                  ]}
                >
                  {/* Status Indicator Bar at Top */}
                  <View style={[styles.cardTopIndicator, { backgroundColor: statusBadge.border }]} />

                  <View style={{ flex: 1, justifyContent: 'flex-start' }}>
                    {/* Table Header */}
                    <View style={styles.tableCardHeader}>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={styles.tableName} numberOfLines={1}>{table.name}</Text>
                        <View style={styles.seatingTag}>
                          <MaterialCommunityIcons
                            name={
                              table.seatingType === 'majlis'
                                ? 'sofa'
                                : table.seatingType === 'couches'
                                ? 'chair-rolling'
                                : 'table-furniture'
                            }
                            size={13}
                            color="#B45309"
                          />
                          <Text style={styles.seatingText}>
                            {table.seatingType?.toUpperCase() || 'DINING'} • {table.seats || 4} SEATS
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg, borderWidth: 1, borderColor: statusBadge.border }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusBadge.text }]} />
                        <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>
                          {statusBadge.label}
                        </Text>
                      </View>
                    </View>

                    {/* Table Body Info */}
                    <View style={styles.tableCardBody}>
                      <View style={styles.detailRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" />
                          <Text style={styles.detailLabel}>Assigned Server:</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.waiterChip}
                          onPress={() => {
                            setReassignModalTable(table);
                            setSelectedWaiterName(table.server || floorWaiters[0]?.name || '');
                          }}
                        >
                          <MaterialCommunityIcons name="account-tie" size={13} color="#0D9488" />
                          <Text style={styles.waiterChipText} numberOfLines={1} ellipsizeMode="tail">
                            {table.server || 'Unassigned'}
                          </Text>
                          <MaterialCommunityIcons name="pencil-outline" size={11} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>

                      {table.status !== 'available' && (
                        <>
                          <View style={styles.detailRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <MaterialCommunityIcons name="receipt-text-outline" size={13} color="#64748B" />
                              <Text style={styles.detailLabel}>Active Tickets:</Text>
                            </View>
                            <Text style={styles.detailVal}>
                              {tableAllTickets.length} KOT{tableAllTickets.length > 1 ? 's' : ''}
                              {unservedTickets.length > 0 && unservedTickets.length !== tableAllTickets.length ? ` (${unservedTickets.length} active)` : ''}
                            </Text>
                          </View>

                          <View style={styles.detailRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <MaterialCommunityIcons name="cash" size={14} color="#059669" />
                              <Text style={styles.detailLabel}>Bill Total:</Text>
                            </View>
                            <Text style={styles.billTotalVal}>
                              Rs. {(
                                table.billTotal ||
                                allTableItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0) ||
                                0
                              ).toLocaleString()}
                            </Text>
                          </View>

                          {/* Live KDS Status Pills right on table card */}
                          {(cookingItems.length > 0 || readyItems.length > 0) && (
                            <View style={styles.cardKdsSnippetBox}>
                              {readyItems.length > 0 && (
                                <View style={styles.snippetPillReady}>
                                  <MaterialCommunityIcons name="bell-ring" size={12} color="#065F46" />
                                  <Text style={styles.snippetPillReadyText}>{readyItems.length} Ready to Serve</Text>
                                </View>
                              )}
                              {cookingItems.length > 0 && (
                                <View style={styles.snippetPillCooking}>
                                  <MaterialCommunityIcons name="fire" size={12} color="#92400E" />
                                  <Text style={styles.snippetPillCookingText}>{cookingItems.length} Cooking in KDS</Text>
                                </View>
                              )}
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  </View>

                  {/* Table Action Buttons */}
                  <View style={styles.tableActions}>
                    {table.status === 'available' ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.btnPunchOrder]}
                        onPress={() => router.push({ pathname: '/floor-manager/pos' as any, params: { tableId: table.id } })}
                      >
                        <MaterialCommunityIcons name="plus-circle" size={16} color="#FFF" />
                        <Text style={styles.btnPunchText}>Seat & Punch Order</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.occupiedActionsCol}>
                        {hasReadyFood && (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnServeFull]}
                            onPress={() => {
                              serveTableTickets(table.id);
                              broadcastImmediately();
                            }}
                          >
                            <MaterialCommunityIcons name="bell-ring" size={14} color="#FFF" />
                            <Text style={styles.btnServeText}>Serve Food to Table</Text>
                          </TouchableOpacity>
                        )}

                        {/* Row 1: Print Bill & Add-On / Clear */}
                        <View style={styles.actionBtnRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnHalf, styles.btnPrintBill]}
                            onPress={() => handlePrintTableUnpaidBill(table)}
                          >
                            <MaterialCommunityIcons name="printer-outline" size={13} color="#DC2626" />
                            <Text style={styles.btnPrintBillText}>Print Bill</Text>
                          </TouchableOpacity>

                          {table.status === 'billed' ? (
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.actionBtnHalf, styles.btnSettle]}
                              onPress={() => {
                                settleBill(table.id);
                                broadcastImmediately();
                              }}
                            >
                              <MaterialCommunityIcons name="cash-check" size={14} color="#FFF" />
                              <Text style={styles.btnSettleText}>Clear Table</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.actionBtnHalf, styles.btnAddOn]}
                              onPress={() => router.push({ pathname: '/floor-manager/pos' as any, params: { tableId: table.id } })}
                            >
                              <MaterialCommunityIcons name="plus-circle-outline" size={14} color="#0F766E" />
                              <Text style={styles.btnAddOnText}>+ Add-On</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Row 2: Move Table & View Items */}
                        <View style={styles.actionBtnRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnHalf, styles.btnTransfer]}
                            onPress={() => {
                              setTransferModalTable(table);
                              setSelectedTargetTableId('');
                            }}
                          >
                            <MaterialCommunityIcons name="swap-horizontal" size={14} color="#854D0E" />
                            <Text style={styles.btnTransferText}>Move</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnHalf, styles.btnDetails]}
                            onPress={() => setDetailsModalTable(table)}
                          >
                            <MaterialCommunityIcons name="eye-outline" size={14} color="#334155" />
                            <Text style={styles.btnDetailsText}>Items</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : activeView === 'kds' ? (
        /* ========================================================
           6B. LIVE FLOOR KDS & COOKING MONITOR VIEW
           ======================================================== */
        <ScrollView contentContainerStyle={[styles.tablesScroll, isMobile && { paddingHorizontal: 12, paddingBottom: 60 }]}>
          {displayedKdsTickets.length === 0 ? (
            <View style={styles.kdsEmptyBox}>
              <MaterialCommunityIcons name="chef-hat" size={54} color="#4B5563" style={{ marginBottom: 10 }} />
              <Text style={styles.kdsEmptyTitle}>ALL CLEAR ON {selectedFloor.toUpperCase()}</Text>
              <Text style={styles.kdsEmptySubtitle}>
                There are currently no active cooking or pending orders for tables on this floor.
              </Text>
              <TouchableOpacity
                style={styles.kdsEmptyBtn}
                onPress={() => router.push('/floor-manager/pos' as any)}
              >
                <MaterialCommunityIcons name="plus-circle" size={16} color="#FFF" />
                <Text style={styles.kdsEmptyBtnText}>Punch New Order via POS</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.kdsGrid, isMobile && { gap: 10 }]}>
              {displayedKdsTickets.map((ticket) => {
                const matchedTable =
                  floorTableMap.get(ticket.tableId) ||
                  (ticket.tableName ? floorTableMap.get(ticket.tableName.trim().toLowerCase()) : undefined);

                const isReady =
                  ticket.status === 'ready' ||
                  (ticket.items && ticket.items.some((i) => i.itemStatus === 'ready'));
                const isCooking =
                  ticket.status === 'cooking' ||
                  (ticket.items && ticket.items.some((i) => i.itemStatus === 'cooking'));

                const elapsedMins = ticket.timePlaced
                  ? Math.max(1, Math.round((Date.now() - ticket.timePlaced) / 60000))
                  : 1;

                const stationLabel = ticket.items?.some((i) => i.station === 'juice') ? 'Juice Bar' : 'Main Kitchen';

                return (
                  <View
                    key={ticket.id}
                    style={[
                      styles.kdsTicketCard,
                      { width: kdsCardWidth, maxWidth: '100%' },
                      isReady && styles.kdsTicketCardReady,
                      isCooking && !isReady && styles.kdsTicketCardCooking,
                    ]}
                  >
                    {/* Ticket Card Header */}
                    <View style={styles.kdsTicketHeader}>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.kdsTableName}>
                            {ticket.tableName || matchedTable?.name || `Table ${ticket.tableId}`}
                          </Text>
                          {ticket.isAddOn && (
                            <View style={styles.addonTag}>
                              <Text style={styles.addonTagText}>ROUND #{ticket.roundNumber || 2}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.kdsServerText}>
                          Waiter: {ticket.server || 'Floor Staff'} • KOT #{ticket.id.slice(-6).toUpperCase()}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.kdsStatusPill,
                          isReady
                            ? styles.kdsPillReady
                            : isCooking
                            ? styles.kdsPillCooking
                            : styles.kdsPillPending,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={isReady ? 'bell-ring' : isCooking ? 'fire' : 'clock-outline'}
                          size={13}
                          color="#FFF"
                        />
                        <Text style={styles.kdsStatusPillText}>
                          {isReady ? 'READY AT PASS' : isCooking ? 'COOKING' : 'IN QUEUE'}
                        </Text>
                      </View>
                    </View>

                    {/* Elapsed & Station Subbar */}
                    <View style={styles.kdsSubBar}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="timer-outline" size={13} color="#D4AF37" />
                        <Text style={styles.kdsSubBarText}>Placed {elapsedMins}m ago</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons
                          name={stationLabel === 'Juice Bar' ? 'cup-water' : 'silverware-fork-knife'}
                          size={13}
                          color="#0D9488"
                        />
                        <Text style={[styles.kdsSubBarText, { color: '#0D9488' }]}>{stationLabel}</Text>
                      </View>
                    </View>

                    {/* Dish Items List */}
                    <View style={styles.kdsItemsList}>
                      {(ticket.items || []).map((item, idx) => {
                        const itemReady = item.itemStatus === 'ready';
                        const itemCooking = item.itemStatus === 'cooking' || (!item.itemStatus && isCooking);

                        return (
                          <View key={idx} style={styles.kdsItemRow}>
                            <View style={styles.kdsItemLeft}>
                              <Text style={styles.kdsItemQty}>{item.qty}x</Text>
                              <View>
                                <Text style={styles.kdsItemName}>{item.name}</Text>
                                {!!item.notes && (
                                  <Text style={styles.kdsItemNotes}>Note: {item.notes}</Text>
                                )}
                              </View>
                            </View>

                            <View
                              style={[
                                styles.kdsItemStatusTag,
                                itemReady
                                  ? styles.itemTagReady
                                  : itemCooking
                                  ? styles.itemTagCooking
                                  : styles.itemTagQueue,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.kdsItemStatusText,
                                  itemReady
                                    ? styles.itemTextReady
                                    : itemCooking
                                    ? styles.itemTextCooking
                                    : styles.itemTextQueue,
                                ]}
                              >
                                {itemReady ? '🔔 READY' : itemCooking ? '🔥 COOKING' : '⏳ QUEUED'}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {/* Ticket Action Buttons */}
                    <View style={styles.kdsTicketActions}>
                      {isReady && (
                        <TouchableOpacity
                          style={styles.kdsActionBtnServe}
                          onPress={() => serveTableTickets(ticket.tableId)}
                        >
                          <MaterialCommunityIcons name="check-all" size={15} color="#FFF" />
                          <Text style={styles.kdsActionBtnServeText}>Serve Food to Table</Text>
                        </TouchableOpacity>
                      )}

                      {matchedTable && (
                        <TouchableOpacity
                          style={styles.kdsActionBtnBill}
                          onPress={() => handlePrintTableUnpaidBill(matchedTable)}
                        >
                          <MaterialCommunityIcons name="printer-outline" size={14} color="#EF4444" />
                          <Text style={styles.kdsActionBtnBillText}>Print Unpaid Bill</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.kdsActionBtnPos}
                        onPress={() =>
                          router.push({
                            pathname: '/floor-manager/pos' as any,
                            params: { tableId: ticket.tableId },
                          })
                        }
                      >
                        <MaterialCommunityIcons name="plus" size={14} color="#854D0E" />
                        <Text style={styles.kdsActionBtnPosText}>Add Items</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        /* ========================================================
           6C. FLOOR BEVERAGES & CHILLER MONITOR VIEW
           ======================================================== */
        <ScrollView contentContainerStyle={[styles.tablesScroll, isMobile && { paddingHorizontal: 12, paddingBottom: 60 }]}>
          {/* Chiller Summary / Status Header */}
          <View
            style={{
              backgroundColor: '#0369A1',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: 12,
            }}
          >
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="snowflake" size={24} color="#BAE6FD" />
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>
                  {selectedFloor.toUpperCase()} BEVERAGE CHILLER
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: '#E0F2FE', marginTop: 4 }}>
                Live cold drinks & water bottles stock for this floor • Auto-deducts when waiters place beverage orders
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#BAE6FD' }}>TOTAL IN CHILLER</Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFFFF' }}>{chillerStats.totalCans}</Text>
              </View>
              <View style={{ backgroundColor: chillerStats.lowCount > 0 ? '#DC2626' : 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#BAE6FD' }}>LOW STOCK ITEMS</Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFFFFF' }}>{chillerStats.lowCount}</Text>
              </View>
            </View>
          </View>

          {/* Active Orders with Beverages Queue for This Floor */}
          {floorActiveBeverageOrders.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <MaterialCommunityIcons name="clock-fast" size={18} color="#0284C7" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: 0.3 }}>
                  ACTIVE BEVERAGE ORDERS TO DISPENSE ({floorActiveBeverageOrders.length})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {floorActiveBeverageOrders.map((ord) => (
                  <View
                    key={ord.ticketId}
                    style={{
                      backgroundColor: '#F0F9FF',
                      borderWidth: 1.5,
                      borderColor: '#38BDF8',
                      borderRadius: 10,
                      padding: 12,
                      minWidth: isMobile ? '100%' : 260,
                      flex: 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: '#0369A1' }}>
                        Table {ord.tableName}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        Waiter: {ord.server || 'Staff'}
                      </Text>
                    </View>
                    <View style={{ gap: 4 }}>
                      {ord.items.map((it, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                            {it.qty}x {it.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#0284C7', fontWeight: '800' }}>
                            🧊 Serve Cold
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Beverages Inventory Cards */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
              CHILLER BEVERAGE INVENTORY ({floorBeverages.length} Items)
            </Text>
            <Text style={{ fontSize: 11, color: '#64748B' }}>
              Tap "Audit / Adjust" to reconcile physical bottles
            </Text>
          </View>

          {floorBeverages.length === 0 ? (
            <View style={styles.kdsEmptyBox}>
              <MaterialCommunityIcons name="snowflake-off" size={48} color="#94A3B8" style={{ marginBottom: 10 }} />
              <Text style={styles.kdsEmptyTitle}>NO BEVERAGES CONFIGURED</Text>
              <Text style={styles.kdsEmptySubtitle}>
                Add beverage items in the main Inventory module and hand them over to {selectedFloor} chiller.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {floorBeverages.map((bev) => {
                const floorCount = Number(bev.chillerStock?.[selectedFloor] || 0);
                const isLow = floorCount <= (bev.chillerThreshold || 5);
                const storeStock = Number(bev.stock || 0);

                return (
                  <View
                    key={bev.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: isLow ? '#FCA5A5' : '#E2E8F0',
                      padding: 14,
                      width: isMobile ? '100%' : '31.5%',
                      minWidth: 260,
                      shadowColor: '#0F172A',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 3,
                      elevation: 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>
                          {bev.name}
                        </Text>
                        {bev.urduName && (
                          <Text style={{ fontSize: 13, color: '#64748B', fontFamily: Platform.OS === 'android' ? 'serif' : undefined }}>
                            {bev.urduName}
                          </Text>
                        )}
                        <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                          Unit: {bev.unit || 'Can/Bottle'} • Category: {bev.category}
                        </Text>
                      </View>

                      <View
                        style={{
                          backgroundColor: isLow ? '#FEE2E2' : '#F0FDF4',
                          borderWidth: 1,
                          borderColor: isLow ? '#EF4444' : '#10B981',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '800', color: isLow ? '#DC2626' : '#059669' }}>
                          {isLow ? '⚠️ LOW STOCK' : '✓ OK'}
                        </Text>
                      </View>
                    </View>

                    {/* Stock Numbers */}
                    <View
                      style={{
                        flexDirection: 'row',
                        backgroundColor: '#F8FAFC',
                        borderRadius: 8,
                        padding: 10,
                        marginVertical: 12,
                        justifyContent: 'space-between',
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>THIS CHILLER</Text>
                        <Text style={{ fontSize: 22, fontWeight: '900', color: isLow ? '#DC2626' : '#0284C7' }}>
                          {floorCount}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>STORE TOTAL</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#334155' }}>
                          {storeStock} {bev.unit || 'pcs'}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                          Min Alert: {bev.chillerThreshold || 5}
                        </Text>
                      </View>
                    </View>

                    {/* Audit / Adjust Button */}
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#F0F9FF',
                        borderWidth: 1,
                        borderColor: '#0284C7',
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                      onPress={() => {
                        setChillerAdjustItem(bev);
                        setChillerAdjustStockVal(String(floorCount));
                        setChillerAdjustReason('Physical Stock Count');
                      }}
                    >
                      <MaterialCommunityIcons name="clipboard-check-outline" size={15} color="#0284C7" />
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#0369A1' }}>
                        Audit / Physical Count
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Recent Handovers Received For This Floor */}
          <View style={{ marginTop: 24, marginBottom: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <MaterialCommunityIcons name="history" size={18} color="#64748B" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                RECENT HANDOVERS RECEIVED ON {selectedFloor.toUpperCase()}
              </Text>
            </View>

            {(() => {
              const floorHandovers = chillerHandovers
                .filter((h) => (h.toFloor || '').toLowerCase() === selectedFloor.toLowerCase())
                .slice(0, 8);

              if (floorHandovers.length === 0) {
                return (
                  <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>No handovers recorded yet for {selectedFloor}.</Text>
                  </View>
                );
              }

              return (
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}>
                  {floorHandovers.map((h, idx) => (
                    <View
                      key={h.id || idx}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderBottomWidth: idx < floorHandovers.length - 1 ? 1 : 0,
                        borderBottomColor: '#F1F5F9',
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                          +{h.qty} {h.itemName}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>
                          From: {h.fromLocation || 'Main Store'} • By: {h.handedOverBy || 'Store Manager'}
                          {h.receivedByFloorManager ? ` • Received: ${h.receivedByFloorManager}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                          {new Date(h.at).toLocaleDateString()} {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        {h.notes ? <Text style={{ fontSize: 10.5, color: '#64748B', fontStyle: 'italic' }}>{h.notes}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>
        </ScrollView>
      )}

      {/* 7. MODAL: REASSIGN WAITER */}
      {!!reassignModalTable && (
        <Modal transparent animationType="fade" visible={!!reassignModalTable} onRequestClose={() => setReassignModalTable(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: isMobile ? Math.min(width - 24, 440) : 440 }]}>
              <Text style={styles.modalTitle}>REASSIGN WAITER — {reassignModalTable.name}</Text>
              <Text style={styles.modalSubtitle}>Select which floor waiter will manage this table</Text>

              <ScrollView style={{ maxHeight: Math.min(height * 0.45, 260), marginBottom: 16 }} showsVerticalScrollIndicator={false}>
                <View style={styles.modalList}>
                  {floorWaiters.map((w) => {
                    const isSelected = selectedWaiterName === w.name;
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[styles.modalItem, isSelected && styles.modalItemActive]}
                        onPress={() => setSelectedWaiterName(w.name)}
                      >
                        <MaterialCommunityIcons
                          name="account"
                          size={20}
                          color={isSelected ? '#0D9488' : '#9CA3AF'}
                        />
                        <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                          {w.name} ({w.designation || 'Waiter'})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setReassignModalTable(null)}>
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnSave} onPress={handleReassign}>
                  <Text style={styles.modalBtnSaveText}>Update Waiter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 8. MODAL: TRANSFER TABLE */}
      {!!transferModalTable && (
        <Modal transparent animationType="fade" visible={!!transferModalTable} onRequestClose={() => setTransferModalTable(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: isMobile ? Math.min(width - 24, 440) : 440 }]}>
              <Text style={styles.modalTitle}>TRANSFER GUESTS — {transferModalTable.name}</Text>
              <Text style={styles.modalSubtitle}>Select available target table on {selectedFloor}</Text>

              <ScrollView style={{ maxHeight: Math.min(height * 0.45, 240), marginBottom: 16 }} showsVerticalScrollIndicator={false}>
                {floorTables
                  .filter((t) => t.id !== transferModalTable.id && t.status === 'available')
                  .map((t) => {
                    const isSelected = selectedTargetTableId === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.modalItem, isSelected && styles.modalItemActive]}
                        onPress={() => setSelectedTargetTableId(t.id)}
                      >
                        <MaterialCommunityIcons
                          name="table-furniture"
                          size={20}
                          color={isSelected ? '#D4AF37' : '#9CA3AF'}
                        />
                        <Text style={[styles.modalItemText, isSelected && styles.modalItemTextActive]}>
                          {t.name} ({t.seatingType?.toUpperCase() || 'TABLE'}, {t.seats || 4} Seats)
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setTransferModalTable(null)}>
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnSave, !selectedTargetTableId && { opacity: 0.5 }]}
                  disabled={!selectedTargetTableId}
                  onPress={handleTransfer}
                >
                  <Text style={styles.modalBtnSaveText}>Confirm Transfer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 9. MODAL: VIEW ACTIVE ROUND ITEMS & PRINT UNPAID BILL */}
      {!!detailsModalTable && (
        <Modal transparent animationType="fade" visible={!!detailsModalTable} onRequestClose={() => setDetailsModalTable(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: isMobile ? Math.min(width - 24, 560) : 560, maxHeight: height - 40 }]}>
              <Text style={styles.modalTitle}>{detailsModalTable.name} — ACTIVE ROUND ORDERS</Text>
              <Text style={styles.modalSubtitle}>Server: {detailsModalTable.server || 'None'} • Floor: {selectedFloor}</Text>

              <ScrollView style={{ maxHeight: Math.min(height * 0.45, 280), marginVertical: 12 }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const modalIdStr = String(detailsModalTable.id).trim().toLowerCase();
                  const modalNameStr = detailsModalTable.name?.trim().toLowerCase();
                  const modalTickets = tickets.filter(
                    (tk) =>
                      String(tk.tableId).trim().toLowerCase() === modalIdStr ||
                      (tk.tableName && tk.tableName.trim().toLowerCase() === modalNameStr)
                  );

                  if (modalTickets.length > 0) {
                    return modalTickets.map((tk) => (
                      <View key={tk.id} style={styles.ticketBox}>
                        <View style={styles.ticketHeader}>
                          <Text style={styles.ticketNumber}>KOT #{tk.id.slice(-6).toUpperCase()}</Text>
                          <Text style={styles.ticketStatus}>Status: {tk.status.toUpperCase()}</Text>
                        </View>
                        {tk.items.map((it, idx) => (
                          <View key={idx} style={styles.ticketItemRow}>
                            <Text style={styles.ticketItemQty}>{it.qty}x</Text>
                            <Text style={styles.ticketItemName}>{it.name}</Text>
                            <Text style={styles.ticketItemPrice}>Rs. {((Number(it.price) || 0) * (Number(it.qty) || 1)).toLocaleString()}</Text>
                          </View>
                        ))}
                      </View>
                    ));
                  }

                  if (detailsModalTable.orders && detailsModalTable.orders.length > 0) {
                    return (
                      <View style={styles.ticketBox}>
                        <View style={styles.ticketHeader}>
                          <Text style={styles.ticketNumber}>ACTIVE TABLE ITEMS</Text>
                          <Text style={styles.ticketStatus}>Status: ORDERED</Text>
                        </View>
                        {detailsModalTable.orders.map((it, idx) => (
                          <View key={idx} style={styles.ticketItemRow}>
                            <Text style={styles.ticketItemQty}>{it.qty}x</Text>
                            <Text style={styles.ticketItemName}>{it.name}</Text>
                            <Text style={styles.ticketItemPrice}>Rs. {((Number(it.price) || 0) * (Number(it.qty) || 1)).toLocaleString()}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  }

                  return (
                    <Text style={{ color: '#9CA3AF', textAlign: 'center', padding: 20 }}>
                      No active items recorded for this table.
                    </Text>
                  );
                })()}
              </ScrollView>

              <View style={styles.modalDetailsFooter}>
                <TouchableOpacity
                  style={styles.modalBtnPrintUnpaid}
                  onPress={() => {
                    handlePrintTableUnpaidBill(detailsModalTable);
                    setDetailsModalTable(null);
                  }}
                >
                  <MaterialCommunityIcons name="printer-outline" size={17} color="#FFF" />
                  <Text style={styles.modalBtnPrintUnpaidText}>Print Unpaid Bill (غیر ادا شدہ بل)</Text>
                </TouchableOpacity>

                <View style={styles.modalSubActionsRow}>
                  <TouchableOpacity
                    style={styles.modalBtnPos}
                    onPress={() => {
                      const tid = detailsModalTable.id;
                      setDetailsModalTable(null);
                      router.push({ pathname: '/floor-manager/pos' as any, params: { tableId: tid } });
                    }}
                  >
                    <MaterialCommunityIcons name="plus-circle" size={16} color="#0F766E" />
                    <Text style={styles.modalBtnPosText}>+ Add Items</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalBtnClose}
                    onPress={() => setDetailsModalTable(null)}
                  >
                    <Text style={styles.modalBtnCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 10. URGENT POPUP MODAL: NEW DIGITAL MENU ORDER PENDING CONFIRMATION */}
      {pendingFloorOrders.length > 0 && (
        <Modal transparent animationType="fade" visible={pendingFloorOrders.length > 0}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: isMobile ? Math.min(width - 24, 500) : 500, borderColor: '#EF4444', borderWidth: 2, maxHeight: height - 40 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MaterialCommunityIcons name="bell-ring" size={24} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: '#EF4444', fontSize: isSmallMobile ? 14 : 16 }]}>
                    🚨 NEW DIGITAL MENU ORDER
                  </Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>Requires Confirmation to Dispatch KOT</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: isSmallMobile ? 16 : 18, fontWeight: '800', color: '#B45309' }}>
                    {pendingFloorOrders[0].tableName || pendingFloorOrders[0].tableId}
                  </Text>
                  <Text style={{ fontSize: isSmallMobile ? 13 : 14, fontWeight: '700', color: '#059669' }}>
                    Rs. {Number(pendingFloorOrders[0].total || 0).toLocaleString()}
                  </Text>
                </View>
                <Text style={{ color: '#334155', fontSize: 13, marginBottom: 4 }} numberOfLines={1}>
                  Customer: <Text style={{ fontWeight: '700' }}>{pendingFloorOrders[0].customer?.name || 'Guest'}</Text>
                  {pendingFloorOrders[0].customer?.phone ? ` • ${pendingFloorOrders[0].customer.phone}` : ''}
                </Text>
                <Text style={{ color: '#64748B', fontSize: 11 }} numberOfLines={1}>
                  Floor: {selectedFloor} • Placed {new Date(pendingFloorOrders[0].createdAt || Date.now()).toLocaleTimeString()}
                </Text>
              </View>

              <ScrollView style={{ maxHeight: Math.min(height * 0.35, 180), marginBottom: 14 }} showsVerticalScrollIndicator={false}>
                {pendingFloorOrders[0].items?.map((it, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                    <Text style={{ color: '#0F172A', fontSize: 13, flex: 1 }} numberOfLines={1}>
                      {it.qty || 1}x {it.name}
                    </Text>
                    <Text style={{ color: '#B45309', fontSize: 13, fontWeight: '600' }}>
                      Rs. {(Number(it.price || 0) * Number(it.qty || 1)).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtnCancel, { flex: 1 }]}
                  onPress={() => rejectOnlineOrder(pendingFloorOrders[0].id, 'Declined by Floor Manager')}
                >
                  <Text style={styles.modalBtnCancelText}>✕ Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnSave, { flex: 2, backgroundColor: '#059669' }]}
                  onPress={() => confirmOnlineOrder(pendingFloorOrders[0].id, floorWaiters[0]?.name || user?.name || 'Floor Manager')}
                >
                  <Text style={[styles.modalBtnSaveText, { fontWeight: '800' }]}>✓ Confirm KOT</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 11. MODAL: CHILLER STOCK AUDIT / RECONCILIATION */}
      {!!chillerAdjustItem && (
        <Modal transparent animationType="fade" visible={!!chillerAdjustItem} onRequestClose={() => setChillerAdjustItem(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: isMobile ? Math.min(width - 24, 460) : 460 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <MaterialCommunityIcons name="snowflake" size={22} color="#0284C7" />
                <Text style={styles.modalTitle}>
                  AUDIT {selectedFloor.toUpperCase()} CHILLER
                </Text>
              </View>
              <Text style={styles.modalSubtitle}>
                Physical count reconciliation for {chillerAdjustItem.name}
              </Text>

              <View style={{ backgroundColor: '#F0F9FF', borderRadius: 8, padding: 12, marginVertical: 12 }}>
                <Text style={{ fontSize: 12, color: '#0369A1' }}>
                  Current System Count on {selectedFloor}:{' '}
                  <Text style={{ fontWeight: '900', fontSize: 14 }}>
                    {Number(chillerAdjustItem.chillerStock?.[selectedFloor] || 0)} {chillerAdjustItem.unit || 'pcs'}
                  </Text>
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                  Actual Physical Count in Chiller:
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: '#0284C7',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 16,
                    fontWeight: '800',
                    color: '#0F172A',
                  }}
                  keyboardType="numeric"
                  value={chillerAdjustStockVal}
                  onChangeText={setChillerAdjustStockVal}
                  placeholder="Enter count (e.g. 18)"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                  Audit Reason / Notes:
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: 13,
                    color: '#0F172A',
                  }}
                  value={chillerAdjustReason}
                  onChangeText={setChillerAdjustReason}
                  placeholder="e.g. Daily shift audit, broken bottle, recount"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setChillerAdjustItem(null)}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnSave, { backgroundColor: '#0284C7' }]}
                  onPress={handleSaveChillerAdjust}
                >
                  <Text style={styles.modalBtnSaveText}>Save Audit Count</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerMobile: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  floorBadgeIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F0FDFA',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  livePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 12,
    gap: 4,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFF',
  },
  liveText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 11.5,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRightMobile: {
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
    width: '100%',
    marginTop: 2,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 6,
  },
  navBtnCompact: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    gap: 4,
  },
  navBtnPos: {
    backgroundColor: '#FEF9C3',
    borderColor: '#EAB308',
  },
  logoutBtn: {
    borderColor: '#FECACA',
    backgroundColor: '#FEE2E2',
  },
  navBtnActiveFullscreen: {
    borderColor: '#0D9488',
    backgroundColor: '#F0FDFA',
  },
  navBtnText: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '700',
  },
  floorTabBarScroll: {
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  floorTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  floorTabLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  floorTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 5,
  },
  floorTabActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0F766E',
  },
  floorTabText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '600',
  },
  floorTabTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  urgentQueueBox: {
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 2,
    borderBottomColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  urgentQueueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  urgentQueueTitle: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  urgentQueueScroll: {
    gap: 12,
    paddingBottom: 4,
  },
  urgentOrderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    padding: 12,
    width: 280,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  urgentOrderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  urgentOrderTable: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  urgentOrderTotal: {
    color: '#059669',
    fontSize: 14,
    fontWeight: '900',
  },
  urgentCustomer: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 4,
  },
  urgentItems: {
    color: '#B45309',
    fontSize: 11,
    marginBottom: 8,
    lineHeight: 14,
  },
  urgentCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  urgentBtnReject: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  urgentBtnRejectText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  urgentBtnConfirm: {
    flex: 2,
    backgroundColor: '#10B981',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  urgentBtnConfirmText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  kpiSub: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 14,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 13,
  },
  filterPillsScroll: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingVertical: 2,
  },
  filterPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0F766E',
  },
  filterPillText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  filterBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  filterBadgeActiveKds: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  filterBadgeText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
  },
  filterBadgeTextActive: {
    color: '#FFF',
    fontWeight: '900',
  },
  tablesScroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  tablesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    paddingTop: 16,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
    justifyContent: 'space-between',
    minHeight: 200,
  },
  cardTopIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  tableCardOccupied: {
    borderColor: '#F87171',
    backgroundColor: '#FFFDFD',
  },
  tableCardFoodReady: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFDF5',
  },
  tableCardBilled: {
    borderColor: '#60A5FA',
    backgroundColor: '#F8FAFF',
  },
  tableCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tableName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  seatingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  seatingText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tableCardBody: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 10,
    marginBottom: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  detailVal: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '700',
  },
  billTotalVal: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '900',
  },
  waiterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
    maxWidth: '58%',
    flexShrink: 1,
  },
  waiterChipText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  tableActions: {
    width: '100%',
    marginTop: 4,
  },
  occupiedActionsCol: {
    width: '100%',
    gap: 6,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  actionBtnHalf: {
    flex: 1,
    minWidth: 0,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  btnPunchOrder: {
    flex: 1,
    backgroundColor: '#0D9488',
  },
  btnPunchText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  btnServe: {
    backgroundColor: '#D97706',
    flex: 1,
  },
  btnServeFull: {
    backgroundColor: '#059669',
    width: '100%',
    paddingVertical: 7,
    borderRadius: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  btnServeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  btnTransfer: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  btnTransferText: {
    color: '#854D0E',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDetails: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnDetailsText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  btnSettle: {
    backgroundColor: '#2563EB',
    flex: 1,
  },
  btnSettleText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  btnAddOn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#0D9488',
  },
  btnAddOnText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 16,
  },
  modalList: {
    gap: 8,
    marginBottom: 18,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  modalItemActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  modalItemText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  modalItemTextActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBtnSave: {
    flex: 2,
    backgroundColor: '#0D9488',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnSaveText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  ticketBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 6,
    marginBottom: 6,
  },
  ticketNumber: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
  },
  ticketStatus: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  ticketItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  ticketItemQty: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
    width: 28,
  },
  ticketItemName: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  ticketItemPrice: {
    color: '#64748B',
    fontSize: 12,
  },

  /* VIEW SWITCHER TABS */
  viewSwitcherBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  viewTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  viewTabActiveTables: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  viewTabActiveKds: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  viewTabText: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '700',
  },
  viewTabTextActiveTables: {
    color: '#0F766E',
    fontWeight: '900',
  },
  viewTabTextActiveKds: {
    color: '#B45309',
    fontWeight: '900',
  },
  kdsLiveBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  kdsBadgeCooking: {
    backgroundColor: '#D97706',
  },
  kdsBadgeReady: {
    backgroundColor: '#10B981',
  },
  kdsBadgeText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  filterPillActiveKds: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
  },

  /* TABLE CARD KDS SNIPPET */
  cardKdsSnippetBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  snippetPillReady: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  snippetPillReadyText: {
    color: '#065F46',
    fontSize: 10,
    fontWeight: '800',
  },
  snippetPillCooking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  snippetPillCookingText: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '800',
  },

  /* BUTTONS */
  btnPrintBill: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  btnPrintBillText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
  },

  /* KDS GRID & TICKETS */
  kdsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  kdsTicketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  kdsTicketCardCooking: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFDF5',
  },
  kdsTicketCardReady: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  kdsTicketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  kdsTableName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  addonTag: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#EAB308',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  addonTagText: {
    color: '#854D0E',
    fontSize: 9,
    fontWeight: '800',
  },
  kdsServerText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  kdsStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  kdsPillCooking: {
    backgroundColor: '#D97706',
  },
  kdsPillReady: {
    backgroundColor: '#059669',
  },
  kdsPillPending: {
    backgroundColor: '#64748B',
  },
  kdsStatusPillText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  kdsSubBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  kdsSubBarText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  kdsItemsList: {
    gap: 6,
    marginBottom: 10,
  },
  kdsItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  kdsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  kdsItemQty: {
    color: '#B45309',
    fontSize: 13,
    fontWeight: '900',
    width: 24,
  },
  kdsItemName: {
    color: '#1E293B',
    fontSize: 12.5,
    fontWeight: '700',
  },
  kdsItemNotes: {
    color: '#D97706',
    fontSize: 10,
    fontStyle: 'italic',
  },
  kdsItemStatusTag: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  itemTagCooking: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  itemTagReady: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  itemTagQueue: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  kdsItemStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  itemTextCooking: {
    color: '#92400E',
  },
  itemTextReady: {
    color: '#065F46',
  },
  itemTextQueue: {
    color: '#475569',
  },
  kdsTicketActions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  kdsActionBtnServe: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  kdsActionBtnServeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  kdsActionBtnBill: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  kdsActionBtnBillText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
  },
  kdsActionBtnPos: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#EAB308',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  kdsActionBtnPosText: {
    color: '#854D0E',
    fontSize: 11,
    fontWeight: '700',
  },
  kdsEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  kdsEmptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  kdsEmptySubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 320,
  },
  kdsEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 18,
    gap: 6,
  },
  kdsEmptyBtnText: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  /* MODAL BUTTONS */
  modalDetailsFooter: {
    gap: 10,
    marginTop: 6,
    width: '100%',
  },
  modalBtnPrintUnpaid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  modalBtnPrintUnpaidText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalSubActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  modalBtnPos: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
  },
  modalBtnPosText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '800',
  },
  modalBtnClose: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCloseText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
});
