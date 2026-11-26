import { Platform } from 'react-native';
import { printOrderSlip } from '../components/OrderSlip';
import { Ticket, useRestaurantStore } from '../store/restaurantStore';
import { resolveMenuCatalogStation } from './stationRouting';

export type KdsStation = 'main' | 'juice';

export type KdsTestPrintResult = {
  success: boolean;
  printer?: string;
  agentOffline?: boolean;
  error?: string;
};

const AUTO_PRINT_KEY_PREFIX = 'sultan_kds_autoprint_v1_';
const PRINTED_REGISTRY_KEY = 'sultan_kds_printed_tickets_v1';
const REGISTRY_TTL_MS = 18 * 60 * 60 * 1000; // 18 hours

type PrintQueueJob = {
  forceReprint?: boolean;
  ticket: Ticket;
  station: KdsStation;
  stationLabel: string;
  onComplete?: (ticketId: string) => void;
};

const printQueue: PrintQueueJob[] = [];
let isProcessingQueue = false;
const inMemoryPrintedKeys = new Set<string>();

function readPrintedRegistry(): Record<string, number> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(PRINTED_REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const pruned: Record<string, number> = {};
    for (const [key, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && now - ts < REGISTRY_TTL_MS) {
        pruned[key] = ts;
      }
    }
    return pruned;
  } catch {
    return {};
  }
}

function writePrintedRegistry(registry: Record<string, number>) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PRINTED_REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // Ignore storage quota issues
  }
}

function buildTicketPrintKeys(station: KdsStation, ticket: Ticket): string[] {
  const keys: string[] = [];
  if (ticket.id) {
    keys.push(`${station}:id:${ticket.id}`);
  }
  if (ticket.orderId) {
    keys.push(`${station}:oid:${ticket.orderId}:r${ticket.roundNumber || 1}`);
  } else if (ticket.orderNumber) {
    keys.push(`${station}:onum:${ticket.orderNumber}:r${ticket.roundNumber || 1}`);
  }
  return keys;
}

export function isKdsTicketPrinted(station: KdsStation, ticket: Ticket): boolean {
  const keys = buildTicketPrintKeys(station, ticket);
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (inMemoryPrintedKeys.has(k)) return true;
  }
  const registry = readPrintedRegistry();
  for (const k of keys) {
    if (registry[k]) {
      inMemoryPrintedKeys.add(k);
      return true;
    }
  }
  return false;
}

export function markKdsTicketPrinted(station: KdsStation, ticket: Ticket) {
  const keys = buildTicketPrintKeys(station, ticket);
  if (keys.length === 0) return;
  const now = Date.now();
  const registry = readPrintedRegistry();
  for (const k of keys) {
    inMemoryPrintedKeys.add(k);
    registry[k] = now;
  }
  writePrintedRegistry(registry);
}

/**
 * Mark existing tickets on initial KDS mount as already seen/printed so opening or
 * refreshing the KDS screen does not reprint old historical orders.
 */
export function seedExistingKdsTicketsAsPrinted(station: KdsStation, tickets: Ticket[]) {
  if (!Array.isArray(tickets) || tickets.length === 0) return;
  const now = Date.now();
  const registry = readPrintedRegistry();
  let changed = false;
  for (const t of tickets) {
    if (!t || !t.id) continue;
    const keys = buildTicketPrintKeys(station, t);
    for (const k of keys) {
      if (!inMemoryPrintedKeys.has(k)) {
        inMemoryPrintedKeys.add(k);
      }
      if (!registry[k]) {
        registry[k] = now;
        changed = true;
      }
    }
  }
  if (changed) {
    writePrintedRegistry(registry);
  }
}

export function getKdsAutoPrintEnabled(station: KdsStation): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) {
    return true;
  }
  try {
    const val = window.localStorage.getItem(`${AUTO_PRINT_KEY_PREFIX}${station}`);
    if (val === null) return true; // Enabled by default so hands-free KDS printers work immediately
    return val === 'true';
  } catch {
    return true;
  }
}

export function setKdsAutoPrintEnabled(station: KdsStation, enabled: boolean) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${AUTO_PRINT_KEY_PREFIX}${station}`, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage issues
  }
}

function processNextPrintJob() {
  if (isProcessingQueue) return;
  const next = printQueue.shift();
  if (!next) return;

  isProcessingQueue = true;

  // Direct Server/Station-Isolated Thermal Print (Zero browser dialogs, instant ESC/POS)
  // Server routes 'main' ONLY to Kitchen Printer and 'juice' ONLY to Juice Bar Printer Agent/Printer.
  const tryDirectPrint = async (): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const origin = window.location.origin;
        const res = await fetch(`${origin}/api/print/kot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket: next.ticket,
            station: next.station,
            forceReprint: !!next.forceReprint,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && (data.success || data.queued)) {
            return true;
          }
        }
      } catch (e) {
        console.warn('[KDS AutoPrint] Direct thermal print error:', e);
      }
    }
    return false;
  };

  tryDirectPrint().then((directSuccess) => {
    if (directSuccess) {
      next.onComplete?.(next.ticket.id);
    }

    // CRITICAL: NEVER call printOrderSlip() or window.print() in automated queue!
    // In web browsers, window.print() opens a blocking Print Preview modal that halts the KDS screen.
    if (!directSuccess) {
      console.warn(`[KDS AutoPrint] Station print pending/unavailable for ticket ${next.ticket.id} (${next.station})`);
    }

    // Cooldown before processing next queued slip
    setTimeout(() => {
      isProcessingQueue = false;
      processNextPrintJob();
    }, 300);
  });
}

/**
 * Enqueue a newly arrived ticket for automatic station-filtered KOT thermal printing.
 * Returns true if queued, false if skipped (disabled, already printed, or no items for station).
 */
export function enqueueKdsAutoPrint(
  ticket: Ticket,
  station: KdsStation,
  options?: {
    enabled?: boolean;
    forceReprint?: boolean;
    onPrinted?: (ticketId: string) => void;
  }
): boolean {
  if (!ticket || !ticket.id) return false;

  const autoEnabled = options?.enabled ?? getKdsAutoPrintEnabled(station);
  if (!options?.forceReprint && !autoEnabled) return false;

  const allItems = Array.isArray(ticket.items) ? ticket.items : [];
  const catalogMenuItems = useRestaurantStore.getState().menuItems || [];
  const stationItems = allItems
    .filter((i) => resolveMenuCatalogStation(i, catalogMenuItems, true) === station)
    .map((i) => ({ ...i, station }));
  if (stationItems.length === 0) return false;

  if (!options?.forceReprint && isKdsTicketPrinted(station, ticket)) {
    return false;
  }

  markKdsTicketPrinted(station, ticket);

  const stationLabel = station === 'juice' ? 'JUICE BAR KOT' : 'MAIN KITCHEN KOT';
  const filteredTicket: Ticket = {
    ...ticket,
    items: stationItems,
  };

  printQueue.push({
    ticket: filteredTicket,
    station,
    stationLabel,
    forceReprint: !!options?.forceReprint,
    onComplete: options?.onPrinted,
  });

  processNextPrintJob();
  return true;
}

/**
 * Sends a clean 80mm Test KOT Slip strictly to the requested station's dedicated printer.
 * NEVER sends a Juice Bar test slip to the Kitchen printer!
 */
export async function printKdsTestSlip(station: KdsStation): Promise<KdsTestPrintResult> {
  const stationLabel = station === 'juice' ? 'JUICE BAR KOT' : 'MAIN KITCHEN KOT';
  const testTicket: Ticket = {
    id: `TEST-${Date.now().toString().slice(-4)}`,
    tableId: 'TEST',
    tableName: station === 'juice' ? 'JUICE BAR PRINTER TEST' : 'KITCHEN PRINTER TEST',
    server: 'KDS Auto-Print Check',
    status: 'pending',
    timePlaced: Date.now(),
    items: [
      {
        id: 'test-1',
        name: station === 'juice' ? 'Fresh Mint Margarita (Test)' : 'Chicken Karahi Full (Test)',
        qty: 1,
        price: 0,
        completed: false,
        itemStatus: 'pending',
        station,
        notes:
          station === 'juice'
            ? 'Juice Bar Dedicated Printer Verified'
            : 'Main Kitchen Dedicated Printer Verified',
      },
    ],
  };

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const res = await fetch(`${window.location.origin}/api/print/kot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: testTicket, station, forceReprint: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        return { success: true, printer: data.printer };
      }
      return {
        success: false,
        agentOffline: !!data?.agentOffline,
        error: data?.error || 'Printer did not respond',
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Unable to contact server' };
    }
  }

  printOrderSlip(testTicket, { stationLabel });
  return { success: true };
}
