import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRestaurantStore } from '../store/restaurantStore';
import { useOpsStore, getOpsSyncState } from '../store/opsStore';
import { isFirebaseConfigured, getFirebaseDb, FIREBASE_REST_BASE_URL } from './firebase';
import { ref, onValue, set } from 'firebase/database';

export type SyncStatus = 'connected' | 'connecting' | 'offline';

export interface SyncInfo {
  status: SyncStatus;
  serverIp: string;
  serverPort: number;
  serverUrl?: string;
  isCloudDb?: boolean;
  lastSyncedAt: number | null;
  totalSyncedEvents: number;
  deviceId: string;
}

const SERVER_PORT = 5050;
const STORAGE_KEY_SERVER_IP = '@sultan_server_ip';
export const DEVICE_ID = `dev_${Platform.OS}_${Math.random().toString(36).substring(2, 8)}`;

const FIREBASE_REST_URL = `${FIREBASE_REST_BASE_URL}/sultan_restaurant/live_state.json`;
const FIREBASE_REST_LAST_UPDATED_URL = `${FIREBASE_REST_BASE_URL}/sultan_restaurant/last_updated.json`;

let currentServerAddress = '192.168.1.16';
let syncStatus: SyncStatus = 'offline';
let lastSyncedAt: number | null = null;
let totalSyncedEvents = 0;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let debounceMutationTimer: ReturnType<typeof setTimeout> | null = null;
let firebasePollingTimer: ReturnType<typeof setInterval> | null = null;
let lastProcessedRemoteTimestamp: number = 0;
let isApplyingRemoteUpdate = false;
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

  // Cloud domain (e.g. onrender.com, glitch.me, etc.)
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
    serverIp: isFirebaseConfigured ? 'Firebase Cloud Database' : currentServerAddress,
    serverPort: SERVER_PORT,
    serverUrl: isFirebaseConfigured ? 'Firebase Realtime Cloud' : (wsUrl || displayAddress),
    isCloudDb: isFirebaseConfigured,
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
    serverIp: isFirebaseConfigured ? 'Firebase Cloud Database' : currentServerAddress,
    serverPort: SERVER_PORT,
    serverUrl: isFirebaseConfigured ? 'Firebase Realtime Cloud' : (wsUrl || displayAddress),
    isCloudDb: isFirebaseConfigured,
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

  // 2. Check build-time environment variable
  const envUrl = process.env.EXPO_PUBLIC_SYNC_SERVER_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  // 3. If running in Web browser
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
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

/** Instantaneous state load from Firebase REST endpoint */
async function fetchInitialFirebaseState() {
  try {
    const res = await fetch(FIREBASE_REST_URL);
    if (res.ok) {
      const data = await res.json();
      if (data?.state) {
        hasReceivedInitialSync = true;
        isApplyingRemoteUpdate = true;
        lastProcessedRemoteTimestamp = data.timestamp || Date.now();
        useRestaurantStore.getState().syncFromServer(data.state);
        useOpsStore.getState().syncFromServer(data.state);
        lastSyncedAt = Date.now();
        totalSyncedEvents++;
        syncStatus = 'connected';
        notifyListeners();
        setTimeout(() => {
          isApplyingRemoteUpdate = false;
        }, 300);
      } else {
        hasReceivedInitialSync = true;
        broadcastLocalState();
      }
    }
  } catch (e) {
    console.warn('[SyncService] Initial REST fetch error:', e);
  }
}

/** Lightweight heartbeat polling (every 2.5s) to guarantee background and network transition sync */
async function pollFirebaseUpdates() {
  if (isApplyingRemoteUpdate) return;
  try {
    const res = await fetch(FIREBASE_REST_LAST_UPDATED_URL);
    if (!res.ok) return;
    const lastUpdated = await res.json();
    if (typeof lastUpdated === 'number' && lastUpdated > lastProcessedRemoteTimestamp) {
      const stateRes = await fetch(FIREBASE_REST_URL);
      if (stateRes.ok) {
        const data = await stateRes.json();
        if (data?.state && data.senderId !== DEVICE_ID) {
          lastProcessedRemoteTimestamp = data.timestamp || lastUpdated;
          isApplyingRemoteUpdate = true;
          hasReceivedInitialSync = true;
          useRestaurantStore.getState().syncFromServer(data.state);
          useOpsStore.getState().syncFromServer(data.state);
          lastSyncedAt = Date.now();
          totalSyncedEvents++;
          syncStatus = 'connected';
          notifyListeners();
          setTimeout(() => {
            isApplyingRemoteUpdate = false;
          }, 300);
        }
      }
    }
  } catch (err) {
    // Network retry on next interval
  }
}

/** Initialize Firebase Realtime sync channel */
function initFirebaseSync() {
  syncStatus = 'connecting';
  notifyListeners();

  // 1. Instant initial load from Cloud
  fetchInitialFirebaseState();

  const db = getFirebaseDb();
  if (db) {
    const stateRef = ref(db, 'sultan_restaurant/live_state');

    // 2. Real-time Firebase SDK WebSocket listener
    onValue(stateRef, (snapshot: any) => {
      try {
        const data = snapshot?.val ? snapshot.val() : snapshot;
        if (!data) return;

        if (data.senderId === DEVICE_ID) {
          hasReceivedInitialSync = true;
          return;
        }

        if (data.state) {
          hasReceivedInitialSync = true;
          if (data.timestamp && data.timestamp <= lastProcessedRemoteTimestamp) {
            return;
          }
          lastProcessedRemoteTimestamp = data.timestamp || Date.now();
          isApplyingRemoteUpdate = true;
          useRestaurantStore.getState().syncFromServer(data.state);
          useOpsStore.getState().syncFromServer(data.state);
          lastSyncedAt = Date.now();
          totalSyncedEvents++;
          syncStatus = 'connected';
          notifyListeners();

          setTimeout(() => {
            isApplyingRemoteUpdate = false;
          }, 300);
        }
      } catch (err: any) {
        console.warn('[SyncService] Firebase parse error:', err);
      }
    }, (err: any) => {
      console.warn('[SyncService] Firebase subscription error:', err);
    });
  }

  // 3. Fallback active heartbeat poll
  if (firebasePollingTimer) clearInterval(firebasePollingTimer);
  firebasePollingTimer = setInterval(pollFirebaseUpdates, 2500);

  syncStatus = 'connected';
  lastSyncedAt = Date.now();
  notifyListeners();
}

function connectWebSocket() {
  if (isFirebaseConfigured) {
    initFirebaseSync();
    return;
  }

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
  if (isFirebaseConfigured) {
    initFirebaseSync();
  } else {
    connectWebSocket();
  }
}

/** Broadcast local state changes to Firebase Cloud Database or WebSocket server */
function broadcastLocalState() {
  if (isApplyingRemoteUpdate) return;

  const state = useRestaurantStore.getState();
  const opsState = getOpsSyncState();
  const now = Date.now();
  lastProcessedRemoteTimestamp = now;

  const payload = {
    type: 'CLIENT_UPDATE',
    senderId: DEVICE_ID,
    timestamp: now,
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

  // 1. If Firebase Cloud DB is active, push to Firebase Realtime Database
  if (isFirebaseConfigured) {
    // A. Via Firebase Web SDK
    const db = getFirebaseDb();
    if (db) {
      try {
        const stateRef = ref(db, 'sultan_restaurant/live_state');
        set(stateRef, payload).catch(() => {});
      } catch (e) {}
    }

    // B. Direct HTTP REST PUT (guaranteed to deliver across all platforms and networks)
    fetch(FIREBASE_REST_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(() => {
        fetch(FIREBASE_REST_LAST_UPDATED_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(now),
        }).catch(() => {});

        lastSyncedAt = Date.now();
        totalSyncedEvents++;
        syncStatus = 'connected';
        notifyListeners();
      })
      .catch((err) => {
        console.warn('[SyncService] Firebase REST write error:', err);
      });
    return;
  }

  // 2. Otherwise try WebSocket (LAN or cloud hub)
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
      lastSyncedAt = Date.now();
      totalSyncedEvents++;
      notifyListeners();
      return;
    } catch (e) {}
  }

  // 3. Fallback to HTTP POST if WebSocket is temporarily disconnected
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
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

  if (isFirebaseConfigured) {
    initFirebaseSync();
  } else {
    currentServerAddress = await resolveDefaultServerIp();
    connectWebSocket();
  }

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

export async function forceSyncNow(): Promise<boolean> {
  if (isFirebaseConfigured) {
    try {
      const res = await fetch(FIREBASE_REST_URL);
      if (res.ok) {
        const data = await res.json();
        if (data?.state) {
          hasReceivedInitialSync = true;
          isApplyingRemoteUpdate = true;
          lastProcessedRemoteTimestamp = data.timestamp || Date.now();
          useRestaurantStore.getState().syncFromServer(data.state);
          useOpsStore.getState().syncFromServer(data.state);
          lastSyncedAt = Date.now();
          syncStatus = 'connected';
          totalSyncedEvents++;
          notifyListeners();
          setTimeout(() => {
            isApplyingRemoteUpdate = false;
          }, 300);
          return true;
        }
      }
    } catch (err) {
      console.warn('[SyncService] Firebase forceSync error:', err);
    }
    return false;
  }

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
