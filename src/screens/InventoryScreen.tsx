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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePortalBase } from '../hooks/usePortalBase';
import {
  useOpsStore,
  InventoryItem,
  StockMovement,
  StockMovementType,
  INVENTORY_CATEGORIES,
  STORAGE_LOCATIONS,
  getStockLevel,
  getExpiryStatus,
  StockLevel,
  ExpiryStatus,
} from '../store/opsStore';
import { useRestaurantStore, MenuItem } from '../store/restaurantStore';
import { BRAND } from '../constants/brand';
import { money, formatTime, formatDay, toWhatsAppNumber } from '../utils/format';
import { useAuthStore } from '../store/authStore';
import { useRolePermissions } from '../store/roleStore';
import { useSettingsStore } from '../store/settingsStore';
import PermissionDeniedScreen from '../components/PermissionDeniedScreen';
import RoyalDropdown from '../components/RoyalDropdown';
import PaginationControl from '../components/PaginationControl';
import { usePagination } from '../hooks/usePagination';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { broadcastImmediately } from '../services/syncService';
import SultanLogo from '../components/SultanLogo';
import { SULTAN_LOGO_BASE64 } from '../constants/logoBase64';

const UNITS = ['kg', 'Liters', 'bottles', 'packs', 'grams', 'cylinders', 'pcs', 'cartons', 'crates', 'bags', 'Tins'];

interface Props {
  backRoute?: string;
}

type TabType = 'raw' | 'receiving' | 'expiries' | 'lowstock' | 'movements' | 'dishes';

export default function InventoryScreen({ backRoute = '/manager/dashboard' }: Props) {
  const router = useRouter();
  const portalBase = usePortalBase();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const user = useAuthStore((s) => s.user);
  const {
    can,
    canAddInventory,
    canEditInventory,
    canDeleteInventory,
  } = useRolePermissions();

  const systemSettings = useSettingsStore((s) => s.settings);
  const inventory = useOpsStore((s) => s.inventory);
  const storedCategories = useOpsStore((s) => s.inventoryCategories);
  const stockMovements = useOpsStore((s) => s.stockMovements);
  const suppliers = useOpsStore((s) => s.suppliers);
  const addInventoryItem = useOpsStore((s) => s.addInventoryItem);
  const updateInventoryItem = useOpsStore((s) => s.updateInventoryItem);
  const deleteInventoryItem = useOpsStore((s) => s.deleteInventoryItem);
  const addInventoryCategory = useOpsStore((s) => s.addInventoryCategory);
  const renameInventoryCategory = useOpsStore((s) => s.renameInventoryCategory);
  const deleteInventoryCategory = useOpsStore((s) => s.deleteInventoryCategory);
  const recordStockMovement = useOpsStore((s) => s.recordStockMovement);

  const allCategories = useMemo(() => {
    const base = Array.isArray(storedCategories) && storedCategories.length > 0
      ? storedCategories
      : [...INVENTORY_CATEGORIES];
    const used = inventory.map((i) => i.category).filter(Boolean);
    return Array.from(new Set([...base, ...used]));
  }, [storedCategories, inventory]);

  // Menu items from restaurant store for dishes stock tab
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const updateMenuItem = useRestaurantStore((s) => s.updateMenuItem);

  // Live Cloud & Network Sync
  const { isConnected, isConnecting, isOffline, lastSyncedAt, forceSyncNow } = useSyncStatus();
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const handleManualSync = async () => {
    try {
      setIsManualSyncing(true);
      await forceSyncNow();
      broadcastImmediately();
      alertMsg('Live Sync Complete', 'Inventory and stock records are fully synchronised with the cloud hub.');
    } catch (e) {
      alertMsg('Sync Status', 'Synchronisation completed locally.');
    } finally {
      setTimeout(() => setIsManualSyncing(false), 500);
    }
  };

  // UI Navigation Tabs
  const [activeTab, setActiveTab] = useState<TabType>('raw');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<StockLevel | 'all'>('all');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryStatus | 'all'>('all');
  const [movementFilter, setMovementFilter] = useState<StockMovementType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'row' | 'grid'>('row');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [inlineNewCatInput, setInlineNewCatInput] = useState('');
  const [showInlineCatCreator, setShowInlineCatCreator] = useState(false);
  const [editingCatOldName, setEditingCatOldName] = useState<string | null>(null);
  const [editingCatNewName, setEditingCatNewName] = useState('');
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);

  // Add / Edit Form State
  const [formItemCode, setFormItemCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formUrduName, setFormUrduName] = useState('');
  const [formCategory, setFormCategory] = useState<string>(INVENTORY_CATEGORIES[0]);
  const [formLocation, setFormLocation] = useState<string>(STORAGE_LOCATIONS[0]);
  const [formUnit, setFormUnit] = useState('kg');
  const [formStock, setFormStock] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formSupplierPhone, setFormSupplierPhone] = useState('');
  const [formBatchNumber, setFormBatchNumber] = useState('');
  const [formExpiryDays, setFormExpiryDays] = useState('');
  const [formInvoiceNo, setFormInvoiceNo] = useState('');

  // Quick Movement Form State
  const [movementType, setMovementType] = useState<StockMovementType>('receive');
  const [movementQty, setMovementQty] = useState('');
  const [movementNote, setMovementNote] = useState('');

  // Receiving & Invoicing Form State
  const [recItemId, setRecItemId] = useState('');
  const [recSupplier, setRecSupplier] = useState('');
  const [recInvoiceNo, setRecInvoiceNo] = useState('');
  const [recBatchNumber, setRecBatchNumber] = useState('');
  const [recQty, setRecQty] = useState('');
  const [recUnitCost, setRecUnitCost] = useState('');
  const [recExpiryDays, setRecExpiryDays] = useState('30');
  const [recLocation, setRecLocation] = useState<string>(STORAGE_LOCATIONS[0]);
  const [recReceivedBy, setRecReceivedBy] = useState('Storekeeper / Chef');
  const [recNotes, setRecNotes] = useState('');

  // Last Generated GRN State
  const [lastGrn, setLastGrn] = useState<{
    grnNo: string;
    itemName: string;
    itemCode?: string;
    qty: number;
    unit: string;
    unitCost: number;
    totalAmount: number;
    supplier: string;
    invoiceNo: string;
    batchNumber: string;
    location: string;
    receivedBy: string;
    at: number;
  } | null>(null);

  // Analytics & Summary Metrics
  const metrics = useMemo(() => {
    let totalValuation = 0;
    let lowCount = 0;
    let outCount = 0;
    let expiredCount = 0;
    let criticalExpiryCount = 0;
    let warningExpiryCount = 0;
    let totalShortageValue = 0;

    const fallbackThresh = systemSettings.lowStockAlertThreshold || 10;

    inventory.forEach((item) => {
      const val = (item.stock || 0) * (item.costPerUnit || 0);
      totalValuation += val;

      const effThresh = item.threshold ?? fallbackThresh;
      const level = getStockLevel({ ...item, threshold: effThresh });
      if (level === 'out') outCount++;
      else if (level === 'low' || level === 'critical') lowCount++;

      const exp = getExpiryStatus(item);
      if (exp.status === 'expired') expiredCount++;
      else if (exp.status === 'critical') criticalExpiryCount++;
      else if (exp.status === 'warning') warningExpiryCount++;

      if (item.stock < effThresh) {
        const shortage = Math.max(0, effThresh * 1.5 - item.stock);
        totalShortageValue += shortage * (item.costPerUnit || 0);
      }
    });

    return {
      totalValuation,
      totalItems: inventory.length,
      lowCount,
      outCount,
      expiredCount,
      criticalExpiryCount,
      warningExpiryCount,
      totalShortageValue,
    };
  }, [inventory, systemSettings.lowStockAlertThreshold]);

  // Filtered Raw Materials
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.urduName && item.urduName.toLowerCase().includes(q)) ||
        (item.itemCode && item.itemCode.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q) ||
        (item.location && item.location.toLowerCase().includes(q)) ||
        (item.batchNumber && item.batchNumber.toLowerCase().includes(q)) ||
        (item.supplier && item.supplier.toLowerCase().includes(q));

      const matchCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchLocation = selectedLocation === 'All' || item.location === selectedLocation;

      const level = getStockLevel(item);
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'ok' && level === 'ok') ||
        (statusFilter === 'low' && (level === 'low' || level === 'critical')) ||
        (statusFilter === 'out' && level === 'out');

      return matchSearch && matchCategory && matchLocation && matchStatus;
    });
  }, [inventory, searchQuery, selectedCategory, selectedLocation, statusFilter]);

  // Filtered Expiries
  const filteredExpiries = useMemo(() => {
    return inventory
      .map((item) => ({ item, expiry: getExpiryStatus(item) }))
      .filter(({ item, expiry }) => {
        const q = searchQuery.toLowerCase().trim();
        const matchSearch =
          !q ||
          item.name.toLowerCase().includes(q) ||
          (item.itemCode && item.itemCode.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q);

        const matchFilter =
          expiryFilter === 'all'
            ? expiry.status !== 'none'
            : expiry.status === expiryFilter;

        return matchSearch && matchFilter;
      })
      .sort((a, b) => (a.expiry.daysRemaining ?? 999) - (b.expiry.daysRemaining ?? 999));
  }, [inventory, searchQuery, expiryFilter]);

  // Low Stock & Shortage Reorder Items
  const lowStockItems = useMemo(() => {
    const fallbackThresh = systemSettings.lowStockAlertThreshold || 10;
    return inventory
      .filter((item) => {
        const effThresh = item.threshold ?? fallbackThresh;
        const level = getStockLevel({ ...item, threshold: effThresh });
        const matchSearch =
          !searchQuery ||
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.itemCode && item.itemCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase());
        return (level === 'low' || level === 'critical' || level === 'out') && matchSearch;
      })
      .map((item) => {
        const effThresh = item.threshold ?? fallbackThresh;
        const targetStock = Math.ceil(effThresh * 1.5);
        const shortage = Math.max(1, targetStock - item.stock);
        const estCost = shortage * (item.costPerUnit || 0);
        return { item, targetStock, shortage, estCost };
      });
  }, [inventory, searchQuery, systemSettings.lowStockAlertThreshold]);

  // Inward Receiving Logs (Movements of type 'receive')
  const receivingLogs = useMemo(() => {
    return stockMovements
      .filter((m) => m.type === 'receive')
      .filter((m) => {
        const q = searchQuery.toLowerCase().trim();
        return (
          !q ||
          m.itemName.toLowerCase().includes(q) ||
          (m.invoiceNo && m.invoiceNo.toLowerCase().includes(q)) ||
          (m.supplier && m.supplier.toLowerCase().includes(q)) ||
          (m.batchNumber && m.batchNumber.toLowerCase().includes(q)) ||
          (m.itemCode && m.itemCode.toLowerCase().includes(q))
        );
      });
  }, [stockMovements, searchQuery]);

  // All Filtered Stock Movements
  const filteredMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      const matchType = movementFilter === 'all' || m.type === movementFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        m.itemName.toLowerCase().includes(q) ||
        (m.itemCode && m.itemCode.toLowerCase().includes(q)) ||
        (m.note && m.note.toLowerCase().includes(q)) ||
        (m.by && m.by.toLowerCase().includes(q)) ||
        (m.invoiceNo && m.invoiceNo.toLowerCase().includes(q));
      return matchType && matchSearch;
    });
  }, [stockMovements, movementFilter, searchQuery]);

  // Tracked Dishes in Menu
  const trackedDishes = useMemo(() => {
    return menuItems.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      return !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
    });
  }, [menuItems, searchQuery]);

  // Paginations
  const rawPagination = usePagination({
    data: filteredInventory,
    initialPageSize: 12,
  });

  const receivingPagination = usePagination({
    data: receivingLogs,
    initialPageSize: 10,
  });

  const expiriesPagination = usePagination({
    data: filteredExpiries,
    initialPageSize: 10,
  });

  const movementsPagination = usePagination({
    data: filteredMovements,
    initialPageSize: 15,
  });

  // ---------------- Handlers ----------------

  const handleOpenAdd = () => {
    if (!canAddInventory) {
      alertMsg('Permission Denied', 'You do not have permission to add inventory items.');
      return;
    }
    const nextCodeNum = inventory.length + 1;
    setFormItemCode(`SKU-RM-${String(nextCodeNum).padStart(3, '0')}`);
    setFormName('');
    setFormUrduName('');
    setFormCategory(allCategories[0] || INVENTORY_CATEGORIES[0]);
    setShowInlineCatCreator(false);
    setInlineNewCatInput('');
    setFormLocation(STORAGE_LOCATIONS[0]);
    setFormUnit('kg');
    setFormStock('');
    setFormThreshold(String(systemSettings.lowStockAlertThreshold || 10));
    setFormCost('');
    setFormSupplier('');
    setFormSupplierPhone('');
    setFormBatchNumber(`B-${new Date().getFullYear()}-${String(nextCodeNum).padStart(3, '0')}`);
    setFormExpiryDays('30');
    setFormInvoiceNo('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    if (!canEditInventory) {
      alertMsg('Permission Denied', 'You do not have permission to edit inventory items.');
      return;
    }
    setSelectedItem(item);
    setFormItemCode(item.itemCode || '');
    setFormName(item.name);
    setFormUrduName(item.urduName || '');
    setFormCategory(item.category);
    setFormLocation(item.location || STORAGE_LOCATIONS[0]);
    setFormUnit(item.unit);
    setFormStock(item.stock.toString());
    setFormThreshold(item.threshold.toString());
    setFormCost(item.costPerUnit ? item.costPerUnit.toString() : '');
    setFormSupplier(item.supplier || '');
    setFormSupplierPhone(item.supplierPhone || '');
    setFormBatchNumber(item.batchNumber || '');
    setFormInvoiceNo(item.invoiceNo || '');
    if (item.expiryDate) {
      const days = Math.max(0, Math.ceil((item.expiryDate - Date.now()) / 86400000));
      setFormExpiryDays(days.toString());
    } else {
      setFormExpiryDays('');
    }
    setShowEditModal(true);
  };

  const handleOpenMovement = (item: InventoryItem, defaultType: StockMovementType = 'receive') => {
    const allowed = defaultType === 'receive' ? canAddInventory || canEditInventory : canEditInventory;
    if (!allowed) {
      alertMsg('Permission Denied', 'You do not have permission to adjust inventory stock.');
      return;
    }
    setSelectedItem(item);
    setMovementType(defaultType);
    setMovementQty('');
    setMovementNote('');
    setShowMovementModal(true);
  };

  const handleOpenReceiveModal = (presetItem?: InventoryItem) => {
    if (!canAddInventory && !canEditInventory) {
      alertMsg('Permission Denied', 'You do not have permission to receive inventory stock.');
      return;
    }
    const item = presetItem || inventory[0];
    if (item) {
      setRecItemId(item.id);
      setRecSupplier(item.supplier || (suppliers[0]?.name ?? ''));
      setRecUnitCost(item.costPerUnit ? item.costPerUnit.toString() : '');
      setRecLocation(item.location || STORAGE_LOCATIONS[0]);
    }
    setRecInvoiceNo(`INV-${Date.now().toString().slice(-4)}`);
    setRecBatchNumber(`B-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setRecQty('');
    setRecExpiryDays('30');
    setRecReceivedBy('Staff Storekeeper');
    setRecNotes('');
    setShowReceiveModal(true);
  };

  const handleSaveAdd = () => {
    if (!canAddInventory) {
      alertMsg('Permission Denied', 'You do not have permission to add inventory items.');
      return;
    }
    if (!formName.trim()) {
      alertMsg('Missing Name', 'Please enter the item name.');
      return;
    }
    const stockNum = parseFloat(formStock) || 0;
    const defaultThresh = systemSettings.lowStockAlertThreshold || 10;
    const parsedThresh = parseFloat(formThreshold);
    const threshNum = Number.isFinite(parsedThresh) && parsedThresh > 0 ? parsedThresh : defaultThresh;
    const costNum = parseFloat(formCost) || 0;
    const expiryDaysNum = parseInt(formExpiryDays, 10);

    addInventoryItem({
      itemCode: formItemCode.trim() || undefined,
      name: formName.trim(),
      urduName: formUrduName.trim() || undefined,
      category: formCategory,
      location: formLocation,
      unit: formUnit,
      stock: stockNum,
      threshold: threshNum,
      costPerUnit: costNum,
      supplier: formSupplier.trim() || undefined,
      supplierPhone: formSupplierPhone.trim() || undefined,
      batchNumber: formBatchNumber.trim() || undefined,
      invoiceNo: formInvoiceNo.trim() || undefined,
      expiryDate: Number.isFinite(expiryDaysNum) && expiryDaysNum > 0 ? Date.now() + expiryDaysNum * 86400000 : undefined,
    });
    broadcastImmediately();

    setShowAddModal(false);
    alertMsg('Success', `"${formName.trim()}" added to inventory.`);
  };

  const handleSaveEdit = () => {
    if (!canEditInventory) {
      alertMsg('Permission Denied', 'You do not have permission to edit inventory items.');
      return;
    }
    if (!selectedItem) return;
    if (!formName.trim()) {
      alertMsg('Missing Name', 'Please enter the item name.');
      return;
    }

    const stockNum = parseFloat(formStock) || 0;
    const parsedEditThresh = parseFloat(formThreshold);
    const threshNum = Number.isFinite(parsedEditThresh) && parsedEditThresh > 0 ? parsedEditThresh : (systemSettings.lowStockAlertThreshold || 10);
    const costNum = parseFloat(formCost) || 0;
    const expiryDaysNum = parseInt(formExpiryDays, 10);

    updateInventoryItem(selectedItem.id, {
      itemCode: formItemCode.trim() || undefined,
      name: formName.trim(),
      urduName: formUrduName.trim() || undefined,
      category: formCategory,
      location: formLocation,
      unit: formUnit,
      stock: stockNum,
      threshold: threshNum,
      costPerUnit: costNum,
      supplier: formSupplier.trim() || undefined,
      supplierPhone: formSupplierPhone.trim() || undefined,
      batchNumber: formBatchNumber.trim() || undefined,
      invoiceNo: formInvoiceNo.trim() || undefined,
      expiryDate: Number.isFinite(expiryDaysNum) && expiryDaysNum > 0 ? Date.now() + expiryDaysNum * 86400000 : undefined,
    });
    broadcastImmediately();

    setShowEditModal(false);
    alertMsg('Updated', `"${formName.trim()}" updated successfully.`);
  };

  const handleSaveMovement = () => {
    const allowed = movementType === 'receive' ? canAddInventory || canEditInventory : canEditInventory;
    if (!allowed) {
      alertMsg('Permission Denied', 'You do not have permission to adjust inventory stock.');
      return;
    }
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
    broadcastImmediately();

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

  // Submit Goods Receiving & Invoicing
  const handleSaveReceive = () => {
    if (!canAddInventory && !canEditInventory) {
      alertMsg('Permission Denied', 'You do not have permission to receive inventory stock.');
      return;
    }
    const item = inventory.find((i) => i.id === recItemId);
    if (!item) {
      alertMsg('Select Item', 'Please select an item to receive.');
      return;
    }
    const qtyNum = parseFloat(recQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      alertMsg('Invalid Quantity', 'Please enter a valid positive quantity.');
      return;
    }
    const unitCostNum = parseFloat(recUnitCost) || item.costPerUnit || 0;
    const expiryDaysNum = parseInt(recExpiryDays, 10);
    const expiryDate = Number.isFinite(expiryDaysNum) && expiryDaysNum > 0 ? Date.now() + expiryDaysNum * 86400000 : undefined;
    const grnNo = `GRN-${Date.now().toString().slice(-6)}`;
    const totalAmount = qtyNum * unitCostNum;

    // Record Stock Movement with meta
    recordStockMovement(
      item.id,
      'receive',
      qtyNum,
      `Inward Invoice #${recInvoiceNo.trim()} from ${recSupplier.trim() || 'Vendor'}. ${recNotes.trim()}`,
      recReceivedBy.trim() || 'Storekeeper',
      {
        supplier: recSupplier.trim() || item.supplier,
        invoiceNo: recInvoiceNo.trim() || undefined,
        batchNumber: recBatchNumber.trim() || undefined,
        unitCost: unitCostNum,
        expiryDate,
        location: recLocation,
      }
    );
    broadcastImmediately();

    // Save GRN for voucher modal
    const grnData = {
      grnNo,
      itemName: item.name,
      itemCode: item.itemCode,
      qty: qtyNum,
      unit: item.unit,
      unitCost: unitCostNum,
      totalAmount,
      supplier: recSupplier.trim() || item.supplier || 'N/A',
      invoiceNo: recInvoiceNo.trim() || 'N/A',
      batchNumber: recBatchNumber.trim() || 'N/A',
      location: recLocation,
      receivedBy: recReceivedBy.trim() || 'Storekeeper',
      at: Date.now(),
    };
    setLastGrn(grnData);

    setShowReceiveModal(false);
    setShowGrnModal(true);
  };

  // Dispose Expired / Spoiled Batch as Wastage
  const handleDisposeWastage = (item: InventoryItem) => {
    if (!canEditInventory && !canDeleteInventory) {
      alertMsg('Permission Denied', 'You do not have permission to dispose inventory wastage.');
      return;
    }
    const confirmMsg = `Dispose entire or partial stock of "${item.name}" (${item.stock} ${item.unit}) as Spoilage / Wastage?`;
    const executeDispose = () => {
      recordStockMovement(
        item.id,
        'wastage',
        item.stock,
        `Disposed expired / spoiled batch ${item.batchNumber || ''}`,
        'Kitchen Supervisor'
      );
      broadcastImmediately();
      alertMsg('Disposed', `${item.stock} ${item.unit} marked as wastage.`);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) executeDispose();
    } else {
      Alert.alert('Confirm Wastage Write-Off', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Write Off (Dispose)', style: 'destructive', onPress: executeDispose },
      ]);
    }
  };

  // Send WhatsApp Reorder to Supplier
  const handleSendWhatsAppReorder = (item: InventoryItem, shortageQty: number) => {
    const phone = item.supplierPhone;
    const cleanNumber = phone ? toWhatsAppNumber(phone) : '';
    const message = `*SULTAN RESTAURANT - PURCHASE REORDER ORDER*
---------------------------------------
Supplier: *${item.supplier || 'Vendor'}*
Date: ${new Date().toLocaleDateString('en-GB')}

Item Name: *${item.name}* ${item.urduName ? `(${item.urduName})` : ''}
Item Code: *${item.itemCode || 'N/A'}*
Current Stock: ${item.stock} ${item.unit} (LOW STOCK ALERT)
Required Quantity: *${shortageQty} ${item.unit}*
Estimated Price: ${item.costPerUnit ? money(item.costPerUnit) : 'As agreed'} / ${item.unit}

Delivery Address: Sultan Restaurant & BBQ, Main Commercial Area
Please confirm delivery schedule and send invoice copy. Shukriya!`;

    const encoded = encodeURIComponent(message);
    if (cleanNumber) {
      Linking.openURL(`https://wa.me/${cleanNumber}?text=${encoded}`);
    } else {
      // Copy to clipboard or open general WA
      Linking.openURL(`https://wa.me/?text=${encoded}`).catch(() => {
        alertMsg('Reorder Message Generated', message);
      });
    }
  };

  const handleDelete = (item: InventoryItem) => {
    if (!canDeleteInventory) {
      alertMsg('Permission Denied', 'You do not have permission to delete inventory items.');
      return;
    }
    const confirmText = `Are you sure you want to delete "${item.name}" from inventory?`;
    const executeDelete = () => {
      deleteInventoryItem(item.id);
      broadcastImmediately();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(confirmText)) {
        executeDelete();
      }
    } else {
      Alert.alert('Delete Inventory Item', confirmText, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: executeDelete },
      ]);
    }
  };

  const handleAdjustDishStock = (dish: MenuItem, delta: number) => {
    if (!canEditInventory) {
      alertMsg('Permission Denied', 'You do not have permission to adjust inventory stock.');
      return;
    }
    const current = dish.stockQty || 0;
    const next = Math.max(0, current + delta);
    updateMenuItem(dish.id, {
      trackStock: true,
      stockQty: next,
    });
    broadcastImmediately();
  };

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
          label: (item.stock ?? 0) <= 0 ? 'Out of Stock' : 'Critical Low',
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

  if (user?.role !== 'admin' && !can('canAccessInventory')) {
    return (
      <PermissionDeniedScreen
        moduleName="Inventory & Stock Management"
        urduModuleName="اسٹاک اور انوینٹری"
        requiredPermission="canAccessInventory"
        backRoute={backRoute}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={[styles.header, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as any))}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={BRAND.ink} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.headerTitle, isMobile && { fontSize: 18 }]}>Inventory & Stock</Text>
                {!isMobile && (
                  <View style={styles.headerUrduBadge}>
                    <Text style={styles.headerUrduText}>اسٹاک اور انوینٹری کنٹرول</Text>
                  </View>
                )}
              </View>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                SKU Codes, GRN, Expiry Watch & WhatsApp Reorders
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons Strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 2 }}
        >
          {/* Live Cloud / LAN Sync Indicator */}
          <View style={styles.syncStatusGroup}>
            <View
              style={[
                styles.syncStatusPill,
                isConnected
                  ? styles.syncStatusPillConnected
                  : isOffline
                  ? styles.syncStatusPillOffline
                  : styles.syncStatusPillConnecting,
              ]}
            >
              <View
                style={[
                  styles.syncStatusDot,
                  isConnected
                    ? styles.syncStatusDotConnected
                    : isOffline
                    ? styles.syncStatusDotOffline
                    : styles.syncStatusDotConnecting,
                ]}
              />
              <Text
                style={[
                  styles.syncStatusText,
                  isConnected
                    ? styles.syncStatusTextConnected
                    : isOffline
                    ? styles.syncStatusTextOffline
                    : styles.syncStatusTextConnecting,
                ]}
              >
                {isConnected
                  ? `Cloud Synced${lastSyncedAt ? ` • ${formatTime(lastSyncedAt)}` : ''}`
                  : isOffline
                  ? 'Offline'
                  : 'Syncing...'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.syncManualBtn}
              onPress={handleManualSync}
              disabled={isManualSyncing}
              activeOpacity={0.75}
            >
              <Ionicons
                name="sync"
                size={13}
                color={BRAND.burgundy}
                style={isManualSyncing ? ({ transform: [{ rotate: '45deg' }] } as any) : undefined}
              />
              <Text style={styles.syncManualBtnText}>
                {isManualSyncing ? '...' : 'Sync'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BRAND.border }]}
            onPress={() => router.push(`${portalBase}/suppliers` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="bus-outline" size={15} color={BRAND.burgundy} style={{ marginRight: 4 }} />
            <Text style={[styles.addBtnText, { color: BRAND.burgundy }]}>Suppliers</Text>
          </TouchableOpacity>

          {(canAddInventory || canEditInventory) && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#D5A943' }]}
              onPress={() => {
                setNewCategoryInput('');
                setEditingCatOldName(null);
                setShowCategoryModal(true);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="pricetags-outline" size={15} color={BRAND.burgundy} style={{ marginRight: 4 }} />
              <Text style={[styles.addBtnText, { color: BRAND.burgundy }]}>+ Categories ({allCategories.length})</Text>
            </TouchableOpacity>
          )}

          {(canAddInventory || canEditInventory) && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: BRAND.success }]}
              onPress={() => handleOpenReceiveModal()}
              activeOpacity={0.85}
            >
              <Ionicons name="receipt-outline" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.addBtnText}>+ Receive (GRN)</Text>
            </TouchableOpacity>
          )}

          {canAddInventory && (
            <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>+ Add SKU</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* KPI Cards Row (Liquid Glass Info Boxes) */}
      <View style={styles.kpiGrid}>
        <View 
          style={[styles.kpiCard, styles.kpiCardGold]}
          {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(212, 175, 55, 0.22)' }]}>
            <Ionicons name="cash" size={20} color="#B8860B" />
          </View>
          <View>
            <Text style={[styles.kpiLabel, { color: '#854D0E' }]}>Total Asset Valuation</Text>
            <Text style={[styles.kpiValue, { color: '#713F12' }]}>{money(metrics.totalValuation)}</Text>
          </View>
        </View>

        <View 
          style={[styles.kpiCard, styles.kpiCardSapphire]}
          {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(2, 132, 199, 0.2)' }]}>
            <Ionicons name="cube" size={20} color="#0284C7" />
          </View>
          <View>
            <Text style={[styles.kpiLabel, { color: '#075985' }]}>Total SKU Items</Text>
            <Text style={[styles.kpiValue, { color: '#0369A1' }]}>{metrics.totalItems} Items</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.kpiCard, styles.kpiCardAmber]}
          onPress={() => setActiveTab('lowstock')}
          activeOpacity={0.75}
          {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.22)' }]}>
            <Ionicons name="alert-circle" size={22} color="#D97706" />
          </View>
          <View>
            <Text style={[styles.kpiLabel, { color: '#92400E' }]}>Low Stock & Out</Text>
            <Text style={[styles.kpiValue, { color: '#B45309' }]}>
              {metrics.lowCount + metrics.outCount} Items
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.kpiCard, styles.kpiCardRuby]}
          onPress={() => setActiveTab('expiries')}
          activeOpacity={0.75}
          {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
            <Ionicons name="timer" size={20} color="#DC2626" />
          </View>
          <View>
            <Text style={[styles.kpiLabel, { color: '#991B1B' }]}>Expiry Alerts</Text>
            <Text style={[styles.kpiValue, { color: '#B91C1C' }]}>
              {metrics.expiredCount + metrics.criticalExpiryCount} Urgencies
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* 6 Main Navigation Tabs */}
      {isMobile ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingHorizontal: 2 }}
          style={{ marginBottom: 14 }}
        >
          <TouchableOpacity
            style={[styles.tabBtn, { flex: undefined, minWidth: undefined, paddingHorizontal: 14 }, activeTab === 'raw' && styles.tabBtnActive]}
            onPress={() => setActiveTab('raw')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="cube"
              size={15}
              color={activeTab === 'raw' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'raw' && styles.tabBtnTextActive]}>
              Directory ({inventory.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, { flex: undefined, minWidth: undefined, paddingHorizontal: 14 }, activeTab === 'receiving' && styles.tabBtnActive]}
            onPress={() => setActiveTab('receiving')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="receipt"
              size={15}
              color={activeTab === 'receiving' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'receiving' && styles.tabBtnTextActive]}>
              Receiving ({receivingLogs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, { flex: undefined, minWidth: undefined, paddingHorizontal: 14 }, activeTab === 'expiries' && styles.tabBtnActive]}
            onPress={() => setActiveTab('expiries')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="timer"
              size={15}
              color={activeTab === 'expiries' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'expiries' && styles.tabBtnTextActive]}>
              Expiries ({metrics.expiredCount + metrics.criticalExpiryCount + metrics.warningExpiryCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, { flex: undefined, minWidth: undefined, paddingHorizontal: 14 }, activeTab === 'lowstock' && styles.tabBtnActive]}
            onPress={() => setActiveTab('lowstock')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="alert-circle"
              size={15}
              color={activeTab === 'lowstock' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'lowstock' && styles.tabBtnTextActive]}>
              Low Stock ({lowStockItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, { flex: undefined, minWidth: undefined, paddingHorizontal: 14 }, activeTab === 'movements' && styles.tabBtnActive]}
            onPress={() => setActiveTab('movements')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="swap-horizontal"
              size={15}
              color={activeTab === 'movements' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'movements' && styles.tabBtnTextActive]}>
              Logs ({stockMovements.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, { flex: undefined, minWidth: undefined, paddingHorizontal: 14 }, activeTab === 'dishes' && styles.tabBtnActive]}
            onPress={() => setActiveTab('dishes')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="restaurant"
              size={15}
              color={activeTab === 'dishes' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'dishes' && styles.tabBtnTextActive]}>
              Dishes ({trackedDishes.filter((d) => d.trackStock).length})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'raw' && styles.tabBtnActive]}
            onPress={() => setActiveTab('raw')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="cube"
              size={16}
              color={activeTab === 'raw' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'raw' && styles.tabBtnTextActive]}>
              Items Directory ({inventory.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'receiving' && styles.tabBtnActive]}
            onPress={() => setActiveTab('receiving')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="receipt"
              size={16}
              color={activeTab === 'receiving' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'receiving' && styles.tabBtnTextActive]}>
              Receiving & Invoicing ({receivingLogs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'expiries' && styles.tabBtnActive]}
            onPress={() => setActiveTab('expiries')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="timer"
              size={16}
              color={activeTab === 'expiries' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'expiries' && styles.tabBtnTextActive]}>
              Expiries & Shelf-Life ({metrics.expiredCount + metrics.criticalExpiryCount + metrics.warningExpiryCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'lowstock' && styles.tabBtnActive]}
            onPress={() => setActiveTab('lowstock')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="alert-circle"
              size={16}
              color={activeTab === 'lowstock' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'lowstock' && styles.tabBtnTextActive]}>
              Low Stock & Reorders ({lowStockItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'movements' && styles.tabBtnActive]}
            onPress={() => setActiveTab('movements')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="swap-horizontal"
              size={16}
              color={activeTab === 'movements' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'movements' && styles.tabBtnTextActive]}>
              Movement Log ({stockMovements.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'dishes' && styles.tabBtnActive]}
            onPress={() => setActiveTab('dishes')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="restaurant"
              size={16}
              color={activeTab === 'dishes' ? BRAND.burgundy : BRAND.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'dishes' && styles.tabBtnTextActive]}>
              Ready Dishes ({trackedDishes.filter((d) => d.trackStock).length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Global Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={BRAND.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === 'raw'
                ? 'Search SKU code, item name, Urdu name, location, supplier...'
                : activeTab === 'receiving'
                ? 'Search invoice #, supplier, batch #, item...'
                : activeTab === 'expiries'
                ? 'Search expiring items or batches...'
                : activeTab === 'lowstock'
                ? 'Search low stock shortages...'
                : activeTab === 'movements'
                ? 'Search movement history, notes, staff...'
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

      {/* ========================================================================= */}
      {/* TAB 1: RAW INGREDIENTS & ITEMS DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === 'raw' && (
        <View>
          {/* Dual Dropdown Filters: Category & Storage Zone */}
          <View style={styles.filterDropdownRow}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <RoyalDropdown
                label="Filter by Category"
                options={[
                  { label: `All Categories (${inventory.length})`, value: 'All', badge: `${inventory.length}` },
                  ...allCategories.map((cat) => ({
                    label: cat,
                    value: cat,
                    badge: `${inventory.filter((i) => i.category === cat).length}`,
                  })),
                ]}
                value={selectedCategory}
                onSelect={(val) => setSelectedCategory(val)}
                icon="grid-outline"
                searchable
              />
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <RoyalDropdown
                label="Filter by Storage Zone"
                options={[
                  { label: 'All Storage Zones', value: 'All', icon: 'location-outline' as const },
                  ...STORAGE_LOCATIONS.map((loc) => ({
                    label: loc,
                    value: loc,
                    icon: 'file-tray-full-outline' as const,
                  })),
                ]}
                value={selectedLocation}
                onSelect={(val) => setSelectedLocation(val)}
                icon="location-outline"
                searchable
              />
            </View>
          </View>

          {/* Status Filter Chips + View Mode Switcher */}
          <View style={[styles.statusFilterRow, { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {(['all', 'ok', 'low', 'out'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.statusFilterBtn, statusFilter === st && styles.statusFilterBtnActive]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[styles.statusFilterBtnText, statusFilter === st && styles.statusFilterBtnTextActive]}>
                    {st === 'all'
                      ? 'All Stock Levels'
                      : st === 'ok'
                      ? 'In Stock (Safe)'
                      : st === 'low'
                      ? 'Low Stock Warning'
                      : 'Out of Stock'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* View Mode Toggle: Row / Table View (Default) vs Box / Cards View */}
            <View style={styles.viewModeToggleGroup}>
              <TouchableOpacity
                style={[styles.viewModeToggleBtn, viewMode === 'row' && styles.viewModeToggleBtnActive]}
                onPress={() => setViewMode('row')}
                accessibilityLabel="Row / Table View"
                {...(Platform.OS === 'web' ? ({ title: 'Row-wise Table View (1 Row Per Item)' } as any) : {})}
              >
                <Ionicons
                  name="list"
                  size={14}
                  color={viewMode === 'row' ? '#FFFFFF' : '#64748B'}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.viewModeToggleText, viewMode === 'row' && styles.viewModeToggleTextActive]}>
                  Row View (ٹیبل)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.viewModeToggleBtn, viewMode === 'grid' && styles.viewModeToggleBtnActive]}
                onPress={() => setViewMode('grid')}
                accessibilityLabel="Box / Cards View"
                {...(Platform.OS === 'web' ? ({ title: 'Box / Card Grid View' } as any) : {})}
              >
                <Ionicons
                  name="grid"
                  size={13}
                  color={viewMode === 'grid' ? '#FFFFFF' : '#64748B'}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.viewModeToggleText, viewMode === 'grid' && styles.viewModeToggleTextActive]}>
                  Box Cards (باکس)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Items Grid */}
          {filteredInventory.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={48} color={BRAND.muted} />
              <Text style={styles.emptyTitle}>No Inventory Items Found</Text>
              <Text style={styles.emptyDesc}>Try adjusting your search query or add a new ingredient.</Text>
              {canAddInventory && (
                <TouchableOpacity style={styles.addBtn} onPress={handleOpenAdd}>
                  <Ionicons name="add" size={18} color="#FFF" />
                  <Text style={styles.addBtnText}>Add First Item</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : viewMode === 'row' ? (
            <>
              {/* 1 ROW-WISE TABLE VIEW (AS REQUESTED) */}
              <View style={styles.tableWrapper}>
                <ScrollView
                  horizontal={!isMobile}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ minWidth: isMobile ? undefined : 1120, width: '100%' }}
                >
                  <View style={{ width: '100%' }}>
                    {/* Desktop / Tablet Column Headers */}
                    {!isMobile && (
                      <View style={styles.stockTableHeader}>
                        <View style={[styles.thCol, { flex: 2.3, minWidth: 190 }]}>
                          <Text style={styles.thColText}>ITEM & CODE</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.8, minWidth: 150 }]}>
                          <Text style={styles.thColText}>CATEGORY & STORAGE</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 2.1, minWidth: 170 }]}>
                          <Text style={styles.thColText}>CURRENT STOCK / REORDER</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                          <Text style={styles.thColText}>UNIT COST & VALUE</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.7, minWidth: 130 }]}>
                          <Text style={styles.thColText}>SUPPLIER</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.6, minWidth: 125 }]}>
                          <Text style={styles.thColText}>STATUS & EXPIRY</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 2.2, minWidth: 185, alignItems: 'flex-end', paddingRight: 6 }]}>
                          <Text style={styles.thColText}>ACTIONS</Text>
                        </View>
                      </View>
                    )}

                    {/* Table Rows (1 Full Row Per Stock Item) */}
                    <View style={{ gap: 6 }}>
                      {rawPagination.paginatedData.map((item) => {
                        const badge = getStatusBadge(item);
                        const expiry = getExpiryStatus(item);
                        const isLow = item.stock <= item.threshold;
                        const totalItemVal = item.stock * (item.costPerUnit || 0);
                        const percentLeft = Math.min(100, Math.round((item.stock / (item.threshold * 2 || 1)) * 100));

                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.stockTableRow,
                              {
                                borderLeftColor: item.stock <= 0 ? BRAND.danger : isLow ? BRAND.warn : BRAND.success,
                              },
                              isMobile && styles.stockTableRowMobile
                            ]}
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                          >
                            {/* 1. Item & Code */}
                            <View style={[styles.rowCol, { flex: 2.3, minWidth: 190, gap: 2 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                {item.itemCode ? (
                                  <View style={styles.skuBadgeCompact}>
                                    <Text style={styles.skuBadgeCompactText}>{item.itemCode}</Text>
                                  </View>
                                ) : null}
                                <Text style={styles.stockRowCategory}>{item.category}</Text>
                              </View>
                              <Text style={styles.stockRowTitle} numberOfLines={1}>
                                {item.name}
                              </Text>
                              {item.urduName ? (
                                <Text style={styles.stockRowUrdu} numberOfLines={1}>
                                  {item.urduName}
                                </Text>
                              ) : null}
                            </View>

                            {/* 2. Category & Storage */}
                            <View style={[styles.rowCol, { flex: 1.8, minWidth: 150, gap: 3 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="location" size={12} color={BRAND.burgundy} />
                                <Text style={styles.stockRowLocation} numberOfLines={1}>
                                  {item.location || 'Dry Ration Store'}
                                </Text>
                              </View>
                              {item.batchNumber ? (
                                <Text style={styles.stockRowBatch} numberOfLines={1}>
                                  Batch: #{item.batchNumber}
                                </Text>
                              ) : null}
                            </View>

                            {/* 3. Stock Level & Health Bar */}
                            <View style={[styles.rowCol, { flex: 2.1, minWidth: 170, gap: 4 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <Text style={[styles.stockRowQuantity, isLow && { color: badge.text }]}>
                                  {item.stock} <Text style={{ fontSize: 11, fontWeight: '600', color: BRAND.ink }}>{item.unit}</Text>
                                </Text>
                                <Text style={styles.stockRowAlert}>
                                  Alert: {item.threshold} {item.unit}
                                </Text>
                              </View>
                              <View style={styles.stockRowProgressBarBg}>
                                <View
                                  style={[
                                    styles.stockRowProgressBarFill,
                                    {
                                      width: `${percentLeft}%`,
                                      backgroundColor: item.stock <= 0 ? BRAND.danger : isLow ? BRAND.warn : BRAND.success,
                                    },
                                  ]}
                                />
                              </View>
                            </View>

                            {/* 4. Unit Cost & Total Valuation */}
                            <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                              <Text style={styles.stockRowValuation}>{money(totalItemVal)}</Text>
                              <Text style={styles.stockRowCostUnit}>
                                {item.costPerUnit ? money(item.costPerUnit) : 'N/A'}/{item.unit}
                              </Text>
                            </View>

                            {/* 5. Supplier */}
                            <View style={[styles.rowCol, { flex: 1.7, minWidth: 130, gap: 3 }]}>
                              {item.supplier ? (
                                <>
                                  <Text style={styles.stockRowSupplier} numberOfLines={1}>
                                    {item.supplier}
                                  </Text>
                                  {item.supplierPhone ? (
                                    <TouchableOpacity
                                      style={styles.stockRowWhatsAppBtn}
                                      onPress={() => {
                                        const num = toWhatsAppNumber(item.supplierPhone!);
                                        Linking.openURL(`https://wa.me/${num}`);
                                      }}
                                      activeOpacity={0.8}
                                    >
                                      <Ionicons name="logo-whatsapp" size={11} color="#16A34A" />
                                      <Text style={styles.stockRowWhatsAppText}>WhatsApp</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </>
                              ) : (
                                <Text style={{ fontSize: 11, color: BRAND.muted, fontStyle: 'italic' }}>—</Text>
                              )}
                            </View>

                            {/* 6. Status & Expiry */}
                            <View style={[styles.rowCol, { flex: 1.6, minWidth: 125, gap: 3 }]}>
                              <View style={[styles.stockRowStatusPill, { backgroundColor: badge.bg }]}>
                                <Ionicons name={badge.icon as any} size={11} color={badge.text} style={{ marginRight: 3 }} />
                                <Text style={[styles.stockRowStatusText, { color: badge.text }]}>{badge.label}</Text>
                              </View>
                              {expiry.status !== 'none' ? (
                                <View style={[styles.stockRowExpiryPill, { backgroundColor: expiry.bgColor }]}>
                                  <Text style={[styles.stockRowExpiryText, { color: expiry.color }]}>
                                    {expiry.label}
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            {/* 7. Action Buttons */}
                            <View style={[styles.rowCol, { flex: 2.2, minWidth: 185, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }]}>
                              {(canAddInventory || canEditInventory) && (
                                <TouchableOpacity
                                  style={styles.stockRowReceiveBtn}
                                  onPress={() => handleOpenReceiveModal(item)}
                                  activeOpacity={0.8}
                                  {...(Platform.OS === 'web' ? ({ title: 'Receive Stock (GRN)' } as any) : {})}
                                >
                                  <Ionicons name="arrow-down-circle" size={13} color="#FFFFFF" style={{ marginRight: 3 }} />
                                  <Text style={styles.stockRowReceiveText}>Receive</Text>
                                </TouchableOpacity>
                              )}

                              {canEditInventory && (
                                <TouchableOpacity
                                  style={styles.stockRowUsageBtn}
                                  onPress={() => handleOpenMovement(item, 'usage')}
                                  activeOpacity={0.8}
                                  {...(Platform.OS === 'web' ? ({ title: 'Record Kitchen Usage' } as any) : {})}
                                >
                                  <Ionicons name="restaurant" size={12} color="#0284C7" style={{ marginRight: 2 }} />
                                  <Text style={styles.stockRowUsageText}>Usage</Text>
                                </TouchableOpacity>
                              )}

                              {canEditInventory && (
                                <TouchableOpacity
                                  style={styles.stockRowIconBtn}
                                  onPress={() => handleOpenMovement(item, 'adjust')}
                                  accessibilityLabel="Adjust Stock"
                                  {...(Platform.OS === 'web' ? ({ title: 'Adjust Stock / Audit' } as any) : {})}
                                >
                                  <Ionicons name="options-outline" size={13} color="#475569" />
                                </TouchableOpacity>
                              )}

                              {canEditInventory && (
                                <TouchableOpacity
                                  style={styles.stockRowIconBtn}
                                  onPress={() => handleOpenEdit(item)}
                                  accessibilityLabel="Edit Item"
                                  {...(Platform.OS === 'web' ? ({ title: 'Edit SKU' } as any) : {})}
                                >
                                  <Ionicons name="pencil-outline" size={13} color="#475569" />
                                </TouchableOpacity>
                              )}

                              {canDeleteInventory && (
                                <TouchableOpacity
                                  style={[styles.stockRowIconBtn, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                                  onPress={() => handleDelete(item)}
                                  accessibilityLabel="Delete Item"
                                  {...(Platform.OS === 'web' ? ({ title: 'Delete SKU' } as any) : {})}
                                >
                                  <Ionicons name="trash-outline" size={13} color="#DC2626" />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </View>

              <PaginationControl
                currentPage={rawPagination.currentPage}
                totalPages={rawPagination.totalPages}
                pageSize={rawPagination.pageSize}
                totalItems={rawPagination.totalItems}
                pageSizeOptions={[12, 24, 48, 96]}
                onPageChange={rawPagination.goToPage}
                onPageSizeChange={rawPagination.setPageSize}
                itemName="inventory items"
              />
            </>
          ) : (
            <>
              {/* BOX / CARD GRID VIEW (ALTERNATIVE VIEW) */}
              <View style={styles.itemsGrid}>
              {rawPagination.paginatedData.map((item) => {
                const badge = getStatusBadge(item);
                const expiry = getExpiryStatus(item);
                const isLow = item.stock <= item.threshold;
                const totalItemVal = item.stock * (item.costPerUnit || 0);
                const percentLeft = Math.min(100, Math.round((item.stock / (item.threshold * 2 || 1)) * 100));

                return (
                  <View key={item.id} style={styles.itemCard}>
                    {/* Item Card Header */}
                    <View style={styles.itemCardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          {item.itemCode ? (
                            <View style={styles.skuBadge}>
                              <Text style={styles.skuBadgeText}>{item.itemCode}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.categoryTagText}>{item.category}</Text>
                        </View>
                        <Text style={styles.itemCardTitle}>{item.name}</Text>
                        {item.urduName ? <Text style={styles.urduTitle}>{item.urduName}</Text> : null}
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Ionicons
                            name={badge.icon as any}
                            size={12}
                            color={badge.text}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                        </View>
                        {expiry.status !== 'none' ? (
                          <View style={[styles.expiryMiniBadge, { backgroundColor: expiry.bgColor }]}>
                            <Text style={[styles.expiryMiniBadgeText, { color: expiry.color }]}>
                              {expiry.label}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Storage Location & Batch Info */}
                    <View style={styles.locationMetaBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="location" size={13} color={BRAND.burgundy} />
                        <Text style={styles.locationMetaText}>{item.location || 'Dry Ration Store'}</Text>
                      </View>
                      {item.batchNumber ? (
                        <Text style={styles.batchMetaText}>Batch: #{item.batchNumber}</Text>
                      ) : null}
                    </View>

                    {/* Stock Numbers & Progress Bar */}
                    <View style={styles.stockDetailsBox}>
                      <View style={styles.stockStatRow}>
                        <View>
                          <Text style={styles.stockStatLabel}>Current Stock</Text>
                          <Text style={[styles.stockStatValue, isLow && { color: badge.text }]}>
                            {item.stock} <Text style={{ fontSize: 13, fontWeight: '500' }}>{item.unit}</Text>
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.stockStatLabel}>Reorder Alert Level</Text>
                          <Text style={styles.stockStatValue}>
                            {item.threshold} <Text style={{ fontSize: 13, fontWeight: '500' }}>{item.unit}</Text>
                          </Text>
                        </View>
                      </View>

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
                        <Text style={styles.valLabel}>Unit Purchase Cost</Text>
                        <Text style={styles.valValue}>
                          {item.costPerUnit ? money(item.costPerUnit) : 'N/A'}{' '}
                          <Text style={{ fontSize: 11, color: BRAND.muted }}>/{item.unit}</Text>
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.valLabel}>Stock Valuation</Text>
                        <Text style={[styles.valValue, { color: BRAND.burgundy }]}>{money(totalItemVal)}</Text>
                      </View>
                    </View>

                    {/* Supplier Box */}
                    {item.supplier ? (
                      <View style={styles.supplierRow}>
                        <Ionicons name="business-outline" size={14} color={BRAND.muted} style={{ marginRight: 6 }} />
                        <Text style={styles.supplierName} numberOfLines={1}>
                          {item.supplier}
                        </Text>
                        {item.supplierPhone ? (
                          <TouchableOpacity
                            style={styles.supplierCallBtn}
                            onPress={() => {
                              const num = toWhatsAppNumber(item.supplierPhone!);
                              Linking.openURL(`https://wa.me/${num}`);
                            }}
                          >
                            <Ionicons name="logo-whatsapp" size={13} color="#25D366" />
                            <Text style={styles.supplierCallText}>WhatsApp</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Action Buttons */}
                    <View style={styles.cardActionsRow}>
                      {(canAddInventory || canEditInventory) && (
                        <TouchableOpacity
                          style={styles.quickMovementBtn}
                          onPress={() => handleOpenReceiveModal(item)}
                        >
                          <Ionicons name="arrow-down-circle" size={16} color={BRAND.success} />
                          <Text style={[styles.quickMovementBtnText, { color: BRAND.success }]}>Receive</Text>
                        </TouchableOpacity>
                      )}

                      {canEditInventory && (
                        <TouchableOpacity
                          style={styles.quickUsageBtn}
                          onPress={() => handleOpenMovement(item, 'usage')}
                        >
                          <Ionicons name="restaurant" size={15} color={BRAND.info} />
                          <Text style={styles.quickUsageBtnText}>Usage (-)</Text>
                        </TouchableOpacity>
                      )}

                      {canEditInventory && (
                        <TouchableOpacity
                          style={[styles.iconActionBtn, { backgroundColor: '#F3F4F6' }]}
                          onPress={() => handleOpenMovement(item, 'adjust')}
                          accessibilityLabel="Adjust Stock"
                        >
                          <Ionicons name="options-outline" size={16} color={BRAND.ink} />
                        </TouchableOpacity>
                      )}

                      {canEditInventory && (
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => handleOpenEdit(item)}
                          accessibilityLabel="Edit Item"
                        >
                          <Ionicons name="pencil-outline" size={16} color={BRAND.ink} />
                        </TouchableOpacity>
                      )}

                      {canDeleteInventory && (
                        <TouchableOpacity
                          style={[styles.iconActionBtn, { backgroundColor: BRAND.dangerSoft }]}
                          onPress={() => handleDelete(item)}
                          accessibilityLabel="Delete Item"
                        >
                          <Ionicons name="trash-outline" size={16} color={BRAND.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
            <PaginationControl
              currentPage={rawPagination.currentPage}
              totalPages={rawPagination.totalPages}
              pageSize={rawPagination.pageSize}
              totalItems={rawPagination.totalItems}
              pageSizeOptions={[12, 24, 48, 96]}
              onPageChange={rawPagination.goToPage}
              onPageSizeChange={rawPagination.setPageSize}
              itemName="inventory items"
            />
          </>
        )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RECEIVING & INVOICING MODULE */}
      {/* ========================================================================= */}
      {activeTab === 'receiving' && (
        <View>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Goods Receiving & Inward Shipments</Text>
              <Text style={styles.sectionDesc}>
                Log vendor deliveries, inward invoice numbers, batch shelf-life, and print Goods Receipt Notes (GRN).
              </Text>
            </View>
            {(canAddInventory || canEditInventory) && (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: BRAND.success }]}
                onPress={() => handleOpenReceiveModal()}
              >
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Receive New Stock</Text>
              </TouchableOpacity>
            )}
          </View>

          {receivingLogs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={48} color={BRAND.muted} />
              <Text style={styles.emptyTitle}>No Inward Deliveries Recorded</Text>
              <Text style={styles.emptyDesc}>Receive inventory shipments with invoice numbers and batch numbers.</Text>
            </View>
          ) : (
            <>
              <View style={styles.tableWrapper}>
                <ScrollView
                  horizontal={!isMobile}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ minWidth: isMobile ? undefined : 1120, width: '100%' }}
                >
                  <View style={{ width: '100%' }}>
                    {/* Desktop / Tablet Column Headers */}
                    {!isMobile && (
                      <View style={styles.stockTableHeader}>
                        <View style={[styles.thCol, { flex: 2.4, minWidth: 200 }]}>
                          <Text style={styles.thColText}>ITEM & INVOICE / BATCH</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 2.0, minWidth: 170 }]}>
                          <Text style={styles.thColText}>VENDOR & NOTES</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 2.0, minWidth: 170 }]}>
                          <Text style={styles.thColText}>RECEIVED DATE & TIME</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                          <Text style={styles.thColText}>RECEIVED BY</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.9, minWidth: 150 }]}>
                          <Text style={styles.thColText}>INWARD QTY & RATE</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.7, minWidth: 130 }]}>
                          <Text style={styles.thColText}>TOTAL AMOUNT</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.8, minWidth: 140, alignItems: 'flex-end', paddingRight: 6 }]}>
                          <Text style={styles.thColText}>GRN SLIP</Text>
                        </View>
                      </View>
                    )}

                    {/* Table Rows (1 Full Row Per Inward Delivery) */}
                    <View style={{ gap: 6 }}>
                      {receivingPagination.paginatedData.map((m) => {
                        const totalVal = (m.qty || 0) * (m.unitCost || 0);

                        return (
                          <View
                            key={m.id}
                            style={[
                              styles.receivingTableRow,
                              isMobile && styles.receivingTableRowMobile
                            ]}
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                          >
                            {/* 1. Item & Codes */}
                            <View style={[styles.rowCol, { flex: 2.4, minWidth: 200, gap: 2 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                                {m.itemCode ? (
                                  <View style={styles.skuBadgeCompact}>
                                    <Text style={styles.skuBadgeCompactText}>{m.itemCode}</Text>
                                  </View>
                                ) : null}
                                {m.invoiceNo ? (
                                  <View style={[styles.skuBadgeCompact, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]}>
                                    <Text style={[styles.skuBadgeCompactText, { color: '#6D28D9' }]}>Inv: {m.invoiceNo}</Text>
                                  </View>
                                ) : null}
                                {m.batchNumber ? (
                                  <View style={[styles.skuBadgeCompact, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                                    <Text style={[styles.skuBadgeCompactText, { color: '#B45309' }]}>Batch: {m.batchNumber}</Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text style={styles.stockRowTitle} numberOfLines={1}>
                                {m.itemName}
                              </Text>
                            </View>

                            {/* 2. Vendor & Notes */}
                            <View style={[styles.rowCol, { flex: 2.0, minWidth: 170, gap: 2 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="business" size={12} color={BRAND.burgundy} />
                                <Text style={styles.stockRowLocation} numberOfLines={1}>
                                  {m.supplier || 'Direct Vendor'}
                                </Text>
                              </View>
                              {m.note ? (
                                <Text style={styles.receivingRowNote} numberOfLines={1}>
                                  {m.note}
                                </Text>
                              ) : null}
                            </View>

                            {/* 3. Received Date & Time */}
                            <View style={[styles.rowCol, { flex: 2.0, minWidth: 170, gap: 2 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="calendar-outline" size={12} color="#64748B" />
                                <Text style={styles.receivingRowDate}>{formatDay(m.at)}</Text>
                              </View>
                              <Text style={styles.receivingRowTime}>{formatTime(m.at)}</Text>
                            </View>

                            {/* 4. Received By */}
                            <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="person-outline" size={12} color="#64748B" />
                                <Text style={styles.receivingRowStaff} numberOfLines={1}>
                                  {m.by || 'Storekeeper'}
                                </Text>
                              </View>
                            </View>

                            {/* 5. Inward Qty & Rate */}
                            <View style={[styles.rowCol, { flex: 1.9, minWidth: 150, gap: 2 }]}>
                              <Text style={styles.receivingRowQty}>
                                +{m.qty} <Text style={{ fontSize: 11, fontWeight: '600', color: '#15803D' }}>units</Text>
                              </Text>
                              <Text style={styles.stockRowCostUnit}>
                                @ {m.unitCost ? money(m.unitCost) : 'As per PO'}
                              </Text>
                            </View>

                            {/* 6. Total Amount */}
                            <View style={[styles.rowCol, { flex: 1.7, minWidth: 130, gap: 2 }]}>
                              <Text style={styles.receivingRowTotal}>
                                {totalVal > 0 ? money(totalVal) : '—'}
                              </Text>
                            </View>

                            {/* 7. Action Button: View GRN */}
                            <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }]}>
                              <TouchableOpacity
                                style={styles.receivingRowGrnBtn}
                                onPress={() => {
                                  setLastGrn({
                                    grnNo: `GRN-${m.id.slice(-6).toUpperCase()}`,
                                    itemName: m.itemName,
                                    itemCode: m.itemCode,
                                    qty: m.qty,
                                    unit: '',
                                    unitCost: m.unitCost || 0,
                                    totalAmount: (m.qty || 0) * (m.unitCost || 0),
                                    supplier: m.supplier || 'Vendor',
                                    invoiceNo: m.invoiceNo || 'N/A',
                                    batchNumber: m.batchNumber || 'N/A',
                                    location: 'Kitchen Store',
                                    receivedBy: m.by || 'Storekeeper',
                                    at: m.at,
                                  });
                                  setShowGrnModal(true);
                                }}
                                activeOpacity={0.8}
                                {...(Platform.OS === 'web' ? ({ title: 'View Goods Receipt Note (GRN)' } as any) : {})}
                              >
                                <Ionicons name="document-text-outline" size={13} color={BRAND.burgundy} style={{ marginRight: 4 }} />
                                <Text style={styles.receivingRowGrnText}>GRN Slip</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </View>
            <PaginationControl
              currentPage={receivingPagination.currentPage}
              totalPages={receivingPagination.totalPages}
              pageSize={receivingPagination.pageSize}
              totalItems={receivingPagination.totalItems}
              onPageChange={receivingPagination.goToPage}
              onPageSizeChange={receivingPagination.setPageSize}
              itemName="inward shipments"
            />
          </>
        )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EXPIRIES & SHELF-LIFE MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'expiries' && (
        <View>
          {/* Expiry Header & Filter Chips */}
          <View style={styles.expiryKpiRow}>
            <TouchableOpacity
              style={[
                styles.expiryKpiCard,
                { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
                expiryFilter === 'expired' && { borderWidth: 2 },
              ]}
              onPress={() => setExpiryFilter(expiryFilter === 'expired' ? 'all' : 'expired')}
            >
              <Text style={[styles.expiryKpiCount, { color: '#DC2626' }]}>{metrics.expiredCount}</Text>
              <Text style={[styles.expiryKpiLabel, { color: '#B91C1C' }]}>Expired (Danger!)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.expiryKpiCard,
                { backgroundColor: '#FFEDD5', borderColor: '#EA580C' },
                expiryFilter === 'critical' && { borderWidth: 2 },
              ]}
              onPress={() => setExpiryFilter(expiryFilter === 'critical' ? 'all' : 'critical')}
            >
              <Text style={[styles.expiryKpiCount, { color: '#EA580C' }]}>{metrics.criticalExpiryCount}</Text>
              <Text style={[styles.expiryKpiLabel, { color: '#C2410C' }]}>Critical (≤ 3 Days)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.expiryKpiCard,
                { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
                expiryFilter === 'warning' && { borderWidth: 2 },
              ]}
              onPress={() => setExpiryFilter(expiryFilter === 'warning' ? 'all' : 'warning')}
            >
              <Text style={[styles.expiryKpiCount, { color: '#D97706' }]}>{metrics.warningExpiryCount}</Text>
              <Text style={[styles.expiryKpiLabel, { color: '#B45309' }]}>Warning (≤ 7 Days)</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Bar */}
          <View style={styles.statusFilterRow}>
            {(['all', 'expired', 'critical', 'warning', 'fresh'] as const).map((ef) => (
              <TouchableOpacity
                key={ef}
                style={[styles.statusFilterBtn, expiryFilter === ef && styles.statusFilterBtnActive]}
                onPress={() => setExpiryFilter(ef)}
              >
                <Text style={[styles.statusFilterBtnText, expiryFilter === ef && styles.statusFilterBtnTextActive]}>
                  {ef === 'all'
                    ? 'All Dated Batches'
                    : ef === 'expired'
                    ? 'Expired Only'
                    : ef === 'critical'
                    ? 'Urgent (3d)'
                    : ef === 'warning'
                    ? 'Within 7 Days'
                    : 'Fresh'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredExpiries.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={48} color={BRAND.success} />
              <Text style={styles.emptyTitle}>No Expiry Issues Found</Text>
              <Text style={styles.emptyDesc}>All tracked raw ingredients and batches are fresh and within shelf-life.</Text>
            </View>
          ) : (
            <>
              <View style={styles.tableWrapper}>
                <ScrollView
                  horizontal={!isMobile}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ minWidth: isMobile ? undefined : 1120, width: '100%' }}
                >
                  <View style={{ width: '100%' }}>
                    {/* Desktop / Tablet Column Headers */}
                    {!isMobile && (
                      <View style={styles.stockTableHeader}>
                        <View style={[styles.thCol, { flex: 2.3, minWidth: 190 }]}>
                          <Text style={styles.thColText}>ITEM & CODE</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 2.0, minWidth: 170 }]}>
                          <Text style={styles.thColText}>STORAGE & BATCH</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                          <Text style={styles.thColText}>AT-RISK STOCK</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 2.1, minWidth: 170 }]}>
                          <Text style={styles.thColText}>EXPIRY DATE & STATUS</Text>
                        </View>
                        <View style={[styles.thCol, { flex: 2.4, minWidth: 200, alignItems: 'flex-end', paddingRight: 6 }]}>
                          <Text style={styles.thColText}>ACTIONS</Text>
                        </View>
                      </View>
                    )}

                    {/* Table Rows (1 Full Row Per Expiry Item) */}
                    <View style={{ gap: 6 }}>
                      {expiriesPagination.paginatedData.map(({ item, expiry }) => {
                        const isExpired = expiry.status === 'expired';
                        const isCritical = expiry.status === 'critical';
                        const expiryBorderColor = isExpired ? '#EF4444' : isCritical ? '#F97316' : expiry.status === 'warning' ? '#F59E0B' : '#10B981';

                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.stockTableRow,
                              { borderLeftColor: expiryBorderColor },
                              isMobile && styles.stockTableRowMobile
                            ]}
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                          >
                            {/* 1. Item & Code */}
                            <View style={[styles.rowCol, { flex: 2.3, minWidth: 190, gap: 2 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                {item.itemCode ? (
                                  <View style={styles.skuBadgeCompact}>
                                    <Text style={styles.skuBadgeCompactText}>{item.itemCode}</Text>
                                  </View>
                                ) : null}
                                <Text style={styles.stockRowCategory}>{item.category}</Text>
                              </View>
                              <Text style={styles.stockRowTitle} numberOfLines={1}>
                                {item.name}
                              </Text>
                              {item.urduName ? (
                                <Text style={styles.stockRowUrdu} numberOfLines={1}>
                                  {item.urduName}
                                </Text>
                              ) : null}
                            </View>

                            {/* 2. Storage Location & Batch */}
                            <View style={[styles.rowCol, { flex: 2.0, minWidth: 170, gap: 3 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="location" size={12} color={BRAND.burgundy} />
                                <Text style={styles.stockRowLocation} numberOfLines={1}>
                                  {item.location || 'Dry Ration Store'}
                                </Text>
                              </View>
                              {item.batchNumber ? (
                                <Text style={styles.stockRowBatch} numberOfLines={1}>
                                  Batch: #{item.batchNumber}
                                </Text>
                              ) : null}
                            </View>

                            {/* 3. At-Risk Stock */}
                            <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                              <Text style={[styles.stockRowQuantity, isExpired && { color: '#DC2626' }]}>
                                {item.stock} <Text style={{ fontSize: 11, fontWeight: '600', color: BRAND.ink }}>{item.unit}</Text>
                              </Text>
                              <Text style={{ fontSize: 10.5, color: '#64748B' }}>
                                Unit Cost: {item.costPerUnit ? money(item.costPerUnit) : 'N/A'}
                              </Text>
                            </View>

                            {/* 4. Expiry Date & Urgency Badge */}
                            <View style={[styles.rowCol, { flex: 2.1, minWidth: 170, gap: 3 }]}>
                              <View style={[styles.stockRowExpiryPill, { backgroundColor: expiry.bgColor }]}>
                                <Ionicons
                                  name={isExpired ? 'alert-circle' : 'timer'}
                                  size={11}
                                  color={expiry.color}
                                  style={{ marginRight: 3 }}
                                />
                                <Text style={[styles.stockRowExpiryText, { color: expiry.color }]}>
                                  {expiry.label}
                                </Text>
                              </View>
                              {item.expiryDate ? (
                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#475569' }}>
                                  Exp: {new Date(item.expiryDate).toLocaleDateString('en-GB')}
                                </Text>
                              ) : null}
                            </View>

                            {/* 5. Actions */}
                            <View style={[styles.rowCol, { flex: 2.4, minWidth: 200, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }]}>
                              {canEditInventory && (
                                <TouchableOpacity
                                  style={[styles.stockRowUsageBtn, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]}
                                  onPress={() => handleOpenMovement(item, 'usage')}
                                  activeOpacity={0.8}
                                  {...(Platform.OS === 'web' ? ({ title: 'Use Immediately in Kitchen' } as any) : {})}
                                >
                                  <Ionicons name="restaurant" size={12} color="#6D28D9" style={{ marginRight: 3 }} />
                                  <Text style={[styles.stockRowUsageText, { color: '#6D28D9' }]}>Use Now</Text>
                                </TouchableOpacity>
                              )}

                              {(canEditInventory || canDeleteInventory) && (
                                <TouchableOpacity
                                  style={[styles.stockRowReceiveBtn, { backgroundColor: '#DC2626' }]}
                                  onPress={() => handleDisposeWastage(item)}
                                  activeOpacity={0.8}
                                  {...(Platform.OS === 'web' ? ({ title: 'Write off as Kitchen Spoilage / Wastage' } as any) : {})}
                                >
                                  <Ionicons name="trash-outline" size={12} color="#FFFFFF" style={{ marginRight: 3 }} />
                                  <Text style={styles.stockRowReceiveText}>Dispose</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </View>
            <PaginationControl
              currentPage={expiriesPagination.currentPage}
              totalPages={expiriesPagination.totalPages}
              pageSize={expiriesPagination.pageSize}
              totalItems={expiriesPagination.totalItems}
              pageSizeOptions={[12, 24, 48]}
              onPageChange={expiriesPagination.goToPage}
              onPageSizeChange={expiriesPagination.setPageSize}
              itemName="dated batches"
            />
          </>
        )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LOW STOCK & AUTOMATED REORDERS */}
      {/* ========================================================================= */}
      {activeTab === 'lowstock' && (
        <View>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Automated Shortage & Reorder Control</Text>
              <Text style={styles.sectionDesc}>
                Items at or below reorder threshold. Generate instant WhatsApp purchase orders or POs.
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.kpiLabel}>Est. Reorder Budget</Text>
              <Text style={[styles.kpiValue, { color: BRAND.burgundy }]}>{money(metrics.totalShortageValue)}</Text>
            </View>
          </View>

          {lowStockItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="shield-checkmark-outline" size={48} color={BRAND.success} />
              <Text style={styles.emptyTitle}>All Stocks Healthy</Text>
              <Text style={styles.emptyDesc}>No ingredients are currently below their reorder threshold limit.</Text>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {lowStockItems.map(({ item, targetStock, shortage, estCost }) => {
                const isOut = item.stock <= 0;

                return (
                  <View key={item.id} style={[styles.reorderCard, isOut && { borderLeftColor: BRAND.danger }]}>
                    <View style={styles.reorderCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          {item.itemCode ? (
                            <View style={styles.skuBadge}>
                              <Text style={styles.skuBadgeText}>{item.itemCode}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.categoryTagText}>{item.category}</Text>
                        </View>
                        <Text style={styles.itemCardTitle}>{item.name}</Text>
                        {item.urduName ? <Text style={styles.urduTitle}>{item.urduName}</Text> : null}
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: isOut ? BRAND.dangerSoft : BRAND.warnSoft },
                        ]}
                      >
                        <Ionicons
                          name={isOut ? 'close-circle' : 'alert-circle'}
                          size={13}
                          color={isOut ? BRAND.danger : BRAND.warn}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.statusBadgeText, { color: isOut ? BRAND.danger : BRAND.warn }]}>
                          {isOut ? 'OUT OF STOCK' : 'LOW STOCK'}
                        </Text>
                      </View>
                    </View>

                    {/* Shortage Calculator Grid */}
                    <View style={styles.shortageGrid}>
                      <View style={styles.shortageCol}>
                        <Text style={styles.shortageLabel}>Current Stock</Text>
                        <Text style={[styles.shortageVal, { color: isOut ? BRAND.danger : BRAND.warn }]}>
                          {item.stock} {item.unit}
                        </Text>
                      </View>

                      <View style={styles.shortageCol}>
                        <Text style={styles.shortageLabel}>Threshold Limit</Text>
                        <Text style={styles.shortageVal}>
                          {item.threshold} {item.unit}
                        </Text>
                      </View>

                      <View style={styles.shortageCol}>
                        <Text style={styles.shortageLabel}>Suggested Reorder</Text>
                        <Text style={[styles.shortageVal, { color: BRAND.burgundy, fontWeight: '800' }]}>
                          +{shortage} {item.unit}
                        </Text>
                      </View>

                      <View style={styles.shortageCol}>
                        <Text style={styles.shortageLabel}>Est. Cost</Text>
                        <Text style={[styles.shortageVal, { color: BRAND.ink }]}>{money(estCost)}</Text>
                      </View>
                    </View>

                    {/* Preferred Supplier Info */}
                    <View style={styles.reorderSupplierRow}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="bus-outline" size={15} color={BRAND.muted} />
                        <Text style={styles.reorderSupplierText}>
                          Vendor:{' '}
                          <Text style={{ fontWeight: '700', color: BRAND.ink }}>
                            {item.supplier || 'No Vendor Assigned'}
                          </Text>
                        </Text>
                      </View>

                      {/* 1-Tap Actions */}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <TouchableOpacity
                          style={styles.reorderWaBtn}
                          onPress={() => handleSendWhatsAppReorder(item, shortage)}
                        >
                          <Ionicons name="logo-whatsapp" size={15} color="#FFF" style={{ marginRight: 4 }} />
                          <Text style={styles.reorderWaBtnText}>WhatsApp Reorder</Text>
                        </TouchableOpacity>

                        {(canAddInventory || canEditInventory) && (
                          <TouchableOpacity
                            style={styles.reorderReceiveBtn}
                            onPress={() => handleOpenReceiveModal(item)}
                          >
                            <Ionicons name="add-circle-outline" size={15} color="#FFF" style={{ marginRight: 4 }} />
                            <Text style={styles.reorderReceiveBtnText}>Receive Now</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: STOCK MOVEMENTS AUDIT LOG */}
      {/* ========================================================================= */}
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
                <Text style={[styles.statusFilterBtnText, movementFilter === mType && styles.statusFilterBtnTextActive]}>
                  {mType === 'all'
                    ? 'All Logs'
                    : mType === 'receive'
                    ? 'Inward Deliveries'
                    : mType === 'usage'
                    ? 'Kitchen Usage'
                    : mType === 'wastage'
                    ? 'Spoilage / Wastage'
                    : 'Physical Adjustments'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredMovements.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={48} color={BRAND.muted} />
              <Text style={styles.emptyTitle}>No Stock Movements Recorded</Text>
              <Text style={styles.emptyDesc}>
                Whenever staff receives goods or kitchen consumes ingredients, audit logs will appear here.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.movementsList}>
              {movementsPagination.paginatedData.map((m) => {
                const isPositive = (m.delta ?? 0) > 0;
                const typeConfig = getMovementConfig(m.type);

                return (
                  <View key={m.id} style={styles.movementCard}>
                    <View style={[styles.movementIconBox, { backgroundColor: typeConfig.bg }]}>
                      <Ionicons name={typeConfig.icon as any} size={20} color={typeConfig.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.movementHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {m.itemCode ? (
                            <View style={styles.skuBadge}>
                              <Text style={styles.skuBadgeText}>{m.itemCode}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.movementItemName}>{m.itemName}</Text>
                        </View>
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
                        {m.invoiceNo ? (
                          <Text style={styles.movementInvoice}>Inv: #{m.invoiceNo}</Text>
                        ) : null}
                        {m.batchNumber ? (
                          <Text style={styles.movementInvoice}>Batch: #{m.batchNumber}</Text>
                        ) : null}
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
            <PaginationControl
              currentPage={movementsPagination.currentPage}
              totalPages={movementsPagination.totalPages}
              pageSize={movementsPagination.pageSize}
              totalItems={movementsPagination.totalItems}
              pageSizeOptions={[15, 30, 50, 100]}
              onPageChange={movementsPagination.goToPage}
              onPageSizeChange={movementsPagination.setPageSize}
              itemName="movement logs"
            />
          </>
        )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: READY DISHES MENU STOCK */}
      {/* ========================================================================= */}
      {activeTab === 'dishes' && (
        <View>
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={20} color={BRAND.burgundy} style={{ marginRight: 8 }} />
            <Text style={styles.infoBannerText}>
              Keep track of prepared food & limited daily specials. Set ready portions so POS auto-warns when items run low.
            </Text>
          </View>

          <View style={styles.tableWrapper}>
            <ScrollView
              horizontal={!isMobile}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ minWidth: isMobile ? undefined : 1000, width: '100%' }}
            >
              <View style={{ width: '100%' }}>
                {!isMobile && (
                  <View style={styles.stockTableHeader}>
                    <View style={[styles.thCol, { flex: 2.8, minWidth: 200 }]}>
                      <Text style={styles.thColText}>DISH & CATEGORY</Text>
                    </View>
                    <View style={[styles.thCol, { flex: 2.0, minWidth: 160 }]}>
                      <Text style={styles.thColText}>MENU PRICE & MARGIN</Text>
                    </View>
                    <View style={[styles.thCol, { flex: 2.2, minWidth: 180 }]}>
                      <Text style={styles.thColText}>READY PORTIONS AVAILABLE</Text>
                    </View>
                    <View style={[styles.thCol, { flex: 2.0, minWidth: 170, alignItems: 'flex-end', paddingRight: 6 }]}>
                      <Text style={styles.thColText}>QUICK STOCK STEPPER</Text>
                    </View>
                  </View>
                )}

                <View style={{ gap: 6 }}>
                  {trackedDishes.map((dish) => {
                    const isTracked = !!dish.trackStock;
                    const stockQty = dish.stockQty || 0;
                    const cost = dish.costPrice || 0;
                    const margin = dish.price > 0 && cost > 0 ? Math.round(((dish.price - cost) / dish.price) * 100) : null;

                    return (
                      <View
                        key={dish.id}
                        style={[
                          styles.stockTableRow,
                          {
                            borderLeftColor: !isTracked ? '#94A3B8' : stockQty <= 0 ? BRAND.danger : stockQty <= 5 ? BRAND.warn : BRAND.success,
                          },
                          isMobile && styles.stockTableRowMobile
                        ]}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                      >
                        {/* 1. Dish Name & Category */}
                        <View style={[styles.rowCol, { flex: 2.8, minWidth: 200, gap: 2 }]}>
                          <Text style={styles.stockRowTitle} numberOfLines={1}>{dish.name}</Text>
                          <Text style={styles.stockRowCategory}>{dish.category}</Text>
                        </View>

                        {/* 2. Menu Price & Margin */}
                        <View style={[styles.rowCol, { flex: 2.0, minWidth: 160, gap: 2 }]}>
                          <Text style={styles.stockRowValuation}>{money(dish.price)}</Text>
                          {margin !== null ? (
                            <Text style={styles.dishMargin}>{margin}% Margin</Text>
                          ) : null}
                        </View>

                        {/* 3. Ready Portions */}
                        <View style={[styles.rowCol, { flex: 2.2, minWidth: 180, gap: 2 }]}>
                          <Text
                            style={[
                              styles.stockRowQuantity,
                              stockQty <= 0 && isTracked && { color: BRAND.danger },
                              stockQty > 0 && stockQty <= 5 && isTracked && { color: BRAND.warn },
                            ]}
                          >
                            {isTracked ? `${stockQty} Portions Left` : 'Unlimited / Untracked'}
                          </Text>
                        </View>

                        {/* 4. Quick Stepper */}
                        <View style={[styles.rowCol, { flex: 2.0, minWidth: 170, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }]}>
                          {canEditInventory && (
                            <View style={styles.stepperRow}>
                              <TouchableOpacity
                                style={styles.stepperBtn}
                                onPress={() => handleAdjustDishStock(dish, -1)}
                                {...(Platform.OS === 'web' ? ({ title: 'Deduct 1 Portion' } as any) : {})}
                              >
                                <Ionicons name="remove" size={16} color={BRAND.ink} />
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.stepperBtn, { backgroundColor: BRAND.burgundy }]}
                                onPress={() => handleAdjustDishStock(dish, 1)}
                                {...(Platform.OS === 'web' ? ({ title: 'Add 1 Portion' } as any) : {})}
                              >
                                <Ionicons name="add" size={16} color="#FFF" />
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.stepperBtn, { backgroundColor: BRAND.goldSoft }]}
                                onPress={() => handleAdjustDishStock(dish, 5)}
                                {...(Platform.OS === 'web' ? ({ title: 'Add 5 Portions' } as any) : {})}
                              >
                                <Text style={{ fontWeight: '800', color: BRAND.burgundy, fontSize: 12 }}>+5</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD NEW RAW MATERIAL (SKU) */}
      {/* ========================================================================= */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Raw Material / SKU</Text>
                <Text style={styles.modalSubtitle}>Create new tracked ingredient with SKU and storage zone</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Item SKU Code *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. SKU-MT-001"
                    value={formItemCode}
                    onChangeText={setFormItemCode}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Urdu Name (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. چکن بون لیس"
                    value={formUrduName}
                    onChangeText={setFormUrduName}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Item Name (English) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Boneless Chicken, Basmati Rice, Cooking Oil"
                value={formName}
                onChangeText={setFormName}
              />

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <RoyalDropdown
                    label="Category"
                    options={allCategories}
                    value={formCategory}
                    onSelect={(val) => setFormCategory(val)}
                    icon="pricetag-outline"
                    searchable
                  />
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FEF3C7',
                    borderWidth: 1,
                    borderColor: '#D5A943',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    height: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setShowInlineCatCreator(!showInlineCatCreator)}
                >
                  <Ionicons name="add-circle" size={16} color={BRAND.burgundy} style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.burgundy }}>+ New Category</Text>
                </TouchableOpacity>
              </View>

              {showInlineCatCreator && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, backgroundColor: '#FFFBEB', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A' }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: '#FFFFFF' }]}
                    placeholder="Type new category name (e.g. Spices, Frozen, Sauces)..."
                    value={inlineNewCatInput}
                    onChangeText={setInlineNewCatInput}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: BRAND.burgundy, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => {
                      const clean = inlineNewCatInput.trim();
                      if (!clean) return;
                      addInventoryCategory(clean);
                      setFormCategory(clean);
                      setInlineNewCatInput('');
                      setShowInlineCatCreator(false);
                      broadcastImmediately();
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>Add & Select</Text>
                  </TouchableOpacity>
                </View>
              )}

              <RoyalDropdown
                label="Storage Location / Zone"
                options={STORAGE_LOCATIONS}
                value={formLocation}
                onSelect={(val) => setFormLocation(val)}
                icon="location-outline"
                searchable
                style={{ marginBottom: 12 }}
              />

              <RoyalDropdown
                label="Measurement Unit"
                options={UNITS}
                value={formUnit}
                onSelect={(val) => setFormUnit(val)}
                icon="scale-outline"
                searchable
                style={{ marginBottom: 12 }}
              />

              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Initial Stock ({formUnit})</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 25"
                    keyboardType="numeric"
                    value={formStock}
                    onChangeText={setFormStock}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Low Stock Alert ({formUnit}) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 10"
                    keyboardType="numeric"
                    value={formThreshold}
                    onChangeText={setFormThreshold}
                  />
                </View>
              </View>

              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Unit Cost (Rs. per {formUnit})</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 780"
                    keyboardType="numeric"
                    value={formCost}
                    onChangeText={setFormCost}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Shelf Life (Days from Receipt)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 30"
                    keyboardType="numeric"
                    value={formExpiryDays}
                    onChangeText={setFormExpiryDays}
                  />
                </View>
              </View>

              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Preferred Vendor / Supplier</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Al-Madina Fresh Poultry"
                    value={formSupplier}
                    onChangeText={setFormSupplier}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Supplier WhatsApp Phone</Text>
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
                <Text style={styles.modalSaveBtnText}>Save SKU Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: GOODS RECEIVING & INVOICING MODAL */}
      {/* ========================================================================= */}
      <Modal visible={showReceiveModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Receive Goods & Inward Invoice</Text>
                <Text style={styles.modalSubtitle}>
                  Stock-in from supplier with batch number, invoice #, and Goods Receipt Note
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowReceiveModal(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              <RoyalDropdown
                label="Select Ingredient / Material *"
                placeholder="Choose ingredient to receive..."
                options={inventory.map((inv) => ({
                  label: `${inv.name} (${inv.stock} ${inv.unit})`,
                  value: inv.id,
                  sublabel: `${inv.category} • Zone: ${inv.location || 'N/A'}`,
                  badge: `${inv.stock} ${inv.unit}`,
                }))}
                value={recItemId}
                onSelect={(val) => {
                  setRecItemId(val);
                  const inv = inventory.find((i) => i.id === val);
                  if (inv) {
                    if (inv.supplier) setRecSupplier(inv.supplier);
                    if (inv.costPerUnit) setRecUnitCost(inv.costPerUnit.toString());
                    if (inv.location) setRecLocation(inv.location);
                  }
                }}
                searchable
                searchPlaceholder="Search material by name..."
                icon="cube-outline"
                style={{ marginBottom: 12 }}
              />

              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Supplier Invoice No. *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. AMP-8821"
                    value={recInvoiceNo}
                    onChangeText={setRecInvoiceNo}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Batch / Lot Number *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. B-26-CHK-081"
                    value={recBatchNumber}
                    onChangeText={setRecBatchNumber}
                  />
                </View>
              </View>

              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Supplier / Vendor Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Al-Madina Fresh Poultry"
                    value={recSupplier}
                    onChangeText={setRecSupplier}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Received By Staff</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Chef Omar / Storekeeper"
                    value={recReceivedBy}
                    onChangeText={setRecReceivedBy}
                  />
                </View>
              </View>

              {/* Quick Supplier Dropdown if available */}
              {suppliers.length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <RoyalDropdown
                    label="Quick Pick Supplier"
                    placeholder="Select from registered suppliers..."
                    options={suppliers.map((s) => ({
                      label: s.name,
                      value: s.name,
                      badge: s.category,
                      sublabel: s.phone,
                    }))}
                    value={recSupplier}
                    onSelect={(val) => setRecSupplier(val)}
                    icon="business-outline"
                    searchable
                  />
                </View>
              ) : null}

              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Quantity Received *</Text>
                  <TextInput
                    style={[styles.input, { fontSize: 18, fontWeight: '700' }]}
                    placeholder="e.g. 50"
                    keyboardType="numeric"
                    value={recQty}
                    onChangeText={setRecQty}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Unit Purchase Cost (PKR)</Text>
                  <TextInput
                    style={[styles.input, { fontSize: 18, fontWeight: '700' }]}
                    placeholder="e.g. 780"
                    keyboardType="numeric"
                    value={recUnitCost}
                    onChangeText={setRecUnitCost}
                  />
                </View>
              </View>

              {/* Live Invoice Value */}
              {recQty && recUnitCost ? (
                <View style={styles.impactBox}>
                  <Text style={styles.impactLabel}>Total Inward Shipment Amount:</Text>
                  <Text style={styles.impactValue}>
                    {money((parseFloat(recQty) || 0) * (parseFloat(recUnitCost) || 0))}
                  </Text>
                </View>
              ) : null}

              <View style={styles.formRow2}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Batch Expiry (Days from Today)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 7 (days)"
                    keyboardType="numeric"
                    value={recExpiryDays}
                    onChangeText={setRecExpiryDays}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text style={styles.inputLabel}>Store in Zone</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Walk-in Chiller"
                    value={recLocation}
                    onChangeText={setRecLocation}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Delivery Remarks / Inspection Note</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Chilled delivery van verified, seals intact, quality approved"
                value={recNotes}
                onChangeText={setRecNotes}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowReceiveModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: BRAND.success }]}
                onPress={handleSaveReceive}
              >
                <Ionicons name="checkmark-done-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSaveBtnText}>Confirm Inward Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: GOODS RECEIPT NOTE (GRN) VOUCHER SLIP */}
      {/* ========================================================================= */}
      <Modal visible={showGrnModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 520 }]}>
            <View style={styles.grnVoucherHeader}>
              <Image
                source={{ uri: SULTAN_LOGO_BASE64 }}
                style={{ width: 125, height: 115, alignSelf: 'center', marginBottom: 4 }}
                resizeMode="contain"
              />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#000', textAlign: 'center', marginBottom: 2 }}>
                جہاں ہر مہمان ہے سلطان
              </Text>
              <Text style={styles.grnVoucherTitle}>OFFICIAL GOODS RECEIPT NOTE (GRN)</Text>
              <Text style={styles.grnVoucherNo}>GRN #{lastGrn?.grnNo}</Text>
            </View>

            <View style={styles.grnDetailsBox}>
              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Date & Time:</Text>
                <Text style={styles.grnValue}>
                  {lastGrn?.at ? `${formatDay(lastGrn.at)} ${formatTime(lastGrn.at)}` : ''}
                </Text>
              </View>
              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Supplier / Vendor:</Text>
                <Text style={[styles.grnValue, { fontWeight: '800' }]}>{lastGrn?.supplier}</Text>
              </View>
              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Supplier Invoice #:</Text>
                <Text style={styles.grnValue}>{lastGrn?.invoiceNo}</Text>
              </View>
              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Batch Number:</Text>
                <Text style={styles.grnValue}>{lastGrn?.batchNumber}</Text>
              </View>
              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Storage Location:</Text>
                <Text style={styles.grnValue}>{lastGrn?.location}</Text>
              </View>

              <View style={styles.grnDivider} />

              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Item Received:</Text>
                <Text style={[styles.grnValue, { fontWeight: '800' }]}>
                  {lastGrn?.itemName} {lastGrn?.itemCode ? `(${lastGrn.itemCode})` : ''}
                </Text>
              </View>
              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Quantity Verified:</Text>
                <Text style={[styles.grnValue, { fontSize: 16, color: BRAND.success, fontWeight: '800' }]}>
                  {lastGrn?.qty} {lastGrn?.unit}
                </Text>
              </View>
              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Unit Cost:</Text>
                <Text style={styles.grnValue}>{lastGrn ? money(lastGrn.unitCost) : ''}</Text>
              </View>
              <View style={[styles.grnRow, { marginTop: 6 }]}>
                <Text style={[styles.grnLabel, { fontWeight: '800', color: BRAND.ink }]}>Total Inward Value:</Text>
                <Text style={[styles.grnValue, { fontSize: 18, color: BRAND.burgundy, fontWeight: '900' }]}>
                  {lastGrn ? money(lastGrn.totalAmount) : ''}
                </Text>
              </View>

              <View style={styles.grnDivider} />

              <View style={styles.grnRow}>
                <Text style={styles.grnLabel}>Received & Verified By:</Text>
                <Text style={styles.grnValue}>{lastGrn?.receivedBy}</Text>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowGrnModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Close</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: '#D5A943' }]}
                  onPress={() => {
                    if (!lastGrn || typeof window === 'undefined') return;
                    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GRN #${lastGrn.grnNo}</title><style>
                      @page { size: 72mm auto; margin: 0mm !important; }
                      * { box-sizing: border-box; margin: 0; padding: 0; color: #000 !important; }
                      html, body { margin: 0 !important; padding: 1.5mm 1.5mm 4mm 1mm !important; width: 66mm !important; max-width: 66mm !important; background: #fff !important; font-family: Arial, sans-serif; font-size: 11px; }
                      .center { text-align: center; }
                      .logo-img { width: 130px; height: 120px; object-fit: contain; display: block; margin: 0 auto 4px auto; }
                      .sub { font-size: 11px; font-weight: 900; margin-bottom: 3px; }
                      .line { border-top: 1.5px dashed #000; margin: 5px 0; }
                      .row { display: flex; justify-content: space-between; margin: 2.5px 0; font-size: 11px; }
                      .bold { font-weight: 800; }
                    </style></head><body>
                      <div class="center">
                        <img src="${SULTAN_LOGO_BASE64}" alt="Sultan Logo" class="logo-img" />
                        <div style="font-size:13px;font-weight:700;margin:2px 0;">جہاں ہر مہمان ہے سلطان</div>
                        <div class="sub">OFFICIAL GOODS RECEIPT (GRN)</div>
                        <div class="bold">GRN #${lastGrn.grnNo}</div>
                      </div>
                      <div class="line"></div>
                      <div class="row"><span>Date:</span><span>${lastGrn.at ? `${formatDay(lastGrn.at)} ${formatTime(lastGrn.at)}` : ''}</span></div>
                      <div class="row"><span>Supplier:</span><span class="bold">${lastGrn.supplier}</span></div>
                      <div class="row"><span>Invoice #:</span><span>${lastGrn.invoiceNo}</span></div>
                      <div class="row"><span>Batch #:</span><span>${lastGrn.batchNumber}</span></div>
                      <div class="row"><span>Location:</span><span>${lastGrn.location}</span></div>
                      <div class="line"></div>
                      <div class="row"><span>Item:</span><span class="bold">${lastGrn.itemName}</span></div>
                      <div class="row"><span>Qty Verified:</span><span class="bold">${lastGrn.qty} ${lastGrn.unit}</span></div>
                      <div class="row"><span>Unit Cost:</span><span>${money(lastGrn.unitCost)}</span></div>
                      <div class="row" style="font-size:13px;"><span class="bold">Total Value:</span><span class="bold">${money(lastGrn.totalAmount)}</span></div>
                      <div class="line"></div>
                      <div class="row"><span>Verified By:</span><span>${lastGrn.receivedBy}</span></div>
                      <div class="line"></div>
                      <div class="center" style="font-size:9.5px;font-weight:700;margin-top:4px;">Powered & Designed by Nizaam Digital Solution</div>
                    </body></html>`;
                    const old = document.getElementById('grn-print-frame');
                    if (old) old.remove();
                    const iframe = document.createElement('iframe');
                    iframe.id = 'grn-print-frame';
                    iframe.style.position = 'fixed';
                    iframe.style.top = '-9999px';
                    iframe.style.left = '-9999px';
                    iframe.style.width = '66mm';
                    iframe.style.height = '600px';
                    document.body.appendChild(iframe);
                    const doc = iframe.contentWindow?.document;
                    if (doc) {
                      doc.open();
                      doc.write(html);
                      doc.close();
                      setTimeout(() => {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                      }, 180);
                    }
                  }}
                >
                  <Ionicons name="print" size={18} color="#4a121a" style={{ marginRight: 6 }} />
                  <Text style={[styles.modalSaveBtnText, { color: '#4a121a' }]}>Print GRN Slip</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: BRAND.burgundy }]}
                onPress={() => {
                  setShowGrnModal(false);
                  alertMsg('GRN Recorded', `GRN #${lastGrn?.grnNo} saved to receiving audit ledger.`);
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSaveBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: QUICK STOCK MOVEMENT (USAGE / WASTAGE / ADJUST) */}
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
                <Ionicons
                  name="arrow-down-circle"
                  size={18}
                  color={movementType === 'receive' ? '#FFF' : BRAND.success}
                />
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
              {movementType === 'adjust'
                ? `New Total Stock Count (${selectedItem?.unit}) *`
                : `Quantity (${selectedItem?.unit}) *`}
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
      {/* MODAL 5: EDIT INVENTORY ITEM */}
      {/* ========================================================================= */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit SKU Details</Text>
                <Text style={styles.modalSubtitle}>{selectedItem?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Item SKU Code *</Text>
                  <TextInput style={styles.input} value={formItemCode} onChangeText={setFormItemCode} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Urdu Name</Text>
                  <TextInput style={styles.input} value={formUrduName} onChangeText={setFormUrduName} />
                </View>
              </View>

              <Text style={styles.inputLabel}>Item Name (English) *</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} />

              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <RoyalDropdown
                    label="Category"
                    options={allCategories}
                    value={formCategory}
                    onSelect={(val) => setFormCategory(val)}
                    icon="pricetag-outline"
                    searchable
                  />
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FEF3C7',
                    borderWidth: 1,
                    borderColor: '#D5A943',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    height: 44,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setShowInlineCatCreator(!showInlineCatCreator)}
                >
                  <Ionicons name="add-circle" size={16} color={BRAND.burgundy} style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND.burgundy }}>+ New Category</Text>
                </TouchableOpacity>
              </View>

              {showInlineCatCreator && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, backgroundColor: '#FFFBEB', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A' }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: '#FFFFFF' }]}
                    placeholder="Type new category name (e.g. Spices, Frozen, Sauces)..."
                    value={inlineNewCatInput}
                    onChangeText={setInlineNewCatInput}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: BRAND.burgundy, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => {
                      const clean = inlineNewCatInput.trim();
                      if (!clean) return;
                      addInventoryCategory(clean);
                      setFormCategory(clean);
                      setInlineNewCatInput('');
                      setShowInlineCatCreator(false);
                      broadcastImmediately();
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>Add & Select</Text>
                  </TouchableOpacity>
                </View>
              )}

              <RoyalDropdown
                label="Storage Location / Zone"
                options={STORAGE_LOCATIONS}
                value={formLocation}
                onSelect={(val) => setFormLocation(val)}
                icon="location-outline"
                searchable
                style={{ marginBottom: 12 }}
              />

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

              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Unit Purchase Cost (PKR)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formCost}
                    onChangeText={setFormCost}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Shelf Life (Days Remaining)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formExpiryDays}
                    onChangeText={setFormExpiryDays}
                  />
                </View>
              </View>

              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Batch Number</Text>
                  <TextInput style={styles.input} value={formBatchNumber} onChangeText={setFormBatchNumber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Last Inward Invoice #</Text>
                  <TextInput style={styles.input} value={formInvoiceNo} onChangeText={setFormInvoiceNo} />
                </View>
              </View>

              <View style={styles.formRow2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Supplier Name</Text>
                  <TextInput style={styles.input} value={formSupplier} onChangeText={setFormSupplier} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Supplier WhatsApp</Text>
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
                  <Text style={styles.modalSaveBtnText}>Update SKU Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      {/* ========================================================================= */}
      {/* MODAL 6: MANAGE INVENTORY CATEGORIES (ADD / RENAME / DELETE) */}
      {/* ========================================================================= */}
      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Inventory Categories • انوینٹری کیٹیگریز</Text>
                <Text style={styles.modalSubtitle}>
                  Add new inventory categories, rename existing ones, or remove unused categories
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            {/* Add New Category Bar */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Enter new category name (e.g. Spices, Frozen, Disposables)..."
                value={newCategoryInput}
                onChangeText={setNewCategoryInput}
              />
              <TouchableOpacity
                style={[styles.modalSaveBtn, { paddingHorizontal: 16 }]}
                onPress={() => {
                  const clean = newCategoryInput.trim();
                  if (!clean) {
                    alertMsg('Missing Name', 'Please type a category name.');
                    return;
                  }
                  if (allCategories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
                    alertMsg('Already Exists', `"${clean}" is already in your categories list.`);
                    return;
                  }
                  addInventoryCategory(clean);
                  setNewCategoryInput('');
                  broadcastImmediately();
                }}
              >
                <Ionicons name="add-circle" size={18} color="#FFF" style={{ marginRight: 5 }} />
                <Text style={styles.modalSaveBtnText}>Add Category</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 8 }}>
                {allCategories.map((cat) => {
                  const itemCount = inventory.filter((i) => i.category === cat).length;
                  const isEditingThis = editingCatOldName === cat;

                  return (
                    <View
                      key={cat}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        gap: 8,
                      }}
                    >
                      {isEditingThis ? (
                        <View style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TextInput
                            style={[styles.input, { flex: 1, marginBottom: 0, height: 38, paddingVertical: 4 }]}
                            value={editingCatNewName}
                            onChangeText={setEditingCatNewName}
                            autoFocus
                          />
                          <TouchableOpacity
                            style={{ backgroundColor: BRAND.success, paddingHorizontal: 12, height: 36, borderRadius: 8, justifyContent: 'center' }}
                            onPress={() => {
                              const cleanNew = editingCatNewName.trim();
                              if (cleanNew && cleanNew !== cat) {
                                renameInventoryCategory(cat, cleanNew);
                                if (selectedCategory === cat) setSelectedCategory(cleanNew);
                                if (formCategory === cat) setFormCategory(cleanNew);
                                broadcastImmediately();
                              }
                              setEditingCatOldName(null);
                            }}
                          >
                            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: '#E2E8F0', paddingHorizontal: 10, height: 36, borderRadius: 8, justifyContent: 'center' }}
                            onPress={() => setEditingCatOldName(null)}
                          >
                            <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Ionicons name="pricetag" size={15} color={BRAND.burgundy} />
                            <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND.ink }}>{cat}</Text>
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400E' }}>{itemCount} items</Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                              style={styles.stockRowIconBtn}
                              onPress={() => {
                                setEditingCatOldName(cat);
                                setEditingCatNewName(cat);
                              }}
                            >
                              <Ionicons name="pencil-outline" size={14} color="#475569" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.stockRowIconBtn, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                              onPress={() => {
                                if (itemCount > 0) {
                                  alertMsg('Category in Use', `"${cat}" has ${itemCount} inventory item(s). Please move or rename those items first.`);
                                  return;
                                }
                                deleteInventoryCategory(cat);
                                if (selectedCategory === cat) setSelectedCategory('All');
                                broadcastImmediately();
                              }}
                            >
                              <Ionicons name="trash-outline" size={14} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSaveBtnText}>Done</Text>
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
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 18,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
    fontSize: 22,
    fontWeight: '800',
    color: BRAND.ink,
  },
  headerSubtitle: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  headerUrduBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  headerUrduText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  syncStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    padding: 3,
    paddingLeft: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  syncStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },
  syncStatusPillConnected: {
    backgroundColor: '#F0FDF4',
  },
  syncStatusPillConnecting: {
    backgroundColor: '#FFFBEB',
  },
  syncStatusPillOffline: {
    backgroundColor: '#FEF2F2',
  },
  syncStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncStatusDotConnected: {
    backgroundColor: '#16A34A',
  },
  syncStatusDotConnecting: {
    backgroundColor: '#D97706',
  },
  syncStatusDotOffline: {
    backgroundColor: '#DC2626',
  },
  syncStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  syncStatusTextConnected: {
    color: '#15803D',
  },
  syncStatusTextConnecting: {
    color: '#B45309',
  },
  syncStatusTextOffline: {
    color: '#B91C1C',
  },
  syncManualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  syncManualBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    shadowColor: BRAND.burgundy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 4,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#EFEFF4',
    borderLeftWidth: 4.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)',
      } as any,
    }),
    elevation: 2,
  },
  kpiCardGold: {
    backgroundColor: 'rgba(254, 249, 235, 0.9)',
    borderColor: 'rgba(212, 175, 55, 0.35)',
    borderLeftColor: '#D4AF37',
  },
  kpiCardSapphire: {
    backgroundColor: 'rgba(240, 249, 255, 0.9)',
    borderColor: 'rgba(2, 132, 199, 0.35)',
    borderLeftColor: '#0284C7',
  },
  kpiCardAmber: {
    backgroundColor: 'rgba(254, 243, 199, 0.9)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderLeftColor: '#F59E0B',
  },
  kpiCardRuby: {
    backgroundColor: 'rgba(254, 226, 226, 0.9)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderLeftColor: '#EF4444',
  },
  kpiIconBox: {
    width: 40,
    height: 40,
    borderRadius: 9,
    backgroundColor: BRAND.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.muted,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 16,
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
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: BRAND.goldSoft,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.muted,
  },
  tabBtnTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  searchSection: {
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BRAND.ink,
  },
  categoriesScroll: {
    marginBottom: 10,
  },
  categoriesContent: {
    gap: 6,
    paddingVertical: 2,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  categoryChipActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.text,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  locationChipActive: {
    backgroundColor: '#4B5563',
    borderColor: '#4B5563',
  },
  locationChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.muted,
  },
  filterDropdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
    zIndex: 10,
  },
  statusFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  statusFilterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  statusFilterBtnActive: {
    backgroundColor: BRAND.burgundySoft,
    borderColor: BRAND.burgundy,
  },
  statusFilterBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.text,
  },
  statusFilterBtnTextActive: {
    color: BRAND.burgundy,
    fontWeight: '800',
  },
  viewModeToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  viewModeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  viewModeToggleBtnActive: {
    backgroundColor: BRAND.burgundy,
    shadowColor: BRAND.burgundy,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  viewModeToggleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  viewModeToggleTextActive: {
    color: '#FFFFFF',
  },
  tableWrapper: {
    width: '100%',
    backgroundColor: 'transparent',
    marginBottom: 16,
  },
  stockTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thCol: {
    paddingHorizontal: 4,
  },
  thColText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  stockTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  stockTableRowMobile: {
    minWidth: 980,
  },
  rowCol: {
    paddingHorizontal: 4,
  },
  skuBadgeCompact: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  skuBadgeCompactText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.3,
  },
  stockRowCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  stockRowTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  stockRowUrdu: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    marginTop: 1,
  },
  stockRowLocation: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  stockRowBatch: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  stockRowQuantity: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  stockRowAlert: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  stockRowProgressBarBg: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  stockRowProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  stockRowValuation: {
    fontSize: 13.5,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  stockRowCostUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  stockRowSupplier: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  stockRowWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  stockRowWhatsAppText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
  },
  stockRowStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  stockRowStatusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  stockRowExpiryPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  stockRowExpiryText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  stockRowReceiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  stockRowReceiveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stockRowUsageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 7,
    paddingVertical: 4.5,
    borderRadius: 6,
  },
  stockRowUsageText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
  },
  stockRowIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receivingTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  receivingTableRowMobile: {
    minWidth: 980,
  },
  receivingRowNote: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 1,
  },
  receivingRowDate: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  receivingRowTime: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  receivingRowStaff: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  receivingRowQty: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#15803D',
  },
  receivingRowTotal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  receivingRowGrnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    borderRadius: 7,
  },
  receivingRowGrnText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemCard: {
    flex: 1,
    minWidth: 280,
    maxWidth: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.ink,
  },
  urduTitle: {
    fontSize: 13,
    color: BRAND.muted,
    fontWeight: '500',
    marginTop: 1,
  },
  skuBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  skuBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  categoryTagText: {
    fontSize: 11,
    color: BRAND.muted,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  expiryMiniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  expiryMiniBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  locationMetaBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  locationMetaText: {
    fontSize: 11,
    color: BRAND.text,
    fontWeight: '600',
  },
  batchMetaText: {
    fontSize: 11,
    color: BRAND.muted,
    fontWeight: '600',
  },
  stockDetailsBox: {
    backgroundColor: '#FAFAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  stockStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stockStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.textSecondary,
    textTransform: 'uppercase',
  },
  stockStatValue: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND.ink,
    marginTop: 1,
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
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    marginBottom: 8,
  },
  valLabel: {
    fontSize: 12.5,
    color: BRAND.textSecondary,
    fontWeight: '600',
  },
  valValue: {
    fontSize: 14.5,
    fontWeight: '800',
    color: BRAND.ink,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  supplierName: {
    fontSize: 13,
    color: BRAND.ink,
    fontWeight: '600',
    flex: 1,
  },
  supplierCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  supplierCallText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  quickMovementBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingVertical: 8,
    borderRadius: 7,
    gap: 4,
  },
  quickMovementBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  quickUsageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.infoSoft,
    borderWidth: 1,
    borderColor: '#93C5FD',
    paddingVertical: 8,
    borderRadius: 7,
    gap: 4,
  },
  quickUsageBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.info,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 7,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: BRAND.ink,
  },
  sectionDesc: {
    fontSize: 13.5,
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  // Receiving Card
  receivingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  receivingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  receivingItemName: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND.ink,
  },
  receivingSupplierText: {
    fontSize: 13.5,
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  receivingQtyText: {
    fontSize: 19,
    fontWeight: '900',
    color: BRAND.success,
  },
  receivingValText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: BRAND.burgundy,
    marginTop: 1,
  },
  receivingDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 10,
  },
  receivingMetaLabel: {
    fontSize: 12,
    color: BRAND.textSecondary,
    fontWeight: '700',
    marginBottom: 2,
  },
  receivingMetaValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: BRAND.ink,
  },
  receivingNoteText: {
    fontSize: 12.5,
    color: BRAND.muted,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  receivingActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  grnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: BRAND.goldSoft,
  },
  grnBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  // Expiry KPI Row
  expiryKpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  expiryKpiCard: {
    flex: 1,
    minWidth: 140,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  expiryKpiCount: {
    fontSize: 22,
    fontWeight: '900',
  },
  expiryKpiLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
  },
  expiryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  expiryPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  expiryDetailsBox: {
    backgroundColor: '#FAFAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  // Reorder Card
  reorderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    borderLeftWidth: 4,
    borderLeftColor: BRAND.warn,
  },
  reorderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  shortageGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  shortageCol: {
    minWidth: 90,
  },
  shortageLabel: {
    fontSize: 12,
    color: BRAND.textSecondary,
    fontWeight: '700',
    marginBottom: 2,
  },
  shortageVal: {
    fontSize: 15.5,
    fontWeight: '800',
    color: BRAND.ink,
  },
  reorderSupplierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  reorderSupplierText: {
    fontSize: 13.5,
    color: BRAND.textSecondary,
  },
  reorderWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
  },
  reorderWaBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  reorderReceiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
  },
  reorderReceiveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  // Movement History List
  movementsList: {
    gap: 10,
  },
  movementCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EFEFF4',
    gap: 10,
  },
  movementIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  movementItemName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: BRAND.ink,
  },
  movementDelta: {
    fontSize: 17,
    fontWeight: '900',
  },
  movementMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  movementTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  movementTypeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  movementInvoice: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6D28D9',
  },
  movementTime: {
    fontSize: 12.5,
    color: BRAND.textSecondary,
  },
  movementNote: {
    fontSize: 12.5,
    color: BRAND.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  movementStaff: {
    fontSize: 12.5,
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  // Dishes
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.goldSoft,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13.5,
    color: BRAND.burgundy,
    fontWeight: '700',
  },
  dishCard: {
    flex: 1,
    minWidth: 280,
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
    marginBottom: 10,
  },
  dishTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND.ink,
  },
  dishCategory: {
    fontSize: 12.5,
    color: BRAND.textSecondary,
    marginTop: 1,
    fontWeight: '600',
  },
  dishPriceBox: {
    alignItems: 'flex-end',
  },
  dishPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  dishMargin: {
    fontSize: 12,
    color: BRAND.success,
    fontWeight: '800',
  },
  dishStockControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    flexWrap: 'wrap',
    gap: 8,
  },
  dishStockLabel: {
    fontSize: 12,
    color: BRAND.textSecondary,
    fontWeight: '600',
  },
  dishStockValue: {
    fontSize: 14.5,
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
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND.ink,
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 13.5,
    color: BRAND.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    maxWidth: 360,
  },
  // Modal Base
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 580,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalCardMobile: {
    padding: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: BRAND.ink,
  },
  modalSubtitle: {
    fontSize: 13.5,
    color: BRAND.textSecondary,
    marginTop: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.text,
    marginBottom: 5,
    marginTop: 2,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14.5,
    color: BRAND.ink,
    marginBottom: 10,
  },
  formRow2: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  formChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
    marginRight: 6,
  },
  formChipActive: {
    backgroundColor: BRAND.burgundy,
  },
  formChipText: {
    fontSize: 12.5,
    color: BRAND.text,
    fontWeight: '700',
  },
  formChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  smallChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
  },
  smallChipActive: {
    backgroundColor: BRAND.burgundy,
  },
  smallChipText: {
    fontSize: 12,
    color: BRAND.text,
    fontWeight: '700',
  },
  smallChipTextActive: {
    color: '#FFF',
  },
  movementTypeSelector: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  typeSelectBtn: {
    flex: 1,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFF',
    gap: 4,
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
    fontSize: 12.5,
    fontWeight: '800',
    color: BRAND.ink,
  },
  typeSelectTextActive: {
    color: '#FFF',
  },
  impactBox: {
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  impactLabel: {
    fontSize: 12.5,
    color: BRAND.textSecondary,
    fontWeight: '700',
  },
  impactValue: {
    fontSize: 16,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 10,
    flexWrap: 'wrap',
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
  },
  modalCancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: BRAND.muted,
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 7,
  },
  modalSaveBtnText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  // GRN Slip
  grnVoucherHeader: {
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: BRAND.gold,
    paddingBottom: 10,
    marginBottom: 12,
  },
  grnVoucherBrand: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND.burgundy,
    letterSpacing: 1,
  },
  grnVoucherTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: BRAND.ink,
    marginTop: 2,
  },
  grnVoucherNo: {
    fontSize: 12.5,
    fontWeight: '800',
    color: BRAND.gold,
    marginTop: 2,
  },
  grnDetailsBox: {
    backgroundColor: '#FAFAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EFEFF4',
  },
  grnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  grnLabel: {
    fontSize: 13,
    color: BRAND.textSecondary,
    fontWeight: '600',
  },
  grnValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: BRAND.ink,
  },
  grnDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 8,
  },
});
