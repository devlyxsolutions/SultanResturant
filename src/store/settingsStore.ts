import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

export interface SystemSettings {
  // 1. Restaurant & Branding
  restaurantName: string;
  tagline: string;
  phone: string;
  address: string;
  ntnOrTaxId: string;
  footerMessage: string;
  showLogoOnReceipt: boolean;
  showQrOnReceipt: boolean;

  // 2. Billing, Tax & POS
  currencySymbol: string;
  taxEnabled: boolean;
  taxRatePercent: number;
  taxLabel: string;
  serviceChargeEnabled: boolean;
  serviceChargePercent: number;
  deliveryFeeDefault: number;
  allowCustomDiscount: boolean;
  requirePinForVoid: boolean;
  autoPrintReceiptOnPay: boolean;
  autoSendKdsOnOrder: boolean;
  roundTotals: boolean;

  // 3. Operations & Feature Modules
  enableDineIn: boolean;
  enableTakeaway: boolean;
  enableDelivery: boolean;
  enablePlayland: boolean;
  enableOnlineOrders: boolean;
  enableCallDetector: boolean;
  enableCustomerFeedbackQr: boolean;
  kdsSoundAlerts: boolean;
  lowStockAlertThreshold: number;

  // 4. Sync & Backup Preferences
  autoSyncEnabled: boolean;
  cloudBackupEnabled: boolean;

  updatedAt: number;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  restaurantName: 'SULTAN RESTAURANT',
  tagline: 'Royal Mughlai & BBQ Dining',
  phone: '',
  address: '',
  ntnOrTaxId: '',
  footerMessage: 'Thank you for dining with Sultan!',
  showLogoOnReceipt: true,
  showQrOnReceipt: true,

  currencySymbol: 'Rs.',
  taxEnabled: true,
  taxRatePercent: 16,
  taxLabel: 'GST Tax',
  serviceChargeEnabled: false,
  serviceChargePercent: 0,
  deliveryFeeDefault: 150,
  allowCustomDiscount: true,
  requirePinForVoid: false,
  autoPrintReceiptOnPay: false,
  autoSendKdsOnOrder: true,
  roundTotals: true,

  enableDineIn: true,
  enableTakeaway: true,
  enableDelivery: true,
  enablePlayland: true,
  enableOnlineOrders: true,
  enableCallDetector: true,
  enableCustomerFeedbackQr: true,
  kdsSoundAlerts: true,
  lowStockAlertThreshold: 10,

  autoSyncEnabled: true,
  cloudBackupEnabled: true,

  updatedAt: 0,
};

interface SettingsState {
  settings: SystemSettings;
  updateSettings: (partial: Partial<SystemSettings>) => void;
  resetSettingsToDefaults: () => void;
  syncFromServer: (remoteState: any) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: { ...DEFAULT_SYSTEM_SETTINGS },
      updateSettings: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...partial,
            updatedAt: Date.now(),
          },
        })),
      resetSettingsToDefaults: () =>
        set({
          settings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            updatedAt: Date.now(),
          },
        }),
      syncFromServer: (remoteState) => {
        const incoming = remoteState?.systemSettings;
        if (!incoming || typeof incoming !== 'object') return;
        set((state) => {
          const currentUpdated = state.settings.updatedAt || 0;
          const incomingUpdated = typeof incoming.updatedAt === 'number' ? incoming.updatedAt : 0;
          if (incomingUpdated > 0 && currentUpdated > 0 && incomingUpdated < currentUpdated) {
            return state;
          }
          return {
            settings: {
              ...DEFAULT_SYSTEM_SETTINGS,
              ...state.settings,
              ...incoming,
            },
          };
        });
      },
    }),
    {
      name: 'sultan-system-settings-storage',
      storage: appStorage,
    }
  )
);
