import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  Alert,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useOpsStore,
  InventoryItem,
  StockMovementType,
  INVENTORY_CATEGORIES,
  getStockLevel,
  StockLevel,
} from '../store/opsStore';
import { useRestaurantStore, MenuItem } from '../store/restaurantStore';
import { BRAND } from '../constants/brand';
import { money, formatTime, formatDay, toWhatsAppNumber } from '../utils/format';

const UNITS = ['kg', 'Liters', 'bottles', 'packs', 'grams', 'cylinders', 'pcs', 'cartons', 'crates', 'bags'];

interface Props {
  backRoute?: string;
}

export default function InventoryScreen({ backRoute = '/manager/dashboard' }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const inventory = useOpsStore((s) => s.inventory);
  const stockMovements = useOpsStore((s) => s.stockMovements);
  const addInventoryItem = useOpsStore((s) => s.addInventoryItem);
  const updateInventoryItem = useOpsStore((s) => s.updateInventoryItem);
  const deleteInventoryItem = useOpsStore((s) => s.deleteInventoryItem);
  const recordStockMovement = useOpsStore((s) => s.recordStockMovement);

  // Menu items from restaurant store for dishes stock tab
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const updateMenuItem = useRestaurantStore((s) => s.updateMenuItem);

  // UI States
  const [activeTab, setActiveTab] = useState<'raw' | 'movements' | 'dishes'>('raw');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<StockLevel | 'all'>('all');
  const [movementFilter, setMovementFilter] = useState<StockMovementType | 'all'>('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Add / Edit Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<string>(INVENTORY_CATEGORIES[0]);
  const [formUnit, setFormUnit] = useState('kg');
  const [formStock, setFormStock] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formSupplierPhone, setFormSupplierPhone] = useState('');

  // Movement Form State
  const [movementType, setMovementType] = useState<StockMovementType>('receive');
  const [movementQty, setMovementQty] = useState('');
  const [movementNote, setMovementNote] = useState('');

  // Analytics & Summary Metrics
  const metrics = useMemo(() => {
    let totalValuation = 0;
    let lowCount = 0;
    let outCount = 0;

    inventory.forEach((item) => {
      const val = (item.stock || 0) * (item.costPerUnit || 0);
      totalValuation += val;
      const level = getStockLevel(item);
      if (level === 'out') outCount++;
      else if (level === 'low' || level === 'critical') lowCount++;
    });

    return {
      totalValuation,
      totalItems: inventory.length,
      lowCount,
      outCount,
    };
  }, [inventory]);

  // Filtered Raw Materials
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.supplier && item.supplier.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const level = getStockLevel(item);
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'ok' && level === 'ok') ||
        (statusFilter === 'low' && (level === 'low' || level === 'critical')) ||
        (statusFilter === 'out' && level === 'out');

      return matchSearch && matchCategory && matchStatus;
    });
  }, [inventory, searchQuery, selectedCategory, statusFilter]);

  // Filtered Stock Movements
  const filteredMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      const matchType = movementFilter === 'all' || m.type === movementFilter;
      const matchSearch =
        !searchQuery ||
        m.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.note && m.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.by && m.by.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchType && matchSearch;
    });
  }, [stockMovements, movementFilter, searchQuery]);

  // Tracked Dishes in Menu
  const trackedDishes = useMemo(() => {
    return menuItems.filter((m) => {
      const matchSearch =
        !searchQuery ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [menuItems, searchQuery]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormName('');
    setFormCategory(INVENTORY_CATEGORIES[0]);
    setFormUnit('kg');
    setFormStock('');
    setFormThreshold('10');
    setFormCost('');
    setFormSupplier('');
    setFormSupplierPhone('');
    setShowAddModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormUnit(item.unit);
    setFormStock(item.stock.toString());
    setFormThreshold(item.threshold.toString());
    setFormCost(item.costPerUnit ? item.costPerUnit.toString() : '');
    setFormSupplier(item.supplier || '');
    setFormSupplierPhone(item.supplierPhone || '');
    setShowEditModal(true);
  };

  // Open Movement Modal
  const handleOpenMovement = (item: InventoryItem, defaultType: StockMovementType = 'receive') => {
    setSelectedItem(item);
    setMovementType(defaultType);
    setMovementQty('');
    setMovementNote('');
    setShowMovementModal(true);
  };

  // Submit Add
  const handleSaveAdd = () => {
    if (!formName.trim()) {
      alertMsg('Missing Name', 'Please enter the item name.');
      return;
    }
    const stockNum = parseFloat(formStock) || 0;
    const threshNum = parseFloat(formThreshold) || 5;
    const costNum = parseFloat(formCost) || 0;

    addInventoryItem({
      name: formName.trim(),
      category: formCategory,
      unit: formUnit,
      stock: stockNum,
      threshold: threshNum,
      costPerUnit: costNum,
      supplier: formSupplier.trim() || undefined,
      supplierPhone: formSupplierPhone.trim() || undefined,
    });

    setShowAddModal(false);
    alertMsg('Success', `"${formName.trim()}" added to inventory.`);
  };

  // Submit Edit
  const handleSaveEdit = () => {
    if (!selectedItem) return;
    if (!formName.trim()) {
      alertMsg('Missing Name', 'Please enter the item name.');
      return;
    }

    const stockNum = parseFloat(formStock) || 0;
    const threshNum = parseFloat(formThreshold) || 5;
    const costNum = parseFloat(formCost) || 0;

    updateInventoryItem(selectedItem.id, {
      name: formName.trim(),
      category: formCategory,
      unit: formUnit,
      stock: stockNum,
      threshold: threshNum,
      costPerUnit: costNum,
      supplier: formSupplier.trim() || undefined,
      supplierPhone: formSupplierPhone.trim() || undefined,
    });

    setShowEditModal(false);
    alertMsg('Updated', `"${formName.trim()}" updated successfully.`);
  };

  // Submit Movement
  const handleSaveMovement = () => {
    if (!selectedItem) return;
    const qtyNum = parseFloat(movementQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      alertMsg('Invalid Quantity', 'Please enter a valid positive quantity.');
      return;
    }

    recordStockMovement(
      selectedItem.id,
      movementType,
      qtyNum,
      movementNote.trim() || undefined,
      'Staff'
    );

    setShowMovementModal(false);
    const actionLabel =
      movementType === 'receive'
        ? `Added +${qtyNum} ${selectedItem.unit}`
        : movementType === 'usage'
        ? `Deducted -${qtyNum} ${selectedItem.unit} (Kitchen Usage)`
        : movementType === 'wastage'
        ? `Deducted -${qtyNum} ${selectedItem.unit} (Wastage)`
        : `Adjusted to ${qtyNum} ${selectedItem.unit}`;

    alertMsg('Stock Recorded', `${selectedItem.name}: ${actionLabel}`);
  };

  // Delete Item
  const handleDelete = (item: InventoryItem) => {
    const confirmText = `Are you sure you want to delete "${item.name}" from inventory?`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmText)) {
        deleteInventoryItem(item.id);
      }
    } else {
      Alert.alert('Delete Inventory Item', confirmText, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteInventoryItem(item.id) },
      ]);
    }
  };

  // Contact Supplier
  const handleContactSupplier = (phone?: string) => {
    if (!phone) {
      alertMsg('No Phone', 'No supplier contact phone available for this item.');
      return;
    }
    const cleanNumber = toWhatsAppNumber(phone);
    const url = `https://wa.me/${cleanNumber}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`tel:${phone}`);
    });
  };

  // Adjust dish ready-stock portions
  const handleAdjustDishStock = (dish: MenuItem, delta: number) => {
    const current = dish.stockQty || 0;
    const next = Math.max(0, current + delta);
    updateMenuItem(dish.id, {
      trackStock: true,
      stockQty: next,
    });
  };

  // Helper alert
  const alertMsg = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const getStatusBadge = (item?: InventoryItem | null) => {
    if (!item) {
      return { bg: BRAND.successSoft, text: BRAND.success, label: 'In Stock', icon: 'checkmark-circle' };
    }
    const level = getStockLevel(item);
    switch (level) {
      case 'ok':
        return { bg: BRAND.successSoft, text: BRAND.success, label: 'In Stock', icon: 'checkmark-circle' };
      case 'low':
        return { bg: BRAND.warnSoft, text: BRAND.warn, label: 'Low Stock', icon: 'alert-circle' };
      case 'critical':
      case 'out':
      default:
        return {
          bg: BRAND.dangerSoft,
          text: BRAND.danger,
          label: (item.stock ?? 0) <= 0 ? 'Out of Stock' : 'Critical',
          icon: 'close-circle',
        };
    }
  };

  const getMovementConfig = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'receive' || t === 'in' || t === 'add') {
      return { label: 'Received Stock', color: BRAND.success, bg: BRAND.successSoft, icon: 'arrow-down-circle' };
    }
    if (t === 'usage' || t === 'out' || t === 'used' || t === 'kitchen') {
      return { label: 'Kitchen Usage', color: BRAND.info, bg: BRAND.infoSoft, icon: 'restaurant' };
    }
    if (t === 'wastage' || t === 'waste' || t === 'damage' || t === 'spoilage') {
      return { label: 'Wastage / Spoilage', color: BRAND.danger, bg: BRAND.dangerSoft, icon: 'trash' };
    }
    return { label: 'Manual Adjustment', color: BRAND.purple, bg: BRAND.purpleSoft, icon: 'options' };
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as any))}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={BRAND.ink} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Inventory & Stock Control</Text>
            <Text style={styles.headerSubtitle}>Real-time Raw Materials, Kitchen Usage & Valuation</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BRAND.border }]}
            onPress={() => router.push('/admin/suppliers' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="bus-outline" size={16} color={BRAND.burgundy} style={{ marginRight: 4 }} />
            <Text style={[styles.addBtnText, { color: BRAND.burgundy }]}>Suppliers Hub</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd} activeOpacity={0.85}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add Item</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KPI Cards Row */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderLeftColor: BRAND.gold }]}>
          <View style={styles.kpiIconBox}>
            <Ionicons name="cash-outline" size={22} color={BRAND.burgundy} />
          </View>
          <View>
            <Text style={styles.kpiLabel}>Total Asset Valuation</Text>
            <Text style={styles.kpiValue}>{money(metrics.totalValuation)}</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: BRAND.info }]}>
          <View style={[styles.kpiIconBox, { backgroundColor: BRAND.infoSoft }]}>
            <Ionicons name="cube-outline" size={22} color={BRAND.info} />
          </View>
          <View>
            <Text style={styles.kpiLabel}>Tracked Materials</Text>
            <Text style={styles.kpiValue}>{metrics.totalItems} Items</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.kpiCard, { borderLeftColor: BRAND.warn }]}
          onPress={() => setStatusFilter(statusFilter === 'low' ? 'all' : 'low')}
          activeOpacity={0.7}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: BRAND.warnSoft }]}>
            <Ionicons name="alert-circle-outline" size={22} color={BRAND.warn} />
          </View>
          <View>
            <Text style={styles.kpiLabel}>Low Stock Alert</Text>
            <Text style={[styles.kpiValue, { color: BRAND.warn }]}>{metrics.lowCount} Items</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.kpiCard, { borderLeftColor: BRAND.danger }]}
          onPress={() => setStatusFilter(statusFilter === 'out' ? 'all' : 'out')}
          activeOpacity={0.7}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: BRAND.dangerSoft }]}>
            <Ionicons name="close-circle-outline" size={22} color={BRAND.danger} />
          </View>
          <View>
            <Text style={styles.kpiLabel}>Out of Stock</Text>
            <Text style={[styles.kpiValue, { color: BRAND.danger }]}>{metrics.outCount} Items</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Main Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'raw' && styles.tabBtnActive]}
          onPress={() => setActiveTab('raw')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="cube"
            size={18}
            color={activeTab === 'raw' ? BRAND.burgundy : BRAND.muted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'raw' && styles.tabBtnTextActive]}>
            Raw Ingredients ({inventory.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'movements' && styles.tabBtnActive]}
          onPress={() => setActiveTab('movements')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="swap-horizontal"
            size={18}
            color={activeTab === 'movements' ? BRAND.burgundy : BRAND.muted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'movements' && styles.tabBtnTextActive]}>
            Stock In/Out Log ({stockMovements.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'dishes' && styles.tabBtnActive]}
          onPress={() => setActiveTab('dishes')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="restaurant"
            size={18}
            color={activeTab === 'dishes' ? BRAND.burgundy : BRAND.muted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'dishes' && styles.tabBtnTextActive]}>
            Ready Dishes Stock ({trackedDishes.filter((d) => d.trackStock).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar & Filters */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={BRAND.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === 'raw'
                ? 'Search ingredients, category, supplier...'
                : activeTab === 'movements'
                ? 'Search movement history...'
                : 'Search menu dishes...'
            }
            placeholderTextColor={BRAND.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={BRAND.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* TAB 1: RAW INGREDIENTS */}
      {activeTab === 'raw' && (
        <View>
          {/* Category Chips Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesScroll}
            contentContainerStyle={styles.categoriesContent}
          >
            <TouchableOpacity
              style={[styles.categoryChip, selectedCategory === 'All' && styles.categoryChipActive]}
              onPress={() => setSelectedCategory('All')}
            >
              <Text style={[styles.categoryChipText, selectedCategory === 'All' && styles.categoryChipTextActive]}>
                All Categories
              </Text>
            </TouchableOpacity>
            {INVENTORY_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.categoryChipText, selectedCategory === cat && styles.categoryChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Status Filter Chips */}
          <View style={styles.statusFilterRow}>
            {(['all', 'ok', 'low', 'out'] as const).map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.statusFilterBtn, statusFilter === st && styles.statusFilterBtnActive]}
                onPress={() => setStatusFilter(st)}
              >
                <Text
                  style={[styles.statusFilterBtnText, statusFilter === st && styles.statusFilterBtnTextActive]}
                >
                  {st === 'all'
                    ? 'All Stock'
                    : st === 'ok'
                    ? 'In Stock'
                    : st === 'low'
                    ? 'Low Stock Warning'
                    : 'Out of Stock'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Items Grid / List */}
          {filteredInventory.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={48} color={BRAND.muted} />
              <Text style={styles.emptyTitle}>No Inventory Items Found</Text>
              <Text style={styles.emptyDesc}>Try adjusting your search query or add a new ingredient.</Text>
              <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Add First Item</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.itemsGrid}>
              {filteredInventory.map((item) => {
                const badge = getStatusBadge(item);
                const isLow = item.stock <= item.threshold;
                const totalItemVal = item.stock * (item.costPerUnit || 0);
                const percentLeft = Math.min(100, Math.round((item.stock / (item.threshold * 2 || 1)) * 100));

                return (
                  <View key={item.id} style={styles.itemCard}>
                    {/* Item Card Header */}
                    <View style={styles.itemCardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.itemCardTitle}>{item.name}</Text>
                        <View style={styles.tagRow}>
                          <View style={styles.categoryTag}>
                            <Text style={styles.categoryTagText}>{item.category}</Text>
                          </View>
                          <Text style={styles.unitTag}>Unit: {item.unit}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Ionicons name={badge.icon as any} size={13} color={badge.text} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                      </View>
                    </View>

                    {/* Stock Numbers & Progress */}
                    <View style={styles.stockDetailsBox}>
                      <View style={styles.stockStatRow}>
                        <View>
                          <Text style={styles.stockStatLabel}>Current Stock</Text>
                          <Text style={[styles.stockStatValue, isLow && { color: badge.text }]}>
                            {item.stock} <Text style={{ fontSize: 13, fontWeight: '500' }}>{item.unit}</Text>
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.stockStatLabel}>Reorder Threshold</Text>
                          <Text style={styles.stockStatValue}>
                            {item.threshold} <Text style={{ fontSize: 13, fontWeight: '500' }}>{item.unit}</Text>
                          </Text>
                        </View>
                      </View>

                      {/* Stock Bar */}
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${percentLeft}%`,
                              backgroundColor: item.stock <= 0 ? BRAND.danger : isLow ? BRAND.warn : BRAND.success,
                            },
                          ]}
                        />
                      </View>
                    </View>

                    {/* Valuation & Cost */}
                    <View style={styles.valuationRow}>
                      <View>
                        <Text style={styles.valLabel}>Unit Cost</Text>
                        <Text style={styles.valValue}>
                          {item.costPerUnit ? money(item.costPerUnit) : 'N/A'}{' '}
                          <Text style={{ fontSize: 11, color: BRAND.muted }}>/{item.unit}</Text>
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.valLabel}>Total Stock Worth</Text>
                        <Text style={[styles.valValue, { color: BRAND.burgundy }]}>{money(totalItemVal)}</Text>
                      </View>
                    </View>

                    {/* Supplier Box if present */}
                    {item.supplier ? (
                      <View style={styles.supplierRow}>
                        <Ionicons name="business-outline" size={14} color={BRAND.muted} style={{ marginRight: 6 }} />
                        <Text style={styles.supplierName} numberOfLines={1}>
                          {item.supplier}
                        </Text>
                        {item.supplierPhone ? (
                          <TouchableOpacity
                            style={styles.supplierCallBtn}
                            onPress={() => handleContactSupplier(item.supplierPhone)}
                          >
                            <Ionicons name="logo-whatsapp" size={13} color="#25D366" />
                            <Text style={styles.supplierCallText}>WhatsApp</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Quick Action Buttons */}
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        style={styles.quickMovementBtn}
                        onPress={() => handleOpenMovement(item, 'receive')}
                      >
                        <Ionicons name="add-circle-outline" size={16} color={BRAND.burgundy} />
                        <Text style={styles.quickMovementBtnText}>Stock In (+)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.quickUsageBtn}
                        onPress={() => handleOpenMovement(item, 'usage')}
                      >
                        <Ionicons name="remove-circle-outline" size={16} color="#D32F2F" />
                        <Text style={styles.quickUsageBtnText}>Usage (-)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleOpenEdit(item)}
                        accessibilityLabel="Edit Item"
                      >
                        <Ionicons name="pencil-outline" size={17} color={BRAND.ink} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.iconActionBtn, { backgroundColor: BRAND.dangerSoft }]}
                        onPress={() => handleDelete(item)}
                        accessibilityLabel="Delete Item"
                      >
                        <Ionicons name="trash-outline" size={17} color={BRAND.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* TAB 2: STOCK MOVEMENTS LOG */}
      {activeTab === 'movements' && (
        <View>
          {/* Movement Filter Chips */}
          <View style={styles.statusFilterRow}>
            {(['all', 'receive', 'usage', 'wastage', 'adjust'] as const).map((mType) => (
              <TouchableOpacity
                key={mType}
                style={[styles.statusFilterBtn, movementFilter === mType && styles.statusFilterBtnActive]}
                onPress={() => setMovementFilter(mType)}
              >
                <Text
                  style={[styles.statusFilterBtnText, movementFilter === mType && styles.statusFilterBtnTextActive]}
                >
                  {mType === 'all'
                    ? 'All Logs'
                    : mType === 'receive'
                    ? '📥 Stock Received'
                    : mType === 'usage'
                    ? '🍳 Kitchen Usage'
                    : mType === 'wastage'
                    ? '🗑️ Wastage'
                    : '⚖️ Adjustments'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredMovements.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={48} color={BRAND.muted} />
              <Text style={styles.emptyTitle}>No Stock Movements Recorded</Text>
              <Text style={styles.emptyDesc}>
                Whenever staff receives goods or kitchen consumes ingredients, logs will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.movementsList}>
              {filteredMovements.map((m) => {
                const isPositive = (m.delta ?? 0) > 0;
                const typeConfig = getMovementConfig(m.type);

                return (
                  <View key={m.id} style={styles.movementCard}>
                    <View style={[styles.movementIconBox, { backgroundColor: typeConfig.bg }]}>
                      <Ionicons name={typeConfig.icon as any} size={20} color={typeConfig.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.movementHeader}>
                        <Text style={styles.movementItemName}>{m.itemName}</Text>
                        <Text
                          style={[
                            styles.movementDelta,
                            { color: isPositive ? BRAND.success : m.type === 'wastage' ? BRAND.danger : BRAND.info },
                          ]}
                        >
                          {isPositive ? `+${m.qty}` : `-${m.qty}`}
                        </Text>
                      </View>

                      <View style={styles.movementMetaRow}>
                        <View style={[styles.movementTypeBadge, { backgroundColor: typeConfig.bg }]}>
                          <Text style={[styles.movementTypeBadgeText, { color: typeConfig.color }]}>
                            {typeConfig.label}
                          </Text>
                        </View>
                        <Text style={styles.movementTime}>
                          {formatDay(m.at)} • {formatTime(m.at)}
                        </Text>
                      </View>

                      {m.note ? (
                        <Text style={styles.movementNote}>
                          <Ionicons name="document-text-outline" size={13} color={BRAND.muted} /> {`"${m.note}"`}
                        </Text>
                      ) : null}

                      {m.by ? (
                        <Text style={styles.movementStaff}>
                          Recorded by: <Text style={{ fontWeight: '700', color: BRAND.ink }}>{m.by}</Text>
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* TAB 3: READY DISHES MENU STOCK */}
      {activeTab === 'dishes' && (
        <View>
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={20} color={BRAND.burgundy} style={{ marginRight: 8 }} />
            <Text style={styles.infoBannerText}>
              Keep track of prepared food & limited daily specials. Set ready portions so POS auto-warns when items run low.
            </Text>
          </View>

          <View style={styles.itemsGrid}>
            {trackedDishes.map((dish) => {
              const isTracked = !!dish.trackStock;
              const stockQty = dish.stockQty || 0;
              const cost = dish.costPrice || 0;
              const margin = dish.price > 0 && cost > 0 ? Math.round(((dish.price - cost) / dish.price) * 100) : null;

              return (
                <View key={dish.id} style={styles.dishCard}>
                  <View style={styles.dishCardHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.dishTitle}>{dish.name}</Text>
                      <Text style={styles.dishCategory}>{dish.category}</Text>
                    </View>
                    <View style={styles.dishPriceBox}>
                      <Text style={styles.dishPrice}>{money(dish.price)}</Text>
                      {margin !== null ? (
                        <Text style={styles.dishMargin}>{margin}% Margin</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.dishStockControlRow}>
                    <View>
                      <Text style={styles.dishStockLabel}>Ready Portions Available</Text>
                      <Text
                        style={[
                          styles.dishStockValue,
                          stockQty <= 0 && isTracked && { color: BRAND.danger },
                          stockQty > 0 && stockQty <= 5 && isTracked && { color: BRAND.warn },
                        ]}
                      >
                        {isTracked ? `${stockQty} Left` : 'Unlimited / Untracked'}
                      </Text>
                    </View>

                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => handleAdjustDishStock(dish, -1)}
                      >
                        <Ionicons name="remove" size={18} color={BRAND.ink} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: BRAND.burgundy }]}
                        onPress={() => handleAdjustDishStock(dish, 1)}
                      >
                        <Ionicons name="add" size={18} color="#FFF" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.stepperBtn, { backgroundColor: BRAND.goldSoft }]}
                        onPress={() => handleAdjustDishStock(dish, 5)}
                      >
                        <Text style={{ fontWeight: '800', color: BRAND.burgundy, fontSize: 13 }}>+5</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD NEW INVENTORY ITEM */}
      {/* ========================================================================= */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Raw Material / Ingredient</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Item Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Boneless Chicken, Basmati Rice, Cooking Oil"
                value={formName}
                onChangeText={setFormName}
              />

              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {INVENTORY_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.formChip, formCategory === cat && styles.formChipActive]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <Text style={[styles.formChipText, formCategory === cat && styles.formChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Measurement Unit</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.formChip, formUnit === u && styles.formChipActive]}
                    onPress={() => setFormUnit(u)}
                  >
                    <Text style={[styles.formChipText, formUnit === u && styles.formChipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Initial Stock ({formUnit})</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 25"
                    keyboardType="numeric"
                    value={formStock}
                    onChangeText={setFormStock}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Low Stock Alert ({formUnit})</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 10"
                    keyboardType="numeric"
                    value={formThreshold}
                    onChangeText={setFormThreshold}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Unit Cost (Rs. per {formUnit})</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 780"
                keyboardType="numeric"
                value={formCost}
                onChangeText={setFormCost}
              />

              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Supplier / Vendor Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Al-Madina Poultry"
                    value={formSupplier}
                    onChangeText={setFormSupplier}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Supplier Phone / WhatsApp</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 03001234567"
                    keyboardType="phone-pad"
                    value={formSupplierPhone}
                    onChangeText={setFormSupplierPhone}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveAdd}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSaveBtnText}>Save Ingredient</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: QUICK STOCK MOVEMENT (STOCK IN / USAGE / WASTAGE) */}
      {/* ========================================================================= */}
      <Modal visible={showMovementModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Record Stock Movement</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedItem?.name} (Current: {selectedItem?.stock} {selectedItem?.unit})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowMovementModal(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <View style={styles.movementTypeSelector}>
              <TouchableOpacity
                style={[styles.typeSelectBtn, movementType === 'receive' && styles.typeSelectBtnReceive]}
                onPress={() => setMovementType('receive')}
              >
                <Ionicons name="arrow-down-circle" size={18} color={movementType === 'receive' ? '#FFF' : BRAND.success} />
                <Text style={[styles.typeSelectText, movementType === 'receive' && styles.typeSelectTextActive]}>
                  Receive (+)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeSelectBtn, movementType === 'usage' && styles.typeSelectBtnUsage]}
                onPress={() => setMovementType('usage')}
              >
                <Ionicons name="restaurant" size={18} color={movementType === 'usage' ? '#FFF' : BRAND.info} />
                <Text style={[styles.typeSelectText, movementType === 'usage' && styles.typeSelectTextActive]}>
                  Usage (-)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeSelectBtn, movementType === 'wastage' && styles.typeSelectBtnWastage]}
                onPress={() => setMovementType('wastage')}
              >
                <Ionicons name="trash" size={18} color={movementType === 'wastage' ? '#FFF' : BRAND.danger} />
                <Text style={[styles.typeSelectText, movementType === 'wastage' && styles.typeSelectTextActive]}>
                  Wastage (-)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeSelectBtn, movementType === 'adjust' && styles.typeSelectBtnAdjust]}
                onPress={() => setMovementType('adjust')}
              >
                <Ionicons name="options" size={18} color={movementType === 'adjust' ? '#FFF' : BRAND.purple} />
                <Text style={[styles.typeSelectText, movementType === 'adjust' && styles.typeSelectTextActive]}>
                  Adjust (=)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>
              {movementType === 'adjust' ? `New Total Stock Count (${selectedItem?.unit}) *` : `Quantity (${selectedItem?.unit}) *`}
            </Text>
            <TextInput
              style={[styles.input, { fontSize: 20, fontWeight: '700' }]}
              placeholder="e.g. 10"
              keyboardType="numeric"
              autoFocus
              value={movementQty}
              onChangeText={setMovementQty}
            />

            <Text style={styles.inputLabel}>Reason / Remarks (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder={
                movementType === 'receive'
                  ? 'e.g. Morning delivery invoice #402'
                  : movementType === 'usage'
                  ? 'e.g. Dinner Karahi prep'
                  : movementType === 'wastage'
                  ? 'e.g. Expired batch or spillage'
                  : 'e.g. Weekly physical inventory audit'
              }
              value={movementNote}
              onChangeText={setMovementNote}
            />

            {/* Impact calculation */}
            {selectedItem && movementQty ? (
              <View style={styles.impactBox}>
                <Text style={styles.impactLabel}>Resulting Stock After Update:</Text>
                <Text style={styles.impactValue}>
                  {movementType === 'receive'
                    ? `${selectedItem.stock + (parseFloat(movementQty) || 0)} ${selectedItem.unit}`
                    : movementType === 'adjust'
                    ? `${parseFloat(movementQty) || 0} ${selectedItem.unit}`
                    : `${Math.max(0, selectedItem.stock - (parseFloat(movementQty) || 0))} ${selectedItem.unit}`}
                </Text>
              </View>
            ) : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowMovementModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveMovement}>
                <Ionicons name="save-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSaveBtnText}>Confirm Movement</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT INVENTORY ITEM */}
      {/* ========================================================================= */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Ingredient Details</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Item Name *</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} />

              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {INVENTORY_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.formChip, formCategory === cat && styles.formChipActive]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <Text style={[styles.formChipText, formCategory === cat && styles.formChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Measurement Unit</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.formChip, formUnit === u && styles.formChipActive]}
                    onPress={() => setFormUnit(u)}
                  >
                    <Text style={[styles.formChipText, formUnit === u && styles.formChipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Current Stock ({formUnit})</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formStock}
                    onChangeText={setFormStock}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Low Stock Alert ({formUnit})</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formThreshold}
                    onChangeText={setFormThreshold}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Unit Cost (Rs. per {formUnit})</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={formCost}
                onChangeText={setFormCost}
              />

              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Supplier Name</Text>
                  <TextInput style={styles.input} value={formSupplier} onChangeText={setFormSupplier} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Supplier Phone</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="phone-pad"
                    value={formSupplierPhone}
                    onChangeText={setFormSupplierPhone}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveEdit}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSaveBtnText}>Update Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEFF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND.ink,
  },
  headerSubtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: BRAND.burgundy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 22,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: BRAND.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.muted,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: BRAND.goldSoft,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.muted,
  },
  tabBtnTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  searchSection: {
    marginBottom: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: BRAND.ink,
  },
  categoriesScroll: {
    marginBottom: 12,
  },
  categoriesContent: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  categoryChipActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.text,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  statusFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  statusFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  statusFilterBtnActive: {
    backgroundColor: BRAND.burgundySoft,
    borderColor: BRAND.burgundy,
  },
  statusFilterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.text,
  },
  statusFilterBtnTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  itemCard: {
    flex: 1,
    minWidth: 320,
    maxWidth: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND.ink,
    marginBottom: 4,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryTag: {
    backgroundColor: BRAND.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  unitTag: {
    fontSize: 12,
    color: BRAND.muted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stockDetailsBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F2F2F7',
  },
  stockStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stockStatLabel: {
    fontSize: 11,
    color: BRAND.muted,
    fontWeight: '600',
    marginBottom: 2,
  },
  stockStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.ink,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  valuationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    marginBottom: 10,
  },
  valLabel: {
    fontSize: 11,
    color: BRAND.muted,
    fontWeight: '600',
  },
  valValue: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.ink,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  supplierName: {
    flex: 1,
    fontSize: 12,
    color: BRAND.text,
    fontWeight: '500',
  },
  supplierCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  supplierCallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickMovementBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.goldSoft,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  quickMovementBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  quickUsageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  quickUsageBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    color: BRAND.muted,
    textAlign: 'center',
    maxWidth: 380,
    marginBottom: 16,
  },
  movementsList: {
    gap: 10,
  },
  movementCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    gap: 12,
  },
  movementIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  movementItemName: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.ink,
  },
  movementDelta: {
    fontSize: 16,
    fontWeight: '800',
  },
  movementMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  movementTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  movementTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  movementTime: {
    fontSize: 12,
    color: BRAND.muted,
  },
  movementNote: {
    fontSize: 12,
    color: BRAND.text,
    fontStyle: 'italic',
    marginTop: 2,
  },
  movementStaff: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.goldSoft,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: BRAND.burgundy,
    fontWeight: '600',
    lineHeight: 18,
  },
  dishCard: {
    flex: 1,
    minWidth: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  dishCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dishTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.ink,
  },
  dishCategory: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  dishPriceBox: {
    alignItems: 'flex-end',
  },
  dishPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  dishMargin: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.success,
  },
  dishStockControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 8,
  },
  dishStockLabel: {
    fontSize: 11,
    color: BRAND.muted,
    fontWeight: '600',
  },
  dishStockValue: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.ink,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalCardMobile: {
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND.ink,
  },
  modalSubtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: BRAND.ink,
    marginBottom: 12,
  },
  formRow2: {
    flexDirection: 'row',
    gap: 12,
  },
  formChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
    marginRight: 6,
  },
  formChipActive: {
    backgroundColor: BRAND.burgundy,
  },
  formChipText: {
    fontSize: 12,
    color: BRAND.text,
    fontWeight: '600',
  },
  formChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  movementTypeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  typeSelectBtn: {
    flex: 1,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFF',
    gap: 6,
  },
  typeSelectBtnReceive: {
    backgroundColor: BRAND.success,
    borderColor: BRAND.success,
  },
  typeSelectBtnUsage: {
    backgroundColor: BRAND.info,
    borderColor: BRAND.info,
  },
  typeSelectBtnWastage: {
    backgroundColor: BRAND.danger,
    borderColor: BRAND.danger,
  },
  typeSelectBtnAdjust: {
    backgroundColor: BRAND.purple,
    borderColor: BRAND.purple,
  },
  typeSelectText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.ink,
  },
  typeSelectTextActive: {
    color: '#FFF',
  },
  impactBox: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  impactLabel: {
    fontSize: 12,
    color: BRAND.muted,
    fontWeight: '600',
  },
  impactValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 14,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.muted,
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
