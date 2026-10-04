import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Mock Inventory Data
const INVENTORY = [
  { id: '1', name: 'Chicken (Boneless)', category: 'Meat', stock: 15, unit: 'kg', threshold: 20, status: 'low' },
  { id: '2', name: 'Basmati Rice', category: 'Grains', stock: 50, unit: 'kg', threshold: 10, status: 'ok' },
  { id: '3', name: 'Mint Leaves', category: 'Produce', stock: 2, unit: 'kg', threshold: 5, status: 'critical' },
  { id: '4', name: 'Pepsi 1L', category: 'Beverages', stock: 12, unit: 'bottles', threshold: 24, status: 'low' },
  { id: '5', name: 'Cooking Oil', category: 'Pantry', stock: 45, unit: 'Liters', threshold: 15, status: 'ok' },
  { id: '6', name: 'Mutton', category: 'Meat', stock: 35, unit: 'kg', threshold: 15, status: 'ok' },
];

export default function InventoryScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredInventory = INVENTORY.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok': return { bg: '#E8F5E9', text: '#2E7D32', label: 'In Stock' };
      case 'low': return { bg: '#FFF3E0', text: '#F57C00', label: 'Low Stock' };
      case 'critical': return { bg: '#FFEBEE', text: '#D32F2F', label: 'Critical' };
      default: return { bg: '#F5F5F5', text: '#757575', label: 'Unknown' };
    }
  };

  const renderItem = ({ item }: { item: typeof INVENTORY[0] }) => {
    const badge = getStatusBadge(item.status);
    
    return (
      <View style={styles.inventoryCard}>
        <View style={styles.itemHeader}>
          <View>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemCategory}>{item.category}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
        
        <View style={styles.stockRow}>
          <View style={styles.stockInfo}>
            <Text style={styles.stockLabel}>Current Stock</Text>
            <Text style={[styles.stockValue, item.status !== 'ok' && { color: badge.text }]}>
              {item.stock} {item.unit}
            </Text>
          </View>
          
          <View style={styles.stockInfo}>
            <Text style={styles.stockLabel}>Min Threshold</Text>
            <Text style={styles.stockValue}>{item.threshold} {item.unit}</Text>
          </View>
          
          <TouchableOpacity style={styles.orderBtn}>
            <Ionicons name="cart-outline" size={18} color="#1976D2" />
            <Text style={styles.orderBtnText}>Order Supplier</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/manager/dashboard'))}>
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
          <Text style={styles.headerTitle}>Inventory & BOM</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by ingredient name or category..."
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredInventory}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 4 },
      web: { boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }
    }),
    zIndex: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#1C1C1E',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4a121a', // Sultan Burgundy
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1C1C1E',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  inventoryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 16,
  },
  stockInfo: {
    flex: 1,
  },
  stockLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 4,
  },
  stockValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  orderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  orderBtnText: {
    color: '#1976D2',
    fontWeight: 'bold',
    marginLeft: 6,
  }
});
