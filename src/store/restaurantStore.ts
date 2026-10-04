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
  orders?: OrderItem[];
  isPaid?: boolean;
  lastInvoiceId?: string;
  occupiedSince?: number;
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

export type MenuVariant = {
  name: string;
  price: number;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  variants?: MenuVariant[];
  station?: 'main' | 'juice';
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

export type StaffRole = 'Admin' | 'Manager' | 'Waiter' | 'Kitchen' | 'JuiceBar';
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

type RestaurantState = {
  tables: Table[];
  tickets: Ticket[];
  invoices: Invoice[];
  customers: Customer[];
  staff: StaffMember[];
  menuItems: MenuItem[];
  categories: string[];
  zones: string[];
  reservations: Reservation[];
  lastBillPaidAlert?: { tableId: string; tableName: string; billTotal: number; time: number } | null;
  
  // Actions
  placeOrder: (tableId: string, serverName: string, items: {item: MenuItem, qty: number, notes?: string}[], isAddOn?: boolean) => void;
  toggleTicketItem: (ticketId: string, itemId: string) => void;
  bumpTicket: (ticketId: string) => void;
  updateTicketStatus: (ticketId: string, status: Ticket['status']) => void;
  markTableBilled: (tableId: string, invoiceId?: string) => void;
  clearBillPaidAlert: () => void;
  settleBill: (tableId: string) => void;
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
  { id: '5', zone: 'VIP', name: 'V-01', seats: 8, status: 'reserved', reservationId: 'res-1' },
];

const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: 'res-1',
    tableId: '5',
    tableName: 'V-01',
    customerName: 'Hamza Malik',
    phone: '03219988776',
    guestsCount: 6,
    reservationDate: new Date().toISOString().split('T')[0],
    timeSlot: '08:30 PM',
    status: 'confirmed',
    notes: 'Birthday celebration, requested quiet corner',
    createdAt: Date.now() - 3600000,
  }
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
  { 
    id: 'm6', 
    name: 'Fajita Pizza', 
    price: 1200, 
    category: 'Mains',
    variants: [
      { name: 'Small (7")', price: 850 },
      { name: 'Medium (10")', price: 1400 },
      { name: 'Large (13")', price: 1950 },
      { name: 'Family (16")', price: 2500 }
    ]
  },
  {
    id: 'm7',
    name: 'Mutton Ribs',
    price: 3500,
    category: 'Mains',
    variants: [
      { name: 'Half KG', price: 3500 },
      { name: '1 KG', price: 6800 }
    ]
  }
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
      reservations: INITIAL_RESERVATIONS,
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
            completed: false,
            station: oi.item.station || 'main'
          }))
        };

        return {
          tickets: [...state.tickets, newTicket],
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
                      completed: false
                    });
                  }
                });
                return {
                  ...t,
                  status: 'occupied',
                  server: serverName,
                  billTotal: (t.billTotal || 0) + itemsTotal,
                  orders: mergedOrders
                };
              })
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
          tickets: state.tickets.map(t => t.id === ticketId ? { ...t, status: 'served' } : t),
        };
      }),

      updateTicketStatus: (ticketId, status) => set((state) => ({
        tickets: state.tickets.map(t => t.id === ticketId ? { ...t, status } : t)
      })),

      markTableBilled: (tableId, invoiceId) => set((state) => {
        const table = state.tables.find(t => t.id === tableId);
        const amount = table?.billTotal || 0;
        const tableName = table ? table.name : `Table ${tableId}`;

        return {
          tables: state.tables.map(t => 
            t.id === tableId ? { 
              ...t, 
              status: 'billed', 
              isPaid: true, 
              lastInvoiceId: invoiceId 
            } : t
          ),
          lastBillPaidAlert: {
            tableId,
            tableName,
            billTotal: amount,
            time: Date.now()
          }
        };
      }),

      clearBillPaidAlert: () => set({ lastBillPaidAlert: null }),

      settleBill: (tableId) => set((state) => ({
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
            mergedInto: undefined,
            reservationId: undefined,
          } : t
        ),
        tickets: state.tickets.filter(t => t.tableId !== tableId),
        lastBillPaidAlert: state.lastBillPaidAlert?.tableId === tableId ? null : state.lastBillPaidAlert
      })),

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

      syncFromServer: (remoteState) => set((state) => {
        let mergedTickets = remoteState.tickets;
        if (remoteState.tickets && state.tickets) {
          mergedTickets = remoteState.tickets.map(rt => {
            const local = state.tickets.find(lt => lt.id === rt.id);
            // If local already marked this ticket as served, don't let a stale remote packet revert it to cooking or ready!
            if (local && local.status === 'served' && rt.status !== 'served') {
              return local;
            }
            return rt;
          });
        }

        return {
          ...state,
          ...(remoteState.tables ? { tables: remoteState.tables } : {}),
          ...(mergedTickets ? { tickets: mergedTickets } : {}),
          ...(remoteState.invoices ? { invoices: remoteState.invoices } : {}),
          ...(remoteState.menuItems ? { menuItems: remoteState.menuItems } : {}),
          ...(remoteState.categories ? { categories: remoteState.categories } : {}),
          ...(remoteState.zones ? { zones: remoteState.zones } : {}),
          ...(remoteState.staff ? { staff: remoteState.staff } : {}),
          ...(remoteState.customers ? { customers: remoteState.customers } : {}),
          ...(remoteState.reservations ? { reservations: remoteState.reservations } : {}),
          ...(remoteState.lastBillPaidAlert !== undefined ? { lastBillPaidAlert: remoteState.lastBillPaidAlert } : {}),
        };
      }),
    }),
    {
      name: 'restaurant-storage',
      storage: appStorage,
    }
  )
);

