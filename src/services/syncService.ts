import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRestaurantStore } from '../store/restaurantStore';

export type SyncStatus = 'connected' | 'connecting' | 'offline';

export interface SyncInfo {
  status: SyncStatus;
  serverIp: string;
  serverPort: number;
  lastSyncedAt: number | null;
  totalSyncedEvents: number;
  deviceId: string;
}

const SERVER_PORT = 5050;
const STORAGE_KEY_SERVER_IP = '@sultan_server_ip';
export const DEVICE_ID = `dev_${Platform.OS}_${Math.random().toString(36).substring(2, 8)}`;

let currentServerIp = '192.168.1.16';
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

function notifyListeners() {
  const info: SyncInfo = {
    status: syncStatus,
    serverIp: currentServerIp,
    serverPort: SERVER_PORT,
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
  // Send immediate state
  listener({
    status: syncStatus,
    serverIp: currentServerIp,
    serverPort: SERVER_PORT,
    lastSyncedAt,
    totalSyncedEvents,
    deviceId: DEVICE_ID,
  });
  return () => {
    statusListeners.delete(listener);
  };
}

/** Resolves the default server IP based on host environment */
export async function resolveDefaultServerIp(): Promise<string> {
  // 1. Check custom saved IP in storage
  try {
    const savedIp = await AsyncStorage.getItem(STORAGE_KEY_SERVER_IP);
    if (savedIp && savedIp.trim()) {
      return savedIp.trim();
    }
  } catch (e) {}

  // 2. If running in Web browser, use current host
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }

  // 3. If running on Mobile (Expo Go), extract host computer IP
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

  // 4. Default fallback to host computer's known LAN IP
  return '192.168.1.16';
}

export async function setCustomServerIp(newIp: string) {
  if (!newIp || !newIp.trim()) return;
  const cleaned = newIp.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').split(':')[0];
  currentServerIp = cleaned;
  await AsyncStorage.setItem(STORAGE_KEY_SERVER_IP, cleaned);
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

  syncStatus = 'connecting';
  notifyListeners();

  const wsUrl = `ws://${currentServerIp}:${SERVER_PORT}`;

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

    ws.onerror = (e) => {
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
      lastBillPaidAlert: state.lastBillPaidAlert,
    },
  };

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
  try {
    fetch(`http://${currentServerIp}:${SERVER_PORT}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (e) {}
}

export async function initSyncService() {
  if (isInitialized) return;
  isInitialized = true;

  currentServerIp = await resolveDefaultServerIp();
  connectWebSocket();

  // Listen to local store mutations and send to server
  useRestaurantStore.subscribe(() => {
    if (isApplyingRemoteUpdate) return;

    if (debounceMutationTimer) clearTimeout(debounceMutationTimer);
    debounceMutationTimer = setTimeout(() => {
      broadcastLocalState();
    }, 450);
  });
}

export async function forceSyncNow() {
  try {
    const res = await fetch(`http://${currentServerIp}:${SERVER_PORT}/api/sync`);
    if (res.ok) {
      const serverState = await res.json();
      isApplyingRemoteUpdate = true;
      hasReceivedInitialSync = true;
      useRestaurantStore.getState().syncFromServer(serverState);
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
