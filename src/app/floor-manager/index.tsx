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
import { useRestaurantStore, Table, Ticket, OnlineOrder } from '../../store/restaurantStore';

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
  const confirmOnlineOrder = useRestaurantStore((s) => s.confirmOnlineOrder);
  const rejectOnlineOrder = useRestaurantStore((s) => s.rejectOnlineOrder);

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
      return orderFloor === currentFloor || orderFloor.includes(currentFloor);
    });
  }, [onlineOrders, selectedFloor]);

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
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => router.push('/manager/pos' as any)}
          >
            <MaterialCommunityIcons name="point-of-sale" size={18} color="#D4AF37" />
            <Text style={styles.navBtnText}>Open POS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => router.push('/kitchen/kds')}
          >
            <MaterialCommunityIcons name="chef-hat" size={18} color="#10B981" />
            <Text style={styles.navBtnText}>Kitchen KDS</Text>
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

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>FOOD READY AT PASS</Text>
          <Text style={[styles.kpiValue, { color: kpis.readyCount > 0 ? '#F59E0B' : '#9CA3AF' }]}>
            {kpis.readyCount}
          </Text>
          <Text style={styles.kpiSub}>Urgent Pickup Needed</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>AVAILABLE</Text>
          <Text style={[styles.kpiValue, { color: '#10B981' }]}>{kpis.available}</Text>
          <Text style={styles.kpiSub}>Ready for Seating</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>BILLED / PAYING</Text>
          <Text style={[styles.kpiValue, { color: '#3B82F6' }]}>{kpis.billed}</Text>
          <Text style={styles.kpiSub}>Awaiting Settlement</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>FLOOR WAITERS</Text>
          <Text style={[styles.kpiValue, { color: '#0D9488' }]}>{floorWaiters.length}</Text>
          <Text style={styles.kpiSub}>Active Staff on Duty</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>TODAY'S FLOOR SALES</Text>
          <Text style={[styles.kpiValue, { color: '#D4AF37' }]}>Rs. {kpis.floorSales.toLocaleString()}</Text>
          <Text style={styles.kpiSub}>Settled Invoices Today</Text>
        </View>
      </View>

      {/* 5. CONTROLS: SEARCH & STATUS FILTERS */}
      <View style={styles.controlsBar}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search table, assigned waiter, or seating type..."
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
      </View>

      {/* 6. TABLES GRID */}
      <ScrollView contentContainerStyle={styles.tablesScroll}>
        <View style={styles.tablesGrid}>
          {displayedTables.map((table) => {
            const tableTickets = tickets.filter((tk) => tk.tableId === table.id && tk.status !== 'served');
            const hasReadyFood = tableTickets.some(
              (tk) => tk.status === 'ready' || (tk.items && tk.items.some((it) => it.itemStatus === 'ready'))
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
                          {tableTickets.length} KOT{tableTickets.length > 1 ? 's' : ''}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Current Bill Total:</Text>
                        <Text style={styles.billTotalVal}>
                          Rs. {(table.billTotal || 0).toLocaleString()}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Table Action Buttons */}
                <View style={styles.tableActions}>
                  {table.status === 'available' ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.btnPunchOrder]}
                      onPress={() => router.push({ pathname: '/manager/pos' as any, params: { tableId: table.id } })}
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
                          onPress={() => router.push({ pathname: '/manager/pos' as any, params: { tableId: table.id } })}
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

      {/* 9. MODAL: VIEW ACTIVE ROUND ITEMS */}
      {!!detailsModalTable && (
        <Modal transparent animationType="fade" visible={!!detailsModalTable} onRequestClose={() => setDetailsModalTable(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: 540 }]}>
              <Text style={styles.modalTitle}>{detailsModalTable.name} — ACTIVE ROUND ORDERS</Text>
              <Text style={styles.modalSubtitle}>Server: {detailsModalTable.server || 'None'} • Floor: {selectedFloor}</Text>

              <ScrollView style={{ maxHeight: 280, marginVertical: 12 }}>
                {tickets
                  .filter((tk) => tk.tableId === detailsModalTable.id)
                  .map((tk) => (
                    <View key={tk.id} style={styles.ticketBox}>
                      <View style={styles.ticketHeader}>
                        <Text style={styles.ticketNumber}>KOT #{tk.id}</Text>
                        <Text style={styles.ticketStatus}>Status: {tk.status.toUpperCase()}</Text>
                      </View>
                      {tk.items.map((it, idx) => (
                        <View key={idx} style={styles.ticketItemRow}>
                          <Text style={styles.ticketItemQty}>{it.qty}x</Text>
                          <Text style={styles.ticketItemName}>{it.name}</Text>
                          <Text style={styles.ticketItemPrice}>Rs. {(it.price * it.qty).toLocaleString()}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtnSave, { flex: 1 }]} onPress={() => setDetailsModalTable(null)}>
                  <Text style={styles.modalBtnSaveText}>Close</Text>
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
});
