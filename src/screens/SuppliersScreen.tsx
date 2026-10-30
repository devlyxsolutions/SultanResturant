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
  Share,
  useWindowDimensions,
  ViewStyle,
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
import PaginationControl from '../components/PaginationControl';
import { usePagination } from '../hooks/usePagination';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { broadcastImmediately } from '../services/syncService';
import { formatTime, toWhatsAppNumber } from '../utils/format';

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
  const isMobile = width < 850;
  const isSmallMobile = width < 480;

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

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | SupplierCategory>('All');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'due' | 'clear'>('all');
  const [sortBy, setSortBy] = useState<'balance' | 'purchases' | 'recent' | 'name'>('balance');

  // Modal States
  // 1. Supplier 360 Dossier & Khata Ledger Modal
  const [dossierSupplier, setDossierSupplier] = useState<Supplier | null>(null);
  const [dossierTab, setDossierTab] = useState<'ledger' | 'orders' | 'profile'>('ledger');

  // 2. Add / Edit Supplier Modal
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<SupplierCategory>('Meat & Poultry');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formWhatsapp, setFormWhatsapp] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('Lahore');
  const [formPaymentTerms, setFormPaymentTerms] = useState('Credit 15 Days');
  const [formBankName, setFormBankName] = useState('');
  const [formAccountTitle, setFormAccountTitle] = useState('');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formIban, setFormIban] = useState('');
  const [formSuppliedItems, setFormSuppliedItems] = useState('');
  const [formCurrentBalance, setFormCurrentBalance] = useState('0');
  const [formNotes, setFormNotes] = useState('');

  // 3. Quick Payment Voucher Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payTargetSupplier, setPayTargetSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'online' | 'cheque'>('cash');
  const [payBankName, setPayBankName] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // 4. New Purchase Order (PO) Builder Modal
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [poTargetSupplier, setPOTargetSupplier] = useState<Supplier | null>(null);
  const [poInvoiceNo, setPOInvoiceNo] = useState('');
  const [poAmountPaid, setPOAmountPaid] = useState('0');
  const [poFreight, setPOFreight] = useState('0');
  const [poDiscount, setPODiscount] = useState('0');
  const [poNotes, setPONotes] = useState('');
  const [poItems, setPOItems] = useState<PurchaseOrderItem[]>([
    { name: '', category: 'Meat', unit: 'kg', qtyOrdered: 10, qtyReceived: 10, unitCost: 500, totalCost: 5000 },
  ]);

  // 5. Payment Voucher Thermal / Print Modal
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [voucherPayment, setVoucherPayment] = useState<SupplierPayment | null>(null);

  // ----------------------------------------------------
  // Financial KPIs
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
  const totalOrdersCount = useMemo(() => purchaseOrders.length, [purchaseOrders]);

  // Responsive KPI card width styling
  const kpiCardResponsiveStyle = useMemo<ViewStyle>(() => {
    if (width < 380) return { width: '100%', minWidth: '100%' };
    if (width < 768) return { width: '47%', minWidth: 140 };
    if (width < 1024) return { width: '48%', minWidth: 180 };
    return { flex: 1, minWidth: 200 };
  }, [width]);

  // ----------------------------------------------------
  // Filtered & Sorted Suppliers
  // ----------------------------------------------------
  const filteredSuppliers = useMemo(() => {
    let result = [...suppliers];

    if (categoryFilter !== 'All') {
      result = result.filter((s) => s.category === categoryFilter);
    }

    if (balanceFilter === 'due') {
      result = result.filter((s) => (s.currentBalance || 0) > 0);
    } else if (balanceFilter === 'clear') {
      result = result.filter((s) => (s.currentBalance || 0) <= 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => {
        const nameMatch = s.name.toLowerCase().includes(q);
        const contactMatch = s.contactPerson?.toLowerCase().includes(q);
        const phoneMatch = s.phone?.includes(q);
        const cityMatch = s.city?.toLowerCase().includes(q);
        const itemsMatch = s.suppliedItems?.some((it) => it.toLowerCase().includes(q));
        const bankMatch = s.bankDetails?.bankName?.toLowerCase().includes(q);
        return nameMatch || contactMatch || phoneMatch || cityMatch || itemsMatch || bankMatch;
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'balance') return (b.currentBalance || 0) - (a.currentBalance || 0);
      if (sortBy === 'purchases') return (b.totalPurchases || 0) - (a.totalPurchases || 0);
      if (sortBy === 'recent') return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

    return result;
  }, [suppliers, categoryFilter, balanceFilter, searchQuery, sortBy]);

  // Pagination
  const supplierPagination = usePagination({
    data: filteredSuppliers,
    initialPageSize: 10,
  });

  // Initials generator
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // ----------------------------------------------------
  // Ledger Statement for Dossier Supplier
  // ----------------------------------------------------
  type LedgerEntry = {
    id: string;
    date: number;
    type: 'bill' | 'payment';
    docNumber: string;
    invoiceNo?: string;
    title: string;
    subtitle: string;
    debit: number; // Procurement bill amount
    credit: number; // Payment settled amount
    runningBalance: number;
  };

  const dossierLedger = useMemo<LedgerEntry[]>(() => {
    if (!dossierSupplier) return [];
    const sPOs = purchaseOrders.filter((po) => po.supplierId === dossierSupplier.id);
    const sPays = supplierPayments.filter((p) => p.supplierId === dossierSupplier.id);

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

    return computed.reverse(); // Newest first
  }, [dossierSupplier, purchaseOrders, supplierPayments]);

  const dossierPOs = useMemo(() => {
    if (!dossierSupplier) return [];
    return purchaseOrders.filter((po) => po.supplierId === dossierSupplier.id);
  }, [dossierSupplier, purchaseOrders]);

  // ----------------------------------------------------
  // Actions: Add / Edit Supplier
  // ----------------------------------------------------
  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setFormName('');
    setFormCategory('Meat & Poultry');
    setFormContactPerson('');
    setFormPhone('');
    setFormWhatsapp('');
    setFormEmail('');
    setFormAddress('');
    setFormCity('Lahore');
    setFormPaymentTerms('Credit 15 Days');
    setFormBankName('');
    setFormAccountTitle('');
    setFormAccountNumber('');
    setFormIban('');
    setFormSuppliedItems('');
    setFormCurrentBalance('0');
    setFormNotes('');
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (sup: Supplier) => {
    setEditingSupplier(sup);
    setFormName(sup.name);
    setFormCategory(sup.category);
    setFormContactPerson(sup.contactPerson || '');
    setFormPhone(sup.phone);
    setFormWhatsapp(sup.whatsapp || '');
    setFormEmail(sup.email || '');
    setFormAddress(sup.address || '');
    setFormCity(sup.city || 'Lahore');
    setFormPaymentTerms(sup.paymentTerms || 'Credit 15 Days');
    setFormBankName(sup.bankDetails?.bankName || '');
    setFormAccountTitle(sup.bankDetails?.accountTitle || '');
    setFormAccountNumber(sup.bankDetails?.accountNumber || '');
    setFormIban(sup.bankDetails?.iban || '');
    setFormSuppliedItems((sup.suppliedItems || []).join(', '));
    setFormCurrentBalance(String(sup.currentBalance || 0));
    setFormNotes(sup.notes || '');
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = () => {
    if (!formName.trim() || !formPhone.trim()) {
      const msg = 'وینڈر کا نام اور فون نمبر درج کرنا لازمی ہے۔';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Validation Error', msg);
      return;
    }

    const suppliedItemsArray = formSuppliedItems
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);

    const bankDetails =
      formBankName.trim() || formAccountNumber.trim()
        ? {
            bankName: formBankName.trim(),
            accountTitle: formAccountTitle.trim() || formName.trim(),
            accountNumber: formAccountNumber.trim(),
            iban: formIban.trim() || undefined,
          }
        : undefined;

    const balanceNum = parseFloat(formCurrentBalance) || 0;

    if (editingSupplier) {
      updateSupplier(editingSupplier.id, {
        name: formName.trim(),
        category: formCategory,
        contactPerson: formContactPerson.trim(),
        phone: formPhone.trim(),
        whatsapp: formWhatsapp.trim() || formPhone.trim(),
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        city: formCity.trim(),
        paymentTerms: formPaymentTerms.trim(),
        bankDetails,
        suppliedItems: suppliedItemsArray,
        currentBalance: balanceNum,
        notes: formNotes.trim() || undefined,
      });

      if (dossierSupplier?.id === editingSupplier.id) {
        setDossierSupplier({
          ...dossierSupplier,
          name: formName.trim(),
          category: formCategory,
          contactPerson: formContactPerson.trim(),
          phone: formPhone.trim(),
          whatsapp: formWhatsapp.trim() || formPhone.trim(),
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          city: formCity.trim(),
          paymentTerms: formPaymentTerms.trim(),
          bankDetails,
          suppliedItems: suppliedItemsArray,
          currentBalance: balanceNum,
          notes: formNotes.trim() || undefined,
        });
      }
    } else {
      addSupplier({
        name: formName.trim(),
        category: formCategory,
        contactPerson: formContactPerson.trim(),
        phone: formPhone.trim(),
        whatsapp: formWhatsapp.trim() || formPhone.trim(),
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        city: formCity.trim(),
        paymentTerms: formPaymentTerms.trim(),
        bankDetails,
        suppliedItems: suppliedItemsArray,
        currentBalance: balanceNum,
        totalPurchases: 0,
        rating: 5,
        status: 'active',
        notes: formNotes.trim() || undefined,
      });
    }

    broadcastImmediately();
    setIsSupplierModalOpen(false);
  };

  const handleDeleteSupplier = (sup: Supplier) => {
    const doDelete = () => {
      deleteSupplier(sup.id);
      if (dossierSupplier?.id === sup.id) {
        setDossierSupplier(null);
      }
      broadcastImmediately();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`کیا آپ واقعی وینڈر "${sup.name}" کو ڈیلیٹ کرنا چاہتے ہیں؟`)) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Supplier', `Are you sure you want to remove supplier "${sup.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // ----------------------------------------------------
  // Actions: Quick Payment Modal
  // ----------------------------------------------------
  const handleOpenPayModal = (sup: Supplier) => {
    setPayTargetSupplier(sup);
    setPayAmount(String(sup.currentBalance > 0 ? sup.currentBalance : ''));
    setPayMethod('cash');
    setPayBankName(sup.bankDetails?.bankName || '');
    setPayReference('');
    setPayNotes('');
    setIsPayModalOpen(true);
  };

  const handleSavePayment = () => {
    if (!payTargetSupplier) return;
    const amountNum = parseFloat(payAmount) || 0;
    if (amountNum <= 0) {
      const msg = 'براہ کرم ادائیگی کی درست رقم درج کریں۔';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid Amount', msg);
      return;
    }

    const paymentData = {
      supplierId: payTargetSupplier.id,
      supplierName: payTargetSupplier.name,
      amount: amountNum,
      method: payMethod,
      reference: payReference.trim() || undefined,
      notes: payNotes.trim() || undefined,
      paidBy: 'Admin',
      bankName: payMethod === 'online' ? (payBankName.trim() || payTargetSupplier.bankDetails?.bankName) : undefined,
    };

    recordSupplierPayment(paymentData, { autoRecordExpense: true });
    broadcastImmediately();

    const createdPayment: SupplierPayment = {
      ...paymentData,
      id: `spay-${Date.now().toString(36)}`,
      paidAt: Date.now(),
    };

    setIsPayModalOpen(false);
    setVoucherPayment(createdPayment);
    setIsVoucherModalOpen(true);

    // Refresh dossier supplier balance
    if (dossierSupplier?.id === payTargetSupplier.id) {
      setDossierSupplier({
        ...dossierSupplier,
        currentBalance: Math.max(0, (dossierSupplier.currentBalance || 0) - amountNum),
      });
    }
  };

  // ----------------------------------------------------
  // Actions: New PO Builder Modal
  // ----------------------------------------------------
  const handleOpenPOModal = (sup: Supplier) => {
    setPOTargetSupplier(sup);
    setPOInvoiceNo(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
    setPOAmountPaid('0');
    setPOFreight('0');
    setPODiscount('0');
    setPONotes('');

    // Prepopulate first item from supplied items if available
    const firstItemName = sup.suppliedItems?.[0] || 'Raw Ingredients';
    setPOItems([
      { name: firstItemName, category: sup.category, unit: 'kg', qtyOrdered: 10, qtyReceived: 10, unitCost: 650, totalCost: 6500 },
    ]);
    setIsPOModalOpen(true);
  };

  const handleAddPOItem = () => {
    setPOItems([
      ...poItems,
      { name: '', category: poTargetSupplier?.category || 'Meat', unit: 'kg', qtyOrdered: 5, qtyReceived: 5, unitCost: 500, totalCost: 2500 },
    ]);
  };

  const handleRemovePOItem = (index: number) => {
    if (poItems.length <= 1) return;
    setPOItems(poItems.filter((_, idx) => idx !== index));
  };

  const handleUpdatePOItem = (index: number, patch: Partial<PurchaseOrderItem>) => {
    setPOItems(
      poItems.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, ...patch };
        const qty = updated.qtyReceived || updated.qtyOrdered || 0;
        const cost = updated.unitCost || 0;
        updated.totalCost = qty * cost;
        return updated;
      })
    );
  };

  const poCalculations = useMemo(() => {
    const subtotal = poItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    const discount = parseFloat(poDiscount) || 0;
    const freight = parseFloat(poFreight) || 0;
    const totalAmount = Math.max(0, subtotal - discount + freight);
    const paid = parseFloat(poAmountPaid) || 0;
    const balanceDue = Math.max(0, totalAmount - paid);
    return { subtotal, discount, freight, totalAmount, paid, balanceDue };
  }, [poItems, poDiscount, poFreight, poAmountPaid]);

  const handleSavePO = () => {
    if (!poTargetSupplier) return;
    if (poItems.length === 0 || poItems.some((i) => !i.name.trim())) {
      const msg = 'براہ کرم تمام آئٹمز کے نام اور تفصیلات درج کریں۔';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Validation Error', msg);
      return;
    }

    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    const now = Date.now();

    addPurchaseOrder(
      {
        poNumber,
        supplierId: poTargetSupplier.id,
        supplierName: poTargetSupplier.name,
        invoiceNo: poInvoiceNo.trim() || undefined,
        orderDate: now,
        deliveryDate: now,
        status: 'received',
        paymentStatus: poCalculations.balanceDue === 0 ? 'paid' : poCalculations.paid > 0 ? 'partial' : 'unpaid',
        items: poItems,
        subtotal: poCalculations.subtotal,
        discount: poCalculations.discount,
        tax: 0,
        freight: poCalculations.freight,
        totalAmount: poCalculations.totalAmount,
        amountPaid: poCalculations.paid,
        balanceDue: poCalculations.balanceDue,
        paymentMethod: poCalculations.paid > 0 ? 'cash' : undefined,
        receivedBy: 'Admin',
        notes: poNotes.trim() || undefined,
      },
      { autoReceiveToInventory: true, autoRecordExpense: poCalculations.paid > 0, receivedBy: 'Admin' }
    );

    broadcastImmediately();
    setIsPOModalOpen(false);

    if (dossierSupplier?.id === poTargetSupplier.id) {
      setDossierSupplier({
        ...dossierSupplier,
        currentBalance: (dossierSupplier.currentBalance || 0) + poCalculations.balanceDue,
        totalPurchases: (dossierSupplier.totalPurchases || 0) + poCalculations.totalAmount,
      });
    }

    const successMsg = `خریداری بل #${poNumber} موصول اور اسٹاک میں شامل ہو گیا۔`;
    if (Platform.OS === 'web') window.alert(successMsg);
    else Alert.alert('Purchase Order Created', successMsg);
  };

  // ----------------------------------------------------
  // WhatsApp Share Ledger Statement
  // ----------------------------------------------------
  const handleShareLedgerWhatsApp = () => {
    if (!dossierSupplier) return;
    const phone = toWhatsAppNumber(dossierSupplier.whatsapp || dossierSupplier.phone || '');
    let msg = `👑 *سلطان ریسٹورنٹ اینڈ بار بی کیو (کھاتہ اسٹیٹمنٹ)*\n`;
    msg += `------------------------------------------\n`;
    msg += `وینڈر: *${dossierSupplier.name}*\n`;
    msg += `رابطہ: ${dossierSupplier.contactPerson || 'N/A'} (${dossierSupplier.phone})\n`;
    msg += `تاریخ: ${new Date().toLocaleDateString('en-PK')}\n\n`;
    msg += `📊 *مالی پوزیشن (Balance Summary):*\n`;
    msg += `• کل لائف ٹائم خریداری: Rs. ${(dossierSupplier.totalPurchases || 0).toLocaleString()}\n`;
    msg += `• *کل واجب الادا نیٹ بقایا: Rs. ${(dossierSupplier.currentBalance || 0).toLocaleString()}*\n`;
    msg += `------------------------------------------\n`;
    msg += `📜 *حالیہ ٹرانزیکشنز:*\n`;

    dossierLedger.slice(0, 5).forEach((e) => {
      const d = new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
      if (e.type === 'bill') {
        msg += `• [${d}] بل #${e.docNumber}: +Rs. ${e.debit.toLocaleString()}\n`;
      } else {
        msg += `• [${d}] واؤچر #${e.docNumber}: -Rs. ${e.credit.toLocaleString()}\n`;
      }
    });

    msg += `\nشکریہ! برائے تصدیق سلطان ریسٹورنٹ اکاؤنٹس سے رابطہ کریں۔`;

    if (phone) {
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      if (Platform.OS === 'web') window.open(waUrl, '_blank');
      else Linking.openURL(waUrl);
    } else {
      Share.share({ message: msg, title: 'Ledger Statement' });
    }
  };

  // Export Filtered Suppliers to CSV
  const handleExportCSV = () => {
    if (filteredSuppliers.length === 0) {
      const msg = 'No suppliers found matching current filters.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Export Notice', msg);
      return;
    }

    const headers = 'ID,Name,Category,Contact Person,Phone,City,Payment Terms,Pending Balance (Rs.),Total Purchases (Rs.),Bank Name,Account Title,Account No,IBAN\n';
    const rows = filteredSuppliers
      .map((s) => {
        const bank = s.bankDetails;
        return `"${s.id}","${s.name}","${s.category}","${s.contactPerson || ''}","${s.phone}","${s.city || 'Lahore'}","${s.paymentTerms}","${s.currentBalance || 0}","${s.totalPurchases || 0}","${bank?.bankName || ''}","${bank?.accountTitle || ''}","${bank?.accountNumber || ''}","${bank?.iban || ''}"`;
      })
      .join('\n');

    const csvContent = headers + rows;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `sultan_suppliers_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Share.share({ message: csvContent, title: `Sultan_Suppliers_${Date.now()}.csv` });
    }
  };

  return (
    <View style={styles.container}>
      {/* 👑 TOP HEADER */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace(backRoute as any))}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Ionicons name="business" size={22} color="#D5A943" />
              <Text style={[styles.headerTitle, isSmallMobile && { fontSize: 17 }]}>
                Suppliers & Vendor Management
              </Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>PROCUREMENT & KHATA</Text>
              </View>
            </View>
            <Text style={[styles.headerSubtitle, isSmallMobile && { fontSize: 11 }]} numberOfLines={1}>
              خام مال سپلائرز، پی او خریداری بلز، کھاتہ لیجر اور ادائیگیاں
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* LAN & Cloud Live Sync Status Pill */}
          <TouchableOpacity style={styles.syncPill} onPress={handleManualSync} disabled={isManualSyncing}>
            <View style={[styles.syncDot, isConnected ? styles.syncDotOnline : styles.syncDotOffline]} />
            <Text style={styles.syncText}>
              {isConnected ? `Online${lastSyncedAt ? ` • ${formatTime(lastSyncedAt)}` : ''}` : 'Offline'}
            </Text>
            <Ionicons name="sync" size={13} color="#52141C" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exportBtn}
            onPress={handleExportCSV}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Export Suppliers List to CSV' } as any) : {})}
          >
            <Ionicons name="download-outline" size={16} color="#52141C" style={{ marginRight: 5 }} />
            <Text style={styles.exportBtnText}>{isSmallMobile ? 'CSV' : 'Export CSV'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addButton}
            onPress={handleOpenAddSupplier}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Register a New Vendor' } as any) : {})}
          >
            <Ionicons name="person-add" size={16} color="#140306" style={{ marginRight: 6 }} />
            <Text style={styles.addButtonText}>{isSmallMobile ? 'New' : 'Register Supplier'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
        {/* 4 KPI METRICS (LIQUID GLASS CARDS) */}
        <View style={styles.kpiGrid}>
          {/* Card 1: Total Suppliers */}
          <View
            style={[styles.kpiCard, styles.kpiCardSapphire, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(2, 132, 199, 0.18)' }]}>
              <Ionicons name="business" size={20} color="#0284C7" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#075985' }]}>Total Supply Partners</Text>
              <Text style={[styles.kpiValue, { color: '#0369A1' }]}>{suppliers.length} Vendors</Text>
              <Text style={[styles.kpiSub, { color: '#075985' }]}>Across 10 food categories</Text>
            </View>
          </View>

          {/* Card 2: Net Payable Dues (Clickable filter) */}
          <TouchableOpacity
            style={[styles.kpiCard, styles.kpiCardRuby, kpiCardResponsiveStyle]}
            onPress={() => setBalanceFilter(balanceFilter === 'due' ? 'all' : 'due')}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card', title: 'Click to filter suppliers with pending dues' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.18)' }]}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#991B1B' }]}>Net Balance Due (بقایا)</Text>
              <Text style={[styles.kpiValue, { color: '#DC2626' }]}>
                Rs. {totalPayableDue.toLocaleString()}
              </Text>
              <Text style={[styles.kpiSub, { color: '#991B1B' }]}>
                {suppliersWithDuesCount} {suppliersWithDuesCount === 1 ? 'vendor' : 'vendors'} pending payables
              </Text>
            </View>
          </TouchableOpacity>

          {/* Card 3: Total Purchases */}
          <View
            style={[styles.kpiCard, styles.kpiCardEmerald, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.18)' }]}>
              <Ionicons name="receipt" size={20} color="#059669" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#065F46' }]}>Lifetime Purchases</Text>
              <Text style={[styles.kpiValue, { color: '#047857' }]}>
                Rs. {totalPurchasesVolume.toLocaleString()}
              </Text>
              <Text style={[styles.kpiSub, { color: '#065F46' }]}>Total procurement volume</Text>
            </View>
          </View>

          {/* Card 4: Purchase Orders */}
          <View
            style={[styles.kpiCard, styles.kpiCardAmber, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-card' } as any) : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
              <Ionicons name="cart" size={20} color="#D97706" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#92400E' }]}>Purchase Orders (بلز)</Text>
              <Text style={[styles.kpiValue, { color: '#B45309' }]}>{totalOrdersCount} Orders</Text>
              <Text style={[styles.kpiSub, { color: '#92400E' }]}>Stock inward & deliveries</Text>
            </View>
          </View>
        </View>

        {/* SEARCH & FILTERS CONTROL BAR */}
        <View style={styles.filterSection}>
          <View style={[styles.searchRow, isSmallMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
            {/* Search Box */}
            <View style={styles.searchBox}>
              <View style={styles.searchIconOrb}>
                <Ionicons name="search" size={16} color="#52141C" />
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by vendor name, phone, item, city, or bank..."
                placeholderTextColor="#8A7A70"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.searchClearBtn}>
                  <Ionicons name="close-circle" size={18} color="#D5A943" />
                </TouchableOpacity>
              ) : (
                <View style={styles.searchShortcutBadge}>
                  <Ionicons name="sparkles" size={11} color="#B45309" style={{ marginRight: 3 }} />
                  <Text style={styles.searchShortcutText}>VENDORS</Text>
                </View>
              )}
            </View>

            {/* Sort Selector */}
            <View style={[styles.sortContainer, isSmallMobile && { alignSelf: 'flex-start' }]}>
              <Ionicons name="swap-vertical" size={16} color="#52141C" style={{ marginRight: 4 }} />
              <TouchableOpacity
                onPress={() => {
                  if (sortBy === 'balance') setSortBy('purchases');
                  else if (sortBy === 'purchases') setSortBy('recent');
                  else if (sortBy === 'recent') setSortBy('name');
                  else setSortBy('balance');
                }}
                style={styles.sortBtn}
              >
                <Text style={styles.sortBtnText}>
                  {sortBy === 'balance' && 'Highest Balance'}
                  {sortBy === 'purchases' && 'Highest Purchases'}
                  {sortBy === 'recent' && 'Recently Active'}
                  {sortBy === 'name' && 'Name (A-Z)'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Balance Status Pills */}
          <View style={styles.balancePillsRow}>
            <TouchableOpacity
              style={[styles.balancePill, balanceFilter === 'all' && styles.balancePillActive]}
              onPress={() => setBalanceFilter('all')}
            >
              <Text style={[styles.balancePillText, balanceFilter === 'all' && styles.balancePillTextActive]}>
                All Vendors ({suppliers.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.balancePill, balanceFilter === 'due' && styles.balancePillDueActive]}
              onPress={() => setBalanceFilter('due')}
            >
              <Ionicons name="alert-circle" size={13} color={balanceFilter === 'due' ? '#FFFFFF' : '#DC2626'} style={{ marginRight: 3 }} />
              <Text style={[styles.balancePillText, balanceFilter === 'due' && { color: '#FFFFFF' }]}>
                Pending Dues ({suppliersWithDuesCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.balancePill, balanceFilter === 'clear' && styles.balancePillClearActive]}
              onPress={() => setBalanceFilter('clear')}
            >
              <Ionicons name="checkmark-circle" size={13} color={balanceFilter === 'clear' ? '#FFFFFF' : '#059669'} style={{ marginRight: 3 }} />
              <Text style={[styles.balancePillText, balanceFilter === 'clear' && { color: '#FFFFFF' }]}>
                All Cleared ({suppliers.length - suppliersWithDuesCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category Tabs Row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabsRow}>
            <TouchableOpacity
              style={[styles.categoryTab, categoryFilter === 'All' && styles.categoryTabSelected]}
              onPress={() => setCategoryFilter('All')}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryTabText, categoryFilter === 'All' && styles.categoryTabTextSelected]}>
                All Categories ({suppliers.length})
              </Text>
            </TouchableOpacity>

            {SUPPLIER_CATEGORIES.map((cat) => {
              const theme = CATEGORY_THEMES[cat];
              const count = suppliers.filter((s) => s.category === cat).length;
              const isSelected = categoryFilter === cat;

              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryTab,
                    isSelected && { backgroundColor: theme.accent, borderColor: theme.accent },
                  ]}
                  onPress={() => setCategoryFilter(cat)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={theme.icon}
                    size={13}
                    color={isSelected ? '#FFFFFF' : theme.text}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.categoryTabText,
                      isSelected ? { color: '#FFFFFF', fontWeight: '800' } : { color: '#475569' },
                    ]}
                  >
                    {cat} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Results Counter & Reset */}
        <View style={styles.resultsCounterRow}>
          <Text style={styles.resultsCountText}>
            Showing <Text style={{ fontWeight: '800', color: '#0F172A' }}>{filteredSuppliers.length}</Text> supplier(s)
          </Text>
          {(searchQuery || categoryFilter !== 'All' || balanceFilter !== 'all' || sortBy !== 'balance') && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setCategoryFilter('All');
                setBalanceFilter('all');
                setSortBy('balance');
              }}
              style={styles.clearFilterBtn}
            >
              <Ionicons name="refresh" size={13} color="#D84315" style={{ marginRight: 4 }} />
              <Text style={styles.clearFilterText}>Reset Filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SUPPLIERS LIST CONTAINER */}
        {filteredSuppliers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="business-outline" size={54} color="#CBD5E1" />
            <Text style={styles.emptyText}>No Suppliers Found</Text>
            <Text style={styles.emptySubtext}>
              No vendor records match your active search or filters. Try adjusting criteria or register a new vendor.
            </Text>
            <TouchableOpacity style={styles.emptyActionBtn} onPress={handleOpenAddSupplier}>
              <Ionicons name="person-add" size={15} color="#140306" style={{ marginRight: 6 }} />
              <Text style={styles.emptyActionBtnText}>Register New Supplier</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.suppliersList}>
            {/* Desktop Table Column Header */}
            {!isMobile && (
              <View style={styles.tableHeaderRow}>
                <View style={[styles.thCol, { flex: 2.6, minWidth: 210 }]}>
                  <Text style={styles.thText}>SUPPLIER & CATEGORY</Text>
                </View>
                <View style={[styles.thCol, { flex: 2.0, minWidth: 170 }]}>
                  <Text style={styles.thText}>CONTACT & CITY</Text>
                </View>
                <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                  <Text style={styles.thText}>BALANCE PAYABLE (بقایا)</Text>
                </View>
                <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                  <Text style={styles.thText}>PURCHASES & ORDERS</Text>
                </View>
                <View style={[styles.thCol, { flex: 2.8, minWidth: 230, alignItems: 'flex-end' }]}>
                  <Text style={styles.thText}>ACTIONS</Text>
                </View>
              </View>
            )}

            {supplierPagination.paginatedData.map((sup) => {
              const theme = CATEGORY_THEMES[sup.category] || CATEGORY_THEMES['Other'];
              const hasBalance = (sup.currentBalance || 0) > 0;
              const poCount = purchaseOrders.filter((po) => po.supplierId === sup.id).length;

              if (isMobile) {
                return (
                  <View
                    key={sup.id}
                    style={[
                      styles.mobileSupplierCard,
                      hasBalance && styles.supRowHasBalance,
                    ]}
                  >
                    {/* Top Row: Avatar + Name + Category on left; Balance on right */}
                    <View style={styles.mobileCardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={[styles.avatarCompact, { backgroundColor: theme.bg, borderColor: theme.accent }]}>
                          <Ionicons name={theme.icon} size={15} color={theme.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowSupName} numberOfLines={1}>{sup.name}</Text>
                          <View style={[styles.categoryBadgeCompact, { backgroundColor: theme.bg, borderColor: theme.accent, alignSelf: 'flex-start', marginTop: 2 }]}>
                            <Text style={[styles.categoryBadgeCompactText, { color: theme.text }]}>
                              {sup.category}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.mobileBalanceText, hasBalance ? { color: '#DC2626' } : { color: '#059669' }]}>
                          Rs. {(sup.currentBalance || 0).toLocaleString()}
                        </Text>
                        <Text style={styles.mobileBalanceSubText}>
                          {hasBalance ? 'Pending Due' : 'All Clear ✅'}
                        </Text>
                      </View>
                    </View>

                    {/* Middle Row: Phone & Terms & Purchases */}
                    <View style={styles.mobileCardMidRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="call" size={12} color="#D5A943" />
                        <Text style={styles.mobilePhoneText}>{sup.phone}</Text>
                      </View>
                      <View style={styles.termsBadgeCompact}>
                        <Text style={styles.termsBadgeText}>{sup.paymentTerms}</Text>
                      </View>
                      <Text style={styles.mobileOrdersText}>
                        📦 {poCount} POs • Rs. {(sup.totalPurchases || 0).toLocaleString()}
                      </Text>
                    </View>

                    {/* Bottom Row: Actions */}
                    <View style={styles.mobileCardActionRow}>
                      <TouchableOpacity
                        style={styles.mobileActionBtnView}
                        onPress={() => {
                          setDossierSupplier(sup);
                          setDossierTab('ledger');
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="eye" size={13} color="#52141C" />
                        <Text style={styles.actionBtnViewText}>Dossier / Khata</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.mobileActionBtnPay}
                        onPress={() => handleOpenPayModal(sup)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="cash" size={13} color="#15803D" />
                        <Text style={styles.actionBtnPayText}>Pay</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.mobileActionBtnPO}
                        onPress={() => handleOpenPOModal(sup)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="cart" size={13} color="#B45309" />
                        <Text style={styles.actionBtnPOText}>+PO</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnEdit}
                        onPress={() => handleOpenEditSupplier(sup)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="pencil" size={13} color="#475569" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnDelete}
                        onPress={() => handleDeleteSupplier(sup)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              // Desktop Horizontal Data Strip
              return (
                <View
                  key={sup.id}
                  style={[
                    styles.supRowCard,
                    hasBalance && styles.supRowHasBalance,
                  ]}
                  {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                >
                  {/* 1. Supplier & Category */}
                  <View style={[styles.rowCol, { flex: 2.6, minWidth: 210, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <View style={[styles.avatarCompact, { backgroundColor: theme.bg, borderColor: theme.accent }]}>
                      <Ionicons name={theme.icon} size={16} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowSupName} numberOfLines={1}>{sup.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <View style={[styles.categoryBadgeCompact, { backgroundColor: theme.bg, borderColor: theme.accent }]}>
                          <Text style={[styles.categoryBadgeCompactText, { color: theme.text }]}>
                            {sup.category}
                          </Text>
                        </View>
                        {sup.contactPerson ? (
                          <Text style={styles.rowContactPerson} numberOfLines={1}>
                            👤 {sup.contactPerson}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* 2. Contact & City */}
                  <View style={[styles.rowCol, { flex: 2.0, minWidth: 170, gap: 2 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="call" size={12} color="#D5A943" />
                      <Text style={styles.rowPhoneText}>{sup.phone}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.rowCityText}>{sup.city || 'Lahore'}</Text>
                      <View style={styles.termsBadgeCompact}>
                        <Text style={styles.termsBadgeText}>{sup.paymentTerms}</Text>
                      </View>
                    </View>
                  </View>

                  {/* 3. Balance Payable */}
                  <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                    <Text style={[styles.rowBalanceText, hasBalance ? { color: '#DC2626' } : { color: '#059669' }]}>
                      Rs. {(sup.currentBalance || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.rowBalanceSubText}>
                      {hasBalance ? 'Pending Due (واجب الادا)' : 'All Cleared ✅'}
                    </Text>
                  </View>

                  {/* 4. Purchases & Orders */}
                  <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, gap: 2 }]}>
                    <Text style={styles.rowPurchasesText}>
                      Rs. {(sup.totalPurchases || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.rowOrdersText}>
                      {poCount} {poCount === 1 ? 'Purchase Bill' : 'Purchase Bills'}
                    </Text>
                  </View>

                  {/* 5. Actions */}
                  <View style={[styles.rowCol, { flex: 2.8, minWidth: 230, flexDirection: 'row', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }]}>
                    {/* View / 360 Dossier Button */}
                    <TouchableOpacity
                      style={styles.actionBtnView}
                      onPress={() => {
                        setDossierSupplier(sup);
                        setDossierTab('ledger');
                      }}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Open Complete Khata Ledger & History' } as any) : {})}
                    >
                      <Ionicons name="eye" size={14} color="#52141C" />
                      <Text style={styles.actionBtnViewText}>Khata</Text>
                    </TouchableOpacity>

                    {/* Pay Button */}
                    <TouchableOpacity
                      style={styles.actionBtnPay}
                      onPress={() => handleOpenPayModal(sup)}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Record Payment to Supplier' } as any) : {})}
                    >
                      <Ionicons name="cash" size={13} color="#15803D" />
                      <Text style={styles.actionBtnPayText}>Pay</Text>
                    </TouchableOpacity>

                    {/* New PO Button */}
                    <TouchableOpacity
                      style={styles.actionBtnPO}
                      onPress={() => handleOpenPOModal(sup)}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Generate Purchase Order' } as any) : {})}
                    >
                      <Ionicons name="cart" size={13} color="#B45309" />
                      <Text style={styles.actionBtnPOText}>+PO</Text>
                    </TouchableOpacity>

                    {/* Edit Button */}
                    <TouchableOpacity
                      style={styles.actionBtnEdit}
                      onPress={() => handleOpenEditSupplier(sup)}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Edit Vendor Details' } as any) : {})}
                    >
                      <Ionicons name="pencil" size={13} color="#475569" />
                    </TouchableOpacity>

                    {/* Delete Button */}
                    <TouchableOpacity
                      style={styles.actionBtnDelete}
                      onPress={() => handleDeleteSupplier(sup)}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Delete Vendor' } as any) : {})}
                    >
                      <Ionicons name="trash-outline" size={13} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {/* Pagination Controls */}
            <View style={{ marginTop: 12 }}>
              <PaginationControl
                currentPage={supplierPagination.currentPage}
                totalPages={supplierPagination.totalPages}
                totalItems={supplierPagination.totalItems}
                pageSize={supplierPagination.pageSize}
                pageSizeOptions={[10, 20, 50]}
                onPageChange={supplierPagination.goToPage}
                onPageSizeChange={supplierPagination.setPageSize}
                itemName="suppliers"
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* ========================================================
          1. SUPPLIER 360 DOSSIER & KHATA LEDGER MODAL
          ======================================================== */}
      <Modal visible={!!dossierSupplier} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.dossierModalCard, isMobile && styles.modalContentMobile]}>
            {dossierSupplier && (
              <>
                {/* Dossier Header */}
                <View style={styles.dossierHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={[styles.dossierAvatar, { backgroundColor: CATEGORY_THEMES[dossierSupplier.category]?.bg || '#F1F5F9' }]}>
                      <Ionicons
                        name={CATEGORY_THEMES[dossierSupplier.category]?.icon || 'business'}
                        size={22}
                        color={CATEGORY_THEMES[dossierSupplier.category]?.accent || '#52141C'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.dossierName}>{dossierSupplier.name}</Text>
                        <View style={[styles.categoryBadgeCompact, { backgroundColor: CATEGORY_THEMES[dossierSupplier.category]?.bg, borderColor: CATEGORY_THEMES[dossierSupplier.category]?.accent }]}>
                          <Text style={[styles.categoryBadgeCompactText, { color: CATEGORY_THEMES[dossierSupplier.category]?.text }]}>
                            {dossierSupplier.category}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.dossierPhone}>
                        📞 {dossierSupplier.phone} {dossierSupplier.contactPerson ? `• 👤 ${dossierSupplier.contactPerson}` : ''} • 🏙️ {dossierSupplier.city || 'Lahore'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setDossierSupplier(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Lifetime Financial KPI Summary */}
                <View style={styles.dossierKpiRow}>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Net Balance Due (بقایا)</Text>
                    <Text style={[styles.dossierKpiVal, (dossierSupplier.currentBalance || 0) > 0 ? { color: '#DC2626' } : { color: '#15803D' }]}>
                      Rs. {(dossierSupplier.currentBalance || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Total Purchases</Text>
                    <Text style={[styles.dossierKpiVal, { color: '#047857' }]}>
                      Rs. {(dossierSupplier.totalPurchases || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Purchase Orders</Text>
                    <Text style={styles.dossierKpiVal}>{dossierPOs.length} Bills</Text>
                  </View>
                  <View style={styles.dossierKpiBox}>
                    <Text style={styles.dossierKpiLabel}>Payment Terms</Text>
                    <Text style={styles.dossierKpiVal}>{dossierSupplier.paymentTerms}</Text>
                  </View>
                </View>

                {/* Sub-tabs: Ledger vs POs vs Bank Profile */}
                <View style={styles.dossierTabsRow}>
                  <TouchableOpacity
                    style={[styles.dossierTab, dossierTab === 'ledger' && styles.dossierTabActive]}
                    onPress={() => setDossierTab('ledger')}
                  >
                    <Ionicons name="newspaper-outline" size={15} color={dossierTab === 'ledger' ? '#52141C' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[styles.dossierTabText, dossierTab === 'ledger' && styles.dossierTabTextActive]}>
                      Ledger & Khata ({dossierLedger.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dossierTab, dossierTab === 'orders' && styles.dossierTabActive]}
                    onPress={() => setDossierTab('orders')}
                  >
                    <Ionicons name="receipt-outline" size={15} color={dossierTab === 'orders' ? '#52141C' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[styles.dossierTabText, dossierTab === 'orders' && styles.dossierTabTextActive]}>
                      Purchase Orders ({dossierPOs.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dossierTab, dossierTab === 'profile' && styles.dossierTabActive]}
                    onPress={() => setDossierTab('profile')}
                  >
                    <Ionicons name="business-outline" size={15} color={dossierTab === 'profile' ? '#52141C' : '#64748B'} style={{ marginRight: 6 }} />
                    <Text style={[styles.dossierTabText, dossierTab === 'profile' && styles.dossierTabTextActive]}>
                      Bank & Profile Info
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Tab Contents */}
                <ScrollView style={styles.dossierScroll} showsVerticalScrollIndicator={false}>
                  {/* TAB 1: LEDGER KHATA */}
                  {dossierTab === 'ledger' && (
                    <View style={{ gap: 8 }}>
                      {dossierLedger.length === 0 ? (
                        <Text style={styles.tabEmptyText}>کوئی سابقہ کھاتہ اندراج موجود نہیں ہے۔</Text>
                      ) : (
                        dossierLedger.map((entry) => (
                          <View
                            key={entry.id}
                            style={[
                              styles.ledgerRowCard,
                              entry.type === 'bill' ? styles.ledgerRowBill : styles.ledgerRowPayment,
                            ]}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[styles.ledgerTypeBadge, entry.type === 'bill' ? styles.ledgerTypeBadgeBill : styles.ledgerTypeBadgePayment]}>
                                  <Ionicons
                                    name={entry.type === 'bill' ? 'arrow-down' : 'arrow-up'}
                                    size={10}
                                    color={entry.type === 'bill' ? '#B91C1C' : '#15803D'}
                                  />
                                  <Text style={[styles.ledgerTypeBadgeText, entry.type === 'bill' ? { color: '#B91C1C' } : { color: '#15803D' }]}>
                                    {entry.type === 'bill' ? 'PURCHASE BILL' : 'PAYMENT PAID'}
                                  </Text>
                                </View>
                                <Text style={styles.ledgerDocNo}>#{entry.docNumber}</Text>
                                {entry.invoiceNo && (
                                  <Text style={styles.ledgerInvoiceNo}>Inv: {entry.invoiceNo}</Text>
                                )}
                              </View>
                              <Text style={styles.ledgerDate}>
                                {new Date(entry.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </Text>
                            </View>

                            <Text style={styles.ledgerSubtitle} numberOfLines={2}>{entry.subtitle}</Text>

                            <View style={styles.ledgerFooterRow}>
                              <View style={{ flexDirection: 'row', gap: 12 }}>
                                {entry.debit > 0 && (
                                  <Text style={styles.ledgerDebitText}>Bill: +Rs. {entry.debit.toLocaleString()}</Text>
                                )}
                                {entry.credit > 0 && (
                                  <Text style={styles.ledgerCreditText}>Paid: -Rs. {entry.credit.toLocaleString()}</Text>
                                )}
                              </View>
                              <Text style={styles.ledgerRunBalText}>
                                Balance: Rs. {entry.runningBalance.toLocaleString()}
                              </Text>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {/* TAB 2: PURCHASE ORDERS */}
                  {dossierTab === 'orders' && (
                    <View style={{ gap: 8 }}>
                      {dossierPOs.length === 0 ? (
                        <Text style={styles.tabEmptyText}>کوئی خریداری بل موصول نہیں ہوا۔</Text>
                      ) : (
                        dossierPOs.map((po) => (
                          <View key={po.id} style={styles.dossierOrderCard}>
                            <View style={styles.dossierOrderHeader}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.dossierOrderId}>#{po.poNumber}</Text>
                                {po.invoiceNo ? (
                                  <Text style={styles.ledgerInvoiceNo}>Inv: {po.invoiceNo}</Text>
                                ) : null}
                              </View>
                              <Text style={styles.dossierOrderDate}>
                                {new Date(po.orderDate).toLocaleDateString('en-PK')}
                              </Text>
                            </View>

                            <Text style={styles.dossierOrderItems} numberOfLines={2}>
                              {po.items.map((it) => `${it.name} (${it.qtyReceived || it.qtyOrdered} ${it.unit})`).join(', ')}
                            </Text>

                            <View style={styles.dossierOrderFooter}>
                              <View>
                                <Text style={styles.dossierOrderTotal}>
                                  Total: Rs. {(po.totalAmount || 0).toLocaleString()}
                                </Text>
                                <Text style={styles.dossierOrderSub}>
                                  Paid: Rs. {(po.amountPaid || 0).toLocaleString()} • Due: Rs. {(po.balanceDue || 0).toLocaleString()}
                                </Text>
                              </View>
                              <View style={[styles.statusBadgeCompact, po.balanceDue === 0 ? styles.statusBadgePaid : styles.statusBadgeUnpaid]}>
                                <Text style={[styles.statusBadgeTextCompact, po.balanceDue === 0 ? { color: '#15803D' } : { color: '#B91C1C' }]}>
                                  {po.balanceDue === 0 ? 'PAID' : 'DUE'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  )}

                  {/* TAB 3: BANK & PROFILE */}
                  {dossierTab === 'profile' && (
                    <View style={styles.dossierProfileSection}>
                      <Text style={styles.dossierSectionHeading}>Bank Account Details (ادائیگی معلومات)</Text>
                      {dossierSupplier.bankDetails?.bankName ? (
                        <View style={styles.bankDetailsBox}>
                          <View style={styles.bankDetailRow}>
                            <Text style={styles.bankDetailLabel}>Bank Name:</Text>
                            <Text style={styles.bankDetailVal}>{dossierSupplier.bankDetails.bankName}</Text>
                          </View>
                          <View style={styles.bankDetailRow}>
                            <Text style={styles.bankDetailLabel}>Account Title:</Text>
                            <Text style={styles.bankDetailVal}>{dossierSupplier.bankDetails.accountTitle}</Text>
                          </View>
                          <View style={styles.bankDetailRow}>
                            <Text style={styles.bankDetailLabel}>Account No:</Text>
                            <Text style={styles.bankDetailVal}>{dossierSupplier.bankDetails.accountNumber}</Text>
                          </View>
                          {dossierSupplier.bankDetails.iban ? (
                            <View style={styles.bankDetailRow}>
                              <Text style={styles.bankDetailLabel}>IBAN:</Text>
                              <Text style={styles.bankDetailVal}>{dossierSupplier.bankDetails.iban}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <Text style={styles.dossierSectionBody}>کوئی بینک اکاؤنٹ تفصیلات محفوظ نہیں ہیں۔</Text>
                      )}

                      <Text style={[styles.dossierSectionHeading, { marginTop: 14 }]}>Supplied Raw Materials (خام مال کی لسٹ)</Text>
                      <View style={styles.tagsRow}>
                        {(dossierSupplier.suppliedItems && dossierSupplier.suppliedItems.length > 0
                          ? dossierSupplier.suppliedItems
                          : ['General Kitchen Supplies']
                        ).map((item, idx) => (
                          <View key={idx} style={styles.tagBadge}>
                            <Text style={styles.tagBadgeText}>#{item}</Text>
                          </View>
                        ))}
                      </View>

                      <Text style={[styles.dossierSectionHeading, { marginTop: 14 }]}>Address & Notes</Text>
                      <Text style={styles.dossierSectionBody}>
                        {dossierSupplier.address ? `${dossierSupplier.address}, ${dossierSupplier.city || 'Lahore'}` : 'پتہ درج نہیں ہے۔'}
                      </Text>
                      {dossierSupplier.notes ? (
                        <Text style={[styles.dossierSectionBody, { marginTop: 4, fontStyle: 'italic' }]}>
                          نوٹ: {dossierSupplier.notes}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </ScrollView>

                {/* Dossier Bottom Action Buttons */}
                <View style={styles.dossierActionRow}>
                  <TouchableOpacity
                    style={styles.modalPayActionBtn}
                    onPress={() => {
                      const sup = dossierSupplier;
                      setDossierSupplier(null);
                      handleOpenPayModal(sup);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="cash" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
                    <Text style={styles.modalPayActionBtnText}>Record Payment</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalPOActionBtn}
                    onPress={() => {
                      const sup = dossierSupplier;
                      setDossierSupplier(null);
                      handleOpenPOModal(sup);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="cart" size={15} color="#140306" style={{ marginRight: 5 }} />
                    <Text style={styles.modalPOActionBtnText}>+ New PO</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalShareWhatsAppBtn}
                    onPress={handleShareLedgerWhatsApp}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="logo-whatsapp" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
                    <Text style={styles.modalShareWhatsAppBtnText}>Share Statement</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================
          2. RECORD PAYMENT VOUCHER MODAL
          ======================================================== */}
      <Modal visible={isPayModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.formModalCard, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Record Supplier Payment (ادائیگی واؤچر)</Text>
                <Text style={styles.modalSubtitle}>
                  To: {payTargetSupplier?.name} • Pending Balance: Rs. {(payTargetSupplier?.currentBalance || 0).toLocaleString()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsPayModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              {/* Quick Amount Shortcuts */}
              <View style={styles.quickAmountRow}>
                <TouchableOpacity
                  style={styles.quickAmountChip}
                  onPress={() => setPayAmount(String(payTargetSupplier?.currentBalance || 0))}
                >
                  <Text style={styles.quickAmountChipText}>
                    Full Balance: Rs. {(payTargetSupplier?.currentBalance || 0).toLocaleString()}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickAmountChip}
                  onPress={() => setPayAmount(String(Math.round((payTargetSupplier?.currentBalance || 0) / 2)))}
                >
                  <Text style={styles.quickAmountChipText}>
                    50% Balance: Rs. {Math.round((payTargetSupplier?.currentBalance || 0) / 2).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.formLabel}>Payment Amount (ادائیگی کی رقم - Rs.) *</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="e.g. 25000"
                placeholderTextColor="#94A3B8"
                value={payAmount}
                onChangeText={setPayAmount}
              />

              <Text style={styles.formLabel}>Payment Method (ادائیگی کا طریقہ)</Text>
              <View style={styles.methodSelectRow}>
                {[
                  { key: 'cash', label: '💵 Cash Counter' },
                  { key: 'online', label: '🏦 Bank Transfer' },
                  { key: 'cheque', label: '📝 Cheque' },
                ].map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.methodSelectPill, payMethod === m.key && styles.methodSelectPillActive]}
                    onPress={() => setPayMethod(m.key as any)}
                  >
                    <Text style={[styles.methodSelectPillText, payMethod === m.key && styles.methodSelectPillTextActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {payMethod === 'online' && (
                <>
                  <Text style={styles.formLabel}>Sender / Receiver Bank Name</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Meezan Bank / HBL"
                    placeholderTextColor="#94A3B8"
                    value={payBankName}
                    onChangeText={setPayBankName}
                  />

                  <Text style={styles.formLabel}>Transaction Reference / Slip #</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. TRX-992817293"
                    placeholderTextColor="#94A3B8"
                    value={payReference}
                    onChangeText={setPayReference}
                  />
                </>
              )}

              {payMethod === 'cheque' && (
                <>
                  <Text style={styles.formLabel}>Cheque Number</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. CHQ-00192837"
                    placeholderTextColor="#94A3B8"
                    value={payReference}
                    onChangeText={setPayReference}
                  />
                </>
              )}

              <Text style={styles.formLabel}>Payment Notes / Remarks (اختیاری)</Text>
              <TextInput
                style={[styles.formInput, { height: 60, textAlignVertical: 'top' }]}
                placeholder="e.g. Paid against chicken delivery of 28 Oct..."
                placeholderTextColor="#94A3B8"
                value={payNotes}
                onChangeText={setPayNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsPayModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSavePayment}>
                <Text style={styles.saveBtnText}>Save Payment Voucher</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          3. NEW PURCHASE ORDER BUILDER MODAL
          ======================================================== */}
      <Modal visible={isPOModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.poModalCard, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>New Purchase Order (خریداری بل درج کریں)</Text>
                <Text style={styles.modalSubtitle}>Supplier: {poTargetSupplier?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPOModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Vendor Invoice / Slip #</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. INV-8821"
                    placeholderTextColor="#94A3B8"
                    value={poInvoiceNo}
                    onChangeText={setPOInvoiceNo}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Payment Mode</Text>
                  <View style={[styles.formInput, { justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '700' }}>
                      {poCalculations.paid >= poCalculations.totalAmount ? 'Cash On Delivery' : 'Credit Khata'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Items Table Builder */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
                <Text style={[styles.formLabel, { marginBottom: 0 }]}>Procured Items (خرید کردہ اشیاء) *</Text>
                <TouchableOpacity onPress={handleAddPOItem} style={styles.addItemBtn}>
                  <Ionicons name="add-circle" size={15} color="#52141C" />
                  <Text style={styles.addItemBtnText}>+ Add Item</Text>
                </TouchableOpacity>
              </View>

              {poItems.map((item, idx) => (
                <View key={idx} style={styles.poItemCard}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <TextInput
                      style={[styles.formInput, { flex: 2 }]}
                      placeholder="Item name (e.g. Boneless Chicken)"
                      placeholderTextColor="#94A3B8"
                      value={item.name}
                      onChangeText={(val) => handleUpdatePOItem(idx, { name: val })}
                    />
                    <TextInput
                      style={[styles.formInput, { width: 65, textAlign: 'center' }]}
                      placeholder="Unit"
                      placeholderTextColor="#94A3B8"
                      value={item.unit}
                      onChangeText={(val) => handleUpdatePOItem(idx, { unit: val })}
                    />
                    {poItems.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemovePOItem(idx)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.poSmallLabel}>Quantity</Text>
                      <TextInput
                        style={styles.formInputSmall}
                        keyboardType="numeric"
                        placeholder="Qty"
                        value={String(item.qtyReceived || item.qtyOrdered || '')}
                        onChangeText={(val) => {
                          const n = parseFloat(val) || 0;
                          handleUpdatePOItem(idx, { qtyOrdered: n, qtyReceived: n });
                        }}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.poSmallLabel}>Rate / Unit</Text>
                      <TextInput
                        style={styles.formInputSmall}
                        keyboardType="numeric"
                        placeholder="Rate"
                        value={String(item.unitCost || '')}
                        onChangeText={(val) => {
                          const n = parseFloat(val) || 0;
                          handleUpdatePOItem(idx, { unitCost: n });
                        }}
                      />
                    </View>

                    <View style={{ flex: 1.2, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Text style={styles.poSmallLabel}>Item Total</Text>
                      <Text style={styles.poItemTotalText}>
                        Rs. {(item.totalCost || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}

              {/* Summary Financials */}
              <View style={styles.poSummaryCard}>
                <View style={styles.poSummaryLine}>
                  <Text style={styles.poSummaryKey}>Sub Total:</Text>
                  <Text style={styles.poSummaryVal}>Rs. {poCalculations.subtotal.toLocaleString()}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginVertical: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poSmallLabel}>Transport / Freight</Text>
                    <TextInput
                      style={styles.formInputSmall}
                      keyboardType="numeric"
                      placeholder="0"
                      value={poFreight}
                      onChangeText={setPOFreight}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poSmallLabel}>Discount / Concession</Text>
                    <TextInput
                      style={styles.formInputSmall}
                      keyboardType="numeric"
                      placeholder="0"
                      value={poDiscount}
                      onChangeText={setPODiscount}
                    />
                  </View>
                </View>

                <View style={[styles.poSummaryLine, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' }]}>
                  <Text style={[styles.poSummaryKey, { fontWeight: '900', color: '#0F172A' }]}>Net Bill Total:</Text>
                  <Text style={[styles.poSummaryVal, { fontSize: 16, fontWeight: '900', color: '#047857' }]}>
                    Rs. {poCalculations.totalAmount.toLocaleString()}
                  </Text>
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={styles.poSmallLabel}>Amount Paid Upfront (نقد ادائیگی)</Text>
                  <TextInput
                    style={styles.formInputSmall}
                    keyboardType="numeric"
                    placeholder="0 if fully on credit khata"
                    value={poAmountPaid}
                    onChangeText={setPOAmountPaid}
                  />
                  <Text style={{ fontSize: 11.5, color: '#DC2626', fontWeight: '700', marginTop: 4 }}>
                    Remaining added to Supplier Ledger Khata: Rs. {poCalculations.balanceDue.toLocaleString()}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsPOModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSavePO}>
                <Text style={styles.saveBtnText}>Confirm & Save Bill</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          4. ADD / EDIT SUPPLIER MODAL
          ======================================================== */}
      <Modal visible={isSupplierModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.formModalCard, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingSupplier ? 'Edit Vendor Profile' : 'Register New Vendor (سپلائر)'}
              </Text>
              <TouchableOpacity onPress={() => setIsSupplierModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>Company / Supplier Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Al-Madina Fresh Poultry Ltd"
                placeholderTextColor="#94A3B8"
                value={formName}
                onChangeText={setFormName}
              />

              <Text style={styles.formLabel}>Food / Supply Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {SUPPLIER_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categorySelectPill, formCategory === cat && styles.categorySelectPillActive]}
                      onPress={() => setFormCategory(cat)}
                    >
                      <Text style={[styles.categorySelectPillText, formCategory === cat && styles.categorySelectPillTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Contact Person</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Haji Rafiq"
                    placeholderTextColor="#94A3B8"
                    value={formContactPerson}
                    onChangeText={setFormContactPerson}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Mobile Number *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 0300 4567891"
                    placeholderTextColor="#94A3B8"
                    value={formPhone}
                    onChangeText={setFormPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>City / Market</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Lahore / Badami Bagh"
                    placeholderTextColor="#94A3B8"
                    value={formCity}
                    onChangeText={setFormCity}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Payment Terms</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Credit 15 Days / COD"
                    placeholderTextColor="#94A3B8"
                    value={formPaymentTerms}
                    onChangeText={setFormPaymentTerms}
                  />
                </View>
              </View>

              <Text style={styles.formLabel}>Opening Balance Due (پہلے سے واجب الادا رقم - Rs.)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                value={formCurrentBalance}
                onChangeText={setFormCurrentBalance}
                keyboardType="numeric"
              />

              <Text style={styles.formLabel}>Supplied Raw Materials (comma separated)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Boneless Chicken, Whole Skinless, Wings"
                placeholderTextColor="#94A3B8"
                value={formSuppliedItems}
                onChangeText={setFormSuppliedItems}
              />

              <Text style={[styles.formLabel, { marginTop: 12, fontWeight: '800', color: '#52141C' }]}>
                Bank Account Details (بینک اکاؤنٹ - برائے آن لائن ادائیگی)
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  placeholder="Bank Name (e.g. Meezan)"
                  placeholderTextColor="#94A3B8"
                  value={formBankName}
                  onChangeText={setFormBankName}
                />
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  placeholder="Account Title"
                  placeholderTextColor="#94A3B8"
                  value={formAccountTitle}
                  onChangeText={setFormAccountTitle}
                />
              </View>
              <TextInput
                style={[styles.formInput, { marginTop: 6 }]}
                placeholder="Account Number / IBAN"
                placeholderTextColor="#94A3B8"
                value={formAccountNumber}
                onChangeText={setFormAccountNumber}
              />

              <Text style={styles.formLabel}>Notes / Delivery Details</Text>
              <TextInput
                style={[styles.formInput, { height: 50, textAlignVertical: 'top' }]}
                placeholder="e.g. Morning delivery at 7 AM..."
                placeholderTextColor="#94A3B8"
                value={formNotes}
                onChangeText={setFormNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsSupplierModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSupplier}>
                <Text style={styles.saveBtnText}>
                  {editingSupplier ? 'Update Vendor' : 'Save Vendor'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          5. PAYMENT VOUCHER RECEIPT THERMAL PREVIEW MODAL
          ======================================================== */}
      <Modal visible={isVoucherModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.voucherModalCard, isMobile && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={24} color="#15803D" />
                <Text style={styles.modalTitle}>Payment Receipt Voucher (ادائیگی واؤچر)</Text>
              </View>
              <TouchableOpacity onPress={() => setIsVoucherModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {voucherPayment && (
              <View style={styles.voucherReceiptBox}>
                <Text style={styles.voucherHeaderTitle}>SULTAN RESTAURANT & BAR B Q</Text>
                <Text style={styles.voucherHeaderSub}>Official Vendor Payment Voucher</Text>
                <Text style={styles.voucherDashedLine}>--------------------------------------</Text>

                <View style={styles.voucherRow}>
                  <Text style={styles.voucherLabel}>Voucher No:</Text>
                  <Text style={styles.voucherVal}>VCH-{voucherPayment.id.slice(-6).toUpperCase()}</Text>
                </View>

                <View style={styles.voucherRow}>
                  <Text style={styles.voucherLabel}>Date & Time:</Text>
                  <Text style={styles.voucherVal}>
                    {new Date(voucherPayment.paidAt).toLocaleDateString('en-PK')} {new Date(voucherPayment.paidAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.voucherRow}>
                  <Text style={styles.voucherLabel}>Paid To (Vendor):</Text>
                  <Text style={[styles.voucherVal, { fontWeight: '900', color: '#0F172A' }]}>
                    {voucherPayment.supplierName}
                  </Text>
                </View>

                <View style={styles.voucherRow}>
                  <Text style={styles.voucherLabel}>Payment Mode:</Text>
                  <Text style={[styles.voucherVal, { textTransform: 'uppercase' }]}>{voucherPayment.method}</Text>
                </View>

                {voucherPayment.bankName && (
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Bank Name:</Text>
                    <Text style={styles.voucherVal}>{voucherPayment.bankName}</Text>
                  </View>
                )}

                {voucherPayment.reference && (
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Ref / Cheque #:</Text>
                    <Text style={styles.voucherVal}>{voucherPayment.reference}</Text>
                  </View>
                )}

                <Text style={styles.voucherDashedLine}>======================================</Text>

                <View style={[styles.voucherRow, { marginVertical: 6 }]}>
                  <Text style={[styles.voucherLabel, { fontSize: 15, fontWeight: '900', color: '#0F172A' }]}>
                    AMOUNT PAID:
                  </Text>
                  <Text style={[styles.voucherVal, { fontSize: 18, fontWeight: '900', color: '#15803D' }]}>
                    Rs. {(voucherPayment.amount || 0).toLocaleString()}
                  </Text>
                </View>

                <Text style={styles.voucherDashedLine}>======================================</Text>

                <Text style={styles.voucherFooterNote}>
                  Verified by Sultan Accounts Department • System Generated Voucher
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalShareWhatsAppBtn}
                onPress={() => {
                  if (!voucherPayment) return;
                  const text = `👑 *SULTAN RESTAURANT - PAYMENT VOUCHER*\nVoucher: VCH-${voucherPayment.id.slice(-6).toUpperCase()}\nVendor: ${voucherPayment.supplierName}\nAmount Paid: Rs. ${voucherPayment.amount.toLocaleString()}\nMethod: ${voucherPayment.method.toUpperCase()}\nDate: ${new Date(voucherPayment.paidAt).toLocaleDateString()}\nStatus: Settled ✅`;
                  Share.share({ message: text, title: 'Payment Voucher' });
                }}
              >
                <Ionicons name="share-social-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalShareWhatsAppBtnText}>Share Voucher</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={() => setIsVoucherModalOpen(false)}>
                <Text style={styles.saveBtnText}>Done</Text>
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
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#52141C',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
    flexWrap: 'wrap',
    gap: 12,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  roleBadge: {
    backgroundColor: 'rgba(213, 169, 67, 0.25)',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncDotOnline: {
    backgroundColor: '#16A34A',
  },
  syncDotOffline: {
    backgroundColor: '#DC2626',
  },
  syncText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#52141C',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportBtnText: {
    color: '#52141C',
    fontWeight: '800',
    fontSize: 13,
  },
  addButton: {
    backgroundColor: '#D5A943',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#D5A943',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  addButtonText: {
    color: '#140306',
    fontWeight: '800',
    fontSize: 13,
  },
  contentScroll: {
    flex: 1,
    padding: 16,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    padding: 15,
    borderLeftWidth: 4.5,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        transition: 'all 0.2s ease',
      } as any,
    }),
  },
  kpiCardEmerald: {
    backgroundColor: 'rgba(236, 253, 245, 0.95)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderLeftColor: '#10B981',
  },
  kpiCardSapphire: {
    backgroundColor: 'rgba(240, 249, 255, 0.95)',
    borderColor: 'rgba(2, 132, 199, 0.35)',
    borderLeftColor: '#0284C7',
  },
  kpiCardAmber: {
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderLeftColor: '#F59E0B',
  },
  kpiCardRuby: {
    backgroundColor: 'rgba(254, 226, 226, 0.95)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderLeftColor: '#EF4444',
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingRight: 10,
    height: 42,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(213, 169, 67, 0.45)',
    gap: 8,
  },
  searchIconOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(82, 20, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
    ...Platform.select({
      web: { outlineStyle: 'none', outlineWidth: 0 } as any,
    }),
  },
  searchClearBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchShortcutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  searchShortcutText: {
    color: '#92400E',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  sortBtn: {},
  sortBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52141C',
  },
  balancePillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  balancePillActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  balancePillDueActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  balancePillClearActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  balancePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  balancePillTextActive: {
    color: '#FFFFFF',
  },
  categoryTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryTabSelected: {
    backgroundColor: '#52141C',
    borderColor: '#D5A943',
  },
  categoryTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  categoryTabTextSelected: {
    color: '#FFFFFF',
  },
  resultsCounterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultsCountText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D84315',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 360,
    marginTop: 4,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 16,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#140306',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
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
  suppliersList: {
    gap: 8,
  },
  supRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    ...Platform.select({
      web: { transition: 'all 0.15s ease' } as any,
    }),
  },
  supRowHasBalance: {
    borderLeftColor: '#EF4444',
  },
  rowCol: {
    justifyContent: 'center',
  },
  avatarCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowSupName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  categoryBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  categoryBadgeCompactText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rowContactPerson: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  rowPhoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowCityText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  termsBadgeCompact: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  termsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  rowBalanceText: {
    fontSize: 14.5,
    fontWeight: '900',
  },
  rowBalanceSubText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  rowPurchasesText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  rowOrdersText: {
    fontSize: 11,
    color: '#64748B',
  },
  actionBtnView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    borderRadius: 7,
    ...Platform.select({ web: { cursor: 'pointer' } as any }),
  },
  actionBtnViewText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52141C',
  },
  actionBtnPay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    borderRadius: 7,
    ...Platform.select({ web: { cursor: 'pointer' } as any }),
  },
  actionBtnPayText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  actionBtnPO: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 5.5,
    borderRadius: 7,
    ...Platform.select({ web: { cursor: 'pointer' } as any }),
  },
  actionBtnPOText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  actionBtnEdit: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...Platform.select({ web: { cursor: 'pointer' } as any }),
  },
  actionBtnDelete: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    ...Platform.select({ web: { cursor: 'pointer' } as any }),
  },
  mobileSupplierCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
    gap: 8,
  },
  mobileCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileBalanceText: {
    fontSize: 14,
    fontWeight: '900',
  },
  mobileBalanceSubText: {
    fontSize: 10.5,
    color: '#64748B',
  },
  mobileCardMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  mobilePhoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileOrdersText: {
    fontSize: 11,
    color: '#64748B',
  },
  mobileCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileActionBtnView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  mobileActionBtnPay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  mobileActionBtnPO: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContentMobile: {
    padding: 14,
    maxWidth: '100%',
  },
  dossierModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 760,
    maxHeight: '90%',
  },
  dossierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
  },
  dossierAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  dossierName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  dossierPhone: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  dossierKpiRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  dossierKpiBox: {
    flex: 1,
    alignItems: 'center',
  },
  dossierKpiLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  dossierKpiVal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  dossierTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 12,
  },
  dossierTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  dossierTabActive: {
    borderBottomColor: '#52141C',
  },
  dossierTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  dossierTabTextActive: {
    color: '#52141C',
  },
  dossierScroll: {
    maxHeight: 330,
    marginBottom: 14,
  },
  ledgerRowCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 9,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ledgerRowBill: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#EF4444',
  },
  ledgerRowPayment: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#10B981',
  },
  ledgerTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  ledgerTypeBadgeBill: {
    backgroundColor: '#FEE2E2',
  },
  ledgerTypeBadgePayment: {
    backgroundColor: '#DCFCE7',
  },
  ledgerTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  ledgerDocNo: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  ledgerInvoiceNo: {
    fontSize: 11,
    color: '#64748B',
  },
  ledgerDate: {
    fontSize: 11,
    color: '#64748B',
  },
  ledgerSubtitle: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
    marginBottom: 6,
  },
  ledgerFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  ledgerDebitText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  ledgerCreditText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  ledgerRunBalText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  dossierOrderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 9,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dossierOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dossierOrderId: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dossierOrderDate: {
    fontSize: 11,
    color: '#64748B',
  },
  dossierOrderItems: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 6,
  },
  dossierOrderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  dossierOrderTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#047857',
  },
  dossierOrderSub: {
    fontSize: 10.5,
    color: '#64748B',
  },
  statusBadgeCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusBadgePaid: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeUnpaid: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeTextCompact: {
    fontSize: 10,
    fontWeight: '800',
  },
  dossierProfileSection: {
    padding: 4,
  },
  dossierSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
  },
  dossierSectionBody: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
  },
  bankDetailsBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  bankDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bankDetailLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  bankDetailVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  tagBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  dossierActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexWrap: 'wrap',
  },
  modalPayActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
  },
  modalPayActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  modalPOActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
  },
  modalPOActionBtnText: {
    color: '#140306',
    fontWeight: '800',
    fontSize: 12.5,
  },
  modalShareWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
  },
  modalShareWhatsAppBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  tabEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 30,
  },
  formModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    width: '100%',
    maxWidth: 580,
  },
  poModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    width: '100%',
    maxWidth: 680,
  },
  voucherModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    width: '100%',
    maxWidth: 480,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  formInputSmall: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0F172A',
  },
  categorySelectPill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  categorySelectPillActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  categorySelectPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  categorySelectPillTextActive: {
    color: '#FFFFFF',
  },
  methodSelectRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  methodSelectPill: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  methodSelectPillActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  methodSelectPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  methodSelectPillTextActive: {
    color: '#15803D',
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  quickAmountChip: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  quickAmountChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addItemBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#52141C',
  },
  poItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  poSmallLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  poItemTotalText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#047857',
  },
  poSummaryCard: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  poSummaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poSummaryKey: {
    fontSize: 12.5,
    color: '#475569',
  },
  poSummaryVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  voucherReceiptBox: {
    backgroundColor: '#FDFBF7',
    borderWidth: 1,
    borderColor: '#E8E1D5',
    borderRadius: 10,
    padding: 16,
    marginVertical: 8,
  },
  voucherHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#52141C',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  voucherHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  voucherDashedLine: {
    fontSize: 11,
    color: '#CBD5E1',
    textAlign: 'center',
    marginVertical: 6,
  },
  voucherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  voucherLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  voucherVal: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  voucherFooterNote: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: '#52141C',
    borderWidth: 1,
    borderColor: '#D5A943',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
