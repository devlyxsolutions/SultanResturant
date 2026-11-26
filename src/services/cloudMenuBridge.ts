import { Platform } from 'react-native';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from './firebase';
import { useRestaurantStore, type OnlineOrder, type Ticket } from '../store/restaurantStore';
import { useOpsStore } from '../store/opsStore';
import { useSettingsStore } from '../store/settingsStore';

const PUBLIC_MENU_DOC_PATH = ['sultan_restaurant', 'public_menu'] as const;
const WEBSITE_INFO_DOC_PATH = ['sultan_restaurant', 'website_info'] as const;
const LIVE_STATE_DOC_PATH = ['sultan_restaurant', 'live_state'] as const;
const CLOUD_ORDERS_COLLECTION = 'sultan_cloud_orders';

let cloudOrdersUnsub: Unsubscribe | null = null;
let lastMenuPublishAt = 0;
let menuPublishTimer: ReturnType<typeof setTimeout> | null = null;
const processedCloudOrderIds = new Set<string>();

/**
 * Returns true when running in a web browser hosted on a public HTTPS cloud domain
 * (such as Netlify or a custom domain) rather than localhost or a local LAN IP.
 */
export function isPublicCloudHost(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location?.hostname) {
    return false;
  }
  return isPublicCloudHostname(window.location.hostname);
}

/**
 * Returns true if a hostname is a public internet domain (e.g. sultanrestaurant.com.pk,
 * www.sultanrestaurant.com.pk, sultanrestaurant092.netlify.app) rather than the restaurant's
 * local POS hub (localhost, LAN/IP address, or a dot-less PC name like "sultan-pc").
 */
export function isPublicCloudHostname(hostname: string): boolean {
  const h = (hostname || '').trim().toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.lan')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false; // any raw IPv4 = local hub
  if (h.includes(':') || h.startsWith('[')) return false; // raw IPv6
  if (!h.includes('.')) return false; // NetBIOS/PC name on LAN
  return true;
}

/**
 * Returns true when the current browser tab is on a public customer portal route (/menu or /feedback).
 */
export function isCustomerPortalRoute(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location?.pathname) {
    return false;
  }
  const p = window.location.pathname.toLowerCase();
  return p === '/menu' || p.startsWith('/menu/') || p === '/feedback' || p.startsWith('/feedback/');
}

function stripUndefined<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

/**
 * Publishes a lightweight, customer-safe snapshot of the restaurant's live menu, tables,
 * and sold-out item IDs to Cloud Firestore so guests scanning QR codes on 4G/5G load the
 * exact live menu in milliseconds without downloading private POS/staff/invoice data.
 */
export function publishPublicMenuToCloud(force = false): void {
  if (!isFirebaseConfigured || isCustomerPortalRoute()) return;
  const db = getFirestoreDb();
  if (!db) return;

  const now = Date.now();
  const minInterval = 6000;
  if (!force && now - lastMenuPublishAt < minInterval) {
    if (!menuPublishTimer) {
      menuPublishTimer = setTimeout(() => {
        menuPublishTimer = null;
        publishPublicMenuToCloud(true);
      }, minInterval - (now - lastMenuPublishAt));
    }
    return;
  }

  if (menuPublishTimer) {
    clearTimeout(menuPublishTimer);
    menuPublishTimer = null;
  }
  lastMenuPublishAt = now;

  try {
    const rest = useRestaurantStore.getState();
    const ops = useOpsStore.getState();
    const settings = useSettingsStore.getState().settings;

    const payload = stripUndefined({
      menuItems: rest.menuItems || [],
      categories: rest.categories || [],
      regions: rest.regions || [],
      floors: rest.floors || [],
      tables: (rest.tables || []).map((t) => ({
        id: t.id,
        name: t.name,
        floor: t.floor || t.zone || 'Ground Floor',
        zone: t.zone || t.floor || 'Ground Floor',
        seatingType: t.seatingType || 'tables',
        cabinNumber: t.cabinNumber,
        seats: t.seats,
        status: t.status,
      })),
      unavailableItemIds: ops.unavailableItemIds || [],
      enableOnlineOrders: settings.enableOnlineOrders !== false,
      enableDigitalQrMenu: settings.enableDigitalQrMenu !== false,
      updatedAt: now,
    });

    setDoc(doc(db, PUBLIC_MENU_DOC_PATH[0], PUBLIC_MENU_DOC_PATH[1]), payload).catch(() => {});
  } catch {
    // Non-blocking background publish
  }
}

/**
 * Publishes the public website contact details (set by Master Admin in Settings → Website)
 * to Cloud Firestore. The static website at the domain homepage reads this document live.
 * Only customer-safe fields are published.
 */
export async function publishWebsiteInfoToCloud(): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const s = useSettingsStore.getState().settings;
    const clean = (v: unknown) => String(v ?? '').trim();
    const payload = {
      restaurantName: clean(s.restaurantName),
      tagline: clean(s.tagline),
      phone: clean(s.phone),
      address: clean(s.address),
      whatsapp: clean(s.websiteWhatsapp).replace(/[^\d]/g, ''),
      email: clean(s.websiteEmail),
      mapsUrl: clean(s.websiteMapsUrl),
      hours: clean(s.websiteHours),
      instagram: clean(s.websiteInstagram),
      facebook: clean(s.websiteFacebook),
      tiktok: clean(s.websiteTiktok),
      announcement: clean(s.websiteAnnouncement),
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, WEBSITE_INFO_DOC_PATH[0], WEBSITE_INFO_DOC_PATH[1]), payload);
    return true;
  } catch (err) {
    console.warn('Website info publish failed:', err);
    return false;
  }
}

/**
 * Fetches the restaurant's live menu, categories, tables, and sold-out items directly
 * from Cloud Firestore for customer phones on 4G/5G mobile data.
 */
export async function fetchPublicMenuFromCloud(): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  const db = getFirestoreDb();
  if (!db) return false;

  const applyPublicSnapshot = (data: any) => {
    if (!data || typeof data !== 'object') return false;
    const patch: Record<string, any> = {};
    if (Array.isArray(data.menuItems) && data.menuItems.length > 0) patch.menuItems = data.menuItems;
    if (Array.isArray(data.categories) && data.categories.length > 0) patch.categories = data.categories;
    if (Array.isArray(data.regions) && data.regions.length > 0) patch.regions = data.regions;
    if (Array.isArray(data.floors) && data.floors.length > 0) patch.floors = data.floors;
    if (Array.isArray(data.tables) && data.tables.length > 0) patch.tables = data.tables;

    if (Object.keys(patch).length > 0) {
      useRestaurantStore.getState().syncFromServer(patch);
    }
    if (Array.isArray(data.unavailableItemIds)) {
      useOpsStore.getState().syncFromServer({ unavailableItemIds: data.unavailableItemIds });
    }
    if (typeof data.enableOnlineOrders === 'boolean' || typeof data.enableDigitalQrMenu === 'boolean') {
      useSettingsStore.getState().syncFromServer({
        systemSettings: {
          ...useSettingsStore.getState().settings,
          ...(typeof data.enableOnlineOrders === 'boolean' ? { enableOnlineOrders: data.enableOnlineOrders } : {}),
          ...(typeof data.enableDigitalQrMenu === 'boolean' ? { enableDigitalQrMenu: data.enableDigitalQrMenu } : {}),
        },
      });
    }
    return Object.keys(patch).length > 0;
  };

  try {
    const pubSnap = await getDoc(doc(db, PUBLIC_MENU_DOC_PATH[0], PUBLIC_MENU_DOC_PATH[1]));
    if (pubSnap.exists() && applyPublicSnapshot(pubSnap.data())) {
      return true;
    }
  } catch {
    // Fallback to live_state below
  }

  try {
    const liveSnap = await getDoc(doc(db, LIVE_STATE_DOC_PATH[0], LIVE_STATE_DOC_PATH[1]));
    if (liveSnap.exists()) {
      const liveData = liveSnap.data();
      const inner = liveData?.state || liveData;
      return applyPublicSnapshot(inner);
    }
  } catch {
    // Offline fallback uses bundled default menu
  }
  return false;
}

/**
 * Submits a customer QR / Online order directly into the dedicated Cloud Firestore
 * incoming order queue (`sultan_cloud_orders/{order.id}`).
 * Works on any 4G/5G mobile network without ever touching or overwriting POS `live_state`.
 */
export async function submitCloudOnlineOrder(order: OnlineOrder): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const now = Date.now();
    const docPayload = stripUndefined({
      ...order,
      ingested: false,
      createdAt: order.createdAt || now,
      updatedAt: now,
    });
    await setDoc(doc(db, CLOUD_ORDERS_COLLECTION, order.id), docPayload);
    return true;
  } catch (err) {
    console.warn('[CloudMenuBridge] Failed to submit cloud online order:', err);
    return false;
  }
}

/**
 * Updates a cloud order's live status in Firestore so the customer's phone on 4G/5G
 * receives real-time status updates (CONFIRMED -> PREPARING -> READY -> SERVED / DELIVERED).
 */
export async function syncCloudOrderStatus(
  orderId: string,
  patch: Partial<Pick<OnlineOrder, 'status' | 'assignedWaiter' | 'managerNotes' | 'riderName' | 'riderPhone' | 'estimatedDeliveryMinutes'>>
): Promise<void> {
  if (!orderId || !isFirebaseConfigured) return;
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const cleanPatch = stripUndefined({
      ...patch,
      updatedAt: Date.now(),
    });
    await updateDoc(doc(db, CLOUD_ORDERS_COLLECTION, orderId), cleanPatch);
  } catch {
    // Order may have been created purely on LAN (not in sultan_cloud_orders) — safe to ignore
  }
}

/**
 * Subscribes a customer's mobile browser to real-time status updates for their placed order
 * over Cloud Firestore (works over any 4G/5G mobile network with instant push updates).
 */
export function subscribeToCloudOrderStatus(
  orderId: string,
  onOrderUpdate: (order: Partial<OnlineOrder>) => void
): () => void {
  if (!orderId || !isFirebaseConfigured) return () => {};
  const db = getFirestoreDb();
  if (!db) return () => {};

  try {
    return onSnapshot(
      doc(db, CLOUD_ORDERS_COLLECTION, orderId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<OnlineOrder>;
        if (data && data.status) {
          onOrderUpdate(data);
        }
      },
      () => {}
    );
  } catch {
    return () => {};
  }
}

/**
 * Starts a real-time Firestore listener on restaurant staff terminals (Admin / Manager /
 * Floor Manager / POS) that instantly ingests incoming customer 4G/5G QR orders and
 * broadcasts them across the local LAN + triggers Floor Manager confirmation alarms.
 */
export function startCloudOrdersListener(onOrderIngested?: () => void): void {
  if (!isFirebaseConfigured || isCustomerPortalRoute()) return;
  if (cloudOrdersUnsub) return;

  const db = getFirestoreDb();
  if (!db) return;

  try {
    const q = query(
      collection(db, CLOUD_ORDERS_COLLECTION),
      where('ingested', '==', false)
    );

    cloudOrdersUnsub = onSnapshot(
      q,
      (snapshot) => {
        const now = Date.now();
        let ingestedAny = false;

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as OnlineOrder & { ingested?: boolean };
          if (!data || !data.id) return;
          if (processedCloudOrderIds.has(data.id)) return;
          // Ignore stale uningested test orders older than 12 hours
          if (data.createdAt && Math.abs(now - data.createdAt) > 12 * 60 * 60 * 1000) return;

          processedCloudOrderIds.add(data.id);

          const store = useRestaurantStore.getState();
          const existingOnlineOrders = store.onlineOrders || [];
          const alreadyInStore = existingOnlineOrders.some(
            (o) => o.id === data.id || (data.orderNumber && o.orderNumber === data.orderNumber)
          );

          if (!alreadyInStore) {
            const cleanOrder: OnlineOrder = {
              id: data.id,
              orderNumber: data.orderNumber || `SLT-${Date.now().toString().slice(-4)}`,
              source: data.source || 'digital_menu',
              orderType: data.orderType || 'dine_in',
              status: data.status || 'PENDING',
              floor: data.floor,
              seatingType: data.seatingType,
              tableId: data.tableId,
              tableName: data.tableName,
              cabinNumber: data.cabinNumber,
              roundNumber: data.roundNumber,
              isAddOn: data.isAddOn,
              customer: data.customer,
              items: data.items || [],
              subtotal: data.subtotal || 0,
              deliveryFee: data.deliveryFee || 0,
              tax: data.tax || 0,
              total: data.total || 0,
              paymentMethod: data.paymentMethod || 'pay_at_counter',
              estimatedDeliveryMinutes: data.estimatedDeliveryMinutes,
              createdAt: data.createdAt || now,
              updatedAt: now,
            };

            const nextStatePatch: Record<string, any> = {
              onlineOrders: [cleanOrder, ...existingOnlineOrders],
            };

            if (cleanOrder.orderType === 'dine_in') {
              const itemsSummary = (cleanOrder.items || [])
                .map((it) => `${it.qty || it.quantity || 1}x ${it.name}`)
                .join(', ');
              nextStatePatch.pendingFloorOrderAlert = {
                id: `cloud-alert-${cleanOrder.id}`,
                orderId: cleanOrder.id,
                orderNumber: cleanOrder.orderNumber,
                floor: cleanOrder.floor || 'Ground Floor',
                tableId: cleanOrder.tableId || '1',
                tableName: cleanOrder.tableName || 'Table',
                customerName: cleanOrder.customer?.name || 'Guest',
                customerPhone: cleanOrder.customer?.phone || '',
                total: cleanOrder.total || 0,
                itemsCount: (cleanOrder.items || []).length,
                itemsSummary,
                time: now,
              };
            } else {
              // Delivery / Takeaway: create KOT ticket immediately
              const newTicket: Ticket = {
                id: `KOT-${cleanOrder.orderNumber.replace(/\D/g, '') || now.toString().slice(-4)}`,
                orderId: cleanOrder.id,
                orderNumber: cleanOrder.orderNumber,
                tableId: cleanOrder.orderType === 'delivery' ? 'delivery' : 'takeaway',
                tableName: `${cleanOrder.orderType === 'delivery' ? 'Online Delivery' : 'Online Takeaway'} • ${cleanOrder.customer?.name || 'Guest'}`,
                server: 'Online Digital Menu',
                timePlaced: now,
                status: 'pending',
                stationStatuses: { main: 'pending' },
                items: (cleanOrder.items || []).map((it) => ({
                  id: it.id,
                  name: it.name,
                  price: it.unitPrice || it.price || 0,
                  qty: it.qty || it.quantity || 1,
                  notes: it.notes,
                  completed: false,
                  station: (it.station as 'main' | 'juice') || 'main',
                  itemStatus: 'pending' as const,
                })),
              };
              nextStatePatch.tickets = [newTicket, ...(store.tickets || [])];
            }

            useRestaurantStore.setState(nextStatePatch);
            ingestedAny = true;
          }

          // Mark as ingested in Firestore so no other device double-ingests it
          updateDoc(doc(db, CLOUD_ORDERS_COLLECTION, data.id), {
            ingested: true,
            ingestedAt: now,
          }).catch(() => {});
        });

        if (ingestedAny && onOrderIngested) {
          onOrderIngested();
        }
      },
      (err) => {
        console.warn('[CloudMenuBridge] Cloud orders listener error:', err);
      }
    );
  } catch (err) {
    console.warn('[CloudMenuBridge] Failed to start cloud orders listener:', err);
  }
}

export function stopCloudOrdersListener(): void {
  if (cloudOrdersUnsub) {
    try {
      cloudOrdersUnsub();
    } catch {}
    cloudOrdersUnsub = null;
  }
}
