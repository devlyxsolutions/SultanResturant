import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useKitchenStore } from '../store/kitchenStore';
import { useOpsStore } from '../store/opsStore';
import { useRestaurantStore } from '../store/restaurantStore';
import type { ShiftKind } from '../types/kitchen';
import { SHIFT_KIND_META } from '../types/kitchen';

const BRAND = {
  burgundy: '#4A121A',
  citrus: '#E65100',
  orange: '#FF9500',
  gold: '#D5A943',
  green: '#27AE60',
  red: '#E74C3C',
  darkBg: '#121212',
  cardBg: '#1C1C1E',
  cardBorder: '#2C2C2E',
  textLight: '#F5F5F7',
  textMuted: '#8E8E93',
  inputBg: '#2C2C2E',
};

const JUICE_CATEGORIES = [
  'All',
  'Juice & Fruits',
  'Dairy',
  'Beverages',
  'Packaging',
  'Supplies',
];

export default function JuiceHandoverScreen({ backRoute = '/juicebar/kds' }: { backRoute?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Stores
  const { inventory, recordStockMovement } = useOpsStore();
  const { staff } = useRestaurantStore();
  const { user } = useAuthStore();
  const { kitchenSessions, saveDraft, issueSession } = useKitchenStore();

  // Shift & Handover State
  const [selectedShift, setSelectedShift] = useState<ShiftKind>('morning');
  const [selectedBartender, setSelectedBartender] = useState<string>(
    user?.name || 'Juice Master'
  );
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Wastage / Spoilage Modal
  const [wastageModalItem, setWastageModalItem] = useState<typeof inventory[0] | null>(null);
  const [wastageQty, setWastageQty] = useState<string>('');
  const [wastageReason, setWastageReason] = useState<string>('Expired / Spoiled');

  // Handover Note
  const [handoverNote, setHandoverNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filter inventory relevant to Juice Bar & Beverages
  const juiceInventory = useMemo(() => {
    return inventory.filter((item) => {
      const cat = item.category || '';
      const name = item.name.toLowerCase();
      const loc = (item.location || '').toLowerCase();

      // Check if item belongs to Juice Bar domain
      const isJuiceDomain =
        cat === 'Juice & Fruits' ||
        cat === 'Beverages' ||
        name.includes('juice') ||
        name.includes('milk') ||
        name.includes('fruit') ||
        name.includes('lemon') ||
        name.includes('orange') ||
        name.includes('banana') ||
        name.includes('ice') ||
        name.includes('straw') ||
        name.includes('glass') ||
        name.includes('pepsi') ||
        name.includes('syrup') ||
        name.includes('water') ||
        loc.includes('juice');

      if (!isJuiceDomain) return false;

      if (activeCategory !== 'All' && item.category !== activeCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(query) ||
          (item.urduName && item.urduName.toLowerCase().includes(query)) ||
          (item.itemCode && item.itemCode.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [inventory, activeCategory, searchQuery]);

  // Low stock and out of stock counts
  const lowStockCount = juiceInventory.filter((i) => i.stock > 0 && i.stock <= i.threshold).length;
  const outOfStockCount = juiceInventory.filter((i) => i.stock <= 0).length;

  const handleRecordWastage = () => {
    if (!wastageModalItem) return;
    const qty = parseFloat(wastageQty);
    if (isNaN(qty) || qty <= 0) {
      const msg = 'Please enter a valid quantity greater than zero.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid Quantity', msg);
      return;
    }

    if (qty > wastageModalItem.stock) {
      const msg = `Wastage quantity cannot exceed available stock (${wastageModalItem.stock} ${wastageModalItem.unit}).`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Stock Exceeded', msg);
      return;
    }

    recordStockMovement(
      wastageModalItem.id,
      'wastage',
      qty,
      `Juice Bar ${selectedShift} shift: ${wastageReason}`,
      selectedBartender || user?.name || 'Juice Master'
    );

    setWastageModalItem(null);
    setWastageQty('');
    setSuccessBanner(`Logged ${qty} ${wastageModalItem.unit} wastage for ${wastageModalItem.name}!`);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

  const handleSubmitHandover = () => {
    setIsSubmitting(true);

    try {
      // Create session in kitchen store with station: 'juice'
      const res = saveDraft(null, {
        headChef: selectedBartender,
        notes: handoverNote.trim() || `Shift Handover for Juice Corner (${selectedShift} shift)`,
        cashHandedOver: 0,
        createdBy: user?.name || selectedBartender,
        shift: selectedShift,
        station: 'juice' as any,
        lines: juiceInventory.map((item) => ({
          itemId: item.id,
          requested: item.stock,
          par: item.threshold,
          suggested: item.stock,
        })),
      });

      if (res.ok && res.id) {
        issueSession(res.id, user?.name || selectedBartender);
      }

      setSuccessBanner(`✅ Juice Bar ${selectedShift.toUpperCase()} shift handover submitted successfully!`);
      setHandoverNote('');
      setTimeout(() => {
        setSuccessBanner(null);
        router.replace(backRoute as any);
      }, 1800);
    } catch (err) {
      Alert.alert('Handover Error', 'Could not record shift handover. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace(backRoute as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.topIconBadge}>
            <Ionicons name="wine" size={20} color="#FF9500" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle} numberOfLines={1}>Juice Corner Handover & Inventory</Text>
            <Text style={styles.topBarSubtitle} numberOfLines={1}>Fresh Fruits, Dairy, Syrups & Shift Closing</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.returnKdsBtn}
          onPress={() => router.replace(backRoute as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="grid-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.returnKdsText}>Return to KDS</Text>
        </TouchableOpacity>
      </View>

      {/* Success Banner */}
      {successBanner && (
        <View style={styles.successBar}>
          <Ionicons name="checkmark-circle" size={18} color="#27AE60" style={{ marginRight: 8 }} />
          <Text style={styles.successBarText}>{successBanner}</Text>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Metric Cards Row */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { borderColor: '#FF9500' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="basket" size={20} color="#FF9500" />
              <Text style={styles.metricLabel}>Total Tracked Items</Text>
            </View>
            <Text style={styles.metricVal}>{juiceInventory.length}</Text>
            <Text style={styles.metricSub}>Juice & Bar Products</Text>
          </View>

          <View style={[styles.metricCard, lowStockCount > 0 && { borderColor: '#E65100' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="warning" size={20} color="#E65100" />
              <Text style={[styles.metricLabel, { color: '#E65100' }]}>Low Stock Items</Text>
            </View>
            <Text style={[styles.metricVal, { color: '#E65100' }]}>{lowStockCount}</Text>
            <Text style={styles.metricSub}>Needs refill before shift end</Text>
          </View>

          <View style={[styles.metricCard, outOfStockCount > 0 && { borderColor: '#E74C3C' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="alert-circle" size={20} color="#E74C3C" />
              <Text style={[styles.metricLabel, { color: '#E74C3C' }]}>Out of Stock</Text>
            </View>
            <Text style={[styles.metricVal, { color: '#E74C3C' }]}>{outOfStockCount}</Text>
            <Text style={styles.metricSub}>Unavailable for orders</Text>
          </View>
        </View>

        {/* Shift Configuration Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>🍹 Active Juice Bar Shift & Staff</Text>
          <View style={styles.shiftSelectorRow}>
            {(['morning', 'afternoon', 'evening', 'night'] as ShiftKind[]).map((sk) => {
              const meta = SHIFT_KIND_META[sk];
              const isSelected = selectedShift === sk;
              return (
                <TouchableOpacity
                  key={sk}
                  style={[styles.shiftChip, isSelected && styles.shiftChipActive]}
                  onPress={() => setSelectedShift(sk)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={meta.icon as any}
                    size={16}
                    color={isSelected ? '#fff' : BRAND.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.shiftChipText, isSelected && styles.shiftChipTextActive]}>
                    {meta.label} Shift
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.bartenderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Juice Master / Bartender on Duty:</Text>
              <TextInput
                style={styles.textInput}
                value={selectedBartender}
                onChangeText={setSelectedBartender}
                placeholder="Staff name"
                placeholderTextColor="#666"
              />
            </View>
          </View>
        </View>

        {/* Inventory Search & Filters */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search fruits, milk, syrups, cups, soft drinks..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {JUICE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
                onPress={() => setActiveCategory(cat)}
                activeOpacity={0.8}
              >
                <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Inventory Table / Cards */}
        <View style={styles.card}>
          <View style={styles.inventoryHeaderRow}>
            <Text style={styles.cardHeaderTitle}>📦 Juice Bar Live Stock ({juiceInventory.length})</Text>
            <Text style={styles.inventorySubHint}>Tap "Log Waste" to write off damaged fruit/milk</Text>
          </View>

          {juiceInventory.length > 0 ? (
            <View style={styles.tableWrapper}>
              {juiceInventory.map((item) => {
                const isOutOfStock = item.stock <= 0;
                const isLow = !isOutOfStock && item.stock <= item.threshold;

                let statusBadgeBg = 'rgba(39, 174, 96, 0.15)';
                let statusBadgeColor = '#27AE60';
                let statusLabel = 'In Stock';

                if (isOutOfStock) {
                  statusBadgeBg = 'rgba(231, 76, 60, 0.15)';
                  statusBadgeColor = '#E74C3C';
                  statusLabel = 'Out of Stock';
                } else if (isLow) {
                  statusBadgeBg = 'rgba(230, 81, 0, 0.15)';
                  statusBadgeColor = '#FF9500';
                  statusLabel = 'Low Stock';
                }

                return (
                  <View key={item.id} style={styles.inventoryItemRow}>
                    <View style={styles.itemMainCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.itemNameText}>{item.name}</Text>
                        {item.urduName && (
                          <Text style={styles.itemUrduText}>{item.urduName}</Text>
                        )}
                      </View>
                      <View style={styles.itemMetaRow}>
                        <Text style={styles.itemCategoryBadge}>{item.category}</Text>
                        <Text style={styles.itemLocationText}>
                          📍 {item.location || 'Juice Corner'}
                        </Text>
                        <Text style={styles.itemThresholdText}>
                          Min Alert: {item.threshold} {item.unit}
                        </Text>
                      </View>
                    </View>

                    {/* Stock Value & Status */}
                    <View style={styles.stockCol}>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.stockAmountText, (isLow || isOutOfStock) && { color: statusBadgeColor }]}>
                          {item.stock} <Text style={{ fontSize: 13, color: '#aaa' }}>{item.unit}</Text>
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusBadgeBg }]}>
                          <Text style={[styles.statusBadgeText, { color: statusBadgeColor }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>

                      {/* Log Wastage Button */}
                      <TouchableOpacity
                        style={styles.wasteBtn}
                        onPress={() => setWastageModalItem(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={13} color="#E65100" />
                        <Text style={styles.wasteBtnText}>Log Waste</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="search" size={32} color="#555" />
              <Text style={styles.emptyText}>No juice items found matching search</Text>
            </View>
          )}
        </View>

        {/* Handover Notes & Submission */}
        <View style={[styles.card, { marginBottom: 40 }]}>
          <Text style={styles.cardHeaderTitle}>📝 Shift Handover Notes for Incoming Staff</Text>
          <Text style={styles.inputSubLabel}>
            Leave operational notes, prep instructions, or stock notices for the next shift:
          </Text>

          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={handoverNote}
            onChangeText={setHandoverNote}
            placeholder="e.g. Fresh oranges batch received. Blender sanitized. Bananas stock is running low for evening shift..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
          />

          <TouchableOpacity
            style={[styles.submitHandoverBtn, isSubmitting && { opacity: 0.6 }]}
            onPress={handleSubmitHandover}
            disabled={isSubmitting}
            activeOpacity={0.84}
          >
            <Ionicons name="checkmark-done-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.submitHandoverText}>
              {isSubmitting ? 'Submitting Handover...' : 'Submit Juice Corner Handover'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Wastage Log Modal */}
      {wastageModalItem && (
        <Modal transparent animationType="fade" visible={!!wastageModalItem}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Ionicons name="trash" size={22} color="#E65100" />
                <Text style={styles.modalTitle}>Log Fruit / Item Wastage</Text>
                <TouchableOpacity onPress={() => setWastageModalItem(null)}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalItemName}>
                {wastageModalItem.name} ({wastageModalItem.stock} {wastageModalItem.unit} in stock)
              </Text>

              <Text style={styles.inputLabel}>Quantity to write off ({wastageModalItem.unit}):</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={wastageQty}
                onChangeText={setWastageQty}
                placeholder={`e.g. 2`}
                placeholderTextColor="#666"
                autoFocus
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Wastage Reason:</Text>
              <View style={styles.reasonsRow}>
                {['Expired / Spoiled', 'Overripe Fruit', 'Spilled Milk', 'Prep Trim / Loss'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonChip, wastageReason === r && styles.reasonChipActive]}
                    onPress={() => setWastageReason(r)}
                  >
                    <Text style={[styles.reasonText, wastageReason === r && styles.reasonTextActive]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setWastageModalItem(null)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={handleRecordWastage}
                >
                  <Text style={styles.modalConfirmText}>Confirm & Deduct</Text>
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
    backgroundColor: BRAND.darkBg,
  },
  topBar: {
    backgroundColor: '#1E1215',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3A151A',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 220,
    gap: 12,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#2C181C',
  },
  topIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  topBarSubtitle: {
    fontSize: 11,
    color: '#D5A943',
  },
  returnKdsBtn: {
    backgroundColor: '#3A151A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D5A943',
  },
  returnKdsText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  successBar: {
    backgroundColor: 'rgba(39, 174, 96, 0.2)',
    borderColor: '#27AE60',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  successBarText: {
    color: '#2ECC71',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: BRAND.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.cardBorder,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaa',
  },
  metricVal: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginTop: 6,
  },
  metricSub: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  card: {
    backgroundColor: BRAND.cardBg,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BRAND.cardBorder,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  shiftSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  shiftChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  shiftChipActive: {
    backgroundColor: '#E65100',
    borderColor: '#FF9500',
  },
  shiftChipText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '600',
  },
  shiftChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  bartenderRow: {
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 12,
    color: '#ccc',
    fontWeight: '600',
    marginBottom: 6,
  },
  inputSubLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: BRAND.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  searchSection: {
    marginBottom: 16,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.cardBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BRAND.cardBorder,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    marginRight: 8,
  },
  catChipActive: {
    backgroundColor: '#D5A943',
  },
  catChipText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '600',
  },
  catChipTextActive: {
    color: '#121212',
    fontWeight: '700',
  },
  inventoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  inventorySubHint: {
    fontSize: 11,
    color: '#888',
  },
  tableWrapper: {
    gap: 10,
  },
  inventoryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#242426',
    borderWidth: 1,
    borderColor: '#333',
  },
  itemMainCol: {
    flex: 1,
    minWidth: 160,
    paddingRight: 10,
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  itemUrduText: {
    fontSize: 13,
    color: '#D5A943',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  itemCategoryBadge: {
    fontSize: 10,
    backgroundColor: '#333',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    color: '#ccc',
  },
  itemLocationText: {
    fontSize: 11,
    color: '#777',
  },
  itemThresholdText: {
    fontSize: 11,
    color: '#888',
  },
  stockCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stockAmountText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  wasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(230, 81, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E65100',
  },
  wasteBtnText: {
    fontSize: 11,
    color: '#E65100',
    fontWeight: '700',
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#777',
  },
  submitHandoverBtn: {
    backgroundColor: '#27AE60',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 14,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  submitHandoverText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#1E1E20',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    marginLeft: 10,
  },
  modalItemName: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '600',
    marginBottom: 14,
  },
  reasonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  reasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#2C2C2E',
  },
  reasonChipActive: {
    backgroundColor: '#E65100',
  },
  reasonText: {
    fontSize: 11,
    color: '#aaa',
  },
  reasonTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  modalCancelText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#E65100',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
