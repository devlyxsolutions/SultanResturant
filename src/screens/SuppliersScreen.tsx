import React, { useState, useMemo } from 'react';
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
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useOpsStore,
  Supplier,
  SupplierCategory,
  SUPPLIER_CATEGORIES,
  PurchaseOrder,
  PurchaseOrderItem,
  SupplierPayment,
} from '../store/opsStore';
import RoyalDropdown from '../components/RoyalDropdown';
import PaginationControl from '../components/PaginationControl';
import { usePagination } from '../hooks/usePagination';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { broadcastImmediately } from '../services/syncService';
import { formatTime } from '../utils/format';

const BRAND = {
  burgundy: '#52171B',
  burgundyDark: '#3A0E11',
  burgundyLight: '#6E2025',
  gold: '#D5A943',
  goldLight: '#E8C56B',
  goldDark: '#9E7A23',
  paper: '#FDFBF7',
  cardBg: '#FFFFFF',
  ink: '#1A1A1A',
  muted: '#6B7280',
  border: '#E8E1D5',
  borderLight: '#F0ECE4',
  success: '#15803D',
  successBg: '#DCFCE7',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  info: '#1D4ED8',
  infoBg: '#DBEAFE',
};

const CATEGORY_THEMES: Record<
  SupplierCategory,
  { accent: string; bg: string; text: string; icon: keyof typeof Ionicons.glyphMap; urdu: string }
> = {
  'Meat & Poultry': { accent: '#DC2626', bg: '#FEE2E2', text: '#991B1B', icon: 'restaurant', urdu: 'گوشت و چکن' },
  'Fresh Produce': { accent: '#16A34A', bg: '#DCFCE7', text: '#166534', icon: 'leaf', urdu: 'سبزی و فروٹ' },
  'Dairy & Bakery': { accent: '#D97706', bg: '#FEF3C7', text: '#92400E', icon: 'nutrition', urdu: 'دودھ و بیکری' },
  'Grains & Dry Ration': { accent: '#854D0E', bg: '#FEF08A', text: '#713F12', icon: 'basket', urdu: 'راشن و چاول' },
  'Beverages & Drinks': { accent: '#0284C7', bg: '#E0F2FE', text: '#075985', icon: 'wine', urdu: 'کولڈ ڈرنکس' },
  'Fuel & Charcoal': { accent: '#EA580C', bg: '#FFEDD5', text: '#9A3412', icon: 'flame', urdu: 'کوئلہ و گیس' },
  'Packaging & Disposables': { accent: '#9333EA', bg: '#F3E8FF', text: '#6B21A8', icon: 'cube', urdu: 'ڈبے و پیکنگ' },
  'Cleaning & Kitchen Supplies': { accent: '#0D9488', bg: '#CCFBF1', text: '#115E59', icon: 'sparkles', urdu: 'صفائی سامان' },
  'Equipment & Maintenance': { accent: '#475569', bg: '#E2E8F0', text: '#334155', icon: 'construct', urdu: 'مشینیں و مرمت' },
  'Other': { accent: '#64748B', bg: '#F1F5F9', text: '#1E293B', icon: 'ellipsis-horizontal-circle', urdu: 'متفرق' },
};

export default function SuppliersScreen({ backRoute = '/admin/dashboard' }: { backRoute?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Cloud & LAN Live Sync Status
  const { isConnected, lastSyncedAt, forceSyncNow } = useSyncStatus();
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      await broadcastImmediately();
      await forceSyncNow();
    } finally {
      setTimeout(() => setIsManualSyncing(false), 500);
    }
  };

  // Store data & actions
  const {
    suppliers,
    purchaseOrders,
    supplierPayments,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    addPurchaseOrder,
    recordSupplierPayment,
  } = useOpsStore();

  // 🔀 TWO CONNECTED MASTER PAGES
  // 1: 'suppliers_history' (وینڈرز اور ہسٹری)
  // 2: 'ledger_payments' (کھاتہ اور ادائیگیاں)
  const [activePage, setActivePage] = useState<'suppliers_history' | 'ledger_payments'>('suppliers_history');

  // Currently focused supplier (connected across both pages)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => {
    return suppliers.length > 0 ? suppliers[0].id : '';
  });

  // Effective selected supplier
  const activeSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0] || null;
  }, [suppliers, selectedSupplierId]);

  // Page 1 Filters: Search & Category & Dues
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [filterBalance, setFilterBalance] = useState<'all' | 'due' | 'clear'>('all');

  // Page 2 Filters: Ledger Dr/Cr filter
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'bills' | 'payments'>('all');

  // Modals state
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showAdvancedSupplierFields, setShowAdvancedSupplierFields] = useState(false);

  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [targetSupplierForPO, setTargetSupplierForPO] = useState<Supplier | null>(null);

  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [selectedPaymentForVoucher, setSelectedPaymentForVoucher] = useState<SupplierPayment | null>(null);

  // Form State: Supplier Modal
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    category: 'Meat & Poultry' as SupplierCategory,
    contactPerson: '',
    phone: '',
    city: 'Lahore',
    paymentTerms: 'Credit 15 Days',
    bankName: '',
    accountTitle: '',
    accountNumber: '',
    iban: '',
    suppliedItemsInput: '',
    currentBalance: '0',
    notes: '',
  });

  // Form State: PO Modal
  const [poForm, setPOForm] = useState({
    supplierId: '',
    invoiceNo: '',
    amountPaid: '0',
    notes: '',
  });
  const [poItems, setPOItems] = useState<PurchaseOrderItem[]>([
    { name: '', category: 'Meat', unit: 'kg', qtyOrdered: 10, qtyReceived: 10, unitCost: 500, totalCost: 5000 },
  ]);

  // Inline Payment Form State on Page 2
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'online' | 'cheque'>('cash');
  const [payBankName, setPayBankName] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // ----------------------------------------------------
  // Derived KPIs
  // ----------------------------------------------------
  const totalPayableDue = useMemo(
    () => suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0),
    [suppliers]
  );
  const suppliersWithDuesCount = useMemo(
    () => suppliers.filter((s) => (s.currentBalance || 0) > 0).length,
    [suppliers]
  );
  const totalPurchasesVolume = useMemo(
    () => suppliers.reduce((sum, s) => sum + (s.totalPurchases || 0), 0),
    [suppliers]
  );

  // ----------------------------------------------------
  // Filtered Suppliers for Page 1
  // ----------------------------------------------------
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (selectedCategory !== 'All' && s.category !== selectedCategory) return false;
      if (filterBalance === 'due' && (s.currentBalance || 0) <= 0) return false;
      if (filterBalance === 'clear' && (s.currentBalance || 0) > 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchContact = s.contactPerson?.toLowerCase().includes(q);
        const matchPhone = s.phone?.toLowerCase().includes(q);
        const matchCity = s.city?.toLowerCase().includes(q);
        const matchItems = s.suppliedItems?.some((item) => item.toLowerCase().includes(q));
        if (!matchName && !matchContact && !matchPhone && !matchCity && !matchItems) return false;
      }
      return true;
    });
  }, [suppliers, selectedCategory, filterBalance, searchQuery]);

  // Pagination for Page 1 Supplier Cards
  const suppliersPagination = usePagination({ data: filteredSuppliers, initialPageSize: 6 });

  // History / Invoices belonging to the currently active supplier
  const activeSupplierPOs = useMemo(() => {
    if (!activeSupplier) return [];
    return purchaseOrders.filter((po) => po.supplierId === activeSupplier.id);
  }, [purchaseOrders, activeSupplier]);

  // Payments belonging to the currently active supplier
  const activeSupplierPayments = useMemo(() => {
    if (!activeSupplier) return [];
    return supplierPayments.filter((p) => p.supplierId === activeSupplier.id);
  }, [supplierPayments, activeSupplier]);

  // ----------------------------------------------------
  // Ledger Statement Computation for Page 2
  // ----------------------------------------------------
  type LedgerEntry = {
    id: string;
    date: number;
    type: 'bill' | 'payment';
    docNumber: string;
    invoiceNo?: string;
    title: string;
    subtitle: string;
    debit: number;
    credit: number;
    runningBalance: number;
  };

  const activeSupplierLedger = useMemo<LedgerEntry[]>(() => {
    if (!activeSupplier) return [];
    const sPOs = purchaseOrders.filter((po) => po.supplierId === activeSupplier.id);
    const sPays = supplierPayments.filter((p) => p.supplierId === activeSupplier.id);

    const rawList: { date: number; type: 'bill' | 'payment'; po?: PurchaseOrder; payment?: SupplierPayment }[] = [];

    sPOs.forEach((po) => {
      rawList.push({ date: po.orderDate || po.createdAt, type: 'bill', po });
    });

    sPays.forEach((pay) => {
      rawList.push({ date: pay.paidAt, type: 'payment', payment: pay });
    });

    rawList.sort((a, b) => a.date - b.date);

    let currentRunBal = 0;
    const computed: LedgerEntry[] = [];

    rawList.forEach((item, index) => {
      if (item.type === 'bill' && item.po) {
        const po = item.po;
        currentRunBal += po.totalAmount;
        const itemsSummary = po.items.map((i) => `${i.name} (${i.qtyReceived || i.qtyOrdered} ${i.unit})`).join(', ');

        computed.push({
          id: `ledger-po-${po.id}-${index}`,
          date: item.date,
          type: 'bill',
          docNumber: po.poNumber,
          invoiceNo: po.invoiceNo,
          title: 'خریداری بل (Procurement Bill)',
          subtitle: itemsSummary || 'خام مال موصول ہوا',
          debit: po.totalAmount,
          credit: 0,
          runningBalance: currentRunBal,
        });
      } else if (item.type === 'payment' && item.payment) {
        const pay = item.payment;
        currentRunBal = Math.max(0, currentRunBal - pay.amount);
        const details = [pay.method.toUpperCase(), pay.bankName, pay.reference ? `Ref: ${pay.reference}` : null]
          .filter(Boolean)
          .join(' • ');

        computed.push({
          id: `ledger-pay-${pay.id}-${index}`,
          date: item.date,
          type: 'payment',
          docNumber: `VCH-${pay.id.slice(-6).toUpperCase()}`,
          title: 'ادائیگی واؤچر (Payment Settled)',
          subtitle: `${details}${pay.notes ? ` • Note: ${pay.notes}` : ''}`,
          debit: 0,
          credit: pay.amount,
          runningBalance: currentRunBal,
        });
      }
    });

    return computed;
  }, [activeSupplier, purchaseOrders, supplierPayments]);

  // ----------------------------------------------------
  // Action Handlers
  // ----------------------------------------------------
  // Jump from Page 1 to Page 2 directly connected with chosen supplier
  const handleJumpToLedgerAndPay = (supplier: Supplier) => {
    setSelectedSupplierId(supplier.id);
    setPayAmount(supplier.currentBalance > 0 ? String(supplier.currentBalance) : '');
    setActivePage('ledger_payments');
  };

  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setShowAdvancedSupplierFields(false);
    setSupplierForm({
      name: '',
      category: 'Meat & Poultry',
      contactPerson: '',
      phone: '',
      city: 'Lahore',
      paymentTerms: 'Credit 15 Days',
      bankName: '',
      accountTitle: '',
      accountNumber: '',
      iban: '',
      suppliedItemsInput: '',
      currentBalance: '0',
      notes: '',
    });
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setShowAdvancedSupplierFields(Boolean(s.bankDetails?.accountNumber || s.notes));
    setSupplierForm({
      name: s.name,
      category: s.category,
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      city: s.city || 'Lahore',
      paymentTerms: s.paymentTerms || 'Credit 15 Days',
      bankName: s.bankDetails?.bankName || '',
      accountTitle: s.bankDetails?.accountTitle || '',
      accountNumber: s.bankDetails?.accountNumber || '',
      iban: s.bankDetails?.iban || '',
      suppliedItemsInput: s.suppliedItems ? s.suppliedItems.join(', ') : '',
      currentBalance: String(s.currentBalance || 0),
      notes: s.notes || '',
    });
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = () => {
    if (!supplierForm.name.trim()) {
      showAlert('وینڈر کا نام درکار ہے', 'براہ کرم سپلائر کا نام درج کریں۔');
      return;
    }
    if (!supplierForm.phone.trim()) {
      showAlert('فون نمبر درکار ہے', 'براہ کرم رابطہ فون نمبر درج کریں۔');
      return;
    }

    const items = supplierForm.suppliedItemsInput
      ? supplierForm.suppliedItemsInput.split(',').map((x) => x.trim()).filter(Boolean)
      : [];

    const bankDetails =
      supplierForm.bankName || supplierForm.accountNumber
        ? {
            bankName: supplierForm.bankName.trim(),
            accountTitle: supplierForm.accountTitle.trim(),
            accountNumber: supplierForm.accountNumber.trim(),
            iban: supplierForm.iban.trim(),
          }
        : undefined;

    if (editingSupplier) {
      updateSupplier(editingSupplier.id, {
        name: supplierForm.name.trim(),
        category: supplierForm.category,
        contactPerson: supplierForm.contactPerson.trim(),
        phone: supplierForm.phone.trim(),
        city: supplierForm.city.trim(),
        paymentTerms: supplierForm.paymentTerms.trim(),
        bankDetails,
        suppliedItems: items,
        currentBalance: parseFloat(supplierForm.currentBalance) || 0,
        notes: supplierForm.notes.trim(),
      });
      broadcastImmediately();
      showAlert('کامیاب', 'وینڈر کی معلومات اپڈیٹ ہو گئیں۔');
    } else {
      addSupplier({
        name: supplierForm.name.trim(),
        category: supplierForm.category,
        contactPerson: supplierForm.contactPerson.trim(),
        phone: supplierForm.phone.trim(),
        city: supplierForm.city.trim(),
        paymentTerms: supplierForm.paymentTerms.trim(),
        bankDetails,
        suppliedItems: items,
        currentBalance: parseFloat(supplierForm.currentBalance) || 0,
        totalPurchases: 0,
        rating: 5,
        status: 'active',
        notes: supplierForm.notes.trim(),
      });
      broadcastImmediately();
      showAlert('کامیاب', 'نیا وینڈر شامل ہو گیا۔');
    }

    setIsSupplierModalOpen(false);
  };

  const handleDeleteSupplier = (s: Supplier) => {
    confirmAction(
      'وینڈر حذف کریں (Delete Supplier)',
      `کیا آپ واقعی وینڈر "${s.name}" کو حذف کرنا چاہتے ہیں؟`,
      () => {
        deleteSupplier(s.id);
        broadcastImmediately();
      }
    );
  };

  // PO Creation
  const handleOpenNewPO = (supplier?: Supplier) => {
    const target = supplier || activeSupplier || suppliers[0];
    if (!target) {
      showAlert('کوئی وینڈر نہیں', 'پہلے کم از کم ایک وینڈر شامل کریں۔');
      return;
    }
    setTargetSupplierForPO(target);
    const initialItems: PurchaseOrderItem[] = target.suppliedItems?.length
      ? target.suppliedItems.slice(0, 2).map((name) => ({
          name,
          category: target.category,
          unit: 'kg',
          qtyOrdered: 10,
          qtyReceived: 10,
          unitCost: 500,
          totalCost: 5000,
        }))
      : [{ name: '', category: 'Meat', unit: 'kg', qtyOrdered: 10, qtyReceived: 10, unitCost: 500, totalCost: 5000 }];

    // eslint-disable-next-line react-hooks/purity
    const randomInv = Math.floor(1000 + Math.random() * 9000);
    setPOForm({
      supplierId: target.id,
      invoiceNo: `INV-${randomInv}`,
      amountPaid: '0',
      notes: '',
    });
    setPOItems(initialItems);
    setIsPOModalOpen(true);
  };

  const handleSavePO = () => {
    if (!targetSupplierForPO) return;
    const validItems = poItems.filter((i) => i.name.trim().length > 0);
    if (validItems.length === 0) {
      showAlert('آئٹم درکار ہے', 'براہ کرم کم از کم ایک آئٹم درج کریں۔');
      return;
    }

    const subtotal = validItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    const amountPaid = parseFloat(poForm.amountPaid) || 0;
    const balanceDue = Math.max(0, subtotal - amountPaid);
    // eslint-disable-next-line react-hooks/purity
    const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    // eslint-disable-next-line react-hooks/purity
    const nowTs = Date.now();

    addPurchaseOrder(
      {
        poNumber,
        supplierId: targetSupplierForPO.id,
        supplierName: targetSupplierForPO.name,
        invoiceNo: poForm.invoiceNo.trim(),
        orderDate: nowTs,
        deliveryDate: nowTs,
        status: 'received',
        paymentStatus: balanceDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
        items: validItems,
        subtotal,
        discount: 0,
        tax: 0,
        freight: 0,
        totalAmount: subtotal,
        amountPaid,
        balanceDue,
        paymentMethod: 'cash',
        receivedBy: 'Admin',
        notes: poForm.notes.trim(),
      },
      {
        autoReceiveToInventory: true,
        autoRecordExpense: amountPaid > 0,
        receivedBy: 'Admin',
      }
    );

    broadcastImmediately();
    setIsPOModalOpen(false);
    showAlert('بل محفوظ ہو گیا', `خریداری بل #${poNumber} موصول اور اسٹاک میں شامل ہو گیا۔`);
  };

  // Direct Inline Payment on Page 2
  const handleSaveInlinePayment = () => {
    if (!activeSupplier) return;
    const amount = parseFloat(payAmount) || 0;
    if (amount <= 0) {
      showAlert('رقم غلط ہے', 'براہ کرم ادائیگی کی درست رقم درج کریں۔');
      return;
    }

    const newPaymentData = {
      supplierId: activeSupplier.id,
      supplierName: activeSupplier.name,
      amount,
      method: payMethod,
      reference: payReference.trim(),
      notes: payNotes.trim(),
      paidBy: 'Admin',
      bankName: payMethod === 'online' ? payBankName.trim() : undefined,
    };

    recordSupplierPayment(newPaymentData, { autoRecordExpense: true });
    broadcastImmediately();

    const createdPayment: SupplierPayment = {
      ...newPaymentData,
      // eslint-disable-next-line react-hooks/purity
      id: `spay-${Date.now().toString(36)}`,
      // eslint-disable-next-line react-hooks/purity
      paidAt: Date.now(),
    };
    setSelectedPaymentForVoucher(createdPayment);
    setIsVoucherModalOpen(true);

    setPayAmount('');
    setPayBankName('');
    setPayReference('');
    setPayNotes('');
    showAlert('ادائیگی محفوظ ہو گئی', `Rs. ${amount.toLocaleString()} کی ادائیگی درج ہو گئی۔`);
  };

  // WhatsApp share of ledger
  const handleShareLedgerWhatsApp = () => {
    if (!activeSupplier) return;
    const phone = (activeSupplier.whatsapp || activeSupplier.phone || '').replace(/[^0-9]/g, '');
    let msg = `*سلطان ریسٹورنٹ اینڈ بار بی کیو (کھاتہ اسٹیٹمنٹ)*\n`;
    msg += `--------------------------------------\n`;
    msg += `وینڈر: *${activeSupplier.name}*\n`;
    msg += `رابطہ: ${activeSupplier.contactPerson} (${activeSupplier.phone})\n`;
    msg += `تاریخ: ${new Date().toLocaleDateString('ur-PK')}\n\n`;
    msg += `📊 *مالی پوزیشن (Balance Status):*\n`;
    msg += `• کل لائف ٹائم خریداری: Rs. ${(activeSupplier.totalPurchases || 0).toLocaleString()}\n`;
    msg += `• *کل واجب الادا نیٹ بقایا: Rs. ${(activeSupplier.currentBalance || 0).toLocaleString()}*\n`;
    msg += `--------------------------------------\n`;
    msg += `📜 *حالیہ ٹرانزیکشنز:*\n`;

    activeSupplierLedger.slice(-5).forEach((e) => {
      const d = new Date(e.date).toLocaleDateString();
      if (e.type === 'bill') {
        msg += `• [${d}] بل #${e.docNumber}: +Rs. ${e.debit.toLocaleString()}\n`;
      } else {
        msg += `• [${d}] ادائیگی #${e.docNumber}: -Rs. ${e.credit.toLocaleString()}\n`;
      }
    });

    msg += `\nشکریہ! برائے تصدیق سلطان ریسٹورنٹ مینجمنٹ سے رابطہ کریں۔`;

    if (phone) {
      Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
    } else {
      copyToClipboard(msg, 'کھاتہ کاپی ہو گیا');
    }
  };

  const copyToClipboard = (text: string, title = 'کاپی ہو گیا') => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showAlert(title, 'متن کامیابی سے کاپی ہو گیا۔'));
    } else {
      showAlert(title, text);
    }
  };

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
    else Alert.alert(title, msg);
  };

  const confirmAction = (title: string, msg: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${msg}`)) onConfirm();
    } else {
      Alert.alert(title, msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  // ----------------------------------------------------
  // RENDER UI
  // ----------------------------------------------------
  return (
    <View style={styles.container}>
      {/* 👑 TOP HEADER */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as any))}
          >
            <Ionicons name="arrow-back" size={20} color={BRAND.burgundy} />
          </TouchableOpacity>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.headerTitle}>Sultan Vendor Hub</Text>
              <View style={styles.urduBadge}>
                <Text style={styles.urduBadgeText}>وینڈرز پورٹل</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>خام مال سپلائرز، انوائس ہسٹری، کھاتہ اور ادائیگیاں</Text>
          </View>
        </View>

        {/* Sync & Quick Add Supplier */}
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.syncPill} onPress={handleManualSync} disabled={isManualSyncing}>
            <View style={[styles.syncDot, isConnected ? styles.syncDotOnline : styles.syncDotOffline]} />
            <Text style={styles.syncText}>
              {isConnected ? `آن لائن${lastSyncedAt ? ` • ${formatTime(lastSyncedAt)}` : ''}` : 'آف لائن'}
            </Text>
            <Ionicons name="sync" size={13} color={BRAND.burgundy} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleOpenAddSupplier}>
            <Ionicons name="person-add" size={16} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>+ نیا وینڈر</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🔀 TWO-PAGE CONNECTED NAVIGATION SWITCHER */}
      <View style={styles.pageSwitcherBar}>
        <TouchableOpacity
          style={[styles.switcherBtn, activePage === 'suppliers_history' && styles.switcherBtnActive]}
          onPress={() => setActivePage('suppliers_history')}
        >
          <Ionicons
            name="people"
            size={18}
            color={activePage === 'suppliers_history' ? '#FFFFFF' : BRAND.burgundy}
          />
          <View style={{ alignItems: 'flex-start' }}>
            <Text
              style={[
                styles.switcherBtnTitle,
                activePage === 'suppliers_history' && styles.switcherBtnTitleActive,
              ]}
            >
              1. وینڈرز لسٹ اور ہسٹری
            </Text>
            <Text
              style={[
                styles.switcherBtnSub,
                activePage === 'suppliers_history' && styles.switcherBtnSubActive,
              ]}
            >
              سپلائرز، پروفائلز اور سابقہ خریداری بلز ({suppliers.length})
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.switcherBtn, activePage === 'ledger_payments' && styles.switcherBtnActive]}
          onPress={() => setActivePage('ledger_payments')}
        >
          <Ionicons
            name="newspaper"
            size={18}
            color={activePage === 'ledger_payments' ? '#FFFFFF' : BRAND.burgundy}
          />
          <View style={{ alignItems: 'flex-start' }}>
            <Text
              style={[
                styles.switcherBtnTitle,
                activePage === 'ledger_payments' && styles.switcherBtnTitleActive,
              ]}
            >
              2. کھاتہ اور ادائیگیاں (Ledger & Pay)
            </Text>
            <Text
              style={[
                styles.switcherBtnSub,
                activePage === 'ledger_payments' && styles.switcherBtnSubActive,
              ]}
            >
              ڈائریکٹ کیش/بینک ادائیگی اور اسٹیٹمنٹ
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={[styles.contentContainer, isMobile && { paddingHorizontal: 12, paddingVertical: 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ======================================================== */}
        {/* 🏢 PAGE 1: SUPPLIERS DIRECTORY & INVOICE HISTORY */}
        {/* ======================================================== */}
        {activePage === 'suppliers_history' && (
          <View>
            {/* KPI Summary Bar */}
            <View style={styles.kpiRow}>
              <View style={[styles.kpiCard, { borderLeftColor: BRAND.gold }]}>
                <Ionicons name="business" size={24} color={BRAND.goldDark} />
                <View>
                  <Text style={styles.kpiLabel}>کل وینڈرز</Text>
                  <Text style={styles.kpiValue}>{suppliers.length}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.kpiCard, { borderLeftColor: BRAND.danger }]}
                onPress={() => setFilterBalance(filterBalance === 'due' ? 'all' : 'due')}
              >
                <Ionicons name="alert-circle" size={24} color={BRAND.danger} />
                <View>
                  <Text style={styles.kpiLabel}>کل واجب الادا رقم ({suppliersWithDuesCount} وینڈرز)</Text>
                  <Text style={[styles.kpiValue, { color: BRAND.danger }]}>
                    Rs. {totalPayableDue.toLocaleString()}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={[styles.kpiCard, { borderLeftColor: BRAND.success }]}>
                <Ionicons name="receipt" size={24} color={BRAND.success} />
                <View>
                  <Text style={styles.kpiLabel}>کل خریداری حجم</Text>
                  <Text style={[styles.kpiValue, { color: BRAND.success }]}>
                    Rs. {totalPurchasesVolume.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Search & Category Filter */}
            <View style={styles.searchSection}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={20} color={BRAND.burgundy} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="وینڈر، فون نمبر، شہر یا خام مال تلاش کریں (چکن، مٹن، ٹماٹر)..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor="#9CA3AF"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={BRAND.muted} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.dueToggleBtn, filterBalance === 'due' && styles.dueToggleBtnActive]}
                onPress={() => setFilterBalance(filterBalance === 'due' ? 'all' : 'due')}
              >
                <Ionicons
                  name={filterBalance === 'due' ? 'checkmark-circle' : 'alert-circle-outline'}
                  size={16}
                  color={filterBalance === 'due' ? '#FFFFFF' : BRAND.danger}
                />
                <Text style={[styles.dueToggleText, filterBalance === 'due' && { color: '#FFFFFF' }]}>
                  صرف بقایا والے وینڈرز ({suppliersWithDuesCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Horizontal Category Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
              <TouchableOpacity
                style={[styles.categoryPill, selectedCategory === 'All' && styles.categoryPillActive]}
                onPress={() => setSelectedCategory('All')}
              >
                <Ionicons name="grid" size={14} color={selectedCategory === 'All' ? '#FFFFFF' : BRAND.burgundy} />
                <Text style={[styles.categoryPillText, selectedCategory === 'All' && styles.categoryPillTextActive]}>
                  تمام کیٹیگریز ({suppliers.length})
                </Text>
              </TouchableOpacity>

              {SUPPLIER_CATEGORIES.map((cat) => {
                const count = suppliers.filter((s) => s.category === cat).length;
                const theme = CATEGORY_THEMES[cat] || CATEGORY_THEMES.Other;
                const isSelected = selectedCategory === cat;

                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryPill,
                      isSelected && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                    onPress={() => setSelectedCategory(isSelected ? 'All' : cat)}
                  >
                    <Ionicons name={theme.icon} size={14} color={isSelected ? '#FFFFFF' : theme.accent} />
                    <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextActive]}>
                      {cat} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 🏢 SUPPLIER CARDS & CONNECTED HISTORY */}
            <View style={styles.suppliersGrid}>
              {suppliersPagination.paginatedData.map((s) => {
                const theme = CATEGORY_THEMES[s.category] || CATEGORY_THEMES.Other;
                const hasDue = (s.currentBalance || 0) > 0;
                const isFocused = activeSupplier?.id === s.id;

                return (
                  <View key={s.id} style={[styles.supplierCard, isFocused && styles.supplierCardFocused]}>
                    <View style={[styles.cardTopColorStrip, { backgroundColor: theme.accent }]} />

                    {/* Header */}
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.categoryBadge, { backgroundColor: theme.bg }]}>
                        <Ionicons name={theme.icon} size={15} color={theme.accent} style={{ marginRight: 5 }} />
                        <Text style={[styles.categoryBadgeText, { color: theme.text }]}>
                          {s.category} ({theme.urdu})
                        </Text>
                      </View>

                      {/* WhatsApp / Call */}
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.whatsAppBtn}
                          onPress={() => {
                            const phone = (s.whatsapp || s.phone || '').replace(/[^0-9]/g, '');
                            if (phone) Linking.openURL(`https://wa.me/${phone}`);
                          }}
                        >
                          <Ionicons name="logo-whatsapp" size={15} color="#FFFFFF" />
                          <Text style={styles.whatsAppBtnText}>WhatsApp</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.callBtn}
                          onPress={() => {
                            const phone = s.phone.replace(/[^0-9+]/g, '');
                            if (phone) Linking.openURL(`tel:${phone}`);
                          }}
                        >
                          <Ionicons name="call" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Identity */}
                    <View style={{ marginBottom: 10 }}>
                      <Text style={styles.supplierName}>{s.name}</Text>
                      <Text style={styles.supplierContact}>
                        {s.contactPerson} • {s.phone} • {s.city || 'Lahore'}
                      </Text>
                    </View>

                    {/* Supplied Items */}
                    <View style={{ marginBottom: 10 }}>
                      <Text style={styles.miniLabel}>سپلائی آئٹمز:</Text>
                      <View style={styles.chipsRow}>
                        {s.suppliedItems?.map((it, idx) => (
                          <View key={idx} style={[styles.itemChip, { borderColor: theme.accent }]}>
                            <Text style={[styles.itemChipText, { color: theme.accent }]}>+ {it}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Balance Box */}
                    <View style={[styles.balanceBox, hasDue ? styles.balanceBoxDue : styles.balanceBoxClear]}>
                      <View>
                        <Text style={[styles.balanceBoxLabel, hasDue && { color: BRAND.danger }]}>
                          {hasDue ? '⚠️ واجب الادا بقایا رقم' : '✓ کھاتہ صاف ہے'}
                        </Text>
                        <Text style={[styles.balanceBoxVal, { color: hasDue ? BRAND.danger : BRAND.success }]}>
                          Rs. {(s.currentBalance || 0).toLocaleString()}
                        </Text>
                      </View>

                      {/* Direct Jump to Page 2 */}
                      <TouchableOpacity
                        style={[styles.payNowBtn, { backgroundColor: hasDue ? BRAND.danger : BRAND.success }]}
                        onPress={() => handleJumpToLedgerAndPay(s)}
                      >
                        <Ionicons name="newspaper" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.payNowBtnText}>کھاتہ اور ادائیگی</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Action Bar */}
                    <View style={styles.cardActionsBar}>
                      <TouchableOpacity
                        style={[styles.cardBtn, isFocused && { backgroundColor: '#FDF7EB', borderColor: BRAND.gold }]}
                        onPress={() => setSelectedSupplierId(s.id)}
                      >
                        <Ionicons name="list" size={14} color={BRAND.burgundy} />
                        <Text style={styles.cardBtnText}>بل ہسٹری دیکھیں</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.cardBtn} onPress={() => handleOpenNewPO(s)}>
                        <Ionicons name="cart" size={14} color={BRAND.burgundy} />
                        <Text style={styles.cardBtnText}>+ نیا خریداری بل</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.cardIconBtn}
                        onPress={() => handleOpenEditSupplier(s)}
                        accessibilityLabel="ایڈٹ"
                      >
                        <Ionicons name="pencil" size={14} color={BRAND.muted} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.cardIconBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                        onPress={() => handleDeleteSupplier(s)}
                        accessibilityLabel="حذف"
                      >
                        <Ionicons name="trash-outline" size={14} color={BRAND.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Bottom Pagination */}
            {filteredSuppliers.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <PaginationControl
                  currentPage={suppliersPagination.currentPage}
                  totalPages={suppliersPagination.totalPages}
                  pageSize={suppliersPagination.pageSize}
                  totalItems={suppliersPagination.totalItems}
                  pageSizeOptions={[4, 6, 12, 24]}
                  onPageChange={suppliersPagination.goToPage}
                  onPageSizeChange={suppliersPagination.setPageSize}
                  itemName="وینڈرز"
                />
              </View>
            )}

            {/* 📋 SELECTED SUPPLIER ORDER & INVOICE HISTORY */}
            {activeSupplier && (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View>
                    <Text style={styles.historyTitle}>
                      {activeSupplier.name} - خریداری بلز اور آرڈر ہسٹری
                    </Text>
                    <Text style={styles.historySub}>
                      کل بلز: {activeSupplierPOs.length} • کل ادائیگیاں: {activeSupplierPayments.length}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.actionBtnGold}
                      onPress={() => handleOpenNewPO(activeSupplier)}
                    >
                      <Ionicons name="cart" size={15} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>+ نیا خریداری بل</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleJumpToLedgerAndPay(activeSupplier)}
                    >
                      <Ionicons name="newspaper" size={15} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>کھاتہ پر جائیں ➡️</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {activeSupplierPOs.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="receipt-outline" size={40} color={BRAND.muted} style={{ marginBottom: 6 }} />
                    <Text style={styles.emptyBoxTitle}>کوئی خریداری بل موجود نہیں</Text>
                    <Text style={styles.emptyBoxSub}>نیا بل بنانے کیلئے اوپر بٹن دبائیں۔</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {activeSupplierPOs.map((po) => (
                      <View key={po.id} style={styles.poRow}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.poNumberText}>{po.poNumber}</Text>
                            {po.invoiceNo && <Text style={styles.poBillText}>(بل #{po.invoiceNo})</Text>}
                            <View
                              style={[
                                styles.statusBadge,
                                {
                                  backgroundColor:
                                    po.paymentStatus === 'paid'
                                      ? BRAND.successBg
                                      : po.paymentStatus === 'partial'
                                      ? BRAND.warningBg
                                      : BRAND.dangerBg,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusBadgeText,
                                  {
                                    color:
                                      po.paymentStatus === 'paid'
                                        ? BRAND.success
                                        : po.paymentStatus === 'partial'
                                        ? BRAND.warning
                                        : BRAND.danger,
                                  },
                                ]}
                              >
                                {po.paymentStatus.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.poDateText}>
                            تاریخ: {new Date(po.orderDate).toLocaleDateString()} • سامان: {po.items.map((i) => `${i.name} (${i.qtyReceived || i.qtyOrdered} ${i.unit})`).join(', ')}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.poTotalText}>Rs. {po.totalAmount.toLocaleString()}</Text>
                          {po.balanceDue > 0 ? (
                            <Text style={styles.poDueText}>بقایا: Rs. {po.balanceDue.toLocaleString()}</Text>
                          ) : (
                            <Text style={styles.poPaidText}>✓ مکمل ادا شدہ</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ======================================================== */}
        {/* 📜 PAGE 2: CONNECTED SUPPLIER LEDGER & PAYMENTS */}
        {/* ======================================================== */}
        {activePage === 'ledger_payments' && (
          <View>
            {/* Top Supplier Picker */}
            <View style={styles.supplierPickerBar}>
              <Text style={styles.pickerLabel}>وینڈر منتخب کریں (Select Vendor):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {suppliers.map((s) => {
                  const isSel = activeSupplier?.id === s.id;
                  const hasDue = (s.currentBalance || 0) > 0;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.vendorChip, isSel && styles.vendorChipActive]}
                      onPress={() => {
                        setSelectedSupplierId(s.id);
                        setPayAmount(s.currentBalance > 0 ? String(s.currentBalance) : '');
                      }}
                    >
                      <Text style={[styles.vendorChipName, isSel && styles.vendorChipNameActive]}>{s.name}</Text>
                      <View style={[styles.vendorChipDueBadge, hasDue ? { backgroundColor: BRAND.dangerBg } : { backgroundColor: BRAND.successBg }]}>
                        <Text style={[styles.vendorChipDueText, { color: hasDue ? BRAND.danger : BRAND.success }]}>
                          Rs. {(s.currentBalance || 0).toLocaleString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {activeSupplier ? (
              <View>
                {/* Active Supplier Profile Banner */}
                <View style={styles.vendorProfileBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vendorProfileName}>{activeSupplier.name}</Text>
                    <Text style={styles.vendorProfileSub}>
                      {activeSupplier.category} • {activeSupplier.contactPerson} ({activeSupplier.phone}) • {activeSupplier.city || 'Lahore'}
                    </Text>
                    {activeSupplier.bankDetails?.accountNumber && (
                      <Text style={styles.vendorBankText}>
                        بینک: {activeSupplier.bankDetails.bankName} | A/C: {activeSupplier.bankDetails.accountNumber} ({activeSupplier.bankDetails.accountTitle})
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity style={styles.whatsAppShareBtn} onPress={handleShareLedgerWhatsApp}>
                    <Ionicons name="logo-whatsapp" size={17} color="#FFFFFF" />
                    <Text style={styles.whatsAppShareBtnText}>WhatsApp پر کھاتہ بھیجیں</Text>
                  </TouchableOpacity>
                </View>

                {/* 3-Column Financial Cards */}
                <View style={styles.kpiRow}>
                  <View style={[styles.kpiCard, { borderLeftColor: BRAND.burgundy }]}>
                    <Ionicons name="cart" size={22} color={BRAND.burgundy} />
                    <View>
                      <Text style={styles.kpiLabel}>کل بلنگ (Bills Dr)</Text>
                      <Text style={[styles.kpiValue, { color: BRAND.burgundy }]}>
                        Rs. {(activeSupplier.totalPurchases || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiCard, { borderLeftColor: BRAND.success }]}>
                    <Ionicons name="cash" size={22} color={BRAND.success} />
                    <View>
                      <Text style={styles.kpiLabel}>کل ادا شدہ رقم (Paid Cr)</Text>
                      <Text style={[styles.kpiValue, { color: BRAND.success }]}>
                        Rs. {activeSupplierPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiCard, { borderLeftColor: activeSupplier.currentBalance > 0 ? BRAND.danger : BRAND.success }]}>
                    <Ionicons name="alert-circle" size={22} color={activeSupplier.currentBalance > 0 ? BRAND.danger : BRAND.success} />
                    <View>
                      <Text style={styles.kpiLabel}>نیٹ واجب الادا بقایا (Net Due)</Text>
                      <Text
                        style={[
                          styles.kpiValue,
                          { color: activeSupplier.currentBalance > 0 ? BRAND.danger : BRAND.success },
                        ]}
                      >
                        Rs. {(activeSupplier.currentBalance || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* TWO-COLUMN WORKFLOW: PAYMENT (LEFT) + LEDGER (RIGHT) */}
                <View style={[styles.workflowGrid, isMobile && { flexDirection: 'column' }]}>
                  {/* LEFT: RECORD PAYMENT FORM */}
                  <View style={styles.paymentBox}>
                    <View style={styles.boxHeader}>
                      <Ionicons name="cash-outline" size={20} color={BRAND.burgundy} />
                      <Text style={styles.boxTitle}>ادائیگی درج کریں (Record Payment)</Text>
                    </View>

                    {/* Quick Amount Presets */}
                    {activeSupplier.currentBalance > 0 && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.miniLabel}>فوری رقم شارٹ کٹس:</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          <TouchableOpacity
                            style={[styles.quickChip, { backgroundColor: BRAND.dangerBg, borderColor: BRAND.danger }]}
                            onPress={() => setPayAmount(String(activeSupplier.currentBalance))}
                          >
                            <Text style={[styles.quickChipText, { color: BRAND.danger }]}>
                              مکمل بقایا (Rs. {activeSupplier.currentBalance.toLocaleString()})
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.quickChip}
                            onPress={() => setPayAmount(String(Math.round(activeSupplier.currentBalance * 0.5)))}
                          >
                            <Text style={styles.quickChipText}>
                              50% نصف (Rs. {Math.round(activeSupplier.currentBalance * 0.5).toLocaleString()})
                            </Text>
                          </TouchableOpacity>

                          {[5000, 10000, 25000].map((amt) => {
                            if (amt > activeSupplier.currentBalance) return null;
                            return (
                              <TouchableOpacity
                                key={amt}
                                style={styles.quickChip}
                                onPress={() => setPayAmount(String(amt))}
                              >
                                <Text style={styles.quickChipText}>Rs. {amt.toLocaleString()}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Amount Input */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.fieldLabel}>ادائیگی کی رقم (Amount in PKR) *</Text>
                      <TextInput
                        style={[styles.formInput, { fontSize: 20, fontWeight: '900', color: BRAND.burgundy }]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={payAmount}
                        onChangeText={setPayAmount}
                      />
                    </View>

                    {/* Payment Method */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.fieldLabel}>طریقہ کار (Method)</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[
                          { id: 'cash', label: 'نقد (Cash)', icon: 'cash' },
                          { id: 'online', label: 'آن لائن (IBFT)', icon: 'card' },
                          { id: 'cheque', label: 'چیک (Cheque)', icon: 'newspaper' },
                        ].map((m) => {
                          const isSel = payMethod === m.id;
                          return (
                            <TouchableOpacity
                              key={m.id}
                              style={[styles.payMethodBtn, isSel && styles.payMethodBtnActive]}
                              onPress={() => setPayMethod(m.id as any)}
                            >
                              <Ionicons name={m.icon as any} size={15} color={isSel ? '#FFFFFF' : BRAND.burgundy} />
                              <Text style={[styles.payMethodText, isSel && styles.payMethodTextActive]}>
                                {m.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {payMethod === 'online' && (
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>بینک کا نام (Bank Name)</Text>
                          <TextInput
                            style={styles.formInput}
                            placeholder="مثال: Meezan Bank / HBL"
                            value={payBankName}
                            onChangeText={setPayBankName}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>ٹرانزیکشن ID / Ref</Text>
                          <TextInput
                            style={styles.formInput}
                            placeholder="مثال: TID-987654"
                            value={payReference}
                            onChangeText={setPayReference}
                          />
                        </View>
                      </View>
                    )}

                    <View style={styles.inputGroup}>
                      <Text style={styles.fieldLabel}>نوٹ / تفصیل (Optional Note)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="بل کلیئرنس، ایڈوانس وغیرہ"
                        value={payNotes}
                        onChangeText={setPayNotes}
                      />
                    </View>

                    <TouchableOpacity style={styles.submitPaymentBtn} onPress={handleSaveInlinePayment}>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.submitPaymentBtnText}>ادائیگی جمع کریں (Save Payment)</Text>
                    </TouchableOpacity>
                  </View>

                  {/* RIGHT: COMPLETE LEDGER STATEMENT TIMELINE */}
                  <View style={styles.ledgerBox}>
                    <View style={styles.boxHeader}>
                      <View>
                        <Text style={styles.boxTitle}>مکمل کھاتہ اسٹیٹمنٹ (Ledger Statement)</Text>
                        <Text style={styles.boxSub}>تمام بلز (Dr) اور ادائیگیاں (Cr) تاریخ وار</Text>
                      </View>

                      {/* Filter pills */}
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {[
                          { id: 'all', label: 'سب' },
                          { id: 'bills', label: 'بلز' },
                          { id: 'payments', label: 'ادائیگیاں' },
                        ].map((btn) => (
                          <TouchableOpacity
                            key={btn.id}
                            style={[styles.smallFilterPill, ledgerFilter === btn.id && styles.smallFilterPillActive]}
                            onPress={() => setLedgerFilter(btn.id as any)}
                          >
                            <Text
                              style={[
                                styles.smallFilterText,
                                ledgerFilter === btn.id && styles.smallFilterTextActive,
                              ]}
                            >
                              {btn.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Timeline Table */}
                    <View style={styles.ledgerTable}>
                      <View style={styles.ledgerTableHeader}>
                        <Text style={[styles.ledgerTh, { flex: 1.5 }]}>تاریخ و نمبر</Text>
                        <Text style={[styles.ledgerTh, { flex: 3 }]}>تفصیلات</Text>
                        <Text style={[styles.ledgerTh, { flex: 1.5, textAlign: 'right', color: BRAND.burgundy }]}>
                          بل (+Dr)
                        </Text>
                        <Text style={[styles.ledgerTh, { flex: 1.5, textAlign: 'right', color: BRAND.success }]}>
                          ادائیگی (-Cr)
                        </Text>
                        <Text style={[styles.ledgerTh, { flex: 1.8, textAlign: 'right' }]}>باقی کھاتہ</Text>
                      </View>

                      {activeSupplierLedger
                        .filter((e) => (ledgerFilter === 'all' ? true : ledgerFilter === 'bills' ? e.type === 'bill' : e.type === 'payment'))
                        .map((entry) => (
                          <View key={entry.id} style={styles.ledgerTableRow}>
                            <View style={{ flex: 1.5 }}>
                              <Text style={styles.ledgerDateText}>{new Date(entry.date).toLocaleDateString()}</Text>
                              <Text style={styles.ledgerDocText}>{entry.docNumber}</Text>
                            </View>

                            <View style={{ flex: 3, paddingHorizontal: 4 }}>
                              <Text style={styles.ledgerTitleText}>{entry.title}</Text>
                              <Text style={styles.ledgerSubText} numberOfLines={2}>
                                {entry.subtitle}
                              </Text>
                            </View>

                            <Text
                              style={[
                                styles.ledgerAmountText,
                                { flex: 1.5, color: entry.debit > 0 ? BRAND.burgundy : BRAND.muted },
                              ]}
                            >
                              {entry.debit > 0 ? `+Rs. ${entry.debit.toLocaleString()}` : '-'}
                            </Text>

                            <Text
                              style={[
                                styles.ledgerAmountText,
                                { flex: 1.5, color: entry.credit > 0 ? BRAND.success : BRAND.muted },
                              ]}
                            >
                              {entry.credit > 0 ? `-Rs. ${entry.credit.toLocaleString()}` : '-'}
                            </Text>

                            <Text style={[styles.ledgerBalText, { flex: 1.8 }]}>
                              Rs. {entry.runningBalance.toLocaleString()}
                            </Text>
                          </View>
                        ))}

                      {activeSupplierLedger.length === 0 && (
                        <View style={styles.emptyBox}>
                          <Text style={styles.emptyBoxSub}>اس وینڈر کا ابھی کوئی کھاتہ ریکارڈ موجود نہیں۔</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="person-outline" size={48} color={BRAND.muted} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyBoxTitle}>کوئی وینڈر منتخب نہیں ہے</Text>
                <Text style={styles.emptyBoxSub}>پہلے پیج سے وینڈر منتخب کریں یا اوپر لسٹ میں سے ٹیپ کریں۔</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ---------------------------------------------------- */}
      {/* 🚀 MODAL: ADD / EDIT SUPPLIER */}
      {/* ---------------------------------------------------- */}
      <Modal visible={isSupplierModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && { width: '95%', maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingSupplier ? 'وینڈر کی معلومات میں ترمیم' : 'نیا وینڈر / سپلائر شامل کریں'}
                </Text>
                <Text style={styles.modalSub}>بنیادی تفصیلات درج کر کے فوری محفوظ کریں</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSupplierModalOpen(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>وینڈر / کمپنی کا نام * (Vendor Name)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="مثال: المدینہ پولٹری، حاجی گوشت سینٹر"
                  value={supplierForm.name}
                  onChangeText={(t) => setSupplierForm({ ...supplierForm, name: t })}
                />
              </View>

              <View style={styles.inputGroup}>
                <RoyalDropdown
                  label="کیٹیگری منتخب کریں * (Category)"
                  placeholder="کیٹیگری منتخب کریں..."
                  options={SUPPLIER_CATEGORIES.map((cat) => {
                    const theme = CATEGORY_THEMES[cat] || CATEGORY_THEMES.Other;
                    return {
                      label: `${cat} (${theme.urdu})`,
                      value: cat,
                      icon: theme.icon,
                    };
                  })}
                  value={supplierForm.category}
                  onSelect={(cat) => setSupplierForm({ ...supplierForm, category: cat })}
                  searchable
                />
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>رابطہ کار کا نام (Contact Person)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="حاجی رفیق صاحب"
                    value={supplierForm.contactPerson}
                    onChangeText={(t) => setSupplierForm({ ...supplierForm, contactPerson: t })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>موبائل فون نمبر * (Phone)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="0300-1234567"
                    value={supplierForm.phone}
                    keyboardType="phone-pad"
                    onChangeText={(t) => setSupplierForm({ ...supplierForm, phone: t })}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>سپلائی ہونے والے آئٹمز (کوما لگا کر لکھیں)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="چکن، بون لیس، انڈے، مٹن"
                  value={supplierForm.suppliedItemsInput}
                  onChangeText={(t) => setSupplierForm({ ...supplierForm, suppliedItemsInput: t })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>سابقہ بقایا رقم (Starting Due Balance)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="0"
                  keyboardType="numeric"
                  value={supplierForm.currentBalance}
                  onChangeText={(t) => setSupplierForm({ ...supplierForm, currentBalance: t })}
                />
              </View>

              <TouchableOpacity
                style={styles.toggleAdvBtn}
                onPress={() => setShowAdvancedSupplierFields(!showAdvancedSupplierFields)}
              >
                <Ionicons name={showAdvancedSupplierFields ? 'chevron-up' : 'chevron-down'} size={16} color={BRAND.burgundy} />
                <Text style={styles.toggleAdvBtnText}>
                  {showAdvancedSupplierFields ? 'بینک تفصیلات چھپائیں' : '+ بینک اکاؤنٹ اور شہر درج کریں'}
                </Text>
              </TouchableOpacity>

              {showAdvancedSupplierFields && (
                <View style={styles.advFieldsBox}>
                  <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>بینک کا نام (Bank)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Meezan, HBL"
                        value={supplierForm.bankName}
                        onChangeText={(t) => setSupplierForm({ ...supplierForm, bankName: t })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>اکاؤنٹ نمبر (A/C No)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="0101010101"
                        value={supplierForm.accountNumber}
                        onChangeText={(t) => setSupplierForm({ ...supplierForm, accountNumber: t })}
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.fieldLabel}>شہر (City)</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Lahore"
                      value={supplierForm.city}
                      onChangeText={(t) => setSupplierForm({ ...supplierForm, city: t })}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setIsSupplierModalOpen(false)}>
                <Text style={styles.modalSecondaryBtnText}>منسوخ کریں</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleSaveSupplier}>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.modalPrimaryBtnText}>وینڈر محفوظ کریں</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------------------------------------------------- */}
      {/* 🛒 MODAL: NEW PURCHASE ORDER / BILL */}
      {/* ---------------------------------------------------- */}
      <Modal visible={isPOModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: isMobile ? '95%' : 680, maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>نیا خریداری بل درج کریں (New Purchase Bill)</Text>
                <Text style={styles.modalSub}>{targetSupplierForPO?.name} کیلئے مال رسید بنائیں</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPOModalOpen(false)}>
                <Ionicons name="close" size={24} color={BRAND.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.poTableWrap}>
                <View style={styles.poTableHeaderRow}>
                  <Text style={[styles.poThCell, { flex: 3 }]}>آئٹم کا نام</Text>
                  <Text style={[styles.poThCell, { flex: 1.2, textAlign: 'center' }]}>مقدار</Text>
                  <Text style={[styles.poThCell, { flex: 1.5, textAlign: 'right' }]}>ریٹ (Rs)</Text>
                  <Text style={[styles.poThCell, { flex: 1.8, textAlign: 'right' }]}>ٹوٹل</Text>
                </View>

                {poItems.map((item, index) => (
                  <View key={index} style={styles.poItemInputRow}>
                    <TextInput
                      style={[styles.poItemInput, { flex: 3 }]}
                      placeholder="آئٹم کا نام"
                      value={item.name}
                      onChangeText={(t) => {
                        const copy = [...poItems];
                        copy[index].name = t;
                        setPOItems(copy);
                      }}
                    />
                    <TextInput
                      style={[styles.poItemInput, { flex: 1.2, textAlign: 'center' }]}
                      placeholder="10"
                      keyboardType="numeric"
                      value={String(item.qtyOrdered || '')}
                      onChangeText={(t) => {
                        const copy = [...poItems];
                        copy[index].qtyOrdered = parseFloat(t) || 0;
                        copy[index].qtyReceived = parseFloat(t) || 0;
                        copy[index].totalCost = (parseFloat(t) || 0) * (copy[index].unitCost || 0);
                        setPOItems(copy);
                      }}
                    />
                    <TextInput
                      style={[styles.poItemInput, { flex: 1.5, textAlign: 'right' }]}
                      placeholder="500"
                      keyboardType="numeric"
                      value={String(item.unitCost || '')}
                      onChangeText={(t) => {
                        const copy = [...poItems];
                        copy[index].unitCost = parseFloat(t) || 0;
                        copy[index].totalCost = (copy[index].qtyOrdered || 0) * (parseFloat(t) || 0);
                        setPOItems(copy);
                      }}
                    />
                    <Text style={[styles.poItemTotalText, { flex: 1.8 }]}>
                      Rs. {(item.totalCost || 0).toLocaleString()}
                    </Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addPOItemBtn}
                  onPress={() =>
                    setPOItems([
                      ...poItems,
                      { name: '', category: 'General', unit: 'kg', qtyOrdered: 1, qtyReceived: 1, unitCost: 0, totalCost: 0 },
                    ])
                  }
                >
                  <Ionicons name="add" size={16} color={BRAND.burgundy} />
                  <Text style={styles.addPOItemBtnText}>+ مزید آئٹم شامل کریں</Text>
                </TouchableOpacity>
              </View>

              {/* Total Summary */}
              {(() => {
                const subtotal = poItems.reduce((s, it) => s + (it.totalCost || 0), 0);
                const paid = parseFloat(poForm.amountPaid) || 0;
                const due = Math.max(0, subtotal - paid);

                return (
                  <View style={styles.poSummaryCard}>
                    <View style={styles.poSummaryRow}>
                      <Text style={styles.poSummaryLabel}>کل بل کی رقم:</Text>
                      <Text style={[styles.poSummaryVal, { fontSize: 18, color: BRAND.burgundy }]}>
                        Rs. {subtotal.toLocaleString()}
                      </Text>
                    </View>

                    <View style={[styles.formRow, { marginTop: 8 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>ابھی ادا کی گئی رقم (Paid Now)</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="0"
                          keyboardType="numeric"
                          value={poForm.amountPaid}
                          onChangeText={(t) => setPOForm({ ...poForm, amountPaid: t })}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>وینڈر بل نمبر (Bill No)</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="INV-1234"
                          value={poForm.invoiceNo}
                          onChangeText={(t) => setPOForm({ ...poForm, invoiceNo: t })}
                        />
                      </View>
                    </View>

                    {due > 0 && (
                      <Text style={styles.dueAlertText}>
                        بقایا رقم Rs. {due.toLocaleString()} وینڈر کے کھاتے میں خودکار شامل ہو جائے گی۔
                      </Text>
                    )}
                  </View>
                );
              })()}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setIsPOModalOpen(false)}>
                <Text style={styles.modalSecondaryBtnText}>منسوخ کریں</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={handleSavePO}>
                <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                <Text style={styles.modalPrimaryBtnText}>بل محفوظ کریں</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------------------------------------------------- */}
      {/* 🧾 MODAL: PAYMENT VOUCHER SLIP */}
      {/* ---------------------------------------------------- */}
      <Modal visible={isVoucherModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: isMobile ? '95%' : 460 }]}>
            <View style={{ padding: 16 }}>
              <View style={styles.voucherHeader}>
                <Text style={styles.voucherBrand}>سلطان ریسٹورنٹ اینڈ بار بی کیو</Text>
                <Text style={styles.voucherSub}>OFFICIAL PAYMENT SETTLEMENT VOUCHER</Text>
                {selectedPaymentForVoucher && (
                  <View style={styles.voucherIdTag}>
                    <Text style={styles.voucherIdTagText}>
                      واؤچر #: VCH-{selectedPaymentForVoucher.id.slice(-6).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>

              {selectedPaymentForVoucher && (
                <View style={{ gap: 8, marginVertical: 14 }}>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>وینڈر کا نام:</Text>
                    <Text style={styles.voucherRowValBold}>{selectedPaymentForVoucher.supplierName}</Text>
                  </View>

                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>ادا شدہ رقم:</Text>
                    <Text style={[styles.voucherRowValBold, { fontSize: 20, color: BRAND.success }]}>
                      Rs. {selectedPaymentForVoucher.amount.toLocaleString()}
                    </Text>
                  </View>

                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>طریقہ کار:</Text>
                    <Text style={styles.voucherRowValBold}>{selectedPaymentForVoucher.method.toUpperCase()}</Text>
                  </View>

                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherRowLabel}>تاریخ:</Text>
                    <Text style={styles.voucherRowVal}>
                      {new Date(selectedPaymentForVoucher.paidAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={() => setIsVoucherModalOpen(false)}>
                <Text style={styles.modalPrimaryBtnText}>ٹھیک ہے (Done)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ----------------------------------------------------
// 🎨 ROYAL & BEAUTIFUL STYLES
// ----------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerMobile: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FDFBF7',
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.burgundy,
    letterSpacing: 0.3,
  },
  urduBadge: {
    backgroundColor: 'rgba(213, 169, 67, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.4)',
  },
  urduBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  headerSubtitle: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncDotOnline: { backgroundColor: '#16A34A' },
  syncDotOffline: { backgroundColor: '#DC2626' },
  syncText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.goldDark,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // 🔀 TWO-PAGE SWITCHER BAR
  pageSwitcherBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    gap: 12,
    flexWrap: 'wrap',
  },
  switcherBtn: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: BRAND.border,
  },
  switcherBtnActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  switcherBtnTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  switcherBtnTitleActive: {
    color: '#FFFFFF',
  },
  switcherBtnSub: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 1,
  },
  switcherBtnSubActive: {
    color: '#FDE68A',
  },

  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  // KPI ROW
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.muted,
  },
  kpiValue: {
    fontSize: 19,
    fontWeight: '900',
    color: BRAND.burgundy,
    marginTop: 2,
  },

  // SEARCH SECTION
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: BRAND.border,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BRAND.ink,
  },
  dueToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BRAND.danger,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 10,
  },
  dueToggleBtnActive: {
    backgroundColor: BRAND.danger,
  },
  dueToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.danger,
  },

  categoryScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  categoryPillActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },

  // SUPPLIER CARDS GRID
  suppliersGrid: {
    gap: 16,
  },
  supplierCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  supplierCardFocused: {
    borderColor: BRAND.gold,
    borderWidth: 2,
  },
  cardTopColorStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  whatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22C55E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  whatsAppBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  callBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierName: {
    fontSize: 18,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  supplierContact: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.muted,
    marginBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  itemChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  itemChipText: {
    fontSize: 11,
    fontWeight: '700',
  },

  balanceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginVertical: 10,
  },
  balanceBoxDue: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  balanceBoxClear: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  balanceBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.success,
  },
  balanceBoxVal: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
  },
  payNowBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  cardActionsBar: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    flexWrap: 'wrap',
  },
  cardBtn: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#FFFFFF',
  },
  cardBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  cardIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // HISTORY PANEL (PAGE 1)
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginTop: 20,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 10,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  historySub: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  poRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FDFBF7',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  poNumberText: {
    fontSize: 13,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  poBillText: {
    fontSize: 11,
    color: BRAND.muted,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  poDateText: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  poTotalText: {
    fontSize: 14,
    fontWeight: '900',
    color: BRAND.ink,
  },
  poDueText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.danger,
  },
  poPaidText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.success,
  },

  // ========================================================
  // PAGE 2 STYLES (LEDGER & PAYMENTS)
  // ========================================================
  supplierPickerBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 14,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
    marginBottom: 8,
  },
  vendorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  vendorChipActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  vendorChipName: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.ink,
  },
  vendorChipNameActive: {
    color: '#FFFFFF',
  },
  vendorChipDueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vendorChipDueText: {
    fontSize: 10,
    fontWeight: '800',
  },

  vendorProfileBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 12,
  },
  vendorProfileName: {
    fontSize: 18,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  vendorProfileSub: {
    fontSize: 12,
    color: BRAND.muted,
    marginTop: 2,
  },
  vendorBankText: {
    fontSize: 11,
    color: BRAND.ink,
    marginTop: 4,
    fontWeight: '600',
  },
  whatsAppShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#22C55E',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  whatsAppShareBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  workflowGrid: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  paymentBox: {
    flex: 1.1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  ledgerBox: {
    flex: 1.9,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  boxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 6,
  },
  boxTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  boxSub: {
    fontSize: 11,
    color: BRAND.muted,
  },
  quickChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  payMethodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#FFFFFF',
  },
  payMethodBtnActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  payMethodText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  payMethodTextActive: {
    color: '#FFFFFF',
  },
  submitPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BRAND.burgundy,
    paddingVertical: 11,
    borderRadius: 8,
    marginTop: 6,
  },
  submitPaymentBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // LEDGER TABLE
  smallFilterPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  smallFilterPillActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  smallFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.muted,
  },
  smallFilterTextActive: {
    color: '#FFFFFF',
  },
  ledgerTable: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  ledgerTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  ledgerTh: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.ink,
  },
  ledgerTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  ledgerDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND.ink,
  },
  ledgerDocText: {
    fontSize: 10,
    color: BRAND.muted,
  },
  ledgerTitleText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.ink,
  },
  ledgerSubText: {
    fontSize: 10,
    color: BRAND.muted,
  },
  ledgerAmountText: {
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  ledgerBalText: {
    fontSize: 12,
    fontWeight: '900',
    color: BRAND.burgundy,
    textAlign: 'right',
  },

  // MODALS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: 600,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
    backgroundColor: '#FDFBF7',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  modalSub: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BRAND.borderLight,
    backgroundColor: '#FDFBF7',
  },
  modalPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalSecondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#FFFFFF',
  },
  modalSecondaryBtnText: {
    color: BRAND.muted,
    fontSize: 13,
    fontWeight: '700',
  },

  // FORMS
  inputGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
    marginBottom: 5,
  },
  formInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: BRAND.ink,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  toggleAdvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  toggleAdvBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  advFieldsBox: {
    backgroundColor: '#FDFBF7',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    marginBottom: 12,
  },

  // PO MODAL TABLE
  poTableWrap: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  poTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  poThCell: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  poItemInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  poItemInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
  },
  poItemTotalText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.ink,
    textAlign: 'right',
  },
  addPOItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#FDFBF7',
  },
  addPOItemBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  poSummaryCard: {
    backgroundColor: '#FDF8E8',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BRAND.gold,
    marginBottom: 10,
  },
  poSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  poSummaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.ink,
  },
  poSummaryVal: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.ink,
  },
  dueAlertText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.danger,
    marginTop: 6,
  },

  // VOUCHER MODAL
  voucherHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
    paddingBottom: 10,
  },
  voucherBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  voucherSub: {
    fontSize: 10,
    color: BRAND.muted,
    marginTop: 2,
  },
  voucherIdTag: {
    backgroundColor: BRAND.burgundy,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  voucherIdTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  voucherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  voucherRowLabel: {
    fontSize: 12,
    color: BRAND.muted,
    fontWeight: '700',
  },
  voucherRowVal: {
    fontSize: 12,
    color: BRAND.ink,
  },
  voucherRowValBold: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND.ink,
  },

  // EMPTY BOX
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  emptyBoxTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: BRAND.burgundy,
  },
  emptyBoxSub: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 2,
    textAlign: 'center',
  },
});
