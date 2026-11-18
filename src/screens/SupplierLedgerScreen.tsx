import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  useOpsStore,
  Supplier,
  SupplierCategory,
  SUPPLIER_CATEGORIES,
  PurchaseOrder,
  PurchaseOrderItem,
  SupplierPayment,
} from '../store/opsStore';
import RoyalDropdown, { DropdownOption } from '../components/RoyalDropdown';
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

export type LedgerEntry = {
  id: string;
  date: number;
  type: 'bill' | 'payment';
  docNumber: string;
  invoiceNo?: string;
  supplierId: string;
  supplierName: string;
  category?: SupplierCategory;
  title: string;
  subtitle: string;
  debit: number; // Procurement bill amount (adds to payable)
  credit: number; // Payment settled (deducts from payable)
  runningBalance: number;
  rawPO?: PurchaseOrder;
  rawPayment?: SupplierPayment;
};

type ActiveTab = 'ledger' | 'invoices' | 'payments';
type DateFilterRange = 'all' | 'today' | 'this_week' | 'this_month' | 'last_month';

export default function SupplierLedgerScreen({ backRoute = '/admin/suppliers' }: { backRoute?: string }) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ supplierId?: string }>();
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
    recordSupplierPayment,
    deleteSupplierPayment,
    addPurchaseOrder,
    deletePurchaseOrder,
  } = useOpsStore();

  // Selected Supplier State ('all' or supplier.id)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<ActiveTab>('ledger');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateFilterRange>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  // Handle URL param pre-selection
  useEffect(() => {
    if (searchParams.supplierId) {
      setSelectedSupplierId(searchParams.supplierId);
    }
  }, [searchParams.supplierId]);

  // Selected Supplier Object
  const selectedSupplier = useMemo(() => {
    if (selectedSupplierId === 'all') return null;
    return suppliers.find((s) => s.id === selectedSupplierId) || null;
  }, [selectedSupplierId, suppliers]);

  // Modals
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payTargetSupplierId, setPayTargetSupplierId] = useState<string>('');
  const [payTargetPOId, setPayTargetPOId] = useState<string>('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'online' | 'cheque'>('cash');
  const [payBankName, setPayBankName] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Thermal Voucher Modal
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [voucherPayment, setVoucherPayment] = useState<SupplierPayment | null>(null);

  // PO Detail Modal
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  // New Purchase Bill Modal
  const [isNewBillModalOpen, setIsNewBillModalOpen] = useState(false);
  const [billSupplierId, setBillSupplierId] = useState('');
  const [billInvoiceNo, setBillInvoiceNo] = useState('');
  const [billItems, setBillItems] = useState<PurchaseOrderItem[]>([
    { name: '', category: 'Meat', unit: 'kg', qtyOrdered: 10, qtyReceived: 10, unitCost: 500, totalCost: 5000 },
  ]);
  const [billFreight, setBillFreight] = useState('0');
  const [billDiscount, setBillDiscount] = useState('0');
  const [billAmountPaid, setBillAmountPaid] = useState('0');
  const [billNotes, setBillNotes] = useState('');

  // ----------------------------------------------------
  // Dropdown Options
  // ----------------------------------------------------
  const supplierDropdownOptions: DropdownOption<string>[] = useMemo(() => {
    const totalDueAll = suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0);
    const list: DropdownOption<string>[] = [
      {
        label: '⭐ All Suppliers (Consolidated Khata)',
        value: 'all',
        icon: 'layers-outline',
        badge: totalDueAll > 0 ? `Net Due: Rs. ${totalDueAll.toLocaleString()}` : 'Cleared',
        sublabel: 'تمام سپلائرز کا مشترکہ کھاتہ و بیلنس',
      },
    ];

    suppliers.forEach((s) => {
      const due = s.currentBalance || 0;
      list.push({
        label: s.name,
        value: s.id,
        icon: CATEGORY_THEMES[s.category]?.icon || 'business-outline',
        badge: due > 0 ? `Due: Rs. ${due.toLocaleString()}` : 'Cleared ✓',
        sublabel: `${s.contactPerson || 'Vendor'} • ${s.city || 'Lahore'} • ${CATEGORY_THEMES[s.category]?.urdu || s.category}`,
      });
    });

    return list;
  }, [suppliers]);

  // ----------------------------------------------------
  // Date Filtering Helper
  // ----------------------------------------------------
  const isDateInFilter = useCallback((timestamp: number): boolean => {
    if (dateRange === 'all') return true;
    const date = new Date(timestamp);
    const now = new Date();

    if (dateRange === 'today') {
      return date.toDateString() === now.toDateString();
    }
    if (dateRange === 'this_week') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= sevenDaysAgo;
    }
    if (dateRange === 'this_month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    if (dateRange === 'last_month') {
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return date.getMonth() === prevMonth && date.getFullYear() === prevYear;
    }
    return true;
  }, [dateRange]);

  // ----------------------------------------------------
  // Compute Complete Ledger (Khata)
  // ----------------------------------------------------
  const fullLedger = useMemo<LedgerEntry[]>(() => {
    // 1. Gather all transactions matching supplier filter
    const pos = selectedSupplierId === 'all'
      ? purchaseOrders
      : purchaseOrders.filter((po) => po.supplierId === selectedSupplierId);

    const pays = selectedSupplierId === 'all'
      ? supplierPayments
      : supplierPayments.filter((p) => p.supplierId === selectedSupplierId);

    const rawList: { date: number; type: 'bill' | 'payment'; po?: PurchaseOrder; payment?: SupplierPayment }[] = [];

    pos.forEach((po) => {
      rawList.push({ date: po.orderDate || po.createdAt, type: 'bill', po });
    });

    pays.forEach((pay) => {
      rawList.push({ date: pay.paidAt, type: 'payment', payment: pay });
    });

    // Sort chronologically ascending to compute correct running balance
    rawList.sort((a, b) => a.date - b.date);

    let currentRunBal = 0;
    const computed: LedgerEntry[] = [];

    rawList.forEach((item, index) => {
      if (item.type === 'bill' && item.po) {
        const po = item.po;
        const sup = suppliers.find((s) => s.id === po.supplierId);
        currentRunBal += po.totalAmount;
        const itemsSummary = po.items.map((i) => `${i.name} (${i.qtyReceived || i.qtyOrdered} ${i.unit})`).join(', ');

        computed.push({
          id: `ledger-po-${po.id}-${index}`,
          date: item.date,
          type: 'bill',
          docNumber: po.poNumber,
          invoiceNo: po.invoiceNo,
          supplierId: po.supplierId,
          supplierName: po.supplierName || sup?.name || 'Unknown Vendor',
          category: sup?.category,
          title: 'خریداری بل (Procurement Bill)',
          subtitle: itemsSummary || 'خام مال موصول ہوا',
          debit: po.totalAmount,
          credit: 0,
          runningBalance: currentRunBal,
          rawPO: po,
        });
      } else if (item.type === 'payment' && item.payment) {
        const pay = item.payment;
        const sup = suppliers.find((s) => s.id === pay.supplierId);
        currentRunBal = currentRunBal - pay.amount;
        const details = [pay.method.toUpperCase(), pay.bankName, pay.reference ? `Ref: ${pay.reference}` : null]
          .filter(Boolean)
          .join(' • ');

        computed.push({
          id: `ledger-pay-${pay.id}-${index}`,
          date: item.date,
          type: 'payment',
          docNumber: `VCH-${pay.id.slice(-6).toUpperCase()}`,
          supplierId: pay.supplierId,
          supplierName: pay.supplierName || sup?.name || 'Vendor',
          category: sup?.category,
          title: 'ادائیگی واؤچر (Payment Settled)',
          subtitle: `${details}${pay.notes ? ` • Note: ${pay.notes}` : ''}`,
          debit: 0,
          credit: pay.amount,
          runningBalance: currentRunBal,
          rawPayment: pay,
        });
      }
    });

    // Newest first for display
    return computed.reverse();
  }, [selectedSupplierId, purchaseOrders, supplierPayments, suppliers]);

  // Filtered Ledger by Search, Date & Category
  const filteredLedger = useMemo(() => {
    return fullLedger.filter((item) => {
      if (!isDateInFilter(item.date)) return false;

      if (categoryFilter !== 'All' && item.category !== categoryFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          item.docNumber.toLowerCase().includes(q) ||
          (item.invoiceNo && item.invoiceNo.toLowerCase().includes(q)) ||
          item.supplierName.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [fullLedger, categoryFilter, searchQuery, isDateInFilter]);

  // Filtered Purchase Orders
  const filteredPOs = useMemo(() => {
    const list = selectedSupplierId === 'all'
      ? purchaseOrders
      : purchaseOrders.filter((po) => po.supplierId === selectedSupplierId);

    return list.filter((po) => {
      if (!isDateInFilter(po.orderDate || po.createdAt)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          po.poNumber.toLowerCase().includes(q) ||
          (po.invoiceNo && po.invoiceNo.toLowerCase().includes(q)) ||
          po.supplierName.toLowerCase().includes(q) ||
          po.items.some((i) => i.name.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [purchaseOrders, selectedSupplierId, searchQuery, isDateInFilter]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    const list = selectedSupplierId === 'all'
      ? supplierPayments
      : supplierPayments.filter((p) => p.supplierId === selectedSupplierId);

    return list.filter((pay) => {
      if (!isDateInFilter(pay.paidAt)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          pay.id.toLowerCase().includes(q) ||
          pay.supplierName.toLowerCase().includes(q) ||
          (pay.bankName && pay.bankName.toLowerCase().includes(q)) ||
          (pay.reference && pay.reference.toLowerCase().includes(q)) ||
          (pay.notes && pay.notes.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [supplierPayments, selectedSupplierId, searchQuery, isDateInFilter]);

  // ----------------------------------------------------
  // Dynamic KPIs (Overall or Selected Supplier)
  // ----------------------------------------------------
  const kpis = useMemo(() => {
    if (selectedSupplier) {
      const netDue = selectedSupplier.currentBalance || 0;
      const totalBills = purchaseOrders
        .filter((po) => po.supplierId === selectedSupplier.id)
        .reduce((sum, po) => sum + po.totalAmount, 0);
      const totalPaid = supplierPayments
        .filter((p) => p.supplierId === selectedSupplier.id)
        .reduce((sum, p) => sum + p.amount, 0);

      const pays = supplierPayments.filter((p) => p.supplierId === selectedSupplier.id);
      const lastPay = pays.length > 0 ? pays.sort((a, b) => b.paidAt - a.paidAt)[0] : null;

      return {
        isSingle: true,
        name: selectedSupplier.name,
        netDue,
        totalBills,
        totalPaid,
        pendingOrdersCount: purchaseOrders.filter((po) => po.supplierId === selectedSupplier.id && (po.balanceDue || 0) > 0).length,
        lastPaymentText: lastPay ? `Rs. ${lastPay.amount.toLocaleString()} on ${new Date(lastPay.paidAt).toLocaleDateString()}` : 'No payments yet',
      };
    } else {
      const netDue = suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0);
      const totalBills = purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0);
      const totalPaid = supplierPayments.reduce((sum, p) => sum + p.amount, 0);
      const vendorsWithDue = suppliers.filter((s) => (s.currentBalance || 0) > 0).length;

      return {
        isSingle: false,
        name: 'All Suppliers (Consolidated)',
        netDue,
        totalBills,
        totalPaid,
        pendingOrdersCount: purchaseOrders.filter((po) => (po.balanceDue || 0) > 0).length,
        lastPaymentText: `${vendorsWithDue} of ${suppliers.length} vendors have pending balance`,
      };
    }
  }, [selectedSupplier, suppliers, purchaseOrders, supplierPayments]);

  // ----------------------------------------------------
  // Action Handlers
  // ----------------------------------------------------
  const openPayModalForSupplier = (supplierId: string, poId: string = '', defaultAmount?: number) => {
    setPayTargetSupplierId(supplierId);
    setPayTargetPOId(poId);
    if (defaultAmount !== undefined && defaultAmount > 0) {
      setPayAmount(defaultAmount.toString());
    } else {
      const sup = suppliers.find((s) => s.id === supplierId);
      setPayAmount(sup ? (sup.currentBalance || 0).toString() : '0');
    }
    setPayMethod('cash');
    setPayBankName('');
    setPayReference('');
    setPayNotes(poId ? `Payment against PO ${poId}` : '');
    setIsPayModalOpen(true);
  };

  const handleConfirmPayment = () => {
    const amountNum = parseFloat(payAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount greater than zero.');
      return;
    }

    const sup = suppliers.find((s) => s.id === payTargetSupplierId);
    if (!sup) {
      Alert.alert('Supplier Not Found', 'Please select a valid supplier.');
      return;
    }

    // Call store
    recordSupplierPayment({
      supplierId: sup.id,
      supplierName: sup.name,
      purchaseOrderId: payTargetPOId || undefined,
      amount: amountNum,
      method: payMethod,
      bankName: payBankName.trim() || undefined,
      reference: payReference.trim() || undefined,
      notes: payNotes.trim() || undefined,
      paidBy: 'Admin (Ledger Command)',
    });

    setIsPayModalOpen(false);

    // Auto open voucher preview
    const newlyRecorded: SupplierPayment = {
      id: `spay-${Date.now().toString(36)}`,
      supplierId: sup.id,
      supplierName: sup.name,
      amount: amountNum,
      method: payMethod,
      bankName: payBankName.trim() || undefined,
      reference: payReference.trim() || undefined,
      notes: payNotes.trim() || undefined,
      paidBy: 'Admin',
      paidAt: Date.now(),
    };
    setVoucherPayment(newlyRecorded);
    setIsVoucherModalOpen(true);
  };

  const confirmAction = (
    title: string,
    message: string,
    onConfirm: () => void,
    destructiveLabel = 'Confirm'
  ) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: destructiveLabel, style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  const handleDeletePayment = (payment: SupplierPayment) => {
    confirmAction(
      'Revert Payment (ادائیگی ریورس کریں)',
      `Are you sure you want to revert voucher VCH-${payment.id.slice(-6).toUpperCase()} of Rs. ${payment.amount.toLocaleString()} paid to ${payment.supplierName}?\n\nThis will restore the pending balance in the Khata.`,
      () => deleteSupplierPayment(payment.id),
      'Yes, Revert Payment'
    );
  };

  const handleDeletePO = (po: PurchaseOrder) => {
    if ((po.amountPaid || 0) > 0) {
      const msg = `This bill has Rs. ${(po.amountPaid || 0).toLocaleString()} recorded in payments.\n\nPlease delete or revert the associated payment vouchers first from the 'Payments' tab before deleting this bill.`;
      if (Platform.OS === 'web') {
        window.alert(`Cannot Delete Bill with Active Payments\n\n${msg}`);
      } else {
        Alert.alert('Cannot Delete Bill with Active Payments', msg);
      }
      return;
    }

    confirmAction(
      'Delete Purchase Order (بل حذف کریں)',
      `Are you sure you want to remove Bill ${po.poNumber} (Rs. ${po.totalAmount.toLocaleString()})?\n\nThis will deduct the bill from the supplier's balance and purchases.`,
      () => deletePurchaseOrder(po.id),
      'Delete Bill'
    );
  };

  // WhatsApp Statement Share
  const handleShareWhatsAppStatement = () => {
    const targetSup = selectedSupplier;
    let msg = `👑 *SULTAN RESTAURANT & BAR B Q - VENDOR STATEMENT*\n`;
    msg += `تاریخ: ${new Date().toLocaleDateString('en-PK')}\n`;
    msg += `--------------------------------------\n`;

    if (targetSup) {
      msg += `وینڈر (Vendor): *${targetSup.name}*\n`;
      msg += `رابطہ (Contact): ${targetSup.contactPerson || 'N/A'} (${targetSup.phone})\n`;
      msg += `کیٹیگری: ${targetSup.category}\n`;
      msg += `• کل لائف ٹائم بلز: Rs. ${(targetSup.totalPurchases || 0).toLocaleString()}\n`;
      msg += `• *کل واجب الادا نیٹ بقایا: Rs. ${(targetSup.currentBalance || 0).toLocaleString()}*\n`;
      msg += `--------------------------------------\n`;
      msg += `*آخری ٹرانزیکشنز کی تفصیل (Recent Transactions):*\n`;

      const recent = fullLedger.slice(0, 7);
      if (recent.length === 0) {
        msg += `کوئی ریکارڈ موجود نہیں۔\n`;
      } else {
        recent.forEach((item) => {
          const dateStr = new Date(item.date).toLocaleDateString('en-PK');
          if (item.type === 'bill') {
            msg += `📄 ${dateStr} | بل #${item.docNumber} | +Rs. ${item.debit.toLocaleString()}\n`;
          } else {
            msg += `💳 ${dateStr} | واؤچر #${item.docNumber} (${item.subtitle}) | -Rs. ${item.credit.toLocaleString()}\n`;
          }
        });
      }
      msg += `\n*حتمی نیٹ قابل ادا رقم: Rs. ${(targetSup.currentBalance || 0).toLocaleString()}*`;
    } else {
      msg += `*خلاصہ کھاتہ تمام سپلائرز (Consolidated Statement)*\n`;
      msg += `• کل وینڈرز: ${suppliers.length}\n`;
      msg += `• کل خریداری: Rs. ${kpis.totalBills.toLocaleString()}\n`;
      msg += `• کل ادائیگیاں: Rs. ${kpis.totalPaid.toLocaleString()}\n`;
      msg += `• *کل واجب الادا بقایا جات: Rs. ${kpis.netDue.toLocaleString()}*\n`;
    }

    msg += `\n--------------------------------------\nبرائے رابطہ: اکاؤنٹس برانچ، سلطان ریسٹورنٹ`;

    if (Platform.OS === 'web') {
      const phone = targetSup ? toWhatsAppNumber(targetSup.whatsapp || targetSup.phone || '') : '';
      const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    } else {
      Share.share({ message: msg, title: 'Vendor Statement' });
    }
  };

  // Web Print Trigger
  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    } else {
      handleShareWhatsAppStatement();
    }
  };

  // ----------------------------------------------------
  // Add PO Builder Logic
  // ----------------------------------------------------
  const handleAddBillItem = () => {
    setBillItems([
      ...billItems,
      { name: '', category: 'General', unit: 'kg', qtyOrdered: 1, qtyReceived: 1, unitCost: 100, totalCost: 100 },
    ]);
  };

  const handleUpdateBillItem = (idx: number, patch: Partial<PurchaseOrderItem>) => {
    const updated = [...billItems];
    const cur = { ...updated[idx], ...patch };
    const qty = cur.qtyReceived || cur.qtyOrdered || 0;
    const cost = cur.unitCost || 0;
    cur.totalCost = qty * cost;
    updated[idx] = cur;
    setBillItems(updated);
  };

  const handleRemoveBillItem = (idx: number) => {
    if (billItems.length === 1) return;
    setBillItems(billItems.filter((_, i) => i !== idx));
  };

  const billCalculations = useMemo(() => {
    const subtotal = billItems.reduce((acc, item) => acc + (item.totalCost || 0), 0);
    const freight = parseFloat(billFreight) || 0;
    const discount = parseFloat(billDiscount) || 0;
    const totalAmount = Math.max(0, subtotal + freight - discount);
    const paid = parseFloat(billAmountPaid) || 0;
    const balanceDue = Math.max(0, totalAmount - paid);
    return { subtotal, freight, discount, totalAmount, paid, balanceDue };
  }, [billItems, billFreight, billDiscount, billAmountPaid]);

  const handleSavePurchaseBill = () => {
    const sup = suppliers.find((s) => s.id === billSupplierId);
    if (!sup) {
      Alert.alert('Vendor Required', 'Please select a vendor for this procurement bill.');
      return;
    }

    if (billItems.some((i) => !i.name.trim())) {
      Alert.alert('Item Name Required', 'Please provide a name for all procured items.');
      return;
    }

    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    const now = Date.now();

    addPurchaseOrder(
      {
        poNumber,
        supplierId: sup.id,
        supplierName: sup.name,
        invoiceNo: billInvoiceNo.trim() || undefined,
        orderDate: now,
        deliveryDate: now,
        status: 'received',
        paymentStatus: billCalculations.balanceDue === 0 ? 'paid' : billCalculations.paid > 0 ? 'partial' : 'unpaid',
        items: billItems,
        subtotal: billCalculations.subtotal,
        discount: billCalculations.discount,
        tax: 0,
        freight: billCalculations.freight,
        totalAmount: billCalculations.totalAmount,
        amountPaid: billCalculations.paid,
        balanceDue: billCalculations.balanceDue,
        paymentMethod: billCalculations.paid >= billCalculations.totalAmount ? 'cash' : 'credit',
        notes: billNotes.trim() || undefined,
      },
      { autoReceiveToInventory: true }
    );

    setIsNewBillModalOpen(false);
    Alert.alert('Bill Saved', `Purchase bill ${poNumber} recorded successfully and added to Khata.`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* ========================================================
          1. TOP NAVIGATION & EXECUTIVE HEADER
          ======================================================== */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push(backRoute as any)}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Back' } as any) : {})}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="book" size={22} color="#FBBF24" />
              <Text style={styles.headerTitle}>Supplier Ledger & Payments</Text>
              <View style={styles.khataBadge}>
                <Text style={styles.khataBadgeText}>کھاتہ لیجر</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              Complete vendor audit trail, procurement bills, debit/credit entries & payment vouchers
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* Live Sync Status */}
          <TouchableOpacity
            style={[styles.syncStatusPill, isManualSyncing && { opacity: 0.7 }]}
            onPress={handleManualSync}
            disabled={isManualSyncing}
          >
            <View style={[styles.syncDot, { backgroundColor: isConnected ? '#22C55E' : '#EF4444' }]} />
            <Text style={styles.syncStatusText}>
              {isManualSyncing ? 'Syncing...' : isConnected ? 'Cloud Active' : 'Offline'}
            </Text>
          </TouchableOpacity>

          {/* New PO / Bill Button */}
          <TouchableOpacity
            style={styles.headerSecBtn}
            onPress={() => {
              setBillSupplierId(selectedSupplierId !== 'all' ? selectedSupplierId : suppliers[0]?.id || '');
              setBillInvoiceNo('');
              setBillItems([{ name: '', category: 'Raw Materials', unit: 'kg', qtyOrdered: 10, qtyReceived: 10, unitCost: 500, totalCost: 5000 }]);
              setBillFreight('0');
              setBillDiscount('0');
              setBillAmountPaid('0');
              setBillNotes('');
              setIsNewBillModalOpen(true);
            }}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
          >
            <Ionicons name="document-text-outline" size={16} color="#FFFFFF" />
            <Text style={styles.headerSecBtnText}>+ New Purchase Bill</Text>
          </TouchableOpacity>

          {/* Quick Pay Button */}
          <TouchableOpacity
            style={styles.headerPriBtn}
            onPress={() => {
              const targetId = selectedSupplierId !== 'all' ? selectedSupplierId : suppliers[0]?.id || '';
              openPayModalForSupplier(targetId);
            }}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
          >
            <Ionicons name="cash-outline" size={17} color="#52141C" />
            <Text style={styles.headerPriBtnText}>Record Payment (ادائیگی)</Text>
          </TouchableOpacity>

          {/* Print / Export Button */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={handlePrint}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Print Statement' } as any) : {})}
          >
            <Ionicons name="print-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {/* WhatsApp Share Button */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: '#16A34A' }]}
            onPress={handleShareWhatsAppStatement}
            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Share on WhatsApp' } as any) : {})}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ========================================================
          2. DYNAMIC EXECUTIVE KPI CARDS BAR
          ======================================================== */}
      <View style={styles.kpiContainer}>
        <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>TOTAL NET PAYABLE DUE</Text>
            <View style={styles.kpiIconWrapRed}>
              <Ionicons name="alert-circle" size={16} color="#DC2626" />
            </View>
          </View>
          <Text style={[styles.kpiValue, { color: kpis.netDue > 0 ? '#DC2626' : '#15803D' }]}>
            Rs. {kpis.netDue.toLocaleString()}
          </Text>
          <Text style={styles.kpiSubtext}>
            {kpis.isSingle ? `واجب الادا بقایا برائے ${kpis.name}` : `کل بقایا جات برائے تمام ${suppliers.length} سپلائرز`}
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>LIFETIME PURCHASES (بلز)</Text>
            <View style={styles.kpiIconWrapBlue}>
              <Ionicons name="cart" size={16} color="#0284C7" />
            </View>
          </View>
          <Text style={styles.kpiValue}>Rs. {kpis.totalBills.toLocaleString()}</Text>
          <Text style={styles.kpiSubtext}>
            {kpis.isSingle ? `${filteredPOs.length} انوائسز / پرچیز آرڈرز` : `${purchaseOrders.length} کل خریداری انوائسز`}
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>PAYMENTS DISBURSED (ادائیگیاں)</Text>
            <View style={styles.kpiIconWrapGreen}>
              <Ionicons name="checkmark-done-circle" size={16} color="#16A34A" />
            </View>
          </View>
          <Text style={[styles.kpiValue, { color: '#16A34A' }]}>Rs. {kpis.totalPaid.toLocaleString()}</Text>
          <Text style={styles.kpiSubtext}>
            {kpis.isSingle ? `${filteredPayments.length} ادائیگی واؤچرز` : `${supplierPayments.length} مجموعی ادا شدہ واؤچرز`}
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiLabel}>KHATA STATUS & AUDIT</Text>
            <View style={styles.kpiIconWrapAmber}>
              <Ionicons name="shield-checkmark" size={16} color="#D97706" />
            </View>
          </View>
          <Text style={[styles.kpiValue, { fontSize: 16, color: '#334155', marginTop: 4 }]}>
            {kpis.lastPaymentText}
          </Text>
          <Text style={styles.kpiSubtext}>
            {kpis.pendingOrdersCount} آرڈرز پر رقم تاحال بقایا ہے
          </Text>
        </View>
      </View>

      {/* ========================================================
          3. SMART SUPPLIER SELECTOR & FILTERS STRIP
          ======================================================== */}
      <View style={styles.filterBar}>
        {/* Vendor Selector Dropdown */}
        <View style={[styles.selectorWrap, isMobile && { width: '100%' }]}>
          <RoyalDropdown
            label="Select Supplier / Vendor (سپلائر منتخب کریں)"
            placeholder="Choose vendor or consolidated view..."
            options={supplierDropdownOptions}
            value={selectedSupplierId}
            onSelect={(val) => setSelectedSupplierId(val)}
            searchable
            searchPlaceholder="Search vendor by name, phone, city..."
            triggerStyle={styles.dropdownTriggerCustom}
          />
        </View>

        {/* Search Input in Ledger */}
        <View style={[styles.searchWrap, isMobile && { width: '100%' }]}>
          <Ionicons name="search" size={16} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Bill #, Invoice #, Voucher #, items, or notes..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Date Filter Pills */}
        <View style={styles.datePillsWrap}>
          {(['all', 'today', 'this_week', 'this_month', 'last_month'] as DateFilterRange[]).map((r) => {
            const labels: Record<DateFilterRange, string> = {
              all: 'All Time',
              today: 'Today',
              this_week: 'This Week',
              this_month: 'This Month',
              last_month: 'Last Month',
            };
            const active = dateRange === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.datePill, active && styles.datePillActive]}
                onPress={() => setDateRange(r)}
              >
                <Text style={[styles.datePillText, active && styles.datePillTextActive]}>
                  {labels[r]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ========================================================
          4. SELECTED SUPPLIER DOSSIER PROFILE STRIP
          ======================================================== */}
      {selectedSupplier && (
        <View style={styles.supplierDossierBanner}>
          <View style={styles.dossierLeft}>
            <View style={[styles.dossierAvatar, { backgroundColor: CATEGORY_THEMES[selectedSupplier.category]?.bg || '#F1F5F9' }]}>
              <Ionicons
                name={CATEGORY_THEMES[selectedSupplier.category]?.icon || 'business'}
                size={22}
                color={CATEGORY_THEMES[selectedSupplier.category]?.accent || '#52141C'}
              />
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={styles.dossierTitle}>{selectedSupplier.name}</Text>
                <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_THEMES[selectedSupplier.category]?.bg }]}>
                  <Text style={[styles.categoryBadgeText, { color: CATEGORY_THEMES[selectedSupplier.category]?.text }]}>
                    {selectedSupplier.category} ({CATEGORY_THEMES[selectedSupplier.category]?.urdu})
                  </Text>
                </View>
                <View style={[styles.termsBadge]}>
                  <Ionicons name="time-outline" size={12} color="#475569" style={{ marginRight: 3 }} />
                  <Text style={styles.termsBadgeText}>{selectedSupplier.paymentTerms || 'Standard Terms'}</Text>
                </View>
              </View>

              <View style={styles.dossierContactRow}>
                <Text style={styles.dossierContactText}>
                  👤 {selectedSupplier.contactPerson || 'Vendor'} • 📞 {selectedSupplier.phone} • 📍 {selectedSupplier.city || 'Lahore'}
                </Text>

                {selectedSupplier.bankDetails && selectedSupplier.bankDetails.bankName && (
                  <Text style={styles.dossierBankText}>
                    🏦 {selectedSupplier.bankDetails.bankName} | A/C: {selectedSupplier.bankDetails.accountNumber} ({selectedSupplier.bankDetails.accountTitle})
                  </Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.dossierRight}>
            <TouchableOpacity
              style={styles.dossierPayBtn}
              onPress={() => openPayModalForSupplier(selectedSupplier.id, '', selectedSupplier.currentBalance)}
              {...(Platform.OS === 'web' ? ({ className: 'interactive-btn' } as any) : {})}
            >
              <Ionicons name="cash" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.dossierPayBtnText}>Pay Balance (ادائیگی کریں)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dossierClearBtn}
              onPress={() => setSelectedSupplierId('all')}
              {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Clear Vendor' } as any) : {})}
            >
              <Ionicons name="close-circle-outline" size={16} color="#64748B" />
              <Text style={styles.dossierClearBtnText}>All Vendors</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================================
          5. NAVIGATION TABS (LEDGER vs INVOICES vs PAYMENTS)
          ======================================================== */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'ledger' && styles.tabBtnActive]}
          onPress={() => setActiveTab('ledger')}
        >
          <Ionicons
            name="list-outline"
            size={18}
            color={activeTab === 'ledger' ? '#52141C' : '#64748B'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'ledger' && styles.tabBtnTextActive]}>
            1. Complete Khata Ledger ({filteredLedger.length})
          </Text>
          <View style={[styles.tabPill, activeTab === 'ledger' && styles.tabPillActive]}>
            <Text style={[styles.tabPillText, activeTab === 'ledger' && styles.tabPillTextActive]}>
              کھاتہ تفصیل
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'invoices' && styles.tabBtnActive]}
          onPress={() => setActiveTab('invoices')}
        >
          <Ionicons
            name="receipt-outline"
            size={18}
            color={activeTab === 'invoices' ? '#52141C' : '#64748B'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'invoices' && styles.tabBtnTextActive]}>
            2. Purchase Bills & Invoices ({filteredPOs.length})
          </Text>
          <View style={[styles.tabPill, activeTab === 'invoices' && styles.tabPillActive]}>
            <Text style={[styles.tabPillText, activeTab === 'invoices' && styles.tabPillTextActive]}>
              خریداری بلز
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'payments' && styles.tabBtnActive]}
          onPress={() => setActiveTab('payments')}
        >
          <Ionicons
            name="card-outline"
            size={18}
            color={activeTab === 'payments' ? '#52141C' : '#64748B'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'payments' && styles.tabBtnTextActive]}>
            3. Payment Vouchers History ({filteredPayments.length})
          </Text>
          <View style={[styles.tabPill, activeTab === 'payments' && styles.tabPillActive]}>
            <Text style={[styles.tabPillText, activeTab === 'payments' && styles.tabPillTextActive]}>
              ادائیگی واؤچرز
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ========================================================
          6. TAB PANELS CONTENT AREA
          ======================================================== */}
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
        {/* ----------------------------------------------------
            TAB 1: COMPLETE KHATA LEDGER TABLE
            ---------------------------------------------------- */}
        {activeTab === 'ledger' && (
          <View style={styles.tableCard}>
            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thCell, { width: 110 }]}>Date & Time</Text>
              <Text style={[styles.thCell, { width: 130 }]}>Doc / Ref #</Text>
              {selectedSupplierId === 'all' && (
                <Text style={[styles.thCell, { width: 160 }]}>Supplier (وینڈر)</Text>
              )}
              <Text style={[styles.thCell, { flex: 2, minWidth: 180 }]}>Description / Items (تفصیل)</Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'right', color: '#DC2626' }]}>
                Debit (+بل)
              </Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'right', color: '#16A34A' }]}>
                Credit (-ادائیگی)
              </Text>
              <Text style={[styles.thCell, { width: 125, textAlign: 'right', color: '#1E293B' }]}>
                Running Bal (بقایا)
              </Text>
              <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>Actions</Text>
            </View>

            {filteredLedger.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={44} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No Ledger Entries Found</Text>
                <Text style={styles.emptySubtext}>
                  No purchase bills or payments match your current filter and search query.
                </Text>
              </View>
            ) : (
              filteredLedger.map((entry, idx) => {
                const isBill = entry.type === 'bill';
                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.tableRow,
                      idx % 2 === 1 && styles.tableRowAlt,
                      isBill ? styles.tableRowBill : styles.tableRowPayment,
                    ]}
                  >
                    {/* Date */}
                    <View style={{ width: 110 }}>
                      <Text style={styles.datePrimary}>
                        {new Date(entry.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
                      </Text>
                      <Text style={styles.dateSecondary}>
                        {new Date(entry.date).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    {/* Doc Number */}
                    <View style={{ width: 130 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons
                          name={isBill ? 'receipt' : 'checkmark-circle'}
                          size={14}
                          color={isBill ? '#991B1B' : '#15803D'}
                        />
                        <Text style={[styles.docNoText, { color: isBill ? '#991B1B' : '#15803D' }]}>
                          {entry.docNumber}
                        </Text>
                      </View>
                      {entry.invoiceNo ? (
                        <Text style={styles.docSubNo}>Inv: {entry.invoiceNo}</Text>
                      ) : null}
                    </View>

                    {/* Supplier Column (if consolidated view) */}
                    {selectedSupplierId === 'all' && (
                      <View style={{ width: 160 }}>
                        <TouchableOpacity onPress={() => setSelectedSupplierId(entry.supplierId)}>
                          <Text style={styles.supplierLinkText} numberOfLines={1}>
                            {entry.supplierName}
                          </Text>
                        </TouchableOpacity>
                        {entry.category && (
                          <Text style={styles.supplierCatSub} numberOfLines={1}>
                            {entry.category}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Description */}
                    <View style={{ flex: 2, minWidth: 180 }}>
                      <Text style={styles.descTitle}>{entry.title}</Text>
                      <Text style={styles.descSub} numberOfLines={2}>
                        {entry.subtitle}
                      </Text>
                    </View>

                    {/* Debit */}
                    <View style={{ width: 110, alignItems: 'flex-end' }}>
                      {entry.debit > 0 ? (
                        <Text style={styles.debitAmount}>+Rs. {entry.debit.toLocaleString()}</Text>
                      ) : (
                        <Text style={styles.dashText}>—</Text>
                      )}
                    </View>

                    {/* Credit */}
                    <View style={{ width: 110, alignItems: 'flex-end' }}>
                      {entry.credit > 0 ? (
                        <Text style={styles.creditAmount}>-Rs. {entry.credit.toLocaleString()}</Text>
                      ) : (
                        <Text style={styles.dashText}>—</Text>
                      )}
                    </View>

                    {/* Running Balance */}
                    <View style={{ width: 125, alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.runBalAmount,
                          {
                            color:
                              entry.runningBalance > 0
                                ? '#991B1B'
                                : entry.runningBalance < 0
                                ? '#D97706'
                                : '#15803D',
                          },
                        ]}
                      >
                        {entry.runningBalance < 0
                          ? `(Rs. ${Math.abs(entry.runningBalance).toLocaleString()})`
                          : `Rs. ${entry.runningBalance.toLocaleString()}`}
                      </Text>
                      <Text style={styles.runBalLabel}>
                        {entry.runningBalance > 0
                          ? 'بقایا واجب الادا'
                          : entry.runningBalance < 0
                          ? 'پیشگی کریڈٹ (Advance)'
                          : 'Cleared ✓'}
                      </Text>
                    </View>

                    {/* Actions */}
                    <View style={{ width: 90, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                      {isBill && entry.rawPO ? (
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => setSelectedPO(entry.rawPO!)}
                          {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'View Bill' } as any) : {})}
                        >
                          <Ionicons name="eye-outline" size={16} color="#0284C7" />
                        </TouchableOpacity>
                      ) : null}

                      {!isBill && entry.rawPayment ? (
                        <>
                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => {
                              setVoucherPayment(entry.rawPayment!);
                              setIsVoucherModalOpen(true);
                            }}
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Print / View Voucher' } as any) : {})}
                          >
                            <Ionicons name="receipt-outline" size={16} color="#15803D" />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => handleDeletePayment(entry.rawPayment!)}
                            {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Revert Payment' } as any) : {})}
                          >
                            <Ionicons name="trash-outline" size={15} color="#DC2626" />
                          </TouchableOpacity>
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ----------------------------------------------------
            TAB 2: PURCHASE BILLS & INVOICES
            ---------------------------------------------------- */}
        {activeTab === 'invoices' && (
          <View style={styles.tableCard}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thCell, { width: 100 }]}>PO Number</Text>
              <Text style={[styles.thCell, { width: 110 }]}>Invoice #</Text>
              <Text style={[styles.thCell, { width: 110 }]}>Date</Text>
              <Text style={[styles.thCell, { flex: 1.5, minWidth: 150 }]}>Supplier</Text>
              <Text style={[styles.thCell, { flex: 2, minWidth: 180 }]}>Items Summary</Text>
              <Text style={[styles.thCell, { width: 100, textAlign: 'right' }]}>Total Bill</Text>
              <Text style={[styles.thCell, { width: 100, textAlign: 'right', color: '#16A34A' }]}>Paid</Text>
              <Text style={[styles.thCell, { width: 100, textAlign: 'right', color: '#DC2626' }]}>Balance Due</Text>
              <Text style={[styles.thCell, { width: 90, textAlign: 'center' }]}>Status</Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>Actions</Text>
            </View>

            {filteredPOs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="cart-outline" size={44} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No Purchase Bills Found</Text>
                <Text style={styles.emptySubtext}>Click "+ New Purchase Bill" above to record a new supplier bill.</Text>
              </View>
            ) : (
              filteredPOs.map((po, idx) => {
                const isPaid = po.paymentStatus === 'paid' || (po.balanceDue || 0) <= 0;
                return (
                  <View key={po.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.docNoText, { width: 100 }]}>{po.poNumber}</Text>
                    <Text style={[styles.tableCellText, { width: 110, color: '#475569' }]}>
                      {po.invoiceNo || 'N/A'}
                    </Text>
                    <Text style={[styles.tableCellText, { width: 110 }]}>
                      {new Date(po.orderDate || po.createdAt).toLocaleDateString('en-PK')}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 1.5, minWidth: 150, fontWeight: '700' }]}>
                      {po.supplierName}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 2, minWidth: 180, color: '#64748B' }]} numberOfLines={2}>
                      {po.items.map((i) => `${i.name} (${i.qtyReceived || i.qtyOrdered}${i.unit})`).join(', ')}
                    </Text>
                    <Text style={[styles.tableCellText, { width: 100, textAlign: 'right', fontWeight: '800' }]}>
                      Rs. {po.totalAmount.toLocaleString()}
                    </Text>
                    <Text style={[styles.tableCellText, { width: 100, textAlign: 'right', color: '#16A34A', fontWeight: '700' }]}>
                      Rs. {(po.amountPaid || 0).toLocaleString()}
                    </Text>
                    <Text style={[styles.tableCellText, { width: 100, textAlign: 'right', color: isPaid ? '#16A34A' : '#DC2626', fontWeight: '800' }]}>
                      Rs. {(po.balanceDue || 0).toLocaleString()}
                    </Text>
                    <View style={{ width: 90, alignItems: 'center' }}>
                      <View style={[styles.statusBadge, isPaid ? styles.statusBadgePaid : styles.statusBadgeDue]}>
                        <Text style={[styles.statusBadgeText, isPaid ? styles.statusBadgeTextPaid : styles.statusBadgeTextDue]}>
                          {isPaid ? 'PAID' : 'DUE'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ width: 110, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                      {!isPaid && (
                        <TouchableOpacity
                          style={styles.paySmallBtn}
                          onPress={() => openPayModalForSupplier(po.supplierId, po.id, po.balanceDue)}
                          {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Pay this invoice' } as any) : {})}
                        >
                          <Text style={styles.paySmallBtnText}>Pay</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => setSelectedPO(po)}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'View Details' } as any) : {})}
                      >
                        <Ionicons name="eye-outline" size={16} color="#0284C7" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleDeletePO(po)}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Delete Bill' } as any) : {})}
                      >
                        <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ----------------------------------------------------
            TAB 3: PAYMENT VOUCHERS HISTORY
            ---------------------------------------------------- */}
        {activeTab === 'payments' && (
          <View style={styles.tableCard}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thCell, { width: 120 }]}>Voucher #</Text>
              <Text style={[styles.thCell, { width: 120 }]}>Date & Time</Text>
              <Text style={[styles.thCell, { flex: 2, minWidth: 160 }]}>Paid To (سپلائر)</Text>
              <Text style={[styles.thCell, { width: 120, textAlign: 'right', color: '#16A34A' }]}>Amount Paid</Text>
              <Text style={[styles.thCell, { width: 110, textAlign: 'center' }]}>Method</Text>
              <Text style={[styles.thCell, { flex: 2, minWidth: 180 }]}>Bank / Cheque / Ref</Text>
              <Text style={[styles.thCell, { width: 110 }]}>Paid By</Text>
              <Text style={[styles.thCell, { width: 100, textAlign: 'center' }]}>Actions</Text>
            </View>

            {filteredPayments.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="card-outline" size={44} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No Payment Vouchers Found</Text>
                <Text style={styles.emptySubtext}>Click "Record Payment" to disburse funds to a vendor.</Text>
              </View>
            ) : (
              filteredPayments.map((pay, idx) => (
                <View key={pay.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                  <View style={{ width: 120, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="receipt" size={14} color="#15803D" />
                    <Text style={[styles.docNoText, { color: '#15803D' }]}>
                      VCH-{pay.id.slice(-6).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ width: 120 }}>
                    <Text style={styles.datePrimary}>
                      {new Date(pay.paidAt).toLocaleDateString('en-PK')}
                    </Text>
                    <Text style={styles.dateSecondary}>
                      {new Date(pay.paidAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={[styles.tableCellText, { flex: 2, minWidth: 160, fontWeight: '700' }]}>
                    {pay.supplierName}
                  </Text>
                  <Text style={[styles.tableCellText, { width: 120, textAlign: 'right', color: '#16A34A', fontWeight: '900', fontSize: 13.5 }]}>
                    Rs. {pay.amount.toLocaleString()}
                  </Text>
                  <View style={{ width: 110, alignItems: 'center' }}>
                    <View style={styles.methodBadge}>
                      <Text style={styles.methodBadgeText}>{pay.method.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={[styles.tableCellText, { flex: 2, minWidth: 180, color: '#64748B' }]} numberOfLines={2}>
                    {[pay.bankName, pay.reference ? `Ref: ${pay.reference}` : null, pay.notes].filter(Boolean).join(' • ') || 'Direct Settlement'}
                  </Text>
                  <Text style={[styles.tableCellText, { width: 110, color: '#475569' }]}>
                    {pay.paidBy || 'Admin'}
                  </Text>
                  <View style={{ width: 100, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => {
                        setVoucherPayment(pay);
                        setIsVoucherModalOpen(true);
                      }}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Thermal Voucher' } as any) : {})}
                    >
                      <Ionicons name="print-outline" size={16} color="#15803D" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleDeletePayment(pay)}
                      {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Revert Voucher' } as any) : {})}
                    >
                      <Ionicons name="trash-outline" size={15} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ========================================================
          7. MODAL: RECORD SUPPLIER PAYMENT
          ======================================================== */}
      <Modal visible={isPayModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="cash" size={22} color="#15803D" />
                <Text style={styles.modalTitle}>Record Vendor Payment (ادائیگی واؤچر)</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPayModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {/* Select Supplier */}
              <RoyalDropdown
                label="Select Supplier / Vendor"
                required
                options={suppliers.map((s) => ({
                  label: s.name,
                  value: s.id,
                  badge: `Due: Rs. ${(s.currentBalance || 0).toLocaleString()}`,
                  sublabel: `${s.contactPerson || ''} (${s.phone})`,
                  icon: CATEGORY_THEMES[s.category]?.icon || 'business-outline',
                }))}
                value={payTargetSupplierId}
                onSelect={(val) => setPayTargetSupplierId(val)}
                searchable
                style={{ marginBottom: 12 }}
              />

              {/* Amount with quick helpers */}
              <Text style={styles.formLabel}>Payment Amount (ادائیگی رقم - Rs.) *</Text>
              <TextInput
                style={styles.formInputLarge}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={payAmount}
                onChangeText={setPayAmount}
              />

              {/* Quick Helper Pills */}
              {(() => {
                const targetSup = suppliers.find((s) => s.id === payTargetSupplierId);
                const due = targetSup?.currentBalance || 0;
                return (
                  <View style={styles.quickAmountRow}>
                    {due > 0 && (
                      <TouchableOpacity
                        style={styles.quickAmountPill}
                        onPress={() => setPayAmount(due.toString())}
                      >
                        <Text style={styles.quickAmountText}>Full Due: Rs. {due.toLocaleString()}</Text>
                      </TouchableOpacity>
                    )}
                    {due > 1000 && (
                      <TouchableOpacity
                        style={styles.quickAmountPill}
                        onPress={() => setPayAmount(Math.round(due / 2).toString())}
                      >
                        <Text style={styles.quickAmountText}>50% Due: Rs. {Math.round(due / 2).toLocaleString()}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.quickAmountPill}
                      onPress={() => setPayAmount('10000')}
                    >
                      <Text style={styles.quickAmountText}>Rs. 10,000</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickAmountPill}
                      onPress={() => setPayAmount('50000')}
                    >
                      <Text style={styles.quickAmountText}>Rs. 50,000</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* Payment Method Selector */}
              <Text style={styles.formLabel}>Payment Mode (ادائیگی طریقہ کار) *</Text>
              <View style={styles.methodSelectorRow}>
                {(['cash', 'online', 'cheque'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodOptionPill, payMethod === m && styles.methodOptionPillActive]}
                    onPress={() => setPayMethod(m)}
                  >
                    <Ionicons
                      name={m === 'cash' ? 'cash-outline' : m === 'online' ? 'globe-outline' : 'document-outline'}
                      size={16}
                      color={payMethod === m ? '#FFFFFF' : '#475569'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.methodOptionText, payMethod === m && styles.methodOptionTextActive]}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Bank & Ref Details */}
              {payMethod !== 'cash' && (
                <View style={{ flexDirection: 'row', gap: 10, marginVertical: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Bank Name</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. Meezan Bank / HBL"
                      placeholderTextColor="#94A3B8"
                      value={payBankName}
                      onChangeText={setPayBankName}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Ref / Cheque #</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g. TXN-998821 / CHQ-102"
                      placeholderTextColor="#94A3B8"
                      value={payReference}
                      onChangeText={setPayReference}
                    />
                  </View>
                </View>
              )}

              {/* Notes */}
              <Text style={styles.formLabel}>Remarks / Khata Notes</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Optional notes or reference..."
                placeholderTextColor="#94A3B8"
                value={payNotes}
                onChangeText={setPayNotes}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsPayModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleConfirmPayment}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>Save Payment & Print</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          8. MODAL: NEW PURCHASE ORDER / PROCUREMENT BILL
          ======================================================== */}
      <Modal visible={isNewBillModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardWide, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="document-text" size={22} color="#52141C" />
                <Text style={styles.modalTitle}>Record Purchase Bill (خریداری بل)</Text>
              </View>
              <TouchableOpacity onPress={() => setIsNewBillModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              {/* Select Supplier */}
              <RoyalDropdown
                label="Vendor / Supplier *"
                required
                options={suppliers.map((s) => ({
                  label: s.name,
                  value: s.id,
                  sublabel: `${s.category} • ${s.city || 'Lahore'}`,
                  icon: CATEGORY_THEMES[s.category]?.icon || 'business-outline',
                }))}
                value={billSupplierId}
                onSelect={(val) => setBillSupplierId(val)}
                searchable
                style={{ marginBottom: 10 }}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Supplier Invoice / Slip #</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. INV-9021"
                    placeholderTextColor="#94A3B8"
                    value={billInvoiceNo}
                    onChangeText={setBillInvoiceNo}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Freight / Carriage (Rs.)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={billFreight}
                    onChangeText={setBillFreight}
                  />
                </View>
              </View>

              {/* Items Table Builder */}
              <View style={styles.itemsHeaderRow}>
                <Text style={styles.itemsHeaderTitle}>Procured Raw Materials (خرید کردہ اشیاء) *</Text>
                <TouchableOpacity onPress={handleAddBillItem} style={styles.addItemBtn}>
                  <Ionicons name="add-circle" size={16} color="#52141C" />
                  <Text style={styles.addItemBtnText}>+ Add Item</Text>
                </TouchableOpacity>
              </View>

              {billItems.map((item, idx) => (
                <View key={idx} style={styles.itemBuilderCard}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <TextInput
                      style={[styles.formInput, { flex: 2 }]}
                      placeholder="Item name (e.g. Boneless Chicken)"
                      placeholderTextColor="#94A3B8"
                      value={item.name}
                      onChangeText={(val) => handleUpdateBillItem(idx, { name: val })}
                    />
                    <TextInput
                      style={[styles.formInput, { width: 70, textAlign: 'center' }]}
                      placeholder="Unit"
                      placeholderTextColor="#94A3B8"
                      value={item.unit}
                      onChangeText={(val) => handleUpdateBillItem(idx, { unit: val })}
                    />
                    {billItems.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveBillItem(idx)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.smallLabel}>Quantity</Text>
                      <TextInput
                        style={styles.formInput}
                        keyboardType="numeric"
                        placeholder="Qty"
                        placeholderTextColor="#94A3B8"
                        value={item.qtyReceived ? item.qtyReceived.toString() : ''}
                        onChangeText={(val) => handleUpdateBillItem(idx, { qtyReceived: parseFloat(val) || 0, qtyOrdered: parseFloat(val) || 0 })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.smallLabel}>Unit Rate (Rs.)</Text>
                      <TextInput
                        style={styles.formInput}
                        keyboardType="numeric"
                        placeholder="Cost"
                        placeholderTextColor="#94A3B8"
                        value={item.unitCost ? item.unitCost.toString() : ''}
                        onChangeText={(val) => handleUpdateBillItem(idx, { unitCost: parseFloat(val) || 0 })}
                      />
                    </View>
                    <View style={{ flex: 1.2, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Text style={styles.smallLabel}>Total Cost</Text>
                      <Text style={styles.itemTotalCostText}>Rs. {(item.totalCost || 0).toLocaleString()}</Text>
                    </View>
                  </View>
                </View>
              ))}

              {/* Bill Totals Summary */}
              <View style={styles.billSummaryBox}>
                <View style={styles.billSummaryRow}>
                  <Text style={styles.billSummaryLabel}>Subtotal:</Text>
                  <Text style={styles.billSummaryVal}>Rs. {billCalculations.subtotal.toLocaleString()}</Text>
                </View>
                <View style={styles.billSummaryRow}>
                  <Text style={styles.billSummaryLabel}>Freight & Carriage:</Text>
                  <Text style={styles.billSummaryVal}>Rs. {billCalculations.freight.toLocaleString()}</Text>
                </View>
                <View style={[styles.billSummaryRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 6, marginTop: 4 }]}>
                  <Text style={[styles.billSummaryLabel, { fontWeight: '900', color: '#0F172A', fontSize: 14 }]}>
                    Net Total Bill Amount:
                  </Text>
                  <Text style={[styles.billSummaryVal, { fontWeight: '900', color: '#52141C', fontSize: 16 }]}>
                    Rs. {billCalculations.totalAmount.toLocaleString()}
                  </Text>
                </View>

                {/* Amount Paid Now */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Cash / Online Paid Now</Text>
                    <TextInput
                      style={styles.formInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#94A3B8"
                      value={billAmountPaid}
                      onChangeText={setBillAmountPaid}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Remaining Added to Khata</Text>
                    <View style={[styles.formInput, { justifyContent: 'center', backgroundColor: '#FEE2E2' }]}>
                      <Text style={{ fontWeight: '800', color: '#991B1B' }}>
                        Rs. {billCalculations.balanceDue.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsNewBillModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSavePurchaseBill}>
                <Text style={styles.saveBtnText}>Save Bill to Khata</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          9. MODAL: THERMAL PAYMENT VOUCHER PREVIEW
          ======================================================== */}
      <Modal visible={isVoucherModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.voucherModalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={24} color="#15803D" />
                <Text style={styles.modalTitle}>Official Payment Voucher (رسید واؤچر)</Text>
              </View>
              <TouchableOpacity onPress={() => setIsVoucherModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {voucherPayment && (
              <View style={styles.thermalReceiptBox}>
                <Text style={styles.receiptLogo}>SULTAN RESTAURANT & BAR B Q</Text>
                <Text style={styles.receiptSub}>Official Vendor Payment Voucher • رسید برائے ادائیگی</Text>
                <Text style={styles.receiptDivider}>------------------------------------------------</Text>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Voucher #:</Text>
                  <Text style={styles.receiptVal}>VCH-{voucherPayment.id.slice(-6).toUpperCase()}</Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Date & Time:</Text>
                  <Text style={styles.receiptVal}>
                    {new Date(voucherPayment.paidAt).toLocaleDateString('en-PK')} {new Date(voucherPayment.paidAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Paid To (Vendor):</Text>
                  <Text style={[styles.receiptVal, { fontWeight: '900', color: '#0F172A' }]}>
                    {voucherPayment.supplierName}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Payment Mode:</Text>
                  <Text style={[styles.receiptVal, { textTransform: 'uppercase' }]}>{voucherPayment.method}</Text>
                </View>

                {voucherPayment.bankName && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Bank Name:</Text>
                    <Text style={styles.receiptVal}>{voucherPayment.bankName}</Text>
                  </View>
                )}

                {voucherPayment.reference && (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Ref / Cheque #:</Text>
                    <Text style={styles.receiptVal}>{voucherPayment.reference}</Text>
                  </View>
                )}

                <Text style={styles.receiptDivider}>================================================</Text>

                <View style={[styles.receiptRow, { marginVertical: 6 }]}>
                  <Text style={[styles.receiptLabel, { fontSize: 15, fontWeight: '900', color: '#0F172A' }]}>
                    AMOUNT PAID:
                  </Text>
                  <Text style={[styles.receiptVal, { fontSize: 20, fontWeight: '900', color: '#15803D' }]}>
                    Rs. {(voucherPayment.amount || 0).toLocaleString()}
                  </Text>
                </View>

                <Text style={styles.receiptDivider}>================================================</Text>

                <Text style={styles.receiptFooter}>
                  Authorized Accounts Officer • Sultan Bar B Q Management System
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
                <Text style={styles.modalShareWhatsAppBtnText}>Share WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={() => setIsVoucherModalOpen(false)}>
                <Text style={styles.saveBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================
          10. MODAL: PO BILL DETAILS PREVIEW
          ======================================================== */}
      <Modal visible={!!selectedPO} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Purchase Bill: {selectedPO?.poNumber}</Text>
                <Text style={styles.modalSubtitle}>Supplier: {selectedPO?.supplierName}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedPO(null)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedPO && (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <View style={styles.poDetailHeader}>
                  <Text style={styles.poDetailMeta}>
                    Date: {new Date(selectedPO.orderDate || selectedPO.createdAt).toLocaleDateString('en-PK')}
                  </Text>
                  {selectedPO.invoiceNo && (
                    <Text style={styles.poDetailMeta}>Vendor Invoice #: {selectedPO.invoiceNo}</Text>
                  )}
                  <View style={[styles.statusBadge, (selectedPO.balanceDue || 0) <= 0 ? styles.statusBadgePaid : styles.statusBadgeDue]}>
                    <Text style={[styles.statusBadgeText, (selectedPO.balanceDue || 0) <= 0 ? styles.statusBadgeTextPaid : styles.statusBadgeTextDue]}>
                      {(selectedPO.balanceDue || 0) <= 0 ? 'FULLY PAID' : 'PENDING BALANCE'}
                    </Text>
                  </View>
                </View>

                {/* Items List */}
                <Text style={[styles.formLabel, { marginTop: 10 }]}>Procured Items (خرید کردہ سامان):</Text>
                {selectedPO.items.map((i, idx) => (
                  <View key={idx} style={styles.poItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.poItemName}>{i.name}</Text>
                      <Text style={styles.poItemSub}>
                        {i.qtyReceived || i.qtyOrdered} {i.unit} × Rs. {i.unitCost.toLocaleString()}
                      </Text>
                    </View>
                    <Text style={styles.poItemTotal}>Rs. {(i.totalCost || 0).toLocaleString()}</Text>
                  </View>
                ))}

                {/* Financial Summary */}
                <View style={styles.poFinancials}>
                  <View style={styles.poFinRow}>
                    <Text style={styles.poFinLabel}>Subtotal:</Text>
                    <Text style={styles.poFinVal}>Rs. {selectedPO.subtotal.toLocaleString()}</Text>
                  </View>
                  {selectedPO.freight > 0 && (
                    <View style={styles.poFinRow}>
                      <Text style={styles.poFinLabel}>Freight:</Text>
                      <Text style={styles.poFinVal}>Rs. {selectedPO.freight.toLocaleString()}</Text>
                    </View>
                  )}
                  <View style={[styles.poFinRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 6 }]}>
                    <Text style={[styles.poFinLabel, { fontWeight: '800', color: '#0F172A' }]}>Total Bill Amount:</Text>
                    <Text style={[styles.poFinVal, { fontWeight: '900', color: '#52141C' }]}>
                      Rs. {selectedPO.totalAmount.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.poFinRow}>
                    <Text style={[styles.poFinLabel, { color: '#16A34A' }]}>Amount Paid:</Text>
                    <Text style={[styles.poFinVal, { color: '#16A34A', fontWeight: '700' }]}>
                      Rs. {(selectedPO.amountPaid || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.poFinRow}>
                    <Text style={[styles.poFinLabel, { color: '#DC2626', fontWeight: '800' }]}>Balance Due:</Text>
                    <Text style={[styles.poFinVal, { color: '#DC2626', fontWeight: '900' }]}>
                      Rs. {(selectedPO.balanceDue || 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              {selectedPO && (selectedPO.balanceDue || 0) > 0 && (
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#15803D' }]}
                  onPress={() => {
                    const po = selectedPO;
                    setSelectedPO(null);
                    openPayModalForSupplier(po.supplierId, po.id, po.balanceDue);
                  }}
                >
                  <Ionicons name="cash" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Pay This Bill Now</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedPO(null)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(180, 130, 20, 0.35)',
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  khataBadge: {
    backgroundColor: '#B48214',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  khataBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  syncStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncStatusText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  headerPriBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBBF24',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  headerPriBtnText: {
    color: '#52141C',
    fontSize: 12.5,
    fontWeight: '800',
  },
  headerSecBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  headerSecBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // KPI Strip
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiCardPrimary: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  kpiIconWrapRed: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconWrapBlue: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconWrapGreen: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconWrapAmber: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },

  // Filter Bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  selectorWrap: {
    flex: 1.4,
    minWidth: 260,
  },
  dropdownTriggerCustom: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    minHeight: 40,
    paddingVertical: 8,
  },
  searchWrap: {
    flex: 1.5,
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
  },
  datePillsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
  },
  datePillActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  datePillTextActive: {
    color: '#FFFFFF',
  },

  // Dossier Banner
  supplierDossierBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 12,
  },
  dossierLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 280,
  },
  dossierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dossierTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  termsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  termsBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  dossierContactRow: {
    marginTop: 4,
    gap: 2,
  },
  dossierContactText: {
    fontSize: 11.5,
    color: '#475569',
  },
  dossierBankText: {
    fontSize: 11.5,
    color: '#0284C7',
    fontWeight: '600',
  },
  dossierRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dossierPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dossierPayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  dossierClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  dossierClearBtnText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    overflow: 'scroll',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabBtnActive: {
    borderBottomColor: '#52141C',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#52141C',
    fontWeight: '900',
  },
  tabPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  tabPillActive: {
    backgroundColor: '#FEF3C7',
  },
  tabPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  tabPillTextActive: {
    color: '#92400E',
  },

  // Content Area
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
  },
  thCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#FAFAFA',
  },
  tableRowBill: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#DC2626',
  },
  tableRowPayment: {
    borderLeftWidth: 3.5,
    borderLeftColor: '#16A34A',
  },
  tableCellText: {
    fontSize: 12,
    color: '#1E293B',
  },
  datePrimary: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  dateSecondary: {
    fontSize: 10.5,
    color: '#64748B',
  },
  docNoText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  docSubNo: {
    fontSize: 10.5,
    color: '#64748B',
  },
  supplierLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52141C',
  },
  supplierCatSub: {
    fontSize: 10,
    color: '#64748B',
  },
  descTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  descSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  debitAmount: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  creditAmount: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#16A34A',
  },
  dashText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  runBalAmount: {
    fontSize: 13,
    fontWeight: '900',
  },
  runBalLabel: {
    fontSize: 9.5,
    color: '#64748B',
  },
  actionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paySmallBtn: {
    backgroundColor: '#15803D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  paySmallBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgePaid: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeDue: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadgeTextPaid: {
    color: '#166534',
  },
  statusBadgeTextDue: {
    color: '#991B1B',
  },
  methodBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 45,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    marginTop: 10,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 360,
  },

  // Modals General
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 520,
  },
  modalCardWide: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 680,
  },
  modalCardMobile: {
    maxWidth: '100%',
  },
  voucherModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 460,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  formLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  smallLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
    color: '#0F172A',
  },
  formInputLarge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#15803D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '800',
    color: '#15803D',
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  quickAmountPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAmountText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  methodSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  methodOptionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 8,
  },
  methodOptionPillActive: {
    backgroundColor: '#52141C',
    borderColor: '#52141C',
  },
  methodOptionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  methodOptionTextActive: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 12.5,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#52141C',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  modalShareWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalShareWhatsAppBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },

  // PO Builder
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  itemsHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addItemBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#52141C',
  },
  itemBuilderCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  itemTotalCostText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  billSummaryBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  billSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  billSummaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  billSummaryVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Thermal Receipt
  thermalReceiptBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 14,
    marginVertical: 4,
  },
  receiptLogo: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  receiptSub: {
    fontSize: 10.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  receiptDivider: {
    color: '#94A3B8',
    textAlign: 'center',
    marginVertical: 4,
    fontSize: 11,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  receiptLabel: {
    fontSize: 11.5,
    color: '#475569',
  },
  receiptVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptFooter: {
    fontSize: 9.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },

  // PO Detail Modal
  poDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  poDetailMeta: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  poItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  poItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  poItemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  poItemTotal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  poFinancials: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  poFinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  poFinLabel: {
    fontSize: 11.5,
    color: '#64748B',
  },
  poFinVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
});

