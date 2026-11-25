import { create } from 'zustand';

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CANCEL'
  | 'PLACE'
  | 'PAYMENT'
  | 'VOID'
  | 'REFUND'
  | 'STATUS_CHANGE'
  | 'TRANSFER'
  | 'AUTH'
  | 'PRINT'
  | 'SECURITY'
  | 'NAVIGATION'
  | 'SYSTEM';

export type AuditSeverity = 'info' | 'success' | 'warning' | 'critical';

export type AuditModule =
  | 'AUTH'
  | 'POS_ORDERS'
  | 'KITCHEN_KDS'
  | 'JUICE_BAR'
  | 'TABLES_FLOORS'
  | 'INVOICES_BILLING'
  | 'RETURNS_REFUNDS'
  | 'ONLINE_DELIVERY'
  | 'INVENTORY_STOCK'
  | 'SUPPLIERS_PO'
  | 'EXPENSES_ASSETS'
  | 'DAMAGES'
  | 'KITCHEN_HANDOVER'
  | 'RECIPES_BOM'
  | 'SHIFTS_CASH'
  | 'STAFF_HR'
  | 'ROLES_SECURITY'
  | 'CUSTOMERS_CRM'
  | 'RESERVATIONS'
  | 'MENU_CATALOG'
  | 'DISCOUNTS_PROMOS'
  | 'PLAYLAND'
  | 'CALL_CENTER'
  | 'SETTINGS'
  | 'PRINTING'
  | 'NAVIGATION'
  | 'SYSTEM';

export interface SystemLogEntry {
  id: string;
  seq: number;
  timestamp: number;
  isoTime: string;
  actorId: string;
  actorName: string;
  actorUsername?: string;
  actorRole: string;
  sessionId?: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  ip?: string;
  page: string;
  module: AuditModule;
  action: string;
  actionType: AuditActionType;
  severity: AuditSeverity;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  amount?: number;
  summary: string;
  details?: Record<string, any>;
  source: 'client' | 'server';
}

export interface SystemLogAnalytics {
  totalStored: number;
  todayCount: number;
  lastHourCount: number;
  lastMinuteCount: number;
  criticalCount: number;
  cancelVoidDeleteCount: number;
  uniqueActorsCount: number;
  byRole: Record<string, number>;
  byModule: Record<string, number>;
  byActionType: Record<string, number>;
  bySeverity: Record<string, number>;
  topActors: { name: string; role: string; count: number; lastSeen: number }[];
}

const MAX_IN_MEMORY_LOGS = 2000;

interface SystemLogStoreState {
  logs: SystemLogEntry[];
  analytics: SystemLogAnalytics | null;
  totalServerLogs: number;
  isLivePaused: boolean;
  lastReceivedAt: number | null;
  pushLogs: (entries: SystemLogEntry | SystemLogEntry[]) => void;
  setServerSnapshot: (logs: SystemLogEntry[], total: number, analytics?: SystemLogAnalytics | null) => void;
  setLivePaused: (paused: boolean) => void;
  clearLocalLogs: () => void;
}

export const useSystemLogStore = create<SystemLogStoreState>()((set) => ({
  logs: [],
  analytics: null,
  totalServerLogs: 0,
  isLivePaused: false,
  lastReceivedAt: null,

  pushLogs: (entries) => {
    const incoming = Array.isArray(entries) ? entries : [entries];
    if (incoming.length === 0) return;
    set((state) => {
      if (state.isLivePaused) return state;
      const seen = new Set(state.logs.map((l) => l.id));
      const fresh = incoming.filter((e) => e && e.id && !seen.has(e.id));
      if (fresh.length === 0) return state;
      const merged = [...fresh, ...state.logs]
        .sort((a, b) => (b.timestamp - a.timestamp) || (b.seq - a.seq))
        .slice(0, MAX_IN_MEMORY_LOGS);
      return {
        logs: merged,
        totalServerLogs: Math.max(state.totalServerLogs + fresh.length, merged.length),
        lastReceivedAt: Date.now(),
      };
    });
  },

  setServerSnapshot: (logs, total, analytics) =>
    set({
      logs: Array.isArray(logs) ? logs.slice(0, MAX_IN_MEMORY_LOGS) : [],
      totalServerLogs: total || (Array.isArray(logs) ? logs.length : 0),
      analytics: analytics ?? null,
      lastReceivedAt: Date.now(),
    }),

  setLivePaused: (paused) => set({ isLivePaused: paused }),

  clearLocalLogs: () => set({ logs: [], totalServerLogs: 0, analytics: null }),
}));
