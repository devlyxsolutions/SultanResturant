import { Platform } from 'react-native';

export interface CustomerDisplayItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
  selectedVariant?: string;
  selectedAddons?: string[];
  subtotal: number;
}

export interface CustomerDisplayState {
  isPosActive: boolean;
  status: 'idle' | 'active' | 'paid';
  cart: CustomerDisplayItem[];
  itemCount: number;
  subTotal: number;
  discountVal: number;
  tax: number;
  serviceCharge: number;
  deliveryCharges: number;
  total: number;
  tenderedAmount: number;
  changeDue: number;
  orderType: 'takeaway' | 'dine-in' | 'delivery';
  tableName?: string;
  customerName?: string;
  cashierName?: string;
  invoiceId?: string;
  lastUpdated: number;
}

export const CFD_STORAGE_KEY = 'sultan_pos_cfd_state';
export const CFD_CHANNEL_NAME = 'sultan_pos_cfd_channel';

export const INITIAL_CFD_STATE: CustomerDisplayState = {
  isPosActive: false,
  status: 'idle',
  cart: [],
  itemCount: 0,
  subTotal: 0,
  discountVal: 0,
  tax: 0,
  serviceCharge: 0,
  deliveryCharges: 0,
  total: 0,
  tenderedAmount: 0,
  changeDue: 0,
  orderType: 'takeaway',
  lastUpdated: Date.now(),
};

let activeBroadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof (window as any).BroadcastChannel === 'undefined') {
    return null;
  }
  if (!activeBroadcastChannel) {
    try {
      activeBroadcastChannel = new (window as any).BroadcastChannel(CFD_CHANNEL_NAME);
    } catch {
      activeBroadcastChannel = null;
    }
  }
  return activeBroadcastChannel;
}

/**
 * Publish updated POS cart and checkout state to customer facing display.
 */
export function publishCustomerDisplayState(state: CustomerDisplayState): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const payload: CustomerDisplayState = {
    ...state,
    lastUpdated: Date.now(),
  };

  const serialized = JSON.stringify(payload);

  // 1. Save to localStorage for instant read across all windows
  try {
    window.localStorage.setItem(CFD_STORAGE_KEY, serialized);
  } catch {}

  // 2. Broadcast via BroadcastChannel for zero-latency (<1ms) IPC
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage({ type: 'CFD_STATE_UPDATE', payload });
    }
  } catch {}
}

/**
 * Request latest state from cashier POS (useful if customer display just loaded)
 */
export function requestCustomerDisplayState(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage({ type: 'CFD_REQUEST_STATE' });
    }
  } catch {}
}

/**
 * Get current persisted customer display state
 */
export function getSavedCustomerDisplayState(): CustomerDisplayState {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return INITIAL_CFD_STATE;
  }

  try {
    const raw = window.localStorage.getItem(CFD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as CustomerDisplayState;
      }
    }
  } catch {}

  return INITIAL_CFD_STATE;
}

/**
 * Subscribe customer display screen to real-time broadcasts
 */
export function subscribeToCustomerDisplay(
  onUpdate: (state: CustomerDisplayState) => void,
  onRequestState?: () => CustomerDisplayState | null
): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return () => {};
  }

  let lastProcessedTimestamp = 0;
  const channel = getBroadcastChannel();

  const handleState = (state: CustomerDisplayState) => {
    if (!state || typeof state !== 'object') return;
    if (state.lastUpdated && state.lastUpdated < lastProcessedTimestamp) {
      return;
    }
    lastProcessedTimestamp = state.lastUpdated || Date.now();
    onUpdate(state);
  };

  const handleChannelMessage = (event: MessageEvent) => {
    try {
      const data = event.data;
      if (!data) return;

      if (data.type === 'CFD_STATE_UPDATE' && data.payload) {
        handleState(data.payload as CustomerDisplayState);
      } else if (data.type === 'CFD_REQUEST_STATE' && onRequestState) {
        const currentState = onRequestState();
        if (currentState) {
          publishCustomerDisplayState(currentState);
        }
      }
    } catch {}
  };

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === CFD_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed) handleState(parsed as CustomerDisplayState);
      } catch {}
    }
  };

  if (channel) {
    channel.addEventListener('message', handleChannelMessage);
  }
  window.addEventListener('storage', handleStorageChange);

  // Fast 150ms localStorage heartbeat check to guarantee real-time sync across multi-screen setups
  const pollTimer = setInterval(() => {
    try {
      const raw = window.localStorage.getItem(CFD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.lastUpdated && parsed.lastUpdated > lastProcessedTimestamp) {
          handleState(parsed);
        }
      }
    } catch {}
  }, 150);

  return () => {
    clearInterval(pollTimer);
    if (channel) {
      channel.removeEventListener('message', handleChannelMessage);
    }
    window.removeEventListener('storage', handleStorageChange);
  };
}
