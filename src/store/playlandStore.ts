import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from './storage';

export type RideCategory = 'jhoola' | 'arcade' | 'vr' | 'softplay' | 'pass';

export interface PlaylandRide {
  id: string;
  name: string;
  category: RideCategory;
  price: number;
  icon: string;
  minAge?: string;
  duration?: string;
  capacity?: number;
  isActive: boolean;
  color?: string;
}

export interface PlaylandCartItem {
  rideId: string;
  name: string;
  price: number;
  qty: number;
  category: RideCategory;
}

export interface PlaylandTicket {
  id: string;
  ticketCode: string;
  childName?: string;
  parentPhone?: string;
  items: PlaylandCartItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'online';
  issuedAt: number;
  issuedBy: string;
  status: 'active' | 'used' | 'expired' | 'refunded';
  wristbandColor?: string;
  redeemedRidesCount?: number;
}

interface PlaylandState {
  rides: PlaylandRide[];
  cart: PlaylandCartItem[];
  tickets: PlaylandTicket[];
  activeFilter: RideCategory | 'all';
  searchQuery: string;

  // Actions
  setFilter: (category: RideCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  addToCart: (ride: PlaylandRide) => void;
  removeFromCart: (rideId: string) => void;
  updateQty: (rideId: string, delta: number) => void;
  clearCart: () => void;
  issueTicket: (params: {
    childName?: string;
    parentPhone?: string;
    paymentMethod: 'cash' | 'card' | 'online';
    issuedBy: string;
    wristbandColor?: string;
  }) => PlaylandTicket;
  redeemTicket: (ticketIdOrCode: string) => { success: boolean; message: string };
  toggleRideStatus: (rideId: string) => void;
  addNewRide: (ride: Omit<PlaylandRide, 'id'>) => void;
}

export const INITIAL_RIDES: PlaylandRide[] = [
  {
    id: 'PL-R1',
    name: 'Sultan Royal Carousel',
    category: 'jhoola',
    price: 200,
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
    icon: 'game-controller-outline',
    minAge: 'All Ages',
    duration: '10 Tokens',
    capacity: 50,
    isActive: true,
    color: '#00C9A7',
  },
  {
    id: 'PL-R9',
    name: 'Sultan All-Access Super Pass',
    category: 'pass',
    price: 999,
    icon: 'ribbon-outline',
    minAge: 'All Kids',
    duration: 'All Jhoolay Unlimited',
    capacity: 99,
    isActive: true,
    color: '#E0A96D',
  },
  {
    id: 'PL-R10',
    name: 'Royal Family 4-Kid Combo',
    category: 'pass',
    price: 3200,
    icon: 'gift-outline',
    minAge: 'Family',
    duration: 'Full Day Pass (4 Kids)',
    capacity: 99,
    isActive: true,
    color: '#D5A943',
  },
];

export const usePlaylandStore = create<PlaylandState>()(
  persist(
    (set, get) => ({
      rides: INITIAL_RIDES,
      cart: [],
      tickets: [],
      activeFilter: 'all',
      searchQuery: '',

      setFilter: (category) => set({ activeFilter: category }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      addToCart: (ride) => {
        set((state) => {
          const existing = state.cart.find((c) => c.rideId === ride.id);
          if (existing) {
            return {
              cart: state.cart.map((c) =>
                c.rideId === ride.id ? { ...c, qty: c.qty + 1 } : c
              ),
            };
          }
          return {
            cart: [
              ...state.cart,
              {
                rideId: ride.id,
                name: ride.name,
                price: ride.price,
                qty: 1,
                category: ride.category,
              },
            ],
          };
        });
      },

      removeFromCart: (rideId) => {
        set((state) => ({
          cart: state.cart.filter((c) => c.rideId !== rideId),
        }));
      },

      updateQty: (rideId, delta) => {
        set((state) => {
          return {
            cart: state.cart
              .map((c) => {
                if (c.rideId === rideId) {
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

      issueTicket: ({ childName, parentPhone, paymentMethod, issuedBy, wristbandColor = 'Gold' }) => {
        const state = get();
        const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
        const ticketNum = Math.floor(1000 + Math.random() * 9000);
        const ticketId = `PL-${Date.now().toString().slice(-4)}`;
        const ticketCode = `SLT-PL-${ticketNum}`;

        const newTicket: PlaylandTicket = {
          id: ticketId,
          ticketCode,
          childName: childName?.trim() || 'Young Sultan Guest',
          parentPhone: parentPhone?.trim() || 'N/A',
          items: [...state.cart],
          totalAmount: total,
          paymentMethod,
          issuedAt: Date.now(),
          issuedBy: issuedBy || 'Playland Cashier',
          status: 'active',
          wristbandColor,
          redeemedRidesCount: 0,
        };

        set({
          tickets: [newTicket, ...state.tickets],
          cart: [],
        });

        return newTicket;
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
        const newRide: PlaylandRide = {
          ...rideData,
          id: `PL-R${Date.now().toString().slice(-4)}`,
        };
        set((state) => ({
          rides: [...state.rides, newRide],
        }));
      },
    }),
    {
      name: 'sultan-playland-storage',
      storage: appStorage,
    }
  )
);
