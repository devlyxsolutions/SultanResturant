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
import { useRouter } from 'expo-router';
import { useRestaurantStore, MenuItem } from '../../store/restaurantStore';

export default function MenuManagement() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const menuItems = useRestaurantStore(state => state.menuItems);
  const addMenuItem = useRestaurantStore(state => state.addMenuItem);
  const updateMenuItem = useRestaurantStore(state => state.updateMenuItem);
  const deleteMenuItem = useRestaurantStore(state => state.deleteMenuItem);
  const categories = useRestaurantStore(state => state.categories);
  const addCategory = useRestaurantStore(state => state.addCategory);
  const deleteCategory = useRestaurantStore(state => state.deleteCategory);
  
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  
  // Item Modal state (Add / Edit)
  const [isItemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategory, setItemCategory] = useState(categories[0] || 'Mains');
  const [isDropdownOpen, setDropdownOpen] = useState(false);

  // Category Modal state
  const [isCatModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Derived Categories Data
  const categoriesData = categories.map(cat => ({
    id: cat,
    name: cat,
    itemsCount: menuItems.filter(i => i.category === cat).length
  }));

  // Filtered Items
  const filteredItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategoryFilter === 'All' || item.category === selectedCategoryFilter;
    return matchesSearch && matchesCat;
  });

  // Filtered Categories
  const filteredCategories = categoriesData.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openAddItemModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemPrice('');
    setItemCategory(categories[0] || 'Mains');
    setDropdownOpen(false);
    setItemModalVisible(true);
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemPrice(item.price.toString());
    setItemCategory(item.category);
    setDropdownOpen(false);
    setItemModalVisible(true);
  };

  const handleSaveItem = () => {
    if (!itemName.trim() || !itemPrice.trim() || !itemCategory) {
      const msg = 'Please enter item name and valid price.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }
    
    const priceNum = parseFloat(itemPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      const msg = 'Please enter a valid positive price.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    if (editingItem) {
      updateMenuItem(editingItem.id, {
        name: itemName.trim(),
        price: priceNum,
        category: itemCategory
      });
    } else {
      addMenuItem({
        name: itemName.trim(),
        price: priceNum,
        category: itemCategory
      });
    }
    
    setItemModalVisible(false);
  };

  const handleDeleteItem = (item: MenuItem) => {
    const confirmDelete = () => {
      deleteMenuItem(item.id);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        'Delete Item',
        `Are you sure you want to remove "${item.name}" from the menu?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete }
        ]
      );
    }
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) {
      const msg = 'Please enter a category name';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }
    
    if (categories.some(c => c.toLowerCase() === newCatName.trim().toLowerCase())) {
      const msg = 'This category already exists.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Duplicate', msg);
      return;
    }

    addCategory(newCatName.trim());
    setCatModalVisible(false);
    setNewCatName('');
  };

  const handleDeleteCategory = (catName: string) => {
    const count = menuItems.filter(i => i.category === catName).length;
    const confirmDelete = () => {
      deleteCategory(catName);
    };

    const warning = count > 0 
      ? `This category contains ${count} item(s). Deleting it will remove the category classification.` 
      : `Are you sure you want to delete "${catName}"?`;

    if (Platform.OS === 'web') {
      if (window.confirm(warning)) confirmDelete();
    } else {
      Alert.alert('Delete Category', warning, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  return (
    <View style={[styles.container, isMobile && styles.containerMobile]}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.titleWrap}>
          <Text style={[styles.pageTitle, isMobile && styles.pageTitleMobile]}>Menu Catalog</Text>
          <Text style={styles.pageSubtitle}>
            {menuItems.length} Dishes across {categories.length} Categories
          </Text>
        </View>
        <TouchableOpacity 
          style={[styles.addButton, isMobile && styles.addButtonMobile]} 
          onPress={() => activeTab === 'items' ? openAddItemModal() : setCatModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#4a121a" style={{ marginRight: 4 }} />
          <Text style={styles.addButtonText}>
            {activeTab === 'items' ? 'New Item' : 'New Category'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'items' && styles.tabActive]}
          onPress={() => setActiveTab('items')}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="restaurant" 
            size={16} 
            color={activeTab === 'items' ? '#4a121a' : '#8E8E93'} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabText, activeTab === 'items' && styles.tabTextActive]}>
            Menu Items ({menuItems.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'categories' && styles.tabActive]}
          onPress={() => setActiveTab('categories')}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="grid" 
            size={16} 
            color={activeTab === 'categories' ? '#4a121a' : '#8E8E93'} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabText, activeTab === 'categories' && styles.tabTextActive]}>
            Categories ({categories.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search & Category Filter Pills */}
      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
          <TextInput 
            style={styles.searchInput}
            placeholder={`Search ${activeTab}...`}
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#8E8E93" />
            </TouchableOpacity>
          ) : null}
        </View>

        {activeTab === 'items' && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryPillsScroll}
          >
            {['All', ...categories].map(cat => {
              const isSelected = selectedCategoryFilter === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                  onPress={() => setSelectedCategoryFilter(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Main Content Area */}
      <View style={[styles.content, isMobile && styles.contentMobile]}>
        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
          {activeTab === 'items' ? (
            // ================= MENU ITEMS LIST =================
            filteredItems.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="restaurant-outline" size={48} color="#ccc" />
                <Text style={styles.emptyTitle}>No menu items found</Text>
                <Text style={styles.emptySubtitle}>Try changing your search query or category filter</Text>
              </View>
            ) : isMobile ? (
              // MOBILE VIEW: CARDS
              <View style={styles.mobileCardsList}>
                {filteredItems.map(item => (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemCardMain}>
                      <View style={styles.itemIconBadge}>
                        <Ionicons name="fast-food-outline" size={22} color="#D5A943" />
                      </View>
                      <View style={styles.itemInfo}>
                        <View style={styles.itemHeaderRow}>
                          <Text style={styles.itemCardName}>{item.name}</Text>
                          <View style={styles.catBadge}>
                            <Text style={styles.catBadgeText}>{item.category}</Text>
                          </View>
                        </View>
                        <View style={styles.itemPriceRow}>
                          <Text style={styles.itemCardPrice}>Rs. {item.price.toFixed(0)}</Text>
                          <View style={styles.statusPill}>
                            <View style={styles.statusDot} />
                            <Text style={styles.statusPillText}>Available</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Action buttons */}
                    <View style={styles.itemCardActions}>
                      <TouchableOpacity 
                        style={styles.editBtn} 
                        onPress={() => openEditItemModal(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="pencil" size={14} color="#4a121a" style={{ marginRight: 4 }} />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.deleteBtn} 
                        onPress={() => handleDeleteItem(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={14} color="#e74c3c" style={{ marginRight: 4 }} />
                        <Text style={styles.deleteBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              // DESKTOP VIEW: TABLE
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>Item Name</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell]}>Category</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell]}>Price</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell]}>Status</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                </View>
                
                {filteredItems.map(item => (
                  <View key={item.id} style={styles.tableRow}>
                    <View style={[styles.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}>
                      <View style={[styles.itemIconBadge, { width: 36, height: 36, marginRight: 10 }]}>
                        <Ionicons name="restaurant-outline" size={18} color="#D5A943" />
                      </View>
                      <Text style={{ fontWeight: '600', fontSize: 15, color: '#1C1C1E' }}>{item.name}</Text>
                    </View>
                    <View style={styles.tableCell}>
                      <View style={styles.catBadge}>
                        <Text style={styles.catBadgeText}>{item.category}</Text>
                      </View>
                    </View>
                    <Text style={[styles.tableCell, { fontWeight: '700', color: '#4a121a' }]}>
                      Rs. {item.price.toFixed(0)}
                    </Text>
                    <View style={styles.tableCell}>
                      <View style={styles.statusPill}>
                        <View style={styles.statusDot} />
                        <Text style={styles.statusPillText}>Available</Text>
                      </View>
                    </View>
                    <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }]}>
                      <TouchableOpacity 
                        style={styles.desktopActionBtn} 
                        onPress={() => openEditItemModal(item)}
                      >
                        <Ionicons name="pencil" size={16} color="#4a121a" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.desktopActionBtn, { backgroundColor: '#FDECEB' }]} 
                        onPress={() => handleDeleteItem(item)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )
          ) : (
            // ================= CATEGORIES LIST =================
            filteredCategories.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="grid-outline" size={48} color="#ccc" />
                <Text style={styles.emptyTitle}>No categories found</Text>
              </View>
            ) : isMobile ? (
              // MOBILE VIEW: CATEGORY CARDS
              <View style={styles.mobileCardsList}>
                {filteredCategories.map(cat => (
                  <View key={cat.id} style={styles.categoryCard}>
                    <View style={styles.categoryCardLeft}>
                      <View style={styles.categoryIconBadge}>
                        <Ionicons name="folder-outline" size={22} color="#4a121a" />
                      </View>
                      <View>
                        <Text style={styles.categoryCardTitle}>{cat.name}</Text>
                        <Text style={styles.categoryCardCount}>{cat.itemsCount} Items listed</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteCategoryBtn}
                      onPress={() => handleDeleteCategory(cat.name)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              // DESKTOP VIEW: CATEGORIES TABLE
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 2 }]}>Category Name</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell]}>Assigned Items</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Actions</Text>
                </View>
                
                {filteredCategories.map(cat => (
                  <View key={cat.id} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2, fontWeight: '600', fontSize: 16, color: '#1C1C1E' }]}>
                      {cat.name}
                    </Text>
                    <Text style={styles.tableCell}>{cat.itemsCount} Items</Text>
                    <View style={[styles.tableCell, { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }]}>
                      <TouchableOpacity 
                        style={[styles.desktopActionBtn, { backgroundColor: '#FDECEB' }]} 
                        onPress={() => handleDeleteCategory(cat.name)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )
          )}
        </ScrollView>
      </View>

      {/* Add / Edit Item Modal */}
      <Modal visible={isItemModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
              </Text>
              <TouchableOpacity onPress={() => setItemModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>Item Name</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="e.g. Special Sultan Kebab" 
              placeholderTextColor="#8E8E93"
              value={itemName} 
              onChangeText={setItemName} 
            />
            
            <Text style={styles.inputLabel}>Price (Rs.)</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="e.g. 1450" 
              placeholderTextColor="#8E8E93"
              keyboardType="numeric" 
              value={itemPrice} 
              onChangeText={setItemPrice} 
            />
            
            <Text style={styles.inputLabel}>Category</Text>
            <TouchableOpacity 
              style={styles.dropdownBtn}
              activeOpacity={0.8}
              onPress={() => setDropdownOpen(!isDropdownOpen)}
            >
              <Text style={styles.dropdownBtnText}>{itemCategory}</Text>
              <Ionicons name={isDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#8E8E93" />
            </TouchableOpacity>
            
            {isDropdownOpen && (
              <View style={styles.dropdownList}>
                <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                  {categories.map(cat => (
                    <TouchableOpacity 
                      key={cat}
                      style={[styles.dropdownItem, itemCategory === cat && styles.dropdownItemActive]}
                      onPress={() => {
                        setItemCategory(cat);
                        setDropdownOpen(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, itemCategory === cat && styles.dropdownItemTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setItemModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem}>
                <Text style={styles.saveBtnText}>{editingItem ? 'Update Item' : 'Save Item'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Category Modal */}
      <Modal visible={isCatModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Category</Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>Category Name</Text>
            <TextInput 
              style={styles.modalInput} 
              placeholder="e.g. Seafood, Soups, Platters" 
              placeholderTextColor="#8E8E93"
              value={newCatName} 
              onChangeText={setNewCatName} 
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCatModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddCategory}>
                <Text style={styles.saveBtnText}>Save Category</Text>
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
    marginBottom: 20,
  },
  headerMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  titleWrap: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  pageTitleMobile: {
    fontSize: 20,
  },
  pageSubtitle: {
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
    fontSize: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    marginBottom: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#4a121a',
  },
  tabText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#4a121a',
    fontWeight: '700',
  },
  filterSection: {
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
  },
  categoryPillsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  categoryPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  categoryPillActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#48484A',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  contentMobile: {
    padding: 12,
    borderRadius: 12,
  },
  listContainer: {
    flex: 1,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3A3A3C',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  mobileCardsList: {
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0F0F2',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  itemCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
    marginRight: 8,
  },
  catBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#636366',
  },
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemCardPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4a121a', // Sultan Burgundy
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ecc71',
    marginRight: 5,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#27ae60',
  },
  itemCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    marginTop: 12,
    paddingTop: 10,
    gap: 10,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F3EC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8DFC9',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF3F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F7D7D4',
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e74c3c',
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0F0F2',
    padding: 14,
    borderRadius: 12,
  },
  categoryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F8EFEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  categoryCardCount: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  deleteCategoryBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FDF3F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#F2F2F7',
    paddingBottom: 12,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  tableCell: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  tableHeaderCell: {
    fontWeight: '700',
    color: '#8E8E93',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  desktopActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F6F3EC',
    alignItems: 'center',
    justifyContent: 'center',
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
    maxWidth: 480,
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
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#636366',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 14,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
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
    backgroundColor: '#4a121a', // Sultan Burgundy
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  dropdownBtnText: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  dropdownItemActive: {
    backgroundColor: '#F6F3EC',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  dropdownItemTextActive: {
    color: '#4a121a',
    fontWeight: '700',
  }
});
