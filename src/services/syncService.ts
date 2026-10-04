import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRestaurantStore } from '../store/restaurantStore';
import { useOpsStore, getOpsSyncState } from '../store/opsStore';

export type SyncStatus = 'connected' | 'connecting' | 'offline';

export interface SyncInfo {
  status: SyncStatus;
  serverIp: string;
  serverPort: number;
  serverUrl?: string;
  lastSyncedAt: number | null;
  totalSyncedEvents: number;
  deviceId: string;
}

const SERVER_PORT = 5050;
const STORAGE_KEY_SERVER_IP = '@sultan_server_ip';
export const DEVICE_ID = `dev_${Platform.OS}_${Math.random().toString(36).substring(2, 8)}`;

let currentServerAddress = '192.168.1.16';
let syncStatus: SyncStatus = 'offline';
let lastSyncedAt: number | null = null;
let totalSyncedEvents = 0;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let debounceMutationTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemoteUpdate = false;
let hasReceivedInitialSync = false;
let isInitialized = false;

// Listeners for UI state updates
const statusListeners = new Set<(info: SyncInfo) => void>();

export function parseServerEndpoints(input: string): { wsUrl: string; httpUrl: string; displayAddress: string } {
  const trimmed = (input || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return { wsUrl: '', httpUrl: '', displayAddress: 'Not Configured' };
  }

  // Explicit WebSocket protocol
  if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) {
    const wsUrl = trimmed;
    const httpUrl = trimmed.replace('wss://', 'https://').replace('ws://', 'http://');
    const displayAddress = trimmed.replace(/^wss?:\/\//, '');
    return { wsUrl, httpUrl, displayAddress };
  }

  // Explicit HTTP/HTTPS protocol
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    const httpUrl = trimmed;
    const wsUrl = trimmed.replace('https://', 'wss://').replace('http://', 'ws://');
    const displayAddress = trimmed.replace(/^https?:\/\//, '');
    return { wsUrl, httpUrl, displayAddress };
  }

  // Local IP or localhost
  const isLocalIp =
    trimmed.startsWith('192.168.') ||
    trimmed.startsWith('10.') ||
    trimmed.startsWith('127.0.0.1') ||
    trimmed.startsWith('localhost') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(trimmed);

  const hasPort = trimmed.includes(':');

  if (isLocalIp) {
    const hostWithPort = hasPort ? trimmed : `${trimmed}:${SERVER_PORT}`;
    return {
      wsUrl: `ws://${hostWithPort}`,
      httpUrl: `http://${hostWithPort}`,
      displayAddress: hostWithPort,
    };
  }

  // Cloud domain (e.g. sultan-hub.onrender.com or railway.app)
  // Cloud domains on HTTPS use standard wss:// and https:// without port 5050
  return {
    wsUrl: `wss://${trimmed}`,
    httpUrl: `https://${trimmed}`,
    displayAddress: trimmed,
  };
}

function notifyListeners() {
  const { wsUrl, displayAddress } = parseServerEndpoints(currentServerAddress);
  const info: SyncInfo = {
    status: syncStatus,
    serverIp: currentServerAddress,
    serverPort: SERVER_PORT,
    serverUrl: wsUrl || displayAddress,
    lastSyncedAt,
    totalSyncedEvents,
    deviceId: DEVICE_ID,
  };
  statusListeners.forEach((fn) => {
    try {
      fn(info);
    } catch (e) {}
  });
}

export function subscribeToSyncStatus(listener: (info: SyncInfo) => void) {
  statusListeners.add(listener);
  const { wsUrl, displayAddress } = parseServerEndpoints(currentServerAddress);
  listener({
    status: syncStatus,
    serverIp: currentServerAddress,
    serverPort: SERVER_PORT,
    serverUrl: wsUrl || displayAddress,
    lastSyncedAt,
    totalSyncedEvents,
    deviceId: DEVICE_ID,
  });
  return () => {
    statusListeners.delete(listener);
  };
}

/** Resolves default server host based on environment */
export async function resolveDefaultServerIp(): Promise<string> {
  // 1. Check custom saved address in storage
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_SERVER_IP);
    if (saved && saved.trim()) {
      return saved.trim();
    }
  } catch (e) {}

  // 2. Check build-time environment variable (e.g., from Netlify build env)
  const envUrl = process.env.EXPO_PUBLIC_SYNC_SERVER_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  // 3. If running in Web browser
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    // If hosted on Netlify, Vercel, etc. do NOT treat the static host as backend
    if (host.includes('netlify.app') || host.includes('vercel.app')) {
      return '';
    }
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
  }

  // 4. If running on Mobile (Expo Go), extract host computer IP
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip.length > 3) {
      return ip;
    }
  }

  // 5. Default fallback to host computer's known LAN IP
  return '192.168.1.16';
}

export async function setCustomServerIp(newAddress: string) {
  const cleaned = (newAddress || '').trim();
  currentServerAddress = cleaned;
  if (cleaned) {
    await AsyncStorage.setItem(STORAGE_KEY_SERVER_IP, cleaned);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY_SERVER_IP);
  }
  reconnect();
}

function connectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }

  const { wsUrl } = parseServerEndpoints(currentServerAddress);

  if (!wsUrl) {
    syncStatus = 'offline';
    notifyListeners();
    return;
  }

  syncStatus = 'connecting';
  notifyListeners();

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      syncStatus = 'connected';
      lastSyncedAt = Date.now();
      notifyListeners();

      // Start keep-alive ping
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'PING' }));
          } catch (e) {}
        }
      }, 12000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        // Ignore messages sent by this same device
        if (data.senderId === DEVICE_ID) return;

        if (data.type === 'INIT_STATE' || data.type === 'SERVER_BROADCAST') {
          if (data.state) {
            hasReceivedInitialSync = true;
            isApplyingRemoteUpdate = true;
            useRestaurantStore.getState().syncFromServer(data.state);
            useOpsStore.getState().syncFromServer(data.state);
            lastSyncedAt = Date.now();
            totalSyncedEvents++;
            notifyListeners();

            setTimeout(() => {
              isApplyingRemoteUpdate = false;
            }, 300);
          }
        }
      } catch (err) {
        console.warn('[SyncService] Failed to parse message:', err);
      }
    };

    ws.onerror = () => {
      // Handled in onclose
    };

    ws.onclose = () => {
      syncStatus = 'offline';
      notifyListeners();
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      // Reconnect after 3.5s
      reconnectTimer = setTimeout(() => {
        connectWebSocket();
      }, 3500);
    };
  } catch (err) {
    syncStatus = 'offline';
    notifyListeners();
    reconnectTimer = setTimeout(() => {
      connectWebSocket();
    }, 4000);
  }
}

export function reconnect() {
  connectWebSocket();
}

/** Broadcast local state changes to server and other devices */
function broadcastLocalState() {
  if (isApplyingRemoteUpdate || !hasReceivedInitialSync) return;

  const state = useRestaurantStore.getState();
  const opsState = getOpsSyncState();

  const payload = {
    type: 'CLIENT_UPDATE',
    senderId: DEVICE_ID,
    timestamp: Date.now(),
    state: {
      tables: state.tables,
      tickets: state.tickets,
      invoices: state.invoices,
      customers: state.customers,
      menuItems: state.menuItems,
      categories: state.categories,
      zones: state.zones,
      staff: state.staff,
      reservations: state.reservations,
      lastBillPaidAlert: state.lastBillPaidAlert,
      ...opsState,
    },
  };

  const { httpUrl } = parseServerEndpoints(currentServerAddress);

  // Try WebSocket first (instant)
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
      lastSyncedAt = Date.now();
      totalSyncedEvents++;
      notifyListeners();
      return;
    } catch (e) {}
  }

  // Fallback to HTTP POST if WebSocket is temporarily disconnected
  if (httpUrl) {
    try {
      fetch(`${httpUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch (e) {}
  }
}

export async function initSyncService() {
  if (isInitialized) return;
  isInitialized = true;

  currentServerAddress = await resolveDefaultServerIp();
  connectWebSocket();

  const triggerDebouncedBroadcast = () => {
    if (isApplyingRemoteUpdate) return;
    if (debounceMutationTimer) clearTimeout(debounceMutationTimer);
    debounceMutationTimer = setTimeout(() => {
      broadcastLocalState();
    }, 450);
  };

  // Listen to local restaurant store mutations
  useRestaurantStore.subscribe(triggerDebouncedBroadcast);

  // Listen to operations store mutations
  useOpsStore.subscribe(triggerDebouncedBroadcast);
}

export async function forceSyncNow() {
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  if (!httpUrl) {
    reconnect();
    return false;
  }

  try {
    const res = await fetch(`${httpUrl}/api/sync`);
    if (res.ok) {
      const serverState = await res.json();
      isApplyingRemoteUpdate = true;
      hasReceivedInitialSync = true;
      useRestaurantStore.getState().syncFromServer(serverState);
      useOpsStore.getState().syncFromServer(serverState);
      lastSyncedAt = Date.now();
      syncStatus = 'connected';
      notifyListeners();
      setTimeout(() => {
        isApplyingRemoteUpdate = false;
      }, 300);
      return true;
    }
  } catch (e) {}
  reconnect();
  return false;
}
