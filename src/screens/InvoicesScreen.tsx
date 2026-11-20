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
  Share,
  useWindowDimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore, Invoice } from '../store/restaurantStore';
import { broadcastImmediately } from '../services/syncService';
import SultanLogo from '../components/SultanLogo';
import { printInvoiceReceipt } from '../components/Invoice';
import { useAuthStore } from '../store/authStore';
import { useRolePermissions } from '../store/roleStore';
import { useSettingsStore } from '../store/settingsStore';
import PermissionDeniedScreen from '../components/PermissionDeniedScreen';
import RoyalDropdown from '../components/RoyalDropdown';
import PaginationControl from '../components/PaginationControl';
import { usePagination } from '../hooks/usePagination';

interface InvoicesScreenProps {
  userRole: 'admin' | 'manager';
  targetRoleOverride?: string;
  backRoute?: string;
}

export default function InvoicesScreen({ userRole, targetRoleOverride, backRoute = '/admin/dashboard' }: InvoicesScreenProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 850;
  const isSmallMobile = width < 480;

  const user = useAuthStore((s) => s.user);
  const isActualAdmin = user?.role === 'admin' || userRole === 'admin';
  const effectiveRoleTarget = isActualAdmin ? undefined : (targetRoleOverride || (userRole === 'manager' ? 'manager' : undefined));
  const { can, canViewRevenue, canVoidInvoice, canProcessReturns, canExportReports } = useRolePermissions(effectiveRoleTarget);

  const kpiCardResponsiveStyle = useMemo<ViewStyle>(() => {
    if (width < 380) {
      return { width: '100%', minWidth: '100%' };
    }
    if (width < 768) {
      return { width: '47%', minWidth: 140 };
    }
    if (width < 1024) {
      return { width: '48%', minWidth: 180 };
    }
    return { flex: 1, minWidth: 200 };
  }, [width]);

  const metaColResponsiveStyle = useMemo<ViewStyle>(() => {
    if (isSmallMobile) {
      return { width: '100%' };
    }
    if (isMobile) {
      return { width: '47%' };
    }
    return { minWidth: 140 };
  }, [isSmallMobile, isMobile]);

  const systemSettings = useSettingsStore((state) => state.settings);
  const rawInvoices = useRestaurantStore((state) => state.invoices);
  const invoices = useMemo(() => rawInvoices || [], [rawInvoices]);
  const staff = useRestaurantStore((state) => state.staff) || [];
  const voidInvoice = useRestaurantStore((state) => state.voidInvoice);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'dine-in' | 'takeaway' | 'delivery'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'online'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'settled' | 'voided' | 'refunded'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest');

  // Selected Invoice for Details Modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailsTab, setDetailsTab] = useState<'breakdown' | 'thermal'>('breakdown');

  // Void Reason Modal
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [customVoidReason, setCustomVoidReason] = useState('');
  const [voidPinInput, setVoidPinInput] = useState('');
  const [voidPinError, setVoidPinError] = useState('');

  // Date Boundaries
  const dateRanges = useMemo(() => {
    const now = new Date();
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const endOfYesterday = startOfToday - 1;
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = startOfToday - 29 * 24 * 60 * 60 * 1000;

    return {
      today: startOfToday,
      yesterdayStart: startOfYesterday,
      yesterdayEnd: endOfYesterday,
      week: startOfWeek,
      month: startOfMonth,
    };
  }, []);

  // Filtered & Sorted Invoices
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    // Date Filter
    if (dateFilter === 'today') {
      result = result.filter((inv) => (inv.timeSettled || inv.timePlaced) >= dateRanges.today);
    } else if (dateFilter === 'yesterday') {
      result = result.filter((inv) => {
        const t = inv.timeSettled || inv.timePlaced;
        return t >= dateRanges.yesterdayStart && t <= dateRanges.yesterdayEnd;
      });
    } else if (dateFilter === 'week') {
      result = result.filter((inv) => (inv.timeSettled || inv.timePlaced) >= dateRanges.week);
    } else if (dateFilter === 'month') {
      result = result.filter((inv) => (inv.timeSettled || inv.timePlaced) >= dateRanges.month);
    }

    // Order Type Filter
    if (orderTypeFilter !== 'all') {
      result = result.filter((inv) => inv.orderType === orderTypeFilter);
    }

    // Payment Filter
    if (paymentFilter !== 'all') {
      result = result.filter((inv) =>
        inv.payments?.some((p) => p.type?.toLowerCase() === paymentFilter)
      );
    }

    // Status Filter
    if (statusFilter === 'settled') {
      result = result.filter((inv) => inv.status !== 'voided' && inv.status !== 'refunded');
    } else if (statusFilter === 'voided') {
      result = result.filter((inv) => inv.status === 'voided');
    } else if (statusFilter === 'refunded') {
      result = result.filter((inv) => inv.status === 'refunded' || inv.returnStatus === 'full' || inv.returnStatus === 'partial');
    }

    // Search Query (Invoice ID, Table, Server, Customer Name/Phone, or Items)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((inv) => {
        const idMatch = inv.id?.toLowerCase().includes(q);
        const tableMatch = inv.tableName?.toLowerCase().includes(q);
        const serverMatch = inv.server?.toLowerCase().includes(q);
        const customerMatch =
          inv.customer?.name?.toLowerCase().includes(q) ||
          inv.customer?.phone?.includes(q);
        const itemMatch = inv.items?.some((it) => it.name?.toLowerCase().includes(q));

        return idMatch || tableMatch || serverMatch || customerMatch || itemMatch;
      });
    }

    // Sorting
    result.sort((a, b) => {
      const timeA = a.timeSettled || a.timePlaced || 0;
      const timeB = b.timeSettled || b.timePlaced || 0;
      if (sortBy === 'newest') return timeB - timeA;
      if (sortBy === 'oldest') return timeA - timeB;
      if (sortBy === 'amount_high') return (b.total || 0) - (a.total || 0);
      if (sortBy === 'amount_low') return (a.total || 0) - (b.total || 0);
      return 0;
    });

    return result;
  }, [invoices, dateFilter, orderTypeFilter, paymentFilter, statusFilter, searchQuery, sortBy, dateRanges]);

  // Pagination for Invoices List
  const invoicePagination = usePagination({
    data: filteredInvoices,
    initialPageSize: 10,
  });

  // Financial KPI Metrics
  const metrics = useMemo(() => {
    const validInvoices = filteredInvoices.filter((inv) => inv.status !== 'voided');
    const voidedInvoices = filteredInvoices.filter((inv) => inv.status === 'voided');

    const totalSales = validInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalTax = validInvoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);
    const totalDiscount = validInvoices.reduce((sum, inv) => sum + (inv.discount || 0), 0);
    const aov = validInvoices.length > 0 ? Math.round(totalSales / validInvoices.length) : 0;

    let cashTotal = 0;
    let digitalTotal = 0;

    validInvoices.forEach((inv) => {
      inv.payments?.forEach((p) => {
        if (p.type === 'cash') cashTotal += p.amount || 0;
        else digitalTotal += p.amount || 0;
      });
    });

    return {
      count: validInvoices.length,
      voidedCount: voidedInvoices.length,
      totalSales,
      totalTax,
      totalDiscount,
      aov,
      cashTotal,
      digitalTotal,
    };
  }, [filteredInvoices]);

  // Format Date and Time
  const formatDateTime = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Void Action Trigger
  const handleOpenVoidModal = (invoice: Invoice) => {
    setInvoiceToVoid(invoice);
    setVoidReason('Wrong order punched');
    setCustomVoidReason('');
    setVoidPinInput('');
    setVoidPinError('');
    setVoidModalVisible(true);
  };

  const handleConfirmVoid = () => {
    if (!invoiceToVoid) return;
    if (systemSettings.requirePinForVoid) {
      const enteredPin = voidPinInput.trim();
      if (!enteredPin) {
        setVoidPinError('Admin / Manager PIN is required to void an invoice.');
        return;
      }
      const currentStaff = staff.find(
        (s) =>
          (user?.staffId && s.id === user.staffId) ||
          (user?.name && s.name.trim().toLowerCase() === user.name.trim().toLowerCase())
      );
      const adminOrManagerWithPin = staff.filter(
        (s) =>
          (s.role?.toLowerCase() === 'admin' || s.role?.toLowerCase() === 'manager') &&
          Boolean(s.pin?.trim())
      );
      const isValidPin =
        Boolean(currentStaff?.pin && currentStaff.pin.trim() === enteredPin) ||
        adminOrManagerWithPin.some((s) => s.pin!.trim() === enteredPin) ||
        (adminOrManagerWithPin.length === 0 && enteredPin === '1234');
      if (!isValidPin) {
        setVoidPinError('Invalid Admin or Manager PIN.');
        return;
      }
    }
    const finalReason = voidReason === 'Other' ? (customVoidReason || 'Voided by authorized manager') : voidReason;

    voidInvoice(invoiceToVoid.id, finalReason, userRole === 'admin' ? 'Admin' : 'Manager');
    broadcastImmediately();

    setVoidModalVisible(false);
    if (selectedInvoice && selectedInvoice.id === invoiceToVoid.id) {
      setSelectedInvoice({
        ...selectedInvoice,
        status: 'voided',
        voidReason: finalReason,
        voidedAt: Date.now(),
        voidedBy: userRole === 'admin' ? 'Admin' : 'Manager',
      });
    }
    setInvoiceToVoid(null);

    if (Platform.OS === 'web') {
      window.alert(`Invoice ${invoiceToVoid.id} has been marked as VOID.`);
    } else {
      Alert.alert('Invoice Voided', `Invoice ${invoiceToVoid.id} has been marked as VOID.`);
    }
  };

  // Plain Text Thermal Slip Generator (Used for Share, WhatsApp & Mobile Print)
  const generateReceiptText = (inv: Invoice) => {
    const pad = (str: string, length: number) => (str + ' '.repeat(length)).slice(0, length);
    const padRight = (str: string, length: number) => (' '.repeat(length) + str).slice(-length);

    let text = '';
    text += '================================\n';
    text += '       SULTAN RESTAURANT        \n';
    text += '   Luxury Dining & Culinary Art \n';
    text += '     Food Street, Lahore, PK    \n';
    text += '       Phone: 0300-1234567      \n';
    text += '================================\n';
    text += `Invoice #: ${inv.id}\n`;
    text += `Date: ${formatDateTime(inv.timeSettled || inv.timePlaced)}\n`;
    text += `Order Type: ${inv.orderType.toUpperCase()}\n`;
    if (inv.tableName) text += `Table: ${inv.tableName}\n`;
    
    const orderCreator = inv.orderTakenBy || (inv.server && !inv.server.toLowerCase().includes('pos') ? inv.server : 'Staff');
    const cashierName = inv.cashier || (inv.server?.toLowerCase().includes('pos') ? inv.server : 'Manager');
    if (orderCreator === cashierName) {
      text += `Staff / Cashier: ${cashierName}\n`;
    } else {
      text += `Order Taken By: ${orderCreator}\n`;
      text += `Billed By (Cashier): ${cashierName}\n`;
    }
    
    if (inv.customer) {
      text += `Customer: ${inv.customer.name} (${inv.customer.phone})\n`;
      if (inv.customer.address) text += `Address: ${inv.customer.address}\n`;
    }
    if (inv.status === 'voided') {
      text += '*** STATUS: VOIDED / CANCELLED ***\n';
      if (inv.voidReason) text += `Reason: ${inv.voidReason}\n`;
    }
    text += '--------------------------------\n';
    text += 'Qty  Item                 Amount\n';
    text += '--------------------------------\n';
    inv.items?.forEach((item) => {
      const name = item.name.length > 18 ? item.name.substring(0, 16) + '..' : item.name;
      const qtyStr = pad(`${item.qty}x`, 4);
      const nameStr = pad(name, 19);
      const amtStr = padRight(`Rs. ${(item.price * item.qty).toLocaleString()}`, 9);
      text += `${qtyStr}${nameStr}${amtStr}\n`;
    });
    text += '--------------------------------\n';
    text += `${pad('Subtotal:', 20)}${padRight(`Rs. ${(inv.subTotal || 0).toLocaleString()}`, 12)}\n`;
    if ((inv.discount || 0) > 0) {
      text += `${pad('Discount:', 20)}${padRight(`- Rs. ${(inv.discount || 0).toLocaleString()}`, 12)}\n`;
    }
    text += `${pad('GST Tax (16%):', 20)}${padRight(`Rs. ${(inv.tax || 0).toLocaleString()}`, 12)}\n`;
    text += '================================\n';
    text += `${pad('NET TOTAL:', 20)}${padRight(`Rs. ${(inv.total || 0).toLocaleString()}`, 12)}\n`;
    text += '================================\n';
    if (inv.payments && inv.payments.length > 0) {
      text += 'Payment Details:\n';
      inv.payments.forEach((p) => {
        text += `  • ${p.type.toUpperCase()}: Rs. ${(p.amount || 0).toLocaleString()}\n`;
      });
    }
    text += '--------------------------------\n';
    text += ' Thank you for dining at Sultan!\n';
    text += '   Please visit us again soon!  \n';
    text += '================================\n';
    return text;
  };

  // Print or Share Receipt
  const handlePrintOrShare = async (inv: Invoice) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      setSelectedInvoice(inv);
      printInvoiceReceipt(inv);
    } else {
      const receiptText = generateReceiptText(inv);
      try {
        await Share.share({
          message: receiptText,
          title: `Invoice #${inv.id} - Sultan Restaurant`,
        });
      } catch {
        Alert.alert('Invoice', receiptText);
      }
    }
  };

  // Export Filtered Invoices to CSV
  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      const msg = 'No invoices found matching current filter criteria.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Export Notice', msg);
      return;
    }

    const headers = 'Invoice ID,Date,Status,Order Type,Table,Server,Customer Name,Customer Phone,Items Summary,Subtotal,Discount,Tax,Total,Payments\n';
    const rows = filteredInvoices
      .map((inv) => {
        const itemsStr = (inv.items || []).map((it) => `${it.qty}x ${it.name}`).join(' | ');
        const paymentsStr = (inv.payments || []).map((p) => `${p.type}: Rs.${p.amount}`).join('; ');
        const dateStr = formatDateTime(inv.timeSettled || inv.timePlaced);
        return `"${inv.id}","${dateStr}","${inv.status || 'settled'}","${inv.orderType}","${inv.tableName || 'N/A'}","${inv.server || 'N/A'}","${inv.customer?.name || 'Walk-in'}","${inv.customer?.phone || 'N/A'}","${itemsStr}","${inv.subTotal || 0}","${inv.discount || 0}","${inv.tax || 0}","${inv.total || 0}","${paymentsStr}"`;
      })
      .join('\n');

    const csvContent = headers + rows;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `sultan_invoices_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Share.share({
        message: csvContent,
        title: `Sultan_Invoices_Export_${Date.now()}.csv`,
      });
    }
  };

  if (!isActualAdmin && !can('canAccessInvoices')) {
    return (
      <PermissionDeniedScreen
        moduleName="Invoices & Order History"
        urduModuleName="انوائسز اور آرڈر ہسٹری"
        requiredPermission="canAccessInvoices"
        backRoute={backRoute}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, isMobile && styles.headerMobile, isSmallMobile && styles.headerSmallMobile]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push(backRoute as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={[styles.headerTitle, isSmallMobile && { fontSize: 17 }]}>Order Invoices & Billing</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{userRole.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={[styles.headerSubtitle, isSmallMobile && { fontSize: 11 }]} numberOfLines={1}>
              Live order history, customer bills & audit
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {canExportReports && (
            <TouchableOpacity
              style={[styles.exportBtn, isSmallMobile && { paddingHorizontal: 10, paddingVertical: 6 }]}
              onPress={handleExportCSV}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={17} color="#4a121a" style={{ marginRight: isSmallMobile ? 3 : 6 }} />
              <Text style={styles.exportBtnText}>{isMobile ? 'Export' : 'Export CSV'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
        {/* KPI Financial Overview */}
        {/* KPI Financial Overview (Liquid Glass Info Boxes) */}
        <View style={styles.kpiContainer}>
          <View 
            style={[styles.kpiCard, styles.kpiCardEmerald, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.18)' }]}>
              <Ionicons name="cash" size={20} color="#059669" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#065F46' }, isSmallMobile && { fontSize: 10 }]}>Total Revenue</Text>
              <Text style={[styles.kpiValue, { color: '#047857' }, isSmallMobile && { fontSize: 16 }]}>
                {canViewRevenue ? `Rs. ${metrics.totalSales.toLocaleString()}` : '••••••••'}
              </Text>
              <Text style={[styles.kpiSub, { color: '#065F46' }, isSmallMobile && { fontSize: 10 }]}>From {metrics.count} settled bills</Text>
            </View>
          </View>

          <View 
            style={[styles.kpiCard, styles.kpiCardSapphire, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(2, 132, 199, 0.18)' }]}>
              <Ionicons name="receipt" size={20} color="#0284C7" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#075985' }, isSmallMobile && { fontSize: 10 }]}>Settled Invoices</Text>
              <Text style={[styles.kpiValue, { color: '#0369A1' }, isSmallMobile && { fontSize: 16 }]}>{metrics.count} Bills</Text>
              <Text style={[styles.kpiSub, { color: '#075985' }, isSmallMobile && { fontSize: 10 }]}>
                Avg: {canViewRevenue ? `Rs. ${metrics.aov.toLocaleString()}` : '••••'} / bill
              </Text>
            </View>
          </View>

          <View 
            style={[styles.kpiCard, styles.kpiCardAmber, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
              <Ionicons name="wallet" size={20} color="#D97706" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#92400E' }, isSmallMobile && { fontSize: 10 }]}>Cash vs Digital</Text>
              <Text style={[styles.kpiValue, { color: '#B45309' }, isSmallMobile && { fontSize: 16 }]}>
                {canViewRevenue ? `Rs. ${metrics.cashTotal.toLocaleString()}` : '••••••••'}
              </Text>
              <Text style={[styles.kpiSub, { color: '#92400E' }, isSmallMobile && { fontSize: 10 }]}>
                Card/Online: {canViewRevenue ? `Rs. ${metrics.digitalTotal.toLocaleString()}` : '••••••••'}
              </Text>
            </View>
          </View>

          <View 
            style={[styles.kpiCard, styles.kpiCardRuby, kpiCardResponsiveStyle]}
            {...(Platform.OS === 'web' ? { className: 'interactive-card' } : {})}
          >
            <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.18)' }]}>
              <Ionicons name="close-circle" size={20} color="#DC2626" />
            </View>
            <View>
              <Text style={[styles.kpiLabel, { color: '#991B1B' }, isSmallMobile && { fontSize: 10 }]}>Voided / Cancelled</Text>
              <Text style={[styles.kpiValue, { color: '#DC2626' }, isSmallMobile && { fontSize: 16 }]}>{metrics.voidedCount}</Text>
              <Text style={[styles.kpiSub, { color: '#991B1B' }, isSmallMobile && { fontSize: 10 }]}>Tax: Rs. {metrics.totalTax.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Search & Filter Control Bar */}
        <View style={styles.filterSection}>
          {/* Search Box */}
          <View style={[styles.searchRow, isSmallMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={[styles.searchBox, isSmallMobile && { minWidth: '100%' }]}>
              <Ionicons name="search" size={19} color="#8E8E93" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={isSmallMobile ? "Search invoices..." : "Search by Invoice ID, Table, Server, Customer, or Item..."}
                placeholderTextColor="#8E8E93"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color="#C7C7CC" />
                </TouchableOpacity>
              )}
            </View>

            {/* Sort Selector */}
            <View style={[styles.sortContainer, isSmallMobile && { alignSelf: 'flex-start' }]}>
              <Ionicons name="swap-vertical" size={16} color="#4a121a" style={{ marginRight: 4 }} />
              <TouchableOpacity
                onPress={() => {
                  if (sortBy === 'newest') setSortBy('oldest');
                  else if (sortBy === 'oldest') setSortBy('amount_high');
                  else if (sortBy === 'amount_high') setSortBy('amount_low');
                  else setSortBy('newest');
                }}
                style={styles.sortBtn}
              >
                <Text style={styles.sortBtnText}>
                  {sortBy === 'newest' && 'Newest First'}
                  {sortBy === 'oldest' && 'Oldest First'}
                  {sortBy === 'amount_high' && 'Highest Bill'}
                  {sortBy === 'amount_low' && 'Lowest Bill'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Filter Dropdowns Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1, minWidth: 140 }}>
              <RoyalDropdown
                label="Period"
                options={[
                  { label: 'All Time', value: 'all', icon: 'calendar-outline' as const },
                  { label: 'Today', value: 'today', icon: 'today-outline' as const },
                  { label: 'Yesterday', value: 'yesterday', icon: 'time-outline' as const },
                  { label: 'Past 7 Days', value: 'week', icon: 'calendar-clear-outline' as const },
                  { label: 'Past 30 Days', value: 'month', icon: 'calendar-number-outline' as const },
                ]}
                value={dateFilter}
                onSelect={(val) => setDateFilter(val as any)}
                icon="calendar-outline"
              />
            </View>

            <View style={{ flex: 1, minWidth: 140 }}>
              <RoyalDropdown
                label="Order Type"
                options={[
                  { label: 'All Orders', value: 'all' },
                  { label: '🍽️ Dine-In', value: 'dine-in' },
                  { label: '🛍️ Takeaway', value: 'takeaway' },
                  { label: '🛵 Delivery', value: 'delivery' },
                ]}
                value={orderTypeFilter}
                onSelect={(val) => setOrderTypeFilter(val as any)}
                icon="restaurant-outline"
              />
            </View>

            <View style={{ flex: 1, minWidth: 140 }}>
              <RoyalDropdown
                label="Payment Method"
                options={[
                  { label: 'All Payments', value: 'all' },
                  { label: '💵 Cash', value: 'cash' },
                  { label: '💳 Card', value: 'card' },
                  { label: '📱 Online', value: 'online' },
                ]}
                value={paymentFilter}
                onSelect={(val) => setPaymentFilter(val as any)}
                icon="wallet-outline"
              />
            </View>

            <View style={{ flex: 1, minWidth: 140 }}>
              <RoyalDropdown
                label="Invoice Status"
                options={[
                  { label: 'All Statuses', value: 'all' },
                  { label: '✅ Settled', value: 'settled' },
                  { label: '↩️ Refunded', value: 'refunded' },
                  { label: '❌ Voided', value: 'voided' },
                ]}
                value={statusFilter}
                onSelect={(val) => setStatusFilter(val as any)}
                icon="checkmark-circle-outline"
              />
            </View>
          </View>
        </View>

        {/* Results Counter */}
        <View style={styles.resultsCounterRow}>
          <Text style={styles.resultsCountText}>
            Showing <Text style={{ fontWeight: '800', color: '#1C1C1E' }}>{filteredInvoices.length}</Text> invoice(s)
          </Text>
          {(searchQuery || dateFilter !== 'all' || orderTypeFilter !== 'all' || paymentFilter !== 'all' || statusFilter !== 'all') && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setDateFilter('all');
                setOrderTypeFilter('all');
                setPaymentFilter('all');
                setStatusFilter('all');
              }}
              style={styles.clearFilterBtn}
            >
              <Ionicons name="refresh" size={14} color="#D84315" style={{ marginRight: 4 }} />
              <Text style={styles.clearFilterText}>Reset Filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Invoices List */}
        {filteredInvoices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={54} color="#C7C7CC" />
            <Text style={styles.emptyTitle}>No Invoices Found</Text>
            <Text style={styles.emptySubtitle}>
              No billing records match your current search and filters.
            </Text>
          </View>
        ) : (
          <>
            {/* Desktop Table Column Header */}
            {!isMobile && (
              <View style={styles.tableHeaderRow}>
                <View style={[styles.thCol, { flex: 2.2, minWidth: 190 }]}>
                  <Text style={styles.thText}>INVOICE & STATUS</Text>
                </View>
                <View style={[styles.thCol, { flex: 1.8, minWidth: 140 }]}>
                  <Text style={styles.thText}>DATE & TIME</Text>
                </View>
                <View style={[styles.thCol, { flex: 2.0, minWidth: 160 }]}>
                  <Text style={styles.thText}>STAFF & CASHIER</Text>
                </View>
                <View style={[styles.thCol, { flex: 2.0, minWidth: 150 }]}>
                  <Text style={styles.thText}>ITEMS</Text>
                </View>
                <View style={[styles.thCol, { flex: 1.8, minWidth: 140, alignItems: 'flex-end', paddingRight: 8 }]}>
                  <Text style={styles.thText}>TOTAL BILL</Text>
                </View>
                <View style={[styles.thCol, { flex: 2.4, minWidth: 210, alignItems: 'flex-end' }]}>
                  <Text style={styles.thText}>ACTIONS</Text>
                </View>
              </View>
            )}

            <View style={styles.invoicesList}>
              {invoicePagination.paginatedData.map((inv) => {
                const isVoided = inv.status === 'voided';
                const isRefunded = inv.status === 'refunded' || inv.returnStatus === 'full';
                const isPartialReturn = inv.returnStatus === 'partial';
                const itemsCount = inv.items?.reduce((sum, it) => sum + (it.qty || 1), 0) || 0;
                const itemsPreview = (inv.items || [])
                  .slice(0, 3)
                  .map((it) => `${it.qty}x ${it.name}`)
                  .join(', ');
                const hasMoreItems = (inv.items || []).length > 3;

                if (isMobile) {
                  return (
                    <View
                      key={inv.id}
                      style={[
                        styles.mobileInvoiceCard,
                        isVoided && styles.invoiceRowVoided,
                        isRefunded && styles.invoiceRowRefunded,
                        isPartialReturn && styles.invoiceRowPartial,
                      ]}
                    >
                      {/* Top Row: Left ID & Status; Right Total & Pay Mode */}
                      <View style={styles.mobileCardTopRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                          {isVoided ? (
                            <View style={[styles.statusBadge, styles.statusBadgeVoided]}>
                              <Ionicons name="close-circle" size={10} color="#DC2626" />
                              <Text style={[styles.statusBadgeText, styles.statusBadgeTextVoided]}>VOIDED</Text>
                            </View>
                          ) : isRefunded ? (
                            <View style={[styles.statusBadge, styles.statusBadgeRefunded]}>
                              <Ionicons name="return-down-back" size={10} color="#7C3AED" />
                              <Text style={[styles.statusBadgeText, styles.statusBadgeTextRefunded]}>REFUNDED</Text>
                            </View>
                          ) : isPartialReturn ? (
                            <View style={[styles.statusBadge, styles.statusBadgePartial]}>
                              <Ionicons name="alert-circle" size={10} color="#EA580C" />
                              <Text style={[styles.statusBadgeText, styles.statusBadgeTextPartial]}>PARTIAL</Text>
                            </View>
                          ) : (
                            <View style={[styles.statusBadge, styles.statusBadgeSettled]}>
                              <Ionicons name="checkmark-circle" size={10} color="#059669" />
                              <Text style={[styles.statusBadgeText, styles.statusBadgeTextSettled]}>PAID</Text>
                            </View>
                          )}

                          <Text style={styles.rowInvoiceIdText}>#{inv.id}</Text>

                          <View style={[styles.typeBadgeCompact, {
                            backgroundColor: inv.orderType === 'dine-in' ? '#EFF6FF' : inv.orderType === 'takeaway' ? '#FFFBEB' : '#F5F3FF',
                            borderColor: inv.orderType === 'dine-in' ? '#BFDBFE' : inv.orderType === 'takeaway' ? '#FDE68A' : '#DDD6FE',
                          }]}>
                            <Text style={[styles.typeBadgeCompactText, {
                              color: inv.orderType === 'dine-in' ? '#1E40AF' : inv.orderType === 'takeaway' ? '#B45309' : '#6D28D9',
                            }]}>
                              {inv.orderType === 'dine-in' ? (inv.tableName || 'Dine-In') : inv.orderType.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.mobileTotalText, isVoided && styles.rowTotalAmountVoided]}>
                            {canViewRevenue ? `Rs. ${(inv.total || 0).toLocaleString()}` : '••••••'}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
                            {inv.payments?.map((p, idx) => (
                              <View key={idx} style={styles.rowPayModeBadge}>
                                <Text style={styles.rowPayModeText}>{p.type?.toUpperCase()}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>

                      {/* Middle Row: Date, Items Count, Staff */}
                      <View style={styles.mobileCardMidRow}>
                        <Text style={styles.mobileMetaText}>
                          🕒 {formatDateTime(inv.timeSettled || inv.timePlaced)} • 🍽️ {itemsCount} items
                        </Text>
                        <Text style={styles.mobileMetaSubText} numberOfLines={1}>
                          Server: {inv.orderTakenBy || (inv.server && !inv.server.toLowerCase().includes('pos') ? inv.server : 'Staff')} • Cashier: {inv.cashier || (inv.server?.toLowerCase().includes('pos') ? inv.server : 'Manager')}
                          {inv.customer ? ` • 👤 ${inv.customer.name}` : ''}
                        </Text>
                      </View>

                      {/* Bottom Row: Actions */}
                      <View style={styles.mobileCardActionRow}>
                        <TouchableOpacity
                          style={styles.mobileActionBtnView}
                          onPress={() => {
                            setSelectedInvoice(inv);
                            setDetailsTab('breakdown');
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="eye" size={13} color="#52141C" />
                          <Text style={styles.actionBtnViewText}>View Details</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.mobileActionBtnReceipt}
                          onPress={() => handlePrintOrShare(inv)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="print-outline" size={13} color="#FFFFFF" />
                          <Text style={styles.actionBtnReceiptText}>Receipt</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.actionBtnReview}
                          onPress={() => router.push(`/feedback?invoiceId=${encodeURIComponent(inv.id)}` as any)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="star" size={12} color="#B45309" />
                          <Text style={styles.actionBtnReviewText}>
                            {inv.feedbackSubmitted ? 'Review' : 'QR Review'}
                          </Text>
                        </TouchableOpacity>

                        {!isVoided && !isRefunded && canProcessReturns && systemSettings.enableReturnsModule !== false && (
                          <TouchableOpacity
                            style={styles.actionBtnReturn}
                            onPress={() => {
                              const targetPath = userRole === 'admin' ? '/admin/returns' : '/manager/returns';
                              router.push(targetPath as any);
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="return-down-back-outline" size={13} color="#D84315" />
                            <Text style={styles.actionBtnReturnText}>Return</Text>
                          </TouchableOpacity>
                        )}

                        {!isVoided && canVoidInvoice && (
                          <TouchableOpacity
                            style={styles.actionBtnVoid}
                            onPress={() => handleOpenVoidModal(inv)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={13} color="#DC2626" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }

                // Desktop / Tablet Horizontal Data Strip
                return (
                  <View
                    key={inv.id}
                    style={[
                      styles.invoiceRowCard,
                      isVoided && styles.invoiceRowVoided,
                      isRefunded && styles.invoiceRowRefunded,
                      isPartialReturn && styles.invoiceRowPartial,
                    ]}
                    {...(Platform.OS === 'web' ? ({ className: 'interactive-table-row' } as any) : {})}
                  >
                    {/* 1. Invoice & Status */}
                    <View style={[styles.rowCol, { flex: 2.2, minWidth: 190 }]}>
                      <View style={styles.idAndStatusWrap}>
                        {isVoided ? (
                          <View style={[styles.statusBadge, styles.statusBadgeVoided]}>
                            <Ionicons name="close-circle" size={11} color="#DC2626" />
                            <Text style={[styles.statusBadgeText, styles.statusBadgeTextVoided]}>VOIDED</Text>
                          </View>
                        ) : isRefunded ? (
                          <View style={[styles.statusBadge, styles.statusBadgeRefunded]}>
                            <Ionicons name="return-down-back" size={11} color="#7C3AED" />
                            <Text style={[styles.statusBadgeText, styles.statusBadgeTextRefunded]}>REFUNDED</Text>
                          </View>
                        ) : isPartialReturn ? (
                          <View style={[styles.statusBadge, styles.statusBadgePartial]}>
                            <Ionicons name="alert-circle" size={11} color="#EA580C" />
                            <Text style={[styles.statusBadgeText, styles.statusBadgeTextPartial]}>PARTIAL</Text>
                          </View>
                        ) : (
                          <View style={[styles.statusBadge, styles.statusBadgeSettled]}>
                            <Ionicons name="checkmark-circle" size={11} color="#059669" />
                            <Text style={[styles.statusBadgeText, styles.statusBadgeTextSettled]}>PAID</Text>
                          </View>
                        )}

                        <Text style={styles.rowInvoiceIdText}>#{inv.id}</Text>
                      </View>

                      <View style={styles.tableChipRow}>
                        <View style={[styles.typeBadgeCompact, {
                          backgroundColor: inv.orderType === 'dine-in' ? '#EFF6FF' : inv.orderType === 'takeaway' ? '#FFFBEB' : '#F5F3FF',
                          borderColor: inv.orderType === 'dine-in' ? '#BFDBFE' : inv.orderType === 'takeaway' ? '#FDE68A' : '#DDD6FE',
                        }]}>
                          <Ionicons
                            name={inv.orderType === 'dine-in' ? 'restaurant-outline' : inv.orderType === 'takeaway' ? 'bag-handle-outline' : 'bicycle-outline'}
                            size={11}
                            color={inv.orderType === 'dine-in' ? '#2563EB' : inv.orderType === 'takeaway' ? '#D97706' : '#7C3AED'}
                          />
                          <Text style={[styles.typeBadgeCompactText, {
                            color: inv.orderType === 'dine-in' ? '#1E40AF' : inv.orderType === 'takeaway' ? '#B45309' : '#6D28D9',
                          }]}>
                            {inv.orderType === 'dine-in' ? (inv.tableName || 'Dine-In') : inv.orderType.toUpperCase()}
                          </Text>
                        </View>

                        {(inv.feedbackSubmitted || inv.feedback) && (
                          <View style={styles.reviewChipCompact}>
                            <Ionicons name="star" size={10} color="#D97706" />
                            <Text style={styles.reviewChipText}>{inv.feedback?.overallRating || 5}★</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* 2. Date & Time */}
                    <View style={[styles.rowCol, { flex: 1.8, minWidth: 140 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="calendar-outline" size={12} color="#64748B" />
                        <Text style={styles.rowDateText}>
                          {formatDateTime(inv.timeSettled || inv.timePlaced)}
                        </Text>
                      </View>
                    </View>

                    {/* 3. Staff & Customer */}
                    <View style={[styles.rowCol, { flex: 2.0, minWidth: 160 }]}>
                      <View style={{ gap: 2 }}>
                        <Text style={styles.rowStaffText} numberOfLines={1}>
                          <Text style={styles.rowStaffLabel}>Server: </Text>
                          {inv.orderTakenBy || (inv.server && !inv.server.toLowerCase().includes('pos') ? inv.server : 'Staff')}
                        </Text>
                        <Text style={styles.rowStaffText} numberOfLines={1}>
                          <Text style={styles.rowStaffLabel}>Cashier: </Text>
                          {inv.cashier || (inv.server?.toLowerCase().includes('pos') ? inv.server : 'Manager')}
                        </Text>
                        {inv.customer && (
                          <Text style={styles.rowCustomerText} numberOfLines={1}>
                            👤 {inv.customer.name} ({inv.customer.phone})
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* 4. Items */}
                    <View style={[styles.rowCol, { flex: 2.0, minWidth: 150 }]}>
                      <View style={styles.itemsSummaryBadge}>
                        <Ionicons name="fast-food-outline" size={12} color="#52141C" />
                        <Text style={styles.itemsSummaryCount}>{itemsCount} {itemsCount === 1 ? 'item' : 'items'}</Text>
                      </View>
                      <Text style={styles.itemsSummaryPreview} numberOfLines={1}>
                        {itemsPreview}{hasMoreItems ? '...' : ''}
                      </Text>
                    </View>

                    {/* 5. Total & Payment */}
                    <View style={[styles.rowCol, { flex: 1.8, minWidth: 140, alignItems: 'flex-end', paddingRight: 8 }]}>
                      <Text style={[styles.rowTotalAmount, isVoided && styles.rowTotalAmountVoided]}>
                        {canViewRevenue ? `Rs. ${(inv.total || 0).toLocaleString()}` : '••••••'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        {inv.payments?.map((p, idx) => (
                          <View key={idx} style={styles.rowPayModeBadge}>
                            <Text style={styles.rowPayModeText}>{p.type?.toUpperCase()}</Text>
                          </View>
                        ))}
                        <Text style={styles.rowTaxHint}>
                          {canViewRevenue ? `Tax: Rs. ${(inv.tax || 0).toLocaleString()}` : ''}
                        </Text>
                      </View>
                    </View>

                    {/* 6. Action Buttons */}
                    <View style={[styles.rowCol, { flex: 2.4, minWidth: 210, flexDirection: 'row', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }]}>
                      {/* View Details Button */}
                      <TouchableOpacity
                        style={styles.actionBtnView}
                        onPress={() => {
                          setSelectedInvoice(inv);
                          setDetailsTab('breakdown');
                        }}
                        activeOpacity={0.75}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'View Full Order Details & Items' } as any) : {})}
                      >
                        <Ionicons name="eye" size={14} color="#52141C" />
                        <Text style={styles.actionBtnViewText}>View</Text>
                      </TouchableOpacity>

                      {/* Receipt Button */}
                      <TouchableOpacity
                        style={styles.actionBtnReceipt}
                        onPress={() => handlePrintOrShare(inv)}
                        activeOpacity={0.75}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Print Receipt Slip' } as any) : {})}
                      >
                        <Ionicons name="print-outline" size={13} color="#FFFFFF" />
                        <Text style={styles.actionBtnReceiptText}>Receipt</Text>
                      </TouchableOpacity>

                      {/* QR Review Button */}
                      <TouchableOpacity
                        style={styles.actionBtnReview}
                        onPress={() => router.push(`/feedback?invoiceId=${encodeURIComponent(inv.id)}` as any)}
                        activeOpacity={0.75}
                        {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Customer Feedback & Review' } as any) : {})}
                      >
                        <Ionicons name="star" size={12} color="#B45309" />
                      </TouchableOpacity>

                      {/* Return Button */}
                      {!isVoided && !isRefunded && canProcessReturns && systemSettings.enableReturnsModule !== false && (
                        <TouchableOpacity
                          style={styles.actionBtnReturn}
                          onPress={() => {
                            const targetPath = userRole === 'admin' ? '/admin/returns' : '/manager/returns';
                            router.push(targetPath as any);
                          }}
                          activeOpacity={0.75}
                          {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Process Sales Return / Refund' } as any) : {})}
                        >
                          <Ionicons name="return-down-back-outline" size={13} color="#D84315" />
                        </TouchableOpacity>
                      )}

                      {/* Void Button */}
                      {!isVoided && canVoidInvoice && (
                        <TouchableOpacity
                          style={styles.actionBtnVoid}
                          onPress={() => handleOpenVoidModal(inv)}
                          activeOpacity={0.75}
                          {...(Platform.OS === 'web' ? ({ className: 'interactive-btn', title: 'Void Invoice' } as any) : {})}
                        >
                          <Ionicons name="trash-outline" size={13} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <PaginationControl
              currentPage={invoicePagination.currentPage}
              totalPages={invoicePagination.totalPages}
              totalItems={invoicePagination.totalItems}
              pageSize={invoicePagination.pageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              onPageChange={invoicePagination.goToPage}
              onPageSizeChange={invoicePagination.setPageSize}
              itemName="invoices"
            />
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* FULL INVOICE DETAILS & THERMAL RECEIPT MODAL */}
      <Modal visible={!!selectedInvoice} transparent animationType="fade">
        <View style={[styles.modalBackdrop, isSmallMobile && { padding: 6 }]}>
          <View style={[styles.modalSheet, isMobile && styles.modalSheetMobile, isSmallMobile && styles.modalSheetSmallMobile]}>
            {selectedInvoice && (
              <>
                {/* Modal Header */}
                <View style={styles.modalTopBar}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <SultanLogo size="xs" variant="circle" width={22} height={22} />
                    <View>
                      <Text style={[styles.modalInvoiceTitle, isSmallMobile && { fontSize: 14 }]}>Invoice #{selectedInvoice.id}</Text>
                      <Text style={[styles.modalInvoiceSubtitle, isSmallMobile && { fontSize: 10 }]}>
                        {formatDateTime(selectedInvoice.timeSettled || selectedInvoice.timePlaced)}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => setSelectedInvoice(null)}
                    style={styles.modalCloseBtn}
                  >
                    <Ionicons name="close" size={22} color="#1C1C1E" />
                  </TouchableOpacity>
                </View>

                {/* Tab Switcher */}
                <View style={styles.modalTabBar}>
                  <TouchableOpacity
                    style={[styles.modalTabBtn, detailsTab === 'breakdown' && styles.modalTabBtnActive]}
                    onPress={() => setDetailsTab('breakdown')}
                  >
                    <Ionicons
                      name="list-outline"
                      size={16}
                      color={detailsTab === 'breakdown' ? '#4a121a' : '#8E8E93'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.modalTabText, detailsTab === 'breakdown' && styles.modalTabTextActive]}>
                      Order Breakdown
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalTabBtn, detailsTab === 'thermal' && styles.modalTabBtnActive]}
                    onPress={() => setDetailsTab('thermal')}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={16}
                      color={detailsTab === 'thermal' ? '#4a121a' : '#8E8E93'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.modalTabText, detailsTab === 'thermal' && styles.modalTabTextActive]}>
                      Thermal Slip (80mm)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Tab Content */}
                <ScrollView style={styles.modalBodyScroll} showsVerticalScrollIndicator={false}>
                  {detailsTab === 'breakdown' ? (
                    <View style={{ gap: 16 }}>
                      {/* Status Banner */}
                      {selectedInvoice.status === 'voided' ? (
                        <View style={styles.voidBannerModal}>
                          <Ionicons name="warning" size={20} color="#C62828" style={{ marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.voidBannerTitle}>THIS INVOICE WAS VOIDED</Text>
                            <Text style={styles.voidBannerDesc}>
                              Reason: {selectedInvoice.voidReason || 'Cancelled by manager'}
                              {selectedInvoice.voidedBy ? ` • By ${selectedInvoice.voidedBy}` : ''}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.paidBannerModal}>
                          <Ionicons name="checkmark-circle" size={20} color="#2E7D32" style={{ marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.paidBannerTitle}>PAYMENT SETTLED & RECORDED</Text>
                            <Text style={styles.paidBannerDesc}>
                              Order fully finalized and synced with central server.
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Order Context Grid */}
                      <View style={styles.metaDetailCard}>
                        <View style={styles.metaDetailRow}>
                          <Text style={styles.metaDetailKey}>Order Type</Text>
                          <Text style={styles.metaDetailVal}>{selectedInvoice.orderType.toUpperCase()}</Text>
                        </View>
                        {selectedInvoice.tableName && (
                          <View style={styles.metaDetailRow}>
                            <Text style={styles.metaDetailKey}>Table / Zone</Text>
                            <Text style={styles.metaDetailVal}>{selectedInvoice.tableName}</Text>
                          </View>
                        )}
                        <View style={styles.metaDetailRow}>
                          <Text style={styles.metaDetailKey}>Order Taken By</Text>
                          <Text style={styles.metaDetailVal}>
                            {selectedInvoice.orderTakenBy || (selectedInvoice.server && !selectedInvoice.server.toLowerCase().includes('pos') ? selectedInvoice.server : 'Staff')}
                          </Text>
                        </View>
                        <View style={styles.metaDetailRow}>
                          <Text style={styles.metaDetailKey}>Billed By (Cashier)</Text>
                          <Text style={styles.metaDetailVal}>
                            {selectedInvoice.cashier || (selectedInvoice.server?.toLowerCase().includes('pos') ? selectedInvoice.server : 'Manager')}
                          </Text>
                        </View>
                        {selectedInvoice.customer && (
                          <>
                            <View style={styles.metaDetailRow}>
                              <Text style={styles.metaDetailKey}>Customer Name</Text>
                              <Text style={styles.metaDetailVal}>{selectedInvoice.customer.name}</Text>
                            </View>
                            <View style={styles.metaDetailRow}>
                              <Text style={styles.metaDetailKey}>Customer Phone</Text>
                              <Text style={styles.metaDetailVal}>{selectedInvoice.customer.phone}</Text>
                            </View>
                            {selectedInvoice.customer.address && (
                              <View style={styles.metaDetailRow}>
                                <Text style={styles.metaDetailKey}>Delivery Address</Text>
                                <Text style={[styles.metaDetailVal, { maxWidth: '60%' }]}>
                                  {selectedInvoice.customer.address}
                                </Text>
                              </View>
                            )}
                          </>
                        )}
                      </View>

                      {/* Itemized Order Table */}
                      <View style={styles.itemizedBox}>
                        <Text style={styles.itemizedBoxTitle}>Order Items Details</Text>
                        <View style={styles.itemizedHeaderRow}>
                          <Text style={[styles.itemizedColText, isSmallMobile && { fontSize: 10 }, { flex: isSmallMobile ? 2.5 : 3 }]}>Item</Text>
                          <Text style={[styles.itemizedColText, isSmallMobile && { fontSize: 10 }, { flex: isSmallMobile ? 0.8 : 1, textAlign: 'center' }]}>Qty</Text>
                          <Text style={[styles.itemizedColText, isSmallMobile && { fontSize: 10 }, { flex: isSmallMobile ? 1.3 : 1.5, textAlign: 'right' }]}>Price</Text>
                          <Text style={[styles.itemizedColText, isSmallMobile && { fontSize: 10 }, { flex: isSmallMobile ? 1.4 : 1.5, textAlign: 'right' }]}>Total</Text>
                        </View>

                        {selectedInvoice.items?.map((item, idx) => (
                          <View key={idx} style={styles.itemizedDataRow}>
                            <View style={{ flex: isSmallMobile ? 2.5 : 3 }}>
                              <Text style={[styles.itemizedItemName, isSmallMobile && { fontSize: 12 }]}>{item.name}</Text>
                              {item.notes ? (
                                <Text style={styles.itemizedItemNotes}>Note: {item.notes}</Text>
                              ) : null}
                            </View>
                            <Text style={[styles.itemizedItemQty, isSmallMobile && { fontSize: 12 }, { flex: isSmallMobile ? 0.8 : 1, textAlign: 'center' }]}>
                              {item.qty}
                            </Text>
                            <Text style={[styles.itemizedItemPrice, isSmallMobile && { fontSize: 11 }, { flex: isSmallMobile ? 1.3 : 1.5, textAlign: 'right' }]}>
                              Rs. {item.price.toLocaleString()}
                            </Text>
                            <Text style={[styles.itemizedItemTotal, isSmallMobile && { fontSize: 12 }, { flex: isSmallMobile ? 1.4 : 1.5, textAlign: 'right' }]}>
                              Rs. {(item.price * item.qty).toLocaleString()}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Financial Bill Calculation */}
                      <View style={styles.calculationCard}>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcKey}>Subtotal</Text>
                          <Text style={styles.calcVal}>Rs. {(selectedInvoice.subTotal || 0).toLocaleString()}</Text>
                        </View>
                        {(selectedInvoice.discount || 0) > 0 && (
                          <View style={styles.calcRow}>
                            <Text style={[styles.calcKey, { color: '#E74C3C' }]}>Discount Given</Text>
                            <Text style={[styles.calcVal, { color: '#E74C3C' }]}>
                              - Rs. {(selectedInvoice.discount || 0).toLocaleString()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.calcRow}>
                          <Text style={styles.calcKey}>GST Tax (16%)</Text>
                          <Text style={styles.calcVal}>Rs. {(selectedInvoice.tax || 0).toLocaleString()}</Text>
                        </View>
                        <View style={[styles.calcRow, styles.calcGrandRow]}>
                          <Text style={[styles.calcGrandKey, isSmallMobile && { fontSize: 14 }]}>TOTAL AMOUNT</Text>
                          <Text style={[styles.calcGrandVal, isSmallMobile && { fontSize: 16 }]}>Rs. {(selectedInvoice.total || 0).toLocaleString()}</Text>
                        </View>
                      </View>

                      {/* Payment Receipts Section */}
                      <View style={styles.paymentsSection}>
                        <Text style={styles.itemizedBoxTitle}>Payment Breakdown</Text>
                        {selectedInvoice.payments?.map((p, idx) => (
                          <View key={idx} style={styles.paymentDetailRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons
                                name={p.type === 'cash' ? 'cash-outline' : p.type === 'card' ? 'card-outline' : 'phone-portrait-outline'}
                                size={18}
                                color="#4a121a"
                              />
                              <Text style={[styles.paymentMethodName, isSmallMobile && { fontSize: 12 }]}>{p.type.toUpperCase()} PAYMENT</Text>
                            </View>
                            <Text style={[styles.paymentAmountVal, isSmallMobile && { fontSize: 13 }]}>Rs. {(p.amount || 0).toLocaleString()}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    /* THERMAL 80MM RECEIPT PREVIEW */
                    <View style={styles.thermalContainer}>
                      {Platform.OS === 'web' && (
                        <style dangerouslySetInnerHTML={{ __html: `
                          @media print {
                            body * {
                              visibility: hidden !important;
                            }
                            #thermal-printable-receipt, #thermal-printable-receipt * {
                              visibility: visible !important;
                            }
                            #thermal-printable-receipt {
                              position: fixed !important;
                              left: 0 !important;
                              top: 0 !important;
                              width: 80mm !important;
                              max-width: 100% !important;
                              margin: 0 !important;
                              padding: 6mm 4mm !important;
                              box-shadow: none !important;
                              border: none !important;
                              background: #fff !important;
                            }
                          }
                        `}} />
                      )}

                      <View nativeID="thermal-printable-receipt" style={[styles.thermalPaper, isSmallMobile && styles.thermalPaperSmallMobile]}>
                        <View style={styles.thermalHeader}>
                          <SultanLogo size="md" variant="bare" width={80} height={74} style={{ alignSelf: 'center', marginBottom: 6 }} />
                          <Text style={[styles.thermalBrandTitle, isSmallMobile && { fontSize: 18, letterSpacing: 1.5 }]}>SULTAN RESTAURANT</Text>
                          <Text style={styles.thermalBrandSub}>LUXURY DINING & BANQUET</Text>
                          <Text style={styles.thermalContactText}>Food Street, Culinary District, Lahore</Text>
                          <Text style={styles.thermalContactText}>Tel: 0300-1234567 • NTN: 8943120-4</Text>
                        </View>

                        <Text style={[styles.thermalDashedLine, isSmallMobile && { fontSize: 10 }]}>- - - - - - - - - - - - - - - - - - - -</Text>

                        <View style={styles.thermalMetaRow}>
                          <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>INV: #{selectedInvoice.id}</Text>
                          <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>
                            {new Date(selectedInvoice.timeSettled || selectedInvoice.timePlaced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <View style={styles.thermalMetaRow}>
                          <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>Type: {selectedInvoice.orderType.toUpperCase()}</Text>
                          <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>
                            Date: {new Date(selectedInvoice.timeSettled || selectedInvoice.timePlaced).toLocaleDateString()}
                          </Text>
                        </View>
                        {selectedInvoice.tableName && (
                          <View style={styles.thermalMetaRow}>
                            <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>Table: {selectedInvoice.tableName}</Text>
                          </View>
                        )}

                        {/* Order Creator & Cashier Display */}
                        {(() => {
                          const orderCreator = selectedInvoice.orderTakenBy || (selectedInvoice.server && !selectedInvoice.server.toLowerCase().includes('pos') ? selectedInvoice.server : 'Staff');
                          const cashierName = selectedInvoice.cashier || (selectedInvoice.server?.toLowerCase().includes('pos') ? selectedInvoice.server : 'Manager');
                          const isSame = orderCreator === cashierName;

                          if (isSame) {
                            return (
                              <View style={styles.thermalMetaRow}>
                                <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>Staff / Cashier: {cashierName}</Text>
                              </View>
                            );
                          }
                          return (
                            <>
                              <View style={styles.thermalMetaRow}>
                                <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>Order Taken By:</Text>
                                <Text style={[styles.thermalMetaText, { fontWeight: 'bold' }, isSmallMobile && { fontSize: 10 }]}>{orderCreator}</Text>
                              </View>
                              <View style={styles.thermalMetaRow}>
                                <Text style={[styles.thermalMetaText, isSmallMobile && { fontSize: 10 }]}>Billed By (Cashier):</Text>
                                <Text style={[styles.thermalMetaText, { fontWeight: 'bold' }, isSmallMobile && { fontSize: 10 }]}>{cashierName}</Text>
                              </View>
                            </>
                          );
                        })()}
                        {selectedInvoice.customer && (
                          <View style={{ marginTop: 4 }}>
                            <Text style={styles.thermalMetaText}>Guest: {selectedInvoice.customer.name}</Text>
                            <Text style={styles.thermalMetaText}>Phone: {selectedInvoice.customer.phone}</Text>
                          </View>
                        )}

                        {selectedInvoice.status === 'voided' && (
                          <View style={{ marginVertical: 6, alignItems: 'center' }}>
                            <Text style={styles.thermalVoidNotice}>*** BILL VOIDED / CANCELLED ***</Text>
                          </View>
                        )}

                        <Text style={[styles.thermalDashedLine, isSmallMobile && { fontSize: 10 }]}>- - - - - - - - - - - - - - - - - - - -</Text>

                        {/* Items Header */}
                        <View style={styles.thermalItemHeader}>
                          <Text style={[styles.thermalCol, isSmallMobile && { fontSize: 10 }, { width: '15%' }]}>Qty</Text>
                          <Text style={[styles.thermalCol, isSmallMobile && { fontSize: 10 }, { width: '50%' }]}>Item</Text>
                          <Text style={[styles.thermalCol, isSmallMobile && { fontSize: 10 }, { width: '35%', textAlign: 'right' }]}>Amount</Text>
                        </View>

                        {selectedInvoice.items?.map((item, idx) => (
                          <View key={idx} style={styles.thermalItemRow}>
                            <Text style={[styles.thermalCol, isSmallMobile && { fontSize: 10 }, { width: '15%' }]}>{item.qty}x</Text>
                            <Text style={[styles.thermalCol, isSmallMobile && { fontSize: 10 }, { width: '50%' }]}>{item.name}</Text>
                            <Text style={[styles.thermalCol, isSmallMobile && { fontSize: 10 }, { width: '35%', textAlign: 'right' }]}>
                              {(item.price * item.qty).toLocaleString()}
                            </Text>
                          </View>
                        ))}

                        <Text style={[styles.thermalDashedLine, isSmallMobile && { fontSize: 10 }]}>- - - - - - - - - - - - - - - - - - - -</Text>

                        <View style={styles.thermalSummaryRow}>
                          <Text style={[styles.thermalSummaryKey, isSmallMobile && { fontSize: 10 }]}>Sub Total:</Text>
                          <Text style={[styles.thermalSummaryVal, isSmallMobile && { fontSize: 10 }]}>Rs. {(selectedInvoice.subTotal || 0).toLocaleString()}</Text>
                        </View>
                        {(selectedInvoice.discount || 0) > 0 && (
                          <View style={styles.thermalSummaryRow}>
                            <Text style={[styles.thermalSummaryKey, isSmallMobile && { fontSize: 10 }]}>Discount:</Text>
                            <Text style={[styles.thermalSummaryVal, isSmallMobile && { fontSize: 10 }]}>- Rs. {(selectedInvoice.discount || 0).toLocaleString()}</Text>
                          </View>
                        )}
                        <View style={styles.thermalSummaryRow}>
                          <Text style={[styles.thermalSummaryKey, isSmallMobile && { fontSize: 10 }]}>GST Tax (16%):</Text>
                          <Text style={[styles.thermalSummaryVal, isSmallMobile && { fontSize: 10 }]}>Rs. {(selectedInvoice.tax || 0).toLocaleString()}</Text>
                        </View>

                        <Text style={[styles.thermalDashedLine, isSmallMobile && { fontSize: 10 }]}>================================</Text>

                        <View style={styles.thermalGrandRow}>
                          <Text style={[styles.thermalGrandKey, isSmallMobile && { fontSize: 13 }]}>NET PAYABLE:</Text>
                          <Text style={[styles.thermalGrandVal, isSmallMobile && { fontSize: 14 }]}>Rs. {(selectedInvoice.total || 0).toLocaleString()}</Text>
                        </View>

                        <Text style={[styles.thermalDashedLine, isSmallMobile && { fontSize: 10 }]}>================================</Text>

                        {selectedInvoice.payments?.map((p, idx) => (
                          <View key={idx} style={styles.thermalSummaryRow}>
                            <Text style={[styles.thermalSummaryKey, isSmallMobile && { fontSize: 10 }]}>Paid via {p.type.toUpperCase()}:</Text>
                            <Text style={[styles.thermalSummaryVal, isSmallMobile && { fontSize: 10 }]}>Rs. {(p.amount || 0).toLocaleString()}</Text>
                          </View>
                        ))}

                        <View style={styles.thermalFooter}>
                          <Text style={[styles.thermalFooterText, isSmallMobile && { fontSize: 10 }]}>Thank you for dining with Sultan!</Text>
                          <Text style={[styles.thermalFooterSub, isSmallMobile && { fontSize: 8 }]}>We look forward to serving you again.</Text>
                          <Text style={[styles.thermalFooterSub, isSmallMobile && { fontSize: 8 }]}>Software by Sultan POS System</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </ScrollView>

                {/* Modal Action Bar */}
                <View style={[styles.modalActionBar, isSmallMobile && { padding: 10, gap: 8 }]}>
                  <TouchableOpacity
                    style={[styles.modalPrintBtn, isSmallMobile && { paddingVertical: 10 }]}
                    onPress={() => handlePrintOrShare(selectedInvoice)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="print" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={[styles.modalPrintBtnText, isSmallMobile && { fontSize: 13 }]}>Print / Share Receipt</Text>
                  </TouchableOpacity>

                  {selectedInvoice.status !== 'voided' && selectedInvoice.status !== 'refunded' && canProcessReturns && systemSettings.enableReturnsModule !== false && (
                    <TouchableOpacity
                      style={[styles.modalReturnBtn, isSmallMobile && { paddingVertical: 10, paddingHorizontal: 12 }]}
                      onPress={() => {
                        setSelectedInvoice(null);
                        const targetPath = userRole === 'admin' ? '/admin/returns' : '/manager/returns';
                        router.push(targetPath as any);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="return-down-back" size={18} color="#D84315" style={{ marginRight: 4 }} />
                      <Text style={[styles.modalReturnBtnText, isSmallMobile && { fontSize: 12 }]}>Return / Refund</Text>
                    </TouchableOpacity>
                  )}

                  {selectedInvoice.status !== 'voided' && canVoidInvoice && (
                    <TouchableOpacity
                      style={[styles.modalVoidBtn, isSmallMobile && { paddingVertical: 10, paddingHorizontal: 12 }]}
                      onPress={() => handleOpenVoidModal(selectedInvoice)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#E74C3C" style={{ marginRight: 4 }} />
                      <Text style={[styles.modalVoidBtnText, isSmallMobile && { fontSize: 12 }]}>Void</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* VOID CONFIRMATION MODAL */}
      <Modal visible={voidModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.voidModalCard}>
            <View style={styles.voidModalHeader}>
              <View style={styles.voidIconWrap}>
                <Ionicons name="warning" size={24} color="#C62828" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.voidModalTitle}>Confirm Void Invoice</Text>
                <Text style={styles.voidModalSub}>
                  Invoice #{invoiceToVoid?.id} • Total: Rs. {(invoiceToVoid?.total || 0).toLocaleString()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setVoidModalVisible(false)}>
                <Ionicons name="close" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <Text style={styles.voidPromptText}>Select or specify reason for voiding this invoice:</Text>

            <View style={styles.reasonPresets}>
              {[
                'Wrong order punched',
                'Guest walked out / cancelled',
                'Duplicate billing entry',
                'Food return / customer dispute',
                'Other',
              ].map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonChip, voidReason === reason && styles.reasonChipActive]}
                  onPress={() => setVoidReason(reason)}
                >
                  <Text style={[styles.reasonChipText, voidReason === reason && styles.reasonChipTextActive]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {voidReason === 'Other' && (
              <TextInput
                style={styles.customReasonInput}
                placeholder="Enter specific reason..."
                placeholderTextColor="#8E8E93"
                value={customVoidReason}
                onChangeText={setCustomVoidReason}
              />
            )}

            {systemSettings.requirePinForVoid && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#4a121a', marginBottom: 4 }}>
                  Admin / Manager PIN Required *
                </Text>
                <TextInput
                  style={[styles.customReasonInput, { marginTop: 0 }]}
                  placeholder="Enter Admin or Manager PIN"
                  placeholderTextColor="#8E8E93"
                  secureTextEntry
                  keyboardType="numeric"
                  value={voidPinInput}
                  onChangeText={(t) => {
                    setVoidPinInput(t);
                    if (voidPinError) setVoidPinError('');
                  }}
                />
                {Boolean(voidPinError) && (
                  <Text style={{ fontSize: 11.5, color: '#DC2626', fontWeight: '600', marginTop: 4 }}>
                    {voidPinError}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.voidActionRow}>
              <TouchableOpacity
                style={styles.cancelVoidBtn}
                onPress={() => setVoidModalVisible(false)}
              >
                <Text style={styles.cancelVoidBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmVoidBtn}
                onPress={handleConfirmVoid}
              >
                <Text style={styles.confirmVoidBtnText}>Confirm Void</Text>
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
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#4a121a',
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
  },
  headerMobile: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerSmallMobile: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
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
    backgroundColor: '#D5A943',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#4a121a',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D5A943',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  exportBtnText: {
    color: '#4a121a',
    fontWeight: '800',
    fontSize: 13,
  },
  contentScroll: {
    flex: 1,
    padding: 16,
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 14,
    padding: 15,
    borderLeftWidth: 4.5,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)',
      } as any,
    }),
    elevation: 3,
  },
  kpiCardEmerald: {
    backgroundColor: 'rgba(236, 253, 245, 0.9)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderLeftColor: '#10B981',
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
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#636366',
    marginTop: 3,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1C1C1E',
    paddingVertical: 0,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  sortBtn: {},
  sortBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4a121a',
  },
  filterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    marginLeft: 4,
  },
  filterChip: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  filterChipActive: {
    backgroundColor: '#4a121a',
    borderColor: '#4a121a',
  },
  filterChipVoidActive: {
    backgroundColor: '#C62828',
    borderColor: '#C62828',
  },
  filterChipRefundActive: {
    backgroundColor: '#6A1B9A',
    borderColor: '#6A1B9A',
  },
  filterChipText: {
    fontSize: 12,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterChipVoidTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 6,
  },
  resultsCounterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultsCountText: {
    fontSize: 13,
    color: '#636366',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    borderColor: '#E5E5EA',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 6,
    textAlign: 'center',
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
  invoicesList: {
    gap: 8,
  },
  invoiceRowCard: {
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
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    ...Platform.select({
      web: {
        transition: 'all 0.15s ease',
      } as any,
    }),
  },
  invoiceRowVoided: {
    borderLeftColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  invoiceRowRefunded: {
    borderLeftColor: '#8B5CF6',
    backgroundColor: '#F5F3FF',
  },
  invoiceRowPartial: {
    borderLeftColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  rowCol: {
    justifyContent: 'center',
  },
  idAndStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusBadgeSettled: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeVoided: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeRefunded: {
    backgroundColor: '#EDE9FE',
  },
  statusBadgePartial: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusBadgeTextSettled: {
    color: '#059669',
  },
  statusBadgeTextVoided: {
    color: '#DC2626',
  },
  statusBadgeTextRefunded: {
    color: '#7C3AED',
  },
  statusBadgeTextPartial: {
    color: '#D97706',
  },
  rowInvoiceIdText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  tableChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  typeBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  typeBadgeCompactText: {
    fontSize: 11,
    fontWeight: '700',
  },
  reviewChipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  reviewChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  rowDateText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  rowStaffText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  rowStaffLabel: {
    color: '#94A3B8',
    fontWeight: '700',
  },
  rowCustomerText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  itemsSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(82, 20, 28, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  itemsSummaryCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52141C',
  },
  itemsSummaryPreview: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  rowTotalAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#52141C',
  },
  rowTotalAmountVoided: {
    textDecorationLine: 'line-through',
    color: '#EF4444',
  },
  rowPayModeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.8,
    borderColor: '#CBD5E1',
  },
  rowPayModeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  rowTaxHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
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
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  actionBtnViewText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52141C',
  },
  actionBtnReceipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#52141C',
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    borderRadius: 7,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  actionBtnReceiptText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnReview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 7,
    paddingVertical: 5.5,
    borderRadius: 7,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  actionBtnReviewText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  actionBtnReturn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 7,
    paddingVertical: 5.5,
    borderRadius: 7,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },
  actionBtnReturnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#BE123C',
  },
  actionBtnVoid: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 5.5,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
    }),
  },

  /* Mobile card styles */
  mobileInvoiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  mobileCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileTotalText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#52141C',
  },
  mobileCardMidRow: {
    gap: 3,
    borderTopWidth: 0.8,
    borderBottomWidth: 0.8,
    borderColor: '#F1F5F9',
    paddingVertical: 5,
  },
  mobileMetaText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
  },
  mobileMetaSubText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  mobileCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  mobileActionBtnView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
  },
  mobileActionBtnReceipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#52141C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
  },

  /* MODAL STYLES */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalSheetMobile: {
    maxWidth: '100%',
    maxHeight: '95%',
  },
  modalSheetSmallMobile: {
    maxHeight: '98%',
    borderRadius: 12,
  },
  modalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalInvoiceTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  modalInvoiceSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F8F9FA',
  },
  modalTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modalTabBtnActive: {
    borderBottomColor: '#4a121a',
    backgroundColor: '#FFFFFF',
  },
  modalTabText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#64748B',
  },
  modalTabTextActive: {
    color: '#4a121a',
    fontWeight: '800',
  },
  modalBodyScroll: {
    padding: 18,
  },
  voidBannerModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  voidBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#C62828',
  },
  voidBannerDesc: {
    fontSize: 12.5,
    color: '#B71C1C',
    marginTop: 2,
  },
  paidBannerModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  paidBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#2E7D32',
  },
  paidBannerDesc: {
    fontSize: 12.5,
    color: '#1B5E20',
    marginTop: 2,
  },
  metaDetailCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 8,
  },
  metaDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaDetailKey: {
    fontSize: 13.5,
    color: '#475569',
    fontWeight: '600',
  },
  metaDetailVal: {
    fontSize: 13.5,
    color: '#1C1C1E',
    fontWeight: '800',
  },
  itemizedBox: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    overflow: 'hidden',
  },
  itemizedBoxTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1C1C1E',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemizedHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  itemizedColText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  itemizedDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  itemizedItemName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  itemizedItemNotes: {
    fontSize: 12.5,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemizedItemQty: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  itemizedItemPrice: {
    fontSize: 13.5,
    color: '#475569',
  },
  itemizedItemTotal: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  calculationCard: {
    backgroundColor: '#FDFBF7',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0E6D2',
    gap: 8,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calcKey: {
    fontSize: 14,
    color: '#475569',
  },
  calcVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  calcGrandRow: {
    borderTopWidth: 1,
    borderTopColor: '#E0D4BE',
    paddingTop: 8,
    marginTop: 4,
  },
  calcGrandKey: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4a121a',
  },
  calcGrandVal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4a121a',
  },
  paymentsSection: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  paymentDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  paymentMethodName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  paymentAmountVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#27AE60',
  },

  /* THERMAL PAPER RECEIPT PREVIEW */
  thermalContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  thermalPaper: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 380,
    padding: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  thermalPaperSmallMobile: {
    padding: 12,
    borderRadius: 6,
    maxWidth: '100%',
  },
  thermalHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  thermalBrandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
    letterSpacing: 2,
    textAlign: 'center',
  },
  thermalBrandSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  thermalContactText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginTop: 2,
  },
  thermalDashedLine: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginVertical: 4,
    letterSpacing: 1,
  },
  thermalMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  thermalMetaText: {
    fontSize: 12.5,
    color: '#1E293B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  thermalVoidNotice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#C62828',
    letterSpacing: 1,
  },
  thermalItemHeader: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  thermalItemRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  thermalCol: {
    fontSize: 12.5,
    color: '#1E293B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  thermalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  thermalSummaryKey: {
    fontSize: 12.5,
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  thermalSummaryVal: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  thermalGrandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  thermalGrandKey: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111111',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  thermalGrandVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  thermalFooter: {
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  thermalFooterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333333',
    textAlign: 'center',
  },
  thermalFooterSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 3,
  },

  /* MODAL ACTION BAR */
  modalActionBar: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  modalPrintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a121a',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalPrintBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  modalVoidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  modalVoidBtnText: {
    color: '#C62828',
    fontWeight: '700',
    fontSize: 13,
  },
  modalReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  modalReturnBtnText: {
    color: '#D84315',
    fontWeight: '700',
    fontSize: 13,
  },

  /* VOID MODAL */
  voidModalCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  voidModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  voidIconWrap: {
    backgroundColor: '#FFEBEE',
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voidModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  voidModalSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  voidPromptText: {
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '600',
    marginBottom: 10,
  },
  reasonPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  reasonChip: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  reasonChipActive: {
    backgroundColor: '#FFEBEE',
    borderColor: '#C62828',
  },
  reasonChipText: {
    fontSize: 12,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  reasonChipTextActive: {
    color: '#C62828',
    fontWeight: '700',
  },
  customReasonInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 10,
    fontSize: 13,
    color: '#1C1C1E',
    marginBottom: 16,
  },
  voidActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelVoidBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
  },
  cancelVoidBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#636366',
  },
  confirmVoidBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#C62828',
  },
  confirmVoidBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
