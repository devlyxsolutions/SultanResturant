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

export type WaiterPaymentCollection = {
  id: string;
  tableId: string;
  tableName: string;
  floor?: string;
  collectedByWaiter: string;
  collectedByWaiterId?: string;
  subTotal: number;
  tax: number;
  serviceCharge: number;
  totalAmount: number;
  tenderedAmount: number;
  changeReturned: number;
  paymentMethod: 'cash' | 'card' | 'online';
  notes?: string;
  collectedAt: number;
  status: 'pending_cashier';
};

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
  serverId?: string;
  billTotal?: number;
  orders?: OrderItem[];
  isPaid?: boolean;
  lastInvoiceId?: string;
  occupiedSince?: number;
  lastSettledAt?: number;
  reservationId?: string;
  /** If set, an Order Taker has collected payment from the guest and it is pending handover/receipt by the Cashier. */
  waiterPaymentCollection?: WaiterPaymentCollection | null;
  /** If set, this table is physically joined to the given primary table (merged reservation / big party). */
  mergedInto?: string;
  /** Optional audit trail when an active order was moved here from another table. */
  lastMoveNote?: string;
  lastMovedFrom?: string;
  lastMovedAt?: number;
  lastMovedBy?: string;
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
  serverId?: string;
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

export type TableMoveLog = {
  id: string;
  fromTableId: string;
  fromTableName: string;
  fromFloor?: string;
  toTableId: string;
  toTableName: string;
  toFloor?: string;
  note: string;
  movedBy: string;
  movedByRole?: string;
  server?: string;
  activeTicketsCount: number;
  ticketIds?: string[];
  itemsCount: number;
  billTotal: number;
  timestamp: number;
};

export type TableMoveAlert = {
  id: string;
  logId: string;
  fromTableId: string;
  fromTableName: string;
  fromFloor?: string;
  toTableId: string;
  toTableName: string;
  toFloor?: string;
  note: string;
  movedBy: string;
  movedByRole?: string;
  activeTicketsCount: number;
  itemsCount: number;
  billTotal: number;
  time: number;
};

export type CancelledOrderItem = {
  id: string;
  name: string;
  qty: number;
  price: number;
  lineTotal: number;
  station?: 'main' | 'juice';
  notes?: string;
  itemStatus?: string;
};

export type CancelledOrderLog = {
  id: string;
  ticketId: string;
  orderNumber?: string;
  tableId: string;
  tableName: string;
  floor?: string;
  orderType: 'dine-in' | 'takeaway' | 'delivery';
  server: string;
  cancelledBy: string;
  cancelledByRole?: string;
  reason: string;
  source: 'cancel_ticket' | 'release_table' | 'purge_all' | 'removed_at_billing';
  roundNumber?: number;
  isAddOn?: boolean;
  ticketStatusAtCancel?: string;
  items: CancelledOrderItem[];
  totalQty: number;
  totalAmount: number;
  timePlaced: number;
  cancelledAt: number;
};

export type OrderCancelledAlert = {
  id: string;
  logId: string;
  ticketId: string;
  tableId: string;
  tableName: string;
  floor?: string;
  cancelledBy: string;
  cancelledByRole?: string;
  reason: string;
  source: CancelledOrderLog['source'];
  itemsSummary: string;
  totalQty: number;
  totalAmount: number;
  time: number;
};

export type TicketCancelOptions = {
  reason?: string;
  cancelledBy?: string;
  cancelledByRole?: string;
  source?: CancelledOrderLog['source'];
  isSettlementCleanup?: boolean;
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
  serverId?: string;
  timePlaced: number;
  cookingStartedAt?: number;
  readyAt?: number;
  estimatedPrepTime?: number;
  status: 'pending' | 'cooking' | 'ready' | 'served';
  items: OrderItem[];
  isAddOn?: boolean;
  roundNumber?: number;
  notes?: string;
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

export type MenuItemBeverageHandling = 'juice_bar_prepared' | 'chiller_drink' | 'extras_store' | 'kitchen_dish';

export type MenuItem = {
  id: string;
  name: string;
  urduName?: string;
  price: number;
  category: string;
  region?: string;
  variants?: MenuVariant[];
  station?: 'main' | 'juice';
  /** Separates Juice Bar prepared drinks (e.g. Mint Margarita) from Floor Chiller cold drinks & Extras Store */
  beverageHandling?: MenuItemBeverageHandling;
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
  /** Floor where this reservation / group arrangement is hosted (e.g. "Rooftop"). */
  floor?: string;
  /** Extra available tables merged with the primary table for large parties. */
  linkedTableIds?: string[];
  bookingType?: 'regular' | 'group_event';
  occasion?: string;
  arrangementStyle?: string;
  advanceDeposit?: number;
  perHeadBudget?: number;
  extraChairsNeeded?: number;
  isFullFloor?: boolean;
  customerName: string;
  phone: string;
  guestsCount: number;
  reservationDate: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "08:00 PM"
  status: 'confirmed' | 'seated' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  seatedAt?: number;
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
  deletedTableIds?: string[];
  deletedFloorIds?: string[];
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
  foodReadyAlerts?: FoodReadyAlert[];
  tableMoveLogs: TableMoveLog[];
  cancelledOrderLogs: CancelledOrderLog[];
  lastTableMoveAlert?: TableMoveAlert | null;
  lastOrderCancelledAlert?: OrderCancelledAlert | null;

  confirmOnlineOrder: (orderId: string, assignedWaiter?: string) => Promise<void>;
  rejectOnlineOrder: (orderId: string, reason?: string) => Promise<void>;
  clearPendingFloorOrderAlert: (orderId?: string) => void;
  clearBeverageOrderAlert: (alertId?: string) => void;
  clearTableMoveAlert: (alertId?: string) => void;
  clearOrderCancelledAlert: (alertId?: string) => void;

  placeOrder: (tableId: string, serverName: string, items: { item: MenuItem, qty: number, notes?: string }[], isAddOn?: boolean, serverId?: string, orderNotes?: string) => void;
  startCookingTicket: (ticketId: string, station?: 'main' | 'juice') => void;
  markItemReady: (ticketId: string, itemId: string, station?: 'main' | 'juice') => void;
  markItemServed: (ticketId: string, itemId: string, station?: 'main' | 'juice') => void;
  toggleTicketItem: (ticketId: string, itemId: string) => void;
  bumpTicket: (ticketId: string, station?: 'main' | 'juice') => void;
  updateTicketStatus: (ticketId: string, status: Ticket['status'], station?: 'main' | 'juice') => void;
  serveTableTickets: (tableId: string) => void;
  markTableBilled: (tableId: string, invoiceId?: string) => void;
  recordWaiterPaymentCollection: (payload: Omit<WaiterPaymentCollection, 'id' | 'collectedAt' | 'status'>) => void;
  cancelWaiterPaymentCollection: (tableId: string) => void;
  clearBillPaidAlert: (tableIdOrName?: string) => void;
  clearFoodReadyAlert: (alertIdOrTableId?: string) => void;
  settleBill: (tableId: string) => void;
  dismissTicket: (ticketId: string, options?: TicketCancelOptions) => void;
  clearTableTickets: (tableId: string, options?: TicketCancelOptions) => void;
  clearAllOldTickets: (options?: TicketCancelOptions) => void;
  logCancelledPunchedItems: (entry: Omit<CancelledOrderLog, 'id' | 'cancelledAt'>) => void;
  transferTable: (fromTableId: string, toTableId: string, note?: string, movedBy?: string) => void;
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
  addTablesBulk: (tables: (Omit<Table, 'id' | 'status'> & { status?: Table['status'] })[]) => void;
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
  forceLogoutAll?: { timestamp: number; exceptSessionId?: string; exceptDeviceId?: string; reason: string } | null;
  registerStaffSession: (
    session: Omit<StaffSession, 'loginTime' | 'lastActiveTime'>,
    maxAllowed?: number,
    autoKick?: boolean
  ) => { allowed: boolean; kickedCount: number; kickedSessions: StaffSession[]; activeDevices?: StaffSession[] };
  unregisterStaffSession: (sessionId?: string, deviceId?: string) => void;
  terminateStaffSession: (sessionId: string, reason?: string) => void;
  terminateAllStaffSessions: (exceptSessionId?: string, exceptDeviceId?: string, reason?: string) => number;
  clearStaffSessions: (staffId?: string) => void;
  syncFromServer: (remoteState: Partial<RestaurantState>) => void;
};

export const INITIAL_FLOORS: Floor[] = [
  {
    id: 'fl-gf',
    name: 'Ground Floor',
    shortCode: 'GF',
    prefix: 'GF-',
    color: '#1976D2',
    icon: 'restaurant-outline',
    description: '',
    order: 1,
  },
  {
    id: 'fl-rt',
    name: 'Rooftop',
    shortCode: 'RT',
    prefix: 'R',
    color: '#E65100',
    icon: 'moon-outline',
    description: 'Open-air BBQ & Sky Majlis',
    order: 2,
  },
  {
    id: 'fl-1795684812562-f3w',
    name: 'Family Floor',
    shortCode: 'FA',
    prefix: 'FA',
    color: '#1976D2',
    icon: 'business-outline',
    description: '',
    order: 3,
  },
  {
    id: 'fl-1795685577395-254',
    name: 'Party Hall',
    shortCode: 'PA',
    prefix: 'PA',
    color: '#6A1B9A',
    icon: 'restaurant-outline',
    description: '',
    order: 4,
  },
];

// Canonical Sultan Restaurant 4-Floor, 63-Unit Seating Layout
const INITIAL_TABLES: Table[] = [
  // Rooftop (16 Units: R-M-01..R-M-06 Majlis, R-07..R-16 Tables)
  { id: 't-1795680804698-0-e3uz', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'R-M-01', name: 'R-M-01', seats: 6, status: 'available' },
  { id: 't-1795680804698-1-dpau', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'R-M-02', name: 'R-M-02', seats: 6, status: 'available' },
  { id: 't-1795680804698-2-iiig', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'R-M-03', name: 'R-M-03', seats: 6, status: 'available' },
  { id: 't-1795680804698-3-hlck', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'R-M-04', name: 'R-M-04', seats: 6, status: 'available' },
  { id: 't-1795680804698-4-10tx', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'R-M-05', name: 'R-M-05', seats: 6, status: 'available' },
  { id: 't-1795680804698-5-1ven', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'majlis', cabinNumber: 'R-M-06', name: 'R-M-06', seats: 10, status: 'available' },
  { id: 't-1795680864962-0-pte7', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-07', seats: 4, status: 'available' },
  { id: 't-1795680864962-1-ltml', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-08', seats: 4, status: 'available' },
  { id: 't-1795680864962-2-ip4r', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-09', seats: 4, status: 'available' },
  { id: 't-1795680864962-3-zekl', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-10', seats: 4, status: 'available' },
  { id: 't-1795680864962-4-jcbg', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-11', seats: 4, status: 'available' },
  { id: 't-1795680864962-5-4aq3', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-12', seats: 4, status: 'available' },
  { id: 't-1795680864962-6-2e2r', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-13', seats: 4, status: 'available' },
  { id: 't-1795680864962-7-buur', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-14', seats: 4, status: 'available' },
  { id: 't-1795680864962-8-jp45', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-15', seats: 4, status: 'available' },
  { id: 't-1795680864962-9-m3is', floor: 'Rooftop', zone: 'Rooftop', seatingType: 'tables', name: 'R-16', seats: 4, status: 'available' },

  // Ground Floor (16 Units: G-01..G-05 Sofas, G-06..G-10 Tables, G-M-11..G-M-16 Majlis)
  { id: 't-1795682315689-0-oeje', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'G-01', seats: 4, status: 'available' },
  { id: 't-1795682315689-1-tkdo', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'G-02', seats: 4, status: 'available' },
  { id: 't-1795682315689-2-q7m0', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'G-03', seats: 4, status: 'available' },
  { id: 't-1795682315689-3-qcb4', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'G-04', seats: 4, status: 'available' },
  { id: 't-1795682315689-4-mdeb', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'couches', name: 'G-05', seats: 4, status: 'available' },
  { id: 't-1795682315689-5-n98v', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'G-06', seats: 4, status: 'available' },
  { id: 't-1795682315689-6-0a82', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'G-07', seats: 4, status: 'available' },
  { id: 't-1795682315689-7-io4e', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'G-08', seats: 4, status: 'available' },
  { id: 't-1795682315689-8-3xft', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'G-09', seats: 4, status: 'available' },
  { id: 't-1795682315689-9-zz7k', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'tables', name: 'G-10', seats: 4, status: 'available' },
  { id: 't-1795682315689-10-beqw', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'G-M-11', name: 'G-M-11', seats: 6, status: 'available' },
  { id: 't-1795682315689-11-dm4u', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'G-M-12', name: 'G-M-12', seats: 6, status: 'available' },
  { id: 't-1795682315689-12-fcgs', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'G-M-13', name: 'G-M-13', seats: 6, status: 'available' },
  { id: 't-1795682315689-13-k088', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'G-M-14', name: 'G-M-14', seats: 6, status: 'available' },
  { id: 't-1795682315689-14-22rh', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'G-M-15', name: 'G-M-15', seats: 6, status: 'available' },
  { id: 't-1795682315689-15-cwiq', floor: 'Ground Floor', zone: 'Ground Floor', seatingType: 'majlis', cabinNumber: 'G-M-16', name: 'G-M-16', seats: 6, status: 'available' },

  // Family Floor (25 Units: F-01..F-05 Sofas, F-06..F-10 Tables, F-C-11..F-C-17 2-Seater Tables, F-M-18..F-M-25 Majlis)
  { id: 't-1795684898082-0-c43f', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'couches', name: 'F-01', seats: 4, status: 'available' },
  { id: 't-1795684898082-1-8y57', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'couches', name: 'F-02', seats: 4, status: 'available' },
  { id: 't-1795684898082-2-71c8', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'couches', name: 'F-03', seats: 4, status: 'available' },
  { id: 't-1795684898082-3-7u0o', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'couches', name: 'F-04', seats: 4, status: 'available' },
  { id: 't-1795684898082-4-q748', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'couches', name: 'F-05', seats: 4, status: 'available' },
  { id: 't-1795684898082-5-n92t', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-06', seats: 4, status: 'available' },
  { id: 't-1795684898082-6-6w27', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-07', seats: 4, status: 'available' },
  { id: 't-1795684898082-7-fo87', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-08', seats: 4, status: 'available' },
  { id: 't-1795684898082-8-1jyb', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-09', seats: 4, status: 'available' },
  { id: 't-1795684898082-9-w035', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-10', seats: 4, status: 'available' },
  { id: 't-1795684898082-10-0ajv', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-C-11', seats: 2, status: 'available' },
  { id: 't-1795684898082-11-5vkm', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-C-12', seats: 2, status: 'available' },
  { id: 't-1795684898082-12-3bz7', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-C-13', seats: 2, status: 'available' },
  { id: 't-1795684898082-13-9xn2', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-C-14', seats: 2, status: 'available' },
  { id: 't-1795684898082-14-8mw4', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-C-15', seats: 2, status: 'available' },
  { id: 't-1795684898082-15-x35d', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-C-16', seats: 2, status: 'available' },
  { id: 't-1795684898082-16-v3ca', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'tables', name: 'F-C-17', seats: 2, status: 'available' },
  { id: 't-1795684898082-17-oy96', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-18', name: 'F-M-18', seats: 6, status: 'available' },
  { id: 't-1795684898082-18-cg1e', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-19', name: 'F-M-19', seats: 6, status: 'available' },
  { id: 't-1795684898082-19-p5uj', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-20', name: 'F-M-20', seats: 6, status: 'available' },
  { id: 't-1795684898082-20-gxcn', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-21', name: 'F-M-21', seats: 6, status: 'available' },
  { id: 't-1795684898082-21-1w0l', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-22', name: 'F-M-22', seats: 6, status: 'available' },
  { id: 't-1795684898082-22-xk9k', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-23', name: 'F-M-23', seats: 6, status: 'available' },
  { id: 't-1795684898082-23-pfw8', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-24', name: 'F-M-24', seats: 6, status: 'available' },
  { id: 't-1795684898082-24-ihzu', floor: 'Family Floor', zone: 'Family Floor', seatingType: 'majlis', cabinNumber: 'F-M-25', name: 'F-M-25', seats: 6, status: 'available' },

  // Party Hall (6 Units: P-01..P-06 Tables)
  { id: 't-1795685616203-0-kx93', floor: 'Party Hall', zone: 'Party Hall', seatingType: 'tables', name: 'P-01', seats: 4, status: 'available' },
  { id: 't-1795685616203-1-7o3e', floor: 'Party Hall', zone: 'Party Hall', seatingType: 'tables', name: 'P-02', seats: 4, status: 'available' },
  { id: 't-1795685616203-2-vpqh', floor: 'Party Hall', zone: 'Party Hall', seatingType: 'tables', name: 'P-03', seats: 4, status: 'available' },
  { id: 't-1795685616203-3-layw', floor: 'Party Hall', zone: 'Party Hall', seatingType: 'tables', name: 'P-04', seats: 4, status: 'available' },
  { id: 't-1795685616203-4-2g0w', floor: 'Party Hall', zone: 'Party Hall', seatingType: 'tables', name: 'P-05', seats: 4, status: 'available' },
  { id: 't-1795685616203-5-05me', floor: 'Party Hall', zone: 'Party Hall', seatingType: 'tables', name: 'P-06', seats: 4, status: 'available' },
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
  // ── Master System Account & Kitchen KDS Terminal ──
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
  {
    id: 'st-kds',
    hasSystemAccess: true,
    username: 'kds',
    name: 'KDS',
    phone: '',
    role: 'Kitchen',
    customRoleId: 'role-kitchen',
    pin: '1113',
    status: 'Active',
    shift: 'Morning',
    joinedDate: '2026-01-01',
    designation: 'Kitchen Display System (KDS)',
  },

  // ── Kitchen & Production Staff (23 Employees — HR/Payroll registered, System Access: No) ──
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

  // ── Management, Floor, Service & Bar Staff (30 Employees — 12 with Active Logins, 18 HR-Only) ──
  { id: 'st-emp-f01', hasSystemAccess: true, username: 'shakeel', name: 'Shakeel', phone: '', role: 'Manager', customRoleId: 'role-manager', pin: '1101', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'G. Manager' },
  { id: 'st-emp-f02', hasSystemAccess: true, username: 'nadeem', name: 'Nadeem', phone: '', role: 'Floor Manager', customRoleId: 'role-floor-manager', pin: '1102', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'Ground Floor', assignedZones: ['Ground Floor'], designation: 'F. Manager' },
  { id: 'st-emp-f03', hasSystemAccess: true, username: 'adil', name: 'Adil Shah', phone: '', role: 'Floor Manager', customRoleId: 'role-floor-manager', pin: '1103', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: '1st Floor', assignedZones: ['1st Floor'], designation: 'F. Manager' },
  { id: 'st-emp-f04', hasSystemAccess: true, username: 'zulfiqar', name: 'Zulfiqar', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1104', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Order Taker' },
  { id: 'st-emp-f05', hasSystemAccess: false, name: 'Mubashir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f06', hasSystemAccess: false, name: 'Aetsham', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f07', hasSystemAccess: false, name: 'Usama', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f08', hasSystemAccess: false, name: 'Najeeb', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f09', hasSystemAccess: false, name: 'Ashir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f10', hasSystemAccess: false, name: 'Tasleema', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
  { id: 'st-emp-f11', hasSystemAccess: true, username: 'bilal', name: 'Bilal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1105', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Order Taker' },
  { id: 'st-emp-f12', hasSystemAccess: false, name: 'Tayab', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f13', hasSystemAccess: false, name: 'Fahad', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f14', hasSystemAccess: false, name: 'Shafaqat', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter' },
  { id: 'st-emp-f15', hasSystemAccess: false, name: 'Mohib', phone: '', role: 'JuiceBar', customRoleId: 'role-juicebar', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Bar Helper' },
  { id: 'st-emp-f16', hasSystemAccess: true, username: 'sharjeel', name: 'Sharjeel', phone: '', role: 'Cashier', customRoleId: 'role-cashier', pin: '1106', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Cashier' },
  { id: 'st-emp-f17', hasSystemAccess: false, name: 'Misbah', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
  { id: 'st-emp-f18', hasSystemAccess: false, name: 'Firyal', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Waiter (F)' },
  { id: 'st-emp-f19', hasSystemAccess: true, username: 'sheroz', name: 'Sheroz', phone: '', role: 'JuiceBar', customRoleId: 'role-juicebar', pin: '1107', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Barman' },
  { id: 'st-emp-f20', hasSystemAccess: false, name: 'Qasim', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Food Runner' },
  { id: 'st-emp-f21', hasSystemAccess: true, username: 'tehreem', name: 'Tehreem', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1108', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'GRO - (F)' },
  { id: 'st-emp-f22', hasSystemAccess: true, username: 'madhia', name: 'Madhia', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1109', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'GRO - (F)' },
  { id: 'st-emp-f23', hasSystemAccess: true, username: 'tahir', name: 'Tahir', phone: '', role: 'Waiter', customRoleId: 'role-waiter', pin: '1110', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', assignedZone: 'All Floors', assignedZones: ['All Floors'], designation: 'Houseman' },
  { id: 'st-emp-f24', hasSystemAccess: true, username: 'zahid', name: 'Zahid', phone: '', role: 'Manager', customRoleId: 'role-manager', pin: '1111', status: 'Active', shift: 'Morning', joinedDate: '2026-01-01', designation: 'Store Keeper' },
  { id: 'st-emp-f25', hasSystemAccess: true, username: 'tanveer', name: 'Tanveer', phone: '', role: 'Cashier', customRoleId: 'role-cashier', pin: '1112', status: 'Active', shift: 'Evening', joinedDate: '2026-01-01', designation: 'Cashier' },
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
/** True only while an Order Taker collection is still waiting for the cashier (not voided by a later settlement). */
export function isWaiterPaymentPending(
  t: { waiterPaymentCollection?: WaiterPaymentCollection | null; lastSettledAt?: number; status?: string } | null | undefined
): boolean {
  const col = t?.waiterPaymentCollection;
  if (!col || col.status !== 'pending_cashier') return false;
  if (t?.status === 'available') return false;
  return (t?.lastSettledAt || 0) < (col.collectedAt || 0);
}

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

    // If a table is marked 'occupied' but has ZERO active tickets left (e.g. tickets were cleared or cancelled),
    // release it to 'available' — UNLESS it is a seated reservation / merged group primary waiting for its first KOT.
    const hasMergedChildren = sanitizedTables.some((other) => other.mergedInto === table.id);
    const hasPendingWaiterCash = isWaiterPaymentPending(table);
    if (
      table.status === 'occupied' &&
      tableTickets.length === 0 &&
      !table.mergedInto &&
      !table.reservationId &&
      !hasMergedChildren &&
      !hasPendingWaiterCash
    ) {
      return {
        ...table,
        status: 'available',
        billTotal: 0,
        orders: [],
        server: undefined,
        isPaid: false,
        lastInvoiceId: undefined,
        occupiedSince: undefined,
        waiterPaymentCollection: null,
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

function resolveCurrentAuthActor(): { name: string; role: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('./authStore');
    const u = useAuthStore?.getState()?.user;
    if (u) {
      const roleLabel =
        u.customRoleId === 'role-cashier'
          ? 'Cashier'
          : u.customRoleId === 'role-waiter'
          ? 'Order Taker'
          : u.customRoleId === 'role-floor-manager'
          ? 'Floor Manager'
          : String(u.role || 'Staff');
      return { name: String(u.name || 'Staff'), role: roleLabel };
    }
  } catch {}
  return { name: 'Staff', role: 'Staff' };
}

function buildCancelledItemsList(items: OrderItem[] | undefined): CancelledOrderItem[] {
  return (items || []).map((it) => {
    const qty = Number(it.qty || 1);
    const price = Number(it.price || 0);
    return {
      id: it.id,
      name: it.name,
      qty,
      price,
      lineTotal: price * qty,
      station: it.station,
      notes: it.notes,
      itemStatus: it.itemStatus,
    };
  });
}

function summarizeCancelledItems(items: CancelledOrderItem[]): string {
  if (!items.length) return 'No items';
  const head = items
    .slice(0, 3)
    .map((i) => `${i.qty}x ${i.name}`)
    .join(', ');
  return items.length > 3 ? `${head} +${items.length - 3} more` : head;
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set, get) => ({
      tables: INITIAL_TABLES,
      deletedTableIds: [],
      deletedFloorIds: [],
      invoices: [],
      salesReturns: [],
      customers: INITIAL_CUSTOMERS,
      feedbacks: INITIAL_FEEDBACKS,
      staff: INITIAL_STAFF,
      activeStaffSessions: [],
      revokedSessions: {},
      revokedDeviceIds: {},
      forceLogoutAll: null,
      attendance: INITIAL_ATTENDANCE,
      salaryPayments: INITIAL_SALARY_PAYMENTS,
      reservations: INITIAL_RESERVATIONS,
      onlineOrders: [],
      pendingFloorOrderAlert: null,
      tableMoveLogs: [],
      cancelledOrderLogs: [],
      lastTableMoveAlert: null,
      lastOrderCancelledAlert: null,
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
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
          syncCloudOrderStatus(orderId, {
            status: 'CONFIRMED',
            assignedWaiter: assignedWaiter || 'Floor Manager Confirmed',
          });
        } catch (_) {}
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
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
          syncCloudOrderStatus(orderId, {
            status: 'CANCELLED',
            managerNotes: reason || 'Rejected by Floor Manager',
          });
        } catch (_) {}
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

      clearTableMoveAlert: (alertId?: string) => set((state) => {
        if (!alertId || state.lastTableMoveAlert?.id === alertId) {
          notifySync();
          return { lastTableMoveAlert: null };
        }
        return state;
      }),

      clearOrderCancelledAlert: (alertId?: string) => set((state) => {
        if (!alertId || state.lastOrderCancelledAlert?.id === alertId) {
          notifySync();
          return { lastOrderCancelledAlert: null };
        }
        return state;
      }),

      placeOrder: (tableId, serverName, orderItems, isAddOn, serverId, orderNotes) => {
        const sysSettings = useSettingsStore.getState().settings;
        const autoRouteBev = sysSettings.kdsAutoRouteBeverages !== false;
        const targetMainPrep = sysSettings.kdsTargetPrepMinutes || 15;
        let resolvedServerId = serverId;
        if (!resolvedServerId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useAuthStore } = require('./authStore');
            const activeUser = useAuthStore?.getState()?.user;
            if (activeUser && (!serverName || activeUser.name?.trim().toLowerCase() === serverName.trim().toLowerCase())) {
              resolvedServerId = activeUser.staffId || activeUser.id;
            }
          } catch {}
        }
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

          const finalServerId = resolvedServerId || table?.serverId;

          const newTicket: Ticket = {
            id: newTicketId,
            tableId, // can be dummy like 'takeaway' or actual tableId
            tableName: table ? (isActuallyAddOn ? `${table.name} (Add-on #${roundNumber})` : table.name) : (tableId === 'delivery' ? 'Delivery' : 'Takeaway'),
            server: serverName,
            serverId: finalServerId,
            timePlaced: Date.now(),
            cookingStartedAt: undefined,
            estimatedPrepTime: maxPrepTime,
            status: 'pending',
            isAddOn: isActuallyAddOn,
            roundNumber: isActuallyAddOn ? roundNumber : 1,
            notes: orderNotes?.trim() || undefined,
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

          // Detect beverages for Chiller Stock Auto-Deduction across floors
          const beverageItems = orderItems.filter((oi) => {
            const cat = (oi.item.category || '').toLowerCase();
            const nm = (oi.item.name || '').toLowerCase();
            const st = (oi.item.station || '').toLowerCase();
            return (
              cat === 'drinks' ||
              cat === 'beverages' ||
              cat.includes('drink') ||
              cat.includes('beverage') ||
              cat.includes('juice') ||
              cat.includes('soda') ||
              st === 'juice' ||
              st === 'bar' ||
              nm.includes('water') ||
              nm.includes('pepsi') ||
              nm.includes('coke') ||
              nm.includes('cola') ||
              nm.includes('sprite') ||
              nm.includes('fanta') ||
              nm.includes('7up') ||
              nm.includes('dew') ||
              nm.includes('marinda') ||
              nm.includes('mirinda') ||
              nm.includes('sting') ||
              nm.includes('soda') ||
              nm.includes('pakola') ||
              nm.includes('juice') ||
              nm.includes('shake') ||
              nm.includes('lassi') ||
              nm.includes('lemonade') ||
              nm.includes('rooh afza') ||
              nm.includes('red bull') ||
              nm.includes('tin') ||
              nm.includes('can') ||
              nm.includes('cold drink')
            );
          });

          let newBeverageAlert: BeverageOrderAlert | null = null;
          if (beverageItems.length > 0) {
            const rawFloor = table ? (table.floor || table.zone || 'Ground Floor').trim() : 'Ground Floor';
            const itemsSummary = beverageItems.map((b) => `${b.qty}x ${b.item.name}`).join(', ');
            newBeverageAlert = {
              id: `bev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              tableId: table ? table.id : (tableId || 'counter'),
              tableName: table ? table.name : (tableId === 'delivery' ? 'Delivery' : 'Takeaway / Counter'),
              floor: rawFloor,
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

            // Trigger opsStore floor chiller deduction ONLY for packaged chiller beverages (NEVER Juice Bar prepared drinks like Mint Margarita or Extras Store items!)
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { useOpsStore, normalizeChillerFloor, isJuiceBarPreparedName } = require('./opsStore');
              if (useOpsStore && typeof useOpsStore.getState === 'function') {
                const chillerOnlyItems = beverageItems.filter((b) => {
                  const handling = b.item.beverageHandling;
                  if (handling === 'juice_bar_prepared' || handling === 'extras_store' || handling === 'kitchen_dish') {
                    return false;
                  }
                  if (typeof isJuiceBarPreparedName === 'function' && isJuiceBarPreparedName(b.item.name, b.item.category) && handling !== 'chiller_drink') {
                    return false;
                  }
                  return true;
                });
                if (chillerOnlyItems.length > 0) {
                  const normFloor = typeof normalizeChillerFloor === 'function' ? normalizeChillerFloor(rawFloor) : rawFloor;
                  useOpsStore.getState().deductFloorBeverageUsage({
                    floor: normFloor,
                    items: chillerOnlyItems.map((b) => ({
                      menuItemId: b.item.id,
                      name: b.item.name,
                      qty: b.qty,
                    })),
                    tableId: table?.id,
                    tableName: table ? table.name : (tableId === 'delivery' ? 'Delivery' : 'Takeaway / Counter'),
                    by: serverName,
                  });
                }
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
                    if (oi.notes?.trim()) {
                      const parts = [found.notes, oi.notes.trim()].filter(Boolean) as string[];
                      found.notes = Array.from(new Set(parts)).join(' • ');
                    }
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
                  serverId: finalServerId,
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
          serverId: ticket.serverId,
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
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
            syncCloudOrderStatus(targetOrdId, { status: 'PREPARING', estimatedDeliveryMinutes: maxPrep });
          } catch (_) {}
        }

        notifySync();
        const prevAlerts = (state.foodReadyAlerts || []).filter(a => a && a.id !== cookingAlert.id && now - a.time < 30 * 60 * 1000);
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
          foodReadyAlerts: [cookingAlert, ...prevAlerts].slice(0, 25),
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
          serverId: ticket.serverId,
          station: itemStation,
          stationLabel: itemStation === 'juice' ? 'Juice Bar' : 'Kitchen',
          itemsSummary: `${targetItem.qty}x ${targetItem.name} (Ready to Serve Now!)`,
          type: 'item_ready',
          singleItemName: targetItem.name,
          time: now,
        };

        notifySync();
        const prevAlerts = (state.foodReadyAlerts || []).filter(a => a && a.id !== alert.id && now - a.time < 30 * 60 * 1000);
        return {
          tickets: state.tickets.map(t => t.id === ticketId ? {
            ...t,
            items: updatedItems,
            status: overallStatus,
            stationStatuses: currentStationStatuses,
          } : t),
          lastFoodReadyAlert: alert,
          foodReadyAlerts: [alert, ...prevAlerts].slice(0, 25),
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
                serverId: t.serverId,
                station: itemStation,
                stationLabel: itemStation === 'juice' ? 'Juice Bar' : 'Kitchen',
                itemsSummary: summary || 'Items Ready for Pickup',
                type: 'ready',
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
        const nextAlertsList =
          updatedAlert && updatedAlert.id !== state.lastFoodReadyAlert?.id
            ? [updatedAlert, ...(state.foodReadyAlerts || []).filter(a => a && a.id !== updatedAlert!.id && Date.now() - a.time < 30 * 60 * 1000)].slice(0, 25)
            : (state.foodReadyAlerts || []);
        return {
          tickets: updatedTickets,
          lastFoodReadyAlert: updatedAlert,
          foodReadyAlerts: nextAlertsList,
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
          const now = Date.now();
          const updatedItems = ticket.items.map(item => {
            const itemSt = resolveMenuCatalogStation(item, state.menuItems, useSettingsStore.getState().settings.kdsAutoRouteBeverages !== false);
            if ((item.station || itemSt) === station || itemSt === station) {
              return { ...item, station: itemSt, itemStatus: 'served' as const, completed: true, servedAt: item.servedAt || now };
            }
            return { ...item, station: item.station || itemSt };
          });

          const hasMainItems = updatedItems.some(i => (i.station || 'main') === 'main');
          const hasJuiceItems = updatedItems.some(i => i.station === 'juice');
          const currentStationStatuses: StationStatusMap = {
            main: hasMainItems
              ? (station === 'main' ? 'served' : (ticket.stationStatuses?.main || (updatedItems.filter(i => (i.station || 'main') === 'main').every(i => i.itemStatus === 'served') ? 'served' : updatedItems.filter(i => (i.station || 'main') === 'main').every(i => i.itemStatus === 'ready' || i.itemStatus === 'served' || i.completed) ? 'ready' : ticket.status)))
              : undefined,
            juice: hasJuiceItems
              ? (station === 'juice' ? 'served' : (ticket.stationStatuses?.juice || (updatedItems.filter(i => i.station === 'juice').every(i => i.itemStatus === 'served') ? 'served' : updatedItems.filter(i => i.station === 'juice').every(i => i.itemStatus === 'ready' || i.itemStatus === 'served' || i.completed) ? 'ready' : ticket.status)))
              : undefined,
          };
          currentStationStatuses[station] = 'served';

          const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('pending' | 'cooking' | 'ready' | 'served')[];
          const allItemsServed = updatedItems.length > 0 && updatedItems.every(i => i.itemStatus === 'served');
          const overallStatus: Ticket['status'] = (allItemsServed || (activeStatuses.length > 0 && activeStatuses.every(s => s === 'served')))
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
            const now = Date.now();
            const autoRouteBev = useSettingsStore.getState().settings.kdsAutoRouteBeverages !== false;
            const updatedItems = t.items.map(item => {
              const itemSt = resolveMenuCatalogStation(item, state.menuItems, autoRouteBev);
              if ((item.station || itemSt) === station || itemSt === station) {
                if (status === 'served') {
                  return { ...item, station: itemSt, itemStatus: 'served' as const, completed: true, servedAt: item.servedAt || now };
                } else if (status === 'ready') {
                  return { ...item, station: itemSt, itemStatus: 'ready' as const, completed: true, readyAt: item.readyAt || now };
                } else if (status === 'cooking') {
                  return { ...item, station: itemSt, itemStatus: 'cooking' as const, completed: false };
                }
              }
              return { ...item, station: item.station || itemSt };
            });

            const hasMainItems = updatedItems.some(i => (i.station || 'main') === 'main');
            const hasJuiceItems = updatedItems.some(i => i.station === 'juice');
            const currentStationStatuses: StationStatusMap = {
              main: hasMainItems
                ? (station === 'main' ? status : (t.stationStatuses?.main || t.status))
                : undefined,
              juice: hasJuiceItems
                ? (station === 'juice' ? status : (t.stationStatuses?.juice || t.status))
                : undefined,
            };
            currentStationStatuses[station] = status;

            const activeStatuses = Object.values(currentStationStatuses).filter(Boolean) as ('pending' | 'cooking' | 'ready' | 'served')[];
            let overallStatus: Ticket['status'] = t.status;
            if (activeStatuses.length > 0) {
              if (activeStatuses.every(s => s === 'served')) {
                overallStatus = 'served';
              } else if (activeStatuses.every(s => s === 'ready' || s === 'served')) {
                overallStatus = 'ready';
              } else if (activeStatuses.some(s => s === 'cooking' || s === 'ready' || s === 'served')) {
                overallStatus = 'cooking';
              } else {
                overallStatus = 'pending';
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
                serverId: t.serverId,
                station,
                stationLabel: station === 'juice' ? 'Juice Bar' : 'Kitchen',
                itemsSummary: stationItems || 'Items Ready for Pickup',
                type: 'ready',
                time: Date.now(),
              };
              if (t.orderId) {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
                  syncCloudOrderStatus(t.orderId, { status: 'READY' });
                } catch (_) {}
              }
            } else if (status === 'cooking') {
              const stationItems = t.items
                .filter(i => (i.station || 'main') === station)
                .map(i => `${i.qty}x ${i.name}`)
                .join(', ');
              updatedAlert = {
                id: `cook_${t.id}_${station}_${Date.now()}`,
                ticketId: t.id,
                tableId: t.tableId,
                tableName: t.tableName,
                server: t.server,
                serverId: t.serverId,
                station,
                stationLabel: station === 'juice' ? 'Juice Bar' : 'Kitchen',
                itemsSummary: stationItems ? `Cooking: ${stationItems}` : 'Cooking started in KDS',
                type: 'cooking_started',
                time: Date.now(),
              };
              if (t.orderId) {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
                  syncCloudOrderStatus(t.orderId, { status: 'PREPARING' });
                } catch (_) {}
              }
            } else if (status === 'served') {
              if (updatedAlert && updatedAlert.ticketId === t.id && (updatedAlert.station === station || updatedAlert.station === 'all')) {
                updatedAlert = null;
              }
              if (t.orderId) {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
                  syncCloudOrderStatus(t.orderId, { status: 'SERVED' });
                } catch (_) {}
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
              serverId: t.serverId,
              station: 'all',
              stationLabel: 'Kitchen',
              itemsSummary: allItemsSummary || 'Order Ready for Pickup',
              type: 'ready',
              time: Date.now(),
            };
            if (t.orderId) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
                syncCloudOrderStatus(t.orderId, { status: 'READY' });
              } catch (_) {}
            }
          } else if (status === 'cooking') {
            const allItemsSummary = t.items.map(i => `${i.qty}x ${i.name}`).join(', ');
            updatedAlert = {
              id: `cook_${t.id}_all_${Date.now()}`,
              ticketId: t.id,
              tableId: t.tableId,
              tableName: t.tableName,
              server: t.server,
              serverId: t.serverId,
              station: 'all',
              stationLabel: 'Kitchen',
              itemsSummary: allItemsSummary ? `Cooking: ${allItemsSummary}` : 'Cooking started in KDS',
              type: 'cooking_started',
              time: Date.now(),
            };
            if (t.orderId) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
                syncCloudOrderStatus(t.orderId, { status: 'PREPARING' });
              } catch (_) {}
            }
          } else if (status === 'served') {
            if (updatedAlert && updatedAlert.ticketId === t.id) {
              updatedAlert = null;
            }
            if (t.orderId) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { syncCloudOrderStatus } = require('../services/cloudMenuBridge');
                syncCloudOrderStatus(t.orderId, { status: 'SERVED' });
              } catch (_) {}
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
        const nextAlertsList =
          updatedAlert && updatedAlert.id !== state.lastFoodReadyAlert?.id
            ? [updatedAlert, ...(state.foodReadyAlerts || []).filter(a => a && a.id !== updatedAlert!.id && Date.now() - a.time < 30 * 60 * 1000)].slice(0, 25)
            : (state.foodReadyAlerts || []);
        return {
          tickets: updatedTickets,
          lastFoodReadyAlert: updatedAlert,
          foodReadyAlerts: nextAlertsList,
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

      recordWaiterPaymentCollection: (payload) => set((state) => {
        const now = Date.now();
        const collection: WaiterPaymentCollection = {
          ...payload,
          id: `wpay_${payload.tableId}_${now}`,
          collectedAt: now,
          status: 'pending_cashier',
        };
        notifySync();
        return {
          tables: state.tables.map((t) =>
            t.id === payload.tableId
              ? {
                  ...t,
                  status: 'occupied',
                  isPaid: false,
                  billTotal: payload.totalAmount || t.billTotal || 0,
                  server: payload.collectedByWaiter || t.server,
                  serverId: payload.collectedByWaiterId || t.serverId,
                  occupiedSince: t.occupiedSince || now,
                  waiterPaymentCollection: collection,
                }
              : t
          ),
        };
      }),

      cancelWaiterPaymentCollection: (tableId) => set((state) => {
        notifySync();
        return {
          tables: state.tables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  waiterPaymentCollection: null,
                }
              : t
          ),
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
        const query = alertIdOrTableId.trim().toLowerCase();
        const matchesAlert = (a: FoodReadyAlert) =>
          a.id === alertIdOrTableId ||
          a.ticketId === alertIdOrTableId ||
          a.tableId.trim().toLowerCase() === query ||
          a.tableName.trim().toLowerCase() === query;

        const current = state.lastFoodReadyAlert;
        const nextLast = current && matchesAlert(current) ? null : current;
        const nextList = (state.foodReadyAlerts || []).filter((a) => !matchesAlert(a));
        notifySync();
        return { lastFoodReadyAlert: nextLast, foodReadyAlerts: nextList };
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
        const linkedReservationId = targetTable?.reservationId;

        notifySync();
        return {
          tables: state.tables.map(t =>
            (t.id === tableId || t.mergedInto === tableId) ? {
              ...t,
              status: 'available',
              billTotal: 0,
              server: undefined,
              serverId: undefined,
              orders: [],
              isPaid: false,
              lastInvoiceId: undefined,
              occupiedSince: undefined,
              lastSettledAt: now,
              mergedInto: undefined,
              reservationId: undefined,
              waiterPaymentCollection: null,
              lastMoveNote: undefined,
              lastMovedFrom: undefined,
              lastMovedAt: undefined,
              lastMovedBy: undefined,
            } : t
          ),
          reservations: (state.reservations || []).map(r => {
            if (r.status === 'seated' && (r.id === linkedReservationId || r.tableId === tableId)) {
              return { ...r, status: 'completed' as const, updatedAt: now };
            }
            return r;
          }),
          tickets: state.tickets.filter(t => t.tableId !== tableId),
          deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), ...removedIds])).slice(-400),
          lastBillPaidAlert: matchesAlert ? null : state.lastBillPaidAlert,
          lastFoodReadyAlert: matchesFoodAlert ? null : state.lastFoodReadyAlert
        };
      }),

      dismissTicket: (ticketId, options) => set((state) => {
        const target = (state.tickets || []).find(t => t.id === ticketId);
        const remainingTickets = (state.tickets || []).filter(t => t.id !== ticketId);
        const now = Date.now();
        let updatedTables = state.tables;
        const targetTable = target && target.tableId ? state.tables.find(t => t.id === target.tableId) : undefined;
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
                lastMoveNote: undefined,
                lastMovedFrom: undefined,
                lastMovedAt: undefined,
                lastMovedBy: undefined,
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

        let nextCancelledLogs = state.cancelledOrderLogs || [];
        let nextCancelledAlert = state.lastOrderCancelledAlert || null;

        if (!options?.isSettlementCleanup && target) {
          const actor = resolveCurrentAuthActor();
          const cancelledItems = buildCancelledItemsList(target.items);
          const totalQty = cancelledItems.reduce((s, i) => s + i.qty, 0);
          const totalAmount = cancelledItems.reduce((s, i) => s + i.lineTotal, 0);
          const orderType: 'dine-in' | 'takeaway' | 'delivery' =
            target.tableId === 'delivery'
              ? 'delivery'
              : target.tableId === 'takeaway'
              ? 'takeaway'
              : 'dine-in';
          const cleanReason = (options?.reason || '').trim() || 'Cancelled from POS Running Orders';
          const cancelledBy = (options?.cancelledBy || '').trim() || actor.name;
          const cancelledByRole = (options?.cancelledByRole || '').trim() || actor.role;
          const floor = targetTable ? getTableFloor(targetTable) : undefined;
          const logId = `cncl_${now}_${Math.random().toString(36).substring(2, 6)}`;
          const logEntry: CancelledOrderLog = {
            id: logId,
            ticketId: target.id,
            orderNumber: target.orderNumber,
            tableId: target.tableId,
            tableName: targetTable?.name || target.tableName || target.tableId,
            floor,
            orderType,
            server: target.server || targetTable?.server || 'Staff',
            cancelledBy,
            cancelledByRole,
            reason: cleanReason,
            source: options?.source || 'cancel_ticket',
            roundNumber: target.roundNumber,
            isAddOn: target.isAddOn,
            ticketStatusAtCancel: target.status,
            items: cancelledItems,
            totalQty,
            totalAmount,
            timePlaced: target.timePlaced || now,
            cancelledAt: now,
          };
          nextCancelledLogs = [logEntry, ...nextCancelledLogs].slice(0, 1500);
          nextCancelledAlert = {
            id: `alert_${logId}`,
            logId,
            ticketId: target.id,
            tableId: target.tableId,
            tableName: logEntry.tableName,
            floor,
            cancelledBy,
            cancelledByRole,
            reason: cleanReason,
            source: logEntry.source,
            itemsSummary: summarizeCancelledItems(cancelledItems),
            totalQty,
            totalAmount,
            time: now,
          };
        }

        notifySync();
        return {
          tables: updatedTables,
          tickets: remainingTickets,
          deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), ticketId])).slice(-400),
          cancelledOrderLogs: nextCancelledLogs,
          lastOrderCancelledAlert: nextCancelledAlert,
        };
      }),

      clearTableTickets: (tableId, options) => set((state) => {
        const removedTickets = (state.tickets || []).filter(t => t.tableId === tableId);
        const removedIds = removedTickets.map(t => t.id);
        const targetTable = state.tables.find(t => t.id === tableId);
        const now = Date.now();

        let nextCancelledLogs = state.cancelledOrderLogs || [];
        let nextCancelledAlert = state.lastOrderCancelledAlert || null;

        if (!options?.isSettlementCleanup) {
          const actor = resolveCurrentAuthActor();
          const cleanReason = (options?.reason || '').trim() || 'Table released without billing';
          const cancelledBy = (options?.cancelledBy || '').trim() || actor.name;
          const cancelledByRole = (options?.cancelledByRole || '').trim() || actor.role;
          const floor = targetTable ? getTableFloor(targetTable) : undefined;
          const orderType: 'dine-in' | 'takeaway' | 'delivery' =
            tableId === 'delivery' ? 'delivery' : tableId === 'takeaway' ? 'takeaway' : 'dine-in';

          const newEntries: CancelledOrderLog[] = [];
          if (removedTickets.length > 0) {
            removedTickets.forEach((tk, idx) => {
              const items = buildCancelledItemsList(tk.items);
              const totalQty = items.reduce((s, i) => s + i.qty, 0);
              const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
              newEntries.push({
                id: `cncl_${now}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
                ticketId: tk.id,
                orderNumber: tk.orderNumber,
                tableId: tk.tableId,
                tableName: targetTable?.name || tk.tableName || tableId,
                floor,
                orderType,
                server: tk.server || targetTable?.server || 'Staff',
                cancelledBy,
                cancelledByRole,
                reason: cleanReason,
                source: options?.source || 'release_table',
                roundNumber: tk.roundNumber,
                isAddOn: tk.isAddOn,
                ticketStatusAtCancel: tk.status,
                items,
                totalQty,
                totalAmount,
                timePlaced: tk.timePlaced || now,
                cancelledAt: now,
              });
            });
          } else if (targetTable && !targetTable.isPaid && Array.isArray(targetTable.orders) && targetTable.orders.length > 0) {
            const items = buildCancelledItemsList(targetTable.orders);
            const totalQty = items.reduce((s, i) => s + i.qty, 0);
            const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
            newEntries.push({
              id: `cncl_${now}_tbl_${Math.random().toString(36).substring(2, 6)}`,
              ticketId: `TBL-${targetTable.name.replace(/\s+/g, '')}`,
              tableId: targetTable.id,
              tableName: targetTable.name,
              floor,
              orderType: 'dine-in',
              server: targetTable.server || 'Staff',
              cancelledBy,
              cancelledByRole,
              reason: cleanReason,
              source: options?.source || 'release_table',
              items,
              totalQty,
              totalAmount,
              timePlaced: targetTable.occupiedSince || now,
              cancelledAt: now,
            });
          }

          if (newEntries.length > 0) {
            nextCancelledLogs = [...newEntries, ...nextCancelledLogs].slice(0, 1500);
            const allItems = newEntries.flatMap((e) => e.items);
            const combinedQty = allItems.reduce((s, i) => s + i.qty, 0);
            const combinedAmt = allItems.reduce((s, i) => s + i.lineTotal, 0);
            nextCancelledAlert = {
              id: `alert_${newEntries[0].id}`,
              logId: newEntries[0].id,
              ticketId: newEntries.length === 1 ? newEntries[0].ticketId : `${newEntries.length} KOTs`,
              tableId,
              tableName: targetTable?.name || newEntries[0].tableName,
              floor,
              cancelledBy,
              cancelledByRole,
              reason: cleanReason,
              source: options?.source || 'release_table',
              itemsSummary: summarizeCancelledItems(allItems),
              totalQty: combinedQty,
              totalAmount: combinedAmt,
              time: now,
            };
          }
        }

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
                  waiterPaymentCollection: null,
                  lastMoveNote: undefined,
                  lastMovedFrom: undefined,
                  lastMovedAt: undefined,
                  lastMovedBy: undefined,
                }
              : t
          ),
          tickets: (state.tickets || []).filter(t => t.tableId !== tableId),
          deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), ...removedIds])).slice(-400),
          cancelledOrderLogs: nextCancelledLogs,
          lastOrderCancelledAlert: nextCancelledAlert,
        };
      }),

      clearAllOldTickets: (options) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { getActiveServerHttpUrl } = require('../services/syncService');
          const apiBase = typeof getActiveServerHttpUrl === 'function' ? getActiveServerHttpUrl() : 'http://192.168.100.3:5050';
          fetch(`${apiBase}/api/pos/clear-all`, { method: 'POST' }).catch(() => {});
        } catch {}
        set((state) => {
          const allTickets = state.tickets || [];
          const removedIds = allTickets.map(t => t.id);
          const now = Date.now();

          let nextCancelledLogs = state.cancelledOrderLogs || [];
          let nextCancelledAlert = state.lastOrderCancelledAlert || null;

          if (!options?.isSettlementCleanup && allTickets.length > 0) {
            const actor = resolveCurrentAuthActor();
            const cleanReason = (options?.reason || '').trim() || 'Purged all active running orders';
            const cancelledBy = (options?.cancelledBy || '').trim() || actor.name;
            const cancelledByRole = (options?.cancelledByRole || '').trim() || actor.role;

            const newEntries: CancelledOrderLog[] = allTickets.map((tk, idx) => {
              const tbl = state.tables.find(t => t.id === tk.tableId);
              const items = buildCancelledItemsList(tk.items);
              const totalQty = items.reduce((s, i) => s + i.qty, 0);
              const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);
              const orderType: 'dine-in' | 'takeaway' | 'delivery' =
                tk.tableId === 'delivery' ? 'delivery' : tk.tableId === 'takeaway' ? 'takeaway' : 'dine-in';
              return {
                id: `cncl_${now}_all_${idx}_${Math.random().toString(36).substring(2, 6)}`,
                ticketId: tk.id,
                orderNumber: tk.orderNumber,
                tableId: tk.tableId,
                tableName: tbl?.name || tk.tableName || tk.tableId,
                floor: tbl ? getTableFloor(tbl) : undefined,
                orderType,
                server: tk.server || tbl?.server || 'Staff',
                cancelledBy,
                cancelledByRole,
                reason: cleanReason,
                source: options?.source || 'purge_all',
                roundNumber: tk.roundNumber,
                isAddOn: tk.isAddOn,
                ticketStatusAtCancel: tk.status,
                items,
                totalQty,
                totalAmount,
                timePlaced: tk.timePlaced || now,
                cancelledAt: now,
              };
            });

            nextCancelledLogs = [...newEntries, ...nextCancelledLogs].slice(0, 1500);
            const allItems = newEntries.flatMap((e) => e.items);
            const combinedQty = allItems.reduce((s, i) => s + i.qty, 0);
            const combinedAmt = allItems.reduce((s, i) => s + i.lineTotal, 0);
            nextCancelledAlert = {
              id: `alert_${newEntries[0].id}`,
              logId: newEntries[0].id,
              ticketId: `${newEntries.length} Active KOTs`,
              tableId: 'all',
              tableName: `${newEntries.length} Running Orders`,
              cancelledBy,
              cancelledByRole,
              reason: cleanReason,
              source: 'purge_all',
              itemsSummary: summarizeCancelledItems(allItems),
              totalQty: combinedQty,
              totalAmount: combinedAmt,
              time: now,
            };
          }

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
                    lastMoveNote: undefined,
                    lastMovedFrom: undefined,
                    lastMovedAt: undefined,
                    lastMovedBy: undefined,
                  }
                : t
            ),
            tickets: [],
            deletedTicketIds: Array.from(new Set([...(state.deletedTicketIds || []), 'KOT-1042', ...removedIds])).slice(-400),
            lastBillPaidAlert: null,
            lastFoodReadyAlert: null,
            cancelledOrderLogs: nextCancelledLogs,
            lastOrderCancelledAlert: nextCancelledAlert,
          };
        });
      },

      logCancelledPunchedItems: (entry) => set((state) => {
        const now = Date.now();
        const actor = resolveCurrentAuthActor();
        const logId = `cncl_${now}_itm_${Math.random().toString(36).substring(2, 6)}`;
        const fullEntry: CancelledOrderLog = {
          ...entry,
          id: logId,
          cancelledBy: entry.cancelledBy || actor.name,
          cancelledByRole: entry.cancelledByRole || actor.role,
          cancelledAt: now,
        };
        const alert: OrderCancelledAlert = {
          id: `alert_${logId}`,
          logId,
          ticketId: fullEntry.ticketId,
          tableId: fullEntry.tableId,
          tableName: fullEntry.tableName,
          floor: fullEntry.floor,
          cancelledBy: fullEntry.cancelledBy,
          cancelledByRole: fullEntry.cancelledByRole,
          reason: fullEntry.reason,
          source: fullEntry.source,
          itemsSummary: summarizeCancelledItems(fullEntry.items),
          totalQty: fullEntry.totalQty,
          totalAmount: fullEntry.totalAmount,
          time: now,
        };
        notifySync();
        return {
          cancelledOrderLogs: [fullEntry, ...(state.cancelledOrderLogs || [])].slice(0, 1500),
          lastOrderCancelledAlert: alert,
        };
      }),

      transferTable: (fromTableId, toTableId, note, movedBy) => {
        const cleanNote = (note || '').trim();
        const now = Date.now();
        const actor = resolveCurrentAuthActor();
        set((state) => {
          const fromTable = state.tables.find(t => t.id === fromTableId);
          const toTable = state.tables.find(t => t.id === toTableId);
          if (!fromTable || !toTable || toTable.status === 'occupied' || toTable.status === 'billed') {
            return state;
          }

          const resolvedMover = (movedBy || '').trim() || actor.name || fromTable.server || 'Staff';
          const resolvedRole = actor.role || 'Staff';
          const affectedTickets = (state.tickets || []).filter(tk => tk.tableId === fromTableId);
          const itemsFromTickets = affectedTickets.reduce(
            (sum, tk) => sum + (tk.items || []).reduce((s, it) => s + Number(it.qty || 1), 0),
            0
          );
          const itemsFromOrders = (fromTable.orders || []).reduce((s, it) => s + Number(it.qty || 1), 0);
          const itemsCount = Math.max(itemsFromTickets, itemsFromOrders);
          const ticketBillSum = affectedTickets.reduce(
            (sum, tk) => sum + (tk.items || []).reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0),
            0
          );
          const effectiveBillTotal = Math.max(Number(fromTable.billTotal || 0), ticketBillSum);
          const fromFloor = getTableFloor(fromTable);
          const toFloor = getTableFloor(toTable);

          const updatedTables = state.tables.map(t => {
            if (t.id === toTableId) {
              return {
                ...t,
                status: fromTable.status,
                billTotal: effectiveBillTotal,
                orders: fromTable.orders ? [...fromTable.orders] : [],
                server: fromTable.server,
                serverId: fromTable.serverId,
                isPaid: fromTable.isPaid,
                lastInvoiceId: fromTable.lastInvoiceId,
                occupiedSince: fromTable.occupiedSince || now,
                reservationId: fromTable.reservationId,
                waiterPaymentCollection: fromTable.waiterPaymentCollection,
                lastMoveNote: cleanNote || undefined,
                lastMovedFrom: fromTable.name,
                lastMovedAt: now,
                lastMovedBy: resolvedMover,
              };
            }
            if (t.id === fromTableId) {
              return {
                ...t,
                status: 'available' as const,
                billTotal: 0,
                orders: [],
                server: undefined,
                serverId: undefined,
                isPaid: false,
                lastInvoiceId: undefined,
                occupiedSince: undefined,
                reservationId: undefined,
                waiterPaymentCollection: null,
                lastMoveNote: undefined,
                lastMovedFrom: undefined,
                lastMovedAt: undefined,
                lastMovedBy: undefined,
              };
            }
            if (t.mergedInto === fromTableId) {
              return {
                ...t,
                mergedInto: toTableId,
              };
            }
            return t;
          });

          const moveBannerNote = cleanNote
            ? `[Moved from ${fromTable.name}: ${cleanNote}]`
            : `[Moved from ${fromTable.name}]`;

          const updatedTickets = state.tickets.map(tk => {
            if (tk.tableId === fromTableId) {
              const prevNotes = (tk.notes || '').trim();
              return {
                ...tk,
                tableId: toTableId,
                tableName: `${toTable.name} (from ${fromTable.name})`,
                notes: prevNotes ? `${prevNotes} • ${moveBannerNote}` : moveBannerNote,
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

          const moveLogId = `tmove_${now}_${Math.random().toString(36).substring(2, 6)}`;
          const moveLog: TableMoveLog = {
            id: moveLogId,
            fromTableId,
            fromTableName: fromTable.name,
            fromFloor,
            toTableId,
            toTableName: toTable.name,
            toFloor,
            note: cleanNote || 'Table shifted',
            movedBy: resolvedMover,
            movedByRole: resolvedRole,
            server: fromTable.server,
            activeTicketsCount: affectedTickets.length,
            ticketIds: affectedTickets.map(tk => tk.id),
            itemsCount,
            billTotal: effectiveBillTotal,
            timestamp: now,
          };

          const moveAlert: TableMoveAlert = {
            id: `alert_${moveLogId}`,
            logId: moveLogId,
            fromTableId,
            fromTableName: fromTable.name,
            fromFloor,
            toTableId,
            toTableName: toTable.name,
            toFloor,
            note: cleanNote || 'Table shifted',
            movedBy: resolvedMover,
            movedByRole: resolvedRole,
            activeTicketsCount: affectedTickets.length,
            itemsCount,
            billTotal: effectiveBillTotal,
            time: now,
          };

          return {
            tables: updatedTables,
            tickets: updatedTickets,
            lastBillPaidAlert: updatedAlert,
            tableMoveLogs: [moveLog, ...(state.tableMoveLogs || [])].slice(0, 1500),
            lastTableMoveAlert: moveAlert,
          };
        });
        notifySync();
      },

      mergeTables: (primaryTableId, secondaryTableId) => {
        set((state) => {
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
                serverId: undefined,
                isPaid: false,
                lastInvoiceId: undefined,
                occupiedSince: undefined,
                mergedInto: undefined,
                reservationId: undefined,
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
        });
        notifySync();
      },

      assignTableServer: (tableId, serverName) => {
        set((state) => ({
          tables: state.tables.map(t => t.id === tableId ? { ...t, server: serverName } : t)
        }));
        notifySync();
      },

      addReservation: (res) => {
        set((state) => {
          const now = Date.now();
          const newId = `res-${now}-${Math.random().toString(36).slice(2, 6)}`;
          const linked = (res.linkedTableIds || []).filter(id => id !== res.tableId);
          const primaryTable = state.tables.find(t => t.id === res.tableId);
          const inferredFloor = res.floor || (primaryTable ? getTableFloor(primaryTable) : undefined);
          const newReservation: Reservation = {
            ...res,
            floor: inferredFloor,
            bookingType: res.bookingType || (res.guestsCount >= 10 || linked.length > 0 ? 'group_event' : 'regular'),
            linkedTableIds: linked,
            id: newId,
            status: res.status || 'confirmed',
            createdAt: now,
            updatedAt: now,
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
            reservations: [newReservation, ...(state.reservations || [])],
            tables: updatedTables
          };
        });
        notifySync();
      },

      updateReservation: (id, updates) => {
        set((state) => {
          const targetRes = (state.reservations || []).find(r => r.id === id);
          if (!targetRes) return state;

          const now = Date.now();
          const updatedRes: Reservation = { ...targetRes, ...updates, updatedAt: now };
          updatedRes.linkedTableIds = (updatedRes.linkedTableIds || []).filter(tid => tid !== updatedRes.tableId);

          const prevAllIds = [targetRes.tableId, ...(targetRes.linkedTableIds || [])];
          const tablesChanged = updates.tableId !== undefined || updates.linkedTableIds !== undefined;
          let updatedTables = state.tables;
          if (tablesChanged && targetRes.status === 'confirmed') {
            // Release all previously held tables for this reservation, then reserve the new set
            updatedTables = updatedTables.map(t => {
              if ((t.reservationId === id || prevAllIds.includes(t.id)) && t.status === 'reserved') {
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
            reservations: (state.reservations || []).map(r => r.id === id ? updatedRes : r),
            tables: updatedTables
          };
        });
        notifySync();
      },

      cancelReservation: (id) => {
        set((state) => {
          const targetRes = (state.reservations || []).find(r => r.id === id);
          if (!targetRes) return state;
          const allIds = [targetRes.tableId, ...(targetRes.linkedTableIds || [])];

          const updatedTables = state.tables.map(t => {
            if ((allIds.includes(t.id) || t.reservationId === id) && t.status === 'reserved') {
              return { ...t, status: 'available' as const, reservationId: undefined, mergedInto: undefined };
            }
            return t;
          });

          return {
            reservations: (state.reservations || []).map(r => r.id === id ? { ...r, status: 'cancelled' as const, updatedAt: Date.now() } : r),
            tables: updatedTables
          };
        });
        notifySync();
      },

      seatReservation: (reservationId) => {
        set((state) => {
          const targetRes = (state.reservations || []).find(r => r.id === reservationId);
          if (!targetRes) return state;
          const linked = targetRes.linkedTableIds || [];
          const now = Date.now();

          const updatedTables = state.tables.map(t => {
            if (t.id === targetRes.tableId) {
              // Keep reservationId so POS, Waiter, Floor Manager & Blueprint know this seated table belongs to the Group/Reservation
              return { ...t, status: 'occupied' as const, occupiedSince: now, reservationId: targetRes.id, mergedInto: undefined };
            }
            if (linked.includes(t.id)) {
              // Linked tables stay blocked as part of the primary table's party
              return { ...t, status: 'occupied' as const, occupiedSince: now, reservationId: targetRes.id, mergedInto: targetRes.tableId };
            }
            return t;
          });

          return {
            reservations: (state.reservations || []).map(r =>
              r.id === reservationId ? { ...r, status: 'seated' as const, seatedAt: now, updatedAt: now } : r
            ),
            tables: updatedTables
          };
        });
        notifySync();
      },

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

      onlineFeedbackUrl: 'https://sultanrestaurant092.netlify.app',

      setOnlineFeedbackUrl: (url) => {
        const clean = (url || '').trim().replace(/\/+$/, '');
        const lower = clean.toLowerCase();
        let validHost = false;
        try {
          if (lower.startsWith('http://') || lower.startsWith('https://')) {
            const host = (new URL(lower).hostname || '').toLowerCase();
            validHost =
              host.length > 0 &&
              !host.includes('sultan-resturant.web.app') &&
              !host.includes('sultanresturant092.netlify.app') &&
              !host.endsWith('.lhr.life');
          }
        } catch {
          validHost = false;
        }
        set({
          onlineFeedbackUrl: validHost ? clean : 'https://sultanrestaurant092.netlify.app'
        });
      },

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

      addTable: (table) => {
        set((state) => ({
          tables: [
            ...state.tables,
            {
              ...table,
              status: table.status || 'available',
              id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            },
          ],
        }));
        notifySync();
      },

      addTablesBulk: (newTables) => {
        if (!Array.isArray(newTables) || newTables.length === 0) return;
        const baseTs = Date.now();
        set((state) => {
          const existingKeys = new Set(
            (state.tables || []).map(
              (t) => `${String(t.floor || t.zone || '').trim().toLowerCase()}::${String(t.name || '').trim().toLowerCase()}`
            )
          );
          const uniqueToAdd = newTables.filter((table) => {
            const key = `${String(table.floor || table.zone || '').trim().toLowerCase()}::${String(table.name || '').trim().toLowerCase()}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          });
          if (uniqueToAdd.length === 0) return state;
          return {
            tables: [
              ...state.tables,
              ...uniqueToAdd.map((table, idx) => ({
                ...table,
                status: table.status || 'available',
                id: `t-${baseTs}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              })),
            ],
          };
        });
        notifySync();
      },

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

      deleteTable: (id) => {
        set((state) => ({
          tables: state.tables.filter(t => t.id !== id),
          deletedTableIds: Array.from(new Set([...(state.deletedTableIds || []), id])).slice(-500),
        }));
        notifySync();
      },

      addFloor: (floor) => {
        set((state) => {
          const now = Date.now();
          const newId = `fl-${now}-${Math.random().toString(36).slice(2, 5)}`;
          const newFloor: Floor = {
            ...floor,
            id: newId,
            order: (state.floors || []).length + 1,
            updatedAt: now,
          } as any;
          const currentFloors = Array.isArray(state.floors) ? state.floors : INITIAL_FLOORS;
          const updatedFloors = [...currentFloors, newFloor];
          const updatedZones = state.zones.includes(floor.name) ? state.zones : [...state.zones, floor.name];
          return {
            floors: updatedFloors,
            zones: updatedZones,
          };
        });
        notifySync();
      },

      updateFloor: (id, updates) => {
        set((state) => {
          const now = Date.now();
          const currentFloors = Array.isArray(state.floors) ? state.floors : INITIAL_FLOORS;
          const target = currentFloors.find((f) => f.id === id);
          if (!target) return state;

          const oldName = target.name;
          const newName = updates.name ? updates.name.trim() : oldName;
          const nameChanged = newName && newName.toLowerCase() !== oldName.toLowerCase();

          const updatedFloors = currentFloors.map((f) =>
            f.id === id ? ({ ...f, ...updates, name: newName, updatedAt: now } as any) : f
          );

          // Cascade floor name rename to tables, zones, reservations, and staff assignedZones
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

          const updatedReservations = nameChanged
            ? (state.reservations || []).map((r) =>
                r.floor && r.floor.toLowerCase() === oldName.toLowerCase() ? { ...r, floor: newName } : r
              )
            : state.reservations;

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
            reservations: updatedReservations,
            staff: updatedStaff,
          };
        });
        notifySync();
      },

      deleteFloor: (id, cascadeDeleteTables = false) => {
        set((state) => {
          const currentFloors = Array.isArray(state.floors) ? state.floors : INITIAL_FLOORS;
          const target = currentFloors.find((f) => f.id === id);
          if (!target) return state;

          const floorName = target.name.toLowerCase();
          const updatedFloors = currentFloors.filter((f) => f.id !== id);
          const updatedZones = state.zones.filter((z) => z.toLowerCase() !== floorName);

          const removedTableIds: string[] = [];
          const updatedTables = cascadeDeleteTables
            ? state.tables.filter((t) => {
              const tFloor = getTableFloor(t).toLowerCase();
              const rawFloor = (t.floor || t.zone || '').toLowerCase();
              if (tFloor === floorName || rawFloor === floorName) {
                removedTableIds.push(t.id);
                return false;
              }
              return true;
            })
            : state.tables;

          return {
            floors: updatedFloors,
            zones: updatedZones,
            tables: updatedTables,
            deletedFloorIds: Array.from(new Set([...(state.deletedFloorIds || []), id])).slice(-200),
            deletedTableIds: Array.from(new Set([...(state.deletedTableIds || []), ...removedTableIds])).slice(-500),
          };
        });
        notifySync();
      },

      addZone: (zoneName) => {
        set((state) => ({
          zones: [...state.zones, zoneName]
        }));
        notifySync();
      },

      deleteZone: (zoneName) => {
        set((state) => ({
          zones: state.zones.filter(z => z !== zoneName)
        }));
        notifySync();
      },

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

      terminateAllStaffSessions: (exceptSessionId, exceptDeviceId, reason) => {
        const now = Date.now();
        const reasonText = reason || 'Master Admin نے تمام صارفین کو لاگ آؤٹ کر دیا ہے';
        const currentSessions = get().activeStaffSessions || [];
        const newRevokedSessions = { ...(get().revokedSessions || {}) };
        const newRevokedDevices = { ...(get().revokedDeviceIds || {}) };
        const keptSessions: StaffSession[] = [];
        let kickedCount = 0;

        for (const sess of currentSessions) {
          if (!sess) continue;
          const isExempt = Boolean(
            (exceptSessionId && sess.sessionId === exceptSessionId) ||
            (!exceptSessionId && exceptDeviceId && sess.deviceId === exceptDeviceId)
          );
          if (isExempt) {
            keptSessions.push(sess);
            continue;
          }
          kickedCount++;
          newRevokedSessions[sess.sessionId] = {
            sessionId: sess.sessionId,
            deviceId: sess.deviceId,
            staffId: sess.staffId,
            staffName: sess.staffName,
            timestamp: now,
            reason: reasonText,
          };
          if (sess.deviceId) {
            newRevokedDevices[sess.deviceId] = {
              sessionId: sess.sessionId,
              staffId: sess.staffId,
              staffName: sess.staffName,
              timestamp: now,
              reason: reasonText,
            };
          }
        }

        set({
          activeStaffSessions: keptSessions,
          revokedSessions: newRevokedSessions,
          revokedDeviceIds: newRevokedDevices,
          forceLogoutAll: {
            timestamp: now,
            exceptSessionId: exceptSessionId || undefined,
            exceptDeviceId: exceptDeviceId || undefined,
            reason: reasonText,
          },
        });
        return kickedCount;
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
                  const mergedItems = (finalTicket.items || []).map((curItem, idx) => {
                    const localItem = local.items.find((li, lIdx) => li.id === curItem.id && (lIdx === idx || !local.items.some((x, xIdx) => xIdx !== lIdx && x.id === curItem.id))) || local.items.find((li) => li.id === curItem.id);
                    const remoteItem = rt.items.find((ri, rIdx) => ri.id === curItem.id && (rIdx === idx || !rt.items.some((x, xIdx) => xIdx !== rIdx && x.id === curItem.id))) || rt.items.find((ri) => ri.id === curItem.id);
                    const lRank = localItem?.itemStatus ? itemRank[localItem.itemStatus] ?? 0 : (localItem?.completed ? 2 : 0);
                    const rRank = remoteItem?.itemStatus ? itemRank[remoteItem.itemStatus] ?? 0 : (remoteItem?.completed ? 2 : 0);
                    if (lRank > rRank && localItem) {
                      return { ...curItem, station: localItem.station || curItem.station, itemStatus: localItem.itemStatus, completed: localItem.completed, readyAt: localItem.readyAt || curItem.readyAt, servedAt: localItem.servedAt || curItem.servedAt };
                    } else if (remoteItem) {
                      return { ...curItem, station: remoteItem.station || curItem.station, itemStatus: remoteItem.itemStatus, completed: remoteItem.completed, readyAt: remoteItem.readyAt || curItem.readyAt, servedAt: remoteItem.servedAt || curItem.servedAt };
                    }
                    return curItem;
                  });
                  finalTicket.items = mergedItems;
                }

                // Ensure station-level 'served' or 'ready' propagates to all items of that station
                if (Array.isArray(finalTicket.items)) {
                  finalTicket.items = finalTicket.items.map((it) => {
                    const st = (it.station || 'main') as 'main' | 'juice';
                    const stStatus = mergedStationStatuses[st];
                    if (stStatus === 'served') {
                      return { ...it, itemStatus: 'served' as const, completed: true };
                    }
                    if (stStatus === 'ready' && it.itemStatus !== 'served') {
                      return { ...it, itemStatus: 'ready' as const, completed: true, readyAt: it.readyAt || finalTicket.readyAt || Date.now() };
                    }
                    return it;
                  });
                }

                // Only evaluate active station statuses for stations that actually have items on this ticket
                const hasMainOnTicket = Array.isArray(finalTicket.items) && finalTicket.items.some((it) => (it.station || 'main') === 'main');
                const hasJuiceOnTicket = Array.isArray(finalTicket.items) && finalTicket.items.some((it) => it.station === 'juice');
                if (!hasMainOnTicket) delete mergedStationStatuses.main;
                if (!hasJuiceOnTicket) delete mergedStationStatuses.juice;
                finalTicket.stationStatuses = mergedStationStatuses;

                // If station statuses indicate served/ready, reflect on overall status
                const activeStVals = Object.values(mergedStationStatuses).filter(Boolean) as ('pending' | 'cooking' | 'ready' | 'served')[];
                if (activeStVals.length > 0) {
                  if (activeStVals.every((s) => s === 'served')) {
                    finalTicket.status = 'served';
                  } else if (activeStVals.every((s) => s === 'ready' || s === 'served')) {
                    finalTicket.status = 'ready';
                  } else if (activeStVals.some((s) => s === 'cooking' || s === 'ready' || s === 'served')) {
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

          const mergedDeletedTableIds = Array.from(
            new Set([...(state.deletedTableIds || []), ...((remoteState as any).deletedTableIds || [])])
          ).slice(-500);
          const deletedTableSet = new Set(mergedDeletedTableIds);
          const mergedDeletedFloorIds = Array.from(
            new Set([...(state.deletedFloorIds || []), ...((remoteState as any).deletedFloorIds || [])])
          ).slice(-200);
          const deletedFloorSet = new Set(mergedDeletedFloorIds);

          let rawTables = (state.tables || []).filter((t) => t && !deletedTableSet.has(t.id));
          if (Array.isArray(remoteState.tables)) {
            const localTableMap = new Map((state.tables || []).map((t) => [t.id, t]));
            const remoteCleaned = remoteState.tables
              .filter((rt) => rt && !deletedTableSet.has(rt.id))
              .map((rawRt) => {
                // A waiter collection older than the last settlement is stale — drop it
                const rt =
                  rawRt.waiterPaymentCollection && !isWaiterPaymentPending(rawRt)
                    ? { ...rawRt, waiterPaymentCollection: null }
                    : rawRt;
                const lt = localTableMap.get(rt.id);
                if (!lt) return rt;
                if (
                  lt.status === 'occupied' &&
                  rt.status === 'available' &&
                  (lt.occupiedSince || 0) > (rt.lastSettledAt || 0)
                ) {
                  return lt;
                }
                // Local settlement is newer than the server's occupied snapshot (push still in flight) — keep local
                if (
                  lt.status === 'available' &&
                  rt.status !== 'available' &&
                  (lt.lastSettledAt || 0) > 0 &&
                  (lt.lastSettledAt || 0) >= (rt.occupiedSince || 0) &&
                  (lt.lastSettledAt || 0) > (rt.lastSettledAt || 0)
                ) {
                  return lt;
                }
                return rt;
              });
            const remoteTableIdSet = new Set(remoteCleaned.map((rt) => rt.id));
            const localUnsyncedTables = (state.tables || []).filter(
              (lt) => lt && lt.id && !remoteTableIdSet.has(lt.id) && !deletedTableSet.has(lt.id)
            );
            rawTables = [...remoteCleaned, ...localUnsyncedTables];
          }
          const finalTickets = mergedTickets || state.tickets || [];
          const reconciledTables = reconcileTablesWithTickets(rawTables, finalTickets);

          return {
            ...state,
            tables: reconciledTables,
            deletedTableIds: mergedDeletedTableIds,
            deletedFloorIds: mergedDeletedFloorIds,
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
          ...(Array.isArray(remoteState.floors)
            ? {
                floors: (() => {
                  const fMap = new Map<string, Floor>();
                  for (const rf of remoteState.floors) {
                    if (rf && rf.id && !deletedFloorSet.has(rf.id)) fMap.set(rf.id, rf);
                  }
                  for (const lf of (state.floors || [])) {
                    if (lf && lf.id && !deletedFloorSet.has(lf.id)) {
                      const prev = fMap.get(lf.id);
                      // Prefer local floor edit when local updatedAt is newer or floor isn't on server yet
                      if (!prev || ((lf as any).updatedAt || 0) >= ((prev as any).updatedAt || 0)) {
                        fMap.set(lf.id, { ...(prev || {}), ...lf });
                      }
                    }
                  }
                  return Array.from(fMap.values());
                })(),
              }
            : {}),
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
                const merged: StaffMember = {
                  ...(base || {}),
                  ...rem,
                };
                if (base?.hasSystemAccess && (!rem.pin || rem.hasSystemAccess === false)) {
                  merged.hasSystemAccess = true;
                  merged.username = rem.username || base.username;
                  merged.pin = rem.pin || base.pin;
                }
                sMap.set(rem.id, merged);
              }
              return Array.from(sMap.values());
            })()
          } : {}),
          ...(remoteState.attendance ? { attendance: remoteState.attendance } : {}),
          ...(remoteState.salaryPayments ? { salaryPayments: remoteState.salaryPayments } : {}),
          ...(remoteState.customers ? { customers: remoteState.customers } : {}),
          ...(Array.isArray(remoteState.reservations) ? {
            reservations: (() => {
              const resMap = new Map<string, Reservation>();
              for (const localR of (state.reservations || [])) {
                if (localR && localR.id) resMap.set(localR.id, localR);
              }
              for (const remR of remoteState.reservations) {
                if (!remR || !remR.id) continue;
                const prev = resMap.get(remR.id);
                if (!prev || (remR.updatedAt || remR.createdAt || 0) >= (prev.updatedAt || prev.createdAt || 0)) {
                  resMap.set(remR.id, remR);
                }
              }
              return Array.from(resMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            })()
          } : {}),
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
          ...(remoteState.forceLogoutAll && typeof remoteState.forceLogoutAll === 'object' ? {
            forceLogoutAll:
              !state.forceLogoutAll || (remoteState.forceLogoutAll.timestamp || 0) >= (state.forceLogoutAll.timestamp || 0)
                ? remoteState.forceLogoutAll
                : state.forceLogoutAll,
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
          foodReadyAlerts: (() => {
            const combined = [
              ...(Array.isArray(remoteState.foodReadyAlerts) ? remoteState.foodReadyAlerts : []),
              ...(remoteState.lastFoodReadyAlert ? [remoteState.lastFoodReadyAlert] : []),
              ...(Array.isArray(state.foodReadyAlerts) ? state.foodReadyAlerts : []),
              ...(state.lastFoodReadyAlert ? [state.lastFoodReadyAlert] : []),
            ];
            const map = new Map<string, FoodReadyAlert>();
            const nowMs = Date.now();
            for (const a of combined) {
              if (!a || !a.id) continue;
              if (a.time && Math.abs(nowMs - a.time) > 30 * 60 * 1000) continue;
              if (!map.has(a.id)) map.set(a.id, a);
            }
            return Array.from(map.values())
              .sort((a, b) => (b.time || 0) - (a.time || 0))
              .slice(0, 25);
          })(),
          ...(Array.isArray(remoteState.tableMoveLogs) ? {
            tableMoveLogs: (() => {
              const mMap = new Map<string, TableMoveLog>();
              for (const l of (state.tableMoveLogs || [])) {
                if (l && l.id) mMap.set(l.id, l);
              }
              for (const r of remoteState.tableMoveLogs) {
                if (r && r.id) mMap.set(r.id, r);
              }
              return Array.from(mMap.values())
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 1500);
            })()
          } : {}),
          ...(Array.isArray(remoteState.cancelledOrderLogs) ? {
            cancelledOrderLogs: (() => {
              const allInvoices = remoteState.invoices || state.invoices || [];
              const isBogusSettlementCancel = (c: CancelledOrderLog | null | undefined) => {
                if (!c || c.reason !== 'Table released without billing') return false;
                const cTime = c.cancelledAt || 0;
                return allInvoices.some(
                  (inv: any) =>
                    inv &&
                    (inv.tableId === c.tableId || inv.tableName === c.tableName) &&
                    Math.abs((inv.timeSettled || inv.timePlaced || 0) - cTime) <= 15000
                );
              };
              const cMap = new Map<string, CancelledOrderLog>();
              for (const l of (state.cancelledOrderLogs || [])) {
                if (l && l.id && !isBogusSettlementCancel(l)) cMap.set(l.id, l);
              }
              for (const r of remoteState.cancelledOrderLogs) {
                if (r && r.id && !isBogusSettlementCancel(r)) cMap.set(r.id, r);
              }
              return Array.from(cMap.values())
                .sort((a, b) => (b.cancelledAt || 0) - (a.cancelledAt || 0))
                .slice(0, 1500);
            })()
          } : {}),
          ...(remoteState.lastTableMoveAlert !== undefined ? {
            lastTableMoveAlert: (() => {
              const inc = remoteState.lastTableMoveAlert;
              if (!inc) return null;
              if (inc.time && Math.abs(Date.now() - inc.time) > 20 * 60 * 1000) return null;
              const loc = state.lastTableMoveAlert;
              if (loc && (loc.time || 0) > (inc.time || 0)) return loc;
              return inc;
            })()
          } : {}),
          ...(remoteState.lastOrderCancelledAlert !== undefined ? {
            lastOrderCancelledAlert: (() => {
              const inc = remoteState.lastOrderCancelledAlert;
              if (!inc) return null;
              if (inc.time && Math.abs(Date.now() - inc.time) > 20 * 60 * 1000) return null;
              const allInvoices = remoteState.invoices || state.invoices || [];
              if (
                inc.reason === 'Table released without billing' &&
                allInvoices.some(
                  (inv: any) =>
                    inv &&
                    (inv.tableId === inc.tableId || inv.tableName === inc.tableName) &&
                    Math.abs((inv.timeSettled || inv.timePlaced || 0) - (inc.time || 0)) <= 15000
                )
              ) {
                return null;
              }
              const loc = state.lastOrderCancelledAlert;
              if (loc && (loc.time || 0) > (inc.time || 0)) return loc;
              return inc;
            })()
          } : {}),
        };
      });
      },
    }),
    {
      name: 'restaurant-storage',
      storage: appStorage,
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!Array.isArray(state.tableMoveLogs)) {
            state.tableMoveLogs = [];
          }
          if (!Array.isArray(state.cancelledOrderLogs)) {
            state.cancelledOrderLogs = [];
          } else {
            const allInvoices = state.invoices || [];
            state.cancelledOrderLogs = state.cancelledOrderLogs.filter((c) => {
              if (!c || c.reason !== 'Table released without billing') return true;
              return !allInvoices.some(
                (inv: any) =>
                  inv &&
                  (inv.tableId === c.tableId || inv.tableName === c.tableName) &&
                  Math.abs((inv.timeSettled || inv.timePlaced || 0) - (c.cancelledAt || 0)) <= 15000
              );
            });
          }
          if (
            state.lastOrderCancelledAlert &&
            state.lastOrderCancelledAlert.reason === 'Table released without billing' &&
            (state.invoices || []).some(
              (inv: any) =>
                inv &&
                (inv.tableId === state.lastOrderCancelledAlert?.tableId ||
                  inv.tableName === state.lastOrderCancelledAlert?.tableName) &&
                Math.abs((inv.timeSettled || inv.timePlaced || 0) - (state.lastOrderCancelledAlert?.time || 0)) <= 15000
            )
          ) {
            state.lastOrderCancelledAlert = null;
          }
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
          // Sanitize onlineFeedbackUrl on boot so dead hosts never leak into Sultan QR codes
          const isValidOnlineUrl = (candidate: string): boolean => {
            const c = candidate.trim().toLowerCase();
            if (!c || (!c.startsWith('http://') && !c.startsWith('https://'))) return false;
            if (
              c.includes('sultan-resturant.web.app') ||
              c.includes('sultanresturant092.netlify.app') ||
              c.includes('.lhr.life')
            ) {
              return false;
            }
            try {
              const host = (new URL(c).hostname || '').toLowerCase();
              return host.length > 0;
            } catch {
              return false;
            }
          };
          if (!isValidOnlineUrl(String(state.onlineFeedbackUrl || ''))) {
            state.onlineFeedbackUrl = 'https://sultanrestaurant092.netlify.app';
          }
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try {
              const storedUrl = window.localStorage.getItem('sultan_feedback_online_url') || '';
              if (storedUrl && !isValidOnlineUrl(storedUrl)) {
                window.localStorage.removeItem('sultan_feedback_online_url');
              }
            } catch {}
          }
          state.tables = reconcileTablesWithTickets(state.tables, state.tickets);
          if (!Array.isArray(state.floors)) {
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
          state.staffSeedVersion = 4;
          for (const existing of existingCleanStaff) {
            const base = staffMap.get(existing.id);
            const merged: StaffMember = {
              ...(base || {}),
              ...existing,
            };
            if (base?.hasSystemAccess && (!existing.pin || existing.hasSystemAccess === false)) {
              merged.hasSystemAccess = true;
              merged.username = existing.username || base.username;
              merged.pin = existing.pin || base.pin;
            }
            staffMap.set(existing.id, merged);
          }
          state.staff = Array.from(staffMap.values());

          // Normalize and assign true floor and seatingType to any table that has legacy or missing attributes
          state.tables = (state.tables || []).map(t => {
            const inferredFloor = getTableFloor(t);
            const inferredType = getTableSeatingType(t);
            const isLegacyZone = !t.floor || t.floor.toLowerCase().includes('main hall') || (t.zone && t.zone.toLowerCase().includes('main hall'));
            const normalizedName =
              typeof t.name === 'string' && /\bcouch\b/i.test(t.name)
                ? t.name.replace(/\bcouch\b/gi, 'Sofa')
                : t.name;
            return {
              ...t,
              name: normalizedName,
              floor: isLegacyZone ? inferredFloor : (t.floor || inferredFloor),
              zone: isLegacyZone ? inferredFloor : (t.zone || inferredFloor),
              seatingType: t.seatingType || inferredType,
              cabinNumber: (t.seatingType === 'majlis' || inferredType === 'majlis') ? (t.cabinNumber || normalizedName) : t.cabinNumber,
            };
          });
          if (Array.isArray(state.floors)) {
            state.floors = state.floors.map((fl) =>
              fl && typeof fl.description === 'string' && /\bcouches?\b/i.test(fl.description)
                ? { ...fl, description: fl.description.replace(/\bcouches\b/gi, 'Sofas').replace(/\bcouch\b/gi, 'Sofa') }
                : fl
            );
          }

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

