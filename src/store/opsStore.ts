import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SULTAN_DEFAULT_INVENTORY, SULTAN_INVENTORY_CATEGORIES } from '../constants/defaultInventory';
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

export type BeverageStorageMode = 'chiller' | 'extras_store' | 'juice_bar' | 'standard';

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
  /** Explicit storage handling for beverages vs prepared drinks vs store items */
  beverageStorageMode?: BeverageStorageMode;
  /** Floor/Chiller-wise stock breakdown (e.g. { "Ground Floor": 24, "1st Floor": 12, "Rooftop": 18, "Main Store": 100 }) */
  chillerStock?: Record<string, number>;
  /** Minimum warning threshold for individual chillers */
  chillerThreshold?: number;
  /** Optional linked POS Menu Item ID for auto deduction upon beverage orders */
  menuItemId?: string;
};

/** Returns true for drinks prepared fresh at Juice Bar / Kitchen (e.g. Mint Margarita, Shakes, Mojitos, Tea/Coffee) — NEVER stored in Floor Chillers! */
export function isJuiceBarPreparedName(name?: string, category?: string): boolean {
  const nm = (name || '').toLowerCase().trim();
  const cat = (category || '').toLowerCase().trim();
  if (
    cat.includes('mocktail') ||
    cat.includes('shake') ||
    cat.includes('smoothie') ||
    cat.includes('hot') ||
    cat.includes('tea') ||
    cat.includes('coffee') ||
    cat.includes('fresh juice')
  ) {
    return true;
  }
  const preparedKeywords = [
    'margarita',
    'colada',
    'mojito',
    'lagoon',
    'fresh lime',
    'lemonade',
    'mint chiller',
    'guava mint',
    'rooh afza',
    'roohafza',
    'shake',
    'smoothie',
    'lassi',
    'cold coffee',
    'coffee',
    'cappuccino',
    'latte',
    'espresso',
    'americano',
    'mocha',
    'chai',
    'tea',
    'kehwa',
    'green tea',
    'kashmiri',
    'hot chocolate',
    'fresh juice',
    'orange juice',
    'apple juice',
    'pomegranate',
    'sugarcane',
  ];
  return preparedKeywords.some((kw) => nm.includes(kw));
}

/** Returns true ONLY for packaged cold drinks / bottled water explicitly stored in Floor Chillers. */
export function isChillerBeverageItem(item?: InventoryItem | null): boolean {
  if (!item) return false;
  if (item.beverageStorageMode === 'chiller') return true;
  if (
    item.beverageStorageMode === 'extras_store' ||
    item.beverageStorageMode === 'juice_bar' ||
    item.beverageStorageMode === 'standard'
  ) {
    return false;
  }
  const loc = (item.location || '').toLowerCase();
  if (loc.includes('extras') || loc.includes('juice bar') || loc.includes('cooking') || loc.includes('dry ration') || loc.includes('spice') || loc.includes('freezer')) {
    return false;
  }
  if (isJuiceBarPreparedName(item.name, item.category)) {
    return false;
  }
  const cat = (item.category || '').toLowerCase();
  const nm = (item.name || '').toLowerCase();
  // Raw ingredients like Soda Water / Ice / Sugar / Milk belong to kitchen/bar unless explicitly marked 'chiller'
  if (nm === 'soda water' || nm === 'ice' || nm === 'ice cubes' || nm === 'lemon') {
    return false;
  }
  return (
    cat === 'beverages' ||
    cat === 'beverage' ||
    cat === 'drinks' ||
    nm.includes('coca cola') ||
    nm.includes('coke') ||
    nm.includes('sprite') ||
    nm.includes('fanta') ||
    nm.includes('pepsi') ||
    nm.includes('7up') ||
    nm.includes('mountain dew') ||
    nm.includes('dew can') ||
    nm.includes('mirinda') ||
    nm.includes('marinda') ||
    nm.includes('sting') ||
    nm.includes('pakola') ||
    nm.includes('red bull') ||
    nm.includes('mineral water') ||
    nm === 'water' ||
    nm.includes('soft drink') ||
    nm.includes('cold drink')
  );
}

export type StockMovementType = 'receive' | 'usage' | 'wastage' | 'adjust' | 'transfer' | 'handover';

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
  fromLocation?: string;
  toLocation?: string;
  fromFloor?: string;
  toFloor?: string;
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

export type StorageZoneType =
  | 'main_store'
  | 'extras_store'
  | 'kitchen'
  | 'juice_bar'
  | 'cold_room'
  | 'freezer'
  | 'floor_chiller'
  | 'packaging'
  | 'custom';

export type StorageZone = {
  id: string;
  name: string;
  urduName?: string;
  type: StorageZoneType;
  floor?: string;
  inCharge?: string;
  capacityNote?: string;
  description?: string;
  isActive: boolean;
  isSystem?: boolean;
  createdAt: number;
  updatedAt: number;
};

export const STORAGE_LOCATIONS = [
  'Main Central Store',
  'Extras Store',
  'Juice Bar Station',
  'Cooking Line / Kitchen',
  'Walk-in Chiller',
  'Deep Freezer #1 (Meat)',
  'Deep Freezer #2 (Poultry)',
  'Dry Ration Store - Shelf A',
  'Dry Ration Store - Shelf B',
  'Spice & Masala Rack',
  'Beverage Cold Room',
  'Ground Floor Chiller',
  'Family Floor Chiller',
  'Party Hall Chiller',
  'Rooftop Chiller',
  'Packaging Store',
] as const;

export const DEFAULT_STORAGE_ZONES: StorageZone[] = [
  { id: 'sz-main-store', name: 'Main Central Store', urduName: 'مرکزی گودام', type: 'main_store', description: 'Bulk inventory, receiving point & dry rations', isActive: true, isSystem: true, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-extras-store', name: 'Extras Store', urduName: 'ایکسٹرا اسٹور', type: 'extras_store', description: 'Extra beverages, reserve cartons & backup supplies (Not in Floor Chillers)', isActive: true, isSystem: true, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-juice-bar', name: 'Juice Bar Station', urduName: 'جوس بار اسٹیشن', type: 'juice_bar', description: 'Fresh mocktails, shakes, syrups & bar ingredients', isActive: true, isSystem: true, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-kitchen', name: 'Cooking Line / Kitchen', urduName: 'کچن اسٹیشنز', type: 'kitchen', description: 'Karahi, Handi, BBQ, Tandoor & Prep Stations', isActive: true, isSystem: true, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-walkin-chiller', name: 'Walk-in Chiller', urduName: 'واک ان چلر', type: 'cold_room', description: 'Dairy, fresh vegetables & cold prep ingredients', isActive: true, isSystem: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-freezer-1', name: 'Deep Freezer #1 (Meat)', urduName: 'ڈیپ فریزر (گوشت)', type: 'freezer', description: 'Mutton, beef & marinated red meat storage', isActive: true, isSystem: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-freezer-2', name: 'Deep Freezer #2 (Poultry)', urduName: 'ڈیپ فریزر (چکن)', type: 'freezer', description: 'Chicken, fish, fries & frozen items', isActive: true, isSystem: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-dry-a', name: 'Dry Ration Store - Shelf A', urduName: 'ڈرائی راشن شیلف اے', type: 'main_store', description: 'Rice, flour, grains, pulses & cooking oil', isActive: true, isSystem: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-dry-b', name: 'Dry Ration Store - Shelf B', urduName: 'ڈرائی راشن شیلف بی', type: 'main_store', description: 'Canned goods, sauces, pastes & bakery supplies', isActive: true, isSystem: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-spices', name: 'Spice & Masala Rack', urduName: 'مصالحہ ریک', type: 'kitchen', description: 'Whole spices, Sultan special masalas & dry herbs', isActive: true, isSystem: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-bev-cold', name: 'Beverage Cold Room', urduName: 'مشروبات کولڈ روم', type: 'cold_room', description: 'Bulk cold drink crates before floor chiller refill', isActive: true, isSystem: true, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'sz-packaging', name: 'Packaging Store', urduName: 'پیکجنگ اسٹور', type: 'packaging', description: 'Takeaway boxes, bags, foil, napkins & disposables', isActive: true, isSystem: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
];

export const CHILLER_FLOORS = [
  'Ground Floor',
  'Rooftop',
  'Family Floor',
  'Party Hall',
] as const;

export type ChillerFloor = typeof CHILLER_FLOORS[number];

export function normalizeChillerFloor(rawFloor?: string): ChillerFloor {
  if (!rawFloor) return 'Ground Floor';
  const f = rawFloor.trim().toLowerCase();
  if (f.includes('roof') || f.includes('terrace') || f.includes('rt')) return 'Rooftop';
  if (f.includes('party') || f.includes('banquet') || f.includes('pa') || f.includes('2') || f.includes('3')) return 'Party Hall';
  if (f.includes('family') || f.includes('fa') || f.includes('1') || f.includes('first')) return 'Family Floor';
  if (f.includes('ground') || f === 'g' || f === 'gf' || f === '0') return 'Ground Floor';
  return 'Ground Floor';
}

export type ChillerHandoverRecord = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode?: string;
  unit: string;
  qty: number;
  fromLocation: string; // e.g. "Beverage Cold Room" / "Main Storage"
  toFloor: string; // e.g. "Ground Floor"
  toChiller: string; // e.g. "Ground Floor Chiller"
  handedOverBy: string; // Manager / Storekeeper name
  receivedByFloorManager: string; // Floor Manager name
  at: number;
  notes?: string;
  status: 'transferred' | 'verified';
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
  sourcePaymentId?: string;
  sourcePOId?: string;
  isCapEx?: boolean;
  headType?: 'opex' | 'capex';
  assetId?: string;
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

export const INVENTORY_CATEGORIES = SULTAN_INVENTORY_CATEGORIES;

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

// ---------- Official Sultan Restaurant Inventory Catalog (19 Categories, 124 Items) ----------

export const INITIAL_INVENTORY: InventoryItem[] = SULTAN_DEFAULT_INVENTORY;

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

export type SupplierType = 'inventory' | 'assets';

export type Supplier = {
  id: string;
  name: string;
  category: SupplierCategory | AssetCategory | string;
  supplierType?: SupplierType;
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
  supplierType?: SupplierType;
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
  category: AssetCategory | string;
  purchaseDate: number;
  cost: number;
  quantity: number;
  totalCost: number;
  vendor: string;
  vendorPhone?: string;
  supplierId?: string;
  supplierName?: string;
  sourcePOId?: string;
  isCapEx?: boolean;
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
  storageZones?: StorageZone[];
  inventoryResetEpoch?: number;
  deletedInventoryIds?: string[];
  deletedStorageZoneIds?: string[];
  deletedInventoryCategories?: string[];
  deletedRecordIds?: string[];
  inventoryCategories?: string[];
  assetCategories?: string[];
  expenseCategories?: string[];
  stockMovements: StockMovement[];
  chillerHandovers: ChillerHandoverRecord[];
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
  'storageZones',
  'inventoryResetEpoch',
  'deletedInventoryIds',
  'deletedStorageZoneIds',
  'deletedInventoryCategories',
  'deletedRecordIds',
  'inventoryCategories',
  'assetCategories',
  'expenseCategories',
  'stockMovements',
  'chillerHandovers',
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
  catalogSeedVersion?: number;
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

  // Storage Zones Management
  addStorageZone: (zone: Omit<StorageZone, 'id' | 'createdAt' | 'updatedAt'>) => StorageZone;
  updateStorageZone: (id: string, patch: Partial<Omit<StorageZone, 'id' | 'createdAt'>>) => void;
  deleteStorageZone: (id: string, fallbackLocation?: string) => void;
  transferStockBetweenZones: (params: {
    itemId: string;
    qty: number;
    fromLocation: string;
    toLocation: string;
    mode?: 'move' | 'issue';
    by?: string;
    receivedBy?: string;
    notes?: string;
  }) => boolean;
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
      fromLocation?: string;
      toLocation?: string;
      fromFloor?: string;
      toFloor?: string;
    }
  ) => void;
  handoverBeveragesToFloor: (params: {
    itemId: string;
    qty: number;
    toFloor: string;
    fromLocation?: string;
    handedOverBy: string;
    receivedByFloorManager: string;
    notes?: string;
  }) => boolean;
  refillChillerProduct: (params: {
    itemId: string;
    floor: string;
    qty: number;
    fromLocation?: string;
    by?: string;
    notes?: string;
  }) => boolean;
  handoverKitchenStock: (params: {
    itemId: string;
    qty: number;
    fromLocation?: string;
    toLocation?: string;
    handedOverBy?: string;
    receivedByKitchen?: string;
    notes?: string;
  }) => boolean;
  deductFloorBeverageUsage: (params: {
    floor: string;
    items: { menuItemId?: string; name: string; qty: number }[];
    tableId?: string;
    tableName?: string;
    orderId?: string;
    by?: string;
  }) => void;
  adjustFloorChillerStock: (params: {
    itemId: string;
    floor: string;
    newStock: number;
    reason?: string;
    by?: string;
  }) => void;
  syncMenuBeveragesToInventory: (menuItems?: { id: string; name: string; category?: string; price: number; urduName?: string; station?: string; beverageHandling?: string }[]) => { added: number; updated: number; removedPrepared?: number };

  // Expenses
  addExpense: (expense: Omit<Expense, 'id' | 'at'> & { at?: number }) => void;
  updateExpense: (id: string, patch: Partial<Omit<Expense, 'id'>>) => void;
  deleteExpense: (id: string) => void;
  addExpenseCategory: (category: string) => void;
  renameExpenseCategory: (oldName: string, newName: string) => void;
  deleteExpenseCategory: (category: string) => void;

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
  addAssetCategory: (category: string) => void;
  renameAssetCategory: (oldName: string, newName: string) => void;
  deleteAssetCategory: (category: string) => void;
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
      storageZones: [...DEFAULT_STORAGE_ZONES],
      deletedInventoryIds: [],
      deletedStorageZoneIds: [],
      deletedInventoryCategories: [],
      inventoryCategories: [...INVENTORY_CATEGORIES],
      assetCategories: [...ASSET_CATEGORIES],
      expenseCategories: [...EXPENSE_CATEGORIES],
      stockMovements: INITIAL_STOCK_MOVEMENTS,
      chillerHandovers: [],
      expenses: [],
      feedback: [],
      unavailableItemIds: [],
      suppliers: INITIAL_SUPPLIERS,
      purchaseOrders: INITIAL_PURCHASE_ORDERS,
      supplierPayments: INITIAL_SUPPLIER_PAYMENTS,
      assets: INITIAL_ASSETS,
      damageRecords: INITIAL_DAMAGES,
      dummyPurgeVersion: 3,
      catalogSeedVersion: 1,

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
          const delCats = new Set((state.deletedInventoryCategories || []).map((d) => d.toLowerCase()));
          const currentCats = Array.isArray(state.inventoryCategories)
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES].filter((c) => !delCats.has(c.toLowerCase()));
          const nextCats = cat && !currentCats.some((c) => c.toLowerCase() === cat.toLowerCase())
            ? [...currentCats, cat]
            : currentCats;
          let finalCode = (item.itemCode || '').trim();
          if (!finalCode) {
            let maxNum = 0;
            state.inventory.forEach((it) => {
              const m = (it.itemCode || '').match(/(\d+)$/);
              if (m) {
                const n = parseInt(m[1], 10);
                if (Number.isFinite(n) && n > maxNum) maxNum = n;
              }
            });
            const cleanCat = cat.replace(/[^a-zA-Z]/g, '').toUpperCase();
            const pref = cleanCat.length >= 2 ? cleanCat.slice(0, 2) : 'RM';
            finalCode = `SKU-${pref}-${String(Math.max(maxNum + 1, state.inventory.length + 1)).padStart(3, '0')}`;
          }
          return {
            inventory: [...state.inventory, { ...item, itemCode: finalCode, id: uid('inv'), updatedAt: Date.now() }],
            inventoryCategories: nextCats,
          };
        });
        notifySync();
      },

      updateInventoryItem: (id, patch) => {
        set((state) => {
          const cat = (patch.category || '').trim();
          const delCats = new Set((state.deletedInventoryCategories || []).map((d) => d.toLowerCase()));
          const currentCats = Array.isArray(state.inventoryCategories)
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES].filter((c) => !delCats.has(c.toLowerCase()));
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
        set((state) => ({
          inventory: state.inventory.filter((i) => i.id !== id),
          deletedInventoryIds: Array.from(new Set([...(state.deletedInventoryIds || []), id])).slice(-500),
        }));
        notifySync();
      },

      addStorageZone: (zone) => {
        const now = Date.now();
        const created: StorageZone = {
          ...zone,
          name: zone.name.trim(),
          urduName: zone.urduName?.trim() || undefined,
          id: uid('sz-'),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const current = Array.isArray(state.storageZones) && state.storageZones.length > 0
            ? state.storageZones
            : [...DEFAULT_STORAGE_ZONES];
          const exists = current.find((z) => z.name.toLowerCase() === created.name.toLowerCase());
          if (exists) return state;
          return {
            storageZones: [...current, created],
          };
        });
        notifySync();
        return created;
      },

      updateStorageZone: (id, patch) => {
        set((state) => {
          const current = Array.isArray(state.storageZones) && state.storageZones.length > 0
            ? state.storageZones
            : [...DEFAULT_STORAGE_ZONES];
          const oldZone = current.find((z) => z.id === id);
          if (!oldZone) return state;
          const oldName = oldZone.name;
          const newName = patch.name !== undefined ? patch.name.trim() : oldName;
          const updatedZones = current.map((z) =>
            z.id === id
              ? {
                  ...z,
                  ...patch,
                  name: newName || oldName,
                  updatedAt: Date.now(),
                }
              : z
          );
          const renamed = Boolean(newName && newName !== oldName);
          return {
            storageZones: updatedZones,
            inventory: renamed
              ? state.inventory.map((it) =>
                  (it.location || 'Main Central Store') === oldName
                    ? { ...it, location: newName, updatedAt: Date.now() }
                    : it
                )
              : state.inventory,
            stockMovements: renamed
              ? state.stockMovements.map((m) => ({
                  ...m,
                  fromLocation: m.fromLocation === oldName ? newName : m.fromLocation,
                  toLocation: m.toLocation === oldName ? newName : m.toLocation,
                }))
              : state.stockMovements,
          };
        });
        notifySync();
      },

      deleteStorageZone: (id, fallbackLocation = 'Main Central Store') => {
        set((state) => {
          const current = Array.isArray(state.storageZones) && state.storageZones.length > 0
            ? state.storageZones
            : [...DEFAULT_STORAGE_ZONES];
          const target = current.find((z) => z.id === id);
          if (!target) return state;
          const remaining = current.filter((z) => z.id !== id);
          return {
            storageZones: remaining.length > 0 ? remaining : [...DEFAULT_STORAGE_ZONES],
            deletedStorageZoneIds: Array.from(new Set([...(state.deletedStorageZoneIds || []), id])).slice(-300),
            inventory: state.inventory.map((it) =>
              it.location === target.name
                ? { ...it, location: fallbackLocation, updatedAt: Date.now() }
                : it
            ),
          };
        });
        notifySync();
      },

      transferStockBetweenZones: ({ itemId, qty, fromLocation, toLocation, mode = 'move', by, receivedBy, notes }) => {
        let success = false;
        set((state) => {
          const item = state.inventory.find((i) => i.id === itemId);
          if (!item || !Number.isFinite(qty) || qty <= 0) return state;
          const cleanFrom = (fromLocation || item.location || 'Main Central Store').trim();
          const cleanTo = (toLocation || 'Cooking Line / Kitchen').trim();
          if (cleanFrom === cleanTo && mode === 'move') return state;

          const transferQty = Math.min(qty, Math.max(0, item.stock));
          const now = Date.now();
          let nextInventory = [...state.inventory];

          if (mode === 'issue') {
            // Issue & deduct stock for station consumption (e.g. Main Store -> Kitchen / Juice Bar)
            nextInventory = nextInventory.map((i) =>
              i.id === itemId
                ? { ...i, stock: Math.max(0, Number((i.stock - qty).toFixed(3))), updatedAt: now }
                : i
            );
          } else {
            // Physical zone relocation / split stack between storage zones
            if (qty >= item.stock) {
              // Check if destination already has same item name + unit to merge cleanly
              const destMatch = nextInventory.find(
                (i) =>
                  i.id !== item.id &&
                  i.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
                  (i.location || 'Main Central Store') === cleanTo
              );
              if (destMatch) {
                nextInventory = nextInventory
                  .filter((i) => i.id !== item.id)
                  .map((i) =>
                    i.id === destMatch.id
                      ? { ...i, stock: Number((i.stock + item.stock).toFixed(3)), updatedAt: now }
                      : i
                  );
              } else {
                nextInventory = nextInventory.map((i) =>
                  i.id === itemId ? { ...i, location: cleanTo, updatedAt: now } : i
                );
              }
            } else {
              // Partial move: reduce source item stock and add/increment in destination zone
              nextInventory = nextInventory.map((i) =>
                i.id === itemId
                  ? { ...i, stock: Math.max(0, Number((i.stock - transferQty).toFixed(3))), updatedAt: now }
                  : i
              );
              const destMatch = nextInventory.find(
                (i) =>
                  i.id !== item.id &&
                  i.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
                  (i.location || 'Main Central Store') === cleanTo
              );
              if (destMatch) {
                nextInventory = nextInventory.map((i) =>
                  i.id === destMatch.id
                    ? { ...i, stock: Number((i.stock + transferQty).toFixed(3)), updatedAt: now }
                    : i
                );
              } else {
                nextInventory.push({
                  ...item,
                  id: uid('inv'),
                  itemCode: item.itemCode ? `${item.itemCode}-Z` : undefined,
                  location: cleanTo,
                  stock: Number(transferQty.toFixed(3)),
                  updatedAt: now,
                });
              }
            }
          }

          const movement: StockMovement = {
            id: uid('mv'),
            itemId: item.id,
            itemName: item.name,
            itemCode: item.itemCode,
            unit: item.unit,
            type: mode === 'issue' ? 'handover' : 'transfer',
            qty,
            delta: mode === 'issue' ? -qty : 0,
            note: `${mode === 'issue' ? 'Station Issue' : 'Zone Transfer'}: ${cleanFrom} ➔ ${cleanTo} (${qty} ${item.unit})${receivedBy ? ` | Received by: ${receivedBy}` : ''}${notes ? ` | ${notes}` : ''}`,
            by: by || 'Store Manager',
            at: now,
            fromLocation: cleanFrom,
            toLocation: cleanTo,
          };

          success = true;
          return {
            inventory: nextInventory,
            stockMovements: [movement, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        });
        if (success) notifySync();
        return success;
      },

      addInventoryCategory: (category) => {
        const clean = (category || '').trim();
        if (!clean) return;
        set((state) => {
          const delCats = new Set((state.deletedInventoryCategories || []).map((d) => d.toLowerCase()));
          const currentCats = Array.isArray(state.inventoryCategories)
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES].filter((c) => !delCats.has(c.toLowerCase()));
          const nextDeleted = (state.deletedInventoryCategories || []).filter(
            (d) => d.toLowerCase() !== clean.toLowerCase()
          );
          if (currentCats.some((c) => c.toLowerCase() === clean.toLowerCase())) {
            return { deletedInventoryCategories: nextDeleted };
          }
          return {
            inventoryCategories: [...currentCats, clean],
            deletedInventoryCategories: nextDeleted,
          };
        });
        notifySync();
      },

      renameInventoryCategory: (oldName, newName) => {
        const cleanOld = (oldName || '').trim();
        const cleanNew = (newName || '').trim();
        if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
        set((state) => {
          const delCats = new Set((state.deletedInventoryCategories || []).map((d) => d.toLowerCase()));
          const currentCats = Array.isArray(state.inventoryCategories)
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES].filter((c) => !delCats.has(c.toLowerCase()));
          const updatedCats = currentCats.map((c) => (c === cleanOld ? cleanNew : c));
          const dedupedCats = Array.from(new Set(updatedCats));
          return {
            inventoryCategories: dedupedCats,
            deletedInventoryCategories: Array.from(
              new Set([...(state.deletedInventoryCategories || []).filter((d) => d.toLowerCase() !== cleanNew.toLowerCase()), cleanOld])
            ).slice(-300),
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
          const delCats = new Set((state.deletedInventoryCategories || []).map((d) => d.toLowerCase()));
          const currentCats = Array.isArray(state.inventoryCategories)
            ? state.inventoryCategories
            : [...INVENTORY_CATEGORIES].filter((c) => !delCats.has(c.toLowerCase()));
          const filtered = currentCats.filter((c) => c !== clean);
          return {
            inventoryCategories: filtered,
            deletedInventoryCategories: Array.from(new Set([...(state.deletedInventoryCategories || []), clean])).slice(-300),
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
            fromLocation: meta?.fromLocation,
            toLocation: meta?.toLocation,
            fromFloor: meta?.fromFloor,
            toFloor: meta?.toFloor,
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

      handoverBeveragesToFloor: ({
        itemId,
        qty,
        toFloor,
        fromLocation = 'Beverage Cold Room',
        handedOverBy,
        receivedByFloorManager,
        notes,
      }) => {
        let success = false;
        set((state) => {
          const item = state.inventory.find((i) => i.id === itemId);
          if (!item || qty <= 0) return state;

          const currentFloorStock = Number(item.chillerStock?.[toFloor] || 0);
          const nextFloorStock = currentFloorStock + qty;

          const updatedChillerStock = {
            ...(item.chillerStock || {}),
            [toFloor]: nextFloorStock,
          };

          const handoverId = uid('hnd');
          const handoverRecord: ChillerHandoverRecord = {
            id: handoverId,
            itemId,
            itemName: item.name,
            itemCode: item.itemCode,
            unit: item.unit,
            qty,
            fromLocation,
            toFloor,
            toChiller: `${toFloor} Chiller`,
            handedOverBy: handedOverBy || 'Store Manager',
            receivedByFloorManager: receivedByFloorManager || 'Floor Manager',
            at: Date.now(),
            notes,
            status: 'transferred',
          };

          const movement: StockMovement = {
            id: uid('mv'),
            itemId,
            itemName: item.name,
            itemCode: item.itemCode,
            type: 'handover',
            qty,
            delta: 0,
            note: `Handover to ${toFloor} Chiller (${receivedByFloorManager ? `Received by ${receivedByFloorManager}` : 'Pending Reception'})`,
            by: handedOverBy,
            at: Date.now(),
            fromLocation,
            toLocation: `${toFloor} Chiller`,
            toFloor,
          };

          success = true;
          return {
            inventory: state.inventory.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    chillerStock: updatedChillerStock,
                    updatedAt: Date.now(),
                  }
                : i
            ),
            chillerHandovers: [handoverRecord, ...(state.chillerHandovers || [])].slice(0, 100),
            stockMovements: [movement, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        });
        if (success) notifySync();
        return success;
      },

      refillChillerProduct: ({ itemId, floor, qty, fromLocation = 'Beverage Cold Room', by, notes }) => {
        let success = false;
        const normFloor = normalizeChillerFloor(floor);
        set((state) => {
          const item = state.inventory.find((i) => i.id === itemId);
          if (!item || qty <= 0) return state;

          const currentFloorStock = Number(item.chillerStock?.[normFloor] || 0);
          const nextFloorStock = currentFloorStock + qty;

          const updatedChillerStock = {
            ...(item.chillerStock || {}),
            [normFloor]: nextFloorStock,
          };

          const handoverId = uid('hnd');
          const handoverRecord: ChillerHandoverRecord = {
            id: handoverId,
            itemId,
            itemName: item.name,
            itemCode: item.itemCode,
            unit: item.unit,
            qty,
            fromLocation,
            toFloor: normFloor,
            toChiller: `${normFloor} Chiller`,
            handedOverBy: by || 'Inventory Manager',
            receivedByFloorManager: `${normFloor} Chiller (Direct Refill)`,
            at: Date.now(),
            notes: notes || `Direct Chiller Refill (+${qty} ${item.unit})`,
            status: 'transferred',
          };

          const movement: StockMovement = {
            id: uid('mv'),
            itemId,
            itemName: item.name,
            itemCode: item.itemCode,
            type: 'transfer',
            qty,
            delta: 0,
            note: `Chiller Refill to ${normFloor} Chiller (+${qty} ${item.unit})${notes ? ` - ${notes}` : ''}`,
            by: by || 'Inventory Manager',
            at: Date.now(),
            fromLocation,
            toLocation: `${normFloor} Chiller`,
            toFloor: normFloor,
          };

          success = true;
          return {
            inventory: state.inventory.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    chillerStock: updatedChillerStock,
                    updatedAt: Date.now(),
                  }
                : i
            ),
            chillerHandovers: [handoverRecord, ...(state.chillerHandovers || [])].slice(0, 100),
            stockMovements: [movement, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        });
        if (success) notifySync();
        return success;
      },

      handoverKitchenStock: ({
        itemId,
        qty,
        fromLocation = 'Main Central Store',
        toLocation = 'Cooking Line / Kitchen',
        handedOverBy,
        receivedByKitchen,
        notes,
      }) => {
        let success = false;
        set((state) => {
          const item = state.inventory.find((i) => i.id === itemId);
          if (!item || qty <= 0) return state;

          const movement: StockMovement = {
            id: uid('mv'),
            itemId,
            itemName: item.name,
            itemCode: item.itemCode,
            type: 'handover',
            qty,
            delta: 0,
            note: `Kitchen Handover: ${fromLocation} ➔ ${toLocation} (${qty} ${item.unit})${receivedByKitchen ? ` | Received by: ${receivedByKitchen}` : ''}${notes ? ` | Notes: ${notes}` : ''}`,
            by: handedOverBy || 'Store Manager',
            at: Date.now(),
            fromLocation,
            toLocation,
          };

          success = true;
          return {
            stockMovements: [movement, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        });
        if (success) notifySync();
        return success;
      },

      deductFloorBeverageUsage: ({ floor, items, tableId, tableName, orderId, by }) => {
        if (!items || items.length === 0) return;
        const normFloor = normalizeChillerFloor(floor);
        set((state) => {
          let hasChanged = false;
          const newMovements: StockMovement[] = [];
          const updatedInventory = state.inventory.map((invItem) => {
            // STRICT SEPARATION: Only packaged Chiller Drinks auto-deduct from Floor Chillers (NEVER Juice Bar prepared drinks or Extras Store!)
            if (!isChillerBeverageItem(invItem)) return invItem;

            const target = items.find(
              (it) =>
                !isJuiceBarPreparedName(it.name) &&
                ((invItem.menuItemId && it.menuItemId === invItem.menuItemId) ||
                  invItem.id === it.menuItemId ||
                  invItem.name.toLowerCase().trim() === it.name.toLowerCase().trim() ||
                  invItem.name.toLowerCase().includes(it.name.toLowerCase().trim()) ||
                  it.name.toLowerCase().includes(invItem.name.toLowerCase().trim()))
            );

            if (!target || target.qty <= 0) return invItem;

            hasChanged = true;
            const currentFloorQty = Number(invItem.chillerStock?.[normFloor] || 0);
            const deductFloorQty = Math.min(currentFloorQty, target.qty);
            const nextFloorQty = Math.max(0, currentFloorQty - target.qty);
            const nextTotalStock = Math.max(0, invItem.stock - target.qty);

            newMovements.push({
              id: uid('mv'),
              itemId: invItem.id,
              itemName: invItem.name,
              itemCode: invItem.itemCode,
              type: 'usage',
              qty: target.qty,
              delta: -target.qty,
              note: `Floor Order at ${tableName || tableId || normFloor}${orderId ? ` (#${orderId})` : ''} [${normFloor} Chiller: -${target.qty}]`,
              by: by || 'POS / Waiter',
              at: Date.now(),
              fromFloor: normFloor,
              fromLocation: `${normFloor} Chiller`,
            });

            return {
              ...invItem,
              stock: nextTotalStock,
              chillerStock: {
                ...(invItem.chillerStock || {}),
                [normFloor]: nextFloorQty,
              },
              updatedAt: Date.now(),
            };
          });

          if (!hasChanged) return state;

          return {
            inventory: updatedInventory,
            stockMovements: [...newMovements, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        });
        notifySync();
      },

      adjustFloorChillerStock: ({ itemId, floor, newStock, reason, by }) => {
        let hasChanged = false;
        set((state) => {
          const item = state.inventory.find((i) => i.id === itemId);
          if (!item) return state;

          const oldFloorStock = Number(item.chillerStock?.[floor] || 0);
          const safeNewStock = Math.max(0, Number(newStock) || 0);
          const diff = safeNewStock - oldFloorStock;
          if (diff === 0) return state;

          hasChanged = true;
          const movement: StockMovement = {
            id: uid('mv'),
            itemId,
            itemName: item.name,
            itemCode: item.itemCode,
            type: 'adjust',
            qty: safeNewStock,
            delta: diff,
            note: `${floor} Chiller stock count audit: ${oldFloorStock} ➔ ${safeNewStock} (${reason || 'Physical Count'})`,
            by: by || 'Floor Manager',
            at: Date.now(),
            toFloor: floor,
            toLocation: `${floor} Chiller`,
          };

          return {
            inventory: state.inventory.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    chillerStock: {
                      ...(i.chillerStock || {}),
                      [floor]: safeNewStock,
                    },
                    updatedAt: Date.now(),
                  }
                : i
            ),
            stockMovements: [movement, ...state.stockMovements].slice(0, MAX_MOVEMENTS),
          };
        });
        if (hasChanged) notifySync();
      },

      syncMenuBeveragesToInventory: (menuItems) => {
        let addedCount = 0;
        let updatedCount = 0;
        let removedPrepared = 0;

        // ONLY genuine packaged Chiller Cold Drinks & Bottled Water (NEVER Juice Bar prepared mocktails/shakes/juices!)
        const defaultChillerBeverages = [
          { id: 'slt-drk-soft-drink', name: 'Soft Drink (Regular)', urduName: 'سافٹ ڈرنک', unit: 'bottles', price: 150, category: 'Beverages' },
          { id: 'slt-drk-water', name: 'Mineral Water 500ml', urduName: 'منرل واٹر', unit: 'bottles', price: 70, category: 'Beverages' },
          { id: 'slt-drk-water-lg', name: 'Mineral Water 1.5L', urduName: 'منرل واٹر بڑا', unit: 'bottles', price: 130, category: 'Beverages' },
          { id: 'slt-drk-coke-can', name: 'Coca Cola Can 250ml', urduName: 'کوکا کولا کین', unit: 'cans', price: 180, category: 'Beverages' },
          { id: 'slt-drk-coke-15', name: 'Coca Cola 1.5L', urduName: 'کوکا کولا 1.5 لیٹر', unit: 'bottles', price: 250, category: 'Beverages' },
          { id: 'slt-drk-sprite-can', name: 'Sprite Can 250ml', urduName: 'اسپرائٹ کین', unit: 'cans', price: 180, category: 'Beverages' },
          { id: 'slt-drk-sprite-15', name: 'Sprite 1.5L', urduName: 'اسپرائٹ 1.5 لیٹر', unit: 'bottles', price: 250, category: 'Beverages' },
          { id: 'slt-drk-fanta-15', name: 'Fanta 1.5L', urduName: 'فینٹا 1.5 لیٹر', unit: 'bottles', price: 250, category: 'Beverages' },
          { id: 'slt-drk-pepsi-15', name: 'Pepsi 1.5L', urduName: 'پیپسی 1.5 لیٹر', unit: 'bottles', price: 250, category: 'Beverages' },
          { id: 'slt-drk-7up-15', name: '7up 1.5L', urduName: 'سیون اپ 1.5 لیٹر', unit: 'bottles', price: 250, category: 'Beverages' },
          { id: 'slt-drk-dew-can', name: 'Mountain Dew Can', urduName: 'ڈیو کین', unit: 'cans', price: 180, category: 'Beverages' },
          { id: 'slt-drk-sting', name: 'Sting Berry Blast', urduName: 'اسٹنگ انرجی', unit: 'bottles', price: 120, category: 'Beverages' },
        ];

        set((state) => {
          const deletedIdsToRecord: string[] = [];
          // Purge any legacy auto-generated Juice Bar mocktails/fresh drinks that were wrongly placed into Chillers
          let existingInv = state.inventory.filter((it) => {
            const isLegacyAutoMocktail =
              (it.id.startsWith('inv-slt-mck-') ||
                it.id === 'inv-slt-drk-mint-lemonade' ||
                it.id === 'inv-slt-drk-roohafza') &&
              isJuiceBarPreparedName(it.name, it.category);
            if (isLegacyAutoMocktail) {
              deletedIdsToRecord.push(it.id);
              removedPrepared++;
              return false;
            }
            return true;
          });

          let changed = removedPrepared > 0;

          const candidates: { id?: string; name: string; urduName?: string; price?: number; category?: string; unit?: string }[] = [];
          if (Array.isArray(menuItems) && menuItems.length > 0) {
            menuItems.forEach((m) => {
              // Strictly separate Menu Dishes, Juice Bar Prepared Drinks & Extras Store items from Chillers!
              if (
                m.beverageHandling === 'juice_bar_prepared' ||
                m.beverageHandling === 'extras_store' ||
                m.beverageHandling === 'kitchen_dish'
              ) {
                return;
              }
              if (isJuiceBarPreparedName(m.name, m.category)) {
                return;
              }
              const nm = (m.name || '').toLowerCase();
              const isExplicitChiller = m.beverageHandling === 'chiller_drink';
              const isPackagedColdDrink =
                nm.includes('coca cola') ||
                nm.includes('coke') ||
                nm.includes('sprite') ||
                nm.includes('fanta') ||
                nm.includes('pepsi') ||
                nm.includes('7up') ||
                nm.includes('dew') ||
                nm.includes('mirinda') ||
                nm.includes('marinda') ||
                nm.includes('sting') ||
                nm.includes('pakola') ||
                nm.includes('red bull') ||
                nm.includes('mineral water') ||
                nm === 'water' ||
                nm.includes('soft drink') ||
                nm.includes('cold drink');
              if (isExplicitChiller || isPackagedColdDrink) {
                candidates.push({
                  id: m.id,
                  name: m.name,
                  urduName: m.urduName,
                  price: m.price,
                  category: 'Beverages',
                  unit: nm.includes('can') || nm.includes('tin') ? 'cans' : 'bottles',
                });
              }
            });
          }

          defaultChillerBeverages.forEach((d) => {
            if (!candidates.some((c) => c.name.toLowerCase().trim() === d.name.toLowerCase().trim())) {
              candidates.push(d);
            }
          });

          candidates.forEach((cand) => {
            const foundIdx = existingInv.findIndex(
              (i) =>
                (cand.id && i.menuItemId === cand.id) ||
                i.name.toLowerCase().trim() === cand.name.toLowerCase().trim() ||
                (cand.id && i.id === cand.id) ||
                (cand.id && i.id === `inv-${cand.id}`)
            );

            if (foundIdx >= 0) {
              const cur = existingInv[foundIdx];
              // Respect user choice if they moved this beverage to Extras Store or Juice Bar!
              if (cur.beverageStorageMode === 'extras_store' || cur.beverageStorageMode === 'juice_bar') {
                return;
              }
              const curChillers = cur.chillerStock || {};
              let chillerUpdated = false;
              const nextChillers: Record<string, number> = { ...curChillers };
              CHILLER_FLOORS.forEach((floor) => {
                if (typeof nextChillers[floor] !== 'number') {
                  nextChillers[floor] = 24;
                  chillerUpdated = true;
                }
              });

              if (!cur.menuItemId || cur.beverageStorageMode !== 'chiller' || chillerUpdated) {
                existingInv[foundIdx] = {
                  ...cur,
                  menuItemId: cur.menuItemId || cand.id,
                  beverageStorageMode: 'chiller',
                  chillerStock: nextChillers,
                  category: cur.category || 'Beverages',
                  updatedAt: Date.now(),
                };
                changed = true;
                updatedCount++;
              }
            } else {
              const initialChillers: Record<string, number> = {};
              CHILLER_FLOORS.forEach((fl) => {
                initialChillers[fl] = 24;
              });

              const newInvItem: InventoryItem = {
                id: cand.id ? `inv-${cand.id}` : uid('inv'),
                itemCode: `BEV-${Math.floor(100 + Math.random() * 900)}`,
                name: cand.name,
                urduName: cand.urduName || 'کولڈ ڈرنک',
                category: 'Beverages',
                unit: cand.unit || 'bottles',
                stock: 120,
                threshold: 15,
                costPerUnit: Math.round((cand.price || 150) * 0.5) || 60,
                location: 'Beverage Cold Room',
                beverageStorageMode: 'chiller',
                menuItemId: cand.id,
                chillerStock: initialChillers,
                chillerThreshold: 6,
                updatedAt: Date.now(),
              };

              existingInv.push(newInvItem);
              changed = true;
              addedCount++;
            }
          });

          if (!changed) return state;

          return {
            inventory: existingInv,
            deletedInventoryIds:
              deletedIdsToRecord.length > 0
                ? Array.from(new Set([...(state.deletedInventoryIds || []), ...deletedIdsToRecord])).slice(-500)
                : state.deletedInventoryIds,
          };
        });

        if (addedCount > 0 || updatedCount > 0 || removedPrepared > 0) notifySync();
        return { added: addedCount, updated: updatedCount, removedPrepared };
      },

      addExpense: (expense) => {
        const cat = (expense.category || '').trim();
        set((state) => {
          const currentCats = Array.isArray(state.expenseCategories) && state.expenseCategories.length > 0
            ? state.expenseCategories
            : [...EXPENSE_CATEGORIES];
          const nextCats = cat && !currentCats.some((c) => c.toLowerCase() === cat.toLowerCase())
            ? [...currentCats, cat]
            : currentCats;
          return {
            expenses: [{ ...expense, id: uid('ex'), at: expense.at ?? Date.now() }, ...state.expenses],
            expenseCategories: nextCats,
          };
        });
        notifySync();
      },

      updateExpense: (id, patch) => {
        set((state) => {
          const cat = patch.category ? (patch.category || '').trim() : '';
          const currentCats = Array.isArray(state.expenseCategories) && state.expenseCategories.length > 0
            ? state.expenseCategories
            : [...EXPENSE_CATEGORIES];
          const nextCats = cat && !currentCats.some((c) => c.toLowerCase() === cat.toLowerCase())
            ? [...currentCats, cat]
            : currentCats;
          return {
            expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
            expenseCategories: nextCats,
          };
        });
        notifySync();
      },

      deleteExpense: (id) => {
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
          deletedRecordIds: Array.from(new Set([...(state.deletedRecordIds || []), id])).slice(-800),
        }));
        notifySync();
      },

      addExpenseCategory: (category) => {
        const clean = (category || '').trim();
        if (!clean) return;
        set((state) => {
          const currentCats = Array.isArray(state.expenseCategories) && state.expenseCategories.length > 0
            ? state.expenseCategories
            : [...EXPENSE_CATEGORIES];
          if (currentCats.some((c) => c.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          return { expenseCategories: [...currentCats, clean] };
        });
        notifySync();
      },

      renameExpenseCategory: (oldName, newName) => {
        const cleanOld = (oldName || '').trim();
        const cleanNew = (newName || '').trim();
        if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
        set((state) => {
          const currentCats = Array.isArray(state.expenseCategories) && state.expenseCategories.length > 0
            ? state.expenseCategories
            : [...EXPENSE_CATEGORIES];
          const updatedCats = currentCats.map((c) => (c === cleanOld ? cleanNew : c));
          const dedupedCats = Array.from(new Set(updatedCats));
          return {
            expenseCategories: dedupedCats,
            expenses: state.expenses.map((e) =>
              e.category === cleanOld ? { ...e, category: cleanNew } : e
            ),
          };
        });
        notifySync();
      },

      deleteExpenseCategory: (category) => {
        const clean = (category || '').trim();
        if (!clean) return;
        set((state) => {
          const currentCats = Array.isArray(state.expenseCategories) && state.expenseCategories.length > 0
            ? state.expenseCategories
            : [...EXPENSE_CATEGORIES];
          const filtered = currentCats.filter((c) => c !== clean);
          return {
            expenseCategories: filtered.length > 0 ? filtered : [...EXPENSE_CATEGORIES],
          };
        });
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
          deletedRecordIds: Array.from(new Set([...(state.deletedRecordIds || []), id])).slice(-800),
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

          // 2. Auto Receive to inventory or assets if marked received/ordered with option
          let nextInventory = state.inventory;
          let nextMovements = state.stockMovements;
          let nextAssets = state.assets;
          const isAssetPurchase = po.supplierType === 'assets' || supplier?.supplierType === 'assets';

          if (isAssetPurchase && (po.status === 'received' || po.status === 'partial')) {
            po.items.forEach((item) => {
              const qtyToAdd = item.qtyReceived > 0 ? item.qtyReceived : item.qtyOrdered;
              if (qtyToAdd > 0) {
                const existing = nextAssets.find(
                  (a) => a.name.toLowerCase() === item.name.toLowerCase()
                );
                if (existing) {
                  const newQty = existing.quantity + qtyToAdd;
                  const newCost = item.unitCost || existing.cost;
                  const newTotal = newQty * newCost;
                  nextAssets = nextAssets.map((a) =>
                    a.id === existing.id
                      ? {
                          ...a,
                          quantity: newQty,
                          cost: newCost,
                          totalCost: newTotal,
                          currentValue: (a.currentValue || 0) + (qtyToAdd * newCost),
                          supplierId: po.supplierId || a.supplierId,
                          supplierName: po.supplierName || a.supplierName,
                          invoiceNo: po.invoiceNo || a.invoiceNo,
                          isCapEx: true,
                          updatedAt: now,
                        }
                      : a
                  );
                } else {
                  const total = qtyToAdd * (item.unitCost || 0);
                  const newAsset: Asset = {
                    id: uid('ast'),
                    assetCode: `AST-${Date.now().toString().slice(-4)}`,
                    name: item.name,
                    category: (item.category as AssetCategory) || (supplier?.category as AssetCategory) || 'Other Capital Assets',
                    purchaseDate: now,
                    cost: item.unitCost || 0,
                    quantity: qtyToAdd,
                    totalCost: total,
                    currentValue: total,
                    vendor: po.supplierName,
                    vendorPhone: supplier?.phone,
                    supplierId: po.supplierId,
                    supplierName: po.supplierName,
                    sourcePOId: po.id,
                    isCapEx: true,
                    invoiceNo: po.invoiceNo,
                    location: 'Main Store / Restaurant',
                    condition: 'brand_new',
                    status: 'active',
                    maintenanceLogs: [],
                    createdAt: now,
                    updatedAt: now,
                  };
                  nextAssets = [newAsset, ...nextAssets];
                }
              }
            });
          } else if (autoReceiveToInventory && (po.status === 'received' || po.status === 'partial')) {
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
            let expenseCategory: any = 'Groceries & Produce';
            let isCapEx = false;
            if (isAssetPurchase) {
              expenseCategory = 'Capital Asset Purchases (CapEx)';
              isCapEx = true;
            } else if (supplier?.category === 'Meat & Poultry') {
              expenseCategory = 'Meat & Poultry';
            } else if (supplier?.category === 'Dairy & Bakery') {
              expenseCategory = 'Dairy & Bakery';
            } else if (supplier?.category === 'Fuel & Charcoal') {
              expenseCategory = 'Gas / LPG / Charcoal';
            } else if (supplier?.category === 'Packaging & Disposables') {
              expenseCategory = 'Packaging & Supplies';
            }
            nextExpenses = [
              {
                id: uid('ex'),
                category: expenseCategory,
                amount: po.amountPaid,
                note: `PO #${po.poNumber} Payment to ${po.supplierName}${isAssetPurchase ? ' (CapEx Purchase)' : ''}`,
                method: po.paymentMethod === 'online' ? 'online' : 'cash',
                paidBy: receivedBy || po.receivedBy || 'Admin',
                at: now,
                sourcePOId: po.id,
                isCapEx,
                headType: isCapEx ? 'capex' : 'opex',
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
            assets: nextAssets,
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
          const supplier = state.suppliers.find((s) => s.id === po.supplierId);
          const isAssetPurchase = po.supplierType === 'assets' || supplier?.supplierType === 'assets';

          let nextInventory = state.inventory;
          let nextMovements = state.stockMovements;
          let nextAssets = state.assets;

          const updatedItems = po.items.map((item) => {
            const match = receivedItems?.find((ri) => (ri.itemId && ri.itemId === item.itemId) || ri.itemId === item.name);
            const qtyRec = match ? match.qtyReceived : item.qtyOrdered;

            if (isAssetPurchase) {
              if (qtyRec > 0) {
                const existing = nextAssets.find(
                  (a) => (item.itemId && a.id === item.itemId) || a.name.toLowerCase() === item.name.toLowerCase()
                );
                if (existing) {
                  const newQty = existing.quantity + qtyRec;
                  const newCost = item.unitCost || existing.cost;
                  const newTotal = newQty * newCost;
                  nextAssets = nextAssets.map((a) =>
                    a.id === existing.id
                      ? {
                          ...a,
                          quantity: newQty,
                          cost: newCost,
                          totalCost: newTotal,
                          currentValue: (a.currentValue || 0) + (qtyRec * newCost),
                          supplierId: po.supplierId || a.supplierId,
                          supplierName: po.supplierName || a.supplierName,
                          invoiceNo: po.invoiceNo || a.invoiceNo,
                          isCapEx: true,
                          updatedAt: now,
                        }
                      : a
                  );
                } else {
                  const total = qtyRec * (item.unitCost || 0);
                  const newAsset: Asset = {
                    id: uid('ast'),
                    assetCode: `AST-${Date.now().toString().slice(-4)}`,
                    name: item.name,
                    category: (item.category as AssetCategory) || (supplier?.category as AssetCategory) || 'Other Capital Assets',
                    purchaseDate: now,
                    cost: item.unitCost || 0,
                    quantity: qtyRec,
                    totalCost: total,
                    currentValue: total,
                    vendor: po.supplierName,
                    vendorPhone: supplier?.phone,
                    supplierId: po.supplierId,
                    supplierName: po.supplierName,
                    sourcePOId: po.id,
                    isCapEx: true,
                    invoiceNo: po.invoiceNo,
                    location: 'Main Store / Restaurant',
                    condition: 'brand_new',
                    status: 'active',
                    maintenanceLogs: [],
                    createdAt: now,
                    updatedAt: now,
                  };
                  nextAssets = [newAsset, ...nextAssets];
                }
              }
            } else {
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
            assets: nextAssets,
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
          const removedExpIds = state.expenses.filter((e) => e.sourcePOId === id).map((e) => e.id);
          const nextExpenses = state.expenses.filter((e) => e.sourcePOId !== id);
          return {
            purchaseOrders: state.purchaseOrders.filter((p) => p.id !== id),
            suppliers: updatedSuppliers,
            expenses: nextExpenses,
            deletedRecordIds: Array.from(new Set([...(state.deletedRecordIds || []), id, ...removedExpIds])).slice(-800),
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

          const removedExpIds = state.expenses.filter((e) => e.sourcePaymentId === id).map((e) => e.id);
          return {
            supplierPayments: state.supplierPayments.filter((p) => p.id !== id),
            suppliers: updatedSuppliers,
            purchaseOrders: updatedPOs,
            expenses: state.expenses.filter((e) => e.sourcePaymentId !== id),
            deletedRecordIds: Array.from(new Set([...(state.deletedRecordIds || []), id, ...removedExpIds])).slice(-800),
          };
        });
        notifySync();
      },

      // Assets & Capital Purchases
      addAsset: (asset) => {
        const cat = (asset.category || '').trim();
        set((state) => {
          const now = Date.now();
          const totalCost = asset.totalCost !== undefined ? asset.totalCost : asset.cost * asset.quantity;
          const currentValue = asset.currentValue !== undefined ? asset.currentValue : totalCost;
          const currentCats = Array.isArray(state.assetCategories) && state.assetCategories.length > 0
            ? state.assetCategories
            : [...ASSET_CATEGORIES];
          const nextCats = cat && !currentCats.some((c) => c.toLowerCase() === cat.toLowerCase())
            ? [...currentCats, cat]
            : currentCats;

          const newAsset: Asset = {
            ...asset,
            id: uid('ast'),
            assetCode: asset.assetCode || `AST-${Date.now().toString().slice(-4)}`,
            totalCost,
            currentValue,
            isCapEx: asset.isCapEx !== undefined ? asset.isCapEx : true,
            maintenanceLogs: [],
            createdAt: now,
            updatedAt: now,
          };
          return {
            assets: [newAsset, ...state.assets],
            assetCategories: nextCats,
          };
        });
        notifySync();
      },

      updateAsset: (id, patch) => {
        const cat = patch.category ? (patch.category || '').trim() : '';
        set((state) => {
          const currentCats = Array.isArray(state.assetCategories) && state.assetCategories.length > 0
            ? state.assetCategories
            : [...ASSET_CATEGORIES];
          const nextCats = cat && !currentCats.some((c) => c.toLowerCase() === cat.toLowerCase())
            ? [...currentCats, cat]
            : currentCats;

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
          return { assets: updated, assetCategories: nextCats };
        });
        notifySync();
      },

      deleteAsset: (id) => {
        set((state) => ({
          assets: state.assets.filter((a) => a.id !== id),
          deletedRecordIds: Array.from(new Set([...(state.deletedRecordIds || []), id])).slice(-800),
        }));
        notifySync();
      },

      addAssetCategory: (category) => {
        const clean = (category || '').trim();
        if (!clean) return;
        set((state) => {
          const currentCats = Array.isArray(state.assetCategories) && state.assetCategories.length > 0
            ? state.assetCategories
            : [...ASSET_CATEGORIES];
          if (currentCats.some((c) => c.toLowerCase() === clean.toLowerCase())) {
            return state;
          }
          return { assetCategories: [...currentCats, clean] };
        });
        notifySync();
      },

      renameAssetCategory: (oldName, newName) => {
        const cleanOld = (oldName || '').trim();
        const cleanNew = (newName || '').trim();
        if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
        set((state) => {
          const currentCats = Array.isArray(state.assetCategories) && state.assetCategories.length > 0
            ? state.assetCategories
            : [...ASSET_CATEGORIES];
          const updatedCats = currentCats.map((c) => (c === cleanOld ? cleanNew : c));
          const dedupedCats = Array.from(new Set(updatedCats));
          return {
            assetCategories: dedupedCats,
            assets: state.assets.map((a) =>
              a.category === cleanOld ? { ...a, category: cleanNew, updatedAt: Date.now() } : a
            ),
          };
        });
        notifySync();
      },

      deleteAssetCategory: (category) => {
        const clean = (category || '').trim();
        if (!clean) return;
        set((state) => {
          const currentCats = Array.isArray(state.assetCategories) && state.assetCategories.length > 0
            ? state.assetCategories
            : [...ASSET_CATEGORIES];
          const filtered = currentCats.filter((c) => c !== clean);
          return {
            assetCategories: filtered.length > 0 ? filtered : [...ASSET_CATEGORIES],
          };
        });
        notifySync();
      },

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
        notifySync();
      },

      // Damage Control & Breakages
      logDamageIncident: (record) => {
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
        });
        notifySync();
      },

      updateDamageRecord: (id, patch) => {
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
        });
        notifySync();
      },

      deleteDamageRecord: (id) => {
        set((state) => ({
          damageRecords: state.damageRecords.filter((d) => d.id !== id),
          deletedRecordIds: Array.from(new Set([...(state.deletedRecordIds || []), id])).slice(-800),
        }));
        notifySync();
      },

      resolveDamageRecord: (id, resolution) => {
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
        });
        notifySync();
      },

      syncFromServer: (remote) =>
        set((state) => {
          const isDummyInvId = (id?: string) => {
            const s = String(id || '').trim();
            return /^inv\d+$/.test(s) || s.startsWith('invmuzolyg') || s.startsWith('inv-slt-');
          };

          const remoteEpoch = Number(remote.inventoryResetEpoch || 0);
          const localEpoch = Number(state.inventoryResetEpoch || 0);

          // If remote is from BEFORE a clean-slate reset we already know about, ignore stale inventory/categories/movements!
          if (localEpoch > 0 && remoteEpoch < localEpoch) {
            const nextPartial: Partial<OpsState> = { dummyPurgeVersion: 3 };
            if (Array.isArray(remote.serviceRequests)) nextPartial.serviceRequests = remote.serviceRequests;
            if (Array.isArray(remote.expenses)) nextPartial.expenses = [...remote.expenses].sort((a, b) => (b.at || 0) - (a.at || 0));
            if (Array.isArray(remote.feedback)) nextPartial.feedback = remote.feedback;
            if (Array.isArray(remote.suppliers)) nextPartial.suppliers = remote.suppliers;
            if (Array.isArray(remote.purchaseOrders)) nextPartial.purchaseOrders = remote.purchaseOrders;
            if (Array.isArray(remote.supplierPayments)) nextPartial.supplierPayments = remote.supplierPayments;
            if (Array.isArray(remote.assets)) nextPartial.assets = remote.assets;
            if (Array.isArray(remote.damageRecords)) nextPartial.damageRecords = remote.damageRecords;
            return { ...state, ...nextPartial };
          }

          // If remote triggered a NEWER clean-slate reset, replace local inventory, categories & movements directly without merging stale local cache!
          if (remoteEpoch > localEpoch) {
            return {
              ...state,
              dummyPurgeVersion: 3,
              inventoryResetEpoch: remoteEpoch,
              inventory: Array.isArray(remote.inventory)
                ? remote.inventory.filter((i) => i && i.id && !isDummyInvId(i.id))
                : [],
              inventoryCategories: Array.isArray(remote.inventoryCategories) ? remote.inventoryCategories : [],
              deletedInventoryIds: Array.isArray(remote.deletedInventoryIds) ? remote.deletedInventoryIds : [],
              deletedInventoryCategories: Array.isArray(remote.deletedInventoryCategories) ? remote.deletedInventoryCategories : [],
              stockMovements: Array.isArray(remote.stockMovements)
                ? remote.stockMovements.filter((m) => m && !isDummyInvId(m.itemId))
                : [],
              chillerHandovers: Array.isArray(remote.chillerHandovers) ? remote.chillerHandovers : [],
              ...(Array.isArray(remote.storageZones) && remote.storageZones.length > 0 ? { storageZones: remote.storageZones } : {}),
            };
          }

          const next: Partial<OpsState> = { dummyPurgeVersion: 3 };
          if (Array.isArray(remote.serviceRequests)) next.serviceRequests = remote.serviceRequests;
          if (Array.isArray(remote.deletedInventoryIds)) {
            next.deletedInventoryIds = Array.from(
              new Set([...(state.deletedInventoryIds || []), ...remote.deletedInventoryIds])
            ).slice(-500);
          }
          if (Array.isArray(remote.deletedStorageZoneIds)) {
            next.deletedStorageZoneIds = Array.from(
              new Set([...(state.deletedStorageZoneIds || []), ...remote.deletedStorageZoneIds])
            ).slice(-300);
          }
          if (Array.isArray(remote.deletedInventoryCategories)) {
            next.deletedInventoryCategories = Array.from(
              new Set([...(state.deletedInventoryCategories || []), ...remote.deletedInventoryCategories])
            ).slice(-300);
          }
          if (Array.isArray(remote.deletedRecordIds)) {
            next.deletedRecordIds = Array.from(
              new Set([...(state.deletedRecordIds || []), ...remote.deletedRecordIds])
            ).slice(-800);
          }
          const delInvSet = new Set(next.deletedInventoryIds || state.deletedInventoryIds || []);
          const delZoneSet = new Set(next.deletedStorageZoneIds || state.deletedStorageZoneIds || []);
          const delRecSet = new Set(next.deletedRecordIds || state.deletedRecordIds || []);
          const delCatSet = new Set(
            (next.deletedInventoryCategories || state.deletedInventoryCategories || []).map((c) => c.toLowerCase())
          );

          if (Array.isArray(remote.inventory)) {
            const cleanRemoteInv = remote.inventory.filter((i) => i && i.id && !isDummyInvId(i.id));
            const cleanLocalInv = state.inventory.filter((i) => i && i.id && !isDummyInvId(i.id));
            if (cleanRemoteInv.length > 0 || cleanLocalInv.every((i) => delInvSet.has(i.id))) {
              const iMap = new Map<string, InventoryItem>();
              cleanLocalInv.forEach((c) => {
                if (c && c.id && !delInvSet.has(c.id)) iMap.set(c.id, c);
              });
              cleanRemoteInv.forEach((inc) => {
                if (!inc || !inc.id || delInvSet.has(inc.id)) return;
                const prev = iMap.get(inc.id);
                if (!prev || (inc.updatedAt || 0) >= (prev.updatedAt || 0)) {
                  iMap.set(inc.id, inc);
                }
              });
              next.inventory = Array.from(iMap.values());
            } else {
              next.inventory = cleanLocalInv;
            }
          }

          if (Array.isArray(remote.storageZones) && remote.storageZones.length > 0) {
            const zMap = new Map<string, StorageZone>();
            const baseZones = Array.isArray(state.storageZones) && state.storageZones.length > 0
              ? state.storageZones
              : DEFAULT_STORAGE_ZONES;
            baseZones.forEach((z) => {
              if (z && z.id && !delZoneSet.has(z.id)) zMap.set(z.id, z);
            });
            remote.storageZones.forEach((inc) => {
              if (!inc || !inc.id || delZoneSet.has(inc.id)) return;
              const prev = zMap.get(inc.id);
              if (!prev || (inc.updatedAt || 0) >= (prev.updatedAt || 0)) {
                zMap.set(inc.id, inc);
              }
            });
            next.storageZones = Array.from(zMap.values());
          }
          if (Array.isArray(remote.inventoryCategories)) {
            // Additive union minus explicitly deleted categories (never hide a category that currently has active items!)
            const activeInvCats = new Set(
              (next.inventory || state.inventory || [])
                .map((i) => (i?.category || '').trim().toLowerCase())
                .filter(Boolean)
            );
            if (Array.isArray(next.deletedInventoryCategories)) {
              next.deletedInventoryCategories = next.deletedInventoryCategories.filter(
                (c) => !activeInvCats.has(String(c || '').trim().toLowerCase())
              );
            }
            const seen = new Set<string>();
            const mergedCats: string[] = [];
            [...(state.inventoryCategories || []), ...remote.inventoryCategories].forEach((c) => {
              const clean = String(c || '').trim();
              if (!clean) return;
              const lw = clean.toLowerCase();
              if ((delCatSet.has(lw) && !activeInvCats.has(lw)) || seen.has(lw)) return;
              seen.add(lw);
              mergedCats.push(clean);
            });
            // Also guarantee every category actively used by an inventory item is listed
            (next.inventory || state.inventory || []).forEach((it) => {
              const clean = String(it?.category || '').trim();
              if (!clean) return;
              const lw = clean.toLowerCase();
              if (!seen.has(lw)) {
                seen.add(lw);
                mergedCats.push(clean);
              }
            });
            next.inventoryCategories = mergedCats;
          }
          if (Array.isArray(remote.assetCategories) && remote.assetCategories.length > 0) {
            const seen = new Set<string>();
            const mergedAssetCats: string[] = [];
            [...(state.assetCategories || []), ...remote.assetCategories].forEach((c) => {
              const clean = String(c || '').trim();
              if (!clean || seen.has(clean.toLowerCase())) return;
              seen.add(clean.toLowerCase());
              mergedAssetCats.push(clean);
            });
            if (mergedAssetCats.length > 0) next.assetCategories = mergedAssetCats;
          }
          if (Array.isArray(remote.expenseCategories) && remote.expenseCategories.length > 0) {
            const seen = new Set<string>();
            const mergedExpCats: string[] = [];
            [...(state.expenseCategories || []), ...remote.expenseCategories].forEach((c) => {
              const clean = String(c || '').trim();
              if (!clean || seen.has(clean.toLowerCase())) return;
              seen.add(clean.toLowerCase());
              mergedExpCats.push(clean);
            });
            if (mergedExpCats.length > 0) next.expenseCategories = mergedExpCats;
          }
          if (Array.isArray(remote.stockMovements)) {
            next.stockMovements = [...remote.stockMovements]
              .filter((m) => m && !isDummyInvId(m.itemId))
              .sort((a, b) => (b.at || 0) - (a.at || 0))
              .slice(0, MAX_MOVEMENTS);
          }
          // Stable Chiller Handovers Reconciliation
          if (Array.isArray(remote.chillerHandovers)) {
            const seen = new Set<string>();
            const mergedHandovers: ChillerHandoverRecord[] = [];
            [...(remote.chillerHandovers || []), ...(state.chillerHandovers || [])].forEach((h) => {
              if (h && h.id && !seen.has(h.id) && !isDummyInvId(h.itemId)) {
                seen.add(h.id);
                mergedHandovers.push(h);
              }
            });
            mergedHandovers.sort((a, b) => (b.at || 0) - (a.at || 0));
            next.chillerHandovers = mergedHandovers.slice(0, 100);
          }
          const mergeLedgerById = <T extends { id: string }>(localArr: T[], remoteArr: T[], getTs: (x: any) => number): T[] => {
            const map = new Map<string, T>();
            for (const c of localArr || []) {
              if (c && c.id && !delRecSet.has(c.id)) map.set(c.id, c);
            }
            for (const inc of remoteArr || []) {
              if (!inc || !inc.id || delRecSet.has(inc.id)) continue;
              const prev = map.get(inc.id);
              if (!prev || getTs(inc) >= getTs(prev)) {
                map.set(inc.id, inc);
              }
            }
            return Array.from(map.values());
          };

          if (Array.isArray(remote.expenses)) {
            next.expenses = mergeLedgerById(state.expenses, remote.expenses, (x) => Number(x.at || 0)).sort(
              (a, b) => (b.at || 0) - (a.at || 0)
            );
          }
          if (Array.isArray(remote.feedback)) next.feedback = remote.feedback;
          if (Array.isArray(remote.unavailableItemIds)) next.unavailableItemIds = remote.unavailableItemIds;
          if (Array.isArray(remote.suppliers)) {
            next.suppliers = mergeLedgerById(state.suppliers, remote.suppliers, (x) => Number(x.updatedAt || x.createdAt || 0));
          }
          if (Array.isArray(remote.purchaseOrders)) {
            next.purchaseOrders = mergeLedgerById(state.purchaseOrders, remote.purchaseOrders, (x) =>
              Number(x.deliveryDate || x.orderDate || x.createdAt || 0)
            );
          }
          if (Array.isArray(remote.supplierPayments)) {
            next.supplierPayments = mergeLedgerById(state.supplierPayments, remote.supplierPayments, (x) => Number(x.paidAt || 0));
          }
          if (Array.isArray(remote.assets)) {
            next.assets = mergeLedgerById(state.assets, remote.assets, (x) => Number(x.updatedAt || x.createdAt || 0));
          }
          if (Array.isArray(remote.damageRecords)) {
            next.damageRecords = mergeLedgerById(state.damageRecords, remote.damageRecords, (x) =>
              Number(x.resolvedAt || x.createdAt || x.incidentDate || 0)
            );
          }

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
          state.dummyPurgeVersion = 3;
        } else if (state && (state.dummyPurgeVersion || 0) < 3) {
          const isLegacyId = (id?: string) => {
            const s = String(id || '').trim();
            return /^inv\d+$/.test(s) || s.startsWith('invmuzolyg') || s.startsWith('inv-slt-');
          };
          state.inventory = (state.inventory || []).filter((i) => i && i.id && !isLegacyId(i.id));
          state.stockMovements = (state.stockMovements || []).filter((m) => m && !isLegacyId(m.itemId));
          state.chillerHandovers = (state.chillerHandovers || []).filter((h) => h && !isLegacyId(h.itemId));
          state.dummyPurgeVersion = 3;
        }
        // Seed Official Sultan 19 Categories & 124 Inventory Items once (non-destructive additive merge)
        if (state && (state.catalogSeedVersion || 0) < 1) {
          const currentInv = Array.isArray(state.inventory) ? [...state.inventory] : [];
          const existingIds = new Set(currentInv.map((i) => i?.id).filter(Boolean));
          const existingNameKeys = new Set(
            currentInv.map((i) => `${(i?.name || '').trim().toLowerCase()}|${(i?.category || '').trim().toLowerCase()}`)
          );
          const existingBaseNames = new Set(
            currentInv.map((i) => (i?.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase())
          );

          for (const seedItem of SULTAN_DEFAULT_INVENTORY) {
            const key = `${seedItem.name.trim().toLowerCase()}|${seedItem.category.trim().toLowerCase()}`;
            const baseName = seedItem.name.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
            if (existingIds.has(seedItem.id) || existingNameKeys.has(key) || existingBaseNames.has(baseName)) {
              continue;
            }
            currentInv.push({ ...seedItem });
            existingIds.add(seedItem.id);
            existingNameKeys.add(key);
            existingBaseNames.add(baseName);
          }
          state.inventory = currentInv;

          // Build clean categories: 19 official categories + any existing category that still has items or is custom
          const oldPlaceholderCats = new Set(['meat', 'produce', 'grains', 'pantry', 'beverages', 'fuel', 'supplies']);
          const usedInvCats = new Set(currentInv.map((i) => (i?.category || '').trim().toLowerCase()).filter(Boolean));
          const existingCats = Array.isArray(state.inventoryCategories) ? state.inventoryCategories : [];
          const seenCats = new Set<string>();
          const mergedCats: string[] = [];
          [...SULTAN_INVENTORY_CATEGORIES, ...existingCats].forEach((c) => {
            const clean = String(c || '').trim();
            if (!clean) return;
            const lw = clean.toLowerCase();
            if (oldPlaceholderCats.has(lw) && !usedInvCats.has(lw)) return;
            if (seenCats.has(lw)) return;
            seenCats.add(lw);
            mergedCats.push(clean);
          });
          state.inventoryCategories = mergedCats;
          const officialSet = new Set(SULTAN_INVENTORY_CATEGORIES.map((c) => c.toLowerCase()));
          if (Array.isArray(state.deletedInventoryCategories)) {
            state.deletedInventoryCategories = state.deletedInventoryCategories.filter(
              (c) => !officialSet.has(String(c || '').trim().toLowerCase())
            );
          }
          state.catalogSeedVersion = 1;
          notifySync();
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
    storageZones: s.storageZones || [...DEFAULT_STORAGE_ZONES],
    inventoryResetEpoch: s.inventoryResetEpoch || 0,
    deletedInventoryIds: s.deletedInventoryIds || [],
    deletedStorageZoneIds: s.deletedStorageZoneIds || [],
    deletedInventoryCategories: s.deletedInventoryCategories || [],
    deletedRecordIds: s.deletedRecordIds || [],
    inventoryCategories: s.inventoryCategories,
    assetCategories: s.assetCategories || [...ASSET_CATEGORIES],
    expenseCategories: s.expenseCategories || [...EXPENSE_CATEGORIES],
    stockMovements: s.stockMovements,
    chillerHandovers: s.chillerHandovers || [],
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
