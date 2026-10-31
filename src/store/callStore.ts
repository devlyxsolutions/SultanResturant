import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';
import { normalizePakistaniPhone, formatPakistaniDisplayPhone, arePhonesEqual } from '../utils/phoneNormalization';
import { getCustomerByPhone } from '../services/customerService';
import {
  startService as nativeStartService,
  stopService as nativeStopService,
  isServiceRunning as nativeIsServiceRunning,
} from 'call-detector';

export type CallStatus = 'incoming' | 'answered' | 'missed' | 'ended';

export interface CallRecord {
  id: string;
  phoneNumber: string;
  normalizedPhone: string;
  displayPhone: string;
  customerName?: string;
  customerId?: string;
  customerAddress?: string;
  isKnownCustomer: boolean;
  timestamp: number;
  durationSeconds?: number;
  status: CallStatus;
}

interface CallState {
  isDetectionEnabled: boolean;
  isServiceRunning: boolean;
  activeIncomingCall: CallRecord | null;
  callLog: CallRecord[];

  // Actions
  setDetectionEnabled: (enabled: boolean) => Promise<void>;
  setServiceRunning: (running: boolean) => void;
  syncServiceStatus: () => Promise<void>;
  
  handleIncomingCall: (phoneNumber: string, timestamp?: number) => CallRecord | null;
  handleCallAnswered: (phoneNumber?: string, timestamp?: number) => void;
  handleCallEnded: (phoneNumber?: string, duration?: number, timestamp?: number) => void;
  handleMissedCall: (phoneNumber?: string, timestamp?: number) => void;
  
  dismissActiveCall: () => void;
  removeCallFromLog: (id: string) => void;
  clearCallLog: () => void;
}

// Window of time to suppress duplicate popup for the same incoming ringing call
const DUPLICATE_RING_THRESHOLD_MS = 15000;
let lastRingingPhone = '';
let lastRingingTimestamp = 0;

export const useCallStore = create<CallState>()(
  persist(
    (set, get) => ({
      isDetectionEnabled: true,
      isServiceRunning: false,
      activeIncomingCall: null,
      callLog: [],

      setDetectionEnabled: async (enabled: boolean) => {
        set({ isDetectionEnabled: enabled });
        try {
          if (enabled) {
            await nativeStartService();
            set({ isServiceRunning: true });
          } else {
            await nativeStopService();
            set({ isServiceRunning: false, activeIncomingCall: null });
          }
        } catch {
          // Handled gracefully in mock / non-Android
        }
      },

      setServiceRunning: (running: boolean) => {
        set({ isServiceRunning: running });
      },

      syncServiceStatus: async () => {
        try {
          const running = await nativeIsServiceRunning();
          set({ isServiceRunning: running });
        } catch {}
      },

      handleIncomingCall: (phoneNumber: string, timestamp?: number) => {
        const state = get();
        if (!state.isDetectionEnabled) return null;

        const cleanRaw = (phoneNumber || '').trim();
        const normalized = normalizePakistaniPhone(cleanRaw) || cleanRaw;
        const now = timestamp || Date.now();

        // Duplicate suppression: if the same number rings multiple times within 15 seconds, don't reopen/duplicate
        if (
          arePhonesEqual(lastRingingPhone, normalized) &&
          now - lastRingingTimestamp < DUPLICATE_RING_THRESHOLD_MS
        ) {
          return state.activeIncomingCall;
        }

        lastRingingPhone = normalized;
        lastRingingTimestamp = now;

        // Lookup customer in database
        const customer = getCustomerByPhone(normalized);
        const displayPhone = formatPakistaniDisplayPhone(normalized, 'local');

        const recordId = `call_${now}_${Math.random().toString(36).substring(2, 6)}`;
        const record: CallRecord = {
          id: recordId,
          phoneNumber: cleanRaw,
          normalizedPhone: normalized,
          displayPhone: displayPhone || cleanRaw,
          customerName: customer?.name,
          customerId: customer?.id,
          customerAddress: customer?.address,
          isKnownCustomer: Boolean(customer),
          timestamp: now,
          status: 'incoming',
        };

        set((prev) => ({
          activeIncomingCall: record,
          callLog: [record, ...prev.callLog.slice(0, 99)], // keep last 100 calls
        }));

        return record;
      },

      handleCallAnswered: (phoneNumber?: string, _timestamp?: number) => {
        set((prev) => {
          let updatedActive = prev.activeIncomingCall;
          if (updatedActive && (!phoneNumber || arePhonesEqual(updatedActive.normalizedPhone, phoneNumber))) {
            updatedActive = { ...updatedActive, status: 'answered' };
          }

          const updatedLog = prev.callLog.map((c) => {
            if (c.id === prev.activeIncomingCall?.id || (phoneNumber && arePhonesEqual(c.normalizedPhone, phoneNumber) && c.status === 'incoming')) {
              return { ...c, status: 'answered' as CallStatus };
            }
            return c;
          });

          return {
            activeIncomingCall: updatedActive,
            callLog: updatedLog,
          };
        });
      },

      handleCallEnded: (phoneNumber?: string, duration?: number, timestamp?: number) => {
        const now = timestamp || Date.now();
        const durationSec = duration || 0;

        set((prev) => {
          const updatedLog = prev.callLog.map((c) => {
            if (c.id === prev.activeIncomingCall?.id || (phoneNumber && arePhonesEqual(c.normalizedPhone, phoneNumber) && c.status !== 'ended')) {
              return {
                ...c,
                status: 'ended' as CallStatus,
                durationSeconds: durationSec > 0 ? durationSec : c.durationSeconds || Math.round((now - c.timestamp) / 1000),
              };
            }
            return c;
          });

          return {
            activeIncomingCall: null,
            callLog: updatedLog,
          };
        });
      },

      handleMissedCall: (phoneNumber?: string, _timestamp?: number) => {
        set((prev) => {
          const updatedLog = prev.callLog.map((c) => {
            if (c.id === prev.activeIncomingCall?.id || (phoneNumber && arePhonesEqual(c.normalizedPhone, phoneNumber) && c.status === 'incoming')) {
              return { ...c, status: 'missed' as CallStatus };
            }
            return c;
          });

          return {
            activeIncomingCall: null,
            callLog: updatedLog,
          };
        });
      },

      dismissActiveCall: () => {
        set({ activeIncomingCall: null });
      },

      removeCallFromLog: (id: string) => {
        set((prev) => ({
          callLog: prev.callLog.filter((c) => c.id !== id),
        }));
      },

      clearCallLog: () => {
        set({ callLog: [] });
      },
    }),
    {
      name: '@sultan_call_store',
      storage: appStorage,
      partialize: (state) => ({
        isDetectionEnabled: state.isDetectionEnabled,
        callLog: state.callLog,
      }),
    }
  )
);
