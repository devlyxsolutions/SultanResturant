import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { onValue, ref, set } from 'firebase/database';
import { doc, getDoc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { Platform } from 'react-native';
import { getKitchenSyncState, useKitchenStore } from '../store/kitchenStore';
import { getOpsSyncState, useOpsStore } from '../store/opsStore';
import { useRestaurantStore } from '../store/restaurantStore';
import { useRoleStore } from '../store/roleStore';
import { useSettingsStore } from '../store/settingsStore';
import { useShiftStore } from '../store/shiftStore';
import {
  fetchPublicMenuFromCloud,
  isCustomerPortalRoute,
  isPublicCloudHost,
  isPublicCloudHostname,
  publishPublicMenuToCloud,
  startCloudOrdersListener,
} from './cloudMenuBridge';
import { FIREBASE_REST_BASE_URL, getFirebaseDb, getFirestoreDb, isFirebaseConfigured } from './firebase';

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
      } catch { }
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
  } catch { }
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
let serverClockOffsetMs: number = 0;

export function updateServerClockOffset(serverTime?: number) {
  if (typeof serverTime === 'number' && Number.isFinite(serverTime) && serverTime > 1700000000000) {
    serverClockOffsetMs = serverTime - Date.now();
  }
}

export function getSyncedNow(): number {
  return Date.now() + serverClockOffsetMs;
}
let lastProcessedPacketId: string = '';
const processedPacketIds = new Set<string>();
let sseConnection: any = null;
let firestoreUnsubscribe: Unsubscribe | null = null;
let isApplyingRemoteUpdate = false;
let hasReceivedInitialSync = false;
let hasHydratedRemoteOps = false;
let isInitialized = false;
let hasUnsyncedLocalChanges = false;
let currentWsUrl = '';
let unackedPacketId = '';
let pendingFlushTimer: ReturnType<typeof setInterval> | null = null;

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
  const syncedNow = getSyncedNow();
  if (typeof timestamp === 'number' && timestamp > lastProcessedRemoteTimestamp) {
    lastProcessedRemoteTimestamp = Math.min(timestamp, syncedNow + 15000);
  } else if (!lastProcessedRemoteTimestamp) {
    lastProcessedRemoteTimestamp = syncedNow;
  }
  hasReceivedInitialSync = true;
  hasHydratedRemoteOps = true;
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
    } catch { }
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

/** Fetches health metadata from a candidate Sultan Hub endpoint */
async function fetchSultanHealth(
  httpUrl: string,
  timeoutMs = 950
): Promise<{ ok: boolean; instanceId?: string; lastUpdated?: number }> {
  if (!httpUrl) return { ok: false };
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const res = await fetch(`${httpUrl.replace(/\/+$/, '')}/health`, {
      method: 'GET',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const serverName = String(data?.server || '').toLowerCase();
    // Strictly require Sultan server identity — never sync with unrelated POS servers on the same machine
    if (!serverName || !serverName.includes('sultan')) {
      return { ok: false };
    }
    return {
      ok: Boolean(data && data.status === 'online'),
      instanceId: data?.instanceId ? String(data.instanceId) : undefined,
      lastUpdated: typeof data?.lastUpdated === 'number' ? data.lastUpdated : undefined,
    };
  } catch {
    return { ok: false };
  }
}

/** Verifies that a given HTTP base URL hosts Sultan Restaurant's Central POS Hub (and NOT another POS app on port 5050). */
async function verifySultanServer(httpUrl: string, timeoutMs = 950): Promise<boolean> {
  const h = await fetchSultanHealth(httpUrl, timeoutMs);
  return h.ok;
}

/** Probes a candidate LAN IP to check if Sultan Central POS Hub is running there */
async function probeLanIp(ip: string, timeoutMs = 900): Promise<boolean> {
  return verifySultanServer(`http://${ip}:${SERVER_PORT}`, timeoutMs);
}

/** Automatically discovers the Sultan POS Hub IP across common restaurant LAN subnets (192.168.0.x, 192.168.100.x, 192.168.1.x) */
export async function discoverLocalServerIp(): Promise<string | null> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1' && !isPublicCloudHostname(h)) {
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
        } catch { }
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
          } catch { }
          connectWebSocket();
          return found;
        }
      }
    }
  } catch { } finally {
    isDiscoveringLan = false;
  }
  return null;
}

/** Resolves default server host based on environment */
export async function resolveDefaultServerIp(): Promise<string> {
  // 1. If running in Web browser, always prefer the browser's current LAN IP host
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    // Public cloud domains (sultanrestaurant.com.pk, netlify.app) have no local POS hub
    if (isPublicCloudHostname(host)) {
      return '';
    }
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
    // If desktop app opened on 127.0.0.1/localhost of a secondary Cashier PC, prefer Basement Master Hub (192.168.1.10)
    // unless 127.0.0.1 is itself that exact server instance.
    try {
      const [localHealth, masterHealth] = await Promise.all([
        fetchSultanHealth(`http://127.0.0.1:${SERVER_PORT}`, 450),
        fetchSultanHealth(`http://192.168.1.10:${SERVER_PORT}`, 650),
      ]);
      if (masterHealth.ok && (!localHealth.ok || !localHealth.instanceId || localHealth.instanceId !== masterHealth.instanceId)) {
        return '192.168.1.10';
      }
    } catch { }
    return '127.0.0.1';
  }

  // 2. Check custom saved address in storage (ignore old dead 192.168.1.4 / 192.168.1.14 defaults)
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_SERVER_IP);
    if (saved && saved.trim() && saved.trim() !== '192.168.1.4' && saved.trim() !== '192.168.1.14') {
      return saved.trim();
    }
  } catch { }

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

  // 0. Try Local LAN Central Server first (<50ms on restaurant Wi-Fi / LAN), ONLY if verified as Sultan Hub
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  if (httpUrl && (await verifySultanServer(httpUrl, 1000))) {
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
      discoverLocalServerIp().catch(() => { });
    }
  }

  // 1. Direct Cloud Firestore state fetch (<100ms when internet is available, only if LAN didn't load)
  if (!loadedRemotely) {
    const firestoreDb = getFirestoreDb();
    if (firestoreDb) {
      try {
        const docRef = doc(firestoreDb, 'sultan_restaurant', 'live_state');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data?.state) {
            isCloudConnected = true;
            applyRemoteStateSafely(data.state, data.packetId, data.timestamp);
            loadedRemotely = true;
          }
        }
      } catch (e) {
        isCloudConnected = false;
        console.warn('[SyncService] Initial Firestore fetch error:', e);
      }
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
    } catch (_) { }
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
    } catch { }
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
      } catch { }
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

  // 3. Real-time Cloud Firestore listener (onSnapshot) - Only attach if NOT connected to LAN server
  const firestoreDb = getFirestoreDb();
  if (firestoreDb && !isLanConnected) {
    if (firestoreUnsubscribe) {
      try {
        firestoreUnsubscribe();
      } catch { }
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

  // 4. Real-time Firebase Realtime DB SDK WebSocket listener - Only attach if NOT connected to LAN server
  const db = getFirebaseDb();
  if (db && !isLanConnected) {
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
let peerLanHubHttpUrl = '';
let lastPeerProbeAt = 0;
let lastPeerKnownUpdated = 0;

function isLoopbackHost(addr: string): boolean {
  const clean = (addr || '').trim().toLowerCase();
  return clean === '127.0.0.1' || clean === 'localhost' || clean.startsWith('127.0.0.1:') || clean.startsWith('localhost:');
}

async function resolvePeerLanMasterHub(localHttpUrl: string): Promise<string> {
  const now = Date.now();
  if (now - lastPeerProbeAt < 10000) return peerLanHubHttpUrl;
  lastPeerProbeAt = now;
  try {
    const localHealth = await fetchSultanHealth(localHttpUrl, 700);
    const localId = localHealth.instanceId;
    let savedIp = '';
    try {
      savedIp = (await AsyncStorage.getItem(STORAGE_KEY_SERVER_IP)) || '';
    } catch { }
    const candidates = Array.from(
      new Set([
        savedIp && !isLoopbackHost(savedIp) ? parseServerEndpoints(savedIp).httpUrl : '',
        `http://192.168.1.10:${SERVER_PORT}`,
      ].filter(Boolean))
    );
    for (const cand of candidates) {
      if (!cand || cand === localHttpUrl) continue;
      const h = await fetchSultanHealth(cand, 700);
      if (h.ok && (!localId || !h.instanceId || h.instanceId !== localId)) {
        peerLanHubHttpUrl = cand;
        return peerLanHubHttpUrl;
      }
    }
  } catch { }
  peerLanHubHttpUrl = '';
  return '';
}

async function pollLocalLanFallback(forcePull = false) {
  if (!forcePull && isApplyingRemoteUpdate) return;
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  // If running on localhost/127.0.0.1 (e.g. second Cashier PC), keep checking if a Master LAN Hub is reachable too
  if (httpUrl && isLoopbackHost(currentServerAddress)) {
    resolvePeerLanMasterHub(httpUrl)
      .then(async (peerUrl) => {
        if (!peerUrl || peerUrl === httpUrl) return;
        try {
          const pRes = await fetch(`${peerUrl}/api/sync`);
          if (!pRes.ok) return;
          const pState = await pRes.json();
          const pTs = Number(pState?.lastUpdated || pState?.timestamp || 0);
          if (pState && typeof pState === 'object' && (!lastPeerKnownUpdated || pTs !== lastPeerKnownUpdated)) {
            if (pTs) lastPeerKnownUpdated = pTs;
            applyRemoteStateSafely(pState.state || pState, pState.packetId, pTs || Date.now());
          }
        } catch { }
      })
      .catch(() => { });
  }
  // Only skip HTTP GET when WS is healthy AND no unacknowledged local orders are waiting
  if (!forcePull && !hasUnsyncedLocalChanges && ws && ws.readyState === WebSocket.OPEN && Date.now() - lastWsReceivedAt < 8000 && hasReceivedInitialSync) {
    return;
  }
  if (!httpUrl) return;
  if (!(await verifySultanServer(httpUrl, 1200))) {
    isLanConnected = false;
    return;
  }
  if (hasUnsyncedLocalChanges && !isApplyingRemoteUpdate) {
    broadcastLocalState(true);
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
  try {
    const res = await fetch(`${httpUrl}/api/sync`, {
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (res.ok) {
      const serverState = await res.json();
      if (timer) clearTimeout(timer);
      if (serverState && typeof serverState === 'object') {
        isLanConnected = true;
        syncStatus = 'connected';
        const srvTs = Number(serverState.lastUpdated || serverState.timestamp || 0);
        if (!hasReceivedInitialSync || forcePull || !srvTs || srvTs !== lastServerKnownUpdated) {
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
      discoverLocalServerIp().catch(() => { });
    }
  }
}

function connectWebSocket(forceReconnect = false) {
  const { wsUrl, httpUrl } = parseServerEndpoints(currentServerAddress);

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
    } catch { }
    ws = null;
  }

  if (!wsUrl) {
    syncStatus = isCloudConnected ? 'connected' : 'offline';
    notifyListeners();
    return;
  }

  // Verify the target port 5050 server actually belongs to Sultan Restaurant before opening WebSocket
  verifySultanServer(httpUrl, 950).then((isSultan) => {
    if (!isSultan) {
      isLanConnected = false;
      syncStatus = isCloudConnected ? 'connected' : 'offline';
      notifyListeners();
      return;
    }
    openVerifiedWebSocket(wsUrl);
  });
}

function openVerifiedWebSocket(wsUrl: string) {
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
        } catch { }
      }

      // Flush any offline local orders immediately upon reconnection
      if (hasUnsyncedLocalChanges) {
        broadcastLocalState(true);
      }

      // Start keep-alive + dead-socket watchdog every 2s so router drops never stall for 10-15 mins
      pingTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (lastWsReceivedAt > 0 && Date.now() - lastWsReceivedAt > 6500) {
          console.warn('[SyncService] WebSocket PONG timed out (dead router link) — reconnecting immediately...');
          try {
            ws.close();
          } catch { }
          connectWebSocket(true);
          pollLocalLanFallback(true).catch(() => { });
          return;
        }
        try {
          ws.send(JSON.stringify({ type: 'PING' }));
        } catch {
          try {
            ws.close();
          } catch { }
          connectWebSocket(true);
        }
      }, 2000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === 'PONG') {
          updateServerClockOffset(data.serverTime);
          lastWsReceivedAt = Date.now();
          if (data.lastUpdated && Number(data.lastUpdated) !== lastServerKnownUpdated) {
            pollLocalLanFallback(true).catch(() => { });
          }
          return;
        }
        if (data.type === 'SYNC_ACK') {
          updateServerClockOffset(data.serverTime);
          lastWsReceivedAt = Date.now();
          lastSyncedAt = Date.now();
          if (!unackedPacketId || data.packetId === unackedPacketId) {
            hasUnsyncedLocalChanges = false;
            unackedPacketId = '';
          }
          notifyListeners();
          return;
        }
        updateServerClockOffset(data.serverTime);
        lastWsReceivedAt = Date.now();

        // Ignore messages sent by this same device
        if (data.senderId === DEVICE_ID) return;

        if (data.type === 'SYSTEM_LOG_BATCH' && Array.isArray(data.logs) && data.logs.length > 0) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useSystemLogStore } = require('../store/systemLogStore');
            useSystemLogStore?.getState()?.pushLogs(data.logs);
          } catch { }
        } else if (data.type === 'FORCE_LOGOUT_DEVICE') {
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
            ...(data.forceLogoutAll && typeof data.forceLogoutAll === 'object'
              ? {
                forceLogoutAll: data.forceLogoutAll,
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
              foodReadyAlerts: [
                data.lastFoodReadyAlert,
                ...(s.foodReadyAlerts || []).filter((a) => a && a.id !== data.lastFoodReadyAlert.id),
              ].slice(0, 25),
              tickets: s.tickets.map((t) => (t.id === data.ticketId && data.ticket ? { ...t, ...data.ticket } : t)),
            }));
          }
        } else if (data.type === 'TICKET_DISPATCHED') {
          useRestaurantStore.setState((s) => ({
            tickets: s.tickets.map((t) => (t.id === data.ticketId && data.ticket ? { ...t, ...data.ticket } : t)),
            lastFoodReadyAlert: s.lastFoodReadyAlert?.ticketId === data.ticketId ? null : s.lastFoodReadyAlert,
            foodReadyAlerts: (s.foodReadyAlerts || []).filter((a) => a.ticketId !== data.ticketId),
          }));
        } else if (data.type === 'COOKING_STARTED_ALERT') {
          if (data.lastFoodReadyAlert) {
            useRestaurantStore.setState((s) => ({
              lastFoodReadyAlert: data.lastFoodReadyAlert,
              foodReadyAlerts: [
                data.lastFoodReadyAlert,
                ...(s.foodReadyAlerts || []).filter((a) => a && a.id !== data.lastFoodReadyAlert.id),
              ].slice(0, 25),
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
      discoverLocalServerIp().catch(() => { });
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
    discoverLocalServerIp().catch(() => { });
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
  // Never allow public customer browsers on Netlify/4G (/menu or /feedback) to overwrite POS live_state!
  if (isCustomerPortalRoute() && isPublicCloudHost()) return;
  hasUnsyncedLocalChanges = true;
  // Keep public cloud menu snapshot fresh for customer phones scanning QR codes over 4G/5G
  if (!isCustomerPortalRoute()) {
    publishPublicMenuToCloud();
  }

  const state = useRestaurantStore.getState();
  const opsState = getOpsSyncState();
  const kitchenState = getKitchenSyncState();
  const roleState = useRoleStore.getState();
  const shiftState = useShiftStore.getState();
  const now = Math.max(getSyncedNow(), lastProcessedRemoteTimestamp + 1, lastLocalBroadcastTimestamp + 1);
  lastLocalBroadcastTimestamp = now;
  const broadcastSeq = ++currentBroadcastSeq;
  const packetId = `${DEVICE_ID}_${now}_${Math.random().toString(36).substring(2, 7)}`;
  rememberPacketId(packetId);
  lastProcessedRemoteTimestamp = now;

  const safeOpsPayload: Record<string, any> = {};
  for (const [k, v] of Object.entries(opsState)) {
    if (hasHydratedRemoteOps || !Array.isArray(v) || v.length > 0) {
      safeOpsPayload[k] = v;
    }
  }
  const safeKitchenPayload: Record<string, any> = {};
  for (const [k, v] of Object.entries(kitchenState)) {
    if (hasHydratedRemoteOps || !Array.isArray(v) || v.length > 0) {
      safeKitchenPayload[k] = v;
    }
  }

  const payload = {
    type: 'CLIENT_UPDATE',
    senderId: DEVICE_ID,
    packetId,
    timestamp: now,
    state: {
      tables: state.tables,
      deletedTableIds: state.deletedTableIds || [],
      deletedFloorIds: state.deletedFloorIds || [],
      floors: state.floors || [],
      tickets: state.tickets,
      deletedTicketIds: state.deletedTicketIds || [],
      operationalDayStartAt: state.operationalDayStartAt || 0,
      invoiceSequenceState: state.invoiceSequenceState,
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
      foodReadyAlerts: state.foodReadyAlerts || [],
      roles: roleState.roles,
      shifts: shiftState.shifts,
      activeShiftId: shiftState.activeShiftId,
      systemSettings: useSettingsStore.getState().settings,
      activeStaffSessions: state.activeStaffSessions || [],
      revokedSessions: state.revokedSessions || {},
      revokedDeviceIds: state.revokedDeviceIds || {},
      forceLogoutAll: state.forceLogoutAll || null,
      ...safeOpsPayload,
      ...safeKitchenPayload,
    },
  };

  unackedPacketId = packetId;

  // 1. Direct Local LAN WebSocket Broadcast (Wait for SYNC_ACK / HTTP 200 before clearing hasUnsyncedLocalChanges!)
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
      lastSyncedAt = Date.now();
      totalSyncedEvents++;
      notifyListeners();
    } catch (wsErr) {
      console.warn('[SyncService] Local LAN ws.send error:', wsErr);
    }
  }

  // 2. Direct Local LAN HTTP POST Broadcast (Guaranteed delivery + timeout + auto-discovery retry)
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  if (httpUrl) {
    if (peerLanHubHttpUrl && peerLanHubHttpUrl !== httpUrl) {
      try {
        fetch(`${peerLanHubHttpUrl}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => { });
      } catch { }
    }
    try {
      const postCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const postTimer = postCtrl ? setTimeout(() => postCtrl.abort(), 3500) : null;
      fetch(`${httpUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        ...(postCtrl ? { signal: postCtrl.signal } : {}),
      })
        .then(async (res) => {
          if (postTimer) clearTimeout(postTimer);
          if (res.ok) {
            if (unackedPacketId === packetId || broadcastSeq === currentBroadcastSeq) {
              hasUnsyncedLocalChanges = false;
              unackedPacketId = '';
            }
            isLanConnected = true;
            syncStatus = 'connected';
            lastSyncedAt = Date.now();
            totalSyncedEvents++;
            notifyListeners();
          } else {
            console.warn(`[SyncService] POST /api/sync returned HTTP ${res.status}; keeping local changes queued`);
            hasUnsyncedLocalChanges = true;
          }
        })
        .catch(() => {
          if (postTimer) clearTimeout(postTimer);
          // If POST failed (e.g. router reboot/roaming), discover server IP and re-send immediately!
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
                      if (r.ok && (unackedPacketId === packetId || broadcastSeq === currentBroadcastSeq)) {
                        hasUnsyncedLocalChanges = false;
                        unackedPacketId = '';
                      }
                    })
                    .catch(() => { });
                }
              }
            })
            .catch(() => { });
        });
    } catch { }
  }

  // 3. Cloud Firebase (Fallback only when LAN is disconnected / offline)
  // When connected to local LAN Server, clients do NOT send writes or attach listeners to Firebase,
  // because the local server authoritatively manages all clients and syncs to Firebase periodically.
  if (isFirebaseConfigured && !isLanConnected) {
    // Abort any older in-flight HTTP PUT so an older packet can never finish after a newer packet
    if (activePutAbortController) {
      try {
        activePutAbortController.abort();
      } catch { }
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
      } catch { }
    }

    // B. Via Firebase Realtime DB Web SDK
    const db = getFirebaseDb();
    if (db) {
      try {
        const stateRef = ref(db, 'sultan_restaurant/live_state');
        set(stateRef, payload).catch(() => { });
        const lastUpdatedRef = ref(db, 'sultan_restaurant/last_updated');
        set(lastUpdatedRef, now).catch(() => { });
      } catch { }
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
          }).catch(() => { });

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

  // Public customer portal on Netlify / Cloud (4G/5G mobile phones scanning QR codes):
  // Skip all private LAN probes & live_state writes — hydrate lightweight public menu directly from Firestore!
  if (isCustomerPortalRoute() && isPublicCloudHost()) {
    syncStatus = 'connecting';
    notifyListeners();
    fetchPublicMenuFromCloud()
      .then((ok) => {
        if (ok) {
          isCloudConnected = true;
          syncStatus = 'connected';
          lastSyncedAt = Date.now();
          hasReceivedInitialSync = true;
          notifyListeners();
        }
      })
      .catch(() => { });
    return;
  }

  try {
    currentServerAddress = await resolveDefaultServerIp();
  } catch { }
  if (!isPublicCloudHost()) {
    connectWebSocket();
    discoverLocalServerIp().catch(() => { });
    if (lanHttpPollTimer) clearInterval(lanHttpPollTimer);
    lanHttpPollTimer = setInterval(pollLocalLanFallback, 2200);
    if (pendingFlushTimer) clearInterval(pendingFlushTimer);
    pendingFlushTimer = setInterval(() => {
      if (hasUnsyncedLocalChanges && !isApplyingRemoteUpdate) {
        broadcastLocalState(true);
      }
    }, 2500);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => {
        connectWebSocket(true);
        pollLocalLanFallback(true).catch(() => { });
        if (hasUnsyncedLocalChanges && !isApplyingRemoteUpdate) {
          broadcastLocalState(true);
        }
      });
    }
  }

  if (isFirebaseConfigured) {
    initFirebaseSync();
    // Restaurant staff devices listen in real time for customer 4G/5G QR orders from Firestore
    if (!isCustomerPortalRoute()) {
      startCloudOrdersListener(() => {
        broadcastImmediately();
      });
      // Publish live menu & table snapshot to Cloud Firestore so QR scans always see up-to-date menu
      setTimeout(() => {
        publishPublicMenuToCloud(true);
      }, 2000);
    }
  }

  const triggerDebouncedBroadcast = () => {
    if (isApplyingRemoteUpdate || !hasReceivedInitialSync) return;
    if (useSettingsStore.getState().settings.autoSyncEnabled === false) return;
    if (debounceMutationTimer) clearTimeout(debounceMutationTimer);
    debounceMutationTimer = setTimeout(() => {
      broadcastLocalState();
    }, 180);
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
    } catch { }
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
      } catch { }
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

/** Sends an atomic POS command (e.g. /api/pos/mark-billed or /api/pos/settle-bill) directly to the Master LAN Hub */
export async function postPosAtomicEndpoint(path: string, body: Record<string, any>): Promise<boolean> {
  if (isCustomerPortalRoute() && isPublicCloudHost()) return false;
  const { httpUrl } = parseServerEndpoints(currentServerAddress);
  const candidates = Array.from(
    new Set(
      [
        httpUrl,
        typeof window !== 'undefined' && window.location?.hostname && !isPublicCloudHostname(window.location.hostname)
          ? `http://${window.location.hostname}:${SERVER_PORT}`
          : '',
        `http://192.168.1.10:${SERVER_PORT}`,
      ].filter(Boolean)
    )
  );
  for (const base of candidates) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
      const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timer) clearTimeout(timer);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.timestamp && Number(data.timestamp) > lastServerKnownUpdated) {
          lastServerKnownUpdated = Number(data.timestamp);
        }
        return true;
      }
    } catch { }
  }
  return false;
}
