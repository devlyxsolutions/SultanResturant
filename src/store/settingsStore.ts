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
  // Group 1 — POS Terminal & Order Channels
  enablePosModule: boolean;
  enableDineIn: boolean;
  enableTakeaway: boolean;
  enableDelivery: boolean;
  posShowCuisineFilter: boolean;
  posShowDealsTab: boolean;
  posRequireTableForDineIn: boolean;
  posRequireCustomerForDelivery: boolean;
  posAllowSplitPayment: boolean;
  posEnableTableReleaseConfirm: boolean;

  // Group 2 — Floor Command, Tables & Digital QR Menu
  enableFloorPlanModule: boolean;
  enableDigitalQrMenu: boolean;
  enableOnlineOrders: boolean;
  enableMajlisSeating: boolean;
  enableCouchSeating: boolean;
  enableWaiterFloorLock: boolean;

  // Group 3 — Kitchen (KDS), Juice Bar & Recipe BOM
  enableKdsModule: boolean;
  kdsSoundAlerts: boolean;
  kdsAutoRouteBeverages: boolean;
  kdsTargetPrepMinutes: number;
  enableKitchenHandoverModule: boolean;
  enableRecipesBomModule: boolean;
  autoDeductRecipeStock: boolean;

  // Dedicated Per-Station Thermal Printer Routing (Zero Kitchen/Juice Conflict)
  kitchenPrinterMode: 'windows' | 'network' | 'agent' | 'disabled';
  kitchenPrinterName: string;
  kitchenPrinterHost: string;
  kitchenPrinterPort: number;
  juicePrinterMode: 'agent' | 'windows' | 'network' | 'disabled';
  juicePrinterName: string;
  juicePrinterHost: string;
  juicePrinterPort: number;

  // Group 4 — Sales, CRM, Promotions & Returns
  enableInvoicesModule: boolean;
  enableReturnsModule: boolean;
  enableDiscountsModule: boolean;
  enableCustomerCrmModule: boolean;
  enableCallDetector: boolean;
  enableCustomerFeedbackQr: boolean;

  // Group 5 — Inventory, Suppliers & Damage Control
  enableInventoryModule: boolean;
  enableSuppliersModule: boolean;
  enableDamagesModule: boolean;
  lowStockAlertThreshold: number;
  blockOutOfStockPosOrders: boolean;

  // Group 6 — Finance, Shift Cash, Expenses & Assets
  enableShiftModule: boolean;
  requireActiveShiftForPos: boolean;
  enableReportsModule: boolean;
  enableInsightsModule: boolean;
  enableExpensesModule: boolean;
  enableAssetsModule: boolean;

  // Group 7 — Staff HR, Attendance, Payroll & Playland
  enableStaffHrModule: boolean;
  enableAttendanceTracking: boolean;
  enablePayrollModule: boolean;
  standardShiftHours: number;
  enablePlayland: boolean;
  playlandDefaultSessionMins: number;

  // Group 8 — Staff Multi-Device & Concurrent Session Security
  defaultMaxDevicesPerStaff: number; // default: 1 (single device per account)
  autoKickPreviousDevice: boolean;    // default: true (auto logout earlier device)

  // 4. Sync & Backup Preferences
  autoSyncEnabled: boolean;
  cloudBackupEnabled: boolean;

  // 5. Public Website Contact Details (editable by Master Admin only, published to the website)
  websiteWhatsapp: string;
  websiteEmail: string;
  websiteMapsUrl: string;
  websiteHours: string;
  websiteInstagram: string;
  websiteFacebook: string;
  websiteTiktok: string;
  websiteAnnouncement: string;
  websitePublishedAt: number;

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
  taxEnabled: false,
  taxRatePercent: 0,
  taxLabel: 'GST Tax',
  serviceChargeEnabled: false,
  serviceChargePercent: 0,
  deliveryFeeDefault: 150,
  allowCustomDiscount: true,
  requirePinForVoid: false,
  autoPrintReceiptOnPay: true,
  autoSendKdsOnOrder: true,
  roundTotals: true,

  // Group 1 — POS Terminal & Order Channels
  enablePosModule: true,
  enableDineIn: true,
  enableTakeaway: true,
  enableDelivery: true,
  posShowCuisineFilter: true,
  posShowDealsTab: true,
  posRequireTableForDineIn: true,
  posRequireCustomerForDelivery: false,
  posAllowSplitPayment: true,
  posEnableTableReleaseConfirm: true,

  // Group 2 — Floor Command, Tables & Digital QR Menu
  enableFloorPlanModule: true,
  enableDigitalQrMenu: true,
  enableOnlineOrders: true,
  enableMajlisSeating: true,
  enableCouchSeating: true,
  enableWaiterFloorLock: true,

  // Group 3 — Kitchen (KDS), Juice Bar & Recipe BOM
  enableKdsModule: true,
  kdsSoundAlerts: true,
  kdsAutoRouteBeverages: true,
  kdsTargetPrepMinutes: 20,
  enableKitchenHandoverModule: true,
  enableRecipesBomModule: true,
  autoDeductRecipeStock: true,

  // Dedicated Per-Station Thermal Printer Routing
  kitchenPrinterMode: 'windows',
  kitchenPrinterName: 'POS-80',
  kitchenPrinterHost: '',
  kitchenPrinterPort: 9100,
  juicePrinterMode: 'agent',
  juicePrinterName: 'AUTO',
  juicePrinterHost: '',
  juicePrinterPort: 9100,

  // Group 4 — Sales, CRM, Promotions & Returns
  enableInvoicesModule: true,
  enableReturnsModule: true,
  enableDiscountsModule: true,
  enableCustomerCrmModule: true,
  enableCallDetector: true,
  enableCustomerFeedbackQr: true,

  // Group 5 — Inventory, Suppliers & Damage Control
  enableInventoryModule: true,
  enableSuppliersModule: true,
  enableDamagesModule: true,
  lowStockAlertThreshold: 10,
  blockOutOfStockPosOrders: false,

  // Group 6 — Finance, Shift Cash, Expenses & Assets
  enableShiftModule: true,
  requireActiveShiftForPos: false,
  enableReportsModule: true,
  enableInsightsModule: true,
  enableExpensesModule: true,
  enableAssetsModule: true,

  // Group 7 — Staff HR, Attendance, Payroll & Playland
  enableStaffHrModule: true,
  enableAttendanceTracking: true,
  enablePayrollModule: true,
  standardShiftHours: 8,
  enablePlayland: true,
  playlandDefaultSessionMins: 60,

  defaultMaxDevicesPerStaff: 1,
  autoKickPreviousDevice: true,

  autoSyncEnabled: true,
  cloudBackupEnabled: true,

  websiteWhatsapp: '',
  websiteEmail: '',
  websiteMapsUrl: '',
  websiteHours: '',
  websiteInstagram: '',
  websiteFacebook: '',
  websiteTiktok: '',
  websiteAnnouncement: '',
  websitePublishedAt: 0,

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
          if (currentUpdated > 0 && incomingUpdated < currentUpdated) {
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
