import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

export type Table = {
  id: string;
  name: string;
  zone: string;
  seats: number;
  status: 'available' | 'occupied' | 'billed' | 'reserved';
  server?: string;
  billTotal?: number;
};

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
  completed: boolean;
};

export type Ticket = {
  id: string;
  tableId: string;
  tableName: string;
  server: string;
  timePlaced: number;
  status: 'cooking' | 'ready' | 'served';
  items: OrderItem[];
  isAddOn?: boolean;
  roundNumber?: number;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address?: string;
  totalOrders: number;
  totalSpent: number;
};

export type Payment = {
  type: 'cash' | 'card' | 'online';
  amount: number;
};

export type Invoice = {
  id: string;
  orderType: 'dine-in' | 'takeaway' | 'delivery';
  tableId?: string;
  tableName?: string;
  customer?: Customer;
  server: string;
  timePlaced: number;
  timeSettled: number;
  items: OrderItem[];
  subTotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: Payment[];
};

export type StaffRole = 'Admin' | 'Manager' | 'Waiter' | 'Kitchen';
export type StaffShift = 'Morning' | 'Evening' | 'Night';
export type StaffStatus = 'Active' | 'On Leave' | 'Inactive';

export type StaffMember = {
  id: string;
  name: string;
  phone: string;
  role: StaffRole;
  pin: string;
  status: StaffStatus;
  shift: StaffShift;
  joinedDate?: string;
};

type RestaurantState = {
  tables: Table[];
  tickets: Ticket[];
  invoices: Invoice[];
  customers: Customer[];
  staff: StaffMember[];
  menuItems: MenuItem[];
  categories: string[];
  zones: string[];
  
  // Actions
  placeOrder: (tableId: string, serverName: string, items: {item: MenuItem, qty: number, notes?: string}[], isAddOn?: boolean) => void;
  toggleTicketItem: (ticketId: string, itemId: string) => void;
  bumpTicket: (ticketId: string) => void;
  updateTicketStatus: (ticketId: string, status: Ticket['status']) => void;
  settleBill: (tableId: string) => void;
  addMenuItem: (item: Omit<MenuItem, 'id'>) => void;
  updateMenuItem: (id: string, item: Partial<Omit<MenuItem, 'id'>>) => void;
  deleteMenuItem: (id: string) => void;
  addCategory: (categoryName: string) => void;
  deleteCategory: (categoryName: string) => void;
  addTable: (table: Omit<Table, 'id' | 'status'> & { status?: Table['status'] }) => void;
  updateTable: (id: string, table: Partial<Omit<Table, 'id'>>) => void;
  deleteTable: (id: string) => void;
  addZone: (zoneName: string) => void;
  deleteZone: (zoneName: string) => void;
  saveInvoice: (invoice: Invoice) => void;
  addCustomer: (customer: Omit<Customer, 'id' | 'totalOrders' | 'totalSpent'>) => void;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addStaff: (staff: Omit<StaffMember, 'id'>) => void;
  updateStaff: (id: string, staff: Partial<Omit<StaffMember, 'id'>>) => void;
  deleteStaff: (id: string) => void;
  syncFromServer: (remoteState: Partial<RestaurantState>) => void;
};

// Initial Mock Data
const INITIAL_TABLES: Table[] = [
  { id: '1', zone: 'Main Hall', name: 'T-01', seats: 4, status: 'available' },
  { id: '2', zone: 'Main Hall', name: 'T-02', seats: 2, status: 'occupied', billTotal: 45.00, server: 'Junaid' },
  { id: '3', zone: 'Main Hall', name: 'T-03', seats: 4, status: 'available' },
  { id: '4', zone: 'Rooftop', name: 'R-01', seats: 4, status: 'available' },
  { id: '5', zone: 'VIP', name: 'V-01', seats: 8, status: 'reserved' },
];

const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'Zubair Tariq', phone: '03009876543', address: 'DHA Phase 5, Lahore', totalOrders: 14, totalSpent: 38400 },
  { id: 'c2', name: 'Fatima Noor', phone: '03214567890', address: 'Gulberg III, Lahore', totalOrders: 6, totalSpent: 16200 },
  { id: 'c3', name: 'Bilal Siddiqui', phone: '03331122334', address: 'Model Town, Block C', totalOrders: 3, totalSpent: 7500 },
];

const INITIAL_MENU: MenuItem[] = [
  { id: 'm1', name: 'Sultan Kebab', price: 1450, category: 'Mains' },
  { id: 'm2', name: 'Chicken Karahi', price: 1850, category: 'Mains' },
  { id: 'm3', name: 'Hummus & Pita', price: 650, category: 'Appetizers' },
  { id: 'm4', name: 'Kunafa', price: 850, category: 'Desserts' },
  { id: 'm5', name: 'Mint Margarita', price: 450, category: 'Drinks' },
];

const INITIAL_STAFF: StaffMember[] = [
  { id: 'st1', name: 'Junaid Ahsan', phone: '+92 300 1234567', role: 'Admin', pin: '1122', status: 'Active', shift: 'Morning', joinedDate: '2025-01-15' },
  { id: 'st2', name: 'Ali Khan', phone: '+92 301 7654321', role: 'Manager', pin: '2233', status: 'Active', shift: 'Morning', joinedDate: '2025-02-01' },
  { id: 'st3', name: 'Chef Omar', phone: '+92 302 9876543', role: 'Kitchen', pin: '3344', status: 'Active', shift: 'Evening', joinedDate: '2025-03-10' },
  { id: 'st4', name: 'Sara Ahmed', phone: '+92 303 5556677', role: 'Waiter', pin: '4455', status: 'Active', shift: 'Evening', joinedDate: '2025-04-05' },
  { id: 'st5', name: 'Hamza Malik', phone: '+92 304 4443322', role: 'Waiter', pin: '5566', status: 'On Leave', shift: 'Night', joinedDate: '2025-05-12' },
];

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set) => ({
      tables: INITIAL_TABLES,
      invoices: [],
      customers: INITIAL_CUSTOMERS,
      staff: INITIAL_STAFF,
      tickets: [
        {
          id: 'KOT-1042',
          tableId: '2',
          tableName: 'T-02',
          server: 'Junaid',
          timePlaced: Date.now() - 12 * 60000,
          status: 'cooking',
          items: [
            { id: 'm1', name: 'Sultan Kebab', price: 15.99, qty: 2, completed: false },
          ]
        }
      ],
      menuItems: INITIAL_MENU,
      categories: ['Appetizers', 'Mains', 'Desserts', 'Drinks'],
      zones: ['Main Hall', 'Rooftop', 'VIP'],

      placeOrder: (tableId, serverName, orderItems, isAddOn) => set((state) => {
        const table = state.tables.find(t => t.id === tableId);
        const existingTickets = state.tickets.filter(t => t.tableId === tableId);
        const isActuallyAddOn = isAddOn !== undefined ? isAddOn : existingTickets.length > 0;
        const roundNumber = existingTickets.length + 1;
        
        const newTicketId = `KOT-${Math.floor(Math.random() * 9000) + 1000}`;
        const itemsTotal = orderItems.reduce((sum, i) => sum + (i.item.price * i.qty), 0);

        const newTicket: Ticket = {
          id: newTicketId,
          tableId, // can be dummy like 'takeaway' or actual tableId
          tableName: table ? (isActuallyAddOn ? `${table.name} (Add-on #${roundNumber})` : table.name) : (tableId === 'delivery' ? 'Delivery' : 'Takeaway'),
          server: serverName,
          timePlaced: Date.now(),
          status: 'cooking',
          isAddOn: isActuallyAddOn,
          roundNumber: isActuallyAddOn ? roundNumber : 1,
          items: orderItems.map(oi => ({
            id: oi.item.id,
            name: oi.item.name,
            price: oi.item.price,
            qty: oi.qty,
            notes: oi.notes,
            completed: false
          }))
        };

        return {
          tickets: [...state.tickets, newTicket],
          tables: table 
            ? state.tables.map(t => 
                t.id === tableId ? { 
                  ...t, 
                  status: 'occupied', 
                  server: serverName,
                  billTotal: (t.billTotal || 0) + itemsTotal 
                } : t
              )
            : state.tables
        };
      }),

      toggleTicketItem: (ticketId, itemId) => set((state) => ({
        tickets: state.tickets.map(t => {
          if (t.id === ticketId) {
            return {
              ...t,
              items: t.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i)
            };
          }
          return t;
        })
      })),

      bumpTicket: (ticketId) => set((state) => {
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return state;

        return {
          tickets: state.tickets.filter(t => t.id !== ticketId),
        };
      }),

      updateTicketStatus: (ticketId, status) => set((state) => ({
        tickets: state.tickets.map(t => t.id === ticketId ? { ...t, status } : t)
      })),

      settleBill: (tableId) => set((state) => ({
        tables: state.tables.map(t => 
          t.id === tableId ? { ...t, status: 'available', billTotal: 0, server: undefined } : t
        ),
        tickets: state.tickets.filter(t => t.tableId !== tableId)
      })),
      
      saveInvoice: (invoice) => set((state) => ({
        invoices: [invoice, ...state.invoices]
      })),

      addCustomer: (customer) => set((state) => ({
        customers: [...state.customers, { ...customer, id: `c${Date.now()}`, totalOrders: 0, totalSpent: 0 }]
      })),

      updateCustomer: (id, customer) => set((state) => ({
        customers: state.customers.map(c => c.id === id ? { ...c, ...customer } : c)
      })),

      deleteCustomer: (id) => set((state) => ({
        customers: state.customers.filter(c => c.id !== id)
      })),

      addMenuItem: (item) => set((state) => ({
        menuItems: [...state.menuItems, { ...item, id: `m${Date.now()}` }]
      })),
      
      updateMenuItem: (id, item) => set((state) => ({
        menuItems: state.menuItems.map(m => m.id === id ? { ...m, ...item } : m)
      })),

      deleteMenuItem: (id) => set((state) => ({
        menuItems: state.menuItems.filter(m => m.id !== id)
      })),

      addCategory: (categoryName) => set((state) => ({
        categories: [...state.categories, categoryName]
      })),

      deleteCategory: (categoryName) => set((state) => ({
        categories: state.categories.filter(c => c !== categoryName)
      })),

      addTable: (table) => set((state) => ({
        tables: [...state.tables, { ...table, status: table.status || 'available', id: `t${Date.now()}` }]
      })),
      
      updateTable: (id, updatedTable) => set((state) => ({
        tables: state.tables.map(t => t.id === id ? { ...t, ...updatedTable } : t)
      })),

      deleteTable: (id) => set((state) => ({
        tables: state.tables.filter(t => t.id !== id)
      })),

      addZone: (zoneName) => set((state) => ({
        zones: [...state.zones, zoneName]
      })),
      
      deleteZone: (zoneName) => set((state) => ({
        zones: state.zones.filter(z => z !== zoneName)
      })),

      addStaff: (newStaff) => set((state) => ({
        staff: [...(state.staff || []), { ...newStaff, id: `st${Date.now()}` }]
      })),

      updateStaff: (id, staffUpdates) => set((state) => ({
        staff: (state.staff || []).map(s => s.id === id ? { ...s, ...staffUpdates } : s)
      })),

      deleteStaff: (id) => set((state) => ({
        staff: (state.staff || []).filter(s => s.id !== id)
      })),

      syncFromServer: (remoteState) => set((state) => ({
        ...state,
        ...(remoteState.tables ? { tables: remoteState.tables } : {}),
        ...(remoteState.tickets ? { tickets: remoteState.tickets } : {}),
        ...(remoteState.invoices ? { invoices: remoteState.invoices } : {}),
        ...(remoteState.menuItems ? { menuItems: remoteState.menuItems } : {}),
        ...(remoteState.categories ? { categories: remoteState.categories } : {}),
        ...(remoteState.zones ? { zones: remoteState.zones } : {}),
        ...(remoteState.staff ? { staff: remoteState.staff } : {}),
        ...(remoteState.customers ? { customers: remoteState.customers } : {}),
      })),
    }),
    {
      name: 'restaurant-storage',
      storage: appStorage,
    }
  )
);

// Safe, debounced real-time cross-tab synchronization (no infinite loops)
if (typeof window !== 'undefined') {
  const TAB_ID = 'tab_' + Math.random().toString(36).substring(2, 9);
  let channel: BroadcastChannel | null = null;
  let isSyncing = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('sultan_restaurant_bus');
      channel.onmessage = (event) => {
        // Ignore messages from this tab or unknown messages
        if (!event.data || event.data.senderId === TAB_ID) return;

        if (event.data.type === 'SYNC_STORE') {
          if (isSyncing) return;
          isSyncing = true;

          // Rehydrate safely without triggering an echo broadcast
          Promise.resolve(useRestaurantStore.persist.rehydrate()).finally(() => {
            setTimeout(() => {
              isSyncing = false;
            }, 600);
          });
        }
      };
    }
  } catch (e) {
    // BroadcastChannel not supported in this environment
  }

  // Broadcast local mutations to other open tabs with a safe 800ms debounce
  useRestaurantStore.subscribe(() => {
    // If the mutation was caused by an incoming remote rehydrate, do NOT echo back!
    if (isSyncing) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (isSyncing) return;
      try {
        if (channel) {
          channel.postMessage({ type: 'SYNC_STORE', senderId: TAB_ID });
        }
      } catch (e) {}
    }, 800);
  });
}

