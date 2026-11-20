import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState, useEffect } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useRolePermissions } from '../store/roleStore';
import { useOpsStore } from '../store/opsStore';
import { useRestaurantStore } from '../store/restaurantStore';
import {
  CashDenominations,
  INITIAL_DENOMINATIONS,
  ShiftRecord,
  ShiftType,
  calculateDenominationTotal,
  useShiftStore,
} from '../store/shiftStore';
import { broadcastImmediately } from '../services/syncService';
import FullscreenButton from '../components/FullscreenButton';
import { TouchNumericKeypad } from '../components/TouchNumericKeypad';

const REGISTER_OPTIONS = [
  'Counter #1 (Main Dining)',
  'Counter #2 (Family Hall)',
  'Takeaway & Delivery Counter',
  'Juice Bar & Cafe Counter',
];

function getAutoShiftType(): ShiftType {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 16) return 'Morning';
  if (hour >= 16 && hour < 24) return 'Evening';
  return 'Night';
}

export default function ShiftManagementScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Stores
  const user = useAuthStore((s) => s.user);
  const staff = useRestaurantStore((s) => s.staff) || [];
  const invoices = useRestaurantStore((s) => s.invoices) || [];
  const expenses = useOpsStore((s) => s.expenses) || [];

  const shifts = useShiftStore((s) => s.shifts) || [];
  const activeShiftId = useShiftStore((s) => s.activeShiftId);
  const openShift = useShiftStore((s) => s.openShift);

  const { can, canViewRevenue } = useRolePermissions();
  const [adminPrivacyPreview, setAdminPrivacyPreview] = useState(false);

  // Cashier Privacy is strictly enforced for Cashier, Manager, and Staff (Blind Cash Audit)
  const isCashierPrivacy = user?.role !== 'admin' || !canViewRevenue || adminPrivacyPreview;
  const closeShiftBlind = useShiftStore((s) => s.closeShiftBlind);
  const auditShift = useShiftStore((s) => s.auditShift);

  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [selectedShiftForDetail, setSelectedShiftForDetail] = useState<ShiftRecord | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportModalType, setReportModalType] = useState<'X-Report' | 'Z-Report'>('Z-Report');

  // Form State: Open New Shift
  const [newShiftType, setNewShiftType] = useState<ShiftType>(() => getAutoShiftType());
  const [newRegisterId, setNewRegisterId] = useState(REGISTER_OPTIONS[0]);
  const [newCashierId, setNewCashierId] = useState(user?.staffId || staff[0]?.id || 'st1');
  const [newCashierName, setNewCashierName] = useState(user?.name || staff[0]?.name || 'Cashier');
  const [newOpeningFloat, setNewOpeningFloat] = useState('5000');

  // Form State: Close Shift
  const [countedCashInput, setCountedCashInput] = useState('');
  const [showCountKeypad, setShowCountKeypad] = useState(true);
  const [showFloatKeypad, setShowFloatKeypad] = useState(false);
  const [showDenominations, setShowDenominations] = useState(false);
  const [denominations, setDenominations] = useState<CashDenominations>(INITIAL_DENOMINATIONS);
  const [cashierNotes, setCashierNotes] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  // Active shift object
  const activeShift = useMemo(() => {
    if (activeShiftId) {
      return shifts.find((s) => s.id === activeShiftId && s.status === 'open') || null;
    }
    return shifts.find((s) => s.status === 'open') || null;
  }, [shifts, activeShiftId]);

  // Denomination computed total
  const calculatedDenomTotal = useMemo(() => {
    return calculateDenominationTotal(denominations);
  }, [denominations]);

  // If user counted notes, keep input in sync
  useEffect(() => {
    if (showDenominations && calculatedDenomTotal > 0) {
      setCountedCashInput(String(calculatedDenomTotal));
    }
  }, [showDenominations, calculatedDenomTotal]);

  // Financials for active shift
  const shiftFinancials = useMemo(() => {
    if (!activeShift) {
      return {
        cashSales: 0,
        cardSales: 0,
        onlineSales: 0,
        totalSales: 0,
        ordersCount: 0,
        cashPayouts: 0,
        expectedCash: 0,
      };
    }

    const startT = activeShift.openedAt;
    const endT = activeShift.closedAt || Date.now();

    const shiftInvoices = (invoices || []).filter((inv) => {
      if (inv.status === 'voided') return false;
      const t = inv.timeSettled || inv.timePlaced;
      return t >= startT && t <= endT;
    });

    let cashSales = 0;
    let cardSales = 0;
    let onlineSales = 0;

    shiftInvoices.forEach((inv) => {
      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach((p) => {
          if (p.type === 'cash') cashSales += p.amount;
          else if (p.type === 'card') cardSales += p.amount;
          else if (p.type === 'online') onlineSales += p.amount;
        });
      } else if (inv.status === 'settled' || !inv.status) {
        cashSales += inv.total || 0;
      }
    });

    const shiftExpenses = (expenses || []).filter((e) => {
      return e.method === 'cash' && e.at >= startT && e.at <= endT;
    });
    const cashPayouts = shiftExpenses.reduce((sum, e) => sum + e.amount, 0);
    const expectedCash = activeShift.openingFloat + cashSales - cashPayouts;

    return {
      cashSales,
      cardSales,
      onlineSales,
      totalSales: cashSales + cardSales + onlineSales,
      ordersCount: shiftInvoices.length,
      cashPayouts,
      expectedCash,
    };
  }, [activeShift, invoices, expenses]);

  // Realtime variance
  const countedNum = parseFloat(countedCashInput) || 0;
  const difference = countedCashInput ? countedNum - shiftFinancials.expectedCash : null;

  // Handlers
  const handleStartShift = () => {
    const floatNum = parseFloat(newOpeningFloat) || 0;
    if (floatNum < 0) {
      Alert.alert('Invalid Float', 'Please enter a valid opening float amount.');
      return;
    }

    const created = openShift({
      shiftType: newShiftType,
      registerId: newRegisterId,
      cashierId: newCashierId,
      cashierName: newCashierName,
      openedBy: user?.name ? `${user.name} (${user.role || 'Staff'})` : 'Duty Manager',
      openingFloat: floatNum,
    });

    setCountedCashInput('');
    setDenominations(INITIAL_DENOMINATIONS);
    setShowDenominations(false);
    setCashierNotes('');
    broadcastImmediately();

    Alert.alert('Shift Started! • شفٹ شروع ہو گئی', `Shift ${created.id} is now LIVE on ${created.registerId}.`);
  };

  const handleCloseShift = () => {
    if (!activeShift) return;

    if (!countedCashInput.trim() || countedNum <= 0) {
      Alert.alert(
        'Enter Counted Cash • کیش درج کریں',
        'Please enter the total physical cash counted in drawer before closing.'
      );
      return;
    }

    const closed = closeShiftBlind(activeShift.id, {
      countedCash: countedNum,
      denominations: showDenominations ? denominations : undefined,
      cashierNotes: cashierNotes.trim() || undefined,
      closedBy: user?.name ? `${user.name} (${user.role || 'Cashier'})` : activeShift.cashierName,
      closedRole: user?.role || 'Cashier',
      systemCashSales: shiftFinancials.cashSales,
      systemCardSales: shiftFinancials.cardSales,
      systemOnlineSales: shiftFinancials.onlineSales,
      settledOrdersCount: shiftFinancials.ordersCount,
      cashPayouts: shiftFinancials.cashPayouts,
    });

    if (closed) {
      broadcastImmediately();
      setSelectedShiftForDetail(closed);
      setReportModalType('Z-Report');
      setShowReportModal(true);
      setActiveTab('history');
    }
  };

  const handleUpdateDenomination = (key: keyof CashDenominations, val: string) => {
    const num = parseInt(val, 10) || 0;
    setDenominations((prev) => ({
      ...prev,
      [key]: num >= 0 ? num : 0,
    }));
  };

  const openReport = (type: 'X-Report' | 'Z-Report', shift?: ShiftRecord) => {
    setReportModalType(type);
    if (shift) setSelectedShiftForDetail(shift);
    setShowReportModal(true);
  };

  const handlePrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    } else {
      Alert.alert('Printing Slip', 'Sending report to Sultan Thermal Receipt Printer...');
    }
  };

  // Filtered past shifts
  const filteredShifts = useMemo(() => {
    if (!historySearch.trim()) return shifts;
    const q = historySearch.toLowerCase();
    return shifts.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.cashierName.toLowerCase().includes(q) ||
        s.registerId.toLowerCase().includes(q) ||
        s.shiftType.toLowerCase().includes(q)
    );
  }, [shifts, historySearch]);

  return (
    <View style={styles.container}>
      {/* ======================================================== */}
      {/* TOP HEADER BAR                                           */}
      {/* ======================================================== */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin/dashboard'))}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#52171B" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Shift & Cash Drawer  •  کیش و شفٹ</Text>
            <Text style={styles.headerSubtitle}>
              {activeShift
                ? `Active: ${activeShift.id} • Cashier: ${activeShift.cashierName}`
                : 'No shift active • نیا شفٹ شروع کریں'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {user?.role === 'admin' && (
            <TouchableOpacity
              style={[
                styles.privacyToggleBtn,
                adminPrivacyPreview ? styles.privacyToggleBtnActive : undefined,
              ]}
              onPress={() => setAdminPrivacyPreview(!adminPrivacyPreview)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={adminPrivacyPreview ? 'eye-off' : 'eye'}
                size={14}
                color={adminPrivacyPreview ? '#DC2626' : '#059669'}
              />
              <Text style={[styles.privacyToggleText, adminPrivacyPreview && { color: '#DC2626' }]}>
                {adminPrivacyPreview ? 'Cashier Blind View' : 'Admin Audit View'}
              </Text>
            </TouchableOpacity>
          )}

          <FullscreenButton variant={isMobile ? 'compact' : 'pill'} />

          {activeShift && (
            <TouchableOpacity
              style={styles.posBtn}
              onPress={() => router.push('/admin/pos')}
              activeOpacity={0.8}
            >
              <Ionicons name="calculator" size={15} color="#24050A" />
              <Text style={styles.posBtnText}>Launch POS</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ======================================================== */}
      {/* NAVIGATION TABS                                          */}
      {/* ======================================================== */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'active' && styles.tabBtnActive]}
          onPress={() => setActiveTab('active')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeShift ? 'radio-button-on' : 'play-circle'}
            size={16}
            color={activeTab === 'active' ? '#52171B' : '#64748B'}
          />
          <Text style={[styles.tabBtnText, activeTab === 'active' && styles.tabBtnTextActive]}>
            {activeShift ? 'Live Shift Dashboard (لائیو شفٹ)' : 'Start Shift (شفٹ شروع کریں)'}
          </Text>
          {activeShift && <View style={styles.livePulseDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={activeTab === 'history' ? '#52171B' : '#64748B'}
          />
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>
            Shift History ({shifts.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
        {/* ======================================================== */}
        {/* TAB 1: ACTIVE SHIFT OR EASY START FORM                   */}
        {/* ======================================================== */}
        {activeTab === 'active' && (
          <>
            {/* ---------------------------------------------------- */}
            {/* CASE 1: NO SHIFT IS ACTIVE -> SIMPLE START CARD      */}
            {/* ---------------------------------------------------- */}
            {!activeShift ? (
              <View style={styles.easyCard}>
                <View style={styles.cardHeaderBox}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="key" size={22} color="#D5A943" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Open Register & Start Shift • نئی شفٹ شروع کریں</Text>
                    <Text style={styles.cardSubtitle}>
                      Cashier aur opening float check kar ke 1-click mein shift start karein.
                    </Text>
                  </View>
                </View>

                {/* 1. Quick Shift Type Pill */}
                <Text style={styles.fieldLabel}>Shift Timing / شفٹ کا وقت</Text>
                <View style={styles.quickTypeRow}>
                  {(['Morning', 'Evening', 'Night'] as ShiftType[]).map((type) => {
                    const isSel = newShiftType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.quickTypeBtn, isSel && styles.quickTypeBtnActive]}
                        onPress={() => setNewShiftType(type)}
                      >
                        <Ionicons
                          name={type === 'Morning' ? 'sunny' : type === 'Evening' ? 'moon' : 'cloudy-night'}
                          size={15}
                          color={isSel ? '#FFFFFF' : '#64748B'}
                        />
                        <Text style={[styles.quickTypeBtnText, isSel && styles.quickTypeBtnTextActive]}>
                          {type} Shift
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 2. Cashier Selector */}
                <Text style={styles.fieldLabel}>Cashier on Duty / کیشیئر</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {staff.map((st) => {
                    const isSel = newCashierId === st.id;
                    return (
                      <TouchableOpacity
                        key={st.id}
                        style={[styles.staffChip, isSel && styles.staffChipActive]}
                        onPress={() => {
                          setNewCashierId(st.id);
                          setNewCashierName(st.name);
                        }}
                      >
                        <Ionicons name="person" size={13} color={isSel ? '#FFFFFF' : '#52171B'} />
                        <Text style={[styles.staffChipText, isSel && styles.staffChipTextActive]}>
                          {st.name} ({st.role})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* 3. Opening Float with 1-Tap Quick Amount Buttons */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={styles.fieldLabel}>Opening Float in Drawer (دراز میں ابتدائی رقم)</Text>
                  <TouchableOpacity
                    style={[styles.keypadToggleChip, showFloatKeypad && styles.keypadToggleChipActive]}
                    onPress={() => setShowFloatKeypad(!showFloatKeypad)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="keypad" size={13} color={showFloatKeypad ? '#52171B' : '#64748B'} />
                    <Text style={[styles.keypadToggleChipText, showFloatKeypad && styles.keypadToggleChipTextActive]}>
                      {showFloatKeypad ? 'Touch Keypad (آن)' : 'Touch Keypad'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.floatInputContainer}>
                  <Text style={styles.floatCurrencyPrefix}>Rs.</Text>
                  <TextInput
                    style={styles.floatTextInput}
                    value={newOpeningFloat}
                    onChangeText={setNewOpeningFloat}
                    keyboardType="numeric"
                    placeholder="5000"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                {showFloatKeypad && (
                  <TouchNumericKeypad
                    value={newOpeningFloat}
                    onChangeText={setNewOpeningFloat}
                    quickAmounts={[1000, 2000, 5000, 10000]}
                    style={{ marginTop: 8, marginBottom: 8 }}
                  />
                )}

                {/* Quick Float Shortcuts */}
                <View style={styles.quickAmountRow}>
                  {['2000', '5000', '10000', '15000'].map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.quickAmtBtn, newOpeningFloat === amt && styles.quickAmtBtnActive]}
                      onPress={() => setNewOpeningFloat(amt)}
                    >
                      <Text style={[styles.quickAmtBtnText, newOpeningFloat === amt && styles.quickAmtBtnTextActive]}>
                        Rs. {parseInt(amt).toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Big Start Button */}
                <TouchableOpacity
                  style={styles.bigStartBtn}
                  onPress={handleStartShift}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play" size={20} color="#FFFFFF" />
                  <Text style={styles.bigStartBtnText}>
                    START SHIFT NOW  •  شفٹ شروع کریں
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ---------------------------------------------------- */
              /* CASE 2: SHIFT IS ACTIVE -> CLEAN LIVE DASHBOARD      */
              /* ---------------------------------------------------- */
              <View style={{ gap: 16 }}>
                {/* HERO STATS CARD */}
                <View style={styles.heroShiftCard}>
                  <View style={styles.heroShiftTop}>
                    <View style={styles.heroShiftBadge}>
                      <View style={styles.heroPulseDot} />
                      <Text style={styles.heroShiftBadgeText}>LIVE SHIFT ACTIVE</Text>
                    </View>
                    <Text style={styles.heroShiftTiming}>
                      {activeShift.shiftType} Shift • Started {new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  <View style={styles.heroShiftMainRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroLabel}>
                        {isCashierPrivacy
                          ? 'Blind Shift Cash Drawer (بلائنڈ کیش آڈٹ محفوظ ہے)'
                          : 'Expected Cash in Drawer (متوقع کیش)'}
                      </Text>
                      <Text style={styles.heroExpectedAmount}>
                        {isCashierPrivacy ? '••••••••' : `Rs. ${shiftFinancials.expectedCash.toLocaleString()}`}
                      </Text>
                      <Text style={styles.heroFormulaText}>
                        {isCashierPrivacy
                          ? 'Cashier Privacy Protected • Draz mein mojood physical cash count kar ke darj karein.'
                          : `Float: Rs. ${activeShift.openingFloat.toLocaleString()} + Cash: Rs. ${shiftFinancials.cashSales.toLocaleString()} - Payouts: Rs. ${shiftFinancials.cashPayouts.toLocaleString()}`}
                      </Text>
                    </View>

                    {!isCashierPrivacy && (
                      <TouchableOpacity
                        style={styles.heroReportBtn}
                        onPress={() => openReport('X-Report', activeShift)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="receipt-outline" size={16} color="#D5A943" />
                        <Text style={styles.heroReportBtnText}>Mid-Shift X-Report</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* 4 LIVE METRIC TILES */}
                <View style={styles.metricsGrid}>
                  <View style={styles.metricTile}>
                    <View style={[styles.metricIconWrap, { backgroundColor: '#ECFDF5' }]}>
                      <Ionicons name="cash" size={18} color="#059669" />
                    </View>
                    <Text style={styles.metricValue}>
                      {isCashierPrivacy ? '••••••••' : `Rs. ${shiftFinancials.cashSales.toLocaleString()}`}
                    </Text>
                    <Text style={styles.metricLabel}>Cash Sales (نقد)</Text>
                  </View>

                  <View style={styles.metricTile}>
                    <View style={[styles.metricIconWrap, { backgroundColor: '#EFF6FF' }]}>
                      <Ionicons name="card" size={18} color="#2563EB" />
                    </View>
                    <Text style={styles.metricValue}>
                      {isCashierPrivacy
                        ? '••••••••'
                        : `Rs. ${(shiftFinancials.cardSales + shiftFinancials.onlineSales).toLocaleString()}`}
                    </Text>
                    <Text style={styles.metricLabel}>Card & Digital (آن لائن)</Text>
                  </View>

                  <View style={styles.metricTile}>
                    <View style={[styles.metricIconWrap, { backgroundColor: '#FEF3C7' }]}>
                      <Ionicons name="receipt" size={18} color="#D97706" />
                    </View>
                    <Text style={styles.metricValue}>{shiftFinancials.ordersCount}</Text>
                    <Text style={styles.metricLabel}>Total Orders (کل آرڈر)</Text>
                  </View>

                  <View style={styles.metricTile}>
                    <View style={[styles.metricIconWrap, { backgroundColor: '#FEE2E2' }]}>
                      <Ionicons name="wallet" size={18} color="#DC2626" />
                    </View>
                    <Text style={styles.metricValue}>
                      {isCashierPrivacy ? '••••••••' : `Rs. ${shiftFinancials.cashPayouts.toLocaleString()}`}
                    </Text>
                    <Text style={styles.metricLabel}>Expenses / Payouts</Text>
                  </View>
                </View>

                {/* EASY CLOSE SHIFT CARD */}
                <View style={styles.easyCloseCard}>
                  <View style={styles.closeHeader}>
                    <Ionicons name="lock-closed" size={22} color="#52171B" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.closeTitle}>End Shift & Cash Drawer Close • شفٹ بند کریں</Text>
                      <Text style={styles.closeSub}>
                        Draz mein mojood physical cash count kar ke enter karein aur shift seal karein.
                      </Text>
                    </View>
                  </View>

                  {/* Counted Cash Input */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={styles.fieldLabel}>Enter Actual Cash Counted in Drawer (گنتی شدہ رقم)</Text>
                    <TouchableOpacity
                      style={[styles.keypadToggleChip, showCountKeypad && styles.keypadToggleChipActive]}
                      onPress={() => setShowCountKeypad(!showCountKeypad)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="keypad" size={13} color={showCountKeypad ? '#52171B' : '#64748B'} />
                      <Text style={[styles.keypadToggleChipText, showCountKeypad && styles.keypadToggleChipTextActive]}>
                        {showCountKeypad ? 'Touch Keypad (آن)' : 'Touch Keypad'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.countInputRow}>
                    <View style={[styles.countInputWrap, isCashierPrivacy && { flex: 1 }]}>
                      <Text style={styles.floatCurrencyPrefix}>Rs.</Text>
                      <TextInput
                        style={styles.countTextInput}
                        value={countedCashInput}
                        onChangeText={setCountedCashInput}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    {/* Exact Match Button - STRICTLY HIDDEN FOR CASHIER PRIVACY */}
                    {!isCashierPrivacy && (
                      <TouchableOpacity
                        style={styles.matchBtn}
                        onPress={() => setCountedCashInput(String(shiftFinancials.expectedCash))}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="flash" size={14} color="#D5A943" />
                        <Text style={styles.matchBtnText}>Exact Match (Rs. {shiftFinancials.expectedCash.toLocaleString()})</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Responsive Non-Blocking Touch Number Keypad */}
                  {showCountKeypad && (
                    <TouchNumericKeypad
                      value={countedCashInput}
                      onChangeText={setCountedCashInput}
                      quickAmounts={[500, 1000, 5000, 10000]}
                      exactAmount={!isCashierPrivacy ? shiftFinancials.expectedCash : undefined}
                      style={{ marginTop: 8, marginBottom: 8 }}
                    />
                  )}

                  {/* Realtime Difference Indicator (ADMIN/AUDITOR ONLY - strictly hidden from cashier to prevent reverse calculation) */}
                  {!isCashierPrivacy && difference !== null && (
                    <View
                      style={[
                        styles.diffBanner,
                        difference === 0 ? styles.diffBalanced : difference < 0 ? styles.diffShort : styles.diffOver,
                      ]}
                    >
                      <Ionicons
                        name={difference === 0 ? 'checkmark-circle' : difference < 0 ? 'warning' : 'information-circle'}
                        size={20}
                        color={difference === 0 ? '#059669' : difference < 0 ? '#DC2626' : '#2563EB'}
                      />
                      <Text
                        style={[
                          styles.diffText,
                          { color: difference === 0 ? '#059669' : difference < 0 ? '#DC2626' : '#2563EB' },
                        ]}
                      >
                        {difference === 0
                          ? 'Cash is 100% Balanced! (بیلنس برابر ہے)'
                          : difference < 0
                          ? `Cash Shortage: -Rs. ${Math.abs(difference).toLocaleString()} (کمی ہے)`
                          : `Cash Extra: +Rs. ${difference.toLocaleString()} (اضافی ہے)`}
                      </Text>
                    </View>
                  )}

                  {/* Cashier Blind Privacy Reassurance Notice */}
                  {isCashierPrivacy && (
                    <View style={styles.cashierPrivacyNotice}>
                      <Ionicons name="shield-checkmark" size={16} color="#059669" />
                      <Text style={styles.cashierPrivacyNoticeText}>
                        Blind Cash Count Active: Physical draz ginti darj karein. System shift seal kar ke secure audit record banaye ga.
                      </Text>
                    </View>
                  )}

                  {/* Optional Note Denominations Accordion */}
                  <TouchableOpacity
                    style={styles.denomToggleBtn}
                    onPress={() => setShowDenominations(!showDenominations)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={showDenominations ? 'chevron-up-circle' : 'calculator-outline'}
                      size={16}
                      color="#52171B"
                    />
                    <Text style={styles.denomToggleText}>
                      {showDenominations
                        ? 'Hide Note Calculator (نوٹوں کی تفصیل بند کریں)'
                        : 'Count by Notes (5000, 1000, 500 نوٹوں کی گنتی)'}
                    </Text>
                  </TouchableOpacity>

                  {showDenominations && (
                    <View style={styles.denomBox}>
                      <View style={styles.denomGridSmall}>
                        {[
                          { key: 'd5000', label: '5000', val: 5000, color: '#78350F' },
                          { key: 'd1000', label: '1000', val: 1000, color: '#1E3A8A' },
                          { key: 'd500', label: '500', val: 500, color: '#065F46' },
                          { key: 'd100', label: '100', val: 100, color: '#991B1B' },
                          { key: 'd50', label: '50', val: 50, color: '#6B21A8' },
                          { key: 'd20', label: '20', val: 20, color: '#C2410C' },
                          { key: 'd10', label: '10', val: 10, color: '#15803D' },
                          { key: 'coins', label: 'Coins', val: 1, color: '#64748B' },
                        ].map((item) => (
                          <View key={item.key} style={styles.denomItemSmall}>
                            <View style={[styles.miniBadge, { backgroundColor: item.color }]}>
                              <Text style={styles.miniBadgeText}>₨. {item.label}</Text>
                            </View>
                            <TextInput
                              style={styles.miniDenomInput}
                              value={denominations[item.key as keyof CashDenominations] ? String(denominations[item.key as keyof CashDenominations]) : ''}
                              onChangeText={(t) => handleUpdateDenomination(item.key as keyof CashDenominations, t)}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor="#94A3B8"
                            />
                          </View>
                        ))}
                      </View>
                      <Text style={styles.denomCalcSum}>
                        Total from Notes: Rs. {calculatedDenomTotal.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {/* Handover Remarks */}
                  <TextInput
                    style={styles.notesInput}
                    value={cashierNotes}
                    onChangeText={setCashierNotes}
                    placeholder="Handover Notes / ریمارکس (Optional, e.g. Keys handed to manager...)"
                    placeholderTextColor="#94A3B8"
                  />

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[styles.bigCloseBtn, (!countedCashInput.trim() || countedNum <= 0) && styles.bigCloseBtnDisabled]}
                    onPress={handleCloseShift}
                    disabled={!countedCashInput.trim() || countedNum <= 0}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                    <Text style={styles.bigCloseBtnText}>
                      CLOSE SHIFT & PRINT Z-REPORT  •  شفٹ بند کریں
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* ======================================================== */}
        {/* TAB 2: SHIFT AUDIT HISTORY                               */}
        {/* ======================================================== */}
        {activeTab === 'history' && (
          <View style={{ gap: 12 }}>
            {/* Search Input */}
            <View style={styles.historySearchWrap}>
              <Ionicons name="search" size={17} color="#64748B" />
              <TextInput
                style={styles.historySearchInput}
                value={historySearch}
                onChangeText={setHistorySearch}
                placeholder="Search shifts by ID, Cashier or Counter..."
                placeholderTextColor="#94A3B8"
              />
              {historySearch.length > 0 && (
                <TouchableOpacity onPress={() => setHistorySearch('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {filteredShifts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyCardText}>No past shift records found.</Text>
              </View>
            ) : (
              filteredShifts.map((s) => {
                const isClosed = s.status === 'closed' || s.status === 'audited';
                const variance = s.cashVariance ?? 0;
                const isBalanced = variance === 0 && isClosed;
                const isShortage = variance < 0;

                return (
                  <View key={s.id} style={styles.historyItemCard}>
                    <View style={styles.historyItemTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.historyShiftId}>{s.id}</Text>
                          <View
                            style={[
                              styles.historyStatusPill,
                              s.status === 'open'
                                ? styles.statusOpen
                                : isBalanced
                                ? styles.statusBalanced
                                : isShortage
                                ? styles.statusShort
                                : styles.statusOver,
                            ]}
                          >
                            <Text
                              style={[
                                styles.historyStatusText,
                                s.status === 'open'
                                  ? { color: '#059669' }
                                  : isBalanced
                                  ? { color: '#059669' }
                                  : isShortage
                                  ? { color: '#DC2626' }
                                  : { color: '#2563EB' },
                              ]}
                            >
                              {s.status === 'open'
                                ? '● LIVE ACTIVE'
                                : isBalanced
                                ? 'BALANCED (0)'
                                : isShortage
                                ? `SHORT (-Rs. ${Math.abs(variance).toLocaleString()})`
                                : `OVER (+Rs. ${variance.toLocaleString()})`}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.historyMeta}>
                          {s.registerId} • Cashier: {s.cashierName} • {new Date(s.openedAt).toLocaleDateString()}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.viewSlipBtn}
                        onPress={() => openReport('Z-Report', s)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="document-text" size={14} color="#52171B" />
                        <Text style={styles.viewSlipBtnText}>Z-Report</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Financial Row */}
                    <View style={styles.historyFinRow}>
                      <View style={styles.historyFinItem}>
                        <Text style={styles.finSmallLabel}>Opening Float</Text>
                        <Text style={styles.finSmallVal}>Rs. {s.openingFloat.toLocaleString()}</Text>
                      </View>
                      <View style={styles.historyFinItem}>
                        <Text style={styles.finSmallLabel}>Cash Sales</Text>
                        <Text style={[styles.finSmallVal, { color: '#059669' }]}>
                          +Rs. {(s.systemCashSales || 0).toLocaleString()}
                        </Text>
                      </View>
                      <View style={styles.historyFinItem}>
                        <Text style={styles.finSmallLabel}>Drawer Cash</Text>
                        <Text style={[styles.finSmallVal, { fontWeight: '800' }]}>
                          Rs. {(s.actualCountedCash ?? s.expectedCashInDrawer ?? 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ======================================================== */}
      {/* THERMAL Z-REPORT / X-REPORT MODAL                        */}
      {/* ======================================================== */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.receiptPaper}>
            {/* Header */}
            <View style={styles.receiptHeader}>
              <Text style={styles.receiptBrand}>SULTAN RESTAURANT</Text>
              <Text style={styles.receiptTagline}>شاہی دسترخوان • SMART POS</Text>
              <Text style={styles.receiptReportType}>{reportModalType.toUpperCase()} SLIP</Text>
            </View>

            <View style={styles.receiptDashed} />

            {/* Meta */}
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Shift Reference:</Text>
              <Text style={styles.receiptVal}>{selectedShiftForDetail?.id || activeShift?.id}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Register Counter:</Text>
              <Text style={styles.receiptVal}>{selectedShiftForDetail?.registerId || activeShift?.registerId}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Cashier on Duty:</Text>
              <Text style={styles.receiptVal}>{selectedShiftForDetail?.cashierName || activeShift?.cashierName}</Text>
            </View>

            <View style={styles.receiptDashed} />

            {/* Breakdown */}
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Opening Cash Float:</Text>
              <Text style={styles.receiptVal}>
                Rs. {(selectedShiftForDetail?.openingFloat ?? activeShift?.openingFloat ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Cash Sales Revenue:</Text>
              <Text style={[styles.receiptVal, { color: '#059669', fontWeight: '700' }]}>
                Rs. {((selectedShiftForDetail ? selectedShiftForDetail.systemCashSales : shiftFinancials.cashSales) || 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Card / Digital Sales:</Text>
              <Text style={styles.receiptVal}>
                Rs. {((selectedShiftForDetail ? (selectedShiftForDetail.systemCardSales || 0) + (selectedShiftForDetail.systemOnlineSales || 0) : shiftFinancials.cardSales + shiftFinancials.onlineSales) || 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Cash Expenses Payout:</Text>
              <Text style={[styles.receiptVal, { color: '#DC2626' }]}>
                -Rs. {((selectedShiftForDetail ? selectedShiftForDetail.cashPayouts : shiftFinancials.cashPayouts) || 0).toLocaleString()}
              </Text>
            </View>

            <View style={styles.receiptDashed} />

            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { fontWeight: '800' }]}>Expected Cash in Drawer:</Text>
              <Text style={[styles.receiptVal, { fontWeight: '800' }]}>
                Rs. {((selectedShiftForDetail ? selectedShiftForDetail.expectedCashInDrawer : shiftFinancials.expectedCash) || 0).toLocaleString()}
              </Text>
            </View>

            {selectedShiftForDetail?.actualCountedCash !== undefined && (
              <>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { fontWeight: '800', color: '#52171B' }]}>
                    Counted Physical Cash:
                  </Text>
                  <Text style={[styles.receiptVal, { fontWeight: '800', color: '#52171B' }]}>
                    Rs. {selectedShiftForDetail.actualCountedCash.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { fontWeight: '900' }]}>Reconciliation Variance:</Text>
                  <Text
                    style={[
                      styles.receiptVal,
                      {
                        fontWeight: '900',
                        color:
                          (selectedShiftForDetail.cashVariance || 0) === 0
                            ? '#059669'
                            : (selectedShiftForDetail.cashVariance || 0) > 0
                            ? '#2563EB'
                            : '#DC2626',
                      },
                    ]}
                  >
                    {(selectedShiftForDetail.cashVariance || 0) === 0
                      ? 'BALANCED (0)'
                      : (selectedShiftForDetail.cashVariance || 0) > 0
                      ? `+ Rs. ${selectedShiftForDetail.cashVariance?.toLocaleString()} (Over)`
                      : `- Rs. ${Math.abs(selectedShiftForDetail.cashVariance || 0).toLocaleString()} (Short)`}
                  </Text>
                </View>
              </>
            )}

            <View style={styles.receiptDashed} />

            {/* Actions */}
            <View style={styles.receiptActions}>
              <TouchableOpacity
                style={styles.receiptCloseBtn}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={styles.receiptCloseBtnText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.receiptPrintBtn}
                onPress={handlePrint}
              >
                <Ionicons name="print" size={16} color="#FFFFFF" />
                <Text style={styles.receiptPrintBtnText}>Print Thermal Slip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  keypadToggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  keypadToggleChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  keypadToggleChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  keypadToggleChipTextActive: {
    color: '#92400E',
  },
  privacyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  privacyToggleBtnActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  privacyToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  cashierPrivacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 8,
  },
  cashierPrivacyNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    lineHeight: 17,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  posBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D5A943',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  posBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#24050A',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 16,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#52171B',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#52171B',
    fontWeight: '800',
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },

  /* EASY START CARD */
  easyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 14,
  },
  cardHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#52171B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: -4,
  },
  quickTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickTypeBtnActive: {
    backgroundColor: '#52171B',
    borderColor: '#52171B',
  },
  quickTypeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  quickTypeBtnTextActive: {
    color: '#FFFFFF',
  },
  staffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  staffChipActive: {
    backgroundColor: '#52171B',
    borderColor: '#52171B',
  },
  staffChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  staffChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  floatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  floatCurrencyPrefix: {
    fontSize: 18,
    fontWeight: '800',
    color: '#52171B',
    marginRight: 6,
  },
  floatTextInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 10,
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAmtBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(213, 169, 67, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
  },
  quickAmtBtnActive: {
    backgroundColor: '#D5A943',
    borderColor: '#D5A943',
  },
  quickAmtBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#52171B',
  },
  quickAmtBtnTextActive: {
    color: '#24050A',
  },
  bigStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 6,
  },
  bigStartBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* ACTIVE HERO CARD */
  heroShiftCard: {
    backgroundColor: '#24050A',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.35)',
    gap: 12,
  },
  heroShiftTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroShiftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  heroShiftBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroShiftTiming: {
    color: '#F3D179',
    fontSize: 12,
  },
  heroShiftMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroLabel: {
    color: '#F3D179',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroExpectedAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 2,
  },
  heroFormulaText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    marginTop: 4,
  },
  heroReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(213, 169, 67, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(213, 169, 67, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  heroReportBtnText: {
    color: '#F3D179',
    fontSize: 12,
    fontWeight: '700',
  },

  /* METRICS GRID */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'flex-start',
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },

  /* EASY CLOSE CARD */
  easyCloseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  closeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  closeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  countInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  countInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  countTextInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    paddingVertical: 10,
  },
  matchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#52171B',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
  },
  matchBtnText: {
    color: '#F3D179',
    fontSize: 12,
    fontWeight: '700',
  },
  diffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  diffBalanced: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  diffShort: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  diffOver: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  diffText: {
    fontSize: 13,
    fontWeight: '700',
  },
  denomToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  denomToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52171B',
  },
  denomBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  denomGridSmall: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  denomItemSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '48%',
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  miniBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  miniDenomInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    fontWeight: '700',
  },
  denomCalcSum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
  },
  bigCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#52171B',
    paddingVertical: 14,
    borderRadius: 10,
  },
  bigCloseBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  bigCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* HISTORY TAB */
  historySearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  historySearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyCardText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  historyItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  historyItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  historyShiftId: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  historyStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusOpen: {
    backgroundColor: '#ECFDF5',
  },
  statusBalanced: {
    backgroundColor: '#ECFDF5',
  },
  statusShort: {
    backgroundColor: '#FEF2F2',
  },
  statusOver: {
    backgroundColor: '#EFF6FF',
  },
  historyStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  historyMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  viewSlipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(82, 23, 27, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewSlipBtnText: {
    color: '#52171B',
    fontSize: 11,
    fontWeight: '800',
  },
  historyFinRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
  },
  historyFinItem: {
    flex: 1,
  },
  finSmallLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  finSmallVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },

  /* RECEIPT MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  receiptPaper: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    gap: 8,
  },
  receiptHeader: {
    alignItems: 'center',
    gap: 2,
  },
  receiptBrand: {
    fontSize: 16,
    fontWeight: '900',
    color: '#52171B',
    letterSpacing: 1,
  },
  receiptTagline: {
    fontSize: 11,
    color: '#64748B',
  },
  receiptReportType: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D5A943',
    backgroundColor: '#24050A',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 6,
  },
  receiptDashed: {
    height: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginVertical: 4,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 12,
    color: '#475569',
  },
  receiptVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  receiptActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  receiptCloseBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  receiptCloseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  receiptPrintBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#52171B',
  },
  receiptPrintBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
