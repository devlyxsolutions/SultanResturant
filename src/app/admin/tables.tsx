import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Platform } from 'react-native';
import { useRestaurantStore, Table } from '../../store/restaurantStore';

import { useRouter } from 'expo-router';

export default function AdminTables() {
  const router = useRouter();
  const tables = useRestaurantStore((state) => state.tables);
  const zones = useRestaurantStore((state) => state.zones);
  
  const addTable = useRestaurantStore((state) => state.addTable);
  const updateTable = useRestaurantStore((state) => state.updateTable);
  const deleteTable = useRestaurantStore((state) => state.deleteTable);
  
  const addZone = useRestaurantStore((state) => state.addZone);
  const deleteZone = useRestaurantStore((state) => state.deleteZone);

  const [activeTab, setActiveTab] = useState<'tables' | 'zones'>('tables');

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


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Floor & Table Management</Text>
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

      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'tables' && styles.activeTab]} 
          onPress={() => setActiveTab('tables')}
        >
          <Text style={[styles.tabText, activeTab === 'tables' && styles.activeTabText]}>Tables</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'zones' && styles.activeTab]} 
          onPress={() => setActiveTab('zones')}
        >
          <Text style={[styles.tabText, activeTab === 'zones' && styles.activeTabText]}>Zones</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'tables' ? (
        <ScrollView style={styles.listContainer}>
          {tables.map((table) => (
            <View key={table.id} style={styles.tableRow}>
              <View style={styles.tableInfo}>
                <Text style={styles.tableName}>{table.name} ({table.zone})</Text>
                <Text style={styles.tableMeta}>Seats: {table.seats} • Status: {table.status}</Text>
              </View>
              <View style={styles.actions}>
                {(table.status === 'occupied' || table.status === 'billed') && (
                  <TouchableOpacity 
                    style={[styles.editBtn, {backgroundColor: '#2ecc71', borderColor: '#27ae60'}]} 
                    onPress={() => router.push(`/admin/pos?prefillTableId=${table.id}`)}
                  >
                    <Text style={[styles.editBtnText, {color: '#fff'}]}>Checkout</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.editBtn} onPress={() => openEditTableModal(table)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteTable(table.id)}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {tables.length === 0 && <Text style={styles.emptyText}>No tables found. Add a table to get started.</Text>}
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
});
