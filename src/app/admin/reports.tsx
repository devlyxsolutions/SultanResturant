import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore } from '../../store/restaurantStore';
import { useOpsStore } from '../../store/opsStore';
import { usePlaylandStore } from '../../store/playlandStore';
import { useKitchenStore } from '../../store/kitchenStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { money, formatDay, startOfDay, dayKey } from '../../utils/format';
import {
  AnimatedReveal,
  AnimatedCounter,
  MetricGaugeRing,
  SvgDonutChart,
  SvgVerticalBarChart,
  SvgHourlyVelocityChart,
  SvgRevenueTrendChart,
  HorizontalRankedBars,
  PnLFlowWaterfallChart,
  DailyTrendPoint,
} from '../../components/reports/FinancialCharts';
import {
  downloadExecutivePdf,
  openPrintableExecutivePdf,
  DEFAULT_PDF_OPTIONS,
  PdfExportOptions,
  FinancialReportPdfPayload,
} from '../../utils/financialPdfExport';
import { useRolePermissions } from '../../store/roleStore';
import PermissionDeniedScreen from '../../components/PermissionDeniedScreen';

const LIGHT = {
  bg: '#F4F6F9',
  surface: '#FFFFFF',
  cardBg: '#FFFFFF',
  cardBorder: '#E2E8F0',
  burgundy: '#52171B',
  burgundyDark: '#3A0F12',
  burgundySoft: 'rgba(82, 23, 27, 0.08)',
  gold: '#B48214',
  goldLight: '#D4AF37',
  goldSoft: '#FEF3C7',
  goldBorder: '#FDE68A',
  ink: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  emerald: '#059669',
  emeraldSoft: '#ECFDF5',
  emeraldBorder: '#A7F3D0',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A',
  rose: '#E11D48',
  roseDark: '#BE123C',
  roseSoft: '#FFF1F2',
  roseBorder: '#FECDD3',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  blueBorder: '#BFDBFE',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
  purpleBorder: '#DDD6FE',
};

type ReportTab = 'visuals' | 'pnl' | 'channels' | 'kitchen' | 'cashflow' | 'tax' | 'menu' | 'shrinkage';
type TimeFilter = 'today' | 'yesterday' | 'week' | 'month' | 'all';

interface PdfPreset {
  id: string;
  label: string;
  desc: string;
  icon: string;
  options: PdfExportOptions;
}

const PDF_PRESETS: PdfPreset[] = [
  {
    id: 'full',
    label: 'Full Executive Audit Pack',
    desc: 'All charts, P&L, cash drawer, kitchen yield, top dishes & invoice appendix',
    icon: 'ribbon-outline',
    options: { ...DEFAULT_PDF_OPTIONS, presetName: 'Full Executive Financial Audit Pack' },
  },
  {
    id: 'cfo',
    label: 'CFO P&L & Visual Deck',
    desc: 'Boardroom summary: KPIs, vector charts, formal P&L & channels',
    icon: 'stats-chart-outline',
    options: {
      presetName: 'CFO P&L & Executive Charts Summary',
      includeCharts: true,
      includePnL: true,
      includeChannelsAndCash: true,
      includeTaxAndDiscounts: true,
      includeTopDishes: true,
      includeKitchenAudit: false,
      includeInvoiceLedger: false,
      includeSignatures: true,
    },
  },
  {
    id: 'kitchen',
    label: 'Kitchen Yield & Wastage Audit',
    desc: 'Store issued vs cooked vs returned reconciliation & top dishes',
    icon: 'flame-outline',
    options: {
      presetName: 'Kitchen Production & Wastage Audit Report',
      includeCharts: true,
      includePnL: false,
      includeChannelsAndCash: false,
      includeTaxAndDiscounts: false,
      includeTopDishes: true,
      includeKitchenAudit: true,
      includeInvoiceLedger: false,
      includeSignatures: true,
    },
  },
  {
    id: 'tax',
    label: 'GST & Invoices Ledger',
    desc: 'FBR / PRA tax compliance breakdown & itemized settled invoice ledger',
    icon: 'receipt-outline',
    options: {
      presetName: 'GST Compliance & Settled Invoices Ledger',
      includeCharts: false,
      includePnL: true,
      includeChannelsAndCash: false,
      includeTaxAndDiscounts: true,
      includeTopDishes: false,
      includeKitchenAudit: false,
      includeInvoiceLedger: true,
      includeSignatures: true,
    },
  },
];

function pctOf(part: number, whole: number): string {
  if (!whole || !Number.isFinite(whole)) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function calcDeltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || Math.abs(previous) < 0.01) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function shortDayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function SectionHeading({
  step,
  title,
  subtitle,
  rightSlot,
}: {
  step: string;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeadingRow}>
      <View style={styles.sectionStepPill}>
        <Text style={styles.sectionStepText}>{step}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionHeadingTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionHeadingSub}>{subtitle}</Text> : null}
      </View>
      {rightSlot}
    </View>
  );
}

function DeltaPill({ delta, invert = false }: { delta: number | null; invert?: boolean }) {
  if (delta === null || !Number.isFinite(delta)) return null;
  const isPositive = delta >= 0;
  const isGood = invert ? !isPositive : isPositive;
  return (
    <View
      style={[
        styles.deltaPill,
        {
          backgroundColor: isGood ? LIGHT.emeraldSoft : LIGHT.roseSoft,
          borderColor: isGood ? LIGHT.emeraldBorder : LIGHT.roseBorder,
        },
      ]}
    >
      <Text style={[styles.deltaPillText, { color: isGood ? '#047857' : LIGHT.roseDark }]}>
        {isPositive ? '+' : ''}
        {delta.toFixed(1)}% {isPositive ? '▲' : '▼'}
      </Text>
    </View>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { can } = useRolePermissions();

  // Stores
  const invoices = useRestaurantStore((s) => s.invoices || []);
  const expenses = useOpsStore((s) => s.expenses || []);
  const purchaseOrders = useOpsStore((s) => s.purchaseOrders || []);
  const supplierPayments = useOpsStore((s) => s.supplierPayments || []);
  const damageRecords = useOpsStore((s) => s.damageRecords || []);
  const assets = useOpsStore((s) => s.assets || []);
  const playlandTickets = usePlaylandStore((s) => s.tickets || []);
  const kitchenSessions = useKitchenStore((s) => s.kitchenSessions || []);
  const kitchenManualUsage = useKitchenStore((s) => s.kitchenManualUsage || []);
  const submitClosing = useKitchenStore((s) => s.submitClosing);
  const settings = useSettingsStore((s) => s.settings);
  const user = useAuthStore((s) => s.user);

  // UI State
  const [activeTab, setActiveTab] = useState<ReportTab>('visuals');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('full');
  const [pdfOptions, setPdfOptions] = useState<PdfExportOptions>({ ...DEFAULT_PDF_OPTIONS });
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportStatusBanner, setExportStatusBanner] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);

  const [closingReturnModalOpen, setClosingReturnModalOpen] = useState(false);
  const [closingReturnCounts, setClosingReturnCounts] = useState<Record<string, string>>({});
  const [closingReturnSelectedSessionId, setClosingReturnSelectedSessionId] = useState<string>('');

  // Time Window Boundaries (+ Equivalent Previous Window for Delta Comparisons)
  const timeWindow = useMemo(() => {
    const now = nowTs;
    const todayStart = startOfDay(now);
    const dayMs = 86400000;

    switch (timeFilter) {
      case 'today':
        return {
          start: todayStart,
          end: now,
          prevStart: todayStart - dayMs,
          prevEnd: todayStart,
          prevLabel: 'vs yesterday',
          daysCount: 1,
          label: "Today's Financial Audit",
          shortRange: formatDay(todayStart),
        };
      case 'yesterday':
        return {
          start: todayStart - dayMs,
          end: todayStart,
          prevStart: todayStart - 2 * dayMs,
          prevEnd: todayStart - dayMs,
          prevLabel: 'vs prior day',
          daysCount: 1,
          label: "Yesterday's Audit",
          shortRange: formatDay(todayStart - dayMs),
        };
      case 'week':
        return {
          start: todayStart - 6 * dayMs,
          end: now,
          prevStart: todayStart - 13 * dayMs,
          prevEnd: todayStart - 6 * dayMs,
          prevLabel: 'vs prior 7d',
          daysCount: 7,
          label: 'Past 7 Days Audit',
          shortRange: `${shortDayLabel(todayStart - 6 * dayMs)} – ${shortDayLabel(now)}`,
        };
      case 'month':
        return {
          start: todayStart - 29 * dayMs,
          end: now,
          prevStart: todayStart - 59 * dayMs,
          prevEnd: todayStart - 29 * dayMs,
          prevLabel: 'vs prior 30d',
          daysCount: 30,
          label: 'Past 30 Days Audit',
          shortRange: `${shortDayLabel(todayStart - 29 * dayMs)} – ${shortDayLabel(now)}`,
        };
      case 'all':
      default:
        return {
          start: 0,
          end: now,
          prevStart: null as number | null,
          prevEnd: null as number | null,
          prevLabel: 'all-time ledger',
          daysCount: 0,
          label: 'All-Time Financial Ledger',
          shortRange: `Up to ${shortDayLabel(now)}`,
        };
    }
  }, [timeFilter, nowTs]);

  // Micro-Level Financial Computation
  const financialData = useMemo(() => {
    const { start, end, prevStart, prevEnd, daysCount } = timeWindow;
    const dayMs = 86400000;

    // 1. Restaurant Invoices
    const validInvoices = invoices.filter(
      (inv) =>
        inv.status !== 'voided' &&
        (inv.timeSettled || inv.timePlaced) >= start &&
        (inv.timeSettled || inv.timePlaced) <= end
    );

    const voidedInvoices = invoices.filter(
      (inv) =>
        inv.status === 'voided' &&
        (inv.voidedAt || inv.timePlaced) >= start &&
        (inv.voidedAt || inv.timePlaced) <= end
    );

    let grossFoodSales = 0;
    let totalDiscountGiven = 0;
    let totalTaxCollected = 0;
    let netRestaurantRevenue = 0;

    let dineInSales = 0;
    let dineInOrders = 0;
    let takeawaySales = 0;
    let takeawayOrders = 0;
    let deliverySales = 0;
    let deliveryOrders = 0;

    let cashFromRestaurant = 0;
    let cardFromRestaurant = 0;
    let onlineFromRestaurant = 0;

    const hourlySales: Record<number, { count: number; revenue: number }> = {};
    for (let h = 0; h < 24; h++) hourlySales[h] = { count: 0, revenue: 0 };

    const categoryMap: Record<string, { qty: number; revenue: number }> = {};
    const itemMap: Record<string, { id: string; name: string; qty: number; revenue: number }> = {};

    // Daily aggregator for multi-day spline trend
    const dailyMap: Record<string, { dateKey: string; label: string; revenue: number; opex: number; orders: number }> =
      {};

    const ensureDay = (ts: number) => {
      const k = dayKey(ts);
      if (!dailyMap[k]) {
        dailyMap[k] = {
          dateKey: k,
          label: shortDayLabel(ts),
          revenue: 0,
          opex: 0,
          orders: 0,
        };
      }
      return dailyMap[k];
    };

    if (daysCount > 1 && start > 0) {
      for (let i = 0; i < daysCount; i++) {
        ensureDay(start + i * dayMs);
      }
    }

    validInvoices.forEach((inv) => {
      grossFoodSales += inv.subTotal || inv.total || 0;
      totalDiscountGiven += inv.discount || 0;
      totalTaxCollected += inv.tax || 0;
      netRestaurantRevenue += inv.total || 0;

      // Channel breakdown
      if (inv.orderType === 'dine-in') {
        dineInSales += inv.total || 0;
        dineInOrders++;
      } else if (inv.orderType === 'takeaway') {
        takeawaySales += inv.total || 0;
        takeawayOrders++;
      } else if (inv.orderType === 'delivery') {
        deliverySales += inv.total || 0;
        deliveryOrders++;
      }

      // Payments breakdown
      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach((p) => {
          if (p.type === 'cash') cashFromRestaurant += p.amount;
          else if (p.type === 'card') cardFromRestaurant += p.amount;
          else if (p.type === 'online') onlineFromRestaurant += p.amount;
        });
      } else {
        cashFromRestaurant += inv.total || 0;
      }

      // Hourly & daily analysis
      const invTime = inv.timeSettled || inv.timePlaced;
      if (invTime) {
        const hour = new Date(invTime).getHours();
        if (hourlySales[hour]) {
          hourlySales[hour].count += 1;
          hourlySales[hour].revenue += inv.total || 0;
        }
        const dayBucket = ensureDay(invTime);
        dayBucket.revenue += inv.total || 0;
        dayBucket.orders += 1;
      }

      // Item & Category breakdown
      if (inv.items) {
        inv.items.forEach((it) => {
          const itemRev = (it.price || 0) * (it.qty || 1);
          if (!itemMap[it.name]) {
            itemMap[it.name] = { id: it.id, name: it.name, qty: 0, revenue: 0 };
          }
          itemMap[it.name].qty += it.qty || 1;
          itemMap[it.name].revenue += itemRev;

          const catName = it.station === 'juice' ? 'Juice Bar & Drinks' : 'Main Kitchen Food';
          if (!categoryMap[catName]) categoryMap[catName] = { qty: 0, revenue: 0 };
          categoryMap[catName].qty += it.qty || 1;
          categoryMap[catName].revenue += itemRev;
        });
      }
    });

    // 2. Playland / Amusement Revenue
    const validPlayland = playlandTickets.filter(
      (t) => t.issuedAt >= start && t.issuedAt <= end && t.status !== 'refunded'
    );
    let playlandRevenue = 0;
    let playlandCash = 0;
    let playlandCard = 0;
    let playlandOnline = 0;

    validPlayland.forEach((t) => {
      playlandRevenue += t.totalAmount || 0;
      if (t.paymentMethod === 'cash') playlandCash += t.totalAmount || 0;
      else if (t.paymentMethod === 'card') playlandCard += t.totalAmount || 0;
      else playlandOnline += t.totalAmount || 0;

      if (t.issuedAt) {
        const dayBucket = ensureDay(t.issuedAt);
        dayBucket.revenue += t.totalAmount || 0;
        dayBucket.orders += 1;
      }
    });

    // 3. Combined Total Topline Gross Revenue
    const totalGrossRevenue = netRestaurantRevenue + playlandRevenue;
    const totalOrders = validInvoices.length + validPlayland.length;
    const averageTicket = validInvoices.length > 0 ? netRestaurantRevenue / validInvoices.length : 0;

    // 4. Procurement & Direct Costs (COGS: Raw Material Inflows)
    const validPOs = purchaseOrders.filter(
      (po) => po.orderDate >= start && po.orderDate <= end && po.status !== 'cancelled'
    );
    const totalProcurementCOGS = validPOs.reduce((sum, po) => sum + (po.totalAmount || 0), 0);
    const estimatedCOGS = totalProcurementCOGS > 0 ? totalProcurementCOGS : grossFoodSales * 0.35;
    const grossOperatingProfit = totalGrossRevenue - estimatedCOGS;
    const grossMarginPercent = totalGrossRevenue > 0 ? (grossOperatingProfit / totalGrossRevenue) * 100 : 0;

    // 5. Operating Expenses (Opex)
    const validExpenses = expenses.filter((e) => e.at >= start && e.at <= end);
    let totalOpex = 0;
    let cashOpex = 0;
    let onlineOpex = 0;
    const expenseCatMap: Record<string, number> = {};

    validExpenses.forEach((e) => {
      totalOpex += e.amount || 0;
      if (e.method === 'cash') cashOpex += e.amount || 0;
      else onlineOpex += e.amount || 0;

      expenseCatMap[e.category] = (expenseCatMap[e.category] || 0) + (e.amount || 0);
      if (e.at) {
        ensureDay(e.at).opex += e.amount || 0;
      }
    });

    // 6. Supplier Cash Payments in Period
    const validSupplierPayments = supplierPayments.filter((sp) => sp.paidAt >= start && sp.paidAt <= end);
    let totalSupplierPayments = 0;
    let cashSupplierPayments = 0;
    validSupplierPayments.forEach((sp) => {
      totalSupplierPayments += sp.amount || 0;
      if (sp.method === 'cash') cashSupplierPayments += sp.amount || 0;
    });

    // 7. Damage & Shrinkage (Breakage Losses)
    const validDamages = damageRecords.filter((d) => d.incidentDate >= start && d.incidentDate <= end);
    let totalBreakageLoss = 0;
    let totalDamageRecovered = 0;
    let netBreakageLoss = 0;
    const damageDeptMap: Record<string, number> = {};

    validDamages.forEach((d) => {
      totalBreakageLoss += d.totalLoss || 0;
      totalDamageRecovered += d.amountRecovered || 0;
      const net = d.netLoss !== undefined ? d.netLoss : d.totalLoss - (d.amountRecovered || 0);
      netBreakageLoss += net;
      const dept = (d.location || d.category || 'General').toUpperCase();
      damageDeptMap[dept] = (damageDeptMap[dept] || 0) + net;
    });

    const damageRecoveryRate = totalBreakageLoss > 0 ? (totalDamageRecovered / totalBreakageLoss) * 100 : 100;

    // 8. Asset Maintenance Costs
    let assetMaintenanceCosts = 0;
    assets.forEach((ast) => {
      if (ast.maintenanceLogs) {
        ast.maintenanceLogs.forEach((log) => {
          if (log.date >= start && log.date <= end) {
            assetMaintenanceCosts += log.cost || 0;
          }
        });
      }
    });

    // 9. Net Operating Profit (EBITDA)
    const netOperatingProfit = grossOperatingProfit - totalOpex - netBreakageLoss;
    const netProfitMargin = totalGrossRevenue > 0 ? (netOperatingProfit / totalGrossRevenue) * 100 : 0;
    const opexRatioPercent = totalGrossRevenue > 0 ? (totalOpex / totalGrossRevenue) * 100 : 0;

    // 10. Cash Flow / Cash Register Audit
    const totalCashInflow = cashFromRestaurant + playlandCash;
    const totalCashOutflow = cashOpex + cashSupplierPayments;
    const netCashFloat = totalCashInflow - totalCashOutflow;

    // 10B. Previous Period Comparison Deltas
    let revenueDeltaPct: number | null = null;
    let grossProfitDeltaPct: number | null = null;
    let opexDeltaPct: number | null = null;
    let netProfitDeltaPct: number | null = null;

    if (prevStart !== null && prevEnd !== null) {
      const prevInvs = invoices.filter(
        (inv) =>
          inv.status !== 'voided' &&
          (inv.timeSettled || inv.timePlaced) >= prevStart &&
          (inv.timeSettled || inv.timePlaced) < prevEnd
      );
      const prevFoodGross = prevInvs.reduce((s, i) => s + (i.subTotal || i.total || 0), 0);
      const prevFoodNet = prevInvs.reduce((s, i) => s + (i.total || 0), 0);
      const prevPlay = playlandTickets
        .filter((t) => t.issuedAt >= prevStart && t.issuedAt < prevEnd && t.status !== 'refunded')
        .reduce((s, t) => s + (t.totalAmount || 0), 0);
      const prevRev = prevFoodNet + prevPlay;

      const prevPo = purchaseOrders
        .filter((po) => po.orderDate >= prevStart && po.orderDate < prevEnd && po.status !== 'cancelled')
        .reduce((s, po) => s + (po.totalAmount || 0), 0);
      const prevCogs = prevPo > 0 ? prevPo : prevFoodGross * 0.35;
      const prevGrossProfit = prevRev - prevCogs;

      const prevOpex = expenses
        .filter((e) => e.at >= prevStart && e.at < prevEnd)
        .reduce((s, e) => s + (e.amount || 0), 0);
      const prevDamage = damageRecords
        .filter((d) => d.incidentDate >= prevStart && d.incidentDate < prevEnd)
        .reduce((s, d) => s + (d.netLoss !== undefined ? d.netLoss : d.totalLoss - (d.amountRecovered || 0)), 0);
      const prevNet = prevGrossProfit - prevOpex - prevDamage;

      revenueDeltaPct = calcDeltaPct(totalGrossRevenue, prevRev);
      grossProfitDeltaPct = calcDeltaPct(grossOperatingProfit, prevGrossProfit);
      opexDeltaPct = calcDeltaPct(totalOpex, prevOpex);
      netProfitDeltaPct = calcDeltaPct(netOperatingProfit, prevNet);
    }

    // Build chronological DailyTrendPoint[] series
    const dailySeries: DailyTrendPoint[] = Object.values(dailyMap)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(-45)
      .map((d) => ({
        ...d,
        netProfit: d.revenue - d.opex,
      }));

    // Sort Top Items
    const topDishes = Object.values(itemMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // 11. Kitchen Production, Shift Closing Return & Wastage Difference
    const cookedDishesMap: Record<
      string,
      {
        name: string;
        category: string;
        station: string;
        qty: number;
        price: number;
        totalRevenue: number;
      }
    > = {};

    let totalPortionsCooked = 0;
    let totalFoodTurnover = 0;

    validInvoices.forEach((inv) => {
      (inv.items || []).forEach((item) => {
        const itemQty = item.qty || 1;
        totalPortionsCooked += itemQty;
        const rev = (item.price || 0) * itemQty;
        totalFoodTurnover += rev;

        if (!cookedDishesMap[item.name]) {
          const n = item.name.toLowerCase();
          const station =
            item.station === 'juice' || n.includes('margarita') || n.includes('juice') || n.includes('shake')
              ? 'Juice Bar & Drinks'
              : n.includes('kebab') || n.includes('tikka') || n.includes('boti') || n.includes('bbq')
              ? 'Charcoal BBQ Station'
              : n.includes('biryani') || n.includes('rice') || n.includes('pulao')
              ? 'Biryani & Rice Counter'
              : n.includes('naan') || n.includes('roti') || n.includes('kulcha')
              ? 'Tandoor & Breads'
              : 'Handi & Karahi Line';

          cookedDishesMap[item.name] = {
            name: item.name,
            category: item.station === 'juice' ? 'Beverages' : 'Food',
            station,
            qty: 0,
            price: item.price || 0,
            totalRevenue: 0,
          };
        }
        cookedDishesMap[item.name].qty += itemQty;
        cookedDishesMap[item.name].totalRevenue += rev;
      });
    });

    const cookedDishesList = Object.values(cookedDishesMap).sort((a, b) => b.qty - a.qty);

    const stationCookingSummary: Record<string, { station: string; portions: number; revenue: number }> = {
      'Handi & Karahi Line': { station: 'Handi & Karahi Line', portions: 0, revenue: 0 },
      'Charcoal BBQ Station': { station: 'Charcoal BBQ Station', portions: 0, revenue: 0 },
      'Biryani & Rice Counter': { station: 'Biryani & Rice Counter', portions: 0, revenue: 0 },
      'Tandoor & Breads': { station: 'Tandoor & Breads', portions: 0, revenue: 0 },
      'Juice Bar & Drinks': { station: 'Juice Bar & Drinks', portions: 0, revenue: 0 },
    };

    cookedDishesList.forEach((dish) => {
      if (stationCookingSummary[dish.station]) {
        stationCookingSummary[dish.station].portions += dish.qty;
        stationCookingSummary[dish.station].revenue += dish.totalRevenue;
      } else {
        stationCookingSummary['Handi & Karahi Line'].portions += dish.qty;
        stationCookingSummary['Handi & Karahi Line'].revenue += dish.totalRevenue;
      }
    });

    let relevantSessions = kitchenSessions.filter(
      (s) => (s.issuedAt || s.createdAt) >= start && (s.issuedAt || s.createdAt) <= end
    );
    if (relevantSessions.length === 0) {
      relevantSessions = kitchenSessions;
    }

    type RawReconItem = {
      itemId: string;
      itemName: string;
      unit: string;
      category: string;
      costPerUnit: number;
      issued: number;
      cooked: number;
      returned: number;
      variance: number;
      wastageCost: number;
      wastagePct: number;
      status: 'optimal' | 'acceptable' | 'alert';
    };

    const reconMap: Record<string, RawReconItem> = {};

    relevantSessions.forEach((sess) => {
      sess.lines.forEach((l) => {
        const itemKey = l.itemId || l.itemName;
        if (!reconMap[itemKey]) {
          reconMap[itemKey] = {
            itemId: l.itemId,
            itemName: l.itemName,
            unit: l.unit || 'kg',
            category: l.category || 'Kitchen Provisions',
            costPerUnit: l.costPerUnit || 0,
            issued: 0,
            cooked: 0,
            returned: 0,
            variance: 0,
            wastageCost: 0,
            wastagePct: 0,
            status: 'optimal',
          };
        }
        const totalLineIssued = (l.issued || 0) + (l.topUp || 0) + (l.localPurchased || 0);
        reconMap[itemKey].issued += totalLineIssued;

        const lineReturned = l.returned !== undefined ? l.returned : 0;
        reconMap[itemKey].returned += lineReturned;

        const lineCooked =
          l.expectedAtClose !== undefined
            ? Math.max(0, totalLineIssued - l.expectedAtClose)
            : Math.max(0, totalLineIssued - lineReturned - (l.variance || 0));
        reconMap[itemKey].cooked += lineCooked;
      });
    });

    let totalStoreIssuedValue = 0;
    let totalCookedRawValue = 0;
    let totalReturnedToStoreValue = 0;
    let totalKitchenWastageCost = 0;

    const rawReconciliationList: RawReconItem[] = Object.values(reconMap)
      .map((item) => {
        const diff = Math.max(0, Math.round((item.issued - (item.cooked + item.returned)) * 100) / 100);
        const wastageCost = Math.round(diff * item.costPerUnit);
        const wastagePct = item.issued > 0 ? (diff / item.issued) * 100 : 0;

        let status: 'optimal' | 'acceptable' | 'alert' = 'optimal';
        if (wastagePct > 3.5) status = 'alert';
        else if (diff > 0) status = 'acceptable';

        totalStoreIssuedValue += item.issued * item.costPerUnit;
        totalCookedRawValue += item.cooked * item.costPerUnit;
        totalReturnedToStoreValue += item.returned * item.costPerUnit;
        totalKitchenWastageCost += wastageCost;

        return {
          ...item,
          variance: diff,
          wastageCost,
          wastagePct,
          status,
        };
      })
      .sort((a, b) => b.wastageCost - a.wastageCost);

    const wastageReasonsMap: Record<string, { reason: string; label: string; count: number; cost: number }> = {
      spoilage: { reason: 'spoilage', label: 'Fat Trimming & Bone Cut Waste', count: 0, cost: 0 },
      recook: { reason: 'recook', label: 'Overcooked, Scorched & Burnt', count: 0, cost: 0 },
      spill: { reason: 'spill', label: 'Counter Floor Drips & Spills', count: 0, cost: 0 },
      staff_meal: { reason: 'staff_meal', label: 'Staff Meal Allowances', count: 0, cost: 0 },
      other: { reason: 'other', label: 'General Kitchen Shrinkage', count: 0, cost: 0 },
    };

    kitchenManualUsage.forEach((mu) => {
      const rKey = mu.reason in wastageReasonsMap ? mu.reason : 'other';
      wastageReasonsMap[rKey].count++;
      const itemCost = reconMap[mu.itemId]?.costPerUnit || 500;
      wastageReasonsMap[rKey].cost += Math.abs(mu.delta) * itemCost;
    });

    const averageYieldRate =
      totalStoreIssuedValue > 0
        ? Math.min(100, Math.max(0, ((totalCookedRawValue + totalReturnedToStoreValue) / totalStoreIssuedValue) * 100))
        : 100;

    return {
      totalInvoicesCount: validInvoices.length,
      voidedInvoicesCount: voidedInvoices.length,
      totalOrders,
      averageTicket,
      grossFoodSales,
      totalDiscountGiven,
      totalTaxCollected,
      netRestaurantRevenue,
      playlandRevenue,
      totalGrossRevenue,
      estimatedCOGS,
      isEstimatedCOGS: totalProcurementCOGS === 0,
      totalProcurementCOGS,
      grossOperatingProfit,
      grossMarginPercent,
      totalOpex,
      cashOpex,
      onlineOpex,
      opexRatioPercent,
      expenseCatMap,
      netBreakageLoss,
      totalBreakageLoss,
      totalDamageRecovered,
      damageRecoveryRate,
      assetMaintenanceCosts,
      netOperatingProfit,
      netProfitMargin,
      // Period Deltas
      revenueDeltaPct,
      grossProfitDeltaPct,
      opexDeltaPct,
      netProfitDeltaPct,
      // Payment Channels
      cashTotal: cashFromRestaurant + playlandCash,
      cardTotal: cardFromRestaurant + playlandCard,
      onlineTotal: onlineFromRestaurant + playlandOnline,
      restaurantCash: cashFromRestaurant,
      playlandCash,
      cashSupplierPayments,
      totalSupplierPayments,
      // Order Channels
      dineInSales,
      dineInOrders,
      takeawaySales,
      takeawayOrders,
      deliverySales,
      deliveryOrders,
      playlandTicketsCount: validPlayland.length,
      // Cash Flow
      totalCashInflow,
      totalCashOutflow,
      netCashFloat,
      // Micro Stats & Trends
      topDishes,
      categoryMap,
      hourlySales,
      dailySeries,
      validInvoices,
      damageDeptMap,
      // Kitchen
      cookedDishesList,
      totalPortionsCooked,
      totalFoodTurnover,
      stationCookingSummary,
      rawReconciliationList,
      totalStoreIssuedValue,
      totalCookedRawValue,
      totalReturnedToStoreValue,
      totalKitchenWastageCost,
      averageYieldRate,
      wastageReasonsMap,
      relevantSessions,
    };
  }, [
    timeWindow,
    invoices,
    expenses,
    purchaseOrders,
    supplierPayments,
    damageRecords,
    assets,
    playlandTickets,
    kitchenSessions,
    kitchenManualUsage,
  ]);

  function alertMsg(title: string, msg: string) {
    if (Platform.OS === 'web') window.alert(`${title}\n${msg}`);
    else Alert.alert(title, msg);
  }

  const buildPdfPayload = (): FinancialReportPdfPayload => ({
    restaurantName: settings?.restaurantName || 'SULTAN RESTAURANT & RESORT',
    tagline: settings?.tagline || 'Royal Mughlai, BBQ & Family Playland',
    address: settings?.address || '',
    phone: settings?.phone || '',
    ntnOrTaxId: settings?.ntnOrTaxId || '',
    preparedBy: user?.name || 'Financial Controller',
    preparedRole: String(user?.role || 'Administrator').toUpperCase(),
    periodKey: timeFilter,
    periodLabel: timeWindow.label,
    periodStart: timeWindow.start,
    periodEnd: timeWindow.end,
    summary: {
      totalInvoicesCount: financialData.totalInvoicesCount,
      voidedInvoicesCount: financialData.voidedInvoicesCount,
      totalOrders: financialData.totalOrders,
      grossFoodSales: financialData.grossFoodSales,
      totalDiscountGiven: financialData.totalDiscountGiven,
      totalTaxCollected: financialData.totalTaxCollected,
      netRestaurantRevenue: financialData.netRestaurantRevenue,
      playlandRevenue: financialData.playlandRevenue,
      playlandTicketsCount: financialData.playlandTicketsCount,
      totalGrossRevenue: financialData.totalGrossRevenue,
      estimatedCOGS: financialData.estimatedCOGS,
      isEstimatedCOGS: financialData.isEstimatedCOGS,
      grossOperatingProfit: financialData.grossOperatingProfit,
      grossMarginPercent: financialData.grossMarginPercent,
      totalOpex: financialData.totalOpex,
      cashOpex: financialData.cashOpex,
      onlineOpex: financialData.onlineOpex,
      expenseCatMap: financialData.expenseCatMap,
      netBreakageLoss: financialData.netBreakageLoss,
      totalBreakageLoss: financialData.totalBreakageLoss,
      totalDamageRecovered: financialData.totalDamageRecovered,
      assetMaintenanceCosts: financialData.assetMaintenanceCosts,
      netOperatingProfit: financialData.netOperatingProfit,
      netProfitMargin: financialData.netProfitMargin,
      cashTotal: financialData.cashTotal,
      cardTotal: financialData.cardTotal,
      onlineTotal: financialData.onlineTotal,
      restaurantCash: financialData.restaurantCash,
      playlandCash: financialData.playlandCash,
      cashSupplierPayments: financialData.cashSupplierPayments,
      dineInSales: financialData.dineInSales,
      dineInOrders: financialData.dineInOrders,
      takeawaySales: financialData.takeawaySales,
      takeawayOrders: financialData.takeawayOrders,
      deliverySales: financialData.deliverySales,
      deliveryOrders: financialData.deliveryOrders,
      totalCashInflow: financialData.totalCashInflow,
      totalCashOutflow: financialData.totalCashOutflow,
      netCashFloat: financialData.netCashFloat,
      averageTicket: financialData.averageTicket,
      topDishes: financialData.topDishes.map((d) => ({ name: d.name, qty: d.qty, revenue: d.revenue })),
      rawReconciliationList: financialData.rawReconciliationList.map((r) => ({
        itemName: r.itemName,
        unit: r.unit,
        category: r.category,
        issued: r.issued,
        cooked: r.cooked,
        returned: r.returned,
        variance: r.variance,
        wastageCost: r.wastageCost,
        status: r.status,
      })),
      totalStoreIssuedValue: financialData.totalStoreIssuedValue,
      totalCookedRawValue: financialData.totalCookedRawValue,
      totalReturnedToStoreValue: financialData.totalReturnedToStoreValue,
      totalKitchenWastageCost: financialData.totalKitchenWastageCost,
      averageYieldRate: financialData.averageYieldRate,
      totalPortionsCooked: financialData.totalPortionsCooked,
      validInvoices: financialData.validInvoices.map((inv) => ({
        id: inv.id,
        timeSettled: inv.timeSettled,
        timePlaced: inv.timePlaced,
        orderType: inv.orderType,
        tableName: inv.tableName,
        server: inv.server,
        subTotal: inv.subTotal,
        discount: inv.discount,
        tax: inv.tax,
        total: inv.total,
        payments: inv.payments,
      })),
    },
  });

  const showExportToast = (type: 'success' | 'info', text: string) => {
    setExportStatusBanner({ type, text });
    setTimeout(() => {
      setExportStatusBanner((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  const handleDownloadPdf = async (overrideOptions?: PdfExportOptions) => {
    if (!can('canExportReports')) {
      alertMsg('Permission Required', 'Your role does not have permission to export financial reports.');
      return;
    }
    const opts = overrideOptions || pdfOptions;
    setIsExportingPdf(true);
    try {
      const result = await downloadExecutivePdf(buildPdfPayload(), opts);
      setIsPdfModalOpen(false);
      setIsPrintModalOpen(false);
      if (result.ok) {
        showExportToast(result.method === 'server-pdf' ? 'success' : 'info', result.message);
      } else {
        alertMsg('PDF Export Notice', result.message);
      }
    } catch (err: any) {
      alertMsg('PDF Export Error', err?.message || 'Unable to generate PDF document.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintPreviewPdf = (overrideOptions?: PdfExportOptions) => {
    if (!can('canExportReports')) {
      alertMsg('Permission Required', 'Your role does not have permission to print financial reports.');
      return;
    }
    const opts = overrideOptions || pdfOptions;
    const res = openPrintableExecutivePdf(buildPdfPayload(), opts);
    if (res.ok) {
      setIsPdfModalOpen(false);
      setIsPrintModalOpen(false);
      showExportToast('info', res.message);
    } else {
      alertMsg('Print Preview', res.message);
    }
  };

  const handleSelectPdfPreset = (preset: PdfPreset) => {
    setSelectedPresetId(preset.id);
    setPdfOptions({ ...preset.options });
  };

  const togglePdfSection = (key: keyof PdfExportOptions) => {
    setSelectedPresetId('custom');
    setPdfOptions((prev) => ({
      ...prev,
      presetName: 'Custom Executive Financial Audit Report',
      [key]: !prev[key],
    }));
  };

  const handleExportCSV = () => {
    if (!can('canExportReports')) {
      alertMsg('Permission Required', 'Your role does not have permission to export CSV ledgers.');
      return;
    }
    if (financialData.validInvoices.length === 0) {
      alertMsg('No Data', 'No transactions found in this time range to export.');
      return;
    }

    const headers =
      'Invoice ID,Time Settled,Order Type,Table/Counter,Server,SubTotal,Discount,Tax (GST),Total (PKR),Payment Breakdown\n';
    const rows = financialData.validInvoices
      .map(
        (inv) =>
          `"${inv.id}","${new Date(inv.timeSettled || inv.timePlaced).toLocaleString()}","${inv.orderType}","${
            inv.tableName || 'Takeaway'
          }","${inv.server || 'Staff'}","${inv.subTotal || inv.total}","${inv.discount || 0}","${inv.tax || 0}","${
            inv.total
          }","${(inv.payments || []).map((p) => `${p.type}: Rs.${p.amount}`).join(' | ')}"`
      )
      .join('\n');

    const csvContent = headers + rows;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Sultan_Financial_Ledger_${timeFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showExportToast('success', `Exported ${financialData.validInvoices.length} settled invoices to CSV.`);
    } else {
      Alert.alert('CSV Generated', `Exported ${financialData.validInvoices.length} transactions.`);
    }
  };

  const handleOpenClosingReturn = () => {
    const sess =
      kitchenSessions.find((s) => s.status === 'issued') ||
      kitchenSessions.find((s) => s.status === 'closed') ||
      kitchenSessions[0];
    if (sess) {
      setClosingReturnSelectedSessionId(sess.id);
      const initialCounts: Record<string, string> = {};
      sess.lines.forEach((l) => {
        initialCounts[l.itemId] = l.returned !== undefined ? String(l.returned) : '';
      });
      setClosingReturnCounts(initialCounts);
      setClosingReturnModalOpen(true);
    } else {
      alertMsg('No Kitchen Shift', 'No kitchen shift session found to reconcile.');
    }
  };

  const handleSaveClosingReturn = () => {
    if (!closingReturnSelectedSessionId) return;
    const numericCounts: Record<string, number> = {};
    Object.entries(closingReturnCounts).forEach(([itemId, valStr]) => {
      const num = parseFloat(valStr);
      if (!isNaN(num) && num >= 0) {
        numericCounts[itemId] = num;
      }
    });

    const res = submitClosing({
      sessionId: closingReturnSelectedSessionId,
      counts: numericCounts,
      cashReturned: 0,
      notes: 'Closing stock returned to store logged via Financial & Kitchen Audit Deck',
      by: user?.name || 'Head Chef / Manager',
    });

    if (res.ok) {
      alertMsg(
        'Reconciliation Saved',
        'Shift closing store return counts updated successfully. Difference and wastage recalculated!'
      );
      setClosingReturnModalOpen(false);
    } else {
      alertMsg('Reconciliation Note', res.error || 'Closing return submitted.');
      setClosingReturnModalOpen(false);
    }
  };

  if (!can('canAccessReports')) {
    return (
      <PermissionDeniedScreen
        moduleName="Financial Reports & Analytics"
        urduModuleName="مالیاتی رپورٹس اور تجزیات"
        requiredPermission="canAccessReports"
        backRoute="/admin/dashboard"
      />
    );
  }

  const canExport = can('canExportReports');
  const animTabKey = `${activeTab}-${timeFilter}`;
  const selectedPdfSectionCount = [
    pdfOptions.includeCharts,
    pdfOptions.includePnL,
    pdfOptions.includeChannelsAndCash,
    pdfOptions.includeTaxAndDiscounts,
    pdfOptions.includeTopDishes,
    pdfOptions.includeKitchenAudit,
    pdfOptions.includeInvoiceLedger,
    pdfOptions.includeSignatures,
  ].filter(Boolean).length;

  const pnlOnlyOptions: PdfExportOptions = {
    presetName: 'Formal Executive Profit & Loss Certificate',
    includeCharts: true,
    includePnL: true,
    includeChannelsAndCash: false,
    includeTaxAndDiscounts: false,
    includeTopDishes: false,
    includeKitchenAudit: false,
    includeInvoiceLedger: false,
    includeSignatures: true,
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* ----------------- EXECUTIVE ROYAL HEADER BAR ----------------- */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push('/admin/dashboard')}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={20} color={LIGHT.burgundy} />
          </TouchableOpacity>

          <View style={styles.brandCrest}>
            <Ionicons name="analytics" size={20} color="#FDE68A" />
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>Financial Intelligence & Audit</Text>
              <View style={styles.auditBadge}>
                <Text style={styles.auditBadgeText}>CFO AUDIT DECK</Text>
              </View>
            </View>
            <Text style={styles.headerSub} numberOfLines={1}>
              {settings?.restaurantName || 'Sultan Restaurant'} • {timeWindow.label} ({timeWindow.shortRange})
            </Text>
          </View>
        </View>

        {/* Header Actions */}
        {canExport && (
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.actionBtnOutline}
              onPress={() => setIsPrintModalOpen(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="document-text-outline" size={15} color={LIGHT.burgundy} />
              <Text style={styles.actionBtnOutlineText}>P&L Cert</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtnOutline} onPress={handleExportCSV} activeOpacity={0.8}>
              <Ionicons name="grid-outline" size={15} color={LIGHT.textSecondary} />
              <Text style={[styles.actionBtnOutlineText, { color: LIGHT.textSecondary }]}>CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => setIsPdfModalOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="document-attach-outline" size={16} color="#FDE68A" />
              <Text style={styles.actionBtnPrimaryText}>Export PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Live Export Toast Banner */}
      {exportStatusBanner && (
        <View
          style={[
            styles.toastBanner,
            exportStatusBanner.type === 'success'
              ? { backgroundColor: LIGHT.emeraldSoft, borderBottomColor: LIGHT.emeraldBorder }
              : { backgroundColor: LIGHT.blueSoft, borderBottomColor: LIGHT.blueBorder },
          ]}
        >
          <Ionicons
            name={exportStatusBanner.type === 'success' ? 'checkmark-circle' : 'information-circle'}
            size={17}
            color={exportStatusBanner.type === 'success' ? LIGHT.emerald : LIGHT.blue}
          />
          <Text
            style={[
              styles.toastBannerText,
              { color: exportStatusBanner.type === 'success' ? '#065F46' : '#1E40AF' },
            ]}
          >
            {exportStatusBanner.text}
          </Text>
          <TouchableOpacity onPress={() => setExportStatusBanner(null)}>
            <Ionicons name="close" size={16} color={LIGHT.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* ----------------- TIME HORIZON FILTER STRIP ----------------- */}
      <View style={styles.timeFilterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScroll}>
          {[
            { key: 'today', label: 'Today', icon: 'today-outline' },
            { key: 'yesterday', label: 'Yesterday', icon: 'return-down-back-outline' },
            { key: 'week', label: 'Past 7 Days', icon: 'calendar-outline' },
            { key: 'month', label: 'Past 30 Days', icon: 'calendar-number-outline' },
            { key: 'all', label: 'All-Time Ledger', icon: 'albums-outline' },
          ].map((tf) => {
            const active = timeFilter === tf.key;
            return (
              <TouchableOpacity
                key={tf.key}
                style={[styles.timeChip, active && styles.timeChipActive]}
                onPress={() => {
                  setNowTs(Date.now());
                  setTimeFilter(tf.key as TimeFilter);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tf.icon as any}
                  size={13}
                  color={active ? '#FDE68A' : LIGHT.textMuted}
                />
                <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>{tf.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!isMobile && (
          <View style={styles.rangePill}>
            <Ionicons name="time-outline" size={13} color={LIGHT.gold} />
            <Text style={styles.rangePillText}>
              {timeWindow.shortRange} • {timeWindow.prevLabel}
            </Text>
          </View>
        )}
      </View>

      {/* ----------------- ORGANIZED MODULE NAVIGATION TABS ----------------- */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {[
            { key: 'visuals', label: 'Executive Overview', icon: 'stats-chart-outline' },
            { key: 'pnl', label: 'P&L Statement', icon: 'calculator-outline' },
            { key: 'channels', label: 'Sales & Channels', icon: 'pie-chart-outline' },
            {
              key: 'kitchen',
              label: 'Kitchen & Wastage',
              icon: 'flame-outline',
              badge: `${financialData.averageYieldRate.toFixed(0)}%`,
              badgeColor: financialData.averageYieldRate >= 94 ? LIGHT.emerald : LIGHT.amber,
            },
            { key: 'cashflow', label: 'Cash Register', icon: 'cash-outline' },
            { key: 'tax', label: 'GST & Discounts', icon: 'receipt-outline' },
            { key: 'menu', label: 'Menu Engineering', icon: 'restaurant-outline' },
            {
              key: 'shrinkage',
              label: 'Breakage & Losses',
              icon: 'alert-circle-outline',
              badge: financialData.netBreakageLoss > 0 ? '!' : undefined,
              badgeColor: LIGHT.rose,
            },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.subTabBtn, active && styles.subTabBtnActive]}
                onPress={() => setActiveTab(tab.key as ReportTab)}
                activeOpacity={0.78}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={15}
                  color={active ? LIGHT.burgundy : LIGHT.textMuted}
                />
                <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{tab.label}</Text>
                {tab.badge ? (
                  <View
                    style={[
                      styles.tabMiniBadge,
                      { backgroundColor: `${tab.badgeColor || LIGHT.burgundy}18` },
                    ]}
                  >
                    <Text style={[styles.tabMiniBadgeText, { color: tab.badgeColor || LIGHT.burgundy }]}>
                      {tab.badge}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* ----------------- ANIMATED TOP EXECUTIVE KPI RIBBON ----------------- */}
        <View style={styles.kpiRow}>
          {/* 1. Gross Topline Revenue */}
          <AnimatedReveal animKey={`kpi-1-${timeFilter}`} delay={0} style={styles.kpiCardWrap}>
            <View style={[styles.kpiCard, { borderColor: LIGHT.goldBorder }]}>
              <View style={[styles.kpiTopAccent, { backgroundColor: LIGHT.gold }]} />
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>GROSS TOPLINE REVENUE</Text>
                <View style={[styles.iconBox, { backgroundColor: LIGHT.goldSoft }]}>
                  <Ionicons name="trending-up" size={17} color={LIGHT.gold} />
                </View>
              </View>
              <View style={styles.kpiValueRow}>
                <AnimatedCounter
                  value={financialData.totalGrossRevenue}
                  style={[styles.kpiValue, { color: LIGHT.gold }]}
                />
                <DeltaPill delta={financialData.revenueDeltaPct} />
              </View>
              <Text style={styles.kpiHint}>
                {financialData.totalOrders} txns • {financialData.totalInvoicesCount} food +{' '}
                {financialData.playlandTicketsCount} playland
              </Text>
            </View>
          </AnimatedReveal>

          {/* 2. Gross Operating Profit */}
          <AnimatedReveal animKey={`kpi-2-${timeFilter}`} delay={70} style={styles.kpiCardWrap}>
            <View style={[styles.kpiCard, { borderColor: LIGHT.blueBorder }]}>
              <View style={[styles.kpiTopAccent, { backgroundColor: LIGHT.blue }]} />
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>GROSS OPERATING PROFIT</Text>
                <View style={[styles.iconBox, { backgroundColor: LIGHT.blueSoft }]}>
                  <Ionicons name="layers-outline" size={17} color={LIGHT.blue} />
                </View>
              </View>
              <View style={styles.kpiValueRow}>
                <AnimatedCounter
                  value={financialData.grossOperatingProfit}
                  style={[styles.kpiValue, { color: LIGHT.blue }]}
                />
                <DeltaPill delta={financialData.grossProfitDeltaPct} />
              </View>
              <Text style={styles.kpiHint}>
                Margin {financialData.grossMarginPercent.toFixed(1)}% • COGS {money(financialData.estimatedCOGS)}
              </Text>
            </View>
          </AnimatedReveal>

          {/* 3. Total OPEX */}
          <AnimatedReveal animKey={`kpi-3-${timeFilter}`} delay={140} style={styles.kpiCardWrap}>
            <View style={[styles.kpiCard, { borderColor: LIGHT.roseBorder }]}>
              <View style={[styles.kpiTopAccent, { backgroundColor: LIGHT.rose }]} />
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>OPERATING EXPENSES (OPEX)</Text>
                <View style={[styles.iconBox, { backgroundColor: LIGHT.roseSoft }]}>
                  <Ionicons name="card-outline" size={17} color={LIGHT.rose} />
                </View>
              </View>
              <View style={styles.kpiValueRow}>
                <AnimatedCounter
                  value={financialData.totalOpex}
                  style={[styles.kpiValue, { color: LIGHT.rose }]}
                />
                <DeltaPill delta={financialData.opexDeltaPct} invert />
              </View>
              <Text style={styles.kpiHint}>
                {financialData.opexRatioPercent.toFixed(1)}% of sales • Cash {money(financialData.cashOpex)}
              </Text>
            </View>
          </AnimatedReveal>

          {/* 4. Net Operating Profit (EBITDA) */}
          <AnimatedReveal animKey={`kpi-4-${timeFilter}`} delay={210} style={styles.kpiCardWrap}>
            <View
              style={[
                styles.kpiCard,
                {
                  borderColor: financialData.netOperatingProfit >= 0 ? LIGHT.emeraldBorder : LIGHT.roseBorder,
                  backgroundColor: financialData.netOperatingProfit >= 0 ? '#FFFFFF' : '#FFF1F2',
                },
              ]}
            >
              <View
                style={[
                  styles.kpiTopAccent,
                  { backgroundColor: financialData.netOperatingProfit >= 0 ? LIGHT.emerald : LIGHT.rose },
                ]}
              />
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>NET PROFIT (EBITDA)</Text>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor:
                        financialData.netOperatingProfit >= 0 ? LIGHT.emeraldSoft : LIGHT.roseSoft,
                    },
                  ]}
                >
                  <Ionicons
                    name={financialData.netOperatingProfit >= 0 ? 'shield-checkmark' : 'alert-circle'}
                    size={17}
                    color={financialData.netOperatingProfit >= 0 ? LIGHT.emerald : LIGHT.rose}
                  />
                </View>
              </View>
              <View style={styles.kpiValueRow}>
                <AnimatedCounter
                  value={financialData.netOperatingProfit}
                  style={[
                    styles.kpiValue,
                    { color: financialData.netOperatingProfit >= 0 ? LIGHT.emerald : LIGHT.rose },
                  ]}
                />
                <DeltaPill delta={financialData.netProfitDeltaPct} />
              </View>
              <Text style={styles.kpiHint}>
                Net Margin: {financialData.netProfitMargin.toFixed(1)}% after COGS, OPEX & loss
              </Text>
            </View>
          </AnimatedReveal>
        </View>

        {/* ----------------- COMPACT EXECUTIVE HEALTH STRIP ----------------- */}
        <AnimatedReveal animKey={`health-${timeFilter}`} delay={160}>
          <View style={styles.healthStrip}>
            <View style={styles.healthItem}>
              <View style={[styles.healthDot, { backgroundColor: LIGHT.burgundy }]} />
              <Text style={styles.healthLabel}>Avg Ticket (AOV)</Text>
              <Text style={styles.healthVal}>{money(financialData.averageTicket)}</Text>
            </View>

            <View style={styles.healthDivider} />

            <View style={styles.healthItem}>
              <View style={[styles.healthDot, { backgroundColor: LIGHT.blue }]} />
              <Text style={styles.healthLabel}>GST Collected</Text>
              <Text style={styles.healthVal}>{money(financialData.totalTaxCollected)}</Text>
            </View>

            <View style={styles.healthDivider} />

            <View style={styles.healthItem}>
              <View style={[styles.healthDot, { backgroundColor: LIGHT.gold }]} />
              <Text style={styles.healthLabel}>Expected Cash Float</Text>
              <Text style={styles.healthVal}>{money(financialData.netCashFloat)}</Text>
            </View>

            <View style={styles.healthDivider} />

            <View style={styles.healthItem}>
              <View
                style={[
                  styles.healthDot,
                  { backgroundColor: financialData.averageYieldRate >= 94 ? LIGHT.emerald : LIGHT.amber },
                ]}
              />
              <Text style={styles.healthLabel}>Kitchen Yield</Text>
              <Text
                style={[
                  styles.healthVal,
                  { color: financialData.averageYieldRate >= 94 ? LIGHT.emerald : LIGHT.amber },
                ]}
              >
                {financialData.averageYieldRate.toFixed(1)}%
              </Text>
            </View>

            {financialData.voidedInvoicesCount > 0 && (
              <>
                <View style={styles.healthDivider} />
                <View style={styles.healthItem}>
                  <View style={[styles.healthDot, { backgroundColor: LIGHT.rose }]} />
                  <Text style={styles.healthLabel}>Voided Bills</Text>
                  <Text style={[styles.healthVal, { color: LIGHT.rose }]}>
                    {financialData.voidedInvoicesCount}
                  </Text>
                </View>
              </>
            )}
          </View>
        </AnimatedReveal>

        {/* ----------------- TAB 0: EXECUTIVE OVERVIEW & CHARTS ----------------- */}
        {activeTab === 'visuals' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              {/* SECTION 1: Revenue Trajectory & Capital Flow */}
              <SectionHeading
                step="01"
                title="Revenue Trajectory & Capital Flow"
                subtitle="How gross inflows evolve over time and convert into bottom-line EBITDA profit"
              />

              {timeFilter !== 'today' && timeFilter !== 'yesterday' && financialData.dailySeries.length > 1 && (
                <View style={{ marginBottom: 16 }}>
                  <SvgRevenueTrendChart
                    series={financialData.dailySeries}
                    height={220}
                    title={`Daily Revenue vs OPEX Trajectory (${timeWindow.shortRange})`}
                    subtitle="Tap any day dot to inspect exact orders, operating cost, and net spread"
                  />
                </View>
              )}

              <View style={[styles.chartsGrid, { flexDirection: isMobile ? 'column' : 'row' }]}>
                <View style={[styles.chartCol, { flex: 1.15 }]}>
                  <PnLFlowWaterfallChart
                    grossRevenue={financialData.totalGrossRevenue}
                    cogs={financialData.estimatedCOGS}
                    opex={financialData.totalOpex}
                    damageLoss={financialData.netBreakageLoss}
                    netProfit={financialData.netOperatingProfit}
                  />
                </View>

                <View style={[styles.chartCol, { flex: 1 }]}>
                  <View style={styles.chartPanel}>
                    <View style={styles.chartPanelHeader}>
                      <Text style={styles.chartPanelTitle}>Financial Structure Overview</Text>
                      <Text style={styles.chartPanelSub}>
                        Tap any column to inspect exact PKR contribution
                      </Text>
                    </View>
                    <SvgVerticalBarChart
                      plain
                      data={[
                        {
                          label: 'Gross Sales',
                          value: financialData.totalGrossRevenue,
                          color: '#059669',
                          sublabel: 'Total Inflows',
                        },
                        {
                          label: 'Food Sales',
                          value: financialData.netRestaurantRevenue,
                          color: '#10B981',
                          sublabel: 'Restaurant',
                        },
                        {
                          label: 'Playland',
                          value: financialData.playlandRevenue,
                          color: '#0EA5E9',
                          sublabel: 'Tickets',
                        },
                        {
                          label: 'COGS',
                          value: financialData.estimatedCOGS,
                          color: '#D97706',
                          sublabel: financialData.isEstimatedCOGS ? 'Est. 35%' : 'Actual POs',
                        },
                        {
                          label: 'OPEX',
                          value: financialData.totalOpex,
                          color: '#E11D48',
                          sublabel: 'Overhead',
                        },
                        {
                          label: 'Net Profit',
                          value: financialData.netOperatingProfit,
                          color: financialData.netOperatingProfit >= 0 ? '#059669' : '#BE123C',
                          sublabel: `${financialData.netProfitMargin.toFixed(0)}% Margin`,
                        },
                      ]}
                      height={220}
                      barWidth={36}
                    />
                  </View>
                </View>
              </View>

              {/* SECTION 2: Payment Tender & Hourly Rush Analysis */}
              <View style={{ marginTop: 22 }}>
                <SectionHeading
                  step="02"
                  title="Payment Tender Mix & Rush Hour Velocity"
                  subtitle="Interactive settlement split and 24-hour customer demand curve"
                />
              </View>

              <View style={[styles.chartsGrid, { flexDirection: isMobile ? 'column' : 'row' }]}>
                <View style={[styles.chartCol, { flex: 1 }]}>
                  <View style={styles.chartPanel}>
                    <View style={styles.chartPanelHeader}>
                      <Text style={styles.chartPanelTitle}>Payment Tender Distribution</Text>
                      <Text style={styles.chartPanelSub}>Cash vs POS Card vs Online / IBFT</Text>
                    </View>
                    <SvgDonutChart
                      plain
                      data={[
                        { label: 'Cash', value: financialData.cashTotal, color: '#059669' },
                        { label: 'Card / POS', value: financialData.cardTotal, color: '#2563EB' },
                        { label: 'Online / IBFT', value: financialData.onlineTotal, color: '#7C3AED' },
                      ]}
                      size={205}
                      centerSubtitle="SETTLED"
                      centerTitle={money(financialData.totalGrossRevenue)}
                    />
                  </View>
                </View>

                <View style={[styles.chartCol, { flex: 1.3 }]}>
                  <SvgHourlyVelocityChart
                    hourlyData={financialData.hourlySales}
                    height={205}
                    accentColor={LIGHT.burgundy}
                  />
                </View>
              </View>

              {/* SECTION 3: Performance Drivers & Cost Controls */}
              <View style={{ marginTop: 22 }}>
                <SectionHeading
                  step="03"
                  title="Revenue Drivers, Top Dishes & Cost Controls"
                  subtitle="Fulfillment mix, menu stars, operating overheads, and shrinkage watch"
                />
              </View>

              <View style={[styles.chartsGrid, { flexDirection: isMobile ? 'column' : 'row' }]}>
                <View style={[styles.chartCol, { flex: 1 }]}>
                  <HorizontalRankedBars
                    title="Fulfillment Channels Share"
                    subtitle="Revenue distribution by customer touchpoint"
                    items={[
                      {
                        label: 'Dine-In Restaurant',
                        value: financialData.dineInSales,
                        count: financialData.dineInOrders,
                        color: '#B48214',
                      },
                      {
                        label: 'Takeaway Counter',
                        value: financialData.takeawaySales,
                        count: financialData.takeawayOrders,
                        color: '#2563EB',
                      },
                      {
                        label: 'Delivery Service',
                        value: financialData.deliverySales,
                        count: financialData.deliveryOrders,
                        color: '#059669',
                      },
                      {
                        label: 'Basement Playland',
                        value: financialData.playlandRevenue,
                        count: financialData.playlandTicketsCount,
                        color: '#7C3AED',
                      },
                    ]}
                  />
                </View>

                <View style={[styles.chartCol, { flex: 1 }]}>
                  <HorizontalRankedBars
                    title="Top 5 Best-Selling Dishes"
                    subtitle="Highest revenue generating menu items"
                    items={financialData.topDishes.slice(0, 5).map((d) => ({
                      label: d.name,
                      value: d.revenue,
                      count: d.qty,
                    }))}
                  />
                </View>
              </View>

              <View style={[styles.chartsGrid, { flexDirection: isMobile ? 'column' : 'row', marginTop: 16 }]}>
                <View style={[styles.chartCol, { flex: 1 }]}>
                  <HorizontalRankedBars
                    title="OPEX Category Breakdown"
                    subtitle="Distribution of operating expenses"
                    items={Object.entries(financialData.expenseCatMap)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, val]) => ({
                        label: cat,
                        value: val,
                        color: '#E11D48',
                      }))}
                  />
                </View>

                <View style={[styles.chartCol, { flex: 1 }]}>
                  <HorizontalRankedBars
                    title="Damage & Breakage by Department"
                    subtitle="Crockery, glass & equipment write-offs"
                    items={Object.entries(financialData.damageDeptMap)
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, val]) => ({
                        label: dept,
                        value: val,
                        color: '#9333EA',
                      }))}
                  />
                </View>
              </View>
            </View>
          </AnimatedReveal>
        )}

        {/* ----------------- TAB 1: P&L STATEMENT ----------------- */}
        {activeTab === 'pnl' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              {/* Executive Margin Gauges + Waterfall */}
              <View style={[styles.chartsGrid, { flexDirection: isMobile ? 'column' : 'row', marginBottom: 16 }]}>
                <View style={[styles.chartCol, { flex: 1.35 }]}>
                  <PnLFlowWaterfallChart
                    grossRevenue={financialData.totalGrossRevenue}
                    cogs={financialData.estimatedCOGS}
                    opex={financialData.totalOpex}
                    damageLoss={financialData.netBreakageLoss}
                    netProfit={financialData.netOperatingProfit}
                  />
                </View>

                <View style={[styles.chartCol, { flex: 1 }]}>
                  <View style={[styles.panelCard, { height: '100%', justifyContent: 'space-between' }]}>
                    <View style={styles.panelHeader}>
                      <View>
                        <Text style={styles.panelTitle}>Profitability Health Gauges</Text>
                        <Text style={styles.chartPanelSub}>Key accounting ratios for {timeWindow.shortRange}</Text>
                      </View>
                    </View>

                    <View style={styles.gaugesRow}>
                      <MetricGaugeRing
                        percent={Math.max(0, financialData.grossMarginPercent)}
                        label="Gross Margin"
                        sublabel="After COGS"
                        color="#2563EB"
                      />
                      <MetricGaugeRing
                        percent={Math.max(0, financialData.opexRatioPercent)}
                        label="OPEX Ratio"
                        sublabel="Of Revenue"
                        color="#E11D48"
                      />
                      <MetricGaugeRing
                        percent={Math.max(0, financialData.netProfitMargin)}
                        label="Net EBITDA"
                        sublabel="Bottom Line"
                        color={financialData.netOperatingProfit >= 0 ? '#059669' : '#BE123C'}
                      />
                    </View>

                    <View style={styles.auditNotesCard}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={LIGHT.burgundy} />
                      <Text style={styles.auditNotesText}>
                        COGS Source:{' '}
                        <Text style={{ fontWeight: '800', color: LIGHT.ink }}>
                          {financialData.isEstimatedCOGS
                            ? 'Standard 35% Industry Estimate (No POs in range)'
                            : `Actual Recorded Purchase Orders (${money(financialData.totalProcurementCOGS)})`}
                        </Text>
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Formal Micro P&L Accounting Table */}
              <View style={styles.panelCard}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Ionicons name="document-text-outline" size={20} color={LIGHT.burgundy} />
                    <View>
                      <Text style={styles.panelTitle}>
                        {settings?.restaurantName || 'Sultan Restaurant'} — Formal P&L Statement
                      </Text>
                      <Text style={styles.panelSub}>
                        {timeWindow.label} ({timeWindow.shortRange})
                      </Text>
                    </View>
                  </View>

                  {canExport && (
                    <TouchableOpacity
                      style={styles.inlinePdfBtn}
                      onPress={() => handleDownloadPdf(pnlOnlyOptions)}
                      disabled={isExportingPdf}
                      activeOpacity={0.82}
                    >
                      {isExportingPdf ? (
                        <ActivityIndicator size="small" color={LIGHT.burgundy} />
                      ) : (
                        <Ionicons name="download-outline" size={15} color={LIGHT.burgundy} />
                      )}
                      <Text style={styles.inlinePdfBtnText}>Download P&L PDF</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.statementTable}>
                  {/* Accounting Column Header */}
                  <View style={styles.statementColHeader}>
                    <Text style={[styles.statementColHeadText, { flex: 1 }]}>ACCOUNTING LINE ITEM</Text>
                    <Text style={[styles.statementColHeadText, { width: 76, textAlign: 'right' }]}>% OF REV</Text>
                    <Text style={[styles.statementColHeadText, { width: 120, textAlign: 'right' }]}>AMOUNT (PKR)</Text>
                  </View>

                  {/* 1. REVENUE */}
                  <View style={styles.statementCategoryHeader}>
                    <Text style={styles.statementCatText}>1. OPERATING REVENUES (TOPLINE)</Text>
                    <Text style={styles.statementCatPct}>100.0%</Text>
                    <Text style={styles.statementCatVal}>{money(financialData.totalGrossRevenue)}</Text>
                  </View>

                  <View style={styles.statementRow}>
                    <Text style={styles.statementItem}>Dine-in Restaurant Food Sales</Text>
                    <Text style={styles.statementPct}>
                      {pctOf(financialData.dineInSales, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={styles.statementVal}>{money(financialData.dineInSales)}</Text>
                  </View>

                  <View style={styles.statementRow}>
                    <Text style={styles.statementItem}>Takeaway & Fast Counter Orders</Text>
                    <Text style={styles.statementPct}>
                      {pctOf(financialData.takeawaySales, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={styles.statementVal}>{money(financialData.takeawaySales)}</Text>
                  </View>

                  <View style={styles.statementRow}>
                    <Text style={styles.statementItem}>Delivery Orders</Text>
                    <Text style={styles.statementPct}>
                      {pctOf(financialData.deliverySales, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={styles.statementVal}>{money(financialData.deliverySales)}</Text>
                  </View>

                  <View style={styles.statementRow}>
                    <Text style={styles.statementItem}>Basement Playland & Amusement Tickets</Text>
                    <Text style={styles.statementPct}>
                      {pctOf(financialData.playlandRevenue, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={styles.statementVal}>{money(financialData.playlandRevenue)}</Text>
                  </View>

                  <View style={[styles.statementRow, styles.subtotalRow]}>
                    <Text style={[styles.subtotalText, { flex: 1 }]}>TOTAL GROSS REVENUE (A)</Text>
                    <Text style={styles.statementPct}>100.0%</Text>
                    <Text style={[styles.subtotalValGold, { width: 120, textAlign: 'right' }]}>
                      {money(financialData.totalGrossRevenue)}
                    </Text>
                  </View>

                  {/* 2. COST OF GOODS SOLD */}
                  <View style={styles.statementCategoryHeader}>
                    <Text style={styles.statementCatText}>2. COST OF GOODS SOLD (COGS / RAW KITCHEN INFLOWS)</Text>
                    <Text style={[styles.statementCatPct, { color: LIGHT.amber }]}>
                      {pctOf(financialData.estimatedCOGS, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={[styles.statementCatVal, { color: LIGHT.amber }]}>
                      ({money(financialData.estimatedCOGS)})
                    </Text>
                  </View>

                  <View style={styles.statementRow}>
                    <Text style={styles.statementItem}>
                      Raw Kitchen Provisions & Supplier POs{' '}
                      {financialData.isEstimatedCOGS ? '(Est. 35% Food Cost)' : '(Actual POs)'}
                    </Text>
                    <Text style={styles.statementPct}>
                      {pctOf(financialData.estimatedCOGS, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={styles.statementVal}>{money(financialData.estimatedCOGS)}</Text>
                  </View>

                  <View style={[styles.statementRow, styles.subtotalRow, { backgroundColor: LIGHT.blueSoft }]}>
                    <Text style={[styles.subtotalText, { color: LIGHT.blue, flex: 1 }]}>
                      GROSS OPERATING PROFIT (A - B)
                    </Text>
                    <Text style={[styles.statementPct, { color: LIGHT.blue, fontWeight: '800' }]}>
                      {financialData.grossMarginPercent.toFixed(1)}%
                    </Text>
                    <Text style={[styles.subtotalValGold, { color: LIGHT.blue, width: 120, textAlign: 'right' }]}>
                      {money(financialData.grossOperatingProfit)}
                    </Text>
                  </View>

                  {/* 3. OPERATING EXPENSES */}
                  <View style={styles.statementCategoryHeader}>
                    <Text style={styles.statementCatText}>3. OPERATING EXPENDITURES (OPEX)</Text>
                    <Text style={[styles.statementCatPct, { color: LIGHT.rose }]}>
                      {pctOf(financialData.totalOpex, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={[styles.statementCatVal, { color: LIGHT.rose }]}>
                      ({money(financialData.totalOpex)})
                    </Text>
                  </View>

                  {Object.keys(financialData.expenseCatMap).length === 0 ? (
                    <View style={styles.statementRow}>
                      <Text style={[styles.statementItem, { fontStyle: 'italic', color: LIGHT.textDim }]}>
                        No operational expenses recorded for this window.
                      </Text>
                      <Text style={styles.statementPct}>0.0%</Text>
                      <Text style={styles.statementVal}>Rs. 0</Text>
                    </View>
                  ) : (
                    Object.entries(financialData.expenseCatMap)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amt]) => (
                        <View key={cat} style={styles.statementRow}>
                          <Text style={styles.statementItem}>{cat}</Text>
                          <Text style={styles.statementPct}>
                            {pctOf(amt, financialData.totalGrossRevenue)}
                          </Text>
                          <Text style={styles.statementVal}>{money(amt)}</Text>
                        </View>
                      ))
                  )}

                  <View style={[styles.statementRow, styles.subtotalRow]}>
                    <Text style={[styles.subtotalText, { flex: 1 }]}>TOTAL OPEX EXPENDITURES (C)</Text>
                    <Text style={[styles.statementPct, { color: LIGHT.rose, fontWeight: '700' }]}>
                      {pctOf(financialData.totalOpex, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={[styles.subtotalValGold, { color: LIGHT.rose, width: 120, textAlign: 'right' }]}>
                      {money(financialData.totalOpex)}
                    </Text>
                  </View>

                  {/* 4. LOSS, SHRINKAGE & WRITE-OFFS */}
                  <View style={styles.statementCategoryHeader}>
                    <Text style={styles.statementCatText}>4. LOSS, BREAKAGE & SHRINKAGE ADJUSTMENTS</Text>
                    <Text style={[styles.statementCatPct, { color: LIGHT.rose }]}>
                      {pctOf(financialData.netBreakageLoss, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={[styles.statementCatVal, { color: LIGHT.rose }]}>
                      ({money(financialData.netBreakageLoss)})
                    </Text>
                  </View>

                  <View style={styles.statementRow}>
                    <Text style={styles.statementItem}>Net Crockery & Glassware Breakages (Written Off)</Text>
                    <Text style={styles.statementPct}>
                      {pctOf(financialData.netBreakageLoss, financialData.totalGrossRevenue)}
                    </Text>
                    <Text style={styles.statementVal}>{money(financialData.netBreakageLoss)}</Text>
                  </View>

                  {financialData.assetMaintenanceCosts > 0 ? (
                    <View style={styles.statementRow}>
                      <Text style={styles.statementItem}>Asset & Equipment Maintenance Services (Memo)</Text>
                      <Text style={styles.statementPct}>
                        {pctOf(financialData.assetMaintenanceCosts, financialData.totalGrossRevenue)}
                      </Text>
                      <Text style={styles.statementVal}>{money(financialData.assetMaintenanceCosts)}</Text>
                    </View>
                  ) : null}

                  {/* 5. FINAL NET PROFIT BOTTOM LINE */}
                  <View
                    style={[
                      styles.statementRow,
                      styles.finalNetRow,
                      {
                        backgroundColor:
                          financialData.netOperatingProfit >= 0 ? LIGHT.emeraldSoft : LIGHT.roseSoft,
                        borderColor:
                          financialData.netOperatingProfit >= 0 ? LIGHT.emeraldBorder : LIGHT.roseBorder,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.finalNetTitle,
                          { color: financialData.netOperatingProfit >= 0 ? '#065F46' : '#9F1239' },
                        ]}
                      >
                        NET OPERATING PROFIT / (LOSS) — BOTTOM LINE
                      </Text>
                      <Text style={{ fontSize: 11, color: LIGHT.textSecondary, marginTop: 2 }}>
                        Net EBITDA margin: {financialData.netProfitMargin.toFixed(1)}% after all COGS, OPEX & shrinkage
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.finalNetValue,
                        { color: financialData.netOperatingProfit >= 0 ? '#065F46' : '#9F1239' },
                      ]}
                    >
                      {money(financialData.netOperatingProfit)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </AnimatedReveal>
        )}

        {/* ----------------- TAB 2: CHANNELS & SALES ----------------- */}
        {activeTab === 'channels' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              {/* Payment Method Split */}
              <View style={styles.panelCard}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="card-outline" size={18} color={LIGHT.burgundy} />
                    <Text style={styles.panelTitle}>Payment Tender Breakdown (Micro Audit)</Text>
                  </View>
                  <Text style={styles.panelSub}>{timeWindow.shortRange}</Text>
                </View>

                <View style={{ marginBottom: 16 }}>
                  <SvgDonutChart
                    plain
                    data={[
                      { label: 'Cash', value: financialData.cashTotal, color: '#059669' },
                      { label: 'Card / POS', value: financialData.cardTotal, color: '#2563EB' },
                      { label: 'Online / IBFT', value: financialData.onlineTotal, color: '#7C3AED' },
                    ]}
                    size={195}
                    centerSubtitle="SETTLED"
                    centerTitle={money(financialData.totalGrossRevenue)}
                  />
                </View>

                <View style={styles.channelGrid}>
                  <View style={[styles.channelCard, { borderColor: LIGHT.emeraldBorder }]}>
                    <View style={styles.channelHeader}>
                      <Text style={styles.channelLabel}>CASH PAYMENTS</Text>
                      <Ionicons name="cash" size={18} color={LIGHT.emerald} />
                    </View>
                    <AnimatedCounter
                      value={financialData.cashTotal}
                      style={[styles.channelAmount, { color: LIGHT.emerald }]}
                    />
                    <Text style={styles.channelSub}>
                      {pctOf(financialData.cashTotal, financialData.totalGrossRevenue)} of total revenue
                    </Text>
                  </View>

                  <View style={[styles.channelCard, { borderColor: LIGHT.blueBorder }]}>
                    <View style={styles.channelHeader}>
                      <Text style={styles.channelLabel}>CREDIT / DEBIT CARD</Text>
                      <Ionicons name="card" size={18} color={LIGHT.blue} />
                    </View>
                    <AnimatedCounter
                      value={financialData.cardTotal}
                      style={[styles.channelAmount, { color: LIGHT.blue }]}
                    />
                    <Text style={styles.channelSub}>
                      {pctOf(financialData.cardTotal, financialData.totalGrossRevenue)} of total revenue
                    </Text>
                  </View>

                  <View style={[styles.channelCard, { borderColor: LIGHT.purpleBorder }]}>
                    <View style={styles.channelHeader}>
                      <Text style={styles.channelLabel}>ONLINE / IBFT TRANSFER</Text>
                      <Ionicons name="globe-outline" size={18} color={LIGHT.purple} />
                    </View>
                    <AnimatedCounter
                      value={financialData.onlineTotal}
                      style={[styles.channelAmount, { color: LIGHT.purple }]}
                    />
                    <Text style={styles.channelSub}>
                      {pctOf(financialData.onlineTotal, financialData.totalGrossRevenue)} of total revenue
                    </Text>
                  </View>
                </View>
              </View>

              {/* All 4 Fulfillment Channels Breakdown (Includes Delivery!) */}
              <View style={[styles.panelCard, { marginTop: 14 }]}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="restaurant-outline" size={18} color={LIGHT.burgundy} />
                    <Text style={styles.panelTitle}>Fulfillment & Amusement Channel Performance</Text>
                  </View>
                  <Text style={styles.panelSub}>{financialData.totalOrders} total transactions</Text>
                </View>

                <View style={styles.channelGrid}>
                  {/* Dine-in */}
                  <View style={[styles.channelCard, { borderTopWidth: 3, borderTopColor: '#B48214' }]}>
                    <Text style={styles.channelLabel}>DINE-IN SEATING SERVICE</Text>
                    <Text style={styles.channelAmountDark}>{money(financialData.dineInSales)}</Text>
                    <Text style={styles.channelSub}>
                      {financialData.dineInOrders} Orders ({pctOf(financialData.dineInSales, financialData.totalGrossRevenue)}) • Avg:{' '}
                      {money(financialData.dineInOrders > 0 ? financialData.dineInSales / financialData.dineInOrders : 0)}
                    </Text>
                  </View>

                  {/* Takeaway */}
                  <View style={[styles.channelCard, { borderTopWidth: 3, borderTopColor: '#2563EB' }]}>
                    <Text style={styles.channelLabel}>TAKEAWAY / COUNTER PICKUP</Text>
                    <Text style={styles.channelAmountDark}>{money(financialData.takeawaySales)}</Text>
                    <Text style={styles.channelSub}>
                      {financialData.takeawayOrders} Orders ({pctOf(financialData.takeawaySales, financialData.totalGrossRevenue)}) • Avg:{' '}
                      {money(
                        financialData.takeawayOrders > 0 ? financialData.takeawaySales / financialData.takeawayOrders : 0
                      )}
                    </Text>
                  </View>

                  {/* Delivery */}
                  <View style={[styles.channelCard, { borderTopWidth: 3, borderTopColor: '#059669' }]}>
                    <Text style={styles.channelLabel}>HOME DELIVERY SERVICE</Text>
                    <Text style={styles.channelAmountDark}>{money(financialData.deliverySales)}</Text>
                    <Text style={styles.channelSub}>
                      {financialData.deliveryOrders} Orders ({pctOf(financialData.deliverySales, financialData.totalGrossRevenue)}) • Avg:{' '}
                      {money(
                        financialData.deliveryOrders > 0 ? financialData.deliverySales / financialData.deliveryOrders : 0
                      )}
                    </Text>
                  </View>

                  {/* Basement Playland */}
                  <View style={[styles.channelCard, { borderTopWidth: 3, borderTopColor: '#7C3AED' }]}>
                    <Text style={styles.channelLabel}>BASEMENT AMUSEMENT TICKETS</Text>
                    <Text style={styles.channelAmountDark}>{money(financialData.playlandRevenue)}</Text>
                    <Text style={styles.channelSub}>
                      {financialData.playlandTicketsCount} Admissions ({pctOf(financialData.playlandRevenue, financialData.totalGrossRevenue)})
                    </Text>
                  </View>
                </View>
              </View>

              {/* Hourly Rush Hour Velocity */}
              <View style={{ marginTop: 14 }}>
                <SvgHourlyVelocityChart
                  hourlyData={financialData.hourlySales}
                  height={195}
                  accentColor={LIGHT.burgundy}
                />
              </View>
            </View>
          </AnimatedReveal>
        )}

        {/* ----------------- TAB 3: KITCHEN PRODUCTION & WASTAGE AUDIT ----------------- */}
        {activeTab === 'kitchen' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              {/* Top Action Header + Live Yield Gauge */}
              <View style={[styles.panelCard, { marginBottom: 14 }]}>
                <View
                  style={{
                    flexDirection: isMobile ? 'column' : 'row',
                    justifyContent: 'space-between',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    gap: 14,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Ionicons name="flame" size={20} color={LIGHT.burgundy} />
                      <Text style={styles.panelTitle}>Kitchen Cooking & Shift Store Return Reconciliation</Text>
                      <View style={[styles.statusBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <Text style={[styles.statusBadgeText, { color: '#047857' }]}>LIVE YIELD AUDIT</Text>
                      </View>
                    </View>
                    <Text style={[styles.chartPanelSub, { marginTop: 4 }]}>
                      Tracking dishes cooked, surplus raw stock returned to store, and variance wastage.
                    </Text>

                    <View
                      style={[
                        styles.auditNotesCard,
                        { marginTop: 12, backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
                      ]}
                    >
                      <Ionicons name="calculator-outline" size={18} color="#B45309" />
                      <Text style={[styles.auditNotesText, { color: '#92400E' }]}>
                        <Text style={{ fontWeight: '800' }}>Wastage Formula:</Text> Kitchen Wastage = Store Issued −
                        (Cooked/Sold in Shift + Returned to Store at Closing). Positive variance indicates unaccounted
                        shrinkage.
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <MetricGaugeRing
                      percent={financialData.averageYieldRate}
                      label="Yield Rate"
                      sublabel="Accounted"
                      color={financialData.averageYieldRate >= 94 ? LIGHT.emerald : LIGHT.amber}
                      size={88}
                      thickness={9}
                    />
                    <TouchableOpacity
                      style={[styles.actionBtnPrimary, { backgroundColor: LIGHT.burgundy }]}
                      onPress={handleOpenClosingReturn}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="clipboard-outline" size={16} color="#FDE68A" />
                      <Text style={styles.actionBtnPrimaryText}>Log Closing Return</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Kitchen Ribbon KPIs */}
              <View style={styles.kpiRow}>
                <View style={[styles.kpiCard, { borderColor: LIGHT.emeraldBorder }]}>
                  <View style={styles.kpiHeader}>
                    <Text style={styles.kpiLabel}>DISHES COOKED</Text>
                    <View style={[styles.iconBox, { backgroundColor: LIGHT.emeraldSoft }]}>
                      <Ionicons name="restaurant" size={16} color={LIGHT.emerald} />
                    </View>
                  </View>
                  <AnimatedCounter
                    value={financialData.totalPortionsCooked}
                    formatter={(n) => `${Math.round(n).toLocaleString()} Portions`}
                    style={[styles.kpiValue, { color: LIGHT.emerald }]}
                  />
                  <Text style={styles.kpiHint}>Turnover: {money(financialData.totalFoodTurnover)}</Text>
                </View>

                <View style={[styles.kpiCard, { borderColor: LIGHT.goldBorder }]}>
                  <View style={styles.kpiHeader}>
                    <Text style={styles.kpiLabel}>STORE RAW ISSUED</Text>
                    <View style={[styles.iconBox, { backgroundColor: LIGHT.goldSoft }]}>
                      <Ionicons name="cube" size={16} color={LIGHT.gold} />
                    </View>
                  </View>
                  <AnimatedCounter
                    value={financialData.totalStoreIssuedValue}
                    style={[styles.kpiValue, { color: LIGHT.gold }]}
                  />
                  <Text style={styles.kpiHint}>Raw material sent to kitchen</Text>
                </View>

                <View style={[styles.kpiCard, { borderColor: LIGHT.blueBorder }]}>
                  <View style={styles.kpiHeader}>
                    <Text style={styles.kpiLabel}>COOKED IN ORDERS</Text>
                    <View style={[styles.iconBox, { backgroundColor: LIGHT.blueSoft }]}>
                      <Ionicons name="checkmark-done-circle" size={16} color={LIGHT.blue} />
                    </View>
                  </View>
                  <AnimatedCounter
                    value={financialData.totalCookedRawValue}
                    style={[styles.kpiValue, { color: LIGHT.blue }]}
                  />
                  <Text style={styles.kpiHint}>Recipe theoretical consumption</Text>
                </View>

                <View style={[styles.kpiCard, { borderColor: LIGHT.purpleBorder }]}>
                  <View style={styles.kpiHeader}>
                    <Text style={styles.kpiLabel}>RETURNED TO STORE</Text>
                    <View style={[styles.iconBox, { backgroundColor: LIGHT.purpleSoft }]}>
                      <Ionicons name="return-up-back" size={16} color={LIGHT.purple} />
                    </View>
                  </View>
                  <AnimatedCounter
                    value={financialData.totalReturnedToStoreValue}
                    style={[styles.kpiValue, { color: LIGHT.purple }]}
                  />
                  <Text style={styles.kpiHint}>Shift closing surplus saved</Text>
                </View>

                <View style={[styles.kpiCard, { borderColor: LIGHT.roseBorder }]}>
                  <View style={styles.kpiHeader}>
                    <Text style={styles.kpiLabel}>NET WASTAGE LOSS</Text>
                    <View style={[styles.iconBox, { backgroundColor: LIGHT.roseSoft }]}>
                      <Ionicons name="alert-circle" size={16} color={LIGHT.rose} />
                    </View>
                  </View>
                  <AnimatedCounter
                    value={financialData.totalKitchenWastageCost}
                    style={[styles.kpiValue, { color: LIGHT.rose }]}
                  />
                  <Text style={styles.kpiHint}>
                    Yield Rate: {financialData.averageYieldRate.toFixed(1)}% accounted
                  </Text>
                </View>
              </View>

              {/* Visual Graphs Row 1 */}
              <View style={[styles.chartsGrid, { flexDirection: isMobile ? 'column' : 'row', marginBottom: 16 }]}>
                <View style={[styles.chartCol, { flex: 1.2 }]}>
                  <View style={styles.chartPanel}>
                    <View style={styles.chartPanelHeader}>
                      <Text style={styles.chartPanelTitle}>Kitchen Station Cooking Volume</Text>
                      <Text style={styles.chartPanelSub}>Portions prepared across kitchen stations</Text>
                    </View>
                    <SvgVerticalBarChart
                      plain
                      valuePrefix=""
                      data={Object.values(financialData.stationCookingSummary).map((st) => ({
                        label: st.station.replace('Station', '').replace('Line', '').trim(),
                        value: st.portions,
                        color: st.station.includes('Karahi')
                          ? '#B48214'
                          : st.station.includes('BBQ')
                          ? '#E11D48'
                          : st.station.includes('Rice')
                          ? '#059669'
                          : st.station.includes('Tandoor')
                          ? '#D97706'
                          : '#2563EB',
                        sublabel: `${money(st.revenue)}`,
                      }))}
                      height={205}
                      barWidth={38}
                      showPercentages={true}
                    />
                  </View>
                </View>

                <View style={[styles.chartCol, { flex: 1 }]}>
                  <View style={styles.chartPanel}>
                    <View style={styles.chartPanelHeader}>
                      <Text style={styles.chartPanelTitle}>Store Inflow vs Cooking vs Return</Text>
                      <Text style={styles.chartPanelSub}>Raw material life-cycle in kitchen (PKR)</Text>
                    </View>
                    <SvgVerticalBarChart
                      plain
                      data={[
                        { label: 'Store Issued', value: financialData.totalStoreIssuedValue, color: '#B48214', sublabel: 'Handover' },
                        { label: 'Cooked/Sold', value: financialData.totalCookedRawValue, color: '#059669', sublabel: 'Recipe' },
                        { label: 'Store Return', value: financialData.totalReturnedToStoreValue, color: '#2563EB', sublabel: 'Closing' },
                        { label: 'Wastage Loss', value: financialData.totalKitchenWastageCost, color: '#E11D48', sublabel: 'Shrinkage' },
                      ]}
                      height={205}
                      barWidth={42}
                      showPercentages={false}
                    />
                  </View>
                </View>
              </View>

              {/* Visual Graphs Row 2 */}
              <View style={[styles.chartsGrid, { flexDirection: isMobile ? 'column' : 'row', marginBottom: 16 }]}>
                <View style={[styles.chartCol, { flex: 1 }]}>
                  <HorizontalRankedBars
                    title="Highest Wastage Raw Materials"
                    subtitle="Loss amount and variance quantity"
                    items={financialData.rawReconciliationList.slice(0, 5).map((it) => ({
                      label: it.itemName,
                      value: it.wastageCost,
                      count: it.variance,
                      color: it.status === 'alert' ? '#E11D48' : '#D97706',
                    }))}
                  />
                </View>

                <View style={[styles.chartCol, { flex: 1 }]}>
                  <HorizontalRankedBars
                    title="Wastage Causes & Kitchen Incidents"
                    subtitle="Attributed loss categories from chef logs"
                    items={Object.values(financialData.wastageReasonsMap)
                      .filter((r) => r.count > 0 || r.cost > 0)
                      .map((r) => ({
                        label: r.label,
                        value: r.cost > 0 ? r.cost : r.count * 450,
                        count: r.count,
                        color: '#9333EA',
                      }))}
                  />
                </View>
              </View>

              {/* 1. Main Reconciliation Table */}
              <View style={[styles.panelCard, { marginBottom: 16 }]}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="git-compare-outline" size={18} color={LIGHT.burgundy} />
                    <Text style={styles.panelTitle}>Raw Material Shift Closing & Wastage Difference Ledger</Text>
                  </View>
                  <Text style={styles.panelSub}>Difference = Issued − (Cooked + Returned)</Text>
                </View>

                <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={false}>
                  <View style={[styles.menuTable, isMobile && { minWidth: 660 }]}>
                    <View style={styles.menuTableHeader}>
                      <Text style={[styles.mth, { flex: 2 }]}>Raw Material Item</Text>
                      <Text style={[styles.mth, { flex: 1.1, textAlign: 'center' }]}>Store Issued</Text>
                      <Text style={[styles.mth, { flex: 1.1, textAlign: 'center' }]}>Cooked/Sold</Text>
                      <Text style={[styles.mth, { flex: 1.1, textAlign: 'center', color: LIGHT.blue }]}>
                        Store Return
                      </Text>
                      <Text style={[styles.mth, { flex: 1.2, textAlign: 'center', color: LIGHT.rose }]}>
                        Difference (Waste)
                      </Text>
                      <Text style={[styles.mth, { flex: 1.3, textAlign: 'right' }]}>Loss (PKR)</Text>
                      <Text style={[styles.mth, { flex: 1, textAlign: 'center' }]}>Status</Text>
                    </View>

                    {financialData.rawReconciliationList.length === 0 ? (
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
                          No kitchen store items logged for this shift.
                        </Text>
                      </View>
                    ) : (
                      financialData.rawReconciliationList.map((item, idx) => (
                        <View key={item.itemId || idx} style={styles.menuTableRow}>
                          <View style={{ flex: 2 }}>
                            <Text style={[styles.mtd, { fontWeight: '700', color: LIGHT.ink }]} numberOfLines={1}>
                              {item.itemName}
                            </Text>
                            <Text style={{ fontSize: 10, color: LIGHT.textDim }}>{item.category}</Text>
                          </View>

                          <Text style={[styles.mtd, { flex: 1.1, textAlign: 'center', fontWeight: '600' }]}>
                            {item.issued} {item.unit}
                          </Text>

                          <Text
                            style={[
                              styles.mtd,
                              { flex: 1.1, textAlign: 'center', color: '#059669', fontWeight: '600' },
                            ]}
                          >
                            {item.cooked} {item.unit}
                          </Text>

                          <Text
                            style={[
                              styles.mtd,
                              { flex: 1.1, textAlign: 'center', color: LIGHT.blue, fontWeight: '700' },
                            ]}
                          >
                            {item.returned} {item.unit}
                          </Text>

                          <Text
                            style={[
                              styles.mtd,
                              {
                                flex: 1.2,
                                textAlign: 'center',
                                fontWeight: '800',
                                color:
                                  item.variance > 0
                                    ? item.status === 'alert'
                                      ? '#BE123C'
                                      : '#D97706'
                                    : '#059669',
                              },
                            ]}
                          >
                            {item.variance > 0 ? `+${item.variance} ${item.unit}` : `0 ${item.unit}`}
                          </Text>

                          <Text
                            style={[
                              styles.mtd,
                              {
                                flex: 1.3,
                                textAlign: 'right',
                                fontWeight: '800',
                                color: item.wastageCost > 0 ? '#BE123C' : LIGHT.textMuted,
                              },
                            ]}
                          >
                            {item.wastageCost > 0 ? money(item.wastageCost) : 'Rs. 0'}
                          </Text>

                          <View style={{ flex: 1, alignItems: 'center' }}>
                            <View
                              style={[
                                styles.reconBadge,
                                item.status === 'optimal'
                                  ? styles.reconBadgeOptimal
                                  : item.status === 'alert'
                                  ? styles.reconBadgeAlert
                                  : styles.reconBadgeAcceptable,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reconBadgeText,
                                  item.status === 'optimal'
                                    ? { color: '#047857' }
                                    : item.status === 'alert'
                                    ? { color: '#BE123C' }
                                    : { color: '#92400E' },
                                ]}
                              >
                                {item.status === 'optimal' ? 'OPTIMAL' : item.status === 'alert' ? 'EXCESS' : 'NORMAL'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </ScrollView>
              </View>

              {/* 2. Cooked Dishes Production Log */}
              <View style={styles.panelCard}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="restaurant-outline" size={18} color={LIGHT.burgundy} />
                    <Text style={styles.panelTitle}>Live Cooked Dishes Production Log (Kia Kia Cooking Hoii Hai)</Text>
                  </View>
                  <Text style={styles.panelSub}>{financialData.cookedDishesList.length} distinct dishes cooked</Text>
                </View>

                <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={false}>
                  <View style={[styles.menuTable, isMobile && { minWidth: 560 }]}>
                    <View style={styles.menuTableHeader}>
                      <Text style={[styles.mth, { flex: 0.6 }]}>#</Text>
                      <Text style={[styles.mth, { flex: 2.2 }]}>Dish Name</Text>
                      <Text style={[styles.mth, { flex: 1.6 }]}>Station</Text>
                      <Text style={[styles.mth, { flex: 1.2, textAlign: 'center' }]}>Portions Cooked</Text>
                      <Text style={[styles.mth, { flex: 1.2, textAlign: 'right' }]}>Portion Price</Text>
                      <Text style={[styles.mth, { flex: 1.4, textAlign: 'right' }]}>Total Turnover</Text>
                    </View>

                    {financialData.cookedDishesList.length === 0 ? (
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>
                          No cooking orders settled in this time window.
                        </Text>
                      </View>
                    ) : (
                      financialData.cookedDishesList.map((dish, idx) => (
                        <View key={dish.name + idx} style={styles.menuTableRow}>
                          <Text style={[styles.mtd, { flex: 0.6, color: LIGHT.textDim, fontWeight: '700' }]}>
                            #{idx + 1}
                          </Text>
                          <Text style={[styles.mtd, { flex: 2.2, fontWeight: '700', color: LIGHT.ink }]} numberOfLines={1}>
                            {dish.name}
                          </Text>
                          <View style={{ flex: 1.6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: LIGHT.burgundy }}>
                              {dish.station}
                            </Text>
                          </View>
                          <Text
                            style={[styles.mtd, { flex: 1.2, textAlign: 'center', fontWeight: '800', color: LIGHT.ink }]}
                          >
                            {dish.qty}
                          </Text>
                          <Text style={[styles.mtd, { flex: 1.2, textAlign: 'right', color: LIGHT.textSecondary }]}>
                            {money(dish.price)}
                          </Text>
                          <Text
                            style={[
                              styles.mtd,
                              { flex: 1.4, textAlign: 'right', fontWeight: '800', color: LIGHT.gold },
                            ]}
                          >
                            {money(dish.totalRevenue)}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </ScrollView>
              </View>
            </View>
          </AnimatedReveal>
        )}

        {/* ----------------- TAB 4: CASH REGISTER AUDIT ----------------- */}
        {activeTab === 'cashflow' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              <View style={styles.panelCard}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="wallet-outline" size={18} color={LIGHT.burgundy} />
                    <Text style={styles.panelTitle}>Cash Drawer Daily Float & Reconciliation</Text>
                  </View>
                  <Text style={styles.panelSub}>{timeWindow.shortRange}</Text>
                </View>

                <View style={{ marginBottom: 16 }}>
                  <SvgVerticalBarChart
                    plain
                    data={[
                      {
                        label: 'Restaurant Cash',
                        value: financialData.restaurantCash,
                        color: '#059669',
                        sublabel: 'POS Drawer',
                      },
                      {
                        label: 'Playland Cash',
                        value: financialData.playlandCash,
                        color: '#0EA5E9',
                        sublabel: 'Ticket Counter',
                      },
                      {
                        label: 'Cash Outflow',
                        value: financialData.totalCashOutflow,
                        color: '#E11D48',
                        sublabel: 'OPEX + Suppliers',
                      },
                      {
                        label: 'Expected Float',
                        value: financialData.netCashFloat,
                        color: '#B48214',
                        sublabel: 'Drawer Balance',
                      },
                    ]}
                    height={205}
                    barWidth={48}
                    showPercentages={false}
                  />
                </View>

                <View style={styles.cashFlowGrid}>
                  <View style={[styles.cashBox, { borderColor: LIGHT.emeraldBorder, backgroundColor: LIGHT.emeraldSoft }]}>
                    <Text style={[styles.cashBoxLabel, { color: '#047857' }]}>CASH INFLOW (+)</Text>
                    <AnimatedCounter
                      value={financialData.totalCashInflow}
                      style={[styles.cashBoxAmount, { color: '#047857' }]}
                    />
                    <Text style={styles.cashBoxHint}>
                      Restaurant: {money(financialData.restaurantCash)} • Playland: {money(financialData.playlandCash)}
                    </Text>
                  </View>

                  <View style={[styles.cashBox, { borderColor: LIGHT.roseBorder, backgroundColor: LIGHT.roseSoft }]}>
                    <Text style={[styles.cashBoxLabel, { color: '#BE123C' }]}>CASH EXPENSES / OUTFLOW (-)</Text>
                    <AnimatedCounter
                      value={financialData.totalCashOutflow}
                      style={[styles.cashBoxAmount, { color: '#BE123C' }]}
                    />
                    <Text style={styles.cashBoxHint}>
                      Opex Cash: {money(financialData.cashOpex)} • Supplier Cash:{' '}
                      {money(financialData.cashSupplierPayments)}
                    </Text>
                  </View>

                  <View style={[styles.cashBox, { borderColor: LIGHT.goldBorder, backgroundColor: '#FFFBEB' }]}>
                    <Text style={[styles.cashBoxLabel, { color: '#B45309' }]}>NET CASH EXPECTED IN DRAWER</Text>
                    <AnimatedCounter
                      value={financialData.netCashFloat}
                      style={[styles.cashBoxAmount, { color: '#B45309' }]}
                    />
                    <Text style={styles.cashBoxHint}>Theoretical physical balance to verify at Z-Report close</Text>
                  </View>
                </View>

                <View style={styles.auditNotesCard}>
                  <Ionicons name="information-circle-outline" size={18} color={LIGHT.burgundy} />
                  <Text style={styles.auditNotesText}>
                    Managers must reconcile physical cash in register against{' '}
                    <Text style={{ fontWeight: '800', color: LIGHT.burgundy }}>
                      {money(financialData.netCashFloat)}
                    </Text>{' '}
                    at shift close. Any discrepancy should be logged in the Shift Reconciliation desk.
                  </Text>
                </View>
              </View>
            </View>
          </AnimatedReveal>
        )}

        {/* ----------------- TAB 5: GST & DISCOUNTS ----------------- */}
        {activeTab === 'tax' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              <View style={styles.panelCard}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="receipt-outline" size={18} color={LIGHT.burgundy} />
                    <Text style={styles.panelTitle}>Government Sales Tax (GST) & Customer Discount Ledger</Text>
                  </View>
                  <Text style={styles.panelSub}>
                    {settings?.ntnOrTaxId ? `NTN / Tax ID: ${settings.ntnOrTaxId}` : timeWindow.shortRange}
                  </Text>
                </View>

                <View style={{ marginBottom: 16 }}>
                  <SvgVerticalBarChart
                    plain
                    data={[
                      { label: 'Food Gross', value: financialData.grossFoodSales, color: '#0F172A', sublabel: 'Pre-Tax' },
                      { label: 'Tax (GST)', value: financialData.totalTaxCollected, color: '#2563EB', sublabel: 'Collected' },
                      { label: 'Discounts', value: financialData.totalDiscountGiven, color: '#E11D48', sublabel: 'Waived' },
                      { label: 'Net Billed', value: financialData.netRestaurantRevenue, color: '#059669', sublabel: 'Invoiced' },
                    ]}
                    height={200}
                    barWidth={46}
                    showPercentages={false}
                  />
                </View>

                <View style={styles.channelGrid}>
                  <View style={styles.channelCard}>
                    <Text style={styles.channelLabel}>GROSS FOOD AMOUNT (PRE-TAX/DISCOUNT)</Text>
                    <Text style={styles.channelAmountDark}>{money(financialData.grossFoodSales)}</Text>
                    <Text style={styles.channelSub}>
                      {financialData.totalInvoicesCount} settled restaurant bills
                    </Text>
                  </View>

                  <View style={[styles.channelCard, { borderColor: LIGHT.roseBorder }]}>
                    <Text style={[styles.channelLabel, { color: LIGHT.rose }]}>CUSTOMER PROMOTIONAL DISCOUNTS (-)</Text>
                    <Text style={[styles.channelAmount, { color: LIGHT.rose }]}>
                      {money(financialData.totalDiscountGiven)}
                    </Text>
                    <Text style={styles.channelSub}>
                      {pctOf(financialData.totalDiscountGiven, financialData.grossFoodSales)} average discount rate
                    </Text>
                  </View>

                  <View style={[styles.channelCard, { borderColor: LIGHT.emeraldBorder }]}>
                    <Text style={[styles.channelLabel, { color: LIGHT.emerald }]}>SALES TAX (GST COLLECTED)</Text>
                    <Text style={[styles.channelAmount, { color: LIGHT.emerald }]}>
                      {money(financialData.totalTaxCollected)}
                    </Text>
                    <Text style={styles.channelSub}>
                      Effective {pctOf(financialData.totalTaxCollected, financialData.grossFoodSales)} • FBR / PRA custody
                    </Text>
                  </View>
                </View>

                <View style={[styles.auditNotesCard, { marginTop: 14 }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={LIGHT.burgundy} />
                  <Text style={styles.auditNotesText}>
                    <Text style={{ fontWeight: '800', color: LIGHT.ink }}>Tax Compliance Summary:</Text> Total net
                    restaurant revenue of {money(financialData.netRestaurantRevenue)} includes{' '}
                    {money(financialData.totalTaxCollected)} in official GST held in fiduciary custody for revenue filing.
                  </Text>
                </View>
              </View>
            </View>
          </AnimatedReveal>
        )}

        {/* ----------------- TAB 6: MENU ENGINEERING ----------------- */}
        {activeTab === 'menu' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              <View style={styles.panelCard}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="fast-food-outline" size={18} color={LIGHT.burgundy} />
                    <Text style={styles.panelTitle}>Top 10 High-Revenue Dishes (Menu Engineering)</Text>
                  </View>
                  <Text style={styles.panelSub}>{financialData.totalPortionsCooked} total portions sold</Text>
                </View>

                <View style={{ marginBottom: 16 }}>
                  <HorizontalRankedBars
                    plain
                    title="Dishes Volume & Contribution"
                    subtitle="Visual sales rank of top performing menu items"
                    items={financialData.topDishes.slice(0, 6).map((d) => ({
                      label: d.name,
                      value: d.revenue,
                      count: d.qty,
                    }))}
                  />
                </View>

                <View style={styles.menuTable}>
                  <View style={styles.menuTableHeader}>
                    <Text style={[styles.mth, { flex: 0.6 }]}>Rank</Text>
                    <Text style={[styles.mth, { flex: 2.3 }]}>Dish Name</Text>
                    <Text style={[styles.mth, { flex: 0.9, textAlign: 'center' }]}>Units</Text>
                    <Text style={[styles.mth, { flex: 1, textAlign: 'right' }]}>Share</Text>
                    <Text style={[styles.mth, { flex: 1.4, textAlign: 'right' }]}>Total Revenue</Text>
                  </View>

                  {financialData.topDishes.length === 0 ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>No dish sales recorded in this window.</Text>
                    </View>
                  ) : (
                    financialData.topDishes.map((dish, idx) => {
                      const medalBg =
                        idx === 0 ? '#FEF3C7' : idx === 1 ? '#F1F5F9' : idx === 2 ? '#FFEDD5' : LIGHT.burgundySoft;
                      const medalColor =
                        idx === 0 ? '#B45309' : idx === 1 ? '#475569' : idx === 2 ? '#C2410C' : LIGHT.burgundy;
                      return (
                        <View key={dish.name} style={styles.menuTableRow}>
                          <View style={{ flex: 0.6 }}>
                            <View style={[styles.rankPill, { backgroundColor: medalBg }]}>
                              <Text style={[styles.rankPillText, { color: medalColor }]}>#{idx + 1}</Text>
                            </View>
                          </View>
                          <Text style={[styles.mtd, { flex: 2.3, fontWeight: '700' }]} numberOfLines={1}>
                            {dish.name}
                          </Text>
                          <Text style={[styles.mtd, { flex: 0.9, textAlign: 'center', fontWeight: '600' }]}>
                            {dish.qty}
                          </Text>
                          <Text style={[styles.mtd, { flex: 1, textAlign: 'right', color: LIGHT.textMuted }]}>
                            {pctOf(dish.revenue, financialData.totalFoodTurnover)}
                          </Text>
                          <Text style={[styles.mtd, { flex: 1.4, textAlign: 'right', color: LIGHT.gold, fontWeight: '800' }]}>
                            {money(dish.revenue)}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </View>
          </AnimatedReveal>
        )}

        {/* ----------------- TAB 7: SHRINKAGE & LOSSES ----------------- */}
        {activeTab === 'shrinkage' && (
          <AnimatedReveal animKey={animTabKey} delay={40}>
            <View style={styles.section}>
              <View style={styles.panelCard}>
                <View style={styles.panelHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="trash-bin-outline" size={18} color={LIGHT.rose} />
                    <Text style={styles.panelTitle}>Loss, Breakage & Shrinkage Audit</Text>
                  </View>
                  <Text style={styles.panelSub}>{timeWindow.shortRange}</Text>
                </View>

                <View
                  style={{
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: 'center',
                    gap: 16,
                    marginBottom: 14,
                  }}
                >
                  <MetricGaugeRing
                    percent={financialData.damageRecoveryRate}
                    label="Recovery Rate"
                    sublabel="Reimbursed"
                    color={financialData.damageRecoveryRate >= 50 ? LIGHT.emerald : LIGHT.amber}
                    size={96}
                  />

                  <View style={[styles.channelGrid, { flex: 1 }]}>
                    <View style={[styles.channelCard, { borderColor: LIGHT.roseBorder }]}>
                      <Text style={[styles.channelLabel, { color: LIGHT.rose }]}>TOTAL BREAKAGE LOSS</Text>
                      <Text style={[styles.channelAmount, { color: LIGHT.rose }]}>
                        {money(financialData.totalBreakageLoss)}
                      </Text>
                      <Text style={styles.channelSub}>Plates, glasses & utensils broken</Text>
                    </View>

                    <View style={[styles.channelCard, { borderColor: LIGHT.emeraldBorder }]}>
                      <Text style={[styles.channelLabel, { color: LIGHT.emerald }]}>RECOVERED AMOUNT</Text>
                      <Text style={[styles.channelAmount, { color: LIGHT.emerald }]}>
                        {money(financialData.totalDamageRecovered)}
                      </Text>
                      <Text style={styles.channelSub}>Recovered from staff / guests</Text>
                    </View>

                    <View style={[styles.channelCard, { borderColor: LIGHT.amberBorder }]}>
                      <Text style={[styles.channelLabel, { color: LIGHT.amber }]}>NET P&L WRITE-OFF</Text>
                      <Text style={[styles.channelAmount, { color: LIGHT.amber }]}>
                        {money(financialData.netBreakageLoss)}
                      </Text>
                      <Text style={styles.channelSub}>Debited directly to bottom line</Text>
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  <HorizontalRankedBars
                    plain
                    title="Damage & Loss by Department"
                    subtitle="Monetary write-offs broken down by service stations"
                    items={Object.entries(financialData.damageDeptMap)
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, val]) => ({
                        label: dept,
                        value: val,
                        color: '#BE123C',
                      }))}
                  />
                </View>

                <View style={[styles.auditNotesCard, { marginTop: 14 }]}>
                  <Ionicons name="construct-outline" size={17} color={LIGHT.burgundy} />
                  <Text style={styles.auditNotesText}>
                    <Text style={{ fontWeight: '800', color: LIGHT.ink }}>Breakage Mitigation:</Text> Open{' '}
                    <Text
                      style={{ color: LIGHT.burgundy, fontWeight: '700', textDecorationLine: 'underline' }}
                      onPress={() => router.push('/admin/damages')}
                    >
                      Damage Control Module
                    </Text>{' '}
                    for micro-level incident logs, attributed staff, and dishwashing pit reports.
                  </Text>
                </View>
              </View>
            </View>
          </AnimatedReveal>
        )}
      </ScrollView>

      {/* ----------------- EXECUTIVE PDF EXPORT STUDIO MODAL ----------------- */}
      <Modal visible={isPdfModalOpen} transparent animationType="fade" onRequestClose={() => setIsPdfModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && { width: '96%' }]}>
            <View style={styles.pdfModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.pdfHeaderIcon}>
                  <Ionicons name="document-text" size={20} color="#FDE68A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pdfModalTitle}>Executive PDF Report Studio</Text>
                  <Text style={styles.pdfModalSub}>
                    A4 Vector Layout • Royal Letterhead • Embedded SVG Charts • Sign-Off Block
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.pdfCloseBtn}
                onPress={() => setIsPdfModalOpen(false)}
                disabled={isExportingPdf}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Document Metadata Summary Strip */}
              <View style={styles.pdfSummaryBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pdfSummaryLabel}>DOCUMENT SCOPE</Text>
                  <Text style={styles.pdfSummaryTitle}>
                    {settings?.restaurantName || 'Sultan Restaurant'} — {timeWindow.label}
                  </Text>
                  <Text style={styles.pdfSummaryMeta}>
                    Range: {timeWindow.shortRange} • Prepared by {user?.name || 'Financial Controller'} •{' '}
                    {selectedPdfSectionCount} sections active
                  </Text>
                </View>
                <View style={styles.pdfFormatPill}>
                  <Text style={styles.pdfFormatPillText}>A4 PDF</Text>
                </View>
              </View>

              {/* Quick Presets */}
              <Text style={styles.pdfSectionTitle}>1. CHOOSE REPORT PRESET</Text>
              <View style={styles.presetGrid}>
                {PDF_PRESETS.map((preset) => {
                  const active = selectedPresetId === preset.id;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={[styles.presetCard, active && styles.presetCardActive]}
                      onPress={() => handleSelectPdfPreset(preset)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Ionicons
                          name={preset.icon as any}
                          size={16}
                          color={active ? LIGHT.burgundy : LIGHT.textMuted}
                        />
                        <Text
                          style={[styles.presetTitle, active && { color: LIGHT.burgundy }]}
                          numberOfLines={1}
                        >
                          {preset.label}
                        </Text>
                      </View>
                      <Text style={styles.presetDesc} numberOfLines={2}>
                        {preset.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Granular Section Toggles */}
              <Text style={[styles.pdfSectionTitle, { marginTop: 16 }]}>2. CUSTOMIZE INCLUDED SECTIONS</Text>
              <View style={styles.sectionChecklist}>
                {[
                  {
                    key: 'includeCharts' as const,
                    label: 'Vector Financial Charts (Waterfall, Donut & Channel Bars)',
                    meta: '3 crisp SVG charts',
                  },
                  {
                    key: 'includePnL' as const,
                    label: 'Formal Profit & Loss Statement (% of Revenue)',
                    meta: `Net ${money(financialData.netOperatingProfit)}`,
                  },
                  {
                    key: 'includeChannelsAndCash' as const,
                    label: 'Cash Register Float & Fulfillment Channels',
                    meta: `Float ${money(financialData.netCashFloat)}`,
                  },
                  {
                    key: 'includeTaxAndDiscounts' as const,
                    label: 'GST Tax Compliance, Discounts & Breakage Summary',
                    meta: `GST ${money(financialData.totalTaxCollected)}`,
                  },
                  {
                    key: 'includeTopDishes' as const,
                    label: 'Top 10 High-Revenue Dishes Ranking',
                    meta: `${financialData.topDishes.length} dishes`,
                  },
                  {
                    key: 'includeKitchenAudit' as const,
                    label: 'Kitchen Store Return & Wastage Reconciliation Table',
                    meta: `${financialData.rawReconciliationList.length} raw items`,
                  },
                  {
                    key: 'includeInvoiceLedger' as const,
                    label: 'Paginated Settled Invoices Appendix',
                    meta: `${Math.min(financialData.validInvoices.length, 150)} of ${financialData.validInvoices.length} bills`,
                  },
                  {
                    key: 'includeSignatures' as const,
                    label: '3-Column Executive Audit Sign-Off & Stamp Block',
                    meta: 'Auditor / CFO / MD',
                  },
                ].map((item) => {
                  const checked = Boolean(pdfOptions[item.key]);
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.checkRow, checked && styles.checkRowActive]}
                      onPress={() => togglePdfSection(item.key)}
                      activeOpacity={0.78}
                    >
                      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
                        {checked && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.checkLabel}>{item.label}</Text>
                      </View>
                      <Text style={styles.checkMeta}>{item.meta}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsPdfModalOpen(false)}
                disabled={isExportingPdf}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtnOutline}
                onPress={() => handlePrintPreviewPdf(pdfOptions)}
                disabled={isExportingPdf || selectedPdfSectionCount === 0}
                activeOpacity={0.82}
              >
                <Ionicons name="print-outline" size={16} color={LIGHT.burgundy} />
                <Text style={styles.actionBtnOutlineText}>Print / Preview A4</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  (isExportingPdf || selectedPdfSectionCount === 0) && { opacity: 0.6 },
                ]}
                onPress={() => handleDownloadPdf(pdfOptions)}
                disabled={isExportingPdf || selectedPdfSectionCount === 0}
                activeOpacity={0.85}
              >
                {isExportingPdf ? (
                  <ActivityIndicator size="small" color="#FDE68A" />
                ) : (
                  <Ionicons name="download-outline" size={17} color="#FDE68A" />
                )}
                <Text style={styles.modalSubmitText}>
                  {isExportingPdf ? 'Generating PDF...' : 'Download PDF (.pdf)'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ----------------- FORMAL P&L CERTIFICATE MODAL ----------------- */}
      <Modal
        visible={isPrintModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPrintModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && { width: '95%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="receipt-outline" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>Formal P&L Financial Certificate</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPrintModalOpen(false)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.printSheet}>
                <View style={styles.printHeader}>
                  <Text style={styles.printRestName}>
                    {(settings?.restaurantName || 'SULTAN RESTAURANT & RESORT').toUpperCase()}
                  </Text>
                  <Text style={styles.printSub}>EXECUTIVE PROFIT & LOSS AUDIT STATEMENT</Text>
                  <Text style={styles.printDate}>
                    PERIOD: {timeWindow.label.toUpperCase()} ({timeWindow.shortRange})
                  </Text>
                  {settings?.ntnOrTaxId ? (
                    <Text style={styles.printDate}>NTN / TAX ID: {settings.ntnOrTaxId}</Text>
                  ) : null}
                </View>

                <View style={styles.printDivider} />

                <View style={styles.printRow}>
                  <Text style={styles.printLabelBold}>A. TOTAL GROSS REVENUE:</Text>
                  <Text style={styles.printValBold}>{money(financialData.totalGrossRevenue)}</Text>
                </View>
                <View style={styles.printSubRow}>
                  <Text style={styles.printLabelSub}>• Food Sales (Dine-in / Takeaway / Delivery):</Text>
                  <Text style={styles.printValSub}>{money(financialData.netRestaurantRevenue)}</Text>
                </View>
                <View style={styles.printSubRow}>
                  <Text style={styles.printLabelSub}>• Basement Playland Rides Revenue:</Text>
                  <Text style={styles.printValSub}>{money(financialData.playlandRevenue)}</Text>
                </View>

                <View style={[styles.printRow, { marginTop: 8 }]}>
                  <Text style={styles.printLabelBold}>B. COST OF GOODS SOLD (COGS):</Text>
                  <Text style={[styles.printValBold, { color: '#B45309' }]}>
                    ({money(financialData.estimatedCOGS)})
                  </Text>
                </View>

                <View style={[styles.printRow, { backgroundColor: '#EFF6FF', padding: 8, borderRadius: 6, marginTop: 4 }]}>
                  <Text style={[styles.printLabelBold, { color: '#1D4ED8' }]}>C. GROSS PROFIT (A - B):</Text>
                  <Text style={[styles.printValBold, { color: '#1D4ED8' }]}>
                    {money(financialData.grossOperatingProfit)} ({financialData.grossMarginPercent.toFixed(1)}%)
                  </Text>
                </View>

                <View style={[styles.printRow, { marginTop: 8 }]}>
                  <Text style={styles.printLabelBold}>D. OPERATING EXPENSES (OPEX):</Text>
                  <Text style={[styles.printValBold, { color: '#BE123C' }]}>({money(financialData.totalOpex)})</Text>
                </View>

                <View style={styles.printRow}>
                  <Text style={styles.printLabelBold}>E. NET BREAKAGE & SHRINKAGE:</Text>
                  <Text style={[styles.printValBold, { color: '#BE123C' }]}>
                    ({money(financialData.netBreakageLoss)})
                  </Text>
                </View>

                <View style={styles.printDivider} />

                <View
                  style={[
                    styles.printRow,
                    {
                      backgroundColor: financialData.netOperatingProfit >= 0 ? '#ECFDF5' : '#FFF1F2',
                      padding: 10,
                      borderRadius: 8,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.printLabelBold,
                      { fontSize: 13.5, color: financialData.netOperatingProfit >= 0 ? '#065F46' : '#9F1239' },
                    ]}
                  >
                    NET OPERATING PROFIT (EBITDA):
                  </Text>
                  <Text
                    style={[
                      styles.printValBold,
                      { fontSize: 16, color: financialData.netOperatingProfit >= 0 ? '#065F46' : '#9F1239' },
                    ]}
                  >
                    {money(financialData.netOperatingProfit)}
                  </Text>
                </View>

                <View style={styles.printSignatures}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 130, height: 1, backgroundColor: '#9CA3AF', marginBottom: 4 }} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#374151' }}>
                      {user?.name || 'Prepared By'}
                    </Text>
                    <Text style={{ fontSize: 9.5, color: '#6B7280' }}>Financial Auditor</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 130, height: 1, backgroundColor: '#9CA3AF', marginBottom: 4 }} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#374151' }}>Managing Director</Text>
                    <Text style={{ fontSize: 9.5, color: '#6B7280' }}>Final Approval & Stamp</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsPrintModalOpen(false)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtnOutline}
                onPress={() => handlePrintPreviewPdf(pnlOnlyOptions)}
                disabled={isExportingPdf}
              >
                <Ionicons name="print-outline" size={16} color={LIGHT.burgundy} />
                <Text style={styles.actionBtnOutlineText}>Print A4</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => handleDownloadPdf(pnlOnlyOptions)}
                disabled={isExportingPdf}
              >
                {isExportingPdf ? (
                  <ActivityIndicator size="small" color="#FDE68A" />
                ) : (
                  <Ionicons name="download-outline" size={17} color="#FDE68A" />
                )}
                <Text style={styles.modalSubmitText}>
                  {isExportingPdf ? 'Building PDF...' : 'Download P&L PDF'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ----------------- SHIFT CLOSING RETURN RECONCILIATION MODAL ----------------- */}
      <Modal
        visible={closingReturnModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setClosingReturnModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isMobile && { width: '95%' }, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="clipboard-outline" size={20} color={LIGHT.burgundy} />
                <Text style={styles.modalTitle}>Reconcile Shift Closing Store Return</Text>
              </View>
              <TouchableOpacity onPress={() => setClosingReturnModalOpen(false)}>
                <Ionicons name="close" size={22} color={LIGHT.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 18 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, color: LIGHT.textSecondary, marginBottom: 12 }}>
                Shift closing ke waqt kitchen se jo un-cooked ya surplus maal wapis main store / cold storage mein
                return aaya hai, uski physical quantity darj karein ta k system live difference aur wastage calculate
                kare:
              </Text>

              {financialData.rawReconciliationList.map((item) => (
                <View key={item.itemId} style={styles.closingReturnRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: LIGHT.ink }}>{item.itemName}</Text>
                    <Text style={{ fontSize: 11, color: LIGHT.textDim }}>
                      Issued: {item.issued} {item.unit} • Cooked: {item.cooked} {item.unit}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: LIGHT.textSecondary }}>Wapis Aya:</Text>
                    <TextInput
                      style={styles.closingInput}
                      keyboardType="numeric"
                      placeholder="0"
                      value={closingReturnCounts[item.itemId] || ''}
                      onChangeText={(val) =>
                        setClosingReturnCounts((prev) => ({ ...prev, [item.itemId]: val }))
                      }
                    />
                    <Text style={{ fontSize: 12, color: LIGHT.textDim }}>{item.unit}</Text>
                  </View>
                </View>
              ))}

              <View style={{ marginTop: 20, flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setClosingReturnModalOpen(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtnPrimary, { flex: 1.5, justifyContent: 'center' }]}
                  onPress={handleSaveClosingReturn}
                >
                  <Ionicons name="save-outline" size={16} color="#FDE68A" />
                  <Text style={styles.actionBtnPrimaryText}>Save & Recalculate</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
    minWidth: 260,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: LIGHT.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.14)',
  },
  brandCrest: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: LIGHT.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: LIGHT.goldLight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: LIGHT.ink,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 12,
    color: LIGHT.textSecondary,
    marginTop: 1,
  },
  auditBadge: {
    backgroundColor: LIGHT.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: LIGHT.goldBorder,
  },
  auditBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.7,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '700',
    color: LIGHT.burgundy,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 15,
    paddingVertical: 8.5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: LIGHT.burgundyDark,
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  toastBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  // Time Filter Bar
  timeFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 18,
    gap: 12,
  },
  timeScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeChipActive: {
    backgroundColor: LIGHT.burgundy,
    borderColor: LIGHT.burgundy,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: LIGHT.textSecondary,
  },
  timeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  rangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: LIGHT.goldBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rangePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  // Sub-Tab Bar
  tabBar: {
    backgroundColor: '#FAFAF9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabScroll: {
    flexDirection: 'row',
    paddingHorizontal: 18,
  },
  subTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  subTabBtnActive: {
    borderBottomColor: LIGHT.burgundy,
    backgroundColor: '#FFFFFF',
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: LIGHT.textMuted,
  },
  subTabTextActive: {
    color: LIGHT.burgundy,
    fontWeight: '800',
  },
  tabMiniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  tabMiniBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  container: {
    flex: 1,
    backgroundColor: LIGHT.bg,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 46,
  },
  // Section Headings
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionStepPill: {
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  sectionStepText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FDE68A',
    letterSpacing: 0.6,
  },
  sectionHeadingTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: LIGHT.ink,
    letterSpacing: -0.1,
  },
  sectionHeadingSub: {
    fontSize: 11.5,
    color: LIGHT.textMuted,
    marginTop: 1,
  },
  // KPI Row
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  kpiCardWrap: {
    flex: 1,
    minWidth: 215,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: LIGHT.cardBg,
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: LIGHT.textMuted,
    letterSpacing: 0.55,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  kpiHint: {
    fontSize: 11,
    color: LIGHT.textMuted,
    marginTop: 5,
  },
  deltaPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  deltaPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  // Executive Health Strip
  healthStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    marginBottom: 18,
  },
  healthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: LIGHT.textMuted,
  },
  healthVal: {
    fontSize: 12.5,
    fontWeight: '900',
    color: LIGHT.ink,
  },
  healthDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#E2E8F0',
  },
  // Gauges
  gaugesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  // Panel Card
  section: {
    marginBottom: 20,
  },
  panelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: LIGHT.ink,
  },
  panelSub: {
    fontSize: 12,
    fontWeight: '700',
    color: LIGHT.gold,
  },
  inlinePdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LIGHT.burgundySoft,
    borderWidth: 1,
    borderColor: 'rgba(82, 23, 27, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 8,
  },
  inlinePdfBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: LIGHT.burgundy,
  },
  // P&L Statement Table
  statementTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  statementColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
  },
  statementColHeadText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 0.7,
  },
  statementCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  statementCatText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: LIGHT.ink,
    letterSpacing: 0.35,
  },
  statementCatPct: {
    width: 76,
    textAlign: 'right',
    fontSize: 11.5,
    fontWeight: '800',
    color: LIGHT.textSecondary,
  },
  statementCatVal: {
    width: 120,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    color: LIGHT.ink,
  },
  statementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8.5,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  statementItem: {
    flex: 1,
    fontSize: 13,
    color: LIGHT.textSecondary,
    fontWeight: '500',
  },
  statementPct: {
    width: 76,
    textAlign: 'right',
    fontSize: 11.5,
    fontWeight: '600',
    color: LIGHT.textMuted,
  },
  statementVal: {
    width: 120,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: LIGHT.ink,
  },
  subtotalRow: {
    backgroundColor: '#FAFAF9',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 10,
  },
  subtotalText: {
    fontSize: 12,
    fontWeight: '800',
    color: LIGHT.ink,
  },
  subtotalValGold: {
    fontSize: 13.5,
    fontWeight: '900',
    color: LIGHT.gold,
  },
  finalNetRow: {
    paddingVertical: 14,
    borderTopWidth: 2,
  },
  finalNetTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  finalNetValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  // Channel Grid
  channelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  channelCard: {
    flex: 1,
    minWidth: 185,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  channelLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: LIGHT.textMuted,
    letterSpacing: 0.4,
  },
  channelAmount: {
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  channelAmountDark: {
    fontSize: 19,
    fontWeight: '900',
    color: LIGHT.ink,
    marginTop: 4,
  },
  channelSub: {
    fontSize: 11,
    color: LIGHT.textSecondary,
    marginTop: 4,
  },
  // Cash Flow
  cashFlowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cashBox: {
    flex: 1,
    minWidth: 210,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  cashBoxLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cashBoxAmount: {
    fontSize: 22,
    fontWeight: '900',
  },
  cashBoxHint: {
    fontSize: 11.5,
    color: LIGHT.textSecondary,
    marginTop: 5,
  },
  auditNotesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 12,
  },
  auditNotesText: {
    fontSize: 12,
    color: LIGHT.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  // Menu & Kitchen Tables
  menuTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  menuTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mth: {
    fontSize: 11,
    fontWeight: '800',
    color: LIGHT.textMuted,
  },
  menuTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rankPill: {
    width: 26,
    height: 24,
    borderRadius: 7,
    backgroundColor: LIGHT.burgundySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankPillText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: LIGHT.burgundy,
  },
  mtd: {
    fontSize: 13,
    color: LIGHT.ink,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: 660,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FAFAF9',
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: LIGHT.ink,
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FAFAF9',
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalCancelText: {
    color: LIGHT.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 18,
    paddingVertical: 9.5,
    borderRadius: 9,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  // PDF Studio Modal Styles
  pdfModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: LIGHT.burgundy,
    borderBottomWidth: 3,
    borderBottomColor: LIGHT.goldLight,
    gap: 12,
  },
  pdfHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfModalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  pdfModalSub: {
    fontSize: 11,
    color: '#FDE68A',
    marginTop: 2,
  },
  pdfCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: LIGHT.goldBorder,
    borderRadius: 12,
    padding: 13,
    marginBottom: 16,
  },
  pdfSummaryLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.7,
  },
  pdfSummaryTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: LIGHT.ink,
    marginTop: 2,
  },
  pdfSummaryMeta: {
    fontSize: 11,
    color: LIGHT.textSecondary,
    marginTop: 2,
  },
  pdfFormatPill: {
    backgroundColor: LIGHT.burgundy,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pdfFormatPillText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FDE68A',
    letterSpacing: 0.6,
  },
  pdfSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: LIGHT.textMuted,
    letterSpacing: 0.7,
    marginBottom: 9,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 220,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    padding: 11,
  },
  presetCardActive: {
    backgroundColor: '#FFF8F6',
    borderColor: LIGHT.burgundy,
    borderWidth: 1.5,
  },
  presetTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: LIGHT.ink,
    flex: 1,
  },
  presetDesc: {
    fontSize: 11,
    color: LIGHT.textSecondary,
    lineHeight: 15,
  },
  sectionChecklist: {
    gap: 7,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9.5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  checkRowActive: {
    borderColor: 'rgba(82, 23, 27, 0.25)',
    backgroundColor: '#FDFBF9',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    backgroundColor: LIGHT.burgundy,
    borderColor: LIGHT.burgundy,
  },
  checkLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: LIGHT.ink,
  },
  checkMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: LIGHT.textMuted,
  },
  // Printable Sheet
  printSheet: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    borderRadius: 10,
  },
  printHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  printRestName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1,
  },
  printSub: {
    fontSize: 11,
    fontWeight: '800',
    color: LIGHT.burgundy,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  printDate: {
    fontSize: 11,
    color: '#4B5563',
    marginTop: 3,
  },
  printDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 10,
  },
  printRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  printSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingLeft: 10,
  },
  printLabelBold: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
  },
  printValBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  printLabelSub: {
    fontSize: 11,
    color: '#4B5563',
  },
  printValSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  printSignatures: {
    marginTop: 26,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // Charts & Visual Layout Styles
  chartsGrid: {
    gap: 16,
  },
  chartCol: {
    flex: 1,
  },
  chartPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  chartPanelHeader: {
    marginBottom: 12,
  },
  chartPanelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartPanelSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  // Kitchen Report Styles
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reconBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  reconBadgeOptimal: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  reconBadgeAcceptable: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  reconBadgeAlert: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  reconBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closingReturnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  closingInput: {
    width: 75,
    height: 36,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700',
    color: '#0F172A',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
});
