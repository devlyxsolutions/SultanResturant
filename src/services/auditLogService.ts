import { Platform } from 'react-native';
import {
  useSystemLogStore,
  type AuditActionType,
  type AuditModule,
  type AuditSeverity,
  type SystemLogEntry,
} from '../store/systemLogStore';
import { useAuthStore } from '../store/authStore';
import {
  getStableDeviceId,
  getDeviceFriendlyName,
  getActiveServerHttpUrl,
} from './syncService';

export interface LogEventInput {
  module: AuditModule;
  action: string;
  actionType: AuditActionType;
  severity?: AuditSeverity;
  summary: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  amount?: number;
  page?: string;
  details?: Record<string, any>;
  actorOverride?: {
    id?: string;
    name?: string;
    username?: string;
    role?: string;
    sessionId?: string;
  };
}

let monotonicSeq = 0;
let currentRoutePath = '/';
let pendingQueue: SystemLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

const FLUSH_INTERVAL_MS = 200; // High-throughput micro-batching: 100+ logs/sec -> ~2 batch HTTP calls/sec
const MAX_BATCH_SIZE = 100;
const MAX_QUEUE_CAPACITY = 5000;

export function setCurrentAuditPage(pathname: string) {
  if (pathname && typeof pathname === 'string') {
    currentRoutePath = pathname;
  }
}

export function getCurrentAuditPage(): string {
  return currentRoutePath || '/';
}

/** Friendly normalized role label for consistent filtering across all portals */
export function normalizeAuditRole(role?: string | null, customRoleId?: string | null): string {
  const raw = (role || '').trim();
  const c = (customRoleId || '').toLowerCase();
  const r = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (c === 'role-cashier' || r.includes('cashier')) return 'Cashier';
  if (r.includes('master')) return 'Master Admin';
  if (r === 'admin' || r.includes('administrator')) return 'Admin';
  if (r.includes('floormanager') || r === 'floor') return 'Floor Manager';
  if (r.includes('manager')) return 'Manager';
  if (r.includes('waiter') || r.includes('ordertaker')) return 'Order Taker';
  if (r.includes('kitchen') || r.includes('chef') || r.includes('cook') || r.includes('kds')) return 'Kitchen';
  if (r.includes('juice') || r.includes('bar')) return 'Juice Bar';
  if (r.includes('delivery') || r.includes('rider')) return 'Delivery';
  if (r.includes('playland')) return 'Playland';
  if (r.includes('customer') || r.includes('guest')) return 'Customer';
  if (!raw) {
    if (currentRoutePath.startsWith('/menu')) return 'Customer';
    return 'Guest / System';
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Safe compact serializer that strips giant arrays/images so logs stay lightweight even at 100+ events/sec */
function sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const out: Record<string, any> = {};
  for (const key of Object.keys(details)) {
    const val = details[key];
    if (val === undefined) continue;
    if (typeof val === 'string') {
      out[key] = val.length > 350 ? `${val.slice(0, 350)}…` : val;
    } else if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
      out[key] = val;
    } else if (Array.isArray(val)) {
      out[key] = val.slice(0, 12).map((item) => {
        if (item && typeof item === 'object') {
          const slim: Record<string, any> = {};
          for (const k of ['id', 'name', 'qty', 'quantity', 'price', 'amount', 'status', 'station', 'notes']) {
            if (item[k] !== undefined) slim[k] = item[k];
          }
          return Object.keys(slim).length > 0 ? slim : String(item).slice(0, 80);
        }
        return item;
      });
      if (val.length > 12) {
        out[`${key}_totalCount`] = val.length;
      }
    } else if (typeof val === 'object') {
      try {
        const s = JSON.stringify(val);
        out[key] = s.length > 450 ? `${s.slice(0, 450)}…` : JSON.parse(s);
      } catch {
        out[key] = '[Object]';
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function scheduleFlush(immediate = false) {
  if (immediate || pendingQueue.length >= MAX_BATCH_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushAuditLogQueue();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushAuditLogQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

export async function flushAuditLogQueue(): Promise<void> {
  if (isFlushing || pendingQueue.length === 0) return;
  const baseUrl = getActiveServerHttpUrl();
  if (!baseUrl) return;

  isFlushing = true;
  const batch = pendingQueue.splice(0, MAX_BATCH_SIZE);
  try {
    const res = await fetch(`${baseUrl}/api/system-logs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
    });
    if (!res.ok) {
      // Put back at front for retry (bounded)
      pendingQueue = [...batch, ...pendingQueue].slice(-MAX_QUEUE_CAPACITY);
    }
  } catch {
    // Offline / LAN busy — keep buffered for automatic retry on next event
    pendingQueue = [...batch, ...pendingQueue].slice(-MAX_QUEUE_CAPACITY);
  } finally {
    isFlushing = false;
    if (pendingQueue.length > 0 && pendingQueue.length >= MAX_BATCH_SIZE) {
      setTimeout(() => void flushAuditLogQueue(), 50);
    }
  }
}

/**
 * Primary high-throughput system log emitter.
 * Safe to call 100+ times per second with zero UI blocking.
 */
export function recordSystemLog(input: LogEventInput): SystemLogEntry {
  const now = Date.now();
  const seq = ++monotonicSeq;
  const authUser = useAuthStore.getState().user;
  const deviceId = getStableDeviceId();
  const deviceName = getDeviceFriendlyName();

  const actorId = input.actorOverride?.id || authUser?.staffId || authUser?.id || 'system';
  const actorName =
    input.actorOverride?.name ||
    authUser?.name ||
    (currentRoutePath.startsWith('/menu') ? 'Digital Menu Guest' : 'System / Unauthenticated');
  const actorUsername = input.actorOverride?.username || authUser?.username;
  const actorRole = input.actorOverride?.role
    ? normalizeAuditRole(input.actorOverride.role)
    : authUser?.username === 'master' || authUser?.staffId === 'st-master'
      ? 'Master Admin'
      : normalizeAuditRole(authUser?.role, authUser?.customRoleId);

  const entry: SystemLogEntry = {
    id: `log_${now.toString(36)}_${seq.toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    seq,
    timestamp: now,
    isoTime: new Date(now).toISOString(),
    actorId: String(actorId),
    actorName: String(actorName),
    ...(actorUsername ? { actorUsername } : {}),
    actorRole,
    ...(input.actorOverride?.sessionId || authUser?.sessionId
      ? { sessionId: input.actorOverride?.sessionId || authUser?.sessionId }
      : {}),
    deviceId,
    deviceName,
    platform: Platform.OS,
    page: input.page || currentRoutePath || '/',
    module: input.module,
    action: input.action,
    actionType: input.actionType,
    severity: input.severity || 'info',
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.entityId ? { entityId: String(input.entityId) } : {}),
    ...(input.entityName ? { entityName: String(input.entityName) } : {}),
    ...(typeof input.amount === 'number' && !Number.isNaN(input.amount) ? { amount: input.amount } : {}),
    summary: input.summary,
    details: sanitizeDetails(input.details),
    source: 'client',
  };

  // 1. Instant local store update for real-time responsiveness
  try {
    useSystemLogStore.getState().pushLogs(entry);
  } catch {}

  // 2. Micro-batch queue to Central Hub NDJSON persistent storage
  pendingQueue.push(entry);
  if (pendingQueue.length > MAX_QUEUE_CAPACITY) {
    pendingQueue = pendingQueue.slice(-MAX_QUEUE_CAPACITY);
  }
  scheduleFlush(entry.severity === 'critical');

  return entry;
}

/** Fetch filtered/paginated logs + analytics directly from Central Hub Server */
export async function fetchServerSystemLogs(params: {
  q?: string;
  role?: string;
  actor?: string;
  module?: string;
  actionType?: string;
  severity?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<{
  logs: SystemLogEntry[];
  total: number;
  analytics: any;
  ok: boolean;
}> {
  const baseUrl = getActiveServerHttpUrl();
  if (!baseUrl) {
    return {
      logs: useSystemLogStore.getState().logs,
      total: useSystemLogStore.getState().logs.length,
      analytics: null,
      ok: false,
    };
  }
  // Flush any buffered client logs before reading so viewer sees newest actions immediately
  if (pendingQueue.length > 0) {
    await flushAuditLogQueue();
  }
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.role && params.role !== 'ALL') qs.set('role', params.role);
  if (params.actor && params.actor !== 'ALL') qs.set('actor', params.actor);
  if (params.module && params.module !== 'ALL') qs.set('module', params.module);
  if (params.actionType && params.actionType !== 'ALL') qs.set('actionType', params.actionType);
  if (params.severity && params.severity !== 'ALL') qs.set('severity', params.severity);
  if (params.dateFrom) qs.set('dateFrom', String(params.dateFrom));
  if (params.dateTo) qs.set('dateTo', String(params.dateTo));
  qs.set('limit', String(params.limit ?? 200));
  qs.set('offset', String(params.offset ?? 0));

  try {
    const res = await fetch(`${baseUrl}/api/system-logs?${qs.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.success) {
      if ((params.offset ?? 0) === 0 && !params.q && (!params.role || params.role === 'ALL') && (!params.module || params.module === 'ALL')) {
        useSystemLogStore.getState().setServerSnapshot(data.logs || [], data.total || 0, data.analytics || null);
      }
      return {
        logs: data.logs || [],
        total: data.total || 0,
        analytics: data.analytics || null,
        ok: true,
      };
    }
  } catch {}
  return {
    logs: useSystemLogStore.getState().logs,
    total: useSystemLogStore.getState().logs.length,
    analytics: useSystemLogStore.getState().analytics,
    ok: false,
  };
}

export function getSystemLogsExportUrl(format: 'csv' | 'json', filters: Record<string, string | number | undefined> = {}): string {
  const baseUrl = getActiveServerHttpUrl();
  if (!baseUrl) return '';
  const qs = new URLSearchParams({ format });
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== 'ALL') {
      qs.set(k, String(v));
    }
  }
  return `${baseUrl}/api/system-logs/export?${qs.toString()}`;
}
