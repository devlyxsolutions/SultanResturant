import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
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
import { Ionicons } from '@expo/vector-icons';
import {
  useSystemLogStore,
  type AuditActionType,
  type AuditSeverity,
  type SystemLogAnalytics,
  type SystemLogEntry,
} from '../store/systemLogStore';
import { useAuthStore } from '../store/authStore';
import { useRestaurantStore } from '../store/restaurantStore';
import {
  fetchServerSystemLogs,
  flushAuditLogQueue,
  getSystemLogsExportUrl,
} from '../services/auditLogService';
import { getActiveServerHttpUrl } from '../services/syncService';

const BRAND = {
  burgundy: '#52141C',
  burgundyDark: '#260509',
  gold: '#D4AF37',
  goldLight: '#FEF3C7',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  ink: '#0F172A',
  muted: '#64748B',
};

const ROLE_FILTERS = [
  'ALL',
  'Master Admin',
  'Admin',
  'Cashier',
  'Manager',
  'Floor Manager',
  'Order Taker',
  'Kitchen',
  'Juice Bar',
  'Delivery',
  'Playland',
  'Customer',
  'System',
];

const ACTION_TYPE_FILTERS: ('ALL' | AuditActionType)[] = [
  'ALL',
  'PLACE',
  'PAYMENT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'CANCEL',
  'VOID',
  'REFUND',
  'STATUS_CHANGE',
  'TRANSFER',
  'AUTH',
  'SECURITY',
  'PRINT',
  'NAVIGATION',
  'SYSTEM',
];

const SEVERITY_FILTERS: ('ALL' | AuditSeverity)[] = ['ALL', 'critical', 'warning', 'success', 'info'];

const MODULE_FILTERS = [
  { key: 'ALL', label: 'All Modules' },
  { key: 'POS_ORDERS', label: 'POS & Orders' },
  { key: 'INVOICES_BILLING', label: 'Invoices & Bills' },
  { key: 'RETURNS_REFUNDS', label: 'Returns & Refunds' },
  { key: 'KITCHEN_KDS', label: 'Kitchen KDS' },
  { key: 'JUICE_BAR', label: 'Juice Bar' },
  { key: 'ONLINE_DELIVERY', label: 'Online & Delivery' },
  { key: 'TABLES_FLOORS', label: 'Tables & Floors' },
  { key: 'INVENTORY_STOCK', label: 'Inventory & Stock' },
  { key: 'SUPPLIERS_PO', label: 'Suppliers & POs' },
  { key: 'EXPENSES_ASSETS', label: 'Expenses & Assets' },
  { key: 'DAMAGES', label: 'Damages' },
  { key: 'KITCHEN_HANDOVER', label: 'Kitchen Handover' },
  { key: 'RECIPES_BOM', label: 'Recipes BOM' },
  { key: 'SHIFTS_CASH', label: 'Shifts & Cash' },
  { key: 'STAFF_HR', label: 'Staff & HR' },
  { key: 'ROLES_SECURITY', label: 'Roles & Security' },
  { key: 'MENU_CATALOG', label: 'Menu Catalog' },
  { key: 'CUSTOMERS_CRM', label: 'Customers CRM' },
  { key: 'RESERVATIONS', label: 'Reservations' },
  { key: 'DISCOUNTS_PROMOS', label: 'Discounts' },
  { key: 'PLAYLAND', label: 'Playland' },
  { key: 'CALL_CENTER', label: 'Call Center' },
  { key: 'PRINTING', label: 'Printing' },
  { key: 'AUTH', label: 'Logins & Auth' },
  { key: 'SETTINGS', label: 'Settings' },
  { key: 'NAVIGATION', label: 'Page Visits' },
];

type DatePreset = 'all' | '1h' | 'today' | '24h' | '7d';

function getSeverityMeta(severity: string) {
  switch (severity) {
    case 'critical':
      return { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: 'alert-circle' as const, label: 'CRITICAL' };
    case 'warning':
      return { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: 'warning' as const, label: 'WARNING' };
    case 'success':
      return { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: 'checkmark-circle' as const, label: 'SUCCESS' };
    default:
      return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: 'information-circle' as const, label: 'INFO' };
  }
}

function getActionBadgeStyle(actionType: string) {
  switch (actionType) {
    case 'DELETE':
    case 'VOID':
    case 'CANCEL':
      return { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' };
    case 'REFUND':
    case 'SECURITY':
    case 'TRANSFER':
      return { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' };
    case 'PLACE':
    case 'PAYMENT':
    case 'CREATE':
      return { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' };
    case 'AUTH':
      return { bg: '#EDE9FE', text: '#6D28D9', border: '#C4B5FD' };
    case 'PRINT':
      return { bg: '#E0F2FE', text: '#0369A1', border: '#7DD3FC' };
    case 'NAVIGATION':
      return { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
    default:
      return { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD' };
  }
}

function formatExactTime(ts: number): { time: string; date: string } {
  const d = new Date(ts || Date.now());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return { time: `${hh}:${mm}:${ss}.${ms}`, date };
}

function getDateFromForPreset(preset: DatePreset): number | undefined {
  const now = Date.now();
  if (preset === '1h') return now - 60 * 60 * 1000;
  if (preset === '24h') return now - 24 * 60 * 60 * 1000;
  if (preset === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (preset === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  return undefined;
}

export default function SystemLogsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const user = useAuthStore((s) => s.user);
  const liveStoreLogs = useSystemLogStore((s) => s.logs);
  const storeAnalytics = useSystemLogStore((s) => s.analytics);
  const isLivePaused = useSystemLogStore((s) => s.isLivePaused);
  const setLivePaused = useSystemLogStore((s) => s.setLivePaused);
  const cancelledOrderLogs = useRestaurantStore((s) => s.cancelledOrderLogs) || [];

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [actorFilter, setActorFilter] = useState('ALL');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionTypeFilter, setActionTypeFilter] = useState<'ALL' | AuditActionType>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | AuditSeverity>('ALL');
  const [cancelOnlyFilter, setCancelOnlyFilter] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);

  // Server query state
  const [serverLogs, setServerLogs] = useState<SystemLogEntry[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverAnalytics, setServerAnalytics] = useState<SystemLogAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [limit, setLimit] = useState(200);
  const [selectedLog, setSelectedLog] = useState<SystemLogEntry | null>(null);
  const [serverReachable, setServerReachable] = useState(true);

  const loadFromServer = useCallback(
    async (customLimit?: number) => {
      setIsLoading(true);
      try {
        await flushAuditLogQueue();
        const dateFrom = getDateFromForPreset(datePreset);
        const res = await fetchServerSystemLogs({
          q: searchQuery.trim() || undefined,
          role: roleFilter,
          actor: actorFilter,
          module: moduleFilter,
          actionType: actionTypeFilter,
          severity: severityFilter,
          dateFrom,
          limit: customLimit ?? limit,
          offset: 0,
        });
        setServerReachable(res.ok);
        if (res.ok) {
          setServerLogs(res.logs);
          setServerTotal(res.total);
          if (res.analytics) setServerAnalytics(res.analytics);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, roleFilter, actorFilter, moduleFilter, actionTypeFilter, severityFilter, datePreset, limit]
  );

  // Initial & filter-triggered fetch
  useEffect(() => {
    const t = setTimeout(() => {
      void loadFromServer();
    }, 150);
    return () => clearTimeout(t);
  }, [loadFromServer]);

  // Periodic background refresh for analytics numbers while live
  useEffect(() => {
    if (isLivePaused) return;
    const iv = setInterval(() => {
      void loadFromServer();
    }, 6000);
    return () => clearInterval(iv);
  }, [isLivePaused, loadFromServer]);

  // Merge live WebSocket/client logs AND synced cancelledOrderLogs seamlessly into current filtered view
  const displayedLogs = useMemo(() => {
    const byId = new Map<string, SystemLogEntry>();
    for (const l of serverLogs) {
      if (l?.id) byId.set(l.id, l);
    }
    const q = searchQuery.trim().toLowerCase();
    const dateFrom = getDateFromForPreset(datePreset) || 0;
    const isCancelEntry = (l: SystemLogEntry) =>
      ['CANCEL', 'VOID', 'REFUND', 'DELETE'].includes(l.actionType) ||
      String(l.action || '').toUpperCase().includes('CANCEL') ||
      String(l.action || '').toUpperCase().includes('VOID') ||
      String(l.action || '').toUpperCase().includes('RETURN');

    if (!isLivePaused) {
      for (const l of liveStoreLogs) {
        if (!l?.id || byId.has(l.id)) continue;
        byId.set(l.id, l);
      }
    }

    // Also synthesize any synced CancelledOrderLog from restaurantStore so every Order Taker / POS / Invoice cancel is always visible & highlighted
    const existingTimestamps = new Set(Array.from(byId.values()).map((x) => `${x.entityId || ''}_${Math.floor((x.timestamp || 0) / 3000)}`));
    cancelledOrderLogs.forEach((c, idx) => {
      if (!c || !c.id) return;
      const synId = `syn_${c.id}`;
      const timeKey = `${c.ticketId || ''}_${Math.floor((c.cancelledAt || 0) / 3000)}`;
      if (byId.has(synId) || existingTimestamps.has(timeKey)) return;
      const srcWhere =
        c.source === 'order_taker_cancel'
          ? 'ORDER TAKER'
          : c.source === 'void_invoice'
            ? 'INVOICE VOID'
            : c.source === 'sales_return'
              ? 'INVOICE RETURN'
              : c.source === 'online_order_cancel'
                ? 'ONLINE ORDER'
                : c.source === 'removed_at_billing'
                  ? 'POS BILLING'
                  : c.source === 'pos_cart_remove'
                    ? 'POS CART'
                    : c.source === 'release_table'
                      ? 'TABLE RELEASE'
                      : 'POS / KOT';
      const itemList = (c.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ');
      const ts = c.cancelledAt || Date.now();
      byId.set(synId, {
        id: synId,
        seq: 90000 + idx,
        timestamp: ts,
        isoTime: new Date(ts).toISOString(),
        actorId: c.cancelledBy || 'staff',
        actorName: c.cancelledBy || c.server || 'Staff',
        actorRole: c.cancelledByRole || (c.source === 'order_taker_cancel' ? 'Order Taker' : 'Cashier'),
        module: c.source === 'void_invoice' || c.source === 'sales_return' ? 'INVOICES_BILLING' : 'POS_ORDERS',
        action: `CANCEL_${String(c.source || 'ORDER').toUpperCase()}`,
        actionType: c.source === 'void_invoice' ? 'VOID' : c.source === 'sales_return' ? 'REFUND' : 'CANCEL',
        severity: 'critical',
        entityType: 'Ticket',
        entityId: c.ticketId,
        entityName: `${c.tableName || c.tableId} (${c.ticketId})`,
        amount: c.totalAmount,
        summary: `[${srcWhere}] Cancelled ${c.totalQty} item(s) (Rs. ${Number(c.totalAmount || 0).toLocaleString()}: ${itemList || 'Order'}) on ${c.tableName || c.tableId} • Reason: "${c.reason}"`,
        page: c.source === 'order_taker_cancel' ? '/waiter/order' : c.source === 'void_invoice' ? '/admin/invoices' : '/pos',
        deviceId: 'synced-ledger',
        deviceName: srcWhere,
        platform: 'web',
        source: 'client',
        details: {
          ticketId: c.ticketId,
          tableId: c.tableId,
          tableName: c.tableName,
          floor: c.floor,
          source: c.source,
          reason: c.reason,
          cancelledBy: c.cancelledBy,
          cancelledByRole: c.cancelledByRole,
          totalQty: c.totalQty,
          totalAmount: c.totalAmount,
          items: c.items,
        },
      });
    });

    return Array.from(byId.values())
      .filter((l) => {
        if (dateFrom > 0 && l.timestamp < dateFrom) return false;
        if (cancelOnlyFilter && !isCancelEntry(l)) return false;
        if (roleFilter !== 'ALL' && l.actorRole.toLowerCase() !== roleFilter.toLowerCase()) return false;
        if (actorFilter !== 'ALL' && l.actorName.toLowerCase() !== actorFilter.toLowerCase()) return false;
        if (moduleFilter !== 'ALL' && l.module !== moduleFilter) return false;
        if (actionTypeFilter !== 'ALL' && l.actionType !== actionTypeFilter) return false;
        if (severityFilter !== 'ALL' && l.severity !== severityFilter) return false;
        if (q) {
          const hay = `${l.actorName} ${l.actorUsername || ''} ${l.actorRole} ${l.module} ${l.action} ${l.actionType} ${l.summary} ${l.entityName || ''} ${l.entityId || ''} ${l.page} ${l.deviceName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.timestamp - a.timestamp) || (b.seq - a.seq));
  }, [
    serverLogs,
    liveStoreLogs,
    cancelledOrderLogs,
    isLivePaused,
    searchQuery,
    roleFilter,
    actorFilter,
    moduleFilter,
    actionTypeFilter,
    severityFilter,
    cancelOnlyFilter,
    datePreset,
  ]);

  // Live fallback analytics when offline
  const effectiveAnalytics: SystemLogAnalytics = useMemo(() => {
    if (serverAnalytics) return serverAnalytics;
    if (storeAnalytics) return storeAnalytics;
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const byRole: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    const byActionType: Record<string, number> = {};
    const bySeverity: Record<string, number> = { info: 0, success: 0, warning: 0, critical: 0 };
    const actors = new Map<string, { name: string; role: string; count: number; lastSeen: number }>();
    let todayCount = 0;
    let lastHourCount = 0;
    let lastMinuteCount = 0;
    let criticalCount = 0;
    let cancelVoidDeleteCount = 0;

    for (const l of displayedLogs) {
      if (l.timestamp >= startOfDay.getTime()) todayCount++;
      if (l.timestamp >= now - 3600000) lastHourCount++;
      if (l.timestamp >= now - 60000) lastMinuteCount++;
      if (l.severity === 'critical') criticalCount++;
      if (['CANCEL', 'VOID', 'DELETE', 'REFUND'].includes(l.actionType)) cancelVoidDeleteCount++;
      byRole[l.actorRole] = (byRole[l.actorRole] || 0) + 1;
      byModule[l.module] = (byModule[l.module] || 0) + 1;
      byActionType[l.actionType] = (byActionType[l.actionType] || 0) + 1;
      bySeverity[l.severity] = (bySeverity[l.severity] || 0) + 1;
      const key = `${l.actorName}::${l.actorRole}`;
      const existing = actors.get(key);
      if (existing) {
        existing.count++;
        if (l.timestamp > existing.lastSeen) existing.lastSeen = l.timestamp;
      } else {
        actors.set(key, { name: l.actorName, role: l.actorRole, count: 1, lastSeen: l.timestamp });
      }
    }
    return {
      totalStored: Math.max(serverTotal, displayedLogs.length),
      todayCount,
      lastHourCount,
      lastMinuteCount,
      criticalCount,
      cancelVoidDeleteCount,
      uniqueActorsCount: actors.size,
      byRole,
      byModule,
      byActionType,
      bySeverity,
      topActors: Array.from(actors.values()).sort((a, b) => b.count - a.count).slice(0, 15),
    };
  }, [serverAnalytics, storeAnalytics, displayedLogs, serverTotal]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    roleFilter !== 'ALL' ||
    actorFilter !== 'ALL' ||
    moduleFilter !== 'ALL' ||
    actionTypeFilter !== 'ALL' ||
    severityFilter !== 'ALL' ||
    cancelOnlyFilter ||
    datePreset !== 'all';

  const resetAllFilters = () => {
    setSearchQuery('');
    setRoleFilter('ALL');
    setActorFilter('ALL');
    setModuleFilter('ALL');
    setActionTypeFilter('ALL');
    setSeverityFilter('ALL');
    setCancelOnlyFilter(false);
    setDatePreset('all');
  };

  const handleExport = (format: 'csv' | 'json') => {
    const url = getSystemLogsExportUrl(format, {
      q: searchQuery.trim() || undefined,
      role: roleFilter,
      actor: actorFilter,
      module: moduleFilter,
      actionType: actionTypeFilter,
      severity: severityFilter,
      dateFrom: getDateFromForPreset(datePreset),
    });
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleArchiveLogs = () => {
    const msg =
      'Archive current system logs to a timestamped backup file on the server and start a fresh active view? (No data is permanently lost — archive is saved on disk.)';
    const execute = async () => {
      const baseUrl = getActiveServerHttpUrl();
      if (!baseUrl) return;
      try {
        const res = await fetch(`${baseUrl}/api/system-logs/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actorId: user?.staffId || user?.id,
            actorName: user?.name || 'Admin',
            actorRole: user?.username === 'master' ? 'Master Admin' : 'Admin',
          }),
        });
        const data = await res.json();
        if (data?.success) {
          useSystemLogStore.getState().clearLocalLogs();
          void loadFromServer();
          const doneMsg = `Archived ${data.archivedCount} logs into ${data.archiveName || 'disk backup'}.`;
          if (Platform.OS === 'web') window.alert(doneMsg);
          else Alert.alert('Archived', doneMsg);
        }
      } catch {}
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) void execute();
    } else {
      Alert.alert('Archive System Logs', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive Now', style: 'destructive', onPress: () => void execute() },
      ]);
    }
  };

  const renderLogRow = useCallback(({ item }: { item: SystemLogEntry }) => {
    const sev = getSeverityMeta(item.severity);
    const actBadge = getActionBadgeStyle(item.actionType);
    const { time, date } = formatExactTime(item.timestamp);

    const isCancelHighlight =
      ['CANCEL', 'VOID', 'REFUND', 'DELETE'].includes(item.actionType) ||
      String(item.action || '').toUpperCase().includes('CANCEL') ||
      String(item.action || '').toUpperCase().includes('VOID') ||
      String(item.action || '').toUpperCase().includes('RETURN');

    const cancelOriginLabel = isCancelHighlight
      ? item.page?.includes('/waiter') || item.actorRole?.toLowerCase().includes('order taker') || item.details?.source === 'order_taker_cancel'
        ? 'ORDER TAKER'
        : item.module === 'INVOICES_BILLING' || item.module === 'RETURNS_REFUNDS' || item.actionType === 'VOID' || item.actionType === 'REFUND'
          ? 'INVOICE / BILL'
          : item.module === 'ONLINE_DELIVERY' || item.details?.source === 'online_order_cancel'
            ? 'ONLINE ORDER'
            : 'POS TERMINAL'
      : null;

    const cancelledDishes: { name: string; qty?: number }[] =
      isCancelHighlight && Array.isArray(item.details?.items) ? item.details.items : [];

    return (
      <TouchableOpacity
        style={[
          styles.logRow,
          item.severity === 'critical' && styles.logRowCritical,
          isCancelHighlight && styles.logRowCancelHighlight,
        ]}
        onPress={() => setSelectedLog(item)}
        activeOpacity={0.82}
      >
        {/* Left Severity Accent Strip */}
        <View style={[styles.severityStripe, { backgroundColor: isCancelHighlight ? '#DC2626' : sev.color }, isCancelHighlight && { width: 8 }]} />

        <View style={styles.logRowContent}>
          {/* Top Highlight Banner for ALL Cancel / Void / Return Events */}
          {isCancelHighlight && (
            <View style={styles.cancelHighlightRibbon}>
              <View style={styles.cancelFlashBadge}>
                <Ionicons name="warning" size={12} color="#FFFFFF" />
                <Text style={styles.cancelFlashBadgeText}>
                  🚨 {item.actionType === 'VOID' ? 'INVOICE VOIDED' : item.actionType === 'REFUND' ? 'RETURN / REFUND' : 'CANCELLED'}
                </Text>
              </View>
              {cancelOriginLabel && (
                <View style={styles.cancelOriginBadge}>
                  <Text style={styles.cancelOriginBadgeText}>📍 {cancelOriginLabel}</Text>
                </View>
              )}
              {item.entityName ? (
                <Text style={styles.cancelEntityText} numberOfLines={1}>
                  {item.entityName}
                </Text>
              ) : null}
              <View style={{ flex: 1 }} />
              {typeof item.amount === 'number' && item.amount > 0 && (
                <View style={styles.cancelAmountBadge}>
                  <Text style={styles.cancelAmountBadgeText}>- Rs. {item.amount.toLocaleString()}</Text>
                </View>
              )}
            </View>
          )}

          {/* Top Metadata Line */}
          <View style={styles.logTopLine}>
            <View style={styles.timePill}>
              <Ionicons name="time-outline" size={11} color="#475569" />
              <Text style={styles.timeText}>{time}</Text>
              <Text style={styles.dateText}>{date}</Text>
            </View>

            <View style={[styles.actionBadge, { backgroundColor: actBadge.bg, borderColor: actBadge.border }]}>
              <Text style={[styles.actionBadgeText, { color: actBadge.text }]}>{item.actionType}</Text>
            </View>

            <View style={styles.moduleBadge}>
              <Text style={styles.moduleBadgeText}>{item.module.replace(/_/g, ' ')}</Text>
            </View>

            {typeof item.amount === 'number' && item.amount > 0 && !isCancelHighlight && (
              <View style={styles.amountPill}>
                <Text style={styles.amountPillText}>Rs. {item.amount.toLocaleString()}</Text>
              </View>
            )}

            <View style={{ flex: 1 }} />

            <Text style={styles.seqLabel}>#{item.seq}</Text>
          </View>

          {/* Main Human-Readable Summary */}
          <Text style={[styles.logSummary, isCancelHighlight && styles.logSummaryCancelHighlight]} numberOfLines={3}>
            {item.summary}
          </Text>

          {/* Highlighted Cancelled Dishes Chips */}
          {isCancelHighlight && cancelledDishes.length > 0 && (
            <View style={styles.cancelDishesBox}>
              {cancelledDishes.slice(0, 6).map((d, idx) => (
                <View key={idx} style={styles.cancelDishChip}>
                  <Text style={styles.cancelDishChipText}>
                    ✕ {d.qty || 1}× {d.name}
                  </Text>
                </View>
              ))}
              {cancelledDishes.length > 6 && (
                <Text style={styles.cancelDishMoreText}>+{cancelledDishes.length - 6} more</Text>
              )}
            </View>
          )}

          {/* Bottom Actor / Role / Page / Device Line */}
          <View style={styles.logBottomLine}>
            <View style={styles.actorPill}>
              <Ionicons name="person" size={11} color={BRAND.burgundy} />
              <Text style={styles.actorNameText}>{item.actorName}</Text>
              <View style={styles.roleTag}>
                <Text style={styles.roleTagText}>{item.actorRole}</Text>
              </View>
            </View>

            <View style={styles.metaChip}>
              <Ionicons name="document-text-outline" size={11} color="#64748B" />
              <Text style={styles.metaChipText} numberOfLines={1}>{item.page}</Text>
            </View>

            <View style={styles.metaChip}>
              <Ionicons name={item.source === 'server' ? 'server-outline' : 'laptop-outline'} size={11} color="#64748B" />
              <Text style={styles.metaChipText} numberOfLines={1}>
                {item.deviceName}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, []);

  const ordersAndPaymentsCount =
    (effectiveAnalytics.byActionType?.PLACE || 0) +
    (effectiveAnalytics.byActionType?.PAYMENT || 0) +
    (effectiveAnalytics.byActionType?.REFUND || 0);

  return (
    <View style={styles.container}>
      {/* ================= HEADER ================= */}
      <View style={[styles.headerBar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconOrb}>
            <Ionicons name="shield-checkmark" size={22} color={BRAND.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.headerTitle}>System Logs & Live Audit Trail</Text>
              <View style={[styles.liveBadge, isLivePaused && styles.liveBadgePaused]}>
                <View style={[styles.liveDot, isLivePaused && { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.liveBadgeText, isLivePaused && { color: '#B45309' }]}>
                  {isLivePaused ? 'PAUSED' : serverReachable ? 'LIVE STREAM' : 'LOCAL CACHE'}
                </Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              Every action across Admin, Cashier, Order Taker, Kitchen, Juice Bar, Delivery, Playland & QR Menu • Millisecond Precision
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerBtn, isLivePaused && styles.headerBtnHighlight]}
            onPress={() => setLivePaused(!isLivePaused)}
          >
            <Ionicons name={isLivePaused ? 'play' : 'pause'} size={14} color={isLivePaused ? '#FFFFFF' : BRAND.burgundy} />
            <Text style={[styles.headerBtnText, isLivePaused && { color: '#FFFFFF' }]}>
              {isLivePaused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtn} onPress={() => void loadFromServer()}>
            {isLoading ? (
              <ActivityIndicator size="small" color={BRAND.burgundy} />
            ) : (
              <Ionicons name="refresh" size={14} color={BRAND.burgundy} />
            )}
            <Text style={styles.headerBtnText}>Refresh</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtnGold} onPress={() => handleExport('csv')}>
            <Ionicons name="download-outline" size={14} color="#1A0306" />
            <Text style={styles.headerBtnGoldText}>CSV</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtn} onPress={() => handleExport('json')}>
            <Ionicons name="code-slash-outline" size={14} color={BRAND.burgundy} />
            <Text style={styles.headerBtnText}>JSON</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerBtnDanger} onPress={handleArchiveLogs}>
            <Ionicons name="archive-outline" size={14} color="#B91C1C" />
            <Text style={styles.headerBtnDangerText}>Archive</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ================= REAL-TIME ANALYTICS KPI STRIP ================= */}
      <View style={[styles.kpiGrid, isMobile && { flexWrap: 'wrap' }]}>
        <TouchableOpacity style={styles.kpiCard} onPress={resetAllFilters} activeOpacity={0.85}>
          <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="pulse" size={18} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>TOTAL LOGS STORED</Text>
            <Text style={styles.kpiValue}>{effectiveAnalytics.totalStored.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>
              Today: {effectiveAnalytics.todayCount.toLocaleString()} • 1m: {effectiveAnalytics.lastMinuteCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.kpiCard, cancelOnlyFilter && styles.kpiCardActiveDanger]}
          onPress={() => setCancelOnlyFilter(!cancelOnlyFilter)}
          activeOpacity={0.85}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>🚨 CANCELLATIONS / VOIDS</Text>
            <Text style={[styles.kpiValue, { color: '#DC2626' }]}>
              {Math.max(effectiveAnalytics.cancelVoidDeleteCount, cancelledOrderLogs.length).toLocaleString()}
            </Text>
            <Text style={[styles.kpiSub, cancelOnlyFilter && { color: '#B91C1C', fontWeight: '800' }]}>
              {cancelOnlyFilter ? 'Showing ONLY Cancellations (Tap to reset)' : 'Order Taker • POS • Invoices (Tap to filter)'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.kpiCard}
          onPress={() => setActionTypeFilter(actionTypeFilter === 'PAYMENT' ? 'ALL' : 'PAYMENT')}
          activeOpacity={0.85}
        >
          <View style={[styles.kpiIconBox, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="receipt" size={18} color="#16A34A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>ORDERS & PAYMENTS</Text>
            <Text style={[styles.kpiValue, { color: '#15803D' }]}>{ordersAndPaymentsCount.toLocaleString()}</Text>
            <Text style={styles.kpiSub}>
              Placed: {effectiveAnalytics.byActionType?.PLACE || 0} • Paid: {effectiveAnalytics.byActionType?.PAYMENT || 0}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBox, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="people" size={18} color="#B45309" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>ACTIVE PEOPLE TRACKED</Text>
            <Text style={styles.kpiValue}>{effectiveAnalytics.uniqueActorsCount}</Text>
            <Text style={styles.kpiSub} numberOfLines={1}>
              {effectiveAnalytics.topActors[0]
                ? `Top: ${effectiveAnalytics.topActors[0].name} (${effectiveAnalytics.topActors[0].count})`
                : 'All roles monitored'}
            </Text>
          </View>
        </View>
      </View>

      {/* ================= SEARCH + FILTER COLLAPSE BAR ================= */}
      <View style={styles.searchToolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search person, role, table, invoice, dish, cancel, void, page route, device..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.datePresetRow}>
          {([
            { k: 'all', label: 'All' },
            { k: '1h', label: '1 Hr' },
            { k: 'today', label: 'Today' },
            { k: '24h', label: '24h' },
            { k: '7d', label: '7d' },
          ] as { k: DatePreset; label: string }[]).map((p) => (
            <TouchableOpacity
              key={p.k}
              style={[styles.dateBtn, datePreset === p.k && styles.dateBtnActive]}
              onPress={() => setDatePreset(p.k)}
            >
              <Text style={[styles.dateBtnText, datePreset === p.k && styles.dateBtnTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.filterToggleBtn, showFiltersPanel && styles.filterToggleBtnActive]}
          onPress={() => setShowFiltersPanel(!showFiltersPanel)}
        >
          <Ionicons name="options-outline" size={14} color={showFiltersPanel ? '#FFFFFF' : BRAND.burgundy} />
          <Text style={[styles.filterToggleText, showFiltersPanel && { color: '#FFFFFF' }]}>Filters</Text>
        </TouchableOpacity>

        {hasActiveFilters && (
          <TouchableOpacity style={styles.clearFiltersBtn} onPress={resetAllFilters}>
            <Ionicons name="close" size={13} color="#DC2626" />
            <Text style={styles.clearFiltersText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ================= MULTI-DIMENSION FILTERS PANEL ================= */}
      {showFiltersPanel && (
        <View style={styles.filtersPanel}>
          {/* 1. Role Breakdown Filter Row */}
          <View style={styles.filterRowWrap}>
            <Text style={styles.filterRowLabel}>ROLE:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {ROLE_FILTERS.map((r) => {
                const count = r === 'ALL' ? effectiveAnalytics.totalStored : (effectiveAnalytics.byRole?.[r] || 0);
                const active = roleFilter === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setRoleFilter(r)}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {r === 'ALL' ? 'All Roles' : r}
                    </Text>
                    <View style={[styles.pillCount, active && styles.pillCountActive]}>
                      <Text style={[styles.pillCountText, active && styles.pillCountTextActive]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 2. Action Type + Severity Row */}
          <View style={styles.filterRowWrap}>
            <Text style={styles.filterRowLabel}>ACTION:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {ACTION_TYPE_FILTERS.map((at) => {
                const count = at === 'ALL' ? effectiveAnalytics.totalStored : (effectiveAnalytics.byActionType?.[at] || 0);
                const active = actionTypeFilter === at;
                return (
                  <TouchableOpacity
                    key={at}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setActionTypeFilter(at)}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {at === 'ALL' ? 'All Actions' : at}
                    </Text>
                    {count > 0 && (
                      <View style={[styles.pillCount, active && styles.pillCountActive]}>
                        <Text style={[styles.pillCountText, active && styles.pillCountTextActive]}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 3. Module Filter Row */}
          <View style={styles.filterRowWrap}>
            <Text style={styles.filterRowLabel}>MODULE:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {MODULE_FILTERS.map((m) => {
                const count = m.key === 'ALL' ? effectiveAnalytics.totalStored : (effectiveAnalytics.byModule?.[m.key] || 0);
                const active = moduleFilter === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setModuleFilter(m.key)}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{m.label}</Text>
                    {count > 0 && m.key !== 'ALL' && (
                      <View style={[styles.pillCount, active && styles.pillCountActive]}>
                        <Text style={[styles.pillCountText, active && styles.pillCountTextActive]}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 4. Severity & People Quick Chips */}
          <View style={styles.filterRowWrap}>
            <Text style={styles.filterRowLabel}>LEVEL:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {SEVERITY_FILTERS.map((sv) => {
                const active = severityFilter === sv;
                return (
                  <TouchableOpacity
                    key={sv}
                    style={[
                      styles.pill,
                      active && styles.pillActive,
                      sv === 'critical' && !active && { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
                    ]}
                    onPress={() => setSeverityFilter(sv)}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        sv === 'critical' && !active && { color: '#DC2626' },
                        active && styles.pillTextActive,
                      ]}
                    >
                      {sv === 'ALL' ? 'All Levels' : sv.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {effectiveAnalytics.topActors.length > 0 && (
                <>
                  <View style={styles.pillDivider} />
                  <TouchableOpacity
                    style={[styles.pill, actorFilter === 'ALL' && styles.pillActiveGold]}
                    onPress={() => setActorFilter('ALL')}
                  >
                    <Text style={[styles.pillText, actorFilter === 'ALL' && { color: '#1A0306', fontWeight: '800' }]}>
                      All People
                    </Text>
                  </TouchableOpacity>
                  {effectiveAnalytics.topActors.slice(0, 12).map((a) => {
                    const active = actorFilter === a.name;
                    return (
                      <TouchableOpacity
                        key={`${a.name}-${a.role}`}
                        style={[styles.pill, active && styles.pillActiveGold]}
                        onPress={() => setActorFilter(active ? 'ALL' : a.name)}
                      >
                        <Ionicons name="person-outline" size={11} color={active ? '#1A0306' : BRAND.burgundy} />
                        <Text style={[styles.pillText, active && { color: '#1A0306', fontWeight: '800' }]}>
                          {a.name} ({a.count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ================= RESULTS STATUS BAR ================= */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsText}>
          Showing <Text style={{ fontWeight: '800', color: BRAND.ink }}>{displayedLogs.length.toLocaleString()}</Text> event(s)
          {actorFilter !== 'ALL' ? ` • Person: ${actorFilter}` : ''}
          {roleFilter !== 'ALL' ? ` • Role: ${roleFilter}` : ''}
          {moduleFilter !== 'ALL' ? ` • Module: ${moduleFilter}` : ''}
        </Text>
        <Text style={styles.resultsHint}>Tap any log row for full forensic details</Text>
      </View>

      {/* ================= VIRTUALIZED LOG STREAM ================= */}
      <FlatList
        data={displayedLogs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogRow}
        contentContainerStyle={styles.listContent}
        initialNumToRender={25}
        maxToRenderPerBatch={30}
        windowSize={10}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="shield-checkmark-outline" size={44} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No system logs match current filters</Text>
            <Text style={styles.emptySubtitle}>
              Perform any action (place order, update menu, change settings, login, print) and it appears here instantly.
            </Text>
          </View>
        }
        ListFooterComponent={
          displayedLogs.length >= limit && limit < 1000 ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => {
                const next = Math.min(1000, limit + 250);
                setLimit(next);
                void loadFromServer(next);
              }}
            >
              <Ionicons name="chevron-down-circle-outline" size={16} color={BRAND.burgundy} />
              <Text style={styles.loadMoreText}>Load More Logs ({limit} loaded)</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* ================= FORENSIC LOG DETAIL MODAL ================= */}
      <Modal visible={!!selectedLog} transparent animationType="fade" onRequestClose={() => setSelectedLog(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: Math.min(width - 28, 620) }]}>
            {selectedLog && (() => {
              const sev = getSeverityMeta(selectedLog.severity);
              const { time, date } = formatExactTime(selectedLog.timestamp);
              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View style={[styles.modalSevOrb, { backgroundColor: sev.bg, borderColor: sev.border }]}>
                        <Ionicons name={sev.icon} size={20} color={sev.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitle} numberOfLines={1}>{selectedLog.action}</Text>
                        <Text style={styles.modalSub}>{date} • {time} • Seq #{selectedLog.seq}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedLog(null)} style={styles.modalCloseBtn}>
                      <Ionicons name="close" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
                    <View style={styles.modalSummaryBox}>
                      <Text style={styles.modalSummaryText}>{selectedLog.summary}</Text>
                    </View>

                    <View style={styles.detailGrid}>
                      <DetailItem label="Person (Actor)" value={`${selectedLog.actorName}${selectedLog.actorUsername ? ` (@${selectedLog.actorUsername})` : ''}`} />
                      <DetailItem label="Role" value={selectedLog.actorRole} />
                      <DetailItem label="Module" value={selectedLog.module} />
                      <DetailItem label="Action Type" value={selectedLog.actionType} />
                      <DetailItem label="Severity" value={selectedLog.severity.toUpperCase()} />
                      <DetailItem label="Page / Route" value={selectedLog.page} />
                      <DetailItem label="Device" value={`${selectedLog.deviceName} (${selectedLog.platform})`} />
                      <DetailItem label="Device ID" value={selectedLog.deviceId} />
                      {selectedLog.ip ? <DetailItem label="IP Address" value={selectedLog.ip} /> : null}
                      {selectedLog.sessionId ? <DetailItem label="Session ID" value={selectedLog.sessionId} /> : null}
                      {selectedLog.entityType ? (
                        <DetailItem label="Entity" value={`${selectedLog.entityType}${selectedLog.entityName ? ` — ${selectedLog.entityName}` : ''}${selectedLog.entityId ? ` (${selectedLog.entityId})` : ''}`} />
                      ) : null}
                      {typeof selectedLog.amount === 'number' ? (
                        <DetailItem label="Amount (PKR)" value={`Rs. ${selectedLog.amount.toLocaleString()}`} />
                      ) : null}
                      <DetailItem label="Source" value={selectedLog.source.toUpperCase()} />
                      <DetailItem label="Log ID" value={selectedLog.id} />
                    </View>

                    {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                      <View style={styles.jsonBox}>
                        <Text style={styles.jsonBoxTitle}>EVENT PAYLOAD / METADATA</Text>
                        <Text style={styles.jsonCode} selectable>
                          {JSON.stringify(selectedLog.details, null, 2)}
                        </Text>
                      </View>
                    )}
                  </ScrollView>

                  <View style={styles.modalFooter}>
                    <TouchableOpacity
                      style={styles.modalFilterBtn}
                      onPress={() => {
                        setActorFilter(selectedLog.actorName);
                        setSelectedLog(null);
                      }}
                    >
                      <Ionicons name="person-outline" size={14} color={BRAND.burgundy} />
                      <Text style={styles.modalFilterBtnText}>All by {selectedLog.actorName}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalFilterBtn}
                      onPress={() => {
                        setModuleFilter(selectedLog.module);
                        setSelectedLog(null);
                      }}
                    >
                      <Ionicons name="layers-outline" size={14} color={BRAND.burgundy} />
                      <Text style={styles.modalFilterBtnText}>Filter Module</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setSelectedLog(null)}>
                      <Text style={styles.modalDoneBtnText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailCellLabel}>{label}</Text>
      <Text style={styles.detailCellValue} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bg,
    padding: 14,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND.burgundyDark,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
    marginBottom: 12,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconOrb: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: 'rgba(16, 185, 129, 0.45)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  liveBadgePaused: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },
  headerBtnHighlight: {
    backgroundColor: '#D97706',
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  headerBtnGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRAND.gold,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  headerBtnGoldText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1A0306',
  },
  headerBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },
  headerBtnDangerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: 170,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  kpiCardActiveDanger: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  kpiIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND.muted,
    letterSpacing: 0.4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.ink,
    marginTop: 1,
  },
  kpiSub: {
    fontSize: 11,
    color: BRAND.muted,
    marginTop: 1,
  },
  searchToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  searchBox: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BRAND.ink,
    fontWeight: '600',
  },
  datePresetRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 3,
    gap: 3,
  },
  dateBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  dateBtnActive: {
    backgroundColor: BRAND.burgundy,
  },
  dateBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: BRAND.muted,
  },
  dateBtnTextActive: {
    color: '#FFFFFF',
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  filterToggleBtnActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  filtersPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 10,
    gap: 8,
    marginBottom: 8,
  },
  filterRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterRowLabel: {
    width: 60,
    fontSize: 10,
    fontWeight: '900',
    color: BRAND.muted,
    letterSpacing: 0.4,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillActive: {
    backgroundColor: BRAND.burgundy,
    borderColor: BRAND.burgundy,
  },
  pillActiveGold: {
    backgroundColor: BRAND.gold,
    borderColor: BRAND.gold,
  },
  pillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillCount: {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  pillCountActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  pillCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  pillCountTextActive: {
    color: '#FFFFFF',
  },
  pillDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 4,
  },
  resultsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  resultsText: {
    fontSize: 12,
    color: BRAND.muted,
  },
  resultsHint: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 40,
    gap: 7,
  },
  logRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
  },
  logRowCritical: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFBFB',
  },
  logRowCancelHighlight: {
    borderColor: '#E11D48',
    borderWidth: 2,
    backgroundColor: '#FFF1F2',
    shadowColor: '#BE123C',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cancelHighlightRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#FFE4E6',
    borderColor: '#FDA4AF',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 2,
  },
  cancelFlashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  cancelFlashBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cancelOriginBadge: {
    backgroundColor: '#881337',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  cancelOriginBadgeText: {
    color: '#FEF08A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  cancelEntityText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#881337',
    maxWidth: 240,
  },
  cancelAmountBadge: {
    backgroundColor: '#991B1B',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  cancelAmountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  logSummaryCancelHighlight: {
    color: '#9F1239',
    fontWeight: '900',
    fontSize: 14,
  },
  cancelDishesBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  cancelDishChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  cancelDishChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B91C1C',
  },
  cancelDishMoreText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9F1239',
    alignSelf: 'center',
  },
  severityStripe: {
    width: 5,
  },
  logRowContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 5,
  },
  logTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  dateText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  actionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  moduleBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  moduleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  amountPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  amountPillText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#047857',
  },
  seqLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  logSummary: {
    fontSize: 13.5,
    fontWeight: '700',
    color: BRAND.ink,
    lineHeight: 19,
  },
  logBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  actorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actorNameText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  roleTag: {
    backgroundColor: 'rgba(82, 20, 28, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 220,
  },
  metaChipText: {
    fontSize: 11,
    color: BRAND.muted,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.ink,
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: BRAND.muted,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  loadMoreText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: BRAND.burgundy,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalSevOrb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: BRAND.ink,
  },
  modalSub: {
    fontSize: 11.5,
    color: BRAND.muted,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 12,
  },
  modalSummaryText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: BRAND.ink,
    lineHeight: 20,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  detailCell: {
    width: '48%',
    minWidth: 160,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
  },
  detailCellLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND.muted,
    textTransform: 'uppercase',
  },
  detailCellValue: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.ink,
    marginTop: 2,
  },
  jsonBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  jsonBoxTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: BRAND.gold,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  jsonCode: {
    fontSize: 11.5,
    color: '#E2E8F0',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 17,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
  },
  modalFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  modalFilterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.burgundy,
  },
  modalDoneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: BRAND.burgundy,
  },
  modalDoneBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
