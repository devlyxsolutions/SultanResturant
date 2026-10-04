import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform } from 'react-native';
import { useRestaurantStore, Table } from '../../store/restaurantStore';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AdminTables() {
  const router = useRouter();
  const tables = useRestaurantStore((state) => state.tables);
  const zones = useRestaurantStore((state) => state.zones);
  
  const addTable = useRestaurantStore((state) => state.addTable);
  const updateTable = useRestaurantStore((state) => state.updateTable);
  const deleteTable = useRestaurantStore((state) => state.deleteTable);
  
  const addZone = useRestaurantStore((state) => state.addZone);
  const deleteZone = useRestaurantStore((state) => state.deleteZone);

  const tickets = useRestaurantStore((state) => state.tickets);
  const settleBill = useRestaurantStore((state) => state.settleBill);

  const [activeTab, setActiveTab] = useState<'tables' | 'zones'>('tables');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'billed'>('all');

  // Table Modal State
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formName, setFormName] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formSeats, setFormSeats] = useState('');

  // Zone Modal State
  const [zoneModalVisible, setZoneModalVisible] = useState(false);
  const [formNewZone, setFormNewZone] = useState('');

  // --- Table Functions ---
  const openAddTableModal = () => {
    setEditingTable(null);
    setFormName('');
    setFormZone(zones[0] || ''); // default to first zone
    setFormSeats('');
    setTableModalVisible(true);
  };

  const openEditTableModal = (table: Table) => {
    setEditingTable(table);
    setFormName(table.name);
    setFormZone(table.zone);
    setFormSeats(table.seats.toString());
    setTableModalVisible(true);
  };

  const handleSaveTable = () => {
    if (!formName.trim() || !formZone.trim() || !formSeats.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please fill all fields');
      } else {
        Alert.alert('Error', 'Please fill all fields');
      }
      return;
    }

    const seatsNum = parseInt(formSeats, 10);
    if (isNaN(seatsNum)) {
       if (Platform.OS === 'web') {
        window.alert('Seats must be a number');
      } else {
        Alert.alert('Error', 'Seats must be a number');
      }
      return;
    }

    if (editingTable) {
      updateTable(editingTable.id, {
        name: formName,
        zone: formZone,
        seats: seatsNum,
      });
    } else {
      addTable({
        name: formName,
        zone: formZone,
        seats: seatsNum,
      });
    }
    setTableModalVisible(false);
  };

  const handleDeleteTable = (id: string) => {
    if (Platform.OS === 'web') {
        if (window.confirm('Are you sure you want to delete this table?')) {
            deleteTable(id);
        }
    } else {
        Alert.alert('Delete', 'Are you sure you want to delete this table?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteTable(id) }
        ]);
    }
  };

  const handleClearTable = (table: Table) => {
    const confirmMsg = `Are you sure you want to clear & release ${table.name}? Active tickets and running bill will be reset.`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        settleBill(table.id);
      }
    } else {
      Alert.alert('Clear Table', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear & Release', style: 'destructive', onPress: () => settleBill(table.id) }
      ]);
    }
  };

  // --- Zone Functions ---
  const handleSaveZone = () => {
    if (!formNewZone.trim()) {
      if (Platform.OS === 'web') window.alert('Zone name cannot be empty');
      else Alert.alert('Error', 'Zone name cannot be empty');
      return;
    }
    
    if (zones.includes(formNewZone.trim())) {
      if (Platform.OS === 'web') window.alert('Zone already exists');
      else Alert.alert('Error', 'Zone already exists');
      return;
    }

    addZone(formNewZone.trim());
    setZoneModalVisible(false);
    setFormNewZone('');
  };

  const handleDeleteZone = (zoneName: string) => {
    const isZoneUsed = tables.some(t => t.zone === zoneName);
    if (isZoneUsed) {
      if (Platform.OS === 'web') window.alert(`Cannot delete '${zoneName}' because it has tables assigned to it.`);
      else Alert.alert('Error', `Cannot delete '${zoneName}' because it has tables assigned to it.`);
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete zone '${zoneName}'?`)) {
          deleteZone(zoneName);
      }
    } else {
      Alert.alert('Delete', `Delete zone '${zoneName}'?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteZone(zoneName) }
      ]);
    }
  };

  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  const availableCount = tables.filter(t => t.status === 'available').length;
  const billedCount = tables.filter(t => t.status === 'billed').length;
  const totalActiveRevenue = tables
    .filter(t => t.status === 'occupied' || t.status === 'billed')
    .reduce((sum, t) => sum + (t.billTotal || 0), 0);

  const filteredTables = tables.filter(t => {
    if (statusFilter === 'available') return t.status === 'available';
    if (statusFilter === 'occupied') return t.status === 'occupied';
    if (statusFilter === 'billed') return t.status === 'billed';
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#27ae60';
      case 'occupied': return '#e74c3c';
      case 'billed': return '#f39c12';
      case 'reserved': return '#8e44ad';
      default: return '#7f8c8d';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Floor & Table Management</Text>
          <Text style={styles.subtitle}>Directly linked with POS & Kitchen Live Orders</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.addButton, activeTab === 'zones' && styles.addButtonSecondary]} 
            onPress={activeTab === 'tables' ? openAddTableModal : () => { setFormNewZone(''); setZoneModalVisible(true); }}
          >
            <Text style={[styles.addButtonText, activeTab === 'zones' && styles.addButtonTextSecondary]}>
              + Add {activeTab === 'tables' ? 'Table' : 'Zone'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Live Table Metrics Bar */}
      <View style={styles.metricsBar}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Tables</Text>
          <Text style={styles.metricValue}>{tables.length}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#27ae60' }]}>
          <Text style={styles.metricLabel}>Available</Text>
          <Text style={[styles.metricValue, { color: '#27ae60' }]}>{availableCount}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#e74c3c' }]}>
          <Text style={styles.metricLabel}>Occupied</Text>
          <Text style={[styles.metricValue, { color: '#e74c3c' }]}>{occupiedCount}</Text>
        </View>
        <View style={[styles.metricCard, { borderLeftColor: '#f39c12' }]}>
          <Text style={styles.metricLabel}>Active Dine-In Bill</Text>
          <Text style={[styles.metricValue, { color: '#4a121a' }]}>Rs. {totalActiveRevenue.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'tables' && styles.activeTab]} 
          onPress={() => setActiveTab('tables')}
        >
          <Text style={[styles.tabText, activeTab === 'tables' && styles.activeTabText]}>Tables ({tables.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'zones' && styles.activeTab]} 
          onPress={() => setActiveTab('zones')}
        >
          <Text style={[styles.tabText, activeTab === 'zones' && styles.activeTabText]}>Zones ({zones.length})</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'tables' ? (
        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
          {/* Status Filter Bar */}
          <View style={styles.filterPillsRow}>
            {(['all', 'available', 'occupied', 'billed'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.statusFilterPill, statusFilter === f && styles.statusFilterPillActive]}
                onPress={() => setStatusFilter(f)}
              >
                <Text style={[styles.statusFilterPillText, statusFilter === f && styles.statusFilterPillTextActive]}>
                  {f === 'all' ? `All (${tables.length})` : f === 'available' ? `Available (${availableCount})` : f === 'occupied' ? `Occupied (${occupiedCount})` : `Billed (${billedCount})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredTables.map((table) => {
            const tableTickets = tickets.filter(t => t.tableId === table.id);
            const isBusy = table.status === 'occupied' || table.status === 'billed';
            const statusColor = getStatusColor(table.status);

            return (
              <View key={table.id} style={styles.tableCard}>
                <View style={styles.tableMainRow}>
                  <View style={styles.tableInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.tableName}>{table.name}</Text>
                      <View style={[styles.badge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
                        <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.badgeText, { color: statusColor }]}>
                          {table.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.tableMeta}>
                      Zone: <Text style={{ fontWeight: '700', color: '#1C1C1E' }}>{table.zone}</Text> • Seats: {table.seats}
                      {table.server ? ` • Server: ${table.server}` : ''}
                    </Text>

                    {isBusy && (
                      <View style={styles.runningOrderRow}>
                        <Text style={styles.runningBillText}>
                          Live Bill: <Text style={{ color: '#4a121a', fontWeight: '900' }}>Rs. {(table.billTotal || 0).toLocaleString()}</Text>
                        </Text>
                        <Text style={styles.ticketsCountText}>
                          • {tableTickets.length} active KOT(s) in kitchen
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* POS Integration Actions */}
                  <View style={styles.posActionsGroup}>
                    {isBusy ? (
                      <>
                        <TouchableOpacity 
                          style={styles.checkoutPosBtn} 
                          onPress={() => router.push(`/admin/pos?prefillTableId=${table.id}`)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="card" size={15} color="#fff" style={{ marginRight: 4 }} />
                          <Text style={styles.posBtnTextWhite}>POS Checkout</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.addOrderPosBtn} 
                          onPress={() => router.push(`/admin/pos?prefillTableId=${table.id}`)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add-circle" size={15} color="#000" style={{ marginRight: 4 }} />
                          <Text style={styles.posBtnTextDark}>Add Items</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.clearTableBtn} 
                          onPress={() => handleClearTable(table)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="refresh" size={14} color="#e74c3c" />
                          <Text style={styles.clearTableText}>Clear</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity 
                        style={styles.startOrderPosBtn} 
                        onPress={() => router.push(`/admin/pos?prefillTableId=${table.id}`)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="calculator" size={15} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.posBtnTextWhite}>Open in POS</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.editBtn} onPress={() => openEditTableModal(table)}>
                      <Ionicons name="pencil" size={14} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteTable(table.id)}>
                      <Ionicons name="trash" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
          {filteredTables.length === 0 && <Text style={styles.emptyText}>No tables found matching criteria.</Text>}
        </ScrollView>
      ) : (
        <ScrollView style={styles.listContainer}>
          {zones.map((zone, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.tableInfo}>
                <Text style={styles.tableName}>{zone}</Text>
                <Text style={styles.tableMeta}>{tables.filter(t => t.zone === zone).length} Tables</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteZone(zone)}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {zones.length === 0 && <Text style={styles.emptyText}>No zones found. Add a zone to get started.</Text>}
        </ScrollView>
      )}

      {/* Table Modal */}
      <Modal visible={tableModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTable ? 'Edit Table' : 'Add Table'}</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Table Name (e.g. T-01)"
              value={formName}
              onChangeText={setFormName}
            />

            <Text style={styles.label}>Select Zone:</Text>
            <View style={styles.zoneSelector}>
              {zones.map(z => (
                <TouchableOpacity 
                  key={z} 
                  style={[styles.zonePill, formZone === z && styles.zonePillActive]}
                  onPress={() => setFormZone(z)}
                >
                  <Text style={[styles.zonePillText, formZone === z && styles.zonePillTextActive]}>{z}</Text>
                </TouchableOpacity>
              ))}
              {zones.length === 0 && <Text style={styles.emptyText}>No zones available. Please add a zone first.</Text>}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Number of Seats"
              value={formSeats}
              onChangeText={setFormSeats}
              keyboardType="numeric"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTableModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTable}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Zone Modal */}
      <Modal visible={zoneModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Zone</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Zone Name (e.g. Patio)"
              value={formNewZone}
              onChangeText={setFormNewZone}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setZoneModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveZone}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4a121a',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  addButton: {
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonSecondary: {
    backgroundColor: '#4a121a',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  addButtonTextSecondary: {
    color: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#4a121a',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#4a121a',
  },
  listContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableInfo: {
    flex: 1,
  },
  tableName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tableMeta: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    paddingVertical: 24,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    width: '90%',
    maxWidth: 450,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#4a121a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  zoneSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  zonePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  zonePillActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  zonePillText: {
    color: '#666',
  },
  zonePillTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  metricsBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4a121a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  metricLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
    marginTop: 4,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  statusFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  statusFilterPillActive: {
    backgroundColor: '#4a121a',
  },
  statusFilterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636366',
  },
  statusFilterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tableMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  runningOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  runningBillText: {
    fontSize: 13,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  ticketsCountText: {
    fontSize: 12,
    color: '#D5A943',
    fontWeight: '700',
  },
  posActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  checkoutPosBtn: {
    backgroundColor: '#27ae60',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addOrderPosBtn: {
    backgroundColor: '#F6F3EC',
    borderWidth: 1,
    borderColor: '#D5A943',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startOrderPosBtn: {
    backgroundColor: '#4a121a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearTableBtn: {
    borderWidth: 1,
    borderColor: '#e74c3c',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  posBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  posBtnTextDark: {
    color: '#4a121a',
    fontSize: 12,
    fontWeight: '800',
  },
  clearTableText: {
    color: '#e74c3c',
    fontSize: 11,
    fontWeight: '700',
  },
});
