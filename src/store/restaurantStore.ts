import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SULTAN_DEFAULT_CATEGORIES, SULTAN_DEFAULT_MENU, SULTAN_DEFAULT_REGIONS } from '../constants/defaultMenu';
import { getTableFloor, getTableSeatingType } from '../constants/floors';
import type { SalesReturn } from '../types/returns';
import type { RolePermissions } from './roleStore';
import { resolveItemStation, resolveMenuCatalogStation } from '../utils/stationRouting';
import { normalizeMenuItemImage } from '../utils/menuImage';
import { useSettingsStore } from './settingsStore';
import { appStorage } from './storage';

export type Table = {
  id: string;
  name: string;
  floor?: string;
  zone: string;
  seatingType?: 'tables' | 'couches' | 'majlis';
  cabinNumber?: string;
  seats: number;
  status: 'available' | 'occupied' | 'billed' | 'reserved';
  server?: string;
  billTotal?: number;
  orders?: OrderItem[];
  isPaid?: boolean;
  lastInvoiceId?: string;
  occupiedSince?: number;
  lastSettledAt?: number;
  reservationId?: string;
  /** If set, this table is physically joined to the given primary table (merged reservation / big party). */
  mergedInto?: string;
  x?: number;
  y?: number;
  shape?: 'square' | 'round' | 'rectangle';
};

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
  completed: boolean;
  station?: 'main' | 'juice';
  prepTimeMin?: number;
  itemStatus?: 'pending' | 'cooking' | 'ready' | 'served';
  readyAt?: number;
  servedAt?: number;
};

export type StationStatusMap = {
  main?: 'pending' | 'cooking' | 'ready' | 'served';
  juice?: 'pending' | 'cooking' | 'ready' | 'served';
};

export type FoodReadyAlert = {
  id: string;
  ticketId: string;
  tableId: string;
  tableName: string;
  server?: string;
  station: 'main' | 'juice' | 'all';
  stationLabel: string;
  itemsSummary: string;
  time: number;
  type?: 'ready' | 'cooking_started' | 'item_ready';
  singleItemName?: string;
  estimatedMinutes?: number;
};

export type PendingFloorOrderAlert = {
  id: string;
  orderId: string;
  orderNumber: string;
  floor: string;
  tableId: string;
  tableName: string;
  customerName: string;
  customerPhone: string;
  total: number;
  itemsCount: number;
  itemsSummary: string;
  time: number;
};

export type BeverageOrderAlert = {
  id: string;
  tableId: string;
  tableName: string;
  floor: string;
  server?: string;
  items: { name: string; qty: number; menuItemId?: string }[];
  itemsSummary: string;
  time: number;
  status: 'pending' | 'served' | 'dismissed';
};

export type OnlineOrderItem = {
  id: string;
  name: string;
  unitPrice: number;
  price?: number;
  qty: number;
  quantity?: number;
  totalPrice?: number;
  selectedVariant?: string;
  station?: string;
  notes?: string;
};

export type OnlineOrder = {
  id: string;
  orderNumber: string;
  source?: 'mobile_app' | 'digital_menu' | 'pos' | string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'SERVED' | 'CANCELLED';
  floor?: string;
  seatingType?: string;
  tableId?: string;
  tableName?: string;
  cabinNumber?: string;
  roundNumber?: number;
  isAddOn?: boolean;
  assignedWaiter?: string;
  managerNotes?: string;
  customer?: {
    id?: string;
    name: string;
    phone: string;
    address?: string;
  };
  items: OnlineOrderItem[];
  subtotal: number;
  deliveryFee?: number;
  tax?: number;
  total: number;
  paymentMethod?: string;
  riderName?: string;
  riderPhone?: string;
  estimatedDeliveryMinutes?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type Ticket = {
  id: string;
  orderId?: string;
  orderNumber?: string;
  tableId: string;
  tableName: string;
  server: string;
  timePlaced: number;
  cookingStartedAt?: number;
  readyAt?: number;
  estimatedPrepTime?: number;
  status: 'pending' | 'cooking' | 'ready' | 'served';
  items: OrderItem[];
  isAddOn?: boolean;
  roundNumber?: number;
  stationStatuses?: StationStatusMap;
};

export type MenuVariant = {
  name: string;
  price: number;
};

export type ComboItem = {
  menuItemId: string;
  name: string;
  qty: number;
  price?: number;
  variantName?: string;
};

export type MenuItem = {
  id: string;
  name: string;
  urduName?: string;
  price: number;
  category: string;
  region?: string;
  variants?: MenuVariant[];
  station?: 'main' | 'juice';
  prepTimeMin?: number; // Cooking / preparation time in minutes
  available?: boolean;
  stock?: number;
  // Option 3: Image & Visuals
  imageUri?: string;
  description?: string;
  badge?: string; // e.g., 'Chef Special', 'Best Seller', 'Family Deal', 'Discount 20%'
  // Option 4: Inventory, Cost & Profit Margin Tracking
  costPrice?: number;
  trackStock?: boolean;
  stockQty?: number;
  lowStockThreshold?: number;
  // Option 5: Deals & Combo Packs
  isDeal?: boolean;
  dealItems?: ComboItem[];
  dealOriginalPrice?: number;
};

export type CustomerTier = 'Regular' | 'Silver' | 'Gold' | 'VIP';

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  tier?: CustomerTier;
  notes?: string;
  tags?: string[];
  totalOrders: number;
  totalSpent: number;
  loyaltyPoints?: number;
  firstVisit?: number;
  lastVisit?: number;
  favoriteDishes?: string[];
  createdAt?: number;
  updatedAt?: number;
};

export type ItemFeedback = {
  itemId: string;
  itemName: string;
  rating: number; // 1 to 5 stars
  tags?: string[]; // e.g. ['Delicious', 'Served Hot', 'Too Spicy', etc.]
  comment?: string;
};

export type InvoiceFeedback = {
  id: string;
  invoiceId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  overallRating: number; // 1 to 5 stars
  serviceRating?: number; // 1 to 5 stars
  ambianceRating?: number; // 1 to 5 stars
  items: ItemFeedback[];
  generalComments?: string;
  createdAt: number;
  status?: 'published' | 'reviewed';
};

export type Payment = {
  type: 'cash' | 'card' | 'online';
  amount: number;
  tendered?: number;
  change?: number;
};

export * from '../types/returns';

export type Invoice = {
  id: string;
  orderType: 'dine-in' | 'takeaway' | 'delivery';
  tableId?: string;
  tableName?: string;
  customer?: Customer;
  server: string;
  orderTakenBy?: string;
  cashier?: string;
  timePlaced: number;
  timeSettled: number;
  items: OrderItem[];
  subTotal: number;
  discount: number;
  discountEventId?: string;
  discountEventTitle?: string;
  tax: number;
  serviceCharge?: number;
  total: number;
  payments: Payment[];
  tenderedAmount?: number;
  changeReturned?: number;
  status?: 'settled' | 'voided' | 'refunded' | 'unpaid';
  isUnpaidBill?: boolean;
  voidReason?: string;
  voidedAt?: number;
  voidedBy?: string;
  notes?: string;
  packagingNotes?: string;
  refundAmount?: number;
  returnStatus?: 'none' | 'partial' | 'full';
  returnIds?: string[];
  feedback?: InvoiceFeedback;
  feedbackSubmitted?: boolean;
};

export type StaffRole = 'Admin' | 'Manager' | 'Floor Manager' | 'Cashier' | 'cashier' | 'Waiter' | 'Kitchen' | 'JuiceBar' | 'Playland' | string;
export type StaffShift = 'Morning' | 'Evening' | 'Night';
export type StaffStatus = 'Active' | 'On Leave' | 'Inactive';

export type StaffAttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Half Day' | 'On Leave';

export type AttendanceRecord = {
  id: string;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // e.g. "09:00 AM"
  checkOut?: string; // e.g. "06:00 PM"
  status: StaffAttendanceStatus;
  overtimeHours?: number; // e.g. 2
  lateMinutes?: number; // e.g. 15
  notes?: string;
  recordedAt: number;
};

export type SalaryPayment = {
  id: string;
  staffId: string;
  staffName: string;
  month: string; // e.g. "2026-10"
  paymentDate: string; // YYYY-MM-DD
  baseSalary: number;
  bonusAmount: number;
  deductionAmount: number;
  advanceDeduction: number;
  overtimeAmount: number;
  netPaid: number;
  paymentMethod: 'cash' | 'bank' | 'online';
  status: 'Paid' | 'Pending';
  notes?: string;
  voucherNumber?: string;
  paidAt: number;
};

export type StaffMember = {
  id: string;
  /** Whether this employee is allowed to sign in to the POS / System (false for HR/Attendance-only staff like sweepers, helpers, dishwashers). */
  hasSystemAccess?: boolean;
  /** Unique Login ID / Username for independent per-account sign-in (e.g. "master", "ordertaker1"). */
  username?: string;
  name: string;
  phone: string;
  role: StaffRole;
  pin: string;
  status: StaffStatus;
  shift: StaffShift;
  joinedDate?: string;
  assignedZone?: string;
  assignedZones?: string[];
  customRoleId?: string;
  /** Per-staff / per-cashier individual permission overrides (layered on top of assigned role). */
  permissionOverrides?: Partial<RolePermissions>;
  // Detailed Employee & Payroll Profiles
  cnic?: string;
  designation?: string;
  monthlySalary?: number;
  hourlyRate?: number;
  emergencyContact?: string;
  address?: string;
  bankAccountDetails?: string;
  /** Per-account max concurrent devices override. Leave undefined or 0 to follow Global Settings default (1). */
  maxConcurrentDevices?: number;
};

export type StaffSession = {
  sessionId: string;
  staffId: string;
  username?: string;
  staffName: string;
  role: string;
  deviceId: string;
  deviceName?: string;
  platform: string;
  loginTime: number;
  lastActiveTime: number;
};

export type RevokedSessionRecord = {
  sessionId: string;
  deviceId: string;
  staffId: string;
  staffName: string;
  timestamp: number;
  reason: string;
};

export type Reservation = {
  id: string;
  tableId: string;
  tableName: string;
  /** Extra available tables merged with the primary table for large parties. */
  linkedTableIds?: string[];
  customerName: string;
  phone: string;
  guestsCount: number;
  reservationDate: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "08:00 PM"
  status: 'confirmed' | 'seated' | 'cancelled';
  notes?: string;
  createdAt: number;
};

export type Floor = {
  id: string;
  name: string;
  shortCode: string;
  prefix: string;
  color: string;
  icon: string;
  description?: string;
  order?: number;
};

type RestaurantState = {
  tables: Table[];
  tickets: Ticket[];
  deletedTicketIds?: string[];
  invoices: Invoice[];
  customers: Customer[];
  staff: StaffMember[];
  menuItems: MenuItem[];
  hasClearedLegacyDummyMenu?: boolean;
  dummyPurgeVersion?: number;
  staffSeedVersion?: number;
  categories: string[];
  regions: string[];
  zones: string[];
  floors: Floor[];
  reservations: Reservation[];
  onlineOrders: OnlineOrder[];
  pendingFloorOrderAlert?: PendingFloorOrderAlert | null;
  lastBeverageOrderAlert?: BeverageOrderAlert | null;
  lastBillPaidAlert?: { id?: string; tableId: string; tableName: string; billTotal: number; time: number } | null;
  lastFoodReadyAlert?: FoodReadyAlert | null;

  confirmOnlineOrder: (orderId: string, assignedWaiter?: string) => Promise<void>;
  rejectOnlineOrder: (orderId: string, reason?: string) => Promise<void>;
  clearPendingFloorOrderAlert: (orderId?: string) => void;
  clearBeverageOrderAlert: (alertId?: string) => void;

  placeOrder: (tableId: string, serverName: string, items: { item: MenuItem, qty: number, notes?: string }[], isAddOn?: boolean) => void;
  startCookingTicket: (ticketId: string, station?: 'main' | 'juice') => void;
  markItemReady: (ticketId: string, itemId: string, station?: 'main' | 'juice') => void;
  markItemServed: (ticketId: string, itemId: string, station?: 'main' | 'juice') => void;
  toggleTicketItem: (ticketId: string, itemId: string) => void;
  bumpTicket: (ticketId: string, station?: 'main' | 'juice') => void;
  updateTicketStatus: (ticketId: string, status: Ticket['status'], station?: 'main' | 'juice') => void;
  serveTableTickets: (tableId: string) => void;
  markTableBilled: (tableId: string, invoiceId?: string) => void;
  clearBillPaidAlert: (tableIdOrName?: string) => void;
  clearFoodReadyAlert: (alertIdOrTableId?: string) => void;
  settleBill: (tableId: string) => void;
  dismissTicket: (ticketId: string) => void;
  clearTableTickets: (tableId: string) => void;
  clearAllOldTickets: () => void;
  transferTable: (fromTableId: string, toTableId: string) => void;
  mergeTables: (primaryTableId: string, secondaryTableId: string) => void;
  assignTableServer: (tableId: string, serverName: string) => void;
  addReservation: (res: Omit<Reservation, 'id' | 'createdAt' | 'status'> & { status?: Reservation['status'] }) => void;
  updateReservation: (id: string, updates: Partial<Reservation>) => void;
  cancelReservation: (id: string) => void;
  seatReservation: (reservationId: string) => void;
  addMenuItem: (item: Omit<MenuItem, 'id'>) => void;
  updateMenuItem: (id: string, item: Partial<Omit<MenuItem, 'id'>>) => void;
  deleteMenuItem: (id: string) => void;
  adjustMenuItemStock: (id: string, deltaOrQuantity: number, mode?: 'set' | 'add') => void;
  addCategory: (categoryName: string) => void;
  deleteCategory: (categoryName: string) => void;
  addRegion: (regionName: string) => void;
  updateRegion: (oldName: string, newName: string) => void;
  deleteRegion: (regionName: string) => void;
  restoreDefaultRestaurantMenu: () => void;
  addTable: (table: Omit<Table, 'id' | 'status'> & { status?: Table['status'] }) => void;
  updateTable: (id: string, table: Partial<Omit<Table, 'id'>>) => void;
  deleteTable: (id: string) => void;
  addFloor: (floor: Omit<Floor, 'id'>) => void;
  updateFloor: (id: string, updates: Partial<Omit<Floor, 'id'>>) => void;
  deleteFloor: (id: string, cascadeDeleteTables?: boolean) => void;
  addZone: (zoneName: string) => void;
  deleteZone: (zoneName: string) => void;
  salesReturns: SalesReturn[];
  saveInvoice: (invoice: Invoice) => void;
  voidInvoice: (invoiceId: string, reason?: string, voidedBy?: string) => void;
  deleteInvoice: (invoiceId: string) => void;
  processSalesReturn: (input: Omit<SalesReturn, 'id' | 'returnedAt' | 'status'> & { id?: string }) => { ok: true; id: string } | { ok: false; error: string };
  cancelSalesReturn: (returnId: string, by: string) => void;
  addCustomer: (customer: Omit<Customer, 'id' | 'totalOrders' | 'totalSpent'>) => void;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  feedbacks: InvoiceFeedback[];
  addFeedback: (feedback: Omit<InvoiceFeedback, 'id' | 'createdAt'>) => void;
  deleteFeedback: (id: string) => void;
  addStaff: (staff: Omit<StaffMember, 'id'>) => void;
  updateStaff: (id: string, staff: Partial<Omit<StaffMember, 'id'>>) => void;
  deleteStaff: (id: string) => void;
  // Attendance & Payroll
  attendance: AttendanceRecord[];
  salaryPayments: SalaryPayment[];
  markAttendance: (recordOrList: Omit<AttendanceRecord, 'id' | 'recordedAt'> | Omit<AttendanceRecord, 'id' | 'recordedAt'>[]) => void;
  deleteAttendanceRecord: (id: string) => void;
  recordSalaryPayment: (payment: Omit<SalaryPayment, 'id' | 'paidAt' | 'voucherNumber'>) => SalaryPayment;
  deleteSalaryPayment: (id: string) => void;
  onlineFeedbackUrl?: string;
  setOnlineFeedbackUrl: (url: string) => void;
  activeStaffSessions: StaffSession[];
  revokedSessions?: Record<string, RevokedSessionRecord>;
  revokedDeviceIds?: Record<string, { sessionId?: string; staffId?: string; staffName: string; timestamp: number; reason: string }>;
  registerStaffSession: (
    session: Omit<StaffSession, 'loginTime' | 'lastActiveTime'>,
    maxAllowed?: number,
    autoKick?: boolean
  ) => { allowed: boolean; kickedCount: number; kickedSessions: StaffSession[]; activeDevices?: StaffSession[] };
  unregisterStaffSession: (sessionId?: string, deviceId?: string) => void;
  terminateStaffSession: (sessionId: string, reason?: string) => void;
  clearStaffSessions: (staffId?: string) => void;
  syncFromServer: (remoteState: Partial<RestaurantState>) => void;
};

export const INITIAL_FLOORS: Floor[] = [
  {
    id: 'fl-gf',
    name: 'Ground Floor',
    shortCode: 'GF',
    prefix: 'G',
    color: '#2E7D32',
    icon: 'restaurant-outline',
    description: 'Family dining hall & takeaway counter',
    order: 1,
  },
  {
    id: 'fl-1f',
    name: '1st Floor',
    shortCode: '1F',
    prefix: 'F1',
    color: '#1976D2',
    icon: 'people-outline',
    description: 'Family hall, Couches & Traditional Majlis',
    order: 2,
  },
  {
    id: 'fl-2f',
    name: '2nd Floor',
    shortCode: '2F',
    prefix: 'F2',
    color: '#6A1B9A',
    icon: 'sparkles-outline',
    description: 'Banquet hall & Executive lounges',
    order: 3,
  },
  {
    id: 'fl-3f',
    name: '3rd Floor',
    shortCode: '3F',
    prefix: 'F3',
    color: '#B8860B',
    icon: 'diamond-outline',
    description: 'VIP lounges, Royal Majlis & Private rooms',
    order: 4,
  },
  {
    id: 'fl-rt',
    name: 'Rooftop',
    shortCode: 'RT',
    prefix: 'R',
    color: '#E65100',
    icon: 'moon-outline',
    description: 'Open-air BBQ & Sky Majlis',
    order: 5,
  },
];

// Initial Mock Data
const INITIAL_TABLES: Table[] = [
  // Ground Floor
  { id: '1', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'T-01', seats: 4, status: 'available' },
  { id: '2', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'T-02', seats: 4, status: 'available' },
  { id: '3', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'Couch 1', seats: 6, status: 'available' },
  { id: '4', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 8, status: 'available' },
  { id: '5', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'Cabin 2', name: 'Cabin 2', seats: 10, status: 'available' },

  // 1st Floor
  { id: 'f1-t1', floor: '1st Floor', zone: '1st Floor', seatingType: 'tables', name: 'F1-T01', seats: 4, status: 'available' },
  { id: 'f1-t2', floor: '1st Floor', zone: '1st Floor', seatingType: 'tables', name: 'F1-T02', seats: 6, status: 'available' },
  { id: 'f1-c1', floor: '1st Floor', zone: '1st Floor', seatingType: 'couches', name: 'Couch 1', seats: 6, status: 'available' },
  { id: 'f1-c2', floor: '1st Floor', zone: '1st Floor', seatingType: 'couches', name: 'Couch 2', seats: 6, status: 'available' },
  { id: 'f1-m1', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Cabin 1', seats: 8, status: 'available' },
  { id: 'f1-m2', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 2', name: 'Cabin 2', seats: 10, status: 'available' },
  { id: 'f1-m3', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 3', name: 'Cabin 3', seats: 12, status: 'available' },
  { id: 'f1-m4', floor: '1st Floor', zone: '1st Floor', seatingType: 'majlis', cabinNumber: 'Cabin 4', name: 'Cabin 4', seats: 6, status: 'available' },

  // 2nd Floor (Banquet & Executive)
  { id: 'f2-t1', floor: '2nd Floor', zone: '2nd Floor', seatingType: 'tables', name: 'Banquet T-01', seats: 10, status: 'available' },
  { id: 'f2-c1', floor: '2nd Floor', zone: '2nd Floor', seatingType: 'couches', name: 'Executive Couch 1', seats: 8, status: 'available' },
  { id: 'f2-m1', floor: '2nd Floor', zone: '2nd Floor', seatingType: 'majlis', cabinNumber: 'Royal Cabin 1', name: 'Royal Cabin 1', seats: 12, status: 'available' },

  // 3rd Floor (VIP & Royal Majlis)
  { id: 'f3-t1', floor: '3rd Floor', zone: '3rd Floor', seatingType: 'tables', name: 'VIP T-01', seats: 6, status: 'available' },
  { id: 'f3-c1', floor: '3rd Floor', zone: '3rd Floor', seatingType: 'couches', name: 'VIP Lounge 1', seats: 8, status: 'available' },
  { id: 'f3-m1', floor: '3rd Floor', zone: '3rd Floor', seatingType: 'majlis', cabinNumber: 'Sultan Majlis 1', name: 'Sultan Majlis 1', seats: 14, status: 'available' },

  // Rooftop
  { id: 'rt-1', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-01', seats: 4, status: 'available' },
  { id: 'rt-2', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'Cabin 1', name: 'Sky Cabin 1', seats: 8, status: 'available' },
];

const INITIAL_RESERVATIONS: Reservation[] = [];

const INITIAL_CUSTOMERS: Customer[] = [];

const INITIAL_FEEDBACKS: InvoiceFeedback[] = [];

const LEGACY_DUMMY_CUSTOMER_IDS = new Set(['c1', 'c2', 'c3', 'c4', 'c5']);
const LEGACY_DUMMY_FEEDBACK_IDS = new Set(['fb-1', 'fb-2']);
const LEGACY_DUMMY_RESERVATION_IDS = new Set(['res-1']);
const LEGACY_DUMMY_ATTENDANCE_IDS = new Set([
  'att-1', 'att-2', 'att-3', 'att-4', 'att-5', 'att-6', 'att-7', 'att-8', 'att-9', 'att-10', 'att-11',
]);
const LEGACY_DUMMY_SALARY_IDS = new Set(['sal-101', 'sal-102', 'sal-103']);

export const INITIAL_MENU: MenuItem[] = SULTAN_DEFAULT_MENU;
export const INITIAL_CATEGORIES: string[] = SULTAN_DEFAULT_CATEGORIES;
export const INITIAL_REGIONS: string[] = SULTAN_DEFAULT_REGIONS;

export const LEGACY_DUMMY_IDS = new Set([
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
  'm11', 'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19',
  'deal1', 'deal2', 'm-zain', 'm-shahi-handi', 'm-beef-karahi', 'm-chicken-cheese'
]);
export const LEGACY_DUMMY_NAMES = new Set([
  'sultan seekh kebab', 'desi murgh karahi', 'hummus with warm pita', 'royal turkish kunafa',
  'fresh mint margarita', 'fajita supreme pizza', 'smoked mutton ribs', 'sultan dum biryani',
  'grand sultan angus burger', 'cheesy truffle fries', 'choco molten lava cake', 'mango kulfa shake',
  'sultan special roghni naan', 'mutton shinwari karahi', 'chicken manchurian & egg fried rice',
  'chicken chowmein classic', 'hot & sour chicken soup', 'grilled chicken alfredo pasta',
  'crispy fish & chips', 'sultan family feast (4-5 persons)', 'royal couple platter (2 persons)',
  'zain dish', 'sultan shahi handi', 'beef karahii', 'chicken cheese'
]);
export function isLegacyDummyDish(m: any): boolean {
  if (!m) return true;
  if (m.id && LEGACY_DUMMY_IDS.has(m.id)) return true;
  return false;
}

export const LEGACY_DUMMY_STAFF_IDS = new Set([
  'st1',
  'st2',
  'st3',
  'st4',
  'st5',
  'st6',
  'st7',
  'st-ot1',
  'st-ot2',
  'st-ot3',
  'st-ot4',
  'st-fm1',
  'st-fm2',
  'st-c1',
  'st-c2',
  'st1794730033364',
]);

export const LEGACY_DUMMY_STAFF_NAMES = new Set([
  'junaid ahsan',
  'ali khan',
  'chef omar',
  'order taker 1',
  'order taker 2',
  'order taker 3',
  'order taker 4',
  'sara ahmed',
  'hamza malik',
  'ali raza',
  'tariq juice master',
  'rashid mehmood',
  'tariq javed',
  'usman tariq',
  'bilal hassan',
  'rohan ali',
]);

export function isLegacyDummyStaff(s: any): boolean {
  if (!s || typeof s !== 'object') return true;
  const sid = String(s.id || '').trim();
  if (sid === 'st-master') return false;
  if (sid && LEGACY_DUMMY_STAFF_IDS.has(sid)) return true;
  const normName = String(s.name || '').trim().toLowerCase();
  if (normName && LEGACY_DUMMY_STAFF_NAMES.has(normName)) return true;
  return false;
}

export const INITIAL_STAFF: StaffMember[] = [
  // ── Master System Account (Only account with active login access by default) ──
  {
    id: 'st-master',
    hasSystemAccess: true,
    username: 'master',
    name: 'Master Admin',
    phone: '+92 300 0000001',
    role: 'Admin',
    customRoleId: 'role-admin',
    pin: '0000',
    status: 'Active',
    shift: 'Morning',
    joinedDate: '2025-01-01',
    designation: 'Master System Owner (Independent)',
  },

  // ── Kitchen & Production Staff (23 Employees — HR/Payroll registered, System Access: No until enabled) ──
  { id: 'st-emp-k01', hasSystemAccess: false, name: 'Fateh Sher', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Head Chef' },
  { id: 'st-emp-k02', hasSystemAccess: false, name: 'Sajid', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'CDP' },
  { id: 'st-emp-k03', hasSystemAccess: false, name: 'Arslan', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'CDP' },
  { id: 'st-emp-k04', hasSystemAccess: false, name: 'Babar', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'CDP' },
  { id: 'st-emp-k05', hasSystemAccess: false, name: 'Majid', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Bakery' },
  { id: 'st-emp-k06', hasSystemAccess: false, name: 'Shahzaib', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'BBQ' },
  { id: 'st-emp-k07', hasSystemAccess: false, name: 'Jafar', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Pakistani Food' },
  { id: 'st-emp-k08', hasSystemAccess: false, name: 'Bilal', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Pakistani Food' },
  { id: 'st-emp-k09', hasSystemAccess: false, name: 'Qasim', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Fast Food' },
  { id: 'st-emp-k10', hasSystemAccess: false, name: 'Hammad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Fast Food' },
  { id: 'st-emp-k11', hasSystemAccess: false, name: 'Ahsan', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Continental' },
  { id: 'st-emp-k12', hasSystemAccess: false, name: 'Saiful', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Chinese' },
  { id: 'st-emp-k13', hasSystemAccess: false, name: 'Asad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Fast Food' },
  { id: 'st-emp-k14', hasSystemAccess: false, name: 'Muzamil', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Kitchen Staff' },
  { id: 'st-emp-k15', hasSystemAccess: false, name: 'Talha', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Chinese' },
  { id: 'st-emp-k16', hasSystemAccess: false, name: 'Huzaifa', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Kitchen Staff' },
  { id: 'st-emp-k17', hasSystemAccess: false, name: 'Kamran', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'GK' },
  { id: 'st-emp-k18', hasSystemAccess: false, name: 'Sajid Dry Cleaner', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Dish Washer' },
  { id: 'st-emp-k19', hasSystemAccess: false, name: 'Haider', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'BBQ' },
  { id: 'st-emp-k20', hasSystemAccess: false, name: 'Sarim', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Chinese' },
  { id: 'st-emp-k21', hasSystemAccess: false, name: 'Darshan', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Dish Washer' },
  { id: 'st-emp-k22', hasSystemAccess: false, name: 'Khan muhammad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Dish Washer' },
  { id: 'st-emp-k23', hasSystemAccess: false, name: 'Din Muhammad', phone: '', role: 'Kitchen', customRoleId: 'role-kitchen', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Dish Washer' },

  // ── Management, Floor, Service & Bar Staff (30 Employees — HR/Payroll registered, System Access: No until enabled) ──
  { id: 'st-emp-f01', hasSystemAccess: false, name: 'Shakeel', phone: '', role: 'Manager', customRoleId: 'role-manager', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'G. Manager' },
  { id: 'st-emp-f02', hasSystemAccess: false, name: 'Nadeem', phone: '', role: 'Floor Manager', customRoleId: 'role-floor-manager', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'Ground Floor', assignedZones: ['Ground Floor'], designation: 'F. Manager' },
  { id: 'st-emp-f03', hasSystemAccess: false, name: 'Adil Shah', phone: '', role: 'Floor Manager', customRoleId: 'role-floor-manager', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: '1st Floor', assignedZones: ['1st Floor'], designation: 'F. Manager' },
  { id: 'st-emp-f04', hasSystemAccess: false, name: 'Zulfiqar', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Order Taker' },
  { id: 'st-emp-f05', hasSystemAccess: false, name: 'Mubashir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f06', hasSystemAccess: false, name: 'Aetsham', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f07', hasSystemAccess: false, name: 'Usama', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f08', hasSystemAccess: false, name: 'Najeeb', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f09', hasSystemAccess: false, name: 'Ashir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f10', hasSystemAccess: false, name: 'Tasleema', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
  { id: 'st-emp-f11', hasSystemAccess: false, name: 'Bilal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Order Taker' },
  { id: 'st-emp-f12', hasSystemAccess: false, name: 'Tayab', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f13', hasSystemAccess: false, name: 'Fahad', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f14', hasSystemAccess: false, name: 'Shafaqat', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f15', hasSystemAccess: false, name: 'Mohib', phone: '', role: 'JuiceBar', customRoleId: 'role-juicebar', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Bar Helper' },
  { id: 'st-emp-f16', hasSystemAccess: false, name: 'Sharjeel', phone: '', role: 'Cashier', customRoleId: 'role-cashier', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Cashier' },
  { id: 'st-emp-f17', hasSystemAccess: false, name: 'Misbah', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
  { id: 'st-emp-f18', hasSystemAccess: false, name: 'Firyal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
  { id: 'st-emp-f19', hasSystemAccess: false, name: 'Sheroz', phone: '', role: 'JuiceBar', customRoleId: 'role-juicebar', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Barman' },
  { id: 'st-emp-f20', hasSystemAccess: false, name: 'Qasim', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Food Runner' },
  { id: 'st-emp-f21', hasSystemAccess: false, name: 'Tehreem', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'GRO - (F)' },
  { id: 'st-emp-f22', hasSystemAccess: false, name: 'Madhia', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'GRO - (F)' },
  { id: 'st-emp-f23', hasSystemAccess: false, name: 'Tahir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Houseman' },
  { id: 'st-emp-f24', hasSystemAccess: false, name: 'Zahid', phone: '', role: 'Manager', customRoleId: 'role-manager', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Store Keeper' },
  { id: 'st-emp-f25', hasSystemAccess: false, name: 'Tanveer', phone: '', role: 'Cashier', customRoleId: 'role-cashier', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Cashier' },
  { id: 'st-emp-f26', hasSystemAccess: false, name: 'Shameer', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f27', hasSystemAccess: false, name: 'Bilal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f28', hasSystemAccess: false, name: 'Mohson', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f29', hasSystemAccess: false, name: 'Ali Abid', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Food Helper' },
  { id: 'st-emp-f30', hasSystemAccess: false, name: 'Umar', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
];

const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

const INITIAL_SALARY_PAYMENTS: SalaryPayment[] = [];

/**
 * Reconciles tables with active tickets:
 * If a table has active tickets (cooking, ready, or unbilled served orders),
 * its status MUST be 'occupied' with its active bill and server preserved,
 * preventing any race condition where a table displays as 'available' while food is in progress.
 */
export function reconcileTablesWithTickets(tables: Table[], tickets: Ticket[]): Table[] {
  if (!tables || !Array.isArray(tables)) return [];
  const safeTickets = Array.isArray(tickets) ? tickets : [];

  // Guarantee every table has a unique ID across the application
  const seenIds = new Map<string, number>();
  const sanitizedTables = tables.map((t, idx) => {
    const rawId = t.id || `t_${idx}`;
    const count = seenIds.get(rawId) || 0;
    seenIds.set(rawId, count + 1);
    if (count > 0) {
      return { ...t, id: `${rawId}_${count + 1}` };
    }
    return { ...t, id: rawId };
  });

  return sanitizedTables.map(table => {
    // If table is already marked billed, preserve billed state until settled
    if (table.status === 'billed') return table;

    const tableTickets = safeTickets.filter(t => t.tableId === table.id);
    const activeCookingOrReady = tableTickets.filter(t => t.status === 'pending' || t.status === 'cooking' || t.status === 'ready');
    const hasUnbilledTickets = tableTickets.some(t => t.status === 'pending' || t.status === 'cooking' || t.status === 'ready' || t.status === 'served');

      if (activeCookingOrReady.length > 0 || (hasUnbilledTickets && !table.isPaid)) {
      const ticketTotal = tableTickets.reduce((sum, t) =>
        sum + (t.items || []).reduce((itemSum, item) => itemSum + ((item.price || 0) * (item.qty || 1)), 0),
        0
      );

      const ticketOrders = tableTickets.flatMap(t => (t.items || []).map(i => ({ ...i })));
      const orders = (table.orders && table.orders.length >= ticketOrders.length && table.orders.length > 0)
        ? table.orders
        : ticketOrders;

      const serverName = table.server || (tableTickets.length > 0 ? tableTickets[tableTickets.length - 1].server : undefined);

      return {
        ...table,
        status: 'occupied',
        billTotal: Math.max(table.billTotal || 0, ticketTotal),
        orders,
        server: serverName || table.server,
        isPaid: false,
      };
    }

    // If a table is marked 'occupied' but has ZERO active tickets left (e.g. tickets were cleared or cancelled), release it to 'available'
    if (table.status === 'occupied' && tableTickets.length === 0 && !table.mergedInto) {
      return {
        ...table,
        status: 'available',
        billTotal: 0,
        orders: [],
        server: undefined,
        isPaid: false,
        lastInvoiceId: undefined,
        occupiedSince: undefined,
      };
    }

    return table;
  });
}

let isNotifyPending = false;
function notifySync() {
  if (isNotifyPending) return;
  isNotifyPending = true;
  setTimeout(() => {
    isNotifyPending = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { broadcastImmediately } = require('../services/syncService');
      if (typeof broadcastImmediately === 'function') {
        broadcastImmediately();
      }
    } catch { }
  }, 0);
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set, get) => ({
      tables: INITIAL_TABLES,
      invoices: [],
      salesReturns: [],
      customers: INITIAL_CUSTOMERS,
      feedbacks: INITIAL_FEEDBACKS,
      staff: INITIAL_STAFF,
      activeStaffSessions: [],
      revokedSessions: {},
      revokedDeviceIds: {},
      attendance: INITIAL_ATTENDANCE,
      salaryPayments: INITIAL_SALARY_PAYMENTS,
      reservations: INITIAL_RESERVATIONS,
      onlineOrders: [],
      pendingFloorOrderAlert: null,
      deletedTicketIds: [],
      tickets: [],
      menuItems: INITIAL_MENU,
      hasClearedLegacyDummyMenu: true,
      dummyPurgeVersion: 1,
      staffSeedVersion: 2,
      categories: INITIAL_CATEGORIES,
      regions: INITIAL_REGIONS,
      zones: INITIAL_FLOORS.map(f => f.name),
      floors: INITIAL_FLOORS,

      confirmOnlineOrder: async (orderId: string, assignedWaiter?: string) => {
        let apiBase = 'http://192.168.100.3:5050';
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { getActiveServerHttpUrl } = require('../services/syncService');
          if (typeof getActiveServerHttpUrl === 'function') {
            apiBase = getActiveServerHttpUrl();
          }
        } catch (_) {}
        let serverTicket: Ticket | null = null;
        try {
          const res = await fetch(`${apiBase}/api/public/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CONFIRMED', assignedWaiter })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.ticket) {
              serverTicket = data.ticket;
            }
          }
        } catch (_) {}

        set((state) => {
          const order = (state.onlineOrders || []).find(o => o.id === orderId || o.orderNumber === orderId);
          const updatedOrders = (state.onlineOrders || []).map(o => {
            if (o.id === orderId || o.orderNumber === orderId) {
              return { ...o, status: 'CONFIRMED' as const, assignedWaiter: assignedWaiter || o.assignedWaiter };
            }
            return o;
          });

          let updatedTickets = [...state.tickets];
          let updatedTables = [...state.tables];
          let updatedAlert = state.pendingFloorOrderAlert;
          if (updatedAlert && (updatedAlert.orderId === orderId || updatedAlert.orderNumber === orderId)) {
            updatedAlert = null;
          }

          if (order) {
            const existingTicket = updatedTickets.find(t =>
              (order.id && (t.orderId === order.id || t.id.includes(order.id))) ||
              (order.orderNumber && (t.orderNumber === order.orderNumber || t.id.includes(order.orderNumber.replace(/\D/g, ''))))
            );

            if (!existingTicket) {
              const autoRouteBevOnline = useSettingsStore.getState().settings.kdsAutoRouteBeverages !== false;
              const resolvedOnlineItems = (order.items || []).map(it => ({
                id: it.id,
                name: it.name,
                price: it.unitPrice || it.price || 0,
                qty: it.qty || it.quantity || 1,
                notes: it.notes,
                station: resolveMenuCatalogStation(it as any, state.menuItems, autoRouteBevOnline),
                itemStatus: 'pending' as const,
                completed: false
              }));
              const onlineHasMain = resolvedOnlineItems.some(i => i.station === 'main');
              const onlineHasJuice = resolvedOnlineItems.some(i => i.station === 'juice');
              const kotTicket: Ticket = serverTicket || {
                id: `KOT-${(order.orderNumber || order.id).replace(/\D/g, '') || Date.now().toString().slice(-4)}`,
                orderId: order.id,
                orderNumber: order.orderNumber,
                tableId: order.tableId || 'DINE-IN-APP',
                tableName: order.tableName || 'Dine-In',
                server: assignedWaiter || order.assignedWaiter || 'Floor Manager Confirmed',
                timePlaced: Date.now(),
                status: 'pending',
                roundNumber: order.roundNumber || 1,
                isAddOn: order.isAddOn || false,
                stationStatuses: {
                  main: onlineHasMain ? 'pending' : undefined,
                  juice: onlineHasJuice ? 'pending' : undefined,
                },
                items: resolvedOnlineItems,
              };
              updatedTickets.unshift(kotTicket);
            } else if (serverTicket) {
              updatedTickets = updatedTickets.map(t => t.id === existingTicket.id ? { ...t, ...serverTicket } : t);
            }

            if (order.tableId && order.tableId !== 'DINE-IN-APP') {
              updatedTables = updatedTables.map(t => {
                if (t.id === order.tableId || t.name.toLowerCase() === (order.tableName || '').toLowerCase()) {
                  const alreadyHasOrder = (t.orders || []).some(o => (o as any).orderId === order.id);
                  if (alreadyHasOrder) {
                    return {
                      ...t,
                      status: 'occupied' as const,
                      server: assignedWaiter || t.server || 'Floor Waiter',
                    };
                  }
                  return {
                    ...t,
                    status: 'occupied' as const,
                    server: assignedWaiter || t.server || 'Floor Waiter',
                    billTotal: (t.billTotal || 0) + (order.total || 0),
                    orders: [
                      ...(t.orders || []),
                      ...(order.items || []).map(it => ({
                        id: it.id,
                        orderId: order.id,
                        name: it.name,
                        price: it.unitPrice || it.price || 0,
                        qty: it.qty || it.quantity || 1,
                        completed: false
                      }))
                    ]
                  };
                }
                return t;
              });
            }
          }

          return {
            onlineOrders: updatedOrders,
            tickets: updatedTickets,
            tables: updatedTables,
            pendingFloorOrderAlert: updatedAlert
          };
        });
        notifySync();
      },

      rejectOnlineOrder: async (orderId: string, reason?: string) => {
        let apiBase = 'http://192.168.100.3:5050';
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { getActiveServerHttpUrl } = require('../services/syncService');
          if (typeof getActiveServerHttpUrl === 'function') {
            apiBase = getActiveServerHttpUrl();
          }
        } catch (_) {}
        try {
          await fetch(`${apiBase}/api/public/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CANCELLED', managerNotes: reason || 'Rejected by Floor Manager' })
          });
        } catch (_) {}

        set((state) => {
          const updatedOrders = (state.onlineOrders || []).map(o => {
            if (o.id === orderId || o.orderNumber === orderId) {
              return { ...o, status: 'CANCELLED' as const, managerNotes: reason };
            }
            return o;
          });
          let updatedAlert = state.pendingFloorOrderAlert;
          if (updatedAlert && (updatedAlert.orderId === orderId || updatedAlert.orderNumber === orderId)) {
            updatedAlert = null;
          }
          return {
            onlineOrders: updatedOrders,
            pendingFloorOrderAlert: updatedAlert
          };
        });
        notifySync();
      },

      clearPendingFloorOrderAlert: (orderId?: string) => set((state) => {
        if (!orderId || state.pendingFloorOrderAlert?.orderId === orderId || state.pendingFloorOrderAlert?.orderNumber === orderId) {
          return { pendingFloorOrderAlert: null };
        }
        return state;
      }),

      clearBeverageOrderAlert: (alertId?: string) => set((state) => {
        if (!alertId || state.lastBeverageOrderAlert?.id === alertId) {
          return { lastBeverageOrderAlert: null };
        }
        return state;
      }),

      placeOrder: (tableId, serverName, orderItems, isAddOn) => {
        const sysSettings = useSettingsStore.getState().settings;
        const autoRouteBev = sysSettings.kdsAutoRouteBeverages !== false;
        const targetMainPrep = sysSettings.kdsTargetPrepMinutes || 15;
        set((state) => {
          const table = state.tables.find(t => t.id === tableId);
          const existingTickets = state.tickets.filter(t => t.tableId === tableId);
          const isActuallyAddOn = isAddOn !== undefined ? isAddOn : existingTickets.length > 0;
          const roundNumber = existingTickets.length + 1;

          const newTicketId = `KOT-${Math.floor(Math.random() * 9000) + 1000}`;
          const itemsTotal = orderItems.reduce((sum, i) => sum + (i.item.price * i.qty), 0);

          const resolveStation = (item: MenuItem): 'main' | 'juice' => {
            return resolveMenuCatalogStation(item, state.menuItems, autoRouteBev);
          };

          const hasMain = orderItems.some(oi => resolveStation(oi.item) === 'main');
          const hasJuice = orderItems.some(oi => resolveStation(oi.item) === 'juice');

          const maxPrepTime = Math.max(
            ...orderItems.map(oi => oi.item.prepTimeMin || (resolveStation(oi.item) === 'juice' ? 5 : targetMainPrep)),
            10
          );

          const newTicket: Ticket = {
            id: newTicketId,
            tableId, // can be dummy like 'takeaway' or actual tableId
            tableName: table ? (isActuallyAddOn ? `${table.name} (Add-on #${roundNumber})` : table.name) : (tableId === 'delivery' ? 'Delivery' : 'Takeaway'),
            server: serverName,
            timePlaced: Date.now(),
            cookingStartedAt: undefined,
            estimatedPrepTime: maxPrepTime,
            status: 'pending',
            isAddOn: isActuallyAddOn,
            roundNumber: isActuallyAddOn ? roundNumber : 1,
            stationStatuses: {
              main: hasMain ? 'pending' : undefined,
              juice: hasJuice ? 'pending' : undefined,
            },
            items: orderItems.map(oi => {
              const st = resolveStation(oi.item);
              return {
                id: oi.item.id,
                name: oi.item.name,
                price: oi.item.price,
                qty: oi.qty,
                notes: oi.notes,
                completed: false,
                station: st,
                prepTimeMin: oi.item.prepTimeMin || (st === 'juice' ? 5 : targetMainPrep),
                itemStatus: 'pending',
              };
            })
          };

          const updatedMenuItems = state.menuItems.map(m => {
            if (!m.trackStock || typeof m.stockQty !== 'number') return m;
            const matchingQty = orderItems
              .filter(oi => oi.item.id === m.id || oi.item.id.startsWith(`${m.id}-`))
              .reduce((sum, oi) => sum + oi.qty, 0);

            if (matchingQty > 0) {
              return { ...m, stockQty: Math.max(0, m.stockQty - matchingQty) };
            }
            return m;
          });

          // Detect beverages for Floor Manager Chiller Notification & Deduction
          const beverageItems = orderItems.filter(
            (oi) =>
              (oi.item.category || '').toLowerCase() === 'drinks' ||
              (oi.item.category || '').toLowerCase() === 'beverages' ||
              oi.item.station === 'juice' ||
              (oi.item.name || '').toLowerCase().includes('water') ||
              (oi.item.name || '').toLowerCase().includes('pepsi') ||
              (oi.item.name || '').toLowerCase().includes('coke') ||
              (oi.item.name || '').toLowerCase().includes('soda')
          );

          let newBeverageAlert: BeverageOrderAlert | null = null;
          if (beverageItems.length > 0 && table) {
            const tableFloor = (table.floor || table.zone || 'Ground Floor').trim();
            const itemsSummary = beverageItems.map((b) => `${b.qty}x ${b.item.name}`).join(', ');
            newBeverageAlert = {
              id: `bev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              tableId: table.id,
              tableName: table.name,
              floor: tableFloor,
              server: serverName,
              items: beverageItems.map((b) => ({
                name: b.item.name,
                qty: b.qty,
                menuItemId: b.item.id,
              })),
              itemsSummary,
              time: Date.now(),
              status: 'pending',
            };

            // Trigger opsStore floor beverage deduction safely
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { useOpsStore } = require('./opsStore');
              if (useOpsStore && typeof useOpsStore.getState === 'function') {
                useOpsStore.getState().deductFloorBeverageUsage({
                  floor: tableFloor,
                  items: beverageItems.map((b) => ({
                    menuItemId: b.item.id,
                    name: b.item.name,
                    qty: b.qty,
                  })),
                  tableId: table.id,
                  tableName: table.name,
                  by: serverName,
                });
              }
            } catch (_) {}
          }

          return {
            tickets: [newTicket, ...state.tickets],
            menuItems: updatedMenuItems,
            lastBeverageOrderAlert: newBeverageAlert || state.lastBeverageOrderAlert,
            tables: table
              ? state.tables.map(t => {
                if (t.id !== tableId) return t;
                const existingOrders = t.orders || [];
                const mergedOrders = existingOrders.map(o => ({ ...o }));
                orderItems.forEach(oi => {
                  const found = mergedOrders.find(m => m.id === oi.item.id);
                  if (found) {
                    found.qty += oi.qty;
                  } else {
                    mergedOrders.push({
                      id: oi.item.id,
                      name: oi.item.name,
                      price: oi.item.price,
                      qty: oi.qty,
                      notes: oi.notes,
                      completed: false,
                      prepTimeMin: oi.item.prepTimeMin || 15,
                      itemStatus: 'pending'
                    });
                  }
                });
                return {
                  ...t,
                  status: 'occupied',
                  occupiedSince: Math.max(t.occupiedSince || 0, (t.lastSettledAt || 0) + 1, Date.now()),
                  isPaid: false,
                  server: serverName,
                  billTotal: (t.billTotal || 0) + itemsTotal,
                  orders: mergedOrders
                };
              })
              : state.tables
          };
        });
        notifySync();
      },

      startCookingTicket: (ticketId, station) => set((state) => {
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return state;

        const now = Date.now();
        const currentStationStatuses: StationStatusMap = {
          main: ticket.items.some(i => (i.station || 'main') === 'main')
            ? (ticket.stationStatuses?.main || ticket.status)
            : undefined,
          juice: ticket.items.some(i => (i.station || 'main') === 'juice')
            ? (ticket.stationStatuses?.juice || ticket.status)
            : undefined,
        };

        if (station) {
          currentStationStatuses[station] = 'cooking';
        } else {
          if (currentStationStatuses.main) currentStationStatuses.main = 'cooking';
          if (currentStationStatuses.juice) currentStationStatuses.juice = 'cooking';
        }

        const updatedItems: OrderItem[] = ticket.items.map(i => {
          if (!station || (i.station || 'main') === station) {
            const nextStatus: OrderItem['itemStatus'] = (i.itemStatus === 'ready' || i.itemStatus === 'served') ? i.itemStatus : 'cooking';
            return {
              ...i,
              itemStatus: nextStatus
            };
          }
          return i;
        });

        const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('pending' | 'cooking' | 'ready' | 'served')[];
        let overallStatus: Ticket['status'] = 'cooking';
        if (activeStatuses.every(s => s === 'served')) overallStatus = 'served';
        else if (activeStatuses.every(s => s === 'ready' || s === 'served')) overallStatus = 'ready';
        else if (activeStatuses.some(s => s === 'cooking')) overallStatus = 'cooking';
        else if (activeStatuses.every(s => s === 'pending')) overallStatus = 'pending';

        const stationLabel = station === 'juice' ? 'Juice Bar' : (station === 'main' ? 'Kitchen' : 'Kitchen & Bar');
        const stationItems = ticket.items.filter(i => !station || (i.station || 'main') === station);
        const maxPrep = Math.max(...stationItems.map(i => i.prepTimeMin || (station === 'juice' ? 5 : 15)), 10);

        const cookingAlert: FoodReadyAlert = {
          id: `cook_${ticket.id}_${station || 'all'}_${now}`,
          ticketId: ticket.id,
          tableId: ticket.tableId,
          tableName: ticket.tableName,
          server: ticket.server,
          station: station || 'all',
          stationLabel,
          itemsSummary: `Cooking started! (Timer: ${maxPrep} mins)`,
          type: 'cooking_started',
          estimatedMinutes: maxPrep,
          time: now,
        };

        const targetOrdId = ticket.orderId || ticket.orderNumber;
        const updatedOnlineOrders = targetOrdId
          ? (state.onlineOrders || []).map(o => {
              if (o.id === targetOrdId || o.orderNumber === targetOrdId) {
                return { ...o, status: 'PREPARING' as const };
              }
              return o;
            })
          : state.onlineOrders;

        if (targetOrdId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { getActiveServerHttpUrl } = require('../services/syncService');
            const baseHttpUrl = getActiveServerHttpUrl();
            fetch(`${baseHttpUrl}/api/public/orders/${targetOrdId}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'PREPARING' })
            }).catch(() => {});
          } catch (_) {}
        }

        notifySync();
        return {
          tickets: state.tickets.map(t => t.id === ticketId ? {
            ...t,
            cookingStartedAt: t.cookingStartedAt || now,
            status: overallStatus,
            stationStatuses: currentStationStatuses,
            items: updatedItems,
          } : t),
          onlineOrders: updatedOnlineOrders,
          lastFoodReadyAlert: cookingAlert,
        };
      }),

      markItemReady: (ticketId, itemId, station) => set((state) => {
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return state;

        const targetItem = ticket.items.find(i => i.id === itemId);
        if (!targetItem) return state;

        const itemStation = (targetItem.station || 'main') as 'main' | 'juice';
        const now = Date.now();

        const updatedItems: OrderItem[] = ticket.items.map(i => {
          if (i.id === itemId) {
            return {
              ...i,
              itemStatus: 'ready' as const,
              completed: true,
              readyAt: now,
            };
          }
          return i;
        });

        const stationItems = updatedItems.filter(i => (i.station || 'main') === itemStation);
        const allStationItemsReadyOrServed = stationItems.length > 0 && stationItems.every(i => i.itemStatus === 'ready' || i.itemStatus === 'served' || i.completed);

        const currentStationStatuses: StationStatusMap = {
          main: ticket.items.some(i => (i.station || 'main') === 'main')
            ? (ticket.stationStatuses?.main || ticket.status)
            : undefined,
          juice: ticket.items.some(i => (i.station || 'main') === 'juice')
            ? (ticket.stationStatuses?.juice || ticket.status)
            : undefined,
        };

        if (allStationItemsReadyOrServed) {
          currentStationStatuses[itemStation] = 'ready';
        }

        const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('pending' | 'cooking' | 'ready' | 'served')[];
        let overallStatus: Ticket['status'] = ticket.status;
        if (activeStatuses.every(s => s === 'served')) overallStatus = 'served';
        else if (activeStatuses.every(s => s === 'ready' || s === 'served')) overallStatus = 'ready';

        const alert: FoodReadyAlert = {
          id: `item_ready_${ticket.id}_${itemId}_${now}`,
          ticketId: ticket.id,
          tableId: ticket.tableId,
          tableName: ticket.tableName,
          server: ticket.server,
          station: itemStation,
          stationLabel: itemStation === 'juice' ? 'Juice Bar' : 'Kitchen',
          itemsSummary: `${targetItem.qty}x ${targetItem.name} (Ready to Serve Now!)`,
          type: 'item_ready',
          singleItemName: targetItem.name,
          time: now,
        };

        notifySync();
        return {
          tickets: state.tickets.map(t => t.id === ticketId ? {
            ...t,
            items: updatedItems,
            status: overallStatus,
            stationStatuses: currentStationStatuses,
          } : t),
          lastFoodReadyAlert: alert,
        };
      }),

      markItemServed: (ticketId, itemId, station) => set((state) => {
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return state;

        const targetItem = ticket.items.find(i => i.id === itemId);
        if (!targetItem) return state;

        const itemStation = (targetItem.station || 'main') as 'main' | 'juice';
        const now = Date.now();

        const updatedItems: OrderItem[] = ticket.items.map(i => {
          if (i.id === itemId) {
            return {
              ...i,
              itemStatus: 'served' as const,
              completed: true,
              servedAt: now,
            };
          }
          return i;
        });

        const stationItems = updatedItems.filter(i => (i.station || 'main') === itemStation);
        const allStationItemsServed = stationItems.length > 0 && stationItems.every(i => i.itemStatus === 'served');

        const currentStationStatuses: StationStatusMap = {
          main: ticket.items.some(i => (i.station || 'main') === 'main')
            ? (ticket.stationStatuses?.main || ticket.status)
            : undefined,
          juice: ticket.items.some(i => (i.station || 'main') === 'juice')
            ? (ticket.stationStatuses?.juice || ticket.status)
            : undefined,
        };

        if (allStationItemsServed) {
          currentStationStatuses[itemStation] = 'served';
        }

        const allItemsServed = updatedItems.every(i => i.itemStatus === 'served' || i.completed);
        const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('pending' | 'cooking' | 'ready' | 'served')[];
        let overallStatus: Ticket['status'] = ticket.status;
        if (allItemsServed || activeStatuses.every(s => s === 'served')) {
          overallStatus = 'served';
        }

        notifySync();
        return {
          tickets: state.tickets.map(t => t.id === ticketId ? {
            ...t,
            items: updatedItems,
            status: overallStatus,
            stationStatuses: currentStationStatuses,
          } : t),
        };
      }),

      toggleTicketItem: (ticketId, itemId) => set((state) => {
        let updatedAlert: FoodReadyAlert | null = state.lastFoodReadyAlert || null;

        const updatedTickets = state.tickets.map(t => {
          if (t.id === ticketId) {
            const targetItem = t.items.find(i => i.id === itemId);
            const itemStation = (targetItem?.station || 'main') as 'main' | 'juice';

            const updatedItems = t.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i);

            const currentStationStatuses: StationStatusMap = {
              main: t.items.some(i => (i.station || 'main') === 'main')
                ? (t.stationStatuses?.main || t.status)
                : undefined,
              juice: t.items.some(i => (i.station || 'main') === 'juice')
                ? (t.stationStatuses?.juice || t.status)
                : undefined,
            };

            const stationItems = updatedItems.filter(i => (i.station || 'main') === itemStation);
            const allStationCompleted = stationItems.length > 0 && stationItems.every(i => i.completed);

            if (allStationCompleted && currentStationStatuses[itemStation] === 'cooking') {
              currentStationStatuses[itemStation] = 'ready';
              const summary = stationItems.map(i => `${i.qty}x ${i.name}`).join(', ');
              updatedAlert = {
                id: `ready_${t.id}_${itemStation}_${Date.now()}`,
                ticketId: t.id,
                tableId: t.tableId,
                tableName: t.tableName,
                server: t.server,
                station: itemStation,
                stationLabel: itemStation === 'juice' ? 'Juice Bar' : 'Kitchen',
                itemsSummary: summary || 'Items Ready for Pickup',
                time: Date.now(),
              };
            } else if (!allStationCompleted && currentStationStatuses[itemStation] === 'ready') {
              currentStationStatuses[itemStation] = 'cooking';
            }

            const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('cooking' | 'ready' | 'served')[];
            let overallStatus: Ticket['status'] = t.status;
            if (activeStatuses.length > 0) {
              if (activeStatuses.every(s => s === 'served')) {
                overallStatus = 'served';
              } else if (activeStatuses.every(s => s === 'ready' || s === 'served')) {
                overallStatus = 'ready';
              } else {
                overallStatus = 'cooking';
              }
            }

            return {
              ...t,
              items: updatedItems,
              stationStatuses: currentStationStatuses,
              status: overallStatus,
              readyAt: (status === 'ready' || overallStatus === 'ready') ? (t.readyAt || Date.now()) : t.readyAt
            };
          }
          return t;
        });

        notifySync();
        return {
          tickets: updatedTickets,
          lastFoodReadyAlert: updatedAlert
        };
      }),

      bumpTicket: (ticketId, station) => set((state) => {
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return state;

        let updatedAlert = state.lastFoodReadyAlert;
        if (updatedAlert && updatedAlert.ticketId === ticketId && (!station || updatedAlert.station === station || updatedAlert.station === 'all')) {
          updatedAlert = null;
        }

        if (station) {
          const currentStationStatuses: StationStatusMap = {
            main: ticket.items.some(i => (i.station || 'main') === 'main')
              ? (ticket.stationStatuses?.main || ticket.status)
              : undefined,
            juice: ticket.items.some(i => (i.station || 'main') === 'juice')
              ? (ticket.stationStatuses?.juice || ticket.status)
              : undefined,
          };
          currentStationStatuses[station] = 'served';

          const updatedItems = ticket.items.map(item => {
            if ((item.station || 'main') === station) {
              return { ...item, itemStatus: 'served' as const, completed: true };
            }
            return item;
          });

          const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('cooking' | 'ready' | 'served')[];
          const overallStatus = activeStatuses.length > 0 && activeStatuses.every(s => s === 'served')
            ? 'served'
            : (activeStatuses.every(s => s === 'ready' || s === 'served') ? 'ready' : 'cooking');

          notifySync();
          return {
            tickets: state.tickets.map(t => t.id === ticketId ? {
              ...t,
              items: updatedItems,
              stationStatuses: currentStationStatuses,
              status: overallStatus
            } : t),
            lastFoodReadyAlert: updatedAlert
          };
        }

        const allServedStatuses: StationStatusMap = {
          main: ticket.items.some(i => (i.station || 'main') === 'main') ? 'served' : undefined,
          juice: ticket.items.some(i => (i.station || 'main') === 'juice') ? 'served' : undefined,
        };

        notifySync();
        return {
          tickets: state.tickets.map(t => t.id === ticketId ? {
            ...t,
            status: 'served',
            items: t.items.map(i => ({ ...i, itemStatus: 'served' as const, completed: true })),
            stationStatuses: allServedStatuses
          } : t),
          lastFoodReadyAlert: updatedAlert
        };
      }),

      updateTicketStatus: (ticketId, status, station) => set((state) => {
        let updatedAlert: FoodReadyAlert | null = state.lastFoodReadyAlert || null;

        const updatedTickets = state.tickets.map(t => {
          if (t.id !== ticketId) return t;

          if (station) {
            const currentStationStatuses: StationStatusMap = {
              main: t.items.some(i => (i.station || 'main') === 'main')
                ? (t.stationStatuses?.main || t.status)
                : undefined,
              juice: t.items.some(i => (i.station || 'main') === 'juice')
                ? (t.stationStatuses?.juice || t.status)
                : undefined,
            };
            currentStationStatuses[station] = status;

            const updatedItems = t.items.map(item => {
              if ((item.station || 'main') === station) {
                if (status === 'served') {
                  return { ...item, itemStatus: 'served' as const, completed: true };
                } else if (status === 'ready') {
                  return { ...item, itemStatus: 'ready' as const, completed: true, readyAt: item.readyAt || Date.now() };
                } else if (status === 'cooking') {
                  return { ...item, itemStatus: 'cooking' as const, completed: false };
                }
              }
              return item;
            });

            const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('cooking' | 'ready' | 'served')[];
            let overallStatus: Ticket['status'] = t.status;
            if (activeStatuses.length > 0) {
              if (activeStatuses.every(s => s === 'served')) {
                overallStatus = 'served';
              } else if (activeStatuses.every(s => s === 'ready' || s === 'served')) {
                overallStatus = 'ready';
              } else {
                overallStatus = 'cooking';
              }
            } else {
              overallStatus = status;
            }

            if (status === 'ready') {
              const stationItems = t.items
                .filter(i => (i.station || 'main') === station)
                .map(i => `${i.qty}x ${i.name}`)
                .join(', ');
              updatedAlert = {
                id: `ready_${t.id}_${station}_${Date.now()}`,
                ticketId: t.id,
                tableId: t.tableId,
                tableName: t.tableName,
                server: t.server,
                station,
                stationLabel: station === 'juice' ? 'Juice Bar' : 'Kitchen',
                itemsSummary: stationItems || 'Items Ready for Pickup',
                time: Date.now(),
              };
            } else if (status === 'served') {
              if (updatedAlert && updatedAlert.ticketId === t.id && (updatedAlert.station === station || updatedAlert.station === 'all')) {
                updatedAlert = null;
              }
            }

            return {
              ...t,
              items: updatedItems,
              stationStatuses: currentStationStatuses,
              status: overallStatus
            };
          }

          const fallbackStationStatuses: StationStatusMap = {
            main: t.items.some(i => (i.station || 'main') === 'main') ? status : undefined,
            juice: t.items.some(i => (i.station || 'main') === 'juice') ? status : undefined,
          };

          if (status === 'ready') {
            const allItemsSummary = t.items.map(i => `${i.qty}x ${i.name}`).join(', ');
            updatedAlert = {
              id: `ready_${t.id}_all_${Date.now()}`,
              ticketId: t.id,
              tableId: t.tableId,
              tableName: t.tableName,
              server: t.server,
              station: 'all',
              stationLabel: 'Kitchen',
              itemsSummary: allItemsSummary || 'Order Ready for Pickup',
              time: Date.now(),
            };
          } else if (status === 'served') {
            if (updatedAlert && updatedAlert.ticketId === t.id) {
              updatedAlert = null;
            }
          }

          return {
            ...t,
            status,
            items: t.items.map(i => ({
              ...i,
              itemStatus: status,
              completed: status === 'ready' || status === 'served',
              readyAt: status === 'ready' ? (i.readyAt || Date.now()) : i.readyAt,
            })),
            stationStatuses: fallbackStationStatuses,
            readyAt: status === 'ready' ? (t.readyAt || Date.now()) : t.readyAt
          };
        });

        notifySync();
        return {
          tickets: updatedTickets,
          lastFoodReadyAlert: updatedAlert
        };
      }),

      serveTableTickets: (tableId) => set((state) => {
        const isTicketReady = (t: Ticket) =>
          t.tableId === tableId &&
          (t.status === 'ready' ||
            t.stationStatuses?.main === 'ready' ||
            t.stationStatuses?.juice === 'ready' ||
            (Array.isArray(t.items) && t.items.some(i => i.itemStatus === 'ready')));

        const hasReady = state.tickets.some(isTicketReady);
        if (!hasReady) return state;

        const updatedTickets = state.tickets.map(t => {
          if (isTicketReady(t)) {
            const servedStatuses: StationStatusMap = {
              main: t.items.some(i => (i.station || 'main') === 'main') ? 'served' : undefined,
              juice: t.items.some(i => (i.station || 'main') === 'juice') ? 'served' : undefined,
            };
            return {
              ...t,
              status: 'served' as const,
              items: t.items.map(i => ({ ...i, itemStatus: 'served' as const, completed: true })),
              stationStatuses: servedStatuses
            };
          }
          return t;
        });

        let updatedAlert = state.lastFoodReadyAlert;
        if (updatedAlert && updatedAlert.tableId === tableId) {
          updatedAlert = null;
        }

        notifySync();
        return {
          tickets: updatedTickets,
          tables: state.tables.map(t =>
            t.id === tableId && t.status !== 'billed' ? { ...t, status: 'occupied' } : t
          ),
          lastFoodReadyAlert: updatedAlert
        };
      }),

      markTableBilled: (tableId, invoiceId) => set((state) => {
        const table = state.tables.find(t => t.id === tableId);
        const amount = table?.billTotal || 0;
        const tableName = table ? table.name : `Table ${tableId}`;
        const now = Date.now();
        const removedIds = (state.tickets || []).filter(t => t.tableId === tableId).map(t => t.id);

        notifySync();
        return {
          tables: state.tables.map(t =>
            t.id === tableId ? {
              ...t,
              status: 'billed',
              isPaid: true,
              lastInvoiceId: invoiceId
            } : t
          ),
          tickets: (state.tickets || []).filter(t => t.tableId !== tableId),
          deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), ...removedIds])).slice(-400),
          lastBillPaidAlert: {
            id: `bill_${tableId}_${now}`,
            tableId,
            tableName,
            billTotal: amount,
            time: now
          }
        };
      }),

      clearBillPaidAlert: (tableIdOrName?: string) => set((state) => {
        if (!tableIdOrName) {
          notifySync();
          return { lastBillPaidAlert: null };
        }
        const alert = state.lastBillPaidAlert;
        if (!alert) return { lastBillPaidAlert: null };
        const query = tableIdOrName.trim().toLowerCase();
        const matches =
          (alert.id && alert.id.toLowerCase() === query) ||
          alert.tableId.toLowerCase() === query ||
          alert.tableName.trim().toLowerCase() === query;
        notifySync();
        return { lastBillPaidAlert: matches ? null : alert };
      }),

      clearFoodReadyAlert: (alertIdOrTableId?: string) => set((state) => {
        if (!alertIdOrTableId) {
          notifySync();
          return { lastFoodReadyAlert: null };
        }
        const current = state.lastFoodReadyAlert;
        if (!current) return { lastFoodReadyAlert: null };
        const query = alertIdOrTableId.trim().toLowerCase();
        const matches =
          current.id === alertIdOrTableId ||
          current.tableId.trim().toLowerCase() === query ||
          current.tableName.trim().toLowerCase() === query;
        notifySync();
        return { lastFoodReadyAlert: matches ? null : current };
      }),

      settleBill: (tableId) => set((state) => {
        const targetTable = state.tables.find(t => t.id === tableId);
        const targetTableName = targetTable?.name;
        const alert = state.lastBillPaidAlert;
        const matchesAlert = alert && (
          alert.tableId === tableId ||
          (targetTableName && alert.tableName.trim().toLowerCase() === targetTableName.trim().toLowerCase())
        );

        const foodAlert = state.lastFoodReadyAlert;
        const matchesFoodAlert = foodAlert && (
          foodAlert.tableId === tableId ||
          (targetTableName && foodAlert.tableName.trim().toLowerCase() === targetTableName.trim().toLowerCase())
        );

        const now = Date.now();
        const removedIds = (state.tickets || []).filter(t => t.tableId === tableId).map(t => t.id);

        notifySync();
        return {
          tables: state.tables.map(t =>
            (t.id === tableId || t.mergedInto === tableId) ? {
              ...t,
              status: 'available',
              billTotal: 0,
              server: undefined,
              orders: [],
              isPaid: false,
              lastInvoiceId: undefined,
              occupiedSince: undefined,
              lastSettledAt: now,
              mergedInto: undefined,
              reservationId: undefined,
            } : t
          ),
          tickets: state.tickets.filter(t => t.tableId !== tableId),
          deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), ...removedIds])).slice(-400),
          lastBillPaidAlert: matchesAlert ? null : state.lastBillPaidAlert,
          lastFoodReadyAlert: matchesFoodAlert ? null : state.lastFoodReadyAlert
        };
      }),

      dismissTicket: (ticketId) => set((state) => {
        const target = (state.tickets || []).find(t => t.id === ticketId);
        const remainingTickets = (state.tickets || []).filter(t => t.id !== ticketId);
        const now = Date.now();
        let updatedTables = state.tables;
        if (target && target.tableId) {
          const tableRemaining = remainingTickets.filter(t => t.tableId === target.tableId);
          updatedTables = state.tables.map(t => {
            if (t.id !== target.tableId) return t;
            if (tableRemaining.length === 0 && t.status !== 'billed') {
              return {
                ...t,
                status: 'available',
                billTotal: 0,
                server: undefined,
                orders: [],
                isPaid: false,
                lastInvoiceId: undefined,
                occupiedSince: undefined,
                lastSettledAt: now,
              };
            }
            if (tableRemaining.length > 0) {
              const newOrders = tableRemaining.flatMap(tk => (tk.items || []).map(i => ({ ...i })));
              const newTotal = tableRemaining.reduce(
                (sum, tk) => sum + (tk.items || []).reduce((s, it) => s + ((it.price || 0) * (it.qty || 1)), 0),
                0
              );
              return {
                ...t,
                billTotal: newTotal,
                orders: newOrders,
              };
            }
            return t;
          });
        }
        notifySync();
        return {
          tables: updatedTables,
          tickets: remainingTickets,
          deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), ticketId])).slice(-400),
        };
      }),

      clearTableTickets: (tableId) => set((state) => {
        const removedIds = (state.tickets || []).filter(t => t.tableId === tableId).map(t => t.id);
        const now = Date.now();
        notifySync();
        return {
          tables: state.tables.map(t =>
            t.id === tableId && t.status !== 'billed'
              ? {
                  ...t,
                  status: 'available',
                  billTotal: 0,
                  server: undefined,
                  orders: [],
                  isPaid: false,
                  lastInvoiceId: undefined,
                  occupiedSince: undefined,
                  lastSettledAt: now,
                }
              : t
          ),
          tickets: (state.tickets || []).filter(t => t.tableId !== tableId),
          deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), ...removedIds])).slice(-400),
        };
      }),

      clearAllOldTickets: () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { getActiveServerHttpUrl } = require('../services/syncService');
          const apiBase = typeof getActiveServerHttpUrl === 'function' ? getActiveServerHttpUrl() : 'http://192.168.100.3:5050';
          fetch(`${apiBase}/api/pos/clear-all`, { method: 'POST' }).catch(() => {});
        } catch {}
        set((state) => {
          const removedIds = (state.tickets || []).map(t => t.id);
          const now = Date.now();
          notifySync();
          return {
            tables: state.tables.map(t =>
              t.status === 'occupied' || t.status === 'billed'
                ? {
                    ...t,
                    status: 'available',
                    billTotal: 0,
                    server: undefined,
                    orders: [],
                    isPaid: false,
                    lastInvoiceId: undefined,
                    occupiedSince: undefined,
                    lastSettledAt: now,
                    mergedInto: undefined,
                    reservationId: undefined,
                  }
                : t
            ),
            tickets: [],
            deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), 'KOT-1042', ...removedIds])).slice(-400),
            lastBillPaidAlert: null,
            lastFoodReadyAlert: null,
          };
        });
      },

      transferTable: (fromTableId, toTableId) => set((state) => {
        const fromTable = state.tables.find(t => t.id === fromTableId);
        const toTable = state.tables.find(t => t.id === toTableId);
        if (!fromTable || !toTable || toTable.status === 'occupied' || toTable.status === 'billed') {
          return state;
        }

        const updatedTables = state.tables.map(t => {
          if (t.id === toTableId) {
            return {
              ...t,
              status: fromTable.status,
              billTotal: fromTable.billTotal || 0,
              orders: fromTable.orders ? [...fromTable.orders] : [],
              server: fromTable.server,
              isPaid: fromTable.isPaid,
              lastInvoiceId: fromTable.lastInvoiceId,
              occupiedSince: fromTable.occupiedSince || Date.now(),
            };
          }
          if (t.id === fromTableId) {
            return {
              ...t,
              status: 'available' as const,
              billTotal: 0,
              orders: [],
              server: undefined,
              isPaid: false,
              lastInvoiceId: undefined,
              occupiedSince: undefined,
            };
          }
          return t;
        });

        const updatedTickets = state.tickets.map(tk => {
          if (tk.tableId === fromTableId) {
            return {
              ...tk,
              tableId: toTableId,
              tableName: `${toTable.name} (from ${fromTable.name})`
            };
          }
          return tk;
        });

        let updatedAlert = state.lastBillPaidAlert;
        if (updatedAlert && updatedAlert.tableId === fromTableId) {
          updatedAlert = {
            ...updatedAlert,
            tableId: toTableId,
            tableName: toTable.name
          };
        }

        return {
          tables: updatedTables,
          tickets: updatedTickets,
          lastBillPaidAlert: updatedAlert
        };
      }),

      mergeTables: (primaryTableId, secondaryTableId) => set((state) => {
        const primary = state.tables.find(t => t.id === primaryTableId);
        const secondary = state.tables.find(t => t.id === secondaryTableId);
        if (!primary || !secondary) return state;

        // Combine orders
        const combinedOrders = (primary.orders || []).map(o => ({ ...o }));
        (secondary.orders || []).forEach(secItem => {
          const found = combinedOrders.find(o => o.id === secItem.id);
          if (found) {
            found.qty += secItem.qty;
          } else {
            combinedOrders.push({ ...secItem });
          }
        });

        const newBillTotal = (primary.billTotal || 0) + (secondary.billTotal || 0);

        const updatedTables = state.tables.map(t => {
          if (t.id === primaryTableId) {
            return {
              ...t,
              orders: combinedOrders,
              billTotal: newBillTotal,
              status: (primary.status === 'billed' && secondary.status === 'billed') ? 'billed' as const : 'occupied' as const,
            };
          }
          if (t.id === secondaryTableId) {
            return {
              ...t,
              status: 'available' as const,
              billTotal: 0,
              orders: [],
              server: undefined,
              isPaid: false,
              lastInvoiceId: undefined,
              occupiedSince: undefined,
            };
          }
          return t;
        });

        const updatedTickets = state.tickets.map(tk => {
          if (tk.tableId === secondaryTableId) {
            return {
              ...tk,
              tableId: primaryTableId,
              tableName: `${primary.name} (Merged ${secondary.name})`
            };
          }
          return tk;
        });

        return {
          tables: updatedTables,
          tickets: updatedTickets
        };
      }),

      assignTableServer: (tableId, serverName) => set((state) => ({
        tables: state.tables.map(t => t.id === tableId ? { ...t, server: serverName } : t)
      })),

      addReservation: (res) => set((state) => {
        const newId = `res-${Date.now()}`;
        const linked = (res.linkedTableIds || []).filter(id => id !== res.tableId);
        const newReservation: Reservation = {
          ...res,
          linkedTableIds: linked,
          id: newId,
          status: res.status || 'confirmed',
          createdAt: Date.now()
        };

        const updatedTables = state.tables.map(t => {
          if (t.id === res.tableId) {
            return { ...t, status: 'reserved' as const, reservationId: newId, mergedInto: undefined };
          }
          if (linked.includes(t.id)) {
            return { ...t, status: 'reserved' as const, reservationId: newId, mergedInto: res.tableId };
          }
          return t;
        });

        return {
          reservations: [newReservation, ...state.reservations],
          tables: updatedTables
        };
      }),

      updateReservation: (id, updates) => set((state) => {
        const targetRes = state.reservations.find(r => r.id === id);
        if (!targetRes) return state;

        const updatedRes: Reservation = { ...targetRes, ...updates };
        updatedRes.linkedTableIds = (updatedRes.linkedTableIds || []).filter(tid => tid !== updatedRes.tableId);

        const tablesChanged = updates.tableId !== undefined || updates.linkedTableIds !== undefined;
        let updatedTables = state.tables;
        if (tablesChanged && targetRes.status === 'confirmed') {
          // Release all previously held tables for this reservation, then reserve the new set
          updatedTables = updatedTables.map(t => {
            if (t.reservationId === id && t.status === 'reserved') {
              return { ...t, status: 'available' as const, reservationId: undefined, mergedInto: undefined };
            }
            return t;
          }).map(t => {
            if (t.id === updatedRes.tableId) {
              return { ...t, status: 'reserved' as const, reservationId: id, mergedInto: undefined };
            }
            if (updatedRes.linkedTableIds!.includes(t.id)) {
              return { ...t, status: 'reserved' as const, reservationId: id, mergedInto: updatedRes.tableId };
            }
            return t;
          });
        }

        return {
          reservations: state.reservations.map(r => r.id === id ? updatedRes : r),
          tables: updatedTables
        };
      }),

      cancelReservation: (id) => set((state) => {
        const targetRes = state.reservations.find(r => r.id === id);
        if (!targetRes) return state;
        const allIds = [targetRes.tableId, ...(targetRes.linkedTableIds || [])];

        const updatedTables = state.tables.map(t => {
          if (allIds.includes(t.id) && t.status === 'reserved') {
            return { ...t, status: 'available' as const, reservationId: undefined, mergedInto: undefined };
          }
          return t;
        });

        return {
          reservations: state.reservations.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r),
          tables: updatedTables
        };
      }),

      seatReservation: (reservationId) => set((state) => {
        const targetRes = state.reservations.find(r => r.id === reservationId);
        if (!targetRes) return state;
        const linked = targetRes.linkedTableIds || [];
        const now = Date.now();

        const updatedTables = state.tables.map(t => {
          if (t.id === targetRes.tableId) {
            return { ...t, status: 'occupied' as const, occupiedSince: now, reservationId: undefined, mergedInto: undefined };
          }
          if (linked.includes(t.id)) {
            // Linked tables stay blocked as part of the primary table's party
            return { ...t, status: 'occupied' as const, occupiedSince: now, reservationId: undefined, mergedInto: targetRes.tableId };
          }
          return t;
        });

        return {
          reservations: state.reservations.map(r => r.id === reservationId ? { ...r, status: 'seated' as const } : r),
          tables: updatedTables
        };
      }),

      saveInvoice: (invoice) => set((state) => {
        let updatedCustomers = state.customers;
        if (invoice.customer && (invoice.customer.id || invoice.customer.phone)) {
          const custPhone = (invoice.customer.phone || '').replace(/\D/g, '');
          updatedCustomers = state.customers.map(c => {
            const isMatch = (invoice.customer?.id && c.id === invoice.customer.id) ||
              (custPhone && c.phone && c.phone.replace(/\D/g, '').endsWith(custPhone));
            if (isMatch) {
              const newOrders = (c.totalOrders || 0) + 1;
              const newSpent = (c.totalSpent || 0) + (invoice.total || 0);
              const pointsEarned = Math.round((invoice.total || 0) * 0.01);
              let tier: CustomerTier = c.tier || 'Regular';
              if (newSpent >= 50000 || newOrders >= 15) tier = 'VIP';
              else if (newSpent >= 25000 || newOrders >= 8) tier = 'Gold';
              else if (newSpent >= 10000 || newOrders >= 3) tier = 'Silver';

              return {
                ...c,
                totalOrders: newOrders,
                totalSpent: newSpent,
                loyaltyPoints: (c.loyaltyPoints || 0) + pointsEarned,
                lastVisit: Date.now(),
                tier,
              };
            }
            return c;
          });
        }

        return {
          invoices: [invoice, ...state.invoices],
          customers: updatedCustomers,
        };
      }),

      voidInvoice: (invoiceId, reason, voidedBy) => set((state) => ({
        invoices: state.invoices.map(inv =>
          inv.id === invoiceId
            ? {
              ...inv,
              status: 'voided' as const,
              voidReason: reason || 'Voided by authorized manager',
              voidedAt: Date.now(),
              voidedBy: voidedBy || 'Staff',
            }
            : inv
        )
      })),

      deleteInvoice: (invoiceId) => set((state) => ({
        invoices: state.invoices.filter(inv => inv.id !== invoiceId)
      })),

      processSalesReturn: (input) => {
        const returnId = input.id || `RET-${Math.floor(10000 + Math.random() * 90000)}`;
        let success = false;
        let errorMessage = '';

        set((state) => {
          const invoice = state.invoices.find(inv => inv.id === input.invoiceId);
          if (!invoice) {
            errorMessage = 'Original invoice not found.';
            return state;
          }

          const now = Date.now();
          const refundAmt = Math.max(0, input.refundAmount);

          const newReturn: SalesReturn = {
            ...input,
            id: returnId,
            returnedAt: now,
            status: 'completed',
            refundAmount: refundAmt,
          };

          const existingRefund = invoice.refundAmount || 0;
          const newTotalRefund = existingRefund + refundAmt;
          const isFullRefund = input.returnType === 'full' || newTotalRefund >= invoice.total;

          const updatedInvoices = state.invoices.map(inv => {
            if (inv.id !== invoice.id) return inv;
            return {
              ...inv,
              status: isFullRefund ? ('refunded' as const) : inv.status,
              returnStatus: isFullRefund ? ('full' as const) : ('partial' as const),
              refundAmount: newTotalRefund,
              returnIds: [...(inv.returnIds || []), returnId],
            };
          });

          // Adjust customer spent if customer linked
          let updatedCustomers = state.customers;
          if (invoice.customer?.id) {
            updatedCustomers = state.customers.map(c => {
              if (c.id === invoice.customer!.id) {
                return {
                  ...c,
                  totalSpent: Math.max(0, c.totalSpent - refundAmt),
                };
              }
              return c;
            });
          }

          // Restock items marked 'restock'
          let updatedMenuItems = state.menuItems;
          input.items.forEach(retItem => {
            if (retItem.condition === 'restock' && retItem.quantityReturned > 0) {
              updatedMenuItems = updatedMenuItems.map(m => {
                if (m.id === retItem.itemId || retItem.itemId.startsWith(`${m.id}-`)) {
                  if (m.trackStock && typeof m.stockQty === 'number') {
                    return { ...m, stockQty: m.stockQty + retItem.quantityReturned };
                  }
                }
                return m;
              });
            }
          });

          success = true;
          return {
            salesReturns: [newReturn, ...(state.salesReturns || [])],
            invoices: updatedInvoices,
            customers: updatedCustomers,
            menuItems: updatedMenuItems,
          };
        });

        if (!success) return { ok: false, error: errorMessage || 'Failed to process return.' };
        return { ok: true, id: returnId };
      },

      cancelSalesReturn: (returnId, by) => set((state) => ({
        salesReturns: (state.salesReturns || []).map(r =>
          r.id === returnId ? { ...r, status: 'cancelled' as const, notes: `${r.notes ? r.notes + ' | ' : ''}Cancelled by ${by}` } : r
        )
      })),

      addCustomer: (customer) => set((state) => ({
        customers: [
          ...state.customers,
          {
            ...customer,
            id: `c${Date.now()}`,
            totalOrders: 0,
            totalSpent: 0,
            loyaltyPoints: 50,
            firstVisit: Date.now(),
            lastVisit: Date.now(),
            tier: customer.tier || 'Regular',
          }
        ]
      })),

      updateCustomer: (id, customer) => set((state) => ({
        customers: state.customers.map(c => c.id === id ? { ...c, ...customer } : c)
      })),

      deleteCustomer: (id) => set((state) => ({
        customers: state.customers.filter(c => c.id !== id)
      })),

      addFeedback: (feedbackData) => set((state) => {
        const newFeedback: InvoiceFeedback = {
          ...feedbackData,
          id: `fb-${Date.now()}`,
          createdAt: Date.now(),
          status: 'published'
        };

        const updatedInvoices = state.invoices.map(inv => {
          if (inv.id === feedbackData.invoiceId) {
            return {
              ...inv,
              feedback: newFeedback,
              feedbackSubmitted: true
            };
          }
          return inv;
        });

        let updatedCustomers = state.customers;
        const targetPhone = (feedbackData.customerPhone || '').replace(/\D/g, '');
        if (targetPhone || feedbackData.customerId) {
          updatedCustomers = state.customers.map(cust => {
            const custPhone = (cust.phone || '').replace(/\D/g, '');
            const isMatch = (feedbackData.customerId && cust.id === feedbackData.customerId) ||
              (targetPhone && custPhone && (custPhone.endsWith(targetPhone) || targetPhone.endsWith(custPhone)));

            if (isMatch) {
              const currentPoints = cust.loyaltyPoints || 0;
              return {
                ...cust,
                loyaltyPoints: currentPoints + 50,
              };
            }
            return cust;
          });
        }

        return {
          feedbacks: [newFeedback, ...(state.feedbacks || [])],
          invoices: updatedInvoices,
          customers: updatedCustomers,
        };
      }),

      deleteFeedback: (id) => set((state) => ({
        feedbacks: (state.feedbacks || []).filter(f => f.id !== id)
      })),

      onlineFeedbackUrl: 'http://192.168.1.14:8081',

      setOnlineFeedbackUrl: (url) => set({
        onlineFeedbackUrl: url.trim().replace(/\/+$/, '')
      }),

      addMenuItem: (item) => {
        set((state) => {
          const newCategories = (item.category && !state.categories.includes(item.category))
            ? [...state.categories, item.category]
            : state.categories;
          const newRegions = (item.region && !state.regions?.includes(item.region))
            ? [...(state.regions || []), item.region]
            : (state.regions || []);
          return {
            menuItems: [...state.menuItems, { ...item, id: `m${Date.now()}` }],
            categories: newCategories,
            regions: newRegions,
          };
        });
        notifySync();
      },

      updateMenuItem: (id, item) => {
        set((state) => {
          const newCategories = (item.category && !state.categories.includes(item.category))
            ? [...state.categories, item.category]
            : state.categories;
          const newRegions = (item.region && !state.regions?.includes(item.region))
            ? [...(state.regions || []), item.region]
            : (state.regions || []);
          return {
            menuItems: state.menuItems.map(m => m.id === id ? { ...m, ...item } : m),
            categories: newCategories,
            regions: newRegions,
          };
        });
        notifySync();
      },

      deleteMenuItem: (id) => {
        set((state) => ({
          menuItems: state.menuItems.filter(m => m.id !== id)
        }));
        notifySync();
      },

      adjustMenuItemStock: (id, deltaOrQuantity, mode = 'add') => {
        set((state) => ({
          menuItems: state.menuItems.map(m => {
            if (m.id !== id) return m;
            const current = typeof m.stockQty === 'number' ? m.stockQty : 0;
            const newQty = mode === 'set' ? Math.max(0, deltaOrQuantity) : Math.max(0, current + deltaOrQuantity);
            return { ...m, trackStock: true, stockQty: newQty };
          })
        }));
        notifySync();
      },

      addCategory: (categoryName) => {
        set((state) => ({
          categories: state.categories.includes(categoryName) ? state.categories : [...state.categories, categoryName]
        }));
        notifySync();
      },

      deleteCategory: (categoryName) => {
        set((state) => ({
          categories: state.categories.filter(c => c !== categoryName)
        }));
        notifySync();
      },

      addRegion: (regionName) => {
        const trimmed = regionName.trim();
        if (!trimmed) return;
        set((state) => ({
          regions: (state.regions || []).includes(trimmed) ? (state.regions || []) : [...(state.regions || []), trimmed]
        }));
        notifySync();
      },

      updateRegion: (oldName, newName) => {
        const trimmedOld = oldName.trim();
        const trimmedNew = newName.trim();
        if (!trimmedNew || trimmedOld === trimmedNew) return;
        set((state) => {
          const currentRegions = state.regions || [];
          const updatedRegions = currentRegions.map(r => r === trimmedOld ? trimmedNew : r);
          const finalRegions = Array.from(new Set(updatedRegions));
          const updatedMenuItems = (state.menuItems || []).map(m =>
            m.region === trimmedOld ? { ...m, region: trimmedNew } : m
          );
          return {
            regions: finalRegions,
            menuItems: updatedMenuItems,
          };
        });
        notifySync();
      },

      deleteRegion: (regionName) => {
        const trimmed = regionName.trim();
        set((state) => {
          const currentRegions = state.regions || [];
          const updatedRegions = currentRegions.filter(r => r !== trimmed);
          const updatedMenuItems = (state.menuItems || []).map(m =>
            m.region === trimmed ? { ...m, region: undefined } : m
          );
          return {
            regions: updatedRegions,
            menuItems: updatedMenuItems,
          };
        });
        notifySync();
      },

      restoreDefaultRestaurantMenu: () => {
        set(() => ({
          menuItems: SULTAN_DEFAULT_MENU,
          categories: SULTAN_DEFAULT_CATEGORIES,
          regions: SULTAN_DEFAULT_REGIONS,
        }));
        notifySync();
      },

      addTable: (table) => set((state) => ({
        tables: [...state.tables, { ...table, status: table.status || 'available', id: `t${Date.now()}` }]
      })),

      updateTable: (id, updatedTable) => {
        set((state) => {
          let alert = state.lastBillPaidAlert;
          if (updatedTable.status === 'available' && alert) {
            const targetTable = state.tables.find(t => t.id === id);
            if (
              alert.tableId === id ||
              (targetTable && alert.tableName.trim().toLowerCase() === targetTable.name.trim().toLowerCase())
            ) {
              alert = null;
            }
          }
          return {
            tables: state.tables.map(t => t.id === id ? { ...t, ...updatedTable } : t),
            lastBillPaidAlert: alert
          };
        });
        notifySync();
      },

      deleteTable: (id) => set((state) => ({
        tables: state.tables.filter(t => t.id !== id)
      })),

      addFloor: (floor) => set((state) => {
        const newId = `fl-${Date.now()}`;
        const newFloor: Floor = {
          ...floor,
          id: newId,
          order: (state.floors || []).length + 1,
        };
        const currentFloors = state.floors && state.floors.length > 0 ? state.floors : INITIAL_FLOORS;
        const updatedFloors = [...currentFloors, newFloor];
        const updatedZones = state.zones.includes(floor.name) ? state.zones : [...state.zones, floor.name];
        return {
          floors: updatedFloors,
          zones: updatedZones,
        };
      }),

      updateFloor: (id, updates) => set((state) => {
        const currentFloors = state.floors && state.floors.length > 0 ? state.floors : INITIAL_FLOORS;
        const target = currentFloors.find((f) => f.id === id);
        if (!target) return state;

        const oldName = target.name;
        const newName = updates.name ? updates.name.trim() : oldName;
        const nameChanged = newName && newName.toLowerCase() !== oldName.toLowerCase();

        const updatedFloors = currentFloors.map((f) => (f.id === id ? { ...f, ...updates, name: newName } : f));

        // Cascade floor name rename to tables, zones, and staff assignedZones
        const updatedTables = nameChanged
          ? state.tables.map((t) => {
            const matchesFloor = (t.floor && t.floor.toLowerCase() === oldName.toLowerCase()) ||
              (t.zone && t.zone.toLowerCase() === oldName.toLowerCase());
            if (matchesFloor) {
              return {
                ...t,
                floor: newName,
                zone: newName,
              };
            }
            return t;
          })
          : state.tables;

        const updatedZones = nameChanged
          ? state.zones.map((z) => (z.toLowerCase() === oldName.toLowerCase() ? newName : z))
          : state.zones;

        const updatedStaff = nameChanged
          ? (state.staff || []).map((s) => ({
            ...s,
            assignedZone: s.assignedZone && s.assignedZone.toLowerCase() === oldName.toLowerCase() ? newName : s.assignedZone,
            assignedZones: (s.assignedZones || []).map((z) => (z.toLowerCase() === oldName.toLowerCase() ? newName : z)),
          }))
          : state.staff;

        return {
          floors: updatedFloors,
          tables: updatedTables,
          zones: updatedZones,
          staff: updatedStaff,
        };
      }),

      deleteFloor: (id, cascadeDeleteTables = false) => set((state) => {
        const currentFloors = state.floors && state.floors.length > 0 ? state.floors : INITIAL_FLOORS;
        const target = currentFloors.find((f) => f.id === id);
        if (!target) return state;

        const floorName = target.name.toLowerCase();
        const updatedFloors = currentFloors.filter((f) => f.id !== id);
        const updatedZones = state.zones.filter((z) => z.toLowerCase() !== floorName);

        const updatedTables = cascadeDeleteTables
          ? state.tables.filter((t) => {
            const tFloor = (t.floor || t.zone || '').toLowerCase();
            return tFloor !== floorName;
          })
          : state.tables;

        return {
          floors: updatedFloors,
          zones: updatedZones,
          tables: updatedTables,
        };
      }),

      addZone: (zoneName) => set((state) => ({
        zones: [...state.zones, zoneName]
      })),

      deleteZone: (zoneName) => set((state) => ({
        zones: state.zones.filter(z => z !== zoneName)
      })),

      addStaff: (newStaff) => {
        set((state) => {
          const existingList = state.staff || [];
          const uniqueId = `st_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
          let autoUsername = (newStaff.username || '').trim().toLowerCase().replace(/\s+/g, '');
          if (!autoUsername && newStaff.hasSystemAccess !== false && newStaff.name) {
            const baseSlug = newStaff.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (baseSlug) {
              let candidate = baseSlug;
              let n = 2;
              while (existingList.some((s) => (s.username || '').toLowerCase() === candidate)) {
                candidate = `${baseSlug}${n++}`;
              }
              autoUsername = candidate;
            }
          }
          return {
            staff: [...existingList, { ...newStaff, id: uniqueId, username: autoUsername || undefined }],
          };
        });
        notifySync();
      },

      updateStaff: (id, staffUpdates) => {
        set((state) => ({
          staff: (state.staff || []).map(s => s.id === id ? { ...s, ...staffUpdates } : s)
        }));
        notifySync();
      },

      deleteStaff: (id) => {
        set((state) => ({
          staff: (state.staff || []).filter(s => s.id !== id)
        }));
        notifySync();
      },

      registerStaffSession: (sessionData, maxAllowed = 1, autoKick = true) => {
        const now = Date.now();
        const maxDevices = Math.max(1, maxAllowed || 1);
        const currentSessions = (get().activeStaffSessions || []).filter(
          (s) => s && now - (s.lastActiveTime || s.loginTime || 0) < 24 * 60 * 60 * 1000
        );

        const normStaffId = (sessionData.staffId || '').toLowerCase().trim();
        // STRICT per-account isolation: match ONLY this exact staffId (never affect other accounts or roles!)
        const isSameAccount = (s: StaffSession) => {
          const sid = (s.staffId || '').toLowerCase().trim();
          return Boolean(normStaffId && sid && sid === normStaffId);
        };

        const sameAccountSessions = currentSessions.filter(isSameAccount);
        let otherDeviceSessions = sameAccountSessions.filter((s) => s.deviceId !== sessionData.deviceId);

        const excess = otherDeviceSessions.length + 1 - maxDevices;
        if (excess > 0 && !autoKick) {
          return {
            allowed: false,
            kickedCount: 0,
            kickedSessions: [],
            activeDevices: otherDeviceSessions,
          };
        }

        const kickedSessions: StaffSession[] = [];
        const newRevokedSessions: Record<string, RevokedSessionRecord> = {
          ...(get().revokedSessions || {}),
        };
        const newRevokedDevices: Record<string, { sessionId?: string; staffId?: string; staffName: string; timestamp: number; reason: string }> = {
          ...(get().revokedDeviceIds || {}),
        };

        // Clean up expired revocations older than 1 hour
        for (const sKey in newRevokedSessions) {
          if (now - (newRevokedSessions[sKey]?.timestamp || 0) > 60 * 60 * 1000) {
            delete newRevokedSessions[sKey];
          }
        }
        for (const devId in newRevokedDevices) {
          if (now - (newRevokedDevices[devId]?.timestamp || 0) > 60 * 60 * 1000) {
            delete newRevokedDevices[devId];
          }
        }

        // Clear any stale device-level revocation for the device now performing a fresh valid login
        if (newRevokedDevices[sessionData.deviceId]) {
          delete newRevokedDevices[sessionData.deviceId];
        }

        if (excess > 0) {
          otherDeviceSessions.sort((a, b) => (a.loginTime || 0) - (b.loginTime || 0));
          const toKick = otherDeviceSessions.slice(0, excess);
          for (const kicked of toKick) {
            kickedSessions.push(kicked);
            const reasonText = `Doosri device (${sessionData.deviceName || 'New Device'}) par login kiya gaya hai`;
            newRevokedSessions[kicked.sessionId] = {
              sessionId: kicked.sessionId,
              deviceId: kicked.deviceId,
              staffId: kicked.staffId,
              staffName: kicked.staffName,
              timestamp: now,
              reason: reasonText,
            };
            newRevokedDevices[kicked.deviceId] = {
              sessionId: kicked.sessionId,
              staffId: kicked.staffId,
              staffName: kicked.staffName,
              timestamp: now,
              reason: reasonText,
            };
          }
          otherDeviceSessions = otherDeviceSessions.slice(excess);
        }

        const newSession: StaffSession = {
          ...sessionData,
          loginTime: now,
          lastActiveTime: now,
        };

        // Preserve every other user account's sessions 100% untouched (also clear any prior session on THIS device for another account)
        const otherAccountSessions = currentSessions.filter(
          (s) => !isSameAccount(s) && s.deviceId !== sessionData.deviceId
        );
        const updatedSessions = [...otherAccountSessions, ...otherDeviceSessions, newSession];

        set({
          activeStaffSessions: updatedSessions,
          revokedSessions: newRevokedSessions,
          revokedDeviceIds: newRevokedDevices,
        });

        return { allowed: true, kickedCount: kickedSessions.length, kickedSessions };
      },

      unregisterStaffSession: (sessionId, deviceId) => {
        if (!sessionId && !deviceId) return;
        set((s) => ({
          activeStaffSessions: (s.activeStaffSessions || []).filter((sess) => {
            if (sessionId && sess.sessionId === sessionId) return false;
            if (!sessionId && deviceId && sess.deviceId === deviceId) return false;
            return true;
          }),
        }));
      },

      terminateStaffSession: (sessionId, reason) => {
        const now = Date.now();
        const sessionToTerminate = (get().activeStaffSessions || []).find((s) => s.sessionId === sessionId);
        const newRevokedSessions = { ...(get().revokedSessions || {}) };
        const newRevokedDevices = { ...(get().revokedDeviceIds || {}) };
        if (sessionToTerminate) {
          const reasonText = reason || 'Admin ne session terminate kar diya hai';
          newRevokedSessions[sessionToTerminate.sessionId] = {
            sessionId: sessionToTerminate.sessionId,
            deviceId: sessionToTerminate.deviceId,
            staffId: sessionToTerminate.staffId,
            staffName: sessionToTerminate.staffName,
            timestamp: now,
            reason: reasonText,
          };
          newRevokedDevices[sessionToTerminate.deviceId] = {
            sessionId: sessionToTerminate.sessionId,
            staffId: sessionToTerminate.staffId,
            staffName: sessionToTerminate.staffName,
            timestamp: now,
            reason: reasonText,
          };
        }
        set((s) => ({
          activeStaffSessions: (s.activeStaffSessions || []).filter((sess) => sess.sessionId !== sessionId),
          revokedSessions: newRevokedSessions,
          revokedDeviceIds: newRevokedDevices,
        }));
      },

      clearStaffSessions: (staffId) => {
        if (!staffId) {
          set({ activeStaffSessions: [] });
        } else {
          set((s) => ({
            activeStaffSessions: (s.activeStaffSessions || []).filter((sess) => sess.staffId !== staffId),
          }));
        }
      },

      markAttendance: (recordOrList) => set((state) => {
        const recordsToSave = Array.isArray(recordOrList) ? recordOrList : [recordOrList];
        const existingAttendance = [...(state.attendance || [])];

        recordsToSave.forEach((rec) => {
          const existingIdx = existingAttendance.findIndex(
            (a) => a.staffId === rec.staffId && a.date === rec.date
          );
          if (existingIdx >= 0) {
            existingAttendance[existingIdx] = {
              ...existingAttendance[existingIdx],
              ...rec,
              recordedAt: Date.now(),
            };
          } else {
            existingAttendance.unshift({
              ...rec,
              id: `att_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              recordedAt: Date.now(),
            });
          }
        });

        notifySync();
        return { attendance: existingAttendance };
      }),

      deleteAttendanceRecord: (id) => set((state) => {
        notifySync();
        return {
          attendance: (state.attendance || []).filter((a) => a.id !== id),
        };
      }),

      recordSalaryPayment: (payment) => {
        let createdPayment: SalaryPayment;
        set((state) => {
          const voucherNumber = `VCH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
          createdPayment = {
            ...payment,
            id: `sal_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            voucherNumber,
            paidAt: Date.now(),
          };
          notifySync();
          return {
            salaryPayments: [createdPayment, ...(state.salaryPayments || [])],
          };
        });
        return createdPayment!;
      },

      deleteSalaryPayment: (id) => set((state) => {
        notifySync();
        return {
          salaryPayments: (state.salaryPayments || []).filter((p) => p.id !== id),
        };
      }),

      syncFromServer: (remoteState) => {
        try {
          // Suppress store-subscription echo broadcasts whenever syncFromServer is called directly (e.g. from KDS or AppOrders polling)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { markApplyingRemoteUpdate } = require('../services/syncService');
          if (typeof markApplyingRemoteUpdate === 'function') {
            markApplyingRemoteUpdate(350);
          }
        } catch {}

        set((state) => {
          const STATUS_RANK: Record<string, number> = { pending: 0, cooking: 1, ready: 2, served: 3 };
          const mergedDeletedIds = Array.from(
            new Set([
              ...(state.deletedTicketIds || []),
              ...(Array.isArray(remoteState.deletedTicketIds) ? remoteState.deletedTicketIds : []),
            ])
          ).slice(-400);
          const deletedSet = new Set(mergedDeletedIds);

          let mergedTickets = remoteState.tickets;
          if (remoteState.tickets) {
            const remoteList = Array.isArray(remoteState.tickets) ? remoteState.tickets : [];
            const normalizedRemote = remoteList
              .filter((rt) => !!rt && typeof rt === 'object' && !!rt.id && !deletedSet.has(rt.id))
              .map((rt) => {
                const local = (state.tickets || []).find((lt) => lt && lt.id === rt.id);
                // Prevent stale remote packets from reverting forward KDS progress (e.g. served/ready/cooking -> pending)
                const localRank = local ? (STATUS_RANK[local.status] ?? 0) : -1;
                const remoteRank = STATUS_RANK[rt.status] ?? 0;

                // Merge stationStatuses station by station with highest rank
                const mergedStationStatuses: StationStatusMap = {
                  ...(local?.stationStatuses || {}),
                  ...(rt.stationStatuses || {}),
                };
                for (const st of ['main', 'juice'] as const) {
                  const localStRank = local?.stationStatuses?.[st] ? (STATUS_RANK[local.stationStatuses[st]!] ?? 0) : -1;
                  const remoteStRank = rt.stationStatuses?.[st] ? (STATUS_RANK[rt.stationStatuses[st]!] ?? 0) : -1;
                  if (localStRank >= 0 || remoteStRank >= 0) {
                    mergedStationStatuses[st] = localStRank >= remoteStRank
                      ? local!.stationStatuses![st]!
                      : rt.stationStatuses![st]!;
                  }
                }

                let finalTicket = localRank > remoteRank
                  ? { ...local!, items: Array.isArray(local!.items) ? local!.items : [] }
                  : { ...rt, items: Array.isArray(rt.items) ? rt.items : [] };

                finalTicket.stationStatuses = mergedStationStatuses;

                // Merge items to preserve item-level 'ready' or 'served' status
                if (local && Array.isArray(local.items) && Array.isArray(rt.items)) {
                  const itemRank: Record<string, number> = { pending: 0, cooking: 1, ready: 2, served: 3 };
                  const mergedItems = (finalTicket.items || []).map((curItem) => {
                    const localItem = local.items.find((li) => li.id === curItem.id);
                    const remoteItem = rt.items.find((ri) => ri.id === curItem.id);
                    const lRank = localItem?.itemStatus ? itemRank[localItem.itemStatus] ?? 0 : (localItem?.completed ? 2 : 0);
                    const rRank = remoteItem?.itemStatus ? itemRank[remoteItem.itemStatus] ?? 0 : (remoteItem?.completed ? 2 : 0);
                    if (lRank > rRank && localItem) {
                      return { ...curItem, itemStatus: localItem.itemStatus, completed: localItem.completed, readyAt: localItem.readyAt };
                    } else if (remoteItem) {
                      return { ...curItem, itemStatus: remoteItem.itemStatus, completed: remoteItem.completed, readyAt: remoteItem.readyAt };
                    }
                    return curItem;
                  });
                  finalTicket.items = mergedItems;
                }

                // If station statuses indicate served/ready, reflect on overall status
                const activeStVals = Object.values(mergedStationStatuses).filter(Boolean) as ('cooking' | 'ready' | 'served')[];
                if (activeStVals.length > 0) {
                  if (activeStVals.every((s) => s === 'served')) {
                    finalTicket.status = 'served';
                  } else if (activeStVals.every((s) => s === 'ready' || s === 'served')) {
                    finalTicket.status = 'ready';
                  } else if (activeStVals.some((s) => s === 'cooking')) {
                    finalTicket.status = 'cooking';
                  }
                }

                if (finalTicket.status === 'served' && Array.isArray(finalTicket.items)) {
                  finalTicket.items = finalTicket.items.map((it) => ({
                    ...it,
                    itemStatus: 'served' as const,
                    completed: true,
                  }));
                }
                return finalTicket;
              });

            // Preserve ALL local tickets not yet on the server that have not been deleted/billed/settled
            const remoteIds = new Set(normalizedRemote.map((rt) => rt.id));
            const remoteOrderIds = new Set(normalizedRemote.map((rt) => rt.orderId).filter(Boolean));
            const remoteTableMap = new Map((remoteState.tables || []).map((t) => [t.id, t]));
            const freshLocalOnly = (state.tickets || []).filter((lt) => {
              if (!lt || !lt.id || remoteIds.has(lt.id) || deletedSet.has(lt.id)) return false;
              if (lt.orderId && remoteOrderIds.has(lt.orderId)) return false;
              const rTable = remoteTableMap.get(lt.tableId);
              if (rTable && rTable.lastSettledAt && lt.timePlaced && lt.timePlaced < rTable.lastSettledAt) {
                return false;
              }
              return true;
            });
            mergedTickets = [...freshLocalOnly, ...normalizedRemote];
            if (freshLocalOnly.length > 0) {
              // Ensure offline-punched tickets are pushed to the server as soon as remote state arrives
              notifySync();
            }
          }

          let rawTables = state.tables;
          if (Array.isArray(remoteState.tables) && remoteState.tables.length > 0) {
            const localTableMap = new Map((state.tables || []).map((t) => [t.id, t]));
            rawTables = remoteState.tables.map((rt) => {
              const lt = localTableMap.get(rt.id);
              if (!lt) return rt;
              if (
                lt.status === 'occupied' &&
                rt.status === 'available' &&
                (lt.occupiedSince || 0) > (rt.lastSettledAt || 0)
              ) {
                return lt;
              }
              return rt;
            });
          }
          const finalTickets = mergedTickets || state.tickets || [];
          const reconciledTables = reconcileTablesWithTickets(rawTables, finalTickets);

          return {
            ...state,
            tables: reconciledTables,
            deletedTicketIds: mergedDeletedIds,
            ...(mergedTickets ? { tickets: mergedTickets } : {}),
          ...(remoteState.invoices ? {
            invoices: (() => {
              const remoteList = remoteState.invoices || [];
              const remoteMap = new Map(remoteList.map(i => [i.id, i]));
              const localUnsynced = state.invoices.filter(i => !remoteMap.has(i.id));
              return [...localUnsynced, ...remoteList];
            })()
          } : {}),
          ...(remoteState.menuItems !== undefined ? {
            menuItems: (Array.isArray(remoteState.menuItems) ? remoteState.menuItems : [])
              .filter((m) => !isLegacyDummyDish(m))
              .map(normalizeMenuItemImage)
          } : {}),
          ...(remoteState.categories ? {
            categories: (() => {
              const activeItems = remoteState.menuItems !== undefined
                ? (Array.isArray(remoteState.menuItems) ? remoteState.menuItems : [])
                : (state.menuItems || []);
              const usedCats = new Set(activeItems.map((m: any) => m?.category).filter(Boolean));
              return Array.from(new Set(['All', ...Array.from(usedCats)]));
            })()
          } : {}),
          ...(remoteState.regions ? {
            regions: Array.from(new Set([...(state.regions || SULTAN_DEFAULT_REGIONS), ...remoteState.regions]))
          } : {}),
          ...(remoteState.zones ? { zones: remoteState.zones } : {}),
          ...(remoteState.floors ? { floors: remoteState.floors } : {}),
          ...(remoteState.staff ? {
            staff: (() => {
              const cleanRemote = (Array.isArray(remoteState.staff) ? remoteState.staff : []).filter(
                (s) => s && s.id && !isLegacyDummyStaff(s)
              );
              const sMap = new Map<string, StaffMember>();
              for (const initS of INITIAL_STAFF) {
                sMap.set(initS.id, { ...initS });
              }
              for (const rem of cleanRemote) {
                const base = sMap.get(rem.id);
                sMap.set(rem.id, {
                  ...(base || {}),
                  ...rem,
                });
              }
              return Array.from(sMap.values());
            })()
          } : {}),
          ...(remoteState.attendance ? { attendance: remoteState.attendance } : {}),
          ...(remoteState.salaryPayments ? { salaryPayments: remoteState.salaryPayments } : {}),
          ...(remoteState.customers ? { customers: remoteState.customers } : {}),
          ...(remoteState.reservations ? { reservations: remoteState.reservations } : {}),
          ...(Array.isArray(remoteState.onlineOrders) ? { onlineOrders: remoteState.onlineOrders } : {}),
          ...(remoteState.pendingFloorOrderAlert !== undefined ? { pendingFloorOrderAlert: remoteState.pendingFloorOrderAlert } : {}),
          ...(remoteState.lastBeverageOrderAlert !== undefined ? { lastBeverageOrderAlert: remoteState.lastBeverageOrderAlert } : {}),
          ...(remoteState.salesReturns ? { salesReturns: remoteState.salesReturns } : {}),
          ...(remoteState.feedbacks ? { feedbacks: remoteState.feedbacks } : {}),
          ...(Array.isArray(remoteState.activeStaffSessions) ? { activeStaffSessions: remoteState.activeStaffSessions } : {}),
          ...(remoteState.revokedSessions ? {
            revokedSessions: {
              ...(state.revokedSessions || {}),
              ...remoteState.revokedSessions,
            }
          } : {}),
          ...(remoteState.revokedDeviceIds ? {
            revokedDeviceIds: (() => {
              const merged = {
                ...(state.revokedDeviceIds || {}),
                ...remoteState.revokedDeviceIds,
              };
              const nowClean = Date.now();
              const clean: typeof merged = {};
              for (const k of Object.keys(merged)) {
                const entry = merged[k];
                if (entry && entry.sessionId && nowClean - (entry.timestamp || 0) < 60 * 60 * 1000) {
                  clean[k] = entry;
                }
              }
              return clean;
            })()
          } : {}),
          ...(remoteState.lastBillPaidAlert !== undefined ? {
            lastBillPaidAlert: (() => {
              const incoming = remoteState.lastBillPaidAlert;
              if (!incoming) return null;
              // Validate that table still exists and is currently billed / paid
              const matchingTable = reconciledTables.find(
                t => t.id === incoming.tableId || t.name.trim().toLowerCase() === incoming.tableName.trim().toLowerCase()
              );
              if (!matchingTable || (matchingTable.status !== 'billed' && !matchingTable.isPaid)) {
                return null;
              }
              // If alert is older than 30 minutes (with skew buffer), discard
              if (incoming.time && Math.abs(Date.now() - incoming.time) > 30 * 60 * 1000) {
                return null;
              }
              return incoming;
            })()
          } : (
            state.lastBillPaidAlert ? {
              lastBillPaidAlert: (() => {
                const local = state.lastBillPaidAlert;
                const matchingTable = reconciledTables.find(
                  t => t.id === local.tableId || t.name.trim().toLowerCase() === local.tableName.trim().toLowerCase()
                );
                if (!matchingTable || (matchingTable.status !== 'billed' && !matchingTable.isPaid) || (local.time && Math.abs(Date.now() - local.time) > 30 * 60 * 1000)) {
                  return null;
                }
                return local;
              })()
            } : {}
          )),
          ...(remoteState.lastFoodReadyAlert !== undefined ? {
            lastFoodReadyAlert: (() => {
              const incoming = remoteState.lastFoodReadyAlert;
              if (!incoming) return null;
              const isNonTable = incoming.tableId === 'takeaway' || incoming.tableId === 'delivery';
              if (!isNonTable) {
                const matchingTable = reconciledTables.find(
                  t => t.id === incoming.tableId || t.name.trim().toLowerCase() === incoming.tableName.trim().toLowerCase()
                );
                const hasActiveTicket = finalTickets.some(
                  tk => tk.tableId === incoming.tableId && tk.status !== 'served'
                );
                if ((!matchingTable || matchingTable.status === 'available') && !hasActiveTicket) {
                  return null;
                }
              }
              if (incoming.time && Math.abs(Date.now() - incoming.time) > 30 * 60 * 1000) {
                return null;
              }
              return incoming;
            })()
          } : (
            state.lastFoodReadyAlert ? {
              lastFoodReadyAlert: (() => {
                const local = state.lastFoodReadyAlert;
                const isNonTable = local.tableId === 'takeaway' || local.tableId === 'delivery';
                if (!isNonTable) {
                  const matchingTable = reconciledTables.find(
                    t => t.id === local.tableId || t.name.trim().toLowerCase() === local.tableName.trim().toLowerCase()
                  );
                  const hasActiveTicket = finalTickets.some(
                    tk => tk.tableId === local.tableId && tk.status !== 'served'
                  );
                  if ((!matchingTable || matchingTable.status === 'available') && !hasActiveTicket) {
                    return null;
                  }
                }
                if (local.time && Math.abs(Date.now() - local.time) > 30 * 60 * 1000) {
                  return null;
                }
                return local;
              })()
            } : {}
          )),
        };
      });
      },
    }),
    {
      name: 'restaurant-storage',
      storage: appStorage,
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (Array.isArray(state.tickets)) {
            state.tickets = state.tickets
              .filter((t) => !!t && typeof t === 'object' && !!t.id)
              .map((t) => ({
                ...t,
                items: Array.isArray(t.items) ? t.items : [],
              }));
          } else {
            state.tickets = [];
          }
          if (!Array.isArray(state.onlineOrders)) {
            state.onlineOrders = [];
          }
          state.tables = reconcileTablesWithTickets(state.tables, state.tickets);
          if (!state.floors || !Array.isArray(state.floors) || state.floors.length === 0) {
            state.floors = INITIAL_FLOORS;
          }
          if (!Array.isArray(state.attendance)) {
            state.attendance = [];
          }
          if (!Array.isArray(state.salaryPayments)) {
            state.salaryPayments = [];
          }
          if ((state.dummyPurgeVersion || 0) < 1) {
            state.customers = (state.customers || []).filter((c) => c && !LEGACY_DUMMY_CUSTOMER_IDS.has(c.id));
            state.feedbacks = (state.feedbacks || []).filter((f) => f && !LEGACY_DUMMY_FEEDBACK_IDS.has(f.id));
            state.reservations = (state.reservations || []).filter((r) => r && !LEGACY_DUMMY_RESERVATION_IDS.has(r.id));
            state.attendance = (state.attendance || []).filter((a) => a && !LEGACY_DUMMY_ATTENDANCE_IDS.has(a.id));
            state.salaryPayments = (state.salaryPayments || []).filter((p) => p && !LEGACY_DUMMY_SALARY_IDS.has(p.id));
            state.dummyPurgeVersion = 1;
          }
          if (!state.regions || !Array.isArray(state.regions) || state.regions.length === 0) {
            state.regions = INITIAL_REGIONS;
          }

          // Guarantee real Sultan Restaurant menu items on storage rehydration
          if (!Array.isArray(state.menuItems) || state.menuItems.length === 0) {
            state.menuItems = SULTAN_DEFAULT_MENU.map(normalizeMenuItemImage);
          } else {
            state.menuItems = state.menuItems
              .filter((m) => !isLegacyDummyDish(m))
              .map(normalizeMenuItemImage);
            if (state.menuItems.length === 0) {
              state.menuItems = SULTAN_DEFAULT_MENU.map(normalizeMenuItemImage);
            }
          }
          const activeDishCats = new Set((state.menuItems || []).map((m: any) => m?.category).filter(Boolean));
          state.categories = Array.from(new Set(['All', ...Array.from(activeDishCats)]));
          state.regions = Array.from(new Set([...(state.regions || SULTAN_DEFAULT_REGIONS), ...SULTAN_DEFAULT_REGIONS]));

          // Reconcile staff on storage rehydration: purge legacy dummy accounts and seed real restaurant staff
          const existingCleanStaff = (state.staff || []).filter(
            (s) => s && s.id && !isLegacyDummyStaff(s)
          );
          const staffMap = new Map<string, StaffMember>();
          for (const initS of INITIAL_STAFF) {
            staffMap.set(initS.id, { ...initS });
          }
          state.staffSeedVersion = 3;
          for (const existing of existingCleanStaff) {
            const base = staffMap.get(existing.id);
            staffMap.set(existing.id, {
              ...(base || {}),
              ...existing,
            });
          }
          state.staff = Array.from(staffMap.values());

          // Normalize and assign true floor and seatingType to any table that has legacy or missing attributes
          state.tables = (state.tables || []).map(t => {
            const inferredFloor = getTableFloor(t);
            const inferredType = getTableSeatingType(t);
            const isLegacyZone = !t.floor || t.floor.toLowerCase().includes('main hall') || (t.zone && t.zone.toLowerCase().includes('main hall'));
            return {
              ...t,
              floor: isLegacyZone ? inferredFloor : (t.floor || inferredFloor),
              zone: isLegacyZone ? inferredFloor : (t.zone || inferredFloor),
              seatingType: t.seatingType || inferredType,
              cabinNumber: (t.seatingType === 'majlis' || inferredType === 'majlis') ? (t.cabinNumber || t.name) : t.cabinNumber,
            };
          });

          // Guarantee zones strictly match the configured floors, eliminating any ghost zones
          const validFloorNames = (state.floors || INITIAL_FLOORS).map((f) => f.name);
          state.zones = validFloorNames;

          // Purge stale or already-available bill paid alerts on rehydration
          if (state.lastBillPaidAlert) {
            const matchingTable = state.tables.find(
              (t) =>
                t.id === state.lastBillPaidAlert?.tableId ||
                t.name.trim().toLowerCase() === state.lastBillPaidAlert?.tableName.trim().toLowerCase()
            );
            if (
              !matchingTable ||
              matchingTable.status !== 'billed' ||
              (state.lastBillPaidAlert.time && Date.now() - state.lastBillPaidAlert.time > 30 * 60 * 1000)
            ) {
              state.lastBillPaidAlert = null;
            }
          }

          // Purge stale or already-available food ready alerts on rehydration
          if (state.lastFoodReadyAlert) {
            const matchingTable = state.tables.find(
              (t) =>
                t.id === state.lastFoodReadyAlert?.tableId ||
                t.name.trim().toLowerCase() === state.lastFoodReadyAlert?.tableName.trim().toLowerCase()
            );
            if (
              !matchingTable ||
              matchingTable.status === 'available' ||
              (state.lastFoodReadyAlert.time && Date.now() - state.lastFoodReadyAlert.time > 30 * 60 * 1000)
            ) {
              state.lastFoodReadyAlert = null;
            }
          }
        }
      },
    }
  )
);

