import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRestaurantStore } from '../store/restaurantStore';
import { useOpsStore, getOpsSyncState } from '../store/opsStore';
import { useKitchenStore, getKitchenSyncState } from '../store/kitchenStore';
import { useRoleStore } from '../store/roleStore';
import { useShiftStore } from '../store/shiftStore';
import { useSettingsStore } from '../store/settingsStore';
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
const STORAGE_KEY_DEVICE_ID = '@sultan_device_id';
let cachedDeviceId: string | null = null;

export function getStableDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      let tabId = '';
      try {
        tabId = window.sessionStorage?.getItem('@sultan_tab_id') || '';
        if (!tabId) {
          tabId = Math.random().toString(36).substring(2, 6);
          window.sessionStorage?.setItem('@sultan_tab_id', tabId);
        }
      } catch {}
      const stored = window.localStorage.getItem(STORAGE_KEY_DEVICE_ID);
      if (stored && stored.length > 5) {
        cachedDeviceId = tabId ? `${stored}_${tabId}` : stored;
        return cachedDeviceId;
      }
      const created = `dev_${Platform.OS}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      window.localStorage.setItem(STORAGE_KEY_DEVICE_ID, created);
      cachedDeviceId = tabId ? `${created}_${tabId}` : created;
      return cachedDeviceId;
    }
  } catch {}
  cachedDeviceId = `dev_${Platform.OS}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  return cachedDeviceId;
}

export function getDeviceFriendlyName(): string {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    let browser = 'Browser';
    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox/')) browser = 'Firefox';

    let os = 'PC';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'Mac';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return `${browser} on ${os}`;
  }
  return `${Platform.OS.toUpperCase()} Terminal`;
}

export const DEVICE_ID = getStableDeviceId();

const FIREBASE_REST_URL = `${FIREBASE_REST_BASE_URL}/sultan_restaurant/live_state.json`;
const FIREBASE_REST_LAST_UPDATED_URL = `${FIREBASE_REST_BASE_URL}/sultan_restaurant/last_updated.json`;
let isRtdbAccessible = false;

let currentServerAddress = '192.168.1.10';
let syncStatus: SyncStatus = 'offline';
let isLanConnected = false;
let isCloudConnected = false;
let isDiscoveringLan = false;
let lanHttpPollTimer: ReturnType<typeof setInterval> | null = null;
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
let hasUnsyncedLocalChanges = false;
let currentWsUrl = '';

export function markApplyingRemoteUpdate(durationMs = 350) {
  isApplyingRemoteUpdate = true;
  if (debounceMutationTimer) {
    clearTimeout(debounceMutationTimer);
    debounceMutationTimer = null;
  }
  if (remoteUpdateUnlockTimer) {
    clearTimeout(remoteUpdateUnlockTimer);
  }
  remoteUpdateUnlockTimer = setTimeout(() => {
    isApplyingRemoteUpdate = false;
    remoteUpdateUnlockTimer = null;
  }, durationMs);
}

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
  useSettingsStore.getState().syncFromServer?.(state);
  if (state.shifts || state.activeShiftId !== undefined) {
    useShiftStore.getState().syncFromServer?.({
      shifts: state.shifts,
      activeShiftId: state.activeShiftId,
    });
  }
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
    serverIp: currentServerAddress || '192.168.100.155',
    serverPort: SERVER_PORT,
    serverUrl: wsUrl || displayAddress || 'ws://192.168.100.155:5050',
    isCloudDb: isCloudConnected,
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
    serverIp: currentServerAddress || '192.168.100.155',
    serverPort: SERVER_PORT,
    serverUrl: wsUrl || displayAddress || 'ws://192.168.100.155:5050',
    isCloudDb: isCloudConnected,
    lastSyncedAt,
    totalSyncedEvents,
    deviceId: DEVICE_ID,
  });
  return () => {
    statusListeners.delete(listener);
  };
}

/** Probes a candidate LAN IP to check if Sultan Central POS Hub is running there */
async function probeLanIp(ip: string, timeoutMs = 900): Promise<boolean> {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const res = await fetch(`http://${ip}:${SERVER_PORT}/health`, {
      method: 'GET',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data && (data.status === 'online' || data.server));
  } catch {
    return false;
  }
}

/** Automatically discovers the Sultan POS Hub IP across common restaurant LAN subnets (192.168.0.x, 192.168.100.x, 192.168.1.x) */
export async function discoverLocalServerIp(): Promise<string | null> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1' && !h.includes('vercel.app') && !h.includes('netlify.app')) {
      return h;
    }
  }
  if (isDiscoveringLan) return null;
  isDiscoveringLan = true;

  try {
    // 0. Check current address first so we don't flood sockets if already valid
    if (currentServerAddress && (await probeLanIp(currentServerAddress, 850))) {
      isLanConnected = true;
      return currentServerAddress;
    }

    // 1. High-priority known static & router DHCP IPs in small batches of 6 (prevents Android OkHttp queue timeout)
    const priorityIps = [
      '192.168.1.10',
      '192.168.0.148',
      '192.168.0.100',
      '192.168.0.101',
      '192.168.0.102',
      '192.168.100.155',
      '192.168.0.103',
      '192.168.0.104',
      '192.168.0.105',
      '192.168.0.106',
      '192.168.100.2',
      '192.168.100.4',
      '192.168.100.5',
      '192.168.100.6',
      '192.168.100.100',
      '192.168.100.101',
      '192.168.1.100',
      '192.168.1.2',
    ].filter(Boolean);

    const uniquePriority = Array.from(new Set(priorityIps));
    for (let i = 0; i < uniquePriority.length; i += 6) {
      const chunk = uniquePriority.slice(i, i + 6);
      const hits = await Promise.all(
        chunk.map(async (ip) => ((await probeLanIp(ip, 950)) ? ip : null))
      );
      const winner = hits.find(Boolean);
      if (winner) {
        currentServerAddress = winner;
        isLanConnected = true;
        try {
          await AsyncStorage.setItem(STORAGE_KEY_SERVER_IP, winner);
        } catch {}
        connectWebSocket();
        return winner;
      }
    }

    // 2. Scan across 192.168.0.x, 192.168.100.x, and 192.168.1.x in Android-safe batches of 8
    const subnets = ['192.168.0', '192.168.100', '192.168.1'];
    for (const subnet of subnets) {
      const candidates: string[] = [];
      for (let i = 100; i <= 160; i++) {
        candidates.push(`${subnet}.${i}`);
      }
      for (let i = 2; i <= 50; i++) {
        candidates.push(`${subnet}.${i}`);
      }
      const batchSize = 8;
      for (let b = 0; b < candidates.length; b += batchSize) {
        if (isLanConnected) return currentServerAddress;
        const batch = candidates.slice(b, b + batchSize);
        const results = await Promise.all(
          batch.map(async (ip) => ((await probeLanIp(ip, 850)) ? ip : null))
        );
        const found = results.find(Boolean);
        if (found) {
          currentServerAddress = found;
          isLanConnected = true;
          try {
            await AsyncStorage.setItem(STORAGE_KEY_SERVER_IP, found);
          } catch {}
          connectWebSocket();
          return found;
        }
      }
    }
  } catch {} finally {
    isDiscoveringLan = false;
  }
  return null;
}

/** Resolves default server host based on environment */
export async function resolveDefaultServerIp(): Promise<string> {
  // 1. If running in Web browser, always prefer the browser's current LAN IP host
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host.includes('netlify.app') || host.includes('vercel.app')) {
      return '';
    }
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
    return '127.0.0.1';
  }

  // 2. Check custom saved address in storage (ignore old dead 192.168.1.4 / 192.168.1.14 defaults)
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_SERVER_IP);
    if (saved && saved.trim() && saved.trim() !== '192.168.1.4' && saved.trim() !== '192.168.1.14') {
      return saved.trim();
    }
  } catch {}

  // 3. Check build-time environment variable
  const envUrl = process.env.EXPO_PUBLIC_SYNC_SERVER_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
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
  return '192.168.1.10';
}

export function getActiveServerHttpUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const loc = window.location;
    // Port 8081 is Expo Metro dev server (no backend API routes); always point API calls to Central Hub on port 5050!
    if (loc.port === '8081') {
      return `${loc.protocol}//${loc.hostname}:${SERVER_PORT}`;
    }
    if (loc.port === '5050' || loc.port === '5000' || loc.port === '80' || !loc.port) {
      return loc.origin;
    }
    return `${loc.protocol}//${loc.hostname}:${SERVER_PORT}`;
  }
  const { httpUrl } = parseServerEndpoints(currentServerAddress || '192.168.1.10');
  return httpUrl || `http://192.168.1.10:${SERVER_PORT}`;
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

/** Instantaneous state load from Local LAN Hub first, then Cloud Firestore / REST */
async function fetchInitialFirebaseState() {
  let loadedRemotely = false;

  // 0. Try Local LAN Central Server first (<50ms on restaurant Wi-Fi / LAN)
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  if (httpUrl) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 1400) : null;
      const lanRes = await fetch(`${httpUrl}/api/sync`, {
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timer) clearTimeout(timer);
      if (lanRes.ok) {
        const lanState = await lanRes.json();
        if (lanState && typeof lanState === 'object') {
          applyRemoteStateSafely(lanState.state || lanState, lanState.packetId, lanState.timestamp);
          isLanConnected = true;
          loadedRemotely = true;
        }
      }
    } catch {
      // Trigger auto-discovery in background if default IP didn't respond
      discoverLocalServerIp().catch(() => {});
    }
  }

  // 1. Direct Cloud Firestore state fetch (<100ms when internet is available)
  const firestoreDb = getFirestoreDb();
  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'sultan_restaurant', 'live_state');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data?.state) {
          isCloudConnected = true;
          if (!loadedRemotely) {
            applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
            loadedRemotely = true;
          }
        }
      }
    } catch (e) {
      isCloudConnected = false;
      console.warn('[SyncService] Initial Firestore fetch error:', e);
    }
  }

  // 2. Fallback to Firebase REST only if neither LAN nor Firestore loaded
  if (!loadedRemotely) {
    try {
      const res = await fetch(FIREBASE_REST_URL);
      if (res.ok) {
        const data = await res.json();
        if (data?.state) {
          isCloudConnected = true;
          applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
          loadedRemotely = true;
          isRtdbAccessible = true;
        }
      }
    } catch (_) {}
  }

  hasReceivedInitialSync = true;
}

/** Native browser Server-Sent Events (SSE) stream for zero-latency, sub-100ms real-time pushes */
function initWebSSE() {
  if (!isRtdbAccessible || Platform.OS !== 'web' || typeof window === 'undefined' || !window.EventSource) {
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
  if (!isRtdbAccessible || isApplyingRemoteUpdate) return;
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
}

let lastServerKnownUpdated = 0;
let lastWsReceivedAt = 0;

async function pollLocalLanFallback() {
  if (isApplyingRemoteUpdate) return;
  // Only poll via HTTP fallback when WebSocket is disconnected OR no WS traffic arrived in the last 12s
  if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastWsReceivedAt < 12000 && hasReceivedInitialSync) {
    return;
  }
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  if (!httpUrl) return;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
  try {
    const res = await fetch(`${httpUrl}/api/sync`, {
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (res.ok) {
      const serverState = await res.json();
      if (timer) clearTimeout(timer);
      if (serverState && typeof serverState === 'object') {
        isLanConnected = true;
        syncStatus = 'connected';
        const srvTs = Number(serverState.lastUpdated || serverState.timestamp || 0);
        if (!hasReceivedInitialSync || !srvTs || srvTs !== lastServerKnownUpdated) {
          if (srvTs) lastServerKnownUpdated = srvTs;
          applyRemoteStateSafely(serverState.state || serverState, serverState.packetId, srvTs || Date.now());
        } else {
          notifyListeners();
        }
        if (hasUnsyncedLocalChanges) {
          broadcastLocalState(true);
        }
      }
    } else if (timer) {
      clearTimeout(timer);
    }
  } catch {
    if (timer) clearTimeout(timer);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      isLanConnected = false;
      discoverLocalServerIp().catch(() => {});
    }
  }
}

function connectWebSocket(forceReconnect = false) {
  const { wsUrl } = parseServerEndpoints(currentServerAddress);

  // Never tear down an already-open or connecting WebSocket to the same server URL
  if (
    !forceReconnect &&
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) &&
    currentWsUrl === wsUrl
  ) {
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
      ws.onclose = null;
      ws.close();
    } catch {}
    ws = null;
  }

  if (!wsUrl) {
    syncStatus = isCloudConnected ? 'connected' : 'offline';
    notifyListeners();
    return;
  }

  try {
    currentWsUrl = wsUrl;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isLanConnected = true;
      syncStatus = 'connected';
      lastSyncedAt = Date.now();
      lastWsReceivedAt = Date.now();
      totalSyncedEvents++;
      notifyListeners();

      // Request fresh server state immediately on connect
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'PING' }));
        } catch {}
      }

      // Flush any offline local orders immediately upon reconnection
      if (hasUnsyncedLocalChanges) {
        broadcastLocalState(true);
      }

      // Start keep-alive ping every 5s so lastWsReceivedAt stays fresh
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'PING' }));
          } catch {}
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      try {
        lastWsReceivedAt = Date.now();
        const data = JSON.parse(event.data as string);

        // Ignore messages sent by this same device
        if (data.senderId === DEVICE_ID) return;

        if (data.type === 'FORCE_LOGOUT_DEVICE') {
          useRestaurantStore.setState((s) => ({
            ...(Array.isArray(data.activeStaffSessions) ? { activeStaffSessions: data.activeStaffSessions } : {}),
            ...(data.revokedSessions && typeof data.revokedSessions === 'object'
              ? {
                  revokedSessions: {
                    ...(s.revokedSessions || {}),
                    ...data.revokedSessions,
                  },
                }
              : {}),
            ...(data.revokedDeviceIds && typeof data.revokedDeviceIds === 'object'
              ? {
                  revokedDeviceIds: {
                    ...(s.revokedDeviceIds || {}),
                    ...data.revokedDeviceIds,
                  },
                }
              : {}),
          }));
        } else if (data.type === 'INIT_STATE' || data.type === 'SERVER_BROADCAST') {
          if (data.state) {
            isLanConnected = true;
            if (data.state.lastUpdated) {
              lastServerKnownUpdated = Number(data.state.lastUpdated);
            }
            applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
          }
        } else if (data.type === 'FOOD_READY_ALERT') {
          if (data.lastFoodReadyAlert) {
            useRestaurantStore.setState((s) => ({
              lastFoodReadyAlert: data.lastFoodReadyAlert,
              tickets: s.tickets.map((t) => (t.id === data.ticketId && data.ticket ? { ...t, ...data.ticket } : t)),
            }));
          }
        } else if (data.type === 'TICKET_DISPATCHED') {
          useRestaurantStore.setState((s) => ({
            tickets: s.tickets.map((t) => (t.id === data.ticketId && data.ticket ? { ...t, ...data.ticket } : t)),
            lastFoodReadyAlert: s.lastFoodReadyAlert?.ticketId === data.ticketId ? null : s.lastFoodReadyAlert,
          }));
        } else if (data.type === 'COOKING_STARTED_ALERT') {
          if (data.lastFoodReadyAlert) {
            useRestaurantStore.setState((s) => ({
              lastFoodReadyAlert: data.lastFoodReadyAlert,
              tickets: s.tickets.map((t) => (t.id === data.ticketId && data.ticket ? { ...t, ...data.ticket } : t)),
            }));
          }
        } else if (data.type === 'ORDER_STATUS_CHANGED') {
          const { orderId, orderNumber, status, riderName, riderPhone, assignedWaiter } = data;
          useRestaurantStore.setState((s) => ({
            onlineOrders: (s.onlineOrders || []).map((o) => {
              if ((orderId && o.id === orderId) || (orderNumber && o.orderNumber === orderNumber)) {
                return {
                  ...o,
                  status: status || o.status,
                  riderName: riderName || o.riderName,
                  riderPhone: riderPhone || o.riderPhone,
                  assignedWaiter: assignedWaiter || o.assignedWaiter,
                  updatedAt: Date.now(),
                };
              }
              return o;
            }),
          }));
        }
      } catch (err) {
        console.warn('[SyncService] Failed to parse message:', err);
      }
    };

    ws.onerror = () => {
      // Handled in onclose
    };

    ws.onclose = () => {
      ws = null;
      isLanConnected = false;
      if (!isCloudConnected) {
        syncStatus = 'offline';
        notifyListeners();
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      // Auto-discover server IP on the local router in case subnet changed (e.g. 192.168.0.x <-> 192.168.100.x)
      discoverLocalServerIp().catch(() => {});
      // Reconnect after 3s
      reconnectTimer = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };
  } catch {
    isLanConnected = false;
    if (!isCloudConnected) {
      syncStatus = 'offline';
      notifyListeners();
    }
    discoverLocalServerIp().catch(() => {});
    reconnectTimer = setTimeout(() => {
      connectWebSocket();
    }, 3500);
  }
}

export function reconnect() {
  connectWebSocket(true);
  if (isFirebaseConfigured) {
    initFirebaseSync();
  }
}

/** Broadcast local state changes to Firebase Cloud Database or WebSocket server */
function broadcastLocalState(force = false) {
  if (!force && isApplyingRemoteUpdate) return;
  hasUnsyncedLocalChanges = true;

  const state = useRestaurantStore.getState();
  const opsState = getOpsSyncState();
  const kitchenState = getKitchenSyncState();
  const roleState = useRoleStore.getState();
  const shiftState = useShiftStore.getState();
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
      deletedTicketIds: state.deletedTicketIds || [],
      invoices: state.invoices,
      customers: state.customers,
      menuItems: state.menuItems,
      categories: state.categories,
      regions: state.regions,
      zones: state.zones,
      staff: state.staff,
      attendance: state.attendance || [],
      salaryPayments: state.salaryPayments || [],
      feedbacks: state.feedbacks || [],
      salesReturns: state.salesReturns || [],
      reservations: state.reservations,
      onlineOrders: state.onlineOrders,
      pendingFloorOrderAlert: state.pendingFloorOrderAlert,
      lastBillPaidAlert: state.lastBillPaidAlert,
      lastFoodReadyAlert: state.lastFoodReadyAlert,
      roles: roleState.roles,
      shifts: shiftState.shifts,
      activeShiftId: shiftState.activeShiftId,
      systemSettings: useSettingsStore.getState().settings,
      activeStaffSessions: state.activeStaffSessions || [],
      revokedSessions: state.revokedSessions || {},
      revokedDeviceIds: state.revokedDeviceIds || {},
      ...opsState,
      ...kitchenState,
    },
  };

  // 1. Direct Local LAN WebSocket Broadcast (Instantaneous sub-10ms delivery)
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
      hasUnsyncedLocalChanges = false;
      lastSyncedAt = Date.now();
      totalSyncedEvents++;
      notifyListeners();
    } catch (wsErr) {
      console.warn('[SyncService] Local LAN ws.send error:', wsErr);
    }
  }

  // 2. Direct Local LAN HTTP POST Broadcast (Guaranteed fallback delivery + auto-discovery retry)
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  if (httpUrl) {
    try {
      fetch(`${httpUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          if (res.ok) {
            hasUnsyncedLocalChanges = false;
            isLanConnected = true;
            syncStatus = 'connected';
            lastSyncedAt = Date.now();
            totalSyncedEvents++;
            notifyListeners();
          }
        })
        .catch(() => {
          // If POST failed (e.g. router subnet changed), auto-discover new server IP and re-send immediately!
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            discoverLocalServerIp()
              .then((discoveredIp) => {
                if (discoveredIp) {
                  const retryEp = parseServerEndpoints(discoveredIp);
                  if (retryEp.httpUrl) {
                    fetch(`${retryEp.httpUrl}/api/sync`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                      .then((r) => {
                        if (r.ok) hasUnsyncedLocalChanges = false;
                      })
                      .catch(() => {});
                  }
                }
              })
              .catch(() => {});
          }
        });
    } catch {}
  }

  // 3. Parallel Cloud Firebase Broadcast (Firestore & Realtime Database)
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

    // C. Direct HTTP REST PUT (guaranteed to deliver across all platforms and networks if RTDB active)
    if (isRtdbAccessible) {
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
    }
  }
}

let immediateBroadcastPending = false;
/** Force immediate cloud broadcast without any debounce delay (coalesced across synchronous mutations) */
export function broadcastImmediately() {
  hasUnsyncedLocalChanges = true;
  if (debounceMutationTimer) {
    clearTimeout(debounceMutationTimer);
    debounceMutationTimer = null;
  }
  if (immediateBroadcastPending) return;
  immediateBroadcastPending = true;
  setTimeout(() => {
    immediateBroadcastPending = false;
    broadcastLocalState(true);
  }, 0);
}

export async function initSyncService() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    currentServerAddress = await resolveDefaultServerIp();
  } catch {}
  connectWebSocket();
  discoverLocalServerIp().catch(() => {});

  if (lanHttpPollTimer) clearInterval(lanHttpPollTimer);
  lanHttpPollTimer = setInterval(pollLocalLanFallback, 2200);

  if (isFirebaseConfigured) {
    initFirebaseSync();
  }

  const triggerDebouncedBroadcast = () => {
    if (isApplyingRemoteUpdate || !hasReceivedInitialSync) return;
    if (useSettingsStore.getState().settings.autoSyncEnabled === false) return;
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

  // Listen to shift & cash drawer store mutations
  useShiftStore.subscribe(triggerDebouncedBroadcast);

  // Listen to system settings store mutations
  useSettingsStore.subscribe(triggerDebouncedBroadcast);
}

export async function forceSyncNow(): Promise<boolean> {
  if (hasUnsyncedLocalChanges) {
    broadcastLocalState(true);
  }
  // 1. Always try Local LAN Central Hub first (works 100% offline & online)
  let { httpUrl } = parseServerEndpoints(currentServerAddress);
  if (httpUrl) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 1500) : null;
      const res = await fetch(`${httpUrl}/api/sync`, {
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timer) clearTimeout(timer);
      if (res.ok) {
        const serverState = await res.json();
        isLanConnected = true;
        applyRemoteStateSafely(serverState.state || serverState);
        reconnect();
        return true;
      }
    } catch {}
  }

  // 2. If current IP didn't answer, auto-discover LAN Server IP and retry
  const discovered = await discoverLocalServerIp();
  if (discovered) {
    const endpoints = parseServerEndpoints(discovered);
    if (endpoints.httpUrl) {
      try {
        const res = await fetch(`${endpoints.httpUrl}/api/sync`);
        if (res.ok) {
          const serverState = await res.json();
          isLanConnected = true;
          applyRemoteStateSafely(serverState.state || serverState);
          return true;
        }
      } catch {}
    }
  }

  // 3. Fallback to Cloud Firestore / Firebase Realtime DB if internet is available
  if (isFirebaseConfigured) {
    const firestoreDb = getFirestoreDb();
    if (firestoreDb) {
      try {
        const docSnap = await getDoc(doc(firestoreDb, 'sultan_restaurant', 'live_state'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data?.state) {
            isCloudConnected = true;
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
          isCloudConnected = true;
          applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
          return true;
        }
      }
    } catch (err) {
      console.warn('[SyncService] Firebase forceSync error:', err);
    }
  }

  reconnect();
  return false;
}
