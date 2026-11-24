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
import { SafeAreaView } from 'react-native-safe-area-context';
import PaginationControl from '../components/PaginationControl';
import RoyalDropdown from '../components/RoyalDropdown';
import { usePagination } from '../hooks/usePagination';
import {
  Asset,
  ASSET_CATEGORIES,
  AssetCategory,
  AssetCondition,
  AssetStatus,
  Supplier,
  SupplierPayment,
  useAuthStore,
  useOpsStore,
} from '../store';
import { formatDay, money } from '../utils/format';
import { useRolePermissions } from '../store/roleStore';

const LIGHT = {
  bg: '#F8F9FA',
  surface: '#FFFFFF',
  cardBg: '#FFFFFF',
  cardBorder: '#E2E8F0',
  burgundy: '#52171B',
  burgundyDark: '#3A0F12',
  burgundySoft: 'rgba(82, 23, 27, 0.08)',
  gold: '#B48214',
  goldSoft: 'rgba(180, 130, 20, 0.12)',
  goldBorder: 'rgba(180, 130, 20, 0.35)',
  ink: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#475569',
  textDim: '#64748B',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  emerald: '#10B981',
  emeraldSoft: '#ECFDF5',
  emeraldBorder: '#A7F3D0',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A',
  rose: '#E11D48',
  roseSoft: '#FFF1F2',
  roseBorder: '#FECDD3',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  blueBorder: '#BFDBFE',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
  purpleBorder: '#DDD6FE',
};

const CONDITIONS: { key: AssetCondition; label: string; color: string; bg: string; border: string }[] = [
  { key: 'brand_new', label: 'Brand New', color: '#047857', bg: LIGHT.emeraldSoft, border: LIGHT.emeraldBorder },
  { key: 'good', label: 'Good Working', color: '#1D4ED8', bg: LIGHT.blueSoft, border: LIGHT.blueBorder },
  { key: 'fair', label: 'Fair / Aging', color: '#B45309', bg: LIGHT.amberSoft, border: LIGHT.amberBorder },
  { key: 'needs_maintenance', label: 'Needs Repair', color: '#BE123C', bg: LIGHT.roseSoft, border: LIGHT.roseBorder },
];

const STATUSES: { key: AssetStatus; label: string; color: string; bg: string; border: string }[] = [
  { key: 'active', label: 'Active in Service', color: '#047857', bg: LIGHT.emeraldSoft, border: LIGHT.emeraldBorder },
  { key: 'in_maintenance', label: 'In Maintenance', color: '#B45309', bg: LIGHT.amberSoft, border: LIGHT.amberBorder },
  { key: 'retired', label: 'Retired / Scrapped', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  { key: 'written_off', label: 'Written Off', color: '#BE123C', bg: LIGHT.roseSoft, border: LIGHT.roseBorder },
];

export default function AssetsScreen({
  backRoute = '/admin/dashboard',
  role = 'admin',
}: {
  backRoute?: string;
  role?: 'admin' | 'manager';
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const user = useAuthStore((s) => s.user);
  const { canAddAssets, canEditAssets, canDeleteAssets } = useRolePermissions();
  const assets = useOpsStore((s) => s.assets || []);
  const assetCategories = useOpsStore((s) => s.assetCategories && s.assetCategories.length > 0 ? s.assetCategories : [...ASSET_CATEGORIES]);
  const addAssetCategory = useOpsStore((s) => s.addAssetCategory);
  const renameAssetCategory = useOpsStore((s) => s.renameAssetCategory);
  const deleteAssetCategory = useOpsStore((s) => s.deleteAssetCategory);
  const suppliers = useOpsStore((s) => s.suppliers || []);
  const addSupplier = useOpsStore((s) => s.addSupplier);
  const purchaseOrders = useOpsStore((s) => s.purchaseOrders || []);
  const addPurchaseOrder = useOpsStore((s) => s.addPurchaseOrder);
  const supplierPayments = useOpsStore((s) => s.supplierPayments || []);
  const recordSupplierPayment = useOpsStore((s) => s.recordSupplierPayment);
  const damageRecords = useOpsStore((s) => s.damageRecords || []);
  const addAsset = useOpsStore((s) => s.addAsset);
  const updateAsset = useOpsStore((s) => s.updateAsset);
  const deleteAsset = useOpsStore((s) => s.deleteAsset);
  const addAssetMaintenanceLog = useOpsStore((s) => s.addAssetMaintenanceLog);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'single' | 'lot'>('lot');
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCategoryOld, setEditingCategoryOld] = useState<string | null>(null);
  const [editingCategoryNew, setEditingCategoryNew] = useState('');

  // Quick Add Supplier Modal
  const [isQuickSupplierModalOpen, setIsQuickSupplierModalOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierCategory, setQuickSupplierCategory] = useState<string>(assetCategories[0] || ASSET_CATEGORIES[0]);
  const [quickSupplierContact, setQuickSupplierContact] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');
  const [quickSupplierTerms, setQuickSupplierTerms] = useState('Credit 15 Days');
  const [quickSupplierCity, setQuickSupplierCity] = useState('Lahore');

  // Supplier Khata & Payments Modal
  const [isSupplierLedgersOpen, setIsSupplierLedgersOpen] = useState(false);
  const [selectedLedgerSupplierId, setSelectedLedgerSupplierId] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentMethodInput, setPaymentMethodInput] = useState<'cash' | 'online' | 'cheque'>('cash');
  const [paymentNotesInput, setPaymentNotesInput] = useState('');

  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [maintenanceAsset, setMaintenanceAsset] = useState<Asset | null>(null);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);

  // Single Asset Form State
  const [formName, setFormName] = useState('');
  const [formUrduName, setFormUrduName] = useState('');
  const [formCategory, setFormCategory] = useState<string>(assetCategories[0] || ASSET_CATEGORIES[0]);
  const [formCost, setFormCost] = useState('');
  const [formQty, setFormQty] = useState('1');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formVendor, setFormVendor] = useState('');
  const [formVendorPhone, setFormVendorPhone] = useState('');
  const [formInvoiceNo, setFormInvoiceNo] = useState('');
  const [formLocation, setFormLocation] = useState('Main Dining Hall');
  const [formCondition, setFormCondition] = useState<AssetCondition>('good');
  const [formStatus, setFormStatus] = useState<AssetStatus>('active');
  const [formDepreciationRate, setFormDepreciationRate] = useState('10');
  const [formSerial, setFormSerial] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsCapEx, setFormIsCapEx] = useState(true);

  // Multi-Item Lot Form State
  type LotItem = {
    id: string;
    name: string;
    category: string;
    quantity: string;
    cost: string;
  };
  const [lotItems, setLotItems] = useState<LotItem[]>([
    { id: 'item-1', name: '', category: assetCategories[0] || ASSET_CATEGORIES[0], quantity: '1', cost: '' },
  ]);
  const [lotPaidAmount, setLotPaidAmount] = useState('0');
  const [lotPaymentMethod, setLotPaymentMethod] = useState<'cash' | 'online' | 'cheque'>('cash');
  const [lotNotes, setLotNotes] = useState('');

  // Maintenance Form State
  const [maintCost, setMaintCost] = useState('');
  const [maintDesc, setMaintDesc] = useState('');
  const [maintTech, setMaintTech] = useState('');
  const [maintAutoExpense, setMaintAutoExpense] = useState(true);

  // Financial Stats
  const stats = useMemo(() => {
    let totalInvested = 0;
    let activeValue = 0;
    let activeCount = 0;
    let maintCount = 0;
    let totalMaintSpent = 0;

    assets.forEach((a) => {
      totalInvested += a.totalCost || a.cost * a.quantity;
      if (a.status === 'active') {
        activeCount += a.quantity || 1;
        activeValue += a.currentValue || a.totalCost;
      } else if (a.status === 'in_maintenance') {
        maintCount += a.quantity || 1;
      }
      if (a.maintenanceLogs && a.maintenanceLogs.length > 0) {
        a.maintenanceLogs.forEach((log) => {
          totalMaintSpent += log.cost || 0;
        });
      }
    });

    return {
      totalInvested,
      activeValue,
      activeCount,
      maintCount,
      totalMaintSpent,
      totalAssetsCount: assets.length,
    };
  }, [assets]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((ast) => {
      if (selectedCategory !== 'All' && ast.category !== selectedCategory) return false;
      if (selectedStatus !== 'All' && ast.status !== selectedStatus) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        ast.name.toLowerCase().includes(q) ||
        (ast.urduName && ast.urduName.toLowerCase().includes(q)) ||
        ast.assetCode.toLowerCase().includes(q) ||
        ast.vendor.toLowerCase().includes(q) ||
        ast.location.toLowerCase().includes(q) ||
        (ast.serialNumber && ast.serialNumber.toLowerCase().includes(q))
      );
    });
  }, [assets, selectedCategory, selectedStatus, search]);

  const assetsPagination = usePagination({
    data: filteredAssets,
    initialPageSize: 10,
  });

  const lotTotalBill = useMemo(() => {
    return lotItems.reduce((sum, item) => {
      const q = parseInt(item.quantity, 10) || 0;
      const c = parseFloat(item.cost) || 0;
      return sum + q * c;
    }, 0);
  }, [lotItems]);

  const lotBalanceDue = useMemo(() => {
    const paid = parseFloat(lotPaidAmount) || 0;
    return Math.max(0, lotTotalBill - paid);
  }, [lotTotalBill, lotPaidAmount]);

  const openAddModal = (mode: 'single' | 'lot' = 'lot') => {
    if (!canAddAssets) {
      alertMsg('Permission Denied', 'You do not have permission to add capital assets.');
      return;
    }
    setEditingAsset(null);
    setModalMode(mode);
    setFormName('');
    setFormUrduName('');
    setFormCategory(assetCategories[0] || ASSET_CATEGORIES[0]);
    setFormCost('');
    setFormQty('1');
    setFormSupplierId('');
    setFormVendor('');
    setFormVendorPhone('');
    setFormInvoiceNo('');
    setFormLocation('Main Dining Hall');
    setFormCondition('good');
    setFormStatus('active');
    setFormDepreciationRate('10');
    setFormSerial('');
    setFormNotes('');
    setFormIsCapEx(true);
    setLotItems([
      { id: `item-${Date.now()}-1`, name: '', category: assetCategories[0] || ASSET_CATEGORIES[0], quantity: '1', cost: '' },
    ]);
    setLotPaidAmount('0');
    setLotPaymentMethod('cash');
    setLotNotes('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (ast: Asset) => {
    if (!canEditAssets) {
      alertMsg('Permission Denied', 'You do not have permission to edit capital assets.');
      return;
    }
    setModalMode('single');
    setEditingAsset(ast);
    setFormName(ast.name);
    setFormUrduName(ast.urduName || '');
    setFormCategory(ast.category);
    setFormCost(String(ast.cost));
    setFormQty(String(ast.quantity || 1));
    setFormSupplierId(ast.supplierId || '');
    setFormVendor(ast.vendor);
    setFormVendorPhone(ast.vendorPhone || '');
    setFormInvoiceNo(ast.invoiceNo || '');
    setFormLocation(ast.location);
    setFormCondition(ast.condition);
    setFormStatus(ast.status);
    setFormDepreciationRate(String(ast.depreciationRateYearly || 10));
    setFormSerial(ast.serialNumber || '');
    setFormNotes(ast.notes || '');
    setFormIsCapEx(ast.isCapEx !== undefined ? ast.isCapEx : true);
    setIsAddModalOpen(true);
  };

  const handleQuickAddSupplier = () => {
    if (!quickSupplierName.trim()) {
      alertMsg('Missing Name', 'Please enter the supplier or firm name.');
      return;
    }
    const newId = `sup-${Date.now().toString().slice(-6)}`;
    addSupplier({
      name: quickSupplierName.trim(),
      category: quickSupplierCategory || 'Furniture & Fixtures',
      supplierType: 'assets',
      contactPerson: quickSupplierContact.trim() || 'Contact Person',
      phone: quickSupplierPhone.trim() || '0300-0000000',
      paymentTerms: quickSupplierTerms || 'Credit 15 Days',
      city: quickSupplierCity.trim() || 'Lahore',
      suppliedItems: [],
      currentBalance: 0,
      totalPurchases: 0,
      rating: 5,
      status: 'active',
    });

    setFormSupplierId(newId);
    setFormVendor(quickSupplierName.trim());
    if (quickSupplierPhone.trim()) setFormVendorPhone(quickSupplierPhone.trim());
    setIsQuickSupplierModalOpen(false);
    setQuickSupplierName('');
    setQuickSupplierPhone('');
    setQuickSupplierContact('');
    alertMsg('Supplier Registered', `Supplier "${quickSupplierName.trim()}" created & selected.`);
  };

  const handleRecordSupplierPayment = (sup: Supplier) => {
    const amt = parseFloat(paymentAmountInput);
    if (!Number.isFinite(amt) || amt <= 0) {
      alertMsg('Invalid Amount', 'Please enter a valid payment amount.');
      return;
    }
    recordSupplierPayment(
      {
        supplierId: sup.id,
        supplierName: sup.name,
        amount: amt,
        method: paymentMethodInput,
        paidBy: user?.name || 'Manager',
        notes: paymentNotesInput.trim() || `CapEx Payment to ${sup.name}`,
      },
      {
        autoRecordExpense: true,
      }
    );
    setPaymentAmountInput('');
    setPaymentNotesInput('');
    alertMsg(
      'Payment Recorded',
      `Payment of ${money(amt)} paid to [${sup.name}] recorded successfully. Khata balance reduced.`
    );
  };

  const handleSaveAsset = () => {
    if (editingAsset ? !canEditAssets : !canAddAssets) {
      alertMsg(
        'Permission Denied',
        editingAsset
          ? 'You do not have permission to edit capital assets.'
          : 'You do not have permission to add capital assets.'
      );
      return;
    }

    const selectedSupplier = suppliers.find((s) => s.id === formSupplierId);
    const finalVendor = selectedSupplier ? selectedSupplier.name : (formVendor.trim() || 'General Vendor');
    const finalPhone = selectedSupplier ? (selectedSupplier.phone || formVendorPhone.trim()) : (formVendorPhone.trim() || undefined);
    const depRate = parseFloat(formDepreciationRate) || 10;
    const now = Date.now();

    // ---------------- MULTI-ITEM LOT PURCHASE MODE ----------------
    if (modalMode === 'lot' && !editingAsset) {
      const validItems = lotItems.filter(
        (it) => it.name.trim() && (parseFloat(it.cost) || 0) > 0 && (parseInt(it.quantity, 10) || 0) > 0
      );
      if (validItems.length === 0) {
        alertMsg('Missing Items', 'Please add at least one valid item with description, quantity, and unit cost.');
        return;
      }

      const totalBill = validItems.reduce((sum, it) => {
        const q = parseInt(it.quantity, 10) || 1;
        const c = parseFloat(it.cost) || 0;
        return sum + q * c;
      }, 0);

      const paidAmount = parseFloat(lotPaidAmount) || 0;
      if (paidAmount < 0) {
        alertMsg('Invalid Payment', 'Paid amount cannot be negative.');
        return;
      }
      const balanceDue = Math.max(0, totalBill - paidAmount);

      const poItems = validItems.map((it, idx) => {
        const q = parseInt(it.quantity, 10) || 1;
        const c = parseFloat(it.cost) || 0;
        const itemTotal = q * c;

        addAsset({
          assetCode: `AST-${(it.category || 'GEN').slice(0, 3).toUpperCase()}-${now.toString().slice(-4)}-${idx + 1}`,
          name: it.name.trim(),
          category: it.category || assetCategories[0] || ASSET_CATEGORIES[0],
          purchaseDate: now,
          cost: c,
          quantity: q,
          totalCost: itemTotal,
          vendor: finalVendor,
          vendorPhone: finalPhone,
          supplierId: formSupplierId || undefined,
          supplierName: selectedSupplier ? selectedSupplier.name : undefined,
          isCapEx: formIsCapEx,
          invoiceNo: formInvoiceNo.trim() || undefined,
          location: formLocation.trim() || 'Main Dining Hall',
          condition: formCondition,
          status: formStatus,
          depreciationRateYearly: depRate,
          notes: lotNotes.trim() || undefined,
        });

        return {
          name: it.name.trim(),
          category: it.category,
          unit: 'unit',
          qtyOrdered: q,
          qtyReceived: q,
          unitCost: c,
          totalCost: itemTotal,
        };
      });

      if (selectedSupplier) {
        const poId = `PO-AST-${now.toString().slice(-5)}`;
        addPurchaseOrder(
          {
            poNumber: poId,
            supplierId: selectedSupplier.id,
            supplierName: selectedSupplier.name,
            supplierType: 'assets',
            invoiceNo: formInvoiceNo.trim() || undefined,
            orderDate: now,
            deliveryDate: now,
            status: 'received',
            paymentStatus: paidAmount >= totalBill ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
            items: poItems,
            subtotal: totalBill,
            discount: 0,
            tax: 0,
            freight: 0,
            totalAmount: totalBill,
            amountPaid: paidAmount,
            balanceDue: balanceDue,
            paymentMethod: lotPaymentMethod,
            receivedBy: user?.name || 'Manager',
            notes: lotNotes.trim() || `CapEx Purchase: ${validItems.length} items (${formInvoiceNo || 'No Invoice'})`,
          },
          {
            autoReceiveToInventory: false,
            autoRecordExpense: false,
          }
        );

        if (paidAmount > 0) {
          recordSupplierPayment(
            {
              supplierId: selectedSupplier.id,
              supplierName: selectedSupplier.name,
              amount: paidAmount,
              method: lotPaymentMethod,
              paidBy: user?.name || 'Manager',
              notes: `Initial payment for Asset Invoice ${formInvoiceNo.trim() || poId}`,
            },
            {
              autoRecordExpense: true,
            }
          );
        }
      }

      alertMsg(
        'Multi-Item Asset Lot Registered',
        `Successfully registered ${validItems.length} capital assets.\nTotal Bill: ${money(totalBill)}\nPaid Now: ${money(paidAmount)}\nSupplier Balance Due: ${money(balanceDue)}`
      );
      setIsAddModalOpen(false);
      return;
    }

    // ---------------- SINGLE ASSET ITEM MODE ----------------
    if (!formName.trim()) {
      alertMsg('Missing Information', 'Please enter the asset name.');
      return;
    }
    const cost = parseFloat(formCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      alertMsg('Invalid Cost', 'Please enter a valid purchase cost.');
      return;
    }
    const qty = parseInt(formQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      alertMsg('Invalid Quantity', 'Please enter a valid quantity.');
      return;
    }
    const totalCost = cost * qty;

    if (editingAsset) {
      updateAsset(editingAsset.id, {
        name: formName.trim(),
        urduName: formUrduName.trim() || undefined,
        category: formCategory,
        cost,
        quantity: qty,
        totalCost,
        vendor: finalVendor,
        vendorPhone: finalPhone,
        supplierId: formSupplierId || undefined,
        supplierName: selectedSupplier ? selectedSupplier.name : undefined,
        isCapEx: formIsCapEx,
        invoiceNo: formInvoiceNo.trim() || undefined,
        location: formLocation.trim() || 'Main Kitchen',
        condition: formCondition,
        status: formStatus,
        depreciationRateYearly: depRate,
        serialNumber: formSerial.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      alertMsg('Asset Updated', `[${editingAsset.assetCode}] ${formName} was updated successfully.`);
    } else {
      addAsset({
        assetCode: `AST-${formCategory.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
        name: formName.trim(),
        urduName: formUrduName.trim() || undefined,
        category: formCategory,
        purchaseDate: Date.now(),
        cost,
        quantity: qty,
        totalCost,
        vendor: finalVendor,
        vendorPhone: finalPhone,
        supplierId: formSupplierId || undefined,
        supplierName: selectedSupplier ? selectedSupplier.name : undefined,
        isCapEx: formIsCapEx,
        invoiceNo: formInvoiceNo.trim() || undefined,
        location: formLocation.trim() || 'Main Kitchen',
        condition: formCondition,
        status: formStatus,
        depreciationRateYearly: depRate,
        serialNumber: formSerial.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      alertMsg('Capital Asset Added', `New capital investment ${formName} (${money(totalCost)}) recorded.`);
    }
    setIsAddModalOpen(false);
  };

  const handleDelete = (ast: Asset) => {
    if (!canDeleteAssets) {
      alertMsg('Permission Denied', 'You do not have permission to delete capital assets.');
      return;
    }
    const confirm = () => {
      deleteAsset(ast.id);
      alertMsg('Asset Removed', `[${ast.assetCode}] ${ast.name} has been removed.`);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete asset [${ast.assetCode}] ${ast.name}?`)) {
        confirm();
      }
    } else {
      Alert.alert('Confirm Delete', `Delete asset [${ast.assetCode}] ${ast.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirm },
      ]);
    }
  };

  const handleSaveMaintenance = () => {
    if (!canEditAssets) {
      alertMsg('Permission Denied', 'You do not have permission to log asset service or maintenance.');
      return;
    }
    if (!maintenanceAsset) return;
    const cost = parseFloat(maintCost);
    if (!Number.isFinite(cost) || cost < 0) {
      alertMsg('Invalid Cost', 'Please enter a valid repair cost.');
      return;
    }
    if (!maintDesc.trim()) {
      alertMsg('Missing Description', 'Please describe the repair or service performed.');
      return;
    }

    addAssetMaintenanceLog(
      maintenanceAsset.id,
      {
        date: Date.now(),
        cost,
        description: maintDesc.trim(),
        performedBy: maintTech.trim() || user?.name || 'Technician',
      },
      {
        autoRecordExpense: maintAutoExpense && cost > 0,
        paidBy: user?.name || 'Manager',
      }
    );

    alertMsg(
      'Service Logged',
      `Maintenance of ${money(cost)} recorded for [${maintenanceAsset.assetCode}]. ${maintAutoExpense && cost > 0 ? 'Also booked into restaurant expenses.' : ''
      }`
    );
    setMaintenanceAsset(null);
    setMaintCost('');
    setMaintDesc('');
    setMaintTech('');
  };

  function alertMsg(title: string, msg: string) {
    if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
    else Alert.alert(title, msg);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Light Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push(backRoute as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={LIGHT.burgundy} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={[styles.titleRow, { flexWrap: 'wrap' }]}>
              <Ionicons name="diamond" size={20} color={LIGHT.burgundy} />
              <Text style={styles.headerTitle}>Assets & Capital Capex</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>INVESTMENT AUDIT</Text>
              </View>
            </View>
            <Text style={styles.headerSub}>
              Heavy machinery, furniture, interior, generators, and capital inventory ledger
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <TouchableOpacity
            style={[styles.addAssetBtn, { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' }]}
            onPress={() => setIsManageCategoriesOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="folder-open-outline" size={17} color={LIGHT.burgundy} />
            <Text style={[styles.addAssetBtnText, { color: LIGHT.burgundy }]}>
              Categories ({assetCategories.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addAssetBtn, { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' }]}
            onPress={() => {
              setSelectedLedgerSupplierId(suppliers.find((s) => (s.currentBalance || 0) > 0)?.id || suppliers[0]?.id || null);
              setIsSupplierLedgersOpen(true);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="book-outline" size={17} color="#92400E" />
            <Text style={[styles.addAssetBtnText, { color: '#92400E' }]}>
              Supplier Khatas ({suppliers.filter((s) => (s.currentBalance || 0) > 0).length} Due)
            </Text>
          </TouchableOpacity>

          {canAddAssets && (
            <TouchableOpacity style={styles.addAssetBtn} onPress={() => openAddModal('lot')} activeOpacity={0.85}>
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.addAssetBtnText}>+ Purchase Asset Lot</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Light KPI Deck */}
        <View style={styles.kpiGrid}>
          {/* Total Invested */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.goldBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>TOTAL CAPITAL INVESTED</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.goldSoft }]}>
                <Ionicons name="wallet-outline" size={18} color={LIGHT.gold} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.gold }]}>{money(stats.totalInvested)}</Text>
            <Text style={styles.kpiHint}>{stats.totalAssetsCount} primary equipment & asset lots</Text>
          </View>

          {/* Active Book Value */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.emeraldBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>ACTIVE BOOK VALUE</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.emeraldSoft }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={LIGHT.emerald} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.emerald }]}>{money(stats.activeValue)}</Text>
            <Text style={styles.kpiHint}>{stats.activeCount} live units in daily service</Text>
          </View>

          {/* In Maintenance */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.amberBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>IN MAINTENANCE</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.amberSoft }]}>
                <Ionicons name="construct-outline" size={18} color={LIGHT.amber} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.amber }]}>
              {stats.maintCount} <Text style={{ fontSize: 15, fontWeight: '400', color: LIGHT.textSecondary }}>Units</Text>
            </Text>
            <Text style={styles.kpiHint}>Under active service or inspection</Text>
          </View>

          {/* Maintenance Spend */}
          <View style={[styles.kpiCard, { borderColor: LIGHT.blueBorder }]}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>TOTAL REPAIR EXPENSES</Text>
              <View style={[styles.kpiIconBox, { backgroundColor: LIGHT.blueSoft }]}>
                <Ionicons name="repeat-outline" size={18} color={LIGHT.blue} />
              </View>
            </View>
            <Text style={[styles.kpiValue, { color: LIGHT.blue }]}>{money(stats.totalMaintSpent)}</Text>
            <Text style={styles.kpiHint}>Accumulated maintenance logs</Text>
          </View>
        </View>

        {/* Search and Category Filters */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={LIGHT.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by asset code, name, vendor, location, serial..."
              placeholderTextColor={LIGHT.textDim}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={LIGHT.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category & Status Dropdown Filters */}
          <View style={[styles.filterDropdownRow, isMobile && { flexDirection: 'column' }]}>
            <RoyalDropdown
              style={{ flex: 1 }}
              label="Filter by Asset Category"
              icon="funnel-outline"
              placeholder="All Categories"
              options={[
                { label: `All Categories (${assets.length})`, value: 'All' },
                ...assetCategories.map((cat) => ({
                  label: `${cat} (${assets.filter((a) => a.category === cat).length})`,
                  value: cat,
                })),
              ]}
              value={selectedCategory}
              onSelect={(val) => setSelectedCategory(val)}
              searchable
            />
            <RoyalDropdown
              style={{ flex: isMobile ? 1 : 0.6 }}
              label="Filter by Operational Status"
              icon="shield-checkmark-outline"
              placeholder="All Statuses"
              options={[
                { label: `All Statuses (${assets.length})`, value: 'All' },
                ...STATUSES.map((s) => ({
                  label: `${s.label} (${assets.filter((a) => a.status === s.key).length})`,
                  value: s.key,
                })),
              ]}
              value={selectedStatus}
              onSelect={(val) => setSelectedStatus(val)}
            />
          </View>
        </View>

        {/* Asset Cards List */}
        <View style={styles.assetList}>
          {filteredAssets.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={48} color={LIGHT.textDim} />
              <Text style={styles.emptyTitle}>No Capital Assets Found</Text>
              <Text style={styles.emptySub}>
                Try adjusting your search criteria or register a new capital asset above.
              </Text>
            </View>
          ) : (
            <>
              {/* Desktop Table Column Header (Same as Suppliers screen) */}
              {!isMobile && (
                <View style={styles.tableHeaderRow}>
                  <View style={[styles.thCol, { flex: 2.8, minWidth: 220 }]}>
                    <Text style={styles.thText}>ASSET CODE & NAME</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 2.2, minWidth: 170 }]}>
                    <Text style={styles.thText}>CATEGORY & LOCATION</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                    <Text style={styles.thText}>PURCHASE VALUE</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 2.0, minWidth: 160 }]}>
                    <Text style={styles.thText}>BOOK VALUE & STATUS</Text>
                  </View>
                  <View style={[styles.thCol, { flex: 2.4, minWidth: 200, alignItems: 'flex-end' }]}>
                    <Text style={styles.thText}>ACTIONS</Text>
                  </View>
                </View>
              )}

              {assetsPagination.paginatedData.map((ast) => {
                const cond = CONDITIONS.find((c) => c.key === ast.condition) || CONDITIONS[1];
                const stat = STATUSES.find((s) => s.key === ast.status) || STATUSES[0];
                const maintTotal = (ast.maintenanceLogs || []).reduce((acc, l) => acc + (l.cost || 0), 0);
                const linkedDamages = damageRecords.filter(
                  (d) => d.assetId === ast.id || d.assetCode === ast.assetCode
                );
                const damageLoss = linkedDamages.reduce((sum, d) => sum + (d.totalLoss || 0), 0);
                const damageUnits = linkedDamages.reduce((sum, d) => sum + (d.quantity || 1), 0);

                if (isMobile) {
                  return (
                    <View
                      key={ast.id}
                      style={[
                        styles.mobileAssetCard,
                        { borderLeftColor: cond.color || '#10B981' },
                      ]}
                    >
                      {/* Top: Code + Name on left, Cost on right */}
                      <View style={styles.mobileCardTopRow}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.codeTagCompact}>
                            <Text style={styles.codeTagCompactText}>{ast.assetCode}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowAssetName} numberOfLines={1}>{ast.name}</Text>
                            {ast.urduName ? <Text style={styles.rowUrduName} numberOfLines={1}>{ast.urduName}</Text> : null}
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.rowCostGold}>{money(ast.totalCost)}</Text>
                          <Text style={styles.rowCostSub}>{ast.quantity}x @ {money(ast.cost)}</Text>
                        </View>
                      </View>

                      {/* Mid: Category, Location & Badges */}
                      <View style={styles.mobileCardMidRow}>
                        <View style={styles.categoryBadgeCompact}>
                          <Ionicons name="pricetag-outline" size={11} color={LIGHT.burgundy} />
                          <Text style={styles.categoryBadgeCompactText} numberOfLines={1}>{ast.category}</Text>
                        </View>
                        {ast.isCapEx ? (
                          <View style={styles.capexBadge}>
                            <Ionicons name="diamond" size={9} color="#B48214" />
                            <Text style={styles.capexBadgeText}>CapEx</Text>
                          </View>
                        ) : null}
                        {ast.supplierName ? (
                          <TouchableOpacity
                            style={styles.supplierBadge}
                            onPress={() => {
                              if (ast.supplierId) {
                                setSelectedLedgerSupplierId(ast.supplierId);
                                setIsSupplierLedgersOpen(true);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="business" size={9} color="#0D9488" />
                            <Text style={styles.supplierBadgeText} numberOfLines={1}>
                              {ast.supplierName} (Khata)
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="location-outline" size={11} color={LIGHT.burgundy} />
                          <Text style={styles.rowLocationText} numberOfLines={1}>{ast.location || 'Kitchen'}</Text>
                        </View>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: cond.bg, borderColor: cond.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: cond.color }]}>{cond.label}</Text>
                        </View>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: stat.color }]}>{stat.label}</Text>
                        </View>
                      </View>

                      {/* Maintenance / Damage Notes if any */}
                      {(maintTotal > 0 || linkedDamages.length > 0) && (
                        <View style={styles.mobileAlertRow}>
                          {maintTotal > 0 && (
                            <View style={styles.microBadgeAmber}>
                              <Ionicons name="construct" size={10} color={LIGHT.amber} />
                              <Text style={styles.microBadgeAmberText}>Service: {money(maintTotal)}</Text>
                            </View>
                          )}
                          {linkedDamages.length > 0 && (
                            <TouchableOpacity
                              onPress={() => router.push(role === 'admin' ? '/admin/damages' : '/manager/damages')}
                              style={styles.microBadgeRose}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="alert-circle" size={10} color={LIGHT.rose} />
                              <Text style={styles.microBadgeRoseText}>{linkedDamages.length} Damaged ({money(damageLoss)})</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* Actions */}
                      <View style={styles.mobileCardActionRow}>
                        <TouchableOpacity
                          style={styles.actionBtnAudit}
                          onPress={() => setViewAsset(ast)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="document-text-outline" size={13} color={LIGHT.burgundy} />
                          <Text style={styles.actionBtnAuditText}>Audit</Text>
                        </TouchableOpacity>

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnService}
                            onPress={() => setMaintenanceAsset(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="build-outline" size={13} color={LIGHT.amber} />
                            <Text style={styles.actionBtnServiceText}>Service</Text>
                          </TouchableOpacity>
                        )}

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnEditCompact}
                            onPress={() => openEditModal(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="create-outline" size={13} color="#475569" />
                          </TouchableOpacity>
                        )}

                        {canDeleteAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnDeleteCompact}
                            onPress={() => handleDelete(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={13} color={LIGHT.rose} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }

                // Desktop / Tablet Horizontal Compact Strip (Same as Suppliers screen)
                return (
                  <View
                    key={ast.id}
                    style={[
                      styles.astRowCard,
                      { borderLeftColor: cond.color || '#10B981' },
                    ]}
                    {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                  >
                    {/* 1. Asset Code & Name */}
                    <View style={[styles.rowCol, { flex: 2.8, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                      <View style={styles.codeTagCompact}>
                        <Text style={styles.codeTagCompactText}>{ast.assetCode}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowAssetName} numberOfLines={1}>{ast.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {ast.urduName ? (
                            <Text style={styles.rowUrduName} numberOfLines={1}>{ast.urduName}</Text>
                          ) : null}
                          <Text style={styles.rowQtyText}>• Qty: {ast.quantity || 1}</Text>
                        </View>
                      </View>
                    </View>

                    {/* 2. Category & Location */}
                    <View style={[styles.rowCol, { flex: 2.2, minWidth: 170, gap: 2 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <View style={styles.categoryBadgeCompact}>
                          <Ionicons name="pricetag-outline" size={10} color={LIGHT.burgundy} />
                          <Text style={styles.categoryBadgeCompactText} numberOfLines={1}>{ast.category}</Text>
                        </View>
                        {ast.isCapEx ? (
                          <View style={styles.capexBadge}>
                            <Ionicons name="diamond" size={9} color="#B48214" />
                            <Text style={styles.capexBadgeText}>CapEx</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                        <Ionicons name="location-outline" size={11} color={LIGHT.burgundy} />
                        <Text style={styles.rowLocationText} numberOfLines={1}>{ast.location || 'Kitchen'}</Text>
                        {ast.supplierName ? (
                          <TouchableOpacity
                            style={styles.supplierBadge}
                            onPress={() => {
                              if (ast.supplierId) {
                                setSelectedLedgerSupplierId(ast.supplierId);
                                setIsSupplierLedgersOpen(true);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="business" size={9} color="#0D9488" />
                            <Text style={styles.supplierBadgeText} numberOfLines={1}>
                              {ast.supplierName} (Khata)
                            </Text>
                          </TouchableOpacity>
                        ) : ast.vendor ? (
                          <Text style={styles.rowVendorText} numberOfLines={1}>• {ast.vendor}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* 3. Purchase Value */}
                    <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                      <Text style={styles.rowCostGold}>{money(ast.totalCost)}</Text>
                      <Text style={styles.rowCostSub}>
                        {ast.quantity}x @ {money(ast.cost)}
                      </Text>
                    </View>

                    {/* 4. Book Value & Status */}
                    <View style={[styles.rowCol, { flex: 2.0, minWidth: 160, gap: 2 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.rowBookValue}>{money(ast.currentValue || ast.totalCost)}</Text>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: cond.bg, borderColor: cond.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: cond.color }]}>{cond.label}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                        <View style={[styles.pillBadgeCompact, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                          <Text style={[styles.pillBadgeCompactText, { color: stat.color }]}>{stat.label}</Text>
                        </View>
                        {maintTotal > 0 && (
                          <TouchableOpacity
                            onPress={() => setMaintenanceAsset(ast)}
                            style={styles.microBadgeAmber}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="construct" size={10} color={LIGHT.amber} />
                            <Text style={styles.microBadgeAmberText}>{money(maintTotal)}</Text>
                          </TouchableOpacity>
                        )}
                        {linkedDamages.length > 0 && (
                          <TouchableOpacity
                            onPress={() => router.push(role === 'admin' ? '/admin/damages' : '/manager/damages')}
                            style={styles.microBadgeRose}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="alert-circle" size={10} color={LIGHT.rose} />
                            <Text style={styles.microBadgeRoseText}>{linkedDamages.length} dmg</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* 5. Actions */}
                    <View style={[styles.rowCol, { flex: 2.4, minWidth: 200, alignItems: 'flex-end' }]}>
                      <View style={styles.actionRowCompact}>
                        <TouchableOpacity
                          style={styles.actionBtnAudit}
                          onPress={() => setViewAsset(ast)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="document-text-outline" size={13} color={LIGHT.burgundy} />
                          <Text style={styles.actionBtnAuditText}>Audit</Text>
                        </TouchableOpacity>

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnService}
                            onPress={() => setMaintenanceAsset(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="build-outline" size={13} color={LIGHT.amber} />
                            <Text style={styles.actionBtnServiceText}>Service</Text>
                          </TouchableOpacity>
                        )}

                        {canEditAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnEditCompact}
                            onPress={() => openEditModal(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="create-outline" size={13} color="#475569" />
                          </TouchableOpacity>
                        )}

                        {canDeleteAssets && (
                          <TouchableOpacity
                            style={styles.actionBtnDeleteCompact}
                            onPress={() => handleDelete(ast)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={13} color={LIGHT.rose} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {filteredAssets.length > 0 && (
            <PaginationControl
              currentPage={assetsPagination.currentPage}
              totalPages={assetsPagination.totalPages}
              pageSize={assetsPagination.pageSize}
              totalItems={assetsPagination.totalItems}
              onPageChange={assetsPagination.goToPage}
              onPageSizeChange={assetsPagination.setPageSize}
              itemName="assets"
            />
          )}
        </View>
      </ScrollView>

      {/* -------------------- ADD / EDIT MODAL -------------------- */}
      <Modal visible={isAddModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: modalMode === 'lot' ? 760 : 640 }, isMobile && { width: '96%', maxHeight: '94%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={modalMode === 'lot' ? 'receipt' : 'cube'} size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>
                  {editingAsset
                    ? `Edit [${editingAsset.assetCode}]`
                    : modalMode === 'lot'
                    ? 'Purchase Capital Asset Lot (Multi-Item Invoice)'
                    : 'Register Single Capital Asset'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Entry Mode Switcher (When adding new) */}
              {!editingAsset && (
                <View style={styles.entryModeToggle}>
                  <TouchableOpacity
                    style={[styles.entryModeBtn, modalMode === 'lot' && styles.entryModeBtnActiveLot]}
                    onPress={() => setModalMode('lot')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="receipt" size={16} color={modalMode === 'lot' ? '#FFFFFF' : '#475569'} />
                    <Text style={[styles.entryModeBtnText, modalMode === 'lot' && styles.entryModeBtnTextActive]}>
                      Multi-Item Invoice Lot (Khata)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.entryModeBtn, modalMode === 'single' && styles.entryModeBtnActive]}
                    onPress={() => setModalMode('single')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="cube-outline" size={16} color={modalMode === 'single' ? '#FFFFFF' : '#475569'} />
                    <Text style={[styles.entryModeBtnText, modalMode === 'single' && styles.entryModeBtnTextActive]}>
                      Single Equipment Item
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ==================== MULTI-ITEM LOT MODE ==================== */}
              {modalMode === 'lot' && !editingAsset ? (
                <>
                  {/* Supplier & Invoice Header Card */}
                  <View style={styles.lotSectionBox}>
                    <Text style={styles.lotSectionTitle}>1. Supplier & Invoice Details</Text>

                    {/* Registered Supplier with Quick Add */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <RoyalDropdown
                          label="Registered Supplier (Sync with Ledger)"
                          icon="business-outline"
                          placeholder="Select registered vendor (or Cash Vendor)..."
                          options={[
                            { label: 'Direct / Cash Purchase (No registered supplier)', value: '' },
                            ...suppliers.map((s) => ({
                              label: `${s.name}${s.category ? ` (${s.category})` : ''} • Bal: Rs. ${(s.currentBalance || 0).toLocaleString()}`,
                              value: s.id,
                            })),
                          ]}
                          value={formSupplierId}
                          onSelect={(supId) => {
                            setFormSupplierId(supId);
                            const found = suppliers.find((s) => s.id === supId);
                            if (found) {
                              setFormVendor(found.name);
                              if (found.phone) setFormVendorPhone(found.phone);
                            }
                          }}
                          searchable
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.addSupplierQuickBtn}
                        onPress={() => {
                          setQuickSupplierCategory(assetCategories[0] || ASSET_CATEGORIES[0]);
                          setIsQuickSupplierModalOpen(true);
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="person-add" size={15} color="#FFFFFF" />
                        <Text style={styles.addSupplierQuickBtnText}>+ New</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Vendor Name & Phone (if not registered supplier) */}
                    {!formSupplierId && (
                      <View style={styles.twoCol}>
                        <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                          <Text style={styles.inputLabel}>Vendor / Counter Party Name</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. Royal Wood Furnishers"
                            placeholderTextColor={LIGHT.textDim}
                            value={formVendor}
                            onChangeText={setFormVendor}
                          />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                          <Text style={styles.inputLabel}>Vendor Phone</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. 0300-1234567"
                            placeholderTextColor={LIGHT.textDim}
                            value={formVendorPhone}
                            onChangeText={setFormVendorPhone}
                          />
                        </View>
                      </View>
                    )}

                    {/* Invoice No & Location */}
                    <View style={styles.twoCol}>
                      <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                        <Text style={styles.inputLabel}>Invoice / Bill / Challan No.</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. RWF-2024-889"
                          placeholderTextColor={LIGHT.textDim}
                          value={formInvoiceNo}
                          onChangeText={setFormInvoiceNo}
                        />
                      </View>
                      <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                        <Text style={styles.inputLabel}>Delivery Location / Floor</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Main Dining Hall & Terrace"
                          placeholderTextColor={LIGHT.textDim}
                          value={formLocation}
                          onChangeText={setFormLocation}
                        />
                      </View>
                    </View>

                    {/* CapEx Toggle Box */}
                    <TouchableOpacity
                      style={[styles.capexToggleBox, formIsCapEx && styles.capexToggleBoxActive, { marginBottom: 0 }]}
                      onPress={() => setFormIsCapEx(!formIsCapEx)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={formIsCapEx ? 'diamond' : 'square-outline'}
                        size={18}
                        color={formIsCapEx ? '#B48214' : LIGHT.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.capexToggleTitle, formIsCapEx && { color: '#854D0E' }]}>
                          Capital Investment (CapEx Asset)
                        </Text>
                        <Text style={styles.capexToggleSub}>
                          Balance sheet asset equipment. Not deducted from daily operational restaurant expenses.
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Multi-Item Lot Items List */}
                  <View style={styles.lotSectionBox}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={styles.lotSectionTitle}>
                        2. Invoice Asset Items ({lotItems.length})
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: LIGHT.gold }}>
                        Subtotal: {money(lotTotalBill)}
                      </Text>
                    </View>

                    {lotItems.map((item, idx) => {
                      const itemQty = parseInt(item.quantity, 10) || 0;
                      const itemCost = parseFloat(item.cost) || 0;
                      const itemTotal = itemQty * itemCost;

                      return (
                        <View key={item.id} style={styles.lotItemCard}>
                          <View style={styles.lotItemCardHeader}>
                            <View style={styles.lotItemNumberBadge}>
                              <Text style={styles.lotItemNumberText}>#{idx + 1}</Text>
                            </View>
                            <Text style={styles.lotItemTotalPreview}>
                              Total: {money(itemTotal)}
                            </Text>
                            {lotItems.length > 1 && (
                              <TouchableOpacity
                                onPress={() => setLotItems(lotItems.filter((it) => it.id !== item.id))}
                                style={{ padding: 4 }}
                              >
                                <Ionicons name="trash-outline" size={16} color={LIGHT.rose} />
                              </TouchableOpacity>
                            )}
                          </View>

                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Item Description / Asset Name *</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. Dining Chairs Wooden, 4-Seater Table, Chiller"
                              placeholderTextColor={LIGHT.textDim}
                              value={item.name}
                              onChangeText={(val) => {
                                setLotItems(lotItems.map((it) => (it.id === item.id ? { ...it, name: val } : it)));
                              }}
                            />
                          </View>

                          <View style={{ marginBottom: 10 }}>
                            <RoyalDropdown
                              label="Category"
                              required
                              icon="pricetag-outline"
                              placeholder="Select category..."
                              options={assetCategories.map((cat) => ({ label: cat, value: cat }))}
                              value={item.category}
                              onSelect={(cat) => {
                                setLotItems(lotItems.map((it) => (it.id === item.id ? { ...it, category: cat } : it)));
                              }}
                              searchable
                            />
                          </View>

                          <View style={styles.twoCol}>
                            <View style={[styles.inputGroup, { flex: 1, minWidth: 140 }]}>
                              <Text style={styles.inputLabel}>Quantity (Units) *</Text>
                              <TextInput
                                style={styles.input}
                                placeholder="1"
                                placeholderTextColor={LIGHT.textDim}
                                keyboardType="numeric"
                                value={item.quantity}
                                onChangeText={(val) => {
                                  setLotItems(lotItems.map((it) => (it.id === item.id ? { ...it, quantity: val } : it)));
                                }}
                              />
                            </View>

                            <View style={[styles.inputGroup, { flex: 1, minWidth: 140 }]}>
                              <Text style={styles.inputLabel}>Unit Purchase Cost (PKR) *</Text>
                              <TextInput
                                style={styles.input}
                                placeholder="e.g. 4500"
                                placeholderTextColor={LIGHT.textDim}
                                keyboardType="numeric"
                                value={item.cost}
                                onChangeText={(val) => {
                                  setLotItems(lotItems.map((it) => (it.id === item.id ? { ...it, cost: val } : it)));
                                }}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      style={styles.addLotRowBtn}
                      onPress={() => {
                        setLotItems([
                          ...lotItems,
                          {
                            id: `item-${Date.now()}-${lotItems.length + 1}`,
                            name: '',
                            category: assetCategories[0] || ASSET_CATEGORIES[0],
                            quantity: '1',
                            cost: '',
                          },
                        ]);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={LIGHT.burgundy} />
                      <Text style={styles.addLotRowBtnText}>+ Add Another Asset Item to Invoice</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Bill Total & Khata Settlement Box */}
                  <View style={[styles.lotSectionBox, { borderColor: '#FDE68A', backgroundColor: '#FFFDF5' }]}>
                    <Text style={[styles.lotSectionTitle, { color: '#92400E' }]}>
                      3. Invoice Bill & Supplier Khata Settlement
                    </Text>

                    {/* Total Bill Row */}
                    <View style={styles.billTotalRow}>
                      <Text style={styles.billTotalLabel}>Total Invoice Bill (PKR):</Text>
                      <Text style={styles.billTotalValue}>{money(lotTotalBill)}</Text>
                    </View>

                    {/* Amount Paid Now */}
                    <View style={[styles.inputGroup, { marginTop: 10 }]}>
                      <Text style={styles.inputLabel}>Amount Paid to Supplier Now (PKR) *</Text>
                      <TextInput
                        style={[styles.input, { fontSize: 16, fontWeight: '800', color: LIGHT.emerald }]}
                        placeholder="0"
                        placeholderTextColor={LIGHT.textDim}
                        keyboardType="numeric"
                        value={lotPaidAmount}
                        onChangeText={setLotPaidAmount}
                      />
                    </View>

                    {/* Quick Payment Presets */}
                    <View style={styles.quickPresetRow}>
                      <TouchableOpacity
                        style={styles.quickPresetBtn}
                        onPress={() => setLotPaidAmount(String(lotTotalBill))}
                      >
                        <Text style={styles.quickPresetBtnText}>Full Paid ({money(lotTotalBill)})</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickPresetBtn}
                        onPress={() => setLotPaidAmount(String(Math.round(lotTotalBill / 2)))}
                      >
                        <Text style={styles.quickPresetBtnText}>50% Advance</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickPresetBtn}
                        onPress={() => setLotPaidAmount('0')}
                      >
                        <Text style={styles.quickPresetBtnText}>Full Credit (Unpaid 0)</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Balance Payable Alert */}
                    <View
                      style={[
                        styles.khataNoticeBox,
                        lotBalanceDue > 0 ? styles.khataNoticeBoxDue : styles.khataNoticeBoxClear,
                      ]}
                    >
                      <Ionicons
                        name={lotBalanceDue > 0 ? 'alert-circle' : 'checkmark-circle'}
                        size={18}
                        color={lotBalanceDue > 0 ? '#BE123C' : '#047857'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.khataNoticeTitle, lotBalanceDue > 0 ? { color: '#9F1239' } : { color: '#065F46' }]}>
                          {lotBalanceDue > 0
                            ? `Remaining Balance: ${money(lotBalanceDue)}`
                            : 'Fully Paid & Settled'}
                        </Text>
                        <Text style={styles.khataNoticeSub}>
                          {lotBalanceDue > 0
                            ? formSupplierId
                              ? `This Rs. ${lotBalanceDue.toLocaleString()} will be automatically added to the supplier's Khata ledger as pending payable.`
                              : `Note: Select a Registered Supplier above to track this Rs. ${lotBalanceDue.toLocaleString()} in their Khata ledger.`
                            : 'Full payment completed. No pending payable balance will be created.'}
                        </Text>
                      </View>
                    </View>

                    {/* Payment Method */}
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.inputLabel}>Payment Method</Text>
                      <View style={styles.methodToggleRow}>
                        <TouchableOpacity
                          style={[styles.methodToggleBtn, lotPaymentMethod === 'cash' && styles.methodToggleBtnActive]}
                          onPress={() => setLotPaymentMethod('cash')}
                        >
                          <Ionicons name="cash-outline" size={15} color={lotPaymentMethod === 'cash' ? '#FFFFFF' : '#475569'} />
                          <Text style={[styles.methodToggleBtnText, lotPaymentMethod === 'cash' && styles.methodToggleBtnTextActive]}>
                            Cash
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.methodToggleBtn, lotPaymentMethod === 'online' && styles.methodToggleBtnActive]}
                          onPress={() => setLotPaymentMethod('online')}
                        >
                          <Ionicons name="card-outline" size={15} color={lotPaymentMethod === 'online' ? '#FFFFFF' : '#475569'} />
                          <Text style={[styles.methodToggleBtnText, lotPaymentMethod === 'online' && styles.methodToggleBtnTextActive]}>
                            Bank / Online
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.methodToggleBtn, lotPaymentMethod === 'cheque' && styles.methodToggleBtnActive]}
                          onPress={() => setLotPaymentMethod('cheque')}
                        >
                          <Ionicons name="document-text-outline" size={15} color={lotPaymentMethod === 'cheque' ? '#FFFFFF' : '#475569'} />
                          <Text style={[styles.methodToggleBtnText, lotPaymentMethod === 'cheque' && styles.methodToggleBtnTextActive]}>
                            Cheque
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Lot Notes */}
                    <View style={[styles.inputGroup, { marginTop: 10 }]}>
                      <Text style={styles.inputLabel}>Invoice Notes / Terms</Text>
                      <TextInput
                        style={[styles.input, { height: 50 }]}
                        placeholder="e.g. Delivered to hall. Remaining payment due on installation."
                        placeholderTextColor={LIGHT.textDim}
                        value={lotNotes}
                        onChangeText={setLotNotes}
                      />
                    </View>
                  </View>
                </>
              ) : (
                /* ==================== SINGLE ASSET MODE ==================== */
                <>
                  {/* Asset Name */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Asset Name / Description *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Commercial 4-Burner Range Cooker"
                      placeholderTextColor={LIGHT.textDim}
                      value={formName}
                      onChangeText={setFormName}
                    />
                  </View>

                  {/* Urdu Name */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Urdu Name (Optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. کمرشل چولہا رینج"
                      placeholderTextColor={LIGHT.textDim}
                      value={formUrduName}
                      onChangeText={setFormUrduName}
                    />
                  </View>

                  {/* Category Dropdown with Manage Shortcut */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <RoyalDropdown
                        label="Asset Category"
                        required
                        icon="pricetag-outline"
                        placeholder="Select asset category..."
                        options={assetCategories.map((cat) => ({ label: cat, value: cat }))}
                        value={formCategory}
                        onSelect={(cat) => setFormCategory(cat)}
                        searchable
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.inlineManageBtn}
                      onPress={() => setIsManageCategoriesOpen(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="folder-open-outline" size={18} color={LIGHT.burgundy} />
                    </TouchableOpacity>
                  </View>

                  {/* CapEx vs Regular Outlay Toggle */}
                  <TouchableOpacity
                    style={[styles.capexToggleBox, formIsCapEx && styles.capexToggleBoxActive]}
                    onPress={() => setFormIsCapEx(!formIsCapEx)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={formIsCapEx ? 'diamond' : 'square-outline'}
                      size={20}
                      color={formIsCapEx ? '#B48214' : LIGHT.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.capexToggleTitle, formIsCapEx && { color: '#854D0E' }]}>
                        Capital Investment (CapEx Asset)
                      </Text>
                      <Text style={styles.capexToggleSub}>
                        {formIsCapEx
                          ? 'Capitalized balance sheet equipment. Excluded from daily operating expenses.'
                          : 'Operational expense asset.'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Cost & Qty */}
                  <View style={styles.twoCol}>
                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Unit Purchase Cost (PKR) *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 250000"
                        placeholderTextColor={LIGHT.textDim}
                        keyboardType="numeric"
                        value={formCost}
                        onChangeText={setFormCost}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Quantity (Units) *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="1"
                        placeholderTextColor={LIGHT.textDim}
                        keyboardType="numeric"
                        value={formQty}
                        onChangeText={setFormQty}
                      />
                    </View>
                  </View>

                  {/* Linked Registered Supplier with + New Button */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <RoyalDropdown
                        label="Registered Supplier (Sync with Ledger)"
                        icon="business-outline"
                        placeholder="Direct / Cash Purchase (No registered supplier)"
                        options={[
                          { label: 'Direct / Cash Purchase (No registered supplier)', value: '' },
                          ...suppliers.map((s) => ({
                            label: `${s.name}${s.category ? ` (${s.category})` : ''} • Bal: Rs. ${(s.currentBalance || 0).toLocaleString()}`,
                            value: s.id,
                          })),
                        ]}
                        value={formSupplierId}
                        onSelect={(supId) => {
                          setFormSupplierId(supId);
                          const found = suppliers.find((s) => s.id === supId);
                          if (found) {
                            setFormVendor(found.name);
                            if (found.phone) setFormVendorPhone(found.phone);
                          }
                        }}
                        searchable
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.addSupplierQuickBtn}
                      onPress={() => {
                        setQuickSupplierCategory(assetCategories[0] || ASSET_CATEGORIES[0]);
                        setIsQuickSupplierModalOpen(true);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="person-add" size={15} color="#FFFFFF" />
                      <Text style={styles.addSupplierQuickBtnText}>+ New</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Vendor & Phone */}
                  <View style={styles.twoCol}>
                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Vendor / Counter Party Name</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Pak Kitchen Tech Ltd"
                        placeholderTextColor={LIGHT.textDim}
                        value={formVendor}
                        onChangeText={setFormVendor}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Vendor Phone</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 0300-1234567"
                        placeholderTextColor={LIGHT.textDim}
                        value={formVendorPhone}
                        onChangeText={setFormVendorPhone}
                      />
                    </View>
                  </View>

                  {/* Location & Invoice */}
                  <View style={styles.twoCol}>
                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Location / Floor Department</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Ground Floor Dining Hall"
                        placeholderTextColor={LIGHT.textDim}
                        value={formLocation}
                        onChangeText={setFormLocation}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Invoice / Bill No.</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. PKT-8821"
                        placeholderTextColor={LIGHT.textDim}
                        value={formInvoiceNo}
                        onChangeText={setFormInvoiceNo}
                      />
                    </View>
                  </View>

                  {/* Condition & Status Dropdowns */}
                  <View style={styles.twoCol}>
                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <RoyalDropdown
                        label="Physical Condition"
                        required
                        icon="sparkles-outline"
                        options={CONDITIONS.map((c) => ({ label: c.label, value: c.key }))}
                        value={formCondition}
                        onSelect={(c) => setFormCondition(c as AssetCondition)}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <RoyalDropdown
                        label="Operational Status"
                        required
                        icon="shield-checkmark-outline"
                        options={STATUSES.map((s) => ({ label: s.label, value: s.key }))}
                        value={formStatus}
                        onSelect={(s) => setFormStatus(s as AssetStatus)}
                      />
                    </View>
                  </View>

                  {/* Depreciation & Serial */}
                  <View style={styles.twoCol}>
                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Depreciation Rate (%/Year)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="10"
                        placeholderTextColor={LIGHT.textDim}
                        keyboardType="numeric"
                        value={formDepreciationRate}
                        onChangeText={setFormDepreciationRate}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1, minWidth: 160 }]}>
                      <Text style={styles.inputLabel}>Serial / Chassis No.</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. SN-981249"
                        placeholderTextColor={LIGHT.textDim}
                        value={formSerial}
                        onChangeText={setFormSerial}
                      />
                    </View>
                  </View>

                  {/* Notes */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Technical Notes & Specifications</Text>
                    <TextInput
                      style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                      placeholder="Warranty terms, power requirements (amps/phases), special maintenance notes..."
                      placeholderTextColor={LIGHT.textDim}
                      multiline
                      value={formNotes}
                      onChangeText={setFormNotes}
                    />
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsAddModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveAsset}>
                <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>
                  {editingAsset
                    ? 'Update Asset'
                    : modalMode === 'lot'
                    ? `Save Lot (${lotItems.length} Assets • ${money(lotTotalBill)})`
                    : 'Save Capital Asset'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- LOG MAINTENANCE MODAL -------------------- */}
      <Modal visible={!!maintenanceAsset} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 540 }, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="construct" size={20} color={LIGHT.amber} />
                <Text style={styles.modalTitle}>
                  Log Maintenance: [{maintenanceAsset?.assetCode}]
                </Text>
              </View>
              <TouchableOpacity onPress={() => setMaintenanceAsset(null)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={{ color: LIGHT.textSecondary, fontSize: 13, marginBottom: 14 }}>
                Record servicing, component replacements, oil change, or technicians fees for{' '}
                <Text style={{ color: LIGHT.burgundy, fontWeight: '700' }}>
                  {maintenanceAsset?.name}
                </Text>
                .
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service / Repair Cost (PKR) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 15000"
                  placeholderTextColor={LIGHT.textDim}
                  keyboardType="numeric"
                  value={maintCost}
                  onChangeText={setMaintCost}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Work Description *</Text>
                <TextInput
                  style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
                  placeholder="Detail the repair work (e.g., replacement of heating element, descaling, gas refill)..."
                  placeholderTextColor={LIGHT.textDim}
                  multiline
                  value={maintDesc}
                  onChangeText={setMaintDesc}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Technician / Company Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Engr. Asif or Pak Tech Services"
                  placeholderTextColor={LIGHT.textDim}
                  value={maintTech}
                  onChangeText={setMaintTech}
                />
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setMaintAutoExpense(!maintAutoExpense)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={maintAutoExpense ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={LIGHT.burgundy}
                />
                <Text style={styles.checkboxText}>
                  Automatically book this cost as cash expense under "Maintenance & Repair"
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setMaintenanceAsset(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveMaintenance}>
                <Ionicons name="build" size={17} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>Save Service Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- AUDIT SLIP / VIEW MODAL -------------------- */}
      <Modal visible={!!viewAsset} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 640 }, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="document-text" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>Capital Asset Audit Record</Text>
              </View>
              <TouchableOpacity onPress={() => setViewAsset(null)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            {viewAsset && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Print Sheet Simulation */}
                <View style={styles.sheetPaper}>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetRestName}>SULTAN RESTAURANT & RESORT</Text>
                    <Text style={styles.sheetDocTitle}>CAPITAL ASSET REGISTER & AUDIT CERTIFICATE</Text>
                    <Text style={styles.sheetCode}>TAG: {viewAsset.assetCode}</Text>
                  </View>

                  <View style={styles.sheetDivider} />

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Asset Name:</Text>
                    <Text style={styles.sheetValBold}>{viewAsset.name}</Text>
                  </View>

                  {viewAsset.urduName ? (
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetKey}>Urdu Name:</Text>
                      <Text style={styles.sheetVal}>{viewAsset.urduName}</Text>
                    </View>
                  ) : null}

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Category:</Text>
                    <Text style={styles.sheetVal}>{viewAsset.category}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Location:</Text>
                    <Text style={styles.sheetVal}>{viewAsset.location}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Supplier / Vendor:</Text>
                    <Text style={styles.sheetVal}>
                      {viewAsset.vendor} {viewAsset.vendorPhone ? `(${viewAsset.vendorPhone})` : ''}
                    </Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Purchase Date:</Text>
                    <Text style={styles.sheetVal}>{formatDay(viewAsset.purchaseDate)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Unit Cost:</Text>
                    <Text style={styles.sheetVal}>{money(viewAsset.cost)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Quantity:</Text>
                    <Text style={styles.sheetVal}>{viewAsset.quantity} Unit(s)</Text>
                  </View>

                  <View style={[styles.sheetRow, { backgroundColor: '#FEF3C7', padding: 6, borderRadius: 6 }]}>
                    <Text style={[styles.sheetKey, { color: '#92400E', fontWeight: '800' }]}>TOTAL CAPITAL INVESTED:</Text>
                    <Text style={[styles.sheetValBold, { color: '#92400E' }]}>{money(viewAsset.totalCost)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Est. Net Book Value:</Text>
                    <Text style={styles.sheetVal}>{money(viewAsset.currentValue || viewAsset.totalCost)}</Text>
                  </View>

                  <View style={styles.sheetRow}>
                    <Text style={styles.sheetKey}>Condition / Status:</Text>
                    <Text style={styles.sheetVal}>
                      {viewAsset.condition.toUpperCase()} / {viewAsset.status.toUpperCase()}
                    </Text>
                  </View>

                  {viewAsset.serialNumber ? (
                    <View style={styles.sheetRow}>
                      <Text style={styles.sheetKey}>Serial No:</Text>
                      <Text style={styles.sheetVal}>{viewAsset.serialNumber}</Text>
                    </View>
                  ) : null}

                  {viewAsset.notes ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.sheetKey}>Notes & Specs:</Text>
                      <Text style={[styles.sheetVal, { fontStyle: 'italic', marginTop: 4 }]}>{viewAsset.notes}</Text>
                    </View>
                  ) : null}

                  {/* Maintenance Log Section */}
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.sheetDocTitle, { textAlign: 'left', marginBottom: 8 }]}>
                      SERVICE & REPAIR HISTORY ({viewAsset.maintenanceLogs?.length || 0})
                    </Text>
                    {(!viewAsset.maintenanceLogs || viewAsset.maintenanceLogs.length === 0) ? (
                      <Text style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                        No repairs logged yet. Asset operating in nominal condition.
                      </Text>
                    ) : (
                      viewAsset.maintenanceLogs.map((log) => (
                        <View key={log.id} style={styles.sheetMaintItem}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontWeight: '700', fontSize: 13, color: '#111827' }}>
                              {formatDay(log.date)} • {log.performedBy || 'Technician'}
                            </Text>
                            <Text style={{ fontWeight: '700', fontSize: 13, color: '#B45309' }}>
                              {money(log.cost)}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>{log.description}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Breakage & Damage Incidents Section */}
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.sheetDocTitle, { textAlign: 'left', marginBottom: 8, color: '#BE123C' }]}>
                      BREAKAGE & DAMAGE RECORD ({damageRecords.filter((d) => d.assetId === viewAsset.id || d.assetCode === viewAsset.assetCode).length})
                    </Text>
                    {damageRecords.filter((d) => d.assetId === viewAsset.id || d.assetCode === viewAsset.assetCode).length === 0 ? (
                      <Text style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                        Zero breakage incidents logged for this asset.
                      </Text>
                    ) : (
                      damageRecords
                        .filter((d) => d.assetId === viewAsset.id || d.assetCode === viewAsset.assetCode)
                        .map((dmg) => (
                          <View key={dmg.id} style={[styles.sheetMaintItem, { borderColor: '#FECDD3', backgroundColor: '#FFF5F5' }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontWeight: '700', fontSize: 13, color: '#111827' }}>
                                {formatDay(dmg.incidentDate)} • {dmg.quantity}x broken ({dmg.reason})
                              </Text>
                              <Text style={{ fontWeight: '700', fontSize: 13, color: '#BE123C' }}>
                                -{money(dmg.totalLoss)}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>
                              Settlement: {dmg.actionTaken} • Location: {dmg.location} • Status: {dmg.status.toUpperCase()}
                            </Text>
                          </View>
                        ))
                    )}
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setViewAsset(null)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => {
                  alertMsg('Printing', 'Asset record sent to local thermal / document printer.');
                }}
              >
                <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>Print Audit Slip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- MANAGE ASSET CATEGORIES MODAL -------------------- */}
      <Modal visible={isManageCategoriesOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 520 }, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="folder-open" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>Manage Asset Categories</Text>
              </View>
              <TouchableOpacity onPress={() => setIsManageCategoriesOpen(false)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              {/* Add New Category */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="New Category name (e.g. Solar & Energy)..."
                  placeholderTextColor={LIGHT.textDim}
                  value={newCatInput}
                  onChangeText={setNewCatInput}
                />
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { paddingHorizontal: 14 }]}
                  onPress={() => {
                    if (!newCatInput.trim()) return;
                    addAssetCategory(newCatInput.trim());
                    setNewCatInput('');
                  }}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.modalSubmitText}>Add</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {assetCategories.map((cat) => {
                  const count = assets.filter((a) => a.category === cat).length;
                  const isEditing = editingCategoryOld === cat;
                  return (
                    <View key={cat} style={styles.catRowItem}>
                      {isEditing ? (
                        <View style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TextInput
                            style={[styles.input, { flex: 1, height: 36, paddingVertical: 4 }]}
                            value={editingCategoryNew}
                            onChangeText={setEditingCategoryNew}
                            autoFocus
                          />
                          <TouchableOpacity
                            onPress={() => {
                              if (editingCategoryNew.trim() && editingCategoryNew.trim() !== cat) {
                                renameAssetCategory(cat, editingCategoryNew.trim());
                              }
                              setEditingCategoryOld(null);
                              setEditingCategoryNew('');
                            }}
                            style={{ padding: 6 }}
                          >
                            <Ionicons name="checkmark-circle" size={22} color={LIGHT.emerald} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              setEditingCategoryOld(null);
                              setEditingCategoryNew('');
                            }}
                            style={{ padding: 6 }}
                          >
                            <Ionicons name="close-circle" size={22} color={LIGHT.rose} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.catRowTitle}>{cat}</Text>
                            <Text style={styles.catRowCount}>{count} {count === 1 ? 'asset item' : 'asset items'}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingCategoryOld(cat);
                                setEditingCategoryNew(cat);
                              }}
                              style={{ padding: 6 }}
                            >
                              <Ionicons name="pencil-outline" size={17} color="#475569" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                if (count > 0) {
                                  alertMsg('Category in Use', `Cannot delete "${cat}" because ${count} asset(s) are assigned to it. Please reassign them first.`);
                                  return;
                                }
                                deleteAssetCategory(cat);
                              }}
                              style={{ padding: 6 }}
                            >
                              <Ionicons name="trash-outline" size={17} color={LIGHT.rose} />
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => setIsManageCategoriesOpen(false)}
              >
                <Text style={styles.modalSubmitText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- QUICK ADD SUPPLIER MODAL -------------------- */}
      <Modal visible={isQuickSupplierModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 500 }, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="person-add" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>Quick Add Capital Supplier</Text>
              </View>
              <TouchableOpacity onPress={() => setIsQuickSupplierModalOpen(false)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 18, maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Supplier / Business Firm Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Royal Wood Furnishers"
                  placeholderTextColor={LIGHT.textDim}
                  value={quickSupplierName}
                  onChangeText={setQuickSupplierName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Asset Specialty / Category</Text>
                <RoyalDropdown
                  label="Category"
                  options={assetCategories.map((c) => ({ label: c, value: c }))}
                  value={quickSupplierCategory}
                  onSelect={(c) => setQuickSupplierCategory(c)}
                  searchable
                />
              </View>

              <View style={styles.twoCol}>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.inputLabel}>Contact Person</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Haji Rashid"
                    placeholderTextColor={LIGHT.textDim}
                    value={quickSupplierContact}
                    onChangeText={setQuickSupplierContact}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.inputLabel}>Phone / WhatsApp *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 0300-1234567"
                    placeholderTextColor={LIGHT.textDim}
                    value={quickSupplierPhone}
                    onChangeText={setQuickSupplierPhone}
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.inputLabel}>Payment Terms</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Credit 15 Days"
                    placeholderTextColor={LIGHT.textDim}
                    value={quickSupplierTerms}
                    onChangeText={setQuickSupplierTerms}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1, minWidth: 150 }]}>
                  <Text style={styles.inputLabel}>City</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Lahore"
                    placeholderTextColor={LIGHT.textDim}
                    value={quickSupplierCity}
                    onChangeText={setQuickSupplierCity}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsQuickSupplierModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleQuickAddSupplier}
              >
                <Ionicons name="checkmark-done" size={17} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>Save & Select Supplier</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* -------------------- SUPPLIER KHATAS & PAYMENTS MODAL -------------------- */}
      <Modal visible={isSupplierLedgersOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 880, height: isMobile ? '94%' : 680 }, isMobile && { width: '96%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="book" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>Capital Suppliers Khata & Payment Ledger</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSupplierLedgersOpen(false)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, flexDirection: isMobile ? 'column' : 'row' }}>
              {/* Left Column: Supplier List */}
              <View style={[styles.ledgerLeftCol, isMobile && { maxHeight: 180, borderRightWidth: 0, borderBottomWidth: 1 }]}>
                <Text style={styles.ledgerListHeader}>SUPPLIERS ({suppliers.length})</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {suppliers.length === 0 ? (
                    <Text style={{ fontSize: 12, color: LIGHT.textDim, padding: 12 }}>No suppliers registered yet.</Text>
                  ) : (
                    suppliers.map((sup) => {
                      const isSelected = (selectedLedgerSupplierId || suppliers[0]?.id) === sup.id;
                      const bal = sup.currentBalance || 0;
                      return (
                        <TouchableOpacity
                          key={sup.id}
                          style={[styles.ledgerSupplierItem, isSelected && styles.ledgerSupplierItemActive]}
                          onPress={() => setSelectedLedgerSupplierId(sup.id)}
                          activeOpacity={0.8}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.ledgerSupplierName, isSelected && { color: LIGHT.burgundy }]} numberOfLines={1}>
                              {sup.name}
                            </Text>
                            <Text style={styles.ledgerSupplierSub} numberOfLines={1}>
                              {sup.category || 'General'} • {sup.phone || 'No Phone'}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', marginLeft: 6 }}>
                            <Text style={[styles.ledgerBalVal, bal > 0 ? { color: LIGHT.rose } : { color: LIGHT.emerald }]}>
                              {bal > 0 ? `Due ${money(bal)}` : 'Cleared'}
                            </Text>
                            <Text style={styles.ledgerPurchasesVal}>Pur: {money(sup.totalPurchases || 0)}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>

              {/* Right Column: Ledger & Payment History */}
              {(() => {
                const currentSup = suppliers.find((s) => s.id === (selectedLedgerSupplierId || suppliers[0]?.id));
                if (!currentSup) {
                  return (
                    <View style={{ flex: 2, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: LIGHT.textDim, fontSize: 14 }}>No supplier selected.</Text>
                    </View>
                  );
                }
                const historyPayments = supplierPayments.filter((p) => p.supplierId === currentSup.id);
                const supPOs = purchaseOrders.filter((po) => po.supplierId === currentSup.id);

                return (
                  <ScrollView style={{ flex: 2, padding: 16 }} showsVerticalScrollIndicator={false}>
                    {/* Supplier Quick Header */}
                    <View style={styles.supplierDetailHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailSupName}>{currentSup.name}</Text>
                        <Text style={styles.detailSupMeta}>
                          {currentSup.category} • Contact: {currentSup.contactPerson} ({currentSup.phone})
                        </Text>
                        <Text style={styles.detailSupMeta}>Terms: {currentSup.paymentTerms || 'Credit 15 Days'}</Text>
                      </View>
                    </View>

                    {/* KPI Balance Cards */}
                    <View style={styles.ledgerKpiRow}>
                      <View style={[styles.ledgerKpiBox, { borderColor: '#FECDD3', backgroundColor: '#FFF1F2' }]}>
                        <Text style={[styles.ledgerKpiLabel, { color: '#BE123C' }]}>CURRENT PAYABLE (KHATA DUE)</Text>
                        <Text style={[styles.ledgerKpiVal, { color: '#9F1239' }]}>{money(currentSup.currentBalance || 0)}</Text>
                      </View>
                      <View style={[styles.ledgerKpiBox, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }]}>
                        <Text style={styles.ledgerKpiLabel}>TOTAL INVOICED PURCHASES</Text>
                        <Text style={[styles.ledgerKpiVal, { color: LIGHT.ink }]}>{money(currentSup.totalPurchases || 0)}</Text>
                      </View>
                    </View>

                    {/* Record Payment Card */}
                    <View style={styles.recordPaymentCard}>
                      <Text style={styles.recordPaymentTitle}>Record Payment to Supplier (Deduct Khata)</Text>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <View style={{ flex: 1, minWidth: 150 }}>
                          <Text style={styles.inputLabel}>Payment Amount (PKR) *</Text>
                          <TextInput
                            style={[styles.input, { fontWeight: '800', color: LIGHT.emerald, fontSize: 15 }]}
                            placeholder="e.g. 25000"
                            placeholderTextColor={LIGHT.textDim}
                            keyboardType="numeric"
                            value={paymentAmountInput}
                            onChangeText={setPaymentAmountInput}
                          />
                        </View>
                        <View style={{ width: 140 }}>
                          <Text style={styles.inputLabel}>Payment Method</Text>
                          <View style={{ flexDirection: 'row', gap: 4, height: 42 }}>
                            <TouchableOpacity
                              style={[styles.quickPayMethodBtn, paymentMethodInput === 'cash' && styles.quickPayMethodBtnActive]}
                              onPress={() => setPaymentMethodInput('cash')}
                            >
                              <Text style={[styles.quickPayMethodText, paymentMethodInput === 'cash' && styles.quickPayMethodTextActive]}>Cash</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.quickPayMethodBtn, paymentMethodInput === 'online' && styles.quickPayMethodBtnActive]}
                              onPress={() => setPaymentMethodInput('online')}
                            >
                              <Text style={[styles.quickPayMethodText, paymentMethodInput === 'online' && styles.quickPayMethodTextActive]}>Bank</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      {/* Quick Presets */}
                      {(currentSup.currentBalance || 0) > 0 && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            style={styles.smallPresetBtn}
                            onPress={() => setPaymentAmountInput(String(currentSup.currentBalance))}
                          >
                            <Text style={styles.smallPresetBtnText}>Pay Full Due ({money(currentSup.currentBalance)})</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.smallPresetBtn}
                            onPress={() => setPaymentAmountInput(String(Math.round(currentSup.currentBalance / 2)))}
                          >
                            <Text style={styles.smallPresetBtnText}>Pay 50%</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.inputLabel}>Payment Note / Cheque / Transaction Ref</Text>
                        <TextInput
                          style={[styles.input, { height: 38 }]}
                          placeholder="e.g. Cheque #88192 or Meezan Bank Transfer"
                          placeholderTextColor={LIGHT.textDim}
                          value={paymentNotesInput}
                          onChangeText={setPaymentNotesInput}
                        />
                      </View>

                      <TouchableOpacity
                        style={styles.submitPaymentBtn}
                        onPress={() => handleRecordSupplierPayment(currentSup)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="wallet-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.submitPaymentBtnText}>Pay & Deduct from Khata</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Payment History Log */}
                    <View style={{ marginTop: 16 }}>
                      <Text style={styles.sectionHeading}>
                        PAYMENT RECORD HISTORY ({historyPayments.length})
                      </Text>
                      {historyPayments.length === 0 ? (
                        <Text style={{ fontSize: 12.5, color: LIGHT.textDim, fontStyle: 'italic', marginTop: 4 }}>
                          No payment transactions recorded yet for this supplier.
                        </Text>
                      ) : (
                        historyPayments.map((p) => (
                          <View key={p.id} style={styles.paymentRecordRow}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.paymentRecordAmount}>{money(p.amount)}</Text>
                                <View style={styles.paymentMethodPill}>
                                  <Text style={styles.paymentMethodPillText}>{p.method.toUpperCase()}</Text>
                                </View>
                              </View>
                              <Text style={styles.paymentRecordMeta}>
                                Paid on {formatDay(p.paidAt)} by {p.paidBy || 'Manager'}
                              </Text>
                              {p.notes ? <Text style={styles.paymentRecordNote}>"{p.notes}"</Text> : null}
                            </View>
                            <Ionicons name="checkmark-circle" size={18} color={LIGHT.emerald} />
                          </View>
                        ))
                      )}
                    </View>

                    {/* Invoices / POs History */}
                    <View style={{ marginTop: 16, marginBottom: 20 }}>
                      <Text style={styles.sectionHeading}>
                        PURCHASE INVOICES ({supPOs.length})
                      </Text>
                      {supPOs.length === 0 ? (
                        <Text style={{ fontSize: 12.5, color: LIGHT.textDim, fontStyle: 'italic', marginTop: 4 }}>
                          No formal purchase orders on file.
                        </Text>
                      ) : (
                        supPOs.map((po) => (
                          <View key={po.id} style={styles.poRecordRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.poRecordTitle}>
                                {po.poNumber} • {po.invoiceNo ? `Inv: ${po.invoiceNo}` : 'No Invoice #'}
                              </Text>
                              <Text style={styles.poRecordMeta}>
                                {formatDay(po.orderDate)} • {po.items?.length || 0} items
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={styles.poRecordAmount}>{money(po.totalAmount)}</Text>
                              <Text style={[styles.poRecordStatus, po.balanceDue > 0 ? { color: LIGHT.rose } : { color: LIGHT.emerald }]}>
                                {po.balanceDue > 0 ? `Due ${money(po.balanceDue)}` : 'PAID'}
                              </Text>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </ScrollView>
                );
              })()}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => setIsSupplierLedgersOpen(false)}
              >
                <Text style={styles.modalSubmitText}>Close Ledger</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: LIGHT.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: LIGHT.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.15)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: LIGHT.ink,
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 13.5,
    color: LIGHT.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: LIGHT.burgundySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.20)',
  },
  roleBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: LIGHT.burgundy,
    letterSpacing: 0.6,
  },
  addAssetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: LIGHT.burgundy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addAssetBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  container: {
    flex: 1,
    backgroundColor: LIGHT.bg,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: LIGHT.cardBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: LIGHT.textMuted,
    letterSpacing: 0.5,
  },
  kpiIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  kpiHint: {
    fontSize: 12,
    color: LIGHT.textDim,
    marginTop: 4,
  },
  searchSection: {
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  searchInput: {
    flex: 1,
    color: LIGHT.ink,
    fontSize: 14.5,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  filterDropdownRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  assetList: {
    gap: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thCol: {
    justifyContent: 'center',
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  astRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  rowCol: {
    justifyContent: 'center',
  },
  codeTagCompact: {
    backgroundColor: LIGHT.burgundySoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.18)',
  },
  codeTagCompactText: {
    fontSize: 11,
    fontWeight: '800',
    color: LIGHT.burgundy,
    letterSpacing: 0.4,
  },
  rowAssetName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  rowUrduName: {
    fontSize: 11.5,
    color: LIGHT.gold,
    fontWeight: '700',
  },
  rowQtyText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  categoryBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  categoryBadgeCompactText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  rowLocationText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  rowVendorText: {
    fontSize: 11,
    color: '#64748B',
  },
  rowCostGold: {
    fontSize: 14.5,
    fontWeight: '900',
    color: LIGHT.gold,
  },
  rowCostSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  rowBookValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  pillBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  pillBadgeCompactText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  microBadgeAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: LIGHT.amberSoft,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: LIGHT.amberBorder,
  },
  microBadgeAmberText: {
    fontSize: 10,
    fontWeight: '800',
    color: LIGHT.amber,
  },
  microBadgeRose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: LIGHT.roseSoft,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: LIGHT.roseBorder,
  },
  microBadgeRoseText: {
    fontSize: 10,
    fontWeight: '800',
    color: LIGHT.rose,
  },
  actionRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnAudit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: LIGHT.burgundySoft,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.2)',
  },
  actionBtnAuditText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: LIGHT.burgundy,
  },
  actionBtnService: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: LIGHT.amberSoft,
    borderWidth: 1,
    borderColor: LIGHT.amberBorder,
  },
  actionBtnServiceText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: LIGHT.amber,
  },
  actionBtnEditCompact: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionBtnDeleteCompact: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: LIGHT.roseSoft,
    borderWidth: 1,
    borderColor: LIGHT.roseBorder,
  },
  mobileAssetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    marginBottom: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  mobileCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  mobileCardMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  mobileAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  mobileCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: LIGHT.ink,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13.5,
    color: LIGHT.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: 680,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#FAFAF9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: LIGHT.ink,
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: LIGHT.ink,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LIGHT.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    color: LIGHT.ink,
    fontSize: 14.5,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  modalChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  modalChipActive: {
    backgroundColor: LIGHT.burgundySoft,
    borderColor: LIGHT.burgundy,
  },
  modalChipText: {
    fontSize: 13,
    color: LIGHT.textSecondary,
    fontWeight: '700',
  },
  modalChipTextActive: {
    color: LIGHT.burgundy,
    fontWeight: '800',
  },
  smallChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  smallChipActive: {
    backgroundColor: LIGHT.burgundySoft,
    borderColor: LIGHT.burgundy,
  },
  smallChipText: {
    fontSize: 12,
    color: LIGHT.textSecondary,
    fontWeight: '700',
  },
  smallChipTextActive: {
    color: LIGHT.burgundy,
    fontWeight: '800',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  checkboxText: {
    fontSize: 13.5,
    color: LIGHT.textSecondary,
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    backgroundColor: '#FAFAF9',
    flexWrap: 'wrap',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalCancelText: {
    color: LIGHT.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14.5,
  },
  // Audit Sheet Simulation
  sheetPaper: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sheetHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetRestName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1,
  },
  sheetDocTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: LIGHT.burgundy,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  sheetCode: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 4,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 10,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  sheetKey: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  sheetVal: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '700',
  },
  sheetValBold: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '900',
  },
  sheetMaintItem: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  damageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  damageBannerText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#BE123C',
  },
  damageBannerLink: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#BE123C',
  },
  supplierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  supplierBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  capexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#FDE047',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  capexBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#854D0E',
  },
  inlineManageBtn: {
    height: 48,
    width: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  capexToggleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    marginBottom: 14,
  },
  capexToggleBoxActive: {
    borderColor: '#FACC15',
    backgroundColor: '#FEFCE8',
  },
  capexToggleTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#334155',
  },
  capexToggleSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  catRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
    gap: 8,
  },
  catRowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  catRowCount: {
    fontSize: 11.5,
    color: '#64748B',
  },
  // Multi-Item Lot & Supplier Khata Styles
  entryModeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 8,
  },
  entryModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  entryModeBtnActive: {
    backgroundColor: '#0284C7',
  },
  entryModeBtnActiveLot: {
    backgroundColor: LIGHT.burgundy,
  },
  entryModeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  entryModeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  addSupplierQuickBtn: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addSupplierQuickBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  lotSectionBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  lotSectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lotItemCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  lotItemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lotItemNumberBadge: {
    backgroundColor: LIGHT.burgundySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lotItemNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: LIGHT.burgundy,
  },
  lotItemTotalPreview: {
    fontSize: 13,
    fontWeight: '800',
    color: LIGHT.emerald,
  },
  addLotRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: LIGHT.burgundySoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.2)',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addLotRowBtnText: {
    color: LIGHT.burgundy,
    fontWeight: '800',
    fontSize: 13,
  },
  billTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  billTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#78350F',
  },
  billTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#B45309',
  },
  quickPresetRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  quickPresetBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  quickPresetBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  khataNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  khataNoticeBoxDue: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  khataNoticeBoxClear: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  khataNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  khataNoticeSub: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 2,
  },
  methodToggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  methodToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  methodToggleBtnActive: {
    backgroundColor: LIGHT.burgundy,
    borderColor: LIGHT.burgundy,
  },
  methodToggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  methodToggleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  // Supplier Khata Ledger Styles
  ledgerLeftCol: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
  },
  ledgerListHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  ledgerSupplierItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  ledgerSupplierItemActive: {
    borderColor: LIGHT.burgundy,
    backgroundColor: '#FFF5F5',
  },
  ledgerSupplierName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  ledgerSupplierSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  ledgerBalVal: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  ledgerPurchasesVal: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  supplierDetailHeader: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  detailSupName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  detailSupMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  ledgerKpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  ledgerKpiBox: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  ledgerKpiLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  ledgerKpiVal: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  recordPaymentCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
  },
  recordPaymentTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  quickPayMethodBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  quickPayMethodBtnActive: {
    backgroundColor: LIGHT.burgundy,
    borderColor: LIGHT.burgundy,
  },
  quickPayMethodText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  quickPayMethodTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  smallPresetBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  smallPresetBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0369A1',
  },
  submitPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: LIGHT.burgundy,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  submitPaymentBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
  sectionHeading: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  paymentRecordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginBottom: 6,
  },
  paymentRecordAmount: {
    fontSize: 14.5,
    fontWeight: '900',
    color: LIGHT.emerald,
  },
  paymentRecordMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  paymentRecordNote: {
    fontSize: 11.5,
    color: '#334155',
    fontStyle: 'italic',
    marginTop: 2,
  },
  paymentMethodPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  paymentMethodPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
  },
  poRecordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginBottom: 6,
  },
  poRecordTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  poRecordMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  poRecordAmount: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  poRecordStatus: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
});
