import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import SultanLogo from '../../components/SultanLogo';
import { useSettingsStore, SystemSettings, DEFAULT_SYSTEM_SETTINGS } from '../../store/settingsStore';
import { useRestaurantStore, StaffMember, StaffRole, StaffShift } from '../../store/restaurantStore';
import {
  useRoleStore,
  useRolePermissions,
  normalizeRole,
  CustomRole,
  RolePermissions,
  BaseRoleType,
  ADMIN_PERMISSIONS,
  EMPTY_CRUD_PERMISSIONS,
  FULL_CRUD_PERMISSIONS,
} from '../../store/roleStore';
import { useAuthStore } from '../../store/authStore';
import {
  DEVICE_ID,
  subscribeToSyncStatus,
  setCustomServerIp,
  forceSyncNow,
  broadcastImmediately,
  getActiveServerHttpUrl,
  reconnect,
  SyncInfo,
} from '../../services/syncService';
import {
  buildSystemBackupPayload,
  restoreSystemBackupPayload,
  clearAllActiveTicketsAndReleaseTables,
  clearSalesAndInvoices,
  clearCustomerCrm,
  resetMenuToFactoryDefaults,
  resetAllOperationalData,
} from '../../utils/systemDataControl';
import { publishWebsiteInfoToCloud } from '../../services/cloudMenuBridge';

type SettingsTab = 'general' | 'website' | 'billing' | 'modules' | 'crud' | 'roles' | 'users' | 'sync' | 'data';

const TABS: { id: SettingsTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'general', label: 'Branding', icon: 'storefront-outline' },
  { id: 'website', label: 'Website', icon: 'globe-outline' },
  { id: 'billing', label: 'Billing & Tax', icon: 'cash-outline' },
  { id: 'modules', label: 'Modules', icon: 'apps-outline' },
  { id: 'crud', label: 'CRUD Permissions', icon: 'key-outline' },
  { id: 'roles', label: 'Roles & Access', icon: 'shield-checkmark-outline' },
  { id: 'users', label: 'Users & Staff', icon: 'people-outline' },
  { id: 'sync', label: 'Sync & Server', icon: 'cloud-done-outline' },
  { id: 'data', label: 'Data & Backup', icon: 'server-outline' },
];

type PermItemMeta = {
  key: keyof RolePermissions;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const VISIBILITY_PERMS: PermItemMeta[] = [
  {
    key: 'canViewRevenue',
    label: 'View Revenue & Sales Figures',
    desc: 'Show gross revenue, net sales, and profit numbers (otherwise masked)',
    icon: 'cash-outline',
  },
  {
    key: 'canViewCostPrice',
    label: 'View Recipe Cost & Margins',
    desc: 'Show raw ingredient purchase costs, BOM costing, and profit margins',
    icon: 'trending-up-outline',
  },
  {
    key: 'canViewCustomerContacts',
    label: 'View Customer Phone & CRM',
    desc: 'Display customer phone numbers, addresses, and loyalty CRM profiles',
    icon: 'call-outline',
  },
  {
    key: 'canExportReports',
    label: 'Export CSV & Audit Reports',
    desc: 'Allow downloading spreadsheets, Z-reports, and audit logs',
    icon: 'download-outline',
  },
];

const MODULE_PERMS: PermItemMeta[] = [
  { key: 'canAccessPOS', label: 'POS Terminal', desc: 'Billing & order checkout screen', icon: 'calculator-outline' },
  { key: 'canAccessFloorPlan', label: 'Floor Plan & Command', desc: 'Tables, zones & seating status', icon: 'business-outline' },
  { key: 'canAccessInvoices', label: 'Invoices & Orders', desc: 'Order history & invoice lookup', icon: 'receipt-outline' },
  { key: 'canAccessReports', label: 'Financial Reports', desc: 'Sales, tax & shift summaries', icon: 'bar-chart-outline' },
  { key: 'canAccessInventory', label: 'Inventory & Suppliers', desc: 'Stock levels, POs & vendors', icon: 'cube-outline' },
  { key: 'canAccessKitchenHandover', label: 'Kitchen Handover & Returns', desc: 'Raw kitchen issue & return console', icon: 'clipboard-outline' },
  { key: 'canAccessRecipes', label: 'Recipes & Dish Costing', desc: 'BOM recipes & portion sizing', icon: 'restaurant-outline' },
  { key: 'canAccessDiscounts', label: 'Events & Discounts', desc: 'Promotions, deals & promo rules', icon: 'pricetags-outline' },
  { key: 'canAccessExpenses', label: 'Live Expenses', desc: 'Petty cash & daily expense entry', icon: 'wallet-outline' },
  { key: 'canAccessDamages', label: 'Damage Control', desc: 'Breakage, spoilage & waste logs', icon: 'shield-outline' },
  { key: 'canAccessAssets', label: 'Assets & Capex', desc: 'Equipment & fixed asset register', icon: 'diamond-outline' },
  { key: 'canAccessStaff', label: 'Staff & Roles', desc: 'Employee accounts & role settings', icon: 'people-outline' },
];

const AUTHORITY_PERMS: PermItemMeta[] = [
  {
    key: 'canApplyCustomDiscount',
    label: 'Apply Custom Discounts in POS',
    desc: 'Allow manual percentage or cash discounts on customer bills',
    icon: 'pricetag-outline',
  },
  {
    key: 'canVoidInvoice',
    label: 'Void / Cancel Settled Invoices',
    desc: 'Cancel already paid invoices and record void audit logs',
    icon: 'ban-outline',
  },
  {
    key: 'canProcessReturns',
    label: 'Process Sales Returns & Refunds',
    desc: 'Approve food returns and issue cash/card refunds',
    icon: 'return-down-back-outline',
  },
  {
    key: 'canStartCloseShift',
    label: 'Start & Blind-Close Shift Register',
    desc: 'Open cash register shifts and submit closing cash counts',
    icon: 'time-outline',
  },
  {
    key: 'canModifyMenuPrices',
    label: 'Modify Menu Items & Prices',
    desc: 'Edit dish names, selling prices, variants, and availability',
    icon: 'create-outline',
  },
];

const POS_TERMINAL_PERMS: PermItemMeta[] = [
  {
    key: 'posCanDineIn',
    label: 'Dine-In Table Orders in POS',
    desc: 'Create, load & manage Dine-In table or Majlis cabin orders inside POS',
    icon: 'restaurant-outline',
  },
  {
    key: 'posCanTakeaway',
    label: 'Takeaway Counter Orders in POS',
    desc: 'Place & process quick counter Takeaway orders inside POS',
    icon: 'bag-handle-outline',
  },
  {
    key: 'posCanDelivery',
    label: 'Delivery Orders in POS',
    desc: 'Create & dispatch phone/rider Delivery orders inside POS',
    icon: 'bicycle-outline',
  },
  {
    key: 'posCanSendKot',
    label: 'Send / Hold KOT to Kitchen',
    desc: 'Dispatch KOT tickets to Kitchen & Juice Bar KDS (Hold Order / F8)',
    icon: 'paper-plane-outline',
  },
  {
    key: 'posCanSettleBill',
    label: 'Settle & Pay Bills (Checkout)',
    desc: 'Collect Cash, Card or Online payment and generate final settled invoice',
    icon: 'card-outline',
  },
  {
    key: 'posCanPrintUnpaidBill',
    label: 'Print Unpaid Provisional Bill',
    desc: 'Print customer check (CHK) & mark Dine-In tables as Billed before payment',
    icon: 'print-outline',
  },
  {
    key: 'posCanReleaseTable',
    label: 'Release / Reset Occupied Tables',
    desc: 'Release occupied tables or reset active table bill without settling',
    icon: 'refresh-circle-outline',
  },
  {
    key: 'posCanMoveTable',
    label: 'Move / Transfer Tables (with Note & Log)',
    desc: 'Allow Order Taker, Cashier, or Manager to move active tables with a logged reason note',
    icon: 'swap-horizontal-outline',
  },
  {
    key: 'posCanDismissTicket',
    label: 'Cancel / Dismiss Running KOTs',
    desc: 'Cancel or remove active kitchen tickets in POS Running Orders modal',
    icon: 'trash-outline',
  },
  {
    key: 'posCanSplitPayment',
    label: 'Split / Multi-Method Payments',
    desc: 'Split a single bill across multiple methods (e.g. Cash + Card + Online)',
    icon: 'git-branch-outline',
  },
  {
    key: 'posCanManageCustomers',
    label: 'Register & Edit POS Customers',
    desc: 'Add new customer profiles or update CRM contact details in POS checkout',
    icon: 'person-add-outline',
  },
];

const CRUD_MASTER_PERMS: PermItemMeta[] = [
  {
    key: 'canAddRecords',
    label: 'Master: Allow Add / Create',
    desc: 'Global Add gate — disabling locks Create/Add controls across all 11 modules',
    icon: 'add-circle-outline',
  },
  {
    key: 'canEditRecords',
    label: 'Master: Allow Edit / Update',
    desc: 'Global Edit gate — disabling locks Edit/Update controls across all 11 modules',
    icon: 'create-outline',
  },
  {
    key: 'canDeleteRecords',
    label: 'Master: Allow Delete / Remove',
    desc: 'Global Delete gate — disabling locks Delete/Remove controls across all 11 modules',
    icon: 'trash-outline',
  },
];

interface CrudModuleRowMeta {
  id: string;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  viewKey?: keyof RolePermissions;
  sharedViewKey?: boolean;
  addKey: keyof RolePermissions;
  editKey: keyof RolePermissions;
  deleteKey: keyof RolePermissions;
}

const CRUD_MODULE_ROWS: CrudModuleRowMeta[] = [
  {
    id: 'inventory',
    label: 'Inventory & Stock SKUs',
    desc: 'Receive GRN stock, add SKUs, adjust usage, edit items, or delete SKUs',
    icon: 'cube-outline',
    viewKey: 'canAccessInventory',
    sharedViewKey: true,
    addKey: 'canAddInventory',
    editKey: 'canEditInventory',
    deleteKey: 'canDeleteInventory',
  },
  {
    id: 'suppliers',
    label: 'Suppliers & Khata POs',
    desc: 'Create suppliers/POs, record khata payments/edits, or delete vendors',
    icon: 'business-outline',
    viewKey: 'canAccessInventory',
    sharedViewKey: true,
    addKey: 'canAddSuppliers',
    editKey: 'canEditSuppliers',
    deleteKey: 'canDeleteSuppliers',
  },
  {
    id: 'tables',
    label: 'Floor Command, Floors, Tables & Zones (فلور کمانڈ)',
    desc: 'View floor details vs Add, Edit, or Delete restaurant floors, dining tables, sofas & Majlis cabins',
    icon: 'layers-outline',
    viewKey: 'canAccessFloorPlan',
    addKey: 'canAddTables',
    editKey: 'canEditTables',
    deleteKey: 'canDeleteTables',
  },
  {
    id: 'recipes',
    label: 'Recipe BOMs & Costing',
    desc: 'Create or seed recipes, modify BOM ingredients, or delete recipes',
    icon: 'book-outline',
    viewKey: 'canAccessRecipes',
    addKey: 'canAddRecipes',
    editKey: 'canEditRecipes',
    deleteKey: 'canDeleteRecipes',
  },
  {
    id: 'discounts',
    label: 'Discounts & Event Deals',
    desc: 'Launch event promotions, edit/pause deals, or delete campaigns',
    icon: 'pricetag-outline',
    viewKey: 'canAccessDiscounts',
    addKey: 'canAddDiscounts',
    editKey: 'canEditDiscounts',
    deleteKey: 'canDeleteDiscounts',
  },
  {
    id: 'expenses',
    label: 'Expenses & Shift Cash Out',
    desc: 'Add shift expenses, edit recorded expenses, or delete expense entries',
    icon: 'wallet-outline',
    viewKey: 'canAccessExpenses',
    addKey: 'canAddExpenses',
    editKey: 'canEditExpenses',
    deleteKey: 'canDeleteExpenses',
  },
  {
    id: 'damages',
    label: 'Damage Control & Breakage',
    desc: 'Report breakage/loss, settle/resolve cases, or delete damage logs',
    icon: 'warning-outline',
    viewKey: 'canAccessDamages',
    addKey: 'canAddDamages',
    editKey: 'canEditDamages',
    deleteKey: 'canDeleteDamages',
  },
  {
    id: 'assets',
    label: 'Capital Assets & Maintenance',
    desc: 'Register capital assets, log service or edit details, or delete assets',
    icon: 'hardware-chip-outline',
    viewKey: 'canAccessAssets',
    addKey: 'canAddAssets',
    editKey: 'canEditAssets',
    deleteKey: 'canDeleteAssets',
  },
  {
    id: 'staff',
    label: 'Staff & Employees',
    desc: 'Add new staff/cashiers, edit roles/PINs/details, or remove employees',
    icon: 'person-add-outline',
    viewKey: 'canAccessStaff',
    addKey: 'canAddStaff',
    editKey: 'canEditStaff',
    deleteKey: 'canDeleteStaff',
  },
  {
    id: 'menu',
    label: 'Menu Dishes, Categories & Regions',
    desc: 'Add dishes/combos/categories, edit menu/stock/prices, or delete items',
    icon: 'restaurant-outline',
    addKey: 'canAddMenu',
    editKey: 'canEditMenu',
    deleteKey: 'canDeleteMenu',
  },
  {
    id: 'customers',
    label: 'Customers CRM Directory',
    desc: 'Register CRM customers, edit profile/loyalty data, or remove customers',
    icon: 'people-outline',
    addKey: 'canAddCustomers',
    editKey: 'canEditCustomers',
    deleteKey: 'canDeleteCustomers',
  },
];

const MODULE_CRUD_ADD_KEYS: (keyof RolePermissions)[] = CRUD_MODULE_ROWS.map((r) => r.addKey);
const MODULE_CRUD_EDIT_KEYS: (keyof RolePermissions)[] = CRUD_MODULE_ROWS.map((r) => r.editKey);
const MODULE_CRUD_DELETE_KEYS: (keyof RolePermissions)[] = CRUD_MODULE_ROWS.map((r) => r.deleteKey);
const MODULE_CRUD_ADD_SET = new Set<keyof RolePermissions>(MODULE_CRUD_ADD_KEYS);
const MODULE_CRUD_EDIT_SET = new Set<keyof RolePermissions>(MODULE_CRUD_EDIT_KEYS);
const MODULE_CRUD_DELETE_SET = new Set<keyof RolePermissions>(MODULE_CRUD_DELETE_KEYS);
const ALL_CRUD_KEYS: (keyof RolePermissions)[] = [
  ...CRUD_MASTER_PERMS.map((p) => p.key),
  ...CRUD_MODULE_ROWS.flatMap((r) => [r.addKey, r.editKey, r.deleteKey]),
];

function buildCrudPresetPatch(preset: 'full' | 'no_delete' | 'read_only'): Partial<RolePermissions> {
  if (preset === 'full') return { ...FULL_CRUD_PERMISSIONS };
  if (preset === 'read_only') return { ...EMPTY_CRUD_PERMISSIONS };
  const patch: Partial<RolePermissions> = {
    ...FULL_CRUD_PERMISSIONS,
    canDeleteRecords: false,
  };
  MODULE_CRUD_DELETE_KEYS.forEach((k) => {
    patch[k] = false;
  });
  return patch;
}

function buildCrudColumnPatch(col: 'add' | 'edit' | 'delete', val: boolean): Partial<RolePermissions> {
  const masterKey: keyof RolePermissions =
    col === 'add' ? 'canAddRecords' : col === 'edit' ? 'canEditRecords' : 'canDeleteRecords';
  const keys =
    col === 'add' ? MODULE_CRUD_ADD_KEYS : col === 'edit' ? MODULE_CRUD_EDIT_KEYS : MODULE_CRUD_DELETE_KEYS;
  const patch: Partial<RolePermissions> = { [masterKey]: val };
  keys.forEach((k) => {
    patch[k] = val;
  });
  return patch;
}

const ALL_PERMISSION_KEYS: (keyof RolePermissions)[] = [
  ...VISIBILITY_PERMS.map((p) => p.key),
  ...MODULE_PERMS.map((p) => p.key),
  ...AUTHORITY_PERMS.map((p) => p.key),
  ...POS_TERMINAL_PERMS.map((p) => p.key),
  ...ALL_CRUD_KEYS,
];

const ROLE_COLOR_OPTIONS = [
  '#52171B',
  '#B48214',
  '#0D9488',
  '#7C3AED',
  '#2563EB',
  '#DC2626',
  '#059669',
  '#D97706',
];

const BASE_ROLE_OPTIONS: { value: BaseRoleType; label: string; hint: string }[] = [
  { value: 'manager', label: 'Manager Portal', hint: 'Dynamic sidebar & screens controlled by permissions' },
  { value: 'floor_manager', label: 'Floor Manager', hint: 'Floor command & table coordination portal' },
  { value: 'waiter', label: 'Order Taker / Waiter', hint: 'Mobile/tablet table ordering & KOT dispatch' },
  { value: 'kitchen', label: 'Kitchen KDS', hint: 'Main kitchen display & handover console' },
  { value: 'juicebar', label: 'Juice Bar KDS', hint: 'Beverage & mocktail station KDS' },
  { value: 'playland', label: 'Playland Hub', hint: 'Kids zone tickets & rides console' },
  { value: 'custom', label: 'Custom Role', hint: 'Custom role routed through permission-filtered portal' },
];

const EMPTY_PERMISSIONS: RolePermissions = {
  canViewRevenue: false,
  canViewCostPrice: false,
  canViewCustomerContacts: false,
  canExportReports: false,
  canAccessPOS: false,
  canAccessInvoices: false,
  canAccessReports: false,
  canAccessInventory: false,
  canAccessKitchenHandover: false,
  canAccessRecipes: false,
  canAccessDiscounts: false,
  canAccessStaff: false,
  canAccessExpenses: false,
  canAccessFloorPlan: false,
  canAccessDamages: false,
  canAccessAssets: false,
  canApplyCustomDiscount: false,
  canVoidInvoice: false,
  canProcessReturns: false,
  canStartCloseShift: false,
  canModifyMenuPrices: false,
  posCanDineIn: false,
  posCanTakeaway: false,
  posCanDelivery: false,
  posCanSendKot: false,
  posCanSettleBill: false,
  posCanPrintUnpaidBill: false,
  posCanReleaseTable: false,
  posCanMoveTable: false,
  posCanDismissTicket: false,
  posCanSplitPayment: false,
  posCanManageCustomers: false,
  ...EMPTY_CRUD_PERMISSIONS,
};

type BooleanModuleKey = {
  [K in keyof SystemSettings]: SystemSettings[K] extends boolean ? K : never;
}[keyof SystemSettings];

type NumberModuleKey = {
  [K in keyof SystemSettings]: SystemSettings[K] extends number ? K : never;
}[keyof SystemSettings];

interface ModuleToggleItem {
  key: BooleanModuleKey;
  label: string;
  sub: string;
  isMaster?: boolean;
}

interface ModuleNumericItem {
  key: NumberModuleKey;
  label: string;
  unit: string;
}

interface ModuleControlGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  toggles: ModuleToggleItem[];
  numericFields?: ModuleNumericItem[];
}

const MODULE_CONTROL_GROUPS: ModuleControlGroup[] = [
  {
    id: 'pos_channels',
    title: 'POS Terminal & Order Channels',
    subtitle: 'Control POS billing screen, order modes, filters & table/payment rules',
    icon: 'calculator-outline',
    toggles: [
      {
        key: 'enablePosModule',
        label: 'POS Terminal Module',
        sub: 'Master switch to show/enable the main POS Billing Terminal in navigation',
        isMaster: true,
      },
      {
        key: 'enableDineIn',
        label: 'Dine-In Floor & Tables',
        sub: 'Enable dine-in tab, table seating, waiter assignment & cabin orders at POS',
      },
      {
        key: 'enableTakeaway',
        label: 'Takeaway Counter Orders',
        sub: 'Enable quick takeaway tickets & counter billing tab at POS',
      },
      {
        key: 'enableDelivery',
        label: 'Delivery & Rider Dispatch',
        sub: 'Enable delivery tab, phone/address lookup & delivery fee calculation',
      },
      {
        key: 'posShowCuisineFilter',
        label: 'POS Cuisine / Region Filter Bar',
        sub: 'Show horizontal cuisine/region quick-filter pills in POS menu catalog',
      },
      {
        key: 'posShowDealsTab',
        label: 'POS Deals & Combos Quick Filter',
        sub: 'Highlight Deals & Combo packages category inside the POS terminal',
      },
      {
        key: 'posRequireTableForDineIn',
        label: 'Require Table Selection for Dine-In',
        sub: 'Enforce selecting a table or cabin before placing a Dine-In KOT/bill',
      },
      {
        key: 'posRequireCustomerForDelivery',
        label: 'Require Customer Details for Delivery',
        sub: 'Require guest name, phone & address before dispatching delivery orders',
      },
      {
        key: 'posAllowSplitPayment',
        label: 'Allow Split / Multi-Method Payments',
        sub: 'Permit settling a single invoice across Cash + Card / Online wallet',
      },
      {
        key: 'posEnableTableReleaseConfirm',
        label: 'Post-Payment Table Decision Prompt',
        sub: 'Ask cashier whether to release table or keep guests seated after bill payment',
      },
    ],
  },
  {
    id: 'floor_qr',
    title: 'Floor Command, Tables & Digital QR Menu',
    subtitle: 'Control floor blueprints, table zones, online orders & guest QR menu',
    icon: 'business-outline',
    toggles: [
      {
        key: 'enableFloorPlanModule',
        label: 'Floor Command & Table Blueprint',
        sub: 'Master switch for live floor command, seating maps & table builder screens',
        isMaster: true,
      },
      {
        key: 'enableDigitalQrMenu',
        label: 'Customer Digital QR Menu',
        sub: 'Enable the guest-facing QR menu experience & table self-ordering portal',
        isMaster: true,
      },
      {
        key: 'enableOnlineOrders',
        label: 'Online & QR App Orders Command',
        sub: 'Accept live incoming online/QR orders and show App Orders Command screen',
      },
      {
        key: 'enableMajlisSeating',
        label: 'Majlis & Private Cabin Zones',
        sub: 'Include VIP Majlis / Family Cabin seating options across floors & POS',
      },
      {
        key: 'enableCouchSeating',
        label: 'Lounge & Sofa Seating Zones',
        sub: 'Include sofa lounge seating groups in floor blueprint & POS selector',
      },
      {
        key: 'enableWaiterFloorLock',
        label: 'Waiter Floor-Restriction Enforcement',
        sub: 'Restrict Order Takers to tables on their assigned floors/zones',
      },
    ],
  },
  {
    id: 'kitchen_recipes',
    title: 'Kitchen (KDS), Juice Bar & Recipe BOM',
    subtitle: 'Control kitchen ticket displays, prep timers, stock handover & recipes',
    icon: 'restaurant-outline',
    toggles: [
      {
        key: 'enableKdsModule',
        label: 'Kitchen & Juice Bar KDS Displays',
        sub: 'Master switch for live kitchen KOT routing & preparation displays',
        isMaster: true,
      },
      {
        key: 'kdsSoundAlerts',
        label: 'KDS Audio Chime Alerts',
        sub: 'Play sound notification on Kitchen & Juice Bar screens for new KOTs',
      },
      {
        key: 'kdsAutoRouteBeverages',
        label: 'Auto-Route Beverages to Juice Bar KDS',
        sub: 'Separate juices, shakes, mocktails & tea automatically to Juice Bar screen',
      },
      {
        key: 'enableKitchenHandoverModule',
        label: 'Kitchen Handover & Returns Module',
        sub: 'Master switch for daily kitchen stock issue & unused return tracking',
        isMaster: true,
      },
      {
        key: 'enableRecipesBomModule',
        label: 'Recipe BOM & Dish Costing Module',
        sub: 'Master switch for ingredient bill-of-materials & dish margin costing screens',
        isMaster: true,
      },
      {
        key: 'autoDeductRecipeStock',
        label: 'Auto-Deduct Stock by Recipe BOM',
        sub: 'Automatically deduct linked raw ingredients when dishes are sold on POS',
      },
    ],
    numericFields: [
      {
        key: 'kdsTargetPrepMinutes',
        label: 'Target Kitchen Prep SLA (Minutes)',
        unit: 'mins',
      },
    ],
  },
  {
    id: 'sales_crm',
    title: 'Sales, CRM, Promotions & Returns',
    subtitle: 'Control invoice ledgers, refunds, discount campaigns & caller ID',
    icon: 'receipt-outline',
    toggles: [
      {
        key: 'enableInvoicesModule',
        label: 'Invoices & Order History Module',
        sub: 'Master switch for invoice ledger, order history & bill re-printing screen',
        isMaster: true,
      },
      {
        key: 'enableReturnsModule',
        label: 'Sales Returns & Refunds Module',
        sub: 'Master switch for returning settled items & recording cash/card refunds',
        isMaster: true,
      },
      {
        key: 'enableDiscountsModule',
        label: 'Events & Discounts Module',
        sub: 'Master switch for festival campaigns, bank offers & promo discount rules',
        isMaster: true,
      },
      {
        key: 'enableCustomerCrmModule',
        label: 'Customer CRM & Loyalty Directory',
        sub: 'Master switch for customer database, order history & credit/loyalty profiles',
        isMaster: true,
      },
      {
        key: 'enableCallDetector',
        label: 'Incoming Call Detector (Android)',
        sub: 'Auto-detect caller phone numbers on tablet/phone for instant delivery lookup',
      },
      {
        key: 'enableCustomerFeedbackQr',
        label: 'Customer Feedback QR Capture',
        sub: 'Collect guest star ratings & dish reviews via receipt/table QR links',
      },
    ],
  },
  {
    id: 'inventory_supply',
    title: 'Inventory, Suppliers & Damage Control',
    subtitle: 'Control warehouse stock, vendor purchases, wastage & low-stock rules',
    icon: 'cube-outline',
    toggles: [
      {
        key: 'enableInventoryModule',
        label: 'Inventory & Stock Control Module',
        sub: 'Master switch for stock levels, adjustments, transfers & warehouse ledger',
        isMaster: true,
      },
      {
        key: 'enableSuppliersModule',
        label: 'Suppliers & Vendors Module',
        sub: 'Master switch for supplier profiles, purchase orders & vendor payables',
        isMaster: true,
      },
      {
        key: 'enableDamagesModule',
        label: 'Damage, Wastage & Spoilage Control',
        sub: 'Master switch for kitchen spoilage, broken crockery & waste write-off logs',
        isMaster: true,
      },
      {
        key: 'enableSystemNotifications',
        label: 'Live System Notifications & Stock Alarms',
        sub: 'Master switch for floating stock alarm bell, waiter food-ready popups & live operational alert banners',
        isMaster: true,
      },
      {
        key: 'blockOutOfStockPosOrders',
        label: 'Block Out-of-Stock Items in POS',
        sub: 'Prevent ordering dishes when tracked recipe/inventory stock hits zero',
      },
    ],
    numericFields: [
      {
        key: 'lowStockAlertThreshold',
        label: 'Low Stock Alert Threshold (Units)',
        unit: 'units',
      },
    ],
  },
  {
    id: 'finance_shift',
    title: 'Finance, Shift Cash, Expenses & Assets',
    subtitle: 'Control register shifts, P&L reports, analytics, expenses & capex',
    icon: 'bar-chart-outline',
    toggles: [
      {
        key: 'enableShiftModule',
        label: 'Live Shift & Cash Register Module',
        sub: 'Master switch for opening/closing shifts, cash drawers & blind note counts',
        isMaster: true,
      },
      {
        key: 'requireActiveShiftForPos',
        label: 'Require Open Shift Before POS Billing',
        sub: 'Mandate an active cash register shift before settling payments at POS',
      },
      {
        key: 'enableReportsModule',
        label: 'Financial Reports & Z-Audit Module',
        sub: 'Master switch for daily/monthly sales, tax, payment breakdown & Z-reports',
        isMaster: true,
      },
      {
        key: 'enableInsightsModule',
        label: 'Business Insights & Analytics Module',
        sub: 'Master switch for top dishes, peak hours, category trends & profit insights',
        isMaster: true,
      },
      {
        key: 'enableExpensesModule',
        label: 'Live Expenses & Petty Cash Module',
        sub: 'Master switch for daily cash-out entries, utility bills & petty expenses',
        isMaster: true,
      },
      {
        key: 'enableAssetsModule',
        label: 'Assets & Capex Register Module',
        sub: 'Master switch for restaurant equipment, furniture & fixed capital assets',
        isMaster: true,
      },
    ],
  },
  {
    id: 'hr_playland',
    title: 'Staff HR, Attendance, Payroll & Playland',
    subtitle: 'Control employee HR tabs, shift hours & Playland ticketing hub',
    icon: 'people-outline',
    toggles: [
      {
        key: 'enableStaffHrModule',
        label: 'Staff Directory & HR Module',
        sub: 'Master switch for employee profiles, PINs, floor assignments & HR screen',
        isMaster: true,
      },
      {
        key: 'enableAttendanceTracking',
        label: 'Daily Attendance Register (حاضری)',
        sub: 'Enable staff check-in/out attendance tab & daily presence tracking',
      },
      {
        key: 'enablePayrollModule',
        label: 'Salary & Monthly Payroll (تنخواہیں)',
        sub: 'Enable salary calculation, overtime payouts & payroll ledger tab',
      },
      {
        key: 'enablePlayland',
        label: 'Playland Hub Module',
        sub: 'Master switch for Playland ticketing, wristband tracking & arcade sessions',
        isMaster: true,
      },
    ],
    numericFields: [
      {
        key: 'standardShiftHours',
        label: 'Standard Daily Shift Hours',
        unit: 'hrs',
      },
      {
        key: 'playlandDefaultSessionMins',
        label: 'Default Playland Session (Minutes)',
        unit: 'mins',
      },
    ],
  },
];

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettingsToDefaults = useSettingsStore((s) => s.resetSettingsToDefaults);

  const [draft, setDraft] = useState<SystemSettings>(() => ({ ...settings }));
  const [isSaving, setIsSaving] = useState(false);
  const prevSettingsRef = useRef<SystemSettings>(settings);

  const staff = useRestaurantStore((s) => s.staff);
  const addStaff = useRestaurantStore((s) => s.addStaff);
  const updateStaff = useRestaurantStore((s) => s.updateStaff);
  const deleteStaff = useRestaurantStore((s) => s.deleteStaff);
  const activeStaffSessions = useRestaurantStore((s) => s.activeStaffSessions) || [];
  const terminateStaffSession = useRestaurantStore((s) => s.terminateStaffSession);
  const terminateAllStaffSessions = useRestaurantStore((s) => s.terminateAllStaffSessions);
  const currentAuthUser = useAuthStore((s) => s.user);

  const tables = useRestaurantStore((s) => s.tables);
  const tickets = useRestaurantStore((s) => s.tickets);
  const invoices = useRestaurantStore((s) => s.invoices);
  const customers = useRestaurantStore((s) => s.customers);
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const rawRoles = useRoleStore((s) => s.roles);
  const roles = useMemo(() => (rawRoles || []).map(normalizeRole), [rawRoles]);
  const addRole = useRoleStore((s) => s.addRole);
  const updateRole = useRoleStore((s) => s.updateRole);
  const updateRolePermissions = useRoleStore((s) => s.updateRolePermissions);
  const deleteRole = useRoleStore((s) => s.deleteRole);
  const resetToDefaultRoles = useRoleStore((s) => s.resetToDefaultRoles);
  const currentUser = useAuthStore((s) => s.user);
  const { canAddStaff, canEditStaff, canDeleteStaff } = useRolePermissions();

  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [serverIpInput, setServerIpInput] = useState('');

  // Role & Permission Control state
  const [selectedRoleId, setSelectedRoleId] = useState<string>('role-manager');
  const [crudScope, setCrudScope] = useState<'role' | 'staff'>('role');
  const [selectedStaffPermId, setSelectedStaffPermId] = useState<string>('st-c1');
  const [showAllStaffInOverrides, setShowAllStaffInOverrides] = useState<boolean>(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [rName, setRName] = useState('');
  const [rUrduName, setRUrduName] = useState('');
  const [rDesc, setRDesc] = useState('');
  const [rBaseRole, setRBaseRole] = useState<BaseRoleType>('manager');
  const [rColor, setRColor] = useState('#B48214');
  const [rCloneFromId, setRCloneFromId] = useState<string>('none');

  // User modal state
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [uHasSystemAccess, setUHasSystemAccess] = useState<boolean>(true);
  const [uMaxDevices, setUMaxDevices] = useState<number>(0); // 0 = follow Global Default
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [uUsername, setUUsername] = useState('');
  const [uName, setUName] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uPin, setUPin] = useState('');
  const [uRole, setURole] = useState<StaffRole>('waiter');
  const [uCustomRoleId, setUCustomRoleId] = useState<string>('role-waiter');
  const [uShift, setUShift] = useState<StaffShift>('Morning');
  const [userSearch, setUserSearch] = useState('');
  const [moduleSearch, setModuleSearch] = useState('');

  // Restore modal state
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restoreJsonText, setRestoreJsonText] = useState('');

  // Danger confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 3000);
  };

  const areSettingsEqual = (a: SystemSettings, b: SystemSettings) => {
    const keys = Object.keys(a) as (keyof SystemSettings)[];
    for (const k of keys) {
      if (k === 'updatedAt') continue;
      if (a[k] !== b[k]) return false;
    }
    return true;
  };

  const hasUnsavedChanges = useMemo(
    () => !areSettingsEqual(draft, settings),
    [draft, settings]
  );

  useEffect(() => {
    if (settings !== prevSettingsRef.current) {
      if (areSettingsEqual(draft, prevSettingsRef.current)) {
        setDraft({ ...settings });
      }
      prevSettingsRef.current = settings;
    }
  }, [settings]);

  const updateDraft = (partial: Partial<SystemSettings>) => {
    const normalizedPatch: Partial<SystemSettings> = { ...partial };
    if ('showQrOnReceipt' in normalizedPatch && !('enableCustomerFeedbackQr' in normalizedPatch)) {
      normalizedPatch.enableCustomerFeedbackQr = normalizedPatch.showQrOnReceipt;
    }
    if ('enableCustomerFeedbackQr' in normalizedPatch && !('showQrOnReceipt' in normalizedPatch)) {
      normalizedPatch.showQrOnReceipt = normalizedPatch.enableCustomerFeedbackQr;
    }
    setDraft((prev) => ({ ...prev, ...normalizedPatch }));
  };

  const applySettingPatchImmediate = (partial: Partial<SystemSettings>) => {
    const normalizedPatch: Partial<SystemSettings> = { ...partial };
    if ('showQrOnReceipt' in normalizedPatch && !('enableCustomerFeedbackQr' in normalizedPatch)) {
      normalizedPatch.enableCustomerFeedbackQr = normalizedPatch.showQrOnReceipt;
    }
    if ('enableCustomerFeedbackQr' in normalizedPatch && !('showQrOnReceipt' in normalizedPatch)) {
      normalizedPatch.showQrOnReceipt = normalizedPatch.enableCustomerFeedbackQr;
    }
    setDraft((prev) => ({ ...prev, ...normalizedPatch }));
    updateSettings(normalizedPatch);
    prevSettingsRef.current = useSettingsStore.getState().settings;
    broadcastImmediately();
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const { updatedAt: _omit, ...cleanDraft } = draft;
      updateSettings(cleanDraft);
      const saved = useSettingsStore.getState().settings;
      prevSettingsRef.current = saved;
      setDraft({ ...saved });
      broadcastImmediately();
      showToast('Settings saved & synced across all devices!');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setDraft({ ...settings });
    showToast('Unsaved changes discarded');
  };

  // Master Admin only: public website contact details
  const isMasterAdmin =
    currentUser?.staffId === 'st-master' ||
    currentUser?.id === 'st-master' ||
    (currentUser?.username || '').toLowerCase() === 'master';
  const visibleTabs = TABS.filter((t) => t.id !== 'website' || isMasterAdmin);
  const [isPublishingWebsite, setIsPublishingWebsite] = useState(false);

  const handlePublishWebsite = async () => {
    if (!isMasterAdmin) return;
    setIsPublishingWebsite(true);
    try {
      const { updatedAt: _omit, ...cleanDraft } = draft;
      updateSettings(cleanDraft);
      const ok = await publishWebsiteInfoToCloud();
      if (ok) {
        updateSettings({ websitePublishedAt: Date.now() });
      }
      const saved = useSettingsStore.getState().settings;
      prevSettingsRef.current = saved;
      setDraft({ ...saved });
      broadcastImmediately();
      showToast(
        ok
          ? 'Website updated! Contact details are now live on the website.'
          : 'Saved locally, but website publish failed. Check internet and try again.'
      );
    } finally {
      setIsPublishingWebsite(false);
    }
  };

  useEffect(() => {
    const unsub = subscribeToSyncStatus((info) => {
      setSyncInfo(info);
      setServerIpInput((prev) => (prev ? prev : info.serverIp || ''));
    });
    return () => {
      unsub();
    };
  }, []);

  const filteredStaff = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return staff || [];
    return (staff || []).filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q)
    );
  }, [staff, userSearch]);

  const openAddUserModal = () => {
    setEditingStaff(null);
    setUHasSystemAccess(true);
    setUUsername('');
    setUName('');
    setUPhone('');
    setUPin('');
    setUMaxDevices(0);
    setURole('waiter');
    const waiterRole = roles.find((r) => r.id === 'role-waiter' || r.baseRole === 'waiter') || roles[0];
    setUCustomRoleId(waiterRole?.id || 'role-waiter');
    setUShift('Morning');
    setUserModalVisible(true);
  };

  const openAddCashierModal = () => {
    setEditingStaff(null);
    setUHasSystemAccess(true);
    setUUsername('');
    setUName('');
    setUPhone('');
    setUPin('');
    setUMaxDevices(0);
    setURole('Cashier');
    const cashierRole = roles.find((r) => r.id === 'role-cashier' || r.name.toLowerCase() === 'cashier') || roles[0];
    setUCustomRoleId(cashierRole?.id || 'role-cashier');
    setUShift('Morning');
    setUserModalVisible(true);
  };

  const openEditUserModal = (member: StaffMember) => {
    const isMaster = member.id === 'st-master' || (member.username || '').trim().toLowerCase() === 'master';
    const hasAccess = isMaster
      ? true
      : member.hasSystemAccess !== false && Boolean((member.pin || '').trim().length > 0);
    setEditingStaff(member);
    setUHasSystemAccess(hasAccess);
    setUUsername(hasAccess ? member.username || '' : '');
    setUName(member.name);
    setUPhone(member.phone || '');
    setUPin(hasAccess ? member.pin || '' : '');
    setUMaxDevices(member.maxConcurrentDevices && member.maxConcurrentDevices > 0 ? member.maxConcurrentDevices : 0);
    setURole(member.role);
    const matchedRole =
      roles.find((r) => r.id === member.customRoleId) ||
      roles.find(
        (r) =>
          r.name.toLowerCase() === (member.role || '').toLowerCase() ||
          r.baseRole === (member.role || '').toLowerCase()
      );
    setUCustomRoleId(matchedRole?.id || member.customRoleId || '');
    setUShift(member.shift || 'Morning');
    setUserModalVisible(true);
  };

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || roles[0],
    [roles, selectedRoleId]
  );

  const countEnabledPerms = (perms?: RolePermissions) =>
    perms ? ALL_PERMISSION_KEYS.filter((k) => !!perms[k]).length : 0;

  const openAddRoleModal = () => {
    setEditingRole(null);
    setRName('');
    setRUrduName('');
    setRDesc('');
    setRBaseRole('manager');
    setRColor('#B48214');
    setRCloneFromId('none');
    setRoleModalVisible(true);
  };

  const openEditRoleModal = (role: CustomRole) => {
    setEditingRole(role);
    setRName(role.name);
    setRUrduName(role.urduName || '');
    setRDesc(role.description || '');
    setRBaseRole(role.baseRole);
    setRColor(role.badgeColor || '#B48214');
    setRCloneFromId('none');
    setRoleModalVisible(true);
  };

  const handleSaveRoleModal = () => {
    if (!rName.trim()) {
      Alert.alert('Validation', 'Role name is required.');
      return;
    }
    if (editingRole) {
      updateRole(editingRole.id, {
        name: rName.trim(),
        urduName: rUrduName.trim() || undefined,
        description: rDesc.trim() || `Custom permissions for ${rName.trim()}`,
        baseRole: editingRole.isSystem ? editingRole.baseRole : rBaseRole,
        badgeColor: rColor,
      });
      broadcastImmediately();
      setRoleModalVisible(false);
      showToast(`Updated role "${rName.trim()}"`);
    } else {
      const sourceRole = rCloneFromId !== 'none' ? roles.find((r) => r.id === rCloneFromId) : null;
      const initialPerms: RolePermissions = sourceRole
        ? { ...sourceRole.permissions }
        : { ...EMPTY_PERMISSIONS };
      const newId = addRole({
        name: rName.trim(),
        urduName: rUrduName.trim() || undefined,
        description: rDesc.trim() || `Custom permissions configured in System Settings`,
        badgeColor: rColor,
        icon: 'shield-checkmark',
        isSystem: false,
        baseRole: rBaseRole,
        permissions: initialPerms,
      });
      setSelectedRoleId(newId);
      broadcastImmediately();
      setRoleModalVisible(false);
      showToast(`Created role "${rName.trim()}" — configure permissions below!`);
    }
  };

  const getAutoMasterKeyForCrud = (
    key: keyof RolePermissions
  ): keyof RolePermissions | null => {
    if (MODULE_CRUD_ADD_SET.has(key)) return 'canAddRecords';
    if (MODULE_CRUD_EDIT_SET.has(key)) return 'canEditRecords';
    if (MODULE_CRUD_DELETE_SET.has(key)) return 'canDeleteRecords';
    return null;
  };

  const buildAtomicPermTogglePatch = (
    key: keyof RolePermissions,
    nextValue: boolean,
    currentPerms: RolePermissions,
    isAdminRole = false
  ): Partial<RolePermissions> => {
    const patch: Partial<RolePermissions> = { [key]: nextValue };

    if (nextValue) {
      const masterKey = getAutoMasterKeyForCrud(key);
      if (masterKey && !currentPerms?.[masterKey]) {
        patch[masterKey] = true;
      }
      const owningRow = CRUD_MODULE_ROWS.find(
        (r) => r.addKey === key || r.editKey === key || r.deleteKey === key
      );
      if (owningRow?.viewKey && !currentPerms?.[owningRow.viewKey]) {
        patch[owningRow.viewKey] = true;
      }
    } else {
      // Turning off a dedicated (non-shared) module View switch also locks its Add/Edit/Delete pills
      const owningRow = CRUD_MODULE_ROWS.find((r) => r.viewKey === key && !r.sharedViewKey);
      if (owningRow) {
        patch[owningRow.addKey] = false;
        patch[owningRow.editKey] = false;
        patch[owningRow.deleteKey] = false;
      }
    }

    if (isAdminRole) {
      patch.canAccessStaff = true;
    }
    return patch;
  };

  const handleToggleRolePerm = (roleId: string, key: keyof RolePermissions, nextValue: boolean) => {
    const targetRole = roles.find((r) => r.id === roleId);
    if (!targetRole) return;
    if (roleId === 'role-admin' && key === 'canAccessStaff' && !nextValue) {
      showToast('Admin Staff & Roles access stays enabled to prevent lockout');
      return;
    }
    const patch = buildAtomicPermTogglePatch(key, nextValue, targetRole.permissions, roleId === 'role-admin');
    updateRolePermissions(roleId, patch);
    broadcastImmediately();
  };

  const handleToggleRoleCrudRow = (role: CustomRole, row: CrudModuleRowMeta, enableAll: boolean) => {
    const patch: Partial<RolePermissions> = {
      [row.addKey]: enableAll,
      [row.editKey]: enableAll,
      [row.deleteKey]: enableAll,
    };
    if (enableAll) {
      patch.canAddRecords = true;
      patch.canEditRecords = true;
      patch.canDeleteRecords = true;
      if (row.viewKey) {
        patch[row.viewKey] = true;
      }
    }
    updateRolePermissions(role.id, patch);
    broadcastImmediately();
    showToast(`${enableAll ? 'Granted full CRUD' : 'Locked Add/Edit/Delete'} on ${row.label} for ${role.name}`);
  };

  const handleApplyRoleCrudPreset = (
    role: CustomRole,
    preset: 'full' | 'no_delete' | 'read_only'
  ) => {
    const patch = buildCrudPresetPatch(preset);
    if (preset === 'full' || preset === 'no_delete') {
      CRUD_MODULE_ROWS.forEach((row) => {
        if (row.viewKey) {
          patch[row.viewKey] = true;
        }
      });
    }
    updateRolePermissions(role.id, patch);
    broadcastImmediately();
    const label =
      preset === 'full'
        ? 'Full CRUD (View + Add + Edit + Delete)'
        : preset === 'no_delete'
          ? 'View, Add & Edit Only (Delete Locked)'
          : 'View Only (All Add/Edit/Delete Locked)';
    showToast(`Applied "${label}" CRUD policy to ${role.name}`);
  };

  const handleBulkRoleCrudColumn = (
    role: CustomRole,
    col: 'add' | 'edit' | 'delete',
    nextVal: boolean
  ) => {
    const patch = buildCrudColumnPatch(col, nextVal);
    updateRolePermissions(role.id, patch);
    broadcastImmediately();
    const colLabel = col === 'add' ? 'Add' : col === 'edit' ? 'Edit' : 'Delete';
    showToast(`${nextVal ? 'Enabled' : 'Locked'} all ${colLabel} permissions for ${role.name}`);
  };

  const handleBulkRolePerms = (role: CustomRole, grantAll: boolean) => {
    const updated: RolePermissions = grantAll
      ? { ...ADMIN_PERMISSIONS }
      : {
          ...EMPTY_PERMISSIONS,
          ...(role.id === 'role-admin' ? { canAccessStaff: true } : {}),
        };
    updateRole(role.id, { permissions: updated });
    broadcastImmediately();
    showToast(
      grantAll
        ? `Granted all permissions to ${role.name}`
        : `Revoked permissions for ${role.name}`
    );
  };

  const handleSaveAndSyncRoles = async () => {
    broadcastImmediately();
    const ok = await forceSyncNow();
    showToast(ok ? 'Role permissions saved & synced across all devices!' : 'Role permissions saved locally & broadcasted');
  };

  // Per-Cashier & Individual Staff Permission Override Helpers
  const isCashierStaff = (member: StaffMember) =>
    member.customRoleId === 'role-cashier' || (member.role || '').trim().toLowerCase() === 'cashier';

  const cashierStaffList = useMemo(
    () => (staff || []).filter((s) => isCashierStaff(s)),
    [staff]
  );

  const staffForOverrideList = useMemo(
    () => (showAllStaffInOverrides ? staff || [] : cashierStaffList),
    [staff, cashierStaffList, showAllStaffInOverrides]
  );

  const selectedOverrideStaff = useMemo(
    () =>
      staffForOverrideList.find((s) => s.id === selectedStaffPermId) ||
      staffForOverrideList[0] ||
      null,
    [staffForOverrideList, selectedStaffPermId]
  );

  const resolveBaseRoleForStaff = (member: StaffMember): CustomRole => {
    const cashierFallback = roles.find((r) => r.id === 'role-cashier') || roles[0];
    return (
      roles.find((r) => r.id === member.customRoleId) ||
      roles.find(
        (r) =>
          r.name.toLowerCase() === (member.role || '').toLowerCase() ||
          r.baseRole === (member.role || '').toLowerCase()
      ) ||
      cashierFallback
    );
  };

  const getEffectiveStaffPerms = (member: StaffMember): RolePermissions => {
    const baseRole = resolveBaseRoleForStaff(member);
    return {
      ...EMPTY_PERMISSIONS,
      ...(baseRole?.permissions || {}),
      ...(member.permissionOverrides || {}),
    };
  };

  const countStaffOverrides = (member: StaffMember): number =>
    member.permissionOverrides
      ? ALL_PERMISSION_KEYS.filter((k) => member.permissionOverrides?.[k] !== undefined).length
      : 0;

  const applyStaffPermPatch = (member: StaffMember, patch: Partial<RolePermissions>) => {
    const baseRole = resolveBaseRoleForStaff(member);
    const nextOverrides: Partial<RolePermissions> = { ...(member.permissionOverrides || {}) };
    (Object.keys(patch) as (keyof RolePermissions)[]).forEach((k) => {
      const val = Boolean(patch[k]);
      const baseVal = Boolean(baseRole?.permissions?.[k]);
      if (val === baseVal) {
        delete nextOverrides[k];
      } else {
        nextOverrides[k] = val;
      }
    });
    updateStaff(member.id, {
      permissionOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
    });
    broadcastImmediately();
  };

  const handleToggleStaffPerm = (
    member: StaffMember,
    key: keyof RolePermissions,
    nextValue: boolean
  ) => {
    const effective = getEffectiveStaffPerms(member);
    const patch = buildAtomicPermTogglePatch(key, nextValue, effective, false);
    applyStaffPermPatch(member, patch);
  };

  const handleToggleStaffCrudRow = (
    member: StaffMember,
    row: CrudModuleRowMeta,
    enableAll: boolean
  ) => {
    const patch: Partial<RolePermissions> = {
      [row.addKey]: enableAll,
      [row.editKey]: enableAll,
      [row.deleteKey]: enableAll,
    };
    if (enableAll) {
      patch.canAddRecords = true;
      patch.canEditRecords = true;
      patch.canDeleteRecords = true;
      if (row.viewKey) {
        patch[row.viewKey] = true;
      }
    }
    applyStaffPermPatch(member, patch);
    showToast(`${enableAll ? 'Granted full CRUD' : 'Locked Add/Edit/Delete'} on ${row.label} for ${member.name}`);
  };

  const handleApplyStaffCrudPreset = (
    member: StaffMember,
    preset: 'full' | 'no_delete' | 'read_only'
  ) => {
    const patch = buildCrudPresetPatch(preset);
    if (preset === 'full' || preset === 'no_delete') {
      CRUD_MODULE_ROWS.forEach((row) => {
        if (row.viewKey) {
          patch[row.viewKey] = true;
        }
      });
    }
    applyStaffPermPatch(member, patch);
    const label =
      preset === 'full'
        ? 'Full CRUD (View + Add + Edit + Delete)'
        : preset === 'no_delete'
          ? 'View, Add & Edit Only (Delete Locked)'
          : 'View Only (All Add/Edit/Delete Locked)';
    showToast(`Applied "${label}" CRUD policy to ${member.name}`);
  };

  const handleBulkStaffCrudColumn = (
    member: StaffMember,
    col: 'add' | 'edit' | 'delete',
    nextVal: boolean
  ) => {
    applyStaffPermPatch(member, buildCrudColumnPatch(col, nextVal));
    const colLabel = col === 'add' ? 'Add' : col === 'edit' ? 'Edit' : 'Delete';
    showToast(`${nextVal ? 'Enabled' : 'Locked'} all ${colLabel} permissions for ${member.name}`);
  };

  const renderCrudControlMatrix = (
    title: string,
    subtitle: string,
    perms: RolePermissions,
    onToggleKey: (key: keyof RolePermissions, nextVal: boolean) => void,
    onApplyPreset: (preset: 'full' | 'no_delete' | 'read_only') => void,
    onToggleColumn: (col: 'add' | 'edit' | 'delete', nextVal: boolean) => void,
    options?: {
      overrides?: Partial<RolePermissions>;
      adminRolePerms?: RolePermissions;
      isAdminRole?: boolean;
      onToggleRow?: (row: CrudModuleRowMeta, enableAll: boolean) => void;
    }
  ) => {
    const activeCrudCount = ALL_CRUD_KEYS.filter((k) => !!perms[k]).length;
    const allAddOn = !!perms.canAddRecords && MODULE_CRUD_ADD_KEYS.every((k) => !!perms[k]);
    const allEditOn = !!perms.canEditRecords && MODULE_CRUD_EDIT_KEYS.every((k) => !!perms[k]);
    const allDeleteOn = !!perms.canDeleteRecords && MODULE_CRUD_DELETE_KEYS.every((k) => !!perms[k]);

    const masterGateState = {
      add: !!perms.canAddRecords,
      edit: !!perms.canEditRecords,
      delete: !!perms.canDeleteRecords,
    };

    const renderViewPill = (row: CrudModuleRowMeta) => {
      if (!row.viewKey) {
        return (
          <View key={`${row.id}-view`} style={[styles.crudPill, styles.crudPillViewAlways]}>
            <Ionicons name="eye" size={14} color="#52171B" />
            <Text style={[styles.crudPillText, { color: '#52171B' }]}>View</Text>
          </View>
        );
      }
      const val = !!perms[row.viewKey];
      const isProtected = Boolean(options?.isAdminRole && row.viewKey === 'canAccessStaff');
      const isOverridden = options?.overrides?.[row.viewKey] !== undefined;
      return (
        <TouchableOpacity
          key={`${row.id}-view`}
          style={[
            styles.crudPill,
            val ? styles.crudPillViewActive : styles.crudPillInactive,
            isOverridden && styles.crudPillOverridden,
            isProtected && { opacity: 0.75 },
          ]}
          disabled={isProtected}
          onPress={() => onToggleKey(row.viewKey!, !val)}
          activeOpacity={0.75}
        >
          <Ionicons name={val ? 'eye' : 'eye-off-outline'} size={14} color={val ? '#92400E' : '#78716C'} />
          <View>
            <Text style={[styles.crudPillText, { color: val ? '#92400E' : '#78716C' }]}>
              View{isOverridden ? ' *' : ''}
            </Text>
            {isProtected && <Text style={styles.crudPillSubHint}>Locked</Text>}
          </View>
        </TouchableOpacity>
      );
    };

    const renderCrudPill = (
      kind: 'add' | 'edit' | 'delete',
      permKey: keyof RolePermissions,
      rowViewKey?: keyof RolePermissions
    ) => {
      const val = !!perms[permKey];
      const isOverridden = options?.overrides?.[permKey] !== undefined;
      const lockedByAdmin = Boolean(options?.adminRolePerms && !options.adminRolePerms[permKey]);
      const lockedByMaster = !masterGateState[kind] && val;
      const moduleHidden = Boolean(rowViewKey && !perms[rowViewKey] && val);
      const label = kind === 'add' ? 'Add' : kind === 'edit' ? 'Edit' : 'Delete';
      const iconName: keyof typeof Ionicons.glyphMap =
        kind === 'add'
          ? val
            ? 'add-circle'
            : 'add-circle-outline'
          : kind === 'edit'
            ? val
              ? 'create'
              : 'create-outline'
            : val
              ? 'trash'
              : 'trash-outline';
      const activeStyle =
        kind === 'add'
          ? styles.crudPillAddActive
          : kind === 'edit'
            ? styles.crudPillEditActive
            : styles.crudPillDelActive;
      const activeTextColor =
        kind === 'add' ? '#15803D' : kind === 'edit' ? '#1D4ED8' : '#B91C1C';

      return (
        <TouchableOpacity
          key={permKey}
          style={[
            styles.crudPill,
            val ? activeStyle : styles.crudPillInactive,
            isOverridden && styles.crudPillOverridden,
          ]}
          onPress={() => onToggleKey(permKey, !val)}
          activeOpacity={0.75}
        >
          <Ionicons
            name={iconName}
            size={14}
            color={val ? activeTextColor : '#78716C'}
          />
          <View>
            <Text style={[styles.crudPillText, { color: val ? activeTextColor : '#78716C' }]}>
              {label}
              {isOverridden ? ' *' : ''}
            </Text>
            {lockedByMaster && (
              <Text style={styles.crudPillSubHint}>Master Off</Text>
            )}
            {!lockedByMaster && lockedByAdmin && (
              <Text style={styles.crudPillSubHint}>Admin Off</Text>
            )}
            {!lockedByMaster && !lockedByAdmin && moduleHidden && (
              <Text style={styles.crudPillSubHint}>View Off</Text>
            )}
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.permCategoryCard}>
        <View style={styles.permCategoryHeader}>
          <View style={styles.permCategoryIconWrap}>
            <Ionicons name="options-outline" size={18} color="#52171B" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.permCategoryTitle}>{title}</Text>
              <View style={styles.groupCountPill}>
                <Text style={styles.groupCountPillText}>
                  {activeCrudCount}/{ALL_CRUD_KEYS.length} active
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 11.5, color: '#78716C', marginTop: 2 }}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.crudPresetRow}>
          <TouchableOpacity
            style={[styles.crudPresetBtn, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}
            onPress={() => onApplyPreset('full')}
          >
            <Ionicons name="checkmark-done-circle-outline" size={14} color="#15803D" />
            <Text style={[styles.crudPresetBtnText, { color: '#15803D' }]}>Full CRUD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.crudPresetBtn, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}
            onPress={() => onApplyPreset('no_delete')}
          >
            <Ionicons name="shield-half-outline" size={14} color="#1D4ED8" />
            <Text style={[styles.crudPresetBtnText, { color: '#1D4ED8' }]}>
              Add & Edit Only (No Delete)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.crudPresetBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
            onPress={() => onApplyPreset('read_only')}
          >
            <Ionicons name="lock-closed-outline" size={14} color="#B91C1C" />
            <Text style={[styles.crudPresetBtnText, { color: '#B91C1C' }]}>
              View Only (Lock All)
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.permGridWrap}>
          {CRUD_MASTER_PERMS.map((item) => {
            const val = !!perms[item.key];
            const isOverridden = options?.overrides?.[item.key] !== undefined;
            const lockedByAdmin = Boolean(options?.adminRolePerms && !options.adminRolePerms[item.key]);
            return (
              <View
                key={item.key}
                style={[
                  styles.permItemCard,
                  val && styles.permItemCardActive,
                  isOverridden && styles.permItemCardOverridden,
                ]}
              >
                <View style={styles.permItemIcon}>
                  <Ionicons name={item.icon} size={17} color={val ? '#52171B' : '#78716C'} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <Text style={[styles.permItemTitle, !val && { color: '#78716C' }]}>
                      {item.label}
                    </Text>
                    {isOverridden && (
                      <View style={styles.overridePill}>
                        <Text style={styles.overridePillText}>CUSTOM</Text>
                      </View>
                    )}
                    {lockedByAdmin && (
                      <View style={[styles.overridePill, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
                        <Text style={[styles.overridePillText, { color: '#991B1B' }]}>ADMIN OFF</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.permItemDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={val}
                  onValueChange={(v) => onToggleKey(item.key, v)}
                  trackColor={{ false: '#D6D3D1', true: '#D4AF37' }}
                  thumbColor={val ? '#52171B' : '#F5F5F4'}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.crudColBulkRow}>
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#52171B', marginRight: 4 }}>
            Quick Column Toggle:
          </Text>
          <TouchableOpacity
            style={styles.crudColBulkBtn}
            onPress={() => onToggleColumn('add', !allAddOn)}
          >
            <Ionicons
              name={allAddOn ? 'checkbox' : 'square-outline'}
              size={14}
              color="#15803D"
            />
            <Text style={[styles.crudColBulkText, { color: '#15803D' }]}>
              {allAddOn ? 'Lock All Add' : 'Allow All Add'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.crudColBulkBtn}
            onPress={() => onToggleColumn('edit', !allEditOn)}
          >
            <Ionicons
              name={allEditOn ? 'checkbox' : 'square-outline'}
              size={14}
              color="#1D4ED8"
            />
            <Text style={[styles.crudColBulkText, { color: '#1D4ED8' }]}>
              {allEditOn ? 'Lock All Edit' : 'Allow All Edit'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.crudColBulkBtn}
            onPress={() => onToggleColumn('delete', !allDeleteOn)}
          >
            <Ionicons
              name={allDeleteOn ? 'checkbox' : 'square-outline'}
              size={14}
              color="#B91C1C"
            />
            <Text style={[styles.crudColBulkText, { color: '#B91C1C' }]}>
              {allDeleteOn ? 'Lock All Delete' : 'Allow All Delete'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.crudMatrixWrap}>
          {CRUD_MODULE_ROWS.map((row) => {
            const rowFullOn = !!perms[row.addKey] && !!perms[row.editKey] && !!perms[row.deleteKey];
            return (
              <View key={row.id} style={styles.crudMatrixRow}>
                <View style={styles.crudMatrixLeft}>
                  <View style={styles.permItemIcon}>
                    <Ionicons name={row.icon} size={16} color="#52171B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.permItemTitle}>{row.label}</Text>
                    <Text style={styles.permItemDesc}>{row.desc}</Text>
                  </View>
                </View>
                <View style={styles.crudMatrixActions}>
                  {renderViewPill(row)}
                  {renderCrudPill('add', row.addKey, row.viewKey)}
                  {renderCrudPill('edit', row.editKey, row.viewKey)}
                  {renderCrudPill('delete', row.deleteKey, row.viewKey)}
                  {options?.onToggleRow && (
                    <TouchableOpacity
                      style={[styles.crudRowToggleBtn, rowFullOn && styles.crudRowToggleBtnActive]}
                      onPress={() => options.onToggleRow!(row, !rowFullOn)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.crudRowToggleText, rowFullOn && { color: '#52171B' }]}>
                        {rowFullOn ? 'Lock' : 'All'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const handleApplyCashierPreset = (
    member: StaffMember,
    preset: 'full_pos' | 'billing_only' | 'order_only' | 'reset'
  ) => {
    if (preset === 'reset') {
      updateStaff(member.id, { permissionOverrides: undefined });
      broadcastImmediately();
      showToast(`Reset ${member.name} to base ${resolveBaseRoleForStaff(member)?.name || 'Cashier'} role defaults`);
      return;
    }

    const presetPatch: Partial<RolePermissions> =
      preset === 'full_pos'
        ? {
            canAccessPOS: true,
            canAccessInvoices: true,
            canAccessFloorPlan: true,
            canApplyCustomDiscount: true,
            canStartCloseShift: true,
            posCanDineIn: true,
            posCanTakeaway: true,
            posCanDelivery: true,
            posCanSendKot: true,
            posCanSettleBill: true,
            posCanPrintUnpaidBill: true,
            posCanReleaseTable: true,
            posCanMoveTable: true,
            posCanDismissTicket: true,
            posCanSplitPayment: true,
            posCanManageCustomers: true,
          }
        : preset === 'billing_only'
          ? {
              canAccessPOS: true,
              canAccessInvoices: true,
              canApplyCustomDiscount: false,
              canVoidInvoice: false,
              canProcessReturns: false,
              posCanDineIn: true,
              posCanTakeaway: true,
              posCanDelivery: true,
              posCanSendKot: true,
              posCanSettleBill: true,
              posCanPrintUnpaidBill: true,
              posCanReleaseTable: false,
              posCanMoveTable: true,
              posCanDismissTicket: false,
              posCanSplitPayment: true,
              posCanManageCustomers: true,
            }
          : {
              canAccessPOS: true,
              canApplyCustomDiscount: false,
              canStartCloseShift: false,
              posCanDineIn: true,
              posCanTakeaway: true,
              posCanDelivery: true,
              posCanSendKot: true,
              posCanSettleBill: false,
              posCanPrintUnpaidBill: true,
              posCanReleaseTable: false,
              posCanMoveTable: true,
              posCanDismissTicket: false,
              posCanSplitPayment: false,
              posCanManageCustomers: true,
            };

    applyStaffPermPatch(member, presetPatch);
    const label =
      preset === 'full_pos'
        ? 'Full POS Access'
        : preset === 'billing_only'
          ? 'Billing Only (No Void/Cancel/Release)'
          : 'Order Taking Only (No Settlement)';
    showToast(`Applied "${label}" preset to ${member.name}`);
  };

  const handleSaveUser = () => {
    if (editingStaff ? !canEditStaff : !canAddStaff) {
      Alert.alert('Permission Denied', `You do not have permission to ${editingStaff ? 'edit' : 'add'} staff accounts.`);
      return;
    }
    if (!uName.trim()) {
      Alert.alert('Validation', 'Staff name is required.');
      return;
    }
    const isMaster =
      editingStaff?.id === 'st-master' ||
      (editingStaff?.username || '').trim().toLowerCase() === 'master';
    const allowLogin = isMaster ? true : uHasSystemAccess;

    let cleanUsername = '';
    let cleanPin = '';
    if (allowLogin) {
      if (!uPin.trim() || uPin.trim().length < 4) {
        Alert.alert('Validation', 'PIN must be at least 4 digits.');
        return;
      }
      cleanUsername = uUsername.trim().toLowerCase().replace(/\s+/g, '');
      cleanPin = uPin.trim();
      if (cleanUsername) {
        const duplicate = (staff || []).find(
          (s) =>
            s.id !== editingStaff?.id &&
            (s.username || '').trim().toLowerCase() === cleanUsername
        );
        if (duplicate) {
          Alert.alert('Duplicate Login ID', `Login ID "${cleanUsername}" is already used by ${duplicate.name}. Please choose a unique Login ID.`);
          return;
        }
      }
    }

    const effectiveLimitOverride = allowLogin && uMaxDevices > 0 ? uMaxDevices : undefined;
    if (editingStaff) {
      updateStaff(editingStaff.id, {
        hasSystemAccess: allowLogin,
        username: allowLogin ? (cleanUsername || undefined) : '',
        name: uName.trim(),
        phone: uPhone.trim(),
        pin: allowLogin ? cleanPin : '',
        role: uRole,
        customRoleId: uCustomRoleId || undefined,
        shift: uShift,
        maxConcurrentDevices: effectiveLimitOverride,
      });

      // If login access was denied, immediately kick any active sessions for this user
      if (!allowLogin) {
        const matchingSessions = activeStaffSessions.filter(
          (s) => s.staffId && s.staffId === editingStaff.id
        );
        const kickReason = 'Admin نے اس اکاؤنٹ کا لاگ ان بند (Login Denied) کر دیا ہے۔';
        const baseUrl = getActiveServerHttpUrl();
        matchingSessions.forEach((sess) => {
          terminateStaffSession(sess.sessionId, kickReason);
          if (baseUrl) {
            fetch(`${baseUrl}/api/auth/staff-session/kick`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: sess.sessionId,
                reason: kickReason,
              }),
            }).catch(() => {});
          }
        });
      }

      showToast(
        allowLogin
          ? `Updated user "${uName.trim()}"`
          : `Updated "${uName.trim()}" — Login Denied (No ID / PIN)`
      );
    } else {
      addStaff({
        hasSystemAccess: allowLogin,
        username: allowLogin ? (cleanUsername || undefined) : '',
        name: uName.trim(),
        phone: uPhone.trim() || '0300-0000000',
        pin: allowLogin ? cleanPin : '',
        role: uRole,
        customRoleId: uCustomRoleId || undefined,
        status: 'Active',
        shift: uShift,
        joinedDate: new Date().toISOString().split('T')[0],
        maxConcurrentDevices: effectiveLimitOverride,
      });
      showToast(
        allowLogin
          ? `Added user "${uName.trim()}"`
          : `Added staff "${uName.trim()}" — Login Denied (No ID / PIN)`
      );
    }
    broadcastImmediately();
    setUserModalVisible(false);
  };

  const handleExportBackup = async () => {
    const payload = buildSystemBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sultan_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Full system backup JSON downloaded!');
    } else {
      try {
        await Share.share({
          message: jsonStr,
          title: `Sultan Backup ${new Date().toISOString().slice(0, 10)}`,
        });
      } catch {
        Alert.alert('Backup Ready', `Backup size: ${Math.round(jsonStr.length / 1024)} KB`);
      }
    }
  };

  const handleRestoreBackup = () => {
    if (!restoreJsonText.trim()) {
      Alert.alert('Empty Backup', 'Paste your backup JSON first.');
      return;
    }
    const res = restoreSystemBackupPayload(restoreJsonText);
    if (res.ok) {
      setRestoreModalVisible(false);
      setRestoreJsonText('');
      showToast(res.message);
    } else {
      Alert.alert('Restore Failed', res.message);
    }
  };

  const moduleStats = useMemo(() => {
    let total = 0;
    let active = 0;
    for (const grp of MODULE_CONTROL_GROUPS) {
      for (const t of grp.toggles) {
        total += 1;
        if (draft[t.key]) active += 1;
      }
    }
    return { total, active };
  }, [draft]);

  const handleBulkGroupModules = (group: ModuleControlGroup, enable: boolean) => {
    const patch: Partial<SystemSettings> = {};
    for (const t of group.toggles) {
      patch[t.key] = enable as any;
    }
    applySettingPatchImmediate(patch);
    showToast(`${enable ? 'Enabled' : 'Disabled'} all options in ${group.title} & synced!`);
  };

  const handleBulkAllModules = (enable: boolean) => {
    const patch: Partial<SystemSettings> = {};
    for (const grp of MODULE_CONTROL_GROUPS) {
      for (const t of grp.toggles) {
        patch[t.key] = enable as any;
      }
    }
    applySettingPatchImmediate(patch);
    showToast(`${enable ? 'Enabled' : 'Disabled'} all module options & synced!`);
  };

  const handleResetModuleDefaults = () => {
    const patch: Partial<SystemSettings> = {};
    for (const grp of MODULE_CONTROL_GROUPS) {
      for (const t of grp.toggles) {
        patch[t.key] = DEFAULT_SYSTEM_SETTINGS[t.key] as any;
      }
      if (grp.numericFields) {
        for (const nf of grp.numericFields) {
          patch[nf.key] = DEFAULT_SYSTEM_SETTINGS[nf.key] as any;
        }
      }
    }
    applySettingPatchImmediate(patch);
    showToast('Module options reset to defaults & synced!');
  };

  const askConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ visible: true, title, message, onConfirm });
  };

  const renderToggleRow = (
    title: string,
    subtitle: string,
    value: boolean,
    onValueChange: (val: boolean) => void
  ) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D6D3D1', true: '#52171B' }}
        thumbColor={value ? '#D4AF37' : '#F5F5F4'}
      />
    </View>
  );

  const renderSaveFooter = () => (
    <View style={styles.cardFooterBar}>
      <View style={{ flex: 1 }}>
        <Text style={styles.footerStatusText}>
          {hasUnsavedChanges
            ? 'You have unsaved changes — save to apply & sync across POS, Tablets & KDS.'
            : 'All settings are saved and active across your system.'}
        </Text>
      </View>
      <View style={styles.footerActions}>
        {hasUnsavedChanges && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleDiscardChanges}>
            <Ionicons name="close-circle-outline" size={16} color="#52171B" />
            <Text style={styles.secondaryBtnText}>Discard</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.saveBtn,
            !hasUnsavedChanges && styles.saveBtnSaved,
          ]}
          onPress={handleSaveSettings}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          <Ionicons
            name={hasUnsavedChanges ? 'save-outline' : 'checkmark-circle'}
            size={16}
            color={hasUnsavedChanges ? '#140306' : '#065F46'}
          />
          <Text
            style={[
              styles.saveBtnText,
              !hasUnsavedChanges && styles.saveBtnTextSaved,
            ]}
          >
            {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPermissionGrid = (
    title: string,
    subtitle: string,
    icon: keyof typeof Ionicons.glyphMap,
    items: PermItemMeta[],
    effectivePerms: RolePermissions,
    onToggle: (key: keyof RolePermissions, nextValue: boolean) => void,
    options?: {
      lockedKeys?: (keyof RolePermissions)[];
      overrides?: Partial<RolePermissions>;
    }
  ) => (
    <View style={styles.permCategoryCard}>
      <View style={styles.permCategoryHeader}>
        <View style={styles.permCategoryIconWrap}>
          <Ionicons name={icon} size={16} color="#52171B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.permCategoryTitle}>{title}</Text>
          <Text style={styles.rowSub}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.permGridWrap}>
        {items.map((item) => {
          const enabled = !!effectivePerms?.[item.key];
          const isProtected = options?.lockedKeys?.includes(item.key) ?? false;
          const isOverridden = options?.overrides?.[item.key] !== undefined;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.permItemCard,
                isCompact && { width: '100%' },
                enabled && styles.permItemCardActive,
                isOverridden && styles.permItemCardOverridden,
                isProtected && { opacity: 0.75 },
              ]}
              activeOpacity={0.75}
              disabled={isProtected}
              onPress={() => onToggle(item.key, !enabled)}
            >
              <View style={styles.permItemIcon}>
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={enabled ? '#52171B' : '#78716C'}
                />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.permItemTitle}>
                    {item.label}
                    {isProtected ? ' (Locked)' : ''}
                  </Text>
                  {isOverridden && (
                    <View style={styles.overridePill}>
                      <Text style={styles.overridePillText}>CUSTOM</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.permItemDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={enabled}
                disabled={isProtected}
                onValueChange={(v) => onToggle(item.key, v)}
                trackColor={{ false: '#D6D3D1', true: '#52171B' }}
                thumbColor={enabled ? '#D4AF37' : '#F5F5F4'}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderPermissionCategory = (
    title: string,
    subtitle: string,
    icon: keyof typeof Ionicons.glyphMap,
    items: PermItemMeta[],
    role: CustomRole
  ) =>
    renderPermissionGrid(
      title,
      subtitle,
      icon,
      items,
      role.permissions,
      (key, v) => handleToggleRolePerm(role.id, key, v),
      { lockedKeys: role.id === 'role-admin' ? ['canAccessStaff'] : [] }
    );

  const renderFloorCommandAccessCard = (targetRole?: CustomRole) => {
    const managerRole =
      targetRole ||
      roles.find((r) => r.id === 'role-manager') ||
      roles.find((r) => r.baseRole === 'manager') ||
      roles[0];
    if (!managerRole) return null;

    const p = managerRole.permissions;
    const canView = !!p.canAccessFloorPlan;
    const canAdd = !!p.canAddTables && !!p.canAddRecords;
    const canEdit = !!p.canEditTables && !!p.canEditRecords;
    const canDel = !!p.canDeleteTables && !!p.canDeleteRecords;

    const isViewOnly = canView && !canAdd && !canEdit && !canDel;
    const isAddEdit = canView && canAdd && canEdit && !canDel;
    const isFull = canView && canAdd && canEdit && canDel;

    const applyFloorCommandMode = (mode: 'view_only' | 'add_edit' | 'full' | 'hidden') => {
      const nextPerms: RolePermissions = { ...managerRole.permissions };
      if (mode === 'hidden') {
        nextPerms.canAccessFloorPlan = false;
        nextPerms.canAddTables = false;
        nextPerms.canEditTables = false;
        nextPerms.canDeleteTables = false;
      } else if (mode === 'view_only') {
        nextPerms.canAccessFloorPlan = true;
        nextPerms.canAddTables = false;
        nextPerms.canEditTables = false;
        nextPerms.canDeleteTables = false;
      } else if (mode === 'add_edit') {
        nextPerms.canAccessFloorPlan = true;
        nextPerms.canAddRecords = true;
        nextPerms.canEditRecords = true;
        nextPerms.canAddTables = true;
        nextPerms.canEditTables = true;
        nextPerms.canDeleteTables = false;
      } else if (mode === 'full') {
        nextPerms.canAccessFloorPlan = true;
        nextPerms.canAddRecords = true;
        nextPerms.canEditRecords = true;
        nextPerms.canDeleteRecords = true;
        nextPerms.canAddTables = true;
        nextPerms.canEditTables = true;
        nextPerms.canDeleteTables = true;
      }
      updateRole(managerRole.id, { permissions: nextPerms });
      broadcastImmediately();
      const modeLabel =
        mode === 'view_only'
          ? 'View Floor Details Only (Add/Edit/Delete Locked)'
          : mode === 'add_edit'
            ? 'View + Add & Edit Floors/Tables Allowed'
            : mode === 'full'
              ? 'Full Floor Command (View + Add + Edit + Delete)'
              : 'Floor Command Hidden';
      showToast(`${managerRole.name}: ${modeLabel}`);
    };

    return (
      <View style={[styles.card, { borderColor: '#D4AF37', borderWidth: 1.5, backgroundColor: '#FFFDF9' }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 230 }}>
            <View style={[styles.permCategoryIconWrap, { backgroundColor: '#52171B' }]}>
              <Ionicons name="layers-outline" size={18} color="#F3D179" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0, fontSize: 15.5 }]}>
                  Floor Command Access Control — {managerRole.name} (فلور کمانڈ کنٹرول)
                </Text>
                <View
                  style={[
                    styles.groupCountPill,
                    isViewOnly
                      ? { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }
                      : isAddEdit || isFull
                        ? { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }
                        : { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
                  ]}
                >
                  <Text
                    style={[
                      styles.groupCountPillText,
                      isViewOnly
                        ? { color: '#92400E' }
                        : isAddEdit || isFull
                          ? { color: '#15803D' }
                          : { color: '#B91C1C' },
                    ]}
                  >
                    {isViewOnly
                      ? '🔒 VIEW DETAILS ONLY (صرف تفصیلات)'
                      : isFull
                        ? '🔓 FULL ACCESS (ایڈ / ایڈٹ / ڈیلیٹ)'
                        : isAddEdit
                          ? '✅ VIEW + ADD & EDIT ALLOWED'
                          : canView
                            ? '⚙️ CUSTOM FLOOR ACCESS'
                            : '🚫 FLOOR COMMAND HIDDEN'}
                  </Text>
                </View>
              </View>
              <Text style={styles.rowSub}>
                Control whether {managerRole.name} can only view floor details & capacities, or also Add, Edit, and Delete floors, tables, sofas & Majlis cabins
              </Text>
            </View>
          </View>

          {/* Quick Role Switcher between Manager & Floor Manager */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {roles
              .filter((r) => r.id === 'role-manager' || r.id === 'role-floor-manager' || r.id === 'role-cashier')
              .map((r) => {
                const active = managerRole.id === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.groupMiniBtn,
                      active && { backgroundColor: '#52171B', borderColor: '#52171B' },
                    ]}
                    onPress={() => setSelectedRoleId(r.id)}
                  >
                    <Ionicons
                      name="person-circle-outline"
                      size={14}
                      color={active ? '#F3D179' : '#52171B'}
                    />
                    <Text style={[styles.groupMiniBtnText, { color: active ? '#F3D179' : '#52171B' }]}>
                      {r.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        </View>

        {/* 1-Click Floor Command Mode Presets */}
        <View style={[styles.crudPresetRow, { marginTop: 10, marginBottom: 12 }]}>
          <TouchableOpacity
            style={[
              styles.crudPresetBtn,
              {
                borderColor: isViewOnly ? '#D97706' : '#E7E5E4',
                backgroundColor: isViewOnly ? '#FEF3C7' : '#FAFAF9',
                borderWidth: isViewOnly ? 1.5 : 1,
              },
            ]}
            onPress={() => applyFloorCommandMode('view_only')}
          >
            <Ionicons name="eye-outline" size={15} color="#92400E" />
            <Text style={[styles.crudPresetBtnText, { color: '#92400E' }]}>
              View Floor Details Only (صرف تفصیلات دیکھیں)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.crudPresetBtn,
              {
                borderColor: isAddEdit ? '#2563EB' : '#E7E5E4',
                backgroundColor: isAddEdit ? '#DBEAFE' : '#FAFAF9',
                borderWidth: isAddEdit ? 1.5 : 1,
              },
            ]}
            onPress={() => applyFloorCommandMode('add_edit')}
          >
            <Ionicons name="add-circle-outline" size={15} color="#1D4ED8" />
            <Text style={[styles.crudPresetBtnText, { color: '#1D4ED8' }]}>
              Allow Add & Edit Floors/Tables (ایڈ اور ایڈٹ کی اجازت)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.crudPresetBtn,
              {
                borderColor: isFull ? '#16A34A' : '#E7E5E4',
                backgroundColor: isFull ? '#DCFCE7' : '#FAFAF9',
                borderWidth: isFull ? 1.5 : 1,
              },
            ]}
            onPress={() => applyFloorCommandMode('full')}
          >
            <Ionicons name="checkmark-done-circle-outline" size={15} color="#15803D" />
            <Text style={[styles.crudPresetBtnText, { color: '#15803D' }]}>
              Full Access: Add + Edit + Delete (مکمل اختیار)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Individual Granular Toggles for Floor Command */}
        <View style={styles.permGridWrap}>
          <TouchableOpacity
            style={[styles.permItemCard, canView && styles.permItemCardActive]}
            onPress={() => handleToggleRolePerm(managerRole.id, 'canAccessFloorPlan', !canView)}
            activeOpacity={0.75}
          >
            <View style={styles.permItemIcon}>
              <Ionicons name="eye-outline" size={17} color={canView ? '#52171B' : '#78716C'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permItemTitle, !canView && { color: '#78716C' }]}>
                1. View Floor Command & Details (صرف تفصیلات دیکھیں)
              </Text>
              <Text style={styles.permItemDesc}>
                Allow {managerRole.name} to open Floor Command & Floor Plan to view floors, tables, sofas & cabins
              </Text>
            </View>
            <Switch
              value={canView}
              onValueChange={(v) => handleToggleRolePerm(managerRole.id, 'canAccessFloorPlan', v)}
              trackColor={{ false: '#D6D3D1', true: '#52171B' }}
              thumbColor={canView ? '#D4AF37' : '#F5F5F4'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.permItemCard, canAdd && styles.permItemCardActive]}
            onPress={() => handleToggleRolePerm(managerRole.id, 'canAddTables', !canAdd)}
            activeOpacity={0.75}
          >
            <View style={styles.permItemIcon}>
              <Ionicons name="add-circle-outline" size={17} color={canAdd ? '#15803D' : '#78716C'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permItemTitle, !canAdd && { color: '#78716C' }]}>
                2. Add New Floors, Tables & Cabins (نیا فلور یا ٹیبل ایڈ کریں)
              </Text>
              <Text style={styles.permItemDesc}>
                Allow {managerRole.name} to create new floors, add dining tables, sofas, or Arabian Majlis cabins
              </Text>
            </View>
            <Switch
              value={canAdd}
              onValueChange={(v) => handleToggleRolePerm(managerRole.id, 'canAddTables', v)}
              trackColor={{ false: '#D6D3D1', true: '#15803D' }}
              thumbColor={canAdd ? '#BBF7D0' : '#F5F5F4'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.permItemCard, canEdit && styles.permItemCardActive]}
            onPress={() => handleToggleRolePerm(managerRole.id, 'canEditTables', !canEdit)}
            activeOpacity={0.75}
          >
            <View style={styles.permItemIcon}>
              <Ionicons name="create-outline" size={17} color={canEdit ? '#1D4ED8' : '#78716C'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permItemTitle, !canEdit && { color: '#78716C' }]}>
                3. Edit Floor Details & Table Capacity (فلور اور ٹیبل ایڈٹ کریں)
              </Text>
              <Text style={styles.permItemDesc}>
                Allow {managerRole.name} to edit floor names, prefixes, color themes, table names & guest capacities
              </Text>
            </View>
            <Switch
              value={canEdit}
              onValueChange={(v) => handleToggleRolePerm(managerRole.id, 'canEditTables', v)}
              trackColor={{ false: '#D6D3D1', true: '#1D4ED8' }}
              thumbColor={canEdit ? '#BFDBFE' : '#F5F5F4'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.permItemCard, canDel && styles.permItemCardActive]}
            onPress={() => handleToggleRolePerm(managerRole.id, 'canDeleteTables', !canDel)}
            activeOpacity={0.75}
          >
            <View style={styles.permItemIcon}>
              <Ionicons name="trash-outline" size={17} color={canDel ? '#B91C1C' : '#78716C'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permItemTitle, !canDel && { color: '#78716C' }]}>
                4. Delete Floors & Tables (فلور اور ٹیبل ڈیلیٹ کریں)
              </Text>
              <Text style={styles.permItemDesc}>
                Allow {managerRole.name} to permanently delete floors, tables, sofas, or Majlis cabins
              </Text>
            </View>
            <Switch
              value={canDel}
              onValueChange={(v) => handleToggleRolePerm(managerRole.id, 'canDeleteTables', v)}
              trackColor={{ false: '#D6D3D1', true: '#B91C1C' }}
              thumbColor={canDel ? '#FECACA' : '#F5F5F4'}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const isConnected = syncInfo?.status === 'connected';

  return (
    <View style={styles.container}>
      {/* Executive Command Header Card (matches Dashboard UI) */}
      <View style={[styles.headerCard, isCompact && styles.headerCardMobile]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLogoCapsule}>
            <SultanLogo size="xs" variant="circle" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.headerTitle}>System Control & Settings</Text>
              <View style={[styles.statusBadge, isConnected ? styles.statusBadgeOnline : styles.statusBadgeOffline]}>
                <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#D97706' }]} />
                <Text style={[styles.statusBadgeText, { color: isConnected ? '#065F46' : '#92400E' }]}>
                  {isConnected ? 'LIVE SYNC' : 'OFFLINE'}
                </Text>
              </View>
              {hasUnsavedChanges && (
                <View style={styles.unsavedPill}>
                  <Text style={styles.unsavedPillText}>Unsaved Changes</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerSub}>
              Control branding, taxes, modules, users, sync server & full data backups
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {hasUnsavedChanges && (
            <TouchableOpacity style={styles.headerSecondaryBtn} onPress={handleDiscardChanges}>
              <Ionicons name="arrow-undo-outline" size={15} color="#52171B" />
              <Text style={styles.headerSecondaryBtnText}>Discard</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerSecondaryBtn}
            onPress={async () => {
              broadcastImmediately();
              const ok = await forceSyncNow();
              showToast(ok ? 'All devices synced!' : 'Broadcast sent to local network');
            }}
          >
            <Ionicons name="sync-outline" size={15} color="#52171B" />
            <Text style={styles.headerSecondaryBtnText}>Sync Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.saveBtn,
              !hasUnsavedChanges && styles.saveBtnSaved,
            ]}
            onPress={handleSaveSettings}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            <Ionicons
              name={hasUnsavedChanges ? 'save-outline' : 'checkmark-circle'}
              size={16}
              color={hasUnsavedChanges ? '#140306' : '#065F46'}
            />
            <Text
              style={[
                styles.saveBtnText,
                !hasUnsavedChanges && styles.saveBtnTextSaved,
              ]}
            >
              {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {toastMsg && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#D4AF37" />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Horizontal Tab Bar */}
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={active ? '#140306' : '#52171B'}
                />
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tab Content */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 1. GENERAL & BRANDING */}
        {activeTab === 'general' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Restaurant Identity & Receipt Header</Text>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Restaurant Name</Text>
                <TextInput
                  style={styles.input}
                  value={draft.restaurantName}
                  onChangeText={(t) => updateDraft({ restaurantName: t })}
                  placeholder="SULTAN RESTAURANT"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Tagline / Subtitle</Text>
                <TextInput
                  style={styles.input}
                  value={draft.tagline}
                  onChangeText={(t) => updateDraft({ tagline: t })}
                  placeholder="Royal Mughlai & BBQ Dining"
                />
              </View>
            </View>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Contact Phone</Text>
                <TextInput
                  style={styles.input}
                  value={draft.phone}
                  onChangeText={(t) => updateDraft({ phone: t })}
                  placeholder="0300-1234567"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>NTN / Tax Registration ID</Text>
                <TextInput
                  style={styles.input}
                  value={draft.ntnOrTaxId}
                  onChangeText={(t) => updateDraft({ ntnOrTaxId: t })}
                  placeholder="8943120-4"
                />
              </View>
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Restaurant Address</Text>
              <TextInput
                style={styles.input}
                value={draft.address}
                onChangeText={(t) => updateDraft({ address: t })}
                placeholder="Food Street, Culinary District, Lahore"
              />
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Receipt Footer Message</Text>
              <TextInput
                style={styles.input}
                value={draft.footerMessage}
                onChangeText={(t) => updateDraft({ footerMessage: t })}
                placeholder="Thank you for dining with Sultan!"
              />
            </View>

            <View style={styles.divider} />
            {renderToggleRow(
              'Show Logo on Printed Receipts',
              'Display Sultan crest at the top of thermal & A4 invoices',
              draft.showLogoOnReceipt,
              (v) => applySettingPatchImmediate({ showLogoOnReceipt: v })
            )}
            {renderToggleRow(
              'Show Feedback QR Code on Receipts',
              'Include scannable dish review & loyalty QR code at receipt bottom',
              draft.showQrOnReceipt,
              (v) => applySettingPatchImmediate({ showQrOnReceipt: v })
            )}
            {renderSaveFooter()}
          </View>
        )}

        {/* 1b. PUBLIC WEBSITE (Master Admin only) */}
        {activeTab === 'website' && isMasterAdmin && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Public Website Contact Details</Text>
            <Text style={{ fontSize: 12.5, color: '#6B5B4E', marginBottom: 14, lineHeight: 18 }}>
              Ye details restaurant ki public website par show hongi. Jo field khali chhorenge wo website par nazar nahi aayegi.
              Neeche &quot;Publish to Website&quot; dabane se website foran update ho jayegi.
            </Text>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput style={styles.input} value={draft.phone} onChangeText={(t) => updateDraft({ phone: t })} placeholder="0300-1234567" />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>WhatsApp Number</Text>
                <TextInput
                  style={styles.input}
                  value={draft.websiteWhatsapp}
                  onChangeText={(t) => updateDraft({ websiteWhatsapp: t })}
                  placeholder="923001234567 (country code ke saath)"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Restaurant Address</Text>
              <TextInput style={styles.input} value={draft.address} onChangeText={(t) => updateDraft({ address: t })} placeholder="Full street address, city" />
            </View>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Google Maps Link</Text>
                <TextInput
                  style={styles.input}
                  value={draft.websiteMapsUrl}
                  onChangeText={(t) => updateDraft({ websiteMapsUrl: t })}
                  placeholder="https://maps.app.goo.gl/..."
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Opening Hours</Text>
                <TextInput style={styles.input} value={draft.websiteHours} onChangeText={(t) => updateDraft({ websiteHours: t })} placeholder="Daily 12:00 PM - 2:00 AM" />
              </View>
            </View>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={draft.websiteEmail}
                  onChangeText={(t) => updateDraft({ websiteEmail: t })}
                  placeholder="info@sultanrestaurant.com.pk"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Instagram Link</Text>
                <TextInput
                  style={styles.input}
                  value={draft.websiteInstagram}
                  onChangeText={(t) => updateDraft({ websiteInstagram: t })}
                  placeholder="https://instagram.com/..."
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Facebook Link</Text>
                <TextInput
                  style={styles.input}
                  value={draft.websiteFacebook}
                  onChangeText={(t) => updateDraft({ websiteFacebook: t })}
                  placeholder="https://facebook.com/..."
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>TikTok Link</Text>
                <TextInput
                  style={styles.input}
                  value={draft.websiteTiktok}
                  onChangeText={(t) => updateDraft({ websiteTiktok: t })}
                  placeholder="https://tiktok.com/@..."
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Announcement Bar (optional)</Text>
              <TextInput
                style={styles.input}
                value={draft.websiteAnnouncement}
                onChangeText={(t) => updateDraft({ websiteAnnouncement: t })}
                placeholder="e.g. Grand Opening! 20% off on family platters this week"
              />
            </View>

            <View style={styles.divider} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#6B5B4E' }}>
                {draft.websitePublishedAt
                  ? `Last published: ${new Date(draft.websitePublishedAt).toLocaleString()}`
                  : 'Abhi tak website par publish nahi hua'}
              </Text>
              <TouchableOpacity
                style={[styles.saveBtn, isPublishingWebsite && { opacity: 0.6 }]}
                onPress={handlePublishWebsite}
                disabled={isPublishingWebsite}
              >
                <Ionicons name="globe-outline" size={16} color="#140306" />
                <Text style={styles.saveBtnText}>{isPublishingWebsite ? 'Publishing...' : 'Save & Publish to Website'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 2. BILLING & TAX */}
        {activeTab === 'billing' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Taxes, Charges & POS Checkout Rules</Text>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Currency Symbol</Text>
                <TextInput
                  style={styles.input}
                  value={draft.currencySymbol}
                  onChangeText={(t) => updateDraft({ currencySymbol: t })}
                  placeholder="Rs."
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Tax Label (e.g. GST Tax, VAT)</Text>
                <TextInput
                  style={styles.input}
                  value={draft.taxLabel}
                  onChangeText={(t) => updateDraft({ taxLabel: t })}
                  placeholder="GST Tax"
                />
              </View>
            </View>

            <View style={[styles.grid, isCompact && styles.gridCol]}>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Tax Rate (%)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(draft.taxRatePercent)}
                  onChangeText={(t) => updateDraft({ taxRatePercent: parseFloat(t) || 0 })}
                  placeholder="16"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Service Charge (%)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(draft.serviceChargePercent ?? 0)}
                  onChangeText={(t) => updateDraft({ serviceChargePercent: parseFloat(t) || 0 })}
                  placeholder="0"
                />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.label}>Default Delivery Fee</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(draft.deliveryFeeDefault)}
                  onChangeText={(t) => updateDraft({ deliveryFeeDefault: parseFloat(t) || 0 })}
                  placeholder="150"
                />
              </View>
            </View>

            <View style={styles.divider} />
            {renderToggleRow(
              'Enable Sales Tax (GST)',
              'Automatically apply configured tax rate on POS & table bills',
              draft.taxEnabled,
              (v) => applySettingPatchImmediate({ taxEnabled: v })
            )}
            {renderToggleRow(
              'Enable Service Charge',
              'Apply configured service charge percentage on POS & table bills',
              draft.serviceChargeEnabled,
              (v) => applySettingPatchImmediate({ serviceChargeEnabled: v })
            )}
            {renderToggleRow(
              'Round Bill Totals',
              'Round final payable amounts to nearest whole currency unit',
              draft.roundTotals,
              (v) => applySettingPatchImmediate({ roundTotals: v })
            )}
            {renderToggleRow(
              'Allow Custom Discounts on POS',
              'Permit cashiers/managers to apply ad-hoc bill discounts',
              draft.allowCustomDiscount,
              (v) => applySettingPatchImmediate({ allowCustomDiscount: v })
            )}
            {renderToggleRow(
              'Require Admin/Manager PIN to Void Invoices',
              'Prompt for PIN verification before voiding any settled invoice',
              draft.requirePinForVoid,
              (v) => applySettingPatchImmediate({ requirePinForVoid: v })
            )}
            {renderToggleRow(
              'Auto-Print Receipt on Payment',
              'Automatically trigger receipt print dialog when invoice is settled',
              draft.autoPrintReceiptOnPay,
              (v) => applySettingPatchImmediate({ autoPrintReceiptOnPay: v })
            )}
            {renderToggleRow(
              'Auto-Send Orders to KDS',
              'Dispatch kitchen/bar KOT immediately when order is placed',
              draft.autoSendKdsOnOrder,
              (v) => applySettingPatchImmediate({ autoSendKdsOnOrder: v })
            )}
            {renderSaveFooter()}
          </View>
        )}

        {/* 3. MODULES & OPERATIONS */}
        {activeTab === 'modules' && (
          <View style={{ gap: 14 }}>
            {/* Top Modules Command Summary Card */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                      Full System Modules & Option Controls
                    </Text>
                    <View style={styles.groupCountPill}>
                      <Text style={styles.groupCountPillText}>
                        {moduleStats.active} / {moduleStats.total} Options Active
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub}>
                    Enable or disable any restaurant module, screen, POS behavior or operational parameter below
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={handleResetModuleDefaults}
                  >
                    <Ionicons name="refresh-outline" size={15} color="#52171B" />
                    <Text style={styles.secondaryBtnText}>Reset Module Defaults</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleBulkAllModules(true)}
                  >
                    <Ionicons name="checkmark-done-outline" size={16} color="#140306" />
                    <Text style={styles.primaryBtnText}>Enable All Options</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.moduleSearchWrap}>
                <Ionicons name="search-outline" size={16} color="#78716C" />
                <TextInput
                  style={styles.moduleSearchInput}
                  value={moduleSearch}
                  onChangeText={setModuleSearch}
                  placeholder="Search module or option (e.g. POS, KDS, Playland, Payroll, Floor, Tax)..."
                  placeholderTextColor="#A8A29E"
                />
                {Boolean(moduleSearch.trim().length > 0) && (
                  <TouchableOpacity onPress={() => setModuleSearch('')}>
                    <Ionicons name="close-circle" size={18} color="#78716C" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Dedicated Floor Command Quick Access Card for Manager / Floor Manager */}
            {renderFloorCommandAccessCard()}

            {/* 7 Structured Module Control Cards */}
            {MODULE_CONTROL_GROUPS.map((group) => {
              const q = moduleSearch.trim().toLowerCase();
              const groupMatchesTitle =
                !q ||
                group.title.toLowerCase().includes(q) ||
                group.subtitle.toLowerCase().includes(q);
              const visibleToggles = q && !groupMatchesTitle
                ? group.toggles.filter(
                    (t) =>
                      t.label.toLowerCase().includes(q) ||
                      t.sub.toLowerCase().includes(q)
                  )
                : group.toggles;
              const visibleNumeric = q && !groupMatchesTitle
                ? (group.numericFields || []).filter((nf) =>
                    nf.label.toLowerCase().includes(q)
                  )
                : group.numericFields || [];

              if (visibleToggles.length === 0 && visibleNumeric.length === 0) {
                return null;
              }

              const activeInGroup = group.toggles.filter((t) => Boolean(draft[t.key])).length;

              return (
                <View key={group.id} style={styles.card}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 220 }}>
                      <View style={styles.permCategoryIconWrap}>
                        <Ionicons name={group.icon} size={17} color="#52171B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={[styles.sectionTitle, { marginBottom: 0, fontSize: 15 }]}>
                            {group.title}
                          </Text>
                          <View style={styles.groupCountPill}>
                            <Text style={styles.groupCountPillText}>
                              {activeInGroup}/{group.toggles.length} Active
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.rowSub}>{group.subtitle}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <TouchableOpacity
                        style={styles.groupMiniBtn}
                        onPress={() => handleBulkGroupModules(group, true)}
                      >
                        <Ionicons name="checkmark-circle-outline" size={14} color="#065F46" />
                        <Text style={[styles.groupMiniBtnText, { color: '#065F46' }]}>Enable All</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.groupMiniBtn}
                        onPress={() => handleBulkGroupModules(group, false)}
                      >
                        <Ionicons name="close-circle-outline" size={14} color="#991B1B" />
                        <Text style={[styles.groupMiniBtnText, { color: '#991B1B' }]}>Disable All</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={[styles.divider, { marginTop: 4, marginBottom: 6 }]} />

                  {visibleToggles.map((item) => {
                    const enabled = Boolean(draft[item.key]);
                    return (
                      <View key={String(item.key)} style={styles.toggleRow}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.rowTitle}>{item.label}</Text>
                            {item.isMaster && (
                              <View style={styles.coreModulePill}>
                                <Text style={styles.coreModulePillText}>CORE MODULE</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.rowSub}>{item.sub}</Text>
                        </View>
                        <Switch
                          value={enabled}
                          onValueChange={(v) => applySettingPatchImmediate({ [item.key]: v } as Partial<SystemSettings>)}
                          trackColor={{ false: '#D6D3D1', true: '#52171B' }}
                          thumbColor={enabled ? '#D4AF37' : '#F5F5F4'}
                        />
                      </View>
                    );
                  })}

                  {visibleNumeric.length > 0 && (
                    <View style={[styles.grid, isCompact && styles.gridCol, { marginTop: 12, marginBottom: 0 }]}>
                      {visibleNumeric.map((nf) => (
                        <View key={String(nf.key)} style={styles.fieldBox}>
                          <Text style={styles.label}>{nf.label}</Text>
                          <View style={styles.moduleNumericRow}>
                            <TextInput
                              style={[styles.input, { flex: 1 }]}
                              keyboardType="numeric"
                              value={String(draft[nf.key] ?? 0)}
                              onChangeText={(t) =>
                                updateDraft({ [nf.key]: parseInt(t, 10) || 0 } as Partial<SystemSettings>)
                              }
                            />
                            <View style={styles.moduleNumUnitPill}>
                              <Text style={styles.moduleNumUnitText}>{nf.unit}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.card}>{renderSaveFooter()}</View>
          </View>
        )}

        {/* 3.5 DEDICATED CRUD PERMISSIONS COMMAND CENTER */}
        {activeTab === 'crud' && (
          <View style={{ gap: 14 }}>
            {/* Top All-Roles CRUD Summary Overview Table */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1, minWidth: 230 }}>
                  <Text style={[styles.sectionTitle, { marginBottom: 2 }]}>
                    Role-Wise CRUD Permissions (View / Add / Edit / Delete)
                  </Text>
                  <Text style={styles.rowSub}>
                    Har role ke liye module-by-module View (Read), Add (Create), Edit (Update) aur Delete permissions yahan se control karein — sab devices par live sync hota hai
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={openAddRoleModal}>
                    <Ionicons name="add-circle-outline" size={15} color="#52171B" />
                    <Text style={styles.secondaryBtnText}>+ Add Role</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndSyncRoles}>
                    <Ionicons name="cloud-done-outline" size={15} color="#140306" />
                    <Text style={styles.saveBtnText}>Save & Sync All</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Scope Switcher: Manage by Role vs Individual Staff/Cashier */}
              <View style={styles.crudScopeBar}>
                <TouchableOpacity
                  style={[styles.crudScopeBtn, crudScope === 'role' && styles.crudScopeBtnActive]}
                  onPress={() => setCrudScope('role')}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={15}
                    color={crudScope === 'role' ? '#140306' : '#52171B'}
                  />
                  <Text
                    style={[
                      styles.crudScopeBtnText,
                      crudScope === 'role' && { color: '#140306' },
                    ]}
                  >
                    By Role ({roles.length} Roles)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.crudScopeBtn, crudScope === 'staff' && styles.crudScopeBtnActive]}
                  onPress={() => {
                    setCrudScope('staff');
                    setShowAllStaffInOverrides(true);
                  }}
                >
                  <Ionicons
                    name="people-outline"
                    size={15}
                    color={crudScope === 'staff' ? '#140306' : '#52171B'}
                  />
                  <Text
                    style={[
                      styles.crudScopeBtnText,
                      crudScope === 'staff' && { color: '#140306' },
                    ]}
                  >
                    Individual Staff Overrides ({(staff || []).length})
                  </Text>
                </TouchableOpacity>
              </View>

              {crudScope === 'role' && (
                <View style={{ gap: 8, marginTop: 10 }}>
                  {roles.map((role) => {
                    const isSelected = selectedRole?.id === role.id;
                    const p = role.permissions;
                    const addCnt = p.canAddRecords
                      ? MODULE_CRUD_ADD_KEYS.filter((k) => !!p[k]).length
                      : 0;
                    const editCnt = p.canEditRecords
                      ? MODULE_CRUD_EDIT_KEYS.filter((k) => !!p[k]).length
                      : 0;
                    const delCnt = p.canDeleteRecords
                      ? MODULE_CRUD_DELETE_KEYS.filter((k) => !!p[k]).length
                      : 0;
                    const totalMod = CRUD_MODULE_ROWS.length;
                    const policyLabel =
                      addCnt === totalMod && editCnt === totalMod && delCnt === totalMod
                        ? 'FULL CRUD'
                        : addCnt === 0 && editCnt === 0 && delCnt === 0
                          ? 'VIEW ONLY'
                          : delCnt === 0
                            ? 'NO DELETE'
                            : 'CUSTOM';
                    const policyBg =
                      policyLabel === 'FULL CRUD'
                        ? '#DCFCE7'
                        : policyLabel === 'VIEW ONLY'
                          ? '#F5F5F4'
                          : policyLabel === 'NO DELETE'
                            ? '#DBEAFE'
                            : '#FEF3C7';
                    const policyColor =
                      policyLabel === 'FULL CRUD'
                        ? '#15803D'
                        : policyLabel === 'VIEW ONLY'
                          ? '#57534E'
                          : policyLabel === 'NO DELETE'
                            ? '#1D4ED8'
                            : '#92400E';

                    return (
                      <TouchableOpacity
                        key={role.id}
                        style={[
                          styles.crudOverviewRow,
                          isSelected && styles.crudOverviewRowActive,
                        ]}
                        onPress={() => setSelectedRoleId(role.id)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
                          <View
                            style={[
                              styles.roleColorDot,
                              { backgroundColor: role.badgeColor || '#52171B' },
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={styles.rowTitle}>{role.name}</Text>
                              {!!role.urduName && (
                                <Text style={{ fontSize: 11, color: '#78716C', fontWeight: '600' }}>
                                  ({role.urduName})
                                </Text>
                              )}
                            </View>
                            <Text style={{ fontSize: 10.5, color: '#78716C' }}>
                              Portal: {role.baseRole.replace('_', ' ').toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <View style={[styles.crudMiniPill, { backgroundColor: addCnt > 0 ? '#DCFCE7' : '#F5F5F4' }]}>
                            <Text style={[styles.crudMiniPillText, { color: addCnt > 0 ? '#15803D' : '#78716C' }]}>
                              Add {addCnt}/{totalMod}
                            </Text>
                          </View>
                          <View style={[styles.crudMiniPill, { backgroundColor: editCnt > 0 ? '#DBEAFE' : '#F5F5F4' }]}>
                            <Text style={[styles.crudMiniPillText, { color: editCnt > 0 ? '#1D4ED8' : '#78716C' }]}>
                              Edit {editCnt}/{totalMod}
                            </Text>
                          </View>
                          <View style={[styles.crudMiniPill, { backgroundColor: delCnt > 0 ? '#FEE2E2' : '#F5F5F4' }]}>
                            <Text style={[styles.crudMiniPillText, { color: delCnt > 0 ? '#B91C1C' : '#78716C' }]}>
                              Del {delCnt}/{totalMod}
                            </Text>
                          </View>
                          <View style={[styles.crudMiniPill, { backgroundColor: policyBg }]}>
                            <Text style={[styles.crudMiniPillText, { color: policyColor }]}>
                              {policyLabel}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {crudScope === 'staff' && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.roleSelectorRow, { marginTop: 10 }]}
                >
                  {(staff || []).map((member) => {
                    const isSelected = selectedOverrideStaff?.id === member.id;
                    const overrideCount = countStaffOverrides(member);
                    const baseRole = resolveBaseRoleForStaff(member);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[
                          styles.roleSelectorCard,
                          isSelected && styles.roleSelectorCardActive,
                        ]}
                        onPress={() => setSelectedStaffPermId(member.id)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View
                            style={[
                              styles.roleColorDot,
                              { backgroundColor: baseRole?.badgeColor || '#0D9488' },
                            ]}
                          />
                          <Text style={styles.roleSelectorName}>{member.name}</Text>
                        </View>
                        <Text style={styles.roleSelectorMeta}>
                          {baseRole?.name || member.role} • {overrideCount > 0 ? `${overrideCount} custom` : 'Role default'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Dedicated Floor Command Quick Access Card for Selected Role */}
            {crudScope === 'role' && renderFloorCommandAccessCard(selectedRole)}

            {/* Selected Role CRUD Matrix Card */}
            {crudScope === 'role' && selectedRole && (
              <View style={styles.card}>
                <View style={[styles.roleBanner, { marginBottom: 14 }]}>
                  <View style={{ flex: 1, minWidth: 220 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <View
                        style={[
                          styles.roleColorDot,
                          { backgroundColor: selectedRole.badgeColor || '#52171B' },
                        ]}
                      />
                      <Text style={styles.roleBannerTitle}>
                        Editing CRUD for: {selectedRole.name}
                      </Text>
                      {!!selectedRole.urduName && (
                        <Text style={styles.roleBannerUrdu}>({selectedRole.urduName})</Text>
                      )}
                    </View>
                    <Text style={[styles.rowSub, { marginTop: 3 }]}>
                      Add/Edit/Delete ON karne par us module ki View access aur Master gate khud ON ho jate hain — koi conflict nahi hoga.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => setActiveTab('roles')}
                  >
                    <Ionicons name="shield-outline" size={14} color="#52171B" />
                    <Text style={styles.secondaryBtnText}>All Role Controls</Text>
                  </TouchableOpacity>
                </View>

                {renderCrudControlMatrix(
                  `${selectedRole.name} — Module-by-Module CRUD Matrix`,
                  'View (Read) • Add (Create) • Edit (Update) • Delete (Remove) across all 11 operational modules',
                  selectedRole.permissions,
                  (key, val) => handleToggleRolePerm(selectedRole.id, key, val),
                  (preset) => handleApplyRoleCrudPreset(selectedRole, preset),
                  (col, val) => handleBulkRoleCrudColumn(selectedRole, col, val),
                  {
                    isAdminRole: selectedRole.id === 'role-admin',
                    adminRolePerms:
                      selectedRole.id !== 'role-admin'
                        ? roles.find((r) => r.id === 'role-admin')?.permissions
                        : undefined,
                    onToggleRow: (row, enableAll) => handleToggleRoleCrudRow(selectedRole, row, enableAll),
                  }
                )}

                <View style={styles.cardFooterBar}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.footerStatusText}>
                      All CRUD toggles auto-save locally & push live to POS, Manager, Waiter & KDS terminals.
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndSyncRoles}>
                    <Ionicons name="cloud-done-outline" size={16} color="#140306" />
                    <Text style={styles.saveBtnText}>Save & Sync CRUD Permissions</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Selected Staff Individual CRUD Matrix Card */}
            {crudScope === 'staff' && selectedOverrideStaff && (() => {
              const effectivePerms = getEffectiveStaffPerms(selectedOverrideStaff);
              const baseRole = resolveBaseRoleForStaff(selectedOverrideStaff);
              return (
                <View style={styles.card}>
                  <View style={[styles.roleBanner, { marginBottom: 14 }]}>
                    <View style={{ flex: 1, minWidth: 220 }}>
                      <Text style={styles.roleBannerTitle}>
                        Individual CRUD Override: {selectedOverrideStaff.name}
                      </Text>
                      <Text style={[styles.rowSub, { marginTop: 3 }]}>
                        Base Role: {baseRole?.name || selectedOverrideStaff.role} • Sirf is staff member ke liye custom CRUD rules set karein.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => handleApplyCashierPreset(selectedOverrideStaff, 'reset')}
                    >
                      <Ionicons name="refresh-outline" size={14} color="#52171B" />
                      <Text style={styles.secondaryBtnText}>Reset to Role Default</Text>
                    </TouchableOpacity>
                  </View>

                  {renderCrudControlMatrix(
                    `${selectedOverrideStaff.name} — Individual CRUD Overrides`,
                    'Custom toggles marked with * override the base role defaults for this person only',
                    effectivePerms,
                    (key, val) => handleToggleStaffPerm(selectedOverrideStaff, key, val),
                    (preset) => handleApplyStaffCrudPreset(selectedOverrideStaff, preset),
                    (col, val) => handleBulkStaffCrudColumn(selectedOverrideStaff, col, val),
                    {
                      overrides: selectedOverrideStaff.permissionOverrides,
                      adminRolePerms: roles.find((r) => r.id === 'role-admin')?.permissions,
                      onToggleRow: (row, enableAll) =>
                        handleToggleStaffCrudRow(selectedOverrideStaff, row, enableAll),
                    }
                  )}

                  <View style={styles.cardFooterBar}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.footerStatusText}>
                        Individual CRUD overrides apply immediately and sync across all connected devices.
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndSyncRoles}>
                      <Ionicons name="cloud-done-outline" size={16} color="#140306" />
                      <Text style={styles.saveBtnText}>Save & Sync Staff CRUD</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* 4. ROLES & PERMISSIONS */}
        {activeTab === 'roles' && (
          <View style={{ gap: 14 }}>
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Roles & Full Permissions Control</Text>
                  <Text style={styles.rowSub}>
                    Select any role or create a new custom role to control every screen, action & data visibility
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() =>
                      askConfirm(
                        'Reset Roles to Defaults',
                        'Restore default permissions for built-in system roles?',
                        () => {
                          resetToDefaultRoles();
                          broadcastImmediately();
                          showToast('Default role permissions restored');
                        }
                      )
                    }
                  >
                    <Ionicons name="refresh-outline" size={15} color="#52171B" />
                    <Text style={styles.secondaryBtnText}>Reset Defaults</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={openAddRoleModal}>
                    <Ionicons name="add-circle-outline" size={16} color="#140306" />
                    <Text style={styles.primaryBtnText}>Add New Role</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.roleSelectorRow}
              >
                {roles.map((role) => {
                  const isSelected = selectedRole?.id === role.id;
                  const enabledCount = countEnabledPerms(role.permissions);
                  return (
                    <TouchableOpacity
                      key={role.id}
                      style={[
                        styles.roleSelectorCard,
                        isSelected && styles.roleSelectorCardActive,
                      ]}
                      onPress={() => setSelectedRoleId(role.id)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={[
                            styles.roleColorDot,
                            { backgroundColor: role.badgeColor || '#52171B' },
                          ]}
                        />
                        <Text
                          style={[
                            styles.roleSelectorName,
                            isSelected && { color: '#140306' },
                          ]}
                        >
                          {role.name}
                        </Text>
                        <View
                          style={[
                            styles.roleKindBadge,
                            role.isSystem ? styles.roleKindSystem : styles.roleKindCustom,
                          ]}
                        >
                          <Text style={styles.roleKindText}>
                            {role.isSystem ? 'SYSTEM' : 'CUSTOM'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.roleSelectorMeta}>
                        {enabledCount} / {ALL_PERMISSION_KEYS.length} permissions enabled
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {selectedRole && renderFloorCommandAccessCard(selectedRole)}

            {selectedRole && (
              <View style={styles.card}>
                <View style={styles.roleBanner}>
                  <View style={{ flex: 1, minWidth: 220 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <View
                        style={[
                          styles.roleColorDot,
                          { backgroundColor: selectedRole.badgeColor || '#52171B' },
                        ]}
                      />
                      <Text style={styles.roleBannerTitle}>{selectedRole.name}</Text>
                      {!!selectedRole.urduName && (
                        <Text style={styles.roleBannerUrdu}>({selectedRole.urduName})</Text>
                      )}
                      <View style={styles.rolePortalTag}>
                        <Text style={styles.rolePortalTagText}>
                          Portal: {selectedRole.baseRole.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.rowSub, { marginTop: 4 }]}>
                      {selectedRole.description || 'Custom system access profile'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => handleBulkRolePerms(selectedRole, true)}
                    >
                      <Ionicons name="checkmark-done-outline" size={15} color="#065F46" />
                      <Text style={[styles.secondaryBtnText, { color: '#065F46' }]}>Grant All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => handleBulkRolePerms(selectedRole, false)}
                    >
                      <Ionicons name="close-circle-outline" size={15} color="#B45309" />
                      <Text style={[styles.secondaryBtnText, { color: '#B45309' }]}>Revoke All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => openEditRoleModal(selectedRole)}
                    >
                      <Ionicons name="create-outline" size={15} color="#52171B" />
                      <Text style={styles.secondaryBtnText}>Edit Info</Text>
                    </TouchableOpacity>
                    {!selectedRole.isSystem && selectedRole.id !== 'role-admin' && (
                      <TouchableOpacity
                        style={[styles.secondaryBtn, { borderColor: '#DC2626', backgroundColor: '#FEF2F2' }]}
                        onPress={() =>
                          askConfirm(
                            'Delete Role',
                            `Permanently delete custom role "${selectedRole.name}"?`,
                            () => {
                              const ok = deleteRole(selectedRole.id);
                              if (ok) {
                                setSelectedRoleId('role-manager');
                                broadcastImmediately();
                                showToast(`Deleted role "${selectedRole.name}"`);
                              }
                            }
                          )
                        }
                      >
                        <Ionicons name="trash-outline" size={15} color="#DC2626" />
                        <Text style={[styles.secondaryBtnText, { color: '#DC2626' }]}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={{ gap: 14, marginTop: 14 }}>
                  {renderPermissionCategory(
                    '1. Financial & Sensitive Data Visibility',
                    'Control whether revenue totals, food cost margins, customer phone numbers, and report exports are visible',
                    'eye-outline',
                    VISIBILITY_PERMS,
                    selectedRole
                  )}

                  {renderPermissionCategory(
                    '2. Module & Screen Access (Sidebar & Routes)',
                    'Enable or restrict which screens and modules this role can open across the system',
                    'apps-outline',
                    MODULE_PERMS,
                    selectedRole
                  )}

                  {renderPermissionCategory(
                    '3. Operational & Transaction Authority',
                    'Critical actions including discounts, invoice voids, refunds, shift closing, and menu pricing',
                    'flash-outline',
                    AUTHORITY_PERMS,
                    selectedRole
                  )}

                  {renderPermissionCategory(
                    '4. POS Terminal Action Controls (Order Types, Billing, KOT & Tables)',
                    'Granular control over Dine-In, Takeaway, Delivery, KOT dispatch, bill settlement, table release & split payments in POS',
                    'calculator-outline',
                    POS_TERMINAL_PERMS,
                    selectedRole
                  )}

                  {renderCrudControlMatrix(
                    '5. Add, Edit & Delete (CRUD) Control Management',
                    'Master locks plus module-by-module control over who can View, Create/Add, Edit/Update, or Delete records',
                    selectedRole.permissions,
                    (key, val) => handleToggleRolePerm(selectedRole.id, key, val),
                    (preset) => handleApplyRoleCrudPreset(selectedRole, preset),
                    (col, val) => handleBulkRoleCrudColumn(selectedRole, col, val),
                    {
                      isAdminRole: selectedRole.id === 'role-admin',
                      adminRolePerms:
                        selectedRole.id !== 'role-admin'
                          ? roles.find((r) => r.id === 'role-admin')?.permissions
                          : undefined,
                      onToggleRow: (row, enableAll) => handleToggleRoleCrudRow(selectedRole, row, enableAll),
                    }
                  )}
                </View>

                <View style={styles.cardFooterBar}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.footerStatusText}>
                      Changes apply automatically to matching staff. Click Save & Sync to push immediately to all devices.
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndSyncRoles}>
                    <Ionicons name="cloud-done-outline" size={16} color="#140306" />
                    <Text style={styles.saveBtnText}>Save & Sync Roles</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* PER-CASHIER & INDIVIDUAL POS PERMISSION CONTROL */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1, minWidth: 240 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                      Per-Cashier & Individual POS Control
                    </Text>
                    <View style={styles.groupCountPill}>
                      <Text style={styles.groupCountPillText}>
                        {cashierStaffList.length} {cashierStaffList.length === 1 ? 'Cashier' : 'Cashiers'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rowSub}>
                    If multiple cashiers exist, select any cashier individually to customize their POS Terminal actions & module permissions separately
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => setShowAllStaffInOverrides((prev) => !prev)}
                  >
                    <Ionicons name="people-outline" size={15} color="#52171B" />
                    <Text style={styles.secondaryBtnText}>
                      {showAllStaffInOverrides ? 'Cashiers Only' : `All Staff (${(staff || []).length})`}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={openAddCashierModal}>
                    <Ionicons name="person-add-outline" size={15} color="#140306" />
                    <Text style={styles.primaryBtnText}>Add New Cashier</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {staffForOverrideList.length === 0 ? (
                <View style={[styles.roleBanner, { justifyContent: 'center', paddingVertical: 20 }]}>
                  <Text style={styles.rowSub}>
                    No Cashiers found yet. Click "Add New Cashier" above to create Cashier accounts.
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.roleSelectorRow}
                  >
                    {staffForOverrideList.map((member) => {
                      const isSelected = selectedOverrideStaff?.id === member.id;
                      const overrideCount = countStaffOverrides(member);
                      const baseRole = resolveBaseRoleForStaff(member);
                      return (
                        <TouchableOpacity
                          key={member.id}
                          style={[
                            styles.roleSelectorCard,
                            isSelected && styles.roleSelectorCardActive,
                          ]}
                          onPress={() => setSelectedStaffPermId(member.id)}
                          activeOpacity={0.8}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View
                              style={[
                                styles.roleColorDot,
                                { backgroundColor: baseRole?.badgeColor || '#0D9488' },
                              ]}
                            />
                            <Text
                              style={[
                                styles.roleSelectorName,
                                isSelected && { color: '#140306' },
                              ]}
                            >
                              {member.name}
                            </Text>
                            <View
                              style={[
                                styles.roleKindBadge,
                                overrideCount > 0 ? styles.roleKindCustom : styles.roleKindSystem,
                              ]}
                            >
                              <Text style={styles.roleKindText}>
                                {overrideCount > 0 ? `${overrideCount} CUSTOM` : 'DEFAULT'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.roleSelectorMeta}>
                            {baseRole?.name || member.role} • {member.shift} Shift • {member.hasSystemAccess === false || !(member.pin && member.pin.trim()) ? 'Login Denied' : `PIN: ${member.pin}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {selectedOverrideStaff && (() => {
                    const effectivePerms = getEffectiveStaffPerms(selectedOverrideStaff);
                    const baseRole = resolveBaseRoleForStaff(selectedOverrideStaff);
                    const overrideCount = countStaffOverrides(selectedOverrideStaff);
                    const posEnabledCount = POS_TERMINAL_PERMS.filter((p) => !!effectivePerms[p.key]).length;
                    return (
                      <View style={{ marginTop: 14 }}>
                        <View style={styles.roleBanner}>
                          <View style={{ flex: 1, minWidth: 230 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <Text style={styles.roleBannerTitle}>{selectedOverrideStaff.name}</Text>
                              <View style={styles.rolePortalTag}>
                                <Text style={styles.rolePortalTagText}>
                                  {baseRole?.name || selectedOverrideStaff.role} • {selectedOverrideStaff.shift} Shift
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.groupCountPill,
                                  overrideCount === 0 && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.groupCountPillText,
                                    overrideCount === 0 && { color: '#065F46' },
                                  ]}
                                >
                                  {overrideCount > 0
                                    ? `${overrideCount} Individual Overrides Active`
                                    : `Following ${baseRole?.name || 'Cashier'} Defaults`}
                                  {' • '}POS {posEnabledCount}/{POS_TERMINAL_PERMS.length}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.rowSub, { marginTop: 4 }]}>
                              Toggles below apply specifically to {selectedOverrideStaff.name} without affecting other Cashiers.
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            <TouchableOpacity
                              style={styles.groupMiniBtn}
                              onPress={() => handleApplyCashierPreset(selectedOverrideStaff, 'full_pos')}
                            >
                              <Ionicons name="checkmark-done-outline" size={14} color="#065F46" />
                              <Text style={[styles.groupMiniBtnText, { color: '#065F46' }]}>Full POS Access</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.groupMiniBtn}
                              onPress={() => handleApplyCashierPreset(selectedOverrideStaff, 'billing_only')}
                            >
                              <Ionicons name="cash-outline" size={14} color="#52171B" />
                              <Text style={[styles.groupMiniBtnText, { color: '#52171B' }]}>Billing Only</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.groupMiniBtn}
                              onPress={() => handleApplyCashierPreset(selectedOverrideStaff, 'order_only')}
                            >
                              <Ionicons name="receipt-outline" size={14} color="#B45309" />
                              <Text style={[styles.groupMiniBtnText, { color: '#B45309' }]}>Order Punch Only</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.groupMiniBtn}
                              onPress={() => handleApplyCashierPreset(selectedOverrideStaff, 'reset')}
                            >
                              <Ionicons name="refresh-outline" size={14} color="#44403C" />
                              <Text style={[styles.groupMiniBtnText, { color: '#44403C' }]}>Reset Default</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={{ gap: 14, marginTop: 14 }}>
                          {renderPermissionGrid(
                            `POS Terminal Controls for ${selectedOverrideStaff.name}`,
                            'Allow or restrict specific POS billing buttons, order types, KOT dispatch, table release & split payments',
                            'calculator-outline',
                            POS_TERMINAL_PERMS,
                            effectivePerms,
                            (key, val) => handleToggleStaffPerm(selectedOverrideStaff, key, val),
                            { overrides: selectedOverrideStaff.permissionOverrides }
                          )}

                          {renderCrudControlMatrix(
                            `Add / Edit / Delete Controls for ${selectedOverrideStaff.name}`,
                            'Override Master or Module View, Add, Edit, and Delete rights specifically for this staff member',
                            effectivePerms,
                            (key, val) => handleToggleStaffPerm(selectedOverrideStaff, key, val),
                            (preset) => handleApplyStaffCrudPreset(selectedOverrideStaff, preset),
                            (col, val) => handleBulkStaffCrudColumn(selectedOverrideStaff, col, val),
                            {
                              overrides: selectedOverrideStaff.permissionOverrides,
                              adminRolePerms: roles.find((r) => r.id === 'role-admin')?.permissions,
                              onToggleRow: (row, enableAll) =>
                                handleToggleStaffCrudRow(selectedOverrideStaff, row, enableAll),
                            }
                          )}

                          {renderPermissionGrid(
                            `Operational Authority for ${selectedOverrideStaff.name}`,
                            'Control custom discounts, voiding settled invoices, processing refunds, shift close & menu pricing',
                            'flash-outline',
                            AUTHORITY_PERMS,
                            effectivePerms,
                            (key, val) => handleToggleStaffPerm(selectedOverrideStaff, key, val),
                            { overrides: selectedOverrideStaff.permissionOverrides }
                          )}

                          {renderPermissionGrid(
                            `Financial Visibility for ${selectedOverrideStaff.name}`,
                            'Control revenue figures, food costs, customer phone visibility & report exports for this cashier',
                            'eye-outline',
                            VISIBILITY_PERMS,
                            effectivePerms,
                            (key, val) => handleToggleStaffPerm(selectedOverrideStaff, key, val),
                            { overrides: selectedOverrideStaff.permissionOverrides }
                          )}

                          {renderPermissionGrid(
                            `Module & Screen Access for ${selectedOverrideStaff.name}`,
                            'Enable or hide individual sidebar modules and screens specifically for this staff member',
                            'apps-outline',
                            MODULE_PERMS,
                            effectivePerms,
                            (key, val) => handleToggleStaffPerm(selectedOverrideStaff, key, val),
                            { overrides: selectedOverrideStaff.permissionOverrides }
                          )}
                        </View>

                        <View style={styles.cardFooterBar}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.footerStatusText}>
                              Per-cashier permissions update live and sync across POS counters & tablets.
                            </Text>
                          </View>
                          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndSyncRoles}>
                            <Ionicons name="cloud-done-outline" size={16} color="#140306" />
                            <Text style={styles.saveBtnText}>Save & Sync Cashier Perms</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })()}
                </>
              )}
            </View>
          </View>
        )}

        {/* 5. USERS & STAFF */}
        {activeTab === 'users' && (
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Users & Staff Accounts</Text>
                <Text style={styles.rowSub}>
                  Logged in as: {currentUser?.name || 'Admin'} ({currentUser?.role || 'admin'})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setActiveTab('crud')}
                >
                  <Ionicons name="key-outline" size={15} color="#52171B" />
                  <Text style={styles.secondaryBtnText}>CRUD Permissions</Text>
                </TouchableOpacity>
                {canAddStaff && (
                  <>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={openAddCashierModal}
                    >
                      <Ionicons name="calculator-outline" size={15} color="#52171B" />
                      <Text style={styles.secondaryBtnText}>+ Add Cashier</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryBtn} onPress={openAddUserModal}>
                      <Ionicons name="person-add-outline" size={15} color="#140306" />
                      <Text style={styles.primaryBtnText}>Add User</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>

            {/* Concurrent Device & Login Security Panel */}
            <View style={styles.deviceSecurityCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={styles.deviceSecurityIconBox}>
                    <Ionicons name="phone-portrait-outline" size={18} color="#D5A943" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deviceSecurityTitle}>
                      Staff Multi-Device & Concurrent Session Limit (ڈیوائس لاگ ان کنٹرول)
                    </Text>
                    <Text style={styles.deviceSecuritySubtitle}>
                      ایک اکاؤنٹ سے بیک وقت لاگ ان کی حد۔ نئی ڈیوائس لاگ ان ہونے پر پچھلی ڈیوائس خود بخود لاگ آؤٹ ہو جاتی ہے۔
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <View style={[styles.badge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1 }]}>
                    <Text style={[styles.badgeText, { color: '#065F46' }]}>
                      {activeStaffSessions.length} Terminals Active
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#DC2626',
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 8,
                    }}
                    onPress={() => {
                      askConfirm(
                        'Logout All Logged-In Users',
                        'Kya aap waqai tamam PCs aur Tablets par logged-in users ko 1 click me logout karna chahte hain?\n\nAapka apna Master Admin session active rahega, baqi sab devices foran logout ho jayengi.',
                        async () => {
                          const kickReason = 'Master Admin نے تمام صارفین کو لاگ آؤٹ کر دیا ہے';
                          const mySessionId = currentAuthUser?.sessionId || undefined;
                          const localKicked = terminateAllStaffSessions(mySessionId, DEVICE_ID, kickReason);
                          const baseUrl = getActiveServerHttpUrl();
                          let serverKicked = localKicked;
                          if (baseUrl) {
                            try {
                              const res = await fetch(`${baseUrl}/api/auth/staff-session/kick-all`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  exceptSessionId: mySessionId,
                                  exceptDeviceId: DEVICE_ID,
                                  reason: kickReason,
                                }),
                              });
                              const data = await res.json().catch(() => null);
                              if (data && typeof data.kickedCount === 'number') {
                                serverKicked = Math.max(serverKicked, data.kickedCount);
                              }
                            } catch {}
                          }
                          broadcastImmediately();
                          showToast(
                            serverKicked > 0
                              ? `All ${serverKicked} logged-in user(s) logged out across all devices!`
                              : 'Logout All signal sent to all connected PCs & Tablets!'
                          );
                        }
                      );
                    }}
                  >
                    <Ionicons name="power-outline" size={14} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                      Logout All Users (سب لاگ آؤٹ)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Global Default Setting */}
              <View style={styles.deviceLimitRow}>
                <Text style={styles.deviceLimitLabel}>
                  Default Device Limit Per Account (ہر لاگ ان آئی ڈی کی ڈیفالٹ حد — ہر اکاؤنٹ الگ اور خود مختار):
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {[
                    { val: 1, label: '1 Device (Default)' },
                    { val: 2, label: '2 Devices' },
                    { val: 3, label: '3 Devices' },
                    { val: 5, label: '5 Devices' },
                    { val: 999, label: 'Unlimited (لا محدود)' },
                  ].map((opt) => {
                    const isSelected = (draft.defaultMaxDevicesPerStaff ?? 1) === opt.val;
                    return (
                      <TouchableOpacity
                        key={opt.val}
                        style={[styles.devicePill, isSelected && styles.devicePillActive]}
                        onPress={() => {
                          applySettingPatchImmediate({ defaultMaxDevicesPerStaff: opt.val });
                          showToast(`Default device limit set to: ${opt.label}`);
                        }}
                      >
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'radio-button-off'}
                          size={13}
                          color={isSelected ? '#52171B' : '#64748B'}
                        />
                        <Text style={[styles.devicePillText, isSelected && styles.devicePillTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Auto-Logout Previous Device Toggle */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: '#E2E8F0',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deviceLimitLabel}>
                      Auto-Logout Previous Device on New Login (نئی ڈیوائس پر لاگ ان ہو تو پرانی خود لاگ آؤٹ)
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      ON: Same ID & PIN doosri device par login ho to pehli device auto-logout ho jati hai. OFF: 2nd device block ho jati hai. Doosre users aur Master par koi asar nahi padta.
                    </Text>
                  </View>
                  <Switch
                    value={draft.autoKickPreviousDevice !== false}
                    onValueChange={(val) => {
                      applySettingPatchImmediate({ autoKickPreviousDevice: val });
                      showToast(
                        val
                          ? 'Auto-Logout Previous Device enabled (Default)'
                          : 'Strict Block mode enabled (2nd device blocked)'
                      );
                    }}
                    trackColor={{ false: '#CBD5E1', true: '#D4AF37' }}
                    thumbColor={draft.autoKickPreviousDevice !== false ? '#52171B' : '#F8FAFC'}
                  />
                </View>
              </View>

              {/* Live Connected Sessions Monitor */}
              {activeStaffSessions.length > 0 && (
                <View style={styles.activeSessionsContainer}>
                  <Text style={styles.activeSessionsHeader}>
                    Live Active Terminals (فی الوقت لاگ ان ڈیوائسز):
                  </Text>
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {activeStaffSessions.map((sess) => (
                      <View key={sess.sessionId} style={styles.activeSessionItem}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.activeSessionStaffName}>{sess.staffName}</Text>
                            {sess.username ? (
                              <View style={[styles.badge, { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1 }]}>
                                <Text style={[styles.badgeText, { fontSize: 10, color: '#92400E' }]}>@{sess.username}</Text>
                              </View>
                            ) : null}
                            <View style={[styles.badge, styles.badgeGray, { paddingHorizontal: 6, paddingVertical: 1 }]}>
                              <Text style={[styles.badgeText, { fontSize: 10 }]}>{sess.role}</Text>
                            </View>
                          </View>
                          <Text style={styles.activeSessionMeta}>
                            Terminal: {sess.deviceName || 'Device'} • Platform: {sess.platform} • Logged in: {new Date(sess.loginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.kickBtn}
                          onPress={() => {
                            askConfirm(
                              'Terminate Device',
                              `Kick "${sess.staffName}" from ${sess.deviceName || 'this device'}? Only this account session will be logged out instantly.`,
                              () => {
                                const kickReason = 'Admin نے سیشن کک کر دیا';
                                terminateStaffSession(sess.sessionId, kickReason);
                                const baseUrl = getActiveServerHttpUrl();
                                if (baseUrl) {
                                  fetch(`${baseUrl}/api/auth/staff-session/kick`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      sessionId: sess.sessionId,
                                      reason: kickReason,
                                    }),
                                  }).catch(() => {});
                                }
                                broadcastImmediately();
                                showToast(`Terminated session on ${sess.deviceName || 'device'}`);
                              }
                            );
                          }}
                        >
                          <Ionicons name="exit-outline" size={13} color="#DC2626" />
                          <Text style={styles.kickBtnText}>Kick / Logout</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <TextInput
              style={[styles.input, { marginBottom: 12 }]}
              placeholder="Search users by name, role or phone..."
              value={userSearch}
              onChangeText={setUserSearch}
            />

            {filteredStaff.map((member) => {
              const isActive = member.status === 'Active';
              const assignedRole =
                roles.find((r) => r.id === member.customRoleId) ||
                roles.find(
                  (r) =>
                    r.name.toLowerCase() === (member.role || '').toLowerCase() ||
                    r.baseRole === (member.role || '').toLowerCase()
                );
              const isLoginDenied =
                member.hasSystemAccess === false || !(member.pin && member.pin.trim().length > 0);
              return (
                <View key={member.id} style={styles.userRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={styles.rowTitle}>{member.name}</Text>
                      <View style={[styles.badge, isActive ? styles.badgeGreen : styles.badgeGray]}>
                        <Text style={styles.badgeText}>{isActive ? 'ACTIVE' : 'DISABLED'}</Text>
                      </View>
                      {isLoginDenied ? (
                        <View style={[styles.badge, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          <Ionicons name="ban-outline" size={11} color="#DC2626" />
                          <Text style={[styles.badgeText, { color: '#DC2626' }]}>
                            LOGIN DENIED
                          </Text>
                        </View>
                      ) : (() => {
                        const activeDevCount = activeStaffSessions.filter(
                          (s) => s.staffId && s.staffId === member.id
                        ).length;
                        const limitText =
                          member.maxConcurrentDevices && member.maxConcurrentDevices > 0
                            ? member.maxConcurrentDevices >= 999
                              ? 'Unlimited Devices'
                              : `${member.maxConcurrentDevices} Dev Limit`
                            : `Default (${(draft.defaultMaxDevicesPerStaff ?? 1) >= 999 ? 'Unlimited' : `${draft.defaultMaxDevicesPerStaff ?? 1} Dev`})`;
                        return (
                          <>
                            <View style={[styles.badge, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' }]}>
                              <Ionicons name="phone-portrait-outline" size={11} color="#52171B" />
                              <Text style={[styles.badgeText, { color: '#334155' }]}>
                                {limitText}
                              </Text>
                            </View>
                            {activeDevCount > 0 && (
                              <View style={[styles.badge, { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' }]}>
                                <Text style={[styles.badgeText, { color: '#065F46' }]}>
                                  {activeDevCount} ACTIVE
                                </Text>
                              </View>
                            )}
                          </>
                        );
                      })()}
                      {assignedRole && (
                        <TouchableOpacity
                          style={[styles.badge, { backgroundColor: '#FAF6EE', borderWidth: 1, borderColor: '#D4AF37' }]}
                          onPress={() => {
                            setSelectedRoleId(assignedRole.id);
                            setActiveTab('roles');
                          }}
                        >
                          <Text style={[styles.badgeText, { color: '#52171B' }]}>
                            {assignedRole.name} ({countEnabledPerms(assignedRole.permissions)} perms)
                          </Text>
                        </TouchableOpacity>
                      )}
                      {countStaffOverrides(member) > 0 && (
                        <View style={[styles.badge, { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' }]}>
                          <Text style={[styles.badgeText, { color: '#92400E' }]}>
                            {countStaffOverrides(member)} CUSTOM POS OVERRIDES
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowSub}>
                      {isLoginDenied
                        ? `No Login ID / PIN (Login Denied) • Role: ${(assignedRole?.name || member.role).toUpperCase()} • Shift: ${member.shift}`
                        : `${member.username ? `Login ID: @${member.username} • ` : ''}Role: ${(assignedRole?.name || member.role).toUpperCase()} • PIN: ${member.pin} • Shift: ${member.shift}`}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={styles.staffPermBtn}
                      onPress={() => {
                        setSelectedStaffPermId(member.id);
                        if (!isCashierStaff(member)) {
                          setShowAllStaffInOverrides(true);
                        }
                        setActiveTab('roles');
                      }}
                    >
                      <Ionicons name="key-outline" size={14} color="#52171B" />
                      <Text style={styles.staffPermBtnText}>POS & Perms</Text>
                    </TouchableOpacity>
                    {canEditStaff && (
                      <>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => {
                            updateStaff(member.id, {
                              status: isActive ? 'Inactive' : 'Active',
                            });
                            broadcastImmediately();
                            showToast(`${member.name} ${isActive ? 'disabled' : 'activated'}`);
                          }}
                        >
                          <Ionicons
                            name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                            size={18}
                            color="#52171B"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => openEditUserModal(member)}>
                          <Ionicons name="create-outline" size={18} color="#B48214" />
                        </TouchableOpacity>
                      </>
                    )}
                    {canDeleteStaff && (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() =>
                          askConfirm(
                            'Delete User',
                            `Remove "${member.name}" from staff?`,
                            () => {
                              deleteStaff(member.id);
                              broadcastImmediately();
                              showToast(`Removed ${member.name}`);
                            }
                          )
                        }
                      >
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 5. SYNC & SERVER */}
        {activeTab === 'sync' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>LAN Hub & Cloud Synchronization</Text>

            <View style={styles.statGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Status</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: syncInfo?.status === 'connected' ? '#059669' : '#D97706' },
                  ]}
                >
                  {(syncInfo?.status || 'offline').toUpperCase()}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Device ID</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {syncInfo?.deviceId || 'N/A'}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Synced Events</Text>
                <Text style={styles.statValue}>{syncInfo?.totalSyncedEvents ?? 0}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Last Synced</Text>
                <Text style={styles.statValue}>
                  {syncInfo?.lastSyncedAt
                    ? new Date(syncInfo.lastSyncedAt).toLocaleTimeString()
                    : 'Never'}
                </Text>
              </View>
            </View>

            <View style={styles.fieldBoxFull}>
              <Text style={styles.label}>Central POS Server IP / URL</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={serverIpInput}
                  onChangeText={setServerIpInput}
                  placeholder="192.168.100.3 or https://..."
                />
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={async () => {
                    await setCustomServerIp(serverIpInput.trim());
                    reconnect();
                    showToast('Server IP updated & reconnecting...');
                  }}
                >
                  <Text style={styles.primaryBtnText}>Save & Connect</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />
            {renderToggleRow(
              'Auto-Sync Across Devices',
              'Automatically broadcast state changes to tablets & kitchen displays',
              draft.autoSyncEnabled,
              (v) => applySettingPatchImmediate({ autoSyncEnabled: v })
            )}
            {renderToggleRow(
              'Cloud Backup Sync',
              'Mirror live operational state to Firebase cloud backup when online',
              draft.cloudBackupEnabled,
              (v) => applySettingPatchImmediate({ cloudBackupEnabled: v })
            )}
            {renderSaveFooter()}
          </View>
        )}

        {/* 6. DATA & BACKUP */}
        {activeTab === 'data' && (
          <View style={{ gap: 14 }}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Live System Database Overview</Text>
              <View style={styles.statGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Menu Items</Text>
                  <Text style={styles.statValue}>{menuItems.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Tables</Text>
                  <Text style={styles.statValue}>{tables.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Active Tickets</Text>
                  <Text style={styles.statValue}>{tickets.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Invoices</Text>
                  <Text style={styles.statValue}>{invoices.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Customers</Text>
                  <Text style={styles.statValue}>{customers.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Staff / Roles</Text>
                  <Text style={styles.statValue}>
                    {staff.length} / {roles.length}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleExportBackup}>
                  <Ionicons name="download-outline" size={16} color="#140306" />
                  <Text style={styles.primaryBtnText}>Export Full Backup (JSON)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setRestoreModalVisible(true)}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#52171B" />
                  <Text style={styles.secondaryBtnText}>Restore from Backup</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.card, { borderColor: '#FCA5A5' }]}>
              <Text style={[styles.sectionTitle, { color: '#991B1B' }]}>
                System Maintenance & Data Reset Controls
              </Text>

              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Clear Active Tickets & Release Tables',
                      'This will clear all open tickets and mark every table as Available across all devices.',
                      () => {
                        const count = clearAllActiveTicketsAndReleaseTables();
                        showToast(`Cleared ${count} tickets & released all tables`);
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Clear Active Tickets & Release All Tables</Text>
                    <Text style={styles.rowSub}>Fixes stuck occupied tables across POS & Tablets</Text>
                  </View>
                  <Ionicons name="refresh-circle-outline" size={22} color="#B45309" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Clear Invoices & Sales History',
                      'Permanently delete all saved invoices and online order records?',
                      () => {
                        const count = clearSalesAndInvoices();
                        showToast(`Cleared ${count} invoices`);
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Clear Sales & Invoices History</Text>
                    <Text style={styles.rowSub}>Keeps menu, staff, tables and settings intact</Text>
                  </View>
                  <Ionicons name="receipt-outline" size={22} color="#DC2626" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Clear Customer CRM',
                      'Delete all saved customer CRM profiles?',
                      () => {
                        const count = clearCustomerCrm();
                        showToast(`Cleared ${count} customers`);
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Clear Customer CRM Database</Text>
                    <Text style={styles.rowSub}>Removes all customer phone & loyalty records</Text>
                  </View>
                  <Ionicons name="person-remove-outline" size={22} color="#DC2626" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Reset Menu to Factory Defaults',
                      'Restore default Sultan Restaurant menu items and categories?',
                      () => {
                        resetMenuToFactoryDefaults();
                        showToast('Menu reset to factory defaults');
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Reset Menu Catalog to Defaults</Text>
                    <Text style={styles.rowSub}>Restores original Sultan menu items & categories</Text>
                  </View>
                  <Ionicons name="restaurant-outline" size={22} color="#B45309" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dangerRowBtn}
                  onPress={() =>
                    askConfirm(
                      'Reset Roles & System Settings',
                      'Restore default role permissions and default system settings?',
                      () => {
                        resetToDefaultRoles();
                        resetSettingsToDefaults();
                        const reset = useSettingsStore.getState().settings;
                        prevSettingsRef.current = reset;
                        setDraft({ ...reset });
                        broadcastImmediately();
                        showToast('Roles & settings reset to defaults');
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>Reset Roles & Settings to Defaults</Text>
                    <Text style={styles.rowSub}>Restores default permissions, tax (16%) & branding</Text>
                  </View>
                  <Ionicons name="settings-outline" size={22} color="#B45309" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dangerRowBtn, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}
                  onPress={() =>
                    askConfirm(
                      'FULL OPERATIONAL RESET',
                      'This clears all tickets, tables, invoices, shifts, and reservations across all devices. Staff, Menu, and Settings remain.',
                      () => {
                        resetAllOperationalData();
                        showToast('Full operational data reset complete');
                      }
                    )
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dangerTitle, { color: '#991B1B' }]}>
                      Full Operational Data Reset
                    </Text>
                    <Text style={styles.rowSub}>
                      Clears all tickets, tables, invoices, shifts & reservations
                    </Text>
                  </View>
                  <Ionicons name="nuclear-outline" size={22} color="#991B1B" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit User Modal */}
      <Modal visible={userModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '92%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>
                {editingStaff ? 'Edit Staff / User' : 'Add New Staff / User'}
              </Text>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} value={uName} onChangeText={setUName} placeholder="Order Taker 1 / Ali Raza" />
              <Text style={[styles.label, { marginTop: 10 }]}>Phone</Text>
              <TextInput style={styles.input} value={uPhone} onChangeText={setUPhone} placeholder="0300-1234567" />

              {(() => {
                const isMasterAccount =
                  editingStaff?.id === 'st-master' ||
                  (editingStaff?.username || '').trim().toLowerCase() === 'master';
                return (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.label}>
                      System Login Access (سسٹم لاگ ان رسائی)
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        style={[
                          styles.chip,
                          {
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            paddingVertical: 10,
                          },
                          uHasSystemAccess && {
                            backgroundColor: '#065F46',
                            borderColor: '#065F46',
                          },
                        ]}
                        onPress={() => setUHasSystemAccess(true)}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={16}
                          color={uHasSystemAccess ? '#FFFFFF' : '#065F46'}
                        />
                        <Text
                          style={[
                            styles.chipText,
                            uHasSystemAccess && { color: '#FFFFFF', fontWeight: '800' },
                          ]}
                        >
                          Allow Login (لاگ ان آن)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={isMasterAccount}
                        style={[
                          styles.chip,
                          {
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            paddingVertical: 10,
                            opacity: isMasterAccount ? 0.45 : 1,
                          },
                          !uHasSystemAccess && {
                            backgroundColor: '#DC2626',
                            borderColor: '#DC2626',
                          },
                        ]}
                        onPress={() => {
                          if (isMasterAccount) return;
                          setUHasSystemAccess(false);
                          setUUsername('');
                          setUPin('');
                          setUMaxDevices(0);
                        }}
                      >
                        <Ionicons
                          name="ban-outline"
                          size={16}
                          color={!uHasSystemAccess ? '#FFFFFF' : '#DC2626'}
                        />
                        <Text
                          style={[
                            styles.chipText,
                            !uHasSystemAccess
                              ? { color: '#FFFFFF', fontWeight: '800' }
                              : { color: '#DC2626' },
                          ]}
                        >
                          Login Denied (لاگ ان بند)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

              {!uHasSystemAccess ? (
                <View
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: '#FEF2F2',
                    borderWidth: 1,
                    borderColor: '#FCA5A5',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <Ionicons name="lock-closed-outline" size={18} color="#DC2626" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#991B1B' }}>
                      Login Denied — No Login ID / No PIN
                    </Text>
                    <Text style={{ fontSize: 12, color: '#7F1D1D', marginTop: 2 }}>
                      اس اسٹاف ممبر کا کوئی لاگ ان آئی ڈی یا پاسورڈ/پن نہیں ہوگا اور یہ POS یا ٹیبلیٹ پر لاگ ان نہیں کر سکے گا۔
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[styles.label, { marginTop: 10 }]}>Login ID / Username (منفرد یوزر نیم)</Text>
                  <TextInput
                    style={styles.input}
                    value={uUsername}
                    onChangeText={setUUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="e.g. ordertaker1, cashier1, master"
                  />
                  <Text style={[styles.label, { marginTop: 10 }]}>Login PIN (4+ digits)</Text>
                  <TextInput
                    style={styles.input}
                    value={uPin}
                    onChangeText={setUPin}
                    keyboardType="numeric"
                    placeholder="1001"
                  />
                  <Text style={[styles.label, { marginTop: 10 }]}>
                    Max Concurrent Devices (اس اکاؤنٹ کی بیک وقت ڈیوائس حد)
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                    یہ حد صرف اس اکاؤنٹ پر لاگو ہوگی — دوسرے صارفین اور ماسٹر اکاؤنٹ پر کوئی اثر نہیں پڑے گا۔
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {[
                      { val: 0, label: `Global Default (${(draft.defaultMaxDevicesPerStaff ?? 1) >= 999 ? 'Unlimited' : draft.defaultMaxDevicesPerStaff ?? 1})` },
                      { val: 1, label: '1 Device' },
                      { val: 2, label: '2 Devices' },
                      { val: 3, label: '3 Devices' },
                      { val: 5, label: '5 Devices' },
                      { val: 999, label: 'Unlimited (لا محدود)' },
                    ].map((opt) => {
                      const selected = uMaxDevices === opt.val;
                      return (
                        <TouchableOpacity
                          key={opt.val}
                          style={[styles.chip, selected && styles.chipActive]}
                          onPress={() => setUMaxDevices(opt.val)}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={[styles.label, { marginTop: 10 }]}>Assigned Role (System & Custom Roles)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {roles.map((r) => {
                  const selected = uCustomRoleId
                    ? uCustomRoleId === r.id
                    : (uRole || '').toLowerCase() === r.baseRole;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => {
                        setUCustomRoleId(r.id);
                        const staffRoleValue =
                          r.id === 'role-cashier' || r.name.toLowerCase() === 'cashier'
                            ? 'Cashier'
                            : r.baseRole === 'custom'
                              ? 'manager'
                              : r.baseRole;
                        setURole(staffRoleValue as StaffRole);
                      }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {r.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setUserModalVisible(false)}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveUser}>
                <Text style={styles.primaryBtnText}>Save User</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit Role Modal */}
      <Modal visible={roleModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 540, maxHeight: '90%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>
                {editingRole ? `Edit Role: ${editingRole.name}` : 'Create New System Role'}
              </Text>
              <Text style={styles.label}>Role Name *</Text>
              <TextInput
                style={styles.input}
                value={rName}
                onChangeText={setRName}
                placeholder="e.g. Shift Supervisor, Head Cashier"
              />

              <Text style={[styles.label, { marginTop: 10 }]}>Urdu Title (Optional)</Text>
              <TextInput
                style={styles.input}
                value={rUrduName}
                onChangeText={setRUrduName}
                placeholder="e.g. شفٹ سپروائزر"
              />

              <Text style={[styles.label, { marginTop: 10 }]}>Description</Text>
              <TextInput
                style={styles.input}
                value={rDesc}
                onChangeText={setRDesc}
                placeholder="Short summary of what this role handles"
              />

              {(!editingRole || !editingRole.isSystem) && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Base Portal / Login Destination</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                    {BASE_ROLE_OPTIONS.map((opt) => {
                      const active = rBaseRole === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setRBaseRole(opt.value)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.rowSub}>
                    {BASE_ROLE_OPTIONS.find((o) => o.value === rBaseRole)?.hint}
                  </Text>
                </>
              )}

              <Text style={[styles.label, { marginTop: 12 }]}>Badge Color</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ROLE_COLOR_OPTIONS.map((hex) => (
                  <TouchableOpacity
                    key={hex}
                    onPress={() => setRColor(hex)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: hex },
                      rColor === hex && styles.colorSwatchActive,
                    ]}
                  />
                ))}
              </View>

              {!editingRole && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Start Permissions From</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.chip, rCloneFromId === 'none' && styles.chipActive]}
                      onPress={() => setRCloneFromId('none')}
                    >
                      <Text style={[styles.chipText, rCloneFromId === 'none' && styles.chipTextActive]}>
                        Start Blank (0/{ALL_PERMISSION_KEYS.length})
                      </Text>
                    </TouchableOpacity>
                    {roles.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={[styles.chip, rCloneFromId === r.id && styles.chipActive]}
                        onPress={() => setRCloneFromId(r.id)}
                      >
                        <Text style={[styles.chipText, rCloneFromId === r.id && styles.chipTextActive]}>
                          Copy {r.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setRoleModalVisible(false)}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveRoleModal}>
                  <Text style={styles.primaryBtnText}>
                    {editingRole ? 'Update Role' : 'Create & Configure Permissions'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Restore Backup Modal */}
      <Modal visible={restoreModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Restore System from JSON Backup</Text>
            <Text style={styles.rowSub}>Paste exported JSON backup content below:</Text>
            <TextInput
              style={[styles.input, { height: 180, textAlignVertical: 'top', marginTop: 8 }]}
              multiline
              value={restoreJsonText}
              onChangeText={setRestoreJsonText}
              placeholder='{"version": 1, "data": { ... }}'
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setRestoreModalVisible(false)}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleRestoreBackup}>
                <Text style={styles.primaryBtnText}>Restore Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Danger Modal */}
      <Modal visible={confirmModal.visible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.sectionTitle, { color: '#991B1B' }]}>{confirmModal.title}</Text>
            <Text style={[styles.rowSub, { marginVertical: 8, fontSize: 13.5 }]}>
              {confirmModal.message}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setConfirmModal((p) => ({ ...p, visible: false }))}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#DC2626' }]}
                onPress={() => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal((p) => ({ ...p, visible: false }));
                  fn();
                }}
              >
                <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  deviceSecurityCard: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  deviceSecurityIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#52171B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceSecurityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#52171B',
  },
  deviceSecuritySubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  deviceLimitRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  deviceLimitLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  devicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  devicePillActive: {
    borderColor: '#52171B',
    backgroundColor: '#FDF2F8',
  },
  devicePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  devicePillTextActive: {
    color: '#52171B',
    fontWeight: '800',
  },
  activeSessionsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  activeSessionsHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeSessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    gap: 8,
  },
  activeSessionStaffName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  activeSessionMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  kickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  kickBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  container: { flex: 1, backgroundColor: '#FAF6EE' },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.32)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(82, 20, 28, 0.06)',
      } as any,
    }),
    elevation: 2,
  },
  headerCardMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 240,
  },
  headerLogoCapsule: {
    padding: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(82, 20, 28, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.30)',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1C1917', letterSpacing: -0.2 },
  headerSub: { fontSize: 12, color: '#78716C', marginTop: 3, fontWeight: '500' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeOnline: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  statusBadgeOffline: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  unsavedPill: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unsavedPillText: { fontSize: 10, fontWeight: '800', color: '#92400E' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  headerSecondaryBtnText: { fontSize: 12, fontWeight: '700', color: '#52171B' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4AF37',
    borderWidth: 1,
    borderColor: '#B48214',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnSaved: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  saveBtnText: { fontSize: 12.5, fontWeight: '800', color: '#140306' },
  saveBtnTextSaved: { color: '#065F46' },
  cardFooterBar: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E7E0D3',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerStatusText: { fontSize: 12, color: '#78716C', fontWeight: '500' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#140306',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toastText: { color: '#FAF6EE', fontSize: 12.5, fontWeight: '600' },
  tabBarWrap: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  tabBar: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  tabBtnActive: { backgroundColor: '#D4AF37', borderColor: '#B48214' },
  tabBtnText: { fontSize: 12.5, fontWeight: '700', color: '#52171B' },
  tabBtnTextActive: { color: '#140306' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#52171B', marginBottom: 12 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  gridCol: { flexDirection: 'column', gap: 10 },
  fieldBox: { flex: 1 },
  fieldBoxFull: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', color: '#44403C', marginBottom: 4 },
  input: {
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#D6CFC2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: '#1C1917',
  },
  divider: { height: 1, backgroundColor: '#E7E0D3', marginVertical: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFE4',
  },
  rowTitle: { fontSize: 13.5, fontWeight: '700', color: '#1C1917' },
  rowSub: { fontSize: 11.5, color: '#78716C', marginTop: 2 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primaryBtnText: { fontSize: 12.5, fontWeight: '800', color: '#140306' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#52171B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  secondaryBtnText: { fontSize: 12.5, fontWeight: '700', color: '#52171B' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFE4',
    gap: 10,
  },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeGreen: { backgroundColor: '#DCFCE7' },
  badgeGray: { backgroundColor: '#E7E5E4' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#1C1917' },
  iconBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  statBox: {
    minWidth: 130,
    flex: 1,
    backgroundColor: '#FAF6EE',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#78716C' },
  statValue: { fontSize: 15, fontWeight: '800', color: '#52171B', marginTop: 3 },
  dangerRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E7E0D3',
    backgroundColor: '#FAF6EE',
    gap: 10,
  },
  dangerTitle: { fontSize: 13.5, fontWeight: '800', color: '#991B1B' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 3, 6, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#D6CFC2',
  },
  chipActive: { backgroundColor: '#52171B', borderColor: '#52171B' },
  chipText: { fontSize: 11, fontWeight: '700', color: '#52171B' },
  chipTextActive: { color: '#D4AF37' },
  roleSelectorRow: { gap: 10, paddingVertical: 4 },
  roleSelectorCard: {
    minWidth: 165,
    backgroundColor: '#FAF6EE',
    borderWidth: 1.5,
    borderColor: '#E7E0D3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  roleSelectorCardActive: {
    backgroundColor: '#FFFDF7',
    borderColor: '#D4AF37',
    borderWidth: 2,
  },
  roleColorDot: { width: 10, height: 10, borderRadius: 5 },
  roleSelectorName: { fontSize: 13.5, fontWeight: '800', color: '#52171B' },
  roleSelectorMeta: { fontSize: 11, fontWeight: '600', color: '#78716C' },
  roleKindBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  roleKindSystem: { backgroundColor: '#E7E5E4' },
  roleKindCustom: { backgroundColor: '#FEF3C7' },
  roleKindText: { fontSize: 9, fontWeight: '800', color: '#44403C' },
  roleBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FAF6EE',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  roleBannerTitle: { fontSize: 17, fontWeight: '900', color: '#52171B' },
  roleBannerUrdu: { fontSize: 13, fontWeight: '700', color: '#78716C' },
  rolePortalTag: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4AF37',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  rolePortalTagText: { fontSize: 10, fontWeight: '800', color: '#52171B' },
  permCategoryCard: {
    backgroundColor: '#FAF6EE',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  permCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  permCategoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permCategoryTitle: { fontSize: 14, fontWeight: '800', color: '#52171B' },
  permGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  permItemCard: {
    width: '49%',
    minWidth: 260,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E0D3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  permItemCardActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFDF8',
  },
  permItemCardOverridden: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    backgroundColor: '#FFFBEB',
  },
  overridePill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  overridePillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#92400E',
  },
  staffPermBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  staffPermBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#52171B',
  },
  permItemIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FAF6EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permItemTitle: { fontSize: 13, fontWeight: '700', color: '#1C1917' },
  permItemDesc: { fontSize: 11, color: '#78716C', marginTop: 1 },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#140306',
    transform: [{ scale: 1.12 }],
  },
  moduleSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#D6CFC2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  moduleSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1C1917',
    paddingVertical: 4,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  groupCountPill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  groupCountPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  groupMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  groupMiniBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  coreModulePill: {
    backgroundColor: '#52171B',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  coreModulePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D4AF37',
    letterSpacing: 0.4,
  },
  moduleNumericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moduleNumUnitPill: {
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#D6CFC2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  moduleNumUnitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#52171B',
  },
  crudPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  crudPresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
  },
  crudPresetBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  crudColBulkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  crudColBulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  crudColBulkText: {
    fontSize: 11,
    fontWeight: '800',
  },
  crudMatrixWrap: {
    gap: 8,
  },
  crudMatrixRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E0D3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  crudMatrixLeft: {
    flex: 1,
    minWidth: 210,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  crudMatrixActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  crudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 68,
  },
  crudPillAddActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  crudPillViewActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  crudPillViewAlways: {
    backgroundColor: '#FAF6EE',
    borderColor: '#D4AF37',
    opacity: 0.85,
  },
  crudPillEditActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  crudPillDelActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  crudPillInactive: {
    backgroundColor: '#F5F5F4',
    borderColor: '#E7E5E4',
  },
  crudPillOverridden: {
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  crudPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  crudPillSubHint: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 1,
  },
  crudRowToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6CFC2',
    backgroundColor: '#FAF6EE',
    minWidth: 44,
    alignItems: 'center',
  },
  crudRowToggleBtnActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#FFFBEB',
  },
  crudRowToggleText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#78716C',
  },
  crudScopeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  crudScopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: '#E7E0D3',
  },
  crudScopeBtnActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#B48214',
  },
  crudScopeBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#52171B',
  },
  crudOverviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FAF6EE',
    borderWidth: 1.5,
    borderColor: '#E7E0D3',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  crudOverviewRowActive: {
    backgroundColor: '#FFFDF7',
    borderColor: '#D4AF37',
    borderWidth: 2,
  },
  crudMiniPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  crudMiniPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
});
