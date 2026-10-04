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
  name: string;
  category: string;
  unit: string;
  stock: number;
  /** Reorder level - at or below this the item is "low". */
  threshold: number;
  costPerUnit?: number;
  supplier?: string;
  supplierPhone?: string;
  updatedAt: number;
};

export type StockMovementType = 'receive' | 'usage' | 'wastage' | 'adjust';

export type StockMovement = {
  id: string;
  itemId: string;
  itemName: string;
  type: StockMovementType;
  /** Absolute quantity entered by the user. */
  qty: number;
  /** Signed change applied to stock. */
  delta: number;
  note?: string;
  by?: string;
  at: number;
};

export type ExpenseMethod = 'cash' | 'online';

export type Expense = {
  id: string;
  category: string;
  amount: number;
  note?: string;
  method: ExpenseMethod;
  paidBy?: string;
  at: number;
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

// ---------- Seed data ----------

const seedItem = (
  id: string,
  name: string,
  category: string,
  unit: string,
  stock: number,
  threshold: number,
  costPerUnit: number,
  supplier: string
): InventoryItem => ({
  id,
  name,
  category,
  unit,
  stock,
  threshold,
  costPerUnit,
  supplier,
  supplierPhone: '',
  updatedAt: 0,
});

const INITIAL_INVENTORY: InventoryItem[] = [
  seedItem('inv1', 'Chicken (Boneless)', 'Meat', 'kg', 15, 20, 780, 'Al-Madina Poultry'),
  seedItem('inv2', 'Mutton', 'Meat', 'kg', 35, 15, 2200, 'City Meat Shop'),
  seedItem('inv3', 'Basmati Rice', 'Grains', 'kg', 50, 10, 360, 'Wholesale Mart'),
  seedItem('inv4', 'Wheat Flour (Naan / Roti)', 'Grains', 'kg', 40, 15, 150, 'Wholesale Mart'),
  seedItem('inv5', 'Cooking Oil', 'Pantry', 'Liters', 45, 15, 520, 'Wholesale Mart'),
  seedItem('inv6', 'Yogurt (Dahi)', 'Dairy', 'kg', 12, 8, 240, 'Dairy Supplier'),
  seedItem('inv7', 'Onions', 'Produce', 'kg', 30, 10, 120, 'Sabzi Mandi'),
  seedItem('inv8', 'Tomatoes', 'Produce', 'kg', 18, 10, 150, 'Sabzi Mandi'),
  seedItem('inv9', 'Mint Leaves', 'Produce', 'kg', 2, 5, 400, 'Sabzi Mandi'),
  seedItem('inv10', 'Pepsi 1L', 'Beverages', 'bottles', 12, 24, 150, 'Beverage Distributor'),
  seedItem('inv11', 'Mineral Water 500ml', 'Beverages', 'bottles', 60, 48, 55, 'Beverage Distributor'),
  seedItem('inv12', 'LPG Cylinder', 'Fuel', 'cylinders', 3, 2, 11000, 'Gas Agency'),
  seedItem('inv13', 'Charcoal (BBQ)', 'Fuel', 'kg', 80, 50, 90, 'Gas Agency'),
  seedItem('inv14', 'Tissue & Napkins', 'Supplies', 'packs', 20, 10, 180, 'General Store'),
  seedItem('inv15', 'Takeaway Boxes', 'Packaging', 'pcs', 150, 200, 25, 'Packaging House'),
];

// ---------- Store ----------

export type OpsData = {
  serviceRequests: ServiceRequest[];
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  expenses: Expense[];
  feedback: GuestFeedback[];
  /** Menu item ids that are currently sold out (the "86 list"). */
  unavailableItemIds: string[];
};

/** Keys exchanged with the LAN sync hub (kept in sync with server.js allowedKeys). */
export const OPS_SYNC_KEYS: (keyof OpsData)[] = [
  'serviceRequests',
  'inventory',
  'stockMovements',
  'expenses',
  'feedback',
  'unavailableItemIds',
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
  // Service requests
  addServiceRequest: (req: NewServiceRequest) => boolean;
  acknowledgeRequest: (id: string, by: string) => void;
  resolveRequest: (id: string) => void;
  clearResolvedRequests: () => void;

  // Inventory
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'updatedAt'>) => void;
  updateInventoryItem: (id: string, patch: Partial<Omit<InventoryItem, 'id'>>) => void;
  deleteInventoryItem: (id: string) => void;
  recordStockMovement: (
    itemId: string,
    type: StockMovementType,
    qty: number,
    note?: string,
    by?: string
  ) => void;

  // Expenses
  addExpense: (expense: Omit<Expense, 'id' | 'at'> & { at?: number }) => void;
  deleteExpense: (id: string) => void;

  // Sold-out list
  setItemAvailability: (menuItemId: string, available: boolean) => void;
  resetAvailability: () => void;

  // Feedback
  addFeedback: (fb: Omit<GuestFeedback, 'id' | 'at'>) => void;

  syncFromServer: (remote: Partial<OpsData>) => void;
};

export const useOpsStore = create<OpsState>()(
  persist(
    (set, get) => ({
      serviceRequests: [],
      inventory: INITIAL_INVENTORY,
      stockMovements: [],
      expenses: [],
      feedback: [],
      unavailableItemIds: [],

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

      addInventoryItem: (item) =>
        set((state) => ({
          inventory: [...state.inventory, { ...item, id: uid('inv'), updatedAt: Date.now() }],
        })),

      updateInventoryItem: (id, patch) =>
        set((state) => ({
          inventory: state.inventory.map((i) =>
            i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i
          ),
        })),

      deleteInventoryItem: (id) =>
        set((state) => ({ inventory: state.inventory.filter((i) => i.id !== id) })),

      recordStockMovement: (itemId, type, qty, note, by) =>
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
            type,
            qty,
            delta: newStock - item.stock,
            note,
            by,
            at: Date.now(),
          };

          return {
            inventory: state.inventory.map((i) =>
              i.id === itemId ? { ...i, stock: newStock, updatedAt: movement.at } : i
            ),
            stockMovements: [movement, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        }),

      addExpense: (expense) =>
        set((state) => ({
          expenses: [{ ...expense, id: uid('ex'), at: expense.at ?? Date.now() }, ...state.expenses],
        })),

      deleteExpense: (id) =>
        set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) })),

      setItemAvailability: (menuItemId, available) =>
        set((state) => {
          const has = state.unavailableItemIds.includes(menuItemId);
          if (available && has) {
            return { unavailableItemIds: state.unavailableItemIds.filter((i) => i !== menuItemId) };
          }
          if (!available && !has) {
            return { unavailableItemIds: [...state.unavailableItemIds, menuItemId] };
          }
          return state;
        }),

      resetAvailability: () => set({ unavailableItemIds: [] }),

      addFeedback: (fb) =>
        set((state) => ({
          feedback: [{ ...fb, id: uid('fb'), at: Date.now() }, ...state.feedback].slice(0, MAX_FEEDBACK),
        })),

      syncFromServer: (remote) =>
        set((state) => {
          const next: Partial<OpsData> = {};
          if (Array.isArray(remote.serviceRequests)) next.serviceRequests = remote.serviceRequests;
          if (Array.isArray(remote.inventory)) next.inventory = remote.inventory;
          if (Array.isArray(remote.stockMovements)) next.stockMovements = remote.stockMovements;
          if (Array.isArray(remote.expenses)) next.expenses = remote.expenses;
          if (Array.isArray(remote.feedback)) next.feedback = remote.feedback;
          if (Array.isArray(remote.unavailableItemIds)) next.unavailableItemIds = remote.unavailableItemIds;
          return { ...state, ...next };
        }),
    }),
    {
      name: 'ops-storage',
      storage: appStorage,
    }
  )
);

/** Snapshot of the data keys to push to the sync hub. */
export function getOpsSyncState(): OpsData {
  const s = useOpsStore.getState();
  return {
    serviceRequests: s.serviceRequests,
    inventory: s.inventory,
    stockMovements: s.stockMovements,
    expenses: s.expenses,
    feedback: s.feedback,
    unavailableItemIds: s.unavailableItemIds,
  };
}
