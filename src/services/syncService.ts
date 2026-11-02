import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRestaurantStore } from '../store/restaurantStore';
import { useOpsStore, getOpsSyncState } from '../store/opsStore';
import { useKitchenStore, getKitchenSyncState } from '../store/kitchenStore';
import { useRoleStore } from '../store/roleStore';
import { isFirebaseConfigured, getFirebaseDb, getFirestoreDb, FIREBASE_REST_BASE_URL } from './firebase';
import { ref, onValue, set } from 'firebase/database';
import { doc, getDoc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';

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

let currentServerAddress = '192.168.1.4';
let syncStatus: SyncStatus = 'offline';
let lastSyncedAt: number | null = null;
let totalSyncedEvents = 0;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let debounceMutationTimer: ReturnType<typeof setTimeout> | null = null;
let firebasePollingTimer: ReturnType<typeof setInterval> | null = null;
let remoteUpdateUnlockTimer: ReturnType<typeof setTimeout> | null = null;
let activePutAbortController: AbortController | null = null;
let currentBroadcastSeq: number = 0;
let lastLocalBroadcastTimestamp: number = 0;
let lastProcessedRemoteTimestamp: number = 0;
let lastProcessedPacketId: string = '';
const processedPacketIds = new Set<string>();
let sseConnection: any = null;
let firestoreUnsubscribe: Unsubscribe | null = null;
let isApplyingRemoteUpdate = false;
let hasReceivedInitialSync = false;
let isInitialized = false;

function rememberPacketId(packetId?: string) {
  if (!packetId) return;
  lastProcessedPacketId = packetId;
  processedPacketIds.add(packetId);
  if (processedPacketIds.size > 80) {
    const first = processedPacketIds.values().next().value;
    if (first) processedPacketIds.delete(first);
  }
}

function hasSeenPacket(packetId?: string): boolean {
  if (!packetId) return false;
  return packetId === lastProcessedPacketId || processedPacketIds.has(packetId);
}

function applyRemoteStateSafely(state: any, packetId?: string, timestamp?: number) {
  if (!state || typeof state !== 'object') return;
  rememberPacketId(packetId);
  if (typeof timestamp === 'number' && timestamp > lastProcessedRemoteTimestamp) {
    lastProcessedRemoteTimestamp = timestamp;
  } else if (!lastProcessedRemoteTimestamp) {
    lastProcessedRemoteTimestamp = Date.now();
  }
  hasReceivedInitialSync = true;
  isApplyingRemoteUpdate = true;
  if (debounceMutationTimer) {
    clearTimeout(debounceMutationTimer);
    debounceMutationTimer = null;
  }
  if (remoteUpdateUnlockTimer) {
    clearTimeout(remoteUpdateUnlockTimer);
  }

  applyRemoteState(state);

  lastSyncedAt = Date.now();
  totalSyncedEvents++;
  syncStatus = 'connected';
  notifyListeners();

  remoteUpdateUnlockTimer = setTimeout(() => {
    isApplyingRemoteUpdate = false;
    remoteUpdateUnlockTimer = null;
  }, 250);
}

function applyRemoteState(state: any) {
  if (!state || typeof state !== 'object') return;
  useRestaurantStore.getState().syncFromServer(state);
  useOpsStore.getState().syncFromServer(state);
  useKitchenStore.getState().syncFromServer(state);
  useRoleStore.getState().syncFromServer?.(state);
}

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
    } catch {}
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
  } catch {}

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
    return 'localhost';
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
  return '192.168.1.4';
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

/** Instantaneous state load from Firebase REST endpoint & Cloud Firestore in parallel */
async function fetchInitialFirebaseState() {
  let loadedFromRest = false;

  // 1. Fast non-blocking HTTP REST fetch (<150ms)
  try {
    const res = await fetch(FIREBASE_REST_URL);
    if (res.ok) {
      const data = await res.json();
      if (data?.state) {
        applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
        loadedFromRest = true;
      }
    }
  } catch (e) {
    console.warn('[SyncService] Initial REST fetch error:', e);
  }

  // 2. Fallback check against Cloud Firestore only if REST fetch did not succeed
  if (!loadedFromRest) {
    const firestoreDb = getFirestoreDb();
    if (firestoreDb) {
      try {
        const docRef = doc(firestoreDb, 'sultan_restaurant', 'live_state');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data?.state) {
            applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
            loadedFromRest = true;
          }
        }
      } catch (e) {
        console.warn('[SyncService] Initial Firestore fetch error:', e);
      }
    }
  }

  if (!loadedFromRest) {
    hasReceivedInitialSync = true;
    broadcastLocalState();
  }
}

/** Native browser Server-Sent Events (SSE) stream for zero-latency, sub-100ms real-time pushes */
function initWebSSE() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.EventSource) {
    return;
  }

  if (sseConnection) {
    try {
      sseConnection.close();
    } catch {}
    sseConnection = null;
  }

  try {
    const sse = new window.EventSource(FIREBASE_REST_URL);
    sseConnection = sse;

    sse.addEventListener('put', (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const payload = JSON.parse(event.data);
        const data = payload?.data;
        if (!data) return;

        // Ignore updates sent by this device
        if (data.senderId === DEVICE_ID) return;

        // Ignore duplicates or older packets
        if (hasSeenPacket(data.packetId)) return;
        if (data.timestamp && lastProcessedRemoteTimestamp && data.timestamp < lastProcessedRemoteTimestamp) return;

        if (data.state) {
          applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
        }
      } catch (err) {
        console.warn('[SyncService] SSE message parse error:', err);
      }
    });

    sse.onerror = () => {
      try {
        sse.close();
      } catch {}
      sseConnection = null;
    };
  } catch (err) {
    console.warn('[SyncService] Failed to initialize SSE stream:', err);
  }
}

/** High-frequency heartbeat polling (every 1s) to guarantee instant sync on mobile networks */
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
        if (
          data?.state &&
          data.senderId !== DEVICE_ID &&
          !hasSeenPacket(data.packetId) &&
          (!data.timestamp || !lastProcessedRemoteTimestamp || data.timestamp >= lastProcessedRemoteTimestamp)
        ) {
          applyRemoteStateSafely(data.state, data.packetId, data.timestamp || lastUpdated);
        }
      }
    }
  } catch {
    // Network retry on next 1-second pulse
  }
}

/** Initialize Firebase Realtime sync channel with multi-tier real-time pipeline */
function initFirebaseSync() {
  syncStatus = 'connecting';
  notifyListeners();

  // 1. Instant initial load from Cloud
  fetchInitialFirebaseState();

  // Fallback unlock for initial sync in case network is slow at boot
  setTimeout(() => {
    hasReceivedInitialSync = true;
  }, 2500);

  // 2. Browser SSE Stream for zero-latency instant updates (<100ms)
  initWebSSE();

  // 3. Real-time Cloud Firestore listener (onSnapshot)
  const firestoreDb = getFirestoreDb();
  if (firestoreDb) {
    if (firestoreUnsubscribe) {
      try {
        firestoreUnsubscribe();
      } catch {}
      firestoreUnsubscribe = null;
    }

    try {
      const liveStateDocRef = doc(firestoreDb, 'sultan_restaurant', 'live_state');
      firestoreUnsubscribe = onSnapshot(
        liveStateDocRef,
        (docSnap) => {
          try {
            if (!docSnap.exists()) return;
            const data = docSnap.data();
            if (!data) return;

            if (data.senderId === DEVICE_ID) return;
            if (hasSeenPacket(data.packetId)) return;
            if (data.timestamp && lastProcessedRemoteTimestamp && data.timestamp < lastProcessedRemoteTimestamp) return;

            if (data.state) {
              applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
            }
          } catch (err: any) {
            console.warn('[SyncService] Firestore snapshot parse error:', err);
          }
        },
        (err: any) => {
          console.warn('[SyncService] Firestore subscription error:', err);
        }
      );
    } catch (err) {
      console.warn('[SyncService] Failed to attach Firestore listener:', err);
    }
  }

  // 4. Real-time Firebase Realtime DB SDK WebSocket listener
  const db = getFirebaseDb();
  if (db) {
    const stateRef = ref(db, 'sultan_restaurant/live_state');

    onValue(stateRef, (snapshot) => {
      try {
        const data = snapshot.val();
        if (!data) return;

        if (data.senderId === DEVICE_ID) return;
        if (hasSeenPacket(data.packetId)) return;
        if (data.timestamp && lastProcessedRemoteTimestamp && data.timestamp < lastProcessedRemoteTimestamp) return;

        if (data.state) {
          applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
        }
      } catch (err: any) {
        console.warn('[SyncService] Firebase parse error:', err);
      }
    }, (err: any) => {
      console.warn('[SyncService] Firebase subscription error:', err);
    });
  }

  // 5. Lightweight background fallback pulse (only needed on native mobile; web uses persistent WebSockets)
  if (Platform.OS !== 'web') {
    if (firebasePollingTimer) clearInterval(firebasePollingTimer);
    firebasePollingTimer = setInterval(pollFirebaseUpdates, 4000);
  }

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
    } catch {}
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
          } catch {}
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
            applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
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
  } catch {
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
  const kitchenState = getKitchenSyncState();
  const roleState = useRoleStore.getState();
  const now = Math.max(Date.now(), lastProcessedRemoteTimestamp + 1, lastLocalBroadcastTimestamp + 1);
  lastLocalBroadcastTimestamp = now;
  const broadcastSeq = ++currentBroadcastSeq;
  const packetId = `${DEVICE_ID}_${now}_${Math.random().toString(36).substring(2, 7)}`;
  rememberPacketId(packetId);
  lastProcessedRemoteTimestamp = now;

  const payload = {
    type: 'CLIENT_UPDATE',
    senderId: DEVICE_ID,
    packetId,
    timestamp: now,
    state: {
      tables: state.tables,
      tickets: state.tickets,
      invoices: state.invoices,
      customers: state.customers,
      menuItems: state.menuItems,
      categories: state.categories,
      regions: state.regions,
      zones: state.zones,
      staff: state.staff,
      reservations: state.reservations,
      lastBillPaidAlert: state.lastBillPaidAlert,
      lastFoodReadyAlert: state.lastFoodReadyAlert,
      roles: roleState.roles,
      ...opsState,
      ...kitchenState,
    },
  };

  // 1. If Firebase Cloud DB is active, push to Cloud Firestore & Firebase Realtime Database
  if (isFirebaseConfigured) {
    // Abort any older in-flight HTTP PUT so an older packet can never finish after a newer packet
    if (activePutAbortController) {
      try {
        activePutAbortController.abort();
      } catch {}
      activePutAbortController = null;
    }

    // A. Push to Cloud Firestore (sultan_restaurant/live_state & structured summary docs)
    const firestoreDb = getFirestoreDb();
    if (firestoreDb) {
      try {
        const cleanPayload = JSON.parse(JSON.stringify(payload));
        setDoc(doc(firestoreDb, 'sultan_restaurant', 'live_state'), cleanPayload)
          .then(() => {
            if (broadcastSeq === currentBroadcastSeq) {
              lastSyncedAt = Date.now();
              totalSyncedEvents++;
              syncStatus = 'connected';
              notifyListeners();
            }
          })
          .catch((err) => {
            console.warn('[SyncService] Firestore write error:', err);
          });
      } catch {}
    }

    // B. Via Firebase Realtime DB Web SDK
    const db = getFirebaseDb();
    if (db) {
      try {
        const stateRef = ref(db, 'sultan_restaurant/live_state');
        set(stateRef, payload).catch(() => {});
        const lastUpdatedRef = ref(db, 'sultan_restaurant/last_updated');
        set(lastUpdatedRef, now).catch(() => {});
      } catch {}
    }

    // C. Direct HTTP REST PUT (guaranteed to deliver across all platforms and networks)
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      activePutAbortController = controller;
    }

    fetch(FIREBASE_REST_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    })
      .then(() => {
        if (broadcastSeq !== currentBroadcastSeq) return;
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
        if (err?.name === 'AbortError') return;
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
    } catch {}
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
    } catch {}
  }
}

let immediateBroadcastPending = false;
/** Force immediate cloud broadcast without any debounce delay (coalesced across synchronous mutations) */
export function broadcastImmediately() {
  if (debounceMutationTimer) {
    clearTimeout(debounceMutationTimer);
    debounceMutationTimer = null;
  }
  if (immediateBroadcastPending) return;
  immediateBroadcastPending = true;
  setTimeout(() => {
    immediateBroadcastPending = false;
    broadcastLocalState();
  }, 0);
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
    if (isApplyingRemoteUpdate || !hasReceivedInitialSync) return;
    if (debounceMutationTimer) clearTimeout(debounceMutationTimer);
    debounceMutationTimer = setTimeout(() => {
      broadcastLocalState();
    }, 50);
  };

  // Listen to local restaurant store mutations
  useRestaurantStore.subscribe(triggerDebouncedBroadcast);

  // Listen to operations store mutations
  useOpsStore.subscribe(triggerDebouncedBroadcast);

  // Listen to kitchen operations store mutations
  useKitchenStore.subscribe(triggerDebouncedBroadcast);

  // Listen to role and permissions store mutations
  useRoleStore.subscribe(triggerDebouncedBroadcast);
}

export async function forceSyncNow(): Promise<boolean> {
  if (isFirebaseConfigured) {
    const firestoreDb = getFirestoreDb();
    if (firestoreDb) {
      try {
        const docSnap = await getDoc(doc(firestoreDb, 'sultan_restaurant', 'live_state'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data?.state) {
            applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
            return true;
          }
        }
      } catch (err) {
        console.warn('[SyncService] Firestore forceSync error:', err);
      }
    }

    try {
      const res = await fetch(FIREBASE_REST_URL);
      if (res.ok) {
        const data = await res.json();
        if (data?.state) {
          applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
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
      applyRemoteStateSafely(serverState);
      return true;
    }
  } catch {}
  reconnect();
  return false;
}
