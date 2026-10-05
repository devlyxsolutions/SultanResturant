import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

export type RideCategory = 'jhoola' | 'arcade' | 'vr' | 'softplay' | 'pass' | 'service';

export interface PlaylandRideVariant {
  id: string;
  name: string; // e.g. "5 Mins", "10 Mins", "15 Mins", "1 Hour"
  durationMinutes?: number;
  price: number;
}

export interface PlaylandRide {
  id: string;
  name: string;
  category: RideCategory;
  price: number; // base price
  variants: PlaylandRideVariant[];
  icon: string;
  minAge?: string;
  duration?: string;
  capacity?: number;
  isActive: boolean;
  color?: string;
}

export interface PlaylandCartItem {
  cartItemId: string; // unique ID for ride + variant combo
  rideId: string;
  name: string;
  variantId: string;
  variantName: string;
  price: number;
  qty: number;
  category: RideCategory;
}

export interface PlaylandCustomer {
  id: string;
  childName: string;
  parentName?: string;
  parentPhone: string;
  totalVisits: number;
  lastVisited: number;
}

export interface PlaylandTicket {
  id: string;
  ticketCode: string;
  childName?: string;
  parentName?: string;
  parentPhone?: string;
  childAge?: string;
  wristbandColor?: string;
  notes?: string;
  items: PlaylandCartItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'online';
  issuedAt: number;
  issuedBy: string;
  status: 'active' | 'used' | 'expired' | 'refunded';
  redeemedRidesCount?: number;
}

interface PlaylandState {
  rides: PlaylandRide[];
  cart: PlaylandCartItem[];
  tickets: PlaylandTicket[];
  customers: PlaylandCustomer[];
  activeFilter: RideCategory | 'all';
  searchQuery: string;

  // Filter & Search
  setFilter: (category: RideCategory | 'all') => void;
  setSearchQuery: (query: string) => void;

  // Cart Actions
  addToCart: (ride: PlaylandRide, variant?: PlaylandRideVariant, quantity?: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQty: (cartItemId: string, delta: number) => void;
  clearCart: () => void;

  // Ticket / Billing Actions
  issueTicket: (params: {
    childName?: string;
    parentName?: string;
    parentPhone?: string;
    childAge?: string;
    wristbandColor?: string;
    notes?: string;
    paymentMethod: 'cash' | 'card' | 'online';
    issuedBy: string;
  }) => PlaylandTicket;
  refundTicket: (ticketId: string) => void;
  redeemTicket: (ticketIdOrCode: string) => { success: boolean; message: string };

  // Customer Management
  addOrUpdateCustomer: (data: { childName: string; parentName?: string; parentPhone: string }) => void;

  // Ride Management (Admin)
  toggleRideStatus: (rideId: string) => void;
  addNewRide: (ride: Omit<PlaylandRide, 'id'>) => PlaylandRide;
  updateRide: (rideId: string, updates: Partial<PlaylandRide>) => void;
  deleteRide: (rideId: string) => void;
}

export const INITIAL_RIDES: PlaylandRide[] = [
  {
    id: 'PL-R1',
    name: 'Sultan Royal Carousel',
    category: 'jhoola',
    price: 200,
    variants: [
      { id: 'v1-1', name: '5 Mins', durationMinutes: 5, price: 200 },
      { id: 'v1-2', name: '10 Mins', durationMinutes: 10, price: 350 },
      { id: 'v1-3', name: '15 Mins', durationMinutes: 15, price: 480 },
    ],
    icon: 'color-palette-outline',
    minAge: '2+ yrs',
    duration: '5 Mins',
    capacity: 16,
    isActive: true,
    color: '#D5A943',
  },
  {
    id: 'PL-R2',
    name: 'Mini Roller Coaster',
    category: 'jhoola',
    price: 300,
    variants: [
      { id: 'v2-1', name: '3 Mins (1 Round)', durationMinutes: 3, price: 300 },
      { id: 'v2-2', name: '6 Mins (2 Rounds)', durationMinutes: 6, price: 500 },
    ],
    icon: 'rocket-outline',
    minAge: '5+ yrs',
    duration: '3 Mins',
    capacity: 12,
    isActive: true,
    color: '#FF6B6B',
  },
  {
    id: 'PL-R3',
    name: 'Sultan Bumper Cars',
    category: 'jhoola',
    price: 250,
    variants: [
      { id: 'v3-1', name: '6 Mins', durationMinutes: 6, price: 250 },
      { id: 'v3-2', name: '12 Mins', durationMinutes: 12, price: 450 },
    ],
    icon: 'car-sport-outline',
    minAge: '4+ yrs',
    duration: '6 Mins',
    capacity: 10,
    isActive: true,
    color: '#4D96FF',
  },
  {
    id: 'PL-R4',
    name: 'Sultan Jungle Safari Train',
    category: 'jhoola',
    price: 180,
    variants: [
      { id: 'v4-1', name: '8 Mins', durationMinutes: 8, price: 180 },
      { id: 'v4-2', name: '15 Mins', durationMinutes: 15, price: 300 },
    ],
    icon: 'train-outline',
    minAge: 'All Ages',
    duration: '8 Mins',
    capacity: 20,
    isActive: true,
    color: '#6BCB77',
  },
  {
    id: 'PL-R5',
    name: 'Flying Chair Swings',
    category: 'jhoola',
    price: 220,
    variants: [
      { id: 'v5-1', name: '5 Mins', durationMinutes: 5, price: 220 },
      { id: 'v5-2', name: '10 Mins', durationMinutes: 10, price: 380 },
    ],
    icon: 'planet-outline',
    minAge: '6+ yrs',
    duration: '5 Mins',
    capacity: 14,
    isActive: true,
    color: '#FFD93D',
  },
  {
    id: 'PL-R6',
    name: 'Toddler Soft Play Kingdom',
    category: 'softplay',
    price: 350,
    variants: [
      { id: 'v6-1', name: '30 Mins', durationMinutes: 30, price: 350 },
      { id: 'v6-2', name: '60 Mins (1 Hour)', durationMinutes: 60, price: 600 },
      { id: 'v6-3', name: 'Unlimited Day', durationMinutes: 300, price: 1000 },
    ],
    icon: 'happy-outline',
    minAge: '1-6 yrs',
    duration: '30 Mins',
    capacity: 25,
    isActive: true,
    color: '#FF9F45',
  },
  {
    id: 'PL-R7',
    name: '9D Virtual Reality Cinema',
    category: 'vr',
    price: 350,
    variants: [
      { id: 'v7-1', name: '1 Ride (10 Mins)', durationMinutes: 10, price: 350 },
      { id: 'v7-2', name: '2 Rides (20 Mins)', durationMinutes: 20, price: 600 },
    ],
    icon: 'glasses-outline',
    minAge: '7+ yrs',
    duration: '10 Mins',
    capacity: 6,
    isActive: true,
    color: '#9B51E0',
  },
  {
    id: 'PL-R8',
    name: 'Arcade 10x Token Pack',
    category: 'arcade',
    price: 400,
    variants: [
      { id: 'v8-1', name: '10 Tokens', price: 400 },
      { id: 'v8-2', name: '25 Tokens', price: 900 },
      { id: 'v8-3', name: '50 Tokens', price: 1600 },
    ],
    icon: 'game-controller-outline',
    minAge: 'All Ages',
    duration: 'Tokens',
    capacity: 50,
    isActive: true,
    color: '#00C9A7',
  },
  {
    id: 'PL-R9',
    name: 'Sultan All-Access Super Pass',
    category: 'pass',
    price: 999,
    variants: [
      { id: 'v9-1', name: '2 Hours Pass', durationMinutes: 120, price: 999 },
      { id: 'v9-2', name: 'Full Day Unlimited', durationMinutes: 480, price: 1600 },
    ],
    icon: 'ribbon-outline',
    minAge: 'All Kids',
    duration: 'All Jhoolay',
    capacity: 99,
    isActive: true,
    color: '#E0A96D',
  },
  {
    id: 'PL-R10',
    name: 'Royal Family 4-Kid Combo',
    category: 'pass',
    price: 3200,
    variants: [
      { id: 'v10-1', name: '2 Hours (4 Kids)', durationMinutes: 120, price: 3200 },
      { id: 'v10-2', name: 'Full Day (4 Kids)', durationMinutes: 480, price: 5500 },
    ],
    icon: 'gift-outline',
    minAge: 'Family',
    duration: '4 Kids Combo',
    capacity: 99,
    isActive: true,
    color: '#D5A943',
  },
];

export const INITIAL_CUSTOMERS: PlaylandCustomer[] = [
  {
    id: 'cust-1',
    childName: 'Ayan Khan',
    parentName: 'Imran Khan',
    parentPhone: '0300-1234567',
    totalVisits: 3,
    lastVisited: Date.now() - 86400000,
  },
  {
    id: 'cust-2',
    childName: 'Zain & Fatima',
    parentName: 'Hamza Sheikh',
    parentPhone: '0321-9876543',
    totalVisits: 5,
    lastVisited: Date.now() - 172800000,
  },
];

export const usePlaylandStore = create<PlaylandState>()(
  persist(
    (set, get) => ({
      rides: INITIAL_RIDES,
      cart: [],
      tickets: [],
      customers: INITIAL_CUSTOMERS,
      activeFilter: 'all',
      searchQuery: '',

      setFilter: (category) => set({ activeFilter: category }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      addToCart: (ride, selectedVariant, quantity = 1) => {
        set((state) => {
          const variant = selectedVariant || (ride.variants && ride.variants.length > 0
            ? ride.variants[0]
            : { id: 'default', name: ride.duration || 'Standard', price: ride.price });

          const cartItemId = `${ride.id}_${variant.id}`;
          const existingIndex = state.cart.findIndex((c) => c.cartItemId === cartItemId);

          if (existingIndex >= 0) {
            const updated = [...state.cart];
            updated[existingIndex] = {
              ...updated[existingIndex],
              qty: updated[existingIndex].qty + quantity,
            };
            return { cart: updated };
          }

          const newItem: PlaylandCartItem = {
            cartItemId,
            rideId: ride.id,
            name: ride.name,
            variantId: variant.id,
            variantName: variant.name,
            price: variant.price,
            qty: quantity,
            category: ride.category,
          };

          return { cart: [...state.cart, newItem] };
        });
      },

      removeFromCart: (cartItemId) => {
        set((state) => ({
          cart: state.cart.filter((c) => c.cartItemId !== cartItemId),
        }));
      },

      updateQty: (cartItemId, delta) => {
        set((state) => {
          return {
            cart: state.cart
              .map((c) => {
                if (c.cartItemId === cartItemId) {
                  const newQty = c.qty + delta;
                  return newQty > 0 ? { ...c, qty: newQty } : null;
                }
                return c;
              })
              .filter(Boolean) as PlaylandCartItem[],
          };
        });
      },

      clearCart: () => set({ cart: [] }),

      addOrUpdateCustomer: ({ childName, parentName, parentPhone }) => {
        if (!parentPhone && !childName) return;
        set((state) => {
          const existing = state.customers.find(
            (c) => (parentPhone && c.parentPhone === parentPhone) || (childName && c.childName.toLowerCase() === childName.toLowerCase())
          );
          if (existing) {
            return {
              customers: state.customers.map((c) =>
                c.id === existing.id
                  ? {
                      ...c,
                      childName: childName || c.childName,
                      parentName: parentName || c.parentName,
                      parentPhone: parentPhone || c.parentPhone,
                      totalVisits: c.totalVisits + 1,
                      lastVisited: Date.now(),
                    }
                  : c
              ),
            };
          }
          const newCust: PlaylandCustomer = {
            id: `cust-${Date.now()}`,
            childName: childName || 'Guest Child',
            parentName: parentName || '',
            parentPhone: parentPhone || 'N/A',
            totalVisits: 1,
            lastVisited: Date.now(),
          };
          return { customers: [newCust, ...state.customers] };
        });
      },

      issueTicket: ({ childName, parentName, parentPhone, childAge, wristbandColor = 'Gold', notes, paymentMethod, issuedBy }) => {
        const state = get();
        const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
        const ticketNum = Math.floor(1000 + Math.random() * 9000);
        const ticketId = `PL-${Date.now().toString().slice(-4)}`;
        const ticketCode = `SLT-PL-${ticketNum}`;

        const newTicket: PlaylandTicket = {
          id: ticketId,
          ticketCode,
          childName: childName?.trim() || 'Young Sultan Guest',
          parentName: parentName?.trim() || '',
          parentPhone: parentPhone?.trim() || 'N/A',
          childAge: childAge?.trim() || undefined,
          wristbandColor,
          notes: notes?.trim() || undefined,
          items: [...state.cart],
          totalAmount: total,
          paymentMethod,
          issuedAt: Date.now(),
          issuedBy: issuedBy || 'Playland Cashier',
          status: 'active',
          redeemedRidesCount: 0,
        };

        // Auto save to customer CRM if phone or child name is given
        if (parentPhone && parentPhone !== 'N/A') {
          get().addOrUpdateCustomer({
            childName: childName?.trim() || 'Guest Child',
            parentName: parentName?.trim(),
            parentPhone: parentPhone.trim(),
          });
        }

        set({
          tickets: [newTicket, ...state.tickets],
          cart: [],
        });

        return newTicket;
      },

      refundTicket: (ticketId) => {
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === ticketId ? { ...t, status: 'refunded' } : t
          ),
        }));
      },

      redeemTicket: (ticketIdOrCode) => {
        const state = get();
        const clean = ticketIdOrCode.trim().toUpperCase();
        const ticket = state.tickets.find(
          (t) => t.id.toUpperCase() === clean || t.ticketCode.toUpperCase() === clean
        );

        if (!ticket) {
          return { success: false, message: 'Ticket not found. Please check ticket code.' };
        }

        if (ticket.status === 'used') {
          return { success: false, message: `Ticket ${ticket.ticketCode} already fully redeemed.` };
        }

        if (ticket.status === 'expired' || ticket.status === 'refunded') {
          return { success: false, message: `Ticket ${ticket.ticketCode} is ${ticket.status}.` };
        }

        const newRedeemed = (ticket.redeemedRidesCount || 0) + 1;
        const totalRidesCount = ticket.items.reduce((s, i) => s + i.qty, 0);
        const isFullyUsed = newRedeemed >= totalRidesCount;

        set({
          tickets: state.tickets.map((t) =>
            t.id === ticket.id
              ? {
                  ...t,
                  redeemedRidesCount: newRedeemed,
                  status: isFullyUsed ? 'used' : 'active',
                }
              : t
          ),
        });

        return {
          success: true,
          message: `Punched! Valid for ${ticket.childName} (${newRedeemed}/${totalRidesCount} rides used).`,
        };
      },

      toggleRideStatus: (rideId) => {
        set((state) => ({
          rides: state.rides.map((r) =>
            r.id === rideId ? { ...r, isActive: !r.isActive } : r
          ),
        }));
      },

      addNewRide: (rideData) => {
        const newId = `PL-R${Date.now().toString().slice(-4)}`;
        const newRide: PlaylandRide = {
          ...rideData,
          id: newId,
          variants: rideData.variants && rideData.variants.length > 0
            ? rideData.variants
            : [{ id: `v-${newId}-1`, name: rideData.duration || 'Standard', price: rideData.price }],
        };
        set((state) => ({
          rides: [newRide, ...state.rides],
        }));
        return newRide;
      },

      updateRide: (rideId, updates) => {
        set((state) => ({
          rides: state.rides.map((r) =>
            r.id === rideId ? { ...r, ...updates } : r
          ),
        }));
      },

      deleteRide: (rideId) => {
        set((state) => ({
          rides: state.rides.filter((r) => r.id !== rideId),
        }));
      },
    }),
    {
      name: 'sultan-playland-storage',
      storage: appStorage,
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.rides)) {
          state.rides = state.rides.map((r) => {
            if (!r.variants || r.variants.length === 0) {
              const matchedInitial = INITIAL_RIDES.find((init) => init.id === r.id);
              if (matchedInitial) {
                return { ...r, variants: matchedInitial.variants };
              }
              return {
                ...r,
                variants: [
                  { id: `v-${r.id}-1`, name: r.duration || 'Standard', price: r.price || 200 },
                ],
              };
            }
            return r;
          });
        }
      },
    }
  )
);
