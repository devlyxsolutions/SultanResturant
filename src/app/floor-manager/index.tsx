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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useRestaurantStore, Table, Ticket, OnlineOrder, OrderItem, Invoice } from '../../store/restaurantStore';
import { printInvoiceReceipt } from '../../components/Invoice';
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

  // View Mode: 'tables' (Floor tables & seating) or 'kds' (Live Kitchen & Juice cooking)
  const [activeView, setActiveView] = useState<'tables' | 'kds'>('tables');
  const [kdsFilter, setKdsFilter] = useState<'all' | 'cooking' | 'ready' | 'pending'>('all');

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
    setReassignModalTable(null);
    setSelectedWaiterName('');
  };

  // Quick Table Transfer Action
  const handleTransfer = () => {
    if (!transferModalTable || !selectedTargetTableId) return;
    transferTable(transferModalTable.id, selectedTargetTableId);
    setTransferModalTable(null);
    setSelectedTargetTableId('');
  };

  return (
    <View style={styles.container}>
      {/* 1. TOP HEADER BAR */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.floorBadgeIcon}>
            <MaterialCommunityIcons name="layers-triple" size={24} color="#0D9488" />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.headerTitle}>{selectedFloor.toUpperCase()} CONSOLE</Text>
              <View style={styles.livePulse}>
                <View style={styles.pulseDot} />
                <Text style={styles.liveText}>LIVE OPS</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              Floor Manager: <Text style={{ color: '#D4AF37', fontWeight: '700' }}>{user?.name || 'Manager'}</Text> • Sultan Royal Operations
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Toggle Full Screen Button */}
          <TouchableOpacity
            style={[styles.navBtn, isFullscreen && styles.navBtnActiveFullscreen]}
            onPress={toggleFullscreen}
          >
            <MaterialCommunityIcons
              name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
              size={18}
              color={isFullscreen ? '#10B981' : '#38BDF8'}
            />
            <Text style={[styles.navBtnText, isFullscreen && { color: '#10B981' }]}>
              {isFullscreen ? 'Exit Full' : 'Full Screen'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => router.push('/floor-manager/pos' as any)}
          >
            <MaterialCommunityIcons name="point-of-sale" size={18} color="#D4AF37" />
            <Text style={styles.navBtnText}>Open POS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, activeView === 'kds' && { borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}
            onPress={() => setActiveView(activeView === 'kds' ? 'tables' : 'kds')}
          >
            <MaterialCommunityIcons name="chef-hat" size={18} color={activeView === 'kds' ? '#F59E0B' : '#10B981'} />
            <Text style={[styles.navBtnText, activeView === 'kds' && { color: '#F59E0B' }]}>
              {activeView === 'kds' ? 'View Tables' : 'Floor KDS'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, styles.logoutBtn]}
            onPress={logout}
          >
            <MaterialCommunityIcons name="logout" size={18} color="#EF4444" />
            <Text style={[styles.navBtnText, { color: '#EF4444' }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. FLOOR SELECTOR TABS (Available to Admins & Multi-Zone Managers) */}
      {canSwitchFloors && (
        <View style={styles.floorTabBar}>
          <Text style={styles.floorTabLabel}>SWITCH FLOOR:</Text>
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
                  size={16}
                  color={isCurrent ? '#FFF' : '#9CA3AF'}
                />
                <Text style={[styles.floorTabText, isCurrent && styles.floorTabTextActive]}>
                  {fName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 2B. PRIMARY CONSOLE VIEW SWITCHER (Floor Tables vs Live KDS) */}
      <View style={styles.viewSwitcherBar}>
        <TouchableOpacity
          style={[styles.viewTab, activeView === 'tables' && styles.viewTabActiveTables]}
          onPress={() => setActiveView('tables')}
        >
          <MaterialCommunityIcons
            name="table-furniture"
            size={18}
            color={activeView === 'tables' ? '#0D9488' : '#9CA3AF'}
          />
          <Text style={[styles.viewTabText, activeView === 'tables' && styles.viewTabTextActiveTables]}>
            Floor Tables Blueprint ({floorTables.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewTab, activeView === 'kds' && styles.viewTabActiveKds]}
          onPress={() => setActiveView('kds')}
        >
          <MaterialCommunityIcons
            name="chef-hat"
            size={18}
            color={activeView === 'kds' ? '#F59E0B' : '#9CA3AF'}
          />
          <Text style={[styles.viewTabText, activeView === 'kds' && styles.viewTabTextActiveKds]}>
            Live Floor KDS & Cooking ({floorTickets.length})
          </Text>
          {(kdsMetrics.cookingCount > 0 || kdsMetrics.readyCount > 0) && (
            <View style={[styles.kdsLiveBadge, kdsMetrics.readyCount > 0 ? styles.kdsBadgeReady : styles.kdsBadgeCooking]}>
              <Text style={styles.kdsBadgeText}>
                {kdsMetrics.readyCount > 0 ? `🔔 ${kdsMetrics.readyCount} READY` : `🔥 ${kdsMetrics.cookingCount} COOKING`}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 3. URGENT PENDING DIGITAL MENU ORDERS QUEUE */}
      {pendingFloorOrders.length > 0 && (
        <View style={styles.urgentQueueBox}>
          <View style={styles.urgentQueueHeader}>
            <MaterialCommunityIcons name="bell-ring" size={20} color="#DC2626" />
            <Text style={styles.urgentQueueTitle}>
              {pendingFloorOrders.length} PENDING DIGITAL MENU ORDER{pendingFloorOrders.length > 1 ? 'S' : ''} AWAITING CONFIRMATION
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.urgentQueueScroll}>
            {pendingFloorOrders.map((pOrder) => (
              <View key={pOrder.id} style={styles.urgentOrderCard}>
                <View style={styles.urgentOrderCardHeader}>
                  <Text style={styles.urgentOrderTable}>{pOrder.tableName || pOrder.tableId}</Text>
                  <Text style={styles.urgentOrderTotal}>Rs. {pOrder.total.toLocaleString()}</Text>
                </View>
                <Text style={styles.urgentCustomer}>
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
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>OCCUPANCY</Text>
          <Text style={[styles.kpiValue, { color: kpis.occupancyRate > 70 ? '#EF4444' : '#10B981' }]}>
            {kpis.occupancyRate}%
          </Text>
          <Text style={styles.kpiSub}>{kpis.occupied + kpis.billed}/{kpis.total} Tables In Use</Text>
        </View>

        <TouchableOpacity 
          style={[styles.kpiCard, activeView === 'kds' && { borderColor: '#F59E0B' }]}
          onPress={() => {
            setActiveView('kds');
            setKdsFilter('cooking');
          }}
        >
          <Text style={styles.kpiLabel}>KDS COOKING</Text>
          <Text style={[styles.kpiValue, { color: kdsMetrics.cookingCount > 0 ? '#F59E0B' : '#9CA3AF' }]}>
            {kdsMetrics.cookingCount}
          </Text>
          <Text style={styles.kpiSub}>{kdsMetrics.totalDishes} Dishes in Kitchen</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.kpiCard, activeView === 'kds' && { borderColor: '#10B981' }]}
          onPress={() => {
            setActiveView('kds');
            setKdsFilter('ready');
          }}
        >
          <Text style={styles.kpiLabel}>FOOD READY AT PASS</Text>
          <Text style={[styles.kpiValue, { color: kdsMetrics.readyCount > 0 ? '#10B981' : '#9CA3AF' }]}>
            {kdsMetrics.readyCount}
          </Text>
          <Text style={styles.kpiSub}>Urgent Pickup Needed</Text>
        </TouchableOpacity>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>BILLED / PAYING</Text>
          <Text style={[styles.kpiValue, { color: '#3B82F6' }]}>{kpis.billed}</Text>
          <Text style={styles.kpiSub}>Awaiting Settlement</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>AVAILABLE</Text>
          <Text style={[styles.kpiValue, { color: '#10B981' }]}>{kpis.available}</Text>
          <Text style={styles.kpiSub}>Ready for Seating</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>TODAY'S FLOOR SALES</Text>
          <Text style={[styles.kpiValue, { color: '#D4AF37' }]}>Rs. {kpis.floorSales.toLocaleString()}</Text>
          <Text style={styles.kpiSub}>Settled Invoices Today</Text>
        </View>
      </View>

      {/* 5. CONTROLS: SEARCH & VIEW-SPECIFIC FILTERS */}
      <View style={styles.controlsBar}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeView === 'kds'
                ? "Search cooking items, table, or waiter..."
                : "Search table, assigned waiter, or seating type..."
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
          <View style={styles.filterPills}>
            {(['all', 'occupied', 'ready', 'available', 'billed'] as const).map((filter) => {
              const isActive = statusFilter === filter;
              return (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setStatusFilter(filter)}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {filter === 'all' && `All (${kpis.total})`}
                    {filter === 'occupied' && `Occupied (${kpis.occupied})`}
                    {filter === 'ready' && `Food Ready (${kpis.readyCount})`}
                    {filter === 'available' && `Available (${kpis.available})`}
                    {filter === 'billed' && `Billed (${kpis.billed})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.filterPills}>
            {(['all', 'cooking', 'ready', 'pending'] as const).map((fKey) => {
              const isActive = kdsFilter === fKey;
              return (
                <TouchableOpacity
                  key={fKey}
                  style={[styles.filterPill, isActive && styles.filterPillActiveKds]}
                  onPress={() => setKdsFilter(fKey)}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {fKey === 'all' && `All Floor KOTs (${floorTickets.length})`}
                    {fKey === 'cooking' && `🔥 Cooking (${kdsMetrics.cookingCount})`}
                    {fKey === 'ready' && `🔔 Ready at Pass (${kdsMetrics.readyCount})`}
                    {fKey === 'pending' && `⏳ In Queue (${kdsMetrics.pendingCount})`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* 6. PRIMARY CONTENT AREA: TABLES BLUEPRINT OR LIVE FLOOR KDS */}
      {activeView === 'tables' ? (
        <ScrollView contentContainerStyle={styles.tablesScroll}>
          <View style={styles.tablesGrid}>
            {displayedTables.map((table) => {
              const tableIdStr = String(table.id).trim().toLowerCase();
              const tableNameStr = table.name.trim().toLowerCase();
              const tableAllTickets = tickets.filter(
                (tk) =>
                  String(tk.tableId).trim().toLowerCase() === tableIdStr ||
                  (tk.tableName && tk.tableName.trim().toLowerCase() === tableNameStr)
              );
              const unservedTickets = tableAllTickets.filter((tk) => tk.status !== 'served');
              const hasReadyFood = unservedTickets.some(
                (tk) => tk.status === 'ready' || (tk.items && tk.items.some((it) => it.itemStatus === 'ready'))
              );
              const allTableItems = tableAllTickets.flatMap((tk) => tk.items || []);
              const cookingItems = allTableItems.filter(
                (i) => i.itemStatus === 'cooking' || (!i.itemStatus && unservedTickets.some((tk) => tk.status === 'cooking'))
              );
              const readyItems = allTableItems.filter(
                (i) => i.itemStatus === 'ready' || (!i.itemStatus && unservedTickets.some((tk) => tk.status === 'ready'))
              );

              // Determine status badge color
              let statusBadge = { bg: '#10B981', label: 'AVAILABLE', text: '#FFF' };
              if (table.status === 'occupied') {
                statusBadge = hasReadyFood
                  ? { bg: '#D97706', label: 'FOOD READY', text: '#FFF' }
                  : { bg: '#DC2626', label: 'OCCUPIED', text: '#FFF' };
              } else if (table.status === 'billed') {
                statusBadge = { bg: '#2563EB', label: 'BILLED', text: '#FFF' };
              }

              return (
                <View
                  key={table.id}
                  style={[
                    styles.tableCard,
                    hasReadyFood && styles.tableCardFoodReady,
                    table.status === 'occupied' && !hasReadyFood && styles.tableCardOccupied,
                    table.status === 'billed' && styles.tableCardBilled,
                  ]}
                >
                  {/* Table Header */}
                  <View style={styles.tableCardHeader}>
                    <View>
                      <Text style={styles.tableName}>{table.name}</Text>
                      <View style={styles.seatingTag}>
                        <MaterialCommunityIcons
                          name={
                            table.seatingType === 'majlis'
                              ? 'sofa'
                              : table.seatingType === 'couches'
                              ? 'chair-rolling'
                              : 'table-furniture'
                          }
                          size={12}
                          color="#D4AF37"
                        />
                        <Text style={styles.seatingText}>
                          {table.seatingType?.toUpperCase() || 'DINING'} • {table.seats || 4} SEATS
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>
                        {statusBadge.label}
                      </Text>
                    </View>
                  </View>

                  {/* Table Body Info */}
                  <View style={styles.tableCardBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Assigned Waiter:</Text>
                      <TouchableOpacity
                        style={styles.waiterChip}
                        onPress={() => {
                          setReassignModalTable(table);
                          setSelectedWaiterName(table.server || floorWaiters[0]?.name || '');
                        }}
                      >
                        <MaterialCommunityIcons name="account-tie" size={14} color="#0D9488" />
                        <Text style={styles.waiterChipText}>
                          {table.server || 'Unassigned'}
                        </Text>
                        <MaterialCommunityIcons name="pencil-outline" size={12} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>

                    {table.status !== 'available' && (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Active Tickets:</Text>
                          <Text style={styles.detailVal}>
                            {tableAllTickets.length} KOT{tableAllTickets.length > 1 ? 's' : ''}
                            {unservedTickets.length > 0 && unservedTickets.length !== tableAllTickets.length ? ` (${unservedTickets.length} active)` : ''}
                          </Text>
                        </View>

                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Current Bill Total:</Text>
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
                                <MaterialCommunityIcons name="bell-ring" size={12} color="#10B981" />
                                <Text style={styles.snippetPillReadyText}>{readyItems.length} Ready to Serve</Text>
                              </View>
                            )}
                            {cookingItems.length > 0 && (
                              <View style={styles.snippetPillCooking}>
                                <MaterialCommunityIcons name="fire" size={12} color="#F59E0B" />
                                <Text style={styles.snippetPillCookingText}>{cookingItems.length} Cooking in KDS</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </>
                    )}
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
                      <>
                        {hasReadyFood && (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnServe]}
                            onPress={() => serveTableTickets(table.id)}
                          >
                            <MaterialCommunityIcons name="check-all" size={16} color="#FFF" />
                            <Text style={styles.btnServeText}>Serve Food</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.btnPrintBill]}
                          onPress={() => handlePrintTableUnpaidBill(table)}
                        >
                          <MaterialCommunityIcons name="printer-outline" size={14} color="#EF4444" />
                          <Text style={styles.btnPrintBillText}>Print Bill (Unpaid)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.btnTransfer]}
                          onPress={() => {
                            setTransferModalTable(table);
                            setSelectedTargetTableId('');
                          }}
                        >
                          <MaterialCommunityIcons name="swap-horizontal" size={16} color="#D4AF37" />
                          <Text style={styles.btnTransferText}>Move</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.btnDetails]}
                          onPress={() => setDetailsModalTable(table)}
                        >
                          <MaterialCommunityIcons name="eye-outline" size={16} color="#FFF" />
                          <Text style={styles.btnDetailsText}>View Items</Text>
                        </TouchableOpacity>

                        {table.status === 'billed' ? (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnSettle]}
                            onPress={() => settleBill(table.id)}
                          >
                            <MaterialCommunityIcons name="cash-check" size={16} color="#FFF" />
                            <Text style={styles.btnSettleText}>Clear Table</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnAddOn]}
                            onPress={() => router.push({ pathname: '/floor-manager/pos' as any, params: { tableId: table.id } })}
                          >
                            <MaterialCommunityIcons name="plus" size={16} color="#D4AF37" />
                            <Text style={styles.btnAddOnText}>Add-On</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        /* ========================================================
           6B. LIVE FLOOR KDS & COOKING MONITOR VIEW
           ======================================================== */
        <ScrollView contentContainerStyle={styles.tablesScroll}>
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
            <View style={styles.kdsGrid}>
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
                        <MaterialCommunityIcons name="plus" size={14} color="#D4AF37" />
                        <Text style={styles.kdsActionBtnPosText}>Add Items</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* 7. MODAL: REASSIGN WAITER */}
      {!!reassignModalTable && (
        <Modal transparent animationType="fade" visible={!!reassignModalTable} onRequestClose={() => setReassignModalTable(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>REASSIGN WAITER — {reassignModalTable.name}</Text>
              <Text style={styles.modalSubtitle}>Select which floor waiter will manage this table</Text>

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
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>TRANSFER GUESTS — {transferModalTable.name}</Text>
              <Text style={styles.modalSubtitle}>Select available target table on {selectedFloor}</Text>

              <ScrollView style={{ maxHeight: 220 }}>
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
            <View style={[styles.modalCard, { maxWidth: 560 }]}>
              <Text style={styles.modalTitle}>{detailsModalTable.name} — ACTIVE ROUND ORDERS</Text>
              <Text style={styles.modalSubtitle}>Server: {detailsModalTable.server || 'None'} • Floor: {selectedFloor}</Text>

              <ScrollView style={{ maxHeight: 280, marginVertical: 12 }}>
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

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnPrintUnpaid}
                  onPress={() => {
                    handlePrintTableUnpaidBill(detailsModalTable);
                    setDetailsModalTable(null);
                  }}
                >
                  <MaterialCommunityIcons name="printer-outline" size={16} color="#FFF" />
                  <Text style={styles.modalBtnPrintUnpaidText}>Print Unpaid Bill (غیر ادا شدہ بل)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalBtnPos}
                  onPress={() => {
                    const tid = detailsModalTable.id;
                    setDetailsModalTable(null);
                    router.push({ pathname: '/floor-manager/pos' as any, params: { tableId: tid } });
                  }}
                >
                  <MaterialCommunityIcons name="plus-circle" size={15} color="#D4AF37" />
                  <Text style={styles.modalBtnPosText}>Add Items</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalBtnClose} onPress={() => setDetailsModalTable(null)}>
                  <Text style={styles.modalBtnCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 10. URGENT POPUP MODAL: NEW DIGITAL MENU ORDER PENDING CONFIRMATION */}
      {pendingFloorOrders.length > 0 && (
        <Modal transparent animationType="fade" visible={pendingFloorOrders.length > 0}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: 500, borderColor: '#EF4444', borderWidth: 2 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MaterialCommunityIcons name="bell-ring" size={26} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: '#EF4444', fontSize: 16 }]}>
                    🚨 NEW DIGITAL MENU ORDER
                  </Text>
                  <Text style={styles.modalSubtitle}>Requires Floor Manager Confirmation to Dispatch to Kitchen</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#1F1B18', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#332D27' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#D4AF37' }}>
                    {pendingFloorOrders[0].tableName || pendingFloorOrders[0].tableId}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>
                    Rs. {Number(pendingFloorOrders[0].total || 0).toLocaleString()}
                  </Text>
                </View>
                <Text style={{ color: '#E5E7EB', fontSize: 13, marginBottom: 4 }}>
                  Customer: <Text style={{ fontWeight: '700' }}>{pendingFloorOrders[0].customer?.name || 'Guest'}</Text>
                  {pendingFloorOrders[0].customer?.phone ? ` • ${pendingFloorOrders[0].customer.phone}` : ''}
                </Text>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                  Floor: {selectedFloor} • Placed {new Date(pendingFloorOrders[0].createdAt || Date.now()).toLocaleTimeString()}
                </Text>
              </View>

              <ScrollView style={{ maxHeight: 180, marginBottom: 14 }}>
                {pendingFloorOrders[0].items?.map((it, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#282420' }}>
                    <Text style={{ color: '#F3F4F6', fontSize: 13, flex: 1 }}>
                      {it.qty || 1}x {it.name}
                    </Text>
                    <Text style={{ color: '#D4AF37', fontSize: 13, fontWeight: '600' }}>
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
                  <Text style={[styles.modalBtnSaveText, { fontWeight: '800' }]}>✓ Confirm & Dispatch KOT</Text>
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
    backgroundColor: '#121110',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1A1817',
    borderBottomWidth: 1,
    borderBottomColor: '#2B2622',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  floorBadgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F2926',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  livePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
  },
  liveText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#26221E',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3D3630',
    gap: 6,
  },
  logoutBtn: {
    borderColor: '#7F1D1D',
    backgroundColor: '#241414',
  },
  navBtnActiveFullscreen: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  navBtnText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  floorTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171514',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#26221E',
    gap: 10,
  },
  floorTabLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  floorTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#24201D',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38322C',
    gap: 6,
  },
  floorTabActive: {
    backgroundColor: '#0D9488',
    borderColor: '#14B8A6',
  },
  floorTabText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  floorTabTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  urgentQueueBox: {
    backgroundColor: '#2A1414',
    borderBottomWidth: 2,
    borderBottomColor: '#DC2626',
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
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  urgentQueueScroll: {
    gap: 12,
    paddingBottom: 4,
  },
  urgentOrderCard: {
    backgroundColor: '#1E1B18',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    padding: 12,
    width: 280,
  },
  urgentOrderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  urgentOrderTable: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  urgentOrderTotal: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '900',
  },
  urgentCustomer: {
    color: '#9CA3AF',
    fontSize: 11,
    marginBottom: 4,
  },
  urgentItems: {
    color: '#D4AF37',
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
    backgroundColor: '#2A1F1F',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  urgentBtnRejectText: {
    color: '#EF4444',
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
    backgroundColor: '#1A1817',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D2824',
  },
  kpiLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  kpiSub: {
    color: '#6B7280',
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
    backgroundColor: '#1A1817',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D2824',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
  },
  filterPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#1A1817',
    borderWidth: 1,
    borderColor: '#2D2824',
  },
  filterPillActive: {
    backgroundColor: '#0D9488',
    borderColor: '#14B8A6',
  },
  filterPillText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#FFF',
    fontWeight: '800',
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
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 340 : '100%',
    backgroundColor: '#1A1817',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2D2824',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  tableCardOccupied: {
    borderColor: '#DC2626',
    backgroundColor: '#1D1716',
  },
  tableCardFoodReady: {
    borderColor: '#D97706',
    backgroundColor: '#231B10',
  },
  tableCardBilled: {
    borderColor: '#2563EB',
    backgroundColor: '#141A26',
  },
  tableCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tableName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  seatingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  seatingText: {
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tableCardBody: {
    backgroundColor: '#141210',
    borderRadius: 8,
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
    color: '#9CA3AF',
    fontSize: 11,
  },
  detailVal: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  billTotalVal: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '900',
  },
  waiterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#201D1A',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  waiterChipText: {
    color: '#0D9488',
    fontSize: 11,
    fontWeight: '700',
  },
  tableActions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
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
  btnServeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  btnTransfer: {
    backgroundColor: '#24201D',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  btnTransferText: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDetails: {
    backgroundColor: '#282420',
  },
  btnDetailsText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
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
    backgroundColor: '#282420',
    borderWidth: 1,
    borderColor: '#3D3630',
  },
  btnAddOnText: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1E1B18',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#38322C',
    padding: 20,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    color: '#9CA3AF',
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
    backgroundColor: '#26221E',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38322C',
    gap: 10,
  },
  modalItemActive: {
    backgroundColor: '#0F2926',
    borderColor: '#0D9488',
  },
  modalItemText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
  },
  modalItemTextActive: {
    color: '#0D9488',
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: '#282420',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    color: '#9CA3AF',
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
    backgroundColor: '#24201D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#38322C',
    paddingBottom: 6,
    marginBottom: 6,
  },
  ticketNumber: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '800',
  },
  ticketStatus: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  ticketItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  ticketItemQty: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '800',
    width: 28,
  },
  ticketItemName: {
    color: '#FFF',
    fontSize: 12,
    flex: 1,
  },
  ticketItemPrice: {
    color: '#9CA3AF',
    fontSize: 12,
  },

  /* VIEW SWITCHER TABS */
  viewSwitcherBar: {
    flexDirection: 'row',
    backgroundColor: '#171514',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#26221E',
    gap: 12,
  },
  viewTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#201D1A',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#332D27',
    gap: 8,
  },
  viewTabActiveTables: {
    backgroundColor: 'rgba(13, 148, 136, 0.15)',
    borderColor: '#0D9488',
  },
  viewTabActiveKds: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  viewTabText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  viewTabTextActiveTables: {
    color: '#0D9488',
    fontWeight: '900',
  },
  viewTabTextActiveKds: {
    color: '#F59E0B',
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
    backgroundColor: '#B45309',
    borderColor: '#F59E0B',
  },

  /* TABLE CARD KDS SNIPPET */
  cardKdsSnippetBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2A2521',
  },
  snippetPillReady: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  snippetPillReadyText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  snippetPillCooking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  snippetPillCookingText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },

  /* BUTTONS */
  btnPrintBill: {
    backgroundColor: '#351212',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  btnPrintBillText: {
    color: '#EF4444',
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
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 360 : '100%',
    backgroundColor: '#1A1817',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#332D27',
    padding: 14,
  },
  kdsTicketCardCooking: {
    borderColor: '#F59E0B',
    backgroundColor: '#1E1914',
  },
  kdsTicketCardReady: {
    borderColor: '#10B981',
    backgroundColor: '#12201A',
  },
  kdsTicketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  kdsTableName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  addonTag: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  addonTagText: {
    color: '#D4AF37',
    fontSize: 9,
    fontWeight: '800',
  },
  kdsServerText: {
    color: '#9CA3AF',
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
    backgroundColor: '#4B5563',
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
    borderColor: '#2A2521',
    marginBottom: 8,
  },
  kdsSubBarText: {
    color: '#9CA3AF',
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
    backgroundColor: '#221E1B',
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
    color: '#D4AF37',
    fontSize: 13,
    fontWeight: '900',
    width: 24,
  },
  kdsItemName: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  kdsItemNotes: {
    color: '#F59E0B',
    fontSize: 10,
    fontStyle: 'italic',
  },
  kdsItemStatusTag: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  itemTagCooking: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  itemTagReady: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  itemTagQueue: {
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  kdsItemStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  itemTextCooking: {
    color: '#FBBF24',
  },
  itemTextReady: {
    color: '#34D399',
  },
  itemTextQueue: {
    color: '#9CA3AF',
  },
  kdsTicketActions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2521',
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
    backgroundColor: '#351212',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  kdsActionBtnBillText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
  },
  kdsActionBtnPos: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#26221E',
    borderWidth: 1,
    borderColor: '#D4AF37',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  kdsActionBtnPosText: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '700',
  },
  kdsEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    backgroundColor: '#1A1817',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2521',
    marginHorizontal: 10,
  },
  kdsEmptyTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  kdsEmptySubtitle: {
    color: '#9CA3AF',
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
  modalBtnPrintUnpaid: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B91C1C',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  modalBtnPrintUnpaidText: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  modalBtnPos: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#282420',
    borderWidth: 1,
    borderColor: '#D4AF37',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  modalBtnPosText: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '800',
  },
  modalBtnClose: {
    flex: 0.8,
    backgroundColor: '#24201D',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCloseText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
