import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

/**
 * Operations store: business features that sit next to `restaurantStore`
 * (guest service requests, real inventory, expenses, sold-out list, feedback).
 * Kept in its own file so both developers can work without merge conflicts.
 * It is synced across devices through the same LAN hub (see OPS_SYNC_KEYS).
 */

// ---------- Types ----------

export type ServiceRequestType = 'call_waiter' | 'bill' | 'water' | 'cleaning' | 'complaint' | 'other';
export type ServiceRequestStatus = 'pending' | 'acknowledged' | 'resolved';

export type ServiceRequest = {
  id: string;
  tableId: string;
  tableName: string;
  zone: string;
  type: ServiceRequestType;
  note?: string;
  status: ServiceRequestStatus;
  source: 'guest' | 'staff';
  createdAt: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
};

export type InventoryItem = {
  id: string;
  itemCode?: string;
  barcode?: string;
  name: string;
  urduName?: string;
  category: string;
  unit: string;
  stock: number;
  /** Reorder level - at or below this the item is "low". */
  threshold: number;
  costPerUnit?: number;
  supplier?: string;
  supplierPhone?: string;
  location?: string;
  batchNumber?: string;
  expiryDate?: number;
  receivedDate?: number;
  invoiceNo?: string;
  notes?: string;
  updatedAt: number;
};

export type StockMovementType = 'receive' | 'usage' | 'wastage' | 'adjust';

export type StockMovement = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode?: string;
  unit?: string;
  grnNo?: string;
  type: StockMovementType;
  /** Absolute quantity entered by the user. */
  qty: number;
  /** Signed change applied to stock. */
  delta: number;
  note?: string;
  by?: string;
  at: number;
  supplier?: string;
  invoiceNo?: string;
  batchNumber?: string;
  unitCost?: number;
  expiryDate?: number;
};

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'fresh' | 'none';

export function getExpiryStatus(item: InventoryItem): {
  status: ExpiryStatus;
  daysRemaining?: number;
  label: string;
  color: string;
  bgColor: string;
} {
  if (!item.expiryDate) {
    return { status: 'none', label: 'No Expiry Set', color: '#64748B', bgColor: '#F1F5F9' };
  }
  const now = Date.now();
  const diffDays = Math.ceil((item.expiryDate - now) / 86400000);

  if (diffDays <= 0) {
    return {
      status: 'expired',
      daysRemaining: diffDays,
      label: diffDays === 0 ? 'Expires Today!' : `Expired ${Math.abs(diffDays)}d ago`,
      color: '#DC2626',
      bgColor: '#FEE2E2',
    };
  }
  if (diffDays <= 3) {
    return {
      status: 'critical',
      daysRemaining: diffDays,
      label: `Expires in ${diffDays} day${diffDays > 1 ? 's' : ''}!`,
      color: '#EA580C',
      bgColor: '#FFEDD5',
    };
  }
  if (diffDays <= 7) {
    return {
      status: 'warning',
      daysRemaining: diffDays,
      label: `${diffDays} days left`,
      color: '#D97706',
      bgColor: '#FEF3C7',
    };
  }
  return {
    status: 'fresh',
    daysRemaining: diffDays,
    label: `${diffDays} days fresh`,
    color: '#16A34A',
    bgColor: '#DCFCE7',
  };
}

export const STORAGE_LOCATIONS = [
  'Walk-in Chiller',
  'Deep Freezer #1 (Meat)',
  'Deep Freezer #2 (Poultry)',
  'Dry Ration Store - Shelf A',
  'Dry Ration Store - Shelf B',
  'Spice & Masala Rack',
  'Beverage Cold Room',
  'Cooking Line / Kitchen',
  'Packaging Store',
] as const;

export type ExpenseMethod = 'cash' | 'online';

export type Expense = {
  id: string;
  category: string;
  amount: number;
  note?: string;
  method: ExpenseMethod;
  paidBy?: string;
  at: number;
  sourcePaymentId?: string;
  sourcePOId?: string;
};

export type GuestFeedback = {
  id: string;
  rating: number; // 1-5
  comment?: string;
  tableName?: string;
  zone?: string;
  at: number;
};

export const SERVICE_REQUEST_META: Record<
  ServiceRequestType,
  { label: string; icon: string; color: string }
> = {
  call_waiter: { label: 'Call Waiter', icon: 'hand-left-outline', color: '#1976D2' },
  bill: { label: 'Request Bill', icon: 'receipt-outline', color: '#2E7D32' },
  water: { label: 'Water / Refill', icon: 'water-outline', color: '#0097A7' },
  cleaning: { label: 'Clean Table', icon: 'sparkles-outline', color: '#6A1B9A' },
  complaint: { label: 'Complaint', icon: 'alert-circle-outline', color: '#D32F2F' },
  other: { label: 'Other', icon: 'chatbubble-ellipses-outline', color: '#546E7A' },
};

export const EXPENSE_CATEGORIES = [
  'Groceries & Produce',
  'Meat & Poultry',
  'Dairy & Bakery',
  'Gas / LPG / Charcoal',
  'Electricity & Utilities',
  'Staff Salary / Advance',
  'Rent',
  'Maintenance & Repair',
  'Packaging & Supplies',
  'Marketing',
  'Other',
] as const;

export const INVENTORY_CATEGORIES = [
  'Meat',
  'Produce',
  'Grains',
  'Dairy',
  'Pantry',
  'Beverages',
  'Fuel',
  'Packaging',
  'Supplies',
] as const;

// ---------- Helpers ----------

let seq = 0;
const uid = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const MAX_REQUESTS = 200;
const MAX_MOVEMENTS = 400;
const MAX_FEEDBACK = 300;

export const isActiveRequest = (r: ServiceRequest) => r.status !== 'resolved';

export type StockLevel = 'ok' | 'low' | 'critical' | 'out';

export function getStockLevel(item: InventoryItem): StockLevel {
  if (item.stock <= 0) return 'out';
  if (item.stock <= item.threshold * 0.5) return 'critical';
  if (item.stock <= item.threshold) return 'low';
  return 'ok';
}

// ---------- Seed data (intentionally empty for clean production launch) ----------

export const INITIAL_INVENTORY: InventoryItem[] = [];

export const INITIAL_STOCK_MOVEMENTS: StockMovement[] = [];

export type SupplierCategory =
  | 'Meat & Poultry'
  | 'Fresh Produce'
  | 'Dairy & Bakery'
  | 'Grains & Dry Ration'
  | 'Beverages & Drinks'
  | 'Fuel & Charcoal'
  | 'Packaging & Disposables'
  | 'Cleaning & Kitchen Supplies'
  | 'Equipment & Maintenance'
  | 'Other';

export const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  'Meat & Poultry',
  'Fresh Produce',
  'Dairy & Bakery',
  'Grains & Dry Ration',
  'Beverages & Drinks',
  'Fuel & Charcoal',
  'Packaging & Disposables',
  'Cleaning & Kitchen Supplies',
  'Equipment & Maintenance',
  'Other',
];

export type Supplier = {
  id: string;
  name: string;
  category: SupplierCategory;
  contactPerson: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  paymentTerms: string; // 'Cash on Delivery' | 'Credit 7 Days' | 'Credit 15 Days' | 'Credit 30 Days' | 'Advance'
  bankDetails?: {
    bankName: string;
    accountTitle: string;
    accountNumber: string;
    iban?: string;
  };
  suppliedItems: string[];
  currentBalance: number; // pending payable amount
  totalPurchases: number;
  rating: number; // 1-5
  status: 'active' | 'inactive' | 'hold';
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type PurchaseOrderItem = {
  itemId?: string;
  name: string;
  category: string;
  unit: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  totalCost: number;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceNo?: string;
  orderDate: number;
  deliveryDate?: number;
  status: 'ordered' | 'received' | 'partial' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  items: PurchaseOrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  freight: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentMethod?: 'cash' | 'online' | 'cheque' | 'credit';
  receivedBy?: string;
  notes?: string;
  createdAt: number;
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId?: string;
  amount: number;
  method: 'cash' | 'online' | 'cheque';
  reference?: string;
  notes?: string;
  paidBy?: string;
  paidAt: number;
  bankName?: string;
  chequeNumber?: string;
  chequeDate?: string;
  receivedByContact?: string;
  sourceAccount?: string;
};

// ---------- Store ----------

export const INITIAL_SUPPLIERS: Supplier[] = [];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [];

export const INITIAL_SUPPLIER_PAYMENTS: SupplierPayment[] = [];

// ---------- Assets & Capital Purchases ----------

export const ASSET_CATEGORIES = [
  'Crockery (Plates & Bowls)',
  'Glassware & Tumblers',
  'Cutlery & Utensils',
  'Clayware & Specialty Pots',
  'Kitchen Machinery & Heavy Line',
  'Kitchen Equipment & Tools',
  'Refrigeration & Cold Storage',
  'Dining Furniture & Decor',
  'Dining Furniture & Seating',
  'Crockery & Cutlery (Bulk Assets)',
  'HVAC, Electrical & Generators',
  'IT, POS & Surveillance Hardware',
  'Amusement & Playland Rides',
  'Playland Assets & Rides',
  'Interior, Signage & Royal Decor',
  'Other Capital Assets',
] as const;

export type AssetCategory = typeof ASSET_CATEGORIES[number];

export type AssetCondition = 'brand_new' | 'good' | 'fair' | 'needs_maintenance';
export type AssetStatus = 'active' | 'in_maintenance' | 'retired' | 'written_off';

export type AssetMaintenanceLog = {
  id: string;
  date: number;
  cost: number;
  description: string;
  performedBy?: string;
  vendor?: string;
  invoiceNo?: string;
};

export type Asset = {
  id: string;
  assetCode: string;
  name: string;
  urduName?: string;
  category: AssetCategory;
  purchaseDate: number;
  cost: number;
  quantity: number;
  totalCost: number;
  vendor: string;
  vendorPhone?: string;
  invoiceNo?: string;
  warrantyExpiry?: number;
  location: string;
  condition: AssetCondition;
  status: AssetStatus;
  depreciationRateYearly?: number; // e.g. 10%
  currentValue: number;
  serialNumber?: string;
  notes?: string;
  maintenanceLogs: AssetMaintenanceLog[];
  createdAt: number;
  updatedAt: number;
};

// ---------- Damage Control & Breakages ----------

export const DAMAGE_CATEGORIES = [
  'Crockery (Plates & Bowls)',
  'Glassware & Tumblers',
  'Cutlery & Utensils',
  'Clayware & Specialty Pots',
  'Kitchen Machinery & Heavy Line',
  'Kitchen Equipment & Tools',
  'Refrigeration & Cold Storage',
  'Dining Furniture & Decor',
  'Dining Furniture & Seating',
  'HVAC, Electrical & Generators',
  'IT, POS & Surveillance Hardware',
  'Playland Assets & Rides',
  'Interior, Signage & Royal Decor',
  'Other Breakage',
] as const;

export type DamageCategory = typeof DAMAGE_CATEGORIES[number];

export const DAMAGE_REASONS = [
  'Staff Accidental Drop',
  'Customer / Guest Mishap',
  'Dishwashing Pit Collision',
  'Thermal Shock / Heat Crack',
  'Wear & Tear / Chipped Edge',
  'Storage & Transit Slip',
  'Equipment Burnout / Overheating',
  'Other Incident',
] as const;

export type DamageReason = typeof DAMAGE_REASONS[number];

export type DamageResponsibility = 'staff' | 'customer' | 'dishwashing' | 'wear_and_tear' | 'unknown';

export const DAMAGE_ACTIONS = [
  'Written Off (Restaurant Loss)',
  'Deducted from Staff Salary',
  'Charged to Customer Bill',
  'Replaced from Buffer Stock',
  'Sent for Repair / Welding',
] as const;

export type DamageAction = typeof DAMAGE_ACTIONS[number];
export type DamageStatus = 'logged' | 'approved_writeoff' | 'recovered' | 'repaired';

export type DamageRecord = {
  id: string;
  incidentCode: string;
  itemName: string;
  category: DamageCategory;
  quantity: number;
  unitCost: number;
  totalLoss: number;
  incidentDate: number;
  location: string;
  reason: DamageReason;
  reportedBy: string;
  responsibleParty: DamageResponsibility;
  responsiblePersonName?: string;
  actionTaken: DamageAction;
  status: DamageStatus;
  amountRecovered: number;
  netLoss: number;
  notes?: string;
  assetId?: string;
  assetCode?: string;
  createdAt: number;
  resolvedAt?: number;
};

export const INITIAL_ASSETS: Asset[] = [];

export const INITIAL_DAMAGES: DamageRecord[] = [];

export type OpsData = {
  serviceRequests: ServiceRequest[];
  inventory: InventoryItem[];
  inventoryCategories?: string[];
  stockMovements: StockMovement[];
  expenses: Expense[];
  feedback: GuestFeedback[];
  unavailableItemIds: string[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  supplierPayments: SupplierPayment[];
  assets: Asset[];
  damageRecords: DamageRecord[];
};

/** Keys exchanged with the LAN sync hub (kept in sync with server.js allowedKeys). */
export const OPS_SYNC_KEYS: (keyof OpsData)[] = [
  'serviceRequests',
  'inventory',
  'inventoryCategories',
  'stockMovements',
  'expenses',
  'feedback',
  'unavailableItemIds',
  'suppliers',
  'purchaseOrders',
  'supplierPayments',
  'assets',
  'damageRecords',
];

type NewServiceRequest = {
  tableId: string;
  tableName: string;
  zone: string;
  type: ServiceRequestType;
  note?: string;
  source: 'guest' | 'staff';
};

type OpsState = OpsData & {
  dummyPurgeVersion?: number;
  // Service requests
  addServiceRequest: (req: NewServiceRequest) => boolean;
  acknowledgeRequest: (id: string, by: string) => void;
  resolveRequest: (id: string) => void;
  clearResolvedRequests: () => void;

  // Inventory
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'updatedAt'>) => void;
  updateInventoryItem: (id: string, patch: Partial<Omit<InventoryItem, 'id'>>) => void;
  deleteInventoryItem: (id: string) => void;
  addInventoryCategory: (category: string) => void;
  renameInventoryCategory: (oldName: string, newName: string) => void;
  deleteInventoryCategory: (category: string) => void;
  recordStockMovement: (
    itemId: string,
    type: StockMovementType,
    qty: number,
    note?: string,
    by?: string,
    meta?: {
      supplier?: string;
      invoiceNo?: string;
      batchNumber?: string;
      unitCost?: number;
      expiryDate?: number;
      location?: string;
      unit?: string;
      grnNo?: string;
    }
  ) => void;

  // Expenses
  addExpense: (expense: Omit<Expense, 'id' | 'at'> & { at?: number }) => void;
  updateExpense: (id: string, patch: Partial<Omit<Expense, 'id'>>) => void;
  deleteExpense: (id: string) => void;

  // Sold-out list
  setItemAvailability: (menuItemId: string, available: boolean) => void;
  resetAvailability: () => void;

  // Feedback
  addFeedback: (fb: Omit<GuestFeedback, 'id' | 'at'>) => void;

  // Supplier & Vendor Management
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSupplier: (id: string, patch: Partial<Omit<Supplier, 'id' | 'createdAt'>>) => void;
  deleteSupplier: (id: string) => void;
  populateDefaultSuppliers: () => void;

  // Purchase Orders & Inflow
  addPurchaseOrder: (
    po: Omit<PurchaseOrder, 'id' | 'createdAt'>,
    options?: { autoReceiveToInventory?: boolean; autoRecordExpense?: boolean; receivedBy?: string }
  ) => void;
  receivePurchaseOrder: (
    poId: string,
    receivedItems?: { itemId?: string; qtyReceived: number }[],
    receivedBy?: string
  ) => void;
  deletePurchaseOrder: (id: string) => void;

  // Supplier Payments
  recordSupplierPayment: (
    payment: Omit<SupplierPayment, 'id' | 'paidAt'>,
    options?: { autoRecordExpense?: boolean }
  ) => void;
  deleteSupplierPayment: (id: string) => void;

  // Assets & Capital Purchases
  addAsset: (
    asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'totalCost' | 'currentValue' | 'maintenanceLogs'> & {
      totalCost?: number;
      currentValue?: number;
    }
  ) => void;
  updateAsset: (id: string, patch: Partial<Omit<Asset, 'id' | 'createdAt'>>) => void;
  deleteAsset: (id: string) => void;
  addAssetMaintenanceLog: (
    assetId: string,
    log: Omit<AssetMaintenanceLog, 'id'>,
    options?: { autoRecordExpense?: boolean; paidBy?: string }
  ) => void;

  // Damage Control & Breakages
  logDamageIncident: (
    record: Omit<DamageRecord, 'id' | 'createdAt' | 'totalLoss' | 'netLoss'> & {
      totalLoss?: number;
      netLoss?: number;
    }
  ) => void;
  updateDamageRecord: (id: string, patch: Partial<Omit<DamageRecord, 'id' | 'createdAt'>>) => void;
  deleteDamageRecord: (id: string) => void;
  resolveDamageRecord: (
    id: string,
    resolution: {
      actionTaken: DamageAction;
      status?: DamageStatus;
      amountRecovered?: number;
      notes?: string;
    }
  ) => void;

  syncFromServer: (remote: Partial<OpsData>) => void;
};

let isOpsNotifyPending = false;
function notifySync() {
  if (isOpsNotifyPending) return;
  isOpsNotifyPending = true;
  setTimeout(() => {
    isOpsNotifyPending = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { broadcastImmediately } = require('../services/syncService');
      if (typeof broadcastImmediately === 'function') {
        broadcastImmediately();
      }
    } catch {}
  }, 0);
}

export const useOpsStore = create<OpsState>()(
  persist(
    (set, get) => ({
      serviceRequests: [],
      inventory: INITIAL_INVENTORY,
      inventoryCategories: [...INVENTORY_CATEGORIES],
      stockMovements: INITIAL_STOCK_MOVEMENTS,
      expenses: [],
      feedback: [],
      unavailableItemIds: [],
      suppliers: INITIAL_SUPPLIERS,
      purchaseOrders: INITIAL_PURCHASE_ORDERS,
      supplierPayments: INITIAL_SUPPLIER_PAYMENTS,
      assets: INITIAL_ASSETS,
      damageRecords: INITIAL_DAMAGES,
      dummyPurgeVersion: 1,

      addServiceRequest: (req) => {
        const duplicate = get().serviceRequests.some(
          (r) => r.tableId === req.tableId && r.type === req.type && isActiveRequest(r)
        );
        if (duplicate) return false;
        const created: ServiceRequest = {
          ...req,
          id: uid('sr'),
          status: 'pending',
          createdAt: Date.now(),
        };
        set((state) => ({
          serviceRequests: [created, ...state.serviceRequests].slice(0, MAX_REQUESTS),
        }));
        return true;
      },

      acknowledgeRequest: (id, by) =>
        set((state) => ({
          serviceRequests: state.serviceRequests.map((r) =>
            r.id === id && r.status === 'pending'
              ? { ...r, status: 'acknowledged', acknowledgedBy: by, acknowledgedAt: Date.now() }
              : r
          ),
        })),

      resolveRequest: (id) =>
        set((state) => ({
          serviceRequests: state.serviceRequests.map((r) =>
            r.id === id ? { ...r, status: 'resolved', resolvedAt: Date.now() } : r
          ),
        })),

      clearResolvedRequests: () =>
        set((state) => ({ serviceRequests: state.serviceRequests.filter(isActiveRequest) })),

      addInventoryItem: (item) => {
        set((state) => {
          const cat = (item.category || '').trim();
          const currentCats = Array.isArray(state.inventoryCategories) && state.inventoryCategories.length > 0
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES];
          const nextCats = cat && !currentCats.some((c) => c.toLowerCase() === cat.toLowerCase())
            ? [...currentCats, cat]
            : currentCats;
          return {
            inventory: [...state.inventory, { ...item, id: uid('inv'), updatedAt: Date.now() }],
            inventoryCategories: nextCats,
          };
        });
        notifySync();
      },

      updateInventoryItem: (id, patch) => {
        set((state) => {
          const cat = (patch.category || '').trim();
          const currentCats = Array.isArray(state.inventoryCategories) && state.inventoryCategories.length > 0
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES];
          const nextCats = cat && !currentCats.some((c) => c.toLowerCase() === cat.toLowerCase())
            ? [...currentCats, cat]
            : currentCats;
          return {
            inventory: state.inventory.map((i) =>
              i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i
            ),
            inventoryCategories: nextCats,
          };
        });
        notifySync();
      },

      deleteInventoryItem: (id) => {
        set((state) => ({ inventory: state.inventory.filter((i) => i.id !== id) }));
        notifySync();
      },

      addInventoryCategory: (category) => {
        const clean = (category || '').trim();
        if (!clean) return;
        set((state) => {
          const currentCats = Array.isArray(state.inventoryCategories) && state.inventoryCategories.length > 0
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES];
          if (currentCats.some((c) => c.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          return {
            inventoryCategories: [...currentCats, clean],
          };
        });
        notifySync();
      },

      renameInventoryCategory: (oldName, newName) => {
        const cleanOld = (oldName || '').trim();
        const cleanNew = (newName || '').trim();
        if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
        set((state) => {
          const currentCats = Array.isArray(state.inventoryCategories) && state.inventoryCategories.length > 0
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES];
          const updatedCats = currentCats.map((c) => (c === cleanOld ? cleanNew : c));
          const dedupedCats = Array.from(new Set(updatedCats));
          return {
            inventoryCategories: dedupedCats,
            inventory: state.inventory.map((item) =>
              item.category === cleanOld ? { ...item, category: cleanNew, updatedAt: Date.now() } : item
            ),
          };
        });
        notifySync();
      },

      deleteInventoryCategory: (category) => {
        const clean = (category || '').trim();
        if (!clean) return;
        set((state) => {
          const currentCats = Array.isArray(state.inventoryCategories) && state.inventoryCategories.length > 0
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES];
          const filtered = currentCats.filter((c) => c !== clean);
          return {
            inventoryCategories: filtered.length > 0 ? filtered : [...INVENTORY_CATEGORIES],
          };
        });
        notifySync();
      },

      recordStockMovement: (itemId, type, qty, note, by, meta) => {
        set((state) => {
          const item = state.inventory.find((i) => i.id === itemId);
          if (!item || !Number.isFinite(qty) || qty < 0) return state;

          let newStock = item.stock;
          if (type === 'receive') newStock = item.stock + qty;
          else if (type === 'adjust') newStock = qty;
          else newStock = Math.max(0, item.stock - qty);

          const movement: StockMovement = {
            id: uid('mv'),
            itemId,
            itemName: item.name,
            itemCode: item.itemCode,
            unit: meta?.unit || item.unit,
            grnNo: meta?.grnNo,
            type,
            qty,
            delta: newStock - item.stock,
            note,
            by,
            at: Date.now(),
            supplier: meta?.supplier || item.supplier,
            invoiceNo: meta?.invoiceNo || item.invoiceNo,
            batchNumber: meta?.batchNumber || item.batchNumber,
            unitCost: meta?.unitCost ?? item.costPerUnit,
            expiryDate: meta?.expiryDate ?? item.expiryDate,
          };

          return {
            inventory: state.inventory.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    stock: newStock,
                    updatedAt: movement.at,
                    ...(meta?.unit && { unit: meta.unit }),
                    ...(meta?.unitCost !== undefined && { costPerUnit: meta.unitCost }),
                    ...(meta?.batchNumber && { batchNumber: meta.batchNumber }),
                    ...(meta?.expiryDate !== undefined && { expiryDate: meta.expiryDate }),
                    ...(meta?.location && { location: meta.location }),
                    ...(meta?.invoiceNo && { invoiceNo: meta.invoiceNo }),
                    ...(meta?.supplier && { supplier: meta.supplier }),
                  }
                : i
            ),
            stockMovements: [movement, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        });
        notifySync();
      },

      addExpense: (expense) => {
        set((state) => ({
          expenses: [{ ...expense, id: uid('ex'), at: expense.at ?? Date.now() }, ...state.expenses],
        }));
        notifySync();
      },

      updateExpense: (id, patch) => {
        set((state) => ({
          expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
        notifySync();
      },

      deleteExpense: (id) => {
        set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) }));
        notifySync();
      },

      setItemAvailability: (menuItemId, available) => {
        set((state) => {
          const has = state.unavailableItemIds.includes(menuItemId);
          if (available && has) {
            return { unavailableItemIds: state.unavailableItemIds.filter((i) => i !== menuItemId) };
          }
          if (!available && !has) {
            return { unavailableItemIds: [...state.unavailableItemIds, menuItemId] };
          }
          return state;
        });
        notifySync();
      },

      resetAvailability: () => {
        set({ unavailableItemIds: [] });
        notifySync();
      },

      addFeedback: (fb) =>
        set((state) => ({
          feedback: [{ ...fb, id: uid('fb'), at: Date.now() }, ...state.feedback].slice(0, MAX_FEEDBACK),
        })),

      // Supplier & Vendor Actions
      addSupplier: (supplier) => {
        set((state) => ({
          suppliers: [
            {
              ...supplier,
              id: uid('sup'),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            ...state.suppliers,
          ],
        }));
        notifySync();
      },

      updateSupplier: (id, patch) => {
        set((state) => ({
          suppliers: state.suppliers.map((s) =>
            s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s
          ),
        }));
        notifySync();
      },

      deleteSupplier: (id) => {
        set((state) => ({
          suppliers: state.suppliers.filter((s) => s.id !== id),
        }));
        notifySync();
      },

      populateDefaultSuppliers: () => {
        set({
          suppliers: INITIAL_SUPPLIERS,
          purchaseOrders: INITIAL_PURCHASE_ORDERS,
          supplierPayments: INITIAL_SUPPLIER_PAYMENTS,
        });
        notifySync();
      },

      addPurchaseOrder: (poData, options = {}) => {
        const { autoReceiveToInventory = true, autoRecordExpense = true, receivedBy } = options;
        const poId = uid('po');
        const now = Date.now();
        const po: PurchaseOrder = {
          ...poData,
          id: poId,
          createdAt: now,
        };

        set((state) => {
          // 1. Update supplier stats
          const supplier = state.suppliers.find((s) => s.id === po.supplierId);
          let updatedSuppliers = state.suppliers;
          if (supplier) {
            const addedBalance = po.balanceDue || 0;
            const addedPurchases = po.totalAmount || 0;
            updatedSuppliers = state.suppliers.map((s) =>
              s.id === po.supplierId
                ? {
                    ...s,
                    currentBalance: Math.max(0, (s.currentBalance || 0) + addedBalance),
                    totalPurchases: (s.totalPurchases || 0) + addedPurchases,
                    updatedAt: now,
                  }
                : s
            );
          }

          // 2. Auto Receive to inventory if marked received/ordered with option
          let nextInventory = state.inventory;
          let nextMovements = state.stockMovements;
          if (autoReceiveToInventory && (po.status === 'received' || po.status === 'partial')) {
            po.items.forEach((item) => {
              const qtyToAdd = item.qtyReceived > 0 ? item.qtyReceived : item.qtyOrdered;
              if (qtyToAdd > 0) {
                const existing = nextInventory.find(
                  (inv) => (item.itemId && inv.id === item.itemId) || inv.name.toLowerCase() === item.name.toLowerCase()
                );
                if (existing) {
                  const newStock = existing.stock + qtyToAdd;
                  nextInventory = nextInventory.map((inv) =>
                    inv.id === existing.id
                      ? { ...inv, stock: newStock, costPerUnit: item.unitCost || inv.costPerUnit, updatedAt: now }
                      : inv
                  );
                  nextMovements = [
                    {
                      id: uid('mv'),
                      itemId: existing.id,
                      itemName: existing.name,
                      type: 'receive' as StockMovementType,
                      qty: qtyToAdd,
                      delta: qtyToAdd,
                      note: `PO #${po.poNumber} from ${po.supplierName}`,
                      by: receivedBy || po.receivedBy || 'Admin',
                      at: now,
                    },
                    ...nextMovements,
                  ];
                }
              }
            });
          }

          // 3. Auto Record Expense if amount paid > 0
          let nextExpenses = state.expenses;
          if (autoRecordExpense && po.amountPaid > 0) {
            nextExpenses = [
              {
                id: uid('ex'),
                category: supplier?.category ? (supplier.category === 'Meat & Poultry' ? 'Meat & Poultry' : 'Groceries & Produce') : 'Groceries & Produce',
                amount: po.amountPaid,
                note: `PO #${po.poNumber} Payment to ${po.supplierName}`,
                method: po.paymentMethod === 'online' ? 'online' : 'cash',
                paidBy: receivedBy || po.receivedBy || 'Admin',
                at: now,
                sourcePOId: po.id,
              },
              ...nextExpenses,
            ];
          }

          // 4. Record Supplier Payment if amount paid > 0
          let nextPayments = state.supplierPayments;
          if (po.amountPaid > 0) {
            nextPayments = [
              {
                id: uid('spay'),
                supplierId: po.supplierId,
                supplierName: po.supplierName,
                purchaseOrderId: po.id,
                amount: po.amountPaid,
                method: po.paymentMethod === 'online' ? 'online' : po.paymentMethod === 'cheque' ? 'cheque' : 'cash',
                reference: `PO Creation Payment #${po.poNumber}`,
                notes: `Advance / Delivery Payment against PO #${po.poNumber}`,
                paidBy: receivedBy || po.receivedBy || 'Admin',
                paidAt: now,
                sourceAccount: po.paymentMethod === 'online' ? 'Bank Account' : 'Cash Drawer',
              },
              ...nextPayments,
            ];
          }

          return {
            purchaseOrders: [po, ...state.purchaseOrders],
            suppliers: updatedSuppliers,
            inventory: nextInventory,
            stockMovements: nextMovements.slice(0, MAX_MOVEMENTS),
            expenses: nextExpenses,
            supplierPayments: nextPayments,
          };
        });
        notifySync();
      },

      receivePurchaseOrder: (poId, receivedItems, receivedBy) => {
        set((state) => {
          const po = state.purchaseOrders.find((p) => p.id === poId);
          if (!po) return state;
          const now = Date.now();

          let nextInventory = state.inventory;
          let nextMovements = state.stockMovements;

          const updatedItems = po.items.map((item) => {
            const match = receivedItems?.find((ri) => (ri.itemId && ri.itemId === item.itemId) || ri.itemId === item.name);
            const qtyRec = match ? match.qtyReceived : item.qtyOrdered;

            // Increment inventory stock
            const existing = nextInventory.find(
              (inv) => (item.itemId && inv.id === item.itemId) || inv.name.toLowerCase() === item.name.toLowerCase()
            );
            if (existing && qtyRec > 0) {
              const newStock = existing.stock + qtyRec;
              nextInventory = nextInventory.map((inv) =>
                inv.id === existing.id
                  ? { ...inv, stock: newStock, costPerUnit: item.unitCost || inv.costPerUnit, updatedAt: now }
                  : inv
              );
              nextMovements = [
                {
                  id: uid('mv'),
                  itemId: existing.id,
                  itemName: existing.name,
                  type: 'receive' as StockMovementType,
                  qty: qtyRec,
                  delta: qtyRec,
                  note: `Received PO #${po.poNumber} from ${po.supplierName}`,
                  by: receivedBy || 'Admin',
                  at: now,
                },
                ...nextMovements,
              ];
            }

            return {
              ...item,
              qtyReceived: qtyRec,
            };
          });

          return {
            purchaseOrders: state.purchaseOrders.map((p) =>
              p.id === poId
                ? {
                    ...p,
                    status: 'received',
                    deliveryDate: now,
                    receivedBy: receivedBy || p.receivedBy || 'Admin',
                    items: updatedItems,
                  }
                : p
            ),
            inventory: nextInventory,
            stockMovements: nextMovements.slice(0, MAX_MOVEMENTS),
          };
        });
        notifySync();
      },

      deletePurchaseOrder: (id) => {
        set((state) => {
          const po = state.purchaseOrders.find((p) => p.id === id);
          if (!po) return state;
          const updatedSuppliers = state.suppliers.map((s) => {
            if (s.id === po.supplierId) {
              return {
                ...s,
                currentBalance: Math.max(0, (s.currentBalance || 0) - (po.balanceDue || 0)),
                totalPurchases: Math.max(0, (s.totalPurchases || 0) - (po.totalAmount || 0)),
                updatedAt: Date.now(),
              };
            }
            return s;
          });
          const nextExpenses = state.expenses.filter((e) => e.sourcePOId !== id);
          return {
            purchaseOrders: state.purchaseOrders.filter((p) => p.id !== id),
            suppliers: updatedSuppliers,
            expenses: nextExpenses,
          };
        });
        notifySync();
      },

      recordSupplierPayment: (paymentData, options = {}) => {
        const { autoRecordExpense = true } = options;
        const now = Date.now();
        const payment: SupplierPayment = {
          ...paymentData,
          id: uid('spay'),
          paidAt: now,
        };

        set((state) => {
          // 1. Deduct balance from supplier
          const updatedSuppliers = state.suppliers.map((s) =>
            s.id === payment.supplierId
              ? {
                  ...s,
                  currentBalance: Math.max(0, (s.currentBalance || 0) - payment.amount),
                  updatedAt: now,
                }
              : s
          );

          // 2. If PO ID is provided, deduct from PO balanceDue
          let updatedPOs = state.purchaseOrders;
          if (payment.purchaseOrderId) {
            updatedPOs = state.purchaseOrders.map((po) => {
              if (po.id === payment.purchaseOrderId) {
                const newPaid = (po.amountPaid || 0) + payment.amount;
                const newDue = Math.max(0, (po.totalAmount || 0) - newPaid);
                return {
                  ...po,
                  amountPaid: newPaid,
                  balanceDue: newDue,
                  paymentStatus: newDue === 0 ? 'paid' : 'partial',
                };
              }
              return po;
            });
          }

          // 3. Record to expenses if requested
          let nextExpenses = state.expenses;
          if (autoRecordExpense && payment.amount > 0) {
            const supplier = state.suppliers.find((s) => s.id === payment.supplierId);
            nextExpenses = [
              {
                id: uid('ex'),
                category: supplier?.category === 'Meat & Poultry' ? 'Meat & Poultry' : 'Groceries & Produce',
                amount: payment.amount,
                note: `Vendor Payment to ${payment.supplierName}${payment.reference ? ` (Ref: ${payment.reference})` : ''}`,
                method: payment.method === 'online' ? 'online' : 'cash',
                paidBy: payment.paidBy || 'Admin',
                at: now,
                sourcePaymentId: payment.id,
              },
              ...nextExpenses,
            ];
          }

          return {
            supplierPayments: [payment, ...state.supplierPayments],
            suppliers: updatedSuppliers,
            purchaseOrders: updatedPOs,
            expenses: nextExpenses,
          };
        });
        notifySync();
      },

      deleteSupplierPayment: (id) => {
        set((state) => {
          const payment = state.supplierPayments.find((p) => p.id === id);
          if (!payment) return state;

          const updatedSuppliers = state.suppliers.map((s) =>
            s.id === payment.supplierId
              ? {
                  ...s,
                  currentBalance: (s.currentBalance || 0) + payment.amount,
                  updatedAt: Date.now(),
                }
              : s
          );

          let updatedPOs = state.purchaseOrders;
          if (payment.purchaseOrderId) {
            updatedPOs = state.purchaseOrders.map((po) => {
              if (po.id === payment.purchaseOrderId) {
                const newPaid = Math.max(0, (po.amountPaid || 0) - payment.amount);
                const newDue = Math.max(0, (po.totalAmount || 0) - newPaid);
                return {
                  ...po,
                  amountPaid: newPaid,
                  balanceDue: newDue,
                  paymentStatus: newDue === 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid',
                };
              }
              return po;
            });
          }

          return {
            supplierPayments: state.supplierPayments.filter((p) => p.id !== id),
            suppliers: updatedSuppliers,
            purchaseOrders: updatedPOs,
            expenses: state.expenses.filter((e) => e.sourcePaymentId !== id),
          };
        });
        notifySync();
      },

      // Assets & Capital Purchases
      addAsset: (asset) =>
        set((state) => {
          const now = Date.now();
          const totalCost = asset.totalCost !== undefined ? asset.totalCost : asset.cost * asset.quantity;
          const currentValue = asset.currentValue !== undefined ? asset.currentValue : totalCost;
          const newAsset: Asset = {
            ...asset,
            id: uid('ast'),
            assetCode: asset.assetCode || `AST-${Date.now().toString().slice(-4)}`,
            totalCost,
            currentValue,
            maintenanceLogs: [],
            createdAt: now,
            updatedAt: now,
          };
          return { assets: [newAsset, ...state.assets] };
        }),

      updateAsset: (id, patch) =>
        set((state) => {
          const updated = state.assets.map((ast) => {
            if (ast.id !== id) return ast;
            const cost = patch.cost !== undefined ? patch.cost : ast.cost;
            const quantity = patch.quantity !== undefined ? patch.quantity : ast.quantity;
            const totalCost = patch.totalCost !== undefined ? patch.totalCost : cost * quantity;
            return {
              ...ast,
              ...patch,
              cost,
              quantity,
              totalCost,
              updatedAt: Date.now(),
            };
          });
          return { assets: updated };
        }),

      deleteAsset: (id) =>
        set((state) => ({ assets: state.assets.filter((a) => a.id !== id) })),

      addAssetMaintenanceLog: (assetId, log, options) => {
        const now = Date.now();
        const newLog: AssetMaintenanceLog = {
          ...log,
          id: uid('mlog'),
        };

        let nextExpenses = get().expenses;
        if (options?.autoRecordExpense && log.cost > 0) {
          const targetAsset = get().assets.find((a) => a.id === assetId);
          const assetName = targetAsset ? `[${targetAsset.assetCode}] ${targetAsset.name}` : 'Asset';
          const newExp: Expense = {
            id: uid('exp'),
            category: 'Maintenance & Repair',
            amount: log.cost,
            note: `Maintenance for ${assetName}: ${log.description}`,
            method: 'cash',
            paidBy: options.paidBy || 'Manager',
            at: now,
          };
          nextExpenses = [newExp, ...nextExpenses];
        }

        set((state) => ({
          expenses: nextExpenses,
          assets: state.assets.map((ast) => {
            if (ast.id !== assetId) return ast;
            return {
              ...ast,
              maintenanceLogs: [newLog, ...(ast.maintenanceLogs || [])],
              updatedAt: now,
            };
          }),
        }));
      },

      // Damage Control & Breakages
      logDamageIncident: (record) =>
        set((state) => {
          const now = Date.now();
          const totalLoss = record.totalLoss !== undefined ? record.totalLoss : record.quantity * record.unitCost;
          const amountRecovered = record.amountRecovered || 0;
          const netLoss = record.netLoss !== undefined ? record.netLoss : Math.max(0, totalLoss - amountRecovered);
          const newDmg: DamageRecord = {
            ...record,
            id: uid('dmg'),
            incidentCode: record.incidentCode || `DMG-${Date.now().toString().slice(-4)}`,
            totalLoss,
            amountRecovered,
            netLoss,
            createdAt: now,
          };
          return { damageRecords: [newDmg, ...state.damageRecords] };
        }),

      updateDamageRecord: (id, patch) =>
        set((state) => {
          const updated = state.damageRecords.map((d) => {
            if (d.id !== id) return d;
            const quantity = patch.quantity !== undefined ? patch.quantity : d.quantity;
            const unitCost = patch.unitCost !== undefined ? patch.unitCost : d.unitCost;
            const totalLoss = patch.totalLoss !== undefined ? patch.totalLoss : quantity * unitCost;
            const amountRecovered = patch.amountRecovered !== undefined ? patch.amountRecovered : d.amountRecovered;
            const netLoss = Math.max(0, totalLoss - amountRecovered);
            return {
              ...d,
              ...patch,
              quantity,
              unitCost,
              totalLoss,
              amountRecovered,
              netLoss,
            };
          });
          return { damageRecords: updated };
        }),

      deleteDamageRecord: (id) =>
        set((state) => ({ damageRecords: state.damageRecords.filter((d) => d.id !== id) })),

      resolveDamageRecord: (id, resolution) =>
        set((state) => {
          const updated = state.damageRecords.map((d) => {
            if (d.id !== id) return d;
            const amountRecovered = resolution.amountRecovered !== undefined ? resolution.amountRecovered : d.amountRecovered;
            const netLoss = Math.max(0, d.totalLoss - amountRecovered);
            return {
              ...d,
              actionTaken: resolution.actionTaken,
              status: resolution.status || 'approved_writeoff',
              amountRecovered,
              netLoss,
              notes: resolution.notes !== undefined ? resolution.notes : d.notes,
              resolvedAt: Date.now(),
            };
          });
          return { damageRecords: updated };
        }),

      syncFromServer: (remote) =>
        set((state) => {
          const next: Partial<OpsState> = { dummyPurgeVersion: 1 };
          if (Array.isArray(remote.serviceRequests)) next.serviceRequests = remote.serviceRequests;
          if (Array.isArray(remote.inventory)) next.inventory = remote.inventory;
          if (Array.isArray(remote.inventoryCategories) && remote.inventoryCategories.length > 0) {
            next.inventoryCategories = remote.inventoryCategories;
          }
          if (Array.isArray(remote.stockMovements)) {
            next.stockMovements = [...remote.stockMovements]
              .sort((a, b) => (b.at || 0) - (a.at || 0))
              .slice(0, MAX_MOVEMENTS);
          }
          if (Array.isArray(remote.expenses)) {
            next.expenses = [...remote.expenses].sort((a, b) => (b.at || 0) - (a.at || 0));
          }
          if (Array.isArray(remote.feedback)) next.feedback = remote.feedback;
          if (Array.isArray(remote.unavailableItemIds)) next.unavailableItemIds = remote.unavailableItemIds;
          if (Array.isArray(remote.suppliers)) next.suppliers = remote.suppliers;
          if (Array.isArray(remote.purchaseOrders)) next.purchaseOrders = remote.purchaseOrders;
          if (Array.isArray(remote.supplierPayments)) next.supplierPayments = remote.supplierPayments;
          if (Array.isArray(remote.assets)) next.assets = remote.assets;
          if (Array.isArray(remote.damageRecords)) next.damageRecords = remote.damageRecords;

          return { ...state, ...next };
        }),
    }),
    {
      name: 'ops-storage',
      storage: appStorage,
      onRehydrateStorage: () => (state) => {
        if (state && (state.dummyPurgeVersion || 0) < 1) {
          state.serviceRequests = [];
          state.inventory = [];
          state.stockMovements = [];
          state.expenses = [];
          state.feedback = [];
          state.unavailableItemIds = [];
          state.suppliers = [];
          state.purchaseOrders = [];
          state.supplierPayments = [];
          state.assets = [];
          state.damageRecords = [];
          state.dummyPurgeVersion = 1;
        }
      },
    }
  )
);

/** Snapshot of the data keys to push to the sync hub. */
export function getOpsSyncState(): OpsData {
  const s = useOpsStore.getState();
  return {
    serviceRequests: s.serviceRequests,
    inventory: s.inventory,
    inventoryCategories: s.inventoryCategories,
    stockMovements: s.stockMovements,
    expenses: s.expenses,
    feedback: s.feedback,
    unavailableItemIds: s.unavailableItemIds,
    suppliers: s.suppliers,
    purchaseOrders: s.purchaseOrders,
    supplierPayments: s.supplierPayments,
    assets: s.assets,
    damageRecords: s.damageRecords,
  };
}
