import React, { useState } from 'react';
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
  useWindowDimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore, Customer } from '../../store/restaurantStore';

export default function AdminCustomers() {
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const customers = useRestaurantStore(state => state.customers);
  const addCustomer = useRestaurantStore(state => state.addCustomer);
  const updateCustomer = useRestaurantStore(state => state.updateCustomer);
  const deleteCustomer = useRestaurantStore(state => state.deleteCustomer);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  const totalSpentAll = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormAddress('');
    setModalVisible(true);
  };

  const openEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormName(cust.name);
    setFormPhone(cust.phone);
    setFormAddress(cust.address || '');
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !formPhone.trim()) {
      const msg = 'Customer name and phone number are required.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, {
        name: formName.trim(),
        phone: formPhone.trim(),
        address: formAddress.trim()
      });
    } else {
      addCustomer({
        name: formName.trim(),
        phone: formPhone.trim(),
        address: formAddress.trim()
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (cust: Customer) => {
    const doDelete = () => {
      deleteCustomer(cust.id);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete customer "${cust.name}"?`)) doDelete();
    } else {
      Alert.alert(
        'Delete Customer',
        `Are you sure you want to remove "${cust.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <View style={[styles.container, isMobile && styles.containerMobile]}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View>
          <Text style={[styles.title, isMobile && styles.titleMobile]}>Customer CRM</Text>
          <Text style={styles.subtitle}>
            {customers.length} Registered VIPs & Diners
          </Text>
        </View>
        <TouchableOpacity 
          style={[styles.addButton, isMobile && styles.addButtonMobile]} 
          onPress={openAddModal}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add" size={16} color="#4a121a" style={{ marginRight: 6 }} />
          <Text style={styles.addButtonText}>Add Customer</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total Diners</Text>
          <Text style={styles.kpiValue}>{customers.length}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Cumulative Revenue</Text>
          <Text style={[styles.kpiValue, { color: '#4a121a' }]}>Rs. {totalSpentAll.toLocaleString()}</Text>
        </View>
      </View>

      {/* Search Box */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#8E8E93" />
        <TextInput 
          style={styles.searchInput} 
          placeholder="Search by customer name or phone..." 
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#8E8E93" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Customers List */}
      <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No customers found</Text>
            <Text style={styles.emptySubtext}>Try another search term or click "Add Customer"</Text>
          </View>
        ) : (
          filteredCustomers.map(cust => (
            <View key={cust.id} style={[styles.card, isMobile && styles.cardMobile]}>
              <View style={styles.cardTopRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(cust.name)}</Text>
                </View>
                <View style={styles.custMainInfo}>
                  <Text style={styles.custName}>{cust.name}</Text>
                  <View style={styles.detailRow}>
                    <Ionicons name="call" size={13} color="#D5A943" style={{ marginRight: 4 }} />
                    <Text style={styles.custPhone}>{cust.phone}</Text>
                  </View>
                  {cust.address ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="location" size={13} color="#8E8E93" style={{ marginRight: 4 }} />
                      <Text style={styles.custAddress}>{cust.address}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={[styles.cardBottomRow, isMobile && styles.cardBottomRowMobile]}>
                <View style={styles.statsContainer}>
                  <View style={styles.statPill}>
                    <Text style={styles.statLabel}>Orders</Text>
                    <Text style={styles.statVal}>{cust.totalOrders || 0}</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Text style={styles.statLabel}>Total Spent</Text>
                    <Text style={styles.statVal}>Rs. {(cust.totalSpent || 0).toLocaleString()}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity 
                    style={styles.actionBtn} 
                    onPress={() => openEditModal(cust)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pencil" size={15} color="#4a121a" />
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.deleteActionBtn]} 
                    onPress={() => handleDelete(cust)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={15} color="#e74c3c" />
                    <Text style={[styles.actionBtnText, { color: '#e74c3c' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Customer Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Customer Name *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Zubair Tariq" 
              placeholderTextColor="#8E8E93"
              value={formName} 
              onChangeText={setFormName} 
            />
            
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 0300 1234567" 
              placeholderTextColor="#8E8E93"
              value={formPhone} 
              onChangeText={setFormPhone} 
              keyboardType="phone-pad" 
            />
            
            <Text style={styles.label}>Delivery / Billing Address</Text>
            <TextInput 
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]} 
              placeholder="e.g. House 45, Street 12, Phase 5..." 
              placeholderTextColor="#8E8E93"
              value={formAddress} 
              onChangeText={setFormAddress} 
              multiline 
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>
                  {editingCustomer ? 'Update Customer' : 'Save Customer'}
                </Text>
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
    backgroundColor: '#F8F9FA',
  },
  containerMobile: {
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  titleMobile: {
    fontSize: 20,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#D5A943', // Sultan Gold
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonMobile: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addButtonText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 13,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  kpiLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#1C1C1E',
  },
  listContainer: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    textAlign: 'center',
    color: '#3A3A3C',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardMobile: {
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(74, 18, 26, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#D5A943',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4a121a',
  },
  custMainInfo: {
    flex: 1,
  },
  custName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 3,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  custPhone: {
    fontSize: 13,
    color: '#48484A',
    fontWeight: '500',
  },
  custAddress: {
    fontSize: 13,
    color: '#8E8E93',
    flex: 1,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  cardBottomRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  statPill: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  statLabel: {
    fontSize: 10,
    color: '#8E8E93',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  statVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4a121a',
    marginTop: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F3EC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8DFC9',
  },
  deleteActionBtn: {
    backgroundColor: '#FDF3F2',
    borderColor: '#F7D7D4',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalContentMobile: {
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#636366',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    color: '#1C1C1E',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
  },
  cancelBtnText: {
    color: '#636366',
    fontWeight: '700',
    fontSize: 14,
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4a121a',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
